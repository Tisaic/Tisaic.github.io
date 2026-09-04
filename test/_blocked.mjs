// MOVE BLOCKING, CHECKED AS ARITHMETIC BEFORE IT IS MEASURED AS A CONTROLLER.
//
// `boxQPBlocked` solves the same objective over a subspace: u = B v, with B 0/1 and its columns
// disjoint. Three things must be true before any machine number means anything, and each is a
// property the solver either has or does not — no plant required.
//
//   1. AT m = N THE BLOCKING IS THE IDENTITY. Every block is one step, so the subspace is the
//      whole space and the blocked solver must reproduce the dense one. If it does not, the
//      difference is a defect in the gradient or the step size, not a property of blocking, and
//      every comparison below would be measuring that defect.
//   2. THE BOX IS EXACT. |u[i]| <= U must hold for the EXPANDED plan at any m, because that is
//      the claim that makes this a restriction of the feasible set rather than a relaxation of
//      the constraint. A solver that quietly exceeded the engineer's authority would be worse
//      than a slow one.
//   3. IT DESCENDS. The true objective evaluated on the expanded plan must not rise with
//      iterations. A cheaper solver that does not converge is not cheaper.
//
// AND ONE THING THAT MUST NOT BE ASSERTED: that the blocked optimum equals the dense optimum. It
// does not and cannot — the subspace excludes plans that are not piecewise constant on the
// layout. What that costs is a MACHINE question (rule 16), and this file deliberately does not
// answer it.
import { boxQP, boxQPBlocked, makeBlockBasis } from '../lib/blackbox/qp.js';

let fail = 0;
const ok = (c, msg) => { console.log(`  ${c ? '✓' : '✗'} ${msg}`); if (!c) fail++; };

// A plant with real dynamics rather than a delta, so the Toeplitz structure is exercised.
const N = 24, M = 12;
const h = Float64Array.from({ length: M }, (_, i) => Math.exp(-i / 4) * (1 - i / (2 * M)));
const f0 = Float64Array.from({ length: N }, (_, i) => Math.sin(i / 3) + 0.4 * Math.cos(i / 7));
const U = 0.35, lambda = 0.8, mu = 0.02;

const objective = (u) => {
  let s = 0;
  for (let i = 0; i < N; i++) {
    let t = f0[i];
    for (let k = 0; k <= Math.min(i, M - 1); k++) t += h[k] * u[i - k];
    s += t * t;
  }
  for (let i = 0; i < N; i++) {
    const back = i > 0 ? u[i - 1] : 0;
    s += lambda * (u[i] - back) ** 2 + mu * u[i] * u[i];
  }
  return s;
};

// ---- 1. m = N is the identity ----------------------------------------------------------------
{
  const a = new Float64Array(N), b = new Float64Array(N);
  boxQP(h, f0, a, { U, lambda, mu, iters: 200 });
  const basis = makeBlockBasis(h, N, N, { grow: new Array(N).fill(1) });
  boxQPBlocked(basis, f0, b, { U, lambda, mu, iters: 200 });
  let worst = 0;
  for (let i = 0; i < N; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  console.log(`    m = N: worst |dense - blocked| = ${worst.toExponential(3)},`
    + ` objective ${objective(a).toFixed(9)} vs ${objective(b).toFixed(9)}`);
  ok(worst < 1e-9, 'at m = N the blocked solver reproduces the dense one — blocking is the identity');
}

// ---- 2. the box is exact at every m ----------------------------------------------------------
{
  let worstOver = 0;
  for (const m of [2, 3, 4, 6, 8, 12]) {
    const basis = makeBlockBasis(h, N, m);
    const u = new Float64Array(N);
    boxQPBlocked(basis, f0, u, { U, lambda, mu, iters: 120 });
    for (let i = 0; i < N; i++) worstOver = Math.max(worstOver, Math.abs(u[i]) - U);
    const cover = basis.widths.reduce((a, b) => a + b, 0);
    if (cover !== N) { console.log(`    m=${m}: layout covers ${cover} of ${N}`); fail++; }
  }
  console.log(`    worst excursion past the box over every m: ${worstOver.toExponential(3)}`);
  ok(worstOver <= 1e-12, 'the expanded plan never leaves the engineer\'s box, at any block count');
}

// ---- 3. it descends ---------------------------------------------------------------------------
{
  const basis = makeBlockBasis(h, N, 6);
  let prev = Infinity, rose = 0;
  const seq = [];
  for (const iters of [1, 2, 4, 8, 16, 32, 64, 128]) {
    const u = new Float64Array(N);
    boxQPBlocked(basis, f0, u, { U, lambda, mu, iters });
    const J = objective(u);
    seq.push(J.toFixed(6));
    if (J > prev + 1e-9) rose++;
    prev = J;
  }
  console.log(`    objective by iteration count: ${seq.join(' -> ')}`);
  ok(rose === 0, 'the blocked solve descends monotonically in its iteration budget');
}

// ---- what the restriction costs, REPORTED and not asserted -----------------------------------
{
  const dense = new Float64Array(N);
  boxQP(h, f0, dense, { U, lambda, mu, iters: 400 });
  const Jd = objective(dense);
  console.log('\n    what the subspace costs on this synthetic plant — reported, never asserted,');
  console.log('    because only the machine can say what an objective gap is worth (rule 16):');
  console.log('      m      objective    vs dense    u[0] free?');
  for (const m of [2, 3, 4, 6, 8, 12, N]) {
    const basis = makeBlockBasis(h, N, m);
    const u = new Float64Array(N);
    boxQPBlocked(basis, f0, u, { U, lambda, mu, iters: 400 });
    console.log(`      ${String(m).padStart(2)}   ${objective(u).toFixed(6).padStart(11)}`
      + `   ${(objective(u) / Jd).toFixed(4).padStart(8)}x   ${basis.widths[0] === 1 ? 'yes' : 'NO'}`);
  }
}

console.log(fail ? `\nblocked: ${fail} FAILED` : '\nblocked: all checks passed');
process.exit(fail ? 1 : 0);
