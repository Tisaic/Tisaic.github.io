/**
 * @file THE CLAIM THE WHOLE PLC REBUILD RESTS ON.
 *
 * Fitting must run ONLINE, on the PLC, inside 10% of every cycle. Batch ridge cannot: normal
 * equations plus a Cholesky, per lead, is about 20 GMAC per channel per layer — two million
 * cycles of budget. It is an offline algorithm and no amount of tuning changes that.
 *
 * WHAT THIS FILE USED TO CLAIM, AND WHAT MEASURING THE REAL ROW SAYS INSTEAD.
 *
 * The claim was: EVERY LEAD SHARES A DESIGN MATRIX, so `X'X` is common and only `X'y` differs,
 * one covariance serves the whole bank, and the per-lead work drops from O(n^3) to O(n). That
 * is the difference between 4079% of budget and 56%, and steps 5 and 6 of the plan were built
 * on it.
 *
 * IT IS FALSE, and this file could not see it, because it built its OWN shared `X` and then
 * verified linear algebra on it — assuming the structural fact it claimed to pin. Two wrongs
 * that agree (rule 15): a synthetic shared matrix and a solver that shares it cannot check
 * whether the PILOT shares one.
 *
 * `Pilot._row(c, k, L, ...)` takes the lead as an argument and uses it. The measured block is
 * `rec.x[k - l*stride]` and does not depend on L; the COMMAND block is `rec.cmd[k + L - l*cs]`
 * and does. Measured on the real row builder at nm 2, mL 6, fL 6: **13 of 25 features are
 * identical across leads and 12 are lead-dependent** — the model pairs a PAST measurement with
 * a FUTURE command, and that pairing is the whole point of a forecast, so the lead-dependence
 * is not an accident to be tidied away.
 *
 * SO THE ECONOMY IS PARTIAL, AND THIS FILE NOW MEASURES WHICH PART. A shared factorisation is
 * exact for the shared block and wrong for the rest, and the honest cost of the online fit is
 * one covariance PER LEAD unless the architecture changes — which is what `docs/plan.md`
 * step 5 now has to answer rather than assume.
 */
import { solveRidge, Pilot } from '../../lib/pilot/pilot.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};

console.log('\npilot: one design matrix, many leads — the shared-covariance claim');

// ---- THE REAL ROW BUILDER, FIRST, because everything below is arithmetic on a matrix this
// file makes up, and the question that matters is what the PILOT builds. `_row` is called
// with a lead and a minimal context; two leads at the same sample are compared column by
// column. No synthetic data can answer this and no structural argument should be trusted for
// it (rule 16).
{
  const nm = 2, mL = 6, fL = 6, ROWS = 400;
  const rec = { x: [], cmd: [] };
  for (let k = 0; k < ROWS; k++) {
    rec.x.push([Math.sin(k / 9), Math.cos(k / 5)]);
    rec.cmd.push([Math.sin(k / 13)]);
  }
  // THE CONTEXT INHERITS, AND THAT IS A FIX FOR A WHOLE CLASS RATHER THAN FOR ONE NAME.
  // This was a bare object literal listing the helpers `_row` happened to call on the day it
  // was written, so every helper added to `_row` since has broken it with a TypeError instead
  // of a failed assertion — `_lagOffsets` did exactly that and the file was RED at HEAD until
  // the failure collector surfaced it. Inheriting from the prototype means the stubs below
  // still override the three things this test deliberately controls, while anything `_row`
  // reaches for that this test has no opinion about resolves to the real implementation.
  const ctx = Object.assign(Object.create(Pilot.prototype), {
    _rec: rec, nm, nc: 1, sample: 1, Ts: 10, channels: [{ lo: -1, hi: 1 }],
    cmdFine: null, cmdFeat: null, lagSpacing: 'uniform', cmdStride: null, cmdAccel: 0,
    N: 1, grid: 1,
    _mLag: () => mL, _fLag: () => fL, _schedVec: Pilot.prototype._schedVec });
  const rowAt = (L) => Pilot.prototype._row.call(ctx, 0, 200, L, 1, false, mL, fL, false);
  const a = rowAt(0), b = rowAt(7);
  let shared = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) < 1e-15) shared++;
  const perLead = a.length - shared;
  console.log(`    the pilot's OWN row at leads 0 and 7: ${a.length} features, `
    + `${shared} identical and ${perLead} lead-DEPENDENT`);
  check('the leads do NOT share a design matrix — the command block is indexed at k+L',
    perLead > 0, `all ${a.length} features matched, which would mean the claim holds`);
  // BOTH HALVES (rule 9): if nothing were shared, a partial economy would not exist either,
  // and the fix below would have nothing to build on.
  check('…but the MEASURED block is shared, so the economy is partial rather than absent',
    shared >= 1 + nm * mL, `${shared} shared against ${1 + nm * mL} expected from the lag block`);
  console.log(`    so an online fit costs one covariance PER LEAD as the row stands — the `
    + `arithmetic below is exact only for the ${shared} shared columns`);
}

// A design matrix with the shape the pilot's actually has: a lag window over several
// signals, with genuine collinearity between neighbouring taps, so a shared factorisation
// is being asked a real question rather than an easy one.
const N_FEAT = 24, N_ROWS = 900, N_LEADS = 8;
const X = [];
for (let r = 0; r < N_ROWS; r++) {
  const row = new Float64Array(N_FEAT);
  for (let i = 0; i < N_FEAT; i++) {
    row[i] = Math.sin((r - i * 3) / 11) + 0.35 * Math.cos((r - i * 3) / 4)
      + 0.02 * Math.sin(r * (i + 1));
  }
  X.push(row);
}
// One target per lead: the same features, a different thing to predict — which is exactly
// what a forecast ladder is.
const ys = [];
for (let L = 0; L < N_LEADS; L++) {
  const w = Array.from({ length: N_FEAT }, (_, i) => Math.cos(i + L) / (1 + 0.1 * i));
  ys.push(X.map((row, r) => {
    let s = 0; for (let i = 0; i < N_FEAT; i++) s += row[i] * w[i];
    return s + 0.01 * Math.sin(r * 7 + L);
  }));
}
const RIDGE = 1e-7;

// ROUTE A: what the pilot does today — an independent solve per lead, each factorising
// `X'X + lam I` from scratch.
const perLead = ys.map((y) => solveRidge(X, y, RIDGE));

// ROUTE B: ONE factorisation, reused. `solveRidge`'s optional `out` hands back the leverage
// closure, which is that factorisation — so if the claim holds, a right-hand side solved
// through it must give the same weights.
const out = {};
solveRidge(X, ys[0], RIDGE, null, out);
check('the shared factorisation is exposed at all', typeof out.leverage === 'function'
  && out.n === N_FEAT && out.rows === N_ROWS, JSON.stringify({ n: out.n, rows: out.rows }));

// The leverage is a property of X alone, so it must be IDENTICAL whichever target was used
// to build it. That is the claim in its cheapest testable form.
const out2 = {};
solveRidge(X, ys[N_LEADS - 1], RIDGE, null, out2);
const probe = Array.from({ length: N_FEAT }, (_, i) => Math.cos(i * 1.7) + 0.4);
const la = out.leverage(probe), lb = out2.leverage(probe);
console.log(`    leverage from lead 0's fit ${la.toExponential(6)}`);
console.log(`    leverage from lead ${N_LEADS - 1}'s fit ${lb.toExponential(6)}`);
check('the factorisation depends on X ALONE — the target cannot move it',
  Object.is(la, lb) || Math.abs(la / lb - 1) < 1e-14, `${la} vs ${lb}`);

// AND THE WEIGHTS DIFFER, so the check above is not passing because everything is the same.
let maxW = 0;
for (let i = 0; i < N_FEAT; i++) maxW = Math.max(maxW, Math.abs(perLead[0][i] - perLead[N_LEADS - 1][i]));
check('…while the per-lead WEIGHTS genuinely differ, so that is not a null result',
  maxW > 1e-3, `largest weight difference ${maxW.toExponential(2)}`);

// WHAT IT BUYS, counted. Per-lead independent: each pays the accumulation and the O(n^3)
// factorisation. Shared: one of each, then O(n) per lead. This is the arithmetic behind
// 4079% versus 56% of budget, so it is stated here rather than in a comment elsewhere.
const accum = N_ROWS * N_FEAT * (N_FEAT + 1) / 2, chol = N_FEAT ** 3 / 6;
const independent = N_LEADS * (accum + chol);
const shared = accum + chol + N_LEADS * N_FEAT * N_FEAT / 2;
console.log(`    per-lead independent ${Math.round(independent).toLocaleString()} MAC`
  + `   shared factorisation ${Math.round(shared).toLocaleString()} MAC`
  + `   ${(independent / shared).toFixed(1)}x`);
check('sharing the factorisation is cheaper by about the lead count',
  independent / shared > N_LEADS * 0.5, `${(independent / shared).toFixed(2)}x over ${N_LEADS} leads`);

console.log(failed ? `\nshared: ${failed} check(s) FAILED\n` : '\nshared: all checks passed\n');
process.exit(failed ? 1 : 0);
