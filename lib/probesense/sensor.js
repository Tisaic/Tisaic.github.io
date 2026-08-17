/**
 * @file Soft-sensing a field from one point in it.
 *
 * THE COMPOSITION LAYER, and the reason it is its own library. `lib/lattsim` and
 * `lib/ngrc` share nothing -- that independence is a claim this project makes and
 * keeps -- so the thing that joins them cannot live inside either. This module
 * depends on `lib/ngrc` for the model and on NOTHING for the physics: it is fed
 * numbers. The page reads them off a lattice; a test reads them off an array.
 *
 * TWO QUESTIONS, ONE FEATURE EXPANSION:
 *
 *   ESTIMATE   what is the field doing at a point you cannot instrument, NOW,
 *              given the recent history of a point you can?
 *   PREDICT    what will it be doing there in H steps?
 *
 * Both readouts share one lag embedding and one expansion, computed once per
 * sample, and differ only in the DELAY at which features are paired with truth.
 * The estimate pairs contemporaneously; the prediction pairs the column from H
 * steps ago against the truth that has just arrived, which is what makes the
 * score out-of-sample and what makes the chart alignable.
 *
 * WHY NOT `SoftSensor` FROM THE LIBRARY DIRECTLY: its `adapt()` can only express
 * a contemporaneous pairing, so a horizon needs a ring of feature columns in the
 * caller. The ngrc soft-sensor page solves it the same way for its "+1 s" caret.
 * Adding `directHorizons` to `SoftSensor` (~15 lines, mirroring `Continuous`)
 * belongs in the Python mirror first, since that port carries golden-vector
 * parity tests.
 */
import { Block, rollingUpdate, buildLagsStride, addBias, rlsInit, rls, predict }
  from '../ngrc/primitives.js';
import { universalMap } from '../ngrc/feature_map.js';

/**
 * What a point in a fluid field can report, and how to get it from one probe
 * reading. A probe returns `[rho, ux, uy, uz]`; everything here is a function of
 * that, so adding a quantity never costs another readback.
 *
 * `|u|` IS DELIBERATELY OFFERED ALONGSIDE THE COMPONENTS rather than instead of
 * them. It is what a magnitude-only instrument gives you, and it is NOT a linear
 * function of the components -- so which of the two a model is given changes the
 * problem, not just the units, and being able to switch is the point.
 */
export const QUANTITIES = Object.freeze({
  speed: { label: '|u|', of: (v) => Math.hypot(v[1], v[2], v[3]) },
  ux: { label: 'u_x', of: (v) => v[1] },
  uy: { label: 'u_y', of: (v) => v[2] },
  uz: { label: 'u_z', of: (v) => v[3] },
  rho: { label: 'ρ', of: (v) => v[0] },
});

/** Running mean / variance / nRMSE, accumulated so a long run costs no memory. */
export class Score {
  constructor() { this.reset(); }
  reset() { this.n = 0; this.se = 0; this.sy = 0; this.syy = 0; }
  add(y, yHat) {
    if (!Number.isFinite(yHat)) yHat = 0;
    this.n++; this.se += (y - yHat) ** 2; this.sy += y; this.syy += y * y;
  }
  get std() {
    if (this.n < 2) return 0;
    return Math.sqrt(Math.max(0, this.syy / this.n - (this.sy / this.n) ** 2));
  }
  get rmse() { return this.n ? Math.sqrt(this.se / this.n) : NaN; }
  /**
   * rms(error) / std(truth). NORMALISED BY THE VARIATION, NOT THE LEVEL, and the
   * choice is what makes the number mean anything: |u| in a channel is a large
   * mean plus a small fluctuation, so dividing by the RMS would score "predict the
   * average" at a few percent and flatter every model at once. Against the
   * standard deviation the mean predictor scores exactly 1.0, and only genuine
   * tracking beats it.
   */
  get nrmse() { const s = this.std; return s > 0 ? this.rmse / s : NaN; }
}

/**
 * A bank of readouts sharing one lag embedding and one feature expansion, each
 * paired against its target at its own delay.
 */
export class SoftSensorBank {
  constructor({ nSignals, lag, stride, warmup, heads, fmap = null, prior = null,
    initVariance = 10.0, lam = 1.0 }) {
    this.ns = nSignals; this.lag = lag; this.stride = stride; this.warmup = warmup;
    this.heads = heads.map((h) => ({ ...h }));
    this.base = nSignals * lag;
    this.fmap = fmap;
    this.nf = fmap ? fmap.m : this.base + 1;
    this.lam = lam;
    this.depth = (lag - 1) * stride + 1;
    this.hist = Array.from({ length: nSignals }, () => new Block(this.depth, 1));
    this.nPushed = 0;
    const p0 = prior != null ? prior : initVariance;
    for (const h of this.heads) {
      const { theta, P } = rlsInit(this.nf, p0);
      h.theta = theta; h.P = P; h.trained = 0;
    }
    this.maxDelay = Math.max(0, ...this.heads.map((h) => h.delay));
    this.ring = new Array(this.maxDelay + 1).fill(null);
    this.ringAt = -1;
    this._sum = new Array(this.base).fill(0.0);
    this._sq = new Array(this.base).fill(0.0);
    this._cnt = 0;
    this.fmean = new Array(this.base).fill(0.0);
    this.fstd = new Array(this.base).fill(1.0);
    this.frozen = false;
  }

  /** Lag history full. */
  ready() { return this.nPushed >= this.depth; }
  /** Standardisation statistics frozen; feature columns exist from here. */
  calibrated() { return this.frozen; }
  /** Samples still needed before the calibration window closes. */
  calibrationLeft() { return Math.max(0, this.warmup - this._cnt); }

  _raw() { return buildLagsStride(this.hist, this.lag, this.ns, this.stride); }

  _features(raw) {
    const z = new Array(this.base);
    for (let i = 0; i < this.base; i++) z[i] = (raw.m[i] - this.fmean[i]) / this.fstd[i];
    if (this.fmap) return new Block(this.fmap.m, 1, this.fmap.expand(z));
    return addBias(new Block(this.base, 1, z));
  }

  /**
   * Push one scan of measured signals.
   *
   * Returns true once a feature column exists, which is LATER than `ready()` by
   * the calibration window. Standardising against statistics that are still
   * moving writes the RLS equations in shifting coordinates, and at lam = 1 that
   * error never washes out -- the Lorenz tab's single largest fix was feeding a
   * calibration window predict-only for exactly this reason.
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

  /** The column a head of this delay is graded and trained on. */
  _column(delay) {
    if (this.ringAt < 0 || this.ringAt - delay < 0) return null;
    return this.ring[(this.ringAt - delay) % this.ring.length] || null;
  }

  /** What this head is issuing now: for delay H, the value H samples ahead. */
  issue(h) {
    const col = this._column(0);
    return col ? predict(col, this.heads[h].theta) : null;
  }

  /** The out-of-sample estimate for a target arriving now, without training. */
  peek(h) {
    const col = this._column(this.heads[h].delay);
    return col ? predict(col, this.heads[h].theta) : null;
  }

  /**
   * Grade then train one head against a target that has just arrived.
   * SCORE BEFORE TRAIN, so every reported number is out-of-sample.
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
 * A deployable pair of virtual instruments on a field: one estimate of a point
 * you cannot measure, and one prediction of that point H steps out.
 *
 * PROTOCOL, and it is a lifecycle rather than a switch:
 *
 *   idle         placed but not started; nothing is learned
 *   calibrating  the standardisation window, predict-only. Gated, not optional.
 *   training     estimating AND adapting toward the truth
 *   estimating   LOCKED: the readouts are frozen and run open-loop
 *
 * The lock is the whole point of a soft sensor: excite the flow while it trains,
 * then freeze it and see whether what it learned holds. Scores restart at every
 * transition, because a meter read across a mode change is measuring the mix.
 */
export class FieldSoftSensor {
  /**
   * @param {object} cfg
   * @param {string[]} cfg.inputs quantity keys read at the sensor point
   * @param {string} cfg.target quantity key estimated at the hidden point
   * @param {number} cfg.horizon prediction lead, in SAMPLES
   * @param {number} cfg.lag lag order @param {number} cfg.stride lag spacing
   * @param {number} [cfg.warmup] calibration samples
   * @param {boolean} [cfg.expand] universal feature map (false = lean linear)
   * @param {number} [cfg.ridge] prior variance on the linear terms
   * @param {number} [cfg.every] solver steps between samples, for the record
   */
  constructor(cfg) {
    const { inputs, target, horizon, lag, stride, warmup = 200, expand = true,
      ridge = 100, every = 20, lam = 1.0, keep = 400 } = cfg;
    this.cfg = { inputs: [...inputs], target, horizon, lag, stride, warmup, expand,
      ridge, every, lam, keep };
    const base = inputs.length * lag;
    const fmap = expand ? universalMap(base, 24, 24, 12345) : null;
    this.bank = new SoftSensorBank({
      nSignals: inputs.length, lag, stride, warmup,
      heads: [{ name: 'estimate', delay: 0 }, { name: 'predict', delay: horizon }],
      fmap,
      // The structured prior is what the expanded map wants: generous on the
      // linear terms, tight on the quadratic and random ones, so a rich basis
      // cannot spend its freedom before the data has earned it.
      prior: fmap ? fmap.prior({ lin: ridge, quad: ridge / 100, rand: ridge / 100 }) : null,
      initVariance: ridge, lam,
    });
    this.mode = 'idle';
    this.samples = 0;
    this.estScore = new Score(); this.predScore = new Score();
    this.estBase = new Score(); this.predBase = new Score();
    // Predictions waiting for their target to arrive. Each carries the STEP it
    // is about, which is what lets the chart draw it where it belongs instead of
    // where it was made -- the whole point of a time-aligned forecast trace.
    this.pending = [];
    this.series = [];            // { step, truth, estimate, sensor }
    this.matured = [];           // { step, value } prediction landing at that step
    this.live = null;            // { step, value } the forecast currently issued
    this._gainNum = 0; this._gainDen = 0;
    this._truthRing = [];
    this._washout = 0;
    // TARGET NORMALISATION, and it is not cosmetic -- without it a density target
    // is unlearnable in the only sense that matters. rho is a fluctuation of about
    // 1% ON TOP OF A LEVEL OF 1.0, so an un-normalised readout has to produce
    // 1.0 +/- 0.01 and the prior regularises the bias weight and the modulation
    // weights identically: the modulation is effectively ridged a hundred times
    // harder than the offset it rides on. MEASURED before this existed, on a
    // synthetic field where the velocity targets scored 1.6e-2: rho scored 1.69,
    // WORSE than predicting its own mean, and 5x worse than persistence.
    // Centring and scaling by the calibration window's own statistics makes the
    // readout scale-free in the target, so one ridge setting means the same thing
    // whether the target is a 0.08 velocity or a 0.01 density ripple.
    this._tSum = 0; this._tSq = 0; this._tCnt = 0;
    this._tMean = 0; this._tStd = 1; this._tFrozen = false;
  }

  get inputsLabel() { return this.cfg.inputs.map((k) => QUANTITIES[k].label).join(', '); }
  get targetLabel() { return QUANTITIES[this.cfg.target].label; }
  get trained() { return this.bank.heads[0].trained; }

  /** Begin (or resume) adapting. */
  train() { if (this.mode !== 'training') { this.mode = 'training'; this._restartScores(); } }
  /** Stop adapting but keep estimating: the deployed soft sensor. */
  lock() { if (this.mode !== 'estimating') { this.mode = 'estimating'; this._restartScores(); } }
  /** Hold everything: no learning, no scoring. */
  pause() { this.mode = 'idle'; }

  _restartScores() {
    for (const s of [this.estScore, this.predScore, this.estBase, this.predBase]) s.reset();
  }

  /**
   * A DISCONTINUITY IN THE INPUT STREAM, e.g. a rebuild or a lost cadence.
   *
   * The lag window now straddles two unrelated flows, so pairing features from
   * before it with targets from after it teaches a transition that never
   * physically happened. The Lorenz tab measured that exact damage as permanent
   * at lam = 1 and accumulating with every occurrence; the fix there and here is
   * a short predict-only re-entry until the window has refilled.
   */
  breakStream() { this._washout = this.bank.depth; this.pending.length = 0; }

  /**
   * One sample. Signals come from the sensor point, truth from the hidden point.
   * @param {number} step solver step this sample was taken at
   * @param {number[]} sensorRead `[rho, ux, uy, uz]` at the sensor point
   * @param {number[]} targetRead `[rho, ux, uy, uz]` at the hidden point
   */
  sample(step, sensorRead, targetRead) {
    const signals = this.cfg.inputs.map((k) => QUANTITIES[k].of(sensorRead));
    const truth = QUANTITIES[this.cfg.target].of(targetRead);
    const sensorMain = QUANTITIES[this.cfg.inputs[0]].of(sensorRead);
    if (!signals.every(Number.isFinite) || !Number.isFinite(truth)) return;

    // The target's own statistics come from the SAME window as the inputs', and
    // are frozen at the same moment, so nothing downstream sees a moving scale.
    if (!this._tFrozen) {
      this._tSum += truth; this._tSq += truth * truth; this._tCnt++;
      if (this._tCnt >= this.cfg.warmup) {
        this._tMean = this._tSum / this._tCnt;
        const varr = this._tSq / this._tCnt - this._tMean * this._tMean;
        this._tStd = varr > 1e-30 ? Math.sqrt(varr) : 1;
        this._tFrozen = true;
      }
    }
    const live = this.bank.push(signals);
    this.samples++;
    this._truthRing.push(truth);
    if (this._truthRing.length > this.cfg.horizon + 4) this._truthRing.shift();

    if (this._washout > 0) { this._washout--; return; }
    if (this.mode === 'idle' || !live) {
      this._record(step, truth, null, sensorMain);
      return;
    }

    // ESTIMATE: contemporaneous, so it is graded the moment it is made.
    const yz = (truth - this._tMean) / this._tStd;
    const est = this._denorm(this.bank.peek(0));
    if (this.mode === 'training') {
      this.bank.observe(0, yz);
      this._gainNum += sensorMain * truth; this._gainDen += sensorMain * sensorMain;
    }
    if (est != null) {
      this.estScore.add(truth, est);
      // The no-model answer: the sensor's own reading, scaled by the gain that
      // fits it best. If a soft sensor cannot beat a calibration constant, the
      // model is not what is doing the work.
      const g = this._gainDen > 0 ? this._gainNum / this._gainDen : 1;
      this.estBase.add(truth, g * sensorMain);
    }

    // PREDICT: graded only when its target arrives, which is H samples later.
    const due = this.pending.length && this.pending[0].step <= step ? this.pending.shift() : null;
    if (due) {
      this.predScore.add(truth, due.value);
      // Persistence: "it will be what it is now". The honest reference for any
      // forecast, and a genuinely hard one to beat on a smooth signal.
      const prev = this._truthRing[this._truthRing.length - 1 - this.cfg.horizon];
      if (prev !== undefined) this.predBase.add(truth, prev);
      this.matured.push({ step, value: due.value });
      if (this.matured.length > this.cfg.keep) this.matured.shift();
    }
    if (this.mode === 'training') this.bank.observe(1, yz);

    const ahead = this._denorm(this.bank.issue(1));
    if (ahead != null) {
      this.live = { step: step + this.cfg.horizon * this.cfg.every, value: ahead };
      this.pending.push({ step: this.live.step, value: ahead });
      if (this.pending.length > this.cfg.horizon + 8) this.pending.shift();
    }
    this._record(step, truth, est, sensorMain);
  }

  /** Back to the target's own units. */
  _denorm(v) { return v == null ? null : this._tMean + this._tStd * v; }

  _record(step, truth, estimate, sensor) {
    this.series.push({ step, truth, estimate, sensor });
    if (this.series.length > this.cfg.keep) this.series.shift();
  }

  /** Everything a UI needs, computed nowhere else. */
  status() {
    const cal = this.bank.calibrationLeft();
    return {
      mode: this.mode, samples: this.samples, trained: this.trained,
      calibrating: !this.bank.calibrated(), calibrationLeft: cal,
      washout: this._washout,
      features: this.bank.nf, signals: this.bank.ns, depth: this.bank.depth,
      targetMean: this._tMean, targetStd: this._tStd,
      estimate: { nrmse: this.estScore.nrmse, n: this.estScore.n,
        baseline: this.estBase.nrmse,
        ratio: this.estBase.nrmse / this.estScore.nrmse },
      predict: { nrmse: this.predScore.nrmse, n: this.predScore.n,
        baseline: this.predBase.nrmse,
        ratio: this.predBase.nrmse / this.predScore.nrmse },
    };
  }
}
