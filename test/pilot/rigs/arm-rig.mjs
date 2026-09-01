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
import { roundedRect, circle, sharpRect, ToolPath, SEG } from '../../../lib/flexisim/toolpath.js';
import { ContourScore, decompose } from '../../../lib/flexisim/contour.js';
import { Pilot } from '../../../lib/pilot/pilot.js';

const H = 4, CLAMP = 3, NU = 0.3, RHO = 1, G = 2e-6, RATIO = 100, DAMPING = 3e-3;
// THE ARM'S COMPLIANCE, SWEEPABLE — link modulus E and gearbox stiffness K.
//
// The FlexiSim page runs these as two sliders and the defaults here are the STIFF end of both
// ladders (K 16 / E 0.15). Softening them is how a specific hypothesis gets tested: that a sharp
// corner spring-loads the arm and launches it, that the excitation scribble never does this
// because it is not built to excite the arm's own frequencies, and therefore that a SOFTER arm
// should degrade on every path but degrade RELATIVELY MORE on the corners. That is a differential
// prediction, which is worth far more than an absolute one — a softer arm being worse everywhere
// proves nothing on its own.
const ARM_E = +(process.env.ARM_E || 0.15);
const ARM_K = +(process.env.ARM_K || 16);
// AND THE BACKLASH, THE ONE PARAMETER HELD FIXED WHILE EVERYTHING ELSE MOVED.
//
// The sharp square's residual is pinned near 1.2-1.4e-1 across an 8x change in compliance — it
// grows 1.18x where every other program grows 3.3x to 13.2x. A floor that ignores stiffness is
// set by something that does not scale with stiffness, and backlash is the candidate: a fixed
// 1e-4 rad of lost motion, and a sharp corner is exactly where the machine reverses and has to
// cross it.
const ARM_BL = process.env.ARM_BL === undefined ? 1e-4 : +process.env.ARM_BL;
const PG = { LEN1: 14, LEN2: 10, E: ARM_E, K: ARM_K, BL: ARM_BL, centre: [12, 0], drive: 32 };

async function makeArm() {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E: PG.E,
    nu: NU, rho: RHO, damping: DAMPING });
  const l1 = await mk(PG.LEN1), l2 = await mk(PG.LEN2);
  const j = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: PG.K, backlash: ARM_BL,
    damping: 2 * Math.sqrt(PG.K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: j(massProperties(l1)), link1: l1,
    joint2: j(massProperties(l2)), link2: l2, gravityWorld: [0, -G, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: PG.drive * hold, speedMax: 0.2 });
  return { arm, servo };
}

/**
 * THE PATHS, AND A SHARP SQUARE IS A DIFFERENT QUESTION FROM A ROUNDED ONE.
 *
 * `circle` has curvature everywhere and none of it changes: the feedrate profile settles to one
 * speed and stays there, so it asks the controller about steady tracking. `roundedRect` has four
 * arcs joining four straights — curvature steps, and the feed dips at each. `sharpRect` has
 * corners with no arc at all, where the corner rule takes the junction velocity to nearly zero and
 * the machine must stop and restart. That is the case where compliance shows: a reversal unloads
 * the gearbox wind-up through the backlash, and it is the one a model fitted on smooth motion is
 * least likely to have seen.
 *
 * @param {string} shape 'circle', 'rounded' or 'sharp'
 * @param {number} feed the commanded feedrate
 */
function mkPath(shape, feed) {
  const o = { feed, accel: 4e-5, cornerDt: 40, centre: PG.centre };
  if (shape === 'circle') return circle({ ...o, r: 4 });
  if (shape === 'sharp') return sharpRect({ ...o, w: 8, h: 8, closed: true });
  // A DIAMOND: the same square rotated 45 degrees. Same four sharp corners and the same stop-and-
  // restart the corner rule forces at each, on a path that shares no straight with the square and
  // sweeps a different part of the workspace. That is what makes it fair to put in an EXCITATION:
  // it teaches the MOVE PROFILE without showing the machine the test geometry.
  if (shape === 'diamond') {
    const [cx, cy] = PG.centre, r = 4;
    return new ToolPath({ start: [cx + r, cy], feed: o.feed, accel: o.accel, closed: true,
      cornerDt: o.cornerDt,
      segments: [[SEG.LINE, [cx, cy + r]], [SEG.LINE, [cx - r, cy]], [SEG.LINE, [cx, cy - r]]] });
  }
  return roundedRect({ ...o, w: 8, h: 8, r: 1.5, closed: true });
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
async function deployOn(pilot, shape, active, feed = 0.004) {
  const { arm: a2, servo: s2 } = await makeArm();
  const path = mkPath(shape, feed);
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
  const split = { corner: { c2: 0, l2: 0, n: 0 }, straight: { c2: 0, l2: 0, n: 0 } };
  // FOUR EQUAL SIDES ON THE SQUARE AND THE DIAMOND; anything else gets no profile rather than a
  // meaningless one, since "position within a side" needs sides of equal length to mean anything.
  const sideLen = (shape === 'sharp' || shape === 'diamond') ? path.length / 4 : 0;
  const prof = Array.from({ length: 10 }, () => ({ c2: 0, l2: 0, n: 0, u2: 0 }));
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
      // WHERE THE ERROR ACTUALLY IS, which six hypotheses have been aimed at without measuring.
      //
      // Every account of the sharp square so far — a model that never saw a stop, a QP that
      // cannot re-solve fast enough, a clipped correction, a spring-loaded arm, backlash — assumes
      // the residual lives AT THE CORNERS. Nothing has checked. The commanded speed says which
      // part of the path a step is on: the corner rule takes the junction velocity toward zero, so
      // a step running well under the programmed feed is in a corner and one at feed is on a
      // straight. If the residual is spread along the straights, every one of those six was aimed
      // at the wrong place.
      const v = Math.hypot(cmd.vx || 0, cmd.vy || 0);
      const slow = v < 0.5 * path.feed;
      const b = slow ? split.corner : split.straight;
      b.c2 += dec.contour * dec.contour; b.l2 += dec.lag * dec.lag; b.n++;
      // THE PROFILE ALONG A SIDE, which discriminates two accounts of why the straights are worse
      // than the corners. `decompose` returns `s`, the arc length, so the position WITHIN a side
      // is free once the side length is known.
      //
      //   OVERSHOOT-AND-RECOVER predicts a monotone DECAY from the corner: the tool overshoots the
      //   vertex, then spends the side coming back onto the line before overshooting the next one.
      //   ACCELERATION RAMPS predict a U: the corner rule decelerates into the vertex and
      //   accelerates out of it, so the error is high at BOTH ends of a side and low in the middle.
      //
      // The two are opposite shapes, so ten buckets settle it without any further apparatus.
      if (sideLen > 0) {
        const f = ((dec.s % sideLen) + sideLen) % sideLen / sideLen;
        const bi = Math.min(9, Math.max(0, Math.floor(f * 10)));
        prof[bi].c2 += dec.contour * dec.contour;
        prof[bi].l2 += dec.lag * dec.lag; prof[bi].n++;
        // AND WHERE THE CORRECTION ITSELF SITS. To make a corner on a compliant arm the flex has
        // to be LOADED before the vertex and released through it — the controller must schedule
        // the deflection ahead of time, because a reactive correction can only respond to an
        // overshoot that has already happened. The two are distinguishable by phase: a scheduling
        // controller's |u| peaks BEFORE the corner, a reacting one's peaks at or after it.
        prof[bi].u2 += u[0] * u[0] + u[1] * u[1];
      }
    }
  }
  await a2.l1.destroy(); await a2.l2.destroy();
  const rms = (b, k) => (b.n ? Math.sqrt(b[k] / b.n) : 0);
  return { r: score.report(), uPk,
    split: {
      cornerC: rms(split.corner, 'c2'), cornerL: rms(split.corner, 'l2'), cornerN: split.corner.n,
      straightC: rms(split.straight, 'c2'), straightL: rms(split.straight, 'l2'),
      straightN: split.straight.n,
    },
    prof: sideLen ? prof.map((b) => ({ c: b.n ? Math.sqrt(b.c2 / b.n) : 0,
      l: b.n ? Math.sqrt(b.l2 / b.n) : 0, u: b.n ? Math.sqrt(b.u2 / b.n) : 0, n: b.n })) : null,
    // THE PREVIEW THE CONTROLLER ACTUALLY HAS, in the same units as the path: how many solver
    // steps ahead its horizon reaches, against how long a side lasts. A controller whose horizon
    // does not reach the next corner cannot schedule for it whatever its model knows.
    reach: pilot.N * pilot.grid * pilot.sample, sideSteps: sideLen ? Math.round(path.lap / 4) : 0 };
}

/**
 * ONE COMMISSIONING ON THIS ARM, START TO 'done'. Every knob an experiment has wanted so far is a
 * parameter with the shipped default, so a harness names what it changed and inherits the rest —
 * a copy of this loop with one line different is indistinguishable from a copy with one line
 * WRONG, and this rig exists because that has happened twice.
 *
 * @param {object} o
 * @param {number} o.seed         the commissioning draw
 * @param {{shape:string,feed:number}} o.train  the program the gate is handed as representative
 * @param {number} o.uCap         the correction cap in rad
 * @param {boolean} o.dwell       time-warp the excitation so it lingers
 * @param {number} o.dpt          decision steps per settling time
 * @param {Array|false} o.chirp   a forced sweep band [pLo, pHi] in solver steps, or false
 * @param {function} o.before     called with the pilot before the loop starts
 * @returns {Promise<object|null>} the commissioned pilot, or null if it never terminated
 */
async function commissionArm({ seed = 1, train = { shape: 'rounded', feed: 0.004 }, uCap = 0.15,
  dwell = false, dpt = 30, chirp = false, before = null,
  limits = { vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 }, box = 0.55, sampleFixed = null,
  events = null } = {}) {
  const LIM = limits, BOX = box;
  const TRAIN = train, UCAP = uCap, DWELL = dwell, DPT = dpt, CHIRP = chirp;
  const { arm, servo } = await makeArm();
  const startPath = mkPath(TRAIN.shape, TRAIN.feed);
  homeArm(arm, servo, startPath);
  const centre = arm.ik(12, 0, true);
  const pilot = new Pilot({
    autoRefuse: true, nMeasured: 6,
    // THE BOX THE EXCITATION MUST TRAVERSE, WHICH IS WHAT SETS ITS BANDWIDTH.
    //
    // Measured directly on `buildExcitation`: at this box and these limits the tune settles at a
    // correlation time of 662 solver steps with velocity, acceleration and jerk at 73 / 58 / 55%
    // — VELOCITY binds, because the builder must traverse the box and a shorter correlation time
    // means steeper slopes. Loosening acceleration and jerk alone leaves tc at 662 and the built
    // series byte-identical, which is why raising them measured exactly nothing. Shrinking the
    // box is the knob that actually moves it: ±0.05 with loose a/j reaches the tc floor of 60.
    channels: [0, 1].map((j) => ({ lo: centre[j] - BOX, hi: centre[j] + BOX,
      // THE LIMITS THE EXCITATION IS HELD TO, AND THEY ARE NOT THE MACHINE'S.
      //
      // Measured with `peakDiffs` on the joint commands each program actually issues: the circle
      // uses 63% of vMax, 16% of aMax and 1% of jMax; the rounded rectangle 289–364% of jMax;
      // and the SHARP SQUARE 3132–3893% of aMax and 61537–75419% of jMax. Three orders of
      // magnitude. An excitation built to respect these numbers cannot visit the regime the
      // square runs in, whatever band it sweeps or how long it runs — which is why the frequency
      // sweep, the dwell, the clock, the cap and the plan commitment were all null on it.
      ...LIM })),
    uMax: UCAP,
    ...(sampleFixed ? { sampleFixed } : {}),
    // SPARSE CORNER EVENTS IN THE EXCITATION — see `cornerEvents` in excite.js. The one route
    // left standing after twelve nulls: the record must carry the program's own acceleration
    // and jerk, and only rare brief reversals can do that inside the velocity limit.
    ...(events ? { events } : {}),
    start: arm.ik(startPath.at(0).x, startPath.at(0).y, true),
    guards: [{ index: 4, max: 6 }, { index: 5, max: 6 }],
    workspace: (q) => {
      const r = Math.hypot(arm.L1 * Math.cos(q[0]) + arm.L2 * Math.cos(q[0] + q[1]),
        arm.L1 * Math.sin(q[0]) + arm.L2 * Math.sin(q[0] + q[1]));
      return r > Math.abs(arm.L1 - arm.L2) + 0.5 && r < arm.L1 + arm.L2 - 0.5;
    },
    seed,
    // THE FREQUENCY SWEEP, FORCED INTO A NAMED BAND — the excitation-design half of the account.
    //
    // `test/pilot/spectrum.mjs` measured where the three signals put their energy, in periods of
    // solver steps, and the answer is not ambiguous: the sharp square's open-loop CONTOUR ERROR
    // puts 72% of its energy in periods 512–2048, and the shipped excitation puts 0.7% there.
    // The circle's error sits at 8192–16384, which is exactly where the excitation's own peak is,
    // and the circle scores 7.72x against the square's 1.69x. Coverage: 91% against 25%.
    //
    // A fit cannot identify a transfer at a frequency its INPUT never visited, however rich the
    // output was — and the output was rich there (the RESPONSE row is 71% in 512–2048), which is
    // the trap: the truth looks well-explained because the model can attribute that motion to
    // whatever slow regressor happens to correlate with it over one record.
    //
    // The sweep already exists and is GATED on the probe finding a ring. This arm reports
    // rings [0,0] and the spectrum agrees — 98% of its free step response is the step itself,
    // there is no resonance — so the gate is correct and the sweep never arms. The question this
    // knob asks is whether a sweep is worth arming on a plant that does NOT ring, purely to cover
    // a band the noise cannot reach at an affordable jerk.
    forceChirp: CHIRP,
    // A DWELLING EXCITATION, WHICH PUTS STOPS INTO THE NOISE RATHER THAN STRUCTURE AFTER IT.
    //
    // This is the surviving half of the diamond experiment. What the model is missing on a sharp
    // corner is a STOP — the corner rule takes junction velocity to nearly zero four times a lap
    // and each reversal unloads the gearbox wind-up through the backlash — and the excitation is
    // filtered noise that never stops. `dwell` time-warps that noise so it lingers, keeping the
    // record RICH where appending a diamond made 19% of it collinear and took the gate below one.
    //
    // WORTH KNOWING BEFORE READING THE RESULT: the warp has a 2% RATE FLOOR, and its own comment
    // calls it "a dwell, not a stop". If a true zero-velocity reversal is what the model needs,
    // this flag cannot supply it and the right reading of a null result is "the floor is too
    // high", not "stops do not help".
    dwell: DWELL,
    // THE DECISION CLOCK, WHICH IS THE HORIZON HALF OF THE QUESTION.
    //
    // Two attempts to fix the sharp square by giving the MODEL more coverage have failed, and the
    // lag column says the residual is timing rather than shape: the correction removes 1.55x of
    // contour and 1.20x of lag. `decisionsPerTs` is how often the QP re-solves within a settling
    // time — a pure timing knob that changes nothing about what the model knows.
    //
    // CLAUDE.md already records it moving exactly this case: 30 → 60 is worth 4.62 → 5.19x sharp,
    // 6.43 → 8.02x rounded, 12.99 → 14.16x circle, and ONLY with the effort weight scaled as
    // (DPT/30)^2 because the QP differences DECISION steps. If the sharp square improves here, its
    // residual is a horizon failure; if it does not while the smooth programs do, it is not.
    decisionsPerTs: DPT,
    // THE DIAMOND-IN-EXCITATION EXPERIMENT RAN AND IS REMOVED WITH ITS HOOK. Appending a diamond
    // at both feeds to the end of the scribble — the same corner profile on a path nothing is
    // scored on — took all three verify regimes below one (scribble 0.23x, program 0.40x,
    // representative 0.88x) and the gate refused. 9,281 structured rows on a 47,837-row record is
    // 19% collinear data, and this project already measured that mechanism from the other side:
    // identifying on a program instead of a scribble takes EMPS from 12.70x to 3.93x. The idea is
    // sound and the implementation was not; `dwell` is the one to try, because it puts stops INTO
    // the noise instead of appending structure to it.
    // THE REPRESENTATIVE PROGRAM IS THE ONE IT TRAINS ON, which is the honest setup: an engineer
    // hands the gate the program they have. Every row below is a program that gate never saw.
    verifyRef: (i) => {
      const c = startPath.at(i % Math.max(1, Math.round(startPath.lap)));
      return arm.ik(c.x, c.y, true);
    },
  });
  if (before) before(pilot);
  let n = 0;
  while (pilot.phase !== 'done') {
    if (++n > 6e6) { console.log(`  draw ${seed}: ABANDONED in '${pilot.phase}'`); return null; }
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    const refs = cmd.map((c) => ({ theta: c.pos + c.u, omega: c.vel, alpha: c.acc }));
    const tau = servo.torques(refs);
    arm.step(tau[0], tau[1], 1);
    const r = routeSignals(arm, cmd, tau);
    pilot.observe(r.measured, r.truth);
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return pilot;
}

export { PG, RATIO, makeArm, mkPath, homeArm, routeSignals, deployOn, commissionArm };

