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
export function channelFlow({ resolution = 48, tau = 0.55, inletVelocity = 0.06, obstacle = 'sphere',
  collision, trtPolicy, smagorinsky,
  inletMode = 'steady', inletAmplitude = 0, inletRate = 0.004 } = {}) {
  const n = resolution;
  // THREE TIMES LONG, not two. A vortex street needs several diameters of
  // downstream room before the outlet, and the outlet here is only first-order:
  // truncating the wake too early reflects it back into the thing being watched.
  //
  // THE SPAN IS NOT THE SAME KIND OF NUMBER AS THE CROSS-SECTION, and treating
  // it as one is what put high resolution out of reach. A cylinder spans z, so
  // the flow it produces is nominally two-dimensional and z is a free numerical
  // parameter -- cells spent there resolve nothing about the wake. At [3n, n, n]
  // the channel needs a 192 MiB storage binding at n = 96, over the 128 MiB most
  // devices allow, so the top of the resolution ladder was simply unreachable.
  // Halving the span for the cylinder brings it to 96 MiB and doubles the cells
  // across the obstacle, which is the resolution that actually matters.
  //
  // A SPHERE is a different case: it is finite in z, so a squeezed span would
  // confine it, and it keeps the cubic domain.
  const span = obstacle === 'cylinder' ? Math.max(16, Math.round(n / 2)) : n;
  const size = [n * 3, n, span];
  const sim = new Simulation({
    lattice: { size, spacing: 1e-3, topology: [TOPOLOGY.BOUNDED, TOPOLOGY.BOUNDED, TOPOLOGY.BOUNDED] },
    units: new UnitSystem({ dx: 1e-3, dt: 1e-4, rho0: 1000 }),
  });

  // No-slip on the four side walls; the flow direction stays open.
  sim.addRegion(region.wall(CELL.SOLID, 1, -1)).addRegion(region.wall(CELL.SOLID, 1, +1));
  sim.addRegion(region.wall(CELL.SOLID, 2, -1)).addRegion(region.wall(CELL.SOLID, 2, +1));

  // BLOCKAGE MATTERS AS MUCH AS REYNOLDS NUMBER. At 0.16n the obstacle spanned
  // a third of the channel, and that much confinement pushes the shedding
  // threshold well above the textbook value and distorts the street when it
  // does appear. 0.10n puts it near 20%, where the classic numbers apply.
  const r = Math.max(3, Math.round(n * 0.10));
  // ONE CELL OFF THE CENTRELINE, so the wake can shed on its own. A perfectly
  // symmetric obstacle in a symmetric channel is an unstable EQUILIBRIUM above
  // the critical Reynolds number: the instability has nothing to grow from
  // except round-off, so a supercritical run can sit there looking steady for a
  // very long time. Real cylinders are never perfectly centred either.
  const c = [Math.round(n * 0.9), (n >> 1) + 1, span >> 1];
  if (obstacle === 'sphere') sim.addRegion(region.sphere(CELL.SOLID, c, r));
  else if (obstacle === 'cylinder') sim.addRegion(region.cylinder(CELL.SOLID, 2, [c[0], c[1]], r));
  else if (obstacle === 'plate') {
    sim.addRegion(region.box(CELL.SOLID, [c[0] - 1, c[1] - r, 0], [c[0] + 2, c[1] + r, span]));
  }

  // Inlet and outlet last, so they win over the wall slabs at the corners.
  sim.addRegion(region.wall(CELL.INLET, 0, -1));
  sim.addRegion(region.wall(CELL.OUTLET, 0, +1));

  sim.addPhysics(new LBMFluidOperator({ tau, inletVelocity: [inletVelocity, 0, 0],
    // START THE CHANNEL ALREADY FLOWING. From rest, the inlet has to fill the
    // domain, and that leading-edge front crosses the lattice, reaches the
    // first-order outlet and rings off it -- a startup transient with nothing to
    // do with the flow being studied, and slow to leave. Beginning the interior
    // at the inlet velocity means there is no front to cross in the first place.
    initialVelocity: [inletVelocity, 0, 0],
    inletMode, inletAmplitude, inletRate,
    collision, trtPolicy, smagorinsky }));
  sim.meta = {
    name: 'Channel flow past an obstacle',
    obstacleRadius: r,
    // Cells across the obstacle -- the number "resolution" actually buys, and
    // the one worth reading when deciding whether a wake is resolved.
    obstacleCells: 2 * r,
    // What this flow's speeds are SCALED AGAINST. The 2D slice auto-scales from
    // the data it reads back; the volume renderer never reads anything back, so
    // it needs a number. Taking it from the inlet-speed slider instead made
    // Poiseuille -- which is force-driven and ignores that slider -- render at
    // 24% of the colour ramp, and the shader's opacity is nv^2, so 17x down.
    referenceSpeed: inletVelocity,
    obstacle,
    obstacleOffset: 1,
    inletMode, inletAmplitude, inletRate,
    reynolds: (inletVelocity * 2 * r) / ((tau - 0.5) / 3),
    // WHERE THE SHEDDING THRESHOLD IS, per shape, so the page can say whether
    // the current settings should produce a vortex street rather than leaving
    // it to be guessed. A circular cylinder goes unsteady at Re ~ 47 (the
    // classic Hopf bifurcation); a SPHERE is far more stable -- its wake stays
    // steady and axisymmetric to Re ~ 210, becomes steady-but-asymmetric to
    // ~270, and only then sheds hairpin vortices. That gap of nearly 6x is why
    // the shipped sphere at Re ~ 58 never shed and never should have.
    sheddingRe: obstacle === 'sphere' ? 270 : obstacle === 'plate' ? 30 : 47,
    // A slice normal to z, at mid-height, cuts through the obstacle and the wake.
    view: { sliceAxis: 2, slicePosition: 0.5 },
  };
  return sim;
}

/**
 * Force-driven planar channel — the case with a closed-form answer, so the
 * page can check itself against the analytic parabola rather than only looking
 * plausible. Same setup as test/lattsim/poiseuille.test.mjs.
 */
export function poiseuille({ resolution = 32, tau = 1.0, peak = 0.02,
  collision, trtPolicy, smagorinsky } = {}) {
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
  sim.addPhysics(new LBMFluidOperator({ tau, force: [force, 0, 0], collision, trtPolicy, smagorinsky }));
  sim.meta = {
    name: 'Poiseuille channel (analytic)',
    H, zc: (n - 1) / 2, force, nu,
    referenceSpeed: peak,
    analytic: (z) => (force / (2 * nu)) * ((H / 2) ** 2 - (z - (n - 1) / 2) ** 2),
    // THE DEFAULT SLICE MATTERS HERE. This flow is uniform in x and y and varies
    // only across z, so a slice normal to z is a single flat colour -- measured
    // spread exactly 0. Normal to x, the plane spans (y, z) and shows the
    // parabola. A correct simulation displayed on the wrong plane looks broken.
    view: { sliceAxis: 0, slicePosition: 0.5 },
  };
  return sim;
}

/**
 * Lid-driven cavity — a closed box with one moving wall. No inlet, no outlet,
 * so mass is exactly conserved and the recirculation is a clean check that the
 * moving-wall condition drives anything at all.
 */
export function lidCavity({ resolution = 40, tau = 0.6, lidVelocity = 0.05, lidFrequency = 0,
  collision, trtPolicy, smagorinsky } = {}) {
  const n = resolution;
  const sim = new Simulation({ lattice: { size: [n, n, n], spacing: 1e-3 } });
  for (const axis of [0, 1, 2]) {
    sim.addRegion(region.wall(CELL.SOLID, axis, -1));
    sim.addRegion(region.wall(CELL.SOLID, axis, +1));
  }
  // The lid spans only the INTERIOR of the top face. Driving the whole face
  // drives the corner cells where the lid meets the four side walls, and those
  // cells have to be simultaneously moving and stationary. Measured: it left a
  // steady 5.1% density spread that never decayed, against the ~0.3% the
  // dynamic pressure of this flow can account for. The corner singularity of a
  // lid-driven cavity is real physics; driving the corner itself is not.
  sim.addRegion(region.box(CELL.MOVING, [1, 1, n - 1], [n - 1, n - 1, n]));
  sim.addPhysics(new LBMFluidOperator({ tau, inletVelocity: [lidVelocity, 0, 0],
    wallFrequency: lidFrequency, collision, trtPolicy, smagorinsky }));
  sim.meta = {
    name: 'Lid-driven cavity',
    reynolds: lidVelocity * n / ((tau - 0.5) / 3),
    lidFrequency,
    // STOKES LAYER DEPTH, the length the oscillation actually penetrates:
    // sqrt(2 nu / omega). If it is a small fraction of the box the interior
    // barely notices the lid; if it spans the box the whole cavity sloshes.
    // Reported so an oscillating run can be read rather than guessed at.
    stokesDepth: lidFrequency > 0
      ? Math.sqrt(2 * ((tau - 0.5) / 3) / (2 * Math.PI * lidFrequency)) : null,
    // The lid is the fastest thing in a cavity; the interior is a fraction of it.
    referenceSpeed: lidVelocity * 0.5,
    // The lid drives along x, so the recirculation lives in the (x, z) plane --
    // which is the slice normal to y.
    view: { sliceAxis: 1, slicePosition: 0.5 },
  };
  return sim;
}

/**
 * Largest resolution of `scene` whose biggest single field fits `limitBytes`.
 *
 * A D3Q19 lattice is memory-hungry in a way that surprises people: 19 floats per
 * cell, doubled for ping-pong. The channel at 96 needs a 128.3 MiB storage
 * binding against a 128 MiB default limit -- so it fails, and before this existed
 * the failure cascaded (GPU refuses, CPU refuses because the lattice is far over
 * its cap, build rejects, page left with no simulation at all). Asking the
 * question first is cheaper than handling that.
 */
export function largestResolutionThatFits(sceneKey, limitBytes, ladder) {
  const make = SCENES[sceneKey].make;
  let best = ladder[0];
  for (const res of ladder) {
    const sim = make({ resolution: res });
    const biggest = Math.max(...sim.fields.list().map((f) => f.byteLength(sim.lattice.cellCount)));
    if (biggest <= limitBytes) best = res; else break;
  }
  return best;
}

export const SCENES = {
  channel: { label: 'Channel + obstacle', make: channelFlow },
  poiseuille: { label: 'Poiseuille (analytic)', make: poiseuille },
  cavity: { label: 'Lid-driven cavity', make: lidCavity },
};
