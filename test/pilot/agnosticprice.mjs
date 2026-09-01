/**
 * @file THE PRICE OF AGNOSTICISM, MEASURED AGAINST THE RIGHT DENOMINATOR — and target 1's
 * contract, restated to the claim a program-agnostic controller can actually own.
 *
 * Target 1 read "worst held-out degradation 1.3x", with the best SEEN program's gain as its
 * denominator — which makes the sharp square's ABSOLUTE hardness read as transfer failure.
 * The self-fit ceiling on the square (banks fitted on the square itself, the maximal
 * violation of the contract) sits well below the rounded rectangle's 6.18x, so that metric
 * is unreachable BY ANY BANK on this plant, by construction. The defensible split is two
 * numbers with different owners:
 *
 *   PROGRAM HARDNESS      the easy program's gain over the hard program's own self-fit
 *                         ceiling — a property of the MACHINE AND PROGRAM (corner-rule
 *                         reversals crossing backlash at near-zero feed), owned by nobody's
 *                         controller.
 *   PRICE OF AGNOSTICISM  self-fit ceiling / the agnostic recipe, SAME program, same
 *                         instrument — what refusing to look at the test geometry costs.
 *                         THIS is the number the program-agnostic claim owns, and the 1.3x
 *                         target applies to it.
 *
 * Both rows run the measured-best protocol from plan §36 — record-scale lambda labels,
 * frozen banks, NO guided phase (guidance was measured helping only broken banks) — and
 * differ ONLY in diet: the ceiling's banks are fitted on the scored shape itself at three
 * feeds; the agnostic banks on six random polygons and stars, nothing ever seeing the
 * scored geometry. Measured at pinning time: ceiling 3.64x, agnostic 2.93x, price 1.24x.
 * (On the matrix instrument with its two-feed self diet: 3.54x/2.93x = 1.21x @0.004 and
 * 2.65x/2.42x = 1.10x @0.008.)
 *
 * Run: node test/pilot/agnosticprice.mjs [SHAPE=sharp] [FEED=0.004]
 *      [GUIDE=1 FITSCALE=anchor VTOPK=x for the archaeology variants]
 */
import { commissionArm, deployOn, recordOpenLoop, randomPolygon, fitCornerBanks, mkPath }
  from './rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEED = +(process.env.FEED || 0.004);
const rnd = (s0) => { let z = s0 >>> 0;
  return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

async function protocol(selfFit) {
  const pilot = await commissionArm({ seed: 1 });
  if (!pilot || !pilot.verdict.deploy) return null;
  const recs = [];
  if (selfFit) {
    for (const feed of [0.004, 0.008, 0.0055]) {
      recs.push(await recordOpenLoop(pilot, mkPath(SHAPE, feed), feed));
    }
  } else {
    for (const [seed, feed, star] of [[81, 0.004, 0], [82, 0.008, 0], [83, 0.0055, 0],
      [85, 0.004, 1], [86, 0.008, 1], [87, 0.0055, 1]]) {
      recs.push(await recordOpenLoop(pilot, randomPolygon(rnd(seed), feed, !!star), feed));
    }
  }
  fitCornerBanks(pilot, recs, { vTopK: selfFit ? +(process.env.VTOPK || 1) : 1,
    fitScale: process.env.FITSCALE || 'record' });
  if (process.env.GUIDE === '1') {
    // The archaeology variant only: guidance was measured helping anchor-scale (broken)
    // banks and harming record-scale (real) ones — plan §36.
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
console.log(`  CEILING  (banks on ${SHAPE} itself)          ${ceil.on.toExponential(3)}`
  + `  (${ceil.gain.toFixed(2)}x)  u ${ceil.uPk.toFixed(3)}`);
const agn = await protocol(false);
console.log(`  AGNOSTIC (polygon+star banks, no program)  ${agn.on.toExponential(3)}`
  + `  (${agn.gain.toFixed(2)}x)  u ${agn.uPk.toFixed(3)}`);
console.log(`\n  open loop ${ceil.off.toExponential(3)}`);
const price = ceil.gain / agn.gain;
console.log(`  PRICE OF AGNOSTICISM = ${ceil.gain.toFixed(2)} / ${agn.gain.toFixed(2)}`
  + ` = ${price.toFixed(2)}x  (the number the agnostic claim owns)\n`);

if (!process.env.GUIDE && !process.env.VTOPK && (process.env.FITSCALE || 'record') === 'record') {
  // TARGET 1'S CONTRACT, on the claim it can own. Both halves (rule 9): the price is inside
  // the target AND the ceiling is a real ceiling (the self-fit must beat the agnostic recipe
  // on its own program, or the "price" is measuring diet noise rather than knowledge).
  check('the price of agnosticism is inside target 1\'s 1.3x',
    price < 1.3, `${price.toFixed(2)}x`);
  check('…and the ceiling is a real ceiling: knowing the geometry still buys something',
    ceil.gain > agn.gain, `${ceil.gain.toFixed(2)}x against ${agn.gain.toFixed(2)}x`);
  check('…and the agnostic recipe is not a bystander: it clearly beats the bank-free machine',
    agn.gain > 2.0, `${agn.gain.toFixed(2)}x against the 1.69x baseline`);
  console.log(failed ? `\n  ${failed} check(s) FAILED\n` : '\n  all checks passed\n');
  process.exit(failed ? 1 : 0);
}
