/**
 * @file THE PRICE OF AGNOSTICISM, MEASURED AGAINST THE RIGHT DENOMINATOR.
 *
 * Target 1 reads "worst held-out degradation 1.3x", and its denominator is the best gain on
 * any SEEN program — which makes the sharp square's ABSOLUTE hardness read as transfer
 * failure. The self-fit banks measured 3.27x on the square, so even with agnosticism
 * abandoned entirely the degradation floor against the rounded row's 6.18x is 1.89x: the
 * 1.3x target is unreachable BY ANY BANK on that metric, on this plant, by construction.
 *
 * The defensible split is two numbers with different owners:
 *   PROGRAM HARDNESS  best self-fit gain on the easy program / best self-fit gain on the
 *                     hard one — a property of the MACHINE AND PROGRAM (corner-rule
 *                     reversals crossing backlash), not of any controller.
 *   PRICE OF AGNOSTICISM  self-fit ceiling on the hard program / the agnostic composition
 *                     on the same program — what refusing to look at the test geometry
 *                     actually costs. THIS is the number a program-agnostic claim owns.
 *
 * Both rows here run the SAME full composition — corner banks + router + guided adaptation,
 * then frozen — and differ ONLY in what they were allowed to see:
 *   CEILING   banks fitted on the sharp square itself, adaptation guided on the sharp
 *             square itself (the maximal violation of the contract);
 *   AGNOSTIC  banks from random polygons, adaptation guided on the diamond — nothing ever
 *             sees the scored geometry.
 *
 * Run: node test/pilot/agnosticprice.mjs [SHAPE=sharp] [FEED=0.004]
 */
import { commissionArm, deployOn, recordOpenLoop, randomPolygon, fitCornerBanks, mkPath }
  from './rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEED = +(process.env.FEED || 0.004);
const rnd = (s0) => { let z = s0 >>> 0;
  return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };

async function protocol(selfFit) {
  const pilot = await commissionArm({ seed: 1 });
  if (!pilot || !pilot.verdict.deploy) return null;
  const recs = [];
  if (selfFit) {
    for (const feed of [0.004, 0.008, 0.0055]) {
      recs.push(await recordOpenLoop(pilot, mkPath(SHAPE, feed), feed));
    }
  } else {
    for (const [seed, feed] of [[81, 0.004], [82, 0.008], [83, 0.0055]]) {
      recs.push(await recordOpenLoop(pilot, randomPolygon(rnd(seed), feed), feed));
    }
  }
  fitCornerBanks(pilot, recs, { vTopK: selfFit ? +(process.env.VTOPK || 1) : 1 });
  if (process.env.GUIDE !== '0') {
    pilot.online = {};
    await deployOn(pilot, selfFit ? SHAPE : 'diamond', true, 0.004,
      { laps: 4, scoreFromLap: 3, truthUntilLap: 4 });
    pilot.online = null;
  }
  const off = await (async () => {
    const saved = pilot.verdict;
    pilot.verdict = { deploy: false, why: 'off' };
    const r = await deployOn(pilot, SHAPE, true, FEED);
    pilot.verdict = saved;
    return r;
  })();
  const on = await deployOn(pilot, SHAPE, true, FEED);
  return { off: off.r.contourRms, on: on.r.contourRms, uPk: on.uPk,
    gain: off.r.contourRms / on.r.contourRms };
}

console.log(`\nthe price of agnosticism on ${SHAPE} @${FEED}: same composition, different diet`);
const ceil = await protocol(true);
console.log(`  CEILING  (banks+guidance on ${SHAPE} itself)  ${ceil.on.toExponential(3)}`
  + `  (${ceil.gain.toFixed(2)}x)  u ${ceil.uPk.toFixed(3)}`);
const agn = await protocol(false);
console.log(`  AGNOSTIC (polygon banks, diamond guidance)   ${agn.on.toExponential(3)}`
  + `  (${agn.gain.toFixed(2)}x)  u ${agn.uPk.toFixed(3)}`);
console.log(`\n  open loop ${ceil.off.toExponential(3)}`);
console.log(`  PRICE OF AGNOSTICISM = ${ceil.gain.toFixed(2)} / ${agn.gain.toFixed(2)}`
  + ` = ${(ceil.gain / agn.gain).toFixed(2)}x  (the number the agnostic claim owns)`);
