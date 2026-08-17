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
    this._lastDiagStep = undefined;     // a rebuilt run has no previous reading
    this._prevMacro = undefined;
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
    let d;
    if (this.backend.reduce) {
      d = await this.backend.reduce(macroField);
    } else {
      const macro = await this.backend.snapshot(macroField);
      d = reduceMacro(this.lattice, this.flags, macro, this._prevMacro);
      this._prevMacro = macro.slice();
    }
    // THE RESIDUAL IS PER STEP, and that is not cosmetic. The backends report
    // ||du|| / ||u|| between successive READINGS, which grows with however many
    // steps happened in between -- so an unnormalised residual would change when
    // the steps-per-frame slider moved, i.e. a VIEWING control would alter a
    // convergence number while the physics did not. Dividing by the elapsed
    // steps makes it a rate, independent of how often anyone happens to look.
    //
    // The first reading, and any reading with no steps since the last one, has
    // nothing to compare against: report undefined rather than a number. A zero
    // there would read as "perfectly steady" when it means "not measured".
    const dstep = this._lastDiagStep === undefined ? 0 : this.step - this._lastDiagStep;
    this._lastDiagStep = this.step;
    d = { ...d, residual: dstep > 0 ? d.residual / dstep : undefined };
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
    // THE LIMITER IS RUNNING, AND THAT HAS TO BE SAID. The run is alive because
    // cells are being held at the velocity clamp, which means those cells are no
    // longer solving the equations they were asked to solve. Reported before the
    // stability verdicts below, because "it looks stable" is exactly the wrong
    // conclusion to draw from a rescued simulation.
    if (d.limited > 0) {
      const pct = (100 * d.limited / Math.max(1, d.cells)).toFixed(2);
      return { state: 'limited', why: `${d.limited} cell(s) held at the velocity limit (${pct}% of the fluid)` };
    }
    if (d.rhoMin <= 0) return { state: 'diverged', why: `density reached ${d.rhoMin.toExponential(2)}` };
    if (d.uMax > 0.3) return { state: 'unstable', why: `lattice velocity ${d.uMax.toFixed(3)} exceeds 0.3` };
    if (d.uMax > 0.15) return { state: 'marginal', why: `lattice velocity ${d.uMax.toFixed(3)} is high` };
    if (d.rhoMax - d.rhoMin > 0.25) {
      return { state: 'marginal', why: `density spread ${(d.rhoMax - d.rhoMin).toFixed(3)} is large` };
    }
    // A converged run is worth saying out loud: without it, "settled" and
    // "drifting very slowly" look identical on screen. The threshold is measured
    // rather than picked -- the per-step residual falls five decades over a few
    // thousand steps (channel 1.3e-2 at step 200 to 1.1e-8 by 4840), so 1e-3
    // separates "still developing" from "converged" with room on both sides.
    //
    // NOTE there is deliberately no `residual > 0` guard. Poiseuille converges
    // hard enough that the f32 velocity delta underflows to EXACTLY zero, and
    // that guard made the most converged run on the tab report "not steady".
    // "No reading yet" is undefined, which is a different thing from zero.
    if (d.residual !== undefined && d.residual < 1e-3) {
      return { state: 'ok', why: 'steady' };
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

  /** Awaitable: the GPU backend defers teardown past any in-flight readback. */
  destroy() {
    const done = this.solver ? this.solver.destroy() : undefined;
    this.solver = null;
    return Promise.resolve(done);
  }
}

export { TOPOLOGY, CELL, CPU_MAX_CELLS, formatBytes, UnitSystem };
