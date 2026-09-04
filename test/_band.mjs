// IS THE ERROR THAT REMAINS EVEN REACHABLE? — the one hypothesis that explains two whole classes
// of null at once, and which nothing in this section has tested.
//
// THE NULLS SORT INTO THREE SHAPES, AND TWO OF THEM SHARE A CANDIDATE CAUSE.
//
//   SHAPE 1, "the model got better and the machine did not" — seven times. Log-spaced lags lifted
//   the sharp square's elbow at LEAD 0 from held-out R^2 0.4664 to 0.5545 and delivered +0.6%.
//   Leaky states, the validated dictionary (+23% validation, programs worse), `leadTrust`, the
//   theta-grid, the forecast gate: all the same shape.
//
//   SHAPE 2, "the correction changed a lot and the machine did not" — five times. Raising the cap
//   takes uPk from 0.600 to 1.000 — used in full — with the score identical to three figures on
//   all three programs. `leadTrust` moved uPk 0.397 -> 0.736 for 0.0%. `qpIters` changes the
//   correction's whole frequency content and the score moves monotonically the WRONG way.
//
//   SHAPE 3, "it helped here and hurt there" — five times, and that one is understood: one global
//   number cannot serve a corner and an arc.
//
// SHAPES 1 AND 2 ARE WHAT YOU SEE IF THE REMAINING ERROR IS LARGELY OUTSIDE THE CORRECTION'S
// REACH. Predicting an unreachable component better cannot help; pushing harder at it cannot
// either. Two symptoms, one cause. And the channel was measured this session: |H| at the lap's
// harmonics runs 0.884, 0.796, 0.664, 0.510, 0.355, 0.218, 0.111, 0.039, 0.0085 across h1-h9.
//
// THE MEASUREMENT. Take the DELIVERED residual with the pilot deployed, and the OPEN-LOOP error
// beside it, and split both by what the correction channel can do at each harmonic — using the
// pilot's OWN identified kernel, so the split is the machine's opinion rather than this file's.
// REACHABLE is where |H(h)| is at least half its DC; MARGINAL between a tenth and a half; and
// BEYOND REACH below a tenth, where a unit of correction moves the tip by under 10% of what it
// moves at DC.
//
// HOW TO READ IT. If the deployed residual is mostly BEYOND REACH, the ceiling is the actuation
// path and Shapes 1 and 2 are explained outright — every model and authority experiment in this
// section was working on the wrong tenth of the problem. If the residual is mostly REACHABLE, then
// the controller is leaving recoverable error on the table and the nulls need a different cause.
import { commissionArm, deployOn, mkPath, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.BD_FEED || 0.004);
const UCAP = +(process.env.BD_UCAP || 0.6);
const SHAPES = (process.env.BD_SHAPES || 'sharp,circle,rounded').split(',');
const NH = +(process.env.BD_NH || 64);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const S = pilot.sample;

/** |H| at harmonic h of the lap, from the pilot's own identified per-sample response. */
function gainAt(ch, h, lapSteps) {
  const r = pilot.hs[ch].resp;
  const w = (2 * Math.PI * h) / lapSteps;
  let re = 0, im = 0;
  for (let i = 1; i < r.length; i++) {
    const d = r[i] - r[i - 1];
    re += d * Math.cos(w * i); im -= d * Math.sin(w * i);
  }
  return Math.hypot(re, im);
}

/** Energy of a sampled signal at harmonic h of the lap. */
function powAt(sig, h, lapSamp) {
  const w = (2 * Math.PI * h) / lapSamp;
  let re = 0, im = 0;
  for (let i = 0; i < sig.length; i++) { re += sig[i] * Math.cos(w * i); im -= sig[i] * Math.sin(w * i); }
  return (re * re + im * im) / (sig.length * sig.length);
}

console.log('\n  the split is by the pilot\'s OWN kernel: reachable |H| >= 0.5 DC, marginal 0.1-0.5, beyond < 0.1');
console.log('\n  program   ch          OPEN LOOP                        DEPLOYED RESIDUAL         removed');
console.log('                    reach  margin  beyond          reach  margin  beyond');
for (const shape of SHAPES) {
  const path = mkPath(shape, FEED);
  const lapSteps = Math.round(path.lap), lapSamp = Math.round(lapSteps / S);
  const trOff = [], trOn = [];
  const off = await deployOn(pilot, shape, false, FEED, { trace: trOff });
  const on = await deployOn(pilot, shape, true, FEED, { trace: trOn });
  for (let ch = 0; ch < pilot.nc; ch++) {
    const dc = Math.abs(pilot.hs[ch].dc) || 1;
    const eOff = trOff.map((t) => t.e[ch]), eOn = trOn.map((t) => t.e[ch]);
    const bins = { off: [0, 0, 0], on: [0, 0, 0] };
    for (let h = 1; h <= NH; h++) {
      const g = gainAt(ch, h, lapSteps) / dc;
      const b = g >= 0.5 ? 0 : (g >= 0.1 ? 1 : 2);
      bins.off[b] += powAt(eOff, h, lapSamp);
      bins.on[b] += powAt(eOn, h, lapSamp);
    }
    const tot = (a) => a[0] + a[1] + a[2];
    const pc = (a) => a.map((v) => `${(100 * v / Math.max(1e-300, tot(a))).toFixed(1)}%`.padStart(7)).join(' ');
    console.log(`  ${shape.padEnd(9)} ${ch}   ${pc(bins.off)}        ${pc(bins.on)}`
      + `      ${(100 * (1 - tot(bins.on) / Math.max(1e-300, tot(bins.off)))).toFixed(1)}%`);
  }
}
console.log('EXIT 0');
