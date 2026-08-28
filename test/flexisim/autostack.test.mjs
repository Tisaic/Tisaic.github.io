import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { roundedRect } from '../../lib/flexisim/toolpath.js';
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';
import { RobotComp } from '../../lib/ngrc/robotcomp.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}


const H = 4, nu = 0.3, rho = 1, CLAMP = 3, RATIO = 100, g = 2e-6;
const LEN1 = 14, LEN2 = 10;
const K = +(process.env.K || 1), E = +(process.env.E || 0.06);
// THE PAGE'S OWN MACHINE: drive limits, backlash, and the centre the Path tab works about.
const CENTRE = [12, 0], BACKLASH = 1e-4, DRIVE = 32;
const PATH = { w: 8, h: 8, r: 1.5, centre: CENTRE, feed: 4e-3, accel: 4e-5,
  cornerDt: 40, closed: true };
const NH = +(process.env.NH || 16);
const STEP = +(process.env.STEP || 0.6);
const PASSES = +(process.env.PASSES || 9);
const AMP = 4e-3;

async function machine() {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E, nu, rho,
    damping: 3e-3 });
  const l1 = await mk(LEN1), l2 = await mk(LEN2);
  const jt = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K, backlash: BACKLASH,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: jt(massProperties(l1)), link1: l1,
    joint2: jt(massProperties(l2)), link2: l2, gravityWorld: [0, -g, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: DRIVE * hold, speedMax: 0.2 });
  return { arm, l1, l2, servo };
}
function settle(arm, servo, a, b, n = 4000) {
  arm.setPose(a, b);
  for (let i = 0; i < n; i++) {
    const t = servo.torques([{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }]);
    arm.step(t[0], t[1], 1);
  }
}
/** The conventional machine's own compliance, from held poses. Always on: it is the baseline. */
function commissionComp(arm, servo) {
  const rc = new RobotComp(2, 2, 1e6);
  for (const [a, b] of [[0.10, 0.30], [-0.05, 0.55], [0.25, 0.15], [0.00, 0.42]]) {
    settle(arm, servo, a, b);
    const refs = [{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }];
    rc.calibrate([[1, 0], [0, 1]], servo.jointTorques(refs),
      [arm.j1.windup(), arm.j2.windup()], 1.0);
  }
  return rc;
}


import { AutoStack } from '../../lib/pilot/autostack.js';
import { motionBasis } from '../../lib/pilot/classic.js';

console.log('\nflexisim: the button, on the arm — against the strongest number this repo has\n');

// THE MACHINE AND PROGRAM ARE `composite.test.mjs`'s, EXACTLY — same links, same joints,
// same backlash, same drive, same rounded rectangle at the same feed about the same centre.
// That file's hand-built stack reaches 1.340e-2 from a 4.122e-1 conventional machine, which
// is the strongest arm result in this repository. This one asks whether the SELF-TUNING
// ladder gets there with nothing set but the maxes, the authority and the floor. One
// variable: who chooses the constants.
const TARGET = 1.340e-2;          // composite.test.mjs, cascade(2) + HFF on top
const CONV = 4.122e-1;            // the conventional machine both are measured against

const path = roundedRect(PATH);
const LAP = Math.ceil(path.lap);
const p0 = path.at(0);

// The reference's own world velocity and acceleration, for the conventional rung's basis.
const wv = [new Float64Array(LAP), new Float64Array(LAP)];
const wa = [new Float64Array(LAP), new Float64Array(LAP)];
for (let k = 0; k < LAP; k++) {
  const c = path.at(k);
  wv[0][k] = c.vx; wv[1][k] = c.vy; wa[0][k] = c.ax; wa[1][k] = c.ay;
}

let armRef = null;                 // the arm currently being driven, for the frame maps
/** World (dx, dy) into joint offsets at the pose the machine is commanded to. */
const worldToJoint = (u, ctx) => {
  const J = armRef.jacobian(ctx.q[0], ctx.q[1]);
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  if (!(Math.abs(det) > 1e-12)) return [0, 0];
  return [(J[1][1] * u[0] - J[0][1] * u[1]) / det, (-J[1][0] * u[0] + J[0][0] * u[1]) / det];
};

const centre = [0, 0];             // filled once an arm exists
const auto = new AutoStack({
  // THE COMMON FRAME IS JOINT SPACE, because that is where the pilot was measured to work and
  // where the machine is actually commanded. The other two rungs live in WORLD — the frame
  // the harmonic rung was measured to need, 8.86x against a path-normal 0.99x — and declare a
  // map into it. Forcing one frame on all three cost the pilot 2.9x when it was tried.
  channels: [0, 1].map(() => ({ lo: -3, hi: 3, vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
  uMax: 3.0, periodic: LAP, maxDepth: 2,
  basis: motionBasis([{ v: wv[0], a: wa[0] }, { v: wv[1], a: wa[1] }]),
  frames: { classic: { uMax: 1.5, map: worldToJoint }, hff: { uMax: 1.5, map: worldToJoint } },
  pilot: {},                        // filled below, once the arm's own centre is known
});

async function fresh() {
  const m = await machine();
  const rc = commissionComp(m.arm, m.servo);
  const [q1, q2] = m.arm.ik(p0.x, p0.y, true);
  settle(m.arm, m.servo, q1, q2);
  return { ...m, rc };
}

/** One scored run: the deployed rungs, plus `extra` when a rung is being probed. */
async function run(extra, name, laps = 3) {
  const { arm, l1, l2, servo, rc } = await fresh();
  armRef = arm;
  auto.beginRun();
  const sc = new ContourScore({ joints: 2 });
  const ex = new Float64Array(LAP), ey = new Float64Array(LAP);
  const lapE = [];
  for (let l = 0; l < laps; l++) {
    const le = new Float64Array(LAP);
    for (let k = 0; k < LAP; k++) {
      const cmd = path.at(k);
      const [c1, c2] = arm.ik(cmd.x, cmd.y, true);
      const r = arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const base = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
      const ff = rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base), { enableToolff: false });
      const S = auto.stack ? auto.stack.sample : 1;
      const kSamp = Math.floor((l * LAP + k) / S);
      const look = (off) => {
        const c = path.at((((kSamp + off) * S) % LAP + LAP) % LAP);
        return arm.ik(c.x, c.y, true);
      };
      const ctx = { v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k, look, q: [c1, c2] };
      const u = auto.act(ctx);
      let d0 = u[0], d1 = u[1];
      // THE RUNG UNDER TEST GOES THROUGH ITS OWN FRAME MAP, the same one it will deploy
      // through. Commissioning a rung through one map and deploying it through another is
      // identifying one machine and correcting a different one.
      if (extra) {
        const w = auto.into(extra.at(k), name, ctx);
        d0 += w[0]; d1 += w[1];
      }
      const tau = servo.torques([{ ...base[0], theta: c1 + ff.dq[0] + d0 },
        { ...base[1], theta: c2 + ff.dq[1] + d1 }]);
      arm.step(tau[0], tau[1], 1);
      const en = arm.encoders();
      auto.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
        tau[0] * 1e3, tau[1] * 1e3]);
      const d = decompose(path, arm.toolXY(), cmd);
      le[k] = d.contour;
      if (l === laps - 1) {
        sc.step(d.contour, d.lag, tau, [arm.j1.wM, arm.j2.wM]);
        const tp = arm.toolXY();
        ex[k] = tp[0] - cmd.x; ey[k] = tp[1] - cmd.y;
      }
    }
    lapE.push(le);
  }
  await l1.destroy(); await l2.destroy();
  const rep = sc.report();
  return { score: rep.contourRms, err: [ex, ey], bias: rep.contourBias, osc: rep.contourOsc, lapE };
}

/** Drive a Stack's phase machine in JOINT space, exactly as `composite.test.mjs` does. */
async function drivePilot(st) {
  const { arm, l1, l2, servo, rc } = await fresh();
  armRef = arm;
  let guard = 0;
  while (st.phase !== 'done' && guard++ < 4e6) {
    if (st.phase === 'fit') { st.work(); continue; }
    const cmd = st.command();
    const tgc = servo.jointTorques(cmd.map((c) => ({ theta: c.pos, omega: c.vel, alpha: c.acc })));
    const ff = rc.feedforward([[1, 0], [0, 1]], tgc, { enableToolff: false });
    // THE RUNGS BELOW THE PILOT ARE ARMED WHILE IT COMMISSIONS, because they will be armed
    // when it deploys. The conventional rung reads the reference's own velocity and
    // acceleration, which here are the pilot's commanded ones.
    const below = auto.actBelow('stack', { v: [cmd[0].vel, cmd[1].vel],
      a: [cmd[0].acc, cmd[1].acc], q: [cmd[0].pos, cmd[1].pos] });
    const refs = cmd.map((c, j) => ({ theta: c.pos + c.u + ff.dq[j] + below[j],
      omega: c.vel, alpha: c.acc }));
    const tau = servo.torques(refs);
    arm.step(tau[0], tau[1], 1);
    const en = arm.encoders(), tool = arm.toolXY();
    const q1 = cmd[0].pos, q2 = cmd[1].pos;
    const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
    const cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
    const J = arm.jacobian(q1, q2);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    const exw = tool[0] - cx, eyw = tool[1] - cy;
    st.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
      tau[0] * 1e3, tau[1] * 1e3],
    [(J[1][1] * exw - J[0][1] * eyw) / det, (-J[1][0] * exw + J[0][0] * eyw) / det]);
  }
  await l1.destroy(); await l2.destroy();
}

// ---- the pilot's own limits, in ITS frame, read off `composite.test.mjs`
{
  const m = await machine();
  const c = m.arm.ik(12, 0, true);
  centre[0] = c[0]; centre[1] = c[1];
  auto.channels = [0, 1].map((j) => ({ lo: c[j] - 0.55, hi: c[j] + 0.55,
    vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 }));
  auto.pilotOpts = {
    nMeasured: 6, autoRefuse: false, gateForecasts: false,
    uMax: Math.min(2.0, 0.15 * (16 / K)),
    probeAmp: 0.15 * Math.min(1.0, 0.15 * (16 / K)),
    ditherAmp: 0.1 * Math.min(1.0, 0.15 * (16 / K)),
    start: m.arm.ik(p0.x, p0.y, true),
    guards: [], refusePartial: false,
    workspace: (q) => {
      const rr = Math.hypot(m.arm.L1 * Math.cos(q[0]) + m.arm.L2 * Math.cos(q[0] + q[1]),
        m.arm.L1 * Math.sin(q[0]) + m.arm.L2 * Math.sin(q[0] + q[1]));
      return rr > Math.abs(m.arm.L1 - m.arm.L2) + 0.5 && rr < m.arm.L1 + m.arm.L2 - 0.5;
    },
    seed: 1,
  };
  await m.l1.destroy(); await m.l2.destroy();
}

// ---- THE INSTRUMENT'S FLOOR, MEASURED. A deterministic rig has none of its own.
const probe0 = await run(null, null, 4);
let d2 = 0;
for (let k = 0; k < LAP; k++) { const d = probe0.lapE[3][k] - probe0.lapE[2][k]; d2 += d * d; }
auto.floor = Math.sqrt(d2 / LAP);
console.log(`  [arm K ${K} E ${E}, rounded rect, feed ${PATH.feed}, lap ${LAP}]`);
console.log(`  conventional machine ${probe0.score.toExponential(4)}`
  + `  bias ${probe0.bias.toExponential(2)}  osc ${probe0.osc.toExponential(2)}`
  + `   lap-to-lap floor ${auto.floor.toExponential(3)}`);
check('the harness reproduces the conventional machine `composite.test.mjs` measures, so the '
  + 'comparison below is one variable — who chooses the constants — and not two machines',
  Math.abs(probe0.score - CONV) / CONV < 0.02,
  `${probe0.score.toExponential(4)} against composite's ${CONV.toExponential(4)}`);

const t0 = Date.now();
const rep = await auto.commission({ run, drivePilot });
console.log(`\n${auto.table()}`);
console.log(`\n  shipped ${JSON.stringify(rep.deployed)}   ${rep.base.toExponential(4)} → `
  + `${rep.best.toExponential(4)}   ${rep.gain.toFixed(2)}x   ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`  composite.test.mjs, hand-built, same machine   ${TARGET.toExponential(4)}   `
  + `${(CONV / TARGET).toFixed(2)}x`);

check('THE HEADLINE: the self-tuning ladder matches or beats the hand-built stack on the same '
  + 'machine and program — the strongest arm result this repository has',
  rep.best <= TARGET, `${rep.best.toExponential(4)} against ${TARGET.toExponential(4)}`);
check('…and it is not the common cap doing the work by accident: the cap was not binding when '
  + 'the shipped configuration was scored',
  auto.clipping().frac < 0.01, JSON.stringify(auto.clipping()));

console.log(failed ? `\nautostack-arm: ${failed} check(s) FAILED\n`
  : '\nautostack-arm: all checks passed\n');
process.exit(failed ? 1 : 0);
