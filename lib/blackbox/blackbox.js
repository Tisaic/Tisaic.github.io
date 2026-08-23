// A CONTROLLER THAT IS GIVEN NOTHING ABOUT THE PLANT.
//
// This is the library's own promise taken literally: walk up to a machine, route one
// command in and two signals out, press one button, and get estimation, forecasting and
// CONTROL without telling it anything. Everything the rest of FlexiSim's control path is
// handed off the CAD -- the arm length, the inertia, the gravity torque, the gear ratio,
// the gearbox stiffness, the bending mode -- is absent here and identified from data or
// not used at all.
//
// WHAT IT IS ALLOWED TO KNOW, and this list is the contract:
//   * it can evaluate the scalar COMMAND at any step, past or future, because a
//     controller planned the trajectory and always has it;
//   * it can add a scalar CORRECTION to that command;
//   * it receives an array of SIGNALS per sample, whose meaning it never learns;
//   * during commissioning ONLY, it receives the scalar TRUTH an instrument provides.
// Nothing else. No units, no geometry, no sign convention, no resonance, not even
// whether the machine is a robot.
//
// THE THREE IDENTIFIED OBJECTS, all from the same probe or from the same stream:
//   h  the impulse response from CORRECTION to TRUTH. Replaces the arm length (its DC
//      gain), the sign convention (its sign), the servo lead (its peak position) and the
//      resonance a shaper would need (its own ringing).
//   e^ a map from a WINDOW of the command to the truth, fitted while running with no
//      correction. This is the disturbance the trajectory itself creates.
//   q  the regularised FIR inverse of h, so the correction that cancels e^ is -q * e^.
//
// WHY NOT ITERATIVE LEARNING, which is what the model-based tab uses: ILC needs a
// REPEATABLE trajectory and a hand-tuned phase lead, and both are assumptions about the
// application rather than about the plant. Identify h once and the correction is
// one-shot and works on a trajectory the machine has never run.

import { SoftSensor } from '../ngrc/softsensor.js';
import { universalMap, prunedMap } from '../ngrc/feature_map.js';
import { PreviewMPC } from './qp.js';

/**
 * Solve A x = b. A is destroyed.
 *
 * CHOLESKY WHERE THE MATRIX ALLOWS IT, AND THAT IS ALMOST ALWAYS HERE. Every system this
 * module solves is a set of RIDGED NORMAL EQUATIONS — A = FᵀF + λI — which is symmetric
 * positive definite by construction, so the full Gauss-Jordan elimination it used to do
 * was solving a general problem it never has. Cholesky is n³/6 against n³, and it does
 * not build the n×(n+1) augmented copy that the old version made by spreading each typed
 * row into a boxed array.
 *
 * MEASURED at n = 735, which is the basis search's largest system: 520 ms → 173 ms, a
 * 3.0x saving on a solve that runs INSIDE ONE ANIMATION FRAME, and the two answers agree
 * to 1.8e-14 relative. That last number is the reason this is safe: it is the same answer,
 * not a cheaper approximation of it.
 *
 * IT FALLS BACK RATHER THAN ASSUMING. If the factorisation meets a non-positive pivot the
 * matrix was not what this expected — a caller with a different system, or a ridge too
 * small to rescue a rank-deficient fit — and the general elimination runs instead. The
 * fallback is not dead code: it is what makes the fast path safe to take without the
 * caller having to promise anything.
 */
function solve(A, b) {
  const n = b.length;
  const L = A.map((r) => Float64Array.from(r));
  let ok = true;
  for (let i = 0; i < n && ok; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = L[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (!(sum > 0)) { ok = false; break; }
        L[i][i] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  if (ok) {
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = b[i];
      for (let k = 0; k < i; k++) sum -= L[i][k] * y[k];
      y[i] = sum / L[i][i];
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let sum = y[i];
      for (let k = i + 1; k < n; k++) sum -= L[k][i] * x[k];
      x[i] = sum / L[i][i];
    }
    return Array.from(x);
  }
  return solveGeneral(A, b);
}

/** Gaussian elimination with partial pivoting — the fallback, and the reference. */
function solveGeneral(A, b) {
  const n = b.length;
  const M = A.map((r, i) => Float64Array.from([...r, b[i]]));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-300;
    for (let j = c; j <= n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c || M[r][c] === 0) continue;
      const g = M[r][c];
      for (let j = c; j <= n; j++) M[r][j] -= g * M[c][j];
    }
  }
  return M.map((r) => r[n]);
}

/**
 * IS THIS AN IDENTIFICATION AT ALL? Two questions, both of which the module was already
 * computing the answer to and neither of which it acted on.
 *
 * (1) The step test and the probe are two INDEPENDENT readings of the same DC gain, so
 *     they can check each other — a disagreement in SIGN, or by more than a factor of a
 *     few, means one of them was confounded. A comment in this file promised exactly
 *     that check for months and no code did it: `dc` was computed, printed, and compared
 *     to nothing.
 * (2) `plantR2` is the plant model's score on a stretch of the probe it was not fitted
 *     to. It was computed and gated on nothing.
 *
 * MEASURED on a joint with Stribeck friction: the step test returned dc = -0.08 against
 * a true 15.5, the probe fit returned R2 = 0.003, and the module designed anyway,
 * deployed a filter, and made the machine WORSE — 0.81x at the heaviest friction,
 * reported as 1.33x. The verify round could not save it, because with a meaningless map
 * the ratio it measures is meaningless in the same direction.
 *
 * "I could not model this machine" is a better answer than a number, and it is
 * actionable in a way 0.81x-reported-as-1.33x is not.
 *
 * @param {number} dc   DC gain from the step test
 * @param {number} gain DC gain implied by the identified impulse response
 * @param {number} r2   held-out score of that impulse response on the probe
 * @returns {{ok:boolean, why:string|null}}
 */
export function identGate(dc, gain, r2) {
  const finite = Number.isFinite(dc) && Number.isFinite(gain) && Number.isFinite(r2);
  if (!finite) return { ok: false, why: 'the identification produced a non-finite number' };
  const agree = dc !== 0 && gain !== 0 && dc * gain > 0
    && Math.abs(Math.log(Math.abs(gain / dc))) < Math.log(3);
  if (!agree) {
    return { ok: false,
      why: 'the step test and the probe disagree about the plant\'s gain '
        + `(${dc.toPrecision(3)} against ${gain.toPrecision(3)})` };
  }
  if (!(r2 >= 0.5)) {
    return { ok: false,
      why: `the plant model explains ${(100 * r2).toFixed(0)}% of held-out probe data, `
        + 'which is not a plant model' };
  }
  return { ok: true, why: null };
}

/**
 * A pseudo-random binary sequence, held for `dwell` samples per bit.
 *
 * WHY A PRBS AND NOT A STEP OR A CHIRP. A step identifies the DC gain and nothing about
 * the dynamics; a chirp identifies the dynamics but concentrates its energy in a sweep,
 * so the estimate is only as good as wherever the sweep happened to dwell. A PRBS is
 * flat to the reciprocal of its bit length and its autocorrelation is nearly a delta,
 * which is exactly what makes the deconvolution below well conditioned. Deterministic
 * from a seed, so a commissioning run is reproducible -- a probe you cannot repeat is a
 * probe you cannot argue about.
 */
export function prbs(n, { seed = 1, dwell = 1 } = {}) {
  let reg = (seed | 0) & 0x7fff || 1;
  const out = new Float64Array(n);
  let bit = 1;
  for (let i = 0; i < n; i++) {
    if (i % dwell === 0) {
      // 15-bit maximal-length LFSR, taps 15 and 14.
      const nb = ((reg >> 0) ^ (reg >> 1)) & 1;
      reg = (reg >> 1) | (nb << 14);
      bit = (reg & 1) ? 1 : -1;
    }
    out[i] = bit;
  }
  return out;
}

/**
 * Least-squares deconvolution: the impulse response h with y[k] ~ sum_j h[j] u[k-j].
 *
 * NORMAL EQUATIONS ON THE AUTOCORRELATION, which for a PRBS input is nearly diagonal and
 * therefore stable without any tuning. The ridge is relative to the diagonal so it means
 * the same thing whatever the units are -- and units are exactly what this module is not
 * allowed to know.
 */
export function deconvolve(u, y, { taps = 60, ridge = 1e-6 } = {}) {
  const N = Math.min(u.length, y.length);
  const M = Math.min(taps, N - 1);
  const R = Array.from({ length: M }, () => new Float64Array(M));
  const r = new Float64Array(M);
  for (let i = 0; i < M; i++) {
    for (let j = i; j < M; j++) {
      let a = 0;
      for (let k = M; k < N; k++) a += u[k - i] * u[k - j];
      R[i][j] = a; R[j][i] = a;
    }
    let b = 0;
    for (let k = M; k < N; k++) b += y[k] * u[k - i];
    r[i] = b;
  }
  let tr = 0;
  for (let i = 0; i < M; i++) tr += R[i][i];
  const lam = ridge * (tr / M || 1);
  for (let i = 0; i < M; i++) R[i][i] += lam;
  return Float64Array.from(solve(R, r));
}

/**
 * What the impulse response says about the plant, in the terms a controller needs.
 *
 * EVERY ONE OF THESE REPLACES SOMETHING THE MODEL-BASED PATH IS TOLD. `gain` is the DC
 * response and stands in for the arm length AND the sign convention; `delay` is where
 * the response peaks and stands in for the hand-tuned servo lead; `period` and `zeta`
 * come from the response's own ringing and stand in for the measured bending mode.
 */
export function summarise(h) {
  let gain = 0, peak = 0, delay = 0;
  for (let i = 0; i < h.length; i++) {
    gain += h[i];
    if (Math.abs(h[i]) > Math.abs(peak)) { peak = h[i]; delay = i; }
  }
  // Zero crossings AFTER the peak: the ringing rides on the response's own decay.
  const cross = [];
  for (let i = delay + 1; i < h.length; i++) {
    if ((h[i - 1] < 0) !== (h[i] < 0)) cross.push(i);
  }
  let period = null, zeta = null;
  if (cross.length >= 4) {
    period = 2 * (cross[cross.length - 1] - cross[0]) / (cross.length - 1);
    const pk = [];
    for (let c = 1; c < cross.length; c++) {
      let m = 0;
      for (let i = cross[c - 1]; i < cross[c]; i++) m = Math.max(m, Math.abs(h[i]));
      if (m > 0) pk.push([cross[c - 1], Math.log(m)]);
    }
    if (pk.length >= 3) {
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const [a, b] of pk) { sx += a; sy += b; sxx += a * a; sxy += a * b; }
      const n = pk.length;
      const sigma = -(n * sxy - sx * sy) / (n * sxx - sx * sx);
      const w = 2 * Math.PI / period;
      zeta = sigma / Math.sqrt(sigma * sigma + w * w);
    }
  }
  return { gain, peak, delay, period, zeta, taps: h.length };
}

/**
 * A regularised FIR inverse: q with (h * q) ~ a unit impulse at `centre`.
 *
 * THE CENTRE IS WHY THIS CAN WORK AT ALL. A plant with delay has no causal inverse, so
 * the exact inverse is asked for as an impulse placed `centre` samples in -- i.e. the
 * correction is allowed to act AHEAD of the error it cancels, which is legitimate here
 * and only here, because the command is planned and the disturbance it creates is
 * therefore known in advance. That is the same property the model-based path exploits
 * when it evaluates its compliance model at a FUTURE reference point, except that there
 * the lead is a number somebody chose and here it comes out of the identification.
 *
 * The ridge is what keeps the inverse from being an amplifier at frequencies the probe
 * could not see. Without it a lightly damped plant inverts to something with enormous
 * gain exactly where the identification is least trustworthy.
 */
export function firInverse(h, { length = 40, ridge = 1e-3, centre = null,
                                width = 0 } = {}) {
  const M = h.length, L = length;
  const c = centre == null ? Math.floor(L / 2) : centre;
  const n = M + L - 1;
  // THE TARGET IS A SMOOTH PULSE, NOT A DELTA, and that is the difference between a
  // correction and an amplifier.
  //
  // Asking for a delta asks the inverse to be exact at EVERY frequency, including the
  // ones the probe could not excite and the ones the plant rolls off -- where h is noise
  // and 1/h is enormous. Measured on all three plants: with a delta target the inverse
  // "worked" on paper and made the closed loop 1.3x to 3x WORSE, because it was
  // faithfully inverting the identification's own noise floor.
  //
  // A raised-cosine target of half-width `width` asks for exactness only up to about
  // 1/(2*width) and for silence above it. That is a Q-filter, arrived at from the other
  // direction: ILC reaches it as a robustness patch on an iteration, and here it falls
  // out of asking what the inverse is allowed to claim. `width` comes from the identified
  // dynamics rather than from a constant, so it is not a tuning knob either.
  const wHalf = Math.max(0, Math.round(width));
  const d = new Float64Array(n);
  if (wHalf <= 0) d[c] = 1;
  else {
    let sum = 0;
    for (let i = -wHalf; i <= wHalf; i++) {
      const idx = c + i;
      if (idx < 0 || idx >= n) continue;
      const v = 0.5 * (1 + Math.cos(Math.PI * i / (wHalf + 1)));
      d[idx] = v; sum += v;
    }
    for (let i = 0; i < n; i++) d[i] /= sum || 1;
  }
  // minimise || H q - d ||^2 + lam ||q||^2, H the convolution matrix of h
  const A = Array.from({ length: L }, () => new Float64Array(L));
  const b = new Float64Array(L);
  for (let i = 0; i < L; i++) {
    for (let j = i; j < L; j++) {
      let a = 0;
      for (let k = 0; k < n; k++) {
        const hi = k - i, hj = k - j;
        if (hi >= 0 && hi < M && hj >= 0 && hj < M) a += h[hi] * h[hj];
      }
      A[i][j] = a; A[j][i] = a;
    }
    let bi = 0;
    for (let k = 0; k < n; k++) {
      const hi = k - i;
      if (hi >= 0 && hi < M) bi += h[hi] * d[k];
    }
    b[i] = bi;
  }
  let tr = 0;
  for (let i = 0; i < L; i++) tr += A[i][i];
  const lam = ridge * (tr / L || 1);
  for (let i = 0; i < L; i++) A[i][i] += lam;
  return { q: Float64Array.from(solve(A, b)), centre: c, width: wHalf };
}

/**
 * THE OPTIMAL PREVIEW FEEDFORWARD: one fixed FIR, run over the reference's LOOK-AHEAD.
 *
 *     u(k) = sum_j q_j * dhat(k + (centre - j) * grid)
 *
 * and q solves
 *
 *     min over q   || d + H (S q) ||^2  +  lambda || D (S q) ||^2
 *
 * with H the identified impulse response, S the Toeplitz operator that turns the tap
 * vector into the command, D a first difference, and dhat the disturbance the map
 * predicts from the command window. Three things follow.
 *
 * FIRST, NOTHING IN IT ASSUMES THE PROGRAM REPEATS. An earlier version solved the whole
 * trajectory at once as a circulant system, which is exact for all time and worth 6.9x on
 * a repeating move -- and is worth nothing at all the moment the program stops repeating,
 * which is the normal case on a machine. A fixed filter over the look-ahead answers the
 * same objective for an arbitrary command, and it is what a motion controller can
 * actually run: the whole run-time cost is `taps` multiply-adds per grid sample.
 *
 * SECOND, lambda IS THE CONTROL-EFFORT KNOB and it is in the same units on every plant:
 * it trades tracking against how hard the command has to move, which is what a drive
 * pays for. The residual design's equivalent knob was the width of a low-pass target,
 * a bandwidth heuristic that says nothing about effort.
 *
 * THIRD, THE FILTER IS FREE TO PRE-ACTUATE, and that is not programmed here. Taps with
 * j < centre multiply the FUTURE of the command, so the solution may move the machine
 * before the reference does and, on a flexible plant, move it the wrong way first to set
 * up momentum it then rides. Whether it does is measured, not asserted.
 *
 * THE NORMAL EQUATIONS ARE CORRELATIONS, which is why this is cheap enough to search
 * over: every regressor column is the same sequence z = h (*) dhat at a different shift,
 * so <g_i, g_j> depends only on i-j. The solve is taps x taps -- 32 x 32 on the arm --
 * and a whole lambda sweep costs less than one probe sample of plant time.
 *
 * @param {Float64Array} h      identified impulse response, on the grid
 * @param {Float64Array} dHat   the map's predicted disturbance -- what the filter will
 *   actually see at run time, so it is what the filter must be designed against
 * @param {Float64Array} dMeas  the MEASURED disturbance -- what we want cancelled
 * @returns {Float64Array} the taps
 */
export function optimalPreview(h, dHat, dMeas, { taps, centre, lambda, from, to }) {
  const N = dHat.length, M = h.length, L = taps;
  const z = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    let a = 0;
    for (let j = 0; j < M; j++) if (k - j >= 0) a += h[j] * dHat[k - j];
    z[k] = a;
  }
  const at = (arr, i) => (i >= 0 && i < N ? arr[i] : 0);
  const A = Array.from({ length: L }, () => new Float64Array(L));
  const E = Array.from({ length: L }, () => new Float64Array(L));
  const b = new Float64Array(L);
  for (let i = 0; i < L; i++) {
    for (let j = i; j < L; j++) {
      let a = 0, e = 0;
      for (let k = from; k < to; k++) {
        a += at(z, k + centre - i) * at(z, k + centre - j);
        e += (at(dHat, k + centre - i) - at(dHat, k - 1 + centre - i))
           * (at(dHat, k + centre - j) - at(dHat, k - 1 + centre - j));
      }
      A[i][j] = A[j][i] = a; E[i][j] = E[j][i] = e;
    }
    let bb = 0;
    for (let k = from; k < to; k++) bb -= dMeas[k] * at(z, k + centre - i);
    b[i] = bb;
  }
  // lambda is scaled by the ratio of the two traces so that lambda = 1 means "the effort
  // term matters as much as the tracking term" on ANY plant, in ANY units. Without that
  // the same number means something different on an axis measured in millimetres and one
  // measured in degrees, which is the one thing this module cannot afford.
  let tr = 0, te = 0;
  for (let i = 0; i < L; i++) { tr += A[i][i]; te += E[i][i]; }
  const sc = te > 0 ? tr / te : 1;
  for (let i = 0; i < L; i++) {
    for (let j = 0; j < L; j++) A[i][j] += lambda * sc * E[i][j];
    A[i][i] += 1e-9 * (tr / L || 1);
  }
  return Float64Array.from(solve(A, b));
}

/**
 * A ridge map from a WINDOW of the scalar command to a scalar output.
 *
 * THE ONLY STRUCTURE IT ASSUMES IS THAT THE COMMAND IS A NUMBER OVER TIME. It builds its
 * own lags and its own first and second DIFFERENCES -- which are data, not knowledge:
 * nobody told it that the first difference is a velocity or that the plant has inertia.
 * That is what makes the same object usable on an axis, a tank of liquid or a heater.
 */
export class WindowMap {
  /**
   * @param {boolean|object} [nonlinear] use the library's UNIVERSAL MAP on the window --
   *   bias + linear + all cross-quadratics + ReLU + Fourier features -- instead of the
   *   raw window.
   *
   *   THIS IS THE ONLY PLACE NONLINEARITY BELONGS IN THIS MODULE, and the distinction is
   *   worth being exact about because it is the honest limit of the whole approach. The
   *   PLANT path (the impulse response and its inverse) is treated as linear and
   *   time-invariant: that is an assumption, not an omission, and it is what lets a
   *   correction be designed in one shot from one probe. The DISTURBANCE the trajectory
   *   creates has no such excuse -- backlash, stiction and a nonlinear spring all make it
   *   a nonlinear function of the command -- so that half gets the full basis.
   *
   *   MEASURED ON THE ARM, linear window vs universal map, everything else identical:
   *   the CORRECTION is unchanged (1.17x against 1.15x, inside the run-to-run spread) but
   *   the IDENTIFICATION is much better -- the impulse response's ringing comes back at
   *   960 steps against the arm's real 980 rather than at 400, and its delay at 650 steps
   *   rather than 2450. A better disturbance model leaves a cleaner probe response in the
   *   joint fit, which is where it pays. That the correction does NOT improve is the
   *   finding: what limits it is the linear plant inverse, not the disturbance model, and
   *   the design's own prediction says so before the plant is touched.
   */
  constructor({ taps, nonlinear = true } = {}) {
    this.taps = taps.slice();
    this.nBase = 3 * this.taps.length;
    this.uni = nonlinear
      ? universalMap(this.nBase, nonlinear.nh ?? 16, nonlinear.nf ?? 16,
        nonlinear.seed ?? 11)
      : null;
    this.fmap = this.uni;
    this.kept = null;
    this.nf = this.fmap ? this.fmap.m : 1 + this.nBase;
    this.rows = []; this.targets = [];
    this.w = null; this.mu = null; this.sg = null;
    this._z = new Float64Array(this.nBase);
  }

  /** The raw window: value, first and second DIFFERENCE at each tap. */
  base(ref, k, dt) {
    const z = this._z;
    let i = 0;
    for (const t of this.taps) {
      const a = ref(k + t - dt), b = ref(k + t), c = ref(k + t + dt);
      z[i++] = b;
      z[i++] = (c - a) / (2 * dt);
      z[i++] = (c - 2 * b + a) / (dt * dt);
    }
    return z;
  }

  /**
   * @param {boolean} [reuse] write into the shared buffer instead of a fresh array. The
   *   result is only valid until the next call, so this is for `predict()` — the one
   *   caller that consumes it immediately — and never for `observe()`, which keeps it.
   *
   * A FRESH ARRAY PER PREDICTION WAS MOST OF WHAT A SMALL MAP COST. Counted, the linear
   * window is 73 MAC; measured it ran at ~917 MAC-equivalents, twelve times the count,
   * and the arithmetic is not what a `Float64Array(19)` allocation and its eventual
   * collection cost. On the deployed path the vector is read once and thrown away, so
   * there is nothing to allocate.
   */
  features(ref, k, dt, reuse = false) {
    const z = this.base(ref, k, dt);
    if (this.fmap) {
      const e = this.fmap.expand(Array.from(z));
      if (!reuse) return Float64Array.from(e);
      const f = this._f || (this._f = new Float64Array(this.nf));
      for (let i = 0; i < this.nf; i++) f[i] = e[i];
      return f;
    }
    const f = reuse ? (this._f || (this._f = new Float64Array(this.nf)))
      : new Float64Array(this.nf);
    f[0] = 1;
    for (let i = 0; i < this.nBase; i++) f[i + 1] = z[i];
    return f;
  }

  observe(ref, k, dt, y) { this.rows.push(this.features(ref, k, dt)); this.targets.push(y); }

  /**
   * Take weights identified elsewhere -- see BlackBox._identify()'s joint solve.
   *
   * AND FOLD THE STANDARDISATION INTO THEM, which is exact and halves the run-time cost.
   * predict() was subtracting a mean and dividing by a spread per feature before
   * multiplying by a weight: three operations where one will do, since
   *   sum_i w_i (f_i - mu_i)/sg_i  ==  sum_i (w_i/sg_i) f_i  -  sum_i w_i mu_i / sg_i
   * and the second term is a constant. On the 735-feature map that is ~1500 flops per
   * sample removed from the only code that has to run on the machine forever, for an
   * answer that is identical to the last bit -- asserted, rather than assumed, because a
   * "free" rewrite of the hot path is exactly where a silent regression lives.
   */
  setWeights(w, mu, sg) {
    this.w = w; this.mu = mu; this.sg = sg;
    this.wEff = new Float64Array(this.nf);
    let b = 0;
    for (let i = 0; i < this.nf; i++) {
      this.wEff[i] = w[i] / sg[i];
      b -= w[i] * mu[i] / sg[i];
    }
    this.wBias = b;
    return this;
  }

  fit() {
    const n = this.nf, m = this.rows.length;
    if (m < n * 2) throw new Error(`WindowMap.fit: ${m} rows for ${n} features`);
    const mu = new Float64Array(n), sg = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      let a = 0;
      for (const r of this.rows) a += r[i];
      a /= m;
      let v = 0;
      for (const r of this.rows) v += (r[i] - a) * (r[i] - a);
      v = Math.sqrt(v / m);
      mu[i] = a; sg[i] = v < 1e-12 ? 1 : v;
    }
    sg[0] = 1;
    const A = Array.from({ length: n }, () => new Float64Array(n));
    const bb = new Float64Array(n);
    for (let r = 0; r < m; r++) {
      const z = new Float64Array(n);
      for (let i = 0; i < n; i++) z[i] = (this.rows[r][i] - mu[i]) / sg[i];
      for (let a = 0; a < n; a++) {
        for (let b2 = 0; b2 < n; b2++) A[a][b2] += z[a] * z[b2];
        bb[a] += z[a] * this.targets[r];
      }
    }
    let tr = 0;
    for (let i = 0; i < n; i++) tr += A[i][i];
    for (let i = 0; i < n; i++) A[i][i] += this.ridgeAbs(tr, n, m);
    // THROUGH setWeights(), NOT AROUND IT -- the folded weights the hot path reads are
    // built there, and a fit that assigns this.w directly leaves them stale.
    return this.setWeights(solve(A, bb), mu, sg);
  }

  ridgeAbs(tr, n, m) { return 1e-6 * (tr / n || m); }

  get ready() { return this.w !== null; }

  predict(ref, k, dt) {
    if (!this.w) return 0;
    const f = this.features(ref, k, dt, true);   // consumed immediately; see features()
    const we = this.wEff;
    let s = this.wBias;
    for (let i = 0; i < this.nf; i++) s += we[i] * f[i];
    return s;
  }

  /**
   * DEPLOY A SUBSET OF THE BASIS. The full universal map is what the IDENTIFICATION is
   * done with; what runs on the machine forever afterwards is whichever subset earned its
   * place -- see BlackBox._chooseBasis(). `prunedMap` computes only the kept indices, so
   * dropping a feature really does drop its cost.
   *
   * The indices are the full map's own layout: 0 is the bias, 1..nBase the linear window,
   * then the cross-quadratics, then the ReLU hinges, then the Fourier terms. Keeping
   * exactly [0..nBase] IS the plain linear window, which is why that configuration is a
   * point in the same search rather than a separate code path.
   */
  prune(kept) {
    if (!this.uni) return this;
    this.kept = Int32Array.from(kept);
    this.fmap = prunedMap(this.uni, Array.from(kept));
    this.nf = this.fmap.m;
    this.w = null; this.wEff = null; this._f = null;
    return this;
  }

  /**
   * WHAT ONE PREDICTION COSTS, counted rather than measured, because a count is the only
   * form of this number that survives being moved to another processor.
   *
   * Multiply-accumulates per prediction, by block. A quadratic feature is one multiply; a
   * ReLU or Fourier feature is a whole row of the random projection, so it is nBase --
   * which is why 16 hinges can cost more than 600 cross-terms. The readout is one MAC per
   * deployed feature. Transcendentals are counted separately because they are not one
   * flop on any processor this would run on.
   */
  cost() {
    const n = this.nBase;
    const nQuad = Math.floor(n * (n + 1) / 2);
    // THE WINDOW'S READS ARE COUNTED, NOT ASSUMED FREE. `base()` calls `ref()` three
    // times per tap, and on a controller each is a fetch from the look-ahead buffer.
    // They were charged nothing, and with a non-trivial `ref` they measured 95% of what
    // `base()` costs — so the block that was reported as the cheapest was the one whose
    // cost was entirely missing.
    let mac = 9 * this.taps.length;         // three reads and two differences per tap
    let trans = 0;
    const u = this.uni;
    const idx = this.kept ? Array.from(this.kept)
      : (u ? Array.from({ length: u.m }, (_, i) => i) : null);
    if (!u) {
      mac += 0;                             // the linear window is copied, not computed
    } else {
      for (const i of idx) {
        if (i <= n) continue;               // bias and linear: no arithmetic
        // A CROSS-QUADRATIC IS ONE MULTIPLY AND AN INDEX DECODE, and the decode is not
        // free: the reference expansion walks the triangular layout to recover (a, b)
        // from a flat index, measured at a mean of 11.7 iterations per feature over the
        // 666 cross-terms at base 36. Charging 1 understated this block twelvefold. A
        // deployment that precomputes the index pairs pays the 1; this counts what the
        // shipped expansion actually does.
        if (i < 1 + n + nQuad) mac += this.planned ? 1 : 12;
        else if (i < 1 + n + nQuad + u.nh) mac += n + 1;   // a hinge: a whole projection
        else { mac += n + 1; trans += 1; }                 // a Fourier term, plus its sin
      }
    }
    mac += this.nf;                         // the readout
    return { mac, trans, features: this.nf, base: n };
  }

  /** The window this map reaches over, in samples. Used to size the probe. */
  get reach() { return Math.max(...this.taps) - Math.min(...this.taps); }

  status() {
    return { ready: this.ready, features: this.nf, rows: this.rows.length,
      norm: this.w ? Math.sqrt(this.w.reduce((s, x) => s + x * x, 0)) : 0 };
  }
}

/**
 * The whole black-box lifecycle, driven one solver step at a time by whatever loop the
 * host already has.
 *
 * PHASES, and each one ends on its own completion condition rather than a step count,
 * because a step count is a constant that is right for one plant and wrong for the next
 * -- which is the one thing a plant-agnostic block cannot afford:
 *   probe     inject a PRBS on the correction and record (correction, truth)
 *   identify  deconvolve h, summarise it, build the FIR inverse q
 *   observe   run with NO correction and fit the command-window -> truth map
 *   correct   deploy u = -q * e^, and train the soft sensor alongside it
 *   locked    the instrument goes away; everything from here is what the machine has
 */
export class BlackBox {
  /**
   * @param {object} o
   * @param {(k:number)=>number} o.ref  the scalar command at step k, past or future
   * @param {number} o.sampleEvery      solver steps per identification sample
   * @param {number} [o.probeSamples]   PRBS length, in samples
   * @param {number} [o.probeAmp]       PRBS amplitude, in command units. AUTO-SIZED by
   *   the host if omitted -- see `autoAmplitude`, which is the only sizing decision that
   *   needs a scale and gets it from the machine rather than from a constant.
   * @param {number} [o.taps]           impulse-response length, in samples
   * @param {number} [o.invTaps]        FIR inverse length, in samples
   * @param {number} [o.observeSamples] samples of correction-free running for the map
   * @param {number} [o.nSignals]       signals per sample for the soft sensor
   * @param {number} [o.lead]           forecast lead for the soft sensor, in samples
   */
  constructor(o) {
    const { ref, sampleEvery, probeSamples = 900, probeAmp = 0,
      taps = 70, invTaps = 45, invRidge = 3e-3,
      nSignals = 0, ssLag = 12, ssStride = 9, lead = 15, seed = 7,
      stepSamples = 600, nonlinear = true, observeSamples = 0, verifySamples = 0,
      macBudget = BlackBox.plcBudget(), maxCorrection = 2.0,
      sliceBudget = true, mpcIters = null, correctionLimit = null } = o;
    this.macBudget = macBudget;
    this.maxCorrection = maxCorrection;
    this.observeSamples = observeSamples || probeSamples;
    this.verifySamples = verifySamples || Math.ceil(this.observeSamples / 3);
    this.mpc = null; this.mpcCfg = null; this.mpcWin = null;
    this.sliceBudget = sliceBudget;
    this.mpcIters = mpcIters;
    this.correctionLimit = correctionLimit;
    Object.assign(this, { ref, S: sampleEvery, probeSamples, probeAmp,
      taps, invTaps, invRidge, nSignals, lead, stepSamples, nonlinear });
    this.seq = prbs(probeSamples, { seed, dwell: 1 });
    // STAGE ZERO DETERMINES THE TIMESCALE FROM THE DATA, and everything after it is sized
    // from that number. The identification grid, the probe's bandwidth and the length of
    // the impulse response all have to match the plant's own settling time; a module told
    // nothing about the plant cannot be told that either, and it is not a number anybody
    // should have to supply. So it is measured: hold, wait until the machine is QUIET
    // (detected, not counted), apply one step, wait until it is quiet again, and read the
    // settling time and the DC gain off the record. No fixed sample counts anywhere in
    // it, because a count is a constant that is right for one plant and wrong for the
    // next -- which is the one thing a module like this cannot afford.
    this.phase = 'step';
    this.sub = 'quiet';
    this.quietRun = 0; this.prevY = null;
    this.i = 0;                       // samples elapsed in the current phase
    this.sy = [];                     // step response
    this.settleSteps = null; this.dc = null; this.grid = sampleEvery;
    this.pu = []; this.py = []; this.pk = [];   // probe input / output / step, HELD
    this.ok = []; this.oy = [];                 // observation step / truth, RUNNING
    this.h = null; this.model = null; this.q = null; this.qCentre = 0; this.design = null;
    this.map = null;
    this.ss = nSignals > 0
      ? new SoftSensor(nSignals, 2, ssLag, ssStride, 200,
        { initVariance: 100, leads: [0, lead] })
      : null;
    this.trained = 0;
    this.est = null; this.forecast = null;
    this.note = 'probing';
    // The correction currently being applied, held between samples so the host can read
    // it at every solver step without recomputing the convolution
    // Nothing is applied until the machine is quiet.
    this.u = 0; this.u0 = 0; this.u1 = 0; this.uStep = null;
    this.eRing = null; this.eHead = 0;
  }

  /**
   * THE PER-CYCLE BUDGET, stated as arithmetic rather than as a promise.
   *
   * The target this was sized against is a B&R APC4100 on a 1 ms task using at most 5% of
   * it. The one number that cannot be derived is how many multiply-accumulates that
   * processor retires per microsecond, so it is a parameter with a DELIBERATELY
   * PESSIMISTIC default: 50 MAC/us, which is a tenfold derate on the 518 MAC/us this
   * project's own JavaScript measures on a plain f64 dot product. A tenfold derate covers
   * compiled ST against JIT-compiled JS, a slower core, and the cache behaviour of a
   * strided gather -- and if the real figure is better, the controller simply runs at a
   * smaller fraction than it claimed, which is the safe direction to be wrong in.
   *
   * @returns {number} multiply-accumulates available in ONE cycle. The default requires
   *   the whole update to fit in a single cycle -- the strictest reading, needing no
   *   scheduling from whoever ports this. `cost().slicedMacPerCycle` is what it costs if
   *   they are willing to spread it, which the preview horizon leaves room for.
   */
  static plcBudget({ cycleUs = 1000, utilisation = 0.05, macPerUs = 50 } = {}) {
    return Math.floor(cycleUs * utilisation * macPerUs);
  }

  /**
   * A probe amplitude from the machine rather than from a constant.
   *
   * IT HAS TO BE BIG ENOUGH TO BE SEEN AND SMALL ENOUGH TO BE SAFE, and neither end can
   * be written down without knowing the plant -- so it is derived from the command's own
   * peak-to-peak swing, which the host can measure with no knowledge either. A percent of
   * the move is the same fraction of the machine's capability on any plant.
   */
  static autoAmplitude(refPeakToPeak, fraction = 0.02) {
    return Math.max(1e-12, fraction * Math.abs(refPeakToPeak));
  }

  /** The correction to ADD to the command at solver step k. */
  /**
   * THE CORRECTION, RECONSTRUCTED AT THE HOST'S OWN RATE.
   *
   * `offset(k)` interpolates between the designed grid samples; `offset()` returns the
   * held value, which is what the interface was before and what a host running at the
   * identification rate wants.
   *
   * THE HOLD WAS COSTING MORE THAN EVERY OTHER SOURCE OF ROUGHNESS COMBINED. The
   * correction is designed on a grid of `grid` solver steps and the machine runs every
   * step, so a zero-order hold puts a discontinuity into the commanded setpoint `grid`
   * times less often than the loop closes -- measured on the arm, the commanded motor
   * position came out 6354x rougher than the bare reference and the TORQUE 53x rougher,
   * while the ENCODER was smoother than with no correction at all. The servo could not
   * follow any of it: the drive was answering a staircase with spikes that moved nothing.
   *
   * LINEAR INTERPOLATION IS THE RIGHT RECONSTRUCTION AND IT COSTS NO LAG, which is the
   * part that makes this free rather than a trade. It passes exactly through u(n) at
   * every grid sample, so the designed sequence is unchanged; it is a zero-order hold
   * that carries a half-sample lag, not this. It needs the NEXT value at the start of the
   * interval, and both designs already have it -- the receding-horizon solve plans the
   * whole horizon and applies one element of it, and the preview filter is simply
   * evaluated one grid sample ahead, which is the same single dot product it already ran.
   *
   * A SMOOTHER RECONSTRUCTION WAS TRIED AND IS WORSE. Linear interpolation leaves a slope
   * discontinuity at every grid sample, so the obvious next step is a C1 blend -- t ->
   * t^2(3-2t), which passes through the same samples with zero slope at each. Measured, it
   * made BOTH numbers worse (command roughness 1.06e-3 -> 1.13e-3, torque roughness
   * 1.89e-3 -> 1.99e-3) at identical tracking, because zero slope at every knot is the
   * stair's dwell coming back in a smooth costume. The straight line between samples is
   * the reconstruction of a band-limited signal; nothing gentler than it is closer.
   */
  offset(k) {
    if (k == null || this.uStep == null || !(this.grid > 0)) return this.u;
    let t = (k - this.uStep) / this.grid;
    if (!(t > 0)) t = 0; else if (t > 1) t = 1;
    this.u = this.u0 + (this.u1 - this.u0) * t;
    return this.u;
  }

  /**
   * IS THE MACHINE MEANT TO BE HELD RIGHT NOW? The host has to know, because the two
   * identification experiments are different experiments and neither can be run during
   * the other -- see _identify(). True through the step test and the probe; false from
   * the moment the module wants to watch the program run.
   */
  get holding() { return this.phase === 'step' || this.phase === 'probe'; }

  get ready() { return this.phase === 'correct' || this.phase === 'locked'; }

  /** True while the module is measuring its own correction on the machine. */
  get verifying() { return this.phase === 'verify'; }

  /**
   * One identification SAMPLE. The host calls this every `sampleEvery` solver steps and
   * hands over the truth (while it has an instrument) and the signals.
   *
   * @param {number} k       the solver step this sample was taken at
   * @param {number} truth   the quantity to be driven to zero; null once locked
   * @param {number[]} sig   whatever the machine measures
   */
  sample(k, truth, sig = null) {
    if (this.ss && sig) {
      this.ss.push(sig);
      if (!this.ss.frozen) this.ss.warmupStep(this.ss._raw());
      else {
        const y = this.ss.estimate();
        this.est = y[0]; this.forecast = y[1];
        if (truth != null && this.phase !== 'locked') {
          this.ss.adapt([truth, truth]); this.trained++;
        }
      }
    }
    if (this.phase === 'step') this._step(truth);
    else if (this.phase === 'probe') this._probe(k, truth);
    else if (this.phase === 'observe') this._observe(k, truth);
    else if (this.phase === 'verify') this._verify(k, truth);
    else if (this.phase === 'correct') this._correct(k);
    else if (this.phase === 'locked') this._correct(k);
  }

  /**
   * The step at rest: how long the plant takes to stop moving, and how far it goes.
   *
   * WHAT IT REPLACES: everything downstream would otherwise be a constant chosen for one
   * plant. The identification grid, the probe's bandwidth, the length of the impulse
   * response and the width of the inverse's target all follow from this one number, so a
   * plant that settles in 300 steps and one that settles in 6000 get sized correctly
   * without either being mentioned. It also gives an INDEPENDENT reading of the DC gain
   * and its sign, which is the cross-check that catches a deconvolution fitting noise.
   */
  /**
   * CHOOSE THE INVERSE BY PREDICTING WHAT IT WILL ACHIEVE, and deploy nothing that is not
   * predicted to help.
   *
   * The only free parameter left after identification is how much of the plant the
   * inverse is allowed to claim -- the width of its low-pass target. That cannot be a
   * constant, because it depends on where the DISTURBANCE lives relative to where the
   * plant can be trusted, and those are different on every machine. It also cannot be
   * guessed from the plant alone: on a lightly damped plant whose disturbance sits ON the
   * resonance there is no width that helps, and the honest answer is to do nothing.
   *
   * Both objects needed to answer that are already identified, so the answer costs no
   * plant time at all: run the designed loop against the map's OWN predicted disturbance
   * and read off the residual. Then a scalar 0..1 on the correction is chosen the same
   * way, which is what makes "it cannot help here" an outcome the module can reach
   * instead of a failure it walks into.
   *
   * MEASURED, and this is why it exists: on a plant whose disturbance sits on its own
   * lightly damped resonance the best available width predicts 1.0x, the scalar goes to
   * zero, and the machine is left alone -- against 0.6x, i.e. actively worse, when the
   * width was taken from the resonance period without checking.
   */
  _design() {
    const N = this.oy.length;
    const M = this.h.length;
    // THE DISTURBANCE AS MEASURED, which with the correction off during the observation
    // IS the recorded truth -- no modelling step between the machine and the target.
    // Designing against the map's own version would be designing against a residual that
    // is zero by construction, which is why the measured record is kept separately.
    const dMeas = Float64Array.from(this.oy);
    // …and scored only on samples the map never saw.
    const from = Math.max(this.split, M + this.invTaps);
    let dm = 0;
    for (let k = from; k < N; k++) dm += dMeas[k];
    dm /= Math.max(1, N - from);
    const eHat = new Float64Array(N);
    for (let i = 0; i < N; i++) eHat[i] = this.map.predict(this.ref, this.ok[i], this.grid);
    let base = 0, nb = 0;
    for (let k = from; k < N; k++) { const v = dMeas[k] - dm; base += v * v; nb++; }
    base = Math.sqrt(base / Math.max(1, nb));
    // ---- FIRST: the OPTIMAL PREVIEW FILTER, searched over its length, how far ahead it
    // is allowed to look, and how much control effort it is allowed to spend. Everything
    // it needs -- h and the map -- is already identified, so the whole search costs no
    // plant time at all and is scored the same way everything else here is: against the
    // MEASURED disturbance, on samples the map never saw.
    const previews = [];
    for (const L of [12, 24, 48]) {
      if (L + M >= this.split) continue;
      for (const cf of [0.25, 0.5, 0.75]) {
        const centre = Math.round(L * cf);
        // THE LADDER HAS TO REACH TIGHT ENOUGH TO BE FEASIBLE UNDER THE CAP, not merely
        // far enough to find the best tracking. A first version stopped at lambda = 1
        // and, on a plant whose cap bit hard, returned no feasible candidate at all --
        // which reads as "the module cannot help here" when the truth is that nobody
        // offered it a gentle enough design.
        for (const lambda of [1e3, 3e2, 1e2, 3e1, 1e1, 3e0, 1e0, 3e-1, 1e-1, 3e-2,
          1e-2, 3e-3, 1e-3]) {
          const qq = optimalPreview(this.h, eHat, dMeas, { taps: L, centre, lambda,
            from: M + L, to: this.split });
          const sc = this._score(qq, centre, eHat, dMeas, dm, from);
          previews.push({ q: qq, centre, taps: L, lambda, ...sc });
        }
      }
    }
    // HOW BIG IS THE CORRECTION ALLOWED TO BE? The tracking score has no opinion: it
    // measures tracking only, so left to itself the search runs lambda to its loosest
    // value -- the residual falls monotonically and nothing in the criterion pays for the
    // command that buys it. Measured on the arm, the uncapped design wanted a peak
    // correction of 0.284 against a command swing of 0.144, i.e. TWICE THE MOVE.
    //
    // I EXPECTED THAT TO BE FRAGILE AND IT IS NOT, which is the finding, and it cost the
    // default that was going to ship on the strength of the expectation. A high-gain
    // inversion is supposed to have no robustness margin, so the same filter was
    // commissioned on the nominal arm and then run on arms that had drifted -- 25% softer
    // gearbox, 25% softer link, and both. Improvement, nominal / gearbox / link / both:
    //   cap 0.25 (24% of the swing)   1.20x  1.21x  1.25x  1.26x
    //   cap 0.50 (50%)                1.42x  1.43x  1.53x  1.53x
    //   cap 1.00 (98%)                1.62x  1.62x  1.66x  1.65x
    //   cap 2.00 (166%)               2.70x  2.74x  2.73x  2.68x
    // FLAT ACROSS THE DRIFT AT EVERY SIZE, and the drive's own saturation counter reads
    // 0.0% of steps at every one of them. So neither robustness nor the actuator argues
    // for a small cap on this plant, and the default is generous because the measurement
    // says so rather than because bigger scored better.
    //
    // IT IS STILL A CAP, for two reasons that the measurement does not remove. This
    // drive was sized with a lot of headroom (32x the gravity hold torque) and a real
    // axis is not; and a limit is what lets the module refuse to demand the impossible
    // rather than discover it. What generalises past this plant is not the number but
    // the verify phase, which deploys the correction and MEASURES it -- on a machine
    // where a large command does hurt, that is what finds out.
    //
    // THE BEST LIMIT IS THE ACTUATOR'S, AND THE HOST KNOWS IT. The correction is added to
    // a setpoint and the loop turns that into effort, so a drive rating IS a correction
    // limit -- on a position loop it is tauMax/kp, and both of those are nameplate
    // numbers the controller already holds, not plant knowledge being slipped in. Measured
    // on the arm: a drive rated at 32x the gravity hold torque can follow a setpoint
    // offset of 5.0x the whole command swing, which is why nothing ever saturated and why
    // the limit never bound; a realistically rated 3-6x drive lands at 0.47-0.94 of the
    // swing, which is squarely where the constrained design earns its place.
    //
    // Where the host does not supply one, the fallback needs a scale, and the command's
    // own peak-to-peak swing is one the module can measure with no knowledge of the plant
    // at all -- the same reasoning as autoAmplitude.
    let rLo = Infinity, rHi = -Infinity;
    for (let i = 0; i < N; i++) {
      const v = this.ref(this.ok[i]);
      if (v < rLo) rLo = v;
      if (v > rHi) rHi = v;
    }
    // BOTH BOUNDS APPLY AND THE SMALLER ONE WINS. They are different questions -- what
    // the actuator can deliver, and what size of correction is sane at all on a command
    // of this size -- and a design has to satisfy whichever is tighter. Taking the
    // drive's number alone would let a generously sized drive remove the sanity bound
    // entirely, which is exactly what a 32x-rated axis does here: its static offset limit
    // is FIVE TIMES the whole command swing.
    // ZERO IS A LIMIT, NOT AN ABSENCE, and reading it as one was a real defect. The
    // sentinel for "the host did not supply a limit" used to be 0, which is also the
    // legitimate answer when the trajectory is already using the whole actuator — and on
    // a drive whose move demanded 272% of its rating the module was handed a limit of
    // exactly 0.0 and read it as UNLIMITED, the opposite of what the host meant. The
    // sentinel is now null and a supplied 0 means what it says: there is nothing left to
    // correct with, so nothing is deployed.
    const uCap = Math.min(
      this.maxCorrection * Math.max(rHi - rLo, 1e-300),
      this.correctionLimit != null ? this.correctionLimit : Infinity);
    // …and among what is left, THE KNEE RATHER THAN THE MINIMUM: the cheapest candidate
    // within 5% of the best residual. Same rule as the basis search, for the same reason
    // -- a percent of accuracy is not worth a multiple of the cost. Measured across the
    // whole lambda range at fixed taps, the arm achieved 1.12x, 1.13x and 1.13x while the
    // effort spanned 2.3e-3 to 1.4e-2, so the loose end was buying nothing at six times
    // the command movement.
    //
    // THE BAND IS ON THE IMPROVEMENT, NOT ON THE RESIDUAL, and the difference is not
    // cosmetic. "Within 5% of the best residual" is scale-wrong: where the best feasible
    // design only improves the residual by 2%, a band of 5% ON THE RESIDUAL reaches past
    // doing nothing at all -- so the DO-NOTHING filter falls inside it and wins on
    // effort, being free. Measured: under a tight cap the search returned the zero filter
    // and reported 1.00x, not because nothing was feasible but because the rule could not
    // tell "cheap and useless" from "cheap and nearly as good".
    let bestOpt = null;
    const feasible = previews.filter((c) => c.umax <= uCap);
    if (feasible.length) {
      const bestGain = Math.max(...feasible.map((c) => base - c.res));
      if (bestGain > 0) {
        bestOpt = feasible.filter((c) => base - c.res >= 0.95 * bestGain)
          .reduce((m, c) => (c.effort < m.effort ? c : m));
      }
    }
    this.uCap = uCap;
    // …and the same swing normalises the MEASURED cost in the verify round, so "how
    // roughly does this correction move" is a fraction of the whole move rather than a
    // number in whatever units the host happens to use.
    this.swing = Math.max(rHi - rLo, 1e-300);

    // ---- AND THE CONSTRAINED DESIGN, which is a different object rather than a better
    // filter. Both families above are ONE linear filter, so meeting a peak limit means
    // detuning them everywhere -- including over the stretches where the limit was never
    // close -- and neither of them actually guarantees the limit on a stretch of command
    // it was not designed against. Pontryagin's principle says the constrained optimum
    // sits ON the limit where it is active and is free where it is not, which no single
    // gain can express.
    //
    // MEASURED ON THE ARM, improvement against no correction, detuned FIR / the loose FIR
    // hard-CLIPPED at the same limit / the constrained solve:
    //   limit 0.10 of the command's swing   1.09x  1.07x  1.21x
    //   limit 0.25                          1.18x  1.19x  1.50x
    //   limit 0.50                          1.41x  1.43x  1.95x
    // and the constrained one's peak sits exactly ON the limit in every row with 0% of
    // samples over it, which is the half a filter cannot promise at all.
    //
    // ITS ITERATION COUNT IS NOT CHOSEN, IT IS WHAT THE BUDGET LEAVES. A fixed count is
    // what makes the run time a constant known before it runs, which is the only kind of
    // number a cyclic task can be given; so the budget picks it, and a horizon whose
    // first iteration does not fit is not a candidate at all.
    //
    // SLICING IS ALLOWED HERE AND IT IS NOT A TRICK, but it does cost something and the
    // cost is stated. The solve produces a command for a moment that is `horizon` grid
    // samples of look-ahead away, so it can be spread across the interval between updates
    // instead of landing in one cycle -- at the price of ONE more grid sample of preview,
    // since the answer must be finished before the update it belongs to rather than
    // during it. `sliceBudget: false` forbids it and the module then fits whatever the
    // strict single-cycle budget allows, usually nothing.
    const mpcCands = [];
    {
      // The controller does not need the tail of the impulse response, and the tail is
      // what its cost is linear in.
      let tot = 0;
      for (const v of this.h) tot += v * v;
      let acc = 0, MC = M;
      for (let i = 0; i < M; i++) { acc += this.h[i] * this.h[i]; if (acc > 0.995 * tot) { MC = i + 1; break; } }
      const hc = this.h.slice(0, Math.max(4, MC));
      const avail = (this.sliceBudget ? this.macBudget * this.grid : this.macBudget)
        - this.map.cost().mac;
      for (const horizon of [24, 48]) {
        if (horizon + M >= this.split) continue;
        const perIter = 2 * horizon * Math.min(horizon, hc.length) + 4 * horizon;
        const free = Math.min(horizon, hc.length) * hc.length / 2;
        const most = this.mpcIters != null ? this.mpcIters
          : Math.min(16, Math.floor((avail - free) / perIter));
        // THE ITERATION COUNT IS A CANDIDATE, NOT A CEILING FILLED TO THE BRIM. The
        // budget says what is affordable; what is WORTH buying is a different question,
        // and on this plant the warm start answers it emphatically -- ONE iteration
        // already reaches 96% of what twelve do (1.443x against 1.500x), and two reach
        // 98%. Spending the rest of the budget to chase the last 4% would be paying
        // eighteen times the arithmetic for it.
        // THE EFFORT WEIGHT HAS TO BE SCALED BY THE PLANT OR IT IS NOT A WEIGHT.
        // `boxQP` minimises ‖Hu+d‖² + λ‖Du‖² with λ the RAW weight, and this plant has a
        // DC gain of about 14, so the tracking term carries ~sum(h²) ≈ 200 times the
        // scale of the effort term -- measured, the whole ladder 1e-1 / 1e-2 / 1e-3
        // returned residuals identical to four figures and efforts identical to three.
        // Three copies of one design is not a ladder, and nothing downstream could tell.
        // Normalising by sum(h²) makes λ = 1 mean "a unit of command movement is worth a
        // unit of tracking error", which is a statement about the trade rather than
        // about the units the host happens to use, and lets the ladder be written where
        // it bites on any plant.
        let hE = 0;
        for (const v of hc) hE += v * v;
        for (const iters of [1, 2, 4, 8, 16]) {
          if (iters > most) break;
          for (const lam of [1e2, 1e1, 1e0, 1e-1, 1e-2, 1e-3]) {
            const lambda = lam * hE;
            const cfg = { h: hc, horizon, U: uCap, lambda, iters, lam };
            const sc = this._scoreMPC(cfg, eHat, dMeas, dm, from);
            mpcCands.push({ cfg, mac: Math.round(free + iters * perIter), ...sc });
          }
        }
      }
    }
    let bestMpc = null, gentleMpc = null;
    if (mpcCands.length) {
      const bestGain = Math.max(...mpcCands.map((c) => base - c.res));
      if (bestGain > 0) {
        // …and among what is within 5% of the best, the CHEAPEST IN ARITHMETIC, because
        // that is the scarce resource for this family rather than command movement.
        //
        // SMOOTHNESS IS DELIBERATELY NOT DECIDED HERE, and trying to was measured and
        // reverted. Taking the gentlest within the same band instead cost 17% of the
        // MEASURED tracking (6.98x -> 5.97x) and bought 2% of measured command roughness
        // -- because this scorer's `effort` is the FIRST difference of u, and once the
        // correction is reconstructed as a ramp rather than a stair what the drive feels
        // is its CURVATURE. The offline score cannot rank these two any better than it
        // could rank the two families, and for the same reason. The verify round measures
        // both on the machine and applies the knee there.
        // ON A TIE IN ARITHMETIC, THE BETTER RESIDUAL -- which is not a detail. Every λ
        // at one (horizon, iters) costs exactly the same MAC, so "cheapest" is a tie
        // across the whole λ ladder and a plain reduce keeps whichever the loop reached
        // first. Once λ was scaled to bite, that accident selected a candidate 1.5%
        // worse offline and 36% worse ON THE MACHINE (6.98x against 4.48x).
        const near = mpcCands.filter((c) => base - c.res >= 0.95 * bestGain);
        bestMpc = near.reduce((m, c) =>
          (c.mac < m.mac || (c.mac === m.mac && c.res < m.res) ? c : m));
        // …AND THE GENTLE END OF THE SAME BAND GOES TO THE MACHINE. λ is the knob that
        // trades tracking for a smoother command, and the offline score has already been
        // shown unable to rank it -- so the largest λ that is still worth considering is
        // offered as its own trial rather than chosen here. `near` is the 5% band, so a
        // rung taken from it is one the design believes in; whether the smoothness is
        // worth what it costs is measured, and on a plant where it is not the knee in
        // the verify round simply does not pick it.
        gentleMpc = near.filter((c) => c.cfg.horizon === bestMpc.cfg.horizon
          && c.cfg.iters === bestMpc.cfg.iters)
          .reduce((m, c) => (c.effort > m.effort ? m : c));
        if (gentleMpc.effort >= 0.95 * bestMpc.effort) gentleMpc = null;
      }
      // THE TRADE, REPORTED RATHER THAN DECIDED, for this family too.
      this.mpcFrontier = mpcCands.map((c) => ({ horizon: c.cfg.horizon,
        iters: c.cfg.iters, lambda: c.cfg.lam, res: c.res, effort: c.effort,
        umax: c.umax, mac: c.mac }));
    }

    // Candidate widths span "trust the plant everywhere" to "trust it only in the slowest
    // band", geometrically, so the search costs a handful of small solves.
    const spanW = Math.max(2, Math.round(this.h.length / 2));
    // WIDTH 0 IS THE MOST AGGRESSIVE MEMBER OF THIS FAMILY, NOT THE DO-NOTHING END, and
    // the comment that used to sit here said the opposite. `firInverse` with width <= 0
    // sets d[c] = 1 -- a pure delta target, i.e. "be exact at every frequency", which is
    // the largest `umax` the family can produce. So there is no guaranteed-feasible
    // member, every candidate can fail the cap, and `best` stays null. Reproduced: at a
    // correctionLimit of 1e-8 the design threw `Cannot read properties of null (reading
    // 'q')`. Reachable in production, because the host computes the limit from whatever
    // the drive has spare and a nearly-saturated move leaves a small positive number.
    //
    // THE DO-NOTHING END IS ADDED EXPLICITLY, as a zero filter that is feasible under any
    // cap. It also gives `pick` something to return that means "this family has nothing
    // to offer", which is an outcome rather than a failure.
    const cands = [];
    for (let w = 1; w <= spanW; w = Math.max(w + 1, Math.round(w * 1.6))) cands.push(w);
    let best = { width: null, q: new Float64Array(this.invTaps),
      centre: Math.min(this.invTaps - 2, this.model.delay + Math.floor(this.invTaps / 3)),
      alpha: 0, res: base, effort: 0, umax: 0 };
    for (const width of cands) {
      const centre = Math.min(this.invTaps - 2,
        this.model.delay + Math.floor(this.invTaps / 3));
      const { q } = firInverse(this.h, { length: this.invTaps, ridge: this.invRidge,
        width, centre });
      // The residual design applies MINUS the inverse to the predicted disturbance; the
      // preview design solves for its own sign, so the two are scored through the same
      // function with the negation folded into the taps.
      const sc = this._score(Float64Array.from(q, (v) => -v), centre, eHat, dMeas, dm, from);
      if (sc.umax > this.uCap) continue;
      if (sc.res < best.res) best = { width, q: Float64Array.from(q, (v) => -v), centre, ...sc };
    }
    // THE TWO DESIGNS ARE SCORED AGAINST EACH OTHER ON THE SAME HELD-OUT SAMPLES, so the
    // preview filter is used because it measured better here rather than because it is
    // the newer idea -- and on a plant where it does not, it is not.
    // BOTH FINALISTS SURVIVE THE OFFLINE ROUND, and the machine picks between them.
    //
    // THE OFFLINE SCORE CANNOT RANK THESE TWO, and finding that out is what this whole
    // step was for. Every candidate is scored by convolving it with the identified plant,
    // which is LINEAR -- so nothing in the score can see the ACTUATOR saturating, and a
    // design that pushes right up to its limit looks free there and is not. Measured on a
    // realistically rated drive: the constrained solve won the offline round and then
    // achieved 1.65x against the filter's 1.81x, with the drive limited on 29.5% of steps
    // against 19.5%. The offline number preferred exactly the wrong one.
    //
    // So the verify phase stops being a check on ONE design and becomes the round that
    // decides. It already had the machinery -- it was running a scale ladder -- and the
    // generalisation is to put the runner-up on the ladder too.
    this.mpcAlt = bestMpc ? bestMpc.cfg : null;
    this.mpcGentle = gentleMpc ? gentleMpc.cfg : null;
    this.mpc = null;
    const pick = (bestOpt && bestOpt.res < best.res)
      ? { kind: 'preview', q: bestOpt.q, centre: bestOpt.centre, alpha: bestOpt.alpha,
        res: bestOpt.res, effort: bestOpt.effort, umax: bestOpt.umax,
        taps: bestOpt.taps, lambda: bestOpt.lambda, other: best.res }
      : { kind: 'residual', q: best.q, centre: best.centre,
        alpha: best.alpha, res: best.res, effort: best.effort, umax: best.umax,
        width: best.width, taps: best.q.length, other: bestOpt ? bestOpt.res : null };
    this.q = Float64Array.from(pick.q, (v) => v * pick.alpha);
    this.qCentre = pick.centre;
    // AND A DESIGN THAT DEPLOYS NOTHING SAYS SO. Under a cap tight enough to reject every
    // candidate the family falls back to its zero filter, which is the right behaviour
    // and the wrong label: `kind: 'residual'` with all-zero taps reads as a correction
    // that is running. The distinction matters because 'none' is what the verify round
    // reports when it measures that nothing beats doing nothing, and the two should not
    // be told apart by reading the taps.
    if (!this.mpcAlt && !this.q.some((v) => v !== 0)) pick.kind = 'none';
    this.design = { kind: pick.kind, alpha: pick.alpha, taps: pick.taps,
      centre: pick.centre, width: pick.width, lambda: pick.lambda,
      // HOW FAR AHEAD THE FILTER LOOKS, in solver steps, which is the number a motion
      // controller has to supply from its look-ahead buffer -- and the number that says
      // whether the correction can pre-actuate at all.
      previewSteps: pick.centre * this.grid, uCap,
      effort: pick.effort, umax: pick.umax,
      predicted: base > 0 ? base / Math.max(pick.res, 1e-300) : 1,
      base, res: pick.res, otherRes: pick.other,
      mpcRes: bestMpc ? bestMpc.res : null,
      mpcPredicted: bestMpc && base > 0 ? base / Math.max(bestMpc.res, 1e-300) : null,
      frontier: this._frontier(previews, base),
      mpcFrontier: this.mpcFrontier || null };
  }

  /**
   * THE TRADE, REPORTED RATHER THAN DECIDED. Tracking against control effort has no knee
   * on this plant -- measured across four decades of the effort weight the improvement
   * rises monotonically and the drive never saturates -- so there is no interior optimum
   * to find and picking a point is a preference, not a result. What the module can do
   * honestly is hand over the Pareto-efficient set it already scored, so whoever owns the
   * machine can choose where on it to sit and see what the other choices would have cost.
   * It costs nothing: every one of these candidates was evaluated during the search.
   */
  _frontier(previews, base) {
    const pts = previews.slice().sort((a, b) => a.effort - b.effort);
    const out = [];
    let bestRes = Infinity;
    for (const c of pts) {
      if (c.res >= bestRes) continue;              // dominated: costs more, achieves less
      bestRes = c.res;
      out.push({ effort: c.effort, umax: c.umax, lambda: c.lambda, taps: c.taps,
        previewSteps: c.centre * this.grid,
        predicted: base > 0 ? base / Math.max(c.res, 1e-300) : 1 });
    }
    // thin it to something a human can read, keeping the ends
    if (out.length <= 8) return out;
    const step = (out.length - 1) / 7;
    return Array.from({ length: 8 }, (_, i) => out[Math.round(i * step)]);
  }

  /**
   * PICK THE BASIS THAT RUNS ON THE MACHINE, and pick it on held-out data under a stated
   * per-cycle budget. Two separate findings force this, and they happen to agree.
   *
   * THE FIRST IS GENERALISATION, and it overturned a shipped result. The full universal
   * map is 735 features fitted on ~900 rows; on a REPEATING command that scored
   * beautifully, because every held-out sample of a repeating command is a near-replica
   * of a training one. Measured on an APERIODIC command -- which is what a machine
   * actually runs -- the same map scores R^2 = -6.93 out of sample against the plain
   * linear window's +0.88. It is not slightly over-parameterised, it is catastrophically
   * so, and the earlier number was flattered by the test signal. (Brick 16 learned this
   * on a different plant and it had to be learned again here, which is the argument for
   * never scoring a fitted model on a periodic excitation.)
   *
   * THE SECOND IS COST. This has to run on a PLC -- the target is a B&R APC4100 at a 1 ms
   * cycle using no more than 5% of it -- and 735 features with sixteen random projections
   * is ~24000 multiply-accumulates per update against a budget of a few thousand. A basis
   * that does not fit is not deployable however well it scores.
   *
   * ONE MECHANISM SERVES BOTH: rank the full map's features by the weight the joint fit
   * gave them, refit on the top K, and keep the cheapest candidate whose held-out error
   * is within a margin of the best. The plain linear window is a point in the same search
   * rather than a separate path, since keeping indices [0..nBase] IS the linear window.
   */
  _chooseBasis(fitCols, M) {
    const nfFull = this.map.nf;
    const all = Array.from({ length: nfFull }, (_, i) => i);
    const full = fitCols(all);
    const report = [{ name: 'full', features: nfFull, heldOut: full.heldOut,
      mac: this._basisCost(all).mac }];
    if (!this.map.uni) {
      return { fit: full, report: { chosen: 'linear', tried: report, budget: this.macBudget,
        mac: this._basisCost(all).mac } };
    }
    // Importance is the standardised weight: every column was scaled to unit spread
    // before the solve, so the weights are directly comparable and no extra pass is
    // needed to rank them.
    const wm = full.w.slice(M);
    const order = Array.from({ length: nfFull }, (_, i) => i)
      .sort((a, b) => Math.abs(wm[b]) - Math.abs(wm[a]));
    const cands = [{ name: 'linear', cols: all.slice(0, 1 + this.map.nBase) }];
    for (const K of [8, 16, 32, 64, 128, 256]) {
      if (K >= nfFull) break;
      cands.push({ name: `top-${K}`, cols: order.slice(0, K).sort((a, b) => a - b) });
    }
    const scored = [{ name: 'full', fit: full, mac: this._basisCost(all).mac }];
    for (const c of cands) {
      const f = fitCols(c.cols);
      const mac = this._basisCost(c.cols).mac;
      scored.push({ name: c.name, fit: f, mac });
      report.push({ name: c.name, features: c.cols.length, heldOut: f.heldOut, mac });
    }
    const budget = this.macBudget;
    const affordable = scored.filter((c) => c.mac <= budget);
    const pool = affordable.length ? affordable : [scored.reduce((m, c) => (c.mac < m.mac ? c : m))];
    const bestErr = Math.min(...pool.map((c) => c.fit.heldOut));
    // …and among everything within 5% of the best, take the CHEAPEST. A basis that buys a
    // percent of accuracy for eight times the cycle time is not a better basis.
    const pick = pool.filter((c) => c.fit.heldOut <= bestErr * 1.05)
      .reduce((m, c) => (c.mac < m.mac ? c : m));
    return { fit: pick.fit,
      report: { chosen: pick.name, mac: pick.mac, budget, tried: report,
        overBudget: affordable.length === 0 } };
  }

  /** MACs per prediction for a candidate keep-set, without disturbing the live map. */
  _basisCost(cols) {
    const saveK = this.map.kept, saveF = this.map.fmap, saveN = this.map.nf;
    this.map.kept = Int32Array.from(cols);
    this.map.nf = cols.length;
    const c = this.map.cost();
    this.map.kept = saveK; this.map.fmap = saveF; this.map.nf = saveN;
    return c;
  }

  /**
   * WHAT THE DEPLOYED CONTROLLER COSTS PER CYCLE, which is the number that decides whether
   * any of this can leave a workstation.
   *
   * The run-time path is ONE map prediction plus `taps` multiply-accumulates -- not
   * `taps` predictions, because the tap the filter needs j samples ago is the prediction
   * it already made j samples ago, held in a ring. That is the difference between a
   * few thousand MACs per update and a few hundred thousand.
   *
   * Two numbers are reported because a PLC programmer has two options and they are worth
   * different amounts. `peak` is the whole update in one cycle, which needs no scheduling
   * and is the number to quote. `sliced` is the same work spread over the grid interval,
   * which is legitimate here rather than a trick: the prediction being computed is about
   * a moment `previewSteps` in the future, so there is real slack before it is needed.
   */
  cost() {
    const m = this.map.cost();
    const taps = this.q ? this.q.length : 0;
    const control = m.mac + (this.mpc ? this.mpc.cost().mac : taps);
    // THE SOFT SENSOR IS PART OF THE MODULE AND WAS NOT IN THIS NUMBER, which made the
    // figure this project quotes an understatement of the thing it is quoting. It runs
    // on every identification SAMPLE, five times more often than the correction updates,
    // and `estimate()` keeps running after the lock. Counting it moved the arm from ~132
    // MAC/cycle to ~250. The two are reported separately because a host that does not
    // want the estimate can simply not ask for one, and then the smaller number is the
    // true one — but it has to be a choice rather than an omission.
    const sensor = this.ss ? this._sensorCost() : 0;
    const mac = control + sensor;
    const cyclesPerUpdate = this.grid;
    // TWO NUMBERS, BECAUSE A PLC PROGRAMMER HAS TWO OPTIONS AND THEY ARE WORTH DIFFERENT
    // AMOUNTS. `peak` is the whole update in one cycle -- no scheduling, and the number
    // to quote. `sliced` is the same work spread over the interval between updates,
    // which the preview horizon makes legitimate at the price of one more grid sample of
    // look-ahead. A filter fits the strict budget; a constrained solve generally does not
    // and says so rather than quietly assuming it may spread.
    const allowed = this.sliceBudget ? this.macBudget * cyclesPerUpdate : this.macBudget;
    return { mac, control, sensor, trans: m.trans, features: m.features, taps,
      kind: this.mpc ? 'constrained' : 'filter',
      iters: this.mpc ? this.mpc.iters : null,
      cyclesPerUpdate, peakMacPerCycle: mac, slicedMacPerCycle: mac / cyclesPerUpdate,
      budget: this.macBudget, sliced: this.sliceBudget,
      fitsInOneCycle: mac <= this.macBudget,
      fits: mac <= allowed };
  }

  /**
   * The soft sensor's own arithmetic per CORRECTION update, so it is comparable with the
   * control path. One feature expansion and one readout per target, times the number of
   * sensor samples in a grid interval. Training is not counted: an `adapt()` is a rank-1
   * covariance update at ~34 000 MAC-equivalents, thirteen times the whole cycle budget,
   * and it runs only during commissioning — which is exactly why the module locks.
   */
  _sensorCost() {
    const st = this.ss.status ? this.ss.status() : {};
    const nf = st.features || 0;
    const nTarget = this.lead > 0 ? 2 : 1;
    const perSample = nf * (1 + nTarget);
    return Math.round(perSample * Math.max(1, this.grid / this.S));
  }

  /**
   * SCORE A CONSTRAINED DESIGN BY RUNNING IT, because there is no filter to convolve.
   *
   * The receding-horizon controller has no impulse response of its own -- it is a
   * nonlinear map from the look-ahead to a command, and the nonlinearity is exactly the
   * point of it. So it is scored the only way it can be: simulate the loop over the
   * identification record, against the MEASURED disturbance, on samples the map never
   * saw, with the same closed-form scalar every other candidate gets.
   *
   * THE SCALAR IS NOT APPLIED TO THE OUTPUT HERE, and that difference matters. Scaling a
   * constrained command after the fact breaks the constraint it was solved under, which
   * is the whole thing being bought. The scalar is computed for comparability and the
   * design is scored at alpha = 1; where the module wants a gentler version it asks for
   * one by re-solving with a smaller LIMIT, which is a re-parameterisation rather than a
   * violation.
   */
  _scoreMPC(cfg, eHat, dMeas, dm, from) {
    const N = eHat.length;
    const mpc = new PreviewMPC(cfg.h, cfg);
    const u = new Float64Array(N);
    const win = new Float64Array(cfg.horizon);
    for (let k = 0; k < N; k++) {
      for (let i = 0; i < cfg.horizon; i++) {
        const j = k + i;
        win[i] = j < N ? eHat[j] : eHat[N - 1];
      }
      u[k] = mpc.step(win);
    }
    const M = this.h.length;
    const hu = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      let a = 0;
      for (let j = 0; j < M; j++) if (k - j >= 0) a += this.h[j] * u[k - j];
      hu[k] = a;
    }
    let res = 0, eff = 0, umax = 0, cnt = 0;
    for (let k = from; k < N; k++) {
      const r = (dMeas[k] - dm) + hu[k];
      res += r * r; cnt++;
      const d = u[k] - u[k - 1];
      eff += d * d;
      umax = Math.max(umax, Math.abs(u[k]));
    }
    return { alpha: 1, res: Math.sqrt(res / Math.max(1, cnt)),
      effort: Math.sqrt(eff / Math.max(1, cnt)), umax };
  }

  /**
   * ONE SCORER FOR EVERY CANDIDATE, which is the only way two designs of different shape
   * can be compared. It runs the filter over the map's predicted disturbance -- what the
   * machine will actually see -- pushes the result through the identified plant, and
   * scores the residual against the MEASURED disturbance on samples the map never saw.
   *
   * The scalar is the best one in closed form, clamped to [0, 1]: a correction that wants
   * to be applied BACKWARDS or more than fully is one the identification does not
   * support, and clamping is what lets "this cannot help here" be an outcome the module
   * reaches rather than a failure it walks into.
   */
  _score(q, centre, eHat, dMeas, dm, from) {
    const N = eHat.length, M = this.h.length;
    const u = new Float64Array(N), hu = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      let a = 0;
      for (let j = 0; j < q.length; j++) {
        const i = k + centre - j;
        if (i >= 0 && i < N) a += q[j] * eHat[i];
      }
      u[k] = a;
    }
    for (let k = 0; k < N; k++) {
      let a = 0;
      for (let j = 0; j < M; j++) if (k - j >= 0) a += this.h[j] * u[k - j];
      hu[k] = a;
    }
    let num = 0, den = 0;
    for (let k = from; k < N; k++) { num -= (dMeas[k] - dm) * hu[k]; den += hu[k] * hu[k]; }
    const alpha = den > 0 ? Math.max(0, Math.min(1, num / den)) : 0;
    let res = 0, eff = 0, umax = 0, cnt = 0;
    for (let k = from; k < N; k++) {
      const r = (dMeas[k] - dm) + alpha * hu[k];
      res += r * r; cnt++;
      const d = alpha * (u[k] - u[k - 1]);
      eff += d * d;
      umax = Math.max(umax, Math.abs(alpha * u[k]));
    }
    return { alpha, res: Math.sqrt(res / Math.max(1, cnt)),
      effort: Math.sqrt(eff / Math.max(1, cnt)), umax };
  }

  /**
   * QUIET IS A PROPERTY OF THE SIGNAL, not a number of samples: a machine is quiet when
   * successive readings stop changing relative to how much they have changed so far. The
   * scale comes from the record itself, so it works on a plant whose truth is measured in
   * millimetres and on one measured in degrees.
   */
  _isQuiet(y) {
    // QUIET IS "IT HAS NOT MOVED", NOT "IT IS MOVING SLOWLY", and the difference is the
    // whole check. Comparing SUCCESSIVE readings tests a RATE, and a first-order settle
    // has a small rate long before it has arrived: with a time constant of 3000 steps
    // sampled every 10, the per-sample change falls under 2e-3 of the span while 40% of
    // the travel is still to come — measured, it declared quiet at step 3350 of a settle
    // that was 67% done. So the test is the TRAVEL over a trailing window: the machine is
    // quiet when its readings have spanned less than a tolerance of the motion seen so
    // far, for a whole window. That is insensitive to the sample interval and it cannot
    // be satisfied by drifting slowly.
    //
    // AND THE SCALE HAS TO BE SEEDED OR THERE IS NO SCALE. `spanSeen` used to be measured
    // against `this.y0`, which is only assigned when the FIRST wait ENDS — so throughout
    // it the span was identically zero, the scale was 1e-300, and quiet degenerated to
    // BIT-EXACTLY CONSTANT. On a noiseless simulation that fires immediately and nothing
    // looks wrong; with noise it never fires and the wait ends on the 200000-sample
    // fallback instead. Measured on a settling plant: 1 261 813 solver steps at 1e-9
    // relative noise, twenty minutes at a 1 ms cycle, reported as normal progress.
    const N = 40;
    if (!this.qRing || this.qRing.length !== N) { this.qRing = new Float64Array(N); this.qN = 0; }
    if (this.qBase == null) this.qBase = y;
    this.qRing[this.qN % N] = y;
    this.qN++;
    this.spanSeen = Math.max(this.spanSeen || 0, Math.abs(y - this.qBase));
    if (this.qN < N) { this.quietRun = 0; return false; }
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < N; i++) { const v = this.qRing[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    // A floor relative to the reading itself, because a machine already at rest when
    // asked has a genuinely tiny span and would otherwise be held to a tolerance of
    // nothing — and sitting at a non-zero value (an arm holding its gravity sag) is the
    // ordinary case, so |y| is the scale that is always available.
    const scale = Math.max(this.spanSeen, 1e-6 * Math.abs(y), 1e-300);
    this.quietRun = (hi - lo) < 2e-3 * scale ? this.quietRun + 1 : 0;
    return this.quietRun >= 1;
  }

  _step(truth) {
    const y = truth == null ? 0 : truth;
    if (this.sub === 'quiet') {
      // WAIT FOR THE MACHINE TO STOP MOVING BEFORE STEPPING IT. Without this the step
      // test measures whatever the plant was already doing: on the arm it read the
      // gravity sag settling in, and reported a DC gain of -1.65 where the truth is
      // +15.5 -- wrong by a factor of ten AND in the wrong direction, while the impulse
      // response from the probe had it right at +15.9. Two identifications disagreeing
      // is what caught it, which is the argument for having both.
      this.i++;
      this.note = `waiting for the machine to be quiet (${this.quietRun})`;
      if (!this._isQuiet(y)) {
        if (this.i < 200000) return;
        // NOT QUIET, OUT OF PATIENCE — which is a different outcome from quiet and is
        // said so rather than silently proceeding into a step test the machine will
        // confound. Everything downstream is still attempted; the flag is what lets a
        // caller know the DC gain rests on a machine that never settled.
        this.quietTimedOut = true;
      }
      this.sub = 'step'; this.i = 0; this.quietRun = 0; this.prevY = null;
      this.y0 = y; this.spanSeen = 0; this.qBase = y; this.qN = 0;
      this.u = this.probeAmp;
      this.sy = [y];
      return;
    }
    this.sy.push(y);
    this.i++;
    this.note = `step test (${this.i} samples)`;
    // Stop when the RESPONSE is quiet, not after a fixed count.
    if (!this._isQuiet(y) && this.i < 200000) return;
    const yy = this.sy;
    const n = yy.length;
    const y0 = yy[0];
    // The final value is the mean of the last fifth, which is the weakest estimate that
    // does not assume a shape.
    let yf = 0;
    const tail = Math.max(1, Math.floor(n / 5));
    for (let j = n - tail; j < n; j++) yf += yy[j];
    yf /= tail;
    const swing = yf - y0;
    this.dc = swing / (this.probeAmp || 1);
    // Settling time: the last sample outside 5% of the final value. If it never settles
    // within the record, the record IS the estimate and the note says so.
    let last = 0;
    const tol = 0.05 * Math.abs(swing);
    for (let j = 0; j < n; j++) if (Math.abs(yy[j] - yf) > tol) last = j;
    this.settledInRecord = last < n - tail;
    this.settleSteps = Math.max(4 * this.S, (last + 1) * this.S);
    // THE GRID IS SIZED SO THE IMPULSE RESPONSE FITS IN THE TAPS, with a margin, and is
    // always a whole number of host samples so the two cadences stay commensurate.
    const want = 2 * this.settleSteps / this.taps;
    this.grid = Math.max(this.S, Math.round(want / this.S) * this.S);
    this.phase = 'probe'; this.i = 0; this.gridPhase = 0;
    this.u = this.seq[0] * this.probeAmp;
    this.note = `settles in ${this.settleSteps} steps · DC gain ${this.dc.toPrecision(3)}`;
    // THE STEP AND THE PROBE ARE TWO INDEPENDENT READINGS OF THE SAME NUMBER, so they can
    // check each other. A disagreement in SIGN or by more than a factor of a few means
    // one of them was confounded, and the run says so rather than proceeding on whichever
    // happened to be used first.
  }

  _probe(k, truth) {
    // WHAT WAS ACTUALLY APPLIED over the interval that just ended, not what is about to
    // be. The first version recorded the sequence value for THIS sample while the plant
    // had been driven by the previous one, which shifts the whole impulse response by a
    // sample and puts its peak in the wrong place -- and the peak is the identified
    // delay, so the error propagates straight into the inverse.
    // THE PROBE RUNS ON ITS OWN GRID, coarser than the host's sampling, because the grid
    // has to match the PLANT and the host's rate was chosen for something else. Holding
    // each bit for a whole grid interval is also what puts the probe's energy where the
    // plant actually responds: at the host rate on the arm, the probe was a square wave
    // twenty steps long against a plant whose fastest dynamics are three hundred, so
    // almost all of its energy landed above the plant's bandwidth and the identification
    // came back fitting noise -- with the SIGN of the gain flipping between runs.
    this.gridPhase = (this.gridPhase || 0) + this.S;
    if (this.gridPhase < this.grid) return;
    this.gridPhase = 0;
    this.pu.push(this.u);
    this.py.push(truth == null ? 0 : truth);
    this.pk.push(k);
    this.i++;
    // The probe is deliberately a SQUARE wave held for a whole grid interval -- that is
    // where its energy has to be -- so it is emitted as a hold, not a ramp.
    this.u = this.i < this.probeSamples ? this.seq[this.i] * this.probeAmp : 0;
    this.u0 = this.u; this.u1 = this.u; this.uStep = null;
    this.note = `probing the plant, held (${this.i}/${this.probeSamples})`;
    if (this.i < this.probeSamples) return;
    this.u = 0; this.u0 = 0; this.u1 = 0; this.uStep = null;
    this.phase = 'observe'; this.i = 0; this.gridPhase = 0;
    this.note = 'release the machine — watching the program run';
  }

  /**
   * WATCH THE MACHINE RUN ITS OWN PROGRAM, with the correction off, and learn what the
   * program does to it. Nothing is injected here; the only signal is the command the
   * host was going to send anyway.
   */
  _observe(k, truth) {
    this.gridPhase = (this.gridPhase || 0) + this.S;
    if (this.gridPhase < this.grid) return;
    this.gridPhase = 0;
    this.i++;
    // THE PROBE'S OWN RING IS NOT THE PROGRAM'S DOING, so the first impulse-response
    // length of the observation is watched and thrown away. Without it the record opens
    // with the plant still relaxing from the last PRBS bit -- a decay that is a function
    // of the probe rather than of the command, so the disturbance map cannot explain it
    // and is judged on it anyway. On the over-damped plant that alone put the design's
    // prediction at 1.19x for a correction the machine went on to measure at 1.57x.
    const skip = Math.min(this.taps, Math.floor(this.probeSamples / 4));
    if (this.i <= skip) {
      this.note = `letting the probe's own ring die (${this.i}/${skip})`;
      return;
    }
    this.ok.push(k); this.oy.push(truth == null ? 0 : truth);
    this.note = `watching the program (${this.ok.length}/${this.observeSamples})`;
    if (this.ok.length < this.observeSamples) return;
    this._identify();
  }

  /**
   * ONE SOLVE FOR BOTH, and it has to be one solve.
   *
   * The truth during a probe is the plant's response to the PROBE plus the disturbance
   * the TRAJECTORY is creating, and on a real machine the second is much the larger. A
   * first version deconvolved the probe alone after removing the mean, and the estimate
   * came back fitting the move instead of the plant: on the arm it reported a gain of
   * -13.7 where the truth is +15.5 -- right magnitude, WRONG SIGN -- with the peak at lag
   * zero and a "resonance" of 30 steps against a real 980. Every downstream number was
   * then confidently wrong, which is the failure mode this whole tab exists to avoid.
   *
   * Estimating the two TOGETHER fixes it and costs nothing: the PRBS is uncorrelated with
   * the command by construction, so the two blocks of the design matrix are nearly
   * orthogonal and the joint problem is no harder than either alone. It also removes a
   * phase -- the disturbance map falls out of the same solve rather than needing its own
   * correction-free run -- and it needs no periodicity, so it does not quietly assume the
   * machine repeats itself.
   */
  _identify() {
    const M = Math.min(this.taps, Math.floor(this.probeSamples / 4));
    // ---- THE PLANT, from the probe taken while the machine was HELD.
    //
    // AN EARLIER VERSION IDENTIFIED THE PLANT AND THE DISTURBANCE IN ONE JOINT SOLVE
    // WHILE THE MACHINE RAN ITS PROGRAM, and the argument for it was good: the PRBS is
    // uncorrelated with the command by construction, so the two blocks of the design
    // matrix are nearly orthogonal, and doing both at once removes a phase. It also fixed
    // a real failure -- deconvolving the probe alone on a RUNNING machine, after removing
    // the mean, fitted the move instead of the plant and reported the gain with the WRONG
    // SIGN.
    //
    // IT WAS STILL WRONG, AND ONLY A CLOSED-LOOP MEASUREMENT COULD SHOW IT. The joint
    // fit's impulse response has the right DC gain -- 14.8 against the step test's 14.3,
    // which is the cross-check that was passing -- and the WRONG SHAPE: its delay came
    // out at 30 grid samples against the held probe's 11, and its first taps are
    // negative. Run the same command twice, once bare and once corrected, and the
    // DIFFERENCE of the two error records is the plant's actual response to the
    // correction; against that, the joint fit explains the response at gain 0.10 and
    // correlation 0.33, while the held probe explains it at 0.57 and 0.75.
    //
    // The consequence was a design that could not know it was wrong: the scorer convolves
    // the candidate with the SAME h it was designed from, so a wrong h makes the
    // prediction and the design agree with each other and disagree with the machine. It
    // PREDICTED 1.81x and ACHIEVED 1.13x. With the plant identified while held and the
    // disturbance while running, the same search predicts 2.39x and ACHIEVES 2.84x --
    // and a prediction that is EXCEEDED is the signature of a model that is right, since
    // nothing in the design can flatter a number the machine goes on to beat.
    //
    // The failure the joint fit was introduced to prevent cannot happen here: it came
    // from the trajectory's disturbance dominating the record, and while the machine is
    // held there is no trajectory. The price is that commissioning holds the machine for
    // the probe as well as the step test, which is what a commissioning routine does.
    // BOTH RECORDS ARE CENTRED, OR NEITHER -- and getting that wrong costs a third of the
    // gain. Removing the mean from the OUTPUT alone tells the fit that a constant input
    // produces no output, which is false for any plant with a DC gain, and it biases the
    // recovered response down by exactly the probe's own DC content. Measured against a
    // synthetic whose answer is known: true 16.286, centre-the-output-only 10.927 (33%
    // low), centre both 16.282, centre neither 16.286. It showed up as all three plants
    // under-recovering their gain by the same 0.61-0.70 factor while every OTHER number
    // looked right -- a common factor across plants that share no physics is a property
    // of the code, not of any plant, which is what made it findable.
    let pm = 0, um = 0;
    for (let i = 0; i < this.py.length; i++) { pm += this.py[i]; um += this.pu[i]; }
    pm /= Math.max(1, this.py.length); um /= Math.max(1, this.pu.length);
    this.h = deconvolve(Float64Array.from(this.pu, (v) => v - um),
      Float64Array.from(this.py, (v) => v - pm), { taps: M, ridge: 1e-6 });
    this.model = summarise(this.h);
    // HELD OUT ON THE PROBE'S OWN LAST THIRD: how well does h predict a stretch it was
    // not fitted to? The MAP has always been validated this way and the PLANT never was,
    // which is half a validation -- and it is the half that was wrong when a design
    // predicted 1.81x and achieved 1.13x.
    {
      const sp = Math.floor(this.pu.length * 0.7);
      let ss = 0, sr = 0;
      for (let k = sp; k < this.py.length; k++) {
        let yh = 0;
        for (let j = 0; j < M; j++) if (k - j >= 0) yh += this.h[j] * (this.pu[k - j] - um);
        const e = (this.py[k] - pm) - yh;
        sr += e * e; ss += (this.py[k] - pm) * (this.py[k] - pm);
      }
      this.plantR2 = ss > 0 ? 1 - sr / ss : 0;
    }

    // ---- TWO GATES, BOTH OF WHICH WERE COMPUTED AND THEN IGNORED.
    //
    // THE CROSS-CHECK THIS FILE PROMISED AND NEVER IMPLEMENTED. The step test and the
    // probe are two independent readings of the same DC gain, and a comment three
    // hundred lines up has said for months that "a disagreement in SIGN or by more than
    // a factor of a few means one of them was confounded, and the run says so rather
    // than proceeding on whichever happened to be used first." No code did that. `dc`
    // was computed, printed, and compared to nothing.
    //
    // AND `plantR2` WAS THE SAME: a held-out score of the plant model, computed and
    // gated on nothing. Measured on a joint with Stribeck friction, commissioned from a
    // machine that had been running: the step test returned dc = -0.08 against a true
    // 15.5, the probe fit returned R2 = 0.003, and at heavier friction R2 = -7.29 — and
    // the module DESIGNED ANYWAY, deployed a filter, and made the machine WORSE, 0.81x.
    // The verify round did not save it either, because with a meaningless map the ratio
    // it measures is meaningless in the same direction.
    //
    // A MODULE THAT CANNOT IDENTIFY A PLANT HAS TO SAY SO. That is the honest outcome
    // and it is strictly better than a number: "I could not model this machine" is
    // actionable, and 0.81x presented as 1.33x is not.
    const gate = identGate(this.dc, this.model.gain, this.plantR2);
    this.identOk = gate.ok;
    if (!this.identOk) {
      this.identWhy = gate.why;
      this.note = `cannot identify this plant — ${this.identWhy}`;
      // Everything downstream is skipped, deliberately: no design, no verify round, no
      // correction. The soft sensor is left running, because it is a fit to measured
      // signals and does not depend on the plant model being right.
      this.h = new Float64Array(M);
      this.map = new WindowMap({ taps: [0], nonlinear: null });
      this.map.setWeights(new Float64Array(1), new Float64Array(1),
        new Float64Array(1).fill(1));
      this.q = new Float64Array(1); this.qCentre = 0; this.eRing = new Float64Array(1);
      this.design = { kind: 'none', alpha: 0, taps: 0, centre: 0, predicted: 1,
        refused: true, why: this.identWhy };
      this.basis = { chosen: 'none', tried: [] };
      this.phase = 'correct';
      return;
    }

    // ---- THE DISTURBANCE, from watching the program run with the correction off.
    // THE MAP'S TAPS ARE IN SOLVER STEPS, because features() adds them straight to k --
    // and the first version sized them in GRID SAMPLES and then used them as steps, so
    // its window was `grid` times too narrow. On the arm that is a factor of FIFTY: the
    // window meant to span 2800 steps spanned 70, which is less than a sixtieth of the
    // move it was supposed to explain. It cost the whole of the black box's shortfall at
    // the time, and every symptom pointed elsewhere -- the design honestly predicted
    // ~1.4x and honestly achieved 1.07x, so nothing looked broken. What found it was a
    // crude 96-bin phase-indexed average explaining 100% of the same disturbance, which
    // proves the disturbance is predictable and therefore that the map was failing.
    const reach = Math.max(6, Math.round(M * 0.8)) * this.grid;
    const nT = 12;
    const mapTaps = [];
    for (let j = 0; j < nT; j++) {
      mapTaps.push(Math.round(-reach * 0.25 + j * reach / (nT - 1)));
    }
    this.map = new WindowMap({ taps: mapTaps, nonlinear: this.nonlinear });
    const NO = this.ok.length;
    this.split = Math.floor(NO * 0.7);
    const F = [];
    for (let i = 0; i < NO; i++) F.push(this.map.features(this.ref, this.ok[i], this.grid));

    /** Fit the map over a chosen subset of its columns, and score it on held-out rows. */
    const fitCols = (cols) => {
      const n = cols.length, nTr = this.split;
      const mu = new Float64Array(n), sg = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let a = 0;
        for (let r = 0; r < nTr; r++) a += F[r][cols[i]];
        a /= nTr;
        let v = 0;
        for (let r = 0; r < nTr; r++) v += (F[r][cols[i]] - a) * (F[r][cols[i]] - a);
        v = Math.sqrt(v / nTr);
        mu[i] = v < 1e-12 ? 0 : a;
        sg[i] = v < 1e-12 ? 1 : v;
      }
      const A = Array.from({ length: n }, () => new Float64Array(n));
      const b = new Float64Array(n);
      const z = new Float64Array(n);
      for (let r = 0; r < nTr; r++) {
        for (let i = 0; i < n; i++) z[i] = (F[r][cols[i]] - mu[i]) / sg[i];
        for (let i = 0; i < n; i++) {
          const zi = z[i];
          for (let j = 0; j < n; j++) A[i][j] += zi * z[j];
          b[i] += zi * this.oy[r];
        }
      }
      let tr = 0;
      for (let i = 0; i < n; i++) tr += A[i][i];
      for (let i = 0; i < n; i++) A[i][i] += 1e-6 * (tr / n || 1);
      const w = solve(A, b);
      // HELD OUT, on rows no part of this fit has seen -- the only honest way to compare
      // bases of different size, since a bigger one always wins in sample.
      let err = 0, cnt = 0;
      for (let r = nTr; r < NO; r++) {
        let yh = 0;
        for (let i = 0; i < n; i++) yh += w[i] * ((F[r][cols[i]] - mu[i]) / sg[i]);
        const e = this.oy[r] - yh;
        err += e * e; cnt++;
      }
      return { w, mu, sg, cols, heldOut: Math.sqrt(err / Math.max(1, cnt)) };
    };

    const chosen = this._chooseBasis(fitCols, 0);
    const { w, mu, sg, cols } = chosen.fit;
    if (cols.length !== this.map.nf) this.map.prune(cols);
    this.basis = chosen.report;
    this.map.setWeights(w, mu, sg);

    this._design();
    this.phase = (this.q.some((v) => v !== 0) || this.mpcAlt) ? 'verify' : 'correct';
    this.i = 0; this.vE = 0; this.vH = 0; this.vN = 0;
    this.vSlew = 0; this.vCurv = 0; this.vC = 0; this.vULast = 0; this.vDLast = 0;
    this.q0 = Float64Array.from(this.q);
    this.qCentre0 = this.qCentre;
    this.vResults = []; this.vIdx = 0;
    // THE SEARCH GOES BOTH WAYS, and the upward half is not symmetry for its own sake.
    // The design's own prediction can be pessimistic as easily as optimistic -- measured
    // on the over-damped plant B it PREDICTED 1.19x and the machine returned 1.57x, so a
    // rule that could only back off would have left that on the table. The cap still
    // binds: a scale that would push the correction past it is never tried.
    // THE LADDER SPANS BOTH FAMILIES, because the offline round could not separate them.
    // For a filter the knob is a gain on the taps; for a constrained solve it is the
    // LIMIT, since scaling the answer of a solve gives a command that is no longer the
    // optimum of anything and throws away the property the design exists for.
    // THE ZERO RUNG COMES FIRST, AND IT MEASURES THE INSTRUMENT RATHER THAN A DESIGN.
    //
    // Every rung is scored as sqrt(sum e^2 / sum e_measured^2) — the error the machine
    // actually had, against the MAP'S OWN PREDICTION of what it would have had. That is
    // the right comparison (it needs no second baseline run and it is window-matched),
    // but it inherits the map's bias exactly: if the map over-states the disturbance by a
    // factor, the correction is wrong by that factor AND the reported ratio is inflated
    // by the same factor in the same direction. Two wrongs that agree — the failure
    // brick 28 fixed for `h` and left standing here.
    //
    // MEASURED: six repeats of one rung span 1.5%, so the round is PRECISE; and on an
    // aperiodic command it sat 37% above what the machine went on to achieve, while on a
    // periodic one it was exact. Precision is not the problem, accuracy is — and the bias
    // appears exactly where the map generalises worse, which no other instrument here can
    // see.
    //
    // With the correction off, that same ratio IS the map's bias. So it is measured once,
    // as a rung, and every other rung is divided by it. It costs one verify window and
    // nothing at run time, and it doubles as the do-nothing reference the ladder never
    // had — a design is deployed only if it beats a measurement of the machine, not a
    // prediction of it.
    this.vScales = [{ kind: 'fir', scale: 0, zero: true }, { kind: 'fir', scale: 1 }];
    if (this.design.umax * 2 <= this.design.uCap * 1.000001) {
      this.vScales.push({ kind: 'fir', scale: 2 });
    }
    this.vScales.push({ kind: 'fir', scale: 0.5 });
    if (this.mpcAlt) {
      this.mpcBaseU = this.mpcAlt.U;
      this.vScales.push({ kind: 'mpc', scale: 1 });
      this.vScales.push({ kind: 'mpc', scale: 0.5 });
      // …and the GENTLE end of the same design, if there is one worth offering. It is a
      // different rung from `scale 0.5`: that one lowers the LIMIT, which makes the
      // correction smaller, and this one raises the effort weight, which makes it
      // SMOOTHER. Small and smooth are not the same request, and the measurement says so
      // -- on the arm the two half-limit rungs came back with the same curvature as the
      // full-limit ones to three figures.
      if (this.mpcGentle) this.vScales.push({ kind: 'mpc', scale: 1, gentle: true });
    }
    this._applyTrial(0, this.ok[this.ok.length - 1]);
    // THE RING HOLDS THE FUTURE THE CONVOLUTION NEEDS, indexed so that the entry written
    // j samples ago is e^(k + (centre - j) * grid) -- which is exactly the argument tap j
    // of q multiplies. Priming it in the same convention means the very first corrected
    // sample is a whole convolution rather than a partial one.
    // …and ONE GRID SAMPLE AHEAD, matching _firStep()'s window: the filter is evaluated
    // for the NEXT grid point so offset() has something to ramp toward, and a ring primed
    // in the old convention would leave the first `taps` updates reading a window one
    // sample out of step with the one being written into it.
    const k = this.ok[this.ok.length - 1];
    this.eRing = new Float64Array(this.q.length);
    for (let j = 0; j < this.q.length; j++) {
      this.eRing[(this.q.length - j) % this.q.length] = this.map.predict(this.ref,
        k + this.grid + (this.qCentre - j) * this.grid, this.grid);
    }
    this.eHead = 0;
    this.note = 'identified — correcting';
  }

  _correct(k) {
    this.gridPhase = (this.gridPhase || 0) + this.S;
    if (this.gridPhase < this.grid) return;
    this.gridPhase = 0;
    // u = -(q * e^), with e^ read AHEAD of now.
    //
    // A CONVOLUTION RUN BACKWARDS IS NOT A CONVOLUTION, and the first version ran this
    // one backwards. (q * e)(k) is sum_j q[j] e[k-j], and with q an inverse delayed by
    // `centre` the argument tap j needs is e^(k + (centre - j) * grid) -- the first
    // version indexed (j - centre), i.e. time-reversed. It cost nothing visible in the
    // identification, which was excellent on every plant (plant B's DC gain came back at
    // -6.000e-2 against a true -0.06), and made the CORRECTION worse than doing nothing
    // on all three: 0.6x, 0.9x and 0.93x. A correct inverse convolved the wrong way round
    // is a plausible-looking filter that answers the wrong question, and no closed-loop
    // score can tell it apart from a bad inverse -- which is why firInverse() is checked
    // against its own convolution and this against a plant it can be scored on.
    if (this.mpc) { this._emit(k, this._mpcStep(k), this.mpc.next()); return; }
    this._emit(k, this.u1, this._firStep(k).next);
  }

  /**
   * ONE GRID UPDATE OF THE PREVIEW FILTER, evaluated one grid sample AHEAD so the pair
   * (now, next) that offset() ramps between costs exactly the one dot product it always
   * cost: this update's `next` is the following update's `now`, carried rather than
   * recomputed. Shifting the whole window by one grid sample moves the tap that reads
   * "the disturbance at NOW" from `centre` back to `centre + 1`, which is the one thing
   * a reader of this ring has to know.
   */
  _firStep(k) {
    const L = this.q.length;
    this.eHead = (this.eHead + 1) % L;
    this.eRing[this.eHead] = this.map.predict(this.ref,
      k + this.grid + this.qCentre * this.grid, this.grid);
    // The taps carry their own sign -- the residual design's minus is folded into them
    // at design time so that both designs deploy through this one line.
    let s = 0;
    for (let j = 0; j < L; j++) s += this.q[j] * this.eRing[(this.eHead - j + L) % L];
    return { next: s, now: this.eRing[(this.eHead - this.qCentre - 1 + L * 2) % L] };
  }

  /** One grid update's worth of output: what to apply now, and what to ramp toward. */
  _emit(k, now, next) {
    this.u0 = now; this.u1 = next; this.uStep = k; this.u = now;
  }

  /**
   * DEPLOY IT AND MEASURE IT, because a prediction computed from the model cannot check
   * the model.
   *
   * THIS IS THE STEP THE WHOLE MODULE WAS MISSING, and its absence produced the loudest
   * failure in this file's history twice over. The design scores a candidate by
   * convolving it with the SAME impulse response it was designed from, so a wrong h makes
   * the design and its prediction agree with each other and disagree with the machine --
   * two wrongs that agree, which no open-loop number can separate. Measured on the arm
   * before the identification was split, that read 1.81x predicted against 1.13x
   * achieved; on a lightly damped plant whose disturbance sits on its own resonance it
   * reads 9.7x predicted against 1.15x achieved, and there the model is not even wrong --
   * the plant simply cannot be inverted there at this sample rate.
   *
   * The comparison is WINDOW-MATCHED and needs no second baseline run: over the same
   * samples, the map's prediction of what the error WOULD have been, against the error
   * actually measured with the correction applied. It is deliberately biased against
   * accepting, since the map understates the disturbance by its own fit error, so a
   * correction that passes this has passed a conservative test.
   *
   * The scale is then searched on the machine rather than trusted from the design, and
   * if none of the sizes tried beats doing nothing the machine is left alone. That
   * outcome is a result, not a failure.
   */
  /**
   * ONE UPDATE OF THE CONSTRAINED CONTROLLER, and it costs ONE map prediction, exactly
   * like the filter it competes with. The horizon of predicted disturbance is a ring with
   * one new entry per update -- the far end -- not `horizon` fresh evaluations. Getting
   * that wrong would multiply the map's cost by the horizon and put the whole design
   * outside any cycle budget, which is the difference between this being deployable and
   * being an argument.
   */
  _mpcStep(k) {
    const N = this.mpcCfg.horizon, w = this.mpcWin;
    for (let i = 0; i < N - 1; i++) w[i] = w[i + 1];
    w[N - 1] = this.map.predict(this.ref, k + (N - 1) * this.grid, this.grid);
    return this.mpc.step(w);
  }

  /** Put trial `i` on the machine. Both families build from their own stored design. */
  _applyTrial(i, k0) {
    const t = this.vScales[i];
    if (t.kind === 'mpc') {
      this.mpcCfg = { ...(t.gentle ? this.mpcGentle : this.mpcAlt),
        U: this.mpcBaseU * t.scale };
      this.mpc = new PreviewMPC(this.mpcCfg.h, this.mpcCfg);
      this.mpcWin = new Float64Array(this.mpcCfg.horizon);
      // PRIMED AT THE STEP THE TRIAL ACTUALLY STARTS AT, not at the end of the
      // observation. A trial that begins thousands of steps later and primes its
      // look-ahead from where the record ended spends its first `horizon` updates acting
      // on the wrong part of the command -- which is not visibly broken, it just makes
      // the trial score worse than the design deserves, and the trials are being compared
      // against each other.
      for (let n = 0; n < this.mpcCfg.horizon; n++) {
        this.mpcWin[n] = this.map.predict(this.ref, k0 + n * this.grid, this.grid);
      }
    } else {
      this.mpc = null;
      this.qCentre = this.qCentre0;
      for (let n = 0; n < this.q.length; n++) this.q[n] = this.q0[n] * t.scale;
    }
  }

  _verify(k, truth) {
    this.gridPhase = (this.gridPhase || 0) + this.S;
    if (this.gridPhase < this.grid) return;
    this.gridPhase = 0;
    const L = this.q.length;
    let eh;
    if (this.mpc) {
      eh = this.mpcWin[0];
      this._emit(k, this._mpcStep(k), this.mpc.next());
    } else {
      const f = this._firStep(k);
      eh = f.now;
      this._emit(k, this.u1, f.next);
    }
    // WHAT THE CORRECTION COSTS THE MACHINE, measured on the machine alongside what it
    // buys. The module cannot see the drive's torque -- the signals it is handed are
    // deliberately unlabelled -- but the setpoint offset IS its own output, and a
    // setpoint the loop cannot follow is exactly what a drive answers with effort that
    // moves nothing. So it scores its own command: how far it moves per update (slew)
    // and how sharply that changes (curvature), both on its own grid.
    const d1 = this.u0 - this.vULast, d2 = d1 - this.vDLast;
    if (this.i > 0) { this.vSlew += d1 * d1; this.vCurv += d2 * d2; this.vC++; }
    this.vULast = this.u0; this.vDLast = d1;
    this.i++;
    // The first pass through a fresh controller is a partial convolution; skip a window.
    if (this.i > L) {
      const e = truth == null ? 0 : truth;
      this.vE += e * e; this.vH += eh * eh; this.vN++;
    }
    const t = this.vScales[this.vIdx];
    this.note = `on the machine: ${t.zero ? 'no correction (the map\'s own bias)'
      : `${t.kind}${t.gentle ? '-gentle' : ''} ×${t.scale}`} `
      + `(${this.vIdx + 1}/${this.vScales.length}, ${this.i}/${this.verifySamples})`;
    if (this.i < this.verifySamples) return;
    const got = this.vN > 0 && this.vE > 0 ? Math.sqrt(this.vH / this.vE) : 0;
    const sw = Math.max(this.swing || 0, 1e-300), nc = Math.max(1, this.vC);
    this.vResults.push({ kind: t.kind, scale: t.scale, gentle: !!t.gentle, zero: !!t.zero,
      ratio: got,
      slew: Math.sqrt(this.vSlew / nc) / sw, curv: Math.sqrt(this.vCurv / nc) / sw });
    this.vIdx++; this.i = 0; this.vE = 0; this.vH = 0; this.vN = 0;
    this.vSlew = 0; this.vCurv = 0; this.vC = 0; this.vULast = 0; this.vDLast = 0;
    if (this.vIdx < this.vScales.length) { this._applyTrial(this.vIdx, k); return; }

    // WHAT THE MACHINE IS ASKED IS BOTH HALVES OF THE QUESTION, and until this round it
    // was only asked one. Tracking alone has no opinion about a command, so the ladder
    // was free to return the twitchiest design on it -- measured on the arm before this
    // rule existed, the deployed correction made the commanded motor position 6354x
    // rougher than the bare reference and the drive torque 53x rougher, for 3.68x of
    // tracking, with the ENCODER coming out smoother than with no correction at all
    // because the servo could not follow any of it.
    //
    // THE RULE IS THE SAME KNEE THE REST OF THE MODULE USES rather than a new weighting:
    // among the trials whose MEASURED tracking is within 5% of the best, take the
    // SMOOTHEST. A weighted sum of two incommensurable quantities is a preference
    // disguised as a result; "as accurate as the best, and the gentlest of those" is not.
    // THE MAP'S OWN BIAS, DIVIDED OUT. A zero rung should read 1.00 if the map is
    // unbiased; whatever it actually reads is the factor every other rung inherits.
    const zero = this.vResults.find((r) => r.zero);
    const bias = zero && zero.ratio > 0.2 && zero.ratio < 5 ? zero.ratio : 1;
    this.design.mapBias = zero ? zero.ratio : null;
    for (const r of this.vResults) r.ratio /= bias;
    const live = this.vResults.filter((r) => !r.zero);
    const bestRatio = Math.max(...live.map((r) => r.ratio));
    const best = live.filter((r) => r.ratio >= 0.95 * bestRatio)
      .reduce((m, r) => (r.curv < m.curv ? r : m));
    this.design.trials = this.vResults;
    this.design.verified = best.ratio;
    this.design.scale = best.scale;
    if (best.ratio < 1.02) {
      // NOTHING HERE BEATS DOING NOTHING, which is a result rather than a failure.
      this.mpc = null;
      for (let j = 0; j < L; j++) this.q[j] = 0;
      this.design.kind = 'none'; this.design.scale = 0;
      this.note = 'measured on the machine: nothing here beats doing nothing';
    } else {
      this._applyTrial(this.vScales.indexOf(this.vScales.find((c) =>
        !c.zero && c.kind === best.kind && c.scale === best.scale
        && !!c.gentle === !!best.gentle)), k);
      if (best.kind === 'mpc') {
        this.design.kind = 'constrained';
        // …and the OPEN-LOOP prediction reported has to belong to the design that was
        // deployed, not to the one that lost. The filter's number is kept beside it,
        // since the gap between the two is what the machine was asked to settle.
        this.design.firPredicted = this.design.predicted;
        this.design.firRes = this.design.res;
        if (this.design.mpcPredicted != null) {
          this.design.predicted = this.design.mpcPredicted;
          this.design.res = this.design.mpcRes;
        }
        this.design.horizon = this.mpcCfg.horizon;
        this.design.iters = this.mpcCfg.iters;
        this.design.lambda = this.mpcCfg.lambda;
        this.design.taps = this.mpcCfg.h.length;
        this.design.previewSteps = this.mpcCfg.horizon * this.grid;
        this.design.umax = this.mpcCfg.U;
        this.design.alpha = 1;
      } else {
        this.design.alpha *= best.scale;
        this.design.umax *= best.scale;
      }
      this.note = `measured on the machine: ${best.ratio.toFixed(2)}× `
        + `(${best.kind}${best.gentle ? '-gentle' : ''} ×${best.scale})`;
    }
    this.phase = 'correct'; this.u = 0; this.u0 = 0; this.u1 = 0; this.uStep = null;
    this.i = 0;
  }

  /** Freeze everything. The instrument goes away and never comes back. */
  lock() {
    if (this.ss && this.ss.frozen) this.ss.lam = 1.0;
    this.phase = 'locked';
    this.note = 'locked — the instrument is gone';
    return this;
  }

  status() {
    return { phase: this.phase, note: this.note, trained: this.trained,
      model: this.model, map: this.map ? this.map.status() : null,
      settleSteps: this.settleSteps, dc: this.dc, grid: this.grid, design: this.design,
      quietTimedOut: !!this.quietTimedOut,
      plantR2: this.plantR2, basis: this.basis,
      identOk: this.identOk !== false, identWhy: this.identWhy || null,
      cost: this.q ? this.cost() : null,
      settledInRecord: this.settledInRecord,
      u: this.u, est: this.est, forecast: this.forecast };
  }
}
