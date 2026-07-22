/**
 * @file Continuous — the online learning + multi-step forecasting engine.
 * JavaScript port of `Testing/ngrc_ref/continuous.py` (mirror of
 * `TC_NGRC_Continuous.st`). Per-cycle: score → build features (pre-insert) →
 * train (RLS) → push history → forecast (closed-loop roll-out).
 *
 * Opt-in features (default off ⇒ byte-identical to the base behaviour):
 * exogenous inputs (NARX), difference-target (`useDelta`), gray-box residual
 * (`baselineFn`), output guards + per-variable clamp, covariance-trace clamp,
 * online auto-normalization, adaptive OR directional forgetting, and direct
 * multi-horizon readouts. Uses a feature map object (`{base, m, expand}`) when
 * given, else polynomial-expand + bias.
 */
import {
  Block, buildLagsStride, polyExpand, addBias, predict, rlsInit, rls, rollingUpdate, calcMem,
} from './primitives.js';

const HUGE = 1.0e30;
const finite = (x) => x === x && x > -HUGE && x < HUGE;

/** Online mean/variance (Welford), frozen after calibration. */
class Welford {
  constructor() { this.n = 0; this.mean = 0.0; this.M2 = 0.0; this.frozenMu = 0.0; this.frozenSd = 1.0; this.frozen = false; }
  observe(x) {
    if (this.frozen) return;
    this.n += 1;
    const d = x - this.mean;
    this.mean += d / this.n;
    this.M2 += d * (x - this.mean);
  }
  mu() { return this.frozen ? this.frozenMu : this.mean; }
  sd() {
    if (this.frozen) return this.frozenSd;
    if (this.n < 2) return 1.0;
    const varr = this.M2 / this.n;
    return varr > 1e-12 ? Math.sqrt(varr) : 1.0;
  }
  freeze() { this.frozenMu = this.mu(); this.frozenSd = this.sd(); this.frozen = true; }
}

export class Continuous {
  /**
   * @param {number} numVariables 1..10 predicted variables
   * @param {number} lagOrder 1..10
   * @param {number} polyOrder 1..3 (ignored when a `featureMap` is given)
   * @param {boolean} useBias
   * @param {object} [opts]
   * @param {number} [opts.predictionSteps] 1..100 roll-out horizon
   * @param {number} [opts.stride] lag spacing (≥1)
   * @param {number} [opts.lam] forgetting factor (0,1]
   * @param {number|number[]} [opts.initVariance] `P0` scale or per-feature structured prior
   * @param {number} [opts.numInputs] exogenous inputs (NARX), 0..10
   * @param {boolean} [opts.useDelta] learn `Δy` and accumulate
   * @param {number} [opts.maxCovTrace] covariance-trace clamp (0 = off)
   * @param {boolean} [opts.useClamp] @param {number[]} [opts.clampMin] @param {number[]} [opts.clampMax]
   * @param {{base:number, m:number, expand:(z:number[])=>number[]}|null} [opts.featureMap]
   * @param {boolean} [opts.autoNormalize] @param {number} [opts.calibSamples]
   * @param {boolean} [opts.adaptiveForgetting] @param {number} [opts.lamMin]
   * @param {(outBases:Block[], inBases:Block[])=>number[]|null} [opts.baselineFn]
   * @param {boolean} [opts.directionalForgetting]
   * @param {number[]} [opts.directHorizons]
   */
  constructor(numVariables, lagOrder, polyOrder, useBias, opts = {}) {
    const {
      predictionSteps = 1, stride = 1, lam = 0.999, initVariance = 1000.0,
      numInputs = 0, useDelta = false, maxCovTrace = 0.0,
      useClamp = false, clampMin = null, clampMax = null,
      featureMap = null, autoNormalize = false, calibSamples = null,
      adaptiveForgetting = false, lamMin = 0.95, baselineFn = null,
      directionalForgetting = false, directHorizons = null,
    } = opts;
    if (!(numVariables >= 1 && numVariables <= 10)) throw new Error('numVariables 1..10');
    if (!(numInputs >= 0 && numInputs <= 10)) throw new Error('numInputs 0..10');
    if (!(lagOrder >= 1 && lagOrder <= 10)) throw new Error('lagOrder 1..10');
    if (!(polyOrder >= 1 && polyOrder <= 3)) throw new Error('polyOrder 1..3');
    if (!(predictionSteps >= 1 && predictionSteps <= 100)) throw new Error('predictionSteps 1..100');
    if (!(lam > 0.0 && lam <= 1.0)) throw new Error('lam in (0,1]');
    if (!(lamMin > 0.0 && lamMin <= 1.0)) throw new Error('lamMin in (0,1]');
    if (adaptiveForgetting && directionalForgetting) {
      throw new Error('enable at most one of adaptiveForgetting / directionalForgetting');
    }
    const st = stride < 1 ? 1 : stride;

    this.numVars = numVariables; this.numInputs = numInputs;
    this.lagOrder = lagOrder; this.polyOrder = polyOrder; this.useBias = !!useBias;
    this.predSteps = predictionSteps; this.stride = st; this.lam = lam;
    this.useDelta = !!useDelta; this.maxCovTrace = maxCovTrace;
    this.useClamp = !!useClamp;
    this.clampMin = clampMin || new Array(numVariables).fill(0.0);
    this.clampMax = clampMax || new Array(numVariables).fill(0.0);
    this.featureMap = featureMap; this.baselineFn = baselineFn;

    this.autoNormalize = !!autoNormalize;
    this.adaptiveForgetting = !!adaptiveForgetting;
    this.directionalForgetting = !!directionalForgetting;
    this.lamMin = lamMin;
    this._fbBeta = 0.98; this._fbK = 4.0;
    this._s2 = new Array(numVariables).fill(null);
    this._vstat = Array.from({ length: numVariables }, () => new Welford());
    this._istat = Array.from({ length: numInputs }, () => new Welford());

    const mem = calcMem(numVariables, lagOrder, polyOrder, useBias, st, numInputs);
    this.depth = mem.historyDepth;
    this.calibSamples = calibSamples != null ? calibSamples : Math.max(this.depth, 30);
    this.warmupSamples = this.autoNormalize ? Math.max(this.depth, this.calibSamples) : this.depth;
    if (featureMap != null) {
      if (featureMap.base !== (numVariables + numInputs) * lagOrder) throw new Error('featureMap base mismatch');
      this.numFeatures = featureMap.m;
    } else {
      this.numFeatures = mem.numFeatures;
    }

    this.theta = []; this.P = [];
    for (let v = 0; v < this.numVars; v++) { const { theta, P } = rlsInit(this.numFeatures, initVariance); this.theta.push(theta); this.P.push(P); }

    this.history = Array.from({ length: this.numVars }, () => new Block(this.depth, 1));
    this.scratch = Array.from({ length: this.numVars }, () => new Block(this.depth, 1));
    this.inHistory = Array.from({ length: this.numInputs }, () => new Block(this.depth, 1));

    this.lastForecast = new Array(this.numVars).fill(0.0);
    this.hasForecast = false; this.forecastWarm = false;
    this.rmseSum = new Array(this.numVars).fill(0.0);
    this.rmseCount = new Array(this.numVars).fill(0);
    this.sampleCount = 0; this.warm = false;
    this.updatesFailed = new Array(this.numVars).fill(0);
    this.residual = new Array(this.numVars).fill(0.0);
    this.confidence = new Array(this.numVars).fill(0.0);
    this.frozen = false; this.diverged = false;

    this.directHorizons = directHorizons ? [...directHorizons] : [];
    this.directTheta = []; this.directP = [];
    for (let v = 0; v < this.numVars; v++) {
      const tv = [], pv = [];
      for (let h = 0; h < this.directHorizons.length; h++) { const { theta, P } = rlsInit(this.numFeatures, initVariance); tv.push(theta); pv.push(P); }
      this.directTheta.push(tv); this.directP.push(pv);
    }
    this._dmaxh = this.directHorizons.length ? Math.max(...this.directHorizons) : 0;
    this.featRing = [];
  }

  // --- normalization helpers ---
  _vmu(v) { return this.autoNormalize ? this._vstat[v].mu() : 0.0; }
  _vsd(v) { return this.autoNormalize ? this._vstat[v].sd() : 1.0; }
  _normV(v, x) { return this.autoNormalize ? (x - this._vmu(v)) / this._vsd(v) : x; }
  _denormV(v, z) { return this.autoNormalize ? z * this._vsd(v) + this._vmu(v) : z; }
  _normClamp(v, raw) { return this.autoNormalize ? (raw - this._vmu(v)) / this._vsd(v) : raw; }

  // --- features / baseline ---
  /** @returns {Block|null} */
  _buildFeatures(outBases, inBases = null) {
    const ib = inBases == null ? this.inHistory : inBases;
    const z = buildLagsStride(outBases, this.lagOrder, this.numVars, this.stride, ib, this.numInputs);
    if (z == null) return null;
    if (this.featureMap != null) { const arr = this.featureMap.expand(z.m); return new Block(arr.length, 1, arr); }
    let feat = z;
    if (this.polyOrder > 1) { feat = polyExpand(feat, this.polyOrder); if (feat == null) return null; }
    if (this.useBias) feat = addBias(feat);
    return feat;
  }

  /** @returns {number[]} */
  _baseline(outBases, inBases = null) {
    if (this.baselineFn == null) return new Array(this.numVars).fill(0.0);
    const ib = inBases == null ? this.inHistory : inBases;
    const b = this.baselineFn(outBases, ib);
    return Array.from({ length: this.numVars }, (_, v) => b[v]);
  }

  /**
   * Non-mutating 1-step forecast for a hypothetical current sample/input — a pure
   * read of the model identified so far (touches nothing). For model-inverse
   * control, probe with `u=0` and `u=1`: `b = pred(1) - pred(0)`, then
   * `u = (ref - baseline) / b`.
   * @param {number[]} newSample @param {number[]|null} [newInput]
   * @returns {number[]|null} predicted next state per variable (engineering units)
   */
  predictCandidate(newSample, newInput = null) {
    const nv = this.numVars;
    if (this.numInputs > 0 && newInput == null) newInput = new Array(this.numInputs).fill(0.0);
    let ns, ni;
    if (this.autoNormalize) {
      ns = Array.from({ length: nv }, (_, v) => this._normV(v, newSample[v]));
      ni = Array.from({ length: this.numInputs }, (_, u) => (newInput[u] - this._istat[u].mu()) / this._istat[u].sd());
    } else { ns = newSample.slice(0, nv); ni = this.numInputs > 0 ? [...newInput] : []; }
    const th = Array.from({ length: nv }, (_, v) => this.history[v].copy());
    for (let v = 0; v < nv; v++) rollingUpdate(th[v], ns[v]);
    const ih = Array.from({ length: this.numInputs }, (_, u) => this.inHistory[u].copy());
    for (let u = 0; u < this.numInputs; u++) rollingUpdate(ih[u], ni[u]);
    const f = this._buildFeatures(th, ih);
    if (f == null || f.rows !== this.numFeatures) return null;
    const bl = this._baseline(th, ih);
    const out = [];
    for (let v = 0; v < nv; v++) {
      const d = predict(f, this.theta[v]) + bl[v];
      const cur = th[v].m[0];
      const raw = this.useDelta ? (cur + d) : d;
      out.push(this._denormV(v, raw));
    }
    return out;
  }

  /**
   * Like {@link predictCandidate} but reads the DIRECT horizon-`k` readout
   * (no roll-out compounding). Direct targets are absolute working units.
   * @param {number[]} newSample @param {number[]|null} newInput @param {number} k
   * @returns {number[]|null}
   */
  predictDirectCandidate(newSample, newInput, k) {
    const nv = this.numVars;
    if (this.numInputs > 0 && newInput == null) newInput = new Array(this.numInputs).fill(0.0);
    let ns, ni;
    if (this.autoNormalize) {
      ns = Array.from({ length: nv }, (_, v) => this._normV(v, newSample[v]));
      ni = Array.from({ length: this.numInputs }, (_, u) => (newInput[u] - this._istat[u].mu()) / this._istat[u].sd());
    } else { ns = newSample.slice(0, nv); ni = this.numInputs > 0 ? [...newInput] : []; }
    const th = Array.from({ length: nv }, (_, v) => this.history[v].copy());
    for (let v = 0; v < nv; v++) rollingUpdate(th[v], ns[v]);
    const ih = Array.from({ length: this.numInputs }, (_, u) => this.inHistory[u].copy());
    for (let u = 0; u < this.numInputs; u++) rollingUpdate(ih[u], ni[u]);
    const f = this._buildFeatures(th, ih);
    if (f == null || f.rows !== this.numFeatures) return null;
    return Array.from({ length: nv }, (_, v) => this._denormV(v, predict(f, this.directTheta[v][k])));
  }

  /** @returns {[number, boolean]} guarded value + diverged flag (working units) */
  _guard(value, fallback, v) {
    let diverged = false;
    if (!finite(value)) { value = fallback; diverged = true; }
    if (this.useClamp) {
      const lo = this._normClamp(v, this.clampMin[v]);
      const hi = this._normClamp(v, this.clampMax[v]);
      if (value < lo) value = lo; else if (value > hi) value = hi;
    }
    return [value, diverged];
  }

  _adaptiveLambda(v, residWork) {
    if (!this.adaptiveForgetting) return this.lam;
    if (!(this.hasForecast && this.forecastWarm)) return this.lam;
    const e2 = residWork * residWork;
    if (this._s2[v] == null) this._s2[v] = e2;
    const ratio = e2 / (this._s2[v] + 1e-12);
    let frac = (ratio - 1.0) / this._fbK;
    frac = frac < 0.0 ? 0.0 : (frac > 1.0 ? 1.0 : frac);
    const lamV = 1.0 - (1.0 - this.lamMin) * frac;
    this._s2[v] = this._fbBeta * this._s2[v] + (1.0 - this._fbBeta) * e2;
    return lamV;
  }

  /**
   * One cycle: score against last forecast, train, push, forecast.
   * @param {number[]} newSample measured `y(t)` per variable (engineering units)
   * @param {number[]|null} [newInput] exogenous `u(t)` when `numInputs>0`
   * @param {boolean} [predictOnly] forecast without training
   * @returns {object} prediction[var][step], rmse, overallRmse, residual, confidence,
   *   warm, diverged, sampleCount, directPrediction, directHorizons
   */
  step(newSample, newInput = null, predictOnly = false) {
    const nv = this.numVars;
    if (newSample.length < nv) throw new Error('newSample too short');
    if (this.numInputs > 0 && newInput == null) newInput = new Array(this.numInputs).fill(0.0);
    const trainingOn = (!predictOnly) && (!this.frozen);

    let ns, ni;
    if (this.autoNormalize) {
      for (let v = 0; v < nv; v++) this._vstat[v].observe(newSample[v]);
      for (let u = 0; u < this.numInputs; u++) this._istat[u].observe(newInput[u]);
      ns = Array.from({ length: nv }, (_, v) => this._normV(v, newSample[v]));
      ni = Array.from({ length: this.numInputs }, (_, u) => (newInput[u] - this._istat[u].mu()) / this._istat[u].sd());
    } else {
      ns = newSample.slice(0, nv);
      ni = this.numInputs > 0 ? [...newInput] : [];
    }

    this.residual = new Array(nv).fill(0.0);
    const residWork = new Array(nv).fill(0.0);
    if (this.hasForecast && this.forecastWarm) {
      for (let v = 0; v < nv; v++) {
        const rw = ns[v] - this.lastForecast[v];
        residWork[v] = rw;
        const ro = rw * this._vsd(v);
        this.residual[v] = ro;
        this.rmseSum[v] += ro * ro;
        this.rmseCount[v] += 1;
      }
    }

    const prev = Array.from({ length: nv }, (_, v) => this.history[v].m[0]);

    const feat = this._buildFeatures(this.history);
    if (feat == null || feat.rows !== this.numFeatures) {
      throw new Error(`feature length ${feat == null ? null : feat.rows} != numFeatures ${this.numFeatures}`);
    }
    const baseTrain = this._baseline(this.history);

    if (trainingOn) {
      for (let v = 0; v < nv; v++) {
        let tgt = this.useDelta ? (ns[v] - prev[v]) : ns[v];
        tgt -= baseTrain[v];
        const lamV = this._adaptiveLambda(v, residWork[v]);
        const { ok, innovVar } = rls(this.theta[v], this.P[v], feat, tgt, lamV, this.maxCovTrace, this.directionalForgetting);
        this.confidence[v] = innovVar;
        if (!ok) this.updatesFailed[v] += 1;
      }
    }

    for (let v = 0; v < nv; v++) rollingUpdate(this.history[v], ns[v]);
    for (let u = 0; u < this.numInputs; u++) rollingUpdate(this.inHistory[u], ni[u]);

    this.sampleCount += 1;
    if (this.autoNormalize && !this._vstat[0].frozen && this.sampleCount >= this.calibSamples) {
      for (const s of this._vstat) s.freeze();
      for (const s of this._istat) s.freeze();
    }
    if (this.sampleCount >= this.warmupSamples) this.warm = true;

    // forecast (closed-loop roll-out; inputs held frozen)
    const predWork = Array.from({ length: nv }, () => new Array(this.predSteps).fill(0.0));
    const prediction = Array.from({ length: nv }, () => new Array(this.predSteps).fill(0.0));
    let base, nForecast;
    if (this.predSteps > 1) {
      for (let v = 0; v < nv; v++) this.scratch[v] = this.history[v].copy();
      base = this.scratch; nForecast = this.predSteps;
    } else {
      base = this.history; nForecast = 1;
    }

    let divergedNow = false, breakOneStep = false, featPost = null;
    for (let stp = 0; stp < nForecast; stp++) {
      const f = this._buildFeatures(base);
      if (f == null || f.rows !== this.numFeatures) throw new Error('forecast feature length mismatch');
      if (stp === 0) featPost = f;
      const bl = this._baseline(base);
      for (let v = 0; v < nv; v++) {
        const d = predict(f, this.theta[v]) + bl[v];
        const cur = base[v].m[0];
        const raw = this.useDelta ? (cur + d) : d;
        const [val, bad] = this._guard(raw, cur, v);
        if (bad) { divergedNow = true; if (stp === 0) breakOneStep = true; }
        predWork[v][stp] = val;
        prediction[v][stp] = this._denormV(v, val);
      }
      if (base === this.scratch) for (let v = 0; v < nv; v++) rollingUpdate(this.scratch[v], predWork[v][stp]);
    }
    if (divergedNow) this.diverged = true;
    if (breakOneStep) this.frozen = true;

    // direct multi-horizon readouts
    let directPrediction = null;
    if (this.directHorizons.length) {
      if (trainingOn) {
        for (let k = 0; k < this.directHorizons.length; k++) {
          const h = this.directHorizons[k];
          if (this.featRing.length >= h) {
            const featOld = this.featRing[this.featRing.length - h];
            for (let v = 0; v < nv; v++) {
              rls(this.directTheta[v][k], this.directP[v][k], featOld, ns[v], this.lam, this.maxCovTrace, this.directionalForgetting);
            }
          }
        }
      }
      directPrediction = Array.from({ length: nv }, () => new Array(this.directHorizons.length).fill(0.0));
      for (let k = 0; k < this.directHorizons.length; k++) {
        for (let v = 0; v < nv; v++) directPrediction[v][k] = this._denormV(v, predict(featPost, this.directTheta[v][k]));
      }
      this.featRing.push(featPost);
      if (this.featRing.length > this._dmaxh) this.featRing.shift();
    }

    for (let v = 0; v < nv; v++) this.lastForecast[v] = predWork[v][0];
    this.hasForecast = true;
    this.forecastWarm = this.warm;

    const rmseOut = new Array(nv).fill(0.0);
    let acc = 0.0, cnt = 0;
    for (let v = 0; v < nv; v++) {
      if (this.rmseCount[v] > 0) { rmseOut[v] = Math.sqrt(this.rmseSum[v] / this.rmseCount[v]); acc += rmseOut[v]; cnt += 1; }
    }
    const overall = cnt > 0 ? acc / cnt : 0.0;

    return {
      prediction, rmse: rmseOut, overallRmse: overall,
      residual: [...this.residual], confidence: [...this.confidence],
      warm: this.warm, diverged: this.diverged, sampleCount: this.sampleCount,
      directPrediction, directHorizons: this.directHorizons,
    };
  }

  /** Persistence snapshot (mirrors RETAIN weights + Resume). @returns {object} */
  snapshot() {
    return {
      theta: this.theta.map((t) => t.copy()), P: this.P.map((p) => p.copy()),
      history: this.history.map((h) => h.copy()), inHistory: this.inHistory.map((h) => h.copy()),
      sampleCount: this.sampleCount, warm: this.warm,
      lastForecast: [...this.lastForecast], hasForecast: this.hasForecast, forecastWarm: this.forecastWarm,
    };
  }

  /** Resume from a snapshot without re-initialising (the Resume path). @param {object} snap */
  restore(snap) {
    this.theta = snap.theta.map((t) => t.copy()); this.P = snap.P.map((p) => p.copy());
    this.history = snap.history.map((h) => h.copy()); this.inHistory = snap.inHistory.map((h) => h.copy());
    this.sampleCount = snap.sampleCount; this.warm = snap.warm;
    this.lastForecast = [...snap.lastForecast]; this.hasForecast = snap.hasForecast; this.forecastWarm = snap.forecastWarm;
    this.frozen = false; this.diverged = false;
  }
}
