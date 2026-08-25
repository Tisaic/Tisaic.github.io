/**
 * @file THE CONSTRAINED FEEDFORWARD, and the reason it is a different object from the FIR.
 *
 * The FIR that ships alongside this is the unconstrained optimum with an effort penalty
 * raised until its PEAK correction, over the identification record, falls under a cap.
 * That is a penalty-method approximation of a constrained problem, and it is wrong in a
 * specific and measurable way: a single filter has ONE gain, so meeting a peak limit means
 * DETUNING IT EVERYWHERE -- including over the stretches where the limit was never close.
 * It also does not actually guarantee the limit, since the peak on a stretch of command it
 * was not designed against can exceed the one it was.
 *
 * Pontryagin's principle says the constrained optimum is not the clipped or detuned
 * unconstrained one: where a limit is active the solution sits ON it, and where it is not
 * the solution is free. Getting that means solving
 *
 *     min over u   || d + T u ||^2  +  lambda || D u ||^2      s.t.  |u_i| <= U
 *
 * over a receding horizon of the command's own look-ahead -- a box-constrained QP, whose
 * projection is a clamp and which therefore needs no factorisation, no active-set
 * bookkeeping and no matrix inverse. That matters here more than elegance does: this has
 * to run on a PLC.
 *
 * WHY A FIRST-ORDER METHOD RATHER THAN AN EXACT SOLVER. An interior-point or active-set QP
 * has data-dependent run time, which a cyclic task cannot have -- the worst case is what
 * gets budgeted, and for those methods the worst case is far from the average. A projected
 * gradient with a FIXED iteration count has a run time that is a constant times the
 * iteration count, known before it runs. It is the standard embedded-MPC answer for
 * exactly that reason, and the cost of it is that the answer is approximate; how
 * approximate is measured rather than assumed (see `iterationsNeeded`).
 *
 * AND THE WARM START IS WHAT MAKES THE ITERATION COUNT SMALL. Between one update and the
 * next the horizon shifts by exactly one sample, so the previous solution shifted along by
 * one is already very nearly right. The solver is never started cold except once.
 */

/** T u -- the plant's response to a candidate correction, plus whatever the past is
 * still contributing. Lower-triangular Toeplitz in h, so it is a convolution. */
function applyT(h, u, N, out) {
  const M = h.length;
  for (let i = 0; i < N; i++) {
    let s = 0;
    const top = i < M - 1 ? i : M - 1;
    for (let m = 0; m <= top; m++) s += h[m] * u[i - m];
    out[i] = s;
  }
  return out;
}

/** T^T r -- the adjoint, which is the same convolution run the other way. Getting this
 * backwards is the single easiest mistake in the file and it produces a plausible filter
 * that answers the wrong question, so it is checked directly in the suite. */
function applyTt(h, r, N, out) {
  const M = h.length;
  for (let i = 0; i < N; i++) {
    let s = 0;
    const top = N - i < M ? N - i : M;
    for (let m = 0; m < top; m++) s += h[m] * r[i + m];
    out[i] = s;
  }
  return out;
}

/**
 * Box-constrained QP by accelerated projected gradient (FISTA), warm-started.
 *
 *   min  || f0 + T u ||^2 + lambda * || D u ||^2      s.t.  |u_i| <= U
 *
 * @param {Float64Array} h      impulse response, on the grid
 * @param {Float64Array} f0     the FREE response: the disturbance over the horizon plus
 *   whatever the corrections already applied are still contributing. Everything the
 *   decision variables cannot change.
 * @param {Float64Array} u      warm start, overwritten with the solution
 * @param {object} o
 * @param {number} o.U          the magnitude limit
 * @param {number} o.lambda     effort weight on the INCREMENTS of u
 * @param {number} o.uPrev      the correction applied at the step before the horizon --
 *   the increment penalty has to reach across the boundary or the solver is free to jump
 *   at every update and pay nothing for it
 * @param {number} o.iters      FIXED iteration count. The whole point.
 * @param {Float64Array|null} [o.weights] per-lead trust on the TRACKING term, turning the
 *   cost into || W^(1/2) (f0 + T u) ||^2. Omit for the unweighted problem, which is what
 *   every caller did before this existed and what the golden vectors pin.
 *
 *   WHY THIS IS A KNOB AT ALL. The horizon is as long as the plant's settling time, but a
 *   FORECAST is not equally good along it: measured on the 2R arm, the elbow channel holds
 *   held-out R^2 0.79 at lead 0 and 0.15 at the far lead, and on the fully learned routing
 *   it reaches -0.035 -- worse than predicting the mean -- across 69 leads the solver
 *   trusts identically. Fitting a plan to noise over most of its terms is not a small
 *   error in a large problem, it is most of the problem.
 * @returns {Float64Array} u
 */
export function boxQP(h, f0, u, { U, lambda, uPrev = 0, iters = 8, weights = null }) {
  const N = u.length;
  const r = new Float64Array(N), g = new Float64Array(N), Tg = new Float64Array(N);
  const y = Float64Array.from(u), uOld = new Float64Array(N);
  // A LIPSCHITZ BOUND RATHER THAN A TUNED STEP SIZE, because a step size that has to be
  // tuned per plant is exactly the kind of constant this module is not allowed. For a
  // Toeplitz T the spectral norm is bounded by the gain of |H| on the unit circle, which
  // is bounded in turn by sum|h| -- crude, always safe, and free.
  let ah = 0;
  for (let m = 0; m < h.length; m++) ah += Math.abs(h[m]);
  // THE LIPSCHITZ BOUND HAS TO SEE THE WEIGHTS. W scales the tracking Hessian by at most
  // max(w), and a step size derived from a bound that ignored it would overshoot exactly
  // when the weights are large — a divergent solver rather than a wrong answer.
  let wMax = 1;
  if (weights) { wMax = 0; for (let i = 0; i < N; i++) if (weights[i] > wMax) wMax = weights[i]; }
  const L = 2 * (ah * ah * wMax + 4 * lambda) || 1;
  const step = 1 / L;
  let t = 1;
  for (let it = 0; it < iters; it++) {
    applyT(h, y, N, r);
    for (let i = 0; i < N; i++) r[i] += f0[i];
    // grad of || W^(1/2) (f0 + T u) ||^2 is 2 T^T W r, so the weights go on the RESIDUAL
    // before the adjoint. Weighting after it would scale the decision variables instead
    // of the leads, which is a different problem with a plausible answer.
    if (weights) for (let i = 0; i < N; i++) r[i] *= weights[i];
    applyTt(h, r, N, Tg);
    // gradient of the tracking term, then of the increment penalty D^T D y
    for (let i = 0; i < N; i++) {
      const yi = y[i];
      const back = i > 0 ? y[i - 1] : uPrev;
      const fwd = i < N - 1 ? y[i + 1] : yi;   // free end: no penalty past the horizon
      g[i] = 2 * Tg[i] + 2 * lambda * ((yi - back) - (fwd - yi));
    }
    uOld.set(u);
    for (let i = 0; i < N; i++) {
      let v = y[i] - step * g[i];
      if (v > U) v = U; else if (v < -U) v = -U;   // the projection: a clamp
      u[i] = v;
    }
    const tNext = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
    const beta = (t - 1) / tNext;
    for (let i = 0; i < N; i++) y[i] = u[i] + beta * (u[i] - uOld[i]);
    t = tNext;
  }
  return u;
}

/**
 * The receding-horizon controller: hold the look-ahead, solve, apply the first move, shift.
 *
 * IT COSTS ONE MAP PREDICTION PER UPDATE, exactly like the FIR it replaces -- the horizon
 * of predicted disturbance is a ring with one new entry each time, not N fresh
 * evaluations. What it costs ON TOP is `iters` passes of two convolutions, which is the
 * number that has to fit a cycle and is reported by `cost()` rather than estimated.
 */
export class PreviewMPC {
  /**
   * @param {Float64Array} h  identified impulse response on the grid
   * @param {object} o
   * @param {number} o.horizon   decision steps, in grid samples
   * @param {number} o.U         magnitude limit on the correction
   * @param {number} o.lambda    effort weight
   * @param {number} o.iters     fixed iterations per update
   */
  constructor(h, { horizon, U, lambda, iters }) {
    this.h = h;
    this.N = horizon;
    this.U = U; this.lambda = lambda; this.iters = iters;
    this.u = new Float64Array(horizon);
    this.past = new Float64Array(h.length);   // corrections already applied, newest first
    this.f0 = new Float64Array(horizon);
    this.uPrev = 0;
  }

  /**
   * One update.
   * @param {Float64Array|number[]} dHat  the predicted disturbance over the horizon,
   *   dHat[i] being the disturbance i grid samples from now
   * @returns {number} the correction to apply NOW
   */
  step(dHat) {
    const { h, N } = this, M = h.length;
    // THE FREE RESPONSE IS NOT OPTIONAL. What the plant does over the horizon is the
    // disturbance PLUS the tail of every correction already applied, and a solver that
    // ignores the second re-corrects for its own past output every update -- which reads
    // as an oscillation nobody commanded.
    for (let i = 0; i < N; i++) {
      let s = dHat[i];
      for (let m = i + 1; m < M; m++) s += h[m] * this.past[m - i - 1];
      this.f0[i] = s;
    }
    // Warm start: shift the previous solution along by one and repeat its tail.
    for (let i = 0; i < N - 1; i++) this.u[i] = this.u[i + 1];
    boxQP(h, this.f0, this.u, { U: this.U, lambda: this.lambda,
      uPrev: this.uPrev, iters: this.iters });
    const applied = this.u[0];
    for (let m = M - 1; m > 0; m--) this.past[m] = this.past[m - 1];
    this.past[0] = applied;
    this.uPrev = applied;
    return applied;
  }

  /**
   * THE MOVE IT PLANS TO MAKE NEXT, which the solve has already computed and which the
   * caller would otherwise throw away. It is what lets the host RAMP between updates
   * instead of stepping: the correction is a sampled signal and the machine runs at
   * `grid` times its rate, so a zero-order hold is a staircase the drive can only answer
   * with torque spikes. Free, because a receding-horizon solve produces the whole plan
   * and applies one element of it.
   */
  next() { return this.N > 1 ? this.u[1] : this.u[0]; }

  /** Multiply-accumulates per update, counted rather than measured. */
  cost() {
    const N = this.N, M = this.h.length;
    // free response: the triangular tail sum, then per iteration two convolutions
    const free = Math.min(N, M) * M / 2;
    const perIter = 2 * N * Math.min(N, M) + 4 * N;
    return { mac: Math.round(free + this.iters * perIter), iters: this.iters,
      horizon: N, taps: M };
  }
}
