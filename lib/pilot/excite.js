/**
 * @file THE EXCITATION BUILDER — a trajectory whose job is to cover a machine's dynamics
 * without ever leaving the limits the engineer gave it.
 *
 * WHY FILTERED NOISE AND NOT A MULTISINE. A sum of n sinusoids spans a 2n-dimensional
 * subspace in ANY lag window, so a window regression fitted to it is rank-deficient:
 * exact inside that subspace, whatever the ridge says outside it — and a deployment
 * trajectory is outside it. Measured on the 2R arm: a six-tone scribble trained a readout
 * to RMSE 1.38e-2 on a held-out program against 1.39e-3 for one trained on another
 * program — ten times worse, and worse than predicting zero. Three cascaded one-pole
 * filters on white noise excite every direction instead: flat well below the corner,
 * -60 dB/decade above it, so the acceleration stays affordable while the window still
 * sees full rank. Same features, same test, noise instead of tones: R² -5.2 → +0.97.
 *
 * EVERY LIMIT IS VERIFIED BY MEASUREMENT ON THE GENERATED SEQUENCE, never assumed from
 * the construction: velocity, acceleration and jerk are differenced from the samples that
 * will actually be commanded, and the corner period is RAISED until all three fit. The
 * derivatives handed out are exact differences of the commanded sequence, not analytic
 * derivatives of a model of it — this project has paid twice for a feedforward tracking a
 * velocity that is not the derivative of its own position.
 */

/** Deterministic LCG so a commissioning run is reproducible. */
export function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** One channel of 3-pole filtered noise, normalised to [lo, hi]. */
function channelNoise(rnd, steps, lo, hi, tc) {
  const a = Math.exp(-1 / tc);
  const p = new Float64Array(steps);
  let z1 = 0, z2 = 0, z3 = 0, min = Infinity, max = -Infinity;
  for (let k = 0; k < steps; k++) {
    const w = 2 * rnd() - 1;
    z1 = a * z1 + (1 - a) * w;
    z2 = a * z2 + (1 - a) * z1;
    z3 = a * z3 + (1 - a) * z2;
    p[k] = z3;
    if (z3 < min) min = z3;
    if (z3 > max) max = z3;
  }
  const g = max > min ? (hi - lo) / (max - min) : 0;
  const mid = 0.5 * (min + max);
  const c = 0.5 * (lo + hi);
  for (let k = 0; k < steps; k++) p[k] = c + (p[k] - mid) * g;
  return p;
}

/** Peak |first|, |second|, |third| difference of a series — the measured v, a, j. */
export function peakDiffs(p) {
  let v = 0, a = 0, j = 0;
  for (let k = 3; k < p.length; k++) {
    const d1 = Math.abs(p[k] - p[k - 1]);
    const d2 = Math.abs(p[k] - 2 * p[k - 1] + p[k - 2]);
    const d3 = Math.abs(p[k] - 3 * p[k - 1] + 3 * p[k - 2] - p[k - 3]);
    if (d1 > v) v = d1;
    if (d2 > a) a = d2;
    if (d3 > j) j = d3;
  }
  return { v, a, j };
}

/**
 * The C² ease — quintic smootherstep, zero velocity AND zero acceleration at both ends.
 *
 * A COSINE EASE IS NOT SMOOTH ENOUGH AND THE FAILURE IS AT THE ENDS: its acceleration is
 * maximal AT t = 0, so the junction from rest is an acceleration step, and the discrete
 * jerk across that junction IS the step — measured 3.5x over a jerk limit that every
 * interior sample respected. The quintic's peak derivatives have closed forms
 * (v: 15A/8T, a: 10A/√3·T², j: 60A/T³) and its endpoint acceleration is zero, so the
 * boundary contributes nothing the interior does not.
 */
export function smoother(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (10 - 15 * x + 6 * x * x);
}

/** Duration, in steps, that puts the quintic ease's own peaks at 90% of the limits. */
export function easeSteps(A, { vMax, aMax, jMax }) {
  const m = Math.abs(A);
  if (m === 0) return 2;
  const T = Math.max(
    (15 / 8) * m / (0.9 * vMax),
    Math.sqrt((10 / Math.sqrt(3)) * m / (0.9 * aMax)),
    Math.cbrt(60 * m / (0.9 * jMax)));
  return Math.max(2, Math.ceil(T));
}

/**
 * Build the excitation.
 *
 * @param {object} o
 * @param {Array} o.channels per channel { lo, hi, vMax, aMax, jMax } — position box and
 *   rate limits, all in the channel's own units per solver step.
 * @param {number} o.steps length of the useful (post-ramp) excitation
 * @param {number[]} o.start where the machine is now — the ramp begins here
 * @param {function|null} [o.workspace] predicate on the position vector. Violation
 *   shrinks every channel's span toward its centre and rebuilds; the predicate is
 *   checked on the SAMPLES THAT WILL BE COMMANDED, not on the box's corners.
 * @param {number} [o.seed]
 * @returns {{ pos: Float64Array[], ramp: number, total: number, meta: object }}
 *   pos[ch][k] over ramp + steps; meta reports the tc and the MEASURED peaks per channel.
 */
export function buildExcitation({ channels, steps, start, workspace = null, seed = 1 }) {
  const nCh = channels.length;
  let shrink = 1;
  // Per-channel floor under the corner period, raised whenever the FINAL sequence — the
  // one that will actually be commanded, ramp and regeneration included — exceeds a
  // limit. The first-pass tuning is a good guess and nothing more: the full-length
  // regeneration renormalises over more samples and the blend adds the ramp's own
  // derivatives, and both moved the measured peaks a factor past the guess.
  const tcFloor = new Array(nCh).fill(60);
  for (let attempt = 0; attempt < 24; attempt++) {
    const series = [];
    const meta = { tc: [], measured: [], shrink };
    for (let c = 0; c < nCh; c++) {
      const { lo, hi, vMax, aMax, jMax } = channels[c];
      const ctr = 0.5 * (lo + hi), half = 0.5 * (hi - lo) * shrink;
      // THE CORNER PERIOD IS RAISED UNTIL THE MEASURED PEAKS FIT. Each retry keeps the
      // SPAN (coverage is the point) and slows the trajectory; the loop terminates
      // because every peak difference of the normalised series falls monotonically as
      // tc grows, and 40 doublings is far past any physical corner.
      let tc = tcFloor[c];
      let p = null, pk = null;
      for (let t = 0; t < 40; t++) {
        p = channelNoise(lcg(seed + 101 * c + 7919 * attempt), steps, ctr - half, ctr + half, tc);
        pk = peakDiffs(p);
        // 0.7 of each limit, because the approach ramp below is BLENDED onto this
        // trajectory and the seam's derivatives are the SUM of the two.
        if (pk.v <= 0.7 * vMax && pk.a <= 0.7 * aMax && pk.j <= 0.7 * jMax) break;
        tc *= 1.35;
      }
      meta.tc.push(tc);
      meta.measured.push(pk);
      series.push(p);
    }
    // THE APPROACH IS A BLEND ONTO THE MOVING TRAJECTORY, NOT A RAMP TO ITS FIRST POINT.
    // A ramp that ends at rest butted against a trajectory that starts in motion has a
    // velocity discontinuity at the seam — one enormous second and third difference that
    // no amount of filtering upstream can remove. Measured: the jerk peak sat at 17x the
    // limit however slow the excitation was made, and every sample of it lived at the
    // seam. Blending cmd = excitation + offset·w(k), with w falling 1 → 0 on a cosine,
    // keeps the command C¹ everywhere; the window's own derivative peaks are the closed
    // forms in easeSteps, sized against the 30% of each limit the excitation left free.
    let rampN = 2;
    for (let c = 0; c < nCh; c++) {
      const lim = channels[c];
      rampN = Math.max(rampN, easeSteps(series[c][0] - start[c],
        { vMax: 0.3 * lim.vMax, aMax: 0.3 * lim.aMax, jMax: 0.3 * lim.jMax }));
    }
    const pos = [];
    for (let c = 0; c < nCh; c++) {
      // Regenerated at full length with the SAME seed, so sample 0 — which set the ramp
      // — is unchanged and the series simply continues past where the first pass ended.
      // Clamping the shorter series would put a velocity-sized kink at its last sample.
      const { lo, hi } = channels[c];
      const ctr = 0.5 * (lo + hi), half = 0.5 * (hi - lo) * shrink;
      const full = channelNoise(lcg(seed + 101 * c + 7919 * attempt),
        rampN + steps, ctr - half, ctr + half, meta.tc[c]);
      const out = new Float64Array(rampN + steps);
      const off = start[c] - full[0];
      for (let k = 0; k < rampN + steps; k++) {
        const w = k < rampN ? 1 - smoother(k / rampN) : 0;
        out[k] = full[k] + off * w;
      }
      pos.push(out);
    }
    // VERIFY THE SEQUENCE THAT WILL BE COMMANDED — every limit, on the final samples.
    let limitsOk = true;
    for (let c = 0; c < nCh; c++) {
      const pk = peakDiffs(pos[c]);
      meta.measured[c] = pk;
      if (pk.v > channels[c].vMax || pk.a > channels[c].aMax || pk.j > channels[c].jMax) {
        tcFloor[c] = Math.max(tcFloor[c] * 1.35, meta.tc[c] * 1.35);
        limitsOk = false;
      }
    }
    if (!limitsOk) continue;
    if (workspace) {
      let ok = true;
      const q = new Array(nCh);
      for (let k = 0; k < rampN + steps && ok; k += 1) {
        for (let c = 0; c < nCh; c++) q[c] = pos[c][k];
        if (!workspace(q)) ok = false;
      }
      if (!ok) { shrink *= 0.88; continue; }
    }
    return { pos, ramp: rampN, total: rampN + steps, meta };
  }
  throw new Error('excitation: the workspace predicate rejects even a span shrunk to '
    + `${(100 * shrink).toFixed(0)}% of the position box — the box and the workspace disagree`);
}
