// THE RICH-BLOCK PRIOR ON THE MACHINE — because `_rowscale.mjs` found the row's scale is not the
// lever and the PRIOR is, and a held-out R^2 does not decide anything here (rule 16).
//
// WHAT `_rowscale.mjs` MEASURED, fitting the pilot's OWN rows at lead 0 with the ridge re-picked
// for every scaling so only the penalty's DISTRIBUTION varies:
//
//   channel 0 (shoulder)   pilot 0.99127   flat 0.98879   std 0.98890   std-flat 0.98699
//   channel 1 (elbow)      pilot 0.57971   flat 0.66807   std 0.64667   std-flat 0.61740
//
// COLUMN SCALE IS NOT THE STORY. Standardising within a block is neutral on the shoulder and
// only helps the elbow while the 100x prior is present; with the prior gone it HURTS. What moves
// the elbow is removing the prior: held-out residual variance 4.203e-1 -> 3.319e-1, 21% less
// unexplained variance on the channel this project has repeatedly measured as the one that will
// not forecast.
//
// AND IT SITS AGAINST A RECORDED MEASUREMENT, which is the reason this file exists rather than a
// patch. `_colScale`'s own comment says dropping the prior to 10 and then 1 makes the scheduled
// block score WORSE held-out — "0.58680 -> 0.48061 -> 0.43306 on the other [channel]" — which is
// the opposite direction on what looks like the same channel. Two readings that disagree cannot
// both be checked against each other (rule 15), so the question goes to the machine.
//
// ONE DIFFERENCE IS ALREADY VISIBLE AND MAY BE THE WHOLE OF IT: this bench re-optimises the ridge
// for every penalty, and a comparison that holds the ridge fixed while changing the penalty is
// changing the overall ridge STRENGTH as well as its distribution — two variables (rule 20). That
// is a hypothesis about the earlier measurement, not a verdict on it.
//
// NO CODE CHANGE IS NEEDED: `_colScale` already reads `PILOT_RICH_PENALTY`, put there for exactly
// this question. The fit's own held-out numbers are printed BESIDE the delivered ones, because
// where a model's prediction and the machine disagree the machine decides, and this project has
// fitted deflection at held-out 0.84 and made the machine WORSE.
import { commissionArm, deployOn, PG } from './pilot/rigs/arm-rig.mjs';
import { Stack } from '../lib/pilot/stack.js';

const FEED = +(process.env.RP_FEED || 0.004);
const UCAP = +(process.env.RP_UCAP || 0.6);
const MU = process.env.RP_MU !== undefined ? +process.env.RP_MU : 0.03;
const DEPTH = +(process.env.RP_DEPTH || 1);
const SHAPES = (process.env.RP_SHAPES || 'sharp,circle,rounded').split(',');
const PENS = (process.env.RP_PENS || '100,30,10,3,1').split(',');

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, mu ${MU}, depth ${DEPTH}`);
const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);
let open = null;
console.log('\n  penalty' + SHAPES.map((s) => s.padStart(17)).join('')
  + '     geo mean     the fit\'s own held-out R^2');
for (const pen of PENS) {
  // SET FOR THE COMMISSIONING AND RESTORED AFTER, so a later row cannot inherit it.
  const had = process.env.PILOT_RICH_PENALTY;
  process.env.PILOT_RICH_PENALTY = pen;
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, Cls: DEPTH > 1 ? Stack : undefined, extra: DEPTH > 1 ? { depth: DEPTH } : null });
  if (had === undefined) delete process.env.PILOT_RICH_PENALTY;
  else process.env.PILOT_RICH_PENALTY = had;
  if (!pilot) { console.log(`  ${pen}: commissioning never terminated`); continue; }
  const layers = pilot.layers || [pilot];
  for (const p of layers) p.uWeight = MU > 0 ? new Array(p.nc).fill(MU) : null;
  if (!open) {
    open = {};
    for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
    console.log('  open loop:  ' + SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  '));
  }
  const xs = [], cols = [];
  for (const s of SHAPES) {
    const d = await deployOn(pilot, s, true, FEED);
    const x = open[s] / d.r.totalRms;
    xs.push(x); cols.push(`${x.toFixed(2)}x u${d.uPk.toFixed(3)}`.padStart(17));
  }
  // THE FIT'S OWN VALIDATION, whatever the pilot recorded, so the two instruments sit side by side
  // rather than one being quoted for the other.
  // WHATEVER THE READOUT ACTUALLY HOLDS, printed rather than assumed. The first version of this
  // line called `.toFixed` on `ro.val` and crashed the run, because `val` is not a scalar here —
  // reading a field's TYPE off its name is the same fault as reading a design claim off a
  // directory's reputation (rules 17, 30), and it cost a whole table's wall clock.
  const num = (v) => {
    if (typeof v === 'number') return v;
    if (Array.isArray(v) && v.length) {
      const f = v.filter((x) => typeof x === 'number');
      return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null;
    }
    if (v && typeof v === 'object') {
      for (const k of ['r2', 'val', 'mean', 'holdout']) if (typeof v[k] === 'number') return v[k];
    }
    return null;
  };
  const val = layers[0].readouts
    ? layers[0].readouts.map((ro) => {
      const v = ro ? (num(ro.val) ?? num(ro.r2) ?? num(ro.valR2)) : null;
      return v == null ? '  ?   ' : v.toFixed(4);
    }).join(' / ')
    : '?';
  console.log(`  ${String(pen).padStart(7)}${cols.join('')}${gm(xs).toFixed(3).padStart(12)}x`
    + `     ${val}`);
}
console.log('EXIT 0');
