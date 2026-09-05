/**
 * @file DOES THE SOFTER E LADDER BUILD AND RUN, and is it a real lever? A rung that appears in
 *       a slider and produces a dead lattice is worse than no rung — it renders as a machine
 *       rather than as a refusal (rule 51).
 *
 * The page's link-modulus ladder was extended 6x below its old floor, to
 * [0.005, 0.01, 0.02, 0.03, ...]. Softening E is SAFER for the lattice's CFL condition, not
 * riskier — elastic wave speed goes as sqrt(E/rho) — so what a soft cell threatens is the
 * small-deflection assumption in the tool-error projection, a modelling limit rather than a
 * solver one. Every cell here builds, runs a full lap and stays finite.
 *
 * AND THE SENSITIVITY REVERSED WHEN THE INSTRUMENT WAS FIXED, which is the reason this file
 * exists rather than a one-off. The first version drove the servo with omega and alpha at ZERO
 * — a static hold commanded at every path point — so the arm lagged the whole program and that
 * lag swamped the flex being measured. It read a 64x change in gearbox stiffness as worth
 * 1.08x, which is impossible, and that is what gave it away (rule 17). With `ikRates` supplying
 * the feedforward terms the same sweep reads:
 *
 *     K 16    E 0.03  4.650e-1     E 0.005  1.356e+0     E is worth 2.92x
 *     K 0.25  E 0.03  9.225e-1     E 0.005  1.785e+0     E is worth 1.93x
 *     K effect at E 0.03: 1.98x    at E 0.005: 1.32x
 *
 * So LINK FLEX dominates GEARBOX WIND-UP on this arm: 6x softer E costs more than 64x softer K.
 * The broken instrument had said the opposite. They also compose sub-additively — each matters
 * less when the other is already soft, which is what two springs in series do.
 *
 * Run: K=0.25 E=0.005 node test/_softe.mjs
 */
import { makeArm, mkPath, homeArm } from './pilot/rigs/arm-rig.mjs';
const E = +(process.env.E || 0.03), K = +(process.env.K || 16);
const t0 = Date.now();
try {
  const { arm, servo } = await makeArm({ E, K });
  const path = mkPath('sharp', 0.004);
  homeArm(arm, servo, path);
  // Drive one lap open loop and report the tool error's scale and whether it stays finite.
  let worst = 0, s2 = 0, n = 0, bad = 0;
  const L = Math.round(path.lap);
  for (let k = 0; k < L; k++) {
    const c = path.at(k);
    // THE FEEDFORWARD TERMS, which the first version of this bench dropped: `ikRates` gives
    // the commanded joint velocity and acceleration, and without them the servo is asked to
    // hold a static pose at every path point, so the arm lags the whole program and that lag
    // swamps the flex being measured. It read K as worth 1.08x across a 64x stiffness range,
    // which is impossible and is what gave it away (rule 17).
    const q = arm.ik(c.x, c.y, true);
    const rt = arm.ikRates(q[0], q[1], c.vx, c.vy, c.ax, c.ay);
    const t = servo.torques([{ theta: q[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    arm.step(t[0], t[1], 1);
    const xy = arm.toolXY();
    if (!Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) { bad++; continue; }
    const d = Math.hypot(xy[0] - c.x, xy[1] - c.y);
    worst = Math.max(worst, d); s2 += d * d; n++;
  }
  console.log(`  K ${K}  E ${E}  built OK in ${((Date.now() - t0) / 1000).toFixed(1)}s  `
    + `lap ${L}  tool rms ${Math.sqrt(s2 / Math.max(1, n)).toExponential(3)}  `
    + `worst ${worst.toExponential(3)}  non-finite ${bad}`);
} catch (e) {
  console.log(`  K ${K}  E ${E}  REFUSED TO BUILD — ${e.message}`);
}
