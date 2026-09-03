// PLC-ONLY COSTING OF THE ⑩ PIPELINE (owner's directive: no offline allowed).
// The deployed artifact is a tile lookup (~10 MAC) — the question is the SIMULATION:
// identify, compile, refineCompiled and refineOperator are all lattice-sim evals, and
// under "PLC only" they must run as background compute sliced into the 10% scan budget
// while the machine produces. This instrument counts cells from the BUILT lattices
// (not from my arithmetic — rule 17) and composes per-cell op counts read off the CPU
// kernel (each pass itemized below) into MAC/step, then a wall-clock table for every
// pipeline stage at BUDGET MAC/cycle and a 1 kHz scan.
//
// Per-cell float-op counts, from lib/lattsim/backends/cpu.js:
//   elastic pass 1 (velocity), per material cell, 3 components:
//     3 stress diffs + 2 sums + keep*v + rhoInv2*(sum) + fext*invRho + disp add
//     ≈ 11 per component → 33
//   elastic pass 2 (stress), per material cell:
//     3 backward diffs, 3 normal updates at 3 ops (l2m*e + lambda*(e+e)),
//     3 shears at 4 ops (2 diffs + sum + mu*) → 24
//   frame operator, per material cell:
//     acc() x3 staggered (Euler cross 6, centrifugal 12, base 9) + Coriolis 6 +
//     rho scaling 3 → 36
//   vacuum cells: stress zeroing + force zeroing + node liveness checks ≈ 15
//   index/neighbour arithmetic (int): ~12 nbr/stepIdx calls x ~5 int ops ≈ 60 per
//     material cell — printed separately; a PLC pays for these too.
import { makeArm, mkPath } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const BUDGET = 10000;           // MAC per 1 ms cycle = 10% of scan, the project's convention
const SS = 9, PRE = 1500;
const path = mkPath('sharp', 0.004);

const m = await makeArm();
const countCells = (link) => {
  // the sim's backend flags are the truth of what was built
  const sim = link.sim ?? link;
  const be = sim.backend ?? sim._backend;
  const flags = be.flags;
  let mat = 0;
  for (let i = 0; i < flags.length; i++) if (flags[i] === 5 || flags[i] === 6) mat++;   // CELL.ELASTIC / CELL.CLAMPED
  return { total: flags.length, mat };
};
let c1, c2;
try {
  c1 = countCells(m.arm.l1); c2 = countCells(m.arm.l2);
} catch (e) {
  console.log('flag introspection failed, falling back to geometry:', e.message);
  // NX = clamp + length, NY = NZ = H + 2 margins; material = NX x H x H
  c1 = { total: 17 * 6 * 6, mat: 17 * 4 * 4 };
  c2 = { total: 13 * 6 * 6, mat: 13 * 4 * 4 };
}
await m.arm.l1.destroy(); await m.arm.l2.destroy();
const MAT = c1.mat + c2.mat, VAC = (c1.total - c1.mat) + (c2.total - c2.mat);
console.log(`cells: link1 ${c1.mat}/${c1.total}, link2 ${c2.mat}/${c2.total}  (material ${MAT}, vacuum ${VAC})`);

const PER_MAT = 33 + 24 + 36;   // elastic p1 + p2 + frame
const PER_VAC = 15;
const PER_MAT_INT = 60;
const STEP_FLOAT = MAT * PER_MAT + VAC * PER_VAC;
const STEP_INT = MAT * PER_MAT_INT + VAC * 20;
console.log(`per arm step: ${STEP_FLOAT.toLocaleString()} float ops + ${STEP_INT.toLocaleString()} int index ops`);
const CPS = STEP_FLOAT / BUDGET;       // cycles of budget per simulated step (float only)
console.log(`sliced at ${BUDGET} MAC/cycle: ${CPS.toFixed(1)} cycles per sim step -> sim runs ${CPS.toFixed(1)}x slower than the 1 kHz machine`);

// memory: v3 + sig6 + force3 + disp3 floats per cell
const memKB = (c1.total + c2.total) * 15 * 4 / 1024;
console.log(`lattice state at f32: ${memKB.toFixed(0)} kB (both links, 15 floats/cell)`);

// ---- the pipeline, stage by stage ------------------------------------------------
const lapSamples = path.lap / SS;
const idSteps = 900 * SS;                          // identification record length
const compEval = Math.ceil((PRE + 5 * lapSamples) * SS);
const refEval = Math.ceil((PRE + 4 * lapSamples) * SS);
// EVAL COUNTS ARE MEASURED, NOT ESTIMATED (plan §44). The first version of this table
// guessed 60 + 30 for the identification and was 37% LOW: the A/B against LM counted the
// shipped path at 144 sims on the soft cell and 166 on the stiff one. The instrument's
// own assumption was the least accurate thing in it (rule 17), so the counts now come
// from `test/_twinlmfit.mjs` and the retired path is kept beside the shipped one.
const stages = [
  ['[retired] grid + coordinate descent (measured 144 sims)', 144 * idSteps],
  ['commissioning: coarse seed + refineLM (measured 70 sims)', 70 * idSteps],
  ['H probe (twinResponse, ~3 runs)', 3 * compEval],
  ['compileTwin (11 iters, laps 5)', 11 * compEval],
  ['refineCompiled (~10 evals, laps 4)', 10 * refEval],
  ['refineOperator (4 cycles: ~160 evals, laps 4)', 160 * refEval],
];
console.log(`\nwall-clock sliced into the scan (machine producing meanwhile), 1 kHz:`);
let commission = 0, perProgram = 0;
for (const [name, steps] of stages) {
  const cycles = steps * CPS;
  const min = cycles / 1000 / 60;
  console.log(`  ${name}: ${steps.toLocaleString()} sim steps -> ${min >= 90 ? (min / 60).toFixed(1) + ' h' : min.toFixed(0) + ' min'}`);
  if (name.startsWith('[retired]')) continue;              // costed for contrast only
  if (name.startsWith('commissioning')) commission += min;
  else perProgram += min;
}
console.log(`\ncommissioning (once per plant): ${(commission / 60).toFixed(1)} h background`);
console.log(`per program, compile through shipped refine: ${((perProgram - 160 * refEval * CPS / 60000) / 60).toFixed(1)} h background`);
console.log(`per program with the deep refine: ${(perProgram / 60).toFixed(1)} h background`);
console.log(`\nlevers if that is too slow: section H 4 -> 3 removes ${(100 * (1 - (3 * 3) / (4 * 4))).toFixed(0)}% of material cells (rule 2: resolution is a cost knob — deliverable accuracy at H=3 is the measurement to take); f32; fewer operator evals; or run refineOperator against the REAL machine (~160 evals x 4 laps ~ 90 min of laps) if the truth signal is installed at refine time — an installation property, like onlineAtDeploy.`);
console.log('EXIT 0');
