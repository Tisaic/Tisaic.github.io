// HOW DEEP DOES THE CASCADE GO? — the route the iteration finding points at.
//
// `test/_oraclecascade.mjs` measured that the pilot's whole gap to mode 10 is ITERATION:
// hand it a perfect forecast and it stops at 2.56x, iterate that same perfect forecast and
// it reaches 6.58x, 12.11x, 16.43x, 19.48x. And the first two of those are within noise of
// what `lib/pilot/stack.js` already delivers on this exact cell at depth 1 and 2 (6.43x,
// 12.21x, brick 59) — the cascade IS the pilot's iteration, done as models addressed by
// state rather than as a table addressed by lap phase.
//
// So the question is where it stops and why. Depth 3 has never been run on this arm; the only
// depth-3 number this project has is EMPS' 29.8x. Each layer costs a full commissioning, so
// the wall clock is reported beside the score: a factor bought at four commissionings is a
// different product from one bought at one, and target 4 has to pay for it.
//
// EVERY DEPTH IS SCORED ON PROGRAMS THE CASCADE NEVER SAW. It commissions on a scribble with
// the rounded rectangle as the gate's representative program, and is scored on the sharp
// square and the circle — the first-unseen-lap ordering the north star rests on. A cascade
// that only deepened at home would be the memory under another name.
import { Stack } from '/home/user/Tisaic.github.io/lib/pilot/stack.js';
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const DEPTHS = (process.env.CD_DEPTHS || '1,2,3,4').split(',').map(Number);
// THE CAP IS SWEPT AT COMMISSIONING, NOT AT DEPLOY. Raising `stack.uMax` after the fact lets
// the sum through but every layer was still fitted, verified and gated under the old cap — so
// it measures the clamp, not the authority. Handing each layer the larger cap from the start
// is the only version of the question the machine can answer (rule 34).
const UCAPS = (process.env.CD_UCAPS || '0.15,0.6').split(',').map(Number);
const SHAPES = (process.env.CD_SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.CD_FEED || 0.004);
const CAPS = (process.env.CD_CAPS || '1').split(',').map(Number);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}; scored on ${SHAPES.join(', ')}`);
const open = {};
for (const uCap of UCAPS) {
for (const depth of DEPTHS) {
  const t0 = Date.now();
  const st = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap, Cls: Stack, extra: { depth } });
  const mins = (Date.now() - t0) / 60000;
  if (!st) { console.log(`  depth ${depth}: commissioning never terminated`); continue; }
  const live = st.report.layers.filter((l) => l.deployed).length;
  console.log(`\n  uCap ${uCap} depth ${depth}: ${live} of ${st.layers.length} layer(s) `
    + `deployed in ${mins.toFixed(1)} min — ${st.verdict ? st.verdict.why : 'no verdict'}`
    + `; verify clamped ${st.report.verifyClamped}`);
  for (const l of st.report.layers) {
    console.log(`    layer ${l.layer}: ${l.deployed ? 'deployed' : 'REFUSED'}`
      + `${l.verify != null ? `, verify ${l.verify.toFixed(2)}x` : ''}`
      + `, N ${l.N}, R2 lead0 ${(l.r2 || []).map((v) => (v == null ? '-' : v.toFixed(3))).join('/')}`
      + `${l.why ? ` — ${l.why}` : ''}`);
  }
  // THE CAP IS THE STACK'S, ON THE SUM — every layer commissions with the engineer's full
  // authority and what reaches the machine is one clamped number. The oracle iteration ladder
  // needed a prefix peak of 0.60 to reach 16.43x while this cap is 0.15, so a depth that
  // stalls at the cap is measuring the CLAMP and not the cascade. `report.clamped` says which,
  // and the cap is swept for the same reason (rule 9, both halves).
  const cap0 = st.uMax;
  for (const mult of CAPS) {   // deploy-time cap multiplier, kept as the clamp control
    st.uMax = cap0 * mult;
    for (const shape of SHAPES) {
      if (!open[shape]) open[shape] = (await deployOn(st, shape, false, FEED)).r.totalRms;
      st.report.clamped = 0;
      const r = await deployOn(st, shape, true, FEED);
      console.log(`    cap x${String(mult).padEnd(2)} ${shape.padEnd(8)} `
        + `${r.r.totalRms.toExponential(4)}  `
        + `${(open[shape] / r.r.totalRms).toFixed(2).padStart(6)}x over open `
        + `${open[shape].toExponential(3)}   uPk ${r.uPk.toFixed(4)}  `
        + `clamped ${st.report.clamped}`);
    }
  }
  st.uMax = cap0;
}
}
console.log('EXIT 0');
