// A flexible link: a lattice beam in its own body frame, plus the mass properties
// the joint above it needs.
//
// THE MASS PROPERTIES COME OUT OF THE LATTICE ITSELF rather than being separate
// parameters, and that is a correctness property rather than a convenience. The
// gravitational torque a link puts on its joint, and the inertia it presents to
// that joint, are both integrals over the SAME material distribution the elastic
// solver is stepping. Stating them independently would let a lightening hole, a
// non-prismatic casting or a changed section drift out of agreement with the
// thing being simulated, silently and in a way no closed form would catch --
// because both halves would be self-consistent and only their relationship wrong.
//
// PLANAR CONVENTION for the first cut, with the operator kept fully 3D: the link
// lies along +x in its body frame, gravity acts along -y, and the joint rotates
// about z. Planar makes the verification and the eventual picture far easier and
// loses almost nothing about compliance.

import { Simulation } from '../lattsim/simulation.js';
import { CELL, region } from '../lattsim/materials.js';
import { ElasticSolidOperator } from '../lattsim/operators/elastic.js';
import { NonInertialFrameOperator } from '../lattsim/operators/frame.js';

/**
 * Build a rectangular link clamped at its root.
 *
 * @param {object} o
 * @param {number} o.length     material cells beyond the clamp
 * @param {number} o.section    cells across (square section)
 * @param {number} [o.clamp]    cells of CLAMPED root (the joint's output flange)
 * @param {number} o.E          Young's modulus, lattice units
 * @param {number} o.nu
 * @param {number} o.rho
 * @param {number[]} [o.gravity] in BODY-frame coordinates
 * @param {number} [o.damping]  dynamic relaxation, for static answers
 */
export async function buildLink({ length, section, clamp = 3, E, nu, rho,
                                  gravity = [0, 0, 0], damping = 0,
                                  omega = [0, 0, 0], alpha = [0, 0, 0],
                                  precision = 'f64' }) {
  const H = section;
  const NX = clamp + length, NY = H + 4, NZ = H + 4;
  const sim = new Simulation({ lattice: { size: [NX, NY, NZ], spacing: 1 } });
  sim.addRegion(region.all(CELL.FLUID));                        // vacuum
  sim.addRegion(region.box(CELL.ELASTIC, [0, 2, 2], [NX, 2 + H, 2 + H]));
  sim.addRegion(region.box(CELL.CLAMPED, [0, 2, 2], [clamp, 2 + H, 2 + H]));
  // The pivot is the clamp plane -- the last HELD velocity node, at clamp - 1/2.
  // Every fictitious term measures r from here, so it is a property of the link's
  // geometry and not a number a caller should be guessing.
  const pivot = [clamp - 0.5, 2 + H / 2 - 0.5, 2 + H / 2 - 0.5];
  sim.addPhysics(new NonInertialFrameOperator({ gravity, omega, alpha, pivot, rho }));
  const elastic = new ElasticSolidOperator({ E, nu, rho, damping,
    bodyForce: true, displacement: true });
  // THE CFL GATE IS CALLED HERE, not left to the caller. It exists precisely so a
  // stiffness that cannot be integrated is a message instead of a lattice of NaN
  // thirty steps later -- and the first thing this file did was reach for a "very
  // stiff link" at E = 0.5, which is c_p = 0.82 against a limit of 0.577. It
  // produced a NaN sag and a check that read like a physics failure.
  elastic.assertStable();
  // The clamp reaction is asked for BEFORE build(), because the kernel reads the
  // request in initialize(). Asking afterwards silently does nothing -- the flag
  // is set, the accumulator is not, and every reported reaction is zero.
  elastic.measureReaction(pivot);
  sim.addPhysics(elastic);
  await sim.build({ backend: 'cpu', precision });
  sim.meta = { NX, NY, NZ, H, clamp, length, pivot, E, nu, rho };
  return sim;
}

/**
 * Mass, centroid and second moment about the pivot, integrated over the cells the
 * solver actually treats as material. The CLAMPED root is included in the mass
 * (it is real material) but contributes almost nothing to the moment, since it
 * straddles the pivot.
 */
export function massProperties(sim) {
  const { pivot, rho } = sim.meta;
  const L = sim.lattice;
  let m = 0, mx = 0, J = 0;
  L.forEachCell((x, y, z, i) => {
    const t = sim.flags[i];
    if (t !== CELL.ELASTIC && t !== CELL.CLAMPED) return;
    // Cell centres sit at integer indices in this convention (the lattice's own
    // position() adds a half cell for its world mapping; here everything is in
    // index space, consistently with the pivot above).
    const r = x - pivot[0];
    m += rho; mx += rho * r; J += rho * r * r;
  });
  return { mass: m, centroid: mx / m, inertiaAboutPivot: J };
}

/**
 * Gravitational torque this link applies to its joint, about z, from the SAME
 * distribution above. With gravity along -y this is -m g_y * xbar... written out
 * as the cross product so a non-planar gravity still gives the right answer.
 */
export function gravityTorque(sim, gravity) {
  const { mass, centroid } = massProperties(sim);
  // tau_z = (r x F)_z = x * F_y - y * F_x, with the centroid on the x axis.
  return centroid * (mass * gravity[1]) - 0 * (mass * gravity[0]);
}

/** Mean transverse (y) displacement of the tip cells -- what a tracker would see. */
export function tipDeflection(sim) {
  const { NX } = sim.meta;
  const L = sim.lattice, N = L.cellCount;
  const u = sim.backend.read('disp');
  let acc = 0, n = 0;
  L.forEachCell((x, y, z, i) => {
    if (sim.flags[i] !== CELL.ELASTIC || x !== NX - 1) return;
    acc += u[1 * N + i]; n++;
  });
  return acc / n;
}

/** Largest |v| anywhere -- so a caller can assert a static answer really settled. */
export function peakSpeed(sim) {
  const N = sim.lattice.cellCount;
  const v = sim.backend.read('vel');
  let m = 0;
  for (let i = 0; i < 3 * N; i++) m = Math.max(m, Math.abs(v[i]));
  return m;
}

/**
 * Distance from the pivot to the tip, in the same index space as everything
 * above. The tip is the LOAD point -- the tip cells' centre -- which is the
 * convention the cantilever check pinned.
 */
export function armLength(sim) {
  const { NX, pivot } = sim.meta;
  return (NX - 1) - pivot[0];
}
