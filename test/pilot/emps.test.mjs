/**
 * @file A REAL MACHINE, REAL MEASUREMENTS, AND THE PILOT COMES FOURTH OUT OF SIX.
 *
 * Every plant this pilot has met so far was written by us or transcribed from a paper's
 * transfer function. This one is a MACHINE: the EMPS (Electro-Mechanical Positioning
 * System), a prismatic joint of the kind that drives a robot axis or a machine-tool
 * slide — DC motor, low-friction ball screw, incremental encoder — published as a
 * nonlinear system-identification benchmark:
 *
 *   A. Janot, M. Gautier and M. Brunot, "Data Set and Reference Models of EMPS",
 *   2019 Workshop on Nonlinear System Identification Benchmarks, Eindhoven.
 *
 * The dataset is DATA_EMPS.mat (sha256 6cf6814a e1461879 5da0101a ae2bb97f f0c6351b
 * 0501b549 2751b02b 07facf7e, 626039 bytes), 24841 samples at 1 kHz of the reference
 * qg, the encoder qm and the controller output vir, plus the machine's own constants.
 * It is NOT vendored here — it is third-party data an order of magnitude larger than
 * this repository's source — so what this file carries instead is everything measured
 * OUT of it, listed below, each number reproducible from that file.
 *
 * THE RIG IS VALIDATED AGAINST THE MACHINE BEFORE IT IS USED FOR ANYTHING, twice.
 *
 * (1) OUR IDIM-LS RECOVERS THE PUBLISHED PARAMETERS. Butterworth filtfilt at 100 Hz,
 *     central differences twice, least squares of gtau·vir on [q̈, q̇, sign q̇, 1]:
 *
 *       measured here   M 95.0856   Fv 205.117   Fc 20.228   OF −3.181
 *       published       M 95.1089   Fv 203.503   Fc 20.394   OF −3.165
 *
 *     — 0.02% / 0.8% / 0.8% / 0.5%. So the filtering, the differentiation and the
 *     regression are the ones the benchmark's own MATLAB scripts do.
 *     A NOTE ON THE BENCHMARK'S "ASYMMETRIC FRICTION" VARIANT: it fits Fc⁺ and Fc⁻
 *     instead of Fc and an offset, and it is the SAME four-parameter model — measured
 *     Fc⁺ 17.047, Fc⁻ −23.409, whose half-sum and half-difference are exactly Fc and OF,
 *     and whose residual is identical to six figures. It is a reparameterisation, not a
 *     refinement.
 *
 * (2) THE CLOSED LOOP REPRODUCES THE RECORDED MOTION. Driven by the recorded reference,
 *     the rig below tracks the recorded encoder to 1.6 µm rms and 11 µm peak over the
 *     full 25 s, and its tracking error is 0.5812 mm rms / 0.8517 mm peak against the
 *     machine's recorded 0.5814 / 0.8522 — 0.03%.
 *
 * WHAT THE RECORD SAYS ABOUT THE MACHINE, before any controller is proposed:
 *   · the shipped cascade leaves 0.5814 mm rms, 0.8522 mm peak;
 *   · the reference is EXACTLY periodic at 6240 samples (residual 1.7e-16 m), four laps
 *     of a three-speed trapezoid — a production program, not an identification sweep;
 *   · and the error is 99.95% REPEATABLE: lap to lap it differs by 0.3 µm rms out of
 *     581. That is the premise of every learning controller here, measured on hardware
 *     rather than assumed, and it puts the ceiling for a command pre-distortion at
 *     ~0.3 µm — about 1900x.
 *   · ONE MILLISECOND OF LATENCY IS WORTH 0.125 mm OF IT. The loop compares the encoder
 *     against the reference of the PREVIOUS tick; simulating that one-sample shift moves
 *     the peak error 0.7272 → 0.8518 mm and the rms 0.4926 → 0.5812, i.e. onto the
 *     recorded numbers exactly. Without it the rig is 15% optimistic.
 *
 * THE CONTROL LAW WAS NOT PUBLISHED WITH THE DATA AND WAS RECOVERED FROM IT. Three
 * candidate cascades were scored against the recorded vir; two are hopeless (7.4 V and
 * 22.5 V rms residual against a 1.54 V signal) and one is exact:
 *       vir = kv · ( kp · (qg − qm) − dqm ),  dqm from a 2-tap average, backward difference
 * — 0.0037 V rms residual, 0.24% of the signal. kp = 160.18 s⁻¹ and kv = 243.45 V/(m/s)
 * are read out of the data file itself, as is the drive gain gtau = 35.1507 N/V.
 *
 * THE FRICTION IS THE MACHINE'S OWN, NOT A PARAMETRIC FIT. gtau·vir − M·q̈ binned by
 * velocity over the whole record IS the friction curve, and it is what the plant below
 * uses. It is not the same shape as the four-parameter model: near zero velocity the
 * model over-predicts by up to 5 N, and at the extremes it over-predicts by 4 N. Binning
 * the leftover by POSITION found nothing (±0.6 N, no trend), so friction here is a
 * function of velocity and the plant is written that way.
 *
 * WHAT THIS RIG CANNOT SEE: it reproduces the machine to 1.6 µm, so any two controllers
 * that land inside a couple of µm of each other are indistinguishable on it. That is
 * stated where it binds, below, rather than left for a reader to notice.
 */
import { Pilot } from '../../lib/pilot/pilot.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: EMPS — a real servo axis, real data, and a conventional method that wins');

import { GTAU, KP, KV, DT, VSAT, LSB, M1, FV1, FC1, OF1, PUB, VM, FRICTION, NB,
  P, PR, makeMachine } from './emps-rig.mjs';

/** Score a controller over the last four of `laps` laps. `corr(k)` is a lap-indexed
 *  reference offset; the one-sample reference latency the machine really has is here. */
function score(ff, laps, corr) {
  const m = makeMachine(PR.q[0], ff);
  let s = 0, mx = 0, n = 0;
  const e = new Float64Array(P);
  for (let k = 0; k < laps * P; k++) {
    const kk = ((k - 1) % P + P) % P;
    m.step(PR.q[kk] + (corr ? corr[kk] : 0));
    const ee = m.q - PR.q[k % P];
    if (k >= (laps - 1) * P) e[k % P] = ee;
    if (k >= (laps - 4) * P) { s += ee * ee; mx = Math.max(mx, Math.abs(ee)); n++; }
  }
  return { rms: 1000 * Math.sqrt(s / n), mx: 1000 * mx, e };
}

// ------------------------------------------------------------------ the baselines
const shipped = score(0, 8, null);
const velFF = score(1, 8, null);
const idFF = score(2, 8, null);

// ITERATIVE LEARNING CONTROL — the conventional answer to a repeating program, and the
// pilot's real rival here. corr ← Q * (corr − 0.7·e), with Q a zero-phase circular
// moving average of width w. THE Q IS THE WHOLE DESIGN: without it the loop's
// high-frequency gain exceeds one and it diverges.
function circQ(a, w) {
  if (w < 2) return a.slice();
  const h = (w - 1) >> 1, o = new Float64Array(P);
  for (let k = 0; k < P; k++) { let s = 0; for (let j = -h; j <= h; j++) s += a[((k + j) % P + P) % P]; o[k] = s / (2 * h + 1); }
  return o;
}
function ilc(w, iters) {
  let corr = new Float64Array(P), best = Infinity, bi = 0, last = 0;
  for (let it = 0; it <= iters; it++) {
    const r = score(0, 3, corr);
    last = r.rms;
    if (r.rms < best) { best = r.rms; bi = it; }
    const nx = new Float64Array(P);
    for (let k = 0; k < P; k++) nx[k] = corr[k] - 0.7 * r.e[k];
    corr = circQ(nx, w);
  }
  return { best, bi, last };
}
const ilcQ = ilc(21, 12);
const ilcRaw = ilc(1, 40);

// ------------------------------------------------------- route, limit, run, deploy
const UMAX = 2e-3;                       // 2 mm of authority against a 0.58 mm error
const pilot = new Pilot({
  autoRefuse: true, nMeasured: 1,                          // the encoder, and nothing else
  channels: [{ lo: -0.02, hi: 0.27, vMax: 1.25e-4, aMax: 8.3e-7, jMax: 5e-8 }],
  uMax: UMAX,
  start: [PR.q[0]],
  guards: [{ index: 0, max: 0.4 }],
  workspace: () => true,
  seed: 1,
  exciteSteps: 40000,
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

function runPilot(active) {
  const m = makeMachine(PR.q[0], 0), S = pilot.sample;
  if (active) pilot._initRun();
  let s = 0, mx = 0, n = 0, uPk = 0, pref = PR.q[0];
  const LAPS = 10;
  for (let k = 0; k < LAPS * P; k++) {
    m.step(pref);
    const u = active ? pilot.act((off) => [PR.q[(((Math.floor(k / S) + off) * S) % P + P) % P]]) : [0];
    uPk = Math.max(uPk, Math.abs(u[0]));
    pref = PR.q[k % P] + u[0];
    pilot.observe([m.q], null);
    if (k >= (LAPS - 4) * P) { const e = m.q - PR.q[k % P]; s += e * e; mx = Math.max(mx, Math.abs(e)); n++; }
  }
  return { rms: 1000 * Math.sqrt(s / n), mx: 1000 * mx, uPk: 1000 * uPk };
}
const pil = runPilot(pilot.verdict.deploy);

// -------------------------------------------------------------------- the report
console.log(`    the machine: ${shipped.rms.toFixed(4)} mm rms / ${shipped.mx.toFixed(4)} mm peak `
  + `against the recorded 0.5814 / 0.8522`);
console.log(`    commissioned ${pilot.phase} — Ts ${st.Ts} Tset ${st.Tset} sample ${st.sample} `
  + `grid ${st.grid} N ${st.N}; verify ${st.report.verify ? st.report.verify.ratio.toFixed(2) + 'x' : '—'}`);
console.log('    tracking error over the program, mm rms (x against the shipped machine):');
console.log(`      as shipped, cascade P/P             ${shipped.rms.toFixed(4)}      1.0x   no plant knowledge`);
console.log(`      the pilot                           ${pil.rms.toFixed(4)}     ${(shipped.rms / pil.rms).toFixed(1)}x   no plant knowledge`);
console.log(`      + velocity feedforward              ${velFF.rms.toFixed(4)}     ${(shipped.rms / velFF.rms).toFixed(1)}x   no plant knowledge`);
console.log(`      ILC, Q width 21, best of 12 laps    ${ilcQ.best.toFixed(4)}    ${(shipped.rms / ilcQ.best).toFixed(0)}x   a Q filter, tuned by hand`);
console.log(`      + inverse-dynamics feedforward      ${idFF.rms.toFixed(4)}    ${(shipped.rms / idFF.rms).toFixed(0)}x   M, Fv, Fc, OF identified`);
console.log(`      the machine's own repeatability     0.0003    1900x   (the floor, measured lap to lap)`);
console.log(`      ILC with no Q filter                ${ilcRaw.best.toFixed(4)} at lap ${ilcRaw.bi}, `
  + `then ${ilcRaw.last.toFixed(1)} mm by lap 40 — DIVERGED`);

// --------------------------------------------------------------- what is asserted
check('our identification agrees with the published reference model',
  Math.abs(M1 - PUB.M) / PUB.M < 0.01 && Math.abs(FV1 - PUB.Fv) / PUB.Fv < 0.02
  && Math.abs(FC1 - PUB.Fc) / PUB.Fc < 0.02,
  `${M1} ${FV1} ${FC1} against ${PUB.M} ${PUB.Fv} ${PUB.Fc}`);
// THE RIG IS THE MACHINE, and every number below is worth exactly what this is worth.
check('the rig reproduces the recorded tracking error within 1%',
  Math.abs(shipped.rms - 0.5814) / 0.5814 < 0.01 && Math.abs(shipped.mx - 0.8522) / 0.8522 < 0.01,
  `${shipped.rms.toFixed(4)} / ${shipped.mx.toFixed(4)} against 0.5814 / 0.8522`);
// AND THE FRICTION TABLE IS THE SAME MACHINE AS THE PARAMETRIC MODEL — within a few N,
// which is the whole margin the two disagree by and the whole margin a learner could win.
{
  let worst = 0;
  for (let b = 0; b < NB; b++) {
    const v = -VM + 2 * VM * b / (NB - 1);
    if (Math.abs(v) < 0.006) continue;                 // the sign step is not a fit error
    worst = Math.max(worst, Math.abs(FRICTION[b] - (FV1 * v + FC1 * Math.sign(v) + OF1)));
  }
  check('the measured friction curve departs from the four-parameter model by a few N',
    worst > 1.5 && worst < 8, `worst ${worst.toFixed(2)} N`);
}
check('the pilot commissions and deploys with no plant model at all',
  pilot.verdict.deploy && st.report.readouts.length === 1, pilot.verdict.why);
// 8x, NOT THE 3x THIS ASKED FOR BEFORE BRICK 53: the cadence floor that was costing
// this machine a factor of three is gone and the delivered figure went 4.79x -> 12.70x
// with no change to the controller itself, so the gate here has teeth again.
check('…and it improves the shipped machine by at least 8x',
  shipped.rms / pil.rms > 8, `${(shipped.rms / pil.rms).toFixed(2)}x`);
// AND IT RUNS AT THE RISE THE PROBE ACTUALLY MEASURED, which is the fix itself: 17
// steps, not the 200-step placeholder that used to replace it.
check('…at a cadence derived from the rise the probe measured, not from a floor',
  st.Ts < 60 && st.grid === 1, `Ts ${st.Ts} grid ${st.grid}`);
check('…without ever exceeding the authority it was given',
  pil.uPk <= 1000 * UMAX + 1e-9, `${pil.uPk.toFixed(3)} mm against ${1000 * UMAX}`);
// THE RIVAL WINS, AND ITS COST IS ASSERTED TOO — the Q filter is not a detail, it is the
// design, and getting it wrong is worse than shipping nothing at all.
check('a hand-tuned ILC beats the pilot on this machine',
  ilcQ.best < pil.rms, `${ilcQ.best.toFixed(4)} against ${pil.rms.toFixed(4)}`);
check('…and the same ILC with no Q filter diverges past the uncontrolled machine',
  ilcRaw.last > 10 * shipped.rms, `${ilcRaw.last.toFixed(2)} mm against ${shipped.rms.toFixed(4)}`);
check('the model-based feedforward beats everything learned here',
  idFF.rms < ilcQ.best && idFF.rms < pil.rms, `${idFF.rms.toFixed(4)}`);

// ---------------------------------------------------- THE SOLVER BUDGET, ON THE MACHINE
// THE SHIPPED SOLVER SETTING IS 57x MORE ARITHMETIC THAN THE MACHINE WANTS, AND WORSE.
// `boxQP` runs 60 iterations over a horizon of `1.5*Tset/grid`, and both numbers were set
// without ever being scored on a plant. `test/pilot/qpsweep.mjs` sweeps the pair from ONE
// commissioned model — the only variable is the solver's work — and finds ONE iteration at
// N=56 delivering 14.16x where 60 at N=68 delivers 12.70x, at 10,148 MAC per cycle against
// 576,074. That is 101% of 10% of a 1 ms scan against 5761%, which is the whole of target 6.
//
// IT IS NOT A GRID ARTIFACT AND THAT HAD TO BE CHECKED, because the surface is rugged and
// not separable — at one iteration N=56 gives 14.16x and N=68 gives 10.62x, so rule 42's 5%
// band contains a single isolated cell. Scored on the two-tone sine the model has never seen,
// the SAME cell is best (8.66x, against N=68's 7.36x), so the corner is a setting rather than
// a coincidence.
//
// WHY IT IS BETTER RATHER THAN MERELY CHEAPER: the QP inverts a FORECAST, so truncating the
// solve shrinks the inverse of an imperfect model. The iteration count is a second
// regulariser alongside `lambda`, which is why the two knobs are not separable and why more
// horizon past the optimum makes this machine WORSE.
//
// PINNED HERE RATHER THAN ONLY MEASURED IN A SCRIPT, because it is an argument for changing
// two library defaults and the six-plant pass has not run yet. What this asserts is only what
// was measured on this machine: the cheap corner is at least as good, on both programs.
{
  const N0 = pilot.N, IT0 = pilot.qpIters;
  pilot.N = 56; pilot.qpIters = 1;
  const cheap = runPilot(pilot.verdict.deploy);
  const cost = pilot.cost();
  pilot.N = N0; pilot.qpIters = IT0;
  console.log(`    solver budget: ${IT0} iterations at N=${N0} → ${pil.rms.toFixed(4)} mm; `
    + `1 iteration at N=56 → ${cheap.rms.toFixed(4)} mm at `
    + `${cost.peakMacPerCycle.toLocaleString()} MAC/cycle`);
  // THIS CHECK WENT RED BECAUSE THE CODE GOT BETTER, which is the other way a check goes
  // stale (rule 4). It asserted that one iteration at N=56 beats sixty at N=68 — true when it
  // was written, against the PER-LEAD fit: 0.04070 against 0.04539. The bank is now one shared
  // model and the ordering reversed. Measured on this axis, all from the same rig:
  //
  //   per-lead, 60 it, N 68   0.04539   12.70x     576,074 MAC   5761% of budget
  //   per-lead,  1 it, N 56   0.04070   14.16x      10,148 MAC    101%
  //   shared,   60 it, N 68   0.03998   14.42x     576,074 MAC   5761%
  //   shared,    4 it, N 68   0.03924   14.69x      42,914 MAC    429%   <- ships
  //   shared,    1 it, N 56   0.04489   12.84x      10,148 MAC    101%
  //
  // SO THE THREE KNOBS ARE NOT SEPARABLE FROM THE FIT MODE EITHER. The short-horizon corner
  // was a property of the per-lead bank; the shared model prefers the FULL horizon and pays
  // for it. What ships delivers the best number measured on this axis and sits at 429% of a
  // PLC scan — and the configuration that fits the scan gives up 13% of it. That is stated
  // rather than resolved: it is a real trade and both ends are on this rig.
  check('what ships beats the heavy setting it replaced, at a fifteenth of the arithmetic',
    pil.rms < 0.0454, `${pil.rms.toFixed(5)} against the per-lead 60-iteration 0.04539`);
  check('…and the budget-fitting corner is still reachable, at a stated cost in delivery',
    cheap.rms > pil.rms && cheap.rms < 1.25 * pil.rms,
    `${cheap.rms.toFixed(5)} at 10,148 MAC against ${pil.rms.toFixed(5)} at 42,914`);
  // BOTH HALVES (rule 9): cheaper is worthless if it stopped correcting, so the authority it
  // actually uses is asserted too — a solver that gave up would show as a collapsed uPk.
  check('…and it is not cheaper by declining to act — it still uses its authority',
    cheap.uPk > 0.4 * pil.uPk, `${cheap.uPk.toFixed(3)} against ${pil.uPk.toFixed(3)} mm`);
  check('…and it fits 10% of a 1 ms scan',
    cost.peakMacPerCycle < 10500, `${cost.peakMacPerCycle.toLocaleString()} MAC/cycle`);
}

console.log(failed ? `\n  ${failed} check(s) FAILED\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);

// ============================================================================ FINDINGS
//
// WHERE THIS PILOT STANDS ON A REAL SERVO AXIS: FOURTH OF SIX. It is worth 12.7x with no
// plant knowledge at all — within 20% of a velocity feedforward that every drive on the
// market already has — and it is beaten 9x by a hand-tuned ILC and 22x by an
// inverse-dynamics feedforward at the published parameters.
//
// AND THE REASON IS NOT A DEFECT, IT IS THE PLANT. This machine HAS a closed form, it
// has four parameters, and its authors published them. This project already reached that
// conclusion from the other side on the anti-slosh tab — learn the parameters that have
// no closed form, COMPUTE the ones that do — and the EMPS is the cleanest possible test
// of it: the lattice arm the pilot wins on has distributed flexibility, a pose-dependent
// inertia and no closed form for its tip error, and here a first-year textbook model
// beats every learner in the file. A prediction was stated before this was built —
// friction-dominated tracking would be the pilot's wheelhouse because friction error is
// a function of commanded velocity — and it was WRONG for exactly the reason above: so
// is the feedforward's model, and the feedforward's is right to a couple of newtons.
//
// THE ONE THING THE PILOT HAS THAT THE WINNER DOES NOT is that the ILC's Q filter is a
// design, not a detail. Six widths were tried at learning gain 0.7 and THREE OF THEM
// DIVERGE — best/after-40-laps in mm rms: w1 0.0177/63.8, w5 0.0167/94.6, w11 0.0134/70.7,
// w21 0.0047/0.0049, w41 0.0103/0.0103, w81 0.0253/0.0253. The winning number in the table
// above is the best of a swept design; the wrong choice leaves the machine a HUNDRED
// TIMES worse than doing nothing, and nothing in the loop says which you have until the
// laps run. That is the failure mode the pilot's commissioning-and-refusing exists to
// remove — and this machine found two defects in exactly that machinery.
//
// ---------------------------------------------------------------------------------
// DEFECT 1 — THE CADENCE HAD A 200-STEP FLOOR, AND A 1 kHz SERVO WAS THE FIRST PLANT
// FAST ENOUGH TO TRIP IT. FIXED.
//
// The probe measured this machine correctly: h.Ts = 17 steps, h.Tset = 45, dc 1.0000,
// overshoot 1.199 — matching a direct step test on the rig (rise 15, peak 1.199 at step
// 26). Then `_deriveCadence` did `Math.max(...hs.map(h => h.Ts), 200)` and the measured
// 17 became 200: Ts 222, grid 7 steps, fit stride 12, for a loop that settles in 45.
// Arm, tanks, barrel, column and mill are all slower than 200 steps, so the floor had
// never bound and had never been questioned. The floor is now 8 — enough for the grid
// and stride arithmetic to mean something — and whether the measured rise means anything
// is what `identifiable` answers, which the probe already reports.
//
// Measured by varying the floor and forcing the deployment, gate before and after the
// two-regime verify below:
//
//   floor   Ts   grid    N    gate was   gate now   delivered
//     200  222      7   48     28.68x      7.98x      4.79x    <- what shipped before
//     100  111      4   42      1.45x      2.00x      6.95x
//      50   56      2   42      1.23x      1.64x     12.24x
//      30   33      1   68      1.04x      1.35x     15.55x
//      20   22      1   68      1.05x      1.36x     13.96x
//       8   19      1   68      1.05x      1.37x     12.70x    <- the measured rise
//
// So the floor was costing 2.7x, and this file's table now reads 12.7x instead of 4.8x
// with NO change to the controller. NOTE THE ROW THAT IS NOT THE SHIPPED ONE: a slightly
// coarser cadence (Ts 33) delivers 15.55x, better than the measured rise's 12.70x. That
// is left alone deliberately — picking 33 would be fitting a constant to one machine,
// which is what the 200 was.
//
// ---------------------------------------------------------------------------------
// DEFECT 2 — THE VERIFY GATE SCORED ONE REGIME AND IT WAS THE WRONG ONE. FIXED IN PART.
//
// The gate now scores TWO regimes on the same interleaved on/off plan — the filtered-noise
// scribble it always used, and a PROGRAM of trapezoid moves with dwells between them,
// whose ramps come from the machine's own rate limits — and it deploys on the WORSE of
// the two ratios. Measured on this axis, the scribble uses 78.5% of its velocity budget
// but 9.2% of acceleration and 3.1% of jerk with a 7303-step corner; the program uses
// 90% / 90% / 16% with 282-step ramps, against the machine program's own 148.
//
// THE THREE VERDICTS THAT MATTER ARE NOW RIGHT, and the middle one is the reason this
// work happened at all. Commissioned and deployed on the drive with its own feedforward
// switched on, so nothing is stale:
//
//   drive          baseline    with the pilot     gate was      gate now
//   no FF           0.5764        0.0454 (12.7x)    28.68x        1.35x  DEPLOYS
//   velocity FF     0.0380        —                  3.74x        0.96x  REFUSES
//   + ID FF         0.0021        —                  2.03x        0.05x  REFUSES
//
// Before this change the gate approved a correction on the fully-tuned drive that
// measured 0.23x — it made a working machine FOUR TIMES WORSE — and approved a 1.10x on
// the velocity-feedforward drive that was not worth the authority it spent. Both are now
// refused, the second emphatically.
//
// WHAT IS NOT FIXED, STATED PLAINLY. The gate's ORDERING is still inverted: read the
// two right-hand columns of the floor table and the estimate still falls as the delivered
// benefit rises. And on this machine the error has changed SIGN rather than gone away —
// the gate now UNDERSTATES by 9x (1.35x against a delivered 12.70x) and clears its own
// 1.1x deploy threshold by a quarter, on a controller worth twelve. Understating is the
// safe direction, but a gate that nearly refuses a 12.7x controller is not a good gate.
//
// A HYPOTHESIS FOR THE UNDERSTATEMENT, LABELLED AS ONE BECAUSE IT COULD NOT BE TESTED
// HERE: both regimes run at QUARTER rate limits (brick 43, chosen so the effort weight
// is priced on a trajectory like the ones machines actually run), and this pilot's
// benefit on this machine is dominated by the velocity-lag term q̇/kp, which scales with
// speed while the friction term does not. At a quarter speed the predictable part of the
// error is a smaller fraction of it, so the measured benefit should be smaller — and the
// machine's real program runs at 100% of its limits, not 25%. Raising the verify's rates
// to test this pushed the SCRIBBLE builder into a `cannot traverse the box` refusal on
// this very axis, so the experiment is recorded as unrun rather than as evidence.
