// THE TOOL ERROR ON A CHAIN, AND THE ARCHITECTURE QUESTION A CHAIN MAKES ASKABLE.
//
// The single-joint soft sensor had one possible set of inputs. A chain forces a
// choice, and it is the one a real controller faces: PER-JOINT (each axis estimates
// from its own signals -- what a distributed drive naturally supports, and what
// every servo vendor's compensation package looks like) or WHOLE-ARM (one model
// reads every axis, which needs the signals gathered in one place and is a real
// cost on a real machine).
//
// THE PHYSICS SAYS THE WHOLE-ARM MODEL SHOULD WIN, because the elbow's gearbox
// torque is M21*alpha1 + M22*alpha2 and the first term dominates. But NOT "by
// construction", and it is worth being careful here: the shoulder's acceleration
// leaves an INDIRECT trace in the elbow's own signals -- it back-drives the elbow's
// encoder, and the elbow's servo fights it, so tau_cmd2 responds too. The elbow's
// signals are not blind to the coupling; they see it through two layers of loop
// dynamics. The question is what that costs, and it is measured rather than
// asserted.

import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { AngleProfile, ChainServo } from '../../lib/flexisim/compensator.js';
import { ChainSensor } from '../../lib/flexisim/chainsensor.js';
import { plsMake, plsObserve, plsFit, plsPredict } from '../../lib/ngrc/pls.js';

// COMPONENTS AT FULL RANK, which is what makes this a real baseline and not a strawman.
// PLS's advantage lives in the p >> n regime (many correlated sensors, few samples); a lag
// window is not that, and on the NGRC soft-sensor plant more components was monotonically
// better right up to full rank. At full rank PLS IS ordinary least squares on the window --
// the strongest linear model available on these signals, which is exactly what the learner
// should have to beat.
const PLS_A = 200;
import { nrmse } from '../../lib/flexisim/tipsensor.js';

const FULL = process.env.SUITE === 'full';
let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: the tool sensor on a chain');

const H = 4, E = 0.15, nu = 0.3, rho = 1, K = 16, g = 2e-6;
const LEN1 = 14, LEN2 = 10, CLAMP = 3, RATIO = 100, ELBOW = 0.6;
const SAMPLE = 10;

/**
 * Drive the chain through a repeating two-joint move, train against the tracker,
 * LOCK, and score what the machine would produce afterwards.
 *
 * BOTH JOINTS MOVE. Commanding the shoulder alone would leave the elbow-only model
 * with almost no input variation of its own, which would rig the comparison it
 * exists to lose; with both moving, every configuration has a rich stream and the
 * question is purely what each one can INFER from it.
 */
// THE GOLDEN RATIO IS NOT DECORATION. The move profile is exactly periodic, and a
// model with hundreds of features fitted to a periodic stream can score beautifully
// by learning WHERE IN THE CYCLE it is -- at which point the test set is the same
// cycle it trained on and the number means nothing. Modulating the command's
// amplitude at an INCOMMENSURATE rate makes every cycle a state the model has not
// seen, so what is scored is generalisation. Measured: with the modulation off the
// whole-arm model reads 0.0142 and with it on 0.0454 at the same settings, and a
// window taken FURTHER out still (states even less like the training ones) reads
// 0.0355 -- lower, not higher, which is what says it generalises rather than
// recalls.
const GOLD = 0.6180339887;

/**
 * Drive the chain through a repeating two-joint move, train against the tracker,
 * LOCK, and score what the machine would produce afterwards.
 *
 * BOTH JOINTS MOVE. Commanding the shoulder alone would leave the elbow-only model
 * with almost no input variation of its own, which would rig the comparison it
 * exists to lose; with both moving, every configuration has a rich stream and the
 * question is purely what each one can INFER from it.
 */
async function session({ joints = [0, 1], lag = 18, stride = 6, nTrain = 900, nTest = 400,
                         lead = 0, jitter = 0.25, elbowHeld = false } = {}) {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E, nu, rho,
    damping: 3e-3 });
  const link1 = await mk(LEN1), link2 = await mk(LEN2);
  const j = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: j(massProperties(link1)), link1,
    joint2: j(massProperties(link2)), link2, gravityWorld: [0, -g, 0], dt: 1 });
  arm.setPose(0, ELBOW);
  const servo = new ChainServo({ arm, bandwidth: 2e-3 });
  const prof = new AngleProfile({ span: 0.30, accelSteps: 300, cruiseSteps: 400,
    dwellSteps: 900 });
  const cs = new ChainSensor({ joints, sampleEvery: SAMPLE, lag, stride, lead });

  const est = [], truth = [], rigid = [], fc = [], alpha = [];
  // ---- PLS, THE INCUMBENT, on the SAME lagged window the learner's features are built
  // from, so the only difference is the model class. It is fed from `cs.lastSignals`
  // rather than by calling `signals()` again: that call updates the sensor's own previous
  // speeds, so a second call per sample would corrupt the accelerations of the very model
  // it is being compared against.
  const sigRing = [];
  const plsDim = joints.length * (5 + 0) * lag;
  const plsF = plsMake(plsDim);          // FROZEN after the same training window
  const plsA = plsMake(plsDim);          // ADAPTIVE: forgetting + periodic refit
  const plsEstF = [], plsEstA = [];
  let plsFitted = false;
  const plsWindow = () => {
    if (sigRing.length < (lag - 1) * stride + 1) return null;
    const w = [];
    for (let l = 0; l < lag; l++) {
      const v = sigRing[sigRing.length - 1 - l * stride];
      for (let i = 0; i < v.length; i++) w.push(v[i]);
    }
    return w.length === plsDim ? w : null;
  };
  let k = 0, tau = [0, 0];
  for (let i = 0; i < nTrain + nTest + 200; i++) {
    for (let n = 0; n < SAMPLE; n++) {
      const amp = 1 + jitter * Math.sin(2 * Math.PI * GOLD * k / prof.period);
      const a = prof.at(k), b = prof.at(k + Math.round(prof.period / 4));
      const refs = [
        { theta: a.theta * amp, omega: a.omega * amp, alpha: a.alpha * amp },
        elbowHeld ? { theta: ELBOW, omega: 0, alpha: 0 }
          : { theta: ELBOW + (b.theta - prof.span / 2) * amp, omega: b.omega * amp,
            alpha: b.alpha * amp },
      ];
      tau = servo.torques(refs);
      arm.step(tau[0], tau[1], 1);
      k++;
    }
    const y = cs.observe(arm, tau, 1);
    const e = arm.tipError();
    if (cs.lastSignals) { sigRing.push(cs.lastSignals.slice());
      if (sigRing.length > lag * stride + 4) sigRing.shift(); }
    if (y === null) continue;
    if (cs.trained < nTrain) {
      cs.train(e.total);
      const w = plsWindow();
      // Both PLS variants see exactly the pairs the learner trains on.
      if (w) { plsObserve(plsF, w, e.total, 1); plsObserve(plsA, w, e.total, 0.999); }
      continue;
    }
    if (cs.mode === 'training') cs.lock();
    if (!plsFitted) { plsFit(plsF, PLS_A); plsFit(plsA, PLS_A); plsFitted = true; }
    if (est.length >= nTest) break;
    est.push(y); truth.push(e.total);
    {
      const w = plsWindow();
      // FROZEN never sees another sample -- the incumbent as deployed. ADAPTIVE keeps
      // accumulating with forgetting and refits every 100 samples, which is the stronger
      // and rarer recursive variant. Neither is given the truth after the lock in a way
      // the learner is not: the learner is LOCKED, so adaptive PLS is if anything
      // FLATTERED here, and that is the safe direction for a baseline.
      plsEstF.push(w ? (plsPredict(plsF, w) ?? 0) : 0);
      if (w) { plsObserve(plsA, w, e.total, 0.999);
        if (est.length % 100 === 0) plsFit(plsA, PLS_A); }
      plsEstA.push(w ? (plsPredict(plsA, w) ?? 0) : 0);
    }
    if (lead > 0) fc.push(cs.forecast);
    // THE RIGID BASELINE GETS BOTH ENCODERS whatever the model is allowed to read.
    // It is the physics-based rival -- M(q), both stiffnesses, both lever arms --
    // not a handicapped version of the per-joint idea.
    const enc = arm.encoders();
    const a2 = [(enc[0].speed - alpha[0]) / SAMPLE, (enc[1].speed - alpha[1]) / SAMPLE];
    rigid.push(ChainSensor.rigidEstimate(arm, alpha.length ? a2 : [0, 0]));
    alpha[0] = enc[0].speed; alpha[1] = enc[1].speed;
  }
  await link1.destroy(); await link2.destroy();
  const out = { learner: nrmse(est, truth), naive: nrmse(truth.map(() => 0), truth),
    rigid: nrmse(rigid, truth), plsFrozen: nrmse(plsEstF, truth),
    plsAdaptive: nrmse(plsEstA, truth), status: cs.status(), n: est.length };
  if (lead > 0) {
    const want = truth.slice(lead);
    out.forecast = nrmse(fc.slice(0, fc.length - lead), want);
    out.persist = nrmse(est.slice(0, est.length - lead), want);
  }
  return out;
}

// ------------------------------------------------ the whole-arm model, locked
const whole = await session({ joints: [0, 1], lag: 18, stride: 6, lead: FULL ? 15 : 0,
  nTrain: FULL ? 1200 : 900, nTest: FULL ? 500 : 400 });
console.log(`    [whole arm] learner ${whole.learner.toFixed(4)}   rigid model `
  + `${whole.rigid.toFixed(4)}   PLS frozen ${whole.plsFrozen.toFixed(4)}   PLS adaptive `
  + `${whole.plsAdaptive.toFixed(4)}   "the tool is where the encoders say" `
  + `${whole.naive.toFixed(4)}   (${whole.n} locked samples, ${whole.status.features} features `
  + `from ${whole.status.signals} signals)`);
check('the chain sensor reaches a locked, frozen readout',
  whole.status.mode === 'estimating' && whole.status.frozen && whole.status.trained > 400,
  JSON.stringify(whole.status));
// The naive view is the controller's own picture of where the tool is. It scores
// near 1.0 because the error oscillates about nearly zero -- which is to say it
// carries almost no information about the error at all.
check('a locked whole-arm sensor beats the controller\'s own view of where the tool is',
  whole.learner < 0.2 * whole.naive,
  `${whole.learner.toFixed(4)} vs ${whole.naive.toFixed(4)}`);
// ---- PLS IS THE INCUMBENT, and it is the baseline that makes this claim commercial.
// A Kalman filter needs state equations nobody has for tool deflection; what industry
// actually deploys for a soft sensor is PLS on the measured signals. It is given the SAME
// lagged window the learner's features are built from and fitted at FULL RANK, where PLS
// is ordinary least squares on that window -- the strongest linear model these signals
// support. So the only difference between them is the model class, which is the whole
// point: if the relationship were linear, the incumbent would win and this library would
// have no case here.
//
// The FROZEN variant is the incumbent as actually deployed -- fitted once and left. The
// ADAPTIVE one keeps accumulating with forgetting and refits every 100 samples, which is
// the stronger and rarer recursive variant, and it is FLATTERED relative to the learner:
// the learner is LOCKED and never sees truth again after commissioning, while adaptive PLS
// keeps being told the answer. That asymmetry runs against the claim, which is the safe
// direction for a baseline to be wrong in.
check('…and it beats PLS, the linear model industry actually deploys for soft sensing',
  whole.learner < 0.5 * whole.plsAdaptive,
  `learner ${whole.learner.toFixed(4)} vs adaptive ${whole.plsAdaptive.toFixed(4)} `
  + `/ frozen ${whole.plsFrozen.toFixed(4)}`);
// NO ORDERING IS ASSERTED BETWEEN THE TWO PLS VARIANTS, and the reason is a defect this
// check had when it was written. It claimed the FROZEN model must be worse -- "the drift
// argument" -- which held in the quick tier (0.1078 against 0.0737) and FAILED in the full
// one (0.0370 against 0.0428), where frozen is better. Both are correct measurements of
// different streams.
//
// Adaptive here means exponential forgetting, and on a STATIONARY stream forgetting is a
// pure loss: it discards data that is still valid. This project has measured that four
// separate times and concluded it each time. The frozen model only loses when the
// deployment regime differs from the training one -- which is the drift argument, and it
// is an argument about the DEPLOYMENT, not a property of the fit. Asserting the ordering
// without engineering a regime change asserts that a particular stream happened to drift.
console.log(`    [whole arm] PLS frozen ${whole.plsFrozen.toFixed(4)} vs adaptive `
  + `${whole.plsAdaptive.toFixed(4)} — whichever leads here is a property of THIS stream's `
  + `stationarity, not of the method`);

check('and it beats the rigid two-joint compliance model, which knows M(q) and both stiffnesses',
  whole.learner < 0.5 * whole.rigid,
  `${whole.learner.toFixed(4)} vs ${whole.rigid.toFixed(4)} `
  + `(${(whole.rigid / whole.learner).toFixed(2)}x)`);

let elbow = null, shoulder = null;
if (FULL) {
  console.log(`    [whole arm] forecast +${15 * SAMPLE} steps ${whole.forecast.toFixed(4)} `
    + `vs persistence-of-estimate ${whole.persist.toFixed(4)}`);
  check('the forecast beats the persistence baseline a machine could actually run',
    whole.forecast < whole.persist,
    `${whole.forecast.toFixed(4)} vs ${whole.persist.toFixed(4)}`);

  // ------------------------------------- per-joint against whole-arm, MATCHED
  //
  // THE COMPARISON IS ONLY WORTH ANYTHING AT MATCHED CAPACITY. The whole-arm model
  // reads 10 signals and the single-axis ones read 5, so at the same lag count it
  // would have three times the features -- and part of any gap would be model size
  // rather than information. Giving the single-axis models SIX lags against the
  // whole-arm model's THREE puts every configuration at the same 30-dimensional
  // base and the same 544-feature basis, so the only difference left is WHICH
  // SIGNALS. It also hands them a window twice as long, which if anything favours
  // them -- and they still lose.
  elbow = await session({ joints: [1], lag: 36, stride: 3, nTrain: 1200, nTest: 500 });
  shoulder = await session({ joints: [0], lag: 36, stride: 3, nTrain: 1200, nTest: 500 });
  console.log(`    [inputs, all at ${whole.status.features} features] whole arm `
    + `${whole.learner.toFixed(4)}   shoulder only ${shoulder.learner.toFixed(4)}   `
    + `elbow only ${elbow.learner.toFixed(4)}`);
  check('reading both axes beats reading only the elbow\'s own signals',
    whole.learner < 0.6 * elbow.learner,
    `${whole.learner.toFixed(4)} vs ${elbow.learner.toFixed(4)} `
    + `(${(elbow.learner / whole.learner).toFixed(2)}x)`);
  check('...and beats reading only the shoulder\'s',
    whole.learner < 0.7 * shoulder.learner,
    `${whole.learner.toFixed(4)} vs ${shoulder.learner.toFixed(4)} `
    + `(${(shoulder.learner / whole.learner).toFixed(2)}x)`);
  // WHICH SINGLE AXIS TO INSTRUMENT IS A TIE, AND THE OLD ANSWER WAS AN ARTEFACT.
  //
  // This block used to assert that the SHOULDER wins -- levered by the whole reach and
  // driving the coupling that loads the elbow -- and measured 0.0250 against 0.0334. That
  // was scored against a `tipError()` that was wrong by a factor of 1.44 and MISSING ITS
  // LARGEST TERM: link 1's tip SLOPE, levered by the whole forearm, which alone is 2.9x
  // the sum of both gearbox wind-ups. Against the corrected target the two measure 0.0323
  // and 0.0307 -- a tie, and if anything the other way round.
  //
  // THE MECHANISM IS THE MISSING TERM ITSELF. Once the target includes link 1's bending
  // SLOPE it is dominated by a deformation loaded by the whole downstream mass, and both
  // joints see that: the shoulder through its own torque, the elbow through the reaction
  // its servo is fighting. So neither axis has the monopoly the old ordering implied.
  //
  // WHAT SURVIVES IS THE CLAIM THE TAB EXISTS FOR: reading both axes beats reading
  // either, by 1.9x, and that is asserted above. A 5% gap between the two single-axis
  // models is within the run-to-run spread this pair has always shown, so asserting a
  // direction here would be asserting noise -- the mistake this file has now made twice
  // about these same two numbers.
  console.log(`    [single axis] shoulder ${shoulder.learner.toFixed(4)} against elbow `
    + `${elbow.learner.toFixed(4)} — `
    + `${Math.abs(shoulder.learner / elbow.learner - 1) < 0.25 ? 'a tie' : 'a real gap'}`);
  check('neither single axis has a monopoly on the tool, which the corrected target shows',
    Math.abs(Math.log(shoulder.learner / elbow.learner)) < Math.log(1.4),
    `${shoulder.learner.toFixed(4)} vs ${elbow.learner.toFixed(4)}`);
  // BOTH SINGLE-AXIS MODELS STILL BEAT THE NAIVE VIEW, and that is the honest half:
  // the coupling leaves an INDIRECT trace in each axis's own signals -- it
  // back-drives the other encoder and the other servo fights it -- so a per-joint
  // estimator is not blind, merely handicapped. "Blind by construction" would be
  // the tidier claim and it would be wrong.
  check('but each single-axis model still beats the naive view, so neither is blind',
    elbow.learner < 0.5 * elbow.naive && shoulder.learner < 0.5 * shoulder.naive,
    `${elbow.learner.toFixed(3)}/${elbow.naive.toFixed(3)}, `
    + `${shoulder.learner.toFixed(3)}/${shoulder.naive.toFixed(3)}`);
}

if (FULL) {
  // THE REVERSAL WAS THE WINDOW, AND IT IS GONE.
  //
  // For a long time this block recorded that with the elbow commanded to HOLD -- the
  // configuration that makes the coupling clearest, since then almost all of the elbow's
  // inertial load is the shoulder's -- the whole-arm model LOST (0.562 against 0.494),
  // and it recorded honestly that no clean mechanism had been found for it. Two
  // hypotheses were tried and both were falsified: that the matched feature count forced
  // different time spans, and that widening the stride would fix it (it made things
  // worse, 0.793).
  //
  // BOTH WERE FALSIFIED BECAUSE BOTH WERE TESTED AT A WINDOW THAT COULD NOT REACH THE
  // RING AT ALL. The chain's bending mode is ~860 steps and the window reached 40. At a
  // window that spans a full period the whole-arm model wins comfortably in this regime
  // too -- measured 0.0371 against the elbow-only 0.2051, i.e. 5.5x, the same direction
  // and a larger margin than with both joints moving. The physics that predicts it was
  // right all along: the elbow cannot see M21*alpha1 directly, and that term is 14x the
  // one it can see. What was wrong was the instrument.
  const heldW = await session({ joints: [0, 1], lag: 18, stride: 6, elbowHeld: true });
  const heldE = await session({ joints: [1], lag: 36, stride: 3, elbowHeld: true });
  console.log(`    [regime] elbow HELD: whole arm ${heldW.learner.toFixed(4)}   elbow only `
    + `${heldE.learner.toFixed(4)}   (both joints moving: `
    + `${whole.learner.toFixed(4)} / ${elbow.learner.toFixed(4)})`);
  check('with the elbow HELD the whole-arm model still wins, once the window reaches the ring',
    heldW.learner < heldE.learner,
    `${heldW.learner.toFixed(4)} vs ${heldE.learner.toFixed(4)} `
    + `(${(heldE.learner / heldW.learner).toFixed(1)}x)`);
  // …AND THE WINDOW IS WHAT MOVED, which is asserted here rather than argued: the same
  // regime at the OLD 40-step window, both architectures, is several times worse.
  // NOTE WHAT IS AND IS NOT CLAIMED. The old pair scored 0.562 / 0.494 and the same pair
  // re-measured here does not reproduce that ordering, so the reversal was never a stable
  // property to begin with -- it was two numbers a few percent apart, both taken from
  // models that could see 4.6% of the period they were being asked about. What IS stable
  // is that widening the window is worth 8x to the whole-arm model in this regime, and
  // that once widened it wins by 5.5x. A difference measured with a broken instrument is
  // not a finding, and this file recorded one as though it were.
  const heldNarrow = await session({ joints: [0, 1], lag: 3, stride: 2, elbowHeld: true });
  const heldNarrowE = await session({ joints: [1], lag: 6, stride: 2, elbowHeld: true });
  console.log(`    [regime] at the OLD 40-step window: whole arm `
    + `${heldNarrow.learner.toFixed(4)}   elbow only ${heldNarrowE.learner.toFixed(4)}`);
  check('…and the narrow window, not the regime, is what the old reversal was measuring',
    heldNarrow.learner > heldW.learner * 3,
    `${heldNarrow.learner.toFixed(4)} narrow against ${heldW.learner.toFixed(4)} wide `
    + `(${(heldNarrow.learner / heldW.learner).toFixed(1)}x)`);
}

console.log(failed ? `\nchain sensor: ${failed} check(s) FAILED\n`
  : '\nchain sensor: all checks passed\n');
process.exit(failed ? 1 : 0);
