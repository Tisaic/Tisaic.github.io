// DOES THE MILL'S IDENTIFIED PLANT CONTAIN ITS TRANSPORT DELAY? — the untested candidate for the
// one refusal whose cause is still open.
//
// The mill refuses because its correction HARMS on every regime (scribble 0.63x, program 0.57x,
// representative 0.61x), and the cause on record is the fit target: `eFree` rms is 4.16x the
// truth's there against 0.96-1.08 on every other plant, and the same design matrix against the RAW
// truth reaches R^2 0.73 instead of 0.05. `eFree = truth - h*u`, so `h` is wrong.
//
// A TRUNCATED PROBE IS RULED OUT: the mill is byte-identical at probeRises 10, 25, 50 and 100 with
// the knob verified live. So it is not that the step response was cut short.
//
// WHAT IS LEFT IS THE DELAY. `rollmill-rig.mjs` routes an X-ray gauge 1.0 m downstream of the roll
// gap at 5 m/s on a 2 ms step — `DLY = 100 steps` — and says so in its own comment: "what the
// X-ray gauge reports: the truth, late and noisy". So the mill's truth arrives 100 steps after the
// `u` that caused it, and `truth - h*u` is only correct if `h` carries that dead time. If `h`
// instead responds immediately, the subtraction removes the correction's effect 100 steps EARLY,
// which corrupts the target while leaving its magnitude plausible — the same signature a mis-timed
// impulse produced in `_hcheck2.mjs` this session (matching rms, destroyed phase).
//
// THIS FILE ONLY LOOKS. It prints the identified impulse's shape against the delay the rig
// declares, and asserts nothing: where the dead time should sit is arithmetic the rig gives us,
// and whether `h` has it is a fact about the fit. A fix belongs after the fault is named, not
// before (rule 16 — and this project has twice built a fix for a fault it had not localised).
import { Pilot } from '../lib/pilot/pilot.js';
import * as R from './pilot/rigs/rollmill-rig.mjs';

const mill = R.makeMill(1);
const pilot = new Pilot({
  autoRefuse: true, nMeasured: 3,
  channels: [{ lo: -0.4, hi: 0.4, vMax: 2e-3, aMax: 1e-5, jMax: 1e-7 }],
  uMax: 0.25, start: [R.S0], workspace: () => true, seed: 1,
});
// THE TEST'S OWN ROUTING, COPIED EXACTLY, because the mill's is not the obvious one: it delays the
// REFERENCE by the same DLY as the gauge, so the truth is a properly ALIGNED error observed late
// rather than a misaligned one. Getting that wrong would manufacture the very fault this file is
// looking for. And the gauge is read ONCE per sample — the test's own comment says calling it
// twice draws two independent noise samples, so the signal the model is given and the truth it is
// asked to predict would disagree by 2 microns of pure noise.
let steps = 0;
const wantHist = [];
while (pilot.phase !== 'done' && steps < 4e6) {
  if (pilot.phase === 'fit') { pilot.work(); continue; }
  const cmd = pilot.command();
  mill.step(cmd[0].pos + cmd[0].u);
  steps++;
  wantHist.push((R.MM * cmd[0].pos + R.QM * R.H0) / (R.MM + R.QM));
  if (wantHist.length > R.DLY + 2) wantHist.shift();
  const want = wantHist.length > R.DLY ? wantHist[wantHist.length - 1 - R.DLY] : R.HREF;
  const g = mill.gauge();
  pilot.observe([mill.F, mill.S, g], [g - want]);
}
console.log(`roll mill — the identified plant against the delay the rig declares\n`);
console.log(`  the rig: L ${R.L_GAUGE} m at ${R.V_LINE} m/s on a ${R.DT}s step`
  + `  ->  DLY ${R.DLY} steps of transport delay`);
console.log(`  the pilot: Ts ${pilot.Ts}, sample ${pilot.sample}, grid ${pilot.grid}, N ${pilot.N}`);
const dec = pilot.grid * pilot.sample;
console.log(`  a decision is ${dec} steps, so the delay is ${(R.DLY / dec).toFixed(2)} decisions`
  + ` and ${(R.DLY / pilot.sample).toFixed(2)} samples`);
if (!pilot.hs || !pilot.hs[0]) { console.log('  no identified plant — commissioning stopped early'); process.exit(0); }
const hg = pilot.hs[0].hGrid, hsm = pilot.hs[0].hSample;
const show = (a, nm, per) => {
  let pk = 0, pi = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]) > Math.abs(pk)) { pk = a[i]; pi = i; }
  // WHERE THE RESPONSE STARTS, not just where it peaks: dead time is a run of near-zero taps at
  // the front, and a peak index alone cannot distinguish "delayed" from "slow".
  let on = -1;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]) > 0.05 * Math.abs(pk)) { on = i; break; }
  console.log(`\n  ${nm}: ${a.length} taps, one tap = ${per} steps`);
  console.log(`    first tap above 5% of peak at index ${on}  ->  ${on * per} steps`
    + `   (the rig's delay is ${R.DLY})`);
  console.log(`    peak at index ${pi} -> ${pi * per} steps, value ${pk.toExponential(3)}`);
  console.log(`    first 8 taps: ${Array.from(a.slice(0, 8)).map((v) => v.toExponential(2)).join(' ')}`);
};
show(hsm, 'hSample', pilot.sample);
show(hg, 'hGrid', dec);

// HOW MUCH OF THE IDENTIFIED PLANT SITS WHERE THE PLANT CANNOT RESPOND. Before the transport
// delay the true impulse is identically zero — the roll gap has not reached the gauge — so every
// unit of energy in those taps is noise fitted as dynamics, and `eFree = truth - h*u` convolves it
// against a broadband `u` across the whole record. That is a quantity, not an impression, and it
// is the one that should be small.
const energyBefore = (a, per) => {
  const cut = Math.floor(R.DLY / per);
  let pre = 0, all = 0;
  for (let i = 0; i < a.length; i++) { const e = a[i] * a[i]; all += e; if (i < cut) pre += e; }
  return { cut, pct: 100 * pre / (all || 1) };
};
for (const [a, nm, per] of [[hsm, 'hSample', pilot.sample], [hg, 'hGrid', dec]]) {
  const e = energyBefore(a, per);
  console.log(`\n  ${nm}: ${e.pct.toFixed(1)}% of the impulse's ENERGY lies in the first ${e.cut}`
    + ` taps — before the delay, where the true response is identically zero`);
}
console.log(`\n  verify ${pilot.status().report.verify ? pilot.status().report.verify.ratio.toFixed(2) + 'x' : '—'}`
  + `, verdict ${pilot.verdict && pilot.verdict.deploy ? 'DEPLOY' : 'refused'}`);
console.log('EXIT 0');
