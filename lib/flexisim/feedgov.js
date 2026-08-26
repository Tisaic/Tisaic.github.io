/**
 * @file THE PREDICTIVE FEEDRATE GOVERNOR -- the third actuation domain, and the only one
 * that does not act through the compliance at all.
 *
 * A torque trim and a position pre-distortion both reach the tool through the gearbox and
 * the servo, at servo rate. This acts on the PLANNER, hundreds of milliseconds ahead, and
 * that difference is what makes it immune to the two walls everything else in this project
 * ran into: it is far below any structural mode, so it cannot excite one, and it closes no
 * loop through the compliance, so collocation does not apply.
 *
 * WHY IT IS WORTH HAVING WHEN TWO COMPENSATORS ALREADY EXIST. Repeatedly measured here:
 * the BIAS is easy -- every knob that buys authority removes it -- and the OSCILLATION is
 * the wall, because it is excited by corner acceleration and then rings at a mode faster
 * than the loop. A compensator moves where the tool IS. This reduces the excitation at
 * SOURCE, which is the one strategy that kept working when authority failed: cornerDt
 * 40 -> 10 bought 8.8% of the contour error for 1.7% of the cycle time.
 *
 * AND ITS INPUT IS THE BEST SIGNAL AVAILABLE. The soft sensor's FORECAST scores better
 * than its present-time estimate -- 0.1035 against 0.3645, with an interior optimum in
 * lead -- so the layer that needs the longest look-ahead is the one whose signal is most
 * trustworthy. Predicting ahead is easier than predicting now.
 *
 * THE COST IS CYCLE TIME AND IT IS REPORTED, NOT BURIED. A governor that quietly halves
 * the feedrate can make any contour number look good; `timeCost()` returns the fraction of
 * nominal traverse time spent, so the trade is always visible beside the benefit.
 *
 * A WARNING THIS PROJECT ALREADY PAID FOR. The anti-slosh axis fed the SAME look-ahead
 * signal into two roles: as a crest warning it worked, and in the feedforward it measured
 * NEGATIVE and monotone (residual wave 0.188 -> 0.477 mm), because shaping cancels by
 * exact timing and preview only time-shifts the excitation. One free signal, opposite sign
 * in two roles. So this is built as a PLANNING action and nothing here assumes the same
 * forecast helps wherever else it might be plumbed.
 */

const clip = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));

export class FeedGovernor {
  /**
   * @param {object} o
   * @param {number} o.tolerance   predicted |tip error| at which the feed is fully cut to
   *   `floor`. Below `deadband` nothing happens at all.
   * @param {number} [o.deadband]  predicted error below which the feed is untouched. A
   *   governor with no deadband trims the feed continuously against forecast noise, which
   *   spends cycle time to chase a number that is not there.
   * @param {number} [o.floor]     the slowest override it may command, as a fraction.
   * @param {number} [o.rateMax]   max change in the override per call -- a feedrate STEP is
   *   an acceleration transient, i.e. exactly the excitation this exists to avoid.
   */
  constructor({ tolerance, deadband = 0, floor = 0.25, rateMax = 0.01 } = {}) {
    this.tol = tolerance;
    this.deadband = deadband;
    this.floor = floor;
    this.rateMax = rateMax;
    this.override = 1;
    this.nCalls = 0; this.sumOverride = 0; this.sumRecip = 0; this.minOverride = 1;
  }

  /**
   * @param {number} predicted  forecast |tip error| at the lead the sensor was trained for
   * @returns {number} feedrate override in [floor, 1]
   */
  step(predicted) {
    const p = Number.isFinite(predicted) ? Math.abs(predicted) : 0;
    // LINEAR BETWEEN THE DEADBAND AND THE TOLERANCE, saturating at both ends. Not a
    // proportional law on the error itself: what matters is how close the PREDICTION is to
    // the limit, so a machine well inside tolerance pays nothing however large its error.
    const span = Math.max(this.tol - this.deadband, 1e-300);
    const excess = clip((p - this.deadband) / span, 0, 1);
    const want = 1 - excess * (1 - this.floor);
    this.override = clip(want, this.override - this.rateMax, this.override + this.rateMax);
    this.override = clip(this.override, this.floor, 1);
    this.nCalls++; this.sumOverride += this.override; this.sumRecip += 1 / this.override;
    if (this.override < this.minOverride) this.minOverride = this.override;
    return this.override;
  }

  /**
   * Fraction of nominal traverse TIME spent.
   *
   * IT IS THE MEAN OF THE RECIPROCAL, NOT THE RECIPROCAL OF THE MEAN, and the difference
   * is not pedantry: time to cover a fixed arc is integral of ds/v, so an override that
   * spends half the path at 1.0 and half at 0.5 costs (1 + 2)/2 = 1.5x the time, while
   * 1/mean(0.75) = 1.33x. The second understates the cost of exactly the thing a governor
   * does -- slowing hard over a short stretch -- so it would flatter this layer where it
   * is least defensible.
   */
  timeCost() {
    return this.nCalls ? this.sumRecip / this.nCalls : 1;
  }

  status() {
    return { override: this.override, mean: this.nCalls ? this.sumOverride / this.nCalls : 1,
      min: this.minOverride, timeCost: this.timeCost(), tol: this.tol, floor: this.floor };
  }

  reset() { this.override = 1; this.nCalls = 0; this.sumOverride = 0; this.sumRecip = 0;
    this.minOverride = 1; return this; }
}
