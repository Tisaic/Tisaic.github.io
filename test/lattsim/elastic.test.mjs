// Linear elastodynamics against its closed forms. Plain Node, CPU reference, no
// browser and no GPU -- which is where a physics claim belongs (see the
// verification rule in CLAUDE.md).
//
// THE WAVE SPEEDS ARE THE CHECK THAT THE OPERATOR SOLVES THE RIGHT EQUATIONS,
// and they are a strong one because they are not free parameters: c_p and c_s
// fall out of lambda, mu and rho with no fitting, they differ from each other by
// a known ratio, and a staggered stencil with one difference taken in the wrong
// direction still runs, still looks like a wave, and arrives at the wrong time.
//
// Measured in LATTICE UNITS throughout (dx = 1, dt = 1), exactly as the LBM
// operator's tau and u are: the SI mapping is units.js's job, not the kernel's.

import { Simulation } from '../../lib/lattsim/simulation.js';
import { TOPOLOGY } from '../../lib/lattsim/lattice.js';
import {
  ElasticSolidOperator, lameFrom, engineeringFrom, waveSpeeds, CFL_LIMIT, SIG,
} from '../../lib/lattsim/operators/elastic.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nlattsim: linear elastodynamics');

// ---------------------------------------------------------------- constants
{
  const { lambda, mu } = lameFrom(210, 0.3);
  const back = engineeringFrom(lambda, mu);
  check('Lame <-> engineering constants round-trip',
    Math.abs(back.E - 210) < 1e-12 && Math.abs(back.nu - 0.3) < 1e-15,
    JSON.stringify(back));
  // Incompressible limit: nu -> 1/2 sends lambda to infinity while mu stays put.
  // A sign error in lameFrom would show up here as a negative lambda long before
  // it showed up as a wrong wave speed.
  check('lambda grows and mu does not as nu -> 1/2',
    lameFrom(210, 0.499).lambda > lameFrom(210, 0.3).lambda * 50
    && Math.abs(lameFrom(210, 0.499).mu - lameFrom(210, 0.3).mu) < 15,
    JSON.stringify(lameFrom(210, 0.499)));
  check("Poisson's ratio outside (-1, 1/2) is refused",
    (() => { try { lameFrom(1, 0.5); return false; } catch { return true; } })());
  check('stating both (E,nu) and (lambda,mu) is refused',
    (() => { try { new ElasticSolidOperator({ E: 1, nu: 0.3, lambda: 1, mu: 1 }); return false; }
             catch { return true; } })());
}

// ------------------------------------------------------------------ the CFL
{
  // c_p in lattice units IS the CFL number, so a stiffness that cannot be
  // integrated must be refused at build time rather than discovered as NaN.
  const soft = new ElasticSolidOperator({ lambda: 0.05, mu: 0.03, rho: 1 });
  check('a well-conditioned solid passes the CFL gate',
    (() => { try { soft.assertStable(); return true; } catch { return false; } })(),
    soft.describe());
  const stiff = new ElasticSolidOperator({ lambda: 1, mu: 1, rho: 1 });   // c_p = sqrt(3)
  check('a solid past the CFL limit is refused at build time, not at step 30',
    (() => { try { stiff.assertStable(); return false; } catch { return true; } })(),
    String(stiff.cflNumber()));
  check('the CFL limit is 1/sqrt(3) for this 3D stencil',
    Math.abs(CFL_LIMIT - 0.5773502691896258) < 1e-15);
}

/**
 * Build a periodic bar and run a plane wave along x.
 *
 * PERIODIC ON EVERY AXIS ON PURPOSE: this brick is about the interior stencil
 * and the constitutive update, so it is verified where no boundary condition can
 * contaminate the answer. Free surfaces and clamps are the next brick and get
 * their own closed form (the cantilever).
 *
 * `mode` picks which speed is being measured. A displacement along the direction
 * of travel is a P wave and moves at c_p; a displacement transverse to it is an
 * S wave and moves at c_s. Same lattice, same operator, same step count -- only
 * the polarisation of the initial condition differs, which is what makes the
 * pair a sharp test rather than one number that could be a coincidence.
 */
async function planeWave({ mode, lambda, mu, rho, nx = 64, steps = 40, precision = 'f64' }) {
  const sim = new Simulation({
    lattice: {
      size: [nx, 4, 4], spacing: 1,
      topology: [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC],
    },
  });
  const op = new ElasticSolidOperator({ lambda, mu, rho });
  op.assertStable();
  sim.addPhysics(op);
  await sim.build({ backend: 'cpu', precision });

  const L = sim.lattice;
  const N = L.cellCount;
  const v = sim.backend.write('vel');
  const s = sim.backend.write('sig');
  const k = (2 * Math.PI) / nx;                       // exactly one wavelength
  const { cp, cs } = waveSpeeds({ lambda, mu, rho });
  const c = mode === 'P' ? cp : cs;

  // A SINGLE FOURIER MODE, AND THE STRESS THAT GOES WITH IT.
  //
  // One mode because the scheme is DISPERSIVE: different wavenumbers travel at
  // slightly different speeds, so a pulse of many modes spreads and its
  // "arrival" depends on how you chose to define it.
  //
  // And the stress because seeding VELOCITY ALONE is not a travelling wave -- it
  // is an equal superposition of a left-going and a right-going one, i.e. a
  // STANDING wave, whose phase does not advance at all while its amplitude
  // oscillates. (Measured, before this was fixed: both P and S reported the same
  // 1.6 with the amplitude collapsing 0.5 -> 0.06, which is exactly that
  // signature and says nothing whatever about the kernel.) A one-way wave needs
  // the impedance relation sigma = -rho c v, which is what makes the backward
  // component vanish.
  const comp = mode === 'P' ? 0 : 1;                  // v.x along x, or v.y across it
  const sComp = mode === 'P' ? SIG.XX : SIG.XY;
  // The leapfrog also staggers the two fields in TIME: step() advances v first
  // from the stress as it stands, so v starts half a step behind sigma. Seeding
  // that offset keeps the backward-going residue at round-off instead of a
  // percent, and it cancels out of the speed anyway (a constant phase offset
  // subtracts away between the two readings) -- so it is here for the amplitude
  // check, which a residual backward wave would show up in as a beat.
  L.forEachCell((x, y, z, i) => {
    // v.x sits at x+1/2, v.y at the cell centre in x; sigma.xx at the centre and
    // sigma.xy at x+1/2. Seeding each at its OWN position is the difference
    // between measuring the scheme and measuring a half-cell of phase error.
    const xv = comp === 0 ? x + 0.5 : x;
    const xs = sComp === SIG.XX ? x : x + 0.5;
    v[comp * N + i] = Math.sin(k * (xv + c * 0.5));
    s[sComp * N + i] = -rho * c * Math.sin(k * xs);
  });

  // Track the phase by projecting onto sin and cos of the same mode -- a fit to
  // the whole field rather than a zero crossing, so the answer does not depend
  // on which cell happens to straddle zero.
  const phaseOf = () => {
    const buf = sim.backend.read('vel');
    let a = 0, b = 0;
    L.forEachCell((x, y, z, i) => {
      const xp = comp === 0 ? x + 0.5 : x;
      a += buf[comp * N + i] * Math.sin(k * xp);
      b += buf[comp * N + i] * Math.cos(k * xp);
    });
    return { phase: Math.atan2(b, a), amp: Math.hypot(a, b) / N };
  };

  const p0 = phaseOf();
  sim.advance(steps);
  const p1 = phaseOf();
  await sim.destroy();

  // For v ~ sin(k(x - ct)) the projection phase is -kct, so it DECREASES as the
  // wave moves in +x; the advance is p0 - p1. Every configuration here is chosen
  // so that k*c*steps stays under 2*pi, which is what makes this unwrap
  // unambiguous rather than a guess about how many laps were completed.
  let d = p0.phase - p1.phase;
  while (d < 0) d += 2 * Math.PI;
  while (d >= 2 * Math.PI) d -= 2 * Math.PI;
  const speed = d / (k * steps);
  return { speed, amp0: p0.amp, amp1: p1.amp };
}

// ------------------------------------------------------- P and S wave speeds
{
  const lambda = 0.06, mu = 0.04, rho = 1;
  const { cp, cs } = waveSpeeds({ lambda, mu, rho });

  const p = await planeWave({ mode: 'P', lambda, mu, rho });
  const s = await planeWave({ mode: 'S', lambda, mu, rho });

  // 3% is the honest tolerance for a second-order scheme at 64 cells per
  // wavelength: what is left is NUMERICAL DISPERSION, which is a property of the
  // stencil and not an error in it. The convergence check below is what
  // separates those two -- a wrong stencil does not converge.
  check('a P wave travels at c_p = sqrt((lambda+2mu)/rho)',
    Math.abs(p.speed - cp) / cp < 0.03,
    `measured ${p.speed.toFixed(5)} vs analytic ${cp.toFixed(5)} (${(100 * (p.speed - cp) / cp).toFixed(2)}%)`);
  check('an S wave travels at c_s = sqrt(mu/rho)',
    Math.abs(s.speed - cs) / cs < 0.03,
    `measured ${s.speed.toFixed(5)} vs analytic ${cs.toFixed(5)} (${(100 * (s.speed - cs) / cs).toFixed(2)}%)`);
  // THE RATIO IS THE PART THAT CANNOT BE FAKED BY A SCALE ERROR. A kernel with
  // one global factor wrong gets both speeds wrong by the same factor and passes
  // nothing here; a kernel that confuses lambda with mu gets the ratio wrong.
  check('c_p / c_s carries the Poisson ratio, not a shared scale factor',
    Math.abs((p.speed / s.speed) - (cp / cs)) / (cp / cs) < 0.03,
    `measured ${(p.speed / s.speed).toFixed(4)} vs analytic ${(cp / cs).toFixed(4)}`);
  // An undamped linear solid is CONSERVATIVE: a free plane wave must neither
  // grow nor decay. Growth is the first sign of an unstable stencil, and decay
  // means the scheme is dissipating energy it was never asked to dissipate.
  check('the wave neither grows nor decays (no numerical dissipation)',
    Math.abs(p.amp1 - p.amp0) / p.amp0 < 1e-3 && Math.abs(s.amp1 - s.amp0) / s.amp0 < 1e-3,
    `P ${p.amp0.toFixed(6)}->${p.amp1.toFixed(6)}, S ${s.amp0.toFixed(6)}->${s.amp1.toFixed(6)}`);
}

// ------------------------------------------- second order, which is the proof
{
  // THE ABSOLUTE ERROR ABOVE COULD BE A COINCIDENCE; THE CONVERGENCE RATE CANNOT.
  // Refining the lattice at a fixed physical wavelength must cut the dispersion
  // error by 4x per doubling for a second-order stencil. A first-order mistake
  // (one difference taken as a one-sided rather than a centred pair) would show
  // ~2x, and a wrong stencil would show no clean rate at all.
  const lambda = 0.06, mu = 0.04, rho = 1;
  const { cp } = waveSpeeds({ lambda, mu, rho });
  const errs = [];
  for (const nx of [16, 32, 64]) {
    // Same physical distance travelled at every resolution, so the comparison is
    // like for like: more cells per wavelength AND proportionally more steps.
    const r = await planeWave({ mode: 'P', lambda, mu, rho, nx, steps: Math.round(nx * 0.75) });
    errs.push(Math.abs(r.speed - cp) / cp);
  }
  const r1 = errs[0] / errs[1], r2 = errs[1] / errs[2];
  check('dispersion error falls ~4x per doubling (second order in space)',
    r1 > 3 && r1 < 5.5 && r2 > 3 && r2 < 5.5,
    `errors ${errs.map((e) => e.toExponential(2)).join(' -> ')}, ratios ${r1.toFixed(2)}, ${r2.toFixed(2)}`);
}

// ---------------------------------------------- the operator's own book-keeping
{
  const sim = new Simulation({
    lattice: { size: [8, 8, 8], spacing: 1,
      topology: [TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC, TOPOLOGY.PERIODIC] },
  });
  sim.addPhysics(new ElasticSolidOperator({ E: 0.1, nu: 0.3, rho: 1 }));
  await sim.build({ backend: 'cpu', precision: 'f64' });

  const specs = Object.fromEntries(sim.fields.list().map((s) => [s.name, s]));
  check('velocity is a 3-component vector field', specs.vel && specs.vel.components === 3);
  check('stress is stored as 6 components, not 9 (it is symmetric by construction)',
    specs.sig && specs.sig.components === 6, specs.sig && String(specs.sig.components));
  // The staggered leapfrog reads one field and writes the other in each pass, so
  // nothing is ever read while being written and the ping-pong buffer is dead
  // weight. At 9 components that halves the field memory, which is the entire
  // argument for per-link lattices in FlexiSim.
  check('both fields are single-buffered (the leapfrog needs no ping-pong)',
    sim.backend.buffers.get('vel').b === null && sim.backend.buffers.get('sig').b === null);
  check('the stress component order is the one the kernel writes',
    SIG.XX === 0 && SIG.YY === 1 && SIG.ZZ === 2 && SIG.XY === 3 && SIG.XZ === 4 && SIG.YZ === 5);

  // A SOLID AT REST MUST STAY AT REST. It sounds trivial and it is not: any
  // asymmetry between the forward and backward differences shows up here as a
  // field that stirs itself out of nothing, and it would be invisible in a wave
  // test where there is already something moving.
  sim.advance(50);
  const v = sim.backend.read('vel'), s = sim.backend.read('sig');
  let vmax = 0, smax = 0;
  for (let i = 0; i < v.length; i++) vmax = Math.max(vmax, Math.abs(v[i]));
  for (let i = 0; i < s.length; i++) smax = Math.max(smax, Math.abs(s[i]));
  check('a solid at rest stays at rest (no self-excitation)', vmax === 0 && smax === 0,
    `|v| ${vmax}, |sigma| ${smax}`);
  await sim.destroy();
}

// ------------------------------------------------------- damping does its job
{
  // Damping is a NUMERICAL device -- dynamic relaxation, to reach a static
  // deflection without waiting out every reflection -- so what it must do is
  // remove energy monotonically, and what it must NOT do is fire when it is off.
  const cfg = { mode: 'P', lambda: 0.06, mu: 0.04, rho: 1, nx: 32, steps: 60 };
  const undamped = await planeWave(cfg);
  check('with damping off the amplitude is untouched',
    Math.abs(undamped.amp1 - undamped.amp0) / undamped.amp0 < 1e-3,
    `${undamped.amp0.toFixed(6)} -> ${undamped.amp1.toFixed(6)}`);
}

console.log(failed ? `\n${failed} elastic check(s) failed\n` : '\nelastic: all checks passed\n');
process.exit(failed ? 1 : 0);
