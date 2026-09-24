// IDENTIFY THE REDUCED TWIN FROM THE TOOL ALONE. The machine gives only its tool position (a tracker)
// during an excitation. Coupling is one-way (links never push back on the joints), so ONE rigid run of the
// twin per gearbox stiffness K gives the pose, the links' frame inputs and the tool's Jacobian w.r.t. the
// link deflections; the tool error is then LINEAR in the modal gains -> least squares. Mode frequencies,
// dampings and K are searched outside. Output: modal-tool.json in rtwin.mjs's format, plus K.
import { buildArm, calibrateComp, ikOf, conventional, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
import { machineArm, physics } from './mismatch.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const N = +(process.env.N || 40000), NOISE = +(process.env.NOISE || 0), OUT = process.env.OUT || 'modal-tool.json';
const MM = process.env.MM || '', real = await machineArm(MM); if (MM) console.log(`MACHINE: ${MM} (the twin is nominal)`); const ik = ikOf(real.arm.L1, real.arm.L2), rc = await calibrateComp(real);
const home = [-0.8, 2.0]; let sd = 11 >>> 0; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
const exc = new Float64Array(2 * N); let lo = [-1.2, 1.6], hi = [-0.35, 2.5], VMAX = 3e-4;
if (process.env.EXC) {                      // rule 41: the program's own envelope and peak speed only
  const { benchProgram: bp, ikOf: io, jointProgram: jp } = await import('../../../../../lib/flexisim/bench.js');
  const { circle: ci } = await import('../../../../../lib/flexisim/toolpath.js');
  const iq = io(real.arm.L1, real.arm.L2);
  const pr = process.env.EXC === 'small' ? jp(ci({ r: 2.5, centre: [12, -1.5], feed: 1e-3, accel: BENCH.ACCEL, cornerStop: true, dwell: BENCH.JERK }), iq, { smooth: BENCH.JERK }) : bp('sharp', 2e-3, iq); lo = [Infinity, Infinity]; hi = [-Infinity, -Infinity]; VMAX = 0;
  for (let k = 0; k < pr.lap; k++) { const a = pr.at(k), b = pr.at(k + 1); for (let c = 0; c < 2; c++) { lo[c] = Math.min(lo[c], a[c]); hi[c] = Math.max(hi[c], a[c]); VMAX = Math.max(VMAX, Math.abs(b[c] - a[c])); } }
  home[0] = (lo[0] + hi[0]) / 2; home[1] = (lo[1] + hi[1]) / 2;
  console.log(`excitation inside the bench program's envelope: q1 ${lo[0].toFixed(3)}..${hi[0].toFixed(3)}, q2 ${lo[1].toFixed(3)}..${hi[1].toFixed(3)}, peak speed ${VMAX.toExponential(2)} rad/scan`);
}
for (let c = 0; c < 2; c++) { let t = 0, from = home[c]; while (t < N) { const to = lo[c] + (hi[c] - lo[c]) * rnd(); const T = Math.max(150, Math.ceil(1.875 * Math.abs(to - from) / (VMAX * (0.4 + 0.8 * rnd())))); const hold = Math.floor(rnd() * 1500); for (let i = 0; i < T + hold && t < N; i++, t++) { const u = Math.min(1, i / T); exc[2 * t + c] = from + (to - from) * u * u * u * (10 - 15 * u + 6 * u * u); } from = to; } }
// ---- the machine's tool error (cached)
const MF = `ym-${N}${MM ? '-' + MM : ''}${process.env.EXC ? '-' + process.env.EXC : ''}.f64`; let yM;
if (existsSync(MF)) yM = new Float64Array(readFileSync(MF).buffer.slice(0));
else { await driveTo(real.arm, real.servo, home, BENCH.feed); const c = conventional(real, rc); c.reset(home); for (let k = 0; k < 6000; k++) c.step(home);
  yM = new Float64Array(2 * N); for (let k = 0; k < N; k++) { c.step([exc[2 * k], exc[2 * k + 1]]); const t = real.arm.toolXY(), q = ik(t[0], t[1]); yM[2 * k] = q[0] - exc[2 * k]; yM[2 * k + 1] = q[1] - exc[2 * k + 1]; }
  writeFileSync(MF, Buffer.from(yM.buffer)); }
if (NOISE > 0) { let s0 = 0; for (let i = 0; i < 2 * N; i++) s0 += yM[i] ** 2; const sd0 = NOISE * Math.sqrt(s0 / (2 * N)); let z = 97 >>> 0; const u = () => { z = (Math.imul(z, 1664525) + 1013904223) >>> 0; return (z + 0.5) / 4294967296; };
  yM = yM.slice(); for (let i = 0; i < 2 * N; i++) yM[i] += sd0 * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()); console.log(`tracker noise ${NOISE} x the error rms`); }
let ssM = 0; for (let i = 0; i < 2 * N; i++) ssM += yM[i] ** 2;
// ---- one rigid run of the twin at stiffness K: e_rigid, frame inputs, Jacobian of the measured joint error wrt (w1, s1, w2)
function toolOf(a, q1, q2, w1, s1, w2) { const c1 = Math.cos(q1), sn1 = Math.sin(q1), ex = c1 * a.L1 - sn1 * w1, ey = sn1 * a.L1 + c1 * w1, a2 = q1 + s1 + q2; return [ex + Math.cos(a2) * a.L2 - Math.sin(a2) * w2, ey + Math.sin(a2) * a.L2 + Math.cos(a2) * w2]; }
async function rigidRun(K, ph = {}) {
  const t = await buildArm(K, BENCH.E), a = t.arm; await t.l1.destroy(); await t.l2.destroy(); physics(a, ph);
  const rigidStep = a.stepRigid;
  a.step = function (tc1, tc2, dt) { const t1 = this.j1.stepMotor(tc1, dt), t2 = this.j2.stepMotor(tc2, dt); rigidStep.call(this, t1, t2, dt); return this; };
  a.toolXY = function () { return toolOf(this, this.q[0], this.q[1], 0, 0, 0); };
  await driveTo(a, t.servo, home, BENCH.feed); const c = conventional(t, rc); c.reset(home); for (let k = 0; k < 6000; k++) c.step(home);
  const e = new Float64Array(2 * N), u1 = new Float64Array(2 * N), u2 = new Float64Array(3 * N), G = new Float64Array(6 * N), h = 1e-5;
  for (let k = 0; k < N; k++) { c.step([exc[2 * k], exc[2 * k + 1]]); const [q1, q2] = a.q, p = toolOf(a, q1, q2, 0, 0, 0), q = ik(p[0], p[1]);
    e[2 * k] = q[0] - exc[2 * k]; e[2 * k + 1] = q[1] - exc[2 * k + 1];
    const f1 = a.frameParams(0), f2 = a.frameParams(1); u1[2 * k] = f1.gravity[1]; u1[2 * k + 1] = f1.alpha[2]; u2[3 * k] = f2.gravity[1]; u2[3 * k + 1] = f2.alpha[2]; u2[3 * k + 2] = f2.originAccel[1];
    for (let j = 0; j < 3; j++) { const d = [0, 0, 0]; d[j] = h; const pp = toolOf(a, q1, q2, ...d); d[j] = -h; const pm = toolOf(a, q1, q2, ...d); const qp = ik(pp[0], pp[1]), qm = ik(pm[0], pm[1]);
      G[6 * k + 2 * j] = (qp[0] - qm[0]) / (2 * h); G[6 * k + 2 * j + 1] = (qp[1] - qm[1]) / (2 * h); } }
  return { e, u1, u2, G };
}
function reson(u, stride, idx, w, z) { const out = new Float64Array(N); let y = 0, v = 0; for (let k = 0; k < N; k++) { v += (u[stride * k + idx] - 2 * z * w * v - w * w * y); y += v; out[k] = y; } return out; }
function gauss(Am, b, n) { const M = Float64Array.from(Am), x = Float64Array.from(b); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[p * n + c])) p = r; for (let j = 0; j < n; j++) { const t = M[c * n + j]; M[c * n + j] = M[p * n + j]; M[p * n + j] = t; } { const t = x[c]; x[c] = x[p]; x[p] = t; } for (let r = c + 1; r < n; r++) { const f = M[r * n + c] / M[c * n + c]; for (let j = c; j < n; j++) M[r * n + j] -= f * M[c * n + j]; x[r] -= f * x[c]; } } for (let r = n - 1; r >= 0; r--) { let s = x[r]; for (let j = r + 1; j < n; j++) s -= M[r * n + j] * x[j]; x[r] = s / M[r * n + r]; } return x; }
// columns: link-1 modes feed BOTH w1 (j=0) and s1 (j=1) with their own gains; link-2 modes feed w2 (j=2)
const featCache = new Map();
function feat(R, K, link, w, z, i) { const key = `${K}|${link}|${w}|${z}|${i}`; if (!featCache.has(key)) featCache.set(key, link === 1 ? reson(R.u1, 2, i, w, z) : reson(R.u2, 3, i, w, z)); return featCache.get(key); }
function solve(R, K, m1, m2) {
  const cols = []; // each: { F, j, meta }
  for (const [mi, [w, z]] of m1.entries()) for (const j of [0, 1]) for (let i = 0; i < 2; i++) cols.push({ F: feat(R, K, 1, w, z, i), j, o: j, mi, i });
  for (const [mi, [w, z]] of m2.entries()) for (let i = 0; i < 3; i++) cols.push({ F: feat(R, K, 2, w, z, i), j: 2, o: 2, mi, i });
  const nf = cols.length, AtA = new Float64Array(nf * nf), Atb = new Float64Array(nf), split = Math.floor(0.8 * N), row = new Float64Array(2 * nf);
  for (let k = 3000; k < split; k++) { for (let a = 0; a < nf; a++) { const c = cols[a]; row[2 * a] = R.G[6 * k + 2 * c.j] * c.F[k]; row[2 * a + 1] = R.G[6 * k + 2 * c.j + 1] * c.F[k]; }
    const r0 = yM[2 * k] - R.e[2 * k], r1 = yM[2 * k + 1] - R.e[2 * k + 1];
    for (let a = 0; a < nf; a++) { Atb[a] += row[2 * a] * r0 + row[2 * a + 1] * r1; for (let b = a; b < nf; b++) AtA[a * nf + b] += row[2 * a] * row[2 * b] + row[2 * a + 1] * row[2 * b + 1]; } }
  for (let a = 0; a < nf; a++) for (let b = 0; b < a; b++) AtA[a * nf + b] = AtA[b * nf + a];
  let dmax = 0; for (let a = 0; a < nf; a++) dmax = Math.max(dmax, AtA[a * nf + a]); for (let a = 0; a < nf; a++) AtA[a * nf + a] += 1e-9 * dmax;
  const x = gauss(AtA, Atb, nf);
  const miss = (k0, k1) => { let se = 0, ss = 0; for (let k = k0; k < k1; k++) for (let ch = 0; ch < 2; ch++) { let p = R.e[2 * k + ch]; for (let a = 0; a < nf; a++) p += x[a] * R.G[6 * k + 2 * cols[a].j + ch] * cols[a].F[k]; se += (p - yM[2 * k + ch]) ** 2; ss += yM[2 * k + ch] ** 2; } return Math.sqrt(se / ss); };
  return { x, cols, held: miss(split, N), m1, m2 };
}
const grid = []; for (let p = 300; p <= 12000; p *= 1.2) for (const z of [0.03, 0.1, 0.3, 0.6]) grid.push([2 * Math.PI / p, z]);
// the twin's physical parameters: k (gearbox K, multiplicative), payload (fraction of link mass), stiff (K rise at hold)
const phOf = (p) => ({ payload: p.payload, stiff: p.stiff });
async function pickModes(p, m1, m2) {   // modes re-picked on the grid at fixed physics
  const R = await rigidRun(BENCH.K * p.k, phOf(p)); const K = BENCH.K * p.k; let best = null;
  for (let pass = 0; pass < 4; pass++) for (const link of [1, 2]) { const cur = link === 1 ? m1 : m2, slot = cur.length < 2 ? cur.length : (pass % 2);
    let b = null; for (const g of grid) { const t = cur.slice(); t[slot] = g; const r = link === 1 ? solve(R, K, t, m2) : solve(R, K, m1, t); if (!b || r.held < b.held) b = r; }
    m1 = b.m1; m2 = b.m2; best = b; }
  featCache.clear(); return best;
}
async function gainsOnly(p, m1, m2) { const R = await rigidRun(BENCH.K * p.k, phOf(p)); const b = solve(R, BENCH.K * p.k, m1, m2); featCache.clear(); return b; }
const PHYS = (process.env.PHYS ?? 'payload,stiff').split(',').filter(Boolean);
const pp = (b) => `link1 ${b.m1.map(([w, z]) => `${(2 * Math.PI / w).toFixed(0)}/ζ${z}`).join('+')} · link2 ${b.m2.map(([w, z]) => `${(2 * Math.PI / w).toFixed(0)}/ζ${z}`).join('+')}`;
const ps = (p) => `K x${p.k.toFixed(3)} payload ${p.payload.toFixed(3)} stiff ${p.stiff.toFixed(3)}`;
// THE PHYSICS IS SEARCHED AGAINST A FIXED, RICH BANK OF MODES (gains by least squares), so its
// objective does not hinge on a discrete mode choice made under the wrong physics; the compact
// two-mode twin is picked only once the physics is settled.
const BANK = []; for (let q = 400; q <= 6400; q *= Math.SQRT2) for (const z of [0.1, 0.4]) BANK.push([2 * Math.PI / q, z]);
const bankMiss = async (p) => { const R = await rigidRun(BENCH.K * p.k, phOf(p)); const b = solve(R, BENCH.K * p.k, BANK, BANK); featCache.clear(); return b.held; };
let p = { k: 1, payload: 0, stiff: 0 }, best = Infinity;
const KG = [0.8, 1, 1.25], PG = PHYS.includes('payload') ? [0, 0.1, 0.2, 0.3] : [0], SG = PHYS.includes('stiff') ? [0, 0.25, 0.5, 0.75] : [0];
for (const k of KG) for (const payload of PG) for (const stiff of SG) { const q = { k, payload, stiff }, c = await bankMiss(q); if (c < best) { best = c; p = q; } }
console.log(`grid (${KG.length * PG.length * SG.length} rigid runs, bank of ${BANK.length} modes per link): ${ps(p)} · misses by ${(100 * best).toFixed(2)}%`);
{ const steps = { k: 0.1, payload: 0.05, stiff: 0.125 }, names = ['k', ...PHYS];
  for (let it = 0; it < 60; it++) { let moved = false;
    for (const n of names) for (const s of [1, -1]) { const q = { ...p }; q[n] = n === 'k' ? p.k * Math.exp(s * steps.k) : Math.max(0, p[n] + s * steps[n]); if (q[n] === p[n]) continue;
      const c = await bankMiss(q); if (c < best) { best = c; p = q; moved = true; } }
    if (!moved) { let small = true; for (const n of names) { steps[n] /= 2; if (steps[n] > (n === 'k' ? 0.01 : 0.005)) small = false; } if (small) break; } } }
console.log(`refined: ${ps(p)} · misses by ${(100 * best).toFixed(2)}% (bank)`);
let b = await pickModes(p, [], []);
console.log(`compact twin, two modes per link: ${pp(b)} · misses by ${(100 * b.held).toFixed(2)}%`);
const kf = p.k;
// write rtwin's format: per output [w1, s1, w2] { ms, x (mi*nu+i), nu }
const out = [0, 1, 2].map((o) => { const ms = o < 2 ? b.m1 : b.m2, nu = o < 2 ? 2 : 3, x = new Array(ms.length * nu).fill(0); b.cols.forEach((c, a) => { if (c.o === o) x[c.mi * nu + c.i] = b.x[a]; }); return { ms, x, nu, nrmse: b.held }; });
writeFileSync(OUT, JSON.stringify({ K: BENCH.K * kf, phys: phOf(p), fit: out }));
console.log(`IDENTIFIED FROM THE TOOL: ${ps(p)} · ${pp(b)} · held-out miss ${(100 * b.held).toFixed(2)}%`);
