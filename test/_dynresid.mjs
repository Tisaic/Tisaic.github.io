// WHERE does the elbow's free-run residual live on the program — at the corner events
// or distributed? Decides event-kernel hybrid vs deeper-model routes. FIR L=780 fitted
// on the full corpus (the best program cell), residual binned by distance to the
// nearest commanded-acceleration spike.
import { readFileSync } from 'node:fs';
import { ridgeMulti } from '/home/user/Tisaic.github.io/test/pilot/rigs/ikfree-rig.mjs';
const SS = 9, L = 780, RIDGE = 1e-2;
const CACHE = '/tmp/claude-0/-home-user-Tisaic-github-io/932a1341-a996-534b-9a60-fb10b63f0258/scratchpad/dynrecords.json';
const R = JSON.parse(readFileSync(CACHE, 'utf8'));
const FIT = [R.w1, R.w2, R.w4, R.w5, R.w6, R.w7, R.p1, R.p2, R.p3, R.p4,
  ...Array.from({ length: 12 }, (_, i) => R['x' + (i + 1)])].filter(Boolean);
const prog = R.prog;
const CQ = [0, 0];
{
  let s0 = 0, s1 = 0, n = 0;
  for (const w of FIT) for (const r of w) { s0 += r.q[0]; s1 += r.q[1]; n++; }
  CQ[0] = s0 / n; CQ[1] = s1 / n;
}
const feat = (rows, t) => {
  const at = (i) => rows[Math.max(0, t - i)].q;
  const f = [1];
  for (let i = 0; i < L; i++) { const q = at(i + (t - t)); const qq = rows[Math.max(0, t - i)].q; f.push(qq[0] - CQ[0], qq[1] - CQ[1]); }
  for (let i = 0; i < L; i += 2) {
    const q = rows[Math.max(0, t - i)].q, qm = rows[Math.max(0, t - i - 1)].q;
    f.push(q[0] - qm[0], q[1] - qm[1]);
  }
  return f;
};
console.log('fitting FIR L=780 on the full corpus…');
const X = [], Y = [];
for (const w of FIT) for (let t = L; t < w.length - 1; t++) { X.push(feat(w, t)); Y.push(w[t + 1].e); }
console.log(`  ${X.length} rows x ${X[0].length} features`);
const W = ridgeMulti(X, Y, RIDGE);
const predict = (f) => W.map((w) => { let s = 0; for (let i = 0; i < f.length; i++) s += w[i] * f[i]; return s; });

// corner events on the program: commanded-accel spike > 10x median
const acc = prog.map((r, t) => t < 2 ? 0 :
  Math.max(Math.abs(prog[t].q[0] - 2 * prog[t - 1].q[0] + prog[t - 2].q[0]),
    Math.abs(prog[t].q[1] - 2 * prog[t - 1].q[1] + prog[t - 2].q[1])));
const med = [...acc].sort((a, b) => a - b)[Math.floor(acc.length / 2)] || 1e-12;
const events = [];
for (let t = 1; t < acc.length; t++) if (acc[t] > 10 * med && acc[t - 1] <= 10 * med) events.push(t);
console.log(`${events.length} corner events on ${prog.length} program samples`);

// residual by distance-to-nearest-event (samples), plus totals
const bins = new Map();
let r2 = [0, 0], tr2 = [0, 0], n2 = 0;
for (let t = L + 50; t < prog.length - 1; t++) {
  const p = predict(feat(prog, t));
  const res = [p[0] - prog[t + 1].e[0], p[1] - prog[t + 1].e[1]];
  let dmin = Infinity;
  for (const ev of events) { const d = t - ev; if (d >= -20 && Math.abs(d) < Math.abs(dmin)) dmin = d; }
  const bin = dmin === Infinity ? 999 : Math.min(40, Math.max(-2, Math.floor(dmin / 10))) * 10;
  if (!bins.has(bin)) bins.set(bin, { s: [0, 0], tr: [0, 0], n: 0 });
  const b = bins.get(bin);
  for (const c of [0, 1]) { b.s[c] += res[c] ** 2; b.tr[c] += prog[t + 1].e[c] ** 2; r2[c] += res[c] ** 2; tr2[c] += prog[t + 1].e[c] ** 2; }
  b.n++; n2++;
}
console.log(`overall NRMSE ${Math.sqrt(r2[0] / tr2[0]).toFixed(3)}/${Math.sqrt(r2[1] / tr2[1]).toFixed(3)}`);
console.log('dist-to-corner(samples)  n     resid rms (sh/el)      truth rms (sh/el)');
for (const [bin, b] of [...bins.entries()].sort((a, c) => a[0] - c[0])) {
  console.log(`${String(bin).padStart(6)}                ${String(b.n).padStart(5)}  `
    + `${Math.sqrt(b.s[0] / b.n).toExponential(2)}/${Math.sqrt(b.s[1] / b.n).toExponential(2)}   `
    + `${Math.sqrt(b.tr[0] / b.n).toExponential(2)}/${Math.sqrt(b.tr[1] / b.n).toExponential(2)}`);
}
// the mid-segment residual's own waveform: oscillatory (mis-damped ring) or slow (an
// unreached lap-period component)? Dump one inter-corner span and count zero crossings.
{
  const t0 = events[4] + 60, t1 = events[5] - 30;
  const rs = [];
  for (let t = t0; t < t1; t++) {
    const pr = predict(feat(prog, t));
    rs.push([t, pr[0] - prog[t + 1].e[0], pr[1] - prog[t + 1].e[1]]);
  }
  let zc = [0, 0];
  for (let i = 1; i < rs.length; i++) for (const c of [0, 1]) {
    if (Math.sign(rs[i][1 + c]) !== Math.sign(rs[i - 1][1 + c])) zc[c]++;
  }
  console.log(`mid-segment span ${t0}-${t1} (${rs.length} samples): zero crossings sh ${zc[0]} el ${zc[1]}`);
  console.log('  (a flex ring at ~40-60 step period would cross ~' + Math.round(2 * rs.length * SS / 50)
    + ' times; a lap-period component ~2)');
  const line = (c) => rs.filter((_, i) => i % 6 === 0).map((r) => (r[1 + c] >= 0 ? '+' : '-')
    + Math.min(9, Math.round(Math.abs(r[1 + c]) / 4e-3))).join(' ');
  console.log('  sh: ' + line(0));
  console.log('  el: ' + line(1));
}
console.log('EXIT 0');
