/**
 * @file THE HONEST HEAD-TO-HEAD: a properly commissioned CONVENTIONAL controller, and
 * three learned layers switched on over it one at a time.
 *
 * Every headline number this project has published for a learned correction was measured
 * against an open loop with no feedforward at all -- which is why, asked what any of it
 * would do on a real robot, the only honest answer was that the baseline was wrong. The
 * baseline here is what a good engineer actually ships: computed torque from the arm's own
 * rigid model evaluated at the command (M(q)a + C - G, including the reflected motor
 * inertia, which at ratio 100 is comparable to the whole link), a PD loop on the encoder,
 * and RobotComp's identified static compliance pre-distortion.
 *
 * ROBOTCOMP IS IN THE BASELINE, NOT IN THE LEARNED STACK. Per-joint stiffness compensation
 * is standard practice in robotic machining and it is a closed form; putting it with the
 * conventional machine makes the learned layers' job harder and the remaining claim honest.
 * Measured alone on this arm it is worth 1.01-1.49x, which is baseline territory.
 *
 * THE THREE LAYERS, each independently switchable, so this is a FACTORIAL and not a ladder
 * -- which is the only way to tell COMPLEMENTARY from REDUNDANT:
 *
 *   T  torque trim        an additive joint torque (the anti-slosh HYBRID: shipped
 *                         controller untouched, trim bolted on)
 *   P  position augment   pre-distortion of the commanded angle (TipCompensator's domain)
 *   F  feedrate governor  the planner slowed ahead of a predicted excursion
 *
 * PREDICTION ON RECORD BEFORE THE MEASUREMENT: P beats T on this plant, because the arm's
 * error is dominated by the unobservable term (0.253 following against 1.232 wind-up and
 * bending at the soft end) and only a POSITION offset reaches it -- adding motor torque
 * changes how well the motor tracks its own reference, not where the tool lands. T should
 * close the gap as the gearbox stiffens and friction and cogging become the residue. F
 * should be complementary to both, because it is the only one aimed at the OSCILLATION and
 * the only one that does not act through the compliance.
 *
 * AND THE BASELINE'S ABSOLUTE NUMBER IS REPORTED BESIDE EVERY RATIO. If good conventional
 * control reaches 0.17 and a learner takes it to 0.14, that is an honest 1.2x, and it is a
 * far more useful thing to know than a 4x against nothing.
 */
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { roundedRect } from '../../lib/flexisim/toolpath.js';
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';
import { ChainSensor } from '../../lib/flexisim/chainsensor.js';
import { ResidualTrim } from '../../lib/flexisim/residual.js';
import { FeedGovernor } from '../../lib/flexisim/feedgov.js';
import { RobotComp } from '../../lib/ngrc/robotcomp.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: conventional control, and what a learner adds on top\n');

const H = 4, nu = 0.3, rho = 1, CLAMP = 3, RATIO = 100, g = 2e-6;
const LEN1 = 14, LEN2 = 10, SAMPLE = 10;
const FULL = process.env.SUITE === 'full';

async function machine({ K, E }) {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E, nu, rho,
    damping: 3e-3 });
  const l1 = await mk(LEN1), l2 = await mk(LEN2);
  const jt = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: jt(massProperties(l1)), link1: l1,
    joint2: jt(massProperties(l2)), link2: l2, gravityWorld: [0, -g, 0], dt: 1 });
  return { arm, l1, l2 };
}

/**
 * COMMISSION THE CONVENTIONAL MACHINE'S COMPLIANCE, from HELD static poses -- which is
 * where a static constant is identifiable and nowhere else. The gearbox transmits
 * K*d + C*d_dot, and during a move the damper carries much of the torque, so a static fit
 * to moving data returns a blend of a stiffness and a damping: neither of them.
 */
function commissionComp(arm, servo) {
  const rc = new RobotComp(2, 2, 1e6);
  for (const [a, b] of [[0.10, 0.30], [-0.05, 0.55], [0.25, 0.15], [0.00, 0.42]]) {
    arm.setPose(a, b);
    const refs = [{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }];
    for (let i = 0; i < 4000; i++) { const t = servo.torques(refs); arm.step(t[0], t[1], 1); }
    const tg = servo.jointTorques(refs);
    // The Jacobian makes g = J^T W equal the joint torques, so the identity is the honest
    // choice here: the wrench IS the joint torque, and inventing a Cartesian one would be
    // a second model of the same thing.
    const jac = [[1, 0], [0, 1]];
    rc.calibrate(jac, tg, [arm.j1.windup(), arm.j2.windup()], 1.0);
  }
  return rc;
}

/**
 * `live` -- TRAIN WITH THE INJECTIONS ACTIVE instead of training, locking, and only then
 * switching them on. The first version did the latter, which is this project's oldest
 * failure in a new costume: a model fitted in one regime, deployed into another it then
 * CHANGED itself. It separates two explanations that were tangled together -- a
 * distribution mismatch, which training through the injection fixes, and a closed signal
 * path carrying a 1020-step delayed estimate, which it cannot.
 */
async function run({ K, E, T, P, F, nTrain = 900, laps = 3, govTol = 0.6, live = false }) {
  const { arm, l1, l2 } = await machine({ K, E });
  const servo = new ChainServo({ arm, bandwidth: 2e-3 });
  const rc = commissionComp(arm, servo);

  const feed = 4e-3;
  const path = roundedRect({ w: 8, h: 8, r: 1.5, centre: [14, 1], feed,
    accel: 4e-5, cornerDt: 40, closed: true });
  const lap = Math.ceil(path.lap);
  const [q10, q20] = arm.ik(path.at(0).x, path.at(0).y, true);
  arm.setPose(q10, q20);
  for (let i = 0; i < 4000; i++) {
    const t = servo.torques([{ theta: q10, omega: 0, alpha: 0 },
      { theta: q20, omega: 0, alpha: 0 }]);
    arm.step(t[0], t[1], 1);
  }

  // THE WINDOW HAS TO REACH THE RING. lag 18 x stride 6 x 10 = 1020 steps against the
  // chain's ~860-step bending mode. The first run here used lag 4 x stride 2 = 60 steps,
  // which is the configuration chainsensor.js documents in capitals as WORSE THAN
  // PREDICTING THE MEAN -- and the position layer duly measured worse than the baseline it
  // was correcting. The sensor was crippled, not the idea.
  const cs = new ChainSensor({ joints: [0, 1], sampleEvery: SAMPLE, lag: 18, stride: 6,
    lead: F ? 15 : 0 });
  // LIMITS ARE NOT OPTIONAL ON THE TORQUE DOMAIN. Its conversion divides by the identified
  // compliance, so a small c makes a large torque, and the first run went non-finite for
  // exactly that reason. Sized against what the conventional machine already commands.
  const tauScale = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const trimT = new ResidualTrim({ domain: 'torque', joints: 2, gain: T ? 1 : 0,
    magMax: 0.5 * tauScale, rateMax: 0.02 * tauScale });
  const trimP = new ResidualTrim({ domain: 'position', joints: 2, gain: P ? 1 : 0,
    magMax: 0.05, rateMax: 2e-4 });
  // THE TOLERANCE IS SIZED FROM THE MACHINE'S OWN ERROR, not chosen. Set below the
  // baseline's contour rms it saturates to the floor everywhere and buys accuracy by
  // simply running slow -- which the first run did, at 2.35x the cycle time.
  const gov = new FeedGovernor({ tolerance: govTol, deadband: 0.45 * govTol, floor: 0.5,
    rateMax: 0.004 });

  const score = new ContourScore({ joints: 2 });
  let s = 0, tau = [0, 0], est = 0, fc = 0, trained = 0;
  const estE = [], estT = [];
  const scored = { n: 0 };
  for (let l = 0; l < laps; l++) {
    for (let step = 0; step < lap; step++) {
      // THE GOVERNOR ACTS ON THE PLANNER: it advances the path parameter more slowly, so
      // the geometry is untouched and only the SCHEDULE changes. That is what keeps it
      // clear of the compliance entirely.
      const ov = F ? gov.override : 1;
      s += ov;
      const cmd = path.at(s);
      const [c1, c2] = arm.ik(cmd.x, cmd.y, true);
      const r = arm.ikRates(c1, c2, cmd.vx * ov, cmd.vy * ov, cmd.ax * ov * ov, cmd.ay * ov * ov);
      // THE PATH NORMAL is the direction a contour error lives in, so it is the direction
      // a correction has to act along. Signed, so the correction has a sense.
      const sp = Math.hypot(cmd.vx, cmd.vy) || 1;
      const nx = -cmd.vy / sp, ny = cmd.vx / sp;
      let dq = [0, 0], dtau = [0, 0];
      // With `live`, the correction acts from `warmN` onward while the model is STILL
      // TRAINING, so every pair it learns from is a pair taken with the loop closed.
      const warmN = live ? Math.round(0.35 * nTrain) : nTrain;
      if ((P || T) && trained >= warmN) {
        const J = arm.jacobian(c1, c2);
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        if (Math.abs(det) > 1e-12) {
          // Move the tool by -est along the normal: dq = J^-1 (-est * n).
          const wx = -est * nx, wy = -est * ny;
          const iq = [(J[1][1] * wx - J[0][1] * wy) / det, (-J[1][0] * wx + J[0][0] * wy) / det];
          if (P) dq = trimP.apply(iq);
          if (T) {
            // The torque that HOLDS that deflection through the identified compliance:
            // dq_j = c_j * g_j, so g_j = dq_j / c_j. Same model as the pre-distortion,
            // inverted -- which is what makes the two domains comparable rather than two
            // different corrections wearing the same name.
            const c = rc.compliance;
            dtau = trimT.apply([c[0] ? iq[0] / c[0] : 0, c[1] ? iq[1] / c[1] : 0]);
          }
        }
      }
      // BASELINE COMPLIANCE PRE-DISTORTION, always on: it is part of the conventional
      // machine, not part of what is being switched.
      const tgc = servo.jointTorques([{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }]);
      const ff = rc.feedforward([[1, 0], [0, 1]], tgc, { enableToolff: false });
      tau = servo.torques([
        { theta: c1 + ff.dq[0] + dq[0], omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2 + ff.dq[1] + dq[1], omega: r.dq[1], alpha: r.ddq[1] }]);
      arm.step(tau[0] + dtau[0], tau[1] + dtau[1], 1);

      const d = decompose(path, arm.toolXY(), cmd);
      if ((step % SAMPLE) === 0) {
        const y = cs.observe(arm, tau, 1);
        if (y !== null) {
          if (cs.trained < nTrain) {
            cs.train(d.contour); trained = cs.trained;
            // The estimate is needed DURING training in the live arrangement, because that
            // is what the injection is driven from.
            if (live) { est = y; fc = cs.forecast ?? y; }
          } else {
            if (cs.mode === 'training') cs.lock();
            est = y; fc = cs.forecast ?? y;
            trained = cs.trained;
          }
        }
      }
      if (F && trained >= nTrain) gov.step(fc);
      if (l === laps - 1) { score.step(d.contour, d.lag, tau, [arm.j1.wM, arm.j2.wM]); scored.n++;
        // IS THE ESTIMATE DRIVING THESE LAYERS ANY GOOD? A correction can only be as good
        // as what it is told, and a layer that fails on a bad estimate is not evidence
        // about the layer.
        if ((step % SAMPLE) === 0 && trained >= nTrain) { estE.push(est); estT.push(d.contour); } }
    }
  }
  await l1.destroy(); await l2.destroy();
  const rep = score.report();
  const m = estT.length ? estT.reduce((a, b) => a + b, 0) / estT.length : 0;
  let se = 0, sv = 0;
  for (let i = 0; i < estT.length; i++) { se += (estE[i] - estT[i]) ** 2; sv += (estT[i] - m) ** 2; }
  const estNrmse = sv > 0 ? Math.sqrt(se / sv) : NaN;
  return { contour: rep.contourRms, bias: rep.contourBias, osc: rep.contourOsc, estNrmse,
    time: F ? gov.timeCost() : 1, peakT: trimT.peak, peakP: trimP.peak,
    gov: gov.status() };
}

const CASES = FULL ? [{ K: 1, E: 0.06, tag: 'soft ' }, { K: 16, E: 0.15, tag: 'stiff' }]
  : [{ K: 1, E: 0.06, tag: 'soft ' }];

for (const c of CASES) {
  const base = await run({ ...c, T: 0, P: 0, F: 0 });
  // The governor is given the baseline's OWN error scale, so it acts where the machine is
  // actually near its limit rather than everywhere.
  const gt = 1.4 * base.contour;
  const rT = await run({ ...c, T: 1, P: 0, F: 0, govTol: gt });
  const rP = await run({ ...c, T: 0, P: 1, F: 0, govTol: gt });
  const rF = await run({ ...c, T: 0, P: 0, F: 1, govTol: gt });
  const rPF = await run({ ...c, T: 0, P: 1, F: 1, govTol: gt });
  const rTPF = await run({ ...c, T: 1, P: 1, F: 1, govTol: gt });
  const rPlive = await run({ ...c, T: 0, P: 1, F: 0, govTol: gt, live: true });
  const rTlive = await run({ ...c, T: 1, P: 0, F: 0, govTol: gt, live: true });
  const x = (r) => (base.contour / r.contour).toFixed(2);
  console.log(`  [${c.tag} K ${c.K} E ${c.E}]  conventional baseline contour `
    + `${base.contour.toExponential(3)}  (bias ${base.bias.toExponential(2)} osc `
    + `${base.osc.toExponential(2)})`);
  console.log(`      + T torque      ${rT.contour.toExponential(3)}  ${x(rT)}x`);
  console.log(`      + P position    ${rP.contour.toExponential(3)}  ${x(rP)}x   `
    + `estimate nRMSE ${Number.isFinite(rP.estNrmse) ? rP.estNrmse.toFixed(3) : 'n/a'}`);
  console.log(`      + F feedrate    ${rF.contour.toExponential(3)}  ${x(rF)}x   `
    + `time ${rF.time.toFixed(3)}x  (min override ${rF.gov.min.toFixed(2)})`);
  console.log(`      + P and F       ${rPF.contour.toExponential(3)}  ${x(rPF)}x   `
    + `time ${rPF.time.toFixed(3)}x`);
  console.log(`      + T P and F     ${rTPF.contour.toExponential(3)}  ${x(rTPF)}x   `
    + `time ${rTPF.time.toFixed(3)}x`);
  console.log(`      + P trained LIVE (injection active while learning) `
    + `${rPlive.contour.toExponential(3)}  ${x(rPlive)}x   estimate nRMSE `
    + `${Number.isFinite(rPlive.estNrmse) ? rPlive.estNrmse.toFixed(3) : 'n/a'}`);
  console.log(`      + T trained LIVE  ${rTlive.contour.toExponential(3)}  ${x(rTlive)}x`);
  if (c.tag.trim() === 'soft') {
    check('the conventional machine is a real baseline, not an open loop',
      base.contour > 0 && Number.isFinite(base.contour), `${base.contour}`);
    check('a learned layer improves on properly commissioned conventional control',
      Math.min(rP.contour, rT.contour, rF.contour) < base.contour,
      `best ${Math.min(rP.contour, rT.contour, rF.contour).toExponential(3)} vs `
      + `${base.contour.toExponential(3)}`);
    // MY PREDICTION WAS THAT POSITION WOULD BEAT TORQUE. It did not -- 5.443e-1 against
    // 5.292e-1, within 3% of each other and BOTH WORSE than the baseline they correct. The
    // domain was never the question, and pinning it would pin the wrong thing.
    //
    // WHAT THE MEASUREMENT ACTUALLY SAYS, and the estimate quality is what separates the
    // two explanations: the readout scores nRMSE ~0.32, three times better than predicting
    // the mean, so these layers are not failing on a bad estimate. They fail because a
    // correction driven by a LIVE reading of the current error closes the signal path --
    // plant to sensor to correction to plant -- and the reading carries the lag of a
    // 1020-step window. That is a delayed loop at unity gain, whatever domain the output
    // is injected into.
    //
    // AND IT IS THE DISTINCTION THIS PROJECT'S WORKING CORRECTIONS ALREADY RESPECT.
    // TipCompensator removes bias 273x and the pilot reaches 4.22x, and BOTH evaluate a
    // model at the COMMAND -- neither reads the machine and reacts. The rule is not
    // feedforward-versus-feedback in the actuation domain; it is whether the signal path is
    // open. So this is asserted the way round the evidence supports.
    check('a correction driven by a LIVE error reading does not beat the conventional '
      + 'machine, at either injection domain',
      rP.contour > base.contour && rT.contour > base.contour,
      `position ${rP.contour.toExponential(3)} / torque ${rT.contour.toExponential(3)} `
      + `vs baseline ${base.contour.toExponential(3)}`);
    check('…and not because the estimate is poor, which is what separates an architecture '
      + 'result from a sensor one',
      rP.estNrmse < 0.5, `estimate nRMSE ${rP.estNrmse.toFixed(3)}`);
    // TRAINING WITH THE INJECTION ACTIVE IS THE RIGHT TOOLING AND IT IS NOT THE
    // CONSTRAINT, which is the pair of facts that separates a fit problem from a loop one.
    // The first arrangement trained the model, locked it, and THEN switched the injection
    // on -- a model fitted in one regime and deployed into another it proceeded to change,
    // which is this project's oldest failure. Fixing it works exactly as intended: the
    // readout goes 0.322 -> 0.177, nearly twice as good.
    //
    // AND THE MACHINE DOES NOT MOVE, 0.81x -> 0.82x. If estimate quality had been what
    // limited these layers, a 1.8x better estimate had to show up in the contour. It did
    // not. That is the second time in this session that better information failed to buy a
    // better machine -- the first was an ORACLE, the true load angle, which made a servo
    // loop worse. The constraint is the loop: a reading carrying a 1020-step window's lag,
    // applied at unity gain into a path that closes back on itself. No fit removes a delay.
    check('training WITH the injection active makes the estimate markedly better',
      rPlive.estNrmse < 0.75 * rP.estNrmse,
      `${rP.estNrmse.toFixed(3)} → ${rPlive.estNrmse.toFixed(3)}`);
    check('…and the machine is NOT better for it, so the limit is the loop and not the fit',
      Math.abs(rPlive.contour / rP.contour - 1) < 0.1 && rPlive.contour > base.contour,
      `${rP.contour.toExponential(3)} → ${rPlive.contour.toExponential(3)} against a `
      + `baseline of ${base.contour.toExponential(3)}`);

    check('the predictive feedrate governor IS worth its place, acting on the forecast and '
      + 'on the planner rather than on the loop',
      rF.contour < base.contour, `${rF.contour.toExponential(3)} vs ${base.contour.toExponential(3)}`);
    check('the feedrate governor reports its cycle-time cost rather than hiding it',
      rF.time >= 1 && Number.isFinite(rF.time), `${rF.time}`);
  }
}

console.log(failed ? `\nhybrid: ${failed} check(s) FAILED\n` : '\nhybrid: all checks passed\n');
process.exit(failed ? 1 : 0);
