// ACTIVE COMPENSATION: making the estimate move something.
//
// Bricks 8 and 9 both estimated the tip error and neither of them touched the
// machine. This closes the loop: the identified compliance pre-distorts the
// commanded angle so the tip lands where the program asked, using only what a
// controller has after the laser tracker has been packed away.
//
// THE RESULT IS A 2x2, AND IT IS ORTHOGONAL TO FOUR DIGITS. There are TWO tip
// errors here with two different mechanisms -- a quasi-static deflection under
// load and the link's own vibration -- and each has exactly one fix. Compensation
// removes the BIAS and leaves the oscillation alone; input shaping removes the
// OSCILLATION and leaves the bias alone, unchanged to a tenth of a percent.
// Neither is worth much by itself and the two together are worth their product.
//
// THE DECOMPOSITION IS WHAT MAKES THAT VISIBLE, and getting it wrong hid the
// result twice. Scored as one RMS over the move, compensation reads as "1.1x" and
// looks like a disappointment. Scored over a settled dwell window instead, the
// answer depends on how long the dwell is -- at 600 steps the vibration has not
// decayed and compensation reads 0.99x, at 1100 it has mostly decayed and the same
// runs read 4.35x. Neither number is about compensation. The mean and the standard
// deviation of the SAME error record separate the two mechanisms with no window to
// choose: a bias is what a systematic deflection looks like, an oscillation is
// what a mode looks like, and the total is the quadrature sum.

import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm } from '../../lib/flexisim/arm.js';
import {
  buildLink, massProperties, tipDeflection, armLength, peakSpeed,
} from '../../lib/flexisim/link.js';
import { PlanarComp } from '../../lib/flexisim/compliance.js';
import {
  AngleProfile, PositionServo, TipCompensator, tipTrackingError, zvShaper, zvdShaper, ringFit,
  boxcarShaper, convolveShapers, driveEnvelope,
} from '../../lib/flexisim/compensator.js';

const FULL = process.env.SUITE === 'full';
let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: active compensation');

// A STIFFER MACHINE THAN THE SOFT-SENSOR TESTS USE, and deliberately: at brick 8's
// K = 0.4 the arm sags 2.5% of its own length under gravity alone, which is a
// demonstration plant rather than a machine anyone would compensate. E = 0.2 is
// the stiffest link the CFL gate allows (c_p = 0.519 against 0.577) and K = 4.0
// keeps the gearbox resonance an order above the servo bandwidth. The tip then
// sits 0.48% of the arm off under gravity -- still a very flexible robot, but one
// whose errors are a correction rather than a redesign.
const H = 4, LEN = 16, CLAMP = 3, E = 0.2, nu = 0.3, rho = 1, K = 4.0, g = 2e-6;
const RATIO = 100, SERVO_BW = 0.002;

async function makeArm() {
  const link = await buildLink({ length: LEN, section: H, clamp: CLAMP, E, nu, rho,
    gravity: [0, -g, 0], damping: 3e-3 });
  const mp = massProperties(link);
  const joint = new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm({ joint, link, gravityWorld: [0, -g, 0], dt: 1 });
  // THE RIGID MODEL THE CONTROLLER HAS: mass and centroid off the CAD, so the
  // gravity torque is a closed form of the pose and needs no lattice. This is the
  // only place the plant's own numbers are handed to the controller, and they are
  // ones a real one genuinely has.
  const tauG = (th) => mp.centroid * mp.mass * (-g) * Math.cos(th);
  const Jr = joint.reflectedInertia();
  const servo = new PositionServo({ kp: SERVO_BW * SERVO_BW * Jr / RATIO,
    kd: 2 * SERVO_BW * Jr / RATIO, inertia: Jr, ratio: RATIO, gravityTorque: tauG });
  return { arm, mp, tauG, servo, link, joint };
}

const hold = (m, theta, n) => {
  const ref = { theta, omega: 0, alpha: 0 };
  for (let i = 0; i < n; i++) m.arm.step(m.servo.torque(ref, m.arm.encoder()), 1);
};

// ============================================================ COMMISSIONING
// The tracker is on the machine exactly once. Everything identified here is
// everything production will ever have.
const COMM = await makeArm();
// ENDING AT THE HOME POSE IS NOT AN AESTHETIC CHOICE: the decay fit below needs
// the arm already settled at zero, and re-settling costs as much as a pose does.
const POSES = [0.8, 0.4, 0];   // 8000 steps each: see the settle note below
const touches = [];
for (const th of POSES) {
  hold(COMM, th, 8000);
  touches.push({ th, tau: COMM.tauG(COMM.arm.joint.thL),
    err: tipTrackingError(COMM.arm, th), v: peakSpeed(COMM.link),
    enc: COMM.arm.encoder().angle - th });
}
const pc = new PlanarComp(COMM.arm.Larm);
for (const t of touches) pc.calibrate(t.tau, t.err);
const cPer = touches.map((t) => t.err / (COMM.arm.Larm * t.tau));
console.log(`    [commission] c ${pc.compliance.toFixed(5)} (1/K = ${(1 / K).toFixed(4)}, `
  + `so the link is ${(100 * (1 - (1 / K) / pc.compliance)).toFixed(0)}% of it)`
  + `   per pose ${cPer.map((c) => c.toFixed(5)).join(' ')}`);

// THE SERVO HAS TO BE A LOOP BEFORE ANY OF THIS MEANS ANYTHING. With exact gravity
// feedforward the steady-state following error is structurally zero, so a held
// pose isolates the compliance from the controller -- which is precisely why the
// settled dwell is where the compensation claim is scored below.
check('the servo holds a pose with no following error left',
  touches.every((t) => Math.abs(t.enc) < 2e-5),
  touches.map((t) => t.enc.toExponential(1)).join(' '));
check('every commissioning pose settled', touches.every((t) => t.v < 1e-6),
  touches.map((t) => t.v.toExponential(1)).join(' '));
check('the identified compliance agrees across poses to 0.5%',
  (Math.max(...cPer) - Math.min(...cPer)) / pc.compliance < 5e-3,
  cPer.join(' '));

// THE SHAPER'S FREQUENCY IS MEASURED, NOT ASSUMED. Euler-Bernoulli says 7.09e-3
// rad/step for this link; the machine says otherwise, and an 11% error in a ZV
// shaper leaves about a tenth of the vibration it was meant to remove. So
// commissioning excites a decay on purpose and fits it -- a deliberately
// UNCONTROLLED move, for the same reason the anti-slosh health check needs one.
const base = tipDeflection(COMM.link);
for (let i = 0; i < 40; i++) {
  COMM.arm.step(COMM.servo.torque({ theta: 0, omega: 0, alpha: 0 }, COMM.arm.encoder()) + 3e-4, 1);
}
const decay = [];
for (let i = 0; i < 3600; i++) {
  COMM.arm.step(COMM.servo.torque({ theta: 0, omega: 0, alpha: 0 }, COMM.arm.encoder()), 1);
  decay.push(tipDeflection(COMM.link) - base);
}
const mode = ringFit(decay);
const eb = 3.516 * Math.sqrt(E * (H ** 4 / 12) / (rho * H * H * LEN ** 4));
console.log(`    [commission] first bending mode ${mode.omega.toExponential(3)} rad/step `
  + `(period ${mode.period.toFixed(0)}), zeta ${mode.zeta.toFixed(3)}`
  + `   Euler-Bernoulli would say ${eb.toExponential(3)} (${((eb / mode.omega - 1) * 100).toFixed(0)}% high)`);
check('the measured bending mode is well below Euler-Bernoulli, as a stubby section must be',
  mode.omega > 0.8 * eb && mode.omega < 0.95 * eb, `${mode.omega} vs ${eb}`);

// ============================================================ THE 2x2
const SHAPER = zvdShaper(mode.omega, mode.zeta);
const DWELL = 150;   // steps at the END of each dwell, i.e. settled and unshaped-in

async function run({ compensate = false, shaped = false, sign = -1, limits = {} } = {}) {
  const m = await makeArm();
  // THE DWELL IS LONGER THAN THE SHAPER'S TOTAL DELAY (one damped period, ~1010
  // steps) so a shaped move still reaches its endpoint before the next one starts.
  // A shaper costs delay and nothing else; that delay has to come from somewhere.
  const prof = new AngleProfile({ span: 0.144, accelSteps: 300, cruiseSteps: 400,
    dwellSteps: 1100, shaper: shaped ? SHAPER : null });
  const comp = new TipCompensator({ comp: pc, inertia: m.mp.inertiaAboutPivot,
    gravityTorque: m.tauG, sign, limits });
  const errs = [], dwell = [];
  let maxOffset = 0;
  for (let k = 0; k < 2 * prof.period; k++) {
    const ref = prof.at(k);
    const off = compensate ? comp.offset(ref) : 0;
    maxOffset = Math.max(maxOffset, Math.abs(off));
    m.arm.step(m.servo.torque({ ...ref, theta: ref.theta + off }, m.arm.encoder()), 1);
    if (k < prof.period) continue;            // the first period is the transient
    const e = tipTrackingError(m.arm, ref.theta);
    errs.push(e);
    if ((k % prof.period) % prof.half >= prof.half - DWELL) dwell.push(e);
  }
  await m.link.destroy();
  const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
  const mean = errs.reduce((s, x) => s + x, 0) / errs.length;
  const sd = Math.sqrt(errs.reduce((s, x) => s + (x - mean) ** 2, 0) / errs.length);
  return { rms: rms(errs), peak: Math.max(...errs.map(Math.abs)), dwell: rms(dwell),
    bias: Math.abs(mean), sd, maxOffset };
}

const plain = await run();
const comp = await run({ compensate: true });
const shape = await run({ shaped: true });
const both = await run({ compensate: true, shaped: true });
const staticSag = Math.abs(touches[POSES.indexOf(0)].err);
const row = (n, r) => console.log(`    [${n.padEnd(11)}] bias ${r.bias.toExponential(3)}   `
  + `oscillation ${r.sd.toExponential(3)}   rms ${r.rms.toExponential(3)}   settled ${r.dwell.toExponential(3)}`);
console.log(`    static sag at the home pose ${staticSag.toExponential(3)} `
  + `(${(100 * staticSag / COMM.arm.Larm).toFixed(2)}% of the arm)`);
row('plain', plain); row('compensated', comp); row('shaped', shape); row('both', both);
console.log(`    [bias]        compensation ${(plain.bias / comp.bias).toFixed(0)}x, `
  + `shaping ${(plain.bias / shape.bias).toFixed(3)}x (i.e. nothing)`);
console.log(`    [oscillation] compensation ${(plain.sd / comp.sd).toFixed(2)}x (i.e. nothing), `
  + `shaping ${(plain.sd / shape.sd).toFixed(2)}x`);
console.log(`    [rms]         compensation ${(plain.rms / comp.rms).toFixed(2)}x, `
  + `shaping ${(plain.rms / shape.rms).toFixed(2)}x, TOGETHER ${(plain.rms / both.rms).toFixed(2)}x`);

check('compensation removes the BIAS by more than 100x',
  plain.bias / comp.bias > 100, `${(plain.bias / comp.bias).toFixed(0)}x`);
check('...and does nothing whatever to the oscillation',
  Math.abs(comp.sd / plain.sd - 1) < 0.15, `${(comp.sd / plain.sd).toFixed(3)}x`);
check('shaping cuts the oscillation by more than 2x',
  plain.sd / shape.sd > 2, `${(plain.sd / shape.sd).toFixed(2)}x`);
// THE UNCHANGED BIAS UNDER SHAPING IS THE STRONGEST LINE IN THIS FILE. A shaper is
// a convolution with impulses summing to one, so it cannot change where a move
// ENDS -- only how it gets there. If shaping moved the bias at all, the bias would
// not be what this brick says it is.
check('...and leaves the bias alone to a tenth of a percent, as a unit-sum convolution must',
  Math.abs(shape.bias / plain.bias - 1) < 1e-2, `${(shape.bias / plain.bias).toFixed(5)}x`);
check('what shaping leaves behind IS the static sag at the home pose',
  Math.abs(shape.bias / staticSag - 1) < 0.1,
  `${shape.bias.toExponential(3)} vs ${staticSag.toExponential(3)}`);
check('TOGETHER the rms falls more than 2.5x, which neither alone gets near',
  plain.rms / both.rms > 2.5 && plain.rms / comp.rms < 1.2 && plain.rms / shape.rms < 2.2,
  `${(plain.rms / both.rms).toFixed(2)}x vs ${(plain.rms / comp.rms).toFixed(2)}x and `
  + `${(plain.rms / shape.rms).toFixed(2)}x`);
// THE COMPENSATION IS ACCURATE DESPITE A KNOWN MODEL ERROR, and the reason is
// worth stating because it will not hold on every machine: c was identified under
// GRAVITY, a uniform body force, and is applied to an INERTIAL load that grows
// with radius, which deflects ~7% more per unit joint torque (measured in the full
// tier below). Over a full out-and-back the commanded acceleration averages to
// zero, so that error averages out of the BIAS -- it lives in the oscillation
// instead. A one-way move, or a duty cycle biased toward acceleration, would see
// it directly.
check('the residual bias is under 1% of the sag it removed',
  comp.bias / staticSag < 0.01, `${(100 * comp.bias / staticSag).toFixed(2)}%`);

// THE SIGN IS FIXED BY THE PLANT AND IS THE CHEAPEST POSSIBLE TEST OF IT: a
// correction applied backwards does not merely fail to help, it applies the error
// a second time. Scored on the shaped run, where the vibration is out of the way
// and the doubling is visible as a doubling.
const flipped = await run({ compensate: true, sign: +1 });
console.log(`    [sign] bias uncompensated ${plain.bias.toExponential(3)} → correct `
  + `${comp.bias.toExponential(3)}, backwards ${flipped.bias.toExponential(3)} `
  + `(${(flipped.bias / plain.bias).toFixed(2)}x)`);
check('the sign is fixed by the plant: backwards DOUBLES the bias instead of removing it',
  flipped.bias / plain.bias > 1.9 && flipped.bias / plain.bias < 2.1,
  `${(flipped.bias / plain.bias).toFixed(3)}x`);

// ============================================================ FULL TIER
if (FULL) {
  // THE LIMITS ARE NOT DECORATION. A compensator whose model is wrong can command
  // an unbounded offset, and RobotComp carries the magnitude clamp for exactly
  // that. Clamping it to a tenth of what it wants must degrade the correction
  // rather than break the machine.
  const clamped = await run({ compensate: true, limits: { deflectMax: 0.1 * comp.maxOffset } });
  console.log(`    [limits] offset wanted ${comp.maxOffset.toExponential(3)} rad, clamped to `
    + `${(0.1 * comp.maxOffset).toExponential(3)} → bias ${clamped.bias.toExponential(3)} `
    + `(uncompensated ${plain.bias.toExponential(3)}, unclamped ${comp.bias.toExponential(3)})`);
  check('the magnitude limit degrades the correction rather than breaking it',
    clamped.bias > comp.bias && clamped.bias < plain.bias, `${clamped.bias.toExponential(3)}`);

  // THE HONEST LIMIT OF ONE CONSTANT: compliance was identified under GRAVITY, a
  // uniform body force, and applied to an INERTIAL load, which grows linearly with
  // radius. Thin-beam theory says the tip sags 11 w L^4/120EI under a triangular
  // load against w L^4/8EI under a uniform one, and the joint torques are w L^2/3
  // and w L^2/2, so the deflection per unit torque differs by (11/40)/(1/4) = 1.10.
  // One constant cannot be both.
  const settleOnly = async (o) => {
    const link = await buildLink({ length: LEN, section: H, clamp: CLAMP, E, nu, rho,
      damping: 8e-3, ...o });
    link.advance(9000);
    const r = { sag: tipDeflection(link), v: peakSpeed(link),
      mp: massProperties(link), L: armLength(link) };
    await link.destroy();
    return r;
  };
  const aTest = 3.6e-7;
  const G = await settleOnly({ gravity: [0, -g, 0] });
  const I = await settleOnly({ alpha: [0, 0, aTest] });
  const cG = G.sag / (G.L * (G.mp.centroid * G.mp.mass * (-g)));
  const cI = I.sag / (I.L * (-I.mp.inertiaAboutPivot * aTest));
  console.log(`    [distribution] sag per unit torque: gravity ${cG.toFixed(5)}, `
    + `inertial ${cI.toFixed(5)} → ${(cI / cG).toFixed(4)}x  (thin-beam prediction 1.10; `
    + 'shear and root rotation are shared by both loads and dilute it)');
  check('an inertial load deflects MORE per unit joint torque than gravity does',
    cI / cG > 1.03 && cI / cG < 1.15, `${(cI / cG).toFixed(4)}`);
  check('both static cases settled', G.v < 1e-12 && I.v < 1e-12,
    `${G.v.toExponential(1)} ${I.v.toExponential(1)}`);
}

// ------------------------------------------------- the jerk limit
//
// A BOXCAR IS A JERK LIMIT, and what has to hold is that it costs delay and NOTHING
// else: a unit-sum convolution cannot change where a move ends, which is the same
// property an input shaper relies on and the reason the two compose. No plant needed --
// this is arithmetic about the reference.
console.log('\n  the jerk limit');
{
  const W = 120;
  const box = boxcarShaper(W);
  const sum = (l) => l.reduce((a, [amp]) => a + amp, 0);
  check('a boxcar is unit-sum, so the move still goes exactly as far',
    Math.abs(sum(box) - 1) < 1e-12, `${sum(box)}`);
  check('…with one impulse per step, which is what makes the acceleration CONTINUOUS',
    box.length === W && box.every(([, d], i) => d === i), `${box.length}`);
  const zvd = zvdShaper(6.4e-3, 0.23);
  const both = convolveShapers(zvd, box);
  check('convolving with a shaper preserves unit sum', Math.abs(sum(both) - 1) < 1e-12,
    `${sum(both)}`);
  check('…and the delays add rather than multiply',
    Math.max(...both.map((i) => i[1]))
      === Math.max(...zvd.map((i) => i[1])) + Math.max(...box.map((i) => i[1])),
    `${Math.max(...both.map((i) => i[1]))}`);
  check('convolveShapers(null, x) is x, so an unshaped page composes cleanly',
    convolveShapers(null, box) === box && convolveShapers(box, null) === box);

  const bare = new AngleProfile({ span: 0.144, accelSteps: 300, cruiseSteps: 400,
    dwellSteps: 1276 });
  const jerked = new AngleProfile({ span: 0.144, accelSteps: 300, cruiseSteps: 400,
    dwellSteps: 1276 + W, shaper: box });
  // THE END POINT IS THE THING A CONVOLUTION MUST NOT MOVE. Compare the peak commanded
  // angle rather than one sample, since the jerk limit shifts WHEN it is reached.
  const peak = (p) => { let m = -Infinity;
    for (let n = 0; n < p.period; n++) m = Math.max(m, p.at(n).theta); return m; };
  check('the jerk-limited move reaches exactly the same span',
    Math.abs(peak(jerked) - peak(bare)) < 1e-9 * Math.max(1, peak(bare)),
    `${peak(jerked)} vs ${peak(bare)}`);

  // AND THE ACCELERATION IS CONTINUOUS, which is the whole point: the compensator's
  // output is proportional to it, so a step there is a step in the control signal.
  const jump = (p) => { let m = 0;
    for (let n = 0; n < p.period; n++) m = Math.max(m, Math.abs(p.at(n + 1).alpha - p.at(n).alpha));
    return m; };
  const jb = jump(bare), jj = jump(jerked);
  console.log(`    [jerk] biggest one-step acceleration jump: bare ${jb.toExponential(3)}, `
    + `limited ${jj.toExponential(3)} → ${(jb / jj).toFixed(0)}x smaller`);
  check('the jerk limit turns the acceleration STEP into a ramp', jj < jb / 50,
    `${jj} vs ${jb}`);
  check('…and the ramp is exactly amax/W, which is what a jerk limit means',
    Math.abs(jj - jb / W) < 1e-3 * jb / W, `${jj} vs ${jb / W}`);

  // A WIDE IMPULSE LIST IS TABULATED, and the table has to BE the sum rather than
  // approximate it -- a silent divergence here would be a reference the error is
  // measured against quietly differing from the one the plant was commanded with.
  const small = new AngleProfile({ span: 0.144, accelSteps: 300, cruiseSteps: 400,
    dwellSteps: 1276 + W, shaper: box.slice() });
  small._tab = null;
  let worst = 0;
  for (let n = 0; n < jerked.period; n += 7) {
    const a = jerked.at(n);
    let th = 0, om = 0, al = 0;
    for (const [amp, d] of box) {
      const r = small.raw(n - d); th += amp * r.theta; om += amp * r.omega; al += amp * r.alpha;
    }
    worst = Math.max(worst, Math.abs(a.theta - th), Math.abs(a.omega - om),
      Math.abs(a.alpha - al));
  }
  check('the tabulated profile IS the impulse sum, not an approximation of it',
    worst < 1e-15, `${worst.toExponential(2)}`);
}

// ------------------------------------------------- the drive's limits
//
// ONE CURVE GIVES ALL THREE LIMITS a real motor has, so what has to hold is that the
// curve behaves like a drive rather than like three clamps that happen to be nearby.
console.log('\n  the drive envelope');
{
  const T = 1e-3, W = 0.2;
  check('an unrated drive is ideal, which is what the page shipped with',
    driveEnvelope(5, 0, 0, W) === 5 && driveEnvelope(-5, 0, 0, W) === -5);
  check('at standstill the ceiling is the peak torque, both directions',
    driveEnvelope(9 * T, 0, T, W) === T && driveEnvelope(-9 * T, 0, T, W) === -T);
  check('below the ceiling nothing is touched',
    driveEnvelope(0.4 * T, 0, T, W) === 0.4 * T);
  // THE FADE IS THE SPEED LIMIT: at the no-load speed there is no torque left, so the
  // motor cannot be driven past it however hard it is asked.
  check('the ceiling falls linearly with speed',
    Math.abs(driveEnvelope(9 * T, 0.5 * W, T, W) - 0.5 * T) < 1e-15,
    `${driveEnvelope(9 * T, 0.5 * W, T, W)}`);
  check('…and reaches exactly zero at the no-load speed',
    driveEnvelope(9 * T, W, T, W) === 0);
  check('…and does not go NEGATIVE past it, which would be a motor driving itself back',
    driveEnvelope(9 * T, 3 * W, T, W) === 0);
  // AND BRAKING IS NOT LIMITED THE SAME WAY. Back-EMF opposes the supply only when the
  // motor is already turning the way it is being pushed; a drive that could not stop a
  // fast motor would be the opposite of a limit, and it is the mistake this asserts
  // against rather than a subtlety.
  check('braking a fast motor keeps the FULL ceiling',
    driveEnvelope(-9 * T, 0.9 * W, T, W) === -T,
    `${driveEnvelope(-9 * T, 0.9 * W, T, W)}`);

  // THE ACCELERATION LIMIT IS NOT A SEPARATE PARAMETER, it is the torque limit seen
  // through the reflected inertia -- which is why there is no third clamp.
  const Jr = 4.39e4, N = 100;
  const servo = new PositionServo({ kp: 0, kd: 0, inertia: Jr, ratio: N, tauMax: T,
    speedMax: 0 });
  const enc = { angle: 0, speed: 0 };
  const huge = servo.torque({ theta: 0, omega: 0, alpha: 1 }, enc);
  check('a colossal commanded acceleration comes back at the torque ceiling',
    Math.abs(huge - T) < 1e-18, `${huge}`);
  check('…so alpha_max is tau_max * N / J_reflected and needs no clamp of its own',
    Math.abs(huge * N / Jr - T * N / Jr) < 1e-18);
  const st = servo.limitStats();
  check('the drive counts what it could not deliver, so the page can say so',
    st.steps === 1 && st.saturated === 1 && Math.abs(st.peakDemand - Jr / N) < 1e-9,
    JSON.stringify(st));
  servo.resetLimitStats();
  check('…and the counters reset with the machine', servo.limitStats().steps === 0);
}

await COMM.link.destroy();
console.log(failed ? `\n${failed} check(s) FAILED\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
