/**
 * @file THE BENCH MACHINE — the compliant 2R arm, its conventional control, and its programs.
 *
 * One definition, imported by the FlexiSim page and by the Node plant library, so the machine on
 * screen and the machine the tests commission are the same machine by construction.
 *
 * The arm is two lattice-elastic links on geared joints with backlash, driven by a joint position
 * servo (`ChainServo`) with a torque limit. Its CONVENTIONAL CONTROL — what the machine has before
 * FB_AutoFF is fitted — is that servo plus a compliance feedforward identified at four held poses
 * (`RobotComp`). The conventional machine follows a JOINT SETPOINT stream; its rate terms are the
 * setpoint's own differences, as a drive's interpolator derives them, so a trimmed setpoint and a
 * program setpoint are treated identically.
 *
 * The bench cell is K 0.25 / E 0.03 on the sharp square at feed 3e-3, the fastest the page offers:
 * the softest settings and the hardest program.
 */
import { Joint } from './joint.js';
import { buildLink, massProperties } from './link.js';
import { FlexArm2R, snapshotArm, restoreArm } from './arm2r.js';
import { ChainServo, BENCH_SERVO, bandwidthFor } from './compensator.js';
import { roundedRect, sharpRect, circle } from './toolpath.js';
import { driveTo } from './approach.js';
import { RobotComp } from '../ngrc/robotcomp.js';

export const BENCH = {
  H: 4, CLAMP: 3, NU: 0.3, RHO: 1, G: 2e-6, RATIO: 100, DAMPING: 3e-3, NO_LOAD_SPEED: 0.2,
  BACKLASH: 1e-4, LEN1: 14, LEN2: 10, centre: [12, 0], drive: BENCH_SERVO.drive, ACCEL: 4e-5, CORNER: 40,
  K: 0.25, E: 0.03, feed: 3e-3, shape: 'sharp',
};

/** Build the arm and its servo. `carry` (from `snapshotArm`) starts it in another arm's state. */
export async function buildArm(K = BENCH.K, E = BENCH.E, carry = null) {
  const mk = (length) => buildLink({ length, section: BENCH.H, clamp: BENCH.CLAMP, E, nu: BENCH.NU,
    rho: BENCH.RHO, damping: BENCH.DAMPING });
  const l1 = await mk(BENCH.LEN1), l2 = await mk(BENCH.LEN2);
  const j = (mp) => new Joint({ ratio: BENCH.RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K, backlash: BENCH.BACKLASH,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: j(massProperties(l1)), link1: l1,
    joint2: j(massProperties(l2)), link2: l2, gravityWorld: [0, -BENCH.G, 0], dt: 1 });
  arm.K = K; arm.E = E;
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / BENCH.RATIO;
  const servo = new ChainServo({ arm, bandwidth: bandwidthFor(arm), tauMax: BENCH.drive * hold,
    speedMax: BENCH.NO_LOAD_SPEED });
  const m = { arm, servo, l1, l2 };
  if (carry) restoreArm(carry, m);
  return m;
}
export { snapshotArm };

/** The conventional compliance feedforward, identified with the arm DRIVEN to four held poses. */
export async function calibrateComp(m, feed = BENCH.feed, onYield = null) {
  const comp = new RobotComp(2, 2, 1e6);
  for (const [a, b] of [[0.10, 0.30], [-0.05, 0.55], [0.25, 0.15], [0.00, 0.42]]) {
    await driveTo(m.arm, m.servo, [a, b], feed, onYield ? { yieldEvery: 200, onYield } : {});
    const refs = [{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }];
    comp.calibrate([[1, 0], [0, 1]], m.servo.jointTorques(refs), [m.arm.j1.windup(), m.arm.j2.windup()], 1.0);
  }
  return comp;
}

/** A tool path: 'sharp' (the bench program), 'rounded' or 'circle'. */
export function benchPath(shape = BENCH.shape, feed = BENCH.feed) {
  const o = { feed, accel: BENCH.ACCEL, cornerDt: BENCH.CORNER, centre: BENCH.centre };
  if (shape === 'circle') return circle({ ...o, r: 4 });
  if (shape === 'rounded') return roundedRect({ ...o, w: 8, h: 8, r: 1.5, closed: true });
  return sharpRect({ ...o, w: 8, h: 8 });
}

/** Inverse kinematics from the link lengths alone (elbow up), so a program needs no live arm. */
export function ikOf(L1, L2) {
  return (x, y) => {
    const c2 = (x * x + y * y - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    const q2 = Math.acos(Math.max(-1, Math.min(1, c2)));
    return [Math.atan2(y, x) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2)), q2];
  };
}

/**
 * A tool path as a JOINT program with a whole number of scans per lap: `lap = ceil(path.lap)`,
 * and step k reads the path at k·path.lap/lap (a retiming of under 1e-4). Tabulated once, so a
 * preview of a thousand scans costs a thousand reads and not a thousand inverse kinematics.
 */
export function jointProgram(path, ik) {
  const lap = Math.ceil(path.lap), s = path.lap / lap;
  const q = new Float64Array(2 * lap), xy = new Float64Array(2 * lap), arc = new Float64Array(lap);
  for (let k = 0; k < lap; k++) {
    const c = path.at(k * s);
    const j = ik(c.x, c.y);
    q[2 * k] = j[0]; q[2 * k + 1] = j[1]; xy[2 * k] = c.x; xy[2 * k + 1] = c.y; arc[k] = c.s;
  }
  const w = (k) => (((k % lap) + lap) % lap);
  return {
    lap, path,
    at: (k) => { const i = w(k); return [q[2 * i], q[2 * i + 1]]; },
    /** The commanded tool state at step k, as `decompose` reads it. */
    cmd: (k) => { const i = w(k); return { x: xy[2 * i], y: xy[2 * i + 1], s: arc[i] }; },
  };
}

/**
 * The conventional machine following a joint setpoint stream. `step(sp)` advances one scan.
 * `reset(sp)` makes the rate history consistent with holding `sp` (after a move or a restart).
 */
export function conventional(m, rc) {
  const { arm, servo } = m;
  let p1 = [arm.q[0], arm.q[1]], w1 = [0, 0];
  const J = [[1, 0], [0, 1]];
  return {
    arm, servo,
    reset(sp) { p1 = [sp[0], sp[1]]; w1 = [0, 0]; },
    step(sp) {
      const w = [sp[0] - p1[0], sp[1] - p1[1]];
      const refs = [{ theta: sp[0], omega: w[0], alpha: w[0] - w1[0] }, { theta: sp[1], omega: w[1], alpha: w[1] - w1[1] }];
      const dq = rc.feedforward(J, servo.jointTorques(refs), { enableToolff: false }).dq;
      const tau = servo.torques([{ ...refs[0], theta: sp[0] + dq[0] }, { ...refs[1], theta: sp[1] + dq[1] }]);
      arm.step(tau[0], tau[1], 1);
      p1 = [sp[0], sp[1]]; w1 = w;
      return tau;
    },
  };
}
