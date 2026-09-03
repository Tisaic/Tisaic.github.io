// IS `h` MIS-REGISTERED IN TIME? — the reconciliation between two of this session's own
// instruments, which disagree about the same quantity on the same machine.
//
// THE DISAGREEMENT. `test/_hcheck.mjs` measures what a correction actually did against what
// `h` said it would, over a deployed run, and gets a least-squares gain of 0.880 on channel 0
// — the machine doing LESS than the model claims. `test/_hmove.mjs` differences two runs of
// the deterministic plant around a `du` step during motion and gets 1.18 — the machine doing
// MORE, by the same order. Both cannot be right, and two instruments disagreeing in SIGN is a
// reason to check the instrument rather than to pick a number (rules 14, 15).
//
// THE ONE MECHANISM THAT PRODUCES EXACTLY THAT PAIR IS A LAG. A least-squares slope of a
// fast-varying signal on a mis-registered prediction is DEPRESSED — the two decorrelate — while
// a DC step is insensitive to when the response is credited. Backlash was the other candidate
// and it is arithmetically dead: 1e-4 rad of lost motion against a 0.15 rad correction is
// 0.07%, not 34%.
//
// SO SWEEP THE REGISTRATION. Shift the predicted response against the measured one, sample by
// sample, and report the least-squares gain and R² at each shift. If the peak sits at zero the
// registration is right and the disagreement is something else; if it sits away from zero, that
// offset is a defect in the operator the QP inverts, and rule 29 has caught it in the plant
// model rather than in a chart.
import { commissionArm, deployOn, recordOpenLoop, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.HL_SHAPE || 'sharp';
const FEED = +(process.env.HL_FEED || 0.004);
const SHIFTS = +(process.env.HL_SHIFTS || 12);   // +/- this many samples

console.log(`arm K ${PG.K} / E ${PG.E}, ${SHAPE} at feed ${FEED}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
console.log(`sample ${pilot.sample}, grid ${pilot.grid} — one decision is `
  + `${pilot.grid} samples, one sample is ${pilot.sample} solver steps`);

const rec = await recordOpenLoop(pilot, SHAPE, FEED);
const or = { e: rec.e, lap: rec.lap, off: rec.lap };
const trace = [];
const r = await deployOn(pilot, SHAPE, true, FEED, { oracle: or, trace });
console.log(`deployed: totalRms ${r.r.totalRms.toExponential(4)}, uPk ${r.uPk.toFixed(4)}`);

const lap = rec.lap, from = Math.max(0, trace.length - lap);
for (let c = 0; c < 2; c++) {
  const h = pilot.hs[c].hSample;
  // measured: what the correction DID, from the open-loop record as the second route
  const meas = [], pred = [];
  for (let k = from; k < trace.length; k++) {
    const j = lap + (k % lap);
    meas.push(trace[k].e[c] - rec.e[Math.min(j, rec.e.length - 1)][c]);
    let s = 0;
    const top = Math.min(h.length, k + 1);
    for (let t = 0; t < top; t++) s += h[t] * trace[k - t].u[c];
    pred.push(s);
  }
  console.log(`\n  channel ${c}:  shift   LS gain     R2 at that shift   corr`);
  let best = null;
  for (let sh = -SHIFTS; sh <= SHIFTS; sh++) {
    // POSITIVE `sh` CREDITS THE PREDICTION LATER: pred[i] is compared against meas[i + sh].
    let sMM = 0, sPP = 0, sMP = 0, n = 0;
    for (let i = 0; i < meas.length; i++) {
      const j = i + sh;
      if (j < 0 || j >= meas.length) continue;
      sMM += meas[j] * meas[j]; sPP += pred[i] * pred[i]; sMP += meas[j] * pred[i]; n++;
    }
    if (!n) continue;
    const gain = sPP > 0 ? sMP / sPP : 0;
    // R2 of the SHIFTED prediction scaled by its own best gain — the ceiling a pure
    // re-registration plus a rescale could reach, which is the quantity that decides whether
    // this is worth fixing
    const r2 = sMM > 0 ? 1 - (sMM - 2 * gain * sMP + gain * gain * sPP) / sMM : 0;
    const corr = (sMM > 0 && sPP > 0) ? sMP / Math.sqrt(sMM * sPP) : 0;
    if (!best || r2 > best.r2) best = { sh, gain, r2, corr };
    console.log(`         ${String(sh).padStart(7)}  ${gain.toFixed(4).padStart(8)}   `
      + `${r2.toFixed(4).padStart(8)}          ${corr.toFixed(4)}`);
  }
  if (best) {
    console.log(`    BEST at shift ${best.sh} samples (${best.sh * pilot.sample} solver steps): `
      + `gain ${best.gain.toFixed(4)}, R2 ${best.r2.toFixed(4)}`);
  }
}
console.log('EXIT 0');
