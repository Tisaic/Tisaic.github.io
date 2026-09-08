/**
 * TWO ACTUATOR PATHS, ONE QUESTION (plan §52.26): how fast does the TOOL ERROR answer a
 * correction, through the position command (what every rung here applies) against a torque
 * offset at the motor? §52.26 measured the forecast's reach at ~300 steps and the command path's
 * rise at ~3,000, and named torque injection as the one lever that would change that ratio. This
 * measures the ratio directly: the bench machine held at the square's start pose, a step on
 * each path, the joint-space tool error recorded, and the 10-90% rise, the time to first peak,
 * and the settled value reported. No controller, no fit — a plant property.
 *
 * ITS NUMBERS STAND AND ITS CONCLUSION IS INVERTED (plan §52.28). This file read 951 steps on the
 * command path and 948 on the torque path, and concluded "the gearbox spring is the plant's
 * low-pass, not the loop". BOTH PATHS RUN THROUGH THE CLOSED LOOP: the torque step is added on top
 * of `servo.torques(...)`, so the PD sees the motor move and pushes back, and two measurements
 * through one loop cannot check each other (rule 15). `timescales.mjs` sweeps the servo bandwidth
 * and the rise tracks it — 5156 / 2745 / 943 / 636 / 509 steps at bw 5e-4 / 1e-3 / 2e-3 / 4e-3 /
 * 8e-3 — so the 951 is the position loop's DESIGNED bandwidth (2e-3 rad/step, tau 500) and not the
 * spring, whose two-mass mode is 2.2x FASTER than the loop and critically damped by construction.
 * The agreement this file reported is itself the evidence: at bw >= 2e-3 the two paths are
 * IDENTICAL to the step (943/943, 636/636, 509/509) because one pole dominates both, and at
 * bw 5e-4 they SEPARATE (5156 against 2467) as the loop slows out of the way and the mechanical
 * path shows through. Run it at more than one bandwidth before reading a rise as a plant property.
 */
import { machine, settle } from '../flexisim/_rig.mjs';
const K = +(process.env.ARM_K || 0.25), E = +(process.env.ARM_E || 0.03);
const m = await machine({ K, E });
const { arm, servo } = m;
const [q1, q2] = arm.ik(8, -4, true);           // the square's start corner
settle(arm, servo, q1, q2, 6000);
const truth = () => {
  const tool = arm.toolXY();
  const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2), cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
  const J = arm.jacobian(q1, q2), det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  const ex = tool[0] - cx, ey = tool[1] - cy;
  return [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det];
};
const refs = (d1) => [{ theta: q1 + d1, omega: 0, alpha: 0 }, { theta: q2, omega: 0, alpha: 0 }];
const run = (label, cmdStep, tauStep, n) => {
  const e0 = truth();
  const rec = [];
  for (let k = 0; k < n; k++) {
    const t = servo.torques(refs(cmdStep));
    arm.step(t[0] + tauStep, t[1], 1);
    const e = truth(); rec.push(e[0] - e0[0]);
  }
  const fin = rec.slice(-500).reduce((a, v) => a + v, 0) / 500;
  let pk = 0, kpk = 0; for (let k = 0; k < n; k++) if (Math.abs(rec[k]) > Math.abs(pk)) { pk = rec[k]; kpk = k; }
  const cross = (f) => { const tgt = f * fin; for (let k = 0; k < n; k++) if ((fin >= 0 && rec[k] >= tgt) || (fin < 0 && rec[k] <= tgt)) return k; return n; };
  const t10 = cross(0.1), t90 = cross(0.9);
  console.log(`  ${label.padEnd(44)} settled ${fin.toExponential(3)} rad   10-90% rise ${t90 - t10} steps (10% at ${t10}, 90% at ${t90})   first peak ${pk.toExponential(3)} at ${kpk} steps   ${(Math.abs(pk) / Math.max(1e-12, Math.abs(fin))).toFixed(2)}x overshoot`);
  return { rec, fin };
};
console.log(`bench machine K ${K} / E ${E}, held at the square's start; tool error in joint space, channel 1, response to a step on each path:`);
const a = run('COMMAND path: +0.01 rad on joint 1 reference', 0.01, 0, 8000);
settle(arm, servo, q1, q2, 6000);
const tauStep = 0.02 * servo.tauMax;
const b = run(`TORQUE path: +${(0.02 * 100).toFixed(0)}% of tauMax at motor 1`, 0, tauStep, 8000);
settle(arm, servo, q1, q2, 6000);
const c = run(`TORQUE path: +${(0.05 * 100).toFixed(0)}% of tauMax at motor 1`, 0, 0.05 * servo.tauMax, 8000);
console.log(`  servo bandwidth ${servo.bandwidth ?? '?'} per step, tauMax ${servo.tauMax.toExponential(2)}, gearbox K ${K}`);
await m.l1.destroy(); await m.l2.destroy();
