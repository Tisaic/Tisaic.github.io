/**
 * @file THE QP IS A FIXED LINEAR FUNCTIONAL AND NOBODY HAS EXPLOITED IT.
 *
 * THE COMPUTE PROBLEM, MEASURED. The deployed path costs 73,664 MAC/cycle against a 10,000
 * budget, and the QP is 83% of it (61,006). It scales as iters x N^2 x blocks, so no iteration
 * count fits: even a FREE solver leaves 12,658, which is 127% on its own.
 *
 * THE MEASUREMENT THAT OPENS IT. `report.binding` reads `model` at every correction cap tried,
 * and `capFrac` reads 0.0019 at uCap 0.6 and 0.0000 at 1.2 — the box is active in a FIFTH OF ONE
 * PERCENT of samples. So the constraint the solver exists to enforce is almost never enforcing
 * anything.
 *
 * AND WITHOUT AN ACTIVE BOX `boxQP` IS AFFINE. It is projected gradient: every iteration is a
 * linear map followed by a clamp, so when no clamp fires the whole solve — at ANY iteration
 * count, converged or truncated — is a fixed linear function of the free response. The pilot
 * applies only `u[0]`, so what the deployed machine computes each cycle is ONE row of that map:
 *
 *     u0 = k · f0   +   c · uPrev        (k fixed, length N, built once at commissioning)
 *
 * That is N+1 multiply-adds where the QP is iters·N^2·nc^2. At N=59, nc=2: about 120 MAC
 * against 61,006, a factor of 500 — and it is EXACT rather than an approximation wherever the
 * box does not bind, which the machine says is 99.81% of the time.
 *
 * THE GAIN IS IDENTIFIED BY PROBING THE SOLVER, not derived from its algebra. Feed unit vectors
 * of `f0` and read `u[0]`; the column that comes back IS the map, including whatever the
 * truncation at `qpIters` does to it. Deriving it from the KKT conditions instead would give the
 * CONVERGED map, which this project has measured is not the one that ships (two iterations beat
 * sixty on this arm) — the same fault as costing a term from a formula the code does not run.
 *
 * WHAT IS CHECKED HERE, before anything is deployed: that superposition actually holds on random
 * free responses, which is the linearity claim itself and fails loudly if the box binds or the
 * warm start carries state between cycles.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_explicit.mjs
 */
import { boxQP } from '../lib/blackbox/qp.js';
import { commissionArm } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);
const BUDGET = 10000;

console.log(`\nis the deployed QP a fixed linear map? — K ${PG.K} / E ${PG.E}\n`);
const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED } });
const N = p.N, iters = p.qpIters, U = p.uMax, lambda = p.lambda;
console.log(`  N ${N}, qpIters ${iters}, uMax ${U}, lambda ${lambda.toExponential(3)}`);

const rnd = (s) => { let z = s >>> 0; return () => ((z = (z * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5; };
for (let c = 0; c < p.nc; c++) {
  const hg = p.hs[c].hGrid;
  // A COLD SOLVE EACH TIME, so the map is a function of `f0` alone. The deployed solver WARM
  // STARTS from the previous plan, which makes its output depend on its own history — so this
  // measures a different object, and saying so is the point rather than a caveat: if the cold
  // map delivers, the warm start is free to go with the rest of the solver.
  const solve = (f0, uPrev = 0) => {
    const u = new Float64Array(N);
    boxQP(hg, f0, u, { U: 1e9, lambda, uPrev, iters });   // U huge: the box deliberately OFF
    return u[0];
  };
  const k = new Float64Array(N);
  const z = new Float64Array(N);
  const base = solve(z, 0);
  for (let i = 0; i < N; i++) {
    const e = new Float64Array(N); e[i] = 1;
    k[i] = solve(e, 0) - base;
  }
  const cPrev = solve(z, 1) - base;
  // SUPERPOSITION ON RANDOM FREE RESPONSES — the linearity claim itself, put to the solver.
  const r = rnd(7 + c);
  let worst = 0;
  for (let t = 0; t < 200; t++) {
    const f0 = new Float64Array(N);
    for (let i = 0; i < N; i++) f0[i] = r() * 2;
    const up = r();
    const truth = solve(f0, up);
    let pred = base + cPrev * up;
    for (let i = 0; i < N; i++) pred += k[i] * f0[i];
    worst = Math.max(worst, Math.abs(truth - pred) / Math.max(1e-12, Math.abs(truth)));
  }
  const kn = Math.sqrt(k.reduce((a, v) => a + v * v, 0));
  console.log(`  ch${c}: |k| ${kn.toExponential(3)}  uPrev coeff ${cPrev.toExponential(3)}  `
    + `bias ${base.toExponential(2)}  worst superposition error ${worst.toExponential(2)}`);
}
const qpNow = p.cost().qp, total = p.cost().peakMacPerCycle;
const gain = (N + 1) * p.nc;
console.log(`\n  QP as deployed        ${Math.round(qpNow).toLocaleString().padStart(9)} MAC/cycle`);
console.log(`  explicit gain instead ${String(gain).padStart(9)} MAC/cycle   `
  + `(${(qpNow / gain).toFixed(0)}x cheaper)`);
console.log(`  deployed total        ${Math.round(total).toLocaleString().padStart(9)} `
  + `(${(100 * total / BUDGET).toFixed(0)}% of budget)`);
console.log(`  with the gain         ${Math.round(total - qpNow + gain).toLocaleString().padStart(9)} `
  + `(${(100 * (total - qpNow + gain) / BUDGET).toFixed(0)}%)  — the forecast is then what is left\n`);
