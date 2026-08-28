/**
 * @file THE THIRD PLANT, AND IT BREAKS THE ASSUMPTIONS THE FIRST TWO SHARED.
 *
 * The arm and the tank process differ in every physical way and still agreed on four
 * things the pilot had never been tested without: two channels, no transport delay,
 * NOISELESS measurements, and an actuator that can push both ways. This plant has none
 * of them, and the noise matters most — every number this project has ever measured
 * came off a deterministic simulation, and its own notes say so: regularisation exists
 * to stop a fit chasing observation noise, and until now there was none to chase.
 *
 * THE PLANT IS A THREE-ZONE EXTRUDER BARREL, which is a real thing engineers commission:
 *   - THREE correction channels (heater powers), against two on both earlier plants
 *   - THREE routed signals and nothing else — one measurement per channel, the leanest
 *     routing yet, and each of them is the delayed, noisy reading of a coupled zone
 *   - PURE TRANSPORT DELAY: the thermocouple is embedded in the barrel wall, so it reads
 *     what the melt did a minute ago. Dead time is the classic killer for anything that
 *     predicts, and it is 60 steps here against a ~1500-step settle
 *   - MEASUREMENT NOISE on every reading, 0.35 K rms, which is what a real thermocouple
 *     and a real ADC give you
 *   - AN UNMEASURED DISTURBANCE: ambient drifts several degrees over the run and nothing
 *     routed to the pilot reports it, so part of the error is structurally unforecastable
 *   - ONE-SIDED ACTUATION: a heater can add heat and cannot remove it, so the plant
 *     cools only by loss and the correction saturates asymmetrically
 *   - and conduction couples every zone to its neighbours, so each power reaches all
 *     three temperatures.
 * Units are kelvin and percent of full power, the timescale is hours, and the program is
 * a product changeover — the profile a line runs when it switches to a different part.
 */
import { Pilot } from '../../lib/pilot/pilot.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: a three-zone extruder barrel — delay, noise, and a disturbance it cannot see');

// THE PLANT LIVES IN ITS OWN MODULE so a second test can drive the same one.
import {
  CAP, DEAD, DT, HL, KC, KH, NOISE, NZ, PBOX, PROG, RAD, RECIPE, SEG, TA0, UCAP, gauss, lcg, makeBarrel, powerFor, quintic, rad, setpointAt, tempsAt,
} from './rigs/thermal-rig.mjs';

// ------------------------------------------------------------ route, limit, run
async function commission(seed = 1) {
  const p = makeBarrel(7);
  const start = powerFor(RECIPE[0]);
  for (let i = 0; i < 20000; i++) p.step(start);
  const pilot = new Pilot({
    autoRefuse: true, nMeasured: NZ,                      // three signals for three channels: the leanest yet
    channels: [0, 1, 2].map(() => ({ lo: PBOX.lo, hi: PBOX.hi,
      vMax: 3e-2, aMax: 2e-4, jMax: 2e-6 })),
    uMax: UCAP,
    start,
    guards: [0, 1, 2].map((i) => ({ index: i, max: 265 })),   // over-temperature
    workspace: () => true,
    dwell: true,                        // brick 48: this program HOLDS, so the excitation must
    seed,
  });
  let steps = 0;
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    p.step(cmd.map((c) => c.pos + c.u));
    steps++;
    const y = p.read();
    const want = tempsAt(cmd.map((c) => c.pos));
    pilot.observe(y, y.map((v, i) => v - want[i]));
  }
  return { pilot, steps };
}

function runRecipe(pilot, active) {
  const p = makeBarrel(11);              // a DIFFERENT noise stream from commissioning
  const start = powerFor(RECIPE[0]);
  for (let i = 0; i < 20000; i++) p.step(start);
  const S = pilot.sample, cache = new Map();
  const refAt = (i) => {
    const k = Math.min(Math.max(i * S, 0), PROG);
    let r = cache.get(k);
    if (!r) { r = powerFor(setpointAt(k)); cache.set(k, r); }
    return r;
  };
  if (active) pilot._initRun();
  let s2 = 0, n = 0, uPk = 0, worst = 0, clipped = 0;
  for (let k = 0; k < PROG; k++) {
    const set = setpointAt(k);
    const pn = powerFor(set);
    const u = active ? pilot.act((off) => refAt(Math.floor(k / S) + off)) : [0, 0, 0];
    const cmdP = pn.map((v, i) => v + u[i]);
    for (const v of cmdP) if (v < 0) clipped++;
    uPk = Math.max(uPk, ...u.map(Math.abs));
    p.step(cmdP);
    pilot.observe(p.read(), null);
    if (k > SEG) {                       // skip the first ramp: startup, not control
      // SCORED ON THE TRUE TEMPERATURE, which is the tracker's job — the pilot only
      // ever saw the delayed noisy reading, and the control objective is the metal.
      for (let i = 0; i < NZ; i++) {
        const e = p.T[i] - set[i];
        s2 += e * e; n++;
        worst = Math.max(worst, Math.abs(e));
      }
    }
  }
  return { rms: Math.sqrt(s2 / n), worst, uPk, clipped };
}

// ------------------------------------------------------------------------ the run
const t0 = Date.now();
const { pilot, steps } = await commission();
const st = pilot.status();
console.log(`    commissioned in ${steps} steps = ${(steps * DT / 3600).toFixed(1)} h of process `
  + `time; Ts ${st.Ts}, Tset ${st.Tset}, sample ${st.sample}, N ${st.N}, `
  + `rings ${JSON.stringify(st.rings)}`);
console.log(`    readouts: ${(st.report.readouts||[]).map((r, i) =>
  `z${i + 1} stride ${r.stride}/ridge ${r.ridge.toExponential(0)} R² ${r.r2Lead0.toFixed(3)}`).join(' · ')}`);
console.log(`    verify ${st.report.verify ? st.report.verify.ratio.toFixed(2) + 'x' : '—'} — ${pilot.verdict.why}`);

check('THREE channels commission from THREE signals, one measurement per channel',
  (st.report.readouts||[]).length === 3 && (st.report.readouts||[]).every((r) => !r.gated),
  JSON.stringify((st.report.readouts||[]).map((r) => r.gated)));
// THE DEAD TIME IS IN THE MEASURED TIMESCALE, not in anything anyone declared. A pilot
// that read the settle as if the delay were not there would build a horizon too short to
// cover its own response, which is the failure brick 46 documents from the other side.
check('…and the measured timescale accounts for the transport delay',
  st.Ts > DEAD * 2, `Ts ${st.Ts} against ${DEAD} steps of dead time`);
// A DIFFUSION CHAIN HAS NO COMPLEX POLES, so nothing here can ring and no sweep should
// be requested. The raw crossing count is not zero — the unmeasured ambient drift
// crosses the settled value — which is exactly why the mode test is a crossing count
// AND an overshoot.
// THE MODE TEST IS THE ONE STATISTIC STILL WOBBLING, and the cause is measured rather
// than guessed: `dc` is the mean of the response's tail, and an unmeasured drift moves
// that tail. EVERY probe statistic is normalised by `dc`, so a drift comparable to the
// probe's own response destabilises all of them together — across three probe
// amplitudes on this same plant the measured rise read 2354 / 2219 / 306 steps and the
// overshoot 1.36 / 1.42 / 0.00. The classical answer is a DIFFERENTIAL probe: step up,
// step down, difference the two, and anything slower than the probe cancels exactly.
// NOT BUILT — recorded here with the numbers that would falsify it.
console.log(`    rings ${JSON.stringify(st.rings)} overshoot `
  + `${JSON.stringify(st.overshoot.map((o) => o.toFixed(3)))} — the mode test on a plant with `
  + 'an unmeasured drift, see the note in this file');
check('the ring count is bounded rather than counting noise, which is what it did before',
  st.rings.every((r) => r < 10), JSON.stringify(st.rings));
// AND ON THIS PLANT IT DECLINES. The verify round measured below one against doing
// nothing, so the pilot refused — which is the contract, not a failure of it. Sixty
// steps of dead time on a signal whose noise is comparable to the error being corrected
// leaves the forecast too little to work with, and a controller that cannot beat doing
// nothing is one this project does not deploy. The tank process gave the same answer
// for a different reason (a right-half-plane zero), and in both cases the pilot reached
// it from measurements alone, with no idea what a dead time or a zero IS.
check('…and on a plant it cannot help, the gate REFUSES rather than deploying',
  pilot.verdict.deploy === false && (!st.report.verify || st.report.verify.ratio < 1.2),
  JSON.stringify(pilot.verdict));

const off = runRecipe(pilot, false);
const on = runRecipe(pilot, true);
const ratio = off.rms / on.rms;
console.log(`    changeover: temperature error ${off.rms.toFixed(3)} → ${on.rms.toFixed(3)} K rms `
  + `(${ratio.toFixed(2)}x), worst ${off.worst.toFixed(2)} → ${on.worst.toFixed(2)} K, `
  + `u peak ${on.uPk.toFixed(2)}% of ${UCAP}%, negative-power clips ${on.clipped}`);
check('…so the changeover runs exactly as it would have, untouched',
  ratio > 0.99 && ratio < 1.01, ratio.toFixed(4) + 'x');
check('…and a host that keeps feeding a refused pilot is not a crash',
  on.uPk === 0, on.uPk.toFixed(3));

// THE NOISE IS THE POINT. Every earlier plant on this project was deterministic, so the
// ridge the autotune chose was never doing the job a ridge exists for. Here it is.
console.log(`    NOTE the autotune chose ridge ${(st.report.readouts||[]).map((r) =>
  r.ridge.toExponential(0)).join('/')} against a noiseless plant's typical 1e-9..1e-5 — `
  + `the first plant here where regularisation had observation noise to regularise`);
check('the readouts still generalise on a plant with real measurement noise',
  (st.report.readouts||[]).every((r) => r.r2Lead0 > 0.4),
  JSON.stringify((st.report.readouts||[]).map((r) => r.r2Lead0.toFixed(3))));

// AND THE BASIS SELECTOR READS THIS BARREL'S PHYSICS (brick 54). A zone loses heat by
// radiation, which goes as T^4, and conducts to its neighbours through a gradient — so a
// forecast that is linear in the measured temperatures is leaving curvature on the table.
// Offered a quadratic block under a structured prior that ridges it a hundred times
// harder, the fit ACCEPTS it on the zones where that shows and declines it on the one
// where it does not: held-out R2 0.7288 -> 0.7647 on zone 0 and 0.7898 -> 0.8112 on zone
// 2, against 0.8450 -> 0.8526 on zone 1, which is inside the 5% residual band and stays
// linear. The Wood-Berry column, whose plant is linear transfer functions and nothing
// else, declines it on both loops — that pair is what says the selector is reading the
// physics rather than the sample count.
// AND IT IS NOW SCORED AT ALL, WHICH IT NEVER WAS (brick 55). This plant declares a
// dwelling program, and a DWELLING scribble cannot cross its 44 K box at the verify's
// quarter rates — the tune loop failed 21 times — so `_startVerify` threw and the pilot
// refused with a rate-limit message. It had done that since the plant was written: the
// ledger recorded "refuses (0.94x)" and there was never a 0.94x, or any other number.
// A regime that cannot be BUILT is not evidence about the controller. The verify now
// scores whichever regimes built, and the barrel's PROGRAM regime builds at those same
// limits without difficulty — so the refusal is finally a measurement (0.86x) rather
// than a construction failure, on a plant whose forecasts held R2 0.69..0.92.
check('the barrel is SCORED before it is refused, not refused for want of a regime',
  st.report.verify && st.report.verify.ratio > 0
  && (st.report.verifyRegimes || {}).built.includes('program'),
  JSON.stringify(st.report.verifyRegimes));
check('…and what could not be built is reported rather than swallowed',
  typeof (st.report.verifyRegimes || {}).skipped === 'string'
  && st.report.verifyRegimes.skipped.startsWith('scribble:'),
  JSON.stringify((st.report.verifyRegimes || {}).skipped || null));

check('the barrel accepts a nonlinear basis where its own physics is nonlinear',
  (st.report.readouts || []).some((r) => r.basis === 'linear+quadratic'),
  JSON.stringify((st.report.readouts || []).map((r) => r.basis)));

console.log(`    (commissioned and scored in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log(failed ? `\npilot/thermal: ${failed} check(s) FAILED\n` : '\npilot/thermal: all checks passed\n');
process.exit(failed ? 1 : 0);
