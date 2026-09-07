/**
 * DISTILLED ITERATION — the deployed half of plan §49.
 *
 * Iterative learning reaches accuracies no model-based feedforward here matches, and what it
 * converges to is indexed by POSITION IN A LAP: on a trajectory the machine has not run it is
 * worth less than doing nothing (measured at 0.53x-0.55x by three independent routes, one of
 * them a textbook norm-optimal ILC). This module deploys what that iteration converged to
 * WITHOUT the index: the converged correction is regressed onto a local window of the COMMANDED
 * reference, and the regression is what ships.
 *
 * The deployed object is one weight vector per channel. No QP, no forecast bank, no tracker, no
 * lap index and no per-plant constant. `cost()` reports its own MAC/decision because a block
 * that cannot state its slice does not ship (the PLC discipline).
 *
 * THE WINDOW MUST STRADDLE NOW, AND THIS REFUSES OTHERWISE. §49.14 measured the matched control:
 * the same 79 features over the same 1536-sample span, translated so no tap lies in the future,
 * deliver 0.89x — WORSE THAN DOING NOTHING on all three programs — against 1.43x for the same
 * taps straddling now, with the fit explaining 0.41/0.33 against 0.75/0.69. A plant inverse is
 * non-causal whenever the plant has delay or non-minimum-phase zeros, and this machine behaves
 * accordingly. A causal window is therefore a misconfiguration and not a conservative choice.
 *
 * `solveRidge` is imported rather than copied: it is the repository's one ridge solve, and a
 * second copy is the fault this project has paid for repeatedly. It is used at FIT time only —
 * the deploy path touches nothing but the weight vectors.
 */

import { solveRidge } from './pilot.js';
import { SharedRLS } from './rls.js';

/** Smoothstep, used for every fade here so nothing switches discontinuously. */
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class DistilPolicy {
  /**
   * @param {object} o
   * @param {number} o.channels          correction channels
   * @param {number[]} o.offsets         command-window offsets in SAMPLES; must straddle 0
   * @param {number[]} [o.signOffsets]   where the direction-of-travel block is evaluated
   * @param {number} [o.uMax=Infinity]   authority cap per channel, the engineer's number
   * @param {number} [o.ridge=1e-6]      fit ridge
   * @param {number} [o.coverageFade=0.25] fraction of the trained speed span over which the
   *   correction fades to zero beyond that span. The measured failure this exists for: a map
   *   fitted at one feed reads 0.75x at half that feed and a per-band map reads 0.53x at an
   *   interpolated one — both WORSE THAN DOING NOTHING, and both outside what the fit saw.
   */
  constructor(o) {
    this.channels = o.channels;
    // THE REFERENCE'S DIMENSION IS NOT THE CORRECTION'S CHANNEL COUNT, and conflating them is a
    // bug this module shipped with. `_row` read `q0[0], q0[1]` literally while the direction
    // block looped over `channels`, so the window block was silently wrong on any plant that is
    // not two-dimensional — a plant-agnostic block that works on one plant's shape. Found by
    // pointing it at a single-axis servo, which is what a second plant is for.
    this.refDim = o.refDim ?? o.channels;
    this.offsets = Array.from(o.offsets).slice().sort((a, b) => a - b);
    this.signOffsets = Array.from(o.signOffsets || [0]);
    this.uMax = o.uMax ?? Infinity;
    this.ridge = o.ridge ?? 1e-6;
    // How much of the observed residual is taken as a correction to the target on each
    // deploy-time row. See `observe`: this is the damping that stands in for the reach
    // factor `HarmonicFF` measures and this block cannot.
    this.adaptRate = o.adaptRate ?? 0.5;
    // THE PLANT'S SIGN, DECLARED BY THE HOST. `observe` reconstructs the target as
    // `applied + adaptSign * adaptRate * truth`, and which way a residual should move the
    // correction depends on how the host defines its truth: on the arm the truth is
    // actual - commanded in joint units and the correction ADDS to the command, so a positive
    // residual needs a NEGATIVE increment (-1); a substrate that reports the error REMAINING
    // after the correction is subtracted has the opposite sign (+1). A sign guessed here is
    // exactly the units error this project keeps paying for, so it is a stated option and the
    // page scores the result a lap either way.
    this.adaptSign = o.adaptSign ?? 1;
    this._adapted = 0;
    this.coverageFade = o.coverageFade ?? 0.25;
    // THE ONLINE FIT, WHICH IS WHAT MAKES THE "NOTHING OFFLINE" CLAIM TRUE OR FALSE.
    // Batch ridge stores every row and ends in a Cholesky — an offline algorithm, and requiring
    // it on the PLC kills the product claim outright rather than by a margin. Streaming, the fit
    // is one shared-covariance update per row: the two channels share a design matrix EXACTLY
    // here (one row, nc targets), which is the clean case the pilot's lead bank is not.
    // Memory becomes O(n^2) instead of O(rows x n) and no row is ever stored.
    this.online = !!o.online;
    if (!(this.channels > 0)) throw new Error('DistilPolicy: channels must be positive');
    if (this.offsets[0] >= 0 || this.offsets[this.offsets.length - 1] <= 0) {
      throw new Error('DistilPolicy: the window must STRADDLE now — a causal-only window is '
        + 'measured worse than doing nothing (plan §49.14), so it is refused rather than fitted');
    }
    this.X = []; this.Y = Array.from({ length: this.channels }, () => []);
    this.spans = [];
    this._rls = null; this._pre = null;
    this.W = null; this.report = null;
    this._sLo = Infinity; this._sHi = -Infinity;
  }

  /** Features per row, computable before any data arrives. */
  get nFeatures() {
    return this.refDim * this.offsets.length
      + 2 * this.refDim * this.signOffsets.length + 1;
  }

  /**
   * The row from a RELATIVE reader: `get(o)` is the commanded reference `o` samples from now,
   * negative for the past. This is the deployed shape — a host's look-ahead closure is exactly
   * this — and the absolute form below wraps it.
   *
   * THE ABSOLUTE FORM CLAMPS AT 0 AND THE RELATIVE ONE MUST NOT. Clamping is right when `k` is
   * an index into a finite record and the window runs off its start; it is wrong for a live
   * reader, where a negative offset is an ordinary request for the past and clamping it would
   * silently feed the row the present instead. Two readers, two behaviours, one row builder.
   */
  _rowFrom(get) {
    const q0 = get(0);
    const D = this.refDim;
    const r = [];
    for (let d = 0; d < D; d++) r.push(q0[d]);
    for (const o of this.offsets) {
      if (o === 0) continue;
      const q = get(o);
      for (let d = 0; d < D; d++) r.push(q[d] - q0[d]);
    }
    // DIRECTION OF TRAVEL. Stribeck friction and backlash both switch on the SIGN of velocity,
    // and no window of POSITIONS recovers a switch — `classic.js` carries the same term for the
    // same reason. Magnitude rides alongside because the friction is not a pure sign.
    for (const o of this.signOffsets) {
      const a = get(o - 1), b = get(o + 1);
      for (let d = 0; d < D; d++) {
        const v = (b[d] - a[d]) * 0.5;
        r.push(Math.sign(v), Math.abs(v));
      }
    }
    r.push(1);
    return r;
  }

  _row(refAt, k, speedAt) {
    const r = this._rowFrom((o) => refAt(Math.max(0, k + o)));
    if (speedAt) { const s = speedAt(k); if (s > 0) { if (s < this._sLo) this._sLo = s; if (s > this._sHi) this._sHi = s; } }
    return r;
  }

  /**
   * One training program: the converged correction and the reference it was converged on.
   * @param {object} p
   * @param {(k:number)=>number[]} p.refAt   the COMMANDED reference, readable at any offset
   * @param {number} p.n                      samples in the program
   * @param {Array<number[]|null>} p.prefix   the converged correction per sample, null where none
   * @param {(k:number)=>number} [p.speedAt]  commanded speed, for the coverage guard
   */
  addProgram({ refAt, n, prefix, speedAt, stride = 1 }) {
    // `stride` is the DECISION stride: one row per decision, which is how the deployed form
    // is evaluated when a host holds the correction between decisions (`AutoStack`'s
    // `distil.stride`). The harness that measured §49 fitted and evaluated at its pilot's
    // sample stride; rows every step against a teacher that moves every decision are the
    // same regression at a different weighting and a different cost.
    const lo = -this.offsets[0];
    let used = 0;
    if (this.online && !this._rls) {
      this._rls = new SharedRLS(this.nFeatures, this.channels, this.ridge, 1);
      // PREQUENTIAL VALIDATION: score each row with the model as it stands BEFORE updating on it.
      // A model that has not seen a row cannot have fitted it, so this is a genuine held-out
      // score that needs no stored data, no folds and no gap — and it CANNOT leak, which the
      // batch path's contiguous split can only approximate. It is also free: the prediction is
      // one dot product the update needs anyway.
      this._pre = { sse: new Float64Array(this.channels), n: 0,
        sy: new Float64Array(this.channels), syy: new Float64Array(this.channels) };
    }
    for (let i = lo + 1; i < n; i += stride) {
      if (!prefix[i]) continue;
      const row = this._row(refAt, i, speedAt);
      if (this.online) {
        const y = [];
        for (let c = 0; c < this.channels; c++) {
          const W = this._rls.weights(c);
          let yh = 0; for (let j = 0; j < row.length; j++) yh += W[j] * row[j];
          const t = prefix[i][c];
          this._pre.sse[c] += (t - yh) ** 2; this._pre.sy[c] += t; this._pre.syy[c] += t * t;
          y.push(t);
        }
        this._pre.n++;
        this._rls.update(row, y);
      } else {
        this.X.push(row);
        for (let c = 0; c < this.channels; c++) this.Y[c].push(prefix[i][c]);
      }
      used++;
    }
    this.spans.push(used);
    return used;
  }

  /**
   * MAC per ROW for the FIT, which the deployed `cost()` deliberately does not include. The
   * shared covariance update is 2n^2 and the per-target readout n each; batch ridge is normal
   * equations plus a Cholesky over every stored row and is not costed here because it is not a
   * candidate for a scan.
   *
   * A row arrives once per DECISION, not once per scan, so the number to compare against the
   * budget is this divided by the decision stride — which the caller knows and this class does
   * not, so it is returned raw and the caller states the stride. Quoting a per-row figure against
   * a per-scan budget is the units error this project keeps paying for.
   */
  fitCost() {
    const n = this.nFeatures;
    return { perRow: 2 * n * n + n * this.channels, stateBytes: 4 * n * n, features: n };
  }

  /**
   * Ridge-solve, and DECIDE. The refusal carries no constant: the fit is compared against
   * SHUFFLED-TARGET controls on its own design matrix, which is what this many features can
   * explain of noise. A fit that does not clear its own capacity control has learned the
   * dictionary and not the machine, and it is refused with that stated.
   *
   * IT IS A PRE-FILTER AND NOT THE DECISION, AND SAYING SO IS THE POINT. Measured over 60 seeds
   * on a pure-noise target it still deploys 5 times at k=5 and 4 at k=19, so raising k does not
   * close it: on roughly a twelfth of draws noise genuinely scores positive through these folds.
   * What this gate is for is catching a fit that is obviously the dictionary, cheaply, before any
   * machine time is spent. THE DECISION IS A MACHINE-SCORED VERIFY — the rest of this library
   * deploys only what measured an improvement on the plant, and a statistical gate does not
   * replace that. A block that presented this number as the safety case would be overselling it.
   *
   * IT TAKES `nControl` DRAWS AND MUST BEAT THE BEST OF THEM, not one draw. Against a single
   * control on a pure-noise target the fit reads 0.003 and the control 0.005 — both are zero to
   * any useful precision and which one wins is a coin flip, so a one-draw rule refuses correctly
   * only by luck and would DEPLOY A POLICY FITTED TO NOISE on another seed. Beating the maximum
   * of k draws is a rank statement — the fit must be first of k+1 — which is self-calibrating and
   * still carries no constant. The cost is k extra ridge solves at COMMISSIONING time only.
   */
  fit(rand = Math.random, nControl = 5) {
    if (this.online) return this._fitOnline();
    if (this.X.length === 0) return (this.report = { deploy: false, reason: 'no training rows' });
    const nF = this.X[0].length;
    if (this.X.length < 2 * nF) {
      return (this.report = { deploy: false, rows: this.X.length, features: nF,
        reason: `under-determined: ${this.X.length} rows for ${nF} features` });
    }
    const r2 = (yh, y) => {
      const m = y.reduce((a, v) => a + v, 0) / y.length;
      let ss = 0, st = 0;
      for (let i = 0; i < y.length; i++) { ss += (y[i] - yh[i]) ** 2; st += (y[i] - m) ** 2; }
      return st > 0 ? 1 - ss / st : 0;
    };
    const dot = (row, W) => { let a = 0; for (let j = 0; j < row.length; j++) a += row[j] * W[j]; return a; };

    const folds = this._folds();
    const heldR2 = [], fitR2 = [], ctlR2 = [];
    for (let c = 0; c < this.channels; c++) {
      // HELD OUT, AND THIS IS THE DECISION. An in-sample fit on pure noise reads the same as an
      // in-sample shuffled control — both are (features/rows) by construction — so comparing them
      // is a coin flip: measured over 40 seeds, a one-draw rule DEPLOYED A NOISE-FITTED POLICY 29
      // times and a best-of-five rule 13 times. Held-out R2 is <= 0 in expectation on noise and
      // high on signal, so it separates them instead of tying with them.
      const yh = [], yv = [];
      for (const f of folds) {
        const Xt = f.train.map((i) => this.X[i]), yt = f.train.map((i) => this.Y[c][i]);
        const Wf = solveRidge(Xt, yt, this.ridge);
        for (const i of f.val) { yh.push(dot(this.X[i], Wf)); yv.push(this.Y[c][i]); }
      }
      heldR2.push(r2(yh, yv));
      const W = solveRidge(this.X, this.Y[c], this.ridge);
      (this.W || (this.W = []))[c] = W;
      fitR2.push(r2(this.X.map((row) => dot(row, W)), this.Y[c]));
      // THE NULL IS BUILT THROUGH THE SAME FOLDS. Held-out R2 on noise is negative in EXPECTATION
      // and not in every draw — measured over 40 seeds, a plain "> 0" rule still deployed a
      // noise-fitted policy 4 times. Running the shuffled targets through the identical fold
      // machinery gives this design matrix and this fold structure their own null distribution,
      // and requiring the real score to beat the best of `nControl` draws is a rank statement:
      // first of k+1, self-calibrating, no constant. The earlier version compared against an
      // IN-SAMPLE null, which is the same quantity as the in-sample fit and therefore tied with it.
      let worstCase = -Infinity;
      for (let d = 0; d < nControl; d++) {
        const sh = this.Y[c].slice();
        for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
        const nh = [], nv = [];
        for (const f of folds) {
          const Ws = solveRidge(f.train.map((i) => this.X[i]), f.train.map((i) => sh[i]), this.ridge);
          for (const i of f.val) { nh.push(dot(this.X[i], Ws)); nv.push(sh[i]); }
        }
        worstCase = Math.max(worstCase, r2(nh, nv));
      }
      ctlR2.push(worstCase);
    }
    // THE BAR IS THE NULL'S OWN BEST DRAW, and better than predicting the mean besides.
    const beat = heldR2.map((v, c) => v > 0 && v > ctlR2[c]);
    const deploy = beat.some(Boolean);
    this.report = {
      deploy, features: nF, rows: this.X.length, programs: this.spans.length,
      folds: folds.length, foldKind: this._foldKind,
      heldOutR2: heldR2, fitR2, controlR2: ctlR2, nControl,
      channelsArmed: beat, mac: this.cost(),
      speedSpan: this._sLo <= this._sHi ? [this._sLo, this._sHi] : null,
      reason: deploy ? null
        : `held-out R² ${heldR2.map((v) => v.toFixed(3))} does not beat the best of ${nControl} `
          + `shuffled nulls through the same folds (${ctlR2.map((v) => v.toFixed(3))}) `
          + `— the fit (${fitR2.map((v) => v.toFixed(3))}) is the dictionary, not the machine`,
    };
    for (let c = 0; c < this.channels; c++) if (!beat[c]) this.W[c] = new Float64Array(nF);
    return this.report;
  }

  /**
   * The streaming fit's decision. Weights come out of the recursion rather than a solve, and the
   * held-out score is PREQUENTIAL — every row was predicted before it was learned from.
   *
   * There is no shuffled null here and that is deliberate rather than an omission: a shuffle
   * needs the whole target column in hand, which is exactly the stored data this path exists to
   * avoid. Prequential R2 on an unlearnable target is reliably negative — the model's early
   * predictions are bad and it never catches up — so the natural zero does the work the null did
   * in the batch path. The residual-risk sentence stands unchanged: this is a pre-filter, and
   * the decision is a machine-scored verify.
   */
  _fitOnline() {
    if (!this._rls || this._pre.n === 0) {
      return (this.report = { deploy: false, reason: 'no training rows' });
    }
    const nF = this.nFeatures, N = this._pre.n;
    this.W = [];
    const heldR2 = [];
    for (let c = 0; c < this.channels; c++) {
      this.W.push(Float64Array.from(this._rls.weights(c)));
      const mean = this._pre.sy[c] / N;
      const sst = this._pre.syy[c] - N * mean * mean;
      heldR2.push(sst > 0 ? 1 - this._pre.sse[c] / sst : 0);
    }
    const beat = heldR2.map((v) => v > 0);
    const deploy = beat.some(Boolean);
    this.report = {
      deploy, features: nF, rows: N, programs: this.spans.length,
      foldKind: 'prequential (predicted before learned from)',
      heldOutR2: heldR2, fitR2: null, controlR2: null,
      channelsArmed: beat, mac: this.cost(), fitMac: this.fitCost(),
      speedSpan: this._sLo <= this._sHi ? [this._sLo, this._sHi] : null,
      reason: deploy ? null
        : `prequential R² ${heldR2.map((v) => v.toFixed(3))} does not beat predicting the mean`,
    };
    for (let c = 0; c < this.channels; c++) if (!beat[c]) this.W[c] = new Float64Array(nF);
    return this.report;
  }

  /**
   * Validation folds. LEAVE ONE PROGRAM OUT where there is more than one, because a program is
   * the natural independent unit and §49 picked the ridge that way.
   *
   * With ONE program it is a CONTIGUOUS split with a GAP of the window span between the halves.
   * A random row split would leak: the rows overlap by construction — two rows a few samples
   * apart read most of the same reference window — so a shuffled hold-out validates against data
   * it has effectively seen and reports a score the deployed policy will not reproduce.
   */
  _folds() {
    const n = this.X.length;
    const idx = (a, b) => { const o = []; for (let i = a; i < b; i++) o.push(i); return o; };
    if (this.spans.length > 1) {
      this._foldKind = 'leave-one-program-out';
      const folds = []; let at = 0;
      for (const len of this.spans) {
        const val = idx(at, at + len);
        const train = idx(0, at).concat(idx(at + len, n));
        if (val.length && train.length > this.X[0].length) folds.push({ train, val });
        at += len;
      }
      if (folds.length) return folds;
    }
    this._foldKind = 'contiguous split with a window-span gap';
    const span = this.offsets[this.offsets.length - 1] - this.offsets[0];
    const cut = Math.floor(n * 0.75);
    return [{ train: idx(0, Math.max(1, cut - span)), val: idx(cut, n) }];
  }

  /**
   * The deployed correction. Clamped at the engineer's authority and FADED outside the speed
   * span the fit actually saw — see `coverageFade`.
   */
  act(refAt, k, speed = null) {
    if (!this.W || !this.report?.deploy) return new Array(this.channels).fill(0);
    const row = this._row(refAt, k, null);
    const g = this._coverage(speed);
    const out = new Array(this.channels);
    for (let c = 0; c < this.channels; c++) {
      let s = 0; const W = this.W[c];
      for (let j = 0; j < row.length; j++) s += W[j] * row[j];
      s *= g;
      out[c] = s > this.uMax ? this.uMax : s < -this.uMax ? -this.uMax : s;
    }
    return out;
  }

  /**
   * THE DEPLOYED FORM A HOST ALREADY HAS THE PIECES FOR. `look(o)` is the commanded reference
   * `o` samples from now — the same closure a receding-horizon rung is driven by — so a caller
   * that can run the pilot can run this with no new plumbing and no absolute sample index.
   * Identical arithmetic to `act`, on a reader that does not clamp the past to the present.
   */
  actLook(look, speed = null) {
    if (!this.W || !this.report?.deploy) return new Array(this.channels).fill(0);
    const row = this._rowFrom(look);
    const g = this._coverage(speed);
    const out = new Array(this.channels);
    for (let c = 0; c < this.channels; c++) {
      let s = 0; const W = this.W[c];
      for (let j = 0; j < row.length; j++) s += W[j] * row[j];
      s *= g;
      out[c] = s > this.uMax ? this.uMax : s < -this.uMax ? -this.uMax : s;
    }
    return out;
  }

  /**
   * ---- KEEP LEARNING AT DEPLOY, WHEN THE INSTALLATION LEAVES THE TRACKER ON.
   *
   * The commissioning fit already STREAMS — one shared-covariance update per row, no row
   * retained — so the estimator that produced `W` is still here and can be handed more rows.
   * That is the whole reason this is small: it is the SAME recursion continuing, not a
   * second adaptive law bolted on, and the commissioned posterior is its prior.
   *
   * WHY IT IS THE RUNG THAT CAN AFFORD THIS. The pilot's own RLS is 72,600 MAC per sample on
   * this arm — the dominant term in `scancost`, and the reason the full composition only fits
   * a PLC scan SLICED. This block's update is `fitCost().perRow`, paid once per DECISION
   * rather than once per scan, so at the stride this method actually runs it is a fraction of
   * budget. `fitCost()` reports it raw and the caller divides by its own stride.
   *
   * ---- THE TARGET, AND THE ONE ASSUMPTION IN IT, STATED.
   *
   * The fit's target is the CONVERGED CORRECTION for a row — what should have been applied.
   * At deploy we observe what WAS applied and what error remained, so the target is
   * reconstructed as `applied + truth`. That treats the plant's local gain from correction
   * to residual as unity IN THE UNITS THE TRUTH ARRIVES IN, which is the same step
   * `HarmonicFF` takes and shrinks by a measured reach factor. Here it is deliberately
   * DAMPED by `adaptRate` instead, because this block has no operator to measure a reach
   * from — so a wrong sign or a wrong scale bleeds in slowly enough to be seen on a lap
   * rather than arriving in one step.
   *
   * ---- WHAT IS NOT ESTABLISHED, SAID PLAINLY.
   *
   * Gated online adaptation is MEASURED for the pilot (arm +29%, tank +18%, EMPS 14.8x ->
   * 55.5x) and the law that it multiplies a model the verify already vouched for is a
   * six-plant result. NONE of that transfers to this block by assertion: it is a different
   * estimator with a different target, and it has NOT been scored on a machine. It ships
   * default OFF and the caller is expected to score it — a lap with it, a lap without —
   * exactly as every other rung here earned its place.
   *
   * @param {Function} look   the same relative reader `actLook` is driven by
   * @param {number|null} speed commanded speed, for the coverage fade
   * @param {number[]} applied what the machine actually got from this block, per channel
   * @param {number[]} truth  the error that remained, per channel, in correction units
   * @returns {boolean} whether the row was learned from
   */
  observe(look, speed, applied, truth) {
    if (!this.W || !this._rls || !this.report?.deploy) return false;
    if (!truth || truth.length !== this.channels) return false;
    // OUTSIDE THE TRAINED SPEED SPAN THE CORRECTION IS ALREADY FADED, so a row taken there
    // is a row whose target the block did not actually command. Learning from it would fit
    // the fade rather than the plant.
    if (this._coverage(speed) < 1) return false;
    for (let c = 0; c < this.channels; c++) {
      if (!Number.isFinite(truth[c]) || !Number.isFinite(applied[c])) return false;
    }
    const row = this._rowFrom(look);
    const y = new Array(this.channels);
    for (let c = 0; c < this.channels; c++) y[c] = applied[c] + this.adaptSign * this.adaptRate * truth[c];
    this._rls.update(row, y);
    // THE DEPLOYED WEIGHTS ARE REFRESHED FROM THE RECURSION, not accumulated separately —
    // two copies of one estimate is how they drift apart.
    for (let c = 0; c < this.channels; c++) {
      this.W[c] = Float64Array.from(this._rls.weights(c));
    }
    this._adapted = (this._adapted || 0) + 1;
    return true;
  }

  /**
   * ---- THE DEPLOYED OBJECT, SERIALISED EXACTLY.
   *
   * What a PLC would hold: one weight vector per channel, the window geometry, the cap, and
   * the coverage span — plus the shared-covariance recursion, so a policy restored from
   * storage can keep learning from where it left off rather than from a fresh prior. Plain
   * arrays, so it round-trips through JSON and `fromJSON` rebuilds a policy whose
   * `actLook` is bit-identical to the one saved. Training rows are NOT kept: the fit
   * streams and never retained them, and a restore is a deployment, not a re-fit.
   */
  toJSON() {
    if (!this.W || !this.report) return null;
    const r = this._rls;
    return {
      v: 1, channels: this.channels, refDim: this.refDim,
      offsets: Array.from(this.offsets), signOffsets: Array.from(this.signOffsets),
      uMax: this.uMax, ridge: this.ridge, adaptRate: this.adaptRate, adaptSign: this.adaptSign,
      coverageFade: this.coverageFade, online: this.online, stride: this.stride || 1,
      W: this.W.map((w) => Array.from(w)),
      report: { ...this.report },
      // NOT the raw sentinels: an unset span is ±Infinity, which JSON turns into null and a
      // restore then read back as a span of [null, null] — a fade that fires everywhere.
      // Found by the round-trip check, which is what it exists for.
      sLo: Number.isFinite(this._sLo) ? this._sLo : null,
      sHi: Number.isFinite(this._sHi) ? this._sHi : null, adapted: this._adapted || 0,
      rls: r ? { n: r.n, nLeads: r.nLeads, lambda: r.lambda, ridge: r.ridge, m: r.m,
        P: Array.from(r.P), theta: r.theta.map((t) => Array.from(t)), rows: r.rows } : null,
    };
  }

  /** @param {object} j what `toJSON` produced @returns {DistilPolicy} */
  static fromJSON(j) {
    if (!j || j.v !== 1) throw new Error('DistilPolicy.fromJSON: not a v1 record');
    const pol = new DistilPolicy({ channels: j.channels, refDim: j.refDim, offsets: j.offsets,
      signOffsets: j.signOffsets, uMax: j.uMax, ridge: j.ridge, adaptRate: j.adaptRate,
      adaptSign: j.adaptSign, coverageFade: j.coverageFade, online: j.online });
    pol.stride = j.stride || 1;
    pol.W = j.W.map((w) => Float64Array.from(w));
    pol.report = { ...j.report };
    pol._sLo = j.sLo ?? Infinity; pol._sHi = j.sHi ?? -Infinity; pol._adapted = j.adapted || 0;
    if (j.rls && j.rls.m === j.rls.n) {
      const r = new SharedRLS(j.rls.n, j.rls.nLeads, j.rls.ridge, j.rls.lambda);
      r.P.set(j.rls.P);
      for (let c = 0; c < r.nLeads; c++) r.theta[c].set(j.rls.theta[c]);
      r.rows = j.rls.rows;
      pol._rls = r;
    }
    return pol;
  }

  /** How many rows this block has learned from since it was deployed. */
  adapted() { return this._adapted || 0; }

  /** 1 inside the trained speed span, fading to 0 over `coverageFade` of that span beyond it. */
  _coverage(speed) {
    const sp = this.report?.speedSpan;
    if (speed == null || !sp) return 1;
    const [lo, hi] = sp, m = Math.max(1e-12, (hi - lo) * this.coverageFade);
    if (speed >= lo && speed <= hi) return 1;
    return speed < lo ? smooth((speed - (lo - m)) / m) : smooth(((hi + m) - speed) / m);
  }

  /**
   * MAC per decision, counted rather than estimated. The dot products dominate; the row build is
   * one subtract per non-zero offset per channel plus the sign block, and `refAt` is a lookup.
   */
  cost() {
    const nF = this.nFeatures;
    const rowOps = this.refDim * (this.offsets.length - 1)
      + 2 * this.refDim * this.signOffsets.length;
    return nF * this.channels + rowOps;
  }
}
