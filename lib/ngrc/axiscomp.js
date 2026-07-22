/**
 * @file AxisComp — position-domain ballscrew PITCH-error + BACKLASH compensation
 * for one axis. JavaScript port of `TC_NGRC_AxisComp.st` (+ `TC_NGRC_AxisFeat` /
 * `TC_NGRC_AxisComp_Std`); cross-validated against a faithful Python transcription
 * built on the golden `rls` primitive.
 *
 * Open-loop setpoint correction: given a commanded position it returns the
 * pre-distortion so a semi-closed-loop table reaches target despite lead error +
 * backlash. `calibrate()` feeds static laser dwells (both directions) into an
 * exact-RLS fit of `err = pitch(pos,T) + (B/2)·dir` over a Fourier(per-rev) +
 * poly(cumulative) + thermal basis; `run()` returns the position correction.
 * Features are standardized by FIXED scales from the known range (no two-pass).
 */
import { Block, rlsInit, rls } from './primitives.js';

/** Feature index map: 0 Pos, 1 Pos², 2 cos(Wp), 3 sin(Wp), 4 cos(2Wp), 5 sin(2Wp), 6 dT, 7 dT·Pos, 8 bias, 9 Dir. */
export function axisFeat(pos, dT, dir, lead) {
  const w = (2.0 * Math.PI) / lead;
  return [
    pos, pos * pos, Math.cos(w * pos), Math.sin(w * pos), Math.cos(2.0 * w * pos), Math.sin(2.0 * w * pos),
    dT, dT * pos, 1.0, dir,
  ];
}

export class AxisComp {
  /**
   * @param {object} par
   * @param {number} par.posMin @param {number} par.posMax
   * @param {number} par.tempMin @param {number} par.tempMax
   * @param {number} par.lead ballscrew lead (travel per rev)
   * @param {number} [par.initVariance] @param {number[]|null} [par.prior] per-feature prior variances
   */
  constructor(par) {
    const { posMin, posMax, tempMin, tempMax, lead, initVariance = 10.0, prior = null } = par;
    this.lead = lead;
    let pmid = 0.5 * (posMin + posMax), psc = 0.5 * (posMax - posMin);
    if (psc < 1e-9) psc = 1.0;
    let tmid = 0.5 * (tempMin + tempMax), tsc = 0.5 * (tempMax - tempMin);
    if (tsc < 1e-9) tsc = 1.0;
    // fixed standardization: cos/sin/bias/dir are already O(1)
    this.mean = [pmid, pmid * pmid, 0, 0, 0, 0, tmid, tmid * pmid, 0, 0];
    this.scale = [psc, psc * psc, 1, 1, 1, 1, tsc, tsc * psc, 0, 1]; // scale[8]=0 → bias kept raw (1.0)
    const { theta, P } = rlsInit(10, prior != null ? prior : initVariance);
    this.theta = theta; this.P = P;
    this.lastCorr = 0.0;
    this.backlashLearned = 0.0;
  }

  /** @param {number[]} x @returns {number[]} fixed-scale standardized features */
  _std(x) {
    const out = new Array(10);
    for (let j = 0; j < 10; j++) out[j] = this.scale[j] > 1e-9 ? (x[j] - this.mean[j]) / this.scale[j] : 1.0;
    return out;
  }

  /**
   * One static-dwell laser sample → exact-RLS on the table error. Reports the
   * learned backlash `B = 2·|θ_dir/scale_dir|`.
   * @param {number} calPos @param {number} calDir +1/−1 approach direction
   * @param {number} calErr table−target from the interferometer
   * @param {number} temp @param {number} [lam]
   */
  calibrate(calPos, calDir, calErr, temp, lam = 1.0) {
    const xs = this._std(axisFeat(calPos, temp, calDir, this.lead));
    rls(this.theta, this.P, new Block(10, 1, xs), calErr, lam, 0.0, false);
    this.backlashLearned = 2.0 * Math.abs(this.theta.m[9] / this.scale[9]);
    return this.backlashLearned;
  }

  /**
   * Position correction to subtract from the position command.
   * @param {number} pos @param {number} dir @param {number} temp
   * @param {object} [opts]
   * @param {boolean} [opts.enablePitch] @param {boolean} [opts.enableBacklash]
   * @param {number} [opts.maxCorrection] magnitude bound (0 = off)
   * @param {number} [opts.corrRateMax] slew bound (0 = off) @param {number} [opts.dt]
   * @returns {number}
   */
  run(pos, dir, temp, opts = {}) {
    const { enablePitch = true, enableBacklash = true, maxCorrection = 0.0, corrRateMax = 0.0, dt = 0.0 } = opts;
    const xs = this._std(axisFeat(pos, temp, dir, this.lead));
    let pitch = 0.0, back = 0.0;
    for (let i = 0; i <= 8; i++) pitch += this.theta.m[i] * xs[i];
    back = this.theta.m[9] * xs[9];
    let corr = 0.0;
    if (enablePitch) corr -= pitch;
    if (enableBacklash) corr -= back;
    if (maxCorrection > 0.0) { if (corr > maxCorrection) corr = maxCorrection; else if (corr < -maxCorrection) corr = -maxCorrection; }
    if (corrRateMax > 0.0) {
      const dm = corrRateMax * dt;
      if (corr > this.lastCorr + dm) corr = this.lastCorr + dm;
      else if (corr < this.lastCorr - dm) corr = this.lastCorr - dm;
    }
    this.lastCorr = corr;
    return corr;
  }
}
