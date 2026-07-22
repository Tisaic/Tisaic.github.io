/**
 * @file AFM feature-selection primitives — JavaScript port of the shared core in
 * `Testing/tests/adaptive_feature_map.py` (the AFM reference). These back the
 * deployable blocks in `afm.js`. Pure, dependency-free, and numerically faithful
 * to the reference (same operation order → bit-for-bit results).
 *
 * A feature matrix `Phi` is `N` rows × `m` columns (row-major `number[][]`);
 * `y` is length `N`; `ridge` is a per-feature regularizer of length `m`.
 * An optional `cost` object `{mac}` mirrors the reference's multiply-accumulate
 * counter; it never affects results.
 */

/** @typedef {{mac:number}} Cost */

/**
 * Solve `(G + diag(ridge)) theta = c` by Gauss-Jordan elimination.
 * @param {number[][]} G `n x n`
 * @param {number[]} c length `n`
 * @param {number[]} ridge length `n`
 * @param {Cost} [cost]
 * @returns {number[]} theta, length `n`
 */
export function solveRidge(G, c, ridge, cost) {
  const n = c.length;
  const A = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) row[j] = G[i][j] + (i === j ? ridge[i] : 0.0);
    A.push(row);
  }
  const b = c.slice();
  for (let k = 0; k < n; k++) {
    let p = A[k][k];
    if (Math.abs(p) < 1e-30) p = 1e-30;
    const inv = 1.0 / p;
    for (let j = k; j < n; j++) A[k][j] *= inv;
    b[k] *= inv;
    for (let i = 0; i < n; i++) {
      if (i !== k) {
        const f = A[i][k];
        if (f !== 0.0) {
          for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
          b[i] -= f * b[k];
          if (cost) cost.mac += (n - k) + 1;
        }
      }
    }
  }
  return b;
}

/**
 * `sum(theta[a] * row[S[a]])` — evaluate a readout over selected columns.
 * @param {number[]} row @param {number[]} S @param {number[]} theta
 * @returns {number}
 */
export function predictRow(row, S, theta) {
  let s = 0.0;
  for (let a = 0; a < S.length; a++) s += theta[a] * row[S[a]];
  return s;
}

/**
 * Build the working-set Gram + cross-correlation over the seed indices, solve,
 * and return `{S, G, c, theta, resid}`. Mirrors `_init_working`.
 * @param {number[][]} Phi @param {number[]} y @param {number[]} ridge
 * @param {number[]} seedIdx @param {Cost} [cost]
 */
export function initWorking(Phi, y, ridge, seedIdx, cost) {
  const N = y.length;
  const S = [...seedIdx];
  const k = S.length;
  const G = Array.from({ length: k }, () => new Array(k).fill(0.0));
  for (let r = 0; r < N; r++) {
    const row = Phi[r];
    for (let a = 0; a < k; a++) {
      const xa = row[S[a]];
      for (let b = a; b < k; b++) G[a][b] += xa * row[S[b]];
    }
    if (cost) cost.mac += (k * (k + 1)) >> 1;
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) G[a][b] = G[b][a];
  const c = new Array(k).fill(0.0);
  for (let r = 0; r < N; r++) for (let a = 0; a < k; a++) c[a] += Phi[r][S[a]] * y[r];
  if (cost) cost.mac += N * k;
  const theta = solveRidge(G, c, S.map((i) => ridge[i]), cost);
  const resid = new Array(N);
  for (let r = 0; r < N; r++) resid[r] = y[r] - predictRow(Phi[r], S, theta);
  if (cost) cost.mac += N * k;
  return { S, G, c, theta, resid };
}

/**
 * Extend the working set with feature `idx`: incremental Gram column, re-solve,
 * new residual. Mutates `S`, `G`, `c` in place. Mirrors `_admit`.
 * @returns {{theta:number[], resid:number[]}}
 */
export function admit(Phi, y, ridge, S, G, c, idx, cost) {
  const N = y.length;
  const k = S.length;
  const newcol = new Array(k).fill(0.0);
  let diag = 0.0, cy = 0.0;
  for (let r = 0; r < N; r++) {
    const x = Phi[r][idx];
    const row = Phi[r];
    for (let a = 0; a < k; a++) newcol[a] += x * row[S[a]];
    diag += x * x; cy += x * y[r];
  }
  if (cost) cost.mac += N * (k + 2);
  for (let a = 0; a < k; a++) G[a].push(newcol[a]);
  G.push([...newcol, diag]);
  c.push(cy);
  S.push(idx);
  const theta = solveRidge(G, c, S.map((i) => ridge[i]), cost);
  const resid = new Array(N);
  for (let r = 0; r < N; r++) resid[r] = y[r] - predictRow(Phi[r], S, theta);
  if (cost) cost.mac += N * S.length;
  return { theta, resid };
}

/**
 * Return the window index most correlated (abs) with the residual — O(N) each.
 * Mirrors `_screen_best`.
 * @returns {number|null}
 */
export function screenBest(Phi, resid, window, cost) {
  const N = resid.length;
  let best = null;
  for (const idx of window) {
    let s = 0.0;
    for (let r = 0; r < N; r++) s += Phi[r][idx] * resid[r];
    if (cost) cost.mac += N;
    const a = Math.abs(s);
    if (best === null || a > best[0]) best = [a, idx];
  }
  return best === null ? null : best[1];
}

/**
 * Held-out nRMSE of the kept readout `(S, theta)` on `(Phi, y)`. Mirrors `eval_nrmse`.
 * @param {number} [skip] leading samples to ignore (warm-up)
 * @returns {number}
 */
export function evalNrmse(Phi, y, S, theta, skip = 0) {
  const N = y.length;
  let m = 0.0;
  for (let r = skip; r < N; r++) m += y[r];
  m /= (N - skip);
  let v = 0.0;
  for (let r = skip; r < N; r++) v += (y[r] - m) ** 2;
  const sd = Math.sqrt(v / (N - skip)) || 1.0;
  let se = 0.0;
  for (let r = skip; r < N; r++) se += (predictRow(Phi[r], S, theta) - y[r]) ** 2;
  return Math.sqrt(se / (N - skip)) / sd;
}

/** RMS of column `idx` of `Phi`. Mirrors `_col_rms`. @returns {number} */
export function colRms(Phi, idx) {
  const N = Phi.length;
  let s = 0.0;
  for (let r = 0; r < N; r++) s += Phi[r][idx] ** 2;
  return Math.sqrt(s / N);
}

/**
 * Per-feature ridge from the structured prior: `1/(initVariance * variance)`
 * (matching the universal map / RLS `P0 = initVariance*diag`). Mirrors `ridge_from_prior`.
 * @param {number[]} variances @param {number} initVariance
 * @returns {number[]}
 */
export function ridgeFromPrior(variances, initVariance) {
  return variances.map((v) => (v > 0 ? 1.0 / (initVariance * v) : 1e12));
}
