/**
 * @file THE PILOT — route, limit, run, deploy.
 *
 * A controller commissioned by one button. The engineer routes signals and states limits;
 * everything else is measured from the machine:
 *
 *   ROUTE   measured signals in (any number, any meaning — the pilot never learns what
 *           they are), one control output per channel (an offset the host adds to its own
 *           command), one truth signal per channel DURING COMMISSIONING ONLY (a tracker's
 *           error reading), and at runtime a look-ahead into the host's own command.
 *   LIMIT   per channel: a position box and velocity/acceleration/jerk ceilings for the
 *           excitation; a magnitude cap on the correction; guard signals with ceilings
 *           that abort and derate; an optional workspace predicate.
 *   RUN     settle → probe → excite → fit → verify. The probe measures each channel's
 *           u→truth response directly and sets the sample grid, the window reach and the
 *           horizon from the measured settling time. The excitation is filtered noise
 *           verified against every limit on the commanded sequence itself. The fits are
 *           per-lead forecast readouts made consistent with the probe's response by
 *           subtracting its convolution. The verify round puts the finished controller
 *           ON THE MACHINE against doing nothing, interleaved, and picks the effort
 *           weight the same way.
 *   DEPLOY  only if the verify round measured an improvement. Runtime is a warm-started
 *           box-constrained QP over the forecast ladder — fixed iteration count, so the
 *           worst case is the average case, which is what a cyclic task budgets.
 *
 * WHY THE RESPONSE COMES FROM A PROBE AND NOT FROM THE REGRESSION. The dither's effect is
 * visible to the measured signals too (an encoder sees the command move), so a joint fit
 * splits the response between the u-taps and the measured features and the u-taps
 * under-read it — measured on the 2R arm, 0.55 and 0.07 of a true 0.93. Inverting that
 * truncated estimate over-corrects and then fights its own tail: 1.16x with the
 * correction saturated and 105 torque reversals. With the probe's full response and
 * h-consistent readouts the same machine reads 1.6x with fewer reversals than it started
 * with. The regression's u-taps survive only as a cross-check that the dither was routed.
 *
 * WHAT IS NOT BUILT, and the measurement that would change the answer: the readouts are
 * linear windows (the library's universal map is not offered — linear with the right
 * window beat a 544-feature map at a third of the cost twice on this project, but a plant
 * whose truth is strongly nonlinear in the signals would reopen it); channels are treated
 * SISO (cross-coupling is MEASURED by the probe and reported — 0.5% on the arm; a plant
 * where it is large needs the MIMO QP this deliberately does not contain); and the probe
 * response is taken at one pose (a plant whose response varies strongly over the box
 * would show it as a verify ratio that dies away from the probe pose).
 */
import { buildExcitation, buildProgram, peakDiffs, easeSteps, lcg } from './excite.js';
import { boxQP } from '../blackbox/qp.js';

/**
 * THE NONLINEAR BLOCK, IN ONE PLACE (brick 54). Products of a REDUCED base — the most
 * recent lag of each measured signal and the lead-0 command tap pair of each channel —
 * appended in a fixed order. The fit builds its design matrix from `_row` and the
 * runtime rebuilds the same vector inline; the linear part is duplicated between them
 * already, and duplicating a quadratic layout as well is how the two silently disagree.
 */
function polyTerms(nl, row) {
  for (let i = 0; i < nl.length; i++) for (let j = i; j < nl.length; j++) row.push(nl[i] * nl[j]);
}

/**
 * THE SCHEDULING BLOCK — a pose-scheduled dynamic model, which is a different object from
 * the quadratic one and is why the quadratic one was not enough.
 *
 * `polyTerms` multiplies the NEWEST sample by itself, so it can express a static
 * nonlinearity and nothing more. A machine whose COMPLIANCE varies with configuration needs
 * the dynamics themselves to vary: the deflection is C(q).tau(q,qd,qdd), a product of a
 * pose-dependent gain with a pose-dependent LOAD, and no map that is linear in its own
 * inputs — nor one that squares only the newest of them — can represent it.
 *
 * So this multiplies the whole LAGGED block by a scheduling variable. Measured on the 2R
 * arm, trained on five programs and tested on a sixth never seen: memory alone reaches
 * held-out R2 0.771, and scheduling that memory reaches 0.840, while scheduling the
 * COMMANDED torque instead of the applied one is worth nothing at all (0.680 -> 0.661).
 * Pose-scheduling only pays on a signal that carries the machine.
 *
 * THE SCHEDULING VARIABLE IS THE NORMALISED COMMAND, which every plant has by construction:
 * the pilot is told each channel's box, so (p - mid)/half is dimensionless, bounded in
 * [-1, 1], and needs no kinematics, no model and no plant-specific choice.
 */
function schedTerms(sv, ml, row) {
  for (let i = 0; i < sv.length; i++) for (let j = 0; j < ml.length; j++) row.push(sv[i] * ml[j]);
}
/** How many terms `schedTerms` appends. */
const schedCount = (nsv, nml) => nsv * nml;
/**
 * HOW MANY ROWS THE POOLED FIT KEEPS. One shared model over the whole lead bank sees `N` times
 * the rows a per-lead fit did, and a ridge on a few dozen features saturates long before that:
 * the measurement that chose this mode used nine leads and matched a sixty-eight-lead bank.
 * Sized generously — thousands of rows per feature — because the cost of being wrong here is a
 * worse model and the cost of being right slowly is only commissioning time.
 */
const POOL_ROWS = 60000;

/** How deep the scheduled block reaches into the lag window. */
const SCHED_LAGS = 4;
/** How many terms `polyTerms` appends for a reduced base of length n. */
const polyCount = (n) => (n * (n + 1)) / 2;

/**
 * Ridged least squares by normal equations + Cholesky; ridge is scale-relative.
 *
 * OPTIONALLY HANDS BACK THE LEVERAGE, WHICH IS ALREADY PAID FOR. Pass an object as `out` and
 * it receives `out.leverage(x) = x'(X'X + lam I)^-1 x` — the predictive variance of this fit
 * at `x`, up to the noise scale, and the standard measure of how far `x` sits outside the
 * data the fit was made on.
 *
 * IT COSTS ONE TRIANGULAR SOLVE. `A = L L'`, so `x' A^-1 x = ||L^-1 x||^2`: forward-substitute
 * and take the squared norm. The factor `L` is computed here anyway and was being discarded.
 * O(n^2) against the O(n^3) already spent, which is why this is affordable in a PLC scan.
 *
 * WHY IT IS WANTED. The pilot has three open questions that a variance answers and a
 * threshold does not: which leads of the horizon the QP should trust (the held-out weights
 * tried for this measured EXACTLY neutral, 3.40x -> 3.40x, and ship off); when an operating
 * point is far enough outside the commissioning data to decline rather than extrapolate; and
 * when commissioning has learned enough to stop. `lib/ngrc/primitives.js` returns the same
 * quantity from its RLS as `innovVar` and `continuous.js` calls it `confidence`; the pilot
 * fits by batch ridge instead and so has never had it.
 *
 * Callers that do not pass `out` are untouched, and the returned weights are byte-identical.
 */
export function solveRidge(X, y, ridge, colScale = null, out = null) {
  // AN EMPTY DESIGN MATRIX IS A REFUSAL WITH A REASON, NOT A TypeError ON `undefined`.
  // It means the record could not supply a single row for the window and lead being
  // asked for, and the caller can act on that; `X[0].length` on an empty array cannot.
  if (!X.length) throw new Error('pilot: no fit rows — the record is shorter than the '
    + 'window and lead being fitted');
  const n = X[0].length, m = X.length;
  const A = Array.from({ length: n }, () => new Float64Array(n));
  const b = new Float64Array(n);
  for (let r = 0; r < m; r++) {
    const xr = X[r];
    for (let i = 0; i < n; i++) {
      const xi = xr[i];
      b[i] += xi * y[r];
      for (let j = i; j < n; j++) A[i][j] += xi * xr[j];
    }
  }
  let scale = 0;
  for (let i = 0; i < n; i++) scale = Math.max(scale, A[i][i]);
  const lam = ridge * (scale || 1);
  for (let i = 0; i < n; i++) {
    A[i][i] += lam * (colScale ? colScale[i] : 1);
    for (let j = 0; j < i; j++) A[i][j] = A[j][i];
  }
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s2 = A[i][j];
    for (let t = 0; t < j; t++) s2 -= L[i][t] * L[j][t];
    if (i === j) L[i][i] = Math.sqrt(Math.max(s2, 1e-300));
    else L[i][j] = s2 / L[j][j];
  }
  const z = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s2 = b[i];
    for (let t = 0; t < i; t++) s2 -= L[i][t] * z[t];
    z[i] = s2 / L[i][i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s2 = z[i];
    for (let t = i + 1; t < n; t++) s2 -= L[t][i] * w[t];
    w[i] = s2 / L[i][i];
  }
  if (out) {
    // THE POSTERIOR COVARIANCE, WHICH IS THE ONLINE FIT'S PRIOR.
    //
    // `A = X'X + lam I` and `L L' = A`, so `A^-1` is one triangular inverse and one product —
    // O(n^3) against the O(n^3) already spent here, ONCE, at commissioning. It matters because
    // it is exactly the state an online recursion has to start from if it is to continue this
    // fit rather than restart it: RLS seeded with `(theta, A^-1)` and `lambda = 1` produces,
    // row for row, the estimate a batch fit over the whole record would have produced.
    // Without it the recursion has to invent a prior, and the batch ridge is SCALE-RELATIVE —
    // its penalty is a fraction of the largest column energy, a statistic of the whole record
    // that row 1 cannot know — so an invented prior solves a different problem. Measured:
    // 10.9% disagreement in the weights, both fits looking perfectly correct.
    out.covariance = () => {
      // Li = L^-1 by forward substitution, then A^-1 = Li' Li.
      const Li = Array.from({ length: n }, () => new Float64Array(n));
      for (let c = 0; c < n; c++) {
        Li[c][c] = 1 / L[c][c];
        for (let i = c + 1; i < n; i++) {
          let acc = 0;
          for (let t = c; t < i; t++) acc -= L[i][t] * Li[t][c];
          Li[i][c] = acc / L[i][i];
        }
      }
      const P = new Float64Array(n * n);
      for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
          let acc = 0;
          for (let t = j; t < n; t++) acc += Li[t][i] * Li[t][j];
          P[i * n + j] = acc; P[j * n + i] = acc;
        }
      }
      return P;
    };
    out.leverage = (x) => {
      const v = new Float64Array(n);
      let acc = 0;
      for (let i = 0; i < n; i++) {
        let si = x[i];
        for (let t = 0; t < i; t++) si -= L[i][t] * v[t];
        v[i] = si / L[i][i];
        acc += v[i] * v[i];
      }
      return acc;
    };
    out.n = n; out.rows = m;
  }
  return w;
}

function r2(yT, yH) {
  let mu = 0;
  for (const v of yT) mu += v;
  mu /= yT.length;
  let ss = 0, sr = 0;
  for (let i = 0; i < yT.length; i++) { ss += (yT[i] - mu) ** 2; sr += (yT[i] - yH[i]) ** 2; }
  return ss > 0 ? 1 - sr / ss : 0;
}

/** Travel over the last `win` entries of a series — rule 45's quiet instrument. */
/**
 * A BOXCAR, AND EVERY PROBE STATISTIC IS MEASURED THROUGH IT (brick 49).
 *
 * The settle detector, the settling time and the ring counter were all written against
 * deterministic plants, and all three are statistics that noise destroys over a long
 * record. On a barrel with 0.35 K of thermocouple noise they read, respectively: never
 * quiet (so the probe ran to its 60000-step cap), a settling time of 60199 (the LAST
 * 4-sigma excursion in 60000 samples, which is an extreme-value statistic and not a
 * settle at all), and 4224 rings on a plant with no oscillation in it whatsoever.
 *
 * Averaging w samples divides the noise by sqrt(w) and leaves a slow approach alone,
 * which is exactly the asymmetry all three needed. On a noiseless plant it changes
 * nothing measurable, which is what makes it a fix rather than a trade.
 */
function boxcar(arr, w) {
  const n = arr.length, out = new Float64Array(n);
  if (w < 2) { for (let i = 0; i < n; i++) out[i] = arr[i]; return out; }
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += arr[i];
    if (i >= w) acc -= arr[i - w];
    out[i] = acc / Math.min(i + 1, w);
  }
  return out;
}

function travel(arr, win) {
  let t = 0;
  const from = Math.max(1, arr.length - win);
  for (let i = from; i < arr.length; i++) t += Math.abs(arr[i] - arr[i - 1]);
  return t;
}

export class Pilot {
  /**
   * @param {object} o
   * @param {number} o.nMeasured how many measured signals are routed in
   * @param {Array} o.channels per control channel { lo, hi, vMax, aMax, jMax } — the
   *   excitation limits, in the channel's own units per solver step
   * @param {number} o.uMax correction magnitude cap, all channels — RUNTIME authority only
   * @param {number} [o.probeAmp] probe step size; defaults to 0.15·uMax, which is what it
   *   was before it could be set, so changing the runtime cap no longer re-identifies
   * @param {number} [o.ditherAmp] excitation dither amplitude; defaults to 0.1·uMax
   * @param {number[]} o.start commanded position per channel right now
   * @param {Array} [o.guards] { index, max } — abort ceilings on measured signals
   * @param {function|null} [o.workspace] predicate on the commanded position vector
   * @param {number} [o.seed]
   * @param {boolean} [o.gateForecasts] default true; false lets a channel whose forecast
   *   failed held-out validation correct anyway, reporting `wouldGate` instead of
   *   silently zeroing it
   * @param {number|null} [o.sampleFixed] pin the deployment cadence instead of deriving
   *   it from the probe — a Stack pins its upper layers to its first layer's, so one
   *   look-ahead closure means the same thing to all of them
   */
  constructor({ nMeasured, channels, uMax, start, guards = [], workspace = null, seed = 1,
    exciteSteps = null, verifySegLen = null, dwell = false, autoRefuse = false,
    sampleFixed = null, gateForecasts = true, forceChirp = false,
    notchPeriod = null, notchWeight = 0, decisionsPerTs = 30, qpIters = 4, horizonTs = 1.5, forceBasis = null,
    probeAmp = null, ditherAmp = null, cmdAccel = 0, cmdStride = null,
    cmdFine = null }) {
    if (!(channels.length > 0)) throw new Error('pilot: at least one control channel');
    if (!(uMax > 0)) throw new Error('pilot: uMax must be > 0');
    this.nm = nMeasured;
    this.nc = channels.length;
    this.channels = channels;
    this.uMax = uMax;
    // THE IDENTIFICATION AMPLITUDES ARE SEPARATE FROM THE RUNTIME AUTHORITY, and they
    // were not. `uMax` set three unrelated things: how hard the QP MAY correct at
    // runtime, how hard the probe steps, and how hard the excitation dithers. So an
    // engineer widening the correction authority — an operating decision — silently
    // re-identified the plant.
    //
    // MEASURED: doubling `uMax` on the 2R arm moved the identified settling time 2009 →
    // 2048 and the horizon 79 → 70, and the delivered contour got worse on all three
    // shapes. That degradation cannot be attributed to the cap, because the same change
    // re-probed and re-excited the machine; the experiment could not separate them and
    // neither could the caller.
    //
    // Both default to exactly what they were, so every plant on record is unchanged.
    this.probeAmp = probeAmp !== null ? probeAmp : 0.15 * uMax;
    this.ditherAmp = ditherAmp !== null ? ditherAmp : 0.1 * uMax;
    this.guards = guards;
    // OPT-IN GATE (brick 57): false deploys whatever was commissioned and REPORTS what
    // the verify measured; true is the original contract, where a controller the machine
    // has not vouched for is refused. See _finishVerify.
    this.autoRefuse = !!autoRefuse;
    // THE FORECAST GATE IS OPT-OUT, and turning it off is an R&D setting, not a tuning
    // one. `gated` zeroes a channel whose held-out R^2 at lead 0 is under 0.2, and it is
    // the LAST silent refusal in the pilot: nothing is thrown, nothing is blank, that
    // channel simply stops correcting, and on a coupled plant what deploys is a partial
    // correction aimed somewhere the plan never pointed. With this false the gate is
    // still MEASURED and reported as `wouldGate`, and the channel acts anyway — which is
    // how the failure becomes something to look at rather than something to infer.
    this.gateForecasts = gateForecasts !== false;
    /**
     * ASK THE EXCITATION TO GO LOOKING FOR A MODE THE PROBE CANNOT SEE.
     *
     * `true` uses the default band [Tset/2, 2*Tset]; an ARRAY [lo, hi] states the band in
     * solver steps directly. Default false.
     *
     * The sweep is normally gated on the PROBE ringing -- two crossings and 5% overshoot on
     * a step in the reference. That detector is blind to any mode the probe does not
     * excite, and on the 2R arm it is blind to the one that matters: a closed-loop step
     * returns "no usable decay" on both the wind-up and the tip trace, while a CORNER
     * excites the same machine plainly (period 1188 steps, zeta ~0.041, measured off the
     * contour error at half feed). So the gate reads "I saw no ring" as "there is no mode",
     * which is rule 25 -- not measured rendered as exactly zero.
     *
     * AND WHETHER THE OBVIOUS USE OF IT PAYS DEPENDS ENTIRELY ON THE SIGNALS. Measured on
     * that arm, sharp square, contour rms against the pilot's own open loop, with the
     * torque channel carrying the servo's COMMANDED torque:
     *
     *     chirp band        contains 1188?   contour    vs open   bias      osc
     *     none (gated off)  --               2.687e-1    4.20x    -0.1318   0.2342
     *     [1667, 6666]      no, ABOVE it     2.501e-1    4.51x    -0.0878   0.2342
     *     [300, 6666]       yes, wide        2.702e-1    4.18x    -0.1270   0.2385
     *     [600, 2400]       yes, CENTRED     3.591e-1    3.14x    -0.1831   0.3090
     *
     * which reads as "exciting at the mode costs 26%" and was written up that way. IT WAS
     * AN ARTEFACT OF THE SIGNAL SET. The commanded torque is ff(command) + kp*(ref -
     * encoder) + kd*(ref' - encoder'), i.e. a deterministic function of the command and the
     * ENCODER -- and the encoder sits on the motor side of the gearbox, structurally blind
     * to link bending. No channel in that row could represent the resonance, so informing
     * the model about it had nothing to attach to.
     *
     * Swap the torque channel for the gearbox's TRANSMITTED torque, which depends on the
     * link state, and the same band at the same lambda REVERSES:
     *
     *     signal   chirp        bias       osc      contour   vs open
     *     cmd      none         -0.1253    0.2343   2.657e-1   4.25x
     *     tx       none         -0.0053    0.8326   8.326e-1   1.36x
     *     tx       [600, 2400]  -0.0057    0.4043   4.043e-1   2.79x
     *
     * The oscillation HALVES at unchanged bias. Exciting at the natural frequency helps
     * exactly when a channel can carry the answer, which is rule 15 from the other side: a
     * negative result belongs to the instrument it was measured with.
     *
     * NEITHER SETTING WINS OUTRIGHT HERE, and the reason is worth stating. `tx` drives the
     * bias to -0.005, 97.5% of the open loop's, and rings; `cmd` rings less and leaves four
     * times the bias. They cannot be combined, because the corner disturbance and the mode
     * OVERLAP IN FREQUENCY: the sharp square's side is 2052 steps, putting its harmonics at
     * 1026 and 684, and the mode sits at 1188 between the first two. There is no band that
     * separates the thing to correct from the thing to avoid exciting.
     *
     * So the band that pays with the default signal set is the one ABOVE the mode, near the
     * settling time -- which is what the default already computes.
     */
    this.forceChirp = Array.isArray(forceChirp) ? forceChirp.slice() : !!forceChirp;
    /**
     * A NOTCH IN THE EFFORT PENALTY, at a period stated in SOLVER STEPS -- the unit the
     * engineer measures a ring in, not the solver's grid, which is an internal.
     *
     * `lambda` is a scalar on ||D u||^2, so it is a high-pass and it does two jobs with
     * one number. Measured on the 2R arm's sharp square with the transmitted-torque
     * signal: lambda 1x gives bias -0.005 and oscillation 0.833; lambda 60x gives
     * oscillation 0.187 and bias -0.237. The knob that quiets the ring also flattens the
     * droop correction, because the droop varies over a lap and the horizon covers most
     * of one. `notchWeight` penalises only the plan's component AT `notchPeriod`, leaving
     * DC and slow variation free -- see `boxQP`.
     *
     * Both default off, so every plant on record is untouched.
     */
    this.notchPeriod = notchPeriod;
    this.notchWeight = notchWeight;
    /**
     * HOW MANY CONTROL DECISIONS THE PLAN GETS PER SETTLING TIME. Default 30, which is
     * what every plant on record was commissioned with.
     *
     * This is the pilot's CLOCK, and it had been a QP-tractability choice standing in for
     * a hardware one. `sample` and `grid` are each derived from Ts, but their PRODUCT --
     * the decision spacing -- comes out at Ts/30 whichever way they split, so the host's
     * real cycle time never entered the derivation at all. On the 2R arm that is 64 solver
     * steps per decision, and a CORNER'S ACCELERATION EVENT LASTS 40: the pilot cannot
     * resolve the event it most needs to pre-shape, because the event is shorter than one
     * of its ticks.
     *
     * Real hosts are far faster than that relative to their plants -- a 1 ms algorithm
     * against a ~2 s plant has ~2000 decisions per settle, not 30 -- so raising this is
     * closing a modelling gap, not overclocking. The cost is the horizon: N reaches 1.5x
     * Tset, so N grows in proportion and the QP's per-tick cost grows with it (see
     * `PreviewMPC.cost`, which counts rather than estimates).
     */
    this.decisionsPerTs = Math.max(1, +decisionsPerTs || 30);
    /**
     * FIXED QP ITERATIONS PER SOLVE. Default 60, which every plant on record used.
     *
     * The count is fixed rather than convergence-tested precisely so the cycle time is
     * known before it runs (see `boxQP`'s header). It is exposed because it is the lever
     * that PAYS for a finer `decisionsPerTs`: the solve is O(N^2) per tick and N scales
     * with the clock, but the solver is WARM-STARTED -- between decisions the horizon
     * shifts by one -- so 60 may be generous for a plan that barely moved. Trading
     * iterations for clock is a cost-neutral way to buy resolution, IF the answer holds.
     */
    this.qpIters = Math.max(1, +qpIters || 4);
    this.horizonTs = +horizonTs > 0 ? +horizonTs : 1.5;
    // 'sched' | 'poly' | 'linear' | null. See `_fitStep`'s selection rule for why.
    this.forceBasis = forceBasis || null;
    /**
     * THE COMMANDED ACCELERATION, WHICH THE ROW DID NOT CARRY.
     *
     * Each command lag contributes a POSITION and a VELOCITY — the velocity as a
     * one-sample difference — and nothing else. On a compliant machine the correction
     * needed is the wind-up, tau/K, and tau is M(q)*alpha: the model is asked to produce
     * something PROPORTIONAL TO AN ACCELERATION IT IS NEVER SHOWN.
     *
     * AND IT CANNOT RECONSTRUCT IT. The lags are STRIDED — 35 samples, 280 solver steps
     * on the 2R arm — while a corner's acceleration event lasts cornerDt = 40 steps, so
     * one lag spacing is seven times longer than the whole event. A second difference
     * across lags is a heavily smoothed acceleration that misses the corner entirely.
     *
     * Off by default so every plant on record is unchanged; the second difference is
     * taken at ONE-sample spacing, like the velocity term beside it, and scaled by
     * (Ts/sample)^2 so it arrives at the same order as its neighbours.
     */
    // A LAG COUNT, NOT A FLAG, and the difference was measured. Added at all twelve
    // command lags it is 24 extra terms, every one a deterministic function of the
    // command — the exact category a noise control showed to be expensive, because the
    // ridge cannot shrink a collinear regressor without shrinking what it is tangled
    // with. Sharp 4.21x → 2.89x, rounded 6.43x → 4.64x. The information genuinely
    // MISSING is the fine-grained acceleration, which one lag supplies; twelve strided
    // copies of it supply nothing the first did not.
    this.cmdAccel = cmdAccel === true ? 1 : (+cmdAccel || 0);
    /**
     * THE COMMAND WINDOW MAY HAVE ITS OWN STRIDE, and until this it did not — it shared
     * the stride chosen for the MEASURED signals, which is a different question.
     *
     * The measured stride is picked to reach the plant's own memory: 35 samples, 280
     * solver steps on the 2R arm. A COMMAND window at that stride cannot represent
     * anything that varies faster than 280 steps — and a corner's acceleration event
     * lasts 40. For a FLEXIBLE link the tip-to-torque transfer has right-half-plane
     * zeros, so tracking the tip requires PRE-SHAPING the command ahead of the move, and
     * a pre-shape is exactly a fast function of the command near the corner. The model
     * was not failing to learn it; its basis could not express it.
     *
     * Null means "same as the measured stride", which is what every plant on record was
     * fitted with.
     */
    this.cmdStride = cmdStride;
    /**
     * A MIXED COMMAND WINDOW: the coarse lags for REACH, plus a few FINE ones for
     * RESOLUTION, rather than trading one for the other.
     *
     * Measured, and it is why this exists: re-pointing the existing twelve lags at a
     * finer stride is monotonically WORSE — stride 35 → 12 → 4 takes the sharp square
     * 4.25x → 2.75x → 2.17x — because the command window's job turns out to be REACH.
     * The plant settles in 2009 steps and a stride-4 window spans 352, so the model goes
     * blind to most of what the machine is still responding to.
     *
     * But the resolution really is missing: a corner's acceleration lasts 40 steps and
     * the coarse window samples every 280, so no pre-shape faster than 280 steps can be
     * expressed — and tracking the tip of a FLEXIBLE link is a non-minimum-phase
     * inversion that requires exactly such a pre-shape. Both are needed, so both are
     * supplied: `{ lags, stride }` appended to the coarse block.
     *
     * These are NOT the collinear kind of addition that failed before. A lag 32 steps
     * from its neighbour resolves structure that lags 280 apart cannot see at all; that
     * is new information rather than a re-combination of what is there.
     */
    this.cmdFine = cmdFine;
    this.workspace = workspace;
    this.seed = seed;
    // A COMMISSIONING TIME BUDGET IS AN ENGINEERING INPUT and these two are the knobs:
    // both default to being derived from the measured settling time, and shrinking them
    // trades forecast reach for commissioning time — measured on the arm, halving the
    // excitation mostly costs the LONG leads (rule 37: the window must reach the mode).
    this._exciteSteps = exciteSteps;
    this.dwell = dwell;
    this._verifySegLen = verifySegLen;
    this.phase = 'settle';
    this.note = 'settling at the box centre';
    this.k = 0;
    this.verdict = null;
    this.report = { derates: 0 };
    // settle: ease from start to the centre, then wait for quiet.
    this.centre = channels.map((c) => 0.5 * (c.lo + c.hi));
    this._easeFrom = start.slice();
    this._easeN = Math.max(...channels.map((c, i) =>
      easeSteps(this.centre[i] - start[i], c)), 2);
    this._settleTruth = [];
    this._pos = start.slice();
    // filled by the probe:
    this.sample = null;
    this.sampleFixed = sampleFixed || null;
    this.Ts = null;
    this.hs = null;          // per channel: { step: per-sample step response, dc, noise }
    this._probe = null;
    this._probeCh = 0;
    // excite:
    this._exc = null;
    this._rec = null;
    this._excI = 0;
    this._dither = null;
    // fit:
    this._fit = null;
    this.readouts = null;
    // verify / deploy:
    this._ver = null;
    this._run = null;        // live controller state (verify-ON and deploy share it)
    this.lambda = 0;
  }

  // ------------------------------------------------------------------ commissioning
  /**
   * The reference for THIS solver step: [{ pos, vel, acc, u }] per channel. The host
   * commands pos + u and measures truth against POS ALONE.
   *
   * THE SPLIT IS THE CONTRACT, NOT A CONVENIENCE. If the tracker measures error against
   * a reference that already contains the pilot's own injection, every probe step
   * arrives with an instantaneous feed-through of exactly -1 — the response being
   * identified is then (plant - 1) instead of the plant, wrong at the first tap and in
   * shape thereafter. The truth must mean "where the machine is versus where the WORK
   * wanted it", and u is never part of what the work wanted.
   */
  command() {
    const out = [];
    for (let c = 0; c < this.nc; c++) {
      const p0 = this._cmdAt(c, this.k), p1 = this._cmdAt(c, this.k - 1), p2 = this._cmdAt(c, this.k - 2);
      out.push({ pos: p0, vel: p0 - p1, acc: p0 - 2 * p1 + p2, u: this._uAt(c) });
    }
    return out;
  }

  _uAt(c) {
    switch (this.phase) {
      case 'probe':
        return (c === this._probeCh && this._probe && this._probe.stage === 'on')
          ? this._probe.amp : 0;
      case 'excite': return this._dither ? this._dither.u[c] : 0;
      case 'verify': return this._ver.uNow[c];
      default: return 0;
    }
  }

  _cmdAt(c, k) {
    if (k < 0) k = 0;
    switch (this.phase) {
      case 'settle': {
        const t = Math.min(1, k / this._easeN);
        return this._easeFrom[c]
          + (this.centre[c] - this._easeFrom[c]) * 0.5 * (1 - Math.cos(Math.PI * t));
      }
      case 'probe':
        return this.centre[c];
      case 'excite': case 'verify': {
        const st = this.phase === 'excite' ? this._exc : this._ver.exc;
        const i = Math.min(k - st.k0, st.series.total - 1);
        return st.series.pos[c][Math.max(0, i)];
      }
      default:
        // fit and done hold the LAST commanded position — snapping to the centre the
        // instant the excitation ends is a position step into the host's servo gain,
        // which is this project's oldest self-inflicted transient.
        return this._holdPos ? this._holdPos[c] : this.centre[c];
    }
  }

  /**
   * One solver step of routed signals. Truth is required until the verdict; after
   * deployment pass null. Returns nothing — command() and act() are the outputs.
   */
  observe(measured, truth) {
    this.k++;
    // guards, every step, every phase that moves the machine
    if (this.phase === 'excite' || this.phase === 'verify') {
      for (const g of this.guards) {
        if (Math.abs(measured[g.index]) > g.max) { this._guardTrip(g); return; }
      }
    }
    switch (this.phase) {
      case 'settle': this._settleStep(truth); break;
      case 'probe': this._probeStep(truth); break;
      case 'excite': this._exciteStep(measured, truth); break;
      case 'verify': this._verifyStep(measured, truth); break;
      default: this._deployObserve(measured, truth); break;
    }
  }

  _settleStep(truth) {
    if (this.k <= this._easeN) return;
    this._settleTruth.push(truth.reduce((a, v) => a + Math.abs(v), 0));
    const n = this._settleTruth.length;
    if (n < 1200 || n % 200 !== 0) {
      if (n > 60000) this._startProbe('settle timed out at 60000 steps — proceeding');
      return;
    }
    // QUIET IS "IT HAS NOT MOVED": travel over the last window against the largest
    // window travel seen this settle, whose scale the signal itself supplies. A machine
    // the host already settled never shows a transient at all, so a FLAT travel — three
    // consecutive checks within 5% of each other — is quiet too: a floor with no trend
    // is the noise, not motion. Both halves matter (rule 9): the first test alone never
    // fires on a quiet machine, the second alone would call a slow drift quiet.
    const late = travel(this._settleTruth, 1000);
    this._settleScale = Math.max(this._settleScale || 0, late);
    this._flatRun = (this._settlePrev != null
      && Math.abs(late - this._settlePrev) < 0.05 * (this._settlePrev + 1e-300))
      ? (this._flatRun || 0) + 1 : 0;
    this._settlePrev = late;
    if (late < 0.05 * this._settleScale || this._flatRun >= 3 || n > 60000) {
      this._startProbe(null);
    }
  }

  _startProbe(note) {
    this.phase = 'probe';
    this.note = note || 'probing each channel\'s response';
    this._probeCh = 0;
    this._newProbe();
  }

  _newProbe() {
    this._probe = { stage: 'pre', pre: [], resp: [], cross: [], amp: this.probeAmp,
      i: 0 };
  }

  _probeStep(truth) {
    const p = this._probe;
    p.i++;
    if (p.stage === 'pre') {
      p.pre.push(truth[this._probeCh]);
      if (p.pre.length >= 400) { p.stage = 'on'; p.i = 0; }
      return;
    }
    if (p.stage === 'on') {
      p.resp.push(truth[this._probeCh]);
      p.cross.push(truth.map((v, j) => (j === this._probeCh ? 0 : v)));
      // adaptive hold: quiet when the recent travel is a small fraction of the response's
      // own range, with a floor so a slow starter is not called early (rule 45).
      if (p.i >= 600 && p.i % 200 === 0) {
        // MEASURED THROUGH A BOXCAR. Raw total variation is the sum of |differences|, so
        // it grows with the record on ANY noisy signal and never falls below a fraction
        // of the range: measured on a noisy barrel it never terminated at all, and the
        // probe ran to its 60000-step cap on every channel — 70 hours of process time
        // spent proving nothing. Smoothed, the same test asks what it always meant to
        // ask: has the response stopped MOVING, as opposed to stopped jittering.
        const sm = boxcar(p.resp, Math.max(1, Math.round(p.i / 40)));
        const range = Math.max(...sm) - Math.min(...sm);
        const w = Math.max(600, Math.round(0.25 * p.i));
        // AND A PLANT UNDER A PERSISTENT DISTURBANCE NEVER GOES QUIET, so "wait for
        // quiet" cannot be the only way out. A barrel whose ambient drifts a few degrees
        // is still moving after any amount of waiting — correctly, because it IS moving,
        // just not because of the probe — and every channel ran to the absolute cap:
        // 253398 steps, 70 hours of process time, to measure a response that was over in
        // one. The rise is observable long before the environment is, so once the record
        // holds ten of them there is nothing further to learn from holding still.
        let rise = 0;
        const tailFrom = Math.floor(0.75 * sm.length);
        let tail = 0;
        for (let i = tailFrom; i < sm.length; i++) tail += sm[i];
        tail /= Math.max(1, sm.length - tailFrom);
        for (let i = 0; i < sm.length; i++) {
          if (Math.abs(sm[i]) >= 0.9 * Math.abs(tail)) { rise = i; break; }
        }
        const enough = rise > 0 && p.i > 10 * rise;
        if ((travel(sm, w) < 0.04 * (range + 1e-300) && range > 0) || enough || p.i > 60000) {
          p.stage = 'off'; p.hold = p.i; p.i = 0;
        }
      }
      return;
    }
    if (p.i >= Math.min(p.hold, 20000)) this._finishProbe();
  }

  _finishProbe() {
    const p = this._probe;
    const base = p.pre.reduce((a, v) => a + v, 0) / p.pre.length;
    let noise = 0;
    for (const v of p.pre) noise += (v - base) ** 2;
    noise = Math.sqrt(noise / p.pre.length);
    const resp = p.resp.map((v) => (v - base) / p.amp);
    const tail = resp.slice(Math.floor(resp.length * 0.9));
    const dc = tail.reduce((a, v) => a + v, 0) / tail.length;
    // Ts: the SETTLING time — the last time the response leaves a band around its own
    // settled value — and NOT the first crossing of 90% of it, which is what this
    // measured before. On a monotone response the two nearly agree; on an underdamped
    // one the first crossing is the rise on the way INTO the first overshoot, so the
    // machine is called settled while it is still ringing. Measured on the 2R arm: at
    // the stiff default 1924 against a true 2695 (1.4x short), and at the softest
    // gearbox 1476 against 3266 (2.2x) — and the horizon, the sample rate, the grid and
    // the fit stride all derive from this one number, so a short read shortens the plan
    // exactly where the plant needs it longest.
    // THE BAND IS FLOORED ON THE PROBE'S OWN NOISE, because a 2% band tighter than the
    // measurement noise is not a settling criterion, it is a noise detector, and it
    // would report the end of the record on every channel.
    // THE RISE FIRST, because every window below is sized from it. It answers a
    // different question from the settle, and making one number serve both was measured
    // to cost a deploy: the SETTLE says how far ahead a plan must reach, the RISE says
    // how fast the loop has to be sampled. Driving the sample rate from the settle
    // coarsened it 8 → 14 steps at the softest gearbox and the pilot's own verify fell
    // 4.62x → 0.99x — REFUSED. It is read through a light boxcar of its own: a threshold
    // crossing is far more robust than the statistics below, but on a noisy record one
    // spike can still trip it early and everything here is derived from the answer.
    const sm0 = boxcar(resp, Math.max(1, Math.round(resp.length / 400)));
    let Ts = resp.length;
    for (let i = 0; i < sm0.length; i++) {
      if (Math.abs(sm0[i]) >= 0.9 * Math.abs(dc)) { Ts = i; break; }
    }
    // THE SETTLE, THROUGH A BOXCAR, AND THE BAND SHRINKS WITH IT. "The last sample
    // outside a band" is an extreme-value statistic: over 60000 samples a 4-sigma
    // excursion is expected several times, the LAST one lands near the end of the
    // record, and the pilot then built a horizon of 1673 grid points for a plant that
    // settles in 1500. Averaging W samples divides the noise by sqrt(W), so the band may
    // tighten by that factor and still not be a noise detector.
    const W = Math.max(1, Math.round(Ts / 20));
    const sm = boxcar(resp, W);
    const band = Math.max(0.02 * Math.abs(dc), 4 * noise / p.amp / Math.sqrt(W));
    let Tset = 0;
    for (let i = 0; i < sm.length; i++) {
      if (Math.abs(sm[i] - dc) > band) Tset = i;
    }
    if (!(Tset > 0)) Tset = Math.round(0.5 * resp.length);
    // AND IT CANNOT BE MANY TIMES THE RISE. A step response settles within a small
    // multiple of the time it took to get there; a record claiming forty is describing
    // the ENVIRONMENT, not the plant — an unmeasured ambient drift keeps the response
    // moving forever and the last-exit rule keeps finding it. Measured on every plant
    // that settles honestly, the ratio is 1.3 to 2.2, so six binds on nothing real.
    Tset = Math.min(Tset, 6 * Ts);
    const nCross = new Array(this.nc).fill(0);
    if (this.nc > 1) {
      const from = Math.floor(p.cross.length * 0.9);
      for (let i = from; i < p.cross.length; i++) {
        for (let j = 0; j < this.nc; j++) nCross[j] += p.cross[i][j];
      }
      for (let j = 0; j < this.nc; j++) nCross[j] /= (p.cross.length - from) * p.amp;
    }
    this.hs = this.hs || [];
    // DOES THIS PLANT RING? Zero crossings of the response about its own settled value,
    // counted after the rise — a monotone response has none, a lightly damped one has
    // several. It costs nothing to measure and it is what decides whether the excitation
    // should spend limit budget on a frequency sweep (see _startExcite).
    // AND A CROSSING ONLY COUNTS IF SOMETHING CROSSED. Counting sign changes of a raw
    // signal about its own mean counts NOISE — 4224 of them on a barrel with no mode in
    // it — and the pilot would then have spent a quarter of its rate budget sweeping a
    // frequency band that does not exist. A ring is an EXCURSION and back, so the swing
    // since the previous crossing has to clear the band before the next one is a ring.
    // COUNTED INSIDE THE SETTLING WINDOW ONLY, because a ring is part of a step
    // response. Past the settle, what crosses the settled value is whatever else is
    // acting on the machine: on the barrel it was the ambient drift, worth fourteen
    // crossings and a frequency sweep nobody needed.
    let rings = 0, swing = 0;
    for (let i = Math.round(0.5 * Ts); i < Math.min(sm.length - 1, Tset); i++) {
      swing = Math.max(swing, Math.abs(sm[i] - dc));
      if ((sm[i] - dc) * (sm[i + 1] - dc) < 0) {
        // A RING IS ALSO A SIZE, not only a sign change: a mode worth spending a quarter
        // of the rate budget on moves a measurable fraction of the response it rides on.
        if (swing > 3 * band && swing > 0.02 * Math.abs(dc)) rings++;
        swing = 0;
      }
    }
    // AND A MODE OVERSHOOTS. Sign changes alone cannot separate "my step made it ring"
    // from "something else is moving it": an unmeasured ambient drift crosses the
    // settled value repeatedly on a plant whose step response is monotone by
    // construction (a diffusion chain has no complex poles at all), and the barrel duly
    // reported three rings and asked for a frequency sweep it had no use for. A response
    // that rings goes PAST where it is going; a response being pushed around does not.
    let peak = 0;
    for (let i = 0; i < Math.min(sm.length, Tset); i++) peak = Math.max(peak, Math.abs(sm[i]));
    const overshoot = Math.abs(dc) > 0 ? peak / Math.abs(dc) : 1;
    this.hs.push({ resp, dc, noise, Ts, Tset, rings, overshoot, cross: nCross,
      // IDENTIFIABILITY IS ABOUT THE PRECISION OF dc, NOT ABOUT ONE SAMPLE. `dc` is the
      // MEAN of the response's tail, so its standard error is the noise divided by the
      // root of however many samples went into it — comparing it against a single
      // reading's noise is too strict by exactly that factor, and on the barrel it
      // refused a plant whose readouts were fitting at R² 0.85–0.98. A channel really is
      // unidentifiable when the correction does not reach the truth, and averaging is
      // precisely how you tell that apart from a small response seen through a noisy
      // instrument.
      identifiable: Math.abs(dc) * p.amp * Math.sqrt(Math.max(1, tail.length)) > 5 * noise });
    this._probeCh++;
    if (this._probeCh < this.nc) { this._newProbe(); return; }
    // --- every channel probed: derive the grids and start the excitation.
    // THE FLOOR UNDER THE MEASURED RISE IS 8 STEPS, NOT 200 (brick 53). 200 was a
    // placeholder that never bound, because every plant here was slower than it — until
    // a 1 kHz servo axis, whose rise the probe measured correctly at 17 steps and whose
    // cadence was then built for a plant thirteen times slower: grid 7 and fit stride 12
    // for a loop that settles in 45, costing a measured 3.2x (4.79x delivered against
    // 15.55x at the measured rise). The floor exists so the grid and stride arithmetic
    // stays meaningful, which 8 satisfies; whether the NUMBER means anything is what
    // `identifiable` answers, and a probe that saw nothing is refused below regardless.
    const TsMax = Math.max(...this.hs.map((h) => h.Ts), 8);
    this.Ts = Math.round(TsMax / 0.9);          // 90% crossing → full settle estimate
    // The measured SETTLING time, which only the horizon uses (see above).
    this.Tset = Math.max(this.Ts, Math.max(...this.hs.map((h) => h.Tset), 8));
    // THE CADENCE CAN BE PINNED FROM OUTSIDE, and exactly one caller does it: a Stack,
    // pinning every layer above the first to the first's. A host samples its look-ahead
    // at ONE rate, so `act(off)` means one thing; two layers with different `sample`
    // read the same closure at different times and the upper one's horizon is registered
    // wrong (rule 29). Everything else a layer derives — Ts, Tset, grid, N, the lags,
    // the ridge — is still its own, which is where the timescale separation lives.
    this.sample = this.sampleFixed || Math.max(1, Math.round(this.Ts / 240));
    this.grid = Math.max(1, Math.round(this.Ts / this.sample / this.decisionsPerTs));
    // THE HORIZON REACHES 1.5x THE SETTLING TIME, NOT 1.0x, and the difference is not a
    // margin — it is delivery slack. An error component first enters the plan exactly one
    // horizon ahead, and the plant needs the full settle to deliver a correction, so a
    // horizon equal to the settle means every correction systematically arrives
    // ~90% delivered. Measured with a perfect forecast on the circle: 7.9e-3 at 1.0x Ts,
    // 5.1e-3 at 1.5x, flat at 2.0x. (The receding machinery itself is not the limit: the
    // same QP against an exactly known linear plant leaves 2.7e-6.)
    // AND 1.5 IS A CONSTANT NOBODY HAS SCORED ON A MACHINE, which is why it is a knob now.
    // The paragraph above measures it against a PERFECT forecast; against a real one, more
    // horizon is not free — the QP inverts the forecast, so extra leads add the forecast's
    // own error to the plan. Measured on EMPS from one commissioned model, at one QP
    // iteration: N=56 delivers 14.16x and the commissioned N=68 delivers 10.62x, and the same
    // ordering holds on a two-tone sine the model never saw (8.66x against 7.36x). On the arm
    // N=44 of 58 is within 0.4% of the full horizon. Both point at ~1.2 rather than 1.5.
    // DEFAULT UNCHANGED until the six-plant pass of `docs/plan.md` step 8 has run: the
    // horizon and `qpIters` are NOT separable — cutting iterations alone regresses EMPS from
    // 12.70x to 10.35x — so they have to move together or not at all.
    this.N = Math.max(8, Math.ceil(this.horizonTs * this.Tset / this.sample / this.grid));
    // per-sample step response and the ZOH grid response for the QP
    for (const h of this.hs) {
      const s = [];
      for (let i = 0; i * this.sample < h.resp.length; i++) s.push(h.resp[i * this.sample]);
      // pad flat to the horizon: past its own settle the response holds its DC.
      while (s.length <= (this.N + 1) * this.grid) s.push(h.dc);
      h.step = s;
      const hp = new Float64Array(s.length - 1);
      for (let i = 0; i < hp.length; i++) hp[i] = s[i + 1] - s[i];
      h.hSample = hp;
      // THE GRID RESPONSE IS TO THE INTERPOLATION'S OWN BASIS, NOT TO A HELD STEP. The
      // runtime applies u linearly interpolated between ticks, so a decision u_j reaches
      // the plant as a TRIANGLE spanning two grid intervals — and a QP whose T uses the
      // zero-order-hold differences is planning against a command the runtime never
      // sends, with a built-in half-grid timing bias. Measured before this fix: the QP
      // predicted a residual of 2.8e-3 and the machine delivered 6.1e-3 — 2.16x, with a
      // forecast already accurate enough to account for almost none of it. The triangle
      // response is computed numerically from the probe's own per-sample response, so
      // the two can never disagree about the plant.
      const g = this.grid;
      const tri = new Float64Array(2 * g);
      for (let i = 0; i < g; i++) { tri[i] = (i + 1) / g; tri[g + i] = 1 - (i + 1) / g; }
      const hg = new Float64Array(this.N);
      for (let m = 0; m < this.N; m++) {
        // Response at lag m grid-ticks from the basis's own start: a decision made NOW
        // starts rising NOW, so its effect m ticks later is the response at m·g — and
        // h[0] is exactly zero, because a correction that has not risen yet has not
        // arrived. The first registration used (m+1)·g, crediting every decision with a
        // full grid of delivery it had not made; the attribution instrument had the
        // machine at 1.80x the plan's own prediction with it, 2.16x with the ZOH.
        const t = m * g;
        let acc = 0;
        for (let i = 0; i < 2 * g; i++) {
          const lag = t - 1 - i;
          if (lag >= 0 && lag < hp.length) acc += tri[i] * hp[lag];
        }
        hg[m] = acc;
      }
      h.hGrid = hg;
    }
    this._startExcite();
  }

  _startExcite() {
    const dwellOpt = this.dwell;
    const from = this._lastCmd();          // read under the OLD phase, before it changes
    this.phase = 'excite';
    this.note = 'exciting — filtered noise across the box, dither on the correction';
    const steps = this._exciteSteps || Math.max(12000, Math.round(18 * this.Ts));
    let series;
    try {
      series = buildExcitation({ channels: this.channels, steps,
        start: from, workspace: this.workspace,
        // THE BAND COMES FROM THE MEASURED SETTLING TIME AND NOTHING ELSE — a mode that
        // takes Tset to decay has its period near Tset — and it is ONE OCTAVE EACH WAY,
        // not the three the first version swept. Amplitude is bounded by the rate limits
        // at the FASTEST frequency in the sweep and acceleration goes as A*w^2, so
        // reaching down to Tset/8 costs a factor of 16 in what the sweep may be worth:
        // measured, that version raised in-band energy by 2% and moved nothing. Half to
        // twice Tset brackets the mode and buys back an order of magnitude of amplitude.
        // AND ONLY IF THE PLANT RINGS. The sweep is not free — it takes a quarter of the
        // rate budget the broadband noise would otherwise spend, and on a machine with
        // no lightly damped mode that trade is a pure loss: measured on the stiff
        // default, an unconditional sweep cost 7% (rounded 2.161e-2 → 2.318e-2) while
        // buying 25% at the softest gearbox (2.46e-1 → 1.97e-1, verify 3.71x → 5.97x).
        // The probe already says which machine it is, so the pilot decides rather than
        // the engineer: two or more zero crossings about the settled value is a mode.
        // DWELL, i.e. does the excitation ever HOLD STILL. Measured null-to-negative on
        // the arm (whose programs never stop) and therefore left off — and then the tank
        // process, whose recipe holds a level between ramps, exposed what that null was
        // worth: see the experiment in test/pilot/tanks.test.mjs.
        dwell: !!dwellOpt,
        chirpBand: Array.isArray(this.forceChirp) ? this.forceChirp
          : ((this.forceChirp
            || this.hs.some((h) => h.rings >= 2 && h.overshoot > 1.05))
            ? [Math.max(8, this.Tset / 2), 2 * this.Tset] : null),
        seed: this.seed + 13 * this.report.derates });
    } catch (e) {
      // AN INFEASIBLE EXCITATION IS A REFUSAL, NOT A CRASH: the builder's message names
      // what to change, and a pilot that dies mid-commissioning leaves the host holding
      // a machine with no verdict and no explanation.
      this.phase = 'done';
      this.verdict = { deploy: false, why: e.message };
      return;
    }
    this._exc = { series, k0: this.k, steps: series.total };
    this._rec = { x: [], cmd: [], u: [], e: [] };
    this._excI = 0;
    this._dither = { u: new Array(this.nc).fill(0),
      hold: 2 * this.grid * this.sample, rnd: lcg(this.seed + 977) };
    this.report.excite = series.meta;
  }

  _lastCmd() {
    const out = [];
    for (let c = 0; c < this.nc; c++) out.push(this._cmdAt(c, this.k));
    return out;
  }

  _exciteStep(measured, truth) {
    const i = this.k - this._exc.k0;
    if (i % this._dither.hold === 0) {
      for (let c = 0; c < this.nc; c++) {
        this._dither.u[c] = (2 * this._dither.rnd() - 1) * this.ditherAmp * (this._uScale || 1);
      }
    }
    if (i % this.sample === 0) {
      this._rec.x.push(measured.slice());
      this._rec.cmd.push(Array.from({ length: this.nc }, (_, c) =>
        this._exc.series.pos[c][Math.min(i, this._exc.steps - 1)]));
      this._rec.u.push(this._dither.u.slice());
      this._rec.e.push(truth.slice());
    }
    if (i >= this._exc.steps - 1) {
      this._holdPos = this._lastCmd();
      this.phase = 'fit';
      this.note = 'fitting the forecast ladder — call work() until the phase changes';
      this._planFits();
    }
  }

  _guardTrip(g) {
    this.report.derates++;
    if (this.report.derates > 2) {
      this.phase = 'done';
      this.verdict = { deploy: false,
        why: `guard on measured[${g.index}] tripped three times — the limits and the `
          + 'machine disagree, and the pilot will not learn from a machine in distress' };
      return;
    }
    // THE DITHER DERATES TOO, and the first version of this path proved why by failing:
    // the guard was tripping on the DITHER's own velocity spikes — a square injection
    // jerks the servo — and derating the trajectory alone left exactly that untouched,
    // so three retries changed nothing and the pilot refused a machine that was fine.
    // AND THE BOX DERATES WITH THEM (brick 53). Slowing the machine down while still
    // demanding it traverse the same span in the same duration is not a derate, it is a
    // contradiction — and the builder says so: `these rate limits cannot traverse the
    // position box inside N steps`. It stayed hidden while the cadence floor kept the
    // dither slow enough to trip the guard only once; the moment the pilot ran at a real
    // machine's rise the second trip arrived and commissioning refused itself. Shrinking
    // the span by the same factor keeps the traversal feasible AND reduces the excursion
    // that tripped the guard, which is the more relevant response of the two.
    for (const c of this.channels) {
      c.vMax *= 0.7; c.aMax *= 0.7;
      const ctr = 0.5 * (c.lo + c.hi);
      c.lo = ctr + (c.lo - ctr) * 0.7;
      c.hi = ctr + (c.hi - ctr) * 0.7;
    }
    this._uScale = 0.7 ** this.report.derates;
    this.note = `guard tripped — derated to ${(0.7 ** this.report.derates * 100).toFixed(0)}% and restarting`;
    this._startExcite();
  }

  // ------------------------------------------------------------------------- fitting
  _planFits() {
    const s0 = Math.max(2, Math.round(this.Ts / this.sample / 11));
    const combos = [];
    for (const stride of [Math.max(2, Math.round(0.6 * s0)), s0, Math.round(1.5 * s0)]) {
      for (const ridge of [1e-9, 1e-7, 1e-5]) combos.push({ stride, ridge });
    }
    this._fit = { s0, combos, stage: 'tune', ci: 0, ch: 0, scores: [],
      wcands: [12, 24, 40],
      leads: Array.from({ length: this.N }, (_, i) => i * this.grid),
      chosen: [], ladder: [], li: 0 };
    // h-consistent targets: subtract the probe response's convolution with the dither.
    this._fit.eFree = [];
    for (let c = 0; c < this.nc; c++) {
      const h = this.hs[c].hSample;
      const u = this._rec.u.map((v) => v[c]);
      const e = this._rec.e.map((v) => v[c]);
      const out = new Float64Array(e.length);
      for (let k = 0; k < e.length; k++) {
        let s2 = 0;
        const top = Math.min(h.length, k + 1);
        for (let t = 0; t < top; t++) s2 += h[t] * u[k - t];
        out[k] = e[k] - s2;
      }
      // AND IT IS CHECKED AGAINST THE THING IT IS SUPPOSED TO CLEAN UP (brick 56).
      // Subtracting the dither's own response is right when the probe response is right.
      // When it is not, the subtraction ADDS more than it removes and the fit is handed a
      // target noisier than the truth. Measured on the cold mill — whose probe reports
      // Ts 0, dc 1.07 and a -1.27 inverse-response undershoot, all artefacts of a 200 ms
      // gauge delay — eFree's rms is 4.16x the truth's, and the same design matrix scores
      // held-out R2 0.05 against it and 0.73 against the raw truth. On every other plant
      // here the ratio is 0.96 to 1.08, so this fires on exactly one of six.
      let se = 0, so = 0;
      for (let k = 0; k < e.length; k++) { se += e[k] * e[k]; so += out[k] * out[k]; }
      const infl = Math.sqrt(so / Math.max(se, 1e-300));
      this.report.hConsistent = this.report.hConsistent || [];
      if (infl > 1.25) {
        this.report.hConsistent.push({ ch: c, inflation: infl, used: 'raw truth' });
        this._fit.eFree.push(Float64Array.from(e));
      } else {
        this.report.hConsistent.push({ ch: c, inflation: infl, used: 'h-consistent' });
        this._fit.eFree.push(out);
      }
    }
  }

  /**
   * Held-out validation on BLOCKS SPREAD THROUGH THE RECORD, then a refit on everything.
   *
   * The first version held out the last 25% and its metric collapsed while the
   * controller worked: R² 0.37 on a channel the verify round scored 15x, because the
   * tail happened to land on a quiet stretch and R² is measured against the tail's OWN
   * variance — a support mismatch (rule 19), not a bad model. Two blocks at 3/8 and 6/8
   * of the record keep temporal separation and give the score the record's whole
   * repertoire; the weights returned are refitted on ALL rows, because a validation
   * split is an instrument, not a reason to deploy three-quarters of a model.
   */
  _blockSplit(X, y, ridge, colScale = null) {
    const m = X.length, b = Math.floor(m / 8);
    const isVal = (i) => (i >= 3 * b && i < 4 * b) || (i >= 6 * b && i < 7 * b);
    const Xt = [], yt = [], Xv = [], yv = [];
    for (let i = 0; i < m; i++) {
      if (isVal(i)) { Xv.push(X[i]); yv.push(y[i]); }
      else { Xt.push(X[i]); yt.push(y[i]); }
    }
    const w0 = solveRidge(Xt, yt, ridge, colScale);
    const p = (r) => { let s2 = 0; for (let i = 0; i < r.length; i++) s2 += r[i] * w0[i]; return s2; };
    const score = r2(yv, Xv.map(p));
    // THE LEVERAGE OF THE HELD-OUT ROWS, which costs one triangular solve each against a
    // factorisation already computed. It separates two failures this project has been
    // treating as one. A lead whose R2 is bad AND whose held-out leverage is high is
    // EXTRAPOLATING — the excitation never covered those rows, which is an excitation
    // problem and cheap to fix. A lead whose R2 is bad with leverage no worse than the near
    // leads is a SPANNING failure — the features cannot represent the target, which is a
    // dictionary problem and expensive. `r2Far` at -0.035 has never been asked which it is.
    const lev = {};
    const w = solveRidge(X, y, ridge, colScale, lev);
    let lsum = 0, lmax = 0;
    for (const r of Xv) { const L = lev.leverage(r); lsum += L; if (L > lmax) lmax = L; }
    return { r2: score, w,
      lev: { mean: lsum / Math.max(1, Xv.length), max: lmax, n: lev.n, rows: lev.rows } };
  }

  // THE WINDOW LENGTH IS TUNED, NOT ASSUMED (brick 56). These were the constant 12 from
  // the first version and the tune never searched them, so every plant here was fitted on
  // a twelve-tap window whether or not that was the right one. Measured on the EMPS servo
  // axis, 40 taps beat 12 at EVERY lead — held-out residual variance 0.498 of the twelve's
  // at lead 0 and 0.642 at the far lead — which is about 1.4x on the delivered error, for
  // a constant nobody had questioned. The default stays 12 for anything asking before the
  // tune has run.
  _mLag(c) { const r = this._lagOf(c); return r ? r.mLag : 12; }
  _fLag(c) { const r = this._lagOf(c); return r ? r.fLag : 12; }
  _lagOf(c) {
    if (c === undefined) return null;
    if (this.readouts && this.readouts[c]) return this.readouts[c];
    if (this._fit && this._fit.chosen && this._fit.chosen[c]) return this._fit.chosen[c];
    return null;
  }
  /** The longest window any channel asked for — what the runtime ring has to hold. */
  _maxLag() {
    return this.readouts ? Math.max(...this.readouts.map((r) => r.mLag || 12)) : 12;
  }

  _row(c, k, L, stride, poly = false, ML = null, FL = null, sched = false) {
    const mL = ML || this._mLag(c), fL = FL || this._fLag(c);
    const row = [1];
    const nl = [];
    // THE LAGGED MEASURED BLOCK, KEPT, because the scheduling block multiplies all of it —
    // that is what makes it a pose-scheduled DYNAMIC model rather than a static
    // nonlinearity on the newest sample.
    // ONLY THE RECENT LAGS ARE SCHEDULED. Tensoring the WHOLE lagged block cost 6 channels
    // x 12 lags x 2 schedulers = 144 extra columns, all ridged a hundred times harder, and
    // measured WORSE than linear on both arm channels (0.960 against 0.976, and 0.576
    // against 0.699) — variance, not signal. The modulation a configuration-dependent
    // stiffness produces acts on the RECENT response, so the depth is capped and the column
    // count falls by three.
    const sD = Math.min(mL, SCHED_LAGS);
    const ml = sched ? [] : null;
    const sp = sched ? [] : null;
    const rec = this._rec;
    for (let ch = 0; ch < this.nm; ch++) {
      for (let l = 0; l < mL; l++) {
        const v = rec.x[k - l * stride][ch];
        row.push(v);
        if (l === 0) nl.push(v);
        if (ml && l < sD) ml.push(v);
      }
    }
    for (let ch = 0; ch < this.nc; ch++) {
      const cs = this.cmdStride || stride;
      for (let l = 0; l < fL; l++) {
        const idx = Math.min(k + L - l * cs, rec.cmd.length - 1);
        const p0 = rec.cmd[Math.max(0, idx)][ch];
        const p1 = rec.cmd[Math.max(0, idx - 1)][ch];
        const v = (p0 - p1) * (this.Ts / this.sample);
        row.push(p0, v);
        if (l === 0) nl.push(p0, v);
        if (sp && l === 0) sp.push(p0);
        if (l < this.cmdAccel) {
          const p2 = rec.cmd[Math.max(0, idx - 2)][ch];
          const a = (p0 - 2 * p1 + p2) * (this.Ts / this.sample) ** 2;
          row.push(a);
          if (l === 0) nl.push(a);
        }
      }
      if (this.cmdFine) {
        // RELATIVE TO THE NEWEST COARSE LAG, so the fine block carries the SHAPE near
        // the lead rather than repeating its level — a difference, not a duplicate, and
        // that is what keeps it out of the coarse block's span.
        const base = rec.cmd[Math.max(0, Math.min(k + L, rec.cmd.length - 1))][ch];
        for (let l = 1; l <= this.cmdFine.lags; l++) {
          const fi = Math.min(k + L - l * this.cmdFine.stride, rec.cmd.length - 1);
          // AS A LOCAL VELOCITY, not a raw difference, and the scaling is not cosmetic.
          // A raw 4-step difference is ~8e-4 against the velocity term's ~5e-2 beside it
          // — 63x smaller. A ridge penalises COEFFICIENT magnitude, so a small-variance
          // regressor needs a large coefficient and is shrunk hardest: the first version
          // of this block was ridged into irrelevance and measured EXACTLY the baseline,
          // 4.25x and 12.94x, free but unused. Dividing by the window length puts every
          // fine term at the same order as the velocity it refines.
          row.push((rec.cmd[Math.max(0, fi)][ch] - base)
            * (this.Ts / this.sample) / (l * this.cmdFine.stride));
        }
      }
    }
    // BOTH RICH BLOCKS SIT BEYOND `nBase`, so both are ridged a hundred times harder by
    // `_colScale` and both have to earn their weights. The order is base, then poly, then
    // sched, and the runtime row in `_controlTick` appends them in exactly the same order.
    row.nBase = row.length;
    if (poly) polyTerms(nl, row);
    if (sched) schedTerms(this._schedVec(sp), ml, row);
    return row;
  }

  /**
   * The scheduling variables: each channel's commanded position at the lead, normalised to
   * its own box. Dimensionless and bounded, so one ridge is meaningful across channels.
   */
  _schedVec(pos) {
    const out = [];
    for (let c = 0; c < this.nc; c++) {
      const ch = this.channels[c];
      const mid = (ch.lo + ch.hi) / 2;
      const half = Math.max(1e-12, (ch.hi - ch.lo) / 2);
      out.push((pos[c] - mid) / half);
    }
    return out;
  }

  /**
   * THE STRUCTURED PRIOR, the AFM's shape: the nonlinear block is ridged a hundred times
   * harder than the linear one, so it has to EARN its weights rather than merely be
   * available. Without it the choice would be a global decision about the library; with
   * it the block shrinks to nothing on a plant that is linear in its signals and survives
   * on one that is not, which is what the measurement across six plants says is needed.
   */
  _colScale(row0) {
    const nB = row0.nBase;
    // MEASURABLE, NOT ASSUMED. The charge that a rich block "rejects by design" under a
    // hundredfold prior is a fair one to level and a cheap one to test, so the prior is
    // readable rather than baked in. Measured on the arm: dropping it to 10 and then to 1
    // makes the SCHEDULED block score WORSE held-out, not better — 0.97043 -> 0.96215 ->
    // 0.95066 on one channel and 0.58680 -> 0.48061 -> 0.43306 on the other — because the
    // prior was shrinking its many noisy columns and without it the block overfits harder.
    // The default is unchanged, so every plant on record is untouched.
    // GUARDED, BECAUSE `process` IS A NODE GLOBAL AND THIS FILE SHIPS TO A BROWSER. Bare,
    // it threw `process is not defined` on the FIRST fit of every browser commission — so ⑤
    // died the instant it stopped exciting and started solving, and ⑨'s pilot rung with it.
    // The frame loop's catch turned that into a badge nobody was reading, the suite waited
    // out its 900s and reported a timeout naming nothing, and the knob itself is used by one
    // Node measurement. An env read is not a free thing to add to library code.
    const env = typeof process !== 'undefined' && process.env ? process.env : {};
    const pen = +(env.PILOT_RICH_PENALTY || 100);
    return row0.map((_, i) => (i < nB ? 1 : pen));
  }

  _buildXY(c, L, stride, sub = 1, poly = false, ML = null, FL = null, sched = false) {
    const mL = ML || this._mLag(c), fL = FL || this._fLag(c);
    const back = Math.max((mL - 1) * stride, (fL - 1) * stride - L);
    const k1 = this._rec.e.length - L - 1;
    const X = [], y = [];
    for (let k = back; k < k1; k += sub) {
      X.push(this._row(c, k, L, stride, poly, mL, fL, sched));
      y.push(this._fit.eFree[c][k + L]);
    }
    return { X, y };
  }

  /** One slice of fitting work. Call until the phase changes. @returns {number} 0..1 */
  work() {
    if (this.phase !== 'fit') return 1;
    const F = this._fit;
    if (F.stage === 'tune') {
      const combo = F.combos[F.ci];
      const leads = [0, F.leads[Math.floor(this.N / 2)], F.leads[this.N - 1]];
      let acc = 0;
      let accP = 0;
      let accS = 0;
      for (const L of leads) {
        const { X, y } = this._buildXY(F.ch, L, combo.stride, 2);
        acc += this._blockSplit(X, y, combo.ridge).r2;
        const XY = this._buildXY(F.ch, L, combo.stride, 2, true);
        accP += this._blockSplit(XY.X, XY.y, combo.ridge, this._colScale(XY.X[0])).r2;
        // THE THIRD CANDIDATE, offered on every plant and taken only where it earns its
        // place. It costs a third of the tune stage and nothing at all on a plant that
        // declines it, because a basis that loses leaves the chosen model unchanged.
        const XS = this._buildXY(F.ch, L, combo.stride, 2, false, null, null, true);
        accS += this._blockSplit(XS.X, XS.y, combo.ridge, this._colScale(XS.X[0])).r2;
      }
      F.scores.push({ ...combo, ch: F.ch, r2: acc / leads.length, poly: false, sched: false });
      F.scores.push({ ...combo, ch: F.ch, r2: accP / leads.length, poly: true, sched: false });
      F.scores.push({ ...combo, ch: F.ch, r2: accS / leads.length, poly: false, sched: true });
      F.ci++;
      if (F.ci >= F.combos.length) {
        // rule 42: within 5% of the best MEASURED score, take the smoothest (largest ridge).
        const mine = F.scores.filter((s2) => s2.ch === F.ch);
        const best = Math.max(...mine.map((s2) => s2.r2));
        const near = mine.filter((s2) => s2.r2 >= best - 0.05 * Math.abs(best));
        near.sort((a, b) => b.ridge - a.ridge || a.stride - b.stride);
        // THE BASIS IS CHOSEN ON THE RESIDUAL, NOT ON R2, and the difference decides it.
        // On the tank the quadratic block reads 0.9818 against 0.9661 — inside any 5%
        // band on R2, so an R2 tie-break would discard it — while the UNEXPLAINED
        // variance it leaves is 0.0182 against 0.0339, i.e. nearly HALVED. A forecast the
        // QP inverts is worth what its residual is worth, so that is what is compared,
        // with the same 5% band and the LINEAR basis winning inside it because it is the
        // cheaper one to evaluate every sample.
        const bestLin = Math.max(...mine.filter((s2) => !s2.poly && !s2.sched).map((s2) => s2.r2));
        const bestPoly = Math.max(...mine.filter((s2) => s2.poly).map((s2) => s2.r2));
        const bestSched = Math.max(...mine.filter((s2) => s2.sched).map((s2) => s2.r2));
        // EACH RICHER BASIS MUST BEAT THE LINEAR ONE'S RESIDUAL BY THE SAME 5%, and between
        // two that both qualify the smaller residual wins. A richer basis that merely ties
        // loses, because it is the more expensive one to evaluate every sample and the QP
        // has to invert it.
        const beats = (r2) => (1 - r2) < 0.95 * (1 - bestLin);
        let useP = false, useS = false;
        if (beats(bestPoly) || beats(bestSched)) {
          if (!beats(bestSched)) useP = true;
          else if (!beats(bestPoly)) useS = true;
          else if (bestSched >= bestPoly) useS = true; else useP = true;
        }
        // AN OVERRIDE, BECAUSE THIS CHOICE IS MADE ON FIT AND THE RECORD SAYS FIT RANKS THESE
        // BACKWARDS ON THE MACHINE. On both plants where probe designs were compared, the
        // best-FITTING candidate was the worst CONTROLLER. That is tolerable while the rich
        // blocks are a refinement; it is not tolerable now that the pose-scheduled block is
        // the leading candidate to replace a retired lap-periodic rung, because the arm's
        // model-only stack — the configuration that survives the retirement — DECLINES it
        // (`lin,quad` then `quad,quad`) while the same stack over a conventional rung takes
        // it on both channels. Whether that refusal is right is a machine question, and
        // until it is asked on a machine there is no way to ask it at all.
        // Default null: every plant on record is untouched.
        if (this.forceBasis === 'sched') { useS = true; useP = false; }
        else if (this.forceBasis === 'poly') { useP = true; useS = false; }
        else if (this.forceBasis === 'linear') { useP = false; useS = false; }
        const pick = mine.filter((s2) => !!s2.poly === useP && !!s2.sched === useS);
        const bestP = Math.max(...pick.map((s2) => s2.r2));
        const nearP = pick.filter((s2) => s2.r2 >= bestP - 0.05 * Math.abs(bestP));
        nearP.sort((a, b) => b.ridge - a.ridge || a.stride - b.stride);
        F.chosen.push({ stride: nearP[0].stride, ridge: nearP[0].ridge, r2: nearP[0].r2,
          poly: useP, sched: useS, linR2: bestLin, polyR2: bestPoly, schedR2: bestSched,
          mLag: 12, fLag: 12 });
        F.ci = 0; F.ch++;
        if (F.ch >= this.nc) { F.stage = 'window'; F.ch = 0; F.wi = 0; F.wscores = []; }
      }
      return 0.3 * (F.ch * F.combos.length + F.ci) / (this.nc * F.combos.length);
    }
    // THE WINDOW LENGTH, REFINED AFTER THE CADENCE (brick 56). It is a second stage
    // rather than another axis of the grid because it only means anything once the stride
    // is settled — and because a full product would triple a tune that already dominates
    // commissioning on the slow plants. The band favours the SHORTER window inside 5% of
    // the best residual, for the same reason the basis choice favours linear: it is the
    // cheaper one to evaluate every sample.
    if (F.stage === 'window') {
      const c = F.ch, cand = F.wcands[F.wi], ch = F.chosen[c];
      const leads = [0, F.leads[Math.floor(this.N / 2)], F.leads[this.N - 1]];
      // THE RIDGE IS NOT RE-SEARCHED HERE, AND THAT COST A DEPLOY TO LEARN. A joint
      // window/ridge search is the statistically obvious thing and it moves the ridge:
      // on the EMPS axis to a looser one that fits better held-out (0.99305 against
      // 0.98931) and controls WORSE (12.7x down to 10.2x), and on the 2R arm's learned-IK
      // configuration far enough that the verify's scribble regime fell to 0.89x and the
      // pilot REFUSED a machine it had been improving 5x. The QP inverts this model, so
      // the ridge is an inversion parameter and it belongs to the cadence tune that is
      // scored the same way. Only the WINDOW moves here.
      // A CANDIDATE THE RECORD CANNOT SUPPORT IS SKIPPED, NOT CRASHED INTO. A window of
      // `cand` taps at this stride reaches (cand-1)*stride samples back, and the row also
      // needs `L` samples of future, so a short record can leave ZERO rows — at which
      // point the fit is asking a question the data cannot answer. Found by setting
      // `exciteSteps` to 12000, which is the DEFAULT FLOOR of `max(12000, 18*Ts)` and
      // therefore a value the knob openly advertises: 1500 samples against a 40-tap
      // window at stride 35 plus a 624-sample far lead, i.e. 1989 needed. It died on
      // `X[0].length` of an empty array, inside a documented knob, with a message naming
      // neither the window nor the record.
      let acc = 0, usable = true;
      for (const L of leads) {
        const { X, y } = this._buildXY(c, L, ch.stride, 2, ch.poly, cand, cand, ch.sched);
        if (!X.length) { usable = false; break; }
        acc += this._blockSplit(X, y, ch.ridge,
          (ch.poly || ch.sched) ? this._colScale(X[0]) : null).r2;
      }
      if (usable) F.wscores.push({ ch: c, lag: cand, ridge: ch.ridge, r2: acc / leads.length });
      else this.report.windowSkipped = (this.report.windowSkipped || []).concat(
        { ch: c, lag: cand, stride: ch.stride, why: 'record too short for this window' });
      F.wi++;
      if (F.wi >= F.wcands.length) {
        const mine = F.wscores.filter((w) => w.ch === c);
        // EVERY CANDIDATE SKIPPED means the record cannot support even the shortest
        // window; the tune's default stands rather than the stage inventing one.
        if (!mine.length) { F.wi = 0; F.ch++; if (F.ch >= this.nc) this._finishFits(); return 1; }
        // SELECTED BY RULE 42, NOT BY THE RESIDUAL BAND, and the difference is measured.
        // The basis choice (brick 54) compares residuals because a forecast is worth what
        // its residual is worth. The RIDGE is not that kind of parameter: the QP INVERTS
        // this model, and a loosely-fitted one has larger weights whose inversion
        // amplifies. Selecting the ridge on a tight residual band picked 1e-9 over 1e-7 on
        // the EMPS axis — a better held-out fit (0.99305 against 0.98931) and a WORSE
        // machine, 12.7x down to 10.2x. Regularisation here serves the inversion.
        const best = Math.max(...mine.map((w) => w.r2));
        const near = mine.filter((w) => w.r2 >= best - 0.05 * Math.abs(best));
        near.sort((a, b) => a.lag - b.lag);
        ch.mLag = near[0].lag; ch.fLag = near[0].lag; ch.r2 = near[0].r2;
        ch.lagScores = mine.map((w) => ({ lag: w.lag, ridge: w.ridge, r2: +w.r2.toFixed(5) }));
        F.wi = 0; F.ch++;
        if (F.ch >= this.nc) { F.stage = 'ladder'; F.ch = 0; F.li = 0; }
      }
      return 0.3 + 0.1 * (F.ch * F.wcands.length + F.wi) / (this.nc * F.wcands.length);
    }
    // ladder: the readout bank with the chosen windows.
    const c = F.ch, L = F.leads[F.li], chosen = F.chosen[c];
    const { X, y } = this._buildXY(c, L, chosen.stride, 1, chosen.poly, chosen.mLag,
      chosen.fLag, chosen.sched);
    // ONE MODEL FOR EVERY LEAD, OPTIONALLY — the whole forecast bank collapsed to a single
    // weight vector fitted on every lead's rows stacked together.
    //
    // IT IS WELL-POSED RATHER THAN APPROXIMATE. A lead is the same function of (state now,
    // command then) evaluated at a different `then`, so the rows already differ by lead in
    // exactly the way one shared map requires; stacking them is more data for one estimator,
    // not an averaging of several.
    //
    // WHAT IT BUYS, on the EMPS model: 68 weight vectors and 68 covariances become one, which
    // is 727 kB of covariance down to 10.7 kB per channel and a fit that is ONE recursion
    // instead of 68 — the difference between an online fit being affordable and not.
    //
    // WHAT IT COSTS, measured held-out by time and NOT what was predicted. The argument
    // beforehand was that a shared map would fail at LONG leads, since predicting `e(k+L)`
    // from the state at `k` uses information L samples stale. The opposite: it is worse at
    // SHORT leads (lead 0, residual variance 0.00451 against 0.00297) and BETTER at long ones
    // (lead 67, 0.00378 against 0.00437), because pooling is more data and the far leads are
    // the noisy ones. Mean held-out R² 0.99627 against 0.99643.
    //
    // THE ONLY MODE, and the per-lead bank it replaced is gone rather than kept as a fallback.
    // Measured both ways from the same commissioning stream: on the EMPS axis 14.42x against
    // the bank's 12.70x, and on the 2R arm's model-only stack 7.4340e-2 against 7.8154e-2.
    // Better on both, for 68x less storage — so there is nothing for a fallback to be for.
    F.pool = F.pool || this.channels.map(() => ({ X: [], y: [] }));
    // POOLED WITH A CAP, because one model over every lead is over-determined by orders of
    // magnitude and the accumulation is what commissioning time is spent on. The EMPS bank is
    // 68 leads x ~28,000 rows against 37 features — 1.9 million equations for 37 unknowns —
    // and the offline table that decided this mode matched the per-lead bank using NINE leads.
    // So rows are taken at a stride that holds the pool near `POOL_ROWS`, spread across every
    // lead rather than truncated to the first few: a cap that took only early leads would fit
    // one end of the horizon and call it the whole map.
    const want = Math.max(1, Math.round(this.N * X.length / POOL_ROWS));
    for (let i = 0; i < X.length; i += want) { F.pool[c].X.push(X[i]); F.pool[c].y.push(y[i]); }
    F.ladder.push({ ch: c, L, w: null, val: null, lev: null });
    F.li++;
    if (F.li >= F.leads.length) {
      // The channel's rows are complete, so its ONE model is fitted here — once, on the pool.
      const pool = F.pool[c];
      const v = this._blockSplit(pool.X, pool.y, chosen.ridge,
        (chosen.poly || chosen.sched) ? this._colScale(pool.X[0]) : null);
      for (const e of F.ladder) if (e.ch === c) { e.w = v.w; e.val = v.r2; e.lev = v.lev; }
      pool.X = []; pool.y = [];            // the rows are large; do not hold them past the fit
      F.li = 0; F.ch++;
    }
    if (F.ch >= this.nc) this._finishFits();
    return 0.4 + 0.6 * (F.ch * F.leads.length + F.li) / (this.nc * F.leads.length);
  }

  _finishFits() {
    const F = this._fit;
    // THE COMMISSIONED ENVELOPE: the fastest commanded move per channel, per sample, that
    // the fits ever saw. Deployment outside it degrades gracefully on the plants measured
    // (1.63x at a feed whose velocities the scribble never reached, against 2.1x inside)
    // — so the pilot REPORTS the excursion rather than derating, and the operator knows
    // which numbers were validated where.
    this.envelope = this.channels.map((_, c) => {
      let mx = 0;
      for (let k = 1; k < this._rec.cmd.length; k++) {
        mx = Math.max(mx, Math.abs(this._rec.cmd[k][c] - this._rec.cmd[k - 1][c]));
      }
      return mx;
    });
    this.report.outsideEnvelope = 0;
    this.readouts = [];
    for (let c = 0; c < this.nc; c++) {
      this.readouts.push({
        stride: F.chosen[c].stride, ridge: F.chosen[c].ridge, poly: F.chosen[c].poly,
        sched: F.chosen[c].sched,
        mLag: F.chosen[c].mLag, fLag: F.chosen[c].fLag,
        leads: F.leads,
        w: F.ladder.filter((l) => l.ch === c).map((l) => l.w),
        val: F.ladder.filter((l) => l.ch === c).map((l) => l.val),
        lev: F.ladder.filter((l) => l.ch === c).map((l) => l.lev),
      });
    }
    // A CHANNEL WHOSE FORECAST DID NOT SURVIVE VALIDATION IS DISARMED, not deployed on
    // hope: it outputs zero while the others work, and the verify round scores what will
    // actually run. Inverting a forecast that explains nothing of held-out data is how a
    // correction becomes a disturbance.
    for (const r of this.readouts) {
      r.wouldGate = r.val[0] < 0.2;
      r.gated = this.gateForecasts && r.wouldGate;
    }
    this.report.readouts = this.readouts.map((r, c) => ({
      stride: r.stride, ridge: r.ridge, gated: r.gated, wouldGate: r.wouldGate,
      basis: r.sched ? 'linear+scheduled' : (r.poly ? 'linear+quadratic' : 'linear'),
      lags: r.mLag,
      lagScores: F.chosen[c].lagScores,
      r2Lin: F.chosen[c].linR2, r2Poly: F.chosen[c].polyR2, r2Sched: F.chosen[c].schedR2,
      r2Lead0: r.val[0], r2Mid: r.val[Math.floor(r.val.length / 2)],
      r2Far: r.val[r.val.length - 1],
      // ALONGSIDE THE R2 IT IS MEANT TO EXPLAIN. `levFar / levLead0` above 1 means the far
      // lead's held-out rows sit further outside the data than the near lead's — the fit is
      // EXTRAPOLATING there, which is an excitation problem. Near 1, with r2Far bad anyway,
      // says the rows are covered and the FEATURES cannot span the target, which is a
      // dictionary problem. Same symptom, opposite fixes, and the number that tells them
      // apart costs one triangular solve on a factorisation already computed.
      levLead0: r.lev && r.lev[0] ? r.lev[0].mean : null,
      levFar: r.lev && r.lev[r.lev.length - 1] ? r.lev[r.lev.length - 1].mean : null,
      levRatio: r.lev && r.lev[0] && r.lev[r.lev.length - 1] && r.lev[0].mean > 0
        ? r.lev[r.lev.length - 1].mean / r.lev[0].mean : null,
      identifiable: this.hs[c].identifiable, dc: this.hs[c].dc,
    }));
    this._startVerify();
  }

  /**
   * THE EFFORT WEIGHT IS A PLANT-SCALED CONSTANT, AND THAT IS A MEASURED SURRENDER.
   * Three attempts to price λ automatically each failed the same way: the full-rate
   * verify chose λ = 0 and the deployed program then dominated at λ > 0; the
   * quarter-rate verify chose 7.8e-2 and the program dominated at 5e-3; and a replay
   * against held-out commissioning data chose 0 again (scribble error is broadband —
   * chasing it fast pays there and never on a program) and cost the foreign plant a
   * third of its improvement and the square 2.6x the torque reversals. One-shot
   * commissioning contains no program-like data to price against, so λ is set where
   * every deployed measurement has put the dominant basin — 0.005·dc², flat from there
   * to ~0.08·dc² on two plants and three programs — and the REPLAY LADDER IS STILL
   * COMPUTED AND REPORTED, so an operator with a real program can see where their
   * machine's preference sits. The verify round still gates the deploy at this λ.
   *
   * BUT THE CONSTANT BELONGS TO A CLOCK, and that had been invisible while there was only
   * one. λ weights ||D u||^2 where D is the difference between DECISION steps, so halving
   * the decision spacing halves the per-step difference a given PHYSICAL rate of change
   * produces, and the penalty falls with its square. The basin above is flat over
   * 0.005..0.08·dc² at `decisionsPerTs` 30 and NOT flat at 60, where the same span runs
   * 2.33x to 5.24x on the sharp square. Scaling by (decisionsPerTs/30)^2 keeps the
   * surrender in PHYSICAL terms rather than per-step ones; it is exactly 1 at the default,
   * so every plant on record is untouched. Confirmed rather than argued: the scaling
   * predicts 4x at DPT 60, and 4x measures 5.02x / 8.02x / 14.40x on the sharp square,
   * rounded rectangle and circle against a hand-picked 10x's 5.24x / 7.94x / 14.05x.
   */
  _replayLambda() {
    const dc2 = Math.max(...this.hs.map((h) => h.dc * h.dc), 1e-12);
    const lambdas = [0, 0.005 * dc2, 0.02 * dc2, 0.08 * dc2];
    const n = this._fit.eFree[0].length;
    const from = Math.floor(n * 0.7), to = n - this.N * this.grid - 1;
    const scores = lambdas.map(() => ({ s2: 0, du: 0 }));
    for (let c = 0; c < this.nc; c++) {
      if (this.readouts[c].gated) continue;
      const eF = this._fit.eFree[c];
      const hg = this.hs[c].hGrid;
      const hp = this.hs[c].hSample;
      for (let li = 0; li < lambdas.length; li++) {
        const warm = new Float64Array(this.N);
        const f0 = new Float64Array(this.N);
        const uPlan = [];
        let uPrev = 0;
        for (let t = 0; from + t * this.grid < to; t++) {
          const k0 = from + t * this.grid;
          for (let i = 0; i < this.N; i++) {
            let v = eF[Math.min(k0 + i * this.grid, n - 1)];
            for (let mI = i + 1; mI < this.N; mI++) {
              const idx = uPlan.length - (mI - i);
              if (idx >= 0) v += hg[mI] * uPlan[idx];
            }
            f0[i] = v;
          }
          // THE REPLAY LADDER MUST BE SOLVED BY THE SOLVER THAT WILL RUN (rules 30, 34).
          // This was a hard-coded 60 while the deployed path reads `this.qpIters`, so any
          // host that changed the budget got a ladder describing a machine it was not going
          // to build. Byte-identical at the default, where qpIters IS 60 — and the
          // iteration count is not a neutral parameter of the answer: on the 2R arm two
          // iterations deliver 6.94x where sixty deliver 5.97x, because truncating this
          // solve shrinks the inverse of an imperfect forecast.
          boxQP(hg, f0, warm, { U: this.uMax, lambda: lambdas[li], uPrev, iters: this.qpIters });
          uPlan.push(warm[0]);
          scores[li].du += Math.abs(warm[0] - uPrev);
          uPrev = warm[0];
          for (let i = 0; i < this.N - 1; i++) warm[i] = warm[i + 1];
          warm[this.N - 1] = 0;
        }
        // residual: free + response to the interpolated plan, on the samples
        for (let k = from + 2 * this.N * this.grid; k < to; k++) {
          let e = eF[k];
          const top = Math.min(hp.length, k - from);
          for (let mI = 0; mI < top; mI++) {
            const km = k - mI - from;
            const tm = Math.floor(km / this.grid), pm = (km % this.grid) / this.grid;
            const a = tm > 0 ? (uPlan[tm - 1] || 0) : 0;
            const b = uPlan[Math.min(tm, uPlan.length - 1)] || 0;
            e += hp[mI] * (a + (b - a) * pm);
          }
          scores[li].s2 += e * e;
        }
      }
    }
    this.report.lambdaReplay = lambdas.map((l, i) => ({ lambda: l,
      rms: Math.sqrt(scores[i].s2), du: scores[i].du }));
    return 0.005 * dc2 * (this.decisionsPerTs / 30) ** 2;
  }

  // ------------------------------------------------------------------------ verify
  _startVerify() {
    const from = this._lastCmd();          // read under the OLD phase, before it changes
    this.phase = 'verify';
    this._verSkip = null;                  // a guard derate re-enters here; do not inherit
    this.note = 'verify — the controller against nothing, interleaved, on the machine';
    // A DWELLING VERIFY CANNOT ALWAYS COVER THE BOX in the window a non-dwelling one
    // needs, and the honest answer is to REFUSE rather than to lengthen it: doubling the
    // segment was tried and it moved every plant the wrong way at once — the tank's
    // verify/program agreement 0.87x → 2.89x, the Wood–Berry overstatement 8x → 19x, and
    // the barrel went from refusing to deploying a controller that made it worse. A
    // longer verify segment is a different measurement, not a better one.
    const segLen = this._verifySegLen || Math.max(3 * this.Ts, 4000);
    const lambdaPick = this._replayLambda();
    // TWO REGIMES, AND THE GATE TAKES THE WORSE OF THEM (brick 53). One regime is one
    // opinion: the scribble alone certified 28.68x on an EMPS configuration that
    // delivered 4.79x and refused the one that delivered 15.55x, because its only
    // timescale comes from the box. A PROGRAM — trapezoid moves with ramps at the
    // machine's own rate limits, and dwells between them — is the regime the machine
    // actually runs, and it is scored on the same interleaved plan. Deploying on the
    // MINIMUM of the two ratios is the contract: a controller has to be worth having in
    // both, and a gate that averages them can still be talked into a deployment by
    // whichever regime happens to flatter it.
    const half = [{ on: false, lambda: 0 },
      { on: true, lambda: lambdaPick }, { on: false, lambda: 0 },
      { on: true, lambda: lambdaPick }, { on: false, lambda: 0 }];
    // THE SCRIBBLE RUNS FIRST AND FROM THE MACHINE'S OWN RESTING POINT, so that half is
    // byte-identical to what the gate measured before this change and the program is
    // strictly ADDED. It also removes a coupling the other order introduced: the
    // scribble builder ramps from wherever it is told to start, and handing it the
    // program's endpoint pushed it into a `cannot traverse the box` refusal on the very
    // machine this was built for. buildProgram simply moves from wherever it starts.
    const plan = [];   // filled once we know which regimes actually built
    // THE RUN-OUT MOVES TO THE FRONT OF EACH HALF, AND IT IS NOT SCORED. It used to sit
    // at the END, which meant segment 0 — an OFF segment — contained the excitation's
    // own approach ramp, when the machine is barely moving. That deflated the OFF
    // average on every plant. It became visible only with two regimes back to back: the
    // scribble half's first OFF segment read 7.4e-2 against 1.9e-1 and 3.0e-1 for the
    // other two on the tank, and the gate turned a 2.02x program into a 0.79x refusal.
    const PAD = 4000;
    const steps = half.length * segLen + PAD;
    // THE VERIFY RUNS AT QUARTER RATES, SAME BOX. The commissioning scribble is
    // deliberately as busy as the limits allow — that is what identification wants — but
    // a machine's programs live well inside its limits, and an effort weight priced on a
    // busy trajectory prices it wrong: the free error of a fast scribble is broadband, so
    // chasing it fast pays there and never does on a program. Measured on the arm,
    // deployed on a real program the effort weight is DOMINATED — λ 7.8e-2 beat λ 0 on
    // contour (6.24e-2 vs 6.75e-2), copper (4.75e-4 vs 7.25e-4, below the open loop's
    // 5.93e-4) and torque reversals (16 vs 60) — while the full-rate verify still chose
    // λ = 0 by more than its 5% band, and the half-rate one did too. Quarter rate is
    // where the verify's own preference finally matches the machine's.
    let series = null, prog = null;
    try {
      series = buildExcitation({
        channels: this.channels.map((c) => ({ ...c,
          vMax: c.vMax / 4, aMax: c.aMax / 4, jMax: c.jMax / 4 })),
        // AND IT DWELLS IF THE PROGRAM DOES. The verify decides the deploy, so it has to
        // score the regime the engineer declared — and it was building filtered noise
        // even when the excitation was told the program holds still. On the Wood–Berry
        // column that gap is not cosmetic: the verify reported 22.88x while the actual
        // benchmark scenario measured 0.68x, i.e. it certified a controller that made
        // the plant WORSE. See brick 50.
        dwell: !!this.dwell,
        steps, start: from, workspace: this.workspace, seed: this.seed + 51 });
    } catch (e) { this._verSkip = 'scribble: ' + e.message; }
    try {
      prog = buildProgram({
        channels: this.channels.map((c) => ({ ...c,
          vMax: c.vMax / 4, aMax: c.aMax / 4, jMax: c.jMax / 4 })),
        steps,
        start: series ? this.channels.map((_, c) => series.pos[c][steps - 1]) : from,
        workspace: this.workspace, seed: this.seed + 907 });
    } catch (e) {
      this._verSkip = (this._verSkip ? this._verSkip + ' | ' : '') + 'program: ' + e.message;
    }
    // ONE REGIME IS ENOUGH TO SCORE, TWO IS BETTER, ZERO IS A REFUSAL. A regime that
    // cannot be BUILT is not evidence about the controller, and refusing on it hides the
    // plant behind a rate-limit message: the extruder barrel has never once been scored
    // here, because it declares a dwelling program and a dwelling scribble cannot cross
    // its 44 K box at quarter rates — while the program regime builds at those same
    // limits without difficulty, and its own forecasts held R^2 0.69..0.92.
    if (!series && !prog) {
      this.phase = 'done';
      this.verdict = { deploy: false, why: 'verify: ' + this._verSkip };
      return;
    }
    // WHATEVER BUILT IS ONE COMMANDED SEQUENCE, each regime starting where the previous
    // one left off, so the join costs no rate-limit violation and no re-settle.
    const built = [series && { name: 'scribble', s: series }, prog && { name: 'program', s: prog }]
      .filter(Boolean);
    const nHalf = built.length;
    const joined = this.channels.map((_, c) => {
      const out = new Float64Array(nHalf * steps);
      built.forEach((b, i) => out.set(b.s.pos[c], i * steps));
      return out;
    });
    for (const b of built) for (const p of half) plan.push({ ...p, regime: b.name });
    this.report.verifyRegimes = { built: built.map((b) => b.name), skipped: this._verSkip || null,
      tRamp: prog && prog.meta.tRamp, moves: prog && prog.meta.moves,
      tc: series && series.meta.tc };
    this._ver = { exc: { series: { pos: joined, total: nHalf * steps, ramp: (series || prog).ramp },
      k0: this.k, steps: nHalf * steps },
      plan, segLen, halfLen: steps, perHalf: half.length, pad: PAD,
      seg: 0, segK: 0, acc: plan.map(() => ({ s2: 0, n: 0 })), uNow: new Array(this.nc).fill(0) };
    this._initRun();
  }

  _initRun() {
    this._run = {
      ring: [], cmdRing: [], kSamp: 0, tickPhase: 0,
      uApplied: Array.from({ length: this.nc }, () => []),
      warm: Array.from({ length: this.nc }, () => new Float64Array(this.N)),
      uPrevTick: new Array(this.nc).fill(0), uTarget: new Array(this.nc).fill(0),
      f0: new Float64Array(this.N),
    };
  }

  _verifyStep(measured, truth) {
    const V = this._ver;
    const i = this.k - V.exc.k0;
    // TWO REGIMES BACK TO BACK, EACH WITH ITS OWN SEGMENT MAP. A single floor(i/segLen)
    // over the pair is off by the first half's tail — the 4000-step run-out that lets the
    // last segment finish — and it silently billed 4000 steps of the program to the
    // scribble's opening OFF segment. The half boundary is explicit for that reason.
    const h = Math.min(V.plan.length / V.perHalf - 1, Math.floor(i / V.halfLen));
    const j = i - h * V.halfLen - V.pad;
    const inHalf = j < 0 ? -1 : Math.min(Math.floor(j / V.segLen), V.perHalf - 1);
    const seg = inHalf < 0 ? -1 : h * V.perHalf + inHalf;
    const p = seg < 0 ? { on: false, lambda: 0 } : V.plan[seg];
    if (i % this.sample === 0) {
      this._run.ring.push(measured.slice());
      this._run.cmdRing.push(Array.from({ length: this.nc }, (_, c) =>
        V.exc.series.pos[c][Math.min(i, V.exc.steps - 1)]));
      this._run.kSamp++;
      if (this._run.ring.length > 3 * (this._maxLag() * Math.max(...this.readouts.map((r) => r.stride)))) {
        this._run.ring.splice(0, 200); this._run.cmdRing.splice(0, 200);
      }
      // score everything past the segment's opening Ts, so the transition between
      // controller-on and controller-off is not billed to either side.
      if (seg >= 0 && j - inHalf * V.segLen > this.Ts) {
        const a = V.acc[seg];
        for (const v of truth) { a.s2 += v * v; a.n++; }
      }
    }
    this.lambda = p.lambda;
    this._controlTick(p.on, (sampLead) => {
      const idx = Math.min(i + sampLead * this.sample, V.exc.steps - 1);
      return Array.from({ length: this.nc }, (_, c) => V.exc.series.pos[c][idx]);
    });
    for (let c = 0; c < this.nc; c++) V.uNow[c] = this._uNowOf(c);
    if (i >= V.exc.steps - 1) { this._holdPos = this._lastCmd(); this._finishVerify(); }
  }

  _finishVerify() {
    const V = this._ver;
    const rms = V.acc.map((a) => Math.sqrt(a.s2 / Math.max(1, a.n)));
    // EACH REGIME IS SCORED ON ITS OWN SEGMENTS, and the gate takes the WORSE ratio.
    // Pooling them would let a flattering regime pay for a bad one, which is the whole
    // failure this replaces.
    const names = [...new Set(V.plan.map((p) => p.regime || 'scribble'))];
    const per = names.map((name) => {
      const idx = V.plan.map((p, i) => ((p.regime || 'scribble') === name ? i : -1))
        .filter((i) => i >= 0);
      const offs = idx.filter((i) => !V.plan[i].on).map((i) => rms[i]);
      const o = Math.sqrt(offs.reduce((a, v) => a + v * v, 0) / Math.max(1, offs.length));
      const ons = idx.filter((i) => V.plan[i].on)
        .map((i) => ({ lambda: V.plan[i].lambda, rms: rms[i] }));
      return { name, off: o, on: ons };
    });
    // rule 42: among candidates within 5% of the best MEASURED rms, take the smoothest
    // (largest lambda) — an effort penalty that costs nothing measurable is free wear.
    // THE LAMBDA IS CHOSEN ON THE POOLED EVIDENCE (both regimes) because it is one knob
    // for one machine; the RATIO that decides the deploy is per regime.
    const byLambda = new Map();
    for (const r of per) {
      for (const o of r.on) {
        const e = byLambda.get(o.lambda) || { lambda: o.lambda, s2: 0, n: 0 };
        e.s2 += (o.rms / Math.max(r.off, 1e-300)) ** 2; e.n++;
        byLambda.set(o.lambda, e);
      }
    }
    const cands = [...byLambda.values()].map((e) => ({ lambda: e.lambda,
      rel: Math.sqrt(e.s2 / e.n) }));
    cands.sort((a, b) => a.rel - b.rel);
    const near = cands.filter((o) => o.rel <= 1.05 * cands[0].rel);
    near.sort((a, b) => b.lambda - a.lambda);
    const best = near[0];
    this.lambda = best.lambda;
    const ratios = per.map((r) => {
      const pick = r.on.filter((o) => o.lambda === best.lambda);
      const on = Math.sqrt(pick.reduce((a, o) => a + o.rms * o.rms, 0) / Math.max(1, pick.length));
      return { name: r.name, off: r.off, on, ratio: r.off / Math.max(on, 1e-300) };
    });
    // THE REPRESENTATIVE REGIME DECIDES THE BENEFIT; THE OTHER VETOES ONLY HARM
    // (brick 56). Taking the worst of the two outright was the first rule and it is
    // wrong in one direction and right in the other, measured on two plants that look
    // identical in the ratios: on the 2R arm's LEARNED-KINEMATICS configuration the
    // scribble reads 0.89x against the program's 3.14x and worst-of REFUSED a system
    // that, forced, converges its contour to 1.7e-3 — a real capability lost. On the
    // non-minimum-phase tank the scribble reads 0.33x against the program's 1.20x, and
    // deploying there was MEASURED at 0.61x on the recipe: actual harm.
    // So the two regimes answer different questions. A PROGRAM is what the machine runs,
    // so its ratio is the benefit. A scribble is a broad stress regime the machine will
    // never run, so a poor score there is narrowness rather than danger — but a BAD one
    // is danger, and that is what it may veto on. The harm floor sits at 0.85 with the
    // two measured cases at 0.89 and 0.33 either side of it, so it is not delicately
    // placed; the benefit bar is unchanged at 1.1.
    const rep = ratios.find((r) => r.name === 'program') || ratios[0];
    const others = ratios.filter((r) => r !== rep);
    const harmful = others.find((r) => r.ratio < 0.85);
    const worst = harmful || rep;
    const ratio = rep.ratio;
    const off = rep.off;
    const ons = per.flatMap((r) => r.on);
    const identifiable = this.hs.every((h) => h.identifiable);
    this.report.verify = { off, on: ons, ratio, lambda: best.lambda,
      regimes: ratios, worst: worst.name };
    this.phase = 'done';
    // REFUSALS IN CAUSAL ORDER: a probe that saw nothing is a routing problem and every
    // downstream symptom (gated forecasts included) follows from it — reporting the
    // symptom when the cause is measurable sends the engineer to the wrong cabinet.
    const allGated = this.readouts.every((r) => r.gated);
    // THE GATE IS OPT-IN (brick 57). Everything above is still MEASURED and reported —
    // both regimes, both ratios, the harm veto's verdict — but by default it does not
    // veto: the model deploys and the numbers are the engineer's to read. `autoRefuse:
    // true` restores the contract this pilot was built around, where a controller the
    // machine has not vouched for is not deployed at all.
    // WHAT THAT COSTS IS MEASURED AND WORTH STATING PLAINLY: with the gate off, the
    // configurations this suite records as HARMFUL deploy too — the non-minimum-phase
    // tank delivered 0.61x on its recipe and the Wood–Berry column 0.72x against its
    // published baseline. `report.wouldRefuse` carries the reason the gate would have
    // given, so a refusal that did not happen is still legible.
    const gateReason = !identifiable
      ? 'a probe response did not rise above the held-pose noise — the correction '
        + 'is not reaching the truth signal, which is a routing question, not a tuning one'
      : (allGated
        ? 'no channel\'s forecast survived held-out validation — the correction is '
          + 'routed, but nothing about the truth is predictable from these signals'
        : ((ratio < 1.1 || harmful)
          ? (harmful
            ? `the ${harmful.name} regime measured ${harmful.ratio.toFixed(2)}x — the correction `
              + 'makes the machine worse away from its program, whatever it is worth on one'
            : `the verify round measured ${ratio.toFixed(2)}x against doing nothing on the `
              + `${rep.name} regime`)
            + ` (${ratios.map((r) => `${r.name} ${r.ratio.toFixed(2)}x`).join(', ')})`
          : null));
    this.report.wouldRefuse = gateReason;
    // A MODEL THAT DOES NOT EXIST STILL CANNOT DEPLOY, gate or no gate: with every
    // channel's forecast disarmed there is nothing to act with, and `act()` returns zero
    // for a gated channel anyway. That is arithmetic, not policy.
    if (!this.autoRefuse && !allGated) {
      this.verdict = { deploy: true,
        why: gateReason
          ? `deployed with the gate OFF — it would have refused: ${gateReason}`
          : `verified ${ratio.toFixed(2)}x on the machine (${rep.name}; `
            + ratios.map((r) => `${r.name} ${r.ratio.toFixed(2)}x`).join(' / ') + ')' };
      this._initRun();
      this.note = `deployed — λ ${best.lambda.toExponential(1)}`
        + (gateReason ? ', gate off' : `, ${ratio.toFixed(2)}x verified`);
      return;
    }
    if (!identifiable) {
      this.verdict = { deploy: false,
        why: 'a probe response did not rise above the held-pose noise — the correction '
          + 'is not reaching the truth signal, which is a routing question, not a tuning one' };
    } else if (allGated) {
      this.verdict = { deploy: false,
        why: 'no channel\'s forecast survived held-out validation — the correction is '
          + 'routed, but nothing about the truth is predictable from these signals' };
    } else if (ratio < 1.1 || harmful) {
      this.verdict = { deploy: false,
        why: (harmful
          ? `the ${harmful.name} regime measured ${harmful.ratio.toFixed(2)}x — the correction `
            + 'makes the machine worse away from its program, whatever it is worth on one'
          : `the verify round measured ${ratio.toFixed(2)}x against doing nothing on the `
            + `${rep.name} regime`)
          + ` (${ratios.map((r) => `${r.name} ${r.ratio.toFixed(2)}x`).join(', ')}) — `
          + 'this pilot does not deploy a controller the machine has not vouched for' };
    } else {
      this.verdict = { deploy: true,
        why: `verified ${ratio.toFixed(2)}x on the machine (${rep.name}; `
          + ratios.map((r) => `${r.name} ${r.ratio.toFixed(2)}x`).join(' / ') + ')' };
      this._initRun();
      this.note = `deployed — λ ${best.lambda.toExponential(1)}, ${ratio.toFixed(2)}x verified`;
    }
  }

  // ---------------------------------------------------------------------- runtime
  /**
   * @param {number[]} measured
   * @param {number[]|null} [truth] the error the machine really has, when the plant can sense
   *   it online. ACCEPTED AND NOT YET CONSUMED: the normalised-LMS law that used to read it
   *   is deleted — measured on EMPS at +0.3% on the program it could see and 8.27x → 0.98x on
   *   one it could not — and `lib/pilot/rls.js` is its replacement, not yet wired. The
   *   parameter and the plumbing above it stay because `Stack` and `AutoStack` route it and
   *   `test/pilot/rls.test.mjs` pins what will consume it; if that wiring does not land, this
   *   argument and both `observe` signatures come out together rather than lingering.
   */
  _deployObserve(measured, truth = null) {
    // A HOST THAT KEEPS FEEDING A REFUSED PILOT IS NOT A CRASH. Every plant here calls
    // observe() unconditionally in its run loop, which is the natural way to write one,
    // and a pilot that declined to deploy has no run to record into.
    if (!this._run) return;
    if (this.k % this.sample === 0) {
      this._run.ring.push(measured.slice());
      this._run.kSamp++;
      const cap = 3 * this._maxLag() * Math.max(...this.readouts.map((r) => r.stride));
      if (this._run.ring.length > cap + 400) this._run.ring.splice(0, 200);
    }
  }

  /**
   * The notch in the QP's own units. One decision step is `sample * grid` solver steps,
   * so a ring of `notchPeriod` steps is `notchPeriod / (sample * grid)` decision steps and
   * omega is 2*pi over that. Computed here rather than asked of the caller, because the
   * caller knows the machine and this object knows the grid.
   */
  _notch() {
    if (!this.notchPeriod || !(this.notchWeight > 0)) return null;
    const perDecision = this.sample * this.grid;
    const pg = this.notchPeriod / perDecision;
    // Below two decision steps per cycle the grid cannot represent it at all, and a notch
    // aimed past Nyquist would fold onto some other rate and quietly penalise THAT.
    if (!(pg > 2)) return null;
    return { omega: 2 * Math.PI / pg, weight: this.notchWeight };
  }

  _uNowOf(c) {
    const R = this._run;
    const t = R.tickPhase / (this.grid * this.sample);
    return R.uPrevTick[c] + (R.uTarget[c] - R.uPrevTick[c]) * t;
  }

  /**
   * The correction for this solver step. Call every step once deployed.
   * @param {function} lookAhead (sampleOffset) => commanded position per channel at that
   *   future SAMPLE — the host's own look-ahead buffer.
   */
  act(lookAhead) {
    if (this.phase !== 'done' || !this.verdict || !this.verdict.deploy) {
      return new Array(this.nc).fill(0);
    }
    this._controlTick(true, lookAhead, true);
    return Array.from({ length: this.nc }, (_, c) => this._uNowOf(c));
  }

  _controlTick(active, lookAhead, deployed = false) {
    const R = this._run;
    R.tickPhase++;
    if (R.tickPhase < this.grid * this.sample) return;
    R.tickPhase = 0;
    for (let c = 0; c < this.nc; c++) R.uPrevTick[c] = R.uTarget[c];
    const stride = Math.max(...this.readouts.map((r) => r.stride));
    const haveHist = R.ring.length > (this._maxLag() - 1) * stride + 2;
    if (deployed && this.envelope) {
      for (let c = 0; c < this.nc; c++) {
        const v = Math.abs(this._cmdFuture(lookAhead, 0, c, true)
          - this._cmdFuture(lookAhead, -1, c, true));
        if (v > 1.05 * this.envelope[c]) { this.report.outsideEnvelope++; break; }
      }
    }
    for (let c = 0; c < this.nc; c++) {
      const ro = this.readouts[c];
      const hg = this.hs[c].hGrid;
      const hist = R.uApplied[c];
      if (!active || !haveHist || ro.gated) { R.uTarget[c] = 0; hist.push(0); continue; }
      // NULL WHEN NOT ADAPTING, because this runs every tick for every channel and the
      // cyclic-task claim rests on the tick allocating nothing it does not need.
      for (let i = 0; i < this.N; i++) {
        const w = ro.w[Math.min(i, ro.w.length - 1)];
        const L = ro.leads[Math.min(i, ro.leads.length - 1)];
        let s2 = w[0];
        let p = 1;
        const nl = ro.poly ? [] : null;
        const sD = Math.min(ro.mLag, SCHED_LAGS);
        const ml = ro.sched ? [] : null;
        const sp = ro.sched ? [] : null;
        for (let ch = 0; ch < this.nm; ch++) {
          for (let l = 0; l < ro.mLag; l++) {
            const v = R.ring[Math.max(0, R.ring.length - 1 - l * ro.stride)][ch];
            s2 += w[p++] * v;
            if (nl && l === 0) nl.push(v);
            if (ml && l < sD) ml.push(v);
          }
        }
        for (let ch = 0; ch < this.nc; ch++) {
          const cs = this.cmdStride || ro.stride;
          for (let l = 0; l < ro.fLag; l++) {
            const off = L - l * cs;
            const p0 = this._cmdFuture(lookAhead, off, ch, deployed);
            const p1 = this._cmdFuture(lookAhead, off - 1, ch, deployed);
            const dp = (p0 - p1) * (this.Ts / this.sample);
            s2 += w[p++] * p0 + w[p++] * dp;
            if (nl && l === 0) nl.push(p0, dp);
            if (sp && l === 0) sp.push(p0);
            // SAME ORDER AS THE FIT ROW, and that is not a nicety: the weights are
            // indexed positionally, so a term added here and not there — or here in a
            // different place — evaluates the model on a vector it was never fitted on.
            if (l < this.cmdAccel) {
              const p2 = this._cmdFuture(lookAhead, off - 2, ch, deployed);
              const ap = (p0 - 2 * p1 + p2) * (this.Ts / this.sample) ** 2;
              s2 += w[p++] * ap;
              if (nl && l === 0) nl.push(ap);
            }
          }
          if (this.cmdFine) {
            const base = this._cmdFuture(lookAhead, L, ch, deployed);
            for (let l = 1; l <= this.cmdFine.lags; l++) {
              s2 += w[p++] * (this._cmdFuture(lookAhead, L - l * this.cmdFine.stride, ch, deployed) - base)
                * (this.Ts / this.sample) / (l * this.cmdFine.stride);
            }
          }
        }
        if (nl) { const q = []; polyTerms(nl, q); for (const t of q) s2 += w[p++] * t; }
        if (ml) { const q = []; schedTerms(this._schedVec(sp), ml, q); for (const t of q) s2 += w[p++] * t; }
        // THE WEIGHTS ARE INDEXED POSITIONALLY, so a block appended here and not in `_row`
        // — or here in a different order — silently evaluates the model on a vector it was
        // never fitted on, and the only symptom is a worse machine. One comparison per lead
        // turns that whole class of defect into an immediate, named failure.
        if (p !== w.length) {
          throw new Error(`pilot: forecast row is ${p} terms but the model has ${w.length} `
            + `weights — the runtime row and the fit row have diverged`);
        }
        let conv = 0;
        for (let m = i + 1; m < this.N; m++) {
          const idx = hist.length - (m - i);
          if (idx >= 0) conv += hg[m] * hist[idx];
        }
        s2 += conv;
        R.f0[i] = s2;
      }
      boxQP(hg, R.f0, R.warm[c], { U: this.uMax, lambda: this.lambda,
        uPrev: hist.length ? hist[hist.length - 1] : 0, iters: this.qpIters,
        notch: this._notch() });
      R.uTarget[c] = R.warm[c][0];
      hist.push(R.uTarget[c]);
      if (hist.length > 4 * this.N) hist.splice(0, hist.length - 2 * this.N);
      for (let i = 0; i < this.N - 1; i++) R.warm[c][i] = R.warm[c][i + 1];
      R.warm[c][this.N - 1] = 0;
    }
  }

  /**
   * PER-LEAD TRUST, from the readout's OWN held-out validation, normalised to mean 1.
   *
   * The horizon is as long as the plant takes to settle, but the forecast is not equally
   * good along it, and the QP weights every lead identically. Measured on the 2R arm at
   * the softest sliders: the elbow holds R^2 0.79 at lead 0 and 0.15 at the far lead; on
   * the fully learned routing it reaches -0.035, worse than predicting the mean, over 69
   * leads. A plan fitted to noise on most of its terms is most of the plan.
   *
   * THE NORMALISATION IS THE WHOLE DESIGN. Weighting by raw R^2 would shrink the tracking
   * term against a fixed lambda — i.e. it would double as an effort increase, and any
   * improvement could not be told from "the correction got smaller". Scaling to mean 1
   * leaves the tracking/effort balance where lambda put it and moves only WHERE the trust
   * sits, which is the claim being tested. A plant whose forecast holds up across its
   * horizon gets weights of 1 everywhere and is untouched.
   *
   * Cached per channel: `val` does not change after the fit, and rebuilding this every
   * grid tick would be arithmetic in the control loop for no reason.
   */
  _cmdFuture(lookAhead, sampOff, ch, deployed) {
    // NEGATIVE OFFSETS ARE PART OF THE CONTRACT: a short-lead readout's command window
    // reaches back past "now", and the host knows what it commanded better than any copy
    // the pilot could keep.
    if (deployed) return lookAhead(sampOff)[ch];
    // during verify, negative offsets come from the recorded ring
    if (sampOff >= 0) return lookAhead(sampOff)[ch];
    const R = this._run;
    const idx = Math.max(0, R.cmdRing.length - 1 + sampOff);
    return R.cmdRing[idx][ch];
  }

  /** For the page. */
  /**
   * MULTIPLY-ACCUMULATES AND BYTES PER SCAN, COUNTED RATHER THAN MEASURED.
   *
   * The product claim says this runs in a PLC scan. `lib/blackbox` has asserted its own
   * budget since it was written — *"in an arithmetic budget a 1 ms PLC task can afford"* —
   * and the ladder that actually ships has never had the number. An architecture argument is
   * not a measurement, and rule 16 says a number computed from the model cannot check the
   * model; this is at least the number, so the claim can be checked instead of asserted.
   *
   * TWO FIGURES, BECAUSE A PLC PROGRAMMER HAS TWO OPTIONS. `peak` is the whole update in one
   * cycle — no scheduling, and the number to quote. `sliced` spreads it over the interval
   * between updates, which a preview horizon makes legitimate at the price of one more grid
   * sample of look-ahead. Copied from `blackbox.cost()`, which learned the distinction the
   * hard way and also learned to count what it had left out.
   *
   * WHAT IS COUNTED: the forecast (one feature row per channel, then one dot product per
   * lead), the QP (free response plus a fixed iteration count of two convolutions each — the
   * same arithmetic `PreviewMPC.cost()` counts), and the per-STEP interpolation that runs on
   * every scan between updates.
   *
   * AND THE FIT, WHICH THE FIRST VERSION EXCLUDED ON A REASON THAT IS NOW VOID. It said
   * "fitting is not counted and must not be: it happens during commissioning, and the whole
   * point of freezing is that the deployed path does not fit." That holds only while
   * commissioning is allowed to run somewhere else. It is not: the requirement is that
   * everything runs ONLINE on the PLC, inside 10% of EVERY cycle, and under that requirement
   * the excluded term is the one that decides the answer. `fit.batch` is what the current
   * method costs — about 20 GMAC per channel per layer, two million cycles of budget, because
   * normal-equations-and-Cholesky is an offline algorithm. `fit.rls` is what the required
   * method costs, and `test/pilot/shared.test.mjs` pins the structural fact that makes it
   * affordable: every lead shares the design matrix, so one covariance serves the whole bank.
   */
  cost() {
    if (!this.readouts || !this.readouts.length) return null;
    let feat = 0, dots = 0, wStored = 0;
    for (const ro of this.readouts) {
      if (!ro || !ro.w || !ro.w.length) continue;
      // THE LEADS THAT COST ARE THE LEADS `act()` EVALUATES, not the ones the bank holds.
      // `_horizon` runs `for (i = 0; i < this.N; i++)`, so a horizon shortened below the
      // fitted bank's length evaluates fewer rows and pays for fewer. Counting `ro.w.length`
      // made the forecast term INVARIANT under the one knob that cuts it, which would have
      // reported a horizon sweep as buying only the QP — the instrument failing before the
      // model (rule 17). Identical whenever N is the commissioned value, which is every
      // caller that does not truncate.
      const nf = ro.w[0].length, leads = Math.min(ro.w.length, this.N);
      feat += nf;                       // building the row once per channel
      dots += nf * leads;               // one dot product per lead — unchanged by sharing,
      // because the forecast still evaluates every lead; what sharing removes is STORAGE and
      // the FIT, not the deployed arithmetic.
      wStored += nf * new Set(ro.w.slice(0, leads)).size;
    }
    const N = this.N, M = this.hs && this.hs[0] && this.hs[0].hSample
      ? this.hs[0].hSample.length : N;
    // THE FREE RESPONSE IS BUILT ON hGrid, WHICH IS N LONG — not on hSample, which is the
    // fine-grid impulse and here 599 taps. `_horizon` runs `for (m = i+1; m < this.N; m++)`
    // against `hs[c].hGrid`, so the construction is the triangle N(N-1)/2 and nothing else.
    // Costing it as `min(N,M)·M/2` — which is what `PreviewMPC.cost()` counts, because the
    // blackbox preview really does convolve the sampled impulse — overstated it by M/N,
    // 20,366 MAC against 2,278 on the EMPS model: a THIRD of the reported total, and a
    // third that would not have moved when the horizon was cut. Same class as the lead
    // count above: the model of the code drifted from the code (rule 30).
    const free = N * (N - 1) / 2;
    const perIter = 2 * N * Math.min(N, M) + 4 * N;
    const qp = Math.round(free + (this.qpIters || 4) * perIter) * this.nc;
    const perUpdate = feat + dots + qp;
    // THE INTERPOLATION IS NOT FREE AND RUNS ON EVERY SCAN. `_uNowOf` is two multiplies and
    // an add per channel, every step, between updates — small, and the kind of thing a cost
    // model leaves out and is then wrong about by the ratio of the two rates.
    const perStep = 3 * this.nc;
    const cyclesPerUpdate = Math.max(1, this.grid * this.sample);
    // ---- THE FIT, BOTH WAYS ---------------------------------------------------------
    // BATCH, as this pilot does it today: accumulate X'X over the record, factor it, and do
    // that once PER LEAD. Offline arithmetic, quoted so the gap is a number rather than an
    // adjective.
    const nAvg = this.nc ? feat / this.nc : 0;
    const rows = this._rec && this._rec.e ? this._rec.e.length : 0;
    const batchPerLead = rows * nAvg * (nAvg + 1) / 2 + (nAvg ** 3) / 6;
    // RLS with a SHARED covariance, which is what the online budget forces. One P update per
    // sample at 2n^2 — the dominant term, and why FEATURES are the first thing to cut — then
    // one readout update per lead sharing the same gain vector.
    const rlsPerSample = (2 * nAvg * nAvg + N * nAvg) * this.nc;
    const fit = {
      batch: Math.round(batchPerLead * N * this.nc), batchRows: rows,
      rls: Math.round(rlsPerSample),
      // Bytes the online fit must HOLD: one covariance per channel plus the readout bank.
      // THE BANK IS `wStored`, NOT `nAvg * N` — the same fault as `bytes` above, one line
      // down and on the number target 6 actually turns on. With `sharedWeights` the bank is
      // ONE vector, so this fell from 30.4 kB to 11.0 kB on the EMPS model while the first
      // version reported both configurations identically.
      rlsBytes: Math.round(8 * (nAvg * nAvg * this.nc + wStored)),
    };
    return { perUpdate, perStep, features: feat, dots, qp, channels: this.nc, fit,
      leads: N, cyclesPerUpdate,
      peakMacPerCycle: perUpdate + perStep,
      slicedMacPerCycle: perUpdate / cyclesPerUpdate + perStep,
      // BYTES THE DEPLOYED PATH HOLDS: the frozen readout weights, the impulse responses and
      // the horizon's warm start. f64 throughout, as the ST library's LREAL is.
      // THE WEIGHTS THE BANK ACTUALLY HOLDS, not one vector per lead assumed. With
      // `sharedWeights` every lead points at the SAME Float64Array, so counting `dots` as
      // bytes reported 25.4 kB for a bank storing 37 doubles — and reported it IDENTICALLY
      // for both configurations, which is a cost model that cannot see the change it exists
      // to measure. Counted by reference identity, so it is a property of the object rather
      // than of a flag someone might forget to pass.
      bytes: 8 * (wStored + this.nc * (M + 2 * N)) };
  }

  status() {
    return { phase: this.phase, note: this.note, k: this.k, sample: this.sample,
      Ts: this.Ts, Tset: this.Tset,
      // GUARDED, because `hs` does not exist until the probe finishes and a host polling
      // status() during settle or probe is the normal case, not an abuse: the page's own
      // debug hook calls this every frame and threw for the whole of ⑤'s commissioning.
      rings: this.hs ? this.hs.map((h) => h.rings) : null,
      overshoot: this.hs ? this.hs.map((h) => h.overshoot) : null,
      grid: this.grid, N: this.N, lambda: this.lambda,
      verdict: this.verdict, report: this.report };
  }
}
