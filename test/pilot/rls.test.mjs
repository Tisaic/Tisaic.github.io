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

// ---- THE POSTERIOR HANDED FROM THE BATCH FIT, AND THE MECHANISM THAT ACTUALLY SEPARATES
// THE TWO LAWS. The first version of this block asserted the wrong thing and the measurement
// said so, which is worth keeping because the wrong theory is the intuitive one.
//
// WHAT WAS CLAIMED: LMS destroyed transfer because it is unconstrained in directions the
// current program does not excite, so the weights drift there. FALSE, and provably: an LMS
// step is `mu e x/||x||^2`, which lies ALONG x, so a strictly unexcited direction does not
// move under LMS either. Measured here: an RLS seeded with a diagonal prior moves such a
// weight by exactly 0.00e+0, and one seeded with the batch posterior moves it by 0.198 —
// through the prior's own off-diagonal CORRELATION, which is correct inference and not drift.
//
// WHAT ACTUALLY SEPARATES THEM IS THAT LMS NEVER STOPS. Its gain is `mu/||x||^2`, which
// depends on the current row and not on how much data has already been seen, so it keeps
// responding to noise at full strength for ever and a long run accumulates that. An RLS gain
// is `Px/(lambda + x'Px)` and `P` SHRINKS as information arrives, so the law converges and
// then holds. On a program where the commissioned model is already right, LMS keeps moving
// and RLS does not — and "keeps moving on a program where it is already right" is exactly a
// controller specialising to the trajectory in front of it, which is the memory the
// retirement is trying to remove.
//
// So the test is: seed from the commissioning posterior, feed a stream carrying NO new
// information — the same plant, only noise — and require the model to hold. Both halves, with
// a constant-gain law on the identical stream as the control (rule 9).
{
  const out = {};
  const Xa = [], ya = [];
  let s2 = 999;
  const nz = () => { s2 = (s2 * 1103515245 + 12345) & 0x7fffffff; return s2 / 0x7fffffff - 0.5; };
  for (let k = 0; k < 400; k++) {
    const a = Math.sin(k / 5), b = Math.sin(k / 3.3 + 1);
    Xa.push([a, b]); ya.push(2 * a + 5 * b);
  }
  const w0 = solveRidge(Xa, ya, 1e-9, null, out);
  const P0 = out.covariance();

  const rls3 = new SharedRLS(2, 1, 1, 1);
  rls3.seed(0, w0, P0);
  // The SAME plant it was fitted on, plus measurement noise. Nothing here should change the
  // model: a law that moves on this stream is chasing noise, and on a repeating program it
  // will chase the same noise into the same corner every lap.
  const lms = [w0[0], w0[1]];
  for (let k = 0; k < 20000; k++) {
    const a = Math.sin(k / 5), b = Math.sin(k / 3.3 + 1);
    const y = 2 * a + 5 * b + 0.05 * nz();
    rls3.update([a, b], [y]);
    // the law it replaces, on the identical row: theta += mu e x/||x||^2
    const n2 = a * a + b * b;
    if (n2 > 0) {
      const e = y - (lms[0] * a + lms[1] * b);
      const g = 0.05 * e / n2;
      lms[0] += g * a; lms[1] += g * b;
    }
  }
  const rw = rls3.weights(0);
  const dR = Math.hypot(rw[0] - 2, rw[1] - 5);
  const dL = Math.hypot(lms[0] - 2, lms[1] - 5);
  console.log(`    20,000 rows of the SAME plant plus noise, starting from the commissioned fit:`);
  console.log(`      seeded RLS   [${rw[0].toFixed(4)}, ${rw[1].toFixed(4)}]  ${dR.toExponential(2)} from truth`);
  console.log(`      LMS, mu 0.05 [${lms[0].toFixed(4)}, ${lms[1].toFixed(4)}]  ${dL.toExponential(2)} from truth`);
  check('a seeded RLS HOLDS a model that is already right, because its gain decays with information',
    dR < 2e-3, `${dR.toExponential(2)} from truth`);
  check('…where a constant-gain law keeps chasing the noise on the same stream',
    dL > 5 * dR, `LMS ${dL.toExponential(2)} against RLS ${dR.toExponential(2)}`);

  // AND IT STILL LEARNS when the plant really does change — a law that held by being deaf
  // would pass the checks above and be useless.
  const rls4 = new SharedRLS(2, 1, 1, 0.999);
  rls4.seed(0, w0, P0);
  for (let k = 0; k < 20000; k++) {
    const a = Math.sin(k / 5), b = Math.sin(k / 3.3 + 1);
    rls4.update([a, b], [2 * a + 9 * b + 0.05 * nz()]);
  }
  const w4 = rls4.weights(0);
  console.log(`      and when the plant DOES change (5 → 9): [${w4[0].toFixed(4)}, ${w4[1].toFixed(4)}]`);
  check('…and with forgetting it still follows a plant that genuinely changed',
    Math.abs(w4[1] - 9) < 0.1, `${w4[1].toFixed(4)} against 9`);
}

// ---- COVARIANCE WIND-UP, AND THE BOUND THAT STOPS IT — BOTH HALVES (rule 9).
//
// `lambda < 1` divides `P` by lambda on every update, so on a stream that carries no new
// information the covariance inflates geometrically and the gain grows until the estimator is
// answering noise at full strength. That is not a hypothetical: on the EMPS axis
// `test/pilot/adapt.mjs` measures lambda 0.999 reading 32.5x on the first lap of a program it
// has never seen and 0.08x by lap twenty — one estimator winding up, not two behaviours. The
// excitation gate cannot catch it either, because as `P` inflates `x\'Px` grows and the gate
// that was meant to hold back redundant rows stops firing.
//
// A bound that only stopped the growth would be half a check. It also has to leave a model
// that genuinely needs to move free to move, and it has to be INERT when not asked for.
{
  console.log('\n  covariance wind-up on an uninformative stream, and the trace bound:');
  const mkRow = (k) => {
    // ONE DIRECTION, FOR EVER. The second coordinate is never excited, which is precisely the
    // situation a repeating production program creates once its first lap is learned.
    const a = 1 + 0.001 * Math.sin(k / 7);
    return [a, 0];
  };
  const trace = (r) => { let t = 0; for (let i = 0; i < r.n; i++) t += r.P[i * r.n + i]; return t; };

  const loose = new SharedRLS(2, 1, 1, 0.999);
  const tr0 = trace(loose);
  for (let k = 0; k < 20000; k++) loose.update(mkRow(k), [2 * mkRow(k)[0]]);
  const grew = trace(loose) / tr0;

  const bound = new SharedRLS(2, 1, 1, 0.999);
  bound.setTraceBound(8);
  for (let k = 0; k < 20000; k++) bound.update(mkRow(k), [2 * mkRow(k)[0]]);
  const held = trace(bound) / tr0;

  console.log(`    20,000 rows in ONE direction: trace x${grew.toExponential(2)} unbounded, `
    + `x${held.toFixed(2)} bounded at 8`);
  check('an unbounded forgetting recursion winds its covariance up on an uninformative stream',
    grew > 1e3, `trace grew only x${grew.toExponential(2)} — the failure this bound exists for did not occur`);
  check('…and the trace bound holds it, at the multiple it was given',
    held <= 8 * (1 + 1e-9) && held > 1, `x${held.toFixed(3)} against a bound of 8`);

  // AND IT IS NOT DEAF. The bounded recursion has to still follow a plant that really changed —
  // a bound tight enough to stop wind-up by stopping learning would pass the check above.
  const w0b = new Float64Array([2, 5]);
  const P0b = new Float64Array([1e-4, 0, 0, 1e-4]);
  let ns = 7; const nz2 = () => { ns = (ns * 1103515245 + 12345) & 0x7fffffff; return ns / 0x7fffffff - 0.5; };
  const live = new SharedRLS(2, 1, 1, 0.999);
  live.seed(0, w0b, P0b);
  live.setTraceBound(8);
  for (let k = 0; k < 20000; k++) {
    const a = Math.sin(k / 5), b = Math.sin(k / 3.3 + 1);
    live.update([a, b], [2 * a + 9 * b + 0.05 * nz2()]);
  }
  const wl = live.weights(0);
  console.log(`    plant changes 5 → 9 with the bound ON: [${wl[0].toFixed(4)}, ${wl[1].toFixed(4)}]`);
  check('…and a bounded recursion still follows a plant that genuinely changed',
    Math.abs(wl[1] - 9) < 0.1, `${wl[1].toFixed(4)} against 9`);

  // THE CONTROL (rule 21): a repair that changes cases it should not touch has changed the
  // measurement rather than fixed anything. `setTraceBound(0)` must leave the recursion byte
  // for byte where it was, which is what makes the option safe to ship default-off.
  const offA = new SharedRLS(2, 1, 1, 0.999);
  const offB = new SharedRLS(2, 1, 1, 0.999);
  offB.setTraceBound(0);
  for (let k = 0; k < 5000; k++) {
    const a = Math.sin(k / 5), b = Math.sin(k / 3.3 + 1), y = 2 * a + 5 * b;
    offA.update([a, b], [y]); offB.update([a, b], [y]);
  }
  let same = true;
  for (let i = 0; i < offA.P.length; i++) if (offA.P[i] !== offB.P[i]) same = false;
  for (let i = 0; i < 2; i++) if (offA.weights(0)[i] !== offB.weights(0)[i]) same = false;
  check('…and at 0 the bound is byte-identical to not having it, which is why it ships off',
    same, 'setTraceBound(0) changed the recursion');
}

console.log(failed ? `\nrls: ${failed} check(s) FAILED\n` : '\nrls: all checks passed\n');
process.exit(failed ? 1 : 0);
