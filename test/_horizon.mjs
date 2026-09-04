// IS THE LOOK-AHEAD THE BINDING CONSTRAINT? — the experiment the non-minimum-phase reading
// demands, and the attribution `_hlen` could not make.
//
// WHY IT IS THE RIGHT QUESTION NOW. A right-half-plane zero — the tip's first motion opposite to
// where it ends up, which is what a base-driven flexible link and a cart-and-pendulum share —
// cannot be inverted stably by a CAUSAL controller. It can be inverted by a NON-CAUSAL one, and
// the preview required is set by the zero's own time constant. Every knob this section found
// helpful shrinks the inverse (`mu`, fewer iterations, more claimed gain, more `lambda`); those
// are stabilisations of an unstable inverse, and the alternative treatment is to give the solver
// enough look-ahead to act early instead of enough damping to act less.
//
// AND `_hlen` ALREADY MOVED IT BY ACCIDENT. Raising `probeRises` 10 -> 25 lengthened the kernel
// (1800 -> 4400 steps) AND raised `Tset`, and `N = ceil(horizonTs * Tset / sample / grid)`, so
// the horizon's reach went 3776 -> 5040 solver steps against an 8206-step lap. The circle gained
// 1.46x and the rounded rectangle 1.19x. Two causes, one measurement.
//
// THE ATTRIBUTION ROW IS `rises 10, horizonTs 2.0`: the SHORT kernel at the LONG reach. If it
// reproduces the rises-25 scores, the horizon did it and the kernel is incidental. If it
// reproduces the shipped scores, the kernel did it.
//
// THEN THE THESIS ROW: push `horizonTs` past anything this project has run. The shipped 1.5 was
// never chosen against a measurement of how far ahead this plant has to be acted on.
//
// `horizonTs` MUST BE SET AT COMMISSIONING, not after it: the forecast bank is fitted to N leads
// and reading past it returns NaN, which passes every bounds check (the six-plant pass found
// exactly that). So each row is a full commissioning and the cost is real.
//
// WHAT WOULD KILL IT: the score is flat in `horizonTs` at a fixed kernel. Then the preview
// reading is wrong, the receding horizon is already long enough, and what `_hlen` measured was
// the kernel.
import { commissionArm, deployOn, mkPath, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.HZ_FEED || 0.004);
const UCAP = +(process.env.HZ_UCAP || 0.6);
const SHAPES = (process.env.HZ_SHAPES || 'sharp,circle,rounded').split(',');
// rows as `rises:horizonTs`
const ROWS = (process.env.HZ_ROWS || '10:1.5,10:2.0,25:1.5,25:3.0,25:4.5')
  .split(',').map((s) => { const [r, h] = s.split(':').map(Number); return { r, h }; });

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
console.log(`lap ${Math.round(mkPath('sharp', FEED).lap)} solver steps`);

let open = null;
const rows = [];
for (const { r: R, h: H } of ROWS) {
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, before: (p) => { p.probeRises = R; p.horizonTs = H; } });
  if (!pilot) { console.log(`  rises ${R} hTs ${H}: commissioning never terminated`); continue; }
  if (!open) {
    open = {};
    for (const shape of SHAPES) open[shape] = (await deployOn(pilot, shape, false, FEED)).r.totalRms;
    console.log(`open loop: ${SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  ')}`);
    console.log('\n  rises   hTs   resp        N   reach' + SHAPES.map((s) => s.padStart(17)).join(''));
  }
  const reach = pilot.N * pilot.grid * pilot.sample;
  const cols = [];
  for (const shape of SHAPES) {
    const d = await deployOn(pilot, shape, true, FEED);
    cols.push(`${(open[shape] / d.r.totalRms).toFixed(2)}x u${d.uPk.toFixed(3)}`.padStart(17));
  }
  rows.push({ R, H, reach, N: pilot.N, cols });
  console.log(`  ${String(R).padStart(5)}  ${H.toFixed(1).padStart(4)}  `
    + `${pilot.hs.map((h) => h.resp.length).join('/').padStart(9)}  ${String(pilot.N).padStart(3)}`
    + `  ${String(reach).padStart(6)}${cols.join('')}`);
}
console.log('EXIT 0');
