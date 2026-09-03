// THE GRADIENT INSTRUMENT (rule 23): six refinement schemes have stalled at the same
// 3.1-3.2e-3 tile residual. Two hypotheses left: (a) that value is a true local optimum
// of the sim objective for the periodic-tile class — no optimizer will pass it; (b) the
// optimizers all share a defect and slope remains. Measure the slope DIRECTLY:
//   1. repeatability: eval the same tile twice (is the objective deterministic?)
//   2. directional derivatives along random smooth directions and hat bumps at the
//      residual's own worst bins, by central differences.
// If every measured slope is at the repeatability floor, the wall is real and the tile
// class is exhausted; if slope survives, the optimizers are the fault.
import { compileTwin, refineCompiled, applyCompiled } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { twinResponse, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500, BINS = 1024;
const path = mkPath('sharp', 0.004);
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);
const sims = armSimulators({ buildArm: () => makeArm(), destroyArm: destroy, home, sample: SS });

console.log('probe + compile + shipped refine…');
const H = await twinResponse({ buildArm: () => makeArm(), destroyArm: destroy, path, sample: SS });
const res = await compileTwin({ simulate: sims.compileSim(path, { laps: 5, preRoll: PRE }), H, iters: 11 });
console.log(`compiled ${res.report.rms.toExponential(2)}`);
const ref = await refineCompiled({ simulate: sims.compileSim(path, { laps: 4, preRoll: PRE }),
  H, du: res.du, sample: SS, lapSteps: path.lap, preRoll: PRE });
console.log(`refined ${ref.report.rms.toExponential(3)} (shipped class: 3.12e-3)`);

const lapSamples = path.lap / SS;
const handoff = PRE + lapSamples;
const nCh = 2;
// reconstruct the refined tile by sampling the accessor at bin centres
const T0 = Array.from({ length: BINS }, (_, p) => ref.f((handoff + (p / BINS) * lapSamples) * SS));
const base = applyCompiled({ du: res.du, sample: SS, lapSteps: path.lap, preRoll: PRE });
const mkF = (tile) => (k) => {
  const s = k / SS;
  if (s <= handoff) return base(k);
  const x = (((s - handoff) % lapSamples) / lapSamples) * BINS;
  const p0 = Math.floor(x) % BINS, p1 = (p0 + 1) % BINS, fr = x - Math.floor(x);
  return [tile[p0][0] + fr * (tile[p1][0] - tile[p0][0]), tile[p0][1] + fr * (tile[p1][1] - tile[p0][1])];
};
const evalTile = async (tile) => {
  const e = await sims.compileSim(path, { laps: 4, preRoll: PRE })(mkF(tile));
  const start = Math.ceil(handoff + lapSamples);
  const R = Array.from({ length: BINS }, () => [0, 0]);
  const W = new Array(BINS).fill(0);
  let s2 = 0, n2 = 0;
  for (let s = start; s < e.length; s++) {
    const p = Math.floor((((s - handoff) % lapSamples) / lapSamples) * BINS) % BINS;
    for (let c = 0; c < nCh; c++) { R[p][c] += e[s][c]; s2 += e[s][c] ** 2; }
    W[p]++; n2++;
  }
  for (let p = 0; p < BINS; p++) {
    if (W[p]) { for (let c = 0; c < nCh; c++) R[p][c] /= W[p]; continue; }
    const q = (p + BINS - 1) % BINS;
    for (let c = 0; c < nCh; c++) R[p][c] = R[q][c];
  }
  return { rms: Math.sqrt(s2 / (n2 * nCh)), R };
};

const { rms: f0a, R } = await evalTile(T0);
const { rms: f0b } = await evalTile(T0);
const rep = Math.abs(f0a - f0b);
console.log(`f0 = ${f0a.toExponential(4)}, repeat ${f0b.toExponential(4)}, |delta| ${rep.toExponential(2)}`);

const addDir = (tile, D, s) => tile.map((r, p) => [r[0] + s * D[p][0], r[1] + s * D[p][1]]);
let z = 777 >>> 0;
const rnd = () => ((z = (z * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const smoothDir = (hMax) => {
  const D = Array.from({ length: BINS }, () => [0, 0]);
  for (let c = 0; c < nCh; c++) {
    for (let h = 1; h <= hMax; h += 1 + Math.floor(rnd() * 3)) {
      const a = rnd() - 0.5, ph = 2 * Math.PI * rnd();
      for (let p = 0; p < BINS; p++) D[p][c] += a * Math.cos((2 * Math.PI * h * p) / BINS + ph);
    }
  }
  let s2 = 0;
  for (let p = 0; p < BINS; p++) s2 += D[p][0] ** 2 + D[p][1] ** 2;
  const n = 1 / Math.sqrt(s2 / (2 * BINS));
  return D.map((r) => [r[0] * n, r[1] * n]);
};
const hatDir = (pc, c, w = 6) => {
  const D = Array.from({ length: BINS }, () => [0, 0]);
  for (let d = -w; d <= w; d++) D[(pc + d + BINS) % BINS][c] = 1 - Math.abs(d) / (w + 1);
  let s2 = 0;
  for (let p = 0; p < BINS; p++) s2 += D[p][0] ** 2 + D[p][1] ** 2;
  const n = 1 / Math.sqrt(s2 / (2 * BINS));
  return D.map((r) => [r[0] * n, r[1] * n]);
};
// worst residual bins per channel
const worst = [0, 1].map((c) => {
  let bi = 0, bv = 0;
  for (let p = 0; p < BINS; p++) if (Math.abs(R[p][c]) > bv) { bv = Math.abs(R[p][c]); bi = p; }
  return { bin: bi, val: R[bi][c] };
});
console.log(`worst residual bins: ch1 ${worst[0].bin} (${worst[0].val.toExponential(2)}), ch2 ${worst[1].bin} (${worst[1].val.toExponential(2)})`);

const DELTA = 4e-3;
const probe = async (name, D) => {
  const fp = (await evalTile(addDir(T0, D, DELTA))).rms;
  const fm = (await evalTile(addDir(T0, D, -DELTA))).rms;
  const slope = (fp - fm) / (2 * DELTA);
  const curv = (fp + fm - 2 * f0a) / (DELTA * DELTA);
  console.log(`  ${name}: f+ ${fp.toExponential(4)} f- ${fm.toExponential(4)}  slope ${slope.toExponential(2)}  curv ${curv.toExponential(2)}  slope*delta/rep ${(Math.abs(slope) * DELTA / Math.max(rep, 1e-9)).toFixed(1)}`);
  return slope;
};
console.log('random smooth directions (h<=64):');
for (let i = 0; i < 4; i++) await probe(`dir ${i}`, smoothDir(64));
console.log('hat bumps at the worst residual bins:');
await probe('hat ch1', hatDir(worst[0].bin, 0));
await probe('hat ch2', hatDir(worst[1].bin, 1));
console.log('EXIT 0');
