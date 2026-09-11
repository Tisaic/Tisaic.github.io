/**
 * @file THE KUKA KR300 R2500 ultra SE INDUSTRIAL ROBOT (Weigand et al. 2022) — the real
 * six-axis robot this project asked for, and what its record does and does not support.
 *
 * **THE CLOSED-LOOP PLANT IS NOT ESTABLISHED AND THIS FILE DOES NOT REPORT ONE.** What is
 * established is everything below, and it is quoted because a characterisation with a
 * diagnostic trail is worth more than a control factor that measures a bad model — the same
 * standing this project gives `zpetc.mjs` and `directopt.mjs`.
 *
 * WHAT THE RECORD IS: 39,988 training samples and 3,636 test at 10 Hz — 67 minutes of full
 * robot movement — six motor torques in, six joint positions in degrees out. Twelve states,
 * backlash in every joint, pose-dependent inertia, gravity and Coriolis loads.
 *
 * WHAT IS ESTABLISHED, ALL OF IT MEASURED HERE:
 *
 *   - The ONE-STEP fit is essentially exact: 0.09-0.17% NRMSE in sample, 0.02-0.04 deg rms.
 *   - The FREE RUN is not, and the two together are the whole story. This plant integrates
 *     twice, so a one-step predictor handed the true previous position scores beautifully
 *     while the same model simulating itself accumulates. Measured against horizon on the
 *     held-out test record: 0.09 deg at 1 s, 1.07 at 2 s, 6.9 at 4 s, 17 at 8 s, and about
 *     21 deg — no better than predicting the mean — beyond 16 s.
 *   - MORE LAGS BUY HORIZON AND THEN STOP: na 25 reads 0.51 deg at 4 s against na 6's 6.9,
 *     and na 40 reads 4.4 at 8 s against 16.9 — but every order converges to the same ~20 deg
 *     floor by 16 s, so the ceiling is the record and not the model size.
 *   - THE DECISIVE CONTROL IS A REPLAY. Fed the EXACT torques the real robot used, the model
 *     is 18.6 deg off by sample 50 and 32 deg by sample 1000. So a closed-loop factor
 *     measured on it would be measuring the model's drift, not a controller — which is why
 *     none is reported.
 *   - THE GRAVITY FIT RECOVERS THE RIGHT PHYSICS, which is the check that says the record and
 *     the reader are being read correctly (rule 15, an independent route to the same plant).
 *     A static pose regressor explains 34% and 51% of the torque on the shoulder and elbow
 *     and essentially NOTHING on joint 0 and joint 5 — whose axes carry no gravity moment —
 *     on a record the fit never saw. Both halves, and neither was put there by hand.
 *   - THE ARM IS STRONGLY COUPLED AND ITS INERTIAS SPAN 12x (34 to 416 in the record's own
 *     units), and a torque on the shoulder moves the ELBOW FURTHER THAN THE SHOULDER. That is
 *     why a single scalar PD gain across six joints reads 1.22x and per-joint gains designed
 *     from the measured inertias read 1.02x: neither is a controller result, both are a
 *     decoupled law on a coupled plant.
 *
 *   - AND THE CLASSICAL ROUTE IS NOW TAKEN, WHICH CHANGES WHY THIS FILE REPORTS NO PLANT
 *     (plan §55.11). Rigid-body dynamics on kinematics sourced from two independent places
 *     IDENTIFIES this robot — held-out R2 0.785-0.891 from 78 physical parameters — and the
 *     FORWARD equation from the same parameters reads R2 at or below zero on five of six
 *     joints IN SAMPLE with q, qd, qdd and tau all measured. Neither the integrator nor the
 *     missing velocity record is the fault, and both were checked rather than argued: M(q) is
 *     positive definite at condition 12, and sub-stepping 10x moves the free run under 6%.
 *     What separates the two numbers is that GRAVITY IS THE TORQUE — 6.71 of 6.93 N.m on the
 *     shoulder — while the INERTIAL term, the only part carrying qdd, is BELOW the fit's own
 *     residual on five of six joints. So an R2 of 0.85 on torque is an R2 of ~0 on
 *     acceleration: one fit against two denominators (rule 19). **This record identifies the
 *     robot's STATICS, and a forward simulation needs its DYNAMICS.**
 *
 * WHAT WOULD CHANGE THE ANSWER, stated so the next attempt does not start from scratch
 * (rule 59): an EXCITATION that moves this robot at a real fraction of its rated acceleration
 * — a different experiment, not a different fit. Peak |qdd| here is 14-40 deg/s² on a machine
 * rated for several rad/s², and split by decile the inertial term does rise above the residual
 * in the fastest 1-10% of samples, so the dynamics are present and thin rather than absent.
 * The raw recordings shipped alongside are at 250 Hz rather than 10 Hz and would sharpen qd
 * and qdd; whether they also carry larger accelerations is not measured. Nothing about the
 * method is implicated either way — and two controls say the model is not the limitation: the
 * fit is SATURATED (625 rows read what 19,994 read) and a 490-feature universal map of the
 * same inputs on the same rows is worse on every joint.
 */
import { readMat } from './rigs/realdata/matread.mjs';
import { fitMimo, simulateMimo, buildMimo, ridgeSolve, makePlantMimo } from './rigs/realdata/sysid.mjs';
import { regressor, identify, dynamics, fk, NP, ZERO6, URDF_ORIGINS } from './rigs/realdata/kuka-kin.mjs';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: the KUKA KR300 industrial robot — what its record supports\n');

const REC = 'rigs/realdata/records/kuka/forward.mat';
const d = readMat(new URL(REC, import.meta.url).pathname);
const Ytr = d.y_train, Utr = d.u_train, Yte = d.y_test, Ute = d.u_test;
const DT = d.time_train[1][0] - d.time_train[0][0];

// ---- THE READER, WHICH IS NEW AND IS ITSELF A THING THAT CAN BE WRONG (rule 17) ----------
check('the MATLAB v5 reader returns every variable the benchmark documents',
  ['u_train', 'y_train', 'u_test', 'y_test', 'time_train', 'time_test'].every((k) => d[k]),
  Object.keys(d).join(','));
check('…with the shapes the benchmark documents — 6 channels, 39,988 train and 3,636 test',
  Ytr.length === 39988 && Yte.length === 3636 && Ytr[0].length === 6 && Utr[0].length === 6,
  `${Ytr.length}x${Ytr[0].length} train, ${Yte.length}x${Yte[0].length} test`);
// RULE 4 — A FAILING CHECK CAN BE STALE IN EITHER DIRECTION, and this one was twice over.
// It first asserted dt === 0.1 to 1e-9 and went red on 0.10000250, which is not an error in
// the record: it is the robot's own clock, 25 ppm off nominal, and a check that freezes the
// round number is asserting the datasheet rather than the machine. Rewritten to assert
// UNIFORMITY it went red again — because the TWO RECORDS WERE SAMPLED AT DIFFERENT PERIODS,
// 0.100002501 s for training and 0.100027510 for test, 250 ppm apart. Each is uniform to the
// last digit internally; the gap was between them, and the check had measured one against the
// other's period. Both facts are the data's, neither is a defect, and the property that
// actually matters — that no lag in any model here straddles a gap — is asserted per record.
const periods = [d.time_train, d.time_test].map((t) => {
  const dt0 = t[1][0] - t[0][0];
  let worst = 0;
  for (let k = 1; k < t.length; k++) worst = Math.max(worst, Math.abs((t[k][0] - t[k - 1][0]) - dt0));
  return { dt: dt0, worst };
});
check('each record is uniformly sampled to the last digit, so no lag in any model here '
  + 'straddles a gap',
  periods.every((p) => p.worst < 1e-9 && Math.abs(p.dt - 0.1) / 0.1 < 1e-3),
  periods.map((p) => `dt=${p.dt} worst=${p.worst.toExponential(2)}`).join(' | '));
console.log(`  sample period: train ${periods[0].dt.toFixed(9)} s, test ${periods[1].dt.toFixed(9)} s `
  + `— 10 Hz nominal, ${((periods[0].dt / 0.1 - 1) * 1e6).toFixed(0)} and `
  + `${((periods[1].dt / 0.1 - 1) * 1e6).toFixed(0)} ppm off, and 250 ppm apart from each other`);
console.log(`  ${(Ytr.length * DT / 60).toFixed(1)} min of training motion, `
  + `${(Yte.length * DT / 60).toFixed(1)} min of test`);

// ---- ONE STEP AGAINST FREE RUN, which is the whole character of this plant ---------------
const m = fitMimo({ U: Utr, Y: Ytr, na: 6, nb: 6, nk: 1, lam: 1e-6 });
const { X, T } = buildMimo(Utr, Ytr, 6, 6, 1, null);
const oneStep = [];
for (let c = 0; c < 6; c++) {
  const w = ridgeSolve(X, T[c], 1e-6);
  let mu = 0; for (const v of T[c]) mu += v; mu /= T[c].length;
  let se = 0, sv = 0;
  for (let i = 0; i < X.length; i++) { let p = 0; for (let j = 0; j < w.length; j++) p += X[i][j] * w[j]; se += (T[c][i] - p) ** 2; sv += (T[c][i] - mu) ** 2; }
  oneStep.push(100 * Math.sqrt(se / sv));
}
console.log(`  one-step NRMSE per joint (%): ${oneStep.map((v) => v.toFixed(3)).join(' ')}`);
check('the one-step fit is essentially exact on every joint — which is what makes the free '
  + 'run below a statement about integration rather than about the dynamics',
  oneStep.every((v) => v < 0.5), oneStep.map((v) => v.toFixed(2)).join(','));

function horizon(mm, H) {
  let se = 0, n = 0;
  for (let s = 0; s + H <= Yte.length; s += H) {
    const sim = simulateMimo(mm, Ute.slice(s, s + H), Yte.slice(s, s + H), H, 50, Yte);
    if (!sim) return null;
    for (let k = mm.k0; k < H; k++) for (let c = 0; c < 6; c++) { se += (Yte[s + k][c] - sim[k][c]) ** 2; n++; }
  }
  return Math.sqrt(se / n);
}
const HS = [10, 20, 40, 80, 160];
const hz = HS.map((H) => horizon(m, H));
console.log('  free-run rms on the HELD-OUT test record, against horizon:');
console.log('    ' + HS.map((H, i) => `${(H * DT).toFixed(0)}s: ${hz[i].toFixed(2)}°`).join('   '));
check('the free run degrades monotonically with horizon — an integrating plant, not a noisy '
  + 'one', hz.every((v, i) => i === 0 || v > hz[i - 1]), hz.map((v) => v.toFixed(2)).join(','));
check('…and it is a GOOD plant for about a second and a useless one over a minute, which is '
  + 'the fact that stops a closed-loop factor being quoted here',
  hz[0] < 0.2 && hz[4] > 10, `${hz[0].toFixed(3)}° at 1 s, ${hz[4].toFixed(1)}° at 16 s`);

// ---- THE REPLAY CONTROL: the model fed the torques that actually produced the record ------
const p0 = makePlantMimo(m, Yte.slice(0, m.k0), Ute.slice(0, m.k0));
const rep = [];
for (let k = m.k0; k < Yte.length; k++) {
  const y = p0.step(Ute[k]);
  let s = 0; for (let c = 0; c < 6; c++) s += (y[c] - Yte[k][c]) ** 2;
  rep.push(Math.sqrt(s / 6));
}
console.log(`  REPLAY of the real robot's own torques: ${rep[50].toFixed(1)}° off by sample 50, `
  + `${rep[1000].toFixed(1)}° by sample 1000`);
check('the replay control separates a bad controller from a bad plant, and says PLANT — no '
  + 'control law can be scored on a model that cannot follow the torques that made the record',
  rep[50] > 5, `${rep[50].toFixed(2)}° at sample 50`);

// ---- THE GRAVITY PHYSICS, which is the independent route that says the record is read right
const D2R = Math.PI / 180;
function grav(y) {
  const r = [1];
  for (let i = 0; i < 6; i++) { r.push(Math.sin(y[i] * D2R)); r.push(Math.cos(y[i] * D2R)); }
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) { r.push(Math.sin((y[i] + y[j]) * D2R)); r.push(Math.cos((y[i] + y[j]) * D2R)); }
  return r;
}
const Xg = Ytr.map(grav), Wg = [];
for (let c = 0; c < 6; c++) Wg.push(ridgeSolve(Xg, Utr.map((s) => s[c]), 1e-8));
const gR2 = [];
for (let c = 0; c < 6; c++) {
  let mu = 0; for (const s of Ute) mu += s[c]; mu /= Ute.length;
  let se = 0, sv = 0;
  for (let k = 0; k < Yte.length; k++) {
    const r = grav(Yte[k]); let p = 0;
    for (let j = 0; j < r.length; j++) p += r[j] * Wg[c][j];
    se += (Ute[k][c] - p) ** 2; sv += (Ute[k][c] - mu) ** 2;
  }
  gR2.push(100 * (1 - se / sv));
}
console.log(`  gravity R² per joint on the HELD-OUT record (%): ${gR2.map((v) => v.toFixed(1)).join(' ')}`);
check('a static pose regressor explains a third to a half of the torque on the joints that '
  + 'CARRY gravity — the shoulder and the elbow — on a record it never saw',
  gR2[1] > 20 && gR2[2] > 30, `joint1 ${gR2[1].toFixed(1)}%, joint2 ${gR2[2].toFixed(1)}%`);
check('…and essentially NOTHING on joints 0 and 5, whose axes carry no gravity moment — the '
  + 'half that makes this a physics check rather than a curve fit (rule 9)',
  gR2[0] < 10 && gR2[5] < 10, `joint0 ${gR2[0].toFixed(1)}%, joint5 ${gR2[5].toFixed(1)}%`);

// ---- THE A2/A3 COUPLING, AND WHY IT CHANGES NOTHING FOR A LINEAR FIT (plan §55.9) --------
// A KUKA's axes 2 and 3 are mechanically coupled, so the natural suspicion is that the model
// is fitted in the wrong coordinates. The coupling IS in this record — and a linear ARX is
// invariant to it, which is asserted here rather than argued because the alternative was to
// carry a plausible explanation nobody had checked.
const corr = (a, b) => {
  const n = Utr.length;
  let ma = 0, mb = 0;
  for (let k = 0; k < n; k++) { ma += Utr[k][a]; mb += Utr[k][b]; }
  ma /= n; mb /= n;
  let c = 0, x = 0, y = 0;
  for (let k = 0; k < n; k++) { const p1 = Utr[k][a] - ma, q1 = Utr[k][b] - mb; c += p1 * q1; x += p1 * p1; y += q1 * q1; }
  return c / Math.sqrt(x * y);
};
const cPos = (a, b) => {
  const n = Ytr.length;
  let ma = 0, mb = 0;
  for (let k = 0; k < n; k++) { ma += Ytr[k][a]; mb += Ytr[k][b]; }
  ma /= n; mb /= n;
  let c = 0, x = 0, y = 0;
  for (let k = 0; k < n; k++) { const p1 = Ytr[k][a] - ma, q1 = Ytr[k][b] - mb; c += p1 * q1; x += p1 * p1; y += q1 * q1; }
  return c / Math.sqrt(x * y);
};
console.log(`  torque coupling: corr(u1,u2) = ${corr(1, 2).toFixed(3)} against a worst position `
  + `pair of ${Math.max(...[[1, 2], [1, 3], [2, 3], [0, 1]].map(([a, b]) => Math.abs(cPos(a, b)))).toFixed(3)}`);
check('the shoulder and elbow TORQUES are strongly coupled while their POSITIONS are not — '
  + 'the excitation was designed uncorrelated, so this is the machine and not the experiment',
  Math.abs(corr(1, 2)) > 0.3 && Math.abs(cPos(1, 2)) < 0.3,
  `u1·u2 ${corr(1, 2).toFixed(3)}, q1·q2 ${cPos(1, 2).toFixed(3)}`);

// The control (rule 21): q2 + q1 is a LINEAR COMBINATION of columns the fit already has, so a
// linear model must be invariant to the coupling. If this ever stops holding, the reasoning
// above is wrong and the coordinates are doing something this file does not understand.
function fitCoupled(cpl) {
  const Yc = Ytr.map((r) => { const o = Float64Array.from(r); o[2] = r[2] + cpl * r[1]; return o; });
  const mm = fitMimo({ U: Utr, Y: Yc, na: 4, nb: 4, nk: 1, lam: 1e-6 });
  const Yv = Yte.map((r) => { const o = Float64Array.from(r); o[2] = r[2] + cpl * r[1]; return o; });
  const H = 40;
  let se = 0, n = 0;
  for (let s2 = 0; s2 + H <= Yv.length; s2 += H) {
    const sim = simulateMimo(mm, Ute.slice(s2, s2 + H), Yv.slice(s2, s2 + H), H, 50, Yv);
    if (!sim) return null;
    for (let k = mm.k0; k < H; k++) for (let c = 0; c < 6; c++) { se += (Yv[s2 + k][c] - sim[k][c]) ** 2; n++; }
  }
  return Math.sqrt(se / n);
}
const raw = fitCoupled(0), cpl = fitCoupled(1);
console.log(`  free-run at 4 s: raw axes ${raw.toFixed(3)}°, coupled q2+q1 ${cpl.toFixed(3)}° `
  + `— ${(100 * Math.abs(cpl - raw) / raw).toFixed(1)}% apart`);
check('…and a LINEAR fit is invariant to that coupling, because the coupled coordinate is a '
  + 'combination of columns it already carries — so the coupling can only matter inside a '
  + 'NONLINEARITY, where `kuka-ngrc.mjs` measures it as the same or worse',
  Math.abs(cpl - raw) / raw < 0.05, `${raw.toFixed(4)} vs ${cpl.toFixed(4)}`);

/** Extreme eigenvalues of a symmetric 6x6 by power iteration, then shifted power iteration —
 *  enough to answer "is this a realisable inertia matrix, and how badly conditioned", which is
 *  all the check below asks of it. */
function sym6Eigs(M) {
  const S = M.map((r, i) => Array.from({ length: 6 }, (_, j) => (r[j] + M[j][i]) / 2));
  const mul = (A, v) => A.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));
  let v = [1, 0.3, -0.7, 0.2, 0.9, -0.4], hi = 0;
  for (let it = 0; it < 300; it++) {
    const w = mul(S, v); const n = Math.hypot(...w);
    if (!n) break;
    v = w.map((x) => x / n); hi = n;
  }
  const sh = S.map((r, i) => r.map((x, j) => x - hi * 1.001 * (i === j ? 1 : 0)));
  let u = [1, -0.2, 0.5, -0.8, 0.3, 0.6], lo = 0;
  for (let it = 0; it < 300; it++) {
    const w = mul(sh, u); const n = Math.hypot(...w);
    if (!n) break;
    u = w.map((x) => x / n); lo = n;
  }
  return { hi, lo: hi * 1.001 - lo };
}

// ---- THE CLASSICAL ROUTE: IDIM-LS ON SOURCED KINEMATICS (plan §55.11) ---------------------
// §55.10 left "model it instead of fitting it" open with its gate named — the KR300's DH
// parameters, which this repository did not have. They were sourced, and this is what the
// route delivers. The probe that reports all of it is `test/pilot/kuka-idim.mjs`; what is
// PINNED here is the part a regression would make silently wrong.
console.log('\n  -- the classical route: rigid-body dynamics on sourced kinematics --');
{
  const inv = readMat(new URL('rigs/realdata/records/kuka/inverse.mat', import.meta.url).pathname);
  const D2R = Math.PI / 180;
  const split = (U) => ({
    q: U.map((r) => Array.from({ length: 6 }, (_, c) => r[c] * D2R)),
    qd: U.map((r) => Array.from({ length: 6 }, (_, c) => r[6 + c] * D2R)),
    qdd: U.map((r) => Array.from({ length: 6 }, (_, c) => r[12 + c] * D2R)),
  });
  const TRq = split(inv.u_train), TEq = split(inv.u_test);

  // ---- FOUR STRUCTURAL CONTROLS ON THE REGRESSOR, which no identification can fake --------
  // Every number below is produced by a 6-link Newton-Euler recursion in modified-DH written
  // here from a paper's table. That is exactly the kind of thing that is silently wrong and
  // still plausible, so it is checked against properties rather than against its own output.
  const rnd = (seed) => { let x = seed; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5; };
  const rr = rnd(11);
  const arb = Array.from({ length: NP }, () => rr() * 4);   // ARBITRARY, not identified
  const Marb = (q) => {
    const out = Array.from({ length: 6 }, () => new Float64Array(6));
    for (let j = 0; j < 6; j++) {
      const e = ZERO6.slice(); e[j] = 1;
      const Y = regressor(q, ZERO6, e, 0);
      for (let i = 0; i < 6; i++) { let sum = 0; for (let c = 0; c < NP; c++) sum += Y[i][c] * arb[c]; out[i][j] = sum; }
    }
    return out;
  };
  let asym = 0, scale = 0, g0 = 0, g12 = Infinity;
  for (let t = 0; t < 60; t++) {
    const q = Array.from({ length: 6 }, () => rr() * 6);
    const M = Marb(q);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      asym = Math.max(asym, Math.abs(M[i][j] - M[j][i])); scale = Math.max(scale, Math.abs(M[i][j]));
    }
    const Yg = regressor(q, ZERO6, ZERO6, 9.81);
    const tq = Array.from({ length: 6 }, (_, i) => { let sum = 0; for (let c = 0; c < NP; c++) sum += Yg[i][c] * arb[c]; return sum; });
    g0 = Math.max(g0, Math.abs(tq[0]));
    g12 = Math.min(g12, Math.max(Math.abs(tq[1]), Math.abs(tq[2])));
  }
  check('M(q) from the regressor comes back SYMMETRIC with ARBITRARY parameters — a property '
    + 'of the recursion, so this tests the Newton-Euler and the DH conventions and not the fit',
    asym / scale < 1e-12, `${asym.toExponential(2)} of ${scale.toFixed(2)}`);
  check('the gravity torque about the VERTICAL first axis is exactly zero, and the shoulder '
    + 'and elbow carry a real one — both halves, or a regressor of zeros would pass (rule 9)',
    g0 < 1e-10 && g12 > 0.1, `joint0 ${g0.toExponential(2)}, min shoulder/elbow ${g12.toFixed(3)}`);
  const qs = [0.3, -0.7, 0.9, 0.2, -0.4, 1.1], as = [0.5, -0.2, 0.8, 0.1, 0.3, -0.6];
  const Y1 = regressor(qs, ZERO6, as, 0), Y3 = regressor(qs, ZERO6, as.map((x) => 3 * x), 0);
  let lin = 0;
  for (let i = 0; i < 6; i++) for (let c = 0; c < NP; c++) lin = Math.max(lin, Math.abs(Y3[i][c] - 3 * Y1[i][c]));
  check('the regressor is exactly LINEAR in qdd, which is what makes the inertial term '
    + 'separable below', lin < 1e-9, lin.toExponential(2));
  const org = fk(ZERO6).org;
  const dev = org.map((o, i) => Math.hypot(...o.map((v, k) => v - URDF_ORIGINS[i][k])));
  check('the DH chain and the ROS-Industrial URDF — two sources neither derived from the '
    + 'other — put every frame origin in the same place, the flange offset d6 excepted',
    Math.max(...dev.slice(0, 5)) < 1e-12 && Math.abs(dev[5] - 0.240) < 1e-9,
    dev.map((v) => v.toFixed(4)).join(' '));

  // ---- THE IDENTIFICATION SUCCEEDS ------------------------------------------------------
  // Stride 16 rather than 1: the fit is SATURATED in data — the probe measures 625 rows
  // reading the same held-out error as 19,994 — so this is rule 2 against the assertion's own
  // margin and not a weakened check.
  const f = identify(TRq, inv.y_train, { lam: 1e-6, stride: 16 });
  const dyn = dynamics(f.beta);
  const r2 = [], resid = [];
  {
    const se = new Float64Array(6), sy = new Float64Array(6), mu = new Float64Array(6);
    for (const r of inv.y_test) for (let i = 0; i < 6; i++) mu[i] += r[i] / inv.y_test.length;
    for (let k = 0; k < inv.y_test.length; k++) {
      const p = dyn.tau(TEq.q[k], TEq.qd[k], TEq.qdd[k]);
      for (let i = 0; i < 6; i++) { se[i] += (p[i] - inv.y_test[k][i]) ** 2; sy[i] += (inv.y_test[k][i] - mu[i]) ** 2; }
    }
    for (let i = 0; i < 6; i++) { r2.push(1 - se[i] / sy[i]); resid.push(Math.sqrt(se[i] / inv.y_test.length)); }
  }
  console.log('  held-out R2 on torque: ' + r2.map((v) => v.toFixed(3)).join(' '));
  check('IDIM-LS on the sourced kinematics IDENTIFIES this robot: held-out R2 above 0.7 on '
    + 'every joint from 78 physical parameters, so the classical route is not the thing that '
    + 'failed', r2.every((v) => v > 0.7), r2.map((v) => v.toFixed(3)).join(' '));

  // ---- AND THE FORWARD DIRECTION STILL FAILS, WITH EVERYTHING MEASURED -------------------
  // This is the decisive pair. The free run mixes the model with an integrator and with a
  // record that carries no measured velocity; evaluating qdd = M^-1 (tau - h) HERE, where q,
  // qd, qdd and tau are all given, leaves the model alone (rule 1).
  const fse = new Float64Array(6), fsy = new Float64Array(6), fmu = new Float64Array(6);
  let negEig = 0, worstCond = 0;
  for (const r of TEq.qdd) for (let i = 0; i < 6; i++) fmu[i] += r[i] / TEq.qdd.length;
  for (let k = 0; k < inv.y_test.length; k++) {
    const a = dyn.forward(TEq.q[k], TEq.qd[k], inv.y_test[k]);
    for (let i = 0; i < 6; i++) { fse[i] += (a[i] - TEq.qdd[k][i]) ** 2; fsy[i] += (TEq.qdd[k][i] - fmu[i]) ** 2; }
    if (k % 53 === 0) {                       // an unconstrained fit need not be a REALISABLE
      const M = dyn.M(TEq.q[k]);              // rigid body, and the inverse fit would not notice
      const ev = sym6Eigs(M);
      if (ev.lo <= 0) negEig++;
      worstCond = Math.max(worstCond, ev.hi / Math.abs(ev.lo));
    }
  }
  const fr2 = Array.from({ length: 6 }, (_, i) => 1 - fse[i] / fsy[i]);
  console.log('  held-out R2 on ACCELERATION from the same beta: ' + fr2.map((v) => v.toFixed(3)).join(' '));
  check('…and the FORWARD equation from the SAME parameters reads R2 at or below zero on five '
    + 'of six joints, with every quantity measured — so the free run\'s failure is not the '
    + 'integrator and not the missing velocity record',
    fr2.filter((v) => v <= 0.1).length >= 5, fr2.map((v) => v.toFixed(3)).join(' '));
  check('…and it is NOT that the identified inertia matrix is unphysical, which was the first '
    + 'hypothesis: M(q) is positive definite at every pose tried and well conditioned',
    negEig === 0 && worstCond < 100, `${negEig} non-PD, worst condition ${worstCond.toFixed(1)}`);

  // ---- WHAT SEPARATES THE TWO NUMBERS: WHAT THE TORQUE IS MADE OF ------------------------
  const acc = { grav: new Float64Array(6), vel: new Float64Array(6), iner: new Float64Array(6), res: new Float64Array(6) };
  let sd = 0, sf = 0;
  for (let k = 0; k < inv.y_test.length; k++) {
    const iner = dyn.tau(TEq.q[k], ZERO6, TEq.qdd[k], 0);
    const vel = dyn.tau(TEq.q[k], TEq.qd[k], ZERO6, 0);
    const grav = dyn.tau(TEq.q[k], ZERO6, ZERO6, 9.81);
    const full = dyn.tau(TEq.q[k], TEq.qd[k], TEq.qdd[k], 9.81);
    for (let i = 0; i < 6; i++) {
      acc.grav[i] += grav[i] ** 2; acc.vel[i] += vel[i] ** 2; acc.iner[i] += iner[i] ** 2;
      acc.res[i] += (inv.y_test[k][i] - full[i]) ** 2;
      sd += (iner[i] + vel[i] + grav[i] - full[i]) ** 2; sf += full[i] ** 2;
    }
  }
  const n = inv.y_test.length, rm = (x, i) => Math.sqrt(x[i] / n);
  // Newton-Euler carries no product of qdd with qd or with g, so the three groups must sum to
  // the whole. Two things had to be got right before this control said anything.
  //   - It is an ABSOLUTE rms. A per-sample RELATIVE error blows up wherever a torque crosses
  //     zero, and reading 650% that way is how this control first looked broken (rule 19).
  //   - It is taken with ARBITRARY O(1) parameters, not the identified ones. The identified
  //     beta reaches 1e14 in directions this excitation barely moves (pinned below), and a
  //     structurally-zero quantity computed from it is f64 cancellation at 1e-2 N.m rather
  //     than a non-additive term. Checking the recursion with the pathological vector it
  //     happens to be paired with would be testing the identification (rules 17, 32).
  let sdA = 0, sfA = 0;
  {
    const dynA = dynamics(arb);
    for (let k = 0; k < 200; k++) {
      const i1 = dynA.tau(TEq.q[k], ZERO6, TEq.qdd[k], 0), v1 = dynA.tau(TEq.q[k], TEq.qd[k], ZERO6, 0);
      const g1 = dynA.tau(TEq.q[k], ZERO6, ZERO6, 9.81), f1 = dynA.tau(TEq.q[k], TEq.qd[k], TEq.qdd[k], 9.81);
      for (let i = 0; i < 6; i++) { sdA += (i1[i] + v1[i] + g1[i] - f1[i]) ** 2; sfA += f1[i] ** 2; }
    }
  }
  check('the model torque splits EXACTLY into gravity + velocity + inertial, so the shares '
    + 'below are a decomposition and not an attribution', Math.sqrt(sdA / sfA) < 1e-12,
    `${(Math.sqrt(sdA / sfA) * 100).toExponential(1)}%`);
  check('THE IDENTIFIED PARAMETERS ARE ENORMOUS IN THE DIRECTIONS THIS EXCITATION DOES NOT '
    + 'MOVE — so no single one of them may be read as a mass or an inertia, and a quantity '
    + 'that is structurally zero comes back at 1e-2 N.m of cancellation rather than at zero. '
    + 'The PREDICTIONS are unaffected, because what is huge is multiplied by what is tiny',
    Math.max(...Array.from(f.beta, Math.abs)) > 1e8
      && Math.sqrt(sd / sf) < 1e-2 && Math.sqrt(sdA / sfA) < 1e-12,
    `max|beta| ${Math.max(...Array.from(f.beta, Math.abs)).toExponential(2)}, `
    + `split with it ${(Math.sqrt(sd / sf) * 100).toExponential(1)}% against `
    + `${(Math.sqrt(sdA / sfA) * 100).toExponential(1)}% with O(1) parameters`);
  console.log('  joint  gravity  vel+fric  INERTIAL  fit resid   inertial/resid');
  const ratio = [];
  for (let i = 0; i < 6; i++) {
    ratio.push(rm(acc.iner, i) / rm(acc.res, i));
    console.log(`    ${i}  ${rm(acc.grav, i).toFixed(2).padStart(7)} ${rm(acc.vel, i).toFixed(2).padStart(9)}`
      + ` ${rm(acc.iner, i).toFixed(2).padStart(9)} ${rm(acc.res, i).toFixed(2).padStart(10)}`
      + ` ${ratio[i].toFixed(2).padStart(15)}`);
  }
  check('GRAVITY IS THE TORQUE on the shoulder and the elbow — above 90% of their rms — so an '
    + 'R2 of 0.8 on torque is mostly a statement about statics',
    rm(acc.grav, 1) / rm(acc.iner, 1) > 4 && rm(acc.grav, 2) / rm(acc.iner, 2) > 4,
    `${(rm(acc.grav, 1) / rm(acc.iner, 1)).toFixed(1)}x and ${(rm(acc.grav, 2) / rm(acc.iner, 2)).toFixed(1)}x the inertial term`);
  check('…and THE INERTIAL TERM IS BELOW THE FIT\'S OWN RESIDUAL on five of six joints — the '
    + 'model\'s error exceeds the whole signal the forward direction needs, which is why the '
    + 'two R2 columns above disagree',
    ratio.filter((v) => v < 1).length >= 5, ratio.map((v) => v.toFixed(2)).join(' '));
  check('…and the ONE joint above that line is joint 0, the VERTICAL axis carrying no gravity '
    + 'moment — and it is the one joint whose forward prediction works. Two independent '
    + 'readings agreeing (rule 15), which is what makes this the record and not the model',
    ratio[0] > 1.5 && fr2[0] > 0.5 && rm(acc.grav, 0) / rm(acc.grav, 2) < 0.01,
    `ratio ${ratio[0].toFixed(2)}, forward R2 ${fr2[0].toFixed(3)}, gravity `
    + `${rm(acc.grav, 0).toExponential(1)} against the elbow's ${rm(acc.grav, 2).toFixed(2)}`);
}

console.log('\n  *** THE CLOSED-LOOP PLANT IS NOT ESTABLISHED — see this file\'s header for what');
console.log('      was measured, what it refused, and what would change the answer. ***');
console.log(failed ? `\nrealkuka: ${failed} check(s) FAILED\n` : '\nrealkuka: all checks passed\n');
process.exit(failed ? 1 : 0);
