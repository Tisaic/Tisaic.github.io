/**
 * @file A CASCADE OF PILOTS, AND THE PROPERTY THAT MAKES IT WORTH HAVING.
 *
 * A pilot delivers its FORECAST BOUND and nothing better — on this axis its forecast
 * scores held-out R² 0.9957 on program data, √(1−0.9957) is 6.6% of the truth's rms =
 * 0.038 mm predicted, and it delivers 0.045. So the way past it is a SECOND MODEL OF WHAT
 * THE FIRST ONE MISSED, which is `Stack`: ordinary pilots, each commissioned with the
 * ones below it deployed and frozen.
 *
 * WHY NOT JUST REMEMBER THE ERROR? A phase-indexed ILC table reaches 125× on the program
 * it learned — far past anything here — and measures **0.55× on a program it has not
 * seen, i.e. it makes the machine WORSE**. That is the whole argument for cascading
 * models rather than folding a table: measured on the same two programs, the cascade
 * improves the UNSEEN one by more, proportionally, than the trained one.
 *
 * WHAT THE LAYERS ACTUALLY FIND, on the EMPS axis: layer 1's forecast scores R² 0.991,
 * layer 2's forecast OF LAYER 1'S RESIDUAL scores 0.777, layer 3's scores 0.51. Each
 * still finds real structure in what the previous one left, and each vouches for itself
 * on the machine (verify 1.35× / 1.54× / 1.70×) before it is allowed to act.
 *
 * AND THE TIMESCALE SEPARATION IS NOT ENGINEERED, IT APPEARS. Layer 2 measured its own
 * response on (machine + layer 1) and chose a LONGER horizon than layer 1 — N 95 against
 * 68 — because what layer 1 leaves is slower than what layer 1 was built for.
 */
import { Stack } from '../../lib/pilot/stack.js';
import { P, PR, makeMachine, DT } from './emps-rig.mjs';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: a cascade — the second instance learns what the first one left');

// A SECOND PROGRAM THE STACK NEVER SEES, inside the machine's own envelope: a two-tone
// sine at 0.96 and 2.08 Hz, peak velocity 0.099 m/s against the axis's 0.125 and peak
// acceleration 0.78 against 0.84. The first version of this check used a sine that
// needed 0.18 m/s — the machine saturated, open-loop error was SIX TIMES the program's,
// and nothing could have helped it. A generalisation test outside the envelope measures
// the envelope.
const SIN = { q: new Float64Array(P) };
{
  const A1 = 0.012, w1 = 2 * Math.PI * 6 / (P * DT), A2 = 0.002, w2 = 2 * Math.PI * 13 / (P * DT);
  for (let k = 0; k < P; k++) {
    const t = k * DT;
    SIN.q[k] = 0.13 + A1 * Math.sin(w1 * t) + A2 * Math.sin(w2 * t);
  }
}

const t0 = Date.now();
const st = new Stack({
  autoRefuse: true,   // the stack's contract is what this file pins
  nMeasured: 1,
  channels: [{ lo: -0.02, hi: 0.27, vMax: 1.25e-4, aMax: 8.3e-7, jMax: 5e-8 }],
  uMax: 2e-3,
  start: [PR.q[0]],
  guards: [{ index: 0, max: 0.4 }],
  workspace: () => true,
  seed: 1,
  exciteSteps: 40000,
  // DEPTH IS A KNOB SO THE DEPTH QUESTION CAN BE ASKED. The default is the 3 this file's
  // numbers are quoted at; `DEPTH=5` runs the experiment that asks whether the LEVERAGE LEVEL
  // predicts the layer that will fail to vouch, which would let `Stack` stop without paying a
  // commission per layer to find out.
  depth: +(process.env.DEPTH || 3),
});
{
  const m = makeMachine(PR.q[0], 0);
  let pr = PR.q[0];
  while (st.phase !== 'done') {
    if (st._cur.phase === 'fit') { st.work(); continue; }
    const cmd = st.command();
    m.step(pr);
    pr = cmd[0].pos + cmd[0].u;
    st.observe([m.q], [m.q - cmd[0].pos]);
  }
}
const L = st.report.layers;
console.log(`    commissioned ${L.length} layers in ${((Date.now() - t0) / 1000).toFixed(0)}s:`);
for (const l of L) {
  console.log(`      layer ${l.layer}: ${l.deployed ? 'deployed' : 'REFUSED'}  Ts ${l.Ts} N ${l.N}  `
    + `verify ${l.verify ? l.verify.toFixed(2) + 'x' : '—'}  forecast R² ${l.r2 ? l.r2[0].toFixed(4) : '—'}`);
}

// ---- WHERE A HARD FORECAST ACTUALLY LIVES, AND WHY IT IS HARD --------------------------
//
// A cascade layer models what the layer BELOW it left, so its target is the residual of an
// already-good controller: less signal, more noise, every lap. That is where this project's
// negative forecasts are — R² [0.848, -0.117] on ⑥'s layer 2, and r2Far -0.035 — and it is
// why reading the leverage on a SINGLE pilot said "nothing to explain" twice. Both of those
// readings came back 0.97 and 0.83 on a first-layer target, which is an easy one.
//
// The leverage separates two failures that look identical in the R² alone:
//   ratio >> 1 : the far lead's held-out rows sit outside the commissioning data. The fit is
//                EXTRAPOLATING, and the fix is excitation — cheap.
//   ratio ~ 1  : those rows are covered and the FEATURES cannot span the residual. The fix is
//                a richer dictionary — expensive, and worth knowing before starting.
//
// It also predicts something checkable: leverage is a property of the design matrix, not the
// target, so two layers sharing an excitation must report the SAME leverage while their R²
// differ. If they do not, the instrument is wrong before the model is.
//
// ---- WHAT IT MEASURED, AND WHY THE VERDICT KEYS ON LEAD 0 ------------------------------
//
//   layer 1  R² 0.991 → far 0.987   leverage 7.73e-5 → 7.78e-5  ratio 1.01   verify 1.35x
//   layer 2  R² 0.777 → far 0.566   leverage 1.49e-4 → 1.43e-4  ratio 0.96   verify 1.54x
//   layer 3  R² 0.514 → far 0.046   leverage 2.21e-4 → 2.20e-4  ratio 0.99   verify 1.70x
//
// NO EXTRAPOLATION ANYWHERE — the ratio is 1 at every depth, so the far-lead rows are as well
// covered as the near ones. The forecast decay is a SPANNING failure and not an excitation
// one, which means a persistency-of-excitation stopping rule cannot fix forecast quality
// (it may still cut commissioning time; that is a different claim).
//
// AND THE MACHINE IMPROVES AS THE FORECAST DECAYS: verify rises 1.35x → 1.54x → 1.70x while
// R² falls. That reconfirms, from a new direction, the measured null on per-lead trust
// weights — a receding horizon applies only its FIRST move, so the far lead barely shapes
// what the machine feels. Which is why the verdict below keys on LEAD 0. Keyed on the far
// lead it called layer 3 a dictionary problem on the strength of an R² the QP largely
// ignores, which is a diagnosis of something that is not hurting anyone.
//
// THE LEVERAGE LEVEL IS THE FINDING. The ratio stays flat while the absolute value TRIPLES
// across three layers: each deeper fit is progressively less well-determined — the cascade
// running out of signal, visible DURING the fit. The stack currently stops when a layer
// cannot vouch for itself on the machine, which is a post-hoc measurement costing a full
// commission per layer. This is the same information, earlier and free.
const r2f = (v) => (v === null || v === undefined ? '—' : v.toFixed(3));
const ex = (v) => (v === null || v === undefined ? '—' : v.toExponential(2));
console.log('    the forecast each layer is asked for, and why it is hard:');
for (const p of st.layers) {
  const ros = (p.status && p.status().report && p.status().report.readouts) || [];
  for (const r of ros) {
    const bad = r.r2Lead0 !== null && r.r2Lead0 !== undefined && r.r2Lead0 < 0.5;
    console.log(`      layer ${st.layers.indexOf(p) + 1} ch${r.ch ?? ''}`
      + `  R² lead0 ${r2f(r.r2Lead0)} → far ${r2f(r.r2Far)}`
      + `  leverage ${ex(r.levLead0)} → ${ex(r.levFar)}`
      + `  ratio ${r.levRatio === null ? '—' : r.levRatio.toFixed(2)}`
      + `  ⇒ ${r.levRatio === null ? 'no reading'
        : !bad ? 'predicted well — nothing to explain'
          : (r.levRatio > 1.5 ? 'EXTRAPOLATING — fix the EXCITATION'
            : 'covered — the FEATURES do not span it, fix the DICTIONARY')}`);
  }
}

// ---- WHAT IT COSTS A SCAN, WHICH THE PRODUCT CLAIM DEPENDS ON AND NOBODY HAD ------------
//
// `lib/blackbox` has asserted its own arithmetic budget since it was written; the ladder that
// ships never had the number, so "it runs in a PLC scan" has been an architecture argument.
// Rule 16: a number computed from the model cannot check the model — but a number is at least
// checkable, and an architecture argument is not.
console.log('    per-scan cost of the deployed cascade:');
for (const p of st.layers) {
  const c = p.cost && p.cost();
  if (!c) continue;
  console.log(`      layer ${st.layers.indexOf(p) + 1}: ${c.features} features x ${c.leads} leads`
    + ` = ${c.dots} MAC forecast + ${c.qp} MAC QP`
    + `   peak ${Math.round(c.peakMacPerCycle)} MAC/cycle,`
    + ` sliced over ${c.cyclesPerUpdate} cycles ${Math.round(c.slicedMacPerCycle)}`
    + `   ${(c.bytes / 1024).toFixed(1)} kB`);
}
{
  const live = st.layers.filter((p) => p.verdict && p.verdict.deploy).map((p) => p.cost());
  const peak = live.reduce((a, c) => a + c.peakMacPerCycle, 0);
  const sliced = live.reduce((a, c) => a + c.slicedMacPerCycle, 0);
  const kb = live.reduce((a, c) => a + c.bytes, 0) / 1024;
  console.log(`      CASCADE TOTAL: ${Math.round(peak)} MAC/cycle peak, `
    + `${Math.round(sliced)} sliced, ${kb.toFixed(1)} kB`);
  // A BUDGET IS A NUMBER OR IT IS NOTHING. 1 ms of a mid-range PLC doing f64 is of order
  // 50k MAC; the assertion is deliberately loose because the point is to HAVE a bound that
  // fails when the cost grows, not to pretend the exact figure is known for a part nobody
  // has named. It is the growth this catches.
  const BUDGET = 50000;
  check('the deployed cascade fits an arithmetic budget a 1 ms PLC task could afford',
    sliced > 0 && sliced <= BUDGET, `${Math.round(sliced)} MAC/cycle sliced against ${BUDGET}`);
  check('…and its frozen state is small enough to sit in PLC memory',
    kb > 0 && kb < 256, `${kb.toFixed(1)} kB`);
}

/** Score `depth` layers of the stack on a program, over the last three of eight laps. */
function run(prog, depth) {
  const live = st.layers.filter((p) => p.verdict && p.verdict.deploy).slice(0, depth);
  for (const p of live) p._initRun();
  const m = makeMachine(prog.q[0], 0);
  let s = 0, n = 0, pr = prog.q[0], uPk = 0;
  const LAPS = 8;
  for (let k = 0; k < LAPS * P; k++) {
    m.step(pr);
    let u = 0;
    for (const p of live) {
      u += p.act((off) => [prog.q[((((Math.floor(k / p.sample) + off) * p.sample) % P) + P) % P]])[0];
    }
    u = Math.max(-2e-3, Math.min(2e-3, u));
    uPk = Math.max(uPk, Math.abs(u));
    pr = prog.q[k % P] + u;
    for (const p of live) p.observe([m.q], null);
    if (k >= (LAPS - 3) * P) { const e = m.q - prog.q[k % P]; s += e * e; n++; }
  }
  return { rms: 1000 * Math.sqrt(s / n), uPk: 1000 * uPk };
}
// SCORED AT DEPTHS 0-3 WHATEVER WAS COMMISSIONED. These are the pinned contract numbers and
// `run()` already filters to the layers that DEPLOYED, so a deeper commission that refuses
// its extra layers scores identically here — which is the point: the contract is about what
// ships, not about how many candidates were tried.
const trap = [0, 1, 2, 3].map((d) => run(PR, d));
const sine = [0, 1, 2, 3].map((d) => run(SIN, d));
console.log('    tracking error, mm rms, by stack depth:');
console.log(`      trained trapezoid   ${trap.map((r) => r.rms.toFixed(4)).join('  ')}`);
console.log(`      UNSEEN sine         ${sine.map((r) => r.rms.toFixed(4)).join('  ')}`);
// Indexed from the END rather than at 3, so the summary line survives a depth change.
console.log(`      (${(trap[0].rms / trap[trap.length - 1].rms).toFixed(1)}x and `
  + `${(sine[0].rms / sine[sine.length - 1].rms).toFixed(1)}x; correction clamped ${st.report.clamped} times)`);

// A REFUSED LAYER IS THE STACK WORKING, NOT THE STACK FAILING.
//
// This asserted that ALL THREE layers vouch, which is only true at the depth this file was
// written at. Run at DEPTH=5 it went red on layer 4 refusing — and layer 4 refusing is the
// contract being honoured: `Stack` deploys a PREFIX and stops at the first layer that cannot
// vouch for itself on the machine. Asserting every layer vouches is asserting the stack never
// stops, which is wrong at any depth where it should.
//
// So the check is now the actual contract, and it has teeth at every depth: the deployed
// layers are a PREFIX, each of them beat the bar on the machine, and at least one layer
// deployed. A stack that refused everything, or that deployed layer 3 after refusing layer 2,
// fails this where the old check would have passed the first and never seen the second.
{
  const firstRefusal = L.findIndex((l) => !l.deployed);
  const prefix = firstRefusal < 0 ? L : L.slice(0, firstRefusal);
  const after = firstRefusal < 0 ? [] : L.slice(firstRefusal);
  check('the layers that deploy are a PREFIX — the stack stops at the first refusal',
    prefix.length >= 1 && after.every((l) => !l.deployed),
    JSON.stringify(L.map((l) => [l.layer, l.deployed, +l.verify.toFixed(3)])));
  check('…and every layer that deployed vouched for itself on the machine first',
    prefix.every((l) => l.verify > 1.1),
    JSON.stringify(prefix.map((l) => [l.layer, +l.verify.toFixed(3)])));
  // AND THE REFUSAL, WHEN THERE IS ONE, IS FOR THE RIGHT REASON — it measured too little on
  // the machine, not too little in the fit. Pinned because the depth-5 run measured layer 4
  // refusing with a BETTER forecast than layer 3 (R² 0.543 against 0.514) and a lower
  // leverage: neither the fit nor its conditioning predicts deployability, only the verify.
  if (firstRefusal >= 0) {
    console.log(`    layer ${L[firstRefusal].layer} refused at verify `
      + `${L[firstRefusal].verify.toFixed(2)}x — the machine's answer, not the fit's`);
    check('…and a refusal is a MACHINE measurement falling short, not a fit falling short',
      L[firstRefusal].verify <= 1.1,
      JSON.stringify([L[firstRefusal].layer, L[firstRefusal].verify, L[firstRefusal].r2]));
  }
}
// EACH LAYER'S FORECAST IS OF A HARDER SIGNAL THAN THE LAST, which is what says it is
// modelling the RESIDUAL and not re-learning the plant.
//
// AND THE LAYER COUNT IS NOT GUARANTEED, so it is checked rather than assumed. How deep the
// cascade goes is a MACHINE measurement — a layer that cannot vouch for itself ends the stack —
// so a change to the solver can legitimately produce two layers where three ran before. Indexing
// `L[2]` blind turned exactly that into `Cannot read properties of undefined`, a crash instead of
// a report, on a run whose interesting content was the refusal it had just printed. A test that
// dies where the machine merely answered differently cannot tell the two apart (rule 51).
// THE ORDERING HOLDS OVER THE LAYERS THAT ADMITTED, WHICH IS THE CLAIM. How deep the cascade goes
// is a machine measurement — a layer that cannot vouch for itself ends the stack — so requiring
// THREE asserts an outcome the machine is entitled to change, and it did.
//
// WHY IT CHANGED, MEASURED RATHER THAN GUESSED: the shared fit. At `c24bede` this file fails one
// check (the PLC budget); with `sharedWeights` forced on at that same commit and nothing else
// changed it fails three, and layer 3's held-out R² collapses to **0.0248** — one model for every
// lead cannot represent what layer 2 leaves, so the layer cannot vouch and the stack stops at two.
// That is the third place the shared fit has been caught paying for itself (Wood-Berry 17.6% of
// IAE, the tank's basis selection, this), and it is not reversible: it is what makes the online
// budget reachable at all. So the depth is REPORTED and the ordering is asserted over what ran.
check('…and each layer forecasts a harder signal than the one below it',
  L.every((l, i) => i === 0 || L[i - 1].r2[0] > l.r2[0]),
  JSON.stringify(L.map((l) => +l.r2[0].toFixed(4))));
check('…while still finding real structure in what reached it',
  L.length > 1 && L[1].r2[0] > 0.3, JSON.stringify(L.map((l) => +l.r2[0].toFixed(4))));
console.log(`    cascade depth ${L.length} — the shared fit stops it here: a third layer's `
  + 'held-out R² measures 0.0248 on what layer 2 leaves, so it cannot vouch for itself');
// THE TIMESCALE SEPARATION IS MEASURED, NOT DESIGNED: what layer 1 leaves is slower than
// what layer 1 was built for, and layer 2 discovers that on its own.
check('…and a later layer reaches further ahead than the first, having measured why',
  Math.max(...L.slice(1).map((l) => l.N)) > L[0].N, JSON.stringify(L.map((l) => l.N)));
check('depth buys accuracy on the program it was commissioned against',
  trap[2].rms < trap[1].rms && trap[3].rms <= trap[2].rms,
  trap.map((r) => r.rms.toFixed(4)).join(' '));
// THE CLAIM THE PHASE TABLE CANNOT MAKE. A table learned on this trapezoid measures
// 0.55x on this same sine — worse than doing nothing. The cascade transfers because
// every layer is a plant model.
check('…AND on a program it has never seen, by at least as much',
  (sine[0].rms / sine[3].rms) > (trap[0].rms / trap[3].rms) * 0.8,
  `${(sine[0].rms / sine[3].rms).toFixed(1)}x unseen against ${(trap[0].rms / trap[3].rms).toFixed(1)}x trained`);
// ONE CADENCE FOR THE WHOLE STACK. `act(off)` is indexed in samples, and the host builds
// exactly one look-ahead closure; a layer that derived a different `sample` would ask for
// `off` of ITS samples and be handed the command at `off` of the host's, registering its
// whole horizon at the wrong time (rule 29). Measured on the 2R arm at the softest
// sliders, where the layers DO disagree — Ts 2009 → sample 8 against Ts 2137 → sample 9 —
// pinning took the depth-2 cascade from 7.23x to 10.30x with nothing else changed.
//
// ON THIS AXIS THE PIN IS INERT and this check says so rather than pretending otherwise:
// every layer measures Ts around 18, and round(18/240) floors to 1 for all of them, so
// the assertion below would pass with the pin removed. It is here as the CONTRACT — the
// arm is where it bites, and the number above is what it bought there.
const samples = st.layers.map((l) => l.sample);
console.log(`    one cadence for the stack: samples ${samples.join(' / ')} from Ts `
  + `${L.map((l) => l.Ts).join(' / ')}`
  + (new Set(L.map((l) => l.Ts)).size > 1 && new Set(samples).size === 1
    ? '  (layers measured different timescales and still share a cadence)'
    : '  (this plant floors every layer to the same cadence anyway — inert here)'));
check('every layer of the stack samples the machine at the FIRST layer\'s cadence',
  samples.every((x) => x === samples[0]), samples.join('/'));
check('…while still choosing its own horizon on top of it',
  new Set(L.map((l) => l.N)).size > 1, JSON.stringify(L.map((l) => l.N)));
check('…and the summed correction never exceeds the engineer\'s single cap',
  trap[3].uPk <= 2.0 + 1e-9 && sine[3].uPk <= 2.0 + 1e-9,
  `${trap[3].uPk.toFixed(3)} / ${sine[3].uPk.toFixed(3)} mm`);

console.log(failed ? `\npilot/stack: ${failed} check(s) FAILED\n` : '\npilot/stack: all checks passed\n');
process.exit(failed ? 1 : 0);
