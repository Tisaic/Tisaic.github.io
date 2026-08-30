/**
 * @file STEP 6 REPLACEMENT EXPERIMENT — sweep the QP's iteration budget and score the
 *       MACHINE, not the solver's own residual.
 *
 * `test/pilot/rti.test.mjs` measured that one iteration does not track sixty, and the
 * sweep underneath it measured something more awkward: sixty is itself only 77% of the
 * way to the QP's own optimum. That makes "is 60 enough?" the wrong question, because it
 * scores the solver against itself (rule 16). The only question that pays is what the
 * MACHINE does, so this file commissions ONE pilot and then re-deploys that same model at
 * a ladder of iteration budgets, changing nothing else.
 *
 * Run: node test/pilot/qpsweep.mjs
 */
import { Pilot } from '../../lib/pilot/pilot.js';
import { DT, P, PR, makeMachine } from './emps-rig.mjs';

const ITERS = (process.env.ITERS || '1,2,4,8,16,32,60,120,240,480').split(',').map(Number);

// A SECOND PROGRAM THE MODEL NEVER SAW, so the corner below can be told apart from a grid
// artifact. Two tones at 6 and 13 cycles per lap, inside the machine's envelope — the same
// signal `stack.test.mjs` uses for exactly this purpose. A corner picked on one program and
// held on another is a setting; one that moves is a coincidence dressed as a result.
const SIN = { q: new Float64Array(P) };
{
  const A1 = 0.012, w1 = 2 * Math.PI * 6 / (P * DT), A2 = 0.002, w2 = 2 * Math.PI * 13 / (P * DT);
  for (let k = 0; k < P; k++) {
    const t = k * DT;
    SIN.q[k] = 0.13 + A1 * Math.sin(w1 * t) + A2 * Math.sin(w2 * t);
  }
}

function score(ff) {                      // the shipped cascade, for the denominator
  const m = makeMachine(PR.q[0], ff);
  let s = 0, n = 0;
  for (let k = 0; k < 8 * P; k++) {
    m.step(PR.q[((k - 1) % P + P) % P]);
    if (k >= 4 * P) { const e = m.q - PR.q[k % P]; s += e * e; n++; }
  }
  return 1000 * Math.sqrt(s / n);
}
const shipped = score(0);

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
const shippedIters = pilot.qpIters;
const st = pilot.status();

function runPilot(iters, prog = PR, active = true) {
  pilot.qpIters = iters;
  const m = makeMachine(prog.q[0], 0), S = pilot.sample;
  pilot._initRun();
  let s = 0, mx = 0, n = 0, uPk = 0, pref = prog.q[0];
  const LAPS = 10;
  const t0 = process.hrtime.bigint();
  for (let k = 0; k < LAPS * P; k++) {
    m.step(pref);
    const u = active ? pilot.act((off) => [prog.q[(((Math.floor(k / S) + off) * S) % P + P) % P]]) : [0];
    uPk = Math.max(uPk, Math.abs(u[0]));
    pref = prog.q[k % P] + u[0];
    pilot.observe([m.q], null);
    if (k >= (LAPS - 4) * P) { const e = m.q - prog.q[k % P]; s += e * e; mx = Math.max(mx, Math.abs(e)); n++; }
  }
  const ns = Number(process.hrtime.bigint() - t0) / (LAPS * P);
  return { rms: 1000 * Math.sqrt(s / n), mx: 1000 * mx, uPk: 1000 * uPk, ns };
}
const sinOpen = runPilot(1, SIN, false).rms;

// ------------------------------------------------------ THE SECOND KNOB: THE HORIZON
// LEAD-BANK TRUNCATION. The cost table below says the QP and the forecast BOTH scale with N,
// so N is the only knob that cuts both — and it needs no re-commission, because the readout
// bank holds one weight vector per lead and using the first N' of them is a strictly smaller
// model fitted by the same run. Set N before `_initRun` and the horizon buffers are built at
// the new size; the impulse response is longer than any N' so `boxQP` sees min(N', M) = N'.
const NFULL = pilot.N;
const NS = (process.env.NS || '').split(',').filter(Boolean).map(Number);


console.log(`\nqpIters sweep on EMPS — one commissioned model, deployed ${ITERS.length} times`);
console.log(`  shipped cascade ${shipped.toFixed(4)} mm rms; pilot N=${st.N} nc=${st.nc ?? '?'} `
  + `sample=${st.sample} Ts=${st.Ts}; qpIters as built = ${shippedIters}`);
console.log('  iters      rms mm        x     peak mm    uPk mm    µs/step');
const rows = [];
for (const it of ITERS) {
  const r = runPilot(it);
  rows.push({ it, ...r });
  console.log(`  ${String(it).padStart(5)}   ${r.rms.toFixed(5).padStart(9)}  ${(shipped / r.rms).toFixed(2).padStart(7)}x  `
    + `${r.mx.toFixed(4).padStart(8)}  ${r.uPk.toFixed(4).padStart(8)}  ${(r.ns / 1000).toFixed(2).padStart(7)}`);
}
// WHAT EACH BUDGET COSTS, on the pilot's own cost model rather than on wall clock — the
// online requirement is MAC per 1 ms cycle against 10,000, and a µs/step figure measured on
// a dev machine under contention cannot be converted into one.
console.log('\n  iters   forecast   free+QP   peak MAC  peak %  sliced %');
for (const it of ITERS) {
  pilot.qpIters = it;
  const c = pilot.cost();
  console.log(`  ${String(it).padStart(5)}   ${(c.features + c.dots).toLocaleString().padStart(8)}  ${c.qp.toLocaleString().padStart(8)}  ${c.peakMacPerCycle.toLocaleString().padStart(9)}  ${(100 * c.peakMacPerCycle / 10000).toFixed(0).padStart(5)}%  ${(100 * c.slicedMacPerCycle / 10000).toFixed(0).padStart(7)}%`);
}
pilot.qpIters = shippedIters;

if (NS.length) {
  console.log(`\n  horizon x iteration corner — the SAME fitted bank, truncated to`
    + ` its first N leads (full N = ${NFULL})`);
  console.log(`  the program the model was fitted against, and a two-tone sine it has never`
    + ` seen (open loop ${sinOpen.toFixed(5)} mm)`);
  console.log('  iters      N   program mm        x      sine mm        x     peak MAC  peak %  sliced %');
  const grid = (process.env.NITERS || '4').split(',').map(Number);
  for (const it of grid) {
    for (const nn of NS) {
      pilot.N = nn;
      const r = runPilot(it);
      const q = runPilot(it, SIN);
      const c = pilot.cost();
      console.log(`  ${String(it).padStart(5)}  ${String(nn).padStart(5)}   ${r.rms.toFixed(5).padStart(9)}  `
        + `${(shipped / r.rms).toFixed(2).padStart(7)}x  ${q.rms.toFixed(5).padStart(9)}  `
        + `${(sinOpen / q.rms).toFixed(2).padStart(7)}x  `
        + `${c.peakMacPerCycle.toLocaleString().padStart(9)}  `
        + `${(100 * c.peakMacPerCycle / 10000).toFixed(0).padStart(5)}%  `
        + `${(100 * c.slicedMacPerCycle / 10000).toFixed(0).padStart(7)}%`);
    }
  }
  pilot.N = NFULL; pilot.qpIters = shippedIters;
}

const best = rows.reduce((a, b) => (b.rms < a.rms ? b : a));
const band = rows.filter((r) => r.rms <= best.rms * 1.05);
const cheapest = band.reduce((a, b) => (b.it < a.it ? b : a));
console.log(`\n  best ${best.it} iters at ${best.rms.toFixed(5)} mm; within 5% of it, the cheapest is `
  + `${cheapest.it} iters at ${cheapest.rms.toFixed(5)} mm (rule 42).`);
