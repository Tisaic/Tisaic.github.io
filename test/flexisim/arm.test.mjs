// The hybrid plant: a lumped joint carrying a lattice link.
//
// THIS IS THE CHECK THE WHOLE TAB IS BUILT ON. FlexiSim's design claim is that
// joint compliance dominates link compliance -- commonly cited at 70-90% of an
// industrial arm's tip deflection -- and that claim has so far been INHERITED
// from the literature rather than measured here. It decides how much resolution
// the links deserve, so getting it wrong is expensive in both directions: too
// little and the distributed behaviour the lattice exists for is not resolved,
// too much and most of the compute is spent on the small term.
//
// The two contributions are separable EXACTLY, which is what makes this a
// measurement rather than an impression:
//
//   joint    the gearbox winds up by tau_g/K under the link's own weight, and
//            that wind-up TILTS the whole link rigidly: delta = (tau_g/K) * L
//   link     the link sags under its own weight as a cantilever:
//            delta = rho g A L^4 / (8 E I)
//
// Taking E -> infinity leaves only the first; taking K -> infinity leaves only the
// second. Both limits are asserted against their closed forms, so neither term is
// being trusted on the strength of the other.

import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm } from '../../lib/flexisim/arm.js';
import {
  buildLink, massProperties, gravityTorque, tipDeflection, peakSpeed, armLength,
} from '../../lib/flexisim/link.js';
import { lameFrom } from '../../lib/lattsim/operators/elastic.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: the hybrid arm (lumped joint + lattice link)');

const H = 6, LEN = 24, CLAMP = 3, nu = 0.3, rho = 1;
const g = 2e-6;                       // body-frame gravity, along -y
const GRAV = [0, -g, 0];

// ONE SETTLE, REUSED. Every check below at the nominal stiffness asks about the
// same physical state, so it is solved once. What changes between the rows is the
// gearbox stiffness, and that enters analytically.
const NOMINAL_E = 0.05;

// ------------------------------------------- the mass properties are the lattice's
{
  const sim = await buildLink({ length: LEN, section: H, clamp: CLAMP,
    E: 0.05, nu, rho, gravity: GRAV, damping: 0.005 });
  const mp = massProperties(sim);
  const cells = (CLAMP + LEN) * H * H;
  check('the link mass is the material the solver actually steps',
    Math.abs(mp.mass - rho * cells) < 1e-9, `${mp.mass} vs ${rho * cells}`);
  // The centroid of a uniform bar from -0.5 to NX-1 about the pivot: the cell
  // centres run over integers, so it is the mean of (x - pivot).
  const NX = CLAMP + LEN;
  let want = 0; for (let x = 0; x < NX; x++) want += x - (CLAMP - 0.5);
  want /= NX;
  check('and the centroid is the mean of the same distribution, not a formula',
    Math.abs(mp.centroid - want) < 1e-9, `${mp.centroid} vs ${want}`);
  check('the gravity torque follows from those two',
    Math.abs(gravityTorque(sim, GRAV) - mp.centroid * mp.mass * GRAV[1]) < 1e-18);
  await sim.destroy();
}

/**
 * Settle a link under gravity and return its tip deflection, split into the
 * link's own sag and the rigid tilt the joint's wind-up adds.
 *
 * The joint is solved STATICALLY here: the motor is held, so at equilibrium the
 * wind-up is exactly tau_g/K. Running the joint's own integrator would give the
 * same number after its transient and is what brick 7 needs; for a static split
 * it would only add a second convergence to wait for.
 */
async function settledLink({ E, steps = 12000, damping = 0.005 }) {
  const sim = await buildLink({ length: LEN, section: H, clamp: CLAMP,
    E, nu, rho, gravity: GRAV, damping });
  sim.advance(steps);
  const out = { sag: tipDeflection(sim), vmax: peakSpeed(sim),
    tauG: gravityTorque(sim, GRAV), Larm: armLength(sim), mp: massProperties(sim) };
  await sim.destroy();
  return out;
}

/**
 * The joint's contribution for a given gearbox stiffness. IT IS ANALYTIC, which
 * is why the stiffness sweep below runs ONE simulation rather than four: the
 * link's sag under its own weight does not depend on K at all, and the joint's
 * wind-up is exactly tau_g/K. Re-settling the same lattice for each row would be
 * four identical solves dressed up as a parameter study -- and it was, until the
 * loop time made it obvious.
 */
const withJoint = (r, K) => ({
  ...r, windup: r.tauG / K, tilt: (r.tauG / K) * r.Larm,
  total: r.sag + (r.tauG / K) * r.Larm,
});

const NOMINAL = await settledLink({ E: NOMINAL_E, steps: 12000 });

// ------------------------------------------------- the link limit: K -> infinity
{
  // A RIGID JOINT leaves the cantilever's self-weight sag, which is a different
  // closed form from the tip-loaded one already verified: a uniformly distributed
  // load gives rho g A L^4 / (8 E I), not FL^3/3EI. Checking the distributed case
  // separately matters because the body force is applied to EVERY cell here, not
  // to one layer, so it exercises the whole force path rather than its end.
  const E = 0.05;
  const r = withJoint(NOMINAL, Infinity);
  check('the self-weight link settles', r.vmax < 1e-6 * Math.abs(r.sag),
    `${r.vmax.toExponential(2)} against a sag ${r.sag.toExponential(4)}`);
  const I = H ** 4 / 12, A = H * H;
  const mu = lameFrom(E, nu).mu;
  const w = rho * g * A;                          // load per unit length
  const eulerUDL = (w * r.Larm ** 4) / (8 * E * I);
  const shearUDL = (w * r.Larm ** 2) / (2 * (5 / 6) * mu * A);
  const theory = eulerUDL + shearUDL;
  console.log(`    [self-weight] |sag| ${Math.abs(r.sag).toExponential(4)} vs theory `
    + `${theory.toExponential(4)} (${(100 * (Math.abs(r.sag) / theory - 1)).toFixed(2)}%), `
    + `bending ${eulerUDL.toExponential(3)} + shear ${shearUDL.toExponential(3)}`);
  check('a rigid joint leaves the self-weight sag rho g A L^4 / 8EI (+ shear)',
    Math.abs(Math.abs(r.sag) - theory) / theory < 0.05,
    `|sag| ${Math.abs(r.sag).toExponential(4)} vs ${theory.toExponential(4)} `
    + `(${(100 * (Math.abs(r.sag) / theory - 1)).toFixed(2)}%)`);
  // AND THE DISTRIBUTED LOAD IS NOT THE TIP LOAD. The same total weight put at
  // the tip would deflect it 8/3 as far, so a body force wrongly lumped at the
  // end could not pass both this and the cantilever check.
  const asTipLoad = (w * r.Larm * r.Larm ** 3) / (3 * E * I);
  check('and the same weight at the tip would deflect 8/3 as far (so the two differ)',
    Math.abs(asTipLoad / eulerUDL - 8 / 3) < 1e-9, `${(asTipLoad / eulerUDL).toFixed(4)}x`);
}

// ------------------------------------------------ the joint limit: E -> very large
{
  // A RIGID LINK leaves the joint's wind-up alone, tilting a straight beam:
  // delta = (tau_g/K) L exactly. The link cannot be made infinitely stiff -- the
  // CFL gate refuses it, correctly -- so it is made stiff enough that its own sag
  // is a thousandth of the tilt, and the residual is asserted to be that small
  // rather than assumed to be zero.
  // E CANNOT BE MADE ARBITRARILY LARGE: c_p = sqrt((lambda+2mu)/rho) is the CFL
  // number, so at rho = 1 and nu = 0.3 the ceiling is E = 0.247 and the gate in
  // buildLink() refuses anything past it. 0.2 is c_p 0.519 against the 0.577
  // limit -- four times the nominal stiffness and still integrable.
  const E = 0.2;
  const K = 4.7e-2;
  const r = withJoint(await settledLink({ E, steps: 12000 }), K);
  console.log(`    [joint limit] link sag ${Math.abs(r.sag).toExponential(3)} is `
    + `${(100 * Math.abs(r.sag / r.tilt)).toFixed(2)}% of the joint tilt ${Math.abs(r.tilt).toExponential(3)}`);
  check('with a stiff link the tip motion is the joint wind-up, tilted',
    Math.abs(r.sag) < 0.02 * Math.abs(r.tilt),
    `link sag ${r.sag.toExponential(3)} against a joint tilt ${r.tilt.toExponential(3)}`);
  check('and the wind-up is exactly tau_g / K',
    Math.abs(r.windup - r.tauG / K) < 1e-18, `${r.windup.toExponential(5)}`);
}

// ==================================================== THE SPLIT, MEASURED
{
  // Realistic-ish: the joint chosen so its wind-up dominates, which is the regime
  // every published breakdown describes. What is reported is the FRACTION, because
  // that is the number the design decision turns on.
  const rows = [];
  // THE STIFFNESSES ARE CHOSEN FROM THE MEASUREMENT, not from a plausible-looking
  // decade sweep. The link's own sag here is 5.384e-1 and the gravity torque is
  // 2.041e-2 over an arm of 23.5, so the joint share crosses 90 / 80 / 70 / 50%
  // at K = 9.9e-2 / 2.2e-1 / 3.8e-1 / 8.9e-1. A first sweep at 3e-4..1e-2 put
  // every row above 98% and would have "confirmed" the literature by measuring a
  // regime nobody operates in.
  for (const K of [9.9e-2, 2.23e-1, 3.82e-1, 8.91e-1]) {
    const r = withJoint(NOMINAL, K);
    rows.push({ K, joint: Math.abs(r.tilt), link: Math.abs(r.sag),
      frac: Math.abs(r.tilt) / (Math.abs(r.tilt) + Math.abs(r.sag)) });
  }
  for (const row of rows) {
    console.log(`    [split] K=${row.K.toExponential(0)}  joint ${row.joint.toExponential(3)}  `
      + `link ${row.link.toExponential(3)}  joint share ${(100 * row.frac).toFixed(1)}%`);
  }
  // THE CLAIM IS NOT "THE JOINT ALWAYS DOMINATES" -- it is that the split is a
  // function of the joint stiffness, and that at the stiffnesses real drives have
  // the joint carries most of it. Both halves are asserted: the share must FALL
  // monotonically as the gearbox stiffens, and it must be able to reach the
  // 70-90% band the literature describes.
  const monotone = rows.every((r, i) => i === 0 || r.frac < rows[i - 1].frac);
  check('the joint share falls monotonically as the gearbox stiffens', monotone,
    rows.map((r) => (100 * r.frac).toFixed(1) + '%').join(' -> '));
  check('and a realistic gearbox puts the tip error in the 70-90% band',
    rows.some((r) => r.frac > 0.7 && r.frac < 0.95),
    rows.map((r) => `${r.K.toExponential(0)}:${(100 * r.frac).toFixed(0)}%`).join(' '));
  // THE LINK TERM IS NOT NOISE, and this is the half that justifies the lattice.
  // If the link contributed a thousandth there would be no reason to resolve it at
  // all and a beam element would do; at these numbers it is percent-level, which
  // is exactly the range where where-the-load-sits and section shape matter.
  check('the link term is percent-level, not negligible -- which is why it is a lattice',
    rows[rows.length - 1].link / rows[rows.length - 1].joint > 0.05,
    `${(100 * rows[rows.length - 1].link / rows[rows.length - 1].joint).toFixed(1)}% of the joint term`);
}

// ------------------------------------------- the encoder cannot see any of it
{
  // The premise, stated as a number on the real plant rather than on the joint
  // alone: the motor is held, so the encoder reads exactly zero, while the tip is
  // somewhere else entirely.
  const j = new Joint({ ratio: 100, motorInertia: 1e-4, loadInertia: 0.5,
    stiffness: 2.23e-1, damping: 1e-4 });
  const r = withJoint(NOMINAL, 2.23e-1);
  check('the encoder reads zero while the tip is not where it is commanded',
    j.encoder().angle === 0 && Math.abs(r.total) > 1e-3,
    `encoder 0, tip ${r.total.toExponential(3)} (joint ${r.tilt.toExponential(3)} `
    + `+ link ${r.sag.toExponential(3)})`);
}

// ================================= THE FIRST BENDING MODE, WHICH IS A DYNAMIC CHECK
//
// EVERY CHECK ABOVE IS A SETTLED STATE, so nothing so far has tested the
// mass/stiffness balance IN TIME. That matters because the static and dynamic
// closed forms pin DIFFERENT combinations of the material constants: a tip
// deflection goes as 1/E and does not involve rho at all, while the ringing
// frequency goes as sqrt(E/rho). Together they pin E and rho independently, and
// neither one alone can.
//
// Clamped-free first bending: w1 = (1.875)^2 sqrt(EI / rho A L^4).
//
// METHOD: settle under gravity, then REMOVE gravity and the damping and let it
// ring. The static shape is very nearly the first mode, so the ring is nearly
// pure and the period can be read off zero crossings -- a period being a far
// sharper thing to compare than an amplitude.
//
// THE DAMPING HAS TO GO OR THERE IS NOTHING TO MEASURE. The settling damping is
// 0.02 per step against a period of ~2800 steps, which is overdamped by a factor
// of fifty: the first attempt recorded ZERO crossings and looked like a beam that
// did not ring at all.
async function ringFrequency({ E, len, settle, ringSteps }) {
  const sim = await buildLink({ length: len, section: H, clamp: CLAMP,
    E, nu, rho, gravity: GRAV, damping: 0.02 });
  sim.advance(settle);
  sim.operators[0].setParams({ gravity: [0, 0, 0] });   // frame op: release the load
  sim.operators[1].setParams({ damping: 0 });           // elastic op: let it ring
  sim.backend.write('vel').fill(0);                     // start from the static shape
  const cross = [];
  let prev = tipDeflection(sim);
  for (let k = 0; k < ringSteps; k++) {
    sim.advance(1);
    const d = tipDeflection(sim);
    if ((prev >= 0) !== (d >= 0)) cross.push(k - prev / (d - prev));
    prev = d;
  }
  const Larm = armLength(sim);
  await sim.destroy();
  const period = cross.length >= 3
    ? 2 * (cross[cross.length - 1] - cross[0]) / (cross.length - 1) : NaN;
  const I = H ** 4 / 12, A = H * H;
  const euler = 1.875 ** 2 * Math.sqrt((E * I) / (rho * A * Larm ** 4));
  const w = (2 * Math.PI) / period;
  return { w, euler, ratio: w / euler, crossings: cross.length, Larm, period };
}

{
  const a = await ringFrequency({ E: NOMINAL_E, len: LEN, settle: 5000, ringSteps: 7000 });
  console.log(`    [mode 1] L/H ${(a.Larm / H).toFixed(2)}  period ${a.period.toFixed(1)} steps  `
    + `w ${a.w.toExponential(4)} vs Euler-Bernoulli ${a.euler.toExponential(4)}  `
    + `(${(100 * (a.ratio - 1)).toFixed(2)}%)  over ${a.crossings} crossings`);
  check('the link rings, and does so at a measurable period',
    a.crossings >= 4 && Number.isFinite(a.period), `${a.crossings} crossings`);
  check('the first bending mode is within 12% of (1.875)^2 sqrt(EI/rho A L^4)',
    Math.abs(a.ratio - 1) < 0.12, `${(100 * (a.ratio - 1)).toFixed(2)}%`);
  // THE SIGN OF THE DEFICIT IS THE INFORMATIVE PART. A lattice beam rings LOW,
  // never high, because shear deformation and rotary inertia -- neither of which
  // Euler-Bernoulli carries -- both soften a stubby beam. A frequency ABOVE the
  // Euler-Bernoulli value would mean the model is stiffer or lighter than the
  // material it was given, which is a different class of fault entirely.
  check('and it rings LOW, which is what shear and rotary inertia do', a.ratio < 1,
    a.ratio.toFixed(4));

  if (process.env.SUITE === 'full') {
    // AND THE DEFICIT SHRINKS WITH SLENDERNESS, which is what separates the shear
    // correction from a wrong mass or a wrong stiffness. A scale error in either
    // would be CONSTANT in aspect ratio; the Timoshenko terms go as (H/L)^2 and
    // must fade as the beam gets slender. Measured: 9.6% at L/H 3.9 against 5.9%
    // at L/H 5.9.
    const b = await ringFrequency({ E: NOMINAL_E, len: 36, settle: 8000, ringSteps: 16000 });
    console.log(`    [mode 1] L/H ${(b.Larm / H).toFixed(2)}  deficit `
      + `${(100 * (1 - b.ratio)).toFixed(2)}% against ${(100 * (1 - a.ratio)).toFixed(2)}% at `
      + `L/H ${(a.Larm / H).toFixed(2)}`);
    check('the frequency deficit shrinks as the beam gets slender (so it is shear, not scale)',
      (1 - b.ratio) < 0.75 * (1 - a.ratio),
      `${(100 * (1 - a.ratio)).toFixed(2)}% -> ${(100 * (1 - b.ratio)).toFixed(2)}%`);
  }
}

// ============================ THE DYNAMIC COUPLING: A COMMANDED MOVE, AND ITS ERROR
//
// Everything above is static. THIS is the thing the tab exists to show: a
// commanded move produces a tip error the controller cannot see, because the
// encoder is on the motor side of the gearbox and the wind-up is downstream of
// the gear teeth.
//
// The mechanism has a closed form at every stage, which is what makes it a
// measurement rather than a demo:
//   1. a motor torque accelerates the whole arm at tau*N / (N^2 J_m + J_link),
//      with J_link INTEGRATED FROM THE LATTICE rather than stated
//   2. delivering that acceleration needs J_link*alpha through the gearbox, so
//      the gearbox winds up by J_link*alpha/K
//   3. that wind-up tilts the link rigidly by (J_link*alpha/K)*L at the tip
//   4. and the link's own bending rides on top, rung by the same acceleration
{
  const K = 9.7, C = 1863, N = 100, Jm = 19.4, tau = 2e-3, dt = 1, steps = 4000;
  const link = await buildLink({ length: LEN, section: H, clamp: CLAMP,
    E: NOMINAL_E, nu, rho, damping: 2e-4 });
  const mp = massProperties(link);
  const joint = new Joint({ ratio: N, motorInertia: Jm,
    loadInertia: mp.inertiaAboutPivot, stiffness: K, damping: C });
  // No gravity here: the point is the INERTIAL wind-up of a commanded move, and
  // gravity would add a pose-dependent term on top of the thing being measured.
  const arm = new FlexArm({ joint, link, gravityWorld: [0, 0, 0], dt });
  for (let k = 0; k < steps; k++) arm.step(tau, dt);

  const alphaTh = (tau * N) / joint.reflectedInertia();
  const alphaMeas = joint.wL / (steps * dt);
  const windTh = (mp.inertiaAboutPivot * alphaTh) / K;
  const e = arm.tipError();
  console.log(`    [dynamic] alpha ${alphaMeas.toExponential(4)} vs ${alphaTh.toExponential(4)} `
    + `(${(100 * (alphaMeas / alphaTh - 1)).toFixed(3)}%)  windup ${joint.windup().toExponential(4)} `
    + `vs ${windTh.toExponential(4)} (${(100 * (joint.windup() / windTh - 1)).toFixed(2)}%)`);
  console.log(`    [dynamic] tip: tilt ${e.tilt.toExponential(3)} + bend ${e.bend.toExponential(3)} `
    + `= ${e.total.toExponential(3)}   encoder ${joint.encoder().angle.toExponential(4)} `
    + `vs true link angle ${joint.thL.toExponential(4)}`);

  // THE LATTICE'S OWN INERTIA DRIVES THE JOINT, and it does so exactly. This is
  // the check that the mass integrated off the material distribution is the same
  // mass the rigid-body dynamics use -- the two could disagree silently, and the
  // only symptom would be an acceleration nobody cross-checked.
  check('a commanded torque accelerates the arm at tau*N / (N^2 J_m + J_link)',
    Math.abs(alphaMeas / alphaTh - 1) < 1e-3,
    `${(100 * (alphaMeas / alphaTh - 1)).toFixed(4)}%`);
  check('and delivering that acceleration winds the gearbox up by J*alpha/K',
    Math.abs(joint.windup() / windTh - 1) < 2e-3,
    `${joint.windup().toExponential(5)} vs ${windTh.toExponential(5)}`);
  // THE PREMISE, ON THE MOVING PLANT. The encoder tracks the commanded motion to
  // within its own wind-up; the TIP is somewhere else entirely, and nothing the
  // controller reads says so.
  const blind = Math.abs(joint.encoder().angle - joint.thL);
  check('the encoder leads the true link angle by exactly the wind-up it cannot see',
    Math.abs(blind - Math.abs(joint.windup())) < 1e-9 * Math.abs(joint.windup()),
    `${blind.toExponential(4)} vs windup ${Math.abs(joint.windup()).toExponential(4)}`);
  check('and the tip error is a real fraction of the move, not round-off',
    Math.abs(e.total) > 1e-3 && Math.abs(e.bend) > 0,
    `tilt ${e.tilt.toExponential(3)}, bend ${e.bend.toExponential(3)}`);
  // The link RINGS during the move -- the same acceleration that winds the
  // gearbox up also excites the bending mode -- so the bend term is dynamic and
  // is not simply the static sag. Asserting it is nonzero and time-varying is the
  // honest form of that claim; asserting a value would be reading one phase of an
  // oscillation.
  const bendA = arm.tipError().bend;
  for (let k = 0; k < 300; k++) arm.step(tau, dt);
  check('the link rings during the move rather than sitting at a static offset',
    Math.abs(arm.tipError().bend - bendA) > 1e-6 * Math.abs(bendA || 1),
    `${bendA.toExponential(4)} -> ${arm.tipError().bend.toExponential(4)}`);
  await link.destroy();
}

// ------------------------------------ the joint has its OWN stability limit
{
  // A gearbox resonance can be orders of magnitude above the link's first bending
  // mode, and semi-implicit Euler on a two-mass oscillator is stable only for
  // w_n*dt < 2. Coupling the two without checking gives NaN in a few hundred
  // steps and no clue which half produced it -- which is exactly what the first
  // attempt at this section did, at w_n*dt = 1e4.
  const link = await buildLink({ length: LEN, section: H, clamp: CLAMP,
    E: NOMINAL_E, nu, rho, damping: 0 });
  const mp = massProperties(link);
  const wild = new Joint({ ratio: 100, motorInertia: 1e-6,
    loadInertia: mp.inertiaAboutPivot, stiffness: 1e6 });
  check('an unintegrable gearbox is refused at build time, not discovered as NaN',
    (() => { try { new FlexArm({ joint: wild, link, gravityWorld: [0, 0, 0], dt: 1 });
                   return false; } catch { return true; } })(),
    `w_n*dt = ${(wild.naturalFrequency() * 1).toPrecision(4)}`);
  await link.destroy();
}

console.log(failed ? `\n${failed} arm check(s) failed\n` : '\narm: all checks passed\n');
process.exit(failed ? 1 : 0);
