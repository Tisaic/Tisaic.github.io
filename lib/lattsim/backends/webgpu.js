// WebGPU backend — the production solver.
//
// The rules this file exists to keep:
//   * per-cell physics runs in compute shaders, never in JavaScript;
//   * buffers are allocated once and reused; nothing is created per frame;
//   * the only GPU->CPU transfer in the steady state is the diagnostic
//     reduction, which returns a handful of floats and is called on demand,
//     not per frame;
//   * ping-pong buffers are swapped by rebinding, not by copying.
//
// Everything numerical is generated in wgsl.js from the same constants the CPU
// reference uses. This file is plumbing.

import { KernelRegistry } from '../operator.js';
import { collideStreamWGSL, openBoundaryWGSL, initWGSL, reduceWGSL, REDUCE_STRIDE } from './wgsl.js';

const WORKGROUP = 64;

export class WebGPUBackend {
  static async isAvailable() {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    try { return !!(await navigator.gpu.requestAdapter()); } catch { return false; }
  }

  static async create({ lattice, fields, flags, powerPreference = 'high-performance' }) {
    if (typeof navigator === 'undefined' || !navigator.gpu) throw new Error('WebGPU is not available');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference });
    if (!adapter) throw new Error('no WebGPU adapter');

    // Ask for the limits the lattice actually needs rather than the defaults:
    // the default maxStorageBufferBindingSize is 128 MiB, and a 128^3 D3Q19
    // distribution is 159 MiB per buffer.
    const need = Math.max(...fields.list().map((s) => s.byteLength(lattice.cellCount)));
    const want = {};
    if (need > adapter.limits.maxStorageBufferBindingSize) {
      throw new Error(`lattice needs a ${(need / 1048576).toFixed(0)} MiB storage binding, `
        + `device allows ${(adapter.limits.maxStorageBufferBindingSize / 1048576).toFixed(0)} MiB — `
        + 'reduce the resolution');
    }
    want.maxStorageBufferBindingSize = Math.min(need * 2, adapter.limits.maxStorageBufferBindingSize);
    want.maxBufferSize = Math.min(Math.max(need * 2, 268435456), adapter.limits.maxBufferSize);

    const device = await adapter.requestDevice({ requiredLimits: want });
    const backend = new WebGPUBackend({ lattice, fields, flags, adapter, device });
    // Compile everything up front and REFUSE if anything is invalid. WebGPU
    // reports shader errors asynchronously and does not throw: an invalid module
    // yields an invalid pipeline, dispatches against it are dropped, and the
    // simulation runs at full speed producing zeros. That is exactly how the
    // first version of this backend behaved -- `macro` is a reserved word in
    // WGSL, every module failed to compile, and nothing anywhere said so. The
    // only reason it was caught is that the CPU reference disagreed.
    await backend.assertShadersCompile();
    return backend;
  }

  constructor({ lattice, fields, flags, adapter, device }) {
    this.kind = 'webgpu';
    this.lattice = lattice;
    this.fields = fields;
    this.flags = flags;
    this.adapter = adapter;
    this.device = device;
    this.lost = null;
    device.lost.then((info) => { this.lost = info; });
    const info = adapter.info || {};
    this.label = `WebGPU${info.vendor ? ' · ' + info.vendor : ''}${info.architecture ? ' ' + info.architecture : ''}`;

    this.buffers = new Map();
    for (const spec of fields.list()) {
      const bytes = spec.byteLength(lattice.cellCount);
      const mk = (n) => device.createBuffer({
        label: n, size: bytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      this.buffers.set(spec.name, { spec, a: mk(spec.name + '.a'), b: spec.doubleBuffered ? mk(spec.name + '.b') : null });
    }

    // Cell classification: uploaded once, never written by a shader.
    this.flagBuffer = device.createBuffer({
      label: 'flags', size: Math.max(16, flags.byteLength),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.flagBuffer, 0, flags);

    // One reusable staging buffer per readback shape. Allocating a mapped
    // buffer per readback is the classic way to make a "rare" transfer expensive.
    this.groups = Math.ceil(lattice.cellCount / WORKGROUP);
    this.partialBytes = this.groups * REDUCE_STRIDE * 4;
    this.partialBuffer = device.createBuffer({
      label: 'reduce.partials', size: this.partialBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.readbackBuffer = device.createBuffer({
      label: 'reduce.readback', size: this.partialBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    this.snapshotBuffer = null;

    // Anything the driver reports that we did not explicitly scope lands here.
    this.errors = [];
    if (typeof device.addEventListener === 'function') {
      device.addEventListener('uncapturederror', (e) => {
        this.errors.push(String(e.error && e.error.message ? e.error.message : e.error));
      });
    }

    this.kernels = new KernelRegistry().register('lbm.d3q19', (ctx, op) => new GPULBM(ctx, op));
    this.buildReduce();
  }

  /**
   * Compile every shader this backend can emit and surface the messages. Called
   * once at creation; throws on the first error rather than letting an invalid
   * pipeline run silently.
   */
  async assertShadersCompile() {
    const sources = [
      ['init', initWGSL(this.lattice, { workgroup: [WORKGROUP, 1, 1] })],
      ['collideStream', collideStreamWGSL(this.lattice, { workgroup: [WORKGROUP, 1, 1] })],
      ['openBoundary', openBoundaryWGSL(this.lattice, { workgroup: [WORKGROUP, 1, 1] })],
      ['reduce', reduceWGSL(this.lattice, { workgroup: WORKGROUP })],
    ];
    const problems = [];
    for (const [name, code] of sources) {
      this.device.pushErrorScope('validation');
      const mod = this.device.createShaderModule({ label: 'check.' + name, code });
      const info = mod.getCompilationInfo ? await mod.getCompilationInfo() : { messages: [] };
      const scoped = await this.device.popErrorScope();
      for (const m of info.messages) {
        if (m.type === 'error') problems.push(`${name}:${m.lineNum}:${m.linePos} ${m.message}`);
      }
      if (scoped) problems.push(`${name}: ${scoped.message}`);
    }
    if (problems.length) {
      throw new Error('WGSL failed to compile — ' + problems.join(' | '));
    }
    return true;
  }

  read(name) { return this.buffers.get(name).a; }
  write(name) { const e = this.buffers.get(name); return e.b || e.a; }
  swap(name) { const e = this.buffers.get(name); if (e.b) { const t = e.a; e.a = e.b; e.b = t; } }

  buildReduce() {
    const module = this.device.createShaderModule({
      label: 'reduce', code: reduceWGSL(this.lattice, { workgroup: WORKGROUP }),
    });
    this.reducePipeline = this.device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
  }

  /**
   * Diagnostic reduction. One dispatch, one small copy, one map. This is the
   * only routine transfer off the GPU.
   */
  async reduce(macroField = 'macro') {
    // Readbacks share one staging buffer, and a second mapAsync while the first
    // is pending is an error. Concurrent callers (the render loop refreshing
    // stats while something else asks for diagnostics) therefore share the
    // in-flight result rather than racing for the buffer.
    if (this._reducing) return this._reducing;
    this._reducing = this._reduce(macroField).finally(() => { this._reducing = null; });
    return this._reducing;
  }

  async _reduce(macroField) {
    if (this.lost) throw new Error('GPU device lost: ' + (this.lost.reason || this.lost.message || 'unknown'));
    const enc = this.device.createCommandEncoder({ label: 'reduce' });
    const pass = enc.beginComputePass();
    pass.setPipeline(this.reducePipeline);
    pass.setBindGroup(0, this.device.createBindGroup({
      layout: this.reducePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.read(macroField) } },
        { binding: 1, resource: { buffer: this.flagBuffer } },
        { binding: 2, resource: { buffer: this.partialBuffer } },
      ],
    }));
    pass.dispatchWorkgroups(this.groups);
    pass.end();
    enc.copyBufferToBuffer(this.partialBuffer, 0, this.readbackBuffer, 0, this.partialBytes);
    this.device.queue.submit([enc.finish()]);

    await this.readbackBuffer.mapAsync(GPUMapMode.READ);
    const v = new Float32Array(this.readbackBuffer.getMappedRange()).slice();
    this.readbackBuffer.unmap();

    let mass = 0, px = 0, py = 0, pz = 0, ke = 0, cells = 0, bad = 0;
    let rhoMin = Infinity, rhoMax = -Infinity, uMaxSq = 0;
    for (let g = 0; g < this.groups; g++) {
      const o = g * REDUCE_STRIDE;
      mass += v[o]; px += v[o + 1]; py += v[o + 2]; pz += v[o + 3]; ke += v[o + 4];
      if (v[o + 8] > 0) { rhoMin = Math.min(rhoMin, v[o + 5]); rhoMax = Math.max(rhoMax, v[o + 6]); }
      uMaxSq = Math.max(uMaxSq, v[o + 7]);
      cells += v[o + 8]; bad += v[o + 9];
    }
    return {
      cells, mass, momentum: [px, py, pz], kineticEnergy: ke,
      rhoMin: cells ? rhoMin : 0, rhoMax: cells ? rhoMax : 0,
      uMax: Math.sqrt(uMaxSq), finite: bad === 0,
    };
  }

  /**
   * Full-field readback. Deliberately awkward to reach for: it allocates on
   * first use, copies the whole field, and is only used by the slice renderer
   * (throttled) and by the parity test against the CPU reference.
   */
  async snapshot(name) {
    if (this._snapping) await this._snapping.catch(() => {});
    this._snapping = this._snapshot(name).finally(() => { this._snapping = null; });
    return this._snapping;
  }

  async _snapshot(name) {
    const e = this.buffers.get(name);
    const bytes = e.spec.byteLength(this.lattice.cellCount);
    if (!this.snapshotBuffer || this.snapshotBuffer.size < bytes) {
      if (this.snapshotBuffer) this.snapshotBuffer.destroy();
      this.snapshotBuffer = this.device.createBuffer({
        label: 'snapshot', size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
    }
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(e.a, 0, this.snapshotBuffer, 0, bytes);
    this.device.queue.submit([enc.finish()]);
    await this.snapshotBuffer.mapAsync(GPUMapMode.READ, 0, bytes);
    const Arr = e.spec.dtype === 'u32' ? Uint32Array : Float32Array;
    const out = new Arr(this.snapshotBuffer.getMappedRange(0, bytes)).slice();
    this.snapshotBuffer.unmap();
    return out;
  }

  destroy() {
    for (const e of this.buffers.values()) { e.a.destroy(); if (e.b) e.b.destroy(); }
    this.flagBuffer.destroy();
    this.partialBuffer.destroy();
    this.readbackBuffer.destroy();
    if (this.snapshotBuffer) this.snapshotBuffer.destroy();
    this.buffers.clear();
  }
}

class GPULBM {
  constructor(ctx, op) {
    this.ctx = ctx;
    this.op = op;
    this.name = op.name;
    const { lattice, backend } = ctx;
    const dev = backend.device;

    // 64 bytes, not 48: WGSL aligns each vec3<f32> member to 16, so the struct
    // is omega/forcePre (0,4) · pad · force (16) · inletVel (32) · pad, and the
    // whole thing rounds up to 64. Getting this wrong produces a bind group that
    // fails validation, an invalid command buffer, and a simulation of zeros.
    this.params = dev.createBuffer({
      label: 'lbm.params', size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.paramData = new Float32Array(16);
    this.uploadParams();

    const mk = (code, label) => dev.createComputePipeline({
      label, layout: 'auto',
      compute: { module: dev.createShaderModule({ label, code }), entryPoint: 'main' },
    });
    this.initPipeline = mk(initWGSL(lattice, { workgroup: [WORKGROUP, 1, 1] }), 'lbm.init');
    this.stepPipeline = mk(collideStreamWGSL(lattice, { workgroup: [WORKGROUP, 1, 1] }), 'lbm.collideStream');
    this.openPipeline = mk(openBoundaryWGSL(lattice, { workgroup: [WORKGROUP, 1, 1] }), 'lbm.openBoundary');
    this.groups = Math.ceil(lattice.cellCount / WORKGROUP);
    // Skip the boundary pass entirely when the geometry has no open faces.
    this.hasOpen = ctx.flags.includes(2) || ctx.flags.includes(3);   // CELL.INLET / CELL.OUTLET
  }

  uploadParams() {
    const { tau, force, inletVelocity } = this.op.params;
    const d = this.paramData;
    d[0] = 1 / tau;
    d[1] = 1 - 0.5 / tau;
    // vec3 members are 16-byte aligned in WGSL, hence the gaps.
    d[4] = force[0]; d[5] = force[1]; d[6] = force[2];
    d[8] = inletVelocity[0]; d[9] = inletVelocity[1]; d[10] = inletVelocity[2];
    this.ctx.backend.device.queue.writeBuffer(this.params, 0, d);
  }

  bindStep() {
    const b = this.ctx.backend;
    return b.device.createBindGroup({
      layout: this.stepPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: b.read(this.op.distribution) } },
        { binding: 1, resource: { buffer: b.write(this.op.distribution) } },
        { binding: 2, resource: { buffer: b.flagBuffer } },
        { binding: 3, resource: { buffer: b.write(this.op.macro) } },
        { binding: 4, resource: { buffer: this.params } },
      ],
    });
  }

  async verifyFirstDispatch() {
    const dev = this.ctx.backend.device;
    dev.pushErrorScope('validation');
    this.initialize();
    this.step();
    const err = await dev.popErrorScope();
    if (err) throw new Error('GPU dispatch rejected: ' + err.message);
    return true;
  }

  initialize() {
    const b = this.ctx.backend;
    const e = b.buffers.get(this.op.distribution);
    const enc = b.device.createCommandEncoder({ label: 'lbm.init' });
    const pass = enc.beginComputePass();
    pass.setPipeline(this.initPipeline);
    pass.setBindGroup(0, b.device.createBindGroup({
      layout: this.initPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: e.a } },
        { binding: 1, resource: { buffer: e.b } },
        { binding: 2, resource: { buffer: b.flagBuffer } },
        { binding: 3, resource: { buffer: b.write(this.op.macro) } },
        { binding: 4, resource: { buffer: this.params } },
      ],
    }));
    pass.dispatchWorkgroups(this.groups);
    pass.end();
    b.device.queue.submit([enc.finish()]);
  }

  step() {
    const b = this.ctx.backend;
    const enc = b.device.createCommandEncoder({ label: 'lbm.step' });
    const pass = enc.beginComputePass();
    pass.setPipeline(this.stepPipeline);
    pass.setBindGroup(0, this.bindStep());
    pass.dispatchWorkgroups(this.groups);
    if (this.hasOpen) {
      pass.setPipeline(this.openPipeline);
      pass.setBindGroup(0, b.device.createBindGroup({
        layout: this.openPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: b.write(this.op.distribution) } },
          { binding: 1, resource: { buffer: b.flagBuffer } },
          { binding: 2, resource: { buffer: b.write(this.op.macro) } },
          { binding: 3, resource: { buffer: this.params } },
        ],
      }));
      pass.dispatchWorkgroups(this.groups);
    }
    pass.end();
    b.device.queue.submit([enc.finish()]);
    b.swap(this.op.distribution);
  }

  destroy() { this.params.destroy(); }
}
