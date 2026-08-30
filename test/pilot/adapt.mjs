/**
 * @file THE MEMORY IS RETIRED, SO SOMETHING ADDRESSED BY STATE HAS TO DO ITS JOB.
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
    if (W0[c]) for (let i = 0; i < ro.w.length; i++) ro.w[i].set(W0[c][i]);
    ro._w0 = null; ro._aQ = null; ro._adapt = null;
  });
}

/** Deploy on `prog`, optionally adapting against the error the machine really has. */
function run(prog, adapt) {
  restore();
  pilot.adapt = adapt;
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
      pilot.observe([m.q], adapt ? [err] : null);
      ls += err * err; ln++;
      if (lap >= LAPS - 4) { s += err * err; n++; }
    }
    perLap.push(1000 * Math.sqrt(ls / ln));
  }
  const rep = pilot.status().report;
  const a = rep && rep.adapt && rep.adapt[0] ? rep.adapt[0] : null;
  return { rms: 1000 * Math.sqrt(s / n), uPk: 1000 * uPk, perLap, a };
}

const openProg = openLoop(PR), openSine = openLoop(SIN);
console.log(`\npilot: online adaptation on EMPS — can a STATE-addressed model do the memory's job?`);
console.log(`  commissioned: Ts ${st.Ts} sample ${st.sample} N ${st.N}, verify `
  + `${st.report.verify ? st.report.verify.ratio.toFixed(2) + 'x' : '—'}`);
console.log(`  open loop: program ${openProg.toFixed(4)} mm, held-out sine ${openSine.toFixed(4)} mm`);
console.log(`  the bar: a lap-indexed table on this axis reaches 0.0024 mm (242x) on the program`
  + ` it learned, and 0.53x — WORSE than nothing — on this same sine.`);

const MUS = (process.env.MU || '0,0.02,0.05,0.15,0.4').split(',').map(Number);
const CLAMPS = (process.env.CLAMP || '0.25,1,4').split(',').map(Number);
const STRIDES = (process.env.STRIDE || '8,2,1').split(',').map(Number);

console.log('\n     mu  clamp  stride    program mm        x     sine mm        x   updates  drift  frozen');
const base = run(PR, null), baseS = run(SIN, null);
console.log(`  frozen      —       —   ${base.rms.toFixed(5).padStart(9)}  ${(openProg / base.rms).toFixed(2).padStart(6)}x  `
  + `${baseS.rms.toFixed(5).padStart(9)}  ${(openSine / baseS.rms).toFixed(2).padStart(6)}x        —      —       —`);
for (const mu of MUS) {
  if (mu === 0) continue;
  for (const clamp of CLAMPS) {
    for (const stride of STRIDES) {
      const cfg = { mu, clamp, leadStride: stride, freezeAfter: 3 };
      const r = run(PR, cfg), q = run(SIN, cfg);
      console.log(`  ${String(mu).padStart(5)}  ${String(clamp).padStart(5)}  ${String(stride).padStart(6)}   `
        + `${r.rms.toFixed(5).padStart(9)}  ${(openProg / r.rms).toFixed(2).padStart(6)}x  `
        + `${q.rms.toFixed(5).padStart(9)}  ${(openSine / q.rms).toFixed(2).padStart(6)}x  `
        + `${String(r.a ? r.a.updates : 0).padStart(8)}  ${(r.a ? r.a.drift : 0).toFixed(3).padStart(5)}  `
        + `${r.a && r.a.frozen ? 'FROZE' : '  —  '}`);
    }
  }
}
// THE LAP TRACE OF THE BEST SETTING, because "did it converge or was it always there" is the
// question a single rms cannot answer and the one that decides whether this is the memory's
// replacement or just a slightly better model.
