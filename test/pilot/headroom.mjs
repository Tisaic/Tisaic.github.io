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
    }
  }
  console.log('');
}
