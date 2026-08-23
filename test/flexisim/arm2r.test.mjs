// THE TWO-LINK ARM: the first thing on this tab that is actually a chain.
//
// A chain is not two single-joint arms next to each other, and the three terms
// that appear here are exactly the ones a per-joint model cannot represent: an
// inertia that depends on the elbow angle, a coupling that loads joint 2 when
// joint 1 accelerates, and a second body frame whose ORIGIN accelerates as well as
// rotating. Each is checked against a closed form, and where a closed form is not
// available the check is a CONSERVATION LAW -- which is better, because it is not
// anything the solver computes.

import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import {
  buildLink, massProperties, armLength, peakSpeed,
} from '../../lib/flexisim/link.js';
import { Simulation } from '../../lib/lattsim/simulation.js';
import { CELL, region } from '../../lib/lattsim/materials.js';
import { ElasticSolidOperator } from '../../lib/lattsim/operators/elastic.js';
import { NonInertialFrameOperator } from '../../lib/lattsim/operators/frame.js';

const FULL = process.env.SUITE === 'full';
let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: the two-link arm');

const H = 4, E = 0.05, nu = 0.3, rho = 1, K = 4.0;
const LEN1 = 14, LEN2 = 10, CLAMP = 3;

async function makeArm({ gravityWorld = [0, 0, 0], damping = 3e-3 } = {}) {
  const link1 = await buildLink({ length: LEN1, section: H, clamp: CLAMP, E, nu, rho, damping });
  const link2 = await buildLink({ length: LEN2, section: H, clamp: CLAMP, E, nu, rho, damping });
  const mk = (mp) => new Joint({ ratio: 100, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({
    joint1: mk(massProperties(link1)), link1,
    joint2: mk(massProperties(link2)), link2, gravityWorld, dt: 1 });
  return arm;
}

const arm = await makeArm();
console.log(`    ${arm.describe()}`);

// ============================================ THE INERTIA IS THE CONFIGURATION
{
  const M0 = arm.massMatrix(0), Mp = arm.massMatrix(Math.PI), Mh = arm.massMatrix(Math.PI / 2);
  console.log(`    [inertia] M11 folded ${Mp[0][0].toPrecision(5)} → straight `
    + `${M0[0][0].toPrecision(5)} (${(M0[0][0] / Mp[0][0]).toFixed(2)}x)   `
    + `M12 ${Mp[0][1].toPrecision(4)} / ${Mh[0][1].toPrecision(4)} / ${M0[0][1].toPrecision(4)}`);
  check('the mass matrix is symmetric, as a kinetic-energy quadratic form must be',
    M0[0][1] === M0[1][0] && Mh[0][1] === Mh[1][0], `${M0[0][1]} ${M0[1][0]}`);
  // A HAND-WRITTEN CROSS-CHECK of the assembly. It is the same physics but a
  // different arrangement of it, which is what catches a transposed term.
  const { mass: m2, centroid: c2, inertiaAboutPivot: J2 } = massProperties(arm.l2);
  const J1 = massProperties(arm.l1).inertiaAboutPivot, L1 = armLength(arm.l1);
  for (const q2 of [0, 0.7, Math.PI / 2, 2.4, Math.PI]) {
    const M = arm.massMatrix(q2);
    const m11 = J1 + J2 + m2 * L1 * L1 + 2 * m2 * L1 * c2 * Math.cos(q2);
    const m12 = J2 + m2 * L1 * c2 * Math.cos(q2);
    check(`M(q2=${q2.toFixed(2)}) matches the closed form`,
      Math.abs(M[0][0] / m11 - 1) < 1e-12 && Math.abs(M[0][1] / m12 - 1) < 1e-12,
      `${M[0][0]} vs ${m11}, ${M[0][1]} vs ${m12}`);
  }
  // THE POINT OF ALL OF IT: the inertia the shoulder must accelerate changes by a
  // large factor as the elbow folds, so a controller tuned at one pose is mistuned
  // at another. A single-joint model has no way to express that at all.
  check('the shoulder inertia changes by more than 2x across the elbow range',
    M0[0][0] / Mp[0][0] > 2, `${(M0[0][0] / Mp[0][0]).toFixed(3)}x`);
}

// ================================== CONSERVATION: WHAT THE SOLVER DOES NOT COMPUTE
//
// With no gravity and no joint torques the arm is a closed conservative system.
// Two things are then constants of the motion and NEITHER is anything the solve
// evaluates, so both are real checks: the energy, and the momentum conjugate to q1
// (which is conserved because q1 is a cyclic coordinate -- the Lagrangian depends
// on the elbow angle and not on where the whole arm is pointing).
{
  const dt = 0.05, N = 20000;
  arm.setPose(0.3, 1.1, 4e-3, -7e-3);
  const E0 = arm.energy(), p0 = arm.momentum1();
  let eMax = 0, pMax = 0, elbowSwing = 0;
  for (let i = 0; i < N; i++) {
    arm.stepRigid(0, 0, dt);
    eMax = Math.max(eMax, Math.abs(arm.energy() / E0 - 1));
    pMax = Math.max(pMax, Math.abs(arm.momentum1() / p0 - 1));
    elbowSwing = Math.max(elbowSwing, Math.abs(arm.q[1] - 1.1));
  }
  console.log(`    [conservation] over ${N} free steps: energy drift ${eMax.toExponential(2)}, `
    + `momentum drift ${pMax.toExponential(2)}   (shoulder swept `
    + `${(arm.q[0] - 0.3).toFixed(2)} rad, elbow ${elbowSwing.toFixed(3)})`);
  check('a free arm conserves its energy', eMax < 1e-3, eMax.toExponential(3));
  check('and the momentum conjugate to the cyclic shoulder angle', pMax < 1e-3,
    pMax.toExponential(3));
  // THE FREE ARM'S ELBOW OSCILLATES RATHER THAN SPINNING, and that is the physics
  // rather than a stuck integrator: with p1 and the energy both fixed, the elbow
  // moves in an effective one-degree-of-freedom potential and is generally trapped
  // in it. The shoulder is the coordinate that sweeps, so it is what the
  // non-triviality check reads.
  check('and it actually moved, so the conservation is not trivial',
    Math.abs(arm.q[0] - 0.3) > 1 && elbowSwing > 1e-3,
    `shoulder ${(arm.q[0] - 0.3).toFixed(3)} rad, elbow ${elbowSwing.toExponential(2)}`);

  // AND THE CHECK HAS TEETH: the Coriolis terms are EXACTLY what makes the
  // momentum conserved, so an arm stepped without them drifts immediately. Measured
  // rather than asserted, because "my conservation law passes" means nothing if it
  // would pass with the physics removed.
  const saved = arm.velocityTorque;
  arm.velocityTorque = () => [0, 0];
  arm.setPose(0.3, 1.1, 4e-3, -7e-3);
  const p0b = arm.momentum1();
  let pBad = 0;
  for (let i = 0; i < 2000; i++) {
    arm.stepRigid(0, 0, dt);
    pBad = Math.max(pBad, Math.abs(arm.momentum1() / p0b - 1));
  }
  arm.velocityTorque = saved;
  console.log(`    [conservation] with the Coriolis terms removed it drifts `
    + `${pBad.toExponential(2)} in a tenth of the run`);
  check('without the Coriolis terms the momentum drifts by orders of magnitude more',
    pBad > 100 * pMax, `${pBad.toExponential(2)} vs ${pMax.toExponential(2)}`);
  arm.setPose(0, 0);
}

// ============================================ GRAVITY, AS A CROSS PRODUCT
{
  const g = 2e-6;
  const gArm = await makeArm({ gravityWorld: [0, -g, 0] });
  const { mass: m1, centroid: c1 } = massProperties(gArm.l1);
  const { mass: m2, centroid: c2 } = massProperties(gArm.l2);
  const L1 = armLength(gArm.l1);
  for (const [q1, q2] of [[0, 0], [0.6, -0.9], [1.4, 2.0]]) {
    gArm.setPose(q1, q2);
    const [t1, t2] = gArm.gravityTorque();
    // The textbook trigonometric form, which is a different arrangement of the
    // same physics -- a sign cannot hide in an identity that only holds at q = 0.
    const e1 = -g * ((m1 * c1 + m2 * L1) * Math.cos(q1) + m2 * c2 * Math.cos(q1 + q2));
    const e2 = -g * m2 * c2 * Math.cos(q1 + q2);
    check(`gravity torques at (${q1}, ${q2}) match the trigonometric form`,
      Math.abs(t1 - e1) < 1e-12 * Math.abs(e1 || 1) && Math.abs(t2 - e2) < 1e-12 * Math.abs(e2 || 1),
      `${t1.toExponential(6)} vs ${e1.toExponential(6)}, ${t2.toExponential(6)} vs ${e2.toExponential(6)}`);
  }
  // AND THE ELBOW UNLOADS THE SHOULDER when it folds back over it, which is the
  // pose-dependence that makes joint compliance a workspace map rather than a
  // number.
  gArm.setPose(0, 0);
  const straight = Math.abs(gArm.gravityTorque()[0]);
  gArm.setPose(0, Math.PI);
  const folded = Math.abs(gArm.gravityTorque()[0]);
  console.log(`    [gravity] shoulder torque straight ${straight.toExponential(3)} → `
    + `folded ${folded.toExponential(3)} (${(straight / folded).toFixed(2)}x)`);
  // NOT A DRAMATIC FACTOR, and it should not be: link 1 carries its own weight at
  // its own centroid whatever the elbow does, so only link 2's contribution folds
  // away. What matters is that it is POSE DEPENDENT at all -- joint compliance is a
  // map over the workspace and not a number.
  check('folding the elbow back unloads the shoulder', folded < 0.8 * straight,
    `${folded.toExponential(3)} vs ${straight.toExponential(3)}`);
  await gArm.l1.destroy(); await gArm.l2.destroy();
}

// ============================ THE ELBOW'S ACCELERATION, AGAINST A CLOSED FORM
//
// THIS IS THE TERM THAT ONLY EXISTS IN A CHAIN. Link 2's body frame does not merely
// rotate: its origin is the elbow, which is being swung around by joint 1, so the
// frame carries the elbow's LINEAR acceleration too. Omitting it leaves a plausible
// wrong answer rather than an error -- the link still bends, just by the wrong
// amount.
//
// The check is the rotating-bar stress with an OFFSET: a bar whose inner end is at
// radius L1 from the rotation centre, spinning at omega, carries
//   sigma(R) = 1/2 rho omega^2 ((L1 + L2)^2 - R^2)
// and with the elbow term dropped it would instead show the un-offset profile about
// its own root. At this geometry those differ by a factor of about three at the
// root, so the check discriminates rather than merely tolerating.
{
  const OM = 4e-4;
  arm.setPose(0, 0, OM, 0);
  arm.alpha = [0, 0];
  const fp = arm.frameParams(1);
  const L1 = arm.L1, L2 = arm.L2;
  console.log(`    [frame] link 2 sees omega ${fp.omega[2].toExponential(3)}, origin accel `
    + `[${fp.originAccel[0].toExponential(3)}, ${fp.originAccel[1].toExponential(3)}] `
    + `(-L1 w^2 = ${(-L1 * OM * OM).toExponential(3)})`);
  check('the elbow\'s acceleration is centripetal, -L1 omega^2 along the link',
    Math.abs(fp.originAccel[0] + L1 * OM * OM) < 1e-15
      && Math.abs(fp.originAccel[1]) < 1e-18,
    `${fp.originAccel[0].toExponential(6)} vs ${(-L1 * OM * OM).toExponential(6)}`);

  // Now run it: a standalone link with exactly those frame parameters, settled.
  const spin = async (originAccel) => {
    const NX = CLAMP + LEN2, NY = H + 4, NZ = H + 4;
    const sim = new Simulation({ lattice: { size: [NX, NY, NZ], spacing: 1 } });
    sim.addRegion(region.all(CELL.FLUID));
    sim.addRegion(region.box(CELL.ELASTIC, [0, 2, 2], [NX, 2 + H, 2 + H]));
    sim.addRegion(region.box(CELL.CLAMPED, [0, 2, 2], [CLAMP, 2 + H, 2 + H]));
    const pivot = [CLAMP - 0.5, 2 + H / 2 - 0.5, 2 + H / 2 - 0.5];
    sim.addPhysics(new NonInertialFrameOperator({ omega: fp.omega, alpha: [0, 0, 0],
      originAccel, pivot, rho }));
    const el = new ElasticSolidOperator({ E, nu, rho, damping: 1.2e-2, bodyForce: true });
    el.assertStable();
    sim.addPhysics(el);
    await sim.build({ backend: 'cpu', precision: 'f64' });
    sim.meta = { NX, NY, NZ, H, clamp: CLAMP, length: LEN2, pivot, E, nu, rho };
    sim.advance(9000);
    const N = sim.lattice.cellCount, sg = sim.backend.read('sig');
    const out = [];
    sim.lattice.forEachCell((x, y, z, i) => {
      if (sim.flags[i] !== CELL.ELASTIC || y !== 2 + (H >> 1) || z !== 2 + (H >> 1)) return;
      out.push([x - pivot[0], sg[i]]);           // sigma_xx, component 0
    });
    const v = peakSpeed(sim);
    await sim.destroy();
    return { out, v };
  };
  const withElbow = await spin(fp.originAccel);
  const rms = (rows, f) => {
    let se = 0, sv = 0;
    for (const [r, s] of rows) { const w = f(r); se += (s - w) ** 2; sv += w * w; }
    return Math.sqrt(se / sv);
  };
  // FREE AT THE OUTER FACE OF THE LAST MATERIAL CELL, which is the convention the
  // gravity brick pinned to zero against 2.13% and 4.35% for the two plausible
  // alternatives -- so the free radius is the pivot plus LEN2, half a cell beyond
  // the last cell CENTRE that armLength() reports. Using armLength here (half a
  // cell short) costs 11% and reads like a missing term rather than an off-by-half.
  const FREE = LEN2;
  const Rout = L1 + FREE;
  const offset = (r) => 0.5 * rho * OM * OM * ((Rout ** 2) - ((L1 + r) ** 2));
  const local = (r) => 0.5 * rho * OM * OM * ((FREE ** 2) - (r ** 2));
  const eOff = rms(withElbow.out, offset), eLoc = rms(withElbow.out, local);
  console.log(`    [frame] spun at omega ${OM.toExponential(1)}: sigma_xx fits the OFFSET bar `
    + `to ${(100 * eOff).toFixed(2)}% and the un-offset one to ${(100 * eLoc).toFixed(1)}%`);
  check('the spun link settled', withElbow.v < 1e-12, withElbow.v.toExponential(2));
  check('link 2\'s stress is the rotating-bar profile about the SHOULDER, not its own root',
    eOff < 0.03 && eLoc > 5 * eOff, `${(100 * eOff).toFixed(2)}% vs ${(100 * eLoc).toFixed(1)}%`);

  if (FULL) {
    // AND DROPPING THE ELBOW TERM GIVES THE OTHER PROFILE, which is what makes the
    // omission a plausible wrong answer rather than a visible failure.
    const noElbow = await spin([0, 0, 0]);
    const nOff = rms(noElbow.out, offset), nLoc = rms(noElbow.out, local);
    console.log(`    [frame] with the elbow term DROPPED: offset ${(100 * nOff).toFixed(1)}%, `
      + `un-offset ${(100 * nLoc).toFixed(2)}%`);
    // A LOOSER TOLERANCE HERE THAN ON THE CORRECT CASE, and the reason is physical
    // rather than a concession: with the elbow term dropped the load is ~5x smaller
    // (rho w^2 r about the local root instead of rho w^2 (L1 + r) about the
    // shoulder), so the same absolute lattice residual is a larger FRACTION of it.
    // What the check is about is which of the two profiles it lands on, and 4.2%
    // against 69.4% is not ambiguous.
    check('dropping it lands on the un-offset profile instead -- a wrong answer, not an error',
      nLoc < 0.08 && nOff > 5 * nLoc, `${(100 * nOff).toFixed(1)}% vs ${(100 * nLoc).toFixed(2)}%`);
  }
}

// ============================================ THE TOOL, AND WHAT MOVES IT
{
  arm.setPose(0, 0);
  const straight = arm.toolRadius();
  arm.setPose(0, Math.PI);
  const folded = arm.toolRadius();
  console.log(`    [reach] straight ${straight.toFixed(3)} → folded ${folded.toFixed(3)} `
    + `(L1 ${arm.L1}, L2 ${arm.L2})`);
  check('the reach folds with the elbow: L1 + L2 straight, |L1 - L2| folded',
    Math.abs(straight - (arm.L1 + arm.L2)) < 1e-9
      && Math.abs(folded - Math.abs(arm.L1 - arm.L2)) < 1e-9,
    `${straight} / ${folded}`);
  // THE SHOULDER'S WIND-UP IS LEVERED BY THE WHOLE REACH, not by link 2, which is
  // why the same angular error at the two joints does not cost the same at the tool.
  arm.setPose(0, 0);
  arm.j1.thM = arm.j1.N * 1e-3;      // 1 mrad of wind-up at the shoulder
  arm.j2.thM = arm.j2.N * 1e-3;      // and the same at the elbow
  const e = arm.tipError();
  check('a milliradian at the shoulder costs more at the tool than one at the elbow',
    Math.abs(e.tilt1 / e.tilt2 - (arm.L1 + arm.L2) / arm.L2) < 1e-9,
    `${e.tilt1.toExponential(4)} vs ${e.tilt2.toExponential(4)}`);
}

// ================================ AN EXTERNAL LOAD, AND WHICH SIDE IT ACTS ON
//
// A cutting force is not a motor disturbance and the difference is the whole reason the
// argument on this page exists. A torque injected at the MOTOR reaches the link only
// THROUGH the gearbox, so at zero wind-up it delivers nothing at all; a torque past the
// gear teeth is a generalised force on the link coordinates and acts at once. The encoder
// is structurally blind to the second, which is why a position loop rejects the first and
// cannot reject the second.
//
// PINNED ON ONE STEP FROM REST, where the answer is exact and needs no settling: with
// gravity and velocity zero the rigid core gives alpha = M^-1 [T, 0] for a load-side T,
// and exactly ZERO for a motor-side one. Both halves are asserted, because a load term
// wired to the wrong side would still "do something" and pass a one-sided check.
{
  const T = 1e-3;
  const M = (() => { arm.setPose(0.3, 0.6); return arm.massMatrix(); })();
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  const want = [M[1][1] * T / det, -M[1][0] * T / det];

  const fresh = () => {
    arm.setPose(0.3, 0.6);
    arm.j1.reset(0.3 * arm.j1.N, 0.3);
    arm.j2.reset(0.6 * arm.j2.N, 0.6);
    arm.w = [0, 0]; arm.j1.wL = 0; arm.j2.wL = 0;
  };

  fresh(); arm.step(0, 0, 1, [T, 0]);
  const aLoad = arm.alpha.slice();
  const encLoad = arm.j1.encoder().angle;
  fresh(); arm.step(T, 0, 1, null);
  const aMotor = arm.alpha.slice();
  fresh(); arm.step(0, 0, 1, null);
  const aFree = arm.alpha.slice(), encFree = arm.j1.encoder().angle;

  console.log(`    [load side] one step from rest — alpha load-side `
    + `${aLoad[0].toExponential(3)} / ${aLoad[1].toExponential(3)}, closed form `
    + `${want[0].toExponential(3)} / ${want[1].toExponential(3)}, motor-side `
    + `${aMotor[0].toExponential(3)}`);
  check('a load-side torque is a generalised force on the LINK: alpha = M^-1 [T, 0]',
    Math.abs(aLoad[0] - aFree[0] - want[0]) < 1e-12 * Math.abs(want[0] || 1)
      + 1e-18 && Math.abs(aLoad[1] - aFree[1] - want[1]) < 1e-18,
    `${(aLoad[0] - aFree[0]).toExponential(6)} vs ${want[0].toExponential(6)}`);
  // …AND THE SAME TORQUE AT THE MOTOR DELIVERS NOTHING ON THAT STEP, because a gearbox at
  // zero wind-up transmits zero. That is the whole difference between the two, and it is
  // the reason a load-side disturbance is the one a soft sensor exists for.
  check('…while the same torque at the MOTOR reaches the link through the gearbox, so on '
    + 'the first step it delivers nothing',
    Math.abs(aMotor[0] - aFree[0]) < 1e-18,
    `${(aMotor[0] - aFree[0]).toExponential(3)}`);
  // AND THE ENCODER IS BLIND TO IT: the motor was commanded nothing and moved nothing, so
  // the one signal a controller has reports the load as absent.
  check('…and the encoder reports the load-side torque as absent',
    Math.abs(encLoad - encFree) < 1e-15, `${(encLoad - encFree).toExponential(3)}`);
  // REMOVING THE TERM MUST BE MEASURABLE, and a null load must not be a quiet change of
  // behaviour: the default path has to be bit-for-bit what it was before the parameter
  // existed.
  fresh(); for (let i = 0; i < 200; i++) arm.step(1e-5, 0, 1, null);
  const a = [arm.q[0], arm.q[1], arm.j1.windup()];
  fresh(); for (let i = 0; i < 200; i++) arm.step(1e-5, 0, 1, [0, 0]);
  check('a zero load is bit-for-bit the same as no load',
    a[0] === arm.q[0] && a[1] === arm.q[1] && a[2] === arm.j1.windup(),
    JSON.stringify([a, [arm.q[0], arm.q[1], arm.j1.windup()]]));
}

await arm.l1.destroy(); await arm.l2.destroy();
console.log(failed ? `\n2R: ${failed} check(s) FAILED\n` : '\n2R: all checks passed\n');
process.exit(failed ? 1 : 0);
