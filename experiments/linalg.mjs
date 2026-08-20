// Dense linear algebra for the offline noise experiments ONLY.
//
// Deliberately not in `lib/` -- the shipped estimator is recursive and never
// forms a normal-equation matrix. These routines exist so a batch solve can be
// run at a NEGATIVE ridge, which the online RLS cannot express (a prior variance
// is 1/lambda, so lambda < 0 is not a covariance) and which is the whole point of
// the sign test.

/**
 * Solve A x = b by Gaussian elimination with partial pivoting.
 *
 * NOT Cholesky, on purpose: at a negative ridge `A` is allowed to be indefinite,
 * which is the case the experiment exists to explore, and a Cholesky
 * factorisation would simply fail there and be reported as "the negative side
 * does not work". Returns null if the matrix is numerically singular, so a caller
 * can report the conditioning limit rather than a plausible wrong answer.
 * @param {Float64Array} A row-major n x n @param {Float64Array} B row-major n x k
 * @returns {Float64Array|null} n x k
 */
export function solve(A, B, n, k) {
  const a = Float64Array.from(A), b = Float64Array.from(B);
  for (let c = 0; c < n; c++) {
    let piv = c, best = Math.abs(a[c * n + c]);
    for (let r = c + 1; r < n; r++) {
      const v = Math.abs(a[r * n + c]);
      if (v > best) { best = v; piv = r; }
    }
    if (!(best > 1e-300)) return null;
    if (piv !== c) {
      for (let j = 0; j < n; j++) { const t = a[c * n + j]; a[c * n + j] = a[piv * n + j]; a[piv * n + j] = t; }
      for (let j = 0; j < k; j++) { const t = b[c * k + j]; b[c * k + j] = b[piv * k + j]; b[piv * k + j] = t; }
    }
    const d = a[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const f = a[r * n + c] / d;
      if (f === 0) continue;
      for (let j = c; j < n; j++) a[r * n + j] -= f * a[c * n + j];
      for (let j = 0; j < k; j++) b[r * k + j] -= f * b[c * k + j];
    }
  }
  for (let c = n - 1; c >= 0; c--) {
    const d = a[c * n + c];
    for (let j = 0; j < k; j++) {
      let s = b[c * k + j];
      for (let r = c + 1; r < n; r++) s -= a[c * n + r] * b[r * k + j];
      b[c * k + j] = s / d;
    }
  }
  return b;
}

/**
 * Eigen-decomposition of a symmetric matrix by cyclic Jacobi rotations.
 * @returns {{values: Float64Array, vectors: Float64Array}} descending; column j
 *   of `vectors` (i.e. `vectors[i*n+j]`) is eigenvector j.
 */
export function symEig(M, n, sweeps = 60) {
  const a = Float64Array.from(M);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let s = 0; s < sweeps; s++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), sn = t * c;
        for (let i = 0; i < n; i++) {
          const aip = a[i * n + p], aiq = a[i * n + q];
          a[i * n + p] = c * aip - sn * aiq; a[i * n + q] = sn * aip + c * aiq;
        }
        for (let i = 0; i < n; i++) {
          const api = a[p * n + i], aqi = a[q * n + i];
          a[p * n + i] = c * api - sn * aqi; a[q * n + i] = sn * api + c * aqi;
        }
        for (let i = 0; i < n; i++) {
          const vip = v[i * n + p], viq = v[i * n + q];
          v[i * n + p] = c * vip - sn * viq; v[i * n + q] = sn * vip + c * viq;
        }
      }
    }
  }
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = a[i * n + i];
  const order = [...values.keys()].sort((i, j) => values[j] - values[i]);
  const ev = new Float64Array(n), vec = new Float64Array(n * n);
  order.forEach((src, dst) => {
    ev[dst] = values[src];
    for (let i = 0; i < n; i++) vec[i * n + dst] = v[i * n + src];
  });
  return { values: ev, vectors: vec };
}
