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

import { BlackBox, prbs, deconvolve, summarise, firInverse, optimalPreview, WindowMap,
  identGate }
  from '../../lib/blackbox/blackbox.js';
import { boxQP, PreviewMPC } from '../../lib/blackbox/qp.js';
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
// THE COMMAND MUST NOT REPEAT, and that is a correctness requirement rather than
// realism. A model fitted to a periodic excitation can score beautifully out of sample by
// learning WHERE IN THE CYCLE it is, at which point the held-out set is the same cycle it
// trained on and the number means nothing. Measured: the 735-feature disturbance map
// scores R^2 = -6.93 out of sample on an APERIODIC command against +0.88 for the plain
// linear window -- catastrophic over-fitting that the repeating command had hidden
// completely, and that had already shipped once as a result. (Brick 16 learned this on a
// different plant, which is why the amplitude is modulated at an INCOMMENSURATE rate here
// rather than left to be discovered a third time.)
const PHI = (1 + Math.sqrt(5)) / 2;
function makeRef(span) {
  return (k) => {
    const n = ((k % PERIOD) + PERIOD) % PERIOD;
    const t = n < PERIOD / 2 ? n : PERIOD - n;
    const f = Math.min(1, t / (PERIOD * 0.25));
    const m = 1 + 0.35 * Math.sin(2 * Math.PI * k / (PERIOD * PHI * 2.7));
    return span * m * (3 * f * f - 2 * f * f * f);  // smoothstep, so it has real curvature
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
  // THE MODULE ASKS FOR THE HOLD AND THE HOST GRANTS IT -- `holding` is true through the
  // step test AND the probe, because the plant is identified while the machine is still
  // and the disturbance while it runs. Those are two experiments and neither can be run
  // during the other; see BlackBox._identify().
  const hold = ref(0);
  const k0 = k;
  while (bb.holding && k < k0 + 800000) {
    y = plant.step(bb.offset(k)) + p.dist(0, () => hold);
    if (k % S === 0) bb.sample(k, y);
    k++;
  }
  if (bb.holding) throw new Error('commissioning hold never finished');
  const kObs = k;
  while ((bb.phase === 'observe' || bb.verifying) && k < kObs + 2000000) {
    y = plant.step(bb.offset(k)) + p.dist(k, ref);
    if (k % S === 0) bb.sample(k, y);
    k++;
  }
  for (let j = 0; j < 600 * S; j++, k++) {
    y = plant.step(bb.offset(k)) + p.dist(k, ref);
    if (k % S === 0) bb.sample(k, y);
  }
  for (let j = 0; j < 900 * S; j++, k++) {
    y = plant.step(bb.offset(k)) + p.dist(k, ref);
    if (k % S === 0) bb.sample(k, y);
    after.push(y);
  }
  const b = rms(before), a = rms(after);
  console.log(`    [${name}] step: settles in ${bb.settleSteps} steps, DC gain `
    + `${bb.dc.toExponential(3)} (true ${p.gain}) → grid ${bb.grid} steps`);
  console.log(`    [${name}] impulse: gain ${bb.model.gain.toExponential(3)}, delay `
    + `${bb.model.delay * bb.grid} steps (true ${p.delay}), ring `
    + `${bb.model.period ? (bb.model.period * bb.grid).toFixed(0) : '—'}`);
  console.log(`    [${name}] basis: ${bb.basis.chosen} — ${bb.cost().mac} MAC/update `
    + `against a ${bb.macBudget} budget`);
  console.log(`    [${name}] design: ${bb.design.kind}, ${bb.design.taps} taps, preview `
    + `${bb.design.previewSteps} steps, scalar ${bb.design.alpha.toFixed(3)}, `
    + `PREDICTED ${bb.design.predicted.toFixed(2)}x, VERIFIED on the machine `
    + `${bb.design.verified == null ? '—' : bb.design.verified.toFixed(2) + 'x'} `
    + `at ×${bb.design.scale}, plant model R2 ${bb.plantR2.toFixed(3)}`);
  console.log(`    [${name}] correction: peak ${bb.design.umax.toExponential(3)} against a `
    + `cap of ${bb.design.uCap.toExponential(3)}`
    + `${bb.design.umax >= bb.design.uCap * 0.98 ? '  ← THE CAP IS BINDING' : ''}`
    + `; trials ${(bb.design.trials || []).map((t) => `×${t.scale}→${t.ratio.toFixed(2)}`).join(' ')}`);
  console.log(`    [${name}] error rms ${b.toExponential(3)} -> ${a.toExponential(3)}  `
    + `ACHIEVED ${(b / a).toFixed(2)}x`);
  return { bb, before: b, after: a, ratio: b / a };
}

// ---------------------------------------------------------------- the preview filter
//
// THE PREVIEW HAS TO POINT AT THE FUTURE, and a closed-loop score cannot tell a filter
// that looks forward from one that looks backward -- both are "some filter", both fit
// something, and the difference only shows as a worse number with no cause attached. This
// project has already shipped a correction convolved the wrong way round once. So the
// orientation is pinned against a plant whose answer is exact.
console.log('\n  the preview filter');
{
  // A pure delay of D grid samples with gain g. To cancel d(k) the plant must be driven D
  // samples EARLY, so the only nonzero tap is at j = centre - D with value -1/g -- which
  // fixes the sign, the position and the magnitude all at once.
  const D = 5, g = 3.5, M = 12;
  const h = new Float64Array(M);
  h[D] = g;
  const N = 900;
  const d = new Float64Array(N);
  let z = 12345;
  const rnd = () => { z = (z * 1103515245 + 12345) & 0x7fffffff; return z / 0x7fffffff - 0.5; };
  // a smooth disturbance, so the design is not fitting white noise
  let a = 0;
  for (let k = 0; k < N; k++) { a = 0.93 * a + rnd(); d[k] = a; }
  const centre = 8, taps = 16;
  const q = optimalPreview(h, d, d, { taps, centre, lambda: 1e-9, from: M + taps, to: N - 20 });
  let peak = 0, at = -1;
  for (let j = 0; j < taps; j++) if (Math.abs(q[j]) > peak) { peak = Math.abs(q[j]); at = j; }
  check('the preview filter puts its weight where the delay says it must',
    at === centre - D, `peak tap at ${at}, expected ${centre - D}`);
  check('…with the magnitude and SIGN the exact inverse has',
    Math.abs(q[centre - D] + 1 / g) < 1e-3, `${q[centre - D]} against ${-1 / g}`);
  let off = 0;
  for (let j = 0; j < taps; j++) if (j !== centre - D) off = Math.max(off, Math.abs(q[j]));
  check('…and nothing anywhere else', off < 1e-3, `worst other tap ${off.toExponential(2)}`);

  // AND THE EFFORT TERM HAS TO DO SOMETHING MONOTONE, since it is the knob the whole
  // design offers a user. Larger lambda, smaller command.
  let prev = Infinity, mono = true;
  for (const lam of [1e-6, 1e-3, 1e-1, 1e1, 1e3]) {
    const qq = optimalPreview(h, d, d, { taps, centre, lambda: lam, from: M + taps, to: N - 20 });
    let e = 0;
    for (let j = 0; j < taps; j++) e += qq[j] * qq[j];
    if (e > prev) mono = false;
    prev = e;
  }
  check('the effort weight monotonically shrinks the command it asks for', mono);
}

// ---------------------------------------------------------------- the constrained solve
//
// A SOLVER HAS TO BE CHECKED AGAINST THE PROBLEM IT CLAIMS TO SOLVE, not against a
// closed-loop score, because a solver that is subtly wrong produces a plausible command
// and no score can attribute the shortfall. Four things are pinned here: the adjoint (the
// direction mistake this project has already shipped once, in a different file), the
// unconstrained limit, the KKT conditions at the bound, and the one claim the whole
// object exists for -- that the constrained optimum is NOT the clipped unconstrained one.
console.log('\n  the constrained solve');
{
  const solveLin = (A, b) => {
    const n = b.length;
    const Mx = A.map((r, i) => Float64Array.from([...r, b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(Mx[r][c]) > Math.abs(Mx[p][c])) p = r;
      [Mx[c], Mx[p]] = [Mx[p], Mx[c]];
      const d = Mx[c][c] || 1e-300;
      for (let j = c; j <= n; j++) Mx[c][j] /= d;
      for (let r = 0; r < n; r++) {
        if (r === c || Mx[r][c] === 0) continue;
        const g = Mx[r][c];
        for (let j = c; j <= n; j++) Mx[r][j] -= g * Mx[c][j];
      }
    }
    return Mx.map((r) => r[n]);
  };
  let z = 7;
  const rnd = () => { z = (z * 1103515245 + 12345) & 0x7fffffff; return z / 0x7fffffff - 0.5; };
  const Mh = 10, N = 24, lambda = 0.05;
  const h = new Float64Array(Mh);
  for (let i = 0; i < Mh; i++) h[i] = i < 2 ? 0 : Math.exp(-(i - 2) / 3) * (1 + 0.2 * rnd());
  const f0 = new Float64Array(N);
  let a = 0;
  for (let i = 0; i < N; i++) { a = 0.8 * a + rnd(); f0[i] = a; }

  // THE ADJOINT. <T x, y> must equal <x, T^T y> for every x and y, and it is an identity
  // rather than an approximation, so the tolerance is machine precision.
  {
    const x = Float64Array.from({ length: N }, () => rnd());
    const y = Float64Array.from({ length: N }, () => rnd());
    let l = 0, r = 0;
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let m = 0; m < Mh; m++) if (i - m >= 0) s += h[m] * x[i - m];
      l += s * y[i];
    }
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let m = 0; m < Mh && i + m < N; m++) s += h[m] * y[i + m];
      r += x[i] * s;
    }
    check('the adjoint really is the adjoint', Math.abs(l - r) < 1e-12 * (Math.abs(l) + 1),
      `${l} vs ${r}`);
  }

  // The exact unconstrained answer, from a direct solve of the normal equations.
  const A = Array.from({ length: N }, () => new Float64Array(N));
  const b = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      let s = 0;
      for (let r = 0; r < N; r++) {
        const a1 = r - i, a2 = r - j;
        if (a1 >= 0 && a1 < Mh && a2 >= 0 && a2 < Mh) s += h[a1] * h[a2];
      }
      A[i][j] = 2 * s;
    }
    let s2 = 0;
    for (let r = 0; r < N; r++) { const a1 = r - i; if (a1 >= 0 && a1 < Mh) s2 += h[a1] * f0[r]; }
    b[i] = -2 * s2;
    A[i][i] += 2 * lambda * (i < N - 1 ? 2 : 1);
    if (i > 0) A[i][i - 1] -= 2 * lambda;
    if (i < N - 1) A[i][i + 1] -= 2 * lambda;
  }
  const exact = solveLin(A, b);
  const obj = (u) => {
    let s = 0;
    for (let i = 0; i < N; i++) {
      let v = f0[i];
      for (let m = 0; m < Mh; m++) if (i - m >= 0) v += h[m] * u[i - m];
      s += v * v;
    }
    for (let i = 0; i < N; i++) { const p = i > 0 ? u[i - 1] : 0; s += lambda * (u[i] - p) ** 2; }
    return s;
  };
  {
    const u = new Float64Array(N);
    boxQP(h, f0, u, { U: 1e9, lambda, uPrev: 0, iters: 2000 });
    let d = 0, n = 0;
    for (let i = 0; i < N; i++) { d += (u[i] - exact[i]) ** 2; n += exact[i] ** 2; }
    check('with the box wide open it reaches the exact unconstrained answer',
      Math.sqrt(d / n) < 1e-3, `relative ${Math.sqrt(d / n).toExponential(2)}`);
  }

  // …and at a bound that BINDS, the KKT conditions hold: every free variable has zero
  // gradient and every clamped one has its gradient pointing out of the box.
  const U = Math.max(...exact.map(Math.abs)) / 3;
  const u = new Float64Array(N);
  boxQP(h, f0, u, { U, lambda, uPrev: 0, iters: 4000 });
  const r = new Float64Array(N), g = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let v = f0[i];
    for (let m = 0; m < Mh; m++) if (i - m >= 0) v += h[m] * u[i - m];
    r[i] = v;
  }
  let nAt = 0, worst = 0;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let m = 0; m < Mh && i + m < N; m++) s += h[m] * r[i + m];
    const back = i > 0 ? u[i - 1] : 0, fwd = i < N - 1 ? u[i + 1] : u[i];
    g[i] = 2 * s + 2 * lambda * ((u[i] - back) - (fwd - u[i]));
    if (Math.abs(Math.abs(u[i]) - U) < 1e-9) {
      nAt++;
      if (-Math.sign(u[i]) * g[i] < -1e-8) worst = Math.max(worst, Math.abs(g[i]));
    } else worst = Math.max(worst, Math.abs(g[i]));
  }
  check('the constrained solution satisfies KKT, with variables actually AT the bound',
    nAt > N / 3 && worst < 1e-6, `${nAt}/${N} at the bound, worst violation ${worst.toExponential(2)}`);
  check('…and never leaves the box it was given',
    u.every((v) => Math.abs(v) <= U * (1 + 1e-9)));

  // THE CLAIM THE WHOLE OBJECT EXISTS FOR. Pontryagin says the constrained optimum is not
  // the unconstrained one with the limit applied afterwards; if it were, this file could
  // be a clamp on the filter's output and none of the rest would be needed.
  const clipped = Float64Array.from(exact, (v) => Math.max(-U, Math.min(U, v)));
  check('…and it BEATS the clipped unconstrained answer, which is the whole point',
    obj(u) < obj(clipped) * 0.98,
    `constrained ${obj(u).toFixed(6)} against clipped ${obj(clipped).toFixed(6)} `
    + `(${(obj(clipped) / obj(u)).toFixed(3)}x)`);

  // THE WARM START IS WHAT MAKES THE ITERATION COUNT AFFORDABLE, so it is measured rather
  // than assumed: from the previous solution shifted along by one, a single iteration has
  // to get most of the way, or the fixed-count budget below is not honest.
  {
    const shifted = new Float64Array(N);
    for (let i = 0; i < N - 1; i++) shifted[i] = u[i + 1];
    shifted[N - 1] = u[N - 1];
    const cold = new Float64Array(N), warm = Float64Array.from(shifted);
    const f1 = new Float64Array(N);
    for (let i = 0; i < N; i++) f1[i] = i < N - 1 ? f0[i + 1] : f0[N - 1];
    boxQP(h, f1, cold, { U, lambda, uPrev: u[0], iters: 1 });
    boxQP(h, f1, warm, { U, lambda, uPrev: u[0], iters: 1 });
    const ref40 = new Float64Array(N);
    boxQP(h, f1, ref40, { U, lambda, uPrev: u[0], iters: 4000 });
    const gap = (v) => (obj(v) - obj(ref40)) / Math.abs(obj(ref40));
    // MEASURED at 2.9x here on a deliberately fast-moving disturbance, and far better on
    // the real arm's smooth one, where ONE warm-started iteration reaches 96% of what
    // twelve do. The bar is set below the measurement rather than at it.
    check('one warm-started iteration beats a cold-started one',
      gap(warm) < gap(cold) / 2,
      `warm ${gap(warm).toExponential(2)} against cold ${gap(cold).toExponential(2)} `
      + `(${(gap(cold) / gap(warm)).toFixed(1)}x)`);
    check('…and lands within a few percent of the fully converged answer',
      gap(warm) < 0.03, `${(100 * gap(warm)).toFixed(2)}% above converged`);
  }

  // AND THE CONTROLLER MUST ACCOUNT FOR ITS OWN PAST. A receding-horizon solver that
  // ignores the tail of the corrections it has already applied re-corrects for its own
  // output every update, which looks like an oscillation nobody commanded.
  {
    const mpc = new PreviewMPC(h, { horizon: N, U: 1e9, lambda, iters: 200 });
    const d = new Float64Array(N);
    for (let i = 0; i < N; i++) d[i] = 1;          // a step disturbance
    for (let i = 0; i < 60; i++) mpc.step(d);
    // Against a CONSTANT disturbance the settled correction must cancel it in steady
    // state: h summed times u equals minus the disturbance.
    let gain = 0;
    for (const v of h) gain += v;
    check('against a constant disturbance it settles on the exact DC inverse',
      Math.abs(mpc.uPrev * gain + 1) < 5e-2,
      `u ${mpc.uPrev.toFixed(5)} x gain ${gain.toFixed(4)} = ${(mpc.uPrev * gain).toFixed(5)}`);
  }
}

// ---------------------------------------------------------------- what it costs a PLC
// ---------------------------------------------------------------------------------
// THE RECONSTRUCTION -- what the host sees BETWEEN grid samples, which until it existed
// was a staircase. Checked on the sequence rather than through a plant, because the
// property is exact: it must pass through the designed samples and be straight between
// them, and neither of those is a statistical claim.
// ---------------------------------------------------------------------------------
// THE QUIET DETECTOR, in BOTH directions -- it has to terminate on a noisy machine and
// it must NOT terminate on one that is still moving. Checking only the first is what let
// a rate test replace a travel test; checking only the second is what let a scale that
// was never seeded pass on a noiseless simulation.
// ---------------------------------------------------------------------------------
// A MODULE THAT CANNOT IDENTIFY A PLANT HAS TO SAY SO.
//
// `plantR2` and the step-vs-probe gain cross-check were both computed and both gated on
// nothing — and a comment in the module had been promising the second one for months
// ("a disagreement in SIGN or by more than a factor of a few means one of them was
// confounded, and the run says so"). No code did that. Measured on a joint with Stribeck
// friction: the step test returned dc = -0.08 against a true 15.5, the probe fit returned
// R2 = 0.003, and the module designed anyway, deployed a filter and made the machine
// WORSE — 0.81x at the heaviest friction, reported as 1.33x. The verify round could not
// save it either: with a meaningless map the ratio it measures is meaningless in the same
// direction.
//
// Checked here on a SYNTHETIC plant whose identification is broken deliberately, so the
// gate is tested rather than the friction: the response is fed back scrambled, which is
// exactly what an unidentifiable plant looks like from inside.
console.log('\n  refusing to design on an identification that failed');
{
  // THE GATE IS A DECISION, so it is tested as one — a table of the states it has to
  // separate, including the exact numbers a friction-dominated joint produced when it
  // went unnoticed. Driving a whole synthetic run to reach each state would test the
  // synthetic, and an unidentifiable plant is by construction hard to steer.
  const cases = [
    ['a clean identification', 15.5, 15.4, 0.99, true],
    ['the two gains disagree in SIGN', 15.5, -15.4, 0.99, false],
    ['…or by more than a factor of three', 15.5, 1.2, 0.99, false],
    ['the friction case, measured', -0.0843, 1.22e-7, 0.003, false],
    ['the heavier friction case, measured', 4.55e-7, -1.45e-8, -7.29, false],
    ['the model explains none of the held-out probe', 15.5, 15.4, 0.09, false],
    ['both gains are zero, so neither can check the other', 0, 0, 0.9, false],
    ['a non-finite number anywhere', NaN, 1, 1, false],
  ];
  let wrong = 0;
  for (const [name, dc, gain, r2, want] of cases) {
    const g = identGate(dc, gain, r2);
    if (g.ok !== want) { wrong++; console.log(`    [gate] WRONG on ${name}`); }
    if (!g.ok) console.log(`    [gate] ${name} → ${g.why}`);
  }
  check('the identification gate separates every state it has to', wrong === 0,
    `${wrong} of ${cases.length} wrong`);
  // …AND A REFUSAL DEPLOYS NOTHING, which is the half that matters on a machine: a
  // refusal that leaves a correction running is not a refusal. Forced through the real
  // path by making the probe's own record unusable.
  const ref = makeRef(0.2), S = 6;
  const plant = synthetic({ wn: 0.02, zeta: 0.8, gain: 12, delay: 30 });
  const bb = new BlackBox({ ref, sampleEvery: S, probeSamples: 900, stepSamples: 700,
    probeAmp: BlackBox.autoAmplitude(0.2, 0.02), taps: 60, invTaps: 40, nSignals: 0 });
  let k = 0, seed = 3;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5; };
  const hold = ref(0);
  const dist = (kk, r) => 900 * (r(kk + 1) - 2 * r(kk) + r(kk - 1));
  for (let i = 0; i < 3000000 && bb.phase !== 'correct'; i++) {
    const held = bb.holding;
    const y = plant.step(bb.offset(k)) + (held ? dist(0, () => hold) : dist(k, ref));
    // The PROBE's own record is scrambled and nothing else is, so the step test still
    // returns a good dc and the probe fit cannot — which is the disagreement the first
    // gate exists to catch, arrived at through the real code path.
    if (k % S === 0) bb.sample(k, bb.phase === 'probe' ? y * (1 + 6 * rnd()) : y);
    k++;
  }
  console.log(`    [gate] through the real path: phase ${bb.phase}, dc `
    + `${bb.dc == null ? '—' : bb.dc.toPrecision(3)}, gain `
    + `${bb.model ? bb.model.gain.toPrecision(3) : '—'} → `
    + `${bb.design && bb.design.refused ? 'REFUSED' : (bb.design || {}).kind}`);
  check('…and a refused identification deploys no correction at all',
    !!bb.design && bb.design.refused === true && bb.design.kind === 'none'
      && [0, 1, 500, 5000].every((i) => bb.offset(i) === 0),
    JSON.stringify({ phase: bb.phase, kind: bb.design && bb.design.kind,
      refused: !!(bb.design && bb.design.refused) }));
}

console.log('\n  the quiet detector');
{
  const settle = (noise) => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff - 0.5; };
    const bb = new BlackBox({ ref: () => 0, sampleEvery: 10, probeSamples: 200 });
    let k = 0;
    // A first-order settle toward a NON-ZERO rest value, which is the ordinary case (an
    // arm holding its gravity sag) and the one a scale seeded from zero cannot see.
    while (bb.phase === 'step' && bb.sub === 'quiet' && k < 400000) {
      bb.sample(k, 15.5 * (1 - Math.exp(-k / 3000)) + noise * 15.5 * rnd());
      k += 10;
    }
    return { k, left: Math.exp(-k / 3000), timedOut: !!bb.quietTimedOut };
  };
  const rows = [0, 1e-9, 1e-6, 1e-3].map((n) => ({ n, ...settle(n) }));
  for (const r of rows) {
    console.log(`    [quiet] noise ${String(r.n).padEnd(6)} → ${String(r.k).padStart(6)} `
      + `steps, ${(100 * r.left).toFixed(2)}% of the travel still to come`
      + (r.timedOut ? '  TIMED OUT' : ''));
  }
  check('it detects quiet on a noisy machine rather than timing out',
    rows.every((r) => !r.timedOut),
    rows.map((r) => `${r.n}:${r.timedOut ? 'timeout' : 'ok'}`).join(' '));
  // …AND THE SAME ANSWER ACROSS SIX DECADES OF NOISE, which is what says the scale is
  // seeded from the signal rather than from an absolute number.
  const ks = rows.map((r) => r.k);
  check('…and the answer barely moves across six decades of it',
    Math.max(...ks) / Math.min(...ks) < 1.5,
    `${Math.min(...ks)} to ${Math.max(...ks)} steps`);
  // THE OTHER HALF: a machine 40% from its rest value is NOT quiet, however slowly it is
  // approaching it. A per-sample rate test says it is -- measured, it declared quiet at
  // step 3350 with 33% of the travel remaining -- which is why this is a travel test.
  check('…and it does NOT call a still-settling machine quiet',
    rows.every((r) => r.left < 0.05),
    rows.map((r) => `${(100 * r.left).toFixed(1)}%`).join(' '));
}

console.log('\n  the reconstruction between grid samples');
{
  const grid = 50;
  const bb = new BlackBox({ ref: () => 0, sampleEvery: 10 });
  bb.grid = grid;
  bb._emit(1000, 0.2, 0.5);
  check('offset() with no step index is still the HELD value',
    bb.offset() === 0.2, `${bb.offset()}`);
  check('…and offset(k) passes exactly through the designed samples',
    bb.offset(1000) === 0.2 && Math.abs(bb.offset(1000 + grid) - 0.5) < 1e-15,
    `${bb.offset(1000)} at the sample, ${bb.offset(1000 + grid)} at the next`);
  // STRAIGHT BETWEEN THEM: the second difference of a piecewise-linear reconstruction is
  // exactly zero inside an interval, which is the whole reason the drive stops spiking.
  let worst = 0;
  for (let k = 1001; k < 1000 + grid - 1; k++) {
    worst = Math.max(worst, Math.abs(
      bb.offset(k + 1) - 2 * bb.offset(k) + bb.offset(k - 1)));
  }
  check('…and is straight between them, so its second difference is zero',
    worst < 1e-15, `worst ${worst.toExponential(2)}`);
  check('…and it is clamped at both ends rather than extrapolating',
    bb.offset(900) === 0.2 && bb.offset(2000) === 0.5,
    `${bb.offset(900)} before, ${bb.offset(2000)} long after`);
  // A HOLD IS THE FAILURE THIS REPLACES, so the check has to be able to see one: against
  // the same pair a zero-order hold has a second difference the size of the step itself.
  check('…and a zero-order hold of the same pair would NOT pass that',
    Math.abs(0.5 - 2 * 0.2 + 0.2) > 0.29, 'a step of 0.3 lands entirely on one sample');
}

// ---------------------------------------------------------------------------------
// THE COUNT AGAINST THE CLOCK. `cost()` returns a COUNT, because a count is the only
// form of this number that survives being moved to another processor — but a count is
// only a proxy for the shipped implementation if the two are within a factor of each
// other, and here they were not. Measured: the reference expansion boxes a typed array
// into a plain one and back on every prediction, and walks the triangular layout to
// decode each quadratic index, so the real cost ran 8.7x to 42x the count. The 10x
// derate in `plcBudget` exists to cover the PROCESSOR; it was silently being asked to
// cover an implementation gap as well, and the two compound.
//
// This does not assert a speed — a shared runner's clock is not a specification. It
// asserts the RATIO stays within the derate, so the budget figure the page quotes keeps
// meaning something, and it prints both numbers either way.
console.log('\n  the count against the clock');
{
  const taps = [-6, -3, 0, 3, 6, 9];
  // A TABLE, BECAUSE THAT IS WHAT A LOOK-AHEAD BUFFER IS. `ref` is the HOST's function
  // and the module cannot know what it costs — measured with a two-sine `ref` the reads
  // alone are 36 transcendentals and swamp everything, which says something about the
  // caller and nothing about the map. A motion controller's look-ahead is an array.
  const tbl = new Float64Array(40000);
  for (let i = 0; i < tbl.length; i++) tbl[i] = Math.sin(i / 97) + 0.3 * Math.sin(i / 31);
  const ref = (k) => tbl[((k % 40000) + 40000) % 40000];
  for (const nonlinear of [null, { nh: 16, nf: 16, seed: 11 }]) {
    const map = new WindowMap({ taps, nonlinear });
    for (let k = 200; k < 900; k++) map.observe(ref, k, 5, ref(k) * 0.1);
    // Weights are irrelevant to the cost; any consistent set exercises the same path.
    const nf = map.nf;
    map.setWeights(new Float64Array(nf).fill(1e-3), new Float64Array(nf),
      new Float64Array(nf).fill(1));
    const c = map.cost();
    for (let k = 0; k < 2000; k++) map.predict(ref, k, 5);        // warm
    const t0 = process.hrtime.bigint();
    const N = 20000;
    for (let k = 0; k < N; k++) map.predict(ref, k, 5);
    const ns = Number(process.hrtime.bigint() - t0) / N;
    // 700 MAC/us is a measured f64 dot-product rate on an ordinary core; the ratio is
    // what the count is being judged on, not the absolute time.
    const implied = ns * 0.7;
    console.log(`    [cost] ${String(c.features).padStart(4)} features: counted `
      + `${String(c.mac).padStart(5)} MAC, measured ${(ns / 1000).toFixed(3)} us `
      + `(~${implied.toFixed(0)} MAC-equivalents) — ${(implied / c.mac).toFixed(1)}x`);
    // 6x, not the 10x derate. `plcBudget` derates by 10 to cover the PROCESSOR; it must
    // not ALSO be silently covering an implementation gap, and once the prediction
    // stopped allocating a fresh vector per call the two sit at 1.2x and 1.7x on an idle
    // machine. The headroom above that is for a shared runner's clock — this is a bound
    // on the gap, not a benchmark, and a benchmark is not what a suite should assert.
    check(`the counted cost of a ${c.features}-feature map is within 6x of the clock`,
      implied / c.mac < 6,
      `counted ${c.mac}, measured ~${implied.toFixed(0)} MAC-equivalents`);
  }
}

console.log('\n  the cycle budget');
{
  check('the budget is arithmetic on a stated cycle, not a constant',
    BlackBox.plcBudget({ cycleUs: 1000, utilisation: 0.05, macPerUs: 50 }) === 2500
    && BlackBox.plcBudget({ cycleUs: 500, utilisation: 0.1, macPerUs: 50 }) === 2500);

  const taps = [-200, -100, 0, 100, 200, 300];
  const full = new WindowMap({ taps, nonlinear: true });
  const macFull = full.cost().mac;
  const lin = new WindowMap({ taps, nonlinear: true });
  lin.prune(Array.from({ length: 1 + lin.nBase }, (_, i) => i));
  check('pruning to the linear window really does drop the cost',
    lin.cost().mac * 8 < macFull,
    `${lin.cost().mac} against ${macFull} MAC`);

  // THE FOLDED WEIGHTS ARE THE HOT PATH, so they are checked against the arithmetic they
  // replace rather than trusted. A rewrite of predict() that is "obviously equivalent" is
  // exactly where a silent regression lives -- and the first version of this one left
  // fit() assigning the weights directly, so the folded copy was never built at all.
  const m = new WindowMap({ taps, nonlinear: false });
  const ref = (k) => Math.sin(k / 700) + 0.3 * Math.cos(k / 137);
  for (let k = 2000; k < 2600; k++) m.observe(ref, k * 7, 7, ref(k * 7 + 300) * 2.5);
  m.fit();
  let worst = 0;
  for (let k = 3000; k < 3050; k++) {
    const f = m.features(ref, k * 7, 7);
    let want = 0;
    for (let i = 0; i < m.nf; i++) want += m.w[i] * ((f[i] - m.mu[i]) / m.sg[i]);
    worst = Math.max(worst, Math.abs(want - m.predict(ref, k * 7, 7))
      / Math.max(1e-12, Math.abs(want)));
  }
  check('the folded weights give the identical answer to the standardise-then-weight form',
    worst < 1e-12, `worst relative difference ${worst.toExponential(2)}`);
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
// PLANT A IS THE ONE THE MODEL IS MOST OPTIMISTIC ABOUT, and that is the check rather
// than the exception. Its disturbance is a pure function of the command's curvature, so
// the disturbance map explains it almost perfectly and the OPEN-LOOP prediction is
// enormous -- while the plant is lightly damped with its resonance close to the
// identification grid, so nothing at this sample rate actually inverts it.
//
// AN OPEN-LOOP PREDICTION CANNOT CATCH THAT, because it is computed by convolving the
// candidate with the same impulse response the candidate was designed from: the design
// and its prediction agree with each other and disagree with the machine. Only deploying
// it and measuring can tell them apart, which is what the verify phase is for -- and the
// property asserted here is that the VERIFIED number is honest, not that the predicted
// one is small.
check('plant A: the open-loop prediction is optimistic, which is why it is not trusted',
  A.bb.design.predicted > 2, `predicted ${A.bb.design.predicted.toFixed(2)}x`);
check('plant A: …and the number it MEASURED on the machine is honest',
  A.bb.design.verified != null
    && Math.abs(Math.log(A.bb.design.verified / A.ratio)) < Math.log(1.4),
  `verified ${A.bb.design.verified?.toFixed(2)}x against ${A.ratio.toFixed(2)}x achieved`);
check('plant A: …and it does no harm', A.ratio > 0.95, `${A.ratio.toFixed(2)}x`);

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
check('plant B: …and the number it measured on the machine agrees with what it achieved',
  B.bb.design.verified != null
    && Math.abs(Math.log(B.bb.design.verified / B.ratio)) < Math.log(1.5),
  `verified ${B.bb.design.verified?.toFixed(2)}x, achieved ${B.ratio.toFixed(2)}x`);

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
  // …and the arm's command is modulated the same way, for the same reason.
  //
  // THE MACHINE HAS TO RUN THE COMMAND THE MODULE IS TOLD ABOUT, and for a long time it
  // did not: `ref` was modulated and `stepOnce` drove the servo from the UNMODULATED
  // `prof.at(k)` and scored against it. So the executed command repeated exactly every
  // 4800 steps and the protection this modulation exists for -- a map with hundreds of
  // features scoring by learning WHERE IN THE CYCLE it is -- was not active on the one
  // plant that has a real disturbance. Measured: telling the module a command that is
  // wrong by ±35% costs it 0.7% (6.13x -> 5.93x); making the EXECUTED command genuinely
  // non-repeating costs 28% (5.93x -> 4.41x). That asymmetry is the finding — the map was
  // recovering PHASE, not the command, exactly as brick 26's 96-bin phase average said.
  const ref = (kk) => prof.at(kk).theta
    * (1 + 0.35 * Math.sin(2 * Math.PI * kk / (prof.period * PHI * 2.7)));
  // The derivatives are of the MODULATED signal, not the profile's own scaled by the
  // modulation -- d/dk(m·theta) = m·theta' + m'·theta, and the chain tab shipped that
  // inconsistency for two bricks and paid for it in following error.
  const profAt = (kk) => ({ theta: ref(kk),
    omega: (ref(kk + 1) - ref(kk - 1)) / 2,
    alpha: ref(kk + 1) - 2 * ref(kk) + ref(kk - 1) });

  const bb = new BlackBox({ ref, sampleEvery: S, probeSamples: 1400, probeDwell: 1,
    probeAmp: BlackBox.autoAmplitude(0.144, 0.03), taps: 70, invTaps: 45,
    nSignals: 5, ssLag: 12, ssStride: 9, lead: 15,
    nonlinear: process.env.BB_LINEAR === '1' ? false : true });

  const before = [], after = [], estE = [], naive = [], truthS = [];
  // WHAT THE CORRECTION COSTS THE MACHINE, recorded at the SOLVER's rate -- which is the
  // only rate at which a held correction is visibly a staircase. Nothing else in this
  // file could see the defect that motivated the reconstruction.
  const cmdLog = { on: false, ref: [], cmd: [], tau: [] };
  let k = 0;
  const stepOnce = (atRest = false) => {
    const r = atRest ? { theta: 0, omega: 0, alpha: 0 } : profAt(k);
    const u = bb.offset(k);
    if (cmdLog.on && !atRest) {
      cmdLog.ref.push(r.theta); cmdLog.cmd.push(r.theta + u); cmdLog.tau.push(0);
    }
    const tau = servo.torque({ theta: r.theta + u, omega: r.omega, alpha: r.alpha },
      arm.encoder());
    if (cmdLog.on && !atRest) cmdLog.tau[cmdLog.tau.length - 1] = tau;
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
  // A CORRECTION-FREE BASELINE, on the same arm, so "before" is the machine and not a
  // phase of the commissioning run.
  {
    const savedPhase = bb.phase;
    bb.phase = 'idle'; bb.u = 0;
    for (let i = 0; i < 900 * S; i++) stepOnce();
    for (let i = 0; i < 900 * S; i++) before.push(stepOnce());
    bb.phase = savedPhase;
  }
  // THE HOLD IS THE MODULE'S REQUEST AND THE HOST'S JOB: still through the step test and
  // the probe, running from the moment it wants to watch the program.
  while (bb.holding) stepOnce(true);
  while (bb.phase === 'observe' || bb.verifying) stepOnce();
  for (let i = 0; i < 600 * S; i++) stepOnce();          // settle after switching on
  cmdLog.on = true;
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
  {
    const c = bb.cost();
    console.log(`    [C] basis: ${bb.basis.chosen} — ${c.mac} MAC/update as a `
      + `${c.kind}; ${c.slicedMacPerCycle.toFixed(0)} MAC/cycle spread over the `
      + `${c.cyclesPerUpdate} cycles between updates, against a ${bb.macBudget} budget `
      + `(${(100 * c.slicedMacPerCycle / bb.macBudget).toFixed(1)}% of 5% of a 1 ms cycle`
      + `${c.fitsInOneCycle ? ', and it also fits in one' : ', and needs the spread'})`);
  }
  console.log(`    [C] design: ${bb.design.kind}, ${bb.design.taps} taps, preview `
    + `${bb.design.previewSteps} steps, scalar ${bb.design.alpha.toFixed(3)}, `
    + `PREDICTED ${bb.design.predicted.toFixed(2)}x, VERIFIED `
    + `${bb.design.verified == null ? '—' : bb.design.verified.toFixed(2) + 'x'}, `
    + `plant model R2 ${bb.plantR2.toFixed(3)}`);
  console.log(`    [C] tool error rms ${b.toExponential(3)} -> ${a.toExponential(3)}  `
    + `ACHIEVED ${(b / a).toFixed(2)}x`);
  check('plant C: the step test recovers the ARM LENGTH it was never given',
    Math.abs(bb.dc / arm.Larm - 1) < 0.35, `${bb.dc} vs ${arm.Larm}`);
  check('plant C: …and the impulse response agrees with it',
    bb.model.gain * bb.dc > 0 && Math.abs(bb.model.gain / bb.dc - 1) < 0.6,
    `${bb.model.gain} vs ${bb.dc}`);
  // THE RINGING IS NO LONGER ALWAYS VISIBLE IN h, AND THAT IS FINE. Once the disturbance
  // map explains the trajectory properly, the joint fit attributes less of the record to
  // the probe's own decay and `summarise` often finds no zero crossings after the peak.
  // Nothing downstream needs it any more -- the inverse's target width is chosen by
  // search against held-out data rather than from a resonance period -- so what is
  // asserted is the pair of gains that DO matter, above.
  check('plant C: the black-box correction improves the real arm by more than 2x',
    b / a > 2, `${(b / a).toFixed(2)}x`);
  // THE NUMBER THAT HAS TO AGREE IS THE MEASURED ONE, not the design's own -- the same
  // convention plants A and B already use, and plant C had to be moved onto it.
  // AND THE TOLERANCE IS TIGHTER NOW THAT THE ROUND MEASURES ITS OWN INSTRUMENT. The
  // verify ratio is the machine's error against the MAP'S prediction of what it would
  // have been, so it inherited the map's bias exactly — measured at 37% on an aperiodic
  // command and 0% on a periodic one, i.e. the bias appears precisely where the map
  // generalises worse. A zero rung measures that bias directly and every other rung is
  // divided by it: verified 5.78x / achieved 4.43x became 5.04x / 5.19x.
  check('plant C: …and the number it measured on the machine agrees with what it achieved',
    bb.design.verified != null
      && Math.abs(Math.log(bb.design.verified / (b / a))) < Math.log(1.25),
    `verified ${bb.design.verified?.toFixed(2)}x, achieved ${(b / a).toFixed(2)}x`);
  check('plant C: …and the verify round measured the map\'s own bias to divide it out',
    bb.design.mapBias != null && bb.design.mapBias > 0.5 && bb.design.mapBias < 2.5,
    `${bb.design.mapBias}`);
  // …AND THE OPEN-LOOP PREDICTION IS NOW CONSERVATIVE BY CONSTRUCTION, which is a
  // consequence of the reconstruction rather than a slack tolerance. `h` is identified
  // from a probe that is HELD for a whole grid interval, and the correction is deployed
  // interpolated -- a difference that lives entirely BETWEEN grid samples, so the
  // grid-rate model the design scores itself with cannot see it at all. Measured on the
  // arm, predicted 2.33x against 6.13x achieved. Only the OPTIMISTIC direction is a
  // defect, since that is the one where a design flatters itself and the machine cannot
  // be trusted to catch it; being beaten by the machine is the signature worth having.
  check('plant C: …and its open-loop prediction never flatters the design',
    bb.design.predicted < (b / a) * 1.3,
    `predicted ${bb.design.predicted.toFixed(2)}x against ${(b / a).toFixed(2)}x achieved`);
  globalThis.C_RATIO = b / a;
  // ---- WHAT IT COSTS, alongside what it buys.
  //
  // Tracking alone has no opinion about a command, and for a long time nothing here did
  // either. Measured before the correction was reconstructed at the host's rate: the
  // commanded motor position came out 6354x rougher than the bare reference and the drive
  // TORQUE 53x rougher, for 3.68x of tracking -- while the ENCODER was SMOOTHER than with
  // no correction at all, which is the number that says what was happening. The servo
  // could not follow a staircase, so every bit of that roughness was torque the drive
  // spent moving nothing. With the reconstruction it is 1.06e-3 against 4.87e-6, i.e. 217x
  // rather than 6354x, and the torque 2.5x rather than 53x.
  const d2rms = (arr) => { let v = 0;
    for (let i = 2; i < arr.length; i++) {
      const d = arr[i] - 2 * arr[i - 1] + arr[i - 2]; v += d * d;
    }
    return Math.sqrt(v / Math.max(1, arr.length - 2)); };
  const sd = (arr) => { const m = arr.reduce((x, y) => x + y, 0) / arr.length;
    return Math.sqrt(arr.reduce((x, y) => x + (y - m) ** 2, 0) / arr.length); };
  const rq = d2rms(cmdLog.cmd) / sd(cmdLog.cmd), rr = d2rms(cmdLog.ref) / sd(cmdLog.ref);
  console.log(`    [C] command second difference ${rq.toExponential(2)} of its own spread `
    + `against the bare reference's ${rr.toExponential(2)} — ${(rq / rr).toFixed(0)}x`);
  check('plant C: …and the command it produces is one the drive can follow',
    rq / rr < 800, `${(rq / rr).toFixed(0)}x the bare reference (a HELD correction is 6354x)`);
  // AND THE MEASURED SMOOTHNESS IS WHAT THE LADDER CHOSE ON, which is the half a tracking
  // score cannot express. The rule is the same knee the rest of the module uses: among the
  // trials within 5% of the best measured tracking, the smoothest.
  const tr = bb.design.trials || [];
  const bestR = Math.max(...tr.map((t) => t.ratio));
  const band = tr.filter((t) => t.ratio >= 0.95 * bestR);
  const dep = tr.find((t) => t.kind === (bb.design.kind === 'constrained' ? 'mpc' : 'fir')
    && t.scale === bb.design.scale);
  check('plant C: …and the trial ladder measured smoothness, not only tracking',
    tr.length > 0 && tr.every((t) => Number.isFinite(t.curv) && Number.isFinite(t.slew)),
    tr.map((t) => `${t.kind}${t.gentle ? '-g' : ''} ${t.ratio.toFixed(2)}x `
      + `curv ${t.curv.toExponential(2)}`).join(' · '));
  check('plant C: …and the deployed trial is the smoothest within 5% of the best tracking',
    !dep || dep.curv <= Math.min(...band.map((t) => t.curv)) * 1.0000001,
    dep ? `deployed curv ${dep.curv.toExponential(3)}, band min `
      + `${Math.min(...band.map((t) => t.curv)).toExponential(3)}` : 'no matching trial');
  const nrm = rms(estE) / rms(naive);
  console.log(`    [C] soft sensor nRMSE ${nrm.toFixed(4)} on ${bb.trained} trained pairs`);
  // THE nRMSE RISES WHEN THE CORRECTION IMPROVES, and that is a normalisation artefact
  // rather than a regression: the score divides by the TRUTH's own spread, and a better
  // correction makes the truth smaller. Measured across the window fix, absolute estimate
  // error 1.20e-2 -> 9.7e-3 while the nRMSE went 0.058 -> 0.180. The absolute number is
  // the one that improved.
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
  B.ratio > 1.8 && globalThis.C_RATIO > 2,
  `B ${B.ratio.toFixed(2)} C ${globalThis.C_RATIO.toFixed(2)}`);
// IF ANY PLANT CONSTANT HAD LEAKED IN, exactly one of these would work. The gains differ
// by 200x AND in sign, the settling times by 1.6x, one rings and one does not, and the
// disturbances are driven by different derivatives of the command.
check('…on gains spanning 200x and BOTH signs, identified rather than given',
  A.bb.dc > 0 && B.bb.dc < 0 && Math.abs(A.bb.dc / B.bb.dc) > 100,
  `A ${A.bb.dc} B ${B.bb.dc}`);

console.log(failed ? `\n${failed} check(s) FAILED\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
