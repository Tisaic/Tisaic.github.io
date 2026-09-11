/**
 * @file **Not a test — THE "MODEL IT INSTEAD OF FITTING IT" ROUTE ON THE KUKA, AND THE REASON
 * IT STILL DOES NOT PRODUCE A PLANT (plan §55.11).**
 *
 * §55.8-10 established that no black-box model fitted to this benchmark survives a free run,
 * and left the classical route open with its gate named: rigid-body dynamics is LINEAR IN THE
 * INERTIAL PARAMETERS, so IDIM-LS identifies it by least squares — given the KINEMATICS, which
 * this repository did not have. The kinematics were then sourced (`rigs/realdata/kuka-kin.mjs`,
 * two independent sources agreeing to 1.3e-16 m), and this is what the route delivers.
 *
 * **THE IDENTIFICATION SUCCEEDS AND THE FORWARD SIMULATION STILL FAILS, AND THE REASON IS THE
 * RECORD RATHER THAN THE MODEL.** Held out, the inverse model reads R² 0.78-0.89 per joint with
 * train ≈ test. The forward equation `qdd = M^-1 (tau - h)` built from the SAME beta reads R²
 * ≈ 0 or negative on five of six joints — IN SAMPLE, with q, qd, qdd AND tau all measured, so
 * neither the integrator nor the missing velocity record can be blamed.
 *
 * **WHAT SEPARATES THOSE TWO NUMBERS IS WHAT THE TORQUE IS MADE OF.** Newton-Euler has no
 * product of qdd with qd or with g, so the model torque splits EXACTLY into three additive
 * groups (asserted here to 0.04%, not assumed). Decomposed, GRAVITY IS THE TORQUE: 6.7 of
 * 7.3 N·m on the shoulder and 9.6 of 10.0 on the elbow. The INERTIAL term — the only part that
 * carries qdd, and the only part the forward direction can use — is 1.0-1.2 N·m against a fit
 * residual of 1.2-1.4. **The model's own error exceeds the entire signal the forward problem
 * needs, on five of six joints**, so an R² of 0.85 on torque is an R² of ~0 on acceleration.
 *
 * **THE ONE JOINT THAT WORKS SAYS THE SAME THING FROM THE OTHER SIDE (rule 15).** Joint 0 is
 * the vertical axis: its gravity torque is EXACTLY zero, its inertial/residual ratio is the
 * only one above 1.0, and it is the only joint whose forward prediction reads R² 0.73. The two
 * readings are independent and they agree.
 *
 * **AND IT IS THE EXCITATION, NOT THE AVERAGING (rule 19).** Split by each joint's own |qdd|
 * decile the ratio rises to 2.2-3.0 in the top 10% and up to 5.4 in the top 1%, so the dynamics
 * ARE in the record — in a small minority of its samples. Peak |qdd| is 14-40 deg/s², a few
 * percent of what a KR300 can do. Rule 41b from the other side: an excitation adequate for the
 * benchmark's OWN inverse task and inadequate for the forward one.
 *
 * **THREE CONTROLS SAY THE MODEL IS NOT THE LIMITATION**, which is what makes the sentence
 * above a statement about the record rather than about this file:
 *   - the fit is SATURATED — 625 training rows read the same held-out error as 19,994, so the
 *     residual is structural and not estimation variance;
 *   - a 490-feature universal map of the SAME 18 inputs on the SAME rows (rule 20) is WORSE on
 *     every joint, so six times the freedom does not reach it either;
 *   - the regressor passes four structural controls at machine precision in
 *     `realkuka.test.mjs`, including M(q) symmetry with ARBITRARY parameters — a property of
 *     the recursion that no identification can fake.
 *
 * KNOBS: `STRIDE` (training rows), `LAM`, `FLOOR=1` (the capacity control, slow), `FREE=1`
 * (the free run, slow), `SUB` (its sub-stepping).
 */
import { readMat } from './rigs/realdata/matread.mjs';
import { regressor, identify, dynamics, NP, NL } from './rigs/realdata/kuka-kin.mjs';

const D2R = Math.PI / 180;
const STRIDE = Number(process.env.STRIDE || 2);
const LAM = Number(process.env.LAM || 1e-6);
const R = (p) => readMat(new URL(`rigs/realdata/records/kuka/${p}`, import.meta.url).pathname);

// THE RECORD IS IN DEGREES AND THE MODEL IS IN RADIANS — the benchmark's README says so, and
// skipping the conversion silently identifies a robot 57 times too fast (rule 17).
const split = (U) => ({
  q: U.map((r) => Array.from({ length: 6 }, (_, c) => r[c] * D2R)),
  qd: U.map((r) => Array.from({ length: 6 }, (_, c) => r[6 + c] * D2R)),
  qdd: U.map((r) => Array.from({ length: 6 }, (_, c) => r[12 + c] * D2R)),
});
const d = R('inverse.mat');
const TR = split(d.u_train), TE = split(d.u_test), Ytr = d.y_train, Yte = d.y_test;

console.log('\nKUKA KR300 — IDIM-LS, and what the identified model can and cannot do\n');
const { beta, rows } = identify(TR, Ytr, { lam: LAM, stride: STRIDE });
const dyn = dynamics(beta);
console.log(`identified ${NP} parameters from ${rows} rows x ${NL} joints, ridge ${LAM}`);
// READ NO SINGLE PARAMETER AS A MASS OR AN INERTIA. The excitation does not move every
// direction of the parameter space, and a nearly-dead column divided by its own nearly-zero
// scale comes back at 1e14. The PREDICTIONS are unaffected — what is huge multiplies what is
// tiny — but a structurally-zero quantity computed from it lands at 1e-2 N.m of f64
// cancellation rather than at zero, which is where the joint-0 gravity row below comes from.
console.log(`  max|beta| ${Math.max(...Array.from(beta, Math.abs)).toExponential(2)} — the fit is `
  + `in an unidentifiable parameterisation, so no single entry is a physical quantity`);

// ---- 1. THE INVERSE PROBLEM, which is the one the benchmark poses ------------------------
function score(name, S, T) {
  const se = new Float64Array(6), sy = new Float64Array(6), mu = new Float64Array(6);
  for (const r of T) for (let i = 0; i < 6; i++) mu[i] += r[i] / T.length;
  for (let k = 0; k < T.length; k++) {
    const p = dyn.tau(S.q[k], S.qd[k], S.qdd[k]);
    for (let i = 0; i < 6; i++) { se[i] += (p[i] - T[k][i]) ** 2; sy[i] += (T[k][i] - mu[i]) ** 2; }
  }
  console.log(`  ${name.padEnd(18)}` + Array.from({ length: 6 }, (_, i) =>
    (1 - se[i] / sy[i]).toFixed(3).padStart(8)).join(''));
  return Array.from({ length: 6 }, (_, i) => Math.sqrt(se[i] / T.length));
}
console.log('\n1. THE INVERSE MODEL — R2 on torque, per joint');
console.log('  ' + 'joint'.padEnd(18) + [0, 1, 2, 3, 4, 5].map((j) => String(j).padStart(8)).join(''));
score('train (in sample)', TR, Ytr);
const rmsTe = score('test  (held out)', TE, Yte);
console.log(`  train ≈ test is the thing to read here: ${NP} parameters against ${rows * NL} `
  + `equations cannot\n  overfit, so the held-out number is the model and not the split.`);

// ---- 2. THE FORWARD PROBLEM, on the SAME record, with everything measured ------------------
// The free run mixes the model, the integrator and the fact that the forward record carries no
// measured qd/qdd. Take the last two away and what is left is the model alone (rule 1).
console.log('\n2. THE FORWARD EQUATION qdd = M^-1 (tau - h), on the INVERSE record where q, qd,');
console.log('   qdd and tau are ALL measured — so neither the integrator nor a missing velocity');
console.log('   record can be blamed for what it reads.');
function fwd(name, S, T) {
  const se = new Float64Array(6), sy = new Float64Array(6), mu = new Float64Array(6);
  for (const r of S.qdd) for (let i = 0; i < 6; i++) mu[i] += r[i] / S.qdd.length;
  for (let k = 0; k < T.length; k++) {
    const a = dyn.forward(S.q[k], S.qd[k], T[k]);
    for (let i = 0; i < 6; i++) { se[i] += (a[i] - S.qdd[k][i]) ** 2; sy[i] += (S.qdd[k][i] - mu[i]) ** 2; }
  }
  console.log(`  ${name.padEnd(18)}` + Array.from({ length: 6 }, (_, i) =>
    (1 - se[i] / sy[i]).toFixed(3).padStart(8)).join(''));
}
console.log('  ' + 'joint'.padEnd(18) + [0, 1, 2, 3, 4, 5].map((j) => String(j).padStart(8)).join(''));
fwd('train (in sample)', TR, Ytr);
fwd('test  (held out)', TE, Yte);

// ---- 3. WHAT THE TORQUE IS MADE OF, which is why those two disagree -----------------------
const ZERO = [0, 0, 0, 0, 0, 0];
function parts(q, qd, qdd) {
  const iner = dyn.tau(q, ZERO, qdd, 0);
  const vel = dyn.tau(q, qd, ZERO, 0);
  const grav = dyn.tau(q, ZERO, ZERO, 9.81);
  const full = dyn.tau(q, qd, qdd, 9.81);
  return { iner, vel, grav, full };
}
function decompose(name, S, T) {
  const a = { iner: new Float64Array(6), vel: new Float64Array(6), grav: new Float64Array(6),
    meas: new Float64Array(6), res: new Float64Array(6) };
  let sd = 0, sf = 0, n = 0;
  for (let k = 0; k < T.length; k++) {
    const p = parts(S.q[k], S.qd[k], S.qdd[k]);
    for (let i = 0; i < 6; i++) {
      a.iner[i] += p.iner[i] ** 2; a.vel[i] += p.vel[i] ** 2; a.grav[i] += p.grav[i] ** 2;
      a.meas[i] += T[k][i] ** 2; a.res[i] += (T[k][i] - p.full[i]) ** 2;
      // The additive split is a CONTROL, not an assumption. Accumulated as an ABSOLUTE rms: a
      // per-sample RELATIVE error blows up wherever a torque crosses zero (rule 19), which is
      // how the first version of this line reported 650% and looked like a broken decomposition.
      sd += (p.iner[i] + p.vel[i] + p.grav[i] - p.full[i]) ** 2; sf += p.full[i] ** 2;
    }
    n++;
  }
  const rm = (x, i) => Math.sqrt(x[i] / n);
  console.log(`\n3. ${name} — the torque decomposed, rms N.m over ${n} samples`);
  console.log('  joint   measured   gravity  vel+fric  INERTIAL  fit resid   inertial/resid');
  for (let i = 0; i < 6; i++)
    console.log(`    ${i}  ${rm(a.meas, i).toFixed(2).padStart(9)} ${rm(a.grav, i).toFixed(2).padStart(9)}`
      + ` ${rm(a.vel, i).toFixed(2).padStart(9)} ${rm(a.iner, i).toFixed(2).padStart(9)}`
      + ` ${rm(a.res, i).toFixed(2).padStart(10)} ${(rm(a.iner, i) / rm(a.res, i)).toFixed(2).padStart(15)}`
      + (rm(a.iner, i) / rm(a.res, i) < 1 ? '   <- below the noise floor' : ''));
  console.log(`  additive split residual ${Math.sqrt(sd / (n * 6)).toExponential(2)} N.m rms against `
    + `${Math.sqrt(sf / (n * 6)).toFixed(3)} N.m of model torque `
    + `(${(Math.sqrt(sd / sf) * 100).toExponential(1)}% — a control, not an assumption)`);
  console.log('  …and ALL of that residual is joint 0, where the quantity is structurally zero '
    + 'and\n    what is left is cancellation against max|beta|. `realkuka.test.mjs` runs the same\n'
    + '    control with O(1) parameters, where it reads 1e-13% (rules 17, 32).');
  return a;
}
decompose('TRAIN', TR, Ytr);
decompose('TEST ', TE, Yte);

// ---- 4. IS IT THE AVERAGE HIDING THE FAST SAMPLES? (rule 19) ------------------------------
console.log('\n4. the same ratio by each joint\'s OWN acceleration decile — a whole-record rms');
console.log('   cannot see dynamics that live in a minority of the samples');
{
  const P = [];
  for (let k = 0; k < Ytr.length; k++) P.push(parts(TR.q[k], TR.qd[k], TR.qdd[k]));
  console.log('  joint   rms|qdd|  peak|qdd|      all   top 10%    top 1%   (deg/s2)');
  for (let i = 0; i < 6; i++) {
    const idx = P.map((_, k) => k).sort((x, y) => Math.abs(TR.qdd[y][i]) - Math.abs(TR.qdd[x][i]));
    const band = (m) => {
      let si = 0, sr = 0;
      for (let j = 0; j < m; j++) { const k = idx[j];
        si += P[k].iner[i] ** 2; sr += (Ytr[k][i] - P[k].full[i]) ** 2; }
      return Math.sqrt(si / sr);
    };
    let sq = 0, pk = 0;
    for (let k = 0; k < Ytr.length; k++) { sq += TR.qdd[k][i] ** 2; pk = Math.max(pk, Math.abs(TR.qdd[k][i])); }
    console.log(`    ${i} ${(Math.sqrt(sq / Ytr.length) / D2R).toFixed(2).padStart(10)}`
      + ` ${(pk / D2R).toFixed(2).padStart(10)} ${band(idx.length).toFixed(2).padStart(8)}`
      + ` ${band(Math.round(idx.length * 0.1)).toFixed(2).padStart(9)} ${band(Math.round(idx.length * 0.01)).toFixed(2).padStart(9)}`);
  }
}

// ---- 5. IS THE RESIDUAL THE MODEL OR THE RECORD? (rule 9, both halves) --------------------
console.log('\n5. is that residual MY MODEL or the RECORD? — the fit is SATURATED in data');
console.log('   (if 625 rows read what 19,994 read, the residual is structural, not variance)');
console.log('  stride    rows' + [0, 1, 2, 3, 4, 5].map((j) => `  joint ${j}`).join(''));
for (const st of [STRIDE, 16, 64]) {
  const f = identify(TR, Ytr, { lam: LAM, stride: st });
  const dy = dynamics(f.beta);
  const out = Array.from({ length: 6 }, () => 0);
  for (let k = 0; k < Yte.length; k++) { const p = dy.tau(TE.q[k], TE.qd[k], TE.qdd[k]);
    for (let i = 0; i < 6; i++) out[i] += (p[i] - Yte[k][i]) ** 2; }
  console.log(`  ${String(st).padStart(6)}  ${String(f.rows).padStart(6)}`
    + out.map((v) => Math.sqrt(v / Yte.length).toFixed(4).padStart(9)).join(''));
}

if (process.env.FLOOR) {
  // …and the other half: a far richer class of the SAME 18 inputs on the SAME rows (rule 20).
  const { universalMap } = await import('../../lib/ngrc/feature_map.js');
  const raw = (U) => U.map((r) => Array.from({ length: 18 }, (_, c) => r[c] * D2R));
  const Xtr = raw(d.u_train), Xte = raw(d.u_test);
  const mu = new Float64Array(18), sd = new Float64Array(18);
  // The standardisation belongs to the TRAINING stream alone (rule 38).
  for (const r of Xtr) for (let c = 0; c < 18; c++) mu[c] += r[c] / Xtr.length;
  for (const r of Xtr) for (let c = 0; c < 18; c++) sd[c] += (r[c] - mu[c]) ** 2 / Xtr.length;
  for (let c = 0; c < 18; c++) sd[c] = Math.sqrt(sd[c]) || 1;
  const std = (X) => X.map((r) => Array.from({ length: 18 }, (_, c) => (r[c] - mu[c]) / sd[c]));
  const uni = universalMap(18, 150, 150, 7);
  const Ftr = std(Xtr.filter((_, i) => i % STRIDE === 0)).map((z) => uni.expand(z));
  const Fte = std(Xte).map((z) => uni.expand(z));
  const Ttr = Ytr.filter((_, i) => i % STRIDE === 0);
  console.log(`\n5b. a ${uni.m}-feature universal map of the same 18 inputs, on the same rows`);
  console.log('  joint   rigid body (78p)   universal map');
  for (let j = 0; j < 6; j++) {
    let best = Infinity;
    for (const lam of [1e-6, 1e-4, 1e-2]) {
      const w = ridge(Ftr, Ttr, j, lam);
      if (!w) continue;
      let s = 0;
      for (let k = 0; k < Fte.length; k++) { let p = 0;
        for (let c = 0; c < w.length; c++) p += Fte[k][c] * w[c]; s += (p - Yte[k][j]) ** 2; }
      best = Math.min(best, Math.sqrt(s / Fte.length));
    }
    console.log(`    ${j}   ${rmsTe[j].toFixed(3).padStart(15)}   ${best.toFixed(3).padStart(13)}`);
  }
}
function ridge(X, Y, j, lam) {
  const m = X[0].length, A = Array.from({ length: m }, () => new Float64Array(m)), b = new Float64Array(m);
  const sc = new Float64Array(m);
  for (const r of X) for (let c = 0; c < m; c++) sc[c] += r[c] * r[c];
  for (let c = 0; c < m; c++) sc[c] = Math.sqrt(sc[c] / X.length) || 1;
  for (let k = 0; k < X.length; k++) { const r = X[k];
    for (let x = 0; x < m; x++) { const rx = r[x] / sc[x]; if (!rx) continue;
      for (let y = x; y < m; y++) A[x][y] += rx * (r[y] / sc[y]); b[x] += rx * Y[k][j]; } }
  for (let x = 0; x < m; x++) { A[x][x] += lam * X.length; for (let y = 0; y < x; y++) A[x][y] = A[y][x]; }
  const L = Array.from({ length: m }, () => new Float64Array(m));
  for (let j2 = 0; j2 < m; j2++) { let dg = A[j2][j2];
    for (let k = 0; k < j2; k++) dg -= L[j2][k] * L[j2][k];
    if (!(dg > 0)) return null;
    L[j2][j2] = Math.sqrt(dg);
    for (let i = j2 + 1; i < m; i++) { let s = A[i][j2];
      for (let k = 0; k < j2; k++) s -= L[i][k] * L[j2][k]; L[i][j2] = s / L[j2][j2]; } }
  const y0 = new Float64Array(m), w = new Float64Array(m);
  for (let i = 0; i < m; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y0[k]; y0[i] = s / L[i][i]; }
  for (let i = m - 1; i >= 0; i--) { let s = y0[i]; for (let k = i + 1; k < m; k++) s -= L[k][i] * w[k]; w[i] = s / L[i][i]; }
  for (let c = 0; c < m; c++) w[c] /= sc[c];
  return w;
}

if (process.env.FREE) {
  // The free run on the FORWARD benchmark, for completeness. It is the weakest of the numbers
  // here — it carries the integrator and the missing velocity record on top of the model — and
  // section 2 has already answered the question it was built to ask.
  const SUB = Number(process.env.SUB || 1);
  const f = R('forward.mat'), U = f.u_test, Q = f.y_test, DT = 0.1;
  console.log(`\n6. free run on the forward benchmark test record, ${SUB} sub-step(s) per sample`);
  console.log('  horizon    rms (deg)   black-box linear ARX (§55.8)');
  const BB = { 10: 0.090, 20: 1.070, 40: 6.930, 80: 16.861, 160: 21.054 };
  for (const H of [10, 20, 40, 80, 160]) {
    let se = 0, n = 0, bad = false;
    for (let s = 0; s + H <= Q.length && !bad; s += H) {
      let q = Array.from({ length: 6 }, (_, c) => Q[s][c] * D2R);
      let qd = Array.from({ length: 6 }, (_, c) => (Q[s + 1][c] - Q[s][c]) * D2R / DT);
      for (let k = 1; k < H && !bad; k++) {
        for (let u = 0; u < SUB; u++) {
          const acc = dyn.forward(q, qd, U[s + k - 1]);
          if (!acc.every(isFinite)) { bad = true; break; }
          qd = qd.map((v, i) => v + (DT / SUB) * acc[i]);
          q = q.map((v, i) => v + (DT / SUB) * qd[i]);
        }
        if (Math.max(...q.map(Math.abs)) > 100) { bad = true; break; }
        for (let c = 0; c < 6; c++) { se += (Q[s + k][c] - q[c] / D2R) ** 2; n++; }
      }
    }
    console.log(`  ${String(H / 10).padStart(5)}s   ${(bad ? 'diverged' : Math.sqrt(se / n).toFixed(3)).padStart(10)}`
      + `   ${BB[H].toFixed(3).padStart(12)}`);
  }
}
console.log('\n*** THE KUKA STILL DOES NOT BECOME AN EIGHTH PLANT — and the reason is now a');
console.log('    measured property of the RECORD rather than a failure to fit it. ***\n');
