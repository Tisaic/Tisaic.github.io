/**
 * @file A CASCADE OF PILOTS — the second instance learns what the first one left.
 *
 * WHY THIS EXISTS. A pilot delivers its FORECAST BOUND and nothing better: on the EMPS
 * servo axis its forecast scores held-out R^2 0.9957 on program data, sqrt(1-0.9957) is
 * 6.6% of the truth's rms = 0.038 mm predicted, and it delivers 0.045. The QP, the
 * correction cap and the horizon are not the constraint — the model is. So the way past
 * it is not a better single model, it is a SECOND MODEL OF WHAT THE FIRST ONE MISSED.
 *
 * And the residual is worth modelling: measured on that axis, layer 1's forecast scores
 * R^2 0.991, layer 2's forecast OF LAYER 1'S RESIDUAL scores 0.777, and layer 3's scores
 * 0.492. Every layer still finds real structure in what the previous one left.
 *
 *   trained trapezoid   open 0.5764 -> 0.0454 (12.7x) -> 0.0258 (22.3x) -> 0.0223 (25.8x)
 *   UNSEEN sine         open 0.3634 -> 0.0439 ( 8.3x) -> 0.0248 (14.7x) -> 0.0184 (19.8x)
 *
 * THE SECOND ROW IS THE POINT. A phase-indexed ILC table reaches 125x on the program it
 * learned and measures **0.55x on one it has not seen — it makes the machine worse**. The
 * cascade improves the unseen program by MORE, proportionally, than the trained one,
 * because every layer is a plant model rather than a memory. That is the property worth
 * paying for, and it is why this composes pilots rather than bolting on a table.
 *
 * NOTHING NEW IS INVENTED HERE. Each layer is an ordinary Pilot, commissioned on the
 * machine with the layers below it deployed and FROZEN — so layer k's plant is
 * (machine + layers 1..k-1), a fixed system, and each layer measures its own timescale on
 * it. That is not a nicety: on EMPS layer 2 chose a LONGER horizon than layer 1 (N 95
 * against 68) entirely by itself, which is the timescale separation one would otherwise
 * have had to engineer.
 *
 * AND THE CONTRACT COMPOSES. Every layer runs its own probe, its own excitation, its own
 * held-out fit and its own verify round, and deploys only if it measured an improvement
 * on what reached it. A layer that finds nothing is refused and the stack stops there —
 * stacking further on a refused layer would re-commission against an unchanged residual.
 *
 * THE COST IS COMMISSIONING TIME, MULTIPLIED. On the EMPS axis a layer is 70 s and three
 * are nothing; on a three-zone extruder barrel one layer is 62 HOURS of process time and
 * three would be a week. Depth is a decision for the engineer, and each layer's own gate
 * reports what it was worth so the decision is made on measurement.
 */
import { Pilot } from './pilot.js';

export class Stack {
  /**
   * @param {object} opts every Pilot option, plus:
   * @param {number} [opts.depth] how many layers to commission (default 2)
   * @param {number} [opts.seedStep] seed increment per layer (default 6)
   */
  constructor(opts) {
    const { depth = 2, seedStep = 6, refusePartial = false, ...pilotOpts } = opts;
    // OPT-IN, AND OFF BY DEFAULT, for the same reason the deploy gate is (brick 57): a
    // refusal that fires silently hides the failure it is protecting against, and the
    // failure is the thing worth looking at. The reason is always MEASURED and carried
    // on the layer as `_stackRefused`, whether or not it is acted on.
    this.refusePartial = !!refusePartial;
    this.opts = pilotOpts;
    this.depth = Math.max(1, depth);
    this.seedStep = seedStep;
    this.uMax = pilotOpts.uMax;
    this.layers = [];
    // `clamped` counts deploy steps the summed cap bound; `verifyClamped` counts the same
    // during a layer's verify. A non-zero `verifyClamped` is the stack saying, in the one
    // place an engineer can act on it, that the authority it was given does not fit the
    // correction it wants — the cascade's own `report.binding`.
    // `adaptBlocked` counts deploy ticks where a layer had adaptation armed and was handed
    // NO truth because a layer above it could not supply the convolution the peel needs. It
    // is the difference between "did not adapt" and "adapted towards the wrong thing", and it
    // has to be visible or the second reads as the first (rule 25).
    this.report = { layers: [], clamped: 0, verifyClamped: 0, adaptBlocked: 0,
      peel: { n: 0, sum2: 0, t2: 0 } };
    this._newLayer();
  }

  /**
   * EVERY LAYER ABOVE THE FIRST IS PINNED TO THE FIRST'S CADENCE, and that is the one
   * thing a layer does not get to choose for itself.
   *
   * WHY. A host samples its look-ahead at ONE rate, so `act(off)` means one thing to the
   * closure it is handed; a layer that derived a different `sample` asks for `off` of ITS
   * samples and is given the command at `off` of the host's. Measured on the 2R arm at
   * the softest sliders: layer 1 Ts 2009 → sample 8, layer 2 Ts 2137 → sample 9, so
   * layer 2's whole 73-sample horizon was registered 73 solver steps short of where its
   * forecast was about — rule 29, arriving through the one door a single pilot does not
   * have. Pinning took ⑤'s depth-2 cascade from 7.23x to 10.30x with nothing else
   * changed. Re-indexing the closure instead was tried and rejected: an upper layer
   * sampling FASTER than the first collapses two adjacent samples onto one host index
   * and its velocity regressor silently reads zero (rule 51).
   *
   * WHAT IS STILL THE LAYER'S OWN: Ts, Tset, the grid, the horizon N, the lag windows,
   * the ridge, the basis. That is where the timescale separation the cascade exists for
   * actually lives — on the EMPS axis layer 2 chose N 95 against layer 1's 68 by itself,
   * and it still does.
   */
  _newLayer() {
    const seed = (this.opts.seed || 1) + this.seedStep * this.layers.length;
    const sampleFixed = this.layers.length ? this.layers[0].sample : null;
    this._cur = new Pilot({ ...this.opts, seed, sampleFixed });
    this.layers.push(this._cur);
    for (const p of this._live()) p._initRun();
  }

  /** a layer acts only if it vouched for itself AND the stack admitted it */
  _admitted(p) {
    return !!(p.verdict && p.verdict.deploy && !(this.refusePartial && p._stackRefused));
  }

  /** the admitted layers BELOW the one commissioning */
  _live() { return this.layers.filter((p) => p !== this._cur && this._admitted(p)); }

  /** how many control channels the plant has — a coupling question, so the stack asks it */
  get nc() { return this.layers[0].nc; }

  get phase() { return this._done ? 'done' : this._cur.phase; }
  get note() { return this._cur.note; }
  /** The stack's cadence is the first layer's, and every other layer is pinned to it. */
  get sample() { return this.layers[0].sample; }
  /**
   * NULL UNTIL THE WHOLE STACK IS COMMISSIONED, because a host reads `verdict` as the
   * "is it finished" flag — that is what a Pilot's means — and a partial stack whose
   * first layer has deployed would otherwise answer `deploy: true` while layer 2 is
   * still driving the machine through its own excitation.
   */
  get verdict() {
    if (!this._done) return null;
    const live = this.layers.filter((p) => this._admitted(p));
    const ratios = live.map((p) => (p.report.verify ? p.report.verify.ratio : null))
      .filter((r) => r !== null);
    return live.length
      ? { deploy: true,
        why: `${live.length} of ${this.layers.length} layer(s) verified`
          + (ratios.length ? ` (${ratios.map((r) => r.toFixed(2) + 'x').join(' then ')})` : '') }
      : { deploy: false, why: this.layers[0].verdict ? this.layers[0].verdict.why : 'commissioning' };
  }

  work() { const f = this._cur.work(); this._advance(); return f; }

  /**
   * THE COMMISSIONING LAYER'S OWN COMMAND, with the layers below it correcting toward it.
   * The lower layers need a look-ahead over the trajectory being commanded, which is the
   * commissioning layer's own excitation — the stack owns both, so it supplies it.
   */
  command() {
    const cmd = this._cur.command();
    const u = this._lowerU(cmd);
    const tot = cmd.map((q, c) => q.u + u[c]);
    // THE VERIFY MUST RUN UNDER THE CAP THE DEPLOYMENT RUNS UNDER (rule 34, and it cost a
    // regression on every cascade this project has published).
    //
    // `act()` clamps the SUM at the engineer's cap. This path did not, so a layer was scored
    // against a machine that let its whole correction through and then deployed onto one that
    // did not. Measured on the 2R arm at K 0.25 / E 0.03 with the shipped cap of 0.15 rad:
    // layer 2 verified 1.21x and DELIVERED 1.82x against depth 1's 2.15x on the sharp square,
    // 1.99x against 2.64x on the rounded rectangle, with 10,591 and 9,900 steps clamped —
    // depth HARMING, which is the one thing the stack's contract says it never does. Give the
    // same run four times the cap and nothing clamps and depth 2 wins everywhere (2.84x and
    // 3.27x), so the layer was never the problem; the clamp it was not scored under was.
    //
    // VERIFY ONLY, DELIBERATELY. The excitation is the identification input and the pilot
    // records what it COMMANDED, so clamping that would fit a model to an input the machine
    // never received — a worse defect than the one being fixed, and in the same family. The
    // probe is left alone for the same reason. Every commissioning record is therefore
    // byte-identical and only the gate's reading moves, which is the control that says this
    // repaired the measurement rather than changed it (rule 21).
    if (this._cur.phase === 'verify') {
      for (let c = 0; c < tot.length; c++) {
        if (Math.abs(tot[c]) > this.uMax) {
          tot[c] = Math.sign(tot[c]) * this.uMax;
          this.report.verifyClamped++;
        }
      }
    }
    return cmd.map((q, c) => ({ ...q, u: tot[c] }));
  }

  _lowerU(cmd) {
    const nc = cmd.length;
    const out = new Array(nc).fill(0);
    const P = this._cur;
    const E = (P.phase === 'excite' && P._exc) ? P._exc
      : ((P.phase === 'verify' && P._ver) ? P._ver.exc : null);
    for (const p of this._live()) {
      const look = (off) => {
        if (!E) return cmd.map((q) => q.pos);
        const i = Math.min(Math.max(0, (P.k - E.k0) + off * p.sample), E.steps - 1);
        return Array.from({ length: nc }, (_, c) => E.series.pos[c][i]);
      };
      const u = p.act(look);
      for (let c = 0; c < nc; c++) out[c] += u[c];
    }
    return out;
  }

  observe(measured, truth) {
    // ONCE COMMISSIONED, EVERY DEPLOYED LAYER SEES THE MACHINE — including the last one,
    // which `_live()` deliberately excludes while it is still the one commissioning. A
    // layer that refused is not fed: its rings would fill with a stream it never acts on.
    if (this._done) { this._deployTruth(measured, truth); return; }
    for (const p of this._live()) p.observe(measured, null);
    this._cur.observe(measured, truth);
    this._advance();
  }

  /**
   * TARGET 6'S ONE NUMBER FOR A CASCADE — and until this existed the cascade did not have one.
   *
   * `stack.test.mjs` sums each layer's `cost().peakMacPerCycle`, which counts the forecast, the
   * QP and the interpolation and EXCLUDES the online RLS. That was defensible while exactly one
   * layer could adapt and most runs had adaptation off. It is not defensible now: every deployed
   * layer runs its own RLS update per sample, so the online arithmetic scales with DEPTH, and a
   * total that omits it would grow silently in precisely the direction this change pushes it.
   *
   * `Pilot.scanCost()` already composes forecast + QP + router + RLS + interpolation at their own
   * cadences and reports the PARTS, so a disarmed stage reads zero rather than vanishing into a
   * sum (rule 25). This adds them across the deployed layers and keeps the parts, because "the
   * cascade costs X" is not actionable and "the cascade costs X of which the fit is Y" is.
   *
   * The owner's standing rule is that new fitting machinery states its MAC/cycle slice or it does
   * not ship, and all-layer adaptation is new fitting machinery.
   */
  scanCost() {
    const live = this.layers.filter((p) => this._admitted(p) && p.scanCost);
    if (!live.length) return null;
    const out = { peak: 0, sliced: 0, bytes: 0, layers: live.length,
      parts: { forecast: 0, qp: 0, router: 0, rls: 0, interp: 0 } };
    for (const p of live) {
      const c = p.scanCost();
      if (!c) continue;
      out.peak += c.peak; out.sliced += c.sliced; out.bytes += c.bytes;
      for (const k of Object.keys(out.parts)) out.parts[k] += c.parts[k] || 0;
    }
    return out;
  }

  /**
   * THE TRUTH EACH DEPLOYED LAYER IS ENTITLED TO, WHICH IS NOT THE SAME TRUTH.
   *
   * The version this replaces sent the truth to exactly ONE layer, the top, and its reason was
   * correct as far as it went. Each layer's model predicts the error with ITS OWN correction
   * removed, and `Pilot._onlineStep` reconstructs that by subtracting the layer's own
   * convolution — `truth - _conv0` — from what it is handed. For the TOP layer that is exactly
   * "the error without me". Hand the same raw truth to a layer BELOW it and the arithmetic
   * leaves every layer ABOVE still in the signal, so the target is the residual of a machine
   * that layer never modelled and it adapts confidently towards it. That is a real defect and
   * it is not fixed by passing the truth to everybody.
   *
   * IT IS FIXED BY SUBTRACTING THE LAYERS ABOVE, WHICH THE STACK ALREADY HAS THE PIECES FOR.
   * Layer k was fitted to predict `eFree_k`, the error reaching it with layers 1..k-1 deployed
   * and layer k itself removed. At deploy, under the same superposition every layer's own
   * reconstruction already assumes,
   *
   *     truth = eFree_k + SUM over j >= k of conv_j
   *
   * where `conv_j` is layer j's own applied history convolved with layer j's own identified
   * kernel — the quantity `_decide` writes down as `ro._conv0` while it builds the free
   * response. Peeling the top layer off gives the error with layers 1..K-1 acting; peeling the
   * next gives 1..K-2; recursing down to layer k gives `eFree_k` exactly. So the legitimate
   * per-layer target is `truth` minus the convolutions of the layers STRICTLY ABOVE, and each
   * layer then subtracts its own as it always did. No new arithmetic and no new model: one
   * running sum, `nc` additions per layer per call, on numbers the online path already
   * computes.
   *
   * AT DEPTH 1 THE SUM IS EMPTY AND THE TOP LAYER IS HANDED `truth` ITSELF — the same object,
   * not a copy of it — so a single-layer stack is byte-identical to the version this replaces
   * (rule 21: the case this must not touch has to come back unchanged, and here it does so by
   * construction rather than by floating-point argument). A stack with adaptation OFF is
   * likewise unchanged: no layer records a convolution, `ready` goes false below the top, and
   * every lower layer is handed `null` exactly as before.
   *
   * WHAT IT REFUSES TO DO RATHER THAN GUESS. `_conv0` is only written while a layer is acting
   * AND has `online` armed (that is the branch `_decide` captures the lead-0 row in). A layer
   * that is acting without recording leaves a hole in the sum, and a missing term reads as
   * zero — which would be a silent, plausible, wrong target (rule 25). So the sum carries a
   * `ready` flag: the moment a layer above cannot supply its own contribution, every layer
   * below it is handed `null` and `report.adaptBlocked` counts it, so the failure shows up as
   * a layer that never adapted rather than as a layer that adapted towards garbage.
   *
   * HOW IT COULD STILL BE WRONG, and none of these are hypothetical for the top layer either:
   *   - Superposition. `conv_j` is the LINEAR response of layer j's kernel to its own history.
   *     Where the plant is nonlinear enough that the layers do not superpose, the peel is
   *     approximate — but this is the identical assumption the shipped single-layer
   *     reconstruction makes, applied one more time.
   *   - Timing. `_conv0` is refreshed on each layer's own DECISION steps and excludes the move
   *     being decided, while the online update runs on every SAMPLE. Every layer inherits the
   *     same offset because they are all captured in one `act()` call, so the peel is
   *     consistent even where the convention is loose.
   *   - The regressor row, which this does not touch. Layer k's row is built from the measured
   *     stream, and at deploy that stream carries the layers above it. The TARGET is now the
   *     counterfactual `eFree_k`; the ROW is from a machine layer k never saw. That is a
   *     distribution shift of the same kind as fitting on a scribble and running a program,
   *     and it is the reason this has to be measured on the machine rather than argued.
   *   - The cascade's own definition. Layer k+1 was commissioned against layer k FROZEN. A
   *     layer that adapts moves the plant its neighbour modelled, so the stack is no longer
   *     the object each layer was fitted on. Slow forgetting and the innovation gate bound how
   *     fast that happens; nothing makes it zero.
   */
  _deployTruth(measured, truth) {
    const live = this.layers.filter((p) => this._admitted(p));
    if (!live.length) return;
    const nc = this.nc;
    // Allocated once and refilled, not rebuilt: this runs every solver step for ever, and the
    // cyclic-task claim rests on the tick allocating nothing it does not need.
    if (!this._above || this._above.length !== nc) this._above = new Array(nc).fill(0);
    if (!this._tBuf || this._tBuf.length !== nc) this._tBuf = new Array(nc).fill(0);
    const above = this._above, tBuf = this._tBuf;
    let started = false, ready = true;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      let t = null;
      if (truth && ready) {
        if (!started) t = truth;                 // the top layer: nothing above it to peel
        else {
          const P = this.report.peel;
          for (let c = 0; c < nc; c++) {
            tBuf[c] = truth[c] - above[c];
            // HOW MUCH OF THE TRUTH THE LAYERS ABOVE ACCOUNT FOR, accumulated only on the
            // ticks a lower layer is actually handed a peeled target — i.e. only in the
            // configuration that is already running an RLS update, so the static path pays
            // nothing. Without it, "the peel measured the same as the raw truth" has two
            // explanations that look identical: the peel is not worth having, or the peel is
            // NUMERICALLY NOTHING. `peelRatio` tells them apart (rule 25).
            P.sum2 += above[c] * above[c]; P.t2 += truth[c] * truth[c];
          }
          P.n++;
          t = tBuf;
        }
      }
      p.observe(measured, t);
      // COUNTED ONLY WHERE IT COSTS SOMETHING: a layer with no `online` armed was never
      // going to consume a truth, so counting it would bury the real event under millions of
      // ticks from every static run.
      if (truth && t === null && p.online) this.report.adaptBlocked++;
      if (i === 0) break;                        // nothing below the bottom layer to prepare for
      // FOLD THIS LAYER'S OWN CONTRIBUTION INTO THE SUM the layer below will subtract.
      const ro = (p.online && p.readouts) ? p.readouts : null;
      if (!ro) { ready = false; continue; }
      for (let c = 0; c < nc; c++) {
        const cv = ro[c] ? ro[c]._conv0 : null;
        if (!Number.isFinite(cv)) { ready = false; break; }
        above[c] = (started ? above[c] : 0) + cv;
      }
      if (ready) started = true;
    }
  }

  /** A layer has finished: start the next one, or close the stack. */
  _advance() {
    if (this._cur.phase === 'done' && !this._done) {
      // A LAYER THAT COULD NOT VOUCH FOR ITSELF ENDS THE STACK. The next layer would be
      // commissioned against exactly the residual this one just failed on.
      // A LAYER THAT DID NOT DEPLOY ENDS THE STACK. With `autoRefuse` off that is only
      // an unusable model (every forecast disarmed); with it on it is the gate's refusal.
      // Either way the next layer would be commissioned against an unchanged residual.
      // A LAYER WITH AN UNFORECASTABLE CHANNEL IS FLAGGED, and refused only if the
      // engineer asked for it (`refusePartial`, default OFF).
      //
      // WHAT THE FLAG PREDICTS, and what it does NOT. Measured on ⑥ at the softest
      // sliders, where layer 2's forecast is R^2 [0.848, -0.117] — the elbow worse than a
      // constant — the three available behaviours rank:
      //
      //   layer refused (i.e. depth 1)                        3.40x   <- best
      //   layer deployed, elbow ACTING (gate off)             3.18x
      //   layer deployed, elbow GATED to zero                 2.93x   <- worst
      //
      // So the flag IS a good predictor that the layer is not worth stacking: its own
      // verify said 1.85x (gated) and 2.20x (ungated) and the machine said 2.93x and
      // 3.18x against a 3.40x it could have had by doing nothing.
      //
      // BUT THE MECHANISM FIRST WRITTEN HERE WAS WRONG and the measurement above is what
      // corrected it. The claim was that a gated channel makes the layer correct the
      // OTHERS, pushing the output where the plan never pointed. Turning the gate off —
      // arming that channel — DOES help, 2.93x -> 3.18x, so the misaiming is real; but
      // the fully armed layer still LOSES to not stacking at all. Partiality was a
      // second-order cost, not the cause. What the flag actually marks is a layer with
      // nothing left to model, and a channel that fails held-out validation is the
      // cheapest available signal of it.
      //
      // ⑤'s layer 2, with both channels alive at 0.440/0.571, took 6.43x -> 12.21x and is
      // untouched by any of this.
      const partial = this.nc > 1 && this._cur.readouts
        && this._cur.readouts.some((r) => r.gated);
      // The layer's OWN verdict is left exactly as it recorded it — an instrument's
      // reading is not the stack's to rewrite (rule 27). Admission is a separate flag,
      // and `_admitted` is what everything downstream filters on.
      this._cur._stackRefused = partial
        ? `could not forecast every channel (${this._cur.readouts
          .map((r, i) => `ch${i + 1} ${r.gated ? 'gated' : 'ok'}`).join(', ')}) — a partial `
          + 'correction on a coupled plant moves the output where the plan did not ask'
        : null;
      if (!this._admitted(this._cur) || this.layers.length >= this.depth) {
        this._done = true;
        this.report.layers = this.layers.map((p, i) => ({ layer: i + 1,
          deployed: this._admitted(p),
          why: (p.verdict && p.verdict.why)
            + (p._stackRefused
              ? ` — and the stack ${this.refusePartial ? 'REFUSED it' : 'would have refused it'}`
                + `: ${p._stackRefused}`
              : ''),
          partial: p._stackRefused || null,
          Ts: p.Ts, N: p.N, verify: p.report.verify ? p.report.verify.ratio : null,
          r2: p.report.readouts ? p.report.readouts.map((r) => r.r2Lead0) : null }));
        for (const p of this._live()) p._initRun();
      } else this._newLayer();
    }
  }

  /** Deployment: every verified layer, summed, clamped ONCE at the stack's own cap. */
  act(lookAhead) {
    const live = this.layers.filter((p) => this._admitted(p));
    if (!live.length) return new Array(this.layers[0].nc).fill(0);
    const nc = this.layers[0].nc;
    const out = new Array(nc).fill(0);
    for (const p of live) {
      const u = p.act(lookAhead);
      for (let c = 0; c < nc; c++) out[c] += u[c];
    }
    // THE CAP IS THE STACK'S, NOT EACH LAYER'S. Every layer is entitled to the engineer's
    // full authority while it commissions, but what reaches the machine is one number and
    // it is that number the engineer capped. Binding is counted rather than hidden.
    for (let c = 0; c < nc; c++) {
      if (Math.abs(out[c]) > this.uMax) {
        out[c] = Math.sign(out[c]) * this.uMax;
        this.report.clamped++;
      }
    }
    return out;
  }

  _initRun() { for (const p of this.layers) if (this._admitted(p)) p._initRun(); }

  /**
   * SHAPE-COMPATIBLE WITH `Pilot.status()`, deliberately: a host that already renders a
   * pilot's readouts, timescale and horizon should not need a second renderer to show a
   * stack of them. The scalars are the FIRST layer's, because that is the one whose
   * timescale the deployment loop is sampled at; `layers` carries the rest.
   */
  status() {
    const base = this.layers[0].status();
    return { ...base, phase: this.phase, note: this.note, verdict: this.verdict,
      depth: this.layers.length,
      report: { ...base.report, layers: this.report.layers, clamped: this.report.clamped },
      layers: this.layers.map((p) => p.status()) };
  }
}
