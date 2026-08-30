/**
 * @file THE ONLINE FIT MUST REPRODUCE THE OFFLINE ONE, EXACTLY, BEFORE IT GOES NEAR A MACHINE.
 *
 * `SharedRLS` exists to replace batch normal-equations-and-Cholesky, which is ~20 GMAC per
 * channel per layer and cannot run in a PLC scan — and to be the second-order adaptation that
 * replaces the retired lap-indexed rung, after first-order LMS was measured taking a held-out
 * program from 8.27x to 0.98x.
 *
 * A NEW FITTING METHOD THAT QUIETLY CHANGES THE MODEL IS WORSE THAN A SLOW ONE, so what is
 * asserted here is not that it runs but that with `lambda = 1` and `P0 = (1/ridge)I` it
 * returns the SAME estimate as `solveRidge` on the same data — because the RLS recursion is
 * an exact recursive form of `(X'X + ridge I)^-1 X'y`, not an approximation of it. If that
 * ever stops holding, the online fit is a different model wearing the same name.
 */
import { solveRidge } from '../../lib/pilot/pilot.js';
import { SharedRLS } from '../../lib/pilot/rls.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};
console.log('\npilot: shared-covariance RLS against the batch fit it replaces');

// A DESIGN MATRIX WITH REAL STRUCTURE: correlated columns, differing scales, and more rows
// than features. An orthogonal random matrix would make any estimator look right — the whole
// difficulty of a ridge fit is collinearity, so the test data has to have some.
const N = 37, ROWS = 900, NLEADS = 12, RIDGE = 1e-3;
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
const X = [], Y = Array.from({ length: NLEADS }, () => []);
for (let k = 0; k < ROWS; k++) {
  const row = new Float64Array(N);
  row[0] = 1;
  for (let i = 1; i < N; i++) {
    // each column a lagged, scaled, partly-shared signal — collinear on purpose
    row[i] = Math.sin(k / (3 + i * 0.7)) * (1 + 0.3 * i) + 0.4 * row[i - 1] + 0.05 * rnd();
  }
  X.push(row);
  for (let L = 0; L < NLEADS; L++) {
    let v = 0;
    for (let i = 0; i < N; i++) v += row[i] * Math.cos(i * 0.3 + L);
    Y[L].push(v + 0.02 * rnd());
  }
}

// ---- the batch fit, per lead, exactly as the pilot does it today
const batch = [];
for (let L = 0; L < NLEADS; L++) batch.push(solveRidge(X, Y[L], RIDGE));

// ---- THE RIDGE IS SCALE-RELATIVE, AND AN ONLINE FIT CANNOT SEE THE SCALE.
//
// `solveRidge` uses `lam = ridge * max_i (X'X)_ii` — the penalty is a fraction of the largest
// column energy, which is a statistic of the WHOLE record and is not known at row 1. An RLS
// recursion sets its prior once, at the start, from `P0 = (1/lam)I`, so it cannot reproduce a
// penalty that depends on data it has not seen. Left unnoticed this is exactly the failure
// this file exists to prevent: the first version of this check disagreed by 10.9% and the two
// fits were solving genuinely different problems while both looking correct.
//
// It is a real constraint on the online rebuild, not a defect in either side, and it has two
// honest resolutions: make the ridge ABSOLUTE, which needs a scale the plant can state; or
// seed the recursion from a short batch warm-up that measures the scale first. Recorded here
// because the choice belongs in `docs/plan.md` step 5, and asserted below at matched
// absolute ridge so the RECURSION itself is verified rather than the convention around it.
let dmax = 0;
for (let i = 0; i < N; i++) {
  let d = 0;
  for (let k = 0; k < ROWS; k++) d += X[k][i] * X[k][i];
  if (d > dmax) dmax = d;
}
const ABS_RIDGE = RIDGE * dmax;
console.log(`    the batch ridge is scale-relative: ${RIDGE} x max diag(X'X) `
  + `${dmax.toExponential(2)} = ${ABS_RIDGE.toExponential(2)} absolute — a statistic of the `
  + `whole record, which an online prior cannot know at row 1`);

// ---- the online fit: one covariance, all leads, one pass
const rls = new SharedRLS(N, NLEADS, ABS_RIDGE, 1);
for (let k = 0; k < ROWS; k++) rls.update(X[k], Y.map((y) => y[k]));

let worst = 0, worstL = 0, scale = 0;
for (let L = 0; L < NLEADS; L++) {
  const b = batch[L], o = rls.weights(L);
  for (let i = 0; i < N; i++) {
    const d = Math.abs(b[i] - o[i]);
    if (Math.abs(b[i]) > scale) scale = Math.abs(b[i]);
    if (d > worst) { worst = d; worstL = L; }
  }
}
console.log(`    ${NLEADS} leads x ${N} features over ${ROWS} rows: largest weight `
  + `disagreement ${worst.toExponential(2)} against a weight scale of ${scale.toExponential(2)}`
  + ` — ${(100 * worst / scale).toExponential(2)}%`);
check('the online fit reproduces the batch fit it replaces, to rounding',
  worst / scale < 1e-8, `${(worst / scale).toExponential(2)} relative, worst at lead ${worstL}`);
// AND THE CHECK HAS TEETH: the weights are not all near zero, so agreeing is not trivial.
check('…and the weights are large enough that agreeing means something',
  scale > 0.1, `scale ${scale.toExponential(2)}`);

// ---- ONE COVARIANCE, NOT nLeads OF THEM. The economy is the whole point, so it is asserted
// as arithmetic rather than left as a claim about the code's shape.
const c = rls.cost();
const separate = NLEADS * 2 * N * N;
console.log(`    cost: ${c.total.toLocaleString()} MAC/sample shared `
  + `(${c.covariance.toLocaleString()} covariance + ${NLEADS} x ${c.perLead}) against `
  + `${separate.toLocaleString()} for one covariance per lead — ${(separate / c.total).toFixed(1)}x`);
check('sharing the covariance is cheaper than a covariance per lead, by the lead count',
  separate / c.total > NLEADS * 0.7, `${(separate / c.total).toFixed(1)}x on ${NLEADS} leads`);

// ---- A LEAD WITH NO TRUTH YET IS SKIPPED, NOT FITTED TO A GUESS. A far lead early in a
// record has no target; pairing it with the present one trains the wrong question and leaves
// those equations in the model for ever. Both halves: the skipped lead does NOT move, and the
// others still do (rule 9).
const rls2 = new SharedRLS(N, NLEADS, ABS_RIDGE, 1);
for (let k = 0; k < ROWS; k++) {
  rls2.update(X[k], Y.map((y, L) => (L === 3 ? null : y[k])));
}
let moved3 = 0, moved0 = 0;
for (let i = 0; i < N; i++) {
  moved3 += Math.abs(rls2.weights(3)[i]);
  moved0 += Math.abs(rls2.weights(0)[i] - rls.weights(0)[i]);
}
check('a lead whose target has not arrived is skipped rather than fitted to a guess',
  moved3 === 0, `lead 3 moved by ${moved3.toExponential(2)}`);
check('…and skipping it changes nothing for the leads that did have one',
  moved0 < 1e-12, `lead 0 differs by ${moved0.toExponential(2)}`);

// ---- FORGETTING IS THE ONLY DIFFERENCE BETWEEN FITTING AND TRACKING, and it must actually
// track: fed a plant whose gain CHANGES half way, lambda < 1 has to follow it where lambda = 1
// averages the two. This is the property the memory's replacement rests on, so it is measured
// rather than assumed.
const track = (lam) => {
  const r = new SharedRLS(2, 1, 1e-6, lam);
  for (let k = 0; k < 4000; k++) {
    const u = Math.sin(k / 7) + 0.3 * Math.sin(k / 3.1);
    const gain = k < 2000 ? 1.0 : 3.0;
    r.update([1, u], [gain * u]);
  }
  return r.weights(0)[1];
};
const held = track(1), tracked = track(0.995);
console.log(`    a gain that steps 1.0 -> 3.0 half way: lambda 1 ends at ${held.toFixed(3)}, `
  + `lambda 0.995 ends at ${tracked.toFixed(3)}`);
check('with forgetting it TRACKS the change, where without it it averages the two',
  tracked > 2.9 && held < 2.5, `${tracked.toFixed(3)} tracked, ${held.toFixed(3)} held`);

console.log(failed ? `\nrls: ${failed} check(s) FAILED\n` : '\nrls: all checks passed\n');
process.exit(failed ? 1 : 0);
