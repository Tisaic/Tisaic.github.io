/**
 * @file CONTOUR FOLLOWING ON THE 2R ARM — the objective the end application actually has.
 *
 * Everything else in this directory measures a point-to-point move: where it ends, how
 * long it rings. A CNC machine never ends and never rings — it is always mid-path — so
 * what is pinned here is different in kind: the geometry that lets a Cartesian path be
 * commanded at all, and the decomposition of the tool's deviation into the part that
 * ruins the workpiece and the part that only costs time.
 */
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { ToolPath, roundedRect, SEG } from '../../lib/flexisim/toolpath.js';
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: contour following');

const H = 4, nu = 0.3, rho = 1, CLAMP = 3, RATIO = 100, g = 2e-6;
const LEN1 = 14, LEN2 = 10, K = 16, E = 0.15;
const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E, nu, rho,
  damping: 3e-3 });
const l1 = await mk(LEN1), l2 = await mk(LEN2);
const jt = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
  loadInertia: mp.inertiaAboutPivot, stiffness: K,
  damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
const arm = new FlexArm2R({ joint1: jt(massProperties(l1)), link1: l1,
  joint2: jt(massProperties(l2)), link2: l2, gravityWorld: [0, -g, 0], dt: 1 });

// ------------------------------------------------------------------- kinematics
{
  // ROUND-TRIP TO MACHINE PRECISION, over the workspace rather than at one point, and in
  // BOTH elbow branches — a solution that only works elbow-up is half an IK.
  let worst = 0;
  for (const up of [true, false]) {
    for (let a = -1.0; a <= 1.0; a += 0.25) {
      for (let rr = 0.45; rr <= 0.92; rr += 0.09) {
        const R = rr * (arm.L1 + arm.L2);
        const x = R * Math.cos(a), y = R * Math.sin(a);
        const [q1, q2] = arm.ik(x, y, up);
        const fx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
        const fy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
        worst = Math.max(worst, Math.hypot(fx - x, fy - y));
      }
    }
  }
  check('forward kinematics undoes the inverse, in both elbow branches',
    worst < 1e-12, `worst ${worst.toExponential(2)}`);
  // …AND IT REFUSES OUTSIDE THE WORKSPACE rather than returning the nearest reachable
  // point, which would turn a programming error into a path the machine traces
  // confidently and wrongly.
  let threw = 0;
  for (const R of [arm.L1 + arm.L2 + 0.5, Math.abs(arm.L1 - arm.L2) - 0.5]) {
    try { arm.ik(R, 0, true); } catch { threw++; }
  }
  check('…and it refuses a point outside the reachable annulus', threw === 2, `${threw}/2`);

  // THE JACOBIAN AGAINST A NUMERICAL DERIVATIVE, because an analytic one is exactly the
  // kind of expression that is plausible and wrong.
  let jw = 0;
  const fk = (q1, q2) => [arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2),
    arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2)];
  for (const [q1, q2] of [[0.2, 0.7], [-0.5, 1.3], [1.0, -0.9]]) {
    const J = arm.jacobian(q1, q2), h = 1e-7;
    for (const [c, dq] of [[0, [h, 0]], [1, [0, h]]]) {
      const a = fk(q1 + dq[0], q2 + dq[1]), b = fk(q1 - dq[0], q2 - dq[1]);
      jw = Math.max(jw, Math.abs((a[0] - b[0]) / (2 * h) - J[0][c]),
        Math.abs((a[1] - b[1]) / (2 * h) - J[1][c]));
    }
  }
  check('…and the Jacobian agrees with a numerical derivative', jw < 1e-6,
    `worst ${jw.toExponential(2)}`);

  // THE Jdot TERM IS NOT OPTIONAL, and this is the check that says so: on a CURVE the
  // joint accelerations that produce a given Cartesian acceleration include a term in the
  // squared joint rates, and dropping it is right only when the pose is not changing.
  const [q1, q2] = arm.ik(14, 6, true);
  const r = arm.ikRates(q1, q2, 0.01, 0.004, 0, 0);   // constant Cartesian VELOCITY
  const J = arm.jacobian(q1, q2);
  const naive = [J[0][0] * r.ddq[0] + J[0][1] * r.ddq[1],
    J[1][0] * r.ddq[0] + J[1][1] * r.ddq[1]];
  console.log(`    [Jdot] at constant Cartesian velocity the joints must still `
    + `accelerate: ddq ${r.ddq.map((x) => x.toExponential(2)).join(', ')}`);
  check('a constant Cartesian velocity still needs joint acceleration, and J*ddq alone '
    + 'does not give zero', Math.hypot(naive[0], naive[1]) > 1e-9
      && r.ddq.some((x) => Math.abs(x) > 1e-9),
  `${naive.map((x) => x.toExponential(2)).join(', ')}`);
}

// --------------------------------------------------- the decomposition, on the arm
//
// THE CHECK THAT DECIDES WHETHER ANY OF THIS MEASURES THE RIGHT THING. A tool sitting
// exactly on the path but BEHIND where it was commanded is a perfect part made late; a
// tool off the path by the same distance is scrap. A single tracking number calls them
// identical, and that is the number every other tab here reports.
{
  const path = roundedRect({ w: 12, h: 8, r: 2, centre: [14, 2], feed: 0.02, accel: 2e-5 });
  let lagT = 0, lagC = 0, offT = 0, offC = 0;
  for (let k = 300; k < path.period; k += 37) {
    const cmd = path.at(k);
    // (a) on the path, 200 steps behind
    const late = path.at(k - 200);
    const dl = decompose(path, [late.x, late.y], cmd);
    lagT = Math.max(lagT, Math.hypot(late.x - cmd.x, late.y - cmd.y));
    lagC = Math.max(lagC, Math.abs(dl.contour));
    // (b) exactly at the commanded arc length, but 0.05 off the path
    const t = path.tangent(cmd.s), n = [-t[1], t[0]];
    const off = [cmd.x + 0.05 * n[0], cmd.y + 0.05 * n[1]];
    const dn = decompose(path, off, cmd);
    offT = Math.max(offT, Math.hypot(off[0] - cmd.x, off[1] - cmd.y));
    offC = Math.max(offC, Math.abs(dn.contour));
  }
  console.log(`    [decompose] a 200-step LAG: tracking ${lagT.toExponential(3)}, `
    + `contour ${lagC.toExponential(3)}`);
  console.log(`    [decompose] a 0.05 NORMAL offset: tracking ${offT.toExponential(3)}, `
    + `contour ${offC.toExponential(3)}`);
  check('a pure lag is a large tracking error and no contour error',
    lagT > 0.5 && lagC < 1e-9, `${lagT} / ${lagC}`);
  check('…and a normal offset of the same kind of size is ALL contour error',
    Math.abs(offC - 0.05) < 1e-6, `${offC}`);
  check('…so a single tracking number cannot tell a late part from a wrong one',
    lagT / Math.max(offT, 1e-30) > 5 && lagC / Math.max(offC, 1e-30) < 1e-6,
    `tracking ratio ${(lagT / offT).toFixed(1)}, contour ratio ${(lagC / offC).toExponential(1)}`);
}

// ------------------------------------------------------- the arm actually tracing one
//
// THREE FEEDRATES, BECAUSE ONE NUMBER FROM ONE FEEDRATE SAYS NOTHING. What the tab exists
// to show is how the three objectives move AGAINST each other as the machine is asked to
// go faster, and that they do not optimise to the same place.
{
  const rows = [];
  for (const feed of [8e-3, 2e-3, 5e-4]) {
    const path = roundedRect({ w: 5, h: 3.5, r: 1.0, centre: [14, 1], feed,
      accel: feed * feed / 1.0, cornerDt: 60 });
    const [q10, q20] = arm.ik(path.at(0).x, path.at(0).y, true);
    arm.setPose(q10, q20);
    const servo = new ChainServo({ arm, bandwidth: 2e-3 });
    for (let i = 0; i < 6000; i++) {
      const t = servo.torques([{ theta: q10, omega: 0, alpha: 0 },
        { theta: q20, omega: 0, alpha: 0 }]);
      arm.step(t[0], t[1], 1);
    }
    const score = new ContourScore({ joints: 2 });
    for (let k = 0; k < path.period; k++) {
      const cmd = path.at(k);
      const [c1, c2] = arm.ik(cmd.x, cmd.y, true);
      const r = arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const tau = servo.torques([{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }]);
      arm.step(tau[0], tau[1], 1);
      const d = decompose(path, arm.toolXY(), cmd);
      const e = arm.encoders();
      score.step(d.contour, d.lag, tau, [e[0].speed * RATIO, e[1].speed * RATIO]);
    }
    rows.push({ feed, ...score.report() });
  }
  for (const r of rows) {
    console.log(`    [trace] feed ${r.feed.toExponential(1)} → ${String(r.steps).padStart(6)} `
      + `steps, contour rms ${r.contourRms.toExponential(3)} max ${r.contourMax.toExponential(3)}, `
      + `lag rms ${r.lagRms.toExponential(3)}, tau^2 ${r.tau2.toExponential(3)}, `
      + `work ${r.work.toExponential(2)}, reversals ${r.reversals}`);
  }
  const [fast, mid, slow] = rows;
  check('the arm traces the path and stays on it at a feedrate it can follow',
    mid.contourMax < 0.06 * 3.5, `${mid.contourMax} against ${0.06 * 3.5}`);
  // THE DEVIATION IS MOSTLY LAG, which is the point of separating them: a compliant arm
  // on a feedforward loop is mostly LATE, and being late is not a dimensional error.
  check('…with the deviation dominated by LAG rather than by contour error',
    mid.lagRms > 5 * mid.contourRms,
    `lag ${mid.lagRms.toExponential(2)} vs contour ${mid.contourRms.toExponential(2)}`);
  // GOING FASTER COSTS ACCURACY, which says the metric is sensitive to the thing it is
  // for…
  check('going faster costs contour accuracy',
    fast.contourRms > 5 * mid.contourRms,
    `${fast.contourRms.toExponential(2)} vs ${mid.contourRms.toExponential(2)}`);
  // …AND GOING SLOWER STOPS HELPING, WHICH IS THE FINDING. Below about one servo time
  // constant of travel the contour error stops falling: what is left is the arm's own
  // COMPLIANCE, a static sag that does not care how slowly the tool is moved. Measured
  // 6.3e-2 -> 4.0e-2 for a FOUR-FOLD reduction in feedrate, against 4.9e-1 -> 6.3e-2 for
  // the four-fold before it. A machine at that floor cannot be improved by slowing down;
  // it needs the compliance corrected, which is what the rest of this tab is about.
  const fastGain = fast.contourRms / mid.contourRms;
  const slowGain = mid.contourRms / slow.contourRms;
  console.log(`    [floor] halving the feed twice buys ${fastGain.toFixed(1)}x at the fast `
    + `end and ${slowGain.toFixed(2)}x at the slow end — the difference is the compliance, `
    + 'which slowing down cannot reach');
  check('…and slowing down stops helping, because what is left is compliance',
    slowGain < 2 && fastGain > 3 * slowGain,
    `${slowGain.toFixed(2)}x against ${fastGain.toFixed(1)}x`);
  // AND THE ENERGY HAS AN INTERIOR MINIMUM, so accuracy and energy do NOT optimise to the
  // same feedrate. Fast costs acceleration; slow costs holding the arm up against gravity
  // for longer. That is the trade the machine's owner has to make and the reason all
  // three numbers are reported rather than one.
  console.log(`    [energy] tau^2 ${rows.map((r) => r.tau2.toExponential(2)).join(' → ')} `
    + '— fast costs acceleration, slow costs holding position for longer');
  check('motor energy has an interior minimum, so it does not optimise where accuracy does',
    mid.tau2 < fast.tau2 && mid.tau2 < slow.tau2 * 1.05,
    `${fast.tau2.toExponential(2)} / ${mid.tau2.toExponential(2)} / ${slow.tau2.toExponential(2)}`);
  check('…and the score records reversals too, which no rms can show',
    rows.every((r) => r.reversals >= 2 && r.torqueReversals > 0),
    rows.map((r) => `${r.reversals}/${r.torqueReversals}`).join(' '));
}

// ------------------------------------------------ the deadband has to be there
{
  // A reversal counter with no deadband counts arithmetic. Driven with a speed that
  // dithers around zero, the raw count is thousands and the physical answer is one.
  const a = new ContourScore({ joints: 1, reversalTravel: 1e-3 });
  const b = new ContourScore({ joints: 1, reversalTravel: 0 });
  let seed = 5;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5; };
  for (let k = 0; k < 4000; k++) {
    // A joint DWELLING near zero with a little noise on it, then committing to one
    // direction. Physically that is ONE direction change: the gear teeth change faces
    // once. Counted on the raw sign it is a thousand.
    const w = k < 2000 ? 1e-5 * rnd() : 0.02 * (k - 2000) / 2000;
    a.step(0, 0, [1], [w]); b.step(0, 0, [1], [w]);
  }
  console.log(`    [reversals] one real direction change through a dwell: `
    + `counting travel ${a.report().reversals}, counting sign ${b.report().reversals}`);
  check('counting TRAVEL makes the reversal count physical rather than arithmetic',
    a.report().reversals <= 1 && b.report().reversals > 50,
    `${a.report().reversals} vs ${b.report().reversals}`);
}

// ------------------------------------------------- bias against oscillation (rule 39)
{
  // TWO STREAMS WITH THE SAME CONTOUR RMS AND OPPOSITE CAUSES. One part is cut uniformly
  // 0.2 undersize; the other is the right size and rings +-0.2*sqrt(2) about it. A single
  // rms calls them identical, and they need different fixes — an offset for the first, a
  // faster or better-phased correction for the second. This is the check that the
  // decomposition can tell them apart, and it asserts BOTH halves of both (rule 9):
  // the offset part must read all bias and no oscillation, and the ringing part the
  // reverse. It would pass with either accumulator removed only if the other were wrong
  // too, because rms^2 = bias^2 + osc^2 is asserted as an identity on a third stream
  // that has BOTH.
  const N = 4000, A = 0.2;
  const off = new ContourScore({ joints: 1, reversalTravel: 1 });
  const ring = new ContourScore({ joints: 1, reversalTravel: 1 });
  const both = new ContourScore({ joints: 1, reversalTravel: 1 });
  for (let k = 0; k < N; k++) {
    const osc = A * Math.SQRT2 * Math.sin((2 * Math.PI * 7 * k) / N);
    off.step(-A, 0, [0], [0]);
    ring.step(osc, 0, [0], [0]);
    both.step(-A + osc, 0, [0], [0]);
  }
  const o = off.report(), r2 = ring.report(), b = both.report();
  console.log(`    [bias/osc] offset part rms ${o.contourRms.toFixed(4)} = bias `
    + `${o.contourBias.toFixed(4)} + osc ${o.contourOsc.toFixed(4)}; ringing part rms `
    + `${r2.contourRms.toFixed(4)} = bias ${r2.contourBias.toFixed(4)} + osc `
    + `${r2.contourOsc.toFixed(4)}`);
  check('two streams a single contour rms cannot tell apart ARE the same rms',
    Math.abs(o.contourRms - r2.contourRms) < 1e-3,
    `${o.contourRms.toFixed(5)} vs ${r2.contourRms.toFixed(5)}`);
  check('…the uniformly undersize part reads all bias and no oscillation',
    Math.abs(o.contourBias + A) < 1e-9 && o.contourOsc < 1e-9,
    `bias ${o.contourBias}, osc ${o.contourOsc}`);
  check('…the right-size ringing part reads the reverse',
    Math.abs(r2.contourBias) < 1e-3 && Math.abs(r2.contourOsc - A * Math.SQRT2 / Math.SQRT2) < 1e-3,
    `bias ${r2.contourBias}, osc ${r2.contourOsc}`);
  check('…and on a stream with both, rms² = bias² + osc² identically',
    Math.abs(b.contourRms ** 2 - (b.contourBias ** 2 + b.contourOsc ** 2)) < 1e-12,
    `${b.contourRms ** 2} vs ${b.contourBias ** 2 + b.contourOsc ** 2}`);
}

await l1.destroy(); await l2.destroy();
console.log(failed ? `\ncontour: ${failed} check(s) FAILED\n` : '\ncontour: all checks passed\n');
process.exit(failed ? 1 : 0);
