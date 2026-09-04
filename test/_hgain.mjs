// PUT THE GAIN COMPRESSION TO THE MACHINE — the mechanism explains three things and that is
// exactly why it has to be deployed rather than believed (rule 16).
//
// WHAT WAS MEASURED. `h` is identified from a probe at 0.0225 rad and inverted by the QP at
// corrections up to 0.15 shipped and 0.60 at the raised cap — 27x the identification
// amplitude, on a plant with Stribeck friction and backlash. Differencing two runs of the
// deterministic plant around a `du` step during motion, at a ladder of amplitudes, the
// response per unit `u` COMPRESSES monotonically and the shape does not move:
//
//   du 0.05 -> 1.0000    du 0.15 -> 0.9692    du 0.30 -> 0.9176    du 0.60 -> 0.7932
//   shape corr 1.0000                0.9987              0.9914              0.9532
//
// WHAT IT EXPLAINS. Given a 1.20 rad cap and a PERFECT forecast the QP stops at uPk 0.4785 of
// its own accord and delivery saturates at 3.65x. It is not declining to act: it applies the
// `u` its small-signal model says cancels `f0`, and then stops because that model says it is
// finished — while the machine returns only ~79% of the response at that amplitude. It also
// explains why DEPTH pays where a bigger cap alone does not: layer 2 sees exactly the residual
// the compression left, so the cascade has been compensating iteratively for what an
// amplitude-correct `h` would fix in one shot.
//
// THE FIX RUNS THE WRONG WAY ROUND, WHICH IS WHY IT IS WORTH STATING. Scaling `h` DOWN to the
// true large-signal gain makes the QP believe each unit of `u` buys LESS, so it asks for MORE
// correction to cancel the same `f0`. A model that under-states its own authority is what
// makes a solver use the authority it has.
//
// SWEPT RATHER THAN SET, because the right scale depends on the amplitude the QP actually
// runs at and that is a property of the program and the cap, not a constant (rule 31). The
// scale is applied through the pilot's own `_buildH` so the triangle registration is the
// shipped one, and every value is scored on three programs the model never saw.
import { commissionArm, deployOn, PG } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const SHAPES = (process.env.HG_SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.HG_FEED || 0.004);
// AT THE RAISED CAP BY DEFAULT, because that is where the amplitudes the compression was
// measured at actually occur: at uCap 0.15 the two factors are 0.969 and 1.035 — three percent
// — and at 0.6 they are 0.793 and 1.151.
const UCAP = +(process.env.HG_UCAP || 0.6);
// PER CHANNEL, AND THE TWO GO OPPOSITE WAYS. The shoulder's response per unit `u` COMPRESSES
// to 0.793 by 0.6 rad while the elbow's EXPANDS to 1.151, both monotone and both
// shape-preserving (corr 0.95+). That is a kinematic signature rather than a frictional one —
// a 0.6 rad joint offset is a large pose change, and the tool error's sensitivity to each
// joint genuinely shifts with pose as one lever shortens and the other lengthens. A single
// scalar would split the difference and measure neither (rule 31, per channel).
// DECOMPOSED AND SWEPT, because the first pass found its BEST cell at the inverted control —
// ch0 up, ch1 down, +56% on the circle — which is the direction opposite to the amplitude
// compression that motivated the sweep. A single winning cell of five is a coincidence until
// two things are separated: WHICH CHANNEL carries it (single-channel rows), and whether the
// optimum is SMOOTH or a spike (a finer ladder through it). A re-weighting that only ever
// reduces the shoulder's correction would also be explained by "less shoulder is better",
// which is a different claim and has a different fix.
const PAIRS = (process.env.HG_PAIRS
  || '1:1,1.15:1,1:0.79,1.15:0.79,1.30:0.79,1.15:0.65,1.30:0.65,1.50:0.50,0.85:1,1:1.20')
  .split(',').map((p2) => p2.split(':').map(Number));

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}; `
  + `per-channel h scales ${PAIRS.map((p2) => p2.join(':')).join(', ')}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
console.log(`probe amplitude ${pilot.probeAmp}, uMax ${pilot.uMax} `
  + `(${(pilot.uMax / pilot.probeAmp).toFixed(1)}x the amplitude h was identified at)`);

const saved = pilot.hs.map((h) => ({ resp: h.resp.slice ? h.resp.slice() : Array.from(h.resp), dc: h.dc }));
const open = {};
const traceFor = {};
const openRep = {};
for (const shape of SHAPES) {
  const r0 = await deployOn(pilot, shape, false, FEED);
  open[shape] = r0.r.totalRms; openRep[shape] = r0.r;
  console.log(`  open ${shape.padEnd(8)} total ${r0.r.totalRms.toExponential(3)} `
    + `bias ${r0.r.contourBias.toExponential(2)} osc ${r0.r.contourOsc.toExponential(2)}`);
}

console.log('\n  h ch0:ch1 ' + SHAPES.map((s) => s.padStart(20)).join('') + '        uPk');
for (const gs of PAIRS) {
  // SCALE THE RESPONSE, REBUILD THROUGH THE PILOT'S OWN PATH. `h.resp` is the recorded step
  // response per unit `u`; scaling it is exactly "the machine returns g times as much per unit
  // of correction as the small-signal probe said".
  for (let c = 0; c < pilot.hs.length; c++) {
    const g = gs[Math.min(c, gs.length - 1)];
    pilot.hs[c].resp = saved[c].resp.map((v) => v * g);
    pilot.hs[c].dc = saved[c].dc * g;
  }
  pilot._buildH();
  const cols = [];
  let pk = 0;
  for (const shape of SHAPES) {
    // RULE 39, POINTED AT THE CORRECTION INSTEAD OF THE ERROR. Three mechanisms were proposed
    // for this effect and the machine rejected all three, which means proposing is the wrong
    // activity: what has never been read is what scaling `h` CHANGES. Bias and oscillation have
    // different causes and different fixes — a scaled kernel that removes BIAS is a gain
    // calibration, one that removes OSCILLATION is the QP being detuned into smoothness, and
    // one RMS number hides which. `uRms` beside them says whether the correction got bigger,
    // smaller or merely differently shaped.
    const r = await deployOn(pilot, shape, true, FEED, { trace: (traceFor[shape] = []) });
    pk = Math.max(pk, r.uPk);
    const tr = traceFor[shape];
    let s2 = 0, d2 = 0;
    for (let i = 1; i < tr.length; i++) {
      s2 += tr[i].u[0] * tr[i].u[0] + tr[i].u[1] * tr[i].u[1];
      d2 += (tr[i].u[0] - tr[i - 1].u[0]) ** 2 + (tr[i].u[1] - tr[i - 1].u[1]) ** 2;
    }
    const uRms = Math.sqrt(s2 / Math.max(1, tr.length - 1));
    const uRate = Math.sqrt(d2 / Math.max(1, tr.length - 1));
    cols.push(`${(open[shape] / r.r.totalRms).toFixed(2).padStart(5)}x b${r.r.contourBias.toExponential(1)}`
      + ` o${r.r.contourOsc.toExponential(1)} u${uRms.toFixed(3)} r${uRate.toExponential(1)}`);
  }
  console.log(`  ${gs.map((v) => v.toFixed(2)).join(':').padStart(9)} ${cols.join('  ')}     ${pk.toFixed(4)}`);
}
// restored, so anything measured after this bench is the commissioned kernel again
for (let c = 0; c < pilot.hs.length; c++) { pilot.hs[c].resp = saved[c].resp; pilot.hs[c].dc = saved[c].dc; }
pilot._buildH();
console.log('EXIT 0');
