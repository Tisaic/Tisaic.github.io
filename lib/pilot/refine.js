/**
 * REFINE — the §40 corrector as a library: converge the deployed machine's repeatable
 * residual to the plant's own floor while truth flows, freeze when it stops, and GATE
 * OFF rather than harm when the program changes.
 *
 * What it is: a state-addressed additive correction on top of a deployed pilot. A linear
 * model of the deployed residual is fitted on the RUNNING machine's own rows (command
 * history features only — the ablation measured the measured signals adding nothing, so
 * the prediction is pure feedforward with no loop through the plant), deconvolved through
 * the pilot's identified per-channel hGrid by a fixed regularized inverse filter, and
 * applied as du added to the pilot's u. Passes iterate: each refit models the residual
 * the CORRECTED machine actually leaves, which absorbs the pilot's own reaction and the
 * cross-coupling the diagonal hGrid misses. Measured on the 2R arm at the soft config
 * (docs/plan.md §40): rounded 6.1e-3 → 3.95e-4, circle 3.07e-3 → 7.1e-6 (the machine's
 * own repeatability), sharp 1.74e-2 → 2.31e-3 under a 1.2 cap — monotone, guard never
 * tripped at honest authority.
 *
 * What it is NOT: path-agnostic in its WEIGHTS. The converged corrector belongs to the
 * program and feed it converged on — frozen across a feed change it measured 3x WORSE
 * than no corrector — so a command-distribution gate turns du off outside the band the
 * fit saw, and re-convergence (with truth) is the recipe for a change, never carrying a
 * stale stack (measured: fresh convergence halves per pass; adapting through a stale
 * stack pays three passes to break even).
 *
 * Truth is consumed only by the refits: with truth null the corrector applies frozen at
 * zero truth cost, so "tracker mounted for tryout, removed for production" is the
 * intended installation (the §§20–26 truth-as-installation-property doctrine).
 *
 * No lap index exists anywhere in this file: rows are addressed by command state, pass
 * boundaries by row count, the gate by a command-rate statistic (rule: the retirement).
 */

/** Solve (A + ridge·diag(A))w = b in place, Gaussian elimination with partial pivots. */
function solve(A, b, ridgeRel) {
  const nf = b.length;
  for (let i = 0; i < nf; i++) A[i][i] += ridgeRel * A[i][i] + 1e-12;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < nf; c++) {
    let p = c;
    for (let r = c + 1; r < nf; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < nf; r++) {
      if (r === c || !M[c][c]) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= nf; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row, i) => row[nf] / (row[i] || 1));
}

/**
 * Regularized FIR inverse of an hGrid: g minimizing ||conv(h,g) − δ_D||² + λ‖h‖²·||g||²,
 * D at the response peak so the filter leans on FUTURE predictions, which pure
 * command-history features supply arbitrarily far ahead.
 */
function invFilter(hg, taps, lambda) {
  let D = 0;
  for (let i = 0; i < hg.length; i++) if (Math.abs(hg[i]) > Math.abs(hg[D])) D = i;
  const rows = hg.length + taps - 1;
  const A = Array.from({ length: taps }, () => new Float64Array(taps));
  const b = new Float64Array(taps);
  let h2 = 0;
  for (const v of hg) h2 += v * v;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < taps; i++) {
      const hi = r - i;
      if (hi < 0 || hi >= hg.length) continue;
      if (r === D) b[i] += hg[hi];
      for (let j = i; j < taps; j++) {
        const hj = r - j;
        if (hj >= 0 && hj < hg.length) A[i][j] += hg[hi] * hg[hj];
      }
    }
  }
  for (let i = 0; i < taps; i++) for (let j = 0; j < i; j++) A[i][j] = A[j][i];
  const Ar = A.map((row) => Float64Array.from(row));
  for (let i = 0; i < taps; i++) Ar[i][i] += lambda * h2;
  // solve() adds relative ridge on top; pass 0 to keep the λ‖h‖² absolute floor exact
  return { g: solve(Ar.map((r) => Array.from(r)), Array.from(b), 0), D };
}

/** The measured 2-joint basis (§39–40): per lag, rates, Newton–Euler pose modulations,
 * accelerations and quadratic rate terms. For other chain lengths a caller supplies
 * `features` — a constant carried over is a constant wrong (rule 31). */
function basis2R(lags) {
  const nf = 7 + lags.length * 12;
  return {
    nf,
    row(rel, out) {
      // rel(j): commanded joints j samples from now (j ≤ 0 history, j > 0 look-ahead)
      const q = rel(0);
      const q1 = q[0], q2 = q[1];
      const s1 = Math.sin(q1), c1 = Math.cos(q1);
      const s12 = Math.sin(q1 + q2), c12 = Math.cos(q1 + q2);
      const s2 = Math.sin(q2), c2 = Math.cos(q2);
      out[0] = 1; out[1] = s1; out[2] = s12; out[3] = c1; out[4] = c12; out[5] = s2; out[6] = c2;
      let o = 7;
      for (const d of lags) {
        const a = rel(-d), b = rel(-d - 1), b2 = rel(-d - 2);
        const v1 = (a[0] - b[0]) * 1e3, v2 = (a[1] - b[1]) * 1e3;
        const a1 = (a[0] - 2 * b[0] + b2[0]) * 1e6, a2 = (a[1] - 2 * b[1] + b2[1]) * 1e6;
        out[o++] = v1; out[o++] = v2;
        out[o++] = v1 * s1; out[o++] = v2 * c12; out[o++] = v1 * s12; out[o++] = v2 * c1;
        out[o++] = a1; out[o++] = a2; out[o++] = a1 * c2; out[o++] = a2 * c2;
        out[o++] = v1 * v1 * s2; out[o++] = v1 * v2 * s2;
      }
      return out;
    },
  };
}

export class Refiner {
  /**
   * @param {object} pilot a commissioned, deployed pilot: hs[c].hGrid, grid, sample, uMax
   * @param {object} o
   *   cap          |du| clamp per channel; default 0.6·pilot.uMax. Authority is accuracy
   *                on corner-heavy programs (§40: sharp stalls pinned at 0.4, converges
   *                at 1.2) — but the cap is the ENGINEER'S number, never raised here.
   *   scale        per-pass application gain (default 0.8)
   *   rowsPerFit   rows accumulated per refit pass (default 1600)
   *   warmRows     rows discarded after each stack change before accumulating (default 320)
   *   guard        a pass whose window rms exceeds best·guard is reverted and the scale
   *                halved (default 1.05); two reverts end refitting
   *   maxPasses    refit budget (default 8)
   *   lags         lag ladder in SAMPLES; default reaches ≈3·Tset — rule 31: re-derive,
   *                don't carry — floor-clamped to the arm-measured 360-sample reach shape
   *   features     { nf, row(rel, out) } basis override for non-2R chains
   *   gateBand     command-rate EMA band around the fit diet's; outside it du gates to
   *                zero (default 0.30), re-arming inside half the band
   *   ridge        relative ridge on the refit normal equations (default 1e-6)
   *   invTaps, invLambda   inverse-filter shape (default 48, 1e-2)
   */
  constructor(pilot, o = {}) {
    if (!pilot || !pilot.hs || !pilot.hs.length || !pilot.grid || !pilot.sample) {
      throw new Error('refiner: needs a commissioned pilot (hs/grid/sample)');
    }
    this.pilot = pilot;
    this.nCh = pilot.hs.length;
    this.grid = pilot.grid;
    this.cap = o.cap ?? 0.6 * pilot.uMax;
    this.scale = o.scale ?? 0.8;
    this.rowsPerFit = o.rowsPerFit ?? 1600;
    this.warmRows = o.warmRows ?? 320;
    this.guard = o.guard ?? 1.05;
    this.maxPasses = o.maxPasses ?? 8;
    this.gateBand = o.gateBand ?? 0.30;
    this.ridge = o.ridge ?? 1e-6;
    if (o.lags) this.lags = o.lags.slice();
    else {
      // reach ≈ 3·Tset in samples (Tset is in steps), floored at the measured-arm 360
      const reach = Math.max(360, Math.min(900, Math.round(3 * (pilot.Tset || 0) / pilot.sample)));
      const base = [0, 2, 4, 6, 9, 13, 18, 24, 32, 42, 55, 70, 90, 115, 145, 180, 230, 290, 360];
      this.lags = base.map((d) => Math.round(d * reach / 360));
      for (let i = 1; i < this.lags.length; i++) {
        if (this.lags[i] <= this.lags[i - 1]) this.lags[i] = this.lags[i - 1] + 1;
      }
    }
    const feats = o.features
      ?? (this.nCh === 2 ? basis2R(this.lags) : null);
    if (!feats) throw new Error('refiner: pass o.features for chains that are not 2R (rule 31)');
    this.nf = feats.nf;
    this._row = feats.row;
    this.inv = pilot.hs.map((h) => invFilter(h.hGrid, o.invTaps ?? 48, o.invLambda ?? 1e-2));
    this.maxLead = Math.max(...this.inv.map(({ D }) => (D + 2) * this.grid));
    // history ring of commanded joints: the inverse filter's deepest tap reaches
    // (invTaps − D)·grid samples BEHIND now, and each prediction there lags a further
    // reach — the ring must hold both, or the deep features silently clamp (rule 46's
    // cousin: the boundary is where the SCHEME puts it)
    this.histLen = this.lags[this.lags.length - 1] + 3 + ((o.invTaps ?? 48) + 2) * this.grid;
    this.hist = [];
    // the collapsed stack: one weight vector per channel, plus each pass for revert
    this.w = Array.from({ length: this.nCh }, () => new Float64Array(this.nf));
    this.passes = [];
    // streaming normal equations
    this._resetAcc();
    this.warm = this.histLen + this.warmRows;
    this.rowBuf = new Float64Array(this.nf);
    this.state = 'refining';        // refining | frozen (guard exhausted or maxPasses)
    this.gated = false;
    this.duPk = 0;
    this.bestRms = null;
    this.reverts = 0;
    // command-rate EMA for the gate; reference set at each accepted pass
    this._ema = 0;
    this._emaN = 0;
    this._emaTc = this.lags[this.lags.length - 1];
    this._emaRef = null;
    this._tick = null;
    this._duTick = null;
  }

  _resetAcc() {
    this._A = Array.from({ length: this.nf }, () => new Float64Array(this.nf));
    this._b = Array.from({ length: this.nCh }, () => new Float64Array(this.nf));
    this._rows = 0;
    this._e2 = new Float64Array(this.nCh);
  }

  /** Per sample, before act: the commanded joints for THIS sample and the routed truth
   * (null once the tracker is gone — the corrector then applies frozen). */
  observe(cmdJoints, truth) {
    this.hist.push(cmdJoints);
    if (this.hist.length > this.histLen) this.hist.shift();
    const h = this.hist;
    if (h.length >= 2) {
      const a = h[h.length - 1], b = h[h.length - 2];
      let r = 0;
      for (let c = 0; c < this.nCh; c++) r += Math.abs(a[c] - b[c]);
      const al = 1 / this._emaTc;
      this._ema += al * (r - this._ema);
      this._emaN++;
    }
    // the gate: outside the band the fit diet saw, the correction is a stranger — off
    if (this._emaRef !== null && this._emaN > this._emaTc) {
      const dev = Math.abs(this._ema - this._emaRef) / (this._emaRef || 1e-12);
      if (!this.gated && dev > this.gateBand) {
        this.gated = true;
        // rows gathered so far straddle the change — a fit on them serves neither regime
        this._resetAcc();
        this.warm = this.warmRows;
      } else if (this.gated && dev < this.gateBand / 2) this.gated = false;
    }
    if (this.state !== 'refining' || this.gated || !truth) return;
    if (this.warm > 0) { this.warm--; return; }
    if (this.hist.length < this.histLen) return;
    const x = this._row(this._relNow(), this.rowBuf);
    for (let i = 0; i < this.nf; i++) {
      const Ai = this._A[i], xi = x[i];
      for (let j = i; j < this.nf; j++) Ai[j] += xi * x[j];
      for (let c = 0; c < this.nCh; c++) this._b[c][i] += xi * truth[c];
    }
    for (let c = 0; c < this.nCh; c++) this._e2[c] += truth[c] * truth[c];
    this._rows++;
    if (this._rows >= this.rowsPerFit) this._refit();
  }

  _relNow() {
    const h = this.hist, last = h.length - 1;
    return (j) => h[Math.max(0, Math.min(last, last + j))];
  }

  _refit() {
    let rms = 0;
    for (let c = 0; c < this.nCh; c++) rms += this._e2[c] / this._rows;
    rms = Math.sqrt(rms);
    if (this.bestRms !== null && rms > this.bestRms * this.guard && this.passes.length) {
      // the guard: undo the last pass (the stack is linear, so revert is subtraction)
      const lastP = this.passes.pop();
      for (let c = 0; c < this.nCh; c++) {
        for (let i = 0; i < this.nf; i++) this.w[c][i] -= lastP.scale * lastP.w[c][i];
      }
      this.scale /= 2;
      this.reverts++;
      if (this.reverts >= 2) this.state = 'frozen';
      this._resetAcc();
      this.warm = this.warmRows;
      return;
    }
    this.bestRms = this.bestRms === null ? rms : Math.min(this.bestRms, rms);
    for (let i = 0; i < this.nf; i++) for (let j = 0; j < i; j++) this._A[i][j] = this._A[j][i];
    const wPass = [];
    for (let c = 0; c < this.nCh; c++) {
      const A = this._A.map((r) => Array.from(r));
      const wc = solve(A, Array.from(this._b[c]), this.ridge);
      wPass.push(wc);
      for (let i = 0; i < this.nf; i++) this.w[c][i] += this.scale * wc[i];
    }
    this.passes.push({ w: wPass, scale: this.scale, rms });
    this._emaRef = this._ema;
    if (this.passes.length >= this.maxPasses) this.state = 'frozen';
    this._resetAcc();
    this.warm = this.warmRows;
  }

  /**
   * Per sample, after observe: the additive correction. `lookAhead(off)` returns the
   * commanded joints `off` samples AHEAD (off ≥ 1); history comes from the ring. The
   * filtered prediction is recomputed once per decision tick and interpolated between
   * ticks (the pilot's own correction basis is the same triangle).
   */
  act(lookAhead) {
    if (this.gated || !this.passes.length || this.hist.length < this.histLen) {
      return new Array(this.nCh).fill(0);
    }
    const h = this.hist, last = h.length - 1;
    const rel = (j) => (j <= 0 ? h[Math.max(0, last + j)] : lookAhead(j));
    const predAt = (c, sampAhead) => {
      const relS = (j) => rel(sampAhead + j);
      const x = this._row(relS, this.rowBuf);
      const wc = this.w[c];
      let p = 0;
      for (let i = 0; i < this.nf; i++) p += wc[i] * x[i];
      return p;
    };
    const tickOf = (this._tickCount = (this._tickCount ?? -1) + 1);
    const t0 = Math.floor(tickOf / this.grid), fr = tickOf / this.grid - t0;
    if (this._tick !== t0) {
      const duT = [];
      for (let c = 0; c < this.nCh; c++) {
        const { g, D } = this.inv[c];
        const one = (tt) => {
          let s = 0;
          for (let j = 0; j < g.length; j++) s += g[j] * predAt(c, (tt + D - j) * this.grid);
          return -s;
        };
        duT.push([one(0), one(1)]);
      }
      this._duTick = duT;
      this._tick = t0;
    }
    return this._duTick.map(([a, b], c) => {
      const v = a + fr * (b - a);
      const clamped = Math.max(-this.cap, Math.min(this.cap, v));
      this.duPk = Math.max(this.duPk, Math.abs(clamped));
      return clamped;
    });
  }

  report() {
    return {
      state: this.state,
      passes: this.passes.map((p) => ({ scale: p.scale, windowRms: p.rms })),
      scale: this.scale,
      reverts: this.reverts,
      gated: this.gated,
      duPk: this.duPk,
      cap: this.cap,
      reach: this.lags[this.lags.length - 1],
      nf: this.nf,
    };
  }
}
