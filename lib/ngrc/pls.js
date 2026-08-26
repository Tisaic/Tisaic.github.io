/**
 * @file PLS — THE INCUMBENT, and the only baseline that makes a soft-sensor claim
 * commercial rather than academic.
 *
 * A Kalman filter needs a physical model, which a real soft sensor does not have: you
 * cannot write the state equations for a composition, a moisture content, or the
 * deflection of a tool you cannot see. What the process industries actually DEPLOY is
 * PLS (partial least squares) on the measured signals — a LINEAR latent-variable fit,
 * trained offline on historical data and recalibrated by hand when it drifts. Both of its
 * documented failure modes are exactly what a learner claims to fix, which is what makes
 * it the honest thing to be measured against.
 *
 * FOR A SINGLE RESPONSE, PLS WITH A COMPONENTS IS EXACTLY A STEPS OF CONJUGATE GRADIENT
 * on the normal equations (Phatak & de Hoog): the PLS solution is the least-squares
 * solution restricted to the order-A Krylov subspace. So this IS PLS, obtained in a form
 * that works from accumulated cross-products and needs no matrix factorisation — which is
 * what lets it run online. Verified against a direct NIPALS implementation: agreement to
 * 2e-16 relative at A <= 3 and 2e-10 at A = 6.
 *
 * RAW SUMS ARE ACCUMULATED AND CENTRED AT FIT TIME, which is exact. Centring online while
 * the mean is still moving is not.
 *
 * TWO VARIANTS, AND THE PAIR IS THE POINT. `lam = 1` accumulates forever and is FROZEN by
 * simply not refitting — the incumbent as actually deployed. `lam < 1` is exponential
 * forgetting, i.e. recursive/adaptive PLS, the stronger and rarer variant. The gap between
 * them is the drift argument measured rather than asserted, and on the soft-sensor plant it
 * is large: immediately after its freeze the frozen model scored 0.2438 — a model fitted on
 * history meeting an operating regime the history did not contain — against 0.0196 adaptive.
 *
 * CHOOSING A: sweep it rather than assume it. On that plant more components was
 * monotonically better (A = 3 -> 0.168, 6 -> 0.031, 12 -> 0.026, 20 -> 0.022), because PLS's
 * advantage lives in the p >> n regime (many correlated sensors, few samples) and a lag
 * window is not that. At full rank it IS ordinary least squares on the window — the
 * strongest linear model available on those signals, which is exactly what a baseline
 * should be.
 */

/** @param {number} dim regressor width @returns {object} accumulator */
export function plsMake(dim) {
  return { dim, n: 0, sy: 0, syy: 0,
    sx: new Float64Array(dim), sxy: new Float64Array(dim),
    sxx: new Float64Array(dim * dim), b: null, b0: 0 };
}

/**
 * One sample into the cross-products.
 * @param {object} p @param {ArrayLike<number>} x @param {number} y
 * @param {number} [lam] exponential forgetting; < 1 makes it adaptive PLS
 */
export function plsObserve(p, x, y, lam) {
  if (lam && lam < 1) {
    p.n *= lam; p.sy *= lam; p.syy *= lam;
    for (let i = 0; i < p.dim; i++) { p.sx[i] *= lam; p.sxy[i] *= lam; }
    for (let i = 0; i < p.dim * p.dim; i++) p.sxx[i] *= lam;
  }
  p.n += 1; p.sy += y; p.syy += y * y;
  for (let i = 0; i < p.dim; i++) {
    p.sx[i] += x[i]; p.sxy[i] += x[i] * y;
    const row = i * p.dim;
    for (let j = 0; j < p.dim; j++) p.sxx[row + j] += x[i] * x[j];
  }
}

/**
 * Refit from the accumulated cross-products. @param {object} p @param {number} A components
 * @returns {boolean} whether a usable fit was produced
 */
export function plsFit(p, A) {
  const d = p.dim;
  if (p.n < d + 20) return false;
  const mx = new Float64Array(d);
  for (let i = 0; i < d; i++) mx[i] = p.sx[i] / p.n;
  const my = p.sy / p.n;
  const S = new Float64Array(d * d), s0 = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    s0[i] = p.sxy[i] - p.n * mx[i] * my;
    for (let j = 0; j < d; j++) S[i * d + j] = p.sxx[i * d + j] - p.n * mx[i] * mx[j];
  }
  // A steps of conjugate gradient on S b = s0, from b = 0  ==  PLS with A components
  const b = new Float64Array(d), r = Float64Array.from(s0), q = Float64Array.from(s0);
  const Sq = new Float64Array(d);
  let rr = 0;
  for (let i = 0; i < d; i++) rr += r[i] * r[i];
  for (let a = 0; a < A && rr > 1e-24; a++) {
    for (let i = 0; i < d; i++) {
      let acc = 0; const row = i * d;
      for (let j = 0; j < d; j++) acc += S[row + j] * q[j];
      Sq[i] = acc;
    }
    let qSq = 0;
    for (let i = 0; i < d; i++) qSq += q[i] * Sq[i];
    if (!(qSq > 1e-24)) break;
    const alpha = rr / qSq;
    for (let i = 0; i < d; i++) { b[i] += alpha * q[i]; r[i] -= alpha * Sq[i]; }
    let rr2 = 0;
    for (let i = 0; i < d; i++) rr2 += r[i] * r[i];
    const beta = rr2 / rr; rr = rr2;
    for (let i = 0; i < d; i++) q[i] = r[i] + beta * q[i];
  }
  if (!b.every(Number.isFinite)) return false;
  let b0 = my;
  for (let i = 0; i < d; i++) b0 -= b[i] * mx[i];
  p.b = b; p.b0 = b0;
  return true;
}

/** @param {object} p @param {ArrayLike<number>} x @returns {number|null} */
export function plsPredict(p, x) {
  if (!p.b) return null;
  let y = p.b0;
  for (let i = 0; i < p.dim; i++) y += p.b[i] * x[i];
  return y;
}
