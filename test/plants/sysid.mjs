/**
 * @file Identify a plant from a real machine's record, and run the identified model as a plant.
 *
 * A model is fitted on the record's ESTIMATION cut and chosen by FREE-RUN simulation on a
 * VALIDATION cut it never saw. A one-step predictor is given the true previous output at every
 * sample and so scores well on any smooth record; a free run is given only its own past, so only
 * the identified dynamics carry it. Among candidates within 5% of the best free-run score the one
 * with the fewest parameters is taken.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RECORDS = join(HERE, 'records');

/** Whitespace-delimited numeric columns, one row per line. `skip` drops leading columns. */
function readCols(file, skip = 0) {
  const rows = readFileSync(join(RECORDS, file), 'utf8').trim().split('\n')
    .map((l) => l.trim().split(/[\s,]+/).map(Number));
  const nc = rows[0].length;
  const cols = [];
  for (let c = skip; c < nc; c++) cols.push(Float64Array.from(rows, (r) => r[c]));
  return cols;
}
/** A quoted-header CSV, returned as a map of column name to Float64Array. */
function readCsv(file) {
  const lines = readFileSync(join(RECORDS, file), 'utf8').trim().split('\n');
  const head = lines[0].split(',').map((s) => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
  const out = {};
  head.forEach((h, i) => {
    const v = [];
    for (let r = 1; r < lines.length; r++) {
      const cell = lines[r].split(',')[i];
      if (cell === undefined || cell.trim() === '') continue;
      v.push(Number(cell));
    }
    out[h] = Float64Array.from(v);
  });
  return out;
}

// ------------------------------------------------------------------ the linear algebra
/**
 * Ridge normal equations by Cholesky, solved in COLUMN-SCALED space. The scaling is not
 * cosmetic: a regressor set mixing a level in metres with a voltage is collinear by
 * construction, and an absolute ridge against it is a different prior on every column
 * (rule 32 — a prior must be scaled to the quantity it acts on).
 */
function ridgeSolve(X, y, lam) {
  const n = X.length, p = X[0].length;
  const sc = new Float64Array(p);
  for (let j = 0; j < p; j++) {
    let s = 0; for (let i = 0; i < n; i++) s += X[i][j] * X[i][j];
    sc[j] = Math.sqrt(s / n) || 1;
  }
  const A = Array.from({ length: p }, () => new Float64Array(p));
  const b = new Float64Array(p);
  for (let i = 0; i < n; i++) {
    const r = X[i];
    for (let j = 0; j < p; j++) {
      const rj = r[j] / sc[j];
      b[j] += rj * y[i];
      for (let k = j; k < p; k++) A[j][k] += rj * (r[k] / sc[k]);
    }
  }
  for (let j = 0; j < p; j++) { A[j][j] += lam * n; for (let k = 0; k < j; k++) A[j][k] = A[k][j]; }
  // Cholesky
  const L = Array.from({ length: p }, () => new Float64Array(p));
  for (let j = 0; j < p; j++) {
    let d = A[j][j];
    for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
    if (!(d > 0)) return null;                       // not positive definite — refuse
    L[j][j] = Math.sqrt(d);
    for (let i = j + 1; i < p; i++) {
      let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = s / L[j][j];
    }
  }
  const z = new Float64Array(p), th = new Float64Array(p);
  for (let i = 0; i < p; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; }
  for (let i = p - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < p; k++) s -= L[k][i] * th[k]; th[i] = s / L[i][i]; }
  for (let j = 0; j < p; j++) th[j] /= sc[j];
  return th;
}

// ------------------------------------------------------------------------ the model
/**
 * The regressor row at step k. `na` lags of y, `nb` lags of u from delay `nk`, a constant,
 * and whatever the PLANT'S OWN documented nonlinearity contributes through `lift` — which
 * is declared per plant and never guessed here, because a generic high-order lift is how a
 * fit buys its validation score by memorising (rules 36, 41b).
 */
function row(yl, ul, lift) {
  const r = [];
  for (const v of yl) r.push(v);
  for (const v of ul) r.push(v);
  r.push(1);
  if (lift) for (const v of lift(yl, ul)) r.push(v);
  return r;
}
function nFeat(na, nb, lift) {
  return row(new Array(na).fill(0), new Array(nb).fill(0), lift).length;
}

/** One-step regressors over a record, for the fit. */
function build(u, y, na, nb, nk, lift) {
  const k0 = Math.max(na, nb + nk - 1);
  const X = [], t = [];
  for (let k = k0; k < y.length; k++) {
    const yl = []; for (let i = 1; i <= na; i++) yl.push(y[k - i]);
    const ul = []; for (let j = 0; j < nb; j++) ul.push(u[k - nk - j]);
    X.push(row(yl, ul, lift)); t.push(y[k]);
  }
  return { X, t, k0 };
}

/**
 * FREE RUN. Seeded with the record's own first `k0` outputs and then fed nothing but its
 * own past. `bound` refuses a trajectory that leaves a stated multiple of the record's own
 * range — a diverging free run is a model that cannot be a plant, and reporting its NRMSE
 * as a large number rather than as a refusal would rank it against models that are merely
 * mediocre.
 */
function simulate(m, u, ySeed, n, bound = 50) {
  const { na, nb, nk, lift, th } = m;
  const k0 = Math.max(na, nb + nk - 1);
  const y = new Float64Array(n);
  for (let k = 0; k < Math.min(k0, n); k++) y[k] = ySeed[k];
  let lo = Infinity, hi = -Infinity;
  for (const v of ySeed) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const mid = 0.5 * (lo + hi), half = Math.max(1e-12, 0.5 * (hi - lo)) * bound;
  for (let k = k0; k < n; k++) {
    const yl = []; for (let i = 1; i <= na; i++) yl.push(y[k - i]);
    const ul = []; for (let j = 0; j < nb; j++) ul.push(u[k - nk - j] ?? 0);
    const r = row(yl, ul, lift);
    let s = 0; for (let j = 0; j < r.length; j++) s += r[j] * th[j];
    if (!isFinite(s) || Math.abs(s - mid) > half) return null;   // diverged
    y[k] = s;
  }
  return y;
}

/** Normalised rms error, as a PERCENTAGE of the record's own standard deviation. */
function nrmse(y, yhat, from = 0) {
  let m = 0, n = 0;
  for (let k = from; k < y.length; k++) { m += y[k]; n++; }
  m /= n;
  let se = 0, sv = 0;
  for (let k = from; k < y.length; k++) { se += (y[k] - yhat[k]) ** 2; sv += (y[k] - m) ** 2; }
  return 100 * Math.sqrt(se / sv);
}

/**
 * IDENTIFY. Sweeps the order grid, fits each on the estimation cut, scores each by FREE RUN
 * on the validation cut, and returns the cheapest candidate within 5% of the best measured
 * score (rule 42). The report carries every candidate, so a reader can see what the choice
 * cost rather than only what it chose.
 */
function identify({ uEst, yEst, uVal, yVal, lift = null, nas, nbs, nks = [1], lams = [1e-8] }) {
  const cands = [];
  for (const na of nas) for (const nb of nbs) for (const nk of nks) for (const lam of lams) {
    const { X, t } = build(uEst, yEst, na, nb, nk, lift);
    const th = ridgeSolve(X, t, lam);
    if (!th) continue;
    const m = { na, nb, nk, lift, th, p: nFeat(na, nb, lift) };
    const k0 = Math.max(na, nb + nk - 1);
    const sE = simulate(m, uEst, yEst, yEst.length);
    const sV = simulate(m, uVal, yVal, yVal.length);
    cands.push({ ...m, lam,
      est: sE ? nrmse(yEst, sE, k0) : Infinity,
      val: sV ? nrmse(yVal, sV, k0) : Infinity });
  }
  const ok = cands.filter((c) => isFinite(c.val));
  if (!ok.length) throw new Error('identify: every candidate diverged in free run');
  const best = Math.min(...ok.map((c) => c.val));
  const band = ok.filter((c) => c.val <= best * 1.05);
  band.sort((a, b) => a.p - b.p || a.val - b.val);
  const pick = band[0];
  return { model: pick, best, cands: cands.sort((a, b) => a.val - b.val) };
}

/** A live plant from an identified model: feed it `u`, it advances one step and returns y. */
function makePlant(m, ySeed, uSeed) {
  const { na, nb, nk, lift, th } = m;
  const yh = Array.from(ySeed), uh = Array.from(uSeed);
  return {
    get y() { return yh[yh.length - 1]; },
    step(u) {
      uh.push(u);
      if (uh.length > 64) { uh.splice(0, 32); yh.splice(0, yh.length - 32); }
      const yl = []; for (let i = 1; i <= na; i++) yl.push(yh[yh.length - i]);
      const ul = []; for (let j = 0; j < nb; j++) ul.push(uh[uh.length - nk - j] ?? uh[0]);
      const r = row(yl, ul, lift);
      let s = 0; for (let j = 0; j < r.length; j++) s += r[j] * th[j];
      yh.push(s);
      return s;
    },
  };
}

export { readCols, readCsv, identify, simulate, makePlant };
