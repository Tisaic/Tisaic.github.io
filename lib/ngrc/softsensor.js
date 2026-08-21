/**
 * @file SoftSensor — a commissioned, deployable bank of virtual sensors.
 * JavaScript port of the `SoftSensor` class in `Testing/experiments/softsensor.py`
 * (the PC reference for the ST `TC_NGRC_SoftSensor` function block).
 *
 * Estimate one or more UNMEASURED target signals from the recent history of the
 * MEASURED signals alone:
 *
 *   `targetHat[j] = theta_j · phi( lags of the measured signals )`
 *
 * The target — true or estimated — is NEVER fed into the feature vector, so each
 * readout is a direct sensorless map with no autoregressive drift. All targets
 * share ONE feature vector (built once per scan) with its own online-RLS readout.
 *
 * Built on the ported primitives (`Block`, `buildLagsStride`, `rlsInit`, `rls`,
 * `predict`, `addBias`, `rollingUpdate`) + the universal/pruned feature maps.
 */
import { Block, rlsInit, rls, predict, addBias, buildLagsStride, rollingUpdate } from './primitives.js';

export class SoftSensor {
  /**
   * @param {number} numSignals number of measured input signals
   * @param {number} numTargets number of unmeasured targets to estimate
   * @param {number} lag lag order of the embedding
   * @param {number} stride lag spacing
   * @param {number} warmup samples used to freeze the per-feature mean/std
   * @param {object} [opts]
   * @param {import('./feature_map.js').FeatureMap|null} [opts.fmap] feature map; `null` = lean linear (bias + standardized lags)
   * @param {number[]|null} [opts.prior] per-feature prior variances (structured prior); overrides `initVariance`
   * @param {number} [opts.initVariance] scalar `P0 = initVariance·I` when no `prior`
   * @param {number} [opts.lam] RLS forgetting factor
   * @param {number} [opts.maxCovTrace] covariance-trace clamp (0 = off)
   * @param {boolean} [opts.directional] directional forgetting: forget only along
   *   the EXCITED direction, so a poorly exciting stream cannot wind the
   *   covariance up. The `rls` primitive has always supported it; this port
   *   simply never passed it through. Opt-in and default FALSE, so every golden
   *   vector is byte-identical -- the flag changes nothing unless it is set.
   * @param {number} [opts.outlierK] robust gate: skip updates whose innovation exceeds `outlierK·yScale` (0 = off)
   * @param {number[]} [opts.leads] per-target FORECAST LEAD in samples. Target `j`
   *   is trained by pairing the feature vector from `leads[j]` samples ago with the
   *   truth that has just arrived, so at inference the same readout predicts
   *   `leads[j]` samples AHEAD. This is `Continuous`'s `directHorizons` mechanism
   *   -- a ring of past feature vectors -- which `SoftSensor` had no equivalent of,
   *   so every caller wanting a forecast had to keep the ring itself (FlowSim's
   *   page does exactly that, and says so). THE EXPANSION IS COMPUTED ONCE and
   *   shared across every target, which is the whole reason a forecast belongs here
   *   as a second target rather than as a second model: a 373-feature universal map
   *   evaluated twice per sample is the expensive half.
   *   Default all zeros -- contemporaneous, i.e. exactly the previous behaviour, so
   *   every golden vector is byte-identical.
   */
  constructor(numSignals, numTargets, lag, stride, warmup, opts = {}) {
    const { fmap = null, prior = null, initVariance = 10.0, lam = 1.0, maxCovTrace = 0.0,
      outlierK = 0.0, directional = false, leads = null } = opts;
    this.ns = numSignals; this.nt = numTargets;
    this.lag = lag; this.stride = stride; this.warmup = warmup;
    this.base = numSignals * lag;
    this.fmap = fmap;
    this.nf = fmap != null ? fmap.m : this.base + 1;
    this.lam = lam; this.maxCovTrace = maxCovTrace; this.outlierK = outlierK;
    this.directional = directional;
    const depth = (lag - 1) * stride + 1;
    this.hist = Array.from({ length: numSignals }, () => new Block(depth, 1));
    this.nPushed = 0;
    const p0 = prior != null ? prior : initVariance;
    this.theta = []; this.P = [];
    for (let j = 0; j < numTargets; j++) {
      const { theta, P } = rlsInit(this.nf, p0);
      this.theta.push(theta); this.P.push(P);
    }
    this.yScale = new Array(numTargets).fill(0.0);
    this.last = new Array(numTargets).fill(0.0);
    this.clampLo = new Array(numTargets).fill(-1e30);
    this.clampHi = new Array(numTargets).fill(1e30);
    this._sum = new Array(this.base).fill(0.0);
    this._sq = new Array(this.base).fill(0.0);
    this._cnt = 0;
    this.fmean = new Array(this.base).fill(0.0);
    this.fstd = new Array(this.base).fill(1.0);
    this.frozen = false;
    this._innovSeen = 0;
    this.leads = leads != null ? [...leads] : new Array(numTargets).fill(0);
    this._maxLead = Math.max(0, ...this.leads);
    this._featRing = [];
  }

  /** Push one scan of measured signals into the rolling history. @param {number[]} signals */
  push(signals) {
    for (let i = 0; i < this.ns; i++) rollingUpdate(this.hist[i], signals[i]);
    this.nPushed++;
  }

  /** @returns {boolean} history buffers are full */
  ready() { return this.nPushed >= (this.lag - 1) * this.stride + 1; }

  /** @returns {Block} raw lag embedding of the measured signals */
  _raw() { return buildLagsStride(this.hist, this.lag, this.ns, this.stride); }

  /** @param {Block} raw @returns {Block} standardized lag column */
  _z(raw) {
    const z = new Array(this.base);
    for (let i = 0; i < this.base; i++) z[i] = (raw.m[i] - this.fmean[i]) / this.fstd[i];
    return new Block(this.base, 1, z);
  }

  /** @param {Block} raw @returns {Block} the shared feature column */
  _features(raw) {
    const z = this._z(raw);
    if (this.fmap != null) {
      const arr = this.fmap.expand(z.m);
      return new Block(arr.length, 1, arr);
    }
    return addBias(z);
  }

  /**
   * Accumulate one warm-up sample; freeze the per-feature mean/std at `warmup`.
   * @param {Block} raw
   */
  warmupStep(raw) {
    for (let i = 0; i < this.base; i++) { this._sum[i] += raw.m[i]; this._sq[i] += raw.m[i] * raw.m[i]; }
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
  }

  /**
   * One online-RLS training step of every target toward known truth.
   * @param {number[]} targets one value per target
   */
  adapt(targets) {
    const f = this._features(this._raw());
    // THE RING HOLDS THE EXPANSION, NOT THE RAW SIGNALS, so a lead costs one Block
    // per sample of lead and NO extra feature evaluation. Pushed before the loop so
    // index 0 is "now" and a lead of L reads index L.
    if (this._maxLead > 0) {
      this._featRing.unshift(f);
      if (this._featRing.length > this._maxLead + 1) this._featRing.pop();
    }
    for (let j = 0; j < this.nt; j++) {
      const L = this.leads[j];
      // A LEAD THAT HAS NOT FILLED YET IS SKIPPED, NOT APPROXIMATED. Pairing the
      // present features with the present truth "until the ring fills" would train
      // the forecast readout on the wrong question and then leave those equations
      // in it forever at lam = 1.
      if (L > 0 && this._featRing.length <= L) continue;
      const fj = L > 0 ? this._featRing[L] : f;
      const innov = targets[j] - predict(fj, this.theta[j]);
      const gate = (this.outlierK > 0.0 && this._innovSeen > 300 &&
        Math.abs(innov) > this.outlierK * (this.yScale[j] + 1e-9));
      if (!gate) {
        this.yScale[j] += 0.01 * (Math.abs(targets[j]) - this.yScale[j]);
        rls(this.theta[j], this.P[j], fj, targets[j], this.lam, this.maxCovTrace, this.directional);
      }
    }
    this._innovSeen++;
  }

  /** Pure sensorless inference. @returns {number[]} one estimate per target */
  estimate() {
    const f = this._features(this._raw());
    const out = new Array(this.nt);
    for (let j = 0; j < this.nt; j++) {
      let y = predict(f, this.theta[j]);
      if (!(y === y)) y = 0.5 * (this.clampLo[j] + this.clampHi[j]);
      y = Math.min(this.clampHi[j], Math.max(this.clampLo[j], y));
      this.last[j] = y; out[j] = y;
    }
    return out;
  }
}
