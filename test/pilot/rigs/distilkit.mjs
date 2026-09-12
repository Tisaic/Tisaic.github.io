/**
 * @file THE TWO THINGS EVERY DISTILLED-RUNG HARNESS SHARES, SO THEY ARE WRITTEN ONCE.
 *
 * `distil-tank.mjs`, `distil-arm.mjs` and `distil-barrel.mjs` each derive a window and each print
 * a verdict, and a second copy of either has already drifted in this project: `distil-tank.mjs`
 * carries the arm's 0.61·Tset reach as though it were a rule, and §63.7 sized a window from
 * `DIETS[0]`'s lap when the diet's laps had stopped being equal. Neither is a plant's business —
 * the DIET is plant-specific and belongs in the plant's own harness; the derivation and the
 * report are not, and belong here (rule 61).
 *
 * WHAT THE WINDOW RULE IS AND WHY IT HAS NO PLANT CONSTANT IN IT. Two constraints pull opposite
 * ways (§49.11, rule 37 against §41's aliasing theorem): the window must REACH the plant's memory
 * and must not SPAN the training lap. Every harness before §63 obeyed the first alone, which is
 * right only while the plant's settle is short against its program — on the barrel the settle is
 * 7,861 steps against 15,000 and a reach-sized window aliases. `min(0.61·settle, lap/8)` obeys
 * both. The 0.61 is the arm's shipped reach as a FRACTION of its own settle, which is a design;
 * the lap/8 is the aliasing bound. It is evidence and not proof: on the barrel the rule reads
 * ±938 where §62.5 measured the transfer optimum at ±983 by an offline route with no rung in it,
 * which is agreement to 5% on a plant sharing no physics with the one the fraction came from, and
 * that ladder locates the optimum only to about a factor of two.
 *
 * THE LAP IS THE SHORTEST IN THE DIET, not the first: the aliasing half is about the lap the
 * window could span, so a diet of mixed rates is bounded by its fastest recipe.
 */

/** The geometric offset SHAPE — dense near now where the correction is decided, sparse far out
 * where it only has to span the memory. The shape is a design; the reach is the plant's. */
const SHAPE = [0, 0.008, 0.016, 0.031, 0.063, 0.125, 0.219, 0.344, 0.5, 0.719, 1];

/**
 * @param {object} o
 * @param {number} o.settle   the plant's own measured settle, in raw steps
 * @param {number} o.lapMin   the SHORTEST lap in the training diet, in raw steps
 * @param {number} [o.win]    an override in raw steps, so the derivation can be swept not asserted
 */
function deriveWindow({ settle, lapMin, win }) {
  const rule = Math.min(0.61 * settle, lapMin / 8);
  const reach = Math.round(win === undefined || win === null || !Number.isFinite(win) ? rule : win);
  const offsets = SHAPE
    .flatMap((f) => { const o = Math.round(f * reach); return o === 0 ? [0] : [-o, o]; })
    .sort((a, b) => a - b);
  return { reach, offsets, rule: Math.round(rule) };
}

/**
 * The verdict, with the unflattering diagnostics FIRST (rule 27).
 *
 * A prequential R² below zero has at least three cheap explanations that the score itself cannot
 * tell apart — a target the teacher never converged (`distil-tank.mjs` read gains of 3.2e6 on a
 * quasi-static diet, which is a target already at zero rather than a controller result), a diet
 * whose runs were dropped, and too few rows for the features — and `rep.distil.runs` carries all
 * three for nothing. They are printed before any account of the fit.
 *
 * THE IN-SAMPLE COLUMN IS THE ONE THAT SAYS *WHY* (the split `distil-arm.mjs` exists to make):
 * helps its own training runs and harms the scored program -> TRANSFER, and the diet is the
 * subject; cannot help even the runs it was fitted on -> the map cannot EXPRESS this plant's
 * correction and no diet repairs that. Without it a refusal has two explanations and nothing
 * distinguishes them.
 */
async function reportDistil({ rep, runs, nFeat, segs = null }) {
  let inSample = null;
  if (rep.distil && rep.distil.policy) {
    inSample = [];
    for (const r of runs) {
      const bare = await r.run(null);
      const withP = await r.run({ at: (k) => rep.distil.policy.actLook((o) => r.refAt(k + o)) });
      inSample.push(bare.score / withP.score);
    }
    console.log('\n  in sample, on its own training runs: '
      + inSample.map((x) => `${x.toFixed(3)}x`).join('  '));
  }
  if (rep.distil && rep.distil.runs) {
    console.log('  the TEACHER, per training run:');
    for (const [i, c] of rep.distil.runs.entries()) {
      console.log(`    run ${i}: ${segs ? `SEG ${segs[i % segs.length]}  ` : ''}lap ${c.lap}  `
        + `teacher ${c.gain.toFixed(3)}x  rows ${c.used}  ${c.dropped ? 'DROPPED' : 'kept'}`
        + `  engine ${c.engine}`
        + (c.passes === null || c.passes === undefined ? '' : `  passes ${c.passes}`));
    }
  }
  if (rep.distil && rep.distil.fit) {
    const f = rep.distil.fit;
    console.log(`  the FIT: ${f.rows} rows / ${nFeat} features, `
      + `held-out ${JSON.stringify(f.heldOutR2)}, deploy ${f.deploy}`);
  }
  const dr = rep.rungs.find((r) => /distil/.test(r.name));
  console.log(`  distilled rung: ${dr ? `${dr.deployed ? 'DEPLOYED' : 'REFUSED'} at `
    + `${dr.gain === null ? '—' : dr.gain.toFixed(3)}x` : 'not reported'}`);
  if (rep.distil && rep.distil.note) console.log(`  ${rep.distil.note}`);
  return { inSample, dr };
}

export { deriveWindow, reportDistil, SHAPE };
