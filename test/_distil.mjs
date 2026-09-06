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

const TRAIN = process.env.D_TRAIN || 'rounded';
const TESTS = (process.env.D_TEST || 'rounded,circle,sharp').split(',');
const FEED = +(process.env.D_FEED || 0.004);
const PASSES = +(process.env.D_PASSES || 4);
const RIDGE = +(process.env.D_RIDGE || 1e-6);
const CAPX = +(process.env.D_CAPX || 5);     // policy clamp, in multiples of the pilot's own uMax
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

console.log(`\ndistilling the iteration prefix — K ${PG.K} / E ${PG.E}, feed ${FEED}`);
console.log(`  converged on ${TRAIN} over ${PASSES} passes, policy clamp ${CAPX}x uMax\n`);

const pilot = await commissionArm({ seed: 1, train: { shape: TRAIN, feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const S = pilot.sample;
const path = mkPath(TRAIN, FEED);
const LAPK = Math.round(path.lap), LAPS = Math.round(path.lap / S);
const CAP = CAPX * pilot.uMax;
console.log(`  sample ${S}, N ${pilot.N}, uMax ${pilot.uMax}; lap ${LAPK} steps / ${LAPS} samples`);

const r2 = (pred, act) => {
  const m = act.reduce((a, v) => a + v, 0) / act.length;
  let ss = 0, st = 0;
  for (let i = 0; i < act.length; i++) { ss += (act[i] - pred[i]) ** 2; st += (act[i] - m) ** 2; }
  return 1 - ss / Math.max(1e-30, st);
};

// ---- 1. CONVERGE THE PREFIX BY ORACLE ITERATION (the diagnostic, not the product) ----
const pre = [new Float64Array(LAPK), new Float64Array(LAPK)];
let open = null, openC = null;
console.log(`\n  pass    totalRms     x tot   contourRms    x con   prefix pk`);
for (let pass = 0; pass < PASSES; pass++) {
  const ftr = [];
  const fr = await deployOn(pilot, TRAIN, false, FEED, { pre, trace: ftr });
  if (pass === 0) { open = fr.r.totalRms; openC = fr.r.contourRms; }
  const or = { e: ftr.map((t) => t.e), lap: LAPS, off: 2 * LAPS };
  const uOut = [new Float64Array(LAPK), new Float64Array(LAPK)];
  const r = await deployOn(pilot, TRAIN, true, FEED, { pre, oracle: or, preOut: uOut });
  let pk = 0;
  for (let c = 0; c < 2; c++) for (let i = 0; i < LAPK; i++) {
    pre[c][i] += uOut[c][i]; pk = Math.max(pk, Math.abs(pre[c][i]));
  }
  console.log(`  ${String(pass).padStart(4)}   ${r.r.totalRms.toExponential(4)} `
    + `${(open / r.r.totalRms).toFixed(2).padStart(6)}x   ${r.r.contourRms.toExponential(4)} `
    + `${(openC / r.r.contourRms).toFixed(2).padStart(6)}x     ${pk.toFixed(4)}`);
}

// ---- 2. THE CONVERGED CONTROLLER IS THE PREFIX ALONE, WITH THE PILOT OFF ----
// That is what §48's last row scores, and it is the object being distilled. Running the pilot on
// top here would distil a state distribution the deployed policy never visits.
const dtr = [];
const conv = await deployOn(pilot, TRAIN, false, FEED, { pre, trace: dtr });
console.log(`\n  converged prefix alone (A MEMORY): ${conv.r.totalRms.toExponential(4)}  `
  + `${(open / conv.r.totalRms).toFixed(2)}x tot  ${(openC / conv.r.contourRms).toFixed(2)}x con`);

// ---- 3. THE ROW BUILDERS ----
const NX = dtr[0].m.length;
const mkRow = (mode) => (hist, i, refAt, kSamp) => {
  const r = [];
  if (mode !== 'cmd') {
    for (const L of MLAGS) {
      const src = hist[Math.max(0, i - L)] || hist[0];
      for (let c = 0; c < NX; c++) r.push(src[c]);
    }
  }
  if (mode !== 'meas') {
    for (const o of COFFS) {
      const q = refAt(Math.max(0, kSamp + o));
      r.push(q[0], q[1]);
    }
  }
  r.push(1);
  return r;
};

// Offline replay of the reference the same way the run reads it, so the fit and the deploy see
// one definition of the command window (rule 61 — a second copy is the defect).
const mkRefAt = (shape) => {
  const p2 = typeof shape === 'string' ? mkPath(shape, FEED) : shape;
  const cache = new Map();
  return (i) => {
    let v = cache.get(i);
    if (!v) { const c = p2.at(i * S); v = pilotIk(c.x, c.y); cache.set(i, v); }
    return v;
  };
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
  const lapK = Math.round(mkPath(sh, FEED).lap);
  const pk2 = [new Float64Array(lapK), new Float64Array(lapK)];
  for (let c = 0; c < 2; c++) for (let i = 0; i < lapK; i++) pk2[c][i] = pre[c][i % LAPK];
  const m = await deployOn(pilot, sh, false, FEED, { pre: pk2 });
  base[sh] = { o, b, m };
}
console.log(`\n  mode   feats   fit R² ch0/ch1    program   open loop     pilot alone       `
  + `distilled        memory       uPk`);
for (const mode of MODES) {
  const buildRow = mkRow(mode);
  const refTr = mkRefAt(TRAIN);
  const mAll = dtr.map((t) => t.m);
  const MAXL = mode === 'cmd' ? 0 : MLAGS[MLAGS.length - 1];
  let W = null, fitR2 = [NaN, NaN], nF = 0;
  // DAGGER: refit on the states the POLICY itself visits. A behaviour-cloned policy is fitted on
  // one distribution and then generates its own, and the gap between them is the whole reason
  // cloning diverges; each round records the policy's own states and re-labels them with the
  // converged prefix at the same lap phase.
  let hist = mAll, targ = dtr.map((t) => t.pre);
  for (let round = 0; round <= DAGGER; round++) {
    const X = [], Y = [[], []];
    for (let i = MAXL; i < targ.length; i++) {
      if (!targ[i]) continue;
      X.push(buildRow(hist, i, refTr, i));
      Y[0].push(targ[i][0]); Y[1].push(targ[i][1]);
    }
    nF = X[0].length;
    W = [solveRidge(X, Y[0], RIDGE), solveRidge(X, Y[1], RIDGE)];
    fitR2 = [0, 1].map((c) => r2(X.map((r) => r.reduce((a, v, j) => a + v * W[c][j], 0)), Y[c]));
    if (round === DAGGER) break;
    const tr2 = [];
    await deployOn(pilot, TRAIN, false, FEED, { policy: mkPolicy(W, buildRow), trace: tr2 });
    hist = tr2.map((t) => t.m);
    targ = tr2.map((t, i) => [pre[0][(i * S) % LAPK], pre[1][(i * S) % LAPK]]);
  }
  for (const sh of TESTS) {
    const { o, b, m } = base[sh];
    const d = await deployOn(pilot, sh, false, FEED, { policy: mkPolicy(W, buildRow) });
    const x = (v) => (o.r.totalRms / v.r.totalRms).toFixed(2) + 'x';
    console.log(`  ${mode.padEnd(6)}${String(nF).padStart(5)}  `
      + `${fitR2.map((v) => v.toFixed(3)).join(' / ')}     ${sh.padEnd(9)} `
      + `${o.r.totalRms.toExponential(3)}   ${b.r.totalRms.toExponential(3)} ${x(b).padStart(7)}   `
      + `${d.r.totalRms.toExponential(3)} ${x(d).padStart(7)}   `
      + `${m.r.totalRms.toExponential(3)} ${x(m).padStart(7)}   ${d.uPk.toFixed(3)}`);
  }
}

function mkPolicy(W, buildRow) {
  return (hist, kSamp, refAt) => {
    const i = hist.length - 1;
    const r = buildRow(hist, i < 0 ? 0 : i, refAt, kSamp);
    const out = [0, 0];
    for (let c = 0; c < 2; c++) {
      let v = 0;
      for (let j = 0; j < r.length; j++) v += W[c][j] * r[j];
      // CLAMPED AT A STATED MULTIPLE OF THE PILOT'S OWN CAP. The converged prefix runs past uMax
      // because it accumulates outside the QP's clamp; a policy reproducing it needs the same
      // authority, and giving it unbounded authority is how the first run of this bench diverged.
      out[c] = Math.max(-CAP, Math.min(CAP, Number.isFinite(v) ? v : 0));
    }
    return out;
  };
}
console.log(`\n  the distilled column is addressed by MEASURED STATE and the program's LOCAL`);
console.log(`  SHAPE and carries no lap index; the memory column is the same correction`);
console.log(`  addressed by position in a lap. Transfer to a program never converged is the test.\n`);
