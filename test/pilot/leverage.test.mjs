/**
 * @file THE PREDICTIVE VARIANCE THE FIT WAS ALREADY PAYING FOR.
 *
 * `solveRidge` factors `X'X + lam I` by Cholesky and threw the factor away. The same factor
 * gives `x'(X'X + lam I)^-1 x` — the fit's predictive variance at `x`, up to the noise scale,
 * and the standard measure of how far `x` lies outside the data it was fitted on — for one
 * triangular solve against the O(n^3) already spent.
 *
 * The pilot has three open questions this answers and a threshold cannot: which leads of the
 * horizon the QP should trust, when an operating point is too far outside the commissioning
 * data to act on, and when commissioning has learned enough to stop. `lib/ngrc` has returned
 * the same number from its RLS as `innovVar` all along; the pilot fits by batch ridge and so
 * never had it.
 *
 * This pins that the number IS what it claims — against an independently computed inverse,
 * not against itself — and that it behaves the way an extrapolation measure must.
 */
import { solveRidge } from '../../lib/pilot/pilot.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};

console.log('\npilot: the leverage the Cholesky already pays for');

// A DELIBERATELY LOPSIDED DESIGN: the second feature is barely excited, so the fit knows far
// less about it. An extrapolation measure that cannot see that is not one.
const rows = [];
const ys = [];
for (let i = 0; i < 200; i++) {
  const a = Math.sin(i / 7), b = 0.02 * Math.cos(i / 3);
  rows.push([a, b, 1]);
  ys.push(2 * a - 0.5 * b + 0.1);
}
const RIDGE = 1e-6;
const out = {};
const w = solveRidge(rows, ys, RIDGE, null, out);
const wPlain = solveRidge(rows, ys, RIDGE);

// RULE 21: asking for the leverage must not change the answer.
check('asking for the leverage leaves the weights byte-identical',
  w.every((v, i) => Object.is(v, wPlain[i])), `${Array.from(w)} vs ${Array.from(wPlain)}`);

// AN INDEPENDENT ROUTE TO THE SAME NUMBER. Build A = X'X + lam I explicitly, invert it by
// Gauss-Jordan, and form x'A^-1 x. Two wrongs that agree are indistinguishable from two
// rights (rule 15), so this deliberately shares no code with the Cholesky path.
const n = 3;
let scale = 0;
const A = Array.from({ length: n }, () => new Float64Array(n));
for (const r of rows) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) A[i][j] += r[i] * r[j];
for (let i = 0; i < n; i++) scale = Math.max(scale, A[i][i]);
for (let i = 0; i < n; i++) A[i][i] += RIDGE * scale;
const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
for (let c = 0; c < n; c++) {
  let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
  [M[c], M[p]] = [M[p], M[c]];
  const d = M[c][c];
  for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
  for (let r = 0; r < n; r++) if (r !== c) {
    const f = M[r][c];
    for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
  }
}
const inv = M.map((r) => r.slice(n));
const refLev = (x) => {
  let acc = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) acc += x[i] * inv[i][j] * x[j];
  return acc;
};

let worst = 0;
for (const x of [[1, 0, 1], [0, 1, 1], [0.3, -0.05, 1], [5, 5, 1]]) {
  const a = out.leverage(x), b = refLev(x);
  worst = Math.max(worst, Math.abs(a / b - 1));
}
console.log(`  worst disagreement against an independently inverted A: ${worst.toExponential(2)}`);
check('the leverage matches an independently computed x’A⁻¹x',
  worst < 1e-9, `${worst.toExponential(3)}`);

// AND IT BEHAVES LIKE AN EXTRAPOLATION MEASURE. The barely-excited direction must cost far
// more variance than the well-excited one, and a point far outside the data must cost more
// than one inside it. A number that does not do both is not usable as a refusal criterion.
const wellExcited = out.leverage([1, 0, 0]);
const barelyExcited = out.leverage([0, 1, 0]);
const inside = out.leverage([0.3, -0.005, 1]);
const outside = out.leverage([8, 2, 1]);
console.log(`  well-excited ${wellExcited.toExponential(2)}   barely-excited `
  + `${barelyExcited.toExponential(2)} (${(barelyExcited / wellExcited).toFixed(0)}x more)`);
console.log(`  inside the data ${inside.toExponential(2)}   far outside ${outside.toExponential(2)}`
  + ` (${(outside / inside).toFixed(0)}x more)`);
check('a barely-excited direction costs far more variance than a well-excited one',
  barelyExcited > 100 * wellExcited, `${barelyExcited} vs ${wellExcited}`);
check('…and a point far outside the data costs more than one inside it',
  outside > 10 * inside, `${outside} vs ${inside}`);

console.log(failed ? `\nleverage: ${failed} check(s) FAILED\n` : '\nleverage: all checks passed\n');
process.exit(failed ? 1 : 0);
