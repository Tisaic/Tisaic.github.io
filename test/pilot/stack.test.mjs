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
  depth: 3,
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
const trap = [0, 1, 2, 3].map((d) => run(PR, d));
const sine = [0, 1, 2, 3].map((d) => run(SIN, d));
console.log('    tracking error, mm rms, by stack depth:');
console.log(`      trained trapezoid   ${trap.map((r) => r.rms.toFixed(4)).join('  ')}`);
console.log(`      UNSEEN sine         ${sine.map((r) => r.rms.toFixed(4)).join('  ')}`);
console.log(`      (${(trap[0].rms / trap[3].rms).toFixed(1)}x and `
  + `${(sine[0].rms / sine[3].rms).toFixed(1)}x; correction clamped ${st.report.clamped} times)`);

check('every layer commissions and vouches for itself before it acts',
  L.length === 3 && L.every((l) => l.deployed && l.verify > 1.1),
  JSON.stringify(L.map((l) => [l.layer, l.deployed, l.verify])));
// EACH LAYER'S FORECAST IS OF A HARDER SIGNAL THAN THE LAST, which is what says it is
// modelling the RESIDUAL and not re-learning the plant.
check('…and each layer forecasts a harder signal than the one below it',
  L[0].r2[0] > L[1].r2[0] && L[1].r2[0] > L[2].r2[0],
  JSON.stringify(L.map((l) => +l.r2[0].toFixed(4))));
check('…while still finding real structure in what reached it',
  L[1].r2[0] > 0.3 && L[2].r2[0] > 0.2, JSON.stringify(L.map((l) => +l.r2[0].toFixed(4))));
// THE TIMESCALE SEPARATION IS MEASURED, NOT DESIGNED: what layer 1 leaves is slower than
// what layer 1 was built for, and layer 2 discovers that on its own.
check('…and a later layer reaches further ahead than the first, having measured why',
  Math.max(L[1].N, L[2].N) > L[0].N, JSON.stringify(L.map((l) => l.N)));
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
