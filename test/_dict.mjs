// A RICH DICTIONARY, PRUNED BY IMPACT — the original NGRC design, which this pilot never had.
//
// WHAT IS ACTUALLY THERE. `polyTerms` offers each channel the degree-2 products of a REDUCED base
// (the newest lag of each measured signal plus the lead-0 command taps) and nothing else: no
// sin, no tanh, no degree 3, and no per-TERM decision. The choice is per BLOCK — linear, or
// linear plus the quadratic block, or linear plus a pose-scheduled block — taken whole or refused
// whole on held-out data. A ridge shrinks coefficients but never removes a column, so a term that
// earns nothing still costs its multiply on every scan.
//
// THE OWNER'S DESIGN IS DIFFERENT IN THE WAY THAT MATTERS: offer many rich functions at
// identification, then CUT the ones that carry nothing — keeping the interesting relations and
// paying only for those. Final capacity is small; the risk moves from the model to the SELECTION,
// and held-out data can police a selection directly.
//
// AND THAT DISTINCTION IS WHY THE EVIDENCE AGAINST RICH BASES HERE DOES NOT SETTLE IT. Every
// measurement on record is ADD WIDE, KEEP WIDE: a 544-feature map lost to linear features with
// the right window twice (rule 37); the scheduled block scores WORSE without its hundredfold
// ridge; leaky states bought 0.015 of held-out R^2 and resonators made it worse. Search wide,
// keep narrow has never been run.
//
// THE METHOD IS MATCHING PURSUIT WITH A VALIDATED PICK, and the validation is the whole point.
// A first version selected each term by its correlation with the TRAINING residual — pruning by
// an impact measured on the same rows the model is fitted to — and with 1095 candidates that
// memorises noise by construction: in-sample climbed at every step (0.9950 -> 0.9978 on the
// shoulder, 0.9306 -> 0.9827 on the elbow) while held-out collapsed from the FIRST term, ending
// at 0.291 / 0.121 / -0.150 on the elbow against a shipped 0.620 / 0.620 / 0.410. That measures
// greedy-on-training, not the idea.
//
// So the commissioning record is SPLIT: terms are proposed by their correlation with the fit
// residual (cheap, and only a shortlist), each shortlisted term is refitted on the fit rows and
// scored on VALIDATION rows it did not see, the best is taken only if validation IMPROVES, and
// the search stops when none does. The three programs stay a true held-out set, never consulted
// by the selection — otherwise the stopping rule is fitted to them too.
//
// THE DICTIONARY, all built on STANDARDISED inputs because a threshold or a prior must be scaled
// to the quantity it acts on (rule 32) — an unscaled tanh of a 0.06-magnitude regressor is a
// linear function of it, and an unscaled sin of a large one is noise:
//   products    x_i * x_j        the degree-2 block that exists today
//   cubes       x_i^2 * x_j      the degree-3 terms the owner named and nothing here has
//   sin, cos    at the signal's own scale — periodic structure, e.g. cogging or pose harmonics
//   tanh        a soft saturation, which is what a drive near its limit looks like
//   |x|, x|x|   friction-shaped: Coulomb is a sign, Stribeck is odd and superlinear
//
// WHAT WOULD KILL IT: held-out R^2 no better than the shipped basis at any term count. Then the
// residual carries no static nonlinear structure in these signals, the arm's refusal of the
// quadratic block is a fact about the arm rather than about the block, and the dictionary is dead
// whatever it contains.
import { solveRidge } from '/home/user/Tisaic.github.io/lib/pilot/pilot.js';
import { PG, commissionArm, recordOpenLoop } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.DC_FEED || 0.004);
const UCAP = +(process.env.DC_UCAP || 0.6);
const SHAPES = (process.env.DC_SHAPES || 'rounded,circle,sharp').split(',');
const KMAX = +(process.env.DC_KMAX || 24);
const AMP = +(process.env.DC_AMP || 0);          // probe amplitude override, 0 = shipped

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`
  + (AMP ? `, probe ${AMP} rad` : ''));
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP,
  before: AMP ? (p) => { p.probeAmp = AMP; p.ditherAmp = (2 / 3) * AMP; } : null });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
if (!pilot._fit || !pilot._fit.eFree) { console.log('record released'); process.exit(1); }
console.log(`basis chosen by the shipped selector: `
  + pilot.readouts.map((r) => (r.poly ? 'quad' : 'lin') + (r.sched ? '+sched' : '')).join(' / '));

const recs = {};
for (const s of SHAPES) recs[s] = await recordOpenLoop(pilot, s, FEED);

// THE BASE A RICH TERM IS BUILT FROM IS THE DELAY EMBEDDING, NOT THE NEWEST SAMPLE.
//
// This is the correction that matters. `polyTerms` multiplies the NEWEST measured lag by itself,
// and its own comment says what that costs: "it can express a static nonlinearity and nothing
// more". The original dictionary's terms are products ACROSS LAGS — x[k-2]^2 * y[k] and the like
// — which express a DYNAMIC nonlinearity: the state now against the state a while ago.
//
// AND THIS ARM HAS ALREADY SAID THAT IS THE RIGHT DIRECTION, in the one narrow form somebody
// hand-picked. The pose-scheduled block is a RESTRICTED cross-lag product — one scheduling
// variable times the whole lagged block — and it measured held-out R^2 0.771 against a
// memory-alone 0.771 -> 0.840 on this arm, trained on five programs and tested on a sixth. A
// general cross-lag dictionary with per-term selection is that finding without the hand-picking.
const LAGS = (process.env.DC_LAGS || '0,1,2,4,8').split(',').map(Number);
function baseSignals(rec, k, L, stride) {
  const v = [], name = [];
  for (let ch = 0; ch < pilot.nm; ch++) {
    for (const l of LAGS) {
      v.push(rec.x[Math.max(0, k - l * stride)][ch]);
      name.push(`m${ch}${l ? `[-${l}]` : ''}`);
    }
  }
  for (let ch = 0; ch < pilot.nc; ch++) {
    const idx = Math.max(0, Math.min(k + L, rec.cmd.length - 1));
    const p0 = rec.cmd[idx][ch], p1 = rec.cmd[Math.max(0, idx - 1)][ch];
    v.push(p0); name.push(`c${ch}`);
    v.push((p0 - p1) * (pilot.Ts / pilot.sample)); name.push(`v${ch}`);
  }
  return { v, name };
}

/**
 * THE DICTIONARY, on the standardised delay embedding. Everything is built on standardised
 * inputs because a threshold or a prior must be scaled to the quantity it acts on (rule 32): an
 * unscaled tanh of a 0.06-magnitude regressor IS a linear function of it, and an unscaled sin of
 * a large one is noise.
 *
 *   z_i * z_j      products across lags — the dynamic quadratic the shipped block cannot express
 *   z_i^2 * z_j    the cubic cross-lag form, against the newest of each signal
 *   sin, cos       periodic structure at the signal's own scale
 *   tanh           a soft saturation, which is what a drive near its limit looks like
 *   |z|, z|z|      friction-shaped: Coulomb is a sign, Stribeck is odd and superlinear
 *
 * The cubic block is restricted to a NEWEST-lag second factor rather than the full triple
 * product, which would be tens of thousands of columns for a selection that keeps twenty-four.
 * A candidate pool is not free: every extra term is another chance for the greedy step to pick
 * noise, which is what the held-out columns are there to catch.
 */
function richTerms(z, names, out, outName, newest) {
  const n = z.length;
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
    out.push(z[i] * z[j]); if (outName) outName.push(`${names[i]}*${names[j]}`);
  }
  for (let i = 0; i < n; i++) for (const j of newest) {
    if (i === j) continue;
    out.push(z[i] * z[i] * z[j]); if (outName) outName.push(`${names[i]}^2*${names[j]}`);
  }
  for (let i = 0; i < n; i++) {
    out.push(Math.sin(z[i])); if (outName) outName.push(`sin ${names[i]}`);
    out.push(Math.cos(z[i])); if (outName) outName.push(`cos ${names[i]}`);
    out.push(Math.tanh(z[i])); if (outName) outName.push(`tanh ${names[i]}`);
    out.push(Math.abs(z[i])); if (outName) outName.push(`|${names[i]}|`);
    out.push(z[i] * Math.abs(z[i])); if (outName) outName.push(`${names[i]}|${names[i]}|`);
  }
}

/** Rows: the shipped basis, plus the standardised rich block. */
// the lag-0 entry of each measured signal plus the command terms — the second factor of a cubic
const NEWEST = (() => {
  const idx = [];
  for (let ch = 0; ch < pilot.nm; ch++) idx.push(ch * LAGS.length);
  for (let i = 0; i < 2 * pilot.nc; i++) idx.push(pilot.nm * LAGS.length + i);
  return idx;
})();

function build(rec, c, L, ro, target, scale) {
  const saved = pilot._rec;
  pilot._rec = { x: rec.x, cmd: rec.cmd, u: [], e: rec.e };
  const stride = ro.stride, mL = ro.mLag, fL = ro.fLag;
  const back = Math.max((mL - 1) * stride, (fL - 1) * stride - L);
  const from = Math.max(back, rec.lap || back);
  const to = target.length - L - 1;
  const B = [], Rr = [], y = [], names = [];
  try {
    for (let k = from; k < to; k++) {
      B.push(pilot._row(c, k, L, stride, ro.poly, mL, fL, ro.sched, ro.longR || null));
      const bs = baseSignals(rec, k, L, stride);
      const z = bs.v.map((v, i) => (scale ? (v - scale.mu[i]) / scale.sd[i] : v));
      const r = [];
      richTerms(z, bs.name, r, names.length ? null : names, NEWEST);
      Rr.push(r); y.push(target[k + L]);
    }
  } finally { pilot._rec = saved; }
  return { B, R: Rr, y, names };
}

/** Standardisation of the reduced base, measured on the TRAINING record only. */
function fitScale(rec, c, L, ro, target) {
  const stride = ro.stride, mL = ro.mLag, fL = ro.fLag;
  const back = Math.max((mL - 1) * stride, (fL - 1) * stride - L);
  const to = target.length - L - 1;
  const acc = [], acc2 = []; let n = 0;
  for (let k = back; k < to; k++) {
    const bs = baseSignals(rec, k, L, ro.stride);
    for (let i = 0; i < bs.v.length; i++) {
      acc[i] = (acc[i] || 0) + bs.v[i]; acc2[i] = (acc2[i] || 0) + bs.v[i] * bs.v[i];
    }
    n++;
  }
  const mu = acc.map((s) => s / n);
  const sd = acc2.map((s, i) => Math.max(1e-12, Math.sqrt(Math.max(0, s / n - mu[i] * mu[i]))));
  return { mu, sd };
}

const r2 = (X, y, w) => {
  let sse = 0, sy = 0, sy2 = 0;
  for (let i = 0; i < X.length; i++) {
    let p = 0; const r = X[i];
    for (let j = 0; j < w.length; j++) p += w[j] * r[j];
    const d = y[i] - p; sse += d * d; sy += y[i]; sy2 += y[i] * y[i];
  }
  return 1 - sse / Math.max(sy2 - (sy * sy) / X.length, 1e-300);
};
const join = (B, R, sel) => B.map((b, i) => b.concat(sel.map((s) => R[i][s])));

for (let c = 0; c < pilot.nc; c++) {
  const ro = pilot.readouts[c];
  const L = 0;                       // lead 0: the one a receding horizon applies
  const scale = fitScale(pilot._rec, c, L, ro, pilot._fit.eFree[c]);
  const tr = build(pilot._rec, c, L, ro, pilot._fit.eFree[c], scale);
  const ho = {};
  for (const s of SHAPES) ho[s] = build(recs[s], c, L, ro, recs[s].e.map((v) => v[c]), scale);
  console.log(`\n=== channel ${c}, lead 0 — ${tr.B[0].length} shipped columns, `
    + `${tr.R[0].length} rich candidates, ${tr.B.length} rows ===`);
  console.log('    k   term added              validation  in-sample' + SHAPES.map((s) => s.padStart(11)).join(''));

  // THE SPLIT: the last third of the commissioning record validates the SELECTION. A time split
  // rather than an interleave, because the rows are a correlated time series and an interleaved
  // split leaks a neighbouring sample into the validation set.
  const nAll = tr.B.length, nFit = Math.floor(nAll * 0.67);
  const sub = (X, a, b) => X.slice(a, b);
  const sel = [];
  const pen = (k) => tr.B[0].map(() => 1).concat(new Array(k).fill(100));
  const fitAt = (selection) => {
    const X = selection.length ? join(tr.B, tr.R, selection) : tr.B;
    const w = solveRidge(sub(X, 0, nFit), tr.y.slice(0, nFit), ro.ridge,
      selection.length ? pen(selection.length) : pilot._colScale(tr.B[0]));
    return { w, val: r2(sub(X, nFit, nAll), tr.y.slice(nFit, nAll), w) };
  };
  let cur = fitAt(sel);
  let w = solveRidge(tr.B, tr.y, ro.ridge, pilot._colScale(tr.B[0]));
  const show = (k, nm, val) => {
    const X = sel.length ? join(tr.B, tr.R, sel) : tr.B;
    const cols = SHAPES.map((sh) => {
      const HH = sel.length ? join(ho[sh].B, ho[sh].R, sel) : ho[sh].B;
      return r2(HH, ho[sh].y, w).toFixed(4).padStart(11);
    }).join('');
    console.log(`  ${String(k).padStart(3)}   ${nm.padEnd(22)}   ${val.toFixed(4).padStart(9)}`
      + `   ${r2(X, tr.y, w).toFixed(4).padStart(9)}${cols}`);
  };
  show(0, '(shipped basis)', cur.val);

  const resid = new Float64Array(nFit);
  const recompute = () => {
    const X = sel.length ? join(tr.B, tr.R, sel) : tr.B;
    const f = fitAt(sel);
    for (let i = 0; i < nFit; i++) {
      let p = 0; for (let j = 0; j < f.w.length; j++) p += f.w[j] * X[i][j];
      resid[i] = tr.y[i] - p;
    }
  };
  recompute();
  const nCand = tr.R[0].length, taken = new Set();
  const TOPK = +(process.env.DC_TOPK || 8);
  for (let k = 1; k <= KMAX; k++) {
    // propose by impact on what the model still cannot explain, on the FIT rows only
    const score = [];
    for (let j = 0; j < nCand; j++) {
      if (taken.has(j)) continue;
      let sxy = 0, sx = 0, sxx = 0;
      for (let i = 0; i < nFit; i++) { const v = tr.R[i][j]; sxy += v * resid[i]; sx += v; sxx += v * v; }
      const den = Math.sqrt(Math.max(1e-30, sxx - (sx * sx) / nFit));
      score.push({ j, v: Math.abs(sxy) / den });
    }
    score.sort((a, b) => b.v - a.v);
    // and DECIDE on rows the proposal never saw
    let best = null, bestVal = cur.val;
    for (const cand of score.slice(0, TOPK)) {
      const f = fitAt(sel.concat([cand.j]));
      if (f.val > bestVal) { bestVal = f.val; best = cand.j; }
    }
    if (best === null) {
      console.log(`  ${String(k).padStart(3)}   -- no candidate of the top ${TOPK} improves validation; `
        + `the search stops with ${sel.length} term(s) kept`);
      break;
    }
    taken.add(best); sel.push(best);
    cur = fitAt(sel);
    w = solveRidge(join(tr.B, tr.R, sel), tr.y, ro.ridge, pen(sel.length));
    recompute();
    show(k, tr.names[best], cur.val);
  }
}
console.log('EXIT 0');
