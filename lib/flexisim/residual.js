/**
 * @file THE LEARNED RESIDUAL ON TOP OF A CONVENTIONAL CONTROLLER, and the switch that
 * decides WHERE its answer is injected.
 *
 * Every headline number this project has published for a learned correction was measured
 * against an OPEN LOOP with no feedforward at all, and nobody ships that. This block
 * exists to be bolted onto a properly commissioned conventional machine -- computed
 * torque, friction feedforward, input shaping, static compliance pre-distortion -- so the
 * question becomes the one a plant actually asks: what is LEFT after good classical
 * control, and is the remainder worth a learner?
 *
 * THE INJECTION DOMAIN IS A PARAMETER BECAUSE IT IS THE EXPERIMENT, not because the
 * answer is unknown in general.
 *
 *   'torque'   an additive joint torque. This is the anti-slosh tab's HYBRID: the shipped
 *              controller completely untouched, a learned trim added on top -- the
 *              configuration available when the loop cannot be recertified. Measured there
 *              at 0.305 -> 0.213 mm residual wave. It absorbs things no term in the
 *              structure can express at any coefficient: cogging as a function of position,
 *              the Stribeck curve's shape, a frozen calibration offset.
 *
 *   'position' a pre-distortion of the COMMANDED angle, which is what TipCompensator does
 *              (bias removed 273x) and what the pilot does. For a compliance error this is
 *              the right domain and torque is not: the wind-up delta = c*tau is set by the
 *              load the LINK demands, so adding motor torque changes how well the motor
 *              tracks its own reference and does not move where the tool lands. To put the
 *              tool somewhere else you must send the motor somewhere else.
 *
 * WHICH ONE WINS IS A PROPERTY OF THE PLANT, AND MEASURABLE. On the 2R arm at its softest
 * the open-loop error splits 0.253 following (what the loop sees) against 1.232
 * unobservable (wind-up and bending) -- 5:1 toward the term only a POSITION offset can
 * reach. As the gearbox stiffens that term collapses (1.129 -> 0.171 total) and what is
 * left is friction and cogging, which live in TORQUE. So the prediction is that 'position'
 * wins soft, they converge stiff, and the crossover is worth knowing rather than assuming.
 *
 * NEITHER IS FEEDBACK, WHICH IS THE POINT. Both are evaluated from the COMMAND and the
 * model's own estimate, and neither closes a loop around a measured signal. That
 * distinction is not stylistic: fed the TRUE load angle -- a perfect estimate, better than
 * any estimator can be -- a servo loop closed around it got WORSE, monotonically in both
 * the fraction fed back and the loop gain, because the sensor moves to the far side of the
 * compliance and the pole-zero interlacing that lets a loop take gain is lost. A
 * feedforward trim adds no poles and cannot ring. It can be wrong; it cannot destabilise.
 */

const clip = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));

export class ResidualTrim {
  /**
   * @param {object} o
   * @param {'torque'|'position'} [o.domain] where the output lands. Default 'position'.
   * @param {number} [o.gain] scales the trim; 0 is OFF and is the live A/B.
   * @param {number} [o.magMax] magnitude limit, in the domain's own units. 0 disables.
   * @param {number} [o.rateMax] slew limit per call. 0 disables.
   * @param {number} [o.joints] channel count.
   */
  constructor({ domain = 'position', gain = 1, magMax = 0, rateMax = 0, joints = 2 } = {}) {
    this.domain = domain;
    this.gain = gain;
    this.magMax = magMax;
    this.rateMax = rateMax;
    this.nj = joints;
    this.last = new Array(joints).fill(0);
    this.peak = 0;
  }

  /** Live A/B without rebuilding anything, so one machine and one lap serve both arms. */
  setEnabled(on) { this.gain = on ? 1 : 0; return this; }

  /** @returns {boolean} */
  get enabled() { return this.gain !== 0; }

  /**
   * Turn the estimator's answer into an injection.
   *
   * @param {number[]} estimate  per-joint tip-error contribution, in the SENSOR's units
   * @param {number[]} [scale]   per-joint conversion into the domain's units. For
   *   'position' this is the lever arm that maps a tip error back to a joint angle; for
   *   'torque' it is the stiffness that maps a wanted deflection to the torque holding it.
   *   THE CONVERSION IS THE CALLER'S because only the caller knows the geometry, and a
   *   block that guessed it would be carrying a second copy of the arm's model.
   * @returns {number[]} the injection, limited
   */
  apply(estimate, scale = null) {
    const out = new Array(this.nj);
    for (let j = 0; j < this.nj; j++) {
      let v = this.gain * (estimate[j] || 0) * (scale ? scale[j] : 1);
      if (!Number.isFinite(v)) v = 0;
      if (this.magMax > 0) v = clip(v, -this.magMax, this.magMax);
      if (this.rateMax > 0) v = clip(v, this.last[j] - this.rateMax, this.last[j] + this.rateMax);
      this.last[j] = v;
      out[j] = v;
      const a = Math.abs(v);
      if (a > this.peak) this.peak = a;
    }
    return out;
  }

  /** Peak injection since the last reset -- reported, because a trim sitting on its
   * magnitude limit is being rescued rather than solving, and the score alone cannot
   * tell those apart. */
  resetPeak() { this.peak = 0; return this; }

  status() {
    return { domain: this.domain, enabled: this.enabled, gain: this.gain,
      peak: this.peak, magMax: this.magMax, rateMax: this.rateMax };
  }
}
