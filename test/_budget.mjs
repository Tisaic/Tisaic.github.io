/**
 * @file CAN THE WHOLE DEPLOYED PATH FIT A PLC SCAN? — the last 128%, against what it costs.
 *
 * The explicit gain took the deployed path from 73,664 MAC/cycle to 12,778 — 737% of the budget
 * to 128% — and delivered BETTER than the QP it replaced (1.26x geometric over three programs).
 * What is left is the FORECAST, and on this arm that is 352 features against the EMPS axis's 37.
 * The difference is the pose-SCHEDULED block: scheduling multiplies the feature count, and the
 * evaluation is that count at every lead the horizon carries.
 *
 * `forceBasis` already exists, so this is a measurement rather than a build. The question is the
 * one this project asks of every shrink: what does it cost on the machine. The scheduled block
 * is on record as EARNING its place on held-out data (0.771 memory-alone against 0.840
 * scheduled), so a cheaper basis is expected to deliver less — the question is how much less,
 * and whether what is left still beats the QP configuration that cannot fit at all.
 *
 * THE COMPARISON THAT MATTERS IS NOT BASIS-AGAINST-BASIS. It is: the cheapest configuration that
 * FITS, against the shipped one that misses by 7.4x. A configuration outside the budget is not a
 * baseline, it is a proposal that cannot ship, so a linear basis at 15% of scan losing to a
 * scheduled one at 128% is still the only one of the two that is a product (target 6 is
 * unconditional and covers every cycle).
 *
 * Reported per row: delivered on the fitted program and two never run, the feature count, and
 * the deployed MAC against the budget — because a table that shows performance without cost is
 * how this arm ended up 7.4x over in the first place.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_budget.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const HELDS = (process.env.HELD || 'circle,sharp').split(',');
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);
const BUDGET = 10000;
// null is the pilot's own choice — on this arm 'sch,lin', which is where the 352 comes from.
const BASES = (process.env.BASES || 'null,linear').split(',');

console.log(`\ncan the deployed path fit a PLC scan — K ${PG.K} / E ${PG.E}, ${SHAPE} at `
  + `feed ${FEED.toExponential(1)}`);
console.log(`  budget ${BUDGET.toLocaleString()} MAC/cycle, met EVERY cycle\n`);
console.log(`  basis    gain   feat   MAC/cycle  %budget   ${SHAPE}   `
  + HELDS.map((h) => h.padStart(9)).join(''));

let base = null; const baseH = new Map();
for (const fb of BASES) {
  const forceBasis = fb === 'null' ? null : fb;
  const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED },
    extra: { forceBasis } });
  if (base === null) {
    base = (await deployOn(p, SHAPE, false, FEED)).r.totalRms;
    for (const h of HELDS) baseH.set(h, (await deployOn(p, h, false, FEED)).r.totalRms);
  }
  for (const gain of [false, true]) {
    p.explicitGain = gain;
    if (!gain) p._gain = null;
    const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
    if (gain !== !!p._gain) throw new Error(`explicitGain ${gain} but gain ${!!p._gain}`);
    const cols = [];
    for (const h of HELDS) {
      const x = await deployOn(p, h, p.verdict.deploy, FEED);
      cols.push(`${(baseH.get(h) / x.r.totalRms).toFixed(2)}x`.padStart(9));
    }
    const c = p.cost();
    // THE GAIN'S COST IS NOT WHAT `cost()` REPORTS, because that function costs the QP it
    // replaces. Stated here rather than patched into the library before the configuration is
    // chosen: a cost model edited to flatter a proposal is the instrument failing first.
    const mac = gain ? c.peakMacPerCycle - c.qp + (p.N + 1) * p.nc : c.peakMacPerCycle;
    console.log(`  ${(fb).padEnd(8)} ${(gain ? 'yes' : 'no ').padEnd(6)} `
      + `${String(c.features).padStart(4)}  ${String(Math.round(mac)).padStart(10)}  `
      + `${(100 * mac / BUDGET).toFixed(0).padStart(6)}%${mac <= BUDGET ? ' FITS' : '     '}  `
      + `${(base / r.r.totalRms).toFixed(2)}x` + cols.join(''));
  }
}
console.log(`\n  open loop ${base.toExponential(3)}`);
console.log(`\n  a configuration outside the budget is a proposal, not a baseline: target 6 is`);
console.log(`  unconditional and covers every cycle, including the ones nobody sampled.\n`);
