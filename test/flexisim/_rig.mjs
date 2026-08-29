/**
 * @file THE ARM RIG THE DIAGNOSTICS SHARE.
 *
 * Nine diagnostic scripts in this directory each carried their own copy of the same
 * machine: `machine()` eight times, `commissionComp()` eight, `settle()` seven, the lap DFT
 * five. Around eight hundred duplicated lines, and copies drift — two bugs in one afternoon
 * came straight out of it. `_gqchan` inherited a local named `g` that collided with the
 * gravity constant it also inherited, and `_gqxfer` announced itself as the file it was
 * copied from for its whole first run because the header came along with the code.
 *
 * A diagnostic is worth keeping only if the measurement it made can be reproduced, and that
 * is a reason to share the rig rather than to clone it: eight copies of a machine are eight
 * chances for one of them to stop being the machine everything else was measured on.
 */
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { RobotComp } from '../../lib/ngrc/robotcomp.js';

/** The arm `composite.test.mjs` and the autostack bar are measured on. */
export const RIG = { H: 4, nu: 0.3, rho: 1, CLAMP: 3, RATIO: 100, gravity: 2e-6,
  LEN1: 14, LEN2: 10, BACKLASH: 1e-4, DRIVE: 32 };

/** @param {{K?:number, E?:number}} [o] gearbox stiffness and link modulus */
export async function machine(o = {}) {
  const K = o.K ?? +(process.env.K || 1), E = o.E ?? +(process.env.E || 0.06);
  const mk = (length) => buildLink({ length, section: RIG.H, clamp: RIG.CLAMP, E,
    nu: RIG.nu, rho: RIG.rho, damping: 3e-3 });
  const l1 = await mk(RIG.LEN1), l2 = await mk(RIG.LEN2);
  const jt = (mp) => new Joint({ ratio: RIG.RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K, backlash: RIG.BACKLASH,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: jt(massProperties(l1)), link1: l1,
    joint2: jt(massProperties(l2)), link2: l2, gravityWorld: [0, -RIG.gravity, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RIG.RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: RIG.DRIVE * hold, speedMax: 0.2 });
  return { arm, l1, l2, servo, K, E };
}

/** Hold a pose until it stops moving. Rule 12: read the meter after it settles. */
export function settle(arm, servo, a, b, n = 4000) {
  arm.setPose(a, b);
  for (let i = 0; i < n; i++) {
    const t = servo.torques([{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }]);
    arm.step(t[0], t[1], 1);
  }
}

/** The conventional machine's own compliance, from four held poses. Always on: the baseline. */
export function commissionComp(arm, servo) {
  const rc = new RobotComp(2, 2, 1e6);
  for (const [a, b] of [[0.10, 0.30], [-0.05, 0.55], [0.25, 0.15], [0.00, 0.42]]) {
    settle(arm, servo, a, b);
    const refs = [{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }];
    rc.calibrate([[1, 0], [0, 1]], servo.jointTorques(refs),
      [arm.j1.windup(), arm.j2.windup()], 1.0);
  }
  return rc;
}

/** Direct DFT of one lap-length signal at harmonics 1..nh. */
export function projector(lap, nh) {
  return (sig) => {
    const re = new Float64Array(nh), im = new Float64Array(nh);
    for (let h = 1; h <= nh; h++) {
      let a = 0, b = 0;
      for (let k = 0; k < lap; k++) {
        const x = 2 * Math.PI * h * k / lap;
        a += sig[k] * Math.cos(x); b -= sig[k] * Math.sin(x);
      }
      re[h - 1] = 2 * a / lap; im[h - 1] = 2 * b / lap;
    }
    return { re, im };
  };
}

/** World tool error at a commanded pose, carried into joint space through J at that pose. */
export function toJoint(arm, q1, q2, ex, ey) {
  const J = arm.jacobian(q1, q2);
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  if (!(Math.abs(det) > 1e-12)) return [0, 0];
  return [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det];
}

/**
 * Ridge least squares by normal equations, with a RELATIVE ridge. Returns null on a system
 * it cannot trust rather than a fitted answer for a singular one — an absolute floor is how
 * an underdetermined probe design once produced a plausible operator and a worse machine.
 */
export function ridge(A, y, lam = 1e-6) {
  const n = A[0].length, m = A.length;
  const N = Array.from({ length: n }, () => new Float64Array(n));
  const b = new Float64Array(n);
  let tr = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) { let s = 0; for (let r = 0; r < m; r++) s += A[r][i] * A[r][j]; N[i][j] = s; }
    let s2 = 0; for (let r = 0; r < m; r++) s2 += A[r][i] * y[r];
    b[i] = s2; tr += N[i][i];
  }
  const rg = lam * tr / n;
  for (let i = 0; i < n; i++) N[i][i] += rg;
  const M = N.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-300)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return Array.from({ length: n }, (_, i) => M[i][n] / M[i][i]);
}
