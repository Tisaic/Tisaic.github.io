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
    const { depth = 2, seedStep = 6, ...pilotOpts } = opts;
    this.opts = pilotOpts;
    this.depth = Math.max(1, depth);
    this.seedStep = seedStep;
    this.uMax = pilotOpts.uMax;
    this.layers = [];
    this.report = { layers: [], clamped: 0 };
    this._newLayer();
  }

  _newLayer() {
    const seed = (this.opts.seed || 1) + this.seedStep * this.layers.length;
    this._cur = new Pilot({ ...this.opts, seed });
    this.layers.push(this._cur);
    for (const p of this._live()) p._initRun();
  }

  /** the layers below the one commissioning, that vouched for themselves */
  _live() { return this.layers.filter((p) => p !== this._cur && p.verdict && p.verdict.deploy); }

  get phase() { return this._done ? 'done' : this._cur.phase; }
  get note() { return this._cur.note; }
  get sample() { return this.layers[0].sample; }
  get verdict() {
    const live = this.layers.filter((p) => p.verdict && p.verdict.deploy);
    return live.length
      ? { deploy: true, why: `${live.length} of ${this.layers.length} layer(s) verified` }
      : { deploy: false, why: this.layers[0].verdict ? this.layers[0].verdict.why : 'commissioning' };
  }

  work() { return this._cur.work(); }

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
    for (const p of this._live()) p.observe(measured, null);
    this._cur.observe(measured, truth);
    if (this._cur.phase === 'done' && !this._done) {
      // A LAYER THAT COULD NOT VOUCH FOR ITSELF ENDS THE STACK. The next layer would be
      // commissioned against exactly the residual this one just failed on.
      // A LAYER THAT DID NOT DEPLOY ENDS THE STACK. With `autoRefuse` off that is only
      // an unusable model (every forecast disarmed); with it on it is the gate's refusal.
      // Either way the next layer would be commissioned against an unchanged residual.
      if (!this._cur.verdict.deploy || this.layers.length >= this.depth) {
        this._done = true;
        this.report.layers = this.layers.map((p, i) => ({ layer: i + 1,
          deployed: !!(p.verdict && p.verdict.deploy), why: p.verdict && p.verdict.why,
          Ts: p.Ts, N: p.N, verify: p.report.verify ? p.report.verify.ratio : null,
          r2: p.report.readouts ? p.report.readouts.map((r) => r.r2Lead0) : null }));
        for (const p of this._live()) p._initRun();
      } else this._newLayer();
    }
  }

  /** Deployment: every verified layer, summed, clamped ONCE at the stack's own cap. */
  act(lookAhead) {
    const live = this.layers.filter((p) => p.verdict && p.verdict.deploy);
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

  _initRun() { for (const p of this.layers) if (p.verdict && p.verdict.deploy) p._initRun(); }

  status() {
    return { phase: this.phase, depth: this.layers.length, verdict: this.verdict,
      report: this.report, layers: this.layers.map((p) => p.status()) };
  }
}
