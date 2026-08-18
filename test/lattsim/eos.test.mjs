// The equation-of-state pressure force: sound speed is the analytic check.
//
// Standard isothermal LBM fixes the pressure at p = rho*cs^2, so the sound speed
// is not a free parameter and a fast flow drives large density swings. The EOS
// force F = -grad(p(rho) - rho*cs^2) makes the effective pressure p(rho) and the
// effective sound speed sqrt(dp/drho) a knob. A pressure PULSE must then propagate
// at that speed -- measured here from a standing acoustic wave, whose antinode
// oscillates at period Nx / c_eff.
//
// This is the same class of check as Poiseuille for the shear viscosity: a closed
// form the solver must reproduce, not a plausibility argument.
import { Simulation } from '../../lib/lattsim/simulation.js';
import { LBMFluidOperator } from '../../lib/lattsim/operators/lbm.js';
import { TOPOLOGY } from '../../lib/lattsim/lattice.js';
import { region, CELL } from '../../lib/lattsim/materials.js';
import { CS2, feq } from '../../lib/lattsim/d3q19.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nlattsim: equation of state (sound speed)');

async function soundSpeed({ eos = 'ideal', soundSpeed = null, eosParam = 0 }) {
  const Nx = 64, Ny = 4, Nz = 4, eps = 1e-3;
  const sim = new Simulation({ lattice: { size: [Nx, Ny, Nz], spacing: 1e-3,
    topology: [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC] } });
  sim.addPhysics(new LBMFluidOperator({ tau: 0.6, collision: 'bgk', eos, soundSpeed, eosParam }));
  await sim.build({ backend: 'cpu' });
  const be = sim.backend, N = Nx * Ny * Nz, f = be.read('f');
  for (let x = 0; x < Nx; x++) for (let y = 0; y < Ny; y++) for (let z = 0; z < Nz; z++) {
    const i = x + Nx * (y + Ny * z), rho = 1 + eps * Math.cos(2 * Math.PI * x / Nx);
    for (let q = 0; q < 19; q++) f[q * N + i] = feq(q, rho, 0, 0, 0);
  }
  const probe = 0 + Nx * (2 + Ny * 2);
  const series = [];
  for (let t = 0; t < 400; t++) {
    let r = 0; const ff = be.read('f'); for (let q = 0; q < 19; q++) r += ff[q * N + probe];
    series.push(r - 1); sim.advance(1);
  }
  const cross = [];
  for (let t = 1; t < series.length; t++) {
    if ((series[t - 1] >= 0) !== (series[t] >= 0)) {
      cross.push(t - 1 + series[t - 1] / (series[t - 1] - series[t]));
    }
  }
  return Nx / (2 * (cross[1] - cross[0]));
}

{
  const c = await soundSpeed({ eos: 'ideal' });
  check('ideal gas propagates sound at cs = 1/sqrt(3)',
    Math.abs(c - Math.sqrt(CS2)) / Math.sqrt(CS2) < 0.01, c);
}
{
  const c = await soundSpeed({ eos: 'linear', soundSpeed: 0.80 });
  check('a stiffer EOS raises the sound speed to its set value',
    Math.abs(c - 0.80) / 0.80 < 0.01, c);
}
{
  const c = await soundSpeed({ eos: 'linear', soundSpeed: 0.45 });
  check('a softer EOS lowers it', Math.abs(c - 0.45) / 0.45 < 0.02, c);
}
{
  // A NON-IDEAL fluid: the sound speed rises with density, sqrt(cs^2 + 2*a*rho).
  const c = await soundSpeed({ eos: 'quadratic', eosParam: 0.2 });
  const expect = Math.sqrt(CS2 + 2 * 0.2 * 1);
  check('a quadratic EOS gives a density-dependent sound speed',
    Math.abs(c - expect) / expect < 0.02, `${c.toFixed(4)} vs ${expect.toFixed(4)}`);
}

// IDEAL MUST BE A PERFECT NO-OP -- psi = 0, so an 'ideal' run is byte-identical to
// one that never touched the EOS code. Anything else is a regression to every
// analytic case this engine is already verified against.
{
  async function run(eos) {
    const sim = new Simulation({ lattice: { size: [16, 16, 16], spacing: 1e-3,
      topology: [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.BOUNDED] } });
    sim.addRegion(region.wall(CELL.SOLID, 2, -1)).addRegion(region.wall(CELL.SOLID, 2, +1));
    sim.addPhysics(new LBMFluidOperator({ tau: 0.8, force: [1e-5, 0, 0], collision: 'trt', eos }));
    await sim.build({ backend: 'cpu' });
    sim.advance(200);
    return Float64Array.from(sim.backend.read('f'));
  }
  const a = await run('ideal'), b = await run(undefined);
  let maxdiff = 0; for (let i = 0; i < a.length; i++) maxdiff = Math.max(maxdiff, Math.abs(a[i] - b[i]));
  check('the ideal EOS is byte-identical to no EOS at all', maxdiff === 0, maxdiff);
}

console.log(failed ? `\n${failed} check(s) failed\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
