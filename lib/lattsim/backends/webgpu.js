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
import { omegaMinusFor, MAGIC } from '../operators/lbm.js';

const WORKGROUP = 64;

// ONE adapter and ONE device for the lifetime of the page.
//
// Every rebuild used to request its own adapter and device. That is wasteful --
// device creation is not cheap -- and on the software adapter this was developed
// against it is actively harmful: the WebGPU instance is kept alive by its live
// adapters, so dropping the previous one can tear the instance down underneath
// the new device, which then fails every operation with "a valid external
// Instance reference no longer exists". Buffers belong to a simulation and are
// destroyed with it; the device does not.
let _devicePromise = null;

export async function acquireDevice({ powerPreference = 'high-performance' } = {}) {
  if (_devicePromise) {
    const cached = await _devicePromise;
    if (!cached.lost) return cached;
    _devicePromise = null;              // it really is gone -- try once more
  }
  _devicePromise = (async () => {
    if (typeof navigator === 'undefined' || !navigator.gpu) throw new Error('WebGPU is not available');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference });
    if (!adapter) throw new Error('no WebGPU adapter');
    // Ask for everything the adapter allows, once. Requesting per-lattice limits
    // would mean a new device per resolution change, which is the thing above.
    const device = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      },
    });
    const entry = { adapter, device, lost: null };
    device.lost.then((info) => { entry.lost = info; });
    return entry;
  })();
  return _devicePromise;
}

export class WebGPUBackend {
  static async isAvailable() {
    if (typeof navigator === 'undefined' || !navigator.gpu) return false;
    try { return !!(await acquireDevice()); } catch { return false; }
  }

  /** Limits of the shared device, for callers sizing a lattice up front. */
  static async limits() {
    const { device } = await acquireDevice();
    return device.limits;
  }

  static async create({ lattice, fields, flags, powerPreference = 'high-performance' }) {
    const { adapter, device } = await acquireDevice({ powerPreference });

    // A D3Q19 distribution is 19 floats per cell and there are two of them.
    // Check the biggest single binding against what the device will actually
    // allow, and refuse with a number rather than failing at allocation.
    const need = Math.max(...fields.list().map((s) => s.byteLength(lattice.cellCount)));
    if (need > device.limits.maxStorageBufferBindingSize) {
      throw new Error(`lattice needs a ${(need / 1048576).toFixed(0)} MiB storage binding, `
        + `device allows ${(device.limits.maxStorageBufferBindingSize / 1048576).toFixed(0)} MiB — `
        + 'reduce the resolution');
    }
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
    // A copy of the macroscopic field as it was at the previous reduction, so
    // the residual (how much the velocity field is still moving) can be computed
    // on-device rather than by pulling the whole field back. Allocated lazily
    // against the field actually being reduced: guessing it here from "the first
    // 4-component field" would size a copy from a buffer it does not describe,
    // and a copy of the wrong length is the silent-failure class this backend
    // already carries two scars from.
    this.macroPrev = null;
    this.prevBytes = 0;
    this.probeBuffer = null;

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
    // Size the previous-field copy from the buffer it will actually be copied
    // from, the first time anyone reduces.
    const src = this.read(macroField);
    if (!this.macroPrev) {
      this.prevBytes = src.size;
      this.macroPrev = this.device.createBuffer({
        label: 'macro.prev', size: this.prevBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
    }
    const enc = this.device.createCommandEncoder({ label: 'reduce' });
    const pass = enc.beginComputePass();
    pass.setPipeline(this.reducePipeline);
    pass.setBindGroup(0, this.device.createBindGroup({
      layout: this.reducePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: src } },
        { binding: 1, resource: { buffer: this.flagBuffer } },
        { binding: 2, resource: { buffer: this.partialBuffer } },
        { binding: 3, resource: { buffer: this.macroPrev } },
      ],
    }));
    pass.dispatchWorkgroups(this.groups);
    pass.end();
    enc.copyBufferToBuffer(this.partialBuffer, 0, this.readbackBuffer, 0, this.partialBytes);
    // Snapshot the field for the next residual, on-device.
    enc.copyBufferToBuffer(src, 0, this.macroPrev, 0, this.prevBytes);
    this.device.queue.submit([enc.finish()]);

    await this.readbackBuffer.mapAsync(GPUMapMode.READ);
    const v = new Float32Array(this.readbackBuffer.getMappedRange()).slice();
    this.readbackBuffer.unmap();

    let mass = 0, px = 0, py = 0, pz = 0, ke = 0, cells = 0, bad = 0;
    let rhoMin = Infinity, rhoMax = -Infinity, uMaxSq = 0, sumDU = 0, sumU2 = 0, limited = 0;
    for (let g = 0; g < this.groups; g++) {
      const o = g * REDUCE_STRIDE;
      mass += v[o]; px += v[o + 1]; py += v[o + 2]; pz += v[o + 3]; ke += v[o + 4];
      if (v[o + 8] > 0) { rhoMin = Math.min(rhoMin, v[o + 5]); rhoMax = Math.max(rhoMax, v[o + 6]); }
      uMaxSq = Math.max(uMaxSq, v[o + 7]);
      cells += v[o + 8]; bad += v[o + 9];
      sumDU += v[o + 10]; sumU2 += v[o + 11]; limited += v[o + 12];
    }
    return {
      cells, mass, momentum: [px, py, pz], kineticEnergy: ke,
      rhoMin: cells ? rhoMin : 0, rhoMax: cells ? rhoMax : 0,
      uMax: Math.sqrt(uMaxSq), finite: bad === 0,
      residual: sumU2 > 0 ? Math.sqrt(sumDU / sumU2) : 0,
      limited,
    };
  }

  /**
   * ONE CELL, not the whole field.
   *
   * A probe sampled every frame is exactly the kind of transfer this backend
   * exists to avoid -- at 1.3M cells a macro snapshot is 21 MB. The field is
   * structure-of-arrays, so a cell's four components live at four separate
   * offsets, and four 4-byte copies into a 16-byte staging buffer is the whole
   * cost. No compute pass, no full readback.
   */
  async probe(name, cell) {
    if (this._probing) await this._probing.catch(() => {});
    this._probing = this._probe(name, cell).finally(() => { this._probing = null; });
    return this._probing;
  }

  async _probe(name, cell) {
    if (this.lost) throw new Error('GPU device lost');
    const e = this.buffers.get(name);
    const comps = e.spec.components;
    const N = this.lattice.cellCount;
    if (!this.probeBuffer) {
      this.probeBuffer = this.device.createBuffer({
        label: 'probe', size: 64,       // 16 components is more than any field here
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
    }
    const enc = this.device.createCommandEncoder({ label: 'probe' });
    for (let c = 0; c < comps; c++) {
      enc.copyBufferToBuffer(e.a, (c * N + cell) * 4, this.probeBuffer, c * 4, 4);
    }
    this.device.queue.submit([enc.finish()]);
    await this.probeBuffer.mapAsync(GPUMapMode.READ, 0, comps * 4);
    const v = Array.from(new Float32Array(this.probeBuffer.getMappedRange(0, comps * 4)));
    this.probeBuffer.unmap();
    return v;
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
    if (this.probeBuffer) this.probeBuffer.destroy();
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

  /**
   * NEVER DESTROY A BUFFER THAT IS BEING MAPPED.
   *
   * A readback is asynchronous, so pressing Reset while the run loop is going
   * tears down the staging buffer with a `mapAsync` still in flight. That
   * rejects with "Buffer was destroyed before mapping was resolved" -- and
   * nobody is awaiting it any more, so it surfaces as an UNHANDLED REJECTION.
   * On this page that is a red error badge on every Reset while running,
   * reproducible every time.
   *
   * It was invisible to the suite because neither Playwright's `pageerror` nor
   * the console listener reports unhandled rejections; only the page's own debug
   * console caught it, and only in a screenshot. A regression now asserts the
   * page's error buffer is empty after exactly this sequence.
   *
   * The fix is to wait for the readback to settle rather than to swallow the
   * error: a suppressed rejection would leave a real teardown bug looking
   * identical to a benign race.
   */
  /**
   * Returns a promise that settles once the buffers are really gone. Callers
   * that are about to allocate a REPLACEMENT simulation should await it: a
   * deferred teardown means the old lattice and the new one are resident at the
   * same time, and at high resolution on a phone that is the difference between
   * fitting and failing to build.
   */
  destroy() {
    if (this._destroyed) return Promise.resolve();
    const inFlight = [this._reducing, this._snapping, this._probing].filter(Boolean);
    if (inFlight.length) {
      if (this._destroying) return this._destroying;
      this._destroying = Promise.allSettled(inFlight).then(() => {
        this._destroying = null;
        return this.destroy();
      });
      return this._destroying;
    }
    for (const e of this.buffers.values()) { e.a.destroy(); if (e.b) e.b.destroy(); }
    this.flagBuffer.destroy();
    this.partialBuffer.destroy();
    if (this.macroPrev) this.macroPrev.destroy();
    this.readbackBuffer.destroy();
    if (this.snapshotBuffer) this.snapshotBuffer.destroy();
    this.buffers.clear();
    this._destroyed = true;
    return Promise.resolve();
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
      label: 'lbm.params', size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.paramData = new Float32Array(32);
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
    // Slots 2 and 3 fill WGSL's alignment gap ahead of the first vec3, so TRT
    // and the sub-grid model ride along in the existing 80 bytes.
    const policy = this.op.params.trtPolicy || 'magic';
    const isTRT = this.op.params.collision === 'trt';
    d[2] = isTRT ? omegaMinusFor(tau, policy) : 1 / tau;
    d[3] = (this.op.params.smagorinsky || 0) ** 2;
    // Positive Lambda tells the sub-grid branch to hold it as tau moves; zero
    // says omega- is pinned and must not be recomputed.
    d[20] = isTRT && policy === 'magic' ? MAGIC : 0;
    const wv = this.op.wallVelocity ? this.op.wallVelocity() : inletVelocity;
    d[24] = wv[0]; d[25] = wv[1]; d[26] = wv[2];
    // OFFSETS COMPUTED, NOT GUESSED. A vec3<f32> is size 12 align 16, so an f32
    // placed after one lands at 108, NOT 112 -- guessing 112 put outletAnchor and
    // initVel in the wrong slots, and the CPU/GPU parity check caught it as a
    // 130% velocity disagreement. This is the third time this file has been bitten
    // by WGSL vec3 packing; the layout is now written out in wgsl.js beside the
    // struct so the two cannot drift.
    d[27] = this.op.params.outletAnchor;
    const iv = this.op.params.initialVelocity || [0, 0, 0];
    d[28] = iv[0]; d[29] = iv[1]; d[30] = iv[2];
    d[4] = force[0]; d[5] = force[1]; d[6] = force[2];
    d[8] = inletVelocity[0]; d[9] = inletVelocity[1]; d[10] = inletVelocity[2];
    const im = this.op.params.impulse || { radius: 0, force: [0, 0, 0], centre: [0, 0, 0] };
    d[12] = im.force[0]; d[13] = im.force[1]; d[14] = im.force[2];
    d[16] = im.centre[0]; d[17] = im.centre[1]; d[18] = im.centre[2];
    d[19] = im.radius;
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
    // An impulse is a uniform, so it costs one small write while it is live and
    // nothing once it has expired. Upload BEFORE dispatching and count down
    // AFTER, so the step that consumes a countdown is the step that feels it.
    const im = this.op.params.impulse;
    // An oscillating wall changes every step, so its uniform has to be rewritten
    // every step -- the same small write the impulse already pays for.
    const osc = !!this.op.params.wallFrequency;
    const live = !!(im && (im.radius > 0 || this._hadImpulse));
    if (live || osc) { this.uploadParams(); this._hadImpulse = !!(im && im.radius > 0); }
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
    if (this.op.tickImpulse) this.op.tickImpulse();
  }

  destroy() { this.params.destroy(); }
}
