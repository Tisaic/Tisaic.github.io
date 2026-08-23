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
    // THE PLANT'S OWN MOTOR-TO-TIP DELAY, MEASURED RATHER THAN COMPUTED. The
    // compliance baseline is a PURE MOTOR-SIDE quantity -- J*alpha_enc/K times the
    // arm -- so where it best lines up with the tip's truth is the group delay
    // through the drive. It is the number the forecast horizon has to be compared
    // against, and computing it from a quarter of the gearbox period is a guess.
    out.baseLag = crossLag(base, truth, 90);
    out.fcLag = crossLag(fc, truth, 60);
  }
  return out;
}

// ------------------------------------------------ the learner beats the physics
// ONE SESSION SERVES BOTH TASKS. The forecast below is a second target of the same
// readout sharing the same feature expansion, so asking for it costs one RLS
// update and nothing else -- and the present-time numbers are byte-identical to a
// session without it, which the full tier asserts directly.
const LEAD = 15;      // samples, i.e. 150 solver steps -- the measured optimum below
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

// THE FORECAST IS MORE ACCURATE THAN THE PRESENT-TIME ESTIMATE HERE -- 0.1035
// against 0.3645 -- AND THE MECHANISM, FOUND LATER, IS THE PROTOCOL RATHER THAN
// THE SENSOR (brick 39; the owner's own read -- "the estimation error is not a
// lead" -- is what prompted the measurement). This session drives the arm OPEN
// LOOP in torque, and the symmetric profile walks the pose -3.3 rad across the
// training window through stiction asymmetry, so pose and time are confounded in
// the training data and the truth carries a slow drift. The frozen ESTIMATE
// inherits a growing bias -- measured -0.007 std early in training rising to
// -0.47 std by the end of the locked window -- while the forecast's weight vector
// happens to cancel the drift direction. NO TIME SHIFT REMOVES ANY OF IT: the
// best pure shift of the estimate against the truth is exactly 0 samples, in this
// protocol and in every other one measured. Under a POSITION SERVO -- the regime
// the page runs and a production machine lives in -- with the move amplitude
// modulated at the golden ratio so no two cycles repeat (brick 16's recall rule),
// the estimate reads 0.046, the forecast 0.040: a 1.1x gap and a flat bias. The
// full tier pins that below. The open-loop numbers in this section stay as the
// record of what an unregulated pose distribution does to a frozen readout.
//
// EITHER WAY IT IS THE USEFUL DIRECTION: a correction takes effect after the loop
// closes and the mechanism moves, so a compensator driven by an estimate needs the
// error it will HAVE. Brick 10's feedforward sidesteps that only because a static
// constant can be evaluated at the command; anything that READS the machine has to
// predict.
console.log(`    [delay] the motor-side baseline lines up with the tip at lag `
  + `${clean.baseLag.lag} samples = ${clean.baseLag.lag * 10} steps (r ${clean.baseLag.r.toFixed(4)}); `
  + `a quarter of the gearbox period would be ${Math.round(2 * Math.PI / 6.03e-3 / 4 / 10)}`);
console.log(`    [alignment] estimate correlates at lag ${clean.estLag.lag} `
  + `(r ${clean.estLag.r.toFixed(4)}), forecast at lag ${clean.fcLag.lag} `
  + `(r ${clean.fcLag.r.toFixed(4)})`);
// A LEAD DEFICIT OF A SAMPLE OR TWO IS A PROPERTY OF THE OPTIMAL PREDICTOR, NOT A
// PAIRING ERROR, and this project has measured it before: FlowSim's 1 s preview
// correlates best at 90 samples while trained for 100, and a batch least-squares
// fit on the TRUE plant state shows the same deficit. Least squares shrinks toward
// the mean at the far end of what it cannot know, and shrinkage reads as a slight
// lag. What a real off-by-one would look like is a CONSTANT offset at every lead,
// which the horizon sweep in the full tier is what checks.
check('the forecast lines up with the truth at its trained lead, to a sample',
  Math.abs(clean.fcLag.lag - LEAD) <= 1, `${clean.fcLag.lag} vs ${LEAD}`);
check('and it correlates with the truth better than the present-time readout does',
  clean.fcLag.r > clean.estLag.r,
  `${clean.fcLag.r.toFixed(4)} vs ${clean.estLag.r.toFixed(4)}`);

// ==================== CLOSED LOOP: THE ESTIMATION ERROR IS NOT A LEAD (brick 39)
//
// The 3.5x forecast-over-estimate gap above is a property of the OPEN-LOOP torque
// protocol (the pose walks, the frozen readout drifts), not of the sensor. This
// pins the corrected claim on the regime a machine actually runs: a position
// servo, with the move amplitude modulated at the golden ratio so no two cycles
// repeat and the score is generalisation rather than recall (brick 16's rule).
// Three things must hold: no time shift improves the estimate (the error is not a
// lead), the bias stays flat (no drift), and estimate and forecast agree to 1.5x
// (the "predicting ahead is easier" gap does not exist here).
if (process.env.SUITE === 'full') {
  const { AngleProfile, PositionServo } = await import('../../lib/flexisim/compensator.js');
  const link = await buildLink({ length: LEN, section: H, clamp: CLAMP, E, nu, rho,
    gravity: [0, 0, 0], damping: 3e-3 });
  const mp = massProperties(link);
  const joint = new Joint({ ratio: 100, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K_NOMINAL,
    damping: 2 * Math.sqrt(K_NOMINAL * (mp.inertiaAboutPivot / 2)), backlash: 0 });
  const arm = new FlexArm({ joint, link, gravityWorld: [0, -2e-6, 0], dt: 1 });
  const prof = new AngleProfile({ span: 0.6, accelSteps: 200, cruiseSteps: 300, dwellSteps: 150 });
  const servo = new PositionServo({ kp: 3e-2, kd: 6e-2, inertia: mp.inertiaAboutPivot, ratio: 100 });
  const ts = new TipSensor({ sampleEvery: 10, lag: 6, stride: 2, warmup: 200, lead: LEAD });
  const W = 2 * Math.PI / (prof.period * 1.6180339887);
  const refAt = (k) => {
    const r = prof.at(k);
    const m = 1 + 0.35 * Math.sin(W * k), md = 0.35 * W * Math.cos(W * k),
      mdd = -0.35 * W * W * Math.sin(W * k);
    return { theta: m * r.theta, omega: m * r.omega + md * r.theta,
      alpha: m * r.alpha + 2 * md * r.omega + mdd * r.theta };
  };
  const est = [], truth = [], fc = [];
  let k = 0, tau = 0, seen = 0;
  for (let s = 0; s < 1700; s++) {
    for (let i = 0; i < 10; i++) { tau = servo.torque(refAt(k), arm.encoder()); arm.step(tau, 1); k++; }
    const y = ts.observe(arm, tau);
    const e = arm.tipError();
    if (y === null) continue;
    if (seen++ < 1000) { ts.train(e.total); continue; }
    if (ts.mode === 'training') ts.lock();
    est.push(y); truth.push(e.total); fc.push(ts.forecast);
  }
  await link.destroy();
  const cl = { est: nrmse(est, truth) };
  let bestS = 0, bestV = Infinity;
  for (let s = -40; s <= 40; s++) {
    const p = [], w = [];
    for (let i = 0; i < est.length; i++) {
      const j = i + s;
      if (j < 0 || j >= truth.length) continue;
      p.push(est[i]); w.push(truth[j]);
    }
    const v = nrmse(p, w);
    if (v < bestV) { bestV = v; bestS = s; }
  }
  cl.fc = nrmse(fc.slice(0, fc.length - LEAD), truth.slice(LEAD));
  console.log(`    [closed loop] estimate ${cl.est.toFixed(4)}  forecast ${cl.fc.toFixed(4)}  `
    + `best shift ${bestS} (${bestV.toFixed(4)})  [open loop was ${clean.learner.toFixed(4)} / `
    + `${clean.forecast.toFixed(4)}]`);
  check('under a servo, no time shift improves the estimate — the error is not a lead',
    Math.abs(bestS) <= 1, `best shift ${bestS}`);
  check('…and the estimate is an order better than the open-loop protocol\'s',
    cl.est < 0.15, cl.est.toFixed(4));
  check('…and the forecast advantage is gone: the two agree within 1.5x',
    cl.fc < 1.5 * cl.est && cl.est < 1.5 * cl.fc,
    `${cl.est.toFixed(4)} vs ${cl.fc.toFixed(4)}`);
}

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
  // THE WINDOW WINS IN BOTH REGIMES AND IS HURT MORE, AND SAYING ONLY THE FIRST
  // HALF WOULD BE THE COMFORTABLE VERSION. Absolute scores are what a machine
  // gets: 0.6206 -> 0.3645 clean and 0.7238 -> 0.5884 under backlash, so memory is
  // worth 1.70x and 1.23x. But the RELATIVE damage is +16.6% for the memoryless
  // model against +61.4% for the windowed one -- the better model has more
  // structure to lose, and backlash is precisely a disruption of the fine timing
  // it was resolving.
  //
  // AN EARLIER VERSION OF THIS FILE CLAIMED THE OPPOSITE ("history absorbs about
  // two thirds of the damage") AND IT WAS AN ARTIFACT OF A SIGN ERROR. The truth
  // being estimated was bend + windup*L when the physics is bend - windup*L, so
  // the two contributions were SUBTRACTED rather than added and the target was a
  // partial cancellation of the real one. Every score in this file moved when it
  // was fixed. The claim that survives is the absolute one.
  const dMemoryless = memoryless.learner / memorylessClean.learner - 1;
  const dWindowed = windowed.learner / clean.learner - 1;
  console.log(`    [backlash] memory is worth ${(memorylessClean.learner / clean.learner).toFixed(2)}x `
    + `clean and ${(memoryless.learner / windowed.learner).toFixed(2)}x under backlash; `
    + `relative damage +${(100 * dMemoryless).toFixed(1)}% vs +${(100 * dWindowed).toFixed(1)}%`);
  check('a history window still wins UNDER backlash, in the absolute terms a machine gets',
    windowed.learner < memoryless.learner,
    `${windowed.learner.toFixed(4)} vs ${memoryless.learner.toFixed(4)}`);
  check('...but it is hurt MORE in relative terms, having more structure to lose',
    dWindowed > dMemoryless,
    `windowed +${(100 * dWindowed).toFixed(1)}% vs memoryless +${(100 * dMemoryless).toFixed(1)}%`);
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
  for (const L of [5, 30, 60]) rows.push(await session({ lead: L }));
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
  check('the learner has an INTERIOR minimum -- worse at a shorter lead AND at a longer one',
    at(15).forecast < at(5).forecast && at(15).forecast < at(30).forecast
      && at(30).forecast < at(60).forecast,
    `${at(5).forecast.toFixed(3)} ${at(15).forecast.toFixed(3)} `
    + `${at(30).forecast.toFixed(3)} ${at(60).forecast.toFixed(3)}`);
  // Every lead's readout must line up where it was trained, not just the shipped
  // one -- an off-by-one in the ring would be lead-dependent. TOLERANCE OF ONE
  // SAMPLE HERE AND NOT ON THE SHIPPED LEAD, because the argmax of a correlation
  // is only sharp when the correlation is high: lead 60 sits at r 0.94 with a flat
  // peak and reports 59. That is the readout being worse, not the pairing being
  // wrong -- a real off-by-one would shift EVERY lead by the same amount.
  check('every forecast lines up at its own trained lead to within two samples',
    rows.every((r) => Math.abs(r.fcLag.lag - r.leadSamples) <= 2),
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
  // THE SAME TRAINING LENGTH AS THE HEADLINE, and it had to be: at nTrain 900 the
  // K = 0.4 row scored 1.4712 against 0.3645 at nTrain 1200 -- the readout is still
  // converging there, so the sweep was measuring training length and calling it
  // stiffness.
  for (const K of [0.05, 0.15, 0.4, 1.282]) {
    const r = await session({ K });
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
  // THE BIT REDUCES BACKLASH DAMAGE IN BOTH CONFIGURATIONS, which is AxisComp's
  // design working: lost motion depends on which way you came from, so a signal
  // saying which way you came from turns a path-dependent target into a
  // memoryless one. Memoryless +16.6% -> +10.9%, windowed +61.4% -> +49.3%.
  //
  // AN EARLIER VERSION OF THIS FILE SAID IT "IMMUNISES A MEMORYLESS MODEL
  // COMPLETELY" AND MADE A WINDOWED ONE WORSE. Both halves were measured on a
  // target with a sign error in it (see FlexArm.tipError) and both reversed when
  // it was fixed. The claim that survives is the weaker and more ordinary one.
  const dNoBit = m0b.learner / m0.learner - 1;
  const dBit = m1b.learner / m1.learner - 1;
  check('AxisComp\'s direction bit reduces what backlash costs a MEMORYLESS model',
    dBit < dNoBit, `without +${(100 * dNoBit).toFixed(1)}%, with +${(100 * dBit).toFixed(1)}%`);

  // ...AND IT STILL SHIPS OFF, but now on cost rather than on harm. It buys a
  // smaller relative degradation and does NOT buy a better absolute score, while
  // adding 207 features -- a LATCHED SIGNAL IS NEARLY CONSTANT ACROSS A WINDOW,
  // so its lags are almost collinear and carry information the first one already
  // had. What a machine gets is the absolute number, and that is what is asserted.
  const w1b = await session({ backlash: b, directionBit: true });
  const dWinNoBit = windowed.learner / clean.learner - 1;
  const dWinBit = w1b.learner / clean2Bit.learner - 1;
  console.log(`    [dir bit] windowed   no bit ${windowed.learner.toFixed(4)} `
    + `(+${(100 * dWinNoBit).toFixed(1)}%)  with bit ${w1b.learner.toFixed(4)} `
    + `(+${(100 * dWinBit).toFixed(1)}%)   features ${clean.status.features} -> `
    + `${w1b.status.features}`);
  check('but with a lag window it buys no better ABSOLUTE score, at 207 more features',
    w1b.learner >= windowed.learner && w1b.status.features > clean.status.features,
    `${windowed.learner.toFixed(4)} -> ${w1b.learner.toFixed(4)}, `
    + `${clean.status.features} -> ${w1b.status.features}`);

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
  // AND THE FIFTH INDEPENDENT MEASUREMENT AGREES WITH THE FIRST FOUR: directional
  // forgetting is NEUTRAL. lam 1.0 0.5884, directional 0.5892 -- the same to three
  // digits -- while plain forgetting is 0.6104, i.e. 3.7% WORSE, and pays for it
  // with a covariance 2.7x wound up. So directional forgetting is a free
  // guarantee here rather than a trade, and it stays default off only because
  // there is nothing on this stream for it to guarantee against.
  //
  // AN EARLIER VERSION OF THIS FILE REPORTED THE OPPOSITE -- plain forgetting 9%
  // BETTER, making the guarantee a trade -- and that was measured on a target with
  // a sign error in it (see FlexArm.tipError). The corrected target restores the
  // ordinary result. It is worth recording that the WRONG target produced the more
  // interesting claim; a surprising measurement is a reason to check the
  // instrument, not a reason to celebrate.
  check('directional forgetting matches lam = 1 in accuracy',
    Math.abs(fDir.learner / f10.learner - 1) < 0.05,
    `${f10.learner.toFixed(4)} vs ${fDir.learner.toFixed(4)}`);
  check('...and plain forgetting is worse, so the bounded covariance costs nothing here',
    f999.learner > fDir.learner,
    `plain ${f999.learner.toFixed(4)} vs directional ${fDir.learner.toFixed(4)}`);
}

console.log(failed ? `\n${failed} tip-sensor check(s) failed\n` : '\ntipsensor: all checks passed\n');
process.exit(failed ? 1 : 0);
