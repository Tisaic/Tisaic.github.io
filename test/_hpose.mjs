// THE PILOT'S CEILING IS ITS MODEL OF THE CORRECTION, NOT ITS FORECAST OF THE ERROR — and
// this measures how much of that model is recoverable and by what.
//
// The arithmetic the oracle ladder implies. `test/_hcheck.mjs` measured the QP's plant model
// `h` explaining R^2 0.894 / 0.826 of what the correction actually DID on the machine. A
// one-shot inverse can only remove the part its model can see, so the residual it leaves is
// about sqrt(1 - R^2) of the correction's own magnitude — 33% and 42% here, i.e. a reduction
// of 3.0x and 2.4x. The oracle ladder delivered 2.57x and 3.65x. That is not a coincidence:
// the pilot's ceiling IS its `h`, and every knob the ladder found inert was inert because a
// better answer to the wrong question is still the wrong answer.
//
// MODE 10 DOES EXACTLY THIS AND SAID SO. `refineOperator` was built because six refinement
// schemes stalled, and the diagnosis was that "the small-signal H is one lap-invariant
// response and this plant's is POSE-DEPENDENT" — worth 44x -> 51.5x when fixed. `h` here is
// one LTI kernel for the whole workspace, which is the same defect one level down.
//
// SO MEASURE THE HEADROOM BEFORE BUILDING ANYTHING. Four models of the same signal, each
// fitted on one program and scored on ANOTHER, because a per-pose kernel fitted and read on
// one closed path is a memory and this project has shipped that mistake twice:
//
//   as used        the commissioned `h`, exactly as the QP inverts it — the control
//   refit          one LTI kernel, least-squares on the fitting program — the best a single
//                  kernel can do, which separates "h is mis-identified" from "h is the wrong
//                  SHAPE of model"
//   gain per pose  the same kernel with a scalar per pose bin — is the pose-dependence just
//                  a magnitude?
//   kernel per pose  a full kernel per bin, hat-interpolated between bins, which is what
//                  `refineOperator` does one level up
//
// The bins are on the arm's own SHOULDER ANGLE, a machine state, not on position along a lap
// (the retirement's distinction). A model addressed by phase would score here and transfer
// nowhere, which is the whole reason the holdout program is a different shape.
import { solveRidge } from '/home/user/Tisaic.github.io/lib/pilot/pilot.js';
import { commissionArm, deployOn, recordOpenLoop, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FIT = process.env.OR_FIT || 'sharp';
const TEST = process.env.OR_TEST || 'circle';
const FEED = +(process.env.OR_FEED || 0.004);
const NB = +(process.env.OR_BINS || 6);          // pose bins
const HL = +(process.env.OR_HL || 40);           // kernel length in samples

console.log(`arm K ${PG.K} / E ${PG.E}; fit on ${FIT}, score on ${TEST}, feed ${FEED}, `
  + `${NB} pose bins, kernel ${HL} samples`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
console.log(`sample ${pilot.sample}, grid ${pilot.grid}, N ${pilot.N}, uMax ${pilot.uMax}`);

// ONE RECORD PER PROGRAM: what the correction was, what error it left, and what the error
// would have been without it. The correction has to be a real one — a deployed pilot's —
// because a kernel identified from a probe and scored on a probe answers a question the
// machine never asks.
const recordFor = async (shape) => {
  const open = await recordOpenLoop(pilot, shape, FEED);
  const or = { e: open.e, lap: open.lap, off: open.lap };
  const trace = [];
  const r = await deployOn(pilot, shape, true, FEED, { oracle: or, trace });
  const lap = open.lap, from = Math.max(0, trace.length - 2 * lap);
  const rows = [];
  for (let k = from; k < trace.length; k++) {
    const j = lap + (k % lap);
    const ef = open.e[Math.min(j, open.e.length - 1)];
    // the pose bin is the SHOULDER's measured position, which the pilot has at deploy
    rows.push({ u: trace[k].u, m: [trace[k].e[0] - ef[0], trace[k].e[1] - ef[1]],
      pose: trace[k].e, k });
  }
  return { rows, trace, lap, totalRms: r.r.totalRms, uPk: r.uPk, open };
};

// the pose variable has to come from something the controller HAS at deploy. The rig's truth
// is a tool error; the shoulder command is what schedules compliance, and `deployOn` does not
// hand it back, so the pose axis here is the commanded shoulder read off the open-loop record
// through the same modulo indexing — one definition, shared by fit and score.
const poseOf = (recd, k) => {
  const j = recd.lap + (k % recd.lap);
  return j;   // index within the lap; binned below by the COMMANDED shoulder, resolved next
};
void poseOf;

const A = await recordFor(FIT);
const B = await recordFor(TEST);
console.log(`  ${FIT}: totalRms ${A.totalRms.toExponential(4)} uPk ${A.uPk.toFixed(4)}, `
  + `${A.rows.length} rows`);
console.log(`  ${TEST}: totalRms ${B.totalRms.toExponential(4)} uPk ${B.uPk.toFixed(4)}, `
  + `${B.rows.length} rows`);

// THE POSE AXIS: the commanded shoulder angle, from the path both records share. Recomputed
// from the arm's own inverse kinematics on the program, so it is a machine state and not a
// position along a lap.
const poseAxis = async (shape, rows) => {
  const { mkPath, makeArm, homeArm } = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
  const path = mkPath(shape, FEED);
  const m = await makeArm();
  homeArm(m.arm, m.servo, path);
  const S = pilot.sample;
  const out = rows.map((r) => {
    const c = path.at((r.k * S) % Math.round(path.lap));
    return m.arm.ik(c.x, c.y, true)[0];
  });
  await m.arm.l1.destroy(); await m.arm.l2.destroy();
  return out;
};
const pA = await poseAxis(FIT, A.rows);
const pB = await poseAxis(TEST, B.rows);
const lo = Math.min(...pA, ...pB), hi = Math.max(...pA, ...pB);
const binOf = (v) => Math.min(NB - 1, Math.max(0, Math.floor((v - lo) / (hi - lo + 1e-12) * NB)));
console.log(`  pose axis (commanded shoulder): ${lo.toFixed(4)} .. ${hi.toFixed(4)} rad`);

// ------------------------------------------------------------------ the four models
const r2Of = (rows, predict, c) => {
  let sMM = 0, sD = 0, sM = 0, n = 0;
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i].m[c], p = predict(i, c);
    sMM += m * m; sD += (m - p) * (m - p); sM += m; n++;
  }
  const varM = sMM / n - (sM / n) ** 2;
  return { r2: 1 - sD / sMM, r2c: 1 - (sD / n) / varM, rms: Math.sqrt(sD / n),
    rmsM: Math.sqrt(sMM / n) };
};
const convWith = (rows, h, i, c) => {
  let s = 0;
  const top = Math.min(h.length, i + 1);
  for (let t = 0; t < top; t++) s += h[t] * rows[i - t].u[c];
  return s;
};
// design matrix of lagged u for channel c
const designed = (rows, c, hl) => {
  const X = [], y = [];
  for (let i = hl; i < rows.length; i++) {
    const row = new Float64Array(hl);
    for (let t = 0; t < hl; t++) row[t] = rows[i - t].u[c];
    X.push(row); y.push(rows[i].m[c]);
  }
  return { X, y };
};
const RIDGE = 1e-6;

console.log('\n  model              ch    fit R2 (in)    score R2 (holdout)   rms left / rms did');
for (let c = 0; c < 2; c++) {
  const rep = (name, pf, pt) => {
    const a = r2Of(A.rows, pf, c), b = r2Of(B.rows, pt, c);
    console.log(`  ${name.padEnd(18)} ${c}   ${a.r2.toFixed(4).padStart(8)}       `
      + `${b.r2.toFixed(4).padStart(8)}          ${b.rms.toExponential(2)} / ${b.rmsM.toExponential(2)}`
      + `   -> ${(b.rmsM / Math.max(1e-12, b.rms)).toFixed(2)}x headroom`);
  };
  // 1. as used
  const h0 = pilot.hs[c].hSample;
  rep('as used', (i) => convWith(A.rows, h0, i, c), (i) => convWith(B.rows, h0, i, c));
  // 2. one refitted LTI kernel
  const { X, y } = designed(A.rows, c, HL);
  const hf = solveRidge(X, y, RIDGE, null);
  rep('refit LTI', (i) => (i >= HL ? convWith(A.rows, hf, i, c) : 0),
    (i) => (i >= HL ? convWith(B.rows, hf, i, c) : 0));
  // 3. scalar gain per pose bin on the refitted kernel
  const num = new Float64Array(NB), den = new Float64Array(NB);
  for (let i = HL; i < A.rows.length; i++) {
    const p = convWith(A.rows, hf, i, c), b = binOf(pA[i]);
    num[b] += p * A.rows[i].m[c]; den[b] += p * p;
  }
  const gn = Array.from({ length: NB }, (_, b) => (den[b] > 0 ? num[b] / den[b] : 1));
  rep('gain per pose', (i) => (i >= HL ? gn[binOf(pA[i])] * convWith(A.rows, hf, i, c) : 0),
    (i) => (i >= HL ? gn[binOf(pB[i])] * convWith(B.rows, hf, i, c) : 0));
  // 4. a kernel per pose bin
  const hb = [];
  for (let b = 0; b < NB; b++) {
    const Xb = [], yb = [];
    for (let i = HL; i < A.rows.length; i++) {
      if (binOf(pA[i]) !== b) continue;
      const row = new Float64Array(HL);
      for (let t = 0; t < HL; t++) row[t] = A.rows[i - t].u[c];
      Xb.push(row); yb.push(A.rows[i].m[c]);
    }
    hb.push(Xb.length > 3 * HL ? solveRidge(Xb, yb, RIDGE, null) : hf);
  }
  const cvb = (rows, pose, i) => (i >= HL ? convWith(rows, hb[binOf(pose[i])], i, c) : 0);
  rep('kernel per pose', (i) => cvb(A.rows, pA, i), (i) => cvb(B.rows, pB, i));
  console.log(`    gains per pose bin: ${gn.map((v) => v.toFixed(3)).join(' ')}`);
}
console.log('EXIT 0');
