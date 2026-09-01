/**
 * @file THE RIVAL, REDEFINED BY THE OWNER: a learned controller with NO model against a
 * REASONABLY ENGINEERED model-based controller with a Kalman estimator — both TRUTH-FREE at
 * deploy, which is the like-for-like ILC could never give (an ILC needs the error every lap).
 *
 * EACH SIDE GETS ITS OWN KIND OF PRIOR, and only that:
 *   ENGINEERED — what an engineer legitimately has: CAD geometry (L1, L2, inertias), the
 *     rigid-dynamics model (the servo's own computed torque), datasheet gearbox constants
 *     (K, C, N, Jm). A per-joint Kalman filter estimates the gearbox wind-up [δ, δ̇] from
 *     the ONLY sensors on the machine — encoder and commanded torque — via the motor-side
 *     torque balance z = N·τcmd − N²·Jm·q̈enc = K·δ + C·δ̇, with the rigid model's load
 *     torque driving the process. Correction: motor ref += δ̂ (+ an optional lead), which
 *     re-places the LOAD at the reference. No tracker at deploy.
 *     AND, since the learned side's installation includes a TEMPORARY tracker for its
 *     guided phase, the engineer legitimately gets one for commissioning too: a RobotComp
 *     static compliance identified at four HELD poses (reading the true wind-up while
 *     held, exactly `reconcile.test.mjs`'s conventional machine), applied as a per-joint
 *     feedforward at the command. Rows below split the two: static-only, KF-only, both.
 *   LEARNED — the frozen composition: commissioned from noise with a TEMPORARY tracker
 *     (its stated installation), corner banks from random polygons and stars at the
 *     record lambda scale, then frozen. No model, no geometry, no tracker at deploy —
 *     and no guided phase either (measured harmful once the banks are real; see below).
 *
 * The bench's own instrument (the tool, for SCORING only) touches neither controller.
 *
 * Run: node test/pilot/kalmanrival.mjs [SHAPES=sharp,circle,rounded] [FEED=0.004]
 */
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';
import { RobotComp } from '../../lib/ngrc/robotcomp.js';
import { PG, makeArm, mkPath, homeArm, deployOn, commissionArm, recordOpenLoop,
  randomPolygon, fitCornerBanks } from './rigs/arm-rig.mjs';

const SHAPES = (process.env.SHAPES || 'sharp,circle,rounded').split(',');
const FEED = +(process.env.FEED || 0.004);
const LEAD = +(process.env.LEAD || 0);        // engineer's lead on δ̂, in steps of δ̇̂

function settleAt(arm, servo, a, b, n = 4000) {
  arm.setPose(a, b);
  const refs = [{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }];
  for (let i = 0; i < n; i++) { const t = servo.torques(refs); arm.step(t[0], t[1], 1); }
}

/**
 * THE ENGINEER'S HELD-POSE COMPLIANCE, the reconcile file's conventional-machine recipe on
 * this rig's workspace: settle at four tool points, read the true wind-up while HELD (that
 * reading is what the temporary commissioning tracker buys — the same tracker the learned
 * side's installation already grants itself), regress dq-per-torque, apply at the command.
 */
function commissionComp(arm, servo) {
  const rc = new RobotComp(2, 2, 1e6);
  for (const [px, py] of [[12, 0], [14, 2], [10, -2], [13, -3]]) {
    const [a, b] = arm.ik(px, py, true);
    settleAt(arm, servo, a, b);
    const refs = [{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }];
    rc.calibrate([[1, 0], [0, 1]], servo.jointTorques(refs),
      [arm.j1.windup(), arm.j2.windup()], 1.0);
  }
  return rc;
}

/** One program run under the engineered controller: KF wind-up loop, held-pose static
 * compliance, or both summed. */
async function runKF(shape, { lead = 0, useKF = true, useRC = false } = {}) {
  const { arm, servo } = await makeArm();
  const rc = useRC ? commissionComp(arm, servo) : null;
  const path = mkPath(shape, FEED);
  homeArm(arm, servo, path);
  const joints = [arm.j1, arm.j2];
  // The engineer's constants, straight off the datasheet/CAD (the sim's own params — a
  // REASONABLE engineer knows their machine; what they lack is the unmodelled reality:
  // backlash dead zone, stiffening, stiction, link elasticity).
  const KJ = joints.map((j) => j.K0), CJ = joints.map((j) => j.C);
  const NJ = joints.map((j) => j.N), JmJ = joints.map((j) => j.Jm), JlJ = joints.map((j) => j.Jl);
  // KF state per joint: x = [δ, δ̇]; P covariance; Q/R the engineer's tuning.
  const x = [[0, 0], [0, 0]];
  const Pm = [[[1e-6, 0], [0, 1e-8]], [[1e-6, 0], [0, 1e-8]]];
  const Qn = [1e-14, 1e-10];
  // TUNED THE WAY AN ENGINEER TUNES, each number from a measurement on the machine:
  //  - R is the MEASURED noise of the motor-side torque-balance channel, which came out 48x
  //    and 93x its own signal (one-step encoder differencing through N³Jm) — so the filter
  //    correctly leans on the rigid-model process, and the "Kalman" earns its keep as the
  //    principled statement of HOW MUCH the sensor can add (almost nothing);
  //  - the process inertia is M(q)'s diagonal (coupling through the estimates was tried and
  //    measured worse: shoulder 3.52e-3 → 4.51e-3);
  //  - the correction is LOW-PASSED: the estimate's DC is right (bias ~2e-5 against a 2e-3
  //    signal) and its AC is model mismatch — link elasticity and backlash the gearbox model
  //    cannot see — so the slow part is truth and the fast part is noise to the command.
  const RN2 = [3.2, 0.29];
  const LP = 1 / 300;
  const uf = [0, 0];
  const total = Math.ceil(path.lap * 3), scoreFrom = Math.ceil(path.lap * 2);
  const score = new ContourScore({ joints: 2, reversalTravel: 2e-2 });
  let prevSpeed = [0, 0], uPk = 0;
  const u = [0, 0];
  for (let k = 0; k < total; k++) {
    const c = path.at(k);
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    // The rigid model's load torque at the COMMAND — the engineer's own feedforward model,
    // reused as the KF's process drive and as the static compliance's operating point.
    const tl = servo.jointTorques([{ theta: q1, omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2, omega: rt.dq[1], alpha: rt.ddq[1] }]);
    let f0 = 0, f1 = 0;
    if (rc) { const ff = rc.feedforward([[1, 0], [0, 1]], tl, { enableToolff: false });
      f0 = ff.dq[0]; f1 = ff.dq[1]; }
    const refs = [{ theta: q1 + u[0] + f0, omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + u[1] + f1, omega: rt.dq[1], alpha: rt.ddq[1] }];
    const Mq = arm.massMatrix(q2);
    const tau = servo.torques(refs);
    arm.step(tau[0], tau[1], 1);
    const enc = arm.encoders();
    if (useKF) for (let j = 0; j < 2; j++) {
      const aEnc = enc[j].speed - prevSpeed[j];           // q̈_M / N, one-step difference
      prevSpeed[j] = enc[j].speed;
      // ---- predict: δ̈ = q̈_M/N − q̈_L,  q̈_L = (Kδ + Cδ̇ − τ_l) / J_l
      const [d, dd] = x[j];
      const Jl = Mq[j][j];
      const acc = aEnc - (KJ[j] * d + CJ[j] * dd - tl[j]) / Jl;
      const xp = [d + dd, dd + acc];
      const f10 = -KJ[j] / Jl, f11 = 1 - CJ[j] / Jl;
      const P0 = Pm[j];
      const Pp = [
        [P0[0][0] + P0[1][0] + P0[0][1] + P0[1][1] + Qn[0],
          P0[0][0] * f10 + P0[0][1] * f11 + P0[1][0] * f10 + P0[1][1] * f11],
        [f10 * (P0[0][0] + P0[0][1]) + f11 * (P0[1][0] + P0[1][1]),
          f10 * (P0[0][0] * f10 + P0[0][1] * f11) + f11 * (P0[1][0] * f10 + P0[1][1] * f11) + Qn[1]],
      ];
      // ---- update: z = N·τcmd − N²·Jm·q̈_M = K δ + C δ̇   (q̈_M = N · aEnc)
      const z = NJ[j] * tau[j] - NJ[j] * NJ[j] * JmJ[j] * (NJ[j] * aEnc);
      const H = [KJ[j], CJ[j]];
      const zhat = H[0] * xp[0] + H[1] * xp[1];
      const S = H[0] * (Pp[0][0] * H[0] + Pp[0][1] * H[1])
        + H[1] * (Pp[1][0] * H[0] + Pp[1][1] * H[1]) + RN2[j];
      const K0 = (Pp[0][0] * H[0] + Pp[0][1] * H[1]) / S;
      const K1 = (Pp[1][0] * H[0] + Pp[1][1] * H[1]) / S;
      const inno = z - zhat;
      x[j] = [xp[0] + K0 * inno, xp[1] + K1 * inno];
      Pm[j] = [
        [Pp[0][0] - K0 * (H[0] * Pp[0][0] + H[1] * Pp[1][0]),
          Pp[0][1] - K0 * (H[0] * Pp[0][1] + H[1] * Pp[1][1])],
        [Pp[1][0] - K1 * (H[0] * Pp[0][0] + H[1] * Pp[1][0]),
          Pp[1][1] - K1 * (H[0] * Pp[0][1] + H[1] * Pp[1][1])],
      ];
      uf[j] += LP * (x[j][0] + lead * x[j][1] - uf[j]);
      u[j] = uf[j];
    }
    uPk = Math.max(uPk, Math.abs(u[0] + f0), Math.abs(u[1] + f1));
    if (k >= scoreFrom) {
      const dec = decompose(path, arm.toolXY(), c);
      score.step(dec.contour, dec.lag, tau, [arm.j1.wM, arm.j2.wM]);
    }
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return { r: score.report(), uPk };
}


// ------------------------------------------------------------- the learned side, frozen
console.log('\nthe rival, redefined: learned-no-model vs engineered-model+Kalman, both truth-free');
console.log(`  arm E ${PG.E} / K ${PG.K}; feed ${FEED}`);
const pilot = await commissionArm({ seed: 1 });
if (!pilot || !pilot.verdict.deploy) { console.log('pilot refused'); process.exit(1); }
const rnd = (s0) => { let z = s0 >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const recs = [];
for (const [seed, feed, star] of [[81, 0.004, 0], [82, 0.008, 0], [83, 0.0055, 0],
  [85, 0.004, 1], [86, 0.008, 1], [87, 0.0055, 1]]) {
  recs.push(await recordOpenLoop(pilot, randomPolygon(rnd(seed), feed, !!star), feed));
}
// RECORD-SCALE lambda labels, and NO guided phase. Both changes are the learned side's
// measured best self (the same standard the engineered side got): under the record scale
// the corner weights win at every lead (the anchor's saturated labels had the fallback
// rejecting them, 116 kept-scribble against 0), star polygons ADD under it where they
// subtracted under the anchor (2.39x -> 2.93x against 2.02x -> 1.97x), and the diamond-
// guided RLS was measured pulling the shared weights off-geometry once the banks are real:
// -11% on the record-scale square and 3.2x on the circle. So the learned installation is
// now SIMPLER than the one it replaces - commissioning truth only, zero guided laps, zero
// truth at deploy - and stronger everywhere.
fitCornerBanks(pilot, recs, { fitScale: 'record' });
console.log('  learned side: commissioned, record-scale polygon+star banks, FROZEN (no guided phase)');

for (const shape of SHAPES) {
  const off = await (async () => {
    const saved = pilot.verdict;
    pilot.verdict = { deploy: false, why: 'off' };
    const r = await deployOn(pilot, shape, true, FEED);
    pilot.verdict = saved;
    return r;
  })();
  const kf = await runKF(shape, { lead: LEAD });
  const rcOnly = await runKF(shape, { useKF: false, useRC: true });
  const full = await runKF(shape, { lead: LEAD, useRC: true });
  const learned = await deployOn(pilot, shape, true, FEED);
  const f = (r) => `${r.r.contourRms.toExponential(3)} (${(off.r.contourRms / r.r.contourRms).toFixed(2)}x)`
    + ` lag ${r.r.lagRms.toExponential(2)} u ${r.uPk.toFixed(3)}`;
  console.log(`\n  ${shape} @${FEED}:`);
  console.log(`    open loop            ${off.r.contourRms.toExponential(3)}  lag ${off.r.lagRms.toExponential(2)}`);
  console.log(`    engineered KF only   ${f(kf)}`);
  console.log(`    engineered static    ${f(rcOnly)}`);
  console.log(`    engineered full      ${f(full)}`);
  console.log(`    learned, frozen      ${f(learned)}`);
}
