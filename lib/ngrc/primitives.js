/**
 * @file NGRC core primitives — JavaScript port of the TC_NGRC low-level
 * functions. Ported from the Python reference `Testing/ngrc_ref/primitives.py`
 * (itself a mirror of the IEC 61131 ST library), and validated against golden
 * vectors generated from that reference (see `test/ngrc/`).
 *
 * Memory convention (matches the ST `Types.typ`): a "block" is a row-major
 * matrix carrying a Row/Col header. Feature vectors are columns `[n x 1]`,
 * `Theta` is `[n x 1]`, `P` is `[n x n]`. `Block.m` is the flat row-major data,
 * exactly mirroring the `[Row][Col][data...]` layout the ST reads.
 *
 * Numeric note: ST `LREAL` is IEEE-754 float64, which is exactly the JS
 * `number` type, and every function mirrors the reference's operation order, so
 * results match the reference bit-for-bit.
 */

/** A row-major matrix block with a Row/Col header. */
export class Block {
  /**
   * @param {number} rows
   * @param {number} cols
   * @param {number[]|Float64Array} [data] flat row-major data; zero-filled if omitted
   */
  constructor(rows, cols, data) {
    this.rows = rows;
    this.cols = cols;
    /** @type {number[]} */
    this.m = data == null ? new Array(rows * cols).fill(0) : Array.from(data);
  }

  /** @param {number} i @param {number} j @returns {number} */
  get(i, j) { return this.m[i * this.cols + j]; }

  /** @param {number} i @param {number} j @param {number} v */
  set(i, j, v) { this.m[i * this.cols + j] = v; }

  /** @returns {Block} a deep copy */
  copy() { return new Block(this.rows, this.cols, this.m); }
}

/**
 * `TC_NGRC_BuildLagsStride` — gather lag features from per-variable history.
 *
 * Output column `[(numVars+numInputs)*lagOrder x 1]`, variable-major:
 *   `out[v*lagOrder + l]              = output_v[l*stride]`
 *   `out[(numVars+u)*lagOrder + l]    = input_u[l*stride]`
 *
 * @param {Block[]} histories per-output history blocks `[depth x 1]`, index 0 = newest
 * @param {number} lagOrder
 * @param {number} numVars
 * @param {number} stride
 * @param {Block[]|null} [inHistories] optional exogenous input histories (NARX)
 * @param {number} [numInputs]
 * @returns {Block|null} the lag column, or null on a too-small buffer
 */
export function buildLagsStride(histories, lagOrder, numVars, stride, inHistories = null, numInputs = 0) {
  if (stride < 1) stride = 1;
  const need = (lagOrder - 1) * stride + 1;
  for (let v = 0; v < numVars; v++) {
    const h = histories[v];
    if (h.cols !== 1 || h.rows < need) return null; // buffer too small
  }
  if (numInputs > 0) {
    for (let u = 0; u < numInputs; u++) {
      const h = inHistories[u];
      if (h.cols !== 1 || h.rows < need) return null;
    }
  }
  const out = new Block((numVars + numInputs) * lagOrder, 1);
  let idx = 0;
  for (let v = 0; v < numVars; v++) {
    const hv = histories[v];
    for (let l = 0; l < lagOrder; l++) { out.m[idx] = hv.m[l * stride]; idx++; }
  }
  for (let u = 0; u < numInputs; u++) {
    const hu = inHistories[u];
    for (let l = 0; l < lagOrder; l++) { out.m[idx] = hu.m[l * stride]; idx++; }
  }
  return out;
}

/**
 * `TC_NGRC_PolyExpand` — polynomial expansion of a column `[n x 1] -> [m x 1]`.
 * Linear terms, then quadratic (`i<=j`), then cubic (`i<=j<=k`), matching the ST
 * append order exactly.
 *
 * @param {Block} x column vector `[n x 1]`
 * @param {number} order 1, 2, or 3
 * @returns {Block|null}
 */
export function polyExpand(x, order) {
  const n = x.rows;
  if (n === 0 || x.cols !== 1) return null;
  if (order < 1 || order > 3) return null;
  const out = [];
  for (let i = 0; i < n; i++) out.push(x.m[i]);
  if (order >= 2) {
    for (let i = 0; i < n; i++) {
      const xi = x.m[i];
      for (let j = i; j < n; j++) out.push(xi * x.m[j]);
    }
  }
  if (order === 3) {
    for (let i = 0; i < n; i++) {
      const xi = x.m[i];
      for (let j = i; j < n; j++) {
        const xij = xi * x.m[j];
        for (let k = j; k < n; k++) out.push(xij * x.m[k]);
      }
    }
  }
  return new Block(out.length, 1, out);
}

/**
 * `TC_NGRC_AddBias` — prepend a constant `1.0` -> `[(n+1) x 1]`.
 * @param {Block} x column vector `[n x 1]`
 * @returns {Block|null}
 */
export function addBias(x) {
  if (x.rows === 0 || x.cols !== 1) return null;
  return new Block(x.rows + 1, 1, [1.0, ...x.m]);
}

/**
 * `TC_NGRC_Predict` — dot(x, theta), both `[n x 1]` -> scalar.
 * @param {Block} x @param {Block} theta
 * @returns {number|null}
 */
export function predict(x, theta) {
  if (x.rows !== theta.rows || x.cols !== 1 || theta.cols !== 1) return null;
  let s = 0.0;
  for (let i = 0; i < x.rows; i++) s += x.m[i] * theta.m[i];
  return s;
}

/**
 * `TC_NGRC_RLS_Init` — `Theta := 0`, `P := diag(initVariance)`.
 * @param {number} n
 * @param {number|number[]} initVariance scalar (`P := initVariance*I`) or a
 *   per-feature array (structured prior: `1/initVariance[i]` is the ridge on feature i)
 * @returns {{theta: Block, P: Block}}
 */
export function rlsInit(n, initVariance) {
  const theta = new Block(n, 1);
  const P = new Block(n, n);
  if (Array.isArray(initVariance)) {
    for (let i = 0; i < n; i++) P.set(i, i, initVariance[i]);
  } else {
    for (let i = 0; i < n; i++) P.set(i, i, initVariance);
  }
  return { theta, P };
}

/**
 * `TC_NGRC_RLS` — one RLS update, in place. Mirrors the reference exactly:
 *   `g = P x`, `r = x' g` (= x'Px, the innovation variance), `e = y - x' theta`.
 *
 * Scalar exponential forgetting (default): `denom = lambda + r`;
 *   `theta += (g/denom) e`; `P = (P - g g'/denom)/lambda`.
 * Directional forgetting (`directional=true`): forget only along the excited
 *   direction so a loss of excitation can't wind the covariance up:
 *   `denom = 1 + r`; `theta += (g/denom) e`;
 *   `P = P - g g'/denom + ((1-lambda)/lambda / r) g g'` (last term only if r>0).
 * If `maxCovTrace > 0` and `trace(P)` exceeds it after the update, `P` is scaled
 * down to that trace (scalar mode).
 *
 * @param {Block} theta `[n x 1]`, updated in place
 * @param {Block} P `[n x n]`, updated in place (kept symmetric)
 * @param {Block} x feature column `[n x 1]`
 * @param {number} y target
 * @param {number} lam forgetting factor in (0, 1]
 * @param {number} [maxCovTrace]
 * @param {boolean} [directional]
 * @returns {{ok: boolean, innovVar: number}} `innovVar = x'Px`; `{false, 0}` on error
 */
export function rls(theta, P, x, y, lam, maxCovTrace = 0.0, directional = false) {
  const n = theta.rows;
  if (!(x.rows === n && x.cols === 1 && P.rows === n && P.cols === n)) return { ok: false, innovVar: 0.0 };
  if (lam <= 0.0 || lam > 1.0) return { ok: false, innovVar: 0.0 };

  const Pm = P.m;
  const g = new Array(n).fill(0.0);
  let r = 0.0;
  for (let i = 0; i < n; i++) {
    let acc = 0.0;
    const base = i * n;
    for (let j = 0; j < n; j++) acc += Pm[base + j] * x.m[j];
    g[i] = acc;
    r += x.m[i] * acc;
  }

  const denom = directional ? (1.0 + r) : (lam + r);
  if (Math.abs(denom) < 1.0e-12) return { ok: false, innovVar: 0.0 };
  const innovVar = r;

  let e = y;
  for (let i = 0; i < n; i++) e -= x.m[i] * theta.m[i];
  for (let i = 0; i < n; i++) theta.m[i] += (g[i] / denom) * e;

  if (directional) {
    const inflate = r > 1.0e-9 ? ((1.0 - lam) / lam / r) : 0.0;
    for (let i = 0; i < n; i++) {
      const gi = g[i];
      const rowi = i * n;
      for (let j = i; j < n; j++) {
        const newP = Pm[rowi + j] - gi * g[j] / denom + inflate * gi * g[j];
        Pm[rowi + j] = newP;
        if (j > i) Pm[j * n + i] = newP;
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const gi = g[i];
      const rowi = i * n;
      for (let j = i; j < n; j++) {
        const newP = (Pm[rowi + j] - gi * g[j] / denom) / lam;
        Pm[rowi + j] = newP;
        if (j > i) Pm[j * n + i] = newP;
      }
    }
  }

  if (maxCovTrace > 0.0) {
    let tr = 0.0;
    for (let i = 0; i < n; i++) tr += Pm[i * n + i];
    if (tr > maxCovTrace) {
      const sc = maxCovTrace / tr;
      for (let k = 0; k < n * n; k++) Pm[k] *= sc;
    }
  }

  return { ok: true, innovVar };
}

/**
 * `TC_NGRC_RollingUpdate` — push into `[n x 1]`; index 0 = most recent.
 * @param {Block} buf @param {number} newValue
 * @returns {boolean}
 */
export function rollingUpdate(buf, newValue) {
  if (buf.rows === 0 || buf.cols !== 1) return false;
  for (let i = buf.rows - 1; i > 0; i--) buf.m[i] = buf.m[i - 1];
  buf.m[0] = newValue;
  return true;
}

/**
 * `TC_NGRC_RMSE` — RMSE between two equally shaped blocks (`-1` on error).
 * @param {Block} a @param {Block} b
 * @returns {number}
 */
export function rmse(a, b) {
  if (a.rows !== b.rows || a.cols !== b.cols || a.rows === 0) return -1.0;
  const n = a.rows * a.cols;
  let s = 0.0;
  for (let i = 0; i < n; i++) { const d = a.m[i] - b.m[i]; s += d * d; }
  return Math.sqrt(s / n);
}

/**
 * `TC_NGRC_CalcMem` — design-time feature/sizing calculator.
 * @param {number} numVars
 * @param {number} lagOrder
 * @param {number} polyOrder
 * @param {boolean} useBias
 * @param {number} [stride]
 * @param {number} [numInputs]
 * @returns {{baseDim:number, numFeatures:number, historyDepth:number, thetaSize:number, pSize:number}}
 */
export function calcMem(numVars, lagOrder, polyOrder, useBias, stride = 1, numInputs = 0) {
  if (stride < 1) stride = 1;
  const base = (numVars + numInputs) * lagOrder;
  let nf;
  if (polyOrder === 1) {
    nf = base;
  } else if (polyOrder === 2) {
    nf = base + Math.floor(base * (base + 1) / 2);
  } else {
    nf = base + Math.floor(base * (base + 1) / 2) + Math.floor(base * (base + 1) * (base + 2) / 6);
  }
  if (useBias) nf += 1;
  const historyDepth = (lagOrder - 1) * stride + 1;
  return { baseDim: base, numFeatures: nf, historyDepth, thetaSize: nf, pSize: nf * nf };
}
