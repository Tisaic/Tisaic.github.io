// SELECT THE CONDITIONING FROM THE COMMISSIONING RECORD, WITH NO DESIGN KNOB.
//
// `noise-filter.mjs` measured that a common-mode rejection plus a 32-sample boxcar
// turns a 10.2x worst-case noise degradation into 2.1x for a 5% cost on clean
// data. But `lp 32` is a number somebody chose, and it is not portable: at lp 128
// the same filter EATS THE SIGNAL (5.7x clean cost, drift row exploding to 8e-2).
// The right length depends on the plant's own timescale, so on a faster process
// the shipped 32 could be the new 128. That is exactly the kind of constant this
// project should not be shipping.
//
// THREE PIECES, EACH DETERMINED BY MEASUREMENT:
//
//   1. HOW MUCH NOISE IS THERE. A second-difference estimator: for a smooth signal
//      x[t] - 2x[t-1] + x[t-2] is tiny, while for white noise its variance is
//      exactly 6*sigma^2. So sigma comes off the record itself with nothing to
//      set. (This is the standard nonparametric residual-variance estimator.)
//
//   2. WHICH FILTER. A grid over boxcar length and rejection on/off, scored on a
//      HELD-OUT slice of the commissioning window. Held-out matters: scored on the
//      fitting data, less filtering always looks better, because a filter removes
//      information the fit could otherwise memorise.
//
//   3. AGAINST WHAT. And this is the part that a plain cross-validation gets
//      wrong. If commissioning is clean, the best filter ON THAT RECORD is no
//      filter -- measured, `none` beats `cmr+lp32` by 5% on clean data. Validation
//      optimises for the data you have; the filter exists for the data you will
//      meet. So the candidates are scored against the record AS RECORDED and
//      against it STRESSED with synthetic noise at the magnitude step 1 measured,
//      in the three canonical structures (per-channel independent, spatially
//      coherent and time-varying, spatially coherent and constant). Those three
//      are not tuning choices -- they are what a sensor array can do.
//
// The selection is then argmin of the WORST case. Nothing here is set by hand: the
// magnitude is measured, the grid is exhaustive, the objective is worst-case.
//
// TESTED IN BOTH COMMISSIONING SCENARIOS, because the trap only appears in one:
// a clean commissioning record (where naive validation picks no filter and is
// wrong) and a noisy one (where the noise is already in the record).
import { dyeStream, fieldNrmse, rng } from './dye-stream.mjs';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const SAMPLES = 1600, WARMUP = 200;
const FIT_END = 900, COMMISSION_END = 1200;   // validate on [900, 1200)
const MODE = process.env.INLET || 'multitone';
const AMP = +(process.env.AMP || 0.3);
const ETA = +(process.env.ETA || 0.1);
const TAPS = 12;
const EXPAND = process.env.LINEAR !== '1';

const S = await dyeStream({ samples: SAMPLES, perWall: 12, inletMode: MODE, inletAmplitude: AMP });
const K = S.target.length;

function tapChannels(n2) {
  const perWall = n2 >> 1, taps = [];
  for (let w = 0; w < 2; w++) {
    for (let j = 0; j < perWall; j++) taps.push(w * 12 + Math.round(j * 11 / (perWall - 1)));
  }
  const ch = [];
  for (const t of [...new Set(taps)].sort((a, b) => a - b)) ch.push(3 * t, 3 * t + 1, 3 * t + 2);
  return ch;
}
const CH = tapChannels(TAPS), P = CH.length;
const rhoLocal = [];
CH.forEach((c, i) => { if (S.rhoSlots.includes(c)) rhoLocal.push(i); });

const calMean = new Float64Array(P), calStd = new Float64Array(P);
{
  const m2 = new Float64Array(P);
  for (let t = 0; t < COMMISSION_END; t++) {
    const n = t + 1;
    for (let i = 0; i < P; i++) {
      const v = S.sig[t][CH[i]], d = v - calMean[i];
      calMean[i] += d / n; m2[i] += d * (v - calMean[i]);
    }
  }
  for (let i = 0; i < P; i++) calStd[i] = Math.sqrt(m2[i] / COMMISSION_END) || 1;
}

function baseRows(eta, mode, seed = 7) {
  const g = rng(seed);
  const held = Math.abs(g());
  const rows = [];
  for (let t = 0; t < SAMPLES; t++) {
    const r = new Float64Array(P);
    for (let i = 0; i < P; i++) r[i] = S.sig[t][CH[i]];
    if (eta > 0) {
      const shared = mode === 'drift' ? held : g();
      for (const i of rhoLocal) r[i] += eta * calStd[i] * (mode === 'indep' ? g() : shared);
    }
    rows.push(r);
  }
  return rows;
}

/** Add noise to an EXISTING row set (so a stress test stacks on what is there). */
function stress(rows, eta, mode, seed = 31) {
  const g = rng(seed);
  const held = Math.abs(g());
  return rows.map((r) => {
    const q = Float64Array.from(r);
    const shared = mode === 'drift' ? held : g();
    for (const i of rhoLocal) q[i] += eta * calStd[i] * (mode === 'indep' ? g() : shared);
    return q;
  });
}

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

/**
 * STEP 1 -- the noise magnitude, off the record, with nothing set by hand.
 * Var(x[t] - 2x[t-1] + x[t-2]) = 6*sigma^2 for white noise on a smooth signal.
 * Reported as a fraction of each channel's own spread, which is the unit the
 * stress test and every table in this project already use.
 */
function estimateNoise(rows, from, to) {
  const eta = new Float64Array(P);
  for (let i = 0; i < P; i++) {
    let s = 0, n = 0;
    for (let t = from + 2; t < to; t++) {
      const d2 = rows[t][i] - 2 * rows[t - 1][i] + rows[t - 2][i];
      s += d2 * d2; n++;
    }
    eta[i] = Math.sqrt(Math.max(0, s / Math.max(1, n) / 6)) / calStd[i];
  }
  // The pressure channels are the ones the stress test perturbs, so their median
  // is the magnitude that matters. Median rather than mean: one fouled tap should
  // not set the filter for the whole array.
  const rs = rhoLocal.map((i) => eta[i]).sort((a, b) => a - b);
  return { perChannel: eta, pressureMedian: rs[rs.length >> 1] };
}

/** Fit on [0,fitEnd), score on [scoreFrom,scoreTo). */
function evaluate(trainRows, testRows, fitEnd, scoreFrom, scoreTo) {
  const m = new FieldReconstructor({ nSignals: P, nLocations: K, lag: 1, stride: 1,
    warmup: WARMUP, expand: EXPAND, ridge: 100, lam: 1.0 });
  for (let t = 0; t < fitEnd; t++) { m.push(trainRows[t]); m.observe(S.truth[t]); }
  // The lag history has to be carried up to the scoring window or the first
  // estimates are made from a stale column.
  for (let t = fitEnd; t < scoreFrom; t++) m.push(testRows[t]);
  let score = 0, cnt = 0;
  for (let t = scoreFrom; t < scoreTo; t++) {
    m.push(testRows[t]);
    const est = m.estimate();
    if (est) { score += fieldNrmse(est, S.truth[t]); cnt++; }
  }
  return cnt ? score / cnt : NaN;
}

const LPS = [1, 2, 4, 8, 16, 32, 64, 128];
const GRID = [];
for (const cmr of [false, true]) for (const lp of LPS) GRID.push({ lp, cmr, tag: `${cmr ? 'cmr+' : ''}lp${lp}` });
const MODES = ['indep', 'common', 'drift'];

console.log(JSON.stringify({ inlet: `${MODE} ${AMP}`, taps: TAPS, channels: P, locations: K,
  basis: EXPAND ? 'expanded' : 'linear', injectedEta: ETA,
  commissioning: `[0,${COMMISSION_END}) fit [0,${FIT_END}) validate [${FIT_END},${COMMISSION_END})`,
  test: `[${COMMISSION_END},${SAMPLES})` }));

for (const scenario of ['clean commissioning', 'noisy commissioning']) {
  const commEta = scenario === 'clean commissioning' ? 0 : ETA;
  const record = baseRows(commEta, 'indep');

  // ---------------------------------------------------- step 1: measure the noise
  const est = estimateNoise(record, 0, COMMISSION_END);
  console.log(`\n================ ${scenario} ================`);
  console.log(`  measured noise (pressure median, as a fraction of channel spread): ` +
    `${est.pressureMedian.toExponential(2)}   [injected ${commEta}]`);

  // -------------------------- step 2+3: score the grid, plain and stressed
  const stressEta = Math.max(est.pressureMedian, 1e-4);
  const plain = {}, worst = {};
  for (const g of GRID) {
    plain[g.tag] = evaluate(condition(record, g), condition(record, g), FIT_END, FIT_END, COMMISSION_END);
    let w = plain[g.tag];
    for (const mode of MODES) {
      const sr = condition(stress(record, stressEta, mode), g);
      // Fit on the UNSTRESSED conditioned record and meet the stressed one: the
      // stress stands for noise that develops after commissioning.
      w = Math.max(w, evaluate(condition(record, g), sr, FIT_END, FIT_END, COMMISSION_END));
    }
    worst[g.tag] = w;
  }
  const pickPlain = GRID.reduce((a, b) => (plain[b.tag] < plain[a.tag] ? b : a));
  const pickWorst = GRID.reduce((a, b) => (worst[b.tag] < worst[a.tag] ? b : a));
  console.log(`  naive validation picks   ${pickPlain.tag.padEnd(10)} (validation ${plain[pickPlain.tag].toExponential(3)})`);
  console.log(`  worst-case selection     ${pickWorst.tag.padEnd(10)} (worst      ${worst[pickWorst.tag].toExponential(3)})`);

  // ------------------------------------------ evaluate both on the held-out test
  const testOf = (g) => {
    const clean = evaluate(condition(record, g), condition(baseRows(0, 'indep'), g),
      COMMISSION_END, COMMISSION_END, SAMPLES);
    let w = clean;
    for (const mode of MODES) {
      w = Math.max(w, evaluate(condition(record, g),
        condition(baseRows(ETA, mode), g), COMMISSION_END, COMMISSION_END, SAMPLES));
    }
    return { clean, worst: w };
  };
  const oracle = GRID.reduce((a, b) => (testOf(b).worst < testOf(a).worst ? b : a));
  const rows = [
    ['naive validation', pickPlain],
    ['worst-case select', pickWorst],
    ['fixed none', { lp: 1, cmr: false, tag: 'lp1' }],
    ['fixed cmr+lp32', { lp: 32, cmr: true, tag: 'cmr+lp32' }],
    ['ORACLE (test-set)', oracle],
  ];
  console.log(`\n  ${'choice'.padEnd(20)}${'filter'.padEnd(12)}${'test clean'.padStart(12)}${'test worst'.padStart(12)}`);
  for (const [name, g] of rows) {
    const r = testOf(g);
    console.log(`  ${name.padEnd(20)}${g.tag.padEnd(12)}${r.clean.toExponential(3).padStart(12)}` +
      `${r.worst.toExponential(3).padStart(12)}`);
  }
}
