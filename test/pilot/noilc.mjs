/**
 * @file PLAN STEP 6d / TARGET 8 — NORM-OPTIMAL ILC, THE RIVAL FROM THE LITERATURE.
 *
 * Every comparison this project has is against its own conventional machine, a published
 * number for a specific rig, a hand-tuned ILC, or a rival of its own construction (the
 * datasheet-Kalman engineered controller, plan §34). None of those locates the work in its
 * FIELD. Norm-optimal ILC is the cheapest honest choice and the plan says why: it is the
 * method this one is closest to, it is well specified, and transfer is where the two should
 * differ most.
 *
 * THE LAW, WHICH IS THE WHOLE POINT — no tuning, straight out of the literature:
 *
 *     J_{k+1} = ||e_{k+1}||^2_Q + ||u_{k+1} - u_k||^2_R
 *     Δu = (G^H Q G + R)^{-1} G^H Q e_k
 *
 * The program CLOSES, so the lifted plant operator is circulant and diagonalises at the lap
 * harmonics — which is exactly the object `hff.js` identifies as `G[h]`. So NOILC here is
 * that same operator under the textbook update, against `hff`'s damped Newton step with
 * confidence and reach shrinkage.
 *
 * AND IT TAKES `hff`'s OWN OPERATOR, DELIBERATELY. Identifying a second one would make this
 * a comparison of two identifications rather than of two control laws — the confound that
 * makes most published head-to-heads unreadable. Same machine, same probe, same laps, same
 * G. One knob differs: what you do with it.
 *
 * WHAT IS EXPECTED TO SPLIT THEM IS NOT THE HOME PROGRAM. Both are lap-indexed memories and
 * both should converge on the program they learn. The interesting column is the one this
 * project keeps returning to: a trajectory the machine has never run, where a phase-indexed
 * table measured 0.55x on this very axis — worse than doing nothing — while the model-based
 * rungs transferred. A rival that wins at home and cannot leave it is the same object the
 * retirement removed, and saying so is the point of running it.
 *
 * Run: SUITE=full node test/pilot/noilc.mjs
 */
import { HarmonicFF } from '../../lib/pilot/hff.js';

// ---------------------------------------------------------------- the norm-optimal update
//
// `hff` stores each harmonic's operator in the REAL EMBEDDING of the complex system — a
// 2c x 2c real matrix against an interleaved [re0, im0, re1, im1, ...] vector — and its own
// Newton step is `solve(M, -e)`, so G maps CORRECTION to ERROR and the step cancels. In that
// embedding the conjugate transpose G^H is exactly the real transpose, so the norm-optimal
// update needs no complex arithmetic at all:
//
//     Δu = (q M^T M + r I)^{-1} q M^T (-e)
//
// Same M, same vector layout, same sign convention as the rung it is being compared against.
// Deriving a second complex convention here is how a comparison becomes a units error wearing
// a control-theory costume (rule 17).

/** Real Gaussian elimination with a RELATIVE pivot floor, mirroring `hff`'s own — an absolute
 *  floor returned a fitted operator instead of refusing there, and cost 1.00x once already. */
function solveR(Ain, bin) {
  const n = bin.length, a = [];
  let scale = 0;
  for (let i = 0; i < n; i++) {
    const r = new Float64Array(n + 1);
    for (let j = 0; j < n; j++) { r[j] = Ain[i][j]; scale = Math.max(scale, Math.abs(r[j])); }
    r[n] = bin[i]; a.push(r);
  }
  const tol = scale * n * 2.3e-16;
  for (let c = 0; c < n; c++) {
    let piv = c, best = Math.abs(a[c][c]);
    for (let i = c + 1; i < n; i++) if (Math.abs(a[i][c]) > best) { best = Math.abs(a[i][c]); piv = i; }
    if (best <= tol) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    for (let i = c + 1; i < n; i++) {
      const f = a[i][c] / a[c][c];
      if (f === 0) continue;
      for (let j = c; j <= n; j++) a[i][j] -= f * a[c][j];
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let v = a[i][n];
    for (let j = i + 1; j < n; j++) v -= a[i][j] * x[j];
    x[i] = v / a[i][i];
  }
  return x;
}

/**
 * One norm-optimal step per harmonic. `op` is `hff.exportOperator()`; `Er` is that module's
 * own error projection ({re, im} per channel). Returns per-harmonic Δu in the same layout.
 *
 * Q and R are scalars times the identity — the standard choice when no channel is privileged,
 * and privileging one would be the tuned constant this file exists to avoid.
 */
function noilcStep(op, Er, q, r) {
  const { nh } = op, c = op.channels, m = 2 * c;
  const out = [];
  for (let h = 0; h < nh; h++) {
    const M = op.G[h];
    if (!M) { out.push(null); continue; }
    const A = [], b = new Float64Array(m);
    for (let i = 0; i < m; i++) A.push(new Float64Array(m));
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) {
        let v = 0;
        for (let k = 0; k < m; k++) v += M[k][i] * M[k][j];   // (M^T M)_{ij}
        A[i][j] = q * v + (i === j ? r : 0);
      }
      let v = 0;
      for (let k = 0; k < c; k++) {
        v += M[2 * k][i] * -Er.re[k][h] + M[2 * k + 1][i] * -Er.im[k][h];
      }
      b[i] = q * v;
    }
    out.push(solveR(A, b));
  }
  return out;
}

export { noilcStep, solveR, HarmonicFF };
