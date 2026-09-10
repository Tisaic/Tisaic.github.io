/**
 * NOT A TEST — WHAT DOES A CHEAPER COMMISSIONING INSTRUMENT ACTUALLY SEE? (plan §52.42)
 *
 * Every number in this project is obtained with GROUND-TRUTH TOOL POSITION available while
 * commissioning: a laser tracker, a ballbar or an instrumented artefact. §50.1 priced a
 * DEGRADED ideal truth (noise on the tool) and found it costs ~2x. Nobody has priced a
 * CHEAPER one — the instruments a shop already owns.
 *
 * This is the cheapest thing that can falsify "the tracker is needed" (rule 1): before
 * spending a commissioning per instrument, run the CONVENTIONAL machine on the bench square
 * and ask what each candidate instrument reads against what the tracker reads. An instrument
 * that is uncorrelated with the tool error cannot teach a correction of it at any gain, and
 * one that reads it at 0.99 makes the tracker optional before any controller is fitted.
 *
 * The instruments, in the order a customer meets them:
 *   encoder  the motor encoders and a RIGID model — `toolXY(true)`, free on every machine
 *            that has a position loop, blind to both the gearbox wind-up and the link bend.
 *   wu       the encoders corrected by wind-up readings, links still rigid — a permanently
 *            mounted instrument set, and the half §52.23 measured as observable.
 *   bend     the encoders plus strain gauges, gearbox NOT instrumented — the other half.
 *   tracker  where the tool actually is. What every number here assumes.
 *
 * Reported per channel in the JOINT frame the teacher corrects in, because that is the frame
 * the error is used in and a world-frame agreement can hide a projection fault (rule 47).
 */
import { machine, commissionComp, settle } from '../flexisim/_rig.mjs';
import { sharpRect } from '../../lib/flexisim/toolpath.js';
import { tipDeflection, tipSlope } from '../../lib/flexisim/link.js';

const K = +(process.env.ARM_K || 0.25), E = +(process.env.ARM_E || 0.03);
const F = +(process.env.FEED || 4e-3);
const path = sharpRect({ w: 8, h: 8, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40 });
const L = Math.ceil(path.lap);
const LAPS = +(process.env.LAPS || 3);
const FF = process.env.FF !== '0';

const m = await machine({ K, E });
const { arm, servo } = m;
const rc = commissionComp(arm, servo);
const c0 = path.at(0); const [s1, s2] = arm.ik(c0.x, c0.y, true);
settle(arm, servo, s1, s2);

/** Rigid forward kinematics from a pair of angles — the model every instrument shares. */
const fk = (q1, q2) => [Math.cos(q1) * arm.L1 + Math.cos(q1 + q2) * arm.L2,
  Math.sin(q1) * arm.L1 + Math.sin(q1 + q2) * arm.L2];

/** The tool position each instrument would report, at this instant. */
const READ = {
  encoder: () => arm.toolXY(true),
  wu: () => fk(arm.j1.encoder().angle - arm.j1.windup(), arm.j2.encoder().angle - arm.j2.windup()),
  bend: () => {
    // Encoders (so the wind-up is NOT seen) with the links' measured deflection applied —
    // the same first-order assembly `toolXY` uses, so only the angle source differs.
    const q1 = arm.j1.encoder().angle, q2 = arm.j2.encoder().angle;
    const w1 = tipDeflection(arm.l1), w2 = tipDeflection(arm.l2), sl = tipSlope(arm.l1);
    const c1 = Math.cos(q1), n1 = Math.sin(q1);
    const ex = c1 * arm.L1 - n1 * w1, ey = n1 * arm.L1 + c1 * w1;
    const a2 = q1 + sl + q2, c2 = Math.cos(a2), n2 = Math.sin(a2);
    return [ex + c2 * arm.L2 - n2 * w2, ey + n2 * arm.L2 + c2 * w2];
  },
  tracker: () => arm.toolXY(),
};
const NAMES = Object.keys(READ);

/**
 * World error to the JOINT frame the teacher corrects in. THE SAME CONSTRUCTION `makeArmHost`
 * USES — the Jacobian inverse at the live pose — and not the transverse-lever projection that
 * `tipError` uses, because the quantity being compared here is the one the teacher inverts and
 * a second projection would make this a comparison of two frames (rules 47, 61).
 */
const toJoint = (ex, ey, q1, q2) => {
  const J = arm.jacobian(q1, q2);
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  if (!(Math.abs(det) > 1e-12)) return [0, 0];
  return [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det];
};

// Accumulators: per instrument, per channel — xy, xx, yy against the tracker.
const acc = {};
for (const n of NAMES) acc[n] = [0, 1].map(() => ({ xy: 0, xx: 0, yy: 0, n: 0, d2: 0 }));

for (let l = 0; l < LAPS; l++) {
  for (let k = 0; k < L; k++) {
    const c = path.at(k);
    const [q1r, q2r] = arm.ik(c.x, c.y, true);
    const rates = arm.ikRates(q1r, q2r, c.vx, c.vy, c.ax, c.ay);
    const base = [{ theta: q1r, omega: rates.dq[0], alpha: rates.ddq[0] },
      { theta: q2r, omega: rates.dq[1], alpha: rates.ddq[1] }];
    // FF=0: the BARE machine, no compliance feedforward. The control for the sign of the
    // encoder's reading — a feedforward that pre-distorts the command drives the encoder
    // AWAY from the geometric reference by the deflection it predicts, so the encoder's error
    // is minus that prediction while the tool's is what the prediction MISSED.
    const ff = FF ? rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base), { enableToolff: false })
      : { dq: [0, 0] };
    const tau = servo.torques([{ ...base[0], theta: q1r + ff.dq[0] }, { ...base[1], theta: q2r + ff.dq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (l < LAPS - 1) continue;                       // rule 12: read after it settles
    const q = [arm.q[0], arm.q[1]];
    const ref = READ.tracker();
    const jt = toJoint(ref[0] - c.x, ref[1] - c.y, q[0], q[1]);
    for (const n of NAMES) {
      const p = READ[n]();
      const je = toJoint(p[0] - c.x, p[1] - c.y, q[0], q[1]);
      for (let ch = 0; ch < 2; ch++) {
        const a = acc[n][ch];
        a.xy += je[ch] * jt[ch]; a.xx += je[ch] * je[ch]; a.yy += jt[ch] * jt[ch];
        a.d2 += (je[ch] - jt[ch]) ** 2; a.n++;
      }
    }
  }
}

console.log(`\nWHAT A CHEAPER COMMISSIONING INSTRUMENT SEES — K ${K} / E ${E}, sharp square, feed ${F.toExponential(1)}`);
console.log(`the ${FF ? 'CONVENTIONAL' : 'BARE'} machine, ${LAPS} laps, last one read; joint frame, against the tracker`);
console.log(`the tracker's own joint-frame rms: ${acc.tracker.map((a) => Math.sqrt(a.yy / a.n).toExponential(3)).join(' / ')} rad\n`);
console.log('  instrument   ch   corr     rms/tracker   residual/tracker');
for (const n of NAMES) {
  for (let ch = 0; ch < 2; ch++) {
    const a = acc[n][ch];
    const corr = a.xy / Math.sqrt(Math.max(1e-300, a.xx * a.yy));
    const ratio = Math.sqrt(a.xx / Math.max(1e-300, a.yy));
    const resid = Math.sqrt(a.d2 / Math.max(1e-300, a.yy));
    console.log(`  ${n.padEnd(10)}   ${ch}   ${corr.toFixed(4).padStart(7)}   ${ratio.toFixed(4).padStart(11)}   ${resid.toFixed(4).padStart(16)}`);
  }
}
console.log(`
  corr             how much of the tool error's SHAPE the instrument carries. A teacher
                   inverts the error it is shown, so an instrument at 0.5 teaches half a
                   correction and half a different one.
  rms/tracker      its scale. Below 1 the teacher under-corrects; above 1 it over-corrects.
  residual/tracker what the instrument does NOT see, as a fraction of the error. This is the
                   floor on what a correction taught from it can remove — 1.0 means the
                   instrument is worth nothing, 0.0 means it is the tracker.`);
