/**
 * @file ITERATIVE LEARNING CONTROL ON A REPEATING TOOLPATH — the one correction on this
 * project that can cancel a resonance, and the reason it can is that it is not a map
 * from the present command to a correction.
 *
 * WHY THE STATIC CORRECTIONS RUN OUT. A compliance constant answers "how far does this
 * torque push the tool off", which is a QUASI-STATIC question: it is the right question
 * only when the command's own frequency content sits below the structure's modes.
 * Measured on the Path tab's arm (rounded rectangle, K 16, E 0.15), contour rms with an
 * identified per-joint compliance against none:
 *
 *     feed 1e-3   3.03e-2 → 5.61e-3   5.4x     — deeply quasi-static, and it works
 *     feed 2e-3   3.98e-2 → 2.26e-2   1.8x
 *     feed 4e-3   1.34e-1 → 1.30e-1   1.03x    — nothing
 *     feed 1e-2   5.65e-1 → 5.85e-1   worse
 *
 * The correction does not degrade gracefully, it stops being the right SHAPE: above the
 * modes the error is a ringing response with its own phase, and no constant times the
 * present torque has a phase.
 *
 * WHAT DOES WORK IS MEMORY OF THE LAP. A closed toolpath is exactly periodic, so the
 * error at a given point on the part is repeatable — and a correction indexed by WHERE
 * ON THE PART it applies can be improved from the error the last lap left there. That is
 * ILC, it is what a machine running the same program a thousand times actually deserves,
 * and it converges to something no feedforward model can reach because it never has to
 * know why the error is there.
 *
 * INDEXED BY ARC LENGTH, NOT BY STEP. A step index needs the lap to be a whole number of
 * steps or the phase drifts a fraction of a step per lap, without bound; arc length is
 * exact by construction and, as a bonus, makes the table a property of the PART rather
 * than of the feedrate. (The lead below is a time, so it still has to be converted, and
 * that is what ties a converged table to the feedrate it was learned at.)
 */

/**
 * A per-joint correction table over one lap of a closed path.
 *
 * THE LEAD IS THE PLANT'S OWN DELAY AND IT IS NOT OPTIONAL. The error observed at a
 * point is the response to a command issued earlier, so an update that credits it to the
 * point where it was SEEN corrects the wrong place. Measured on the same arm, contour rms
 * after eight laps at leads of 0 / 300 / 500 / 700 / 900 / 1200 steps:
 *
 *     0.182 (diverging) · 0.0854 · 0.0578 · 0.0834 · 0.153 · 0.183
 *
 * The optimum is 500 steps, which is 1/bandwidth of the position loop — i.e. the loop's
 * own time constant, not a number that had to be searched for. Past it the update is
 * anti-correlated with the error and the thing winds up instead of converging.
 */
export class PathILC {
  /**
   * @param {object} o
   * @param {number} o.length arc length of one lap
   * @param {number} [o.joints]
   * @param {number} [o.bins] table resolution. Roughly a bin per few steps is plenty —
   *   the smoothing below is what actually sets the correction's bandwidth.
   * @param {number} [o.gain] the learning gain
   * @param {number} [o.smooth] half-width, in bins, of the zero-phase filter applied to
   *   every update. THE MEASUREMENT: 60 / 30 / 12 / 6 / 3 / 0 bins converge to 8.6e-2 /
   *   4.6e-2 / 2.58e-2 / 2.56e-2 (then drifting up) / 2.59e-2 (drifting) / 2.61e-2
   *   (drifting). Too much filtering leaves error the correction is not allowed to
   *   touch; too little lets the update chase content the plant does not reproduce and
   *   the tables creep. 12 is where it converges lowest AND stays there.
   * @param {number} [o.leadBins] see the class note.
   */
  constructor({ length, joints = 2, bins = 1500, gain = 1.0, smooth = 12, leadBins = 0 }) {
    if (!(length > 0)) throw new Error('PathILC needs the lap length');
    if (!(bins >= 8)) throw new Error('PathILC needs at least 8 bins');
    this.length = length; this.n = joints; this.bins = bins;
    this.gain = gain; this.smooth = Math.max(0, Math.round(smooth));
    this.leadBins = ((Math.round(leadBins) % bins) + bins) % bins;
    this.u = [];
    for (let j = 0; j < joints; j++) this.u.push(new Float64Array(bins));
    this.laps = 0;
    this._clearLap();
  }

  _clearLap() {
    this.acc = [];
    for (let j = 0; j < this.n; j++) this.acc.push(new Float64Array(this.bins));
    this.cnt = new Int32Array(this.bins);
  }

  /** The bin an arc length falls in. */
  bin(s) {
    let b = Math.floor((s / this.length) * this.bins);
    if (!Number.isFinite(b)) return 0;
    b %= this.bins;
    return b < 0 ? b + this.bins : b;
  }

  /** The correction currently stored for a point on the part. */
  offset(s, out = null) {
    const b = this.bin(s);
    const o = out || new Array(this.n);
    for (let j = 0; j < this.n; j++) o[j] = this.u[j][b];
    return o;
  }

  /**
   * One measured error, in the SAME units as the correction — joint angles.
   *
   * The caller maps the tool's Cartesian deviation through the Jacobian inverse, because
   * that is where the pose lives and this class deliberately knows nothing about the
   * machine. A bin visited more than once in a lap is averaged.
   */
  observe(s, dq) {
    const b = this.bin(s);
    for (let j = 0; j < this.n; j++) this.acc[j][b] += dq[j];
    this.cnt[b]++;
    return this;
  }

  /**
   * Fold a completed lap into the tables.
   *
   * A BIN NOBODY VISITED IS LEFT ALONE rather than treated as zero error: at a fine
   * table resolution and a fast feedrate some bins get no sample, and updating those
   * toward zero would drag the correction back down exactly where the machine was moving
   * fastest — which is where it is needed most.
   *
   * @returns {{laps:number, rms:number, covered:number}} the lap's own joint-space error
   */
  endLap() {
    const P = this.bins;
    let sum = 0, m = 0, covered = 0;
    const e = [];
    for (let j = 0; j < this.n; j++) e.push(new Float64Array(P));
    for (let b = 0; b < P; b++) {
      if (!this.cnt[b]) continue;
      covered++;
      for (let j = 0; j < this.n; j++) {
        const v = this.acc[j][b] / this.cnt[b];
        e[j][b] = v; sum += v * v; m++;
      }
    }
    if (covered > 0) {
      for (let j = 0; j < this.n; j++) {
        const next = new Float64Array(P);
        for (let b = 0; b < P; b++) {
          // The visited bins carry the update; an unvisited one contributes nothing, so
          // the lead pick-up reads whatever the last lap left there, which is zero.
          next[b] = this.u[j][b] - this.gain * e[j][(b + this.leadBins) % P];
        }
        this.u[j] = this.smooth > 0 ? smoothRing(next, this.smooth) : next;
      }
    }
    this.laps++;
    this._clearLap();
    return { laps: this.laps, rms: m ? Math.sqrt(sum / m) : 0, covered: covered / P };
  }

  /** Peak stored correction per joint — the number that says whether it is winding up. */
  peak() {
    return this.u.map((a) => {
      let p = 0;
      for (let i = 0; i < a.length; i++) if (Math.abs(a[i]) > p) p = Math.abs(a[i]);
      return p;
    });
  }
}

/**
 * A zero-phase box filter around a ring.
 *
 * ZERO PHASE IS THE WHOLE REASON THIS IS DONE BETWEEN LAPS RATHER THAN DURING ONE. A
 * causal filter would add its own lag to a correction whose entire difficulty is getting
 * the timing right; a symmetric one cannot, and off-line is where a symmetric filter is
 * allowed to exist.
 */
export function smoothRing(a, half) {
  const P = a.length, out = new Float64Array(P), w = 2 * half + 1;
  if (half <= 0) return Float64Array.from(a);
  // A running sum, so the cost does not grow with the width.
  let acc = 0;
  for (let j = -half; j <= half; j++) acc += a[((j % P) + P) % P];
  for (let n = 0; n < P; n++) {
    out[n] = acc / w;
    acc += a[(n + half + 1) % P] - a[((n - half) % P + P) % P];
  }
  return out;
}
