// Orbit camera with touch handling, and the 4x4 maths the volume shader needs.
// No dependency on three.js -- lattsim is self-contained, so the tab can be
// removed or moved without touching anything else the app vendors.

export class OrbitCamera {
  constructor({ distance = 2.2, theta = 0.9, phi = 0.9, fov = 45 } = {}) {
    this.distance = distance;
    this.theta = theta;          // azimuth
    this.phi = phi;              // polar, clamped away from the poles
    this.fov = fov;
    this.target = [0, 0, 0];
  }

  eye() {
    const sp = Math.sin(this.phi), cp = Math.cos(this.phi);
    return [
      this.target[0] + this.distance * sp * Math.cos(this.theta),
      this.target[1] + this.distance * cp,
      this.target[2] + this.distance * sp * Math.sin(this.theta),
    ];
  }

  orbit(dx, dy) {
    this.theta += dx;
    this.phi = Math.max(0.08, Math.min(Math.PI - 0.08, this.phi + dy));
  }

  zoom(factor) { this.distance = Math.max(0.8, Math.min(8, this.distance * factor)); }

  /** Inverse view-projection, column-major, ready for the uniform buffer. */
  invViewProj(aspect) {
    const eye = this.eye();
    const view = lookAt(eye, this.target, [0, 1, 0]);
    const proj = perspective(this.fov * Math.PI / 180, aspect, 0.05, 40);
    return invert(multiply(proj, view));
  }

  /** Attach pointer/touch: one finger orbits, two fingers pinch-zoom. */
  attach(el, onChange = () => {}) {
    let last = null, pinch = 0;
    const pos = (t) => [t.clientX, t.clientY];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    const down = (e) => {
      const ts = e.touches ? [...e.touches] : [e];
      if (ts.length === 2) { pinch = dist(pos(ts[0]), pos(ts[1])); last = null; }
      else { last = pos(ts[0]); pinch = 0; }
    };
    const move = (e) => {
      const ts = e.touches ? [...e.touches] : [e];
      if (ts.length === 2) {
        const d = dist(pos(ts[0]), pos(ts[1]));
        if (pinch > 0) { this.zoom(pinch / d); onChange(); }
        pinch = d;
      } else if (last) {
        const p = pos(ts[0]);
        this.orbit((p[0] - last[0]) * 0.008, (p[1] - last[1]) * 0.008);
        last = p; onChange();
      }
      if (e.cancelable) e.preventDefault();
    };
    const up = () => { last = null; pinch = 0; };

    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up, { passive: true });
    el.addEventListener('mousedown', down);
    window.addEventListener('mousemove', (e) => { if (last) move(e); });
    window.addEventListener('mouseup', up);
    el.addEventListener('wheel', (e) => { this.zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1); onChange(); e.preventDefault(); },
      { passive: false });
    return this;
  }
}

// ---------------------------------------------------------------- 4x4 maths
// Column-major throughout, matching WGSL's mat4x4<f32> memory layout.

export function multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const o = new Float32Array(16);
  o[0] = f / aspect; o[5] = f;
  o[10] = far / (near - far); o[11] = -1;
  o[14] = far * near / (near - far);
  return o;
}

export function lookAt(eye, center, up) {
  const z = norm(sub(eye, center));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  const o = new Float32Array(16);
  o[0] = x[0]; o[1] = y[0]; o[2] = z[0];
  o[4] = x[1]; o[5] = y[1]; o[6] = z[1];
  o[8] = x[2]; o[9] = y[2]; o[10] = z[2];
  o[12] = -dot(x, eye); o[13] = -dot(y, eye); o[14] = -dot(z, eye);
  o[15] = 1;
  return o;
}

export function invert(m) {
  const o = new Float32Array(16);
  const a = m;
  const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4];
  const b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5];
  const b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12];
  const b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13];
  const b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return o;
  det = 1 / det;
  o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * det;
  o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * det;
  o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * det;
  o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * det;
  o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * det;
  o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * det;
  o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * det;
  o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * det;
  o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * det;
  o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * det;
  o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * det;
  o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * det;
  o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * det;
  o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * det;
  o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * det;
  o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * det;
  return o;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
