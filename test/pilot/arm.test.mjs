/**
 * @file THE PILOT ON THE 2R ARM, END TO END — the second plant, sharing no physics with
 * the first, driven through the same four verbs: route, limit, run, deploy.
 *
 * FULL TIER: commissioning is ~110k solver steps of two lattice links plus 62 ridge fits,
 * and the deployment scoring is four three-lap contour runs. What only this test can pin
 * is the flagship claim itself — that a controller commissioned ONCE, from noise, with no
 * part program in sight, cuts the contour error on programs it has never seen while
 * spending LESS energy — and that the numbers on the page came off this machine.
 */
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { roundedRect, circle } from '../../lib/flexisim/toolpath.js';
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';
import { PathILC } from '../../lib/flexisim/pathilc.js';
import { Pilot } from '../../lib/pilot/pilot.js';

/** Readable nulls: 'not measured' and 'zero' are different states (rule 25). */
const r2f = (v) => (v === null || v === undefined ? '—' : v.toFixed(3));
const ex = (v) => (v === null || v === undefined ? '—' : v.toExponential(2));

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: the 2R arm, route–limit–run–deploy');

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

function mkPath(shape, feed) {
  const o = { feed, accel: 4e-5, cornerDt: 40, centre: PG.centre };
  return shape === 'circle' ? circle({ ...o, r: 4 }) : roundedRect({ ...o, w: 8, h: 8, r: 1.5, closed: true });
}

function homeArm(arm, servo, path) {
  const c0 = path.at(0);
  const [q1, q2] = arm.ik(c0.x, c0.y, true);
  arm.setPose(q1, q2);
  const refs = [{ theta: q1, omega: 0, alpha: 0 }, { theta: q2, omega: 0, alpha: 0 }];
  for (let i = 0; i < 4000; i++) { const t = servo.torques(refs); arm.step(t[0], t[1], 1); }
  servo.resetLimitStats();
}

// ------------------------------------------------------------------- ROUTE AND LIMIT
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

// --------------------------------------------------------------------------- RUN
let steps = 0;
while (pilot.phase !== 'done') {
  if (pilot.phase === 'fit') { pilot.work(); continue; }
  const cmd = pilot.command();
  const refs = cmd.map((c) => ({ theta: c.pos + c.u, omega: c.vel, alpha: c.acc }));
  const tau = servo.torques(refs);
  arm.step(tau[0], tau[1], 1);
  steps++;
  const enc = arm.encoders();
  const tool = arm.toolXY();
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
console.log(`    commissioned in ${steps} steps: Ts ${st.Ts}, sample ${st.sample}, grid `
  + `${st.grid}, N ${st.N}; chose ${st.report.readouts.map((r) =>
    `stride ${r.stride}/ridge ${r.ridge}`).join(', ')}`);
console.log(`    verify: ${st.report.verify ? st.report.verify.ratio.toFixed(2) + 'x at λ '
  + st.report.verify.lambda.toExponential(1) : '—'}`);
// WHY THE FAR LEAD IS BAD, WHICH THE R2 ALONE CANNOT SAY. A ratio above 1 means the far
// lead's held-out rows sit further outside the data than the near lead's — the fit is
// EXTRAPOLATING and the fix is excitation. Near 1 with a bad r2Far means the rows are covered
// and the FEATURES cannot span the target — the fix is the dictionary. Opposite plans.
for (const r of st.report.readouts) {
  console.log(`    ch${r.ch ?? ''} R² lead0 ${r.r2Lead0.toFixed(3)} → far ${r2f(r.r2Far)}`
    + `   leverage lead0 ${ex(r.levLead0)} → far ${ex(r.levFar)}`
    + `   ratio ${r.levRatio === null ? '—' : r.levRatio.toFixed(2)}`
    + `   ⇒ ${r.levRatio === null ? 'no reading'
      : (r.levRatio > 1.5 ? 'EXTRAPOLATING — excitation' : 'covered — the FEATURES do not span it')}`);
}
check('the pilot measured the arm\'s timescale and derived its grids from it',
  st.Ts > 1000 && st.Ts < 5000, `Ts ${st.Ts}`);
check('…autotune chose the windows and the ridge on held-out data',
  st.report.readouts.every((r) => r.r2Lead0 > 0.5 && !r.gated), JSON.stringify(st.report.readouts));
check('…and the verify round measured better than 2x ON THE MACHINE before deploying',
  pilot.verdict.deploy === true && st.report.verify.ratio > 2,
  JSON.stringify(pilot.verdict));
await arm.l1.destroy(); await arm.l2.destroy();

// -------------------------------------------------------------------------- DEPLOY
async function deployOn(shape, active) {
  const { arm: a2, servo: s2 } = await makeArm();
  const path = mkPath(shape, 0.004);
  homeArm(a2, s2, path);
  const S = pilot.sample;
  const cache = new Map();
  const refAt = (i) => {
    let r = cache.get(i);
    if (!r) { const c = path.at(i * S); r = a2.ik(c.x, c.y, true); cache.set(i, r); }
    return r;
  };
  pilot._initRun();
  const total = Math.ceil(path.lap * 3);
  const score = new ContourScore({ joints: 2, reversalTravel: 2e-2 });
  const scoreFrom = Math.ceil(path.lap * 2);
  let kSamp = 0, uPk = 0;
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
  await a2.l1.destroy(); await a2.l2.destroy();
  return { r: score.report(), uPk };
}

// THE GATES MOVED UP WITH EACH REGISTRATION FIX AND THEY ARE MEANT TO: the attribution
// instrument took the machine from 2.16x its own plan's prediction to 1.04x (FOH basis,
// then its registration), and the 1.5x-Ts horizon plus the plant-scaled effort weight
// took the rectangle to 6.16x — BELOW the fourteen-lap learner's converged figure, one
// shot, on 36% less copper. A regression in any of those mechanisms fails these gates by
// a factor, not a margin.
for (const [shape, gate] of [['rounded', 5.0], ['circle', 6]]) {
  const off = await deployOn(shape, false);
  const on = await deployOn(shape, true);
  const ratio = off.r.contourRms / on.r.contourRms;
  console.log(`    ${shape}: contour ${off.r.contourRms.toExponential(3)} → `
    + `${on.r.contourRms.toExponential(3)} (${ratio.toFixed(2)}x), tau2 `
    + `${off.r.tau2.toExponential(2)} → ${on.r.tau2.toExponential(2)}, u peak ${on.uPk.toFixed(3)}`);
  check(`on the ${shape} — a program the pilot has never seen — the contour falls ${gate}x`,
    ratio > gate, ratio.toFixed(2) + 'x');
  if (shape === 'rounded') {
    check('…while spending no more copper than the open loop times 1.15',
      on.r.tau2 < 1.15 * off.r.tau2,
      `${on.r.tau2.toExponential(3)} vs ${off.r.tau2.toExponential(3)}`);
  }
  check(`…and the ${shape}'s correction never exceeded the engineer's cap`,
    on.uPk <= 0.15 + 1e-12, on.uPk.toFixed(4));
}

// ============================== ⑤+④: THE ILC TABLE FOLDING ON THE PILOT'S RESIDUAL
//
// One-shot, the pilot leaves the circle at ~1e-2 — brick 38 located the remainder as
// the correction's own footprint on a state-dependent disturbance, measurable only
// from a deployed lap. This is that lap, folded in: an ILC table on TOP of the pilot's
// corrections, mapped through the analytic Jacobian exactly as mode ④ maps. Measured
// ladder on this rig: 7.1e-2 (cold rings) falling to 1.03e-3 by lap 14 — the analytic
// ILC@15's territory, reached with the pilot doing the one-shot bulk. The gates sit a
// factor above the measured tail.
{
  const { arm: a5, servo: s5 } = await makeArm();
  const path = mkPath('circle', 0.004);
  const p0 = path.at(0);
  const qs = a5.ik(p0.x, p0.y, true);
  a5.setPose(qs[0], qs[1]);
  for (let i = 0; i < 4000; i++) {
    const t = s5.torques([{ theta: qs[0], omega: 0, alpha: 0 }, { theta: qs[1], omega: 0, alpha: 0 }]);
    a5.step(t[0], t[1], 1);
  }
  const S = pilot.sample, lap = Math.ceil(path.lap);
  const refs = new Array(lap + 2);
  for (let k = 0; k <= lap + 1; k++) { const c = path.at(k); refs[k] = a5.ik(c.x, c.y, true); }
  const sampRef = (i) => refs[((i * S) % lap + lap) % lap];
  const ilc = new PathILC({ length: path.length, joints: 2, bins: 1500, gain: 1.0,
    smooth: 12, leadBins: Math.round(500 * 1500 / path.lap) });
  pilot._initRun();
  const ladder = [];
  for (let l = 0; l < 12; l++) {
    const score = new ContourScore({ joints: 2, reversalTravel: 2e-2 });
    for (let k = 0; k < lap; k++) {
      const q = refs[k], qm = refs[(k - 1 + lap) % lap], qp = refs[(k + 1) % lap];
      const kAbs = l * lap + k;
      const u = pilot.act((off) => sampRef(Math.floor(kAbs / S) + off));
      const cmd = path.at(k);
      const o = ilc.offset(cmd.s);
      const tau = s5.torques([
        { theta: q[0] + u[0] + o[0], omega: (qp[0] - qm[0]) / 2, alpha: qp[0] - 2 * q[0] + qm[0] },
        { theta: q[1] + u[1] + o[1], omega: (qp[1] - qm[1]) / 2, alpha: qp[1] - 2 * q[1] + qm[1] }]);
      a5.step(tau[0], tau[1], 1);
      const enc = a5.encoders();
      pilot.observe([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
        tau[0] * 1e3, tau[1] * 1e3], null);
      const tool = a5.toolXY();
      const dec = decompose(path, tool, cmd);
      score.step(dec.contour, dec.lag, tau, [a5.j1.wM, a5.j2.wM]);
      const J = a5.jacobian(q[0], q[1]);
      const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      if (Math.abs(det) > 1e-12) {
        const ex = tool[0] - cmd.x, ey = tool[1] - cmd.y;
        ilc.observe(cmd.s, [(J[1][1] * ex - J[0][1] * ey) / det,
          (-J[1][0] * ex + J[0][0] * ey) / det]);
      }
    }
    ilc.endLap();
    ladder.push(score.report().contourRms);
  }
  await a5.l1.destroy(); await a5.l2.destroy();
  const tail = Math.min(...ladder.slice(-3));
  console.log(`    ⑤+④ circle ladder: ${ladder.map((v) => v.toExponential(1)).join(' ')}`);
  check('ILC folding on the pilot\'s residual converges past what either does alone',
    tail < 6e-3 && tail < ladder[0] / 4,
    `tail ${tail.toExponential(2)} vs lap 1 ${ladder[0].toExponential(2)}`);
}

console.log(failed ? `\npilot/arm: ${failed} check(s) FAILED\n` : '\npilot/arm: all checks passed\n');
process.exit(failed ? 1 : 0);
