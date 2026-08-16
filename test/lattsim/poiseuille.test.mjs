// Poiseuille flow: the solver against a closed-form answer.
//
// Conservation says the scheme does not leak. It does NOT say the scheme
// solves Navier-Stokes. This does: force-driven flow between two parallel
// plates has an exact parabolic solution,
//
//     u(z) = F/(2 rho nu) * ( (H/2)^2 - (z - zc)^2 )
//
// and a wrong viscosity, a wrong forcing prefactor, or a wall in the wrong
// place all show up here as a profile that is the wrong SHAPE or the wrong
// HEIGHT while still looking like a perfectly plausible flow on screen.
//
// THE WALL POSITION IS THE SUBTLE PART. Halfway bounce-back does not put the
// no-slip surface on the solid node; it puts it halfway between the last fluid
// node and the first solid node. With solid layers at z=0 and z=Nz-1 the walls
// are at z=0.5 and z=Nz-1.5, so H = Nz-2 and the centreline is (Nz-1)/2. Using
// H = Nz-1 instead gives an error of a few percent that reads as "acceptable
// numerical error" and is actually a modelling mistake, so the correct H is
// asserted to fit BETTER than the plausible wrong ones.
import { Simulation } from '../../lib/lattsim/simulation.js';
import { LBMFluidOperator } from '../../lib/lattsim/operators/lbm.js';
import { TOPOLOGY } from '../../lib/lattsim/lattice.js';
import { region, CELL } from '../../lib/lattsim/materials.js';
import { UnitSystem } from '../../lib/lattsim/units.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nlattsim: Poiseuille flow vs the analytic profile');

/**
 * Force-driven planar channel. Periodic along x and y, solid slabs at the z
 * faces. The exact solution is one-dimensional, so the transverse extent can be
 * tiny -- which is what makes this cheap enough to run on every invocation.
 */
async function channel({ nz, tau, force, precision = 'f64' }) {
  const sim = new Simulation({
    lattice: {
      size: [4, 4, nz], spacing: 1e-3,
      topology: [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.BOUNDED],
    },
  });
  sim.addRegion(region.wall(CELL.SOLID, 2, -1)).addRegion(region.wall(CELL.SOLID, 2, +1));
  sim.addPhysics(new LBMFluidOperator({ tau, force: [force, 0, 0] }));
  await sim.build({ backend: 'cpu', precision });
  return sim;
}

/** Mid-column velocity profile u_x(z) over the fluid nodes. */
async function profile(sim) {
  const N = sim.lattice.cellCount;
  const macro = await sim.backend.snapshot('macro');
  const out = [];
  for (let z = 1; z < sim.lattice.nz - 1; z++) out.push({ z, u: macro[N + sim.lattice.index(2, 2, z)] });
  return out;
}

/**
 * Run to steady state rather than for a fixed step count. The transient decays
 * as exp(-pi^2 nu t / H^2), so the required number of steps varies by more than
 * an order of magnitude across the cases below; converging on the answer keeps
 * the whole file fast without under-running the slow ones.
 */
async function toSteady(sim, { tol = 1e-7, chunk = 200, maxSteps = 60000 } = {}) {
  let prev = 0, steps = 0;
  for (; steps < maxSteps; steps += chunk) {
    sim.advance(chunk);
    const peak = Math.max(...(await profile(sim)).map((p) => p.u));
    if (prev > 0 && Math.abs(peak - prev) / peak < tol) return { steps, converged: true };
    prev = peak;
  }
  return { steps, converged: false };
}

const analytic = (z, H, zc, F, nu, rho = 1) => (F / (2 * rho * nu)) * ((H / 2) ** 2 - (z - zc) ** 2);

function l2(prof, H, zc, F, nu) {
  let num = 0, den = 0;
  for (const { z, u } of prof) {
    const a = analytic(z, H, zc, F, nu);
    num += (u - a) ** 2; den += a * a;
  }
  return Math.sqrt(num / den);
}

// ------------------------------------------------------------------ main case
const NZ = 15, TAU = 1.0, F = 1.6e-4;
const NU = UnitSystem.latticeViscosityFromTau(TAU);
const H = NZ - 2, ZC = (NZ - 1) / 2;

{
  const sim = await channel({ nz: NZ, tau: TAU, force: F });
  const conv = await toSteady(sim);
  const prof = await profile(sim);
  const d = await sim.diagnostics();
  const err = l2(prof, H, ZC, F, NU);
  const uMaxNum = Math.max(...prof.map((p) => p.u));
  const uMaxAna = analytic(ZC, H, ZC, F, NU);

  console.log(`    H=${H}, zc=${ZC}, nu=${NU.toFixed(5)}, converged in ${conv.steps} steps; `
    + `peak ${uMaxNum.toExponential(4)} vs analytic ${uMaxAna.toExponential(4)}`);

  check('reaches steady state', conv.converged, String(conv.steps));
  check('the flow is stable', d.stable.state === 'ok', JSON.stringify(d.stable));
  check('profile matches the analytic parabola within 1% (L2)', err < 0.01, err.toExponential(3));
  check('peak velocity matches within 1%', Math.abs(uMaxNum / uMaxAna - 1) < 0.01,
    (uMaxNum / uMaxAna - 1).toExponential(3));
  check('the profile is symmetric about the centreline',
    Math.abs(prof[0].u - prof[prof.length - 1].u) / uMaxNum < 1e-6,
    Math.abs(prof[0].u - prof[prof.length - 1].u).toExponential(3));
  check('no-slip is respected (first fluid node well below the peak)', prof[0].u < 0.25 * uMaxNum,
    `${prof[0].u.toExponential(3)} vs peak ${uMaxNum.toExponential(3)}`);
  check('H = Nz-2 (halfway bounce-back) beats H = Nz-1 and H = Nz-3',
    err < l2(prof, H + 1, ZC, F, NU) && err < l2(prof, H - 1, ZC, F, NU),
    `H-1 ${l2(prof, H - 1, ZC, F, NU).toExponential(2)} | H ${err.toExponential(2)} `
    + `| H+1 ${l2(prof, H + 1, ZC, F, NU).toExponential(2)}`);
  sim.destroy();
}

// ------------------------------------------ the BGK bounce-back slip, measured
//
// A KNOWN AND IMPORTANT LIMITATION, tested as a prediction rather than hidden
// behind a loose tolerance. With a single relaxation time, the effective wall
// position of bounce-back depends on tau: the boundary is exactly halfway only
// when the magic parameter Lambda = (tau - 1/2)^2 equals 3/16, i.e. at
// tau = 1/2 + sqrt(3/16) ~ 0.933 (Ginzburg & d'Humieres). Away from that the
// wall drifts and the profile height is wrong -- at tau = 1.5 by several
// percent, in a simulation that still looks entirely reasonable.
//
// This is exactly why the LBM operator takes a `collision` parameter instead of
// hard-coding BGK: a two-relaxation-time or MRT collision fixes it by choosing
// the second relaxation rate to hold Lambda = 3/16 at any viscosity. Until that
// ships, THIS is the accuracy envelope, and it is asserted so nobody discovers
// it by accident at tau = 3.
{
  const TAU_MAGIC = 0.5 + Math.sqrt(3 / 16);
  const rows = [];
  for (const tau of [0.6, 0.8, TAU_MAGIC, 1.0, 1.5, 2.5]) {
    const nu = UnitSystem.latticeViscosityFromTau(tau);
    const force = 0.02 * 8 * nu / (H * H);          // hold the peak velocity fixed
    const sim = await channel({ nz: NZ, tau, force });
    await toSteady(sim);
    const err = l2(await profile(sim), H, ZC, force, nu);
    rows.push({ tau, nu, err });
    sim.destroy();
  }
  for (const r of rows) {
    console.log(`    tau=${r.tau.toFixed(3)} (nu=${r.nu.toFixed(4)}): L2 ${r.err.toExponential(3)}`);
  }
  const at = (t) => rows.find((r) => Math.abs(r.tau - t) < 1e-9).err;
  check('accurate to 1% in the usable band tau in [0.6, 1.0]',
    [0.6, 0.8, 1.0].every((t) => at(t) < 0.01), [0.6, 0.8, 1.0].map((t) => at(t).toExponential(2)).join(', '));
  check('the error minimum sits at the predicted tau = 1/2 + sqrt(3/16) ~ 0.933',
    at(TAU_MAGIC) === Math.min(...rows.map((r) => r.err)), rows.map((r) => r.err.toExponential(2)).join(', '));
  check('BGK bounce-back degrades at large tau (>2% at tau=1.5, worse at 2.5)',
    at(1.5) > 0.02 && at(2.5) > at(1.5), `${at(1.5).toExponential(2)} then ${at(2.5).toExponential(2)}`);
}

// ------------------------------------------------ resolution scaling
// Refining the lattice must not make the answer worse, and for a second-order
// scheme the error should fall roughly as the square of the resolution.
{
  const rows = [];
  for (const nz of [9, 15, 25]) {
    const h = nz - 2, zc = (nz - 1) / 2;
    const force = 0.02 * 8 * NU / (h * h);          // fixed peak velocity
    const t0 = Date.now();
    const sim = await channel({ nz, tau: TAU, force });
    const conv = await toSteady(sim);
    const err = l2(await profile(sim), h, zc, force, NU);
    rows.push({ nz, cells: sim.lattice.cellCount, err, steps: conv.steps, ms: Date.now() - t0 });
    sim.destroy();
  }
  for (const r of rows) {
    console.log(`    nz=${r.nz} (${r.cells} cells, ${r.steps} steps): L2 ${r.err.toExponential(3)} in ${r.ms} ms`);
  }
  check('every resolution matches within 2%', rows.every((r) => r.err < 0.02),
    rows.map((r) => r.err.toExponential(2)).join(', '));
  const order = Math.log(rows[0].err / rows[2].err) / Math.log((rows[2].nz - 2) / (rows[0].nz - 2));
  check('convergence is at least first order, consistent with second', order > 1.5, `observed order ${order.toFixed(2)}`);
}

// ------------------------------------------------ f32 parity
// The shipped storage is f32. It must reproduce the f64 answer, or the GPU
// backend is solving a different problem from the one verified above.
{
  const a = await channel({ nz: NZ, tau: TAU, force: F, precision: 'f64' });
  const b = await channel({ nz: NZ, tau: TAU, force: F, precision: 'f32' });
  await toSteady(a); await toSteady(b);
  const pa = await profile(a), pb = await profile(b);
  let worst = 0;
  for (let i = 0; i < pa.length; i++) worst = Math.max(worst, Math.abs(pa[i].u - pb[i].u) / pa[i].u);
  check('f32 reproduces the f64 profile to better than 0.5%', worst < 5e-3, worst.toExponential(3));
  a.destroy(); b.destroy();
}

console.log(failed ? `\n  ${failed} check(s) failed\n` : '  all checks passed\n');
process.exit(failed ? 1 : 0);
