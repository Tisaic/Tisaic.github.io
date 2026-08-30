/**
 * @file ONE MODEL FOR EVERY LEAD, OR SIXTY-EIGHT OF THEM?
 *
 * The pilot fits an independent weight vector per lead. That is where both the fit cost and
 * the memory live — and the economy that was supposed to rescue it, one shared covariance for
 * the bank, turns out not to exist: `Pilot._row` indexes the command block at `k + L`, so 12
 * of 25 features are lead-dependent and `X'X` genuinely differs per lead
 * (`test/pilot/shared.test.mjs`).
 *
 * SO THE REMAINING WAY TO COLLAPSE IT IS TO SHARE THE WEIGHTS, not the covariance. The rows
 * already differ by lead in exactly the right way — a lead is the same function of (state now,
 * command then) evaluated at a different `then` — so stacking every lead's rows into ONE
 * regression is a well-posed model, not an approximation. It costs one covariance and `n`
 * weights instead of `N` of each.
 *
 * AND THERE IS A REASON TO EXPECT IT TO DEGRADE WITH LEAD, which is what makes this worth
 * measuring rather than assuming. Predicting `e(k+L)` from the state at `k` uses information
 * that is L samples STALE, and how stale is a property of the lead. A per-lead weight vector
 * can absorb that; a single shared one cannot, unless it is TOLD the lead. So the third
 * candidate here adds the lead as a scheduling variable — the same trick the pose-scheduled
 * block already uses, applied to the horizon index instead of the pose.
 *
 * Held out by TIME, not at random: the last 30% of the record, so a model cannot score by
 * interpolating between rows it has seen (rule 36).
 *
 * Run: node test/pilot/onemodel.mjs
 */
import { Pilot, solveRidge } from '../../lib/pilot/pilot.js';
import { P, PR, makeMachine } from './emps-rig.mjs';

const UMAX = 2e-3;
const pilot = new Pilot({
  autoRefuse: true, nMeasured: 1,
  channels: [{ lo: -0.02, hi: 0.27, vMax: 1.25e-4, aMax: 8.3e-7, jMax: 5e-8 }],
  uMax: UMAX, start: [PR.q[0]], guards: [{ index: 0, max: 0.4 }],
  workspace: () => true, seed: 1, exciteSteps: 40000,
});
{
  const m = makeMachine(PR.q[0], 0);
  let prevRef = PR.q[0];
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    m.step(prevRef);
    prevRef = cmd[0].pos + cmd[0].u;
    pilot.observe([m.q], [m.q - cmd[0].pos]);
  }
}
const st = pilot.status();
const ro = pilot.readouts[0];
console.log(`\npilot: one model for every lead, or ${pilot.N} of them?`);
console.log(`  commissioned on EMPS: N ${pilot.N}, stride ${ro.stride}, ridge ${ro.ridge}, `
  + `basis ${st.report.readouts[0].basis}`);

// A SPREAD OF LEADS, not all of them: the question is how the answer varies ALONG the horizon,
// and the far leads are where the staleness argument predicts it breaks.
const LEADS = [0, 4, 8, 16, 24, 34, 44, 56, pilot.N - 1].filter((L) => L < pilot.N);
const r2 = (yT, yH) => {
  let mu = 0; for (const v of yT) mu += v; mu /= yT.length;
  let ss = 0, sr = 0;
  for (let i = 0; i < yT.length; i++) { ss += (yT[i] - mu) ** 2; sr += (yT[i] - yH[i]) ** 2; }
  return ss > 0 ? 1 - sr / ss : 0;
};
const dot = (w, x) => { let s = 0; for (let i = 0; i < w.length; i++) s += w[i] * x[i]; return s; };

// Build every lead's design matrix once, split by TIME.
const sets = LEADS.map((L) => {
  const { X, y } = pilot._buildXY(0, L * ro.stride ? L : L, ro.stride, 1, ro.poly,
    ro.mLag, ro.fLag, ro.sched);
  const cut = Math.floor(X.length * 0.7);
  return { L, Xtr: X.slice(0, cut), ytr: y.slice(0, cut), Xte: X.slice(cut), yte: y.slice(cut) };
});
const NF = sets[0].Xtr[0].length;
console.log(`  ${sets.length} leads x ${NF} features, ${sets[0].Xtr.length} train / ${sets[0].Xte.length} held-out rows each\n`);

// ---- A: per-lead weights, which is what ships.
const A = sets.map((s) => {
  const w = solveRidge(s.Xtr, s.ytr, ro.ridge);
  return r2(s.yte, s.Xte.map((x) => dot(w, x)));
});

// ---- B: ONE weight vector, fitted on every lead's rows stacked together.
const Xb = [], yb = [];
for (const s of sets) { for (let i = 0; i < s.Xtr.length; i++) { Xb.push(s.Xtr[i]); yb.push(s.ytr[i]); } }
const wB = solveRidge(Xb, yb, ro.ridge);
const B = sets.map((s) => r2(s.yte, s.Xte.map((x) => dot(wB, x))));

// ---- C: one weight vector, TOLD THE LEAD. The row is tensored with [1, u, u^2] for
// u = L/N — enough to represent a smooth variation of the map along the horizon, which is
// what "the state information is L samples stale" implies, at 3x the features and still ONE
// covariance instead of N.
const aug = (x, L) => {
  const u = L / pilot.N, out = new Float64Array(x.length * 3);
  for (let i = 0; i < x.length; i++) {
    out[i] = x[i]; out[x.length + i] = x[i] * u; out[2 * x.length + i] = x[i] * u * u;
  }
  return out;
};
const Xc = [], yc = [];
for (const s of sets) { for (let i = 0; i < s.Xtr.length; i++) { Xc.push(aug(s.Xtr[i], s.L)); yc.push(s.ytr[i]); } }
const wC = solveRidge(Xc, yc, ro.ridge);
const C = sets.map((s) => r2(s.yte, s.Xte.map((x) => dot(wC, aug(x, s.L)))));

console.log('   lead   per-lead R²   one model    one model + lead   (held out by time)');
for (let i = 0; i < sets.length; i++) {
  console.log(`  ${String(sets[i].L).padStart(5)}   ${A[i].toFixed(5).padStart(11)}   `
    + `${B[i].toFixed(5).padStart(9)}   ${C[i].toFixed(5).padStart(16)}`);
}
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
console.log(`   mean   ${mean(A).toFixed(5).padStart(11)}   ${mean(B).toFixed(5).padStart(9)}   ${mean(C).toFixed(5).padStart(16)}`);
// WHAT IT WOULD SAVE, so the trade is a number rather than a direction.
const nL = pilot.N;
console.log(`\n  cost, one channel: per-lead ${nL} x ${NF} weights and ${nL} covariances of `
  + `${NF}² = ${(nL * NF * NF * 8 / 1024).toFixed(0)} kB of covariance;`);
console.log(`        one model ${NF} weights and ONE covariance = ${(NF * NF * 8 / 1024).toFixed(1)} kB `
  + `— ${nL}x less, and the fit is one recursion instead of ${nL}.`);
console.log(`        one model + lead: ${3 * NF} weights, one ${3 * NF}² covariance = `
  + `${(9 * NF * NF * 8 / 1024).toFixed(1)} kB — still ${(nL / 9).toFixed(1)}x less.`);

// ---- AND THE SAME THING THROUGH THE LIBRARY, because an offline refit of the pilot's data is
// not the pilot. `sharedWeights` collapses the bank inside `_fitStep`, and a fit that agrees
// with this table when done by hand and disagrees when done by the code would be the more
// important result. Deployed on the machine, both ways, from the same commissioning stream.
if (process.env.DEPLOY) {
  const { P: PP, PR: PPR, makeMachine: mk } = await import('./emps-rig.mjs');
  const open = (() => {
    const m = mk(PPR.q[0], 0);
    let s2 = 0, n = 0;
    for (let k = 0; k < 8 * PP; k++) {
      m.step(PPR.q[((k - 1) % PP + PP) % PP]);
      if (k >= 4 * PP) { const e = m.q - PPR.q[k % PP]; s2 += e * e; n++; }
    }
    return 1000 * Math.sqrt(s2 / n);
  })();
  const build = async (shared) => {
    const p = new Pilot({
      autoRefuse: true, nMeasured: 1,
      channels: [{ lo: -0.02, hi: 0.27, vMax: 1.25e-4, aMax: 8.3e-7, jMax: 5e-8 }],
      uMax: UMAX, start: [PPR.q[0]], guards: [{ index: 0, max: 0.4 }],
      workspace: () => true, seed: 1, exciteSteps: 40000, sharedWeights: shared,
    });
    const m = mk(PPR.q[0], 0);
    let prevRef = PPR.q[0];
    while (p.phase !== 'done') {
      if (p.phase === 'fit') { p.work(); continue; }
      const cmd = p.command();
      m.step(prevRef);
      prevRef = cmd[0].pos + cmd[0].u;
      p.observe([m.q], [m.q - cmd[0].pos]);
    }
    return p;
  };
  const score = (p) => {
    const m = mk(PPR.q[0], 0), S = p.sample;
    p._initRun();
    let s2 = 0, n = 0, pref = PPR.q[0];
    for (let k = 0; k < 10 * PP; k++) {
      m.step(pref);
      const u = p.act((off) => [PPR.q[(((Math.floor(k / S) + off) * S) % PP + PP) % PP]]);
      pref = PPR.q[k % PP] + u[0];
      p.observe([m.q], null);
      if (k >= 6 * PP) { const e = m.q - PPR.q[k % PP]; s2 += e * e; n++; }
    }
    return 1000 * Math.sqrt(s2 / n);
  };
  console.log('\n  ON THE MACHINE, which is what decides it:');
  for (const shared of [false, true]) {
    const p = await build(shared);
    const rms = score(p);
    const c = p.cost();
    console.log(`    ${shared ? 'one model ' : 'per-lead  '}  ${rms.toFixed(5)} mm  `
      + `${(open / rms).toFixed(2)}x   deploy ${c.peakMacPerCycle.toLocaleString()} MAC/cycle, `
      + `${(c.bytes / 1024).toFixed(1)} kB   verdict ${p.verdict.deploy}`);
  }
}
