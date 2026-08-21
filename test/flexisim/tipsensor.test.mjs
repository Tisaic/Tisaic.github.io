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
                         damping = 3e-3, nTrain = 1200, nTest = 500 }) {
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
  const ts = new TipSensor({ sampleEvery: 10, lag, stride, warmup: 200 });

  const est = [], truth = [], base = [];
  let peakWindup = 0, trainedAfterLock = 0;
  for (let i = 0; i < nTrain + nTest; i++) {
    const y = ts.sample(arm, profile);
    const e = arm.tipError();
    peakWindup = Math.max(peakWindup, Math.abs(joint.windup()));
    if (y === null) continue;
    if (i < nTrain) { ts.train(e.total); continue; }
    if (ts.mode === 'training') ts.lock();
    if (ts.train(e.total)) trainedAfterLock++;      // must be refused
    est.push(y); truth.push(e.total);
    base.push(TipSensor.complianceEstimate({ alphaEnc: ts.lastSignals[2],
      inertia: mp.inertiaAboutPivot, stiffness: K, arm: arm.Larm }));
  }
  const status = ts.status();
  await link.destroy();
  return {
    learner: nrmse(est, truth), baseline: nrmse(base, truth),
    naive: nrmse(truth.map(() => 0), truth),
    peakWindup, status, trainedAfterLock, n: est.length,
  };
}

// ------------------------------------------------ the learner beats the physics
const clean = await session({});
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

console.log(failed ? `\n${failed} tip-sensor check(s) failed\n` : '\ntipsensor: all checks passed\n');
process.exit(failed ? 1 : 0);
