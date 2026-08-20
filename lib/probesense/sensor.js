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

/** How many standard deviations a standardised input may reach. See `_features`. */
const Z_CLAMP = 10;

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

/**
 * Running mean / variance / nRMSE, accumulated so a long run costs no memory.
 *
 * WELFORD, NOT sum-of-squares, and the difference is not academic on this data.
 * `E[x^2] - mean^2` subtracts two nearly equal numbers whenever a signal is a
 * small fluctuation riding a large mean -- which is DENSITY, a ~3e-6 fluctuation
 * on a level of 1.0 at a wall tap, so the two terms agree to eleven digits and
 * the variance is whatever survives in the last four. MEASURED against a two-pass
 * reference on the shipped stream: the one-pass form was wrong by 5.9e-4 relative
 * at a 200-sample window and 2.1e-3 at 1600, GROWING with the window because the
 * sums grow while the difference does not; Welford held 1e-10 flat at every
 * length. A longer calibration window is something an operator would reasonably
 * ask for to get a more representative one, and it was making the scale worse.
 *
 * A real transducer is in the same regime, harder -- 101 kPa of absolute pressure
 * carrying a 10 Pa signal -- so this gets worse on hardware, not better.
 *
 * Found by a parity check between an offline reproduction of this standardisation
 * and this class, not by any symptom: nothing failed, the numbers were merely
 * wrong in the fifth digit.
 */
export class Score {
  constructor() { this.reset(); }
  reset() { this.n = 0; this.se = 0; this.mu = 0; this.m2 = 0; }
  add(y, yHat) {
    if (!Number.isFinite(yHat)) yHat = 0;
    this.n++; this.se += (y - yHat) ** 2;
    const d = y - this.mu;
    this.mu += d / this.n;
    this.m2 += d * (y - this.mu);
  }
  /** Mean of the truths seen, exact to rounding. */
  get mean() { return this.mu; }
  get std() {
    if (this.n < 2) return 0;
    return Math.sqrt(Math.max(0, this.m2 / this.n));
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
    initVariance = 10.0, lam = 1.0, directional = false, maxCovTrace = 0.0 }) {
    this.ns = nSignals; this.lag = lag; this.stride = stride; this.warmup = warmup;
    this.heads = heads.map((h) => ({ ...h }));
    this.base = nSignals * lag;
    this.fmap = fmap;
    this.nf = fmap ? fmap.m : this.base + 1;
    this.lam = lam;
    // FORGETTING, AND THE GUARD THAT MAKES IT SAFE. With lam < 1 the covariance is
    // inflated in EVERY direction each step, but only the directions the regressor
    // excites get new information to push back -- so on a poorly exciting stream the
    // unexcited ones wind up without bound. A settled wake or a driven cavity is a
    // LIMIT CYCLE, i.e. exactly that condition. Directional forgetting discounts
    // only along the current regressor; `maxCovTrace` is the blunt backstop.
    this.directional = directional;
    this.maxCovTrace = maxCovTrace;
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
    // Welford accumulators -- see `Score` for why this is not sum-of-squares.
    this._mu = new Float64Array(this.base);
    this._m2 = new Float64Array(this.base);
    this._cnt = 0;
    this.fmean = new Array(this.base).fill(0.0);
    this.fstd = new Array(this.base).fill(1.0);
    this.frozen = false;
    this.clamped = 0;
  }

  /**
   * Restart the calibration window, if it has not already closed.
   *
   * THE STATISTICS MUST DESCRIBE THE FLOW THE MODEL WILL BE TRAINED ON. A lattice
   * starts from rest, so a window gathered from the moment a probe was placed
   * describes a developing transient -- and on a wall cell that is very nearly a
   * constant. Anchoring the window to the training request instead means the
   * operator's "start training" also means "this is the flow I mean".
   */
  restartCalibration() {
    if (this.frozen) return false;
    this._mu.fill(0); this._m2.fill(0); this._cnt = 0;
    return true;
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
    for (let i = 0; i < this.base; i++) {
      let v = (raw.m[i] - this.fmean[i]) / this.fstd[i];
      // AND A CLAMP, which is the actual guarantee. Even a correctly measured
      // standard deviation can be exceeded later: the calibration window is a
      // finite sample of a flow that is still developing, so it need not have seen
      // the range. Ten deviations is far outside anything the fit can use, and
      // saturating there costs a little information where running unbounded costs
      // the whole model -- the quadratic terms turn a factor of 1e4 into 1e8.
      // The count is surfaced, because a saturating input means the window was
      // unrepresentative and the honest remedy is to re-calibrate on the flow as
      // it now is rather than to widen a limit.
      if (!(v > -Z_CLAMP)) { v = -Z_CLAMP; this.clamped++; }
      else if (!(v < Z_CLAMP)) { v = Z_CLAMP; this.clamped++; }
      z[i] = v;
    }
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
      this._cnt++;
      for (let i = 0; i < this.base; i++) {
        const d = raw.m[i] - this._mu[i];
        this._mu[i] += d / this._cnt;
        this._m2[i] += d * (raw.m[i] - this._mu[i]);
      }
      if (this._cnt >= this.warmup) {
        const sd = new Array(this.base);
        for (let i = 0; i < this.base; i++) {
          this.fmean[i] = this._mu[i];
          sd[i] = Math.sqrt(Math.max(0, this._m2[i] / this._cnt));
        }
        // A RELATIVE FLOOR, because an absolute one is a trap. A no-slip WALL CELL
        // barely moves, and a calibration window taken while the flow is still
        // developing from rest sees almost no variance in it -- so the standard
        // deviation comes out microscopic, every later sample is divided by it, and
        // the quadratic terms then square the result. MEASURED on a stream whose
        // calibration variance was 1e-7 of its eventual variance: nRMSE 1.58e7,
        // against 0.18 when the window was representative. The old 1e-18 floor
        // rescued only the fully dead channel; everything between was the trap.
        //
        // A channel varying less than a thousandth of the busiest one carries
        // nothing at the scale the model works at, so it is left unscaled rather
        // than amplified.
        const sdMax = Math.max(...sd);
        const floor = sdMax > 0 ? 1e-3 * sdMax : 0;
        for (let i = 0; i < this.base; i++) {
          this.fstd[i] = sd[i] > floor && sd[i] > 1e-30 ? sd[i] : (sdMax > 0 ? sdMax : 1.0);
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
    rls(head.theta, head.P, col, y, this.lam, this.maxCovTrace, this.directional);
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
      ridge = 100, every = 20, lam = 1.0, keep = 400, directional = false,
      maxCovTrace = 0.0, sensors = 1 } = cfg;
    this.cfg = { inputs: [...inputs], target, horizon, lag, stride, warmup, expand,
      ridge, every, lam, keep, directional, maxCovTrace, sensors };
    // ONE FEATURE PER (SENSOR, QUANTITY, LAG). A second hard sensor is a second
    // point in the field you can actually instrument, so its readings join the
    // input vector rather than replacing anything: two points, three quantities,
    // four lags is a 24-wide base. The structured prior and standardisation treat
    // every input the same, so a sensor added downstream is on equal footing.
    const base = inputs.length * sensors * lag;
    this._fmap = expand ? universalMap(base, 24, 24, 12345) : null;
    this.recalibrations = 0;
    this.bank = this._makeBank();
    this.mode = 'idle';
    this._settled = false;
    this._winStart = 0; this._winClamped = 0;
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
    this._tM = 0; this._tM2 = 0; this._tCnt = 0;
    this._tMean = 0; this._tStd = 1; this._tFrozen = false;
  }

  _makeBank() {
    const c = this.cfg, fmap = this._fmap;
    return new SoftSensorBank({
      nSignals: c.inputs.length * (c.sensors || 1), lag: c.lag, stride: c.stride, warmup: c.warmup,
      heads: [{ name: 'estimate', delay: 0 }, { name: 'predict', delay: c.horizon }],
      fmap,
      // The structured prior is what the expanded map wants: generous on the
      // linear terms, tight on the quadratic and random ones, so a rich basis
      // cannot spend its freedom before the data has earned it.
      prior: fmap ? fmap.prior({ lin: c.ridge, quad: c.ridge / 100, rand: c.ridge / 100 })
        : null,
      initVariance: c.ridge, lam: c.lam,
      directional: c.directional, maxCovTrace: c.maxCovTrace,
    });
  }

  /**
   * THE CALIBRATION WINDOW HAS TO BE REPRESENTATIVE, and whether it was can only
   * be known afterwards.
   *
   * A lattice starts from rest, so a window taken early describes a developing
   * transient -- and on a no-slip WALL CELL that is very nearly a constant. The
   * frozen standard deviation is then far below the flow's eventual variation,
   * every later sample is divided by it, and the quadratic terms square the
   * result: MEASURED at nRMSE 1.58e7 where a representative window gave 0.18.
   *
   * The symptom is unambiguous and cheap to watch: the standardised inputs
   * SATURATE. So the first stretch of training is treated as provisional, and if
   * the inputs are saturating through it the window is declared unrepresentative,
   * the model is rebuilt, and calibration restarts on the flow as it now is.
   * Bounded attempts, because a flow that never settles must not loop forever --
   * after that the model runs anyway and `clamped` says why it is poor.
   *
   * This is the same stationarity question the physics side of this project keeps
   * running into, pointed at the model's own statistics: a measurement taken
   * across a transient describes the transient.
   */
  _recalibrateIfUnrepresentative() {
    if (!this.bank.calibrated() || this.recalibrations >= 6) return false;
    // A ROLLING WINDOW, NOT A ONE-SHOT LATCH, and the difference is the whole
    // point. The first version declared the model "settled" the moment saturation
    // fell below the threshold and never looked again -- so it could catch an
    // unrepresentative STARTUP and nothing else. MEASURED: with the lid frequency
    // changed from 0.5 to 1.2 under a trained model, 3560 input slots saturated
    // over 900 samples (about a third of them) and the estimate went to nRMSE 5.1,
    // five times WORSE than a scaled sensor reading -- identically for every
    // forgetting factor, because the weights were never what was wrong.
    const n = this.bank.nPushed - this._winStart;
    if (n < Math.max(40, this.cfg.warmup >> 1)) return false;
    const rate = (this.bank.clamped - this._winClamped) / Math.max(1, n * this.bank.base);
    if (rate <= 0.02) {
      // Slide the window rather than latching: this stream is fine FOR NOW.
      this._winStart = this.bank.nPushed; this._winClamped = this.bank.clamped;
      this._settled = true;
      return false;
    }
    this.recalibrations++;
    this.bank = this._makeBank();
    this._winStart = 0; this._winClamped = 0;
    this._tM = 0; this._tM2 = 0; this._tCnt = 0; this._tFrozen = false;
    this.pending.length = 0;
    this._gainNum = 0; this._gainDen = 0;
    this._restartScores();
    return true;
  }

  get inputsLabel() {
    const q = this.cfg.inputs.map((k) => QUANTITIES[k].label).join(', ');
    return (this.cfg.sensors || 1) > 1 ? `${q} ×${this.cfg.sensors} sensors` : q;
  }
  get targetLabel() { return QUANTITIES[this.cfg.target].label; }
  get trained() { return this.bank.heads[0].trained; }

  /** Begin (or resume) adapting. */
  train() {
    if (this.mode === 'training') return;
    // Anchor the calibration window here rather than at placement: the flow at
    // the moment the operator asks for training is the flow the statistics should
    // describe. Also drop the target's accumulators, so both are measured over the
    // same window as before.
    if (this.bank.restartCalibration()) {
      this._tM = 0; this._tM2 = 0; this._tCnt = 0;
    }
    this.mode = 'training';
    this._restartScores();
  }
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
    // One read `[rho,ux,uy,uz]`, or an array of reads for multiple hard sensors.
    // A macro read is an array of numbers, so the presence of a nested array is
    // what distinguishes the two -- and one sensor keeps working unchanged.
    const reads = Array.isArray(sensorRead[0]) ? sensorRead : [sensorRead];
    const signals = [];
    for (const r of reads) for (const k of this.cfg.inputs) signals.push(QUANTITIES[k].of(r));
    const truth = QUANTITIES[this.cfg.target].of(targetRead);
    // The no-model baseline reads the FIRST quantity of the FIRST sensor -- a
    // single instrument scaled, the thing a second sensor has to beat.
    const sensorMain = QUANTITIES[this.cfg.inputs[0]].of(reads[0]);
    if (!signals.every(Number.isFinite) || !Number.isFinite(truth)) return;

    // The target's own statistics come from the SAME window as the inputs', and
    // are frozen at the same moment, so nothing downstream sees a moving scale.
    if (!this._tFrozen) {
      this._tCnt++;
      const d = truth - this._tM;
      this._tM += d / this._tCnt;
      this._tM2 += d * (truth - this._tM);
      if (this._tCnt >= this.cfg.warmup) {
        this._tMean = this._tM;
        const varr = this._tM2 / this._tCnt;
        this._tStd = varr > 1e-30 ? Math.sqrt(varr) : 1;
        this._tFrozen = true;
      }
    }
    const live = this.bank.push(signals);
    this.samples++;
    this._truthRing.push(truth);
    if (this._truthRing.length > this.cfg.horizon + 4) this._truthRing.shift();

    if (this._washout > 0) { this._washout--; return; }
    if (this.mode === 'training' && this._recalibrateIfUnrepresentative()) {
      this._record(step, truth, null, sensorMain);
      return;
    }
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
    // IS THERE ANYTHING TO SENSE? Asked first, because it decides whether any of
    // the numbers below mean anything. A settled flow has a CONSTANT target --
    // measured on the shipped channel after it converged: the truth spanned
    // 0.0821 to 0.0821, a variation of 1e-7 on a value of 0.082 -- and every
    // nRMSE is then noise divided by noise. This is the same question the physics
    // side asks of a wake before scoring a forecast on it, and it has to be asked
    // here too: a soft sensor on a steady field is not doing badly, it is being
    // asked nothing.
    const mean = this.estScore.n ? this.estScore.mean : 0;
    const activity = Math.abs(mean) > 0 ? this.estScore.std / Math.abs(mean) : 0;
    return {
      targetMeanLive: mean, targetActivity: activity,
      steadyTarget: this.estScore.n > 50 && activity < 1e-4,
      mode: this.mode, samples: this.samples, trained: this.trained,
      calibrating: !this.bank.calibrated(), calibrationLeft: cal,
      washout: this._washout,
      features: this.bank.nf, signals: this.bank.ns, depth: this.bank.depth,
      clamped: this.bank.clamped, recalibrations: this.recalibrations,
      // trace(P) and |theta| ARE the windup, so they are reported rather than
      // inferred from a score that cannot distinguish it from anything else.
      pTrace: this.bank.heads.map((h) => {
        let t = 0;
        for (let i = 0; i < this.bank.nf; i++) t += h.P.m[i * this.bank.nf + i];
        return t;
      }),
      thetaNorm: this.bank.heads.map((h) => Math.sqrt(h.theta.m.reduce((a, c) => a + c * c, 0))),
      scale: { min: Math.min(...this.bank.fstd), max: Math.max(...this.bank.fstd) },
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

/**
 * Reconstruct MANY field locations from ONE sensor, sharing a single reservoir.
 *
 * This is the NG-RC efficiency made explicit. The feature expansion (the
 * "reservoir") is computed ONCE per sample from the sensor history. Every location
 * is a separate readout -- a weight vector mapping that one feature column to that
 * location's value. Because all readouts are contemporaneous estimates, they see
 * the SAME feature vector and the SAME prior, so their RLS covariance P is
 * IDENTICAL (measured byte-for-byte). SoftSensorBank computes that covariance once
 * PER HEAD, which is N times redundant; here it is computed ONCE and every readout
 * reuses the shared gain.
 *
 * The cost per sample is therefore O(nf^2) for the one covariance update plus
 * N * O(nf) for the N weight updates -- not N * O(nf^2). At nf ~ 100 that is the
 * difference between reconstructing a handful of points and a whole field in real
 * time: the reconstruction rides on top of the simulation rather than competing
 * with it.
 *
 * EXACTNESS: the gain g = P.x and denom = lam + x.P.x depend only on P and x, never
 * on a target, so applying one shared gain to every weight vector is IDENTICAL to
 * running N independent readouts. A regression asserts that equality.
 */
export class FieldReconstructor {
  /**
   * @param {object} cfg
   * @param {number} cfg.nSignals measured signals per sample (from the sensor)
   * @param {number} cfg.nLocations how many field points to reconstruct
   * @param {number} cfg.lag @param {number} cfg.stride @param {number} [cfg.warmup]
   * @param {boolean} [cfg.expand] universal feature map (false = lean linear)
   * @param {number} [cfg.ridge] prior variance on the linear terms
   * @param {number} [cfg.lam] RLS forgetting factor
   */
  constructor({ nSignals, nLocations, lag, stride, warmup = 200, expand = true,
    ridge = 100, lam = 1.0 }) {
    this.K = nLocations;
    this.lam = lam;
    const base = nSignals * lag;
    this._fmap = expand ? universalMap(base, 24, 24, 12345) : null;
    // A bank with a single head, used ONLY for the feature machinery it already
    // owns: the lag history, the frozen standardisation, the calibration gate.
    // Its head trains too (harmless), but the reconstruction weights below are
    // what is read out.
    const prior = this._fmap
      ? this._fmap.prior({ lin: ridge, quad: ridge / 100, rand: ridge / 100 }) : null;
    this.bank = new SoftSensorBank({ nSignals, lag, stride, warmup,
      heads: [{ name: '_feat', delay: 0 }], fmap: this._fmap, prior, initVariance: ridge });
    this.nf = this.bank.nf;
    // ONE shared covariance, N weight vectors.
    const p0 = prior != null ? prior : ridge;
    const init = rlsInit(this.nf, p0);
    this.P = init.P;
    this.theta = Array.from({ length: this.K }, () => new Block(this.nf, 1));
    // Per-location target standardisation, frozen on the same window as the inputs.
    this._tM = new Float64Array(this.K); this._tM2 = new Float64Array(this.K);
    this._tCnt = 0; this._tMean = new Float64Array(this.K);
    this._tStd = new Float64Array(this.K).fill(1); this._tFrozen = false;
    this.samples = 0;
  }

  /** Push one scan of sensor signals; returns true once a feature column exists. */
  push(signals) { this.samples++; return this.bank.push(signals); }

  /**
   * Estimate every location WITHOUT training -- the locked soft sensor, running
   * from the sensors alone.
   *
   * This is the mode that actually tests the claim. `observe()` re-fits on the
   * true field every sample, which is the commissioning position: a model that is
   * continuously handed the answer cannot demonstrate that it could work without
   * one. Here the weights are frozen and the truth, if it is read at all, is used
   * only to GRADE. Drift, a changed flow or a dead sensor now show up in the score
   * instead of being silently absorbed by the next update.
   */
  estimate() {
    const col = this.bank._column(0);
    return col ? this._estimateInto(col) : null;
  }

  /** Read every readout off one feature column, in the target's own units. */
  _estimateInto(col) {
    const x = col.m, n = this.nf;
    const out = new Array(this.K);
    for (let k = 0; k < this.K; k++) {
      const th = this.theta[k].m;
      let yh = 0;
      for (let i = 0; i < n; i++) yh += x[i] * th[i];
      out[k] = this._tMean[k] + this._tStd[k] * yh;
    }
    return out;
  }

  get calibrating() { return !this.bank.calibrated(); }

  /**
   * Estimate every location now, then train every readout toward its truth with
   * ONE shared covariance update. `truths` has one value per location.
   * @param {number[]} truths @returns {number[]|null} one estimate per location
   */
  observe(truths) {
    const col = this.bank._column(0);
    if (!col) return null;
    // Freeze per-location target statistics on the calibration window.
    if (!this._tFrozen) {
      this._tCnt++;
      for (let k = 0; k < this.K; k++) {
        const d = truths[k] - this._tM[k];
        this._tM[k] += d / this._tCnt;
        this._tM2[k] += d * (truths[k] - this._tM[k]);
      }
      if (this._tCnt >= this.bank.warmup) {
        for (let k = 0; k < this.K; k++) {
          const v = this._tM2[k] / this._tCnt;
          this._tMean[k] = this._tM[k]; this._tStd[k] = v > 1e-30 ? Math.sqrt(v) : 1;
        }
        this._tFrozen = true;
      }
      // PREDICT-ONLY UNTIL THE TARGET SCALE EXISTS. Before the freeze `_tMean` is
      // 0 and `_tStd` is 1, so the normalised target below would be the RAW
      // concentration -- and the readout would spend the whole calibration window
      // fitting a completely different scale from the one it is then asked to
      // work in. At lam = 1 there is no forgetting, so those equations are not
      // corrected later, they are carried forever.
      //
      // THIS IS THE LORENZ WASHOUT BUG, IN A SECOND PLACE. That tab's single
      // largest fix was feeding its calibration window predict-only for exactly
      // this reason: training while the normalisation statistics are still moving
      // writes the RLS equations in shifting coordinates, and at lam = 1 they stay
      // in the exact solution forever. `SoftSensorBank.push` already gates on it
      // for the INPUTS; the target side here did not.
      //
      // MEASURED on a driven dye channel against a static-map control: 0.153 with
      // the poisoned window against a do-nothing 0.028, and the damage scaled with
      // the poisoned FRACTION -- a deeper lag window delays the freeze, leaves
      // fewer clean samples, and scored worse the more memory it was given, which
      // is the opposite of what the physics says should happen.
      return this._estimateInto(col);
    }
    const x = col.m, n = this.nf, Pm = this.P.m, lam = this.lam;
    // Shared gain: g = P.x, denom = lam + x.P.x. Independent of every target.
    const g = new Float64Array(n);
    let r = 0.0;
    for (let i = 0; i < n; i++) {
      let acc = 0.0; const b = i * n;
      for (let j = 0; j < n; j++) acc += Pm[b + j] * x[j];
      g[i] = acc; r += x[i] * acc;
    }
    const denom = lam + r;
    const out = new Array(this.K);
    if (Math.abs(denom) < 1e-12) {           // no update this step; still report
      for (let k = 0; k < this.K; k++) {
        let yh = 0; const th = this.theta[k].m;
        for (let i = 0; i < n; i++) yh += x[i] * th[i];
        out[k] = this._tMean[k] + this._tStd[k] * yh;
      }
      return out;
    }
    // Each readout: predict (out-of-sample), then step its weights with shared g.
    for (let k = 0; k < this.K; k++) {
      const th = this.theta[k].m;
      let yh = 0; for (let i = 0; i < n; i++) yh += x[i] * th[i];
      out[k] = this._tMean[k] + this._tStd[k] * yh;              // reported estimate
      const yz = (truths[k] - this._tMean[k]) / this._tStd[k];   // normalised target
      const e = yz - yh;
      const s = e / denom;
      for (let i = 0; i < n; i++) th[i] += g[i] * s;
    }
    // ONE covariance update, shared by every readout.
    for (let i = 0; i < n; i++) {
      const gi = g[i], rowi = i * n;
      for (let j = i; j < n; j++) {
        const newP = (Pm[rowi + j] - gi * g[j] / denom) / lam;
        Pm[rowi + j] = newP;
        if (j > i) Pm[j * n + i] = newP;
      }
    }
    return out;
  }
}
