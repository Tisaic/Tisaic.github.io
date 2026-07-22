/**
 * @file AFM deployable blocks — JavaScript port of `Testing/tests/afm_blocks.py`
 * (the PC reference for the on-PLC `TC_NGRC_AFM_*` function blocks).
 *
 * - {@link LoggedTrainer} — cooperative batch selection over a captured log; one
 *   admit per `step()`, so a long commission slices across cyclic scans.
 * - {@link LiveTrainer} — online selection on live streaming data; `push()` per
 *   scan, periodic bounded re-selection. Per-scan work O((cap+batch)²).
 * - {@link Runner} — frozen inference only: `predict = theta · phi`, O(n).
 *
 * All read feature values through a `getFeat(j)` callback (lazy, from the live
 * signal ring), so memory is the ring + O(cap+batch), never the full dictionary.
 * Numerically faithful to the reference.
 */
import { solveRidge, initWorking, admit, screenBest } from './afm_select.js';

/** @typedef {{S:number[], theta:number[]}} Frozen */

/** Cooperative batch selection over a captured log (one admit per `step`). */
export class LoggedTrainer {
  /**
   * @param {number[][]} Phi @param {number[]} y @param {number[]} ridge
   * @param {number[]} seedIdx protected backbone (bias + linear), never evicted
   * @param {number} cap max working-set size
   * @param {number} batch (kept for parity; `step` rescreens all remaining)
   */
  constructor(Phi, y, ridge, seedIdx, cap, batch) {
    this.Phi = Phi; this.y = y; this.ridge = ridge; this.cap = cap; this.batch = batch;
    const cost = { mac: 0 };
    const w = initWorking(Phi, y, ridge, seedIdx, cost);
    this.S = w.S; this.G = w.G; this.c = w.c; this.theta = w.theta; this.resid = w.resid;
    this.cost = cost;
    this.inS = new Set(this.S);
    this.cand = [];
    for (let j = 0; j < Phi[0].length; j++) if (!this.inS.has(j)) this.cand.push(j);
    this.done = (this.S.length >= cap || this.cand.length === 0);
  }

  /**
   * Advance selection by ONE admit: rescreen all not-yet-admitted candidates
   * against the current residual (global greedy forward selection) and admit the
   * best. Returns `true` while work remains.
   * @returns {boolean}
   */
  step() {
    if (this.done) return false;
    const remaining = this.cand.filter((j) => !this.inS.has(j));
    const idx = screenBest(this.Phi, this.resid, remaining, this.cost);
    if (idx !== null) {
      const r = admit(this.Phi, this.y, this.ridge, this.S, this.G, this.c, idx, this.cost);
      this.theta = r.theta; this.resid = r.resid;
      this.inS.add(idx);
    }
    if (this.S.length >= this.cap || idx === null) this.done = true;
    return !this.done;
  }

  /** @returns {Frozen} kept indices + weights, sorted by index */
  freeze() {
    const pairs = this.S.map((s, i) => [s, this.theta[i]]).sort((a, b) => a[0] - b[0]);
    return { S: pairs.map((p) => p[0]), theta: pairs.map((p) => p[1]) };
  }
}

/**
 * Online incremental AFM. Push `(getFeat, y)` each scan; it tracks running
 * sufficient statistics (Gram `A`, cross-corr `g`, with forgetting `lam`) over
 * the working set + a rotating candidate batch, and periodically re-selects.
 */
export class LiveTrainer {
  /**
   * @param {number} m dictionary size
   * @param {number[]} ridge per-feature regularizer, length `m`
   * @param {number[]} seedIdx protected backbone (never evicted)
   * @param {number} cap max working-set size
   * @param {number} batch candidate window size
   * @param {number} [window] re-select every `window` scans
   * @param {number} [lam] forgetting factor for the running statistics
   * @param {number} [warmup] scans before the first re-select
   */
  constructor(m, ridge, seedIdx, cap, batch, window = 200, lam = 0.999, warmup = 200) {
    this.m = m; this.ridge = ridge; this.cap = cap; this.batch = batch;
    this.window = window; this.lam = lam; this.warmup = warmup;
    this.seed = [...seedIdx]; this.seedset = new Set(seedIdx);
    this.W = [...seedIdx];
    this.ptr = 0;
    this.B = this._fresh(batch);
    this.active = [...this.W, ...this.B];
    const p = this.active.length;
    this.A = Array.from({ length: p }, () => new Array(p).fill(0.0));
    this.g = new Array(p).fill(0.0);
    this.n = 0;
    this.theta = new Array(this.W.length).fill(0.0);
  }

  /** @param {number} k @returns {number[]} next `k` fresh candidate indices */
  _fresh(k) {
    const out = [];
    const inset = new Set(this.W);
    let tried = 0;
    while (out.length < k && tried < 4 * this.m) {
      const j = this.ptr % this.m; this.ptr++; tried++;
      if (!inset.has(j) && !out.includes(j) && !this.seedset.has(j)) out.push(j);
    }
    return out;
  }

  /**
   * Accumulate one scan of sufficient statistics; re-select on the schedule.
   * @param {(j:number)=>number} getFeat @param {number} y
   */
  push(getFeat, y) {
    const x = this.active.map((j) => getFeat(j));
    const p = this.active.length;
    const lam = this.lam;
    for (let a = 0; a < p; a++) {
      this.g[a] = lam * this.g[a] + x[a] * y;
      const Aa = this.A[a];
      for (let b = a; b < p; b++) Aa[b] = lam * Aa[b] + x[a] * x[b];
    }
    this.n++;
    if (this.n >= this.warmup && this.n % this.window === 0) this._reselect();
  }

  /** @param {number} i @param {number} j @returns {number} symmetric read of A */
  _sym(i, j) { return i <= j ? this.A[i][j] : this.A[j][i]; }

  _reselect() {
    const p = this.active.length;
    const nW = this.W.length;
    const G = Array.from({ length: nW }, (_, a) => Array.from({ length: nW }, (_, b) => this._sym(a, b)));
    const c = new Array(nW);
    for (let a = 0; a < nW; a++) c[a] = this.g[a];
    this.theta = solveRidge(G, c, this.W.map((_, a) => this.ridge[this.active[a]]), { mac: 0 });

    // score candidates by partial correlation with the residual: g_j - A_jW theta_W
    let best = null;
    for (let cp = nW; cp < p; cp++) {
      let pc = this.g[cp];
      for (let a = 0; a < nW; a++) pc -= this.theta[a] * this._sym(cp, a);
      const apc = Math.abs(pc);
      if (best === null || apc > best[0]) best = [apc, cp];
    }
    // weakest NON-backbone working feature: |theta|*sqrt(A_ii)
    let worst = null;
    for (let a = 0; a < nW; a++) {
      if (this.seedset.has(this.active[a])) continue;
      const v = Math.abs(this.theta[a]) * Math.sqrt(this._sym(a, a));
      if (worst === null || v < worst[0]) worst = [v, a];
    }

    let newW = [...this.W];
    if (this.W.length < this.cap && best !== null) {
      newW = [...this.W, this.active[best[1]]];
    } else if (best !== null && worst !== null && best[0] > worst[0]) {
      newW = this.W.filter((_, a) => a !== worst[1]).concat([this.active[best[1]]]);
    }

    // rebuild active = newW + fresh candidates, carrying over the working-block stats
    const oldpos = new Map();
    for (let i = 0; i < p; i++) oldpos.set(this.active[i], i);
    this.W = newW;
    this.B = this._fresh(this.batch);
    this.active = [...this.W, ...this.B];
    const q = this.active.length;
    const A2 = Array.from({ length: q }, () => new Array(q).fill(0.0));
    const g2 = new Array(q).fill(0.0);
    for (let a = 0; a < q; a++) {
      const ia = this.active[a];
      if (oldpos.has(ia)) g2[a] = this.g[oldpos.get(ia)];
      for (let b = a; b < q; b++) {
        const ib = this.active[b];
        if (oldpos.has(ia) && oldpos.has(ib)) A2[a][b] = this._sym(oldpos.get(ia), oldpos.get(ib));
      }
    }
    this.A = A2; this.g = g2;
    this.theta = new Array(this.W.length).fill(0.0);
  }

  /** @returns {Frozen} final solve of the working block on accumulated stats */
  freeze() {
    const nW = this.W.length;
    const G = Array.from({ length: nW }, (_, a) => Array.from({ length: nW }, (_, b) => this._sym(a, b)));
    const c = new Array(nW);
    for (let a = 0; a < nW; a++) c[a] = this.g[a];
    const theta = solveRidge(G, c, this.W.map((w) => this.ridge[w]), { mac: 0 });
    const pairs = this.W.map((w, i) => [w, theta[i]]).sort((a, b) => a[0] - b[0]);
    return { S: pairs.map((p) => p[0]), theta: pairs.map((p) => p[1]) };
  }
}

/** Frozen inference: `predict = theta · phi`, O(n). No training. */
export class Runner {
  /** @param {number[]} S kept indices @param {number[]} theta weights */
  constructor(S, theta) { this.S = S; this.theta = theta; }

  /** @param {(j:number)=>number} getFeat @returns {number} */
  predict(getFeat) {
    let s = 0.0;
    for (let a = 0; a < this.S.length; a++) s += this.theta[a] * getFeat(this.S[a]);
    return s;
  }
}
