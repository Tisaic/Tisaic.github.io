// WHERE IN FREQUENCY DOES `h` STOP BEING TRUE? — the specific, measurable form of "the plant
// model is the ceiling", and the claim the iteration sweep left standing.
//
// WHAT NEEDS EXPLAINING. `qpIters` restores the correction's high band monotonically (h5+ share
// 0.297 -> 0.721 on the sharp square, a hundredfold on the circle) and the score falls
// monotonically as it does — one iteration is the best row on all three programs and 240 the
// worst. So the pilot's high-frequency content is HARMFUL where ⑩'s is part of a 44x
// correction. More iterations produce more of the WRONG fast content.
//
// THE EXPLANATION THAT FITS EVERYTHING ELSE. Inverting a plant is a high-pass operation, so a
// converged solve amplifies the plant model's error most exactly where that error is largest.
// If `h`'s accuracy falls with frequency, the QP cannot safely use the band whatever the
// forecast says, and truncating the solve is a crude low-pass that happens to protect it. That
// predicts this table and nothing else measured contradicts it — but it has never been
// measured, because every reading of `h` so far has been a single number (a DC gain, a lag, an
// R^2) with no frequency attached.
//
// THE MEASUREMENT. Difference two runs of the deterministic plant around a `du` step during
// motion — the moving response, at the amplitude the QP actually runs at — and compare its
// FREQUENCY RESPONSE against the commissioned kernel's, band by band. Magnitude ratio and
// phase error per band, with the bands placed on the lap's own harmonics so the numbers line up
// with the h5+ split the correction was read in.
//
// WHAT WOULD KILL IT: a flat magnitude ratio and a small phase error across the band. Then `h`
// is uniformly accurate, the high-frequency harm is something else, and the "model error grows
// with frequency" reading is wrong.
import { makeArm, mkPath, homeArm, routeSignals, commissionArm, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.HS_SHAPE || 'sharp';
const FEED = +(process.env.HS_FEED || 0.004);
const UCAP = +(process.env.HS_UCAP || 0.6);
const DU = +(process.env.HS_DU || 0.3);

console.log(`arm K ${PG.K} / E ${PG.E}, ${SHAPE} at feed ${FEED}, uCap ${UCAP}, pulse ${DU} rad`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const S = pilot.sample;
const path = mkPath(SHAPE, FEED);
const LAP = Math.round(path.lap), LAPS = Math.round(LAP / S);
console.log(`sample ${S}, lap ${LAP} steps / ${LAPS} samples; commissioned resp `
  + `${pilot.hs[0].resp.length} steps, probe amplitude ${pilot.probeAmp}`);

const run = async (ch, at) => {
  const { arm, servo } = await makeArm();
  homeArm(arm, servo, path);
  const RESPLEN = pilot.hs[0].resp.length;
  const out = [];
  for (let k = 0; k < 2 * LAP + RESPLEN + 64; k++) {
    const c = path.at(k);
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const on = at !== null && k >= at;
    const u = [on && ch === 0 ? DU : 0, on && ch === 1 ? DU : 0];
    const tau = servo.torques([{ theta: q1 + u[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + u[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (k >= LAP) out.push(routeSignals(arm, [{ pos: q1 }, { pos: q2 }], tau).truth.slice());
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return out;
};

// THE FREQUENCY RESPONSE OF A STEP RESPONSE, evaluated on the lap's own harmonics. A step
// response differenced is the impulse response; its DFT at harmonic h of the lap is what the
// QP is implicitly inverting at that harmonic.
const freqOf = (step, nh, lapSteps) => {
  const imp = [];
  for (let i = 1; i < step.length; i++) imp.push(step[i] - step[i - 1]);
  const out = [];
  for (let h = 1; h <= nh; h++) {
    const w = (2 * Math.PI * h) / lapSteps;
    let re = 0, im = 0;
    for (let i = 0; i < imp.length; i++) { re += imp[i] * Math.cos(w * i); im -= imp[i] * Math.sin(w * i); }
    out.push({ re, im, mag: Math.hypot(re, im), ph: Math.atan2(im, re) });
  }
  return out;
};

const NH = 16;
for (let ch = 0; ch < 2; ch++) {
  const base = await run(ch, null), pulsed = await run(ch, LAP);
  const n = Math.min(base.length, pulsed.length, pilot.hs[ch].resp.length);
  const meas = [];
  for (let i = 0; i < n; i++) meas.push((pulsed[i][ch] - base[i][ch]) / DU);
  const model = Array.from(pilot.hs[ch].resp).slice(0, n);
  // the commissioned `resp` is already per unit `u`, the same normalisation the moving
  // difference carries, so the two are directly comparable without any scaling
  const M = freqOf(meas, NH, LAP), P = freqOf(model, NH, LAP);
  console.log(`\n=== channel ${ch} — is the model true at each harmonic of the lap? ===`);
  console.log('   h   |model|     |machine|    ratio      phase err (deg)');
  for (let h = 0; h < NH; h++) {
    let d = (M[h].ph - P[h].ph) * 180 / Math.PI;
    while (d > 180) d -= 360; while (d < -180) d += 360;
    console.log(`  ${String(h + 1).padStart(3)}  ${P[h].mag.toExponential(3)}  ${M[h].mag.toExponential(3)}`
      + `  ${(M[h].mag / Math.max(1e-30, P[h].mag)).toFixed(3).padStart(7)}      ${d.toFixed(1).padStart(7)}`);
  }
  // THE ONE NUMBER THE ITERATION TABLE NEEDS: how wrong the model is in the band the solve
  // restores (h5-16) against the band it always had (h1-4).
  const err = (lo, hi) => {
    let num = 0, den = 0;
    for (let h = lo - 1; h < hi; h++) {
      const dr = M[h].re - P[h].re, di = M[h].im - P[h].im;
      num += dr * dr + di * di; den += P[h].mag * P[h].mag;
    }
    return Math.sqrt(num / Math.max(1e-30, den));
  };
  console.log(`  relative model error: h1-4 ${err(1, 4).toFixed(3)}   h5-16 ${err(5, 16).toFixed(3)}`);
}
console.log('EXIT 0');
