// DOES THE QP'S PLANT MODEL DESCRIBE THIS MACHINE? — the last term in the free response.
//
// The oracle ladder removed the forecast, the authority, the effort weight and the solver's
// iteration count as explanations for the pilot's 3.65x against mode 10's 44x. What is left
// inside the QP is `h`, the identified impulse response of the correction onto the error. The
// QP minimises ||f0 + T(h) u||^2, so if `h` is wrong the solve is a good answer to the wrong
// question — and no amount of forecast, authority or iteration can help, which is exactly the
// pattern the ladder measured.
//
// THE CHECK USES THE ORACLE RECORD AS ITS SECOND ROUTE (rule 15). An open-loop run says what
// the error would have been with no correction. Deploy, and the machine reports the error it
// actually had beside the correction that produced it. So `e - eFree` is what `u` DID, and
// `h * u` is what the model SAID it would do, and those are two independent routes to the same
// quantity — one measured on the machine, one predicted by the model the QP inverts.
//
// READ IT AS A FORK. High agreement means `h` is right and the pilot's ceiling is
// representational — its plan is piecewise constant over `sample * grid` steps and it cannot
// resolve what it can predict. Low agreement means the QP is inverting a channel the machine
// does not have, and the fix is the model rather than the clock.
//
// AND THE GAIN IS REPORTED SEPARATELY FROM THE SHAPE (rule 39 from the model's side). A model
// that is right in shape and half in magnitude is a solvable problem; one that is right in
// magnitude and wrong in phase makes a correction that ADDS, which is brick 63's finding on
// this very arm.
import { commissionArm, deployOn, recordOpenLoop, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.OR_SHAPE || 'sharp';
const FEED = +(process.env.OR_FEED || 0.004);

console.log(`arm K ${PG.K} / E ${PG.E}, ${SHAPE} at feed ${FEED}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
console.log(`sample ${pilot.sample}, grid ${pilot.grid}, N ${pilot.N}, uMax ${pilot.uMax}`);

const rec = await recordOpenLoop(pilot, SHAPE, FEED);
const or = { e: rec.e, lap: rec.lap, off: rec.lap };
for (const [name, opts] of [['fitted forecast', {}], ['oracle forecast', { oracle: or }]]) {
  const trace = [];
  const r = await deployOn(pilot, SHAPE, true, FEED, { ...opts, trace });
  // the run is `laps` laps of the closed path; score the LAST lap, where the correction has
  // been running long enough for `h`'s own memory to be filled (rule 13)
  const lap = rec.lap;
  const from = Math.max(0, trace.length - lap);
  console.log(`\n  ${name}: totalRms ${r.r.totalRms.toExponential(4)}, uPk ${r.uPk.toFixed(4)}`);
  for (let c = 0; c < 2; c++) {
    const h = pilot.hs[c].hSample;
    let sMM = 0, sPP = 0, sMP = 0, sM = 0, sP = 0, n = 0;
    for (let k = from; k < trace.length; k++) {
      // WHAT THE CORRECTION DID: the error the machine had, minus the error it would have had.
      // `eFree` is indexed modulo the lap from the steady lap of the open-loop record, the
      // same indexing the oracle uses, so the two readings cannot disagree about alignment.
      const j = lap + ((k) % lap);
      const meas = trace[k].e[c] - rec.e[Math.min(j, rec.e.length - 1)][c];
      let pred = 0;
      const top = Math.min(h.length, k + 1);
      for (let t = 0; t < top; t++) pred += h[t] * trace[k - t].u[c];
      sMM += meas * meas; sPP += pred * pred; sMP += meas * pred;
      sM += meas; sP += pred; n++;
    }
    const cv = sMP / n - (sM / n) * (sP / n);
    const sd = Math.sqrt(Math.max(0, sMM / n - (sM / n) ** 2) * Math.max(0, sPP / n - (sP / n) ** 2));
    const corr = sd > 0 ? cv / sd : 0;
    // the least-squares gain of measured ON predicted: 1 means the model's magnitude is right
    const gain = sPP > 0 ? sMP / sPP : 0;
    // R^2 of the model as used — no refitted gain, because the QP uses `h` as it stands
    const r2 = sMM > 0 ? 1 - (sMM - 2 * sMP + sPP) / sMM : 0;
    console.log(`    ch${c}: rms did ${Math.sqrt(sMM / n).toExponential(3)} vs said `
      + `${Math.sqrt(sPP / n).toExponential(3)}  shape corr ${corr.toFixed(3)}  `
      + `gain ${gain.toFixed(3)}  R2 as used ${r2.toFixed(3)}`);
  }
}
console.log('EXIT 0');
