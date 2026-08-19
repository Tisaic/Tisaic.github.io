// 2D slice renderer — a plane through the lattice, drawn with canvas 2D.
//
// It exists for three reasons, and only the first is about pictures:
//
//   1. It is the ONLY view that works on every backend, so the page shows real
//      simulation output even where WebGPU is absent -- which includes the
//      headless browser the smoke test runs in, so the screenshots reviewed
//      before every push are of actual physics rather than an error message.
//   2. A slice is quantitative in a way a volume rendering is not: you can read
//      a profile off it and compare it to an analytic answer.
//   3. It is the honest fallback. A raymarched volume that silently shows
//      nothing is worse than a flat picture that shows something true.
//
// It costs one field readback per refresh, which is a deliberate exception to
// the no-per-frame-transfer rule -- so it is THROTTLED, and it says so.

export const SLICE_MODE = Object.freeze({
  DENSITY: 'density',
  SPEED: 'speed',
  DIRECTION: 'direction',
  MATERIAL: 'material',
  CONCENTRATION: 'concentration',   // a passive scalar field, if a scene carries one
});

const CELL_COLOR = {
  1: [90, 100, 120],     // SOLID
  2: [80, 200, 120],     // INLET
  3: [200, 140, 80],     // OUTLET
  4: [160, 120, 220],    // MOVING
};

export class SliceRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} o
   * @param {number} [o.minInterval] ms between readbacks (throttle)
   */
  constructor(canvas, { minInterval = 60 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minInterval = minInterval;
    this.lastDraw = 0;
    this.busy = false;
    this.axis = 2;            // slice normal: 0=x, 1=y, 2=z
    this.position = 0.5;      // fractional position along that axis
    this.mode = SLICE_MODE.SPEED;
    this.autoScale = true;
    this.scale = 0.05;        // fixed range when autoScale is off
    this.lastStats = null;
    this._img = null;
  }

  /** Plane dimensions for the current axis. */
  planeSize(lattice) {
    const [nx, ny, nz] = lattice.size;
    return this.axis === 0 ? [ny, nz] : this.axis === 1 ? [nx, nz] : [nx, ny];
  }

  cellAt(lattice, a, b, k) {
    if (this.axis === 0) return lattice.index(k, a, b);
    if (this.axis === 1) return lattice.index(a, k, b);
    return lattice.index(a, b, k);
  }

  /**
   * Pull the macro field and draw. Returns false if throttled or already busy,
   * so the caller can tell a skipped frame from a drawn one.
   */
  async draw(sim, now = (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
    if (this.busy || now - this.lastDraw < this.minInterval) return false;
    this.busy = true;
    try {
      const { lattice, flags } = sim;
      const N = lattice.cellCount;
      const macro = await sim.backend.snapshot('macro');
      // The concentration field only exists when a scalar operator is in the
      // scene; asked for otherwise, this mode falls back to speed rather than
      // throwing on a field that was never declared.
      const wantConc = this.mode === SLICE_MODE.CONCENTRATION && sim.backend.buffers.has('conc');
      const conc = wantConc ? await sim.backend.snapshot('conc') : null;
      const [W, H] = this.planeSize(lattice);
      const k = Math.min(lattice.size[this.axis] - 1,
        Math.max(0, Math.round(this.position * (lattice.size[this.axis] - 1))));

      if (this.canvas.width !== W || this.canvas.height !== H) {
        this.canvas.width = W; this.canvas.height = H; this._img = null;
      }
      if (!this._img) this._img = this.ctx.createImageData(W, H);
      const px = this._img.data;

      // Scale from the slice itself so the picture is readable at any speed --
      // and report the scale, because an auto-scaled image with no number on it
      // is a picture, not a measurement.
      let peak = 0, rhoLo = Infinity, rhoHi = -Infinity, cLo = Infinity, cHi = -Infinity;
      for (let b = 0; b < H; b++) {
        for (let a = 0; a < W; a++) {
          const i = this.cellAt(lattice, a, b, k);
          if (flags[i] === 1) continue;
          const rho = macro[i];
          const ux = macro[N + i], uy = macro[2 * N + i], uz = macro[3 * N + i];
          const s = Math.hypot(ux, uy, uz);
          if (s > peak) peak = s;
          if (rho < rhoLo) rhoLo = rho;
          if (rho > rhoHi) rhoHi = rho;
          if (wantConc) { const cc = conc[i]; if (cc < cLo) cLo = cc; if (cc > cHi) cHi = cc; }
        }
      }
      const uScale = this.autoScale ? Math.max(peak, 1e-9) : this.scale;
      const rSpan = Math.max(rhoHi - rhoLo, 1e-6);
      // Auto-scale the scalar from the slice's own range so a faint plume is
      // visible; a fixed [0,1] would render a 2%-concentration wake as near-black.
      const cSpan = Math.max(cHi - cLo, 1e-6);

      for (let b = 0; b < H; b++) {
        for (let a = 0; a < W; a++) {
          const i = this.cellAt(lattice, a, b, k);
          const o = 4 * ((H - 1 - b) * W + a);          // flip so +axis is up
          const type = flags[i];
          let r, g, bl;
          if (type !== 0 && (this.mode === SLICE_MODE.MATERIAL || type === 1)) {
            const c = CELL_COLOR[type] || [60, 70, 90];
            [r, g, bl] = c;
          } else if (this.mode === SLICE_MODE.DENSITY) {
            [r, g, bl] = diverging((macro[i] - rhoLo) / rSpan);
          } else if (this.mode === SLICE_MODE.DIRECTION) {
            const ux = macro[N + i], uy = macro[2 * N + i], uz = macro[3 * N + i];
            const s = Math.hypot(ux, uy, uz) || 1e-30;
            // Direction as colour, brightness as speed: a flow field you can
            // read the recirculation out of.
            const f = Math.min(1, s / uScale);
            r = Math.round(127 + 128 * (ux / s) * f);
            g = Math.round(127 + 128 * (uy / s) * f);
            bl = Math.round(127 + 128 * (uz / s) * f);
          } else if (this.mode === SLICE_MODE.MATERIAL) {
            [r, g, bl] = [24, 32, 48];
          } else if (wantConc) {
            [r, g, bl] = viridis((conc[i] - cLo) / cSpan);
          } else {
            [r, g, bl] = viridis(Math.min(1, Math.hypot(macro[N + i], macro[2 * N + i], macro[3 * N + i]) / uScale));
          }
          px[o] = r; px[o + 1] = g; px[o + 2] = bl; px[o + 3] = 255;
        }
      }
      this.ctx.putImageData(this._img, 0, 0);
      this.lastStats = { peak, rhoLo, rhoHi, uScale, k, axis: this.axis, width: W, height: H,
        concLo: wantConc ? cLo : null, concHi: wantConc ? cHi : null };
      this.lastDraw = now;
      return true;
    } finally {
      this.busy = false;
    }
  }

  /** Velocity profile along the slice normal, for reading a number off the picture. */
  async profile(sim, component = 0) {
    const { lattice } = sim;
    const N = lattice.cellCount;
    const macro = await sim.backend.snapshot('macro');
    const n = lattice.size[this.axis];
    const [W, H] = this.planeSize(lattice);
    const a = W >> 1, b = H >> 1;
    const out = [];
    for (let k = 0; k < n; k++) {
      const i = this.cellAt(lattice, a, b, k);
      out.push(macro[(1 + component) * N + i]);
    }
    return out;
  }
}

// Perceptually reasonable ramps, inlined so nothing is fetched.
function viridis(t) {
  t = Math.max(0, Math.min(1, t));
  const r = Math.round(255 * Math.max(0, Math.min(1, -0.15 + 2.2 * t * t - 0.6 * t)));
  const g = Math.round(255 * Math.max(0, Math.min(1, 0.02 + 1.15 * t - 0.25 * t * t)));
  const b = Math.round(255 * Math.max(0, Math.min(1, 0.33 + 1.5 * t - 1.9 * t * t + 0.3 * t * t * t)));
  return [r, g, b];
}

function diverging(t) {
  t = Math.max(0, Math.min(1, t));
  const s = 2 * t - 1;
  if (s < 0) return [Math.round(40 + 60 * (1 + s)), Math.round(90 + 100 * (1 + s)), Math.round(200 + 40 * (1 + s))];
  return [Math.round(230 - 20 * s), Math.round(190 - 120 * s), Math.round(100 - 60 * s)];
}
