// THE N-LINK CHAIN, AND THE TWO-LINK CASE AS ITS TEST.
//
// arm2r.js writes the two-link mass matrix and Coriolis terms out by hand. That is
// fine for two and is exactly the kind of algebra that acquires a sign error at
// three, so this does the same physics by recursive Newton-Euler instead -- one
// O(N) pass for the bias torques, N more for the columns of M -- and adding a joint
// becomes a list entry rather than a derivation.
//
// THE HAND-DERIVED 2R IS WHAT VERIFIES IT. That one was checked against closed
// forms and conservation laws before this existed, so the general implementation is
// required to REPRODUCE IT TO MACHINE PRECISION at N = 2. Two independent routes to
// the same matrix is a far stronger statement than either alone, and it is what
// lets a third link be trusted without a third derivation.

import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { FlexArmNR } from '../../lib/flexisim/armnr.js';
import { buildLink, massProperties, peakSpeed } from '../../lib/flexisim/link.js';
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
console.log('\nflexisim: the N-link chain');

const H = 4, E = 0.05, nu = 0.3, rho = 1, K = 4.0, g = 2e-6, CLAMP = 3;
const LENS = [14, 10, 7];
const mkJoint = (mp) => new Joint({ ratio: 100, motorInertia: mp.inertiaAboutPivot / 1e4,
  loadInertia: mp.inertiaAboutPivot, stiffness: K,
  damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
const mkLink = (length) => buildLink({ length, section: H, clamp: CLAMP, E, nu, rho,
  damping: 3e-3 });

const links = [];
for (const L of LENS) links.push(await mkLink(L));

// ================================== THE GENERAL SOLVE AGAINST THE HAND-DERIVED ONE
{
  const two = links.slice(0, 2);
  const a2 = new FlexArm2R({ joint1: mkJoint(massProperties(two[0])), link1: two[0],
    joint2: mkJoint(massProperties(two[1])), link2: two[1],
    gravityWorld: [0, -g, 0], dt: 1 });
  const an = new FlexArmNR({ joints: two.map((l) => mkJoint(massProperties(l))), links: two,
    gravityWorld: [0, -g, 0], dt: 1 });
  const rel = (x, y) => Math.abs(x - y) / Math.max(1e-300, Math.abs(y));
  let wM = 0, wG = 0, wC = 0, wF = 0;
  for (const [q1, q2] of [[0, 0], [0.3, 0.9], [-1.1, 2.2], [2.0, -0.7]]) {
    for (const [w1, w2] of [[0, 0], [3e-3, -5e-3], [-1e-2, 4e-3]]) {
      a2.setPose(q1, q2, w1, w2); an.setPose([q1, q2], [w1, w2]);
      const M2 = a2.massMatrix(), Mn = an.massMatrix();
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) wM = Math.max(wM, rel(Mn[i][j], M2[i][j]));
      const g2 = a2.gravityTorque(), gn = an.gravityTorque();
      const v2 = a2.velocityTorque(), vn = an.velocityTorque();
      for (let i = 0; i < 2; i++) {
        wG = Math.max(wG, rel(gn[i], g2[i]));
        wC = Math.max(wC, rel(vn[i], v2[i]));
      }
      // The frame parameters are the term that only exists in a chain, so they are
      // compared too rather than trusted because the torques matched.
      a2.alpha = [1e-6, -2e-6]; an.alpha = [1e-6, -2e-6];
      for (const i of [0, 1]) {
        const f2 = a2.frameParams(i), fn = an.frameParams(i);
        for (const key of ['gravity', 'omega', 'alpha', 'originAccel']) {
          for (let c = 0; c < 3; c++) {
            wF = Math.max(wF, Math.abs(fn[key][c] - f2[key][c]) / Math.max(Math.abs(f2[key][c]), 1e-12));
          }
        }
      }
    }
  }
  console.log(`    [agreement] worst relative difference over 12 states — M ${wM.toExponential(2)}, `
    + `G ${wG.toExponential(2)}, C ${wC.toExponential(2)}, frame params ${wF.toExponential(2)}`);
  check('the recursive solve reproduces the hand-derived 2R mass matrix to machine precision',
    wM < 1e-12, wM.toExponential(3));
  check('...and its gravity and Coriolis torques', wG < 1e-12 && wC < 1e-12,
    `${wG.toExponential(2)} / ${wC.toExponential(2)}`);
  check('...and the frame parameters, which is the term only a chain has',
    wF < 1e-12, wF.toExponential(3));
}

// ================================================================ THREE LINKS
const arm = new FlexArmNR({ joints: links.map((l) => mkJoint(massProperties(l))), links,
  gravityWorld: [0, -g, 0], dt: 1 });
console.log(`    ${arm.describe()}`);

{
  // THE INERTIA IS THE CONFIGURATION, and with three links the range is wider than
  // with two: the base joint has two links to fold back over it.
  const straight = arm.massMatrix([0, 0, 0])[0][0];
  const folded = arm.massMatrix([0, Math.PI, 0])[0][0];
  const tucked = arm.massMatrix([0, Math.PI, Math.PI])[0][0];
  console.log(`    [inertia] base M11 straight ${straight.toPrecision(5)} · elbow folded `
    + `${folded.toPrecision(5)} · both folded ${tucked.toPrecision(5)} `
    + `(${(straight / Math.min(folded, tucked)).toFixed(2)}× across the range)`);
  check('the base inertia varies by more than 3x across the workspace',
    straight / Math.min(folded, tucked) > 3,
    `${(straight / Math.min(folded, tucked)).toFixed(3)}x`);
  const M = arm.massMatrix([0.4, 0.8, -0.5]);
  let asym = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    asym = Math.max(asym, Math.abs(M[i][j] - M[j][i]) / Math.abs(M[i][i]));
  }
  check('the mass matrix is symmetric, as a kinetic-energy quadratic form must be',
    asym < 1e-12, asym.toExponential(2));
}

{
  // CONSERVATION, WHICH IS NOT ANYTHING THE SOLVER COMPUTES. With no gravity and no
  // joint torques a three-link chain is closed and conservative: the energy is
  // constant, and so is the momentum conjugate to the base angle, which is cyclic.
  const noG = new FlexArmNR({ joints: links.map((l) => mkJoint(massProperties(l))), links,
    gravityWorld: [0, 0, 0], dt: 1 });
  const dt = 0.05, N = 20000;
  noG.setPose([0.2, 1.0, -0.6], [4e-3, -7e-3, 5e-3]);
  const E0 = noG.energy(), p0 = noG.momentum1();
  let eMax = 0, pMax = 0;
  for (let i = 0; i < N; i++) {
    noG.stepRigid([0, 0, 0], dt);
    eMax = Math.max(eMax, Math.abs(noG.energy() / E0 - 1));
    pMax = Math.max(pMax, Math.abs(noG.momentum1() / p0 - 1));
  }
  console.log(`    [conservation] over ${N} free steps: energy drift ${eMax.toExponential(2)}, `
    + `momentum drift ${pMax.toExponential(2)}   (base swept ${(noG.q[0] - 0.2).toFixed(2)} rad)`);
  check('a free three-link arm conserves its energy', eMax < 1e-3, eMax.toExponential(3));
  check('and the momentum conjugate to the cyclic base angle', pMax < 1e-3, pMax.toExponential(3));
  check('and it actually moved, so the conservation is not trivial',
    Math.abs(noG.q[0] - 0.2) > 1, `${(noG.q[0] - 0.2).toFixed(3)} rad`);

  // AND IT HAS TEETH: the Coriolis terms are exactly what make that momentum
  // conserved, so stepping without them drifts by orders of magnitude more. A
  // conservation law that would pass with the physics removed is not a check.
  const saved = noG.velocityTorque;
  noG.velocityTorque = () => [0, 0, 0];
  noG.bias = () => [0, 0, 0];
  noG.setPose([0.2, 1.0, -0.6], [4e-3, -7e-3, 5e-3]);
  const p0b = noG.momentum1();
  let pBad = 0;
  for (let i = 0; i < 2000; i++) {
    noG.stepRigid([0, 0, 0], dt);
    pBad = Math.max(pBad, Math.abs(noG.momentum1() / p0b - 1));
  }
  noG.velocityTorque = saved;
  console.log(`    [conservation] with the bias torques removed it drifts `
    + `${pBad.toExponential(2)} in a tenth of the run`);
  check('without the Coriolis terms the momentum drifts by orders of magnitude more',
    pBad > 100 * pMax, `${pBad.toExponential(2)} vs ${pMax.toExponential(2)}`);
}

{
  // THE THIRD LINK'S FRAME, AGAINST THE OFFSET ROTATING BAR. Link 3's body frame is
  // carried by TWO joints upstream of it, so its origin's acceleration accumulates
  // through both -- which is precisely the term that a two-link derivation cannot
  // exercise. Spun straight at constant omega, its axial stress must be the
  // rotating-bar profile about the BASE:
  //     sigma(R) = 1/2 rho w^2 ((L1 + L2 + L3)^2 - R^2)
  // and with the frame's origin acceleration dropped it lands on the profile about
  // its own root instead -- a plausible wrong answer rather than a visible failure.
  const OM = 4e-4;
  arm.setPose([0, 0, 0], [OM, 0, 0]);
  arm.alpha = [0, 0, 0];
  const fp = arm.frameParams(2);
  const R0 = arm.L[0] + arm.L[1];
  console.log(`    [frame] link 3 sees omega ${fp.omega[2].toExponential(3)}, origin accel `
    + `${fp.originAccel[0].toExponential(3)} (-(L1+L2) w^2 = ${(-R0 * OM * OM).toExponential(3)})`);
  check('link 3\'s origin acceleration accumulates through BOTH joints upstream',
    Math.abs(fp.originAccel[0] + R0 * OM * OM) < 1e-15 && Math.abs(fp.originAccel[1]) < 1e-18,
    `${fp.originAccel[0].toExponential(6)} vs ${(-R0 * OM * OM).toExponential(6)}`);

  const spin = async (originAccel) => {
    const LEN = LENS[2], NX = CLAMP + LEN, NY = H + 4, NZ = H + 4;
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
    sim.meta = { NX, NY, NZ, H, clamp: CLAMP, length: LEN, pivot, E, nu, rho };
    sim.advance(9000);
    const sg = sim.backend.read('sig'), out = [];
    sim.lattice.forEachCell((x, y, z, i) => {
      if (sim.flags[i] !== CELL.ELASTIC || y !== 2 + (H >> 1) || z !== 2 + (H >> 1)) return;
      out.push([x - pivot[0], sg[i]]);
    });
    const v = peakSpeed(sim);
    await sim.destroy();
    return { out, v };
  };
  const rmsFit = (rows, f) => {
    let se = 0, sv = 0;
    for (const [r, s] of rows) { const w = f(r); se += (s - w) ** 2; sv += w * w; }
    return Math.sqrt(se / sv);
  };
  // FREE AT THE OUTER FACE of the last material cell -- the pivot plus LEN, half a
  // cell beyond the last cell CENTRE that armLength() reports.
  const FREE = LENS[2], Rout = R0 + FREE;
  const offset = (r) => 0.5 * rho * OM * OM * ((Rout ** 2) - ((R0 + r) ** 2));
  const local = (r) => 0.5 * rho * OM * OM * ((FREE ** 2) - (r ** 2));
  const s3 = await spin(fp.originAccel);
  const eOff = rmsFit(s3.out, offset), eLoc = rmsFit(s3.out, local);
  console.log(`    [frame] spun straight at omega ${OM.toExponential(1)}: sigma_xx fits the `
    + `OFFSET bar to ${(100 * eOff).toFixed(2)}% and the un-offset one to ${(100 * eLoc).toFixed(0)}%`);
  check('the spun third link settled', s3.v < 1e-12, s3.v.toExponential(2));
  check('link 3\'s stress is the rotating-bar profile about the BASE, not its own root',
    eOff < 0.03 && eLoc > 10 * eOff, `${(100 * eOff).toFixed(2)}% vs ${(100 * eLoc).toFixed(0)}%`);
  if (FULL) {
    const s3b = await spin([0, 0, 0]);
    const nOff = rmsFit(s3b.out, offset), nLoc = rmsFit(s3b.out, local);
    console.log(`    [frame] with the origin acceleration DROPPED: offset `
      + `${(100 * nOff).toFixed(0)}%, un-offset ${(100 * nLoc).toFixed(2)}%`);
    check('dropping it lands on the un-offset profile instead',
      nLoc < 0.08 && nOff > 5 * nLoc, `${(100 * nOff).toFixed(0)}% vs ${(100 * nLoc).toFixed(2)}%`);
  }
}

{
  // THE LEVER ARMS. A milliradian at the base moves the tool by the WHOLE reach; the
  // same milliradian at the wrist moves it by the last link only. That is why the
  // joints do not contribute equally and why tipError() reports them separately.
  arm.setPose([0, 0, 0]);
  for (let i = 0; i < 3; i++) arm.joints[i].thM = arm.joints[i].N * 1e-3;
  const e = arm.tipError();
  const reach = arm.toolRadius();
  console.log(`    [levers] reach ${reach.toFixed(2)}; tilts `
    + `${e.tilt.map((t) => t.toExponential(3)).join(' / ')}`);
  check('each joint\'s wind-up is levered by the distance from THAT joint to the tool',
    Math.abs(e.tilt[0] / e.tilt[2] - reach / arm.L[2]) < 1e-9
      && Math.abs(e.tilt[1] / e.tilt[2] - (arm.L[1] + arm.L[2]) / arm.L[2]) < 1e-9,
    e.tilt.join(' '));
  check('and the tool error is the sum of every tilt and every bend',
    Math.abs(e.total - (e.tilt.reduce((a, b) => a + b, 0)
      + e.bend.reduce((a, b) => a + b, 0))) < 1e-15 * Math.abs(e.total),
    `${e.total}`);
}

for (const l of links) await l.destroy();
console.log(failed ? `\nNR: ${failed} check(s) FAILED\n` : '\nNR: all checks passed\n');
process.exit(failed ? 1 : 0);
