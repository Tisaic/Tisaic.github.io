// Scenes: simulation DEFINITIONS, in the API the architecture exists to
// provide. Nothing here names a backend, a buffer or a shader.
//
// This file is also the answer to "what does the developer experience actually
// look like" -- a scene is a lattice, some regions, one physics operator and a
// unit system, and that is all.

import { Simulation } from './simulation.js';
import { LBMFluidOperator } from './operators/lbm.js';
import { TOPOLOGY } from './lattice.js';
import { region, CELL } from './materials.js';
import { UnitSystem } from './units.js';

/**
 * Flow through a channel past an obstacle — the standard first test case.
 * Inlet at -x, outlet at +x, no-slip walls on y and z, a sphere in the way.
 *
 * `resolution` sets the cross-section; the channel is 2x longer than it is
 * wide, because a wake needs somewhere to go before it meets the outlet.
 */
export function channelFlow({ resolution = 48, tau = 0.55, inletVelocity = 0.06, obstacle = 'sphere' } = {}) {
  const n = resolution;
  const size = [n * 2, n, n];
  const sim = new Simulation({
    lattice: { size, spacing: 1e-3, topology: [TOPOLOGY.BOUNDED, TOPOLOGY.BOUNDED, TOPOLOGY.BOUNDED] },
    units: new UnitSystem({ dx: 1e-3, dt: 1e-4, rho0: 1000 }),
  });

  // No-slip on the four side walls; the flow direction stays open.
  sim.addRegion(region.wall(CELL.SOLID, 1, -1)).addRegion(region.wall(CELL.SOLID, 1, +1));
  sim.addRegion(region.wall(CELL.SOLID, 2, -1)).addRegion(region.wall(CELL.SOLID, 2, +1));

  const c = [Math.round(n * 0.55), n >> 1, n >> 1];
  const r = Math.max(3, Math.round(n * 0.16));
  if (obstacle === 'sphere') sim.addRegion(region.sphere(CELL.SOLID, c, r));
  else if (obstacle === 'cylinder') sim.addRegion(region.cylinder(CELL.SOLID, 2, [c[0], c[1]], r));
  else if (obstacle === 'plate') {
    sim.addRegion(region.box(CELL.SOLID, [c[0] - 1, c[1] - r, 0], [c[0] + 2, c[1] + r, n]));
  }

  // Inlet and outlet last, so they win over the wall slabs at the corners.
  sim.addRegion(region.wall(CELL.INLET, 0, -1));
  sim.addRegion(region.wall(CELL.OUTLET, 0, +1));

  sim.addPhysics(new LBMFluidOperator({ tau, inletVelocity: [inletVelocity, 0, 0] }));
  sim.meta = {
    name: 'Channel flow past an obstacle',
    obstacleRadius: r,
    reynolds: (inletVelocity * 2 * r) / ((tau - 0.5) / 3),
  };
  return sim;
}

/**
 * Force-driven planar channel — the case with a closed-form answer, so the
 * page can check itself against the analytic parabola rather than only looking
 * plausible. Same setup as test/lattsim/poiseuille.test.mjs.
 */
export function poiseuille({ resolution = 32, tau = 1.0, peak = 0.02 } = {}) {
  const n = resolution;
  const H = n - 2;
  const nu = (tau - 0.5) / 3;
  const force = peak * 8 * nu / (H * H);
  const sim = new Simulation({
    lattice: {
      size: [Math.max(8, n >> 1), Math.max(8, n >> 1), n], spacing: 1e-3,
      topology: [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.BOUNDED],
    },
  });
  sim.addRegion(region.wall(CELL.SOLID, 2, -1)).addRegion(region.wall(CELL.SOLID, 2, +1));
  sim.addPhysics(new LBMFluidOperator({ tau, force: [force, 0, 0] }));
  sim.meta = {
    name: 'Poiseuille channel (analytic)',
    H, zc: (n - 1) / 2, force, nu,
    analytic: (z) => (force / (2 * nu)) * ((H / 2) ** 2 - (z - (n - 1) / 2) ** 2),
  };
  return sim;
}

/**
 * Lid-driven cavity — a closed box with one moving wall. No inlet, no outlet,
 * so mass is exactly conserved and the recirculation is a clean check that the
 * moving-wall condition drives anything at all.
 */
export function lidCavity({ resolution = 40, tau = 0.6, lidVelocity = 0.05 } = {}) {
  const n = resolution;
  const sim = new Simulation({ lattice: { size: [n, n, n], spacing: 1e-3 } });
  for (const axis of [0, 1, 2]) {
    sim.addRegion(region.wall(CELL.SOLID, axis, -1));
    sim.addRegion(region.wall(CELL.SOLID, axis, +1));
  }
  sim.addRegion(region.wall(CELL.MOVING, 2, +1));      // the lid
  sim.addPhysics(new LBMFluidOperator({ tau, inletVelocity: [lidVelocity, 0, 0] }));
  sim.meta = { name: 'Lid-driven cavity', reynolds: lidVelocity * n / ((tau - 0.5) / 3) };
  return sim;
}

export const SCENES = {
  channel: { label: 'Channel + obstacle', make: channelFlow },
  poiseuille: { label: 'Poiseuille (analytic)', make: poiseuille },
  cavity: { label: 'Lid-driven cavity', make: lidCavity },
};
