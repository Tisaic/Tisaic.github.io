/**
 * @file NOT A TEST — DOES A NONLINEAR VAR, OR THE A2/A3 COUPLING, RESCUE THE KUKA's FREE RUN?
 * (plan §55.9)
 *
 * §55.8 filed the KUKA NOT ESTABLISHED after trying only a linear MIMO ARX with a trig lift,
 * and `lib/ngrc/` is a golden-vector-tested nonlinear VAR that CLAUDE.md itself lists as the
 * fourth thing that must replace the memory. Not reaching for it was the gap. This closes it,
 * and tests the owner's other hypothesis — that a KUKA's axes 2 and 3 are mechanically
 * coupled, so the model is fitted in the wrong coordinates — at the same time.
 *
 * ONE VARIABLE AT A TIME (rule 20): same rows, same targets, same free-run metric, same lag
 * order. Only the FUNCTION CLASS and the COORDINATES move.
 *
 * IT IS NOT IN THE SUITE AND THE REASON IS RULE 2: one universal-map fit is 1,257 features
 * over 40,000 rows and costs 70-90 s of Cholesky, six times over. What it establishes is
 * pinned cheaply in `realkuka.test.mjs` instead — the coupling's own evidence, and the
 * control that says a linear fit is invariant to it.
 *
 * WHAT IT MEASURED, on the held-out test record, free-run rms in degrees:
 *
 *   na=nb=4                     feat      1s      2s      4s       8s     16s
 *   linear                        49   0.410   2.589  10.317   20.893  23.907
 *   linear + coupled (control)    49   0.415   2.605  10.344   20.909  23.861
 *   NGRC universal              1257   0.510   2.906  10.476   73.480     div
 *   NGRC + coupled q2+q1        1257   0.513   2.908  10.417  246.199     div
 *   NGRC + coupled q2-q1        1257   0.516   2.911  10.497 1013.148     div
 *
 * THREE THINGS, AND THE SECOND IS THE ONE THAT MATTERS.
 *
 * (1) THE COUPLING IS REAL AND A LINEAR MODEL ALREADY ABSORBS IT. The torque correlation
 *     matrix has u1-u2 at 0.485, far the largest off-diagonal, while every joint PAIR of
 *     positions is under 0.15 — the excitation was designed uncorrelated and the torques are
 *     not. But q2+q1 is a LINEAR COMBINATION of columns a linear ARX already carries, so the
 *     fit must be invariant to it, and the control says it is: identical to three significant
 *     figures at every horizon, the 1% residue being ridge conditioning on a rescaled column.
 *     A constant coupling can only matter where the coordinates decide what is EXPRESSIBLE,
 *     which is inside a nonlinearity — and there it measures the same or worse.
 *
 * (2) THE NONLINEARITY IS WORSE AT EVERY HORIZON AND ITS FAILURE MODE IS DIVERGENCE. 25x the
 *     features buy 24% WORSE at one second and a free run that leaves the planet at eight
 *     (73, then 246 and 1013 with the coupled coordinates) where the linear model is at 21.
 *     That is the eleventh capacity negative in this project, the first on a plant nobody
 *     here built, and from a function class §54.9 did not cover — random ReLU and Fourier
 *     features rather than more hand-picked ones. And the failure differs in KIND from
 *     §54.9's, where an MLP merely transferred worse: here the extra capacity destabilises
 *     the RECURSION, which is a property of free running a model and not of fitting one.
 *     `lib/ngrc/autotune.js` carries a "free-run stability reject" for exactly this, so the
 *     library's own authors met it too.
 *
 * (3) IT DEPENDS ON WHETHER THE LINEAR MODEL WAS STARVED, WHICH IS WHY THE LAG ORDER HAD TO
 *     BE MATCHED. At na=nb=2, where linear reads 1.180 at one second, NGRC reads 1.128 and
 *     looks like a 4-11% win. At na=nb=4, where linear reads 0.410, the same comparison
 *     reverses. A nonlinear model beating a starved linear one is a statement about the lag
 *     order (rule 20).
 *
 * `NA`/`NB` set the lag order. The standardiser is re-measured PER CONFIGURATION on the
 * TRAINING rows only, which the first version did not do — it was built once on the raw
 * coordinates and then the coupling changed underneath it, so the map's ReLU and Fourier
 * features were reading a miscentred channel (rule 38).
 */
import { readMat } from './rigs/realdata/matread.mjs';
import { universalMap } from '../../lib/ngrc/feature_map.js';

const d = readMat(new URL('rigs/realdata/records/kuka/forward.mat', import.meta.url).pathname);
const Ytr = d.y_train, Utr = d.u_train, Yte = d.y_test, Ute = d.u_test;
const NY = 6, NU = 6;

/** The lag vector: na lags of every output, nb lags of every input. */
let COUPLE = 0;                       // 0 = raw axes; else q2' = q2 + COUPLE*q1
function zAt(Y, U, k, na, nb, nk) {
  const z = [];
  for (let i = 1; i <= na; i++) for (let c = 0; c < NY; c++) {
    z.push(c === 2 && COUPLE ? Y[k - i][2] + COUPLE * Y[k - i][1] : Y[k - i][c]);
  }
  for (let j = 0; j < nb; j++) for (let c = 0; c < NU; c++) z.push(U[k - nk - j][c]);
  return z;
}
/** Standardiser over the TRAINING rows only, so the test distribution cannot leak in. */
function standardiser(Y, U, na, nb, nk) {
  const k0 = Math.max(na, nb + nk - 1), base = na * NY + nb * NU;
  const mu = new Float64Array(base), sd = new Float64Array(base);
  let n = 0;
  for (let k = k0; k < Y.length; k++) { const z = zAt(Y, U, k, na, nb, nk); for (let j = 0; j < base; j++) mu[j] += z[j]; n++; }
  for (let j = 0; j < base; j++) mu[j] /= n;
  for (let k = k0; k < Y.length; k++) { const z = zAt(Y, U, k, na, nb, nk); for (let j = 0; j < base; j++) sd[j] += (z[j] - mu[j]) ** 2; }
  for (let j = 0; j < base; j++) { sd[j] = Math.sqrt(sd[j] / n); if (!(sd[j] > 1e-12)) sd[j] = 1; }
  return { mu, sd, base, k0, norm: (z) => z.map((v, j) => (v - mu[j]) / sd[j]) };
}

/** STREAMING normal equations — 40k rows x ~330 features will not fit as a dense array. */
function fitStream({ Y, U, na, nb, nk, st, fmap, useDelta, lam }) {
  const p = fmap ? fmap.m : st.base + 1;
  const A = Array.from({ length: p }, () => new Float64Array(p));
  const b = Array.from({ length: NY }, () => new Float64Array(p));
  let n = 0;
  for (let k = st.k0; k < Y.length; k++) {
    const z = st.norm(zAt(Y, U, k, na, nb, nk));
    const f = fmap ? fmap.expand(z) : [1, ...z];
    for (let i = 0; i < p; i++) {
      const fi = f[i];
      if (fi === 0) continue;
      for (let j = i; j < p; j++) A[i][j] += fi * f[j];
      for (let c = 0; c < NY; c++) b[c][i] += fi * (useDelta ? Y[k][c] - Y[k - 1][c] : Y[k][c]);
    }
    n++;
  }
  for (let i = 0; i < p; i++) { A[i][i] += lam * n; for (let j = 0; j < i; j++) A[i][j] = A[j][i]; }
  // Cholesky, shared across the six targets
  const L = Array.from({ length: p }, () => new Float64Array(p));
  for (let j = 0; j < p; j++) {
    let dg = A[j][j];
    for (let q = 0; q < j; q++) dg -= L[j][q] * L[j][q];
    if (!(dg > 0)) return null;
    L[j][j] = Math.sqrt(dg);
    for (let i = j + 1; i < p; i++) { let s = A[i][j]; for (let q = 0; q < j; q++) s -= L[i][q] * L[j][q]; L[i][j] = s / L[j][j]; }
  }
  const th = [];
  for (let c = 0; c < NY; c++) {
    const y0 = new Float64Array(p), x = new Float64Array(p);
    for (let i = 0; i < p; i++) { let s = b[c][i]; for (let q = 0; q < i; q++) s -= L[i][q] * y0[q]; y0[i] = s / L[i][i]; }
    for (let i = p - 1; i >= 0; i--) { let s = y0[i]; for (let q = i + 1; q < p; q++) s -= L[q][i] * x[q]; x[i] = s / L[i][i]; }
    th.push(x);
  }
  return { th, p };
}

/** Free run over a horizon H, restarted from truth every H samples. */
function horizon(m, st, na, nb, nk, useDelta, fmap, Y, U, H) {
  let se = 0, n = 0;
  for (let s = 0; s + H <= Y.length; s += H) {
    const hist = [];
    for (let k = 0; k < st.k0; k++) hist.push(Float64Array.from(Y[s + k]));
    for (let k = st.k0; k < H; k++) {
      const z = st.norm(zAt(hist, U.slice(s), k, na, nb, nk));
      const f = fmap ? fmap.expand(z) : [1, ...z];
      const out = new Float64Array(NY);
      for (let c = 0; c < NY; c++) {
        let v = 0; for (let i = 0; i < m.p; i++) v += f[i] * m.th[c][i];
        out[c] = useDelta ? hist[k - 1][c] + v : v;
        if (!isFinite(out[c]) || Math.abs(out[c]) > 1e5) return null;
      }
      hist.push(out);
      for (let c = 0; c < NY; c++) { se += (Y[s + k][c] - out[c]) ** 2; n++; }
    }
  }
  return Math.sqrt(se / n);
}

const NA = +(process.env.NA||4), NB = +(process.env.NB||4), NK = 1;
let st = standardiser(Ytr, Utr, NA, NB, NK);
console.log(`lag vector base = ${st.base} (na=${NA} nb=${NB})`);
const HS = [10, 20, 40, 80, 160];
console.log('\nfree-run rms (deg) on the HELD-OUT test record, vs horizon:');
console.log('model'.padEnd(30) + 'feat'.padStart(6) + HS.map((h) => `${h / 10}s`.padStart(9)).join(''));
const rows = [];
// THE LINEAR COUPLED ROW IS A CONTROL WITH A PREDICTION ATTACHED (rule 21). q2+q1 is a
// LINEAR COMBINATION of columns a linear model already has, so a linear fit must be
// INVARIANT to the coupling — if that row differs from plain linear by more than
// conditioning, the reasoning that "a linear ARX already absorbs a constant coupling" is
// wrong and the coupled coordinate is doing something this file does not understand.
const CFGS = [[0, 'linear', null], [1, 'linear + coupled  (control)', null],
  [0, 'NGRC universal', universalMap(st.base, 16, 16, 7)],
  [1, 'NGRC + coupled q2+q1', universalMap(st.base, 16, 16, 7)],
  [-1, 'NGRC + coupled q2-q1', universalMap(st.base, 16, 16, 7)]];
for (const useDelta of [false]) {
  for (const [cpl, nm, fmap] of CFGS) {
    COUPLE = cpl;
    // THE STANDARDISER BELONGS TO THE COORDINATES IT WAS MEASURED ON (rule 38). Changing
    // the coupling changes channel 2's mean and spread, and the universal map's ReLU and
    // Fourier features are only meaningful on standardised inputs — so it is re-measured
    // per configuration, on the TRAINING rows only.
    st = standardiser(Ytr, Utr, NA, NB, NK);
    const t0 = Date.now();
    const m = fitStream({ Y: Ytr, U: Utr, na: NA, nb: NB, nk: NK, st, fmap, useDelta, lam: 1e-6 });
    if (!m) { console.log(`${nm} delta=${useDelta}: not positive definite`); continue; }
    const out = HS.map((H) => { const r = horizon(m, st, NA, NB, NK, useDelta, fmap, Yte, Ute, H); return (r === null ? 'div' : r.toFixed(3)).padStart(9); });
    const label = `${nm}${useDelta ? ' + Δy' : ''}`;
    console.log(label.padEnd(30) + String(m.p).padStart(6) + out.join('') + `   ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    rows.push(label);
  }
}
