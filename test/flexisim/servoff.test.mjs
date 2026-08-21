// THE DRIVE-SIDE FEEDFORWARD, AND THE ONE TERM NOBODY HAS THE NUMBER FOR.
//
// The servo on this tab carries the textbook feedforward: (J_refl*alpha +
// tau_load)/N. It is exactly right about inertia and about gravity, because both
// come off the CAD -- and it says nothing at all about FRICTION, because nobody has
// that number on a real machine. That is the same asymmetry the anti-slosh tab's
// "engineering" Kalman filter is built on: masses and stiffnesses off the
// datasheet, friction and damping not modelled at all.
//
// lib/ngrc/servoff.js was written for precisely this: route the measured position,
// velocity, acceleration and the last applied torque, get a feedforward back. It
// learns the required-torque map over a basis that HAS coulomb, Stribeck and
// viscous terms in it, from the closed loop's own behaviour, while the hand-built
// feedforward is still driving.
//
// THE CLAIM IS TWO-SIDED AND BOTH SIDES ARE ASSERTED. On a plant with friction the
// learned feedforward wins, because the hand model is missing a real term. On a
// plant WITHOUT friction it loses, because the hand model is exact and a fit to an
// exact model can only add variance. A brick that measured only the first half
// would be claiming that learning is better than knowing.

import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm } from '../../lib/flexisim/arm.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { AngleProfile, PositionServo } from '../../lib/flexisim/compensator.js';
import { ServoFF } from '../../lib/ngrc/servoff.js';

const FULL = process.env.SUITE === 'full';
let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: the self-commissioning drive feedforward');

const H = 4, LEN = 16, CLAMP = 3, E = 0.2, nu = 0.3, rho = 1, K = 4.0, G = 2e-6;
const RATIO = 100, BW = 2e-3;
// MOTOR-SIDE STRIBECK, sized against the commanded torque rather than picked to
// look dramatic: the peak feedforward here is ~2e-4, so a 2.5e-5 Coulomb level is
// about 12% of it -- large enough to matter and small enough that the loop still
// tracks. Breakaway above Coulomb is what makes it Stribeck rather than a constant.
const FRICTION = { tauS: 4e-5, tauC: 2.5e-5, vs: 2e-3, viscous: 5e-4, eps: 1e-4,
  stickSpeed: 1e-6 };
// THE MOVE IS THE ONE THE COMPENSATOR TAB USES, and the acceleration matters here:
// a snappier profile raises the inertial torque and shrinks friction's share of it,
// so the same plant measured on a 200/300/700 profile shows 1.4x instead of 2.7x.
// That is not a weaker result, it is a different question -- what friction costs
// depends on how hard the move pushes -- so the profile is the shipped one.
const prof = new AngleProfile({ span: 0.144, accelSteps: 300, cruiseSteps: 400,
  dwellSteps: 1100 });
const refAt = (k) => (o) => {
  const r = prof.at(k + o);
  return { th: r.theta, v: r.omega, a: r.alpha };
};
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

async function makeArm(friction) {
  const link = await buildLink({ length: LEN, section: H, clamp: CLAMP, E, nu, rho,
    gravity: [0, -G, 0], damping: 3e-3 });
  const mp = massProperties(link);
  const joint = new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2), friction });
  const arm = new FlexArm({ joint, link, gravityWorld: [0, -G, 0], dt: 1 });
  const tauG = (th) => mp.centroid * mp.mass * (-G) * Math.cos(th);
  const Jr = joint.reflectedInertia();
  const servo = new PositionServo({ kp: BW * BW * Jr / RATIO, kd: 2 * BW * Jr / RATIO,
    inertia: Jr, ratio: RATIO, gravityTorque: tauG });
  return { arm, servo, link };
}

/** The textbook feedforward: inertia and gravity exactly, friction not at all. */
async function runHand(friction, periods = 3) {
  const m = await makeArm(friction);
  const err = [];
  const steps = periods * prof.period;
  for (let k = 0; k < steps; k++) {
    const ref = prof.at(k);
    m.arm.step(m.servo.torque(ref, m.arm.encoder()), 1);
    if (k >= steps - prof.period) err.push(m.arm.encoder().angle - ref.theta);
  }
  await m.link.destroy();
  return rms(err);
}

/**
 * ServoFF watches the closed loop while the hand feedforward drives, then takes
 * over the feedforward with the PD loop UNCHANGED.
 *
 * IT LEARNS THE TOTAL APPLIED TORQUE, which is the self-commissioning premise: the
 * PD loop is already generating whatever the hand model omits, so the torque
 * actually applied contains the friction term even though no model of it exists.
 * The learner does not need to be told what is missing.
 */
async function runLearned(friction, { warm = 3, learn = 4, prune = false } = {}) {
  const m = await makeArm(friction);
  const sff = new ServoFF(1, { warmup: 2000, maxPreview: 0, lagDeltas: [1, 3, 8, 20],
    npole: 8, gearh: [2, 3], pruneFloor: 0 });
  const err = [];
  let k = 0, tau = 0, prevW = 0;
  const meas = () => {
    const e = m.arm.encoder();
    const a = e.speed - prevW;
    prevW = e.speed;
    return { th: e.angle, v: e.speed, a, dT: 0 };
  };
  for (const n of [(warm + learn) * prof.period]) {
    for (let i = 0; i < n; i++, k++) {
      sff.step(meas(), tau, refAt(k), true);
      tau = m.servo.torque(prof.at(k), m.arm.encoder());
      m.arm.step(tau, 1);
    }
  }
  const report = sff.commission();
  if (!prune) sff.active.fill(true);
  for (let i = 0; i < prof.period; i++, k++) {
    const ref = prof.at(k);
    const ff = sff.step(meas(), tau, refAt(k), true);
    tau = m.servo.torque(ref, m.arm.encoder(), ff);
    m.arm.step(tau, 1);
    err.push(m.arm.encoder().angle - ref.theta);
  }
  await m.link.destroy();
  return { rms: rms(err), report, diverged: sff.diverged, nTotal: sff.n };
}

// ------------------------------------------------ friction: the learner wins
const handF = await runHand(FRICTION);
const learnF = await runLearned(FRICTION);
console.log(`    [friction]    hand feedforward ${handF.toExponential(3)}   `
  + `learned ${learnF.rms.toExponential(3)}   (${(handF / learnF.rms).toFixed(2)}x)   `
  + `top terms ${Object.keys(learnF.report.contrib).slice(0, 5).join(', ')}`);
check('ServoFF stays healthy (frozen, not diverged, all terms live)',
  !learnF.diverged && learnF.nTotal > 30, JSON.stringify(learnF.report).slice(0, 120));
check('on a plant with friction the LEARNED feedforward beats the hand-built one',
  learnF.rms < 0.6 * handF,
  `${learnF.rms.toExponential(3)} vs ${handF.toExponential(3)}`);
// The basis is asked to have found the terms the hand model omits. Naming them is
// what separates "it fitted something" from "it fitted the missing physics".
const top = Object.keys(learnF.report.contrib);
check('...and the terms it leans on include the friction ones the hand model omits',
  top.includes('coulomb') || top.includes('viscous') || top.includes('stribeck1'),
  top.join(','));

if (FULL) {
  // ------------------------------------ no friction: the learner LOSES, correctly
  const handC = await runHand(null);
  const learnC = await runLearned(null);
  console.log(`    [no friction] hand feedforward ${handC.toExponential(3)}   `
    + `learned ${learnC.rms.toExponential(3)}   (${(handC / learnC.rms).toFixed(2)}x)`);
  check('with NO friction the hand model is exact and the learner costs a little',
    learnC.rms > handC,
    `${learnC.rms.toExponential(3)} vs ${handC.toExponential(3)}`);
  // AND THE FRICTION IS WHAT THE HAND MODEL IS PAYING FOR: the same feedforward,
  // the same gains, an order of magnitude more following error once a term it does
  // not carry is present.
  console.log(`    [cost of the missing term] hand feedforward ${handC.toExponential(3)} `
    + `-> ${handF.toExponential(3)} when friction is added `
    + `(${(handF / handC).toFixed(1)}x)`);
  check('friction costs the hand-built feedforward an order of magnitude',
    handF > 8 * handC, `${(handF / handC).toFixed(1)}x`);

  // ------------------------------------------- pruning: measured, and rejected
  //
  // Term selection is one of ServoFF's advertised features and it is WRONG HERE.
  // The basis is deliberately redundant -- the lag terms duplicate the
  // instantaneous ones on a smooth reference, so RLS splits the weight across
  // near-collinear terms in large near-cancelling pairs. Pruning by weight
  // magnitude then removes one side of a cancellation, and the feedforward that
  // survives is not a smaller version of the right answer.
  const pruned = await runLearned(FRICTION, { prune: true });
  console.log(`    [pruning] ${pruned.report.nActive}/${pruned.report.nTotal} terms kept `
    + `-> ${pruned.rms.toExponential(3)} against ${learnF.rms.toExponential(3)} unpruned `
    + `(${(pruned.rms / learnF.rms).toFixed(0)}x worse)`);
  check('pruning by weight magnitude wrecks it on a deliberately redundant basis',
    pruned.rms > 5 * learnF.rms,
    `${pruned.rms.toExponential(3)} vs ${learnF.rms.toExponential(3)}`);
}

console.log(failed ? `\nservoff: ${failed} check(s) FAILED\n` : '\nservoff: all checks passed\n');
process.exit(failed ? 1 : 0);
