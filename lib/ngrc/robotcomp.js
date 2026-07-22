/**
 * @file RobotComp + CompCommissioner — N-axis structural-compliance + tool-force
 * feedforward and its zero-tune per-pose commissioner. JavaScript port of
 * `Testing/ngrc_ref/robotcomp.py` and `Testing/ngrc_ref/commission.py` (mirrors
 * of `TC_NGRC_RobotComp.st` / `TC_NGRC_CompCommission.st`).
 *
 * Model (robot-agnostic; the kinematics layer supplies the geometric Jacobian J):
 *   g = Jᵀ·W (joint torques from the tool wrench) → tool-force FF;
 *   dq_j = c_j·g_j (joint deflection from per-joint compliance c_j = 1/K_j)
 *   → pre-distort the command by −dq. Cartesian flex δ = J·diag(c)·Jᵀ·W is linear
 *   in c_j, so one exact-RLS update per measured-deflection axis recovers c.
 */
import { Block, rls } from './primitives.js';

const clip = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));

/** @typedef {{deflectMax?:number, deflectRateMax?:number, tauMax?:number, tauRateMax?:number}} CompLimits */

/** N-axis compliance + tool-force feedforward with exact-RLS calibration. */
export class RobotComp {
  /**
   * @param {number} numJoints
   * @param {number} [numWrench] wrench dimension (6 = Fx,Fy,Fz,Tx,Ty,Tz)
   * @param {number} [initVariance] weak-prior P0 scale
   * @param {number[]|null} [prior] per-joint prior variances (overrides `initVariance`)
   */
  constructor(numJoints, numWrench = 6, initVariance = 1.0e-6, prior = null) {
    this.nj = numJoints | 0;
    this.nw = numWrench | 0;
    this.theta = new Block(this.nj, 1, new Array(this.nj).fill(0.0)); // c_j = 1/K_j
    const diag = prior == null ? new Array(this.nj).fill(initVariance) : [...prior];
    const P = new Array(this.nj * this.nj).fill(0.0);
    for (let i = 0; i < this.nj; i++) P[i * this.nj + i] = diag[i];
    this.P = new Block(this.nj, this.nj, P);
    this._lastTau = new Array(this.nj).fill(0.0);
    this._lastDq = new Array(this.nj).fill(0.0);
  }

  /** Joint torques from the wrench: `g = Jᵀ·W`. @returns {number[]} */
  jointTorque(jac, wrench) {
    const g = new Array(this.nj);
    for (let j = 0; j < this.nj; j++) { let s = 0.0; for (let a = 0; a < this.nw; a++) s += jac[a][j] * wrench[a]; g[j] = s; }
    return g;
  }

  /**
   * Per-scan run: tool-force FF torque (= g) and compliance pre-distortion
   * `dq = diag(c)·g`, each magnitude/slew limited.
   * @param {number[][]} jac @param {number[]} wrench
   * @param {{enableToolff?:boolean, enableComp?:boolean, limits?:CompLimits, dt?:number}} [opts]
   * @returns {{tauFf:number[], dq:number[]}}
   */
  feedforward(jac, wrench, opts = {}) {
    const { enableToolff = true, enableComp = true, limits = {}, dt = 1.0 } = opts;
    const L = { deflectMax: 0.0, deflectRateMax: 0.0, tauMax: 0.0, tauRateMax: 0.0, ...limits };
    const g = this.jointTorque(jac, wrench);
    const tauFf = new Array(this.nj).fill(0.0);
    const dq = new Array(this.nj).fill(0.0);
    for (let j = 0; j < this.nj; j++) {
      let t = enableToolff ? g[j] : 0.0;
      if (L.tauMax > 0.0) t = clip(t, -L.tauMax, L.tauMax);
      if (L.tauRateMax > 0.0) { const dm = L.tauRateMax * dt; t = clip(t, this._lastTau[j] - dm, this._lastTau[j] + dm); }
      this._lastTau[j] = t; tauFf[j] = t;
      let d = enableComp ? this.theta.m[j] * g[j] : 0.0;
      if (L.deflectMax > 0.0) d = clip(d, -L.deflectMax, L.deflectMax);
      if (L.deflectRateMax > 0.0) { const dm = L.deflectRateMax * dt; d = clip(d, this._lastDq[j] - dm, this._lastDq[j] + dm); }
      this._lastDq[j] = d; dq[j] = d;
    }
    return { tauFf, dq };
  }

  /** Calibration: one exact-RLS update per measured deflection axis. */
  calibrate(jac, wrench, tcpDeflection, lam = 1.0) {
    const g = this.jointTorque(jac, wrench);
    for (let a = 0; a < this.nw; a++) {
      const row = new Array(this.nj);
      for (let j = 0; j < this.nj; j++) row[j] = jac[a][j] * g[j];
      rls(this.theta, this.P, new Block(this.nj, 1, row), tcpDeflection[a], lam, 0.0, false);
    }
  }

  /** @returns {number[]} learned per-joint compliance c_j */
  get compliance() { return [...this.theta.m]; }
  /** @returns {number[]} per-joint stiffness 1/c_j */
  get stiffness() { return this.theta.m.map((c) => (Math.abs(c) > 1e-300 ? 1.0 / c : Infinity)); }
}

/** Validated zero-tune defaults for {@link CompCommissioner} (see the reference). */
export const FAST_PATH = {
  numWrench: 6, initVariance: 1.0, consistencyTol: 5.0e-4, innovFloor: 4.0e-4,
  innovFactor: 6.0, warmup: 40, targetSamples: 400,
};

/** Per-pose commissioner: 2-touch consistency + robust innovation gate + prequential quality. */
export class CompCommissioner {
  /** @param {number} numJoints @param {Partial<typeof FAST_PATH>} [overrides] */
  constructor(numJoints, overrides = {}) {
    const cfg = { ...FAST_PATH, ...overrides };
    this.cfg = cfg;
    this.rc = new RobotComp(numJoints, cfg.numWrench, cfg.initVariance);
    this.nj = numJoints | 0;
    this.nw = cfg.numWrench | 0;
    this.accepted = 0; this.rejected = 0;
    this._scale = cfg.innovFloor;
    this._qNum = 0.0; this._qDen = 0.0;
  }

  /**
   * One pose = two touches → accept/reject, feed RobotComp on accept.
   * @returns {boolean} accepted
   */
  submitPose(jac, wrench, defl1, defl2) {
    const c = this.cfg;
    let maxDiff = 0.0;
    for (let a = 0; a < this.nw; a++) maxDiff = Math.max(maxDiff, Math.abs(defl1[a] - defl2[a]));
    if (maxDiff > c.consistencyTol) { this.rejected += 1; return false; }
    const defl = [];
    for (let a = 0; a < this.nw; a++) defl.push(0.5 * (defl1[a] + defl2[a]));

    const g = this.rc.jointTorque(jac, wrench);
    const pred = [];
    for (let a = 0; a < this.nw; a++) {
      let s = 0.0;
      for (let j = 0; j < this.nj; j++) s += jac[a][j] * this.rc.theta.m[j] * g[j];
      pred.push(s);
    }
    let innov = 0.0;
    for (let a = 0; a < this.nw; a++) innov = Math.max(innov, Math.abs(defl[a] - pred[a]));

    if (this.accepted > c.warmup) {
      if (innov > Math.max(c.innovFloor, c.innovFactor * this._scale)) { this.rejected += 1; return false; }
      this._scale = 0.98 * this._scale + 0.02 * innov;
      for (let a = 0; a < this.nw; a++) { this._qDen += defl[a] * defl[a]; this._qNum += (defl[a] - pred[a]) ** 2; }
    }

    this.rc.calibrate(jac, wrench, defl);
    this.accepted += 1;
    return true;
  }

  get done() { return this.accepted >= this.cfg.targetSamples; }
  get progressPct() { return 100.0 * this.accepted / this.cfg.targetSamples; }
  /** Live "percent of flex captured" from the prequential residual. @returns {number} */
  get qualityPct() {
    if (this._qDen <= 0.0) return 0.0;
    return Math.max(0.0, 100.0 * (1.0 - Math.sqrt(this._qNum / this._qDen)));
  }
}
