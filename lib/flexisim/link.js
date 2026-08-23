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

/**
 * SLOPE OF THE DEFORMED CENTRELINE AT THE TIP, in radians.
 *
 * A BENT LINK DOES NOT MERELY MOVE ITS OWN TIP, IT TILTS EVERYTHING DOWNSTREAM, and on a
 * chain that term is levered by the whole of the next link. It is the one contribution
 * `FlexArm2R.tipError()` was missing, and it was the largest: measured on the shipped
 * chain, the omitted slope term is 2.9x the sum of BOTH gearbox wind-ups.
 *
 * FITTED OVER THE LAST FEW CELLS RATHER THAN DIFFERENCED OVER TWO, because it is
 * multiplied by the downstream reach -- about 95x at the drawn magnification -- so a
 * two-point difference amplifies the section-averaging noise by the same factor. Least
 * squares over `n` cells costs nothing and is well conditioned; measured, the two agree
 * to 0.6% on a settled arm and the fit is far steadier while the link is ringing.
 *
 * @param {object} sim
 * @param {number} [n] how many cells at the tip to fit over
 * @returns {number} dy/dx at the tip, in radians (the lattice spacing is the x unit)
 */
export function tipSlope(sim, n = 5) {
  const { x, dy } = deflectionProfile(sim);
  const m = Math.min(Math.max(2, n), x.length);
  if (m < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = x.length - m; i < x.length; i++) {
    sx += x[i]; sy += dy[i]; sxx += x[i] * x[i]; sxy += x[i] * dy[i];
  }
  const den = m * sxx - sx * sx;
  return den === 0 ? 0 : (m * sxy - sx * sy) / den;
}

/**
 * Mean transverse (y) displacement of the ELASTIC cells at each x, i.e. the
 * deformed centreline in the body frame -- what a picture of the link has to draw.
 *
 * IT IS A MEAN OVER THE SECTION, NOT A SINGLE CELL, because a bending link also
 * has a strain distribution across its thickness; picking one cell would draw the
 * top or bottom fibre and read as a thicker or thinner deflection depending on
 * which. The clamped root is included (its displacement is zero by construction)
 * so the polyline starts at the pivot rather than floating.
 *
 * @returns {{x:number[], dy:number[]}} in index space
 */
export function deflectionProfile(sim) {
  const { NX } = sim.meta;
  const L = sim.lattice, N = L.cellCount;
  const u = sim.backend.read('disp');
  const acc = new Float64Array(NX), cnt = new Float64Array(NX);
  L.forEachCell((x, y, z, i) => {
    const t = sim.flags[i];
    if (t !== CELL.ELASTIC && t !== CELL.CLAMPED) return;
    acc[x] += u[N + i]; cnt[x]++;
    void y; void z;
  });
  const xs = [], dy = [];
  for (let x = 0; x < NX; x++) if (cnt[x] > 0) { xs.push(x); dy.push(acc[x] / cnt[x]); }
  return { x: xs, dy };
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
