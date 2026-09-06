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
check('nFeatures matches the counted formula', nF === 2 * OFFS.length + 2 * 2 * SOFF.length + 1, `${nF}`);
// THE REFERENCE DIMENSION IS NOT THE CHANNEL COUNT. This module shipped reading `q0[0], q0[1]`
// literally while its direction block looped over `channels`, so it was silently wrong on any
// plant that is not two-dimensional. A single-axis plant is the cheapest case that catches it.
const one = new DistilPolicy({ channels: 1, refDim: 1, offsets: OFFS, signOffsets: SOFF });
check('a single-axis plant gets a correctly sized row, not a two-axis one',
  one.nFeatures === OFFS.length + 2 * SOFF.length + 1, `${one.nFeatures}`);
check('…and its row is actually that long when built', 
  one._row((k) => [Math.sin(k * 0.01)], 500, null).length === one.nFeatures,
  `${one._row((k) => [Math.sin(k * 0.01)], 500, null).length} vs ${one.nFeatures}`);
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

// ---- 5b. THE TWO READERS, AND THE PLACE THEY MUST DISAGREE (rule 9)
// `act` indexes a finite record and clamps the window at its start; `actLook` is driven by a
// host's look-ahead closure, where a negative offset is an ordinary request for the past and
// clamping it would silently feed the row the present instead. Away from the boundary they must
// agree exactly — same arithmetic — and at the boundary they must NOT, or the clamp is not doing
// the job the absolute form needs it for.
const look = (k) => (o) => refAt(k + o);
let readerGap = 0;
for (let k = 800; k < N - 800; k += 53) {
  const a = p.act(refAt, k, speedAt(k)), b = p.actLook(look(k), speedAt(k));
  for (let c = 0; c < 2; c++) readerGap = Math.max(readerGap, Math.abs(a[c] - b[c]));
}
check('away from a record boundary the two readers agree exactly', readerGap < 1e-12,
  `worst ${readerGap.toExponential(2)}`);
const nearA = p.act(refAt, 3, speedAt(3)), nearB = p.actLook(look(3), speedAt(3));
check('…and at the boundary they differ, because only one of them may clamp',
  nearA.some((v, c) => Math.abs(v - nearB[c]) > 1e-12),
  'if these agree the absolute form is not clamping and its window reads off the record');

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

// ---- 8. THE RUNG IS REACHABLE FROM THE ONE PRESS (plan §§49-50)
// The block existed and `autostack.js` could not get to it, so the one press did not reach it —
// which meant a validated component and not a product. This is a WIRING check on a synthetic
// plant, deliberately: the performance claim is carried by §50 on the EMPS axis, and this
// project has already paid once for asserting performance in the wrong harness. What only this
// can break is whether the rung runs, deploys and CONTRIBUTES THROUGH act().
const { AutoStack } = await import('../../lib/pilot/autostack.js');
const runLap2 = (corr, a) => {
  let s = 0;
  for (let k = 0; k < 900; k++) { const e = 0.01 * Math.sin(k * 0.01) - (corr ? corr.at(k)[0] : 0); s += e * e; }
  return { score: Math.sqrt(s / 900), err: [new Float64Array(900)] };
};

// A plant whose error is an exact linear functional of the reference window, so a converged
// lap-periodic correction exists and its distillation is representable.
const LAP = 900;
const pref = (k) => [Math.sin(2 * Math.PI * ((k % LAP) + LAP) % LAP / LAP)
  + 0.3 * Math.sin(6 * Math.PI * (((k % LAP) + LAP) % LAP) / LAP)];
const KERN = [[-9, 0.4], [-3, -0.7], [0, 1.0], [4, 0.5], [11, -0.3]];
const trueErr = (k) => KERN.reduce((a, [o, w]) => a + w * pref(k + o)[0], 0) * 0.05;
const runLap = (corr) => {
  const e = new Float64Array(LAP);
  let s = 0;
  for (let k = 0; k < LAP; k++) {
    e[k] = trueErr(k) - (corr ? corr.at(k)[0] : 0) - (auto.deployed.distil
      ? auto.act({ look: (o) => pref(k + o) })[0] : 0);
    s += e[k] * e[k];
  }
  return { score: Math.sqrt(s / LAP), err: [e] };
};
const auto = new AutoStack({
  channels: [{ max: 10 }], uMax: 1, resolve: 1e-9,
  distil: { offsets: [-16, -8, -4, -2, 0, 2, 4, 8, 16], signOffsets: [0], ridge: 1e-9 },
});
const host = {
  run: async (corr) => runLap(corr),
  distilRuns: () => [0, 1, 2].map((i) => {
    const ph = 0.7 * i, amp = 1 + 0.25 * i;
    const rf = (k) => [amp * Math.sin(2 * Math.PI * (((k % LAP) + LAP) % LAP) / LAP + ph)
      + 0.3 * Math.sin(6 * Math.PI * (((k % LAP) + LAP) % LAP) / LAP)];
    const te = (k) => KERN.reduce((a, [o, w]) => a + w * rf(k + o)[0], 0) * 0.05;
    return { lap: LAP, refAt: rf,
      run: async (corr) => {
        const e = new Float64Array(LAP); let s = 0;
        for (let k = 0; k < LAP; k++) { e[k] = te(k) - (corr ? corr.at(k)[0] : 0); s += e[k] * e[k]; }
        return { score: Math.sqrt(s / LAP), err: [e] };
      } };
  }),
};
const arep = await auto.commission(host);
const drow = arep.rungs.find((r) => r.name.startsWith('②d'));
console.log(`    rung: ${drow ? drow.name : '(absent)'}`
  + `${drow ? '  ' + drow.score.toExponential(3) : ''}`);
// The training gains are astronomical BY CONSTRUCTION and are not a result: this plant's error
// is an exact linear functional of its own reference window, so the lap-periodic rung drives it
// to numerical zero. That is what makes it a clean wiring substrate and what disqualifies it as
// a performance claim — §50 carries that, on a real axis.
console.log(`    training gains ${arep.distil && arep.distil.runs
  ? arep.distil.runs.map((c) => c.gain.toExponential(1)).join(' ') : '(no runs)'}`
  + ` (exactly representable by construction — a wiring substrate, not a measurement)`
  + `   deployed ${auto.deployed.distil}`);
check('the distilled rung is REACHED by commission() and produces a row',
  !!drow, JSON.stringify(arep.rungs.map((r) => r.name)));
check('…having actually converged its training runs rather than dropping them',
  arep.distil && arep.distil.runs && arep.distil.runs.every((c) => !c.dropped),
  JSON.stringify(arep.distil && arep.distil.runs));
check('…and it DEPLOYS on a plant whose error its window can represent',
  auto.deployed.distil === true, drow ? drow.note : '');
check('…and contributes through act() on the host\'s own look-ahead closure, which is what a '
  + 'rung that is armed but never reached would not',
  Math.abs(auto.act({ look: (o) => pref(500 + o) })[0]) > 1e-6,
  `${auto.act({ look: (o) => pref(500 + o) })[0]}`);
// ---- KEEPING THE TRACKER ON: THE SAME RECURSION, CONTINUED.
//
// The commissioning fit streams, so the estimator that produced `W` is still here and can be
// handed more rows. That is what lets a distil-only controller offer "the tracker stays on the
// machine" as a real option rather than a dead switch — the pilot's RLS is 72,600 MAC/sample
// and does not fit a scan unsliced; this one is paid per DECISION.
//
// BOTH HALVES (rule 9). It must LEARN from a row it should, and REFUSE the rows it must not:
// outside the trained speed span the correction is already faded, so the target was never
// actually commanded and learning there fits the fade rather than the plant.
{
  const look = (o) => pref(700 + o);
  const pol = auto.built.distil;
  const w0 = Float64Array.from(pol.W[0]);
  const u0 = pol.actLook(look, null)[0];

  // A residual the block is told about must move the estimate — and toward removing it.
  const learned = pol.observe(look, null, [u0], [0.02]);
  const u1 = pol.actLook(look, null)[0];
  check('with the tracker left on, an observed residual is learned from and moves the applied '
    + 'correction toward removing it',
    learned && u1 > u0 && pol.adapted() === 1, `${u0} -> ${u1}, learned ${learned}`);

  // …and it is the SAME recursion, so the commissioned posterior is its prior rather than a
  // second estimate accumulated beside it.
  const drift = Math.max(...pol.W[0].map((v, i) => Math.abs(v - w0[i])));
  check('…as the same shared-covariance recursion the fit used, seeded by what it commissioned',
    drift > 0 && Number.isFinite(drift), `largest weight move ${drift}`);

  // THE REFUSALS. A non-finite reading, a wrong channel count, and a speed outside the span
  // the fit saw must all leave the estimate untouched — a row learned from any of them is a
  // row whose target the block never commanded.
  const n0 = pol.adapted();
  const bad = [
    pol.observe(look, null, [u1], [NaN]),
    pol.observe(look, null, [u1], []),
    pol.observe(look, null, [Infinity], [0.01]),
  ];
  check('…while a non-finite reading or a wrong channel count is REFUSED, not learned from',
    bad.every((b) => b === false) && pol.adapted() === n0, JSON.stringify(bad));

  // The speed gate, on a policy whose fit actually saw a span.
  const span = pol.report.speedSpan;
  if (span) {
    const outside = pol.observe(look, span[1] + 10 * (span[1] - span[0] + 1), [u1], [0.01]);
    check('…and a row commanded outside the trained speed span is refused, because the '
      + 'correction there is already faded and its target was never commanded',
      outside === false, `span ${JSON.stringify(span)}`);
  } else {
    console.log('    (no speed span on this substrate — the fade gate is exercised on the arm)');
  }
}

// ---- SAVE AND RESTORE: THE DEPLOYED OBJECT, EXACTLY.
//
// A page that keeps the last commissioned model across reloads is only as good as the
// restore being BIT-IDENTICAL on what reaches the machine. Asserted on the applied
// correction rather than the weights, for the same reason the batch/streaming agreement is:
// what matters is what the machine gets. And the recursion must survive too, or a restored
// policy silently loses the ability the page offers as "the tracker stays on".
{
  const pol = auto.built.distil;
  const j = JSON.parse(JSON.stringify(pol.toJSON()));
  const back = DistilPolicy.fromJSON(j);
  const look = (o) => pref(320 + o);
  const a = pol.actLook(look, null), b = back.actLook(look, null);
  check('a policy survives JSON and restores to the SAME applied correction, bit for bit',
    a.length === b.length && a.every((v, i) => v === b[i]), `${a} vs ${b}`);
  check('…with its coverage span and report intact, so the fade and the deploy verdict '
    + 'restore with it', back.report.deploy === pol.report.deploy
    && back._sLo === pol._sLo && back._sHi === pol._sHi, JSON.stringify(back.report));
  const l2 = back.observe(look, null, b, [0.01]);
  check('…and the recursion restores with it, so a restored policy can still learn',
    l2 === true && back.adapted() === pol.adapted() + 1, `learned ${l2}`);
  let threw = false;
  try { DistilPolicy.fromJSON({ v: 0 }); } catch { threw = true; }
  check('…while a record it does not recognise is REFUSED rather than half-restored', threw);
}

// ---- THE WINDOW IS IN RAW SAMPLES, AND A DECIMATED LOOK-AHEAD IS A DIFFERENT GRID.
//
// The cascade's `ctx.look` steps by the pilot's own cadence, because that is the grid its
// forecast lives on; this rung's offsets are raw machine steps, because what it regresses is a
// prefix indexed by them. On a plant with no cascade the two closures are the same function,
// which is why this could not be seen on the axis the rung was first built on and would have
// stretched the window by the cadence on the next one. Both halves (rule 9): the rung must
// PREFER the raw closure where one is offered, and be byte-identical where it is not.
{
  const raw = (o) => pref(500 + o);
  const dec = (o) => pref(500 + 9 * o);          // the same shape on a stride-9 grid
  const only = auto.act({ look: raw })[0];
  const both = auto.act({ look: dec, lookRaw: raw })[0];
  const wrong = auto.act({ look: dec })[0];
  check('the distilled rung reads ctx.lookRaw where the host offers one, so a decimated '
    + 'cascade cadence cannot stretch a window fitted in raw samples',
    both === only && Math.abs(wrong - only) > 1e-9,
    `raw ${only}, lookRaw ${both}, decimated-only ${wrong}`);
}

// ---- ARMING IS NOT COMMISSIONING, AND THE LADDER HAS TO SAY SO IN BOTH DIRECTIONS.
//
// `built.*` and `deployed.*` were always separate here — the ladder keeps every rung it
// commissioned whether or not it shipped it — but the only way to move a rung between them
// was two assignments at the call site, and setting the FLAG without the OBJECT arms a rung
// that is not there: `act()` is guarded, so it contributes zero silently and reads exactly
// like a rung that helped nothing. `setArmed` is the door, and these are its two halves.
{
  const look = (o) => pref(500 + o);
  const on = auto.act({ look })[0];
  const dis = auto.setArmed('distil', false);
  const off = auto.act({ look })[0];
  const re = auto.setArmed('distil', true);
  const back = auto.act({ look })[0];
  check('disarming a built rung silences it on the very next act(), with nothing rebuilt',
    !dis.armed && off === 0 && Math.abs(on) > 1e-6, `${on} -> ${off}`);
  // RULE 21 IN ITS STRONGEST FORM: the thing that should not change comes back unchanged.
  // A re-arm that merely restored a similar correction would be a rung re-derived from
  // whatever state was lying about, which is the whole failure this door exists to close.
  check('…and re-arming it restores the SAME correction, bit for bit — no recommissioning',
    re.armed && back === on, `${on} vs ${back}`);
  const bad = auto.setArmed('hff', true);
  check('…while arming a rung that was never built is REFUSED with a reason, not ignored',
    !bad.armed && typeof bad.why === 'string' && !auto.deployed.hff, JSON.stringify(bad));
  const a = auto.armed();
  check('…and armed() states what each rung is addressed by, which is what decides transfer',
    a.distil.addressedBy === 'commanded reference' && a.distil.transfers === true
    && a.hff.transfers === false && a.hff.built === false,
    JSON.stringify(a));
}

check('…and a host WITHOUT distilRuns gets a stated skip rather than a silent one (rule 25)',
  await (async () => {
    const a2 = new AutoStack({ channels: [{ max: 10 }], uMax: 1, resolve: 1e-9,
      distil: { offsets: [-4, 0, 4], signOffsets: [0] } });
    const r2 = await a2.commission({ run: async (corr) => runLap2(corr, a2) });
    return !!(r2.distil && r2.distil.note);
  })(), 'a requested rung that vanishes without a word is the failure this guards');

console.log(failed ? `\ndistil: ${failed} check(s) FAILED\n` : '\ndistil: all checks passed\n');
process.exit(failed ? 1 : 0);
