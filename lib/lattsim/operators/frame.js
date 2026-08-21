// NonInertialFrameOperator -- gravity and the fictitious forces a moving frame
// requires, written into the shared body-force field.
//
// WHY THIS EXISTS, and it is the direct consequence of a memory decision. A
// serial arm's swept bounding box is ~99% air, so FlexiSim gives each link its
// own small dense lattice in that link's OWN body frame and carries the joint
// rotation as a transform between them -- ~240 MiB dense against ~2.3 MiB, and
// none of an index list's indirection. The price is that a body frame on a moving
// link is NON-INERTIAL, and Newton's laws do not hold in it unless the fictitious
// forces are put back by hand:
//
//   rho dv/dt = div sigma + rho[ g - a0 - alpha x r - Omega x (Omega x r)
//                                  - 2 Omega x v ]
//
//   a0                        the frame origin's own linear acceleration
//   alpha x r                 Euler, from angular ACCELERATION
//   Omega x (Omega x r)       centrifugal, from angular VELOCITY
//   2 Omega x v               Coriolis, from motion WITHIN the frame
//
// They are all local per-cell body forces, structurally identical to gravity, so
// they are cheap. What they are not is optional: a missing term yields a
// plausible wrong answer rather than an error, which is why each one here has a
// closed form attached to it in test/lattsim/elastic.test.mjs.
//
// NOTE ON LARGE ROTATION. The usual companion to this is a CO-ROTATIONAL
// formulation, needed because a body that merely swings must not develop stress.
// Per-link body frames make that unnecessary rather than solving it: a link
// rotating rigidly is STATIONARY in its own frame, so there is no large rotation
// inside any lattice and no rotated strain measure to get wrong. The rotation
// lives entirely in the transform between frames. That is a real simplification
// and it is worth stating, because "we did not need the co-rotational terms"
// reads like an omission unless the reason is written down.
//
// COMPOSITION. This operator WRITES the force field and READS the velocity (for
// Coriolis); the elastic operator READS the force field. Add it BEFORE the
// elastic operator and the solver's own write-discipline check does the rest --
// nothing else writes `force`, so the coupling is declared rather than implied.

import { PhysicsOperator } from '../operator.js';

const ZERO = Object.freeze([0, 0, 0]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export class NonInertialFrameOperator extends PhysicsOperator {
  /**
   * Everything is in the FRAME's own coordinates and in lattice units.
   *
   * @param {object} o
   * @param {number[]} [o.gravity]      g, already rotated into frame coordinates
   * @param {number[]} [o.omega]        Omega, frame angular velocity (rad/step)
   * @param {number[]} [o.alpha]        frame angular acceleration (rad/step^2)
   * @param {number[]} [o.originAccel]  a0, frame origin's linear acceleration
   * @param {number[]} [o.pivot]        rotation centre, LATTICE coordinates. It
   *   is a position and not an offset, because every fictitious term that
   *   involves r measures it from the axis -- and a pivot silently left at the
   *   lattice origin is the sort of error that produces a believable field.
   * @param {number} [o.rho]            density; the field is force per unit
   *   volume, so every term is multiplied by it. Must match the elastic
   *   operator's rho -- mismatching them is a physics error with no symptom
   *   other than a wrong answer, so it is checked at build time.
   * @param {boolean} [o.coriolis]      include -2 Omega x v. Default true when
   *   omega is non-zero. Separable ON PURPOSE: Coriolis is the only term that
   *   depends on the state rather than the position, so being able to turn it
   *   off alone is what lets a test attribute a discrepancy to it.
   */
  constructor({ gravity = ZERO, omega = ZERO, alpha = ZERO, originAccel = ZERO,
                pivot = ZERO, rho = 1, coriolis = null,
                velocity = 'vel', force = 'force', name = 'non-inertial frame' } = {}) {
    for (const [k, v] of Object.entries({ gravity, omega, alpha, originAccel, pivot })) {
      if (!Array.isArray(v) || v.length !== 3 || v.some((c) => !Number.isFinite(c))) {
        throw new Error(`${k} must be three finite numbers`);
      }
    }
    if (!(rho > 0)) throw new Error('density must be > 0');
    const spinning = omega.some((c) => c !== 0);
    super({
      type: 'frame.noninertial',
      name,
      reads: [velocity],
      writes: [force],
      params: {
        gravity: gravity.slice(), omega: omega.slice(), alpha: alpha.slice(),
        originAccel: originAccel.slice(), pivot: pivot.slice(), rho,
        coriolis: coriolis == null ? spinning : !!coriolis,
      },
    });
    this.velocityField = velocity;
    this.forceField = force;
  }

  /**
   * The force field is declared by the elastic operator (which owns it and reads
   * it), so this one declares nothing -- and says so, because an operator with an
   * empty declareFields() otherwise looks like an oversight.
   */
  declareFields(_fields) {}

  /** Centrifugal acceleration at a point, for a test to check a single cell. */
  centrifugalAt(r) {
    const { omega } = this.params;
    const c = cross(omega, cross(omega, r));
    return [-c[0], -c[1], -c[2]];
  }

  /**
   * The specific force (acceleration) at a position, excluding Coriolis, which
   * needs the local velocity. Exposed so the closed-form tests can compare
   * against the same expression the kernel uses rather than a re-derivation --
   * a re-derivation would be testing my algebra twice rather than the kernel.
   */
  specificForceAt(r) {
    const { gravity, alpha, originAccel } = this.params;
    const e = cross(alpha, r);
    const c = cross(this.params.omega, cross(this.params.omega, r));
    return [
      gravity[0] - originAccel[0] - e[0] - c[0],
      gravity[1] - originAccel[1] - e[1] - c[1],
      gravity[2] - originAccel[2] - e[2] - c[2],
    ];
  }

  describe() {
    const p = this.params;
    const on = [];
    if (p.gravity.some((c) => c)) on.push('gravity');
    if (p.originAccel.some((c) => c)) on.push('frame accel');
    if (p.alpha.some((c) => c)) on.push('Euler');
    if (p.omega.some((c) => c)) on.push('centrifugal');
    if (p.coriolis && p.omega.some((c) => c)) on.push('Coriolis');
    return `${this.name} [${on.join(', ') || 'inertial — no terms active'}]`;
  }
}
