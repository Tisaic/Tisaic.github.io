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
import { Pilot, setSolverDefaults } from '../lib/pilot/pilot.js';
// Off unless asked, so the control row is the shipped behaviour.
if (process.env.MD_SUSTAIN === '1') setSolverDefaults({ riseSustain: true });
import * as R from './pilot/rigs/rollmill-rig.mjs';

// THE TEST'S EXACT CONFIGURATION, copied rather than chosen. The first version of this file picked
// its own channel limits and uMax and read verify 1.01x where the test reads 0.61x — so it was
// diagnosing A mill commissioning and not THE one that refuses, which makes any conclusion about
// the refusal unavailable. The rate limits in particular are load-bearing: the test's own comment
// records that routing them at 2e-4 put the eccentricity disturbance outside the identification
// bandwidth entirely and the pilot refused at 0.40x for having no model where the disturbance
// lives.
const mill = R.makeMill(1);
mill.quiet = true;
for (let i = 0; i < 4000; i++) mill.step(R.S0);
const pilot = new Pilot({
  autoRefuse: true, nMeasured: 3,
  channels: [{ lo: R.S0 - 0.12, hi: R.S0 + 0.12, vMax: 3e-3, aMax: 3e-4, jMax: 3e-5 }],
  uMax: 0.06,
  start: [R.S0],
  guards: [{ index: 0, max: 400 }],
  workspace: () => true,
  verifyRef: () => [R.S0],
  seed: 1,
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

// THE PROBE'S OWN NUMBERS, because two hypotheses about `Ts` have now died against measurement —
// a truncated probe (byte-identical at 10/25/50/100 rises) and a noise SPIKE (byte-identical with
// the crossing required to persist for i/2 samples). What sets `Ts` is a crossing of 0.9*|dc|, so
// if the crossing at index 9 is genuine and sustained then `dc` is the remaining suspect: a small
// or mis-estimated settled value lowers the bar to where ordinary early content clears it.
const H = pilot.hs[0];
// THE FLOOR MUST BE COMPARED IN THE RESPONSE'S OWN UNITS. `resp` is `(v - base) / amp`, so it is
// normalised per unit probe amplitude, while `noise` is left in raw truth units — the code divides
// when it compares them (`4 * noise / amp / sqrt(W)`) and the first version of this diagnostic did
// not. Comparing an unnormalised floor against a normalised response is a units error of exactly
// the kind rule 17 is about, and it would have manufactured a disturbance that is not there.
const AMP = pilot.probeAmp || (pilot._probe && pilot._probe.amp) || null;
console.log(`\n  probe amplitude ${AMP === null ? '?' : AMP.toExponential(3)}`
  + `  ->  the floor in response units is ${AMP ? (H.noise / AMP).toExponential(3) : '?'}`);
console.log(`  the probe: dc ${H.dc.toExponential(3)}, noise ${H.noise.toExponential(3)}`
  + `, |dc|/noise ${(Math.abs(H.dc) / Math.max(H.noise, 1e-300)).toFixed(2)}`
  + `, resp ${H.resp.length} samples`);
{
  const r = H.resp;
  let pk = 0; for (const v of r) if (Math.abs(v) > Math.abs(pk)) pk = v;
  const bar = 0.9 * Math.abs(H.dc);
  console.log(`    the bar Ts crosses is 0.9*|dc| = ${bar.toExponential(3)}`
    + `, and the response's own peak is ${pk.toExponential(3)}`
    + `  ->  the bar is ${(bar / Math.abs(pk) * 100).toFixed(1)}% of the peak`);
  const seg = (a, b) => {
    let s2 = 0, n = 0;
    for (let i = a; i < Math.min(b, r.length); i++) { s2 += r[i] * r[i]; n++; }
    return n ? Math.sqrt(s2 / n) : 0;
  };
  console.log(`    rms over steps   0-99 (inside the dead time) ${seg(0, 100).toExponential(3)}`);
  console.log(`    rms over steps 100-317 (the true response)   ${seg(100, 318).toExponential(3)}`);
  console.log(`    if the first is not far below the second, the probe cannot see the delay at all`);
}
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
// AND THE SECOND GAP: IS `h*u` THE RIGHT SIZE? The recorded corruption is that `eFree` rms is
// 4.16x the truth's, and `eFree = truth - h*u`. A purely MIS-TIMED `h*u` of the right magnitude
// subtracts incoherently and gives about sqrt(2)x; reaching 4.16x needs `h*u` several times larger
// than the truth it is being subtracted from. Timing and scale are different faults with different
// fixes, and the ratio below is what separates them — computed from the commissioning record the
// fit actually used, not from a fresh run.
const rec = pilot._rec;
if (rec && rec.u && rec.e && rec.e.length) {
  const n = Math.min(rec.e.length, rec.u.length);
  const from = Math.floor(n / 3);                 // settled rows only (rule 13)
  let st = 0, sh = 0, k = 0;
  for (let i = from; i < n; i++) {
    let conv = 0;
    for (let m2 = 0; m2 < hsm.length && i - m2 >= 0; m2++) conv += hsm[m2] * (rec.u[i - m2][0] || 0);
    const t = rec.e[i] ? (rec.e[i][0] || 0) : 0;
    st += t * t; sh += conv * conv; k++;
  }
  if (k) {
    const tr = Math.sqrt(st / k), hr = Math.sqrt(sh / k);
    console.log(`\n  truth rms ${tr.toExponential(3)},  h*u rms ${hr.toExponential(3)}`
      + `  ->  h*u is ${(hr / tr).toFixed(2)}x the truth`);
    console.log(`    a mis-TIMED h*u of the right size would sit near 1.00x here and make eFree`
      + ` about 1.41x the truth; the recorded eFree is 4.16x, which needs this ratio near 4`);
  }
} else console.log('\n  no commissioning record retained — the scale question cannot be asked here');

console.log(`\n  verify ${pilot.status().report.verify ? pilot.status().report.verify.ratio.toFixed(2) + 'x' : '—'}`
  + `, verdict ${pilot.verdict && pilot.verdict.deploy ? 'DEPLOY' : 'refused'}`);
console.log('EXIT 0');
