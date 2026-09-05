/**
 * @file A RECURSIVE FORECAST AGAINST THE DIRECT FIR BANK — the measurement that decides whether
 * a generic state space can carry what the lag window cannot.
 *
 * THE STRUCTURAL CLAIM. The pilot's forecast is FIR and DIRECT: for each lead it fits
 * y[k+l] = w·[lagged measured signals]. An FIR window's memory IS its length, and this arm's
 * elbow has a measured memory of 6363-8649 steps — longer than a program lap — so the window
 * truncates it and closed paths alias it (plan §41's twenty falsifiers, rule 37). A RECURSIVE
 * model has no such limit: one pole near 1 is a long time constant in a single coefficient, so a
 * few states reach arbitrarily far.
 *
 * AND IT DOES NOT CONTRADICT THE RECORDED NULL. "Feeding the correction u and the ERROR back in
 * as regressors does nothing — unchanged on EMPS, WORSE on the tank — because lagged truth is
 * already spanned." That is lagged truth as one more COLUMN of a DIRECT predictor, which is an
 * FIR model with an extra input. ITERATING a recursive model to lead l is a different object,
 * and the difference is exactly the memory: the direct bank sees only what is in its window,
 * the iterated one carries state forward from before it.
 *
 * NOTHING HERE IS PLANT KNOWLEDGE. Both models are fitted from the signals the pilot already
 * routes — measured channels in, truth out — with no K, no E, no structure and nothing the
 * engineer declares. That is the standing constraint and it is what makes this route admissible
 * where the compiled twin is not.
 *
 * MATCHED CAPACITY, MATCHED DATA, ONE VARIABLE (rule 20): both fitted on the SAME record with the
 * same ridge, both scored on a program neither has seen, and the FIR bank is given the pilot's
 * own window and stride rather than a handicapped one.
 *
 * WHAT WOULD KILL IT: the recursive model no better held-out than the FIR bank at long leads.
 * Then the window is not what limits the forecast, the memory argument is wrong, and the search
 * goes back to what the forecast is actually missing.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_ssforecast.mjs
 */
import { solveRidge } from '../lib/pilot/pilot.js';
import { commissionArm, recordOpenLoop } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const TRAIN = process.env.TRAIN || 'rounded';
const TEST = process.env.TEST || 'circle';
const FEED = +(process.env.FEED || 4e-3);
const RIDGE = +(process.env.RIDGE || 1e-6);
const NA = +(process.env.NA || 6);          // autoregressive order of the recursive model
const NB = +(process.env.NB || 6);          // input order of the recursive model

console.log(`\na recursive forecast against the direct FIR bank — K ${PG.K} / E ${PG.E}`);
console.log(`  fitted on ${TRAIN}, scored on ${TEST}, feed ${FEED.toExponential(1)}\n`);

// The pilot is commissioned only to inherit its OWN window, stride and lead grid, so the FIR
// side of this comparison is the shipped configuration and not a strawman.
const p = await commissionArm({ seed: 1, uCap: 0.6, train: { shape: TRAIN, feed: FEED } });
const ro = p.readouts[0];
const S = p.sample, stride = ro.stride, mLag = ro.w[0] ? null : null;
console.log(`  the pilot's own forecast: sample ${S}, stride ${stride}, `
  + `${ro.w.length} leads, ${ro.w[0].length} features`);

const rec = await recordOpenLoop(p, TRAIN, FEED);
const tst = await recordOpenLoop(p, TEST, FEED);
console.log(`  records: ${rec.e.length} train samples, ${tst.e.length} held-out\n`);

const NC = rec.e[0].length, NX = rec.x[0].length;
// LEADS IN SAMPLES, spanning the pilot's own horizon so the comparison is over the range the QP
// actually uses rather than a range chosen to flatter one model.
const LEADS = [1, 2, 4, 8, 16, 32, 64].filter((l) => l < 200);

// ---- the DIRECT FIR bank: y[k+l] = w · [lagged measured], one fit per lead, as shipped.
const firRow = (r, k, nLag) => {
  const row = [];
  for (let i = 0; i < nLag; i++) {
    const j = Math.max(0, k - i * stride);
    for (let c = 0; c < NX; c++) row.push(r.x[j][c]);
  }
  row.push(1);
  return row;
};
const NLAG = 12;
// ---- the RECURSIVE model: one one-step fit per channel, then ITERATED to each lead.
//      y[k+1] = sum_{i<NA} a_i y[k-i] + sum_{j<NB} b_j m[k-j] + d
const fitRec = (ch) => {
  const X = [], y = [];
  for (let k = Math.max(NA, NB); k < rec.e.length - 1; k++) {
    const row = [];
    for (let i = 0; i < NA; i++) for (let c = 0; c < NC; c++) row.push(rec.e[k - i][c]);
    for (let j = 0; j < NB; j++) for (let c = 0; c < NX; c++) row.push(rec.x[k - j][c]);
    row.push(1);
    X.push(row); y.push(rec.e[k + 1][ch]);
  }
  return solveRidge(X, y, RIDGE);
};
const recW = Array.from({ length: NC }, (_, c) => fitRec(c));

const r2 = (pred, act) => {
  const m = act.reduce((a, v) => a + v, 0) / act.length;
  let ss = 0, st = 0;
  for (let i = 0; i < act.length; i++) { ss += (act[i] - pred[i]) ** 2; st += (act[i] - m) ** 2; }
  return 1 - ss / Math.max(1e-30, st);
};

// THE SIMULATION, RUN ONCE over the held-out record. Nothing but measured signals enters it.
const simState = [];
{
  let hist = Array.from({ length: NA }, () => new Array(NC).fill(0));
  for (let k = 0; k < tst.e.length; k++) {
    simState.push(hist.map((v) => Array.from(v)));
    const nxt = [];
    for (let c = 0; c < NC; c++) {
      const rw = [];
      for (let i = 0; i < NA; i++) for (let cc = 0; cc < NC; cc++) rw.push(hist[i][cc]);
      for (let j = 0; j < NB; j++) {
        const idx = Math.min(tst.x.length - 1, Math.max(0, k - j));
        for (let cc = 0; cc < NX; cc++) rw.push(tst.x[idx][cc]);
      }
      rw.push(1);
      let sm = 0; for (let i = 0; i < rw.length; i++) sm += recW[c][i] * rw[i];
      nxt.push(sm);
    }
    hist = [nxt, ...hist.slice(0, NA - 1)];
  }
}
// AND ITS OWN ONE-STEP QUALITY AS A SIMULATOR, reported before any lead table: a simulation
// that has drifted is not forecasting at any lead, and a drift is invisible in a per-lead R^2
// taken relative to that lead's own mean.
{
  const sp = [], sa = [];
  for (let c = 0; c < NC; c++) { sp.push([]); sa.push([]); }
  for (let k = 1; k < tst.e.length; k++) {
    for (let c = 0; c < NC; c++) { sp[c].push(simState[k][0][c]); sa[c].push(tst.e[k][c]); }
  }
  console.log(`  the recursive model run as a PURE SIMULATOR over the held-out record `
    + `(no truth injected): R^2 ${sa.map((a, c) => r2(sp[c], a).toFixed(3)).join(' / ')}\n`);
}
console.log(`  lead   FIR bank (${NLAG} lags x ${stride} stride)   recursive (na ${NA}, nb ${NB})`);
console.log(`  ${'(samples)'.padEnd(8)} ch0      ch1              ch0      ch1`);
for (const l of LEADS) {
  const fir = [], rc = [], act = [];
  for (let c = 0; c < NC; c++) { fir.push([]); rc.push([]); act.push([]); }
  // fit the FIR bank for this lead on the training record
  const wF = [];
  for (let c = 0; c < NC; c++) {
    const X = [], y = [];
    for (let k = NLAG * stride; k < rec.e.length - l; k++) { X.push(firRow(rec, k, NLAG)); y.push(rec.e[k + l][c]); }
    wF.push(solveRidge(X, y, RIDGE));
  }
  for (let k = Math.max(NLAG * stride, NA, NB); k < tst.e.length - l; k++) {
    // FIR: one dot product per channel
    const row = firRow(tst, k, NLAG);
    for (let c = 0; c < NC; c++) {
      let s = 0; for (let i = 0; i < row.length; i++) s += wF[c][i] * row[i];
      fir[c].push(s);
    }
    // RECURSIVE, SEEDED FROM ITS OWN SIMULATION — never from the truth.
    //
    // The first version of this seeded `hist` from `tst.e[k-i]`, the actual error, and that is
    // the TRACKER. Truth is an installation property the pilot refuses to assume at deploy, so
    // seeding from it compares a model that has the tracker against one that does not — the
    // wrong comparison at unmatched information (rule 20), and it read elbow 0.840 -> 0.999.
    //
    // `simState` is the same model run as a pure SIMULATOR from the start of the held-out
    // record: measured signals in, its own predictions carried forward, the truth never
    // injected. That is what a deployed state space actually is, and it is the only version of
    // this whose number means anything for the standard installation.
    const hist = simState[k].map((v) => Array.from(v));
    for (let step = 0; step < l; step++) {
      const kk = k + step;
      const nxt = [];
      for (let c = 0; c < NC; c++) {
        const rw = [];
        for (let i = 0; i < NA; i++) for (let cc = 0; cc < NC; cc++) rw.push(hist[i][cc]);
        for (let j = 0; j < NB; j++) {
          const idx = Math.min(tst.x.length - 1, Math.max(0, kk - j));
          for (let cc = 0; cc < NX; cc++) rw.push(tst.x[idx][cc]);
        }
        rw.push(1);
        let s = 0; for (let i = 0; i < rw.length; i++) s += recW[c][i] * rw[i];
        nxt.push(s);
      }
      hist.unshift(nxt); hist.pop();
    }
    for (let c = 0; c < NC; c++) rc[c].push(hist[0][c]);
    for (let c = 0; c < NC; c++) act[c].push(tst.e[k + l][c]);
  }
  const f = act.map((a, c) => r2(fir[c], a));
  const g = act.map((a, c) => r2(rc[c], a));
  console.log(`  ${String(l).padStart(4)}    ${f.map((v) => v.toFixed(3).padStart(7)).join('  ')}`
    + `          ${g.map((v) => v.toFixed(3).padStart(7)).join('  ')}`);
}
console.log(`\n  the FIR bank sees only what is inside its window; the recursive model carries`);
console.log(`  state from before it. If they are equal at long leads the memory argument is`);
console.log(`  wrong and the window is not what limits this forecast.\n`);
