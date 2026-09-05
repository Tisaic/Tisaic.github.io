/**
 * @file HOW FAR DOES GUIDED COMMISSIONING GO, AND WHERE DOES IT TURN INTO A MEMORY?
 *
 * Adapting during commissioning with the tracker attached, then FREEZING and deploying with no
 * tracker, took this arm from 2.87x to 6.30x on its program and from 2.76x to 7.41x on a
 * held-out one. Every constraint holds — truth at commissioning only, no plant knowledge, state
 * addressed, deployed cost unchanged — so the question is now how many guided laps to run.
 *
 * AND IT IS NOT A MONOTONE QUESTION. The adaptation refines a scribble-fitted posterior on ONE
 * program's distribution, and this project has both halves of that on record: a few laps found a
 * better model that transfers BETTER than it performs at home, while identifying wholly on a
 * program is far worse than the scribble (12.70x -> 3.93x, repeated trapezoids being collinear).
 * So there is a lap count past which the refinement stops being a better model of the PLANT and
 * becomes a fit to the PROGRAM — which is the memory the retirement removes, rebuilt by an
 * adaptive law, and its shape is the worst a failure can have: excellent immediately, bad
 * slowly, invisible to a short test.
 *
 * THE HELD-OUT COLUMN IS THEREFORE THE MEASUREMENT and the program column is context. A lap
 * count that improves the program and degrades the held-out program has crossed, and the
 * crossing is the answer whatever the home number does.
 *
 * ONE COMMISSIONING PER ROW, same seed, so every row starts from an identical model and the only
 * variable is how long the tracker stayed (rule 20). Restoring weights between rows instead
 * would be cheaper and would make the rows share whatever the previous adaptation left behind.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_guidedlaps.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const HELD = process.env.HELD || 'circle';
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);
const LAPS = (process.env.LAPS || '0,3,6,12').split(',').map(Number);

console.log(`\nhow many guided laps — K ${PG.K} / E ${PG.E}, adapt on ${SHAPE}, `
  + `held out on ${HELD}, feed ${FEED.toExponential(1)}\n`);
console.log(`  guided     ${SHAPE} (adapted on)          ${HELD} (never run)`);
console.log(`  laps       total      contour    x        total      contour    x`);

let base = null, baseH = null;
for (const n of LAPS) {
  const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED } });
  if (base === null) {
    base = (await deployOn(p, SHAPE, false, FEED)).r.totalRms;
    baseH = (await deployOn(p, HELD, false, FEED)).r.totalRms;
  }
  if (n > 0) {
    // THE GUIDED PHASE — commissioning, so the tracker is legal here and only here.
    p.online = { ...(p.online || {}) };
    await deployOn(p, SHAPE, p.verdict.deploy, FEED, { laps: n + 1, truthUntilLap: Infinity });
  }
  // FROZEN. Both switches are thrown: adaptation off AND no truth handed to `observe`, so
  // neither a stale flag nor a stray tracker can leak into a deployed score.
  p.online = null;
  const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED, { truthUntilLap: 0 });
  const h = await deployOn(p, HELD, p.verdict.deploy, FEED, { truthUntilLap: 0 });
  console.log(`  ${String(n).padStart(5)}      ${r.r.totalRms.toExponential(3)}  `
    + `${r.r.contourRms.toExponential(3)}  ${(base / r.r.totalRms).toFixed(2)}x    `
    + `${h.r.totalRms.toExponential(3)}  ${h.r.contourRms.toExponential(3)}  `
    + `${(baseH / h.r.totalRms).toFixed(2)}x`);
}
console.log(`\n  open loop  ${base.toExponential(3)}${''.padEnd(23)}${baseH.toExponential(3)}`);
console.log(`\n  a row that improves the adapted program and degrades the held-out one has`);
console.log(`  crossed from modelling the PLANT to fitting the PROGRAM, which is the memory`);
console.log(`  the retirement removes rebuilt by an adaptive law.\n`);
