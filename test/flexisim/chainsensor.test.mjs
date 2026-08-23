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
    if (y === null) continue;
    if (cs.trained < nTrain) { cs.train(e.total); continue; }
    if (cs.mode === 'training') cs.lock();
    if (est.length >= nTest) break;
    est.push(y); truth.push(e.total);
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
    rigid: nrmse(rigid, truth), status: cs.status(), n: est.length };
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
  + `${whole.rigid.toFixed(4)}   "the tool is where the encoders say" `
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
  // AND IF YOU CAN ONLY INSTRUMENT ONE AXIS, INSTRUMENT THE SHOULDER. It is levered
  // by the whole reach AND it drives the coupling that loads the elbow, so its
  // signals carry more about the tool than the elbow's own do. That is a deployment
  // conclusion, and it is the opposite of the intuition that the joint nearest the
  // tool matters most.
  check('the shoulder alone beats the elbow alone -- it is levered by the whole reach',
    shoulder.learner < elbow.learner,
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
