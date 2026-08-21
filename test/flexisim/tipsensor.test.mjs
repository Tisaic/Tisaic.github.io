// Estimating the tip error from motor-side signals alone.
//
// THIS IS THE PAYOFF THE PLANT WAS BUILT FOR. Bricks 1-7 established that the
// encoder cannot see the tip: it sits on the motor side of the gearbox and is
// structurally blind to wind-up, lost motion and link bending. This asks whether
// what it CAN see is enough to infer what it cannot -- and it is scored against a
// baseline that is not a straw man.
//
// THE BASELINE IS THE PHYSICS-BASED ESTIMATE A GOOD ENGINEER BUILDS: knowing the
// gearbox stiffness and the link's inertia, infer the torque from the encoder's
// own acceleration and report tau/K times the arm. It captures the quasi-static
// wind-up exactly and knows nothing about the link's bending or about history.
//
// EVERY NUMBER BELOW IS LOCKED. Training stops, the tracker goes away, and the
// estimates scored are the ones the machine would produce for the rest of its
// life. A model still adapting is being told the answer.

import { Joint } from '../../lib/flexisim/joint.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { FlexArm } from '../../lib/flexisim/arm.js';
import { TipSensor, MoveProfile, nrmse } from '../../lib/flexisim/tipsensor.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: the tip-error soft sensor');

/** Shift of `b` against `a` maximising Pearson correlation, and that correlation. */
function crossLag(a, b, maxShift) {
  let best = -2, bs = 0;
  for (let sft = -maxShift; sft <= maxShift; sft++) {
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let i = 0; i < a.length; i++) {
      const j = i + sft;
      if (j < 0 || j >= b.length) continue;
      sa += a[i]; sb += b[j]; saa += a[i] * a[i]; sbb += b[j] * b[j]; sab += a[i] * b[j]; n++;
    }
    const r = (n * sab - sa * sb) / Math.sqrt((n * saa - sa * sa) * (n * sbb - sb * sb));
    if (r > best) { best = r; bs = sft; }
  }
  return { lag: bs, r: best };
}

const H = 4, LEN = 16, CLAMP = 3, E = 0.05, nu = 0.3, rho = 1;
const K_NOMINAL = 0.4;

/**
 * Drive the arm through repeated moves, train against the tracker, LOCK, and
 * score the locked estimates against the physics baseline.
 *
 * THE LINK CARRIES REAL STRUCTURAL DAMPING (3e-3/step, ringing decaying in ~330
 * steps against a 1700-step move). Without it the tip error is dominated by a
 * free vibration whose phase depends on history far outside any affordable
 * window: measured at 2e-4, EVERY estimator -- learner, baseline and the naive
 * "the tip is where the encoder says" -- scored nRMSE near 1.0, which is to say
 * no better than predicting the mean. That is a real regime and it is not the one
 * a compensator operates in.
 */
async function session({ K = K_NOMINAL, backlash = 0, lag = 6, stride = 2,
                         damping = 3e-3, nTrain = 1200, nTest = 500,
                         directionBit = false, directional = false, lam = 1.0,
                         lead = 0 }) {
  const link = await buildLink({ length: LEN, section: H, clamp: CLAMP,
    E, nu, rho, gravity: [0, 0, 0], damping });
  const mp = massProperties(link);
  const Jm = mp.inertiaAboutPivot / 1e4;          // N^2 J_m matched to the link
  const Jeff = mp.inertiaAboutPivot / 2;
  const joint = new Joint({ ratio: 100, motorInertia: Jm,
    loadInertia: mp.inertiaAboutPivot, stiffness: K,
    damping: 2 * Math.sqrt(K * Jeff), backlash });
  const arm = new FlexArm({ joint, link, gravityWorld: [0, -2e-6, 0], dt: 1 });
  const profile = new MoveProfile({ accelSteps: 200, cruiseSteps: 300,
    dwellSteps: 150, torque: 2e-3 });
  const ts = new TipSensor({ sampleEvery: 10, lag, stride, warmup: 200,
    directionBit, directional, lam, lead });

  const est = [], truth = [], base = [], fc = [];
  let peakWindup = 0, trainedAfterLock = 0;
  for (let i = 0; i < nTrain + nTest; i++) {
    const y = ts.sample(arm, profile);
    const e = arm.tipError();
    peakWindup = Math.max(peakWindup, Math.abs(joint.windup()));
    if (y === null) continue;
    if (i < nTrain) { ts.train(e.total); continue; }
    if (ts.mode === 'training') ts.lock();
    if (ts.train(e.total)) trainedAfterLock++;      // must be refused
    est.push(y); truth.push(e.total); if (lead > 0) fc.push(ts.forecast);
    base.push(TipSensor.complianceEstimate({ alphaEnc: ts.lastSignals[2],
      inertia: mp.inertiaAboutPivot, stiffness: K, arm: arm.Larm }));
  }
  const status = ts.status();
  // trace(P) is permanent in the report for the same reason __fsSSdbg() is: a
  // model that scores badly has several distinct explanations and the score
  // cannot tell them apart. Covariance wind-up is one of them.
  const P = ts.ss.P[0];
  let trace = 0;
  for (let i = 0; i < P.rows; i++) trace += P.m[i * P.rows + i];
  await link.destroy();
  const out = {
    learner: nrmse(est, truth), baseline: nrmse(base, truth),
    naive: nrmse(truth.map(() => 0), truth),
    peakWindup, status, trainedAfterLock, n: est.length, trace,
  };
  if (lead > 0) {
    // A FORECAST IS SCORED AT THE SAMPLE IT IS ABOUT, not the one it was issued
    // at. Drawing or scoring it where it was issued shifts it by exactly the lead,
    // which makes a perfect forecast look wrong and a lagging one look right --
    // FlowSim's probe chart documents the same trap on the display side.
    const pred = fc.slice(0, fc.length - lead);
    const want = truth.slice(lead);
    out.forecast = nrmse(pred, want);
    // TWO BASELINES, and only one of them is available in production. Persistence
    // on the TRUTH needs the tracker that has just been packed away, so it is an
    // oracle; persistence on the readout's own present ESTIMATE is what a machine
    // could actually do. Beating the oracle is the strong claim.
    out.persistTruth = nrmse(truth.slice(0, truth.length - lead), want);
    out.persistEst = nrmse(est.slice(0, est.length - lead), want);
    out.leadSamples = lead;
    // WHERE EACH READOUT BEST LINES UP WITH THE TRUTH. A forecast trained at lead L
    // must correlate best at EXACTLY L: any other answer means the feature ring is
    // pairing the wrong sample with the wrong target, which is an off-by-one no
    // score would reveal -- a readout mistrained by one sample still scores well.
    out.estLag = crossLag(est, truth, 60);
    out.fcLag = crossLag(fc, truth, 60);
  }
  return out;
}

// ------------------------------------------------ the learner beats the physics
// ONE SESSION SERVES BOTH TASKS. The forecast below is a second target of the same
// readout sharing the same feature expansion, so asking for it costs one RLS
// update and nothing else -- and the present-time numbers are byte-identical to a
// session without it, which the full tier asserts directly.
const LEAD = 30;      // samples, i.e. 300 solver steps
const clean = await session({ lead: LEAD });
console.log(`    [locked] learner ${clean.learner.toFixed(4)}  compliance model `
  + `${clean.baseline.toFixed(4)}  "tip = encoder" ${clean.naive.toFixed(4)}  `
  + `(${clean.n} locked samples, ${clean.status.features} features)`);

check('the lifecycle reaches a locked, frozen readout',
  clean.status.mode === 'estimating' && clean.status.frozen && clean.status.trained > 500,
  JSON.stringify(clean.status));
check('and training is REFUSED once locked (the tracker is gone)',
  clean.trainedAfterLock === 0, String(clean.trainedAfterLock));
// The naive estimate is the controller's own view -- "the tip is where the
// encoder says" -- and it is what the machine ships with today.
check('a locked soft sensor beats the controller\'s own view of where the tip is',
  clean.learner < 0.7 * clean.naive,
  `${clean.learner.toFixed(4)} vs ${clean.naive.toFixed(4)}`);
check('and it beats the physics-based compliance model too',
  clean.learner < clean.baseline,
  `${clean.learner.toFixed(4)} vs ${clean.baseline.toFixed(4)} `
  + `(${(clean.baseline / clean.learner).toFixed(2)}x)`);

// ============================================ THE FORECAST, WHICH IS WHAT A
// COMPENSATOR ACTUALLY CONSUMES.
//
// A correction takes effect after a transport delay -- the current loop closes,
// the drive responds, the mechanism moves -- so a compensator driven by an
// ESTIMATE needs the error it will HAVE, not the error it has. Brick 10's
// feedforward sidesteps this by evaluating a static model at the command, which is
// only possible because the model is a constant; anything that READS the machine
// has to predict.
//
// It is a SECOND TARGET OF THE SAME READOUT rather than a second model: the
// universal expansion is the expensive half and it is computed once. `SoftSensor`
// gained the pairing (opts.leads) for this -- `Continuous`'s directHorizons
// mechanism, which the audit named as unused and which FlowSim's page hand-rolled.
//
// TWO BASELINES AND ONLY ONE OF THEM IS AVAILABLE. Persistence on the readout's own
// ESTIMATE is what a machine could actually do. Persistence on the TRUTH needs the
// tracker that has just been packed away, so it is an ORACLE -- and at a short lead
// it is a very good one, because the tip error barely moves in 50 steps. The
// question is not whether the learner beats it everywhere; it is where.
console.log(`    [forecast +${LEAD} samples = ${LEAD * 10} steps] learner `
  + `${clean.forecast.toFixed(4)}   persistence-of-estimate ${clean.persistEst.toFixed(4)}   `
  + `persistence-of-TRUTH ${clean.persistTruth.toFixed(4)} (an oracle)`);
check('the forecast beats the persistence baseline a machine could actually run',
  clean.forecast < clean.persistEst,
  `${clean.forecast.toFixed(4)} vs ${clean.persistEst.toFixed(4)} `
  + `(${(clean.persistEst / clean.forecast).toFixed(2)}x)`);
check('and at this lead it beats the ORACLE persistence too, which needs the tracker',
  clean.forecast < clean.persistTruth,
  `${clean.forecast.toFixed(4)} vs ${clean.persistTruth.toFixed(4)} `
  + `(${(clean.persistTruth / clean.forecast).toFixed(2)}x)`);

// THE FORECAST IS MORE ACCURATE THAN THE PRESENT-TIME ESTIMATE, WHICH LOOKS
// IMPOSSIBLE AND IS NOT. Measured: correlation with the truth 0.996 at lag +30 for
// the forecast against 0.950 at lag -1 for the estimate. The cause is a TRANSPORT
// DELAY through the drive. The gearbox resonance here has a ~1040-step period, so
// the tip's response lags the motor by roughly a quarter of it -- about 260 steps,
// i.e. 26 samples. The readout's window is lag 6 x stride 2 x sampleEvery 10 = 100
// steps, so the tip error NOW is a response to excitation that has ALREADY LEFT
// the window, while the tip error 300 steps ahead is a response to excitation
// sitting at the freshest end of it. Predicting forward is not extrapolation here;
// it is reading the signal at the delay the plant already has.
//
// A REAL COMPENSATOR IS ON THE OTHER SIDE OF THAT SAME DELAY, which is why this is
// the useful direction: the correction being computed now takes effect after the
// loop closes and the mechanism moves, so the error it should cancel is the future
// one, and that is the one the motor signals actually determine.
console.log(`    [alignment] estimate correlates at lag ${clean.estLag.lag} `
  + `(r ${clean.estLag.r.toFixed(4)}), forecast at lag ${clean.fcLag.lag} `
  + `(r ${clean.fcLag.r.toFixed(4)})`);
check('the forecast lines up with the truth at EXACTLY its trained lead',
  clean.fcLag.lag === LEAD, `${clean.fcLag.lag} vs ${LEAD}`);
check('and it correlates with the truth better than the present-time readout does',
  clean.fcLag.r > clean.estLag.r,
  `${clean.fcLag.r.toFixed(4)} vs ${clean.estLag.r.toFixed(4)}`);

// ============================ PATH DEPENDENCE: THE CLAIM THAT NEEDED A PLANT
//
// A memoryless estimator is a function of the CURRENT signals. Backlash makes the
// plant path-dependent -- the same motor position corresponds to different link
// positions depending on which way you arrived -- so a memoryless model is
// provably insufficient and a history window is what recovers it. This project has
// used lag windows everywhere and always found them merely helpful; here the
// physics says in advance that they must be necessary, and the size of the effect
// is set by how big the dead band is against the wind-up it competes with.
{
  const b = 0.5 * clean.peakWindup;
  const memoryless = await session({ lag: 1, stride: 1, backlash: b });
  const windowed = await session({ lag: 6, stride: 2, backlash: b });
  const memorylessClean = await session({ lag: 1, stride: 1 });
  globalThis.__windowed = windowed;
  console.log(`    [backlash] dead band ${b.toExponential(2)} rad = 50% of the peak `
    + `wind-up ${clean.peakWindup.toExponential(2)}`);
  console.log(`    [backlash] memoryless ${memorylessClean.learner.toFixed(4)} -> `
    + `${memoryless.learner.toFixed(4)}   windowed ${clean.learner.toFixed(4)} -> `
    + `${windowed.learner.toFixed(4)}`);

  check('backlash degrades a MEMORYLESS estimator',
    memoryless.learner > 1.15 * memorylessClean.learner,
    `${memorylessClean.learner.toFixed(4)} -> ${memoryless.learner.toFixed(4)}`);
  // COMPARE THE DEGRADATIONS, NOT THE RATIOS. The quantity the claim is about is
  // how much WORSE each model gets, so it is (x - 1) and not x: measured 28.4%
  // for the memoryless model against 10.0% for the windowed one, i.e. the history
  // absorbs about two thirds of the damage. Comparing the raw ratios instead
  // (1.284 vs 1.100) buries the effect in the 1.0 both of them start from, and
  // was how I first wrote it.
  const dMemoryless = memoryless.learner / memorylessClean.learner - 1;
  const dWindowed = windowed.learner / clean.learner - 1;
  check('and a history window absorbs most of it',
    dWindowed < 0.5 * dMemoryless,
    `windowed +${(100 * dWindowed).toFixed(1)}% vs memoryless +${(100 * dMemoryless).toFixed(1)}% `
    + `(history absorbs ${(100 * (1 - dWindowed / dMemoryless)).toFixed(0)}%)`);
  // Memory earns its place even with NO backlash, for a different reason: the
  // link rings, and a phase cannot be read from one instant. Both effects are
  // real and they are separable, which is why both are asserted.
  check('memory helps even without backlash, because a ringing phase needs history',
    clean.learner < 0.9 * memorylessClean.learner,
    `${memorylessClean.learner.toFixed(4)} -> ${clean.learner.toFixed(4)}`);
}

if (process.env.SUITE === 'full') {
  // THE HORIZON SWEEP, WHICH IS THE FALSIFIABLE FORM OF THE TRANSPORT-DELAY
  // EXPLANATION ABOVE. If the forecast is easier than the estimate because the tip
  // lags the motor by about a quarter of the gearbox period (~26 samples), then
  // skill must have a MINIMUM near that lead and get worse on BOTH sides -- worse
  // at a shorter lead because the response has not arrived yet, worse at a longer
  // one because it is genuine extrapolation. A monotone curve in either direction
  // would refute it.
  const rows = [];
  for (const L of [5, 15, 60]) rows.push(await session({ lead: L }));
  rows.push(clean);
  rows.sort((a, b) => a.leadSamples - b.leadSamples);
  for (const r of rows) {
    console.log(`    [horizon] lead ${String(r.leadSamples).padStart(3)} `
      + `(${String(r.leadSamples * 10).padStart(4)} steps)  forecast ${r.forecast.toFixed(4)}  `
      + `persist-truth ${r.persistTruth.toFixed(4)}  persist-est ${r.persistEst.toFixed(4)}  `
      + `lag ${r.fcLag.lag} r ${r.fcLag.r.toFixed(4)}`);
  }
  const at = (L) => rows.find((r) => r.leadSamples === L);
  check('the forecast beats the production persistence baseline at EVERY lead',
    rows.every((r) => r.forecast < r.persistEst),
    rows.map((r) => `${r.leadSamples}:${r.forecast.toFixed(3)}/${r.persistEst.toFixed(3)}`).join(' '));
  // PERSISTENCE DEGRADES MONOTONICALLY AND THE LEARNER DOES NOT, which is the
  // difference between a model and an assumption: "it stays where it is" gets
  // steadily worse the further ahead you ask, with no structure to fall back on.
  check('persistence degrades monotonically with the horizon',
    rows.every((r, i) => i === 0 || r.persistTruth > rows[i - 1].persistTruth),
    rows.map((r) => r.persistTruth.toFixed(3)).join(' '));
  check('the learner has a MINIMUM near the plant\'s own delay, worse on both sides',
    at(30).forecast < at(15).forecast && at(30).forecast < at(60).forecast,
    `${at(5).forecast.toFixed(3)} ${at(15).forecast.toFixed(3)} `
    + `${at(30).forecast.toFixed(3)} ${at(60).forecast.toFixed(3)}`);
  // Every lead's readout must line up where it was trained, not just the shipped
  // one -- an off-by-one in the ring would be lead-dependent. TOLERANCE OF ONE
  // SAMPLE HERE AND NOT ON THE SHIPPED LEAD, because the argmax of a correlation
  // is only sharp when the correlation is high: lead 60 sits at r 0.94 with a flat
  // peak and reports 59. That is the readout being worse, not the pairing being
  // wrong -- a real off-by-one would shift EVERY lead by the same amount.
  check('every forecast lines up at its own trained lead to within a sample',
    rows.every((r) => Math.abs(r.fcLag.lag - r.leadSamples) <= 1),
    rows.map((r) => `${r.leadSamples}->${r.fcLag.lag}`).join(' '));
}

if (process.env.SUITE === 'full') {
  // ADDING A FORECAST MUST NOT MOVE THE PRESENT-TIME READOUT. Both targets share
  // one feature expansion and one frozen standardisation; if the estimate moved,
  // the shared block would be leaking one target's equations into the other's.
  const noLead = await session({});
  check('adding a forecast leaves the present-time estimate byte-identical',
    noLead.learner === clean.learner && noLead.baseline === clean.baseline,
    `${noLead.learner} vs ${clean.learner}`);
}

if (process.env.SUITE === 'full') {
  // WHERE THE PHYSICS BASELINE FAILS, AND IT IS NOT WHERE I EXPECTED. A softer
  // gearbox means MORE wind-up, which the static formula should capture BETTER.
  // It gets worse instead, because a soft gearbox is also a SLOW one: at K = 0.05
  // the resonance period is ~2950 steps against a 1700-step move, so the wind-up
  // never reaches the quasi-static value the formula assumes and lags the command
  // instead. The static model fails precisely when the joint dominates -- which is
  // when compensation matters most.
  for (const K of [0.05, 0.15, 0.4, 1.282]) {
    const r = await session({ K, nTrain: 900, nTest: 400 });
    console.log(`    [stiffness] K=${String(K).padStart(5)}  learner ${r.learner.toFixed(4)}  `
      + `compliance ${r.baseline.toFixed(4)}  advantage ${(r.baseline / r.learner).toFixed(2)}x`);
    check(`the learner beats the compliance model at K=${K}`, r.learner < r.baseline,
      `${r.learner.toFixed(4)} vs ${r.baseline.toFixed(4)}`);
  }
}

// ================= THE LIBRARY ALREADY KNEW TWO THINGS I HAD NOT USED
//
// FULL TIER: these are documented MEASUREMENTS rather than contracts, and they
// are seven extra sessions -- 35 s of a 49 s file. The claims the shipped
// configuration depends on are above and run every time.
//
// An audit of lib/ngrc turned up four blocks built for exactly this domain and
// used by none of the above: RobotComp (per-joint compliance c_j = 1/K_j learned
// by exact RLS, with command pre-distortion -- the ACTIVE COMPENSATION side),
// ServoFF (self-commissioning drive feedforward with term pruning), AxisComp
// (position-domain pitch + BACKLASH compensation) and Continuous/directHorizons
// (forecasting a lead ahead, which is what a compensator consumes). Two of their
// ideas are cheap to test here and both are worth the measurement.
if (process.env.SUITE === 'full') {
  const b = 0.5 * clean.peakWindup;
  const windowed = globalThis.__windowed;
  const clean2Bit = await session({ directionBit: true });

  // ---- (1) AxisComp's DIRECTION BIT against my lag window.
  //
  // AxisComp fits err = pitch(pos,T) + (B/2)*dir with `dir` as an EXPLICIT
  // feature, calibrated from static laser dwells taken in both directions. Lost
  // motion is a function of which way you came from, so a signal saying which way
  // you came from turns a path-dependent target into a memoryless one -- where a
  // lag window has to infer the same thing from the shape of history.
  const m0 = await session({ lag: 1, stride: 1 });
  const m0b = await session({ lag: 1, stride: 1, backlash: b });
  const m1 = await session({ lag: 1, stride: 1, directionBit: true });
  const m1b = await session({ lag: 1, stride: 1, directionBit: true, backlash: b });
  console.log(`    [dir bit] memoryless  no bit ${m0.learner.toFixed(4)} -> `
    + `${m0b.learner.toFixed(4)} (+${(100 * (m0b.learner / m0.learner - 1)).toFixed(1)}%)`
    + `   with bit ${m1.learner.toFixed(4)} -> ${m1b.learner.toFixed(4)} `
    + `(${(100 * (m1b.learner / m1.learner - 1)).toFixed(1)}%)`);
  // THE BIT IMMUNISES A MEMORYLESS MODEL COMPLETELY: backlash costs it nothing,
  // against +28% without it. That is a clean confirmation of AxisComp's design --
  // the right feature turns the problem into a different problem.
  const dNoBit = m0b.learner / m0.learner - 1;
  const dBit = m1b.learner / m1.learner - 1;
  check('AxisComp\'s direction bit immunises a MEMORYLESS model against backlash',
    dBit < 0.25 * dNoBit,
    `without +${(100 * dNoBit).toFixed(1)}%, with ${(100 * dBit).toFixed(1)}%`);

  // ...AND IT SHIPS OFF, because the shipped model has a lag window and there the
  // bit makes things WORSE. The reason generalises past this plant: a LATCHED
  // SIGNAL IS NEARLY CONSTANT ACROSS A WINDOW, so its lags are almost collinear
  // and add features carrying information the first one already had -- variance
  // with no signal. 544 features become 751.
  const w1b = await session({ backlash: b, directionBit: true });
  const dWinNoBit = windowed.learner / clean.learner - 1;
  const dWinBit = w1b.learner / clean2Bit.learner - 1;
  console.log(`    [dir bit] windowed   no bit +${(100 * dWinNoBit).toFixed(1)}%  `
    + `with bit +${(100 * dWinBit).toFixed(1)}%   features ${clean.status.features} -> `
    + `${w1b.status.features}`);
  check('but with a lag window it is redundant AND costly, so it ships off',
    dWinBit > dWinNoBit && w1b.status.features > clean.status.features,
    `windowed degradation +${(100 * dWinNoBit).toFixed(1)}% -> +${(100 * dWinBit).toFixed(1)}%`);

  // ---- (2) DIRECTIONAL FORGETTING, on a plant that should suit it.
  //
  // With lam < 1 the covariance is inflated in EVERY direction each step while
  // only the excited ones get new information, so a poorly exciting stream winds
  // up without bound. A repeating move profile IS that condition -- a limit
  // cycle. Directional forgetting forgets only along the excited direction.
  //
  // The `rls` primitive has always supported it; SoftSensor simply never passed
  // it through, so the flag is now plumbed (opt-in, default false, every golden
  // vector byte-identical).
  const f10 = await session({ backlash: b });
  const f999 = await session({ backlash: b, lam: 0.999 });
  const fDir = await session({ backlash: b, lam: 0.999, directional: true });
  console.log(`    [forgetting] lam 1.0 ${f10.learner.toFixed(4)} tr ${f10.trace.toExponential(2)}`
    + `   lam .999 plain ${f999.learner.toFixed(4)} tr ${f999.trace.toExponential(2)}`
    + `   lam .999 directional ${fDir.learner.toFixed(4)} tr ${fDir.trace.toExponential(2)}`);
  // IT DOES EXACTLY WHAT IT IS FOR: plain forgetting winds the covariance up 2.7x
  // on this stream and directional forgetting holds it at the lam = 1 value.
  check('directional forgetting prevents the covariance wind-up plain forgetting causes',
    f999.trace > 2 * f10.trace && fDir.trace < 1.2 * f10.trace,
    `lam1 ${f10.trace.toExponential(2)}, plain ${f999.trace.toExponential(2)}, `
    + `directional ${fDir.trace.toExponential(2)}`);
  // AND IT IS NOT FREE, WHICH IS SHARPER THAN THE PRIOR RESULT. Four earlier
  // measurements in this project found directional forgetting neutral; here it is
  // neutral against lam = 1 (0.5909 vs 0.5906) but PLAIN forgetting scored better
  // than both (0.5375, a 9% gain) while winding the covariance up. So on this
  // stream directional forgetting does not merely buy nothing -- it gives up the
  // accuracy plain forgetting bought, in exchange for a bounded covariance. That
  // is a trade rather than a free guarantee, and it is the reason it stays default
  // off rather than the reason it is dismissed.
  check('directional forgetting matches lam = 1 in accuracy',
    Math.abs(fDir.learner / f10.learner - 1) < 0.05,
    `${f10.learner.toFixed(4)} vs ${fDir.learner.toFixed(4)}`);
  check('...but plain forgetting scored BETTER here, so the guarantee has a price',
    f999.learner < 0.95 * fDir.learner,
    `plain ${f999.learner.toFixed(4)} vs directional ${fDir.learner.toFixed(4)}`);
}

console.log(failed ? `\n${failed} tip-sensor check(s) failed\n` : '\ntipsensor: all checks passed\n');
process.exit(failed ? 1 : 0);
