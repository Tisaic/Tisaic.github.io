/**
 * @file THE KINEMATICS-FREE CHAIN'S SHARED PIECES — the tracker-taught gather, the map
 * fits, and the affine observer, extracted verbatim from `ikfree.test.mjs` so the
 * composition experiments can drive the same machine without a second copy of the loop.
 * NOTE: `ikfree.test.mjs` still carries its own local copies (it is a frozen contract and
 * refactoring it mid-arc was judged riskier than the duplication); folding it onto this rig
 * is queued work, and until then a change here MUST be mirrored there or not made.
 */
import { Joint } from '../../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../../lib/flexisim/link.js';
import { ChainServo } from '../../../lib/flexisim/compensator.js';

const H = 4, CLAMP = 3, NU = 0.3, RHO = 1, G = 2e-6, RATIO = 100, DAMPING = 3e-3;
const PGIK = { LEN1: 14, LEN2: 10, E: 0.15, centre: [12, 0], drive: 32 };

async function makeArmIK(K = 16, EE = PGIK.E) {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E: EE,
    nu: NU, rho: RHO, damping: DAMPING });
  const l1 = await mk(PGIK.LEN1), l2 = await mk(PGIK.LEN2);
  const j = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K, backlash: 1e-4,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: j(massProperties(l1)), link1: l1,
    joint2: j(massProperties(l2)), link2: l2, gravityWorld: [0, -G, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: PGIK.drive * hold, speedMax: 0.2 });
  return { arm, servo };
}

const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));

const S_TOL = 2e-3, S_WIN = 400, S_AVG = 800, S_CAP = 30000;
function visit(arm, servo, from, to, { T = 2500 } = {}) {
  const bx = new Float64Array(S_AVG), by = new Float64Array(S_AVG);
  let n = 0;
  for (let k = 0; k < T + S_CAP; k++) {
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
    if (k >= T) {
      const p = arm.toolXY();
      bx[n % S_AVG] = p[0]; by[n % S_AVG] = p[1]; n++;
      if (n >= S_AVG && n % 50 === 0) {
        let lo0 = Infinity, hi0 = -Infinity, lo1 = Infinity, hi1 = -Infinity;
        for (let w = n - S_WIN; w < n; w++) {
          const x = bx[w % S_AVG], y = by[w % S_AVG];
          if (x < lo0) lo0 = x; if (x > hi0) hi0 = x;
          if (y < lo1) lo1 = y; if (y > hi1) hi1 = y;
        }
        if (Math.hypot(hi0 - lo0, hi1 - lo1) < S_TOL) break;
      }
    }
  }
  let sx = 0, sy = 0;
  const m = Math.min(n, S_AVG);
  for (let w = n - m; w < n; w++) { sx += bx[w % S_AVG]; sy += by[w % S_AVG]; }
  return [sx / m, sy / m];
}

function features(x, y, D, centre = PGIK.centre) {
  const u = (x - centre[0]) / 5, v = (y - centre[1]) / 5;
  const out = [];
  for (let i = 0; i <= D; i++) for (let j = 0; j <= D - i; j++) out.push(u ** i * v ** j);
  return out;
}

/** Multi-output ridge via Cholesky — the test's own solver, verbatim. */
function ridgeMulti(X, Y, ridge) {
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

/** The tracker-taught gather: visit n held points, record where the tool settled. */
function gatherHeldPoints(arm, servo, box, { n = 90, seed = 7 } = {}) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let cur = box.map((b) => (b.lo + b.hi) / 2);
  arm.setPose(cur[0], cur[1]);
  visit(arm, servo, cur, cur, { T: 10 });
  const pairs = [];
  for (let i = 0; i < n; i++) {
    const to = box.map((b) => b.lo + (b.hi - b.lo) * rnd());
    const xy = visit(arm, servo, cur, to);
    pairs.push({ x: xy[0], y: xy[1], q: to.slice() });
    cur = to;
  }
  return pairs;
}

/**
 * The three learned maps of mode ⑥ (brick 44's shapes): the ANSWER (degree-7 inverse), and
 * the INSTRUMENT pair — degree-5 route gradient and degree-5 forward — for the affine
 * observer truth = G(cmd) · (tool − fwd(cmd)). An answer must be accurate; an instrument
 * must fail gently; they are different fits.
 */
function buildMaps(pairs, { D = 7, centre = PGIK.centre } = {}) {
  const trn = pairs.filter((_, i) => i % 4 !== 3);
  const val = pairs.filter((_, i) => i % 4 === 3);
  const W = ridgeMulti(trn.map((p) => features(p.x, p.y, D, centre)), trn.map((p) => p.q), 1e-9);
  const predict = (x, y) => {
    const f = features(x, y, D, centre);
    return W.map((w) => { let s2 = 0; for (let i = 0; i < f.length; i++) s2 += w[i] * f[i]; return s2; });
  };
  const routeW = ridgeMulti(trn.map((p) => features(p.x, p.y, 5, centre)), trn.map((p) => p.q), 1e-9);
  const qc = [(Math.min(...pairs.map((p) => p.q[0])) + Math.max(...pairs.map((p) => p.q[0]))) / 2,
    (Math.min(...pairs.map((p) => p.q[1])) + Math.max(...pairs.map((p) => p.q[1]))) / 2];
  const qFeat = (q) => {
    const u = (q[0] - qc[0]) / 0.55, v = (q[1] - qc[1]) / 0.55;
    const out = [];
    for (let i = 0; i <= 5; i++) for (let j = 0; j <= 5 - i; j++) out.push(u ** i * v ** j);
    return out;
  };
  const fwdW = ridgeMulti(trn.map((p) => qFeat(p.q)), trn.map((p) => [p.x, p.y]), 1e-9);
  const fwd = (q) => {
    const f = qFeat(q);
    return fwdW.map((w) => { let s2 = 0; for (let i = 0; i < f.length; i++) s2 += w[i] * f[i]; return s2; });
  };
  const gradAt = (x, y) => {
    const u = (x - centre[0]) / 5, v = (y - centre[1]) / 5;
    const fx = [], fy = [];
    for (let i = 0; i <= 5; i++) {
      for (let j = 0; j <= 5 - i; j++) {
        fx.push(i === 0 ? 0 : (i * u ** (i - 1) * v ** j) / 5);
        fy.push(j === 0 ? 0 : (u ** i * j * v ** (j - 1)) / 5);
      }
    }
    return routeW.map((w) => {
      let gx = 0, gy = 0;
      for (let i = 0; i < w.length; i++) { gx += w[i] * fx[i]; gy += w[i] * fy[i]; }
      return [gx, gy];
    });
  };
  const rms = (set) => {
    let s2 = 0, n = 0;
    for (const p of set) {
      const q = predict(p.x, p.y);
      s2 += (q[0] - p.q[0]) ** 2 + (q[1] - p.q[1]) ** 2; n += 2;
    }
    return Math.sqrt(s2 / n);
  };
  return { predict, fwd, gradAt, holdout: rms(val), train: rms(trn) };
}

export { PGIK, makeArmIK, visit, features, ridgeMulti, gatherHeldPoints, buildMaps, quintic };
