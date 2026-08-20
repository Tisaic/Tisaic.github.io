// THE NOISE QUESTION, RE-ASKED ON A STREAM WHERE IT MEANS SOMETHING.
//
// The first four noise experiments were all run on a steady dye field, where a
// STATIC MAP -- one constant per location, no sensor read at all -- reconstructs
// the field at nRMSE 1.7e-3 while the reconstructor scores 0.086. On that stream
// every sensitivity measured is the sensitivity of a model that had nothing to
// fit, and the batch fit in `ridge-sign.mjs` correctly learned to ignore the
// sensors entirely, which is why its error did not move at ANY noise level. That
// invariance was the symptom that exposed the whole thing.
//
// The cause is structural rather than a bad setting: the scalar is ONE-WAY
// COUPLED. Dye is advected by the flow and never acts on it, so a wall tap learns
// about the plume only THROUGH the velocity field. A steady flow makes the plume
// a fixed function of that flow, and a constant is then the right answer.
//
// So the flow is now driven -- `inletMode` multitone, three incommensurate tones,
// measured at drift/temporal 0.23, i.e. genuine stationary fluctuation rather
// than a settling transient. Two controls run in EVERY row and the results are
// reported against them rather than in isolation:
//
//   STATIC MAP    each location's time average over the training window. If the
//                 model does not beat this, it is not soft-sensing anything.
//   CLEAN MODEL   the same model with no noise, so a degradation is a degradation
//                 rather than a level.
//
// The questions are the ones the instrumentation review raised: is a coherent
// shift across every pressure channel worse than independent noise of the same
// per-channel size, and does the nonlinear expansion amplify sensor noise
// relative to a linear readout.
import { dyeStream, fieldNrmse, rng } from './dye-stream.mjs';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const SAMPLES = 1600, WARMUP = 200, TRAIN_END = 1200;
const MODE = process.env.INLET || 'multitone';
const AMP = +(process.env.AMP || 0.3);
const ETAS = [0, 0.01, 0.03, 0.1, 0.3];
const f = (v, d = 4) => (Number.isFinite(v) ? +v.toFixed(d) : null);

const S = await dyeStream({ samples: SAMPLES, perWall: 12, inletMode: MODE, inletAmplitude: AMP });
const K = S.target.length;
console.log(JSON.stringify({ inlet: `${MODE} ${AMP}`, size: S.size, taps: S.sensors.length,
  locations: K, samples: SAMPLES }));

// ------------------------------------------------------------- the static map
const smMu = new Float64Array(K), smM2 = new Float64Array(K);
for (let t = 0; t < TRAIN_END; t++) {
  const n = t + 1;
  for (let k = 0; k < K; k++) {
    const d = S.truth[t][k] - smMu[k];
    smMu[k] += d / n; smM2[k] += d * (S.truth[t][k] - smMu[k]);
  }
}
let staticScore = 0, spatial = 0, n = 0;
for (let t = TRAIN_END; t < SAMPLES; t++) {
  staticScore += fieldNrmse(smMu, S.truth[t]);
  const y = S.truth[t];
  let m = 0; for (const v of y) m += v; m /= K;
  spatial += Math.sqrt(y.reduce((a, v) => a + (v - m) ** 2, 0) / K);
  n++;
}
staticScore /= n; spatial /= n;
const tempStd = Array.from(smM2, (v) => Math.sqrt(v / TRAIN_END));
const meanTemp = tempStd.reduce((a, b) => a + b, 0) / K;
console.log(`\nCONTROLS: static map ${staticScore.toExponential(3)}, ` +
  `field activity (temporal/spatial) ${(meanTemp / spatial).toExponential(2)}`);
if (meanTemp / spatial < 0.01) {
  console.log('ABORT: the field is steady; there is nothing here to infer.');
  process.exit(1);
}

/** Six taps per wall, evenly spaced over the recorded span. */
function tapChannels(n2) {
  const perWall = n2 >> 1, taps = [];
  for (let w = 0; w < 2; w++) {
    for (let j = 0; j < perWall; j++) {
      taps.push(w * 12 + (perWall === 1 ? 0 : Math.round(j * 11 / (perWall - 1))));
    }
  }
  const ch = [];
  for (const t of [...new Set(taps)].sort((a, b) => a - b)) ch.push(3 * t, 3 * t + 1, 3 * t + 2);
  return ch;
}

function trainClean(chans, expand) {
  const m = new FieldReconstructor({ nSignals: chans.length, nLocations: K, lag: 1,
    stride: 1, warmup: WARMUP, expand, ridge: 100, lam: 1.0 });
  for (let t = 0; t < TRAIN_END; t++) {
    m.push(chans.map((c) => S.sig[t][c]));
    m.observe(S.truth[t]);
  }
  return m;
}

/**
 * Every mode delivers the same per-channel standard deviation; only the
 * correlation across channels differs, so a worse row cannot be a bigger one.
 */
function replay(model, chans, eta, mode, seed = 7) {
  const g = rng(seed);
  const rl = [];
  chans.forEach((c, i) => { if (S.rhoSlots.includes(c)) rl.push(i); });
  const held = Math.abs(g());
  const out = [];
  for (let t = TRAIN_END; t < SAMPLES; t++) {
    const row = chans.map((c) => S.sig[t][c]);
    if (eta > 0) {
      const shared = mode === 'drift' ? held : g();
      for (const i of rl) {
        const sd = S.std[chans[i]];
        row[i] += eta * sd * (mode === 'indep' ? g() : shared);
      }
    }
    model.push(row);
    const est = model.estimate();
    if (est) out.push(fieldNrmse(est, S.truth[t]));
  }
  return out.reduce((a, b) => a + b, 0) / Math.max(1, out.length);
}

const arms = [
  { tag: 'linear  12 taps', chans: tapChannels(12), expand: false },
  { tag: 'EXPANDED 12 taps', chans: tapChannels(12), expand: true },
  { tag: 'linear  24 taps', chans: tapChannels(24), expand: false },
];
console.log(`\n${'arm'.padEnd(18)}${'nf'.padStart(5)}  eta:` +
  ETAS.map((e) => String(e).padStart(9)).join(''));
const table = [];
for (const arm of arms) {
  const model = trainClean(arm.chans, arm.expand);
  const row = { arm: arm.tag, nf: model.nf };
  for (const mode of ['indep', 'common', 'drift']) {
    row[mode] = ETAS.map((eta) => replay(model, arm.chans, eta, mode));
  }
  table.push(row);
  console.log(`${arm.tag.padEnd(18)}${String(model.nf).padStart(5)}`);
  for (const mode of ['indep', 'common', 'drift']) {
    console.log(`  ${mode.padEnd(21)}` + row[mode].map((v) => f(v).toFixed(4).padStart(9)).join(''));
  }
}

console.log('\nVERDICTS (static map = ' + staticScore.toExponential(3) + ')');
const at = (r, mode, eta) => r[mode][ETAS.indexOf(eta)];
for (const r of table) {
  const clean = at(r, 'indep', 0);
  console.log(`  ${r.arm}: clean ${clean.toFixed(4)} = ` +
    `${(staticScore / clean).toFixed(1)}x better than doing nothing` +
    (clean < staticScore ? '' : '  <-- WORSE THAN DOING NOTHING'));
}
console.log('\n  correlated vs independent, at equal per-channel size:');
for (const r of table) {
  const clean = at(r, 'indep', 0);
  const ratio = (mode, e) => (at(r, mode, e) - clean) / Math.max(1e-12, at(r, 'indep', e) - clean);
  console.log(`    ${r.arm.padEnd(18)}` +
    [0.03, 0.1, 0.3].map((e) => `eta ${e}: common ${f(ratio('common', e), 2)}x drift ${f(ratio('drift', e), 2)}x`).join('  '));
}
console.log('\n  what independent noise costs each basis, relative to its own clean score:');
for (const r of table) {
  const clean = at(r, 'indep', 0);
  console.log(`    ${r.arm.padEnd(18)}` +
    [0.03, 0.1, 0.3].map((e) => `eta ${e}: +${(100 * (at(r, 'indep', e) - clean) / clean).toFixed(0)}%`).join('   '));
}
