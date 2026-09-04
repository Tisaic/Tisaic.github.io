// MEETING THE PLC BUDGET WITHOUT GIVING UP THE MACHINE — the owner's constraint stated as an
// experiment. Under 10,000 MAC/cycle is required, 1,000 is wanted, and the number to hold is the
// 6.89x that depth 2 + mu 0.03 + all-layer adaptation measures at the bench cell.
//
// WHERE THE ARITHMETIC ACTUALLY IS, from `cost()` at that cell (nf 176, N 59, nc 2, qpIters 4):
//
//   QP iterations        57,584   70%     qpIters * N^2, roughly
//   forecast dots        20,768   25%     features * leads * channels
//   QP free response      3,422    4%     N^2 / 2
//   row build + interp       358   <1%
//   TOTAL                82,132          821% of budget at DEPTH 1; depth 2 roughly doubles it
//
// So three knobs, and their exponents differ: iterations are LINEAR on 70% of the cost, the
// horizon is QUADRATIC on the QP and linear on the forecast, and the feature count is linear on
// the forecast. The third has never been swept on this machine.
//
// ONE COMMISSIONING, MANY DEPLOYS — the `qpsweep` pattern, and the reason this is affordable. The
// same fitted model is re-deployed at every budget, so the only variable in the grid is the
// solver's work. A grid that re-commissioned per cell would be measuring commissioning variance
// (rule 20), and this project has already measured that a draw is worth nearly 2x on this arm.
//
// N IS CUT, NOT RE-FITTED, AND THAT IS CHECKED. `pilot.N` beyond the fitted bank reads unfitted
// leads and returns NaN — which passes every bounds test — so the bank length is read and the
// grid never asks for more than was fitted.
//
// WHAT WOULD KILL THE WHOLE IDEA: no cell under 10,000 within 5% of the best delivered score. Then
// the budget and the performance are genuinely in conflict on this plant and that is the finding,
// rather than a knob being missing.
//
// RULE 42 DECIDES, ON THE MEASURED SCORE: among the cells within 5% of the best geometric mean,
// take the CHEAPEST. The band goes on the improvement, never on the residual.
import { commissionArm, deployOn, PG } from './pilot/rigs/arm-rig.mjs';
import { Stack } from '../lib/pilot/stack.js';

const FEED = +(process.env.PL_FEED || 0.004);
const UCAP = +(process.env.PL_UCAP || 0.6);
const MU = process.env.PL_MU !== undefined ? +process.env.PL_MU : 0.03;
const DEPTH = +(process.env.PL_DEPTH || 2);
const SHAPES = (process.env.PL_SHAPES || 'sharp,circle,rounded').split(',');
const ITERS = (process.env.PL_ITERS || '4,2,1').split(',').map(Number);
const FRACS = (process.env.PL_FRACS || '1,0.75,0.5,0.35,0.25').split(',').map(Number);
const BUDGET = 10000;

const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, mu ${MU}, depth ${DEPTH}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
  uCap: UCAP, Cls: DEPTH > 1 ? Stack : undefined, extra: DEPTH > 1 ? { depth: DEPTH } : null });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const layers = pilot.layers || [pilot];
for (const p of layers) p.uWeight = MU > 0 ? new Array(p.nc).fill(MU) : null;

// THE FITTED BANK'S OWN LENGTH PER LAYER, so a cut can never ask for a lead that was not fitted.
const N0 = layers.map((p) => p.N);
const NMAX = layers.map((p) => {
  let m = Infinity;
  for (const ro of (p.readouts || [])) if (ro && ro.w) m = Math.min(m, ro.w.length);
  return Number.isFinite(m) ? m : p.N;
});
layers.forEach((p, i) => console.log(`  layer ${i}: N ${N0[i]} (bank ${NMAX[i]}), `
  + `${p.readouts && p.readouts[0] && p.readouts[0].w ? p.readouts[0].w[0].length : '?'} features, `
  + `sample ${p.sample}`));

const open = {};
for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
console.log('  open loop:  ' + SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  '));

const macOf = () => {
  let mac = 0;
  for (const p of layers) { const c = p.cost && p.cost(); if (c) mac += c.peakMacPerCycle || 0; }
  return Math.round(mac);
};

const rows = [];
console.log('\n  iters  Nfrac    N per layer' + SHAPES.map((s) => s.padStart(10)).join('')
  + '   geo mean    MAC/cycle   % of 10k');
for (const it of ITERS) {
  for (const fr of FRACS) {
    const Ns = layers.map((p, i) => Math.max(2, Math.min(NMAX[i], Math.round(N0[i] * fr))));
    layers.forEach((p, i) => { p.qpIters = it; p.N = Ns[i]; });
    const xs = [], cols = [];
    let bad = false;
    for (const s of SHAPES) {
      const d = await deployOn(pilot, s, true, FEED);
      const r = d.r.totalRms;
      if (!Number.isFinite(r) || r <= 0) { bad = true; break; }
      const x = open[s] / r;
      xs.push(x); cols.push(`${x.toFixed(2)}x`.padStart(10));
    }
    if (bad) { console.log(`  ${String(it).padStart(5)}  ${fr.toFixed(2)}    NON-FINITE — skipped`); continue; }
    const mac = macOf(), g = gm(xs);
    rows.push({ it, fr, Ns, g, mac });
    console.log(`  ${String(it).padStart(5)}  ${fr.toFixed(2)}   ${Ns.join('/').padStart(8)}`
      + `${cols.join('')}   ${g.toFixed(3).padStart(8)}x  ${String(mac).padStart(10)}`
      + `  ${(100 * mac / BUDGET).toFixed(0).padStart(7)}%`);
  }
}
// restore, so nothing downstream inherits a swept value
layers.forEach((p, i) => { p.N = N0[i]; });

if (rows.length) {
  const best = rows.reduce((a, b) => (b.g > a.g ? b : a));
  const band = rows.filter((r) => r.g >= best.g * 0.95).sort((a, b) => a.mac - b.mac);
  const pick = band[0];
  console.log(`\n  best delivered ${best.g.toFixed(3)}x at ${best.it} iters, N ${best.Ns.join('/')}`
    + `, ${best.mac} MAC/cycle`);
  console.log(`  RULE 42 — cheapest within 5% of it: ${pick.g.toFixed(3)}x at ${pick.it} iters,`
    + ` N ${pick.Ns.join('/')}, ${pick.mac} MAC/cycle = ${(100 * pick.mac / BUDGET).toFixed(0)}%`
    + ` of the 10% budget`);
  const under = rows.filter((r) => r.mac <= BUDGET).sort((a, b) => b.g - a.g)[0];
  console.log(under ? `  best cell that FITS the budget: ${under.g.toFixed(3)}x at ${under.it}`
    + ` iters, N ${under.Ns.join('/')}, ${under.mac} MAC/cycle`
    : '  NO CELL FITS THE BUDGET — the horizon and iterations alone cannot get there');
}
console.log('EXIT 0');
