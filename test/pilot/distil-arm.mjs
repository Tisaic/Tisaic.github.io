/**
 * @file THE DISTILLED RUNG ON THE ARM, THROUGH THE LADDER — and the split that reads a refusal.
 *
 * The bench measured `②d distilled — REFUSED, 0.22x` at demo grade: the rung reached, the
 * training runs converged past the drop gate, the fit vouched for itself, and the MACHINE
 * refused it. One number, at least three causes. This harness runs the same distil-only ladder
 * the page runs (same host, same grade table) and then takes the measurement that separates
 * them (rule 9, both halves): the fitted policy is scored ON ITS OWN TRAINING PROGRAMS.
 *
 *   helps its own programs, harms the square  -> transfer: the diet or the window
 *   harms even its own programs               -> the fit, or the deploy path (units, sign)
 *
 * Not a test — an instrument. Run: GRADE=fast node test/pilot/distil-arm.mjs
 */
import { machine, settle, commissionComp } from '../flexisim/_rig.mjs';
import { makeArmHost } from '../../lib/flexisim/autohost.js';
import { sharpRect, roundedRect, circle } from '../../lib/flexisim/toolpath.js';
import { designDemoPaths } from '../../lib/flexisim/demopath.js';
import { HarmonicFF } from '../../lib/pilot/hff.js';
import { DistilPolicy } from '../../lib/pilot/distil.js';

const GRADE = process.env.GRADE || 'fast';
// PERIODIC=1 declares a periodic application, so the ladder also builds lap learning — the
// bench's other option, and on this arm the rung that DOES help (8.9–9.2x on the square in the
// old harness). Off by default so the distil reading stays one variable.
const PERIODIC = process.env.PERIODIC === '1';
// LOO=1: the transfer question one level down. Converge the lap-periodic correction on each of
// the six training programs ONCE (as the rung does), then for each fold fit a policy on the
// other five and score it on the held-out program AND on the square, on the machine.
//   carries polygon -> polygon, not -> square   : the square's corner class is what is missing
//   fails polygon -> polygon too                : the route over-fits its diet, whatever the diet
// The convergence loop below restates ~10 lines of the rung — an instrument's copy, noted.
const LOO = process.env.LOO === '1';
const GRADES = {
  full: { avg: 4, warmup: 2, probeLaps: { warmup: 1, avg: 2 }, passes: 24 },
  fast: { avg: 2, warmup: 1, probeLaps: { warmup: 1, avg: 1 }, passes: 8 },
  demo: { avg: 1, warmup: 1, probeLaps: { warmup: 0, avg: 1 }, passes: 4 },
};
const G = { ...GRADES[GRADE] };
// PASSES=n overrides the refinement passes alone, at the grade's scoring laps — the ladder of
// passes at fixed authority is the measurement §52.7 says has to be taken.
if (process.env.PASSES) G.passes = +process.env.PASSES;
// DIET selects what the host converges the rung on. `demo` is the host's own default — the
// designer's feed ladder at r 2.2-3.8 — which is the diet plan §49's harness measured at
// 0.22x-1.09x on this square. `poly` is that harness's 4.99x diet: the same designer at the
// programs' own scale, one feed. `polyfeed` is the scale-matched diet across a feed ladder,
// which §49.13 measured as the only one safe off the commissioning feed.
const DIET = process.env.DIET || 'poly4';
// REPLACE=1 converges and deploys the rung WITHOUT the compliance feedforward under it — the
// composition test/_distil.mjs measures — instead of on top of it (plan §52.7).
const REPLACE = process.env.REPLACE !== '0';   // the host's default; REPLACE=0 keeps the feedforward under it
// ENGINE=pilot commissions the cascade at depth 1 as the rung's TEACHER — the oracle-fed
// pilot iteration test/_distil.mjs measured at 6.40x on the square — and the distilled policy
// then REPLACES it at deploy (plan §52.8). Default: HarmonicFF, as shipped.
const ENGINE = process.env.ENGINE || 'pilot';
// OFFS=raw reproduces the window as it was first ported (raw ±512 steps with a sign block);
// the default is the host's — the harness's ±256 PILOT-SAMPLE window, converted by the rung.
const DISTIL = { ...(process.env.OFFS === 'raw'
  ? { offsets: [-512, -256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512],
      signOffsets: [-128, -32, -8, -2, 0, 2, 8, 32, 128] } : {}),
  // WIN=<k>: the host's pilot-sample window with every offset scaled by k (rule 37: the window must
  // reach the plant's memory, and a softer link has a longer one).
  ...(process.env.WIN ? { offsetsPerSample: [-256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256].map((o) => Math.round(o * +process.env.WIN)) } : {}),
  // WINRAW=<steps>: the SAME 23-offset ladder expressed in RAW MACHINE STEPS, so the window's
  // reach is a property of the plant rather than of the pilot's cadence. The default window is
  // in PILOT SAMPLES, and the pilot's sample stride is set by the plant's own settle — so raising
  // the servo bandwidth SHRINKS the raw reach of a window nobody touched (stride 8 -> 4 at
  // bw 8e-3, i.e. +/-2048 raw steps -> +/-1024). A bandwidth sweep read through the default
  // window is therefore two variables at once, and the first one taken here read the bench square
  // 10% worse for that reason alone (rule 17: the instrument, before the plant). WINRAW=2048 is
  // the shipped reach at the shipped bandwidth and is byte-identical there, which is the control.
  ...(process.env.WINRAW ? { offsets: [-256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256]
    .map((o) => Math.round(o * (+process.env.WINRAW / 256))) } : {}),
  // WINEXT=<steps>: EXTEND the raw window to this reach by APPENDING taps at the ladder's own
  // outer spacing, instead of SCALING every offset (plan §52.36). This is the test §52.16 never
  // ran. That section swept the window x1/x2/x3 by multiplying the same 23 offsets, so the span
  // and the SPACING tripled together and a ring at a few thousand steps became invisible through
  // the wide taps — it traded exactly the resolution it was testing the reach for, and concluded
  // "the reach is not what binds", which retired rule 37. `test/pilot/modes.mjs` measures the
  // plant's impulse ring at period 3166-3868 steps across the workspace decaying 5.6x per cycle,
  // so the memory to 2% is ~7,850 raw steps and the shipped +/-2048 window reaches 52% of it.
  // Extending to +/-4096 at the outer spacing costs 8 taps, i.e. 16 features of 93 and ~32 MAC
  // of a 10,000 budget — so if reach binds at PRESERVED resolution it is nearly free to fix.
  ...(process.env.WINEXT ? (() => {
    const base = [-256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256]
      .map((o) => o * ((+(process.env.WINRAW || 2048)) / 256));
    const reach = +process.env.WINEXT, outer = base[base.length - 1] - base[base.length - 2];
    const ext = [];
    for (let v = base[base.length - 1] + outer; v <= reach + 1e-9; v += outer) ext.push(v);
    return { offsets: [...ext.map((v) => -v).reverse(), ...base, ...ext].map(Math.round) };
  })() : {}),
  // STRIDE=<n|pilot>: one row per n steps and the correction held between (default the host's, pilot).
  ...(process.env.STRIDE ? { stride: process.env.STRIDE === 'pilot' ? 'pilot' : +process.env.STRIDE } : {}),
  // FADE=<fraction of the trained speed span>: the coverage guard's ramp (measured inert here).
  ...(process.env.FADE ? { coverageFade: +process.env.FADE } : {}),
  // RIDGE=<x>: the fit's ridge (rule 32 — a prior scaled to the rows it acts on).
  ...(process.env.RIDGE ? { ridge: +process.env.RIDGE } : {}),
  // ONLINE=0: the batch ridge fit instead of the streaming recursion (the second route, rule 15).
  ...(process.env.ONLINE === '0' ? { online: false } : {}) };
if (!['hff', 'pilot'].includes(ENGINE)) throw new Error(`ENGINE ${ENGINE}: hff or pilot`);
// DIETFEED=<x>: scale every TRAINING feed by x, leaving the scored program at the bench feed.
// It is the one knob that moves a training lap's LENGTH IN STEPS while every plant timescale
// stays fixed, which is the half of plan §74.3's falsifier that `ARM_BW` cannot reach: the probe
// takes K points per LAP, so halving the feed halves their density per millimetre of path while
// leaving the machine identical. Unset is 1 and byte-identical.
const DF = +(process.env.DIETFEED || 1);
const F = 4e-3 * DF;
const DIETS = {
  demo: null,
  poly: { feeds: [F, F, F], rMin: 3.4, rSpan: 2.4 },
  polyfeed: { feeds: [F, 2 * F, 0.5 * F], rMin: 3.4, rSpan: 2.4 },
  poly1: { feeds: [F], rMin: 3.4, rSpan: 2.4 },   // two programs, for a quick look at the engine
  poly4: { feeds: [F, F], rMin: 3.4, rSpan: 2.4 }, // four programs (two convex, two stars) — the shipped diet
  tour2: { feeds: [F, F], rMin: 3.4, rSpan: 2.4, tour: { nShapes: 6 } },   // two long closed tours, six shapes each (plan §52.16)
  tour1: { feeds: [F], rMin: 3.4, rSpan: 2.4, tour: { nShapes: 6 } },
};
if (!(DIET in DIETS) && !['self', 'selfpoly', 'rects', 'rectspoly'].includes(DIET)) throw new Error(`DIET ${DIET}: one of ${Object.keys(DIETS).join(', ')}, self, selfpoly, rects, rectspoly`);
const K = +(process.env.ARM_K || 0.25), E = +(process.env.ARM_E || 0.03);
const path = sharpRect({ w: 8, h: 8, centre: [12, 0], feed: 4e-3, accel: 4e-5, cornerDt: 40 });
const LAP = Math.ceil(path.lap);
console.log(`\ndistil on the arm through the ladder — K ${K} / E ${E}, sharp square, grade ${GRADE}${PERIODIC ? ', PERIODIC (lap learning built)' : ''}`
  + ` (avg ${G.avg}, warmup ${G.warmup}, passes ${G.passes}, diet ${DIET}, ${ENGINE} teacher${process.env.OFFS === 'raw' ? ', raw window' : ''}${process.env.STRIDE ? `, stride ${process.env.STRIDE}` : ''}${process.env.TEACHCAP ? `, teach cap ${process.env.TEACHCAP}` : ''}${process.env.TLAPS ? `, teach laps ${process.env.TLAPS}` : ''}${process.env.TPASSES ? `, teach passes ${process.env.TPASSES}` : ''}${process.env.TRACE === '1' ? ', re-measured' : ''}${REPLACE ? ', REPLACES the compliance feedforward' : ', under the feedforward'})`);

const t0 = Date.now();
const m0 = await machine({ K, E });
const centre = m0.arm.ik(12, 0, true);

// THE COMMANDED JOINT SPEED SCALE, DERIVED FROM THE REFERENCE AND NOT FROM THE PLANT (plan §84.7).
//
// A reference-correlated disturbance has to be normalised by something, and §81's first attempt
// failed because it was sized against the wrong quantity (rule 17) — as did this one's: scaling a
// viscous drag by `servo.speedMax` moved the machine 0.08%, because `speedMax` is a rate limit in
// rad/step of a different order from the per-step joint motion a 4e-3 feed actually produces.
//
// So the scale is taken from the COMMANDED JOINT REFERENCE of the scored program — the 99th
// percentile of |Δq₁| over one lap. That is a property of the REFERENCE, which is exactly the
// signal the deployed map reads, so a disturbance normalised by it stays a function of what the
// map can see; it is not a plant constant and nothing about the machine enters it (rule 31).
const QV0 = (() => {
  const d = [];
  let prev = m0.arm.ik(path.at(0).x, path.at(0).y, true)[0];
  for (let k = 1; k < LAP; k++) {
    const c = path.at(k), q = m0.arm.ik(c.x, c.y, true)[0];
    d.push(Math.abs(q - prev)); prev = q;
  }
  d.sort((a, b) => a - b);
  return Math.max(1e-12, d[Math.floor(0.99 * (d.length - 1))]);
})();
/** The same scale for the commanded joint ACCELERATION — the 99th percentile of |Δ²q₁| over a lap. */
const QA0 = (() => {
  const d = [];
  let p2 = m0.arm.ik(path.at(0).x, path.at(0).y, true)[0];
  let p1 = m0.arm.ik(path.at(1).x, path.at(1).y, true)[0];
  for (let k = 2; k < LAP; k++) {
    const c = path.at(k), q = m0.arm.ik(c.x, c.y, true)[0];
    d.push(Math.abs(q - 2 * p1 + p2)); p2 = p1; p1 = q;
  }
  d.sort((a, b) => a - b);
  return Math.max(1e-12, d[Math.floor(0.99 * (d.length - 1))]);
})();
const host = makeArmHost({
  makeMachine: async () => {
    const m = await machine({ K, E });
    const rc = commissionComp(m.arm, m.servo);
    const c0 = path.at(0); const [q1, q2] = m.arm.ik(c0.x, c0.y, true);
    settle(m.arm, m.servo, q1, q2);
    return { arm: m.arm, l1: m.l1, l2: m.l2, servo: m.servo, rc };
  },
  path, lap: LAP, K, centre,
  // LAPSYNC=1: re-phase the cascade's tick at each lap start (measured 2.23x -> 2.19x; off, plan §52.15).
  ...(process.env.LAPSYNC === '1' ? { lapSync: true } : {}),
  classic: false, maxDepth: ENGINE === 'pilot' ? 1 : 0, demo: null, lapMemory: PERIODIC, distil: DISTIL,
  ...(DIETS[DIET] ? { distilDiet: DIETS[DIET] } : {}), distilReplaces: REPLACE,
  // DIET=self: the bench square ITSELF as the only training program — the in-sample ceiling of the
  // basis on the program it is scored on; DIET=selfpoly: the square plus the four polygons.
  ...(DIET === 'self' ? { distilPath: [path] } : DIET === 'selfpoly' ? { distilPath: [path, ...designDemoPaths({ centre: [12, 0], feeds: [F, F], rMin: 3.4, rSpan: 2.4 })] } : {}),
  // DIET=rects: RECTANGLES that share the square's edge DIRECTIONS (axis-aligned) and its centre but
  // not its size — 5x11, 11x5, 6x6, 10x10 — the square itself in none of them (plan §52.27). The
  // residual the shipped diet leaves lives along the square's straight edges, and random polygons
  // at random rotations rarely put a long axis-aligned edge at those poses. DIET=rectspoly adds the
  // shipped four polygons to the rectangles.
  ...(DIET === 'rects' || DIET === 'rectspoly' ? { distilPath: [
    ...[[5, 11], [11, 5], [6, 6], [10, 10]].map(([w, h]) => sharpRect({ w, h, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40 })),
    ...(DIET === 'rectspoly' ? designDemoPaths({ centre: [12, 0], feeds: [F, F], rMin: 3.4, rSpan: 2.4 }) : [])] } : {}),
  // GUIDED=<laps>: the commissioning-phase online adaptation (plan §52.29). It adapts the CASCADE,
  // which in this configuration is the distilled policy's TEACHER rather than a rung that ships, so
  // what it buys here is a better teacher and not a better deployed object.
  ...(process.env.GUIDED ? { guidedLaps: +process.env.GUIDED } : {}),
  // TRUTH=encoder|wu: THE COMMISSIONING'S INSTRUMENT (plan §52.42). What the teacher may
  // measure — the tracker (default), the motor encoders and a rigid model, or the encoders
  // plus wind-up readings. The DELIVERED number stays on the tracker either way, so what
  // this reads is the cost of a cheaper commissioning and not a cheaper scoreboard.
  ...(process.env.TRUTH ? { distilTruth: process.env.TRUTH } : {}),
  // THE TOUCH PROBE (plan §74): the teacher may read the truth at K evenly spaced points of the
  // lap and nowhere else — the instrument a shop already owns, against the tracker it does not.
  // `PROBEPTS=0` is the default and byte-identical.
  ...(process.env.PROBEPTS ? { distilProbePts: +process.env.PROBEPTS } : {}),
  ...(process.env.CAP ? { distilCap: +process.env.CAP } : {}),
  ...(process.env.TEACHCAP ? { distilTeachCap: +process.env.TEACHCAP } : {}),
  // Q=<steps>: a circular moving-average Q-filter on the teacher's learned increment (plan §52.16).
  ...(process.env.Q ? { distilQ: +process.env.Q } : {}),
  // TEACHITERS=<n>: the teacher solves its QP with this many iterations (deploy keeps its own).
  ...(process.env.TEACHITERS ? { distilTeachIters: +process.env.TEACHITERS } : {}),
  // SCHED=1: the pose-scheduled map (every window feature also times the pose offset).
  ...(process.env.SCHED === '1' ? { distilSchedule: 'pose' } : {}),
  // ADAPTLAG=<steps> / ADAPTRATE=<x>: the tracker-stays law's pairing lag and gain (plan §52.18).
  ...(process.env.ADAPTLAG ? { distilAdaptLag: +process.env.ADAPTLAG } : {}),
  ...(process.env.ADAPTRATE ? { distilAdaptRate: +process.env.ADAPTRATE } : {}),
  // FB=1: a feedback cascade layer identified and scored ON TOP of the distilled model (plan §52.20).
  ...(process.env.FB === '1' ? { distilFeedbackOnTop: true } : {}),
  ...(process.env.FBCAP ? { distilFeedbackCap: +process.env.FBCAP } : {}),
  ...(process.env.FBGAIN ? { distilFeedbackGain: +process.env.FBGAIN } : {}),
  ...(process.env.FBBASIS ? { distilFeedbackBasis: process.env.FBBASIS } : {}),
  ...(process.env.INSTR === '1' ? { instruments: true } : {}),
  // TEACHREFUSED=1: let a cascade that lost its verify still TEACH the distilled rung
  // (plan §52.33). Byte-identical wherever the cascade was admitted anyway, which is the control.
  ...(process.env.TEACHREFUSED === '1' ? { distilTeachRefused: true } : {}),
  // STATE=1: the distilled policy carries the state term (plan §52.27).
  ...(process.env.STATE === '1' ? { distilState: 'poly', ...(process.env.STATEROUNDS ? { distilStateRounds: +process.env.STATEROUNDS } : {}) } : {}),
  // FBOPTS=key=value,...: any Pilot option for the feedback layer alone — e.g. FBOPTS=ditherAmp=0.005,
  // because its dither defaults to a tenth of its authority, sized for the bare machine's error and
  // not for the residual it is identified on (plan §52.25).
  ...(process.env.FBOPTS ? { distilFeedbackSched: Object.fromEntries(process.env.FBOPTS.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, isNaN(+v) ? v : +v]; })) } : {}),
  // FBSCHED=order[,lags[,cmd]]: the feedback layer's scheduled block shape (plan §52.25), e.g. FBSCHED=2,1,1
  ...(process.env.FBSCHED ? (() => { const a = process.env.FBSCHED.split(','); const prev = process.env.FBOPTS ? Object.fromEntries(process.env.FBOPTS.split(',').map((kv) => { const [k, v] = kv.split('='); return [k, isNaN(+v) ? v : +v]; })) : {}; return { distilFeedbackSched: { ...prev, schedOrder: +a[0], ...(a[1] ? { schedLags: +a[1] } : {}), ...(a[2] ? { schedCmd: a[2] === '1' } : {}), ...(a[3] ? { schedFn: a[3] } : {}) } }; })() : {}),
  // STD=1: standardised rows (each feature divided by its rms over the training rows).
  ...(process.env.STD === '1' ? { distilStandardize: true } : {}),
  // SOFFS=a,b,c: the direction-of-travel block's offsets, in pilot samples (default none).
  ...(process.env.SOFFS ? { distil: { ...DISTIL, signOffsetsPerSample: process.env.SOFFS.split(',').map(Number) } } : {}),
  // REF=angles|torques|both: what the policy reads at each window offset (plan §52.16).
  ...(process.env.REF ? { distilRef: process.env.REF } : {}),
  // PARAM=1: the parametric engine — iterate the policy's parameters, not the signal (plan §52.16).
  ...(process.env.PARAM === '1' ? { distilParametric: true } : {}),
  // COMMISSIONING-TIME KNOBS (plan §52.9): TLAPS laps per teacher drive, TPASSES passes,
  // TRACE=1 re-measures the prefix between passes (the old behaviour, the control).
  ...(process.env.TLAPS ? { distilTeachLaps: +process.env.TLAPS } : {}),
  ...(process.env.TPASSES ? { distilPasses: +process.env.TPASSES } : {}),
  ...(process.env.TRACE === '1' ? { distilTeachTrace: true } : {}),
  // HOLD is gone: every drive starts with a driven APPROACH and rule 45's settle (plan §52.12).
  distilEngine: ENGINE, distilDebug: process.env.DEBUG === '1',
  distilOracle: process.env.ORACLE === '0' ? false : process.env.ORACLE === 'control' ? 'control' : true,
  avg: G.avg, warmup: G.warmup, passes: G.passes, probeLaps: G.probeLaps,
  onRung: (r) => console.log(`  [${Math.round((Date.now() - t0) / 1000)}s, ${(host.samples().samples / 60000).toFixed(1)} machine-min] ${r.name}  ${r.score.toExponential(4)}`
    + `  ${r.gain === null ? '' : r.gain.toFixed(2) + 'x'}${r.deployed ? '' : '  NOT deployed'}${r.note ? '  — ' + r.note : ''}`),
});
host.auto.pilotOpts.start = m0.arm.ik(path.at(0).x, path.at(0).y, true);
// SEED=n: another commissioning draw (the excitation's seed), for a spread on one result.
if (process.env.SEED) host.auto.pilotOpts.seed = +process.env.SEED;
// DPT=<n>: `decisionsPerTs`, which sets how finely the horizon is gridded — `grid` is
// `Ts / sample / DPT` and the QP's size is `N = horizonTs*Tset / sample / grid`. It is a CARRIED
// CONSTANT (30) and raising the servo bandwidth shrinks the pilot's sample stride, so the same
// horizon in raw steps arrives as THREE TIMES the decision variables: N 79 at bw 2e-3 against
// 245-255 at 1.2e-2 to 2.4e-2, inverted by the same 4 truncated iterations. The horizon and the
// iteration count are two regularisers of one inversion, so tripling one and holding the other
// is not a neutral change (rule 31). DPT=10 restores N at bw 1.6e-2 without shortening the
// horizon's REACH in raw steps, and costs three times less arithmetic while doing it.
if (process.env.DPT) host.auto.pilotOpts.decisionsPerTs = +process.env.DPT;
// QPITERS=<n>: the other end of the same knob — leave the horizon fine and converge it further.
if (process.env.QPITERS) host.auto.pilotOpts.qpIters = +process.env.QPITERS;
// BASIS=quad|lin|sch: force the pilot's forecast basis (every cascade layer, including the feedback layer).
if (process.env.BASIS) host.auto.pilotOpts.forceBasis = process.env.BASIS;
// LEADPROBE=1: the pilot re-fits every sampled lead ALONE beside the shared fit and records both
// held-out R² per lead (plan §52.25) — is one weight vector for every lead what the feedback
// layer's forecast is paying for?
if (process.env.LEADPROBE === '1') globalThis.__LEADPROBE = {};
// ---- TRAINSHOVE=<kind:mag[:a:b]>: A DISTURBANCE PRESENT WHILE THE TEACHER CONVERGES (plan §83).
//
// §81 measured the object degrading under an unmodelled load because it goes on applying a
// correction sized for the NOMINAL plant. The obvious answer is domain randomisation: show it
// disturbances during training. This project can PREDICT what that does, and the prediction is
// worth writing down before the run (rules 16, 59).
//
// The map's input is a window of the COMMANDED REFERENCE, and a disturbance does not change the
// commanded reference. So the same row now carries different targets depending on how the plant
// happened to be pushed, and least squares AVERAGES over them. The map cannot become
// disturbance-dependent — §80.3's finding from another side — it can only become HEDGED: target
// variance rises, the fit shrinks, and the deployed map applies LESS authority.
//
//   PREDICTION (kind `rand`): equivalent to turning §79's applied gain DOWN, and therefore
//   reproducible by the clean policy at a matched gain. If so it is a REGULARISER and not a
//   capability, and the gain ladder is the cheaper way to buy it.
//   PREDICTION (kind `phase`): the disturbance is switched at a FIXED lap phase, so the REFERENCE
//   PREDICTS IT and the map CAN express it. This is the industrially realistic case — a cutting
//   force that depends on where you are in the path, a payload picked up at a known program point
//   — and it is the one where a win would be real rather than a hedge.
//
// KNOWN HAZARD, and it is this session's own finding: §80.7 measured a lap-INCOMMENSURATE
// component at 0.9% of the error costing a lap-indexed teacher a factor of 1.6-2.5. `rand` is
// exactly such a component by construction, so it may HARM through the teacher rather than
// through the map, and `TLAPS`/averaging is the control that separates the two.
if (process.env.TRAINSHOVE) {
  const [tk = 'rand', tmS, taS, tbS] = process.env.TRAINSHOVE.split(':');
  const tmag = Number(tmS || 0.5), ta = Number(taS || 0.30), tb = Number(tbS || 0.55);
  const tTau = m0.servo.tauMax;
  let tseed = 20260914;
  const rnd = () => ((tseed = (tseed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  // `rand`: on/off in blocks of an eighth of a lap with a random sign, redrawn per block, so it is
  // uncorrelated with the reference BY CONSTRUCTION and the map has nothing to key on.
  let blk = -1, amp = 0;
  let qPrev = 0, qP1 = 0, qP2 = 0;
  const trainShove = (nn, lap, tau, qRef) => {
    // `payload`: the machine is carrying something it was not commissioned with, so the torque
    // ACTUALLY REQUIRED scales up. Injecting a fraction of the commanded torque is scale-free —
    // no constant in the plant's units — and it is REFERENCE-CORRELATED in the only sense that
    // matters here: it is a function of what the machine is already being asked to do, which the
    // map's own features (the rigid-body reference torques, §52.16) already carry.
    //
    // `phase` is NOT that, and measuring it is what showed the difference: a lap FRACTION is a
    // memory index, and the diet is four different polygons, so "fraction 0.30-0.55" is a
    // different region of reference-space on each one. Phase-locked is not reference-correlated —
    // the retirement's own lesson arriving inside a disturbance (plan §83.3).
    if (tk === 'payload') return [tmag * (tau ? tau[0] : 0), 0];
    // `drag`: A VISCOUS LOAD THE MACHINE WAS NOT COMMISSIONED WITH — a stiff way, a dragging
    // cover, a coolant seal. This is #53's design and it is the one §83.2 could not express
    // (plan §84.7). It is a function of the COMMANDED JOINT VELOCITY, which the host now hands
    // over, so it is:
    //   REFERENCE-CORRELATED — the same function of the reference on every program, unlike a lap
    //     fraction, which is a different region of reference-space on each polygon of the diet;
    //   EXPRESSIBLE — the map's window already carries the commanded reference at many offsets,
    //     so a difference of two taps IS a velocity and a linear map can form it exactly;
    //   SCALE-FREE — normalised by `QV0`, the 99th percentile of the commanded joint speed of
    //     the REFERENCE itself, so no plant number enters (rule 31);
    //   LARGE ENOUGH — `tmag` is a fraction of tauMax, sized inside §81's own envelope where the
    //     machine still works (0.25-0.5), which is what §83.3's 0.8% payload was not.
    if (tk === 'drag') {
      const v = qRef ? (qRef[0] - qPrev) : 0;
      if (qRef) qPrev = qRef[0];
      return [tmag * tTau * Math.max(-1, Math.min(1, v / QV0)), 0];
    }
    // `inertia`: THE PAYLOAD CHANGED — the machine is carrying a mass it was not commissioned
    // with, so the torque actually required rises in proportion to the commanded ACCELERATION.
    // This is the discriminating design and `drag` above is why it had to exist (plan §84.7): a
    // viscous load is absorbed by the position loop's own velocity feedback and moved the
    // conventional machine 0.9%, which cannot separate anything. An inertial load peaks at the
    // corners and REVERSES SIGN there, which a PD cannot absorb — and a linear map of the
    // commanded reference forms it from a SECOND difference of three taps, so it is predictable
    // by exactly the object under test.
    if (tk === 'inertia') {
      const a = qRef ? (qRef[0] - 2 * qP1 + qP2) : 0;
      if (qRef) { qP2 = qP1; qP1 = qRef[0]; }
      // NEGATIVE: carrying an unaccounted mass CONSUMES accelerating torque, it does not
      // supply it. The first version had this sign backwards and the machine said so —
      // the conventional arm got 10% BETTER under it, because a positive term is an
      // inertia feedforward and not a payload (rule 14: a surprising measurement checks
      // the instrument, and this instrument was mine).
      return [-tmag * tTau * Math.max(-1, Math.min(1, a / QA0)), 0];
    }
    if (tk === 'phase') {
      const f = ((nn % lap) + lap) % lap / lap;
      return (f >= ta && f < tb) ? [tmag * tTau, 0] : [0, 0];
    }
    const b = Math.floor(nn / Math.max(1, Math.round(lap / 8)));
    if (b !== blk) { blk = b; amp = (rnd() < 0.5 ? -1 : 1) * tmag * tTau * (rnd() < 0.5 ? 0 : 1); }
    return [amp, 0];
  };
  host.setTrainDisturb(trainShove);
  console.log(`\n  TRAINING WITH A ${tk === 'drag' || tk === 'payload' || tk === 'inertia' ? 'REFERENCE-CORRELATED' : tk === 'phase' ? 'PHASE-LOCKED' : 'RANDOM'} DISTURBANCE: `
    + `${(100 * tmag).toFixed(0)}% of tauMax on joint 1`
    + (tk === 'inertia' ? ` scaled by the COMMANDED JOINT ACCELERATION over its own 99th percentile — an unmodelled PAYLOAD, a second difference of three taps and so expressible by the map exactly`
      : tk === 'drag' ? ` scaled by the COMMANDED JOINT VELOCITY over its own 99th percentile — a viscous load, which the position loop's velocity feedback largely absorbs`
      : tk === 'payload' ? ` of the COMMANDED TORQUE — an unmodelled payload, and a function of what the reference already asks for`
      : tk === 'phase' ? `, on between lap fractions ${ta} and ${tb} — locked to LAP PHASE, which is not the same thing`
      : `, redrawn every lap/8 with random sign and duty — the reference CANNOT predict it`));
}
const rep = await host.auto.commission({ run: host.run, drivePilot: host.drivePilot,
  recordDemo: host.recordDemo, distilRuns: host.distilRuns });
// The teacher is done; the training disturbance must not leak into the scored comparisons, which
// arm their own through `setDisturb` (rule 20 — one variable).
if (process.env.TRAINSHOVE) host.setTrainDisturb(null);
// FBFORECAST=1: THE FEEDBACK LAYER'S FORECAST SCORED ON THE SQUARE (rule 16, plan §52.26). Its
// held-out R² is measured on its own excitation, which is not the regime it deploys on. Here the
// layer is forced on, its lead-0 prediction of the error is captured per decision through the
// oracle port (returning the fitted value, so nothing changes), paired with the truth the guided
// run reports, and scored — the forecast on the machine it corrects, beside what it delivers.
if (process.env.FBFORECAST === '1' && host.auto.built.stacks && host.auto.built.stacks.length) {
  const stF = host.auto.built.stacks[host.auto.built.stacks.length - 1], p = stF.layers[0];
  const prev = { stack: host.auto.stack, depth: host.auto.deployed.stack, below: host.auto._distilBelowStack, dobs: host.auto.distil && host.auto.distil.observe };
  host.auto.stack = stF; host.auto.deployed.stack = 1; host.auto._distilBelowStack = true;
  if (host.auto.distil) host.auto.distil.observe = () => false;
  const pred = [[], []], tru = [[], []]; let pending = null;
  // ...and at a LADDER OF LEADS: the QP plans against every lead of its horizon, and a forecast
  // right at lead 0 can be noise at lead 500. Decisions record their per-lead predictions; the
  // truth per step is kept; both are paired at the end.
  const LEADIDX = [0, 4, 8, 16, 32, 64]; const decs = []; const truthLog = [];
  // FBEXT=1: THE SEPARATED FORECAST BANK (plan §52.26). The observer that reads the residual at
  // 0.96/0.99 offline (§52.24-25), fitted HERE on the layer's own excitation record — the raw
  // truth at every lead the QP plans over, one ridge per lead, the command window at ±256
  // samples, the newest sample and the instruments multiplied by the generic trig of the pose —
  // and handed to the QP through the oracle port in place of the pilot's own forecast. The QP,
  // its horizon, its response model and its cap are untouched: only the forecast moves.
  let ext = null, kNow = 0, last = null;
  if (process.env.FBEXT === '1' && p._rec && p._rec.x && p._rec.x.length) {
    const rec = p._rec, PS = p.sample, grid = p.grid, leads = p.readouts[0].leads, NL = Math.min(p.N, leads.length);
    const OFFS = [-256, -128, -64, -32, -16, -8, -4, -2, -1, 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256];
    const trig = (m) => { const c0 = Math.cos(m[0]), s0 = Math.sin(m[0]), c1 = Math.cos(m[1]), s1 = Math.sin(m[1]); return [c0, s0, c1, s1, c0 * c1, c0 * s1, s0 * c1, s0 * s1]; };
    const row = (m, cmd0, cmdAt) => { const f = [1, cmd0[0], cmd0[1]]; for (const o of OFFS) { const q = cmdAt(o); f.push(q[0] - cmd0[0], q[1] - cmd0[1]); } const base = [m[0] - cmd0[0], m[1] - cmd0[1], ...m.slice(2)]; const tg = trig(m); for (const a of base) for (const t of tg) f.push(a * t); return f; };
    const n = rec.x.length;
    const X = rec.x.map((m, i) => row(m, rec.cmd[i], (o) => rec.cmd[Math.max(0, Math.min(n - 1, i + o))]));
    const dim = X[0].length, A = new Float64Array(dim * dim);
    for (const x of X) for (let i = 0; i < dim; i++) { const xi = x[i]; for (let j = i; j < dim; j++) A[i * dim + j] += xi * x[j]; }
    for (let i = 0; i < dim; i++) for (let j = 0; j < i; j++) A[i * dim + j] = A[j * dim + i];
    const sc = new Float64Array(dim); for (let i = 0; i < dim; i++) sc[i] = Math.sqrt(A[i * dim + i] / n) || 1;
    const lam = +(process.env.FBEXTLAM || 1e-3);
    const M = new Float64Array(dim * dim);
    for (let i = 0; i < dim; i++) { for (let j = 0; j < dim; j++) M[i * dim + j] = A[i * dim + j] / (sc[i] * sc[j]); M[i * dim + i] += lam * n; }
    const Lc = new Float64Array(dim * dim);
    for (let i = 0; i < dim; i++) for (let j = 0; j <= i; j++) { let s2 = M[i * dim + j]; for (let k = 0; k < j; k++) s2 -= Lc[i * dim + k] * Lc[j * dim + k]; Lc[i * dim + j] = i === j ? Math.sqrt(Math.max(s2, 1e-300)) : s2 / Lc[j * dim + j]; }
    const solve = (b) => { const z = new Float64Array(dim); for (let i = 0; i < dim; i++) { let s2 = b[i] / sc[i]; for (let k = 0; k < i; k++) s2 -= Lc[i * dim + k] * z[k]; z[i] = s2 / Lc[i * dim + i]; } const ws = new Float64Array(dim); for (let i = dim - 1; i >= 0; i--) { let s2 = z[i]; for (let k = i + 1; k < dim; k++) s2 -= Lc[k * dim + i] * ws[k]; ws[i] = s2 / Lc[i * dim + i]; } const w = new Float64Array(dim); for (let i = 0; i < dim; i++) w[i] = ws[i] / sc[i]; return w; };
    // one weight vector per lead per channel, target the RAW truth at k + lead (the dither is small)
    const W = [];
    for (let li = 0; li < NL; li++) {
      const L = leads[li]; const b = [new Float64Array(dim), new Float64Array(dim)];
      for (let i = 0; i + L < n; i++) { const x = X[i], e = rec.e[i + L]; for (let j = 0; j < dim; j++) { b[0][j] += x[j] * e[0]; b[1][j] += x[j] * e[1]; } }
      W.push([solve(b[0]), solve(b[1])]);
    }
    // in-sample R² at lead 0, as a sanity floor for the fit itself
    { const r2 = [0, 1].map((c) => { let ss = 0, st = 0, mu = 0; for (let i = 0; i < n; i++) mu += rec.e[i][c]; mu /= n; for (let i = 0; i < n; i++) { let q = 0; for (let j = 0; j < dim; j++) q += W[0][c][j] * X[i][j]; ss += (rec.e[i][c] - q) ** 2; st += (rec.e[i][c] - mu) ** 2; } return 1 - ss / st; });
      console.log(`  external forecast bank: ${dim} columns, ${NL} leads (grid ${grid}, sample ${PS}), λ ${lam}, in-sample R² at lead 0 ${r2.map((v) => v.toFixed(3)).join('/')}`); }
    const R = host.refsFor(m0.arm), LAPn = R.length;
    const qAt = (k) => R[((k % LAPn) + LAPn) % LAPn];
    let cache = { k: -1, x: null };
    ext = (c, leadSamples, fitted, conv) => {
      if (!last) return fitted;
      if (cache.k !== kNow) cache = { k: kNow, x: row(last, qAt(kNow), (o) => qAt(kNow + o * PS)) };
      const li = Math.min(NL - 1, Math.round(leadSamples / grid)), w = W[li][c];
      let q = 0; for (let j = 0; j < dim; j++) q += w[j] * cache.x[j];
      // FBEXTSIGN=-1 flips the forecast's sign: a forecast that is right and a correction that
      // harms monotonically with gain is what a response model of the wrong sign looks like.
      return (process.env.FBEXTSIGN === '-1' ? -q : q) - conv;
    };
  }
  // FBLAW=prop: REPLACE THE QP with the simplest law that reads the forecast only where it is
  // good (plan §52.26): u = −g · ê(L*) / dc, the external bank's prediction at the lead where the
  // response has risen, scaled by the response's DC, clamped at the layer's cap. No horizon, no
  // inversion, no effort weight; g is the one knob and L* is read off the identified response.
  if (ext && process.env.FBLAW === 'prop') {
    const g = +(process.env.FBLAWG || 0.3), grid = p.grid, PS = p.sample;
    const rise = p.hs.map((h) => { const hg = h.hGrid; let i = 0; while (i < hg.length - 1 && Math.abs(hg[i]) < 0.9 * Math.abs(h.dc)) i++; return i; });
    const Ls = process.env.FBLAWLEAD ? p.hs.map(() => +process.env.FBLAWLEAD) : rise;
    console.log(`  proportional law on the external forecast: g ${g}, lead index ${Ls.join('/')} (${Ls.map((l) => l * grid * PS).join('/')} steps), dc ${p.hs.map((h) => h.dc.toExponential(2)).join('/')}, cap ${stF.uMax}; hGrid[0..7] ${Array.from(p.hs[0].hGrid.slice(0, 8)).map((v) => v.toExponential(1)).join(',')} (${p.hs[0].hGrid.length} leads), hSample ${p.hs[0].hSample.length}`);
    stF.act = () => { const u = [0, 0]; for (let c = 0; c < 2; c++) { const e = ext(c, Ls[c] * grid, 0, 0); u[c] = Math.max(-stF.uMax, Math.min(stF.uMax, -g * e / p.hs[c].dc)); } return u; };
  }
  // FBEXTLAMBDA=k scales the QP's effort weight for the forced run: the pilot chose its lambda by
  // replaying its OWN forecast, which on the square reads below the mean (§52.26); with the
  // external bank the regularisation the inversion needs is a fresh question.
  if (process.env.FBEXTLAMBDA) { p.lambda = (p.lambda || 0) * +process.env.FBEXTLAMBDA; console.log(`  forced run: lambda scaled x${process.env.FBEXTLAMBDA} to ${p.lambda.toExponential(2)}`); }
  let dec = null;
  p.oracleF0 = (c, lead, fitted, conv) => { const f = ext ? ext(c, lead, fitted, conv) : fitted; if (lead === 0) { pending = pending || [null, null]; pending[c] = f + conv; }
    const li = Math.round(lead / p.grid); if (LEADIDX.includes(li)) { if (!dec || dec.k !== kNow) { dec = { k: kNow, v: {} }; decs.push(dec); } (dec.v[li] = dec.v[li] || [null, null])[c] = f + conv; } return f; };
  const o0 = host.auto.observe.bind(host.auto);
  host.auto.observe = (m, t) => { last = m; kNow++; if (t) truthLog[kNow] = t.slice(); if (pending && t) { for (let c = 0; c < 2; c++) if (pending[c] != null) { pred[c].push(pending[c]); tru[c].push(t[c]); } pending = null; } return o0(m, t); };
  const r = await host.run(null, null, 3, true);
  host.auto.observe = o0; p.oracleF0 = null;
  host.auto.stack = prev.stack; host.auto.deployed.stack = prev.depth; host.auto._distilBelowStack = prev.below; if (host.auto.distil) host.auto.distil.observe = prev.dobs;
  const r2 = [0, 1].map((c) => { const y = tru[c], mu = y.reduce((a, v) => a + v, 0) / y.length; let ss = 0, st = 0, sp = 0; for (let i = 0; i < y.length; i++) { const e = y[i] - pred[c][i]; ss += e * e; st += (y[i] - mu) ** 2; sp += pred[c][i] ** 2; } return { r2: 1 - ss / st, rmsT: Math.sqrt(st / y.length), rmsP: Math.sqrt(sp / y.length) }; });
  { const PS = p.sample, rows = [];
    for (const li of LEADIDX) { if (li >= p.N) continue; const stepsAhead = li * p.grid * PS; const y = [[], []], q = [[], []];
      for (const d of decs) { const v = d.v[li]; const t = truthLog[d.k + 1 + stepsAhead]; if (!v || !t) continue; for (let c = 0; c < 2; c++) if (v[c] != null) { q[c].push(v[c]); y[c].push(t[c]); } }
      if (y[0].length < 20) continue;
      const r2 = [0, 1].map((c) => { const mu = y[c].reduce((a, v) => a + v, 0) / y[c].length; let ss = 0, st = 0; for (let i = 0; i < y[c].length; i++) { ss += (y[c][i] - q[c][i]) ** 2; st += (y[c][i] - mu) ** 2; } return 1 - ss / st; });
      rows.push(`lead ${String(li * p.grid).padStart(4)} smp (${stepsAhead} steps): ${r2.map((v) => v.toFixed(3)).join('/')}`); }
    console.log(`  forecast ON THE SQUARE at a ladder of leads — ${rows.join('   ')}`); }
  console.log(`  ${ext ? 'EXTERNAL' : 'feedback layer\'s own'} forecast ON THE SQUARE (${pred[0].length} decisions, layer forced on): R² ${r2.map((v) => v.r2.toFixed(3)).join('/')}   truth rms ${r2.map((v) => v.rmsT.toExponential(2)).join('/')}   predicted rms ${r2.map((v) => v.rmsP.toExponential(2)).join('/')}   deployed score ${r.score.toExponential(4)}`);
}
// CORNERSHARE=1: WHERE THE RESIDUAL LIVES (plan §52.27). The deployed machine runs three laps of
// the square, the per-step contour error is read, and the share of its energy within ±W steps
// of the four corners is reported against the share of steps there — a residual that is all
// corner is a residual of velocity reversals, which is where a dead zone is traversed.
if (process.env.CORNERSHARE === '1') {
  const r = await host.run(null, null, 3, false);
  const le = r.lapE[r.lapE.length - 1], L = le.length;
  const sp = Array.from({ length: L }, (_, k) => { const c = path.at(k); return Math.hypot(c.vx, c.vy); });
  const corners = []; for (let k = 1; k < L - 1; k++) if (sp[k] < sp[k - 1] && sp[k] <= sp[k + 1] && sp[k] < 0.5 * F) { if (!corners.length || k - corners[corners.length - 1] > 200) corners.push(k); }
  let tot = 0; for (let k = 0; k < L; k++) tot += le[k] * le[k];
  const rows = [];
  for (const W of [100, 300, 1000]) {
    const near = new Uint8Array(L); for (const c of corners) for (let k = c - W; k <= c + W; k++) near[((k % L) + L) % L] = 1;
    let e2 = 0, n = 0; for (let k = 0; k < L; k++) if (near[k]) { e2 += le[k] * le[k]; n++; }
    rows.push(`±${W}: ${(100 * e2 / tot).toFixed(1)}% of the energy in ${(100 * n / L).toFixed(1)}% of the steps`);
  }
  let far2 = 0, nf = 0; const nearW = new Uint8Array(L); for (const c of corners) for (let k = c - 1000; k <= c + 1000; k++) nearW[((k % L) + L) % L] = 1; for (let k = 0; k < L; k++) if (!nearW[k]) { far2 += le[k] * le[k]; nf++; }
  console.log(`  residual on the square (lap ${L}, corners at ${corners.join(', ')}): ${rows.join('   ')};  mid-edge rms ${Math.sqrt(far2 / Math.max(1, nf)).toExponential(3)} against lap rms ${Math.sqrt(tot / L).toExponential(3)}`);
}
if (globalThis.__LEADPROBE) for (const c of Object.keys(globalThis.__LEADPROBE)) {
  const rows = globalThis.__LEADPROBE[c];
  console.log(`  lead probe ch${c} (last layer fitted): ` + rows.map((r) => `L${r.L} shared ${r.shared.toFixed(2)} per-lead ${r.perLead.toFixed(2)}`).join('  '));
}
// THE FEEDBACK LAYER'S OWN FORECAST, per channel: which basis it chose and its held-out R² at
// the near, middle and far lead — so a refused layer can be read to its forecast or its inversion.
for (const stF of host.auto.built.stacks || []) for (const p of stF.layers) if (p.report && p.report.readouts) {
  console.log(`  feedback layer solver: lambda ${p.lambda != null ? p.lambda.toExponential(2) : '?'}  N ${p.N} grid ${p.grid} qpIters ${p.qpIters}  response dc ${(p.hs || []).map((h) => (h.dc ?? NaN).toExponential(2)).join('/')}  uMax ${p.uMax}  verify ${p.report.verify ? JSON.stringify(p.report.verify).slice(0, 160) : '?'}`);
  console.log('  feedback layer forecast: ' + p.report.readouts.map((r, c) => `ch${c} ${r.basis} lags ${r.lags} R² lin ${(r.r2Lin ?? NaN).toFixed(3)} poly ${(r.r2Poly ?? NaN).toFixed(3)} sched ${(r.r2Sched ?? NaN).toFixed(3)} | lead0 ${(r.r2Lead0 ?? NaN).toFixed(3)} mid ${(r.r2Mid ?? NaN).toFixed(3)} far ${(r.r2Far ?? NaN).toFixed(3)}${r.gated ? ' GATED' : ''}`).join('   '));
}

console.log(`\n  shipped ${JSON.stringify(rep.deployed)}   ${rep.base.toExponential(4)} -> ${rep.best.toExponential(4)}   ${rep.gain.toFixed(2)}x`);
const _st = host.auto.built.stack; if (_st) console.log(`  pilot sample stride ${_st.sample} steps, so the ±256-sample window spans ±${256 * _st.sample} steps${process.env.WIN ? ` (WIN ${process.env.WIN}: ±${Math.round(256 * +process.env.WIN) * _st.sample})` : ''}${process.env.WINRAW ? ` (WINRAW: the window is ±${process.env.WINRAW} RAW steps whatever the stride)` : ''}`);
console.log(`  machine samples ${host.samples().samples.toLocaleString()} over ${host.samples().runs} runs`
  + `  (${(host.samples().samples / 1000 / 60).toFixed(1)} min at 1 ms)  wall ${Math.round((Date.now() - t0) / 1000)} s`);
// THE GUIDED PHASE MUST STATE WHAT IT DID (rule 61, plan §52.29). Composed with the distilled
// policy it comes back byte-identical while costing 1.6 machine-minutes, and "the ladder scored it
// and rolled it back" is a different finding from "it never reached the deployed object".
if (rep.guided) {
  const g = rep.guided;
  console.log(`\n  guided commissioning: ${g.laps} laps over ${g.layers} layer(s)  ${g.before.toExponential(4)} -> ${g.after.toExponential(4)}  ${g.kept ? 'KEPT' : 'ROLLED BACK'}`);
} else if (process.env.GUIDED) {
  console.log(`\n  guided commissioning: asked for ${process.env.GUIDED} laps and the ladder reports NOTHING — the phase did not run (it is inside the cascade rung and needs that rung armed)`);
}
const d = rep.distil;
if (d && d.runs) {
  console.log('\n  training runs (gain of the converged lap-periodic correction on each):');
  d.runs.forEach((c, i) => console.log(`    run ${i}: lap ${c.lap}  gain ${c.gain.toFixed(2)}x  ${c.dropped ? 'DROPPED' : `used ${c.used} rows`}${c.engine ? `  [${c.engine}${c.passes != null ? ` ${c.passes} passes` : ''}]` : ''}`));
}
if (d && d.fit) {
  console.log(`\n  fit: deploy ${d.fit.deploy}  rows ${d.fit.rows}  features ${d.fit.features}`
    + `  held-out R² ${JSON.stringify((d.fit.heldOutR2 || []).map((v) => +v.toFixed(4)))}`
    + (d.stateRounds ? `\n  state rounds: ` + d.stateRounds.map((r) => `round ${r.round} ${r.deploy ? 'vouches' : 'REFUSED'} R² ${JSON.stringify((r.heldOutR2 || []).map((v) => +v.toFixed(3)))} ${r.rows} rows`).join('; ') : '')
    + `  speed span ${JSON.stringify(d.fit.speedSpan)}${d.fit.reason ? '  reason: ' + d.fit.reason : ''}`);
}
if (d && d.note) console.log(`  note: ${d.note}`);

// ---- THE SPLIT. Score the fitted policy on the programs it was fitted on, on the machine.
// A policy with a state term reads the newest measured sample: `tap` receives it after every
// step and `at` uses it at the next decision, exactly as the ladder's own deploy path does.
const heldPolicy = (p, tr, refAt = tr.refAt, speedAt = tr.speedAt) => {
  const st = p.stride || 1; let held = [0, 0], last = null;
  const sr = host.auto.distilOpts && host.auto.distilOpts.stateRow;
  const at = (k) => { if (k % st === 0) { if (p.stateDim && !last) return held; held = p.act(refAt, k, speedAt(k), p.stateDim ? sr(last, refAt(k)) : null); } return held; };
  return { at, tap: (nn, k, m) => { last = m; } };
};
// ADAPT=<laps>: THE TRACKER STAYS ON THE MACHINE (plan §52.18). Run the bench square with the
// truth routed into `observe` — the deployed policy's own streaming recursion continuing on
// the program in front of it — and score every lap, so the composition the page offers as a
// box is a number rather than an assertion.
if (process.env.ADAPT && host.auto.deployed.distil) {
  const N = +process.env.ADAPT;
  const lapRms = (r) => r.lapE.map((le) => { let s2 = 0; for (let k = 0; k < le.length; k++) s2 += le[k] * le[k]; return Math.sqrt(s2 / le.length); });
  const frozen = await host.run(null, null, 3, false);
  const fr = lapRms(frozen);
  console.log(`\n  the tracker stays on: contour rms per lap on the square (frozen policy ${fr[fr.length - 1].toExponential(3)} on its last lap)`);
  const r = await host.run(null, null, N, true);
  const lr = lapRms(r);
  console.log('    ' + lr.map((v, i) => `lap ${i}: ${v.toExponential(3)}`).join('\n    '));
  console.log(`    adapted ${host.auto.distil.adapted().toLocaleString()} rows; frozen -> adapted last lap ${(fr[fr.length - 1] / lr[lr.length - 1]).toFixed(2)}x`);
  const after = await host.run(null, null, 3, false);
  const ar = lapRms(after);
  console.log(`    then FROZEN again (tracker off): ${ar[ar.length - 1].toExponential(3)} on its last lap (${(fr[fr.length - 1] / ar[ar.length - 1]).toFixed(2)}x over the commissioned policy)`);
}
// LEARN=<passes>: learn on the bench square itself with the tracker attached, by the ladder's own
// parametric law (plan §52.18), then score the square frozen.
// HELD-OUT PROGRAMS the model has never been shown — the rounded rectangle and the circle — and
// the commissioning diet: scored with the policy BEFORE and AFTER learning on the square, so a
// gain that is a memory of the square (worse elsewhere) reads as one.
const heldOut = await host.distilRuns({ paths: [
  roundedRect({ w: 8, h: 8, r: 1.5, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40, closed: true }),
  circle({ r: 4, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40 })] });
const heldNames = ['rounded rectangle', 'circle'];
const scoreSet = async (label, p2, set, names) => {
  const out = [];
  for (let i = 0; i < set.length; i++) {
    const tr = set[i];
    const hp = heldPolicy(p2, tr);
    const b = await tr.run(null), w = await tr.run(hp, { tap: hp.tap });
    out.push(b.score / w.score);
    console.log(`    ${label}: ${names[i]} (lap ${tr.lap})  ${b.score.toExponential(4)} -> ${w.score.toExponential(4)}   ${(b.score / w.score).toFixed(2)}x`);
  }
  return out;
};
// GAINS=<list>: THE APPLIED-GAIN AXIS, ASKED ON THE PLANT THIS PROJECT KNOWS BEST (plan §79.2).
//
// The ladder scores a gain ladder on the four plants that carry the ridge ladder, and the tank
// picks 0.72 while the mill, the column and the barrel pick 1.0. The arm does not carry the ridge
// ladder at all, so it is byte-identical BY CONSTRUCTION rather than by measurement — which is a
// weaker statement than it sounds, and rule 25's distinction exactly: "the block was skipped" and
// "the block ran and chose 1.0" are different states. This asks the machine.
//
// It scales the DEPLOYED weight vector, which is exactly what the ladder does, and re-scores the
// square and both held-out programs — because a gain fitted to the square and worse on the two it
// never saw would be a memory in the one place this object is not supposed to have one.
if (process.env.GAINS && host.auto.deployed.distil && host.auto.distil && host.auto.distil.W) {
  const gs = process.env.GAINS.split(',').map(Number).filter((x) => Number.isFinite(x) && x > 0);
  const pol0 = host.auto.distil;
  const W0 = pol0.W.map((w) => Float64Array.from(w));
  console.log('\n  THE APPLIED-GAIN LADDER on the arm (the deployed weights scaled, nothing refitted):');
  for (const g of gs) {
    for (let c = 0; c < pol0.W.length; c++) for (let j = 0; j < pol0.W[c].length; j++) pol0.W[c][j] = W0[c][j] * g;
    const sq = await host.run(null, null);
    console.log(`    gain ${String(g).padStart(5)}  square ${sq.score.toExponential(4)}   ${(rep.base / sq.score).toFixed(3)}x over the conventional machine`);
    await scoreSet(`      gain ${g}`, pol0, heldOut, heldNames);
  }
  for (let c = 0; c < pol0.W.length; c++) for (let j = 0; j < pol0.W[c].length; j++) pol0.W[c][j] = W0[c][j];
}

// FEEDSPAN=<list>: TARGET 2, THE ONE THE NORTH STAR HAS NEVER MEASURED ON THIS CONFIGURATION.
// The deployed policy's offsets are indexed in TIME, so a feedrate change moves how far the same
// window reaches along the PATH — and the coverage guard fades the correction outside the
// commanded-speed span the fit saw rather than extrapolating. Target 2 asks for monotone
// degradation bounded at 1.5x of a per-feed commission across a 5x span; this measures the
// cheaper half honestly: ONE commissioning at the bench feed, scored on the SAME square at a
// ladder of feeds, each against the conventional machine AT THAT FEED, so the denominator moves
// with the plant and a feed the machine simply finds harder cannot read as the policy failing.
if (process.env.FEEDSPAN && host.auto.deployed.distil) {
  const feeds = process.env.FEEDSPAN.split(',').map(Number);
  console.log(`\n  FEED SPAN — one commissioning at ${F.toExponential(1)}, the same policy scored at each feed:`);
  const paths = feeds.map((f) => sharpRect({ w: 8, h: 8, centre: [12, 0], feed: f, accel: 4e-5, cornerDt: 40 }));
  const runs = await host.distilRuns({ paths });
  for (let i = 0; i < runs.length; i++) {
    const tr = runs[i], hp = heldPolicy(host.auto.distil, tr);
    const b = await tr.run(null), w = await tr.run(hp, { tap: hp.tap });
    const cov = host.auto.distil.coverage(feeds[i]);
    console.log(`    feed ${feeds[i].toExponential(1)} (${(feeds[i] / F).toFixed(2)}x)  ${b.score.toExponential(4)} -> ${w.score.toExponential(4)}`
      + `   ${(b.score / w.score).toFixed(2)}x   coverage ${cov.toFixed(3)}${cov < 1 ? ' — FADED' : ''}`);
  }
}
// EXPLAIN=1: THE EXP COLUMN — HOW MUCH OF THE LEARNED MAP IS THE TEXTBOOK FEEDFORWARD?
// (plan §76). `docs/scorecard.md` rates explainability 6 against the incumbent's 9 for a stated
// reason: the record IS the controller and every rung prints its own verdict, but nobody reads 111
// coefficients the way they read a PID gain. Nothing in this project has ever attempted that
// column, and the cheapest thing that can move it is not a picture — it is a MEASUREMENT.
//
// The engineer already owns four names: acceleration (inertia), velocity (lag), direction of
// travel (friction) and bias. `classic.js` fits exactly that basis and its own header records the
// dominant coefficient coming back at 0.797 mm against the position loop's `vPeak/kp` of 0.778 —
// a learned number an engineer can check by hand. So: regress the APPLIED correction of the
// deployed policy onto that basis and report what fraction of it an engineer could have written
// down, per channel, at a LADDER of leads — because §49.14 measured causal taps as worthless and
// straddling taps as the whole result, so the answer is expected to sit at a lead rather than at
// now. Nothing is fitted into the control path: this reads a frozen policy and explains it.
//
// It is not circular. §49.14 already measured that the classical basis DISTILLED delivers 1.02x,
// i.e. nothing, so the basis cannot produce this correction; how much of the correction it
// CORRELATES with is a different question and is the one an engineer asks.
if (process.env.EXPLAIN === '1' && host.auto.deployed.distil) {
  const tr = (await host.distilRuns({ paths: [path] }))[0];
  // ONE DRIVE FIRST: the host fills its reference row cache inside `drive`, so `refAt` reads an
  // unbuilt array until a run has happened. It cost a `Cannot read properties of undefined` and
  // is worth the comment — a lazily filled cache behind a pure-looking accessor.
  await tr.run(null);
  const L = tr.lap, ra = tr.refAt;
  // The row is `[q1, q2, tau1, tau2]` at the shipped `distilRef` and the engineer's basis is
  // about the JOINT REFERENCE, so columns 0 and 1 are what is differenced. A row shape this pass
  // cannot interpret is refused rather than silently regressed against torques (rule 25).
  if (process.env.REF && process.env.REF !== 'both') throw new Error('EXPLAIN=1 reads the angle columns of the shipped row; REF=' + process.env.REF + ' does not have them first');
  // The joint reference and its two derivatives, central-differenced on the CLOSED lap so no
  // sample is special (the lap wraps; a clamped end would put a spurious step in `a`).
  const w = (k) => ((k % L) + L) % L;
  const nc = host.auto.channels.length;
  const q = new Array(L); for (let k = 0; k < L; k++) q[k] = ra(k).slice(0, nc);
  const V = Array.from({ length: nc }, () => new Float64Array(L));
  const A = Array.from({ length: nc }, () => new Float64Array(L));
  for (let k = 0; k < L; k++) for (let c = 0; c < nc; c++) {
    V[c][k] = (q[w(k + 1)][c] - q[w(k - 1)][c]) / 2;
    A[c][k] = q[w(k + 1)][c] - 2 * q[k][c] + q[w(k - 1)][c];
  }
  // What the deployed object actually applies, held between decisions exactly as it deploys.
  const pol = host.auto.distil, st = pol.stride || 1;
  const U = Array.from({ length: nc }, () => new Float64Array(L));
  { let held = new Array(nc).fill(0);
    for (let k = 0; k < L; k++) {
      if (k % st === 0) held = pol.act(ra, k, tr.speedAt(k), null);
      for (let c = 0; c < nc; c++) U[c][k] = held[c] || 0;
    } }
  // Ordinary least squares on [a, v, sign v, 1] at a given lead, per channel. Four unknowns, so
  // a 4x4 normal solve by Gaussian elimination — no library, and the residue is what it cannot
  // explain rather than what a regulariser suppressed (no ridge: the point is the ceiling).
  const fit = (c, lead) => {
    const n = 4, M = Array.from({ length: n }, () => new Float64Array(n + 1));
    let uu = 0, um = 0;
    for (let k = 0; k < L; k++) {
      const j = w(k + lead);
      const x = [A[c][j], V[c][j], Math.sign(V[c][j]), 1], y = U[c][k];
      for (let i = 0; i < n; i++) { for (let jj = 0; jj < n; jj++) M[i][jj] += x[i] * x[jj]; M[i][n] += x[i] * y; }
      uu += y * y; um += y;
    }
    for (let i = 0; i < n; i++) M[i][i] += 1e-12 * (M[i][i] || 1);
    for (let i = 0; i < n; i++) {
      let p2 = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p2][i])) p2 = r;
      const t = M[i]; M[i] = M[p2]; M[p2] = t;
      if (!M[i][i]) continue;
      for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let cc = i; cc <= n; cc++) M[r][cc] -= f * M[i][cc]; }
    }
    const b = new Float64Array(n); for (let i = 0; i < n; i++) b[i] = M[i][i] ? M[i][n] / M[i][i] : 0;
    let ss = 0; const mean = um / L;
    for (let k = 0; k < L; k++) {
      const j = w(k + lead);
      const p3 = b[0] * A[c][j] + b[1] * V[c][j] + b[2] * Math.sign(V[c][j]) + b[3];
      ss += (U[c][k] - p3) ** 2;
    }
    const tot = uu - L * mean * mean;
    return { r2: tot > 0 ? 1 - ss / tot : 0, b, resid: Math.sqrt(ss / L) };
  };
  const leads = [-1024, -512, -256, -128, 0, 128, 256, 512, 1024, 2048];
  console.log('\n  EXPLAINING THE DEPLOYED MAP — the applied correction regressed on the engineer\'s own');
  console.log('  basis [accel, vel, sign vel, bias] at a ladder of leads (positive = the basis read AHEAD):');
  for (let c = 0; c < nc; c++) {
    const rows = leads.map((l) => ({ l, ...fit(c, l) }));
    const best = rows.reduce((x, y) => (y.r2 > x.r2 ? y : x));
    console.log(`    channel ${c}:  ` + rows.map((r) => `${r.l >= 0 ? '+' : ''}${r.l}: ${r.r2.toFixed(3)}`).join('  '));
    const uRms = Math.sqrt(U[c].reduce((t, v) => t + v * v, 0) / L);
    console.log(`      best at lead ${best.l >= 0 ? '+' : ''}${best.l}: R2 ${best.r2.toFixed(4)}  `
      + `— accel ${best.b[0].toExponential(2)}  vel ${best.b[1].toExponential(2)}  `
      + `sign ${best.b[2].toExponential(2)}  bias ${best.b[3].toExponential(2)}`);
    console.log(`      what the four names DO NOT explain: ${(100 * best.resid / uRms).toFixed(1)}% of the applied rms`);
  }
  // ---- AND THE KERNEL ITSELF, READ STRAIGHT OFF THE WEIGHTS WITH NO REGRESSION IN THE ROUTE.
  //
  // `_rowFrom` leads with the ABSOLUTE reference and follows with DIFFERENCES from it, so for each
  // reference channel the weights ARE an FIR kernel over the commanded reference once the
  // differences are folded back: u = w_abs·q0 + Σ_o w_o·(q(o) − q0), which is
  // (w_abs − Σ_o w_o) at lead 0 and w_o at every other lead. That is a filter an engineer reads.
  //
  // TWO PROPERTIES THAT NEED NO FIT AND ARE THE POINT (rule 15 — a second route to one number):
  //   SUM is the DC gain. A correction that must not shift a held pose sums to about zero; one
  //     carrying a static offset does not, and which it is decides whether the object can be armed
  //     on a machine that is already at its commanded position.
  //   CENTROID of |kernel| is WHERE IN TIME the object looks, computed from the stored weights
  //     alone — so it can be set against the +512 the regression above found by a completely
  //     different route. Two readings of one object that must agree.
  const js = pol.toJSON();
  if (js && js.W) {
    const D = js.refDim, offs = js.offsets;
    console.log('    the KERNEL, folded out of the stored weights (no fit in this route):');
    for (let c = 0; c < nc; c++) {
      const W = js.W[c];
      for (let d = 0; d < Math.min(D, nc); d++) {
        const kern = new Map();
        let sumOther = 0, i = D + 0;
        // Layout: D absolute terms, then for each NONZERO offset D difference terms, in order.
        let idx = D;
        for (const o of offs) {
          if (o === 0) continue;
          const wv = W[idx + d]; kern.set(o, wv); sumOther += wv; idx += D;
        }
        kern.set(0, W[d] - sumOther);
        let sum = 0, mass = 0, mom = 0;
        for (const [o, v] of kern) { sum += v; mass += Math.abs(v); mom += Math.abs(v) * o; }
        const cent = mass > 0 ? mom / mass : 0;
        const pk = [...kern.entries()].reduce((x, y) => (Math.abs(y[1]) > Math.abs(x[1]) ? y : x));
        console.log(`      ch ${c} <- ref ${d}:  DC sum ${sum.toExponential(2)}  `
          + `centroid of |k| ${cent >= 0 ? '+' : ''}${cent.toFixed(0)} steps  `
          + `peak tap at ${pk[0] >= 0 ? '+' : ''}${pk[0]} (${pk[1].toExponential(2)})`);
      }
    }
    console.log('      (the centroid is arithmetic on the weights; the +512 above is a regression '
      + 'on four columns — two routes, one object, and they have to agree)');
  }
}
// SHOVE=<kind:mag:start:len>: AN UNMODELLED EXTERNAL FORCE, AND THE COLUMN THE DEPLOYED OBJECT
// STRUCTURALLY CANNOT ANSWER (plan §81).
//
// Everything this project calls "disturbance rejection" so far is a MEASURED, DECLARED, known-ahead
// signal (§71's roll phase) or an undeclared drift that turned out to be 0.9% of the error (§80.6).
// Neither is what an owner means. An owner means: the payload changes unexpectedly, or something
// pushes the machine, and the controller does not explode — and ideally kills the disturbance.
//
// THE DEPLOYED OBJECT'S OUTPUT IS A FUNCTION OF THE COMMANDED REFERENCE AND NOTHING ELSE, so its
// applied correction under a shove is BIT-IDENTICAL to its correction without one. That is worth
// asserting rather than trusting (rule 30) — the state term (§52.27), the instrument tap and the
// feedback layer are all BUILT and all read measured signals, so this is a property of the SHIPPED
// configuration and not of the design, and any of them armed removes it silently.
//
// **IT DOES NOT FOLLOW THAT THE OBJECT "CANNOT EXPLODE", AND AN EARLIER DRAFT OF THIS FILE SAID SO.**
// The disturbance is plainly visible on this machine — in the actual motor torque, the encoder and
// the wind-up — and the servo is a PD on the MEASURED encoder, so the machine responds to it even
// though our object cannot. Two things follow that a bit-identity check cannot see:
//
//   (1) BIT-IDENTICAL OUTPUT IS NOT BIT-IDENTICAL EFFECT. The policy goes on demanding a correction
//       sized for the NOMINAL plant on top of a loop already fighting the shove. The demand is
//       ADDITIVE on one drive, so the policy makes SATURATION MORE LIKELY, not less — and this
//       bench already clips 2.0-6.9% of samples with no disturbance at all (§52.29, §52.30). That
//       is why `sat` is in the table and is the number any safety claim actually rests on.
//   (2) ALL of the rejection is the loop underneath, which the installation already owns. This
//       object contributes exactly zero to it.
//
// So the question worth measuring is: DOES IT GET IN THE WAY? A correction sized for the nominal
// plant is still being applied while the plant is not nominal, and it could be actively wrong
// during and after the event. The table is scored against the CONVENTIONAL machine taking the SAME
// shove, so a disturbance the plant simply finds hard cannot read as the policy failing
// (`PLANTSPAN`'s own discipline).
//
//   kind   `pulse` an impulse (something hit it) | `load` a sustained step (a payload appeared)
//   mag    as a fraction of the servo's OWN tauMax, so it carries no absolute constant
//   start  where in the lap it begins, as a fraction
//   len    how long it lasts, as a fraction of the lap (`load` runs to the lap's end)
if (process.env.SHOVE && host.auto.deployed.distil) {
  const [kind = 'pulse', magS, startS, lenS] = process.env.SHOVE.split(':');
  const mag = Number(magS || 0.05), startF = Number(startS || 0.30), lenF = Number(lenS || 0.02);
  const mm = await machine({ K, E });
  const tauMax = mm.servo.tauMax;
  await mm.l1.destroy(); await mm.l2.destroy();
  // SIZED AGAINST WHAT IS ACTUALLY FLYING AROUND, NOT AGAINST tauMax (rule 17, and the first
  // version of this got it wrong): this loop's PEAK DEMAND runs to tens of times its own torque
  // limit, so a shove at 5% of tauMax is about a thousandth of the joint's working torque and the
  // machine does not notice it — conventional read 1.0717 undisturbed against 1.0711 shoved, a
  // 0.06% move that is a null and not a robustness result. `mag` is therefore a multiple of
  // tauMax and is expected to be of order 1, and the table prints the ratio it actually reached.
  const k0 = Math.round(startF * LAP), k1 = kind === 'load' ? LAP : Math.round((startF + lenF) * LAP);

  // ---- LOADGUARD=<lo:hi>: THE PLANT-SIDE COVERAGE GUARD, ARMED (plan §82).
  //
  // The scale is what THIS COMMISSIONING observed, snapshotted BEFORE any shoved run touches it —
  // a guard calibrated on the disturbance it is meant to catch would be calibrating on its own
  // answer (rule 15). `lo` and `hi` are multiples of that, so nothing here is in the plant's units.
  const LG = process.env.LOADGUARD;
  // The shove is on JOINT 1 only, because a disturbance that loads both joints in the ratio the
  // program already uses is a scaled command and not a disturbance at all.
  let sPrev = 0, sP1 = 0, sP2 = 0;
  const shove = (k, lap, tau, qRef) => {
    if (kind === 'payload') return [mag * (tau ? tau[0] : 0), 0];
    // `drag` at SCORING time, so the same disturbance can be present in training and in the test
    // — which is what makes the reference-correlated experiment a matched comparison rather than
    // two different questions (rule 20). Same construction as `TRAINSHOVE=drag`.
    if (kind === 'drag') {
      const v = qRef ? (qRef[0] - sPrev) : 0;
      if (qRef) sPrev = qRef[0];
      return [mag * tauMax * Math.max(-1, Math.min(1, v / QV0)), 0];
    }
    // `inertia` at scoring time — the same construction, so training and test can carry the
    // identical disturbance and the comparison is matched (rule 20).
    if (kind === 'inertia') {
      const a = qRef ? (qRef[0] - 2 * sP1 + sP2) : 0;
      if (qRef) { sP2 = sP1; sP1 = qRef[0]; }
      return [-mag * tauMax * Math.max(-1, Math.min(1, a / QA0)), 0];
    }
    const kk = ((k % LAP) + LAP) % LAP;
    return (kk >= k0 && kk < k1) ? [mag * tauMax, 0] : [0, 0]; };

  // ---- THE ASSERTION FIRST (rule 27): the applied correction cannot depend on the shove.
  const tapU = () => { const rec = []; const orig = host.auto.act.bind(host.auto);
    host.auto.act = (...a) => { const u = orig(...a); rec.push(u[0], u[1]); return u; };
    return { rec, restore: () => { host.auto.act = orig; } }; };
  const t1 = tapU(); host.setDisturb(null); const clean = await host.run(null, null); t1.restore();

  // ---- LOADGUARD=<lo:hi>: THE PLANT-SIDE COVERAGE GUARD, ARMED (plan §82).
  //
  // THE SCALE IS THE SHIPPED CONFIGURATION'S OWN DISTRESS ON THE PROGRAM IT WILL RUN, which is
  // the exact analogue of the speed span, and the first version got it wrong: `host.loadSeen()`
  // maxes over EVERY scored run of the commissioning — probe runs, cascade scoring, runs with no
  // correction armed — and read 28.48% where the deployed policy's own run reads 7.0%. With a
  // 4x-10x band on 28.48% the fade began at 1.14, and the reading is a FRACTION capped at 1, so
  // the guard could never fire at any load. It was armed, inert, and would have been written up
  // as "no false refusals" (rules 17, 25).
  //
  // Taken from the clean run just measured with the guard DISARMED, so it cannot be calibrated on
  // the disturbance it exists to catch (rule 15), and the clean run is then REPEATED with it armed
  // as the both-halves check — the guard must be inert where nothing is wrong (rule 9).
  let guarded = null;
  if (LG) {
    const [lo, hi] = LG.split(':').map(Number);
    const pol = host.auto.distil;
    pol.loadGuard = true;
    pol.loadLo = Number.isFinite(lo) ? lo : 4;
    pol.loadHi = Number.isFinite(hi) ? hi : 10;
    pol.report.loadMax = clean.loadPeak;
    console.log(`\n  PLANT-SIDE GUARD ARMED: the shipped policy's own run shows drive distress `
      + `${(100 * clean.loadPeak).toFixed(1)}%; fading between ${pol.loadLo}x (${(100 * pol.loadLo * clean.loadPeak).toFixed(1)}%) `
      + `and ${pol.loadHi}x (${(100 * pol.loadHi * clean.loadPeak).toFixed(1)}%) of it`);
    host.setDisturb(null); guarded = await host.run(null, null);
    console.log(`    INERT CHECK — undisturbed with the guard armed: ${guarded.score.toExponential(4)} `
      + `against ${clean.score.toExponential(4)} unarmed  ${guarded.score === clean.score ? '(IDENTICAL)' : `(${(100 * (guarded.score / clean.score - 1)).toFixed(2)}% apart)`}`);
  }
  const t2 = tapU(); host.setDisturb(shove); const shoved = await host.run(null, null); t2.restore();
  let same = t1.rec.length === t2.rec.length && t1.rec.length > 0;
  if (same) for (let i = 0; i < t1.rec.length; i++) if (t1.rec[i] !== t2.rec[i]) { same = false; break; }

  // ...and the CONVENTIONAL machine taking the same shove, which is the denominator.
  const wasArmed = host.auto.deployed.distil;
  host.auto.deployed.distil = false;
  host.setDisturb(null); const bareClean = await host.run(null, null);
  host.setDisturb(shove); const bareShoved = await host.run(null, null);
  host.auto.deployed.distil = wasArmed;
  host.setDisturb(null);

  const rmsOn = (r, lo, hi) => { const [ex, ey] = r.err; let s2 = 0, n = 0;
    for (let k = lo; k < Math.min(hi, ex.length); k++) { s2 += ex[k] * ex[k] + ey[k] * ey[k]; n += 2; }
    return n ? Math.sqrt(s2 / n) : NaN; };
  const peakOn = (r, lo, hi) => { const [ex, ey] = r.err; let p = 0;
    for (let k = lo; k < Math.min(hi, ex.length); k++) p = Math.max(p, Math.hypot(ex[k], ey[k]));
    return p; };
  const evLen = Math.max(1, k1 - k0), rec0 = k1, rec1 = Math.min(LAP, k1 + 3 * evLen);
  // A SUSTAINED load and an all-lap DRAG never end, so neither has a recovery window.
  const hasRec = rec1 > rec0 && kind !== 'drag' && kind !== 'payload' && kind !== 'inertia';

  console.log(`\n  SHOVE — an unmodelled ${kind === 'payload' ? 'PAYLOAD (a fraction of the COMMANDED TORQUE, all lap)' : kind === 'drag' ? 'VISCOUS DRAG (scaled by the COMMANDED JOINT SPEED over its own 99th percentile, all lap)' : kind === 'inertia' ? 'INERTIAL PAYLOAD (scaled by the COMMANDED JOINT ACCELERATION over its own 99th percentile, all lap)' : kind === 'load' ? 'LOAD (sustained)' : 'IMPULSE'} of `
    + `${(mag * 100).toFixed(1)}% of tauMax on joint 1, steps ${k0}-${k1} of ${LAP}:`);
  console.log(`    the applied correction is ${same ? 'BIT-IDENTICAL' : '*** NOT IDENTICAL ***'} `
    + `shoved against clean over ${t1.rec.length.toLocaleString()} decisions — `
    + `${same ? 'in THIS configuration the object reads only the commanded reference' : 'SOMETHING ON THE DEPLOY PATH READS THE PLANT'}`);
  console.log('    that is NOT a stability claim: the demand is additive on one drive, so read `sat` below.');
  const satOf = (r) => (!r.sat ? 'n/a' : r.sat.map((x) => `${(100 * x.fraction).toFixed(1)}%/${x.peak.toFixed(2)}x`).join(' '));
  const row = (label, r, b) => console.log(`    ${label.padEnd(26)}`
    + `during ${rmsOn(r, k0, k1).toExponential(3)} (peak ${peakOn(r, k0, k1).toExponential(3)})   `
    + `after ${hasRec ? rmsOn(r, rec0, rec1).toExponential(3) : '        —'}   lap ${r.score.toExponential(4)}   `
    + `drive ${satOf(r)}  distress ${(100 * (r.loadPeak ?? 0)).toFixed(1)}%`
    + (b ? `   ${(b.score / r.score).toFixed(2)}x over conventional` : ''));
  // ---- SHOVEGAIN=<list>: THE MATCHED CONTROL FOR DOMAIN RANDOMISATION (plan §83.2).
  //
  // Training with random disturbances is PREDICTED above to be equivalent to applying less
  // authority — a regulariser, not a capability. The test is not whether it helps under load; it
  // is whether a UNIFORM GAIN on the CLEAN policy, chosen to give up the same nominal performance,
  // buys the same protection. If it does, §79's ladder is the cheaper way to buy it and the
  // augmentation adds nothing. Same policy, same machine, same shove — only the scalar moves.
  if (process.env.SHOVEGAIN) {
    const pol0 = host.auto.distil;
    const W0 = pol0.W.map((w) => Float64Array.from(w));
    console.log('    the MATCHED GAIN control — the CLEAN policy scaled, scored on both machines:');
    for (const g of process.env.SHOVEGAIN.split(',').map(Number).filter((x) => x > 0)) {
      for (let c = 0; c < pol0.W.length; c++) for (let j = 0; j < pol0.W[c].length; j++) pol0.W[c][j] = W0[c][j] * g;
      host.setDisturb(null); const gc = await host.run(null, null);
      host.setDisturb(shove); const gs = await host.run(null, null);
      console.log(`      gain ${String(g).padStart(5)}  undisturbed ${gc.score.toExponential(4)} `
        + `(${(bareClean.score / gc.score).toFixed(2)}x)   SHOVED ${gs.score.toExponential(4)} `
        + `(${(bareShoved.score / gs.score).toFixed(2)}x)   drive ${satOf(gs)}`);
    }
    for (let c = 0; c < pol0.W.length; c++) for (let j = 0; j < pol0.W[c].length; j++) pol0.W[c][j] = W0[c][j];
    host.setDisturb(null);
  }
  row('conventional, undisturbed', bareClean, null);
  row('conventional, SHOVED', bareShoved, null);
  row('policy, undisturbed', clean, bareClean);
  row('policy, SHOVED', shoved, bareShoved);
  console.log('    "during" and "after" are rms over the event and over 3x its length past it;'
    + ' the policy row is scored against the CONVENTIONAL machine taking the SAME shove.');
  console.log('    `drive` is per joint: SATURATED fraction of scored steps / PEAK demand as a multiple'
    + ' of tauMax. A peak above 1.00x is the drive being asked for torque it does not have.');
}

// PLANTSPAN=<K:E,K:E,...>: THE ROB COLUMN, AND THE AXIS NOTHING HERE HAS EVER MEASURED
// (plan §75). Target 1 is the PROGRAM changing and target 2 the FEEDRATE; both are measured.
// The third thing a customer changes is the MACHINE — it wears, the tool changes, the fixture
// differs, the payload moves — and CLAUDE.md's "change the feedrate, the plant or the path and
// the machine degrades, not gracefully, catastrophically" cites evidence for the first and third
// of those and none at all for the plant.
//
// So: commission ONCE on the bench cell, then deploy that SAME frozen weight vector on a machine
// built at another stiffness, and score it against the CONVENTIONAL machine AT THAT STIFFNESS —
// the same discipline `FEEDSPAN` uses, so a cell the machine simply finds harder cannot read as
// the policy failing. Nothing is recommissioned and nothing is refitted: the deployed object is a
// weight vector and this asks what happens when the plant underneath it is not the one it was
// taught on. The `K:E` of the commissioning cell is the CONTROL and must reproduce the headline.
//
// AND THE AXES ARE NO LONGER ONLY STIFFNESS (plan §84.4). §75 moved K and E and nothing else, so
// "the plant axis degrades gracefully" was a claim about two of the machine's constants. A cell
// may now be written as named overrides — `bl=1e-3`, `drive=8`, `bw=8e-3` — and `machine()`
// already accepts every one of them, so this is a parser change and not a plant change. The
// legacy `K:E` form still parses, and the commissioning cell remains the CONTROL.
if (process.env.PLANTSPAN && host.auto.deployed.distil) {
  // `K:E` (legacy) or `k=v&k=v` (named). A cell containing '=' is named; otherwise it is the pair.
  const cells = process.env.PLANTSPAN.split(',').map((c) => {
    if (!c.includes('=')) {
      const [k2, e2] = c.split(':').map(Number);
      return { over: { K: k2, E: e2 }, label: `K ${k2} / E ${e2}` };
    }
    const over = {};
    for (const kv of c.split('&')) { const [k2, v] = kv.split('='); over[k2.trim()] = Number(v); }
    const full = { K, E, ...over };
    return { over: full, label: Object.entries(over).map(([a, b2]) => `${a} ${b2}`).join(' / ') };
  });
  const pol = host.auto.distil;
  console.log(`\n  PLANT SPAN — one commissioning at K ${K} / E ${E}, the same frozen policy on other machines:`);
  console.log('    (each scored against the CONVENTIONAL machine at ITS OWN cell, so a harder machine is not the policy failing)');
  for (const cell of cells) {
    const over = cell.over, k2 = over.K ?? K, e2 = over.E ?? E;
    const h2 = makeArmHost({
      makeMachine: async () => {
        const m = await machine(over);
        const rc = commissionComp(m.arm, m.servo);
        const c0 = path.at(0); const [q1, q2] = m.arm.ik(c0.x, c0.y, true);
        settle(m.arm, m.servo, q1, q2);
        return { arm: m.arm, l1: m.l1, l2: m.l2, servo: m.servo, rc };
      },
      path, lap: LAP, K: k2, centre: (await machine(over)).arm.ik(12, 0, true),
      classic: false, maxDepth: 0, demo: null, lapMemory: false, distil: DISTIL,
      distilReplaces: REPLACE, grade: GRADE });
    const tr = (await h2.distilRuns({ paths: [path] }))[0];
    const hp = heldPolicy(pol, tr);
    const b = await tr.run(null), w = await tr.run(hp, { tap: hp.tap });
    const same = Object.entries(over).every(([a, b2]) => (a === 'K' ? b2 === K : a === 'E' ? b2 === E : false))
      && k2 === K && e2 === E;
    // ---- IS THE DRIFT DETECTABLE FROM WHAT THE SHOP ALREADY MEASURES? (plan §75.5)
    //
    // Graceful is worth much less than graceful-AND-detectable: on every row here the object goes
    // on applying a correction sized for a different machine and says nothing, because the
    // coverage guard fades on commanded SPEED and there is no plant analogue. The quantity a shop
    // has is the PART — and §74 just priced reading it at 64 touches. So the delivered error is
    // re-read at that resolution, evenly spaced exactly as the probe takes it, and reported
    // beside the full-rate number: if the probe sees the rise, a first-article check is the
    // recommission trigger and no new instrument is needed.
    const probeRms = (r, kk) => {
      const e = r.err || null;
      if (!e || !e.length) return null;
      const L = e[0].length; let s2 = 0, n = 0;
      for (let i = 0; i < kk; i++) {
        const j = Math.round(i * L / kk) % L;
        for (const ch of e) { s2 += ch[j] * ch[j]; n++; }
      }
      return Math.sqrt(s2 / n);
    };
    const wp = probeRms(w, 64);
    console.log(`    ${cell.label.padEnd(22)}  `
      + `${b.score.toExponential(4)} -> ${w.score.toExponential(4)}   ${(b.score / w.score).toFixed(2)}x`
      + (wp === null ? '' : `   64-touch read ${wp.toExponential(4)}`)
      + `${same ? '   <- the commissioning cell, the CONTROL' : ''}`
      + `${b.score / w.score < 1 ? '   WORSE THAN DOING NOTHING' : ''}`);
  }
}
// HELDOUT=1: score the deployed policy on the two programs no diet contains — the rounded
// rectangle and the circle — so a diet that lifts the square can be told from one that memorises
// its edges (plan §52.27).
if (process.env.HELDOUT === '1' && host.auto.deployed.distil) {
  console.log('\n  held-out programs, the deployed policy against the bare machine:');
  await scoreSet('held-out', host.auto.distil, heldOut, heldNames);
}
if (process.env.LEARN && host.auto.deployed.distil) {
  const before = await host.run(null, null);
  const live = await host.liveRuns();
  const dietRuns = await host.distilRuns();
  console.log(`\n  BEFORE learning on the square (${process.env.LEARNMODE || 'diet'} mode):`);
  await scoreSet('held-out', host.auto.distil, heldOut, heldNames);
  await scoreSet('diet', host.auto.distil, dietRuns, dietRuns.map((t, i) => `polygon ${i}`));
  const lr = await host.auto.learnLive(live, { passes: +process.env.LEARN, mode: process.env.LEARNMODE || 'diet',
    onPass: (p2) => console.log(`    pass ${p2.pass}: ${p2.score.toExponential(4)} on the live program${p2.accepted ? '' : ' — not kept'}`) });
  const after = await host.run(null, null);
  console.log(`\n  learned on the live program (${lr.passes} passes, ${lr.changed ? 'policy replaced' : 'policy unchanged'}): square ${before.score.toExponential(4)} -> ${after.score.toExponential(4)}   ${(rep.base / after.score).toFixed(2)}x over the conventional machine (was ${(rep.base / before.score).toFixed(2)}x)`);
  console.log(`  machine samples now ${host.samples().samples.toLocaleString()} (${(host.samples().samples / 60000).toFixed(1)} machine-min)`);
  console.log(`\n  AFTER learning on the square:`);
  await scoreSet('held-out', host.auto.distil, heldOut, heldNames);
  await scoreSet('diet', host.auto.distil, dietRuns, dietRuns.map((t, i) => `polygon ${i}`));
}
const pol = host.auto.built.distil;
if (pol && pol.W) {
  console.log('\n  the policy on its OWN training programs (BARE machine -> with the policy; the square above is over the CONVENTIONAL machine):');
  const runs = await host.distilRuns();
  for (let i = 0; i < runs.length; i++) {
    const tr = runs[i];
    const base = await tr.run(null);
    // EVALUATED AS IT DEPLOYS: once per decision and HELD between, never at every step. The
    // deployed object holds (AutoStack's distil.stride); reading the policy at every step
    // evaluates the fit at phases it never saw and scores an object that does not ship.
    const hpT = heldPolicy(pol, tr);
    const withP = await tr.run(hpT, { tap: hpT.tap });
    // THE SIZE OF THE CONTROL AGAINST THE SIZE OF THE ERROR IT CANCELS, in the same units
    // (joint rad, rms over the lap): a correction much smaller than the error it removes is
    // a scale fault somewhere, not a clever controller.
    if (!pol.stateDim) { const hp = heldPolicy(pol, tr); let s2 = 0; for (let k = 0; k < tr.lap; k++) { const u = hp.at(k); s2 += u[0] * u[0] + u[1] * u[1]; }
      console.log(`      control rms ${Math.sqrt(s2 / tr.lap).toExponential(3)} rad against bare error rms ${base.score.toExponential(3)} rad (ratio ${(Math.sqrt(s2 / tr.lap) / base.score).toFixed(2)})`); }
    console.log(`    program ${i} (lap ${tr.lap}): ${base.score.toExponential(4)} -> ${withP.score.toExponential(4)}`
      + `   ${(base.score / withP.score).toFixed(2)}x` + (withP.sat != null ? `   drive saturated ${(100 * withP.sat).toFixed(1)}% of steps (bare ${(100 * base.sat).toFixed(1)}%)` : ''));
  }
  console.log('\n  reading: helps its own programs and harms the square -> transfer (diet/window);'
    + '\n           harms even its own programs -> the fit or the deploy path (units, sign).');
} else console.log('\n  no policy was fitted, so the split cannot be taken.');
if (LOO) {
  console.log('\n  LEAVE-ONE-OUT over the six training programs (fresh prefixes, converged once each):');
  const runs = await host.distilRuns();
  const a = host.auto;
  const uMax = a.authority('distil');
  const prefixes = [];
  for (let i = 0; i < runs.length; i++) {
    const tr = runs[i];
    // THE LADDER'S OWN ENGINE where the host supplies it, so the folds measure the route that
    // ships and not a second one (the first version converged with HarmonicFF at stride 1).
    let r, at;
    if (tr.converge) { r = await tr.converge(); at = r.at; }
    else { const h = new HarmonicFF({ lap: tr.lap, channels: 2, uMax, ...a.hffOpts }); r = await h.commission(async (corr) => tr.run(corr)); at = (k) => h.at(k); }
    const pre = new Array(tr.lap); for (let k = 0; k < tr.lap; k++) pre[k] = at(k);
    prefixes.push({ pre, gain: r.best > 0 ? r.base / r.best : 0 });
    console.log(`    converged run ${i}: ${prefixes[i].gain.toFixed(2)}x`);
  }
  // The square's own references and speeds, for scoring a fold-policy off its diet.
  const R = host.refsFor(m0.arm), L = LAP;
  const sqRef = (k) => R[((k % L) + L) % L];
  const sqSpeed = (k) => { const c = path.at(k); return Math.hypot(c.vx, c.vy); };
  const opts = a.distilOpts;
  const rows = [];
  for (let i = 0; i < runs.length; i++) {
    const shipped = host.auto.built.distil;
    const S0 = host.auto.built.stack ? host.auto.built.stack.sample : 1;
    const pol = new DistilPolicy({ channels: 2, refDim: shipped ? shipped.refDim : 2,
      offsets: shipped ? shipped.offsets : opts.offsets, signOffsets: shipped ? shipped.signOffsets : opts.signOffsets,
      ridge: opts.ridge, uMax, online: opts.online !== false, adaptSign: opts.adaptSign });
    pol.stride = shipped ? shipped.stride : S0;
    for (let j = 0; j < runs.length; j++) {
      if (j === i || prefixes[j].gain <= 1.5) continue;
      pol.addProgram({ refAt: runs[j].refAt, n: runs[j].lap, prefix: prefixes[j].pre, speedAt: runs[j].speedAt, stride: pol.stride, closed: !!runs[j].closed });
    }
    const fit = pol.fit();
    if (!fit.deploy) { console.log(`    fold ${i}: fit refused — ${fit.reason}`); continue; }
    const tr = runs[i];
    const b = await tr.run(null);
    const hpL = heldPolicy(pol, tr);
    const w = await tr.run(hpL, { tap: hpL.tap });
    const sqB = await host.run(null, null);
    const sqW = await host.run(heldPolicy(pol, null, sqRef, sqSpeed), 'distil');
    rows.push({ i, held: b.score / w.score, square: sqB.score / sqW.score, r2: fit.heldOutR2.map((v) => +v.toFixed(3)) });
    console.log(`    fold ${i}: held-out program ${(b.score / w.score).toFixed(2)}x   square ${(sqB.score / sqW.score).toFixed(2)}x   R² ${JSON.stringify(rows[rows.length - 1].r2)}`);
  }
  if (rows.length) {
    const geo = (xs) => Math.exp(xs.reduce((s2, x) => s2 + Math.log(x), 0) / xs.length);
    console.log(`\n  geometric mean: held-out polygon ${geo(rows.map((r) => r.held)).toFixed(2)}x   square ${geo(rows.map((r) => r.square)).toFixed(2)}x`);
  }
}
await host.dispose(); await m0.l1.destroy(); await m0.l2.destroy();
