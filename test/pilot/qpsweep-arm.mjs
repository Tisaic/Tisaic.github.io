/**
 * @file STEP 6 REPLACEMENT EXPERIMENT, SECOND PLANT — the 2R arm, one commissioned model,
 *       re-deployed at a ladder of QP iteration budgets. Scores the MACHINE.
 *
 * The EMPS half of this (`qpsweep.mjs`) is a single-channel servo axis whose Hessian is one
 * plant's spectrum. Rule 18: a budget that holds on one plant is a property of that plant.
 * This is a two-channel coupled plant with backlash, and the deployed number here is the
 * project's flagship, so it is the one that decides whether the iteration count is a knob.
 *
 * Run: node test/pilot/qpsweep-arm.mjs   [ITERS=1,2,4,...]
 */
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { roundedRect, circle } from '../../lib/flexisim/toolpath.js';
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';
import { Pilot } from '../../lib/pilot/pilot.js';

const ITERS = (process.env.ITERS || '1,2,4,8,16,32,60,120,240').split(',').map(Number);
const H = 4, CLAMP = 3, NU = 0.3, RHO = 1, G = 2e-6, RATIO = 100, DAMPING = 3e-3;
const PG = { LEN1: 14, LEN2: 10, E: 0.15, centre: [12, 0], drive: 32 };

async function makeArm() {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E: PG.E,
    nu: NU, rho: RHO, damping: DAMPING });
  const l1 = await mk(PG.LEN1), l2 = await mk(PG.LEN2);
  const j = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: 16, backlash: 1e-4,
    damping: 2 * Math.sqrt(16 * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: j(massProperties(l1)), link1: l1,
    joint2: j(massProperties(l2)), link2: l2, gravityWorld: [0, -G, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: PG.drive * hold, speedMax: 0.2 });
  return { arm, servo };
}
const mkPath = (shape, feed) => {
  const o = { feed, accel: 4e-5, cornerDt: 40, centre: PG.centre };
  return shape === 'circle' ? circle({ ...o, r: 4 })
    : roundedRect({ ...o, w: 8, h: 8, r: 1.5, closed: true });
};
function homeArm(arm, servo, path) {
  const c0 = path.at(0);
  const [q1, q2] = arm.ik(c0.x, c0.y, true);
  arm.setPose(q1, q2);
  const refs = [{ theta: q1, omega: 0, alpha: 0 }, { theta: q2, omega: 0, alpha: 0 }];
  for (let i = 0; i < 4000; i++) { const t = servo.torques(refs); arm.step(t[0], t[1], 1); }
  servo.resetLimitStats();
}

// ------------------------------------------------------------- commission ONCE
const { arm, servo } = await makeArm();
const startPath = mkPath('rounded', 0.004);
homeArm(arm, servo, startPath);
const centre = arm.ik(12, 0, true);
const pilot = new Pilot({
  autoRefuse: true, nMeasured: 6,
  channels: [0, 1].map((j) => ({ lo: centre[j] - 0.55, hi: centre[j] + 0.55,
    vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
  uMax: 0.15,
  start: arm.ik(startPath.at(0).x, startPath.at(0).y, true),
  guards: [{ index: 4, max: 6 }, { index: 5, max: 6 }],
  workspace: (q) => {
    const r = Math.hypot(arm.L1 * Math.cos(q[0]) + arm.L2 * Math.cos(q[0] + q[1]),
      arm.L1 * Math.sin(q[0]) + arm.L2 * Math.sin(q[0] + q[1]));
    return r > Math.abs(arm.L1 - arm.L2) + 0.5 && r < arm.L1 + arm.L2 - 0.5;
  },
  seed: 1,
});
while (pilot.phase !== 'done') {
  if (pilot.phase === 'fit') { pilot.work(); continue; }
  const cmd = pilot.command();
  const refs = cmd.map((c) => ({ theta: c.pos + c.u, omega: c.vel, alpha: c.acc }));
  const tau = servo.torques(refs);
  arm.step(tau[0], tau[1], 1);
  const enc = arm.encoders(), tool = arm.toolXY();
  const q1 = cmd[0].pos, q2 = cmd[1].pos;
  const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
  const cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
  const J = arm.jacobian(q1, q2);
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  const ex = tool[0] - cx, ey = tool[1] - cy;
  pilot.observe([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
    tau[0] * 1e3, tau[1] * 1e3],
  [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det]);
}
const st = pilot.status();
const built = pilot.qpIters;
await arm.l1.destroy(); await arm.l2.destroy();

// -------------------------------------------------------------------- deploy
async function deployOn(shape, active, iters) {
  if (iters) pilot.qpIters = iters;
  const { arm: a2, servo: s2 } = await makeArm();
  const path = mkPath(shape, 0.004);
  homeArm(a2, s2, path);
  const S = pilot.sample, cache = new Map();
  const refAt = (i) => {
    let r = cache.get(i);
    if (!r) { const c = path.at(i * S); r = a2.ik(c.x, c.y, true); cache.set(i, r); }
    return r;
  };
  pilot._initRun();
  const total = Math.ceil(path.lap * 3), scoreFrom = Math.ceil(path.lap * 2);
  const score = new ContourScore({ joints: 2, reversalTravel: 2e-2 });
  let kSamp = 0, uPk = 0;
  const t0 = process.hrtime.bigint();
  for (let k = 0; k < total; k++) {
    const cmd = path.at(k);
    const [q1, q2] = a2.ik(cmd.x, cmd.y, true);
    const rt = a2.ikRates(q1, q2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
    const u = active ? pilot.act((off) => refAt(kSamp + off)) : [0, 0];
    uPk = Math.max(uPk, Math.abs(u[0]), Math.abs(u[1]));
    const tau = s2.torques([{ theta: q1 + u[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + u[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    a2.step(tau[0], tau[1], 1);
    if (k % S === 0) kSamp++;
    const enc = a2.encoders();
    pilot.observe([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
      tau[0] * 1e3, tau[1] * 1e3], null);
    if (k >= scoreFrom) {
      const dec = decompose(path, a2.toolXY(), cmd);
      score.step(dec.contour, dec.lag, tau, [a2.j1.wM, a2.j2.wM]);
    }
  }
  const ns = Number(process.hrtime.bigint() - t0) / total;
  await a2.l1.destroy(); await a2.l2.destroy();
  return { r: score.report(), uPk, ns };
}

const NFULL = pilot.N;
const NS = (process.env.NS || '').split(',').filter(Boolean).map(Number);
const NITERS = (process.env.NITERS || '4').split(',').map(Number);

function costLine() {
  console.log('\n  iters   forecast   free+QP   peak MAC  peak %  sliced %');
  for (const it of ITERS) {
    pilot.qpIters = it;
    const c = pilot.cost();
    console.log(`  ${String(it).padStart(5)}   ${(c.features + c.dots).toLocaleString().padStart(8)}  ${c.qp.toLocaleString().padStart(8)}  ${c.peakMacPerCycle.toLocaleString().padStart(9)}  ${(100 * c.peakMacPerCycle / 10000).toFixed(0).padStart(5)}%  ${(100 * c.slicedMacPerCycle / 10000).toFixed(0).padStart(7)}%`);
  }
  pilot.qpIters = built;
}

console.log(`\nqpIters sweep on the 2R arm — one commissioned model, N=${st.N} sample=${st.sample}`
  + ` grid=${st.grid}, verify ${st.report.verify ? st.report.verify.ratio.toFixed(2) + 'x' : '—'}`
  + `; qpIters as built = ${built}`);
for (const shape of (process.env.SHAPES || 'rounded,circle').split(',')) {
  const off = await deployOn(shape, false, null);
  console.log(`\n  ${shape}: open loop contour ${off.r.contourRms.toExponential(3)},`
    + ` tau2 ${off.r.tau2.toExponential(2)}`);
  console.log('  iters      contour        x       bias      osc      uPk     tau2     µs/step');
  const rows = [];
  for (const it of ITERS) {
    const on = await deployOn(shape, true, it);
    const ratio = off.r.contourRms / on.r.contourRms;
    rows.push({ it, rms: on.r.contourRms, ratio });
    console.log(`  ${String(it).padStart(5)}   ${on.r.contourRms.toExponential(3)}  ${ratio.toFixed(2).padStart(6)}x  `
      + `${(on.r.contourBias ?? NaN).toFixed(3).padStart(7)}  ${(on.r.contourOsc ?? NaN).toFixed(3).padStart(7)}  `
      + `${on.uPk.toFixed(3).padStart(6)}  ${on.r.tau2.toExponential(2)}  ${(on.ns / 1000).toFixed(2).padStart(7)}`);
  }
  const best = rows.reduce((a, b) => (b.rms < a.rms ? b : a));
  const cheapest = rows.filter((r) => r.rms <= best.rms * 1.05).reduce((a, b) => (b.it < a.it ? b : a));
  console.log(`  best ${best.it} iters at ${best.ratio.toFixed(2)}x; within 5% of it the cheapest is `
    + `${cheapest.it} iters at ${cheapest.ratio.toFixed(2)}x (rule 42).`);
}
costLine();

// LEAD-BANK TRUNCATION — the same fitted bank, using only its first N leads. No
// re-commission: a shorter horizon is a strictly smaller model fitted by the same run.
if (NS.length) {
  for (const shape of (process.env.SHAPES || 'rounded').split(',')) {
    const off = await deployOn(shape, false, null);
    console.log(`\n  ${shape}: horizon sweep at ${NITERS} iterations (full N = ${NFULL}),`
      + ` open loop ${off.r.contourRms.toExponential(3)}`);
    console.log('  iters      N      contour        x        osc      uPk   peak MAC  peak %  sliced %');
    for (const it of NITERS) for (const nn of NS) {
      pilot.N = nn;
      const on = await deployOn(shape, true, it);
      const c = pilot.cost();
      console.log(`  ${String(it).padStart(5)}  ${String(nn).padStart(5)}   ${on.r.contourRms.toExponential(3)}  `
        + `${(off.r.contourRms / on.r.contourRms).toFixed(2).padStart(6)}x  `
        + `${(on.r.contourOsc ?? NaN).toFixed(3).padStart(7)}  ${on.uPk.toFixed(3).padStart(6)}  `
        + `${c.peakMacPerCycle.toLocaleString().padStart(10)}  `
        + `${Math.round(c.slicedMacPerCycle).toLocaleString().padStart(6)}  `
        + `${(100 * c.slicedMacPerCycle / 10000).toFixed(0).padStart(9)}%`);
    }
    pilot.N = NFULL; pilot.qpIters = built;
  }
}
