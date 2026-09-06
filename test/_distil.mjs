/**
 * @file ITERATION WITHOUT A MEMORY — distilling the oracle ladder's converged prefix into a
 * component addressed by the machine's STATE and the program's local SHAPE.
 *
 * WHAT §48 ESTABLISHED AND WHY THIS IS THE ONLY QUESTION LEFT. The oracle ladder handed the QP a
 * PERFECT free response and measured what every knob is worth: a perfect forecast 20%, the effort
 * weight and the iteration count inert, the decision clock inert at 16x the arithmetic. Then it
 * ITERATED — freeze what a pass applied, re-measure on the machine, invert again — and reached
 * 19.48x total / 23.96x contour and converged there, with the converged PREFIX ALONE doing all of
 * it. So the factor this project is missing is iteration, and the prefix that carries it is
 * indexed by POSITION IN A LAP, which the retirement forbids.
 *
 * THE QUESTION IS THEREFORE NOT "can we iterate" BUT "is what iteration converges to a FUNCTION OF
 * STATE". Those are different claims and only measurement separates them. If the converged
 * correction can be regressed onto signals a deployed machine has and REPRODUCED live, iteration's
 * factor is legal and the lap index was only ever a convenient address. If it cannot, the
 * iteration genuinely encodes where in the lap the machine is, and the retirement costs it.
 *
 * WHAT THE POLICY MAY READ, AND WHY THE COMMAND HALF MATTERS. Two families of input, both already
 * legal for the shipped pilot:
 *
 *   MEASURED — the six signals `routeSignals` hands over (encoder angles, encoder speeds, applied
 *     torques), lagged. These carry the machine's state, and they are also DOWNSTREAM of the
 *     correction, so a policy fitted on them and then closed around them is the positive feedback
 *     rule 35 names. The first run of this bench diverged to 0.07x for exactly that reason.
 *   COMMANDED — the reference at look-ahead and look-behind offsets, read through the same
 *     `refAt` closure the QP's preview uses. The command is NOT affected by the correction, so
 *     this half cannot close a loop at all, and it is a function of the program's LOCAL SHAPE
 *     rather than of position in a lap: the same window over a corner of a square it has never
 *     seen looks like a corner, which is the whole distinction the retirement rests on.
 *
 * THE TEST THAT DECIDES IT IS TRANSFER, NOT FIT. A map fitted on the program the prefix was
 * converged on will reproduce it well by construction — the same trap as every phase-indexed table
 * here, which reads 125x at home and 0.55x on a signal it has never seen. So the number that
 * counts is the distilled policy deployed on a program whose prefix was NEVER CONVERGED.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_distil.mjs
 */
import { solveRidge } from '../lib/pilot/pilot.js';
import { commissionArm, deployOn, mkPath, makeArm, PG } from './pilot/rigs/arm-rig.mjs';
import { designDemoPaths, designTour } from '../lib/flexisim/demopath.js';

// A LIST, because one program's converged prefix is one distribution and a policy fitted on it
// is at home there by construction — the same trap the corner banks paid for, where a bank
// fitted on the square read 3.27x at home and polygons+stars were the first agnostic bank above
// baseline. Each program is converged separately and the rows are POOLED into one fit.
const TRAIN_SPEC = (process.env.D_TRAIN || 'rounded').split(',');
const NDEMO = +(process.env.D_NDEMO || 4);
const NTOUR = +(process.env.D_NTOUR || 12);
const TESTS = (process.env.D_TEST || 'rounded,circle,sharp').split(',');
const FEED = +(process.env.D_FEED || 0.004);
// FEEDRATES TO SCORE AT, which is target 2 and has never been measured on this component. The
// offsets are indexed in SAMPLES, so at a different feed the same offset is a different piece
// of geometry and the map is being asked for a kernel it was not fitted for. That is a
// PREDICTION with a sign; the point of the sweep is the SIZE rather than the direction.
const TFEEDS = (process.env.D_TFEEDS || '').split(',').filter(Boolean).map(Number);
const PASSES = +(process.env.D_PASSES || 4);
// LAP-AVERAGED RE-MEASUREMENT, and it exists to check an INSTRUMENT rather than to improve a
// score. The tracker-noise ladder read NON-MONOTONE — sigma 1e-3 delivering 1.54x and 3e-2
// delivering 2.13x — and more noise reading better is not physical, so rule 14 says look at the
// instrument before believing either end. The suspect is here: `or.e` is ONE lap of ONE free
// run, inverted directly, so instrument noise enters the oracle undiluted and compounds pass
// over pass instead of averaging out across the thousands of rows the regression sees. If that
// is the mechanism, averaging L laps should recover the loss as ~sqrt(L); if it is not, the
// ladder is telling us something about the method and not about the harness.
//
// At L = 1 this reads lap 2 of 3 exactly as before and every earlier number must reproduce.
const ORAVG = Math.max(1, +(process.env.D_ORAVG || 1));
const RIDGE = +(process.env.D_RIDGE || 1e-6);
// A LADDER, SELECTED LEAVE-ONE-PROGRAM-OUT. The ridge is not a fit knob here, it is the
// TRANSFER knob: `_gainfit.mjs` measured held-out R^2 running 0.811 / 0.924 / 0.580 / 0.204
// across 1e-8 / 1e-6 / 1e-4 / 1e-2 on the same rows, so a fixed value is a guess worth a factor
// on the number that matters. Selection holds out a whole TRAINING PROGRAM rather than random
// rows, because rows within one closed lap are not independent — the same trap that makes an
// in-sample fit on a program look perfect and invert badly.
const RIDGES = (process.env.D_RIDGES || '').split(',').filter(Boolean).map(Number);
const CAPX = +(process.env.D_CAPX || 5);     // policy clamp, in multiples of the pilot's own uMax
// A CAP LADDER AT THE EVALUATION STAGE, because the policy reads AT ITS CLAMP on every program
// (uPk 0.750 of 0.750) and a number taken at a bound is not the model's number. Sweeping here
// costs one deploy per cap and re-converges nothing, and section 48's rule — authority pays only
// once the model deserves it — is a measurement rather than a preference.
const CAPS = (process.env.D_CAPS || '').split(',').filter(Boolean).map(Number);
const DAGGER = +(process.env.D_DAGGER || 0); // refit rounds on the states the POLICY visits
const MODES = (process.env.D_MODES || 'cmd,meas,both').split(',');
// LOG-SPACED OFFSETS. The elbow's measured memory is 6363-8649 solver steps, so a linear window
// that reaches it costs a thousand taps; geometric spacing keeps resolution near t=0 where the
// fast dynamics are and still reaches ~4600 steps at this cadence. The command window is TWO
// SIDED because a correction on a compliant arm must load the flex BEFORE the corner.
const MLAGS = (process.env.D_MLAGS || '0,1,2,3,4,6,8,12,16,24,32,48,64,96,128,192,256,384,512')
  .split(',').map(Number);
const COFFS = (process.env.D_COFFS
  || '-256,-128,-64,-32,-16,-8,-4,-2,-1,0,1,2,4,8,16,24,32,48,64,96,128,192,256')
  .split(',').map(Number);
// Where the sign/magnitude block is evaluated. Fewer offsets than COFFS because a sign is a
// coarse feature and one per decade of look-ahead is what the physics asks for.
const SOFFS = (process.env.D_SOFFS || '-32,-8,-2,0,2,8,32,96,256').split(',').map(Number);
// EXPONENTIAL KERNEL TIME CONSTANTS, in samples. Deep reach WITHOUT phase resolution is the
// whole point: 41 independent taps reaching +/-1024 samples can locate themselves in an
// 817-sample lap and did (held out 0.47x, worse than doing nothing), while a one-pole average
// over 1024 samples is a single smooth number that cannot tell one phase from another. The
// plant's long memory is about what ALREADY HAPPENED, so these are causal only; the preview
// needs resolution rather than reach and keeps its direct taps.
const TAUS = (process.env.D_TAUS || '4,8,16,32,64,128,256,512,1024').split(',').map(Number);
// Offsets the quadratic block's base terms are read at, and how much harder that block is
// ridged than the linear one (columns scaled by 1/QSCALE, so the penalty is QSCALE^2).
const QOFFS = (process.env.D_QOFFS || '-16,-4,0,4,16,48').split(',').map(Number);
// ARC offsets, in workspace units. A lap of these programs is roughly 30, and the polygons'
// laps 25-45, so +/-6 is a fifth of a lap — comparable in fraction to the +/-768-sample window
// that measured best in time, which is what makes the two comparable at the training feed.
const AOFFS = (process.env.D_AOFFS
  || '-6,-4.5,-3,-2,-1.4,-1,-0.7,-0.5,-0.35,-0.25,-0.18,-0.12,-0.08,-0.05,-0.03,-0.02,-0.01,0,'
   + '0.01,0.02,0.03,0.05,0.08,0.12,0.18,0.25,0.35,0.5,0.7,1,1.4,2,3,4.5,6').split(',').map(Number);
const ASOFF = (process.env.D_ASOFF || '-1,-0.25,-0.05,0,0.05,0.25,1,2,4').split(',').map(Number);
const QSCALE = +(process.env.D_QSCALE || 10);

// THE PHYSICAL-BASIS LADDER (`phys`, `physlag`, `physpre`). `lib/pilot/classic.js` fits the
// motion basis [a, v, sign v, 1] on the machine and reads 425x on a servo axis and 1.07x on
// this arm, where the ladder commissioned it and threw it away. Its own `motionBasis` offers
// lag taps — and `delay()` shifts BACKWARDS only, while `live()` refuses a lagged basis
// outright. So the shipped physical rung is CAUSAL and effectively memoryless, and the
// distilled map is NON-CAUSAL. That is the one structural difference between them and it is
// the difference inversion-based feedforward says decides everything (a plant inverse is
// non-causal whenever the plant has delay or non-minimum-phase zeros).
//
// `physlag` uses the SAME taps as `physpre`, TRANSLATED so none lies in the future: identical
// count, identical span, identical spacing, only the position relative to now differs. That is
// the control that isolates PREVIEW and nothing else (rule 20).
const PHOFFS = (process.env.D_PHOFFS || '-256,-96,-32,-8,-2,0,2,8,32,96,256')
  .split(',').map(Number);
const PHLEAD = Math.max(...PHOFFS);
const PHCAUS = PHOFFS.map((o) => o - PHLEAD);
// THE FALSIFIER FOR §49'S OWN ACCOUNT. If the converged prefix is a MIXTURE of a transferable
// plant inverse and a lap-specific residue that iteration reaches LAST, then down-weighting the
// late increments should isolate the first component — and the pass-count optimum should
// DISAPPEAR rather than move. The machine still runs the TRUE accumulated prefix, because the
// next pass's residual depends on what was actually applied; only the distillation TARGET is
// weighted. `D_PWEIGHT` 1 is the control and must reproduce the unweighted run to the digit.
const PWEIGHT = +(process.env.D_PWEIGHT || 1);
// AVERAGE THE PER-PROGRAM MAPS INSTEAD OF POOLING THEIR ROWS — the one move the §49 account
// actively recommends, because it REDUCES effective capacity rather than adding it. Each
// program's map is fitted alone and absorbs that program's lap-specific structure; averaging k
// weight vectors CANCELS what differs between them and keeps what they share, which is exactly
// the split the account claims exists. Pooling rows lets ONE map fit every program's lap
// structure at once; averaging maps cannot.
//
// Free at deploy: k vectors of length n average to ONE vector of length n, so the deployed
// arithmetic and memory are a single map's. `lib/pilot/ensemble.js` measured this on the tank —
// all eight draws refused at 1.000x and their average delivered 1.344x, better than every draw
// rather than between them.
const ENSEMBLE = process.env.D_ENSEMBLE === '1';
// A RIDGE LADDER SCORED ON THE MACHINE, which is the account's own prescription and the one
// capacity knob never swept on DELIVERY here. `_gainfit.mjs` swept it on the FIT and the
// leave-one-program-out selector swept it on held-out fit — and this section's whole finding is
// that both of those pick the wrong cell. The ridge is the cheapest capacity control there is:
// one refit and one deploy per rung, nothing re-converged.
const RSWEEP = (process.env.D_RSWEEP || '').split(',').filter(Boolean).map(Number);
// THE CEILING FOR A SECOND LAYER, MEASURED BEFORE ANY SECOND LAYER IS BUILT (§47's lesson,
// which this session already paid for once). `stack.js`'s pattern — commission a pilot ON TOP
// of the frozen policy — needs `commissionArm` to run with a policy deployed, and a policy with
// a two-sided command window cannot read look-ahead off a live excitation, so it is real rig
// surgery. But the oracle ladder bounds it: iterate with a PERFECT forecast on the machine the
// policy has already corrected, and whatever that reaches is more than any fitted layer can.
// If it gains little, the composition is closed without the surgery.
const TOPUP = +(process.env.D_TOPUP || 0);
// A SECOND DISTILLED LAYER, WHICH NEEDS NO RIG SURGERY AFTER ALL. I recorded the composition as
// blocked because `commissionArm` cannot run with a policy deployed (a two-sided command window
// has no look-ahead on a live excitation). But the second layer does not have to be a
// COMMISSIONED PILOT: converge top-up prefixes on the TRAINING programs with layer 1 deployed —
// which `deployOn` already supports — and distil those the same way layer 1 was distilled.
// Everything needed is in this harness already.
//
// The ceiling says it is worth building: on the held-out sharp square the oracle ladder over the
// policy reads 5.52x -> 19.45x -> 23.52x -> 25.16x, and on the rounded rectangle 4.25x -> 18.37x
// -> 41.02x -> 55.35x, both PAST what iteration alone converges to from the bare machine
// (19.47x, 40.44x) and both at almost no extra authority (uPk 0.669 -> 0.727 on the rounded).
const LAYER2 = +(process.env.D_LAYER2 || 0);
// PER-FEED-BAND MAPS, SELECTED BY COMMANDED FEED — which is NOT the scheduled basis that failed.
// `sched` tensored one row with [1, rho, rho^2]: ONE map with three times the directions, and it
// spent them on each feed's lap structure (fit 0.908 -> 0.947, delivery 3.05x -> 0.56x at 2x
// feed, the worst row in §49). Discrete banks give no map a single extra direction — each is the
// winning 119-feature map fitted on its own band — and the selection is by COMMANDED feed, which
// is known ahead and unaffected by the correction (rule 35).
//
// The account's mechanism is capacity-as-DIRECTIONS, so it predicts the schedule fails and says
// nothing against this. That is what makes it worth running rather than another confirmation.
const BANDS = process.env.D_BANDS === '1';
let QBASE = null;

console.log(`\ndistilling the iteration prefix — K ${PG.K} / E ${PG.E}, feed ${FEED}`);
console.log(`  converged on ${TRAIN_SPEC.join(' + ')} over ${PASSES} passes, `
  + `policy clamp ${CAPX}x uMax\n`);

// `demo` EXPANDS TO THE BLOCK'S OWN DESIGNED SET — random polygons and stars across a feed
// ladder, no engineer input and no production geometry. It is here because the transfer wall
// looks like the oldest failure in this project rather than a new one: the converged prefix of
// a near-LTI plant is a fixed kernel applied to the reference, so a long-enough linear window
// recovers it and generalises to ANY program — UNLESS the references it was identified on span
// too small a subspace. Two or three closed production programs are exactly that, and this
// file's own record says so from the other side: "identifying on a program instead of a
// scribble is far worse, since repeated trapezoids are collinear". The demo set is the
// broadband excitation for the reference the scribble is for the plant, and its feed ladder
// puts rows at three speeds, which is the only thing here that has ever addressed target 2.
const TRAINS = [];
for (const t of TRAIN_SPEC) {
  if (t === 'demo') {
    designDemoPaths({ centre: PG.centre }).slice(0, NDEMO)
      .forEach((path, i) => TRAINS.push({ name: `demo${i}`, path }));
  } else if (t === 'poly') {
    // THE DEMO SET AT ONE FEED AND AT THE PROGRAMS' OWN SCALE. The `demo` diet measured 0.22x
    // to 1.09x — worse than doing nothing everywhere — and it differs from the test programs in
    // TWO ways at once: a feed ladder against sample-indexed offsets (the same offset is a
    // different piece of geometry at each feed) and radii of 2.2-3.8 against the test programs'
    // r 4 and 8x8. This diet removes both confounds so the failure can be attributed instead of
    // guessed, and it is the only diverse training source here that is comparable to the
    // named-program rows.
    designDemoPaths({ centre: PG.centre, feeds: [FEED, FEED, FEED], rMin: 3.4, rSpan: 2.4 })
      .slice(0, NDEMO).forEach((path, i) => TRAINS.push({ name: `poly${i}`, path }));
  } else if (t === 'polyfeed') {
    // THE SCALE-MATCHED POLYGONS ACROSS A FEED LADDER — the third instance of one lesson.
    // A window indexed in SAMPLES is the RIGHT object for a time-invariant plant, so the
    // feedrate failure is not the indexing: it is that at ONE training feed a time offset and
    // an arc offset are perfectly CONFOUNDED, and the map cannot tell which of them it learned.
    // At a different feed they separate and the map has picked wrong. That is exactly the
    // lap-phase confound in a second variable, and it has the same cure — vary the thing, so
    // no single reading of the offsets explains all the rows.
    //
    // The block's own `demo` diet already ladders the feed, and it measured 0.22x-1.09x because
    // it confounded feed with SCALE (r 2.2-3.8 against test programs at r 4 and 8x8). This diet
    // ladders the feed at the programs' own scale, which is the one combination not yet run.
    // ENOUGH PROGRAMS PER BAND FOR A BAND TO BE WELL-POSED. `designDemoPaths` emits one convex
    // and one star per entry of `feeds`, so a bare [F, 2F, 0.5F] gives TWO programs per band —
    // and the smoke run measured what that costs: with one program per band the maps read 0.18x
    // switched and 0.27x blended against a pooled 1.12x, which is the ensemble's null-space
    // failure arriving exactly where it was predicted. Repeating each feed gives NDEMO/3
    // programs per band instead.
    const reps = Math.max(1, Math.round(NDEMO / 6));
    const fl = [];
    for (let r = 0; r < reps; r++) fl.push(FEED, 2 * FEED, 0.5 * FEED);
    designDemoPaths({ centre: PG.centre, feeds: fl, rMin: 3.4, rSpan: 2.4 }).slice(0, NDEMO)
      .forEach((path, i) => TRAINS.push({ name: `pf${i}`, path }));
  } else if (t.startsWith('tour')) {
    // ONE LONG CLOSED LAP, which is the only shape of training program that lets a window REACH
    // this plant's memory without becoming a lap index. The reach/transfer trade measured above
    // is forced by lap < memory; a tour of `NTOUR` shapes is several times the memory, so a
    // +/-1024 sample window covers a fraction of it instead of more than all of it.
    let z = (81 + TRAINS.length) >>> 0;
    const rnd = () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296;
    const nS = +(t.slice(4) || NTOUR);
    TRAINS.push({ name: t, path: designTour(rnd, FEED, { centre: PG.centre, nShapes: nS }) });
  } else TRAINS.push({ name: t, path: mkPath(t, FEED) });
}
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const S = pilot.sample;
const CAP = CAPX * pilot.uMax;
console.log(`  sample ${S}, N ${pilot.N}, uMax ${pilot.uMax}, cap ${CAP.toFixed(3)}`);

const r2 = (pred, act) => {
  const m = act.reduce((a, v) => a + v, 0) / act.length;
  let ss = 0, st = 0;
  for (let i = 0; i < act.length; i++) { ss += (act[i] - pred[i]) ** 2; st += (act[i] - m) ** 2; }
  return 1 - ss / Math.max(1e-30, st);
};

// ---- 1-2. CONVERGE A PREFIX PER TRAINING PROGRAM, AND RECORD THE STATE IT PRODUCES ----
// The converged controller is the PREFIX ALONE with the pilot off — that is what §48's last row
// scores and it is the object being distilled. Running the pilot on top here would distil a
// state distribution the deployed policy never visits.
const PRE = {}, DTR = {}, TGT = {};
console.log(`\n  program   pass    totalRms     x tot   contourRms    x con   prefix pk`);
for (const { name: TRAIN, path } of TRAINS) {
  const LAPK = Math.round(path.lap), LAPS = Math.round(path.lap / S);
  const pre = [new Float64Array(LAPK), new Float64Array(LAPK)];
  // The weighted target accumulates the SAME increments with a decaying weight; `pre` is what
  // the machine runs and `tgt` is what the map is asked to reproduce.
  const tgt = [new Float64Array(LAPK), new Float64Array(LAPK)];
  let open = null, openC = null;
  for (let pass = 0; pass < PASSES; pass++) {
    const ftr = [];
    const fr = await deployOn(pilot, path, false, FEED,
      { pre, trace: ftr, ...(ORAVG > 1 ? { laps: 2 + ORAVG } : {}) });
    if (pass === 0) { open = fr.r.totalRms; openC = fr.r.contourRms; }
    let or;
    if (ORAVG > 1) {
      // Average laps 2 .. 2+L-1 at matching PHASE, so the averaged record is one lap long and
      // is read from offset 0. Laps 0 and 1 stay excluded exactly as they are at L = 1.
      const avg = [];
      for (let k = 0; k < LAPS; k++) {
        let a0 = 0, a1 = 0, n = 0;
        for (let L = 0; L < ORAVG; L++) {
          const t = ftr[(2 + L) * LAPS + k];
          if (!t) continue;
          a0 += t.e[0]; a1 += t.e[1]; n++;
        }
        avg.push(n ? [a0 / n, a1 / n] : [0, 0]);
      }
      or = { e: avg, lap: LAPS, off: 0 };
    } else {
      or = { e: ftr.map((t) => t.e), lap: LAPS, off: 2 * LAPS };
    }
    const uOut = [new Float64Array(LAPK), new Float64Array(LAPK)];
    const r = await deployOn(pilot, path, true, FEED, { pre, oracle: or, preOut: uOut });
    let pk = 0;
    const w = Math.pow(PWEIGHT, pass);
    for (let c = 0; c < 2; c++) for (let i = 0; i < LAPK; i++) {
      pre[c][i] += uOut[c][i];
      tgt[c][i] += w * uOut[c][i];
      pk = Math.max(pk, Math.abs(pre[c][i]));
    }
    console.log(`  ${TRAIN.padEnd(9)} ${String(pass).padStart(4)}   `
      + `${r.r.totalRms.toExponential(4)} ${(open / r.r.totalRms).toFixed(2).padStart(6)}x   `
      + `${r.r.contourRms.toExponential(4)} ${(openC / r.r.contourRms).toFixed(2).padStart(6)}x`
      + `     ${pk.toFixed(4)}`);
  }
  const dtr = [];
  const conv = await deployOn(pilot, path, false, FEED, { pre, trace: dtr });
  console.log(`  ${TRAIN.padEnd(9)} converged prefix alone (A MEMORY): `
    + `${conv.r.totalRms.toExponential(4)}  ${(open / conv.r.totalRms).toFixed(2)}x tot  `
    + `${(openC / conv.r.contourRms).toFixed(2)}x con`);
  PRE[TRAIN] = { pre, LAPK, LAPS, path };
  DTR[TRAIN] = dtr;
  TGT[TRAIN] = { tgt, LAPK };
}

// ---- 3. THE ROW BUILDERS ----
const NX = DTR[TRAINS[0].name][0].m.length;
const ZROW = new Float64Array(NX);
// THE SCHEDULED BASIS: the `rich` row tensored with [1, rho, rho^2] where rho is the commanded
// path speed relative to the diet's own reference feed. One linear map cannot represent three
// feeds and the feed-ladder run measured exactly that — every feed safe, the commissioning feed
// down 2.3x, fit R^2 falling from 0.974/0.921 to 0.911/0.908 because it is AVERAGING them.
// Scheduling is the licence to use different weights per feed instead of one compromise set,
// which is the same repair the corner router needed for its two regimes.
const mkRow = (mode) => (hist, i, refAt, kSamp) => {
  if (mode === 'arc') {
    // THE WINDOW IN ARC LENGTH RATHER THAN SAMPLES. A time window is the physically right
    // object for a time-invariant plant, and this is deliberately the wrong one: it asks
    // whether GEOMETRIC invariance is worth more than physical correctness when the feed
    // changes. At one feed the two are the same map re-parameterised; across feeds they are
    // different objects, and target 2 is the only place they can be told apart.
    const r = [];
    const s0 = refAt.sAt ? refAt.sAt(kSamp) : 0;
    const q0 = refAt.arcAt ? refAt.arcAt(s0) : refAt(kSamp);
    r.push(q0[0], q0[1]);
    for (const a of AOFFS) {
      const q = refAt.arcAt(s0 + a);
      r.push(q[0] - q0[0], q[1] - q0[1]);
    }
    // The same direction block, built from arc derivatives so it stays a geometric quantity.
    for (const a of ASOFF) {
      const p1 = refAt.arcAt(s0 + a - 0.02), p3 = refAt.arcAt(s0 + a + 0.02);
      for (let c = 0; c < 2; c++) {
        const d = (p3[c] - p1[c]) * 25;
        r.push(Math.sign(d), Math.abs(d));
      }
    }
    r.push(1);
    return r;
  }
  if (mode === 'sched') {
    const base = mkRow('rich')(hist, i, refAt, kSamp);
    const v = refAt.speed ? refAt.speed(kSamp) : FEED;
    const rho = v / FEED - 1;
    const out = [];
    for (let j = 0; j < base.length; j++) out.push(base[j], base[j] * rho, base[j] * rho * rho);
    return out;
  }
  if (mode === 'phys' || mode === 'physlag' || mode === 'physpre') {
    // `classic.js`'s basis, evaluated on the COMMANDED reference stream rather than by lap
    // index — which is what makes a lagged version of it legal under the retirement at all.
    const offs = mode === 'phys' ? [0] : (mode === 'physlag' ? PHCAUS : PHOFFS);
    const r2 = [];
    for (const o of offs) {
      const k = kSamp + o;
      const a1 = refAt(Math.max(0, k - 1)), b1 = refAt(Math.max(0, k)), c1 = refAt(Math.max(0, k + 1));
      for (let c = 0; c < 2; c++) {
        const v = (c1[c] - a1[c]) * 0.5;
        r2.push(c1[c] - 2 * b1[c] + a1[c]);   // acceleration
        r2.push(v);                            // velocity
        r2.push(Math.sign(v));                 // Coulomb / direction of travel
      }
    }
    r2.push(1);
    return r2;
  }
  const r = [];
  if (mode === 'meas' || mode === 'both' || mode === 'relmeas') {
    for (const L of MLAGS) {
      // AT THE FIRST DECISION THE HISTORY IS EMPTY, and `hist[0]` is undefined too — the
      // deployed policy is called at sample 0 before any measurement exists. Reading a
      // zero row there is the honest answer ("not measured"), and the alternative is the
      // TypeError this line threw on the first `meas` run.
      const src = hist[Math.max(0, i - L)] || hist[0] || ZROW;
      for (let c = 0; c < NX; c++) r.push(src[c]);
    }
  }
  if (mode !== 'meas') {
    // ABSOLUTE REFERENCE ANGLES ARE NEARLY A LAP INDEX ON A CLOSED PATH, which is the leak the
    // first run measured: 21.78x at home and 0.29x on a program never converged. `rel` keeps the
    // CURRENT pose — compliance and gravity load are genuinely pose-dependent, so that pair has
    // to be there — and replaces every other offset with its DIFFERENCE from it. A difference is
    // translation-invariant: a corner looks like a corner wherever in the workspace it sits, and
    // the same window cannot say which corner of which lap it is over.
    const q0 = refAt(Math.max(0, kSamp));
    const rel = mode === 'rel' || mode === 'relmeas' || mode === 'rich'
      || mode === 'diff' || mode === 'expo' || mode === 'quad';
    // `rel` IS A NULL BY CONSTRUCTION AND MEASURING IT SAID SO. {q(k)} together with
    // {q(k+o) - q(k)} spans exactly the space {q(k+o)} spans, so a linear model cannot tell the
    // two parameterisations apart — `rel` reproduced `cmd` to three digits and the same fit R²,
    // which is what a reparameterisation must do. To actually remove the workspace position from
    // the model it has to be DROPPED, and `diff` is that: differences only, so the policy
    // literally cannot know where in the workspace — and therefore where in a closed lap — it is.
    if (rel && mode !== 'diff') r.push(q0[0], q0[1]);
    for (const o of COFFS) {
      const q = refAt(Math.max(0, kSamp + o));
      if (rel) { if (o !== 0) r.push(q[0] - q0[0], q[1] - q0[1]); }
      else r.push(q[0], q[1]);
    }
    if (mode === 'expo') {
      const E = expoOf(refAt.path);
      const i2 = Math.min(E.n - 1, Math.max(0, kSamp));
      for (let t = 0; t < TAUS.length; t++) {
        r.push(E[t][0][i2] - q0[0], E[t][1][i2] - q0[1]);
      }
    }
    if (mode === 'quad') {
      // A QUADRATIC BLOCK UNDER A STRUCTURED PRIOR, aimed at the model bound the cap ladder
      // just established. The base terms are LOCAL COMMAND DERIVATIVES — first and second
      // differences of the reference at a few offsets — because those are what the plant's
      // inverse acts on, and their products are what a compliance that varies with pose and a
      // friction that varies with speed would need. Squares and cross-products of `nq` bases.
      //
      // THE COLUMNS ARE SCALED DOWN RATHER THAN GIVEN THEIR OWN RIDGE, which is the same
      // penalty by another route (`solveRidge` takes one lambda) and matches what the pilot's
      // own quadratic block does: ridged harder so it must EARN its weights. QSCALE 10 is a
      // 100x heavier prior on this block than on the linear one.
      // THE BASE TERMS ARE NORMALISED BEFORE THEY ARE MULTIPLIED, and the first version of this
      // block was not — which is rule 32 in its plainest form. A reference ANGLE is ~6.9e-1 and
      // a velocity times a velocity is ~4.5e-6, so the raw products sat 6.5e-6 of the linear
      // columns' scale BEFORE the extra 1/QSCALE, and no ridge in the ladder could have let them
      // earn a weight. The run said so cleanly: 419 features returned the 83-feature numbers to
      // four figures on all three programs AND the identical fit R^2, which is a block that is
      // numerically absent rather than one that was measured and declined.
      //
      // `QBASE` is an rms per base term measured ONCE on the first training path and then held
      // fixed for the fit and the deploy, so the prior is relative to the quantity it acts on
      // and the two halves cannot drift apart.
      const base = [];
      for (const o of QOFFS) {
        const a = refAt(Math.max(0, kSamp + o - 1)), b0 = refAt(Math.max(0, kSamp + o)),
          c2 = refAt(Math.max(0, kSamp + o + 1));
        for (let c = 0; c < 2; c++) {
          base.push((c2[c] - a[c]) * 0.5);                 // velocity
          base.push(c2[c] - 2 * b0[c] + a[c]);             // acceleration
        }
      }
      for (let i = 0; i < base.length; i++) {
        const si = QBASE ? QBASE[i] : 1;
        for (let j = i; j < base.length; j++) {
          const sj = QBASE ? QBASE[j] : 1;
          r.push((base[i] / si) * (base[j] / sj) / QSCALE);
        }
      }
    }
    if (mode === 'rich' || mode === 'expo' || mode === 'quad') {
      // FRICTION IS SIGN-DEPENDENT AND A LINEAR MAP OF POSITIONS CANNOT EXPRESS IT. This plant
      // carries Stribeck friction and backlash, both of which switch on the DIRECTION of travel,
      // so the converged correction has a term proportional to sign(velocity) that no amount of
      // position window recovers — `classic.js` carries exactly this basis, [a, v, sign v, 1],
      // and found the position loop's own lag term from data to 2.4% with it.
      //
      // Every term here is built from the COMMANDED reference by differencing, so it is still a
      // function of the program's local shape and still immune to the correction's own effect.
      for (const o of SOFFS) {
        const a = refAt(Math.max(0, kSamp + o - 1)), b = refAt(Math.max(0, kSamp + o + 1));
        for (let c = 0; c < 2; c++) {
          const v = (b[c] - a[c]) * 0.5;
          r.push(Math.sign(v), Math.abs(v));
        }
      }
    }
  }
  r.push(1);
  return r;
};

// THE EXPONENTIAL STATE BANK, precomputed per path by running each one-pole filter forward over
// the record from its start — which is exactly what a deployed machine does, at ONE MAC per
// state per sample, since the reference is known. Keyed by the path object so the fit and the
// deploy read one table and cannot drift apart (rule 61).
const EXPO = new Map();
const expoOf = (path) => {
  let E = EXPO.get(path);
  if (E) return E;
  const lapS = Math.max(1, Math.round(path.lap / S));
  const n = 4 * lapS;                       // three scored laps plus a lead-in
  E = TAUS.map(() => [new Float64Array(n), new Float64Array(n)]);
  const q = [];
  for (let k = 0; k < n; k++) q.push(pilotIk(path.at(k * S).x, path.at(k * S).y));
  TAUS.forEach((tau, t) => {
    const a = Math.exp(-1 / tau);
    for (let c = 0; c < 2; c++) {
      let v = q[0][c];
      for (let k = 0; k < n; k++) { v = a * v + (1 - a) * q[k][c]; E[t][c][k] = v; }
    }
  });
  E.n = n;
  EXPO.set(path, E);
  return E;
};

// Offline replay of the reference the same way the run reads it, so the fit and the deploy see
// one definition of the command window (rule 61 — a second copy is the defect).
const mkRefAt = (shape) => {
  const p2 = typeof shape === 'string' ? mkPath(shape, FEED) : shape;
  const cache = new Map();
  const f = (i) => {
    let v = cache.get(i);
    if (!v) { const c = p2.at(i * S); v = pilotIk(c.x, c.y); cache.set(i, v); }
    return v;
  };
  // The reader CARRIES its path, so the exponential bank is keyed by the same object the reader
  // reads and a row built for one program can never be scored against another's states.
  f.path = p2;
  // THE COMMANDED PATH SPEED, which is what the scheduled basis schedules ON. It is a property
  // of the program and the feed, known ahead, and unaffected by the correction — so scheduling
  // on it cannot put the blend inside the loop (rule 35, and the corner router's own split
  // between a COMMANDED scheduling variable and ACTUAL row contents).
  f.speed = (i) => { const c = p2.at(Math.max(0, i) * S); return Math.hypot(c.vx || 0, c.vy || 0); };
  // ARC-LENGTH ACCESS, for the one repair target 2's failure has a name for. `at(k)` returns the
  // arc length `s` the command has reached, and `point(u)` takes arc length directly, so the
  // reference at a GEOMETRIC offset is available without any new geometry in this file.
  f.sAt = (i) => p2.at(Math.max(0, i) * S).s;
  f.len = p2.length;
  const acache = new Map();
  f.arcAt = (u) => {
    const w = ((u % p2.length) + p2.length) % p2.length;
    const key = Math.round(w * 2048);
    let v = acache.get(key);
    if (!v) { const pt = p2.point(w); v = pilotIk(pt[0], pt[1]); acache.set(key, v); }
    return v;
  };
  return f;
};
// The rig's own inverse kinematics, reached through a throwaway arm so the harness does not carry
// a second copy of the geometry (rule 61 — three copies of this rig's routing have each shipped
// a defect).
let pilotIk = null;
{
  const { arm } = await makeArm();
  pilotIk = (x, y) => arm.ik(x, y, true);
  // `ik` is closed form and holds no lattice state, so the lattices go back now.
  await arm.l1.destroy(); await arm.l2.destroy();
}

// THE BASELINES ARE MODE-INDEPENDENT, so they are measured ONCE and reused. Re-running them per
// mode would cost three times the wall clock to produce three copies of one number, and a bench
// too slow to run is a verification problem (rule 2).
const base = {};
for (const sh of TESTS) {
  const o = await deployOn(pilot, sh, false, FEED);
  const b = await deployOn(pilot, sh, true, FEED);
  // Each test feed gets its OWN open loop and its OWN pilot row, because a ratio against
  // another feed's denominator is two changes reported as one.
  for (const f2 of TFEEDS) {
    base[`${sh}@${f2}`] = { o: await deployOn(pilot, sh, false, f2),
      b: await deployOn(pilot, sh, true, f2), m: null, feed: f2 };
  }
  // THE MEMORY ROW IS ONLY MEANINGFUL WHERE THE PREFIX WAS CONVERGED. Replaying one program's
  // lap table onto another's lap is a table addressed by the wrong index, and this project has
  // twice measured what that is worth (0.55x, worse than doing nothing). It is printed for the
  // programs that HAVE one and left blank elsewhere rather than filled with a number that
  // measures the mis-indexing (rule 25).
  let m = null;
  if (PRE[sh]) m = await deployOn(pilot, sh, false, FEED, { pre: PRE[sh].pre });
  base[sh] = { o, b, m };
}
console.log(`\n  mode   feats   fit R² ch0/ch1    program   open loop     pilot alone       `
  + `distilled      distilled+pilot     memory       uPk`);
for (const mode of MODES) {
  const buildRow = mkRow(mode);
  // MEASURE THE BASE-TERM SCALES ONCE, on the first training path, before any row is built.
  if (mode === 'quad') {
    const rf0 = mkRefAt(TRAINS[0].path);
    const acc = [];
    for (let k = 2; k < 600; k++) {
      let i = 0;
      for (const o of QOFFS) {
        const a = rf0(Math.max(0, k + o - 1)), b0 = rf0(Math.max(0, k + o)),
          c2 = rf0(Math.max(0, k + o + 1));
        for (let c = 0; c < 2; c++) {
          const v = (c2[c] - a[c]) * 0.5, ac = c2[c] - 2 * b0[c] + a[c];
          acc[i] = (acc[i] || 0) + v * v; i++;
          acc[i] = (acc[i] || 0) + ac * ac; i++;
        }
      }
    }
    QBASE = acc.map((v) => Math.sqrt(v / 598) || 1);
    console.log(`  quadratic base rms: ${QBASE.slice(0, 4).map((v) => v.toExponential(2)).join(' ')}`
      + ` … (${QBASE.length} terms, prior ${QSCALE}x on top of the normalisation)`);
  }
  const MAXL = (mode === 'cmd' || mode === 'rel' || mode === 'rich' || mode === 'diff'
    || mode === 'expo' || mode === 'quad' || mode === 'sched' || mode === 'arc')
    ? 0 : MLAGS[MLAGS.length - 1];
  // HOISTED, because the per-band and ridge-ladder blocks below run AFTER the DAGGER round loop
  // and need the rows the last round built. `spans` was left inside the loop when the band block
  // was added and threw on first use — the same scope fault as `TFEEDS`, and the third this
  // session, which is why every one of these is now declared beside the thing that reads it.
  let W = null, fitR2 = [NaN, NaN], nF = 0, lastX = null, lastY = null, lastSpans = null;
  // DAGGER: refit on the states the POLICY itself visits. A behaviour-cloned policy is fitted
  // on one distribution and then generates its own, and the gap between them is the whole
  // reason cloning diverges; each round records the policy's own states and re-labels them
  // with the converged prefix at the same lap phase.
  const sets = TRAINS.map(({ name: T, path }) => ({ T, path, refAt: mkRefAt(path),
    hist: DTR[T].map((t) => t.m),
    // At PWEIGHT 1 `tgt` and `pre` are the same array of numbers, so this branch is the
    // control: it must reproduce the unweighted run to the digit (rule 21).
    targ: DTR[T].map((t, i) => (t.pre
      ? [TGT[T].tgt[0][(i * S) % TGT[T].LAPK], TGT[T].tgt[1][(i * S) % TGT[T].LAPK]]
      : null)) }));
  for (let round = 0; round <= DAGGER; round++) {
    const X = [], Y = [[], []], spans = [];
    for (const st of sets) {
      const before = X.length;
      for (let i = MAXL + 1; i < st.targ.length; i++) {
        if (!st.targ[i]) continue;
        // THE MEASURED HISTORY IS READ AT i-1 AND THE COMMAND AT i, because that is what the
        // deployed policy has: `deployOn` calls it at a sample boundary BEFORE this step's
        // measurement exists, while the reference is known ahead by construction. Fitting on
        // row `i` and deploying on row `i-1` is a one-sample lookahead the machine does not
        // have — invisible in the command-only mode, which is how it nearly shipped.
        X.push(buildRow(st.hist, i - 1, st.refAt, i));
        Y[0].push(st.targ[i][0]); Y[1].push(st.targ[i][1]);
      }
      spans.push(X.length - before);
    }
    nF = X[0].length;
    if (ENSEMBLE && sets.length > 1) {
      // One fit per training program on its OWN rows, then the mean of the weight vectors.
      const acc = [new Float64Array(nF), new Float64Array(nF)];
      let at = 0;
      for (let g = 0; g < sets.length; g++) {
        const len = spans[g];
        const Xg = X.slice(at, at + len);
        for (let c = 0; c < 2; c++) {
          const Wg = solveRidge(Xg, Y[c].slice(at, at + len), RIDGE);
          for (let j = 0; j < nF; j++) acc[c][j] += Wg[j] / sets.length;
        }
        at += len;
      }
      W = acc;
      fitR2 = [0, 1].map((c) =>
        r2(X.map((r) => r.reduce((a, v, j) => a + v * W[c][j], 0)), Y[c]));
      if (round === DAGGER) console.log(`  ensemble: ${sets.length} per-program maps averaged `
        + `into one vector of ${nF} — deployed cost is a single map's`);
      lastX = X; lastY = Y; lastSpans = spans;
      break;
    }
    // PER CHANNEL, because the two channels are not the same problem here: held out, the
    // shoulder regresses at R^2 0.92 and the elbow at 0.08, and their measured memories differ
    // by a factor of two and a half. One ridge for both is rule 31 inside a single fit.
    let ridge = [RIDGE, RIDGE];
    if (RIDGES.length > 1 && sets.length > 1) {
      const best = [-Infinity, -Infinity];
      for (const cand of RIDGES) {
        const tot = [0, 0], n = [0, 0];
        for (let h = 0; h < sets.length; h++) {
          const Xi = [], Yi = [[], []], Xo = [], Yo = [[], []];
          let at = 0;
          for (let g = 0; g < sets.length; g++) {
            const len = spans[g];
            for (let j = 0; j < len; j++) {
              const dstX = g === h ? Xo : Xi, dstY = g === h ? Yo : Yi;
              dstX.push(X[at + j]); dstY[0].push(Y[0][at + j]); dstY[1].push(Y[1][at + j]);
            }
            at += len;
          }
          if (!Xo.length || !Xi.length) continue;
          for (let c = 0; c < 2; c++) {
            const Wi = solveRidge(Xi, Yi[c], cand);
            tot[c] += r2(Xo.map((r) => r.reduce((a, v, j) => a + v * Wi[j], 0)), Yo[c]);
            n[c]++;
          }
        }
        for (let c = 0; c < 2; c++) {
          const sc = n[c] ? tot[c] / n[c] : -Infinity;
          if (sc > best[c]) { best[c] = sc; ridge[c] = cand; }
        }
      }
      if (round === DAGGER) console.log(`  ridge selected leave-one-program-out: `
        + `${ridge.map((v) => v.toExponential(0)).join(' / ')} (held-out R² `
        + `${best.map((v) => (v > -9.99 ? v.toFixed(3) : v.toExponential(1))).join(' / ')} over `
        + `${sets.length} folds)`);
    }
    W = [solveRidge(X, Y[0], ridge[0]), solveRidge(X, Y[1], ridge[1])];
    lastX = X; lastY = Y; lastSpans = spans;
    fitR2 = [0, 1].map((c) => r2(X.map((r) => r.reduce((a, v, j) => a + v * W[c][j], 0)), Y[c]));
    if (round === DAGGER) break;
    for (const st of sets) {
      const tr2 = [];
      await deployOn(pilot, st.path, false, FEED,
        { policy: mkPolicy(W, buildRow, st.refAt), trace: tr2 });
      const { pre, LAPK } = PRE[st.T];
      st.hist = tr2.map((t) => t.m);
      st.targ = tr2.map((t, i) => [pre[0][(i * S) % LAPK], pre[1][(i * S) % LAPK]]);
    }
  }
  // The ridge rungs are fitted ONCE, outside the program loop, so a rung's map is the same map
  // on every program it is scored on.
  const rungs = RSWEEP.map((rg) => ({ rg,
    W: [solveRidge(lastX, lastY[0], rg), solveRidge(lastX, lastY[1], rg)] }));
  // ---- PER-FEED-BAND MAPS: one fit per distinct training feed, selected by commanded feed ----
  let BANK = null;
  if (BANDS) {
    const byFeed = new Map();
    let at = 0;
    for (let g = 0; g < sets.length; g++) {
      const f = sets[g].path.feed;
      if (!byFeed.has(f)) byFeed.set(f, { X: [], Y: [[], []] });
      const bk = byFeed.get(f);
      for (let j = 0; j < lastSpans[g]; j++) {
        bk.X.push(lastX[at + j]); bk.Y[0].push(lastY[0][at + j]); bk.Y[1].push(lastY[1][at + j]);
      }
      at += lastSpans[g];
    }
    BANK = [...byFeed.entries()].map(([f, bk]) => ({ feed: f, n: bk.X.length,
      W: [solveRidge(bk.X, bk.Y[0], RIDGE), solveRidge(bk.X, bk.Y[1], RIDGE)] }))
      .sort((a, b) => a.feed - b.feed);
    console.log(`  bands: ${BANK.map((k) => `${k.feed.toExponential(1)} (${k.n} rows)`).join(', ')}`
      + ` — each the same ${nF}-feature map, none with an extra direction`);
  }

  // ---- THE SECOND LAYER: top-up prefixes on the TRAINING programs, distilled the same way ----
  let W2 = null, fit2 = [NaN, NaN];
  if (LAYER2) {
    const X2 = [], Y2 = [[], []];
    for (const st of sets) {
      const pol1 = mkPolicy(W, buildRow, st.refAt);
      const lapK = Math.round(st.path.lap), lapS = Math.round(st.path.lap / S);
      const pre2 = [new Float64Array(lapK), new Float64Array(lapK)];
      for (let pass = 0; pass < LAYER2; pass++) {
        const ftr = [];
        await deployOn(pilot, st.path, false, FEED, { policy: pol1, pre: pre2, trace: ftr });
        const or = { e: ftr.map((t) => t.e), lap: lapS, off: 2 * lapS };
        const uOut = [new Float64Array(lapK), new Float64Array(lapK)];
        await deployOn(pilot, st.path, true, FEED,
          { policy: pol1, pre: pre2, oracle: or, preOut: uOut });
        for (let c = 0; c < 2; c++) for (let i = 0; i < lapK; i++) pre2[c][i] += uOut[c][i];
      }
      // Record the state the machine visits under layer 1 PLUS the converged top-up, and pair it
      // with what the top-up applied — the same shape layer 1's own fit used.
      const tr2 = [];
      await deployOn(pilot, st.path, false, FEED, { policy: pol1, pre: pre2, trace: tr2 });
      const hist2 = tr2.map((t) => t.m);
      for (let i = MAXL + 1; i < tr2.length; i++) {
        if (!tr2[i].pre) continue;
        X2.push(buildRow(hist2, i - 1, st.refAt, i));
        Y2[0].push(tr2[i].pre[0]); Y2[1].push(tr2[i].pre[1]);
      }
    }
    W2 = [solveRidge(X2, Y2[0], RIDGE), solveRidge(X2, Y2[1], RIDGE)];
    fit2 = [0, 1].map((c) =>
      r2(X2.map((r) => r.reduce((a, v, j) => a + v * W2[c][j], 0)), Y2[c]));
    console.log(`  layer 2: ${LAYER2} top-up passes per training program, `
      + `${X2.length} rows, fit R² ${fit2.map((v) => v.toFixed(3)).join(' / ')}`);
  }
  for (const sh of TESTS) {
    const { o, b, m } = base[sh];
    const rf = mkRefAt(sh);
    if (W2) {
      // BOTH LAYERS, each a linear map on the same row — so the deployed cost is two vectors
      // and the sum is clamped once, exactly as `stack.js` clamps a cascade's sum.
      const p1 = mkPolicy(W, buildRow, rf), p2 = mkPolicy(W2, buildRow, rf);
      const both = (hist, kSamp) => {
        const a = p1(hist, kSamp), c = p2(hist, kSamp);
        return [Math.max(-CAP, Math.min(CAP, a[0] + c[0])),
          Math.max(-CAP, Math.min(CAP, a[1] + c[1]))];
      };
      const d2 = await deployOn(pilot, sh, false, FEED, { policy: both });
      console.log(`    two layers  ${sh.padEnd(9)} ${d2.r.totalRms.toExponential(3)} `
        + `${(o.r.totalRms / d2.r.totalRms).toFixed(2).padStart(6)}x   uPk ${d2.uPk.toFixed(3)}`);
    }
    for (const rung of rungs) {
      const r = await deployOn(pilot, sh, false, FEED,
        { policy: mkPolicy(rung.W, buildRow, rf) });
      console.log(`    ridge ${rung.rg.toExponential(0).padStart(7)}  ${sh.padEnd(9)} `
        + `${r.r.totalRms.toExponential(3)} `
        + `${(o.r.totalRms / r.r.totalRms).toFixed(2).padStart(6)}x   uPk ${r.uPk.toFixed(3)}`);
    }
    const d = await deployOn(pilot, sh, false, FEED, { policy: mkPolicy(W, buildRow, rf) });
    const dp = await deployOn(pilot, sh, true, FEED, { policy: mkPolicy(W, buildRow, rf) });
    if (TOPUP) {
      // The oracle ladder ON TOP of the distilled policy. `pre` accumulates what iteration adds
      // ABOVE the policy, so pass 0's row is the policy alone and every later row is the ceiling
      // for a second layer that has run that many passes.
      const pol = mkPolicy(W, buildRow, rf);
      const p2 = mkPath(sh, FEED);
      const lapK = Math.round(p2.lap), lapS = Math.round(p2.lap / S);
      const pre2 = [new Float64Array(lapK), new Float64Array(lapK)];
      for (let pass = 0; pass <= TOPUP; pass++) {
        const ftr = [];
        const fr = await deployOn(pilot, sh, false, FEED,
          { policy: pol, pre: pre2, trace: ftr });
        console.log(`    top-up pass ${pass}  ${sh.padEnd(9)} `
          + `${fr.r.totalRms.toExponential(3)} `
          + `${(o.r.totalRms / fr.r.totalRms).toFixed(2).padStart(6)}x   uPk ${fr.uPk.toFixed(3)}`);
        if (pass === TOPUP) break;
        const or = { e: ftr.map((t) => t.e), lap: lapS, off: 2 * lapS };
        const uOut = [new Float64Array(lapK), new Float64Array(lapK)];
        await deployOn(pilot, sh, true, FEED,
          { policy: pol, pre: pre2, oracle: or, preOut: uOut });
        for (let c = 0; c < 2; c++) for (let i = 0; i < lapK; i++) pre2[c][i] += uOut[c][i];
      }
    }
    for (const f2 of TFEEDS) {
      const bb = base[`${sh}@${f2}`];
      const rf2 = mkRefAt(mkPath(sh, f2));
      const d2 = await deployOn(pilot, sh, false, f2, { policy: mkPolicy(W, buildRow, rf2) });
      let bandCol = '';
      if (BANK) {
        // NEAREST BAND IN LOG FEED, because the bands are a ratio ladder and the midpoint
        // between 4e-3 and 8e-3 is 5.66e-3, not 6e-3.
        const pick = BANK.reduce((best, k) =>
          (Math.abs(Math.log(k.feed / f2)) < Math.abs(Math.log(best.feed / f2)) ? k : best));
        const db = await deployOn(pilot, sh, false, f2,
          { policy: mkPolicy(pick.W, buildRow, rf2) });
        bandCol = `   switch ${(bb.o.r.totalRms / db.r.totalRms).toFixed(2).padStart(6)}x`;
        // BLENDED, WHICH IS FREE AT DEPLOY AND NOT THE SAME OBJECT AS THE SCHEDULE. The weight
        // depends only on the COMMANDED feed, so the maps blend BEFORE the row does —
        // sum_b w_b (W_b . row) = (sum_b w_b W_b) . row — and k maps collapse to one vector of
        // the same length. 238 MAC, not 700, and the blend recomputes only when the feed does.
        //
        // It is not the failed `sched` basis: there ONE map got three times the DIRECTIONS and
        // was fitted jointly across all feeds, so the extra directions could absorb each feed's
        // lap structure. Here each W_b is fitted on its own band with no extra directions and
        // the interpolation happens afterwards — the ensemble-versus-pooling distinction, in the
        // feed variable.
        //
        // SHAPED, because this project has already paid for the unshaped version: the corner
        // router's blend cost the circle 15-45% for a regime it is never in until a smoothstep
        // went in. And STATED AS A RISK: blending IS averaging maps, and averaging maps is what
        // produced negative R^2 in the per-program ensemble — a band fitted on too few programs
        // is arbitrary in its null space and interpolating two such maps averages junk.
        const lf = Math.log(f2);
        let lo = BANK[0], hi = BANK[BANK.length - 1];
        for (const k of BANK) {
          if (Math.log(k.feed) <= lf && Math.log(k.feed) >= Math.log(lo.feed)) lo = k;
        }
        for (let i = BANK.length - 1; i >= 0; i--) {
          if (Math.log(BANK[i].feed) >= lf && Math.log(BANK[i].feed) <= Math.log(hi.feed)) hi = BANK[i];
        }
        let t = lo === hi ? 0
          : (lf - Math.log(lo.feed)) / (Math.log(hi.feed) - Math.log(lo.feed));
        t = Math.min(1, Math.max(0, t));
        t = t * t * (3 - 2 * t);                       // smoothstep, per the router's lesson
        const Wb = [0, 1].map((c) => {
          const v = new Float64Array(lo.W[c].length);
          for (let j = 0; j < v.length; j++) v[j] = (1 - t) * lo.W[c][j] + t * hi.W[c][j];
          return v;
        });
        const dbl = await deployOn(pilot, sh, false, f2,
          { policy: mkPolicy(Wb, buildRow, rf2) });
        bandCol += `   blend(${lo.feed.toExponential(1)}->${hi.feed.toExponential(1)} t${t.toFixed(2)}) `
          + `${(bb.o.r.totalRms / dbl.r.totalRms).toFixed(2).padStart(6)}x`;
      }
      console.log(`    feed ${f2.toExponential(1)}  ${sh.padEnd(9)} `
        + `open ${bb.o.r.totalRms.toExponential(3)}  pilot `
        + `${(bb.o.r.totalRms / bb.b.r.totalRms).toFixed(2).padStart(6)}x   pooled `
        + `${(bb.o.r.totalRms / d2.r.totalRms).toFixed(2).padStart(6)}x${bandCol}`);
    }
    for (const cx of CAPS) {
      const r = await deployOn(pilot, sh, false, FEED,
        { policy: mkPolicy(W, buildRow, rf, cx * pilot.uMax) });
      console.log(`    cap ${String(cx).padStart(4)}x uMax = ${(cx * pilot.uMax).toFixed(3)}  `
        + `${sh.padEnd(9)} ${r.r.totalRms.toExponential(3)} `
        + `${(o.r.totalRms / r.r.totalRms).toFixed(2).padStart(6)}x   uPk ${r.uPk.toFixed(3)}`);
    }
    const x = (v) => (o.r.totalRms / v.r.totalRms).toFixed(2) + 'x';
    console.log(`  ${mode.padEnd(6)}${String(nF).padStart(5)}  `
      + `${fitR2.map((v) => v.toFixed(3)).join(' / ')}     ${sh.padEnd(9)} `
      + `${o.r.totalRms.toExponential(3)}   ${b.r.totalRms.toExponential(3)} ${x(b).padStart(7)}   `
      + `${d.r.totalRms.toExponential(3)} ${x(d).padStart(7)}   `
      + `${dp.r.totalRms.toExponential(3)} ${x(dp).padStart(7)}   `
      + `${m ? m.r.totalRms.toExponential(3) : '        -'} ${m ? x(m).padStart(7) : '      -'}`
      + `   ${d.uPk.toFixed(3)}`);
  }
}

// THE READER IS PASSED IN, NOT TAKEN FROM THE PORT. `deployOn` offers its own `refAt`, and using
// it would make the deployed row a second implementation of the fitted row — the exact defect
// rule 61 is about, and the one that would silently break the exponential bank, which is keyed
// by the reader's path. One reader, built by the harness, used by both.
function mkPolicy(W, buildRow, refAt, cap = CAP) {
  return (hist, kSamp) => {
    const i = hist.length - 1;
    const r = buildRow(hist, i < 0 ? 0 : i, refAt, kSamp);
    const out = [0, 0];
    for (let c = 0; c < 2; c++) {
      let v = 0;
      for (let j = 0; j < r.length; j++) v += W[c][j] * r[j];
      // CLAMPED AT A STATED MULTIPLE OF THE PILOT'S OWN CAP. The converged prefix runs past uMax
      // because it accumulates outside the QP's clamp; a policy reproducing it needs the same
      // authority, and giving it unbounded authority is how the first run of this bench diverged.
      out[c] = Math.max(-cap, Math.min(cap, Number.isFinite(v) ? v : 0));
    }
    return out;
  };
}
console.log(`\n  the distilled column is addressed by MEASURED STATE and the program's LOCAL`);
console.log(`  SHAPE and carries no lap index; the memory column is the same correction`);
console.log(`  addressed by position in a lap. Transfer to a program never converged is the test.\n`);
