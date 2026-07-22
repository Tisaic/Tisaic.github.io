/**
 * @file SoftSensor commissioning — JavaScript port of `commission_softsensor`
 * and its helpers in `Testing/experiments/softsensor.py`. Offline, PC-side model
 * search that self-deploys a {@link SoftSensor} from a commissioning log.
 *
 * For each `(lag, stride)`: standardize the shared features, then
 *   1) LINEAR-first — fit a plain linear readout per target; deploy linear if its
 *      held-out nRMSE is good (auto-collapse to ARX);
 *   2) else fit the FULL universal map, rank features by contribution
 *      `max_j(|theta_j[i]|)·rms[i]`, and keep the SMALLEST subset within `margin`
 *      of the full held-out error → a pruned map computing only the kept indices.
 * The leanest config that clears `gate` is deployed (refit on all data), each
 * target gets an output clamp. Gating is PER TARGET so an easy signal can't mask
 * a hard one. Returns `{sensor, info}`; `sensor` is `null` on FAULT.
 */
import { predict } from './primitives.js';
import { SoftSensor } from './softsensor.js';
import { universalMap, prunedMap } from './feature_map.js';

/** @returns {SoftSensor} */
function makeSensor(sig, tgt, lag, stride, warmup, fmap, prior, initVariance) {
  return new SoftSensor(sig.length, tgt.length, lag, stride, warmup, { fmap, prior, initVariance });
}

/**
 * Warm-up-normalize then online-RLS train every target over `sig`/`tgt[:end]`.
 * @returns {number[]} per-feature RMS over the trained span (for importance ranking)
 */
function runTrain(s, sig, tgt, end) {
  const nt = tgt.length;
  const rms = new Array(s.nf).fill(0.0);
  let crms = 0;
  for (let t = 0; t < end; t++) {
    const scan = []; for (let k = 0; k < s.ns; k++) scan.push(sig[k][t]);
    s.push(scan);
    const raw = s._raw();
    if (!s.frozen) { s.warmupStep(raw); continue; }
    const f = s._features(raw);
    for (let i = 0; i < s.nf; i++) rms[i] += f.m[i] ** 2;
    crms++;
    const targets = []; for (let j = 0; j < nt; j++) targets.push(tgt[j][t]);
    s.adapt(targets);
  }
  return rms.map((r) => Math.sqrt(r / Math.max(crms, 1)));
}

/**
 * Held-out one-step nRMSE per target on `[nTrain, n)`, each in its own std.
 * @returns {number[]} length `nt`
 */
function heldout(s, sig, tgt, nTrain, n) {
  const nt = tgt.length;
  const tmean = [], tstd = [];
  for (let j = 0; j < nt; j++) {
    let m = 0.0; for (let t = 0; t < nTrain; t++) m += tgt[j][t]; m /= nTrain;
    tmean.push(m);
    let v = 0.0; for (let t = 0; t < nTrain; t++) v += (tgt[j][t] - m) ** 2; v /= nTrain;
    tstd.push(v > 1e-12 ? Math.sqrt(v) : 1.0);
  }
  const sq = new Array(nt).fill(0.0);
  let c = 0;
  for (let t = nTrain; t < n; t++) {
    const scan = []; for (let k = 0; k < s.ns; k++) scan.push(sig[k][t]);
    s.push(scan);
    const f = s._features(s._raw());
    for (let j = 0; j < nt; j++) sq[j] += ((predict(f, s.theta[j]) - tgt[j][t]) / tstd[j]) ** 2;
    c++;
  }
  return sq.map((v) => (c ? Math.sqrt(v / c) : Infinity));
}

/**
 * @param {number[][]} sig measured signals `[ns][N]`
 * @param {number[][]} tgt target signals `[nt][N]`
 * @param {object} [opts] see defaults below (mirrors the Python keyword args)
 * @returns {{sensor: SoftSensor|null, info: object}}
 */
export function commissionSoftSensor(sig, tgt, opts = {}) {
  const {
    lags = [6], strides = [5, 10], nHinge = 16, nFourier = 16, seed = 7,
    nRecip = 0, recipEps = 0.25, priorRecip = 1.0,
    margin = 1.20, absGood = 0.02, gate = 0.05, valFrac = 0.35, warmupFrac = 0.15,
    scoreCap = 6000, clampMargin = 0.5, initVariance = 10.0,
    priorLin = 100.0, priorQuad = 1.0, priorRand = 0.001,
    keepSizes = [4, 8, 16, 32, 48, 64, 96],
  } = opts;

  const n = tgt[0].length;
  const cap = Math.min(n, scoreCap);
  const nTrain = Math.floor(cap * (1.0 - valFrac));
  const cappedSig = sig.map((s) => s.slice(0, cap));
  const cappedTgt = tgt.map((yy) => yy.slice(0, cap));
  const report = [];
  const cands = [];
  const pk = { lin: priorLin, quad: priorQuad, rand: priorRand, recip: priorRecip };

  for (const lag of lags) {
    for (const stride of strides) {
      const base = sig.length * lag;
      const warm = Math.max((lag - 1) * stride + 1, Math.floor(cap * warmupFrac));
      const uni = universalMap(base, nHinge, nFourier, seed, { nRecip, recipEps });

      // full universal reference (held-out + per-feature importance)
      const sf = makeSensor(cappedSig, cappedTgt, lag, stride, warm, uni, uni.prior(pk), initVariance);
      const rms = runTrain(sf, cappedSig, cappedTgt, nTrain);
      const imp = new Array(uni.m);
      for (let i = 0; i < uni.m; i++) {
        let mx = 0.0;
        for (let j = 0; j < tgt.length; j++) { const a = Math.abs(sf.theta[j].m[i]); if (a > mx) mx = a; }
        imp[i] = mx * rms[i];
      }
      const order = Array.from({ length: uni.m }, (_, i) => i).sort((a, b) => imp[b] - imp[a]);
      const valFull = heldout(sf, cappedSig, cappedTgt, nTrain, cap);
      const ok = (err) => err.every((e, idx) => e <= absGood || e <= margin * valFull[idx]);

      // 1) linear-first
      const sl = makeSensor(cappedSig, cappedTgt, lag, stride, warm, null, null, initVariance);
      runTrain(sl, cappedSig, cappedTgt, nTrain);
      const valLin = heldout(sl, cappedSig, cappedTgt, nTrain, cap);
      report.push(['linear', lag, stride, sl.nf, valLin]);
      if (ok(valLin)) {
        cands.push([sl.nf, Math.max(...valLin), 'linear', lag, stride, null]);
        continue;
      }

      // 2) prune the universal to the smallest kept subset within margin for every target
      const valKeep = (keep) => {
        const pm = prunedMap(uni, keep);
        const ss = makeSensor(cappedSig, cappedTgt, lag, stride, warm, pm, pm.prior(pk), initVariance);
        runTrain(ss, cappedSig, cappedTgt, nTrain);
        return [heldout(ss, cappedSig, cappedTgt, nTrain, cap), ss.nf];
      };
      let chosenKeep = [...order].sort((a, b) => a - b);
      let cval = valFull, cnf = uni.m;
      for (const k of keepSizes) {
        if (k >= uni.m) break;
        const [e, nf] = valKeep(order.slice(0, k));
        if (ok(e)) { chosenKeep = order.slice(0, k).sort((a, b) => a - b); cval = e; cnf = nf; break; }
      }
      report.push(['pruned-universal', lag, stride, cnf, cval]);
      cands.push([cnf, Math.max(...cval), 'pruned-universal', lag, stride, chosenKeep]);
    }
  }

  if (cands.length === 0) return { sensor: null, info: { deployed: false, reason: 'no candidate', report } };

  const eligible = cands.filter((c) => c[1] <= gate).sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  if (eligible.length === 0) {
    const best = cands.reduce((m, c) => (c[1] < m[1] ? c : m));
    return { sensor: null, info: { deployed: false, reason: 'gate not cleared', nrmse: best[1], gate, report } };
  }
  const [, val, kind, lag, stride, keep] = eligible[0];

  // refit the chosen config on ALL data
  const base = sig.length * lag;
  const warm = Math.max((lag - 1) * stride + 1, Math.floor(n * warmupFrac));
  let fmap = null, prior = null;
  if (kind !== 'linear') {
    const uni = universalMap(base, nHinge, nFourier, seed, { nRecip, recipEps });
    const pm = prunedMap(uni, keep);
    fmap = pm; prior = pm.prior(pk);
  }
  const s = makeSensor(sig, tgt, lag, stride, warm, fmap, prior, initVariance);
  runTrain(s, sig, tgt, n);
  for (let j = 0; j < tgt.length; j++) {
    const lo = Math.min(...tgt[j]), hi = Math.max(...tgt[j]);
    const rng = (hi - lo) || 1.0;
    s.clampLo[j] = lo - clampMargin * rng;
    s.clampHi[j] = hi + clampMargin * rng;
  }
  const nFull = kind === 'linear'
    ? (s.base + 1)
    : universalMap(base, nHinge, nFourier, seed, { nRecip, recipEps }).m;
  const info = {
    deployed: true, config: kind, lag, stride, nFull, nDeployed: s.nf,
    nrmse: val, kept: keep, report,
  };
  return { sensor: s, info };
}
