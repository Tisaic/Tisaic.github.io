// ScalarTransportOperator -- a passive scalar advected and diffused by the flow.
//
// This is the engine's second physics operator, and the one the README promised
// would need "no core change": it registers a scalar field and a distribution,
// declares that it READS the fluid's velocity and WRITES a concentration, and the
// solver orders it after the fluid on the strength of that declaration alone.
//
// THE METHOD IS A SECOND LATTICE-BOLTZMANN DISTRIBUTION (the double-distribution-
// function model). A separate set of populations g_q rides the SAME D3Q19 stencil
// as the fluid -- same velocities, same weights, same streaming -- but carries a
// scalar instead of mass and momentum. Its equilibrium is the first-order
// truncation
//
//     g_eq_q = w_q C (1 + (c_q . u) / cs^2)
//
// with C = sum_q g_q the concentration and u the fluid velocity read from the
// `macro` field. Relaxing g toward that equilibrium at rate 1/tau_g and streaming
// recovers the advection-diffusion equation
//
//     dC/dt + u . grad C = D lap C,     D = cs^2 (tau_g - 1/2)
//
// so tau_g is the ONLY knob and it sets the diffusivity exactly the way the fluid's
// tau sets viscosity. The scalar is passive: it reads u and never writes it, which
// is why the coupling is one-way and the solver can run the fluid first, then this.
//
// WHY THE FIRST-ORDER EQUILIBRIUM. A passive scalar has no pressure and no momentum
// flux, so the (c.u)^2 Hermite term the fluid needs is not required to recover the
// advection-diffusion limit -- the linear equilibrium is the standard ADE model and
// it keeps the scalar collision cheaper than the fluid's. The cost is a slightly
// larger numerical diffusion at high cell Peclet number (u/D across one cell), the
// scalar analogue of the fluid's cell Reynolds number, documented rather than hidden.
//
// CONCENTRATION IS A CACHE, NOT STATE. C = sum g_q is recomputed from g every step,
// exactly as the fluid's rho and u are moments of f. The `conc` field exists only so
// the renderer, the diagnostics and the soft-sensor can read it without re-reducing
// Q populations per cell; it is written by the same kernel that computes it for the
// collision. That is why it is single-buffered while g is double-buffered.

import { PhysicsOperator } from '../operator.js';
import { FieldSpec, FIELD_KIND } from '../fields.js';
import { Q } from '../d3q19.js';

export class ScalarTransportOperator extends PhysicsOperator {
  /**
   * @param {object} o
   * @param {number} o.tau            scalar relaxation time, > 1/2; D = cs^2(tau-1/2)
   * @param {string} [o.velocity]     field to read u from (the LBM `macro` field:
   *                                  its components 1..3 are ux,uy,uz)
   * @param {string} [o.distribution] field name for the scalar populations g
   * @param {string} [o.concentration] field name for the derived scalar C
   * @param {number} [o.inletValue]   scalar carried in at INLET cells (clean inflow = 0)
   * @param {object} [o.source]       Dirichlet source: { centre:[x,y,z], radius, value }
   *                                  -- cells within radius are held at `value` every
   *                                  step, i.e. a continuous injector (a dye needle).
   * @param {number} [o.initialValue] uniform initial concentration of the whole field
   * @param {boolean} [o.clamp]       clamp C into [0,1] after streaming. OFF by
   *                                  default because a passive scalar in a divergence-
   *                                  free flow is analytically bounded by its own
   *                                  initial and boundary values, so a clamp firing in
   *                                  the verified cases would be masking a real
   *                                  over/undershoot rather than fixing one. The page
   *                                  turns it on where high-Peclet ringing is cosmetic.
   */
  constructor({
    tau = 0.6,
    velocity = 'macro',
    distribution = 'g',
    concentration = 'conc',
    inletValue = 0,
    source = { centre: [0, 0, 0], radius: 0, value: 0 },
    initialValue = 0,
    clamp = false,
    name = 'scalar transport',
  } = {}) {
    if (!(tau > 0.5)) throw new Error(`scalar tau must be > 0.5 (got ${tau}); D = cs^2 (tau - 1/2) would be <= 0`);
    super({
      type: 'scalar.d3q19',
      name,
      // Reads the velocity field it advects along; the solver uses this to order
      // the scalar AFTER whatever writes the velocity (the fluid operator).
      reads: [distribution, velocity],
      writes: [distribution, concentration],
      params: {
        tau,
        velocity,
        inletValue,
        source: {
          centre: (source.centre || [0, 0, 0]).slice(),
          radius: source.radius || 0,
          value: source.value || 0,
        },
        initialValue,
        clamp: !!clamp,
      },
    });
    this.distribution = distribution;
    this.concentration = concentration;
    this.velocity = velocity;
  }

  declareFields(fields) {
    if (!fields.has(this.distribution)) {
      fields.add(new FieldSpec({
        name: this.distribution,
        kind: FIELD_KIND.DISTRIBUTION,
        components: Q,
        doubleBuffered: true,          // collide+stream reads src, writes dst
        units: 'lattice scalar populations',
      }));
    }
    if (!fields.has(this.concentration)) {
      fields.add(new FieldSpec({
        name: this.concentration,
        kind: FIELD_KIND.SCALAR,       // C = sum g_q, a cache like the fluid macro
        components: 1,
        doubleBuffered: false,
        units: 'lattice concentration',
      }));
    }
  }

  /** Move or re-strength the Dirichlet source at runtime. */
  setSource({ centre, radius, value }) {
    const s = this.params.source;
    this.params.source = {
      centre: centre ? centre.slice() : s.centre.slice(),
      radius: radius != null ? radius : s.radius,
      value: value != null ? value : s.value,
    };
    return this;
  }

  /** Lattice scalar diffusivity implied by tau. */
  get latticeDiffusivity() { return (this.params.tau - 0.5) / 3; }

  describe() {
    const p = this.params;
    return `${this.name}: D3Q19 advection-diffusion, tau=${p.tau.toFixed(4)} `
      + `(D=${this.latticeDiffusivity.toExponential(3)} lu)`;
  }
}
