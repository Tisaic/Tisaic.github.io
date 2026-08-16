// Conservation, on the CPU reference backend.
//
// A lattice Boltzmann step is a permutation (streaming) followed by a local
// operator that leaves the zeroth and first moments alone (BGK collision). So
// in a periodic box with no forcing, mass and momentum must be conserved to
// ROUND-OFF -- not approximately, not on average. Anything else means the
// streaming lost a population or the collision is not moment-preserving, and
// both of those produce simulations that still look like fluid.
//
// EVERY CONSERVATION CHECK IS RUN AT BOTH PRECISIONS, and that is the point.
// The shipped storage is f32, to match the GPU, and at f32 the residual is
// around 1e-8 -- which is either arithmetic or a bug, and the number alone
// cannot tell you which. Re-running the identical simulation with f64 storage
// separates them: arithmetic collapses by seven orders of magnitude, a bug
// does not move. So the tolerances below are precision-dependent and the f64
// row is the one that actually proves the physics.
import { Simulation } from '../../lib/lattsim/simulation.js';
import { LBMFluidOperator } from '../../lib/lattsim/operators/lbm.js';
import { TOPOLOGY } from '../../lib/lattsim/lattice.js';
import { region, CELL } from '../../lib/lattsim/materials.js';
import { Q, C, W, INV_CS2, INV_2CS4 } from '../../lib/lattsim/d3q19.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nlattsim: conservation (CPU reference)');

const SIZE = [16, 16, 16];
const PERIODIC = [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC];
// f32 carries ~7 decimal digits; summing 4096 cells and stepping hundreds of
// times lands the drift here. f64 carries ~16 and lands seven decades lower.
const TOL = { f32: { mass: 1e-6, mom: 1e-4, wall: 1e-6 }, f64: { mass: 1e-13, mom: 1e-11, wall: 1e-12 } };

async function periodicBox(precision, { tau = 0.8, force = [0, 0, 0] } = {}) {
  const sim = new Simulation({ lattice: { size: SIZE, spacing: 1e-3, topology: PERIODIC } });
  sim.addPhysics(new LBMFluidOperator({ tau, force }));
  await sim.build({ backend: 'cpu', precision });
  return sim;
}

/** A swirl, so streaming is genuinely exercised -- a uniform field would be
 *  conserved by almost any bug. */
function seedSwirl(sim, amp = 0.05) {
  const { lattice, backend } = sim;
  const N = lattice.cellCount;
  const f = backend.read('f');
  const macro = backend.write('macro');
  lattice.forEachCell((x, y, z, i) => {
    const kx = 2 * Math.PI * x / lattice.nx, ky = 2 * Math.PI * y / lattice.ny;
    const kz = 2 * Math.PI * z / lattice.nz;
    const ux = amp * Math.sin(kx) * Math.cos(ky) * Math.cos(kz);
    const uy = -amp * Math.cos(kx) * Math.sin(ky) * Math.cos(kz);
    const uz = amp * 0.3 * Math.cos(kx) * Math.cos(ky) * Math.sin(kz);
    const rho = 1 + 0.01 * Math.sin(kx + ky);
    const uu = ux * ux + uy * uy + uz * uz;
    for (let q = 0; q < Q; q++) {
      const cu = C[q][0] * ux + C[q][1] * uy + C[q][2] * uz;
      f[q * N + i] = W[q] * rho * (1 + INV_CS2 * cu + INV_2CS4 * cu * cu - 1.5 * uu);
    }
    macro[i] = rho; macro[N + i] = ux; macro[2 * N + i] = uy; macro[3 * N + i] = uz;
  });
  backend.buffers.get('f').b.set(f);
}

const residuals = {};

for (const p of ['f32', 'f64']) {
  const tol = TOL[p];
  console.log(`  -- ${p} storage`);

  // ------------------------------------------------ mass + momentum, unforced
  {
    const sim = await periodicBox(p);
    seedSwirl(sim);
    const d0 = await sim.diagnostics();
    sim.advance(200);
    const d1 = await sim.diagnostics();

    const dm = Math.abs(d1.mass - d0.mass) / d0.mass;
    // Normalise the momentum drift by the momentum that is actually PRESENT in
    // the flow (mass x peak speed), not by the net momentum. The seeded swirl
    // is symmetric, so its net momentum is ~0 and dividing by it measures the
    // denominator rather than the physics -- which is how the first version of
    // this test reported a 1.5e-2 "drift" that was two near-zero numbers.
    const scale = d0.mass * Math.max(d0.uMax, 1e-9);
    const dp = Math.hypot(...d1.momentum.map((v, k) => v - d0.momentum[k])) / scale;
    residuals[p] = { mass: dm, mom: dp };

    check(`[${p}] mass conserved over 200 steps (periodic, unforced)`, dm < tol.mass, dm.toExponential(3));
    check(`[${p}] momentum conserved over 200 steps`, dp < tol.mom, dp.toExponential(3));
    check(`[${p}] the seeded flow is actually moving`, d0.uMax > 1e-3, String(d0.uMax));
    check(`[${p}] the run stayed stable`, d1.stable.state === 'ok', JSON.stringify(d1.stable));
    check(`[${p}] viscosity decays the kinetic energy`, d1.kineticEnergy < d0.kineticEnergy,
      `${d0.kineticEnergy.toExponential(3)} -> ${d1.kineticEnergy.toExponential(3)}`);
    sim.destroy();
  }

  // ------------------------------------------------ forcing injects exactly F
  {
    // Guo forcing must add exactly F of momentum per cell per step. Measured as
    // a SLOPE between two step counts rather than against an absolute value,
    // because the macroscopic field is written mid-step and the constant offset
    // that introduces is bookkeeping, not physics.
    const F = 1e-5;
    const sim = await periodicBox(p, { force: [F, 0, 0] });
    sim.advance(20);
    const a = await sim.diagnostics();
    sim.advance(80);
    const b = await sim.diagnostics();
    const perStep = (b.momentum[0] - a.momentum[0]) / (80 * sim.lattice.cellCount);
    const err = Math.abs(perStep - F) / F;
    check(`[${p}] a body force injects exactly F per cell per step`, err < (p === 'f32' ? 2e-3 : 1e-9),
      `${perStep.toExponential(6)} vs ${F.toExponential(6)} (rel ${err.toExponential(2)})`);
    check(`[${p}] mass still conserved under forcing`,
      Math.abs(b.mass - a.mass) / a.mass < tol.mass, Math.abs(b.mass - a.mass).toExponential(3));
    sim.destroy();
  }

  // ------------------------------------------------ the f32 forcing floor
  // A MEASURED NUMERICAL LIMIT, asserted so it stays visible. In f32 storage a
  // per-step forcing increment of ~1e-7 lands below the resolution of the
  // populations it is added to (w*rho ~ 0.055, eps*0.055 ~ 6.5e-9), so part of
  // every increment is rounded away and the flow is driven slightly weakly.
  // This applies to the GPU backend too -- it is a property of f32, not of this
  // implementation. Drive with a bigger force and fewer steps, or accept it.
  if (p === 'f32') {
    const F = 1e-7;
    const sim = await periodicBox(p, { force: [F, 0, 0] });
    sim.advance(20);
    const a = await sim.diagnostics();
    sim.advance(80);
    const b = await sim.diagnostics();
    const perStep = (b.momentum[0] - a.momentum[0]) / (80 * sim.lattice.cellCount);
    const err = Math.abs(perStep - F) / F;
    check('[f32] tiny forces (1e-7) lose >0.1% to round-off — a real limit, pinned',
      err > 1e-3, `rel error ${err.toExponential(2)} (if this now passes cleanly, f32 got better or the test moved)`);
    sim.destroy();
  }

  // ------------------------------------------------ closed box / bounce-back
  {
    // Bounce-back must not create or destroy mass. This is the check that
    // catches a streaming bug at the boundary, which is where they all are.
    const sim = new Simulation({ lattice: { size: SIZE, spacing: 1e-3 } });
    for (const axis of [0, 1, 2]) {
      sim.addRegion(region.wall(CELL.SOLID, axis, -1)).addRegion(region.wall(CELL.SOLID, axis, +1));
    }
    sim.addPhysics(new LBMFluidOperator({ tau: 0.8 }));
    await sim.build({ backend: 'cpu', precision: p });
    seedSwirl(sim, 0.03);
    const d0 = await sim.diagnostics();
    sim.advance(300);
    const d1 = await sim.diagnostics();
    const dm = Math.abs(d1.mass - d0.mass) / d0.mass;
    check(`[${p}] mass conserved in a closed box (bounce-back walls)`, dm < tol.wall, dm.toExponential(3));
    check(`[${p}] a closed box spins down`, d1.kineticEnergy < 0.5 * d0.kineticEnergy,
      `${d0.kineticEnergy.toExponential(3)} -> ${d1.kineticEnergy.toExponential(3)}`);
    check(`[${p}] solid cells were actually created`, sim.cellCensus().SOLID > 0,
      JSON.stringify(sim.cellCensus()));
    sim.destroy();
  }
}

// ---------------------------------------------------------------- the verdict
// This is the check that turns "the residual is small" into "the residual is
// arithmetic". If a real conservation bug were introduced, the f64 run would
// not improve and this ratio would collapse toward 1.
const gain = residuals.f32.mass / Math.max(residuals.f64.mass, Number.MIN_VALUE);
check('the mass residual is ARITHMETIC, not a leak (f64 improves it >1e4x)', gain > 1e4,
  `f32 ${residuals.f32.mass.toExponential(2)} vs f64 ${residuals.f64.mass.toExponential(2)} = ${gain.toExponential(1)}x`);

console.log(failed ? `\n  ${failed} check(s) failed\n` : '  all checks passed\n');
process.exit(failed ? 1 : 0);
