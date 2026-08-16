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

console.log(failed ? `\n  ${failed} check(s) failed\n` : '  all checks passed\n');
process.exit(failed ? 1 : 0);
