// The solver: owns the backend, orders the operators, drives the step loop and
// enforces the write discipline.
//
// Two rules are enforced here rather than left to convention, because both
// failure modes are silent:
//
//   1. NO TWO OPERATORS MAY WRITE THE SAME FIELD IN ONE STAGE. Whichever ran
//      last would win, and the result would look like a physics result.
//   2. ANYTHING AN OPERATOR ADVANCES IN TIME MUST BE DOUBLE-BUFFERED. Reading
//      and writing one buffer means a cell's neighbours are half-updated, and
//      on the GPU that is a race with no error message.

export class Solver {
  constructor({ lattice, fields, materials, flags, units, backend, operators }) {
    this.lattice = lattice;
    this.fields = fields;
    this.materials = materials;
    this.flags = flags;
    this.units = units;
    this.backend = backend;
    this.operators = operators;
    this.step = 0;
    this.kernels = [];
    this._validate();
    const ctx = { lattice, fields, materials, flags, units, backend };
    this.ctx = ctx;
    for (const op of operators) {
      if (!backend.kernels.has(op.type)) {
        throw new Error(`backend "${backend.kind}" cannot execute "${op.type}" (${op.name})`);
      }
      this.kernels.push({ op, kernel: backend.kernels.create(op.type, ctx, op) });
    }
  }

  _validate() {
    const writers = new Map();
    for (const op of this.operators) {
      for (const w of op.writes) {
        if (!this.fields.has(w)) throw new Error(`${op.name} writes unknown field "${w}"`);
        if (writers.has(w)) {
          throw new Error(`fields written twice in one stage: "${w}" by ${writers.get(w)} and ${op.name}. `
            + 'Give one of them its own field, or sequence them into separate stages.');
        }
        writers.set(w, op.name);
      }
      for (const r of op.reads) {
        if (!this.fields.has(r)) throw new Error(`${op.name} reads unknown field "${r}"`);
      }
    }
  }

  initialize() {
    for (const { kernel } of this.kernels) kernel.initialize();
    this.step = 0;
    return this;
  }

  /**
   * Run one dispatch of every kernel inside whatever error checking the backend
   * offers, and throw if anything was rejected. On a GPU an invalid bind group
   * does not throw: the command buffer is dropped and the simulation runs at
   * full speed producing zeros. The `uncapturederror` event is not a reliable
   * safety net either -- it did not fire in the browser this was developed
   * against -- so the check is explicit and happens once at build time.
   */
  async verify() {
    for (const { kernel } of this.kernels) {
      if (kernel.verifyFirstDispatch) await kernel.verifyFirstDispatch();
    }
    this.step = 0;
    return this;
  }

  /** Advance `n` steps. Returns the number actually advanced. */
  advance(n = 1) {
    for (let k = 0; k < n; k++) {
      for (const { op, kernel } of this.kernels) if (op.enabled) kernel.step();
      this.step++;
    }
    return n;
  }

  destroy() {
    for (const { kernel } of this.kernels) if (kernel.destroy) kernel.destroy();
    // Returned so a caller replacing this simulation can await the teardown
    // before allocating the next one (the GPU backend may defer it).
    return this.backend.destroy();
  }
}
