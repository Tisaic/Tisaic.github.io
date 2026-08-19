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

import { Q, C, W, OPP, CS2, INV_CS2, INV_2CS4, psiExcess, gradWeight } from '../d3q19.js';
import { omegaMinusFor, LIMITS } from '../operators/lbm.js';
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
    this.kernels = new KernelRegistry()
      .register('lbm.d3q19', (ctx, op) => new CPULBM(ctx, op))
      .register('scalar.d3q19', (ctx, op) => new CPUScalar(ctx, op));

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

  /**
   * The components of one cell. Trivial here; the point of it existing as a
   * backend method is that the GPU can answer it with a 16-byte copy instead of
   * pulling the whole field back, which is what a probe sampled every frame
   * would otherwise cost.
   */
  async probe(name, cell) {
    const a = this.read(name);
    const spec = this.buffers.get(name).spec;
    const N = this.lattice.cellCount;
    const out = new Array(spec.components);
    for (let c = 0; c < spec.components; c++) out[c] = a[c * N + cell];
    return out;
  }

  /** Many cells at once; the same shape the GPU backend returns, so callers agree. */
  async probeMany(name, cells) {
    const a = this.read(name);
    const spec = this.buffers.get(name).spec;
    const N = this.lattice.cellCount;
    const comps = spec.components;
    const out = new Array(cells.length);
    for (let j = 0; j < cells.length; j++) {
      const v = new Array(comps);
      for (let c = 0; c < comps; c++) v[c] = a[c * N + cells[j]];
      out[j] = v;
    }
    return out;
  }

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
    const iv = this.op.params.initialVelocity;
    for (let i = 0; i < N; i++) {
      const type = backend.flags[i];
      // START THE FLUID ALREADY MOVING where the scene asks for it. From rest,
      // the inlet has to fill the channel, and that leading-edge front crosses
      // the lattice, reaches the outlet and rings there -- a transient that has
      // nothing to do with the flow being studied. Beginning at the inlet
      // velocity means there is no front to cross.
      const fluid = type !== CELL.SOLID && type !== CELL.MOVING;
      const src = type === CELL.INLET ? u0 : (fluid && iv ? iv : ZERO3);
      const ux = src[0], uy = src[1], uz = src[2];
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
    const { tau, force, eos, soundSpeed, eosParam } = this.op.params;
    // EQUATION-OF-STATE PRESSURE FORCE (see LBMFluidOperator). Precompute the
    // excess-pressure field psi = p(rho) - rho*cs^2 once from the read buffer
    // (which is the whole previous step, so the gradient below is consistent),
    // then the collide loop adds F = -grad(psi) via the Guo term. 'ideal' skips
    // it entirely and the run is unchanged.
    const eosActive = eos && eos !== 'ideal';
    const csEff2 = soundSpeed != null ? soundSpeed * soundSpeed : CS2;
    const eosA = eosParam || 0;
    let psiField = null;
    if (eosActive) {
      psiField = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        if (flags[i] === CELL.SOLID) { psiField[i] = 0; continue; }
        let rho = 0; for (let q = 0; q < Q; q++) rho += src[q * N + i];
        psiField[i] = psiExcess(eos, rho, csEff2, eosA);
      }
    }
    // Precompute the isotropic gradient weights once (one [gx,gy,gz] per q).
    const GW = eosActive ? C.map((_, q) => gradWeight(q)) : null;
    // The per-step inlet, read ONCE for the whole sweep so every cell in a step
    // sees the same boundary value.
    const inletVelocity = this.op.inletVelocityNow
      ? this.op.inletVelocityNow() : this.op.params.inletVelocity;
    const trt = this.op.params.collision === 'trt';
    const cs = this.op.params.smagorinsky || 0;
    const les = cs > 0;
    const csSqr = cs * cs;
    // Read the wall velocity BEFORE ticking: the tick advances the step index
    // the oscillation phase is computed from, and both backends must sample the
    // same phase on the same step.
    const uw = this.op.wallVelocity ? this.op.wallVelocity() : inletVelocity;
    const im = this.op.tickImpulse ? this.op.tickImpulse() : { radius: 0 };
    const imR2 = im.radius * im.radius;
    const omega = 1 / tau;
    // omega- holds Lambda = 3/16 (see operators/lbm.js). Under BGK it is simply
    // omega, which makes the TRT path reduce EXACTLY to BGK -- that identity is
    // asserted in the tests, because a "two-relaxation" operator that quietly
    // differs from BGK at Lambda-equivalent settings would be a silent physics
    // change rather than a stability fix.
    const policy = this.op.params.trtPolicy || 'magic';
    const omegaM = trt ? omegaMinusFor(tau, policy) : omega;
    const fPre = 1 - 0.5 * omega;                 // Guo prefactor (1 - 1/(2 tau))
    const fPreM = 1 - 0.5 * omegaM;
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
          // EOS force: F = -grad(psi), isotropic stencil over the neighbours.
          // A SOLID or off-domain neighbour contributes the cell's own psi (a
          // no-flux wall), so the fluid feels no spurious pressure force pushing
          // into a wall.
          if (eosActive) {
            const psiSelf = psiField[i];
            let px = 0, py = 0, pz = 0;
            for (let q = 1; q < Q; q++) {
              const cq = C[q];
              let tx = x + cq[0], ty = y + cq[1], tz = z + cq[2];
              let out = false;
              if (per[0]) tx = (tx + nx) % nx; else if (tx < 0 || tx >= nx) out = true;
              if (per[1]) ty = (ty + ny) % ny; else if (ty < 0 || ty >= ny) out = true;
              if (per[2]) tz = (tz + nz) % nz; else if (tz < 0 || tz >= nz) out = true;
              let psiN;
              if (out) psiN = psiSelf;
              else { const ti = tx + nx * (ty + ny * tz);
                psiN = flags[ti] === CELL.SOLID ? psiSelf : psiField[ti]; }
              const gw = GW[q];
              px += gw[0] * psiN; py += gw[1] * psiN; pz += gw[2] * psiN;
            }
            fx -= px; fy -= py; fz -= pz;
          }
          const forced = fx !== 0 || fy !== 0 || fz !== 0;

          // ---- macroscopic moments
          let rho = 0, mx = 0, my = 0, mz = 0;
          for (let q = 0; q < Q; q++) {
            const v = fi[q];
            rho += v;
            mx += v * C[q][0]; my += v * C[q][1]; mz += v * C[q][2];
          }
          // ---- LIMITER (see LIMITS in operators/lbm.js). Break the chain that
          // turns a fast cell into a lattice-wide NaN: no zero density to divide
          // by, no unbounded velocity to feed the equilibrium.
          if (!(rho > LIMITS.rhoMin)) rho = LIMITS.rhoMin;
          else if (!(rho < LIMITS.rhoMax)) rho = LIMITS.rhoMax;   // also catches NaN
          let ux = mx / rho, uy = my / rho, uz = mz / rho;
          // Guo: half the force acts on the velocity used in the equilibrium.
          if (forced) { ux += 0.5 * fx / rho; uy += 0.5 * fy / rho; uz += 0.5 * fz / rho; }
          if (!Number.isFinite(ux)) ux = 0;
          if (!Number.isFinite(uy)) uy = 0;
          if (!Number.isFinite(uz)) uz = 0;
          const usq = ux * ux + uy * uy + uz * uz;
          if (usq > LIMITS.uMax * LIMITS.uMax) {
            const k = LIMITS.uMax / Math.sqrt(usq);
            ux *= k; uy *= k; uz *= k;
          }

          // INLET and OUTLET are open boundaries, finished off in a second pass
          // where the neighbouring cell's macroscopic state is available. What
          // is written here for them is provisional.
          if (type === CELL.INLET) {
            ux = inletVelocity[0]; uy = inletVelocity[1]; uz = inletVelocity[2];
          }

          // ---- collide + Guo forcing
          const uu = ux * ux + uy * uy + uz * uz;

          // SUB-GRID MODEL. tau becomes a FIELD: the local strain rate sets an
          // eddy viscosity that stands in for the eddies smaller than a cell.
          //
          // The strain rate comes from the NON-EQUILIBRIUM STRESS, which is a
          // structural advantage of LBM -- Pi_neq is already in these registers
          // and needs no finite differences and no neighbour access:
          //
          //   Pi_ab = sum_q c_a c_b f_q  -  (rho u_a u_b + rho cs^2 delta_ab)
          //
          // and solving nu_total = nu_0 + (Cs)^2 |S| for the relaxation time
          // gives the closed form below. |Pi| = 0 in laminar flow, so tauEff
          // collapses to tau EXACTLY and the model cannot touch the analytic
          // cases this engine is verified against.
          let omegaL = omega, omegaML = omegaM, fPreL = fPre, fPreML = fPreM;
          if (les && type === CELL.FLUID) {
            let pxx = 0, pyy = 0, pzz = 0, pxy = 0, pxz = 0, pyz = 0;
            for (let q = 0; q < Q; q++) {
              const v = fi[q], c = C[q];
              pxx += v * c[0] * c[0]; pyy += v * c[1] * c[1]; pzz += v * c[2] * c[2];
              pxy += v * c[0] * c[1]; pxz += v * c[0] * c[2]; pyz += v * c[1] * c[2];
            }
            pxx -= rho * (ux * ux + CS2); pyy -= rho * (uy * uy + CS2); pzz -= rho * (uz * uz + CS2);
            pxy -= rho * ux * uy; pxz -= rho * ux * uz; pyz -= rho * uy * uz;
            const pi = Math.sqrt(2 * (pxx * pxx + pyy * pyy + pzz * pzz
              + 2 * (pxy * pxy + pxz * pxz + pyz * pyz)));
            const tauEff = 0.5 * (tau + Math.sqrt(tau * tau + 18 * csSqr * pi / rho));
            omegaL = 1 / tauEff;
            omegaML = trt ? omegaMinusFor(tauEff, policy) : omegaL;
            fPreL = 1 - 0.5 * omegaL;
            fPreML = 1 - 0.5 * omegaML;
          }

          for (let q = 0; q < Q; q++) {
            const c = C[q];
            const cu = c[0] * ux + c[1] * uy + c[2] * uz;
            const eq = W[q] * rho * (1 + INV_CS2 * cu + INV_2CS4 * cu * cu - 1.5 * uu);
            let v;
            if (type === CELL.INLET) {
              v = eq;                              // hard reset to equilibrium at the prescribed u
            } else if (trt) {
              // Split f and f_eq into parts even and odd under q -> opposite(q),
              // and relax each at its own rate. The even part carries the stress
              // (hence the viscosity); the odd part carries the ghost modes.
              const qb = OPP[q];
              const cub = -cu;                     // c_qbar . u = -(c_q . u)
              const eqb = W[qb] * rho * (1 + INV_CS2 * cub + INV_2CS4 * cub * cub - 1.5 * uu);
              const fPlus = 0.5 * (fi[q] + fi[qb]), fMinus = 0.5 * (fi[q] - fi[qb]);
              const ePlus = 0.5 * (eq + eqb), eMinus = 0.5 * (eq - eqb);
              v = fi[q] - omegaL * (fPlus - ePlus) - omegaML * (fMinus - eMinus);
              if (forced) {
                // The Guo source splits the same way: the c_q term is odd, the
                // -u and (c.u)(c.F) terms are even. Applying one prefactor to
                // both would reintroduce exactly the tau-dependence TRT removes.
                const sMinus = INV_CS2 * (c[0] * fx + c[1] * fy + c[2] * fz);
                const sPlus = -INV_CS2 * (ux * fx + uy * fy + uz * fz)
                  + 3 * INV_CS2 * cu * (c[0] * fx + c[1] * fy + c[2] * fz);
                v += W[q] * (fPreML * sMinus + fPreL * sPlus);
              }
            } else {
              v = fi[q] + omegaL * (eq - fi[q]);
              if (forced) {
                const gx = INV_CS2 * (c[0] - ux) + 3 * INV_CS2 * cu * c[0];
                const gy = INV_CS2 * (c[1] - uy) + 3 * INV_CS2 * cu * c[1];
                const gz = INV_CS2 * (c[2] - uz) + 3 * INV_CS2 * cu * c[2];
                v += fPreL * W[q] * (gx * fx + gy * fy + gz * fz);
              }
            }
            // The final catch. If a population still comes out non-finite --
            // from an overflow inside the collision itself -- replace it with
            // the equilibrium at the sanitised moments rather than storing a
            // NaN that streaming would hand to a neighbour next step.
            dst[q * N + i] = Number.isFinite(v) ? v : eq;
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
    const u0 = this.op.inletVelocityNow
      ? this.op.inletVelocityNow() : this.op.params.inletVelocity;
    const anchor = this.op.params.outletAnchor;

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
        // OUTLET. Velocity is zero-gradient (whatever arrives leaves), and the
        // density is pulled only WEAKLY toward rest instead of being pinned to
        // it. Pinning is what reflects: it re-imposes rho0 every step, so an
        // arriving wave meets a hard wall and comes straight back. Imposing
        // nothing is the other failure -- the channel drained to rho 0.32 --
        // so the anchor stays, just gently.
        rho = macro[si] + anchor * (1 - macro[si]);
        ux = macro[N + si]; uy = macro[2 * N + si]; uz = macro[3 * N + si];
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

/**
 * D3Q19 advection-diffusion of a passive scalar, the reference for the scalar
 * transport operator. Deliberately mirrors CPULBM's data flow -- the same pull
 * stream with fused bounce-back -- so the two can be compared and so a reader who
 * has understood the fluid kernel already understands this one.
 *
 * The scalar rides its own populations g on the SAME D3Q19 stencil. Its
 * equilibrium is the FIRST-ORDER truncation g_eq = w_q C (1 + c.u/cs^2): a passive
 * scalar has no momentum flux, so the O(u^2) Hermite term the fluid needs is not
 * required to recover the advection-diffusion limit. The concentration C = sum g_q
 * is the zeroth moment; the velocity u is READ from the fluid's macro field, never
 * written -- the coupling is one-way, which is why the solver runs the fluid first.
 *
 * Boundaries: solid walls are NO-FLUX (plain bounce-back, no momentum term -- a
 * moving wall carries no scalar); an INLET is Dirichlet at `inletValue`; a source
 * region is Dirichlet at its value (a continuous injector); an OUTLET is
 * zero-gradient, finished in a second pass once the neighbour is settled.
 */
class CPUScalar {
  constructor(ctx, op) {
    this.ctx = ctx;
    this.op = op;
    this.name = op.name;
  }

  initialize() {
    const { lattice, backend } = this.ctx;
    const entry = backend.buffers.get(this.op.distribution);
    const g = entry.a;                                   // fill the READ buffer directly
    const conc = backend.write(this.op.concentration);
    const macro = backend.read(this.op.velocity);        // fluid already seeded macro
    const N = lattice.cellCount;
    const C0 = this.op.params.initialValue || 0;
    for (let i = 0; i < N; i++) {
      const type = backend.flags[i];
      const solid = type === CELL.SOLID || type === CELL.MOVING;
      const Ci = solid ? 0 : C0;
      const ux = macro[N + i], uy = macro[2 * N + i], uz = macro[3 * N + i];
      for (let q = 0; q < Q; q++) {
        const cu = C[q][0] * ux + C[q][1] * uy + C[q][2] * uz;
        g[q * N + i] = W[q] * Ci * (1 + INV_CS2 * cu);
      }
      conc[i] = Ci;
    }
    if (entry.b) entry.b.set(g);
  }

  step() {
    const { lattice, backend } = this.ctx;
    const { nx, ny, nz } = lattice;
    const N = lattice.cellCount;
    const src = backend.read(this.op.distribution);
    const dst = backend.write(this.op.distribution);
    const conc = backend.write(this.op.concentration);
    const macro = backend.read(this.op.velocity);
    const flags = backend.flags;
    const { tau, inletValue, source, clamp } = this.op.params;
    const omega = 1 / tau;
    const per = lattice.topology.map((t) => t === 'periodic');
    const srcR2 = (source.radius || 0) * (source.radius || 0);
    const hasSource = source.radius > 0;
    const sc = source.centre;
    const gi = new Float64Array(Q);

    for (let z = 0; z < nz; z++) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          const i = x + nx * (y + ny * z);
          const type = flags[i];

          if (type === CELL.SOLID || type === CELL.MOVING) {
            for (let q = 0; q < Q; q++) dst[q * N + i] = 0;
            conc[i] = 0;
            continue;
          }

          // ---- gather (pull stream) with fused no-flux bounce-back
          for (let q = 0; q < Q; q++) {
            const c = C[q];
            let sx = x - c[0], sy = y - c[1], sz = z - c[2];
            let outside = false;
            if (per[0]) sx = (sx + nx) % nx; else if (sx < 0 || sx >= nx) outside = true;
            if (per[1]) sy = (sy + ny) % ny; else if (sy < 0 || sy >= ny) outside = true;
            if (per[2]) sz = (sz + nz) % nz; else if (sz < 0 || sz >= nz) outside = true;
            if (outside) { gi[q] = src[OPP[q] * N + i]; continue; }
            const si = sx + nx * (sy + ny * sz);
            const nt = flags[si];
            // No-flux: a wall (stationary or moving) reflects the scalar and
            // injects none of it, so there is no momentum-correction term.
            if (nt === CELL.SOLID || nt === CELL.MOVING) gi[q] = src[OPP[q] * N + i];
            else gi[q] = src[q * N + si];
          }

          // ---- concentration (zeroth moment) and the advecting velocity
          let Cc = 0;
          for (let q = 0; q < Q; q++) Cc += gi[q];
          const ux = macro[N + i], uy = macro[2 * N + i], uz = macro[3 * N + i];

          // ---- Dirichlet overrides: a clean inlet, and the injector
          let dirichlet = false, Cval = Cc;
          if (type === CELL.INLET) { dirichlet = true; Cval = inletValue; }
          if (hasSource) {
            const dx = x - sc[0], dy = y - sc[1], dz = z - sc[2];
            if (dx * dx + dy * dy + dz * dz <= srcR2) { dirichlet = true; Cval = source.value; }
          }
          // Optional cosmetic clamp: a passive scalar in a divergence-free flow is
          // analytically bounded by its own initial and boundary values, so this is
          // OFF for the verified cases. When on, an over/undershoot is hard-reset to
          // equilibrium at the bound -- non-conservative, which is why it is opt-in.
          if (clamp && !dirichlet && (Cc < 0 || Cc > 1)) { dirichlet = true; Cval = Cc < 0 ? 0 : 1; }

          for (let q = 0; q < Q; q++) {
            const c = C[q];
            const cu = c[0] * ux + c[1] * uy + c[2] * uz;
            const eq = W[q] * Cval * (1 + INV_CS2 * cu);
            const v = dirichlet ? eq : gi[q] + omega * (eq - gi[q]);
            dst[q * N + i] = Number.isFinite(v) ? v : eq;
          }
          conc[i] = Cval;
        }
      }
    }

    this.applyScalarOutlet(dst, conc);
    backend.swap(this.op.distribution);
  }

  /** OUTLET cells are zero-gradient: copy the upstream neighbour's populations. */
  applyScalarOutlet(dst, conc) {
    const { lattice, backend } = this.ctx;
    const { nx, ny } = lattice;
    const N = lattice.cellCount;
    const flags = backend.flags;
    lattice.forEachCell((x, y, z, i) => {
      if (flags[i] !== CELL.OUTLET) return;
      let sx = -1;
      if (x > 0 && flags[i - 1] !== CELL.INLET && flags[i - 1] !== CELL.OUTLET) sx = x - 1;
      else if (x < nx - 1 && flags[i + 1] !== CELL.INLET && flags[i + 1] !== CELL.OUTLET) sx = x + 1;
      if (sx < 0) return;
      const si = sx + nx * (y + ny * z);
      if (flags[si] === CELL.SOLID || flags[si] === CELL.MOVING) return;
      for (let q = 0; q < Q; q++) dst[q * N + i] = dst[q * N + si];
      conc[i] = conc[si];
    });
  }
}

// ------------------------------------------------------------- diagnostics

/**
 * Reductions over the macroscopic field. Cheap on this backend; the GPU
 * backend does the same reduction in a compute pass and returns the same
 * shape, so the diagnostics UI does not care which is running.
 */
const LIM_U2 = LIMITS.uMax * LIMITS.uMax * 0.9999;
const ZERO3 = [0, 0, 0];

export function reduceMacro(lattice, flags, macro, prev = null) {
  const N = lattice.cellCount;
  let mass = 0, px = 0, py = 0, pz = 0, ke = 0;
  let rhoMin = Infinity, rhoMax = -Infinity, uMax = 0, cells = 0;
  let sumDU = 0, sumU2 = 0, limited = 0;
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
    // Sitting AT the clamp means the limiter is holding this cell up. Counted
    // rather than hidden: a rescued simulation is still running, but it is no
    // longer only solving the equations it was asked to solve.
    if (u2 >= LIM_U2) limited++;
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
    limited,
  };
}
