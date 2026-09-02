/**
 * @file THE ONE-PRESS DEMO LADDER — plan §37 step ⑦, end to end on the flexisim arm.
 *
 * The owner's amended contract: route the signals, state the limits, hand the block a DEMO
 * PATH of representative dynamics, press GO. This bench runs that press on the machine the
 * button actually ships — the SHARED host (`makeArmHost`), the same machine construction as
 * `autostack.test.mjs` — scored on the SHARP SQUARE (the program family where corner banks
 * measured a lever; on the rounded they measured byte-identical, §37 ②), with the DIAMOND
 * as the demo: same four sharp corners, no shared straight, a geometry the ladder is never
 * scored on. The lap-periodic rung is disabled — it is the retired memory, and the demo
 * rung is the thing under test.
 *
 * What to read from the table: rung ②b ships only if it beats the cascade below it on the
 * machine, and `report.demo` states what was fitted. A refusal here is a correct outcome
 * with a stated reason, not a failure of the bench.
 *
 * Run: node test/flexisim/demoladder.mjs   [K=1 E=0.06]
 */
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { sharpRect, ToolPath, SEG } from '../../lib/flexisim/toolpath.js';
import { RobotComp } from '../../lib/ngrc/robotcomp.js';
import { makeArmHost } from '../../lib/flexisim/autohost.js';

const K = +(process.env.K || 1), E = +(process.env.E || 0.06);
const H = 4, CLAMP = 3, nu = 0.3, rho = 1, g = 2e-6, RATIO = 100, DRIVE = 32;
const LEN1 = 14, LEN2 = 10, BACKLASH = 1e-4, CENTRE = [12, 0];

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

const path = sharpRect({ feed: 4e-3, accel: 4e-5, cornerDt: 40, centre: CENTRE,
  w: 8, h: 8, closed: true });
const LAP = Math.ceil(path.lap);
const p0 = path.at(0);
const diamond = (feed) => {
  const [cx, cy] = CENTRE, r = 4;
  return new ToolPath({ start: [cx + r, cy], feed, accel: 4e-5, closed: true, cornerDt: 40,
    segments: [[SEG.LINE, [cx, cy + r]], [SEG.LINE, [cx - r, cy]], [SEG.LINE, [cx, cy - r]]] });
};

async function fresh() {
  const m = await machine();
  const rc = commissionComp(m.arm, m.servo);
  const [q1, q2] = m.arm.ik(p0.x, p0.y, true);
  settle(m.arm, m.servo, q1, q2);
  return { ...m, rc };
}

const T0 = Date.now();
console.log(`\nthe one-press demo ladder: sharp square scored, `
  + `${process.env.DEMO === 'diamond' ? 'diamond demo' : 'DESIGNED demo (no program supplied)'}, `
  + `K ${K} / E ${E}\n`);
const centre = [0, 0];
let hostRef = null;
{
  const m = await machine();
  const c = m.arm.ik(12, 0, true);
  centre[0] = c[0]; centre[1] = c[1];
  // DEMO=diamond reruns the engineer-supplied-demo rows; the default exercises the DESIGNED
  // fallback — no program supplied, the block generates its own optimal-dynamics demo.
  hostRef = makeArmHost({
    makeMachine: fresh, path, lap: LAP, K, centre,
    demo: {},
    // PROBE=0 restores decision-grade runs for the conventional rung's commissioning.
    ...(process.env.PROBE === '0' ? {} : { probeLaps: { warmup: 1, avg: 2 } }),
    ...(process.env.DEMO === 'diamond' ? { demoPath: [diamond(4e-3), diamond(8e-3)] } : {}),
    onRung: (r) => console.log(`  [${((Date.now() - T0) / 60000).toFixed(0)}m] `
      + `${r.name}  ${r.score.toExponential(4)}`
      + `${r.gain === null ? '' : '  ' + r.gain.toFixed(2) + 'x'}`
      + `${r.deployed ? '' : '  — NOT deployed'}${r.note ? '   ' + r.note : ''}`),
  });
  hostRef.auto.pilotOpts.start = m.arm.ik(p0.x, p0.y, true);
  hostRef.auto.pilotOpts.workspace = (q) => {
    const rr = Math.hypot(m.arm.L1 * Math.cos(q[0]) + m.arm.L2 * Math.cos(q[0] + q[1]),
      m.arm.L1 * Math.sin(q[0]) + m.arm.L2 * Math.sin(q[0] + q[1]));
    return rr > Math.abs(m.arm.L1 - m.arm.L2) + 0.5 && rr < m.arm.L1 + m.arm.L2 - 0.5;
  };
  // THE LAP-PERIODIC RUNG IS OFF: it is the retired memory, and this bench measures the
  // demo rung against the model-only ladder the retirement leaves.
  hostRef.auto.periodic = 0;
  await m.l1.destroy(); await m.l2.destroy();
}

const report = await hostRef.auto.commission(hostRef);
if (report.classic) {
  console.log(`\n  conventional commission: laps ${report.classic.laps}, `
    + `headroom ${report.classic.headroom?.toFixed(3) ?? 'n/a'}, `
    + `why ${report.classic.why || '(ran its budget)'}, `
    + `hist ${(report.classic.hist || []).map((h) => h.toExponential(2)).join(' ')}`);
}
console.log(`\n  demo rung: ${JSON.stringify(report.demo || null)}`);
console.log(`  shipped: ${JSON.stringify(hostRef.auto.deployed)}`);
console.log(`  total ${((Date.now() - T0) / 60000).toFixed(1)} min`);
await hostRef.dispose?.();
