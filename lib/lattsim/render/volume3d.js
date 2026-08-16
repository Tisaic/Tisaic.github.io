// WebGPU volume renderer — raymarched, reading the simulation's own buffers.
//
// It samples the macro storage buffer directly in the fragment shader rather
// than copying into a 3D texture. That keeps the rule the architecture is built
// on: simulation state stays on the GPU and the renderer consumes it in place.
// The cost is manual trilinear interpolation instead of a hardware sampler,
// which is a few lines and no transfers.
//
// The renderer knows nothing about LBM. It is given a lattice, a macro buffer
// and a flags buffer, and told which scalar to show.

export const VOLUME_MODE = Object.freeze({ SPEED: 0, DENSITY: 1, VORTICITY: 2 });

const SHADER = (lattice) => `
const NX : i32 = ${lattice.nx};
const NY : i32 = ${lattice.ny};
const NZ : i32 = ${lattice.nz};
const NCELL : u32 = ${lattice.cellCount}u;

struct View {
  invViewProj : mat4x4<f32>,
  eye         : vec4<f32>,
  params      : vec4<f32>,   // mode, scale, opacity, steps
};

@group(0) @binding(0) var<storage, read> macroF : array<f32>;
@group(0) @binding(1) var<storage, read> flags  : array<u32>;
@group(0) @binding(2) var<uniform>       view   : View;

struct VSOut { @builtin(position) pos : vec4<f32>, @location(0) ndc : vec2<f32> };

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  // One oversized triangle -- no vertex buffer, no index buffer.
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o : VSOut;
  o.pos = vec4<f32>(p[vi], 0.0, 1.0);
  o.ndc = p[vi];
  return o;
}

fn cellIndex(p : vec3<i32>) -> u32 { return u32(p.x + NX * (p.y + NY * p.z)); }

fn sampleAt(p : vec3<i32>) -> f32 {
  let c = clamp(p, vec3<i32>(0), vec3<i32>(NX - 1, NY - 1, NZ - 1));
  let i = cellIndex(c);
  if (flags[i] == 1u) { return -1.0; }                 // solid: flagged, not zero
  let mode = i32(view.params.x);
  if (mode == 1) { return (macroF[i] - 1.0) * 20.0; }  // density, centred on rest
  let u = vec3<f32>(macroF[NCELL + i], macroF[2u * NCELL + i], macroF[3u * NCELL + i]);
  return length(u);
}

// Trilinear, in lattice coordinates. Hand-rolled because the field is a storage
// buffer rather than a texture -- the trade the comment at the top describes.
fn sampleLerp(q : vec3<f32>) -> f32 {
  let b = floor(q);
  let f = q - b;
  let i = vec3<i32>(b);
  var acc = 0.0;
  var solid = false;
  for (var dz = 0; dz < 2; dz = dz + 1) {
    for (var dy = 0; dy < 2; dy = dy + 1) {
      for (var dx = 0; dx < 2; dx = dx + 1) {
        let s = sampleAt(i + vec3<i32>(dx, dy, dz));
        if (s < 0.0) { solid = true; }
        let w = mix(1.0 - f.x, f.x, f32(dx)) * mix(1.0 - f.y, f.y, f32(dy)) * mix(1.0 - f.z, f.z, f32(dz));
        acc = acc + max(s, 0.0) * w;
      }
    }
  }
  if (solid) { return -1.0; }
  return acc;
}

fn ramp(t : f32) -> vec3<f32> {
  let x = clamp(t, 0.0, 1.0);
  return vec3<f32>(
    clamp(-0.15 + 2.2 * x * x - 0.6 * x, 0.0, 1.0),
    clamp(0.02 + 1.15 * x - 0.25 * x * x, 0.0, 1.0),
    clamp(0.33 + 1.5 * x - 1.9 * x * x + 0.3 * x * x * x, 0.0, 1.0));
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  // Unproject two points to build the ray.
  let near = view.invViewProj * vec4<f32>(in.ndc, 0.0, 1.0);
  let far  = view.invViewProj * vec4<f32>(in.ndc, 1.0, 1.0);
  let o = near.xyz / near.w;
  let d = normalize(far.xyz / far.w - o);

  // Slab test against the unit box the lattice is mapped into.
  let lo = vec3<f32>(-0.5);
  let hi = vec3<f32>(0.5);
  let t0 = (lo - o) / d;
  let t1 = (hi - o) / d;
  let tn = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tf = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  if (tf <= max(tn, 0.0)) { return vec4<f32>(0.04, 0.06, 0.10, 1.0); }

  let steps = i32(view.params.w);
  let dt = (tf - max(tn, 0.0)) / f32(steps);
  var t = max(tn, 0.0) + dt * 0.5;
  let dims = vec3<f32>(f32(NX), f32(NY), f32(NZ));
  let scale = view.params.y;
  let opacity = view.params.z;

  var col = vec3<f32>(0.0);
  var alpha = 0.0;
  for (var s = 0; s < steps; s = s + 1) {
    let wp = o + d * t;
    let q = (wp + 0.5) * (dims - 1.0);
    let v = sampleLerp(q);
    if (v < 0.0) {
      // Solid: opaque, shaded flat so geometry reads clearly against the field.
      col = col + (1.0 - alpha) * vec3<f32>(0.35, 0.38, 0.45);
      alpha = 1.0;
      break;
    }
    let nv = clamp(v / max(scale, 1e-9), 0.0, 1.0);
    let a = nv * nv * opacity;
    col = col + (1.0 - alpha) * a * ramp(nv);
    alpha = alpha + (1.0 - alpha) * a;
    if (alpha > 0.99) { break; }
    t = t + dt;
  }
  let bg = vec3<f32>(0.04, 0.06, 0.10);
  return vec4<f32>(col + (1.0 - alpha) * bg, 1.0);
}
`;

export class VolumeRenderer {
  constructor(canvas, sim, { macroField = 'macro' } = {}) {
    const backend = sim.backend;
    if (backend.kind !== 'webgpu') throw new Error('VolumeRenderer needs the WebGPU backend');
    this.sim = sim;
    this.canvas = canvas;
    this.device = backend.device;
    this.backend = backend;
    this.macroField = macroField;
    this.mode = VOLUME_MODE.SPEED;
    this.scale = 0.05;
    this.opacity = 0.35;
    this.steps = 96;

    this.context = canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });

    const module = this.device.createShaderModule({ label: 'volume', code: SHADER(sim.lattice) });
    this.pipeline = this.device.createRenderPipeline({
      label: 'volume', layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.uniform = this.device.createBuffer({
      size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.uniformData = new Float32Array(24);
  }

  resize(w, h) {
    const dpr = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    const W = Math.max(1, Math.floor(w * dpr)), H = Math.max(1, Math.floor(h * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    return [W, H];
  }

  /** @param {Float32Array} invViewProj column-major 4x4 */
  render(invViewProj, eye) {
    const d = this.uniformData;
    d.set(invViewProj, 0);
    d[16] = eye[0]; d[17] = eye[1]; d[18] = eye[2]; d[19] = 1;
    d[20] = this.mode; d[21] = this.scale; d[22] = this.opacity; d[23] = this.steps;
    this.device.queue.writeBuffer(this.uniform, 0, d);

    const enc = this.device.createCommandEncoder({ label: 'volume' });
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.04, g: 0.06, b: 0.10, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.backend.read(this.macroField) } },
        { binding: 1, resource: { buffer: this.backend.flagBuffer } },
        { binding: 2, resource: { buffer: this.uniform } },
      ],
    }));
    pass.draw(3);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  destroy() { this.uniform.destroy(); }
}
