// IS CORRELATED SENSOR NOISE WORSE THAN INDEPENDENT NOISE OF THE SAME SIZE?
//
// The claim under test, from the instrumentation review: a temperature
// coefficient shared across every pressure channel moves them TOGETHER, and to an
// inverse solver a coherent shift across all sensors is indistinguishable from a
// genuine low-order field mode -- so it will be reconstructed as one. Independent
// per-channel noise is the flattering assumption; common-mode is the realistic
// one and is what actually limits a 12-sensor reconstruction.
//
// That is a MECHANISM, not a measurement, and whether it matters here depends on
// something specific to this geometry: how much the estimator amplifies the
// common direction relative to any other direction of the same size. If the
// common direction is nearly orthogonal to what the readout uses, the whole
// concern is second order for us and we should say so.
//
// THREE MEASUREMENTS, cheapest first:
//   1. ANALYTIC GAIN. The linear readout is a matrix, so the field response to a
//      unit sensor perturbation along any direction is exact arithmetic -- no
//      replay, no sampling error.
//   2. WHERE THE COMMON DIRECTION LIVES, against the correlation matrix of the
//      channels: aliasing onto a high-variance flow mode and amplification of a
//      low-variance one are different failures with the same symptom.
//   3. REPLAY. Train clean, freeze, feed the SAME recorded physics with noise
//      added, score the field. This is the number that decides it.
//
// And the fourth column is what this session's discussion is actually about:
// every arm runs on a LINEAR basis and on the shipped NONLINEAR expansion,
// because x = x0 + n gives x^2 = x0^2 + 2*x0*n + n^2 -- signal-proportional
// noise, a systematic offset of the noise variance, and a dense feature-space
// noise covariance. White independent sensor noise should come out of the
// expansion coloured and correlated whatever it went in as.
import { dyeStream, fieldNrmse, rng } from './dye-stream.mjs';
import { symEig } from './linalg.mjs';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const SAMPLES = 1600, WARMUP = 200, TRAIN_END = 1200;
const ETAS = [0, 0.003, 0.01, 0.03, 0.1, 0.3];
// The replay is most of the clock; the two analytic sections are seconds. Being
// able to re-read them without paying for the replay is why this exists.
const SECTIONS = (process.env.SECTIONS || '123').split('');
const f = (v, d = 4) => (Number.isFinite(v) ? +v.toFixed(d) : null);

const S = await dyeStream({ samples: SAMPLES, perWall: 6 });
console.log(JSON.stringify({ size: S.size, cells: S.cells, transit: S.transit,
  channels: S.P, sensors: S.sensors.length, locations: S.target.length,
  limited: S.limited }));

// Six of the twelve taps, so the nonlinear arm runs at a feature count the
// training window can support. Same physics, a subset of the channels.
const LEAN = [];
for (let s = 0; s < 12; s += 2) LEAN.push(3 * s, 3 * s + 1, 3 * s + 2);

/** Train the shipped reconstructor on the clean record, then stop. */
function trainClean({ chans, expand }) {
  const model = new FieldReconstructor({ nSignals: chans.length,
    nLocations: S.target.length, lag: 1, stride: 1, warmup: WARMUP,
    expand, ridge: 100, lam: 1.0 });
  for (let t = 0; t < TRAIN_END; t++) {
    model.push(chans.map((c) => S.sig[t][c]));
    model.observe(S.truth[t]);
  }
  return model;
}

/**
 * Score the frozen model over the held-out window with noise added to the
 * pressure channels. `mode` decides only the CORRELATION: every mode gives the
 * same per-channel standard deviation, so the arms differ in structure and in
 * nothing else.
 */
function replay(model, chans, { eta, mode, seed = 7 }) {
  const g = rng(seed);
  const rhoLocal = [];
  chans.forEach((c, i) => { if (S.rhoSlots.includes(c)) rhoLocal.push(i); });
  const drift = eta === 0 ? 0 : g();          // one draw, held for the whole run
  const scores = [];
  for (let t = TRAIN_END; t < SAMPLES; t++) {
    const row = chans.map((c) => S.sig[t][c]);
    if (eta > 0) {
      const shared = mode === 'common' ? g() : 0;
      for (const i of rhoLocal) {
        const sd = S.std[chans[i]];
        if (mode === 'indep') row[i] += eta * sd * g();
        else if (mode === 'common') row[i] += eta * sd * shared;
        else row[i] += eta * sd * drift;
      }
    }
    model.push(row);
    const est = model.estimate();
    if (est) scores.push(fieldNrmse(est, S.truth[t]));
  }
  return scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
}

/**
 * Added field nRMSE per unit standardised sensor perturbation along `dir`.
 * For the linear basis the feature column is [1, z], so this is exact arithmetic
 * on the trained weight matrix.
 */
function gainOperator(model, chans) {
  const K = S.target.length, p = chans.length;
  if (model.nf !== p + 1) throw new Error('gain analysis assumes the linear basis');
  let sd = 0, n = 0;
  for (let t = TRAIN_END; t < SAMPLES; t++) {
    const y = S.truth[t];
    let m = 0; for (const v of y) m += v; m /= K;
    for (const v of y) sd += (v - m) ** 2;
    n++;
  }
  sd = Math.sqrt(sd / n);                    // = sqrt(K) * spatial std: nRMSE's denominator
  return (dir) => {
    let norm = 0; for (const v of dir) norm += v * v;
    norm = Math.sqrt(norm);
    let acc = 0;
    for (let k = 0; k < K; k++) {
      const th = model.theta[k].m;
      let r = 0;
      for (let i = 0; i < p; i++) r += dir[i] * th[i + 1];
      acc += (model._tStd[k] * r) ** 2;
    }
    return Math.sqrt(acc) / (norm * sd);
  };
}

const lin12 = trainClean({ chans: [...Array(S.P).keys()], expand: false });
if (SECTIONS.includes('1')) {
  const chans = [...Array(S.P).keys()];
  const gain = gainOperator(lin12, chans);
  const p = S.P;
  // A shared PHYSICAL offset on the pressure channels is NOT a uniform vector in
  // the estimator's coordinates: it standardises to delta/std_i, so a quiet
  // channel receives the larger standardised kick. Building the direction from
  // the measured spreads rather than as all-ones is the difference between
  // testing the mechanism and testing a convenient stand-in for it.
  const cm = new Float64Array(p);
  for (const i of S.rhoSlots) cm[i] = 1 / S.std[i];
  const gCommon = gain(cm);
  const g = rng(11);
  const rand = (slots) => {
    const d = new Float64Array(p);
    for (const i of slots) d[i] = g();
    return gain(d);
  };
  const all = [...Array(p).keys()];
  let rRho = 0, rAll = 0;
  const R = 400;
  for (let i = 0; i < R; i++) { rRho += rand(S.rhoSlots) / R; rAll += rand(all) / R; }
  console.log('\n1. EXACT GAIN of the trained linear readout (added field nRMSE per unit');
  console.log('   standardised sensor perturbation). Higher = the estimator amplifies it.');
  console.log(JSON.stringify({ commonMode: f(gCommon, 3),
    randomInPressureChannels: f(rRho, 3), randomAllChannels: f(rAll, 3),
    ratioCommonOverRandom: f(gCommon / rRho, 2) }, null, 1));
}

// ------------------------------------------- 2. where the common direction lives
if (SECTIONS.includes('2')) {
  const p = S.P, n = SAMPLES;
  const R = new Float64Array(p * p);
  for (const row of S.sig) {
    for (let i = 0; i < p; i++) {
      const zi = (row[i] - S.mean[i]) / (S.std[i] || 1);
      for (let j = i; j < p; j++) {
        const zj = (row[j] - S.mean[j]) / (S.std[j] || 1);
        R[i * p + j] += zi * zj / n;
      }
    }
  }
  for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) R[j * p + i] = R[i * p + j];
  const { values, vectors } = symEig(R, p);
  const cm = new Float64Array(p);
  let nn = 0;
  for (const i of S.rhoSlots) cm[i] = 1 / S.std[i];
  for (let i = 0; i < p; i++) nn += cm[i] * cm[i];
  for (let i = 0; i < p; i++) cm[i] /= Math.sqrt(nn);
  const overlap = [];
  let cum = 0;
  for (let k = 0; k < p; k++) {
    let d = 0;
    for (let i = 0; i < p; i++) d += cm[i] * vectors[i * p + k];
    cum += d * d;
    if (k < 8) overlap.push({ mode: k, eigenvalue: f(values[k], 3), share: f(d * d, 4), cumulative: f(cum, 4) });
  }
  const totVar = [...values].reduce((a, b) => a + b, 0);
  console.log('\n2. WHERE THE COMMON-MODE DIRECTION LIVES, against the correlation');
  console.log('   matrix of the sensor channels (eigenvalues sum to the channel count).');
  console.log(JSON.stringify({ totalVariance: f(totVar, 2),
    varianceInTop3: f(values.slice(0, 3).reduce((a, b) => a + b, 0) / totVar, 3),
    commonModeOverlap: overlap }, null, 1));
}

// -------------------------------------------------------------------- 3. replay
if (!SECTIONS.includes('3')) process.exit(0);
console.log('\n3. REPLAY: train clean, freeze, feed the same physics with noise on the');
console.log('   pressure channels. Field nRMSE, held-out window. Same per-channel');
console.log('   magnitude in every mode -- only the correlation differs.');
const arms = [
  { tag: 'linear  12 sensors', chans: [...Array(S.P).keys()], expand: false, model: lin12 },
  { tag: 'linear   6 sensors', chans: LEAN, expand: false },
  { tag: 'EXPANDED 6 sensors', chans: LEAN, expand: true },
];
const table = [];
for (const arm of arms) {
  const model = arm.model || trainClean(arm);
  const row = { arm: arm.tag, features: model.nf };
  for (const mode of ['indep', 'common', 'drift']) {
    row[mode] = ETAS.map((eta) => f(replay(model, arm.chans, { eta, mode })));
  }
  table.push(row);
  console.log(`  ${arm.tag.padEnd(20)} nf=${String(model.nf).padStart(4)}`);
  console.log(`    eta      ${ETAS.map((e) => String(e).padStart(8)).join('')}`);
  for (const mode of ['indep', 'common', 'drift']) {
    console.log(`    ${mode.padEnd(8)} ${row[mode].map((v) => (v == null ? '    n/a' : v.toFixed(4)).padStart(8)).join('')}`);
  }
}

const [lin, lean, exp] = table;
const at = (row, mode, eta) => row[mode][ETAS.indexOf(eta)];
console.log('\nVERDICTS');
console.log('  common vs independent, 12-sensor linear: ' +
  [0.01, 0.03, 0.1].map((e) => `eta ${e} -> ${f(at(lin, 'common', e) / at(lin, 'indep', e), 2)}x`).join(', '));
const degr = (row, eta) => (at(row, 'indep', eta) - at(row, 'indep', 0)) / at(row, 'indep', 0);
console.log('  INDEPENDENT noise costs, linear vs expanded (6 sensors, vs own clean):');
for (const e of [0.01, 0.03, 0.1]) {
  console.log(`    eta ${String(e).padEnd(6)} linear +${(100 * degr(lean, e)).toFixed(1)}%   expanded +${(100 * degr(exp, e)).toFixed(1)}%`);
}
console.log(`  clean floor: linear ${at(lean, 'indep', 0)} vs expanded ${at(exp, 'indep', 0)}`);
