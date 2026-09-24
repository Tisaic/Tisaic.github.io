// A MODEL WITH STATE. Two-channel ARX from command c to tool-joints y, identified from the excitation
// at a decimated rate D, with a static pose term for the sag. Step 1: free-run it on UNSEEN programs'
// untouched laps and ask how well it predicts the machine's error. Step 2: invert it (solve for the
// command that makes the MODEL follow the reference over the whole program) and apply that ONCE.
import { arm2r } from '../../../arm2r.mjs';
import { benchProgram, jointProgram, ikOf, buildArm, BENCH } from '../../../../../lib/flexisim/bench.js';
import { sharpRect, roundedRect, circle } from '../../../../../lib/flexisim/toolpath.js';
const pr = await buildArm(); const ik = ikOf(pr.arm.L1, pr.arm.L2); await pr.l1.destroy(); await pr.l2.destroy();
const N = +(process.env.N || 240000), D = +(process.env.D || 20), NA = +(process.env.NA || 6), NB = +(process.env.NB || 6), POSE = process.env.POSE !== '0';
const P = (o) => ({ ...o, accel: BENCH.ACCEL, cornerStop: true, dwell: BENCH.JERK });
const J = (path) => jointProgram(path, ik, { smooth: BENCH.JERK });
const WORK = [
  ['sq6@(11,1) f2.5', J(sharpRect(P({ w: 6, h: 6, centre: [11, 1], feed: 2.5e-3 })))],
  ['circ3@(13,-1) f3', J(circle(P({ r: 3, centre: [13, -1], feed: 3e-3 })))],
  ['rect7x5@(12,0.5) f1.5', J(sharpRect(P({ w: 7, h: 5, centre: [12, 0.5], feed: 1.5e-3 })))],
  ['rnd6@(12.5,-0.5) f2', J(roundedRect(P({ w: 6, h: 6, r: 1.2, closed: true, centre: [12.5, -0.5], feed: 2e-3 })))],
  ['circ3.5@(11.5,0.5) f2', J(circle(P({ r: 3.5, centre: [11.5, 0.5], feed: 2e-3 })))],
  ['sq5@(13,1) f3', J(sharpRect(P({ w: 5, h: 5, centre: [13, 1], feed: 3e-3 })))],
  ['rnd8x6@(12,0) f2.5', J(roundedRect(P({ w: 8, h: 6, r: 2, closed: true, centre: [12, 0], feed: 2.5e-3 })))],
  ['circ2.5@(12,-1.5) f1', J(circle(P({ r: 2.5, centre: [12, -1.5], feed: 1e-3 })))],
  ['bench sharp 3e-3', benchProgram('sharp', 3e-3, ik)],
].map(([name, prog]) => ({ name, prog }));
// ---- excitation (as before, but twice as long: a state model has more to identify)
let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], vpk = [0, 0];
for (const { prog } of WORK) for (let k = 0; k < prog.lap; k++) { const q = prog.at(k), pq = prog.at(k - 1); for (let c = 0; c < 2; c++) { lo[c] = Math.min(lo[c], q[c]); hi[c] = Math.max(hi[c], q[c]); vpk[c] = Math.max(vpk[c], Math.abs(q[c] - pq[c])); } }
let sd = 3 >>> 0; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
const exc = new Float64Array(2 * N), start = WORK[0].prog.at(0);
for (let c = 0; c < 2; c++) { let t = 0, from = start[c]; while (t < N) { const to = lo[c] + (hi[c] - lo[c]) * rnd(); const T = Math.max(100, Math.ceil(1.875 * Math.abs(to - from) / (vpk[c] * (0.3 + 0.9 * rnd())))); const hold = Math.floor(rnd() * 1500); for (let i = 0; i < T + hold && t < N; i++, t++) { const u = Math.min(1, i / T); exc[2 * t + c] = from + (to - from) * u * u * u * (10 - 15 * u + 6 * u * u); } from = to; } }
const m0 = await arm2r.make(WORK[0].prog); const o = new Float64Array(4); const y0 = new Float64Array(2 * N);
for (let k = 0; k < N; k++) { m0.meas(o); y0[2 * k] = o[0]; y0[2 * k + 1] = o[1]; m0.step([exc[2 * k], exc[2 * k + 1]]); }
// ---- decimate (block means) and fit y_t = sum A_i y_{t-i} + sum B_j c_{t-j} + static(pose)
const dec = (x, n) => { const m = Math.floor(n / D), out = new Float64Array(2 * m); for (let i = 0; i < m; i++) for (let c = 0; c < 2; c++) { let s = 0; for (let j = 0; j < D; j++) s += x[2 * (i * D + j) + c]; out[2 * i + c] = s / D; } return out; };
const Y = dec(y0, N), C = dec(exc, N), M = Y.length / 2;
const stat = (q) => POSE ? [1, Math.cos(q[0]), Math.sin(q[0]), Math.cos(q[0] + q[1]), Math.sin(q[0] + q[1])] : [1];
const NS = stat([0, 0]).length, NF = 2 * NA + 2 * (NB + 1) + NS;
function row(Yv, Cv, t, out) { let n = 0; for (let i = 1; i <= NA; i++) for (let c = 0; c < 2; c++) out[n++] = Yv[2 * (t - i) + c];
  for (let j = 0; j <= NB; j++) for (let c = 0; c < 2; c++) out[n++] = Cv[2 * (t - j) + c];
  for (const s of stat([Cv[2 * t], Cv[2 * t + 1]])) out[n++] = s; return n; }
const A = new Float64Array(NF * NF), B = [new Float64Array(NF), new Float64Array(NF)], f = new Float64Array(NF);
const T0 = Math.max(NA, NB) + 5;
for (let t = T0; t < M; t++) { row(Y, C, t, f); for (let i = 0; i < NF; i++) { for (let j = 0; j < NF; j++) A[i * NF + j] += f[i] * f[j]; B[0][i] += f[i] * Y[2 * t]; B[1][i] += f[i] * Y[2 * t + 1]; } }
function solve(Am, bb, n, lam) { const Mm = Float64Array.from(Am); let dmax = 0; for (let i = 0; i < n; i++) dmax = Math.max(dmax, Mm[i * n + i]); for (let i = 0; i < n; i++) Mm[i * n + i] += lam * dmax;
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = Mm[i * n + j]; for (let t = 0; t < j; t++) s -= Mm[i * n + t] * Mm[j * n + t]; Mm[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / Mm[j * n + j]; }
  return bb.map((b) => { const x = Float64Array.from(b); for (let i = 0; i < n; i++) { let s = x[i]; for (let t = 0; t < i; t++) s -= Mm[i * n + t] * x[t]; x[i] = s / Mm[i * n + i]; } for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let t = i + 1; t < n; t++) s -= Mm[t * n + i] * x[t]; x[i] = s / Mm[i * n + i]; } return x; }); }
const W = solve(A, B, NF, +(process.env.LAM || 1e-12));
// free-run simulation of the model under a command sequence Cv (decimated), from a given initial output
function simulate(Cv, m, y0v) { const Yv = new Float64Array(2 * m); for (let t = 0; t < T0; t++) { Yv[2 * t] = y0v[0]; Yv[2 * t + 1] = y0v[1]; }
  for (let t = T0; t < m; t++) { row(Yv, Cv, t, f); for (let c = 0; c < 2; c++) { let s = 0; for (let i = 0; i < NF; i++) s += W[c][i] * f[i]; Yv[2 * t + c] = s; } } return Yv; }
// ---- per program: an untouched run of three laps (the model starts at rest-like steady state and is
//      judged on the LAST lap), then the inverse applied once
async function run(prog, Ufull, laps) { const mm = await arm2r.make(prog), L = prog.lap, ys = new Float64Array(2 * L * laps), cs = new Float64Array(2 * L * laps);
  for (let t = 0; t < L * laps; t++) { mm.meas(o); ys[2 * t] = o[0]; ys[2 * t + 1] = o[1]; const r = prog.at(t); const u = Ufull ? [Ufull[2 * t], Ufull[2 * t + 1]] : [0, 0]; cs[2 * t] = r[0] + u[0]; cs[2 * t + 1] = r[1] + u[1]; mm.step([cs[2 * t], cs[2 * t + 1]]); }
  return { ys, cs }; }
const LAPS = 3;
console.log(`ARX na ${NA} nb ${NB} at D=${D} (${(D).toFixed(0)} ms), static pose terms ${POSE}; ${M} decimated rows`);
for (const { name, prog } of WORK) {
  const L = prog.lap, bare = await run(prog, null, LAPS), n = L * LAPS, Cd = dec(bare.cs, n), Yd = dec(bare.ys, n), md = Cd.length / 2;
  const Ysim = simulate(Cd, md, [Yd[2 * T0], Yd[2 * T0 + 1]]);
  // prediction quality on the last lap: the model's error (y - r) against the machine's
  const Rd = dec(Float64Array.from({ length: 2 * n }, (_, i) => prog.at(i >> 1)[i & 1]), n);
  let se = [0, 0], sp = [0, 0]; const from = Math.floor(md * (LAPS - 1) / LAPS);
  for (let t = from; t < md; t++) for (let c = 0; c < 2; c++) { const eTrue = Yd[2 * t + c] - Rd[2 * t + c], ePred = Ysim[2 * t + c] - Rd[2 * t + c]; se[c] += eTrue * eTrue; sp[c] += (ePred - eTrue) ** 2; }
  const nrmse = se.map((x, c) => Math.sqrt(sp[c] / x));
  // inversion over the whole run on the MODEL: iterate c <- c + g (r - yModel(c)), a model-only lap learning
  let Cc = Float64Array.from(Rd);
  for (let it = 0; it < 60; it++) { const Ym = simulate(Cc, md, [Rd[2 * T0], Rd[2 * T0 + 1]]); for (let t = 0; t < md - 1; t++) for (let c = 0; c < 2; c++) Cc[2 * t + c] += 0.5 * (Rd[2 * (t + 1) + c] - Ym[2 * (t + 1) + c]); }
  // back to 1 ms: the trim is (C - R), linearly interpolated
  const U = new Float64Array(2 * n); for (let k = 0; k < n; k++) { const x = (k + 0.5) / D - 0.5, i = Math.max(0, Math.min(md - 2, Math.floor(x))), fr = Math.max(0, Math.min(1, x - i)); for (let c = 0; c < 2; c++) { const a = Cc[2 * i + c] - Rd[2 * i + c], b = Cc[2 * (i + 1) + c] - Rd[2 * (i + 1) + c]; U[2 * k + c] = a + fr * (b - a); } }
  const tr = await run(prog, U, LAPS);
  const lastRms = (ys) => { const s = [0, 0]; const d = Math.ceil(0.05 * L); for (let k = d; k < L; k++) { const t = (LAPS - 1) * L + k, r = prog.at(k); for (let c = 0; c < 2; c++) s[c] += (ys[2 * t + c] - r[c]) ** 2; } return s.map((x) => Math.sqrt(x / (L - d))); };
  const rb = lastRms(bare.ys), rt = lastRms(tr.ys), x = 1 / Math.sqrt(((rt[0] / rb[0]) ** 2 + (rt[1] / rb[1]) ** 2) / 2);
  console.log(`${name.padEnd(22)} model predicts the untouched error to NRMSE ${nrmse.map((v) => v.toFixed(2)).join('/')} · inverted, frozen: ${x.toFixed(2)}x`);
}
