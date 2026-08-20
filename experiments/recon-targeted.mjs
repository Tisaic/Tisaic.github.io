// PLACE THE LAGS WHERE THE PHYSICS PUTS THE INFORMATION.
//
// `wall-information.mjs` settled the argument model-free: the best correlation
// between a wall channel and an interior location has median 0.974, 93% of
// locations exceed 0.8, and the peak sits at a median lag of 300 SAMPLES against
// a transit time of 400. The information is not merely present, it is nearly
// perfect, and it is delayed by the convection time -- which is the one thing a
// memoryless readout structurally cannot use.
//
// That explains every failure so far. `lag: 1` reads the wall NOW and asks about
// a plume that left the needle three hundred samples ago. Sweeping the prior
// could only shrink such a readout toward the static map, which is exactly what
// the ridge sweep measured. And the earlier lag ladder DID span the delay in its
// deeper rows -- and lost anyway, because a dense window from 0 to 300 costs 289
// features and eats 575 samples of the record to fill, leaving a 2:1 fit.
//
// The fix is not more memory, it is BETTER PLACED memory: a few taps at the delay
// the physics specifies, rather than a dense comb from zero to it. Same span, a
// third of the features, and most of the record still available to fit with.
//
// Swept against the prior, because the two interact: the ridge sweep's "tighter
// is always better" was measured on a configuration where the best available
// answer WAS the static map, so shrinking to zero was genuinely optimal. With
// real signal reachable that should reverse, and if it does not, the prior was
// never the issue.
import { dyeStream, fieldNrmse } from './dye-stream.mjs';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const SAMPLES = 1600, WARMUP = 200, TRAIN_END = 1200;
const MODE = process.env.INLET || 'multitone';
const AMP = +(process.env.AMP || 0.3);
const RIDGES = [0.01, 0.1, 1, 10, 100];

const S = await dyeStream({ samples: SAMPLES, perWall: 12, inletMode: MODE, inletAmplitude: AMP });
const K = S.target.length;
const transitSamples = Math.round(S.transit / 2);

const smMu = new Float64Array(K);
for (let t = 0; t < TRAIN_END; t++) {
  for (let k = 0; k < K; k++) smMu[k] += (S.truth[t][k] - smMu[k]) / (t + 1);
}
let staticScore = 0, n = 0;
for (let t = TRAIN_END; t < SAMPLES; t++) { staticScore += fieldNrmse(smMu, S.truth[t]); n++; }
staticScore /= n;
console.log(JSON.stringify({ inlet: `${MODE} ${AMP}`, locations: K,
  transitSamples, measuredPeakLag: 300, staticMap: +staticScore.toExponential(3) }));

function tapChannels(n2) {
  const perWall = n2 >> 1, taps = [];
  for (let w = 0; w < 2; w++) {
    for (let j = 0; j < perWall; j++) taps.push(w * 12 + Math.round(j * 11 / (perWall - 1)));
  }
  const ch = [];
  for (const t of [...new Set(taps)].sort((a, b) => a - b)) ch.push(3 * t, 3 * t + 1, 3 * t + 2);
  return ch;
}

// Every case spans ~300 samples -- the measured peak lag -- and they differ in
// how many features they spend getting there.
const CASES = [
  { taps: 12, lag: 1, stride: 1, note: 'shipped, memoryless' },
  { taps: 12, lag: 4, stride: 100, note: 'sparse comb to the delay' },
  { taps: 6, lag: 4, stride: 100, note: 'half the taps' },
  { taps: 6, lag: 6, stride: 60, note: 'finer comb' },
  { taps: 4, lag: 4, stride: 100, note: 'four taps' },
  { taps: 4, lag: 8, stride: 43, note: 'four taps, finer' },
];

console.log(`\n${'taps'.padStart(5)}${'lag'.padStart(5)}${'strd'.padStart(6)}${'span'.padStart(6)}` +
  `${'nf'.padStart(5)}${'trainN'.padStart(8)}   ` +
  RIDGES.map((r) => `ridge ${r}`.padStart(12)).join(''));
let best = null;
for (const c of CASES) {
  const chans = tapChannels(c.taps);
  const depth = (c.lag - 1) * c.stride + 1;
  const cells = [];
  let nf = 0, trained = 0;
  for (const ridge of RIDGES) {
    const m = new FieldReconstructor({ nSignals: chans.length, nLocations: K,
      lag: c.lag, stride: c.stride, warmup: WARMUP, expand: false, ridge, lam: 1.0 });
    trained = 0;
    for (let t = 0; t < TRAIN_END; t++) {
      m.push(chans.map((ch) => S.sig[t][ch]));
      if (m.observe(S.truth[t])) trained++;
    }
    nf = m.nf;
    let score = 0, cnt = 0;
    for (let t = TRAIN_END; t < SAMPLES; t++) {
      m.push(chans.map((ch) => S.sig[t][ch]));
      const est = m.estimate();
      if (est) { score += fieldNrmse(est, S.truth[t]); cnt++; }
    }
    score = cnt ? score / cnt : NaN;
    cells.push(score);
    if (!best || score < best.score) best = { ...c, ridge, score, nf };
  }
  console.log(`${String(c.taps).padStart(5)}${String(c.lag).padStart(5)}${String(c.stride).padStart(6)}` +
    `${String(depth).padStart(6)}${String(nf).padStart(5)}${String(trained).padStart(8)}   ` +
    cells.map((v) => (Number.isFinite(v) ? v.toExponential(3) : 'n/a').padStart(12)).join('') +
    `   ${c.note}`);
}

console.log(`\nstatic map (do nothing)      ${staticScore.toExponential(3)}`);
console.log(`best configuration           ${best.score.toExponential(3)}  ` +
  `(${best.taps} taps, lag ${best.lag} x ${best.stride}, ridge ${best.ridge}, nf ${best.nf})`);
console.log(`improvement over doing nothing ${(staticScore / best.score).toFixed(2)}x`);
console.log(best.score < staticScore
  ? '\nTHE SENSORS EARN THEIR PLACE once the lag window reaches the convection\n'
    + 'delay. Every reconstruction number this project has published was measured\n'
    + 'memorylessly, on a steady field, without a do-nothing control -- three\n'
    + 'independent reasons they understate the method, and one reason they were\n'
    + 'not measuring it at all.'
  : '\nSTILL NOT BEATING A CONSTANT, despite correlations of 0.97 being present at\n'
    + 'these lags. The information is reachable and this estimator is not reaching\n'
    + 'it, which points at the fit rather than the features -- the record is short\n'
    + 'relative to the delay, and one shared covariance over 161 readouts is the\n'
    + 'next thing to question.');
