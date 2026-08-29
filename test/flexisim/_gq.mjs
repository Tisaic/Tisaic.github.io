// IS THE GLOBAL OPERATOR THE RIGHT MODEL? — measured directly, before any controller.
//
// A damped Newton against a FROZEN operator has its fixed point where the error is zero,
// independent of how good that operator is, provided it is close enough to be stable. So
// the endpoint on a fixed program is set by the ACHIEVABLE SET — the lap-harmonic basis,
// the authority, the machine's repeatability — and NOT by operator quality. Any
// endpoint-on-the-trained-program comparison therefore has almost no power to test a model
// class, which is exactly what brick 63's block-tridiagonal result was, and why it is much
// weaker evidence than it looked.
//
// The model question is answerable without the controller at all, and much more cheaply:
// identify the local frequency response at a set of HELD poses, fit the candidate models on
// some of them, and ask how well each predicts the MEASURED response at poses it never saw.
// That is the same shape as the measurement that found the pilot sitting AT its forecast
// bound, which is what established that its QP was not the constraint.
//
// At a held pose there is no lap, so the analogue of the lap harmonic h is the frequency
// h/lap: inject a joint-space multisine at those frequencies, measure the joint-space
// deflection, and take the 2x2 complex response per harmonic. That is G(q, w_h).
import { roundedRect } from '../../lib/flexisim/toolpath.js';
// ONE rig, shared. See _rig.mjs for why eight copies of a machine is eight
// chances for one of them to stop being the machine everything else was measured on.
import { machine, settle, commissionComp, projector } from './_rig.mjs';

const K = +(process.env.K || 1), E = +(process.env.E || 0.06);
const PATH = { w: 8, h: 8, r: 1.5, centre: [12, 0], feed: 4e-3, accel: 4e-5,
  cornerDt: 40, closed: true };
const NH = +(process.env.NH || 8);          // harmonics surveyed
const AMP = +(process.env.AMP || 2e-3);     // probe amplitude, joint space
const PERIODS = +(process.env.PERIODS || 2);


const path = roundedRect(PATH);
const LAP = Math.ceil(path.lap);
const N = PERIODS * LAP;

// THE CONVENTIONAL FEEDFORWARD IS APPLIED HERE TOO, because the moving experiment applies
// it and the comparison between them has to be one variable. This survey originally omitted
// it: at a standstill `ff.dq` is a constant offset, so it shifts the operating pose rather
// than changing the linearised operator, and it was judged too small to matter. That is a
// guess, and the instrument is the first thing to check when a measurement surprises (rule
// 17) — so it is now measured instead. FF=0 reproduces the survey without it.
const USEFF = process.env.FF !== '0';

/** Hold at (a,b) with a joint-space offset u(k); return the joint-space deflection. */
async function probeAt(arm, servo, a, b, uOf, rc = null) {
  arm.setPose(a, b);
  for (let i = 0; i < 6000; i++) {              // settle first, then measure (rule 12)
    const t = servo.torques([{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }]);
    arm.step(t[0], t[1], 1);
  }
  const cx = arm.L1 * Math.cos(a) + arm.L2 * Math.cos(a + b);
  const cy = arm.L1 * Math.sin(a) + arm.L2 * Math.sin(a + b);
  const e = [new Float64Array(N), new Float64Array(N)];
  const refs0 = [{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }];
  const fdq = rc ? rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(refs0),
    { enableToolff: false }).dq : [0, 0];
  for (let k = 0; k < N; k++) {
    const u = uOf(k);
    const t = servo.torques([{ theta: a + fdq[0] + u[0], omega: 0, alpha: 0 },
      { theta: b + fdq[1] + u[1], omega: 0, alpha: 0 }]);
    arm.step(t[0], t[1], 1);
    const tool = arm.toolXY();
    // JOINT SPACE, the frame the rung now corrects in. J at the HELD pose, which is the
    // commanded one — the same convention the harness uses.
    const J = arm.jacobian(a, b);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    const ex = tool[0] - cx, ey = tool[1] - cy;
    e[0][k] = (J[1][1] * ex - J[0][1] * ey) / det;
    e[1][k] = (-J[1][0] * ex + J[0][0] * ey) / det;
  }
  return e;
}

const project = projector(LAP, NH);

// Solve a 4x4 real system (the 2x2 complex operator at one harmonic) by Gaussian
// elimination with a RELATIVE pivot floor — an absolute one returns a fitted answer for a
// singular system instead of refusing, which cost this project a whole brick.
function solve4(M, y) {
  const A = M.map((r, i) => [...r, y[i]]);
  let scale = 0;
  for (const r of A) for (let j = 0; j < 4; j++) scale = Math.max(scale, Math.abs(r[j]));
  if (!(scale > 0)) return null;
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-10 * scale) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j <= 4; j++) A[r][j] -= f * A[c][j];
    }
  }
  return [A[0][4] / A[0][0], A[1][4] / A[1][1], A[2][4] / A[2][2], A[3][4] / A[3][3]];
}

/** The 2x2 complex response at one pose: 4 real columns per harmonic. */
async function operatorAt(a, b) {
  const m = await machine();
  const rc = USEFF ? commissionComp(m.arm, m.servo) : null;
  const zero = await probeAt(m.arm, m.servo, a, b, () => [0, 0], rc);
  const Z = [project(zero[0]), project(zero[1])];
  // Four probes: cos and sin into each channel, every surveyed harmonic in phase. That is
  // the 'basis' design, which is the one this arm selected on the machine.
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
    const e = await probeAt(m.arm, m.servo, a, b, u, rc);
    cols.push([project(e[0]), project(e[1])]);
  }
  await m.l1.destroy(); await m.l2.destroy();
  // Per harmonic, assemble the 4x4 mapping [ure, uim] of both channels to [ere, eim].
  const G = [];
  for (let h = 0; h < NH; h++) {
    const inAmp = AMP / NH;
    const M = [[], [], [], []];
    for (const col of cols) {
      M[0].push((col[0].re[h] - Z[0].re[h]) / inAmp);
      M[1].push((col[0].im[h] - Z[0].im[h]) / inAmp);
      M[2].push((col[1].re[h] - Z[1].re[h]) / inAmp);
      M[3].push((col[1].im[h] - Z[1].im[h]) / inAmp);
    }
    G.push(M);
  }
  return G;
}

// ---- THE POSE SET. The program's own pose range, plus margin, so a fit has something to
// interpolate over rather than extrapolate from (this project has reached 'a calibration
// must span the range it will be used over' three independent times).
const m0 = await machine();
let q1lo = Infinity, q1hi = -Infinity, q2lo = Infinity, q2hi = -Infinity;
for (let k = 0; k < LAP; k += 37) {
  const c = path.at(k); const [x, y] = m0.arm.ik(c.x, c.y, true);
  q1lo = Math.min(q1lo, x); q1hi = Math.max(q1hi, x);
  q2lo = Math.min(q2lo, y); q2hi = Math.max(q2hi, y);
}
await m0.l1.destroy(); await m0.l2.destroy();
const poses = [];
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
  poses.push([q1lo + (q1hi - q1lo) * i / 2, q2lo + (q2hi - q2lo) * j / 2]);
}
console.log(`\nthe local operator across the workspace  [K ${K} E ${E}, NH ${NH}, ${poses.length} poses]`);
console.log(`  q1 ${q1lo.toFixed(3)}..${q1hi.toFixed(3)}   q2 ${q2lo.toFixed(3)}..${q2hi.toFixed(3)}`
  + `   (the program's own range)\n`);

const Gs = [];
for (const [a, b] of poses) {
  Gs.push(await operatorAt(a, b));
  process.stdout.write(`  pose ${poses.length === Gs.length ? '' : ''}${Gs.length}/${poses.length} done\n`);
}

// ---- HOW MUCH DOES IT ACTUALLY VARY, and can a plane in q predict the poses it never saw?
// Held out: the four poses at odd indices, fitted on the five at even ones.
// TWO SPLITS, AND THEY ASK DIFFERENT QUESTIONS. The default alternates, which puts the
// corners and the centre in training and the edge midpoints in test — every test pose
// inside the convex hull of the training set, so the plane is only ever INTERPOLATING.
// That is the easy case and it flatters a smooth model. SPLIT=extrap trains on the low-q1
// half and tests on the high-q1 half, so the plane must extrapolate along the axis it was
// never shown — which is what a workspace calibration actually has to do at the edges of
// its range, and where this project has three times found that a fit does not reach.
const EXTRAP = process.env.SPLIT === 'extrap';
const q1mid = (q1lo + q1hi) / 2;
const test = poses.map((_, i) => i).filter((i) => EXTRAP ? poses[i][0] > q1mid : i % 2 === 1);
const train = poses.map((_, i) => i).filter((i) => EXTRAP ? poses[i][0] <= q1mid : i % 2 === 0);
console.log(`\n  fitted on ${train.length} poses, predicting the ${test.length} it never saw`
  + `  — ${EXTRAP ? 'EXTRAPOLATING past the training range in q1' : 'interpolating inside the training hull'}\n`);
console.log('   h    spread over poses    GLOBAL err    PLANE err    plane/global');
for (let h = 0; h < NH; h++) {
  // Global = the mean operator over the training poses. Plane = G0 + G1 q1 + G2 q2, least
  // squares per entry over the training poses.
  let sGlob = 0, sPlane = 0, sTruth = 0, sVar = 0;
  const mu = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const ys = train.map((i) => Gs[i][h][r][c]);
    const mean = ys.reduce((x, y) => x + y, 0) / ys.length;
    mu.push(mean);
    // Least squares plane over (1, q1, q2).
    let s11 = 0, s12 = 0, s22 = 0, sy1 = 0, sy2 = 0, sy = 0, n = 0;
    for (const i of train) {
      const [a, b] = poses[i], y = Gs[i][h][r][c];
      s11 += a * a; s12 += a * b; s22 += b * b; sy1 += y * a; sy2 += y * b; sy += y; n++;
    }
    const sa = train.reduce((x, i) => x + poses[i][0], 0);
    const sb = train.reduce((x, i) => x + poses[i][1], 0);
    const A = [[n, sa, sb], [sa, s11, s12], [sb, s12, s22]];
    const y3 = [sy, sy1, sy2];
    // 3x3 solve
    const d = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
      - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
      + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    let co = [mean, 0, 0];
    if (Math.abs(d) > 1e-14) {
      const inv = (i, j) => {
        const r0 = [0, 1, 2].filter((x) => x !== i), c0 = [0, 1, 2].filter((x) => x !== j);
        return ((i + j) % 2 ? -1 : 1)
          * (A[r0[0]][c0[0]] * A[r0[1]][c0[1]] - A[r0[0]][c0[1]] * A[r0[1]][c0[0]]) / d;
      };
      co = [0, 1, 2].map((i) => [0, 1, 2].reduce((s2, j) => s2 + inv(j, i) * y3[j], 0));
    }
    for (const i of test) {
      const [a, b] = poses[i], y = Gs[i][h][r][c];
      sGlob += (y - mean) ** 2;
      sPlane += (y - (co[0] + co[1] * a + co[2] * b)) ** 2;
      sTruth += y * y;
    }
    for (const i of train) sVar += (Gs[i][h][r][c] - mean) ** 2;
  }
  const rel = (x) => Math.sqrt(x / sTruth);
  console.log(`  ${String(h + 1).padStart(2)}    ${(100 * Math.sqrt(sVar / sTruth)).toFixed(1).padStart(8)}%`
    + `       ${(100 * rel(sGlob)).toFixed(1).padStart(7)}%     ${(100 * rel(sPlane)).toFixed(1).padStart(7)}%`
    + `      ${(rel(sPlane) / Math.max(1e-12, rel(sGlob))).toFixed(2)}`);
}
console.log(`\n  GLOBAL err is what one operator per harmonic leaves on poses it never saw;`);
console.log(`  PLANE err is what G0 + G1 q1 + G2 q2 leaves on the same poses. The last`);
console.log(`  column is the ratio: below 1 the scheduling earns its parameters, at 1 it`);
console.log(`  does not, and it is measured on HELD-OUT poses so a richer model cannot win`);
console.log(`  by fitting harder. Neither number goes through the Newton loop, so neither`);
console.log(`  can be rescued by an iteration that self-corrects.\n`);

// The operators themselves, for `_gqmove.mjs` to compare against the one identified while
// the machine is RUNNING. Written rather than recomputed: this survey is nine poses of five
// probes each and there is no reason to pay for it twice.
if (process.env.GQ_OUT) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.GQ_OUT, JSON.stringify({ NH, AMP, poses, Gs }));
  console.log(`  operators written to ${process.env.GQ_OUT}\n`);
}
