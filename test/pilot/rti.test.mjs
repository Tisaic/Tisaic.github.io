/**
 * @file ONE QP ITERATION PER CYCLE, INSTEAD OF SIXTY AT THE UPDATE.
 *
 * The online PLC budget is under 10% of every 1 ms cycle, always. The measured cost of the
 * deployed cascade is 2,683,201 MAC/cycle against a 10,000 budget, and 96% of that is the QP:
 * the pilot runs SIXTY iterations, and on the EMPS axis `cyclesPerUpdate` is 1, so there is
 * no slicing headroom either. Iterations are the lever — 60 to 1 is 60x, where the horizon
 * only buys as N² and the features, at 37, are already affordable.
 *
 * THE REAL-TIME ITERATION SCHEME IS THE ESTABLISHED FORM OF THIS. Rather than solving a stale
 * problem exactly every K cycles, do ONE iteration every cycle against the CURRENT problem,
 * carrying the solution forward. Bounded work per cycle by construction, which is what
 * "always fits" demands, and the iterate tracks a moving optimum rather than converging to a
 * stationary one.
 *
 * IT IS NOT FREE AND THE QUESTION IS WHAT IT COSTS. A receding horizon applies only its FIRST
 * move, so what matters is not whether the whole plan converges but whether u[0] tracks. This
 * measures exactly that: a horizon whose free response MOVES every cycle, driven both ways,
 * comparing the move actually applied.
 */
import { boxQP } from '../../lib/blackbox/qp.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};

console.log('\npilot: one QP iteration per cycle against sixty at the update');

const N = 48, M = 48;
// A plant impulse response with a lag and some ringing — the shape the pilot actually
// inverts, not a clean integrator that would make any solver look good.
const h = new Float64Array(M);
for (let i = 0; i < M; i++) h[i] = (1 - Math.exp(-i / 6)) * Math.exp(-i / 22) * (1 + 0.25 * Math.sin(i / 3));
const U = 1.0, LAMBDA = 3e-3, CYCLES = 400;

// The disturbance the horizon is forecasting: a moving target, because a stationary one
// cannot tell a tracking scheme from a converging one.
const f0At = (k) => {
  const f = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = k + i;
    f[i] = 0.6 * Math.sin(t / 31) + 0.25 * Math.sin(t / 7 + 1) + 0.1 * Math.sin(t / 3.3);
  }
  return f;
};

// ROUTE A — as shipped: sixty iterations, warm-started from the shifted previous plan.
const uA = new Float64Array(N);
const appliedA = [];
let prevA = 0;
for (let k = 0; k < CYCLES; k++) {
  boxQP(h, f0At(k), uA, { U, lambda: LAMBDA, uPrev: prevA, iters: 60 });
  appliedA.push(uA[0]); prevA = uA[0];
  for (let i = 0; i < N - 1; i++) uA[i] = uA[i + 1];
  uA[N - 1] = 0;
}

// ROUTE B — real-time iteration: ONE iteration per cycle, carried forward.
const uB = new Float64Array(N);
const appliedB = [];
let prevB = 0;
for (let k = 0; k < CYCLES; k++) {
  boxQP(h, f0At(k), uB, { U, lambda: LAMBDA, uPrev: prevB, iters: 1 });
  appliedB.push(uB[0]); prevB = uB[0];
  for (let i = 0; i < N - 1; i++) uB[i] = uB[i + 1];
  uB[N - 1] = 0;
}

// SCORED ON THE APPLIED MOVE, not on the plan. Only u[0] ever reaches the machine.
const settle = 80;                        // both schemes start from a cold plan
const a = appliedA.slice(settle), b = appliedB.slice(settle);
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const diff = a.map((x, i) => x - b[i]);
const rel = rms(diff) / rms(a);
console.log(`    applied move: 60-iteration rms ${rms(a).toFixed(5)}, `
  + `1-iteration rms ${rms(b).toFixed(5)}, difference ${rms(diff).toExponential(2)}`
  + ` = ${(100 * rel).toFixed(2)}% of the signal`);

// WHAT IT COSTS, counted on the same arithmetic the pilot's cost() uses.
const perIter = 2 * N * Math.min(N, M) + 4 * N;
console.log(`    cost: 60 iterations ${(60 * perIter).toLocaleString()} MAC at the update, `
  + `1 iteration ${perIter.toLocaleString()} MAC every cycle — ${(60).toFixed(0)}x less peak`);

check('one iteration per cycle tracks the sixty-iteration move to within 5%',
  rel < 0.05, `${(100 * rel).toFixed(2)}%`);
// AND THE CHECK HAS TEETH: the moves are not near-zero, so agreeing is not trivial.
check('…and the moves are large enough that agreeing is not trivial',
  rms(a) > 0.05, `applied rms ${rms(a).toFixed(4)}`);
// A CONVERGING SCHEME AND A TRACKING ONE DIFFER MOST WHERE THE TARGET MOVES FASTEST, so the
// worst single cycle is reported rather than only the rms — an average can hide a spike that
// a machine would feel.
let worst = 0, worstAt = 0;
for (let i = 0; i < diff.length; i++) if (Math.abs(diff[i]) > worst) { worst = Math.abs(diff[i]); worstAt = i; }
console.log(`    worst single cycle: ${worst.toExponential(2)} at cycle ${settle + worstAt}`
  + ` (${(100 * worst / rms(a)).toFixed(1)}% of rms)`);
check('…and no single cycle diverges — the worst move is within 20% of the signal rms',
  worst < 0.2 * rms(a), `${(100 * worst / rms(a)).toFixed(1)}%`);

console.log(failed ? `\nrti: ${failed} check(s) FAILED\n` : '\nrti: all checks passed\n');
process.exit(failed ? 1 : 0);
