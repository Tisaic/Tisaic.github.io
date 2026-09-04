// IS THE ROW'S COLUMN SCALE COSTING THE FIT? — the owner's question, put to held-out data first.
//
// THE QUESTION. Nothing in `lib/pilot/pilot.js` normalises the forecast row. `_colScale` looks
// like it does and does not: it is a PENALTY multiplier, 1 on the base block and 100 on the rich
// ones. `solveRidge` then sets ONE global penalty from the largest diagonal of X'X and adds it to
// every column. So a column an order below its neighbours is penalised an order harder relative to
// its own energy, and this project has paid for that four separate times — `cmdFine` ("ridged into
// irrelevance and measured EXACTLY the baseline, free but unused"), the AFM prior at P0 = 1e-6,
// the ideal-correction map's change #1, and `cmdFeat` today.
//
// THE ROW IS NOT IN FAMILY. Measured on the arm's six routed signals: q1 7.67e-1, q2 2.06e+0,
// w1 2.65e-1, w2 3.09e-1, tau1 2.26e-1, tau2 4.97e-2 — a 41x spread, and the SMALLEST is the
// elbow torque. The elbow is also the channel this project has repeatedly measured as the one
// that will not forecast (sharp 0.701/-0.105, worse than predicting the mean). That may be a
// coincidence and it may be the whole story; only a measurement separates them.
//
// AND `_tauabl.mjs` SHARPENED IT. Withholding BOTH torque channels and their whole lag block --
// 43 of 176 columns -- costs 3.3%. Either torque carries almost nothing about the free error, or
// torque is being shrunk to nothing because it is the smallest column. Scaling tells them apart.
//
// THE TEST NEEDS NO LIBRARY CHANGE, WHICH IS WHY IT RUNS FIRST (rule 1). Standardising column i by
// its rms s_i and solving is ALGEBRAICALLY IDENTICAL to leaving the columns raw and setting the
// per-column penalty proportional to that column's own energy: with A_ii ~ m*s_i^2, standardised
// ridge adds lam'*1 to each A'_ii = A_ii/s_i^2, which is lam'*s_i^2 added to A_ii, i.e.
// `colScale[i] proportional to A[i][i]`. `solveRidge` already takes `colScale`. So the whole
// experiment is one vector, and the pilot's OWN `_buildXY` supplies the rows -- no second copy of
// the row builder, which is the fault this rig exists to prevent.
//
// FOUR SCALINGS, AND TWO OF THEM ARE CONTROLS:
//   pilot      exactly what ships: 1 on base, 100 on rich. MUST reproduce the pilot's own
//              validation numbers, or the harness is not fitting what the pilot fits.
//   flat       1 everywhere -- isolates the rich-block prior from the scaling question, since
//              otherwise "standardised" changes two things at once (rule 20).
//   std        colScale ∝ A_ii within each block, renormalised so the block's MEAN penalty is
//              what it was. That keeps the 100x rich prior intact and changes only the
//              DISTRIBUTION of penalty inside a block, which is the one variable under test.
//   std-flat   the same, with the rich prior removed, so both halves are readable.
//
// R^2 IS NOT THE RESULT (rule 16) -- a number computed from the model cannot check the model, and
// this project has fitted deflection at held-out R^2 0.84 and made the machine WORSE. This file
// decides only whether the machine measurement is worth its wall clock: no movement in held-out
// residual here and the idea is dead cheaply; movement here and the library work is justified.
import { commissionArm, PG } from './pilot/rigs/arm-rig.mjs';
import { solveRidge } from '../lib/pilot/pilot.js';

const FEED = +(process.env.RS_FEED || 0.004);
const UCAP = +(process.env.RS_UCAP || 0.6);

const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
console.log(`  Ts ${pilot.Ts}, sample ${pilot.sample}, N ${pilot.N}, nm ${pilot.nm}`);

const r2 = (X, y, w) => {
  let ss = 0, tt = 0, mu = 0;
  for (const v of y) mu += v; mu /= y.length;
  for (let i = 0; i < X.length; i++) {
    let p = 0; const row = X[i];
    for (let j = 0; j < row.length; j++) p += row[j] * w[j];
    ss += (y[i] - p) ** 2; tt += (y[i] - mu) ** 2;
  }
  return 1 - ss / (tt || 1);
};

// THE FIT ROWS COME FROM THE PILOT ITSELF at the configuration it CHOSE, so this measures the
// shipped model rather than a plausible one.
for (let c = 0; c < pilot.nc; c++) {
  const ro = pilot.readouts[c];
  const ch = pilot._fit && pilot._fit.chosen ? pilot._fit.chosen[c] : null;
  const stride = (ch && ch.stride) || pilot.stride || 1;
  const L = 0;                                   // lead 0 -- the lead the machine is scored at
  const { X, y } = pilot._buildXY(c, L, stride, 1,
    ch ? ch.poly : false, ch ? ch.mLag : null, ch ? ch.fLag : null,
    ch ? ch.sched : false, (ch && ch.longR) || null);
  const n = X[0].length, m = X.length;
  const nB = X[0].nBase !== undefined ? X[0].nBase : n;

  // COLUMN ENERGIES, which is the diagnostic the question is really about.
  const diag = new Float64Array(n);
  for (const row of X) for (let j = 0; j < n; j++) diag[j] += row[j] * row[j];
  let lo = Infinity, hi = 0, loJ = 0, hiJ = 0;
  for (let j = 1; j < n; j++) {                  // column 0 is the constant
    const s = Math.sqrt(diag[j] / m);
    if (s > 0 && s < lo) { lo = s; loJ = j; }
    if (s > hi) { hi = s; hiJ = j; }
  }
  console.log(`\n  channel ${c}: ${m} rows, ${n} cols (${nB} base)`);
  console.log(`    column rms spans ${lo.toExponential(2)} (col ${loJ}) to ${hi.toExponential(2)}`
    + ` (col ${hiJ}) — a factor of ${(hi / lo).toExponential(2)}`);

  // A HELD-OUT SPLIT BY TIME, not at random: neighbouring rows share a window and a random split
  // scores a model on rows it has all but seen (rule 36's failure by another route).
  const cut = Math.floor(m * 0.7);
  const Xtr = X.slice(0, cut), ytr = y.slice(0, cut);
  const Xte = X.slice(cut), yte = y.slice(cut);
  const dtr = new Float64Array(n);
  for (const row of Xtr) for (let j = 0; j < n; j++) dtr[j] += row[j] * row[j];

  const mkStd = (rich) => {
    // PENALTY PROPORTIONAL TO EACH COLUMN'S OWN ENERGY, renormalised per block so the BLOCK's
    // mean penalty is unchanged — otherwise this row would also be changing the overall ridge
    // strength and the comparison would be two variables (rule 20).
    const s = new Float64Array(n);
    for (const [a, b, base] of [[0, nB, 1], [nB, n, rich]]) {
      if (b <= a) continue;
      let mean = 0;
      for (let j = a; j < b; j++) mean += dtr[j];
      mean /= (b - a);
      for (let j = a; j < b; j++) s[j] = mean > 0 ? base * (dtr[j] / mean) : base;
    }
    return Array.from(s);
  };
  const MODES = {
    pilot: Array.from({ length: n }, (_, j) => (j < nB ? 1 : 100)),
    flat: Array.from({ length: n }, () => 1),
    std: mkStd(100),
    'std-flat': mkStd(1),
  };
  console.log('    scaling      best ridge     held-out R^2    residual var');
  for (const [name, cs] of Object.entries(MODES)) {
    let best = null;
    for (const ridge of [1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1]) {
      const w = solveRidge(Xtr, ytr, ridge, cs);
      const v = r2(Xte, yte, w);
      if (!best || v > best.v) best = { v, ridge };
    }
    console.log(`    ${name.padEnd(12)} ${best.ridge.toExponential(0).padStart(8)}`
      + `   ${best.v.toFixed(5).padStart(12)}    ${(1 - best.v).toExponential(3).padStart(12)}`);
  }
}
console.log('\nEXIT 0');
