// THE MEMORY TEST -- and it is the one the sparse-sensing review said would
// matter most.
//
// Established so far, on a driven flow with genuine content: the reconstructor
// scores 0.182 where a static map scores 0.028, and sweeping the prior only
// improves it by shrinking the weights toward zero -- best case 0.030, i.e. 0.92x
// the static map, which is the static map. At every prior the sensors add
// nothing. That is not a regularisation failure; it is a STRUCTURAL one.
//
// The structure in question is `lag: 1`. Every reconstruction result in this
// project so far is MEMORYLESS: a spatial map from the sensors NOW to the field
// NOW. On a convection-dominated flow that cannot work, and the reason is
// physical rather than statistical. Dye at an interior point arrived there; what
// determines it is the flow HISTORY over the time it took to travel from the
// injection needle, which at these settings is one transit -- 800 solver steps,
// 400 samples. A wall tap read at this instant carries the boundary condition of
// a plume that has not arrived yet.
//
// The literature agrees and is blunt about the size of it: shallow recurrent
// decoders reconstruct from a SINGLE sensor with history at nRMSE 0.11 against
// 0.89 for the same sensor read memorylessly. If that transfers even weakly, the
// saturation this project measured at ~6 wall sensors is a property of the
// memoryless estimator rather than of the sensing problem -- the ladder was
// measuring how many copies of "now" you need, and the answer to that is few
// because they are all nearly the same measurement.
//
// So: sweep the lag window against the transit time, keep the do-nothing control
// in every row, and report the effective training length, because a deep lag
// window eats the record and a thin fit would explain a bad row by itself.
import { dyeStream, fieldNrmse } from './dye-stream.mjs';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const SAMPLES = 1600, WARMUP = 200, TRAIN_END = 1200;
const MODE = process.env.INLET || 'multitone';
const AMP = +(process.env.AMP || 0.3);
const RIDGE = +(process.env.RIDGE || 1);

const S = await dyeStream({ samples: SAMPLES, perWall: 12, inletMode: MODE, inletAmplitude: AMP });
const K = S.target.length;
// One transit in SAMPLES, which is the timescale a lag window has to reach.
const transitSamples = Math.round(S.transit / 2);

const smMu = new Float64Array(K);
for (let t = 0; t < TRAIN_END; t++) {
  for (let k = 0; k < K; k++) smMu[k] += (S.truth[t][k] - smMu[k]) / (t + 1);
}
let staticScore = 0, n = 0;
for (let t = TRAIN_END; t < SAMPLES; t++) { staticScore += fieldNrmse(smMu, S.truth[t]); n++; }
staticScore /= n;

console.log(JSON.stringify({ inlet: `${MODE} ${AMP}`, taps: S.sensors.length, locations: K,
  transitSteps: S.transit, transitSamples, staticMap: +staticScore.toExponential(3), ridge: RIDGE }));

function tapChannels(n2) {
  const perWall = n2 >> 1, taps = [];
  for (let w = 0; w < 2; w++) {
    for (let j = 0; j < perWall; j++) taps.push(w * 12 + Math.round(j * 11 / (perWall - 1)));
  }
  const ch = [];
  for (const t of [...new Set(taps)].sort((a, b) => a - b)) ch.push(3 * t, 3 * t + 1, 3 * t + 2);
  return ch;
}

const CASES = [
  { taps: 12, lag: 1, stride: 1 },
  { taps: 12, lag: 4, stride: 25 },
  { taps: 12, lag: 8, stride: 25 },
  { taps: 12, lag: 8, stride: 50 },
  { taps: 6, lag: 16, stride: 25 },
  { taps: 6, lag: 16, stride: 50 },
  { taps: 4, lag: 24, stride: 25 },
];

console.log(`\n${'taps'.padStart(5)}${'lag'.padStart(5)}${'stride'.padStart(8)}${'span'.padStart(7)}` +
  `${'span/transit'.padStart(14)}${'nf'.padStart(6)}${'trainN'.padStart(8)}` +
  `${'field nRMSE'.padStart(13)}${'vs static'.padStart(11)}`);
const rows = [];
for (const c of CASES) {
  const chans = tapChannels(c.taps);
  const depth = (c.lag - 1) * c.stride + 1;
  const m = new FieldReconstructor({ nSignals: chans.length, nLocations: K,
    lag: c.lag, stride: c.stride, warmup: WARMUP, expand: false, ridge: RIDGE, lam: 1.0 });
  let trained = 0;
  for (let t = 0; t < TRAIN_END; t++) {
    m.push(chans.map((ch) => S.sig[t][ch]));
    if (m.observe(S.truth[t])) trained++;
  }
  let score = 0, cnt = 0;
  for (let t = TRAIN_END; t < SAMPLES; t++) {
    m.push(chans.map((ch) => S.sig[t][ch]));
    const est = m.estimate();
    if (est) { score += fieldNrmse(est, S.truth[t]); cnt++; }
  }
  score = cnt ? score / cnt : NaN;
  rows.push({ ...c, nf: m.nf, trained, score });
  console.log(`${String(c.taps).padStart(5)}${String(c.lag).padStart(5)}${String(c.stride).padStart(8)}` +
    `${String(depth).padStart(7)}${(depth / transitSamples).toFixed(2).padStart(14)}` +
    `${String(m.nf).padStart(6)}${String(trained).padStart(8)}` +
    `${score.toExponential(3).padStart(13)}${(staticScore / score).toFixed(2).padStart(11)}`);
}

const best = rows.reduce((a, b) => (b.score < a.score ? b : a));
const base = rows[0];
console.log(`\nmemoryless ${base.score.toExponential(3)} -> best ${best.score.toExponential(3)}` +
  ` at lag ${best.lag} stride ${best.stride} (${(base.score / best.score).toFixed(2)}x)`);
console.log(best.score < staticScore
  ? `\nMEMORY IS WHAT WAS MISSING. The lagged readout beats the do-nothing static map`
    + ` by ${(staticScore / best.score).toFixed(2)}x, where the memoryless one could not beat it\n`
    + 'at any prior. Every reconstruction number this project has published is from\n'
    + 'the memoryless configuration and understates what the sensors can do.'
  : '\nMEMORY IS NOT ENOUGH EITHER. The lag window does not lift the reconstruction\n'
    + 'past a constant per location, so the wall signals genuinely may not carry the\n'
    + 'interior plume on this geometry -- which is a result about the SENSING, not\n'
    + 'about the estimator, and is worth stating as one.');
