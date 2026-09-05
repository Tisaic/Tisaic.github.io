/**
 * @file THE ARM ADAPTER for the plant-agnostic compiled twin (`lib/pilot/twin.js`).
 *
 * The agnostic core (identify / compile / apply) knows no plants; what it needs from a
 * plant class is a SIMULATOR and a RESPONSE, and this file is that declaration for the
 * 2R compliant arm — the structure template the engineer brings (plan §42: "learn the
 * parameters that have no closed form; compute the ones that do"). Everything here is
 * arm-specific on purpose: the drive loop, the J⁻¹ truth routing, the pre-roll
 * semantics, the step-response probe. A different plant class writes a different
 * adapter; the core does not change.
 *
 * ONE drive loop serves the record, the identification replays, and the compile sims —
 * a second copy of a drive loop is the defect class the pilot rigs exist to prevent.
 */

/**
 * THE FULLY LEARNED CHAIN as a routing object: references from the learned inverse map,
 * truth through the learned affine observer — G(fwd(cmd)) · (tool − fwd(cmd)), the
 * pilot's own ⑥ routing — so nothing analytic touches the twin's drive, record, replay
 * or probe. `maps` is `buildMaps`'s shape: { predict(x,y)→q, fwd(q)→[x,y],
 * gradAt(x,y)→2x2 }. Passed as `chain` to drivePath / twinResponse / armSimulators;
 * omitted, they run the analytic chain exactly as before.
 */
export function learnedChain(maps, path) {
  const refAt = (k) => {
    const c = path.at(k);
    return maps.predict(c.x, c.y);
  };
  return {
    refsFor(k) {
      const q = refAt(k), qm = refAt(Math.max(0, k - 1)), qp = refAt(k + 1);
      return [0, 1].map((j) => ({ theta: q[j], omega: (qp[j] - qm[j]) / 2,
        alpha: qp[j] - 2 * q[j] + qm[j] }));
    },
    startRefs() { return refAt(0); },
    route(arm, q) {
      const t0 = maps.fwd(q);
      const G = maps.gradAt(t0[0], t0[1]);
      const tool = arm.toolXY();
      const dx = tool[0] - t0[0], dy = tool[1] - t0[1];
      return [G[0][0] * dx + G[0][1] * dy, G[1][0] * dx + G[1][1] * dy];
    },
  };
}

/** The tool-space projection for `refineOperator` — per-phase Jacobian at the
 * program's own commanded poses, precomputed once. The refine's residual is joint-space
 * (routeTruth); the machine is SCORED on the tool, and the two are a lap-varying 2x2
 * apart. Measured on the sharp square at the canonical cell: minimizing joint rms
 * delivered 47.7x with the twin transferring exactly; minimizing THROUGH this
 * projection took the identical machinery to 53.6x (plan §43). */
export async function toolProjection({ buildArm, destroyArm, path, res = 2048 }) {
  const m = await buildArm();
  const PB = [];
  try {
    for (let p = 0; p < res; p++) {
      const k = Math.round((p / res) * path.lap) % Math.ceil(path.lap);
      const c = path.at(k);
      const [q1, q2] = m.arm.ik(c.x, c.y, true);
      PB.push(m.arm.jacobian(q1, q2).map((row) => row.slice()));
    }
  } finally {
    await destroyArm(m);
  }
  return (ph, e) => {
    const J = PB[Math.floor(ph * res) % res];
    return [J[0][0] * e[0] + J[0][1] * e[1], J[1][0] * e[0] + J[1][1] * e[1]];
  };
}

/** J⁻¹(cmd)·(tool − fk(cmd)) — the rigs' truth routing, at the COMMANDED pose. */
export function routeTruth(arm, q1, q2) {
  const tool = arm.toolXY();
  const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
  const cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
  const J = arm.jacobian(q1, q2);
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  const ex = tool[0] - cx, ey = tool[1] - cy;
  return [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det];
}

/**
 * Drive an arm over a path from its current state, optionally with a correction table,
 * recording the routed truth per sample. A pre-roll holds the start pose while the
 * correction ramps in — lap 1 is a causality problem (§42: the flex must be loaded
 * before t=0) and the dwell is where the loading happens.
 *
 * @param {object} o
 *   arm, servo   the machine (caller owns construction and destruction)
 *   path         .at(k) / .lap
 *   sample       record cadence in steps
 *   steps        plant steps to run past the pre-roll
 *   du, preRoll  correction over samples of [preRoll + trajectory], or null
 *   yield_       optional async fn awaited every yieldEvery steps (UI liveness)
 * @returns {Promise<{e: number[][], perLap: number[][]}>}
 */
export async function drivePath({ arm, servo, path, sample, steps, du = null, preRoll = 0,
  chain = null, yield_ = null, yieldEvery = 4000, observe = null }) {
  const e = [], perLap = [];
  let acc = [0, 0], n = 0, lapNo = 0;
  const total = steps + preRoll * sample;
  for (let kk = 0; kk < total; kk++) {
    const inPre = kk < preRoll * sample;
    const k = inPre ? 0 : kk - preRoll * sample;
    let q1, q2, om0 = 0, om1 = 0, al0 = 0, al1 = 0, pt = null;
    if (chain) {
      const refs = inPre
        ? chain.startRefs().map((t) => ({ theta: t, omega: 0, alpha: 0 }))
        : chain.refsFor(k);
      q1 = refs[0].theta; q2 = refs[1].theta;
      if (!inPre) { om0 = refs[0].omega; om1 = refs[1].omega; al0 = refs[0].alpha; al1 = refs[1].alpha; }
    } else {
      pt = path.at(k);
      const c = pt;
      [q1, q2] = arm.ik(c.x, c.y, true);
      if (!inPre) {
        const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
        om0 = rt.dq[0]; om1 = rt.dq[1]; al0 = rt.ddq[0]; al1 = rt.ddq[1];
      }
    }
    let d0 = 0, d1 = 0;
    if (typeof du === 'function') {
      // an `applyCompiled` accessor — the FORM THE HOSTS ACTUALLY RUN, so a test that
      // drives through it exercises the tail tiling the raw-array path never reaches
      const d = du(kk);
      d0 = d[0]; d1 = d[1];
    } else if (du) {
      const s = kk / sample;
      const s0 = Math.min(du.length - 2, Math.floor(s)), fr = s - s0;
      d0 = du[s0][0] + fr * (du[s0 + 1][0] - du[s0][0]);
      d1 = du[s0][1] + fr * (du[s0 + 1][1] - du[s0][1]);
    }
    const tau = servo.torques([
      { theta: q1 + d0, omega: om0, alpha: al0 },
      { theta: q2 + d1, omega: om1, alpha: al1 }]);
    arm.step(tau[0], tau[1], 1);
    if (kk % sample === 0) {
      e.push(chain ? chain.route(arm, [q1, q2]) : routeTruth(arm, q1, q2));
      if (!inPre) {
        const t = e[e.length - 1];
        // AN OBSERVER, SO THE TWIN CAN BE SCORED ON THE OBJECTIVE THE PILOT IS SCORED ON.
        //
        // This loop reports JOINT rms and nothing else, so mode 10 has never been placed on the
        // CONTOUR denominator that every pilot number in this project uses — the two have only
        // ever been compared through prose. Scoring it needed either this hook or a second copy
        // of this drive loop in a harness, and three separate copies of this arm's routing have
        // each shipped a defect (rule 61), so the hook is the cheaper mistake.
        //
        // It is handed the sample index, the COMMANDED pose, the routed truth and the applied
        // torque — everything `decompose` and `ContourScore` need — so the caller scores through
        // the shared metric rather than reimplementing an rms beside it.
        //
        // Omitted, nothing is called and every recorded number is untouched.
        // `pt` IS THE COMMANDED PATH POINT, and it is what `decompose` needs — not the joint
        // pose. `decompose` reads `cmd.s`, the commanded ARC LENGTH, so handing it joints gives
        // a plausible contour and a NaN lag: the wrong picture with no error, which is the
        // commonest defect class in this repository. Passing the point the loop already
        // computed removes the choice from the caller (rule 61).
        if (observe) observe({ k, cmd: [q1, q2], pt, truth: t, tau });
        acc[0] += t[0] * t[0]; acc[1] += t[1] * t[1]; n++;
        const now = Math.floor(k / path.lap);
        if (now !== lapNo) {
          perLap.push([Math.sqrt(acc[0] / n), Math.sqrt(acc[1] / n)]);
          acc = [0, 0]; n = 0; lapNo = now;
        }
      }
    }
    if (yield_ && kk % yieldEvery === 0) await yield_();
  }
  if (n > 10) perLap.push([Math.sqrt(acc[0] / n), Math.sqrt(acc[1] / n)]);
  return { e, perLap };
}

/**
 * The arm's 2x2 truth response to a ref step at the path's start pose, at sample
 * cadence — the H the agnostic compile inverts. One measurement serves every compile
 * at these parameters.
 */
export async function twinResponse({ buildArm, destroyArm, path, sample, chain = null,
  settleSteps = 30000, respSteps = 12000, stepSize = 2e-3, yield_ = null }) {
  const H = [];
  for (const ch of [0, 1]) {
    const m = await buildArm();
    let q0;
    if (chain) q0 = chain.startRefs();
    else {
      const c0 = path.at(0);
      q0 = m.arm.ik(c0.x, c0.y, true);
    }
    const routed = () => (chain ? chain.route(m.arm, q0) : routeTruth(m.arm, q0[0], q0[1]));
    for (let k = 0; k < settleSteps; k++) {
      const tau = m.servo.torques([{ theta: q0[0], omega: 0, alpha: 0 }, { theta: q0[1], omega: 0, alpha: 0 }]);
      m.arm.step(tau[0], tau[1], 1);
      if (yield_ && k % 4000 === 0) await yield_();
    }
    const base = routed();
    const resp = [];
    for (let k = 0; k < respSteps; k++) {
      const refs = [{ theta: q0[0] + (ch === 0 ? stepSize : 0), omega: 0, alpha: 0 },
        { theta: q0[1] + (ch === 1 ? stepSize : 0), omega: 0, alpha: 0 }];
      const tau = m.servo.torques(refs);
      m.arm.step(tau[0], tau[1], 1);
      if (k % sample === 0) {
        const t = routed();
        resp.push([(t[0] - base[0]) / stepSize, (t[1] - base[1]) / stepSize]);
      }
      if (yield_ && k % 4000 === 0) await yield_();
    }
    await destroyArm(m);
    H.push(resp);
  }
  return H;
}

/**
 * The simulator closures the agnostic core consumes, for this plant class.
 *
 * @param {object} o
 *   buildArm    async (params|undefined) => { arm, servo } — at candidate params for
 *               identification, at the FITTED params for compiling; the app supplies
 *               its own constructor so nothing here reads or hardcodes its settings
 *   destroyArm  async ({arm, servo}) — lattice links must be destroyed
 *   home        async ({arm, servo}, path) — put the machine at the path start, settled.
 *               With a `chain`, the start is the LEARNED start pose (chain.startRefs()),
 *               and the caller's home must settle there, not at the analytic ik
 *   chain       optional learnedChain(maps, path) — the fully learned routing; omitted,
 *               the analytic chain runs exactly as before
 *   sample
 * @returns {{ identifySim, compileSim }}
 *   identifySim(path, nSamples)  → async (params) => e[][]   (exact replay at params)
 *   compileSim(path, {laps, preRoll})
 *                                → async (du)     => e[][]   (pre-roll + laps laps)
 */
export function armSimulators({ buildArm, destroyArm, home, sample, chain = null,
  yield_ = null }) {
  return {
    identifySim: (path, nSamples) => async (params) => {
      const m = await buildArm(params);
      try {
        await home(m, path);
        const { e } = await drivePath({ arm: m.arm, servo: m.servo, path, sample,
          steps: nSamples * sample, chain, yield_ });
        return e;
      } finally {
        await destroyArm(m);
      }
    },
    compileSim: (path, { laps = 3, preRoll = 1500 } = {}) => async (du) => {
      const m = await buildArm();
      try {
        await home(m, path);
        const { e } = await drivePath({ arm: m.arm, servo: m.servo, path, sample,
          steps: Math.ceil(path.lap * laps), du, preRoll, chain, yield_ });
        return e;
      } finally {
        await destroyArm(m);
      }
    },
  };
}
