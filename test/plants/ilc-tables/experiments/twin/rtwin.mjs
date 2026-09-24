// A REDUCED-ORDER TWIN: the arm's rigid chain, joints and servo exactly as built, but each lattice link
// replaced by a few resonant modes driven by the frame inputs the lattice sees (fitted from the link's
// own tip signals on an excitation). Step 2: does it predict the lattice machine's tool error on unseen
// programs? Step 3: learn the correction on it, apply once to the lattice machine.
import { buildArm, calibrateComp, ikOf, jointProgram, benchProgram, conventional, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
import { tipDeflection, tipSlope } from '../../../../../lib/flexisim/link.js';
import { sharpRect, roundedRect, circle } from '../../../../../lib/flexisim/toolpath.js';
import { cornerSignatures } from '../../../../../lib/flexisim/contour.js';
import { machineArm, physics } from './mismatch.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const N = +(process.env.N || 60000), IT = +(process.env.IT || 15), MODES = +(process.env.MODES || 2);
const MM = process.env.MM || '', m = await machineArm(MM), ik = ikOf(m.arm.L1, m.arm.L2), rc = await calibrateComp(m), A = m.arm;
const home = [-0.8, 2.0];
// ---------- 1. fit the modal links (cached)
const FITF = process.env.MODAL || `modal-${MODES}.json`;
let FIT, KT = BENCH.K, PH = {};
if (existsSync(FITF)) { const j = JSON.parse(readFileSync(FITF, 'utf8')); if (j.fit) { FIT = j.fit; KT = j.K; PH = j.phys || {}; } else FIT = j; }
else {
  let sd = 11 >>> 0; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
  const exc = new Float64Array(2 * N), lo = [-1.2, 1.6], hi = [-0.35, 2.5];
  for (let c = 0; c < 2; c++) { let t = 0, from = home[c]; while (t < N) { const to = lo[c] + (hi[c] - lo[c]) * rnd(); const T = Math.max(150, Math.ceil(1.875 * Math.abs(to - from) / (3e-4 * (0.4 + 0.8 * rnd())))); const hold = Math.floor(rnd() * 1500); for (let i = 0; i < T + hold && t < N; i++, t++) { const u = Math.min(1, i / T); exc[2 * t + c] = from + (to - from) * u * u * u * (10 - 15 * u + 6 * u * u); } from = to; } }
  await driveTo(A, m.servo, home, BENCH.feed); const c = conventional(m, rc); c.reset(home); for (let k = 0; k < 6000; k++) c.step(home);
  const U = [new Float64Array(2 * N), new Float64Array(3 * N)], Y = new Float64Array(3 * N);
  for (let k = 0; k < N; k++) { c.step([exc[2 * k], exc[2 * k + 1]]); const f = inputs(A); U[0][2 * k] = f[0][0]; U[0][2 * k + 1] = f[0][1]; for (let i = 0; i < 3; i++) U[1][3 * k + i] = f[1][i];
    Y[3 * k] = tipDeflection(A.l1); Y[3 * k + 1] = tipSlope(A.l1); Y[3 * k + 2] = tipDeflection(A.l2); }
  FIT = [[0, 2, 0], [0, 2, 1], [1, 3, 2]].map(([ui, nu, oi]) => fitOutput(U[ui], nu, Y, oi, N));
  writeFileSync(FITF, JSON.stringify(FIT));
}
if (MM) console.log(`MACHINE: ${MM} (the twin is nominal)`);
console.log(`twin gearbox K ${KT} (machine ${BENCH.K}), physics ${JSON.stringify(PH)}, modes from ${FITF}`);
for (const [i, f] of FIT.entries()) console.log(`${['w1', 's1', 'w2'][i]}: ${f.ms.map(([w, z]) => `${(2 * Math.PI / w).toFixed(0)} scans ζ${z}`).join(' + ')} · held-out NRMSE ${f.nrmse.toFixed(4)}`);
function inputs(a) { const f1 = a.frameParams(0), f2 = a.frameParams(1); return [[f1.gravity[1], f1.alpha[2]], [f2.gravity[1], f2.alpha[2], f2.originAccel[1]]]; }
function reson(u, stride, idx, n, w, z) { const out = new Float64Array(n); let y = 0, v = 0; for (let k = 0; k < n; k++) { v += (u[stride * k + idx] - 2 * z * w * v - w * w * y); y += v; out[k] = y; } return out; }
function fitOutput(Uin, nu, Y, oi, n) {
  const split = Math.floor(n * 0.8), grid = []; for (let p = 200; p <= 20000; p *= 1.15) for (const z of [0.01, 0.03, 0.1, 0.3, 0.6]) grid.push([2 * Math.PI / p, z]);
  const tryModes = (ms) => { const F = []; for (const [w, z] of ms) for (let i = 0; i < nu; i++) F.push(reson(Uin, nu, i, n, w, z));
    const nf = F.length, AtA = new Float64Array(nf * nf), Atb = new Float64Array(nf);
    for (let k = 3000; k < split; k++) for (let i = 0; i < nf; i++) { Atb[i] += F[i][k] * Y[3 * k + oi]; for (let j = 0; j < nf; j++) AtA[i * nf + j] += F[i][k] * F[j][k]; }
    let dmax = 0; for (let i = 0; i < nf; i++) dmax = Math.max(dmax, AtA[i * nf + i]); for (let i = 0; i < nf; i++) AtA[i * nf + i] += 1e-10 * dmax;
    const x = gauss(AtA, Atb, nf); let se = 0, ss = 0; for (let k = split; k < n; k++) { let p = 0; for (let i = 0; i < nf; i++) p += x[i] * F[i][k]; se += (p - Y[3 * k + oi]) ** 2; ss += Y[3 * k + oi] ** 2; }
    return { ms, x: Array.from(x), nrmse: Math.sqrt(se / ss), nu }; };
  let best = null; for (const g of grid) { const r = tryModes([g]); if (!best || r.nrmse < best.nrmse) best = r; }
  for (let md = 2; md <= MODES; md++) { let b2 = best; for (const g of grid) { const r = tryModes([...best.ms, g]); if (r.nrmse < b2.nrmse) b2 = r; } best = b2; }
  return best;
}
function gauss(Am, b, n) { const M = Float64Array.from(Am), x = Float64Array.from(b); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[p * n + c])) p = r; for (let j = 0; j < n; j++) { const t = M[c * n + j]; M[c * n + j] = M[p * n + j]; M[p * n + j] = t; } { const t = x[c]; x[c] = x[p]; x[p] = t; } for (let r = c + 1; r < n; r++) { const f = M[r * n + c] / M[c * n + c]; for (let j = c; j < n; j++) M[r * n + j] -= f * M[c * n + j]; x[r] -= f * x[c]; } } for (let r = n - 1; r >= 0; r--) { let s = x[r]; for (let j = r + 1; j < n; j++) s -= M[r * n + j] * x[j]; x[r] = s / M[r * n + r]; } return x; }
// ---------- 2. the reduced twin: same chain, links replaced by the modes
async function reducedTwin(K = BENCH.K) {
  const t = await buildArm(K, BENCH.E), a = t.arm; physics(a, PH); const rigidStep = a.stepRigid;
  const st = FIT.map((f) => f.ms.map(() => new Float64Array(2 * f.nu)));   // per output, per mode: [y_i, v_i] per input
  const out = new Float64Array(3);
  a.step = function (tc1, tc2, dt, load = null) {
    const t1 = this.j1.stepMotor(tc1, dt), t2 = this.j2.stepMotor(tc2, dt);
    rigidStep.call(this, t1 + (load ? load[0] : 0), t2 + (load ? load[1] : 0), dt);
    const u = inputs(this);
    FIT.forEach((f, o) => { const uu = u[o === 2 ? 1 : 0]; let s = 0;
      f.ms.forEach(([w, z], mi) => { const S = st[o][mi]; for (let i = 0; i < f.nu; i++) { let y = S[2 * i], v = S[2 * i + 1]; v += uu[i] - 2 * z * w * v - w * w * y; y += v; S[2 * i] = y; S[2 * i + 1] = v; s += f.x[mi * f.nu + i] * y; } });
      out[o] = s; });
    return this;
  };
  a.toolXY = function () { const q1 = this.q[0], q2 = this.q[1], [w1, s1, w2] = out, c1 = Math.cos(q1), sn1 = Math.sin(q1);
    const ex = c1 * this.L1 - sn1 * w1, ey = sn1 * this.L1 + c1 * w1, a2 = q1 + s1 + q2, c2 = Math.cos(a2), sn2 = Math.sin(a2);
    return [ex + c2 * this.L2 - sn2 * w2, ey + sn2 * this.L2 + c2 * w2]; };
  await t.l1.destroy(); await t.l2.destroy();
  return t;
}
// ---------- the programs (never used in the fit)
const P = (o) => ({ ...o, accel: BENCH.ACCEL, cornerStop: true, dwell: BENCH.JERK });
const J = (path) => jointProgram(path, ik, { smooth: BENCH.JERK });
const WORK = [
  ['sq6@(11,1) f2.5', J(sharpRect(P({ w: 6, h: 6, centre: [11, 1], feed: 2.5e-3 })))],
  ['circ3@(13,-1) f3', J(circle(P({ r: 3, centre: [13, -1], feed: 3e-3 })))],
  ['rnd8x6@(12,0) f2.5', J(roundedRect(P({ w: 8, h: 6, r: 2, closed: true, centre: [12, 0], feed: 2.5e-3 })))],
  ['bench sharp 3e-3', benchProgram('sharp', 3e-3, ik)],
  ...(process.env.ALL ? [
  ['rect7x5@(12,0.5) f1.5', J(sharpRect(P({ w: 7, h: 5, centre: [12, 0.5], feed: 1.5e-3 })))],
  ['rnd6@(12.5,-0.5) f2', J(roundedRect(P({ w: 6, h: 6, r: 1.2, closed: true, centre: [12.5, -0.5], feed: 2e-3 })))],
  ['circ3.5@(11.5,0.5) f2', J(circle(P({ r: 3.5, centre: [11.5, 0.5], feed: 2e-3 })))],
  ['sq5@(13,1) f3', J(sharpRect(P({ w: 5, h: 5, centre: [13, 1], feed: 3e-3 })))],
  ['circ2.5@(12,-1.5) f1', J(circle(P({ r: 2.5, centre: [12, -1.5], feed: 1e-3 })))]] : []),
].filter((w) => !process.env.ONLY || w[0].startsWith(process.env.ONLY)).map(([name, prog]) => ({ name, prog }));
const o4 = new Float64Array(2);
async function settle(t, prog) { await driveTo(t.arm, t.servo, prog.at(0), BENCH.feed); const c = conventional(t, rc); c.reset(prog.at(0)); for (let k = 0; k < prog.lap; k++) c.step(prog.at(k));
  let last = [0, 0]; return { tool: () => last, meas: (o) => { const p = t.arm.toolXY(); last = p; const q = ik(p[0], p[1]); o[0] = q[0]; o[1] = q[1]; }, step: (sp) => c.step(sp) }; }
function lapOn(mc, prog, U, T = null) { const L = prog.lap, e = new Float64Array(2 * L); for (let k = 0; k < L; k++) { mc.meas(o4); if (T) { const p = mc.tool(); T[2 * k] = p[0]; T[2 * k + 1] = p[1]; } const r = prog.at(k); e[2 * k] = o4[0] - r[0]; e[2 * k + 1] = o4[1] - r[1]; mc.step([r[0] + U[2 * k], r[1] + U[2 * k + 1]]); } return e; }
const rmsOf = (e, L) => { const d = Math.ceil(0.05 * L), s = [0, 0]; for (let k = d; k < L; k++) for (let c = 0; c < 2; c++) s[c] += e[2 * k + c] ** 2; return s.map((x) => Math.sqrt(x / (L - d))); };
function Qc(x, c, W, L) { let y = Float64Array.from({ length: L }, (_, k) => x[2 * k + c]); for (let p = 0; p < 2; p++) { const z = new Float64Array(L); let s = 0; for (let j = -W; j <= W; j++) s += y[((j % L) + L) % L]; for (let k = 0; k < L; k++) { z[k] = s / (2 * W + 1); s += y[(k + W + 1) % L] - y[((k - W) % L + L) % L]; } y = z; } return y; }
const nrmse = (a, b, L) => { const d = Math.ceil(0.05 * L); let se = 0, ss = 0; for (let k = 2 * d; k < 2 * L; k++) { se += (a[k] - b[k]) ** 2; ss += b[k] ** 2; } return Math.sqrt(se / ss); };
for (const { name, prog } of WORK) {
  const L = prog.lap, t0 = Date.now();
  const tw = await settle(await reducedTwin(KT), prog);
  let U = new Float64Array(2 * L); lapOn(tw, prog, U); let E = lapOn(tw, prog, U); const Etw0 = E, r0 = rmsOf(E, L);
  const CANDS = []; for (const t of [1 / 128, 1 / 64, 1 / 256, 1 / 32]) for (const w of [1 / 100, 1 / 200]) CANDS.push([Math.max(0, Math.round(t * L)), Math.max(1, Math.round(w * L))]);
  const st = [0, 1].map((c) => ({ ci: 0, beta: 0.5, rej: 0, rms: r0[c] }));
  for (let it = 0; it < IT; it++) {
    const Un = U.slice();
    for (let c = 0; c < 2; c++) { const s = st[c], [tau, W] = CANDS[s.ci], d = new Float64Array(2 * L); for (let k = 0; k < L; k++) d[2 * k + c] = U[2 * k + c] - s.beta * E[2 * ((k + tau) % L) + c]; const q = Qc(d, c, W, L); for (let k = 0; k < L; k++) Un[2 * k + c] = q[k]; }
    lapOn(tw, prog, Un); const En = lapOn(tw, prog, Un), r = rmsOf(En, L), imp = st.map((s, c) => r[c] < s.rms), good = st.map((s, c) => r[c] < s.rms * 0.98);
    st.forEach((s, c) => { if (!imp[c]) s.beta *= 0.5; if (good[c]) s.rej = 0; else if (++s.rej >= 3) { s.ci = (s.ci + 1) % CANDS.length; s.rej = 0; s.beta = Math.min(0.5, 4 * s.beta); } });
    if (imp.every(Boolean)) { U = Un; E = En; st.forEach((s, c) => { s.rms = r[c]; }); }
    else if (imp.some(Boolean)) { for (let c = 0; c < 2; c++) if (imp[c]) for (let k = 0; k < L; k++) U[2 * k + c] = Un[2 * k + c]; lapOn(tw, prog, U); const Ek = lapOn(tw, prog, U), rk = rmsOf(Ek, L); E = Ek; st.forEach((s, c) => { s.rms = rk[c]; }); }
  }
  const twinX = 1 / Math.sqrt(((st[0].rms / r0[0]) ** 2 + (st[1].rms / r0[1]) ** 2) / 2), tTwin = (Date.now() - t0) / 1000;
  // the LATTICE machine: untouched lap (the twin's prediction is compared with it), then the twin's correction once
  const rm = await machineArm(MM); const mc = await settle(rm, prog);
  const T0 = new Float64Array(2 * L), T1 = new Float64Array(2 * L);
  const Em = lapOn(mc, prog, new Float64Array(2 * L), T0), bare = rmsOf(Em, L);
  lapOn(mc, prog, U); const got = rmsOf(lapOn(mc, prog, U, T1), L);
  const cs = (T) => { try { const c = cornerSignatures(prog, T, { smooth: BENCH.JERK }); return c.n ? `not-common ${c.osc.toExponential(1)} (${(100 * c.spread).toFixed(0)}%) fast ${c.roughAbs.toExponential(1)} (${(100 * c.rough).toFixed(1)}%) peak ${c.peak.toExponential(2)}` : 'no corners'; } catch (err) { return `corners: ${err.message}`; } };
  await rm.l1.destroy(); await rm.l2.destroy();
  const x = 1 / Math.sqrt(((got[0] / bare[0]) ** 2 + (got[1] / bare[1]) ** 2) / 2);
  console.log(`${name.padEnd(20)} twin predicts the untouched error to ${(100 * nrmse(Etw0, Em, L)).toFixed(1)}% · on the twin ${twinX.toFixed(2)}x (${tTwin.toFixed(0)} s for ${2 * (IT + 1)} laps) · on the LATTICE machine, first use: ${x.toFixed(2)}x`);
  console.log(`     corners untouched: ${cs(T0)}\n     corners corrected: ${cs(T1)}`);
}
