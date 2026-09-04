// THE QP's PLANT GAIN AT DEPTH 1 — one scalar per channel, no extra training, no extra arithmetic.
//
// WHY THIS AND NOT ANOTHER LAYER. Depth 2 delivers 6.667x against depth 1's 3.486x, and it costs
// TWICE: a second full commissioning (settle, probe, excite, fit, verify) and a second deployed
// forecast and QP. A single layer that closes part of that gap pays on both, which is the whole
// reason to look here first.
//
// WHAT THE EVIDENCE SAYS THE SECOND LAYER IS DOING. `_oraclecascade.mjs` measured that a PERFECT
// forecast, iterated, reaches 6.58x / 12.11x / 16.43x — within noise of what depth 1 and depth 2
// deliver on this cell. So the cascade is largely ITERATION of the inversion rather than new
// information: layer 2 corrects what layer 1's single truncated, box-constrained solve left.
//
// AND THERE IS A DIRECT MEASUREMENT OF WHY ONE PASS UNDER-DELIVERS. `boxQP`'s own comment records
// that scaling one channel's `h` by 1.30 — "a lie about the plant that makes the QP request less"
// — is worth up to +139% on this arm, while raising `lambda` 32x moves the score under 1%. The
// QP inverts `h`; if `h` is wrong the inversion is wrong by the same factor, and no amount of
// solver effort fixes a mis-scaled plant (rule 43: a better optimiser on a wrong model buys
// nothing).
//
// SO THIS SWEEPS THE ONE NUMBER, PER CHANNEL, ON THE MACHINE. `hGrid` is what the QP convolves;
// scaling it scales the predicted effect of a move, so a factor above 1 makes the solver believe
// each move does more and ask for less. One commissioned model, re-deployed at every factor, so
// the only variable is the gain (the `qpsweep` pattern).
//
// WHAT WOULD KILL IT: a flat curve, or a peak at 1.00. Then the identification is already right,
// the cascade's gain is not a gain error, and the second layer is carrying information a single
// layer cannot have — in which case depth 2 is the honest price of the performance and the budget
// question is a product decision rather than an engineering one.
//
// AND IT IS SCORED ON THREE PROGRAMS, because a scalar tuned on one is a per-program constant
// wearing a plant-model costume (rule 31). A factor that helps the square and hurts the circle is
// a trade, not a repair, and the table has to be able to show that.
import { commissionArm, deployOn, PG } from './pilot/rigs/arm-rig.mjs';
import { Stack } from '../lib/pilot/stack.js';

const FEED = 0.004, UCAP = 0.6;
const MU = process.env.HG_MU !== undefined ? +process.env.HG_MU : 0.03;
const DEPTH = +(process.env.HG_DEPTH || 1);
const NFRAC = +(process.env.HG_NFRAC || 0.75);
const GAINS = (process.env.HG_GAINS || '0.7,0.85,1.0,1.15,1.3,1.5,1.8,2.2').split(',').map(Number);
const SHAPES = ['sharp', 'circle', 'rounded'];

const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
  uCap: UCAP, Cls: DEPTH > 1 ? Stack : undefined, extra: DEPTH > 1 ? { depth: DEPTH } : null });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const layers = pilot.layers || [pilot];
for (const p of layers) {
  p.uWeight = MU > 0 ? new Array(p.nc).fill(MU) : null;
  p.N = Math.max(2, Math.round(p.N * NFRAC));
}
// THE ORIGINAL IMPULSE, KEPT, so every factor is applied to the SAME identified plant rather than
// compounding onto the previous row's scaling — which would make the sweep a random walk.
const h0 = layers.map((p) => p.hs.map((h) => Float64Array.from(h.hGrid)));

console.log(`arm K ${PG.K} / E ${PG.E}, depth ${DEPTH}, Nfrac ${NFRAC}, mu ${MU}`);
const open = {};
for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
console.log('  open loop:  ' + SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  '));
console.log('\n   h gain        sharp     circle    rounded   geo mean      u peak');
const rows = [];
for (const g of GAINS) {
  layers.forEach((p, li) => p.hs.forEach((h, ci) => {
    const src = h0[li][ci];
    for (let i = 0; i < h.hGrid.length; i++) h.hGrid[i] = src[i] * g;
  }));
  const xs = [], cols = [];
  let uPk = 0;
  for (const s of SHAPES) {
    const d = await deployOn(pilot, s, true, FEED);
    xs.push(open[s] / d.r.totalRms);
    cols.push(`${(open[s] / d.r.totalRms).toFixed(2)}x`.padStart(11));
    uPk = Math.max(uPk, d.uPk);
  }
  rows.push({ g, v: gm(xs) });
  console.log(`  ${g.toFixed(2).padStart(6)}   ${cols.join('')}${gm(xs).toFixed(3).padStart(11)}x`
    + `${uPk.toFixed(3).padStart(12)}`);
}
// restore, so nothing downstream inherits a scaled plant
layers.forEach((p, li) => p.hs.forEach((h, ci) => h.hGrid.set(h0[li][ci])));
const best = rows.reduce((a, b) => (b.v > a.v ? b : a));
const at1 = rows.find((r) => Math.abs(r.g - 1) < 1e-9);
console.log(`\n  best ${best.v.toFixed(3)}x at gain ${best.g}`
  + (at1 ? `, against ${at1.v.toFixed(3)}x at the identified plant — ${(best.v / at1.v).toFixed(2)}x` : ''));
console.log('EXIT 0');
