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
  yield_ = null, yieldEvery = 4000 }) {
  const e = [], perLap = [];
  let acc = [0, 0], n = 0, lapNo = 0;
  const total = steps + preRoll * sample;
  for (let kk = 0; kk < total; kk++) {
    const inPre = kk < preRoll * sample;
    const k = inPre ? 0 : kk - preRoll * sample;
    const c = path.at(k);
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const rt = inPre ? null : arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
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
      { theta: q1 + d0, omega: inPre ? 0 : rt.dq[0], alpha: inPre ? 0 : rt.ddq[0] },
      { theta: q2 + d1, omega: inPre ? 0 : rt.dq[1], alpha: inPre ? 0 : rt.ddq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (kk % sample === 0) {
      e.push(routeTruth(arm, q1, q2));
      if (!inPre) {
        const t = e[e.length - 1];
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
export async function twinResponse({ buildArm, destroyArm, path, sample,
  settleSteps = 30000, respSteps = 12000, stepSize = 2e-3, yield_ = null }) {
  const H = [];
  for (const ch of [0, 1]) {
    const m = await buildArm();
    const c0 = path.at(0);
    const q0 = m.arm.ik(c0.x, c0.y, true);
    for (let k = 0; k < settleSteps; k++) {
      const tau = m.servo.torques([{ theta: q0[0], omega: 0, alpha: 0 }, { theta: q0[1], omega: 0, alpha: 0 }]);
      m.arm.step(tau[0], tau[1], 1);
      if (yield_ && k % 4000 === 0) await yield_();
    }
    const base = routeTruth(m.arm, q0[0], q0[1]);
    const resp = [];
    for (let k = 0; k < respSteps; k++) {
      const refs = [{ theta: q0[0] + (ch === 0 ? stepSize : 0), omega: 0, alpha: 0 },
        { theta: q0[1] + (ch === 1 ? stepSize : 0), omega: 0, alpha: 0 }];
      const tau = m.servo.torques(refs);
      m.arm.step(tau[0], tau[1], 1);
      if (k % sample === 0) {
        const t = routeTruth(m.arm, q0[0], q0[1]);
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
 *   home        async ({arm, servo}, path) — put the machine at the path start, settled
 *   sample
 * @returns {{ identifySim, compileSim }}
 *   identifySim(path, nSamples)  → async (params) => e[][]   (exact replay at params)
 *   compileSim(path, {laps, preRoll})
 *                                → async (du)     => e[][]   (pre-roll + laps laps)
 */
export function armSimulators({ buildArm, destroyArm, home, sample, yield_ = null }) {
  return {
    identifySim: (path, nSamples) => async (params) => {
      const m = await buildArm(params);
      try {
        await home(m, path);
        const { e } = await drivePath({ arm: m.arm, servo: m.servo, path, sample,
          steps: nSamples * sample, yield_ });
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
          steps: Math.ceil(path.lap * laps), du, preRoll, yield_ });
        return e;
      } finally {
        await destroyArm(m);
      }
    },
  };
}
