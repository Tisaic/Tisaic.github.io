// ACTIVE COMPENSATION: closing the loop on a tip the controller cannot see.
//
// Bricks 8 and 9 both ESTIMATED the tip error -- one as a black-box readout, one
// as a physical constant. Neither of them moved anything. This is the half that
// makes an estimate worth having: pre-distort the commanded motion by minus the
// predicted joint deflection so the tip lands where it was asked to.
//
// THE CORRECTION IS FEEDFORWARD, AND IT HAS TO BE. The laser tracker is a
// commissioning instrument: it is on the machine for an afternoon and gone for the
// rest of its life, so a correction computed from a measured tip error is not a
// correction that can ever run in production. What runs in production is a
// correction computed from the COMMANDED trajectory and a model identified while
// the tracker was there -- which is why the compliance had to be a number with a
// meaning (brick 9) rather than a fitted map: the model is evaluated at the
// command, not at anything measured.
//
// WHAT THE CONTROLLER LEGITIMATELY HAS, and nothing else is used here:
//   the commanded angle, rate and acceleration    (it generated them)
//   the rigid mass properties                     (CAD, or a load cell)
//   the identified compliance                     (commissioning)
//   the encoder                                   (for the servo loop only)
// The link angle, the wind-up and the tip are never read.

import { tipDeflection } from './link.js';

const clip = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));

/**
 * A point-to-point trapezoidal-velocity move in LOAD-side angle, alternating
 * direction, evaluated in closed form at any step.
 *
 * CLOSED FORM RATHER THAN AN INTEGRATOR, because the reference is what every
 * error below is measured against: a reference accumulated by the same explicit
 * stepping as the plant would share the plant's own integration error and hide it.
 * Alternating direction is kept from MoveProfile for the same reason it was there
 * -- backlash and friction are direction-dependent, and a one-way move never
 * crosses the dead band.
 */
export class AngleProfile {
  /**
   * @param {Array<[number,number]>} [shaper] input-shaper impulses, [amplitude,
   *   delay in steps]. The amplitudes must sum to 1, which is what makes the
   *   shaped move go exactly as far as the unshaped one -- the same property the
   *   anti-slosh tab's ZVD relies on, and the reason a shaper costs delay and
   *   nothing else. See zvShaper().
   */
  constructor({ span = 0.3, accelSteps = 200, cruiseSteps = 300, dwellSteps = 150,
                shaper = null } = {}) {
    const A = accelSteps, C = cruiseSteps;
    Object.assign(this, { span, A, C, D: dwellSteps, shaper });
    this.half = 2 * A + C + dwellSteps;
    this.period = 2 * this.half;
    // span = a A (A + C) fixes the peak acceleration from the distance.
    this.a = span / (A * (A + C));
  }

  /**
   * @returns {{theta:number, omega:number, alpha:number}} at step k, shaped if a
   * shaper was given. Convolution of a PERIODIC reference wraps, which is the
   * steady state of a repeating move rather than an approximation of it.
   */
  at(k) {
    if (!this.shaper) return this.raw(k);
    let theta = 0, omega = 0, alpha = 0;
    for (const [amp, delay] of this.shaper) {
      const r = this.raw(k - delay);
      theta += amp * r.theta; omega += amp * r.omega; alpha += amp * r.alpha;
    }
    return { theta, omega, alpha };
  }

  /** The unshaped trapezoid. */
  raw(k) {
    const { A, C, a, half } = this;
    const n = ((k % this.period) + this.period) % this.period;
    const s = n < half ? +1 : -1;
    const base = n < half ? 0 : this.span;      // the second half returns from span
    const t = n % half;
    let th, w, al;
    if (t < A) { al = a; w = a * t; th = 0.5 * a * t * t; }
    else if (t < A + C) { const u = t - A; al = 0; w = a * A; th = 0.5 * a * A * A + a * A * u; }
    else if (t < 2 * A + C) {
      const u = t - A - C;
      al = -a; w = a * (A - u);
      th = 0.5 * a * A * A + a * A * C + a * A * u - 0.5 * a * u * u;
    } else { al = 0; w = 0; th = a * A * (A + C); }
    return { theta: base + s * th, omega: s * w, alpha: s * al };
  }
}

/**
 * A two-impulse ZV shaper for a mode at (omega, zeta), in steps.
 *
 * IT IS THE SAME FAMILY THE ANTI-SLOSH TAB USES, applied to a different resonance
 * for the same reason: a shaper cancels by exact TIMING, so it needs the
 * frequency and it costs a fixed delay of half a damped period. ZV rather than
 * ZVD here because the mode's frequency is MEASURED on this very machine rather
 * than taken from a nominal fill -- ZVD buys robustness to a frequency error, and
 * the error is small.
 */
export function zvShaper(omega, zeta = 0) {
  const kappa = Math.exp(-zeta * Math.PI / Math.sqrt(1 - zeta * zeta));
  const Td = 2 * Math.PI / (omega * Math.sqrt(1 - zeta * zeta));
  return [[1 / (1 + kappa), 0], [kappa / (1 + kappa), Math.round(Td / 2)]];
}

/**
 * The three-impulse ZVD, which buys insensitivity to a frequency error with a
 * second half-period of delay.
 *
 * IT IS NOT AN UPGRADE, IT IS A TRADE, and this brick measures the price of both
 * ends. ZV's residual here is dominated ENTIRELY by how well the mode was
 * identified -- a 2.5% frequency error costs a factor of four in what is left --
 * so a shaper whose frequency comes from a fit on a noisy decay wants the robust
 * one, while a shaper on a mode you know exactly does not want to pay for the
 * extra delay. The anti-slosh tab reached ZVD from the same direction: its
 * frequency came from a nominal fill, so robustness was the whole point.
 */
export function zvdShaper(omega, zeta = 0) {
  const k = Math.exp(-zeta * Math.PI / Math.sqrt(1 - zeta * zeta));
  const Td = 2 * Math.PI / (omega * Math.sqrt(1 - zeta * zeta));
  const d = (1 + k) * (1 + k);
  return [[1 / d, 0], [2 * k / d, Math.round(Td / 2)], [k * k / d, Math.round(Td)]];
}

/**
 * A PD position loop on the ENCODER, with rigid-body feedforward -- the ordinary
 * industrial servo, and deliberately ordinary. The compensation this brick is
 * about is not a better controller; it is the same controller given a different
 * setpoint.
 *
 * The feedforward is (J_refl * alpha + tau_load) / N: the reflected inertia at the
 * output, divided by the ratio to reach the motor side. Getting N wrong here is
 * wrong by a factor of N^2 in the effective gain, which is the reason
 * Joint.reflectedInertia() exists rather than being written out at each use.
 */
export class PositionServo {
  constructor({ kp, kd, inertia, ratio, tauMax = 0, gravityTorque = null }) {
    Object.assign(this, { kp, kd, J: inertia, N: ratio, tauMax, tauG: gravityTorque });
  }

  /** Motor-side commanded torque for a reference point and the encoder reading. */
  torque(ref, enc) {
    const load = this.tauG ? -this.tauG(ref.theta) : 0;   // joint.step's tauLoad sign
    let tau = (this.J * ref.alpha + load) / this.N
      + this.kp * (ref.theta - enc.angle) + this.kd * (ref.omega - enc.speed);
    if (this.tauMax > 0) tau = clip(tau, -this.tauMax, this.tauMax);
    return tau;
  }
}

/**
 * The pre-distortion itself.
 *
 * THE MODEL IS EVALUATED AT THE COMMAND. tau_j is the torque the gearbox will have
 * to transmit to make the commanded motion happen -- the link's own inertia times
 * the commanded acceleration, plus the gravity torque at the commanded pose. The
 * REFLECTED motor inertia is deliberately NOT in it: that inertia sits UPSTREAM of
 * the gear teeth and its torque never crosses the flexible element, so including
 * it would inflate the predicted wind-up by (1 + N^2 J_m / J_l), which here is a
 * factor of two.
 *
 * The correction is delivered through RobotComp.feedforward(), so it inherits the
 * magnitude and slew limits that make applying one safe -- a compensator that can
 * command an unbounded offset when its model is wrong is a machine crash.
 */
export class TipCompensator {
  /**
   * @param {PlanarComp} comp      the identified compliance
   * @param {number} inertia       J_l, the LINK's inertia about the pivot
   * @param {function} gravityTorque  tau_G(theta), the rigid model
   * @param {object} [limits]      RobotComp CompLimits
   */
  constructor({ comp, inertia, gravityTorque, limits = {}, sign = -1 }) {
    Object.assign(this, { comp, Jl: inertia, tauG: gravityTorque, limits, sign });
    this.lastTau = 0;
    this.lastDq = 0;
  }

  /**
   * The load torque at the gearbox output for the commanded motion, IN THE SAME
   * SIGN CONVENTION THE CALIBRATION USED -- tau_G at rest, so that a compliance
   * identified from static pose touches (brick 9, where the regressor is the
   * gravity torque itself) can be applied here unchanged. The inertial term
   * SUBTRACTS because a positive commanded acceleration puts the Euler body force
   * -rho (alpha x r) on the same side as gravity does at theta = 0: the two loads
   * add, so in tau_G's convention the inertial contribution is -J_l alpha.
   */
  jointTorque(ref) { return this.tauG(ref.theta) - this.Jl * ref.alpha; }

  /**
   * Offset to ADD to the commanded angle. The sign is fixed by the plant, not
   * chosen: a deflection of +dq under load means the setpoint has to go -dq for
   * the tip to land on the reference, and getting it backwards does not degrade
   * the correction, it DOUBLES the error -- which is the cheapest possible test
   * that the sign is right and is asserted directly.
   */
  offset(ref) {
    const tau = this.jointTorque(ref);
    const { dq } = this.comp.correction(tau, { limits: this.limits });
    this.lastTau = tau; this.lastDq = dq[0];
    return this.sign * dq[0];
  }
}

/**
 * Fit a decaying sinusoid's frequency and damping ratio from a free-decay record.
 *
 * THE SHAPER NEEDS THE FREQUENCY, so the frequency has to come from somewhere, and
 * the closed form is not good enough here: Euler-Bernoulli gives 7.09e-3 rad/step
 * for this link against a measured 6.37e-3 -- 11% high, which is the shear and
 * rotary-inertia correction a stubby L/H = 4 section needs and the same reason
 * brick 3's cantilever check had to be Timoshenko. An 11% frequency error in a ZV
 * shaper leaves about a tenth of the vibration it was meant to cancel.
 *
 * So it is MEASURED on the machine, from a decay the commissioning routine excites
 * deliberately -- which is the same lesson the anti-slosh tab reached from the
 * other end: a well-controlled move leaves no wave to measure, so diagnosis needs
 * a move that is deliberately not well controlled.
 *
 * Zero crossings for the period (robust to amplitude), log decrement over the
 * half-cycle peaks for the damping.
 */
export function ringFit(x) {
  const cross = [];
  for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) cross.push(i);
  if (cross.length < 4) return null;
  const Td = 2 * (cross[cross.length - 1] - cross[0]) / (cross.length - 1);
  const omega = 2 * Math.PI / Td;
  // Peak magnitude in each half cycle, then a least-squares line through its log.
  const pk = [];
  for (let c = 1; c < cross.length; c++) {
    let m = 0;
    for (let i = cross[c - 1]; i < cross[c]; i++) m = Math.max(m, Math.abs(x[i]));
    if (m > 0) pk.push([cross[c - 1], Math.log(m)]);
  }
  if (pk.length < 3) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [a, b] of pk) { sx += a; sy += b; sxx += a * a; sxy += a * b; }
  const n = pk.length;
  const sigma = -(n * sxy - sx * sy) / (n * sxx - sx * sx);
  const zeta = sigma / Math.sqrt(sigma * sigma + omega * omega);
  return { omega, zeta, period: Td, peaks: n };
}

/**
 * Transverse tip position error against the REFERENCE, in lattice units.
 *
 * THIS IS THE ONLY HONEST METRIC FOR A COMPENSATOR, and it is not the one bricks
 * 7-9 used. `FlexArm.tipError()` reports the tip against where the ENCODER thinks
 * it is, which is what a soft sensor has to estimate. A compensator's job is to
 * put the tip where the PROGRAM asked, so it is scored against the commanded
 * angle -- and the whole mechanism of the correction is that those two references
 * stop coinciding the moment the setpoint is pre-distorted.
 */
export function tipTrackingError(arm, thetaRef) {
  return arm.Larm * (arm.joint.thL - thetaRef) + tipDeflection(arm.link);
}
