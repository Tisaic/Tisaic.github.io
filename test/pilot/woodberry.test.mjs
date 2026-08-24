/**
 * @file A PUBLISHED BENCHMARK, A PUBLISHED BASELINE, AND A NUMBER THAT CAN BE COMPARED.
 *
 * The three plants before this one were ours, so "6x better" was measured against a
 * baseline we also wrote. This one is not: the WOOD–BERRY BINARY DISTILLATION COLUMN
 * (Wood & Berry, 1973) is the standard 2x2 benchmark of the multivariable process-control
 * literature, its model is quoted identically across decades of papers, and the
 * decentralized PI that everyone compares against — Luyben's BLT (Biggest Log Modulus)
 * tuning — has published gains. So the question "where do we stand" has an answer that
 * does not depend on anything in this repository.
 *
 *   G(s) = | 12.8 e^-s /(16.7s+1)   -18.9 e^-3s/(21s+1)   |
 *          |  6.6 e^-7s/(10.9s+1)   -19.4 e^-3s/(14.4s+1) |
 *
 * Inputs are reflux and steam flow, outputs are the top and bottom compositions, time is
 * in MINUTES. It is hard for the reasons the literature says it is hard: four different
 * dead times including SEVEN MINUTES on a cross path, four different lags, and strong
 * two-way interaction (the published relative gain is about 2), so every move on one
 * loop lands on the other one late and out of proportion.
 *
 * THE BASELINE IS THE PUBLISHED ONE, NOT ONE WE INVENTED:
 *   K(s) = diag( 0.375 + 0.0452/s ,  -0.075 - 0.00318/s )     [Luyben BLT]
 * quoted in the literature as diag(0.38 + 0.045/s, -0.075 - 0.0032/s).
 *
 * AND THE EXTERNAL BAR: on this plant, a published extended-predictive tuning reports
 * IAE 28.9 against BLT's 55.34 — so a strong advanced method is worth about 1.9x over
 * BLT. Absolute IAE depends on the scenario each paper chose, and this file states its
 * own scenario exactly rather than borrowing one; the RATIO AGAINST BLT is the quantity
 * that carries across, and 1.9x is the number to be judged against.
 *
 * ONE ASYMMETRY, STATED RATHER THAN QUIETLY ENJOYED: the pilot is given the program's
 * look-ahead and the BLT loop is not, because a decentralized PI has no mechanism for
 * one. That is a real capability difference (a DCS does know its own recipe) and it is
 * also a real advantage, so the comparison below is "feedback-only PI" against
 * "feedforward-plus-feedback with preview", which is what an MPC paper is comparing too.
 */
import { Pilot } from '../../lib/pilot/pilot.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: the Wood–Berry column — a published benchmark against a published baseline');

// ------------------------------------------------------------------- the plant
const DT = 0.1;                                   // minutes per step
const K = [[12.8, -18.9], [6.6, -19.4]];          // steady gains
const TAU = [[16.7, 21.0], [10.9, 14.4]];         // minutes
const TH = [[1, 3], [7, 3]];                      // dead times, minutes
const DLY = TH.map((r) => r.map((t) => Math.round(t / DT)));
const MAXD = Math.max(...DLY.flat());

function makeColumn() {
  const x = [[0, 0], [0, 0]];                     // one first-order state per path
  const hist = [];                                // input history for the dead times
  for (let i = 0; i <= MAXD + 2; i++) hist.push([0, 0]);
  return {
    y: [0, 0],
    step(u) {
      hist.push([u[0], u[1]]);
      if (hist.length > MAXD + 2) hist.shift();
      for (let i = 0; i < 2; i++) {
        let acc = 0;
        for (let j = 0; j < 2; j++) {
          const src = hist[hist.length - 1 - DLY[i][j]] || hist[0];
          x[i][j] += DT * (-x[i][j] + K[i][j] * src[j]) / TAU[i][j];
          acc += x[i][j];
        }
        this.y[i] = acc;
      }
    },
  };
}
/** Steady inputs holding a pair of compositions — G(0) inverted. */
const DET = K[0][0] * K[1][1] - K[0][1] * K[1][0];
function inputsFor(y1, y2) {
  return [(K[1][1] * y1 - K[0][1] * y2) / DET, (-K[1][0] * y1 + K[0][0] * y2) / DET];
}
/** Steady compositions for a held pair of inputs — the forward model, for the truth. */
const outputsFor = (u) => [K[0][0] * u[0] + K[0][1] * u[1], K[1][0] * u[0] + K[1][1] * u[1]];

// ---------------------------------------------------------------- the scenario
// STATED EXACTLY, because every paper picks its own and the absolute IAE follows it: a
// unit step on the top composition at t = 0, a unit step on the bottom composition at
// t = 100 min, run to 300 min, IAE summed over both loops in composition-minutes.
const T_END = 3000, T_STEP2 = 1000;
const setpointAt = (k) => [1, k >= T_STEP2 ? 1 : 0];
// THE INPUT BOX IS SIZED FROM THE PLANT'S OWN GAINS. A unit setpoint step needs inputs
// of about 0.15, and gains near 19 mean a box of +-1.2 swings the composition by 38 —
// which tripped the over-range guard three times and refused the plant, correctly.
const UBOX = { lo: -0.5, hi: 0.5 };
const UMAX = Number(process.env.UM || 0.4);

function iaeOf(run) { return run.iae; }

/** The published baseline: two independent PI loops, BLT-tuned, clamped to the same box. */
function runBLT() {
  const c = makeColumn();
  const KC = [0.375, -0.075], TI = [8.29, 23.6];
  const I = [0, 0];
  let iae = 0;
  for (let k = 0; k < T_END; k++) {
    const sp = setpointAt(k);
    const u = [0, 0];
    for (let i = 0; i < 2; i++) {
      const e = sp[i] - c.y[i];
      I[i] += e * DT;
      let v = KC[i] * (e + I[i] / TI[i]);
      // ANTI-WINDUP BY CLAMPING THE INTEGRAL, the standard implementation — without it
      // the baseline would be crippled by its own saturation and would not be the
      // baseline the literature reports.
      if (v > UBOX.hi) { I[i] -= (v - UBOX.hi) * TI[i] / KC[i]; v = UBOX.hi; }
      if (v < UBOX.lo) { I[i] -= (v - UBOX.lo) * TI[i] / KC[i]; v = UBOX.lo; }
      u[i] = v;
    }
    c.step(u);
    iae += (Math.abs(sp[0] - c.y[0]) + Math.abs(sp[1] - c.y[1])) * DT;
  }
  return { iae };
}

/** Steady-state inversion only: right in the end, wrong the whole way there. */
function runOpen() {
  const c = makeColumn();
  let iae = 0;
  for (let k = 0; k < T_END; k++) {
    const sp = setpointAt(k);
    c.step(inputsFor(sp[0], sp[1]));
    iae += (Math.abs(sp[0] - c.y[0]) + Math.abs(sp[1] - c.y[1])) * DT;
  }
  return { iae };
}

// ------------------------------------------------------------ route, limit, run
async function commission(seed = 1) {
  const c = makeColumn();
  for (let i = 0; i < 3000; i++) c.step([0, 0]);
  const pilot = new Pilot({
    nMeasured: 2,                                  // the two compositions, nothing else
    channels: [0, 1].map(() => ({ lo: UBOX.lo, hi: UBOX.hi,
      vMax: 6e-3, aMax: 6e-5, jMax: 6e-7 })),
    uMax: UMAX,
    start: [0, 0],
    guards: [{ index: 0, max: 25 }, { index: 1, max: 25 }],
    workspace: () => true,
    dwell: true,                                   // a recipe holds between steps
    seed,
  });
  let steps = 0;
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    c.step(cmd.map((q) => q.pos + q.u));
    steps++;
    const want = outputsFor(cmd.map((q) => q.pos));
    pilot.observe(c.y.slice(), [c.y[0] - want[0], c.y[1] - want[1]]);
  }
  return { pilot, steps };
}

function runPilot(pilot, active) {
  const c = makeColumn();
  for (let i = 0; i < 3000; i++) c.step([0, 0]);
  const S = pilot.sample, cache = new Map();
  const refAt = (i) => {
    const k = Math.min(Math.max(i * S, 0), T_END);
    let r = cache.get(k);
    if (!r) { const sp = setpointAt(k); r = inputsFor(sp[0], sp[1]); cache.set(k, r); }
    return r;
  };
  if (active) pilot._initRun();
  let iae = 0, uPk = 0;
  for (let k = 0; k < T_END; k++) {
    const sp = setpointAt(k);
    const un = inputsFor(sp[0], sp[1]);
    const u = active ? pilot.act((off) => refAt(Math.floor(k / S) + off)) : [0, 0];
    uPk = Math.max(uPk, Math.abs(u[0]), Math.abs(u[1]));
    c.step([un[0] + u[0], un[1] + u[1]]);
    pilot.observe(c.y.slice(), null);
    iae += (Math.abs(sp[0] - c.y[0]) + Math.abs(sp[1] - c.y[1])) * DT;
  }
  return { iae, uPk };
}

// ------------------------------------------------------------------------ the run
const t0 = Date.now();
const open = runOpen();
const blt = runBLT();
const { pilot, steps } = await commission();
const st = pilot.status();
console.log(`    commissioned in ${steps} steps = ${(steps * DT / 60).toFixed(0)} h of process time; `
  + `Ts ${st.Ts}, Tset ${st.Tset}, sample ${st.sample}, N ${st.N}, `
  + `rings ${JSON.stringify(st.rings)}`);
console.log(`    verify ${st.report.verify ? st.report.verify.ratio.toFixed(2) + 'x' : '—'} — ${pilot.verdict.why}`);
const run = runPilot(pilot, pilot.verdict.deploy);

console.log(`    IAE over the scenario (composition·min, both loops summed):`);
console.log(`      steady-state inversion only   ${open.iae.toFixed(2)}`);
console.log(`      Luyben BLT decentralized PI   ${blt.iae.toFixed(2)}   [the published baseline]`);
console.log(`      the pilot                     ${run.iae.toFixed(2)}   `
  + `(${(blt.iae / run.iae).toFixed(2)}x BLT), u peak ${run.uPk.toFixed(3)}`);
console.log(`      published bar: an extended-predictive tuning reports 28.9 against BLT's `
  + `55.34 on its own scenario — 1.91x`);

check('the pilot commissions on a plant defined only by published transfer functions',
  st.report.readouts && st.report.readouts.length === 2, JSON.stringify(st.rings));
// SEVEN MINUTES OF DEAD TIME ON A CROSS PATH, and the pilot has to have absorbed it into
// its own measured timescale or its horizon is short by more than the delay itself.
check('…and its measured timescale exceeds the longest dead time in the plant',
  st.Ts > Math.max(...TH.flat()) / DT, `Ts ${st.Ts} against ${Math.max(...TH.flat()) / DT} steps`);
// THE RIG IS VALIDATED AGAINST THE LITERATURE, and this is the assertion that makes every
// other number on this page mean something: our BLT implementation on our scenario lands
// within a few percent of the published 55.34. The plant, the baseline gains, the
// anti-windup and the IAE convention are therefore the ones the papers used.
// THE NEGATIVE CONTROL FOR THE BASIS SELECTOR (brick 54). This plant is DEFINED by
// linear transfer functions — there is no curvature in it anywhere — so a fit offered a
// quadratic block and a structured prior must decline it. It does, on both loops. The
// plants that accept it (a tank whose outflow goes as sqrt(h), a barrel that radiates as
// T^4) are the ones whose state equations have curvature, which is what says the selector
// is reading the physics rather than the sample count.
check('a plant defined by linear transfer functions selects the LINEAR basis',
  st.report.readouts.every((r) => r.basis === 'linear'),
  JSON.stringify(st.report.readouts.map((r) => r.basis)));
check('our BLT baseline reproduces the published IAE for this plant within 15%',
  Math.abs(blt.iae - 55.34) / 55.34 < 0.15,
  `${blt.iae.toFixed(2)} against the published 55.34`);
check('…and the correction never exceeded the engineer\'s cap',
  run.uPk <= UMAX + 1e-12, run.uPk.toFixed(3));

// ============================ WHERE WE STAND, AND IT IS NOT WHERE THE VERIFY SAYS
//
// THE PILOT LOSES ON THIS PLANT. Against a scenario the literature would recognise it
// scores WORSE than a plain steady-state inversion and worse than the published BLT
// tuning, and no setting of the correction cap changes that — measured at 0.15 / 0.4 /
// 0.8 / 2.0 the IAE reads 91.4 / 72.1 / 70.4 / 76.5 against BLT's 51.95. It is not
// saturation and it is not the cap.
//
// WHAT IS ALARMING IS NOT THE LOSS, IT IS THAT THE GATE CERTIFIED IT. The verify round —
// the pilot's entire safety contract, the thing that is supposed to refuse a controller
// the machine has not vouched for — reported 5.81x, 18.20x, even 22.88x on the very runs
// that measure 0.7x on the benchmark. The tank process already showed this gap at 3.8x
// and it was written up as an optimistic estimate; here it is thirty-fold and it is the
// difference between refusing and deploying something that makes the plant worse.
//
// THE CAUSE IS THE REGIME THE VERIFY SCORES. It runs a filtered-noise scribble drawn
// from the excitation's own distribution, at quarter rates, and — as of brick 50 — with
// the dwell the engineer declared. That is still not a PROGRAM: a program is steps and
// holds, and on a plant with four different dead times the response to a step shares
// almost nothing with the response to a scribble. The arm is simply the plant where
// those two regimes happen to agree, which is why this went unnoticed for four bricks.
//
// FIXED IN PART (brick 53). The verify now scores TWO regimes — the scribble and a
// PROGRAM of trapezoid moves and dwells at the machine's own rate limits — and gates on
// the WORSE ratio. On this plant the two disagree by a factor of 1.6 and the program is
// the pessimistic one, so the gate fell 5.81x -> 2.10x and the overstatement 8x -> 2.9x
// WITHOUT the benchmark IAE moving at all (72.08 before and after — the controller is
// unchanged; only the estimate of it got honest). It still overstates, and this plant is
// still the one where the pilot LOSES, so the gap is re-stated rather than closed.
const overstate = st.report.verify.ratio / (blt.iae / run.iae);
console.log(`    THE GATE OVERSTATES BY ${overstate.toFixed(0)}x: verify `
  + `${st.report.verify.ratio.toFixed(2)}x against a measured ${(blt.iae / run.iae).toFixed(2)}x `
  + `on the benchmark — it certified a controller that makes this plant worse`);
// THE GATE IS PINNED IN BOTH DIRECTIONS. Below 1.5x the remaining overstatement is
// gone and the ledger above needs re-stating; above 5x the two-regime gate has regressed
// to what the scribble alone used to say. Neither bound is a target — both are there so
// a change to the gate cannot pass silently.
check('the verify/benchmark gap is smaller than it was and still recorded',
  overstate > 1.5 && overstate < 5,
  `${overstate.toFixed(1)}x against the 8x this plant measured before the two-regime `
  + 'gate; if it fell below 1.5x the gate improved again — re-measure and re-state');
// AND THE CONTROLLER ITSELF DID NOT MOVE, which is what says the gate was fixed rather
// than the measurement changed: the same 72.08 IAE before and after brick 53.
check('…and the benchmark IAE is unchanged by the gate work',
  Math.abs(run.iae - 72.08) / 72.08 < 0.05, run.iae.toFixed(2));

console.log(`    (three controllers scored in ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log(failed ? `\npilot/woodberry: ${failed} check(s) FAILED\n` : '\npilot/woodberry: all checks passed\n');
process.exit(failed ? 1 : 0);
