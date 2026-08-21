// Estimating the tip error from motor-side signals alone.
//
// THE UNOBSERVABILITY IS PHYSICAL, NOT CONSTRUCTED. The encoder sits on the motor
// side of the gearbox and reads theta_m/N, so it is structurally blind to
// everything downstream of the gear teeth: lost motion, joint wind-up, link
// bending. Position and following error both look perfect while the tip is
// somewhere else. That is why a robot's accuracy and its repeatability are
// different numbers, and it is what this estimator is for.
//
// THE LASER TRACKER IS A COMMISSIONING INSTRUMENT, NOT A PRODUCTION ONE, which is
// the lifecycle FlowSim's soft sensor already implements and which transplants
// rather than gets rebuilt: calibrate the standardisation on a representative
// window, train against truth while the tracker is set up, LOCK, and run for the
// rest of the machine's life on motor-side signals alone. The interesting number
// is therefore always the LOCKED one -- a model still adapting is being told the
// answer.
//
// SIGNALS, and why each is one a real controller already has:
//   tau_cmd      commanded motor torque (current), known exactly
//   omega_enc    encoder speed, theta_m/N differentiated
//   alpha_enc    encoder acceleration -- the inertial torque proxy, and the one
//                the static-compliance baseline below is built from
//   sin, cos     of the encoder ANGLE rather than the angle itself. A raw angle
//                grows without bound and standardising it against a frozen window
//                is meaningless the moment the machine leaves that window; the
//                pair is bounded and carries the pose, which is what a
//                gravity-loaded arm's compliance actually depends on.

import { SoftSensor } from '../ngrc/softsensor.js';
import { universalMap } from '../ngrc/feature_map.js';
import { universalPrior } from '../ngrc/universal.js';

export const NUM_SIGNALS = 5;

/**
 * A repeating trapezoidal move, alternating direction.
 *
 * ALTERNATING IS NOT DECORATION: backlash and friction are direction-dependent, so
 * a one-way move never crosses the dead band and a model trained on it has never
 * seen the thing that makes the plant path-dependent.
 */
export class MoveProfile {
  constructor({ accelSteps = 400, cruiseSteps = 600, dwellSteps = 300, torque = 2e-3 } = {}) {
    Object.assign(this, { accelSteps, cruiseSteps, dwellSteps, torque });
    this.period = 2 * (2 * accelSteps + cruiseSteps + dwellSteps);
  }

  /** Commanded motor torque at step k. */
  torqueAt(k) {
    const half = this.period / 2;
    const dir = (k % this.period) < half ? +1 : -1;
    const t = k % half;
    const { accelSteps: A, cruiseSteps: C } = this;
    if (t < A) return dir * this.torque;                 // accelerate
    if (t < A + C) return 0;                             // cruise
    if (t < 2 * A + C) return -dir * this.torque;        // decelerate
    return 0;                                            // dwell
  }
}

/**
 * The tip-error estimator and the baselines it has to beat.
 *
 * @param {object} o
 * @param {number} o.sampleEvery  solver steps between samples. THE MODEL'S LAG
 *   WINDOW IS COUNTED IN SAMPLES, so this sets how much TIME the window spans --
 *   and it must not be the same knob as anything a user would move for viewing
 *   reasons, which is the mistake FlowSim's soft sensor documents at length.
 * @param {number} o.lag, o.stride  the history window
 * @param {number} o.warmup  samples used to freeze the standardisation
 */
export class TipSensor {
  constructor({ sampleEvery = 10, lag = 6, stride = 2, warmup = 300,
                features = 'universal', initVariance = 100, seed = 7 } = {}) {
    this.sampleEvery = sampleEvery;
    const base = NUM_SIGNALS * lag;
    let fmap = null, prior = null;
    if (features === 'universal') {
      // The same structured prior the NGRC soft sensor ships: linear terms trusted,
      // quadratic and random features ridged hard. Without it the shape-carrying
      // features are regularised out of existence.
      fmap = universalMap(base, 24, 24, seed);
      prior = universalPrior(base, 24, 24, { lin: 100, quad: 1, rand: 1 });
    }
    this.ss = new SoftSensor(NUM_SIGNALS, 1, lag, stride, warmup,
      fmap ? { fmap, prior } : { initVariance });
    this.mode = 'calibrating';
    this.trained = 0;
    this._k = 0;
    this._prevOmega = 0;
    this.lastSignals = null;
  }

  /**
   * Motor-side signals only. The link angle and the tip are NOT in here.
   *
   * THE ACCELERATION IS PER SOLVER STEP, NOT PER SAMPLE. Differencing the encoder
   * speed between samples gives a change over `sampleEvery` steps, and handing
   * that to a physical formula expecting rad/step^2 is wrong by exactly that
   * factor. The learner would not have noticed -- it standardises its inputs and a
   * constant scale vanishes into the weights -- but the compliance BASELINE is
   * built from the same number and does not, so it read ten times the true
   * wind-up and scored nRMSE 19 against a target it should track well. A baseline
   * that loses for a units reason is a straw man, which is the one thing a
   * baseline must not be.
   */
  signals(arm, tauCmd, dt = 1) {
    const enc = arm.encoder();
    const alpha = (enc.speed - this._prevOmega) / (this.sampleEvery * dt);
    this._prevOmega = enc.speed;
    return [tauCmd, enc.speed, alpha, Math.sin(enc.angle), Math.cos(enc.angle)];
  }

  /**
   * THE STATIC-COMPLIANCE BASELINE, and it is the fair one rather than a straw
   * man: it is what a good engineer builds when they know the gearbox stiffness
   * and the link's inertia. The inertial torque is inferred from the ENCODER's
   * acceleration -- the only acceleration available in production -- and the tip
   * offset that torque implies is tau/K times the arm.
   *
   * It captures the wind-up TILT exactly in steady state and knows nothing at all
   * about the link's bending, which is the gap the learner has to fill.
   */
  static complianceEstimate({ alphaEnc, inertia, stiffness, arm }) {
    return ((inertia * alphaEnc) / stiffness) * arm;
  }

  /**
   * Drive one sample boundary: advance the arm `sampleEvery` steps, then push the
   * signals and either calibrate, train, or estimate.
   *
   * THE ARM IS STEPPED IN WHOLE SAMPLE INTERVALS so a reading is never taken with
   * the plant part-way between boundaries. FlowSim's soft sensor had to learn this
   * the hard way: the model's window is counted in samples, so a drifting sample
   * interval makes the window span a different amount of time at every setting.
   */
  sample(arm, profile, dt = 1) {
    for (let i = 0; i < this.sampleEvery; i++) {
      arm.step(profile.torqueAt(this._k), dt);
      this._k++;
    }
    const tauCmd = profile.torqueAt(this._k);
    const sig = this.signals(arm, tauCmd, dt);
    this.lastSignals = sig;
    this.ss.push(sig);
    if (!this.ss.ready()) return null;

    if (this.mode === 'calibrating') {
      this.ss.warmupStep(this.ss._raw());
      if (this.ss.frozen) this.mode = 'training';
      return null;
    }
    return this.ss.estimate()[0];
  }

  /** One training step against the tracker's truth. Refused once locked. */
  train(truth) {
    if (this.mode !== 'training') return false;
    this.ss.adapt([truth]);
    this.trained++;
    return true;
  }

  /** Freeze the readout: the tracker goes away and the machine runs on. */
  lock() { this.mode = 'estimating'; return this; }

  status() {
    return { mode: this.mode, trained: this.trained, features: this.ss.nf,
      frozen: this.ss.frozen, steps: this._k };
  }
}

/** nRMSE against the truth's own spread: 1.0 is "no better than the mean". */
export function nrmse(pred, truth) {
  const n = truth.length;
  let mu = 0; for (const t of truth) mu += t; mu /= n;
  let se = 0, sv = 0;
  for (let i = 0; i < n; i++) { se += (pred[i] - truth[i]) ** 2; sv += (truth[i] - mu) ** 2; }
  return Math.sqrt(se / Math.max(sv, 1e-300));
}
