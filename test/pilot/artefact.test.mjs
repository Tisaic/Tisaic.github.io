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
import { decide, coverageGain, macPerDecision, strideOf, featureRow, explain, logSpec, windowBend } from '../../lib/pilot/deploy.js';
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
// ---------------------------------------------------------------------------------------------
// THE PROPERTIES AN INVESTIGATION DEPENDS ON (plan §77).
//
// The engineer's own statement of what matters: a controller is tuned once and never looked at
// again provided it is stable and well behaved — and if something bad happens, an investigation
// must be able to establish HOW the number was computed. So interpretability of the coefficients
// is the wrong property to test; these four are the right ones, and they are what separates this
// object from a network nobody can reconstruct.
{
  const win = (k) => (o) => refAt(k + o);
  const k0 = 733, sp0 = 0.91;

  // (1) EXACT ATTRIBUTION. The per-term account must sum to the number that was applied, to the
  // LAST BIT — an attribution that only roughly adds up is not evidence. Summed in `decide`'s own
  // order, because floating-point addition is not associative and a reordered sum would disagree
  // in the last bits exactly when an investigation cared.
  const ex = explain(rec, win(k0), sp0);
  const dd = decide(rec, win(k0), sp0);
  let attribExact = true, sumExact = true;
  for (let c = 0; c < rec.channels; c++) {
    if (ex.channels[c].u !== dd[c]) attribExact = false;
    let t = 0; for (const tm of ex.channels[c].terms) t += tm.contribution;
    if (t !== ex.channels[c].raw) sumExact = false;
  }
  check('the forensic account returns exactly what the machine applied', attribExact);
  check('…and its per-term contributions sum to that total BIT-EXACTLY, in the applied order', sumExact);

  // (2) BOTH HALVES (rule 9): the attribution must also be able to FAIL. Perturb one weight and
  // the contribution of that term alone must move, or the account is decorative.
  {
    const r2 = JSON.parse(JSON.stringify(rec));
    const j = 3; r2.W[0][j] *= 1.5;
    const e2 = explain(r2, win(k0), sp0);
    const moved = e2.channels[0].terms.filter((t, i) => t.contribution !== ex.channels[0].terms[i].contribution);
    check('…and it is not decorative: changing ONE weight moves exactly that one term',
      moved.length === 1 && moved[0] === e2.channels[0].terms[j], `${moved.length} term(s) moved`);
  }

  // (3) STATELESS, therefore PREDICTABLE. The same window must give the same number no matter what
  // the object was asked before it — which is what lets an engineer stop looking at it. Asserted
  // by interleaving: A, then a hundred other windows, then A again, bit-identical.
  const first = decide(rec, win(k0), sp0);
  for (let t = 0; t < 100; t++) decide(rec, win(Math.floor(rnd() * LAP)), 0.5 + rnd());
  const again = decide(rec, win(k0), sp0);
  check('it is STATELESS: the same window gives the same number after 100 other decisions',
    first.every((v, c) => v === again[c]));

  // (4) BOUNDED BY THE AUTHORITY, WHATEVER THE PROGRAM DOES. The safety property: no reference,
  // however wrong, can make the correction exceed the cap the engineer set. Driven with windows
  // far outside anything the fit saw — a thousand times the reference's own scale — so this is
  // the adversarial case and not the nominal one.
  let worstAbs = 0, nClamp = 0;
  for (let t = 0; t < 2000; t++) {
    const s = (rnd() < 0.5 ? 1 : -1) * Math.pow(10, 3 * rnd());
    const lk = (o) => refAt(k0 + o).map((v) => v * s * 1e3);
    const u = decide(rec, lk, null);
    for (const v of u) { if (!Number.isFinite(v)) { worstAbs = Infinity; break; } worstAbs = Math.max(worstAbs, Math.abs(v)); }
    if (u.some((v) => Math.abs(v) >= rec.uMax * (1 - 1e-12))) nClamp++;
  }
  check('it is BOUNDED at the engineer\'s authority on 2,000 adversarial windows, and never NaN',
    worstAbs <= rec.uMax * (1 + 1e-12), `worst |u| ${worstAbs} against a cap of ${rec.uMax}`);
  check('…and those windows DID drive it to the cap, so the bound was actually exercised',
    nClamp > 100, `${nClamp} of 2000 clamped`);

  // (4b) A CORRUPTED WINDOW, WHICH IS NOT THE SAME AS AN UNUSUAL ONE — AND WAS A LIVE DEFECT.
  //
  // (4) drove finite-but-huge windows and found the bound held. That was the easy half: every
  // comparison with NaN is FALSE, so the clamp `s > cap ? cap : s < -cap ? -cap : s` passed a NaN
  // straight through to the machine — rule 55 on the deploy path, measured at a NaN correction
  // before the fix while an Inf happened to clamp because `Infinity > cap` is true. A sensor or a
  // program that hands this object a corrupted look-ahead is exactly the case an engineer who
  // never looks again gets burned by, so it is checked rather than assumed.
  {
    let worstBad = null, allZero = true;
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const off of [rec.offsets[0], 0, rec.offsets[rec.offsets.length - 1]]) {
        const lk = (o) => { const v = refAt(k0 + o).slice(); if (o === off) v[0] = bad; return v; };
        const u = decide(rec, lk, sp0);
        for (const v of u) { if (!Number.isFinite(v)) worstBad = v; if (v !== 0) allZero = false; }
      }
    }
    check('a NON-FINITE window never reaches the machine: NaN and ±Inf at any offset',
      worstBad === null, `got ${worstBad}`);
    check('…and the fallback is NO CORRECTION, so it degrades to the machine below (rule 26: '
      + 'zero is the right action here, not a sentinel)', allZero);
  }

  // (4c) A WINDOW THAT IS WRONG BUT FINITE — the corruption guard (plan §78).
  //
  // (4b) closed the non-finite case. The one that actually costs is a single CORRUPTED TAP: it
  // moves the applied correction by 106% of its own rms and past the cap, where a frozen input
  // costs 5.4% and an off-by-one lap phase 0.2%. The guard is a smoothness ratio whose threshold
  // is the worst bend the COMMISSIONING ITSELF saw, stored beside the speed span.
  {
    const bm = rec.report.bendMax;
    check('the commissioning recorded its own worst window bend', bm > 0, `bendMax ${bm}`);

    // The two implementations must agree, which is what this file exists for.
    let bendSame = true;
    for (let t = 0; t < 200; t++) {
      const k = Math.floor(rnd() * LAP);
      if (windowBend(rec, win(k)) !== pol.bendOf(win(k))) bendSame = false;
    }
    check('…and the deploy-side bend matches the fit-side bend exactly over 200 windows', bendSame);

    // BOTH HALVES (rule 9). It must fire on a corrupted tap AND leave healthy windows alone —
    // a guard that refuses everything is not a guard, and one that refuses nothing is not either.
    let firedBad = 0, firedGood = 0;
    for (let t = 0; t < 500; t++) {
      const k = Math.floor(rnd() * LAP);
      if (decide(rec, win(k), sp0).every((v) => v === 0)) firedGood++;
      const off = rec.offsets[3 + (t % (rec.offsets.length - 6))];
      const lk = (o) => { const v = refAt(k + o).slice(); if (o === off) v[0] *= 7; return v; };
      if (decide(rec, lk, sp0).every((v) => v === 0)) firedBad++;
    }
    check('the guard FIRES on a single corrupted tap', firedBad > 480, `${firedBad}/500`);
    check('…and does NOT fire on healthy windows', firedGood === 0, `${firedGood}/500 refused`);

    // HOW WIDE THE USABLE BAND ACTUALLY IS, measured rather than asserted. A first version of this
    // claimed the verdict was flat across a 64-fold sweep, on numbers from a scratch record with
    // different offsets and a different reference; on THIS record it is flat over about eight-fold
    // and then the detection falls away. The band is printed so its edges are visible rather than
    // hidden behind a pass.
    //
    // AND THE HEALTHY HALF IS SCORED ON A PROGRAM THE FIT NEVER SAW, which is the test that
    // matters: `bendMax` is the worst bend of the TRAINING windows, and the whole point of this
    // object is that it runs on programs it was not commissioned on. A guard calibrated in sample
    // and checked in sample would be two wrongs agreeing (rule 15).
    const unseen = new Array(LAP);
    for (let k = 0; k < LAP; k++) {
      const t = 2 * Math.PI * k / LAP;       // a different shape, different harmonics, same scale
      unseen[k] = [0.55 * Math.sin(2 * t + 0.7) + 0.25 * Math.sin(5 * t), 0.45 * Math.cos(3 * t) + 0.2 * Math.sin(t)];
    }
    const uAt = (k) => unseen[((k % LAP) + LAP) % LAP];
    const verdicts = [];
    for (const m of [1, 2, 4, 8, 16, 32, 64]) {
      const r2 = JSON.parse(JSON.stringify(rec)); r2.bendMargin = m;
      let gSeen = 0, gUnseen = 0, b = 0;
      for (let t = 0; t < 200; t++) {
        const k = Math.floor(rnd() * LAP);
        if (decide(r2, win(k), sp0).every((v) => v === 0)) gSeen++;
        if (decide(r2, (o) => uAt(k + o), sp0).every((v) => v === 0)) gUnseen++;
        const lk = (o) => { const v = refAt(k + o).slice(); if (o === rec.offsets[4]) v[0] *= 7; return v; };
        if (decide(r2, lk, sp0).every((v) => v === 0)) b++;
      }
      verdicts.push({ m, gSeen, gUnseen, b });
    }
    console.log('      margin   false-refusals in sample / on an UNSEEN program   corrupted-tap catches');
    for (const v of verdicts) {
      console.log(`        ${String(v.m).padStart(3)}        ${String(v.gSeen).padStart(3)}/200  ${String(v.gUnseen).padStart(3)}/200`
        + `                        ${String(v.b).padStart(3)}/200`);
    }
    const dflt = verdicts.find((v) => v.m === 8);
    check('at the shipped margin the guard refuses NO healthy window, in sample OR on a program '
      + 'the fit never saw', dflt.gSeen === 0 && dflt.gUnseen === 0,
      `${dflt.gSeen} in sample, ${dflt.gUnseen} unseen`);
    const band = verdicts.filter((v) => v.gSeen === 0 && v.gUnseen === 0 && v.b >= 190);
    check('…and the band where that holds AND the corruption is still caught spans at least 4x',
      band.length >= 3, `margins ${band.map((v) => v.m).join(',') || 'none'}`);

    // WHAT IT COSTS, stated rather than hidden — it runs on every decision.
    const nInt = Math.max(0, rec.offsets.length - 2);
    const guardMac = nInt * (3 * rec.refDim + 2);
    console.log(`    the guard costs about ${guardMac} MAC per decision on top of `
      + `${macPerDecision(rec)} — ${(100 * guardMac / macPerDecision(rec)).toFixed(0)}% more, `
      + `and it is what stops a 106%-of-rms excursion reaching the machine`);
  }

  // (5) REPLAYABLE FROM THE LOG ALONE. `logSpec` states what an installation has to record; a
  // decision rebuilt from ONLY those fields must reproduce the original bit-exactly, or the log
  // is not sufficient for an investigation and the spec is wrong.
  const spec = logSpec(rec);
  const logged = {};
  for (const o of spec.lookOffsets) logged[o] = refAt(k0 + o).slice();
  const replay = decide(rec, (o) => {
    if (!(o in logged)) throw new Error(`the log spec omitted offset ${o}`);
    return logged[o];
  }, spec.needsSpeed ? sp0 : null);
  check('a decision REPLAYS bit-exactly from the logged fields alone, and from nothing else',
    replay.every((v, c) => v === dd[c]),
    `${spec.numbersPerDecision} numbers per decision over ${spec.lookOffsets.length} offsets`);
  console.log(`    a log of ${spec.numbersPerDecision} numbers per decision `
    + `(${spec.lookOffsets.length} offsets x ${spec.refDim} channels`
    + `${spec.needsSpeed ? ' + speed' : ''}) makes every decision reconstructible`);
}

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
