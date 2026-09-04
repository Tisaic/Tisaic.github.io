// IS THE EFFORT WEIGHT SELECTED AT THE WRONG AMPLITUDE? — the mechanism the signature points
// at, and the one that would convert a tuned constant into a measured property.
//
// HOW THIS WAS REACHED. Scaling only the shoulder's kernel at uCap 0.6 is worth up to +139%,
// and after three rejected hypotheses the signature said what it DOES rather than what it is:
// oscillation falls 3x on the circle (2.7e-1 -> 9.1e-2), the contour bias crosses zero from
// POSITIVE to negative (+1.5e-1 -> -3.5e-2), and the correction shrinks (u 0.146 -> 0.114). At
// scale 1.00 the pilot OVER-corrects and rings; telling the QP it gets more per unit makes it
// apply less.
//
// AND SCALING `h` UP BY g RAISES THE TRACKING TERM BY g^2 AGAINST THE EFFORT PENALTY, so it IS
// an effort-weight increase — applied lopsidedly to one channel. That reconciles with lambda
// having measured inert: it was only ever swept DOWN (lambda/10, lambda/100, both null). Nobody
// swept it up.
//
// WHY IT WOULD BE A DEFECT RATHER THAN A KNOB. `lambda` is not an arbitrary constant here — the
// verify SELECTS it on the machine from a candidate set, taking the smoothest within rule 42's
// 5% band. But it selects it while running the VERIFY REGIMES, and those run at quarter rates,
// so it is chosen at small correction amplitudes and then deployed on the full program at the
// engineer's cap. Rule 34 for the third time in this arc: a constant chosen in a configuration
// the machine does not run in.
//
// THE TEST. Sweep `lambda` UP at deploy, on the three programs, at the raised cap, from one
// commissioning. If a larger effort weight reproduces the shoulder-scaling benefit, the finding
// is that lambda is selected at the wrong amplitude — measurable on any plant, derivable, and
// shippable. If it does not, the h-scaling is doing something the effort weight cannot, and the
// "lambda in disguise" reading is dead.
import { commissionArm, deployOn, mkPath, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.LM_SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.LM_FEED || 0.004);
const UCAP = +(process.env.LM_UCAP || 0.6);
// SWEPT BOTH WAYS AND READ ON THE SPECTRUM, NOT ONLY THE SCORE. `lambda` weights ||D u||^2,
// which is a HIGH-PASS penalty: it taxes exactly the fast content a corner needs, so the QP
// trades it away first. Mode 10's correction puts 92% of its shoulder energy above the fourth
// lap harmonic on the sharp square and 32% on the circle; the pilot's puts 55% and 0.2%. Same
// frame, same machine, same program — the pilot is correcting droop where mode 10 corrects
// corners.
//
// AND EVERY LAMBDA SWEEP SO FAR HAS READ ONLY THE SCORE. Up at this cap: inert. Down at another
// cap with the oracle: inert. Neither looked at what the knob DID to the correction, which is
// the quantity it directly controls — the same blindness rule 39 was invoked to fix on the
// error. If lowering it restores harmonics above 4 and the score does not move, the filter is
// somewhere else and the horizon or the decision grid is next.
const MULTS = (process.env.LM_MULTS || '0.001,0.01,0.1,1,10').split(',').map(Number);
// AND THE SECOND REGULARISER ON THE SAME INVERSION. `qpIters` truncates the solve, and a
// truncated gradient method converges the LOW frequencies first — so the high band a corner
// needs is exactly what a short solve has not reached yet. This file already records the
// symptom without connecting it: "the converged solve RINGS and the truncated one does not."
// Ringing is high-frequency content. Swept here with the same spectral readout, because the
// score alone called this knob inert twice.
const ITERS = (process.env.LM_ITERS || '').split(',').filter(Boolean).map(Number);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const lam0 = pilot.lambda;
console.log(`the verify SELECTED lambda ${lam0.toExponential(4)} on the machine`);
const open = {};
for (const shape of SHAPES) open[shape] = (await deployOn(pilot, shape, false, FEED)).r.totalRms;

console.log('\n  lambda x   ' + SHAPES.map((s) => s.padStart(30)).join(''));
for (const m of MULTS) {
  pilot.lambda = lam0 * m;
  const cols = [];
  for (const shape of SHAPES) {
    const tr = [];
    const r = await deployOn(pilot, shape, true, FEED, { trace: tr });
    let s2 = 0;
    for (const t of tr) s2 += t.u[0] * t.u[0] + t.u[1] * t.u[1];
    const uRms = Math.sqrt(s2 / Math.max(1, tr.length));
    // THE SHARE OF THE SHOULDER'S CORRECTION ABOVE THE FOURTH LAP HARMONIC — the quantity the
    // comparison against mode 10 says is wrong, and the one `lambda` directly controls.
    const lap = Math.round(mkPath(shape, FEED).lap / pilot.sample);
    const seg = tr.slice(Math.max(0, tr.length - lap)).map((t) => t.u[0]);
    let lo = 0, hi = 0;
    for (let h = 1; h <= 16; h++) {
      let re = 0, im = 0;
      for (let i = 0; i < seg.length; i++) {
        const t = (2 * Math.PI * h * i) / seg.length;
        re += seg[i] * Math.cos(t); im -= seg[i] * Math.sin(t);
      }
      const e = (re * re + im * im);
      if (h <= 4) lo += e; else hi += e;
    }
    const share = hi / Math.max(1e-30, lo + hi);
    cols.push(`${(open[shape] / r.r.totalRms).toFixed(2).padStart(5)}x o${r.r.contourOsc.toExponential(1)}`
      + ` u${uRms.toFixed(3)} h5+${share.toFixed(3)}`);
  }
  console.log(`  ${String(m).padStart(8)}   ${cols.join('  ')}`);
}
pilot.lambda = lam0;
if (ITERS.length) {
  const it0 = pilot.qpIters;
  console.log(`\n  qpIters (lambda at its selected ${lam0.toExponential(3)}, iters ships ${it0})`);
  for (const it of ITERS) {
    pilot.qpIters = it;
    const cols = [];
    for (const shape of SHAPES) {
      const tr = [];
      const r = await deployOn(pilot, shape, true, FEED, { trace: tr });
      let s2 = 0;
      for (const t of tr) s2 += t.u[0] * t.u[0] + t.u[1] * t.u[1];
      const lap = Math.round(mkPath(shape, FEED).lap / pilot.sample);
      const seg = tr.slice(Math.max(0, tr.length - lap)).map((t) => t.u[0]);
      let lo = 0, hi = 0;
      for (let h = 1; h <= 16; h++) {
        let re = 0, im = 0;
        for (let i = 0; i < seg.length; i++) {
          const t = (2 * Math.PI * h * i) / seg.length;
          re += seg[i] * Math.cos(t); im -= seg[i] * Math.sin(t);
        }
        const e = re * re + im * im;
        if (h <= 4) lo += e; else hi += e;
      }
      cols.push(`${(open[shape] / r.r.totalRms).toFixed(2).padStart(5)}x o${r.r.contourOsc.toExponential(1)}`
        + ` u${Math.sqrt(s2 / Math.max(1, tr.length)).toFixed(3)} h5+${(hi / Math.max(1e-30, lo + hi)).toFixed(3)}`);
    }
    console.log(`  ${String(it).padStart(8)}   ${cols.join('  ')}`);
  }
  pilot.qpIters = it0;
}
console.log('EXIT 0');
