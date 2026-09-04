// DOES THE MAGNITUDE PENALTY COMPOSE WITH DEPTH? — the question that decides whether `mu` is a
// shippable improvement or another name for what the cascade already does.
//
// THE TWO RESULTS IT JOINS. Depth 2 at raised authority is the session's shippable finding:
// 4.09x / 6.81x / 5.25x against the shipped configuration's 2.15x / 3.99x / 2.64x, verified and
// reproduced five times. And `mu` 0.1 at ONE iteration reads 3.73x / 4.59x / 3.69x at DEPTH 1
// against 3.47x / 2.76x / 2.87x — a geometric mean of 1.32x at a quarter of the QP's
// arithmetic.
//
// AND THE HONEST WORRY IS THAT THEY ARE THE SAME REPAIR TWICE. The frequency table says layer 2
// works by RE-IDENTIFYING a fresh, accurate low-band model of what layer 1 left, which extends
// the usable bandwidth; `mu` works by refusing to invert the band the model has wrong. Both are
// protections against the same defect — `h` going anti-phase past the eighth harmonic — reached
// from opposite directions, and this session has already caught one overlap being read as a sum
// (the shoulder scale and depth, where depth 2 with the tuned scale was WORSE than depth 2
// alone on two programs of three).
//
// SO THE PRE-REGISTERED READINGS. If depth 2 with `mu` beats depth 2 without, they compose and
// the combination is what ships. If it matches, `mu` is a cheaper route to what depth already
// buys — which is still worth having, because one commissioning is half the cost of two
// (target 4's currency). If it is WORSE, they are the same repair twice and `mu` belongs only
// at depth 1.
import { Stack } from '/home/user/Tisaic.github.io/lib/pilot/stack.js';
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.MD_SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.MD_FEED || 0.004);
const UCAP = +(process.env.MD_UCAP || 0.6);
const MUS = (process.env.MD_MUS || '0,0.03,0.1,0.3').split(',').map(Number);
const ITER = +(process.env.MD_ITER || 1);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, qpIters ${ITER}`);
const open = {};
for (const depth of [1, 2]) {
  const st = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, Cls: Stack, extra: { depth } });
  if (!st) { console.log(`  depth ${depth}: never terminated`); continue; }
  const live = st.report.layers.filter((l) => l.deployed).length;
  console.log(`\n  depth ${depth}: ${live} of ${st.layers.length} deployed`);
  console.log('     mu     ' + SHAPES.map((s) => s.padStart(16)).join(''));
  for (const m of MUS) {
    // EVERY DEPLOYED LAYER GETS IT. Each layer inverts its own `h` and each `h` has its own
    // untrustworthy band, so the regulariser is per layer exactly as the defect is.
    for (const p of st.layers) {
      p.uWeight = m > 0 ? [m, m] : null;
      p.qpIters = ITER;
    }
    const cols = [];
    for (const shape of SHAPES) {
      if (!open[shape]) open[shape] = (await deployOn(st, shape, false, FEED)).r.totalRms;
      const r = await deployOn(st, shape, true, FEED);
      cols.push(`${(open[shape] / r.r.totalRms).toFixed(2).padStart(6)}x u${r.uPk.toFixed(3)}`);
    }
    console.log(`  ${m.toFixed(2).padStart(6)}   ${cols.join('  ')}`);
  }
  for (const p of st.layers) { p.uWeight = null; }
}
console.log('EXIT 0');
