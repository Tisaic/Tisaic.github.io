// Dense filter class: U_j(k) = sum_o w * acc(k+o) over a dense lag grid (+ level, velocity, bias),
// optionally scheduled on pose. Reports held-out (leave-one-program-out) AND in-sample NRMSE.
import { ilcTables } from '../index.mjs';
const progs = ilcTables().map((t) => ({ name: t.file.replace('.f64', ''), L: t.lap, ref: t.ref, U: t.U }));
const R = +(process.env.R || 800), STEP = +(process.env.STEP || 10), POSE = process.env.POSE || 'none', STRIDE = +(process.env.STRIDE || 5);
const lags = []; for (let o = -R; o <= R; o += STEP) lags.push(o);
for (const p of progs) { // precompute acceleration and velocity per scan (scaled)
  const L = p.L, at = (i, c) => p.ref[2 * (((i % L) + L) % L) + c];
  p.a = new Float64Array(2 * L); p.v = new Float64Array(2 * L);
  for (let k = 0; k < L; k++) for (let c = 0; c < 2; c++) { p.a[2 * k + c] = (at(k + 1, c) - 2 * at(k, c) + at(k - 1, c)) * 1e7; p.v[2 * k + c] = (at(k + 1, c) - at(k - 1, c)) * 1e3; }
}
function feats(p, k, out) {
  const L = p.L, w = (i) => ((i % L) + L) % L;
  const base = [1, p.ref[2 * k], p.ref[2 * k + 1], p.v[2 * k], p.v[2 * k + 1], Math.tanh(p.v[2 * k] * 50), Math.tanh(p.v[2 * k + 1] * 50)];
  for (const o of lags) { const i = w(k + o); base.push(p.a[2 * i], p.a[2 * i + 1]); }
  const q1 = p.ref[2 * k], q2 = p.ref[2 * k + 1];
  const pose = POSE === 'none' ? [1] : [1, Math.cos(q2) - 0.9, Math.sin(q2) - 0.4];
  let n = 0; for (const s of pose) for (const b of base) out[n++] = s * b; return n;
}
const nf = feats(progs[0], 0, new Float64Array(20000)), f = new Float64Array(nf);
function solve(A, b, n) { const M = Float64Array.from(A), x = Float64Array.from(b);
  for (let i = 0; i < n; i++) { for (let j = 0; j <= i; j++) { let s = M[i * n + j]; for (let t = 0; t < j; t++) s -= M[i * n + t] * M[j * n + t]; if (i === j) M[i * n + i] = Math.sqrt(Math.max(s, 1e-300)); else M[i * n + j] = s / M[j * n + j]; } }
  for (let i = 0; i < n; i++) { let s = x[i]; for (let t = 0; t < i; t++) s -= M[i * n + t] * x[t]; x[i] = s / M[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let t = i + 1; t < n; t++) s -= M[t * n + i] * x[t]; x[i] = s / M[i * n + i]; } return x; }
const G = progs.map((p) => { const XtX = new Float64Array(nf * nf), Xty = [new Float64Array(nf), new Float64Array(nf)];
  for (let k = 0; k < p.L; k += STRIDE) { feats(p, k, f); for (let i = 0; i < nf; i++) { const fi = f[i]; if (!fi) continue; for (let j = i; j < nf; j++) XtX[i * nf + j] += fi * f[j]; Xty[0][i] += fi * p.U[2 * k]; Xty[1][i] += fi * p.U[2 * k + 1]; } }
  for (let i = 0; i < nf; i++) for (let j = 0; j < i; j++) XtX[i * nf + j] = XtX[j * nf + i]; return { XtX, Xty }; });
function fitOn(set, lam) { const A = new Float64Array(nf * nf), b = [new Float64Array(nf), new Float64Array(nf)];
  for (const g of set) { for (let i = 0; i < nf * nf; i++) A[i] += G[g].XtX[i]; for (let c = 0; c < 2; c++) for (let i = 0; i < nf; i++) b[c][i] += G[g].Xty[c][i]; }
  let dmax = 0; for (let i = 0; i < nf; i++) dmax = Math.max(dmax, A[i * nf + i]); for (let i = 0; i < nf; i++) A[i * nf + i] += lam * dmax;
  return [solve(A, b[0], nf), solve(A, b[1], nf)]; }
function nrmse(w, p) { let se = [0, 0], ss = [0, 0]; for (let k = 0; k < p.L; k += 3) { feats(p, k, f); for (let c = 0; c < 2; c++) { let y = 0; for (let i = 0; i < nf; i++) y += w[c][i] * f[i]; se[c] += (y - p.U[2 * k + c]) ** 2; ss[c] += p.U[2 * k + c] ** 2; } } return se.map((s, c) => Math.sqrt(s / ss[c])); }
const fmt = (r) => r.map((x) => x.toFixed(2)).join('/');
if (process.env.TRAIN) {
  const tr = process.env.TRAIN.split(',').map((n) => progs.findIndex((p) => p.name === n)), te = process.env.TEST.split(',').map((n) => progs.findIndex((p) => p.name === n));
  for (const lam of (process.env.LAMS || '1e-8,1e-6,1e-4').split(',').map(Number)) { const w = fitOn(tr, lam); console.log(`train ${process.env.TRAIN} lam ${lam} → ` + te.map((h) => `${progs[h].name} ${fmt(nrmse(w, progs[h]))}`).join('  ')); }
  process.exit(0);
}
for (const lam of (process.env.LAMS || '1e-8,1e-6,1e-4').split(',').map(Number)) {
  const held = progs.map((p, h) => nrmse(fitOn(progs.map((_, g) => g).filter((g) => g !== h), lam), p));
  const ins = progs.map((p, h) => nrmse(fitOn([h], lam), p));
  console.log(`R ${R} step ${STEP} pose ${POSE} nf ${nf} lam ${lam}\n  held-out: ${progs.map((p, h) => `${p.name} ${fmt(held[h])}`).join('  ')}\n  in-sample: ${progs.map((p, h) => `${p.name} ${fmt(ins[h])}`).join('  ')}`);
}
