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
import { buildExcitation, peakDiffs, easeSteps, lcg } from './excite.js';
import { boxQP } from '../blackbox/qp.js';

/** Ridged least squares by normal equations + Cholesky; ridge is scale-relative. */
export function solveRidge(X, y, ridge) {
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
    A[i][i] += lam;
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
   * @param {number} o.uMax correction magnitude cap, all channels
   * @param {number[]} o.start commanded position per channel right now
   * @param {Array} [o.guards] { index, max } — abort ceilings on measured signals
   * @param {function|null} [o.workspace] predicate on the commanded position vector
   * @param {number} [o.seed]
   */
  constructor({ nMeasured, channels, uMax, start, guards = [], workspace = null, seed = 1,
    exciteSteps = null, verifySegLen = null }) {
    if (!(channels.length > 0)) throw new Error('pilot: at least one control channel');
    if (!(uMax > 0)) throw new Error('pilot: uMax must be > 0');
    this.nm = nMeasured;
    this.nc = channels.length;
    this.channels = channels;
    this.uMax = uMax;
    this.guards = guards;
    this.workspace = workspace;
    this.seed = seed;
    // A COMMISSIONING TIME BUDGET IS AN ENGINEERING INPUT and these two are the knobs:
    // both default to being derived from the measured settling time, and shrinking them
    // trades forecast reach for commissioning time — measured on the arm, halving the
    // excitation mostly costs the LONG leads (rule 37: the window must reach the mode).
    this._exciteSteps = exciteSteps;
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
      default: this._deployObserve(measured); break;
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
    this._probe = { stage: 'pre', pre: [], resp: [], cross: [], amp: 0.15 * this.uMax,
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
        const range = Math.max(...p.resp) - Math.min(...p.resp);
        const w = Math.max(600, Math.round(0.25 * p.i));
        if ((travel(p.resp, w) < 0.04 * (range + 1e-300) && range > 0) || p.i > 60000) {
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
    // Ts: first crossing of 90% of the settled value.
    let Ts = resp.length;
    for (let i = 0; i < resp.length; i++) {
      if (Math.abs(resp[i]) >= 0.9 * Math.abs(dc)) { Ts = i; break; }
    }
    const nCross = new Array(this.nc).fill(0);
    if (this.nc > 1) {
      const from = Math.floor(p.cross.length * 0.9);
      for (let i = from; i < p.cross.length; i++) {
        for (let j = 0; j < this.nc; j++) nCross[j] += p.cross[i][j];
      }
      for (let j = 0; j < this.nc; j++) nCross[j] /= (p.cross.length - from) * p.amp;
    }
    this.hs = this.hs || [];
    this.hs.push({ resp, dc, noise, Ts, cross: nCross,
      identifiable: Math.abs(dc) * p.amp > 5 * noise });
    this._probeCh++;
    if (this._probeCh < this.nc) { this._newProbe(); return; }
    // --- every channel probed: derive the grids and start the excitation.
    const TsMax = Math.max(...this.hs.map((h) => h.Ts), 200);
    this.Ts = Math.round(TsMax / 0.9);          // 90% crossing → full settle estimate
    this.sample = Math.max(1, Math.round(this.Ts / 240));
    this.grid = Math.max(1, Math.round(this.Ts / this.sample / 30));
    this.N = Math.max(8, Math.ceil(this.Ts / this.sample / this.grid));
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
    const from = this._lastCmd();          // read under the OLD phase, before it changes
    this.phase = 'excite';
    this.note = 'exciting — filtered noise across the box, dither on the correction';
    const steps = this._exciteSteps || Math.max(12000, Math.round(18 * this.Ts));
    let series;
    try {
      series = buildExcitation({ channels: this.channels, steps,
        start: from, workspace: this.workspace,
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
        this._dither.u[c] = (2 * this._dither.rnd() - 1) * 0.1 * this.uMax * (this._uScale || 1);
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
    for (const c of this.channels) { c.vMax *= 0.7; c.aMax *= 0.7; }
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
      this._fit.eFree.push(out);
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
  _blockSplit(X, y, ridge) {
    const m = X.length, b = Math.floor(m / 8);
    const isVal = (i) => (i >= 3 * b && i < 4 * b) || (i >= 6 * b && i < 7 * b);
    const Xt = [], yt = [], Xv = [], yv = [];
    for (let i = 0; i < m; i++) {
      if (isVal(i)) { Xv.push(X[i]); yv.push(y[i]); }
      else { Xt.push(X[i]); yt.push(y[i]); }
    }
    const w0 = solveRidge(Xt, yt, ridge);
    const p = (r) => { let s2 = 0; for (let i = 0; i < r.length; i++) s2 += r[i] * w0[i]; return s2; };
    const score = r2(yv, Xv.map(p));
    return { r2: score, w: solveRidge(X, y, ridge) };
  }

  _mLag() { return 12; }
  _fLag() { return 12; }

  _row(c, k, L, stride) {
    const row = [1];
    const rec = this._rec;
    for (let ch = 0; ch < this.nm; ch++) {
      for (let l = 0; l < this._mLag(); l++) row.push(rec.x[k - l * stride][ch]);
    }
    for (let ch = 0; ch < this.nc; ch++) {
      for (let l = 0; l < this._fLag(); l++) {
        const idx = Math.min(k + L - l * stride, rec.cmd.length - 1);
        const p0 = rec.cmd[Math.max(0, idx)][ch];
        const p1 = rec.cmd[Math.max(0, idx - 1)][ch];
        row.push(p0, (p0 - p1) * (this.Ts / this.sample));
      }
    }
    return row;
  }

  _buildXY(c, L, stride, sub = 1) {
    const back = Math.max((this._mLag() - 1) * stride, (this._fLag() - 1) * stride - L);
    const k1 = this._rec.e.length - L - 1;
    const X = [], y = [];
    for (let k = back; k < k1; k += sub) {
      X.push(this._row(c, k, L, stride));
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
      for (const L of leads) {
        const { X, y } = this._buildXY(F.ch, L, combo.stride, 2);
        const v = this._blockSplit(X, y, combo.ridge);
        acc += v.r2;
      }
      F.scores.push({ ...combo, ch: F.ch, r2: acc / leads.length });
      F.ci++;
      if (F.ci >= F.combos.length) {
        // rule 42: within 5% of the best MEASURED score, take the smoothest (largest ridge).
        const mine = F.scores.filter((s2) => s2.ch === F.ch);
        const best = Math.max(...mine.map((s2) => s2.r2));
        const near = mine.filter((s2) => s2.r2 >= best - 0.05 * Math.abs(best));
        near.sort((a, b) => b.ridge - a.ridge || a.stride - b.stride);
        F.chosen.push({ stride: near[0].stride, ridge: near[0].ridge, r2: near[0].r2 });
        F.ci = 0; F.ch++;
        if (F.ch >= this.nc) { F.stage = 'ladder'; F.ch = 0; F.li = 0; }
      }
      return 0.4 * (F.ch * F.combos.length + F.ci) / (this.nc * F.combos.length);
    }
    // ladder: the full per-lead readout bank with the chosen windows.
    const c = F.ch, L = F.leads[F.li], chosen = F.chosen[c];
    const { X, y } = this._buildXY(c, L, chosen.stride);
    const v = this._blockSplit(X, y, chosen.ridge);
    F.ladder.push({ ch: c, L, w: v.w, val: v.r2 });
    F.li++;
    if (F.li >= F.leads.length) { F.li = 0; F.ch++; }
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
        stride: F.chosen[c].stride, ridge: F.chosen[c].ridge,
        leads: F.leads,
        w: F.ladder.filter((l) => l.ch === c).map((l) => l.w),
        val: F.ladder.filter((l) => l.ch === c).map((l) => l.val),
      });
    }
    // A CHANNEL WHOSE FORECAST DID NOT SURVIVE VALIDATION IS DISARMED, not deployed on
    // hope: it outputs zero while the others work, and the verify round scores what will
    // actually run. Inverting a forecast that explains nothing of held-out data is how a
    // correction becomes a disturbance.
    for (const r of this.readouts) r.gated = r.val[0] < 0.2;
    this.report.readouts = this.readouts.map((r, c) => ({
      stride: r.stride, ridge: r.ridge, gated: r.gated,
      r2Lead0: r.val[0], r2Mid: r.val[Math.floor(r.val.length / 2)],
      r2Far: r.val[r.val.length - 1],
      identifiable: this.hs[c].identifiable, dc: this.hs[c].dc,
    }));
    this._startVerify();
  }

  // ------------------------------------------------------------------------ verify
  _startVerify() {
    const from = this._lastCmd();          // read under the OLD phase, before it changes
    this.phase = 'verify';
    this.note = 'verify — the controller against nothing, interleaved, on the machine';
    const segLen = this._verifySegLen || Math.max(3 * this.Ts, 4000);
    // dc² scales the effort weight the way the tracking term is scaled by the response.
    const dc2 = Math.max(...this.hs.map((h) => h.dc * h.dc), 1e-12);
    // FOUR RUNGS WITH A SMALL ONE, because the pick is rms-first and smoothest-within-5%
    // — and with only {0, 0.025, 0.1} the small-λ region where the effort penalty is
    // free was not on the ladder at all: λ0 won the verify outright, and the deployed
    // control then spent 1.26x the open loop's copper on a program where λ 0.005·dc²
    // costs nothing measurable and spends less than the open loop.
    const lambdas = [0, 0.005 * dc2, 0.02 * dc2, 0.08 * dc2];
    const plan = [{ on: false, lambda: 0 }];
    for (const l of lambdas) { plan.push({ on: true, lambda: l }); plan.push({ on: false, lambda: 0 }); }
    const steps = plan.length * segLen + 4000;
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
    let series;
    try {
      series = buildExcitation({
        channels: this.channels.map((c) => ({ ...c,
          vMax: c.vMax / 4, aMax: c.aMax / 4, jMax: c.jMax / 4 })),
        steps, start: from, workspace: this.workspace, seed: this.seed + 51 });
    } catch (e) {
      this.phase = 'done';
      this.verdict = { deploy: false, why: 'verify: ' + e.message };
      return;
    }
    this._ver = { exc: { series, k0: this.k, steps: series.total }, plan, segLen,
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
    const seg = Math.min(Math.floor(i / V.segLen), V.plan.length - 1);
    const p = V.plan[seg];
    if (i % this.sample === 0) {
      this._run.ring.push(measured.slice());
      this._run.cmdRing.push(Array.from({ length: this.nc }, (_, c) =>
        V.exc.series.pos[c][Math.min(i, V.exc.steps - 1)]));
      this._run.kSamp++;
      if (this._run.ring.length > 3 * (this._mLag() * Math.max(...this.readouts.map((r) => r.stride)))) {
        this._run.ring.splice(0, 200); this._run.cmdRing.splice(0, 200);
      }
      // score everything past the segment's opening Ts, so the transition between
      // controller-on and controller-off is not billed to either side.
      if (i - seg * V.segLen > this.Ts) {
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
    const offs = V.plan.map((p, i) => (!p.on ? rms[i] : null)).filter((v) => v != null);
    const off = Math.sqrt(offs.reduce((a, v) => a + v * v, 0) / offs.length);
    const ons = V.plan.map((p, i) => (p.on ? { lambda: p.lambda, rms: rms[i] } : null))
      .filter(Boolean);
    // rule 42: among candidates within 5% of the best MEASURED rms, take the smoothest
    // (largest lambda) — an effort penalty that costs nothing measurable is free wear.
    ons.sort((a, b) => a.rms - b.rms);
    const near = ons.filter((o) => o.rms <= 1.05 * ons[0].rms);
    near.sort((a, b) => b.lambda - a.lambda);
    const best = near[0];
    this.lambda = best.lambda;
    const ratio = off / best.rms;
    const identifiable = this.hs.every((h) => h.identifiable);
    this.report.verify = { off, on: ons, ratio, lambda: best.lambda };
    this.phase = 'done';
    // REFUSALS IN CAUSAL ORDER: a probe that saw nothing is a routing problem and every
    // downstream symptom (gated forecasts included) follows from it — reporting the
    // symptom when the cause is measurable sends the engineer to the wrong cabinet.
    const allGated = this.readouts.every((r) => r.gated);
    if (!identifiable) {
      this.verdict = { deploy: false,
        why: 'a probe response did not rise above the held-pose noise — the correction '
          + 'is not reaching the truth signal, which is a routing question, not a tuning one' };
    } else if (allGated) {
      this.verdict = { deploy: false,
        why: 'no channel\'s forecast survived held-out validation — the correction is '
          + 'routed, but nothing about the truth is predictable from these signals' };
    } else if (ratio < 1.1) {
      this.verdict = { deploy: false,
        why: `the verify round measured ${ratio.toFixed(2)}x against doing nothing — `
          + 'this pilot does not deploy a controller the machine has not vouched for' };
    } else {
      this.verdict = { deploy: true, why: `verified ${ratio.toFixed(2)}x on the machine` };
      this._initRun();
      this.note = `deployed — λ ${best.lambda.toExponential(1)}, ${ratio.toFixed(2)}x verified`;
    }
  }

  // ---------------------------------------------------------------------- runtime
  _deployObserve(measured) {
    if (this.k % this.sample === 0) {
      this._run.ring.push(measured.slice());
      this._run.kSamp++;
      const cap = 3 * this._mLag() * Math.max(...this.readouts.map((r) => r.stride));
      if (this._run.ring.length > cap + 400) this._run.ring.splice(0, 200);
    }
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
    const haveHist = R.ring.length > (this._mLag() - 1) * stride + 2;
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
      for (let i = 0; i < this.N; i++) {
        const w = ro.w[Math.min(i, ro.w.length - 1)];
        const L = ro.leads[Math.min(i, ro.leads.length - 1)];
        let s2 = w[0];
        let p = 1;
        for (let ch = 0; ch < this.nm; ch++) {
          for (let l = 0; l < this._mLag(); l++) {
            s2 += w[p++] * R.ring[Math.max(0, R.ring.length - 1 - l * ro.stride)][ch];
          }
        }
        for (let ch = 0; ch < this.nc; ch++) {
          for (let l = 0; l < this._fLag(); l++) {
            const off = L - l * ro.stride;
            const p0 = this._cmdFuture(lookAhead, off, ch, deployed);
            const p1 = this._cmdFuture(lookAhead, off - 1, ch, deployed);
            s2 += w[p++] * p0 + w[p++] * ((p0 - p1) * (this.Ts / this.sample));
          }
        }
        for (let m = i + 1; m < this.N; m++) {
          const idx = hist.length - (m - i);
          if (idx >= 0) s2 += hg[m] * hist[idx];
        }
        R.f0[i] = s2;
      }
      boxQP(hg, R.f0, R.warm[c], { U: this.uMax, lambda: this.lambda,
        uPrev: hist.length ? hist[hist.length - 1] : 0, iters: 60 });
      R.uTarget[c] = R.warm[c][0];
      hist.push(R.uTarget[c]);
      if (hist.length > 4 * this.N) hist.splice(0, hist.length - 2 * this.N);
      for (let i = 0; i < this.N - 1; i++) R.warm[c][i] = R.warm[c][i + 1];
      R.warm[c][this.N - 1] = 0;
    }
  }

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
  status() {
    return { phase: this.phase, note: this.note, k: this.k, sample: this.sample,
      Ts: this.Ts, grid: this.grid, N: this.N, lambda: this.lambda,
      verdict: this.verdict, report: this.report };
  }
}
