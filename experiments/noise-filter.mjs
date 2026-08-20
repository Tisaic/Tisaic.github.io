// CAN CONDITIONING THE INPUTS BUY BACK THE NONLINEAR BASIS UNDER NOISE?
//
// The expanded universal map is the better estimator on clean data and its
// ADVANTAGE (not its standing) is what correlated sensor noise removes. The
// question here is whether cheap, deployable input conditioning restores it, and
// what accuracy it costs on clean data to do so.
//
// TWO FILTERS, ATTACKING DIFFERENT HALVES, and they are not interchangeable:
//
//   LOW PASS (temporal)   a causal boxcar over the last `lp` samples. Sensor noise
//                         is broadband; the informative flow signal here is slow
//                         (the inlet is driven at 0.004 cycles/step and the
//                         wall-to-interior coupling peaks at a 300-sample lag), so
//                         averaging should cut white noise by ~sqrt(lp) while
//                         barely touching the signal. It CANNOT touch a constant
//                         offset -- a drift is DC and passes a low-pass unchanged.
//
//   COMMON-MODE REJECTION a spatial filter: subtract the cross-channel mean of the
//   (spatial)             pressure taps, in units of each channel's calibrated
//                         spread. This is what differential measurement does in
//                         hardware. It removes a coherent shift EXACTLY, including
//                         a DC drift, at the cost of one degree of freedom -- and
//                         if the true field has a spatially uniform component,
//                         that component goes with it.
//
// PREDICTIONS, STATED BEFORE THE NUMBERS:
//   1. low pass helps INDEPENDENT noise a lot, roughly as sqrt(lp)
//   2. low pass also helps COMMON noise, because that mode is white in TIME even
//      though it is correlated across channels
//   3. low pass does NOTHING for DRIFT, which is constant
//   4. common-mode rejection nearly eliminates COMMON and DRIFT and does little
//      for INDEPENDENT
//   5. the two together are robust to all three
//   6. both cost something on clean data -- the low pass smooths real signal and
//      adds group delay, the rejection spends a degree of freedom
// A row that violates 3 or 4 means the filter is not doing what it is named for.
//
// TRAINING IS ON THE NOISY, FILTERED STREAM, unlike the earlier noise runs which
// trained clean and only perturbed at inference. That was the drift-after-
// commissioning case; this is the permanent-instrument-noise case, and it is the
// one where conditioning matters most, because noise in the REGRESSORS also
// biases the fit toward zero and a filter reduces that bias as well as the
// variance.
import { dyeStream, fieldNrmse, rng } from './dye-stream.mjs';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const SAMPLES = 1600, WARMUP = 200, TRAIN_END = 1200;
const MODE = process.env.INLET || 'multitone';
const AMP = +(process.env.AMP || 0.3);
const ETA = +(process.env.ETA || 0.1);
const TAPS = +(process.env.TAPS || 8);

const S = await dyeStream({ samples: SAMPLES, perWall: 12, inletMode: MODE, inletAmplitude: AMP });
const K = S.target.length;

const smMu = new Float64Array(K);
for (let t = 0; t < TRAIN_END; t++) {
  for (let k = 0; k < K; k++) smMu[k] += (S.truth[t][k] - smMu[k]) / (t + 1);
}
let staticScore = 0, n0 = 0;
for (let t = TRAIN_END; t < SAMPLES; t++) { staticScore += fieldNrmse(smMu, S.truth[t]); n0++; }
staticScore /= n0;

function tapChannels(n2) {
  const perWall = n2 >> 1, taps = [];
  for (let w = 0; w < 2; w++) {
    for (let j = 0; j < perWall; j++) taps.push(w * 12 + Math.round(j * 11 / (perWall - 1)));
  }
  const ch = [];
  for (const t of [...new Set(taps)].sort((a, b) => a - b)) ch.push(3 * t, 3 * t + 1, 3 * t + 2);
  return ch;
}
const CH = tapChannels(TAPS);
const P = CH.length;
const rhoLocal = [];
CH.forEach((c, i) => { if (S.rhoSlots.includes(c)) rhoLocal.push(i); });

// Commissioning statistics: taken from the CLEAN training window, which is what a
// calibration pass gives you. The conditioner needs them to work in per-channel
// units; the model does its own standardisation afterwards regardless.
const calMean = new Float64Array(P), calStd = new Float64Array(P);
{
  const m2 = new Float64Array(P);
  for (let t = 0; t < TRAIN_END; t++) {
    const n = t + 1;
    for (let i = 0; i < P; i++) {
      const v = S.sig[t][CH[i]], d = v - calMean[i];
      calMean[i] += d / n; m2[i] += d * (v - calMean[i]);
    }
  }
  for (let i = 0; i < P; i++) calStd[i] = Math.sqrt(m2[i] / TRAIN_END) || 1;
}

/** The recorded stream for these channels, with noise of the requested structure. */
function noisyRows(eta, mode, seed = 7) {
  const g = rng(seed);
  const held = Math.abs(g());
  const rows = [];
  for (let t = 0; t < SAMPLES; t++) {
    const r = new Float64Array(P);
    for (let i = 0; i < P; i++) r[i] = S.sig[t][CH[i]];
    if (eta > 0) {
      const shared = mode === 'drift' ? held : g();
      for (const i of rhoLocal) {
        r[i] += eta * calStd[i] * (mode === 'indep' ? g() : shared);
      }
    }
    rows.push(r);
  }
  return rows;
}

/** Causal conditioning. Both filters are linear, so the order does not matter. */
function condition(rows, { lp = 1, cmr = false }) {
  let out = rows;
  if (cmr) {
    out = out.map((r) => {
      const q = Float64Array.from(r);
      let m = 0;
      for (const i of rhoLocal) m += (q[i] - calMean[i]) / calStd[i];
      m /= rhoLocal.length;
      for (const i of rhoLocal) q[i] -= m * calStd[i];
      return q;
    });
  }
  if (lp > 1) {
    const acc = new Float64Array(P);
    const filt = [];
    for (let t = 0; t < out.length; t++) {
      const q = new Float64Array(P);
      const a = Math.max(0, t - lp + 1), n = t - a + 1;
      for (let i = 0; i < P; i++) {
        let s = 0;
        for (let k = a; k <= t; k++) s += out[k][i];
        q[i] = s / n;
      }
      filt.push(q);
    }
    out = filt;
  }
  return out;
}

function run(rows, expand) {
  const m = new FieldReconstructor({ nSignals: P, nLocations: K, lag: 1, stride: 1,
    warmup: WARMUP, expand, ridge: 100, lam: 1.0 });
  for (let t = 0; t < TRAIN_END; t++) { m.push(rows[t]); m.observe(S.truth[t]); }
  let score = 0, cnt = 0;
  for (let t = TRAIN_END; t < SAMPLES; t++) {
    m.push(rows[t]);
    const est = m.estimate();
    if (est) { score += fieldNrmse(est, S.truth[t]); cnt++; }
  }
  return { score: cnt ? score / cnt : NaN, nf: m.nf };
}

const FILTERS = [
  { tag: 'none', lp: 1, cmr: false },
  { tag: 'lp 8', lp: 8, cmr: false },
  { tag: 'lp 32', lp: 32, cmr: false },
  { tag: 'cmr', lp: 1, cmr: true },
  { tag: 'cmr+lp32', lp: 32, cmr: true },
];
const MODES = ['indep', 'common', 'drift'];

console.log(JSON.stringify({ inlet: `${MODE} ${AMP}`, taps: TAPS, channels: P,
  locations: K, eta: ETA, staticMap: +staticScore.toExponential(3),
  training: 'on the noisy, filtered stream' }));

for (const expand of [false, true]) {
  const label = expand ? 'EXPANDED (universal map)' : 'linear';
  const results = {};
  const clean = {};
  for (const flt of FILTERS) {
    clean[flt.tag] = run(condition(noisyRows(0, 'indep'), flt), expand).score;
    for (const mode of MODES) {
      results[`${flt.tag}|${mode}`] = run(condition(noisyRows(ETA, mode), flt), expand).score;
    }
  }
  const nf = run(condition(noisyRows(0, 'indep'), FILTERS[0]), expand).nf;
  console.log(`\n-- ${label}, nf ${nf}`);
  console.log(`${'filter'.padEnd(10)}${'clean'.padStart(11)}${'indep'.padStart(11)}` +
    `${'common'.padStart(11)}${'drift'.padStart(11)}   worst/clean`);
  for (const flt of FILTERS) {
    const c = clean[flt.tag];
    const worst = Math.max(...MODES.map((m) => results[`${flt.tag}|${m}`]));
    console.log(`${flt.tag.padEnd(10)}${c.toExponential(3).padStart(11)}` +
      MODES.map((m) => results[`${flt.tag}|${m}`].toExponential(3).padStart(11)).join('') +
      `   ${(worst / c).toFixed(1)}x`);
  }
  // The trade, stated as the user framed it: what does the filter cost on clean
  // data, and what does it buy on the worst noise mode?
  const base = FILTERS[0];
  const bc = clean[base.tag];
  const bw = Math.max(...MODES.map((m) => results[`${base.tag}|${m}`]));
  console.log('  trade vs unfiltered:');
  for (const flt of FILTERS.slice(1)) {
    const c = clean[flt.tag];
    const w = Math.max(...MODES.map((m) => results[`${flt.tag}|${m}`]));
    console.log(`    ${flt.tag.padEnd(10)} clean costs ${(c / bc).toFixed(2)}x, ` +
      `worst-noise improves ${(bw / w).toFixed(2)}x`);
  }
}
console.log(`\nstatic map (do nothing) = ${staticScore.toExponential(3)} -- any row above`);
console.log('that number is not soft-sensing, whatever its filter.');
