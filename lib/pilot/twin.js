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
export async function identifyTwin({ record, simulate, space, refine = 2,
  screen = null, onProgress = null }) {
  const evals = [];
  let best = null;
  const fmt = (p) => Object.entries(p).map(([k, v]) => `${k}=${(+v).toPrecision(4)}`).join(' ');
  // An evaluator over one (simulate, record) pair with its OWN seen-set — the screen
  // and the full evaluation of the same candidate are different measurements and must
  // not dedupe each other.
  const mkEval = (sim, rec, { tracksBest, tag }) => {
    const seen = new Set();
    return async (vals) => {
      const key = vals.map((v) => v.toPrecision(6)).join('|');
      if (seen.has(key)) return null;
      seen.add(key);
      const params = {};
      space.forEach((s, i) => { params[s.name] = vals[i]; });
      let out;
      try {
        out = await sim(params);
      } catch (err) {
        evals.push({ params, J: Infinity, refused: String((err && err.message) || err) });
        if (onProgress) onProgress(`${tag}${fmt(params)} → unbuildable`);
        return { vals: vals.slice(), J: Infinity };
      }
      let sd = 0, n = 0;
      const L = Math.min(out.length, rec.length);
      const nCh = rec[0].length;
      for (let i = 0; i < L; i++) {
        for (let c = 0; c < nCh; c++) sd += (out[i][c] - rec[i][c]) ** 2;
        n++;
      }
      const J = Math.sqrt(sd / n);
      if (tracksBest) {
        evals.push({ params, J });
        if (!best || J < best.J) best = { params, vals: vals.slice(), J };
      }
      if (onProgress) onProgress(`${tag}${fmt(params)} → ${J.toExponential(2)}${tracksBest && best.J === J ? ' *' : ''}`);
      return { vals: vals.slice(), J };
    };
  };
  const evalAt = mkEval(simulate, record, { tracksBest: true, tag: '' });
  // full grid (cartesian over the space), then rings around the best.
  //
  // THE OPTIONAL SCREEN is a cost stage, not a thinner grid — a thinned grid has
  // already shipped a defect here (it dropped E=0.06 and the rings walked into the
  // K/E compensation valley). EVERY cell is still visited; the screen merely visits
  // them on a SHORT record/simulate pair first ({ record, simulate, keep }) and only
  // the `keep` best (plus every refusal, recorded once) pay the full-length price.
  // The caller owns proving the short record ranks like the long one — measured, not
  // assumed (rule 2).
  const walk = async (idx, vals, ev, acc) => {
    if (idx === space.length) { const r = await ev(vals); if (r && acc) acc.push(r); return; }
    for (const v of space[idx].values) await walk(idx + 1, [...vals, v], ev, acc);
  };
  if (screen) {
    const keep = screen.keep ?? 8;
    const screenEval = mkEval(screen.simulate, screen.record, { tracksBest: false, tag: 'screen ' });
    const ranked = [];
    await walk(0, [], screenEval, ranked);
    ranked.sort((a, b) => a.J - b.J);
    for (const cand of ranked.filter((r) => r.J < Infinity).slice(0, keep)) await evalAt(cand.vals);
    if (!best) throw new Error('identifyTwin: every screened candidate refused to build');
  } else {
    await walk(0, [], evalAt, null);
  }
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

/**
 * Multiplicative coordinate descent from a found point, for the parameters a grid
 * cannot afford — the STAGED half of a wider identification. A full cartesian grid
 * over four dimensions is hundreds of simulator runs; the measured shape (plan §43)
 * is a 2-D grid over the dominant pair, then THIS: each key tried at ×factor and
 * ÷factor per round, keeping improvements, then a shrinking global pass over every
 * key. On the arm it recovered link damping EXACTLY and walked K and E to within 1%
 * from a grid point biased by the wrong damping guess — the 2-parameter fit with a
 * mis-guessed constant MISIDENTIFIES, which is why this stage is not optional
 * off-sandbox.
 *
 * @param {object} o
 *   record, simulate   as identifyTwin (simulate throws = unbuildable = Infinity)
 *   params             {name: value} — the starting point (a grid winner)
 *   keys               [{ name, factor }] — per-key first-round step ratios
 *   rounds             coarse rounds over the keys (default 3)
 *   shrink             global fine passes over every key (default [1.04, 1.02, 1.01])
 *   onProgress         (msg) => {}
 * @returns {Promise<{params: object, J: number, evals: Array}>}
 */
export async function refineParams({ record, simulate, params, keys, rounds = 3,
  shrink = [1.04, 1.02, 1.01], onProgress = null }) {
  const evals = [];
  const Jof = async (p) => {
    let sim;
    try {
      sim = await simulate(p);
    } catch (err) {
      evals.push({ params: { ...p }, J: Infinity, refused: String((err && err.message) || err) });
      return Infinity;
    }
    let sd = 0, n = 0;
    const L = Math.min(sim.length, record.length);
    const nCh = record[0].length;
    for (let i = 0; i < L; i++) {
      for (let c = 0; c < nCh; c++) sd += (sim[i][c] - record[i][c]) ** 2;
      n++;
    }
    const J = Math.sqrt(sd / n);
    evals.push({ params: { ...p }, J });
    return J;
  };
  let p = { ...params };
  let J = await Jof(p);
  // A LINE SEARCH PER KEY, not one step: a grid biased 1.85x in one parameter needs
  // ~8 multiplicative steps home, and a single-step descent was measured STEP-STARVED
  // on the soft cell (stuck at K 0.72 / E 0.092 on a 1 / 0.06 machine while the
  // canonical cell, whose grid bias was only 1.25x, recovered). Stepping continues in
  // an improving direction until the objective stops falling.
  const tryKey = async (name, factor) => {
    for (const f of [factor, 1 / factor]) {
      let q = { ...p, [name]: p[name] * f };
      let jq = await Jof(q);
      if (onProgress) onProgress(`${name}=${q[name].toExponential(3)} → ${jq.toExponential(2)}${jq < J ? ' *' : ''}`);
      if (jq < J) {
        while (jq < J) {
          p = q; J = jq;
          q = { ...p, [name]: p[name] * f };
          jq = await Jof(q);
          if (onProgress) onProgress(`${name}=${q[name].toExponential(3)} → ${jq.toExponential(2)}${jq < J ? ' *' : ''}`);
        }
        break;
      }
    }
  };
  for (let r = 0; r < rounds; r++) for (const k of keys) await tryKey(k.name, k.factor);
  for (const f of shrink) for (const k of keys) await tryKey(k.name, f);
  return { params: p, J, evals };
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

/**
 * REFINE THE STEADY TILE AT LAP HARMONICS, AGAINST THE TILED DELIVERY ITSELF.
 *
 * compileTwin's finite-window deconvolution never converges to a periodic du: the
 * transient's non-lap-harmonics leak corrections across the whole window, and the
 * consecutive-lap du difference PLATEAUS instead of settling (measured 6.5e-2 → 2.4e-2 →
 * 3.0e-2 on the soft arm's laps-5 artifact) — so tiling any lap of it injects that
 * difference every lap (delivered 5.6e-2 tiled against 6.8e-3 played straight). The
 * correction the host loops for ever is therefore fitted HERE, as a PERIODIC table at
 * the lap's own harmonics: simulate the tiled correction, average the delivered truth at
 * matched lap phase, invert through H at each lap harmonic (same Tikhonov solve), take a
 * damped step under a monotone guard. HFF's shape, run in software against the twin.
 *
 * @param {object} o
 *   simulate  async (duFn|null) => e[][] — must drive at least 4 laps past the pre-roll
 *             so the scored region (everything after the first tiled lap) is real
 *   H         as compileTwin (step response of truth to a unit correction step)
 *   du        the compiled artifact
 *   sample, lapSteps, preRoll    as applyCompiled
 *   iters (6), scale (0.9), cutoff (0.008), lambda (1e-3), bins (1024), onProgress
 * @returns {Promise<{f: (k)=>number[], report: object}>}  f is what the host plays
 */
export async function refineCompiled({ simulate, H, du, sample, lapSteps, preRoll,
  iters = 6, scale = 0.9, cutoff = 0.008, lambda = 1e-3, bins = 1024, skipLaps = 1,
  onProgress = null }) {
  const nCh = du[0].length;
  const lapSamples = lapSteps / sample;
  const base = applyCompiled({ du, sample, lapSteps, preRoll });
  const handoff = preRoll + lapSamples;              // the tile takes over at lap 2
  // initial tile: the compiled accessor's own steady lap, phase-sampled
  let T = Array.from({ length: bins }, (_, p) => base((handoff + (p / bins) * lapSamples) * sample));
  const mkF = (tile) => (k) => {
    const s = k / sample;
    if (s <= handoff) return base(k);
    const x = (((s - handoff) % lapSamples) / lapSamples) * bins;
    const p0 = Math.floor(x) % bins, p1 = (p0 + 1) % bins, fr = x - Math.floor(x);
    const out = new Array(nCh);
    for (let c = 0; c < nCh; c++) out[c] = tile[p0][c] + fr * (tile[p1][c] - tile[p0][c]);
    return out;
  };
  // H's frequency response at each lap harmonic, once — the DTFT of the differenced
  // step response at ν = h / lapSamples cycles per sample
  const Lh = H[0].length;
  const hMaxN = Math.min(Math.floor(lapSamples / 2), bins / 2 - 1);
  const Gh = [];
  let gPeak = 0;
  for (let h = 0; h <= hMaxN; h++) {
    const nu = h / lapSamples;
    const M = [];
    for (let cout = 0; cout < nCh; cout++) {
      M.push([]);
      for (let cin = 0; cin < nCh; cin++) {
        let re = 0, im = 0;
        for (let k = 0; k < Lh; k++) {
          const hk = H[cin][k][cout] - (k ? H[cin][k - 1][cout] : 0);
          const a = -2 * Math.PI * nu * k;
          re += hk * Math.cos(a); im += hk * Math.sin(a);
        }
        M[cout].push([re, im]);
      }
    }
    Gh.push(M);
    let g = 0;
    for (let c = 0; c < nCh; c++) g += Math.hypot(M[c][c][0], M[c][c][1]);
    gPeak = Math.max(gPeak, g);
  }
  // MEASURED AND REVERTED (plan §43): per-harmonic step gains — HFF's design — were
  // tried here in two variants and both delivered WORSE than this global backtracking
  // (40x against 44x): the offending harmonics are PHASE-wrong in the small-signal H
  // around the 1.9 rad corrected orbit, and a direction error regresses at any positive
  // gain, so selective damping cannot help. The open target stands: the corrected
  // residual repeats lap-to-lap to 4.3e-4 against the 3.1e-3 this refine leaves; the
  // stated next route is a per-harmonic SECANT Jacobian estimated from the refine's own
  // iterates (quasi-Newton), not a better damping schedule.
  const report = { iters: [] };
  let bestT = T.map((r) => r.slice()), best = Infinity, sc = scale;
  for (let it = 0; it <= iters; it++) {
    const e = await simulate(mkF(T));
    // the residual lap: truth averaged at matched phase over every tiled lap but the
    // first (the handoff transient's), plus the guard's score over the same region
    // skipLaps: how many tiled laps to EXCLUDE from the residual (default 1 — the
    // handoff transient's). A plant whose memory outlasts a lap contaminates lap 2 as
    // well, and a tile fitted on a transient replays that transient for ever (rule 13);
    // the caller sizes this against the plant's measured settling.
    const start = Math.ceil(handoff + skipLaps * lapSamples);
    const R = Array.from({ length: bins }, () => new Array(nCh).fill(0));
    const W = new Array(bins).fill(0);
    let s2 = 0, n2 = 0;
    for (let s = start; s < e.length; s++) {
      const p = Math.floor((((s - handoff) % lapSamples) / lapSamples) * bins) % bins;
      for (let c = 0; c < nCh; c++) { R[p][c] += e[s][c]; s2 += e[s][c] ** 2; }
      W[p]++; n2++;
    }
    const rms = Math.sqrt(s2 / (n2 * nCh));
    if (it === 0) report.openRms = rms;
    // per-bin mean, empty bins filled from neighbours (phase stride is ~1.2 bins, so a
    // single lap can skip a bin; three laps rarely do, but zero is not a reading — rule 25)
    for (let p = 0; p < bins; p++) {
      if (W[p]) { for (let c = 0; c < nCh; c++) R[p][c] /= W[p]; continue; }
      const q = (p + bins - 1) % bins;
      for (let c = 0; c < nCh; c++) R[p][c] = R[q][c];
      W[p] = 1;
    }
    const E = Array.from({ length: nCh }, (_, c) => {
      const re = new Float64Array(bins), im = new Float64Array(bins);
      for (let p = 0; p < bins; p++) re[p] = R[p][c];
      fft(re, im);
      return { re, im };
    });
    if (rms < best) {
      best = rms; bestT = T.map((r) => r.slice());
      report.iters.push({ it, scale: sc, rms });
      if (onProgress) onProgress(`refine iter ${it}: tiled rms ${rms.toExponential(2)}`);
    } else if (it > 0) {
      T = bestT.map((r) => r.slice());
      sc /= 2;
      report.iters.push({ it, scale: sc, rms, reverted: true });
      if (onProgress) onProgress(`refine iter ${it}: regressed, scale → ${sc.toFixed(2)}`);
      if (sc < 0.08) break;
    }
    if (it === iters) break;
    const D = Array.from({ length: nCh }, () => ({ re: new Float64Array(bins), im: new Float64Array(bins) }));
    const Ebase = E;
    const thr = cutoff * gPeak;
    for (let h = 0; h < bins; h++) {
      const hh = h <= bins / 2 ? h : h - bins;      // signed harmonic of this FFT bin
      if (Math.abs(hh) > hMaxN) continue;
      const Gm = Gh[Math.abs(hh)];
      let g = 0;
      for (let c = 0; c < nCh; c++) g += Math.hypot(Gm[c][c][0], Gm[c][c][1]);
      if (g < thr) continue;
      const conj = hh < 0 ? -1 : 1;
      const M = Gm.map((row) => row.map((v) => [v[0], conj * v[1]]));
      const r = Array.from({ length: nCh }, (_, c) => [-Ebase[c].re[h], -Ebase[c].im[h]]);
      const x = csolve(M, r, lambda);
      for (let c = 0; c < nCh; c++) { D[c].re[h] = x[c][0]; D[c].im[h] = x[c][1]; }
    }
    for (let c = 0; c < nCh; c++) fft(D[c].re, D[c].im, true);
    T = T.map((row, p) => row.map((v, c) => v + sc * D[c].re[p]));
  }
  report.rms = best;
  return { f: mkF(bestT), report };
}

/** THE LAP-VARYING OPERATOR REFINE — measure the machine's own response to the tile
 * and invert it whole, in the space the machine is SCORED in.
 *
 * Why it exists: six refinement schemes (per-harmonic Newton in two damping variants,
 * secant/Broyden diagonal gains, time-domain ILC with a DC inverse, and two
 * subspace-probe Gauss-Newtons) stalled at one tile residual, and the gradient
 * instrument then measured the sim objective as EXACTLY deterministic with slope
 * 1e3-1e5 above the repeatability floor at that very point — the schemes failed on
 * DIRECTION, not because the objective was exhausted. The frequency-domain inverse
 * assumes one lap-invariant small-signal response; on a plant whose compliance is
 * pose-dependent the response to a bump at a corner is not the response at a mid-edge,
 * and cross-harmonic energy transfer is exactly what a phase-LOCAL kernel represents
 * and a per-harmonic gain cannot.
 *
 * What it does: bump the tile with a narrow hat at `nodes` phase nodes per channel
 * (place them where the operator changes fastest — the caller's geometry knows),
 * measure the response column by central differences THROUGH the caller's simulate,
 * hat-interpolate kernels between nodes (local shift-invariance only within a
 * segment), then Gauss-Newton on the whole tile: conjugate gradient on the implicit
 * normal equations with a ridge and a first-difference smoothness penalty, a
 * backtracking line search, and the operator RE-MEASURED each cycle (measured: a
 * refreshed operator's first step took 7.3% where the stale one's last took 0.2%).
 *
 * Two measured lessons are load-bearing here (both rule 21):
 *   - the objective must not be gameable at a resolution the machine cannot see: at
 *     ~2.4 samples per bin a whole-tile update exploited the binning itself and
 *     delivered NOTHING (44.0x from a tile that read 14% better) — hence coarse bins
 *     and the smoothness penalty, after which an 8-lap holdout matched the 4-lap
 *     objective to 0.1% at every cycle;
 *   - the objective must weigh what the score weighs: minimizing equally-weighted
 *     JOINT rms delivered 47.7x with the twin transferring EXACTLY (0.2%), because
 *     the solve parks error in the components the score punishes hardest — the same
 *     `project` that maps the simulated error into the scored space fixes it, and
 *     took the same machine to 53.6x. The rotating projection is itself lap-varying,
 *     which is no obstacle to an operator that is lap-varying by construction.
 *
 * Cost: commissioning-time simulation only — cycles·(2·nodes·nCh + steps + ~1) calls
 * of `simulate`; the deployed artifact stays a tile lookup. Deterministic given a
 * deterministic simulate.
 *
 * @param {object} o
 *   simulate   async (duF) => e[][]  — same closure shape refineCompiled takes
 *   f          the previous stage's accessor (refineCompiled's or applyCompiled's)
 *   sample, lapSteps, preRoll — as refineCompiled
 *   bins       tile resolution; keep >= ~1.5 samples per bin per scored lap (default 512)
 *   nodes      operator nodes around the lap (default 8); bins % nodes must be 0
 *   cycles     measure-then-step rounds (default 2)
 *   steps      Gauss-Newton steps per cycle (default 4)
 *   delta      probe amplitude for the central differences (default 4e-3)
 *   lambda     ridge, relative to the gradient's own scale (default 0.05)
 *   mu         smoothness weight, relative to the ridge (default 1)
 *   skipLaps   scored-region guard, as refineCompiled (default 1)
 *   project    optional (phase01, e) => e' mapping the simulated error into the
 *              scored space, same dimension; identity when omitted
 *   onProgress optional (msg) => void
 * @returns {{ f, report }} — accessor shaped like refineCompiled's, report with
 *   rms0/rms (in the PROJECTED space), evals, duPk, and the per-step trajectory
 */
export async function refineOperator({ simulate, f: baseF, sample, lapSteps, preRoll,
  bins = 512, nodes = 8, cycles = 2, steps = 4, delta = 4e-3, lambda = 0.05, mu = 1,
  skipLaps = 1, diff = 'central', project = null, onProgress = null }) {
  if (bins % nodes !== 0) throw new Error(`refineOperator: bins ${bins} % nodes ${nodes} != 0`);
  const seg = bins / nodes;
  const lapSamples = lapSteps / sample;
  const handoff = preRoll + lapSamples;
  let T = Array.from({ length: bins }, (_, p) => baseF((handoff + (p / bins) * lapSamples) * sample));
  const nCh = T[0].length;
  const mkF = (tile) => (k) => {
    const s = k / sample;
    if (s <= handoff) return baseF(k);
    const x = (((s - handoff) % lapSamples) / lapSamples) * bins;
    const p0 = Math.floor(x) % bins, p1 = (p0 + 1) % bins, fr = x - Math.floor(x);
    const out = new Array(nCh);
    for (let c = 0; c < nCh; c++) out[c] = tile[p0][c] + fr * (tile[p1][c] - tile[p0][c]);
    return out;
  };
  const evalTile = async (tile) => {
    const e = await simulate(mkF(tile));
    const start = Math.ceil(handoff + skipLaps * lapSamples);
    const R = new Float64Array(bins * nCh);
    const W = new Array(bins).fill(0);
    let s2 = 0, n2 = 0;
    for (let s = start; s < e.length; s++) {
      const ph = ((s - handoff) % lapSamples) / lapSamples;
      const p = Math.floor(ph * bins) % bins;
      const row = project ? project(ph, e[s]) : e[s];
      for (let c = 0; c < nCh; c++) { R[p * nCh + c] += row[c]; s2 += row[c] * row[c]; }
      W[p]++; n2++;
    }
    for (let p = 0; p < bins; p++) {
      if (W[p]) { for (let c = 0; c < nCh; c++) R[p * nCh + c] /= W[p]; continue; }
      const q = (p + bins - 1) % bins;
      for (let c = 0; c < nCh; c++) R[p * nCh + c] = R[q * nCh + c];
    }
    return { rms: Math.sqrt(s2 / (n2 * nCh)), R };
  };
  const HATW = 3;
  const bumpTile = (tile, node, c, amp) => tile.map((r, p) => {
    const d = Math.min((p - node * seg + bins) % bins, (node * seg - p + bins) % bins);
    if (d > HATW) return r.slice();
    const out = r.slice();
    out[c] += amp * (1 - d / (HATW + 1));
    return out;
  });
  const K = Array.from({ length: nodes }, () => []);
  let evals = 0;
  // `diff`: 'central' measures each response column from two probes (2·nodes·nCh
  // evals per cycle); 'forward' differences one probe against the cycle's own R0
  // (half the probes, ~2x cheaper on a phone). Which one a host uses is a MEASURED
  // choice — see the harness bench — never a guess (rule 31).
  const measureOperator = async (R0now) => {
    const total = (diff === 'forward' ? 1 : 2) * nodes * nCh;
    let done = 0;
    for (let node = 0; node < nodes; node++) {
      K[node] = [];
      for (let c = 0; c < nCh; c++) {
        const rp = (await evalTile(bumpTile(T, node, c, delta))).R;
        done++;
        if (onProgress) onProgress(`operator probe ${done}/${total} (node ${node}, ch ${c})`);
        let rm;
        if (diff === 'forward') {
          rm = R0now;
        } else {
          rm = (await evalTile(bumpTile(T, node, c, -delta))).R;
          done++;
          if (onProgress) onProgress(`operator probe ${done}/${total} (node ${node}, ch ${c})`);
        }
        evals += diff === 'forward' ? 1 : 2;
        const den = diff === 'forward' ? delta : 2 * delta;
        const col = new Float64Array(bins * nCh);
        const pc = node * seg;
        for (let q = 0; q < bins; q++) {
          const off = (q - pc + bins) % bins;
          for (let co = 0; co < nCh; co++) col[off * nCh + co] = (rp[q * nCh + co] - rm[q * nCh + co]) / den;
        }
        K[node].push(col);
      }
    }
  };
  const nodeMix = (p) => {
    const x = p / seg;
    const n0 = Math.floor(x) % nodes, n1 = (n0 + 1) % nodes, w1 = x - Math.floor(x);
    return { n0, n1, w1, w0: 1 - w1 };
  };
  const applyJ = (dT) => {
    const out = new Float64Array(bins * nCh);
    for (let p = 0; p < bins; p++) {
      const { n0, n1, w0, w1 } = nodeMix(p);
      for (let ci = 0; ci < nCh; ci++) {
        const a = dT[p * nCh + ci];
        if (a === 0) continue;
        const k0 = K[n0][ci], k1 = K[n1][ci];
        for (let q = 0; q < bins; q++) {
          const off = ((q - p + bins) % bins) * nCh;
          for (let co = 0; co < nCh; co++) out[q * nCh + co] += a * (w0 * k0[off + co] + w1 * k1[off + co]);
        }
      }
    }
    return out;
  };
  const applyJT = (r) => {
    const out = new Float64Array(bins * nCh);
    for (let p = 0; p < bins; p++) {
      const { n0, n1, w0, w1 } = nodeMix(p);
      for (let ci = 0; ci < nCh; ci++) {
        const k0 = K[n0][ci], k1 = K[n1][ci];
        let s = 0;
        for (let q = 0; q < bins; q++) {
          const off = ((q - p + bins) % bins) * nCh;
          for (let co = 0; co < nCh; co++) s += r[q * nCh + co] * (w0 * k0[off + co] + w1 * k1[off + co]);
        }
        out[p * nCh + ci] = s;
      }
    }
    return out;
  };
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  let { rms: f0, R: R0 } = await evalTile(T);
  evals++;
  const report = { rms0: f0, steps: [], evals: 0 };
  for (let cycle = 0; cycle < cycles; cycle++) {
    await measureOperator(R0);
    if (onProgress) onProgress(`operator cycle ${cycle}: measured at rms ${f0.toExponential(3)}`);
    for (let it = 0; it < steps; it++) {
      const g = applyJT(R0);
      const lam = lambda * Math.sqrt(dot(g, g) / (bins * nCh)) + 1e-12;
      const muA = mu * lam;
      const applyDTD = (v) => {
        const out = new Float64Array(bins * nCh);
        for (let c = 0; c < nCh; c++) for (let p = 0; p < bins; p++) {
          const pm = (p + bins - 1) % bins, pp = (p + 1) % bins;
          out[p * nCh + c] = 2 * v[p * nCh + c] - v[pm * nCh + c] - v[pp * nCh + c];
        }
        return out;
      };
      const xv = new Float64Array(bins * nCh);
      const r = g.map((v) => -v);
      let pv = Float64Array.from(r);
      let rs = dot(r, r);
      for (let k = 0; k < 40; k++) {
        const Ap = applyJT(applyJ(pv));
        const Dp = applyDTD(pv);
        for (let i = 0; i < Ap.length; i++) Ap[i] += lam * pv[i] + muA * Dp[i];
        const al = rs / Math.max(dot(pv, Ap), 1e-30);
        for (let i = 0; i < xv.length; i++) { xv[i] += al * pv[i]; r[i] -= al * Ap[i]; }
        const rs2 = dot(r, r);
        if (rs2 < 1e-8 * rs) break;
        for (let i = 0; i < pv.length; i++) pv[i] = r[i] + (rs2 / rs) * pv[i];
        rs = rs2;
      }
      let took = false;
      for (const sc of [1, 0.5, 0.25, 0.1]) {
        const Tn = T.map((row, p) => row.map((v, c) => v + sc * xv[p * nCh + c]));
        const got = await evalTile(Tn);
        evals++;
        if (got.rms < f0) {
          T = Tn; f0 = got.rms; R0 = got.R; took = true;
          report.steps.push({ cycle, it, scale: sc, rms: got.rms });
          if (onProgress) onProgress(`operator cycle ${cycle} step ${it}: rms ${got.rms.toExponential(3)} (scale ${sc})`);
          break;
        }
        if (onProgress) onProgress(`operator cycle ${cycle} step ${it}: scale ${sc} rejected (${got.rms.toExponential(3)})`);
      }
      if (!took) { report.steps.push({ cycle, it, rejected: true }); break; }
    }
  }
  let duPk = 0;
  for (const row of T) for (const v of row) duPk = Math.max(duPk, Math.abs(v));
  report.rms = f0;
  report.duPk = duPk;
  report.evals = evals;
  return { f: mkF(T), report };
}

/** Sample-indexed accessor over a compiled artifact for a host's drive loop:
 * f(stepsSinceEngage) → du vector. The host restarts its program at engage so the
 * artifact's pre-roll and trajectory line up.
 *
 * PAST ITS STEADY LAP THE ARTIFACT REPEATS AT THE TRUE, FRACTIONAL LAP PHASE — and the
 * steady lap is a MIDDLE one, chosen by measurement twice over. The first accessor tiled
 * the last `tailSamples` by ROUNDED count: a 0.4-sample-per-lap phase slip on a
 * 7356.6-step lap (the deploy host's old `actAt` defect in new clothes) plus a `du` step
 * at the wrap — a ref kick at the SAME CORNER every lap, measured 16.6x the lap median
 * exactly where the owner found it. The second anchored a fractional-phase table at the
 * record's END — and a finite-horizon deconvolution owes nothing to laps it never plays,
 * so its terminal samples are edge-free garbage (measured: the last ~2% ramps to
 * 2.7e-1 against a mid-lap du of ~5e-2, and tiling it cost 2e-1 every lap). The table is
 * now the lap AFTER the first program lap — loaded by its predecessor, its response tail
 * absorbed by its successor — with the (small, settling-scale) endpoint mismatch
 * distributed linearly so the wrap is continuous, and the handoff at that lap's START so
 * every junction is continuous. Artifacts must be compiled with laps >= 3 for the middle
 * lap to exist; `compileTwin`'s default is 3.
 *
 * @param {object} o
 *   du        the compiled correction, one row per sample over [preRoll + trajectory]
 *   sample    steps per sample
 *   lapSteps  the program's TRUE lap length in STEPS (fractional — pass `path.lap`)
 *   preRoll   the artifact's pre-roll length in SAMPLES
 */
export function applyCompiled({ du, sample, lapSteps, preRoll }) {
  const span = du.length;
  const nCh = du[0].length;
  const at = (s) => {
    const s0 = Math.max(0, Math.min(span - 2, Math.floor(s))), fr = s - s0;
    const out = new Array(nCh);
    for (let c = 0; c < nCh; c++) out[c] = du[s0][c] + fr * (du[s0 + 1][c] - du[s0][c]);
    return out;
  };
  const lapSamples = lapSteps / sample;                    // fractional, on purpose
  // THE TILED LAP IS THE PENULTIMATE COMPILED LAP — the most SETTLED lap that still has
  // a successor absorbing its response tail. At laps 3 that is the second lap (the
  // validated stiff-machine case, unchanged); a soft machine's memory outlasts two laps
  // (measured: laps-3 tiling holds 1.26e-1 on K=1/E=0.06 where the stiff machine held
  // 1.4e-3), and compiling more laps only helps if the LATER lap is the one repeated.
  const nl = Math.floor((span - preRoll) / lapSamples);    // whole laps in the artifact
  const tailStart = preRoll + Math.max(1, nl - 2) * lapSamples;
  // an artifact too short to hold a middle lap would tile the record's edge garbage —
  // the 2e-1-per-lap failure this guard exists to make loud (compile with laps >= 3)
  if (tailStart + lapSamples > span - 2) {
    throw new Error(`applyCompiled: artifact too short to tile a middle lap `
      + `(span ${span}, need ${Math.ceil(tailStart + lapSamples + 2)}) — compile with laps >= 3`);
  }
  const e0 = at(tailStart), e1 = at(tailStart + lapSamples);
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
