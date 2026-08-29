// IS THE MOVING OPERATOR BANDED? — the model question for the machine as it actually runs.
//
// Two measurements have now bracketed this. `_gq.mjs` showed the local operator is strongly
// configuration-dependent and that a plane in q predicts it on unseen poses. `_gqmove.mjs`
// showed that NONE of that survives the machine moving: both a global and a plane-scheduled
// held-pose operator sit 26-45% from the operator the machine shows in motion, the plane
// buys exactly nothing there, and a single scalar per harmonic leaves 18-39%. So a
// held-pose calibration cannot serve, and scheduling has to be identified in motion.
//
// In motion on ONE program q(k) is a deterministic function of lap phase, so a
// pose-scheduled operator IS a harmonic-coupled one: multiplying the correction by a
// lap-periodic gain convolves in frequency, coupling h to its neighbours. That equivalence
// was raised before as an objection and correctly rejected as one — it is an identifiability
// statement, not an emptiness statement. Here it is the opposite: it tells us the in-motion
// scheduling is REACHABLE from ordinary lap-periodic probes, with no pose survey at all.
//
// brick 63 built a block-tridiagonal solve and measured it neutral (8.46x against 8.47x).
// That was an ENDPOINT comparison on the trained program, and a frozen-operator Newton
// converges to zero error regardless of operator quality — so it had almost no power to
// test the model. This asks the model question directly instead: fit a diagonal operator and
// a banded one on the same probes, and score both on probes NEITHER has seen. No controller,
// no iteration, nothing that can self-correct.
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
const LAPS = +(process.env.LAPS || 3);
const NPROBE = +(process.env.NPROBE || 14);   // 10 to fit, 4 held out

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

async function runProgram(uOf) {
  const { arm, l1, l2, servo } = await machine();
  const rc = commissionComp(arm, servo);
  if (!REFS[0]) for (let k = 0; k < LAP; k++) { const c = path.at(k); REFS[k] = arm.ik(c.x, c.y, true); }
  settle(arm, servo, REFS[0][0], REFS[0][1]);
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
// Ridge least squares, normal equations with a relative ridge. Returns null on a system it
// cannot trust rather than a fitted answer for a singular one.
function ridge(A, y, lam) {
  const n = A[0].length, m = A.length;
  const N = Array.from({ length: n }, () => new Float64Array(n));
  const b = new Float64Array(n);
  let tr = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) { let s = 0; for (let r = 0; r < m; r++) s += A[r][i] * A[r][j]; N[i][j] = s; }
    let s2 = 0; for (let r = 0; r < m; r++) s2 += A[r][i] * y[r];
    b[i] = s2; tr += N[i][i];
  }
  const rg = lam * tr / n;
  for (let i = 0; i < n; i++) N[i][i] += rg;
  const M = N.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-300)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return Array.from({ length: n }, (_, i) => M[i][n] / M[i][i]);
}

console.log(`\nis the moving operator BANDED?  [K ${K} E ${E}, NH ${NH}, ${NPROBE} probes, lap ${LAP}]\n`);
console.log(`  fitting a DIAGONAL operator and a BANDED one (h coupled to h+-1) on the same`);
console.log(`  probes, scoring both on probes neither has seen. No controller in the loop.\n`);

// Random multisine probes: each carries every harmonic at a random phase, so the input
// spectrum is rich in all NH and the columns are not collinear.
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const base0 = await runProgram(() => [0, 0]);
const Z = [project(base0[0]), project(base0[1])];
const U = [], Eo = [];
for (let p = 0; p < NPROBE; p++) {
  const ph = Array.from({ length: 2 * NH }, () => rnd() * 2 * Math.PI);
  const uOf = (k) => {
    let a = 0, b = 0;
    for (let h = 1; h <= NH; h++) {
      const x = 2 * Math.PI * h * k / LAP;
      a += Math.cos(x + ph[h - 1]); b += Math.cos(x + ph[NH + h - 1]);
    }
    return [AMP * a / NH, AMP * b / NH];
  };
  // The input's own spectrum, exactly, rather than the intended one.
  const u0 = new Float64Array(LAP), u1 = new Float64Array(LAP);
  for (let k = 0; k < LAP; k++) { const v = uOf(k); u0[k] = v[0]; u1[k] = v[1]; }
  const e = await runProgram(uOf);
  U.push([project(u0), project(u1)]);
  Eo.push([project(e[0]), project(e[1])]);
  process.stdout.write(`  probe ${p + 1}/${NPROBE}\n`);
}
const NTEST = 4, tr = NPROBE - NTEST;
const col = (P, h) => [P[0].re[h], P[0].im[h], P[1].re[h], P[1].im[h]];
const dE = (p, h) => [Eo[p][0].re[h] - Z[0].re[h], Eo[p][0].im[h] - Z[0].im[h],
  Eo[p][1].re[h] - Z[1].re[h], Eo[p][1].im[h] - Z[1].im[h]];

console.log(`\n   h    DIAGONAL err    BANDED err    banded/diagonal   (on ${NTEST} unseen probes)`);
let dSum = 0, bSum = 0, tSum = 0;
for (let h = 0; h < NH; h++) {
  // Rows: one per training probe per output component. Columns: the operator entries.
  const cols = (p) => {
    const c0 = col(U[p], h);
    if (h === 0) return [...c0, ...col(U[p], 1)];
    if (h === NH - 1) return [...c0, ...col(U[p], h - 1)];
    return [...c0, ...col(U[p], h - 1), ...col(U[p], h + 1)];
  };
  let dh = 0, bh = 0, th = 0;
  for (let r = 0; r < 4; r++) {
    const Ad = [], Ab = [], y = [];
    for (let p = 0; p < tr; p++) { Ad.push(col(U[p], h)); Ab.push(cols(p)); y.push(dE(p, h)[r]); }
    const wd = ridge(Ad, y, 1e-6), wb = ridge(Ab, y, 1e-6);
    if (!wd || !wb) continue;
    for (let p = tr; p < NPROBE; p++) {
      const xd = col(U[p], h), xb = cols(p), t = dE(p, h)[r];
      let pd = 0, pb = 0;
      for (let i = 0; i < xd.length; i++) pd += wd[i] * xd[i];
      for (let i = 0; i < xb.length; i++) pb += wb[i] * xb[i];
      dh += (t - pd) ** 2; bh += (t - pb) ** 2; th += t * t;
    }
  }
  dSum += dh; bSum += bh; tSum += th;
  const rel = (x) => 100 * Math.sqrt(x / Math.max(1e-300, th));
  console.log(`  ${String(h + 1).padStart(2)}     ${rel(dh).toFixed(1).padStart(7)}%      ${rel(bh).toFixed(1).padStart(7)}%`
    + `        ${(Math.sqrt(bh / Math.max(1e-300, dh))).toFixed(2)}`);
}
const relT = (x) => 100 * Math.sqrt(x / Math.max(1e-300, tSum));
console.log(`\n  all harmonics together:  diagonal ${relT(dSum).toFixed(1)}%   banded ${relT(bSum).toFixed(1)}%`
  + `   ratio ${Math.sqrt(bSum / Math.max(1e-300, dSum)).toFixed(2)}`);
console.log(`\n  Below 1 says the coupling is real AND predictive, so a pose-scheduled operator`);
console.log(`  identified in motion has something to give the solver. Near 1 says the diagonal`);
console.log(`  operator is already as good as this data supports, and the remaining distance`);
console.log(`  to the floor is the ITERATION rather than the model.\n`);
