// DOES THE OPERATOR TRANSFER TO A PROGRAM IT HAS NEVER SEEN? — and does banded transfer better?
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
import { roundedRect } from '../../lib/flexisim/toolpath.js';
// ONE rig, shared. See _rig.mjs for why eight copies of a machine is eight
// chances for one of them to stop being the machine everything else was measured on.
import { machine, settle, commissionComp, projector } from './_rig.mjs';

const K = +(process.env.K || 1), E = +(process.env.E || 0.06);
// TWO PROGRAMS THAT SHARE A LAP. roundedRect's perimeter is 2(w+h) - 8r + 2*pi*r, so 8x8
// and 10x6 at r 1.5 are both 29.424778 long — the SAME lap in solver steps, hence the same
// harmonic frequencies, over an entirely different pose trajectory. That is what makes
// operator transfer answerable by prediction alone: fit on one, predict the other, and the
// harmonics mean the same thing on both sides.
const P0 = { r: 1.5, centre: [12, 0], feed: 4e-3, accel: 4e-5, cornerDt: 40, closed: true };
const PATH = { ...P0, w: 8, h: 8 };
const PATH_B = { ...P0, w: 10, h: 6 };
const NH = +(process.env.NH || 8);
const AMP = +(process.env.AMP || 2e-3);
const LAPS = +(process.env.LAPS || 3);
// ENOUGH PROBES THAT THE RICHER MODEL IS DETERMINED, which the first run of this was not.
// An interior harmonic's banded row has 12 unknowns (h, h-1, h+1 at four components each)
// and the first version fitted them from 10 training probes — underdetermined, so the ridge
// chose the answer rather than the data, and the banded model lost on held-out probes for a
// reason that had nothing to do with the plant. The tell was in the output: h1 and h8 are
// EDGE harmonics with only 8 unknowns, and h1 — determined — was the one harmonic where
// banded WON, at 0.53. This repository has the same defect on record from the other side:
// 'three was right for one channel and silently UNDERDETERMINED for two — the solve returned
// a fitted rank-deficient answer'. A model must be given the chance to be right before its
// failure means anything.
const NPROBE = +(process.env.NPROBE || 30);   // 26 to fit against 12 unknowns, 4 held out

let path = roundedRect(PATH);
const LAP = Math.ceil(path.lap);
let REFS = new Array(LAP);
const usePath = (spec) => { path = roundedRect(spec); REFS = new Array(LAP); };

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
const project = projector(LAP, NH);
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

console.log(`\ndoes the operator TRANSFER to a program it has never seen?`);
console.log(`  [K ${K} E ${E}, NH ${NH}, ${NPROBE} probes each, lap ${LAP} on both]\n`);
console.log(`  Both operators are fitted on the 8x8 program and scored on the 10x6 one —`);
console.log(`  same perimeter to six decimals, so the same lap and the same harmonics, over`);
console.log(`  an entirely different pose trajectory. The same probe phases are used on both,`);
console.log(`  so the only thing that differs between the datasets is the machine's own`);
console.log(`  behaviour. No controller in the loop.\n`);

// Random multisine probes: each carries every harmonic at a random phase, so the input
// spectrum is rich in all NH and the columns are not collinear.
// The same probe phases on both programs, so the only difference between the two datasets
// is the machine's behaviour rather than what it was asked.
const phases = [];
{
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let p = 0; p < NPROBE; p++) phases.push(Array.from({ length: 2 * NH }, () => rnd() * 2 * Math.PI));
}
const probeOf = (ph) => (k) => {
  let a = 0, b = 0;
  for (let h = 1; h <= NH; h++) {
    const x = 2 * Math.PI * h * k / LAP;
    a += Math.cos(x + ph[h - 1]); b += Math.cos(x + ph[NH + h - 1]);
  }
  return [AMP * a / NH, AMP * b / NH];
};
async function collect(spec, label) {
  usePath(spec);
  const b0 = await runProgram(() => [0, 0]);
  const Z = [project(b0[0]), project(b0[1])];
  const U = [], Eo = [];
  for (let p = 0; p < NPROBE; p++) {
    const uOf = probeOf(phases[p]);
    const u0 = new Float64Array(LAP), u1 = new Float64Array(LAP);
    for (let k = 0; k < LAP; k++) { const v = uOf(k); u0[k] = v[0]; u1[k] = v[1]; }
    const e = await runProgram(uOf);
    U.push([project(u0), project(u1)]);
    Eo.push([project(e[0]), project(e[1])]);
    process.stdout.write(`  ${label} probe ${p + 1}/${NPROBE}\r`);
  }
  process.stdout.write(`  ${label}: ${NPROBE} probes done            \n`);
  return { Z, U, Eo };
}

const A = await collect(PATH, '8x8 (fit)');
const B = await collect(PATH_B, '10x6 (test)');

const col = (P, h) => [P[0].re[h], P[0].im[h], P[1].re[h], P[1].im[h]];
const dEof = (S, p, h) => [S.Eo[p][0].re[h] - S.Z[0].re[h], S.Eo[p][0].im[h] - S.Z[0].im[h],
  S.Eo[p][1].re[h] - S.Z[1].re[h], S.Eo[p][1].im[h] - S.Z[1].im[h]];

const NPAR = 12;
if (NPROBE < NPAR + 4) {
  console.log(`\n  REFUSING: ${NPROBE} probes against ${NPAR} unknowns in the banded model.\n`);
  process.exit(2);
}

console.log(`\n   h   DIAG on 10x6   BAND on 10x6   band/diag    (DIAG held-out on 8x8, for scale)`);
let dS = 0, bS = 0, tS = 0;
for (let h = 0; h < NH; h++) {
  const cols = (S, p) => {
    const c0 = col(S.U[p], h);
    if (h === 0) return [...c0, ...col(S.U[p], 1)];
    if (h === NH - 1) return [...c0, ...col(S.U[p], h - 1)];
    return [...c0, ...col(S.U[p], h - 1), ...col(S.U[p], h + 1)];
  };
  let dh = 0, bh = 0, th = 0, ah = 0, at = 0;
  for (let r = 0; r < 4; r++) {
    const Ad = [], Ab = [], y = [];
    for (let p = 0; p < NPROBE; p++) { Ad.push(col(A.U[p], h)); Ab.push(cols(A, p)); y.push(dEof(A, p, h)[r]); }
    const wd = ridge(Ad, y, 1e-6), wb = ridge(Ab, y, 1e-6);
    if (!wd || !wb) continue;
    for (let p = 0; p < NPROBE; p++) {
      const xd = col(B.U[p], h), xb = cols(B, p), t = dEof(B, p, h)[r];
      let pd = 0, pb = 0;
      for (let i2 = 0; i2 < xd.length; i2++) pd += wd[i2] * xd[i2];
      for (let i2 = 0; i2 < xb.length; i2++) pb += wb[i2] * xb[i2];
      dh += (t - pd) ** 2; bh += (t - pb) ** 2; th += t * t;
    }
    // Within-program reference: the last 4 of A, fitted on the rest, diagonal only.
    const Ad2 = [], y2 = [];
    for (let p = 0; p < NPROBE - 4; p++) { Ad2.push(col(A.U[p], h)); y2.push(dEof(A, p, h)[r]); }
    const wd2 = ridge(Ad2, y2, 1e-6);
    if (wd2) for (let p = NPROBE - 4; p < NPROBE; p++) {
      const xd = col(A.U[p], h), t = dEof(A, p, h)[r];
      let pd = 0; for (let i2 = 0; i2 < xd.length; i2++) pd += wd2[i2] * xd[i2];
      ah += (t - pd) ** 2; at += t * t;
    }
  }
  dS += dh; bS += bh; tS += th;
  const rel = (x, tt) => 100 * Math.sqrt(x / Math.max(1e-300, tt));
  console.log(`  ${String(h + 1).padStart(2)}    ${rel(dh, th).toFixed(1).padStart(7)}%      ${rel(bh, th).toFixed(1).padStart(7)}%`
    + `      ${(Math.sqrt(bh / Math.max(1e-300, dh))).toFixed(2)}          ${rel(ah, at).toFixed(1)}%`);
}
const relT = (x) => 100 * Math.sqrt(x / Math.max(1e-300, tS));
console.log(`\n  all harmonics:  diagonal ${relT(dS).toFixed(1)}%   banded ${relT(bS).toFixed(1)}%`
  + `   ratio ${Math.sqrt(bS / Math.max(1e-300, dS)).toFixed(2)}`);
console.log(`\n  These are errors on a program NEITHER operator was fitted on. The last column`);
console.log(`  is the same diagonal operator scored WITHIN the program it was fitted on, so`);
console.log(`  the cost of crossing programs is the difference between it and the first.`);
console.log(`  A banded operator that transfers is a plant model; one that does not is a`);
console.log(`  second memory wearing a model's clothes.\n`);
