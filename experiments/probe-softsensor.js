/**
 * @file Soft-sensing a lattice field from ONE probe cell.
 *
 * The question this answers: put a probe somewhere you could actually instrument
 * a real machine -- a cell against the wall, downstream of an obstacle -- and ask
 * whether the recent HISTORY of that one point is enough to say what the fluid is
 * doing somewhere you cannot reach, or what it will be doing shortly.
 *
 * That is the soft-sensor question exactly as `lib/ngrc/softsensor.js` frames it,
 * and a lattice simulation is an unusually honest testbed for it: the whole field
 * is known, so the "unmeasured" target is available for training and for grading
 * without instrumenting anything. In a real plant the target is why you are here.
 *
 * ARCHITECTURE. `lib/lattsim` stays free of `lib/ngrc` and vice versa -- the two
 * engines share nothing, which is the claim CLAUDE.md makes about them. THIS FILE
 * is the composition, at the level above both, and it is the only place the two
 * meet. It touches no engine internals: the simulation is driven through
 * `advance()` and read through `backend.probe()`, and the model is built from the
 * ngrc library's exported primitives.
 *
 * WHY NOT `SoftSensor` DIRECTLY. It is the right class for the CONTEMPORANEOUS
 * targets and it is used for them. But `adapt()` can only express a pairing
 * between the features it holds NOW and a target arriving NOW, and a forecast
 * needs features from H samples ago against the target that has just landed. The
 * ngrc soft-sensor page has the same problem and solves it with a ring of feature
 * columns in the caller; `SoftSensorBank` below is that pattern generalised, built
 * on the same exported primitives, so every head shares ONE feature expansion and
 * differs only in its delay. If this proves out, the follow-up is `directHorizons`
 * on `SoftSensor` itself (~15 lines mirroring `Continuous`) in the Python mirror.
 */
import { Block, rollingUpdate, buildLagsStride, addBias, rlsInit, rls, predict }
  from '../lib/ngrc/primitives.js';
import { universalMap } from '../lib/ngrc/feature_map.js';

/**
 * A bank of readouts sharing one lag embedding and one feature expansion, each
 * paired against its target at its own DELAY.
 *
 * delay 0 -> `y(k) = theta . phi(x(k))`, a reconstruction: say what is happening
 *            somewhere else, now.
 * delay H -> `y(k) = theta . phi(x(k-H))`, a forecast: the value issued H samples
 *            ago, graded now that its target has arrived.
 *
 * The delay is a property of the HEAD, not of the history, so one expansion serves
 * every horizon and the marginal cost of another target is one RLS update.
 */
export class SoftSensorBank {
  /**
   * @param {object} cfg
   * @param {number} cfg.nSignals measured signals per sample
   * @param {number} cfg.lag lag order of the embedding
   * @param {number} cfg.stride lag spacing
   * @param {number} cfg.warmup samples used to freeze the per-feature mean/std
   * @param {Array<{name:string, delay:number}>} cfg.heads one readout per entry
   * @param {object|null} [cfg.fmap] feature map; null = lean linear (bias + z)
   * @param {number[]|null} [cfg.prior] per-feature prior variances
   * @param {number} [cfg.initVariance] scalar P0 when no prior
   * @param {number} [cfg.lam] RLS forgetting factor
   */
  constructor({ nSignals, lag, stride, warmup, heads, fmap = null, prior = null,
    initVariance = 10.0, lam = 1.0 }) {
    this.ns = nSignals; this.lag = lag; this.stride = stride; this.warmup = warmup;
    this.heads = heads.map((h) => ({ ...h }));
    this.base = nSignals * lag;
    this.fmap = fmap;
    this.nf = fmap ? fmap.m : this.base + 1;
    this.lam = lam;
    const depth = (lag - 1) * stride + 1;
    this.hist = Array.from({ length: nSignals }, () => new Block(depth, 1));
    this.nPushed = 0;
    const p0 = prior != null ? prior : initVariance;
    for (const h of this.heads) {
      const { theta, P } = rlsInit(this.nf, p0);
      h.theta = theta; h.P = P; h.trained = 0;
    }
    // Ring of feature columns, long enough for the deepest head. A forecast is
    // graded against the column that ISSUED it, not against a fresh one.
    this.maxDelay = Math.max(0, ...this.heads.map((h) => h.delay));
    this.ring = new Array(this.maxDelay + 1).fill(null);
    this.ringAt = -1;                  // sample index of ring[ringAt % len]
    this._sum = new Array(this.base).fill(0.0);
    this._sq = new Array(this.base).fill(0.0);
    this._cnt = 0;
    this.fmean = new Array(this.base).fill(0.0);
    this.fstd = new Array(this.base).fill(1.0);
    this.frozen = false;
  }

  /** @returns {boolean} the lag history is full */
  ready() { return this.nPushed >= (this.lag - 1) * this.stride + 1; }

  /** @returns {boolean} the standardisation statistics are frozen */
  calibrated() { return this.frozen; }

  _raw() { return buildLagsStride(this.hist, this.lag, this.ns, this.stride); }

  _features(raw) {
    const z = new Array(this.base);
    for (let i = 0; i < this.base; i++) z[i] = (raw.m[i] - this.fmean[i]) / this.fstd[i];
    if (this.fmap) {
      const arr = this.fmap.expand(z);
      return new Block(arr.length, 1, arr);
    }
    return addBias(new Block(this.base, 1, z));
  }

  /**
   * Push one scan of measured signals. Returns true once a feature column exists,
   * which is later than `ready()` by the calibration window: standardising with
   * statistics that are still moving writes the RLS equations in shifting
   * coordinates, and at lam = 1 that error is permanent. The Lorenz tab paid four
   * times over for learning this.
   */
  push(signals) {
    for (let i = 0; i < this.ns; i++) rollingUpdate(this.hist[i], signals[i]);
    this.nPushed++;
    if (!this.ready()) return false;
    const raw = this._raw();
    if (!this.frozen) {
      for (let i = 0; i < this.base; i++) {
        this._sum[i] += raw.m[i]; this._sq[i] += raw.m[i] * raw.m[i];
      }
      this._cnt++;
      if (this._cnt >= this.warmup) {
        for (let i = 0; i < this.base; i++) {
          const mu = this._sum[i] / this._cnt;
          const varr = this._sq[i] / this._cnt - mu * mu;
          this.fmean[i] = mu;
          this.fstd[i] = varr > 1e-18 ? Math.sqrt(varr) : 1.0;
        }
        this.frozen = true;
      }
      return false;
    }
    this.ringAt++;
    this.ring[this.ringAt % this.ring.length] = this._features(raw);
    return true;
  }

  /** The column that a head of this delay should be graded and trained on. */
  _column(delay) {
    if (this.ringAt < 0 || this.ringAt - delay < 0) return null;
    const col = this.ring[(this.ringAt - delay) % this.ring.length];
    return col || null;
  }

  /**
   * The value this head is issuing right now: for delay H, an estimate of the
   * target H samples into the future. Never graded here -- it has no target yet.
   * @param {number} h head index @returns {number|null}
   */
  issue(h) {
    const col = this._column(0);
    return col ? predict(col, this.heads[h].theta) : null;
  }

  /**
   * Grade then train one head against a target that has just arrived.
   * SCORE BEFORE TRAIN, so every number reported is out-of-sample: the pair being
   * graded has not been seen by the readout that graded it.
   * @param {number} h head index @param {number} y measured truth
   * @returns {number|null} the out-of-sample estimate, or null if not yet issuable
   */
  observe(h, y) {
    const head = this.heads[h];
    const col = this._column(head.delay);
    if (!col) return null;
    const yHat = predict(col, head.theta);
    rls(head.theta, head.P, col, y, this.lam, 0.0);
    head.trained++;
    return yHat;
  }
}

/**
 * Running mean / variance / nRMSE, accumulated so a long run costs no memory.
 *
 * NORMALISED BY THE TRUTH'S STANDARD DEVIATION, not by its RMS, and the choice
 * decides whether any of these numbers mean anything. |u| in a channel is a large
 * mean plus a small fluctuation -- at the probe here, a 6% wobble on a DC level --
 * so dividing by the RMS would score "predict the average" at 0.06 and make every
 * model look excellent while predicting nothing. Against the standard deviation,
 * the mean predictor scores exactly 1.0 and only genuine tracking beats it.
 */
export class Score {
  constructor() { this.n = 0; this.se = 0; this.sy = 0; this.syy = 0; }
  add(y, yHat) {
    if (!Number.isFinite(yHat)) yHat = 0;
    this.n++; this.se += (y - yHat) ** 2; this.sy += y; this.syy += y * y;
  }
  get std() {
    if (this.n < 2) return 0;
    return Math.sqrt(Math.max(0, this.syy / this.n - (this.sy / this.n) ** 2));
  }
  get rmse() { return this.n ? Math.sqrt(this.se / this.n) : NaN; }
  /** rms(error) / std(truth): 1.0 = no better than predicting the mean. */
  get nrmse() { const s = this.std; return s > 0 ? this.rmse / s : NaN; }
}

export const DEFAULTS = Object.freeze({
  // SOLVER STEPS BETWEEN SAMPLES, fixed. The page's probe records once per
  // rendered FRAME, and steps-per-frame is a slider -- so a lag window measured
  // in samples would be a different physical time at every slider position, and
  // a viewing control would be changing a model. That is the residual's old
  // defect and it is not repeating here.
  every: 20,
  lag: 4, stride: 6,             // the soft-sensor tab's window: 4 lags, stride 6
  horizon: 10,                   // samples ahead for the forecast heads
  warmup: 250,                   // calibration, predict-only
  train: 2000,
  score: 2000,
  initVariance: 10.0,
  prior: { lin: 100.0, quad: 1.0, rand: 1.0 },
  ridges: [1, 10, 100, 1000],    // the lean rival's ridge, swept -- see buildModels
  nh: 24, nf: 24, seed: 12345,   // ReLU / Fourier widths of the universal map
});

/**
 * Read several cells at ONE instant.
 *
 * They must come from the same lattice state or the pairing is wrong: on the GPU
 * backend `probe()` awaits a `mapAsync`, and if the run loop is stepping during
 * that await the second cell is read from a LATER state than the first. Here the
 * caller owns the stepping, so nothing advances between these reads -- which is
 * why this experiment drives the simulation itself instead of riding the page's
 * render loop.
 * @returns {Promise<number[][]>} one `[rho, ux, uy, uz]` per cell
 */
export async function readCells(sim, cells) {
  const out = [];
  for (const c of cells) out.push(await sim.backend.probe('macro', c));
  return out;
}

const speed = (v) => Math.hypot(v[1], v[2], v[3]);

/**
 * Build the three-model ladder. Each rung differs from the one above it by
 * EXACTLY ONE thing, so what each is worth can be read off separately:
 *
 *   ngrc    universal map (bias + linear + quadratic + ReLU + Fourier) on the
 *           lag window
 *   linear  the SAME lag window, lean linear features -- isolates the feature map
 *   instant lean linear on ONE sample, no history -- isolates the memory
 *
 * All three are the same class, the same targets, the same online RLS, the same
 * standardisation and the same grading instances. A ladder like this is the only
 * way to answer "what actually bought the accuracy".
 */
export function buildModels(nSignals, heads, cfg) {
  const lag = cfg.lag, stride = cfg.stride;
  const base = nSignals * lag;
  const fmap = universalMap(base, cfg.nh, cfg.nf, cfg.seed);
  const common = { nSignals, warmup: cfg.warmup, heads };
  const models = {
    ngrc: new SoftSensorBank({ ...common, lag, stride, fmap,
      prior: fmap.prior(cfg.prior) }),
  };
  // THE RIDGE IS A CONFOUND UNTIL IT IS SWEPT. The expanded map carries a
  // STRUCTURED prior (100 on the linear terms, 1 on the quadratic and random
  // ones) while a lean model gets one scalar, so "ngrc beats linear" would
  // otherwise be reporting a difference in regularisation as a difference in
  // representation. This project has already paid for that mistake once, on the
  // double pendulum, where a ridge chosen on Lorenz cost the rival most of its
  // run. Sweeping it costs nothing here: the solver is 375 ms per sample and an
  // extra readout is a few microseconds.
  for (const iv of cfg.ridges) {
    models[`linear@${iv}`] = new SoftSensorBank({ ...common, lag, stride, fmap: null,
      initVariance: iv });
  }
  models.instant = new SoftSensorBank({ ...common, lag: 1, stride: 1, fmap: null,
    initVariance: cfg.initVariance });
  return models;
}

/**
 * Run the whole protocol against a built simulation.
 *
 * @param {object} sim a built `Simulation`
 * @param {object} spec
 * @param {number} spec.probeCell the cell you could actually instrument
 * @param {number} [spec.hiddenCell] a cell you could not -- the soft-sensor target
 * @param {object} [spec.cfg] overrides of `DEFAULTS`
 * @param {(s:string)=>void} [spec.log]
 * @returns {Promise<object>} scores per model per target, plus the baselines
 */
export async function run(sim, { probeCell, hiddenCell = null, cfg = {}, log = () => {} }) {
  const C = { ...DEFAULTS, ...cfg };
  const cells = hiddenCell == null ? [probeCell] : [probeCell, hiddenCell];

  // The measured signals are what the probe itself reports: density and the three
  // velocity components at one cell. Nothing else -- no neighbour, no field.
  const nSignals = 4;
  const heads = [{ name: 'probe +H', delay: C.horizon }];
  if (hiddenCell != null) {
    heads.push({ name: 'hidden now', delay: 0 });
    heads.push({ name: 'hidden +H', delay: C.horizon });
  }

  const models = buildModels(nSignals, heads, C);
  const names = Object.keys(models);
  const scores = {};
  for (const m of names) scores[m] = heads.map(() => new Score());
  // BASELINES. Persistence for the forecasts ("it stays where it is") and, for
  // the reconstruction, the probe's own speed scaled by the online least-squares
  // gain that fits it best -- the no-model, no-memory answer. A soft sensor that
  // cannot beat these has not earned its place.
  const base = heads.map(() => new Score());
  const truthRing = [];              // |u| history for persistence
  const hiddenRing = [];
  let gainNum = 0, gainDen = 0;      // online scaling for the reconstruction
  // PERIOD-PERSISTENCE: "it will do what it did one shedding period ago".
  // THE BASELINE THIS REGIME ACTUALLY DESERVES. A wake at this Reynolds number
  // is a LIMIT CYCLE, so the entire flow is one number -- the phase -- and a
  // model that recovers it will look spectacular against persistence while doing
  // nothing a lookup table could not. Predicting y(t) = y(t - P) needs no model
  // at all, and it is available to a forecast head too, since P exceeds the
  // horizon: at issue time t-H the sample at t-P has already happened.
  // If the expanded model cannot beat THIS, it has learned periodicity, not the
  // flow, and the honest conclusion is about the testbed rather than the method.
  const periodScore = heads.map(() => new Score());
  let period = 0, periodF = 0;

  const total = C.warmup + C.train + C.score;
  let sampled = 0, scoring = 0;
  const startStep = sim.step;

  while (sampled < total + C.horizon + C.lag * C.stride) {
    sim.advance(C.every);
    const v = await readCells(sim, cells);
    const uProbe = speed(v[0]);
    const uHidden = hiddenCell == null ? null : speed(v[1]);
    sampled++;
    truthRing.push(uProbe);
    if (uHidden != null) hiddenRing.push(uHidden);

    const signals = [v[0][0], v[0][1], v[0][2], v[0][3]];
    const live = {};
    for (const m of names) live[m] = models[m].push(signals);

    // Only grade once the calibration window has closed AND the training window
    // has been served: a number read during either is a number about the protocol
    // rather than about the model.
    const trainedEnough = models.ngrc.heads[0].trained >= C.train;
    const grade = trainedEnough && scoring < C.score;
    if (grade) scoring++;

    // Estimate the period ONCE, from the training window only -- measuring it on
    // the scored window would let the baseline peek at its own answer.
    if (grade && !period && hiddenRing.length > 200) {
      period = dominantPeriod(hiddenRing);
      periodF = dominantPeriod(hiddenRing, { refine: true }) || period;
    }

    for (let h = 0; h < heads.length; h++) {
      const d = heads[h].delay;
      // The truth for this head, arriving now, against features from `d` ago.
      const y = heads[h].name.startsWith('hidden') ? uHidden : uProbe;
      if (y == null) continue;
      for (const m of names) {
        if (!live[m]) continue;
        const yHat = models[m].observe(h, y);
        if (grade && yHat != null) scores[m][h].add(y, yHat);
      }
      if (!grade) {
        // Fit the reconstruction baseline's gain while the models train, so it is
        // converged by the time it is graded rather than warming up on camera.
        if (heads[h].name === 'hidden now') { gainNum += uProbe * y; gainDen += uProbe * uProbe; }
        continue;
      }
      if (heads[h].name === 'hidden now') {
        const g = gainDen > 0 ? gainNum / gainDen : 1;
        base[h].add(y, g * uProbe);
      } else {
        const ring = heads[h].name.startsWith('hidden') ? hiddenRing : truthRing;
        const prev = ring[ring.length - 1 - d];
        if (prev !== undefined) base[h].add(y, prev);
      }
      if (period > 0) {
        // FRACTIONAL LOOKUP. An integer period is a phase error of up to half a
        // sample, and on a steep signal that alone would account for most of this
        // baseline's error -- so beating an integer lookup could just mean "the
        // model interpolates and the table cannot", which is a far weaker claim
        // than modelling the flow. Interpolating removes that excuse.
        const ring = heads[h].name.startsWith('hidden') ? hiddenRing : truthRing;
        const k = ring.length - 1 - periodF;
        const k0 = Math.floor(k), f = k - k0;
        if (k0 >= 0 && k0 + 1 < ring.length) {
          periodScore[h].add(y, ring[k0] * (1 - f) + ring[k0 + 1] * f);
        }
      }
    }
    if (sampled % 500 === 0) {
      log(`  ${sampled}/${total} samples · step ${sim.step} · trained ${models.ngrc.heads[0].trained}`);
    }
    if (scoring >= C.score) break;
  }

  return {
    cfg: C, heads: heads.map((h) => h.name), models: names,
    features: Object.fromEntries(names.map((m) => [m, models[m].nf])),
    samples: sampled, steps: sim.step - startStep,
    scores: Object.fromEntries(names.map((m) => [m, scores[m].map((s) => ({
      nrmse: s.nrmse, rmse: s.rmse, std: s.std, n: s.n }))])),
    baseline: base.map((s) => ({ nrmse: s.nrmse, rmse: s.rmse, std: s.std, n: s.n })),
    period, periodF,
    periodBaseline: periodScore.map((s) => ({ nrmse: s.nrmse, rmse: s.rmse, n: s.n })),
  };
}

/**
 * Is there anything here to predict?
 *
 * ASK THIS FIRST. Poiseuille and a steady lid both converge to a genuinely
 * time-independent flow, and against a constant target every model scores
 * perfectly while having learned nothing -- the nRMSE denominator collapses and
 * the ratio is noise over noise. A soft sensor is only being tested where the
 * target actually moves, which on this engine means a shedding wake, a driven
 * lid, or a stirred flow.
 *
 * @returns {Promise<{mean:number, std:number, rel:number, late:number, crossings:number}>}
 */
export async function unsteadiness(sim, cell, { every = 20, samples = 400 } = {}) {
  const u = [];
  for (let i = 0; i < samples; i++) {
    sim.advance(every);
    const v = await sim.backend.probe('macro', cell);
    u.push(v[2]);                              // transverse component: 0 unless it sheds
  }
  const mean = u.reduce((a, b) => a + b, 0) / u.length;
  const dev = u.map((x) => x - mean);
  const std = Math.sqrt(dev.reduce((a, b) => a + b * b, 0) / dev.length);
  const halve = (arr) => {
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
  };
  const first = halve(u.slice(0, u.length >> 1));
  const late = halve(u.slice(u.length >> 1));
  let crossings = 0;
  for (let i = 1; i < dev.length; i++) if ((dev[i - 1] < 0) !== (dev[i] < 0)) crossings++;
  // `late / first` separates a DECAYING oscillation from a sustained one, which an
  // amplitude alone cannot do -- a sub-critical wake oscillates at very nearly the
  // right frequency all the way down to zero.
  return { mean, std, rel: std / (Math.abs(mean) + 1e-12), late: late / (first + 1e-30), crossings };
}

/**
 * Dominant period of a signal, in samples, by autocorrelation first peak.
 *
 * Mean-removed, and the search starts past the autocorrelation's initial descent
 * so it cannot lock onto lag 0. Used only to give the period-persistence baseline
 * its lag; it is measured on the TRAINING window so the baseline never sees the
 * data it is graded on.
 */
export function dominantPeriod(series, { min = 3, max = 300, refine = false } = {}) {
  const n = series.length;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  const x = series.map((v) => v - mean);
  const hi = Math.min(max, (n >> 1) - 1);
  const r = new Array(hi + 1).fill(0);
  for (let lag = 0; lag <= hi; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += x[i] * x[i - lag];
    r[lag] = s / (n - lag);
  }
  // SKIP THE MAIN LOBE FIRST. Taking the first local maximum instead locks onto
  // whatever ripple a harmonic puts on the descent -- measured: a synthetic
  // period-31 signal with a second harmonic returned 4. The autocorrelation of a
  // periodic signal goes NEGATIVE about a quarter period in, and the first true
  // peak after that crossing is the period; a half-period harmonic peak lands
  // where the fundamental is negative, so it cannot win there.
  let lag = min;
  while (lag <= hi && r[lag] > 0) lag++;
  // THE FIRST PEAK AFTER THE CROSSING, not the largest. A periodic signal's
  // autocorrelation has a peak at EVERY multiple of the period, and the
  // finite-sample estimate divides by (n - lag), so the far peaks are noisier and
  // routinely larger -- measured: a global argmax returned 68 for a period-17
  // signal and 272 for a period-8 one. Walking to the first local maximum
  // returns the fundamental.
  for (; lag + 1 <= hi; lag++) {
    if (r[lag] > r[lag - 1] && r[lag] >= r[lag + 1] && r[lag] > 0.1 * r[0]) {
      if (!refine) return lag;
      // Parabolic interpolation through the peak and its two neighbours: the true
      // period is rarely an exact number of samples, and the vertex of the fitted
      // parabola recovers the fraction.
      const a = r[lag - 1], b = r[lag], c = r[lag + 1];
      const den = a - 2 * b + c;
      return den !== 0 ? lag + 0.5 * (a - c) / den : lag;
    }
  }
  return 0;
}
