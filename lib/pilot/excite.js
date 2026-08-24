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

/**
 * A FEEDRATE FOR THE SCRIBBLE — a smooth time-warp whose rate dips to near zero.
 *
 * OFF BY DEFAULT, BECAUSE IT MEASURED NULL WHERE IT WAS SUPPOSED TO WIN AND NEGATIVE
 * everywhere else. The hypothesis: programs brake to near rest at corners — backlash
 * faces change, stiction re-breaks — and a scribble that never stops under-covers that
 * regime, which would explain the square's 1.6x against the circle's 7x. Measured, on
 * the arm, everything else identical: square 1.64x → 1.69x (nothing), rounded rect
 * 2.10x → 1.79x, circle 7.10x → 4.87x. Spending 60% of the run crawling starves the
 * fits of information about the fast dynamics that matter at speed, and buys nothing at
 * the corners — whatever limits the square, it is not near-zero-velocity coverage. Kept
 * as an option because a plant with heavier stiction may answer differently; the
 * measurement that would change the default is that plant's verify ratio.
 */
function timeWarp(rnd, steps, tc) {
  const a = Math.exp(-1 / tc);
  const r = new Float64Array(steps);
  let z1 = 0, z2 = 0, lo = Infinity, hi = -Infinity;
  for (let k = 0; k < steps; k++) {
    const w = 2 * rnd() - 1;
    z1 = a * z1 + (1 - a) * w;
    z2 = a * z2 + (1 - a) * z1;
    r[k] = z2;
    if (z2 < lo) lo = z2;
    if (z2 > hi) hi = z2;
  }
  const span = hi - lo || 1;
  let s = 0;
  const warp = new Float64Array(steps);
  for (let k = 0; k < steps; k++) {
    const z = (r[k] - lo) / span;                 // 0..1
    warp[k] = s;
    s += 0.02 + 0.98 * Math.pow(z, 1.6);          // rate floor 2%: a dwell, not a stop
  }
  return { warp, total: s };
}

/** One channel of raw 3-pole filtered noise. Normalisation happens on the sequence that
 * will actually be commanded — after any time-warp — because a warp visits only a prefix
 * of this series and the extremes may live in the part it never reaches. */
function channelNoise(rnd, steps, tc) {
  const a = Math.exp(-1 / tc);
  const p = new Float64Array(steps);
  let z1 = 0, z2 = 0, z3 = 0;
  for (let k = 0; k < steps; k++) {
    const w = 2 * rnd() - 1;
    z1 = a * z1 + (1 - a) * w;
    z2 = a * z2 + (1 - a) * z1;
    z3 = a * z3 + (1 - a) * z2;
    p[k] = z3;
  }
  return p;
}

/**
 * A LOG SWEEP THROUGH THE BAND THE PLANT ACTUALLY RESONATES IN.
 *
 * Filtered noise is broadband but SMOOTH, and smooth is exactly what a jerk limit
 * rewards — so the tune loop, doing its job, hands back a series whose energy sits
 * below the modes that matter. Measured on the 2R arm at its softest gearbox: the
 * shipped excitation carried **2.7x less acceleration energy at the shoulder's ring
 * frequency than the part program does**, while matching it in overall rms. The model
 * therefore never saw the arm spring-load, could not forecast the ring, and a forecast
 * that cannot see an event cannot preempt it — the QP was timid because it was
 * ignorant, not because its objective was wrong.
 *
 * The sweep is the textbook answer and it stays plant-agnostic: the pilot measures its
 * own settling time, and the band follows from that number alone.
 *
 * THE AMPLITUDE IS BOUNDED ANALYTICALLY RATHER THAN TUNED, because a sine's derivatives
 * are known exactly: A*sin(phi) has |v| = A*w, |a| = A*w^2, |j| = A*w^3, all worst at
 * the FASTEST frequency in the sweep. So the chirp is sized to fit its share of every
 * limit before a single sample is generated, and it can never be the term that pushes
 * the commanded sequence over one.
 *
 * @param {number} steps  length
 * @param {number} pLo    shortest period in the sweep (fastest)
 * @param {number} pHi    longest period (slowest)
 * @param {number} amp    amplitude, in the same units as the position series
 */
function chirp(steps, pLo, pHi, amp) {
  const out = new Float64Array(steps);
  if (!(amp > 0) || !(pLo > 1) || !(pHi > pLo) || steps < 4) return out;
  const r = pHi / pLo, lr = Math.log(r), T = steps;
  for (let k = 0; k < steps; k++) {
    // phase = 2*pi * integral of 1/p(t) dt, with p sweeping pHi -> pLo geometrically
    const ph = (2 * Math.PI * T / (pHi * lr)) * (Math.pow(r, k / T) - 1);
    out[k] = amp * Math.sin(ph);
  }
  return out;
}

/** The largest chirp amplitude that fits a share of each rate limit at its fastest. */
function chirpAmp(pLo, lim, share) {
  const w = 2 * Math.PI / pLo;
  return Math.min(share * lim.vMax / w, share * lim.aMax / (w * w),
    share * lim.jMax / (w * w * w));
}

/** Scale a series in place to span [lo, hi]. */
function normalise(p, lo, hi) {
  let min = Infinity, max = -Infinity;
  for (const v of p) { if (v < min) min = v; if (v > max) max = v; }
  const g = max > min ? (hi - lo) / (max - min) : 0;
  const mid = 0.5 * (min + max), c = 0.5 * (lo + hi);
  for (let k = 0; k < p.length; k++) p[k] = c + (p[k] - mid) * g;
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
export function buildExcitation({ channels, steps, start, workspace = null, seed = 1,
  chirpBand = null,
  dwell = false }) {
  const nCh = channels.length;
  let shrink = 1;
  // Per-channel floor under the corner period, raised whenever the FINAL sequence — the
  // one that will actually be commanded, warp, ramp and all — exceeds a limit. The tune
  // below measures the warped series directly, so escalation is the exception; when it
  // still compounds past the run's own length the box, the limits and the duration are
  // INCOMPATIBLE, and the honest output is a refusal that says so — the alternative was
  // measured: the corner period ran to 2.4e16, the noise went flat, and a flat line
  // PASSES every rate limit while exciting nothing at all.
  const tcFloor = new Array(nCh).fill(60);
  // WHY EACH ATTEMPT FAILED, counted, so the exhaustion error names the dominant cause.
  // A single attempt's tune hitting its cap is that attempt's noise, not a verdict — the
  // first version threw 'cannot traverse' from inside an attempt and MASKED a workspace
  // that was rejecting everything, which is the one message the engineer needed.
  const why = { tune: 0, ramp: 0, limits: 0, workspace: 0 };
  for (let attempt = 0; attempt < 24; attempt++) {
    const pos = [];
    const meta = { tc: [], measured: [], shrink };
    let feasible = true;
    for (let c = 0; c < nCh; c++) {
      const { lo, hi } = channels[c];
      const ctr = 0.5 * (lo + hi), half = 0.5 * (hi - lo) * shrink;
      let tc = tcFloor[c];
      let out = null;
      // THE TWO COMPONENTS GET SEPARATE SHARES OF THE LIMITS AND NEITHER TUNES THE
      // OTHER. The first attempt coupled them — halving the sweep's share on every
      // noise-tune failure — and the sweep was DEAD ON ARRIVAL: this plant's jerk limit
      // needs nine tune iterations before the noise fits, by which point the share had
      // halved to nothing and the built series was byte-identical to the old one. The
      // sweep never needed shrinking: its derivatives are known in closed form, so it
      // is sized to fit its share before a sample exists, and the noise is tuned against
      // what is left. Their peaks can only add to the same 0.8 the noise alone used.
      const cShare = chirpBand ? 0.25 : 0;
      for (let t = 0; t < 40; t++) {
        // THE TUNE MEASURES THE WARPED, NORMALISED SEQUENCE — the thing that will be
        // commanded — not the raw noise. Tuning on the unwarped series and hoping a
        // margin covers the warp is what compounded into the runaway above: the warp
        // visits a prefix whose normalisation stretches every derivative.
        const wp = dwell
          ? timeWarp(lcg(seed + 4241 * c + 31 * attempt), steps, Math.min(4 * tc, steps / 6))
          : null;
        const nLen = wp ? Math.ceil(wp.total) + 2 : steps;
        const full = channelNoise(lcg(seed + 101 * c + 7919 * attempt), nLen, tc);
        out = new Float64Array(steps);
        for (let k = 0; k < steps; k++) {
          if (wp) {
            const x = wp.warp[k];
            const i = Math.floor(x), f = x - i;
            out[k] = full[i] + (full[Math.min(i + 1, full.length - 1)] - full[i]) * f;
          } else out[k] = full[k];
        }
        // THE SWEEP RIDES ON THE NOISE, and it is added BEFORE the tune measures, so
        // the limits are checked on the composed sequence that will actually be
        // commanded — the same discipline the warp forced (see above).
        normalise(out, ctr - half, ctr + half);
        if (cShare > 0) {
          const a = Math.min(chirpAmp(chirpBand[0], channels[c], cShare), half * cShare);
          const ch = chirp(steps, chirpBand[0], chirpBand[1], a);
          for (let k = 0; k < steps; k++) out[k] += ch[k];
          // AND THE COMPOSED SERIES IS RE-NORMALISED, because the acceptance below
          // demands the excitation still SPAN the engineer's box (rule: coverage is
          // part of acceptance, not a bonus). Normalising the noise to a reduced span
          // to leave room for the sweep is the obvious move and it FAILS that check —
          // measured, the builder refused 24 attempts running with cause `limits`, the
          // span having landed at 0.75 of the box against a required 0.85. The sweep's
          // own amplitude here is ~1% of the span, so this rescale is a 1% touch on
          // derivatives already bounded to a quarter of each limit.
          normalise(out, ctr - half, ctr + half);
        }
        const pk = peakDiffs(out);
        // 0.8 of each limit for the moving series: the approach blend below adds its own
        // derivatives, sized against the remaining 0.2. The sweep's share comes out of
        // the 0.8, never out of the ramp's 0.2.
        if (pk.v <= 0.8 * channels[c].vMax && pk.a <= 0.8 * channels[c].aMax
          && pk.j <= 0.8 * channels[c].jMax) break;
        tc *= 1.35;
        if (tc > steps / 2) { feasible = false; break; }
      }
      if (!feasible) break;
      meta.tc.push(tc);
      meta.chirp = meta.chirp || [];
      meta.chirp.push(cShare);
      pos.push(out);
    }
    if (!feasible) { why.tune++; continue; }
    // The approach: blended onto the moving trajectory over a C² window, sized against
    // the 20% of each limit the tune left free.
    let rampN = 2;
    for (let c = 0; c < nCh; c++) {
      const lim = channels[c];
      rampN = Math.max(rampN, easeSteps(pos[c][0] - start[c],
        { vMax: 0.2 * lim.vMax, aMax: 0.2 * lim.aMax, jMax: 0.2 * lim.jMax }));
    }
    if (rampN >= steps) { why.ramp++; continue; }
    for (let c = 0; c < nCh; c++) {
      const off = start[c] - pos[c][0];
      for (let k = 0; k < rampN; k++) pos[c][k] += off * (1 - smoother(k / rampN));
    }
    // VERIFY THE SEQUENCE THAT WILL BE COMMANDED: every rate limit, AND the coverage —
    // a trajectory that hugs its centre passes every rate limit while commissioning
    // nothing, so the span is part of the contract, not a hope.
    let limitsOk = true;
    for (let c = 0; c < nCh; c++) {
      const pk = peakDiffs(pos[c]);
      meta.measured[c] = pk;
      let mn = Infinity, mx = -Infinity;
      for (const v of pos[c]) { if (v < mn) mn = v; if (v > mx) mx = v; }
      const wantSpan = (channels[c].hi - channels[c].lo) * shrink;
      if (pk.v > channels[c].vMax || pk.a > channels[c].aMax || pk.j > channels[c].jMax
        || (mx - mn) < 0.85 * wantSpan) {
        tcFloor[c] = Math.max(tcFloor[c], meta.tc[c]) * 1.35;
        limitsOk = false;
      }
    }
    if (!limitsOk) { why.limits++; continue; }
    if (workspace) {
      let ok = true;
      const q = new Array(nCh);
      for (let k = 0; k < steps && ok; k += 1) {
        for (let c = 0; c < nCh; c++) q[c] = pos[c][k];
        if (!workspace(q)) ok = false;
      }
      if (!ok) { why.workspace++; shrink *= 0.88; continue; }
    }
    return { pos, ramp: rampN, total: steps, meta };
  }
  const dominant = Object.entries(why).sort((a, b) => b[1] - a[1])[0][0];
  const msgs = {
    workspace: 'the workspace predicate rejects even a span shrunk to '
      + `${(100 * shrink).toFixed(0)}% of the position box — the box and the workspace disagree`,
    tune: `these rate limits cannot traverse the position box inside ${steps} steps — `
      + 'a corner period past half the run leaves nothing to excite. More time, a '
      + 'smaller box, or honest limits',
    ramp: 'the approach from the start pose eats the whole duration under these limits',
    limits: 'the commanded sequence kept exceeding a rate limit however slow it was made',
  };
  throw new Error(`excitation (${JSON.stringify(why)}): ${msgs[dominant]}`);
}
