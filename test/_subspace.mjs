// HOW MUCH OF THE ONLINE FIT IS ACTUALLY NEEDED? — the experiment the scan budget turns on.
//
// `_rowmake.mjs` measured the fit at 242,978 MAC/sample against the forecast's 14,233. The
// covariance update is 2n^2 and the row is 176 columns, so the fit is 17x the controller and every
// solver change made against the budget so far has been working on the small term.
//
// `SharedRLS` now takes a SUBSPACE: the columns the recursion may move, with the residual still
// computed against the full weight vector so every commissioned column keeps predicting. Cost
// falls to O(m^2 + n). The question is what it costs the machine.
//
// FIVE MODES, AND TWO OF THEM ARE CONTROLS.
//   none      adaptation off. The static floor every row below is measured against.
//   full      today: every column adapts. The number to beat, and the ceiling.
//   newest    the newest lag of every routed signal and command channel, read off the row's own
//             layout — the terms that carry where the machine IS, which is what a moving
//             operating point moves.
//   top-k     the k columns whose commissioned weight is largest, scaled by the column's own
//             spread so a large weight on a tiny column does not win on units alone.
//   random-k  k columns at random, AT MATCHED k. THE CONTROL THAT DECIDES THIS. If random adapts
//             as well as chosen, the selection carries nothing and the whole idea is capacity
//             rather than structure — and the fit's cost has to come from feature cuts instead,
//             which means the quadratic block's 5.6% stops being optional.
//
// ONE COMMISSIONING FOR EVERY MODE, RESTORED BETWEEN THEM. Adaptation mutates the weight vector in
// place, so a second mode on the same object would start from the first one's model; the weights
// are snapshotted and written back, and `none` runs FIRST AND LAST with the two asserted identical
// — if the restore is incomplete the table is a drift measurement and says so (rule 21).
import { commissionArm, deployOn, PG } from './pilot/rigs/arm-rig.mjs';
import { Stack } from '../lib/pilot/stack.js';

const FEED = 0.004, UCAP = 0.6, MU = 0.03;
const DEPTH = +(process.env.SS_DEPTH || 2);
const NFRAC = +(process.env.SS_NFRAC || 0.5);
const K = +(process.env.SS_K || 32);
const SHAPES = ['sharp', 'circle', 'rounded'];
const MODES = (process.env.SS_MODES || 'none,full,newest,top,random,none').split(',');

const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
  uCap: UCAP, Cls: DEPTH > 1 ? Stack : undefined, extra: DEPTH > 1 ? { depth: DEPTH } : null });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const layers = pilot.layers || [pilot];
for (const p of layers) {
  p.uWeight = new Array(p.nc).fill(MU);
  p.N = Math.max(2, Math.round(p.N * NFRAC));
}
console.log(`arm K ${PG.K} / E ${PG.E}, depth ${DEPTH}, Nfrac ${NFRAC}, k ${K}, mu ${MU}`);

const snap = layers.map((p) => (p.readouts || []).map((ro) => (ro && ro.w
  ? ro.w.map((v) => Float64Array.from(v)) : null)));
const restore = () => layers.forEach((p, li) => (p.readouts || []).forEach((ro, ci) => {
  if (!ro || !ro.w || !snap[li][ci]) return;
  ro.w.forEach((v, k) => v.set(snap[li][ci][k]));
  ro._rls = null; ro._row0 && (ro._row0.length = 0); ro._conv0 = 0;
}));

const open = {};
for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
console.log('  open loop:  ' + SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  '));
console.log('\n  mode        adapted cols        sharp     circle    rounded   geo mean    RLS MAC/sample');

const seenNone = [];
for (const mode of MODES) {
  restore();
  for (const p of layers) {
    p.online = mode === 'none' ? null
      : { lambda: 0.999, traceGain: 128,
        subspace: mode === 'full' ? null : mode, subspaceK: K };
  }
  const xs = [], cols = [];
  for (const s of SHAPES) {
    const d = await deployOn(pilot, s, true, FEED);
    xs.push(open[s] / d.r.totalRms);
    cols.push(`${(open[s] / d.r.totalRms).toFixed(2)}x`.padStart(11));
  }
  let m = 0, rls = 0;
  for (const p of layers) for (const ro of (p.readouts || [])) {
    if (!ro || !ro._rls) continue;
    const c = ro._rls.cost();
    m = Math.max(m, ro._rls.m); rls += c.covariance + c.perLead;
  }
  if (mode === 'none') seenNone.push(xs.map((x) => x.toFixed(6)).join(','));
  console.log(`  ${mode.padEnd(10)}${String(m || '-').padStart(9)}      ${cols.join('')}`
    + `${gm(xs).toFixed(3).padStart(11)}x${(rls || 0).toLocaleString().padStart(18)}`);
}
if (seenNone.length > 1) {
  const okr = seenNone.every((r) => r === seenNone[0]);
  console.log(`\n  restore control: ${okr ? 'IDENTICAL' : 'DRIFTED'}  ${seenNone.join('  vs  ')}`);
  if (!okr) console.log('  every row above is suspect at the size of that drift');
}
console.log('EXIT 0');
