/**
 * @file TARGET 2, MEASURED FOR THE FIRST TIME ON A CONFIGURATION THAT HAS NO MEMORY IN IT.
 *
 * The north star's feedrate clause has a stated failure mode: "a feedrate change moves the lap
 * length and the whole lap-indexed layer is addressed by the wrong index". That is structural,
 * not incidental — change the feed and a phase-indexed table is not slightly wrong, it points at
 * the wrong place in the lap. With the memory retired and the page shipping ONE model addressed
 * by the machine's own state, there is nothing left for a change of lap length to misalign, so
 * stability across feed is the property the retirement was supposed to buy. This measures it.
 *
 * THE BAR IS TARGET 2's OWN, and it needs two controllers, not one: "monotone degradation
 * bounded at 1.5x of a PER-FEED commission across a 5x span of feed". A single controller
 * looking fine at several feeds is not that claim — the comparison is against a controller
 * commissioned AT each feed, which is what an engineer would otherwise have to do.
 *
 *   deployed  — commissioned ONCE at HOME, scored at every feed. The product claim.
 *   per-feed  — commissioned AT that feed, scored there. The thing it must stay within 1.5x of.
 *
 * SCORED ON `totalRms`, contour AND lag, because this tab's rungs were once all chosen against
 * the contour component while lag sat in the report unread (rule 6).
 *
 * A REFUSAL IS A RESULT, not a gap: a feed where the pilot declines applies nothing and scores
 * the open loop, and the table says so rather than leaving a blank (rule 25).
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_feedspan.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const HOME = +(process.env.HOME_FEED || 4e-3);
// A 5x span, HOME sitting inside it rather than at an end — degradation is expected to be
// asymmetric about the commissioning point and an end-anchored ladder would hide one side.
const FEEDS = [2e-3, 3e-3, 4e-3, 6e-3, 8e-3, 1e-2];
const UCAP = +(process.env.UCAP || 0.6);

const t0 = Date.now();
const mins = () => ((Date.now() - t0) / 60000).toFixed(1);

console.log(`\ntarget 2 on the shipped configuration — one model, no memory, no cascade`);
console.log(`  arm K ${process.env.ARM_K || 16} / E ${process.env.ARM_E || 0.15}, `
  + `${SHAPE} program, commissioned once at feed ${HOME.toExponential(1)}, uCap ${UCAP}`);
console.log(`  span ${FEEDS[0].toExponential(1)} to ${FEEDS[FEEDS.length - 1].toExponential(1)}`
  + ` = ${(FEEDS[FEEDS.length - 1] / FEEDS[0]).toFixed(1)}x\n`);

const home = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: HOME } });
console.log(`  [${mins()}m] deployed controller commissioned: `
  + `${home.verdict.deploy ? 'DEPLOYS' : 'REFUSES'} — ${home.verdict.why}\n`);

const rows = [];
for (const feed of FEEDS) {
  const off = await deployOn(home, SHAPE, false, feed);
  const on = await deployOn(home, SHAPE, home.verdict.deploy, feed);
  // The per-feed control: a fresh commissioning AT this feed, which is the alternative the
  // engineer is being spared. Same seed, same everything else — one variable (rule 20).
  const pf = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed } });
  const pfOn = await deployOn(pf, SHAPE, pf.verdict.deploy, feed);
  rows.push({ feed, open: off.r.totalRms, dep: on.r.totalRms, per: pfOn.r.totalRms,
    depX: off.r.totalRms / on.r.totalRms, perX: off.r.totalRms / pfOn.r.totalRms,
    ratio: on.r.totalRms / pfOn.r.totalRms,
    depOk: home.verdict.deploy, perOk: pf.verdict.deploy });
  const r = rows[rows.length - 1];
  console.log(`  [${mins()}m] feed ${feed.toExponential(1)}  open ${r.open.toExponential(3)}`
    + `  deployed ${r.dep.toExponential(3)} (${r.depX.toFixed(2)}x)`
    + `  per-feed ${r.per.toExponential(3)} (${r.perX.toFixed(2)}x)`
    + `  penalty ${r.ratio.toFixed(3)}x${r.perOk ? '' : '  [per-feed REFUSED]'}`);
}

console.log(`\n  feed        open      deployed   per-feed   penalty`);
for (const r of rows) {
  console.log(`  ${r.feed.toExponential(1)}  ${r.open.toExponential(3)}  `
    + `${r.dep.toExponential(3)}  ${r.per.toExponential(3)}  ${r.ratio.toFixed(3)}x`
    + `${r.perOk ? '' : '  per-feed refused'}`);
}
const worst = Math.max(...rows.map((r) => r.ratio));
const anyWorse = rows.filter((r) => r.dep > r.open);
console.log(`\n  WORST PENALTY ${worst.toFixed(3)}x against target 2's 1.5x bar — `
  + `${worst <= 1.5 ? 'INSIDE' : 'OUTSIDE'}`);
console.log(`  none made worse than the open loop: ${anyWorse.length === 0 ? 'TRUE' : 'FALSE ('
  + anyWorse.map((r) => r.feed.toExponential(1)).join(', ') + ')'}`);
// MONOTONE means degradation grows with distance from home, which is what "graceful" has to
// mean; a penalty that jumps around is a controller whose behaviour off-home is unpredictable
// even if every cell happens to be small.
const byDist = [...rows].sort((a, b) => Math.abs(Math.log(a.feed / HOME)) - Math.abs(Math.log(b.feed / HOME)));
let mono = true;
for (let i = 1; i < byDist.length; i++) if (byDist[i].ratio < byDist[i - 1].ratio - 0.05) mono = false;
console.log(`  monotone in distance from the commissioning feed: ${mono ? 'TRUE' : 'FALSE'}`
  + `  (${byDist.map((r) => r.ratio.toFixed(2)).join(' -> ')})`);
console.log(`\n  total ${mins()} min for ${1 + FEEDS.length} commissionings\n`);
