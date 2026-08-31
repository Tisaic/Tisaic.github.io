/**
 * @file THE MEMORY IS RETIRED, SO SOMETHING ADDRESSED BY STATE HAS TO DO ITS JOB.
 *
 * SECOND ATTEMPT, ON A DIFFERENT MECHANISM. The first ran normalised LMS per lead and is
 * deleted: its best case was +0.3% on the program it could see and it took a held-out program
 * from 8.27x to 0.98x. Two things have changed since, and together they are the whole reason
 * this is worth asking again.
 *
 * ONE UPDATE NOW MENDS THE WHOLE BANK. The forecast is a single weight vector shared by every
 * lead, so adapting lead 0 adapts all sixty-eight. The old measurement — "adapting lead 0
 * moved the machine 0.1%" — was a fact about a per-lead bank, not about adaptation.
 *
 * AND THE GAIN DECAYS. `SharedRLS` is second order: its gain shrinks as information arrives,
 * where LMS answered noise at full strength for ever and so specialised to whatever program
 * was in front of it — rebuilding, by another route, exactly the memory being retired.
 *
 * A lap-indexed table reaches accuracy a frozen model cannot because it keeps a separate
 * number for every phase of one program — and that is exactly why it does not transfer. The
 * plant-based way to get the same accuracy is to keep LEARNING: a model that updates online
 * converges on what the machine is doing NOW, and it is still addressed by the machine's
 * state, so it carries to a program it has never run.
 *
 * `Pilot.adapt` implements that — normalised LMS per lead, the step free but the DRIFT from
 * the verified model bounded, and a freeze after three worsening windows. It is off, and the
 * one measurement ever taken on it adapted lead 0 alone, moved the machine 0.1%, and proved
 * nothing: the QP plans over all N leads and mending one of fifty-eight cannot show up.
 *
 * WHY EMPS AND NOT THE ARM. Adaptation needs a TRUTH at deploy time, and whether a machine
 * has one is a property of the plant, not of the algorithm. On this axis the controlled
 * quantity IS the measured one — the encoder error is available every scan, for free, in
 * production. On the 2R arm the pilot's truth is a TOOL error that needs a tracker the
 * machine does not have, so testing there would confound "does adaptation work?" with "can
 * we sense the truth?". This file answers the first question only, and the second is a
 * separate piece of work with its own apparatus (`lib/probesense`, `tipsensor`).
 *
 * SINGLE LAYER, DELIBERATELY. In a cascade each layer subtracts only its OWN convolution
 * from the truth, so layer 1's target is polluted by layer 2's correction. That is a real
 * question and not this one.
 *
 * Run: node test/pilot/adapt.mjs   [LAPS=20] [MU=...] [CLAMP=...] [STRIDE=...]
 */
import { Pilot } from '../../lib/pilot/pilot.js';
import { DT, P, PR, makeMachine } from './emps-rig.mjs';

// The two-tone sine from `stack.test.mjs`: a program inside the machine's envelope that the
// model has never run. The whole claim is that a STATE-addressed correction transfers, so a
// held-out program is not a nicety here, it is the measurement.
const SIN = { q: new Float64Array(P) };
{
  const A1 = 0.012, w1 = 2 * Math.PI * 6 / (P * DT), A2 = 0.002, w2 = 2 * Math.PI * 13 / (P * DT);
  for (let k = 0; k < P; k++) {
    const t = k * DT;
    SIN.q[k] = 0.13 + A1 * Math.sin(w1 * t) + A2 * Math.sin(w2 * t);
  }
}

const LAPS = +(process.env.LAPS || 20);

function openLoop(prog) {
  const m = makeMachine(prog.q[0], 0);
  let s = 0, n = 0;
  for (let k = 0; k < 8 * P; k++) {
    m.step(prog.q[((k - 1) % P + P) % P]);
    if (k >= 4 * P) { const e = m.q - prog.q[k % P]; s += e * e; n++; }
  }
  return 1000 * Math.sqrt(s / n);
}

const UMAX = 2e-3;
const pilot = new Pilot({
  autoRefuse: true, nMeasured: 1,
  channels: [{ lo: -0.02, hi: 0.27, vMax: 1.25e-4, aMax: 8.3e-7, jMax: 5e-8 }],
  uMax: UMAX,
  start: [PR.q[0]],
  guards: [{ index: 0, max: 0.4 }],
  workspace: () => true,
  seed: 1,
  exciteSteps: 40000,
});
{
  const m = makeMachine(PR.q[0], 0);
  let prevRef = PR.q[0];
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    m.step(prevRef);
    prevRef = cmd[0].pos + cmd[0].u;
    pilot.observe([m.q], [m.q - cmd[0].pos]);
  }
}
const st = pilot.status();

// THE COMMISSIONED WEIGHTS, DEEP-COPIED. Adaptation MUTATES `ro.w` in place, so a sweep that
// did not restore them would be measuring each setting on the model the previous setting
// left behind — every row after the first describing a machine nobody configured.
const W0 = pilot.readouts.map((ro) => (ro.w ? ro.w.map((v) => Float64Array.from(v)) : null));
function restore() {
  pilot.readouts.forEach((ro, c) => {
    // EVERY LEAD POINTS AT ONE ARRAY, so restoring it once restores the bank. Written as a
    // loop anyway because it costs nothing and does not assume the sharing.
    if (W0[c]) for (let i = 0; i < ro.w.length; i++) ro.w[i].set(W0[c][i]);
    ro._rls = null; ro._onlineN = 0;      // a new run is a new recursion, not a continuation
  });
}

/**
 * Deploy on `prog`, optionally adapting against the error the machine really has.
 * `keep` continues from the weights the previous run left, which is what the retention
 * test below needs: adapt on one program, then carry those weights to another.
 */
function run(prog, online, keep = false) {
  if (!keep) restore();
  pilot.online = online;
  const m = makeMachine(prog.q[0], 0), S = pilot.sample;
  pilot._initRun();
  let s = 0, n = 0, uPk = 0, pref = prog.q[0];
  // AND THE ERROR LAP BY LAP, because an adaptation that ends well after starting badly and
  // one that was always good are different machines, and a single rms cannot tell them apart.
  const perLap = [];
  for (let lap = 0; lap < LAPS; lap++) {
    let ls = 0, ln = 0;
    for (let i = 0; i < P; i++) {
      const k = lap * P + i;
      m.step(pref);
      const u = pilot.act((off) => [prog.q[(((Math.floor(k / S) + off) * S) % P + P) % P]]);
      uPk = Math.max(uPk, Math.abs(u[0]));
      pref = prog.q[i] + u[0];
      const err = m.q - prog.q[i];
      // THE TRUTH THE MACHINE REALLY HAS. On this axis the controlled quantity is the
      // measured one, so this is the production signal and not a simulator privilege.
      pilot.observe([m.q], online ? [err] : null);
      ls += err * err; ln++;
      if (lap >= LAPS - 4) { s += err * err; n++; }
    }
    perLap.push(1000 * Math.sqrt(ls / ln));
  }
  // `adapt` HANGS OFF status(), NOT off status().report — the report is the COMMISSIONING
  // one and has no live adaptation state at all. Reading it there printed `updates: 0` and
  // `drift 0.000` on every row while the machine numbers were visibly moving, which is the
  // instrument failing before the model (rule 17) and would have been read as "adaptation
  // never ran" if the scores had happened to sit still.
  const a = { updates: pilot.readouts[0]._onlineN || 0 };
  // THE FIRST SCORED LAP IS LAP INDEX 1, NOT 0. Lap 0 starts the machine at rest on a
  // program that demands velocity immediately, so it carries a start-up transient that is
  // IDENTICAL for a frozen and an adapting model — on the sine, frozen reads 0.1191 on lap 0
  // and 0.0415 on lap 1 with the weights untouched, a factor of 2.9 that belongs to the
  // transient and not to the controller (rule 13). It is reported in its own column rather
  // than dropped, because "not measured" and "no transient" are different states (rule 25).
  return { rms: 1000 * Math.sqrt(s / n), start: perLap[0], first: perLap[Math.min(1, perLap.length - 1)],
    uPk: 1000 * uPk, perLap, a };
}

const openProg = openLoop(PR), openSine = openLoop(SIN);
console.log(`\npilot: online adaptation on EMPS — can a STATE-addressed model do the memory's job?`);
console.log(`  commissioned: Ts ${st.Ts} sample ${st.sample} N ${st.N}, verify `
  + `${st.report.verify ? st.report.verify.ratio.toFixed(2) + 'x' : '—'}`);
console.log(`  open loop: program ${openProg.toFixed(4)} mm, held-out sine ${openSine.toFixed(4)} mm`);
console.log(`  the bar: a lap-indexed table on this axis reaches 0.0024 mm (242x) on the program`
  + ` it learned, and 0.53x — WORSE than nothing — on this same sine.`);

// FORGETTING IS THE ONLY KNOB. 1 accumulates every row ever seen — the batch fit continued;
// below 1 the estimator tracks and old rows decay. That single number is the whole difference
// between "keep fitting" and "keep adapting", which is why the sweep has one axis now where
// the LMS version had three.
const LAMBDAS = (process.env.LAMBDA || '1,0.9999,0.999,0.99').split(',').map(Number);
// THE FAILURE MODE IS WATCHED, NOT GUARDED AWAY. The LMS version of this file carried a
// `FREEZE` after three worsening windows; it is gone with the law it belonged to, and
// deliberately not replaced, because a guard that stops a run says only that it stopped —
// this project has two update laws on record (an ILC table pumped to 5.25, a harmonic solve
// at 0.98x) and both were understood by watching them diverge, not by reading a guard.
// AND THE COVARIANCE BOUND, which is the only other knob and exists because forgetting has a
// failure mode: `P` is divided by lambda every update, so a stream that stops carrying new
// information inflates it geometrically until the gain is answering noise. 0 leaves it
// unbounded, which is what the first sweep here measured.
const TG = +(process.env.TG || 0);
// AND WHETHER THE FORGETTING IS DIRECTIONAL. Rule 41 records directional forgetting measuring
// NEUTRAL five times in this project; all five were on a different question, and this is the
// first time the mechanism it targets — inflating directions the data said nothing about — has
// been isolated and measured on its own.
const DIR = process.env.DIR === '1';
// AND THE ANCHOR: how many rows the estimate may drift from the commissioned fit before that
// fit pulls it back. 0 leaves it unanchored, which is what every reading before this one was.
const AR = +(process.env.AR || 0);

// THE UNSEEN PATH IS THE HEADLINE. LAP IMPROVEMENT IS SECONDARY.
//
// Two separate things were being conflated in one rms. A controller that reaches its number
// only after laps of ONE program is a memory however it is implemented — it buys performance
// by repetition and cannot deliver it on a part it has not cut before — so the number that
// decides is the FIRST SCORED LAP OF A PROGRAM THE MODEL HAS NEVER RUN. Everything after
// that lap is improvement-by-repetition: worth knowing, never the claim.
//
// Scoring the LAST FOUR OF TWENTY laps, which this file did, measured exactly the thing the
// retirement exists to remove, and it flattered the result twice over. Read properly:
//
//   unseen sine, first scored lap   frozen 8.77x   adapting 9.32x   (+6%)
//   unseen sine, converged over 20  frozen 8.77x   adapting 12.16x  (+39%, all repetition)
//   seen program, first scored lap  frozen 14.68x  adapting 14.71x  (+0.2%)
//
// So the whole 8.77x -> 12.16x headline is the second row, and the second row is laps.
console.log('\n            |  UNSEEN two-tone sine — THE NUMBER THAT DECIDES  |  seen program   |');
console.log('   lambda   |  start   lap 1       x   converged       x  |   lap 1       x  |  updates');
const base = run(PR, null), baseS = run(SIN, null);
const row = (name, r, q, upd) => console.log(`  ${name.padStart(7)}   | `
  + `${q.start.toFixed(4).padStart(7)}  ${q.first.toFixed(4).padStart(6)}  `
  + `${(openSine / q.first).toFixed(2).padStart(6)}x  ${q.rms.toFixed(4).padStart(9)}  `
  + `${(openSine / q.rms).toFixed(2).padStart(6)}x  |  ${r.first.toFixed(4).padStart(6)}  `
  + `${(openProg / r.first).toFixed(2).padStart(6)}x  |  ${String(upd).padStart(7)}`);
row('frozen', base, baseS, '—');
for (const lambda of LAMBDAS) {
  const cfg = { lambda, traceGain: TG, directional: DIR, anchorRows: AR };
  const r = run(PR, cfg), q = run(SIN, cfg);
  row(String(lambda), r, q, r.a.updates);
}
// ---- DOES ADAPTATION LOSE THE COMMISSIONING? THE DIRECT TEST, NOT THE DRIFT.
//
// THE TRAP, NAMED BY THE OWNER AND VISIBLE IN THE TRACE ABOVE: the model is identified on a
// broadband scribble, and a forgetting law discounts old rows on a TIMER. Run one program long
// enough and every row that carried the scribble's excitation has been discounted away, so what
// is left is a model of that one program — the memory being rebuilt by an adaptive law, and the
// exact object the retirement removes. It performs well immediately and goes bad slowly, which
// is the worst shape a failure can have because a short test cannot see it.
//
// READING THE DRIFT IS NOT ENOUGH. A trace that creeps upward is CONSISTENT with losing the
// commissioning, but it is also consistent with the correction simply becoming badly tuned for
// the program in front of it. Those are different faults with different fixes, and one number
// cannot separate them (rule 39's shape, applied to a different pair).
//
// SO THE INSTRUMENT IS A TRANSFER: adapt on program A for the whole run, FREEZE, and score the
// resulting model on program B, which it never adapted on, against the commissioned model on
// that same B. If the scribble identification survives, B is no worse than frozen. If it has
// been discounted away, B is worse — and by how much is the size of what was lost.
if (process.env.RETAIN) {
  console.log('\n  RETENTION — adapt on one program, freeze, then score the OTHER one:');
  console.log('    (the commissioned model reaches ' + (openProg / base.first).toFixed(2)
    + 'x on the program and ' + (openSine / baseS.first).toFixed(2) + 'x on the sine, frozen)');
  for (const lambda of LAMBDAS) {
    const cfg = { lambda, traceGain: TG, directional: DIR, anchorRows: AR };
    // adapt on the sine for the whole run, then carry those weights to the program with
    // adaptation OFF — so what is scored is the MODEL, not the law that is still running.
    run(SIN, cfg);
    const carriedP = run(PR, null, true);
    // and the other way round, because a law can lose one program's information and not the
    // other's, and asserting one direction would be a one-sided claim (rule 9).
    run(PR, cfg);
    const carriedS = run(SIN, null, true);
    const rp = openProg / carriedP.first, rs = openSine / carriedS.first;
    const bp = openProg / base.first, bs = openSine / baseS.first;
    console.log(`    lambda ${String(lambda).padStart(7)}  adapted on sine → program `
      + `${rp.toFixed(2).padStart(6)}x (frozen ${bp.toFixed(2)}x, ${(100 * (rp / bp - 1)).toFixed(0)}%)`
      + `   adapted on program → sine ${rs.toFixed(2).padStart(6)}x (frozen ${bs.toFixed(2)}x, `
      + `${(100 * (rs / bs - 1)).toFixed(0)}%)`);
  }
}

// THE LAP TRACE, because "did it converge, sit still, or walk away" is the question a single
// rms cannot answer and the one that decides whether this is the memory's replacement or a
// slightly different model.
if (process.env.TRACE) {
  const show = (name, r) => console.log(`  ${name.padEnd(22)} ${r.perLap.map((v) => v.toFixed(4)).join(' ')}`);
  console.log('\n  error by lap, mm rms:');
  show('frozen, program', base);
  show('frozen, sine', baseS);
  for (const lambda of LAMBDAS) {
    show(`lambda ${lambda} prog`, run(PR, { lambda, traceGain: TG, directional: DIR, anchorRows: AR }));
    show(`lambda ${lambda} sine`, run(SIN, { lambda, traceGain: TG, directional: DIR, anchorRows: AR }));
  }
}
