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

// A DIRECTION BIT IS THE PURPOSE-BUILT ANSWER TO BACKLASH, and the library already
// knew it: `AxisComp` fits `err = pitch(pos,T) + (B/2)*dir` from static laser
// dwells taken in BOTH directions, with `dir` an explicit feature. Lost motion is
// a function of which way you came from, so a signal that says which way you came
// from turns a path-dependent target into a memoryless one, where a lag window has
// to infer the same thing from the shape of recent history.
//
// MEASURED, AND IT SHIPS OFF, WHICH IS NOT WHERE I EXPECTED TO LAND:
//   memoryless, no bit    0.6691 -> 0.8598 under backlash   (+28.5%)
//   memoryless + BIT      0.7392 -> 0.7252                  (-1.9%)
//   lag 6, no bit         0.5370 -> 0.5884                  (+9.6%)
//   lag 6 + bit           0.5319 -> 0.6938                  (+30.4%)
// The bit IMMUNISES a memoryless model completely -- backlash costs it nothing at
// all, which is a clean confirmation of AxisComp's design. But with a lag window
// it makes things WORSE, and the reason generalises: a LATCHED SIGNAL IS NEARLY
// CONSTANT ACROSS A WINDOW, so its lags are almost collinear and add 207 features
// carrying information the first one already had. Variance with no signal. The
// shipped configuration has a lag window, so the bit is off by default and
// available for the memoryless case where it is the whole answer.
export const NUM_SIGNALS = 6;

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
                features = 'universal', initVariance = 100, seed = 7,
                directionBit = false, directional = false, lam = 1.0,
                lead = 0, extra = null, nExtra = 0, reaction = false } = {}) {
    this.sampleEvery = sampleEvery;
    // EXTRA SIGNALS THE CALLER CAN SUPPLY, and the one worth supplying is the
    // COMMAND. Every signal below is MEASURED, and during a dwell the machine is
    // parked -- speed zero, acceleration zero, pose fixed, torque just the static
    // gravity term -- so every input goes flat while the tip is still ringing. A
    // model with flat inputs must produce a flat output, which is exactly what a
    // held estimate against a moving truth looks like. The commanded trajectory is
    // known exactly and costs nothing to route.
    this.extra = extra;
    this.nExtra = extra ? nExtra : 0;
    // THE REACTION IS THE ONE MEASURED SIGNAL THAT SURVIVES A DWELL. Everything
    // else here goes flat when the machine is parked -- speed zero, acceleration
    // zero, pose fixed, commanded torque just the static gravity term -- while the
    // tip is still ringing, and a flat input must give a flat output. The link's
    // vibration pushes back through the gear teeth, so transmitted()/N is present
    // the whole time, muted by the ratio. A real drive's current loop has to supply
    // exactly that, so MEASURED current carries it while the demand does not.
    //
    // MEASURED, narrow window, against the same run without it: the estimate's
    // motion during the dwell goes 22% of the truth's to 46%, the overall nRMSE
    // 0.5305 -> 0.3663, and the trace gets 7.7x SMOOTHER (roughness 221x -> 28.8x
    // of the truth's own). That last one is the useful surprise: alpha_enc is a
    // first difference of speed, i.e. a high-pass, and it was the only dynamic
    // input the model had.
    //
    // AND THE MUTING COSTS NOTHING. Scoring the un-muted shaft torque instead gives
    // 0.3663 -- identical to four figures -- because the model standardises its
    // inputs and a constant 1/N vanishes into the weights. No transducer needed.
    this.reaction = reaction;
    // A FORECAST IS A SECOND TARGET OF THE SAME READOUT, not a second model. The
    // universal expansion is the expensive half and it is shared: target 0 is the
    // tip error NOW, target 1 the tip error `lead` samples ahead, and the only
    // difference between them is the delay at which features are paired with truth.
    // SoftSensor gained that pairing (opts.leads) for this.
    this.lead = lead;
    this.directionBit = directionBit;
    this.ns = (directionBit ? NUM_SIGNALS : NUM_SIGNALS - 1) + this.nExtra
      + (reaction ? 1 : 0);
    const base = this.ns * lag;
    let fmap = null, prior = null;
    if (features === 'universal') {
      // The same structured prior the NGRC soft sensor ships: linear terms trusted,
      // quadratic and random features ridged hard. Without it the shape-carrying
      // features are regularised out of existence.
      fmap = universalMap(base, 24, 24, seed);
      prior = universalPrior(base, 24, 24, { lin: 100, quad: 1, rand: 1 });
    }
    this.ss = new SoftSensor(this.ns, lead > 0 ? 2 : 1, lag, stride, warmup,
      { ...(fmap ? { fmap, prior } : { initVariance }), lam, directional,
        leads: lead > 0 ? [0, lead] : null });
    this.mode = 'calibrating';
    this.trained = 0;
    this._k = 0;
    this._prevOmega = 0;
    this._dir = 0;
    this._dirThreshold = 1e-9;
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
    const sig = [tauCmd, enc.speed, alpha, Math.sin(enc.angle), Math.cos(enc.angle)];
    // WHICH WAY THE DRIVE LAST MOVED. Latched rather than instantaneous: a raw
    // sign() chatters through every zero crossing of the velocity, and what
    // backlash depends on is the direction of the last real motion, not the sign
    // of a number that happens to be near zero.
    if (Math.abs(enc.speed) > this._dirThreshold) this._dir = Math.sign(enc.speed);
    if (this.directionBit) sig.push(this._dir);
    // Motor-side, i.e. what the drive's own current measurement carries.
    if (this.reaction) sig.push(arm.joint.transmitted() / arm.joint.N);
    if (this.extra) for (const v of this.extra(arm, tauCmd, dt)) sig.push(v);
    return sig;
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
   *
   * NEGATIVE, for the reason FlexArm.tipError() spells out: theta_link =
   * theta_encoder - windup, so wind-up puts the tip BEHIND the encoder. The
   * baseline had the same sign error as the truth it was scored against, which is
   * exactly why neither showed it -- two wrongs that agree are indistinguishable
   * from two rights until something outside the pair is compared.
   */
  static complianceEstimate({ alphaEnc, inertia, stiffness, arm }) {
    return -((inertia * alphaEnc) / stiffness) * arm;
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
    return this.observe(arm, profile.torqueAt(this._k), dt);
  }

  /**
   * The same reading WITHOUT stepping, for a caller that drives the plant itself --
   * a page running a position servo, say, whose torque comes from a control law
   * rather than from a profile. The contract the caller inherits is the one
   * sample() enforces internally: call this exactly every `sampleEvery` steps.
   *
   * THE CADENCE IS NOT NEGOTIABLE, and it is the mistake FlowSim's soft sensor
   * documents at length: the model's lag window is counted in SAMPLES, so a
   * drifting sample interval makes the window span a different amount of time at
   * every setting, and a frame loop free to step a partial interval pairs a
   * reading with a plant state that is somewhere between boundaries.
   */
  observe(arm, tauCmd, dt = 1) {
    const sig = this.signals(arm, tauCmd, dt);
    this.lastSignals = sig;
    this.ss.push(sig);
    if (!this.ss.ready()) return null;

    if (this.mode === 'calibrating') {
      this.ss.warmupStep(this.ss._raw());
      if (this.ss.frozen) this.mode = 'training';
      return null;
    }
    const out = this.ss.estimate();
    // The forecast is ABOUT the sample `lead` ahead of this one. It is exposed
    // rather than returned so the caller has to decide where to put it on a time
    // axis -- drawing a forecast where it was ISSUED is the mistake FlowSim's
    // probe chart documents at length, and it makes a perfect forecast look wrong.
    this.forecast = this.lead > 0 ? out[1] : null;
    return out[0];
  }

  /** One training step against the tracker's truth. Refused once locked. */
  train(truth) {
    if (this.mode !== 'training') return false;
    this.ss.adapt(this.lead > 0 ? [truth, truth] : [truth]);
    this.trained++;
    return true;
  }

  /** Freeze the readout: the tracker goes away and the machine runs on. */
  lock() { this.mode = 'estimating'; return this; }

  status() {
    return { mode: this.mode, trained: this.trained, features: this.ss.nf,
      frozen: this.ss.frozen, steps: this._k, lead: this.lead };
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
