/**
 * @file SCORED-VERSUS-DEPLOYED PARITY, IN THE PAGE'S OWN SHAPE. The ladder's table
 * promised 8.3e-2 on the rounded rectangle and the page's deployed machine showed
 * 1.15–1.79e-1 shortly after deploy. Two explanations, different fixes: the page's badge
 * blends the deploy transient into its score (a reporting artifact — rule 12, read the
 * meter after it settles), or the page's live loop differs from the scored runs (a parity
 * defect — rule 6). This bench commissions the same ladder and then drives the deployed
 * machine EXACTLY as the page does — continuous step counter across laps, `actAt` per
 * step, `observe` per step — and scores EACH LAP SEPARATELY, so a transient and a steady
 * state cannot be mistaken for one another.
 *
 * Run: node test/flexisim/deployparity.mjs
 */
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { roundedRect } from '../../lib/flexisim/toolpath.js';
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';
import { RobotComp } from '../../lib/ngrc/robotcomp.js';
import { makeArmHost } from '../../lib/flexisim/autohost.js';

const K = +(process.env.K || 1), E = +(process.env.E || 0.06);
const H = 4, CLAMP = 3, nu = 0.3, rho = 1, g = 2e-6, RATIO = 100, DRIVE = 32;
const LEN1 = 14, LEN2 = 10, BACKLASH = 1e-4, CENTRE = [12, 0];
const PATH = { w: 8, h: 8, r: 1.5, centre: CENTRE, feed: 4e-3, accel: 4e-5 };

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

const path = roundedRect(PATH);
const LAP = Math.ceil(path.lap);
const p0 = path.at(0);
async function fresh() {
  const m = await machine();
  const rc = commissionComp(m.arm, m.servo);
  const [q1, q2] = m.arm.ik(p0.x, p0.y, true);
  settle(m.arm, m.servo, q1, q2);
  return { ...m, rc };
}

const T0 = Date.now();
console.log(`\nscored-vs-deployed parity, page shape, rounded, K ${K} / E ${E}\n`);
const centre = [0, 0];
let hostRef = null;
{
  const m = await machine();
  const c = m.arm.ik(12, 0, true);
  centre[0] = c[0]; centre[1] = c[1];
  hostRef = makeArmHost({
    makeMachine: fresh, path, lap: LAP, K, centre,
    demo: {}, lapMemory: false, probeLaps: { warmup: 1, avg: 2 },
    onRung: (r) => console.log(`  [${((Date.now() - T0) / 60000).toFixed(0)}m] ${r.name}  `
      + `${r.score.toExponential(4)}${r.deployed ? '' : '  — NOT deployed'}`),
  });
  hostRef.auto.pilotOpts.start = m.arm.ik(p0.x, p0.y, true);
  hostRef.auto.pilotOpts.workspace = (q) => {
    const rr = Math.hypot(m.arm.L1 * Math.cos(q[0]) + m.arm.L2 * Math.cos(q[0] + q[1]),
      m.arm.L1 * Math.sin(q[0]) + m.arm.L2 * Math.sin(q[0] + q[1]));
    return rr > Math.abs(m.arm.L1 - m.arm.L2) + 0.5 && rr < m.arm.L1 + m.arm.L2 - 0.5;
  };
  await m.l1.destroy(); await m.l2.destroy();
}
const rep = await hostRef.auto.commission({ run: hostRef.run,
  drivePilot: hostRef.drivePilot, recordDemo: hostRef.recordDemo });
console.log(`  ladder best ${rep.best.toExponential(4)}, shipped `
  + `${JSON.stringify(hostRef.auto.deployed)}\n`);
await hostRef.dispose();

// ---- THE PAGE'S DEPLOY LOOP, replicated move for move: a live arm, attach with the live
// path, continuous kP across laps, actAt + observe every step, each lap scored alone.
const live = await fresh();
hostRef.attach(live.arm, live.servo, live.rc, path, path.lap);
hostRef.auto.beginRun();
const LAPS = 6;
for (let l = 0; l < LAPS; l++) {
  const sc = new ContourScore({ joints: 2 });
  for (let k = 0; k < LAP; k++) {
    const kP = l * LAP + k;
    const cmd = path.at(k);
    const [q1, q2] = live.arm.ik(cmd.x, cmd.y, true);
    const rt = live.arm.ikRates(q1, q2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
    const refs = [{ theta: q1, omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2, omega: rt.dq[1], alpha: rt.ddq[1] }];
    const dq = hostRef.actAt(kP, cmd, refs);
    const tau = live.servo.torques([{ ...refs[0], theta: q1 + dq[0] },
      { ...refs[1], theta: q2 + dq[1] }]);
    live.arm.step(tau[0], tau[1], 1);
    const en = live.arm.encoders();
    hostRef.auto.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
      tau[0] * 1e3, tau[1] * 1e3]);
    const d = decompose(path, live.arm.toolXY(), cmd);
    sc.step(d.contour, d.lag, tau, [live.arm.j1.wM, live.arm.j2.wM]);
  }
  const r = sc.report();
  console.log(`  lap ${l + 1}: contour ${r.contourRms.toExponential(4)}  `
    + `lag ${r.lagRms.toExponential(3)}`);
}
console.log(`\n  ladder promised ${rep.best.toExponential(4)} — the settled laps above are `
  + 'the deployed truth; a gap that survives lap 3 is a parity defect, not a transient.');
await live.l1.destroy(); await live.l2.destroy();
