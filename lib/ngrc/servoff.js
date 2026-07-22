/**
 * @file ServoFF — self-commissioning feedforward-torque block for a single servo
 * axis. JavaScript port of `Testing/experiments/servo_ff.py` (spec for the ST
 * `TC_NGRC_ServoFF` / `TC_NGRC_ServoFeat`).
 *
 * Route the same signals each scan (measured pos/vel/accel, last applied torque,
 * temperature, a reference accessor); get an FF torque back. Self-learns the
 * required-torque map over the Universal Servo Basis, self-normalizes,
 * self-selects/prunes unused terms, and adapts with directional forgetting —
 * with output guards. Built on the same exact-RLS primitive as the rest.
 */
import { Block, rls } from './primitives.js';

export const TRUST = { hi: 1e3, md: 1e1, lo: 1e-1 };
const EPS = 0.002, VS1 = 0.05, VS2 = 0.20;

const finite = (x) => x === x && x > -1e300 && x < 1e300;
const clip = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));

/** @typedef {{velMax?:number, accMax?:number, decMax?:number, jerkMax?:number, tauMax?:number, tauRateMax?:number}} DriveLimits */
const LIMITS0 = { velMax: 0.0, accMax: 0.0, decMax: 0.0, jerkMax: 0.0, tauMax: 0.0, tauRateMax: 0.0 };

/**
 * Commission the GMS pre-sliding thresholds from one observable axis quantity
 * (the breakaway deflection). Mirrors `commission_gms_thresholds`.
 * @param {number} dBreak @param {number} [n] @param {number} [decades]
 * @returns {number[]}
 */
export function commissionGmsThresholds(dBreak, n = 4, decades = 1.8) {
  if (n < 1 || dBreak <= 0.0) return [];
  if (n === 1) return [dBreak];
  const dMin = dBreak / (10.0 ** decades);
  const r = (dBreak / dMin) ** (1.0 / (n - 1));
  return Array.from({ length: n }, (_, i) => dMin * (r ** i));
}

/** Build the static Universal Servo Basis term table. @returns {{name:string, fn:(s:object)=>number, trust:string}[]} */
function staticTerms(npole, gearh) {
  const T = [];
  const add = (name, fn, trust) => T.push({ name, fn, trust });
  const cou = (s) => Math.tanh(s.v / EPS);
  add('inertia', (s) => s.a, 'hi');
  add('viscous', (s) => s.v, 'hi');
  add('coulomb', (s) => cou(s), 'hi');
  add('bias', () => 1.0, 'hi');
  add('coul_pos', (s) => Math.max(0.0, cou(s)), 'md');
  add('coul_neg', (s) => Math.min(0.0, cou(s)), 'md');
  add('stribeck1', (s) => cou(s) * Math.exp(-Math.min((s.v / VS1) ** 2, 50)), 'md');
  add('stribeck2', (s) => cou(s) * Math.exp(-Math.min((s.v / VS2) ** 2, 50)), 'md');
  add('drag', (s) => s.v * Math.abs(s.v), 'lo');
  add('vsq', (s) => s.v * s.v, 'lo');
  add('grav_c', (s) => Math.cos(s.th), 'md');
  add('grav_s', (s) => Math.sin(s.th), 'md');
  add('inertia_c', (s) => s.a * Math.cos(s.th), 'lo');
  add('inertia_s', (s) => s.a * Math.sin(s.th), 'lo');
  add('centri_c', (s) => s.v * s.v * Math.cos(s.th), 'lo');
  add('posvisc_c', (s) => s.v * Math.cos(s.th), 'lo');
  add('posvisc_s', (s) => s.v * Math.sin(s.th), 'lo');
  add('fricpos_c', (s) => cou(s) * Math.cos(s.th), 'lo');
  add('spring', (s) => s.th, 'lo');
  add('spring2', (s) => s.th ** 2, 'lo');
  add('therm0', (s) => s.dT, 'lo');
  add('therm_v', (s) => s.dT * s.v, 'lo');
  add('therm_c', (s) => s.dT * cou(s), 'lo');
  for (const h of gearh) {
    add(`te${h}_c`, (s) => Math.cos(h * s.th), 'lo');
    add(`te${h}_s`, (s) => Math.sin(h * s.th), 'lo');
  }
  for (const m of [1, 2]) {
    add(`cog${m}_c`, (s) => Math.cos(m * npole * s.th), 'lo');
    add(`cog${m}_s`, (s) => Math.sin(m * npole * s.th), 'lo');
  }
  return T;
}

export class ServoFF {
  /**
   * @param {number} dt scan time
   * @param {object} [opts]
   * @param {number[]} [opts.lagDeltas] @param {number} [opts.maxPreview] @param {number} [opts.npole]
   * @param {number[]} [opts.gearh] @param {number} [opts.pruneFrac] @param {number} [opts.pruneFloor]
   * @param {number} [opts.lam] @param {boolean} [opts.directional] @param {number} [opts.warmup]
   * @param {DriveLimits} [opts.limits] @param {number} [opts.outlierK] @param {number} [opts.divergeLatch]
   * @param {number[]} [opts.gmsThresholds]
   */
  constructor(dt, opts = {}) {
    const {
      lagDeltas = [1, 3, 8, 20], maxPreview = 25, npole = 8.0, gearh = [2, 3, 4, 6],
      pruneFrac = 0.02, pruneFloor = 0.004, lam = 1.0, directional = true, warmup = 3000,
      limits = null, outlierK = 8.0, divergeLatch = 20, gmsThresholds = [],
    } = opts;
    this.dt = dt;
    this.lagDeltas = lagDeltas;
    this.maxPreview = maxPreview;
    this.pruneFrac = pruneFrac; this.pruneFloor = pruneFloor;
    this.lam = lam; this.directional = directional; this.warmup = warmup;
    this.limits = { ...LIMITS0, ...(limits || {}) };
    this.aFfPrev = 0.0;
    this.terms = staticTerms(npole, gearh);
    for (const k of lagDeltas) {
      this.terms.push({ name: `vlag${k}`, fn: (s) => s.vl[k], trust: 'lo' });
      this.terms.push({ name: `alag${k}`, fn: (s) => s.al[k], trust: 'lo' });
    }
    this.gmsD = [...gmsThresholds];
    for (let i = 0; i < this.gmsD.length; i++) this.terms.push({ name: `gms${i}`, fn: (s) => s.gms[i], trust: 'md' });
    this.gmsWm = new Array(this.gmsD.length).fill(0.0);
    this.gmsWr = new Array(this.gmsD.length).fill(0.0);
    this.n = this.terms.length;
    this.prior = this.terms.map((t) => TRUST[t.trust]);
    this.theta = new Block(this.n, 1, new Array(this.n).fill(0.0));
    const P = new Array(this.n * this.n).fill(0.0);
    for (let i = 0; i < this.n; i++) P[i * this.n + i] = this.prior[i];
    this.P = new Block(this.n, this.n, P);
    this.active = new Array(this.n).fill(true);
    this.cnt = 0;
    this.fsum = new Array(this.n).fill(0.0); this.fsq = new Array(this.n).fill(0.0);
    this.mean = new Array(this.n).fill(0.0); this.std = new Array(this.n).fill(1.0);
    this.frozen = false;
    const mx = Math.max(...lagDeltas);
    this.vbuf = new Array(mx + 1).fill(0.0); this.abuf = new Array(mx + 1).fill(0.0);
    this.arefbuf = new Array(maxPreview + 2).fill(0.0);
    this.corr = new Array(maxPreview + 1).fill(0.0);
    this.aMeasPrev = 0.0;
    this.preview = 0;
    this.diverged = false;
    this.outlierK = outlierK;
    this.tauScale = 0.0;
    this.innovSeen = 0;
    this.faultCount = 0;
    this.outlierCount = 0;
    this.divergeLatch = divergeLatch;
    this.divergeStreak = 0;
    this.previewConfident = true;
    this.lastFf = 0.0;
  }

  _state(base, vlags, alags, gms) {
    return { ...base, vl: vlags, al: alags, gms: gms == null ? this.gmsWm : gms };
  }

  _gmsUpdate(w, v) {
    for (let i = 0; i < this.gmsD.length; i++) w[i] = clip(w[i] + v * this.dt, -this.gmsD[i], this.gmsD[i]);
    return w;
  }

  _raw(s) { return this.terms.map((t) => t.fn(s)); }

  _stdz(x) {
    const out = new Array(this.n);
    for (let j = 0; j < this.n; j++) out[j] = this.std[j] > 1e-9 ? (x[j] - this.mean[j]) / this.std[j] : 1.0;
    return out;
  }

  /**
   * Per-scan entry point.
   * @param {{th:number, v:number, a:number, dT:number, dT2?:number}} meas
   * @param {number} tauApplied last applied motor torque
   * @param {(offset:number)=>{th:number,v:number,a:number}} refAt planned reference at now+offset
   * @param {boolean} [learn]
   * @returns {number} FF torque (engineering units)
   */
  step(meas, tauApplied, refAt, learn = true) {
    meas = { dT2: 0.0, ...meas };
    if (!(['th', 'v', 'a', 'dT'].every((k) => finite(meas[k] == null ? 0.0 : meas[k])) && finite(tauApplied))) {
      this.faultCount += 1;
      return this.frozen ? this.lastFf : 0.0;
    }
    this.vbuf = [meas.v, ...this.vbuf.slice(0, -1)];
    this.abuf = [meas.a, ...this.abuf.slice(0, -1)];
    this.arefbuf = [refAt(0).a, ...this.arefbuf.slice(0, -1)];
    this._gmsUpdate(this.gmsWm, meas.v);
    const vlags = {}, alags = {};
    for (const k of this.lagDeltas) { vlags[k] = this.vbuf[k]; alags[k] = this.abuf[k]; }
    const xm = this._raw(this._state(meas, vlags, alags, this.gmsWm));
    this.cnt += 1;
    if (!this.frozen) {
      for (let j = 0; j < this.n; j++) { this.fsum[j] += xm[j]; this.fsq[j] += xm[j] * xm[j]; }
      if (this.cnt >= this.warmup) this._freezeNorm();
      return 0.0;
    }
    if (learn && !this.diverged) {
      const xstd = this._stdz(xm);
      let pred = 0.0;
      for (let j = 0; j < this.n; j++) pred += this.theta.m[j] * xstd[j];
      const innov = tauApplied - pred;
      const gated = (this.innovSeen > 300 && Math.abs(innov) > this.outlierK * (this.tauScale + 1e-9));
      this.innovSeen += 1;
      if (gated) {
        this.outlierCount += 1;
      } else {
        this.tauScale += 0.01 * (Math.abs(tauApplied) - this.tauScale);
        rls(this.theta, this.P, new Block(this.n, 1, xstd), tauApplied, this.lam, 0.0, this.directional);
      }
      const jmeas = meas.a - this.aMeasPrev;
      this.aMeasPrev = meas.a;
      for (let d = 0; d <= this.maxPreview; d++) this.corr[d] += (this.arefbuf[d] - this.arefbuf[d + 1]) * jmeas;
    }
    return this._ff(refAt);
  }

  _kinematicClamp(rbase) {
    const L = this.limits;
    let rv = rbase.v, ra = rbase.a;
    if (L.velMax > 0.0) rv = clip(rv, -L.velMax, L.velMax);
    const limA = (rv * ra) >= 0.0 ? L.accMax : L.decMax;
    if (limA > 0.0) ra = clip(ra, -limA, limA);
    if (L.jerkMax > 0.0) { const dmax = L.jerkMax * this.dt; ra = clip(ra, this.aFfPrev - dmax, this.aFfPrev + dmax); }
    this.aFfPrev = ra;
    return { ...rbase, v: rv, a: ra };
  }

  _ff(refAt) {
    if (this.diverged) return 0.0;
    const L = this.limits;
    const p = this.preview;
    const rbase = this._kinematicClamp(refAt(p));
    const vlags = {}, alags = {};
    for (const k of this.lagDeltas) { vlags[k] = refAt(p - k).v; alags[k] = refAt(p - k).a; }
    this._gmsUpdate(this.gmsWr, rbase.v);
    const xs = this._stdz(this._raw(this._state(rbase, vlags, alags, this.gmsWr)));
    let ff = 0.0;
    for (let j = 0; j < this.n; j++) if (this.active[j]) ff += this.theta.m[j] * xs[j];
    if (!(ff === ff) || Math.abs(ff) > 1e12) {
      this.divergeStreak += 1;
      if (this.divergeStreak >= this.divergeLatch) { this.diverged = true; return 0.0; }
      return this.lastFf;
    }
    this.divergeStreak = 0;
    if (L.tauMax > 0.0) ff = clip(ff, -L.tauMax, L.tauMax);
    if (L.tauRateMax > 0.0) { const dmax = L.tauRateMax * this.dt; ff = clip(ff, this.lastFf - dmax, this.lastFf + dmax); }
    this.lastFf = ff;
    return ff;
  }

  _freezeNorm() {
    for (let j = 0; j < this.n; j++) {
      const m = this.fsum[j] / this.cnt;
      const varr = Math.max(0.0, this.fsq[j] / this.cnt - m * m);
      this.mean[j] = m;
      this.std[j] = varr > 1e-18 ? Math.sqrt(varr) : 0.0;
    }
    this.frozen = true;
  }

  /** Prune insignificant terms + set the preview delay. @returns {object} */
  commission() {
    const contrib = this.theta.m.map((x) => Math.abs(x));
    const mx = contrib.length ? Math.max(...contrib) : 1.0;
    const thr = Math.max(this.pruneFloor, this.pruneFrac * mx);
    const order = Array.from({ length: this.n }, (_, j) => j).sort((a, b) => contrib[b] - contrib[a]);
    for (let j = 0; j < this.n; j++) this.active[j] = contrib[j] >= thr;
    const kept = [];
    for (const j of order) if (this.active[j]) kept.push(this.terms[j].name);
    let peakD = 0;
    for (let d = 1; d <= this.maxPreview; d++) if (this.corr[d] > this.corr[peakD]) peakD = d;
    const meanC = this.corr.reduce((s, c) => s + c, 0) / this.corr.length;
    const stdC = Math.sqrt(Math.max(0.0, this.corr.reduce((s, c) => s + (c - meanC) ** 2, 0) / this.corr.length));
    this.previewConfident = (stdC > 0.0 && this.corr[peakD] > 0.0 && (this.corr[peakD] - meanC) > 3.0 * stdC);
    this.preview = this.previewConfident ? peakD : 0;
    const contribTop = {};
    for (const j of order.slice(0, 8)) contribTop[this.terms[j].name] = contrib[j];
    return {
      active: kept, nActive: this.active.filter(Boolean).length, nTotal: this.n,
      preview: this.preview, previewConfident: this.previewConfident, contrib: contribTop,
    };
  }
}
