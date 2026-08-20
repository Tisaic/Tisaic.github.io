// IS THE DYE FIELD ACTUALLY DOING ANYTHING?
//
// `ridge-sign.mjs` returned a held-out field nRMSE of 2e-4 -- four hundred times
// better than the online reconstructor manages on the same stream -- and returned
// the SAME number at every noise level from zero to a 30% perturbation. A model
// that is immune to noise on its inputs is not using its inputs.
//
// The obvious explanation is the one this project has already had to learn twice,
// most recently on the soft-sensor tab: if the target does not move, there is no
// question being asked, and every score is noise divided by noise. A batch fit on
// a steady field converges to a STATIC MAP -- weights near zero, one constant per
// location -- which reconstructs the field beautifully and ignores the sensors
// entirely. That is exactly the signature above.
//
// So the number to look at is not the error, it is how much the truth VARIES IN
// TIME against how much it varies in SPACE. nRMSE here is normalised by the
// spatial spread, so a field whose temporal wobble is a thousandth of its spatial
// structure scores ~1e-3 for doing nothing at all.
//
// This has to gate the noise conclusions rather than follow them.
import { dyeStream } from './dye-stream.mjs';

const S = await dyeStream({ samples: 1600, perWall: 6 });
const K = S.target.length, T = S.sig.length;

// Per-location temporal statistics (Welford), and per-snapshot spatial spread.
const mu = new Float64Array(K), m2 = new Float64Array(K);
for (let t = 0; t < T; t++) {
  const n = t + 1;
  for (let k = 0; k < K; k++) {
    const d = S.truth[t][k] - mu[k];
    mu[k] += d / n; m2[k] += d * (S.truth[t][k] - mu[k]);
  }
}
const tempStd = Array.from({ length: K }, (_, k) => Math.sqrt(m2[k] / T));

let spatial = 0;
for (let t = 0; t < T; t++) {
  const y = S.truth[t];
  let m = 0; for (const v of y) m += v; m /= K;
  let s = 0; for (const v of y) s += (v - m) ** 2;
  spatial += Math.sqrt(s / K) / T;
}

// THE STATIC-MAP BASELINE, which is the number that decides it: predict each
// location's own time-average, forever, using no sensor at all. If that scores
// well, the reconstruction task is recall, not inference.
let staticScore = 0, n = 0;
for (let t = 0; t < T; t++) {
  const y = S.truth[t];
  let m = 0; for (const v of y) m += v; m /= K;
  let se = 0, sd = 0;
  for (let k = 0; k < K; k++) { se += (mu[k] - y[k]) ** 2; sd += (y[k] - m) ** 2; }
  staticScore += Math.sqrt(se / Math.max(sd, 1e-30)); n++;
}
staticScore /= n;

// Split by half, because a slow drift and a genuine fluctuation look the same in
// a single standard deviation and only one of them is a question worth asking.
const half = T >> 1;
const meanOf = (a, b, k) => {
  let s = 0; for (let t = a; t < b; t++) s += S.truth[t][k];
  return s / (b - a);
};
let drift = 0;
for (let k = 0; k < K; k++) drift += Math.abs(meanOf(half, T, k) - meanOf(0, half, k)) ** 2;
drift = Math.sqrt(drift / K);

const meanTemp = tempStd.reduce((a, b) => a + b, 0) / K;
console.log(JSON.stringify({
  locations: K, samples: T,
  spatialSpread: +spatial.toExponential(3),
  temporalStdMean: +meanTemp.toExponential(3),
  temporalStdMax: +Math.max(...tempStd).toExponential(3),
  temporalOverSpatial: +(meanTemp / spatial).toExponential(3),
  driftBetweenHalves: +drift.toExponential(3),
  driftOverTemporal: +(drift / meanTemp).toFixed(3),
  staticMapNrmse: +staticScore.toExponential(3),
}, null, 1));

console.log(`\nA STATIC MAP -- each location's own time average, no sensor read at all --`);
console.log(`scores ${staticScore.toExponential(3)} on this stream.`);
console.log(staticScore < 0.05
  ? '\nTHE TASK IS RECALL, NOT INFERENCE. The field barely moves, so a constant per\n'
    + 'location already reconstructs it and the sensors are not needed. Every score\n'
    + 'measured on this stream -- including the noise sensitivities -- is measured on\n'
    + 'a question with no content, and a batch fit will correctly learn to ignore the\n'
    + 'sensors and be immune to noise on them. The stream needs an unsteady flow\n'
    + 'before any of it means anything.'
  : staticScore < 0.3
    ? '\nMOSTLY RECALL. A static map already gets most of the way, so the sensors are\n'
      + 'only being asked for a correction and the noise numbers describe that\n'
      + 'correction rather than the reconstruction.'
    : '\nThe field genuinely moves and a static map is not enough: the reconstruction\n'
      + 'is answering a real question and the noise results stand.');
