// Lap learning toward a DESIGNED TARGET: the program's tool path through a zero-phase isotropic
// smoother (a moving average applied twice, width T, in x and y alike), mapped to joints. Scored
// against the ORIGINAL setpoint: tool rms (contour + lag), corner spread and roughness, saturation.
import { buildArm, calibrateComp, ikOf, jointProgram, benchProgram, conventional, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
import { decompose, cornerSignatures } from '../../../../../lib/flexisim/contour.js';
import { sharpRect } from '../../../../../lib/flexisim/toolpath.js';
const pr = await buildArm(); const ik = ikOf(pr.arm.L1, pr.arm.L2); await pr.l1.destroy(); await pr.l2.destroy();
const WHICH = process.env.WHICH || 'old', T = +(process.env.T || 0), IT = +(process.env.IT || 25);
const prog = WHICH === 'old' ? jointProgram(sharpRect({ w: 8, h: 8, centre: BENCH.centre, feed: 3e-3, accel: 4e-5, cornerDt: 40 }), ik) : benchProgram('sharp', 3e-3, ik);
const L = prog.lap;
// the target: tool xy through MA∘MA of width T (circular), then IK
const xy = new Float64Array(2 * L); for (let k = 0; k < L; k++) { const c = prog.cmd(k); xy[2 * k] = c.x; xy[2 * k + 1] = c.y; }
const ma = (a, W) => { if (W <= 1) return a.slice(); const o = new Float64Array(a.length), lo = -Math.floor(W / 2); for (let c = 0; c < 2; c++) { let s = 0; const v = (k) => a[2 * (((k % L) + L) % L) + c]; for (let j = lo; j < lo + W; j++) s += v(j); for (let k = 0; k < L; k++) { o[2 * k + c] = s / W; s += v(k + lo + W) - v(k + lo); } } return o; };
const txy = ma(ma(xy, T), T), qd = new Float64Array(2 * L);
for (let k = 0; k < L; k++) { const q = ik(txy[2 * k], txy[2 * k + 1]); qd[2 * k] = q[0]; qd[2 * k + 1] = q[1]; }
const m = await buildArm(); const rc = await calibrateComp(m);
await driveTo(m.arm, m.servo, prog.at(0), BENCH.feed);
const c = conventional(m, rc); c.reset(prog.at(0));
const tool = new Float64Array(2 * L);
function lap(U) { const e = new Float64Array(2 * L); m.servo.resetLimitStats(); let ss = 0;
  for (let k = 0; k < L; k++) { const t = m.arm.toolXY(), q = ik(t[0], t[1]); e[2 * k] = q[0] - qd[2 * k]; e[2 * k + 1] = q[1] - qd[2 * k + 1];
    const r = prog.at(k); c.step([r[0] + U[2 * k], r[1] + U[2 * k + 1]]);
    const t2 = m.arm.toolXY(); tool[2 * k] = t2[0]; tool[2 * k + 1] = t2[1]; const d = decompose(prog.path, t2, prog.cmd(k)); ss += d.contour ** 2 + d.lag ** 2; }
  return { e, rms: Math.sqrt(ss / L), sat: Math.max(...m.servo.limitStats().map((x) => x.fraction)) }; }
const run = (U) => { lap(U); return lap(U); };
const chRms = (e) => [0, 1].map((cc) => { let s = 0; for (let k = 0; k < L; k++) s += e[2 * k + cc] ** 2; return Math.sqrt(s / L); });
const report = (label, r) => { const cs = cornerSignatures(prog, tool, { smooth: BENCH.JERK }); let td = 0; for (let k = 0; k < L; k++) td += (tool[2 * k] - txy[2 * k]) ** 2 + (tool[2 * k + 1] - txy[2 * k + 1]) ** 2;
  console.log(`${WHICH} sharp, target T=${T}, ${label.padEnd(12)} vs setpoint rms ${r.rms.toExponential(3)} · vs target ${Math.sqrt(td / L).toExponential(3)} · corners ${(100 * cs.spread).toFixed(1)}% not common, rough ${(100 * cs.rough).toFixed(1)}%, peak ${cs.peak.toExponential(2)} · saturated ${(100 * r.sat).toFixed(2)}%`); };
// the designed error alone: what a perfect machine following the target would show against the setpoint
{ let ss = 0; for (let k = 0; k < L; k++) { const d = decompose(prog.path, [txy[2 * k], txy[2 * k + 1]], prog.cmd(k)); ss += d.contour ** 2 + d.lag ** 2; } const t0 = tool.slice(); tool.set(txy); const cs = cornerSignatures(prog, tool, { smooth: BENCH.JERK }); tool.set(t0);
  console.log(`${WHICH} sharp, target T=${T}, the target itself: vs setpoint rms ${Math.sqrt(ss / L).toExponential(3)} · corners ${(100 * cs.spread).toFixed(1)}% not common, rough ${(100 * cs.rough).toFixed(1)}%`); }
let U = new Float64Array(2 * L); let r0 = run(U); report('machine', r0);
// adaptive P-type lap learning toward the target (the stored tables' algorithm)
const CANDS = []; for (const t of [1 / 128, 1 / 64, 1 / 256, 1 / 32]) for (const w of [1 / 100, 1 / 200]) CANDS.push([Math.max(0, Math.round(t * L)), Math.max(1, Math.round(w * L))]);
function Qc(x, cc, W) { let y = Float64Array.from({ length: L }, (_, k) => x[2 * k + cc]); for (let p = 0; p < 2; p++) { const z = new Float64Array(L); let s = 0; for (let j = -W; j <= W; j++) s += y[((j % L) + L) % L]; for (let k = 0; k < L; k++) { z[k] = s / (2 * W + 1); s += y[(k + W + 1) % L] - y[((k - W) % L + L) % L]; } y = z; } return y; }
let E = r0.e, best = r0; const rms0 = chRms(E); const st = [0, 1].map((cc) => ({ ci: 0, beta: 0.5, rej: 0, rms: rms0[cc] }));
for (let it = 0; it < IT; it++) {
  const Un = U.slice();
  for (let cc = 0; cc < 2; cc++) { const s = st[cc], [tau, W] = CANDS[s.ci]; const d = new Float64Array(2 * L); for (let k = 0; k < L; k++) d[2 * k + cc] = U[2 * k + cc] - s.beta * E[2 * ((k + tau) % L) + cc]; const q = Qc(d, cc, W); for (let k = 0; k < L; k++) Un[2 * k + cc] = q[k]; }
  const rn = run(Un), r = chRms(rn.e);
  const imp = st.map((s, cc) => r[cc] < s.rms), good = st.map((s, cc) => r[cc] < s.rms * 0.98);
  st.forEach((s, cc) => { if (!imp[cc]) s.beta *= 0.5; if (good[cc]) s.rej = 0; else if (++s.rej >= 3) { s.ci = (s.ci + 1) % CANDS.length; s.rej = 0; s.beta = Math.min(0.5, 4 * s.beta); } });
  if (imp.every(Boolean)) { U = Un; E = rn.e; st.forEach((s, cc) => { s.rms = r[cc]; }); best = rn; }
  else if (imp.some(Boolean)) { for (let cc = 0; cc < 2; cc++) if (imp[cc]) for (let k = 0; k < L; k++) U[2 * k + cc] = Un[2 * k + cc]; const rk = run(U), rr = chRms(rk.e); E = rk.e; st.forEach((s, cc) => { s.rms = rr[cc]; }); best = rk; }
}
report('learned', run(U));
