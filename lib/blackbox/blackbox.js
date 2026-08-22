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
import { universalMap } from '../ngrc/feature_map.js';

/** Solve A x = b by Gaussian elimination with partial pivoting. A is destroyed. */
function solve(A, b) {
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
    this.fmap = nonlinear
      ? universalMap(this.nBase, nonlinear.nh ?? 16, nonlinear.nf ?? 16,
        nonlinear.seed ?? 11)
      : null;
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

  features(ref, k, dt) {
    const z = this.base(ref, k, dt);
    if (this.fmap) return Float64Array.from(this.fmap.expand(Array.from(z)));
    const f = new Float64Array(this.nf);
    f[0] = 1;
    for (let i = 0; i < this.nBase; i++) f[i + 1] = z[i];
    return f;
  }

  observe(ref, k, dt, y) { this.rows.push(this.features(ref, k, dt)); this.targets.push(y); }

  /** Take weights identified elsewhere -- see BlackBox._identify()'s joint solve. */
  setWeights(w, mu, sg) { this.w = w; this.mu = mu; this.sg = sg; return this; }

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
    this.w = solve(A, bb);
    this.mu = mu; this.sg = sg;
    return this;
  }

  ridgeAbs(tr, n, m) { return 1e-6 * (tr / n || m); }

  get ready() { return this.w !== null; }

  predict(ref, k, dt) {
    if (!this.w) return 0;
    const f = this.features(ref, k, dt);
    let s = 0;
    for (let i = 0; i < this.nf; i++) s += this.w[i] * ((f[i] - this.mu[i]) / this.sg[i]);
    return s;
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
      stepSamples = 600, nonlinear = true } = o;
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
    this.pu = []; this.py = []; this.pk = [];   // probe input / output / step
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
    this.u = 0;
    this.eRing = null; this.eHead = 0;
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
  offset() { return this.u; }

  get ready() { return this.phase === 'correct' || this.phase === 'locked'; }

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
    const N = this.py.length;
    const M = this.h.length;
    // THE DISTURBANCE AS MEASURED, not as modelled: subtract the probe's own response
    // from the recorded truth and what is left is what the trajectory did, including
    // every part of it the map failed to capture. Designing against the map's own
    // version would be designing against a residual that is zero by construction.
    const dMeas = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      let hu = 0;
      for (let j = 0; j < M; j++) if (k - j >= 0) hu += this.h[j] * this.pu[k - j];
      dMeas[k] = this.py[k] - hu;
    }
    // …and scored only on samples the map never saw.
    const from = Math.max(this.split, M + this.invTaps);
    let dm = 0;
    for (let k = from; k < N; k++) dm += dMeas[k];
    dm /= Math.max(1, N - from);
    const eHat = new Float64Array(N);
    for (let i = 0; i < N; i++) eHat[i] = this.map.predict(this.ref, this.pk[i], this.grid);
    let base = 0, nb = 0;
    for (let k = from; k < N; k++) { const v = dMeas[k] - dm; base += v * v; nb++; }
    base = Math.sqrt(base / Math.max(1, nb));
    // Candidate widths span "trust the plant everywhere" to "trust it only in the slowest
    // band", geometrically, so the search costs a handful of small solves.
    const spanW = Math.max(2, Math.round(this.h.length / 2));
    const cands = [0];
    for (let w = 1; w <= spanW; w = Math.max(w + 1, Math.round(w * 1.6))) cands.push(w);
    let best = null;
    for (const width of cands) {
      const centre = Math.min(this.invTaps - 2,
        this.model.delay + Math.floor(this.invTaps / 3));
      const { q } = firInverse(this.h, { length: this.invTaps, ridge: this.invRidge,
        width, centre });
      // u = -(q * e^) advanced by `centre`, then the residual e^ + h*u, all on the grid.
      const u = new Float64Array(N);
      for (let k = 0; k < N; k++) {
        let acc = 0;
        for (let j = 0; j < q.length; j++) {
          const idx = k + centre - j;
          if (idx >= 0 && idx < N) acc += q[j] * eHat[idx];
        }
        u[k] = -acc;
      }
      // The best scalar on this correction, in closed form: alpha = -<e, Hu>/<Hu, Hu>,
      // clamped to [0, 1] because a correction that wants to be applied BACKWARDS or
      // more than fully is one the identification does not support.
      const hu = new Float64Array(N);
      for (let k = 0; k < N; k++) {
        let acc = 0;
        for (let j = 0; j < this.h.length; j++) if (k - j >= 0) acc += this.h[j] * u[k - j];
        hu[k] = acc;
      }
      let num = 0, den = 0;
      for (let k = from; k < N; k++) {
        num -= (dMeas[k] - dm) * hu[k]; den += hu[k] * hu[k];
      }
      const alpha = den > 0 ? Math.max(0, Math.min(1, num / den)) : 0;
      let res = 0, cnt = 0;
      for (let k = from; k < N; k++) {
        const r = (dMeas[k] - dm) + alpha * hu[k]; res += r * r; cnt++;
      }
      res = Math.sqrt(res / Math.max(1, cnt));
      if (!best || res < best.res) best = { width, q, centre, alpha, res };
    }
    this.q = Float64Array.from(best.q, (v) => v * best.alpha);
    this.qCentre = best.centre;
    this.design = { width: best.width, alpha: best.alpha,
      predicted: base > 0 ? base / Math.max(best.res, 1e-300) : 1, base, res: best.res };
  }

  /**
   * QUIET IS A PROPERTY OF THE SIGNAL, not a number of samples: a machine is quiet when
   * successive readings stop changing relative to how much they have changed so far. The
   * scale comes from the record itself, so it works on a plant whose truth is measured in
   * millimetres and on one measured in degrees.
   */
  _isQuiet(y) {
    if (this.prevY == null) { this.prevY = y; this.spanSeen = 0; return false; }
    const d = Math.abs(y - this.prevY);
    this.prevY = y;
    this.spanSeen = Math.max(this.spanSeen || 0, Math.abs(y - (this.y0 ?? y)));
    const scale = Math.max(this.spanSeen, 1e-300);
    if (d < 2e-3 * scale) this.quietRun++; else this.quietRun = 0;
    return this.quietRun >= 40;
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
      if (!this._isQuiet(y) && this.i < 200000) return;
      this.sub = 'step'; this.i = 0; this.quietRun = 0; this.prevY = null;
      this.y0 = y; this.spanSeen = 0;
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
    this.u = this.i < this.probeSamples ? this.seq[this.i] * this.probeAmp : 0;
    this.note = `probing ${this.i}/${this.probeSamples}`;
    if (this.i < this.probeSamples) return;
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
    // The map's window is placed from the probe's own length rather than chosen.
    const reach = Math.max(6, Math.round(M * 0.8));
    const nT = 12;
    const mapTaps = [];
    for (let j = 0; j < nT; j++) {
      mapTaps.push(Math.round(-reach * 0.25 + j * reach / (nT - 1)));
    }
    this.map = new WindowMap({ taps: mapTaps, nonlinear: this.nonlinear });
    const nf = this.map.nf;
    const n = M + nf;                       // impulse taps, then the command-window map
    // THE MAP IS FITTED ON PART OF THE RECORD AND THE DESIGN IS CHOSEN ON THE REST.
    // Choosing it on the same samples the map was fitted to is the oldest mistake in
    // this project's book and it produced the loudest version of it yet: the design
    // predicted 73x on a plant where it went on to achieve 2.8x, because in-sample the
    // map explains almost all of the disturbance and the residual it is choosing against
    // is its own fit error rather than the plant's.
    this.split = Math.floor(this.pu.length * 0.7);
    const rows = [], ys = [];
    for (let s0 = M; s0 < this.split; s0++) {
      const row = new Float64Array(n);
      for (let j = 0; j < M; j++) row[j] = this.pu[s0 - j];
      const f = this.map.features(this.ref, this.pk[s0], this.grid);
      for (let j = 0; j < nf; j++) row[M + j] = f[j];
      rows.push(row); ys.push(this.py[s0]);
    }
    const m = rows.length;
    const mu = new Float64Array(n), sg = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let a = 0;
      for (const r of rows) a += r[i];
      a /= m;
      let v = 0;
      for (const r of rows) v += (r[i] - a) * (r[i] - a);
      v = Math.sqrt(v / m);
      // The map's bias column is constant; leave it alone rather than dividing by zero.
      mu[i] = v < 1e-12 ? 0 : a;
      sg[i] = v < 1e-12 ? 1 : v;
    }
    const A = Array.from({ length: n }, () => new Float64Array(n));
    const b = new Float64Array(n);
    for (let r = 0; r < m; r++) {
      const z = new Float64Array(n);
      for (let i = 0; i < n; i++) z[i] = (rows[r][i] - mu[i]) / sg[i];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) A[i][j] += z[i] * z[j];
        b[i] += z[i] * ys[r];
      }
    }
    let tr = 0;
    for (let i = 0; i < n; i++) tr += A[i][i];
    for (let i = 0; i < n; i++) A[i][i] += 1e-6 * (tr / n || 1);
    const w = solve(A, b);
    // Back out the impulse response in the plant's own units.
    this.h = new Float64Array(M);
    for (let j = 0; j < M; j++) this.h[j] = w[j] / sg[j];
    this.model = summarise(this.h);
    // The map keeps its own standardisation, so it can be evaluated on its own.
    this.map.setWeights(w.slice(M), mu.slice(M), sg.slice(M));
    this._design();
    this.phase = 'correct'; this.i = 0;
    // THE RING HOLDS THE FUTURE THE CONVOLUTION NEEDS, indexed so that the entry written
    // j samples ago is e^(k + (centre - j) * grid) -- which is exactly the argument tap j
    // of q multiplies. Priming it in the same convention means the very first corrected
    // sample is a whole convolution rather than a partial one.
    this.eRing = new Float64Array(this.q.length);
    const k = this.pk[this.pk.length - 1];
    for (let j = 0; j < this.q.length; j++) {
      this.eRing[(this.q.length - j) % this.q.length] =
        this.map.predict(this.ref, k + (this.qCentre - j) * this.grid, this.grid);
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
    const L = this.q.length;
    this.eHead = (this.eHead + 1) % L;
    this.eRing[this.eHead] = this.map.predict(this.ref, k + this.qCentre * this.grid,
      this.grid);
    let s = 0;
    for (let j = 0; j < L; j++) s += this.q[j] * this.eRing[(this.eHead - j + L) % L];
    this.u = -s;
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
      settledInRecord: this.settledInRecord,
      u: this.u, est: this.est, forecast: this.forecast };
  }
}
