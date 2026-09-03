// IS THE GAP ITERATION? — the last explanation standing, and the one that decides the route.
//
// WHAT HAS BEEN ELIMINATED. `test/_oracle.mjs`: with a perfect free response the sharp square
// goes 2.15x -> 2.57x and, with the authority raised until the QP stops using it, 3.65x — the
// effort weight and the solver's iteration count both inert. `test/_oracleclock.mjs`: the
// decision clock is inert too, 2.57 / 2.58 / 2.58x at 1x, 4x and 16x the QP arithmetic, so
// the plan being piecewise-constant over 72 solver steps is not it either.
// `test/_hcheck.mjs` and `test/_hpose.mjs`: the QP's plant model `h` explains R^2 0.94 / 0.77
// of what the correction actually did ON A HOLDOUT PROGRAM, and 1/sqrt(1-R^2) is 4.1x and
// 2.1x — which is where the oracle ladder stopped. The pilot is AT its `h`'s one-shot ceiling.
//
// A ONE-SHOT INVERSE CANNOT DO BETTER THAN ITS MODEL. An ITERATED one can: apply, measure what
// is left, invert again, and the model error compounds down instead of standing. Mode 10 is an
// iterated inverse — it re-simulates the whole program each pass — and that, not its twin and
// not its non-causality, would explain a factor of twelve over a model that is already 94%
// right.
//
// SO ITERATE THE PILOT AND SEE WHERE IT LANDS. Each pass freezes what the last one applied,
// re-measures the free response with that prefix in place, hands the pilot THAT as an oracle,
// and adds the new correction to the prefix. Every pass has a perfect forecast, so nothing
// here is limited by fitting.
//
// THE PREFIX IS A MEMORY AND THAT IS THE POINT. It is indexed by position in a lap, which the
// retirement forbids a shipped component to be. This is a DIAGNOSTIC: it measures how much of
// mode 10's advantage is iteration, so that the question can become "how do you iterate
// without a memory" instead of another campaign against a component that is not the
// constraint. A number from this bench is not a controller.
import { commissionArm, deployOn, mkPath, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.OR_SHAPE || 'sharp';
const FEED = +(process.env.OR_FEED || 0.004);
const PASSES = +(process.env.OR_PASSES || 5);
const UM = +(process.env.OR_UMAX || 0);          // 0 = the commissioned cap

console.log(`arm K ${PG.K} / E ${PG.E}, ${SHAPE} at feed ${FEED}, ${PASSES} passes`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
if (UM) pilot.uMax = UM;
const path = mkPath(SHAPE, FEED);
const LAPK = Math.round(path.lap);                 // solver steps in a lap
const LAPS = Math.round(path.lap / pilot.sample);  // samples in a lap
console.log(`sample ${pilot.sample}, grid ${pilot.grid}, N ${pilot.N}, uMax ${pilot.uMax}; `
  + `lap ${LAPK} steps / ${LAPS} samples`);

let pre = [new Float64Array(LAPK), new Float64Array(LAPK)];
// BOTH DENOMINATORS, because mode 10's published 44x is CONTOUR-only on a converged lap and
// this project's own recurring trap is comparing two numbers that are not the same quantity.
// `totalRms` is contour + lag and is what the Path tab scores; `contourRms` is the column
// mode 10 is quoted in. Quoting one against the other is how a factor gets invented.
console.log('\n  pass   free rms     totalRms     x tot    contourRms    x con    uPk   prefix pk');
let open = null, openC = null;
for (let pass = 0; pass <= PASSES; pass++) {
  // 1. THE FREE RESPONSE WITH THE PREFIX FROZEN — the pilot is off, so this is exactly the
  //    error the next pass has to remove, measured on the machine rather than predicted.
  const ftr = [];
  const fr = await deployOn(pilot, SHAPE, false, FEED, { pre, trace: ftr });
  if (pass === 0) { open = fr.r.totalRms; openC = fr.r.contourRms; }
  let s = 0, n = 0;
  for (let i = 2 * LAPS; i < ftr.length; i++) { s += ftr[i].e[0] ** 2 + ftr[i].e[1] ** 2; n++; }
  const freeRms = Math.sqrt(s / Math.max(1, n));
  if (pass === PASSES) {
    console.log(`  ${String(pass).padStart(4)}   ${freeRms.toExponential(3)}  `
      + `${fr.r.totalRms.toExponential(4)} ${(open / fr.r.totalRms).toFixed(2).padStart(6)}x  `
      + `${fr.r.contourRms.toExponential(4)} ${(openC / fr.r.contourRms).toFixed(2).padStart(6)}x`
      + `   (prefix alone, pilot off)`);
    break;
  }
  // 2. THE PILOT ON TOP, WITH THAT MEASUREMENT AS ITS ORACLE. Aligned by construction: the
  //    record's phase is `kSamp % LAPS` and the oracle reads the LAST lap of it, which is the
  //    settled one (rule 13).
  const or = { e: ftr.map((t) => t.e), lap: LAPS, off: 2 * LAPS };
  const uOut = [new Float64Array(LAPK), new Float64Array(LAPK)];
  const r = await deployOn(pilot, SHAPE, true, FEED, { pre, oracle: or, preOut: uOut });
  let pk = 0;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < LAPK; i++) { pre[c][i] += uOut[c][i]; pk = Math.max(pk, Math.abs(pre[c][i])); }
  }
  console.log(`  ${String(pass).padStart(4)}   ${freeRms.toExponential(3)}  `
    + `${r.r.totalRms.toExponential(4)} ${(open / r.r.totalRms).toFixed(2).padStart(6)}x  `
    + `${r.r.contourRms.toExponential(4)} ${(openC / r.r.contourRms).toFixed(2).padStart(6)}x`
    + `  ${r.uPk.toFixed(3)}   ${pk.toFixed(4)}`);
}
console.log('EXIT 0');
