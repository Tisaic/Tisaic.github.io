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
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';
import { PathILC } from '../../lib/flexisim/pathilc.js';
import { Pilot } from '../../lib/pilot/pilot.js';

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

async function makeArm(K = 16, EE = PG.E) {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E: EE,
    nu: NU, rho: RHO, damping: DAMPING });
  const l1 = await mk(PG.LEN1), l2 = await mk(PG.LEN2);
  const j = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K, backlash: 1e-4,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: j(massProperties(l1)), link1: l1,
    joint2: j(massProperties(l2)), link2: l2, gravityWorld: [0, -G, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: PG.drive * hold, speedMax: 0.2 });
  return { arm, servo };
}

const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));

/**
 * Ease both channels to `to`, then hold until the tracker is measurably QUIET — the
 * span of the last WIN readings under TOL — and return the average of the last AVG.
 * The fixed settle this replaced was tuned on a stiff machine and read ring, not
 * geometry, at the soft corner (brick 44): ring-at-read 7e-2, map holdout 2.2e-2 rad.
 * Adaptive, the soft corner reads 1e-2 / 7.5e-4 — and a stiff machine settles FASTER.
 */
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

// ------------------------------------------------------------ gather held points
const { arm, servo } = await makeArm();
const centre = arm.ik(12, 0, true);
const box = [0, 1].map((j) => ({ lo: centre[j] - 0.55, hi: centre[j] + 0.55 }));
let seed = 7 >>> 0;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
let cur = box.map((b) => (b.lo + b.hi) / 2);
arm.setPose(cur[0], cur[1]);
visit(arm, servo, cur, cur, { T: 10 });
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

// ============== THE COMPOSED CHAIN (the page's modes ⑥ and ⑦), MEASURED END TO END
//
// ⑥ is the learned geometry above with the pilot's dynamics on top, the commissioning
// truth routed through the learned map itself — inv(tracker) − command — so nothing
// between the Cartesian program and the motors knows the arm. ⑦ folds an ILC table on
// that, with the tool error mapped to joint units through the SAME learned routing.
//
// THE ROUTING IS ITS OWN FIT: degree 5, inputs clamped to the training hull. Routing
// through the degree-7 geometry fit is the measured mistake — evaluated at the moving
// tool during excitation it leaves the hull violently, the truth channel spikes, and
// the pilot's own verify gate REFUSES the result (1.01x in Node at degree 8). An
// instrument must fail gently; an answer must be accurate; they are different fits.
// THE AFFINE OBSERVER (brick 44): truth = G(cmd) · (tool − fwd(cmd)). The previous
// instrument — the clamped degree-5 map evaluated at the MOVING tool — refused the
// pilot at the softest sliders (verify 0.48×) with only 3.7% of steps outside the
// hull: the defect was CURVATURE, not extrapolation. A nonlinear map of the fast
// variable has a gain that changes along the trajectory, breaking the LTI assumption
// the QP's response model rests on. Here both learned halves are evaluated at the
// COMMAND (in-domain by construction) and the tool enters linearly. Measured at
// K 0.25 / E 0.03: r² 0.75/0.59 → 0.99/0.85, verify 0.48× → 5.02×.
const routeW = solveRidge(trn.map((p) => features(p.x, p.y, 5)), trn.map((p) => p.q), 1e-9);
const qcB = [(Math.min(...pairs.map((p) => p.q[0])) + Math.max(...pairs.map((p) => p.q[0]))) / 2,
  (Math.min(...pairs.map((p) => p.q[1])) + Math.max(...pairs.map((p) => p.q[1]))) / 2];
const qFeat = (q) => {
  const u = (q[0] - qcB[0]) / 0.55, v = (q[1] - qcB[1]) / 0.55;
  const out = [];
  for (let i = 0; i <= 5; i++) for (let j = 0; j <= 5 - i; j++) out.push(u ** i * v ** j);
  return out;
};
const fwdW = solveRidge(trn.map((p) => qFeat(p.q)), trn.map((p) => [p.x, p.y]), 1e-9);
const fwd = (q) => {
  const f = qFeat(q);
  return fwdW.map((w) => { let s2 = 0; for (let i = 0; i < f.length; i++) s2 += w[i] * f[i]; return s2; });
};
const gradAt = (x, y) => {
  const u = (x - PG.centre[0]) / 5, v = (y - PG.centre[1]) / 5;
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

const { arm: a6, servo: s6 } = await makeArm();
const c6 = path.at(0);
const q6 = predict(c6.x, c6.y);
a6.setPose(q6[0], q6[1]);
for (let i = 0; i < 4000; i++) {
  const t = s6.torques([{ theta: q6[0], omega: 0, alpha: 0 }, { theta: q6[1], omega: 0, alpha: 0 }]);
  a6.step(t[0], t[1], 1);
}
s6.resetLimitStats();
const centreQ = predict(PG.centre[0], PG.centre[1]);
const pilot = new Pilot({ nMeasured: 6,
  channels: [0, 1].map((j) => ({ lo: centreQ[j] - 0.55, hi: centreQ[j] + 0.55,
    vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
  uMax: 0.15, start: q6, guards: [{ index: 4, max: 6 }, { index: 5, max: 6 }],
  workspace: () => true, seed: 1 });
while (pilot.phase !== 'done') {
  if (pilot.phase === 'fit') { pilot.work(); continue; }
  const cmd = pilot.command();
  const refs = cmd.map((c) => ({ theta: c.pos + c.u, omega: c.vel, alpha: c.acc }));
  const tau = s6.torques(refs);
  a6.step(tau[0], tau[1], 1);
  const enc = a6.encoders();
  const tool = a6.toolXY();
  const t0 = fwd([cmd[0].pos, cmd[1].pos]);
  const Gm = gradAt(t0[0], t0[1]);
  const dx6 = tool[0] - t0[0], dy6 = tool[1] - t0[1];
  pilot.observe([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
    tau[0] * 1e3, tau[1] * 1e3],
  [Gm[0][0] * dx6 + Gm[0][1] * dy6, Gm[1][0] * dx6 + Gm[1][1] * dy6]);
}
console.log(`    ⑥ pilot on the learned routing: ${pilot.verdict.deploy ? 'deploys' : 'refused'}`
  + (pilot.status().report.verify ? `, verify ${pilot.status().report.verify.ratio.toFixed(2)}x` : ''));
check('the pilot commissions on the learned truth routing and the machine vouches for it',
  pilot.verdict.deploy === true, JSON.stringify(pilot.verdict));
await a6.l1.destroy(); await a6.l2.destroy();

if (pilot.verdict.deploy) {
  const { arm: a7, servo: s7 } = await makeArm();
  a7.setPose(q6[0], q6[1]);
  for (let i = 0; i < 4000; i++) {
    const t = s7.torques([{ theta: q6[0], omega: 0, alpha: 0 }, { theta: q6[1], omega: 0, alpha: 0 }]);
    a7.step(t[0], t[1], 1);
  }
  const S = pilot.sample, lap = Math.ceil(path.lap);
  const refs = new Array(lap + 2);
  for (let k = 0; k <= lap + 1; k++) { const c = path.at(k); refs[k] = predict(c.x, c.y); }
  const sampRef = (i) => refs[((i * S) % lap + lap) % lap];
  const ilc = new PathILC({ length: path.length, joints: 2, bins: 1500, gain: 1.0,
    smooth: 12, leadBins: Math.round(500 * 1500 / path.lap) });
  pilot._initRun();
  const ladder = [];
  for (let l = 0; l < 12; l++) {
    const score = new ContourScore({ joints: 2, reversalTravel: 2e-2 });
    for (let k = 0; k < lap; k++) {
      const q = refs[k], qm = refs[(k - 1 + lap) % lap], qp = refs[(k + 1) % lap];
      const kAbs = l * lap + k;
      const u = pilot.act((off) => sampRef(Math.floor(kAbs / S) + off));
      const cmd = path.at(k);
      const o = ilc.offset(cmd.s);
      const tau = s7.torques([
        { theta: q[0] + u[0] + o[0], omega: (qp[0] - qm[0]) / 2, alpha: qp[0] - 2 * q[0] + qm[0] },
        { theta: q[1] + u[1] + o[1], omega: (qp[1] - qm[1]) / 2, alpha: qp[1] - 2 * q[1] + qm[1] }]);
      a7.step(tau[0], tau[1], 1);
      const enc = a7.encoders();
      pilot.observe([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
        tau[0] * 1e3, tau[1] * 1e3], null);
      const tool = a7.toolXY();
      const dec = decompose(path, tool, cmd);
      score.step(dec.contour, dec.lag, tau, [a7.j1.wM, a7.j2.wM]);
      const Gm = gradAt(cmd.x, cmd.y);
      const dxl = tool[0] - cmd.x, dyl = tool[1] - cmd.y;
      ilc.observe(cmd.s, [Gm[0][0] * dxl + Gm[0][1] * dyl, Gm[1][0] * dxl + Gm[1][1] * dyl]);
    }
    ilc.endLap();
    ladder.push(score.report().contourRms);
  }
  await a7.l1.destroy(); await a7.l2.destroy();
  const tail = Math.min(...ladder.slice(-3));
  console.log(`    ⑦ circle ladder: ${ladder.map((v) => v.toExponential(1)).join(' ')}`);
  // Measured on this rig: lap 1 ~5.9e-2 falling to ~1.1e-3 by lap 14 — within 28% of
  // the ANALYTIC-kinematics ILC@15 (8.9e-4), from a stack that has never seen ik().
  // The gates sit a factor above the measured tail, not at it.
  check('⑦ — iteration on the fully learned chain — converges on the circle',
    tail < 8e-3 && tail < ladder[0] / 4,
    `tail ${tail.toExponential(2)} vs lap 1 ${ladder[0].toExponential(2)}`);
}

// ============= THE SOFTEST SLIDERS (K 0.25, E 0.03): ⑥ MUST STILL COMMISSION
//
// The owner's report, pinned: at the softest gearbox and the softest links the fully
// learned system refused. Two defects, both fixed and both required (brick 44): the
// FIXED gather settle read ring instead of geometry (adaptive quiet-detection fixes
// the map, holdout 2.2e-2 → 7.5e-4 rad), and the map-at-the-moving-tool truth routing
// broke the observer's LTI-ness (the affine observer fixes the pilot, verify 0.48× →
// 5.02×). A trimmed 45-point gather keeps this affordable; the gate is the deploy
// itself plus a real verify margin.
{
  const { arm: aS, servo: sS } = await makeArm(0.25, 0.03);
  const centreS = aS.ik(12, 0, true);
  const boxS = [0, 1].map((jj) => ({ lo: centreS[jj] - 0.55, hi: centreS[jj] + 0.55 }));
  let seedS = 7 >>> 0;
  const rndS = () => ((seedS = (seedS * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let curS = boxS.map((b) => (b.lo + b.hi) / 2);
  aS.setPose(curS[0], curS[1]);
  visit(aS, sS, curS, curS, { T: 10 });
  const pairsS = [];
  for (let i = 0; i < 45; i++) {
    const to = boxS.map((b) => b.lo + (b.hi - b.lo) * rndS());
    const xy = visit(aS, sS, curS, to);
    pairsS.push({ x: xy[0], y: xy[1], q: to.slice() });
    curS = to;
  }
  const trnS = pairsS.filter((_, i) => i % 4 !== 3);
  const invW = solveRidge(trnS.map((p) => features(p.x, p.y, 5)), trnS.map((p) => p.q), 1e-9);
  const qcS = [(boxS[0].lo + boxS[0].hi) / 2, (boxS[1].lo + boxS[1].hi) / 2];
  const qFeatS = (q) => {
    const u = (q[0] - qcS[0]) / 0.55, v = (q[1] - qcS[1]) / 0.55;
    const out = [];
    for (let i = 0; i <= 5; i++) for (let jj = 0; jj <= 5 - i; jj++) out.push(u ** i * v ** jj);
    return out;
  };
  const fwdWS = solveRidge(trnS.map((p) => qFeatS(p.q)), trnS.map((p) => [p.x, p.y]), 1e-9);
  const fwdS = (q) => {
    const f = qFeatS(q);
    return fwdWS.map((w) => { let s2 = 0; for (let i = 0; i < f.length; i++) s2 += w[i] * f[i]; return s2; });
  };
  const gradS = (x, y) => {
    const u = (x - PG.centre[0]) / 5, v = (y - PG.centre[1]) / 5;
    const fx = [], fy = [];
    for (let i = 0; i <= 5; i++) {
      for (let jj = 0; jj <= 5 - i; jj++) {
        fx.push(i === 0 ? 0 : (i * u ** (i - 1) * v ** jj) / 5);
        fy.push(jj === 0 ? 0 : (u ** i * jj * v ** (jj - 1)) / 5);
      }
    }
    return invW.map((w) => {
      let gx = 0, gy = 0;
      for (let i = 0; i < w.length; i++) { gx += w[i] * fx[i]; gy += w[i] * fy[i]; }
      return [gx, gy];
    });
  };
  const pilotS = new Pilot({ nMeasured: 6,
    channels: [0, 1].map((jj) => ({ lo: centreS[jj] - 0.55, hi: centreS[jj] + 0.55,
      vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
    uMax: 0.15, start: curS.slice(), guards: [{ index: 4, max: 6 }, { index: 5, max: 6 }],
    workspace: () => true, seed: 1 });
  while (pilotS.phase !== 'done') {
    if (pilotS.phase === 'fit') { pilotS.work(); continue; }
    const cmd = pilotS.command();
    const refs = cmd.map((c) => ({ theta: c.pos + c.u, omega: c.vel, alpha: c.acc }));
    const tau = sS.torques(refs);
    aS.step(tau[0], tau[1], 1);
    const enc = aS.encoders();
    const tool = aS.toolXY();
    const t0 = fwdS([cmd[0].pos, cmd[1].pos]);
    const Gm = gradS(t0[0], t0[1]);
    const dx = tool[0] - t0[0], dy = tool[1] - t0[1];
    pilotS.observe([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
      tau[0] * 1e3, tau[1] * 1e3],
    [Gm[0][0] * dx + Gm[0][1] * dy, Gm[1][0] * dx + Gm[1][1] * dy]);
  }
  await aS.l1.destroy(); await aS.l2.destroy();
  const vS = pilotS.status().report.verify;
  console.log(`    softest corner (K 0.25, E 0.03): ${pilotS.verdict.deploy ? 'deploys' : 'REFUSED'}`
    + (vS ? `, verify ${vS.ratio.toFixed(2)}x` : ''));
  check('at the softest sliders the fully learned system still commissions and deploys',
    pilotS.verdict.deploy === true && vS && vS.ratio > 1.5,
    JSON.stringify(pilotS.verdict));
}

console.log(failed ? `\npilot/ikfree: ${failed} check(s) FAILED\n` : '\npilot/ikfree: all checks passed\n');
process.exit(failed ? 1 : 0);
