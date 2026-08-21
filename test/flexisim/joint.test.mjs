// The lumped joint against its closed forms. Plain Node, no lattice, no browser
// -- and it runs in milliseconds, which is what lets it be checked on every edit.
//
// VERIFYING THE JOINT ALONE IS THE POINT. FlexiSim's plant is hybrid (lumped
// joints, lattice links) and the whole claim it will make is about how tip error
// SPLITS between the two. That split is only measurable if each side is known to
// be right on its own first -- otherwise a discrepancy has two homes and no way
// to choose between them.

import { Joint, deadZone, stribeck } from '../../lib/flexisim/joint.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: the lumped joint');

// ------------------------------------------------------------- the dead zone
{
  check('the dead zone transmits nothing inside +/-b',
    deadZone(0.4, 0.5) === 0 && deadZone(-0.4, 0.5) === 0);
  check('and is continuous at the edges, not a step',
    Math.abs(deadZone(0.5000001, 0.5)) < 1e-6 && deadZone(0.6, 0.5) === 0.09999999999999998,
    String(deadZone(0.6, 0.5)));
  check('zero backlash is exactly the identity', deadZone(0.37, 0) === 0.37);
}

// ---------------------------------------------------------------- friction
{
  const f = { tauS: 0.9, tauC: 0.55, vs: 0.05, viscous: 0.1 };
  check('friction opposes motion in both directions',
    stribeck(0.5, f) > 0 && stribeck(-0.5, f) < 0
    && Math.abs(stribeck(0.5, f) + stribeck(-0.5, f)) < 1e-12);
  // THE STRIBECK SHAPE IS THE WHOLE POINT: dry friction is HIGHEST just off zero
  // and falls toward Coulomb as speed builds. A model that only has Coulomb is a
  // flat line, and the difference is what makes stick-slip exist at all.
  const slow = Math.abs(stribeck(1e-3, f) - f.viscous * 1e-3);
  const fast = Math.abs(stribeck(1.0, f) - f.viscous * 1.0);
  check('dry friction falls from stiction toward Coulomb as speed builds',
    slow > fast && Math.abs(slow - f.tauS) / f.tauS < 0.05
    && Math.abs(fast - f.tauC) / f.tauC < 0.01,
    `at 1e-3 rad/s ${slow.toFixed(4)} (stiction ${f.tauS}), at 1 rad/s ${fast.toFixed(4)} (Coulomb ${f.tauC})`);
  check('friction is exactly zero at rest', stribeck(0, f) === 0);
}

const base = { ratio: 100, motorInertia: 1e-4, loadInertia: 0.5, stiffness: 4000 };

// ------------------------------------------------------- reflected inertia
{
  // N^2 J_m + J_l, and at N = 100 the motor's 1e-4 presents 1.0 at the output --
  // TWICE the link's own 0.5. A model that drops the N^2 is not slightly off, it
  // is wrong by the factor that dominates.
  const j = new Joint(base);
  check('the drive reflects N^2 J_m to the output',
    Math.abs(j.reflectedInertia() - (1.0 + 0.5)) < 1e-12, String(j.reflectedInertia()));

  // Drive it as ONE rigid body by making the gearbox very stiff, and check the
  // acceleration against tau_out / J_reflected. Measured at the output.
  const stiff = new Joint({ ...base, stiffness: 4e8 });
  const tauCmd = 0.5, dt = 1e-6, n = 20000;
  for (let k = 0; k < n; k++) stiff.step(tauCmd, 0, dt);
  const alphaMeas = stiff.wL / (n * dt);
  const alphaTheory = (tauCmd * base.ratio) / stiff.reflectedInertia();
  check('a torque step accelerates it at tau*N / (N^2 J_m + J_l)',
    Math.abs(alphaMeas - alphaTheory) / alphaTheory < 5e-3,
    `measured ${alphaMeas.toFixed(6)} vs ${alphaTheory.toFixed(6)} rad/s^2`);
  // ...and the same run with the reflected term LEFT OUT would predict this,
  // which is off by a factor of three. Stated so the check visibly has teeth.
  const naive = (tauCmd * base.ratio) / base.loadInertia;
  check('and ignoring the reflected inertia would be wrong by ~3x here',
    Math.abs(naive / alphaTheory - 3) < 0.01, `${(naive / alphaTheory).toFixed(3)}x`);
}

// ------------------------------------------------------ the gearbox resonance
{
  // The undamped two-mass natural frequency, w_n = sqrt(K (1/J_l + 1/(N^2 J_m))).
  // Measured by counting zero crossings of a free ring -- a period, which is a
  // far sharper thing to compare than an amplitude.
  const j = new Joint(base);
  j.reset(0, -0.01);                       // wind the gearbox up and let go
  const dt = 2e-5, n = 400000;
  const cross = [];
  let prev = j.windup();
  for (let k = 0; k < n; k++) {
    j.step(0, 0, dt);
    const w = j.windup();
    if ((prev >= 0) !== (w >= 0)) cross.push((k - prev / (w - prev)) * dt);
    prev = w;
  }
  const measured = cross.length >= 3
    ? (2 * Math.PI) / (2 * ((cross[cross.length - 1] - cross[0]) / (cross.length - 1)))
    : NaN;
  check('the gearbox rings at sqrt(K (1/J_l + 1/(N^2 J_m)))',
    Math.abs(measured - j.naturalFrequency()) / j.naturalFrequency() < 2e-3,
    `measured ${measured.toFixed(4)} vs ${j.naturalFrequency().toFixed(4)} rad/s `
    + `over ${cross.length} crossings`);
  // The load-side-only frequency is what you get by forgetting the motor. At
  // these parameters it is 22% LOW (89.4 against 109.5), which is comfortably
  // outside the 0.2% the check above allows but is not the 73% I first guessed --
  // so the threshold is the measured separation and not a round number.
  const loadOnly = Math.sqrt(base.stiffness / base.loadInertia);
  check('and the load-only formula is visibly different (so the check discriminates)',
    Math.abs(loadOnly - measured) / measured > 0.15,
    `load-only ${loadOnly.toFixed(3)} vs measured ${measured.toFixed(3)}`);
}

// --------------------------------------------------------------- static wind-up
{
  // Hold the motor and hang a load on the link: the gearbox winds up by exactly
  // tau/K, and the ENCODER shows none of it. That is the unobservability this
  // whole tab is built on, stated as a number.
  const j = new Joint({ ...base, damping: 40 });
  const tauLoad = 20;
  const dt = 1e-4;
  for (let k = 0; k < 400000; k++) {
    j.step(0, tauLoad, dt);
    j.thM = 0; j.wM = 0;                   // motor held by its brake
  }
  // SIGN: d = theta_m/N - theta_l, and a POSITIVE load torque drags the link
  // negative until the gearbox pushes back with tau = K d = +tau_load. So the
  // wind-up is +tau/K. Getting this backwards is easy and the magnitude check
  // alone would not have caught it.
  const want = tauLoad / base.stiffness;
  check('a held motor under load winds up by exactly tau/K',
    Math.abs(j.windup() - want) / Math.abs(want) < 2e-3,
    `${j.windup().toExponential(5)} vs ${want.toExponential(5)} rad`);
  check('...and the encoder reports nothing at all',
    j.encoder().angle === 0 && Math.abs(j.truth().angle + want) < 1e-5,
    `encoder ${j.encoder().angle}, true link angle ${j.truth().angle.toExponential(3)}`);
}

// ------------------------------------------------------------ backlash: 2b lost
{
  // LOST MOTION IS EXACTLY 2b, and it is the classic reason a robot's accuracy
  // and repeatability are different numbers: the link does not begin to follow
  // until the motor has crossed the whole dead band.
  //
  // MEASURED KINEMATICALLY, not by driving the thing. The first version applied a
  // 2 N m torque for six seconds, reversed it, and timed how far the encoder
  // travelled before the link turned round -- which measured 9.2e-2 rad against a
  // 2e-3 dead band, because almost all of it was the link DECELERATING from the
  // speed the drive had built up. That is a real property of the plant and it is
  // not the one the closed form is about. Sweeping the motor at a held link angle
  // isolates the dead band itself.
  const b = 1e-3;
  const j = new Joint({ ...base, backlash: b });
  const N = base.ratio;
  let lo = null, hi = null;
  for (let k = -400; k <= 400; k++) {
    const enc = k * (b / 100);                   // encoder angle, load-side units
    j.reset(enc * N, 0);
    if (j.transmitted() === 0) { if (lo === null) lo = enc; hi = enc; }
  }
  const band = hi - lo;
  check('backlash: the transmitted torque is zero over exactly 2b of encoder travel',
    Math.abs(band - 2 * b) / (2 * b) < 0.02,
    `${band.toExponential(4)} vs 2b = ${(2 * b).toExponential(4)}`);
  check('and the dead band is centred on zero wind-up',
    Math.abs(lo + hi) < 1e-9 * b, `[${lo.toExponential(3)}, ${hi.toExponential(3)}]`);

  // ...and it really does free-fly: with the wind-up parked inside the band, the
  // link is subject to NO torque at all, so it holds whatever velocity it had.
  const q = new Joint({ ...base, backlash: b });
  q.reset(0.5 * b * N, 0);
  q.wL = 0.02;
  const before = q.wL;
  for (let k = 0; k < 100; k++) { q.step(0, 0, 1e-6); q.thM = 0.5 * b * N; q.wM = 0; }
  check('inside the dead zone the link free-flies (no torque, so no acceleration)',
    Math.abs(q.wL - before) < 1e-15 && q.transmitted() === 0,
    `${before} -> ${q.wL}`);
}

// --------------------------------------------- progressive stiffness is real
{
  // A harmonic drive is SOFTER near zero torque and stiffens under load, so the
  // secant stiffness tau/d must RISE with load. A constant-K model cannot do this,
  // and it is exactly the sort of constant an identified model gets right and a
  // frozen one does not.
  const j = new Joint({ ...base, stiffening: 30 });
  const secant = (d) => { j.reset(d * base.ratio, 0); return j.transmitted() / d; };
  const k1 = secant(1e-3), k2 = secant(1e-2), k3 = secant(5e-2);
  check('progressive stiffness rises with wind-up',
    k1 < k2 && k2 < k3 && Math.abs(k1 - base.stiffness) / base.stiffness < 0.05,
    `${k1.toFixed(1)} -> ${k2.toFixed(1)} -> ${k3.toFixed(1)} (K0 ${base.stiffness})`);
  check('and a zero stiffening coefficient is exactly linear',
    (() => {
      const q = new Joint(base);
      const s = (d) => { q.reset(d * base.ratio, 0); return q.transmitted() / d; };
      return Math.abs(s(1e-3) - s(5e-2)) < 1e-9;
    })());
}

// ----------------------------------------------------- stiction actually sticks
{
  // A commanded torque BELOW breakaway must move the motor nowhere -- not slowly,
  // nowhere. This is the check that catches an explicit integrator chattering
  // across the friction discontinuity, which looks like creep and is not.
  const j = new Joint({ ...base, friction: { tauS: 0.9, tauC: 0.55, vs: 0.05, viscous: 0.1 } });
  const dt = 1e-4;
  for (let k = 0; k < 100000; k++) j.step(0.5, 0, dt);       // 0.5 < tauS 0.9
  check('a torque below breakaway does not move the motor at all',
    Math.abs(j.encoder().angle) < 1e-6, j.encoder().angle.toExponential(3));
  const k2 = new Joint({ ...base, friction: { tauS: 0.9, tauC: 0.55, vs: 0.05, viscous: 0.1 } });
  for (let k = 0; k < 100000; k++) k2.step(1.5, 0, dt);      // 1.5 > tauS
  check('...and one above it does', Math.abs(k2.encoder().angle) > 1e-3,
    k2.encoder().angle.toExponential(3));
}

console.log(failed ? `\n${failed} joint check(s) failed\n` : '\njoint: all checks passed\n');
process.exit(failed ? 1 : 0);
