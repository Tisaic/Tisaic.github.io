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
 * AND THE PER-FEED CONTROL IS VACUOUS ON THIS ARCHITECTURE, WHICH IS ITSELF THE FINDING.
 * Target 2's bar reads "within 1.5x of a PER-FEED commission", which assumes a controller
 * commissioned at a feed is a DIFFERENT OBJECT from one commissioned elsewhere. For this pilot
 * it is very nearly not: `commissionArm`'s `train` is, in the rig's own words, "the program the
 * gate is handed as representative" — it sets the home pose and the verify's representative
 * program, and the FIT never sees the program at all, because the model is identified from a
 * program-agnostic scribble by construction. Measured: the penalty column reads 0.999x and
 * 1.000x at the first two feeds, which says the two models are the same model, not that a
 * deployed controller matched a feed-tuned rival. A control that cannot move is not a control
 * (rule 8's shape). It is kept in the table BECAUSE it is near-unity — that is the evidence
 * for the claim above, and a blank column would not be.
 *
 * SO THE BAR THAT MEANS SOMETHING HERE IS DEGRADATION AGAINST ITSELF AT HOME, and the absolute
 * floor from targets 1 and 2: no feed may be made worse than the conventional machine.
 *
 *   deployed  — commissioned ONCE at HOME, scored at every feed. The product claim.
 *   open      — the same machine uncorrected at that feed. The floor nothing may fall below.
 *   per-feed  — near-identical by construction; reported to show that it is.
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

const SEED = +(process.env.SEED || 1);
const home = await commissionArm({ seed: SEED, uCap: UCAP, train: { shape: SHAPE, feed: HOME } });
console.log(`  [${mins()}m] deployed controller commissioned: `
  + `${home.verdict.deploy ? 'DEPLOYS' : 'REFUSES'} — ${home.verdict.why}\n`);

const rows = [];
for (const feed of FEEDS) {
  const off = await deployOn(home, SHAPE, false, feed);
  const on = await deployOn(home, SHAPE, home.verdict.deploy, feed);
  // The per-feed control: a fresh commissioning AT this feed, which is the alternative the
  // engineer is being spared. Same seed, same everything else — one variable (rule 20).
  const pf = await commissionArm({ seed: SEED, uCap: UCAP, train: { shape: SHAPE, feed } });
  const pfOn = await deployOn(pf, SHAPE, pf.verdict.deploy, feed);
  // uPk IS BOTH HALVES (rule 9): a ratio that rises with feed is only a controller doing more
  // if it still has authority left. At the clamp it is a different object — CLAUDE.md records
  // this program already at 86% of tauMax at the home feed, so saturation at 2-2.5x feed is a
  // live possibility rather than a remote one, and the first version of this bench CAPTURED
  // uPk and dropped it when building the row, which left the mechanism half-measured.
  // THE SPLIT, because the owner's account of WHY the ratio rises with feed is testable and
  // this bench kept only the total. Uncontrolled, the arm's flex lets the tip carry further
  // with momentum than the corrected one does — a spring-loaded excursion that scales with the
  // ACCELERATION the corner rule demands rather than with speed, so it outruns the feed. The
  // measured exponents agree: open grows as feed^1.25 across the span and corrected as
  // feed^1.13, so the controller is removing the component that grows fastest, which is why
  // the ratio rises 3.33x -> 4.48x instead of decaying.
  //
  // WHAT WOULD FALSIFY IT: if that growth sat in LAG rather than CONTOUR. A tip carrying wide
  // at a corner is a contour error — the part is the wrong shape; a tip merely late is lag.
  // The two have different causes and different fixes (rule 39), and one RMS hides both.
  rows.push({
    openC: off.r.contourRms, openL: off.r.lagRms,
    depC: on.r.contourRms, depL: on.r.lagRms,
    openBias: off.r.contourBias, openOsc: off.r.contourOsc,
    depBias: on.r.contourBias, depOsc: on.r.contourOsc,
    feed, open: off.r.totalRms, dep: on.r.totalRms, per: pfOn.r.totalRms,
    depX: off.r.totalRms / on.r.totalRms, perX: off.r.totalRms / pfOn.r.totalRms,
    ratio: on.r.totalRms / pfOn.r.totalRms, uPk: on.uPk, cap: UCAP,
    depOk: home.verdict.deploy, perOk: pf.verdict.deploy });
  const r = rows[rows.length - 1];
  console.log(`  [${mins()}m] feed ${feed.toExponential(1)}  open ${r.open.toExponential(3)}`
    + `  deployed ${r.dep.toExponential(3)} (${r.depX.toFixed(2)}x)`
    + `  per-feed ${r.per.toExponential(3)} (${r.perX.toFixed(2)}x)`
    + `  penalty ${r.ratio.toFixed(3)}x  uPk ${r.uPk.toFixed(3)} of ${r.cap}`
    + `${r.uPk > 0.98 * r.cap ? ' AT THE CAP' : ''}${r.perOk ? '' : '  [per-feed REFUSED]'}`);
}

console.log(`\n  feed        open      deployed      x    uPk/cap`);
for (const r of rows) {
  console.log(`  ${r.feed.toExponential(1)}  ${r.open.toExponential(3)}  `
    + `${r.dep.toExponential(3)}  ${r.depX.toFixed(2)}x  ${(r.uPk / r.cap * 100).toFixed(0)}%`
    + `${r.uPk > 0.98 * r.cap ? '  AT THE CAP' : ''}${r.perOk ? '' : '  per-feed refused'}`);
}
console.log(`\n  the split — is the open loop's growth CONTOUR (the tip carries wide) or LAG?`);
console.log(`  feed      openC     openL    depC      depL    contourX   lagX`);
for (const r of rows) {
  console.log(`  ${r.feed.toExponential(1)}  ${r.openC.toExponential(3)}  ${r.openL.toExponential(3)}`
    + `  ${r.depC.toExponential(3)}  ${r.depL.toExponential(3)}`
    + `  ${(r.openC / r.depC).toFixed(2)}x    ${(r.openL / r.depL).toFixed(2)}x`);
}
{
  const f = rows[rows.length - 1].feed / rows[0].feed;
  const gc = rows[rows.length - 1].openC / rows[0].openC;
  const gl = rows[rows.length - 1].openL / rows[0].openL;
  console.log(`  open loop across the span: contour grows ${gc.toFixed(2)}x `
    + `(feed^${(Math.log(gc) / Math.log(f)).toFixed(2)}), lag grows ${gl.toFixed(2)}x `
    + `(feed^${(Math.log(gl) / Math.log(f)).toFixed(2)})`);
}
// A RISING RATIO WITH FEED IS THE SURPRISE, so it gets the instrument check rather than the
// write-up (rule 14). If uPk is pinned at the cap in the fast rows the correction is clamped
// and the ratio is not the controller doing more; if it has headroom, it is.
const capped = rows.filter((r) => r.uPk > 0.98 * r.cap);
console.log(`  rows at the correction cap: ${capped.length === 0 ? 'none — the rising ratio is '
  + 'not a clamped correction' : capped.map((r) => r.feed.toExponential(1)).join(', ')}`);
// THE HEADLINE IS THE SPAN OF THE DELIVERED RATIO, not the penalty against the per-feed
// control — that control is near-unity by construction (see the header) and a "worst penalty
// 1.00x, INSIDE the bar" line would be a headline this measurement has not earned.
const xs = rows.map((r) => r.depX);
const spanX = Math.max(...xs) / Math.min(...xs);
console.log(`\n  DELIVERED RATIO ACROSS THE SPAN: ${Math.min(...xs).toFixed(2)}x to `
  + `${Math.max(...xs).toFixed(2)}x — a ${spanX.toFixed(2)}x spread across ${(FEEDS[FEEDS.length - 1] / FEEDS[0]).toFixed(1)}x of feed`);
const worst = Math.max(...rows.map((r) => r.ratio));
const anyWorse = rows.filter((r) => r.dep > r.open);
console.log(`  per-feed penalty ${worst.toFixed(3)}x — near unity because the fit is `
  + `program-agnostic, NOT because a deployed model matched a feed-tuned one`);
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
