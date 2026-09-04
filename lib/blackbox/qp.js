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

/**
 * THE FREQUENCY-SHAPED PENALTY — a scalar `mu` is the wrong shape, and three independent
 * measurements say so.
 *
 * `mu` is Tikhonov, so it shrinks the SMALL-SINGULAR-VALUE directions of the plant hardest — and
 * for a Toeplitz T those are precisely the frequencies where `|H|` is small. That is the right
 * instinct where the model is untrustworthy and exactly wrong where it is merely WEAK, and on the
 * 2R arm those two bands are not the same one:
 *
 *   `_band` split the delivered residual by what the pilot's own kernel can reach. The elbow's
 *   error is 42-60% concentrated where `|H|` is between 0.1 and 0.5 of its DC — reachable, but at
 *   a price — and the pilot removes **0.1%** of it on the rounded rectangle.
 *   `_hspec` measured the model's own error per harmonic: relative error 0.068 across h1-h4
 *   against 0.485 across h5-h16 on the shoulder. Trust and gain fall at DIFFERENT rates.
 *   And every scalar setting of `mu` trades the corner against the arcs, because one number
 *   cannot express "act here, do not act there".
 *
 * In the Fourier picture the arithmetic is plain: cancelling error where `|H|` is 0.2 needs a
 * correction FIVE TIMES the error, and a scalar penalty refuses it for being large rather than for
 * being unjustified. A per-band weight refuses it only where the MODEL is wrong.
 *
 * `notches` is a list of `{ omega, weight }`; the penalty is the sum of rank-2 terms
 * `w_k[(u.c_k)^2 + (u.s_k)^2]`, which is two dot products and two axpys per band per iteration —
 * O(K*N), no matrix and no factorisation, so the fixed iteration count that makes this solver
 * cyclic-task-safe is untouched. Omitted, or given the single `notch` this generalises, every
 * golden vector and every published number is unchanged.
 */
function notchBasis(ws, N, list) {
  const key = list.map((n) => n.omega.toFixed(9)).join(',');
  if (ws.nKey !== key) {
    ws.nc = list.map(() => new Float64Array(N));
    ws.ns = list.map(() => new Float64Array(N));
    for (let k = 0; k < list.length; k++) {
      for (let i = 0; i < N; i++) {
        ws.nc[k][i] = Math.cos(list[k].omega * i);
        ws.ns[k][i] = Math.sin(list[k].omega * i);
      }
    }
    ws.nKey = key;
  }
  return { c: ws.nc, s: ws.ns };
}

/** The single notch and the profile in one list, so callers may pass either or both. */
function notchList(notch, notches) {
  const out = [];
  if (notch && notch.weight > 0 && notch.omega > 0) out.push(notch);
  if (notches) for (const n of notches) if (n && n.weight > 0 && n.omega > 0) out.push(n);
  return out;
}

export function boxQP(h, f0, u, { U, lambda, uPrev = 0, iters = 8, notch = null, mu = 0,
  notches = null }) {
  const N = u.length;
  const ws = workspace(N);
  const { r, g, Tg, y, uOld } = ws;
  // THE NOTCH BASIS, cached with the workspace because it depends only on (N, omega).
  // The basis depends only on (N, the omegas), so a steady profile builds it once and every later
  // tick is two dot products and two axpys per band.
  const nList = notchList(notch, notches);
  let nB = null, nMu = 0;
  if (nList.length) {
    nB = notchBasis(ws, N, nList);
    for (const n of nList) nMu = Math.max(nMu, n.weight);
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
  // THE LIPSCHITZ BOUND HAS TO SEE `mu` TOO. The magnitude penalty adds 2*mu*I to the Hessian,
  // so a step size blind to it overshoots exactly when the penalty bites — the same failure the
  // notch and the lead weights each had to be added to this bound to avoid.
  // EVERY band adds 2*w_k*(c c^T + s s^T), so the bound is the SUM over bands, not the max —
  // a step size blind to that diverges exactly when a profile bites in several places at once.
  let nSum = 0;
  for (const n of nList) nSum += n.weight;
  const L = (2 * (ah * ah + 4 * lambda + mu) + 2 * nSum * N) || 1;
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
      // THE MAGNITUDE PENALTY, AND THE OBJECTIVE HAD NO TERM FOR IT. `lambda` weights ||D u||^2
      // — a RATE penalty — the notch weights one frequency, and `U` is a box. None of the three
      // can say "use less correction", which is a different instruction from "change it more
      // slowly", and the 2R arm asks for exactly that: scaling one channel's `h` by 1.30 — a
      // lie about the plant that makes the QP request less — is worth up to +139% there, while
      // raising `lambda` 32x moves the score by under 1%. Measured, not argued: the rate knob
      // shrinks the PLAN (u rms 0.246 -> 0.188) and leaves the delivered bias and oscillation
      // where they were.
      //
      // Omitted, `mu` is 0 and this adds one multiply-free branch-free term of zero, so every
      // golden vector and every published number is untouched.
      if (mu > 0) g[i] += 2 * mu * yi;
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
    if (nB) {
      for (let k = 0; k < nList.length; k++) {
        const ck = nB.c[k], sk = nB.s[k], wk = nList[k].weight;
        let dc = 0, ds = 0;
        for (let i = 0; i < N; i++) { dc += y[i] * ck[i]; ds += y[i] * sk[i]; }
        const ac = 2 * wk * dc, as = 2 * wk * ds;
        for (let i = 0; i < N; i++) g[i] += ac * ck[i] + as * sk[i];
      }
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


/**
 * THE MIMO SOLVE — the one this module documented as deliberately absent, built because the
 * plant that needs it turned up and the number that was supposed to detect it could not see it.
 *
 * WHY IT EXISTS NOW. `pilot.js` states the SISO decision with its own falsifier: "cross-coupling
 * is MEASURED by the probe and reported — 0.5% on the arm; a plant where it is large needs the
 * MIMO QP this deliberately does not contain". That 0.5% is `nCross`, the mean of the last tenth
 * of the cross trace — the SETTLED DC of a HELD probe. Measured on the 2R arm WHILE MOVING, by
 * differencing two runs of the deterministic plant around a du step and splitting the result into
 * symmetric and antisymmetric halves, the LINEAR half of the shoulder-to-elbow response goes the
 * WRONG WAY to 0.12 per unit du and peaks 2818 solver steps later, against a DC of 0.028. It is
 * invariant across a 10x range of du, which is what makes it linear rather than large-signal, and
 * it is pose-dependent: 18% of its DC at one phase of the lap, 432% at another, and the
 * elbow-to-shoulder channel reads -3605% at the second pose.
 *
 * So the falsifier fired, and the statistic that was watching for it was structurally unable to
 * see it: a DC cannot report a transient that reverses and comes back.
 *
 * WHAT CHANGES. Nothing, unless a caller passes a cross grid. `boxQP` above is untouched, so
 * every golden vector, every published number and every plant on record stands.
 *
 * @param {Float64Array[][]} H  H[j][c] is the grid response of OUTPUT j to channel c's decisions.
 *   The diagonal is each channel's own `hGrid`; an absent or null off-diagonal is treated as zero,
 *   so a caller with no cross model gets exactly `boxQP` per channel.
 * @param {Float64Array[]} f0   predicted free error per output, N long each.
 * @param {Float64Array[]} u    warm start per channel, modified in place and returned.
 */
export function boxQPm(H, f0, u, { U, lambda, uPrev = null, iters = 8, notch = null, mu = 0,
  notches = null }) {
  const nc = u.length, N = u[0].length;
  const key = `m${N}:${nc}`;
  let ws = WS.get(key);
  if (!ws) {
    ws = { r: [], g: [], Tg: [], y: [], uOld: [] };
    for (let c = 0; c < nc; c++) {
      ws.r.push(new Float64Array(N)); ws.g.push(new Float64Array(N));
      ws.Tg.push(new Float64Array(N)); ws.y.push(new Float64Array(N));
      ws.uOld.push(new Float64Array(N));
    }
    WS.set(key, ws);
  }
  const { r, g, Tg, y, uOld } = ws;
  const nList = notchList(notch, notches);
  let nB = null, nMu = 0, nSum = 0;
  if (nList.length) {
    nB = notchBasis(ws, N, nList);
    for (const n of nList) { nMu = Math.max(nMu, n.weight); nSum += n.weight; }
  }
  for (let c = 0; c < nc; c++) y[c].set(u[c]);
  // THE LIPSCHITZ BOUND, AND THE CRUDE ONE IS NOT AFFORDABLE HERE. `boxQP` bounds ||T|| by
  // sum|h|, which for a block operator would generalise to the sum over ALL blocks — a factor of
  // nc too large, and a step size nc times too small changes what a ONE-iteration solve returns
  // rather than merely slowing convergence. Since one and two iterations are what this project
  // measured as best, that is a behaviour change dressed as a safety margin.
  //
  // Holder's inequality gives a bound that is both rigorous and tight enough: ||A||_2^2 <=
  // ||A||_1 * ||A||_inf, and for the block operator those are the max column-sum and max row-sum
  // of the per-block sum|h|. On a diagonal H it reduces to exactly `boxQP`'s own bound.
  const ah = [];
  for (let j = 0; j < nc; j++) {
    ah.push(new Float64Array(nc));
    for (let c = 0; c < nc; c++) {
      const h = H[j] && H[j][c];
      if (!h) continue;
      let s = 0;
      for (let m = 0; m < h.length; m++) s += Math.abs(h[m]);
      ah[j][c] = s;
    }
  }
  //
  // AND WHEN H IS DIAGONAL THE PROBLEM SEPARATES, SO THE BOUND MUST TOO. A shared step size is
  // correct but not NEUTRAL: on an uncoupled plant it hands the weaker channel the stronger
  // channel's bound and a smaller step, so a MIMO solve on a SISO plant returns a different plan
  // — measured at 6.2e-4 after one iteration and 1.1e-1 after sixty against `boxQP`. A solver
  // whose no-coupling case is not a no-op cannot be compared against the machine on record
  // (rule 21), and the separation is exact rather than approximate: with no off-diagonal block
  // the stacked objective is a sum of independent per-channel objectives.
  let diag = true;
  for (let j = 0; j < nc && diag; j++) for (let c = 0; c < nc; c++) if (j !== c && ah[j][c] !== 0) { diag = false; break; }
  const stepOf = new Float64Array(nc);
  if (diag) {
    for (let c = 0; c < nc; c++) {
      const muC = Array.isArray(mu) ? (mu[c] || 0) : mu;
      stepOf[c] = 1 / ((2 * (ah[c][c] * ah[c][c] + 4 * lambda + muC) + 2 * nSum * N) || 1);
    }
  } else {
    let col = 0, row = 0;
    for (let c = 0; c < nc; c++) { let s = 0; for (let j = 0; j < nc; j++) s += ah[j][c]; col = Math.max(col, s); }
    for (let j = 0; j < nc; j++) { let s = 0; for (let c = 0; c < nc; c++) s += ah[j][c]; row = Math.max(row, s); }
    let muMax = 0;
    for (let c = 0; c < nc; c++) muMax = Math.max(muMax, Array.isArray(mu) ? (mu[c] || 0) : mu);
    const L = (2 * (col * row + 4 * lambda + muMax) + 2 * nSum * N) || 1;
    for (let c = 0; c < nc; c++) stepOf[c] = 1 / L;
  }
  const tmp = new Float64Array(N);
  let t = 1;
  for (let it = 0; it < iters; it++) {
    // residual per OUTPUT: r_j = f0_j + sum_c T(H[j][c]) y_c
    for (let j = 0; j < nc; j++) {
      r[j].set(f0[j]);
      for (let c = 0; c < nc; c++) {
        const h = H[j] && H[j][c];
        if (!h) continue;
        applyT(h, y[c], N, tmp);
        for (let i = 0; i < N; i++) r[j][i] += tmp[i];
      }
    }
    // gradient per CHANNEL: 2 sum_j T(H[j][c])^T r_j, plus the rate and magnitude terms
    for (let c = 0; c < nc; c++) {
      Tg[c].fill(0);
      for (let j = 0; j < nc; j++) {
        const h = H[j] && H[j][c];
        if (!h) continue;
        applyTt(h, r[j], N, tmp);
        for (let i = 0; i < N; i++) Tg[c][i] += tmp[i];
      }
      const p0 = uPrev ? uPrev[c] : 0;
      const muC = Array.isArray(mu) ? (mu[c] || 0) : mu;
      for (let i = 0; i < N; i++) {
        const yi = y[c][i];
        const back = i > 0 ? y[c][i - 1] : p0;
        const fwd = i < N - 1 ? y[c][i + 1] : yi;
        g[c][i] = 2 * Tg[c][i] + 2 * lambda * ((yi - back) - (fwd - yi));
        if (muC > 0) g[c][i] += 2 * muC * yi;
      }
      if (nB) {
        for (let k = 0; k < nList.length; k++) {
          const ck = nB.c[k], sk = nB.s[k], wk = nList[k].weight;
          let dc = 0, ds = 0;
          for (let i = 0; i < N; i++) { dc += y[c][i] * ck[i]; ds += y[c][i] * sk[i]; }
          const ac = 2 * wk * dc, as = 2 * wk * ds;
          for (let i = 0; i < N; i++) g[c][i] += ac * ck[i] + as * sk[i];
        }
      }
    }
    const tNext = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
    const beta = (t - 1) / tNext;
    for (let c = 0; c < nc; c++) {
      uOld[c].set(u[c]);
      const Uc = Array.isArray(U) ? U[c] : U;
      for (let i = 0; i < N; i++) {
        let v = y[c][i] - stepOf[c] * g[c][i];
        if (v > Uc) v = Uc; else if (v < -Uc) v = -Uc;
        u[c][i] = v;
      }
      for (let i = 0; i < N; i++) y[c][i] = u[c][i] + beta * (u[c][i] - uOld[c][i]);
    }
    t = tNext;
  }
  return u;
}

/**
 * MOVE BLOCKING: the plan parameterised by m << N coefficients, so a QP iteration costs
 * O(N*m) instead of O(N*M).
 *
 * WHY THE DEPLOYED PATH NEEDED IT. `cost()` on the 2R arm at the bench cell puts 60% of the
 * arithmetic in the QP's iterations and their term is `2*N*min(N,M)` per channel — quadratic,
 * because every one of the N moves is a free variable. Cutting the horizon instead was measured
 * (`test/_plc.mjs`) and it hits a CLIFF: halving N is free and even better, and a third of it
 * collapses every program to about 1x. So the horizon cannot be shortened further and the
 * exponent has to change instead.
 *
 * THE BLOCKS ARE NON-UNIFORM AND THAT IS THE WHOLE DESIGN. A receding horizon applies only
 * `u[0]` and re-solves, so uniform blocks would coarsen exactly the one number that reaches the
 * machine — the first block would average the applied move over its width. The widths here GROW
 * along the horizon: the first moves stay free, and the far leads — where `lambda*||Du||^2`
 * already forces the plan to be smooth, and where this project has measured three times that
 * forecast quality does not move the machine — share coefficients.
 *
 * THE BOX SURVIVES EXACTLY, WHICH IS WHY THIS IS NOT AN APPROXIMATION OF THE CONSTRAINT. `B` is
 * 0/1 with disjoint columns, so every `u[i]` equals exactly one `v[k]`, and `|u[i]| <= U` for all
 * i is `|v[k]| <= U` for all k. The projection step is the same clamp on a shorter vector rather
 * than a relaxation of it. What IS an approximation is the SEARCH SPACE — the solver can no
 * longer express a plan that is not piecewise constant on this layout — and only the machine can
 * say what that costs.
 *
 * THE PRECOMPUTATION IS COMMISSIONING-TIME, which is the PLC discipline stated as code. `T*B` is
 * N x m and depends only on (h, N, layout), all fixed once the model is fitted, so the deployed
 * tick never forms it. `makeBlockBasis` is called once and its result handed in; a function that
 * rebuilt it per tick would move the cost rather than remove it.
 *
 * @param {object} basis from `makeBlockBasis` — the layout and the precomputed T*B
 * @param {Float64Array} f0 the free response, N long
 * @param {Float64Array} u the plan, N long, read as the warm start and overwritten
 */
export function makeBlockBasis(h, N, m, { grow = null } = {}) {
  // THE LAYOUT: widths that grow along the horizon, fine at the present. `grow` lets a caller
  // state its own; the default doubles, which puts the first two moves on their own blocks at
  // any m >= 2 and is the shape classical move blocking uses for the same reason.
  let w = grow;
  if (!w) {
    w = [];
    let left = N, k = m, width = 1;
    for (let j = 0; j < m; j++, k--) {
      // the last block takes whatever is left, so the layout always covers exactly N
      const take = j === m - 1 ? left : Math.min(left - (k - 1), width);
      w.push(take); left -= take; width *= 2;
    }
    // A LAYOUT THAT DID NOT COVER N WOULD LEAVE MOVES NOBODY SOLVED FOR, silently reading zero.
    if (left > 0) w[w.length - 1] += left;
  }
  const idx = new Int32Array(N);          // which block each step belongs to
  let at = 0;
  for (let k = 0; k < w.length; k++) for (let j = 0; j < w[k]; j++) if (at < N) idx[at++] = k;
  const mm = w.length;
  // T*B, column by column: column k is T applied to the indicator of block k.
  const col = new Float64Array(N), TB = [];
  for (let k = 0; k < mm; k++) {
    col.fill(0);
    for (let i = 0; i < N; i++) if (idx[i] === k) col[i] = 1;
    const out = new Float64Array(N);
    applyT(h, col, N, out);
    TB.push(out);
  }
  // THE LIPSCHITZ BOUND FROM THE MATRIX ITSELF, not from a bound on a bound. `sum|h|` bounds
  // ||T||, and ||B|| is sqrt(max width), so the crude product would be loose by exactly the
  // widest block — and a loose bound costs iterations one-for-one, which this whole function
  // exists to save. Holder gives ||A||^2 <= ||A||_1 * ||A||_inf on the actual T*B.
  let n1 = 0, nInf = 0;
  for (let k = 0; k < mm; k++) { let s = 0; for (let i = 0; i < N; i++) s += Math.abs(TB[k][i]); if (s > n1) n1 = s; }
  for (let i = 0; i < N; i++) { let s = 0; for (let k = 0; k < mm; k++) s += Math.abs(TB[k][i]); if (s > nInf) nInf = s; }
  return { N, m: mm, widths: w, idx, TB, tbNorm2: n1 * nInf,
    // B'B is diagonal for disjoint 0/1 columns, so the magnitude penalty is one multiply per
    // coefficient rather than a matrix.
    bb: Float64Array.from(w) };
}

export function boxQPBlocked(basis, f0, u, { U, lambda, uPrev = 0, iters = 8, mu = 0 }) {
  const { N, m, idx, TB, tbNorm2, bb } = basis;
  const v = new Float64Array(m), vy = new Float64Array(m), vOld = new Float64Array(m);
  const gv = new Float64Array(m), r = new Float64Array(N);
  // THE WARM START PROJECTED ONTO THE BASIS: the mean of the incoming plan over each block, which
  // is the least-squares projection for disjoint 0/1 columns. Starting from zero would throw away
  // the previous tick's solve, and warm starting is most of what makes a truncated solve work.
  for (let i = 0; i < N; i++) v[idx[i]] += u[i];
  for (let k = 0; k < m; k++) v[k] /= bb[k];
  vy.set(v);
  // ||D B v||^2 needs the difference of the EXPANDED plan, and for a piecewise-constant plan the
  // only non-zero differences are at block boundaries plus the step from `uPrev` — so the rate
  // penalty is m terms, not N.
  const L = (2 * (tbNorm2 + 4 * lambda + mu)) || 1;
  const step = 1 / L;
  let t = 1;
  for (let it = 0; it < iters; it++) {
    // r = T B vy + f0
    for (let i = 0; i < N; i++) r[i] = f0[i];
    for (let k = 0; k < m; k++) {
      const c = TB[k], vk = vy[k];
      if (vk === 0) continue;
      for (let i = 0; i < N; i++) r[i] += c[i] * vk;
    }
    // g = 2 (T B)^T r  +  rate  +  magnitude
    for (let k = 0; k < m; k++) {
      const c = TB[k];
      let s = 0;
      for (let i = 0; i < N; i++) s += c[i] * r[i];
      const back = k > 0 ? vy[k - 1] : uPrev;
      const fwd = k < m - 1 ? vy[k + 1] : vy[k];    // free end, as the dense solver has
      gv[k] = 2 * s + 2 * lambda * ((vy[k] - back) - (fwd - vy[k]));
      if (mu > 0) gv[k] += 2 * mu * bb[k] * vy[k];  // ||Bv||^2 = sum width_k v_k^2
    }
    vOld.set(v);
    for (let k = 0; k < m; k++) {
      let x = vy[k] - step * gv[k];
      if (x > U) x = U; else if (x < -U) x = -U;    // exactly the dense box, on a shorter vector
      v[k] = x;
    }
    const tNext = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
    const beta = (t - 1) / tNext;
    for (let k = 0; k < m; k++) vy[k] = v[k] + beta * (v[k] - vOld[k]);
    t = tNext;
  }
  for (let i = 0; i < N; i++) u[i] = v[idx[i]];
  return u;
}
