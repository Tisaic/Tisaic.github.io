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
  /**
   * @param {number[]|null} select the SUBSPACE the recursion may move, as column indices into the
   *   full row. Null (every plant on record) adapts everything and is byte-identical.
   *
   * WHY A SUBSPACE AT ALL. The covariance update is 2n^2 per sample and `test/_rowmake.mjs`
   * measured it at 242,978 MAC against the forecast's 14,233 — SEVENTEEN TIMES — so the fit, not
   * the controller, is what breaks the scan budget. Every solver change made against that budget
   * so far (horizon, hoist, move blocking) was working on the small term.
   *
   * IT RESTRICTS THE CORRECTION, NOT THE PREDICTION, and that distinction is the whole design.
   * The residual is computed against the FULL weight vector — every commissioned column still
   * predicts — and only the listed columns are allowed to move. So the commissioned fit stays a
   * floor exactly as `setAnchor` intends, and what adaptation adds on top of it is a low-rank
   * correction rather than a re-identification. That matches what the mechanism was measured to
   * be: the gain comes from FORGETTING (lambda 1 loses it), which is tracking a moving operating
   * point, and a moving operating point is low-dimensional by nature.
   *
   * WHAT IT IS WORTH: O(m^2 + n) instead of O(n^2). At n 176 and m 32 that is 2,224 against
   * 61,952 per channel — 28x — and it costs no forecast capacity at all, which is what
   * distinguishes it from a feature cut.
   *
   * WHAT WOULD KILL IT: a RANDOM subspace of the same size adapting as well as a chosen one.
   * Then the selection carries nothing and this is capacity, not structure (rule 9, both halves).
   */
  constructor(n, nLeads, ridge, lambda = 1, select = null) {
    if (!(n > 0) || !(nLeads > 0)) throw new Error('rls: n and nLeads must be positive');
    if (!(ridge > 0)) throw new Error('rls: ridge must be positive — P0 is its inverse');
    if (!(lambda > 0) || lambda > 1) throw new Error('rls: lambda must be in (0, 1]');
    this.n = n; this.nLeads = nLeads; this.lambda = lambda; this.ridge = ridge;
    // THE SUBSPACE IS VALIDATED, not trusted: an index past the row silently corrupts a weight
    // that belongs to another term, and the only symptom would be a worse machine.
    this.sel = null;
    if (select && select.length && select.length < n) {
      const seen = new Set();
      for (const i of select) {
        if (!Number.isInteger(i) || i < 0 || i >= n) {
          throw new Error(`rls: subspace index ${i} is outside a row of ${n}`);
        }
        seen.add(i);
      }
      this.sel = Int32Array.from([...seen].sort((a, b) => a - b));
    }
    const m = this.sel ? this.sel.length : n;
    this.m = m;
    this._xs = this.sel ? new Float64Array(m) : null;
    // ROW-MAJOR FLAT, not an array of arrays: this is the object that has to survive being
    // hand-ported to structured text, where a jagged allocation is not a thing that exists.
    this.P = new Float64Array(m * m);
    for (let i = 0; i < m; i++) this.P[i * m + i] = 1 / ridge;
    this.theta = Array.from({ length: nLeads }, () => new Float64Array(n));
    // Scratch, allocated once. A cyclic task must not allocate (the same reason `boxQP` keeps
    // a static workspace), and this runs every sample forever.
    this._g = new Float64Array(m);
    this.rows = 0;
    // COVARIANCE WIND-UP IS THE FAILURE MODE OF `lambda < 1`, AND IT IS OFF UNTIL ASKED FOR.
    // Every update divides `P` by lambda, so on a stream that carries no new information the
    // covariance inflates geometrically — 1/0.999 per row is 1.03 per hundred, e^31 over the
    // thirty thousand rows this axis actually runs — and the gain grows until the estimator
    // is chasing noise at full strength. Measured on EMPS: lambda 0.999 reads 32.5x on the
    // first lap of a program it has never seen and 0.08x by lap twenty, which is the same
    // estimator winding up rather than two different behaviours.
    this.traceMax = 0;
    // DIRECTIONAL FORGETTING, ALSO OFF UNTIL ASKED FOR. Ordinary forgetting divides the WHOLE
    // covariance by lambda, including directions the incoming row says nothing about, which is
    // where the residual drift lives: the bound above slows that inflation but does not stop it
    // (measured, +12% off the floor at bound 128 over sixty laps, +118% at 512). Discounting
    // only ALONG the row leaves an unexcited direction at exactly the confidence commissioning
    // earned for it — which is the confidence that has to survive for the model to transfer to
    // a program that excites something else.
    this.directional = false;
    // AND AN ANCHOR AT THE COMMISSIONED WEIGHTS, WHICH IS A DIFFERENT REQUIREMENT FROM EITHER
    // OF THE TWO ABOVE AND THE ONE THAT DECIDES WHETHER FORGETTING IS SAFE TO SHIP AT ALL.
    //
    // The model is identified on a BROADBAND SCRIBBLE. A forgetting law discounts old rows on a
    // timer, so run one production program long enough and every row that carried the
    // scribble's excitation has been discounted away — what is left is a model of that one
    // program, which is the memory being rebuilt by an adaptive law and the exact object the
    // retirement removes. It performs well immediately and goes bad slowly, the worst shape a
    // failure can have, because a short test cannot see it.
    //
    // The requirement is therefore asymmetric: the commissioned identification is kept for
    // ever, and forgetting applies only to what adaptation ADDS on top of it. That is an anchor
    // rather than a bound — the estimate is pulled back toward `theta0` a fixed fraction per
    // row, so the deviation is a bounded fading correction and cannot accumulate into a
    // replacement for the fit it started from.
    this._anchor = null; this._kappa = 0;
  }

  /**
   * PULL THE ESTIMATE BACK TOWARD THE COMMISSIONED WEIGHTS, `kappa` per admitted row.
   *
   * `1/kappa` is the pull-back's time constant IN ROWS, which is the unit the caller actually
   * thinks in ("adaptation may drift for about ten thousand samples before commissioning wins
   * it back"), and it makes the constant a property of the stream rather than of the plant
   * (rule 32). At steady state the deviation settles where the update's pull and the anchor's
   * balance, so the commissioned fit is a floor the estimate cannot walk away from however
   * long the machine runs on one program.
   *
   * Call AFTER `seed`: what is anchored is what the batch fit handed over, and taking a copy
   * matters because `theta` is the SHARED array the pilot mutates in place.
   *
   * @param {number} kappa fraction per row in [0, 1), or 0 to leave the estimate unanchored
   */
  setAnchor(kappa) {
    if (!(kappa > 0)) { this._anchor = null; this._kappa = 0; return; }
    this._anchor = this.theta.map((t) => Float64Array.from(t));
    this._kappa = kappa;
  }

  /**
   * BOUND THE COVARIANCE AS A MULTIPLE OF THE TRACE IT WAS SEEDED WITH, never as an absolute
   * number: `P0` comes from the commissioning fit and carries that fit's own column scale, so
   * a constant here would be a constant in units nobody chose (rule 32). `mult` is how much
   * uncertainty the tracker is allowed to REGAIN relative to what the batch fit ended with —
   * 1 means it may never be less sure than commissioning left it, larger values buy alertness
   * and pay for it in gain. Call AFTER `seed`, or it bounds the prior instead of the posterior.
   *
   * @param {number} mult multiple of the current trace, or 0 to leave the covariance unbounded
   */
  setTraceBound(mult) {
    if (!(mult > 0)) { this.traceMax = 0; return; }
    const m = this.m;
    let tr = 0;
    for (let i = 0; i < m; i++) tr += this.P[i * m + i];
    this.traceMax = mult * tr;
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
    const sel = this.sel, m = this.m;
    // THE ROW GATHERED ONTO THE SUBSPACE. `xs` is what the covariance sees; the full `x` is still
    // what the residual below is computed against, so every commissioned column keeps predicting
    // and only the listed ones are allowed to move.
    const xs = sel ? this._xs : x;
    if (sel) for (let i = 0; i < m; i++) xs[i] = x[sel[i]];
    // g = P xs, and r = xs'P xs in the same pass.
    let r = 0;
    for (let i = 0; i < m; i++) {
      let acc = 0;
      const base = i * m;
      for (let j = 0; j < m; j++) acc += P[base + j] * xs[j];
      g[i] = acc;
      r += xs[i] * acc;
    }
    const denom = lam + r;
    if (!(Math.abs(denom) > 1e-300)) return r;
    // EVERY LEAD SHARES THIS GAIN VECTOR. That is the whole economy of the thing: the
    // covariance work is done once and each readout costs one dot product and one axpy.
    for (let L = 0; L < this.nLeads; L++) {
      const yL = y[L];
      if (yL === null || yL === undefined || !Number.isFinite(yL)) continue;
      const th = this.theta[L];
      // THE RESIDUAL IS AGAINST THE WHOLE MODEL, always — restricting it as well would make the
      // recursion chase an error its own frozen columns are already explaining, which is a
      // different and much worse estimator than the one this is meant to be.
      let e = yL;
      for (let i = 0; i < n; i++) e -= th[i] * x[i];
      const s = e / denom;
      if (sel) for (let i = 0; i < m; i++) th[sel[i]] += g[i] * s;
      else for (let i = 0; i < n; i++) th[i] += g[i] * s;
    }
    // P = (P - g g'/denom) / lambda, kept symmetric by construction rather than by hope:
    // the upper triangle is computed and mirrored, so rounding cannot make P asymmetric and
    // then indefinite over a long run.
    //
    // DIRECTIONALLY, THE 1/lambda IS APPLIED TO ONE DIRECTION INSTEAD OF ALL OF THEM, and the
    // coefficient is derived rather than chosen. `g g'/r` is the projection onto the row's own
    // direction in the P-metric, and the ordinary update inflates that direction's variance
    // from `r*lambda/(lambda+r)` to `r/(lambda+r)`. Adding `(1-lambda) g g'/(r (lambda+r))`
    // and NOT dividing the matrix reproduces exactly that, and leaves every other direction
    // where it was — so a directional run and an ordinary one differ only in what happens
    // where the data said nothing.
    if (this.directional && r > 1e-300) {
      const cf = ((1 - lam) - r) / (r * denom);
      for (let i = 0; i < m; i++) {
        const gi = cf * g[i];
        for (let j = i; j < m; j++) {
          const v = P[i * m + j] + gi * g[j];
          P[i * m + j] = v; P[j * m + i] = v;
        }
      }
    } else {
      for (let i = 0; i < m; i++) {
        const gi = g[i] / denom;
        for (let j = i; j < m; j++) {
          const v = (P[i * m + j] - gi * g[j]) / lam;
          P[i * m + j] = v; P[j * m + i] = v;
        }
      }
    }
    // THE ANCHOR IS APPLIED AFTER THE UPDATE, so a row's information is taken in full and then
    // the accumulated DEVIATION is discounted — not the row. Discounting the row instead would
    // make the estimator deaf to a plant that really changed, which is the thing the whole
    // exercise is trying to keep.
    if (this._kappa > 0) {
      const k = this._kappa;
      for (let L = 0; L < this.nLeads; L++) {
        const th = this.theta[L], a = this._anchor[L];
        for (let i = 0; i < n; i++) th[i] += k * (a[i] - th[i]);
      }
    }
    // THE BOUND IS APPLIED AS A SCALING, NOT A CLAMP ON THE DIAGONAL. Scaling keeps `P`
    // positive definite and keeps every direction's RELATIVE confidence — which is the
    // information the seed exists to carry — where clamping the diagonal alone would leave
    // the off-diagonals describing a covariance that no longer exists.
    if (this.traceMax > 0) {
      let tr = 0;
      for (let i = 0; i < m; i++) tr += P[i * m + i];
      if (tr > this.traceMax) {
        const sc = this.traceMax / tr;
        for (let k = 0; k < m * m; k++) P[k] *= sc;
      }
    }
    this.rows++;
    return r;
  }

  /**
   * SEED FROM A COMMISSIONED FIT, WHICH IS WHAT MAKES ADAPTATION SAFE RATHER THAN MERELY
   * POSSIBLE — and the reason is the measured failure of the first-order law it replaces.
   *
   * WHY LMS DESTROYED TRANSFER — and the intuitive answer is WRONG, which is worth writing
   * down because it was believed here for long enough to be built on.
   *
   * THE WRONG ANSWER: that LMS is unconstrained in directions the current program does not
   * excite, so the weights drift there. It cannot be: an LMS step is `mu e x/||x||^2`, which
   * lies ALONG x, so a strictly unexcited direction does not move under LMS at all. Measured
   * while testing this file: an RLS on a diagonal prior moves such a weight by 0.00e+0, and
   * one on a full batch posterior moves it by 0.198 — through the prior's own off-diagonal
   * CORRELATION, which is correct inference and not drift.
   *
   * THE ACTUAL MECHANISM IS THAT LMS NEVER STOPS. Its gain is `mu/||x||^2`, a function of the
   * current row alone and not of how much data has already been seen, so it answers noise at
   * full strength for ever. An RLS gain is `Px/(lambda + x'Px)` and `P` SHRINKS as information
   * arrives, so the estimator converges and then holds. Measured: 20,000 rows of a plant the
   * model already fits exactly, plus noise — the seeded RLS ends 2.8e-4 from truth and the
   * constant-gain law 4.3e-3, fifteen times further, having moved for no reason.
   *
   * AND "KEEPS MOVING ON A PROGRAM IT IS ALREADY RIGHT ABOUT" IS THE WHOLE PROBLEM, because a
   * repeating program presents the same rows every lap: the law chases the same noise into the
   * same corner, lap after lap, and specialises to the trajectory in front of it. That is a
   * memory being rebuilt by an adaptive law — the exact object the retirement removes. On EMPS
   * it cost the held-out program everything: 8.27x to 0.98x with every lead adapting.
   *
   * SO THE SEED IS WHAT MAKES THE GAIN DECAY FROM THE RIGHT PLACE. Starting `P` at the
   * commissioning posterior rather than at an invented prior means the law begins already
   * confident in proportion to the data that earned that confidence, instead of spending its
   * first thousand rows re-learning what it was told. The LMS law tried to bound this with a
   * clamp on each weight's own magnitude, and the code's own comment said that was the wrong
   * quantity; the right one is INFORMATION, and it is not a clamp at all but the recursion
   * working as designed.
   *
   * AND IT REMOVES THE SCALE-RELATIVE PROBLEM FOR FREE. `P0` comes from the batch fit, which
   * saw the whole record and therefore knew the column scale the ridge is a fraction of, so
   * the online fit continues that exact problem instead of inventing a prior for a different
   * one.
   *
   * @param {number} lead
   * @param {ArrayLike<number>} theta0 the commissioned weights for this lead
   * @param {Float64Array|null} [P0] the shared posterior, row-major n*n. Supplied once for
   *   the bank, not once per lead: every lead shares the design matrix, so they share it.
   */
  seed(lead, theta0, P0 = null) {
    if (theta0.length !== this.n) throw new Error('rls: seed length does not match n');
    this.theta[lead].set(theta0);
    if (P0) {
      if (P0.length !== this.n * this.n) throw new Error('rls: seed covariance is not n x n');
      // UNDER A SUBSPACE THE SEED IS THE POSTERIOR'S OWN BLOCK, not a fresh prior. The
      // commissioning fit knew the column scale and the correlations between exactly these
      // terms, and dropping to `1/ridge` here would throw that away and hand the recursion a
      // prior for a different problem — which is the failure `seed` exists to prevent.
      // The marginal block ignores correlation with the frozen columns, which is the honest
      // approximation: those directions cannot move, so their covariance cannot be carried.
      if (this.sel) {
        const sel = this.sel, m = this.m, n = this.n;
        for (let i = 0; i < m; i++) {
          for (let j = 0; j < m; j++) this.P[i * m + j] = P0[sel[i] * n + sel[j]];
        }
      } else this.P.set(P0);
    }
  }

  /**
   * `x'Px` WITHOUT MOVING ANYTHING — the model's predictive variance at this row, which is how
   * far the row sits outside what the fit has already seen. `update` computes it anyway on the
   * way to the gain; this is the same product for a caller that wants to DECIDE whether to
   * update, which a repeating program makes necessary: its rows stop carrying information
   * after the first lap and accumulating them drags the model toward a collinear solution.
   */
  innovation(x) {
    const n = this.n, P = this.P, sel = this.sel, m = this.m;
    // THE VARIANCE IS THE ONE THE RECURSION ACTUALLY HOLDS, which under a subspace is the
    // variance of the directions it can move. The innovation gate reads this to decide whether a
    // row is informative, and a gate scored on a covariance the estimator does not have would be
    // answering about a different model — the instrument failing before the model (rule 17).
    const xs = sel ? this._xs : x;
    if (sel) for (let i = 0; i < m; i++) xs[i] = x[sel[i]];
    let r = 0;
    for (let i = 0; i < m; i++) {
      let acc = 0;
      const base = i * m;
      for (let j = 0; j < m; j++) acc += P[base + j] * xs[j];
      r += xs[i] * acc;
    }
    return r;
  }

  /** The current estimate for one lead. */
  weights(lead) { return this.theta[lead]; }

  /** MAC per sample, so the budget can be read off rather than argued. */
  cost() {
    const n = this.n, m = this.m;
    // THE COVARIANCE WALKS THE SUBSPACE, THE READOUTS WALK THE ROW. A cost model that kept
    // reporting 2n^2 under a subspace would claim a saving that never happened, and one that
    // reported 2m^2 for the readouts would hide the residual pass that still costs n per lead.
    return { covariance: 2 * m * m, perLead: 2 * n, total: 2 * m * m + 2 * n * this.nLeads,
      subspace: m < n ? m : null,
      bytes: 8 * (m * m + n * this.nLeads) };
  }
}
