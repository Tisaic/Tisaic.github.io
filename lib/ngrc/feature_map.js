/**
 * @file Feature-map objects — a small `.expand(z) → number[]` / `.m` / `.prior()`
 * interface over the functional universal map, mirroring the reference
 * `UniversalMap` / `PrunedMap` in `Testing/tests/feature_maps.py`. Consumed by
 * `SoftSensor` (and later the servo blocks). The linear map is simply `null`
 * (the consumer prepends a bias) — no object needed.
 */
import {
  universalParams, universalExpand, universalExpandPruned, universalPrior, universalPriorPruned,
} from './universal.js';

/**
 * @typedef {Object} FeatureMap
 * @property {'universal'|'pruned'} kind
 * @property {number} base base dimension of `z`
 * @property {number} m feature count
 * @property {(z:number[])=>number[]} expand standardized `z` → feature column
 * @property {(opts?:import('./universal.js').PriorOpts)=>number[]} prior structured-prior variances
 */

/**
 * Universal feature map object: `bias + linear + quadratic + ReLU + Fourier`
 * (+ optional reciprocal tail). Random params are drawn once from `seed`.
 * @param {number} base @param {number} nh @param {number} nf @param {number} seed
 * @param {{nRecip?:number, recipEps?:number}} [opts]
 * @returns {FeatureMap & {nh:number, nf:number, seed:number, nRecip:number, recipEps:number, params:import('./universal.js').UniversalParams}}
 */
export function universalMap(base, nh, nf, seed, opts = {}) {
  const nRecip = Math.min(opts.nRecip || 0, base);
  const recipEps = opts.recipEps == null ? 0.25 : opts.recipEps;
  const params = universalParams(base, nh, nf, seed, { nRecip, recipEps });
  const m = 1 + base + Math.floor(base * (base + 1) / 2) + nh + nf + nRecip;
  return {
    kind: 'universal', base, nh, nf, seed, nRecip, recipEps, params, m,
    expand: (z) => universalExpand(z, base, nh, nf, params.Wh, params.bh, params.Wf, params.phf, params.fourScale, { nRecip, recipEps }),
    prior: (po = {}) => universalPrior(base, nh, nf, { ...po, nRecip }),
  };
}

/**
 * Pruned feature map: computes ONLY the kept full-layout indices of a
 * `universalMap`. The lean deployment basis the commissioner selects.
 * @param {ReturnType<typeof universalMap>} uni
 * @param {number[]} kept full-layout indices to keep
 * @returns {FeatureMap & {kept:number[], uni:object}}
 */
export function prunedMap(uni, kept) {
  const keptSorted = [...kept].sort((a, b) => a - b);
  const p = uni.params;
  const opt = { nRecip: uni.nRecip, recipEps: uni.recipEps };
  return {
    kind: 'pruned', base: uni.base, m: keptSorted.length, kept: keptSorted, uni,
    expand: (z) => universalExpandPruned(z, uni.base, uni.nh, uni.nf, p.Wh, p.bh, p.Wf, p.phf, p.fourScale, keptSorted, opt),
    prior: (po = {}) => universalPriorPruned(uni.base, uni.nh, uni.nf, keptSorted, po),
  };
}
