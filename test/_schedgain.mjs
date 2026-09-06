/**
 * @file SCHEDULE THE ITERATION COUNT LIVE — the owner's question, and the 13.5% it is worth.
 *
 * WHY THIS IS EVEN POSSIBLE. With the QP collapsed to a fixed row, "how hard to solve" stopped
 * being a deployed cost: every iteration count produces a `k` of the same length, and choosing
 * between two precomputed rows is a blend of vectors. So the solver's effort moved entirely to
 * commissioning and the iteration count became a SCHEDULING variable rather than a budget one.
 *
 * WHY IT SHOULD PAY, measured before it was built. The two held-out programs want opposite ends
 * of the ladder — the circle peaks at 3 iterations (7.65x against 5.70x at 4) while the sharp
 * square climbs monotonically to 6 (3.53x against 3.25x) — so any single count trades one
 * against the other, which is why the best cell of a 12-cell grid beat the incumbent by only
 * 5.2%. An ORACLE picking per program reads 3.71 / 7.65 / 3.53, geometric 4.65 against the
 * incumbent's 4.095: **13.5%**. That is the number a live selector is trying to capture, and the
 * gap between it and what lands is the selector's own cost.
 *
 * THE SCHEDULING VARIABLE IS COMMANDED. Routing on actuals puts the blend inside the loop
 * (rule 35), and the scale is the channel's own DECLARED aMax — which needs no new declaration
 * and separates these programs by two orders of magnitude, the circle using 16% of it against
 * the square's 3132%. Rule 41b records that ratio as a fiction when read as a LIMIT; read as a
 * discriminator it is exactly what a scheduler wants.
 *
 * THREE ROWS, because the oracle is the ceiling and the fixed cells are the floor, and a
 * scheduler that lands outside them is a bug rather than a result:
 *   fixed 4      — the incumbent
 *   fixed 3, 6   — the ends the oracle picks between
 *   scheduled    — the ladder, chosen live
 *
 * WHAT WOULD KILL IT: the scheduled row landing at or below the best fixed cell. Then the
 * selector cannot tell these regimes apart at the moment it has to decide — which is a claim
 * about the commanded look-ahead, not about the idea.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_schedgain.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const HELDS = (process.env.HELD || 'circle,sharp').split(',');
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);
const HT = +(process.env.HT || 0.9);
// A rung is `iters` or `iters@N` — the horizon rides the same selection, downward only.
const LADDER = (process.env.LADDER || '3,6').split(',').map((r) => {
  const [it, n] = r.split('@');
  return n ? { iters: +it, N: +n } : +it;
});
const label = (r) => (typeof r === 'object' ? `${r.iters}@${r.N}` : String(r));

console.log(`\nscheduling the solver — K ${PG.K} / E ${PG.E}, ${SHAPE} at `
  + `feed ${FEED.toExponential(1)}, horizonTs ${HT}, ladder [${LADDER.map(label)}]\n`);

const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED },
  extra: { horizonTs: HT } });
console.log(`  commissioned: N ${p.N}, qpIters ${p.qpIters}, `
  + `aMax ${p.channels[0].aMax.toExponential(2)}`);
const IT0 = p.qpIters;
const base = (await deployOn(p, SHAPE, false, FEED)).r.totalRms;
const baseH = new Map();
for (const h of HELDS) baseH.set(h, (await deployOn(p, h, false, FEED)).r.totalRms);

const score = async () => {
  const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
  const xs = [base / r.r.totalRms];
  for (const h of HELDS) {
    const x = await deployOn(p, h, p.verdict.deploy, FEED);
    xs.push(baseH.get(h) / x.r.totalRms);
  }
  return { xs, geo: Math.exp(xs.reduce((a, v) => a + Math.log(v), 0) / xs.length) };
};

console.log(`\n  configuration   ${SHAPE.padEnd(9)}` + HELDS.map((h) => h.padStart(9)).join('')
  + `    geo`);
const out = {};
for (const rung of [p.qpIters, ...LADDER]) {
  p.explicitGain = true; p.gainLadder = typeof rung === 'object' ? [rung] : null;
  p.qpIters = typeof rung === 'object' ? rung.iters : rung; p._gain = null;
  const r = await score();
  out[`fixed ${label(rung)}`] = r;
  console.log(`  fixed ${label(rung).padEnd(10)}${r.xs[0].toFixed(2)}x   `
    + r.xs.slice(1).map((v) => `${v.toFixed(2)}x`.padStart(9)).join('') + `    ${r.geo.toFixed(3)}`);
}
// THE SCHEDULED ROW. `gainLadder` builds one row per rung at commissioning; the deployed tick
// picks between them on the commanded profile and pays one extra blend of two vectors.
const WINS = (process.env.WINS || '8,35').split(',').map(Number);
let sch = null;
for (const W of WINS) {
  p.gainLadder = LADDER; p.qpIters = LADDER[0]; p.schedWindow = W; p._gain = null;
  const r = await score();
  if (!sch || r.geo > sch.geo) sch = r;
  console.log(`  sched W=${String(W).padEnd(6)}${r.xs[0].toFixed(2)}x   `
    + r.xs.slice(1).map((v) => `${v.toFixed(2)}x`.padStart(9)).join('') + `    ${r.geo.toFixed(3)}`);
}

// THE ORACLE, computed from the fixed rows rather than asserted: the best fixed cell per
// program, which no single deployed configuration can reach and a scheduler is trying to.
const fixed = Object.values(out);
const oracle = fixed[0].xs.map((_, i) => Math.max(...fixed.map((f) => f.xs[i])));
const oGeo = Math.exp(oracle.reduce((a, v) => a + Math.log(v), 0) / oracle.length);
// THE INCUMBENT IS THE COMMISSIONED SOLVER AND NOTHING ELSE. The expression here previously
// resolved to `fixed 3` — a cell from the ladder rather than the shipped configuration — which
// is the same fault `_freesolver.mjs` was fixed for one commit earlier: a baseline that can
// quietly become a different configuration turns a comparison into a different question.
const inc = out[`fixed ${IT0}`];
if (!inc) throw new Error(`the commissioned solver (${IT0} iters) has no row in the table`);
console.log(`\n  oracle (best fixed per program)  `
  + oracle.map((v) => `${v.toFixed(2)}x`).join(' / ') + `   geo ${oGeo.toFixed(3)}`);
console.log(`  incumbent                        `
  + inc.xs.map((v) => `${v.toFixed(2)}x`).join(' / ') + `   geo ${inc.geo.toFixed(3)}`);
console.log(`  scheduled                        `
  + sch.xs.map((v) => `${v.toFixed(2)}x`).join(' / ') + `   geo ${sch.geo.toFixed(3)}`
  + `   — ${(100 * (sch.geo / inc.geo - 1)).toFixed(1)}% against the incumbent, `
  + `${(100 * (sch.geo / oGeo - 1)).toFixed(1)}% against the oracle`);
console.log(`\n  every row costs the same 120 MAC plus one blend of two rows; the iteration`);
console.log(`  count is stored, not spent.\n`);
