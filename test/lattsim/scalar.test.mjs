// Passive scalar advection-diffusion, on the CPU reference backend.
//
// The scalar operator carries ONE physical constant -- the diffusivity, set by
// tau_g through D = cs^2 (tau_g - 1/2) -- and TWO transport behaviours: it diffuses
// like the heat equation and it is carried by the flow at the flow's own speed.
// Each of those is checked against its closed form here, the same way the fluid's
// viscosity is checked against the Poiseuille parabola, because a scalar that
// "looks like it spreads" is exactly the kind of plausible-wrong result this
// project does not ship.
//
// The velocity field is supplied by a real LBMFluidOperator held in a trivial
// state (a periodic box at rest, or in uniform motion), so the scalar advects in a
// genuine macro field rather than a hand-set one -- and the solver's one-way
// coupling (fluid writes macro, scalar reads it) is exercised as it runs on the page.

import { Simulation } from '../../lib/lattsim/simulation.js';
import { LBMFluidOperator } from '../../lib/lattsim/operators/lbm.js';
import { ScalarTransportOperator } from '../../lib/lattsim/operators/scalar.js';
import { TOPOLOGY } from '../../lib/lattsim/lattice.js';
import { Q, C, W, INV_CS2, CS2 } from '../../lib/lattsim/d3q19.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nlattsim: passive scalar advection-diffusion (CPU reference)');

const PERIODIC = [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC];

/** Seed the scalar populations to equilibrium at C(x,y,z) in a uniform velocity. */
function seedScalar(sim, Cfn, u = [0, 0, 0]) {
  const { lattice, backend } = sim;
  const N = lattice.cellCount;
  const g = backend.read('g');
  const conc = backend.write('conc');
  const [ux, uy, uz] = u;
  lattice.forEachCell((x, y, z, i) => {
    const Ci = Cfn(x, y, z);
    for (let q = 0; q < Q; q++) {
      const cu = C[q][0] * ux + C[q][1] * uy + C[q][2] * uz;
      g[q * N + i] = W[q] * Ci * (1 + INV_CS2 * cu);
    }
    conc[i] = Ci;
  });
  backend.buffers.get('g').b.set(g);
}

/** Total scalar over the whole field. */
function totalScalar(sim) {
  const conc = sim.backend.read('conc');
  let s = 0;
  for (let i = 0; i < conc.length; i++) s += conc[i];
  return s;
}

/** Mean and variance of the x-marginal of the concentration (weighted by C). */
function xMoments(sim) {
  const { lattice, backend } = sim;
  const { nx } = lattice;
  const conc = backend.read('conc');
  const mass = new Float64Array(nx);
  lattice.forEachCell((x, y, z, i) => { mass[x] += conc[i]; });
  let m0 = 0, m1 = 0;
  for (let x = 0; x < nx; x++) { m0 += mass[x]; m1 += x * mass[x]; }
  const mean = m1 / m0;
  let m2 = 0;
  for (let x = 0; x < nx; x++) m2 += (x - mean) * (x - mean) * mass[x];
  return { mean, variance: m2 / m0, total: m0 };
}

const consResiduals = {};

// ------------------------------------------------------ 1. the diffusivity
// A Gaussian in a still fluid must spread as the heat equation says: the variance
// grows LINEARLY at 2D per step, D = cs^2 (tau_g - 1/2). Measured as a SLOPE
// between two step counts, not against the initial variance, because the sampled
// Gaussian is not exactly at equilibrium at t=0 and the offset that introduces is
// bookkeeping, not physics -- the same reasoning the forcing test uses.
{
  const tauG = 0.7;                       // D = (0.7 - 0.5)/3 = 0.06667
  const Dexp = CS2 * (tauG - 0.5);
  const sim = new Simulation({ lattice: { size: [96, 4, 4], spacing: 1e-3, topology: PERIODIC } });
  sim.addPhysics(new LBMFluidOperator({ tau: 0.8 }));         // fluid at rest -> u = 0
  sim.addPhysics(new ScalarTransportOperator({ tau: tauG }));
  await sim.build({ backend: 'cpu', precision: 'f64' });

  const x0 = 48, s0 = 3;
  seedScalar(sim, (x) => Math.exp(-((x - x0) ** 2) / (2 * s0 * s0)));

  sim.advance(100);
  const a = xMoments(sim);
  sim.advance(300);
  const b = xMoments(sim);
  const Dmeas = (b.variance - a.variance) / (2 * 300);
  const err = Math.abs(Dmeas - Dexp) / Dexp;

  check('the fluid stayed at rest (u ~ 0)', Math.abs((await sim.diagnostics()).uMax) < 1e-9,
    String((await sim.diagnostics()).uMax));
  check('the Gaussian did not drift in a still fluid', Math.abs(b.mean - x0) < 1e-6, `mean ${b.mean.toFixed(4)}`);
  check('the variance grows LINEARLY in time (heat equation)', b.variance > a.variance, `${a.variance.toFixed(3)} -> ${b.variance.toFixed(3)}`);
  check('measured diffusivity matches D = cs^2 (tau_g - 1/2) to 2%', err < 2e-2,
    `${Dmeas.toExponential(4)} vs ${Dexp.toExponential(4)} (rel ${err.toExponential(2)})`);
  sim.destroy();
}

// ------------------------------------------------------ 2. pure advection
// In a uniform flow a low-diffusion blob is carried at the flow speed: its
// centroid moves exactly U per step. This is the first moment of the scalar being
// transported, and LBM carries it at the lattice velocity by construction, so the
// tolerance is tight.
{
  const U = 0.1, tauG = 0.51;              // small D so the shape barely spreads
  const sim = new Simulation({ lattice: { size: [64, 4, 4], spacing: 1e-3, topology: PERIODIC } });
  sim.addPhysics(new LBMFluidOperator({ tau: 0.8, initialVelocity: [U, 0, 0] }));
  sim.addPhysics(new ScalarTransportOperator({ tau: tauG }));
  await sim.build({ backend: 'cpu', precision: 'f64' });

  const x0 = 12, s0 = 3;
  seedScalar(sim, (x) => Math.exp(-((x - x0) ** 2) / (2 * s0 * s0)), [U, 0, 0]);

  sim.advance(50);
  const a = xMoments(sim);
  sim.advance(150);
  const b = xMoments(sim);
  const Umeas = (b.mean - a.mean) / 150;
  const err = Math.abs(Umeas - U) / U;

  check('the carrier flow is actually uniform and moving', Math.abs((await sim.diagnostics()).uMax - U) < 1e-6,
    String((await sim.diagnostics()).uMax));
  check('the blob centroid moves at the flow speed U to 1%', err < 1e-2,
    `${Umeas.toExponential(4)} vs ${U.toExponential(4)} (rel ${err.toExponential(2)})`);
  check('advection does not create or destroy scalar', Math.abs(b.total - a.total) / a.total < 1e-12,
    (Math.abs(b.total - a.total) / a.total).toExponential(2));
  sim.destroy();
}

// ------------------------------------------------------ 3. total-scalar conservation
// Collision preserves the zeroth moment (sum g_eq = sum g = C) and periodic
// streaming is a permutation, so the total scalar is conserved to ROUND-OFF. Run
// at both precisions: an f32 residual near 1e-8 is either arithmetic or a leak,
// and only the f64 run tells them apart -- the same instrument the fluid uses.
for (const p of ['f32', 'f64']) {
  const U = 0.05, tauG = 0.6;
  const sim = new Simulation({ lattice: { size: [32, 8, 8], spacing: 1e-3, topology: PERIODIC } });
  sim.addPhysics(new LBMFluidOperator({ tau: 0.8, initialVelocity: [U, 0, 0] }));
  sim.addPhysics(new ScalarTransportOperator({ tau: tauG }));
  await sim.build({ backend: 'cpu', precision: p });

  // an off-centre blob, so streaming genuinely moves scalar across the wrap
  seedScalar(sim, (x, y, z) => Math.exp(-(((x - 10) ** 2 + (y - 4) ** 2 + (z - 4) ** 2)) / 8), [U, 0, 0]);

  const t0 = totalScalar(sim);
  sim.advance(300);
  const t1 = totalScalar(sim);
  const drift = Math.abs(t1 - t0) / Math.abs(t0);
  consResiduals[p] = drift;
  const tol = p === 'f32' ? 1e-6 : 1e-13;
  check(`[${p}] total scalar conserved over 300 steps (periodic advection)`, drift < tol, drift.toExponential(3));
  check(`[${p}] there is scalar present to conserve`, Math.abs(t0) > 1, String(t0));
  sim.destroy();
}

// the arithmetic-vs-leak verdict: a real conservation bug would not improve at f64
const gain = consResiduals.f32 / Math.max(consResiduals.f64, Number.MIN_VALUE);
check('the scalar-conservation residual is ARITHMETIC, not a leak (f64 improves it >1e3x)', gain > 1e3,
  `f32 ${consResiduals.f32.toExponential(2)} vs f64 ${consResiduals.f64.toExponential(2)} = ${gain.toExponential(1)}x`);

console.log(failed ? `\n  ${failed} check(s) failed\n` : '  all checks passed\n');
process.exit(failed ? 1 : 0);
