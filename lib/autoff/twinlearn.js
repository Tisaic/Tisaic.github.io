/**
 * @file TWIN_LEARN — the program table for ONE program, learned on the twin, never on the machine.
 *
 * The same P-type iterative learning FB_AutoFF's rung ③ runs on the machine (a step of the error a
 * lead ahead, a two-pass moving-average filter, the lead and width chosen per channel from the same
 * ladders, a trial kept per channel only if it improved), run on `TWIN_2R` laps instead. The
 * machine is only needed to have run the program's reference once.
 *
 * A RESUMABLE JOB. `run(limit)` does work until the MAC count would pass `limit`, and returns the
 * count; the caller calls it again next scan. Its largest unit is one twin scan with its bookkeeping
 * (`TL_UNIT` MAC): an allotment below that makes no progress. Every twin scan is charged what `twinStep` and
 * `twinMeas` report. Arrays are allocated once at the compile-time maximum; nothing is allocated
 * in `run`.
 */
import { twinNewState, twinReset, twinStep, twinMeas } from './twin2r.js';

export const TL_LEADS = [1 / 128, 1 / 64, 1 / 256, 1 / 32];
export const TL_WIDTHS = [1 / 100, 1 / 200];
const N_CAND = TL_LEADS.length * TL_WIDTHS.length;
export const TL_UNIT = 1100;                  // the most one twin scan can charge, with its bookkeeping
const BETA0 = 0.5, GOOD = 0.02, STALLS = 3, DROP = 0.05;

// phases
const PH_IDLE = 0, PH_BAR = 2, PH_BUILD = 3, PH_TRIAL = 4, PH_MEASURE = 5, PH_DONE = 6, PH_COPY = 7, PH_ZERO = 8;

export class TwinLearner {
  /** @param {number} maxLap  the longest lap it will be asked to learn (scans) */
  constructor(maxLap) {
    this.maxLap = maxLap;
    this.aU = new Float64Array(2 * maxLap);     // the kept table, [k * 2 + c]
    this._Un = new Float64Array(2 * maxLap);    // the trial
    this._E = new Float64Array(2 * maxLap);     // the kept table's error on the twin
    this._En = new Float64Array(2 * maxLap);
    this._A = new Float64Array(maxLap);         // the filter's first pass
    this._S = twinNewState();
    this._o = new Float64Array(2);
    this._j = null;
    this._ci = new Int32Array(2); this._beta = new Float64Array(2); this._rej = new Int32Array(2);
    this._rms = new Float64Array(2); this._ss = new Float64Array(2); this._rms0 = new Float64Array(2);
    this._imp = new Uint8Array(2);
    this.phase = PH_IDLE; this.xDone = false; this.rFactor = 1; this.udiTwinLaps = 0; this.udiTrials = 0;
  }

  /**
   * Begin learning. `aRef` holds the program's joint reference, row-major with stride `stride`
   * (channel c of scan k at k * stride + c), for `nLap` scans; the learner reads it, never writes it.
   */
  start(P, aRef, stride, nLap, iterations = 15) {
    if (!(nLap >= 32 && nLap <= this.maxLap)) throw new Error(`TwinLearner: lap ${nLap} outside 32..${this.maxLap}`);
    this.P = P; this.aRef = aRef; this.stride = stride; this.L = nLap; this.iters = iterations;
    for (let c = 0; c < 2; c++) { this._ci[c] = 0; this._beta[c] = BETA0; this._rej[c] = 0; }
    this.phase = PH_ZERO; this._i = 0; this._laps = 0; this._k = 0; this._it = 0;
    this.xDone = false; this.rFactor = 1; this.udiTwinLaps = 0; this.udiTrials = 0;
  }

  _lead(c) { return Math.max(0, Math.round(TL_LEADS[(this._ci[c] / TL_WIDTHS.length) | 0] * this.L)); }
  _width(c) { return Math.max(1, Math.round(TL_WIDTHS[this._ci[c] % TL_WIDTHS.length] * this.L)); }
  _wrap(k) { const L = this.L; return ((k % L) + L) % L; }

  /**
   * Twin laps with table `U`: `warm` laps unscored, then one scored into `E` (per-channel sums of
   * squares after the first DROP of the lap). Returns true when the scored lap is complete.
   */
  _laps2(U, E, limit, cost) {
    const P = this.P, S = this._S, R = this.aRef, st = this.stride, L = this.L, o = this._o, d = Math.ceil(DROP * L);
    while (this._laps < 2) {
      if (this._k === 0 && this._laps === 1) { this._ss[0] = 0; this._ss[1] = 0; }
      while (this._k < L) {
        if (this._mac + cost > limit) return false;
        const k = this._k, r0 = R[k * st], r1 = R[k * st + 1];
        let mac = twinMeas(P, S, o);
        if (this._laps === 1) {
          const e0 = o[0] - r0, e1 = o[1] - r1;
          E[2 * k] = e0; E[2 * k + 1] = e1;
          if (k >= d) { this._ss[0] += e0 * e0; this._ss[1] += e1 * e1; }
          mac += 6;
        }
        mac += twinStep(P, S, r0 + U[2 * k], r1 + U[2 * k + 1]) + 2;
        this._mac += mac; this._k++;
      }
      this._k = 0; this._laps++; this.udiTwinLaps++;
    }
    const n = L - d;
    this._r0 = Math.sqrt(this._ss[0] / n); this._r1 = Math.sqrt(this._ss[1] / n);
    this._laps = 0;
    return true;
  }

  /** Build the trial Un on channel c: two passes of a circular moving average over U - beta E(k + lead). */
  _build(c, limit) {
    const L = this.L, A = this._A, Un = this._Un;
    const tau = this._lead(c), W = Math.min(this._width(c), (L - 1) >> 1), n = 2 * W + 1, beta = this._beta[c];
    if (this._sub === 0) {                          // pass 1's first window sum, resumable
      if (this._j === undefined || this._j === null) { this._j = -W; this._sum = 0; }
      while (this._j <= W) { if (this._mac + 4 > limit) return false; this._sum += this._d(c, this._j, tau, beta); this._mac += 4; this._j++; }
      this._j = null; this._sub = 1; this._i = 0;
    }
    if (this._sub === 1) {
      while (this._i < L) { if (this._mac + 10 > limit) return false; const k = this._i; A[k] = this._sum / n; this._sum += this._d(c, k + W + 1, tau, beta) - this._d(c, k - W, tau, beta); this._mac += 10; this._i++; }
      this._sub = 2;
    }
    if (this._sub === 2) {                          // pass 2's first window sum, resumable
      if (this._j === undefined || this._j === null) { this._j = -W; this._sum = 0; }
      while (this._j <= W) { if (this._mac + 2 > limit) return false; this._sum += A[this._wrap(this._j)]; this._mac += 2; this._j++; }
      this._j = null; this._sub = 3; this._i = 0;
    }
    while (this._i < L) { if (this._mac + 5 > limit) return false; const k = this._i; Un[2 * k + c] = this._sum / n; this._sum += A[this._wrap(k + W + 1)] - A[this._wrap(k - W)]; this._mac += 5; this._i++; }
    return true;
  }

  /** The trial's input before the filter: the kept table less a step of the error `tau` scans ahead. */
  _d(c, k, tau, beta) { const w = this._wrap(k); return this.aU[2 * w + c] - beta * this._E[2 * this._wrap(w + tau) + c]; }

  /** Progress, 0..1: the learning steps done of those asked for. */
  progress() { return this.xDone ? 1 : this.phase === PH_ZERO || this.phase === PH_BAR ? 0 : this._it / this.iters; }

  /** Do work worth up to `limit` MAC. Returns the MAC spent. */
  run(limit) {
    this._mac = 0;
    const cost = TL_UNIT;
    for (;;) {
      if (this.phase === PH_ZERO) {    // a zero table, and the twin at rest at the program's start
        const L = this.L;
        while (this._i < L) { if (this._mac + 2 > limit) return this._mac; this.aU[2 * this._i] = 0; this.aU[2 * this._i + 1] = 0; this._mac += 2; this._i++; }
        if (this._mac + 64 > limit) return this._mac;
        this._mac += twinReset(this.P, this._S, this.aRef[0], this.aRef[1]);
        this.phase = PH_BAR;
      } else if (this.phase === PH_BAR) {     // the untouched twin: a lap to settle, a lap scored
        if (!this._laps2(this.aU, this._E, limit, cost)) return this._mac;
        this._rms[0] = this._rms0[0] = this._r0; this._rms[1] = this._rms0[1] = this._r1;
        this.phase = PH_BUILD; this._c = 0; this._sub = 0;
      } else if (this.phase === PH_BUILD) {
        while (this._c < 2) { if (!this._build(this._c, limit)) return this._mac; this._c++; this._sub = 0; }
        this.phase = PH_TRIAL;
      } else if (this.phase === PH_TRIAL) {
        if (!this._laps2(this._Un, this._En, limit, cost)) return this._mac;
        this.udiTrials++;
        const r = [this._r0, this._r1]; let all = true, any = false;
        for (let c = 0; c < 2; c++) {
          const imp = r[c] < this._rms[c], good = r[c] < this._rms[c] * (1 - GOOD);
          this._imp[c] = imp ? 1 : 0; if (imp) any = true; else { all = false; this._beta[c] *= 0.5; }
          if (good) this._rej[c] = 0;
          else if (++this._rej[c] >= STALLS) { this._ci[c] = (this._ci[c] + 1) % N_CAND; this._rej[c] = 0; this._beta[c] = Math.min(BETA0, 4 * this._beta[c]); }
        }
        if (all) {                     // the trial becomes the kept table (a buffer swap)
          let t = this.aU; this.aU = this._Un; this._Un = t; t = this._E; this._E = this._En; this._En = t;
          this._rms[0] = r[0]; this._rms[1] = r[1];
          this.phase = this._next();
        } else if (any) {              // kept on some channels: copy them, then measure what is held
          this.phase = PH_COPY; this._i = 0;
        } else this.phase = this._next();
      } else if (this.phase === PH_COPY) {
        const L = this.L;
        while (this._i < L) {
          if (this._mac + 2 > limit) return this._mac;
          const k = this._i;
          for (let c = 0; c < 2; c++) if (this._imp[c]) this.aU[2 * k + c] = this._Un[2 * k + c];
          this._mac += 2; this._i++;
        }
        this.phase = PH_MEASURE;
      } else if (this.phase === PH_MEASURE) {
        if (!this._laps2(this.aU, this._E, limit, cost)) return this._mac;
        this._rms[0] = this._r0; this._rms[1] = this._r1;
        this.phase = this._next();
      } else return this._mac;
    }
  }

  _next() {
    this._it++; this._c = 0; this._sub = 0;
    if (this._it < this.iters) return PH_BUILD;
    this.rFactor = 1 / Math.sqrt(((this._rms[0] / this._rms0[0]) ** 2 + (this._rms[1] / this._rms0[1]) ** 2) / 2);
    this.xDone = true;
    return PH_DONE;
  }
}
