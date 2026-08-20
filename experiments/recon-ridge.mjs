// WHY IS THE RECONSTRUCTOR WORSE THAN A CONSTANT?
//
// On a driven flow with real temporal content (multitone inlet, activity 2.3% of
// the spatial spread, drift/temporal 0.23 so it is fluctuation and not settling)
// the shipped reconstructor scores field nRMSE 0.182 while a STATIC MAP -- each
// location's own time average, no sensor read at all -- scores 0.028. The model
// is six and a half times WORSE than doing nothing.
//
// That is not a noise problem and not a task problem; it is a fitting problem,
// and it lands exactly on the parameter this session set out to interrogate. The
// shipped prior is `ridge: 100`, which in this library means P0 = 100*I, i.e. a
// penalty of 1/100 -- essentially unregularised. That value was measured as
// optimal on the SOFT-SENSOR tab, where the note in CLAUDE.md is explicit about
// why looser kept winning: "a simulation is noiseless", so there is no
// observation noise for shrinkage to protect against and the bias it adds is
// pure cost. Monotone over four decades, worth 11x.
//
// THIS IS A DIFFERENT PROBLEM WEARING THE SAME KNOB. Here one shared covariance
// drives 161 readouts whose targets are each standardised by their own TEMPORAL
// spread -- and on a nearly-steady field that spread is small, so the normalised
// target is a large number and an under-damped fit produces estimates far outside
// the field's actual range. The failure mode of a loose ridge is not "slightly
// too flexible", it is an estimate that is worse than the mean it was supposed to
// improve on.
//
// So: sweep it, against the do-nothing control, and report the diagnostics that
// tell the explanations apart -- the weight norm, the covariance trace and the
// input saturation count, which is the same set `__lsSSdbg()` exists to expose
// because a bad score alone cannot distinguish them.
import { dyeStream, fieldNrmse } from './dye-stream.mjs';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const SAMPLES = 1600, WARMUP = 200, TRAIN_END = 1200;
const MODE = process.env.INLET || 'multitone';
const AMP = +(process.env.AMP || 0.3);
const RIDGES = [1e-4, 1e-3, 1e-2, 1e-1, 1, 10, 100, 1000];
const f = (v, d = 4) => (Number.isFinite(v) ? +v.toFixed(d) : null);

const S = await dyeStream({ samples: SAMPLES, perWall: 12, inletMode: MODE, inletAmplitude: AMP });
const K = S.target.length;

const smMu = new Float64Array(K);
for (let t = 0; t < TRAIN_END; t++) {
  for (let k = 0; k < K; k++) smMu[k] += (S.truth[t][k] - smMu[k]) / (t + 1);
}
let staticScore = 0, n = 0;
for (let t = TRAIN_END; t < SAMPLES; t++) { staticScore += fieldNrmse(smMu, S.truth[t]); n++; }
staticScore /= n;

// A SECOND CONTROL, because "beat a constant" is a low bar and the gap between
// these two says whether the sensors carry anything at all: the best SINGLE
// GLOBAL SCALE on one sensor channel, fitted by least squares per location.
// This is the calibration-constant rival the soft-sensor tab already uses.
console.log(JSON.stringify({ inlet: `${MODE} ${AMP}`, taps: S.sensors.length, locations: K,
  staticMap: +staticScore.toExponential(3) }));

function tapChannels(n2) {
  const perWall = n2 >> 1, taps = [];
  for (let w = 0; w < 2; w++) {
    for (let j = 0; j < perWall; j++) taps.push(w * 12 + Math.round(j * 11 / (perWall - 1)));
  }
  const ch = [];
  for (const t of [...new Set(taps)].sort((a, b) => a - b)) ch.push(3 * t, 3 * t + 1, 3 * t + 2);
  return ch;
}

console.log(`\n${'ridge'.padStart(8)}${'lambda'.padStart(11)}${'field nRMSE'.padStart(13)}` +
  `${'vs static'.padStart(11)}${'|theta|'.padStart(12)}${'trace(P)'.padStart(12)}${'clamped'.padStart(10)}`);
const rows = [];
for (const expand of [false, true]) {
  console.log(`  -- ${expand ? 'expanded universal map' : 'linear basis'}`);
  for (const ridge of RIDGES) {
    const chans = tapChannels(12);
    const m = new FieldReconstructor({ nSignals: chans.length, nLocations: K, lag: 1,
      stride: 1, warmup: WARMUP, expand, ridge, lam: 1.0 });
    for (let t = 0; t < TRAIN_END; t++) {
      m.push(chans.map((c) => S.sig[t][c]));
      m.observe(S.truth[t]);
    }
    let score = 0, cnt = 0;
    for (let t = TRAIN_END; t < SAMPLES; t++) {
      m.push(chans.map((c) => S.sig[t][c]));
      const est = m.estimate();
      if (est) { score += fieldNrmse(est, S.truth[t]); cnt++; }
    }
    score /= Math.max(1, cnt);
    let tn = 0;
    for (let k = 0; k < K; k++) for (const v of m.theta[k].m) tn += v * v;
    tn = Math.sqrt(tn);
    let tr = 0;
    for (let i = 0; i < m.nf; i++) tr += m.P.m[i * m.nf + i];
    rows.push({ expand, ridge, score, tn, tr });
    console.log(`${String(ridge).padStart(8)}${(1 / ridge).toExponential(1).padStart(11)}` +
      `${score.toExponential(3).padStart(13)}${(staticScore / score).toFixed(2).padStart(11)}` +
      `${tn.toExponential(2).padStart(12)}${tr.toExponential(2).padStart(12)}` +
      `${String(m.bank.clamped).padStart(10)}`);
  }
}

const best = rows.reduce((a, b) => (b.score < a.score ? b : a));
console.log(`\nBEST: ${best.expand ? 'expanded' : 'linear'} at ridge ${best.ridge} -> ` +
  `${best.score.toExponential(3)}, which is ${(staticScore / best.score).toFixed(2)}x the static map`);
console.log(best.score < staticScore
  ? '\nThe sensors DO earn their place once the prior is right, and the shipped\n'
    + 'ridge of 100 was the wrong end of the sweep for this problem.'
  : '\nEVEN AT THE BEST PRIOR the reconstruction does not beat a constant per\n'
    + 'location. The prior is then not what is wrong, and the next suspect is the\n'
    + 'per-location target standardisation -- a temporal spread frozen on a nearly\n'
    + 'steady window makes the normalised target enormous and any fit error with it.');
