/**
 * @file THE IDENTIFICATION INSTRUMENT for the plants whose dynamics came from a real
 * machine — written ONCE, because three plants needing the same job is exactly how three
 * copies drift apart (rule 61).
 *
 * A record is not a plant. What this module turns a record into is a plant: a model fitted
 * on an ESTIMATION cut and scored by FREE-RUN SIMULATION on a VALIDATION cut it never saw.
 *
 * FREE-RUN, NOT ONE-STEP, AND THE DISTINCTION IS THE WHOLE POINT. A one-step ARX predictor
 * is handed the true y[k-1] at every step, so it scores well on any record whose output is
 * smooth — it is measuring the sampling rate, not the model. Free-run is fed its own past
 * output for the length of the cut, so nothing but the identified dynamics carries it, and
 * a model that cannot hold a trajectory it has never seen is refused here rather than
 * discovered later as a control result. Rule 36 in a second costume: a fit validated
 * against data it can peek at scores by knowing where it is.
 *
 * THE ORDER IS SELECTED BY THE HELD-OUT FREE RUN, NEVER BY THE IN-SAMPLE FIT (rule 16), and
 * ties are broken by rule 42: among candidates within 5% of the best MEASURED score, take
 * the cheapest — here, the fewest parameters.
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
      const yl = []; for (let i = 1; i <= na; i++) yl.push(yh[yh.length - i]);
      const ul = []; for (let j = 0; j < nb; j++) ul.push(uh[uh.length - nk - j] ?? uh[0]);
      const r = row(yl, ul, lift);
      let s = 0; for (let j = 0; j < r.length; j++) s += r[j] * th[j];
      yh.push(s);
      return s;
    },
  };
}

export { readCols, readCsv, ridgeSolve, identify, simulate, makePlant, nrmse, nFeat, build };

// =========================================================================== MIMO
/**
 * THE SAME INSTRUMENT FOR A COUPLED PLANT, added when the KUKA robot arrived: six motor
 * torques in, six joint positions out, every joint's inertia and gravity load depending on
 * where the others are. A bank of six independent SISO fits cannot express that, so each
 * output is regressed on EVERY output's lags and EVERY input's lags.
 *
 * THE DESIGN MATRIX IS SHARED ACROSS THE SIX OUTPUTS — same regressors, different targets —
 * which is exactly the structure `lib/pilot/rls.js` exists for and `shared.test.mjs` pins.
 * One Cholesky serves all six right-hand sides, so a 6x6 plant costs barely more to identify
 * than one channel of it.
 */
function rowMimo(yl, ul, lift) {
  const r = [];
  for (const v of yl) r.push(v);
  for (const v of ul) r.push(v);
  r.push(1);
  if (lift) for (const v of lift(yl, ul)) r.push(v);
  return r;
}
/** `U`/`Y` are arrays of samples, each sample a per-channel array. */
function buildMimo(U, Y, na, nb, nk, lift) {
  const ny = Y[0].length, nu = U[0].length;
  const k0 = Math.max(na, nb + nk - 1);
  const X = [], T = Array.from({ length: ny }, () => []);
  for (let k = k0; k < Y.length; k++) {
    const yl = []; for (let i = 1; i <= na; i++) for (let c = 0; c < ny; c++) yl.push(Y[k - i][c]);
    const ul = []; for (let j = 0; j < nb; j++) for (let c = 0; c < nu; c++) ul.push(U[k - nk - j][c]);
    X.push(rowMimo(yl, ul, lift));
    for (let c = 0; c < ny; c++) T[c].push(Y[k][c]);
  }
  return { X, T, k0, ny, nu };
}
function fitMimo({ U, Y, na, nb, nk, lift = null, lam = 1e-8 }) {
  const { X, T, k0, ny, nu } = buildMimo(U, Y, na, nb, nk, lift);
  const th = [];
  for (let c = 0; c < ny; c++) {
    const w = ridgeSolve(X, T[c], lam);
    if (!w) return null;
    th.push(w);
  }
  return { na, nb, nk, lift, lam, th, k0, ny, nu, p: th[0].length };
}
/**
 * FREE RUN, ALL CHANNELS TOGETHER. Feeding each channel its own true past while the others
 * run free would be six one-step predictors wearing a simulation's clothes — on a coupled
 * plant that is the difference between a model and a lookup.
 */
function simulateMimo(m, U, Yseed, n, bound = 50, range = null) {
  const { na, nb, nk, lift, th, ny, nu, k0 } = m;
  const Y = [];
  for (let k = 0; k < Math.min(k0, n); k++) Y.push(Float64Array.from(Yseed[k]));
  // THE DIVERGENCE BOUND MUST COME FROM THE WHOLE RECORD, NOT FROM THE SEED. Scaled off the
  // seed window it shrinks with the window, so a SHORT-horizon run is bounded by however far
  // the plant happened to move in ten samples and any ordinary motion reads as divergence.
  // That is what the horizon probe first reported — `div` at every horizon below 160 on a
  // model that was fine — and it is rule 17 in the instrument that exists to catch failures.
  const lo = new Float64Array(ny).fill(Infinity), hi = new Float64Array(ny).fill(-Infinity);
  for (const s of (range || Yseed)) for (let c = 0; c < ny; c++) { lo[c] = Math.min(lo[c], s[c]); hi[c] = Math.max(hi[c], s[c]); }
  for (let k = k0; k < n; k++) {
    const yl = []; for (let i = 1; i <= na; i++) for (let c = 0; c < ny; c++) yl.push(Y[k - i][c]);
    const ul = []; for (let j = 0; j < nb; j++) for (let c = 0; c < nu; c++) ul.push(U[k - nk - j][c]);
    const r = rowMimo(yl, ul, lift);
    const out = new Float64Array(ny);
    for (let c = 0; c < ny; c++) {
      let s = 0; for (let j = 0; j < r.length; j++) s += r[j] * th[c][j];
      const mid = 0.5 * (lo[c] + hi[c]), half = Math.max(1e-12, 0.5 * (hi[c] - lo[c])) * bound;
      if (!isFinite(s) || Math.abs(s - mid) > half) return null;      // diverged
      out[c] = s;
    }
    Y.push(out);
  }
  return Y;
}
/** Per-channel NRMSE (%) and rms, over a free run. */
function scoreMimo(Ytrue, Ysim, k0) {
  const ny = Ytrue[0].length, out = [];
  for (let c = 0; c < ny; c++) {
    let m = 0, n = 0;
    for (let k = k0; k < Ytrue.length; k++) { m += Ytrue[k][c]; n++; }
    m /= n;
    let se = 0, sv = 0;
    for (let k = k0; k < Ytrue.length; k++) { se += (Ytrue[k][c] - Ysim[k][c]) ** 2; sv += (Ytrue[k][c] - m) ** 2; }
    out.push({ rms: Math.sqrt(se / n), pct: 100 * Math.sqrt(se / sv) });
  }
  return out;
}
/** A live MIMO plant from an identified model: feed it a u vector, get the y vector back. */
function makePlantMimo(m, Yseed, Useed) {
  const { na, nb, nk, lift, th, ny } = m;
  const Yh = Yseed.map((s) => Float64Array.from(s)), Uh = Useed.map((s) => Float64Array.from(s));
  return {
    get y() { return Yh[Yh.length - 1]; },
    step(u) {
      Uh.push(Float64Array.from(u));
      const yl = []; for (let i = 1; i <= na; i++) for (let c = 0; c < ny; c++) yl.push(Yh[Yh.length - i][c]);
      const ul = []; for (let j = 0; j < nb; j++) { const s = Uh[Uh.length - nk - j] ?? Uh[0]; for (let c = 0; c < s.length; c++) ul.push(s[c]); }
      const r = rowMimo(yl, ul, lift);
      const out = new Float64Array(ny);
      for (let c = 0; c < ny; c++) { let s = 0; for (let j = 0; j < r.length; j++) s += r[j] * th[c][j]; out[c] = s; }
      Yh.push(out);
      return out;
    },
  };
}

export { buildMimo, fitMimo, simulateMimo, scoreMimo, makePlantMimo, rowMimo };
