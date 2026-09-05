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
// The lead index counts DECISION grid steps, so the dead time in lead units is DLY/grid.
const DLY_GRID = st.grid || pilot.grid;
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

// ================== THE PREDICTION MADE BEFORE THE RUN, AND WHAT IT COST TO KEEP IT
//
// The head of this file states it plainly: this plant was chosen BECAUSE its dominant
// disturbance is periodic and repeatable, and the prediction was that the pilot would win
// here and win largest against the baseline famous for failing. FOR A LONG TIME IT DID NOT.
// Its verify measured 0.40x, then 0.42x, then 0.61x, and it declined every time. It now
// deploys and delivers, and NOT ONE LINE OF THE CONTROLLER CHANGED to get there — two
// measurement faults were repaired, both of them in what the pilot was told rather than in
// what it does.
//
// FOUR ROUTINGS WERE TRIED FIRST AND NONE OF THEM WAS IT, though three were real errors and
// are kept fixed: the X-ray gauge was compared against the target implied by the command NOW
// rather than the command 200 ms ago (strip tracking, which every mill does); the gauge was
// READ TWICE per sample, giving the model and the truth independent noise; and the routed
// slew limit sat below the disturbance's own 4.6e-4 mm/step, so the excitation could not
// carry energy where the disturbance lives. All three together moved the verify 0.40x to
// 0.42x, which is the measurement that says they were not the cause.
//
// THE FIRST REAL FAULT WAS THE DEAD TIME, AND IT IS DECLARED RATHER THAN FITTED. The probe
// cannot recover it — a transport delay and a slow rise move the 90% crossing identically —
// so the pilot read Ts 9 on a 100-step delay and built a 14-step horizon for a plant that
// cannot move for 100. Every tap of `hGrid` then landed INSIDE the dead zone, `h*u` came out
// 3.57x the truth it is subtracted from, and `eFree` reached 4.16x the truth against 0.96-1.08
// on every other plant. `deadTime: DLY` above is the gauge's mounting distance over the line
// speed — geometry, not a tuned constant — and it takes the plant from 0.61x to neutral.
//
// THE SECOND WAS THE FORECAST GATE READING A LEAD THE CORRECTION CANNOT MOVE. With the delay
// declared, `hGrid` is exactly zero for leads 0-24 and first moves at lead 25 = step 100. The
// gate read lead 0, where held-out R^2 is 0.044, disarmed the only channel, and the pilot
// reported "nothing about the truth is predictable from these signals" — about a plant whose
// R^2 at the first lead it can actually act on is 0.87. The forecast was never the problem.
// The gate now reads the first lead with a non-zero response, which is lead 0 on every plant
// without a transport delay, so the other five are byte-identical.
//
// AND THE HYPOTHESIS THIS FILE USED TO CARRY IS DEAD, which is worth more than the win: it
// said the lag window might be too short to carry the disturbance's 410-step period. It is
// not. The window reaches 230 steps here and the fit reports held-out R^2 0.974 at lag 24;
// the disturbance was always predictable and two instruments were lying about it (rule 17,
// for the sixth time this project has paid for it).
console.log(`    the pilot DEPLOYS: verify ${st.report.verify.ratio.toFixed(2)}x, delivered `
  + `${(openLoop.rms / pil.rms).toFixed(2)}x, gate read at lead `
  + `${st.report.readouts[0].gateLead} (R^2 ${st.report.readouts[0].r2GateLead.toFixed(3)}) `
  + `against lead 0's ${st.report.readouts[0].r2Lead0.toFixed(3)}`);
check('the pilot deploys on the mill, and its own verify vouched for it first',
  pilot.verdict.deploy === true && st.report.verify.ratio > 1.1, JSON.stringify(pilot.verdict));
check('…and it DELIVERS on the machine, past the two classical AGCs',
  pil.rms < 0.8 * openLoop.rms && pil.rms < mon.rms && pil.rms < bisra.rms,
  `pilot ${pil.rms.toFixed(2)} vs open ${openLoop.rms.toFixed(2)} / monitor `
  + `${mon.rms.toFixed(2)} / gaugemeter ${bisra.rms.toFixed(2)} µm`);
check('…the worst excursion falls too, so it is not an rms bought with a spike',
  pil.worst < openLoop.worst, `${pil.worst.toFixed(2)} vs ${openLoop.worst.toFixed(2)} µm`);
// BOTH HALVES (rule 9). The correction must be a real one AND inside the authority it was
// given — a controller that helps by running at its clamp is a different object.
check('…using a real fraction of its authority, and not the whole of it',
  uPk > 0.1 * pilot.uMax && uPk < 0.9 * pilot.uMax,
  `u peak ${(1000 * uPk).toFixed(1)} of ${(1000 * pilot.uMax).toFixed(0)} µm`);
// THE MECHANISM, PINNED, so a regression to the old gate is visible as itself rather than as
// a number that got worse. The gate must read past the declared dead time, and the lead it
// abandoned must still be the bad one — if lead 0 ever becomes good here the delay has gone
// missing and this assertion is measuring nothing.
check('the gate reads the first CONTROLLABLE lead, which on this plant is past the dead time',
  st.report.readouts[0].gateLead * DLY_GRID >= DLY
    && st.report.readouts[0].r2Lead0 < 0.2
    && st.report.readouts[0].r2GateLead > 0.5,
  `lead ${st.report.readouts[0].gateLead}, R^2 lead0 ${st.report.readouts[0].r2Lead0.toFixed(3)} `
  + `-> ${st.report.readouts[0].r2GateLead.toFixed(3)}`);

// ------------------------------------------------- WHAT IT COSTS THE SCAN, NOW THAT IT DEPLOYS
// The owner's standing rule: new machinery states its MAC/cycle slice or it does not ship, and
// this plant only started shipping anything today. Its budget is not EMPS' — the mill runs at
// 500 Hz (DT 2 ms), so 10% of a scan is 20,000 MAC here against EMPS' 10,000 at 1 kHz. Stated
// against BOTH, because a budget that silently scales with the plant's own rate is a constant
// carried over (rule 31), and the honest number is the fraction of the scan it actually runs in.
{
  const cost = pilot.cost();
  const budget = 10000 * (DT / 1e-3);        // 10,000 MAC per 1 ms of scan, at this plant's scan
  console.log(`    PLC slice: ${cost.peakMacPerCycle.toLocaleString()} MAC/cycle over `
    + `${cost.cyclesPerUpdate} scan(s), ${cost.features} features, N ${cost.leads}, `
    + `${cost.channels} channel — ${(100 * cost.peakMacPerCycle / budget).toFixed(0)}% of 10% of `
    + `this plant's ${(DT * 1e3).toFixed(0)} ms scan, ${(100 * cost.peakMacPerCycle / 10000).toFixed(0)}% `
    + `of 10% of a 1 ms one`);
  check('the deployed mill fits 10% of its own scan',
    cost.peakMacPerCycle < budget,
    `${cost.peakMacPerCycle.toLocaleString()} against ${budget.toLocaleString()} MAC`);
}

console.log(failed ? `\npilot/rollmill: ${failed} check(s) FAILED\n` : '\npilot/rollmill: all checks passed\n');
process.exit(failed ? 1 : 0);
