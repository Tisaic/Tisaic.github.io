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

// ------------------------------------------------- the machine, from the data file
const GTAU = 35.15065188248547;   // N/V, drive gain            } read out of
const KP = 160.18;                // 1/s, position loop         } DATA_EMPS.mat
const KV = 243.45;                // V/(m/s), velocity loop     }
const DT = 1e-3, VSAT = 10, LSB = 5e-8;   // 1 kHz, ±10 V drive, 0.05 µm encoder
const M1 = 95.0856, FV1 = 205.1170, FC1 = 20.2276, OF1 = -3.1810;   // our IDIM-LS
const PUB = { M: 95.1089, Fv: 203.5034, Fc: 20.3935, OF: -3.1648 }; // published

// THE FRICTION CURVE, binned from the raw record: gtau·vir − M·q̈ against velocity, 61
// bins over ±0.129 m/s (the record's own range), at least 34 samples in every bin.
const VM = 0.129;
const FRICTION = [-47.223, -50.535, -46.504, -48.993, -49.714, -47.69, -46.827, -45.364,
  -45.74, -45.297, -40.27, -40.241, -38.596, -38.308, -38.364, -39.029, -37.695, -35.484,
  -33.997, -32.867, -31.425, -28.341, -27.709, -26.87, -26.2, -25.085, -23.496, -22.582,
  -21.235, -18.707, -0.862, 17.31, 18.966, 20.409, 21.779, 22.694, 23.779, 24.855, 25.264,
  25.571, 27.756, 29.967, 30.85, 30.955, 30.624, 31.025, 32.144, 33.029, 32.981, 34.273,
  33.188, 35.546, 37.757, 38.579, 39.09, 39.609, 38.23, 38.249, 38.361, 40.669, 36.959];
const NB = FRICTION.length;
function fric(v) {
  const x = (v + VM) / (2 * VM) * (NB - 1);
  if (x <= 0) return FRICTION[0] + (v + VM) * FV1;
  if (x >= NB - 1) return FRICTION[NB - 1] + (v - VM) * FV1;
  const i = Math.floor(x), f = x - i;
  return FRICTION[i] * (1 - f) + FRICTION[i + 1] * f;
}

// THE PROGRAM. The recorded reference is a piecewise-constant-acceleration trapezoid
// program; the run lengths come from its second difference and the fifteen accelerations
// from a least-squares fit of the integrated program to the recorded qg. It reproduces
// the recorded reference to 1.18e-5 m peak over the lap — 2% of the tracking error it is
// used to measure, and identical for every controller here, so it cannot favour one.
const P = 6240;
const RUNS = [35, 351, 50, 1, 98, 687, 98, 1, 148, 1035, 148, 1, 50, 351, 101, 351, 50, 1,
  98, 687, 98, 1, 148, 1035, 148, 1, 50, 351, 66];
const ACC = [0.819696, -0.826876, 0.834499, -0.834589, 0.837223, -0.83719, 0.827038,
  -0.834201, 0.827215, -0.834609, 0.834591, -0.837223, 0.837141, -0.826781, 0.827378];
const Q0 = 1.078221e-4, V0 = 1.343255e-2;
function program() {
  const a = new Float64Array(P), q = new Float64Array(P), v = new Float64Array(P);
  let i = 0, ai = 0, on = true;
  for (const len of RUNS) { const val = on ? ACC[ai++] : 0; for (let j = 0; j < len; j++) a[i++] = val; on = !on; }
  let x = Q0, vv = V0;
  for (let k = 0; k < P; k++) { q[k] = x; v[k] = vv; vv += a[k] * DT; x += vv * DT; }
  return { q, v, a };
}
const PR = program();

/**
 * The axis. `ff` is what the DRIVE does with the reference it is handed — 0 none,
 * 1 velocity feedforward, 2 also inverse-dynamics feedforward at the identified
 * parameters. The derivatives come from the reference itself, as a real interpolator's
 * do, so a correction injected into the reference is fed forward the same way the
 * program is and the pilot commissions on exactly the machine it deploys on.
 */
function makeMachine(q0, ff = 0) {
  const e0 = Math.round(q0 / LSB) * LSB;
  return {
    q: q0, v: 0, qp: e0, qb1: e0, r1: q0, vd1: 0, ff,
    step(ref) {
      const qe = Math.round(this.q / LSB) * LSB;
      const qb = 0.5 * (qe + this.qp), dq = (qb - this.qb1) / DT;
      this.qb1 = qb; this.qp = qe;
      const vd = (ref - this.r1) / DT, ad = (vd - this.vd1) / DT;
      let volts = 0;
      if (this.ff >= 1) volts += KV * vd;
      if (this.ff >= 2) volts += (M1 * ad + FV1 * vd + FC1 * Math.sign(vd) + OF1) / GTAU;
      this.r1 = ref; this.vd1 = vd;
      let u = KV * (KP * (ref - qe) - dq) + volts;
      u = Math.max(-VSAT, Math.min(VSAT, u));
      this.v += DT * (GTAU * u - fric(this.v)) / M1;
      this.q += DT * this.v;
      return u;
    },
  };
}

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
  nMeasured: 1,                          // the encoder, and nothing else
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
console.log(`      the pilot                           ${pil.rms.toFixed(4)}      ${(shipped.rms / pil.rms).toFixed(1)}x   no plant knowledge`);
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
check('…and it improves the shipped machine by at least 3x',
  shipped.rms / pil.rms > 3, `${(shipped.rms / pil.rms).toFixed(2)}x`);
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

console.log(failed ? `\n  ${failed} check(s) FAILED\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);

// ============================================================================ FINDINGS
//
// WHERE THIS PILOT STANDS ON A REAL SERVO AXIS: FOURTH OF SIX. It is worth 4.8x with no
// plant knowledge, which is real and free; it is beaten 3x by a velocity feedforward
// that every drive on the market already has, 25x by a hand-tuned ILC, and 57x by an
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
// remove — which makes the next two findings the serious ones.
//
// ---------------------------------------------------------------------------------
// DEFECT 1 — THE CADENCE HAS A 200-STEP FLOOR, AND A 1 kHz SERVO IS THE FIRST PLANT
// FAST ENOUGH TO TRIP IT.
//
// The probe measures this machine's rise correctly: h.Ts = 17 steps, h.Tset = 45, dc
// 1.0000, overshoot 1.199 — all of which match a direct step test on the rig (rise 15,
// peak 1.199 at step 26). Then `_deriveCadence` does
//     const TsMax = Math.max(...this.hs.map((h) => h.Ts), 200);
// and the measured 17 is replaced by 200. Ts becomes 222, the grid becomes 7 steps and
// the fit stride 12, for a loop that settles in 45. Every previous plant here — arm,
// tanks, barrel, column, mill — is slower than 200 steps, so the floor has never bound
// before and has never been questioned.
//
// WHAT IT COSTS, measured by lowering the floor and forcing the deployment (the gate
// refuses most of these — see DEFECT 2):
//     floor   Ts   grid    N    verify    delivered on the program
//       200  222      7   48    28.68x     4.79x     <-- as shipped
//       100  111      4   42     1.45x     6.95x
//        50   56      2   42     1.23x    12.24x
//        40   44      1   68     1.04x    15.38x
//        30   33      1   68     1.04x    15.55x
//        20   22      1   68     1.05x    13.96x
//         8   19      1   68     1.05x    12.70x     <-- the measured rise
// So the floor costs 3.2x, and the pilot's honest place in the table above is 15.5x —
// level with the velocity feedforward — rather than 4.8x.
//
// IT IS NOT FIXED HERE, AND THE REASON IS THE SECOND DEFECT: at every floor that
// actually helps, the verify gate REFUSES. Lowering the floor on its own would take this
// machine from 4.79x to 1.00x. The two are one piece of work, not two.
//
// ---------------------------------------------------------------------------------
// DEFECT 2 — THE VERIFY GATE RANKS THESE CONFIGURATIONS EXACTLY BACKWARDS, AND ON A
// WELL-TUNED DRIVE IT CERTIFIES A DEPLOYMENT THAT MAKES THE MACHINE WORSE.
//
// Read the last two columns of that table together: as the cadence gets finer the
// delivered benefit rises 4.79 → 15.55x while the gate's estimate falls 28.68 → 1.04x.
// The gate is not merely optimistic — its ORDERING is inverted, so it certifies 28.68x
// for the configuration that delivers 4.79 and refuses the one that delivers 15.55.
//
// And on the drive with its feedforward switched on, commissioned and deployed on that
// same machine so nothing is stale:
//     drive          baseline    with the pilot      the gate said
//     no FF           0.5764        0.1204  (4.8x)      28.68x
//     velocity FF     0.0380        0.0345  (1.1x)       3.74x
//     + ID FF         0.0021        0.0090  (0.23x)      2.03x    <-- 4.3x WORSE, approved
//
// The last row is the one that matters: the gate is the pilot's entire safety contract,
// and here it approved a correction that degraded a working machine by a factor of four.
// The tanks showed this gap at 3.8x and it was written up as optimism; the Wood–Berry
// column showed it at thirtyfold and it was written up as the difference between
// refusing and deploying something harmful; this is the first time the harm has been
// MEASURED on the machine rather than inferred.
//
// THE CAUSE IS THE SAME ONE ALREADY RECORDED, now with a mechanism. The verify round
// scores a filtered-noise scribble drawn from the excitation's own distribution at
// quarter rate limits. Its timescale therefore comes from the POSITION BOX and the
// declared rate limits — nothing to do with the plant — and on this machine that makes
// it a slow, smooth signal that a long horizon tracks well and a short one cannot see
// the end of. That is why the gate prefers the coarse cadence: it is measuring horizon
// reach against an arbitrary timescale, not benefit on a program. The fix is to score a
// regime the machine will actually run — steps, ramps and dwells at the plant's own
// measured timescale — and to gate on the WORST of the regimes rather than on one. It
// is the outstanding piece of work on this pilot and it is now the blocker for two
// separate improvements, not one.
