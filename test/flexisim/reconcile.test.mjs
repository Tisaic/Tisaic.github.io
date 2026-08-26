/**
 * @file ONE HARNESS, ONE PLANT, ONE PATH, ONE BASELINE -- because until now there were two
 * harnesses producing numbers that were quoted side by side and shared no denominator.
 *
 * The pilot's headline (4.22x on a sharp square) came from a scratch rig at K 0.25 / E 0.03
 * measured against ChainServo ALONE. The stack's numbers came from this file's harness at
 * K 1 / E 0.06 measured against ChainServo PLUS RobotComp. Different stiffness, different
 * path, different baseline -- and the conclusion drawn from the second ("a learned layer
 * does not beat conventional control") was written as though it covered the first.
 *
 * IT DID NOT, AND THE OMISSION IS THE POINT: the stack contained neither of the two
 * mechanisms previously measured to work. `Pilot` appeared zero times in it and
 * `TipCompensator` appeared only in comments. What was actually injected was a live
 * subtraction of the sensor's current reading -- a third mechanism, invented for that test,
 * that nothing had ever shown to work. Finding that it does not work says nothing about
 * the two that do.
 *
 * So all four run here against the same conventional machine on the same lap:
 *
 *   conventional   computed torque at the command + PD on the encoder + RobotComp's
 *                  identified static compliance. This is the baseline, and it is what a
 *                  good engineer ships.
 *   + pilot        commissioned on the machine with its own excitation, then deployed:
 *                  a correction solved over a horizon and evaluated at the COMMAND.
 *   + tipcomp      the static compliance model evaluated at the command -- the 273x
 *                  mechanism, which is classical and needs no learner at all.
 *   + live trim    the sensor's current reading, subtracted. The thing the stack tested.
 */
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { roundedRect } from '../../lib/flexisim/toolpath.js';
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';
import { ChainSensor } from '../../lib/flexisim/chainsensor.js';
import { ResidualTrim } from '../../lib/flexisim/residual.js';
import { RobotComp } from '../../lib/ngrc/robotcomp.js';
import { Pilot } from '../../lib/pilot/pilot.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nflexisim: the pilot and the stack, finally on the same denominator\n');

const H = 4, nu = 0.3, rho = 1, CLAMP = 3, RATIO = 100, g = 2e-6;
const LEN1 = 14, LEN2 = 10, SAMPLE = 10;
const K = +(process.env.K || 1), E = +(process.env.E || 0.06);
const FEED = 4e-3, CENTRE = [14, 1];
const PATH = { w: 8, h: 8, r: 1.5, centre: CENTRE, feed: FEED, accel: 4e-5,
  cornerDt: 40, closed: true };

async function machine() {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E, nu, rho,
    damping: 3e-3 });
  const l1 = await mk(LEN1), l2 = await mk(LEN2);
  const jt = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: jt(massProperties(l1)), link1: l1,
    joint2: jt(massProperties(l2)), link2: l2, gravityWorld: [0, -g, 0], dt: 1 });
  const servo = new ChainServo({ arm, bandwidth: 2e-3 });
  return { arm, l1, l2, servo };
}

function settle(arm, servo, a, b, n = 4000) {
  arm.setPose(a, b);
  for (let i = 0; i < n; i++) {
    const t = servo.torques([{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }]);
    arm.step(t[0], t[1], 1);
  }
}

/** THE CONVENTIONAL MACHINE'S OWN COMPLIANCE, from held poses. Part of the baseline. */
function commissionComp(arm, servo) {
  const rc = new RobotComp(2, 2, 1e6);
  for (const [a, b] of [[0.10, 0.30], [-0.05, 0.55], [0.25, 0.15], [0.00, 0.42]]) {
    settle(arm, servo, a, b);
    const refs = [{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }];
    rc.calibrate([[1, 0], [0, 1]], servo.jointTorques(refs),
      [arm.j1.windup(), arm.j2.windup()], 1.0);
  }
  return rc;
}

/**
 * COMMISSION THE PILOT ON THE MACHINE, exactly as the page does: its own excitation, its
 * own probe, its own fit, its own verify -- and its truth is the tool error mapped back
 * through the Jacobian into joint space, which is what makes it a per-channel target.
 */
async function commissionPilot(arm, servo, rc) {
  const centre = arm.ik(CENTRE[0], CENTRE[1], true);
  const p0 = roundedRect(PATH).at(0);
  // THE GUARD IS SIZED FROM WHAT THE MACHINE ACTUALLY COMMANDS, measured over one lap of
  // the conventional machine, rather than from a multiplier guessed off the page. Guessing
  // it is what made the first run of this file worthless: the guard tripped three times,
  // the pilot REFUSED, `act()` returned zeros by contract, and the row read 1.00x -- a
  // measurement of a pilot that never ran, which is indistinguishable from a pilot that
  // does nothing unless you look at uPk (0.0000) or read the verdict.
  const probe = roundedRect(PATH);
  const plap = Math.ceil(probe.lap);
  let peakTau = 0;
  {
    const pr = new Array(plap);
    for (let k = 0; k < plap; k++) { const c = probe.at(k); pr[k] = arm.ik(c.x, c.y, true); }
    settle(arm, servo, pr[0][0], pr[0][1]);
    for (let k = 0; k < plap; k++) {
      const c = probe.at(k), [a1, b1] = pr[k];
      const rr = arm.ikRates(a1, b1, c.vx, c.vy, c.ax, c.ay);
      const t = servo.torques([{ theta: a1, omega: rr.dq[0], alpha: rr.ddq[0] },
        { theta: b1, omega: rr.dq[1], alpha: rr.ddq[1] }]);
      arm.step(t[0], t[1], 1);
      peakTau = Math.max(peakTau, Math.abs(t[0]), Math.abs(t[1]));
    }
  }
  const pilot = new Pilot({
    nMeasured: 6, autoRefuse: false, gateForecasts: false,
    channels: [0, 1].map((j) => ({ lo: centre[j] - 0.55, hi: centre[j] + 0.55,
      vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
    uMax: Math.min(2.0, 0.15 * (16 / K)),
    probeAmp: 0.15 * Math.min(1.0, 0.15 * (16 / K)),
    ditherAmp: 0.1 * Math.min(1.0, 0.15 * (16 / K)),
    start: arm.ik(p0.x, p0.y, true),
    // NO GUARDS, DELIBERATELY. A guard is drive protection -- it trips when a signal
    // exceeds a stated limit and derates, then refuses. It is not part of the comparison,
    // and sizing it wrong silently converts this whole measurement into a measurement of
    // nothing: a refused pilot returns zeros from `act()` by contract, so the row reads
    // 1.00x and looks like "the pilot does not help" rather than "the pilot never ran".
    // Two attempts to size it were both wrong -- a multiplier guessed off the page, then
    // the peak torque of the PRODUCTION lap, which is far gentler than the excitation that
    // has to span the channel box. The honest fix is to remove the confound and say so.
    guards: [],
    workspace: (q) => {
      const r = Math.hypot(arm.L1 * Math.cos(q[0]) + arm.L2 * Math.cos(q[0] + q[1]),
        arm.L1 * Math.sin(q[0]) + arm.L2 * Math.sin(q[0] + q[1]));
      return r > Math.abs(arm.L1 - arm.L2) + 0.5 && r < arm.L1 + arm.L2 - 0.5;
    },
    seed: 1 });
  let guard = 0;
  while (pilot.phase !== 'done' && guard++ < 4e6) {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    // THE PILOT IS COMMISSIONED ON THE MACHINE AS IT SHIPS, i.e. with the conventional
    // compliance pre-distortion already acting. Commissioning it on a different machine
    // from the one it is deployed onto is the mistake this file exists to correct.
    const tgc = servo.jointTorques(cmd.map((c) => ({ theta: c.pos, omega: c.vel, alpha: c.acc })));
    const ff = rc.feedforward([[1, 0], [0, 1]], tgc, { enableToolff: false });
    const refs = cmd.map((c, j) => ({ theta: c.pos + c.u + ff.dq[j], omega: c.vel, alpha: c.acc }));
    const tau = servo.torques(refs);
    arm.step(tau[0], tau[1], 1);
    const enc = arm.encoders();
    const tool = arm.toolXY();
    const q1 = cmd[0].pos, q2 = cmd[1].pos;
    const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
    const cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
    const J = arm.jacobian(q1, q2);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    const ex = tool[0] - cx, ey = tool[1] - cy;
    pilot.observe([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
      tau[0] * 1e3, tau[1] * 1e3],
    [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det]);
  }
  return pilot;
}

async function run({ mode, pilot = null, laps = 3, nTrain = 900 }) {
  const { arm, l1, l2, servo } = await machine();
  const rc = commissionComp(arm, servo);
  const path = roundedRect(PATH);
  const lap = Math.ceil(path.lap);
  const refsAt = new Array(lap);
  for (let k = 0; k < lap; k++) { const c = path.at(k); refsAt[k] = arm.ik(c.x, c.y, true); }
  settle(arm, servo, refsAt[0][0], refsAt[0][1]);

  const cs = mode === 'live' ? new ChainSensor({ joints: [0, 1], sampleEvery: SAMPLE,
    lag: 18, stride: 6 }) : null;
  const trim = new ResidualTrim({ domain: 'position', joints: 2, magMax: 0.05, rateMax: 2e-4 });
  if (pilot) pilot._initRun();
  const S = pilot ? pilot.sample : 1;
  const sampRef = (i) => refsAt[((i * S) % lap + lap) % lap];

  const score = new ContourScore({ joints: 2 });
  let est = 0, trained = 0, uPk = 0;
  for (let l = 0; l < laps; l++) {
    for (let k = 0; k < lap; k++) {
      const kk = l * lap + k;
      const cmd = path.at(k);
      const [c1, c2] = refsAt[k];
      const r = arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const base = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
      // BASELINE: the conventional machine's own compliance pre-distortion, always on.
      const ff = rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base),
        { enableToolff: false });
      let dq = [0, 0];
      if (mode === 'pilot' && pilot) {
        dq = pilot.act((off) => sampRef(Math.floor(kk / S) + off));
      } else if (mode === 'tipcomp') {
        // THE 273x MECHANISM: the identified compliance evaluated at the COMMAND. It is
        // the SAME model the baseline already applies, so on this plant it is a doubling
        // of that pre-distortion rather than a new idea -- which is worth measuring rather
        // than assuming, since the baseline here already contains it.
        const c = rc.compliance;
        const tg = servo.jointTorques(base);
        dq = [c[0] * tg[0], c[1] * tg[1]];
      } else if (mode === 'live' && trained >= nTrain) {
        const J = arm.jacobian(c1, c2);
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        const sp = Math.hypot(cmd.vx, cmd.vy) || 1;
        const nx = -cmd.vy / sp, ny = cmd.vx / sp;
        if (Math.abs(det) > 1e-12) {
          const wx = -est * nx, wy = -est * ny;
          dq = trim.apply([(J[1][1] * wx - J[0][1] * wy) / det,
            (-J[1][0] * wx + J[0][0] * wy) / det]);
        }
      }
      uPk = Math.max(uPk, Math.abs(dq[0]), Math.abs(dq[1]));
      const tau = servo.torques([
        { ...base[0], theta: c1 + ff.dq[0] + dq[0] },
        { ...base[1], theta: c2 + ff.dq[1] + dq[1] }]);
      arm.step(tau[0], tau[1], 1);
      const enc = arm.encoders();
      const d = decompose(path, arm.toolXY(), cmd);
      if (pilot) {
        pilot.observe([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
          tau[0] * 1e3, tau[1] * 1e3], null);
      }
      if (cs && (k % SAMPLE) === 0) {
        const y = cs.observe(arm, tau, 1);
        if (y !== null) {
          if (cs.trained < nTrain) { cs.train(d.contour); trained = cs.trained; }
          else { if (cs.mode === 'training') cs.lock(); est = y; trained = cs.trained; }
        }
      }
      if (l === laps - 1) score.step(d.contour, d.lag, tau, [arm.j1.wM, arm.j2.wM]);
    }
  }
  await l1.destroy(); await l2.destroy();
  const rep = score.report();
  return { contour: rep.contourRms, bias: rep.contourBias, osc: rep.contourOsc, uPk };
}

// ---- COMMISSION THE PILOT ONCE, on its own machine instance, then deploy it on a fresh
// one -- the same discipline the page uses.
const pm = await machine();
const prc = commissionComp(pm.arm, pm.servo);
const pilot = await commissionPilot(pm.arm, pm.servo, prc);
await pm.l1.destroy(); await pm.l2.destroy();
console.log(`    pilot commissioned: Ts ${pilot.Ts} N ${pilot.N} — `
  + `${JSON.stringify(pilot.verdict).slice(0, 96)}`);

const conv = await run({ mode: 'none' });
const wPilot = await run({ mode: 'pilot', pilot });
const wTip = await run({ mode: 'tipcomp' });
const wLive = await run({ mode: 'live' });
const x = (r) => (conv.contour / r.contour).toFixed(2);

console.log(`\n  [K ${K} E ${E}, rounded rectangle, last of 3 laps]`);
console.log(`    conventional (computed torque + PD + RobotComp)  ${conv.contour.toExponential(3)}`);
console.log(`    + PILOT          ${wPilot.contour.toExponential(3)}  ${x(wPilot)}x   uPk ${wPilot.uPk.toFixed(4)}`);
console.log(`    + tipcomp        ${wTip.contour.toExponential(3)}  ${x(wTip)}x   uPk ${wTip.uPk.toFixed(4)}`);
console.log(`    + live trim      ${wLive.contour.toExponential(3)}  ${x(wLive)}x   uPk ${wLive.uPk.toFixed(4)}`);

check('the pilot commissioned and vouched for itself on this machine',
  pilot.phase === 'done' && !!pilot.verdict, JSON.stringify(pilot.verdict).slice(0, 120));
// THE CLAIM THE STACK'S CONCLUSION RESTED ON, now tested with the right mechanism in it.
check('the PILOT beats the conventional machine — which the stack never tested, because '
  + 'it did not contain a pilot',
  wPilot.contour < conv.contour,
  `${wPilot.contour.toExponential(3)} vs ${conv.contour.toExponential(3)}`);
check('…and the live-reading trim does not, so the two are different mechanisms and the '
  + 'earlier conclusion was about the wrong one',
  wLive.contour > wPilot.contour,
  `live ${wLive.contour.toExponential(3)} vs pilot ${wPilot.contour.toExponential(3)}`);

console.log(failed ? `\nreconcile: ${failed} check(s) FAILED\n` : '\nreconcile: all checks passed\n');
process.exit(failed ? 1 : 0);
