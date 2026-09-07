/**
 * GOING SOMEWHERE IS A MOVE, NEVER A TELEPORT.
 *
 * A real machine is wherever its last move left it, and it gets to the next place by being
 * DRIVEN there. Every place this project used to put the arm somewhere — the page's Reset, the
 * ladder's per-run snapshot restore, the calibration poses, the held start before each teacher
 * drive — set the pose and held it, which on screen is a jump and on a machine is impossible.
 * This is the one planner every one of them now goes through, so that "how the arm moves
 * between programs" is stated once and is the same in the browser and in the Node bar.
 *
 * THE MOVE IS A RAPID, PLANNED, THEN A SETTLE READ BY RULE 45. The reference is interpolated
 * in JOINT space from where the arm IS to the target — smoothstep, so the rate is zero at both
 * ends — timed so the TOOL covers its path at the feed the caller gives (peak ~1.5x, since the
 * profile is not flat). A step reference to a far target is a move no controller issues, and
 * the servo's answer to one reads on screen as the very snap this replaces. The tool path is
 * measured along the interpolation rather than as the chord, because a joint-space move draws
 * an arc and timing the arc by the chord would exceed the feed on a long swing. Then the arm is
 * held on the target until the TOOL HAS NOT MOVED over a window — travel, not rate (rule 45) —
 * with a stated cap and a `capped` flag rather than a silent give-up.
 *
 * WHAT IT COSTS AGAINST WHAT IT REPLACED. The ladder's restore was bit-identical and free;
 * a driven approach is neither: every scored run now starts from a state the settle CONVERGED
 * TO, and the machine carries what the previous run left in it — which is what a real machine
 * does, and is the whole point. The bench re-measured through it is the control (plan §52.12).
 */

/** Settle policy: minimum held steps, the quiet window, the travel that counts as still, the cap. */
export const APPROACH = { min: 1500, window: 300, quiet: 1e-5, cap: 30000 };

/** Tool position for a 2R pose, from the arm's own link lengths. */
function toolAt(arm, q) {
  return [arm.L1 * Math.cos(q[0]) + arm.L2 * Math.cos(q[0] + q[1]),
    arm.L1 * Math.sin(q[0]) + arm.L2 * Math.sin(q[0] + q[1])];
}

/**
 * Plan an approach from where `arm` is to the joint pose `q1`, at tool speed `feed`.
 * @param {object} arm  a FlexArm2R (reads `q`, `L1`, `L2`, `toolXY()`)
 * @param {number[]} q1 target joint pose
 * @param {number} feed tool speed the rapid is timed at (length units per step)
 * @param {object} [policy=APPROACH]
 */
export function planApproach(arm, q1, feed, policy = APPROACH) {
  const q0 = [arm.q[0], arm.q[1]];
  // The tool's path length along the joint interpolation, sampled — an arc, not a chord.
  let dist = 0, prev = toolAt(arm, q0);
  for (let i = 1; i <= 32; i++) {
    const u = i / 32, sm = u * u * (3 - 2 * u);
    const p = toolAt(arm, [q0[0] + (q1[0] - q0[0]) * sm, q0[1] + (q1[1] - q0[1]) * sm]);
    dist += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p;
  }
  const T = Math.max(1, Math.ceil(dist / Math.max(feed, 1e-12)));
  return { q0, q1: [q1[0], q1[1]], T, dist, from: arm.toolXY(), steps: 0, win: [], capped: false,
    policy, refs: [{ theta: q1[0], omega: 0, alpha: 0 }, { theta: q1[1], omega: 0, alpha: 0 }] };
}

/**
 * One solver step of a planned approach: commands the interpolated reference (then the
 * target), steps the arm once, and reports whether the arm has ARRIVED — the tool still over
 * the window, or the cap hit (`a.capped`).
 */
export function approachStep(a, arm, servo) {
  let refs = a.refs;
  if (a.steps < a.T) {
    const u = (a.steps + 1) / a.T, sm = u * u * (3 - 2 * u), dsm = 6 * u * (1 - u) / a.T;
    refs = [0, 1].map((c) => ({ theta: a.q0[c] + (a.q1[c] - a.q0[c]) * sm,
      omega: (a.q1[c] - a.q0[c]) * dsm, alpha: 0 }));
  }
  const t = servo.torques(refs); arm.step(t[0], t[1], 1); a.steps++;
  const tp = arm.toolXY();
  a.win.push(tp); if (a.win.length > a.policy.window) a.win.shift();
  if (a.steps < a.T + a.policy.min) return false;
  const t0 = a.win[0], travel = Math.hypot(tp[0] - t0[0], tp[1] - t0[1]);
  if (travel < a.policy.quiet) return true;
  if (a.steps >= a.policy.cap) { a.capped = true; return true; }
  return false;
}

/**
 * Drive the arm to `q1` and return when it has arrived. `onStep` is called once per solver
 * step (the host counts machine samples with it); `yieldEvery`/`onYield` let a browser draw.
 */
export async function driveTo(arm, servo, q1, feed, o = {}) {
  const a = planApproach(arm, q1, feed, o.policy || APPROACH);
  let i = 0;
  for (;;) {
    const done = approachStep(a, arm, servo);
    if (o.onStep) o.onStep();
    if (done) return a;
    if (o.yieldEvery && ++i % o.yieldEvery === 0) await o.onYield();
  }
}
