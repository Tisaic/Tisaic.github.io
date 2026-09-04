// AUTHORITY AND IDENTIFICATION AMPLITUDE ARE THE SAME KNOB TODAY, AND THEY SHOULD NOT BE.
//
// `_cap` swept `uCap` and read: sharp 3.49x -> 3.11x -> 2.91x as the cap rose 0.6 -> 1.0 -> 1.5,
// with the correction coming OFF the cap at 1.0 — so more authority makes the hard program worse,
// and `report.binding`'s verdict of "model" (capFrac 0.0019) was right where reading `uPk == cap`
// as "authority-bound" was wrong. A peak touched briefly is not a duty cycle.
//
// BUT THAT SWEEP CANNOT SUPPORT EITHER CONCLUSION ON ITS OWN, because `uCap` sets `uMax` and
// `probeAmp` DEFAULTS TO 0.15*uMax with `ditherAmp` at 0.1*uMax. Raising the cap raises the
// IDENTIFICATION amplitude by the same factor, so the circle's 2.76x -> 4.30x may be an
// excitation effect wearing an authority label. One knob moving two things is the confound this
// project has caught in four other places (rules 17, 20: one variable at a time).
//
// AND SEPARATING THEM IS ALSO THE OWNER'S POINT, MEASURED. "The identity moves should be swept
// with varying amplitude": a single-amplitude probe describes a single operating point, while the
// correction at deploy ranges over the whole cap. If the plant is amplitude-dependent — and it is
// nonlinear, with backlash and Stribeck friction — then WHICH amplitude the model is identified at
// is a free and unexamined choice, and 0.15*uMax is a constant nobody re-derived.
//
// THE GRID: cap x probe amplitude, held apart. The diagonal of it is what `_cap` swept.
//
// AND IT ANSWERS A SECOND QUESTION AT NO EXTRA COST: DOES THE ARM EVER SELECT CURVATURE?
// `polyTerms` offers each channel a quadratic block — the products X*X, X*Y, Y*Y of the newest
// measured lag and the lead-0 command taps, under a ridge a hundred times harder so it must earn
// its weights — and both arm channels DECLINE it on held-out data at the shipped probe amplitude.
// The tank (outflow ~ sqrt(h)) and the barrel (radiating as T^4) accept it, and Wood-Berry's
// linear transfer functions decline it, which is the negative control that says the selection
// tracks physics rather than noise.
//
// BUT "THE ARM IS LINEAR" MAY BE A STATEMENT ABOUT THE PROBE AMPLITUDE. Brick 54 measured exactly
// that failure on the tank: a dwelling excitation hid the curvature and the fit chose linear,
// and a sweeping one exposed it and the machine went 1.11x -> 2.07x. This session measured the
// arm as strongly nonlinear at large amplitude — thirteen times the error with essentially none
// of it linearly explainable — so the basis each channel CHOOSES is reported per cell here.
//
// WHAT WOULD KILL IT: the score depends only on the cap and not on the probe amplitude, and the
// basis stays linear at every amplitude. Then 0.15*uMax is as good as anything, the arm really is
// linear over the range it is driven at, and the identification amplitude is not a lever.
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.AA_FEED || 0.004);
const CAPS = (process.env.AA_CAPS || '0.6,1.0').split(',').map(Number);
const AMPS = (process.env.AA_AMPS || '0.09,0.15,0.30').split(',').map(Number);   // as a fraction of uMax
const SHAPES = (process.env.AA_SHAPES || 'sharp,circle,rounded').split(',');
const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}`);
console.log(`the shipped pair is cap 0.60 with probe 0.15*uMax = 0.090 rad`);
let open = null;
for (const cap of CAPS) {
  for (const frac of AMPS) {
    const amp = frac * 0.6;   // ABSOLUTE, so the probe is the same rad at every cap — that is the
                              // whole point: the two knobs are held apart rather than tied.
    const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
      uCap: cap, before: (p) => { p.probeAmp = amp; p.ditherAmp = (2 / 3) * amp; } });
    if (!pilot) { console.log(`  cap ${cap} probe ${amp}: commissioning never terminated`); continue; }
    if (!open) {
      open = {};
      for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
      console.log(`open loop: ${SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  ')}`);
      console.log('\n   cap   probe' + SHAPES.map((s) => s.padStart(17)).join('') + '     geo mean   basis chosen');
    }
    const xs = [], cols = [];
    for (const s of SHAPES) {
      const d = await deployOn(pilot, s, true, FEED);
      const x = open[s] / d.r.totalRms;
      xs.push(x); cols.push(`${x.toFixed(2)}x u${d.uPk.toFixed(3)}`.padStart(17));
    }
    const basis = pilot.readouts.map((r) => (r.poly ? 'quad' : 'lin') + (r.sched ? '+sched' : '')).join('/');
    console.log(`  ${cap.toFixed(2)}   ${amp.toFixed(3)}${cols.join('')}   ${gm(xs).toFixed(2).padStart(10)}`
      + `   ${basis}`);
  }
}
console.log('EXIT 0');
