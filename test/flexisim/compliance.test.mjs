// The STRUCTURED rival: learning a physical constant instead of the error itself.
//
// TipSensor learns a map from motor-side signals to the tip error -- 544 features,
// no commitment about why. This learns ONE number with a meaning, inside a model
// whose form is fixed by mechanics: delta = J diag(c) J^T W, which for a planar
// single-joint arm is delta = L c tau. lib/ngrc/robotcomp.js was written for
// exactly this and the audit found it unused.
//
// THE POINT IS NOT THE IN-DISTRIBUTION SCORE. A constant EXTRAPOLATES and a fitted
// map does not, and a constant can be CHECKED AGAINST THE TRUTH -- a black-box
// readout offers no number to be right or wrong about except its output. That is
// the parametric-versus-hybrid contrast the anti-slosh tab draws.

import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm } from '../../lib/flexisim/arm.js';
import {
  buildLink, massProperties, gravityTorque, tipDeflection, armLength, peakSpeed,
} from '../../lib/flexisim/link.js';
import { MoveProfile } from '../../lib/flexisim/tipsensor.js';
import { PlanarComp } from '../../lib/flexisim/compliance.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: structured compliance identification');

const H = 4, LEN = 16, CLAMP = 3, nu = 0.3, rho = 1, K = 0.4, g = 2e-6;

/**
 * ONE STATIC POSE TOUCH: hold the motor, let the arm settle under gravity at a
 * pose, read the joint torque and the tip deflection a tracker would measure.
 *
 * STATIC IS NOT A CONVENIENCE, IT IS THE ONLY REGIME WHERE c IS IDENTIFIABLE, and
 * CompCommissioner's design says so by taking pose TOUCHES rather than a trace.
 * The check at the end measures what happens if you ignore that.
 */
async function poseTouch(E, theta) {
  const gb = [-g * Math.sin(-theta), -g * Math.cos(-theta), 0];  // world -y into the body frame
  const link = await buildLink({ length: LEN, section: H, clamp: CLAMP,
    E, nu, rho, gravity: gb, damping: 5e-3 });
  link.advance(14000);
  const out = { tauG: gravityTorque(link, gb), sag: tipDeflection(link),
    L: armLength(link), v: peakSpeed(link) };
  out.tilt = (out.tauG / K) * out.L;      // exact at equilibrium: windup = tau/K
  out.total = out.tilt + out.sag;
  await link.destroy();
  return out;
}

const POSES = [0, 0.4, 0.8, 1.2];

for (const [E, label] of [[0.2, 'stiff link'], [0.05, 'nominal link']]) {
  const touches = [];
  for (const th of POSES) touches.push(await poseTouch(E, th));
  check(`every ${label} pose settled`, touches.every((t) => t.v < 1e-12),
    touches.map((t) => t.v.toExponential(1)).join(' '));

  // Identify from the FIRST THREE poses only; the fourth is held out.
  const pc = new PlanarComp(touches[0].L);
  for (const t of touches.slice(0, 3)) pc.calibrate(t.tauG, t.total);

  // The effective compliance has a closed form of its own: every touch lies on
  // delta = L c tau, so c is delta/(L tau) and every pose must agree.
  const cClosed = touches[0].total / (touches[0].L * touches[0].tauG);
  // THE POSES DO NOT AGREE EXACTLY, AND THE RESIDUAL IS THE MODEL'S OWN LIMIT
  // rather than a numerical one. delta = L c tau is a purely TRANSVERSE model, but
  // the body-frame gravity at a pose has an AXIAL component too -- at theta = 1.2
  // it is mostly axial (cos 1.2 = 0.36) -- and that component stretches the link
  // without bending it. So the relation is linear to about 1e-4 and not to machine
  // precision, which is the size of the term the structure leaves out. Naming it
  // is better than widening the tolerance and moving on.
  const cPer = touches.map((t) => t.total / (t.L * t.tauG));
  const spread = (Math.max(...cPer) - Math.min(...cPer)) / cClosed;
  console.log(`    [${label}] identified c ${pc.compliance.toFixed(4)} (K ${pc.stiffness.toFixed(4)})`
    + `   closed form ${cClosed.toFixed(4)}   joint-only 1/K ${(1 / K).toFixed(4)}`);
  check(`${label}: the identified compliance matches its own closed form`,
    Math.abs(pc.compliance / cClosed - 1) < 1e-3,
    `${pc.compliance.toFixed(6)} vs ${cClosed.toFixed(6)}`);
  check(`${label}: and the per-pose spread is the axial term the model omits, not noise`,
    spread > 1e-6 && spread < 5e-3,
    `${(100 * spread).toFixed(4)}% across poses ${POSES.join('/')}`);

  // EXTRAPOLATION IS THE WHOLE ARGUMENT. The fourth pose was never shown, and its
  // gravity torque is 2.8x smaller than the first -- outside the range identified
  // from. A constant predicts it exactly; a map fitted over the training range has
  // to guess.
  const held = touches[3];
  const pred = pc.estimate(held.tauG);
  check(`${label}: it predicts a pose it never saw, to the model's own accuracy`,
    Math.abs(pred / held.total - 1) < 2e-3,
    `predicted ${pred.toExponential(5)} vs ${held.total.toExponential(5)}`);
}

// ------------- what the identified constant IS, and what it is not
{
  const t0 = await poseTouch(0.05, 0);
  const cEff = t0.total / (t0.L * t0.tauG);
  console.log(`    [what it is] c_eff ${cEff.toFixed(3)} against a joint-only 1/K `
    + `${(1 / K).toFixed(3)} -- the link's own sag is ${(100 * t0.sag / t0.tilt).toFixed(0)}% of the tilt`);
  // IT IS AN EFFECTIVE COMPLIANCE, NOT THE GEARBOX'S OWN, and that is a property of
  // the INSTRUMENT rather than of the method: a tracker at the tip measures joint
  // wind-up and link bending summed, and no fit to that sum can separate them.
  // Splitting them needs a second instrument -- a link-side encoder -- which is a
  // real commissioning fact and not a modelling shortcut.
  //
  // AND FOR COMPENSATION THE EFFECTIVE ONE IS THE RIGHT CONSTANT ANYWAY: what has
  // to be pre-distorted away is the total deflection, not the gearbox's share.
  check('the identified constant is EFFECTIVE (joint + link), not the gearbox alone',
    cEff > 2 * (1 / K),
    `c_eff ${cEff.toFixed(3)} vs 1/K ${(1 / K).toFixed(3)}`);
}

// ------------- and why CompCommissioner takes static touches
if (process.env.SUITE === 'full') {
  // FIT THE SAME MODEL TO A MOVING TRACE and it recovers neither constant. The
  // reason is mechanical: the gearbox transmits K*d + C*d_dot, and this drive is
  // damped near critical, so during a move the DAMPER carries most of the torque
  // and the wind-up is nowhere near tau/K. A static-compliance fit to dynamic data
  // is measuring a blend of a stiffness and a damping, which is neither.
  const link = await buildLink({ length: LEN, section: H, clamp: CLAMP,
    E: 0.05, nu, rho, gravity: [0, 0, 0], damping: 3e-3 });
  const mp = massProperties(link);
  const joint = new Joint({ ratio: 100, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm({ joint, link, gravityWorld: [0, 0, 0], dt: 1 });
  const profile = new MoveProfile({ accelSteps: 200, cruiseSteps: 300,
    dwellSteps: 150, torque: 2e-3 });
  const pc = new PlanarComp(arm.Larm);
  let k = 0;
  for (let i = 0; i < 1200; i++) {
    for (let s = 0; s < 10; s++) { arm.step(profile.torqueAt(k), 1); k++; }
    if (i > 50) pc.calibrate(joint.transmitted(), arm.tipError().tilt);
  }
  const cDyn = pc.compliance;
  await link.destroy();
  console.log(`    [dynamic data] c ${cDyn.toFixed(4)} against the joint's own `
    + `${(1 / K).toFixed(4)} -- the damper C = ${(2 * Math.sqrt(K * mp.inertiaAboutPivot / 2)).toFixed(1)} `
    + `dwarfs K = ${K} at any wind-up rate`);
  check('a moving trace does NOT identify the compliance (the damper carries the torque)',
    Math.abs(cDyn / (1 / K) - 1) > 0.5,
    `${cDyn.toFixed(4)} vs ${(1 / K).toFixed(4)}`);
}

console.log(failed ? `\n${failed} compliance check(s) failed\n` : '\ncompliance: all checks passed\n');
process.exit(failed ? 1 : 0);
