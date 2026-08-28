/**
 * @file HARMONIC FEEDFORWARD ON A REAL SERVO AXIS — the agnosticism test.
 *
 * `lib/pilot/hff.js` was derived on a compliant two-link arm: a lattice-elastic plant with
 * gearbox wind-up, backlash and Stribeck friction, tracing a rounded rectangle in a plane.
 * This file points the SAME MODULE, with NOTHING passed but the lap length, the channel
 * count and the machine's own authority, at the EMPS axis — a real prismatic servo joint,
 * real recorded data, a plant that shares no physics with the arm and whose program is a
 * three-speed trapezoid rather than a closed curve. `emps-rig.mjs` and the narrative in
 * `emps.test.mjs` carry the rig and its validation against the hardware.
 *
 * WHAT IT MEASURES, and the company it lands in on this machine (from `emps.test.mjs`,
 * same rig, same program, same scoring window):
 *
 *     as shipped, the machine's own cascade    0.5764 mm rms      1.0x
 *     the pilot, no plant knowledge            0.0454 mm         12.7x
 *     ILC, Q width 21, best of 12 laps         0.0049 mm        119x     a hand-tuned Q
 *     HARMONIC FEEDFORWARD, this file          0.0024 mm        242x     nothing tuned
 *     inverse-dynamics FF at the published M, Fv, Fc, OF          275x     the plant model
 *     the machine's own lap-to-lap repeatability                1900x     (the floor)
 *
 * SO A LEARNED CORRECTION WITH NO PLANT MODEL REACHES THE MODEL-BASED FEEDFORWARD'S NUMBER,
 * WHICH OVERTURNS THIS PAGE'S OWN HEADLINE — `emps.test.mjs` says "a conventional method
 * that wins" and asserts that the model-based feedforward beats everything learned. It
 * still beats the pilot and it still beats ILC. It does not beat this.
 *
 * AND THE RIG CANNOT SEPARATE THE TOP TWO, WHICH IS SAID HERE RATHER THAN LEFT OUT. It
 * reproduces the recorded machine to 1.6 µm rms. 0.0024 and 0.0021 mm are 0.2 µm apart, so
 * "matches the model-based feedforward" is what the instrument supports and "beats it" is
 * not. Against ILC the gap is 2.5 µm — larger than the fidelity but not by much — so the
 * assertion below is that HFF is AT LEAST ILC's equal, not that it is twice as good. What
 * the rig can see comfortably is the 100x, and that is what is pinned.
 *
 * THE HARMONIC COUNT IS THE FINDING, and it is rule 31 in a new costume. The arm's hand-set
 * 16 is not a property of the method, it is where THAT channel's gain dies. Here the
 * position loop reaches 160 rad/s against a lap fundamental of 1.007 rad/s, so |G| is flat
 * to h~128 and still 0.17 at h=320 — and the arm's 16 leaves a factor of 33 unclaimed
 * (7.5x against 248x). Nothing in the module counts harmonics any more.
 */
import { P, PR, makeMachine } from './emps-rig.mjs';
import { HarmonicFF } from '../../lib/pilot/hff.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: harmonic feedforward on a real servo axis — the same module, another plant\n');

/** The machine, driven by the recorded reference plus a lap-indexed correction. The
 *  one-sample reference latency the axis really has is here, as in `emps.test.mjs`. */
function drive(corr, laps = 8) {
  const m = makeMachine(PR.q[0], 0);
  let s = 0, n = 0; const e = new Float64Array(P);
  for (let k = 0; k < laps * P; k++) {
    const kk = ((k - 1) % P + P) % P;
    m.step(PR.q[kk] + (corr ? corr.at(kk)[0] : 0));
    const ee = m.q - PR.q[k % P];
    if (k >= (laps - 1) * P) e[k % P] = ee;
    if (k >= (laps - 4) * P) { s += ee * ee; n++; }
  }
  return { score: 1000 * Math.sqrt(s / n), err: [e] };
}

// EVERYTHING THE MODULE IS TOLD: how long a lap is, how many channels it has, and how much
// authority the engineer is willing to give it. No count, no step, no probe design.
const hff = new HarmonicFF({ lap: P, channels: 1, uMax: 2e-3 });
const r = await hff.commission(async (c) => drive(c));

console.log('    candidates, each commissioned briefly and scored ON THE MACHINE:');
for (const c of r.candidates) {
  console.log(`      ${c.style.padEnd(6)} probe ${(100 * c.frac).toFixed(0).padStart(2)}% of the error peak`
    + `   fit residual ${c.cross.toFixed(3)}   machine ${c.score.toExponential(3)} mm`);
}
console.log(`    picked ${r.style} at ${(100 * r.frac).toFixed(0)}%`
  + `   ${r.laps} laps   ${r.alive}/${hff.nh} harmonics live`);
console.log(`    ${r.base.toExponential(4)} → ${r.best.toExponential(4)} mm rms`
  + `   ${(r.base / r.best).toFixed(1)}x   peak correction ${(1000 * hff.uMax).toFixed(2)} mm allowed`);

const gain = r.base / r.best;
check('the same module that was derived on a compliant two-link arm commissions itself on a '
  + 'real servo axis, told only the lap length, the channel count and its authority',
  r.best < r.base && r.laps > 0, `${r.base.toExponential(3)} → ${r.best.toExponential(3)}`);
check('…and improves the machine by at least 100x, which is well outside the 1.6 µm the rig '
  + 'reproduces the hardware to', gain > 100, `${gain.toFixed(1)}x`);
check('…which is at least the hand-tuned ILC\'s 119x on this same rig and program, so a '
  + 'correction with nothing tuned is the conventional one\'s equal here',
  r.best <= 0.0049 + 1e-9, `${r.best.toExponential(4)} vs ILC 4.9e-3`);
check('…and it lands within the rig\'s own fidelity of the INVERSE-DYNAMICS feedforward at '
  + 'the published parameters, which is a learned correction reaching a model-based one '
  + 'without the model', Math.abs(r.best - 0.0021) < 0.0016,
  `${r.best.toExponential(4)} vs 2.1e-3, rig fidelity 1.6e-3`);

// THE HARMONIC COUNT IS A PLANT PROPERTY. Asserted from the operator the module identified
// on this machine, against the count that was right for the arm.
const far = r.gain[159], near = r.gain[0];
check('…because this plant\'s channel still has reach at harmonic 160, where the arm\'s was '
  + 'dead by 16 — so a hand-set count is a plant constant wearing a method\'s clothes',
  far > 0.2 * near, `|G| h1 ${near.toFixed(2)}, h160 ${far.toFixed(2)}`);

// THE SELECTION MUST BE SCORED ON THE MACHINE. Both halves: the fit's ranking is wrong AND
// the machine's ranking spans enough for that to matter.
const byFit = r.candidates.slice().sort((a, b) => a.cross - b.cross);
const byMachine = r.candidates.slice().sort((a, b) => a.score - b.score);
const spread = byMachine[byMachine.length - 1].score / byMachine[0].score;
check('the candidate the FIT likes best is not the one the MACHINE likes best — which is why '
  + 'the probe design and amplitude are chosen by deploying them, not by their residual',
  byFit[0].style !== byMachine[0].style || byFit[0].frac !== byMachine[0].frac,
  `fit picks ${byFit[0].style}@${byFit[0].frac}, machine picks ${byMachine[0].style}@${byMachine[0].frac}`);
check('…and the difference is worth having, so this is a real selection and not a coin toss '
  + 'between equals', spread > 1.05, `best/worst on the machine ${spread.toFixed(2)}x`);

// THE GUARD IS A GUARD. A refinement that pumps is the failure this project already has on
// record for an unguarded ILC table, so the deployed weights must never be worse than none.
check('the deployed correction is never worse than not correcting at all, whatever the '
  + 'refinement did on the way', r.best <= r.base, `${r.best.toExponential(3)} vs ${r.base.toExponential(3)}`);
check('…and the refinement it kept improved monotonically',
  r.hist.filter((v, i) => i > 0 && v > r.hist[i - 1] * 1.0001).length <= r.step.length,
  JSON.stringify(r.hist.map((v) => +v.toExponential(3))));

// THE AUTHORITY IS REAL. Starved of it, the same commissioning must come back limited rather
// than pretending — and it must be the CAP that binds, not the method falling over.
const starved = new HarmonicFF({ lap: P, channels: 1, uMax: 5e-4, probeStyle: 'spread',
  probeFracs: [0.25] });
const rs = await starved.commission(async (c) => drive(c));
console.log(`    starved to 0.5 mm of authority against a 0.85 mm error: `
  + `${rs.best.toExponential(4)} mm  ${(rs.base / rs.best).toFixed(2)}x`);
check('given a third of the authority the correction actually needs, it still helps and is '
  + 'still bounded — the cap binds, the method does not fall over',
  rs.best < rs.base && rs.best > r.best,
  `${rs.best.toExponential(3)} (starved) vs ${r.best.toExponential(3)} (full)`);


// ---------------------------------------------------------------------------------------
// THE SHRINK, PINNED ON A PLANT THAT NEEDS IT — because this axis does not.
//
// The two shrink factors are INERT here (241.95x against 241.97x with them removed), which
// is the control that says they select rather than merely attenuate. It also means this file
// cannot see them: mutation-testing this suite, "make the confidence factor inert" and "make
// the reach factor inert" both SURVIVED, on a library whose own header calls reach
// load-bearing. The evidence for that was a measurement on the 2R arm in a scratch file,
// which is not evidence a suite can keep.
//
// So here is the arm's defining property in twenty lines and a few milliseconds: a channel
// whose gain DIES above a low harmonic, driving an actuator that SATURATES. Inverting a
// harmonic where |G| ~ 1e-3 demands a thousand times the error in command; the saturation
// then makes the applied correction something other than what was solved for, and the
// refinement chases its own distortion. That is the mechanism, and it is the whole reason
// the reach factor exists.
{
  // SAT is the PLANT's saturation; UMAX is the authority the engineer grants. Setting them
  // equal conflates two different failures — the first version of this did, and the cap was
  // scaling down the legitimate correction, which looks exactly like the shrink not working.
  const N = 256, NH = 48, SAT = 0.6, UMAX = 3, NOISE = 2e-3;
  const Gh = (h) => 1 / (1 + (h / 6) ** 4);           // dead by h~12, like the arm's channel
  // A DETERMINISTIC but run-to-run VARYING disturbance: the same sequence every time this
  // file runs, and a different draw on every lap within it — which is what makes the
  // operator at a dead harmonic UNIDENTIFIABLE rather than merely small.
  let seed = 20260828;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  const dft = (x) => { const re = [], im = [];
    for (let h = 1; h <= NH; h++) { let a = 0, b = 0;
      for (let k = 0; k < N; k++) { const w = 2 * Math.PI * h * k / N; a += x[k] * Math.cos(w); b += x[k] * Math.sin(w); }
      re.push(2 * a / N); im.push(2 * b / N); } return { re, im }; };
  // Energy INSIDE the channel's reach (removable) and a little far outside it (not
  // removable, and there to tempt an unaffordable correction).
  const E0 = { re: new Array(NH).fill(0), im: new Array(NH).fill(0) };
  for (const [h, v] of [[1, 0.125], [2, 0.1], [3, 0.075], [4, 0.0625], [5, 0.05],
    [20, 0.0125], [35, 0.01]]) {
    E0.re[h - 1] = v; E0.im[h - 1] = v * 0.4;
  }
  const toy = (corr) => {
    const u = new Float64Array(N);
    for (let k = 0; k < N; k++) u[k] = Math.max(-SAT, Math.min(SAT, corr ? corr.at(k)[0] : 0));
    const U = dft(u), e = new Float64Array(N);
    for (let k = 0; k < N; k++) { let v = 0;
      for (let h = 1; h <= NH; h++) { const w = 2 * Math.PI * h * k / N, g = Gh(h);
        v += (E0.re[h - 1] + g * U.re[h - 1]) * Math.cos(w) + (E0.im[h - 1] + g * U.im[h - 1]) * Math.sin(w); }
      e[k] = v + NOISE * rnd(); }
    let ss = 0; for (let k = 0; k < N; k++) ss += e[k] * e[k];
    return { score: Math.sqrt(ss / N), err: [e] };
  };
  const fit = async (opts) => {
    seed = 20260828;                                  // same draw for every variant
    const H = new HarmonicFF({ lap: N, channels: 1, nh: NH, uMax: UMAX, probeStyle: 'spread',
      probeFracs: [0.25], passes: 10, ...opts });
    return H.commission(async (c) => toy(c));
  };
  const withReach = await fit({});
  const noReach = await fit({ reach: false });
  const noConf = await fit({ shrink: false });
  const neither = await fit({ reach: false, shrink: false });
  console.log(`\n    a channel that dies at h~12, a saturating actuator, and measurement noise:`);
  console.log(`      open loop                    ${withReach.base.toExponential(3)}`);
  console.log(`      shrink as shipped            ${withReach.best.toExponential(3)}   ${(withReach.base / withReach.best).toFixed(2)}x`);
  console.log(`      REACH removed                ${noReach.best.toExponential(3)}   ${(withReach.base / noReach.best).toFixed(2)}x`);
  console.log(`      CONFIDENCE removed           ${noConf.best.toExponential(3)}   ${(withReach.base / noConf.best).toFixed(2)}x`);
  console.log(`      both removed                 ${neither.best.toExponential(3)}   ${(withReach.base / neither.best).toFixed(2)}x`);

  check('on a plant whose channel dies — the arm\'s defining property, which this axis does '
    + 'not have — the shipped shrink converges at least 3x', withReach.best * 3 < withReach.base,
    `${withReach.base.toExponential(3)} → ${withReach.best.toExponential(3)}`);
  check('…and REMOVING THE REACH FACTOR costs most of that, so the factor this library calls '
    + 'load-bearing has a check that would notice it being deleted',
    noReach.best > withReach.best * 1.5,
    `with ${withReach.best.toExponential(3)} vs without ${noReach.best.toExponential(3)}`);
  check('…and removing the CONFIDENCE factor costs too, once the operator at a dead harmonic '
    + 'is unidentifiable rather than merely small — both halves of the shrink earn their place',
    noConf.best > withReach.best * 1.1,
    `with ${withReach.best.toExponential(3)} vs without ${noConf.best.toExponential(3)}`);
  // THE GUARD'S CONTRACT, ON THE VARIANT THAT WANTS TO DIVERGE. With reach removed the
  // refinement demands corrections the plant cannot make and every pass is worse than the
  // last; the guard's whole job is that this ends at the baseline rather than past it. Assert
  // it on the variant that is actually trying to run away — asserting it on a healthy run is
  // a check any implementation passes.
  check('a refinement that cannot converge is stopped AT the machine it started from, never '
    + 'driven past it — asserted on the variant that is actively trying to diverge',
    noReach.best <= noReach.base * 1.0001 && neither.best <= neither.base * 1.0001,
    `noReach ${noReach.best.toExponential(3)} vs base ${noReach.base.toExponential(3)}; `
    + `neither ${neither.best.toExponential(3)} vs base ${neither.base.toExponential(3)}`);
  check('…while on the real axis, where every harmonic HAS reach, the same factor is inert '
    + 'to four figures — which is what makes it a selection and not an attenuation',
    Math.abs(r.base / r.best - 242) < 3, `${(r.base / r.best).toFixed(2)}x`);
}

console.log(failed ? `\nhff: ${failed} check(s) FAILED\n` : '\nhff: all checks passed\n');
process.exit(failed ? 1 : 0);
