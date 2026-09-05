/**
 * @file WHAT THE OFF-DIAGONAL SOLVE COSTS THE SCAN — measured, not argued from nc^2.
 *
 * The MIMO solve is worth 11.8% on the model-only cascade on this arm, and target 6 is
 * unconditional: 10% of a 1 ms task, 10,000 MAC per cycle, met in EVERY cycle. "It costs nc^2
 * blocks against nc" is an argument about one term, not a budget — the QP, the forecast and the
 * free response scale differently, and `cost()` has already been repaired twice for a model of
 * the code that had drifted from the code (rules 17, 30). So this asks the pilot.
 *
 * ONE COMMISSIONING EACH WAY, same seed, same machine, same program, and `cost()` read off the
 * deployed object. The diagonal row is the control: it must reproduce what this arm costs today.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_mimocost.mjs
 */
import { commissionArm } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);
const BUDGET = 10000;   // 10% of a 1 ms scan, the north star's target 6

console.log(`\nwhat the off-diagonal solve costs the scan — K ${process.env.ARM_K || 16} / `
  + `E ${process.env.ARM_E || 0.15}, ${SHAPE} at feed ${FEED.toExponential(1)}`);
console.log(`  budget ${BUDGET.toLocaleString()} MAC/cycle, met EVERY cycle\n`);
console.log(`  solve    N   feat    QP MAC   peak MAC/cycle   % budget   deploys`);

for (const mimo of [false, true]) {
  const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED },
    extra: { mimo } });
  const st = p.status();
  if (st.mimo !== mimo) throw new Error(`mimo asked ${mimo} but status says ${st.mimo}`);
  const c = p.cost();
  // `peakMacPerCycle` is the one target 6 names: the budget must be met in EVERY cycle, so the
  // sliced figure is the wrong column — it is an average over the scans between updates and
  // "always fit" forbids reading it as the cost (this file's own north star says so).
  console.log(`  ${(mimo ? 'mimo' : 'diag').padEnd(7)} ${String(c.leads).padStart(3)}  `
    + `${String(c.features).padStart(4)}  ${String(Math.round(c.qp)).padStart(9)}  `
    + `${String(Math.round(c.peakMacPerCycle)).padStart(14)}   `
    + `${(100 * c.peakMacPerCycle / BUDGET).toFixed(0).padStart(7)}%   ${p.verdict.deploy}`);
}
console.log(`\n  the QP inverts an nc x nc block matrix armed and an nc-diagonal one unarmed, so`);
console.log(`  the forecast and solve terms scale differently and only the total is the budget.\n`);
