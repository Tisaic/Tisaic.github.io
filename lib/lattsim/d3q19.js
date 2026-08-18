// D3Q19 velocity set — the single source of truth for the lattice stencil.
//
// EVERY backend reads its constants from here: the CPU reference imports them
// directly, and the WGSL generator emits them into shader source. That is the
// point of this file. Two implementations of the same physics drift apart the
// moment they each carry their own copy of the weights, and the drift shows up
// as a plausible-looking wrong answer rather than an error.
//
// Convention (used identically in JS, WGSL, boundaries and rendering):
//
//   index = x + Nx * (y + Ny * z)
//
// so x is the fastest-varying axis. Distributions are stored STRUCTURE OF
// ARRAYS — f[q * cellCount + index] — because that is what gives coalesced
// access on the GPU: adjacent threads (adjacent x) touch adjacent memory.

export const Q = 19;

/** Discrete velocities c_q, in lattice units (integers). q=0 is rest. */
export const C = Object.freeze([
  [0, 0, 0],
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0],
  [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1],
  [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1],
].map(Object.freeze));

/** Lattice weights w_q. Sum to 1; second moment is cs^2 * I. */
const W0 = 1 / 3, W1 = 1 / 18, W2 = 1 / 36;
export const W = Object.freeze([
  W0,
  W1, W1, W1, W1, W1, W1,
  W2, W2, W2, W2, W2, W2, W2, W2, W2, W2, W2, W2,
]);

/** Lattice speed of sound squared, cs^2 = 1/3 in lattice units. */
export const CS2 = 1 / 3;
export const INV_CS2 = 3;
export const INV_2CS4 = 4.5;      // 1 / (2 * cs^4)

/** opposite[q] is the index of -c_q. Bounce-back is a lookup through this. */
export const OPP = Object.freeze(C.map((c) => {
  const i = C.findIndex((d) => d[0] === -c[0] && d[1] === -c[1] && d[2] === -c[2]);
  if (i < 0) throw new Error('D3Q19 velocity set is not symmetric at q=' + c);
  return i;
}));

/**
 * Equilibrium distribution, the second-order Hermite expansion of a Maxwellian:
 *   feq_q = w_q rho [ 1 + (c.u)/cs^2 + (c.u)^2/(2 cs^4) - u.u/(2 cs^2) ]
 * Written out rather than looped because both backends need it inlined.
 */
export function feq(q, rho, ux, uy, uz) {
  const c = C[q];
  const cu = c[0] * ux + c[1] * uy + c[2] * uz;
  const uu = ux * ux + uy * uy + uz * uz;
  return W[q] * rho * (1 + INV_CS2 * cu + INV_2CS4 * cu * cu - 1.5 * uu);
}

/**
 * Excess pressure psi = p(rho) - rho*cs^2, the potential whose NEGATIVE GRADIENT
 * is the equation-of-state force. Zero for the ideal isothermal gas, so an ideal
 * run adds no force and is byte-identical to a run without this at all.
 *
 *   ideal      p = rho*cs^2            -> psi = 0
 *   linear     p = rho*csEff^2         -> psi = rho*(csEff^2 - cs^2)
 *   quadratic  p = rho*cs^2 + a*rho^2  -> psi = a*rho^2
 *
 * The effective sound speed is sqrt(dp/drho): sqrt(csEff^2) for linear,
 * sqrt(cs^2 + 2*a*rho) for quadratic. A pressure PULSE propagates at that speed,
 * which is the analytic check the test suite runs.
 */
export function psiExcess(eos, rho, csEff2, a) {
  if (eos === 'linear') return rho * (csEff2 - CS2);
  if (eos === 'quadratic') return a * rho * rho;
  return 0;
}

/**
 * Isotropic gradient stencil weight: grad_alpha f = (1/cs^2) sum_q w_q c_q,alpha
 * f(x + c_q). Returns (1/cs^2) w_q c_q as [gx, gy, gz] per direction, so a caller
 * accumulates gradWeight(q) * f(neighbour_q). This is the standard lattice
 * gradient, isotropic to the order the D3Q19 moments support.
 */
export function gradWeight(q) {
  const c = C[q], wc = INV_CS2 * W[q];
  return [wc * c[0], wc * c[1], wc * c[2]];
}

/**
 * Guo forcing term, so a body force (gravity, a pressure gradient driving a
 * channel) enters at second order rather than being bolted on:
 *   F_q = (1 - 1/(2 tau)) w_q [ (c-u)/cs^2 + (c.u) c/cs^4 ] . F
 */
export function forcing(q, tau, ux, uy, uz, fx, fy, fz) {
  const c = C[q];
  const cu = c[0] * ux + c[1] * uy + c[2] * uz;
  const pre = (1 - 0.5 / tau) * W[q];
  const gx = INV_CS2 * (c[0] - ux) + INV_CS2 * INV_CS2 * cu * c[0];
  const gy = INV_CS2 * (c[1] - uy) + INV_CS2 * INV_CS2 * cu * c[1];
  const gz = INV_CS2 * (c[2] - uz) + INV_CS2 * INV_CS2 * cu * c[2];
  return pre * (gx * fx + gy * fy + gz * fz);
}

/**
 * Moment checks the lattice must satisfy for the Navier-Stokes limit to hold.
 * Exposed (rather than hidden in a test) because a mis-typed weight produces a
 * simulation that runs and looks fine and is wrong -- so the engine states its
 * own isotropy conditions and the test suite asserts them.
 *   sum w        = 1
 *   sum w c      = 0
 *   sum w c(x)c(y) = cs^2 delta
 */
export function momentResiduals() {
  let m0 = 0;
  const m1 = [0, 0, 0];
  const m2 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let q = 0; q < Q; q++) {
    m0 += W[q];
    for (let a = 0; a < 3; a++) {
      m1[a] += W[q] * C[q][a];
      for (let b = 0; b < 3; b++) m2[a][b] += W[q] * C[q][a] * C[q][b];
    }
  }
  let m2err = 0;
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) m2err = Math.max(m2err, Math.abs(m2[a][b] - (a === b ? CS2 : 0)));
  }
  return { mass: Math.abs(m0 - 1), momentum: Math.max(...m1.map(Math.abs)), stress: m2err };
}

/** Emits the velocity set as WGSL constants, so the shader cannot disagree. */
export function wgslConstants() {
  const ci = C.map((c) => `vec3<i32>(${c[0]}, ${c[1]}, ${c[2]})`).join(', ');
  const w = W.map((v) => v.toPrecision(17)).join(', ');
  return `
const Q : u32 = ${Q}u;
const CS2 : f32 = ${CS2.toPrecision(9)};
const INV_CS2 : f32 = ${INV_CS2.toPrecision(9)};
const INV_2CS4 : f32 = ${INV_2CS4.toPrecision(9)};
const CV = array<vec3<i32>, ${Q}>(${ci});
const WT = array<f32, ${Q}>(${w});
const OPP = array<u32, ${Q}>(${OPP.map((o) => o + 'u').join(', ')});
`.trim();
}
