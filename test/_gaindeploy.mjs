/**
 * @file THE EXPLICIT GAIN ON THE MACHINE — the half the algebra cannot settle.
 *
 * `_explicit.mjs` measured that `boxQP` is affine while its box is inactive: superposition holds
 * to 3e-13 over 200 random free responses per channel, the deployed map is one fixed row
 * `u0 = k·f0 + c·uPrev`, and the QP term falls 61,006 -> 120 MAC/cycle, taking the deployed path
 * from 821% of a PLC scan to 212%. That is arithmetic and it is exact.
 *
 * WHAT THE ARITHMETIC CANNOT SETTLE is that the shipped solver WARM STARTS from its previous
 * plan. The gain does not: it is a function of the current free response and the last applied
 * correction, with no state of its own. So the two are different controllers, not two
 * evaluations of one, and the difference has to be priced on the machine (rule 16) — a number
 * computed from the model cannot check the model.
 *
 * THE BOX IS THE SECOND DIFFERENCE AND IT HAS AN ARGUMENT THE WARM START DOES NOT. `capFrac`
 * reads 0.0019, so the clamp fires on a fifth of one percent of samples, and where it fires the
 * gain clamps exactly as the QP's own projection clamps its first move.
 *
 * ONE COMMISSIONED MODEL, DEPLOYED TWICE, so the only variable is how the correction is computed
 * — the fit, the horizon, the cap and the machine are identical by construction rather than by
 * review. Scored on the program and on two it has never run, because a cheaper controller that
 * only holds where it was tuned is not cheaper, it is narrower.
 *
 * WHAT WOULD KILL IT: the gain delivering materially worse than the QP. Then the warm start is
 * load-bearing, the 508x is not available at this quality, and what is left is the honest
 * question of what the warm start is worth against 61,000 MAC.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_gaindeploy.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const HELDS = (process.env.HELD || 'circle,sharp').split(',');
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);

console.log(`\nthe explicit gain on the machine — K ${PG.K} / E ${PG.E}, ${SHAPE} at `
  + `feed ${FEED.toExponential(1)}\n`);

const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED } });
const base = (await deployOn(p, SHAPE, false, FEED)).r.totalRms;
const baseH = new Map();
for (const h of HELDS) baseH.set(h, (await deployOn(p, h, false, FEED)).r.totalRms);

console.log(`  solve        ${SHAPE} (fitted)   ` + HELDS.map((h) => `${h}`.padStart(18)).join(''));
const rows = [];
for (const gain of [false, true]) {
  // ARMED ON THE SAME COMMISSIONED OBJECT, and `_initRun` builds the gain on the next run —
  // which `deployOn` calls. Asserted rather than assumed: a flag that is set and a path that
  // runs are different things, and this repository has shipped that difference green.
  p.explicitGain = gain;
  if (!gain) p._gain = null;
  const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
  if (gain && !p._gain) throw new Error('explicitGain armed and no gain was built');
  if (!gain && p._gain) throw new Error('explicitGain off and a gain is present');
  const cols = [];
  for (const h of HELDS) {
    const x = await deployOn(p, h, p.verdict.deploy, FEED);
    cols.push(`${(baseH.get(h) / x.r.totalRms).toFixed(2)}x`.padStart(18));
  }
  rows.push({ gain, r, cols });
  console.log(`  ${(gain ? 'explicit gain' : 'QP (ships)').padEnd(13)}`
    + `${(base / r.r.totalRms).toFixed(2)}x (${r.r.contourRms.toExponential(2)})`
    + cols.join(''));
}
const c = p.cost();
console.log(`\n  open loop    ${base.toExponential(3)}`);
console.log(`  cost with the QP ${Math.round(c.peakMacPerCycle).toLocaleString()} MAC/cycle; `
  + `the gain replaces ${Math.round(c.qp).toLocaleString()} of it with ${(p.N + 1) * p.nc}`);
console.log(`\n  a gain that delivers what the QP delivers makes the warm start free to go with`);
console.log(`  the rest of the solver; one that does not prices the warm start in MAC.\n`);
