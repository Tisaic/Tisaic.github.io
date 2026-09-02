/**
 * @file THE COMPILED TWIN, PLANT-AGNOSTIC (plan §42).
 *
 * The machinery here knows NOTHING about any plant: not its channel count beyond what
 * the data shows, not its parameters beyond a named search space, not how it is driven.
 * The engineer brings the STRUCTURE as a simulator closure — that division is the whole
 * finding of the §41 campaign: on a plant whose memory exceeds its program's period, no
 * structure-free estimator can reach lap-1 accuracy (windowed features truncate the
 * memory and closed paths alias it, mathematically), so the structure template is the
 * transfer mechanism and everything AROUND it can and must stay agnostic.
 *
 *   identifyTwin   fit the simulator's parameters by OUTPUT ERROR against one
 *                  commissioning record: grid over the caller's parameter space, then
 *                  refinement rings. A candidate that refuses to build is a recorded
 *                  refusal, not a crash.
 *   compileTwin    compile a program: simulate with the current correction, update by
 *                  frequency-domain n x n deconvolution against the plant's measured
 *                  response (Tikhonov per harmonic, |H| cutoff opened once the guard
 *                  holds), iterate under a MONOTONE BACKTRACKING guard.
 *   applyCompiled  sample-indexed accessor over the artifact for a host's drive loop,
 *                  with the settled tail tiled.
 *
 * The caller's contracts:
 *   simulate(params) → Promise<number[][]>      (identify: truth per sample, the same
 *                                                drive that made the record)
 *   simulate(du)     → Promise<number[][]>      (compile: truth per sample with the
 *                                                correction applied; du[k] and e[k]
 *                                                share one sample clock, pre-roll and
 *                                                all — the adapter owns drive semantics)
 *   H                nCh x samples x nCh        (response of truth to a unit step on
 *                                                each correction channel, at the same
 *                                                sample cadence — measured by the
 *                                                adapter however its plant class does)
 */

/** Iterative radix-2 FFT, in place on {re, im}. N must be a power of two. */
export function fft(re, im, inverse = false) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
}

/**
 * Output-error identification over a named parameter space.
 *
 * @param {object} o
 *   record     number[][] — truth per sample from the REAL machine (tracker data)
 *   simulate   async (params) => number[][] — the same drive at candidate params;
 *              params is {name: value, ...}; a throw = unbuildable = recorded refusal
 *   space      [{ name, values: number[] }, ...] — the caller's domains (an app passes
 *              its slider ranges; nothing here reads the machine's true settings)
 *   refine     refinement rings at halving spacing (default 2)
 *   onProgress (msg) => {}
 * @returns {Promise<{params: object, J: number, evals: Array}>}
 */
export async function identifyTwin({ record, simulate, space, refine = 2, onProgress = null }) {
  const evals = [];
  const seen = new Set();
  let best = null;
  const evalAt = async (vals) => {
    const key = vals.map((v) => v.toPrecision(6)).join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const params = {};
    space.forEach((s, i) => { params[s.name] = vals[i]; });
    let sim;
    try {
      sim = await simulate(params);
    } catch (err) {
      evals.push({ params, J: Infinity, refused: String((err && err.message) || err) });
      if (onProgress) onProgress(`${fmt(params)} → unbuildable`);
      return;
    }
    let sd = 0, n = 0;
    const L = Math.min(sim.length, record.length);
    const nCh = record[0].length;
    for (let i = 0; i < L; i++) {
      for (let c = 0; c < nCh; c++) sd += (sim[i][c] - record[i][c]) ** 2;
      n++;
    }
    const J = Math.sqrt(sd / n);
    evals.push({ params, J });
    if (!best || J < best.J) best = { params, vals: vals.slice(), J };
    if (onProgress) onProgress(`${fmt(params)} → ${J.toExponential(2)}${best.J === J ? ' *' : ''}`);
  };
  const fmt = (p) => Object.entries(p).map(([k, v]) => `${k}=${(+v).toPrecision(4)}`).join(' ');
  // full grid (cartesian over the space), then rings around the best
  const walk = async (idx, vals) => {
    if (idx === space.length) { await evalAt(vals); return; }
    for (const v of space[idx].values) await walk(idx + 1, [...vals, v]);
  };
  await walk(0, []);
  const steps = space.map((s, i) => ringStep(s.values, best.vals[i]));
  for (let r = 0; r < refine; r++) {
    for (let i = 0; i < steps.length; i++) steps[i] /= 2;
    const centre = best.vals.slice();
    const ring = async (idx, vals, moved) => {
      if (idx === space.length) { if (moved) await evalAt(vals); return; }
      for (const s of [-1, 0, 1]) {
        const v = centre[idx] + s * steps[idx];
        if (v > 0) await ring(idx + 1, [...vals, v], moved || s !== 0);
      }
    };
    await ring(0, [], false);
  }
  return { params: best.params, J: best.J, evals };
}

function ringStep(values, at) {
  const v = [...values].sort((a, b) => a - b);
  let bi = 0;
  for (let i = 0; i < v.length; i++) if (Math.abs(v[i] - at) < Math.abs(v[bi] - at)) bi = i;
  const lo = v[Math.max(0, bi - 1)], hi = v[Math.min(v.length - 1, bi + 1)];
  return Math.max((hi - lo) / 2, at * 0.02);
}

/** Solve the complex n x n system M x = r (rows are output channels, cols input
 * channels), Tikhonov-regularized: x = (M^H M + λ·tr/n·I)^{-1} M^H r. Arrays of
 * [re, im] pairs. n is small (the plant's channel count). */
function csolve(M, r, lambda) {
  const n = r.length;
  const cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cj = (a) => [a[0], -a[1]];
  const A = Array.from({ length: n }, () => Array.from({ length: n }, () => [0, 0]));
  const b = Array.from({ length: n }, () => [0, 0]);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    for (let c = 0; c < n; c++) {
      const p = cm(cj(M[c][i]), M[c][j]);
      A[i][j][0] += p[0]; A[i][j][1] += p[1];
    }
  }
  for (let i = 0; i < n; i++) for (let c = 0; c < n; c++) {
    const p = cm(cj(M[c][i]), r[c]);
    b[i][0] += p[0]; b[i][1] += p[1];
  }
  let tr = 0;
  for (let i = 0; i < n; i++) tr += A[i][i][0];
  const lam = lambda * (tr / n + 1e-30);
  for (let i = 0; i < n; i++) A[i][i][0] += lam;
  // complex Gaussian elimination with partial pivoting
  const x = b.map((v) => v.slice());
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let rr = c + 1; rr < n; rr++) {
      if (A[rr][c][0] ** 2 + A[rr][c][1] ** 2 > A[p][c][0] ** 2 + A[p][c][1] ** 2) p = rr;
    }
    [A[c], A[p]] = [A[p], A[c]]; [x[c], x[p]] = [x[p], x[c]];
    const d = A[c][c];
    const dm = d[0] * d[0] + d[1] * d[1] + 1e-300;
    const di = [d[0] / dm, -d[1] / dm];
    for (let rr = 0; rr < n; rr++) {
      if (rr === c) continue;
      const f = cm(A[rr][c], di);
      for (let j = c; j < n; j++) {
        const p2 = cm(f, A[c][j]);
        A[rr][j][0] -= p2[0]; A[rr][j][1] -= p2[1];
      }
      const p3 = cm(f, x[c]);
      x[rr][0] -= p3[0]; x[rr][1] -= p3[1];
    }
  }
  for (let c = 0; c < n; c++) {
    const d = A[c][c];
    const dm = d[0] * d[0] + d[1] * d[1] + 1e-300;
    x[c] = cm(x[c], [d[0] / dm, -d[1] / dm]);
  }
  return x;
}

/**
 * Compile: guarded frequency-domain deconvolution iterated through the simulator.
 *
 * @param {object} o
 *   simulate  async (du|null) => number[][] — truth per sample with the correction
 *             applied; the adapter owns pre-roll/entry semantics, du[k] ↔ e[k]
 *   H         nCh x samples x nCh step response of truth to a unit correction step
 *   iters (11), openAt (7), scale (0.9), cutoffs ([0.02, 0.008]), lambda (1e-3)
 *   onProgress (msg) => {}
 * @returns {Promise<{du: number[][], report: object}>}
 */
export async function compileTwin({ simulate, H, iters = 11, openAt = 7, scale = 0.9,
  cutoffs = [0.02, 0.008], lambda = 1e-3, onProgress = null }) {
  const rmsOf = (e) => {
    let s = 0;
    for (const t of e) for (const v of t) s += v * v;
    return Math.sqrt(s / e.length);
  };
  let cur = await simulate(null);
  const nCh = cur[0].length;
  const Ls = cur.length;
  let N = 1;
  while (N < Ls + H[0].length + 64) N <<= 1;
  // frequency response of the differenced step response, padded to N
  const Hf = Array.from({ length: nCh }, (_, cin) => Array.from({ length: nCh }, (_, cout) => {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let k = 0; k < H[cin].length; k++) {
      const prev = k ? H[cin][k - 1][cout] : 0;
      re[k] = H[cin][k][cout] - prev;
    }
    fft(re, im);
    return { re, im };
  }));
  let hMax = 0;
  for (let f = 0; f < N; f++) {
    let g = 0;
    for (let c = 0; c < nCh; c++) g += Math.hypot(Hf[c][c].re[f], Hf[c][c].im[f]);
    hMax = Math.max(hMax, g);
  }
  let du = Array.from({ length: Ls }, () => new Array(nCh).fill(0));
  let bestDu = du.map((d) => d.slice());
  let best = rmsOf(cur), sc = scale;
  const report = { iters: [], openRms: best };
  for (let it = 1; it <= iters; it++) {
    const cut = (it <= openAt ? cutoffs[0] : cutoffs[1]) * hMax;
    const E = Array.from({ length: nCh }, (_, c) => {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let k = 0; k < Ls; k++) re[k] = cur[k][c];
      fft(re, im);
      return { re, im };
    });
    const D = Array.from({ length: nCh }, () => ({ re: new Float64Array(N), im: new Float64Array(N) }));
    for (let f = 0; f < N; f++) {
      let g = 0;
      for (let c = 0; c < nCh; c++) g += Math.hypot(Hf[c][c].re[f], Hf[c][c].im[f]);
      if (g < cut) continue;
      // rows = output channels, cols = input (correction) channels
      const M = Array.from({ length: nCh }, (_, cout) =>
        Array.from({ length: nCh }, (_, cin) => [Hf[cin][cout].re[f], Hf[cin][cout].im[f]]));
      const r = Array.from({ length: nCh }, (_, c) => [-E[c].re[f], -E[c].im[f]]);
      const x = csolve(M, r, lambda);
      for (let c = 0; c < nCh; c++) { D[c].re[f] = x[c][0]; D[c].im[f] = x[c][1]; }
    }
    for (let c = 0; c < nCh; c++) fft(D[c].re, D[c].im, true);
    const trial = du.map((d, k) => d.map((v, c) => v + sc * D[c].re[k]));
    const res = await simulate(trial);
    const rms = rmsOf(res);
    if (rms < best) {
      du = trial; cur = res; best = rms;
      bestDu = du.map((d) => d.slice());
      report.iters.push({ it, scale: sc, rms });
      if (onProgress) onProgress(`compile iter ${it}: rms ${rms.toExponential(2)}`);
    } else {
      sc /= 2;
      report.iters.push({ it, scale: sc, rms, reverted: true });
      if (onProgress) onProgress(`compile iter ${it}: regressed, scale → ${sc.toFixed(2)}`);
      if (sc < 0.08) break;
    }
  }
  report.rms = best;
  return { du: bestDu, report };
}

/** Sample-indexed accessor over a compiled artifact for a host's drive loop:
 * f(stepsSinceEngage) → du vector. The host restarts its program at engage so the
 * artifact's pre-roll and trajectory line up.
 *
 * PAST THE COMPILED SPAN THE TAIL REPEATS AT THE TRUE, FRACTIONAL LAP PHASE. The first
 * version tiled the last `tailSamples` by ROUNDED count: on a 7356.6-step lap sampled at
 * 9 that is 817 samples against a true 817.4 — a 0.4-sample-per-lap phase slip (the same
 * defect the deploy host's `actAt` had already paid for) — AND the modulo wrap stepped
 * `du` discontinuously at one fixed lap phase, a ref step into the servo at the SAME
 * CORNER every lap, which is exactly where the owner found the error concentrated. The
 * tail is now a closed periodic table sampled one true lap back from the span's end,
 * with the (small, settled-lap) endpoint mismatch distributed linearly across the lap so
 * the table is continuous at the wrap by construction.
 *
 * @param {object} o
 *   du        the compiled correction, one row per sample over [preRoll + trajectory]
 *   sample    steps per sample
 *   lapSteps  the program's TRUE lap length in STEPS (fractional — pass `path.lap`,
 *             never a rounded sample count)
 */
export function applyCompiled({ du, sample, lapSteps }) {
  const span = du.length;
  const nCh = du[0].length;
  const at = (s) => {
    const s0 = Math.max(0, Math.min(span - 2, Math.floor(s))), fr = s - s0;
    const out = new Array(nCh);
    for (let c = 0; c < nCh; c++) out[c] = du[s0][c] + fr * (du[s0 + 1][c] - du[s0][c]);
    return out;
  };
  const lapSamples = lapSteps / sample;                    // fractional, on purpose
  const tailEnd = span - 2;
  const tailStart = Math.max(0, tailEnd - lapSamples);
  // the endpoint mismatch of the settled lap, spread linearly so T(0) == T(period);
  // the periodic table takes over at the settled lap's START (not its end), so the
  // handoff is T(0) = at(tailStart) — continuous — and every wrap thereafter is too
  const e0 = at(tailStart), e1 = at(tailEnd);
  const mism = e1.map((v, c) => v - e0[c]);
  return (k) => {
    const s = k / sample;
    if (s <= tailStart) return at(s);
    const ph = (s - tailStart) % lapSamples;
    const base = at(tailStart + ph);
    const out = new Array(nCh);
    for (let c = 0; c < nCh; c++) out[c] = base[c] - (ph / lapSamples) * mism[c];
    return out;
  };
}
