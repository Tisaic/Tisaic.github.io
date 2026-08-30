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
    this.report = { layers: [], clamped: 0 };
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
    return cmd.map((q, c) => ({ ...q, u: q.u + u[c] }));
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
    if (this._done) {
      // AND THE TRUTH REACHES EXACTLY ONE OF THEM: THE TOP.
      //
      // Passing `null` to every layer here made online adaptation unreachable through a
      // cascade — `Pilot._deployObserve` adapts only when a truth is supplied, so a deployed
      // stack could never re-identify no matter how it was configured.
      //
      // BUT IT CANNOT SIMPLY GO TO ALL OF THEM, and the reason is arithmetic rather than
      // caution. Each layer's model predicts the error with ITS OWN correction removed, and
      // `_adaptStep` reconstructs that by subtracting the layer's own convolution from the
      // truth. At deploy every layer is acting, so for the TOP layer "the error without me"
      // is exactly `truth - conv` and the target is right. For any layer BELOW it, the same
      // arithmetic leaves the layers ABOVE still in the signal, so the target is the residual
      // of a machine that layer never modelled — and it would adapt confidently towards it.
      // Freezing the lower layers is not a limitation to be lifted later; it is what the
      // cascade's own definition implies, and they model the slower dynamics anyway.
      const top = this.layers.filter((p) => this._admitted(p)).pop() || null;
      for (const p of this.layers) if (this._admitted(p)) p.observe(measured, p === top ? truth : null);
      return;
    }
    for (const p of this._live()) p.observe(measured, null);
    this._cur.observe(measured, truth);
    this._advance();
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
