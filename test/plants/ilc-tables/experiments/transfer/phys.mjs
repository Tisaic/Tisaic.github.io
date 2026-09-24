// FF1 = physics features (rigid-body torques of the reference and their derivatives, gravity,
// pose-weighted mode terms), FF2 = the generic window map on what FF1 leaves. Fitted ONCE from
// excitation (teacher-free: command - achieved, features of the achieved), then FROZEN, and applied
// to eight programs never seen (one lap each) plus two bench programs.
import { arm2r } from '../../../arm2r.mjs';
import { benchProgram, jointProgram, ikOf, buildArm, BENCH } from '../../../../../lib/flexisim/bench.js';
import { sharpRect, roundedRect, circle } from '../../../../../lib/flexisim/toolpath.js';
const pr = await buildArm(); const ik = ikOf(pr.arm.L1, pr.arm.L2); const ARM = pr.arm, SERVO = pr.servo;
const R = 1500, N = +(process.env.N || 120000), H = +(process.env.H || 20);
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
  ['bench circle 3e-3', benchProgram('circle', 3e-3, ik)],
].map(([name, prog]) => ({ name, prog }));
// ---- the signal pool, from any joint signal S (function i -> [q1, q2]) over n samples (wrapping if closed)
function pool(S, n) {
  const at = (i, c) => S(i)[c];
  const q = new Float64Array(2 * n), v = new Float64Array(2 * n), a = new Float64Array(2 * n), tau = new Float64Array(2 * n), g = new Float64Array(2 * n), m = new Float64Array(2 * n);
  for (let k = 0; k < n; k++) {
    for (let c = 0; c < 2; c++) { q[2 * k + c] = at(k, c); v[2 * k + c] = (at(k + H, c) - at(k - H, c)) / (2 * H); a[2 * k + c] = (at(k + H, c) - 2 * at(k, c) + at(k - H, c)) / (H * H); }
    const refs = [0, 1].map((c) => ({ theta: q[2 * k + c], omega: v[2 * k + c], alpha: a[2 * k + c] }));
    const t = SERVO.jointTorques(refs), gr = ARM.gravityTorque([q[2 * k], q[2 * k + 1]]), M = ARM.massMatrix(q[2 * k + 1]);
    tau[2 * k] = t[0]; tau[2 * k + 1] = t[1]; g[2 * k] = gr[0]; g[2 * k + 1] = gr[1]; m[2 * k] = M[0][0]; m[2 * k + 1] = M[1][1];
  }
  return { n, q, v, a, tau, g, m, S };
}
const clampI = (p, i, wrap) => (wrap ? ((i % p.n) + p.n) % p.n : Math.max(0, Math.min(p.n - 1, i)));
function physFeats(p, k, wrap, out) {
  const ix = (d) => clampI(p, k + d, wrap); let n = 0; out[n++] = 1;
  for (let c = 0; c < 2; c++) {
    const t0 = p.tau[2 * ix(0) + c], tp = p.tau[2 * ix(H) + c], tm = p.tau[2 * ix(-H) + c];
    const td = (tp - tm) / (2 * H), tdd = (tp - 2 * t0 + tm) / (H * H), mm = p.m[2 * ix(0) + c];
    out[n++] = t0; out[n++] = td; out[n++] = tdd; out[n++] = p.g[2 * ix(0) + c]; out[n++] = mm * tdd; out[n++] = mm * td;
    out[n++] = p.v[2 * ix(0) + c]; out[n++] = p.a[2 * ix(0) + c];
  }
  return n;
}
const SH = [0, 0.008, 0.016, 0.031, 0.063, 0.125, 0.219, 0.344, 0.5, 0.719, 1];
const offs = [...new Set(SH.flatMap((x) => [Math.round(x * R), -Math.round(x * R)]))].filter((o) => o !== 0).sort((x, y) => x - y);
function genFeats(p, k, wrap, out) { const qa = p.q[2 * clampI(p, k, wrap)], qb = p.q[2 * clampI(p, k, wrap) + 1]; let n = 0; out[n++] = 1; out[n++] = qa; out[n++] = qb;
  for (const o of offs) for (let c = 0; c < 2; c++) out[n++] = (p.q[2 * clampI(p, k + o, wrap) + c] - p.q[2 * clampI(p, k, wrap) + c]) * 20; return n; }
const NP = physFeats(pool((i) => [0.1, 2], 10), 5, false, new Float64Array(200)), NG = genFeats(pool((i) => [0.1, 2], 10), 5, false, new Float64Array(200));
// ---- excitation (same generator as before)
let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], vpk = [0, 0];
for (const { prog } of WORK) for (let k = 0; k < prog.lap; k++) { const q = prog.at(k), pq = prog.at(k - 1); for (let c = 0; c < 2; c++) { lo[c] = Math.min(lo[c], q[c]); hi[c] = Math.max(hi[c], q[c]); vpk[c] = Math.max(vpk[c], Math.abs(q[c] - pq[c])); } }
let sd = 3 >>> 0; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
const exc = new Float64Array(2 * N), start = WORK[0].prog.at(0);
for (let c = 0; c < 2; c++) { let t = 0, from = start[c]; while (t < N) { const to = lo[c] + (hi[c] - lo[c]) * rnd(); const T = Math.max(100, Math.ceil(1.875 * Math.abs(to - from) / (vpk[c] * (0.3 + 0.9 * rnd())))); const hold = Math.floor(rnd() * 600); for (let i = 0; i < T + hold && t < N; i++, t++) { const u = Math.min(1, i / T); exc[2 * t + c] = from + (to - from) * u * u * u * (10 - 15 * u + 6 * u * u); } from = to; } }
const m0 = await arm2r.make(WORK[0].prog); const o = new Float64Array(4); const y0 = new Float64Array(2 * N);
for (let k = 0; k < N; k++) { m0.meas(o); y0[2 * k] = o[0]; y0[2 * k + 1] = o[1]; m0.step([exc[2 * k], exc[2 * k + 1]]); }
const PY = pool((i) => { const j = Math.max(0, Math.min(N - 1, i)); return [y0[2 * j], y0[2 * j + 1]]; }, N);
// ---- fitting helpers
function solve(A, bb, n, lam) { const M = Float64Array.from(A); let dmax = 0; for (let i = 0; i < n; i++) dmax = Math.max(dmax, M[i * n + i]); for (let i = 0; i < n; i++) M[i * n + i] += lam * (dmax || 1);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = M[i * n + j]; for (let t = 0; t < j; t++) s -= M[i * n + t] * M[j * n + t]; M[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / M[j * n + j]; }
  return bb.map((b) => { const x = Float64Array.from(b); for (let i = 0; i < n; i++) { let s = x[i]; for (let t = 0; t < i; t++) s -= M[i * n + t] * x[t]; x[i] = s / M[i * n + i]; } for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let t = i + 1; t < n; t++) s -= M[t * n + i] * x[t]; x[i] = s / M[i * n + i]; } return x; }); }
const rows = []; for (let k = 2 * R; k < N - R; k += 2) rows.push(k);
// standardisation of each block from the excitation
function stats(fe, nf) { const mu = new Float64Array(nf), sq = new Float64Array(nf), f = new Float64Array(nf); for (const k of rows) { fe(PY, k, false, f); for (let i = 0; i < nf; i++) { mu[i] += f[i]; sq[i] += f[i] * f[i]; } }
  const sc = new Float64Array(nf); for (let i = 0; i < nf; i++) { mu[i] /= rows.length; const v = sq[i] / rows.length - mu[i] * mu[i]; sc[i] = i === 0 ? 1 : 1 / Math.sqrt(Math.max(v, 1e-300)); } return sc; }
const SP = stats(physFeats, NP), SG = stats(genFeats, NG);
function fit(parts, lam, targetOf) { // parts: [{fe, nf, sc, w}] (w = feature weight, a ridge per block)
  const nf = parts.reduce((s, x) => s + x.nf, 0), A = new Float64Array(nf * nf), B = [new Float64Array(nf), new Float64Array(nf)], f = new Float64Array(nf), tmp = new Float64Array(200);
  for (const k of rows) { let n = 0; for (const pt of parts) { pt.fe(PY, k, false, tmp); for (let i = 0; i < pt.nf; i++) f[n++] = tmp[i] * pt.sc[i] * pt.w; }
    const tg = targetOf(k); for (let i = 0; i < nf; i++) { const fi = f[i]; for (let j = 0; j < nf; j++) A[i * nf + j] += fi * f[j]; B[0][i] += fi * tg[0]; B[1][i] += fi * tg[1]; } }
  return { parts, W: solve(A, B, nf, lam), nf };
}
function predict(md, p, k, wrap) { const tmp = new Float64Array(200); let n = 0; const u = [0, 0];
  for (const pt of md.parts) { pt.fe(p, k, wrap, tmp); for (let i = 0; i < pt.nf; i++, n++) { const x = tmp[i] * pt.sc[i] * pt.w; u[0] += md.W[0][n] * x; u[1] += md.W[1][n] * x; } } return u; }
const tgt = (k) => [exc[2 * k] - y0[2 * k], exc[2 * k + 1] - y0[2 * k + 1]];
const PH = { fe: physFeats, nf: NP, sc: SP, w: 1 }, GE = { fe: genFeats, nf: NG, sc: SG, w: 1 };
const models = {};
models.generic = [fit([GE], 1e-5, tgt)];
models.phys = [fit([PH], 1e-6, tgt)];
models.joint = [fit([PH, { ...GE, w: 0.3 }], 1e-5, tgt)];
{ const m1 = models.phys[0]; const resid = (k) => { const u = predict(m1, PY, k, false), t = tgt(k); return [t[0] - u[0], t[1] - u[1]]; };
  models.twoStage = [m1, fit([GE], 1e-3, resid)]; }
// ---- frozen, one lap on each program, against its own bare lap
async function lapOf(prog, U) { const mm = await arm2r.make(prog), L = prog.lap, d = Math.ceil(0.05 * L), ss = [0, 0];
  for (let k = 0; k < L; k++) { mm.meas(o); const r = prog.at(k); if (k >= d) for (let c = 0; c < 2; c++) ss[c] += (o[c] - r[c]) ** 2; const u = U ? [U[2 * k], U[2 * k + 1]] : [0, 0]; mm.step([r[0] + u[0], r[1] + u[1]]); }
  return ss.map((x) => Math.sqrt(x / (L - d))); }
console.log(`physics pool ${NP} features, generic ${NG}; fitted on ${rows.length} excitation rows`);
const head = ['program'.padEnd(22), ...Object.keys(models).map((n) => n.padStart(9))].join(' ');
console.log(head);
for (const { name, prog } of WORK) {
  const L = prog.lap, pp = pool((i) => prog.at(i), L), bare = await lapOf(prog, null), row = [name.padEnd(22)];
  for (const [mn, stack] of Object.entries(models)) {
    const U = new Float64Array(2 * L); for (let k = 0; k < L; k++) for (const md of stack) { const u = predict(md, pp, k, true); U[2 * k] += u[0]; U[2 * k + 1] += u[1]; }
    const r = await lapOf(prog, U); row.push((1 / Math.sqrt(((r[0] / bare[0]) ** 2 + (r[1] / bare[1]) ** 2) / 2)).toFixed(2).padStart(9));
  }
  console.log(row.join(' '));
}
