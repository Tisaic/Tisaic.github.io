/**
 * @file NOT A TEST — THE RAW RECORDINGS, WHICH DO NOT RESCUE THE FREE RUN (plan §55.10)
 *
 * §55.8 named these as the first thing to try: the benchmark file is 10 Hz with position
 * only, these are 25x faster and carry the MEASURED VELOCITY, so the kinematic relation
 * q[k+1] = q[k] + dt*qd[k] can be ENFORCED rather than fitted — one integrator removed by
 * construction, against a plant whose whole difficulty is that it integrates twice.
 *
 * IT IS NOT ENOUGH, and the raw data is WORSE than the filtered benchmark file:
 *
 *   free-run rms (deg) on a recording the fit never saw
 *   config          feat    0.5s      1s      2s      4s      8s     16s
 *   na=nb=2           37  0.4687  1.8229  6.5145 18.4773 29.4789 33.6745
 *   na=nb=4           73  0.3529  1.5428  5.8684 17.1997 28.1854 31.8507
 *   na=nb=8          145  0.1610  0.8109  3.7181 13.0283 26.0310 33.0535
 *   benchmark 10 Hz   73      —   0.0900  1.0700  6.9300 16.8610 21.0540
 *
 * TWO REASONS IT IS NOT A FAIR FIGHT AND BOTH ARE STATED. The benchmark file is FILTERED and
 * decimated by its own authors, which removes noise a fit cannot use; and the held-out cut
 * here is a WHOLE DIFFERENT RECORDING while the benchmark's test split comes from the same
 * session, so this is the harder test. What the two agree on is the shape: more bandwidth and
 * a measured velocity move the short horizon and leave the long one where it was.
 *
 * ALSO, THE PREMISE WAS WRONG BY 4x AND THE FILE SAYS SO: these were called "1 kHz raw
 * recordings" and `time` reads dt = 0.004 s, which is 250 Hz (rule 17 — read the instrument).
 * Still 25x the benchmark's 10 Hz, which is why it was worth trying.
 *
 * SO THE FORWARD SIMULATOR REMAINS UNBUILT, and the route that does not need one is
 * `kuka-track.mjs`. Not in the suite (rule 2): it reads 54 MB of `.mat` per run.
 */
import { readMat } from './rigs/realdata/matread.mjs';
const FILES = process.argv.slice(2);
const NY = 6;
function load(f) {
  const d = readMat(new URL('rigs/realdata/records/kuka/raw/' + f, import.meta.url).pathname);
  return { q: d.q_mot_meas, qd: d.qd_mot_meas, tau: d.tau_meas, dt: d.time[1][0] - d.time[0][0], n: d.time.length };
}
const recs = FILES.map(load);
const DT = recs[0].dt;
console.log(`${recs.length} recordings, dt=${DT}s (${(1 / DT).toFixed(0)} Hz), ${recs[0].n} samples each`);

/** Row: na lags of q AND qd, nb lags of tau. Target: the next VELOCITY. */
function row(r, k, na, nb) {
  const z = [1];
  for (let i = 1; i <= na; i++) for (let c = 0; c < NY; c++) { z.push(r.q[k - i][c]); z.push(r.qd[k - i][c]); }
  for (let j = 0; j < nb; j++) for (let c = 0; c < NY; c++) z.push(r.tau[k - j][c]);
  return z;
}
function fit(trains, na, nb, lam, stride) {
  const p = 1 + 2 * na * NY + nb * NY;
  const A = Array.from({ length: p }, () => new Float64Array(p));
  const b = Array.from({ length: NY }, () => new Float64Array(p));
  let n = 0;
  for (const r of trains) {
    for (let k = Math.max(na, nb); k < r.n; k += stride) {
      const f = row(r, k, na, nb);
      for (let i = 0; i < p; i++) { const fi = f[i]; if (!fi) continue;
        for (let j = i; j < p; j++) A[i][j] += fi * f[j];
        for (let c = 0; c < NY; c++) b[c][i] += fi * r.qd[k][c]; }
      n++;
    }
  }
  for (let i = 0; i < p; i++) { A[i][i] += lam * n; for (let j = 0; j < i; j++) A[i][j] = A[j][i]; }
  const L = Array.from({ length: p }, () => new Float64Array(p));
  for (let j = 0; j < p; j++) { let dg = A[j][j];
    for (let q2 = 0; q2 < j; q2++) dg -= L[j][q2] * L[j][q2];
    if (!(dg > 0)) return null;
    L[j][j] = Math.sqrt(dg);
    for (let i = j + 1; i < p; i++) { let s = A[i][j]; for (let q2 = 0; q2 < j; q2++) s -= L[i][q2] * L[j][q2]; L[i][j] = s / L[j][j]; } }
  const th = [];
  for (let c = 0; c < NY; c++) { const y0 = new Float64Array(p), x = new Float64Array(p);
    for (let i = 0; i < p; i++) { let s = b[c][i]; for (let q2 = 0; q2 < i; q2++) s -= L[i][q2] * y0[q2]; y0[i] = s / L[i][i]; }
    for (let i = p - 1; i >= 0; i--) { let s = y0[i]; for (let q2 = i + 1; q2 < p; q2++) s -= L[q2][i] * x[q2]; x[i] = s / L[i][i]; }
    th.push(x); }
  return { th, p, na, nb, n };
}
/** Free run over H samples: velocity from the model, POSITION BY EXACT INTEGRATION. */
function horizon(m, r, H) {
  const { na, nb } = m;
  const k0 = Math.max(na, nb);
  let se = 0, nn = 0;
  for (let s = 0; s + H <= r.n; s += H) {
    const q = [], qd = [];
    for (let k = 0; k < k0; k++) { q.push(Float64Array.from(r.q[s + k])); qd.push(Float64Array.from(r.qd[s + k])); }
    const sim = { q, qd, tau: r.tau.slice(s), n: H };
    for (let k = k0; k < H; k++) {
      const f = row(sim, k, na, nb);
      const nv = new Float64Array(NY), nq = new Float64Array(NY);
      for (let c = 0; c < NY; c++) {
        let v = 0; for (let i = 0; i < m.p; i++) v += f[i] * m.th[c][i];
        nv[c] = v; nq[c] = q[k - 1][c] + DT * v;          // kinematics ENFORCED
        if (!isFinite(nq[c]) || Math.abs(nq[c]) > 1e4) return null;
      }
      qd.push(nv); q.push(nq);
      for (let c = 0; c < NY; c++) { se += (r.q[s + k][c] - nq[c]) ** 2; nn++; }
    }
  }
  return Math.sqrt(se / nn);
}
const train = recs.slice(0, recs.length - 1), test = recs[recs.length - 1];
const HS = [0.5, 1, 2, 4, 8, 16].map((s) => Math.round(s / DT));
console.log('\nfree-run rms (deg) on a recording the fit never saw, vs horizon in SECONDS:');
console.log('config'.padEnd(22) + 'feat'.padStart(6) + [0.5, 1, 2, 4, 8, 16].map((s) => `${s}s`.padStart(10)).join(''));
for (const [na, nb] of [[2, 2], [4, 4], [8, 8]]) {
  const t0 = Date.now();
  const m = fit(train, na, nb, 1e-6, 1);
  if (!m) { console.log(`na=${na}: not positive definite`); continue; }
  const out = HS.map((H) => { const r = horizon(m, test, H); return (r === null ? 'div' : r.toFixed(4)).padStart(10); });
  console.log(`na=nb=${na}`.padEnd(22) + String(m.p).padStart(6) + out.join('') + `   ${((Date.now() - t0) / 1000).toFixed(0)}s, ${m.n} rows`);
}
