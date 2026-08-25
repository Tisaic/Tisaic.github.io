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
// Above this many impulses AngleProfile tabulates one period instead of summing the
// list on every call. A ZVD is three; a jerk limit is hundreds.
const TABLE_ABOVE = 8;

/**
 * A NORMALISED BOXCAR, which is a JERK LIMIT: convolving a trapezoid's acceleration
 * with a boxcar of length W ramps that acceleration linearly over W steps, i.e. limits
 * the jerk to amax/W. It is the anti-slosh tab's S-curve, expressed in the impulse-list
 * form this module already uses for input shapers, so the two COMPOSE by convolution.
 *
 * WHY IT IS NEEDED HERE AND NOT ONLY FOR COMFORT: the quasi-static compensator's output
 * is proportional to the commanded ACCELERATION, and a trapezoid's acceleration is
 * piecewise CONSTANT -- so the pre-distortion it produces STEPS instantaneously at every
 * corner of the profile, and an input shaper triples the number of corners. Measured on
 * the shipped Move tab: the commanded motor's second difference was 0.297 of its own
 * spread, against 0.014 for the motor that actually moves and 0.002 for the reference.
 * That content is 500x faster than the servo's own time constant, so it cannot be
 * followed and can only be a torque spike into the PD loop.
 *
 * UNIT-SUM IS THE PROPERTY THAT MAKES IT FREE: the amplitudes sum to 1, so the move goes
 * exactly as far as it did -- it just takes W steps longer.
 */
export function boxcarShaper(width) {
  const n = Math.max(1, Math.round(width));
  return Array.from({ length: n }, (_, i) => [1 / n, i]);
}

/**
 * Convolve two impulse lists. Unit-sum in, unit-sum out, so composing a jerk limit with
 * a ZVD still ends the move exactly where the bare trapezoid did.
 */
export function convolveShapers(a, b) {
  if (!a) return b;
  if (!b) return a;
  const acc = new Map();
  for (const [ai, ad] of a) {
    for (const [bi, bd] of b) {
      const d = ad + bd;
      acc.set(d, (acc.get(d) || 0) + ai * bi);
    }
  }
  return [...acc.entries()].sort((x, y) => x[0] - y[0]).map(([d, amp]) => [amp, d]);
}

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
   *
   * A WIDE IMPULSE LIST IS TABULATED rather than summed per call. A jerk limit is a
   * boxcar of one impulse PER STEP, so an honest one is hundreds of impulses and the
   * per-call loop would be hundreds of evaluations inside the solver's inner loop --
   * and the profile is exactly periodic, so the table is not an approximation of the
   * sum, it IS the sum, computed once.
   */
  at(k) {
    if (!this.shaper) return this.raw(k);
    if (this.shaper.length > TABLE_ABOVE) {
      if (!this._tab) this._tabulate();
      const n = ((k % this.period) + this.period) % this.period;
      return { theta: this._tab[0][n], omega: this._tab[1][n], alpha: this._tab[2][n] };
    }
    let theta = 0, omega = 0, alpha = 0;
    for (const [amp, delay] of this.shaper) {
      const r = this.raw(k - delay);
      theta += amp * r.theta; omega += amp * r.omega; alpha += amp * r.alpha;
    }
    return { theta, omega, alpha };
  }

  _tabulate() {
    const P = this.period;
    const th = new Float64Array(P), om = new Float64Array(P), al = new Float64Array(P);
    for (const [amp, delay] of this.shaper) {
      for (let n = 0; n < P; n++) {
        const r = this.raw(n - delay);
        th[n] += amp * r.theta; om[n] += amp * r.omega; al[n] += amp * r.alpha;
      }
    }
    this._tab = [th, om, al];
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
 * A CONTINUOUS SINUSOIDAL reference: amplitude and frequency, in closed form.
 *
 * IT ANSWERS A DIFFERENT QUESTION FROM THE TRAPEZOID, which is why both ship. A
 * point-to-point move is what a machine does, and it excites the plant with a
 * broadband transient whose content depends on the ramp. A sinusoid excites it at
 * ONE frequency you choose, so sweeping the frequency is how the plant's response
 * is characterised -- and the interesting frequencies are the ones near the
 * gearbox resonance and the link's bending mode, where a compensator either helps
 * or makes things worse.
 *
 * Closed form rather than integrated, for the same reason AngleProfile is: the
 * reference is what every error is measured against, so it must not share the
 * plant's own integration error.
 *
 * @param {number} amplitude  peak angle, rad
 * @param {number} frequency  cycles per STEP (so 1/frequency is the period in steps)
 */
export class SineProfile {
  constructor({ amplitude = 0.05, frequency = 1 / 2000, shaper = null } = {}) {
    Object.assign(this, { amplitude, frequency, shaper });
    this.period = Math.max(1, Math.round(1 / frequency));
    this.span = 2 * amplitude;
    this.D = 0;
  }

  raw(k) {
    const w = 2 * Math.PI * this.frequency;
    const p = w * k;
    return { theta: this.amplitude * Math.sin(p),
      omega: this.amplitude * w * Math.cos(p),
      alpha: -this.amplitude * w * w * Math.sin(p) };
  }

  at(k) {
    if (!this.shaper) return this.raw(k);
    let theta = 0, omega = 0, alpha = 0;
    for (const [amp, delay] of this.shaper) {
      const r = this.raw(k - delay);
      theta += amp * r.theta; omega += amp * r.omega; alpha += amp * r.alpha;
    }
    return { theta, omega, alpha };
  }

  describe() {
    return `sine ${this.amplitude.toFixed(3)} rad at `
      + `${(1000 * this.frequency).toFixed(2)} cycles/1000 steps (period ${this.period})`;
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
/**
 * THE DRIVE'S TORQUE-SPEED ENVELOPE, which is the one mechanism that gives all three
 * limits a real motor has.
 *
 * A servo drive delivers at most its peak torque, and that ceiling FALLS as the motor
 * turns faster -- back-EMF eats the available voltage, so the classic envelope runs
 * linearly from tau_max at standstill to zero at the no-load speed. Modelling that one
 * curve gives the TORQUE limit directly, the ACCELERATION limit for free (alpha_max =
 * tau_avail * N / J_reflected), and the SPEED limit as the point where the envelope can
 * no longer overcome the load. Three limits from one curve, rather than three separate
 * clamps that could disagree with one another.
 *
 * @param {number} tauMax peak motor torque; 0 or less means an ideal (unlimited) drive
 * @param {number} speedMax no-load MOTOR speed, rad/step; 0 or less means no fade
 * @returns {number} the torque actually delivered
 */
export function driveEnvelope(tau, motorSpeed, tauMax, speedMax) {
  if (!(tauMax > 0)) return tau;
  let cap = tauMax;
  if (speedMax > 0) {
    // ONLY MOTION IN THE COMMANDED DIRECTION eats the envelope. Back-EMF opposes the
    // supply when the motor is already turning the way it is being pushed; braking a
    // fast motor is not limited the same way, and treating it as if it were would make
    // the drive unable to STOP, which is the opposite of a limit.
    const along = Math.sign(tau) * motorSpeed;
    cap = tauMax * (1 - Math.max(0, along) / speedMax);
    if (cap < 0) cap = 0;
  }
  return clip(tau, -cap, cap);
}

export class PositionServo {
  /**
   * @param {number} [tauMax] peak motor torque. 0 is an IDEAL drive, which is what this
   *   page shipped with and is not what a machine has.
   * @param {number} [speedMax] no-load motor speed, rad/step. 0 disables the fade.
   */
  constructor({ kp, kd, inertia, ratio, tauMax = 0, speedMax = 0, gravityTorque = null }) {
    Object.assign(this, { kp, kd, J: inertia, N: ratio, tauMax, speedMax,
      tauG: gravityTorque });
    this.resetLimitStats();
  }

  resetLimitStats() { this.steps = 0; this.saturated = 0; this.peakDemand = 0; return this; }

  /** What the drive was ASKED for, and how often it could not deliver it. */
  limitStats() {
    return { steps: this.steps, saturated: this.saturated,
      fraction: this.steps ? this.saturated / this.steps : 0, peakDemand: this.peakDemand,
      tauMax: this.tauMax, speedMax: this.speedMax };
  }

  /**
   * Motor-side commanded torque for a reference point and the encoder reading.
   *
   * @param {number|null} [ffOverride] use this feedforward instead of the built-in
   *   rigid model, leaving the PD loop untouched. That is the ONLY honest way to
   *   compare a hand-built feedforward against a learned one: change the
   *   feedforward and nothing else, so a difference in following error cannot be a
   *   difference in gains.
   */
  torque(ref, enc, ffOverride = null) {
    const load = this.tauG ? -this.tauG(ref.theta) : 0;   // joint.step's tauLoad sign
    const ff = ffOverride == null ? (this.J * ref.alpha + load) / this.N : ffOverride;
    const want = ff + this.kp * (ref.theta - enc.angle) + this.kd * (ref.omega - enc.speed);
    // enc.speed is the OUTPUT speed; the envelope is a property of the MOTOR, which
    // turns N times faster. Getting that wrong is wrong by a factor of 100 here.
    const tau = driveEnvelope(want, enc.speed * this.N, this.tauMax, this.speedMax);
    this.steps++;
    const abs = Math.abs(want);
    if (abs > this.peakDemand) this.peakDemand = abs;
    if (Math.abs(tau - want) > 1e-15 * Math.max(1, abs)) this.saturated++;
    return tau;
  }
}

/**
 * A COMPUTED-TORQUE servo for the two-link chain.
 *
 * PER-JOINT PD IS NOT ENOUGH ON A CHAIN and that is the point of having it here.
 * The inertia joint 1 must accelerate depends on the elbow angle by a factor of
 * two across the workspace, and accelerating either joint loads the other through
 * M's off-diagonal, so a fixed-gain per-joint loop is tuned for one pose and
 * fighting the plant everywhere else. Computed torque evaluates the arm's own
 * rigid model AT THE COMMANDED POSE -- the same discipline TipCompensator uses,
 * and for the same reason: a controller has the trajectory it generated, not a
 * measurement of where the tool actually is.
 *
 *   tau_joint = M(q_ref) alpha_ref + C(q_ref, omega_ref) - G(q_ref)
 *
 * with the sign of G following the plant's own convention (M qddot = tau + G - C).
 * The motor also has to accelerate ITSELF at N times the joint rate, which is the
 * N*J_m term -- at ratio 100 it is comparable to the whole link, so leaving it out
 * is not a refinement.
 *
 * WHAT IT DELIBERATELY DOES NOT MODEL is the gearbox compliance or either link's
 * flexibility. That is the whole subject of this tab: the model the controller has
 * is rigid, and everything the tool does that the rigid model cannot predict is
 * the error the soft sensor and the compensator exist for.
 */
export class ChainServo {
  /**
   * @param {FlexArm2R} arm
   * @param {number} [bandwidth] closed-loop rate in rad/step. Keep it well below
   *   the SLOWER gearbox resonance -- a position loop faster than the resonance it
   *   is acting through does not control the tool, it excites it.
   */
  /**
   * @param {function|null} [o.feedback] per-joint CORRECTION to the encoder reading, as
   *   `(arm) => [d0, d1]`, subtracted before the PD acts. Null keeps the ordinary
   *   motor-side loop, which is what every measurement on record used.
   *
   * WHY THIS EXISTS, AND WHY IT SHIPS OFF. The encoder sits on the MOTOR side of the
   * gearbox and is structurally blind to wind-up and link bending. Measured on the 2R arm
   * at the softest sliders, open loop, splitting the tool error into what the loop can see
   * and what it cannot:
   *
   *     servo bw   following (visible)   unobservable   total
   *       2e-3          0.253               1.232        1.129
   *       4e-3          0.111               1.363        1.116
   *       8e-3          0.042               1.434        1.112
   *
   * Raising the bandwidth drives the VISIBLE error down 6x, raises the invisible one, and
   * leaves the open-loop tool exactly where it was, because the invisible part already
   * dominates by 5x to 34x. THE OBVIOUS CONCLUSION FROM THAT TABLE -- that the fix is a
   * better feedback signal -- WAS WRITTEN HERE AND IS FALSE. This hook was added to test
   * it with an ORACLE, feeding the loop the joint's TRUE load angle, an estimate no real
   * machine has and no estimator can beat. Sharp square, mode 5, contour rms against the
   * pilot's own open loop:
   *
   *     servo bw   feedback      contour    vs open   unobservable   uPk   reversals
   *       1e-3     true load     2.830e-1    3.82x       1.220       0.75      18
   *       2e-3     ENCODER       2.657e-1    4.25x       1.232       1.05      36
   *       2e-3     true load     3.835e-1    3.01x       1.673       1.84      38
   *       4e-3     ENCODER       8.900e-1    1.25x       1.363       2.00     176
   *       4e-3     true load     3.272e+0    0.38x       2.260       2.00      76
   *
   * PERFECT LOAD-SIDE FEEDBACK MAKES THE MACHINE WORSE, and it does so BEFORE the pilot is
   * involved -- the open-loop unobservable term rises monotonically with the fraction fed
   * back (1.232 / 1.297 / 1.384 / 1.673 at 0, 0.25, 0.5, 1.0). The damage scales with loop
   * gain (3.82x / 3.01x / 0.38x as the bandwidth doubles twice) and halving the bandwidth
   * nearly recovers it, which is the NON-COLLOCATED signature: the encoder shares the
   * actuator's side of the gearbox compliance, so poles and zeros interlace and the loop
   * tolerates gain; move the sensor past the compliance and that interlacing is gone, and
   * past a bounded gain the loop drives the resonance instead of the tool.
   *
   * The information was never the bottleneck -- WHERE THE SENSOR SITS IS. A real tip
   * estimator (measured nRMSE 0.26 against the encoder-only 1.06) would be strictly worse
   * than this zero-error oracle, so none was built.
   *
   * AND RAISING THE BANDWIDTH ALONE IS ITS OWN TRAP: the row above at 4e-3 with the
   * ORDINARY encoder loop collapses the corrected contour 4.25x -> 1.25x, with the bias
   * all but gone (-0.019) and the oscillation exploded (0.890) at 176 reversals. Every
   * knob that buys authority here removes the bias and excites the mode. Keep the
   * bandwidth well below the slower gearbox resonance.
   */
  constructor({ arm, bandwidth = 2e-3, tauMax = 0, speedMax = 0, feedback = null }) {
    this.arm = arm;
    this.bw = bandwidth;
    this.feedback = feedback;
    this.tauMax = tauMax;
    this.speedMax = speedMax;
    this.resetLimitStats();
    this.retune();
  }

  resetLimitStats() {
    this.steps = 0; this.saturated = [0, 0]; this.peakDemand = [0, 0];
    return this;
  }

  /** Per joint: what the drive was asked for and how often it could not deliver it. */
  limitStats() {
    return [0, 1].map((i) => ({ steps: this.steps, saturated: this.saturated[i],
      fraction: this.steps ? this.saturated[i] / this.steps : 0,
      peakDemand: this.peakDemand[i], tauMax: this.tauMax, speedMax: this.speedMax }));
  }

  /** Gains from the CURRENT configuration's diagonal inertia plus the reflection. */
  retune() {
    const a = this.arm, M = a.massMatrix(0);
    this.gains = [0, 1].map((i) => {
      const j = i === 0 ? a.j1 : a.j2;
      const Jeff = M[i][i] + j.N * j.N * j.Jm;
      return { kp: this.bw * this.bw * Jeff / j.N, kd: 2 * this.bw * Jeff / j.N };
    });
    return this;
  }

  /**
   * The torque each GEARBOX has to transmit for the commanded motion: the rigid
   * model's M(q)a + C - G, evaluated at the COMMAND and at the command only.
   *
   * SPLIT OUT BECAUSE A COMPENSATOR NEEDS EXACTLY THIS NUMBER and would otherwise
   * recompute it from the same three terms -- two copies of one model is how the
   * feedforward and the correction end up disagreeing about the plant. The
   * REFLECTED motor inertia is deliberately not in it: that inertia sits upstream
   * of the gear teeth, so it never loads the gearbox and never winds it up, which
   * is the same distinction TipCompensator draws for a single joint.
   *
   * @param {Array<{theta:number,omega:number,alpha:number}>} refs one per joint
   * @returns {number[]} load-side joint torques
   */
  jointTorques(refs) {
    const a = this.arm;
    const q = [refs[0].theta, refs[1].theta];
    const w = [refs[0].omega, refs[1].omega];
    const al = [refs[0].alpha, refs[1].alpha];
    const M = a.massMatrix(q[1]);
    const v = a.velocityTorque(q, w);
    const g = a.gravityTorque(q);
    return [0, 1].map((i) => M[i][0] * al[0] + M[i][1] * al[1] + v[i] - g[i]);
  }

  /**
   * @param {Array<{theta:number,omega:number,alpha:number}>} refs one per joint
   * @returns {number[]} commanded MOTOR torques
   */
  torques(refs) {
    const a = this.arm;
    const tj = this.jointTorques(refs);
    const enc = a.encoders();
    // THE FEEDBACK MAY BE CORRECTED TOWARD THE LOAD. `d` is what the encoder over-reads:
    // the joint is really at `encoder - d`, so subtracting it makes the loop drive the
    // LINK to the reference instead of the motor.
    const d = this.feedback ? this.feedback(a) : null;
    const out = [];
    for (let i = 0; i < 2; i++) {
      const j = i === 0 ? a.j1 : a.j2;
      const ff = tj[i] / j.N + j.N * j.Jm * refs[i].alpha;
      const { kp, kd } = this.gains[i];
      const fb = d ? enc[i].angle - d[i] : enc[i].angle;
      const want = ff + kp * (refs[i].theta - fb)
        + kd * (refs[i].omega - enc[i].speed);
      // THE SAME ENVELOPE AS THE MOVE TAB'S, per joint. A chain whose shoulder drive is
      // ideal and whose elbow drive is not would be a machine nobody owns.
      const tau = driveEnvelope(want, enc[i].speed * j.N, this.tauMax, this.speedMax);
      const abs = Math.abs(want);
      if (abs > this.peakDemand[i]) this.peakDemand[i] = abs;
      if (Math.abs(tau - want) > 1e-15 * Math.max(1, abs)) this.saturated[i]++;
      out.push(tau);
    }
    this.steps++;
    return out;
  }

  /**
   * The tool offset the identified stiffnesses predict for the commanded motion,
   * each joint's wind-up levered by the distance from THAT joint to the tool.
   *
   * IT IS THE CHAIN'S VERSION OF TipCompensator, and it is a strictly bigger model
   * than ChainSensor.rigidEstimate: that one carries the inertial term alone, which
   * is ZERO-MEAN over an out-and-back move and therefore cannot touch a bias no
   * matter how right it is. Gravity is what makes a compliance model able to
   * correct anything at all in steady state.
   */
  toolOffset(refs) {
    const a = this.arm;
    const tj = this.jointTorques(refs);
    return -((tj[0] / a.j1.K0) * a.toolRadius() + (tj[1] / a.j2.K0) * a.L2);
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

// ---------------------------------------------------------------------------
// THE LEARNED DYNAMIC FEEDFORWARD.
//
// WHY A SCALAR CANNOT DO THIS, measured rather than assumed. `TipCompensator` maps
// one instant's commanded torque to one deflection, and even given the right LEAD
// that recovers only 1.28x of a 6.7x ceiling. The gap is the model's FORM: the
// pre-distortion that actually nulls the error is a FILTER over the command across
// the resonance period -- a shaper and a scalar gain are both special cases of one
// -- so the model has to see a WINDOW of the trajectory, not a sample of it.
//
// THE TRAJECTORY IS THE ONE SIGNAL A CONTROLLER ALWAYS HAS IN FULL, past and
// future alike, because it planned it. That is what makes this a production
// correction rather than a demonstration: the tracker is present to LEARN the map
// and gone forever afterwards, exactly the lifecycle TipSensor and PlanarComp use.
//
// TAPS SPAN -300 TO +1500 STEPS, which covers this plant's 500-step servo response
// and more than one 1011-step bending period. The negative tap is not decoration:
// the correction applied now must account for motion already under way.
export const FF_TAPS = [-300, -150, 0, 150, 300, 450, 600, 750, 900, 1050, 1200, 1500];

/**
 * One iterative-refinement update of a per-phase correction profile.
 *
 * THE LEAD IS THE WHOLE MECHANISM AND IT HAS AN INTERIOR OPTIMUM. Refining with no
 * lead DIVERGES -- the update reinforces the error it is trying to cancel, because
 * the plant answers a correction hundreds of steps after it is applied. Measured on
 * the shipped arm, best rms after 30 refinements: lead 260 -> 1.0x, 400 -> 2.8x,
 * 550 -> 6.7x, 700 -> 3.7x, 850 -> 1.4x. A peak with worse on BOTH sides is a phase
 * result; pure preview would be monotone.
 *
 * THE Q-FILTER IS NOT OPTIONAL EITHER. The update has gain at every frequency,
 * including the ones the plant cannot follow, and those are what blow up -- so the
 * profile is low-passed each pass, which is standard and is what makes this
 * converge instead of grinding itself into noise.
 *
 * @param {Float64Array} u   current profile, indexed by phase within the move
 * @param {Float64Array} e   tip tracking error measured over the last pass
 */
export function ilcRefine(u, e, { gain = 0.5, lead = 550, armLength = 1, smooth = 40 } = {}) {
  const P = u.length;
  const next = new Float64Array(P);
  for (let n = 0; n < P; n++) next[n] = u[n] - gain * e[(n + lead) % P] / armLength;
  if (smooth <= 0) return next;
  const out = new Float64Array(P);
  for (let n = 0; n < P; n++) {
    let a = 0;
    for (let j = -smooth; j <= smooth; j++) a += next[(n + j + P) % P];
    out[n] = a / (2 * smooth + 1);
  }
  return out;
}

/**
 * A ridge fit from the commanded trajectory's window to the pre-distortion.
 *
 * IT MUST BE TRAINED ON MORE THAN ONE MOVE, and that is the finding rather than a
 * caveat. Fitted to a SINGLE trajectory this reaches the iterative ceiling on that
 * move -- 5.83x, with a fit residual of 1.0% -- and is 0.24x, 1.17x and 0.05x on
 * moves it has not seen, i.e. up to twenty times WORSE than doing nothing. It
 * learned the trajectory, not the dynamics, which is brick 16's result in a new
 * place. Trained across three spans and ramp rates the held-out moves score AS WELL
 * AS the trained one (3.56x and 3.48x against 3.11x), and the trained move honestly
 * falls from 5.83x to 3.11x -- the price of serving many trajectories instead of
 * memorising one.
 */
export class LearnedFeedforward {
  constructor({ taps = FF_TAPS, ridge = 1e-6 } = {}) {
    this.taps = taps.slice();
    this.ridge = ridge;
    this.nf = 1 + 3 * this.taps.length;
    this.rows = [];
    this.targets = [];
    this.w = null;
    this.mu = null;
    this.sg = null;
  }

  /**
   * The commanded window at step k, as a feature vector.
   *
   * THE RATES ARE PRE-SCALED because theta runs ~1e-1 while alpha runs ~1e-6, and a
   * ridge applied to raw columns is a wildly different penalty on each. fit()
   * standardises properly on the collected rows; this only keeps the accumulation
   * away from the edge of f64 before it gets there.
   */
  features(profile, k) {
    const f = new Float64Array(this.nf);
    f[0] = 1;
    let i = 1;
    for (const t of this.taps) {
      const r = profile.at(k + t);
      f[i++] = r.theta;
      f[i++] = r.omega * 1e3;
      f[i++] = r.alpha * 1e6;
    }
    return f;
  }

  /** One training pair: the window at k, and the correction that belongs there. */
  observe(profile, k, u) {
    this.rows.push(this.features(profile, k));
    this.targets.push(u);
    return this;
  }

  /** Standardise on what was collected, then solve the ridge normal equations. */
  fit() {
    const n = this.nf, m = this.rows.length;
    if (m < n * 2) throw new Error(`LearnedFeedforward.fit: ${m} rows for ${n} features`);
    const mu = new Float64Array(n), sg = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      let a = 0;
      for (const r of this.rows) a += r[i];
      a /= m;
      let v = 0;
      for (const r of this.rows) v += (r[i] - a) * (r[i] - a);
      v = Math.sqrt(v / m);
      mu[i] = a; sg[i] = v < 1e-12 ? 1 : v;
    }
    sg[0] = 1;
    const A = Array.from({ length: n }, () => new Float64Array(n + 1));
    for (let r = 0; r < m; r++) {
      const z = new Float64Array(n);
      for (let i = 0; i < n; i++) z[i] = (this.rows[r][i] - mu[i]) / sg[i];
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) A[a][b] += z[a] * z[b];
        A[a][n] += z[a] * this.targets[r];
      }
    }
    for (let a = 0; a < n; a++) A[a][a] += this.ridge * m;
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]];
      const d = A[c][c] || 1e-300;
      for (let b = c; b <= n; b++) A[c][b] /= d;
      for (let r = 0; r < n; r++) {
        if (r === c || A[r][c] === 0) continue;
        const g = A[r][c];
        for (let b = c; b <= n; b++) A[r][b] -= g * A[c][b];
      }
    }
    this.w = A.map((r) => r[n]);
    this.mu = mu; this.sg = sg;
    return this;
  }

  get ready() { return this.w !== null; }

  /** The pre-distortion for step k of this profile. Command only; no plant read. */
  predict(profile, k) {
    if (!this.w) return 0;
    const f = this.features(profile, k);
    let s = 0;
    for (let i = 0; i < this.nf; i++) s += this.w[i] * ((f[i] - this.mu[i]) / this.sg[i]);
    return s;
  }

  status() {
    return { ready: this.ready, features: this.nf, taps: this.taps.length,
      rows: this.rows.length,
      norm: this.w ? Math.sqrt(this.w.reduce((s, x) => s + x * x, 0)) : 0 };
  }
}
