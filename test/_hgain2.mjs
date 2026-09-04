// THE PLANT GAIN IS PER CHANNEL, AND THE PROGRAM TRADE IS WHAT SAYS SO.
//
// `_hgain.mjs` swept ONE scalar on `hGrid` at depth 1 and found 3.482x -> 5.192x, 1.49x from a
// single number with no extra training and no extra arithmetic. But it was a TRADE: at 1.30 the
// circle reaches 7.74x while the sharp square FALLS to 3.68x from 4.13x at 1.15. A knob that buys
// one program with another is a preference dressed as a result (rule 42), and it is not what this
// should ship as.
//
// THE TRADE IS THE DIAGNOSTIC. The square's weak channel is the ELBOW — `forecast.mjs` measured
// its held-out R^2 at -0.105 there, worse than predicting the mean, while the circle's two
// channels read 0.966/0.902. So ONE gain is being asked to damp a good channel and a broken one
// at the same time, and which program you score decides which of them wins. That is not a plant
// constant with a program trade inside it; it is a PER-CHANNEL quantity collapsed into one number.
//
// SO THIS SWEEPS THE CHANNELS INDEPENDENTLY, and the question it asks is sharp: is there a cell
// that beats the identified plant on EVERY program at once? If there is, the trade was an artefact
// of tying the channels together and the right object is a vector, not a scalar. If there is not —
// if every cell that helps one program hurts another — then the gain really is program-dependent,
// it cannot be a plant property, and it must not ship at all.
//
// AND THE DERIVATION IS MEASURED, NOT ASSUMED. The QP inverts a forecast, and how far an inversion
// should be trusted is set by that forecast's own residual: the regularised-inverse optimum is the
// EXPLAINED FRACTION. The pilot already validates each readout on held-out data, so a candidate
// rule exists — but the honest order is to measure the surface first and then see which measured
// quantity predicts its peak, rather than to derive a rule and go looking for agreement (rule 16).
// Each channel's own validation R^2 is printed beside the table for exactly that comparison.
import { commissionArm, deployOn, PG } from './pilot/rigs/arm-rig.mjs';
import { Stack } from '../lib/pilot/stack.js';

const FEED = 0.004, UCAP = 0.6;
const MU = process.env.HG_MU !== undefined ? +process.env.HG_MU : 0.03;
const DEPTH = +(process.env.HG_DEPTH || 1);
const NFRAC = +(process.env.HG_NFRAC || 0.75);
const G0 = (process.env.HG_G0 || '1.0,1.15,1.3,1.5').split(',').map(Number);
const G1 = (process.env.HG_G1 || '1.0,1.15,1.3,1.5').split(',').map(Number);
const SHAPES = ['sharp', 'circle', 'rounded'];

const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
  uCap: UCAP, Cls: DEPTH > 1 ? Stack : undefined, extra: DEPTH > 1 ? { depth: DEPTH } : null });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const layers = pilot.layers || [pilot];
for (const p of layers) {
  p.uWeight = MU > 0 ? new Array(p.nc).fill(MU) : null;
  p.N = Math.max(2, Math.round(p.N * NFRAC));
}
const h0 = layers.map((p) => p.hs.map((h) => Float64Array.from(h.hGrid)));

console.log(`arm K ${PG.K} / E ${PG.E}, depth ${DEPTH}, Nfrac ${NFRAC}, mu ${MU}`);
// THE FORECAST'S OWN QUALITY PER CHANNEL, printed first so the derivation can be checked against
// the surface rather than fitted to it after the fact.
for (const p of layers) {
  const q = (p.readouts || []).map((ro) => {
    const v = ro && (ro.val ?? ro.r2 ?? ro.valR2);
    if (typeof v === 'number') return v.toFixed(4);
    if (Array.isArray(v) && v.length) {
      const f = v.filter((x) => typeof x === 'number');
      return f.length ? (f.reduce((a, b) => a + b, 0) / f.length).toFixed(4) : '?';
    }
    return '?';
  });
  console.log(`  held-out forecast quality per channel: ${q.join(' / ')}`);
}
const open = {};
for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
console.log('  open loop:  ' + SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  '));

const base = {};
console.log('\n   g0    g1        sharp     circle    rounded   geo mean   all three up?');
const rows = [];
for (const a of G0) {
  for (const b of G1) {
    layers.forEach((p, li) => p.hs.forEach((h, ci) => {
      const src = h0[li][ci], g = ci === 0 ? a : b;
      for (let i = 0; i < h.hGrid.length; i++) h.hGrid[i] = src[i] * g;
    }));
    const xs = [], cols = [];
    for (const s of SHAPES) {
      const d = await deployOn(pilot, s, true, FEED);
      xs.push(open[s] / d.r.totalRms);
      cols.push(`${(open[s] / d.r.totalRms).toFixed(2)}x`.padStart(11));
    }
    if (a === 1 && b === 1) SHAPES.forEach((s, i) => { base[s] = xs[i]; });
    // THE TEST THE OWNER SET: not a better MEAN, better on EVERY program. A geometric mean can
    // rise while a program goes backwards, and that is the thing this must not do.
    const allUp = Object.keys(base).length === SHAPES.length
      && SHAPES.every((s, i) => xs[i] >= base[s] * 0.999);
    rows.push({ a, b, v: gm(xs), xs: xs.slice(), allUp });
    console.log(`  ${a.toFixed(2)}  ${b.toFixed(2)}   ${cols.join('')}`
      + `${gm(xs).toFixed(3).padStart(11)}x   ${allUp ? 'YES' : 'no'}`);
  }
}
layers.forEach((p, li) => p.hs.forEach((h, ci) => h.hGrid.set(h0[li][ci])));
const up = rows.filter((r) => r.allUp);
const best = rows.reduce((a2, b2) => (b2.v > a2.v ? b2 : a2));
console.log(`\n  best geometric mean ${best.v.toFixed(3)}x at (${best.a}, ${best.b})`
  + `  — all three up: ${best.allUp ? 'YES' : 'NO'}`);
if (up.length) {
  const bu = up.reduce((a2, b2) => (b2.v > a2.v ? b2 : a2));
  console.log(`  best cell that improves EVERY program: ${bu.v.toFixed(3)}x at (${bu.a}, ${bu.b})`
    + `  — ${SHAPES.map((s, i) => `${s} ${base[s].toFixed(2)}->${bu.xs[i].toFixed(2)}`).join(', ')}`);
} else {
  console.log('  NO CELL improves every program — the gain is program-dependent on this evidence,'
    + ' it is not a plant property, and it must not ship');
}
console.log('EXIT 0');
