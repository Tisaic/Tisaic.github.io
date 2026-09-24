// Learn the exact per-scan correction on ONE arm program and store it here: the target a
// transferable model must reproduce. The learning is FB_AutoFF's program-table algorithm run
// standalone on the conventional machine (no block rungs underneath): P-type ILC, per channel a
// (lead, width) candidate from a lap-scaled ladder, per-channel keep/reject, every table measured
// on its second lap. Usage (from the repo root):
//   SHAPE=sharp FEED=3e-3 IT=35 node test/plants/ilc-tables/gen.mjs
// writes <shape>-<feed>.f64 and updates manifest.json. About 3 min at 3e-3, 5 min at 2e-3.
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { arm2r } from '../arm2r.mjs';
import { benchProgram, ikOf, buildArm } from '../../../lib/flexisim/bench.js';
const SHAPE = process.env.SHAPE, FEED = +process.env.FEED, IT = +(process.env.IT || 35);
const pr = await buildArm(); const ik = ikOf(pr.arm.L1, pr.arm.L2); await pr.l1.destroy(); await pr.l2.destroy();
const prog = benchProgram(SHAPE, FEED, ik), L = prog.lap, nc = 2;
const CANDS = [];
for (const t of [1 / 128, 1 / 64, 1 / 256, 1 / 32]) for (const w of [1 / 100, 1 / 200]) CANDS.push([Math.max(0, Math.round(t * L)), Math.max(1, Math.round(w * L))]);
const m = await arm2r.make(prog); const o = new Float64Array(4);
function lap(U) { const e = new Float64Array(nc * L); for (let k = 0; k < L; k++) { m.meas(o); const r = prog.at(k); for (let c = 0; c < nc; c++) e[nc * k + c] = o[c] - r[c]; m.step(r.map((x, c) => x + U[nc * k + c])); } return e; }
const run = (U) => { lap(U); return lap(U); };
const chRms = (e) => { const d = Math.ceil(0.05 * L); const s = [0, 0]; for (let k = d; k < L; k++) for (let c = 0; c < nc; c++) s[c] += e[nc * k + c] ** 2; return s.map((x) => Math.sqrt(x / (L - d))); };
function Qc(x, c, W) { let y = Float64Array.from({ length: L }, (_, k) => x[nc * k + c]); for (let p = 0; p < 2; p++) { const z = new Float64Array(L); let s = 0; for (let j = -W; j <= W; j++) s += y[((j % L) + L) % L]; for (let k = 0; k < L; k++) { z[k] = s / (2 * W + 1); s += y[(k + W + 1) % L] - y[((k - W) % L + L) % L]; } y = z; } return y; }
let U = new Float64Array(nc * L); const E0 = run(U), bare = chRms(E0);
const st = [0, 1].map((c) => ({ ci: 0, beta: 0.5, rej: 0, E: E0, rms: bare[c] }));
for (let it = 0; it < IT; it++) {
  const Un = U.slice();
  for (let c = 0; c < nc; c++) { const s = st[c], [tau, W] = CANDS[s.ci]; const d = new Float64Array(nc * L); for (let k = 0; k < L; k++) d[nc * k + c] = U[nc * k + c] - s.beta * s.E[nc * ((k + tau) % L) + c]; const q = Qc(d, c, W); for (let k = 0; k < L; k++) Un[nc * k + c] = q[k]; }
  const En = run(Un), r = chRms(En);
  const imp = st.map((s, c) => r[c] < s.rms), good = st.map((s, c) => r[c] < s.rms * 0.98);
  st.forEach((s, c) => { if (!imp[c]) s.beta *= 0.5; if (good[c]) s.rej = 0; else if (++s.rej >= 3) { s.ci = (s.ci + 1) % CANDS.length; s.rej = 0; s.beta = Math.min(0.5, 4 * s.beta); } });
  if (imp.every(Boolean)) { U = Un; st.forEach((s, c) => { s.E = En; s.rms = r[c]; }); }
  else if (imp.some(Boolean)) { for (let c = 0; c < nc; c++) if (imp[c]) for (let k = 0; k < L; k++) U[nc * k + c] = Un[nc * k + c]; const Ek = run(U), rk = chRms(Ek); st.forEach((s, c) => { s.E = Ek; s.rms = rk[c]; }); }
}
const fin = chRms(run(U));
const ref = new Float64Array(nc * L); for (let k = 0; k < L; k++) { const r = prog.at(k); ref[2 * k] = r[0]; ref[2 * k + 1] = r[1]; }
const f = 1 / Math.sqrt(((fin[0] / bare[0]) ** 2 + (fin[1] / bare[1]) ** 2) / 2);
const buf = Buffer.alloc(8 * 4 * L);
for (let i = 0; i < 2 * L; i++) { buf.writeDoubleLE(ref[i], 8 * i); buf.writeDoubleLE(U[i], 8 * (2 * L + i)); }
const file = `${SHAPE}-${process.env.FEED}.f64`, dir = new URL('.', import.meta.url);
writeFileSync(new URL(file, dir), buf);
const man = JSON.parse(readFileSync(new URL('manifest.json', dir)));
man.tables = man.tables.filter((t) => t.file !== file).concat({ file, shape: SHAPE, feed: FEED, lap: L, bareRms: bare, learnedRms: fin,
  factor: +f.toFixed(3), sha256: createHash('sha256').update(buf).digest('hex'),
  generatedAt: execSync('git rev-parse --short HEAD').toString().trim(), iterations: IT }).sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(new URL('manifest.json', dir), JSON.stringify(man, null, 1) + '\n');
console.log(SHAPE, FEED, 'L', L, 'bare', bare.map((x) => x.toExponential(2)).join('/'), 'ILC', f.toFixed(2) + 'x');
