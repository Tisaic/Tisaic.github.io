// WHAT ONE SCORED RUN COSTS, AND WHERE.
//
// The per-sample profile said lattice stepping is ~10% of the ladder's 32 minutes, which
// kills the obvious "cut the lap count" plan before it starts. This times the two halves of
// an actual scored run so the split is measured rather than modelled — a number computed
// from a model cannot check the model (rule 16).
import { machine, settle, commissionComp } from './_rig.mjs';

const ms = async (label, fn) => {
  const s = process.hrtime.bigint();
  const v = await fn();
  const d = Number(process.hrtime.bigint() - s) / 1e6;
  console.log(`  ${label.padEnd(46)} ${d.toFixed(0).padStart(7)} ms`);
  return [d, v];
};

console.log('\nONE `fresh()` — what every scored run pays before it measures anything:');
const [tBuild] = await ms('machine() — build two lattices', () => machine());
const { arm, servo } = await machine();
const [tComp] = await ms('commissionComp() — 4 poses x 4000 steps', async () => commissionComp(arm, servo));
const [q1, q2] = arm.ik(14, 1, true);
const [tSettle] = await ms('settle onto the program start — 4000 steps', async () => settle(arm, servo, q1, q2));
const fresh = tBuild + tComp + tSettle;

const LAP = 7357, AVG = 4, LAPS = 2 + AVG;
const N = 4000;
const refs = [{ theta: q1, omega: 0, alpha: 0 }, { theta: q2, omega: 0, alpha: 0 }];
const s = process.hrtime.bigint();
for (let i = 0; i < N; i++) { const t = servo.torques(refs); arm.step(t[0], t[1], 1); }
const perSample = Number(process.hrtime.bigint() - s) / 1e6 / N;
const scored = LAPS * LAP * perSample;

console.log(`\n  ${'fresh() total'.padEnd(46)} ${fresh.toFixed(0).padStart(7)} ms`);
console.log(`  ${`${LAPS} scored laps x ${LAP} samples`.padEnd(46)} ${scored.toFixed(0).padStart(7)} ms`);
console.log(`  ${'ONE RUN'.padEnd(46)} ${(fresh + scored).toFixed(0).padStart(7)} ms`);
console.log(`\n  rebuild is ${(100 * fresh / (fresh + scored)).toFixed(0)}% of every run,`
  + ` and ${(100 * (tComp + tSettle) / (fresh + scored)).toFixed(0)}% is SETTLING alone.`);

const RUNS = 127;
console.log(`\n  ${RUNS} runs -> ${(RUNS * (fresh + scored) / 60000).toFixed(1)} min`
  + `   (the bar measures 32 min, so the model holds)`);
console.log(`\nLEVERS, each measured against that:`);
const show = (n, savedMs) => console.log(`  ${n.padEnd(52)} ${(RUNS * savedMs / 60000).toFixed(1)} min saved`
  + `  -> ${(RUNS * (fresh + scored) / (RUNS * (fresh + scored - savedMs))).toFixed(2)}x`);
show('reuse the RobotComp calibration (it is deterministic)', tComp);
show('snapshot/restore instead of rebuilding at all', fresh);
show('AVG 4 -> 2 (4 laps not 6)', 2 * LAP * perSample);
show('both of the above together', fresh + 2 * LAP * perSample);
