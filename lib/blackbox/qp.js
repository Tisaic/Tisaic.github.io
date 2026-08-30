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
 * @returns {Float64Array} u
 */
/**
 * STATIC WORKSPACE, because a cyclic task must not allocate.
 *
 * This solver runs every control tick forever. Allocating five arrays per call hands the
 * collector work at a moment it chooses rather than one the scheduler does, and the pause
 * lands in somebody's scan — which is the whole reason an embedded implementation uses
 * static buffers. Measured before this: 5 x N x 8 = 3.2 kB of garbage per call, 6.3 kB per
 * two-channel tick, forever.
 *
 * Keyed by N and reused. That is safe here and the reason is worth stating rather than
 * assuming: JavaScript is single-threaded and every call completes before the next begins,
 * so there is no interleaving to corrupt. It would NOT be safe under a worker that shared
 * this module, and a re-entrant caller would have to pass its own.
 */
const WS = new Map();
function workspace(N) {
  let w = WS.get(N);
  if (!w) {
    w = { r: new Float64Array(N), g: new Float64Array(N), Tg: new Float64Array(N),
      y: new Float64Array(N), uOld: new Float64Array(N) };
    WS.set(N, w);
  }
  return w;
}

export function boxQP(h, f0, u, { U, lambda, uPrev = 0, iters = 8, notch = null }) {
  const N = u.length;
  const ws = workspace(N);
  const { r, g, Tg, y, uOld } = ws;
  // THE NOTCH BASIS, cached with the workspace because it depends only on (N, omega).
  let nc = null, ns = null, nMu = 0;
  if (notch && notch.weight > 0 && notch.omega > 0) {
    // Cached on the workspace beside the rest: the basis depends only on (N, omega), so a
    // steady notch builds it once and every later tick is two dot products and two axpys.
    if (!ws.nc || ws.nOmega !== notch.omega) {
      ws.nc = new Float64Array(N); ws.ns = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        ws.nc[i] = Math.cos(notch.omega * i); ws.ns[i] = Math.sin(notch.omega * i);
      }
      ws.nOmega = notch.omega;
    }
    nc = ws.nc; ns = ws.ns; nMu = notch.weight;
  }
  // `y` starts as a copy of the warm start; the other four are fully overwritten before
  // they are read on every iteration, which is what makes reuse identical to allocation.
  y.set(u);
  // A LIPSCHITZ BOUND RATHER THAN A TUNED STEP SIZE, because a step size that has to be
  // tuned per plant is exactly the kind of constant this module is not allowed. For a
  // Toeplitz T the spectral norm is bounded by the gain of |H| on the unit circle, which
  // is bounded in turn by sum|h| -- crude, always safe, and free.
  let ah = 0;
  for (let m = 0; m < h.length; m++) ah += Math.abs(h[m]);
  // THE LIPSCHITZ BOUND HAS TO SEE THE WEIGHTS. W scales the tracking Hessian by at most
  // max(w), and a step size derived from a bound that ignored it would overshoot exactly
  // when the weights are large — a divergent solver rather than a wrong answer.
  // The notch adds 2*mu*(c c^T + s s^T); its spectral norm is bounded by 2*mu*max(|c|^2,
  // |s|^2) <= 2*mu*N. A step size blind to it would diverge exactly when the notch bites.
  const L = (2 * (ah * ah + 4 * lambda) + 2 * nMu * N) || 1;
  const step = 1 / L;
  let t = 1;
  for (let it = 0; it < iters; it++) {
    applyT(h, y, N, r);
    for (let i = 0; i < N; i++) r[i] += f0[i];
    applyTt(h, r, N, Tg);
    // gradient of the tracking term, then of the increment penalty D^T D y
    for (let i = 0; i < N; i++) {
      const yi = y[i];
      const back = i > 0 ? y[i - 1] : uPrev;
      const fwd = i < N - 1 ? y[i + 1] : yi;   // free end: no penalty past the horizon
      g[i] = 2 * Tg[i] + 2 * lambda * ((yi - back) - (fwd - yi));
    }
    // A PENALTY THAT IS HEAVY AT ONE FREQUENCY AND FREE EVERYWHERE ELSE.
    //
    // `lambda` weights ||D u||^2, a first difference -- a scalar HIGH-PASS. Raising it
    // attenuates every rate of variation at once, and on the 2R arm that is exactly the
    // problem: the mode sits at 1188 steps and the droop correction varies over a lap,
    // so the setting that suppresses the ring (lambda 60x, oscillation 0.187) also
    // suppresses the droop and leaves a bias of -0.237, while the setting that nails the
    // droop (lambda 1x, bias -0.005) rings at 0.833. One knob, two jobs, opposite ways.
    //
    // This is a rank-2 penalty on the plan's Fourier component at omega: mu*[(u.c)^2 +
    // (u.s)^2]. DC and slow variation project to nearly nothing on those vectors and pay
    // nearly nothing; content AT the mode pays mu. Two inner products and two axpys per
    // iteration, O(N), no matrix and no factorisation -- the fixed iteration count that
    // makes this solver cyclic-task-safe is untouched.
    if (nMu > 0) {
      let dc = 0, ds = 0;
      for (let i = 0; i < N; i++) { dc += y[i] * nc[i]; ds += y[i] * ns[i]; }
      const ac = 2 * nMu * dc, as = 2 * nMu * ds;
      for (let i = 0; i < N; i++) g[i] += ac * nc[i] + as * ns[i];
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

