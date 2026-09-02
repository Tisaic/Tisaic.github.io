/**
 * @file THE CONVENTIONAL LAYER, SELF-TUNED — and on a real servo axis it is the best rung
 * in this whole stack.
 *
 * Everything else here learns a plant it is told nothing about. This does the opposite and
 * it is the cheapest thing in the building: it assumes the correction is a STATIC FUNCTION
 * OF THE REFERENCE'S OWN STATE — velocity, acceleration, direction of travel, a bias — and
 * fits the handful of coefficients ON THE MACHINE. That is the classical feedforward every
 * motion engineer writes by hand, with the hand taken out.
 *
 * WHY IT EARNS ITS PLACE, measured on the EMPS axis (real machine, real data, the rig in
 * `test/pilot/emps-rig.mjs`), against every other controller measured on it:
 *
 *     as shipped                                     0.5764 mm     1.0x
 *     the pilot, no plant knowledge                  0.0454 mm    12.7x
 *     ILC, hand-tuned Q, best of 12 laps             0.0049 mm   119x
 *     harmonic feedforward (`hff.js`)                0.0024 mm   242x
 *     inverse-dynamics FF at the PUBLISHED M/Fv/Fc/OF 0.0021 mm  275x
 *     THIS, four coefficients, 8 laps, no model      0.0014 mm   425x
 *
 * It reaches the rig's own fidelity floor (1.6 µm), so what the instrument supports is
 * "at least the published model's equal", not "1.5x better than it". The 8 laps is the
 * number worth looking at: six probes and two refinement passes.
 *
 * AND THE COEFFICIENTS ARE CHECKABLE, which is the part a learned model cannot offer. The
 * dominant one comes back at 0.797 mm on a basis normalised to the reference's peak
 * velocity — and this machine's position loop runs at kp = 160 s^-1 against a peak
 * 0.129 m/s, so its velocity lag is 0.129/160 = 0.806 mm. **It found the loop's own lag
 * term from data, to 1%.** An independent route agreeing is worth more than a better score.
 *
 * IT IS A PLANT MODEL AND NOT A MEMORY, WHICH IS THE WHOLE REASON IT IS HERE. The
 * coefficients multiply the REFERENCE'S derivatives, so they are evaluated live on whatever
 * the machine is asked to do next. Measured on a two-tone sine the axis has never run:
 *
 *     open loop                                      4.754e-1 mm
 *     the same four coefficients, evaluated live     2.800e-3 mm   169.8x
 *     the identical signal replayed as a lap table   8.987e-1 mm     0.53x
 *
 * The third row is the control and it is the point: the SAME correction signal, indexed by
 * sample instead of by the reference's state, makes the machine WORSE THAN NOTHING. It
 * independently reproduces the 0.55x this project already measured for a phase-indexed ILC
 * table on a program it had not seen. Memory does not transfer; a model does.
 *
 * WHAT IT CANNOT DO, stated because the ladder above it exists for these. It is STATIC, so
 * it cannot cancel a resonance or anything with memory of its own — that is what the pilot's
 * receding-horizon forecast is for. It is smooth in the reference, so it cannot represent a
 * lap-locked disturbance like roll eccentricity or a gear tooth — that is what `hff.js` is
 * for. And it needs the reference's derivatives, which a machine that is handed only
 * positions must difference for itself.
 *
 * The commissioning machinery — matched-peak probes, a least-squares operator that must be
 * overdetermined to report a residual, a damped Newton step against a frozen operator with
 * backtracking and a monotone guard, and candidates scored ON THE MACHINE rather than on
 * their fit — is the same as `hff.js`. Only the BASIS differs: harmonics of a lap there,
 * the reference's own state here. That is why the two compose.
 */

/**
 * The standard motion basis: acceleration, velocity, direction of travel, bias — per
 * channel, shared across channels so a coupled plant can be corrected from the whole
 * reference. Each row is normalised to unit peak so a coefficient reads in output units.
 *
 * @param {Array<{v: ArrayLike<number>, a: ArrayLike<number>}>} refs one per channel
 * @param {object} [o]
 * @param {boolean} [o.coulomb=true]  include sign(v) — drop it on a plant with no stiction
 * @param {boolean} [o.bias=true]     include the constant
 */
export function motionBasis(refs, o = {}) {
  const { coulomb = true, bias = true, lags = 0, lagStride = 1 } = o;
  const n = refs[0].v.length, rows = [], names = [];
  // LAG TAPS MAKE THIS AN FIR RATHER THAN A STATIC MAP, and that is a different span, not a
  // bigger one. A memoryless function of the reference's CURRENT velocity and acceleration is
  // a friction-and-inertia model: exactly right where the error is a velocity lag (425x on a
  // servo axis) and structurally incapable where it is a RINGING (1.02x on a compliant arm),
  // because a resonant response depends on the history of the excitation and not on its
  // present value. Delayed copies of the same rows let it represent one.
  //
  // The lap is closed, so the taps WRAP rather than zero-pad: sample -1 is the last sample of
  // the lap, which is what the machine actually did before this one.
  const delay = (src, d) => {
    const out = new Float64Array(n);
    for (let k = 0; k < n; k++) out[k] = src[((k - d) % n + n) % n];
    return out;
  };
  for (let c = 0; c < refs.length; c++) {
    rows.push(Float64Array.from(refs[c].a)); names.push(`a${c}`);
    rows.push(Float64Array.from(refs[c].v)); names.push(`v${c}`);
    if (coulomb) {
      rows.push(Float64Array.from(refs[c].v, Math.sign)); names.push(`sgn v${c}`);
    }
    for (let i = 1; i <= lags; i++) {
      const d = i * lagStride;
      rows.push(delay(refs[c].a, d)); names.push(`a${c}[-${d}]`);
      rows.push(delay(refs[c].v, d)); names.push(`v${c}[-${d}]`);
    }
  }
  if (bias) { rows.push(new Float64Array(n).fill(1)); names.push('1'); }
  // NORMALISE TO UNIT PEAK. Without it the acceleration row is orders of magnitude smaller
  // than the velocity row, one probe amplitude cannot excite both, and the operator comes
  // back rank-deficient in everything but the largest term.
  const scale = rows.map((r) => { let m = 0; for (let k = 0; k < n; k++) m = Math.max(m, Math.abs(r[k])); return m || 1; });
  for (let j = 0; j < rows.length; j++) for (let k = 0; k < n; k++) rows[j][k] /= scale[j];
  return {
    n: rows.length, len: n, rows, names, scale,
    at(k) { const out = new Float64Array(rows.length); for (let j = 0; j < rows.length; j++) out[j] = rows[j][k]; return out; },
    /**
     * The same basis on ANOTHER trajectory, under THIS normalisation. A LAGGED basis cannot
     * be evaluated from an instantaneous reading — the taps need the trajectory's own history
     * — so this REFUSES rather than returning a number computed from the wrong rows. A rung
     * that silently answers a question it cannot answer is the defect class this project
     * keeps paying for.
     */
    live(v, a) {
      if (lags > 0) throw new Error('motionBasis: a lagged basis has no instantaneous form; '
        + 'drive it by lap index with at(k)');
      const out = new Float64Array(rows.length);
      let j = 0;
      for (let c = 0; c < v.length; c++) {
        out[j] = a[c] / scale[j]; j++;
        out[j] = v[c] / scale[j]; j++;
        if (coulomb) { out[j] = Math.sign(v[c]) / scale[j]; j++; }
      }
      if (bias) out[j] = 1 / scale[j];
      return out;
    },
  };
}

export class ClassicFF {
  /**
   * @param {object} o
   * @param {object} o.basis      from `motionBasis`, or any {n, len, at(k), rows}
   * @param {number} [o.channels=1]
   * @param {number} [o.uMax=Infinity]  cap on the correction's peak, per channel
   * @param {number} [o.probeFrac=0.25] probe peak as a fraction of the measured error peak
   * @param {number} [o.step=1]   the step a pass starts at; it backtracks from here
   * @param {number} [o.passes=8] refinement runs that IMPROVE the machine
   * @param {number} [o.backtracks=5] halvings allowed before giving up
   * @param {number} [o.minHeadroom=0.02] refuse after the BASELINE lap when the basis spans
   *   less than this fraction of the error energy — the static rung's reachable ceiling,
   *   computable before any probe is spent. 0 restores the old always-probe path.
   * @param {number} [o.maxDeadTrials=3] stop the refinement when this many trials have run
   *   with none ever accepted — the identified direction is noise. 0 restores the old path.
   * @param {number} [o.refuseBelow=0] the improvement the CALLER will demand of this rung
   *   (a ladder passes its margin). After 4 refinement trials, a cumulative gain still
   *   below it ends the commission — the pace exit. 0 (the default) disables it.
   */
  constructor(o) {
    this.basis = o.basis;
    this.channels = o.channels || 1;
    this.len = this.basis.len;
    this.nb = this.basis.n;
    this.uMax = o.uMax ?? Infinity;
    this.probeFrac = o.probeFrac ?? 0.25;
    this.step = o.step ?? 1;
    this.passes = o.passes ?? 8;
    this.backtracks = o.backtracks ?? 5;
    this.minHeadroom = o.minHeadroom ?? 0.02;
    this.maxDeadTrials = o.maxDeadTrials ?? 3;
    this.refuseBelow = o.refuseBelow ?? 0;
    this.W = Array.from({ length: this.channels }, () => new Float64Array(this.nb));
    this.active = null;
    this.G = null;              // the (channels*nb)^2 operator
    this._scW = null; this._scV = 1; this._scN = -1; this._ver = 0;
    this.rel = 1;
    this._gram = null;
  }

  /** The correction at commissioning index `k`, as a `channels`-vector. */
  at(k) {
    const W = this.active || this.W, b = this.basis.at(k), out = new Array(this.channels).fill(0);
    const g = this._sc(W);
    for (let c = 0; c < this.channels; c++) { let s = 0; for (let j = 0; j < this.nb; j++) s += W[c][j] * b[j]; out[c] = g * s; }
    return out;
  }

  /**
   * THE DEPLOYED FORM, and the reason this layer transfers: the correction evaluated on a
   * trajectory's own state rather than read out of a table indexed by time.
   * @param {number[]} v per-channel reference velocity
   * @param {number[]} a per-channel reference acceleration
   */
  live(v, a) {
    const b = this.basis.live(v, a), out = new Array(this.channels).fill(0);
    const g = this._sc(this.W);
    for (let c = 0; c < this.channels; c++) { let s = 0; for (let j = 0; j < this.nb; j++) s += this.W[c][j] * b[j]; out[c] = g * s; }
    return out;
  }

  /** memoised: `_peak` is O(len x nb x channels) and `at()` is called every sample */
  // KEYED ON A VERSION, NOT ON OBJECT IDENTITY. `commission` mutates its weight arrays IN
  // PLACE between passes, so an identity-keyed memo returns a scale computed for weights
  // that no longer exist. It happens not to bite today only because nothing reads `live()`
  // mid-commission — which is a fact about the callers, not about this class.
  _sc(W) {
    if (this._scW !== W || this._scN !== this._ver) { this._scW = W; this._scN = this._ver; this._scV = this._scale(W); }
    return this._scV;
  }

  /** Call after ANY in-place change to a weight array, so the cached scale is recomputed. */
  touch() { this._ver++; }

  /**
   * THE CAP SCALES THE WHOLE CORRECTION, it does not clip it sample by sample. Clipping
   * makes the applied correction a NONLINEAR function of the coefficients the Newton step
   * solved for, so the frozen operator stops describing the machine and the refinement
   * chases its own distortion — measured on the 2R arm, where an unscaled fit ran the
   * coefficients to eight times the authority and delivered 1.01x.
   */
  _scale(W) {
    if (!Number.isFinite(this.uMax)) return 1;
    const pk = this._peak(W);
    return pk > this.uMax ? this.uMax / pk : 1;
  }

  /** Peak of the correction a weight set would produce, before any cap. */
  _peak(W) {
    let pk = 0;
    for (let k = 0; k < this.len; k++) {
      const b = this.basis.at(k);
      for (let c = 0; c < this.channels; c++) { let s = 0; for (let j = 0; j < this.nb; j++) s += W[c][j] * b[j]; pk = Math.max(pk, Math.abs(s)); }
    }
    return pk;
  }

  /** Least-squares projection of per-channel error signals onto the basis. */
  _project(err) {
    if (!this._gram) {
      const G = Array.from({ length: this.nb }, () => new Float64Array(this.nb));
      for (let i = 0; i < this.nb; i++) for (let j = 0; j < this.nb; j++) {
        let s = 0; for (let k = 0; k < this.len; k++) s += this.basis.rows[i][k] * this.basis.rows[j][k];
        G[i][j] = s;
      }
      this._gram = G;
    }
    return err.map((e) => {
      const rhs = new Float64Array(this.nb);
      for (let j = 0; j < this.nb; j++) { let s = 0; for (let k = 0; k < this.len; k++) s += this.basis.rows[j][k] * e[k]; rhs[j] = s; }
      return solve(this._gram, rhs) || new Float64Array(this.nb);
    });
  }

  /**
   * Probe, identify, refine. Same contract as `HarmonicFF.commission`.
   *
   * @param {(corr: ClassicFF|null) => Promise<{score:number, err:Array<ArrayLike<number>>}>} run
   */
  async commission(run) {
    const { nb, channels } = this, m = nb * channels;
    const rep = { base: 0, best: 0, hist: [], step: [], probePeak: 0, rel: 1, laps: 0 };
    this.active = null;
    const base = await run(null);
    rep.base = base.score;
    const E0 = this._project(base.err);

    // ---- THE HEADROOM, BEFORE A SINGLE PROBE LAP IS SPENT. The projection needs only the
    // baseline error, and the static rung's reachable ceiling is bounded by how much of
    // that error's energy the basis SPANS: what a basis-shaped injection can cancel is, to
    // the plant's smearing, basis-shaped. On the machine that motivated this exit the rung
    // burned 23 laps — five of the one press's 8.5 minutes — and was then refused at 1.00x,
    // a verdict the first lap already contained. The threshold is CONSERVATIVE (span under
    // `minHeadroom` of the energy, default 2%, a predicted gain under ~1% against the
    // ladder's 2% margin), because the smearing argument is a bound and not an equality;
    // a machine where the rung earns its keep (EMPS, 425x, span ~all of the error) must
    // come through byte-identical, and does. `minHeadroom: 0` restores the old path.
    {
      let re2 = 0, rb2 = 0;
      for (let c = 0; c < channels; c++) {
        for (let k = 0; k < this.len; k++) {
          const e = base.err[c][k];
          let b2 = 0;
          for (let j = 0; j < nb; j++) b2 += E0[c][j] * this.basis.rows[j][k];
          re2 += e * e; rb2 += b2 * b2;
        }
      }
      rep.headroom = re2 > 0 ? rb2 / re2 : 0;
      if (rep.headroom < this.minHeadroom) {
        rep.laps++;
        rep.why = `no headroom: the basis spans ${(100 * rep.headroom).toFixed(1)}% of the `
          + 'error energy, below the exit floor — refined toward a floor the first lap '
          + 'already contained';
        rep.best = rep.base;
        this.report = rep;
        return rep;
      }
    }

    let epk = 0;
    for (let c = 0; c < channels; c++) for (let k = 0; k < this.len; k++) epk = Math.max(epk, Math.abs(base.err[c][k]));
    const target = Math.min(this.probeFrac * epk, this.uMax);

    // ---- ONE SLOT AT A TIME, plus one combined probe so the fit is overdetermined by one
    // and can report a residual. A cosine design at m+1 probes ALIASES — slot m is slot 1
    // reflected — and the normal matrix comes back singular; that cost a run to find.
    const V = [], D = [];
    for (let q = 0; q <= m; q++) {
      const Wp = Array.from({ length: channels }, () => new Float64Array(nb));
      if (q < m) Wp[(q / nb) | 0][q % nb] = 1;
      else for (let c = 0; c < channels; c++) for (let j = 0; j < nb; j++) Wp[c][j] = ((c + j) % 2 ? -1 : 1) / Math.sqrt(m);
      // MATCHED PEAK. The slot rows have wildly different shapes, so equal COEFFICIENTS mean
      // unequal disturbance; what the machine constrains is the peak, so hold that equal.
      const pk = this._peak(Wp), sc = pk > 0 ? target / pk : 1;
      for (let c = 0; c < channels; c++) for (let j = 0; j < nb; j++) Wp[c][j] *= sc;
      rep.probePeak = Math.max(rep.probePeak, this._peak(Wp));
      this.active = Wp;
      const r = await run(this);
      rep.laps++;
      V.push(Wp); D.push(this._project(r.err));
    }
    this.active = null;
    rep.laps++;   // the baseline

    // ---- least squares for the m x m operator: injected coefficients -> error projections
    const x = [], y = [];
    for (let q = 0; q < V.length; q++) {
      const xv = [], yv = [];
      for (let c = 0; c < channels; c++) for (let j = 0; j < nb; j++) { xv.push(V[q][c][j]); yv.push(D[q][c][j] - E0[c][j]); }
      x.push(xv); y.push(yv);
    }
    const A = Array.from({ length: m }, () => new Float64Array(m));
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) { let s = 0; for (let q = 0; q < x.length; q++) s += x[q][i] * x[q][j]; A[i][j] = s; }
    const M = [];
    for (let r = 0; r < m; r++) {
      const b = new Float64Array(m);
      for (let i = 0; i < m; i++) { let s = 0; for (let q = 0; q < x.length; q++) s += x[q][i] * y[q][r]; b[i] = s; }
      const sol = solve(A, b);
      if (!sol) { rep.why = 'the probe design did not determine the operator'; this.report = rep; rep.best = rep.base; return rep; }
      M.push(sol);
    }
    this.G = M;
    let rs = 0, ss = 0;
    for (let q = 0; q < x.length; q++) for (let r = 0; r < m; r++) {
      let p = 0; for (let j = 0; j < m; j++) p += M[r][j] * x[q][j];
      rs += (y[q][r] - p) ** 2; ss += y[q][r] ** 2;
    }
    this.rel = Math.sqrt(rs / Math.max(ss, 1e-300));
    rep.rel = this.rel;

    // ---- damped Newton against the frozen operator, backtracking line search, monotone guard
    let cur = base, best = base.score, step = this.step, budget = this.passes + this.backtracks;
    // DEAD TRIALS BEFORE THE FIRST ACCEPT are the other place the budget dies quietly: when
    // the identified direction is noise, every halving fails the monotone guard and the
    // full budget is spent proving the first three trials' verdict. Once ANY trial accepts,
    // the full budget runs — a real direction deserves its refinement. `maxDeadTrials: 0`
    // restores the old path.
    let accepted = 0, dead = 0;
    const acc = Array.from({ length: channels }, () => new Float64Array(nb));
    const bestW = Array.from({ length: channels }, () => new Float64Array(nb));
    while (budget-- > 0 && step >= this.step / (1 << this.backtracks)) {
      if (this.maxDeadTrials && !accepted && dead >= this.maxDeadTrials) {
        rep.why = `no accepted refinement in ${dead} trials — the identified direction is `
          + 'noise at every step size tried';
        break;
      }
      // THE PACE EXIT, measured into existence on the arm: there the trials ACCEPT — real
      // 0.1%-level commissioning gains — and the full budget delivers 0.36% against a
      // ladder margin of 2%, so 23 laps were spent refining toward a refusal that four
      // trials already priced. Newton's gain lands in its first steps; a stalled start
      // does not accelerate. Armed only when the caller states what the ladder will demand
      // (`refuseBelow`, default off), and only after 4 trials so a slow first accept is
      // never mistaken for a stall.
      if (this.refuseBelow && rep.hist.length >= 4
          && best > base.score * (1 - this.refuseBelow)) {
        rep.why = `sub-margin pace: ${(100 * (1 - best / base.score)).toFixed(2)}% after `
          + `${rep.hist.length} refinement laps against the ${(100 * this.refuseBelow).toFixed(0)}% `
          + 'the ladder demands';
        break;
      }
      const Er = this._project(cur.err);
      const b = new Float64Array(m);
      { let i = 0; for (let c = 0; c < channels; c++) for (let j = 0; j < nb; j++) b[i++] = -Er[c][j]; }
      const v = solve(M, b);
      if (!v) break;
      const trial = acc.map((r) => Float64Array.from(r));
      { let i = 0; for (let c = 0; c < channels; c++) for (let j = 0; j < nb; j++) { trial[c][j] += step * v[i++]; } }
      this.active = trial;
      const next = await run(this);
      rep.laps++; rep.hist.push(next.score); rep.step.push(step);
      if (!(next.score < best * (1 - 1e-3))) { step /= 2; dead++; continue; }
      accepted++;
      best = next.score; cur = next;
      for (let c = 0; c < channels; c++) { acc[c].set(trial[c]); bestW[c].set(trial[c]); }
      this.touch();
    }
    this.W = bestW;
    this.touch();
    this.active = null;
    rep.best = best;
    rep.coeff = bestW.map((r) => Array.from(r));
    rep.names = this.basis.names;
    this.report = rep;
    return rep;
  }
}

/**
 * Gauss–Jordan with partial pivoting and a RELATIVE pivot floor. An absolute floor passes a
 * matrix that is rank-deficient in every way that matters and returns a fitted answer — which
 * is how an underdetermined probe design once produced a plausible operator and a machine
 * that got worse, with every check still green.
 */
function solve(Ain, bin) {
  const n = bin.length, a = [];
  let scale = 0;
  for (let i = 0; i < n; i++) {
    const r = new Float64Array(n + 1);
    for (let j = 0; j < n; j++) { r[j] = Ain[i][j]; scale = Math.max(scale, Math.abs(r[j])); }
    r[n] = bin[i]; a.push(r);
  }
  const tol = scale * n * 2.3e-16;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (!(Math.abs(a[p][c]) > tol)) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let j = c; j <= n; j++) a[r][j] -= f * a[c][j];
    }
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = a[i][n] / a[i][i];
  return out;
}
