// The physics-operator contract.
//
// An operator is a DESCRIPTION of a physical process: which fields it reads,
// which it writes, what parameters it carries, and what it is called. It does
// not contain the inner loop. Backends implement the kernel for an operator
// `type`, which is what allows the same LBMFluid description to run as a WGSL
// compute shader on a phone and as a typed-array loop in a Node test, and be
// checked against each other.
//
// Composition rule: operators declare `reads` and `writes` by field name, and
// the solver uses that to order them and to catch the mistake where two
// operators write the same field in the same stage. Coupling between physics
// is therefore explicit and inspectable rather than implicit in call order.

export class PhysicsOperator {
  /**
   * @param {object} o
   * @param {string} o.type    kernel identifier a backend can implement
   * @param {string} [o.name]  instance name, for diagnostics
   * @param {string[]} [o.reads]
   * @param {string[]} [o.writes]
   * @param {object} [o.params]
   */
  constructor({ type, name, reads = [], writes = [], params = {} }) {
    if (!type) throw new Error('operator needs a type');
    this.type = type;
    this.name = name || type;
    this.reads = reads.slice();
    this.writes = writes.slice();
    this.params = { ...params };
    this.enabled = true;
  }

  /**
   * Declare the fields this operator needs. Called once, before allocation, so
   * an operator can add its own storage to the registry.
   * @param {import('./fields.js').FieldRegistry} _fields
   */
  declareFields(_fields) {}

  /**
   * Fill initial state. Runs on the host through the backend's writer, so it
   * works identically on CPU and GPU.
   * @param {object} _ctx { lattice, fields, backend, flags, units }
   */
  initialize(_ctx) {}

  /**
   * Runtime parameter change. Backends re-upload uniforms rather than rebuild.
   *
   * `paramsDirty` is what makes that true on the GPU. The CPU reference reads
   * `params` fresh every step, so it picks a change up for nothing -- but the
   * WebGPU kernel keeps its parameters in a uniform buffer and, with a steady
   * inlet and no impulse, had no reason to rewrite it after initialisation. A
   * change made through here would then apply on one backend and be silently
   * ignored on the other, which is the worst available outcome: the page would
   * report the new viscosity while the shader kept solving the old one.
   */
  setParams(p) { Object.assign(this.params, p); this.paramsDirty = true; return this; }

  /** Human-readable one-liner for the UI. */
  describe() { return `${this.name} (${this.type})`; }
}

/**
 * Registry of backend kernels. A backend calls register() at construction for
 * each operator type it can execute; the solver refuses to run an operator no
 * backend can execute rather than silently skipping it, because a physics
 * module that quietly does nothing is the worst failure mode available.
 */
export class KernelRegistry {
  constructor() { this.kernels = new Map(); }
  register(type, factory) { this.kernels.set(type, factory); return this; }
  has(type) { return this.kernels.has(type); }
  create(type, ctx, operator) {
    const f = this.kernels.get(type);
    if (!f) throw new Error(`backend cannot execute operator type "${type}"`);
    return f(ctx, operator);
  }
}
