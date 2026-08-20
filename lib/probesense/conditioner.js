/**
 * @file Input conditioning for a soft sensor, and the commissioning routine that
 * chooses it without anybody setting a number.
 *
 * WHY THIS EXISTS. The expanded feature map is the better estimator on clean data
 * and it is the one real sensor noise threatens -- not by making it lose (measured,
 * it still beats the linear readout in absolute terms at every noise level) but by
 * erasing its ADVANTAGE. `x = x0 + n` gives `x^2 = x0^2 + 2*x0*n + n^2`, so white
 * independent sensor noise comes out of a quadratic expansion signal-proportional,
 * biased by the noise variance, and correlated ACROSS FEATURES whatever it went in
 * as. A scalar isotropic prior is the wrong regularizer for that, and no value of
 * it is the right one -- which is why the fix belongs on the INPUTS.
 *
 * TWO FILTERS, ATTACKING DIFFERENT HALVES, and neither substitutes for the other:
 *
 *   LOW PASS       a causal boxcar over the last `lp` samples. Broadband sensor
 *   (temporal)     noise averages out as ~sqrt(lp) while a slow process signal does
 *                  not. It CANNOT touch a constant offset: a drift is DC and passes
 *                  a low-pass unchanged.
 *
 *   COMMON-MODE    subtract the cross-channel mean of a sensor GROUP, in units of
 *   REJECTION      each channel's calibrated spread. This is what differential
 *   (spatial)      measurement does in hardware. It removes a coherent shift
 *                  EXACTLY -- including a DC drift -- for one degree of freedom.
 *                  It makes INDEPENDENT noise worse, because subtracting the mean
 *                  of uncorrelated noise injects a shared component into every
 *                  channel, which is exactly why the two are needed together.
 *
 * MEASURED, expanded map on a driven dye channel, worst case over independent /
 * coherent / drift noise at 10% of each channel's spread, against its own clean
 * score: unfiltered 10.2x, cmr+lp32 **2.1x**, for a 5% cost on clean data. The
 * low pass obeys its own arithmetic -- removing the clean floor in quadrature the
 * noise-induced error falls by 2.9x at lp 8, against a predicted sqrt(8) = 2.83.
 *
 * AND THE LENGTH IS NOT SHIPPED AS A CONSTANT, because it is not portable: at
 * lp 128 the same filter eats the signal (5.7x clean cost). `selectConditioning`
 * chooses it from the commissioning record instead. See its own comment for why
 * the obvious rule -- cross-validate on the record -- picks the wrong filter.
 */

/**
 * Causal input conditioning, online.
 *
 * Calibrates first and passes NOTHING through while it does: a consumer must not
 * see unconditioned samples followed by conditioned ones, because its own frozen
 * standardisation would then describe a different signal from the one it is later
 * fed. `push` returns null until `ready()`.
 */
export class InputConditioner {
  /**
   * @param {object} o
   * @param {number} o.nSignals channel count
   * @param {number[][]} [o.groups] channel indices that share a common mode. A
   *   thermal coefficient moves every transducer of one KIND together, so the
   *   group is "the pressure taps", not "everything".
   * @param {number} [o.lp] boxcar length in samples; 1 disables it
   * @param {boolean} [o.cmr] common-mode rejection over each group
   * @param {number} [o.warmup] calibration samples before anything is emitted
   */
  constructor({ nSignals, groups = [], lp = 1, cmr = false, warmup = 120 }) {
    this.ns = nSignals;
    this.groups = groups.map((g) => [...g]);
    this.lp = Math.max(1, Math.round(lp));
    this.cmr = !!cmr && this.groups.length > 0;
    this.warmup = warmup;
    this._mu = new Float64Array(nSignals);
    this._m2 = new Float64Array(nSignals);
    this._cnt = 0;
    this.mean = new Float64Array(nSignals);
    this.std = new Float64Array(nSignals).fill(1);
    this.frozen = false;
    // Ring of recent (already common-mode-rejected) samples, for the boxcar.
    this._ring = [];
    this._at = -1;
  }

  ready() { return this.frozen; }

  /** `cmr+lp32`, `lp8`, or `none` -- what the UI shows and the record carries. */
  describe() {
    const parts = [];
    if (this.cmr) parts.push('cmr');
    if (this.lp > 1) parts.push(`lp${this.lp}`);
    return parts.length ? parts.join('+') : 'none';
  }

  /** @returns {number[]|null} conditioned signals, or null while calibrating. */
  push(signals) {
    if (!this.frozen) {
      this._cnt++;
      for (let i = 0; i < this.ns; i++) {
        const d = signals[i] - this._mu[i];
        this._mu[i] += d / this._cnt;
        this._m2[i] += d * (signals[i] - this._mu[i]);
      }
      if (this._cnt >= this.warmup) {
        for (let i = 0; i < this.ns; i++) {
          this.mean[i] = this._mu[i];
          const sd = Math.sqrt(this._m2[i] / this._cnt);
          // A dead channel must not become a divide-by-zero in the rejection sum.
          this.std[i] = sd > 1e-30 ? sd : 1;
        }
        this.frozen = true;
      }
      return null;
    }
    const out = Array.from(signals);
    if (this.cmr) {
      for (const g of this.groups) {
        if (g.length < 2) continue;
        let m = 0;
        for (const i of g) m += (out[i] - this.mean[i]) / this.std[i];
        m /= g.length;
        for (const i of g) out[i] -= m * this.std[i];
      }
    }
    if (this.lp > 1) {
      this._at++;
      this._ring[this._at % this.lp] = out;
      const n = Math.min(this.lp, this._at + 1);
      const avg = new Array(this.ns).fill(0);
      for (let k = 0; k < n; k++) {
        const r = this._ring[(this._at - k + this.lp * 2) % this.lp];
        for (let i = 0; i < this.ns; i++) avg[i] += r[i];
      }
      for (let i = 0; i < this.ns; i++) avg[i] /= n;
      return avg;
    }
    return out;
  }
}

/**
 * How much white noise is on each channel, measured, with nothing set by hand.
 *
 * `x[t] - 2x[t-1] + x[t-2]` is tiny for a smooth signal, while for white noise its
 * variance is exactly `6*sigma^2`. So the magnitude comes off the record itself.
 * VALIDATED BY INJECTION: it recovered 1.01e-1 against 0.1 injected, and reports
 * the simulation's own floor (2.7e-3) on a clean record.
 *
 * Returned as a fraction of each channel's own spread, which is the dimensionless
 * unit the stress sweep and every noise table in this project already use.
 * @param {number[][]} rows @returns {{perChannel: Float64Array, median: number}}
 */
export function estimateChannelNoise(rows, channels = null) {
  const ns = rows[0].length;
  const idx = channels || [...Array(ns).keys()];
  const per = new Float64Array(ns);
  for (const i of idx) {
    let s2 = 0, sd = 0, mu = 0, n = 0, m = 0;
    for (let t = 0; t < rows.length; t++) { m++; const d = rows[t][i] - mu; mu += d / m; sd += d * (rows[t][i] - mu); }
    const spread = Math.sqrt(sd / Math.max(1, rows.length)) || 1;
    for (let t = 2; t < rows.length; t++) {
      const d2 = rows[t][i] - 2 * rows[t - 1][i] + rows[t - 2][i];
      s2 += d2 * d2; n++;
    }
    per[i] = Math.sqrt(Math.max(0, s2 / Math.max(1, n) / 6)) / spread;
  }
  // MEDIAN, not mean: one fouled tap must not set the filter for the whole array.
  const v = idx.map((i) => per[i]).sort((a, b) => a - b);
  return { perChannel: per, median: v.length ? v[v.length >> 1] : 0 };
}

/** Deterministic normals, so a commissioning run is reproducible. */
function normals(seed) {
  let s = seed >>> 0;
  const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

/** The three things a sensor array can do to you, applied to one group. */
function stressRows(rows, group, spread, eta, mode, seed) {
  const g = normals(seed);
  const held = Math.abs(g());
  return rows.map((r) => {
    const q = Array.from(r);
    const shared = mode === 'drift' ? held : g();
    for (const i of group) q[i] += eta * spread[i] * (mode === 'indep' ? g() : shared);
    return q;
  });
}

export const STRESS_MODES = Object.freeze(['indep', 'common', 'drift']);
/** A DECADE, not a value. See `selectConditioning` for why it is swept. */
export const STRESS_SWEEP = Object.freeze([0.03, 0.1, 0.3]);

/**
 * Choose the conditioning from the commissioning record. No design knob.
 *
 * THE OBVIOUS RULE IS WRONG, AND MEASURING THAT WAS THE POINT. Cross-validating on
 * the commissioning record picks the filter that is best ON THAT RECORD -- which on
 * a clean record is NO FILTER, and on a lightly noisy one is a short one. Both are
 * wrong for the data the instrument will actually meet, measured at 4.8x and 3.9x
 * worse than the best available choice. Validation optimises for the data you have;
 * the filter exists for the data you will get.
 *
 * A first version fixed that by measuring the noise and stressing at that magnitude.
 * That has a hole with the same shape: on a CLEAN record the estimator correctly
 * reports ~zero, stresses at ~zero, and again picks no filter -- 4.75x worse than
 * the oracle. Nothing in a clean record can tell you to filter for noise that is
 * not in it. This project has met that lesson before (a measurement taken on a
 * transient describes the transient) and the answer is the same as the anti-slosh
 * health-check probe: stop asking the record what it cannot know, and EXCITE the
 * question instead.
 *
 * So the candidates are scored on a HELD-OUT tail of the record -- held-out because
 * scored on the fitting data less filtering always wins, a filter having removed
 * information the fit could otherwise memorise -- against the record as recorded
 * AND against it stressed over a DECADE of magnitudes x the three canonical
 * structures. The pick is the argmin of the WORST case. The magnitudes are
 * dimensionless and the structures are what a sensor array can physically do, so
 * neither carries a plant constant.
 *
 * MEASURED, expanded map, worst case on a held-out test window:
 *   commissioning   naive CV    swept stress   oracle
 *   clean           2.686e-3    5.654e-4       5.654e-4   (exact match)
 *   noisy           8.996e-4    2.296e-4       2.115e-4   (within 8.6%)
 *
 * @param {object} o
 * @param {number[][]} o.rows commissioning sensor scans, oldest first
 * @param {number[][]} o.truths matching field truth per scan
 * @param {(cfg:{lp:number,cmr:boolean}) => {conditioner:InputConditioner, model:object}} o.build
 *   makes a fresh conditioner+model pair for one candidate
 * @param {number[][]} [o.groups] common-mode groups (see InputConditioner)
 * @param {Array<{lp:number,cmr:boolean}>} [o.candidates]
 * @param {number} [o.fitFraction] of the record used to fit; the rest scores
 * @param {(done:number,total:number)=>void} [o.onProgress]
 * @returns {Promise<{best:{lp:number,cmr:boolean}, table:Array, measuredNoise:number}>}
 */
export async function selectConditioning({ rows, truths, build, groups = [],
  candidates = null, fitFraction = 0.75, onProgress = null, seed = 31 }) {
  const grid = candidates || (() => {
    const g = [];
    for (const cmr of [false, true]) for (const lp of [1, 4, 16, 32, 64]) g.push({ lp, cmr });
    return g;
  })();
  const group = groups.length ? groups[0] : [];
  const ns = rows[0].length;
  // Per-channel spread, so the stress is dimensionless in the same way the tables are.
  const spread = new Float64Array(ns);
  for (let i = 0; i < ns; i++) {
    let mu = 0, m2 = 0, n = 0;
    for (const r of rows) { n++; const d = r[i] - mu; mu += d / n; m2 += d * (r[i] - mu); }
    spread[i] = Math.sqrt(m2 / Math.max(1, rows.length)) || 1;
  }
  const measured = group.length ? estimateChannelNoise(rows, group).median : 0;
  const fitEnd = Math.max(1, Math.floor(rows.length * fitFraction));

  const score = (cfg, testRows) => {
    const { conditioner, model } = build(cfg);
    for (let t = 0; t < fitEnd; t++) {
      const c = conditioner.push(rows[t]);
      if (c) { model.push(c); model.observe(truths[t]); }
    }
    let se = 0, n = 0;
    for (let t = fitEnd; t < rows.length; t++) {
      const c = conditioner.push(testRows[t]);
      if (!c) continue;
      model.push(c);
      const est = model.estimate();
      if (!est) continue;
      const y = truths[t];
      let m = 0; for (const v of y) m += v; m /= y.length;
      let a = 0, b = 0;
      for (let k = 0; k < y.length; k++) { a += (est[k] - y[k]) ** 2; b += (y[k] - m) ** 2; }
      se += Math.sqrt(a / Math.max(b, 1e-30)); n++;
    }
    return n ? se / n : Infinity;
  };

  const table = [];
  const total = grid.length;
  for (let gi = 0; gi < grid.length; gi++) {
    const cfg = grid[gi];
    let worst = score(cfg, rows);
    const plain = worst;
    if (group.length) {
      for (const eta of STRESS_SWEEP) {
        for (const mode of STRESS_MODES) {
          worst = Math.max(worst, score(cfg, stressRows(rows, group, spread, eta, mode, seed)));
        }
      }
    }
    table.push({ ...cfg, tag: `${cfg.cmr ? 'cmr+' : ''}lp${cfg.lp}`, plain, worst });
    if (onProgress) onProgress(gi + 1, total);
    // Yield, so a commissioning sweep does not freeze the page it runs in.
    await new Promise((r) => setTimeout(r, 0));
  }
  const best = table.reduce((a, b) => (b.worst < a.worst ? b : a));
  return { best: { lp: best.lp, cmr: best.cmr }, table, measuredNoise: measured };
}
