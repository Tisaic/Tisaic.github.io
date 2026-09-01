/**
 * @file DOES THE MODEL KNOW WHAT THE PROGRAM IS ABOUT TO DO? — held-out forecast R² on programs
 * the commissioning never saw, measured directly rather than inferred from a machine score.
 *
 * WHY THIS AND NOT ANOTHER CONTROLLER EXPERIMENT. The sharp square sits at 1.69x. Every knob that
 * could plausibly move it has now been swept and every one is null: committing 2, 4 or 8 moves of
 * the plan instead of one (1.69 → 1.71 → 1.72 → 1.70); forcing the frequency sweep into three
 * different bands including the square's own (1.70 / 1.70 / 1.69); a dwelling excitation; the
 * decision clock; backlash; compliance; the lag window; and the correction cap, which the square
 * pins at 0.1500 of 0.15 and which buys nothing when raised to 0.3 (peak 0.2363, score 1.68x).
 *
 * A controller that is given more authority, more time to think, more plan commitment and a
 * richer excitation and does not move is not being limited by any of them. What is left is the
 * FORECAST, and brick 55 already established the shape of that argument on EMPS: the pilot was
 * measured to be AT its forecast bound, so the QP, the cap and the horizon were not the
 * constraint. Nobody has measured the bound on THIS plant, on the program that fails.
 *
 * WHAT IT MEASURES. The commissioned readout bank, evaluated on rows built from an OPEN-LOOP run
 * of each program — the model's own regressors, its own leads, its own weights — against the
 * error that run actually produced. Open loop, because with `u = 0` the fit's target `eFree` is
 * the truth exactly, so the comparison needs no reconstruction of what the correction did (rule
 * 16: a number computed from the model cannot check the model).
 *
 * HOW TO READ IT. R² near 1 on a program the machine scores badly says the model is right and
 * the controller is wasting it. R² collapsing on that program says the machine is scored exactly
 * as well as it is predicted, and every controller-side knob was always going to be null.
 *
 * Run: node test/pilot/forecast.mjs   [SHAPES=sharp,circle,rounded] [FEEDS=0.004]
 */
import { solveRidge } from '../../lib/pilot/pilot.js';
import { PG, commissionArm, recordOpenLoop } from './rigs/arm-rig.mjs';

const SHAPES = (process.env.SHAPES || 'rounded,circle,sharp').split(',');
const FEEDS = (process.env.FEEDS || '0.004').split(',').map(Number);
const TRAIN = { shape: process.env.TRAIN || 'rounded', feed: +(process.env.TRAINFEED || 0.004) };

/** Held-out R² of one channel's readout at one lead, on a recorded program. */
function score(pilot, rec, c, li) {
  const ro = pilot.readouts[c];
  const L = ro.leads[Math.min(li, ro.leads.length - 1)];
  const w = ro.w[Math.min(li, ro.w.length - 1)];
  const mL = ro.mLag, fL = ro.fLag, stride = ro.stride;
  const back = Math.max((mL - 1) * stride, (fL - 1) * stride - L);
  // THE FIRST LAP IS DROPPED. The arm starts from a homed pose and the first lap carries the
  // approach transient; scoring across it measures the transient (rule 13).
  const from = Math.max(back, rec.lap);
  const to = rec.e.length - L - 1;
  const saved = pilot._rec;
  pilot._rec = { x: rec.x, cmd: rec.cmd, u: [], e: rec.e };
  let sse = 0, n = 0, sy = 0, sy2 = 0;
  try {
    for (let k = from; k < to; k++) {
      const row = pilot._row(c, k, L, stride, ro.poly, mL, fL, ro.sched);
      if (row.length !== w.length) {
        throw new Error(`row is ${row.length} terms against ${w.length} weights`);
      }
      let p = 0;
      for (let i = 0; i < w.length; i++) p += w[i] * row[i];
      const y = rec.e[k + L][c];
      sse += (y - p) * (y - p); sy += y; sy2 += y * y; n++;
    }
  } finally { pilot._rec = saved; }
  const varY = sy2 / n - (sy / n) ** 2;
  return { r2: 1 - (sse / n) / Math.max(varY, 1e-300), rms: Math.sqrt(sse / n),
    truthRms: Math.sqrt(varY), n };
}

console.log('\npilot: how well does the commissioned model predict programs it has never run?');
console.log(`  arm: E ${PG.E} / K ${PG.K} / backlash ${PG.BL}   trained on ${TRAIN.shape} @${TRAIN.feed}`);
// THE EXCITATION'S BOX, WHICH IS WHAT SETS ITS BANDWIDTH — see the note in the rig. Exposed here
// because shrinking it lifts the elbow's commissioning fit from 0.833 to 0.970 while making the
// GATE refuse, and the refusal is an artefact: the verify clamps the representative program into
// each channel's box, so a small box hands the gate a clipped program to score. The forecast
// table below is measured on the model directly and cannot be confounded that way.
const BOX = +(process.env.BOX || 0.55);
// SPARSE CORNER EVENTS IN THE EXCITATION: EVENTS=vShare,ramp,width,every (e.g. 0.4,2,16,600).
// The velocity trapezoids are sized so the record carries the PROGRAM's acceleration and jerk —
// the regime twelve controller-side knobs could not reach because the scribble never visits it.
const EVENTS = process.env.EVENTS
  ? (([v, r, w, e]) => ({ vShare: v, ramp: r, width: w, every: e }))(
    process.env.EVENTS.split(',').map(Number))
  : null;
const pilot = await commissionArm({ seed: 1, train: TRAIN, box: BOX, events: EVENTS });
if (!pilot) { console.log('  commissioning never terminated'); process.exit(1); }
const st = pilot.status();
console.log(`  verdict: ${pilot.verdict.deploy ? 'deploy' : `REFUSED — ${pilot.verdict.why}`}`);
console.log(`  leads: ${pilot.N} at grid ${pilot.grid} samples; sample ${pilot.sample} solver steps`);
for (let c = 0; c < 2; c++) {
  const r = st.report.readouts[c];
  console.log(`  ch${c}: ${r.basis}, ${r.lags} lags x stride ${r.stride},`
    + ` commissioning R2 lead0 ${(+r.r2Lead0).toFixed(3)} far ${(+r.r2Far).toFixed(3)}`);
}

const LEADS = [0, 'mid', 'far'];
console.log(`\n  ${'program'.padEnd(18)} ${'ch'.padStart(3)}`
  + ` ${'R2 lead0'.padStart(9)} ${'R2 mid'.padStart(9)} ${'R2 far'.padStart(9)}`
  + `  ${'truth rms'.padStart(10)} ${'resid rms'.padStart(10)}`);
for (const shape of SHAPES) {
  for (const feed of FEEDS) {
    const rec = await recordOpenLoop(pilot, shape, feed);
    for (let c = 0; c < 2; c++) {
      const idx = [0, Math.floor(pilot.N / 2), pilot.N - 1];
      const s = idx.map((i) => score(pilot, rec, c, i));
      console.log(`  ${`${shape} @${feed}`.padEnd(18)} ${String(c).padStart(3)}`
        + ` ${s[0].r2.toFixed(3).padStart(9)} ${s[1].r2.toFixed(3).padStart(9)}`
        + ` ${s[2].r2.toFixed(3).padStart(9)}`
        + `  ${s[0].truthRms.toExponential(2).padStart(10)}`
        + ` ${s[0].rms.toExponential(2).padStart(10)}`);
    }
  }
}
console.log(`\n  LEADS column meaning: ${LEADS.join(', ')} of ${pilot.N}.`);
console.log('  A program whose R2 holds while its machine score does not is a CONTROL problem.');
console.log('  A program whose R2 collapses with its machine score is a MODEL problem, and every');
console.log('  controller-side knob is null on it by construction.');

// ─── THE FORK: EXCITATION OR DICTIONARY ─────────────────────────────────────────────────────
//
// `TRAIN` above cannot answer it. It sets the program the GATE is handed as representative and
// the pose the arm homes to; the fit is always on the excitation scribble, which is the whole
// point of a program-agnostic controller. Trained on 'rounded', 'circle' and 'sharp' the R2 table
// comes back identical to three decimal places, which is the right result read the wrong way if
// it is called a null.
//
// The question the table above raises is whether the sharp square's rows are UNREACHABLE by this
// dictionary or merely UNVISITED by this excitation, and the two have opposite fixes. So: refit
// the same features, the same ridge, the same window on the square ITSELF, and score held out.
//
//   HIGH  → the dictionary spans the square and the excitation never took the machine there.
//           The fix is excitation design, and the forced sweep was simply the wrong instrument.
//   LOW   → the features cannot represent it however the machine is driven, and more state —
//           energy, power, a scheduled term — is the only thing that can.
//
// AND IT IS SCORED ACROSS FEEDRATES, not across laps of one program (rule 36). A lag model fitted
// to a repeating stream scores by learning where in the cycle it is; the same square at another
// feed is the same geometry, the same corners and the same reversals on a stream it cannot have
// memorised.
async function refit(shape, fitFeed, testFeed, alsoFit = [], basis = null) {
  const A = await recordOpenLoop(pilot, shape, fitFeed);
  const B = await recordOpenLoop(pilot, shape, testFeed);
  // MORE FIT SOURCES, FOR THE ONE-MAP-TWO-REGIMES QUESTION. Fitting on the square alone reaches
  // 0.946 and on the scribble alone 0.898-0.902 on the smooth programs — each regime is linear
  // enough BY ITSELF. Injecting program-level corner events into the commissioning collapsed the
  // smooth programs' held-out R2 to -0.85 and -5.1, which reads as the two regimes fighting over
  // one set of weights. This measures that directly: one ridge solve over both regimes' rows,
  // scored on each regime separately at an unseen feedrate.
  const extra = [];
  for (const sh of alsoFit) extra.push(await recordOpenLoop(pilot, sh, fitFeed));
  const out = [];
  for (let c = 0; c < 2; c++) {
    const ro = pilot.readouts[c];
    const mL = ro.mLag, fL = ro.fLag, stride = ro.stride;
    // THE BASIS IS OVERRIDABLE so the regime question can be asked of the quadratic and
    // scheduled dictionaries the tune already owns, not only of the one it selected.
    const poly = basis ? basis === 'quad' : ro.poly;
    const sched = basis ? basis === 'sched' : ro.sched;
    const idx = [0, Math.floor(pilot.N / 2), pilot.N - 1];
    const r2 = [];
    for (const li of idx) {
      const L = ro.leads[li];
      const back = Math.max((mL - 1) * stride, (fL - 1) * stride - L);
      const build = (rec) => {
        const saved = pilot._rec;
        pilot._rec = { x: rec.x, cmd: rec.cmd, u: [], e: rec.e };
        const X = [], y = [];
        try {
          for (let k = Math.max(back, rec.lap); k < rec.e.length - L - 1; k++) {
            X.push(pilot._row(c, k, L, stride, poly, mL, fL, sched));
            y.push(rec.e[k + L][c]);
          }
        } finally { pilot._rec = saved; }
        return { X, y };
      };
      const fit = build(A), test = build(B);
      for (const ex of extra) {
        const f2 = build(ex);
        fit.X.push(...f2.X); fit.y.push(...f2.y);
      }
      const w = solveRidge(fit.X, fit.y, ro.ridge);
      let sse = 0, sy = 0, sy2 = 0;
      for (let i = 0; i < test.X.length; i++) {
        let pr = 0;
        for (let j = 0; j < w.length; j++) pr += w[j] * test.X[i][j];
        const d = test.y[i] - pr;
        sse += d * d; sy += test.y[i]; sy2 += test.y[i] * test.y[i];
      }
      const n = test.X.length;
      const varY = sy2 / n - (sy / n) ** 2;
      r2.push(1 - (sse / n) / Math.max(varY, 1e-300));
    }
    out.push(r2);
  }
  return out;
}

console.log('\n  REFIT ON THE PROGRAM ITSELF — same features, same ridge, same window, fitted on');
console.log('  one feedrate and scored on another. This is the dictionary\'s ceiling on this shape.');
console.log(`\n  ${'program'.padEnd(18)} ${'ch'.padStart(3)} ${'R2 lead0'.padStart(9)}`
  + ` ${'R2 mid'.padStart(9)} ${'R2 far'.padStart(9)}   vs scribble-fitted`);
for (const shape of SHAPES) {
  const r = await refit(shape, 0.004, 0.0055);
  for (let c = 0; c < 2; c++) {
    console.log(`  ${`${shape} 0.004→0.0055`.padEnd(18)} ${String(c).padStart(3)}`
      + ` ${r[c][0].toFixed(3).padStart(9)} ${r[c][1].toFixed(3).padStart(9)}`
      + ` ${r[c][2].toFixed(3).padStart(9)}`);
  }
}

// ONE MAP, TWO REGIMES: fit on the sharp square AND the circle together, score each separately.
// If both hold, the regimes coexist in this dictionary and the events experiment failed for a
// different reason (the event SHAPE, backlash, the dither). If either collapses, one linear map
// cannot serve both regimes however the record is gathered, and the route is regime-aware
// modelling rather than better excitation.
console.log('\n  ONE MAP, TWO REGIMES — fitted on sharp AND circle at 0.004, scored at 0.0055,');
console.log('  with each dictionary the tune owns:');
for (const basis of ['linear', 'quad', 'sched']) {
  for (const shape of ['sharp', 'circle']) {
    const r = await refit(shape, 0.004, 0.0055, [shape === 'sharp' ? 'circle' : 'sharp'], basis);
    for (let c = 0; c < 2; c++) {
      console.log(`  ${`${shape} joint/${basis}`.padEnd(18)} ${String(c).padStart(3)}`
        + ` ${r[c][0].toFixed(3).padStart(9)} ${r[c][1].toFixed(3).padStart(9)}`
        + ` ${r[c][2].toFixed(3).padStart(9)}`);
    }
  }
}

// ─── TWO MAPS AND A COMMAND-DRIVEN ROUTER ───────────────────────────────────────────────────
//
// Everything above narrows to this. Each regime ALONE fits a linear map at 0.9+; one map over
// both costs the smooth regime 11x in residual variance; the quadratic and scheduled dictionaries
// make the joint record WORSE (circle elbow 0.857 → -1.7), because more columns on a two-regime
// record buy variance, not regime capacity. And the machine drive is never saturated (peak 86% of
// tauMax at the square's corners, 0% clipped), so none of this is an authority wall.
//
// What makes two maps honest rather than a memory: THE ROUTING SIGNAL IS THE COMMAND. A corner
// is a spike in |Δ²cmd|, known to the controller N steps ahead of when it happens, on any plant,
// with no reference to lap phase or program identity (the retirement's rule: state, never
// position-in-lap — and the commanded acceleration is state the host already hands the QP).
//
// A row predicting the error at sample k+L is routed by whether a command-acceleration spike
// occurred within the model's own window reach before k+L: the corner map answers while the
// corner's transient is inside what the regressors can see, the smooth map otherwise. The
// threshold is derived from the record (rule 32): ten times its own median |Δ²cmd|.
function accelTags(rec, reachSamples, thr) {
  const n = rec.cmd.length, nc = rec.cmd[0].length;
  const spike = new Uint8Array(n);
  for (let k = 1; k < n - 1; k++) {
    let a = 0;
    for (let c = 0; c < nc; c++) {
      a = Math.max(a, Math.abs(rec.cmd[k + 1][c] - 2 * rec.cmd[k][c] + rec.cmd[k - 1][c]));
    }
    if (a > thr) spike[k] = 1;
  }
  // tag[k] = a spike within the last `reachSamples` samples, computed in one pass.
  const tag = new Uint8Array(n);
  let last = -1e9;
  for (let k = 0; k < n; k++) {
    if (spike[k]) last = k;
    tag[k] = (k - last) <= reachSamples ? 1 : 0;
  }
  return tag;
}

async function routedRefit(fitFeed, testFeed, opt = {}) {
  const { thrK = null, peakK = null, reachK = 1 } = opt;
  const recs = { sharp: await recordOpenLoop(pilot, 'sharp', fitFeed),
    circle: await recordOpenLoop(pilot, 'circle', fitFeed) };
  // THE DIAMOND AND THE ROUNDED RECTANGLE ARE SCORED AND NEVER FITTED. The diamond shares the
  // square's corner profile on a path that shares none of its geometry: if the corner map holds
  // there, it is a model of the MOVE PROFILE addressed by command state; if it collapses, it is
  // a memory of the square wearing a router (the retirement's distinction, measured).
  const tests = { sharp: await recordOpenLoop(pilot, 'sharp', testFeed),
    circle: await recordOpenLoop(pilot, 'circle', testFeed),
    diamond: await recordOpenLoop(pilot, 'diamond', testFeed),
    rounded: await recordOpenLoop(pilot, 'rounded', testFeed) };
  // One threshold for everything, derived from the JOINT fit record's own medians.
  const accels = [];
  for (const r of Object.values(recs)) {
    for (let k = 1; k < r.cmd.length - 1; k++) {
      let a = 0;
      for (let c = 0; c < r.cmd[0].length; c++) {
        a = Math.max(a, Math.abs(r.cmd[k + 1][c] - 2 * r.cmd[k][c] + r.cmd[k - 1][c]));
      }
      accels.push(a);
    }
  }
  accels.sort((a, b) => a - b);
  // TWO WAYS TO PLACE THE THRESHOLD, both relative to the record (rule 32). 10x the median was
  // the first guess and it mis-files the rounded rectangle: its corners are ~300% of the
  // declared jerk against the square's 61,000%, so there are two orders of magnitude of room
  // for a threshold that separates them — a fraction of the record's own PEAK spike reaches it,
  // a multiple of its median does not.
  const thr = peakK ? peakK * accels[accels.length - 1]
    : (thrK ?? 10) * accels[Math.floor(accels.length / 2)];
  const out = [];
  for (let c = 0; c < 2; c++) {
    const ro = pilot.readouts[c];
    const mL = ro.mLag, fL = ro.fLag, stride = ro.stride;
    // In samples, the regressors' span — scaled by reachK, because at 1.0 the square's sides
    // out-reach the window (2051 steps against 1287) and 2% of its rows land in the smooth map
    // with mid-side amplitudes the circle never has.
    const reach = Math.ceil(reachK * (mL - 1) * stride);
    const row2 = [];
    for (const li of [0, Math.floor(pilot.N / 2)]) {
      const L = ro.leads[li];
      const back = Math.max((mL - 1) * stride, (fL - 1) * stride - L);
      const build = (rec) => {
        const tag = accelTags(rec, reach, thr);
        const saved = pilot._rec;
        pilot._rec = { x: rec.x, cmd: rec.cmd, u: [], e: rec.e };
        const X = [], y = [], t = [];
        try {
          for (let k = Math.max(back, rec.lap); k < rec.e.length - L - 1; k++) {
            X.push(pilot._row(c, k, L, stride, ro.poly, mL, fL, ro.sched));
            y.push(rec.e[k + L][c]);
            t.push(tag[Math.min(k + L, tag.length - 1)]);
          }
        } finally { pilot._rec = saved; }
        return { X, y, t };
      };
      // Fit the two maps on the union of both programs' rows, split ONLY by the tag.
      const XA = [], yA = [], XB = [], yB = [];
      for (const name of ['sharp', 'circle']) {
        const f = build(recs[name]);
        for (let i = 0; i < f.X.length; i++) {
          if (f.t[i]) { XB.push(f.X[i]); yB.push(f.y[i]); } else { XA.push(f.X[i]); yA.push(f.y[i]); }
        }
      }
      // scribbleA routes the smooth rows to the pilot's OWN commissioned weights instead of a
      // program-fitted map — the production composition: the scribble already serves the smooth
      // regime (rounded deploys at 6.18x on it), so map A should BE the scribble fit and the
      // corner map should be the only new object.
      const wA = opt.scribbleA ? ro.w[Math.min(li, ro.w.length - 1)]
        : solveRidge(XA, yA, ro.ridge);
      const wB = XB.length > 4 * wA.length ? solveRidge(XB, yB, ro.ridge) : null;
      const per = {};
      for (const name of Object.keys(tests)) {
        const te = build(tests[name]);
        let sse = 0, sy = 0, sy2 = 0;
        for (let i = 0; i < te.X.length; i++) {
          const w = te.t[i] && wB ? wB : wA;
          let pr = 0;
          for (let j = 0; j < w.length; j++) pr += w[j] * te.X[i][j];
          const d = te.y[i] - pr;
          sse += d * d; sy += te.y[i]; sy2 += te.y[i] * te.y[i];
        }
        const n = te.X.length;
        const varY = sy2 / n - (sy / n) ** 2;
        per[name] = 1 - (sse / n) / Math.max(varY, 1e-300);
        per[name + 'Corner'] = te.t.reduce((a, b) => a + b, 0) / n;
      }
      row2.push(per);
    }
    out.push(row2);
  }
  return out;
}

console.log('\n  TWO MAPS, ROUTED BY THE COMMAND\'S OWN ACCELERATION — fitted on both programs,');
console.log('  split only by whether a command-accel spike is inside the window reach:');
for (const opt of [{}, { peakK: 0.2 }, { reachK: 1.7 }, { peakK: 0.2, reachK: 1.7 },
  { peakK: 0.2, reachK: 1.7, scribbleA: true }]) {
  console.log(`  router: thr ${opt.peakK ? `${opt.peakK}x peak` : '10x median'}, reach `
    + `${opt.reachK || 1}x window${opt.scribbleA
      ? ', map A = the pilot\'s own scribble fit (production shape)' : ''}`);
  const rr = await routedRefit(0.004, 0.0055, opt);
  for (let c = 0; c < 2; c++) {
    for (const [li, name] of [[0, 'lead0'], [1, 'mid']]) {
      const p = rr[c][li];
      console.log(`  ch${c} ${name.padEnd(6)}`
        + ['sharp', 'circle', 'diamond', 'rounded'].map((nm) =>
          ` ${nm} ${p[nm].toFixed(3).padStart(7)} (${(100 * p[nm + 'Corner']).toFixed(0)}%)`)
          .join(' '));
    }
  }
}
console.log('  vs one joint linear map at lead 0: sharp 0.916, circle 0.857 (ch1) — and the');
console.log('  solo ceilings: sharp 0.946, circle 0.879; scribble-fitted rounded 0.898.');

