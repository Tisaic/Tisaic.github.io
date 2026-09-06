/**
 * @file RANDOM FEATURES: NONLINEARITY THAT KEEPS THE MODEL LINEAR IN ITS PARAMETERS.
 *
 * THE OWNER'S QUESTION, and it is the right shape for this problem. Project the existing row
 * through random directions, push each through a nonlinearity, and append the results as new
 * features. The map is nonlinear in the STATE and still linear in the WEIGHTS — which is what
 * every cheap thing built this session depends on: the shared-covariance RLS needs one design
 * matrix, and the explicit gain collapses the QP to a fixed row ONLY because the whole path is
 * affine. A structured nonlinear model forfeits both; this one forfeits neither.
 *
 * IT IS ALSO NOT WHAT WAS TRIED AND FAILED. The record reads "more state is measured and dead:
 * the state was always in the row, the licence to use different weights per regime is what was
 * missing", and the quadratic and pose-scheduled dictionaries took the joint corner record from
 * 0.857 to −1.7. Those are STRUCTURED interactions — a fixed, hand-chosen product basis — fitted
 * across two regimes with one weight set. Random features are a different object: they span
 * arbitrary smooth functions in the limit and degrade gracefully under ridge rather than
 * fighting for the same coefficients. Whether that distinction survives contact with this
 * machine is the measurement, and the honest prior is the recorded null.
 *
 * SCORED WHERE THE MACHINE ACTUALLY FAILS. The sharp square is a FORECAST failure and the
 * numbers are on record: held-out lead-0 R² 0.701 / **−0.105**, the elbow worse than predicting
 * the mean with a residual exceeding the truth's. So the test is that cell, on rows from an
 * OPEN-LOOP run where `eFree` is the truth exactly, fitted on one program and scored on
 * another — never on the record it was fitted to (rule 36).
 *
 * MATCHED CAPACITY IS THE CONTROL THAT MAKES IT READABLE (rule 20), AND THE FIRST VERSION OF
 * THAT CONTROL WAS BROKEN. It permuted which INPUT DIMENSION each random weight multiplied — and
 * with i.i.d. Gaussian weights `w·(Pz)` has the SAME DISTRIBUTION as `w·z`, so the control was
 * statistically identical to the treatment. It duly "beat" it (elbow 0.710 against 0.657 at
 * m=32), which is the instrument failing before the model.
 *
 * The control has to break the alignment with the TARGET, not the arrangement of the inputs. So
 * the columns are shuffled across TIME: same marginals, same count, same ridge, no relationship
 * to what is being predicted. What that measures is how much held-out R² a set of m nuisance
 * columns buys through the fit alone, which is exactly the quantity a capacity claim needs.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_randfeat.mjs
 */
import { solveRidge } from '../lib/pilot/pilot.js';
import { commissionArm, recordOpenLoop } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const TRAIN = process.env.TRAIN || 'sharp';
const TEST = process.env.TEST || 'diamond';
const FEED = +(process.env.FEED || 4e-3);
const MS = (process.env.MS || '0,32,64,128').split(',').map(Number);
// NONZEROS PER PROJECTION. 0 means dense (every input), which is what the first pass measured
// and what does not fit: a dense 64-projection of a 72-wide block is 4,608 MAC per channel,
// 92% of the whole PLC budget on the projection alone. A SPARSE projection keeps the
// Johnson-Lindenstrauss property the whole random-feature argument rests on while costing `nnz`
// per row instead of `nBase`, so this sweeps the axis that decides whether the lift can ship.
const NNZ = (process.env.NNZ || '0,16,8,4').split(',').map(Number);
const RIDGE = +(process.env.RIDGE || 1e-5);

const mkRnd = (s) => { let z = s >>> 0; return () => { z ^= z << 13; z >>>= 0; z ^= z >> 17; z ^= z << 5; z >>>= 0; return z / 4294967296; }; };

console.log(`\nrandom features on the linear row — K ${PG.K} / E ${PG.E}`);
console.log(`  fitted on ${TRAIN}, scored on ${TEST}, feed ${FEED.toExponential(1)}\n`);

const p = await commissionArm({ seed: 1, uCap: 0.6, train: { shape: TRAIN, feed: FEED },
  extra: { forceBasis: 'linear' } });
const S = p.sample, ro = p.readouts[0], stride = ro.stride, mLag = ro.mLag;
const tr = await recordOpenLoop(p, TRAIN, FEED);
let te;
try { te = await recordOpenLoop(p, TEST, FEED); }
catch { console.log(`  (${TEST} unavailable — scoring on the circle instead)`); te = await recordOpenLoop(p, 'circle', FEED); }
const NX = tr.x[0].length, NC = tr.e[0].length;
console.log(`  ${tr.e.length} train rows, ${te.e.length} held out; `
  + `mLag ${mLag} x stride ${stride} over ${NX} signals\n`);

// The LINEAR row: the pilot's own state block, which is the part that is lead-independent and
// therefore the part a random feature of it would also fold under.
const lin = (r, k) => {
  const row = [];
  for (let i = 0; i < mLag; i++) {
    const j = Math.max(0, k - i * stride);
    for (let c = 0; c < NX; c++) row.push(r.x[j][c]);
  }
  return row;
};
const K0 = mLag * stride;
const nBase = mLag * NX;
// STANDARDISED BEFORE PROJECTION, because a random direction through raw signals is dominated by
// whichever channel happens to carry the largest units — the projection would be random in name
// and a scale readout in fact (rule 32).
const mu = new Float64Array(nBase), sd = new Float64Array(nBase).fill(1);
{
  let n = 0;
  for (let k = K0; k < tr.e.length; k++) { const r = lin(tr, k); for (let j = 0; j < nBase; j++) mu[j] += r[j]; n++; }
  for (let j = 0; j < nBase; j++) mu[j] /= n;
  const v = new Float64Array(nBase);
  for (let k = K0; k < tr.e.length; k++) { const r = lin(tr, k); for (let j = 0; j < nBase; j++) v[j] += (r[j] - mu[j]) ** 2; }
  for (let j = 0; j < nBase; j++) sd[j] = Math.max(1e-12, Math.sqrt(v[j] / n));
}
const r2 = (pred, act) => {
  const m = act.reduce((a, v) => a + v, 0) / act.length;
  let ss = 0, st = 0;
  for (let i = 0; i < act.length; i++) { ss += (act[i] - pred[i]) ** 2; st += (act[i] - m) ** 2; }
  return 1 - ss / Math.max(1e-30, st);
};

const BUDGET = 10000;
console.log(`  m     nnz   proj MAC   %budget    ch0      ch1     (control ch0 / ch1)`);
for (const m of MS) {
  for (const nnz of (m === 0 ? [0] : NNZ)) {
  const ctrl = {};
  for (const shuffled of (m === 0 ? [false] : [false, true])) {
    // RANDOM FOURIER FEATURES: cos(w·z + b) with w ~ N(0, gamma) and b ~ U[0, 2pi), which is the
    // standard unbiased approximation to a Gaussian kernel. The projection is FROZEN — it is part
    // of the model, drawn once at commissioning and never redrawn, or the deployed map would not
    // be the fitted one.
    const rnd = mkRnd(m * 7919 + (shuffled ? 13 : 0));
    const gauss = () => { let u = 0, v2 = 0; while (u === 0) u = rnd(); while (v2 === 0) v2 = rnd();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v2); };
    // SPARSE OR DENSE. `nnz` nonzeros drawn without replacement, scaled by sqrt(nBase/nnz) so the
    // projection's variance matches the dense one — otherwise a sparse row is simply a quieter
    // row and the comparison reads bandwidth as sparsity (rule 32).
    const W = [], B = [], IDX = [];
    const nz = nnz > 0 ? Math.min(nnz, nBase) : nBase;
    const gamma = (1 / Math.sqrt(nBase)) * Math.sqrt(nBase / nz);
    for (let q = 0; q < m; q++) {
      const pick = Array.from({ length: nBase }, (_, j) => j);
      for (let j = nBase - 1; j > 0; j--) { const t = Math.floor(rnd() * (j + 1)); [pick[j], pick[t]] = [pick[t], pick[j]]; }
      const idx = pick.slice(0, nz);
      const w = new Float64Array(nz);
      for (let j = 0; j < nz; j++) w[j] = gauss() * gamma;
      W.push(w); IDX.push(idx); B.push(rnd() * 2 * Math.PI);
    }
    // The feature values themselves, computed honestly for every row.
    const feats = (r, k) => {
      const b = lin(r, k);
      const z = new Float64Array(nBase);
      for (let j = 0; j < nBase; j++) z[j] = (b[j] - mu[j]) / sd[j];
      const f = new Float64Array(m);
      for (let q = 0; q < m; q++) {
        let s2 = B[q];
        const w = W[q], ix = IDX[q];
        for (let j = 0; j < w.length; j++) s2 += w[j] * z[ix[j]];
        f[q] = Math.cos(s2);
      }
      return { b, f };
    };
    // THE CONTROL SHUFFLES ACROSS TIME. Each record's random-feature block is permuted by row, so
    // every column keeps its exact marginal distribution and loses its alignment with the target.
    // Identical count, identical scale, no information — which is the only shuffle that measures
    // capacity rather than re-drawing the same object.
    const rowsOf = (r) => {
      const out = [];
      for (let k = K0; k < r.e.length; k++) out.push(feats(r, k));
      if (shuffled && m > 0) {
        const idx = out.map((_, i) => i);
        for (let j = idx.length - 1; j > 0; j--) { const t = Math.floor(rnd() * (j + 1)); [idx[j], idx[t]] = [idx[t], idx[j]]; }
        const fs = out.map((o) => o.f);
        out.forEach((o, i) => { o.f = fs[idx[i]]; });
      }
      return out.map((o) => [...o.b, ...o.f, 1]);
    };
    const Xtr = rowsOf(tr), Xte = rowsOf(te);
    const w = [];
    for (let c = 0; c < NC; c++) {
      const y = [];
      for (let k = K0; k < tr.e.length; k++) y.push(tr.e[k][c]);
      w.push(solveRidge(Xtr, y, RIDGE));
    }
    const pr = [], ac = [];
    for (let c = 0; c < NC; c++) { pr.push([]); ac.push([]); }
    for (let i = 0; i < Xte.length; i++) {
      const rr = Xte[i];
      for (let c = 0; c < NC; c++) {
        let s2 = 0; for (let j = 0; j < rr.length; j++) s2 += w[c][j] * rr[j];
        pr[c].push(s2); ac[c].push(te.e[K0 + i][c]);
      }
    }
    const sc = ac.map((a, c) => r2(pr[c], a));
    if (shuffled) { ctrl.v = sc; continue; }
    ctrl.real = sc; ctrl.m = m; ctrl.nnz = nz;
  }
  // The projection is evaluated ONCE per cycle for both channels, because the state block it
  // reads is identical at every lead — the same property that lets it fold.
  const proj = ctrl.m ? ctrl.m * ctrl.nnz * 2 : 0;
  const tag = m === 0 ? 'linear' : `${m}`;
  console.log(`  ${tag.padStart(5)} ${(m === 0 ? '—' : String(ctrl.nnz)).padStart(4)}  `
    + `${String(proj).padStart(8)}  ${(100 * proj / BUDGET).toFixed(0).padStart(6)}%  `
    + `${ctrl.real.map((v) => v.toFixed(3).padStart(7)).join('  ')}`
    + (ctrl.v ? `     ${ctrl.v.map((v) => v.toFixed(3)).join(' / ')}` : ''));
  }
}
console.log(`\n  a lift that does not survive the shuffle is capacity, not nonlinearity (rule 20).`);
console.log(`  the projection is frozen at commissioning: it is part of the model, not noise.\n`);
