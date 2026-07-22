/**
 * @file DropInEstimator — turnkey auto-embedding front-end over {@link Continuous}.
 * JavaScript port of `Testing/ngrc_ref/dropin.py` (PC reference for the ST
 * `TC_NGRC_DropIn`).
 *
 * Route the machine's raw signals, mark which are angular, and read future-state
 * predictions — no hand embedding, no plant model, no covariance/forgetting/
 * regularization knobs:
 *  - angular signals are auto-embedded to `[sin, cos]` (clean wrap handling) and
 *    mapped back with `atan2`;
 *  - auto-normalization (feed raw engineering units);
 *  - lean LINEAR NVAR by default;
 *  - at most ONE forgetting strategy (stationary `lam=1`, or directional
 *    forgetting when `adapt=true`).
 */
import { Continuous } from './continuous.js';

export class DropInEstimator {
  /**
   * @param {Array<'linear'|'angular'>} kinds per-routed-signal kind
   * @param {object} [opts]
   * @param {number} [opts.numInputs] exogenous inputs (NARX)
   * @param {number} [opts.lag] lag order
   * @param {boolean} [opts.adapt] track drift via directional forgetting (else stationary)
   * @param {number} [opts.initVariance]
   * @param {number} [opts.predictionSteps] `>1` enables closed-loop multi-step forecasting
   */
  constructor(kinds, opts = {}) {
    const { numInputs = 0, lag = 2, adapt = false, initVariance = 10.0, predictionSteps = 1 } = opts;
    if (!kinds.every((k) => k === 'linear' || k === 'angular')) throw new Error("kinds must be 'linear' or 'angular'");
    this.kinds = [...kinds];
    this.numInputs = numInputs;
    this.predictionSteps = predictionSteps;
    this.nvInt = kinds.reduce((s, k) => s + (k === 'angular' ? 2 : 1), 0);
    this.model = new Continuous(this.nvInt, lag, 1, true, {
      numInputs,
      predictionSteps,
      autoNormalize: true,
      initVariance,
      directionalForgetting: adapt,
      lam: adapt ? 0.99 : 1.0,
    });
  }

  /** @param {number[]} state raw signals @returns {number[]} embedded state */
  _expand(state) {
    const out = [];
    for (let i = 0; i < this.kinds.length; i++) {
      const x = state[i];
      if (this.kinds[i] === 'angular') { out.push(Math.sin(x), Math.cos(x)); } else { out.push(x); }
    }
    return out;
  }

  /**
   * Map the embedded forecast at roll-out `step` back to raw signal units.
   * @param {object} res @param {number} step @returns {number[]}
   */
  _mapback(res, step) {
    const pi = Array.from({ length: this.nvInt }, (_, v) => res.prediction[v][step]);
    const ext = [];
    let j = 0;
    for (const k of this.kinds) {
      if (k === 'angular') { ext.push(Math.atan2(pi[j], pi[j + 1])); j += 2; } else { ext.push(pi[j]); j += 1; }
    }
    return ext;
  }

  /**
   * One cycle. Returns the {@link Continuous} result plus `statePrediction` (next
   * state in raw units) and, when `predictionSteps>1`, `statePredictionH` (the
   * farthest-ahead state). Both present only once `warm`.
   * @param {number[]} state raw routed signals
   * @param {number[]|null} [inputs] exogenous inputs
   * @param {boolean} [predictOnly]
   * @returns {object}
   */
  step(state, inputs = null, predictOnly = false) {
    const res = this.model.step(this._expand(state), inputs, predictOnly);
    if (res.warm) {
      res.statePrediction = this._mapback(res, 0);
      if (this.predictionSteps > 1) res.statePredictionH = this._mapback(res, this.predictionSteps - 1);
    }
    return res;
  }
}
