/**
 * @file THE 2R ARM RIG, IN ITS OWN MODULE SO A SECOND FILE CAN DRIVE THE SAME ONE.
 *
 * Extracted from `arm.test.mjs` verbatim — same geometry, same joints, same servo, same paths —
 * because the ensemble work needs to commission this plant k times IN ONE PROCESS, and the only
 * alternative was a second copy of the arm. Two copies of a plant drift apart; this project has
 * paid for that already, and `tanks-rig.mjs` exists for exactly this reason.
 *
 * WHY THE ARM AND NOT THE TANK. Averaging the commissioning draws measures 1.344x on the tank,
 * from eight draws that all refused. The prediction that would KILL it is that the advantage
 * disappears on a program the draws did not share — in which case it is a memory by a new route,
 * and the retirement rules that out. The tank has one program. The arm has two, a rounded
 * rectangle and a circle, so one can be held out.
 */
import { Joint } from '../../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../../lib/flexisim/link.js';
import { ChainServo } from '../../../lib/flexisim/compensator.js';
import { roundedRect, circle } from '../../../lib/flexisim/toolpath.js';

const H = 4, CLAMP = 3, NU = 0.3, RHO = 1, G = 2e-6, RATIO = 100, DAMPING = 3e-3;
const PG = { LEN1: 14, LEN2: 10, E: 0.15, centre: [12, 0], drive: 32 };

async function makeArm() {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E: PG.E,
    nu: NU, rho: RHO, damping: DAMPING });
  const l1 = await mk(PG.LEN1), l2 = await mk(PG.LEN2);
  const j = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: 16, backlash: 1e-4,
    damping: 2 * Math.sqrt(16 * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: j(massProperties(l1)), link1: l1,
    joint2: j(massProperties(l2)), link2: l2, gravityWorld: [0, -G, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: PG.drive * hold, speedMax: 0.2 });
  return { arm, servo };
}

function mkPath(shape, feed) {
  const o = { feed, accel: 4e-5, cornerDt: 40, centre: PG.centre };
  return shape === 'circle' ? circle({ ...o, r: 4 }) : roundedRect({ ...o, w: 8, h: 8, r: 1.5, closed: true });
}

function homeArm(arm, servo, path) {
  const c0 = path.at(0);
  const [q1, q2] = arm.ik(c0.x, c0.y, true);
  arm.setPose(q1, q2);
  const refs = [{ theta: q1, omega: 0, alpha: 0 }, { theta: q2, omega: 0, alpha: 0 }];
  for (let i = 0; i < 4000; i++) { const t = servo.torques(refs); arm.step(t[0], t[1], 1); }
  servo.resetLimitStats();
}

export { PG, RATIO, makeArm, mkPath, homeArm };
