// DOES MODELLING THE CROSS CHANNEL MOVE THE MACHINE? — the deploy-side test of the MIMO QP.
//
// WHAT IT IS FOR. `pilot.js` treated the plant as two independent SISO channels and said so, with
// a falsifier attached: "cross-coupling is MEASURED by the probe and reported — 0.5% on the arm;
// a plant where it is large needs the MIMO QP this deliberately does not contain". The statistic
// doing the watching, `nCross`, is the SETTLED DC of a HELD probe. Measured on the 2R arm while
// MOVING — two runs of the deterministic plant differenced around a du step, split into their
// symmetric and antisymmetric halves — the LINEAR half of the shoulder-to-elbow response goes the
// wrong way to 0.12 per unit du and peaks 2818 steps later against a DC of 0.028, invariant
// across a 10x range of amplitude, and pose-dependent: 18% of its DC at one phase of the lap and
// 432% at another; the elbow-to-shoulder channel reads -3605% at the second pose.
//
// So the falsifier fired on a number structurally unable to see it: a DC cannot report a
// transient that reverses and comes back.
//
// THE CONTROL COMES FIRST. `boxQPm` on a diagonal H is asserted BYTE-IDENTICAL to `boxQP` at 1,
// 2, 8 and 60 iterations, so `mimo: false` cannot move any plant on record — and this bench runs
// the unarmed configuration as its own first row for the same reason (rule 21).
//
// WHAT WOULD KILL IT: armed and unarmed score the same. Then the cross transient is real, large,
// and irrelevant to a receding horizon — which is exactly what `leadTrust`, the theta-grid, the
// phase table and the horizon sweep each found for their own quantity, and it would be the fifth.
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.MM_FEED || 0.004);
const UCAP = +(process.env.MM_UCAP || 0.6);
const RISES = (process.env.MM_RISES || '10').split(',').map(Number);
// THE HORIZON IS SWEPT WITH IT BECAUSE THE MIMO SOLVE CHANGES WHAT A LONG HORIZON IS FOR.
// `_horizon` measured look-ahead as inert-to-harmful and that was read as "this machine is not
// limited by what its solver can see ahead" — but at the time there was nothing at long lead
// worth seeing: the diagonal response settles inside 1800 steps. The CROSS response reverses and
// peaks 2818 to 2963 steps out, which the shipped horizon (3776 steps) only just covers. So the
// prediction is that the horizon should start paying once, and only once, the cross model exists
// — and if it does not, that is a fifth independent measurement that the far leads do not matter.
const HTS = (process.env.MM_HTS || '1.5').split(',').map(Number);
const SHAPES = (process.env.MM_SHAPES || 'sharp,circle,rounded').split(',');

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, probeRises ${RISES}`);
let open = null;
const ROWS = [];
for (const R of RISES) for (const H of HTS) for (const mimo of [false, true]) ROWS.push({ R, H, mimo });
for (const { R, H, mimo } of ROWS) {
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, before: (p) => { p.probeRises = R; p.horizonTs = H; p.mimo = mimo; } });
  if (!pilot) { console.log(`  mimo ${mimo}: commissioning never terminated`); continue; }
  if (!open) {
    open = {};
    for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
    console.log(`open loop: ${SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  ')}`);
    console.log('\n  mimo  rises   hTs  reach' + SHAPES.map((s) => s.padStart(17)).join(''));
  }
  const cols = [];
  for (const s of SHAPES) {
    const d = await deployOn(pilot, s, true, FEED);
    cols.push(`${(open[s] / d.r.totalRms).toFixed(2)}x u${d.uPk.toFixed(3)}`.padStart(17));
  }
  console.log(`  ${String(mimo).padEnd(5)}  ${String(R).padStart(5)}  ${H.toFixed(1).padStart(4)}`
    + `  ${String(pilot.N * pilot.grid * pilot.sample).padStart(5)}${cols.join('')}`);
}
console.log('EXIT 0');
