// Identify an INVERSE from broadband excitation (teacher-free: window of achieved y -> r - y), then
// apply it to six programs on the machine. Classes: sparse (the block's 21 taps), dense FIR, dense x pose.
import { arm2r } from '../../arm2r.mjs';
import { benchPath, jointProgram, ikOf, buildArm } from '../../../../lib/flexisim/bench.js';
const pr = await buildArm(); const ik = ikOf(pr.arm.L1, pr.arm.L2); await pr.l1.destroy(); await pr.l2.destroy();
const PROGS = ['circle', 'rounded', 'sharp'].flatMap((s) => [3e-3, 2e-3].map((f) => ({ name: `${s}-${f}`, prog: jointProgram(benchPath(s, f), ik) })));
const N = +(process.env.N || 120000), R = +(process.env.R || 1500), SEED = +(process.env.SEED || 3);
// ---- excitation: smooth random moves inside the programs' joint envelope, at the programs' own speeds
let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], vpk = [0, 0];
for (const { prog } of PROGS) for (let k = 0; k < prog.lap; k++) { const q = prog.at(k), p = prog.at(k - 1); for (let c = 0; c < 2; c++) { lo[c] = Math.min(lo[c], q[c]); hi[c] = Math.max(hi[c], q[c]); vpk[c] = Math.max(vpk[c], Math.abs(q[c] - p[c])); } }
let s = SEED >>> 0; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const start = PROGS[0].prog.at(0), exc = new Float64Array(2 * N);
for (let c = 0; c < 2; c++) { let t = 0, from = start[c]; while (t < N) { const to = lo[c] + (hi[c] - lo[c]) * rnd(); const T = Math.max(40, Math.ceil(1.875 * Math.abs(to - from) / (vpk[c] * (0.3 + 0.9 * rnd())))); const hold = Math.floor(rnd() * 600);
  for (let i = 0; i < T + hold && t < N; i++, t++) { const u = Math.min(1, i / T); exc[2 * t + c] = from + (to - from) * u * u * u * (10 - 15 * u + 6 * u * u); } from = to; } }
const m = await arm2r.make(PROGS[0].prog); const o = new Float64Array(4);
// blend from the circle start (the machine is settled there) — the excitation starts at it
const y = new Float64Array(2 * N);
for (let k = 0; k < N; k++) { m.meas(o); y[2 * k] = o[0]; y[2 * k + 1] = o[1]; m.step([exc[2 * k], exc[2 * k + 1]]); }
console.log(`excitation ${N} scans, envelope q1 [${lo[0].toFixed(2)}, ${hi[0].toFixed(2)}] q2 [${lo[1].toFixed(2)}, ${hi[1].toFixed(2)}]`);
// ---- feature classes over a window of a signal g (y in the fit, the reference when deployed)
const SH = [0, 0.008, 0.016, 0.031, 0.063, 0.125, 0.219, 0.344, 0.5, 0.719, 1];
const CLASSES = {
  sparse: { offs: [...new Set(SH.flatMap((a) => [Math.round(a * R), -Math.round(a * R)]))].sort((a, b) => a - b), pose: false },
  dense: { offs: Array.from({ length: 2 * Math.round(R / (R / 75)) + 1 }, (_, i) => Math.round(-R + i * (R / 75))), pose: false },
  densePose: { offs: Array.from({ length: 2 * 50 + 1 }, (_, i) => Math.round(-R + i * (R / 50))), pose: true },
};
function feats(cls, g, k, out) { // g(i, c) -> signal; level + deltas + bias, optionally x [1, cos q2, sin q2]
  const g0 = [g(k, 0), g(k, 1)]; const base = [1, g0[0], g0[1]];
  for (const o of cls.offs) if (o !== 0) for (let c = 0; c < 2; c++) base.push((g(k + o, c) - g0[c]) * 20);
  const pose = cls.pose ? [1, Math.cos(g0[1]) + 0.3, Math.sin(g0[1]) - 0.8] : [1];
  let n = 0; for (const a of pose) for (const b of base) out[n++] = a * b; return n;
}
function solve(A, b, n) { const M = Float64Array.from(A), x = Float64Array.from(b);
  for (let i = 0; i < n; i++) { for (let j = 0; j <= i; j++) { let q = M[i * n + j]; for (let t = 0; t < j; t++) q -= M[i * n + t] * M[j * n + t]; if (i === j) M[i * n + i] = Math.sqrt(Math.max(q, 1e-300)); else M[i * n + j] = q / M[j * n + j]; } }
  for (let i = 0; i < n; i++) { let q = x[i]; for (let t = 0; t < i; t++) q -= M[i * n + t] * x[t]; x[i] = q / M[i * n + i]; }
  for (let i = n - 1; i >= 0; i--) { let q = x[i]; for (let t = i + 1; t < n; t++) q -= M[t * n + i] * x[t]; x[i] = q / M[i * n + i]; } return x; }
const models = {};
for (const [name, cls] of Object.entries(CLASSES)) {
  const nf = feats(cls, (i, c) => 0, 0, new Float64Array(2000)), f = new Float64Array(nf);
  const A = new Float64Array(nf * nf), b = [new Float64Array(nf), new Float64Array(nf)];
  const gy = (i, c) => y[2 * Math.max(0, Math.min(N - 1, i)) + c];
  for (let k = 2 * R; k < N - R; k += 3) { feats(cls, gy, k, f); const tgt = [exc[2 * k] - y[2 * k], exc[2 * k + 1] - y[2 * k + 1]];
    for (let i = 0; i < nf; i++) { const fi = f[i]; for (let j = i; j < nf; j++) A[i * nf + j] += fi * f[j]; b[0][i] += fi * tgt[0]; b[1][i] += fi * tgt[1]; } }
  for (let i = 0; i < nf; i++) for (let j = 0; j < i; j++) A[i * nf + j] = A[j * nf + i];
  let dmax = 0; for (let i = 0; i < nf; i++) dmax = Math.max(dmax, A[i * nf + i]);
  models[name] = [1e-7, 1e-5, 1e-3].map((lam) => { const Al = Float64Array.from(A); for (let i = 0; i < nf; i++) Al[i * nf + i] += lam * dmax; return { lam, w: [solve(Al, b[0], nf), solve(Al, b[1], nf)], nf, cls }; });
}
// ---- MODEL-BASED lap learning: U <- U - beta * Q( Ginv(e) ), Ginv(e) = e + M_lin(e) (the identified inverse, no bias)
const md = models[process.env.CLS || 'dense'].find((x) => x.lam === +(process.env.LAM || 1e-5));
const IT = +(process.env.IT || 8), BETA = +(process.env.BETA || 0.7);
for (const name of (process.env.ONLYP || 'circle-0.003,rounded-0.003,sharp-0.003').split(',')) {
  const { prog } = PROGS.find((p) => p.name === name), L = prog.lap, d = Math.ceil(0.05 * L);
  const mm = await arm2r.make(prog), f = new Float64Array(md.nf);
  const lap = (U) => { const e = new Float64Array(2 * L); for (let k = 0; k < L; k++) { mm.meas(o); const r = prog.at(k); for (let c = 0; c < 2; c++) e[2 * k + c] = o[c] - r[c]; mm.step([r[0] + U[2 * k], r[1] + U[2 * k + 1]]); } return e; };
  const rms = (e) => [0, 1].map((c) => { let s = 0; for (let k = d; k < L; k++) s += e[2 * k + c] ** 2; return Math.sqrt(s / (L - d)); });
  let U = new Float64Array(2 * L); lap(U); let e = lap(U); const bare = rms(e);
  // seed with the transferable map (the reference through the inverse)
  const gr = (i, c) => prog.at(i)[c];
  for (let k = 0; k < L; k++) { feats(md.cls, gr, k, f); for (let c = 0; c < 2; c++) { let v = 0; for (let i = 0; i < md.nf; i++) v += md.w[c][i] * f[i]; U[2 * k + c] = v; } }
  lap(U); e = lap(U);
  const fx = (r) => (1 / Math.sqrt(((r[0] / bare[0]) ** 2 + (r[1] / bare[1]) ** 2) / 2)).toFixed(2);
  const hist = [`map ${fx(rms(e))}x`];
  let best = rms(e), bestU = U.slice(), beta = BETA;
  for (let it = 0; it < IT; it++) {
    const ge = (i, c) => e[2 * (((i % L) + L) % L) + c];
    const Un = U.slice();
    for (let k = 0; k < L; k++) { feats(md.cls, ge, k, f); for (let c = 0; c < 2; c++) { let v = e[2 * k + c]; for (let i = 1; i < md.nf; i++) v += md.w[c][i] * f[i]; Un[2 * k + c] = U[2 * k + c] - beta * v; } }
    lap(Un); const en = lap(Un), r = rms(en);
    if (Math.hypot(r[0] / bare[0], r[1] / bare[1]) < Math.hypot(best[0] / bare[0], best[1] / bare[1])) { U = Un; e = en; best = r; hist.push(fx(r)); }
    else { beta *= 0.5; hist.push(`(${fx(r)} rej)`); }
  }
  console.log(name.padEnd(14), 'bare→', hist.join(' → '), '  laps', 4 + 2 * IT);
}
