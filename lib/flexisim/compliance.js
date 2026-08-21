// The STRUCTURED rival to the black-box tip-error readout.
//
// TipSensor learns the tip ERROR: a map from motor-side signals to a number, with
// no commitment about why. This learns a physical CONSTANT instead -- the joint
// compliance c = 1/K -- inside a model whose structure is fixed by mechanics:
//
//     delta = J . diag(c) . J^T . W
//
// which for a planar single-joint arm at radius L is delta = L^2 c F = L c tau.
// It is linear in c, so one exact-RLS update per measured deflection recovers it,
// and that is exactly what lib/ngrc/robotcomp.js was written to do.
//
// WHY BOTHER, when the black box scores better in-distribution: a constant
// EXTRAPOLATES and a fitted map does not. A model that has learned 1/K predicts
// the deflection at a torque it has never seen, because the structure carries the
// proportionality; a readout fitted over one range of torques has to guess what
// happens outside it. That is the parametric-versus-hybrid contrast the anti-slosh
// tab draws, and it is falsifiable: train both in one regime and score them in
// another.
//
// AND IT CAN BE CHECKED AGAINST THE TRUTH. The learned parameter has a meaning, so
// it can be compared with the K the plant was built with. A black-box readout
// offers no such number -- there is nothing in it to be right or wrong about
// except the output. That is the strongest single argument for structure and it is
// asserted directly.

import { RobotComp } from '../ngrc/robotcomp.js';

export class PlanarComp {
  /**
   * @param {number} armLength  pivot-to-tip radius, lattice units
   * @param {number} [initVariance] prior variance on c, and it must be WEAK. c =
   *   1/K spans decades across real drives, so a prior tight enough to be
   *   informative about one gearbox is wrong about the next -- and there is a
   *   sharper reason here. The regressor is L*tau, which in lattice units is ~0.06,
   *   so one sample carries information r = P0*x^2. At RobotComp's default P0 =
   *   1e-6 that is 4e-9 and the posterior does not move at all; at P0 = 1 it is
   *   0.004 and five static poses recovered c = 0.0399 against a true 2.5, which
   *   reads exactly like a broken fit and is a prior that was never given a chance
   *   to update. At 1e6 the same five poses identify it to the digit. THE PRIOR
   *   HAS TO BE WEAK RELATIVE TO THE REGRESSOR'S SCALE, not weak in the abstract.
   */
  constructor(armLength, initVariance = 1e6) {
    this.L = armLength;
    this.rc = new RobotComp(1, 1, initVariance);
  }

  /** jac and wrench in RobotComp's form, from a joint torque. */
  _asWrench(tauJoint) {
    // g = J^T W must equal tau, and J = [L], so W = tau / L.
    return { jac: [[this.L]], wrench: [tauJoint / this.L] };
  }

  /**
   * One commissioning sample: a joint torque and the tip deflection a tracker
   * measured while it was applied.
   */
  calibrate(tauJoint, tipDeflection, lam = 1.0) {
    const { jac, wrench } = this._asWrench(tauJoint);
    this.rc.calibrate(jac, wrench, [tipDeflection], lam);
    return this;
  }

  /** Predicted tip deflection for a joint torque. Production: no tracker needed. */
  estimate(tauJoint) {
    const { jac, wrench } = this._asWrench(tauJoint);
    const g = this.rc.jointTorque(jac, wrench);
    return jac[0][0] * this.rc.compliance[0] * g[0];
  }

  /**
   * The pre-distortion a compensator would apply: move the command by -dq so the
   * tip lands where it was asked to. This is the half TipSensor does not have --
   * an ESTIMATE of the error is not a correction for it, and RobotComp carries the
   * magnitude and slew limits that make applying one safe.
   */
  correction(tauJoint, opts = {}) {
    const { jac, wrench } = this._asWrench(tauJoint);
    return this.rc.feedforward(jac, wrench, opts);
  }

  get compliance() { return this.rc.compliance[0]; }
  get stiffness() { return this.rc.stiffness[0]; }
}
