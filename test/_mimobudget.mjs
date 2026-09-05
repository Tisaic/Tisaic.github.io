/**
 * @file KEEP THE 11.8% AND FIT THE SCAN — the two knobs, swept together, with the cost in the
 * same table as the score.
 *
 * WHERE THIS STARTS. The off-diagonal solve is worth 11.8% on the model-only cascade (2.7878e-1
 * -> 2.4933e-1 on mode 9) and costs 1.83x the deployed arithmetic: 73,664 MAC/cycle diagonal
 * against 134,670 armed, on a budget of 10,000 met in EVERY cycle. The QP term doubles exactly
 * (61,006 -> 122,012, which is nc^2/nc at nc=2) and the rest does not.
 *
 * AND THE ARM IS 7.4x OVER BUDGET BEFORE ANY OF THIS. So `mimo` is not what breaks target 6 —
 * it makes a miss bigger. The arithmetic says both knobs have to move: the QP is 83% of the
 * cost, but the NON-QP remainder is 12,658 on its own, which is 127% of budget with a free
 * solver. Cutting iterations alone cannot fit, however far it is cut.
 *
 * THE TWO KNOBS ARE NOT SEPARABLE and this project has the measurement: on EMPS one iteration
 * at N=56 delivers 14.16x where N=68 delivers 10.62x, which is what two regularisers on one
 * inversion look like, and cutting `qpIters` alone REGRESSED that plant. So a grid, not a
 * ladder.
 *
 * COMMISSION ONCE AND RE-DEPLOY, which is `qpsweep`'s design and its recorded warning: deploying
 * cheap and COMMISSIONING cheap disagree in direction (re-deploying cheap is better,
 * commissioning cheap measured 11% worse). This file answers the deploy-time question only, and
 * says so rather than letting the reader assume the other.
 *
 * BOTH SOLVES ARE SWEPT, because "keep the 11.8%" is a comparison and a budget-fitting armed
 * cell has to be read against the diagonal at the SAME budget as well as against the diagonal
 * at the default — those are different claims and only one of them is the product's (rule 20).
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_mimobudget.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);
const ITERS = (process.env.ITERS || '1,2,4').split(',').map(Number);
const FRACS = (process.env.FRACS || '1,0.8,0.6,0.45').split(',').map(Number);
const BUDGET = 10000;

console.log(`\nkeep the gain and fit the scan — K ${process.env.ARM_K || 16} / `
  + `E ${process.env.ARM_E || 0.15}, ${SHAPE} at feed ${FEED.toExponential(1)}`);
console.log(`  budget ${BUDGET.toLocaleString()} MAC/cycle, met EVERY cycle; one commissioning`
  + ` per solve, re-deployed\n`);

const out = [];
let off = null;
for (const mimo of [false, true]) {
  const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED },
    extra: { mimo } });
  const st = p.status();
  if (st.mimo !== mimo) throw new Error(`mimo asked ${mimo} but status says ${st.mimo}`);
  const NFULL = p.N, built = p.qpIters;
  if (!off) off = await deployOn(p, SHAPE, false, FEED);
  console.log(`  ${mimo ? 'mimo' : 'diag'}: commissioned N ${NFULL} at qpIters ${built}, `
    + `${p.cost().features} features`);
  console.log(`    iters    N   MAC/cycle   % budget    total       contour     x vs open`);
  for (const it of ITERS) {
    for (const f of FRACS) {
      const nn = Math.max(4, Math.round(NFULL * f));
      p.qpIters = it; p.N = nn;
      const c = p.cost();
      const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
      const fits = c.peakMacPerCycle <= BUDGET;
      out.push({ mimo, it, nn, mac: c.peakMacPerCycle, total: r.r.totalRms,
        contour: r.r.contourRms, fits });
      console.log(`    ${String(it).padStart(5)} ${String(nn).padStart(4)}  `
        + `${String(Math.round(c.peakMacPerCycle)).padStart(9)}  `
        + `${(100 * c.peakMacPerCycle / BUDGET).toFixed(0).padStart(7)}%${fits ? ' ✓' : '  '}  `
        + `${r.r.totalRms.toExponential(3)}  ${r.r.contourRms.toExponential(3)}  `
        + `${(off.r.totalRms / r.r.totalRms).toFixed(2)}x`);
    }
  }
  p.qpIters = built; p.N = NFULL;
  console.log('');
}
// THE ANSWER THE QUESTION ASKED FOR, computed rather than eyeballed off the grid.
const fit = out.filter((o) => o.fits);
const bestFitM = fit.filter((o) => o.mimo).sort((a, b) => a.total - b.total)[0];
const bestFitD = fit.filter((o) => !o.mimo).sort((a, b) => a.total - b.total)[0];
const dDefault = out.find((o) => !o.mimo && o.it === 4 && o.nn === Math.max(...out.map((q) => q.nn)));
console.log(`  open loop  ${off.r.totalRms.toExponential(3)}`);
if (dDefault) console.log(`  diagonal at the commissioned solver: ${dDefault.total.toExponential(3)}`
  + `  (${Math.round(dDefault.mac).toLocaleString()} MAC, `
  + `${(100 * dDefault.mac / BUDGET).toFixed(0)}% of budget)`);
for (const [n, b] of [['diagonal', bestFitD], ['off-diagonal', bestFitM]]) {
  if (!b) { console.log(`  best ${n} cell INSIDE budget: none — nothing fits`); continue; }
  console.log(`  best ${n} cell INSIDE budget: ${b.it} iters at N ${b.nn}, `
    + `${Math.round(b.mac).toLocaleString()} MAC (${(100 * b.mac / BUDGET).toFixed(0)}%), `
    + `${b.total.toExponential(3)}`
    + `${dDefault ? `  — ${(100 * (dDefault.total / b.total - 1)).toFixed(1)}% against the `
      + `diagonal at its commissioned solver` : ''}`);
}
console.log(`\n  deploy-time only: commissioning cheap is a DIFFERENT measurement and`);
console.log(`  measured 11% worse on the plant where both were run.\n`);
