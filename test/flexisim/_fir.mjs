import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { roundedRect } from '../../lib/flexisim/toolpath.js';
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';
import { RobotComp } from '../../lib/ngrc/robotcomp.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}


const H = 4, nu = 0.3, rho = 1, CLAMP = 3, RATIO = 100, g = 2e-6;
const LEN1 = 14, LEN2 = 10;
const K = +(process.env.K || 1), E = +(process.env.E || 0.06);
// THE PAGE'S OWN MACHINE: drive limits, backlash, and the centre the Path tab works about.
const CENTRE = [12, 0], BACKLASH = 1e-4, DRIVE = 32;
const PATH = { w: 8, h: 8, r: 1.5, centre: CENTRE, feed: 4e-3, accel: 4e-5,
  cornerDt: 40, closed: true };
const NH = +(process.env.NH || 16);
const STEP = +(process.env.STEP || 0.6);
const PASSES = +(process.env.PASSES || 9);
const AMP = 4e-3;

async function machine() {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E, nu, rho,
    damping: 3e-3 });
  const l1 = await mk(LEN1), l2 = await mk(LEN2);
  const jt = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K, backlash: BACKLASH,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: jt(massProperties(l1)), link1: l1,
    joint2: jt(massProperties(l2)), link2: l2, gravityWorld: [0, -g, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: DRIVE * hold, speedMax: 0.2 });
  return { arm, l1, l2, servo };
}
function settle(arm, servo, a, b, n = 4000) {
  arm.setPose(a, b);
  for (let i = 0; i < n; i++) {
    const t = servo.torques([{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }]);
    arm.step(t[0], t[1], 1);
  }
}
/** The conventional machine's own compliance, from held poses. Always on: it is the baseline. */
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


import { ClassicFF, motionBasis } from '../../lib/pilot/classic.js';

console.log('\nDOES THE CONVENTIONAL RUNG NEED MEMORY? the arm, in isolation\n');

const path = roundedRect(PATH);
const LAP = Math.ceil(path.lap);
const p0 = path.at(0);
const AVG = 4;
const wv = [new Float64Array(LAP), new Float64Array(LAP)];
const wa = [new Float64Array(LAP), new Float64Array(LAP)];
for (let k = 0; k < LAP; k++) {
  const c = path.at(k);
  wv[0][k] = c.vx; wv[1][k] = c.vy; wa[0][k] = c.ax; wa[1][k] = c.ay;
}

async function fresh() {
  const m = await machine();
  const rc = commissionComp(m.arm, m.servo);
  const [q1, q2] = m.arm.ik(p0.x, p0.y, true);
  settle(m.arm, m.servo, q1, q2);
  return { ...m, rc };
}
async function run(corr, laps = 2 + AVG) {
  const { arm, l1, l2, servo, rc } = await fresh();
  const sc = new ContourScore({ joints: 2 });
  const ex = new Float64Array(LAP), ey = new Float64Array(LAP);
  for (let l = 0; l < laps; l++) {
    for (let k = 0; k < LAP; k++) {
      const cmd = path.at(k);
      const [c1, c2] = arm.ik(cmd.x, cmd.y, true);
      const r = arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const base = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
      const ff = rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base), { enableToolff: false });
      let d0 = 0, d1 = 0;
      if (corr) {
        const w = corr.at(k);
        const J = arm.jacobian(c1, c2);
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        if (Math.abs(det) > 1e-12) {
          d0 = (J[1][1] * w[0] - J[0][1] * w[1]) / det;
          d1 = (-J[1][0] * w[0] + J[0][0] * w[1]) / det;
        }
      }
      const tau = servo.torques([{ ...base[0], theta: c1 + ff.dq[0] + d0 },
        { ...base[1], theta: c2 + ff.dq[1] + d1 }]);
      arm.step(tau[0], tau[1], 1);
      const d = decompose(path, arm.toolXY(), cmd);
      if (l === laps - 1) sc.step(d.contour, d.lag, tau, [arm.j1.wM, arm.j2.wM]);
      if (l >= laps - AVG) {
        const tp = arm.toolXY();
        ex[k] += (tp[0] - cmd.x) / AVG; ey[k] += (tp[1] - cmd.y) / AVG;
      }
    }
  }
  await l1.destroy(); await l2.destroy();
  const rep = sc.report();
  return { score: rep.contourRms, err: [ex, ey], bias: rep.contourBias, osc: rep.contourOsc };
}

// THE LAG STRIDE MATTERS AS MUCH AS THE COUNT. Rule 37: a lag window must REACH the period of
// what it has to see. The arm's error is lap-periodic and its dominant peaks sit at low
// harmonics, so a tap at stride 1 (one servo step out of 7357) reaches nothing at all — the
// window has to span an appreciable fraction of the ringing period to carry its phase.
const base0 = await run(null);
console.log(`  conventional machine ${base0.score.toExponential(4)}  bias ${base0.bias.toExponential(2)}`
  + `  osc ${base0.osc.toExponential(2)}   lap ${LAP}\n`);
console.log('  lags x stride   basis   result        vs memoryless');
const results = [];
for (const [lags, stride] of [[0, 1], [2, Math.round(LAP / 64)], [3, Math.round(LAP / 24)],
  [4, Math.round(LAP / 12)]]) {
  const basis = motionBasis([{ v: wv[0], a: wa[0] }, { v: wv[1], a: wa[1] }], { lags, lagStride: stride });
  const C = new ClassicFF({ basis, channels: 2, uMax: 1.5 });
  const r = await C.commission(run);
  results.push({ lags, stride, best: r.best, n: basis.n, laps: r.laps });
  const ref = results[0].best;
  console.log(`  ${String(lags).padStart(2)} x ${String(stride).padStart(4)}   ${String(basis.n).padStart(3)}`
    + `   ${r.best.toExponential(4)}   ${(ref / r.best).toFixed(3)}x   ${r.laps} laps`);
}
const memless = results[0].best, bestFir = Math.min(...results.slice(1).map((x) => x.best));
console.log(`\n  memoryless ${memless.toExponential(4)}   best FIR ${bestFir.toExponential(4)}`
  + `   ${(memless / bestFir).toFixed(2)}x`);
console.log('  A static map of the reference\'s current state cannot represent a resonant response.');
console.log('  If memory is the missing span, the FIR rows buy a factor here; if the ringing is');
console.log('  simply not a function of the reference at all, they buy nothing and that is the answer.');
