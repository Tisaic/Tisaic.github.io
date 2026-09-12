/**
 * @file NOT A TEST — IS THIS PLANT WINNABLE AT ALL? The upper bound that lets a plant be
 * STRUCK for a measured reason rather than merely left unsolved.
 *
 * WHY IT HAS TO EXIST. "I could not fix it" is not a verdict on a plant. A roster where every
 * plant must become a winner or be struck needs the second outcome to be a MEASUREMENT, and the
 * measurement is: what is the best ANY correction of this class could do on this program? If
 * that bound is barely better than doing nothing, the plant or its program cannot reward this
 * method and the gap is not ours. If the bound is large, the plant stays and the work is real.
 *
 * WHAT IT COMPUTES. The plant's own step response to a held correction is measured exactly the
 * way `invert.mjs` measures it — two runs from the same `fresh()`, subtracted, noise cancelled
 * by the seeded rigs. A correction held piecewise-constant on blocks of D steps then has a
 * response built from SHIFTED COPIES of that measured step, with no differencing and no fitted
 * model anywhere. Least squares over the block amplitudes, projected onto the plant's own box,
 * minimises the predicted error. That is an OPEN-LOOP OPTIMAL FEEDFORWARD chosen with full
 * knowledge of the future error — a non-causal oracle, which is exactly what an upper bound
 * wants and is the same spirit as this project's existing oracle tests.
 *
 * AND THE BOUND IS THEN PUT TO THE MACHINE (rule 16). The solved correction is APPLIED to the
 * real plant and the delivered rms measured. A number computed from a model cannot check the
 * model, so the predicted and delivered ratios are printed side by side; where they disagree the
 * bound is not usable and the file says so rather than quoting it.
 *
 * WHAT IT ASSUMES, AND THE FIRST VERSION OVERCLAIMED IT. Superposition is licensed by
 * `invert.mjs` measuring every response scaling 2.00-2.04 when the correction is HALVED — but
 * that was measured between 12.5% and 25% of uMax, and it says nothing about the full box. The
 * first run let the optimiser use all of it and duly predicted 48x, 150x and 15x where the
 * machine delivered 1.77x, 1.76x and 1.01x: a small-signal model extrapolated four times past
 * anything measured (rule 32 — a threshold must be scaled to the quantity it acts on). The solve
 * is now CAPPED at the amplitude the response was measured at, so the bound is a true statement
 * about corrections of that size; `AMPCAP` opens it and the agreement column says when it breaks.
 * And a correction resolution of D steps: a FINER correction could only do
 * better, so a LARGE bound here is a true lower bound on the headroom, while a SMALL one is only
 * small at this resolution. That asymmetry matters because a strike rests on the small case, so
 * D is swept rather than chosen (rule 19 — match the metric's support to the claim).
 *
 * KNOBS: PLANTS, BLOCKS (D ladder, comma list), ITERS, WINDOW. It asserts nothing.
 */
import { tankSpec, wbSpec, millSpec, barrelSpec } from './rigs/specs.mjs';

const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
const ITERS = env('ITERS', 4000);
const PASSES = env('PASSES', 4);
const REACHW = env('REACHW', 1.5);   // window span as a multiple of the measured settle
const WANT = (process.env.PLANTS || 'tank,column,mill,barrel').split(',');
const DLIST = (process.env.BLOCKS || '').split(',').filter(Boolean).map(Number);
const SPECS = [['tank', tankSpec], ['column', wbSpec], ['mill', millSpec], ['barrel', barrelSpec]];

/** Run a plant, holding correction `amp` on channel `j` from `k0`. `j<0` = undriven. */
function drive(spec, n, k0, j, amp, useq) {   // j>=0 adds a held step on ch j ON TOP of useq
  const st = spec.fresh(), nc = spec.channels.length;
  const out = Array.from({ length: nc }, () => new Float64Array(n));
  const u = new Array(nc).fill(0);
  const hold = spec.refAt(k0);   // retained for a frozen-point caller; unused on the scored path
  for (let k = 0; k < n; k++) {
    for (let c = 0; c < nc; c++) u[c] = (useq ? useq[c][k] : 0)
      + ((j >= 0 && c === j && k >= k0) ? amp : 0);
    // THE PROGRAM ALWAYS RUNS. An earlier version froze the reference while measuring the step,
    // which is right for a time-invariant response and wrong here: the tank's recipe, the
    // column's setpoints and the barrel's changeovers all MOVE the operating point, so a single
    // frozen-point response does not describe the plant along its own program. It showed as the
    // mill — the one plant whose program HOLDS — being the only row where the LTI prediction and
    // the machine agreed, while the other three predicted 19x, 6-9x and 15x against a delivered
    // 1.82x, 1.37x and 1.01x. `hold` is retained only for callers that want the frozen form.
    const r = spec.step(st, spec.refAt(k), u, k);
    for (let c = 0; c < nc; c++) out[c][k] = r.truth[c];
  }
  return out;
}
const rms = (a, from) => {
  let s = 0, n = 0;
  for (const ch of a) for (let k = from; k < ch.length; k++) { s += ch[k] * ch[k]; n++; }
  return Math.sqrt(s / n);
};

/**
 * IS THE ORACLE'S CORRECTION A FUNCTION OF THE COMMANDED REFERENCE? §49's analysis transplanted.
 * The oracle is NON-CAUSAL — it chooses knowing the whole future error — so its headroom says
 * what is AVAILABLE and not what is REACHABLE. A deployed policy here is addressed by the
 * commanded reference alone, so the question is how much of the oracle a window of that
 * reference can express, and what such a map then DELIVERS on the machine.
 *
 * Two numbers, labelled, because they answer different questions and conflating them is how a
 * memory gets reported as a model: IN-SAMPLE says whether the form can express the correction at
 * all, HELD-OUT says whether it transfers. The folds are CONTIGUOUS with a GAP of the window
 * span, because rows a few blocks apart read most of the same window and a shuffled split
 * validates against data it has effectively seen — `distil.js`'s own convention.
 */
function reachable(spec, n, D, M, x, nc, k0, from, base0, drive, rms, LSETOUT) {
  // ROWS AT A FINE STRIDE, NOT ONE PER BLOCK — and the first version got this wrong in the way
  // that matters. One row per block gave 40 rows against 40 features on the barrel: an exactly
  // determined fit whose held-out split trained on ~12 rows, so its R² of -0.35 measured the
  // instrument and not the plant (rules 20, 32). The correction is piecewise constant, so a
  // finer stride adds rows without changing the target it is asked to explain, and the
  // contiguous GAP below is what keeps neighbouring rows out of each other's test set.
  // THE WINDOW IS IN STEPS AND SCALED TO THE PLANT'S OWN MEASURED SETTLE (rule 37), not in
  // blocks. Fixed at +/-8 blocks it reached +/-1,000 steps on the barrel at D=125 against
  // cross-channel rises of 4,464 — a window too short to carry what it is being asked to
  // explain, which is the trap that read 1.047x on the shake data at K=8 and 1.63x at K=16.
  // REACHW multiplies the span so the claim can be tested rather than asserted.
  const span = Math.round(REACHW * LSETOUT.v);
  const OFFS = [-1, -0.75, -0.5, -0.35, -0.22, -0.13, -0.06, 0, 0.06, 0.13, 0.22, 0.35, 0.5, 0.75, 1]
    .map((f) => Math.round(f * span));
  const nf = OFFS.length * nc + 1;
  const STRIDE = Math.max(1, Math.round(D / 8));
  const rows = [], tgt = Array.from({ length: nc }, () => []), rowT = [];
  for (let t = 0; t < n; t += STRIDE) {
    const m = Math.min(M - 1, Math.floor(t / D));
    const r = [1];
    for (const o of OFFS) {
      const tt = Math.min(n - 1, Math.max(0, t + o));
      const ref = spec.refAt(tt);
      for (let c = 0; c < nc; c++) r.push(ref[c]);
    }
    rows.push(r); rowT.push(t);
    for (let j = 0; j < nc; j++) tgt[j].push(x[m * nc + j]);
  }
  const solve = (idx, j, lam) => {
    const A = new Float64Array(nf * nf), b = new Float64Array(nf);
    for (const i of idx) {
      const r = rows[i];
      for (let a = 0; a < nf; a++) { b[a] += r[a] * tgt[j][i]; for (let c = 0; c < nf; c++) A[a * nf + c] += r[a] * r[c]; }
    }
    for (let a = 0; a < nf; a++) A[a * nf + a] += lam;
    const Aug = [];
    for (let a = 0; a < nf; a++) { const row = new Float64Array(nf + 1); for (let c = 0; c < nf; c++) row[c] = A[a * nf + c]; row[nf] = b[a]; Aug.push(row); }
    for (let i = 0; i < nf; i++) {
      let piv = i;
      for (let r2 = i + 1; r2 < nf; r2++) if (Math.abs(Aug[r2][i]) > Math.abs(Aug[piv][i])) piv = r2;
      if (Math.abs(Aug[piv][i]) < 1e-300) continue;
      [Aug[i], Aug[piv]] = [Aug[piv], Aug[i]];
      const d = Aug[i][i];
      for (let c = 0; c <= nf; c++) Aug[i][c] /= d;
      for (let r2 = 0; r2 < nf; r2++) { if (r2 === i) continue; const f = Aug[r2][i]; for (let c = 0; c <= nf; c++) Aug[r2][c] -= f * Aug[i][c]; }
    }
    return Aug.map((r) => r[nf]);
  };
  let scale = 0;
  for (const r of rows) for (const v of r) scale += v * v;
  const lam = 1e-6 * scale / Math.max(1, rows.length);
  const GAP = span;                                 // the window's own span, in STEPS
  const half = Math.floor(n / 2);
  const trainI = [], testI = [];
  for (let i = 0; i < rows.length; i++) {
    if (rowT[i] < half - GAP) trainI.push(i); else if (rowT[i] >= half + GAP) testI.push(i);
  }
  let r2sum = 0, r2n = 0;
  for (let j = 0; j < nc; j++) {
    if (!trainI.length || !testI.length) continue;
    const w = solve(trainI, j, lam);
    let mu = 0; for (const i of testI) mu += tgt[j][i]; mu /= testI.length;
    let ss = 0, tt = 0;
    for (const i of testI) { let p = 0; for (let a = 0; a < nf; a++) p += w[a] * rows[i][a];
      ss += (tgt[j][i] - p) ** 2; tt += (tgt[j][i] - mu) ** 2; }
    if (tt > 0) { r2sum += 1 - ss / tt; r2n++; }
  }
  const held = r2n ? r2sum / r2n : NaN;
  // and what a reference-only map DELIVERS, fitted on everything (in-sample, stated as such)
  const all = Array.from({ length: rows.length }, (_, i) => i);
  const useq = Array.from({ length: nc }, () => new Float64Array(n));
  for (let j = 0; j < nc; j++) {
    const w = solve(all, j, lam);
    for (let i = 0; i < rows.length; i++) {
      let p = 0; for (let a = 0; a < nf; a++) p += w[a] * rows[i][a];
      p = Math.max(-spec.uMax, Math.min(spec.uMax, p));
      const e = i + 1 < rows.length ? rowT[i + 1] : n;
      for (let t = rowT[i]; t < e; t++) useq[j][t] = p;
    }
  }
  const got = rms(drive(spec, n, k0, -1, 0, useq), from);
  return { held, deliv: base0 / got, rows: rows.length, feats: nf, span, tr: trainI.length, te: testI.length };
}

console.log('\nHEADROOM — the best ANY correction of this class could do, and what the machine'
  + ' then delivers.\n');

for (const [name, spec] of SPECS) {
  if (!WANT.includes(name)) continue;
  const nc = spec.channels.length, n = env('WINDOW', spec.N);
  const k0 = Math.round(n * 0.10), from = Math.round(n * 0.05);
  const amp = 0.25 * spec.uMax;
  const cap = env('AMPCAP', 1) * amp;   // the solve stays where superposition was MEASURED

  // ---- the plant's own step response, measured (no model, no probe) -------------------
  /** The plant's response to a held step on each channel, measured AROUND `useq`. */
  const respond = (useq) => {
    const b = drive(spec, n, k0, -1, 0, useq), S = [];
    for (let j = 0; j < nc; j++) {
      const on = drive(spec, n, k0, j, amp, useq);
      for (let c = 0; c < nc; c++) {
        (S[c] = S[c] || [])[j] = new Float64Array(n - k0);
        for (let t = 0; t < n - k0; t++) S[c][j][t] = (on[c][k0 + t] - b[c][k0 + t]) / amp;
      }
    }
    return { S, err: b };
  };
  const zero = Array.from({ length: nc }, () => new Float64Array(n));
  const base0 = rms(drive(spec, n, k0, -1, 0, zero), from);

  const Ds = DLIST.length ? DLIST : [Math.max(1, Math.round(n / 40)), Math.max(1, Math.round(n / 120))];
  console.log(`  ${name}  (${nc} ch, ${n} steps, undriven rms ${base0.toExponential(3)})`);
  console.log('    block   unknowns   PREDICTED   DELIVERED   agree?   verdict');
  for (const D of Ds) {
    const M = Math.floor(n / D);
    // MACHINE IN THE LOOP. Each pass re-measures the response AROUND the correction found so
    // far and solves for an increment, so the final number is DELIVERED by construction and
    // needs no model validity — which is what a bound used to STRIKE a plant has to be. The
    // per-pass delivered ratio is printed, because a bound that is still climbing is a trend
    // and not a bound (rule 12).
    const cur = Array.from({ length: nc }, () => new Float64Array(n));
    const track = [];
    for (let pass = 0; pass < PASSES; pass++) {
    const { S, err } = respond(cur);
    // response of output c to a UNIT block on input j starting at block m:
    //   S[c][j][t - mD] - S[c][j][t - (m+1)D]
    const col = (m, j, c, t) => {
      const a = t - m * D, b = t - (m + 1) * D;
      return (a >= 0 ? S[c][j][Math.min(a, S[c][j].length - 1)] : 0)
           - (b >= 0 ? S[c][j][Math.min(b, S[c][j].length - 1)] : 0);
    };
    // NORMAL EQUATIONS, because the direct form is O(ITERS x M x nc^2 x N) and was ~3e10 on
    // the tank. J = ||e + Ax||^2 has gradient 2(A'e + A'A x), so A'A (small, once) and A'e
    // (once) make each iteration cost the number of UNKNOWNS rather than the record length.
    // A'A is built exactly rather than assumed Toeplitz: the step response is CLAMPED at its
    // final value near the tail, which is physically right and breaks exact shift invariance.
    const P = M * nc;
    const AtA = new Float64Array(P * P), Ate = new Float64Array(P);
    for (let m = 0; m < M; m++) for (let j = 0; j < nc; j++) {
      const a = m * nc + j;
      for (let c = 0; c < nc; c++) for (let t = m * D; t < n; t++) Ate[a] += col(m, j, c, t) * err[c][t];
      for (let m2 = m; m2 < M; m2++) for (let j2 = 0; j2 < nc; j2++) {
        const b = m2 * nc + j2;
        let v = 0;
        for (let c = 0; c < nc; c++) for (let t = m2 * D; t < n; t++) v += col(m, j, c, t) * col(m2, j2, c, t);
        AtA[a * P + b] = v; AtA[b * P + a] = v;
      }
    }
    let L = 0;
    for (let a = 0; a < P; a++) { let r = 0; for (let b = 0; b < P; b++) r += Math.abs(AtA[a * P + b]); L = Math.max(L, r); }
    const step = 1 / Math.max(1e-30, L);
    const x = new Float64Array(P);
    for (let it = 0; it < ITERS; it++) {
      for (let a = 0; a < P; a++) {
        let g = Ate[a];
        for (let b = 0; b < P; b++) g += AtA[a * P + b] * x[b];
        x[a] = Math.max(-cap, Math.min(cap, x[a] - 2 * step * g));
      }
    }
    // THE RECONSTRUCTION, which an earlier edit deleted along with the loop it sat beside —
    // `resid` was then allocated zero and measured immediately, so PREDICTED read Infinity on
    // every plant. A predicted column that is perfect on every row is an instrument reporting
    // its own initialisation (rules 14, 17), and the machine column was right all along.
    const resid = Array.from({ length: nc }, () => new Float64Array(n));
    for (let c = 0; c < nc; c++) for (let t = 0; t < n; t++) resid[c][t] = err[c][t];
    for (let m = 0; m < M; m++) for (let j = 0; j < nc; j++) {
      const v = x[m * nc + j];
      if (v === 0) continue;
      for (let c = 0; c < nc; c++) for (let t = m * D; t < n; t++) resid[c][t] += v * col(m, j, c, t);
    }
    const pred = rms(resid, from);
    // ---- AND PUT IT TO THE MACHINE (rule 16) -----------------------------------------
    const useq = Array.from({ length: nc }, () => new Float64Array(n));
    for (let t = 0; t < n; t++) {
      const m = Math.min(M - 1, Math.floor(t / D));
      for (let j = 0; j < nc; j++) useq[j][t] = x[m * nc + j];
    }
    for (let c = 0; c < nc; c++) for (let t = 0; t < n; t++) useq[c][t] += cur[c][t];
    for (let c = 0; c < nc; c++) for (let t = 0; t < n; t++)
      useq[c][t] = Math.max(-spec.uMax, Math.min(spec.uMax, useq[c][t]));
    const got = rms(drive(spec, n, k0, -1, 0, useq), from);
    track.push(base0 / got);
    for (let c = 0; c < nc; c++) cur[c].set(useq[c]);
    if (pass < PASSES - 1) continue;
    const agree = Math.abs(pred - got) / Math.max(1e-300, base0) < 0.05;
    console.log(`    ${String(D).padStart(5)}${String(M * nc).padStart(11)}`
      + `${(base0 / pred).toFixed(2).padStart(12)}x${(base0 / got).toFixed(2).padStart(11)}x`
      + `   ${agree ? 'yes ' : 'NO  '}   `
      + `[${track.map((v) => v.toFixed(2)).join(' ')}] `
      + (!agree ? 'model disagrees, but DELIVERED is measured and stands'
        : base0 / got > 1.5 ? 'HEADROOM EXISTS — the gap is ours'
        : base0 / got < 1.1 ? 'NOTHING TO WIN — an oracle with full future knowledge gets ~nothing'
        : 'little to win at this resolution'));
    if (process.env.REACH === '1') {
      const R = reachable(spec, n, D, M, x, nc, k0, from, base0, drive, rms, { v: LSET });
      console.log(`          REACHABLE by a reference-only map: held-out R² ${R.held.toFixed(3)}`
        + `, delivers ${R.deliv.toFixed(2)}x of the ${(base0 / got).toFixed(2)}x oracle`
        + `   (${R.rows} rows / ${R.feats} feat, span +/-${R.span} steps vs settle ${LSET})`);
    }
    }
  }
  console.log('');
}
