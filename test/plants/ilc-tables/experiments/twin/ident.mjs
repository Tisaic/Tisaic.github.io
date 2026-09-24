// IDENTIFY THE TWIN from the machine: record the machine's tool response (in joint coordinates) to a
// commissioning excitation, then search gearbox stiffness K, link stiffness E and link damping D of a
// twin (same structure) to reproduce it. The machine's true values are never read.
import { buildArm, calibrateComp, ikOf, conventional, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
import { writeFileSync } from 'node:fs';
const N = +(process.env.N || 40000), TRUE = { K: BENCH.K, E: BENCH.E, D: BENCH.DAMPING };
const real = await buildArm(); const ik = ikOf(real.arm.L1, real.arm.L2), rc = await calibrateComp(real);
// the excitation: smooth random moves around the workspace centre, at program-like speeds
const home = [-0.8, 2.0]; let sd = 11 >>> 0; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
const exc = new Float64Array(2 * N); const lo = [-1.2, 1.6], hi = [-0.35, 2.5];
for (let c = 0; c < 2; c++) { let t = 0, from = home[c]; while (t < N) { const to = lo[c] + (hi[c] - lo[c]) * rnd(); const T = Math.max(150, Math.ceil(1.875 * Math.abs(to - from) / (3e-4 * (0.4 + 0.8 * rnd())))); const hold = Math.floor(rnd() * 1500); for (let i = 0; i < T + hold && t < N; i++, t++) { const u = Math.min(1, i / T); exc[2 * t + c] = from + (to - from) * u * u * u * (10 - 15 * u + 6 * u * u); } from = to; } }
async function respond(K, E, D) {
  const saved = BENCH.DAMPING; BENCH.DAMPING = D; const m = await buildArm(K, E); BENCH.DAMPING = saved;
  await driveTo(m.arm, m.servo, home, BENCH.feed); const c = conventional(m, rc); c.reset(home); for (let k = 0; k < 6000; k++) c.step(home);
  const y = new Float64Array(2 * N); for (let k = 0; k < N; k++) { c.step([exc[2 * k], exc[2 * k + 1]]); const t = m.arm.toolXY(), q = ik(t[0], t[1]); y[2 * k] = q[0] - exc[2 * k]; y[2 * k + 1] = q[1] - exc[2 * k + 1]; }
  await m.l1.destroy(); await m.l2.destroy(); return y;
}
const yM = await respond(TRUE.K, TRUE.E, TRUE.D);      // THE MACHINE (its values are used only to build it)
let ss = 0; for (let i = 0; i < 2 * N; i++) ss += yM[i] ** 2;
const cost = async (p) => { const y = await respond(TRUE.K * p[0], TRUE.E * p[1], TRUE.D * p[2]); let s = 0; for (let i = 0; i < 2 * N; i++) s += (y[i] - yM[i]) ** 2; return Math.sqrt(s / ss); };
// start WRONG, then a coordinate search in log space (a PLC would slice this; here it is offline)
let p = [1.2, 0.8, 1.5], best = await cost(p), step = 0.25, evals = 1;
console.log(`start K x${p[0]} E x${p[1]} D x${p[2]}: twin misses the machine's error by ${(100 * best).toFixed(1)}%`);
while (step > 0.01 && evals < 90) {
  let moved = false;
  for (let i = 0; i < 3; i++) for (const s of [1, -1]) { const q = p.slice(); q[i] *= Math.exp(s * step); const c = await cost(q); evals++; if (c < best) { best = c; p = q; moved = true; } }
  if (!moved) step /= 2;
  console.log(`  step ${step.toFixed(3)}: K x${p[0].toFixed(3)} E x${p[1].toFixed(3)} D x${p[2].toFixed(3)} · misses by ${(100 * best).toFixed(2)}% (${evals} twin runs)`);
}
writeFileSync('ident.json', JSON.stringify({ p, best }));
console.log(`IDENTIFIED: K x${p[0].toFixed(3)} E x${p[1].toFixed(3)} D x${p[2].toFixed(3)} (truth 1/1/1), residual ${(100 * best).toFixed(2)}%`);
