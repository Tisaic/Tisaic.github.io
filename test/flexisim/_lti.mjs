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
const gmax = Math.max(...rows.map((r) => r.s1)), gmin = Math.min(...rows.map((r) => r.s2));
const trs = rows.map((r) => r.tr);
const trMu = trs.reduce((a, b) => a + b, 0) / N;
const trSd = Math.sqrt(trs.reduce((a, b) => a + (b - trMu) ** 2, 0) / N);
// The axis wanders; unwrap it mod pi before taking a spread, or the wrap dominates.
let prev = rows[0].ax, un = [prev];
for (let i = 1; i < N; i++) {
  let a = rows[i].ax;
  while (a - prev > Math.PI / 2) a -= Math.PI;
  while (a - prev < -Math.PI / 2) a += Math.PI;
  un.push(a); prev = a;
}
const aMu = un.reduce((a, b) => a + b, 0) / N;
const aSd = Math.sqrt(un.reduce((a, b) => a + (b - aMu) ** 2, 0) / N);

console.log(`\nthe arm's world compliance around one lap  [K ${K} E ${E}, lap ${LAP}]\n`);
console.log(`  gain spread          ${(gmax / gmin).toFixed(2)}x between the stiffest and`
  + ` softest direction encountered anywhere on the lap`);
console.log(`  trace, mean +- sd    ${trMu.toExponential(3)} +- ${trSd.toExponential(2)}`
  + `   (${(100 * trSd / trMu).toFixed(1)}% of the mean)`);
console.log(`  principal axis       ${(180 * aSd / Math.PI).toFixed(1)} deg sd, `
  + `${(180 * (Math.max(...un) - Math.min(...un)) / Math.PI).toFixed(1)} deg peak to peak`);
console.log(`\n  ONE operator per harmonic is fitted to all of that. On a single-axis servo`);
console.log(`  the same numbers are 1.00x, 0%, 0 deg — which is the plant HarmonicFF`);
console.log(`  reaches 10x on.\n`);
await l1.destroy(); await l2.destroy();
