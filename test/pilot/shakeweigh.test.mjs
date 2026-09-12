/**
 * @file **WEIGHING UNDER VIBRATION, ON A REAL LOAD CELL — and the first plant in this project
 * whose ground truth is FREE.**
 *
 * Every other plant here needs an instrument the customer does not own: §52.42 prices the arm's
 * laser tracker at 3.9x over the best permanently-mounted alternative, and CLAUDE.md calls that
 * the assumption that decides who can buy this. Weighing inverts it. The truth is a reference
 * scale and a bag of grain, every cycle, for ever, at no extra hardware and no downtime. That
 * property, not the factor below, is why this application is worth pursuing.
 *
 * THE RECORD is Sitorus (2021), Mendeley Data, CC BY 4.0 — see `records/shakeweigh/PROVENANCE.md`
 * for the citation and for what it is NOT. Briefly: a grain basket on a load cell, shaken at a
 * controlled amplitude, true mass known from a 0.01 g scale. 20,885 readings, 115 treatments,
 * 5 loads x 6 amplitudes x 4 rigs, with **A0 the static unshaken control**. It is a shaking
 * basket and not a batching hopper: there is no cutoff and no settle transient, so it answers
 * "how well can a shaken cell be read" and says nothing about "how early can a settle be read".
 *
 * WHAT IT ESTABLISHES, all of it held out and all of it on real hardware:
 *
 *   1. VIBRATION IS THE WHOLE PROBLEM. Static (A0) scatter is 0.21-0.70 g; shaken it is
 *      1.4-43.5 g. Ten to sixty times, measured against the experiment's own control.
 *   2. THE ERROR IS TIME-STRUCTURED, WHICH IS WHAT MAKES A MODEL POSSIBLE AT ALL. Median
 *      lag-1 autocorrelation +0.40 across 103 treatments, worst +0.84, decaying by lag 5. The
 *      consequence is direct: the sd of an 8-sample mean is 1.40x WORSE than independent-noise
 *      theory predicts, so "average and wait" is leaving that on the table.
 *   3. A LEARNED WINDOW BEATS A CALIBRATED MEAN BY 1.65x — held out by LOAD LEVEL, so the
 *      held-out mass never appeared in training.
 *   4. AND IT NEEDS A WINDOW TO SEE IT: 1.01x at K=4, 1.05x at K=8, 1.63x at K=16, 1.65x at
 *      K=32, 1.34x at K=64. The first run of this experiment used K=8 and read 1.05x, which
 *      would have been written down as "no product" from a window too short to carry the
 *      structure — rule 37, on real data, with the reach now measured rather than assumed.
 *   5. **AND IT DOES NOT TRANSFER BETWEEN RIGS: 0.94x-1.27x, median 1.07x, against 1.65x on its
 *      own rig.** Most of the result is the installation, not a law. The incumbent's own
 *      calibration constant transfers no better — carried across rigs it is often WORSE than
 *      taking the raw mean (soy-b2 -> maize-b1: 7.77 g against 2.73 g).
 *
 * WHICH IS THE PRODUCT SHAPE, AND IT IS THE OPPOSITE OF THE OBVIOUS ONE. This is not an
 * algorithm to ship blind — cross-rig it is worth nothing. It is a SELF-COMMISSIONING estimator:
 * on each installation, log a few hundred windows against a reference scale, fit, deploy, and
 * take 1.65x. That is only viable because commissioning here costs a bag of grain, which is the
 * property this file opened with. Everything this project learned about transfer says the same
 * thing from the other side: what does not generalise must be re-learned per machine, and the
 * question is only whether re-learning is cheap.
 */
import { readFileSync } from 'node:fs';

let failed = 0;
const check = (name, cond, detail) => {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
};
console.log('\npilot: weighing under vibration on a real load cell (Sitorus 2021, CC BY 4.0)\n');

const REC = new URL('./rigs/realdata/records/shakeweigh/shake.json', import.meta.url).pathname;
const ALL = JSON.parse(readFileSync(REC, 'utf8'));
const RIGS = Object.keys(ALL);
const LOADS = [100, 500, 1000, 1500, 2000];
const loadOf = (t) => +t.match(/^B(\d+)A/)[1];
const ampOf = (t) => +t.match(/A(\d+)$/)[1];

let nRead = 0, nTreat = 0;
for (const r of RIGS) for (const t of Object.keys(ALL[r])) { nTreat++; nRead += ALL[r][t].w.length; }
check('the record loads with the shape its provenance claims — 4 rigs, 115 treatments, 20,885 readings',
  RIGS.length === 4 && nTreat === 115 && nRead === 20885, `${RIGS.length}/${nTreat}/${nRead}`);

const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const sd = (a) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return rms(a.map((x) => x - m)); };

// ---- 1. WHAT VIBRATION COSTS, against the experiment's OWN static control ------------------
const stat = [], shak = [];
for (const r of RIGS) for (const [t, v] of Object.entries(ALL[r])) {
  const e = v.w.map((x) => x - v.true);
  if (e.length < 20) continue;
  (ampOf(t) === 0 ? stat : shak).push(sd(e));
}
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
console.log(`  static (A0) scatter: median ${med(stat).toFixed(2)} g over ${stat.length} treatments`);
console.log(`  shaken scatter:      median ${med(shak).toFixed(2)} g over ${shak.length} treatments`);
check('vibration is the whole problem — it inflates the scatter by more than 5x against the '
  + 'experiment\'s own unshaken control, so this is a disturbance question and not a sensor one',
  med(shak) / med(stat) > 5, `${(med(shak) / med(stat)).toFixed(1)}x`);

// ---- 2. IS THE ERROR STRUCTURED IN TIME? ---------------------------------------------------
// If it were independent draw to draw, the mean would already be optimal and no model could
// help. This is the precondition for the whole idea and it is measured, not assumed.
const rhos = [], ratios = [];
for (const r of RIGS) for (const [t, v] of Object.entries(ALL[r])) {
  const e = v.w.map((x) => x - v.true), n = e.length;
  if (n < 60) continue;
  const mu = e.reduce((s, x) => s + x, 0) / n, d = e.map((x) => x - mu);
  const c0 = d.reduce((s, x) => s + x * x, 0) / n;
  if (c0 <= 0) continue;
  let c1 = 0; for (let i = 0; i < n - 1; i++) c1 += d[i] * d[i + 1];
  rhos.push(c1 / (n - 1) / c0);
  const W = 8, ms = [];
  for (let i = 0; i + W < n; i++) ms.push(e.slice(i, i + W).reduce((s, x) => s + x, 0) / W);
  ratios.push(sd(ms) / (Math.sqrt(c0) / Math.sqrt(W)));
}
console.log(`  lag-1 autocorrelation of the error: median ${med(rhos).toFixed(3)} over ${rhos.length} treatments`);
console.log(`  sd of an 8-sample mean against independent-noise theory: ${med(ratios).toFixed(2)}x`);
check('the error is AUTOCORRELATED sample to sample, which is the precondition for a model to '
  + 'beat a mean at all — and the cost of ignoring it is that averaging underperforms theory',
  med(rhos) > 0.25 && med(ratios) > 1.15, `rho1 ${med(rhos).toFixed(3)}, ratio ${med(ratios).toFixed(2)}`);

// ---- the fit, shared by every experiment below ---------------------------------------------
function ridge(X, y, lam = 1e-6) {
  const m = X[0].length, A = Array.from({ length: m }, () => new Float64Array(m));
  const b = new Float64Array(m), sc = new Float64Array(m);
  for (const r of X) for (let c = 0; c < m; c++) sc[c] += r[c] * r[c];
  for (let c = 0; c < m; c++) sc[c] = Math.max(Math.sqrt(sc[c] / X.length), 1e-12);
  for (let k = 0; k < X.length; k++) { const r = X[k];
    for (let i = 0; i < m; i++) { const ri = r[i] / sc[i]; if (!ri) continue;
      for (let j = i; j < m; j++) A[i][j] += ri * (r[j] / sc[j]); b[i] += ri * y[k]; } }
  for (let i = 0; i < m; i++) { A[i][i] += lam * X.length; for (let j = 0; j < i; j++) A[i][j] = A[j][i]; }
  const L = Array.from({ length: m }, () => new Float64Array(m));
  for (let j = 0; j < m; j++) { let d = A[j][j];
    for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
    if (!(d > 0)) return null; L[j][j] = Math.sqrt(d);
    for (let i = j + 1; i < m; i++) { let s = A[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = s / L[j][j]; } }
  const y0 = new Float64Array(m), w = new Float64Array(m);
  for (let i = 0; i < m; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y0[k]; y0[i] = s / L[i][i]; }
  for (let i = m - 1; i >= 0; i--) { let s = y0[i]; for (let k = i + 1; k < m; k++) s -= L[k][i] * w[k]; w[i] = s / L[i][i]; }
  return Array.from(w, (x, c) => x / sc[c]);
}
/** Windows of K consecutive readings. The target is what the MEAN gets wrong, so "do nothing"
 *  is the zero vector and every number below is measured against it by construction. */
function windows(rig, K, loads) {
  const X = [], Y = [];
  for (const [t, v] of Object.entries(ALL[rig])) {
    if (loads && !loads.includes(loadOf(t))) continue;
    for (let i = 0; i + K < v.w.length; i++) {
      const w = v.w.slice(i, i + K), mu = w.reduce((s, x) => s + x, 0) / K;
      X.push([1, mu, ...w.map((x) => x - mu)]); Y.push(v.true - mu);
    }
  }
  return { X, Y };
}
const geo = (a) => Math.exp(a.reduce((s, x) => s + Math.log(x), 0) / a.length);

/** One leave-one-LOAD-out pass. The held-out mass never appears in training, which is what
 *  stops the model SNAPPING to one of only five levels — a regression that is really a
 *  five-way classification would read spectacularly and mean nothing. */
function looPass(K) {
  const b2 = [], b3 = [], lr = [];
  for (const r of RIGS) for (const ho of LOADS) {
    const tr = windows(r, K, LOADS.filter((L) => L !== ho)), te = windows(r, K, [ho]);
    if (tr.X.length < 200 || te.X.length < 40) continue;
    const wc = ridge(tr.X.map((x) => [1, x[1]]), tr.Y);
    const w = ridge(tr.X, tr.Y);
    if (!wc || !w) continue;
    b2.push(rms(te.Y));
    b3.push(rms(te.Y.map((y, i) => y - (wc[0] + wc[1] * te.X[i][1]))));
    lr.push(rms(te.Y.map((y, i) => y - te.X[i].reduce((s, v, c) => s + v * w[c], 0))));
  }
  return { b2: geo(b2), b3: geo(b3), lr: geo(lr), n: b2.length };
}

// ---- 3 & 4. THE RESULT, AND THE WINDOW IT NEEDS ---------------------------------------------
console.log('\n  leave-one-LOAD-out, geometric mean over 20 cells — rms error against true mass:');
console.log('     K    mean    +calibration   LEARNED    vs calibrated');
const byK = {};
for (const K of [4, 8, 16, 32, 64]) {
  const p = byK[K] = looPass(K);
  console.log(`    ${String(K).padStart(2)}  ${p.b2.toFixed(2).padStart(6)} g ${p.b3.toFixed(2).padStart(12)} g `
    + `${p.lr.toFixed(2).padStart(9)} g ${(p.b3 / p.lr).toFixed(3).padStart(12)}x`);
}
check('a learned window beats a CALIBRATED mean on real data, held out by load level',
  byK[32].b3 / byK[32].lr > 1.4, `${(byK[32].b3 / byK[32].lr).toFixed(2)}x at K=32`);
check('…and it needs a window to see the structure at all — K=4 is worth nothing and K=16 is '
  + 'worth 1.6x, so a short window would have read this as "no product" (rule 37, on hardware)',
  byK[4].b3 / byK[4].lr < 1.05 && byK[16].b3 / byK[16].lr > 1.4,
  `K4 ${(byK[4].b3 / byK[4].lr).toFixed(3)}x, K16 ${(byK[16].b3 / byK[16].lr).toFixed(3)}x`);
check('…and the calibration itself earns its place, so the learned map is measured against a '
  + 'real incumbent and not against doing nothing (rule 15)',
  byK[32].b2 / byK[32].b3 > 1.2, `${(byK[32].b2 / byK[32].b3).toFixed(2)}x`);

// ---- 5. AND IT DOES NOT TRANSFER ------------------------------------------------------------
console.log('\n  TRANSFER — train on one rig, deploy on another (K=32):');
const xr = [];
for (const a of RIGS) for (const b of RIGS) {
  if (a === b) continue;
  const tr = windows(a, 32, null), te = windows(b, 32, null);
  const wc = ridge(tr.X.map((x) => [1, x[1]]), tr.Y), w = ridge(tr.X, tr.Y);
  if (!wc || !w) continue;
  const e3 = rms(te.Y.map((y, i) => y - (wc[0] + wc[1] * te.X[i][1])));
  const eL = rms(te.Y.map((y, i) => y - te.X[i].reduce((s, v, c) => s + v * w[c], 0)));
  xr.push(e3 / eL);
}
console.log(`    ${xr.length} ordered rig pairs: median ${med(xr).toFixed(2)}x, worst ${Math.min(...xr).toFixed(2)}x, `
  + `best ${Math.max(...xr).toFixed(2)}x`);
console.log(`    against ${(byK[32].b3 / byK[32].lr).toFixed(2)}x on its own rig.`);
check('IT DOES NOT TRANSFER BETWEEN RIGS — most of the result is the installation and not a '
  + 'law, so this ships as a SELF-COMMISSIONING estimator (which the free truth makes viable) '
  + 'and never as an algorithm shipped blind',
  med(xr) < 1.25 && med(xr) < 0.8 * (byK[32].b3 / byK[32].lr),
  `cross ${med(xr).toFixed(2)}x vs own ${(byK[32].b3 / byK[32].lr).toFixed(2)}x`);

console.log('\n  *** A SHAKING BASKET IS NOT A BATCHING HOPPER. This measures reading a cell under');
console.log('      sustained vibration; it claims nothing about reading a settle early. ***');
console.log(failed ? `\nshakeweigh: ${failed} check(s) FAILED\n` : '\nshakeweigh: all checks passed\n');
process.exit(failed ? 1 : 0);
