/**
 * @file autotune — offline commissioning auto-tuner for the {@link Continuous}
 * engine. JavaScript port of `Testing/ngrc_ref/autotune.py`. Use-case-agnostic;
 * run once on a batch of logged data (not in the scan loop).
 *
 * Fits the LINEAR (ARX) model first and only steps up to a richer feature map if
 * it beats the simpler one on held-out data by `upgradeMargin`; sweeps the ridge
 * knob (`initVariance`), rejects configs whose free-run roll-out is unbounded,
 * and derives the safety guards (per-channel clamps, covariance windup bound)
 * from the data. Returns a plain config object; {@link makeModel} instantiates it.
 */
import { predict, rollingUpdate } from './primitives.js';
import { Continuous } from './continuous.js';

/**
 * One pass: train on the first `nTrain`, predict-only after. Free-run roll-out
 * stability check. @returns {[number, boolean]} `[oneStepNrmse, bounded]`
 */
function score(model, data, inputs, nTrain, horizon, launchStride = 10, cap = 10.0) {
  const nv = model.numVars, N = data.length;
  const sq = new Array(nv).fill(0.0), cnt = new Array(nv).fill(0);
  let bounded = true;
  for (let i = 0; i < N; i++) {
    const ui = inputs ? inputs[i] : null;
    const res = model.step(data[i], ui, i >= nTrain);
    if (i >= nTrain && res.warm && i + 1 < N) {
      for (let v = 0; v < nv; v++) { const e = (res.prediction[v][0] - data[i + 1][v]) / model._vsd(v); sq[v] += e * e; cnt[v] += 1; }
      if (i % launchStride === 0 && i + horizon < N) {
        const outS = model.history.map((h) => h.copy());
        const inS = model.inHistory.map((h) => h.copy());
        for (let h = 0; h < horizon; h++) {
          let pw;
          try {
            const feat = model._buildFeatures(outS, inS);
            const bl = model._baseline(outS, inS);
            pw = [];
            for (let v = 0; v < nv; v++) { const d = predict(feat, model.theta[v]) + bl[v]; const cur = outS[v].m[0]; pw.push(model.useDelta ? (cur + d) : d); }
          } catch (e) { bounded = false; break; }
          for (let v = 0; v < nv; v++) { if (!(pw[v] === pw[v] && Math.abs(pw[v]) < cap)) bounded = false; rollingUpdate(outS[v], pw[v]); }
          if (inputs) for (let u = 0; u < model.numInputs; u++) rollingUpdate(inS[u], inputs[i + 1 + h][u]);
          if (!bounded) break;
        }
      }
    }
  }
  let nrmse = 0.0;
  for (let v = 0; v < nv; v++) nrmse += cnt[v] ? Math.sqrt(sq[v] / cnt[v]) : Infinity;
  return [nrmse / nv, bounded];
}

/**
 * Search lag × feature-map × initVariance; pick the SIMPLEST config whose
 * held-out one-step nRMSE is within `upgradeMargin` of the best and whose
 * free-run stays bounded.
 * @param {number[][]} data samples `[N][nv]`
 * @param {object} [opts]
 * @returns {object} the chosen config (+ `report`)
 */
export function autotune(data, opts = {}) {
  const {
    inputs = null, numVars = null, numInputs = 0,
    lagOrders = [2, 4, 6], initVariances = [0.3, 1.0, 3.0, 10.0],
    extraCandidates = [], valFrac = 0.35, horizon = 20,
    upgradeMargin = 0.1, clampMargin = 0.5, traceMult = 5.0,
  } = opts;
  const nv = numVars != null ? numVars : data[0].length;
  const n = data.length;
  const nTrain = Math.floor(n * (1.0 - valFrac));

  const report = [];
  const results = [];
  for (const lag of lagOrders) {
    const baseDim = (nv + numInputs) * lag;
    for (const [name, poly] of [['linear', 1], ['poly2', 2]]) {
      for (const iv of initVariances) {
        const cfg = { name, lagOrder: lag, polyOrder: poly, featureMap: null, initVariance: iv, numFeatures: null };
        const m = makeModel(cfg, { numVars: nv, numInputs, autoNormalize: true });
        cfg.numFeatures = m.numFeatures;
        const [nrmse, bnd] = score(m, data, inputs, nTrain, horizon);
        report.push([name, lag, iv, m.numFeatures, nrmse, bnd]);
        if (bnd && Number.isFinite(nrmse)) results.push([nrmse, m.numFeatures, cfg]);
      }
    }
    for (const cand of extraCandidates) {
      const fm = cand.featureMap(baseDim);
      let iv = cand.initVariance;
      iv = (typeof iv === 'function') ? iv(fm) : iv;
      const cfg = { name: cand.name, lagOrder: lag, polyOrder: 1, featureMap: cand.featureMap, initVariance: iv, numFeatures: fm.m };
      const m = makeModel(cfg, { numVars: nv, numInputs, autoNormalize: true });
      const [nrmse, bnd] = score(m, data, inputs, nTrain, horizon);
      report.push([cand.name, lag, 'prior', fm.m, nrmse, bnd]);
      if (bnd && Number.isFinite(nrmse)) results.push([nrmse, fm.m, cfg]);
    }
  }

  if (!results.length) throw new Error('autotune: no bounded candidate found');
  const bestNrmse = Math.min(...results.map((r) => r[0]));
  const thresh = bestNrmse * (1.0 + upgradeMargin);
  const eligible = results.filter((r) => r[0] <= thresh).sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  const chosen = eligible[0][2];
  const chosenNrmse = eligible[0][0];

  const clampMin = [], clampMax = [];
  for (let v = 0; v < nv; v++) {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < nTrain; t++) { const x = data[t][v]; if (x < lo) lo = x; if (x > hi) hi = x; }
    const rng = (hi - lo) || 1.0;
    clampMin.push(lo - clampMargin * rng); clampMax.push(hi + clampMargin * rng);
  }
  const probe = makeModel(chosen, { numVars: nv, numInputs, autoNormalize: true });
  let trace0 = 0.0;
  for (let i = 0; i < probe.numFeatures; i++) trace0 += probe.P[0].get(i, i);
  const maxCovTrace = traceMult * trace0;

  Object.assign(chosen, {
    numVars: nv, numInputs, useClamp: true, clampMin, clampMax,
    maxCovTrace, autoNormalize: true, lam: 1.0, valNrmse: chosenNrmse, report,
  });
  return chosen;
}

/**
 * Instantiate a {@link Continuous} from an autotune config (or a partial one).
 * @param {object} cfg @param {object} [opts] `{numVars, numInputs, autoNormalize, over}`
 * @returns {Continuous}
 */
export function makeModel(cfg, opts = {}) {
  const nv = opts.numVars != null ? opts.numVars : cfg.numVars;
  const ni = opts.numInputs != null ? opts.numInputs : (cfg.numInputs != null ? cfg.numInputs : 0);
  const an = opts.autoNormalize != null ? opts.autoNormalize : (cfg.autoNormalize != null ? cfg.autoNormalize : false);
  let fm = cfg.featureMap;
  if (fm != null && typeof fm === 'function') { const baseDim = (nv + ni) * cfg.lagOrder; fm = fm(baseDim); }
  return new Continuous(nv, cfg.lagOrder, cfg.polyOrder != null ? cfg.polyOrder : 1, true, {
    numInputs: ni, lam: cfg.lam != null ? cfg.lam : 1.0, initVariance: cfg.initVariance,
    featureMap: fm, autoNormalize: an, maxCovTrace: cfg.maxCovTrace != null ? cfg.maxCovTrace : 0.0,
    useClamp: cfg.useClamp != null ? cfg.useClamp : false, clampMin: cfg.clampMin, clampMax: cfg.clampMax,
    ...(opts.over || {}),
  });
}
