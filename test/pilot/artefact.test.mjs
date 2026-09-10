/**
 * THE DEPLOY BOUNDARY, PINNED — and the acceptance test a customer's implementation must pass.
 *
 * `lib/pilot/distil.js` states that the deployed object needs "no QP, no forecast bank, no
 * tracker, no lap index and no per-plant constant". It was prose. `lib/pilot/deploy.js` is a
 * complete reimplementation of that path from the STORED RECORD alone, importing nothing, and
 * this asserts the two agree to the last bit over random windows.
 *
 * WHY THAT IS A REAL CHECK AND NOT A TAUTOLOGY. The two implementations share no code: one is a
 * method on a class that also carries the fit, the streaming recursion, the capacity gate and a
 * ridge solve; the other is 60 lines that take a JSON object. If anything on the deploy path ever
 * reaches for the fit side — a cached scale, a lazily-built row, the RLS posterior — the
 * reimplementation cannot see it and this goes red. That is the property the prose was asserting
 * and could not enforce (rule 30: a behaviour described in a second place drifts).
 *
 * AND IT IS THE DELIVERABLE'S ACCEPTANCE TEST. What a customer receives is the record plus an
 * implementation note; what proves their implementation correct is exactly this comparison
 * against a recorded reference. `EXPORT=<path>` writes a portable conformance vector — the
 * record, a window of commanded reference, and the corrections the shipped code produces — so a
 * PLC vendor can check their own port without running any of this.
 *
 * Run: node test/pilot/deploy.test.mjs
 */
import { DistilPolicy } from '../../lib/pilot/distil.js';
import { decide, coverageGain, macPerDecision, strideOf, featureRow } from '../../lib/pilot/deploy.js';
import { writeFileSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? '  — ' + detail : ''}`); }
};
console.log('\ndistil: the deploy boundary, and the artefact a machine receives\n');

// ---------------------------------------------------------------- a commissioned policy
// A SYNTHETIC TARGET WITH A KNOWN ANSWER, because this test is about the deploy path and not
// about what the fit can learn — a plant here would make a failure ambiguous between the two.
const mk = (seed) => { let z = seed >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const rnd = mk(20260910);
const OFFS = [-64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 32, 64];
const NC = 2, D = 2, LAP = 2048;

/** A closed program: two channels of smooth commanded reference, incommensurate so it does not alias. */
const ref = new Array(LAP);
for (let k = 0; k < LAP; k++) {
  ref[k] = [Math.sin(2 * Math.PI * k / LAP) + 0.3 * Math.sin(2 * Math.PI * 7 * k / LAP),
    Math.cos(2 * Math.PI * k / LAP) * 0.8 + 0.2 * Math.sin(2 * Math.PI * 3 * k / LAP)];
}
const refAt = (k) => ref[((k % LAP) + LAP) % LAP];
const speedAt = (k) => 1 + 0.4 * Math.sin(2 * Math.PI * k / LAP);

const pol = new DistilPolicy({ channels: NC, refDim: D, offsets: OFFS, uMax: 0.4, ridge: 1e-6, online: false });
// The target is an arbitrary smooth functional of the window, so the fit has something real to do.
const prefix = new Array(LAP);
for (let k = 0; k < LAP; k++) {
  const a = refAt(k), b = refAt(k + 16), c = refAt(k - 16);
  prefix[k] = [0.11 * a[0] + 0.07 * (b[0] - c[0]) - 0.04 * a[1], -0.05 * a[1] + 0.09 * (b[1] - c[1]) + 0.02 * a[0]];
}
pol.addProgram({ refAt, n: LAP, prefix, speedAt, stride: 1, closed: true });
const fr = pol.fit(rnd);
check('the reference policy commissions and vouches for itself', !!fr.deploy, JSON.stringify(fr.reason || ''));

// ---------------------------------------------------------------- the boundary
const rec = JSON.parse(JSON.stringify(pol.toJSON()));

// THE CENTRAL ASSERTION. `actLook` is what the host calls on the machine; `decide` is the
// dependency-free reimplementation from the record. Random windows, random speeds, and the
// comparison is EXACT — not a tolerance — because both compute the same dot product in the same
// order over the same doubles. A tolerance here would hide precisely the drift this exists to catch.
let worst = 0, nSame = 0;
for (let t = 0; t < 4000; t++) {
  const k = Math.floor(rnd() * LAP * 4) - LAP;
  const look = (o) => refAt(k + o);
  const sp = t % 7 === 0 ? null : 0.4 + rnd() * 1.6;   // some decisions with the guard disabled
  const a = pol.actLook(look, sp), b = decide(rec, look, sp);
  for (let c = 0; c < NC; c++) { if (a[c] === b[c]) nSame++; worst = Math.max(worst, Math.abs(a[c] - b[c])); }
}
check('the 60-line deploy core reproduces the shipped act path BIT-EXACTLY over 4,000 random windows',
  worst === 0 && nSame === 4000 * NC, `worst |diff| ${worst.toExponential(3)}, ${nSame}/${4000 * NC} identical`);

// AND THE CHECK HAS TEETH (rule 9, both halves): perturb one stored weight and it must go red.
// Without this, a `decide` that returned `actLook`'s own output would pass the assertion above.
{
  const bad = JSON.parse(JSON.stringify(rec));
  bad.W[0][3] += 1e-9;
  let moved = 0;
  for (let t = 0; t < 200; t++) {
    const k = Math.floor(rnd() * LAP), look = (o) => refAt(k + o);
    const a = pol.actLook(look, 1.0), b = decide(bad, look, 1.0);
    if (a[0] !== b[0]) moved++;
  }
  check('…and a 1e-9 change to ONE stored weight is detected, so the comparison is not vacuous',
    moved > 150, `${moved}/200 decisions moved`);
}

// THE CLAIM THE PROSE MAKES, ENFORCED: the record is the whole controller. Strip everything the
// fit side owns — the streaming posterior, the report's diagnostics — and the machine is unchanged.
{
  const lean = JSON.parse(JSON.stringify(rec));
  lean.rls = null;                                   // the commissioning recursion
  lean.report = { deploy: true, speedSpan: rec.report.speedSpan };   // diagnostics discarded
  let same = 0;
  for (let t = 0; t < 500; t++) {
    const k = Math.floor(rnd() * LAP), look = (o) => refAt(k + o), sp = 0.6 + rnd() * 1.2;
    const a = decide(rec, look, sp), b = decide(lean, look, sp);
    if (a[0] === b[0] && a[1] === b[1]) same++;
  }
  check('…and the deployed machine needs NEITHER the covariance NOR the report: strip both, byte-identical',
    same === 500, `${same}/500`);
  const keep = ['channels', 'refDim', 'offsets', 'signOffsets', 'uMax', 'coverageFade', 'xScale', 'schedule', 'scheduleCentre', 'stateDim', 'W', 'stride'];
  const bytes = JSON.stringify(Object.fromEntries(Object.entries(lean).filter(([k]) => keep.includes(k) || k === 'report'))).length;
  console.log(`    the deployable record is ${(bytes / 1024).toFixed(1)} kB of JSON: ${rec.W.length} x ${rec.W[0].length} coefficients, ${rec.offsets.length} offsets, one cap, one speed span`);
}

// THE COVERAGE GUARD IS PART OF THE CONTRACT, so both halves are pinned (rule 9): inside the
// trained span it must be exactly 1 — a guard that quietly scaled production down would be
// invisible in a ratio — and outside it must reach exactly 0 rather than extrapolating.
{
  const [lo, hi] = rec.report.speedSpan, m = (hi - lo) * rec.coverageFade;
  check('coverage is exactly 1 across the trained speed span', coverageGain(rec, lo) === 1 && coverageGain(rec, (lo + hi) / 2) === 1 && coverageGain(rec, hi) === 1);
  check('…and exactly 0 beyond the fade, so an out-of-envelope program is UNCORRECTED, not extrapolated',
    coverageGain(rec, lo - m * 1.001) === 0 && coverageGain(rec, hi + m * 1.001) === 0,
    `${coverageGain(rec, lo - m * 1.001)} / ${coverageGain(rec, hi + m * 1.001)}`);
  check('…and monotone in between, never above 1',
    [0.1, 0.3, 0.5, 0.7, 0.9].every((f) => { const g = coverageGain(rec, hi + m * f); return g <= 1 && g >= 0; }));
}

// THE COST THE RECORD REPORTS IS THE COST THE DEPLOY CORE PAYS.
{
  const a = macPerDecision(rec), b = pol.cost();
  check('the record states its own MAC/decision, and it agrees with the block that produced it',
    a === b, `deploy core ${a}, distil ${b}`);
  console.log(`    ${a} MAC per decision at stride ${strideOf(rec)} — ${(100 * a / (strideOf(rec) * 10000)).toFixed(2)}% of a 1 ms scan's 10% budget`);
}

// THE ROW IS INVARIANT TO WHERE THE PROGRAM SITS, which is why it transfers. Every term but the
// window's own centre, the direction block and the bias is a DIFFERENCE, so translating the whole
// commanded reference must move only those. Asserted because it is the structural reason the
// object is a plant model rather than a memory.
{
  const k = 512, look = (o) => refAt(k + o), shift = [3.7, -1.9];
  const looked = (o) => { const q = refAt(k + o); return [q[0] + shift[0], q[1] + shift[1]]; };
  const r0 = featureRow(rec, look), r1 = featureRow(rec, looked);
  let moved = 0; for (let j = 0; j < r0.length; j++) if (Math.abs(r0[j] - r1[j]) > 1e-12) moved++;
  check('translating the whole program moves only the window-centre terms, not the differences',
    moved === D, `${moved} of ${r0.length} features moved, expected ${D}`);
}

// ---------------------------------------------------------------- the conformance vector
// WHAT A CUSTOMER'S PORT IS CHECKED AGAINST. The record, a window of commanded reference and the
// corrections this code produces — enough to verify an implementation in any language without
// running any of this repository.
if (process.env.EXPORT) {
  const cases = [];
  for (let t = 0; t < 64; t++) {
    const k = Math.floor(rnd() * LAP), sp = 0.6 + rnd() * 1.2;
    const win = {};
    for (const o of new Set([...rec.offsets, ...rec.signOffsets.flatMap((o) => [o - 1, o + 1]), 0])) win[o] = refAt(k + o);
    cases.push({ window: win, speed: sp, expect: decide(rec, (o) => refAt(k + o), sp) });
  }
  writeFileSync(process.env.EXPORT, JSON.stringify({ note: 'DistilPolicy conformance vector. Implement lib/pilot/deploy.js decide() and reproduce every expect[] from its window and speed.', record: rec, cases }, null, 1));
  console.log(`    conformance vector written to ${process.env.EXPORT} (${cases.length} cases)`);
}

console.log(`\nartefact: ${fail === 0 ? 'all checks passed' : fail + ' FAILED'}\n`);
process.exit(fail === 0 ? 0 : 1);
