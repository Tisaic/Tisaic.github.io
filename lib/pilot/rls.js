/**
 * @file SHARED-COVARIANCE MULTI-TARGET RLS — the fit the online budget forces, and the
 *       adaptation the retired memory has to be replaced by. One object, two requirements.
 *
 * WHY IT HAS TO EXIST AT ALL. The pilot fits its forecast bank by batch ridge: accumulate
 * `X'X` over the whole record, factor it, and do that once PER LEAD. That is
 * normal-equations-and-Cholesky, an OFFLINE algorithm — measured at ~20 GMAC per channel per
 * layer, about two million cycles of a PLC's 10% budget — and the standing requirement is
 * that everything runs ONLINE, inside 10% of EVERY 1 ms scan, commissioning and fit included.
 * Batch does not miss that by a margin; it is the wrong shape for it.
 *
 * AND THE SAME OBJECT IS THE ANSWER TO A SECOND QUESTION. Retiring the lap-indexed rung
 * leaves its accuracy to be recovered by something addressed by STATE. First-order LMS was
 * tried and measured: on the EMPS axis its best case is +0.3% on the program it can see and
 * it takes a held-out program from 8.27x to 0.98x — worse than doing nothing. A second-order
 * update does not take a gradient step and hope; it maintains the EXACT ridge solution over a
 * forgetting window, so "keep re-identifying" and "fit it in the scan" turn out to be one
 * piece of code rather than two.
 *
 * THE STRUCTURE THAT MAKES IT AFFORDABLE, pinned numerically by `test/pilot/shared.test.mjs`:
 * every lead of the forecast bank is fitted on the SAME design matrix — same features, same
 * rows, different targets — because a lead is a different y, not a different x. So `X'X` is
 * common to all of them and only `X'y` differs. One covariance update per sample at 2n²,
 * shared; then one cheap readout update per lead, reusing the SAME gain vector. At n = 37 and
 * a bank of 68 leads that is 2,738 MAC for the covariance against 68 separate ones.
 *
 * ITS RELATIONSHIP TO THE BATCH FIT IS EXACT, NOT APPROXIMATE, and that is the gate this has
 * to pass before it goes near a machine. With `lambda = 1` and `P0 = (1/ridge)·I`, the RLS
 * recursion after N rows returns precisely `(X'X + ridge·I)^-1 X'y` — the same estimate
 * `solveRidge` computes by Cholesky. A new fitting method that quietly changes the model is
 * worse than a slow one, so `test/pilot/rls.test.mjs` asserts agreement against the existing
 * batch solver on a fixed dataset rather than asserting that the code runs.
 *
 * `lambda < 1` is then the ONLY difference between "fit it online" and "keep adapting": it
 * discounts old rows and is what turns the estimator into a tracker. One knob, and it is the
 * knob the memory's replacement lives on.
 */

/**
 * @param {number} n  feature count
 * @param {number} nLeads how many targets share this design matrix
 * @param {number} ridge  the batch fit's ridge, so `P0 = (1/ridge)I` reproduces it exactly
 * @param {number} [lambda] forgetting factor in (0, 1]. 1 = accumulate everything, which is
 *   the batch fit; below 1 the estimator tracks and old rows decay.
 */
export class SharedRLS {
  constructor(n, nLeads, ridge, lambda = 1) {
    if (!(n > 0) || !(nLeads > 0)) throw new Error('rls: n and nLeads must be positive');
    if (!(ridge > 0)) throw new Error('rls: ridge must be positive — P0 is its inverse');
    if (!(lambda > 0) || lambda > 1) throw new Error('rls: lambda must be in (0, 1]');
    this.n = n; this.nLeads = nLeads; this.lambda = lambda; this.ridge = ridge;
    // ROW-MAJOR FLAT, not an array of arrays: this is the object that has to survive being
    // hand-ported to structured text, where a jagged allocation is not a thing that exists.
    this.P = new Float64Array(n * n);
    for (let i = 0; i < n; i++) this.P[i * n + i] = 1 / ridge;
    this.theta = Array.from({ length: nLeads }, () => new Float64Array(n));
    // Scratch, allocated once. A cyclic task must not allocate (the same reason `boxQP` keeps
    // a static workspace), and this runs every sample forever.
    this._g = new Float64Array(n);
    this.rows = 0;
  }

  /**
   * One row, all leads. `y[j]` may be null for a lead whose target has not arrived yet —
   * a far lead early in a record has no truth, and pairing it with the present one would fit
   * the wrong question and leave those equations in the model for ever.
   *
   * @param {ArrayLike<number>} x the shared feature row
   * @param {ArrayLike<number|null>} y one target per lead, or null to skip that lead
   * @returns {number} the innovation variance x'Px — the leverage of this row, free here,
   *   and the standard measure of how far it sits outside what the fit has seen.
   */
  update(x, y) {
    const n = this.n, P = this.P, g = this._g, lam = this.lambda;
    // g = P x, and r = x'Px in the same pass.
    let r = 0;
    for (let i = 0; i < n; i++) {
      let acc = 0;
      const base = i * n;
      for (let j = 0; j < n; j++) acc += P[base + j] * x[j];
      g[i] = acc;
      r += x[i] * acc;
    }
    const denom = lam + r;
    if (!(Math.abs(denom) > 1e-300)) return r;
    // EVERY LEAD SHARES THIS GAIN VECTOR. That is the whole economy of the thing: the
    // covariance work is done once and each readout costs one dot product and one axpy.
    for (let L = 0; L < this.nLeads; L++) {
      const yL = y[L];
      if (yL === null || yL === undefined || !Number.isFinite(yL)) continue;
      const th = this.theta[L];
      let e = yL;
      for (let i = 0; i < n; i++) e -= th[i] * x[i];
      const s = e / denom;
      for (let i = 0; i < n; i++) th[i] += g[i] * s;
    }
    // P = (P - g g'/denom) / lambda, kept symmetric by construction rather than by hope:
    // the upper triangle is computed and mirrored, so rounding cannot make P asymmetric and
    // then indefinite over a long run.
    for (let i = 0; i < n; i++) {
      const gi = g[i] / denom;
      for (let j = i; j < n; j++) {
        const v = (P[i * n + j] - gi * g[j]) / lam;
        P[i * n + j] = v; P[j * n + i] = v;
      }
    }
    this.rows++;
    return r;
  }

  /** The current estimate for one lead. */
  weights(lead) { return this.theta[lead]; }

  /** MAC per sample, so the budget can be read off rather than argued. */
  cost() {
    const n = this.n;
    return { covariance: 2 * n * n, perLead: 2 * n, total: 2 * n * n + 2 * n * this.nLeads,
      bytes: 8 * (n * n + n * this.nLeads) };
  }
}
