/**
 * @file A DRAWN HIDDEN LAYER AGAINST A TRAINED ONE — seeds on both, on the channel that fails.
 *
 * Random features buy real nonlinearity here: with a control that shuffles the feature columns
 * across TIME the control sits flat at the linear baseline in every cell, so a lift is not
 * capacity. The elbow — the channel whose held-out forecast fails on the sharp square — reached
 * 0.685 against a linear 0.539 at 10% of the PLC budget. But adding the sparsity axis moved the
 * RNG stream and the same dense cell read 0.881/0.738 then 0.789/0.508, so the DRAW variance is
 * comparable to the effect and no single cell of that table is a result.
 *
 * SO THIS RUNS SEEDS, which is the discipline this repository has a plant-sized scar from
 * skipping — the tank's 1.32x turned out to be a coin flip across exactly this kind of draw.
 * Reported as median and full range rather than a mean, because what matters is whether the WORST
 * draw still beats linear: a basis that helps on average and harms on a third of commissionings
 * is not shippable on a machine that gets one commissioning.
 *
 * AND IT PUTS A SMALL TRAINED NETWORK BESIDE IT, because the two differ in exactly one thing —
 * whether the hidden layer is DRAWN or FITTED — and that one thing is what it costs:
 *
 *   drawn   nonlinear, QP collapse intact, shared-covariance RLS intact, convex fit
 *   trained nonlinear, QP collapse intact, RLS LOST (needs linear-in-weights), fit non-convex
 *
 * The QP collapse survives both, which is worth stating because it is not obvious: `u0 = k·f0`
 * needs the SOLVER affine in the free response, and is indifferent to how `f0` was computed. So
 * the trained layer forfeits the cheap adaptation and the lead-independent fold, and nothing
 * else. It has to be enough better to be worth that, and this measures whether it is.
 *
 * BOTH ARE SCORED THE SAME WAY: same records, same standardisation, same held-out program, same
 * ridge on the readout, one variable (rule 20). The network gets an internal validation split and
 * early stopping, because a net trained to convergence on 3,000 rows and scored held-out would be
 * measuring the optimiser's patience rather than the basis.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_nlbasis.mjs
 */
import { solveRidge } from '../lib/pilot/pilot.js';
import { commissionArm, recordOpenLoop } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const TRAIN = process.env.TRAIN || 'sharp';
const TEST = process.env.TEST || 'circle';
const FEED = +(process.env.FEED || 4e-3);
const SEEDS = +(process.env.SEEDS || 8);
const M = +(process.env.M || 32), NNZ = +(process.env.NNZ || 16);
const HID = (process.env.HID || '8,16').split(',').map(Number);
const RIDGE = 1e-5;

const mkRnd = (s) => { let z = (s >>> 0) || 1; return () => { z ^= z << 13; z >>>= 0; z ^= z >> 17; z ^= z << 5; z >>>= 0; return z / 4294967296; }; };

console.log(`\ndrawn against trained — K ${PG.K} / E ${PG.E}, fit ${TRAIN}, held out ${TEST}\n`);
const p = await commissionArm({ seed: 1, uCap: 0.6, train: { shape: TRAIN, feed: FEED },
  extra: { forceBasis: 'linear' } });
const ro = p.readouts[0], stride = ro.stride, mLag = ro.mLag;
const tr = await recordOpenLoop(p, TRAIN, FEED);
const te = await recordOpenLoop(p, TEST, FEED);
const NX = tr.x[0].length, NC = tr.e[0].length, nBase = mLag * NX, K0 = mLag * stride;

const lin = (r, k) => {
  const row = new Float64Array(nBase);
  let q = 0;
  for (let i = 0; i < mLag; i++) {
    const j = Math.max(0, k - i * stride);
    for (let c = 0; c < NX; c++) row[q++] = r.x[j][c];
  }
  return row;
};
const rowsRaw = (r) => { const o = []; for (let k = K0; k < r.e.length; k++) o.push(lin(r, k)); return o; };
const Rtr = rowsRaw(tr), Rte = rowsRaw(te);
const Ytr = [], Yte = [];
for (let c = 0; c < NC; c++) {
  Ytr.push(Rtr.map((_, i) => tr.e[K0 + i][c]));
  Yte.push(Rte.map((_, i) => te.e[K0 + i][c]));
}
// ONE standardisation, from the TRAIN record only, shared by every basis below.
const mu = new Float64Array(nBase), sd = new Float64Array(nBase).fill(1);
for (const r of Rtr) for (let j = 0; j < nBase; j++) mu[j] += r[j] / Rtr.length;
{ const v = new Float64Array(nBase);
  for (const r of Rtr) for (let j = 0; j < nBase; j++) v[j] += (r[j] - mu[j]) ** 2;
  for (let j = 0; j < nBase; j++) sd[j] = Math.max(1e-12, Math.sqrt(v[j] / Rtr.length)); }
const Ztr = Rtr.map((r) => { const z = new Float64Array(nBase); for (let j = 0; j < nBase; j++) z[j] = (r[j] - mu[j]) / sd[j]; return z; });
const Zte = Rte.map((r) => { const z = new Float64Array(nBase); for (let j = 0; j < nBase; j++) z[j] = (r[j] - mu[j]) / sd[j]; return z; });

const r2 = (pred, act) => {
  const m = act.reduce((a, v) => a + v, 0) / act.length;
  let ss = 0, st = 0;
  for (let i = 0; i < act.length; i++) { ss += (act[i] - pred[i]) ** 2; st += (act[i] - m) ** 2; }
  return 1 - ss / Math.max(1e-30, st);
};
const stat = (a) => { const s = [...a].sort((x, y) => x - y);
  return { med: s[s.length >> 1], lo: s[0], hi: s[s.length - 1] }; };
const fmt = (s) => `${s.med.toFixed(3)} [${s.lo.toFixed(3)}–${s.hi.toFixed(3)}]`;

// ---- LINEAR baseline, no draw in it.
{
  const sc = [];
  for (let c = 0; c < NC; c++) {
    const w = solveRidge(Rtr.map((r) => [...r, 1]), Ytr[c], RIDGE);
    sc.push(r2(Rte.map((r) => { let s = 0; const rr = [...r, 1]; for (let j = 0; j < rr.length; j++) s += w[j] * rr[j]; return s; }), Yte[c]));
  }
  console.log(`  linear                     ch0 ${sc[0].toFixed(3)}          ch1 ${sc[1].toFixed(3)}`);
}

// ---- DRAWN: sparse random Fourier features, SEEDS draws.
{
  const a0 = [], a1 = [];
  for (let s = 0; s < SEEDS; s++) {
    const rnd = mkRnd(1000 + s * 7919);
    const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const W = [], IDX = [], B = [];
    const g = (1 / Math.sqrt(nBase)) * Math.sqrt(nBase / NNZ);
    for (let q = 0; q < M; q++) {
      const pick = Array.from({ length: nBase }, (_, j) => j);
      for (let j = nBase - 1; j > 0; j--) { const t = Math.floor(rnd() * (j + 1)); [pick[j], pick[t]] = [pick[t], pick[j]]; }
      IDX.push(pick.slice(0, NNZ));
      const w = new Float64Array(NNZ); for (let j = 0; j < NNZ; j++) w[j] = gauss() * g;
      W.push(w); B.push(rnd() * 2 * Math.PI);
    }
    const feat = (z) => { const f = new Float64Array(M);
      for (let q = 0; q < M; q++) { let s2 = B[q]; const w = W[q], ix = IDX[q];
        for (let j = 0; j < NNZ; j++) s2 += w[j] * z[ix[j]]; f[q] = Math.cos(s2); } return f; };
    const Xtr = Rtr.map((r, i) => [...r, ...feat(Ztr[i]), 1]);
    const Xte = Rte.map((r, i) => [...r, ...feat(Zte[i]), 1]);
    for (let c = 0; c < NC; c++) {
      const w = solveRidge(Xtr, Ytr[c], RIDGE);
      const sc = r2(Xte.map((rr) => { let s = 0; for (let j = 0; j < rr.length; j++) s += w[j] * rr[j]; return s; }), Yte[c]);
      (c === 0 ? a0 : a1).push(sc);
    }
  }
  console.log(`  drawn m${M}/nnz${NNZ}, ${SEEDS} draws  ch0 ${fmt(stat(a0))}  ch1 ${fmt(stat(a1))}`
    + `   ${M * NNZ * 2} MAC`);
}

// ---- TRAINED: one small net per channel, tanh hidden, linear out, Adam + early stop.
for (const H of HID) {
  const a0 = [], a1 = [];
  for (let s = 0; s < 3; s++) {
    for (let c = 0; c < NC; c++) {
      const rnd = mkRnd(500 + s * 131 + c * 17);
      const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
      // He-ish init on the input layer; the output layer starts at zero so the net begins as the
      // constant mean and cannot start worse than predicting nothing.
      const W1 = Array.from({ length: H }, () => { const w = new Float64Array(nBase);
        for (let j = 0; j < nBase; j++) w[j] = gauss() * Math.sqrt(2 / nBase); return w; });
      const b1 = new Float64Array(H), W2 = new Float64Array(H); let b2 = 0;
      // A VALIDATION SPLIT OUT OF THE TRAINING RECORD, never the held-out program: early stopping
      // read off the scored program would be selecting on the answer.
      const nV = Math.floor(Ztr.length * 0.2), nT = Ztr.length - nV;
      const yMu = Ytr[c].slice(0, nT).reduce((a, v) => a + v, 0) / nT;
      const yS = Math.sqrt(Ytr[c].slice(0, nT).reduce((a, v) => a + (v - yMu) ** 2, 0) / nT) || 1;
      const mW1 = W1.map(() => new Float64Array(nBase)), vW1 = W1.map(() => new Float64Array(nBase));
      const mW2 = new Float64Array(H), vW2 = new Float64Array(H);
      const mb1 = new Float64Array(H), vb1 = new Float64Array(H);
      let mb2 = 0, vb2 = 0, t = 0, best = Infinity, bestW = null, since = 0;
      const lr = 3e-3, b1a = 0.9, b2a = 0.999, eps = 1e-8;
      const fwd = (z) => { const h = new Float64Array(H);
        for (let q = 0; q < H; q++) { let a = b1[q]; const w = W1[q];
          for (let j = 0; j < nBase; j++) a += w[j] * z[j]; h[q] = Math.tanh(a); }
        let o = b2; for (let q = 0; q < H; q++) o += W2[q] * h[q]; return { h, o }; };
      for (let ep = 0; ep < 200 && since < 20; ep++) {
        for (let i = 0; i < nT; i++) {
          const z = Ztr[i], y = (Ytr[c][i] - yMu) / yS;
          const { h, o } = fwd(z);
          const d = o - y; t++;
          const bc1 = 1 - Math.pow(b1a, t), bc2 = 1 - Math.pow(b2a, t);
          const upd = (m, v, gq, set) => { const mm = b1a * m + (1 - b1a) * gq, vv = b2a * v + (1 - b2a) * gq * gq;
            set(mm, vv, lr * (mm / bc1) / (Math.sqrt(vv / bc2) + eps)); };
          for (let q = 0; q < H; q++) {
            const gq = d * h[q];
            upd(mW2[q], vW2[q], gq, (mm, vv, st) => { mW2[q] = mm; vW2[q] = vv; W2[q] -= st; });
            const dh = d * W2[q] * (1 - h[q] * h[q]);
            upd(mb1[q], vb1[q], dh, (mm, vv, st) => { mb1[q] = mm; vb1[q] = vv; b1[q] -= st; });
            const w = W1[q], mw = mW1[q], vw = vW1[q];
            for (let j = 0; j < nBase; j++) {
              const g2 = dh * z[j];
              const mm = b1a * mw[j] + (1 - b1a) * g2, vv = b2a * vw[j] + (1 - b2a) * g2 * g2;
              mw[j] = mm; vw[j] = vv; w[j] -= lr * (mm / bc1) / (Math.sqrt(vv / bc2) + eps);
            }
          }
          upd(mb2, vb2, d, (mm, vv, st) => { mb2 = mm; vb2 = vv; b2 -= st; });
        }
        let vs = 0;
        for (let i = nT; i < Ztr.length; i++) { const { o } = fwd(Ztr[i]); vs += (o * yS + yMu - Ytr[c][i]) ** 2; }
        if (vs < best - 1e-12) { best = vs; since = 0;
          bestW = { W1: W1.map((w) => Float64Array.from(w)), b1: Float64Array.from(b1),
            W2: Float64Array.from(W2), b2 }; } else since++;
      }
      if (bestW) { for (let q = 0; q < H; q++) { W1[q].set(bestW.W1[q]); W2[q] = bestW.W2[q]; }
        b1.set(bestW.b1); b2 = bestW.b2; }
      const pr = Zte.map((z) => fwd(z).o * yS + yMu);
      (c === 0 ? a0 : a1).push(r2(pr, Yte[c]));
    }
  }
  console.log(`  trained h${H}, 3 seeds        ch0 ${fmt(stat(a0))}  ch1 ${fmt(stat(a1))}`
    + `   ${(nBase * H + H) * 2} MAC`);
}
console.log(`\n  the drawn layer keeps the shared-covariance RLS and a convex fit; the trained one`);
console.log(`  forfeits both. Both keep the QP collapse, which needs the SOLVER affine in f0 and`);
console.log(`  is indifferent to how f0 was computed. The worst draw is the number that decides.\n`);
