// A DIGITAL TWIN: the correction for an UNSEEN program is learned entirely on a model of the arm
// (same structure; its stiffnesses exact or deliberately wrong), offline, then applied ONCE to the
// real machine. The twin runs the MACHINE's own conventional controller (its calibration is known to
// the host). The learning on the twin is the stored tables' P-type algorithm.
import { buildArm, calibrateComp, ikOf, jointProgram, benchProgram, conventional, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
import { sharpRect, roundedRect, circle } from '../../../../../lib/flexisim/toolpath.js';
const IT = +(process.env.IT || 15), KF = +(process.env.KF || 1), EF = +(process.env.EF || 1), DF = +(process.env.DF || 1);
const real = await buildArm(); const ik = ikOf(real.arm.L1, real.arm.L2), rcReal = await calibrateComp(real);
const P = (o) => ({ ...o, accel: BENCH.ACCEL, cornerStop: true, dwell: BENCH.JERK });
const J = (path) => jointProgram(path, ik, { smooth: BENCH.JERK });
const WORK = [
  ['sq6@(11,1) f2.5', J(sharpRect(P({ w: 6, h: 6, centre: [11, 1], feed: 2.5e-3 })))],
  ['circ3@(13,-1) f3', J(circle(P({ r: 3, centre: [13, -1], feed: 3e-3 })))],
  ['rnd8x6@(12,0) f2.5', J(roundedRect(P({ w: 8, h: 6, r: 2, closed: true, centre: [12, 0], feed: 2.5e-3 })))],
  ['bench sharp 3e-3', benchProgram('sharp', 3e-3, ik)],
].filter((w) => !process.env.ONLY || w[0].startsWith(process.env.ONLY)).map(([name, prog]) => ({ name, prog }));
const o4 = new Float64Array(2);
async function machine(K, E, rc, prog, D = BENCH.DAMPING) { const saved = BENCH.DAMPING; BENCH.DAMPING = D; const m = await buildArm(K, E); BENCH.DAMPING = saved; await driveTo(m.arm, m.servo, prog.at(0), BENCH.feed); const c = conventional(m, rc); c.reset(prog.at(0));
  for (let k = 0; k < prog.lap; k++) c.step(prog.at(k));   // settle one lap on the program, as the plant library does
  return { m, c, meas: (o) => { const t = m.arm.toolXY(), q = ik(t[0], t[1]); o[0] = q[0]; o[1] = q[1]; }, step: (sp) => c.step(sp), done: async () => { await m.l1.destroy(); await m.l2.destroy(); } }; }
function lapOn(mc, prog, U) { const L = prog.lap, e = new Float64Array(2 * L); for (let k = 0; k < L; k++) { mc.meas(o4); const r = prog.at(k); e[2 * k] = o4[0] - r[0]; e[2 * k + 1] = o4[1] - r[1]; mc.step([r[0] + U[2 * k], r[1] + U[2 * k + 1]]); } return e; }
const rmsOf = (e, L) => { const d = Math.ceil(0.05 * L), s = [0, 0]; for (let k = d; k < L; k++) for (let c = 0; c < 2; c++) s[c] += e[2 * k + c] ** 2; return s.map((x) => Math.sqrt(x / (L - d))); };
function Qc(x, c, W, L) { let y = Float64Array.from({ length: L }, (_, k) => x[2 * k + c]); for (let p = 0; p < 2; p++) { const z = new Float64Array(L); let s = 0; for (let j = -W; j <= W; j++) s += y[((j % L) + L) % L]; for (let k = 0; k < L; k++) { z[k] = s / (2 * W + 1); s += y[(k + W + 1) % L] - y[((k - W) % L + L) % L]; } y = z; } return y; }
console.log(`twin: gearbox K x${KF}, link E x${EF}, link damping x${DF} (1 = exact); ${IT} learning steps on the twin, none on the machine`);
for (const { name, prog } of WORK) {
  const L = prog.lap;
  // ---- learn on the TWIN
  const tw = await machine(BENCH.K * KF, BENCH.E * EF, rcReal, prog, BENCH.DAMPING * DF);
  const CANDS = []; for (const t of [1 / 128, 1 / 64, 1 / 256, 1 / 32]) for (const w of [1 / 100, 1 / 200]) CANDS.push([Math.max(0, Math.round(t * L)), Math.max(1, Math.round(w * L))]);
  let U = new Float64Array(2 * L); lapOn(tw, prog, U); let E = lapOn(tw, prog, U); const r0 = rmsOf(E, L);
  const st = [0, 1].map((c) => ({ ci: 0, beta: 0.5, rej: 0, rms: r0[c] }));
  for (let it = 0; it < IT; it++) {
    const Un = U.slice();
    for (let c = 0; c < 2; c++) { const s = st[c], [tau, W] = CANDS[s.ci], d = new Float64Array(2 * L); for (let k = 0; k < L; k++) d[2 * k + c] = U[2 * k + c] - s.beta * E[2 * ((k + tau) % L) + c]; const q = Qc(d, c, W, L); for (let k = 0; k < L; k++) Un[2 * k + c] = q[k]; }
    lapOn(tw, prog, Un); const En = lapOn(tw, prog, Un), r = rmsOf(En, L), imp = st.map((s, c) => r[c] < s.rms), good = st.map((s, c) => r[c] < s.rms * 0.98);
    st.forEach((s, c) => { if (!imp[c]) s.beta *= 0.5; if (good[c]) s.rej = 0; else if (++s.rej >= 3) { s.ci = (s.ci + 1) % CANDS.length; s.rej = 0; s.beta = Math.min(0.5, 4 * s.beta); } });
    if (imp.every(Boolean)) { U = Un; E = En; st.forEach((s, c) => { s.rms = r[c]; }); }
    else if (imp.some(Boolean)) { for (let c = 0; c < 2; c++) if (imp[c]) for (let k = 0; k < L; k++) U[2 * k + c] = Un[2 * k + c]; lapOn(tw, prog, U); const Ek = lapOn(tw, prog, U), rk = rmsOf(Ek, L); E = Ek; st.forEach((s, c) => { s.rms = rk[c]; }); }
  }
  const twinX = 1 / Math.sqrt(((st[0].rms / r0[0]) ** 2 + (st[1].rms / r0[1]) ** 2) / 2);
  await tw.done();
  // ---- apply ONCE to the real machine (fresh, settled on the program untouched)
  const rm = await machine(BENCH.K, BENCH.E, rcReal, prog);
  const bare = rmsOf(lapOn(rm, prog, new Float64Array(2 * L)), L);
  lapOn(rm, prog, U); const got = rmsOf(lapOn(rm, prog, U), L);      // a lap to switch in, then the scored lap
  await rm.done();
  const x = 1 / Math.sqrt(((got[0] / bare[0]) ** 2 + (got[1] / bare[1]) ** 2) / 2);
  console.log(`${name.padEnd(20)} on the twin ${twinX.toFixed(2)}x · on the REAL machine, first use: ${x.toFixed(2)}x`);
}
