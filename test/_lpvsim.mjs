/**
 * @file A POSE-SCHEDULED SIMULATOR — the discriminating experiment between "a simulator of this
 * plant does not exist" and "a LINEAR simulator of this plant does not exist".
 *
 * WHAT IS ALREADY MEASURED. `_oefit.mjs` swept a global LTI simulator over eight model orders and
 * three input orders, fitted by equation error and by Steiglitz-McBride (which was rejected as
 * unstable at its first iteration on every single order, so it is inert here and the two
 * estimators are one row). The best held-out SIMULATION — truth never injected — is
 * 0.994 / 0.815 at na 24 / nb 12, against the shipped FIR bank's 0.989 / 0.840: BETTER on the
 * shoulder, WORSE on the elbow, and nowhere near the residual reduction a large factor needs.
 *
 * WHY THAT IS NOT THE END OF THE ROUTE. The compiled twin reaches 44.5x on this machine and
 * matches an exact-parameter oracle, and it is a SIMULATION — so a simulator that predicts this
 * plant well enough for a large factor demonstrably exists. What the twin has and the LTI fit
 * does not is POSE DEPENDENCE: this arm's compliance, inertia and gravity load all move with
 * configuration, and one lap-invariant operator is the wrong object for a machine that has many.
 * `docs/history` records the same lesson twice from the other side — pose-scheduling only pays on
 * a signal that carries the machine, and the scheduled forecast block already beats the flat one
 * on held-out data (0.840 against 0.771).
 *
 * WHAT THIS FITS. Coefficients AFFINE in a scheduling variable read from the measured signals:
 *
 *     y[k] = sum_i (a_i + a'_i rho[k]) y[k-i] + sum_j (b_j + b'_j rho[k]) x[k-j] + ...
 *
 * which is still ONE ridge solve — the row is the LTI row tensored with [1, rho] — and at deploy
 * it is a state update of order na plus an input FIR of order nb, times (1 + n_rho). At na 8,
 * nb 6 and six measured signals that is 135 MAC per channel per step. The scheduling variable is
 * an ENCODER ANGLE, which is measured, so nothing here needs a tracker or a named constant.
 *
 * THE CAPACITY CONTROL IS THE POINT (rule 20). An LPV row has (1 + n_rho) times the parameters of
 * the LTI row, so a bare improvement proves nothing. Every scheduled row is run again against a
 * SHUFFLED scheduling variable — the same values, the same count, the correspondence with time
 * destroyed — and only the gap between them is evidence that POSE is what the extra weights are
 * buying.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_lpvsim.mjs
 */
import { solveRidge } from '../lib/pilot/pilot.js';
import { commissionArm, recordOpenLoop, PG } from './pilot/rigs/arm-rig.mjs';

const TRAIN = process.env.TRAIN || 'rounded';
const TEST = process.env.TEST || 'circle';
const FEED = +(process.env.FEED || 4e-3);
const NAS = (process.env.NA || '4,8,16').split(',').map(Number);
const NBS = (process.env.NB || '6,12').split(',').map(Number);
const RIDGE = +(process.env.RIDGE || 1e-8);

console.log(`\npose-scheduled simulator — K ${PG.K} / E ${PG.E}`);
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

// THE SCHEDULING VARIABLE IS STANDARDISED ON THE TRAIN RECORD AND THE SAME CONSTANTS ARE USED ON
// THE HELD-OUT ONE (rule 38): a standardisation refitted per record is a second model.
const mkRho = (rec, idxs, stats) => {
  const out = [];
  for (let k = 0; k < rec.x.length; k++) {
    const r = [1];
    for (let n = 0; n < idxs.length; n++) {
      const s = stats[n];
      r.push((rec.x[k][idxs[n]] - s.mu) / s.sd);
    }
    out.push(r);
  }
  return out;
};
const statsOf = (rec, idxs) => idxs.map((i) => {
  let mu = 0; for (const row of rec.x) mu += row[i];
  mu /= rec.x.length;
  let v = 0; for (const row of rec.x) v += (row[i] - mu) ** 2;
  return { mu, sd: Math.sqrt(v / rec.x.length) || 1 };
});

/** Simulate with NO truth injected. `W` is [nFeat][nRho] flattened; rho is per-step [1, r...]. */
const simulate = (rec, W, na, nb, rho) => {
  const nR = rho[0].length, nF = na + nb * NX + 1;
  const y = new Float64Array(rec.e.length);
  const feat = new Float64Array(nF);
  for (let k = 0; k < rec.e.length; k++) {
    let f = 0;
    for (let i = 1; i <= na; i++) feat[f++] = k - i >= 0 ? y[k - i] : 0;
    for (let j = 0; j < nb; j++) {
      const idx = Math.max(0, k - j);
      for (let c = 0; c < NX; c++) feat[f++] = rec.x[idx][c];
    }
    feat[f++] = 1;
    let v = 0;
    for (let i = 0; i < nF; i++) {
      const fi = feat[i];
      if (fi === 0) continue;
      for (let r = 0; r < nR; r++) v += W[i * nR + r] * fi * rho[k][r];
    }
    if (!Number.isFinite(v) || Math.abs(v) > 1e6) { y.fill(NaN, k); return y; }
    y[k] = v;
  }
  return y;
};

const fit = (rec, ch, na, nb, rho, K0) => {
  const nR = rho[0].length, X = [], y = [];
  for (let k = K0; k < rec.e.length; k++) {
    const feat = [];
    for (let i = 1; i <= na; i++) feat.push(rec.e[k - i][ch]);
    for (let j = 0; j < nb; j++) for (let c = 0; c < NX; c++) feat.push(rec.x[k - j][c]);
    feat.push(1);
    const row = [];
    for (let i = 0; i < feat.length; i++) for (let r = 0; r < nR; r++) row.push(feat[i] * rho[k][r]);
    X.push(row); y.push(rec.e[k][ch]);
  }
  return Float64Array.from(solveRidge(X, y, RIDGE));
};

const shuffle = (rho, seed) => {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const idx = rho.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.map((i) => rho[i]);
};

// The candidate scheduling sets, all read from MEASURED signals: 0/1 are encoder angles.
const SCHEDS = [
  { name: 'none (LTI)', idxs: [] },
  { name: 'elbow q2', idxs: [1] },
  { name: 'both q1,q2', idxs: [0, 1] },
];

console.log(`  na  nb  scheduling      params   held simR² ch0  ch1     shuffled control`);
for (const na of NAS) for (const nb of NBS) {
  const K0 = Math.max(na, nb);
  for (const sch of SCHEDS) {
    const st = statsOf(tr, sch.idxs);
    const rhoTr = mkRho(tr, sch.idxs, st), rhoTe = mkRho(te, sch.idxs, st);
    const nP = (na + nb * NX + 1) * rhoTr[0].length;
    const real = [], ctrl = [];
    for (let ch = 0; ch < NC; ch++) {
      const W = fit(tr, ch, na, nb, rhoTr, K0);
      const sim = simulate(te, W, na, nb, rhoTe);
      const act = Float64Array.from(te.e, (r) => r[ch]);
      real.push(r2(Array.from(sim.slice(K0)), Array.from(act.slice(K0))));
      if (sch.idxs.length) {
        const sTr = shuffle(rhoTr, 12345 + ch), sTe = shuffle(rhoTe, 999 + ch);
        const Wc = fit(tr, ch, na, nb, sTr, K0);
        const simC = simulate(te, Wc, na, nb, sTe);
        ctrl.push(r2(Array.from(simC.slice(K0)), Array.from(act.slice(K0))));
      } else ctrl.push(NaN);
    }
    const f = (v) => (Number.isFinite(v) ? (v > -9.99 ? v.toFixed(3) : v.toExponential(1)) : ' div').padStart(8);
    console.log(`  ${String(na).padStart(2)}  ${String(nb).padStart(2)}  ${sch.name.padEnd(14)}`
      + `${String(nP).padStart(6)}   ${real.map(f).join('')}   ${ctrl.map(f).join('')}`);
  }
}
console.log(`\n  the bar is the shipped FIR bank at lead 1: 0.989 / 0.840; the global LTI`);
console.log(`  simulator peaks at 0.994 / 0.815. Truth is never injected in any row.\n`);
