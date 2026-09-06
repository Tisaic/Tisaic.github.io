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
 * MATCHED CAPACITY IS THE CONTROL THAT MAKES IT READABLE (rule 20). A richer basis that wins
 * because it has more parameters has shown nothing, so the linear row is also offered the SAME
 * number of extra columns filled with random features of SHUFFLED inputs — a capacity control
 * that cannot carry information. A lift over plain linear that does not survive the shuffle is
 * capacity, not nonlinearity.
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

console.log(`  m      plain                       shuffled control (capacity)`);
console.log(`  ${''.padEnd(6)} ch0      ch1                ch0      ch1`);
for (const m of MS) {
  for (const shuffled of (m === 0 ? [false] : [false, true])) {
    // RANDOM FOURIER FEATURES: cos(w·z + b) with w ~ N(0, gamma) and b ~ U[0, 2pi), which is the
    // standard unbiased approximation to a Gaussian kernel. The projection is FROZEN — it is part
    // of the model, drawn once at commissioning and never redrawn, or the deployed map would not
    // be the fitted one.
    const rnd = mkRnd(m * 7919 + (shuffled ? 13 : 0));
    const gauss = () => { let u = 0, v2 = 0; while (u === 0) u = rnd(); while (v2 === 0) v2 = rnd();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v2); };
    const W = [], B = [];
    const gamma = 1 / Math.sqrt(nBase);
    for (let q = 0; q < m; q++) {
      const w = new Float64Array(nBase);
      for (let j = 0; j < nBase; j++) w[j] = gauss() * gamma;
      W.push(w); B.push(rnd() * 2 * Math.PI);
    }
    // The shuffled control permutes which STANDARDISED input each projection weight multiplies,
    // per projection, so the columns have identical distribution and carry no relationship to
    // the target. Same count, same scale, no information.
    const perm = [];
    if (shuffled) for (let q = 0; q < m; q++) {
      const a = Array.from({ length: nBase }, (_, j) => j);
      for (let j = nBase - 1; j > 0; j--) { const t = Math.floor(rnd() * (j + 1)); [a[j], a[t]] = [a[t], a[j]]; }
      perm.push(a);
    }
    const row = (r, k) => {
      const b = lin(r, k);
      const z = new Float64Array(nBase);
      for (let j = 0; j < nBase; j++) z[j] = (b[j] - mu[j]) / sd[j];
      const out = b.slice();
      for (let q = 0; q < m; q++) {
        let s2 = B[q];
        const w = W[q], pm = shuffled ? perm[q] : null;
        for (let j = 0; j < nBase; j++) s2 += w[j] * z[pm ? pm[j] : j];
        out.push(Math.cos(s2));
      }
      out.push(1);
      return out;
    };
    const w = [];
    for (let c = 0; c < NC; c++) {
      const X = [], y = [];
      for (let k = K0; k < tr.e.length; k++) { X.push(row(tr, k)); y.push(tr.e[k][c]); }
      w.push(solveRidge(X, y, RIDGE));
    }
    const pr = [], ac = [];
    for (let c = 0; c < NC; c++) { pr.push([]); ac.push([]); }
    for (let k = K0; k < te.e.length; k++) {
      const rr = row(te, k);
      for (let c = 0; c < NC; c++) {
        let s2 = 0; for (let i = 0; i < rr.length; i++) s2 += w[c][i] * rr[i];
        pr[c].push(s2); ac[c].push(te.e[k][c]);
      }
    }
    const sc = ac.map((a, c) => r2(pr[c], a));
    const tag = m === 0 ? 'linear' : `${shuffled ? 'shuf' : 'rand'} ${m}`;
    console.log(`  ${tag.padEnd(9)} ${sc.map((v) => v.toFixed(3).padStart(7)).join('  ')}`);
  }
}
console.log(`\n  a lift that does not survive the shuffle is capacity, not nonlinearity (rule 20).`);
console.log(`  the projection is frozen at commissioning: it is part of the model, not noise.\n`);
