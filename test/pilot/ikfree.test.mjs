/**
 * @file KINEMATICS-FREE GEOMETRY — the system is never given the arm's lengths or its
 * inverse kinematics. During commissioning it visits held points inside the engineer's
 * command box, records where the tracker says the tool settled, and fits the direct
 * inverse (x,y) → (c1,c2) with an agnostic polynomial ridge basis. From then on it
 * turns Cartesian programs into channel commands itself.
 *
 * FULL TIER: the gather is ~90 held points of two lattice links (~2 minutes). What only
 * this can pin is the claim's strong half, measured ON THE MACHINE: the learned inverse
 * is not merely as good as the analytic kinematics — it is an order BETTER statically,
 * because the analytic ik() commands the drawing (rigid geometry) while the learned map
 * was trained on where the tool actually settles, gravity droop and gearbox wind-up
 * included. That is the classic robot-calibration result, produced by route–limit–run
 * with zero geometric knowledge. Brick 40 carries the full ladder (180 points reach
 * 1.17e-4 rad holdout; the composed chain with the pilot on top is measured there).
 *
 * The analytic ik() appears below ONLY as experimental setup (parking the arm) and as
 * the baseline being raced. The learner consumes tracker readings and commands.
 */
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { circle } from '../../lib/flexisim/toolpath.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: kinematics-free geometry — the inverse learned from the tracker');
if (process.env.SUITE !== 'full') {
  console.log('    (full tier only — ~2 minutes of lattice stepping)');
  process.exit(0);
}

const H = 4, CLAMP = 3, NU = 0.3, RHO = 1, G = 2e-6, RATIO = 100, DAMPING = 3e-3;
const PG = { LEN1: 14, LEN2: 10, E: 0.15, centre: [12, 0], drive: 32 };

async function makeArm() {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E: PG.E,
    nu: NU, rho: RHO, damping: DAMPING });
  const l1 = await mk(PG.LEN1), l2 = await mk(PG.LEN2);
  const j = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: 16, backlash: 1e-4,
    damping: 2 * Math.sqrt(16 * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: j(massProperties(l1)), link1: l1,
    joint2: j(massProperties(l2)), link2: l2, gravityWorld: [0, -G, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: PG.drive * hold, speedMax: 0.2 });
  return { arm, servo };
}

const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));

/** Ease both channels to `to`, hold, return the tracker averaged over the last steps. */
function visit(arm, servo, from, to, { T = 2500, settle = 2200, avg = 400 } = {}) {
  let sx = 0, sy = 0;
  for (let k = 0; k < T + settle; k++) {
    let refs;
    if (k < T) {
      const t = k / T, s = quintic(t);
      const sd = (t * t * (30 + t * (-60 + 30 * t))) / T;
      const sdd = (t * (60 + t * (-180 + 120 * t))) / (T * T);
      refs = [0, 1].map((j) => ({ theta: from[j] + (to[j] - from[j]) * s,
        omega: (to[j] - from[j]) * sd, alpha: (to[j] - from[j]) * sdd }));
    } else {
      refs = [0, 1].map((j) => ({ theta: to[j], omega: 0, alpha: 0 }));
    }
    const tau = servo.torques(refs);
    arm.step(tau[0], tau[1], 1);
    if (k >= T + settle - avg) { const p = arm.toolXY(); sx += p[0]; sy += p[1]; }
  }
  return [sx / avg, sy / avg];
}

// ------------------------------------------------------------ gather held points
const { arm, servo } = await makeArm();
const centre = arm.ik(12, 0, true);
const box = [0, 1].map((j) => ({ lo: centre[j] - 0.55, hi: centre[j] + 0.55 }));
let seed = 7 >>> 0;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
let cur = box.map((b) => (b.lo + b.hi) / 2);
arm.setPose(cur[0], cur[1]);
visit(arm, servo, cur, cur, { T: 10, settle: 3000, avg: 200 });
const pairs = [];
const N_PTS = 90;
for (let i = 0; i < N_PTS; i++) {
  const to = box.map((b) => b.lo + (b.hi - b.lo) * rnd());
  const xy = visit(arm, servo, cur, to);
  pairs.push({ x: xy[0], y: xy[1], q: to.slice() });
  cur = to;
}
await arm.l1.destroy(); await arm.l2.destroy();

// ------------------------------------------------------------------ fit inverse
function features(x, y, D) {
  const u = (x - PG.centre[0]) / 5, v = (y - PG.centre[1]) / 5;
  const out = [];
  for (let i = 0; i <= D; i++) for (let j = 0; j <= D - i; j++) out.push(u ** i * v ** j);
  return out;
}
function solveRidge(X, Y, ridge) {
  const n = X[0].length, no = Y[0].length;
  const A = Array.from({ length: n }, () => new Float64Array(n));
  const b = Array.from({ length: no }, () => new Float64Array(n));
  for (let r = 0; r < X.length; r++) {
    const xr = X[r];
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) A[i][j] += xr[i] * xr[j];
      for (let o = 0; o < no; o++) b[o][i] += xr[i] * Y[r][o];
    }
  }
  for (let i = 0; i < n; i++) { A[i][i] += ridge; for (let j = 0; j < i; j++) A[i][j] = A[j][i]; }
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s2 = A[i][j];
      for (let k = 0; k < j; k++) s2 -= L[i][k] * L[j][k];
      if (i === j) L[i][i] = Math.sqrt(Math.max(s2, 1e-300));
      else L[i][j] = s2 / L[j][j];
    }
  }
  const W = [];
  for (let o = 0; o < no; o++) {
    const z = new Float64Array(n), w = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s2 = b[o][i]; for (let k = 0; k < i; k++) s2 -= L[i][k] * z[k]; z[i] = s2 / L[i][i]; }
    for (let i = n - 1; i >= 0; i--) { let s2 = z[i]; for (let k = i + 1; k < n; k++) s2 -= L[k][i] * w[k]; w[i] = s2 / L[i][i]; }
    W.push(w);
  }
  return W;
}
const D = 7;    // 90 points carry degree 7 (36 features); 180 carry degree 8 (brick 40)
const trn = pairs.filter((_, i) => i % 4 !== 3), val = pairs.filter((_, i) => i % 4 === 3);
const W = solveRidge(trn.map((p) => features(p.x, p.y, D)), trn.map((p) => p.q), 1e-9);
const predict = (x, y) => {
  const f = features(x, y, D);
  return W.map((w) => { let s2 = 0; for (let i = 0; i < f.length; i++) s2 += w[i] * f[i]; return s2; });
};
const rms = (set) => {
  let s2 = 0, n = 0;
  for (const p of set) {
    const q = predict(p.x, p.y);
    s2 += (q[0] - p.q[0]) ** 2 + (q[1] - p.q[1]) ** 2; n += 2;
  }
  return Math.sqrt(s2 / n);
};
console.log(`    ${pairs.length} held points; degree ${D}: train ${rms(trn).toExponential(2)}, `
  + `HOLDOUT ${rms(val).toExponential(3)} rad`);
check('the inverse is learned from the tracker to sub-milliradian holdout',
  rms(val) < 1e-3, rms(val).toExponential(3));

// ------------------------------------- static accuracy, measured ON THE MACHINE
// Hold 8 points of a program neither map has seen. The analytic ik commands the
// rigid drawing; the learned map commands where the tool actually settles.
const path = circle({ feed: 0.004, accel: 4e-5, cornerDt: 40, centre: PG.centre, r: 4 });
const pts = [];
for (let i = 0; i < 8; i++) { const c = path.at(path.lap * i / 8); pts.push([c.x, c.y]); }
async function staticProbe(method) {
  const { arm: a, servo: s } = await makeArm();
  const first = method(pts[0][0], pts[0][1]);
  a.setPose(first[0], first[1]);
  let from = first, s2 = 0, mx = 0;
  for (const [x, y] of pts) {
    const to = method(x, y);
    const xy = visit(a, s, from, to);
    const e = Math.hypot(xy[0] - x, xy[1] - y);
    s2 += e * e; mx = Math.max(mx, e); from = to;
  }
  await a.l1.destroy(); await a.l2.destroy();
  return { rms: Math.sqrt(s2 / pts.length), max: mx };
}
const { arm: armA } = await makeArm();
const pa = await staticProbe((x, y) => armA.ik(x, y, true));
const pl = await staticProbe(predict);
await armA.l1.destroy(); await armA.l2.destroy();
console.log(`    static hold error on the circle: analytic ${pa.rms.toExponential(3)} `
  + `(max ${pa.max.toExponential(2)}), learned ${pl.rms.toExponential(3)} `
  + `(max ${pl.max.toExponential(2)}) — ${(pa.rms / pl.rms).toFixed(1)}x`);
check('holding real path points, the learned map lands within 5e-3 of the ask',
  pl.rms < 5e-3, pl.rms.toExponential(3));
check('…and beats the analytic kinematics at least 5x, because it learned the MACHINE '
  + '(droop and wind-up included) rather than the drawing',
  pa.rms > 5 * pl.rms, `${pa.rms.toExponential(3)} vs ${pl.rms.toExponential(3)}`);

console.log(failed ? `\npilot/ikfree: ${failed} check(s) FAILED\n` : '\npilot/ikfree: all checks passed\n');
process.exit(failed ? 1 : 0);
