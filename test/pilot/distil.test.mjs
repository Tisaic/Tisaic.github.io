/**
 * @file THE DISTILLED POLICY'S CONTRACT — plan §49, shipped as `lib/pilot/distil.js`.
 *
 * This runs on a SYNTHETIC reference and a SYNTHETIC converged prefix, not on the arm, and that
 * is deliberate. What has to be pinned here is the BLOCK: that fit and deploy build the same row,
 * that a misconfigured window is refused rather than fitted, that a fit which has learned its own
 * dictionary is refused rather than deployed, that the authority cap and the coverage fade do what
 * they say, and that `cost()` is the arithmetic the block actually performs. None of that needs a
 * plant, and a contract test that needs fifteen minutes of lattice does not get run — which is how
 * three defects in this repository survived (`composite.test.mjs` at thirteen minutes).
 *
 * The arm's DELIVERED numbers live in `docs/plan.md` §49 and are measured on the machine. This
 * file deliberately makes no performance claim.
 *
 * THE SHARPEST CHECK HERE IS THE TRAIN/DEPLOY SKEW ONE. The prefix is generated as an EXACT
 * linear function of the deployed window, so a correct block recovers it to solver precision and
 * `act()` reproduces it. A one-sample offset between the fitting row and the deployed row leaves
 * the fit looking excellent and the delivery wrong — which is exactly the defect the distillation
 * harness shipped and which was invisible in its command-only mode.
 */

import { DistilPolicy } from '../../lib/pilot/distil.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};

console.log('\ndistil: the distilled policy contract');

const OFFS = [-64, -32, -8, -2, 0, 2, 8, 32, 64];
const SOFF = [-8, 0, 8];
const N = 4000;
// A reference with two incommensurate tones per channel, so the window is never rank-deficient
// and no offset is a copy of another (rule 36's reason, applied to a synthetic).
const refAt = (k) => [Math.sin(k * 0.0031) + 0.4 * Math.sin(k * 0.0107 + 1.1),
  Math.cos(k * 0.0043) + 0.3 * Math.sin(k * 0.0071 + 0.3)];
const speedAt = (k) => 1 + 0.5 * Math.sin(k * 0.0009);

// ---- 1. THE STRUCTURAL REFUSAL, BOTH HALVES (rule 9)
let threw = null;
try { new DistilPolicy({ channels: 2, offsets: [-64, -32, -8, 0], signOffsets: SOFF }); }
catch (e) { threw = e; }
check('a causal-only window is REFUSED, not fitted', threw !== null,
  'plan §49.14 measures causal-only at 0.89x, worse than doing nothing');
let ok2 = true;
try { new DistilPolicy({ channels: 2, offsets: OFFS, signOffsets: SOFF }); } catch { ok2 = false; }
check('…and a straddling window is accepted', ok2, 'the other half — the guard must not refuse everything');

// ---- 2. FIT AND DEPLOY BUILD THE SAME ROW
const p = new DistilPolicy({ channels: 2, offsets: OFFS, signOffsets: SOFF, ridge: 1e-10, uMax: 10 });
const nF = p.nFeatures;
check('nFeatures matches the counted formula', nF === 2 + 2 * (OFFS.length - 1) + 2 * 2 * SOFF.length + 1,
  `${nF}`);
// a known linear functional of the deployed row, per channel
const TRUE = [0, 1].map((c) => Float64Array.from({ length: nF }, (_, j) => Math.sin(j * 1.7 + c) * 0.01));
const rowOf = (k) => p._row(refAt, k, null);
const prefix = new Array(N).fill(null);
for (let k = 65; k < N; k++) {
  const r = rowOf(k);
  prefix[k] = [0, 1].map((c) => r.reduce((a, v, j) => a + v * TRUE[c][j], 0));
}
const used = p.addProgram({ refAt, n: N, prefix, speedAt });
const rep = p.fit(() => 0.5);
check('the fit deploys on a signal it can represent', rep.deploy === true, rep.reason || '');
check('…on a HELD-OUT score, through leakage-safe folds', rep.heldOutR2.every((v) => v > 0.99)
  && rep.foldKind.includes('gap'), `${JSON.stringify(rep.heldOutR2)} ${rep.foldKind}`);
check('…and recovers it to solver precision', rep.fitR2.every((v) => v > 0.9999),
  rep.fitR2.map((v) => v.toFixed(6)).join(' / '));
// THE SKEW CHECK: act() at k must equal the prefix the fit was given at k.
let worst = 0;
for (let k = 200; k < N - 200; k += 37) {
  const a = p.act(refAt, k, speedAt(k));
  for (let c = 0; c < 2; c++) worst = Math.max(worst, Math.abs(a[c] - prefix[k][c]));
}
check('act() reproduces the fitted prefix — no train/deploy skew', worst < 1e-6, `worst ${worst.toExponential(2)}`);
console.log(`    ${used} rows, ${nF} features, fit R² ${rep.fitR2.map((v) => v.toFixed(6)).join(' / ')}`);

// ---- 3. THE CAPACITY REFUSAL, BOTH HALVES
const q = new DistilPolicy({ channels: 2, offsets: OFFS, signOffsets: SOFF, ridge: 1e-10 });
const noise = new Array(N).fill(null);
let z = 7;
const rnd = () => { z = (z * 1664525 + 1013904223) >>> 0; return z / 4294967296; };
for (let k = 65; k < N; k++) noise[k] = [rnd() - 0.5, rnd() - 0.5];
q.addProgram({ refAt, n: N, prefix: noise });
const qr = q.fit(rnd);
check('a fit that has learned only its dictionary is REFUSED', qr.deploy === false,
  `held-out ${JSON.stringify(qr.heldOutR2)} in-sample ${JSON.stringify(qr.fitR2)}`);
check('…and a refused policy applies exactly nothing', q.act(refAt, 500).every((v) => v === 0),
  'a refusal that still moves the machine is not a refusal');
console.log(`    noise target: in-sample R² ${qr.fitR2.map((v) => v.toFixed(3)).join(' / ')}`
  + `  held-out ${qr.heldOutR2.map((v) => v.toFixed(3)).join(' / ')}`
  + `  null ${qr.controlR2.map((v) => v.toFixed(3)).join(' / ')}  (${qr.foldKind})`);
// THE GATE IS A PRE-FILTER, and its residual rate is pinned here rather than left to be
// discovered: on a pure-noise target it deploys about one commissioning in twelve. The decision
// this library actually ships on is a machine-scored verify, and this check exists so nobody
// reads the gate as the safety case.
check('the gate reports held-out and null scores so its own margin is legible',
  Array.isArray(qr.heldOutR2) && Array.isArray(qr.controlR2) && typeof qr.foldKind === 'string',
  JSON.stringify(qr));

// ---- 4. AUTHORITY
const tight = new DistilPolicy({ channels: 2, offsets: OFFS, signOffsets: SOFF, ridge: 1e-10, uMax: 1e-4 });
tight.addProgram({ refAt, n: N, prefix, speedAt });
tight.fit(() => 0.5);
let over = 0;
for (let k = 200; k < N - 200; k += 23) for (const v of tight.act(refAt, k, speedAt(k))) over = Math.max(over, Math.abs(v));
check('the correction never exceeds the engineer\'s authority', over <= 1e-4 + 1e-15, `${over.toExponential(3)}`);

// ---- 5. THE COVERAGE FADE, BOTH HALVES
const [lo, hi] = rep.speedSpan;
const inside = p.act(refAt, 1500, (lo + hi) / 2);
const ref0 = p.act(refAt, 1500, null);
check('inside the trained speed span the correction is untouched',
  inside.every((v, c) => Math.abs(v - ref0[c]) < 1e-12), 'the fade must not tax the operating range');
const far = p.act(refAt, 1500, hi + 10 * (hi - lo));
check('…and far outside it the correction is faded to zero', far.every((v) => v === 0),
  'measured: 0.75x at half the trained feed and 0.53x at an untrained one, both worse than nothing');
const half = p.act(refAt, 1500, hi + 0.5 * (hi - lo) * p.coverageFade);
const shrunk = half.every((v, c) => Math.abs(v) < Math.abs(ref0[c]) && v !== 0);
check('…fading through a partial value rather than switching', shrunk,
  `${half.map((v) => v.toExponential(2))} against ${ref0.map((v) => v.toExponential(2))}`);
console.log(`    trained speed span ${lo.toFixed(4)} … ${hi.toFixed(4)}, fade over ${p.coverageFade * 100}% beyond`);

// ---- 6. THE STREAMING FIT — whether "nothing offline" is true or false
// Batch ridge stores every row and ends in a Cholesky, which is an offline algorithm; requiring
// it on the PLC kills the product claim outright. The streaming path is one shared-covariance
// update per row — the two channels share a design matrix EXACTLY here (one row, nc targets),
// which is the clean case the pilot's lead bank is NOT — with O(n²) state and no row stored.
const on = new DistilPolicy({ channels: 2, offsets: OFFS, signOffsets: SOFF, ridge: 1e-8, uMax: 10, online: true });
on.addProgram({ refAt, n: N, prefix, speedAt });
const onRep = on.fit();
check('the streaming fit deploys on a signal it can represent', onRep.deploy === true, onRep.reason || '');
check('…scored PREQUENTIALLY, so validation cannot leak by construction',
  onRep.foldKind.startsWith('prequential') && onRep.heldOutR2.every((v) => v > 0.99),
  `${onRep.foldKind} ${JSON.stringify(onRep.heldOutR2)}`);
check('…and it stores no rows', on.X.length === 0, `${on.X.length} rows retained`);
// THE AGREEMENT IS ASSERTED ON THE APPLIED CORRECTION, NOT ON THE WEIGHTS. This design is
// collinear by construction — a smooth reference read at overlapping offsets — so many weight
// vectors give the same predictions, and the two fits differ by 12% in weight space while
// agreeing to five decimal places in what reaches the machine. Comparing weights on a collinear
// design is the wrong instrument, and it would have read as a failure.
let num = 0, den = 0;
for (let k = 200; k < N - 200; k += 13) {
  const ab = p.act(refAt, k), ao = on.act(refAt, k);
  for (let c = 0; c < 2; c++) { num += (ab[c] - ao[c]) ** 2; den += ab[c] ** 2; }
}
const rel = Math.sqrt(num / den);
check('the streaming fit and the batch solve agree on the APPLIED CORRECTION',
  rel < 1e-4, `${(rel * 100).toFixed(5)}% rms`);
const fc = on.fitCost();
check('the fit states its own per-row cost and state size',
  fc.perRow === 2 * nF * nF + nF * 2 && fc.stateBytes === 4 * nF * nF, JSON.stringify(fc));
console.log(`    streaming: ${onRep.rows} rows, prequential R² `
  + `${onRep.heldOutR2.map((v) => v.toFixed(6)).join(' / ')}, agreement `
  + `${(rel * 100).toFixed(5)}% of the applied signal`);
console.log(`    fit ${fc.perRow.toLocaleString()} MAC/ROW in ${(fc.stateBytes / 1024).toFixed(1)} kB `
  + '— per ROW, not per scan: a row arrives once per DECISION, so the caller divides by its own '
  + 'decision stride. Quoting a per-row figure against a per-scan budget is a units error.');

// ---- 7. THE BLOCK STATES ITS OWN SLICE
const mac = p.cost();
const hand = nF * 2 + (2 * (OFFS.length - 1) + 2 * 2 * SOFF.length);
check('cost() is the arithmetic the block performs, hand-counted', mac === hand, `${mac} against ${hand}`);
check('…and it fits 10% of a 1 ms scan', mac < 10000, `${mac} MAC/decision`);
console.log(`    ${mac} MAC/decision for ${p.channels} channels — ${(mac / 100).toFixed(1)}% of budget`);

console.log(failed ? `\ndistil: ${failed} check(s) FAILED\n` : '\ndistil: all checks passed\n');
process.exit(failed ? 1 : 0);
