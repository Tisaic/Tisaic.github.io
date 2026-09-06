/**
 * @file THE SOLVER KNOBS ARE FREE NOW — sweep the surface that just stopped costing anything.
 *
 * WHAT CHANGED. `qpIters` used to be 9,520 MAC/cycle each at N=68, so the budget dictated the
 * iteration count and the project's whole solver record was written under that pressure: 60
 * iterations shipped at 5761% of a scan, one iteration delivered 84% of the result, and on this
 * arm "two iterations BEAT sixty". With the explicit gain the deployed cost is 120 MAC whatever
 * iteration count produced it — the solve happens ONCE at commissioning and what deploys is the
 * row it collapses to. So iterations are free, and `lambda` was always free and has never been
 * swept at deploy at all because it is fixed when the model is fitted.
 *
 * AND THE OLD OPTIMUM IS SUSPECT FOR A SECOND REASON. "Two iterations beat sixty" was measured
 * with the WARM START, which carries the previous plan forward and is itself extra convergence —
 * rule 39's split put the whole difference in OSCILLATION, and this session measured that
 * removing the warm start HELPS (+22%, +74%, −5%). So the ringing that made converged solves lose
 * had two sources and one of them is gone. Where the optimum sits now is not predictable from the
 * old table, which is exactly why it is measured rather than assumed.
 *
 * THE TWO ARE NOT SEPARABLE and this project has the measurement twice over: they are both
 * regularisers of the same inversion, and at one iteration N=56 gives 14.16x where N=68 gives
 * 10.62x. So a grid, not two ladders — and the best cell of a rugged grid is a suspect result,
 * which is why two programs NEVER RUN are scored in the same table rather than the fitted one
 * alone (rule 36).
 *
 * ONE COMMISSIONED MODEL, re-deployed. The gain is rebuilt per cell because it IS a function of
 * (hGrid, lambda, qpIters) — that is N+1 cold solves at commissioning and nothing at deploy — so
 * the only variable across the table is how the correction is computed from a fixed forecast.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_freesolver.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const HELDS = (process.env.HELD || 'circle,sharp').split(',');
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);
const ITERS = (process.env.ITERS || '1,2,8,60').split(',').map(Number);
const LMULT = (process.env.LMULT || '0.5,1,2').split(',').map(Number);
// THE HORIZON JOINS THE SWEEP, because the two are not separable and this project has the
// measurement: at one iteration N=56 gives 14.16x where N=68 gives 10.62x. Walking one axis of a
// coupled surface and reporting its optimum is how a grid's best cell becomes a suspect result.
// Each horizon needs its OWN commissioning — N is fixed when the bank is fitted — so this costs
// one commissioning per row rather than one for the table.
const HTS = (process.env.HTS || '0.9').split(',').map(Number);

console.log(`\nthe solver knobs are free — K ${PG.K} / E ${PG.E}, ${SHAPE} at `
  + `feed ${FEED.toExponential(1)}, horizonTs ${HTS.join(",")}, explicit gain armed\n`);

let base = null; const baseH = new Map();
const rows = [];
console.log(`   ht    N  iters  lam    ${SHAPE.padEnd(8)}`
  + HELDS.map((h) => h.padStart(9)).join('') + `   geo   MAC`);
let it0 = null, lam0ref = null;
for (const HT of HTS) {
const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED },
  extra: { horizonTs: HT } });
const lam0 = p.lambda; it0 = p.qpIters; lam0ref = lam0;
if (base === null) {
  base = (await deployOn(p, SHAPE, false, FEED)).r.totalRms;
  for (const h of HELDS) baseH.set(h, (await deployOn(p, h, false, FEED)).r.totalRms);
  console.log(`  open loop ${base.toExponential(3)} / `
    + HELDS.map((h) => baseH.get(h).toExponential(3)).join(' / ') + '\n');
}
for (const it of ITERS) {
  for (const lm of LMULT) {
    p.qpIters = it; p.lambda = lam0 * lm; p._gain = null; p.explicitGain = true;
    const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
    if (!p._gain) throw new Error('gain not rebuilt');
    const xs = [base / r.r.totalRms];
    const cols = [];
    for (const h of HELDS) {
      const x = await deployOn(p, h, p.verdict.deploy, FEED);
      const v = baseH.get(h) / x.r.totalRms;
      xs.push(v); cols.push(`${v.toFixed(2)}x`.padStart(9));
    }
    // THE GEOMETRIC MEAN ACROSS ALL THREE, because a cell that buys the fitted program by
    // selling the two it has never run is the failure this project keeps rediscovering, and a
    // table showing only the home column cannot see it.
    const geo = Math.exp(xs.reduce((a, v) => a + Math.log(v), 0) / xs.length);
    const c = p.cost();
    const mac = c.peakMacPerCycle - c.qp + (p.N + 1) * p.nc;
    rows.push({ ht: HT, N: p.N, it, lm, xs, geo, mac });
    console.log(`  ${HT.toFixed(2)} ${String(p.N).padStart(4)}  ${String(it).padStart(5)}  `
      + `${lm.toFixed(2)}   ${xs[0].toFixed(2)}x   ` + cols.join('')
      + `   ${geo.toFixed(3)}  ${Math.round(mac).toLocaleString().padStart(7)}`
      + `${mac <= 10000 ? '' : ' OVER'}`);
  }
}
p.qpIters = it0; p.lambda = lam0;
}
const best = rows.slice().sort((a, b) => b.geo - a.geo)[0];
// THE INCUMBENT MUST BE IN THE GRID, and the first run of this file proved why it has to be
// asserted rather than assumed. The sweep ran 1/2/8/60 while the commissioned solver runs 4, so
// the "reference" fell through to `rows[0]` — a different iteration count AND a different lambda
// from the one the label claimed — and the table reported a 59.8% gain against a cell nobody
// ships. A comparison against the wrong baseline is not a weaker result, it is a different
// question answered confidently (rule 17).
// The incumbent is the commissioned solver at the horizon this configuration ships on.
const REF_HT = +(process.env.REF_HT || HTS[0]);
const ref = rows.find((r) => r.it === it0 && r.lm === 1 && r.ht === REF_HT);
if (!ref) {
  throw new Error(`the commissioned solver (qpIters ${it0}, lambda x1) is not in the grid — `
    + `ITERS must contain ${it0} and HTS must contain ${REF_HT}, or the table has no `
    + `baseline to compare against`);
}
console.log(`\n  best cell: ${best.it} iters at lambda x${best.lm} — `
  + `${best.xs.map((v) => v.toFixed(2) + 'x').join(' / ')}, geo ${best.geo.toFixed(3)}`
  + `, ${Math.round(best.mac).toLocaleString()} MAC`);
console.log(`  against the commissioned solver (${ref.it} iters, lambda x${ref.lm}): `
  + `${ref.xs.map((v) => v.toFixed(2) + 'x').join(' / ')}, geo ${ref.geo.toFixed(3)}`
  + `  — ${(100 * (best.geo / ref.geo - 1)).toFixed(1)}%`);
console.log(`\n  every cell costs the SAME 120 MAC at deploy: the solve is commissioning-time`);
console.log(`  and what ships is the row it collapses to.\n`);
