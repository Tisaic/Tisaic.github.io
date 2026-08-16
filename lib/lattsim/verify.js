// In-page verification: the same checks test/lattsim/*.test.mjs runs in Node,
// executed in the browser against whichever backend is live.
//
// The Node tests verify the CPU reference. This verifies the backend the user
// is actually looking at -- which on a phone is the WGSL one, and which nothing
// in CI can reach. Same protocol, same analytic answers, so a WGSL kernel that
// disagrees with the verified reference is caught by the user's own hardware
// rather than by nobody.

import { Simulation } from './simulation.js';
import { LBMFluidOperator } from './operators/lbm.js';
import { TOPOLOGY } from './lattice.js';
import { region, CELL } from './materials.js';
import { UnitSystem } from './units.js';
import { formatBytes } from './fields.js';

const analytic = (z, H, zc, F, nu) => (F / (2 * nu)) * ((H / 2) ** 2 - (z - zc) ** 2);

export async function runVerification(log, backendKind = 'auto') {
  const backend = backendKind === 'cpu' ? 'cpu' : 'auto';
  let failed = 0;
  const check = (name, ok, detail) => {
    log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
    if (!ok) failed++;
  };

  log('LATTSIM VERIFICATION');
  log('='.repeat(60));

  // ------------------------------------------------------------ 1. conservation
  log('\n1. CONSERVATION — periodic box, no forcing, no walls');
  {
    const P = [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC];
    const sim = new Simulation({ lattice: { size: [24, 24, 24], spacing: 1e-3, topology: P } });
    sim.addPhysics(new LBMFluidOperator({ tau: 0.8, inletVelocity: [0.04, 0, 0] }));
    // Every cell driven at build time, then released: gives a uniform stream
    // with no walls, so both mass and momentum must be exactly held.
    sim.addRegion(region.all(CELL.MOVING));
    await sim.build({ backend });
    log(`   backend: ${sim.backend.label}, ${sim.lattice.describe()}`);

    sim.solver.operators[0].enabled = true;
    sim.advance(1);
    // Release the drive so the flow coasts.
    sim.flags.fill(CELL.FLUID);
    if (sim.backend.kind === 'webgpu') {
      sim.backend.device.queue.writeBuffer(sim.backend.flagBuffer, 0, sim.flags);
    }
    const d0 = await sim.diagnostics();
    sim.advance(300);
    const d1 = await sim.diagnostics();

    const dm = Math.abs(d1.mass - d0.mass) / d0.mass;
    const dp = Math.abs(d1.momentum[0] - d0.momentum[0]) / Math.max(Math.abs(d0.momentum[0]), 1e-12);
    log(`   mass ${d0.mass.toExponential(8)} → ${d1.mass.toExponential(8)}`);
    log(`   momentum_x ${d0.momentum[0].toExponential(6)} → ${d1.momentum[0].toExponential(6)}`);
    // f32 storage over 300 steps and 13824 cells: ~1e-6 is arithmetic, not a leak.
    check('mass conserved to f32 round-off (< 1e-5)', dm < 1e-5, dm.toExponential(2));
    check('momentum conserved to f32 round-off (< 1e-4)', dp < 1e-4, dp.toExponential(2));
    check('the flow is genuinely moving', d0.uMax > 1e-3, d0.uMax.toExponential(2));
    check('stable', d1.stable.state === 'ok', JSON.stringify(d1.stable));
    sim.destroy();
  }

  // ------------------------------------------------------------ 2. Poiseuille
  log('\n2. POISEUILLE — force-driven channel vs the exact parabola');
  {
    const NZ = 25, TAU = 0.5 + Math.sqrt(3 / 16);     // the tau where bounce-back is exact
    const nu = UnitSystem.latticeViscosityFromTau(TAU);
    const H = NZ - 2, zc = (NZ - 1) / 2;
    const F = 0.02 * 8 * nu / (H * H);
    const sim = new Simulation({
      lattice: {
        size: [8, 8, NZ], spacing: 1e-3,
        topology: [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.BOUNDED],
      },
    });
    sim.addRegion(region.wall(CELL.SOLID, 2, -1)).addRegion(region.wall(CELL.SOLID, 2, +1));
    sim.addPhysics(new LBMFluidOperator({ tau: TAU, force: [F, 0, 0] }));
    await sim.build({ backend });

    let prev = 0, steps = 0;
    for (; steps < 40000; steps += 500) {
      sim.advance(500);
      const m = await sim.backend.snapshot('macro');
      const peak = m[sim.lattice.cellCount + sim.lattice.index(4, 4, Math.round(zc))];
      if (prev > 0 && Math.abs(peak - prev) / peak < 1e-6) break;
      prev = peak;
    }

    const N = sim.lattice.cellCount;
    const macro = await sim.backend.snapshot('macro');
    let num = 0, den = 0, peak = 0;
    for (let z = 1; z < NZ - 1; z++) {
      const u = macro[N + sim.lattice.index(4, 4, z)];
      const a = analytic(z, H, zc, F, nu);
      num += (u - a) ** 2; den += a * a;
      peak = Math.max(peak, u);
    }
    const err = Math.sqrt(num / den);
    log(`   converged in ${steps} steps; τ=${TAU.toFixed(4)}, H=${H}, peak ${peak.toExponential(4)} `
      + `vs analytic ${analytic(zc, H, zc, F, nu).toExponential(4)}`);
    log(`   relative L2 error: ${err.toExponential(3)}`);
    check('matches the analytic parabola within 1% (L2)', err < 0.01, err.toExponential(3));
    check('no-slip holds at the wall', macro[N + sim.lattice.index(4, 4, 1)] < 0.25 * peak);
    sim.destroy();
  }

  // ------------------------------------------------------------ 3. obstacle flow
  log('\n3. OBSTACLE FLOW — no closed form, so: bounded, conservative, separating');
  {
    const { channelFlow } = await import('./scenes.js');
    const sim = channelFlow({ resolution: 32, tau: 0.55, inletVelocity: 0.06 });
    await sim.build({ backend });
    sim.advance(1200);
    const d = await sim.diagnostics();
    const N = sim.lattice.cellCount;
    const macro = await sim.backend.snapshot('macro');
    const L = sim.lattice;
    const cx = Math.round(32 * 0.55);
    const upstream = macro[N + L.index(Math.max(1, cx - 10), 16, 16)];
    const wake = macro[N + L.index(Math.min(L.nx - 2, cx + 8), 16, 16)];
    log(`   ${L.describe()}`);
    log(`   upstream u_x ${upstream.toExponential(3)} · wake u_x ${wake.toExponential(3)} · max|u| ${d.uMax.toFixed(4)}`);
    check('the run stayed bounded', d.stable.state !== 'diverged', JSON.stringify(d.stable));
    check('the obstacle actually blocks the flow (wake is slower than upstream)',
      wake < upstream * 0.9, `${wake.toExponential(3)} vs ${upstream.toExponential(3)}`);
    check('density stayed physical', d.rhoMin > 0.5 && d.rhoMax < 1.5, `${d.rhoMin} … ${d.rhoMax}`);
    check('solid cells exist', sim.cellCensus().SOLID > 0, JSON.stringify(sim.cellCensus()));
    sim.destroy();
  }

  // ------------------------------------------------------------ 4. scaling
  log('\n4. RESOLUTION SCALING — cells, throughput, memory');
  {
    const { channelFlow } = await import('./scenes.js');
    log('   ' + ['res', 'cells', 'memory', 'steps/s', 'MLUPS'].map((s) => s.padStart(11)).join(''));
    for (const res of [16, 24, 32, 48]) {
      const sim = channelFlow({ resolution: res });
      const mem = sim.memoryEstimate().bytes;
      try {
        await sim.build({ backend });
      } catch (e) {
        log(`   ${String(res).padStart(11)}${'—'.padStart(11)}  ${String(e.message).slice(0, 44)}`);
        continue;
      }
      sim.advance(20);                                  // warm up pipelines
      await sim.diagnostics();                          // and flush
      const t0 = performance.now();
      const n = 100;
      sim.advance(n);
      await sim.diagnostics();                          // force completion before timing
      const dt = performance.now() - t0;
      const rate = n * 1000 / dt;
      log('   ' + [`${res}³`, sim.lattice.cellCount.toLocaleString(), formatBytes(mem),
        rate.toFixed(0), (rate * sim.lattice.cellCount / 1e6).toFixed(1)]
        .map((s) => String(s).padStart(11)).join(''));
      sim.destroy();
    }
  }

  log('\n' + '='.repeat(60));
  log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
  return failed;
}
