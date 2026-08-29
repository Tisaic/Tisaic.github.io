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
 *       REACH       min(1,|G|)^p  |G| < 1 means the channel spends more command at this
 *                                 harmonic than it removes error. Correction and error are
 *                                 in the same units, so this is a comparison, not a
 *                                 threshold. The EXPONENT p is chosen on the machine like
 *                                 everything else here; a channel dead by h8 wants a
 *                                 different curve from one flat to h128.
 *
 *  NO NUMBERS ARE QUOTED FOR EITHER FACTOR, deliberately. Both are load-bearing on a plant
 *  whose channel dies and both are near-inert on one whose channel does not, and every time
 *  this file has stated the size of that in a comment the comment has gone stale within the
 *  day — the pass budget alone moved all of them. `test/pilot/hff.test.mjs` measures both,
 *  on a toy plant built for the purpose and on the real servo axis, and ASSERTS the
 *  properties: that each factor's removal costs, that the affordability cut which was built
 *  to replace the weighting is worse than it, and that on an axis where every harmonic has
 *  reach the weighting is inert. A property with a check behind it stays true; a number in
 *  a comment describes the behaviour the code used to have.
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
 * WHAT IT COSTS IS LAPS. Eight candidates are commissioned briefly and one is refined, so
 * this is tens of laps where a hand-tuned solve is about fourteen. A machine that chooses its
 * own step takes smaller ones, and the same endpoint costs more of them.
 *
 * WHAT IT DELIVERS IS NOT STATED HERE. Every figure this header has carried for that has gone
 * stale — the pass budget alone moved all of them, and two headline numbers were published
 * from this file and corrected afterwards. The measurements live where they can be re-run:
 * `test/pilot/hff.test.mjs` (the real servo axis, and a toy plant whose channel dies),
 * `test/flexisim/autostack.test.mjs` (a compliant two-link arm at two stiffnesses, each
 * against the strongest result this repository has at those settings), and
 * `test/pilot/plants.test.mjs` (four more plants that share no physics with either). Each of
 * those asserts its own bar, so a regression fails a check rather than quietly contradicting
 * a comment.
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
   * @param {number} [o.passes=24]  ceiling on refinement laps that IMPROVE the machine. The
   *                            convergence criterion normally stops well short of it.
   * @param {number} [o.backtracks=5]  halvings of the step allowed before giving up.
   * @param {number} [o.uMax=Infinity]  cap on the correction's peak, per channel. Give it:
   *                            it is what the probe amplitudes and the deployed table are
   *                            held to, and without it a probe can be sized past the
   *                            machine's authority.
   * @param {boolean} [o.shrink=true]  the confidence factor. Off is the control.
   * @param {boolean} [o.reach=true]  the reach factor. Off is the control — and on the arm
   *                            removing it costs most of what this converges — measured and
   *                            asserted in `test/pilot/hff.test.mjs`, not quoted here.
   */
  constructor(o) {
    this.lap = o.lap | 0;
    this.channels = o.channels || 1;
    this.nh = o.nh || Math.min(256, Math.max(1, this.lap >> 3));
    this.probeFrac = o.probeFrac ?? 0.25;
    this.step = o.step ?? 1;
    // A BUDGET, NOT A COUNT. The loop stops itself the moment a pass fails to earn a tenth
    // of a percent, so on a plant that converges quickly this costs nothing — the servo axis
    // is done in four. On a plant that does not, eight was simply where the arm's refinement
    // got cut off: measured, it was still descending at pass 25 and again at pass 45, going
    // 7.90x -> 9.17x on laps alone. A number that stops a converging plant early and a
    // non-converging one arbitrarily is a plant constant wearing a budget's clothes.
    this.passes = o.passes ?? 24;
    this.backtracks = o.backtracks ?? 5;
    this.uMax = o.uMax ?? Infinity;
    this.shrink = o.shrink !== false;
    this.reach = o.reach !== false;
    // affordability CUT instead of the proportional weighting: BUILT, MEASURED, WORSE, and
    // kept only so the null stays recorded and checked. `hff.test.mjs` asserts it loses.
    this.admit = !!o.admit;
    this.reachPow = o.reachPow ?? 1;
    this.nhCut = 0;          // 0 = every harmonic offered; set per candidate below
    this.cuts = o.cuts || null;   // force the ceiling options, for one-variable comparisons
    // Broyden damping on the refinement's own secant. 0 disables it — the control.
    this.secant = o.secant ?? 0.5;
    this.refocus = o.refocus !== false;   // re-probe inside the measured band
    this.adm = null;
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
   *
   *   THE SECOND ARGUMENT IS THE PHASE — 'base', 'probe' or 'refine' — and a host stacking
   *   this on top of a REACTIVE layer must use it. The operator is a property of the plant
   *   and the servo, and identifying it through an active box-constrained controller does
   *   not measure that: the controller responds to the probe, the loop is no longer LTI, and
   *   the operator comes back as something that describes neither. Measured on the arm at two
   *   probe amplitudes fifty times apart, 8.64x and 11.27x with erratic traces, against
   *   16.93x for the same solve identified on the machine with the reactive layer OFF. So
   *   disarm reactive layers on 'probe' and arm them on 'base' and 'refine' — the error being
   *   cancelled is the one the deployed machine actually leaves.
   */
  async commission(run) {
    const { nh, channels } = this;
    const rep = { base: 0, best: 0, hist: [], stopped: null, probeAmp: 0, probePeak: 0,
      gain: null, rel: null, alive: 0 };

    this.active = null;
    const base = await run(null, 'base');
    rep.base = base.score;

    // ---- PROBE AMPLITUDE FROM THE MACHINE BEING PROBED, which is not always the machine
    // being corrected. When a host disarms a reactive layer for identification, the plant
    // under the probe has a LARGER error than the deployed one — and sizing the probe from
    // the deployed error then makes it far too small to see through the noise. Measured on
    // the arm: the harmonic rung collapsed from 5.06x to 1.19x when a pilot was deployed
    // beneath it, because its probe shrank with the error the pilot had already removed while
    // identification still happened on the clean machine. One extra lap buys the right scale.
    const idBase = await run(null, 'probe');
    let epk = 0;
    for (let c = 0; c < channels; c++) for (let k = 0; k < this.lap; k++) epk = Math.max(epk, Math.abs(idBase.err[c][k]));
    rep.idBase = idBase.score;
    const amp = this.probeFrac * epk / Math.sqrt(2 * nh);   // a starting scale; the peak decides
    const target = this.probeFrac * epk;
    rep.probeAmp = amp;
    // The operator is fitted from probe response MINUS the un-probed response OF THE SAME
    // MACHINE. Differencing against the deployed machine's spectrum instead would put the
    // layer below into every column of the operator.
    const E0 = this._project(idBase.err);

    // ---- PROBE. Which design identifies a plant better is a PROPERTY OF THAT PLANT and
    // cannot be set in advance, so both are built here and the CANDIDATE LOOP below scores
    // them on the machine. It has to be the machine: cross-prediction — fitting each
    // operator and letting it predict the other design's laps — was built first and it
    // RANKS THEM BACKWARDS, picking spread on the arm (residual 0.015 against basis's
    // 0.114) where basis is the better controller, and picking the worst of four on the
    // servo axis. Built, measured, dead; the residual survives only as the per-harmonic
    // confidence, which is a different question.
    const mm = 2 * channels;
    const probeSet = async (style, target, hMax = nh) => {
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
          for (let h = 0; h < hMax; h++) { if (sl) Wp.im[c][h] = amp; else Wp.re[c][h] = amp; }
        } else {
          // ALL SLOTS AT ONCE, SCHROEDER-PHASED — crest factor near sqrt(2). Channel c
          // advances c times as fast in the probe index, so the injection vectors span the
          // channel space; a FIXED phase offset per channel does not, because it is one
          // rotation applied to every probe and they all lie in the same subspace.
          const off = style === 'basis' ? 0 : q;
          for (let h = 0; h < hMax; h++) {
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
        const r = await run(this, 'probe');
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
    const pows = this.reachPows || [1, 0.5];
    const cands = [];
    for (const st of styles) for (const fr of fracs) for (const pw of pows) cands.push({ style: st, frac: fr, pow: pw });

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
        // THE ROLL-OFF KNEE, MEASURED FROM THE OPERATOR THIS SET JUST IDENTIFIED: the last
        // harmonic whose gain is still within a factor of two of the best. A weighting and a
        // CEILING are different instruments — the weighting spends less on a weak harmonic,
        // the ceiling declines to spend anything past where the channel has died — and which
        // a plant wants is not decidable from the operator. So both are offered against the
        // same probe laps and scored on the machine, which costs three passes, not a probe.
        let gmax = 0;
        for (let h = 0; h < nh; h++) gmax = Math.max(gmax, this.gain[h]);
        let knee = 0;
        for (let h = 0; h < nh; h++) if (this.gain[h] >= 0.5 * gmax) knee = h + 1;
        const cutOpts = this.cuts || (knee > 0 && knee < nh ? [0, knee] : [0]);
        for (const cut of cutOpts) {
          this.reachPow = cd.pow; this.adm = null; this.nhCut = cut;
          const trial = await this._refine(run, base, this.trialPasses, 0, amp);
          laps += trial.laps;
          rep.candidates.push({ ...cd, cut, cross, score: trial.best, set });
        }
        laps += mm + 1;
      }
      // AMONG THE CANDIDATES WITHIN 5% OF THE BEST MEASURED IMPROVEMENT, TAKE THE CHEAPEST.
      // The band goes on what each candidate BUYS, never on what it leaves: put on the
      // residual, "do nothing" falls inside it and wins on effort. Cheapest here is the
      // smallest probe — the one that disturbs the running machine least for the same
      // measured result — and exact ties break on the next criterion, never on loop order.
      const gain = (c) => base.score - c.score;
      const bestGain = Math.max(...rep.candidates.map(gain));
      const band = rep.candidates.filter((c) => gain(c) >= bestGain * 0.95);
      // CHEAPEST MEANS THE SMALLEST PROBE — the least disturbance to a running machine for
      // the same measured improvement. It does NOT mean the tightest harmonic band: a
      // narrower band costs nothing less to commission and disturbs nothing less, so ranking
      // it as 'cheap' let a worse ceiling win inside the band and cost the servo axis 242x
      // -> 190x. Band width is a candidate to be scored, not a cost to be minimised.
      band.sort((x, y) => (x.frac - y.frac) || (x.score - y.score));
      pickC = band[0]; pickSet = band[0].set; pickScore = band[0].score;
      this.reachPow = pickC.pow; this.adm = null; this.nhCut = pickC.cut || 0;
      rep.banded = band.length;
    } else {
      pickC = cands[0];
      pickSet = await probeSet(pickC.style, pickC.frac * epk);
      laps += mm + 1;
    }
    // ---- CONCENTRATE THE PROBE WHERE THE PLANT RESPONDS.
    //
    // The survey above spreads its energy over every harmonic offered, so on a channel that
    // dies at h~8 most of the probe is spent exciting harmonics the machine cannot answer —
    // and the ones it CAN answer are excited at 1/sqrt(nh) of the peak instead of
    // 1/sqrt(knee). That is the whole probe budget diluted by the width of a band that was
    // chosen before anything was known about the plant.
    //
    // It is not a small effect and it is not speculative: measured on this arm, the same
    // operator identified across 256 harmonics against 24 disagreed by a factor of three in
    // phase and far more in gain, and the difference tracked EXCITATION rather than the
    // plant. A noisy operator makes bad Newton steps, the guard backtracks to protect the
    // worst of them, and the refinement plateaus — which is the symptom.
    //
    // So once the survey has found the knee, spend the whole budget inside it. One extra
    // probe set, and every harmonic that will actually be inverted gets sqrt(nh/knee) times
    // the amplitude it had.
    if (this.refocus && this.nhCut > 0 && this.nhCut < nh) {
      const narrow = await probeSet(pickC.style, pickC.frac * epk, this.nhCut);
      laps += mm + 1;
      rep.refocus = { band: this.nhCut, gainOverWide: Math.sqrt(nh / this.nhCut) };
      pickSet = narrow;
    }
    rep.style = pickC.style; rep.frac = pickC.frac; rep.pow = pickC.pow ?? this.reachPow;
    rep.cut = this.nhCut;
    rep.cross = install(pickSet);
    rep.gain = Array.from(this.gain); rep.rel = Array.from(this.rel);
    const fin = await this._refine(run, base, this.passes, this.backtracks, amp);
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
  async _refine(run, base, passes, backtracks, amp = 1) {
    const { nh, channels } = this, mm = 2 * channels;
    let cur = base, best = base.score;          // refinement targets the DEPLOYED machine
    const acc = zeroW(channels, nh), bestW = zeroW(channels, nh);
    let step = this.step, budget = passes + backtracks, laps = 0;
    const hist = [], steps = [];
    while (budget-- > 0 && step >= this.step / (1 << backtracks)) {
      const Er = this._project(cur.err);
      // ---- THE ADMISSIBLE SET, decided ONCE from the first solve and then frozen. Sorted by
      // gain — the harmonics that buy the most error per unit of command go in first — and
      // admitted while the running sum of demanded correction stays inside the authority.
      if (this.admit && !this.adm) {
        const want = [];
        for (let h = 0; h < nh; h++) {
          const M = this.G[h]; if (!M) { want.push(null); continue; }
          const b0 = new Float64Array(mm);
          for (let c = 0; c < channels; c++) { b0[2 * c] = -Er.re[c][h]; b0[2 * c + 1] = -Er.im[c][h]; }
          const v0 = solve(M, b0);
          if (!v0) { want.push(null); continue; }
          let cs = 0;
          for (let c = 0; c < channels; c++) cs = Math.max(cs, Math.hypot(v0[2 * c], v0[2 * c + 1]));
          want.push({ h, cost: cs, gain: this.gain[h] });
        }
        const ok = want.filter(Boolean).sort((x, y) => y.gain - x.gain);
        this.adm = new Uint8Array(nh);
        let spent = 0;
        for (const w of ok) {
          if (spent + w.cost > this.uMax) continue;      // cannot afford it: leave it out
          this.adm[w.h] = 1; spent += w.cost;
        }
        this.report_admit = { admitted: this.adm.reduce((t, x) => t + x, 0), spent };
      }
      const trial = zeroW(channels, nh);
      for (let c = 0; c < channels; c++) { trial.re[c].set(acc.re[c]); trial.im[c].set(acc.im[c]); }
      for (let h = 0; h < nh; h++) {
        const M = this.G[h]; if (!M) continue;
        const b = new Float64Array(mm);
        for (let c = 0; c < channels; c++) { b[2 * c] = -Er.re[c][h]; b[2 * c + 1] = -Er.im[c][h]; }
        const v = solve(M, b); if (!v) continue;
        // REACH AS A CUT, NOT AN ATTENUATION. min(1,|G|) scales every weak harmonic in
        // proportion to its gain — but a harmonic with |G| = 0.13 is perfectly identified
        // and perfectly invertible, it merely costs 7.7x in command. Attenuating it to 13%
        // of its Newton step under-corrects something the machine could have cancelled
        // outright. What the authority actually forbids is the harmonics it cannot AFFORD,
        // so admit by affordability and then take the full step. The set is frozen after
        // the first solve rather than re-allocated per pass: an earlier version re-sorted
        // every pass and the composition churned, which measured WORSE than attenuating.
        // HOW HARD REACH BITES IS ITSELF A PLANT PROPERTY, so it is chosen on the machine
        // rather than fixed. min(1,|G|) is the full proportional weighting; an exponent of
        // 0.5 is the geometric middle; 0 is no weighting at all. A compliant arm whose
        // channel is 0.13 at h8 wants a gentler curve than a servo axis that is flat to
        // h128 and does not care either way.
        const sh = (this.shrink ? 1 / (1 + this.rel[h] * this.rel[h]) : 1)
          * (this.admit ? (this.adm[h] ? 1 : 0)
            : (this.reach ? Math.pow(Math.min(1, this.gain[h]), this.reachPow) : 1));
        if (!(sh > 0) || (this.nhCut && h >= this.nhCut)) continue;
        for (let c = 0; c < channels; c++) {
          trial.re[c][h] += sh * step * v[2 * c];
          trial.im[c][h] += sh * step * v[2 * c + 1];
        }
      }
      this.active = this._table(trial);
      const next = await run(this, 'refine');
      laps++; hist.push(next.score); steps.push(step);

      // ---- THE PASS JUST MEASURED THE DEPLOYED MACHINE'S OWN OPERATOR, so use it.
      //
      // The operator is identified with reactive layers DISARMED, because identifying through
      // a receding-horizon controller is noise-dominated — and it is then applied on the
      // machine WITH those layers running, so it is not quite the operator of the machine it
      // corrects.
      //
      // HOW FAR FROM IT WAS MEASURED THREE TIMES AND THE FIRST ANSWER WAS HALF NOISE. Across
      // 256 harmonics the drift read 16.8 degrees of phase with gain factors 0.44 to 3.06;
      // at 24 harmonics -- the same code, 3.3x the amplitude per harmonic -- 9.6 degrees; and
      // an independent implementation at 24 read 6.2. The trend is monotone in EXCITATION and
      // in nothing about the plant, so the real drift is a modest 6-10 degrees and the
      // alarming gain ratios were an under-excited fit. A 3.06 ratio would have made a full
      // Newton step diverge at that harmonic; 1.16 does not, and the story this update was
      // first justified by does not survive its own instrument check.
      //
      // Each pass applies a known dW and observes a known dE at every harmonic, which is a
      // secant condition G·dW = dE. A Broyden rank-1 update turns that into a correction to
      // the operator at NO EXTRA LAPS, and it keeps the clean identification as its starting
      // point rather than replacing it with a noisy one.
      if (this.secant) {
        const En = this._project(next.err);
        for (let h = 0; h < nh; h++) {
          const M = this.G[h]; if (!M) continue;
          const dw = new Float64Array(mm), de = new Float64Array(mm);
          let dn = 0;
          for (let c = 0; c < channels; c++) {
            dw[2 * c] = trial.re[c][h] - acc.re[c][h];
            dw[2 * c + 1] = trial.im[c][h] - acc.im[c][h];
            de[2 * c] = En.re[c][h] - Er.re[c][h];
            de[2 * c + 1] = En.im[c][h] - Er.im[c][h];
          }
          for (let i = 0; i < mm; i++) dn += dw[i] * dw[i];
          // A STEP TOO SMALL TO SEE IS NOISE, NOT A SECANT. Below the amplitude that
          // identified the operator, dE is lap-to-lap spread and the update injects it.
          if (!(dn > (0.05 * amp) * (0.05 * amp))) continue;
          for (let r = 0; r < mm; r++) {
            let pred = 0;
            for (let j = 0; j < mm; j++) pred += M[r][j] * dw[j];
            const resid = de[r] - pred;
            for (let j = 0; j < mm; j++) M[r][j] += this.secant * resid * dw[j] / dn;
          }
          let gs = 0;
          for (let r = 0; r < mm; r++) for (let j = 0; j < mm; j++) gs += M[r][j] * M[r][j];
          this.gain[h] = Math.sqrt(gs / mm);
        }
      }
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
