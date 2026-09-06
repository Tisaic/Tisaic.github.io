/**
 * @file THE WHOLE THING, COMPOSED — everything admissible, inside the scan.
 *
 * Two results stand and neither has been run with the other.
 *
 * GUIDED COMMISSIONING: fit on the scribble, run a program with the TRACKER STILL ATTACHED as
 * part of commissioning, adapt, FREEZE, unwire the tracker, deploy. 9 of 9 cells better across
 * three seeds and three programs, geometric mean 1.79x, worst 1.07x, and the programs it never
 * ran gain most. The tracker is a commissioning instrument and the deployed machine has none.
 *
 * THE EXPLICIT GAIN AND A LINEAR BASIS: 6,178 MAC/cycle, 62% of a PLC scan against the shipped
 * path's 737%, delivering a geometric 1.19x MORE than the configuration that misses.
 *
 * THEY SHOULD BE INDEPENDENT AND THE REASON IS STRUCTURAL, WHICH IS WHY THIS IS WORTH RUNNING
 * RATHER THAN ASSUMING. The gain is built from `hGrid`, `lambda` and `qpIters` — the plant's
 * response and the solver's regularisers — while adaptation moves the FORECAST WEIGHTS and
 * touches none of those. So the gain stays exactly valid across a guided phase by construction
 * rather than by luck. Independent mechanisms compose to the product; anything else means one of
 * them was not doing what its own account says.
 *
 * WHAT WOULD KILL IT: the composition landing at or below either part alone. This project has
 * measured that outcome twice — a second cascade layer HARMING the learned-IK chain, and demo
 * banks fighting a guided phase — so composition is a measurement here and never an argument.
 *
 * Every row is inside the budget or says so. A configuration outside it is a proposal.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_product.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const HELDS = (process.env.HELD || 'circle,sharp').split(',');
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);
const GUIDED = +(process.env.GUIDED || 6);
const BUDGET = 10000;

console.log(`\nthe whole thing, composed — K ${PG.K} / E ${PG.E}, ${SHAPE} at `
  + `feed ${FEED.toExponential(1)}, ${GUIDED} guided laps\n`);
console.log(`  configuration          MAC/cycle  %budget   ${SHAPE}   `
  + HELDS.map((h) => h.padStart(9)).join(''));

let base = null; const baseH = new Map();
// THE UNTESTED CELL IS THE ONE EVERY MEASURED PIECE POINTS AT. Guided commissioning on the
// SCHEDULED basis reached 4.31x on the sharp square — the best square number this arc has
// produced and past the shipped 3.50x — but it was measured at 737% of budget. The horizon knob
// then put the scheduled basis inside the scan at 78% without the linear basis's cost. Nobody
// has run the two together, and the linear-basis composition is exactly where the square went
// backwards (3.05x), so the basis is the suspect rather than the guided phase.
const CELLS = [
  ['ships today', null, false, 0, null],
  ['linear + gain', 'linear', true, 0, null],
  ['linear + gain + guided', 'linear', true, GUIDED, null],
  ['sched + gain, N short', null, true, 0, 0.9],
  ['sched + gain + guided', null, true, GUIDED, 0.9],
];
for (const [name, forceBasis, gain, guided, ht] of CELLS) {
  const extra = { ...(forceBasis ? { forceBasis } : {}), ...(ht ? { horizonTs: ht } : {}) };
  const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED },
    ...(Object.keys(extra).length ? { extra } : {}) });
  if (base === null) {
    base = (await deployOn(p, SHAPE, false, FEED)).r.totalRms;
    for (const h of HELDS) baseH.set(h, (await deployOn(p, h, false, FEED)).r.totalRms);
  }
  if (guided > 0) {
    // COMMISSIONING, so the tracker is legal. Adaptation is nulled before anything is scored
    // and every deployed run below passes `truthUntilLap: 0`, so no truth reaches a number.
    p.online = { ...(p.online || {}) };
    await deployOn(p, SHAPE, p.verdict.deploy, FEED, { laps: guided + 1, truthUntilLap: Infinity });
    p.online = null;
  }
  p.explicitGain = gain;
  if (!gain) p._gain = null;
  const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED, { truthUntilLap: 0 });
  if (gain !== !!p._gain) throw new Error(`explicitGain ${gain} but gain ${!!p._gain}`);
  const cols = [];
  for (const h of HELDS) {
    const x = await deployOn(p, h, p.verdict.deploy, FEED, { truthUntilLap: 0 });
    cols.push(`${(baseH.get(h) / x.r.totalRms).toFixed(2)}x`.padStart(9));
  }
  const c = p.cost();
  const mac = gain ? c.peakMacPerCycle - c.qp + (p.N + 1) * p.nc : c.peakMacPerCycle;
  console.log(`  ${name.padEnd(22)} ${String(Math.round(mac)).padStart(9)}  `
    + `${(100 * mac / BUDGET).toFixed(0).padStart(6)}%${mac <= BUDGET ? ' FITS' : '     '}  `
    + `${(base / r.r.totalRms).toFixed(2)}x` + cols.join(''));
}
console.log(`\n  open loop ${base.toExponential(3)}`);
console.log(`\n  the gain is built from hGrid, lambda and qpIters; adaptation moves the forecast`);
console.log(`  weights and touches none of them, so the two are independent by construction.\n`);
