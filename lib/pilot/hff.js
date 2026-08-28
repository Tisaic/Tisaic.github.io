/**
 * @file HARMONIC FEEDFORWARD — a lap-periodic correction identified ON the machine.
 *
 * A program that repeats has an error that repeats, and an error that repeats is a sum of
 * harmonics of the lap. So invert the machine at those harmonics: perturb each one, measure
 * what comes back, and solve for the perturbation that cancels what is there. It is a
 * Newton step against a FROZEN operator — identify once, then refine — which is what
 * separates it from iterative learning, where every lap buys one update and nothing is ever
 * modelled.
 *
 * THIS FILE EXISTS BECAUSE THE METHOD WAS MEASURED ON TWO MACHINES THAT SHARE NO PHYSICS
 * and the differences between them turned out to be constants, not method. It carries no
 * per-plant number: everything that was hand-set when this lived inside one test is now
 * measured from the plant it is pointed at. Imports nothing.
 *
 * WHAT THE CALLER OWES IT: a program that closes, an error read in a frame that DOES NOT
 * ROTATE with the path, and a correction channel in the same units as that error. The frame
 * is not a detail — the same solve in a path-normal frame measures 1.09x where the world
 * frame measures 8.86x, because the normal direction and the Jacobian both rotate around
 * the lap, so one injected harmonic comes back smeared across its neighbours and the
 * operator is then not the diagonal being inverted.
 *
 * WHAT IT MEASURES RATHER THAN ASSUMES. Every one of these was a hand-set constant when
 * this lived inside one test, and every one of them turned out to belong to that plant:
 *
 *  1. HOW MANY HARMONICS. 16 is where a compliant two-link arm's channel stops being able
 *     to act; a servo axis whose position loop reaches 160 rad/s leaves a factor of 33 on
 *     the table at that count (7.5x against 248x). There is no count here. Every harmonic
 *     up to `nh` is offered and each one's step is scaled by two measured factors:
 *
 *       CONFIDENCE  1/(1+rel^2)   rel = the least-squares residual of the operator fit at
 *                                 this harmonic, relative to the response it is fitting.
 *                                 2c probes determine a 2c-square operator EXACTLY and can
 *                                 therefore say nothing about how well; 2c+1 is the first
 *                                 count that leaves a residual at all.
 *       REACH       min(1, |G|)   |G| < 1 means the channel spends more command at this
 *                                 harmonic than it removes error. Correction and error are
 *                                 in the same units, so this is a comparison, not a
 *                                 threshold. It is LOAD-BEARING and it is not an
 *                                 attenuation in disguise: removed, the arm goes 4.81x ->
 *                                 1.05x, because the near-zero-gain harmonics then demand
 *                                 corrections the machine cannot make; on the servo axis,
 *                                 where every harmonic has reach, it is inert to four
 *                                 significant figures (241.95x against 241.97x).
 *
 *  2. HOW FAR TO STEP. 1.0 converges the servo axis on its first pass and DIVERGES the arm,
 *     whose frozen operator is a poor Newton model of a plant that is not linear in the
 *     correction. Rejecting the pass and stopping is honest and useless — 1.00x, measured.
 *     So a rejected pass HALVES the step and retries from the last good weights: one lap per
 *     rejection, and a plant that takes the full step never pays.
 *
 *  3. HOW TO PROBE, AND HOW HARD — AND THIS ONE CANNOT BE DECIDED FROM THE FIT. Two designs
 *     are offered, BASIS (one input slot at a time, every harmonic in phase: a spiky probe
 *     that leaves most of the lap barely perturbed) and SPREAD (all slots at once,
 *     Schroeder-phased, crest factor near sqrt(2)), each at two amplitudes, and all four are
 *     commissioned briefly and SCORED ON THE MACHINE. They have to be, because the fit
 *     ranks them backwards. On the servo axis the best cross-prediction (basis at 0.10,
 *     0.006) is the WORST controller of the four and the worst cross-prediction (spread at
 *     0.25, 0.029) is the best; on the arm, dropping the probe amplitude from 0.25 to 0.10
 *     of the error peak is worth 3.1x on the delivered machine (3.44e-1 -> 1.10e-1) while
 *     its fit residual moves the WRONG WAY, 0.006 -> 0.008. This is the same rule the
 *     pilot's verify round exists for: a number computed from the model cannot check the
 *     model.
 *
 *     The two designs must be compared at MATCHED PEAK, not matched per-harmonic amplitude
 *     — they have different crest factors by construction, so equal amplitude puts the
 *     basis probe at sqrt(nh/2) times the peak. Uncorrected, that clipped against the
 *     authority cap on the servo axis and read as the design failing (1.03x); at matched
 *     peak the two land within 1% there and the difference that survives is on the arm.
 *
 * WHAT IT COSTS, WHICH IS LAPS AND NOT PERFORMANCE. Four candidates commissioned and one
 * refined is 36 laps on the servo axis and 57 on the arm, against the 14 the hand-tuned
 * version needed. Given those laps it does not give anything up: on the ARM, the plant the
 * tuned constants were derived for, it reaches 7.93x at 57 laps and 9.17x at 82 — PAST the
 * tuned 8.86x, and still descending when it was stopped. The trade is not accuracy for
 * generality. It is that a machine which chooses its own step takes smaller ones, so the
 * same endpoint costs more laps — and the laps buy 32x on a plant nobody tuned it for.
 */

/** A tiny complex-weight set: `re[c][h]`, `im[c][h]`. */
function zeroW(channels, nh) {
  return { re: Array.from({ length: channels }, () => new Float64Array(nh)),
    im: Array.from({ length: channels }, () => new Float64Array(nh)) };
}

export class HarmonicFF {
  /**
   * @param {object} o
   * @param {number} o.lap      samples in one lap of the program. The program must CLOSE.
   * @param {number} [o.channels=1]  correction channels, in the error's own frame.
   * @param {number} [o.nh]     harmonics offered. Defaults to lap/8 capped at 256; it is a
   *                            CEILING, not a selection — the shrink does the selecting.
   * @param {number} [o.probeFrac=0.25]  the LARGER of the two probe peaks tried, as a
   *                            fraction of the measured error peak. Both are scored on the
   *                            machine, so this is a search bound and not a setting.
   * @param {number[]} [o.probeFracs]  the ladder explicitly, instead of [frac, frac/2.5].
   * @param {'auto'|'spread'|'basis'} [o.probeStyle='auto']  'auto' scores both designs on
   *                            the machine; naming one skips the search and its cost.
   * @param {number} [o.trialPasses=3]  refinement passes each candidate gets before it is
   *                            scored. Longer is a better ranking and a longer commission.
   * @param {number} [o.step=1] the step a pass STARTS at. It backtracks from here; the
   *                            guard, not this, is what stops divergence.
   * @param {number} [o.passes=8]  refinement laps that IMPROVE the machine.
   * @param {number} [o.backtracks=5]  halvings of the step allowed before giving up.
   * @param {number} [o.uMax=Infinity]  cap on the correction's peak, per channel. Give it:
   *                            it is what the probe amplitudes and the deployed table are
   *                            held to, and without it a probe can be sized past the
   *                            machine's authority.
   * @param {boolean} [o.shrink=true]  the confidence factor. Off is the control.
   * @param {boolean} [o.reach=true]  the reach factor. Off is the control — and on the arm
   *                            it is the difference between 4.81x and 1.05x.
   */
  constructor(o) {
    this.lap = o.lap | 0;
    this.channels = o.channels || 1;
    this.nh = o.nh || Math.min(256, Math.max(1, this.lap >> 3));
    this.probeFrac = o.probeFrac ?? 0.25;
    this.step = o.step ?? 1;
    this.passes = o.passes ?? 8;
    this.backtracks = o.backtracks ?? 5;
    this.uMax = o.uMax ?? Infinity;
    this.shrink = o.shrink !== false;
    this.reach = o.reach !== false;
    this.probeStyle = o.probeStyle || 'auto';
    this.probeFracs = o.probeFracs || null;
    this.trialPasses = o.trialPasses ?? 3;
    this.W = zeroW(this.channels, this.nh);
    this.active = null;          // the table currently being applied
    this.G = null;               // [h] -> 2x2 per channel pair, as a (2c x 2c) matrix
    this.rel = new Float64Array(this.nh);
    this.gain = new Float64Array(this.nh);
    // SCHROEDER PHASES — flat magnitude, crest factor ~sqrt(2). See (1) above.
    this.phase = new Float64Array(this.nh);
    for (let h = 1; h <= this.nh; h++) this.phase[h - 1] = -Math.PI * h * (h - 1) / this.nh;
    this._tbl = null;          // the synthesised deployed table, rebuilt when W changes
  }

  /** The correction at lap index `k`, as a `channels`-vector. Zero before commissioning. */
  at(k) {
    // Synthesis is O(nh x lap); a caller reads this once per SAMPLE, so it must not be here.
    if (!this.active && !this._tbl) this._tbl = this._table(this.W);
    const t = this.active || this._tbl;
    const kk = ((k % this.lap) + this.lap) % this.lap, out = new Array(this.channels);
    for (let c = 0; c < this.channels; c++) out[c] = t[c][kk];
    return out;
  }

  /** Synthesise a weight set into `channels` lap-length tables, capped at `uMax`. */
  _table(W) { return this._cap(this._tableRaw(W)); }

  _cap(t) {
    if (Number.isFinite(this.uMax)) {
      for (let c = 0; c < this.channels; c++) {
        let pk = 0; for (let k = 0; k < this.lap; k++) pk = Math.max(pk, Math.abs(t[c][k]));
        if (pk > this.uMax) { const s = this.uMax / pk; for (let k = 0; k < this.lap; k++) t[c][k] *= s; }
      }
    }
    return t;
  }

  /** The same synthesis with no authority cap, for measuring what a probe WOULD be. */
  _tableRaw(W) {
    const { lap, nh, channels } = this;
    const t = Array.from({ length: channels }, () => new Float64Array(lap));
    for (let h = 1; h <= nh; h++) {
      const w = 2 * Math.PI * h / lap;
      for (let c = 0; c < channels; c++) {
        const a = W.re[c][h - 1], b = W.im[c][h - 1];
        if (a === 0 && b === 0) continue;
        const tc = t[c];
        for (let k = 0; k < lap; k++) { const x = w * k; tc[k] += a * Math.cos(x) + b * Math.sin(x); }
      }
    }
    return t;
  }

  /** Project `channels` lap-length error signals onto the harmonics. */
  _project(err) {
    const { lap, nh, channels } = this;
    const re = Array.from({ length: channels }, () => new Float64Array(nh));
    const im = Array.from({ length: channels }, () => new Float64Array(nh));
    for (let h = 1; h <= nh; h++) {
      const w = 2 * Math.PI * h / lap;
      for (let c = 0; c < channels; c++) {
        let a = 0, b = 0; const e = err[c];
        for (let k = 0; k < lap; k++) { const x = w * k; a += e[k] * Math.cos(x); b += e[k] * Math.sin(x); }
        re[c][h - 1] = 2 * a / lap; im[c][h - 1] = 2 * b / lap;
      }
    }
    return { re, im };
  }

  /**
   * Route, probe, identify, refine.
   *
   * @param {(corr: HarmonicFF|null) => Promise<{score:number, err:Array<ArrayLike<number>>}>}
   *   run — drive the machine for at least one settled lap. `corr` is this object with its
   *   active table set (call `corr.at(k)`), or null for the clean machine. Return the
   *   scalar the refinement is judged on and one lap-length error signal per channel, in
   *   the SAME frame and units as the correction.
   */
  async commission(run) {
    const { nh, channels } = this;
    const rep = { base: 0, best: 0, hist: [], stopped: null, probeAmp: 0, probePeak: 0,
      gain: null, rel: null, alive: 0 };

    this.active = null;
    const base = await run(null);
    rep.base = base.score;
    const E0 = this._project(base.err);

    // ---- probe amplitude from the ERROR the probe is there to measure, not from a number.
    let epk = 0;
    for (let c = 0; c < channels; c++) for (let k = 0; k < this.lap; k++) epk = Math.max(epk, Math.abs(base.err[c][k]));
    const amp = this.probeFrac * epk / Math.sqrt(2 * nh);   // a starting scale; the peak decides
    const target = this.probeFrac * epk;
    rep.probeAmp = amp;

    // ---- PROBE. Which design identifies a plant better is a PROPERTY OF THAT PLANT and
    // cannot be set in advance, so both are built here and the CANDIDATE LOOP below scores
    // them on the machine. It has to be the machine: cross-prediction — fitting each
    // operator and letting it predict the other design's laps — was built first and it
    // RANKS THEM BACKWARDS, picking spread on the arm (residual 0.015 against basis's
    // 0.114) where basis is the better controller, and picking the worst of four on the
    // servo axis. Built, measured, dead; the residual survives only as the per-harmonic
    // confidence, which is a different question.
    const mm = 2 * channels;
    const probeSet = async (style, target) => {
      const V = [], D = [];
      // THE OPERATOR AT ONE HARMONIC HAS (2c)^2 ENTRIES AND EACH PROBE GIVES 2c EQUATIONS,
      // so 2c probes determine it EXACTLY and can say nothing about how well; 2c+1 is the
      // first count that leaves a residual at all. Three was right for one channel and
      // silently UNDERDETERMINED for two — the solve returned a fitted rank-deficient
      // answer, |G| came back as noise, and the arm measured 1.00x with every check green.
      const nq = mm + 1;
      for (let q = 0; q < nq; q++) {
        const Wp = zeroW(channels, nh);
        if (style === 'basis' && q < mm) {
          // ONE INPUT SLOT AT A TIME, every harmonic in phase.
          const c = q >> 1, sl = q & 1;
          for (let h = 0; h < nh; h++) { if (sl) Wp.im[c][h] = amp; else Wp.re[c][h] = amp; }
        } else {
          // ALL SLOTS AT ONCE, SCHROEDER-PHASED — crest factor near sqrt(2). Channel c
          // advances c times as fast in the probe index, so the injection vectors span the
          // channel space; a FIXED phase offset per channel does not, because it is one
          // rotation applied to every probe and they all lie in the same subspace.
          const off = style === 'basis' ? 0 : q;
          for (let h = 0; h < nh; h++) {
            const a = this.phase[h] + off * 2 * Math.PI / nq;
            for (let c = 0; c < channels; c++) {
              const ac = a + 2 * Math.PI * off * c / nq;
              Wp.re[c][h] = amp * Math.cos(ac); Wp.im[c][h] = amp * Math.sin(ac);
            }
          }
        }
        // MATCHED PEAK, NOT MATCHED PER-HARMONIC AMPLITUDE. The two designs have different
        // crest factors by construction, so equal per-harmonic amplitude means the basis
        // probe hits nh/sqrt(2nh) times the peak — on the servo axis that clipped against
        // the authority cap and the comparison was between a probe and a saturation.
        // What the machine constrains is the PEAK, so that is what is held equal.
        const raw = this._tableRaw(Wp);
        let pk0 = 0;
        for (let c = 0; c < channels; c++) for (let k = 0; k < this.lap; k++) pk0 = Math.max(pk0, Math.abs(raw[c][k]));
        const sc0 = pk0 > 0 ? Math.min(target, this.uMax) / pk0 : 1;
        for (let h = 0; h < nh; h++) for (let c = 0; c < channels; c++) { Wp.re[c][h] *= sc0; Wp.im[c][h] *= sc0; }
        const tbl = this._table(Wp);
        let pk = 0; for (let k = 0; k < this.lap; k++) pk = Math.max(pk, Math.abs(tbl[0][k]));
        rep.probePeak = Math.max(rep.probePeak, pk);
        this.active = tbl;
        const r = await run(this);
        V.push(Wp); D.push(this._project(r.err));
      }
      return { V, D };
    };
    // ---- CANDIDATES, AND THE MACHINE PICKS. Probe design and probe amplitude both change
    // the operator, both are plant properties, and NEITHER can be chosen from the fit. On
    // BOTH plants measured, the candidate with the WORST fit residual is the best controller
    // and the one with the best residual is the worst:
    //
    //   servo axis  spread 25%  residual 0.029  machine 2.395e-3   <- best machine
    //               basis  10%  residual 0.006  machine 3.023e-3   <- best fit, worst machine
    //   arm         spread 10%  residual 0.008  machine 1.099e-1   <- best machine
    //               basis  25%  residual 0.004  machine 1.134e-1   <- best fit
    //
    // So each candidate is commissioned briefly and scored ON THE MACHINE, which is the same
    // rule this project's pilot uses for its own verify round.
    const styles = this.probeStyle === 'auto' ? ['spread', 'basis'] : [this.probeStyle];
    const fracs = this.probeFracs || [this.probeFrac, this.probeFrac / 2.5];
    const cands = [];
    for (const st of styles) for (const fr of fracs) cands.push({ style: st, frac: fr });

    /** Least squares for the (2c x 2c) real operator at each harmonic, from one probe set. */
    const fit = (set) => {
      const out = new Array(nh);
      for (let h = 0; h < nh; h++) {
        const x = [], y = [];
        for (let q = 0; q < set.V.length; q++) {
          const xv = [], yv = [];
          for (let c = 0; c < channels; c++) {
            xv.push(set.V[q].re[c][h], set.V[q].im[c][h]);
            yv.push(set.D[q].re[c][h] - E0.re[c][h], set.D[q].im[c][h] - E0.im[c][h]);
          }
          x.push(xv); y.push(yv);
        }
        const A = Array.from({ length: mm }, () => new Float64Array(mm));
        for (let i = 0; i < mm; i++) for (let j = 0; j < mm; j++) { let t = 0; for (let q = 0; q < x.length; q++) t += x[q][i] * x[q][j]; A[i][j] = t; }
        const M = Array.from({ length: mm }, () => new Float64Array(mm));
        let ok = true;
        for (let r = 0; r < mm; r++) {
          const b2 = new Float64Array(mm);
          for (let i = 0; i < mm; i++) { let t = 0; for (let q = 0; q < x.length; q++) t += x[q][i] * y[q][r]; b2[i] = t; }
          const sol = solve(A, b2);
          if (!sol) { ok = false; break; }
          M[r] = sol;
        }
        out[h] = ok ? M : null;
      }
      return out;
    };
    /** Relative error with which `Ms` reproduces `set`'s responses, per harmonic. */
    const predict = (Ms, set) => {
      const rel = new Float64Array(nh); let rs = 0, ss = 0;
      for (let h = 0; h < nh; h++) {
        const M = Ms[h]; if (!M) { rel[h] = 1; continue; }
        let r2 = 0, s2 = 0;
        for (let q = 0; q < set.V.length; q++) {
          const xv = [], yv = [];
          for (let c = 0; c < channels; c++) {
            xv.push(set.V[q].re[c][h], set.V[q].im[c][h]);
            yv.push(set.D[q].re[c][h] - E0.re[c][h], set.D[q].im[c][h] - E0.im[c][h]);
          }
          for (let r = 0; r < mm; r++) {
            let p = 0; for (let j = 0; j < mm; j++) p += M[r][j] * xv[j];
            r2 += (yv[r] - p) ** 2; s2 += yv[r] ** 2;
          }
        }
        rel[h] = Math.sqrt(r2 / Math.max(s2, 1e-300)); rs += r2; ss += s2;
      }
      return { rel, all: Math.sqrt(rs / Math.max(ss, 1e-300)) };
    };
    const install = (set) => {
      this.G = fit(set);
      const sc = predict(this.G, set);
      for (let h = 0; h < nh; h++) {
        this.rel[h] = sc.rel[h];
        const M = this.G[h];
        if (!M) { this.gain[h] = 0; continue; }
        let gs = 0; for (let r = 0; r < mm; r++) for (let j = 0; j < mm; j++) gs += M[r][j] * M[r][j];
        this.gain[h] = Math.sqrt(gs / mm);
      }
      return sc.all;
    };

    let laps = 1, pickSet = null, pickC = null, pickScore = Infinity;
    rep.candidates = [];
    if (cands.length > 1) {
      for (const cd of cands) {
        const set = await probeSet(cd.style, cd.frac * epk);
        const cross = install(set);
        const trial = await this._refine(run, base, this.trialPasses, 0);
        laps += (mm + 1) + trial.laps;
        rep.candidates.push({ ...cd, cross, score: trial.best });
        if (trial.best < pickScore) { pickScore = trial.best; pickSet = set; pickC = cd; }
      }
    } else {
      pickC = cands[0];
      pickSet = await probeSet(pickC.style, pickC.frac * epk);
      laps += mm + 1;
    }
    rep.style = pickC.style; rep.frac = pickC.frac;
    rep.cross = install(pickSet);
    rep.gain = Array.from(this.gain); rep.rel = Array.from(this.rel);
    const fin = await this._refine(run, base, this.passes, this.backtracks);
    laps += fin.laps;
    rep.hist = fin.hist; rep.step = fin.step; rep.finalStep = fin.finalStep;
    const bestW = fin.W; let best = fin.best;
    this.W = bestW;
    this._tbl = null;
    this.active = this._table(bestW);
    rep.best = best;
    for (let h = 0; h < nh; h++) {
      if (this.G[h] && 1 / (1 + this.rel[h] * this.rel[h]) > 0.5 && this.gain[h] > 1e-3) rep.alive++;
    }
    rep.laps = laps;
    this.report = rep;
    return rep;
  }

  /**
   * Damped Newton against the frozen operator, with a BACKTRACKING line search.
   *
   * A FIXED STEP IS THE LAST PLANT CONSTANT, and it is the one that cost the most: 1.0
   * converges a servo axis on the first pass and DIVERGES a compliant two-link arm on it,
   * because the arm's frozen operator is a poor Newton model of a plant that is not linear
   * in the correction. Rejecting the pass and stopping is honest but useless (1.00x
   * measured). Rejecting it, HALVING, and retrying from the last good weights costs one lap
   * per rejection and needs nothing set: a plant that takes the full step never pays.
   */
  async _refine(run, base, passes, backtracks) {
    const { nh, channels } = this, mm = 2 * channels;
    let cur = base, best = base.score;
    const acc = zeroW(channels, nh), bestW = zeroW(channels, nh);
    let step = this.step, budget = passes + backtracks, laps = 0;
    const hist = [], steps = [];
    while (budget-- > 0 && step >= this.step / (1 << backtracks)) {
      const Er = this._project(cur.err);
      const trial = zeroW(channels, nh);
      for (let c = 0; c < channels; c++) { trial.re[c].set(acc.re[c]); trial.im[c].set(acc.im[c]); }
      for (let h = 0; h < nh; h++) {
        const M = this.G[h]; if (!M) continue;
        const b = new Float64Array(mm);
        for (let c = 0; c < channels; c++) { b[2 * c] = -Er.re[c][h]; b[2 * c + 1] = -Er.im[c][h]; }
        const v = solve(M, b); if (!v) continue;
        const sh = (this.shrink ? 1 / (1 + this.rel[h] * this.rel[h]) : 1)
          * (this.reach ? Math.min(1, this.gain[h]) : 1);
        if (!(sh > 0)) continue;
        for (let c = 0; c < channels; c++) {
          trial.re[c][h] += sh * step * v[2 * c];
          trial.im[c][h] += sh * step * v[2 * c + 1];
        }
      }
      this.active = this._table(trial);
      const next = await run(this);
      laps++; hist.push(next.score); steps.push(step);
      // A pass must EARN its lap: an improvement inside a tenth of a percent is convergence,
      // and the step is better spent probing than repeating it. A pass that made the machine
      // WORSE is not a step toward anything — but it is evidence about the step, so halve
      // and retry from the last good weights rather than throwing the lap away.
      if (!(next.score < best * (1 - 1e-3))) { step /= 2; continue; }
      best = next.score; cur = next;
      for (let c = 0; c < channels; c++) {
        acc.re[c].set(trial.re[c]); acc.im[c].set(trial.im[c]);
        bestW.re[c].set(trial.re[c]); bestW.im[c].set(trial.im[c]);
      }
    }
    return { best, W: bestW, hist, step: steps, finalStep: step, laps };
  }
}

/** Gauss–Jordan with partial pivoting. Returns null on a singular matrix. */
function solve(Ain, bin) {
  const n = bin.length, a = [];
  let scale = 0;
  for (let i = 0; i < n; i++) {
    const r = new Float64Array(n + 1);
    for (let j = 0; j < n; j++) { r[j] = Ain[i][j]; scale = Math.max(scale, Math.abs(r[j])); }
    r[n] = bin[i]; a.push(r);
  }
  // A RELATIVE pivot floor, not an absolute one. An absolute 1e-300 passes a matrix that is
  // rank-deficient in every way that matters and returns a fitted answer, which is how an
  // underdetermined probe design produced a plausible operator and a machine that got worse.
  const tol = scale * n * 2.3e-16;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (!(Math.abs(a[p][c]) > tol)) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let j = c; j <= n; j++) a[r][j] -= f * a[c][j];
    }
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i][n] / a[i][i];
  return out;
}
