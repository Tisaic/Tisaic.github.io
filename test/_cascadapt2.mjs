// GATED ONLINE ADAPTATION THROUGH EVERY LAYER OF A CASCADE, OR THE MEASUREMENT THAT SAYS IT
// CANNOT BE DONE.
//
// WHAT `test/_cascadapt.mjs` FOUND AND WHAT ITS OWN LAST COLUMN CONFESSED. Adaptation armed at
// DEPLOY only, so the commissioned model is identical in both rows:
//
//   depth  adapt         sharp          circle         rounded    geo mean   rows admitted
//     1    false    3.74x u0.576    3.19x u0.313    3.16x u0.440    3.35     0+0
//     1    true     4.56x u0.577    4.24x u0.308    4.28x u0.433    4.36     1964+1964
//     2    false    4.14x u0.579    9.20x u0.291    5.78x u0.445    6.04     0+0 | 0+0
//     2    true     4.95x u0.576    7.53x u0.296    5.94x u0.443    6.05     0+0 | 1803+1969
//
// At depth 1 adaptation is +30% on all three programs with nothing traded — one of only two
// levers measured that does not buy the corner with the arcs. At depth 2 the geometric mean
// does not move, and the admitted-row column says why the comparison was never fair:
// `0+0 | 1803+1969`. ONLY THE TOP LAYER ADAPTED. `Stack.observe` sent the truth to exactly one
// layer, so "depth 2 with adaptation" was depth 2 with adaptation on half of it.
//
// AND THE OBVIOUS FIX IS WRONG, which is the whole reason this file exists. Each layer's model
// predicts the error with ITS OWN correction removed and `Pilot._onlineStep` reconstructs that
// as `truth - _conv0`. For the TOP layer that is exact. Hand the same raw truth to a layer
// below and the layers ABOVE are still in the signal: the target is the residual of a machine
// that layer never modelled. `Stack._deployTruth` now peels them off — `truth` minus the
// convolutions of the layers strictly above, each layer subtracting its own as it always did —
// and the peel is what this bench has to show is worth having.
//
// FIVE MODES, AND THREE OF THEM ARE CONTROLS.
//   none    every layer frozen. MUST reproduce 3.35 and 6.04 exactly, or the harness is wrong.
//   top     what shipped: the top layer only. Reproduces the 4.36 / 6.05 rows.
//   all     the peel — every layer adapting on a target reconstructed for it.
//   naive   every layer adapting on the RAW truth, which is the defect `Stack.observe`'s old
//           comment describes. This is the control that decides whether the peel is load-
//           bearing or decorative: if `all` and `naive` measure the same, the arithmetic that
//           took a day to justify is worth nothing (rule 9, both halves).
//   below   every layer EXCEPT the top adapting — at depth 2 that is the bottom layer alone —
//           with the top armed on a gate that admits nothing, so it still records the
//           convolution the peel needs but never moves its own weights. It isolates the peel
//           from the thing that already worked: any gain here is the reconstructed target's
//           own, and harm here says the reconstruction is garbage.
//
// ONE COMMISSIONING PER DEPTH, RESTORED BETWEEN MODES. Adaptation mutates the weight vector in
// place (`SharedRLS.theta[0]` IS the readout's `w[0]`), so a second mode on the same object
// would start from the first one's model. The weights are snapshotted and written back, and
// `none` is run FIRST and LAST with the two scores asserted identical — if the restore is
// incomplete the harness says so instead of reporting a drift as a finding (rule 21).
//
// WHAT WOULD KILL IT: `all` no better than `top`. Then the lower layers have nothing left to
// track, the cascade's "layers below are frozen by definition" stands as written, and depth
// and adaptation are one repair twice.
//
// WHAT IT MEASURED, at K 0.25 / E 0.03, feed 0.004, uCap 0.6, mu 0.03, ONE commissioned model
// per depth, phase replayed, restore control IDENTICAL to six decimals:
//
//   depth  mode     sharp    circle   rounded    geo    admitted L1 | L2      peel
//     2    none     4.14x     9.19x    5.78x     6.04   0+0       | 0+0        -
//     2    top      4.96x     7.73x    6.08x     6.16   0+0       | 1786+1868  0.630
//     2    all      4.87x     9.77x    6.87x     6.89   1900+1900 | 1785+1868  0.604
//     2    naive    5.22x     8.95x    6.93x     6.87   1900+1900 | 1785+1867  -
//     2    below    4.01x     9.88x    5.82x     6.13   1901+1901 | 0+0        0.683
//
// **THE PEEL IS LOAD-BEARING, AND NOT ON THE GEOMETRIC MEAN.** `all` and `naive` are 6.89 and
// 6.87, indistinguishable inside the 0.7% this bench resolves. Read per PROGRAM they are not
// the same result at all: `all` is the ONLY row where no program is worse than not adapting,
// while `naive` gives the circle up (8.95 against the static 9.19) and so does the shipped
// `top` (7.73). A mean that improves while one program regresses is a trade, and the peel is
// what removes the trade rather than what raises the mean.
//
// AND THE HALF-RUN VERSION WAS A TRADE, WHICH IS WHY ITS MEAN LOOKED FLAT. `top` buys sharp
// (4.14 -> 4.96) with circle (9.19 -> 7.73); the geometric mean moves 6.04 -> 6.16 and hides
// both. `all` reads 4.87 / 9.77 / 6.87 — every program up, nothing traded.
//
// `below` IS THE FALSIFIER AND IT DID NOT FIRE. If the reconstructed target were garbage, the
// bottom layer adapting ALONE towards it would visibly harm; it reads 6.13 against the static
// 6.04, with the circle at 9.88 — the best single reading in the table — and sharp 3% down.
// The peel's magnitude is stated beside it: the layers above account for 60-68% of the truth's
// rms, so this is a large correction and not a rounding term (rule 25's other half — a null
// result would otherwise have two indistinguishable explanations).
//
// WHAT IS STILL OPEN: one plant, one cell, one seed, three programs. `all` and `naive` differ
// per program in OPPOSITE directions (naive +7% sharp, -9% circle), which is what two
// different biases look like rather than one being noise; separating them needs seeds.
import { commissionArm, deployOn, PG } from './pilot/rigs/arm-rig.mjs';
import { Stack } from '../lib/pilot/stack.js';

const FEED = +(process.env.CD_FEED || 0.004);
const UCAP = +(process.env.CD_UCAP || 0.6);
const SHAPES = (process.env.CD_SHAPES || 'sharp,circle,rounded').split(',');
const MU = +(process.env.CD_MU || 0.03);
const DEPTHS = (process.env.CD_DEPTHS || '1,2').split(',').map(Number);
const MODES = (process.env.CD_MODES || 'none,top,all,naive,below,none').split(',');
const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);
/**
 * A FINGERPRINT OF THE MODEL THE ROW WAS SCORED ON. Two modes configured identically must
 * start from identical weights; if a row's numbers move while this does not, the carrier is
 * something other than the weights and guessing which is how a day goes (rule 23 — build the
 * number rather than argue from the picture).
 */
const fp = (layers) => {
  let h = 0;
  for (const p of layers) {
    for (const ro of p.readouts) {
      const seen = new Set();
      for (const w of ro.w) {
        if (seen.has(w)) continue;
        seen.add(w);
        for (let i = 0; i < w.length; i++) {
          h = (h * 31 + Math.round(w[i] * 1e12)) % 2147483647;
        }
      }
    }
  }
  return h;
};

/** rms of what the peel removed, over the rms of the raw truth it was removed from. */
const peelRatio = (p) => {
  const P = p.report && p.report.peel;
  return (P && P.n && P.t2 > 0) ? (Math.sqrt(P.sum2 / P.t2)).toFixed(3) : '-';
};

// A gate threshold no row can clear, so a layer RECORDS its convolution (which `_decide` only
// captures under `online`) without ever moving its weights. Finite rather than Infinity: with
// an all-zero row `Infinity * 0` is NaN and `info < NaN` is false, which would admit the row —
// the "not measured reads as zero" trap in its arithmetic costume (rule 25).
const FROZEN_BUT_RECORDING = { lambda: 1, minInfo: 1e300 };
const ADAPTING = { lambda: 0.9995, minInfo: 0.25 };

/** Every distinct weight vector a layer holds, and a copy of each. */
function snapshot(layers) {
  return layers.map((p) => p.readouts.map((ro) => {
    const seen = new Set(), out = [];
    for (const w of ro.w) if (!seen.has(w)) { seen.add(w); out.push([w, Array.from(w)]); }
    return out;
  }));
}

/**
 * THE SAMPLE PHASE, REPLAYED — because a deploy is not reproducible without it.
 *
 * `Pilot.k` counts `observe` calls and is zeroed in the CONSTRUCTOR only, never by
 * `_initRun`; `_deployObserve` pushes to the ring on `k % sample === 0`. So the same model
 * deployed twice in one process samples its own regressor stream on a different phase the
 * second time, and the two runs are not the same experiment. Measured here as a 0.6% drift
 * between two `none` rows whose weight fingerprints matched to the digit — small, but the same
 * size as the effects this table exists to read, which makes it the difference between a
 * finding and a coincidence. The first row records the `k` each deploy started at and every
 * later row is put back on it, so every row runs the identical phase history.
 *
 * NOT FIXED IN THE LIBRARY, deliberately: what `_initRun` should do with `k` is a question
 * about the shipped controller (a machine restarted mid-lap really does resume at some phase),
 * and answering it here would change every number in the repository from inside a bench.
 */
const alignK = (layers, rec, j) => {
  if (!rec[j]) rec[j] = layers.map((p) => p.k);
  else layers.forEach((p, i) => { p.k = rec[j][i]; });
};

/** Put the commissioned model back, and clear every piece of state adaptation left behind. */
function restore(layers, snap) {
  layers.forEach((p, li) => p.readouts.forEach((ro, ci) => {
    for (const [w, copy] of snap[li][ci]) {
      if (w.set) w.set(copy); else for (let i = 0; i < copy.length; i++) w[i] = copy[i];
    }
    ro._rls = null; ro._infoRef = undefined; ro._conv0 = 0;
    ro._onlineN = 0; ro._infoSkipped = 0; ro._infoSeen = 0;
    // Redundant since `_initRun` clears it at every run boundary, and kept because THIS is
    // the line the first version of this harness was missing: two identically-configured
    // rows measured 4.33x and 4.91x apart on nothing but the row `_decide` had left behind.
    ro._row0.length = 0;
  }));
}

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, mu ${MU}`);
let open = null, drifted = false;
for (const depth of DEPTHS) {
  const extra = depth > 1 ? { depth } : null;
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, Cls: depth > 1 ? Stack : undefined, extra });
  if (!pilot) { console.log(`  depth ${depth}: never terminated`); continue; }
  const layers = pilot.layers || [pilot];
  for (const p of layers) p.uWeight = MU > 0 ? new Array(p.nc).fill(MU) : null;
  const snap = snapshot(layers);
  // THE STACK'S OWN `observe` IS THE THING UNDER TEST, so `naive` replaces it here rather than
  // adding a switch to the library: the defect being controlled for is what the library used
  // to do to the TOP layer applied to all of them, and it belongs in the bench that measures
  // it, not in shipped code.
  const routed = pilot.observe.bind(pilot);
  // BOUND BEFORE `pilot.observe` IS EVER REASSIGNED. At depth 1 the stack IS the layer, so
  // reading `p.observe` inside the replacement calls the replacement — an infinite recursion
  // the smoke run found in eight seconds, which is the reason a bench gets a smoke run.
  const layerObserve = layers.map((p) => p.observe.bind(p));
  const naive = (m, t) => layers.forEach((p, i) => {
    if (p.verdict && p.verdict.deploy) layerObserve[i](m, t);
  });

  if (!open) {
    open = {};
    for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
    console.log(`open loop: ${SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  ')}`);
    console.log('\n  depth  mode  ' + SHAPES.map((s) => s.padStart(17)).join('')
      + '     geo mean   admitted (total | last shape)   blocked   clamped');
  }
  const seenNone = [], kRec = [];
  for (const mode of MODES) {
    restore(layers, snap);
    pilot.report.adaptBlocked = 0;
    // THE CAP IS PART OF THE READING. `Stack.act` clamps the SUM, but each layer's `uApplied`
    // records what IT asked for, so a bound cap makes every layer's `_conv0` — the peel's own
    // arithmetic and the top layer's shipped reconstruction alike — the contribution it would
    // have made had nothing clamped. Non-zero here is a stated limit on the row, not a footnote.
    pilot.report.clamped = 0;
    if (pilot.report.peel) pilot.report.peel = { n: 0, sum2: 0, t2: 0 };
    for (let i = 0; i < layers.length; i++) {
      const top = i === layers.length - 1;
      layers[i].online = mode === 'none' ? null
        : (mode === 'top' ? (top ? ADAPTING : null)
          : (mode === 'below' ? (top && layers.length > 1 ? FROZEN_BUT_RECORDING : ADAPTING)
            : ADAPTING));
    }
    pilot.observe = mode === 'naive' ? naive : routed;
    const fp0 = fp(layers);
    const xs = [], cols = [], tot = layers.map((p) => p.readouts.map(() => 0));
    let last = '';
    for (const s of SHAPES) {
      for (const p of layers) {
        for (const r of p.readouts) { r._onlineN = 0; r._infoSkipped = 0; r._infoSeen = 0; }
      }
      alignK(layers, kRec, SHAPES.indexOf(s));
      const d = await deployOn(pilot, s, true, FEED);
      const x = open[s] / d.r.totalRms;
      xs.push(x); cols.push(`${x.toFixed(2)}x u${d.uPk.toFixed(3)}`.padStart(17));
      layers.forEach((p, li) => p.readouts.forEach((r, ci) => { tot[li][ci] += r._onlineN || 0; }));
      last = layers.map((p) => p.readouts.map((r) => r._onlineN || 0).join('+')).join(' | ');
    }
    if (mode === 'none') seenNone.push(xs.map((x) => x.toFixed(6)).join(','));
    console.log(`  ${String(depth).padStart(5)}  ${mode.padEnd(6)}${cols.join('')}`
      + `   ${gm(xs).toFixed(2).padStart(10)}   ${tot.map((l) => l.join('+')).join(' | ')}`
      + ` | ${last}   ${pilot.report.adaptBlocked || 0}   clamp ${pilot.report.clamped || 0}`
      + `   peel ${peelRatio(pilot)}   fp ${fp0}`);
  }
  pilot.observe = routed;
  // THE RESTORE IS ASSERTED, NOT ASSUMED. Two `none` rows around every adapting mode: if the
  // weights did not come all the way back, every mode after the first was scored on a model
  // nobody chose and the whole table is a drift measurement.
  if (seenNone.length > 1) {
    const ok = seenNone.every((r) => r === seenNone[0]);
    // REPORTED, NOT FATAL. The first version exited here, and a control that kills the run it
    // is controlling destroys the measurement instead of qualifying it — the depth-2 block,
    // which is the whole question, never ran. A drift makes the table SUSPECT at the size of
    // the drift; it does not make it absent.
    console.log(`  depth ${depth} restore control: ${ok ? 'IDENTICAL' : 'DRIFTED'} `
      + seenNone.join('  vs  '));
    if (!ok) drifted = true;
  }
}
console.log(drifted ? 'EXIT 1 — a restore control drifted; every row is suspect at that size' : 'EXIT 0');
