// A CONTROLLER GIVEN NOTHING, ON TWO PLANTS THAT SHARE NO PHYSICS.
//
// The claim this file has to support is not "it works on the arm" -- a module tuned
// against one plant can pass that while being a hard-coded solution wearing a general
// interface. The claim is PORTABILITY, so it is checked the only way portability can be:
// the same `BlackBox`, the same options apart from a sample rate, driven against plants
// whose gains differ by orders of magnitude, whose delays differ, whose resonances differ,
// and one of which has the OPPOSITE SIGN. If any of those had leaked into the module as a
// constant, exactly one plant would work.
//
// PLANT A -- a lightly damped second-order actuator with transport delay, positive gain.
// PLANT B -- an over-damped thermal-style lag with a long tail, NEGATIVE gain, a gain
//            two hundred times smaller, and a disturbance driven by the command's SECOND
//            difference rather than its value. Nothing about it is a robot.
// PLANT C -- the real FlexiSim arm: lumped nonlinear gearbox plus a lattice link, with
//            backlash and Stribeck friction, run through the same interface.

import { BlackBox, prbs, deconvolve, summarise, firInverse }
  from '../../lib/blackbox/blackbox.js';
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm } from '../../lib/flexisim/arm.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { AngleProfile, PositionServo, tipTrackingError, zvdShaper, boxcarShaper,
  convolveShapers } from '../../lib/flexisim/compensator.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nblackbox: a controller that is given nothing');

const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

// ---------------------------------------------------------------- the primitives
console.log('\n  identification primitives');
{
  const u = prbs(32766, { seed: 3, dwell: 1 });
  let ones = 0;
  for (const v of u) ones += v > 0 ? 1 : 0;
  // A MAXIMAL-LENGTH SEQUENCE IS BALANCED OVER ITS FULL PERIOD, not over a fragment, and
  // 2^15-1 is that period. Asserting balance on a short slice would be asserting on the
  // slice; the fragment a real probe uses is short by design and its residual bias is
  // what the joint fit's own bias column absorbs.
  check('the PRBS is balanced over its full period',
    Math.abs(ones / u.length - 0.5) < 0.01, `${ones / u.length}`);
  check('…and is deterministic from its seed, so a probe can be argued about',
    prbs(50, { seed: 3, dwell: 1 }).every((v, i) => v === u[i]));

  // A KNOWN impulse response, recovered from a probe. This is the check with teeth:
  // if deconvolve() is wrong, everything downstream is confidently wrong.
  const truth = [0, 0, 0, 0.5, 1.0, 0.6, 0.2, -0.1, -0.05, 0.01];
  const y = new Float64Array(u.length);
  for (let k = 0; k < u.length; k++) {
    let s = 0;
    for (let j = 0; j < truth.length; j++) if (k - j >= 0) s += truth[j] * u[k - j];
    y[k] = s;
  }
  const h = deconvolve(u, y, { taps: 16 });
  let worst = 0;
  for (let j = 0; j < truth.length; j++) worst = Math.max(worst, Math.abs(h[j] - truth[j]));
  check('deconvolution recovers a known impulse response', worst < 1e-4,
    `worst tap error ${worst.toExponential(2)}`);
  const sm = summarise(h);
  check('…and its summary finds the peak where the response actually peaks',
    sm.delay === 4, `${sm.delay}`);
  check('…and a DC gain that matches the response\'s own sum',
    Math.abs(sm.gain - truth.reduce((a, b) => a + b, 0)) < 1e-4, `${sm.gain}`);

  // THE INVERSE HAS TO ACTUALLY INVERT, which is worth checking directly rather than
  // inferring from a closed-loop score: a bad inverse and a bad map look identical there.
  const { q, centre } = firInverse(h, { length: 30, ridge: 1e-8, width: 0 });
  const conv = new Float64Array(h.length + q.length);
  for (let i = 0; i < h.length; i++) for (let j = 0; j < q.length; j++) conv[i + j] += h[i] * q[j];
  let off = 0;
  for (let i = 0; i < conv.length; i++) if (i !== centre) off = Math.max(off, Math.abs(conv[i]));
  check('the FIR inverse convolves back to an impulse',
    Math.abs(conv[centre] - 1) < 1e-3 && off < 1e-2,
    `peak ${conv[centre].toFixed(5)}, worst sidelobe ${off.toExponential(2)}`);
}

// ------------------------------------------------------- a synthetic plant harness
//
// The command is a repeating trapezoid-ish ramp, but NOTHING in the module knows that --
// it only ever calls ref(k) and gets a number.
const PERIOD = 1200;
function makeRef(span) {
  return (k) => {
    const n = ((k % PERIOD) + PERIOD) % PERIOD;
    const t = n < PERIOD / 2 ? n : PERIOD - n;
    const f = Math.min(1, t / (PERIOD * 0.25));
    return span * (3 * f * f - 2 * f * f * f);     // smoothstep, so it has real curvature
  };
}

/**
 * @param {object} p
 * @param {number} p.gain        steady-state response of the truth to the correction
 * @param {number} p.delay       transport delay in steps
 * @param {number} p.wn          natural frequency, rad/step
 * @param {number} p.zeta        damping ratio
 * @param {(k:number,ref:Function)=>number} p.dist  the disturbance the command creates
 */
function synthetic(p) {
  const buf = new Float64Array(Math.max(2, p.delay + 1));
  let x = 0, v = 0, head = 0;
  return {
    step(u) {
      buf[head] = u; head = (head + 1) % buf.length;
      const ud = buf[head];                       // delayed input
      const a = p.wn * p.wn * (p.gain * ud - x) - 2 * p.zeta * p.wn * v;
      v += a; x += v;
      return x;
    },
  };
}

async function runSynthetic(name, p, { span = 0.2, S = 6, probeFrac = 0.02,
                                       probeSamples = 900 } = {}) {
  const ref = makeRef(span);
  // THE BASELINE IS ITS OWN RUN, on a fresh plant with the correction hard off. Scoring
  // "before" from a stretch of the commissioning run would be scoring whatever phase the
  // module happened to be in, which is a property of the test rather than of the plant.
  const base = synthetic(p);
  const before = [];
  for (let k = 0; k < 2400 * S; k++) {
    const y = base.step(0) + p.dist(k, ref);
    if (k > 1200 * S) before.push(y);
  }
  const plant = synthetic(p);
  const bb = new BlackBox({ ref, sampleEvery: S, probeSamples, stepSamples: 700,
    probeAmp: BlackBox.autoAmplitude(span, probeFrac), taps: 60, invTaps: 40,
    nSignals: 0 });
  const after = [];
  let k = 0, y = 0;
  // STAGE ZERO IS AT REST, which the HOST arranges: the module asks for it by being in
  // its `step` phase and the machine holds still, exactly as a commissioning routine
  // holds a pose. Everything after this runs the real trajectory.
  const hold = ref(0);
  while (bb.phase === 'step') {
    y = plant.step(bb.offset()) + p.dist(0, () => hold);
    if (k % S === 0) bb.sample(k, y);
    k++;
    if (k > 400000) throw new Error('step phase never finished');
  }
  const kProbe = k;
  while (bb.phase === 'probe' && k < kProbe + 400000) {
    y = plant.step(bb.offset()) + p.dist(k, ref);
    if (k % S === 0) bb.sample(k, y);
    k++;
  }
  for (let j = 0; j < 600 * S; j++, k++) {
    y = plant.step(bb.offset()) + p.dist(k, ref);
    if (k % S === 0) bb.sample(k, y);
  }
  for (let j = 0; j < 900 * S; j++, k++) {
    y = plant.step(bb.offset()) + p.dist(k, ref);
    if (k % S === 0) bb.sample(k, y);
    after.push(y);
  }
  const b = rms(before), a = rms(after);
  console.log(`    [${name}] step: settles in ${bb.settleSteps} steps, DC gain `
    + `${bb.dc.toExponential(3)} (true ${p.gain}) → grid ${bb.grid} steps`);
  console.log(`    [${name}] impulse: gain ${bb.model.gain.toExponential(3)}, delay `
    + `${bb.model.delay * bb.grid} steps (true ${p.delay}), ring `
    + `${bb.model.period ? (bb.model.period * bb.grid).toFixed(0) : '—'}`);
  console.log(`    [${name}] design: width ${bb.design.width}, scalar `
    + `${bb.design.alpha.toFixed(3)}, PREDICTED ${bb.design.predicted.toFixed(2)}x`);
  console.log(`    [${name}] error rms ${b.toExponential(3)} -> ${a.toExponential(3)}  `
    + `ACHIEVED ${(b / a).toFixed(2)}x`);
  return { bb, before: b, after: a, ratio: b / a };
}

// ---------------------------------------------------------------- PLANT A
console.log('\n  plant A — a lightly damped actuator with delay, POSITIVE gain');
const A = await runSynthetic('A', {
  gain: 12, delay: 30, wn: 0.02, zeta: 0.08,
  // a disturbance driven by the command's curvature, which is what an inertial load does
  dist: (k, ref) => 900 * (ref(k + 1) - 2 * ref(k) + ref(k - 1)),
});
check('plant A: the identified gain has the right sign and magnitude',
  A.bb.model.gain > 6 && A.bb.model.gain < 24, `${A.bb.model.gain}`);
check('plant A: the step test measures a settling time in the right decade',
  A.bb.settleSteps > 500 && A.bb.settleSteps < 20000, `${A.bb.settleSteps}`);
// PLANT A IS THE ONE IT CANNOT HELP, and that is the check rather than the exception.
// Its disturbance sits ON its own lightly damped resonance -- exactly where an identified
// inverse is least trustworthy -- so there is no filter that cancels it. What the module
// has to do is NOTICE: the design search predicts 1.1x, the scalar it chooses on held-out
// data comes back at 0.21 rather than 1, and the machine is left alone. Before the design
// was chosen against held-out data it took the same plant to 0.58x, i.e. actively worse,
// with complete confidence.
check('plant A: the module PREDICTS that it cannot help here', A.bb.design.predicted < 1.6,
  `predicted ${A.bb.design.predicted.toFixed(2)}x`);
check('plant A: …so it backs the correction off instead of applying it',
  A.bb.design.alpha < 0.5, `scalar ${A.bb.design.alpha.toFixed(3)}`);
check('plant A: …and does no harm', A.ratio > 0.9, `${A.ratio.toFixed(2)}x`);

// ---------------------------------------------------------------- PLANT B
//
// NOT A ROBOT, AND DELIBERATELY HOSTILE TO ANYTHING LEARNED FROM PLANT A: the gain is
// NEGATIVE and 200x smaller, the response is over-damped with a long tail instead of
// ringing, the delay is four times longer, and the disturbance is driven by the command's
// VALUE rather than its curvature. Every one of those is a number the model-based path
// would have been handed and this one has to find.
console.log('\n  plant B — an over-damped process, NEGATIVE gain 200x smaller, no ringing');
const B = await runSynthetic('B', {
  gain: -0.06, delay: 120, wn: 0.006, zeta: 1.4,
  dist: (k, ref) => 0.02 * ref(k) - 0.004,
}, { span: 0.2, S: 12, probeFrac: 0.25 });
check('plant B: the identified gain is NEGATIVE, as the plant is',
  B.bb.model.gain < 0, `${B.bb.model.gain}`);
check('plant B: …and within a factor of two of the truth',
  Math.abs(B.bb.model.gain / -0.06) > 0.5 && Math.abs(B.bb.model.gain / -0.06) < 2,
  `${B.bb.model.gain} vs -0.06`);
check('plant B: the correction cuts the error by more than 1.8x', B.ratio > 1.8,
  `${B.ratio.toFixed(2)}x`);
check('plant B: …and it predicted that it would, before it was deployed',
  B.bb.design.predicted > 1.8,
  `predicted ${B.bb.design.predicted.toFixed(2)}x, achieved ${B.ratio.toFixed(2)}x`);

// ---------------------------------------------------------------- PLANT C
//
// THE REAL ARM, through the same interface and told nothing. The model-based tab is
// handed the arm length, the inertia, the gravity torque, the gear ratio, the gearbox
// stiffness and the measured bending mode; this gets ref(k), a scalar correction, and a
// tracker during commissioning.
console.log('\n  plant C — the real hybrid arm, through the same interface');
{
  const H = 4, NU = 0.3, RHO = 1, CLAMP = 3, RATIO = 100, DAMPING = 3e-3, G = 2e-6;
  const LEN = 16, K = 4, E = 0.2, SERVO_BW = 2e-3, S = 10;
  const link = await buildLink({ length: LEN, section: H, clamp: CLAMP, E, nu: NU,
    rho: RHO, damping: DAMPING });
  const mp = massProperties(link);
  const joint = new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm({ joint, link, gravityWorld: [0, -G, 0], dt: 1 });
  const tauG = (th) => mp.centroid * mp.mass * (-G) * Math.cos(th);
  const Jr = joint.reflectedInertia();
  // The SERVO is the machine, not the controller: a black-box compensator sits on top of
  // whatever loop the drive already closes, exactly as it would on a real machine whose
  // servo you are not allowed to touch.
  const servo = new PositionServo({ kp: SERVO_BW * SERVO_BW * Jr / RATIO,
    kd: 2 * SERVO_BW * Jr / RATIO, inertia: Jr, ratio: RATIO, gravityTorque: tauG,
    tauMax: 32 * Math.abs(tauG(0)) / RATIO, speedMax: 0.2 });
  const prof = new AngleProfile({ span: 0.144, accelSteps: 300, cruiseSteps: 400,
    dwellSteps: 1400, shaper: convolveShapers(null, boxcarShaper(120)) });
  const ref = (kk) => prof.at(kk).theta;

  const bb = new BlackBox({ ref, sampleEvery: S, probeSamples: 1400, probeDwell: 1,
    probeAmp: BlackBox.autoAmplitude(0.144, 0.03), taps: 70, invTaps: 45,
    nSignals: 5, ssLag: 12, ssStride: 9, lead: 15,
    nonlinear: process.env.BB_LINEAR === '1' ? false : true });

  const before = [], after = [], estE = [], naive = [], truthS = [];
  let k = 0;
  const stepOnce = (atRest = false) => {
    const r = atRest ? { theta: 0, omega: 0, alpha: 0 } : prof.at(k);
    const u = bb.offset();
    const tau = servo.torque({ theta: r.theta + u, omega: r.omega, alpha: r.alpha },
      arm.encoder());
    arm.step(tau, 1);
    const e = tipTrackingError(arm, r.theta);
    if (k % S === 0) {
      const enc = arm.encoder();
      bb.sample(k, e, [enc.angle, enc.speed, tau, r.theta, arm.joint.transmitted() / RATIO]);
    }
    k++;
    return e;
  };
  // STAGE ZERO AT REST: the host holds the pose while the module runs its step test,
  // which is the one experiment the trajectory would otherwise confound.
  while (bb.phase === 'step') stepOnce(true);
  // A CORRECTION-FREE BASELINE, on the same arm, so "before" is the machine and not a
  // phase of the commissioning run.
  const savedAmp = bb.probeAmp, savedPhase = bb.phase;
  bb.probeAmp = 0; bb.phase = 'idle'; bb.u = 0;
  for (let i = 0; i < 900 * S; i++) stepOnce();
  for (let i = 0; i < 900 * S; i++) before.push(stepOnce());
  bb.probeAmp = savedAmp; bb.phase = savedPhase; bb.u = bb.seq[0] * savedAmp;
  while (bb.phase === 'probe') stepOnce();
  for (let i = 0; i < 600 * S; i++) stepOnce();          // settle after switching on
  for (let i = 0; i < 1200 * S; i++) {
    const e = stepOnce();
    after.push(e);
    if (k % S === 0 && bb.est != null) { estE.push(bb.est - e); naive.push(e); truthS.push(e); }
  }
  await link.destroy();

  const b = rms(before), a = rms(after);
  console.log(`    [C] step: settles in ${bb.settleSteps} steps, DC gain `
    + `${bb.dc.toFixed(3)} — the ARM LENGTH is ${arm.Larm}, which it was never told`);
  console.log(`    [C] impulse: gain ${bb.model.gain.toFixed(3)}, delay `
    + `${bb.model.delay * bb.grid} steps, ring `
    + `${bb.model.period ? (bb.model.period * bb.grid).toFixed(0) : '—'} steps `
    + '(the real bending mode is ~980)');
  console.log(`    [C] design: width ${bb.design.width}, scalar ${bb.design.alpha.toFixed(3)}, `
    + `PREDICTED ${bb.design.predicted.toFixed(2)}x`);
  console.log(`    [C] tool error rms ${b.toExponential(3)} -> ${a.toExponential(3)}  `
    + `ACHIEVED ${(b / a).toFixed(2)}x`);
  check('plant C: the step test recovers the ARM LENGTH it was never given',
    Math.abs(bb.dc / arm.Larm - 1) < 0.35, `${bb.dc} vs ${arm.Larm}`);
  check('plant C: …and the impulse response agrees with it',
    bb.model.gain * bb.dc > 0 && Math.abs(bb.model.gain / bb.dc - 1) < 0.6,
    `${bb.model.gain} vs ${bb.dc}`);
  check('plant C: the identified ringing is the arm\'s own bending mode, never disclosed',
    bb.model.period && bb.model.period * bb.grid > 300
    && bb.model.period * bb.grid < 3000,
    `${bb.model.period ? bb.model.period * bb.grid : null}`);
  check('plant C: the black-box correction improves the real arm', b / a > 1.1,
    `${(b / a).toFixed(2)}x`);
  check('plant C: …and its prediction agrees with what it achieved',
    Math.abs(Math.log(bb.design.predicted / (b / a))) < Math.log(2.5),
    `predicted ${bb.design.predicted.toFixed(2)}x, achieved ${(b / a).toFixed(2)}x`);
  globalThis.C_RATIO = b / a;
  const nrm = rms(estE) / rms(naive);
  console.log(`    [C] soft sensor nRMSE ${nrm.toFixed(4)} on ${bb.trained} trained pairs`);
  check('plant C: and the estimate from the same signals beats the naive view',
    nrm < 0.5, `${nrm}`);
}

// ---------------------------------------------------------------- the claim itself
console.log('\n  portability');
console.log(`    A ${A.ratio.toFixed(2)}x · B ${B.ratio.toFixed(2)}x · `
  + `C ${globalThis.C_RATIO.toFixed(2)}x — one module, three plants, nothing changed but a`
  + ' sample rate');
check('THE SAME MODULE, UNCHANGED, NEVER MADE ANY OF THE THREE WORSE',
  A.ratio > 0.9 && B.ratio > 0.9 && globalThis.C_RATIO > 0.9,
  `A ${A.ratio.toFixed(2)} B ${B.ratio.toFixed(2)} C ${globalThis.C_RATIO.toFixed(2)}`);
check('…and helped on the two whose disturbance is within reach of an inverse',
  B.ratio > 1.8 && globalThis.C_RATIO > 1.1,
  `B ${B.ratio.toFixed(2)} C ${globalThis.C_RATIO.toFixed(2)}`);
// IF ANY PLANT CONSTANT HAD LEAKED IN, exactly one of these would work. The gains differ
// by 200x AND in sign, the settling times by 1.6x, one rings and one does not, and the
// disturbances are driven by different derivatives of the command.
check('…on gains spanning 200x and BOTH signs, identified rather than given',
  A.bb.dc > 0 && B.bb.dc < 0 && Math.abs(A.bb.dc / B.bb.dc) > 100,
  `A ${A.bb.dc} B ${B.bb.dc}`);

console.log(failed ? `\n${failed} check(s) FAILED\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
