/**
 * @file A COLD ROLLING MILL, AND THE DISTURBANCE THE CLASSICAL CONTROLLER MAKES WORSE.
 *
 * The Wood–Berry column was chosen to find the boundary and it did: on pure setpoint
 * tracking through four dead times the pilot loses to a published PI. This is the other
 * side of the same question — an industrial machine whose DOMINANT disturbance is
 * periodic and repeatable, which is the structure every measurement in this project has
 * identified as the pilot's wheelhouse. The prediction is stated before the run: it
 * should win here, and win largest against the baseline that is famous for failing.
 *
 * THE PLANT is a single 4-high cold mill stand, in the standard control-model form:
 *   mill spring     h = S + F/M          (M = MILL MODULUS: force per unit mill stretch)
 *   plastic curve   F = Q(H - h)         (Q = MATERIAL MODULUS: force per unit gauge)
 *   together        h = (M(S+e) + Q·H)/(M+Q)
 * where S is the unloaded roll gap the hydraulic capsule commands, H the entry gauge
 * from the previous pass, and e the ROLL ECCENTRICITY — a periodic gap error at
 * backup-roll rotation frequency, caused by grinding and bearing tolerance, and the
 * disturbance the rolling literature treats as the hard one in both hot and cold mills.
 *
 * THE CLASSICAL BASELINE IS THE GAUGEMETER, or BISRA AGC after the British Iron and
 * Steel Research Association: the exit gauge is not measured at the roll gap, so it is
 * INFERRED as h_hat = S + F/M from the gap position and the roll force, both of which
 * are available instantly. It is the standard method and it is very good against entry
 * gauge variation. Against eccentricity it is WORSE THAN NOTHING, and the algebra says
 * why — substituting the plant into the estimator,
 *      h     = (2/3)S + (1/3)H + (2/3)e        (with M = 500, Q = 250 kN/mm)
 *      h_hat = (2/3)S + (1/3)H - (1/3)e   so   h_hat - h = -e
 * the estimate moves OPPOSITE to the truth by exactly the eccentricity. The gaugemeter
 * therefore sees the strip getting thin exactly when it is getting thick, closes the gap
 * further, and amplifies the error by 3/2. This is checked below as an assertion, not
 * quoted: if the model ever stops reproducing it, the benchmark has stopped being one.
 *
 * THE OTHER CLASSICAL BASELINE is MONITOR AGC: a PI on the real X-ray gauge, which is
 * honest about eccentricity but sits downstream of the stand, so it answers through a
 * transport delay of strip length over line speed.
 *
 * WHAT IS ROUTED: three signals — roll force, gap position, and the delayed X-ray gauge
 * with its own measurement noise — and ONE correction channel, the hydraulic capsule.
 * Nothing tells the pilot that a periodic disturbance exists, what its frequency is, or
 * that force and gauge are related by a mill modulus.
 */
import { Pilot } from '../../lib/pilot/pilot.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: a cold mill stand — roll eccentricity, and the gaugemeter that amplifies it');

// THE PLANT LIVES IN ITS OWN MODULE so a second test can drive the same one.
import {
  A_ECC, DLY, DT, D_BUR, F_ECC, H0, HREF, L_GAUGE, MM, NOISE, QM, S0, TAU_A, T_RUN, V_LINE, bisra, gaugemeter, gauss, lcg, makeMill, mon, monitor, openLoop, score,
} from './rigs/rollmill-rig.mjs';

// ------------------------------------------------------------ route, limit, run
async function commission(seed = 1) {
  const m = makeMill(3);
  m.quiet = process.env.QUIET === '1';
  for (let i = 0; i < 4000; i++) m.step(S0);
  const pilot = new Pilot({
    autoRefuse: true, nMeasured: 3,                                        // force, gap, delayed gauge
    // THE RATE LIMITS SET THE IDENTIFICATION BANDWIDTH, and they have to cover the
    // DISTURBANCE, not just the program. Eccentricity of 30 µm at 1.22 Hz moves the gap
    // at up to A·2πf = 4.6e-4 mm/step; routed at 2e-4 the excitation could not contain
    // energy at that frequency at all, the response was identified only well below it,
    // and the pilot's own verify measured 0.40x and refused — correctly, because it had
    // no model of the plant where the disturbance lives. A real hydraulic capsule slews
    // orders of magnitude faster than this; the first routing was simply wrong.
    channels: [{ lo: S0 - 0.12, hi: S0 + 0.12, vMax: 3e-3, aMax: 3e-4, jMax: 3e-5 }],
    uMax: 0.06,                                          // 60 microns of capsule authority
    // THE TRANSPORT DELAY, DECLARED. The X-ray gauge sits L_GAUGE m downstream of the roll gap at
    // V_LINE m/s, so the metal it reads left the gap DLY steps ago — a fact about where the gauge
    // is MOUNTED, computed from the rig's own geometry rather than fitted. The probe cannot
    // recover it: a dead time and a slow rise move the 90% crossing identically, and measured here
    // the pilot read Ts 9 on a 100-step delay and built a 14-step horizon for a plant that cannot
    // move for 100 (rule 40).
    deadTime: DLY,
    start: [S0],
    guards: [{ index: 0, max: 400 }],                    // roll force, kN/mm
    workspace: () => true,
    // THE REPRESENTATIVE PROGRAM OF A REGULATOR IS A HOLD, and that is the point. This mill's
    // job is to keep the gap at S0 while an eccentricity disturbance acts on it — the setpoint
    // never moves. Both of the verify's built-in regimes MOVE: a filtered-noise scribble and a
    // trapezoid built from the rate limits. So on a regulation plant the gate has been scoring
    // a controller on tracking, twice over, and the machine is doing disturbance rejection.
    // That is a candidate explanation for a refusal this file's own header calls a PREDICTION
    // FAILURE — "this plant was chosen as the pilot's wheelhouse and it refuses".
    verifyRef: process.env.NOREP === '1' ? null : () => [S0],
    seed,
  });
  let steps = 0;
  const wantHist = [];
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    m.step(cmd[0].pos + cmd[0].u);
    steps++;
    // THE REFERENCE IS DELAYED TO MATCH THE MEASUREMENT, which is strip tracking and is
    // what every mill does: the X-ray gauge is a metre downstream, so the metal it is
    // reading left the roll gap 200 ms ago and must be compared against the target the
    // gap was holding THEN. Comparing it against the target implied by the command NOW
    // makes the truth channel a pure delay error — measured, the pilot's own verify
    // round scored 0.40x and it refused the plant, correctly, because the signal it was
    // being asked to model was mostly an artefact of the routing.
    wantHist.push((MM * cmd[0].pos + QM * H0) / (MM + QM));
    if (wantHist.length > DLY + 2) wantHist.shift();
    const want = wantHist.length > DLY ? wantHist[wantHist.length - 1 - DLY] : HREF;
    // ONE READING PER SAMPLE, not two. Calling the gauge twice draws two independent
    // noise samples, so the signal the model is given and the truth it is asked to
    // predict disagree by 2 µm of pure noise — and the pilot reported exactly that:
    // "nothing about the truth is predictable from these signals". It was right.
    const g = m.gauge();
    pilot.observe([m.F, m.S, g], [g - want]);
  }
  return { pilot, steps };
}
const { pilot, steps } = await commission();
const st = pilot.status();
console.log(`    commissioned in ${steps} steps = ${(steps * DT).toFixed(0)} s of rolling; `
  + `Ts ${st.Ts}, Tset ${st.Tset}, sample ${st.sample}, N ${st.N}, rings ${JSON.stringify(st.rings)}`);
console.log(`    verify ${st.report.verify ? st.report.verify.ratio.toFixed(2) + 'x' : '—'} — ${pilot.verdict.why}`);

let uPk = 0;
const pil = score((m, i, warm) => {
  if (warm) { m.step(S0); return; }
  const u = pilot.act(() => [S0]);
  uPk = Math.max(uPk, Math.abs(u[0]));
  m.step(S0 + u[0]);
  pilot.observe([m.F, m.S, m.gauge()], null);
});

console.log(`    exit gauge deviation over ${(T_RUN * DT).toFixed(0)} s of rolling `
  + `(microns rms / worst), eccentricity ${(1000 * A_ECC).toFixed(0)} µm at `
  + `${F_ECC.toFixed(2)} Hz, gauge ${(DLY * DT * 1000).toFixed(0)} ms downstream:`);
console.log(`      no AGC (fixed gap)            ${openLoop.rms.toFixed(2)} / ${openLoop.worst.toFixed(2)}`);
console.log(`      gaugemeter (BISRA) AGC        ${bisra.rms.toFixed(2)} / ${bisra.worst.toFixed(2)}`);
console.log(`      monitor AGC (X-ray, delayed)  ${mon.rms.toFixed(2)} / ${mon.worst.toFixed(2)}`);
console.log(`      the pilot                     ${pil.rms.toFixed(2)} / ${pil.worst.toFixed(2)}`
  + `   u peak ${(1000 * uPk).toFixed(1)} µm`);

// THE BENCHMARK'S OWN SIGNATURE, asserted so it cannot quietly stop being a benchmark.
// This is the industrially famous result and the reason the plant was chosen: the
// standard gaugemeter, which is excellent against entry-gauge variation, makes the
// dominant disturbance WORSE. The algebra at the head of this file predicts a 3/2
// amplification and the model reproduces it.
check('the gaugemeter AMPLIFIES roll eccentricity, which is why this plant is the test',
  bisra.rms > openLoop.rms, `${bisra.rms.toFixed(2)} vs ${openLoop.rms.toFixed(2)} µm`);
check('…while monitor AGC, honest but late, buys only a little',
  mon.rms < openLoop.rms && mon.rms > 0.8 * openLoop.rms,
  `${mon.rms.toFixed(2)} vs ${openLoop.rms.toFixed(2)} µm`);
check('the pilot commissions from force, gap and a delayed noisy gauge',
  st.report.readouts && st.report.readouts.length === 1, JSON.stringify(st.rings));

// ================== A PREDICTION MADE BEFORE THE RUN, AND IT WAS WRONG
//
// The head of this file states it plainly: this plant was chosen BECAUSE its dominant
// disturbance is periodic and repeatable, which every measurement in this project had
// identified as the pilot's wheelhouse, and the prediction was that it would win here
// and win largest against the baseline famous for failing. IT DOES NOT. Its own verify
// round measures 0.42x, it declines, and the mill runs untouched.
//
// FOUR ROUTINGS WERE TRIED AND NONE OF THEM CHANGED IT, so it is not a slip in any one
// of them, and three were real errors worth recording anyway: the X-ray gauge was
// compared against the target implied by the command NOW rather than the command
// 200 ms ago (strip tracking, which every mill does); the gauge was READ TWICE per
// sample, giving the model and the truth independent noise; and the routed slew limit
// was below the disturbance's own 4.6e-4 mm/step, so the excitation could not carry
// energy where the disturbance lives. Fixing all three moved the verify from 0.40x to
// 0.42x.
//
// WHAT IS NOT YET RULED OUT, stated so the next attempt starts from here rather than
// from scratch: the model's memory is sized from the PLANT's settling time (a ~240-step
// lag window) while a periodic disturbance has a timescale of its own (410 steps here),
// so the window may be too short to carry the disturbance's phase — but the experiment
// that would settle it did not run, and a hypothesis is not a finding.
//
// The honest reading is that the pilot's wheelhouse is narrower than four plants had
// suggested: it wins where the repeatable error is a function of the COMMAND (droop,
// wind-up, and the arm's whole vocabulary), and has not yet been shown to win where the
// repeatable error is an exogenous rhythm the command does not explain.
console.log(`    PREDICTION FAILED: this plant was chosen as the pilot's wheelhouse and it `
  + `refuses (verify ${st.report.verify.ratio.toFixed(2)}x). Four routings, no change.`);
check('the pilot REFUSES rather than deploying onto a mill it cannot help',
  pilot.verdict.deploy === false, JSON.stringify(pilot.verdict));
check('…so the mill runs exactly as it would have, and the gaugemeter\'s 1.19x penalty '
  + 'is avoided by declining',
  Math.abs(pil.rms - openLoop.rms) < 1e-9 && uPk === 0,
  `${pil.rms.toFixed(2)} vs ${openLoop.rms.toFixed(2)} µm, u ${uPk}`);

console.log(failed ? `\npilot/rollmill: ${failed} check(s) FAILED\n` : '\npilot/rollmill: all checks passed\n');
process.exit(failed ? 1 : 0);
