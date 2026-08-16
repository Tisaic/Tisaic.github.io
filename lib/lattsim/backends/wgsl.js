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

struct Params {
  omega        : f32,        // 1 / tau
  forcePre     : f32,        // 1 - 1/(2 tau)
  force        : vec3<f32>,
  inletVel     : vec3<f32>,
  _pad         : vec2<f32>,
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

@compute @workgroup_size(${workgroup[0]}, ${workgroup[1]}, ${workgroup[2]})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= NCELL) { return; }
  let p = cellCoord(i);
  let ctype = flags[i];

  if (ctype == CELL_SOLID) {
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
      if (flags[si] == CELL_SOLID) { fi[q] = src[OPP[q] * NCELL + i]; }
      else                         { fi[q] = src[q * NCELL + si]; }
    }
  }

  // ---- moments
  var rho : f32 = 0.0;
  var mom : vec3<f32> = vec3<f32>(0.0);
  for (var q : u32 = 0u; q < Q; q = q + 1u) {
    rho = rho + fi[q];
    mom = mom + fi[q] * vec3<f32>(CV[q]);
  }
  var u = mom / rho;
  u = u + 0.5 * params.force / rho;            // Guo: half the force shifts u

  let driven = (ctype == CELL_INLET) || (ctype == CELL_MOVING);
  if (driven) { u = params.inletVel; }

  // ---- collide (BGK) + Guo forcing
  let uu = dot(u, u);
  for (var q : u32 = 0u; q < Q; q = q + 1u) {
    let c = vec3<f32>(CV[q]);
    let cu = dot(c, u);
    let eq = WT[q] * rho * (1.0 + INV_CS2 * cu + INV_2CS4 * cu * cu - 1.5 * uu);
    var v : f32;
    if (driven) {
      v = eq;
    } else {
      v = fi[q] + params.omega * (eq - fi[q]);
      let g = INV_CS2 * (c - u) + (INV_CS2 * INV_CS2) * cu * c;
      v = v + params.forcePre * WT[q] * dot(g, params.force);
    }
    dst[q * NCELL + i] = v;
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
    rho = 1.0;
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
  if (ctype == CELL_INLET || ctype == CELL_MOVING) { u = params.inletVel; }
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

/**
 * Diagnostic reduction: one workgroup produces one partial sum, the host adds
 * the partials. Deliberately a compute pass rather than a readback of the whole
 * mac field -- reading 4 floats per cell back to JavaScript every time the
 * stats refresh would be exactly the transfer this architecture exists to
 * avoid.
 *
 * Layout of each partial: [mass, px, py, pz, ke, rhoMin, rhoMax, uMaxSq,
 * fluidCells, nonFinite].
 */
export const REDUCE_STRIDE = 10;
export function reduceWGSL(lattice, { workgroup = 64 } = {}) {
  return `
${prelude(lattice)}

@group(0) @binding(0) var<storage, read>       mac    : array<f32>;
@group(0) @binding(1) var<storage, read>       flags    : array<u32>;
@group(0) @binding(2) var<storage, read_write> partials : array<f32>;

var<workgroup> sMass : array<f32, ${workgroup}>;
var<workgroup> sMom  : array<vec3<f32>, ${workgroup}>;
var<workgroup> sKe   : array<f32, ${workgroup}>;
var<workgroup> sMin  : array<f32, ${workgroup}>;
var<workgroup> sMax  : array<f32, ${workgroup}>;
var<workgroup> sUmax : array<f32, ${workgroup}>;
var<workgroup> sN    : array<f32, ${workgroup}>;
var<workgroup> sBad  : array<f32, ${workgroup}>;

@compute @workgroup_size(${workgroup}, 1, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>,
        @builtin(local_invocation_id)  lid : vec3<u32>,
        @builtin(workgroup_id)         wid : vec3<u32>) {
  let t = lid.x;
  let i = gid.x;
  var mass = 0.0; var mom = vec3<f32>(0.0); var ke = 0.0;
  var lo = 1e30; var hi = -1e30; var um = 0.0; var n = 0.0; var bad = 0.0;

  if (i < NCELL && flags[i] != CELL_SOLID) {
    let rho = mac[i];
    let u = vec3<f32>(mac[NCELL + i], mac[2u * NCELL + i], mac[3u * NCELL + i]);
    let ok = (rho == rho) && (u.x == u.x) && (u.y == u.y) && (u.z == u.z)
             && abs(rho) < 1e30 && abs(u.x) < 1e30 && abs(u.y) < 1e30 && abs(u.z) < 1e30;
    if (ok) {
      n = 1.0; mass = rho; mom = rho * u; ke = 0.5 * rho * dot(u, u);
      lo = rho; hi = rho; um = dot(u, u);
    } else {
      bad = 1.0;
    }
  }

  sMass[t] = mass; sMom[t] = mom; sKe[t] = ke;
  sMin[t] = lo; sMax[t] = hi; sUmax[t] = um; sN[t] = n; sBad[t] = bad;
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
  }
}
`.trim();
}
