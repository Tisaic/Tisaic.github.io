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
// Collision model is BGK/SRT: one relaxation time, the simplest thing that is
// actually correct. `collision` is a parameter rather than a hard-coded path
// so MRT or an entropic stabiliser can be added as another kernel behind the
// same operator description.

import { PhysicsOperator } from '../operator.js';
import { FieldSpec, FIELD_KIND } from '../fields.js';
import { Q } from '../d3q19.js';

export const COLLISION = Object.freeze({ BGK: 'bgk' });

export class LBMFluidOperator extends PhysicsOperator {
  /**
   * @param {object} o
   * @param {number} o.tau            relaxation time, LATTICE units, > 1/2
   * @param {number[]} [o.force]      body force per unit density, lattice units
   * @param {number[]} [o.inletVelocity] lattice units, used by INLET cells
   * @param {string} [o.collision]    COLLISION.*
   * @param {string} [o.distribution] field name for f
   * @param {string} [o.macro]        field name for (rho, ux, uy, uz)
   */
  constructor({
    tau,
    force = [0, 0, 0],
    inletVelocity = [0, 0, 0],
    collision = COLLISION.BGK,
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
