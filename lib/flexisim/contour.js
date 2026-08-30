/**
 * @file WHAT A CONTOURING MACHINE IS JUDGED ON — three things, and they trade against
 * each other, which is the whole reason all three are measured rather than one.
 *
 *   CONTOUR ERROR   the deviation NORMAL to the commanded path. A dimensional error: the
 *                   part is the wrong shape and no amount of time fixes it.
 *   MOTOR ENERGY    two numbers, because they are two different costs. The integral of
 *                   tau^2 is copper loss — what heats the motor and what actually limits
 *                   a duty cycle. The integral of |tau*omega| is mechanical work — what
 *                   the wall pays for. A move can be cheap in one and expensive in the
 *                   other, so reporting one of them is choosing which cost to care about
 *                   without saying so.
 *   DIRECTION CHANGE  sign reversals of joint velocity, and of torque. Each velocity
 *                   reversal drags the joint back through backlash and re-breaks
 *                   stiction, which is the textbook cause of the quadrant glitch that
 *                   shows up as a step at every axis crossing of a circular interpolation
 *                   — the single most recognisable defect in CNC contouring. It costs
 *                   surface finish and it costs wear, and neither shows in an rms.
 *
 * LAG IS AS MUCH A DEFECT AS SHAPE, and this file used to say the opposite.
 *
 * What it said was: the component ALONG the path means the tool is in the right place on
 * the right curve and merely late, so the part is correct and only the cycle is slower —
 * and folding it into one tracking number makes a machine that lags uniformly look as bad
 * as one that cuts the wrong shape. The first half of that is true of a UNIFORM lag on a
 * single closed contour and of nothing else. A lag that VARIES along the path is a shape
 * error the moment two axes are coordinated, it is what a following error becomes at a
 * corner, and on any machine that must meet another axis, a tool change or a clock it is a
 * defect in its own right. Reporting it and then excluding it from every score meant the
 * whole ladder was optimised against half of its own error.
 *
 * SO ALL THREE ARE REPORTED AND THE TOTAL IS THE OBJECTIVE: `contourRms` for shape,
 * `lagRms` for lateness, and `totalRms` for the whole deviation from the commanded point.
 * They stay separate in the report because the two failures still have different causes and
 * different fixes (rule 39 is the same argument one level down), but a controller is no
 * longer allowed to buy one with the other without it showing.
 */

/**
 * Accumulates the three, per joint and totalled, over a whole path.
 *
 * IT SCORES AT EVERY STEP, not over a settled window, because a contouring machine has no
 * settled window: it is always mid-path. That is the concrete sense in which the metrics
 * the rest of this project uses do not transfer.
 */
export class ContourScore {
  /**
   * @param {object} o
   * @param {number} o.joints how many joints to track separately
   * @param {number} [o.reversalTravel] how far a joint must move in the NEW direction
   *   before a reversal is counted, in the joint's own angular units.
   *
   *   A REVERSAL IS A TRAVEL EVENT, NOT A SIGN CHANGE, and getting that wrong makes the
   *   count measure arithmetic. A joint dwelling near zero crosses zero speed thousands
   *   of times on rounding alone; the PHYSICAL event is the gear teeth changing faces,
   *   which happens once the joint has actually moved back through its lost motion. So
   *   the natural threshold is the BACKLASH — a number the caller has and this class
   *   does not — and the default is a small angle rather than zero, because a default of
   *   zero silently returns the arithmetic count.
   *
   *   A SPEED DEADBAND WAS TRIED FIRST AND CANNOT WORK: relative to a running peak it is
   *   meaningless until the peak has been seen, so a run that dwells before it moves is
   *   counted with a threshold near zero — measured, 970 reversals against a physical 1.
   */
  constructor({ joints = 2, reversalTravel = 1e-4 } = {}) {
    this.n = joints;
    this.travel = reversalTravel;
    this.reset();
  }

  reset() {
    this.k = 0;
    this.cSum = 0; this.cMax = 0;          // contour error, rms and worst
    this.cSigned = 0;                      // and its SIGNED mean, which is the bias
    this.lSum = 0; this.lMax = 0;          // lag
    this.tMax = 0;                         // the whole deviation, contour and lag together
    this.tau2 = new Float64Array(this.n);  // copper loss
    this.work = new Float64Array(this.n);  // |mechanical|
    this.pos = new Float64Array(this.n);   // integrated travel, for the reversal counter
    this.ext = new Float64Array(this.n);   // the extreme since the last direction commit
    this.jerk = new Float64Array(this.n);
    this.rev = new Int32Array(this.n);     // velocity reversals
    this.tRev = new Int32Array(this.n);    // torque reversals
    this._sign = new Int8Array(this.n);
    this._tSign = new Int8Array(this.n);
    this._prevA = new Float64Array(this.n);
    this._prevW = new Float64Array(this.n);
    this._first = true;
  }

  /**
   * One solver step.
   *
   * @param {number} contour signed normal deviation from the path
   * @param {number} lag signed deviation along it
   * @param {number[]} tau per-joint motor torque
   * @param {number[]} omega per-joint motor speed
   */
  step(contour, lag, tau, omega) {
    this.k++;
    const c = Math.abs(contour), l = Math.abs(lag);
    this.cSum += contour * contour; if (c > this.cMax) this.cMax = c;
    // THE SIGNED SUM, SEPARATELY, because rule 39 is not satisfied by an rms: a part cut
    // uniformly 0.2 undersize and a part that rings +-0.2 about the right size have the
    // SAME contour rms and need different fixes — an offset for the first, a faster or
    // better-phased correction for the second. The stage cannot tell them apart either;
    // one is a shrunken outline and the other a lumpy one, and at a magnification that
    // makes both visible they look equally wrong.
    this.cSigned += contour;
    this.lSum += lag * lag; if (l > this.lMax) this.lMax = l;
    // AND THE WHOLE DEVIATION, because LAG IS AS MUCH A DEFECT AS SHAPE. The two components
    // are orthogonal by construction, so the total is their hypotenuse per step — accumulated
    // here rather than derived, since the MAX of a hypotenuse is not the hypotenuse of the
    // maxima and a peak that never coincided would be invented by computing it afterwards.
    const t = Math.hypot(contour, lag);
    if (t > this.tMax) this.tMax = t;
    for (let j = 0; j < this.n; j++) {
      const t = tau[j], w = omega[j];
      this.tau2[j] += t * t;
      this.work[j] += Math.abs(t * w);
      // THE REVERSAL COUNTER IS A ZIGZAG FILTER ON TRAVEL. The joint's position is
      // integrated; while it moves in the committed direction the extreme follows it, and
      // a reversal is counted only once it has retraced more than `reversalTravel` — the
      // distance at which the gear teeth have actually changed faces. Noise smaller than
      // that produces no count however often it changes sign.
      this.pos[j] += w;
      const p = this.pos[j];
      const d = this._sign[j];
      if (d === 0) {
        if (Math.abs(p - this.ext[j]) > this.travel) {
          this._sign[j] = p > this.ext[j] ? 1 : -1;
          this.ext[j] = p;
        }
      } else if ((p - this.ext[j]) * d > 0) {
        this.ext[j] = p;                                  // still going the same way
      } else if (Math.abs(p - this.ext[j]) > this.travel) {
        this.rev[j]++; this._sign[j] = -d; this.ext[j] = p;
      }
      // The torque reverses on sign, with no threshold: a current reversal IS a sign
      // change, and unlike a mechanical reversal it has no lost motion to traverse.
      if (t !== 0) {
        const sg = t > 0 ? 1 : -1;
        if (this._tSign[j] !== 0 && sg !== this._tSign[j]) this.tRev[j]++;
        this._tSign[j] = sg;
      }
      if (!this._first) {
        const dd = (w - this._prevW[j]) - this._prevA[j];
        this.jerk[j] += dd * dd;
        this._prevA[j] = w - this._prevW[j];
      }
      this._prevW[j] = w;
    }
    this._first = false;
  }

  /** @returns {object} everything, with the rms values already taken. */
  report() {
    const n = Math.max(1, this.k);
    const per = [];
    for (let j = 0; j < this.n; j++) {
      per.push({ tau2: this.tau2[j], work: this.work[j],
        jerk: Math.sqrt(this.jerk[j] / n),
        reversals: this.rev[j], torqueReversals: this.tRev[j] });
    }
    return {
      steps: this.k,
      contourRms: Math.sqrt(this.cSum / n), contourMax: this.cMax,
      contourBias: this.cSigned / n,
      contourOsc: Math.sqrt(Math.max(0, this.cSum / n - (this.cSigned / n) ** 2)),
      lagRms: Math.sqrt(this.lSum / n), lagMax: this.lMax,
      // THE WHOLE DEVIATION FROM THE COMMANDED POINT. Contour and lag are orthogonal, so the
      // rms of the hypotenuse is the hypotenuse of the rms values and needs no second pass.
      totalRms: Math.sqrt((this.cSum + this.lSum) / n), totalMax: this.tMax,
      tau2: per.reduce((a, b) => a + b.tau2, 0),
      work: per.reduce((a, b) => a + b.work, 0),
      reversals: per.reduce((a, b) => a + b.reversals, 0),
      torqueReversals: per.reduce((a, b) => a + b.torqueReversals, 0),
      joints: per,
    };
  }
}

/**
 * Decompose a tool position's deviation from a commanded point into the two components
 * that matter, using the PATH to define the directions.
 *
 * THE NORMAL COMES FROM THE PATH AT THE NEAREST POINT, not from the commanded point's
 * tangent. Near a corner those differ, and using the commanded one attributes part of a
 * genuine contour error to lag whenever the tool is behind at a corner — which is exactly
 * where contour error is largest and therefore exactly where the measurement must not
 * quietly discount it.
 *
 * @param {import('./toolpath.js').ToolPath} path
 * @param {number[]} tool actual [x, y]
 * @param {{x:number, y:number, s:number}} cmd the commanded state at this instant
 * @returns {{contour:number, lag:number, s:number}}
 */
export function decompose(path, tool, cmd) {
  const c = path.contour(tool);
  // Lag is measured along the PATH, as the difference in arc length between where the
  // tool is and where it was told to be — which is a length along the curve rather than
  // a straight-line distance, and on a curve those are not the same number.
  let lag = cmd.s - c.u;
  if (path.closed) {
    const L = path.length;
    if (lag > L / 2) lag -= L; else if (lag < -L / 2) lag += L;
  }
  return { contour: c.d, lag, s: c.u };
}
