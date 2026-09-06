/**
 * @file WHAT ELSE RIDES THE SWITCH — the knobs, measured rather than surveyed.
 *
 * Scheduling the ITERATION COUNT on the commanded profile is worth 7.4%, and it works because
 * the two held-out programs want opposite ends of that ladder. The question this file answers is
 * which OTHER knobs are directional in the same way, on the same selection, and the constraint
 * that decides the candidate list is where each one enters:
 *
 *   into `k`  — free. `k` is built from the plant response and the solver's regularisers, so a
 *               rung carrying its own believed plant gain deploys as one row of the same length.
 *   per-tick  — cheap. The correction CAP clamps the applied move rather than entering the solve.
 *   into `f0` — expensive. That is the forecast bank, which is the corner router and already
 *               exists as its own mechanism at 20,852 MAC/decision.
 *
 * THE TWO TESTED HERE AND WHY.
 *
 * `uMax`: `report.binding` reads `model` on this arm and `capFrac` reads 0.0019, so the cap binds
 * in a fifth of one percent of samples. That is usually read as "authority is not the
 * constraint", and it is — ON AVERAGE. But a corner is where a correction is largest, so those
 * few samples may be ENTIRELY at corners, and a cap raised only there is a different object from
 * a cap raised everywhere. Raising it everywhere is on record as null-to-harmful on this arm
 * (0.15 -> 0.30 moved the score 1.69 -> 1.68) and as HARMFUL on the kinematics-free chain
 * without adaptation armed (5.91x -> 4.57x on the circle), so the scheduled version is the only
 * form that has not been asked.
 *
 * `hGain`: the gain the QP BELIEVES the plant has. Believing less makes it ask for more. It is
 * measured to matter on the barrel — swept over a sixteen-fold range there — and has never been
 * tried on this arm at all. A corner is where the compliance is least like the held-probe
 * average, so a regime-dependent belief is the shape the physics suggests.
 *
 * NOT TESTED AND WHY: `crossGain` has the strongest prior of the three — its optimum was measured
 * running 0 to 2 across nine cells this session, and the off-diagonal is a COUPLING term, which
 * is what a corner excites. It cannot ride this switch yet because `_buildGain` probes `boxQP`
 * with the diagonal response, and under `mimo` the deployed solve is `boxQPm` on an
 * off-diagonal H — so a gain built the current way would be a diagonal map applied to a coupled
 * plant. Stated rather than approximated.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_schedknobs.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const HELDS = (process.env.HELD || 'circle,sharp').split(',');
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);
const HT = +(process.env.HT || 0.9);
const W = +(process.env.W || 35);

const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED },
  extra: { horizonTs: HT } });
const IT0 = p.qpIters;
console.log(`\nwhat else rides the switch — K ${PG.K} / E ${PG.E}, ${SHAPE} at `
  + `feed ${FEED.toExponential(1)}, N ${p.N}, uMax ${UCAP}, window ${W}\n`);
const base = (await deployOn(p, SHAPE, false, FEED)).r.totalRms;
const baseH = new Map();
for (const h of HELDS) baseH.set(h, (await deployOn(p, h, false, FEED)).r.totalRms);

const score = async () => {
  const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
  const xs = [base / r.r.totalRms];
  for (const h of HELDS) {
    const x = await deployOn(p, h, p.verdict.deploy, FEED);
    xs.push(baseH.get(h) / x.r.totalRms);
  }
  return { xs, geo: Math.exp(xs.reduce((a, v) => a + Math.log(v), 0) / xs.length) };
};

// EVERY ROW IS THE SAME SELECTION with one knob added to the hard end, so the comparison is
// against the scheduled baseline rather than against the unscheduled incumbent — otherwise a
// knob would be credited with the 7.4% the iteration count already earned (rule 20).
const CELLS = [
  ['incumbent (fixed 4)', null],
  ['sched iters only', [{ iters: 3 }, { iters: 6 }]],
  ['+ uMax x2 at corners', [{ iters: 3 }, { iters: 6, uMax: UCAP * 2 }]],
  ['+ uMax x4 at corners', [{ iters: 3 }, { iters: 6, uMax: UCAP * 4 }]],
  ['+ hGain 0.7 at corners', [{ iters: 3 }, { iters: 6, hGain: 0.7 }]],
  ['+ hGain 1.4 at corners', [{ iters: 3 }, { iters: 6, hGain: 1.4 }]],
  ['+ hGain 1.4 smooth end', [{ iters: 3, hGain: 1.4 }, { iters: 6 }]],
];
console.log(`  configuration            ${SHAPE.padEnd(9)}`
  + HELDS.map((h) => h.padStart(9)).join('') + `    geo`);
let ref = null, schedRef = null;
for (const [name, ladder] of CELLS) {
  p.explicitGain = true;
  p.gainLadder = ladder; p.schedWindow = ladder ? W : null;
  p.qpIters = ladder ? ladder[0].iters : IT0;
  p._gain = null;
  const r = await score();
  if (ref === null) ref = r;
  if (schedRef === null && ladder) schedRef = r;
  const vs = schedRef && ladder && r !== schedRef
    ? `  ${(100 * (r.geo / schedRef.geo - 1)).toFixed(1)}%` : '';
  console.log(`  ${name.padEnd(24)} ${r.xs[0].toFixed(2)}x   `
    + r.xs.slice(1).map((v) => `${v.toFixed(2)}x`.padStart(9)).join('')
    + `    ${r.geo.toFixed(3)}${vs}`);
}
console.log(`\n  the percentage is against SCHEDULED ITERS, not the incumbent: a knob added to a`);
console.log(`  ladder that already earns 7.4% must be credited only with what it adds.\n`);
