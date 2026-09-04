// LOG-SPACED LAGS ON THE MACHINE — the offline R^2 put to the plant (rule 16).
//
// OFFLINE, at identical column count, identical span and identical ridge, log spacing moved the
// SHARP SQUARE's elbow at lead 0 from held-out R^2 0.4664 to 0.5545 and left every other cell
// within 0.01. That is the binding forecast in the whole system — a receding horizon applies
// lead 0, and the elbow is the channel that fails — and it lifts its delivery bound from 1.37x
// to 1.50x. It costs nothing: same arithmetic, same memory, and the spacing comes from the
// plant's own measured stride.
//
// A number computed from the model cannot check the model, and three separate defects here were
// caught only by deploying (rule 16). The 'uniform' row is the control and must reproduce the
// shipped scores exactly.
//
// WHAT WOULD KILL IT: no better on the machine. Then lead-0 forecast quality does not move this
// machine either, which would be a genuinely new finding — every previous null of that shape was
// about MID and FAR leads, and lead 0 has never been the thing that failed to matter.
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.LD_FEED || 0.004);
const UCAP = +(process.env.LD_UCAP || 0.6);
const RISES = +(process.env.LD_RISES || 10);
const SHAPES = (process.env.LD_SHAPES || 'sharp,circle,rounded').split(',');
const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, probeRises ${RISES}`);
let open = null;
for (const spacing of ['uniform', 'log']) {
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, before: (p) => { p.probeRises = RISES; p.lagSpacing = spacing; } });
  if (!pilot) { console.log(`  ${spacing}: commissioning never terminated`); continue; }
  if (!open) {
    open = {};
    for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
    console.log(`open loop: ${SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  ')}`);
    console.log('\n  lag spacing  lags/stride' + SHAPES.map((s) => s.padStart(17)).join('') + '     geo mean');
  }
  const ro = pilot.readouts[0];
  const xs = [], cols = [];
  for (const s of SHAPES) {
    const d = await deployOn(pilot, s, true, FEED);
    const x = open[s] / d.r.totalRms;
    xs.push(x); cols.push(`${x.toFixed(2)}x u${d.uPk.toFixed(3)}`.padStart(17));
  }
  console.log(`  ${spacing.padEnd(11)}  ${String(ro.mLag).padStart(2)}/${String(ro.stride).padStart(3)}`
    + `      ${cols.join('')}   ${gm(xs).toFixed(2).padStart(10)}`);
}
console.log('EXIT 0');
