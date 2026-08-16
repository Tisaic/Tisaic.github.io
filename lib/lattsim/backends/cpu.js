// CPU reference backend.
//
// WHY THIS EXISTS, stated plainly because it looks like a contradiction of the
// engine's own GPU-first rule: the production solver is WGSL compute, and the
// per-cell physics does NOT belong in JavaScript. But a solver that only runs on
// hardware the test environment does not have is a solver that ships unverified,
// and this project's rule is that nothing ships unverified. The headless
// Chromium used by test/run.sh reaches WebGPU only behind --enable-unsafe-webgpu,
// only on a secure origin, and only as a SwiftShader software adapter -- enough
// to prove a kernel correct, far too slow to run anything at size, and not
// available in plain Node at all.
//
// So this backend is the REFERENCE, not the workhorse:
//
//   * it implements exactly the same equations, from the same constants in
//     d3q19.js, as backends/wgsl.js;
//   * it runs in plain Node, so conservation and the Poiseuille profile are
//     checked against their analytic answers on every test run;
//   * it is the fallback the page uses when WebGPU is absent, capped at a
//     small lattice and labelled as such in the UI;
//   * when a GPU IS present, the two are run side by side and compared, which
//     is what stops them drifting apart.
//
// It is deliberately written to be readable rather than fast. If you want
// speed, use the GPU -- that is the entire point of the other backend.

import { Q, C, W, OPP, CS2, INV_CS2, INV_2CS4 } from '../d3q19.js';
import { CELL } from '../materials.js';
import { KernelRegistry } from '../operator.js';

export const CPU_MAX_CELLS = 1 << 17;   // 131072 = 50^3-ish; above this, say so

export class CPUBackend {
  static isAvailable() { return true; }

  /**
   * @param {object} o
   * @param {string} [o.precision] 'f32' mirrors the GPU exactly (the default,
   *   because parity with the shipping backend is the point). 'f64' stores the
   *   same fields as doubles, which is not a physics change -- it is an
   *   INSTRUMENT. A conservation residual that shrinks by seven orders of
   *   magnitude when the storage widens was arithmetic; one that does not was
   *   a bug. The tests run both and assert exactly that.
   */
  constructor({ lattice, fields, flags, precision = 'f32' }) {
    if (lattice.cellCount > CPU_MAX_CELLS) {
      throw new Error(`CPU reference backend is capped at ${CPU_MAX_CELLS} cells `
        + `(asked for ${lattice.cellCount}); this backend exists to verify the physics, not to run it`);
    }
    if (precision !== 'f32' && precision !== 'f64') throw new Error('precision must be f32 or f64');
    this.kind = 'cpu';
    this.precision = precision;
    this.label = `CPU reference (${precision})`;
    this.lattice = lattice;
    this.fields = fields;
    this.flags = flags;
    this.buffers = new Map();          // name -> { a, b, spec }
    this.kernels = new KernelRegistry().register('lbm.d3q19', (ctx, op) => new CPULBM(ctx, op));

    const Float = precision === 'f64' ? Float64Array : Float32Array;
    for (const spec of fields.list()) {
      const n = spec.components * lattice.cellCount;
      const Arr = spec.dtype === 'u32' ? Uint32Array : Float;
      this.buffers.set(spec.name, {
        spec,
        a: new Arr(n),
        b: spec.doubleBuffered ? new Arr(n) : null,
      });
    }
  }

  /** Current read buffer for a field. */
  read(name) { return this.buffers.get(name).a; }
  /** Current write buffer; equals read() for single-buffered fields. */
  write(name) { const e = this.buffers.get(name); return e.b || e.a; }
  /** Swap the ping-pong pair after a step that wrote into `b`. */
  swap(name) { const e = this.buffers.get(name); if (e.b) { const t = e.a; e.a = e.b; e.b = t; } }

  /** Host-visible copy. On this backend it is the buffer itself -- no transfer. */
  async snapshot(name) { return this.read(name); }

  destroy() { this.buffers.clear(); }
}

/**
 * D3Q19 BGK collide + PULL stream, fused into one pass.
 *
 * Pull rather than push: each cell gathers f_q from the neighbour it came
 * from, at x - c_q. Pull is the right choice here because the write pattern is
 * then purely local (one cell writes only its own slot), which is what makes
 * the GPU version race-free without atomics -- and the reference must mirror
 * the GPU's data flow, not just its algebra, or the parity test is meaningless.
 *
 * Halfway bounce-back is FUSED into the same gather: if the neighbour we would
 * pull from is solid, we instead take the opposite population from this cell.
 * That places the wall halfway between the last fluid node and the first solid
 * node, which is exactly the offset the Poiseuille test has to account for.
 */
class CPULBM {
  constructor(ctx, op) {
    this.ctx = ctx;
    this.op = op;
    this.name = op.name;
  }

  initialize() {
    const { lattice, backend } = this.ctx;
    const entry = backend.buffers.get(this.op.distribution);
    const f = entry.a;                       // fill the READ buffer directly
    const macro = backend.write(this.op.macro);
    const N = lattice.cellCount;
    const u0 = this.op.params.inletVelocity;
    for (let i = 0; i < N; i++) {
      const type = backend.flags[i];
      // Start at rest everywhere except the driven cells, which start at the
      // velocity they will be held at -- otherwise the first steps launch a
      // pressure wave off the inlet that takes a while to leave the domain.
      const ux = type === CELL.INLET ? u0[0] : 0;
      const uy = type === CELL.INLET ? u0[1] : 0;
      const uz = type === CELL.INLET ? u0[2] : 0;
      const uu = ux * ux + uy * uy + uz * uz;
      for (let q = 0; q < Q; q++) {
        const cu = C[q][0] * ux + C[q][1] * uy + C[q][2] * uz;
        f[q * N + i] = W[q] * (1 + INV_CS2 * cu + INV_2CS4 * cu * cu - 1.5 * uu);
      }
      macro[0 * N + i] = 1; macro[1 * N + i] = ux; macro[2 * N + i] = uy; macro[3 * N + i] = uz;
    }
    // Both halves of the ping-pong start identical, so a diagnostic taken
    // before the first step reads real state rather than zeros.
    if (entry.b) entry.b.set(f);
  }

  step() {
    const { lattice, backend } = this.ctx;
    const { nx, ny, nz } = lattice;
    const N = lattice.cellCount;
    const src = backend.read(this.op.distribution);
    const dst = backend.write(this.op.distribution);
    const macro = backend.write(this.op.macro);
    const flags = backend.flags;
    const { tau, force, inletVelocity } = this.op.params;
    const uw = inletVelocity;                     // moving-wall velocity, same parameter
    const im = this.op.tickImpulse ? this.op.tickImpulse() : { radius: 0 };
    const imR2 = im.radius * im.radius;
    const omega = 1 / tau;
    const fPre = 1 - 0.5 * omega;                 // Guo prefactor (1 - 1/(2 tau))
    const [gfx, gfy, gfz] = force;
    const anyImpulse = im.radius > 0;
    const per = lattice.topology.map((t) => t === 'periodic');

    const fi = new Float64Array(Q);

    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const i = x + nx * (y + ny * z);
          const type = flags[i];

          if (type === CELL.SOLID || type === CELL.MOVING) {
            // Solid cells hold no fluid. They are written so the buffer never
            // carries stale data from a previous geometry, and so a renderer
            // reading the macro field sees a defined value.
            for (let q = 0; q < Q; q++) dst[q * N + i] = 0;
            macro[0 * N + i] = 1; macro[1 * N + i] = 0; macro[2 * N + i] = 0; macro[3 * N + i] = 0;
            continue;
          }

          // ---- gather (pull stream) with fused halfway bounce-back
          for (let q = 0; q < Q; q++) {
            const c = C[q];
            let sx = x - c[0], sy = y - c[1], sz = z - c[2];
            let outside = false;
            if (per[0]) sx = (sx + nx) % nx; else if (sx < 0 || sx >= nx) outside = true;
            if (per[1]) sy = (sy + ny) % ny; else if (sy < 0 || sy >= ny) outside = true;
            if (per[2]) sz = (sz + nz) % nz; else if (sz < 0 || sz >= nz) outside = true;
            if (outside) { fi[q] = src[OPP[q] * N + i]; continue; }   // domain edge: bounce back
            const si = sx + nx * (sy + ny * sz);
            const nt = flags[si];
            if (nt === CELL.SOLID) {
              fi[q] = src[OPP[q] * N + i];
            } else if (nt === CELL.MOVING) {
              // Halfway bounce-back off a wall that is MOVING. The wall injects
              // momentum without injecting mass:
              //   f_q = f_qbar + 2 w_q rho_w (c_q . u_wall) / cs^2
              // Modelling a moving wall as a driven FLUID cell instead (which is
              // what this did first) drives the flow but also lets the wall act
              // as a mass source, which showed up as a density spread the
              // stability verdict called marginal in a closed box that cannot
              // have one.
              const c2 = C[q];
              const cu = c2[0] * uw[0] + c2[1] * uw[1] + c2[2] * uw[2];
              fi[q] = src[OPP[q] * N + i] + 2 * W[q] * INV_CS2 * cu;
            } else {
              fi[q] = src[q * N + si];
            }
          }

          // Body force at THIS cell: the global one plus any local impulse the
          // user has poked in. Momentum enters the momentum field and is then
          // transported by the same operator as everything else.
          let fx = gfx, fy = gfy, fz = gfz;
          if (anyImpulse) {
            const dx = x - im.centre[0], dy = y - im.centre[1], dz = z - im.centre[2];
            if (dx * dx + dy * dy + dz * dz <= imR2) {
              fx += im.force[0]; fy += im.force[1]; fz += im.force[2];
            }
          }
          const forced = fx !== 0 || fy !== 0 || fz !== 0;

          // ---- macroscopic moments
          let rho = 0, mx = 0, my = 0, mz = 0;
          for (let q = 0; q < Q; q++) {
            const v = fi[q];
            rho += v;
            mx += v * C[q][0]; my += v * C[q][1]; mz += v * C[q][2];
          }
          let ux = mx / rho, uy = my / rho, uz = mz / rho;
          // Guo: half the force acts on the velocity used in the equilibrium.
          if (forced) { ux += 0.5 * fx / rho; uy += 0.5 * fy / rho; uz += 0.5 * fz / rho; }

          // INLET and OUTLET are open boundaries, finished off in a second pass
          // where the neighbouring cell's macroscopic state is available. What
          // is written here for them is provisional.
          if (type === CELL.INLET) {
            ux = inletVelocity[0]; uy = inletVelocity[1]; uz = inletVelocity[2];
          }

          // ---- collide (BGK) + Guo forcing
          const uu = ux * ux + uy * uy + uz * uz;
          for (let q = 0; q < Q; q++) {
            const c = C[q];
            const cu = c[0] * ux + c[1] * uy + c[2] * uz;
            const eq = W[q] * rho * (1 + INV_CS2 * cu + INV_2CS4 * cu * cu - 1.5 * uu);
            let v;
            if (type === CELL.INLET) {
              v = eq;                              // hard reset to equilibrium at the prescribed u
            } else {
              v = fi[q] + omega * (eq - fi[q]);
              if (forced) {
                const gx = INV_CS2 * (c[0] - ux) + 3 * INV_CS2 * cu * c[0];
                const gy = INV_CS2 * (c[1] - uy) + 3 * INV_CS2 * cu * c[1];
                const gz = INV_CS2 * (c[2] - uz) + 3 * INV_CS2 * cu * c[2];
                v += fPre * W[q] * (gx * fx + gy * fy + gz * fz);
              }
            }
            dst[q * N + i] = v;
          }

          macro[0 * N + i] = rho; macro[1 * N + i] = ux; macro[2 * N + i] = uy; macro[3 * N + i] = uz;
        }
      }
    }

    // ---- open boundaries, after the bulk so neighbour state is settled
    this.applyOpenBoundaries(dst, macro);
    backend.swap(this.op.distribution);
  }

  /**
   * INLET and OUTLET, both written as equilibrium against the neighbouring
   * fluid cell.
   *
   * THE FIRST VERSION OF THIS WAS WRONG IN A WAY THAT LOOKED FINE. The outlet
   * simply copied its upstream neighbour's populations, which imposes nothing
   * on the density -- so nothing in the whole domain anchored the pressure, and
   * over a couple of hundred steps the channel drained to a minimum density of
   * 0.32 against a rest value of 1. The flow field still looked like flow, the
   * run was not diverging, and only the density-range diagnostic showed it.
   *
   * The fix is the textbook pair:
   *   INLET  — prescribed velocity, density BORROWED from the neighbour, so the
   *            inlet does not fight the pressure field it sits in;
   *   OUTLET — prescribed density (rest), velocity borrowed from the neighbour,
   *            which is what actually anchors the pressure.
   *
   * Both are first order and mildly reflective. Stated as such rather than
   * presented as characteristic boundaries.
   */
  applyOpenBoundaries(dst, macro) {
    const { lattice, backend } = this.ctx;
    const { nx, ny } = lattice;
    const N = lattice.cellCount;
    const flags = backend.flags;
    const u0 = this.op.params.inletVelocity;

    lattice.forEachCell((x, y, z, i) => {
      const type = flags[i];
      if (type !== CELL.INLET && type !== CELL.OUTLET) return;
      // Nearest neighbour along x that is neither an inlet nor an outlet.
      let sx = -1;
      if (x > 0 && flags[i - 1] !== CELL.INLET && flags[i - 1] !== CELL.OUTLET) sx = x - 1;
      else if (x < nx - 1 && flags[i + 1] !== CELL.INLET && flags[i + 1] !== CELL.OUTLET) sx = x + 1;
      if (sx < 0) return;
      const si = sx + nx * (y + ny * z);
      if (flags[si] === CELL.SOLID) return;      // a corner: leave it to bounce-back

      let rho, ux, uy, uz;
      if (type === CELL.INLET) {
        rho = macro[si]; ux = u0[0]; uy = u0[1]; uz = u0[2];
      } else {
        rho = 1; ux = macro[N + si]; uy = macro[2 * N + si]; uz = macro[3 * N + si];
      }
      const uu = ux * ux + uy * uy + uz * uz;
      for (let q = 0; q < Q; q++) {
        const c = C[q];
        const cu = c[0] * ux + c[1] * uy + c[2] * uz;
        dst[q * N + i] = W[q] * rho * (1 + INV_CS2 * cu + INV_2CS4 * cu * cu - 1.5 * uu);
      }
      macro[i] = rho; macro[N + i] = ux; macro[2 * N + i] = uy; macro[3 * N + i] = uz;
    });
  }
}

// ------------------------------------------------------------- diagnostics

/**
 * Reductions over the macroscopic field. Cheap on this backend; the GPU
 * backend does the same reduction in a compute pass and returns the same
 * shape, so the diagnostics UI does not care which is running.
 */
export function reduceMacro(lattice, flags, macro, prev = null) {
  const N = lattice.cellCount;
  let mass = 0, px = 0, py = 0, pz = 0, ke = 0;
  let rhoMin = Infinity, rhoMax = -Infinity, uMax = 0, cells = 0;
  let sumDU = 0, sumU2 = 0;
  let finite = true;
  for (let i = 0; i < N; i++) {
    if (flags[i] === CELL.SOLID || flags[i] === CELL.MOVING) continue;
    const rho = macro[i], ux = macro[N + i], uy = macro[2 * N + i], uz = macro[3 * N + i];
    if (!Number.isFinite(rho) || !Number.isFinite(ux) || !Number.isFinite(uy) || !Number.isFinite(uz)) {
      finite = false;
      continue;
    }
    cells++;
    mass += rho;
    px += rho * ux; py += rho * uy; pz += rho * uz;
    const u2 = ux * ux + uy * uy + uz * uz;
    ke += 0.5 * rho * u2;
    if (rho < rhoMin) rhoMin = rho;
    if (rho > rhoMax) rhoMax = rho;
    if (u2 > uMax) uMax = u2;
    if (prev) {
      const dx = ux - prev[N + i], dy = uy - prev[2 * N + i], dz = uz - prev[3 * N + i];
      sumDU += dx * dx + dy * dy + dz * dz;
      sumU2 += u2;
    }
  }
  return {
    cells, mass, momentum: [px, py, pz], kineticEnergy: ke,
    rhoMin: cells ? rhoMin : 0, rhoMax: cells ? rhoMax : 0,
    uMax: Math.sqrt(uMax), finite,
    residual: sumU2 > 0 ? Math.sqrt(sumDU / sumU2) : 0,
  };
}
