/**
 * @file Universal feature map — JavaScript port of the ST-style flat-array
 * functions in `Testing/tests/feature_maps.py` (the exact spec the ST
 * `TC_NGRC_UniversalInit` / `TC_NGRC_UniversalExpand` mirror, verified equal to
 * the reference `UniversalMap`).
 *
 * The map is `bias + linear + quadratic + ReLU(W_h·z + b_h) + cos(W_f·z + φ_f)`
 * (+ optional protected-reciprocal tail), all linear in the readout weights so
 * the RLS engine is unchanged. Random projection parameters come from a portable
 * LCG so they reproduce exactly on the PLC.
 *
 * Standardize inputs (~unit variance per channel) before expanding: the random
 * weights `~ N(0, 1/base)` then put pre-activations on an O(1) scale with no
 * per-system tuning.
 */

const HUGE = 1.0e30;
const TWO_PI = 2.0 * Math.PI;

/** Sanitize a non-finite / overflowing pre-activation to 0. @param {number} x @returns {number} */
export function fin(x) { return (x === x && x > -HUGE && x < HUGE) ? x : 0.0; }

/**
 * Portable LCG (Numerical Recipes) + Box-Muller Gaussian. 32-bit wrapping
 * multiply (via `Math.imul`) so draws reproduce exactly in Structured Text.
 * Draw order is fixed and mirrored by the ST FeatureInit.
 */
export class LCG {
  /** @param {number} seed */
  constructor(seed) { this.s = seed >>> 0; }

  /** @returns {number} uniform in [0, 1) */
  uniform() {
    this.s = (Math.imul(1664525, this.s) + 1013904223) >>> 0;
    return this.s / 4294967296.0;
  }

  /** @returns {number} standard-normal draw (Box-Muller) */
  gauss() {
    let u1 = this.uniform();
    if (u1 < 1.0e-12) u1 = 1.0e-12;
    const u2 = this.uniform();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(TWO_PI * u2);
  }
}

/** @typedef {{lin?:number, quad?:number, rand?:number, nRecip?:number, recip?:number}} PriorOpts */
/** @typedef {{Wh:number[], bh:number[], Wf:number[], phf:number[], fourScale:number, prior:number[]}} UniversalParams */

/**
 * Generate the flat universal-map parameters + structured-prior vector.
 * Mirrors `universal_params_ststyle` (the ST `TC_NGRC_UniversalInit`).
 * Draw order (must match ST): hinge layer `W_h` (row-major) → `nh` discarded
 * phases → `bh` biases; then a fresh LCG(seed+1): Fourier `W_f` → `phf` phases →
 * `nf` discarded biases.
 *
 * @param {number} base base dimension (length of `z`)
 * @param {number} nh number of ReLU hinge features
 * @param {number} nf number of Fourier features
 * @param {number} seed
 * @param {PriorOpts} [opts]
 * @returns {UniversalParams}
 */
export function universalParams(base, nh, nf, seed, opts = {}) {
  const { lin = 100.0, quad = 1.0, rand = 0.001, nRecip = 0, recip = 1.0 } = opts;
  const sc = 1.0 / Math.sqrt(base);
  const Wh = [], bh = [], Wf = [], phf = [];
  let rng = new LCG(seed); // hinge layer
  for (let i = 0; i < nh * base; i++) Wh.push(rng.gauss() * sc);
  for (let i = 0; i < nh; i++) rng.uniform();       // phases (drawn, discarded)
  for (let i = 0; i < nh; i++) bh.push(rng.gauss()); // biases (used)
  rng = new LCG((seed + 1) >>> 0); // fourier layer
  for (let i = 0; i < nf * base; i++) Wf.push(rng.gauss() * sc);
  for (let i = 0; i < nf; i++) phf.push(rng.uniform() * TWO_PI); // phases (used)
  for (let i = 0; i < nf; i++) rng.gauss();          // biases (drawn, discarded)
  const quadLen = Math.floor(base * (base + 1) / 2);
  const prior = [];
  for (let i = 0; i < 1 + base; i++) prior.push(lin);
  for (let i = 0; i < quadLen; i++) prior.push(quad);
  for (let i = 0; i < nh + nf; i++) prior.push(rand);
  const nr = Math.min(nRecip, base);
  for (let i = 0; i < nr; i++) prior.push(recip);
  return { Wh, bh, Wf, phf, fourScale: Math.sqrt(2.0 / nf), prior };
}

/**
 * Full universal expansion of a standardized lag column `z` (length `base`).
 * Mirrors `universal_expand_ststyle` (the ST `TC_NGRC_UniversalExpand`). Every
 * feature is sanitized (NaN/inf/overflow → 0).
 *
 * @param {number[]} z standardized inputs, length `base`
 * @param {number} base @param {number} nh @param {number} nf
 * @param {number[]} Wh @param {number[]} bh @param {number[]} Wf @param {number[]} phf
 * @param {number} fourScale
 * @param {{nRecip?:number, recipEps?:number}} [opts]
 * @returns {number[]} the feature column
 */
export function universalExpand(z, base, nh, nf, Wh, bh, Wf, phf, fourScale, opts = {}) {
  const { nRecip = 0, recipEps = 0.25 } = opts;
  const out = [1.0];
  for (let j = 0; j < base; j++) out.push(z[j]);
  for (let i = 0; i < base; i++) for (let j = i; j < base; j++) out.push(z[i] * z[j]);
  for (let h = 0; h < nh; h++) {
    let s = bh[h];
    for (let j = 0; j < base; j++) s += Wh[h * base + j] * z[j];
    s = fin(s);
    out.push(s > 0.0 ? s : 0.0);
  }
  for (let f = 0; f < nf; f++) {
    let s = phf[f];
    for (let j = 0; j < base; j++) s += Wf[f * base + j] * z[j];
    out.push(fourScale * Math.cos(fin(s)));
  }
  const nr = Math.min(nRecip, base);
  for (let k = 0; k < nr; k++) out.push(z[k] / (z[k] * z[k] + recipEps));
  return out.map(fin);
}

/**
 * Compute ONE feature of the flat universal map by its full-layout index.
 * Mirrors `_ststyle_index_value` (the pruned dispatch in `TC_NGRC_UniversalExpand`).
 * @returns {number}
 */
function ststyleIndexValue(idx, z, base, nh, nf, Wh, bh, Wf, phf, fourScale, nRecip, recipEps) {
  const nquad = Math.floor(base * (base + 1) / 2);
  const h0 = 1 + base + nquad;
  const f0 = h0 + nh;
  const r0 = f0 + nf;
  if (idx === 0) return 1.0;
  if (idx <= base) return fin(z[idx - 1]);
  if (idx < h0) {
    let q = idx - (1 + base);
    let ii = 0, rem = q;
    while (rem >= (base - ii)) { rem -= (base - ii); ii++; }
    const jj = ii + rem;
    return fin(z[ii] * z[jj]);
  }
  if (idx < f0) {
    const h = idx - h0;
    let s = bh[h];
    for (let j = 0; j < base; j++) s += Wh[h * base + j] * z[j];
    s = fin(s);
    return s > 0.0 ? s : 0.0;
  }
  if (idx < r0) {
    const f = idx - f0;
    let s = phf[f];
    for (let j = 0; j < base; j++) s += Wf[f * base + j] * z[j];
    return fin(fourScale * Math.cos(fin(s)));
  }
  const k = idx - r0;
  return fin(z[k] / (z[k] * z[k] + recipEps));
}

/**
 * Pruned expansion: compute ONLY the kept full-layout indices, in kept order.
 * Mirrors `universal_expand_pruned_ststyle`.
 * @param {number[]} kept full-layout indices to keep
 * @returns {number[]}
 */
export function universalExpandPruned(z, base, nh, nf, Wh, bh, Wf, phf, fourScale, kept, opts = {}) {
  const { nRecip = 0, recipEps = 0.25 } = opts;
  return kept.map((idx) => ststyleIndexValue(idx, z, base, nh, nf, Wh, bh, Wf, phf, fourScale, nRecip, recipEps));
}

/**
 * Structured-prior variance for ONLY the kept indices, in kept order.
 * Mirrors `universal_prior_pruned_ststyle`.
 * @param {number[]} kept
 * @param {PriorOpts} [opts]
 * @returns {number[]}
 */
export function universalPriorPruned(base, nh, nf, kept, opts = {}) {
  const { lin = 100.0, quad = 1.0, rand = 0.001, recip = 1.0 } = opts;
  const nquad = Math.floor(base * (base + 1) / 2);
  const h0 = 1 + base + nquad;
  const r0 = h0 + nh + nf;
  return kept.map((idx) => {
    if (idx <= base) return lin;
    if (idx < h0) return quad;
    if (idx < r0) return rand;
    return recip;
  });
}
