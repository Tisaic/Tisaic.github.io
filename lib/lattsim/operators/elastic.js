// ElasticSolidOperator -- linear isotropic elastodynamics on a staggered grid.
//
// The engine's THIRD physics operator and the first that is not a lattice
// Boltzmann distribution. That is the point of it: `scalar.js` proved "adding a
// field needs no core change" with a second D3Q19 distribution, which is the easy
// case -- same stencil, same streaming, same shape. This one registers a VECTOR
// velocity and a symmetric TENSOR stress, advances them with a scheme that has
// nothing to do with populations, and still touches none of the solver, the
// operator base, the field registry or the simulation facade.
//
// THE SCHEME IS VELOCITY-STRESS LEAPFROG ON A STAGGERED GRID (Virieux 1986), the
// standard explicit elastodynamics scheme, and the staggering is not decoration.
// A COLLOCATED central difference of this system decouples the odd and even
// lattice points -- the classic checkerboard -- and produces a field that looks
// like a solution and satisfies nothing. Staggering the components by half a cell
// makes every derivative a difference of ADJACENT half-points, which is both
// second-order and coupled.
//
// Storage convention (all fields still indexed x + Nx*(y + Ny*z); the half-cell
// offset is in the MEANING of the slot, never in the indexing):
//
//   vel.x  [i,j,k]  lives at (i+1/2, j,     k    )
//   vel.y  [i,j,k]  lives at (i,     j+1/2, k    )
//   vel.z  [i,j,k]  lives at (i,     j,     k+1/2)
//   sig.xx [i,j,k]  lives at (i,     j,     k    )   (likewise yy, zz)
//   sig.xy [i,j,k]  lives at (i+1/2, j+1/2, k    )
//   sig.xz [i,j,k]  lives at (i+1/2, j,     k+1/2)
//   sig.yz [i,j,k]  lives at (i,     j+1/2, k+1/2)
//
// The equations, in lattice units (dx = 1, dt = 1, exactly as the LBM operator
// works in lattice units and lets units.js carry the SI mapping):
//
//   rho dv/dt   = div sigma                       (+ body forces)
//   dsigma/dt   = lambda tr(grad v) I + mu (grad v + grad v^T)
//
// so the wave speeds are the closed forms this operator is verified against:
//
//   c_p = sqrt((lambda + 2 mu) / rho)      c_s = sqrt(mu / rho)
//
// BOTH FIELDS ARE SINGLE-BUFFERED, WHICH LOOKS LIKE A VIOLATION OF THE SOLVER'S
// SECOND RULE AND IS NOT. That rule exists because reading and writing one buffer
// leaves a cell's neighbours half-updated, which on the GPU is a race with no
// error message. A staggered leapfrog does not have that shape: the velocity pass
// reads only STRESS (at neighbours) and writes only VELOCITY (at its own cell),
// and the stress pass reads only VELOCITY and writes only STRESS. No cell ever
// reads a field being written in the same dispatch, so in-place is race-free by
// construction and the two dispatches supply the ordering. The saving is not
// cosmetic: at 3 + 6 components this halves ~104 B/cell to ~52, and for FlexiSim
// the memory is the whole argument (a three-link arm's swept bounding box is
// ~240 MiB dense against ~2.3 MiB for the links themselves).
//
// STABILITY is the CFL condition for this stencil in 3D,
//
//   c_p * dt / dx <= 1 / sqrt(3) ~ 0.577
//
// which in lattice units is just c_p <= 0.577. `cflNumber()` reports where a
// configuration sits and `assertStable()` refuses to build past it, because an
// explicit scheme past its CFL limit does not degrade -- it explodes, and this
// project has already learned once what a silently diverging solver costs.
//
// WHAT IS DELIBERATELY NOT HERE YET, so a reader does not assume it: free
// surfaces and clamped boundaries (this brick is verified on a PERIODIC lattice
// against the wave speeds, which needs no boundary at all), gravity and the
// non-inertial body forces a rotating link frame requires, the co-rotational
// treatment of large rotation, and plasticity. Each of those is its own brick
// with its own closed form -- see the FlexiSim entry in CLAUDE.md.

import { PhysicsOperator } from '../operator.js';
import { FieldSpec, FIELD_KIND } from '../fields.js';

/** Component order of the symmetric stress field. Fixed here and nowhere else. */
export const SIG = Object.freeze({ XX: 0, YY: 1, ZZ: 2, XY: 3, XZ: 4, YZ: 5 });

/** The CFL ceiling for this stencil in 3D: c_p * dt / dx must not exceed it. */
export const CFL_LIMIT = 1 / Math.sqrt(3);

/**
 * Lame parameters from the engineering constants an actual datasheet carries.
 * @param {number} E   Young's modulus
 * @param {number} nu  Poisson's ratio, -1 < nu < 1/2
 */
export function lameFrom(E, nu) {
  if (!(nu > -1 && nu < 0.5)) throw new Error(`Poisson's ratio must lie in (-1, 1/2); got ${nu}`);
  return {
    lambda: (E * nu) / ((1 + nu) * (1 - 2 * nu)),
    mu: E / (2 * (1 + nu)),
  };
}

/** The inverse, so a test can state either pair and check the round trip. */
export function engineeringFrom(lambda, mu) {
  return {
    E: (mu * (3 * lambda + 2 * mu)) / (lambda + mu),
    nu: lambda / (2 * (lambda + mu)),
  };
}

/** Closed-form wave speeds. The operator is verified against exactly these. */
export function waveSpeeds({ lambda, mu, rho }) {
  return { cp: Math.sqrt((lambda + 2 * mu) / rho), cs: Math.sqrt(mu / rho) };
}

export class ElasticSolidOperator extends PhysicsOperator {
  /**
   * Either (E, nu) or (lambda, mu) -- stating both is refused rather than
   * silently preferring one, because a mismatched pair is a physics error that
   * would show up as a wave speed nobody expected.
   *
   * @param {object} o
   * @param {number} [o.E]        Young's modulus, lattice units
   * @param {number} [o.nu]       Poisson's ratio
   * @param {number} [o.lambda]   first Lame parameter, lattice units
   * @param {number} [o.mu]       shear modulus, lattice units
   * @param {number} [o.rho]      density, lattice units (default 1)
   * @param {number} [o.damping]  mass-proportional damping per step, in [0,1).
   *                              0 is the conservative solid the wave-speed and
   *                              energy checks need; a small positive value is
   *                              dynamic relaxation, which is how a STATIC
   *                              deflection is reached without waiting out every
   *                              reflection. It is a numerical device, not a
   *                              material property, and is named so.
   * @param {string} [o.velocity] field name for v
   * @param {string} [o.stress]   field name for sigma
   * @param {boolean} [o.displacement] declare and integrate a displacement field
   *   (`disp`), u += v each step, at the same staggered positions as v. The
   *   scheme's state is velocity and stress, so displacement is not needed to
   *   ADVANCE anything -- but every static closed form (cantilever FL^3/3EI, the
   *   uniaxial strain that separates E from lambda+2mu) is a statement about
   *   displacement, and so is drawing the deformed shape. Off by default.
   * @param {boolean} [o.bodyForce] declare a per-cell force field (`force`).
   *   ONE MECHANISM FOR EVERY BODY FORCE, because they are all the same thing:
   *   gravity is a uniform fill of it, a tip load is a few cells of it, and the
   *   fictitious forces a rotating link frame needs (centrifugal, Coriolis,
   *   Euler) are a per-cell fill recomputed each step. Off by default -- an
   *   unused 3-component field is 12 B/cell of nothing.
   */
  constructor({ E, nu, lambda, mu, rho = 1, damping = 0, bodyForce = false,
                displacement = false, velocity = 'vel', stress = 'sig',
                force = 'force', disp = 'disp', name = 'elastic solid' } = {}) {
    const gaveEngineering = E != null || nu != null;
    const gaveLame = lambda != null || mu != null;
    if (gaveEngineering && gaveLame) {
      throw new Error('give (E, nu) or (lambda, mu), not both -- a mismatched pair is a physics error');
    }
    if (gaveEngineering && !(E > 0 && nu != null)) throw new Error('E > 0 and nu are both required');
    if (gaveLame && !(mu > 0 && lambda != null)) throw new Error('mu > 0 and lambda are both required');
    if (!gaveEngineering && !gaveLame) throw new Error('elastic operator needs (E, nu) or (lambda, mu)');
    const lame = gaveEngineering ? lameFrom(E, nu) : { lambda, mu };
    if (!(rho > 0)) throw new Error('density must be > 0');
    if (!(damping >= 0 && damping < 1)) throw new Error('damping must lie in [0, 1)');

    super({
      type: 'elastic.staggered',
      name,
      reads: [velocity, stress, ...(bodyForce ? [force] : [])],
      writes: [velocity, stress, ...(displacement ? [disp] : [])],
      params: { lambda: lame.lambda, mu: lame.mu, rho, damping },
    });
    this.velocityField = velocity;
    this.stressField = stress;
    this.forceField = bodyForce ? force : null;
    this.dispField = displacement ? disp : null;
  }

  /**
   * Velocity and stress, both SINGLE-buffered -- see the header. The stress is
   * six components rather than nine: it is symmetric by construction here (the
   * constitutive update is written in terms of the symmetric strain rate), so
   * storing sigma_yx separately would store a number that can only ever equal
   * sigma_xy and give a later edit somewhere to put a disagreement.
   */
  declareFields(fields) {
    if (!fields.has(this.velocityField)) {
      fields.add(new FieldSpec({
        name: this.velocityField, kind: FIELD_KIND.VECTOR, components: 3,
        doubleBuffered: false, units: 'lattice velocity',
      }));
    }
    if (!fields.has(this.stressField)) {
      fields.add(new FieldSpec({
        name: this.stressField, kind: FIELD_KIND.TENSOR, components: 6,
        doubleBuffered: false, units: 'lattice stress (xx, yy, zz, xy, xz, yz)',
      }));
    }
    if (this.forceField && !fields.has(this.forceField)) {
      fields.add(new FieldSpec({
        name: this.forceField, kind: FIELD_KIND.VECTOR, components: 3,
        doubleBuffered: false, units: 'lattice force per unit volume',
      }));
    }
    if (this.dispField && !fields.has(this.dispField)) {
      fields.add(new FieldSpec({
        name: this.dispField, kind: FIELD_KIND.VECTOR, components: 3,
        doubleBuffered: false, units: 'lattice displacement',
      }));
    }
  }

  /**
   * Ask the kernel to accumulate the SUPPORT REACTION each step: the net force and
   * z-moment the CLAMPED cells had to absorb, about `pivot` in lattice indices.
   *
   * It is what the thing holding this body feels, and for FlexiSim it is the
   * torque a flexing link feeds back to its gearbox. Local and exact -- no time
   * derivative of a field -- which is the whole point: the obvious alternative,
   * differencing the link's angular momentum, is a high-pass filter on a field
   * with grid-scale content and it destabilised the co-simulation in ~1200 steps
   * at every damping value tried.
   */
  measureReaction(pivot) {
    this.reactionPivot = pivot.slice();
    return this;
  }

  /** c_p and c_s for the current parameters. */
  speeds() { return waveSpeeds(this.params); }

  /**
   * c_p * dt / dx in lattice units. At or above CFL_LIMIT the scheme is
   * unconditionally unstable -- not inaccurate, unstable.
   */
  cflNumber() { return this.speeds().cp; }

  /**
   * Refuse a configuration that cannot be integrated. Called at build time so a
   * bad stiffness is a message rather than a lattice full of NaN thirty steps
   * later; the LBM operator learned this the expensive way.
   */
  assertStable() {
    const cfl = this.cflNumber();
    if (!(cfl < CFL_LIMIT)) {
      throw new Error(`elastic CFL ${cfl.toFixed(4)} is at or past the 3D limit ${CFL_LIMIT.toFixed(4)}: `
        + 'lower E, raise rho, or (in SI terms) shorten the timestep');
    }
    return this;
  }

  describe() {
    const { cp, cs } = this.speeds();
    const { E, nu } = engineeringFrom(this.params.lambda, this.params.mu);
    return `${this.name} (E ${E.toPrecision(3)}, nu ${nu.toFixed(3)}, rho ${this.params.rho}) `
      + `-> c_p ${cp.toFixed(4)}, c_s ${cs.toFixed(4)}, CFL ${(cp / CFL_LIMIT).toFixed(3)} of limit`;
  }
}
