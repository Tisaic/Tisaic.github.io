/**
 * @file NOT A TEST — CAN THE COMMANDED REFERENCE PREDICT A REAL SIX-AXIS ROBOT'S TRACKING
 * ERROR? (plan §55.10)
 *
 * THIS IS THE QUESTION THAT DECIDES WHETHER THE METHOD APPLIES TO A REAL ROBOT, and it needs
 * no plant model, which is why it is worth more than the forward simulator §55.8 and §55.9
 * failed to build. The deployed object (`lib/pilot/distil.js` → `deploy.js`) is ONE thing: a
 * map from a straddling window of the COMMANDED REFERENCE to a correction. §52.31 measured
 * how much of the correction that input can carry on our lattice arm and got R² ~0.836. The
 * KUKA's RAW recordings carry `q_ref` (the executed axis reference) beside `q_se_meas` (the
 * real axis position), so the same question can be asked on real hardware.
 *
 * IT IS NOT A CONTROL RESULT AND IS NOT REPORTED AS ONE. Nothing is applied and nothing is
 * re-measured — a record cannot answer what the machine would have done under our input. What
 * this measures is PREDICTABILITY: an upper bound on what a feedforward of that form could
 * remove, and the same quantity §52.31 bounds on the simulator.
 *
 * SCORED LEAVE-ONE-RECORDING-OUT, which is the honest split — each recording is a separate run
 * of the machine, so a held-out one is a different experiment rather than a later slice of the
 * same one.
 *
 * WHAT IT MEASURED, six recordings, 250 Hz, mean over the six folds:
 *
 *   row shape                                    joint0   joint1   joint2
 *   straddling window, 15 taps, ±2.05 s           0.880    0.705    0.606
 *   `classic.js` basis [a, v, sign v, 1] x6       0.888    0.113    0.001
 *   causal — same taps, span and spacing, shifted 0.879    0.704    0.608
 *   null — the window read at unrelated times     -0.000   -0.044   -0.056
 *
 * THREE READINGS, AND THE SECOND IS THE RESULT.
 *
 * (1) JOINT 0 IS PURE VELOCITY LAG AND THE WINDOW ADDS NOTHING TO IT — the conventional
 *     basis reads 0.888 against the window's 0.880. That is the rung this project already
 *     ships (`classic.js`, 425x on the EMPS axis), and on the base axis of a real robot it is
 *     the whole story. Reporting the window's 0.880 without this control would have credited
 *     a windowed map with what four coefficients do.
 *
 * (2) JOINTS 1 AND 2 CARRY STRUCTURE ONLY A WINDOW SEES: 0.113 and 0.001 from the
 *     conventional basis against 0.705 and 0.606 from the window. Those are the SHOULDER and
 *     ELBOW — the gravity- and compliance-loaded pair — and the conventional basis here
 *     already contains every joint's velocity and acceleration, so the gain is not cross-axis
 *     lag either. **That is the claim of this whole project, measured on a machine nobody
 *     here built, and it lands either side of the lattice arm's own 0.836 ceiling.**
 *
 * (3) CAUSAL MATCHES STRADDLING FOR PREDICTION, AND THAT DOES NOT CONTRADICT §49.14. That
 *     experiment compared deployed CONTROL results (0.89x causal against 1.43x straddling);
 *     this one predicts e[k] from the reference, and the past causes e[k], so a causal filter
 *     can do it. Preview is about having a correction IN PLACE before the error arrives, which
 *     is a question about lead time and is not what this file measures.
 *
 * ONLY JOINTS 0-2 ARE SCORED. Joints 3-5 report `q_se_meas` as exactly 0.000 — the secondary
 * encoders are fitted to the main axes only — and read as a value those zeros show up as a
 * 38 deg tracking error identical to the wind-up to four figures (rule 25: "not measured" and
 * "exactly zero" are different states).
 *
 * `MODE` selects the row shape. Not in the suite (rule 2): each fold reads 18 MB of `.mat`.
 */
import { readMat } from './rigs/realdata/matread.mjs';
const FILES = process.argv.slice(2);
const NJ = 3;                                   // joints with axis-side truth
// The straddling window `distil.js` requires: it REFUSES a causal-only window, because the
// matched control reads 0.89x causal against 1.43x straddling (§49.14).
const OFFS = [0, 8, 16, 32, 64, 128, 256, 512].flatMap((o) => (o ? [-o, o] : [0])).sort((a, b) => a - b);
function load(f) {
  const d = readMat(new URL('rigs/realdata/records/kuka/raw/' + f, import.meta.url).pathname);
  return { ref: d.q_ref, act: d.q_se_meas, n: d.time.length, name: f.slice(10, 25) };
}
const recs = FILES.map(load);
console.log(`${recs.length} recordings x ${recs[0].n} samples; window ${OFFS.length} taps, `
  + `${OFFS[0]} .. ${OFFS[OFFS.length - 1]} samples (±${(OFFS[OFFS.length - 1] * 0.004).toFixed(2)} s)`);
const SPAN = OFFS[OFFS.length - 1];
// FOUR ROW SHAPES, because an R² on a tracking error is nearly meaningless without them.
// Most of a servo's tracking error is VELOCITY LAG, which `classic.js`'s own basis
// [a, v, sign v, 1] already captures and which this project ships as the conventional rung.
// If the window only reproduces that, it has added nothing. And a SHUFFLED null says whether
// the comparison can distinguish anything at all (rule 9, rule 15).
const MODE = process.env.MODE || 'window';
const SPAN0 = OFFS[OFFS.length - 1];
const D1 = (r, k, c) => (r.ref[Math.min(r.n - 1, k + 1)][c] - r.ref[Math.max(0, k - 1)][c]) / 2;
const D2 = (r, k, c) => r.ref[Math.min(r.n - 1, k + 1)][c] - 2 * r.ref[k][c] + r.ref[Math.max(0, k - 1)][c];
function row(r, k) {
  const z = [1];
  if (MODE === 'classic') {                       // the conventional rung's basis, per joint
    for (let c = 0; c < 6; c++) { const v = D1(r, k, c); z.push(v); z.push(D2(r, k, c)); z.push(Math.sign(v)); }
  } else if (MODE === 'causal') {                  // same taps, none in the future (§49.14's control)
    for (const o of OFFS) { const i = Math.min(r.n - 1, Math.max(0, k + o - OFFS[OFFS.length - 1]));
      for (let c = 0; c < 6; c++) z.push(r.ref[i][c]); }
  } else if (MODE === 'null') {                    // the window, read at an unrelated time
    // A POSITIVE modulo: JS's % keeps the sign of the dividend and half these offsets are
    // negative, so the naive form indexes below zero and reads undefined.
    const W = r.n - 2 * SPAN0;
    for (const o of OFFS) { const i = SPAN0 + (((k * 7919 + o * 104729 + 12345) % W) + W) % W;
      for (let c = 0; c < 6; c++) z.push(r.ref[i][c]); }
  } else {                                         // the shipped straddling window
    for (const o of OFFS) { const i = Math.min(r.n - 1, Math.max(0, k + o)); for (let c = 0; c < 6; c++) z.push(r.ref[i][c]); }
  }
  return z;
}
const P = MODE === 'classic' ? 1 + 18 : 1 + OFFS.length * 6;
function solve(trains, lam, stride) {
  const A = Array.from({ length: P }, () => new Float64Array(P));
  const b = Array.from({ length: NJ }, () => new Float64Array(P));
  let n = 0;
  for (const r of trains) {
    for (let k = SPAN; k < r.n - SPAN; k += stride) {
      const f = row(r, k);
      for (let i = 0; i < P; i++) { const fi = f[i]; if (!fi) continue;
        for (let j = i; j < P; j++) A[i][j] += fi * f[j];
        for (let c = 0; c < NJ; c++) b[c][i] += fi * (r.ref[k][c] - r.act[k][c]); }
      n++; }
  }
  for (let i = 0; i < P; i++) { A[i][i] += lam * n; for (let j = 0; j < i; j++) A[i][j] = A[j][i]; }
  const L = Array.from({ length: P }, () => new Float64Array(P));
  for (let j = 0; j < P; j++) { let dg = A[j][j];
    for (let q = 0; q < j; q++) dg -= L[j][q] * L[j][q];
    if (!(dg > 0)) return null;
    L[j][j] = Math.sqrt(dg);
    for (let i = j + 1; i < P; i++) { let s = A[i][j]; for (let q = 0; q < j; q++) s -= L[i][q] * L[j][q]; L[i][j] = s / L[j][j]; } }
  const th = [];
  for (let c = 0; c < NJ; c++) { const y0 = new Float64Array(P), x = new Float64Array(P);
    for (let i = 0; i < P; i++) { let s = b[c][i]; for (let q = 0; q < i; q++) s -= L[i][q] * y0[q]; y0[i] = s / L[i][i]; }
    for (let i = P - 1; i >= 0; i--) { let s = y0[i]; for (let q = i + 1; q < P; q++) s -= L[q][i] * x[q]; x[i] = s / L[i][i]; }
    th.push(x); }
  return th;
}
/** R² of the predicted tracking error against the measured one, per joint. */
function score(th, r, stride) {
  const out = [];
  for (let c = 0; c < NJ; c++) {
    let m = 0, n = 0;
    for (let k = SPAN; k < r.n - SPAN; k += stride) { m += r.ref[k][c] - r.act[k][c]; n++; }
    m /= n;
    let se = 0, sv = 0;
    for (let k = SPAN; k < r.n - SPAN; k += stride) {
      const f = row(r, k); let p = 0;
      for (let i = 0; i < P; i++) p += f[i] * th[c][i];
      const t = r.ref[k][c] - r.act[k][c];
      se += (t - p) ** 2; sv += (t - m) ** 2;
    }
    out.push(1 - se / sv);
  }
  return out;
}
console.log(`\nMODE = ${MODE}  (${P} features)`);
console.log('LEAVE-ONE-RECORDING-OUT: R² of the tracking error predicted from the commanded reference');
console.log('held out'.padEnd(18) + 'joint0'.padStart(9) + 'joint1'.padStart(9) + 'joint2'.padStart(9));
const all = [];
for (let h = 0; h < recs.length; h++) {
  const th = solve(recs.filter((_, i) => i !== h), 1e-4, 4);
  if (!th) { console.log(recs[h].name.padEnd(18) + '  not positive definite'); continue; }
  const s = score(th, recs[h], 4);
  all.push(s);
  console.log(recs[h].name.padEnd(18) + s.map((v) => v.toFixed(3).padStart(9)).join(''));
}
const mean = [0, 1, 2].map((c) => all.reduce((a, s) => a + s[c], 0) / all.length);
console.log('MEAN'.padEnd(18) + mean.map((v) => v.toFixed(3).padStart(9)).join(''));
