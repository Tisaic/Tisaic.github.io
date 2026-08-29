// WHY DOES THE CHANNEL DIE, AND DOES TORQUE KEEP IT ALIVE?
//
// `_gq.mjs` established that the local operator is strongly configuration-dependent and
// that a plane in q predicts it on poses it never saw. Every one of those measurements was
// taken with the arm HELD. The operator the lap-periodic rung actually identifies is taken
// while the machine runs the program, where Coriolis terms, velocity-dependent friction and
// backlash traversal all exist and none of them appear at a standstill. So the survey
// establishes that the model CLASS is right for the local operator; it says nothing about
// whether a held-pose fit is usable for the moving one, and that is the difference between
// a workspace calibration that works and one that cannot be identified in the first place.
//
// This measures it directly, on ONE machine with ONE variable. The same probe design, the
// same harmonics, the same joint-space error definition, identified twice: once at held
// poses and averaged along the program's own pose trajectory, and once on the machine while
// it runs that program. No cascade underneath either, because the rung identifies with
// reactive layers disarmed. If the two agree, held-pose identification is viable and the
// plane can be fitted off-line. If they disagree, G(q) has to be identified in motion.
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { roundedRect } from '../../lib/flexisim/toolpath.js';
import { RobotComp } from '../../lib/ngrc/robotcomp.js';

const H = 4, nu = 0.3, rho = 1, CLAMP = 3, RATIO = 100, g = 2e-6;
const K = +(process.env.K || 1), E = +(process.env.E || 0.06);
const PATH = { w: 8, h: 8, r: 1.5, centre: [12, 0], feed: 4e-3, accel: 4e-5,
  cornerDt: 40, closed: true };
const NH = +(process.env.NH || 48);
const AMP = +(process.env.AMP || 2e-3);
const LAPS = +(process.env.LAPS || 3);
const TORQUE = !!process.env.TORQUE;
// Torque and radians are different units, so the two probes are scaled to demand a
// comparable share of what each channel has: AMP of the position box, or AMPT of the
// drive's own torque limit. The comparison is the SHAPE of |G| across harmonics, which is
// what dies, not its absolute level.
const AMPT = +(process.env.AMPT || 0.02);        // 1 to settle, the rest measured

async function machine() {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E, nu, rho, damping: 3e-3 });
  const l1 = await mk(14), l2 = await mk(10);
  const jt = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K, backlash: 1e-4,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: jt(massProperties(l1)), link1: l1,
    joint2: jt(massProperties(l2)), link2: l2, gravityWorld: [0, -g, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: 32 * hold, speedMax: 0.2 });
  return { arm, l1, l2, servo };
}
function settle(arm, servo, a, b, n = 4000) {
  arm.setPose(a, b);
  for (let i = 0; i < n; i++) {
    const t = servo.torques([{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }]);
    arm.step(t[0], t[1], 1);
  }
}
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

const path = roundedRect(PATH);
const LAP = Math.ceil(path.lap);
const REFS = new Array(LAP);

/** Drive the program with a lap-periodic joint offset u(k); return the joint-space error. */
async function runProgram(uOf) {
  const { arm, l1, l2, servo } = await machine();
  const rc = commissionComp(arm, servo);
  if (!REFS[0]) for (let k = 0; k < LAP; k++) { const c = path.at(k); REFS[k] = arm.ik(c.x, c.y, true); }
  const [s1, s2] = REFS[0];
  settle(arm, servo, s1, s2);
  const e = [new Float64Array(LAP), new Float64Array(LAP)];
  for (let l = 0; l < LAPS; l++) {
    for (let k = 0; k < LAP; k++) {
      const cmd = path.at(k);
      const [c1, c2] = REFS[k];
      const r = arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const base = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
      const ff = rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base), { enableToolff: false });
      const u = uOf(k);
      // THE ONE VARIABLE: WHERE THE CORRECTION ENTERS. As a reference offset it passes
      // through the position loop, which has a bandwidth of 2e-3 — so above that corner the
      // loop attenuates it and the tool barely moves however large the offset. As a torque
      // it is added after the loop and the only thing between it and the tool is the
      // mechanics. Everything else here is identical: same probe phases, same harmonics,
      // same error definition, same machine.
      const tau = servo.torques([{ ...base[0], theta: c1 + ff.dq[0] + (TORQUE ? 0 : u[0]) },
        { ...base[1], theta: c2 + ff.dq[1] + (TORQUE ? 0 : u[1]) }]);
      arm.step(tau[0] + (TORQUE ? u[0] : 0), tau[1] + (TORQUE ? u[1] : 0), 1);
      if (l >= 1) {
        // The SAME joint-space error the rung reads: J-inverse of the world tool error, at
        // the commanded pose.
        const tool = arm.toolXY();
        const J = arm.jacobian(c1, c2);
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        const ex = tool[0] - cmd.x, ey = tool[1] - cmd.y;
        e[0][k] += ((J[1][1] * ex - J[0][1] * ey) / det) / (LAPS - 1);
        e[1][k] += ((-J[1][0] * ex + J[0][0] * ey) / det) / (LAPS - 1);
      }
    }
  }
  await l1.destroy(); await l2.destroy();
  return e;
}
function project(sig) {
  const re = new Float64Array(NH), im = new Float64Array(NH);
  for (let h = 1; h <= NH; h++) {
    let a = 0, b = 0;
    for (let k = 0; k < LAP; k++) {
      const x = 2 * Math.PI * h * k / LAP;
      a += sig[k] * Math.cos(x); b -= sig[k] * Math.sin(x);
    }
    re[h - 1] = 2 * a / LAP; im[h - 1] = 2 * b / LAP;
  }
  return { re, im };
}

// ---- |G| ACROSS THE HARMONICS, ONE INJECTION POINT AT A TIME.
//
// The lap-harmonic rung can only correct what the plant RESPONDS to. On this arm |G| falls
// from 0.83 at h1 to 0.15 at h8 and the benefit-weighted ceiling cuts the band there, which
// caps the achievable floor at 4.23e-3 — while the same error measured out to h64 would
// leave 1.36e-4, near the machine's own 1.51e-4 repeatability. Thirty times sits in
// harmonics the correction cannot reach.
//
// The suspected reason is not the mechanics but the LOOP: a correction entering as a
// position reference passes through a servo of bandwidth 2e-3, and at h8 the harmonic is
// already at ~1.1e-3. If that is the cause, the same correction injected as TORQUE — after
// the loop, with only the mechanics in front of it — keeps its authority where the
// reference route loses it. If |G| dies the same way both routes, the loop is innocent and
// the limit is mechanical, which would close this line rather than open it.
const scale = TORQUE ? AMPT : AMP;
const zero = await runProgram(() => [0, 0]);
const Z = [project(zero[0]), project(zero[1])];
const cols = [];
for (let c = 0; c < 2; c++) for (let s = 0; s < 2; s++) {
  const u = (k) => {
    let v = 0;
    for (let h = 1; h <= NH; h++) {
      const x = 2 * Math.PI * h * k / LAP;
      v += (s ? Math.sin(x) : Math.cos(x));
    }
    return c === 0 ? [scale * v / NH, 0] : [0, scale * v / NH];
  };
  const e = await runProgram(u);
  cols.push([project(e[0]), project(e[1])]);
  process.stdout.write(`  probe ${cols.length}/4\r`);
}
console.log(`\n  |G| across ${NH} harmonics, correction injected as `
  + `${TORQUE ? 'TORQUE (after the position loop)' : 'a POSITION REFERENCE (through it)'}`);
console.log(`  [K ${K} E ${E}, lap ${LAP}, amp ${scale}]\n`);
const gm = [];   // `g` is the gravity constant at the top of this file
for (let h = 0; h < NH; h++) {
  const inAmp = scale / NH;
  let gs = 0;
  for (const col of cols) {
    gs += ((col[0].re[h] - Z[0].re[h]) / inAmp) ** 2 + ((col[0].im[h] - Z[0].im[h]) / inAmp) ** 2
      + ((col[1].re[h] - Z[1].re[h]) / inAmp) ** 2 + ((col[1].im[h] - Z[1].im[h]) / inAmp) ** 2;
  }
  gm.push(Math.sqrt(gs / 16));
}
const g1 = gm[0];
for (let h = 0; h < NH; h += (NH > 16 ? 4 : 1)) {
  const rel = gm[h] / g1;
  const bar = '#'.repeat(Math.max(0, Math.round(40 * Math.min(1, rel))));
  console.log(`  h ${String(h + 1).padStart(3)}  |G| ${gm[h].toExponential(3)}  `
    + `${(100 * rel).toFixed(1).padStart(6)}% of h1  ${bar}`);
}
// The number that decides it: how far out does the channel still carry a tenth of h1?
let reach = 0;
for (let h = 0; h < NH; h++) if (gm[h] >= 0.1 * g1) reach = h + 1;
console.log(`\n  the channel still carries 10% of its h1 response out to h ${reach} of ${NH}.`);
console.log(`  A position reference dies near the loop's own corner; if torque reaches`);
console.log(`  materially further, the band — and with it the achievable floor — is limited`);
console.log(`  by where the correction ENTERS rather than by the mechanics.\n`);
