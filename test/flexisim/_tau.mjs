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
const NH = +(process.env.NH || 24);
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


import { HarmonicFF } from '../../lib/pilot/hff.js';
import { Stack } from '../../lib/pilot/stack.js';

console.log('\nPHASE OF THE FROZEN OPERATOR: clean machine vs deployed cascade\n');

const path = roundedRect(PATH);
const LAP = Math.ceil(path.lap);
const p0 = path.at(0);
const AVG = 4;

async function fresh() {
  const m = await machine();
  const rc = commissionComp(m.arm, m.servo);
  const [q1, q2] = m.arm.ik(p0.x, p0.y, true);
  settle(m.arm, m.servo, q1, q2);
  return { ...m, rc };
}

let STACK = null, ARM_ON = true;

/** One scored run. `armed` decides whether the deployed cascade acts. */
async function run(corr, laps = 2 + AVG) {
  const { arm, l1, l2, servo, rc } = await fresh();
  if (STACK && ARM_ON) for (const p of STACK.layers) if (p._initRun) p._initRun();
  const sc = new ContourScore({ joints: 2 });
  const ex = new Float64Array(LAP), ey = new Float64Array(LAP);
  // TAU, on the same averaged window as the error. It is the last signal before the physics
  // and the only one that carries what the plant is actually being asked to do.
  const t0 = new Float64Array(LAP), t1 = new Float64Array(LAP);
  for (let l = 0; l < laps; l++) {
    for (let k = 0; k < LAP; k++) {
      const cmd = path.at(k);
      const [c1, c2] = arm.ik(cmd.x, cmd.y, true);
      const r = arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const base = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
      const ff = rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base), { enableToolff: false });
      let d0 = 0, d1 = 0;
      if (STACK && ARM_ON) {
        const S = STACK.sample, kS = Math.floor((l * LAP + k) / S);
        const look = (off) => { const c = path.at((((kS + off) * S) % LAP + LAP) % LAP); return arm.ik(c.x, c.y, true); };
        const u = STACK.act(look); d0 += u[0]; d1 += u[1];
      }
      if (corr) {
        const w = corr.at(k);
        const J = arm.jacobian(c1, c2);
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        if (Math.abs(det) > 1e-12) {
          d0 += (J[1][1] * w[0] - J[0][1] * w[1]) / det;
          d1 += (-J[1][0] * w[0] + J[0][0] * w[1]) / det;
        }
      }
      const tau = servo.torques([{ ...base[0], theta: c1 + ff.dq[0] + d0 },
        { ...base[1], theta: c2 + ff.dq[1] + d1 }]);
      arm.step(tau[0], tau[1], 1);
      if (STACK && ARM_ON) {
        const en = arm.encoders();
        STACK.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
          tau[0] * 1e3, tau[1] * 1e3], null);
      }
      const d = decompose(path, arm.toolXY(), cmd);
      if (l === laps - 1) sc.step(d.contour, d.lag, tau, [arm.j1.wM, arm.j2.wM]);
      if (l >= laps - AVG) {
        const tp = arm.toolXY();
        ex[k] += (tp[0] - cmd.x) / AVG; ey[k] += (tp[1] - cmd.y) / AVG;
        t0[k] += tau[0] / AVG; t1[k] += tau[1] / AVG;
      }
    }
  }
  await l1.destroy(); await l2.destroy();
  return { score: sc.report().contourRms, err: [ex, ey], tau: [t0, t1] };
}

// ---- commission the cascade the ladder actually deploys (classic withheld, depth 2)
{
  const m = await machine();
  const c = m.arm.ik(12, 0, true);
  const opts = {
    nMeasured: 6, autoRefuse: false, gateForecasts: false, refusePartial: false,
    channels: [0, 1].map((j) => ({ lo: c[j] - 0.55, hi: c[j] + 0.55, vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
    uMax: Math.min(2.0, 0.15 * (16 / K)),
    probeAmp: 0.15 * Math.min(1.0, 0.15 * (16 / K)),
    ditherAmp: 0.1 * Math.min(1.0, 0.15 * (16 / K)),
    start: m.arm.ik(p0.x, p0.y, true), guards: [],
    workspace: (q) => {
      const rr = Math.hypot(m.arm.L1 * Math.cos(q[0]) + m.arm.L2 * Math.cos(q[0] + q[1]),
        m.arm.L1 * Math.sin(q[0]) + m.arm.L2 * Math.sin(q[0] + q[1]));
      return rr > Math.abs(m.arm.L1 - m.arm.L2) + 0.5 && rr < m.arm.L1 + m.arm.L2 - 0.5;
    }, seed: 1, depth: 2 };
  await m.l1.destroy(); await m.l2.destroy();
  STACK = new Stack(opts);
  const { arm, l1, l2, servo, rc } = await fresh();
  let guard = 0;
  while (STACK.phase !== 'done' && guard++ < 4e6) {
    if (STACK.phase === 'fit') { STACK.work(); continue; }
    const cmd = STACK.command();
    const tgc = servo.jointTorques(cmd.map((q) => ({ theta: q.pos, omega: q.vel, alpha: q.acc })));
    const ff = rc.feedforward([[1, 0], [0, 1]], tgc, { enableToolff: false });
    const tau = servo.torques(cmd.map((q, j) => ({ theta: q.pos + q.u + ff.dq[j], omega: q.vel, alpha: q.acc })));
    arm.step(tau[0], tau[1], 1);
    const en = arm.encoders(), tool = arm.toolXY();
    const q1 = cmd[0].pos, q2 = cmd[1].pos;
    const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
    const cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
    const J = arm.jacobian(q1, q2);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    const exw = tool[0] - cx, eyw = tool[1] - cy;
    STACK.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
      tau[0] * 1e3, tau[1] * 1e3],
    [(J[1][1] * exw - J[0][1] * eyw) / det, (-J[1][0] * exw + J[0][0] * eyw) / det]);
  }
  await l1.destroy(); await l2.destroy();
  console.log(`  cascade commissioned: ${JSON.stringify(STACK.verdict).slice(0, 100)}`);
}

/** Identify only — no refinement — and hand back the operator. */
async function identify(disarmForProbe) {
  const H = new HarmonicFF({ lap: LAP, channels: 2, uMax: 1.5, probeStyle: 'spread',
    probeFracs: [0.10], reachPows: [1], cuts: [0], passes: 0, backtracks: 0, trialPasses: 0 });
  await H.commission(async (corr, phase) => {
    ARM_ON = !(disarmForProbe && phase === 'probe');
    try { return await run(corr); } finally { ARM_ON = true; }
  });
  return H;
}

// ---------------------------------------------------------------- THREE OPERATORS
// G_u : command -> error      (what the harmonic rung identifies and inverts today)
// S   : command -> torque     (the servo, and nothing structural)
// G_t : torque  -> error      (the STRUCTURE's own compliance)
//
// G_u = G_t . S. If deploying a cascade moves G_u but leaves G_t alone, then what changed is
// the servo's operating point and not the machine, and the fix is to identify the invariant
// half once and re-measure only the cheap half on the deployed machine.
const NP = 5, mm = 4;
const proj = (sig) => {
  const re = [[], []], im = [[], []];
  for (let h = 1; h <= NH; h++) for (let c = 0; c < 2; c++) {
    let a = 0, b = 0;
    for (let k = 0; k < LAP; k++) { const w = 2 * Math.PI * h * k / LAP; a += sig[c][k] * Math.cos(w); b += sig[c][k] * Math.sin(w); }
    re[c].push(2 * a / LAP); im[c].push(2 * b / LAP);
  }
  return { re, im };
};
const vecOf = (P, h) => [P.re[0][h], P.im[0][h], P.re[1][h], P.im[1][h]];
/** least squares X -> Y over the probe set, per harmonic; returns mm x mm */
function fitOp(X, Y, h) {
  const A = Array.from({ length: mm }, () => new Float64Array(mm));
  for (let i = 0; i < mm; i++) for (let j = 0; j < mm; j++) { let t = 0; for (let q = 0; q < X.length; q++) t += X[q][h][i] * X[q][h][j]; A[i][j] = t; }
  const M = Array.from({ length: mm }, () => new Float64Array(mm));
  for (let r = 0; r < mm; r++) {
    const b = new Float64Array(mm);
    for (let i = 0; i < mm; i++) { let t = 0; for (let q = 0; q < X.length; q++) t += X[q][h][i] * Y[q][h][r]; b[i] = t; }
    // Gauss-Jordan with a relative pivot floor
    const aug = [];
    let scale = 0;
    for (let i = 0; i < mm; i++) { const row = new Float64Array(mm + 1); for (let j = 0; j < mm; j++) { row[j] = A[i][j]; scale = Math.max(scale, Math.abs(row[j])); } row[mm] = b[i]; aug.push(row); }
    const tol = scale * mm * 2.3e-16;
    let ok = true;
    for (let c = 0; c < mm && ok; c++) {
      let p = c;
      for (let r2 = c + 1; r2 < mm; r2++) if (Math.abs(aug[r2][c]) > Math.abs(aug[p][c])) p = r2;
      if (!(Math.abs(aug[p][c]) > tol)) { ok = false; break; }
      [aug[c], aug[p]] = [aug[p], aug[c]];
      for (let r2 = 0; r2 < mm; r2++) { if (r2 === c) continue; const f = aug[r2][c] / aug[c][c]; for (let j = c; j <= mm; j++) aug[r2][j] -= f * aug[c][j]; }
    }
    if (!ok) return null;
    for (let i = 0; i < mm; i++) M[r][i] = aug[i][mm] / aug[i][i];
  }
  return M;
}

async function probeAll(disarm) {
  const bs = await run(null);
  const E0 = proj(bs.err), T0 = proj(bs.tau);
  let epk = 0;
  for (let c = 0; c < 2; c++) for (let k = 0; k < LAP; k++) epk = Math.max(epk, Math.abs(bs.err[c][k]));
  const amp = 0.10 * epk / Math.sqrt(2 * NH);
  const U = [], dE = [], dT = [];
  for (let q = 0; q < NP; q++) {
    const W = { re: [new Float64Array(NH), new Float64Array(NH)], im: [new Float64Array(NH), new Float64Array(NH)] };
    for (let h = 0; h < NH; h++) for (let c = 0; c < 2; c++) {
      const ph = -Math.PI * (h + 1) * h / NH + q * 2 * Math.PI / NP + 2 * Math.PI * q * c / NP;
      W.re[c][h] = amp * Math.cos(ph); W.im[c][h] = amp * Math.sin(ph);
    }
    const corr = { at(k) {
      let x = 0, y = 0;
      for (let h = 1; h <= NH; h++) { const a = 2 * Math.PI * h * k / LAP, c = Math.cos(a), sn = Math.sin(a);
        x += W.re[0][h - 1] * c + W.im[0][h - 1] * sn; y += W.re[1][h - 1] * c + W.im[1][h - 1] * sn; }
      return [x, y];
    } };
    ARM_ON = !disarm;
    const r = await run(corr);
    ARM_ON = true;
    const E = proj(r.err), T = proj(r.tau);
    U.push(Array.from({ length: NH }, (_, h) => [W.re[0][h], W.im[0][h], W.re[1][h], W.im[1][h]]));
    dE.push(Array.from({ length: NH }, (_, h) => vecOf(E, h).map((v, i) => v - vecOf(E0, h)[i])));
    dT.push(Array.from({ length: NH }, (_, h) => vecOf(T, h).map((v, i) => v - vecOf(T0, h)[i])));
  }
  const Gu = [], S = [], Gt = [];
  for (let h = 0; h < NH; h++) { Gu.push(fitOp(U, dE, h)); S.push(fitOp(U, dT, h)); Gt.push(fitOp(dT, dE, h)); }
  return { Gu, S, Gt, E0, base: bs.score };
}

const clean = await probeAll(true);
const dep = await probeAll(false);

const cg = (M, c) => (M ? { a: (M[2 * c][2 * c] + M[2 * c + 1][2 * c + 1]) / 2, b: (M[2 * c + 1][2 * c] - M[2 * c][2 * c + 1]) / 2 } : null);
const mag = (g) => (g ? Math.hypot(g.a, g.b) : NaN);
const deg = (g) => (g ? Math.atan2(g.b, g.a) * 180 / Math.PI : NaN);
const rows = [];
for (let h = 0; h < NH; h++) rows.push({ h: h + 1, e: Math.hypot(...vecOf(clean.E0, h)) });
rows.sort((x, y) => y.e - x.e);

console.log(`\n  deployed ${dep.base.toExponential(4)}   clean ${clean.base.toExponential(4)}\n`);
console.log('     h    |E|      Gu ratio  Gu dphase |  S ratio   S dphase |  Gt ratio  Gt dphase');
const acc = { gu: [0, 0], s: [0, 0], gt: [0, 0] }, tot = { v: 0 };
for (const r of rows.slice(0, 10)) {
  const h = r.h - 1;
  const one = (A, B) => {
    const a = cg(A[h], 0), b = cg(B[h], 0);
    if (!a || !b || !(mag(a) > 0)) return null;
    let d = deg(b) - deg(a); while (d > 180) d -= 360; while (d < -180) d += 360;
    return { ratio: mag(b) / mag(a), d };
  };
  const u = one(clean.Gu, dep.Gu), sv = one(clean.S, dep.S), t = one(clean.Gt, dep.Gt);
  if (!u || !sv || !t) continue;
  tot.v += r.e;
  acc.gu[0] += r.e * Math.abs(Math.log(u.ratio)); acc.gu[1] += r.e * Math.abs(u.d);
  acc.s[0] += r.e * Math.abs(Math.log(sv.ratio)); acc.s[1] += r.e * Math.abs(sv.d);
  acc.gt[0] += r.e * Math.abs(Math.log(t.ratio)); acc.gt[1] += r.e * Math.abs(t.d);
  console.log(`  ${String(r.h).padStart(4)}  ${r.e.toExponential(2)}  ${u.ratio.toFixed(3).padStart(8)} ${u.d.toFixed(1).padStart(9)}  |`
    + ` ${sv.ratio.toFixed(3).padStart(8)} ${sv.d.toFixed(1).padStart(9)}  | ${t.ratio.toFixed(3).padStart(8)} ${t.d.toFixed(1).padStart(9)}`);
}
const rep = (n, a) => `${n}: gain x${Math.exp(a[0] / tot.v).toFixed(2)}, phase ${(a[1] / tot.v).toFixed(1)} deg`;
console.log(`\n  ENERGY-WEIGHTED DRIFT, clean -> deployed`);
console.log(`    ${rep('Gu  command->error ', acc.gu)}`);
console.log(`    ${rep('S   command->torque', acc.s)}`);
console.log(`    ${rep('Gt  torque ->error ', acc.gt)}`);
console.log('\n  If Gt drifts far less than Gu, the structure is invariant and the servo is not:');
console.log('  identify the structure once, re-measure only the servo on the deployed machine.');
