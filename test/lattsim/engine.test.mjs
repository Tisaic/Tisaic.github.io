// The engine scaffolding: indexing, units, field layout, material regions, and
// the two write-discipline rules the solver enforces.
//
// None of this is physics, which is exactly why it is worth testing: an
// indexing convention that disagrees between JS and WGSL, or a unit conversion
// applied twice, produces a simulation that runs and is wrong in a way no
// conservation check can see.
import { Lattice, TOPOLOGY } from '../../lib/lattsim/lattice.js';
import { UnitSystem, CS } from '../../lib/lattsim/units.js';
import { FieldSpec, FieldRegistry, FIELD_KIND, formatBytes } from '../../lib/lattsim/fields.js';
import { region, classify, census, CELL } from '../../lib/lattsim/materials.js';
import { Simulation } from '../../lib/lattsim/simulation.js';
import { LBMFluidOperator } from '../../lib/lattsim/operators/lbm.js';
import { PhysicsOperator } from '../../lib/lattsim/operator.js';
import { Q } from '../../lib/lattsim/d3q19.js';

// Long-horizon scenario blocks (the lid-driven cavity, the three-scene sweep and
// the residual convergence run) drive tens of thousands of JavaScript solver
// steps and dominate the suite's wall clock. They are FULL-tier; the cheap
// scaffolding and the stir impulse always run.
const FULL = process.env.SUITE === 'full';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
function throws(fn) { try { fn(); return false; } catch { return true; } }
console.log('\nlattsim: engine scaffolding');

// ------------------------------------------------------------------ lattice
{
  const L = new Lattice({ size: [7, 5, 3], spacing: 2e-3 });
  check('cell count is the product of the dimensions', L.cellCount === 105);
  check('index is x + Nx*(y + Ny*z), x fastest', L.index(1, 0, 0) === 1 && L.index(0, 1, 0) === 7
    && L.index(0, 0, 1) === 35, [L.index(1, 0, 0), L.index(0, 1, 0), L.index(0, 0, 1)].join(','));

  let roundTrip = true;
  L.forEachCell((x, y, z, i) => {
    const c = L.coords(i);
    if (c[0] !== x || c[1] !== y || c[2] !== z || L.index(x, y, z) !== i) roundTrip = false;
  });
  check('index <-> coords round-trips for every cell', roundTrip);

  let visited = 0;
  L.forEachCell(() => visited++);
  check('forEachCell visits every cell exactly once', visited === L.cellCount, String(visited));

  check('bounded axes report no neighbour off the edge', L.neighbor(0, 0, 0, -1, 0, 0) === -1);
  check('interior neighbours resolve', L.neighbor(1, 1, 1, 1, 0, 0) === L.index(2, 1, 1));

  const P = new Lattice({ size: [4, 4, 4], spacing: 1, topology: [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC] });
  check('periodic axes wrap in both directions',
    P.neighbor(0, 0, 0, -1, 0, 0) === P.index(3, 0, 0) && P.neighbor(3, 0, 0, 1, 0, 0) === P.index(0, 0, 0));

  check('position honours spacing and half-cell offset',
    Math.abs(L.position(0, 0, 0)[0] - 1e-3) < 1e-15, String(L.position(0, 0, 0)[0]));
  check('extent is dims x spacing', L.extent()[0] === 7 * 2e-3);
  check('degenerate lattices are refused', throws(() => new Lattice({ size: [1, 4, 4], spacing: 1 })));
  check('non-positive spacing is refused', throws(() => new Lattice({ size: [4, 4, 4], spacing: 0 })));
}

// -------------------------------------------------------------------- units
{
  const u = new UnitSystem({ dx: 1e-3, dt: 1e-4, rho0: 1000 });
  check('velocity round-trips', Math.abs(u.velocityToPhysical(u.velocityToLattice(2.5)) - 2.5) < 1e-12);
  check('viscosity round-trips', Math.abs(u.viscosityToPhysical(u.viscosityToLattice(1e-6)) - 1e-6) < 1e-20);
  check('length round-trips', Math.abs(u.lengthToPhysical(u.lengthToLattice(0.02)) - 0.02) < 1e-15);

  const tau = UnitSystem.tauFromLatticeViscosity(0.1);
  check('tau <-> lattice viscosity are inverses',
    Math.abs(UnitSystem.latticeViscosityFromTau(tau) - 0.1) < 1e-15, String(tau));
  check('nu = cs^2 (tau - 1/2)', Math.abs(tau - (0.1 * 3 + 0.5)) < 1e-15);
  // A non-physical viscosity must refuse rather than clamp: a silently clamped
  // tau produces a simulation with the wrong viscosity that still runs.
  check('a negative-viscosity tau is refused, not clamped',
    throws(() => UnitSystem.tauFromLatticeViscosity(-0.01)));

  const v = UnitSystem.fromVelocity({ dx: 1e-3, uPhysical: 1.0, uLattice: 0.05 });
  check('fromVelocity pins the lattice velocity', Math.abs(v.velocityToLattice(1.0) - 0.05) < 1e-15,
    String(v.velocityToLattice(1.0)));

  const a = u.audit({ uPhysical: 5.0, nuPhysical: 1e-6 });
  check('audit reports the lattice Mach number', Math.abs(a.mach - a.uLattice / CS) < 1e-12);
  check('audit warns when the lattice velocity is too high', a.warnings.some((w) => /velocity/.test(w)),
    JSON.stringify(a.warnings));
  // A genuinely well-scaled setup, and it is instructive how constrained one
  // is: dx and dt must land tau near 1 AND the lattice velocity near 0.05 at
  // the same time. Water (nu = 1e-6) at 1 mm cells forces dt = 0.1 s, so the
  // resolvable speed is 0.5 mm/s. Wanting a faster flow means finer cells or a
  // deliberately raised viscosity -- which is the real cost of LBM scaling and
  // is exactly what audit() exists to make visible before a run, not after.
  const ok = new UnitSystem({ dx: 1e-3, dt: 0.1 }).audit({ uPhysical: 5e-4, nuPhysical: 1e-6 });
  check('audit is quiet on a well-scaled setup', ok.warnings.length === 0,
    `tau=${ok.tau} uL=${ok.uLattice} ${JSON.stringify(ok.warnings)}`);
}

// ------------------------------------------------------------------- fields
{
  const L = new Lattice({ size: [8, 8, 8], spacing: 1 });
  const fr = new FieldRegistry(L);
  fr.add(new FieldSpec({ name: 'rho', kind: FIELD_KIND.SCALAR }));
  fr.add(new FieldSpec({ name: 'u', kind: FIELD_KIND.VECTOR }));
  fr.add(new FieldSpec({ name: 'f', kind: FIELD_KIND.DISTRIBUTION, components: Q, doubleBuffered: true }));
  check('scalar is 1 component, vector is 3', fr.get('rho').components === 1 && fr.get('u').components === 3);
  check('a distribution field needs an explicit component count',
    throws(() => new FieldSpec({ name: 'x', kind: FIELD_KIND.DISTRIBUTION })));
  check('an explicit component count overrides the kind default',
    new FieldSpec({ name: 'm', kind: FIELD_KIND.VECTOR, components: 4 }).components === 4);
  check('duplicate field names are refused', throws(() => fr.add(new FieldSpec({ name: 'rho', kind: FIELD_KIND.SCALAR }))));
  check('unknown field lookups throw rather than return undefined', throws(() => fr.get('nope')));

  // 512 cells: rho 512*4, u 3*512*4, f doubled 2*19*512*4
  const expect = 512 * 4 + 3 * 512 * 4 + 2 * Q * 512 * 4;
  check('memory report counts the ping-pong second buffer', fr.byteLength() === expect,
    `${fr.byteLength()} vs ${expect}`);
  check('the distribution field dominates the budget',
    fr.report().items.find((i) => i.name === 'f').bytes > 0.9 * fr.byteLength());
  check('formatBytes is readable', formatBytes(1536) === '1.5 KiB', formatBytes(1536));
}

// ---------------------------------------------------------------- materials
{
  const L = new Lattice({ size: [10, 10, 10], spacing: 1 });
  const flags = classify(L, [
    region.wall(CELL.SOLID, 2, -1),
    region.wall(CELL.SOLID, 2, +1),
    region.sphere(CELL.SOLID, [5, 5, 5], 2),
    region.wall(CELL.INLET, 0, -1),
  ]);
  const c = census(flags);
  check('walls, a sphere and an inlet all land', c.SOLID > 0 && c.INLET > 0 && c.FLUID > 0, JSON.stringify(c));
  check('the census sums to the cell count',
    Object.values(c).reduce((a, b) => a + b, 0) === L.cellCount, JSON.stringify(c));
  check('the inlet region overwrote the wall where they overlap (order matters)',
    flags[L.index(0, 5, 0)] === CELL.INLET, String(flags[L.index(0, 5, 0)]));
  check('the sphere is where it was asked for',
    flags[L.index(5, 5, 5)] === CELL.SOLID && flags[L.index(5, 5, 1)] !== CELL.SOLID);
}

// -------------------------------------------------------- solver discipline
{
  // Two operators writing one field in one stage: whichever ran last would win
  // and the result would look like a physics result. Refused at build time.
  const sim = new Simulation({ lattice: { size: [8, 8, 8], spacing: 1 } });
  sim.addPhysics(new LBMFluidOperator({ tau: 0.8 }));
  sim.addPhysics(new LBMFluidOperator({ tau: 0.9, name: 'second fluid' }));
  let msg = '';
  try { await sim.build({ backend: 'cpu' }); } catch (e) { msg = String(e.message); }
  check('two operators writing one field is refused at build time', /written twice/.test(msg), msg);
}
{
  const sim = new Simulation({ lattice: { size: [8, 8, 8], spacing: 1 } });
  sim.addPhysics(new PhysicsOperator({ type: 'not.implemented', writes: [], reads: [] }));
  let msg = '';
  try { await sim.build({ backend: 'cpu' }); } catch (e) { msg = String(e.message); }
  check('an operator no backend can execute is refused, not skipped', /cannot execute/.test(msg), msg);
}
{
  const sim = new Simulation({ lattice: { size: [8, 8, 8], spacing: 1 } });
  sim.addPhysics(new PhysicsOperator({ type: 'lbm.d3q19', writes: ['ghost'] }));
  let msg = '';
  try { await sim.build({ backend: 'cpu' }); } catch (e) { msg = String(e.message); }
  check('writing an undeclared field is refused', /unknown field/.test(msg), msg);
}
check('tau <= 1/2 is refused when the operator is constructed',
  throws(() => new LBMFluidOperator({ tau: 0.5 })));

// ------------------------------------------------ the ping-pong is genuinely two buffers
{
  const sim = new Simulation({ lattice: { size: [8, 8, 8], spacing: 1 } });
  sim.addPhysics(new LBMFluidOperator({ tau: 0.8 }));
  await sim.build({ backend: 'cpu' });
  const e = sim.backend.buffers.get('f');
  check('the distribution field is double-buffered', e.b !== null && e.a !== e.b);
  const before = sim.backend.read('f');
  sim.advance(1);
  check('one step swaps the read buffer', sim.backend.read('f') !== before);
  check('the macro field is single-buffered (it is a cache, not state)',
    sim.backend.buffers.get('macro').b === null);
  sim.destroy();
}

// ------------------------------------------------ the moving wall is a WALL
if (FULL) {
  // Reported from a real device: the lid-driven cavity showed a "marginal"
  // stability verdict in a CLOSED box, which cannot have a large density spread.
  // Cause: MOVING cells were modelled as driven FLUID cells, so the lid acted as
  // a mass source as well as a momentum source. A moving wall is a wall: halfway
  // bounce-back with a momentum correction, injecting momentum and no mass.
  const { lidCavity } = await import('../../lib/lattsim/scenes.js');
  const sim = lidCavity({ resolution: 20, tau: 0.6, lidVelocity: 0.05 });
  await sim.build({ backend: 'cpu', precision: 'f64' });
  const d0 = await sim.diagnostics();
  sim.advance(1500);
  const d1 = await sim.diagnostics();

  check('a lid-driven cavity conserves mass exactly (no inlet, no outlet)',
    Math.abs(d1.mass - d0.mass) / d0.mass < 1e-12, Math.abs(d1.mass - d0.mass).toExponential(3));
  // The density extreme lives in the two cells at the lid corners, where a
  // moving wall meets a stationary one and the pressure is formally singular.
  // That is real physics and it does not decay: measured steady at 6.6% overall
  // but 1.5% one cell in from every wall and 0.47% three cells in, against the
  // ~0.3% this flow's dynamic pressure accounts for. So the INTERIOR is what
  // says whether the lid is behaving, and the interior is what is asserted.
  //
  // NOTE, because it is the more useful half: restricting the lid to the
  // interior of the top face (so no cell is both a stationary and a moving wall)
  // is the geometrically correct thing and is what ships -- but it did NOT
  // reduce this number, it raised it slightly, 5.1% -> 6.6%. The corner overlap
  // was never the cause.
  const interiorSpread = (() => {
    const NN = sim.lattice.cellCount;
    const mm = sim.backend.read('macro');
    let lo = Infinity, hi = -Infinity;
    sim.lattice.forEachCell((x, y, z, i) => {
      const L2 = sim.lattice;
      // Four cells clear of every wall: that is where the corner singularity's
      // influence has died away (measured 6.6% at the wall, 1.5% two cells in,
      // 0.47% four cells in) and the bulk dynamic pressure is what is left.
      if (x < 4 || y < 4 || z < 4 || x > L2.nx - 5 || y > L2.ny - 5 || z > L2.nz - 5) return;
      if (sim.flags[i] === 1 || sim.flags[i] === 4) return;
      lo = Math.min(lo, mm[i]); hi = Math.max(hi, mm[i]);
    });
    void NN;
    return hi - lo;
  })();
  check('the lid is not a mass source (interior density spread < 1%)',
    interiorSpread < 0.01, interiorSpread.toExponential(3));
  check('the density extreme is confined to the walls, not the bulk',
    (d1.rhoMax - d1.rhoMin) > 3 * interiorSpread,
    `overall ${(d1.rhoMax - d1.rhoMin).toExponential(2)} vs interior ${interiorSpread.toExponential(2)}`);
  check('a closed box driven by a lid is stable, not marginal',
    d1.stable.state === 'ok', JSON.stringify(d1.stable));
  check('the lid actually drives the fluid', d1.uMax > 0.005, String(d1.uMax));
  check('no fluid moves faster than the lid that drives it', d1.uMax <= 0.05 * 1.05, String(d1.uMax));

  // The signature of a cavity is RECIRCULATION: fluid under the lid runs with
  // it, fluid near the floor runs back the other way.
  const N = sim.lattice.cellCount;
  const mac = await sim.backend.snapshot('macro');
  const at = (x, y, z) => mac[N + sim.lattice.index(x, y, z)];
  const mid = 10;
  const top = at(mid, mid, sim.lattice.nz - 3);
  const bottom = at(mid, mid, 2);
  check('the cavity recirculates (flow reverses between lid and floor)',
    top > 0 && bottom < 0, `top ${top.toExponential(2)} bottom ${bottom.toExponential(2)}`);
  sim.destroy();
}

// ------------------------------------------- every scene shows its physics
if (FULL) {
  // Reported from a real device: two of the three scenes "did nothing visible".
  // They were all correct -- the DEFAULT SLICE was wrong. Poiseuille varies only
  // across z, so the plane normal to z has exactly zero spread and renders as a
  // single flat colour. Each scene now declares the plane that shows its physics,
  // and this asserts that the declared plane actually varies.
  const { SCENES } = await import('../../lib/lattsim/scenes.js');
  for (const [key, entry] of Object.entries(SCENES)) {
    const sim = entry.make({ resolution: 20, tau: 0.6 });
    await sim.build({ backend: 'cpu' });
    sim.advance(1200);
    const view = (sim.meta && sim.meta.view) || {};
    check(`${key}: declares a preferred slice plane`, view.sliceAxis !== undefined, JSON.stringify(view));

    const N = sim.lattice.cellCount, L = sim.lattice;
    const mac = await sim.backend.snapshot('macro');
    const spreadOn = (axis) => {
      const k = L.size[axis] >> 1;
      let lo = Infinity, hi = -Infinity;
      const [a1, a2] = [(axis + 1) % 3, (axis + 2) % 3];
      for (let a = 0; a < L.size[a1]; a++) {
        for (let b = 0; b < L.size[a2]; b++) {
          const c = [0, 0, 0]; c[axis] = k; c[a1] = a; c[a2] = b;
          const i = L.index(c[0], c[1], c[2]);
          if (sim.flags[i] === 1 || sim.flags[i] === 4) continue;
          const sp = Math.hypot(mac[N + i], mac[2 * N + i], mac[3 * N + i]);
          if (sp < lo) lo = sp;
          if (sp > hi) hi = sp;
        }
      }
      return hi - lo;
    };
    const chosen = spreadOn(view.sliceAxis);
    check(`${key}: the declared slice plane shows structure`, chosen > 1e-4,
      `spread ${chosen.toExponential(2)} on axis ${view.sliceAxis} `
      + `(all axes: ${[0, 1, 2].map((a) => spreadOn(a).toExponential(1)).join(', ')})`);
    sim.destroy();
  }
}

// --------------------------------------------- the stir impulse is physics
{
  // The interaction has to be a real body force, not a paint tool: momentum goes
  // into the momentum field and is then transported by the same operator as
  // everything else. So it must add momentum, conserve mass, and stop when the
  // impulse expires.
  const { LBMFluidOperator: LBM } = await import('../../lib/lattsim/operators/lbm.js');
  const { TOPOLOGY: T } = await import('../../lib/lattsim/lattice.js');
  const P3 = [T.PERIODIC, T.PERIODIC, T.PERIODIC];
  const sim = new Simulation({ lattice: { size: [16, 16, 16], spacing: 1e-3, topology: P3 } });
  const op = new LBM({ tau: 0.8 });
  sim.addPhysics(op);
  await sim.build({ backend: 'cpu', precision: 'f64' });

  const d0 = await sim.diagnostics();
  check('a fresh periodic box is at rest', d0.uMax < 1e-12, String(d0.uMax));

  const F = 1e-4, STEPS = 20, R = 3;
  op.stir({ centre: [8, 8, 8], radius: R, force: [F, 0, 0], steps: STEPS });
  sim.advance(STEPS);
  const d1 = await sim.diagnostics();
  check('stirring puts momentum into the fluid', d1.momentum[0] > 0 && d1.uMax > 1e-6,
    `px ${d1.momentum[0].toExponential(3)} uMax ${d1.uMax.toExponential(3)}`);
  check('stirring conserves mass', Math.abs(d1.mass - d0.mass) / d0.mass < 1e-12,
    Math.abs(d1.mass - d0.mass).toExponential(3));
  // Only cells inside the sphere are forced, so the momentum added is F per step
  // per forced cell -- an order-of-magnitude check that it is localised rather
  // than applied everywhere.
  const forced = (() => {
    let n = 0;
    sim.lattice.forEachCell((x, y, z) => {
      const dx = x - 8, dy = y - 8, dz = z - 8;
      if (dx * dx + dy * dy + dz * dz <= R * R) n++;
    });
    return n;
  })();
  const expected = F * STEPS * forced;
  // NOTE the half step. The macroscopic field is written from the state gathered
  // at the START of a step, plus Guo's half-force correction, so a reading taken
  // immediately after N steps shows (N - 1/2) applications. That is bookkeeping,
  // not a leak -- so the total is checked once the impulse has fully expired.
  sim.advance(40);
  const d2 = await sim.diagnostics();
  check('the impulse is LOCAL, not global (momentum matches the forced volume)',
    Math.abs(d2.momentum[0] - expected) / expected < 0.01,
    `${d2.momentum[0].toExponential(4)} vs ${expected.toExponential(4)} over ${forced} of ${sim.lattice.cellCount} cells`);
  check('the mid-run reading is exactly one half step behind',
    Math.abs(d1.momentum[0] - (STEPS - 0.5) * F * forced) / expected < 0.01,
    `${d1.momentum[0].toExponential(4)} vs ${((STEPS - 0.5) * F * forced).toExponential(4)}`);

  // ...and it expires: momentum must stop growing once the impulse is spent.
  sim.advance(60);
  const d3 = await sim.diagnostics();
  check('the impulse expires rather than becoming a permanent source',
    Math.abs(d3.momentum[0] - d2.momentum[0]) / d2.momentum[0] < 1e-9,
    `${d2.momentum[0].toExponential(6)} -> ${d3.momentum[0].toExponential(6)}`);
  sim.destroy();
}

// ------------------------------------------------- the residual diagnostic
{
  // Cheap in quick, thorough in full: the claim is that the residual FALLS, and
  // a shorter run still shows that.
  const ROUNDS = FULL ? 12 : 4;
  // "Has it settled?" is otherwise unanswerable from the picture: a converged run
  // and a slowly drifting one look identical. The residual is |du|/|u| between
  // consecutive readings, and it must fall as a driven flow reaches steady state.
  const { channelFlow } = await import('../../lib/lattsim/scenes.js');
  const sim = channelFlow({ resolution: 16, tau: 0.6, inletVelocity: 0.05 });
  await sim.build({ backend: 'cpu' });
  await sim.diagnostics();                    // prime the previous-field copy
  sim.advance(300);
  const early = await sim.diagnostics();
  for (let k = 0; k < ROUNDS; k++) { sim.advance(300); await sim.diagnostics(); }
  sim.advance(300);
  const late = await sim.diagnostics();
  check('the residual is reported', typeof late.residual === 'number', String(late.residual));
  check('a driven flow settles: the residual falls by >10x', late.residual < early.residual / 10,
    `${early.residual.toExponential(2)} -> ${late.residual.toExponential(2)}`);
  check('a settled run says so in the verdict', /steady/.test(late.stable.why) || late.residual < 1e-3,
    JSON.stringify({ why: late.stable.why, residual: late.residual }));
  sim.destroy();
}

// ------------------------------ the residual is a RATE, not a per-reading delta
//
// The backends report |du|/|u| between successive READINGS, which grows with
// however many steps happened in between. Left unnormalised, a convergence
// number would change when the steps-per-frame slider moved -- a VIEWING control
// altering a physics diagnostic. Simulation divides by the elapsed steps, so two
// observers watching the same run at different cadences must agree.
{
  const { channelFlow } = await import('../../lib/lattsim/scenes.js');
  const make = async () => {
    const s = channelFlow({ resolution: 16, tau: 0.6, inletVelocity: 0.05 });
    await s.build({ backend: 'cpu' });
    return s;
  };
  const a = await make(), b = await make();
  a.advance(400); await a.diagnostics();
  b.advance(400); await b.diagnostics();
  // Same 200 steps of the same deterministic run, read once vs read in 10 chunks.
  a.advance(200);
  const coarse = await a.diagnostics();
  let fine = null;
  for (let k = 0; k < 10; k++) { b.advance(20); fine = await b.diagnostics(); }
  const ratio = coarse.residual / fine.residual;
  check('the residual is per step, so the reading cadence barely moves it',
    ratio > 0.2 && ratio < 5,
    `1x200 ${coarse.residual.toExponential(2)} vs 10x20 ${fine.residual.toExponential(2)} (${ratio.toFixed(2)}x)`);

  // No previous reading is NOT the same as no change. A fresh run must report
  // undefined rather than a number, or the first frame after a rebuild shows a
  // meaningless ~1 -- and a second call with no steps in between must not report
  // zero, which would read as "perfectly steady".
  const c = await make();
  const first = await c.diagnostics();
  check('the first reading has no residual to report', first.residual === undefined,
    String(first.residual));
  c.advance(50); await c.diagnostics();
  const nostep = await c.diagnostics();
  check('a reading with no steps since the last one reports nothing, not zero',
    nostep.residual === undefined, String(nostep.residual));
  a.destroy(); b.destroy(); c.destroy();
}

// ----------------------------- a fully converged run must still read as steady
//
// Poiseuille converges hard enough that the f32 velocity delta underflows to
// EXACTLY zero. An earlier `residual > 0` guard -- there to exclude the
// no-previous-reading case, which is now `undefined` -- made the most converged
// run on the tab report "not steady".
{
  const sim = new Simulation({ lattice: { size: [4, 4, 4], spacing: 1e-3 } });
  check('a residual of exactly zero is steady, not unreported',
    sim.assess({ finite: true, rhoMin: 1, rhoMax: 1, uMax: 0.01, residual: 0 }).why === 'steady');
  check('an unreported residual is not called steady',
    sim.assess({ finite: true, rhoMin: 1, rhoMax: 1, uMax: 0.01 }).why === '');
}

if (!FULL) console.log('  (quick tier: cavity, scene sweep and the long residual run are --full only)');
console.log(failed ? `\n  ${failed} check(s) failed\n` : '  all checks passed\n');
process.exit(failed ? 1 : 0);
