// IS THE ARM'S WORLD->WORLD MAP CONSTANT AROUND THE LAP? HarmonicFF fits ONE 2cx2c real
// operator per harmonic, which is an LTI assumption over the lap. On a single-axis servo
// that is exact. On a 2R arm the quasi-static map from a world correction to a world tool
// displacement is J K^-1 J^T, and J turns with the pose — so the operator the DFT fits is
// the LAP AVERAGE of a map that varies. This is kinematics only: no simulation, no CPU.
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { Joint } from '../../lib/flexisim/joint.js';
import { roundedRect } from '../../lib/flexisim/toolpath.js';

const H = 4, nu = 0.3, rho = 1, CLAMP = 3, RATIO = 100, g = 2e-6;
const K = +(process.env.K || 1), E = +(process.env.E || 0.06);
const PATH = { w: 8, h: 8, r: 1.5, centre: [12, 0], feed: 4e-3, accel: 4e-5,
  cornerDt: 40, closed: true };

const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E, nu, rho, damping: 3e-3 });
const l1 = await mk(14), l2 = await mk(10);
const jt = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
  loadInertia: mp.inertiaAboutPivot, stiffness: K, backlash: 1e-4,
  damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
const arm = new FlexArm2R({ joint1: jt(massProperties(l1)), link1: l1,
  joint2: jt(massProperties(l2)), link2: l2, gravityWorld: [0, -g, 0], dt: 1 });

const path = roundedRect(PATH);
const LAP = Math.ceil(path.lap);
const N = 720;                                  // enough to resolve the corner arcs
const svd2 = (M) => {                           // singular values of a symmetric 2x2
  const [[a, b], [, d]] = M;
  const tr = a + d, det = a * d - b * b;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  return [tr / 2 + disc, tr / 2 - disc];
};
const rows = [];
for (let i = 0; i < N; i++) {
  const c = path.at(Math.floor(i * LAP / N));
  const [q1, q2] = arm.ik(c.x, c.y, true);
  const J = arm.jacobian(q1, q2);
  // C = J K^-1 J^T with K = diag(K, K) at the joint: the world compliance the correction
  // acts through. The stiffness is the same on both joints here, so it factors out and what
  // is left is the SHAPE of J J^T — which is the part that varies.
  const C = [[J[0][0] * J[0][0] + J[0][1] * J[0][1], J[0][0] * J[1][0] + J[0][1] * J[1][1]],
    [J[0][0] * J[1][0] + J[0][1] * J[1][1], J[1][0] * J[1][0] + J[1][1] * J[1][1]]];
  const [s1, s2] = svd2(C);
  // The principal axis of the compliance ellipse, as an angle mod pi.
  const ax = 0.5 * Math.atan2(2 * C[0][1], C[0][0] - C[1][1]);
  rows.push({ s1, s2, ax, tr: C[0][0] + C[1][1] });
}
// WHAT MAKES A MAP HARD FOR ONE OPERATOR IS VARIATION, NOT ANISOTROPY. A constant
// anisotropic map is represented EXACTLY by a single 2x2 — it is only the changing that
// the DFT averages away. The first version of this file reported the spread between the
// largest eigenvalue anywhere and the smallest anywhere, which is mostly the shoulder
// being heavier than the elbow, and it made the mass matrix look 11.66x worse than the
// world compliance when its trace moves a THIRD as much. Rule 17: the instrument fails
// before the model does.
//
// So: each eigenvalue against its OWN mean around the lap, and the rotation of the
// eigenvectors. Both are zero for any constant map, however anisotropic.
const spread = (xs) => {
  const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length) / Math.abs(mu);
};
const axisSwing = (axes) => {
  let prev = axes[0]; const un = [prev];
  for (let i = 1; i < axes.length; i++) {
    let a = axes[i];
    while (a - prev > Math.PI / 2) a -= Math.PI;
    while (a - prev < -Math.PI / 2) a += Math.PI;
    un.push(a); prev = a;
  }
  return 180 * (Math.max(...un) - Math.min(...un)) / Math.PI;
};
const describe = (label, mats) => {
  const e1 = [], e2 = [], ax = [];
  for (const M of mats) {
    const [s1, s2] = svd2(M);
    e1.push(s1); e2.push(s2);
    ax.push(0.5 * Math.atan2(2 * M[0][1], M[0][0] - M[1][1]));
  }
  const an = e1.reduce((a, b) => a + b, 0) / e2.reduce((a, b) => a + b, 0);
  console.log(`  ${label}`);
  console.log(`    varies      stiff axis ${(100 * spread(e1)).toFixed(1)}%, `
    + `soft axis ${(100 * spread(e2)).toFixed(1)}%   <- what one operator cannot follow`);
  console.log(`    axis turns  ${axisSwing(ax).toFixed(1)} deg peak to peak`
    + `                       <- likewise`);
  console.log(`    anisotropy  ${an.toFixed(2)}x mean ratio`
    + `                        <- costs a 2x2 operator NOTHING`);
};

const world = [], joint = [];
for (let i = 0; i < N; i++) {
  const c = path.at(Math.floor(i * LAP / N));
  const [q1, q2] = arm.ik(c.x, c.y, true);
  const J = arm.jacobian(q1, q2);
  world.push([[J[0][0] * J[0][0] + J[0][1] * J[0][1], J[0][0] * J[1][0] + J[0][1] * J[1][1]],
    [J[0][0] * J[1][0] + J[0][1] * J[1][1], J[1][0] * J[1][0] + J[1][1] * J[1][1]]]);
  const M = arm.massMatrix(q2);
  joint.push([[M[0][0], M[0][1]], [M[1][0], M[1][1]]]);
}

console.log(`\nthe map HarmonicFF fits ONE operator per harmonic to, around one lap`);
console.log(`  [K ${K} E ${E}, lap ${LAP}, ${N} samples]\n`);
describe('IN WORLD, where the rung runs today — J K^-1 J^T, the compliance it corrects through:', world);
console.log('');
describe('IN JOINT SPACE — J is gone; what is left that still varies is the mass matrix:', joint);
console.log(`\n  On a single-axis servo every one of these is 0% and 0 deg, and that is the`);
console.log(`  plant the rung reaches 10x on.`);
console.log(`\n  PREDICTION, recorded before the comparison run reports: joint space removes`);
console.log(`  the world map's axis rotation outright and cuts the varying part several`);
console.log(`  fold. If the rung does not improve, the frame is not the binding constraint`);
console.log(`  and the gap is somewhere this file cannot see.\n`);
await l1.destroy(); await l2.destroy();

// ---- IS A CONTOUR-ONLY SIGNAL RICH ENOUGH FOR A 2-CHANNEL OPERATOR?
// Narrowing the signal to the contour component makes it POINTWISE RANK 1: at every k it
// is a scalar times the path normal n(k). If n(k) barely turned, both channels would carry
// the same shape and the 4x4 operator would be fitted to a rank-deficient response — the
// failure mode that once made |G| come back as noise and the arm measure 1.00x with every
// check green. n(k) is geometry, so this is answerable without running the plant: take the
// harmonic content of nx and ny themselves and ask how collinear the two channels are.
{
  const nh = 24;
  const nx = new Float64Array(LAP), ny = new Float64Array(LAP);
  for (let k = 0; k < LAP; k++) {
    const t = path.tangent(path.at(k).s ?? 0);
    nx[k] = -t[1]; ny[k] = t[0];
  }
  let worst = 0, worstH = 0, tiny = 0;
  for (let h = 1; h <= nh; h++) {
    let ar = 0, ai = 0, br = 0, bi = 0;
    for (let k = 0; k < LAP; k++) {
      const x = 2 * Math.PI * h * k / LAP, c = Math.cos(x), s = Math.sin(x);
      ar += nx[k] * c; ai -= nx[k] * s; br += ny[k] * c; bi -= ny[k] * s;
    }
    const na = Math.hypot(ar, ai), nb = Math.hypot(br, bi);
    if (na < 1e-9 * LAP || nb < 1e-9 * LAP) { tiny++; continue; }
    // |cos| between the two channels' complex phasors: 1 means the harmonic carries one
    // direction only and cannot separate the two inputs at that frequency.
    const cs = Math.abs(ar * br + ai * bi) / (na * nb);
    if (cs > worst) { worst = cs; worstH = h; }
  }
  console.log(`  the contour-only signal is pointwise rank 1 — it is a scalar on n(k).`);
  console.log(`  Across the first ${nh} lap harmonics the two channels of n are at worst`);
  console.log(`  ${worst.toFixed(3)} collinear (harmonic ${worstH}); ${tiny} harmonic(s) carried`);
  console.log(`  no energy in one channel. 1.000 everywhere would mean the narrowed signal`);
  console.log(`  cannot identify a 2-channel operator at all.\n`);
}

// ---- THE SAME NUMBERS BY A ROUTE THAT DOES NOT SHARE THE JACOBIAN (rule 15).
// Everything above is built from arm.jacobian(). A defect in that one function would make
// both rows wrong together and they would agree with each other perfectly. So: get the same
// world map by FINITE DIFFERENCES of the forward kinematics, which shares no code with it.
{
  const h = 1e-6;
  const fk = (a, b) => [arm.L1 * Math.cos(a) + arm.L2 * Math.cos(a + b),
    arm.L1 * Math.sin(a) + arm.L2 * Math.sin(a + b)];
  let worst = 0;
  for (let i = 0; i < 64; i++) {
    const c = path.at(Math.floor(i * LAP / 64));
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const p0 = fk(q1, q2);
    const c1 = fk(q1 + h, q2), c2 = fk(q1, q2 + h);
    const Jd = [[(c1[0] - p0[0]) / h, (c2[0] - p0[0]) / h],
      [(c1[1] - p0[1]) / h, (c2[1] - p0[1]) / h]];
    const Ja = arm.jacobian(q1, q2);
    for (let r = 0; r < 2; r++) for (let cc = 0; cc < 2; cc++) {
      const rel = Math.abs(Jd[r][cc] - Ja[r][cc]) / Math.max(1e-9, Math.abs(Ja[r][cc]));
      if (rel > worst) worst = rel;
    }
  }
  console.log(`  the jacobian both rows are built from agrees with a finite difference of`);
  console.log(`  the forward kinematics to ${(100 * worst).toFixed(4)}% at worst over the lap —`);
  console.log(`  so the table above is not one function agreeing with itself.\n`);
}
