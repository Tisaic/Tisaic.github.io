// DOES A HELD-POSE FIT PREDICT THE MOVING MACHINE?
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
const NH = +(process.env.NH || 8);
const AMP = +(process.env.AMP || 2e-3);
const LAPS = +(process.env.LAPS || 3);        // 1 to settle, the rest measured

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
      const tau = servo.torques([{ ...base[0], theta: c1 + ff.dq[0] + u[0] },
        { ...base[1], theta: c2 + ff.dq[1] + u[1] }]);
      arm.step(tau[0], tau[1], 1);
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

console.log(`\nthe operator identified IN MOTION, against the same one identified at rest`);
console.log(`  [K ${K} E ${E}, NH ${NH}, lap ${LAP}, amp ${AMP}]\n`);

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
    return c === 0 ? [AMP * v / NH, 0] : [0, AMP * v / NH];
  };
  const e = await runProgram(u);
  cols.push([project(e[0]), project(e[1])]);
  process.stdout.write(`  probe ${cols.length}/4 done\n`);
}
const Gmove = [];
for (let h = 0; h < NH; h++) {
  const inAmp = AMP / NH;
  const M = [[], [], [], []];
  for (const col of cols) {
    M[0].push((col[0].re[h] - Z[0].re[h]) / inAmp);
    M[1].push((col[0].im[h] - Z[0].im[h]) / inAmp);
    M[2].push((col[1].re[h] - Z[1].re[h]) / inAmp);
    M[3].push((col[1].im[h] - Z[1].im[h]) / inAmp);
  }
  Gmove.push(M);
}
console.log(`\n  identified on the moving machine over ${LAPS - 1} averaged lap(s), 5 runs total.`);
console.log(`  Its magnitude per harmonic (Frobenius/2), for scale:`);
for (let h = 0; h < NH; h++) {
  let gs = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) gs += Gmove[h][r][c] ** 2;
  console.log(`    h ${String(h + 1).padStart(2)}   |G| ${Math.sqrt(gs / 4).toExponential(3)}`);
}
if (process.env.GQ_OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.GQ_OUT, JSON.stringify({ NH, AMP, LAP, Gmove }));
}

// ---- THE COMPARISON. Does a HELD-pose model predict the operator the machine shows while
// it RUNS? To first order the diagonal response at harmonic h on a slowly varying plant is
// the lap-average of the local operator along the trajectory, so that is what is predicted.
// Two predictors, one variable between them: a single global operator averaged over the
// survey poses, and the plane evaluated at q(k) and averaged along the program's own pose
// path. If the plane wins here as it won at rest, a workspace calibration is usable
// off-line. If BOTH are far from the moving operator, the motion terms dominate and neither
// is — which would be the finding that matters most, and the one the held-pose survey was
// explicitly unable to reach.
if (process.env.GQ_IN) {
  const { readFileSync } = await import('node:fs');
  const held = JSON.parse(readFileSync(process.env.GQ_IN, 'utf8'));
  if (held.NH < NH) throw new Error(`held survey has NH ${held.NH}, this run needs ${NH}`);
  const { poses, Gs } = held;
  // Fitted on ALL survey poses: this is not a generalisation test over poses, it is a
  // prediction of a different EXPERIMENT, so every pose is training data.
  const coefOf = (h, r, c) => {
    let n = 0, sa = 0, sb = 0, s11 = 0, s12 = 0, s22 = 0, sy = 0, sy1 = 0, sy2 = 0;
    for (let i = 0; i < poses.length; i++) {
      const [a3, b3] = poses[i], y = Gs[i][h][r][c];
      n++; sa += a3; sb += b3; s11 += a3 * a3; s12 += a3 * b3; s22 += b3 * b3;
      sy += y; sy1 += y * a3; sy2 += y * b3;
    }
    const A = [[n, sa, sb], [sa, s11, s12], [sb, s12, s22]], y3 = [sy, sy1, sy2];
    const d = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
      - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
      + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    if (!(Math.abs(d) > 1e-14)) return [sy / n, 0, 0];
    const inv = (i, j) => {
      const r0 = [0, 1, 2].filter((x) => x !== i), c0 = [0, 1, 2].filter((x) => x !== j);
      return ((i + j) % 2 ? -1 : 1)
        * (A[r0[0]][c0[0]] * A[r0[1]][c0[1]] - A[r0[0]][c0[1]] * A[r0[1]][c0[0]]) / d;
    };
    return [0, 1, 2].map((i) => [0, 1, 2].reduce((s4, j) => s4 + inv(j, i) * y3[j], 0));
  };
  console.log(`\n   h     |G| moving    GLOBAL-held err    PLANE-held err   plane/global`);
  for (let h = 0; h < NH; h++) {
    let sG = 0, sP = 0, sT = 0;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const glob = Gs.reduce((t2, G) => t2 + G[h][r][c], 0) / Gs.length;
      const co = coefOf(h, r, c);
      let pl = 0, n2 = 0;
      for (let k = 0; k < LAP; k += 17) { const [q1, q2] = REFS[k]; pl += co[0] + co[1] * q1 + co[2] * q2; n2++; }
      pl /= n2;
      const truth = Gmove[h][r][c];
      sG += (truth - glob) ** 2; sP += (truth - pl) ** 2; sT += truth * truth;
    }
    const rel = (x) => Math.sqrt(x / Math.max(1e-300, sT));
    console.log(`  ${String(h + 1).padStart(2)}     ${Math.sqrt(sT / 16).toExponential(2)}`
      + `      ${(100 * rel(sG)).toFixed(1).padStart(7)}%          ${(100 * rel(sP)).toFixed(1).padStart(7)}%`
      + `      ${(rel(sP) / Math.max(1e-12, rel(sG))).toFixed(2)}`);
  }
  // ---- IS THE DISCREPANCY A GAIN, OR IS IT STRUCTURE? A held-pose operator that is simply
  // the moving one times a constant is still usable — identify at rest, scale once on the
  // machine. One that differs in SHAPE is not. So: the best single scalar per harmonic, and
  // what it leaves. If the residual collapses, the calibration is rescuable by one number;
  // if it barely moves, held-pose identification is finished for this plant.
  console.log(`\n   h    best scalar   err after removing it   (was, global)`);
  for (let h = 0; h < NH; h++) {
    let num = 0, den = 0, sT = 0, sG = 0;
    const gl = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const g = Gs.reduce((t2, G) => t2 + G[h][r][c], 0) / Gs.length;
      gl.push(g);
      const truth = Gmove[h][r][c];
      num += g * truth; den += g * g; sT += truth * truth; sG += (truth - g) ** 2;
    }
    const k2 = den > 0 ? num / den : 0;
    let sK = 0, i = 0;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) sK += (Gmove[h][r][c] - k2 * gl[i++]) ** 2;
    const rel = (x) => 100 * Math.sqrt(x / Math.max(1e-300, sT));
    console.log(`  ${String(h + 1).padStart(2)}    ${k2.toFixed(3).padStart(9)}`
      + `        ${rel(sK).toFixed(1).padStart(7)}%              ${rel(sG).toFixed(1)}%`);
  }
  console.log(`\n  Both columns are error against the operator the machine shows IN MOTION.`);
  console.log(`  Below 1 says the pose scheduling still helps once the machine is moving;`);
  console.log(`  near 1 says it does not; and BOTH columns large says the motion terms`);
  console.log(`  dominate and a held-pose calibration cannot serve either way.\n`);
}
