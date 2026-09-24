// An inverse commissioned ONCE from excitation, then either frozen or kept learning in production
// (exponentially forgotten normal equations, re-solved every SOLVE scans) on a CHANGING workload.
import { arm2r } from '../../../arm2r.mjs';
import { benchProgram, jointProgram, ikOf, buildArm, BENCH } from '../../../../../lib/flexisim/bench.js';
import { sharpRect, roundedRect, circle } from '../../../../../lib/flexisim/toolpath.js';
const pr = await buildArm(); const ik = ikOf(pr.arm.L1, pr.arm.L2); await pr.l1.destroy(); await pr.l2.destroy();
const R = +(process.env.R || 1500), N = +(process.env.N || 120000), SOLVE = 500, LAM = 1e-5;
const TAUS = (process.env.TAUS || 'Infinity,20000,5000').split(',').map(Number);
// A WORKLOAD THAT NEVER REPEATS: new shapes, sizes, positions and feeds, each run once (LAPS=1).
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
].map(([name, prog]) => ({ name, prog }));
const LAPS = +(process.env.LAPS || 1);
const SH = [0, 0.008, 0.016, 0.031, 0.063, 0.125, 0.219, 0.344, 0.5, 0.719, 1];
const offs = [...new Set(SH.flatMap((a) => [Math.round(a * R), -Math.round(a * R)]))].filter((o) => o !== 0).sort((a, b) => a - b);
function feats(g, k, out) { const a = g(k, 0), b = g(k, 1); let n = 0; out[n++] = 1; out[n++] = a; out[n++] = b;
  out[n++] = Math.cos(a); out[n++] = Math.sin(a); out[n++] = Math.cos(a + b); out[n++] = Math.sin(a + b);
  for (const o of offs) for (let c = 0; c < 2; c++) out[n++] = (g(k + o, c) - g(k, c)) * 20; return n; }
const NF = feats(() => 0, 0, new Float64Array(200));
function solve(A, bb, n, lam) { const M = Float64Array.from(A); let dmax = 0; for (let i = 0; i < n; i++) dmax = Math.max(dmax, M[i * n + i]); for (let i = 0; i < n; i++) M[i * n + i] += lam * (dmax || 1);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = M[i * n + j]; for (let t = 0; t < j; t++) s -= M[i * n + t] * M[j * n + t]; M[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / M[j * n + j]; }
  return bb.map((b) => { const x = Float64Array.from(b); for (let i = 0; i < n; i++) { let s = x[i]; for (let t = 0; t < i; t++) s -= M[i * n + t] * x[t]; x[i] = s / M[i * n + i]; } for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let t = i + 1; t < n; t++) s -= M[t * n + i] * x[t]; x[i] = s / M[i * n + i]; } return x; }); }
// ---- commissioning: the same excitation as the transfer experiment
let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], vpk = [0, 0];
for (const { prog } of WORK) for (let k = 0; k < prog.lap; k++) { const q = prog.at(k), p = prog.at(k - 1); for (let c = 0; c < 2; c++) { lo[c] = Math.min(lo[c], q[c]); hi[c] = Math.max(hi[c], q[c]); vpk[c] = Math.max(vpk[c], Math.abs(q[c] - p[c])); } }
let sd = 3 >>> 0; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
const exc = new Float64Array(2 * N), start = WORK[0].prog.at(0);
for (let c = 0; c < 2; c++) { let t = 0, from = start[c]; while (t < N) { const to = lo[c] + (hi[c] - lo[c]) * rnd(); const T = Math.max(100, Math.ceil(1.875 * Math.abs(to - from) / (vpk[c] * (0.3 + 0.9 * rnd())))); const hold = Math.floor(rnd() * 600); for (let i = 0; i < T + hold && t < N; i++, t++) { const u = Math.min(1, i / T); exc[2 * t + c] = from + (to - from) * u * u * u * (10 - 15 * u + 6 * u * u); } from = to; } }
const m0 = await arm2r.make(WORK[0].prog); const o = new Float64Array(4); const y0 = new Float64Array(2 * N);
for (let k = 0; k < N; k++) { m0.meas(o); y0[2 * k] = o[0]; y0[2 * k + 1] = o[1]; m0.step([exc[2 * k], exc[2 * k + 1]]); }
const G0 = new Float64Array(NF * NF), B0 = [new Float64Array(NF), new Float64Array(NF)], f = new Float64Array(NF);
const gy0 = (i, c) => y0[2 * Math.max(0, Math.min(N - 1, i)) + c];
for (let k = 2 * R; k < N - R; k += 1) { feats(gy0, k, f); for (let i = 0; i < NF; i++) { for (let j = 0; j < NF; j++) G0[i * NF + j] += f[i] * f[j]; B0[0][i] += f[i] * (exc[2 * k] - y0[2 * k]); B0[1][i] += f[i] * (exc[2 * k + 1] - y0[2 * k + 1]); } }
const rows0 = N - 3 * R;
// ---- bare laps per program (the denominator)
async function bareOf(prog) { const mm = await arm2r.make(prog), L = prog.lap, d = Math.ceil(0.05 * L); const ss = [0, 0]; for (let lap = 0; lap < 2; lap++) for (let k = 0; k < L; k++) { mm.meas(o); const r = prog.at(k); if (lap && k >= d) for (let c = 0; c < 2; c++) ss[c] += (o[c] - r[c]) ** 2; mm.step(r); } return ss.map((x) => Math.sqrt(x / (L - d))); }
const bare = []; for (const w of WORK) bare.push(await bareOf(w.prog));
// ---- production: the workload in sequence, each program two laps, one machine throughout
for (const tau of TAUS) {
  const lam = Number.isFinite(tau) ? Math.exp(-1 / tau) : 1;
  // the commissioned Gram, scaled so its weight equals tau scans of production data (a prior, not a wall)
  const scale = Number.isFinite(tau) ? tau / rows0 : 1;
  const G = G0.map((v) => v * scale), B = B0.map((b) => b.map((v) => v * scale));
  let W = solve(G, B, NF, LAM);
  const mm = await arm2r.make(WORK[0].prog);
  const row = [`tau ${String(tau).padStart(8)}:`];
  for (let wi = 0; wi < WORK.length; wi++) {
    const { prog, name } = WORK[wi], L = prog.lap, d = Math.ceil(0.05 * L);
    if (wi > 0) {                                  // move to the new program's start, smoothly, and settle
      const from = WORK[wi - 1].prog.at(0), to = prog.at(0), T = 4000;
      for (let k = 0; k < T + 3000; k++) { const u = Math.min(1, k / T), s = u * u * u * (10 - 15 * u + 6 * u * u); mm.step([from[0] + (to[0] - from[0]) * s, from[1] + (to[1] - from[1]) * s]); }
    }
    const cmd = new Float64Array(2 * LAPS * L), yy = new Float64Array(2 * LAPS * L), gr = (i, c) => prog.at(i)[c];
    const laps = [];
    for (let lap = 0; lap < LAPS; lap++) {
      const ss = [0, 0];
      for (let k = 0; k < L; k++) {
        const t = lap * L + k; mm.meas(o); yy[2 * t] = o[0]; yy[2 * t + 1] = o[1];
        const r = prog.at(k); if (k >= d) for (let c = 0; c < 2; c++) ss[c] += (o[c] - r[c]) ** 2;
        feats(gr, k, f); const u = [0, 0]; for (let c = 0; c < 2; c++) for (let i = 0; i < NF; i++) u[c] += W[c][i] * f[i];
        cmd[2 * t] = r[0] + u[0]; cmd[2 * t + 1] = r[1] + u[1]; mm.step([cmd[2 * t], cmd[2 * t + 1]]);
        if (Number.isFinite(tau)) { const tr = t - R; if (tr >= R) {           // learn from the row whose window is now complete
          const gy = (i, c) => yy[2 * Math.max(0, Math.min(t, i)) + c]; feats(gy, tr, f);
          for (let i = 0; i < NF * NF; i++) G[i] *= lam; for (let c = 0; c < 2; c++) for (let i = 0; i < NF; i++) B[c][i] *= lam;
          const tg = [cmd[2 * tr] - yy[2 * tr], cmd[2 * tr + 1] - yy[2 * tr + 1]];
          for (let i = 0; i < NF; i++) { for (let j = 0; j < NF; j++) G[i * NF + j] += f[i] * f[j]; B[0][i] += f[i] * tg[0]; B[1][i] += f[i] * tg[1]; }
          if (t % SOLVE === 0) W = solve(G, B, NF, LAM); } }
      }
      const rr = ss.map((x) => Math.sqrt(x / (L - d)));
      laps.push((1 / Math.sqrt(((rr[0] / bare[wi][0]) ** 2 + (rr[1] / bare[wi][1]) ** 2) / 2)).toFixed(2));
    }
    row.push(`${name} ${laps.join('→')}`);
  }
  console.log(row.join('  '));
}
