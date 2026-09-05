/**
 * @file WHICH CHANNEL MAKES THE ARCS? — the owner's read, tested directly.
 *
 * The trace bows outward in a smooth arc on every edge and the owner reads that as the elbow.
 * The circumstantial case is good: at K 0.25 / E 0.005 the elbow forecasts at r2Lead0 0.546
 * against the shoulder's 0.992, and there is a mechanism — a straight Cartesian edge needs a
 * CURVED joint-space path, the elbow carries the distal link, and that link's flex displaces
 * the tool transverse to the path, which is the direction a contour error lives in (rule 48: a
 * bent link tilts everything downstream, and omitting that term once cost 1.44x).
 *
 * BUT CIRCUMSTANTIAL IS NOT MEASURED, and this arm is COUPLED. This file arms ONE channel's
 * correction at a time from the SAME commissioned pilot and scores the machine, so the question
 * "which channel's correction removes the bow" is answered by the machine rather than by the
 * plausibility of the story (rule 16). It is also the control for a known trap: this project has
 * recorded a one-channel correction on a coupled arm being "not a smaller correction but one in
 * a direction the QP never chose", so a single-channel run can be WORSE than both, and that
 * outcome is a result rather than a failure of the experiment.
 *
 * Reported per channel: total, contour, and the bias/oscillation split, because the bow is a
 * contour feature and lumping it with lag hides exactly the component under test (rules 6, 39).
 *
 * Run: ARM_K=0.25 ARM_E=0.005 SUITE=full node test/_armswhich.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEED = +(process.env.FEED || 1.6e-2);
const UCAP = +(process.env.UCAP || 0.6);

const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED } });
const ro = p.status().report.readouts;
console.log(`\nwhich channel makes the arcs — K ${process.env.ARM_K || 16} / `
  + `E ${process.env.ARM_E || 0.15}, ${SHAPE} at feed ${FEED.toExponential(1)}`);
ro.forEach((r, c) => console.log(`  ch${c} ${c ? '(elbow)   ' : '(shoulder)'} `
  + `r2Lead0 ${r.r2Lead0.toFixed(3)}  basis ${r.basis}`));

// GATE ONE CHANNEL AT A TIME. `readouts[c].gated` is the pilot's own disarm flag — the same one
// the forecast gate sets — so this uses the machinery already there rather than reaching past
// `act()` into the correction (which would be a second path that could drift from the first).
const was = ro.map((_, c) => p.readouts[c].gated);
async function armed(which) {
  for (let c = 0; c < p.readouts.length; c++) p.readouts[c].gated = (which === 'both') ? was[c]
    : (which === c ? was[c] : true);
  const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
  for (let c = 0; c < p.readouts.length; c++) p.readouts[c].gated = was[c];
  return r;
}

const off = await deployOn(p, SHAPE, false, FEED);
console.log(`\n  armed        total      contour     bias        osc         uPk`);
console.log(`  none      ${off.r.totalRms.toExponential(3)}  ${off.r.contourRms.toExponential(3)}`
  + `  ${off.r.contourBias.toExponential(3)}  ${off.r.contourOsc.toExponential(3)}  —`);
for (const [name, which] of [['shoulder', 0], ['elbow', 1], ['both', 'both']]) {
  const r = await armed(which);
  console.log(`  ${name.padEnd(8)}  ${r.r.totalRms.toExponential(3)}  ${r.r.contourRms.toExponential(3)}`
    + `  ${r.r.contourBias.toExponential(3)}  ${r.r.contourOsc.toExponential(3)}  ${r.uPk.toFixed(3)}`
    + `   ${(off.r.contourRms / r.r.contourRms).toFixed(2)}x contour`);
}
console.log(`\n  the channel whose correction removes most CONTOUR is the one making the arcs;`);
console.log(`  a single channel scoring WORSE than none is the coupled-arm trap, not a bug.\n`);
