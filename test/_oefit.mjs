/**
 * @file OUTPUT-ERROR IDENTIFICATION — the cure for the failure that killed the recursive forecast.
 *
 * WHAT FAILED AND WHY IT IS NOT THE ROUTE'S FAULT. A recursive forecast was built and measured
 * this session: run as a pure SIMULATOR on held-out data, no truth injected, it read R² 0.980 /
 * 0.277 against the shipped FIR bank's 0.989 / 0.840. Worse, and the route was written off.
 *
 * But it was fitted by EQUATION ERROR — ordinary least squares with the TRUE past output in the
 * regressor — and that estimator is excellent one-step-ahead-with-truth and drifts in
 * simulation. It is the textbook failure mode of ARX used as a simulator, and it says nothing
 * about whether a simulator of this plant exists. It says the wrong estimator was used.
 *
 * THE CURE IS STEIGLITZ-McBRIDE and it is a handful of linear solves. Fit ARX; filter both the
 * inputs and the output through 1/A of that fit; refit on the filtered data; repeat. Each step
 * is the same ridge solve the pilot already uses, and the fixed point is the OUTPUT-ERROR
 * estimate — the model that minimises simulation error rather than one-step error, which is
 * exactly the quantity the deployed forecast is scored on.
 *
 * WHY IT IS WORTH THE BUILD. The compiled twin reaches 44x on this machine, so a SIMULATION of
 * this plant predicts it well enough for the number the memory gets — the information is there.
 * The twin is disqualified for needing gearbox stiffness and link modulus and for compiling to a
 * lap-indexed table; a state space identified from measured I/O needs neither. And the order is
 * not the obstacle: the u->truth channel measures 4-24 states, and one pole near 1 carries the
 * elbow's 6363-8649-step memory in a single coefficient, which no lag window can reach.
 *
 * THE GATE IS SIMULATION R² ON A PROGRAM NEVER RUN, with truth never injected — the same
 * measurement that killed the equation-error version, so the two are comparable by construction.
 * If Steiglitz-McBride does not beat 0.277 on the elbow, the estimator was not the problem and
 * the route is dead for a second and better reason.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_oefit.mjs
 */
import { solveRidge } from '../lib/pilot/pilot.js';
import { commissionArm, recordOpenLoop } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const TRAIN = process.env.TRAIN || 'rounded';
const TEST = process.env.TEST || 'circle';
const FEED = +(process.env.FEED || 4e-3);
const NAS = (process.env.NA || '4,8,16').split(',').map(Number);
const NB = +(process.env.NB || 6);
const SM = +(process.env.SM || 6);           // Steiglitz-McBride iterations
const RIDGE = +(process.env.RIDGE || 1e-8);

console.log(`\noutput-error identification — K ${PG.K} / E ${PG.E}`);
console.log(`  fitted on ${TRAIN}, simulated on ${TEST}, feed ${FEED.toExponential(1)}\n`);

const p = await commissionArm({ seed: 1, uCap: 0.6, train: { shape: TRAIN, feed: FEED } });
const tr = await recordOpenLoop(p, TRAIN, FEED);
const te = await recordOpenLoop(p, TEST, FEED);
const NX = tr.x[0].length, NC = tr.e[0].length;
console.log(`  ${tr.e.length} train rows, ${te.e.length} held out; ${NX} measured signals, `
  + `${NC} channels, sample ${p.sample}\n`);

const r2 = (pred, act) => {
  const m = act.reduce((a, v) => a + v, 0) / act.length;
  let ss = 0, st = 0;
  for (let i = 0; i < act.length; i++) { ss += (act[i] - pred[i]) ** 2; st += (act[i] - m) ** 2; }
  return 1 - ss / Math.max(1e-30, st);
};

// FILTER A SIGNAL BY 1/A, which is what makes the next least-squares solve an output-error step
// rather than another equation-error one. `a` are the AR coefficients in y[k] = sum a_i y[k-i].
const filt = (sig, a, na) => {
  const out = new Float64Array(sig.length);
  for (let k = 0; k < sig.length; k++) {
    let v = sig[k];
    for (let i = 1; i <= na; i++) if (k - i >= 0) v += a[i - 1] * out[k - i];
    out[k] = v;
  }
  return out;
};

/** Simulate the model on a record with NO truth injected — inputs and its own state only. */
const simulate = (rec, a, B, na, nb) => {
  const y = new Float64Array(rec.e.length);
  for (let k = 0; k < rec.e.length; k++) {
    let v = 0;
    for (let i = 1; i <= na; i++) if (k - i >= 0) v += a[i - 1] * y[k - i];
    for (let j = 0; j < nb; j++) {
      const idx = Math.max(0, k - j);
      for (let c = 0; c < NX; c++) v += B[j * NX + c] * rec.x[idx][c];
    }
    v += B[nb * NX];
    y[k] = v;
  }
  return y;
};

// THE STABILITY TEST IS THE FILTER'S OWN IMPULSE RESPONSE, not a finiteness check. A guard that
// only rejects NaN keeps an iterate whose poles sit outside the unit circle — it is finite over a
// short record and explodes over a long one, and `filt` then feeds that explosion into the next
// least-squares solve, which is exactly how the first run diverged to R² -6694 (rule 17). Running
// the AR recursion from an impulse measures the thing the pole radius stands for, at no cost.
const arRadius = (a, na) => {
  const N = 4000, y = new Float64Array(N);
  y[0] = 1;
  let peakEarly = 1, peakLate = 0;
  for (let k = 1; k < N; k++) {
    let v = 0;
    for (let i = 1; i <= na; i++) if (k - i >= 0) v += a[i - 1] * y[k - i];
    if (!Number.isFinite(v)) return Infinity;
    y[k] = v;
    const m = Math.abs(v);
    if (k < N / 8) { if (m > peakEarly) peakEarly = m; }
    else if (k >= N - N / 8 && m > peakLate) peakLate = m;
  }
  // A decaying filter's late peak is below its early one; ratio^(1/steps) is the pole radius.
  const ratio = peakLate / Math.max(1e-300, peakEarly);
  return Math.exp(Math.log(Math.max(1e-300, ratio)) / (N * 0.75));
};

console.log(`  na  nb   estimator          train simR²      held simR²   kept  radius`);
const NBS = (process.env.NBS || String(NB)).split(',').map(Number);
for (const na of NAS) for (const nb of NBS) {
  const K0 = Math.max(na, nb);
  const models = [];
  for (let ch = 0; ch < NC; ch++) {
    const ytr = Float64Array.from(tr.e, (r) => r[ch]);
    const xtr = [];
    for (let c = 0; c < NX; c++) xtr.push(Float64Array.from(tr.x, (r) => r[c]));
    const actTr = Array.from(ytr.slice(K0));
    let a = new Float64Array(na), B = null;
    const hist = [];
    for (let it = 0; it <= SM; it++) {
      // it 0 is plain ARX (no filtering); later iterations filter by 1/A of the KEPT fit, which
      // is the last STABLE one — filtering by a divergent A is what produced the first run's
      // nonsense, and it is a property of the iteration rather than of the plant.
      const yf = it === 0 ? ytr : filt(ytr, a, na);
      const xf = it === 0 ? xtr : xtr.map((s2) => filt(s2, a, na));
      const X = [], y = [];
      for (let k = K0; k < ytr.length; k++) {
        const row = [];
        for (let i = 1; i <= na; i++) row.push(yf[k - i]);
        for (let j = 0; j < nb; j++) for (let c = 0; c < NX; c++) row.push(xf[c][k - j]);
        row.push(1);
        X.push(row); y.push(yf[k]);
      }
      const w = solveRidge(X, y, RIDGE);
      const aN = Float64Array.from(w.slice(0, na)), bN = Float64Array.from(w.slice(na));
      const rad = arRadius(aN, na);
      if (!(rad < 1)) break;                       // unstable: keep the last stable iterate
      const s2 = simulate(tr, aN, bN, na, nb);
      let ok = true;
      for (let i = 0; i < s2.length; i++) if (!Number.isFinite(s2[i])) { ok = false; break; }
      if (!ok) break;
      const trR2 = r2(Array.from(s2.slice(K0)), actTr);
      hist.push({ a: aN, B: bN, it, rad, trR2 });
      a = aN; B = bN;
    }
    models.push(hist);
  }
  const row = (label, pickFn) => {
    const sc = [], tr2 = [], kept = [], rads = [];
    for (let ch = 0; ch < NC; ch++) {
      const h = models[ch];
      const m = h.length ? pickFn(h) : null;
      if (!m) { sc.push(NaN); tr2.push(NaN); kept.push('-'); rads.push(NaN); continue; }
      const sim = simulate(te, m.a, m.B, na, nb);
      const act = Float64Array.from(te.e, (r) => r[ch]);
      sc.push(r2(Array.from(sim.slice(K0)), Array.from(act.slice(K0))));
      tr2.push(m.trR2); kept.push(String(m.it)); rads.push(m.rad);
    }
    const f = (v) => (Number.isFinite(v) && v > -99 ? v.toFixed(3) : (Number.isFinite(v) ? v.toExponential(1) : ' diverged'));
    console.log(`  ${String(na).padStart(2)}  ${String(nb).padStart(2)}   ${label.padEnd(16)}`
      + `${tr2.map(f).map((x) => x.padStart(7)).join(' ')}  ` 
      + `${sc.map(f).map((x) => x.padStart(7)).join(' ')}   ${kept.join('/')}  `
      + rads.map((v) => (Number.isFinite(v) ? v.toFixed(4) : '  -')).join('/'));
  };
  // BOTH HALVES (rule 9): the ARX row is the recorded failure reproduced inside this file, and
  // the SM row is selected on its OWN objective — best TRAIN simulation R², since that is the
  // quantity output-error identification minimises. Selecting on the held-out score would be
  // choosing the answer with the exam paper.
  row('ARX (it 0)', (h) => h[0]);
  row(`SM (best train)`, (h) => h.reduce((b, m) => (m.trR2 > b.trR2 ? m : b), h[0]));
}
console.log(`\n  the bar is the shipped FIR bank at lead 1: 0.989 / 0.840, and the equation-error`);
console.log(`  simulator that failed: 0.980 / 0.277. Truth is never injected in any row here.\n`);
