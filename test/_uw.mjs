// THE MISSING TERM: A MAGNITUDE PENALTY ON THE CORRECTION.
//
// HOW THIS WAS REACHED, AND IT TOOK FOUR TRIES. Scaling only the shoulder's kernel at uCap 0.6
// is worth up to +139%, and three proposed mechanisms — amplitude compression, held-probe
// under-identification, the moving kernel as a repair — were each rejected by the next
// measurement. Rule 39, pointed at the CORRECTION instead of the error, said in one run what
// none of them could: oscillation has a clean minimum at scale 1.30, the contour bias crosses
// zero from POSITIVE to negative through the same point, and the correction's own rms falls.
// The pilot at scale 1.00 OVER-CORRECTS and rings.
//
// AND THE OBJECTIVE HAS NO WAY TO SAY SO. `boxQP` penalises ||D u||^2 — a RATE — plus an
// optional notch at one frequency, inside a box. "Use less correction" is a different
// instruction from "change it more slowly", and the machine settled it: raising `lambda` from
// 1x to 32x moves the score by under 1% on all three programs (3.49 -> 3.47, 2.76 -> 2.78,
// 2.87 -> 2.85) while shrinking the plan's rms from 0.246 to 0.188. The rate knob smooths the
// PLAN and leaves the delivered bias and oscillation exactly where they were.
//
// SO THE 1.30 IS A LIE ABOUT THE PLANT STANDING IN FOR A TERM THAT DOES NOT EXIST. `mu` is that
// term — ||u||^2, per channel, the standard MPC companion to the rate penalty — and unlike a
// fitted kernel scale it is a WEIGHT the pilot can derive on the machine exactly as it already
// derives `lambda`: a candidate set, scored, rule 42's band. That is the difference between the
// per-plant constant rule 31 forbids and a measured property.
//
// WHAT WOULD KILL IT: if `mu` cannot reach what the `h` scale reaches, then the effect is not a
// magnitude preference and the whole reading is wrong. The `h`-scale row is carried in the same
// table as the target to hit.
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.UW_SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.UW_FEED || 0.004);
const UCAP = +(process.env.UW_UCAP || 0.6);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
console.log(`lambda ${pilot.lambda.toExponential(3)}; the QP's tracking term is O(|h|^2) with `
  + `|h| dc ${pilot.hs.map((h) => h.dc.toFixed(3)).join(', ')}`);
const open = {};
for (const shape of SHAPES) open[shape] = (await deployOn(pilot, shape, false, FEED)).r.totalRms;

const row = async (label) => {
  const cols = [];
  for (const shape of SHAPES) {
    const tr = [];
    const r = await deployOn(pilot, shape, true, FEED, { trace: tr });
    let s2 = 0;
    for (const t of tr) s2 += t.u[0] * t.u[0] + t.u[1] * t.u[1];
    cols.push(`${(open[shape] / r.r.totalRms).toFixed(2).padStart(5)}x b${r.r.contourBias.toExponential(1)}`
      + ` o${r.r.contourOsc.toExponential(1)} u${Math.sqrt(s2 / Math.max(1, tr.length)).toFixed(3)}`);
  }
  console.log(`  ${label.padEnd(22)} ${cols.join('  ')}`);
};
console.log('\n  configuration          ' + SHAPES.map((s) => s.padStart(30)).join(''));
await row('mu 0 (ships)');
// THE TARGET: what a 1.30 lie about the shoulder's kernel reaches, carried in the same table
const saved = pilot.hs.map((h) => ({ resp: h.resp, dc: h.dc }));
pilot.hs[0].resp = saved[0].resp.map((v) => v * 1.30); pilot.hs[0].dc = saved[0].dc * 1.30;
pilot._buildH();
await row('h ch0 x1.30 (the lie)');
pilot.hs[0].resp = saved[0].resp; pilot.hs[0].dc = saved[0].dc;
pilot._buildH();
// and the term itself, shoulder only, swept
for (const m of (process.env.UW_MUS || '0.01,0.03,0.1,0.3,1,3').split(',').map(Number)) {
  pilot.uWeight = [m, 0];
  await row(`mu ch0 ${m}`);
}
pilot.uWeight = null;
console.log('EXIT 0');
