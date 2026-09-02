/**
 * @file THE MECHANISM CAMPAIGN — the deployed machine's deterministic residual (99.7%
 * repeatable, 5.9e-2 against a 3.4e-3 lap-noise floor) interrogated until its mechanisms
 * are DEFINED, on the owner's premise: the error is local physics, not lap-scale memory.
 *
 * One commissioning; then the deployed machine is driven at THREE feeds and every sample
 * is recorded (state, residual split into normal/along, joint speeds, wind-up, torque).
 * The analyzers each target one hypothesis:
 *
 *   H-DROOP  pose-dependent quasi-statics (gravity, configuration compliance)
 *            → feed-INDEPENDENT part of the profile.
 *   H-LAG    servo velocity lag                    → scales ∝ feed   (p≈1)
 *   H-CENT   curvature/centripetal deflection      → scales ∝ feed²  (p≈2)
 *   H-TRANS  settling-scale transients after curvature steps
 *            → residual concentrated at arc entries/exits, window-reach knee ≈ Ts.
 *   H-LASH   backlash hysteresis at joint reversals → residual conditioned near
 *            dq sign crossings ≫ away from them.
 *
 * Run: node test/flexisim/residualcampaign.mjs      [BL=0 for the backlash-free twin]
 * Writes the raw records to scratchpad JSON for further offline analyzers.
 */
import { writeFileSync } from 'node:fs';
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { roundedRect } from '../../lib/flexisim/toolpath.js';
import { RobotComp } from '../../lib/ngrc/robotcomp.js';
import { makeArmHost } from '../../lib/flexisim/autohost.js';

const K = +(process.env.K || 1), E = +(process.env.E || 0.06);
const BACKLASH = process.env.BL === '0' ? 0 : 1e-4;
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-Tisaic-github-io/932a1341-a996-534b-9a60-fb10b63f0258/scratchpad/campaign'
  + (BACKLASH ? '' : '-bl0') + '.json';
const H = 4, CLAMP = 3, nu = 0.3, rho = 1, g = 2e-6, RATIO = 100, DRIVE = 32;
const LEN1 = 14, LEN2 = 10, CENTRE = [12, 0];
const mkPath = (feed) => roundedRect({ w: 8, h: 8, r: 1.5, centre: CENTRE, feed,
  accel: 4e-5, cornerDt: 40, closed: true });

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

const path0 = mkPath(4e-3);
const LAP0 = Math.ceil(path0.lap);
const p0 = path0.at(0);
async function fresh() {
  const m = await machine();
  const rc = commissionComp(m.arm, m.servo);
  const [q1, q2] = m.arm.ik(p0.x, p0.y, true);
  settle(m.arm, m.servo, q1, q2);
  return { ...m, rc };
}

const T0 = Date.now();
console.log(`\nmechanism campaign: K ${K} / E ${E} / backlash ${BACKLASH}\n`);
const centre = [0, 0];
let hostRef = null;
{
  const m = await machine();
  const c = m.arm.ik(12, 0, true);
  centre[0] = c[0]; centre[1] = c[1];
  hostRef = makeArmHost({
    makeMachine: fresh, path: path0, lap: LAP0, K, centre,
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

// ---- DRIVE AT THREE FEEDS, RECORD EVERYTHING ------------------------------------------
const FEEDS = [2e-3, 4e-3, 8e-3];
const LAPS = 6;
const S = hostRef.auto.stack ? hostRef.auto.stack.sample : 1;
const data = {};
for (const feed of FEEDS) {
  const path = mkPath(feed);
  const T = path.lap, LAP = Math.ceil(T);
  const live = await fresh();
  hostRef.attach(live.arm, live.servo, live.rc, path, T);
  hostRef.auto.beginRun();
  const rows = [];
  let kP = 0;
  for (let lap = 0; lap < LAPS; lap++) {
    for (let k = 0; k < LAP; k++) {
      const cmd = path.at(kP);
      const [q1, q2] = live.arm.ik(cmd.x, cmd.y, true);
      const rt = live.arm.ikRates(q1, q2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const refs = [{ theta: q1, omega: rt.dq[0], alpha: rt.ddq[0] },
        { theta: q2, omega: rt.dq[1], alpha: rt.ddq[1] }];
      const dq = hostRef.actAt(kP, cmd, refs);
      const tau = live.servo.torques([{ ...refs[0], theta: q1 + dq[0] },
        { ...refs[1], theta: q2 + dq[1] }]);
      live.arm.step(tau[0], tau[1], 1);
      const en0 = live.arm.encoders();
      hostRef.auto.observe([en0[0].angle, en0[1].angle, en0[0].speed * 1e3, en0[1].speed * 1e3,
        tau[0] * 1e3, tau[1] * 1e3]);
      if (kP % S === 0) {
        const tool = live.arm.toolXY();
        const sp = Math.hypot(cmd.vx, cmd.vy) || 1e-12;
        const tx = cmd.vx / sp, ty = cmd.vy / sp;
        const ex = tool[0] - cmd.x, ey = tool[1] - cmd.y;
        rows.push([lap, +(cmd.s.toFixed(4)), q1, q2, tx, ty, sp,
          (cmd.vx * cmd.ay - cmd.vy * cmd.ax) / (sp * sp * sp),
          rt.dq[0], rt.dq[1], rt.ddq[0], rt.ddq[1],
          live.arm.j1.windup(), live.arm.j2.windup(), tau[0], tau[1],
          -ex * ty + ey * tx, ex * tx + ey * ty]);
      }
      kP++;
    }
  }
  await live.l1.destroy(); await live.l2.destroy();
  data[feed] = { T, S, rows };
  console.log(`  feed ${feed}: ${rows.length} samples over ${LAPS} laps recorded`);
}
writeFileSync(OUT, JSON.stringify({ K, E, BACKLASH, sample: S,
  cols: ['lap', 's', 'q1', 'q2', 'tx', 'ty', 'sp', 'kap', 'dq1', 'dq2', 'ddq1', 'ddq2',
    'wu1', 'wu2', 'tau1', 'tau2', 'en', 'et'],
  feeds: data }));
console.log(`\n  records written to ${OUT}`);
console.log(`  total ${((Date.now() - T0) / 60000).toFixed(1)} min`);
