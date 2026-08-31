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
import { ContourScore, decompose } from '../../../lib/flexisim/contour.js';

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

/**
 * THE ROUTING, WHICH IS PART OF THE RIG AND NOT PART OF THE EXPERIMENT.
 *
 * What this plant hands the pilot is six signals — two encoder angles, two encoder speeds and two
 * torques, each scaled — and a truth that is the TOOL error mapped back through the inverse
 * Jacobian. None of that is obvious and all of it matters: the servo closes on the ENCODER, so the
 * encoder error is near zero while the tool droops, and a second copy of this loop that routed
 * joint angles and encoder error would hand the pilot a truth with nothing in it.
 *
 * That is not hypothetical. It is exactly what a second copy of this loop did — written from
 * memory beside the real one, it drove a commissioning that never terminated, and the diagnosis
 * was "the plant is slow" until the two loops were put side by side. Extracting the PLANT into a
 * module and leaving the ROUTING duplicated is half an extraction.
 *
 * @param {object} arm the arm being driven
 * @param {Array} cmd the pilot's command, one entry per channel
 * @param {number[]} tau the torques just applied
 * @returns {{measured: number[], truth: number[]}} exactly what `pilot.observe` takes
 */
function routeSignals(arm, cmd, tau) {
  const enc = arm.encoders();
  const tool = arm.toolXY();
  const q1 = cmd[0].pos, q2 = cmd[1].pos;
  const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
  const cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
  const J = arm.jacobian(q1, q2);
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  const ex = tool[0] - cx, ey = tool[1] - cy;
  return {
    measured: [enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
      tau[0] * 1e3, tau[1] * 1e3],
    truth: [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det],
  };
}

/**
 * SCORE A COMMISSIONED PILOT ON ONE SHAPE, correction on or off — the rig's own deploy loop.
 *
 * THE THIRD PIECE THAT HAD TO COME OUT OF THE TEST, and the one that had already gone wrong twice
 * before it moved. A second copy of this loop, written beside the original, differed in four ways
 * at once: it indexed `rt.dq1` where the rates come back as `rt.dq[0]`, ticked the sample counter
 * on `(k+1) % S` instead of `k % S`, called a `score.add` that does not exist instead of
 * `decompose` then `score.step`, and — the one no error message would ever have reported —
 * omitted `l1.destroy()` and `l2.destroy()`, leaking two lattices per deploy across twenty-eight
 * of them.
 *
 * The pattern is worth naming because it recurred three times in one afternoon: extracting a
 * plant is not extracting a rig. The knowledge that matters lives in the ROUTING and the SCORING,
 * not in the geometry, and those are exactly the parts a second copy gets wrong silently.
 *
 * @param {object} pilot a commissioned pilot
 * @param {string} shape 'rounded' or 'circle'
 * @param {boolean} active whether to apply its correction
 * @returns {Promise<{r: object, uPk: number}>} the contour report and the peak correction
 */
async function deployOn(pilot, shape, active) {
  const { arm: a2, servo: s2 } = await makeArm();
  const path = mkPath(shape, 0.004);
  homeArm(a2, s2, path);
  const S = pilot.sample, cache = new Map();
  const refAt = (i) => {
    let r = cache.get(i);
    if (!r) { const c = path.at(i * S); r = a2.ik(c.x, c.y, true); cache.set(i, r); }
    return r;
  };
  pilot._initRun();
  const total = Math.ceil(path.lap * 3), scoreFrom = Math.ceil(path.lap * 2);
  const score = new ContourScore({ joints: 2, reversalTravel: 2e-2 });
  let kSamp = 0, uPk = 0;
  for (let k = 0; k < total; k++) {
    const cmd = path.at(k);
    const [q1, q2] = a2.ik(cmd.x, cmd.y, true);
    const rt = a2.ikRates(q1, q2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
    const u = active ? pilot.act((off) => refAt(kSamp + off)) : [0, 0];
    uPk = Math.max(uPk, Math.abs(u[0]), Math.abs(u[1]));
    const tau = s2.torques([{ theta: q1 + u[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + u[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    a2.step(tau[0], tau[1], 1);
    if (k % S === 0) kSamp++;
    const enc = a2.encoders();
    pilot.observe([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
      tau[0] * 1e3, tau[1] * 1e3], null);
    if (k >= scoreFrom) {
      const dec = decompose(path, a2.toolXY(), cmd);
      score.step(dec.contour, dec.lag, tau, [a2.j1.wM, a2.j2.wM]);
    }
  }
  await a2.l1.destroy(); await a2.l2.destroy();
  return { r: score.report(), uPk };
}

export { PG, RATIO, makeArm, mkPath, homeArm, routeSignals, deployOn };
