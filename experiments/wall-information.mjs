// IS THE INFORMATION THERE AT ALL? A model-free answer.
//
// Three estimator families have now failed to beat a constant on this task: the
// shipped memoryless readout (0.182 against a static map's 0.028), the same
// readout at every prior over eight decades (best 0.030, which IS the static map,
// reached by shrinking the weights to zero), and a lagged readout spanning up to
// two transit times (best 0.162). At some point the honest move is to stop
// blaming the estimator and ask whether the signal exists.
//
// So this fits nothing. For every interior location it takes the plain Pearson
// correlation between each wall channel's history and that location's
// concentration, maximised over lag. Correlation is a weak instrument -- it sees
// only linear, only pairwise -- but it is exactly the class our readout belongs
// to, so if the best correlation over all channels and all lags is small, a
// linear readout on these channels CANNOT work and no amount of prior, memory or
// feature expansion will change that.
//
// THE LAG AT WHICH THE PEAK SITS IS THE SECOND RESULT, and it is the falsifiable
// half. A plume is convected: what a wall tap sees now should show up downstream
// later, so the peak lag should GROW with distance from the injection needle and
// should scale with the transit time. If the peaks are strong but sit at lag
// zero, the coupling is instantaneous and the memory argument is wrong. If they
// are strong at physically sensible lags, the sensing is fine and the estimator
// is what is failing.
import { dyeStream } from './dye-stream.mjs';

const SAMPLES = 1600;
const MODE = process.env.INLET || 'multitone';
const AMP = +(process.env.AMP || 0.3);
const LAG_MAX = +(process.env.LAG_MAX || 600);
const LAG_STEP = +(process.env.LAG_STEP || 10);

const S = await dyeStream({ samples: SAMPLES, perWall: 12, inletMode: MODE, inletAmplitude: AMP });
const K = S.target.length, T = SAMPLES;
const transitSamples = Math.round(S.transit / 2);

/** Standardise in place; returns null for a dead channel. */
function z(series) {
  let mu = 0, m2 = 0, n = 0;
  for (const v of series) { n++; const d = v - mu; mu += d / n; m2 += d * (v - mu); }
  const sd = Math.sqrt(m2 / n);
  if (!(sd > 1e-30)) return null;
  return series.map((v) => (v - mu) / sd);
}

// One channel per tap for each quantity, so the sweep stays affordable and every
// quantity still gets its chance.
const chans = [];
for (let t = 0; t < S.sensors.length; t += 2) chans.push(3 * t, 3 * t + 1, 3 * t + 2);
const sensorZ = chans.map((c) => z(Array.from({ length: T }, (_, t) => S.sig[t][c])))
  .map((s, i) => ({ ch: chans[i], s }))
  .filter((o) => o.s);

const targetZ = [];
for (let k = 0; k < K; k++) {
  const s = z(Array.from({ length: T }, (_, t) => S.truth[t][k]));
  if (s) targetZ.push({ k, s });
}
console.log(JSON.stringify({ inlet: `${MODE} ${AMP}`, channelsTested: sensorZ.length,
  liveLocations: targetZ.length, ofTotal: K, transitSamples,
  lagsTested: `0..${LAG_MAX} step ${LAG_STEP}` }));

const best = [];
for (const { k, s: ts } of targetZ) {
  let bc = 0, bl = 0, bch = -1;
  for (const { ch, s: ss } of sensorZ) {
    for (let L = 0; L <= LAG_MAX; L += LAG_STEP) {
      let acc = 0, n = 0;
      for (let t = L; t < T; t++) { acc += ss[t - L] * ts[t]; n++; }
      const c = Math.abs(acc / n);
      if (c > bc) { bc = c; bl = L; bch = ch; }
    }
  }
  best.push({ k, corr: bc, lag: bl, ch: bch });
}

const corrs = best.map((b) => b.corr).sort((a, b) => a - b);
const q = (p) => corrs[Math.min(corrs.length - 1, Math.floor(p * corrs.length))];
console.log('\nBEST |correlation| between any wall channel (at any lag) and each location:');
console.log(JSON.stringify({ min: +q(0).toFixed(3), q25: +q(0.25).toFixed(3),
  median: +q(0.5).toFixed(3), q75: +q(0.75).toFixed(3), max: +q(1).toFixed(3),
  aboveHalf: +(corrs.filter((c) => c > 0.5).length / corrs.length).toFixed(3),
  aboveEightTenths: +(corrs.filter((c) => c > 0.8).length / corrs.length).toFixed(3) }, null, 1));

// Where the peaks sit. A convected signal must show a lag that grows downstream.
const byLag = new Map();
for (const b of best) byLag.set(b.lag, (byLag.get(b.lag) || 0) + 1);
const top = [...byLag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log('\nmost common peak lags (samples, transit = ' + transitSamples + '): ' +
  top.map(([l, c]) => `${l}:${c}`).join('  '));
const strong = best.filter((b) => b.corr > 0.5);
console.log(`peak lag among the ${strong.length} well-correlated locations: ` +
  (strong.length
    ? `median ${strong.map((b) => b.lag).sort((a, b) => a - b)[strong.length >> 1]}`
    : 'n/a'));

console.log(q(0.5) > 0.5
  ? '\nTHE SIGNAL IS THERE. A linear readout on these channels should work, so the\n'
    + 'failure to beat a constant belongs to the estimator or its training, not to\n'
    + 'the sensing.'
  : q(0.75) > 0.5
    ? '\nPARTIAL. A minority of locations are well correlated with the wall and the\n'
      + 'rest are not, so a whole-field reconstruction is the wrong claim -- but a\n'
      + 'reconstruction restricted to the observable region is a real one, and an\n'
      + 'observability mask is what should be shipped rather than a full-field picture.'
    : '\nTHE SIGNAL IS NOT THERE. No wall channel at any lag carries the interior\n'
      + 'concentration linearly, so no linear readout on these sensors can beat a\n'
      + 'constant, and the earlier reconstruction claims were reporting a small number\n'
      + 'rather than a working soft sensor.');
