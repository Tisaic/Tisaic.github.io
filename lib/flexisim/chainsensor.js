// THE TOOL ERROR ON A CHAIN, AND THE QUESTION A CHAIN MAKES ASKABLE.
//
// The single-joint soft sensor (tipsensor.js) had one obvious set of inputs: that
// joint's own signals, because there were no others. A chain forces a choice, and
// the choice is exactly the architecture question a real controller faces --
//
//   PER-JOINT: each axis estimates its own contribution from its own signals. It
//        is what a distributed drive naturally supports, it needs no cross-axis
//        wiring, and every servo vendor's compensation package looks like this.
//   WHOLE-ARM: one model reads every axis. It needs the signals gathered in one
//        place, which on a real machine is a real cost.
//
// AND THE PHYSICS SAYS IN ADVANCE WHICH MUST WIN, WHICH IS WHAT MAKES IT A TEST
// RATHER THAN A SWEEP. The elbow's gearbox torque is M21*alpha1 + M22*alpha2, and
// with the elbow holding still the first term is measured 14x the second -- so
// most of what winds the elbow up is the SHOULDER'S acceleration, a quantity that
// simply does not appear in the elbow's own signals. A per-joint estimator is not
// merely less accurate; it is blind to the dominant term by construction.
//
// SIGNALS PER JOINT, all of them things a real controller already has:
//   tau_cmd    commanded motor torque (current), known exactly
//   omega_enc  encoder speed
//   alpha_enc  encoder acceleration, the inertial-torque proxy
//   sin, cos   of the encoder ANGLE rather than the angle itself -- bounded, and
//              carrying the pose, which is what a gravity-loaded arm's compliance
//              and what M(q) both depend on

import { SoftSensor } from '../ngrc/softsensor.js';
import { universalMap } from '../ngrc/feature_map.js';
import { universalPrior } from '../ngrc/universal.js';

export const SIGNALS_PER_JOINT = 5;

export class ChainSensor {
  /**
   * @param {object} o
   * @param {number[]} [o.joints] which joints' signals the model may read.
   *   [0, 1] is the whole-arm model; [1] is the per-joint estimator on the elbow.
   * @param {number} [o.sampleEvery] solver steps between samples. THE MODEL'S LAG
   *   WINDOW IS COUNTED IN SAMPLES, so this sets how much TIME it spans -- and it
   *   must not be the same knob as anything a user moves for viewing reasons.
   * @param {number} [o.lead] forecast lead in samples, 0 for none.
   */
  constructor({ joints = [0, 1], sampleEvery = 10, lag = 6, stride = 2, warmup = 200,
                features = 'universal', initVariance = 100, seed = 11, lam = 1.0,
                lead = 0 } = {}) {
    this.joints = joints.slice();
    this.sampleEvery = sampleEvery;
    this.lead = lead;
    this.ns = this.joints.length * SIGNALS_PER_JOINT;
    const base = this.ns * lag;
    let fmap = null, prior = null;
    if (features === 'universal') {
      // The same structured prior the NGRC soft sensor ships: linear terms trusted,
      // quadratic and random features ridged hard, or the shape-carrying features
      // are regularised out of existence.
      fmap = universalMap(base, 24, 24, seed);
      prior = universalPrior(base, 24, 24, { lin: 100, quad: 1, rand: 1 });
    }
    this.ss = new SoftSensor(this.ns, lead > 0 ? 2 : 1, lag, stride, warmup,
      { ...(fmap ? { fmap, prior } : { initVariance }), lam,
        leads: lead > 0 ? [0, lead] : null });
    this.mode = 'calibrating';
    this.trained = 0;
    this._prevOmega = [0, 0];
    this.forecast = null;
    this.lastSignals = null;
  }

  /**
   * THE ACCELERATION IS PER SOLVER STEP, NOT PER SAMPLE. Differencing the encoder
   * speed between samples gives a change over `sampleEvery` steps; handing that to
   * a physical formula expecting rad/step^2 is wrong by exactly that factor. The
   * learner would not notice -- it standardises its inputs and a constant scale
   * vanishes into the weights -- but a physics baseline built from the same number
   * does, which is how the single-joint version shipped a straw man once.
   */
  signals(arm, tauCmd, dt = 1) {
    const enc = arm.encoders();
    const out = [];
    for (const j of this.joints) {
      const a = (enc[j].speed - this._prevOmega[j]) / (this.sampleEvery * dt);
      out.push(tauCmd[j], enc[j].speed, a, Math.sin(enc[j].angle), Math.cos(enc[j].angle));
    }
    // BOTH joints' previous speeds are updated whatever the model is allowed to
    // read, so a per-joint model and a whole-arm one see the SAME acceleration for
    // the joint they share. Updating only the selected ones would make the two
    // configurations differ in their arithmetic as well as in their inputs.
    for (let j = 0; j < 2; j++) this._prevOmega[j] = enc[j].speed;
    return out;
  }

  /**
   * THE PHYSICS BASELINE A GOOD ENGINEER BUILDS, and it is given the WHOLE mass
   * matrix -- it is not the straw man version of the per-joint idea. Knowing M(q),
   * the gearbox stiffnesses and the geometry, the wind-up at each joint is its
   * transmitted torque over its stiffness, and the tool moves by each wind-up times
   * its own lever arm. It knows nothing about either link's bending, which is the
   * gap the learner has to fill.
   *
   * The torques come from the ENCODERS' accelerations, which is all production has.
   */
  static rigidEstimate(arm, alphaEnc) {
    const M = arm.massMatrix(arm.encoders()[1].angle);
    const t1 = M[0][0] * alphaEnc[0] + M[0][1] * alphaEnc[1];
    const t2 = M[1][0] * alphaEnc[0] + M[1][1] * alphaEnc[1];
    return -((t1 / arm.j1.K0) * arm.toolRadius() + (t2 / arm.j2.K0) * arm.L2);
  }

  /**
   * One reading WITHOUT stepping: the caller drives the plant, and must call this
   * exactly every `sampleEvery` steps. A frame loop free to step a partial interval
   * pairs a reading with a plant state between boundaries.
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

  lock() { this.mode = 'estimating'; return this; }

  status() {
    return { mode: this.mode, trained: this.trained, features: this.ss.nf,
      frozen: this.ss.frozen, joints: this.joints.slice(), signals: this.ns,
      lead: this.lead };
  }
}
