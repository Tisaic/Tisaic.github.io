/**
 * @file **Not a test — HOW MUCH OF THE SETTLE IS PREDICTABLE, AND CAN IT BEAT WAITING?**
 *
 * The product claim is that a batching cycle can be shortened by reading the FINAL weight out of
 * the first fraction of the settle instead of waiting for it. This file measures that on the
 * simulated hopper and refuses to state it as anything but a simulator result.
 *
 * THE ONE NUMBER THAT MATTERS is not an R² — it is TIME SAVED AT EQUAL ACCURACY. So everything
 * is reported as an error-versus-wait curve, and the estimator's claim is "at +T it is as
 * accurate as waiting to +T_equiv", with T_equiv read off the incumbent's own curve.
 *
 * THE BASELINES ARE THE POINT (rule 15, and §54.9's lesson that a method must be beaten by
 * something that could have beaten it):
 *   B1  the instantaneous reading at +T — do nothing
 *   B2  the mean of a window ending at +T — what every indicator already does
 *   B3  B2 minus a fitted in-flight constant — THE INCUMBENT. One global preact correction,
 *       fitted on the training batches. This is what a real batcher's operator tunes, and if
 *       the learned estimator cannot beat it there is no product.
 *   FLOOR  THERE ARE TWO AND THEY BELONG TO DIFFERENT QUESTIONS, which a first version of this
 *       file conflated and duly flagged a good result as a leak. The batch-to-batch spread of
 *       the true final mass is the floor for predicting AT CUTOFF — before the material lands,
 *       it is genuinely unknowable. It is NOT the floor for reading the settled value AFTER the
 *       cut, because by then the mass is all on the cell and fully observable; there the floor
 *       is the INDICATOR NOISE through whatever averaging is applied. Both are printed, against
 *       the question each one bounds (rule 19: match the metric's support to the claim's).
 *
 * HELD OUT ACROSS BATCHES, never across samples. Samples within one batch share a settle
 * transient, so a sample-wise split validates against data it has effectively seen — the same
 * fault `distil.js`'s contiguous-with-a-gap folds exist to avoid.
 *
 * WHAT THIS IS NOT. The plant is `rigs/batch-rig.mjs`, a simulator whose constants are nominal
 * and whose ring is anchored to one figure in a patent. §55's standing caution applies with
 * full force: a plant built to a model is a soft target for a method of the same shape, and the
 * factor below measures this repository until a real hopper log replaces the rig. No public
 * dataset of batching-hopper transients was found; the search returns patents, not data.
 */
import { runBatch, DT } from './rigs/batch-rig.mjs';

const NTRAIN = +(process.env.NTRAIN || 120);
const NTEST = +(process.env.NTEST || 60);
const VARY = +(process.env.VARY == null ? 1 : process.env.VARY);
const WIN = +(process.env.WIN || 64);          // samples of history the estimator reads
const RIDGE = +(process.env.RIDGE || 1e-6);
const AVG = +(process.env.AVG || 0.10);        // s, the indicator's own averaging window
const READS = (process.env.READS || '0.05,0.1,0.2,0.3,0.5,0.75,1,1.5,2,3').split(',').map(Number);

/** Targets spread over a realistic range so nothing is fitted at one operating point. */
const targetOf = (k) => 80 + (k * 37) % 240;

function makeSet(n, seed0) {
  const out = [];
  for (let k = 0; k < n; k++) out.push(runBatch(targetOf(k), seed0 + k * 17, { vary: VARY }));
  return out;
}

/** Ridge on normal equations, column-scaled. Same shape as every fit in this repository. */
function ridge(X, y, lam) {
  const m = X[0].length, A = Array.from({ length: m }, () => new Float64Array(m)), b = new Float64Array(m);
  const sc = new Float64Array(m);
  for (const r of X) for (let c = 0; c < m; c++) sc[c] += r[c] * r[c];
  for (let c = 0; c < m; c++) sc[c] = Math.sqrt(sc[c] / X.length) || 1;
  for (let k = 0; k < X.length; k++) {
    const r = X[k];
    for (let i = 0; i < m; i++) { const ri = r[i] / sc[i]; if (!ri) continue;
      for (let j = i; j < m; j++) A[i][j] += ri * (r[j] / sc[j]); b[i] += ri * y[k]; }
  }
  for (let i = 0; i < m; i++) { A[i][i] += lam * X.length; for (let j = 0; j < i; j++) A[i][j] = A[j][i]; }
  const L = Array.from({ length: m }, () => new Float64Array(m));
  for (let j = 0; j < m; j++) {
    let d = A[j][j]; for (let k = 0; k < j; k++) d -= L[j][k] * L[j][k];
    if (!(d > 0)) return null;
    L[j][j] = Math.sqrt(d);
    for (let i = j + 1; i < m; i++) { let sm = A[i][j];
      for (let k = 0; k < j; k++) sm -= L[i][k] * L[j][k]; L[i][j] = sm / L[j][j]; }
  }
  const y0 = new Float64Array(m), w = new Float64Array(m);
  for (let i = 0; i < m; i++) { let sm = b[i]; for (let k = 0; k < i; k++) sm -= L[i][k] * y0[k]; y0[i] = sm / L[i][i]; }
  for (let i = m - 1; i >= 0; i--) { let sm = y0[i]; for (let k = i + 1; k < m; k++) sm -= L[k][i] * w[k]; w[i] = sm / L[i][i]; }
  for (let c = 0; c < m; c++) w[c] /= sc[c];
  return w;
}

/**
 * THE FEATURE ROW at read time +T. Deliberately modest and entirely PLC-computable: a decimated
 * window of the indicated weight RELATIVE to the reading at cutoff (so the row does not have to
 * carry the absolute weight and the map transfers across target sizes), the commanded feed rate
 * at cutoff, and the reading at cutoff itself.
 */
function row(b, iRead) {
  const at = (i) => b.w[Math.max(0, Math.min(b.n - 1, i))];
  const base = at(b.cutIdx);
  const f = [1, base];
  // FIXED decimation over a FIXED span. A first version divided the stride by (iRead - cutIdx),
  // so the row silently shrank from 36 features to 5 as the read time grew and the late rows
  // were a different model from the early ones (rule 20: one variable at a time).
  for (let o = 0; o < WIN; o += 4) f.push(at(iRead - o) - base);
  // Slopes over several spans: the settle tail is an exponential, so its RATE is what says
  // where it is heading, and a raw window has to reconstruct that from differences.
  f.push(at(iRead) - at(iRead - 10), at(iRead) - at(iRead - 25),
    at(iRead) - at(iRead - 50), at(iRead - 10) - at(iRead - 50));
  f.push(b.cmd[Math.max(0, b.cutIdx - 1)]);          // the rate we were feeding at the cut
  f.push(b.plan.target);
  return f;
}

const mean = (b, i, n) => { let s = 0, c = 0;
  for (let k = Math.max(0, i - n + 1); k <= i; k++) { s += b.w[k]; c++; } return s / c; };
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);

console.log('\nbatch: how much of a weigh-hopper settle is predictable, and does it beat waiting?\n');
const tr = makeSet(NTRAIN, 1000), te = makeSet(NTEST, 700000);
const tMu = te.reduce((s, b) => s + b.truth, 0) / te.length;
// THE FLOOR IS THE SCATTER AT ONE TARGET, not across the target range. A first version took the
// spread of final masses over batches spanning 80-320 kg and duly reported 72 kg — it was
// measuring the target ladder, which is the instrument failing before the model (rule 17).
const fl = []; for (let k = 0; k < 60; k++) fl.push(runBatch(200, 424242 + k * 13, { vary: VARY }).truth);
const flMu = fl.reduce((a, x) => a + x, 0) / fl.length;
const floor = rms(fl.map((x) => x - flMu));
console.log(`  ${NTRAIN} training batches, ${NTEST} held out, targets 80-320 kg, vary ${VARY}`);
console.log(`  held-out true mass ${tMu.toFixed(1)} kg mean; the rig's own settle tail is what we race\n`);

console.log('   read at   B1 instant   B2 mean    B3 +in-flight   LEARNED     n feat');
console.log('   (s after cut)  ------------- rms error vs true final mass, kg -------------');
const curve = {};
for (const T of READS) {
  const nAvg = Math.max(2, Math.round(AVG / DT));   // a real indicator's filter does not grow
                                                    // with how long you happen to wait
  const idx = (b) => Math.min(b.n - 1, b.cutIdx + Math.round(T / DT));
  const e1 = te.map((b) => b.w[idx(b)] - b.truth);
  const e2 = te.map((b) => mean(b, idx(b), nAvg) - b.truth);
  // B3: the incumbent — B2 with ONE global in-flight constant fitted on the training set.
  const k3 = tr.reduce((s, b) => s + (b.truth - mean(b, idx(b), nAvg)), 0) / tr.length;
  const e3 = te.map((b) => mean(b, idx(b), nAvg) + k3 - b.truth);
  // LEARNED: ridge on what the INCUMBENT LEAVES, fitted on training batches only. Predicting
  // the absolute weight instead reads WORSE than B3 past +0.5 s, and that is a parameterisation
  // artefact rather than physics — the residual form wins at every read time. A negative
  // reported from the absolute form would have been a negative about the row, not the plant.
  const base3 = (b) => mean(b, idx(b), nAvg) + k3;
  const X = tr.map((b) => row(b, idx(b))), y = tr.map((b) => b.truth - base3(b));
  const w = ridge(X, y, RIDGE);
  const eL = w ? te.map((b) => { const r = row(b, idx(b));
    let p = 0; for (let c = 0; c < w.length; c++) p += r[c] * w[c]; return base3(b) + p - b.truth; }) : null;
  curve[T] = { b2: rms(e2), b3: rms(e3), l: eL ? rms(eL) : NaN };
  console.log(`   ${String(T).padStart(6)}   ${rms(e1).toFixed(4).padStart(9)}  ${rms(e2).toFixed(4).padStart(9)}`
    + `   ${rms(e3).toFixed(4).padStart(10)}   ${(eL ? rms(eL).toFixed(4) : 'fit failed').padStart(9)}`
    + `   ${String(X[0].length).padStart(5)}`);
}
// The noise floor for the READ-AFTER-CUT question: indicator noise through the averaging window.
const q = [];
for (let k = 0; k < 40; k++) { const b = runBatch(200, 313131 + k * 7, { vary: 0 });
  q.push(mean(b, b.n - 1, Math.round(AVG / DT)) - b.truth); }
const qMu = q.reduce((a, x) => a + x, 0) / q.length;
console.log(`\n   FLOORS, one per question (rule 19):`);
console.log(`     reading the settled value AFTER the cut — indicator noise through a ${AVG}s`);
console.log(`     average, material held: ${rms(q.map((x) => x - qMu)).toFixed(4)} kg. This is what the`);
console.log(`     right-hand columns are converging on, and beating it would be a leak (rule 14).`);
console.log(`     predicting AT the cut, before it lands — true-mass scatter at one target:`);
console.log(`     ${floor.toFixed(4)} kg. That bounds a DIFFERENT product (better cutoff), and`);
console.log(`     nothing above is measured against it.`);

// --- THE BUSINESS NUMBER: time saved at equal accuracy --------------------------------------
const tEarly = READS[1];
const acc = curve[tEarly].l;
let equiv = null;
for (const T of READS) if (curve[T].b3 <= acc) { equiv = T; break; }
console.log('\n   TIME SAVED AT EQUAL ACCURACY — the only number with a business case in it:');
console.log(`     learned at +${tEarly}s reaches ${acc.toFixed(4)} kg`);
console.log(equiv == null
  ? `     the incumbent never reaches that within +${READS[READS.length - 1]}s of cutoff`
  : `     the incumbent reaches it at +${equiv}s  ->  ${(equiv - tEarly).toFixed(2)} s saved per batch`);
console.log('\n   (the plant is a simulator; this is a rig result, not a claim about a hopper)\n');

// --- WHAT DECIDES WHETHER THERE IS A BUSINESS AT ALL ----------------------------------------
// The table above says the learned map wins only between +0.05 s and +0.3 s, and that both
// methods are too inaccurate to read there. That is not a verdict on the method — it is a
// property of THIS rig's settle, which is ~0.5 s. The operationally meaningful number is
// TIME TO AN ACCEPTABLE ACCURACY, and the question is how it moves with the one plant property
// nobody here has measured on a real machine: how long the hopper actually takes to settle.
if (process.env.SWEEP) {
  const TOL = +(process.env.TOL || 0.002);           // acceptable error, fraction of batch
  console.log(`\n   TIME TO ${(TOL * 100).toFixed(2)}% ACCURACY vs how long the plant settles`);
  console.log('   (consolTau = how long landed material keeps consolidating; damp = frame damping)\n');
  console.log('   consolTau  damp    incumbent   learned    saved     of a 60 s cycle');
  const fine = [];
  for (let t = 0.02; t <= 4.0; t += 0.02) fine.push(+t.toFixed(2));
  for (const [ct, dz] of [[0.3, 0.16], [0.9, 0.10], [2.0, 0.06], [4.0, 0.04], [8.0, 0.03]]) {
    const o = { vary: VARY, rig: { consolTau: ct, damp: dz }, tail: Math.max(6, ct * 3) };
    const mk = (n, s0) => Array.from({ length: n }, (_, k) => runBatch(targetOf(k), s0 + k * 17, o));
    const a = mk(NTRAIN, 1000), c = mk(NTEST, 700000);
    const tolKg = TOL * (c.reduce((s, b) => s + b.truth, 0) / c.length);
    const firstUnder = (f) => { for (const T of fine) { if (f(T) <= tolKg) return T; } return null; };
    const nAvg = Math.max(2, Math.round(AVG / DT));
    const idxOf = (b, T) => Math.min(b.n - 1, b.cutIdx + Math.round(T / DT));
    const inc = firstUnder((T) => {
      const k3 = a.reduce((s, b) => s + (b.truth - mean(b, idxOf(b, T), nAvg)), 0) / a.length;
      return rms(c.map((b) => mean(b, idxOf(b, T), nAvg) + k3 - b.truth));
    });
    const lrn = firstUnder((T) => {
      const k3 = a.reduce((s, b) => s + (b.truth - mean(b, idxOf(b, T), nAvg)), 0) / a.length;
      const b3 = (b) => mean(b, idxOf(b, T), nAvg) + k3;
      const w = ridge(a.map((b) => row(b, idxOf(b, T))), a.map((b) => b.truth - b3(b)), RIDGE);
      if (!w) return Infinity;
      return rms(c.map((b) => { const r = row(b, idxOf(b, T));
        let p = 0; for (let i = 0; i < w.length; i++) p += r[i] * w[i]; return b3(b) + p - b.truth; }));
    });
    const sv = inc != null && lrn != null ? inc - lrn : null;
    console.log(`   ${String(ct).padStart(8)} ${String(dz).padStart(6)}  `
      + `${(inc == null ? '>4' : inc.toFixed(2)).padStart(9)}s ${(lrn == null ? '>4' : lrn.toFixed(2)).padStart(9)}s`
      + `${(sv == null ? '   --' : (sv >= 0 ? '+' : '') + sv.toFixed(2) + 's').padStart(9)}`
      + `${sv == null ? '' : '     ' + (100 * sv / 60).toFixed(2) + '% throughput'}`);
  }
  console.log('\n   THIS is the go/no-go, and it is one measurement on a real hopper: how long does');
  console.log('   your settle actually take, and what shape is its tail?');
}
