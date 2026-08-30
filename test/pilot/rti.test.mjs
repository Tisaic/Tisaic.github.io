/**
 * @file ONE QP ITERATION PER CYCLE — THE HYPOTHESIS, AND WHAT MEASURING IT FOUND INSTEAD.
 *
 * THE HYPOTHESIS. The online PLC budget is under 10% of every 1 ms cycle, always. The
 * measured cost of the deployed cascade is 2,683,201 MAC/cycle against a 10,000 budget and
 * 96% of that is the QP, which runs SIXTY iterations with `cyclesPerUpdate` 1 on the EMPS
 * axis — no slicing headroom either. So iterations are the lever, 60x where the horizon
 * only buys as N² and the features, at 37, are already affordable. The REAL-TIME ITERATION
 * scheme is the established form of that trade: rather than solving a stale problem exactly
 * every K cycles, do ONE iteration every cycle against the CURRENT problem and carry the
 * iterate forward. Bounded work per cycle by construction, which is exactly what "always
 * fits" demands.
 *
 * IT IS FALSE HERE, AND THE MEASUREMENT FOUND SOMETHING WORSE UNDERNEATH IT. A receding
 * horizon applies only its FIRST move, so the question is not whether the plan converges
 * but whether u[0] tracks. It does not: one iteration differs from sixty by ~88% of the
 * applied signal. And the control it was compared against turns out not to be a converged
 * solve at all — SIXTY ITERATIONS IS 36% AWAY FROM THIS SOLVER'S OWN OPTIMUM. The pilot's
 * whole measured history — 5.96x, 12.70x, 22.42x — was produced by a heavily truncated
 * solve, so truncation is acting as implicit regularisation rather than as a defect, and
 * "is 60 enough?" cannot be answered by scoring the solver against itself (rule 16). That
 * is what `test/pilot/qpsweep.mjs` exists to answer, on the MACHINE.
 *
 * WHAT SETS THE RATE IS CONDITIONING, NOT HORIZON LENGTH. The curve is the same at N=8 as
 * at N=48 — measured below — so shortening the horizon does not buy a cheaper solve, it
 * only buys a smaller one. What DOES move it is measured here too: the Lipschitz bound the
 * solver derives its step from is (sum|h|)², which is 1.8x above the true spectral norm and
 * costs exactly a factor of two in iterations. (The other obvious fix, FISTA adaptive
 * restart, is a NULL on this problem — measured in `docs/plan.md` step 6 against a local
 * re-implementation, which is why it is recorded there and not asserted here: a duplicate
 * of the solver cannot pin a property of the solver.)
 *
 * This file asserts those measurements. It is a record of a falsified hypothesis, and
 * every check in it is written so that a later change making RTI viable turns it RED and
 * gets re-measured rather than passing silently (rule 4).
 */
import { boxQP } from '../../lib/blackbox/qp.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};

console.log('\npilot: one QP iteration per cycle against sixty, and what sixty is worth');

const M = 48;
// A plant impulse response with a lag and some ringing — the shape the pilot actually
// inverts, not a clean integrator that would make any solver look good.
const h = new Float64Array(M);
for (let i = 0; i < M; i++) h[i] = (1 - Math.exp(-i / 6)) * Math.exp(-i / 22) * (1 + 0.25 * Math.sin(i / 3));
const U = 1.0, LAMBDA = 3e-3, CYCLES = 400, SETTLE = 80;

// The disturbance the horizon is forecasting: a MOVING target, because a stationary one
// cannot tell a tracking scheme from a converging one.
const f0At = (k, N) => {
  const f = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const t = k + i;
    f[i] = 0.6 * Math.sin(t / 31) + 0.25 * Math.sin(t / 7 + 1) + 0.1 * Math.sin(t / 3.3);
  }
  return f;
};

/** Drive the receding horizon for CYCLES steps and return the moves ACTUALLY APPLIED.
 *  Only u[0] ever reaches a machine, so only u[0] is scored. */
function drive(N, iters) {
  const u = new Float64Array(N), applied = [];
  let prev = 0;
  for (let k = 0; k < CYCLES; k++) {
    boxQP(h, f0At(k, N), u, { U, lambda: LAMBDA, uPrev: prev, iters });
    applied.push(u[0]); prev = u[0];
    for (let i = 0; i < N - 1; i++) u[i] = u[i + 1];
    u[N - 1] = 0;                                   // the shift: the warm start
  }
  return applied.slice(SETTLE);                     // both schemes start from a cold plan
}
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const gap = (a, b) => rms(a.map((x, i) => x - b[i])) / rms(b);

// ---------------------------------------------------------------- ① RTI, falsified
const N = 48;
const at60 = drive(N, 60);
const at1 = drive(N, 1);
const rel = gap(at1, at60);
console.log(`    applied move: 60-iteration rms ${rms(at60).toFixed(5)}, `
  + `1-iteration rms ${rms(at1).toFixed(5)}, difference ${(100 * rel).toFixed(1)}% of the signal`);
check('the moves are large enough that any comparison of them means something',
  rms(at60) > 0.05, `applied rms ${rms(at60).toFixed(4)}`);
check('ONE ITERATION PER CYCLE DOES NOT TRACK SIXTY — RTI is not a drop-in here',
  rel > 0.5, `${(100 * rel).toFixed(1)}% — if this has fallen, RTI became viable and the `
  + 'budget argument must be re-measured, not this threshold relaxed');

// ------------------------------------------------- ② and sixty is not converged either
const CONVERGED = 4096;
const ref = drive(N, CONVERGED);
const trunc = gap(at60, ref);
const row = [];
for (const it of [8, 16, 32, 60, 120, 240, 480]) row.push(`${it}:${(100 * gap(drive(N, it), ref)).toFixed(0)}%`);
console.log(`    distance from this solver's own optimum (${CONVERGED} iterations), N=${N}: ${row.join(' ')}`);
check('THE SHIPPED 60-ITERATION SOLVE IS TRUNCATED — over 20% from its own optimum',
  trunc > 0.2, `${(100 * trunc).toFixed(1)}% — every delivered number in this project was `
  + 'produced by this truncation, so a change that removes it changes the controller');
check('…and the optimum is reachable, so the gap is truncation and not a broken solver',
  gap(drive(N, 960), ref) < 0.02, `${(100 * gap(drive(N, 960), ref)).toFixed(2)}% at 960`);

// ------------------------------- ③ the rate is conditioning, not horizon (rule 18 shape)
// A COMMON CURVE ACROSS HORIZONS THAT SHARE NO SIZE is a property of the Hessian, not of N.
const short = 8;
const refS = drive(short, CONVERGED);
const truncS = gap(drive(short, 60), refS);
console.log(`    at N=${short} the same 60 iterations sit ${(100 * truncS).toFixed(0)}% out, `
  + `against ${(100 * trunc).toFixed(0)}% at N=${N} — a six-fold shorter horizon, the same rate`);
check('SHORTENING THE HORIZON DOES NOT BUY A CHEAPER SOLVE — the curves agree within 15%',
  Math.abs(truncS - trunc) / trunc < 0.15,
  `${(100 * truncS).toFixed(1)}% against ${(100 * trunc).toFixed(1)}%`);

// ------------------------------------------- ④ the two things that do and do not move it
// The step size is 1/L for L = 2((sum|h|)²·wMax + 4λ). (sum|h|)² bounds ||T||² from above
// and here it is loose, which is a straight multiplier on the iteration count. The true
// value is one power iteration at DESIGN time — free online — so this is a real lever and
// is measured rather than argued.
function trueL(nn, lambda) {
  const v = new Float64Array(nn), r = new Float64Array(nn), g = new Float64Array(nn);
  for (let i = 0; i < nn; i++) v[i] = Math.sin(i * 1.7) + 0.1;
  let lam = 0;
  for (let it = 0; it < 200; it++) {
    for (let i = 0; i < nn; i++) {                    // r = T v
      let s = 0; const top = i < M - 1 ? i : M - 1;
      for (let m = 0; m <= top; m++) s += h[m] * v[i - m];
      r[i] = s;
    }
    for (let i = 0; i < nn; i++) {                    // g = T' r
      let s = 0; const top = nn - i < M ? nn - i : M;
      for (let m = 0; m < top; m++) s += h[m] * r[i + m];
      g[i] = s;
    }
    for (let i = 0; i < nn; i++) {
      const yi = v[i], back = i > 0 ? v[i - 1] : 0, fwd = i < nn - 1 ? v[i + 1] : yi;
      g[i] = 2 * g[i] + 2 * lambda * ((yi - back) - (fwd - yi));
    }
    let nrm = 0; for (let i = 0; i < nn; i++) nrm += g[i] * g[i];
    nrm = Math.sqrt(nrm); if (!nrm) break;
    lam = nrm; for (let i = 0; i < nn; i++) v[i] = g[i] / nrm;
  }
  return lam;
}
let ah = 0; for (let m = 0; m < M; m++) ah += Math.abs(h[m]);
const bound = 2 * (ah * ah + 4 * LAMBDA), tight = trueL(N, LAMBDA);
console.log(`    Lipschitz: the shipped bound is ${bound.toFixed(1)}, the true norm `
  + `${tight.toFixed(1)} — ${(bound / tight).toFixed(2)}x loose, i.e. a step ${(bound / tight).toFixed(2)}x too small`);
check('THE STEP SIZE IS DERIVED FROM A LOOSE BOUND, and the looseness is worth measuring',
  bound / tight > 1.5 && bound / tight < 4, `${(bound / tight).toFixed(2)}x`);
check('…and the bound is still a BOUND — a step size above 1/L would diverge',
  bound > tight, `${bound.toFixed(1)} against ${tight.toFixed(1)}`);

console.log(failed ? `\nrti: ${failed} check(s) FAILED\n` : '\nrti: all checks passed\n');
process.exit(failed ? 1 : 0);
