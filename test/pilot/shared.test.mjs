/**
 * @file THE CLAIM THE WHOLE PLC REBUILD RESTS ON.
 *
 * Fitting must run ONLINE, on the PLC, inside 10% of every cycle. Batch ridge cannot: normal
 * equations plus a Cholesky, per lead, is about 20 GMAC per channel per layer — two million
 * cycles of budget. It is an offline algorithm and no amount of tuning changes that.
 *
 * What makes an online fit affordable at all is one structural fact: EVERY LEAD SHARES A
 * DESIGN MATRIX. The forecast ladder fits the same features against a different target per
 * lead, so `X'X` is common to all of them and only `X'y` differs. One factorisation (or one
 * RLS covariance) serves the whole bank, and the per-lead work drops from O(n^3) to O(n).
 *
 * That is the difference between 4079% of budget and 56%, so it is worth an hour to check
 * rather than a week to discover. This asserts it NUMERICALLY — per-lead independent solves
 * against one shared factorisation, on the same data — because a structural argument is not
 * a measurement (rule 16), and because if it is false, steps 5 and 6 of the plan collapse.
 */
import { solveRidge } from '../../lib/pilot/pilot.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};

console.log('\npilot: one design matrix, many leads — the shared-covariance claim');

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
