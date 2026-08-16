// Simulation — the public façade.
//
// The point of this file is that a simulation is DEFINED here and SOLVED
// elsewhere. Nothing in a scene definition names a backend, a buffer or a
// shader; nothing in a backend knows what a channel or an obstacle is.
//
//   const sim = new Simulation({ lattice: { size:[64,32,32], spacing: 1e-3 } });
//   sim.addMaterial(...); sim.addRegion(...); sim.addPhysics(new LBMFluid({...}));
//   await sim.build();            // picks a backend, allocates, initialises
//   sim.advance(10);
//
// build() is async only because acquiring a GPU device is. Everything after it
// is synchronous, so a render loop can call advance() without awaiting.

import { Lattice, TOPOLOGY } from './lattice.js';
import { FieldRegistry, formatBytes } from './fields.js';
import { MaterialRegistry, classify, census, CELL } from './materials.js';
import { Solver } from './solver.js';
import { UnitSystem } from './units.js';
import { CPUBackend, reduceMacro, CPU_MAX_CELLS } from './backends/cpu.js';

export class Simulation {
  /**
   * @param {object} o
   * @param {object} o.lattice  { size, spacing, origin?, topology? }
   * @param {object} [o.units]  { dx, dt, rho0 } — defaults to dx = spacing, dt = 1
   */
  constructor({ lattice, units }) {
    this.lattice = new Lattice(lattice);
    this.units = units instanceof UnitSystem ? units
      : new UnitSystem(units || { dx: this.lattice.spacing, dt: 1, rho0: 1000 });
    this.fields = new FieldRegistry(this.lattice);
    this.materials = new MaterialRegistry();
    this.regions = [];
    this.operators = [];
    this.solver = null;
    this.backend = null;
    this.flags = null;
  }

  addMaterial(m) { this.materials.add(m); return this; }

  /** Regions are applied in order; a later one overwrites an earlier one. */
  addRegion(r) { this.regions.push(r); return this; }

  addPhysics(op) {
    this.operators.push(op);
    op.declareFields(this.fields);
    return this;
  }

  /** Bytes the declared fields will need. Callable before build(). */
  memoryEstimate() { return this.fields.report(); }

  /**
   * @param {object} [o]
   * @param {string} [o.backend]   'auto' | 'webgpu' | 'cpu'
   * @param {string} [o.precision] CPU reference only: 'f32' (GPU parity) | 'f64'
   * @param {object} [o.gpu]       passed to the WebGPU backend
   */
  async build({ backend = 'auto', precision = 'f32', gpu = {} } = {}) {
    this.flags = classify(this.lattice, this.regions);
    const ctorArgs = { lattice: this.lattice, fields: this.fields, flags: this.flags, precision, ...gpu };

    let chosen = null, gpuError = null;
    if (backend === 'webgpu' || backend === 'auto') {
      try {
        const { WebGPUBackend } = await import('./backends/webgpu.js');
        if (await WebGPUBackend.isAvailable()) chosen = await WebGPUBackend.create(ctorArgs);
        else gpuError = 'WebGPU is not available in this browser';
      } catch (e) {
        gpuError = String(e && e.message ? e.message : e);
      }
      if (!chosen && backend === 'webgpu') throw new Error('WebGPU backend unavailable: ' + gpuError);
    }
    if (!chosen) chosen = new CPUBackend(ctorArgs);

    this.backend = chosen;
    this.backendFallbackReason = chosen.kind === 'cpu' ? gpuError : null;
    this.solver = new Solver({
      lattice: this.lattice, fields: this.fields, materials: this.materials,
      flags: this.flags, units: this.units, backend: chosen, operators: this.operators,
    });
    this.solver.initialize();
    await this.solver.verify();     // throws loudly rather than running on zeros
    this.solver.initialize();       // discard the probe step
    return this;
  }

  advance(n = 1) {
    if (!this.solver) throw new Error('call build() first');
    return this.solver.advance(n);
  }

  get step() { return this.solver ? this.solver.step : 0; }

  /**
   * Diagnostics over the macroscopic field. GPU→CPU readback happens here and
   * nowhere else in the hot path, which is why it is a deliberate call rather
   * than something the render loop does implicitly every frame.
   */
  async diagnostics(macroField = 'macro') {
    // A backend that can reduce on-device does so: pulling 4 floats per cell
    // back to JavaScript to compute a mean would be exactly the transfer this
    // architecture exists to avoid. The CPU reference has no such distinction.
    const d = this.backend.reduce
      ? await this.backend.reduce(macroField)
      : reduceMacro(this.lattice, this.flags, await this.backend.snapshot(macroField));
    return { ...d, step: this.step, stable: this.assess(d) };
  }

  /**
   * Stability verdict. Reported as a named state rather than a boolean because
   * "unstable" and "about to be unstable" need different responses, and
   * because an engine that hides numerical trouble behind visual smoothing is
   * the thing this architecture is explicitly not.
   */
  assess(d) {
    if (!d.finite) return { state: 'diverged', why: 'non-finite values in the macroscopic field' };
    if (d.rhoMin <= 0) return { state: 'diverged', why: `density reached ${d.rhoMin.toExponential(2)}` };
    if (d.uMax > 0.3) return { state: 'unstable', why: `lattice velocity ${d.uMax.toFixed(3)} exceeds 0.3` };
    if (d.uMax > 0.15) return { state: 'marginal', why: `lattice velocity ${d.uMax.toFixed(3)} is high` };
    if (d.rhoMax - d.rhoMin > 0.25) {
      return { state: 'marginal', why: `density spread ${(d.rhoMax - d.rhoMin).toFixed(3)} is large` };
    }
    return { state: 'ok', why: '' };
  }

  cellCensus() { return census(this.flags); }

  describe() {
    const mem = this.memoryEstimate();
    return [
      this.lattice.describe(),
      `fields: ${formatBytes(mem.bytes)} (${mem.items.length})`,
      `backend: ${this.backend ? this.backend.label : 'not built'}`,
      ...this.operators.map((o) => o.describe()),
    ].join('\n');
  }

  destroy() { if (this.solver) this.solver.destroy(); this.solver = null; }
}

export { TOPOLOGY, CELL, CPU_MAX_CELLS, formatBytes, UnitSystem };
