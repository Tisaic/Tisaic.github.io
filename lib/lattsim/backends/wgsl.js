// WGSL shader generation.
//
// The shaders are BUILT rather than written as static strings, for one reason:
// the velocity set, the weights and the opposite-direction table come from
// d3q19.js, the same module the CPU reference imports. A shader carrying its
// own copy of 1/36 is a shader that can quietly disagree with the
// implementation the test suite verified.
//
// Everything else here mirrors backends/cpu.js line for line -- same pull
// streaming, same fused halfway bounce-back, same Guo forcing, same driven-cell
// override. If one changes, both change.

import { wgslConstants, Q } from '../d3q19.js';
import { LIMITS } from '../operators/lbm.js';
import { CELL } from '../materials.js';

/** Shared prelude: constants, the lattice uniform, and the indexing helpers. */
function prelude(lattice) {
  return `
${wgslConstants()}

const CELL_FLUID  : u32 = ${CELL.FLUID}u;
const CELL_SOLID  : u32 = ${CELL.SOLID}u;
const CELL_INLET  : u32 = ${CELL.INLET}u;
const CELL_OUTLET : u32 = ${CELL.OUTLET}u;
const CELL_MOVING : u32 = ${CELL.MOVING}u;

// Baked in rather than passed as a uniform: the lattice size is fixed for the
// lifetime of a pipeline, and constant-folding the strides is worth more than
// the flexibility of changing them without a rebuild. Resolution changes
// rebuild the whole simulation anyway.
const NX : i32 = ${lattice.nx};
const NY : i32 = ${lattice.ny};
const NZ : i32 = ${lattice.nz};
const NCELL : u32 = ${lattice.cellCount}u;
const PERIODIC : vec3<bool> = vec3<bool>(${lattice.topology.map((t) => t === 'periodic').join(', ')});

// The limiter's bounds, emitted from the same constants the CPU reference uses.
// See LIMITS in operators/lbm.js for why these values and not tighter ones.
const U_LIMIT   : f32 = ${LIMITS.uMax.toPrecision(9)};
const RHO_FLOOR : f32 = ${LIMITS.rhoMin.toPrecision(9)};
const RHO_CEIL  : f32 = ${LIMITS.rhoMax.toPrecision(9)};


// 128 bytes, and THESE OFFSETS ARE COMPUTED RATHER THAN GUESSED. A vec3<f32> is
// size 12 with align 16, which is the trap: an f32 following a vec3 lands in the
// vec3's trailing 4 bytes, not at the next 16-byte boundary.
//
//    0 omega   4 forcePre   8 omegaMinus   12 csSqr
//   16 force        32 inletVel      48 impulse     64 impulseCentre
//   76 impulseRadius          80 magicLambda
//   96 wallVel      108 outletAnchor  112 initVel
//  124 eosMode  128 csEff2  132 eosA   -> 144 total
// (eosMode lands at 124, initVel's trailing 4 bytes -- the vec3 trap again --
//  then two more f32 at 128/132, rounding the struct up to 144.)
//
// Getting this wrong is not a compile error: it is an invalid or MISREAD bind
// group. Guessing 112 for outletAnchor shifted it and initVel by one slot each,
// and the CPU/GPU parity check reported it as a 130% velocity disagreement --
// the third time vec3 packing has bitten this file.
// The four scalars fill the alignment gap ahead of the first vec3 exactly, so
// TRT and the sub-grid model cost no extra uniform bytes. Sizing this buffer
// wrong is not a compile error: it is an invalid bind group, a dropped command
// buffer, and a simulation of zeros.
struct Params {
  omega         : f32,        // 1 / tau            (omega+, sets viscosity)
  forcePre      : f32,        // 1 - 1/(2 tau)
  omegaMinus    : f32,        // TRT: holds Lambda = 3/16; == omega under BGK
  csSqr         : f32,        // Smagorinsky Cs^2; 0 disables the sub-grid model
  force         : vec3<f32>,
  inletVel      : vec3<f32>,
  impulse       : vec3<f32>,  // localised body force (the user's poke)
  impulseCentre : vec3<f32>,
  impulseRadius : f32,
  // The Lambda the sub-grid model must HOLD as it moves tau locally. Positive
  // means "recompute omega- to keep this Lambda" (the accuracy policy); zero or
  // negative means "leave omega- where it is" (the stability policy, which pins
  // omega- near 2 regardless of viscosity). Getting this wrong is not a compile
  // error -- it silently reintroduces the tau-dependence TRT removes.
  magicLambda   : f32,
  // The MOVING-wall velocity, separate from inletVel because an oscillating lid
  // must not oscillate an inlet. Sampled per step by the host.
  wallVel       : vec3<f32>,
  // How strongly the outlet pins density toward rest. 1 reflects perfectly,
  // 0 anchors nothing (and drains the channel). See outletAnchor in lbm.js.
  outletAnchor  : f32,
  // Initial velocity of the whole fluid, so a channel does not have to be
  // filled by a front that then rings off the outlet. Read only by initWGSL.
  initVel       : vec3<f32>,
  // EQUATION OF STATE. eosMode: 0 ideal, 1 linear, 2 quadratic. csEff2 is the
  // effective cs^2 for linear; eosA is the coefficient for quadratic.
  eosMode       : f32,
  csEff2        : f32,
  eosA          : f32,
};

// index = x + NX * (y + NY * z)   -- the convention, identical to lattice.js
fn cellIndex(p : vec3<i32>) -> u32 {
  return u32(p.x + NX * (p.y + NY * p.z));
}

fn cellCoord(i : u32) -> vec3<i32> {
  let x = i32(i) % NX;
  let y = (i32(i) / NX) % NY;
  let z = i32(i) / (NX * NY);
  return vec3<i32>(x, y, z);
}
`.trim();
}

/**
 * Fused collide + pull-stream, one thread per cell.
 *
 * PULL, not push: each thread gathers the populations that arrive at its own
 * cell and writes only its own slots. That is what makes the kernel race-free
 * with no atomics and no second pass -- with push streaming, neighbouring
 * threads write the same destination.
 *
 * Halfway bounce-back is fused into the gather: if the cell we would pull from
 * is solid, take the opposite population from this cell instead. That places
 * the wall halfway between the last fluid node and the first solid node, which
 * is the offset test/lattsim/poiseuille.test.mjs verifies against the analytic
 * profile (and which is exact at tau = 1/2 + sqrt(3/16)).
 */
export function collideStreamWGSL(lattice, { workgroup = [64, 1, 1] } = {}) {
  return `
${prelude(lattice)}

@group(0) @binding(0) var<storage, read>       src    : array<f32>;
@group(0) @binding(1) var<storage, read_write> dst    : array<f32>;
@group(0) @binding(2) var<storage, read>       flags  : array<u32>;
@group(0) @binding(3) var<storage, read_write> mac  : array<f32>;
@group(0) @binding(4) var<uniform>             params : Params;

// Excess pressure psi = p(rho) - rho*cs^2 at a cell, read from the previous-step
// distribution src so the gradient built from it is consistent. It matches the
// local equilibrium, not the pressure gradient. Only the collide module binds
// CPU reference: the neighbour density is UNCLAMPED, since the clamp guards the
// src, so this lives here rather than in the shared preamble.
fn psiAt(idx : u32) -> f32 {
  var rho : f32 = 0.0;
  for (var q : u32 = 0u; q < Q; q = q + 1u) { rho = rho + src[q * NCELL + idx]; }
  if (params.eosMode > 1.5) { return params.eosA * rho * rho; }
  return rho * (params.csEff2 - CS2);
}

/** Global body force plus any local impulse acting at cell p. */
fn bodyForce(p : vec3<i32>) -> vec3<f32> {
  var f = params.force;
  if (params.impulseRadius > 0.0) {
    let d = vec3<f32>(p) - params.impulseCentre;
    if (dot(d, d) <= params.impulseRadius * params.impulseRadius) { f = f + params.impulse; }
  }
  return f;
}

@compute @workgroup_size(${workgroup[0]}, ${workgroup[1]}, ${workgroup[2]})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= NCELL) { return; }
  let p = cellCoord(i);
  let ctype = flags[i];

  if (ctype == CELL_SOLID || ctype == CELL_MOVING) {
    for (var q : u32 = 0u; q < Q; q = q + 1u) { dst[q * NCELL + i] = 0.0; }
    mac[i] = 1.0;
    mac[NCELL + i] = 0.0;
    mac[2u * NCELL + i] = 0.0;
    mac[3u * NCELL + i] = 0.0;
    return;
  }

  // ---- gather (pull) with fused halfway bounce-back
  var fi : array<f32, ${Q}>;
  for (var q : u32 = 0u; q < Q; q = q + 1u) {
    let c = CV[q];
    var s = p - c;
    var outside = false;
    if (PERIODIC.x) { s.x = (s.x + NX) % NX; } else if (s.x < 0 || s.x >= NX) { outside = true; }
    if (PERIODIC.y) { s.y = (s.y + NY) % NY; } else if (s.y < 0 || s.y >= NY) { outside = true; }
    if (PERIODIC.z) { s.z = (s.z + NZ) % NZ; } else if (s.z < 0 || s.z >= NZ) { outside = true; }
    if (outside) {
      fi[q] = src[OPP[q] * NCELL + i];
    } else {
      let si = cellIndex(s);
      let nt = flags[si];
      if (nt == CELL_SOLID) {
        fi[q] = src[OPP[q] * NCELL + i];
      } else if (nt == CELL_MOVING) {
        // Halfway bounce-back off a MOVING wall: injects momentum, not mass.
        //   f_q = f_qbar + 2 w_q rho_w (c_q . u_wall) / cs^2
        let cu = dot(vec3<f32>(CV[q]), params.wallVel);
        fi[q] = src[OPP[q] * NCELL + i] + 2.0 * WT[q] * INV_CS2 * cu;
      } else {
        fi[q] = src[q * NCELL + si];
      }
    }
  }

  // ---- moments
  var rho : f32 = 0.0;
  var mom : vec3<f32> = vec3<f32>(0.0);
  for (var q : u32 = 0u; q < Q; q = q + 1u) {
    rho = rho + fi[q];
    mom = mom + fi[q] * vec3<f32>(CV[q]);
  }
  // ---- LIMITER. Break the chain that turns a fast cell into a lattice-wide
  // NaN: no zero density to divide by, no unbounded velocity to feed back into
  // the equilibrium. A healthy run never reaches these bounds.
  // NOTE the comparisons are written so that NaN takes the clamp: !(x > lo) is
  // true for a NaN, where x < lo would be false and would let it through.
  if (!(rho > RHO_FLOOR)) { rho = RHO_FLOOR; }
  else if (!(rho < RHO_CEIL)) { rho = RHO_CEIL; }

  var bf = bodyForce(p);
  // EOS pressure force F = -grad(psi), isotropic stencil over the neighbours. A
  // SOLID or off-domain neighbour contributes the cell's own psi (no-flux wall).
  // Skipped for the ideal gas, so an ideal run is byte-for-byte unchanged.
  if (params.eosMode > 0.5) {
    let psiSelf = psiAt(i);
    var grad = vec3<f32>(0.0);
    for (var q : u32 = 1u; q < Q; q = q + 1u) {
      let c = CV[q];
      var t = p + c;
      var out = false;
      if (PERIODIC.x) { t.x = (t.x + NX) % NX; } else if (t.x < 0 || t.x >= NX) { out = true; }
      if (PERIODIC.y) { t.y = (t.y + NY) % NY; } else if (t.y < 0 || t.y >= NY) { out = true; }
      if (PERIODIC.z) { t.z = (t.z + NZ) % NZ; } else if (t.z < 0 || t.z >= NZ) { out = true; }
      var psiN : f32;
      if (out) { psiN = psiSelf; }
      else {
        let ti = cellIndex(t);
        if (flags[ti] == CELL_SOLID) { psiN = psiSelf; } else { psiN = psiAt(ti); }
      }
      grad = grad + INV_CS2 * WT[q] * vec3<f32>(c) * psiN;
    }
    bf = bf - grad;
  }
  var u = mom / rho;
  u = u + 0.5 * bf / rho;                      // Guo: half the force shifts u
  if (!(dot(u, u) >= 0.0)) { u = vec3<f32>(0.0); }        // NaN -> rest
  let usq = dot(u, u);
  if (usq > U_LIMIT * U_LIMIT) { u = u * (U_LIMIT / sqrt(usq)); }

  let driven = (ctype == CELL_INLET);
  if (driven) { u = params.inletVel; }

  // ---- collide + Guo forcing
  let uu = dot(u, u);

  // SUB-GRID MODEL: tau becomes a FIELD. The local strain rate comes from the
  // non-equilibrium stress, which is already in registers -- no finite
  // differences, no neighbour reads. Pi vanishes in laminar flow, so tauEff
  // collapses to tau exactly and the model cannot touch the analytic cases.
  var omegaP = params.omega;
  var omegaM = params.omegaMinus;
  var fPreP = params.forcePre;
  var fPreM = 1.0 - 0.5 * omegaM;
  if (params.csSqr > 0.0 && ctype == CELL_FLUID) {
    var pxx = 0.0; var pyy = 0.0; var pzz = 0.0;
    var pxy = 0.0; var pxz = 0.0; var pyz = 0.0;
    for (var q : u32 = 0u; q < Q; q = q + 1u) {
      let c = vec3<f32>(CV[q]);
      let v = fi[q];
      pxx = pxx + v * c.x * c.x; pyy = pyy + v * c.y * c.y; pzz = pzz + v * c.z * c.z;
      pxy = pxy + v * c.x * c.y; pxz = pxz + v * c.x * c.z; pyz = pyz + v * c.y * c.z;
    }
    pxx = pxx - rho * (u.x * u.x + CS2);
    pyy = pyy - rho * (u.y * u.y + CS2);
    pzz = pzz - rho * (u.z * u.z + CS2);
    pxy = pxy - rho * u.x * u.y;
    pxz = pxz - rho * u.x * u.z;
    pyz = pyz - rho * u.y * u.z;
    let pi = sqrt(2.0 * (pxx * pxx + pyy * pyy + pzz * pzz
      + 2.0 * (pxy * pxy + pxz * pxz + pyz * pyz)));
    let tau0 = 1.0 / params.omega;
    let tauEff = 0.5 * (tau0 + sqrt(tau0 * tau0 + 18.0 * params.csSqr * pi / rho));
    omegaP = 1.0 / tauEff;
    // Keep Lambda fixed as tau moves, or the sub-grid model would drag the wall
    // position back off exactly where the flow is most strained.
    let trt = params.omegaMinus != params.omega;
    if (trt && params.magicLambda > 0.0) {
      omegaM = 1.0 / (0.5 + params.magicLambda / (tauEff - 0.5));
    } else if (!trt) {
      omegaM = omegaP;
    }
    fPreP = 1.0 - 0.5 * omegaP;
    fPreM = 1.0 - 0.5 * omegaM;
  }

  for (var q : u32 = 0u; q < Q; q = q + 1u) {
    let c = vec3<f32>(CV[q]);
    let cu = dot(c, u);
    let eq = WT[q] * rho * (1.0 + INV_CS2 * cu + INV_2CS4 * cu * cu - 1.5 * uu);
    var v : f32;
    if (driven) {
      v = eq;
    } else if (omegaM != omegaP) {
      // TRT: relax the parts even and odd under q -> opposite(q) at two rates.
      // The even part carries the stress (the viscosity); the odd part carries
      // the ghost modes that make BGK blow up as tau approaches 1/2.
      let qb = OPP[q];
      let cub = -cu;
      let eqb = WT[qb] * rho * (1.0 + INV_CS2 * cub + INV_2CS4 * cub * cub - 1.5 * uu);
      let fP = 0.5 * (fi[q] + fi[qb]);
      let fM = 0.5 * (fi[q] - fi[qb]);
      let eP = 0.5 * (eq + eqb);
      let eM = 0.5 * (eq - eqb);
      v = fi[q] - omegaP * (fP - eP) - omegaM * (fM - eM);
      // The Guo source splits the same way: the c term is odd, the -u and
      // (c.u)(c.F) terms are even. One prefactor for both would put back
      // exactly the tau-dependence TRT exists to remove.
      let sM = INV_CS2 * dot(c, bf);
      let sP = -INV_CS2 * dot(u, bf) + (INV_CS2 * INV_CS2) * cu * dot(c, bf);
      v = v + WT[q] * (fPreM * sM + fPreP * sP);
    } else {
      v = fi[q] + omegaP * (eq - fi[q]);
      let g = INV_CS2 * (c - u) + (INV_CS2 * INV_CS2) * cu * c;
      v = v + fPreP * WT[q] * dot(g, bf);
    }
    // The final catch: a population that still came out non-finite is replaced
    // by the equilibrium at the sanitised moments, so streaming can never hand
    // a NaN to a neighbour.
    dst[q * NCELL + i] = select(eq, v, v == v && abs(v) < 3.4e38);
  }

  mac[i] = rho;
  mac[NCELL + i] = u.x;
  mac[2u * NCELL + i] = u.y;
  mac[3u * NCELL + i] = u.z;
}
`.trim();
}

/**
 * Open boundaries: INLET and OUTLET, written as equilibrium against the
 * neighbouring fluid cell. Mirrors CPULBM.applyOpenBoundaries exactly -- see
 * the long comment there for why the first version (a plain copy at the outlet)
 * drained the channel to a density of 0.32 while still looking like flow.
 *
 * Separate from the main kernel because it must read state the main kernel has
 * already written.
 */
export function openBoundaryWGSL(lattice, { workgroup = [64, 1, 1] } = {}) {
  return `
${prelude(lattice)}

@group(0) @binding(0) var<storage, read_write> dst    : array<f32>;
@group(0) @binding(1) var<storage, read>       flags  : array<u32>;
@group(0) @binding(2) var<storage, read_write> mac  : array<f32>;
@group(0) @binding(3) var<uniform>             params : Params;

fn isOpen(t : u32) -> bool { return t == CELL_INLET || t == CELL_OUTLET; }

@compute @workgroup_size(${workgroup[0]}, ${workgroup[1]}, ${workgroup[2]})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= NCELL) { return; }
  let ctype = flags[i];
  if (!isOpen(ctype)) { return; }
  let p = cellCoord(i);

  var sx : i32 = -1;
  if (p.x > 0 && !isOpen(flags[cellIndex(vec3<i32>(p.x - 1, p.y, p.z))])) { sx = p.x - 1; }
  else if (p.x < NX - 1 && !isOpen(flags[cellIndex(vec3<i32>(p.x + 1, p.y, p.z))])) { sx = p.x + 1; }
  if (sx < 0) { return; }

  let si = cellIndex(vec3<i32>(sx, p.y, p.z));
  if (flags[si] == CELL_SOLID) { return; }      // a corner: leave it to bounce-back

  var rho : f32;
  var u : vec3<f32>;
  if (ctype == CELL_INLET) {
    rho = mac[si];
    u = params.inletVel;
  } else {
    // OUTLET. Velocity is zero-gradient; the density is pulled only WEAKLY
    // toward rest. Pinning it to 1.0 anchors the pressure perfectly and
    // reflects perfectly -- an arriving wave meets a hard wall and comes back.
    // Imposing nothing drained the channel to rho 0.32 once already, so the
    // anchor stays, gently.
    rho = mac[si] + params.outletAnchor * (1.0 - mac[si]);
    u = vec3<f32>(mac[NCELL + si], mac[2u * NCELL + si], mac[3u * NCELL + si]);
  }

  let uu = dot(u, u);
  for (var q : u32 = 0u; q < Q; q = q + 1u) {
    let c = vec3<f32>(CV[q]);
    let cu = dot(c, u);
    dst[q * NCELL + i] = WT[q] * rho * (1.0 + INV_CS2 * cu + INV_2CS4 * cu * cu - 1.5 * uu);
  }
  mac[i] = rho;
  mac[NCELL + i] = u.x;
  mac[2u * NCELL + i] = u.y;
  mac[3u * NCELL + i] = u.z;
}
`.trim();
}

/** Initial state: equilibrium at rest, or at the prescribed velocity on driven cells. */
export function initWGSL(lattice, { workgroup = [64, 1, 1] } = {}) {
  return `
${prelude(lattice)}

@group(0) @binding(0) var<storage, read_write> a      : array<f32>;
@group(0) @binding(1) var<storage, read_write> b      : array<f32>;
@group(0) @binding(2) var<storage, read>       flags  : array<u32>;
@group(0) @binding(3) var<storage, read_write> mac  : array<f32>;
@group(0) @binding(4) var<uniform>             params : Params;

@compute @workgroup_size(${workgroup[0]}, ${workgroup[1]}, ${workgroup[2]})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= NCELL) { return; }
  let ctype = flags[i];
  var u = vec3<f32>(0.0);
  if (ctype == CELL_INLET) { u = params.inletVel; }
  else if (ctype != CELL_SOLID && ctype != CELL_MOVING) { u = params.initVel; }
  let uu = dot(u, u);
  for (var q : u32 = 0u; q < Q; q = q + 1u) {
    let c = vec3<f32>(CV[q]);
    let cu = dot(c, u);
    let v = WT[q] * (1.0 + INV_CS2 * cu + INV_2CS4 * cu * cu - 1.5 * uu);
    a[q * NCELL + i] = v;
    b[q * NCELL + i] = v;      // both halves of the ping-pong start identical
  }
  mac[i] = 1.0;
  mac[NCELL + i] = u.x;
  mac[2u * NCELL + i] = u.y;
  mac[3u * NCELL + i] = u.z;
}
`.trim();
}

// ---------------------------------------------------------------------------
// PASSIVE SCALAR (advection-diffusion) shaders. A second D3Q19 distribution g
// rides the same stencil the fluid uses -- so these reuse prelude()'s CV/WT/OPP
// and the cellIndex/cellCoord helpers verbatim -- but carry a scalar instead of
// mass and momentum. They mirror backends/cpu.js CPUScalar line for line, the
// same way the fluid shaders mirror CPULBM.
//
// The velocity comes from the fluid's `mac` field, bound READ-ONLY: the scalar
// reads the flow it is carried by and never writes it, which is why the solver
// can run the fluid first and this second without a write conflict.

// Its own small uniform, separate from the fluid Params. Offsets written out
// because the vec3 trap here is the same one documented above: sourceValue is an
// f32 AFTER a vec3, so it lands at offset 28 (the vec3's trailing 4 bytes), not
// at 32.
//    0 omega   4 inletValue   8 clampOn   12 sourceRadius
//   16 sourceCentre (vec3)    28 sourceValue   32 initialValue   -> 48 total
const SCALAR_PARAMS = `
struct SParams {
  omega        : f32,        // 1 / tau_g   (D = cs^2 (tau_g - 1/2))
  inletValue   : f32,        // scalar carried in at INLET cells
  clampOn      : f32,        // 0/1: cosmetic hard clamp of C into [0,1]
  sourceRadius : f32,        // Dirichlet injector radius (0 = no source)
  sourceCentre : vec3<f32>,
  sourceValue  : f32,
  initialValue : f32,
};`;

/** Scalar collide + pull-stream, with no-flux walls and a Dirichlet source. */
export function collideStreamScalarWGSL(lattice, { workgroup = [64, 1, 1] } = {}) {
  return `
${prelude(lattice)}
${SCALAR_PARAMS}

@group(0) @binding(0) var<storage, read>       src    : array<f32>;
@group(0) @binding(1) var<storage, read_write> dst    : array<f32>;
@group(0) @binding(2) var<storage, read>       flags  : array<u32>;
@group(0) @binding(3) var<storage, read>       mac    : array<f32>;  // velocity IN, read-only
@group(0) @binding(4) var<storage, read_write> conc   : array<f32>;
@group(0) @binding(5) var<uniform>             params : SParams;

@compute @workgroup_size(${workgroup[0]}, ${workgroup[1]}, ${workgroup[2]})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= NCELL) { return; }
  let p = cellCoord(i);
  let ctype = flags[i];

  if (ctype == CELL_SOLID || ctype == CELL_MOVING) {
    for (var q : u32 = 0u; q < Q; q = q + 1u) { dst[q * NCELL + i] = 0.0; }
    conc[i] = 0.0;
    return;
  }

  // ---- gather (pull) with fused no-flux bounce-back (no momentum term: a wall
  // carries no scalar).
  var gi : array<f32, ${Q}>;
  for (var q : u32 = 0u; q < Q; q = q + 1u) {
    let c = CV[q];
    var s = p - c;
    var outside = false;
    if (PERIODIC.x) { s.x = (s.x + NX) % NX; } else if (s.x < 0 || s.x >= NX) { outside = true; }
    if (PERIODIC.y) { s.y = (s.y + NY) % NY; } else if (s.y < 0 || s.y >= NY) { outside = true; }
    if (PERIODIC.z) { s.z = (s.z + NZ) % NZ; } else if (s.z < 0 || s.z >= NZ) { outside = true; }
    if (outside) {
      gi[q] = src[OPP[q] * NCELL + i];
    } else {
      let si = cellIndex(s);
      let nt = flags[si];
      if (nt == CELL_SOLID || nt == CELL_MOVING) { gi[q] = src[OPP[q] * NCELL + i]; }
      else { gi[q] = src[q * NCELL + si]; }
    }
  }

  // ---- concentration and the advecting velocity
  var conc0 : f32 = 0.0;
  for (var q : u32 = 0u; q < Q; q = q + 1u) { conc0 = conc0 + gi[q]; }
  let u = vec3<f32>(mac[NCELL + i], mac[2u * NCELL + i], mac[3u * NCELL + i]);

  // ---- Dirichlet overrides: clean inlet, injector, and the optional clamp
  var dir = false;
  var cval = conc0;
  if (ctype == CELL_INLET) { dir = true; cval = params.inletValue; }
  if (params.sourceRadius > 0.0) {
    let d = vec3<f32>(p) - params.sourceCentre;
    if (dot(d, d) <= params.sourceRadius * params.sourceRadius) { dir = true; cval = params.sourceValue; }
  }
  if (params.clampOn > 0.5 && !dir && (conc0 < 0.0 || conc0 > 1.0)) {
    dir = true; cval = select(1.0, 0.0, conc0 < 0.0);
  }

  for (var q : u32 = 0u; q < Q; q = q + 1u) {
    let c = vec3<f32>(CV[q]);
    let cu = dot(c, u);
    let eq = WT[q] * cval * (1.0 + INV_CS2 * cu);
    var v : f32;
    if (dir) { v = eq; } else { v = gi[q] + params.omega * (eq - gi[q]); }
    dst[q * NCELL + i] = select(eq, v, v == v && abs(v) < 3.4e38);
  }
  conc[i] = cval;
}
`.trim();
}

/** Scalar OUTLET: zero-gradient, copying the upstream neighbour after the bulk. */
export function scalarOutletWGSL(lattice, { workgroup = [64, 1, 1] } = {}) {
  return `
${prelude(lattice)}

@group(0) @binding(0) var<storage, read_write> dst   : array<f32>;
@group(0) @binding(1) var<storage, read>       flags : array<u32>;
@group(0) @binding(2) var<storage, read_write> conc  : array<f32>;

fn isOpen(t : u32) -> bool { return t == CELL_INLET || t == CELL_OUTLET; }

@compute @workgroup_size(${workgroup[0]}, ${workgroup[1]}, ${workgroup[2]})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= NCELL) { return; }
  if (flags[i] != CELL_OUTLET) { return; }
  let p = cellCoord(i);

  var sx : i32 = -1;
  if (p.x > 0 && !isOpen(flags[cellIndex(vec3<i32>(p.x - 1, p.y, p.z))])) { sx = p.x - 1; }
  else if (p.x < NX - 1 && !isOpen(flags[cellIndex(vec3<i32>(p.x + 1, p.y, p.z))])) { sx = p.x + 1; }
  if (sx < 0) { return; }
  let si = cellIndex(vec3<i32>(sx, p.y, p.z));
  if (flags[si] == CELL_SOLID || flags[si] == CELL_MOVING) { return; }

  for (var q : u32 = 0u; q < Q; q = q + 1u) { dst[q * NCELL + i] = dst[q * NCELL + si]; }
  conc[i] = conc[si];
}
`.trim();
}

/** Initial scalar state: equilibrium at initialValue in the local velocity. */
export function initScalarWGSL(lattice, { workgroup = [64, 1, 1] } = {}) {
  return `
${prelude(lattice)}
${SCALAR_PARAMS}

@group(0) @binding(0) var<storage, read_write> ga     : array<f32>;
@group(0) @binding(1) var<storage, read_write> gb     : array<f32>;
@group(0) @binding(2) var<storage, read>       flags  : array<u32>;
@group(0) @binding(3) var<storage, read>       mac    : array<f32>;
@group(0) @binding(4) var<storage, read_write> conc   : array<f32>;
@group(0) @binding(5) var<uniform>             params : SParams;

@compute @workgroup_size(${workgroup[0]}, ${workgroup[1]}, ${workgroup[2]})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= NCELL) { return; }
  let ctype = flags[i];
  let solid = (ctype == CELL_SOLID || ctype == CELL_MOVING);
  let c0 = select(params.initialValue, 0.0, solid);
  let u = vec3<f32>(mac[NCELL + i], mac[2u * NCELL + i], mac[3u * NCELL + i]);
  for (var q : u32 = 0u; q < Q; q = q + 1u) {
    let cu = dot(vec3<f32>(CV[q]), u);
    let v = WT[q] * c0 * (1.0 + INV_CS2 * cu);
    ga[q * NCELL + i] = v;
    gb[q * NCELL + i] = v;
  }
  conc[i] = c0;
}
`.trim();
}

/**
 * Diagnostic reduction: one workgroup produces one partial sum, the host adds
 * the partials. Deliberately a compute pass rather than a readback of the whole
 * mac field -- reading 4 floats per cell back to JavaScript every time the
 * stats refresh would be exactly the transfer this architecture exists to
 * avoid.
 *
 * Layout of each partial: [mass, px, py, pz, ke, rhoMin, rhoMax, uMaxSq,
 * fluidCells, nonFinite, sumDeltaUSq, sumUSq, limitedCells].
 *
 * The last two are the RESIDUAL: how much the velocity field moved since the
 * previous reduction. It is the diagnostic that answers "has this settled?" --
 * without it a converged simulation and a slowly drifting one look identical,
 * and the only way to tell was to stare at the picture.
 */
export const REDUCE_STRIDE = 13;
export function reduceWGSL(lattice, { workgroup = 64 } = {}) {
  return `
${prelude(lattice)}

@group(0) @binding(0) var<storage, read>       mac      : array<f32>;
@group(0) @binding(1) var<storage, read>       flags    : array<u32>;
@group(0) @binding(2) var<storage, read_write> partials : array<f32>;
@group(0) @binding(3) var<storage, read>       macPrev  : array<f32>;

var<workgroup> sMass : array<f32, ${workgroup}>;
var<workgroup> sMom  : array<vec3<f32>, ${workgroup}>;
var<workgroup> sKe   : array<f32, ${workgroup}>;
var<workgroup> sMin  : array<f32, ${workgroup}>;
var<workgroup> sMax  : array<f32, ${workgroup}>;
var<workgroup> sUmax : array<f32, ${workgroup}>;
var<workgroup> sN    : array<f32, ${workgroup}>;
var<workgroup> sBad  : array<f32, ${workgroup}>;
var<workgroup> sDU   : array<f32, ${workgroup}>;
var<workgroup> sU2   : array<f32, ${workgroup}>;
var<workgroup> sLim  : array<f32, ${workgroup}>;

@compute @workgroup_size(${workgroup}, 1, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>,
        @builtin(local_invocation_id)  lid : vec3<u32>,
        @builtin(workgroup_id)         wid : vec3<u32>) {
  let t = lid.x;
  let i = gid.x;
  var mass = 0.0; var mom = vec3<f32>(0.0); var ke = 0.0;
  var lo = 1e30; var hi = -1e30; var um = 0.0; var n = 0.0; var bad = 0.0;
  var du = 0.0; var u2 = 0.0; var lim = 0.0;

  if (i < NCELL && flags[i] != CELL_SOLID && flags[i] != CELL_MOVING) {
    let rho = mac[i];
    let u = vec3<f32>(mac[NCELL + i], mac[2u * NCELL + i], mac[3u * NCELL + i]);
    let ok = (rho == rho) && (u.x == u.x) && (u.y == u.y) && (u.z == u.z)
             && abs(rho) < 1e30 && abs(u.x) < 1e30 && abs(u.y) < 1e30 && abs(u.z) < 1e30;
    if (ok) {
      n = 1.0; mass = rho; mom = rho * u; ke = 0.5 * rho * dot(u, u);
      lo = rho; hi = rho; um = dot(u, u);
      let pu = vec3<f32>(macPrev[NCELL + i], macPrev[2u * NCELL + i], macPrev[3u * NCELL + i]);
      let dv = u - pu;
      du = dot(dv, dv); u2 = dot(u, u);
      if (u2 >= U_LIMIT * U_LIMIT * 0.9999) { lim = 1.0; }
    } else {
      bad = 1.0;
    }
  }

  sMass[t] = mass; sMom[t] = mom; sKe[t] = ke;
  sMin[t] = lo; sMax[t] = hi; sUmax[t] = um; sN[t] = n; sBad[t] = bad;
  sDU[t] = du; sU2[t] = u2; sLim[t] = lim;
  workgroupBarrier();

  var stride : u32 = ${workgroup}u / 2u;
  loop {
    if (stride == 0u) { break; }
    if (t < stride) {
      sMass[t] = sMass[t] + sMass[t + stride];
      sMom[t]  = sMom[t]  + sMom[t + stride];
      sKe[t]   = sKe[t]   + sKe[t + stride];
      sMin[t]  = min(sMin[t], sMin[t + stride]);
      sMax[t]  = max(sMax[t], sMax[t + stride]);
      sUmax[t] = max(sUmax[t], sUmax[t + stride]);
      sN[t]    = sN[t]    + sN[t + stride];
      sBad[t]  = sBad[t]  + sBad[t + stride];
      sDU[t]   = sDU[t]   + sDU[t + stride];
      sU2[t]   = sU2[t]   + sU2[t + stride];
      sLim[t]  = sLim[t]  + sLim[t + stride];
    }
    workgroupBarrier();
    stride = stride / 2u;
  }

  if (t == 0u) {
    let o = wid.x * ${REDUCE_STRIDE}u;
    partials[o + 0u] = sMass[0];
    partials[o + 1u] = sMom[0].x;
    partials[o + 2u] = sMom[0].y;
    partials[o + 3u] = sMom[0].z;
    partials[o + 4u] = sKe[0];
    partials[o + 5u] = sMin[0];
    partials[o + 6u] = sMax[0];
    partials[o + 7u] = sUmax[0];
    partials[o + 8u] = sN[0];
    partials[o + 9u] = sBad[0];
    partials[o + 10u] = sDU[0];
    partials[o + 11u] = sU2[0];
    partials[o + 12u] = sLim[0];
  }
}
`.trim();
}
