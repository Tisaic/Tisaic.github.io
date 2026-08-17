// LBMFluidOperator — the first production physics module.
//
// It describes a D3Q19 lattice Boltzmann fluid: one distribution field, one
// derived macroscopic field, a relaxation time and an optional body force. The
// numerics live in the backends (backends/cpu.js and backends/wgsl.js), which
// both read the velocity set from d3q19.js.
//
// The macroscopic quantities are DERIVED, not stored independently: rho and u
// are moments of f, recomputed wherever they are needed. The `macro` field
// exists only because the renderer and the diagnostics want them without
// re-reducing 19 populations per cell, and it is written by the same kernel
// that computes them for the collision. It is a cache, not state.
//
// TWO COLLISION MODELS, and the difference is stability at low viscosity.
//
// BGK/SRT relaxes EVERY moment at the same rate. The hydrodynamic moments are
// the only ones carrying physics, but the rest -- the "ghost" moments -- relax
// at that same rate, and as omega approaches 2 (tau -> 1/2) they become
// under-damped and grow without bound. That is a defect of the collision
// operator, not of the fluid: measured here, tau 0.505 at the shipped inlet
// speed drove the lattice velocity to 1.0e4 against a stable limit of 0.3.
//
// TRT splits each population into a symmetric and an antisymmetric part and
// relaxes them at two rates: omega+ sets the viscosity, omega- is chosen to
// hold the MAGIC PARAMETER
//
//     Lambda = (1/omega+ - 1/2)(1/omega- - 1/2) = 3/16
//
// which damps the ghost modes independently of viscosity. It costs a handful of
// flops and no extra memory, and it buys a second thing for free: bounce-back's
// effective wall position stops drifting with tau. Under BGK that wall is exact
// only at tau = 1/2 + sqrt(3/16) ~ 0.933; under TRT it is exact everywhere.
//
// SEPARATELY, `smagorinsky` turns on a sub-grid model. A better collision
// operator raises the stability ceiling but cannot resolve structure smaller
// than a cell -- and at high Reynolds number the dissipation range genuinely is
// smaller than a cell. Unresolved eddies drain energy from resolved ones; with
// no representation of that drain, energy piles up at the grid scale and the
// run detonates. The model supplies the drain as a local eddy viscosity, so tau
// becomes a FIELD rather than a constant. It is modelling, not resolution, and
// the page says so.

import { PhysicsOperator } from '../operator.js';
import { FieldSpec, FIELD_KIND } from '../fields.js';
import { Q } from '../d3q19.js';

export const COLLISION = Object.freeze({ BGK: 'bgk', TRT: 'trt' });

/**
 * The magic parameter. 3/16 is the value that puts the halfway bounce-back wall
 * exactly halfway at ANY viscosity; other choices optimise other things (1/4
 * for advection-diffusion, 1/6 for a fourth-order-accurate bulk).
 */
export const MAGIC = 3 / 16;

/**
 * TRT's free rate is ONE knob serving TWO objectives that pull apart at low
 * viscosity, which is easy to miss and was measured here the hard way.
 *
 *   Lambda = (1/omega+ - 1/2)(1/omega- - 1/2)
 *
 * ACCURACY wants Lambda = 3/16: that is what makes the bounce-back wall exact
 * at any viscosity, and it is worth ten orders of magnitude on the analytic
 * Poiseuille profile at tau = 2.5.
 *
 * STABILITY wants Lambda SMALL, i.e. omega- near 2, so the odd (ghost-carrying)
 * modes are strongly damped. And as tau -> 1/2 those two demands invert: holding
 * Lambda = 3/16 drives omega- to 0.10 at tau 0.52 and 0.026 at tau 0.505, which
 * leaves the ghost modes almost unrelaxed. MEASURED: TRT at Lambda = 3/16 died
 * EARLIER than plain BGK at Re_cell 12 and 16 -- the opposite of the reason it
 * was added.
 *
 * So the free rate is a POLICY, not a constant:
 *   'magic'      Lambda = 3/16. Exact walls. The right choice for verification
 *                and for moderate Reynolds number, and the default.
 *   'stability'  omega- pinned near 2 regardless of viscosity. Loses wall
 *                exactness, holds together at viscosities where 'magic' cannot
 *                -- which is the regime where the sub-grid model is on anyway
 *                and boundary exactness was never the binding constraint.
 */
export const OMEGA_MINUS_STABLE = 1.9;

export function omegaMinusFor(tau, policy = 'magic') {
  if (policy === 'stability') return OMEGA_MINUS_STABLE;
  if (typeof policy === 'number') return policy;
  return 1 / (0.5 + MAGIC / (tau - 0.5));
}

/** The Lambda a given omega- actually realises at this tau. */
export function lambdaFor(tau, omegaMinus) {
  return (tau - 0.5) * (1 / omegaMinus - 0.5);
}

export class LBMFluidOperator extends PhysicsOperator {
  /**
   * @param {object} o
   * @param {number} o.tau            relaxation time, LATTICE units, > 1/2
   * @param {number[]} [o.force]      body force per unit density, lattice units
   * @param {number[]} [o.inletVelocity] lattice units, used by INLET cells
   * @param {string} [o.collision]    COLLISION.BGK | COLLISION.TRT
   * @param {string|number} [o.trtPolicy] 'magic' | 'stability' | a fixed omega-
   * @param {number} [o.smagorinsky]  Smagorinsky constant Cs; 0 disables the
   *   sub-grid model. ~0.1-0.2 is the usual range; the model contributes an
   *   eddy viscosity (Cs*dx)^2 |S| on top of the molecular one.
   * @param {string} [o.distribution] field name for f
   * @param {string} [o.macro]        field name for (rho, ux, uy, uz)
   */
  constructor({
    tau,
    force = [0, 0, 0],
    inletVelocity = [0, 0, 0],
    collision = COLLISION.TRT,
    trtPolicy = 'magic',
    smagorinsky = 0,
    distribution = 'f',
    macro = 'macro',
    name = 'LBM fluid',
  } = {}) {
    if (!(tau > 0.5)) throw new Error(`tau must be > 0.5 (got ${tau}); see UnitSystem.tauFromLatticeViscosity`);
    super({
      type: 'lbm.d3q19',
      name,
      reads: [distribution],
      writes: [distribution, macro],
      params: {
        tau, force: force.slice(), inletVelocity: inletVelocity.slice(), collision,
        trtPolicy,
        // Smagorinsky constant. 0 disables the model entirely -- and it must
        // disable it EXACTLY, because a sub-grid model that leaks into laminar
        // flow would corrupt the analytic cases this engine is verified against.
        smagorinsky,
        // A localised body force the user can apply by touching the field. It is
        // a PHYSICS INPUT, not a visual effect: momentum is injected into the
        // momentum field and then transported by the same operator as everything
        // else. `steps` counts down so a poke is an impulse rather than a
        // permanent source.
        impulse: { centre: [0, 0, 0], radius: 0, force: [0, 0, 0], steps: 0 },
      },
    });
    this.distribution = distribution;
    this.macro = macro;
  }

  declareFields(fields) {
    if (!fields.has(this.distribution)) {
      fields.add(new FieldSpec({
        name: this.distribution,
        kind: FIELD_KIND.DISTRIBUTION,
        components: Q,
        doubleBuffered: true,          // collide+stream reads src, writes dst
        units: 'lattice populations',
      }));
    }
    if (!fields.has(this.macro)) {
      fields.add(new FieldSpec({
        name: this.macro,
        kind: FIELD_KIND.VECTOR,      // (rho, ux, uy, uz) packed as 4 -> see note
        components: 4,
        doubleBuffered: false,
        units: 'lattice density / velocity',
      }));
    }
  }

  /**
   * Apply a momentum impulse in a sphere of `radius` lattice cells about
   * `centre`, lasting `steps` solver steps.
   */
  stir({ centre, radius = 3, force = [0, 0, 0], steps = 30 }) {
    this.params.impulse = { centre: centre.slice(), radius, force: force.slice(), steps };
    return this;
  }

  /**
   * Called by the kernels once per step so an impulse expires. Returns the
   * impulse to apply on THIS step and then counts it down -- decrementing first
   * would apply it `steps - 1` times, which showed up as exactly 19/20 of the
   * expected momentum.
   */
  tickImpulse() {
    const im = this.params.impulse;
    if (im.steps <= 0) return im;
    const active = { centre: im.centre, radius: im.radius, force: im.force, steps: im.steps };
    im.steps -= 1;
    if (im.steps === 0) im.radius = 0;
    return active;
  }

  /** Lattice kinematic viscosity implied by tau. */
  get latticeViscosity() { return (this.params.tau - 0.5) / 3; }

  describe() {
    const p = this.params;
    return `${this.name}: D3Q19 ${p.collision.toUpperCase()}, tau=${p.tau.toFixed(4)} `
      + `(nu=${this.latticeViscosity.toExponential(3)} lu), force=[${p.force.map((v) => v.toExponential(1)).join(', ')}]`;
  }
}

// NOTE on the macro field: it is declared with 4 components rather than 3 so
// that (rho, ux, uy, uz) is one 16-byte fetch and one rgba32float texel. A
// VECTOR field is 3 components by contract, so the component count is given
// explicitly; FieldSpec allows that for exactly this reason. If a later
// operator wants velocity alone it should declare its own VECTOR field rather
// than reinterpreting this one.
