/**
 * @file THE DEPLOYED OBJECT ON WOOD-BERRY — the plant this project loses on, and the one §62
 * measured as REACHABLE by a causal map of the commanded reference that also TRANSFERS.
 *
 * WHY THIS PLANT AND WHY THIS TEST. `headroom.mjs` reaches 2.65x here with the machine in the
 * loop against a pilot that delivers 0.39x, and §62.3 fitted the oracle's correction onto a
 * window of the commanded reference and read **2.62x at home and 2.59x on a program with a
 * different clock and different magnitudes** — a 1% loss across a warp, where the BARREL's
 * equivalent collapsed from 14.70x to 0.16x. Those two plants therefore split on the one
 * property that decides whether the shipped object can carry a result, and §63.9 settled the
 * barrel: its correction is learnable from its own program and does not carry from others. This
 * asks the column the same question through the LADDER, which is the harder and more honest form
 * — a diet of four OTHER setpoint programs, scored on the production scenario.
 *
 * IT DRIVES THROUGH THE SHARED `ladder()`, THE SHARED `wbSpec` AND THE SHARED `distilkit.mjs`
 * (rule 61). The plant's routing, the ladder's driver, the window rule and the report are all
 * written once; what this file owns is the DIET, which is the only genuinely plant-specific part.
 *
 * THE DIET IS SETPOINT PROGRAMS, CYCLED. A distillation column's job is exactly a sequence of
 * composition setpoint changes, so a training run is an ordinary operating pattern rather than a
 * contrivance — and each is CYCLED because the rung's teacher converges a lap-indexed correction.
 * The production scenario is a unit step on the top loop at t=0 and on the bottom at t=1000, run
 * to 3000; none of the four training programs is that, and all are held out of it.
 *
 * AND THE DIET DOES NOT BRACKET A RATE, BECAUSE §63.7-63.8 MEASURED THAT AND IT LOST TWICE. On
 * the barrel, spreading the diet's rate around production made the machine worse (0.479x ->
 * 0.305x), and equalising the rows to remove the row-count confound made it worse again (0.266x)
 * — refuting the row-count account by its own repair. What the three diets there ordered by was
 * DISTANCE from the production program, so this diet varies the STEP PATTERN at the production
 * scenario's own timescale rather than laddering a rate.
 *
 * KNOBS: WIN (reach in raw steps, overriding the derivation), STD, ONLINE, RIDGE, MIMO (the
 * off-diagonal solve, which §62.4 measured as the ONLY thing that moves this plant's cascade —
 * 0.39x -> 0.68x — while its dead times and its horizon are both inert). Asserts the plant is not
 * made worse and reports everything else.
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { wbSpec } from './rigs/specs.mjs';
import { deriveWindow, reportDistil, priceFrom, ridgeLadder, gainLadder, teacherReuse, carrier, teachLaps, teachAvg, dietN, emitRow } from './rigs/distilkit.mjs';
import { dirInvFor } from './rigs/dirinvkit.mjs';
import { oracleConverge, oracleTeach } from './rigs/oracleteach.mjs';
import * as WB from './rigs/woodberry-rig.mjs';

// THE ORACLE TEACHER, AND THIS PLANT IS THE SHARP PREDICTION (plan §73.13). §73.12 read the mill
// and the barrel as splitting on WHICH HALF of the pilot is broken: the mill's forecast is poor
// (R² lead0 0.062) and its inverse good (the cascade delivers 1.74x), so replacing the forecast
// works; the barrel's forecast is excellent (0.970) and its cascade delivers 1.05x, so there is
// nothing for the port to replace. This column's cascade delivers **0.39x** — worse than the
// barrel's — so that account predicts it fails here at least as badly. A prediction made before
// the measurement is the only kind worth making.
const ORACLE = process.env.ORACLE === '1';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-column: SKIPPED (full tier only — one commissioning per run)\n');
  process.exit(0);
}

const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
console.log('\ndistil-column: the DEPLOYED object on the plant we lose on\n');

// ---------------------------------------------------------------- the diet
// Four setpoint patterns, each a closed cycle of composition targets, at the production
// scenario's own timescale. They differ in WHICH loop moves, WHEN, and BY HOW MUCH — the
// dimensions a column's operator actually varies — and none of them is the scored scenario.
const SEG = env('SEG', 750);
const SHIPPED_DIETS = [
  [[0.8, 0.0], [0.8, 0.8], [0.0, 0.8], [0.0, 0.0]],
  [[1.2, 0.4], [0.4, 1.2], [1.2, 1.2], [0.4, 0.4]],
  [[0.6, 1.0], [1.4, 0.2], [0.2, 0.6], [1.0, 1.4]],
  [[1.0, 0.0], [0.0, 1.0], [1.0, 1.0], [0.5, 0.5]],
];
// DSEED=<n>: DRAW THE DIET, BECAUSE THE SEED VARIES NOTHING HERE (plan §84.8).
//
// Every headline on this plant is ONE commissioning draw, and `test/pilot/spread.mjs` cannot make
// it a distribution: this rig is DETERMINISTIC — §84.3 measured two runs from `fresh()` agreeing
// bit-exactly — and the cascade it would seed REFUSES, so nothing downstream of a seed moves.
// `distil-tank.mjs` has the recorded signature of exactly this (three byte-identical "seeds",
// which is one draw three times, rule 61 aimed at a seed).
//
// What DOES vary between two commissionings of the same plant is the DIET — which four patterns
// the engineer happened to pick — so that is the random variable, drawn from the same design
// space the shipped diet occupies: four closed cycles of four composition targets on the same
// [0, 1.4] grid. Unset is the shipped diet and byte-identical.
const DSEED = process.env.DSEED ? +process.env.DSEED : null;
const DIETS = DSEED === null ? SHIPPED_DIETS : (() => {
  let st = (DSEED * 2654435761) >>> 0;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const grid = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.4];
  const pick = () => grid[Math.floor(rnd() * grid.length)];
  return Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => [pick(), pick()]));
})();
if (DSEED !== null) console.log(`  DIET DRAW ${DSEED}: ${JSON.stringify(DIETS)}\n`);
// DIETADD=<n>: ENLARGE the diet by n more recipes drawn from the same design space (plan §122,
// roadmap step 3) — the 10-17% per-program cost §84.5 priced, asked whether it moves target 1.
// Drawn from a fixed seed so the added recipes are the same on every run; unset is byte-identical.
const DIETADD = process.env.DIETADD ? +process.env.DIETADD : 0;
if (DIETADD) {
  let st = (17 * 2654435761) >>> 0;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const grid = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.4];
  const pick = () => grid[Math.floor(rnd() * grid.length)];
  for (let i = 0; i < DIETADD; i++) DIETS.push(Array.from({ length: 4 }, () => [pick(), pick()]));
  console.log(`  DIET ENLARGED by ${DIETADD}: ${JSON.stringify(DIETS.slice(-DIETADD))}\n`);
}
const LAP = (rec) => SEG * rec.length;

/** One pattern's setpoints at raw step k, cycled at its own lap, stepping rather than ramping —
 *  which is what a column is actually commanded and what the published scenario does. */
const refOf = (rec) => (k) => {
  const lap = LAP(rec);
  const kk = ((k % lap) + lap) % lap;
  return rec[Math.floor(kk / SEG)];
};

/** Settle the column at a pattern's own start, so no run is scored across its startup (rule 13). */
function settled(rec) {
  const c = WB.makeColumn();
  const s0 = refOf(rec)(0), u0 = WB.inputsFor(s0[0], s0[1]);
  for (let i = 0; i < 3000; i++) c.step(u0);
  return c;
}

// ---------------------------------------------------------------- the window
// The plant's own measured settle, from `headroom.mjs`'s step response — no probe in the route.
const SETTLE = 994;
const lapMin = Math.min(...DIETS.map(LAP));
const { reach: REACH, offsets: OFFSETS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin, win: process.env.WIN === undefined ? undefined : env('WIN') });
console.log(`  window reach ±${REACH} raw steps  (settle ${SETTLE}, shortest diet lap ${lapMin}, `
  + `min(0.61·settle, lap/8) = ${RULE})`);
console.log(`  ${OFFSETS.length} offsets per channel, ${DIETS.length} training patterns at SEG `
  + `${SEG}, none of them the published scenario (steps at 0 and ${WB.T_STEP2}, run to `
  + `${WB.T_END})\n`);

/** The training diet as the rung consumes it: a lap, its reference, and a run closure. */
// LAPS PER TEACHER CALL (plan §73.2). One lap settles under the correction just handed over, the
// rest are scored and the last is the record the teacher inverts. With the plant carried the
// first is the only settle there is, so `TLAPS=2` asks whether the second scored lap is buying
// noise reduction worth a third of the commissioning. Unset is 3 and byte-identical.
const TLAPS = teachLaps();
// TAVG=<n>: average the teacher's record over the last n laps (plan §80.7, §84.1). The mechanism,
// the measurement and the two controls live in `distilkit.mjs` beside the knob, because §80.7's
// claim — a 0.9% NON-REPEATING component costs the commissioned result 1.6-2.5x — is about any
// plant with one and not about the barrel it was measured on. Unset is 1 and byte-identical.
const TAVG = teachAvg(TLAPS);
const distilRuns = (auto) => dietN(DIETS).map((rec) => {
  const lap = LAP(rec), ref = refOf(rec);
  // ONE PLANT FOR THIS RUN, CARRIED ACROSS THE TEACHER'S CALLS (plan §72.15).
  const hold = carrier(() => settled(rec));
  // THE PLANT'S OWN DRIVE LOOP, NAMED ONCE (plan §101). It re-settles per call rather than using
  // `hold()`, because the iteration compares scores ACROSS passes and a carried plant makes pass
  // k's starting point pass k-1's ending one — the confound §72.15's carry was allowed precisely
  // because `run` does not have it. Verbatim from the closure that was inline inside
  // `oracleConverge`, so `ORACLE=1` is byte-identical across the hoist.
  const DRIVE = async ({ pre, active = false, uOut = null, trace = false, onStep = null }) => {
    const c = settled(rec);
    let s2 = 0, n = 0;
    const out = trace ? Array.from({ length: lap }, () => [0, 0]) : null;
    for (let k = 0; k < TLAPS * lap; k++) {
      const kk = ((k % lap) + lap) % lap;
      if (onStep) onStep(kk);
      const sp = ref(k), u0 = WB.inputsFor(sp[0], sp[1]);
      const look = (o) => { const t = ref(k + o); return WB.inputsFor(t[0], t[1]); };
      const a = active ? auto.act({ look, lookRaw: look, k }) : null;
      const u = [0, 1].map((j) => pre[j][kk] + (a ? (a[j] || 0) : 0));
      if (uOut && a) for (let j = 0; j < 2; j++) uOut[j][kk] = a[j] || 0;
      c.step(u0.map((v, j) => v + u[j]));
      const want = WB.outputsFor(u0);
      if (trace && k >= (TLAPS - 1) * lap) for (let j = 0; j < 2; j++) out[kk][j] = c.y[j] - want[j];
      if (k >= (TLAPS - 1) * lap) for (let j = 0; j < 2; j++) { s2 += (c.y[j] - want[j]) ** 2; n++; }
    }
    return { score: Math.sqrt(s2 / n), rec: out };
  };
  return {
    lap,
    refAt: (k) => { const s = ref(k); return WB.inputsFor(s[0], s[1]); },
    // THE LAP IS CLOSED AND MUST SAY SO. `refAt` above wraps at `lap`, but `addProgram` clamps
    // the window at index 0 unless the run declares itself closed — so without this the fit skips
    // the first REACH samples of every recipe (measured: 939 of 7500 on the barrel, 376 of 3000
    // on the column, each equal to the window's own reach) AND the deployed policy then reads
    // wrapped windows at every lap start that the fit never saw. That is plan §52.14's defect
    // exactly, which cost the arm 19% and the soft cell 2.61x -> 3.98x, reappearing because a new
    // host is the one place the flag has to be set by hand.
    closed: true,
    // WHAT ONE TEACHER CALL COSTS THIS PLANT, so the budget gate can price the rung BEFORE it
    // runs (plan §124): `run` drives TLAPS laps per call on a carried plant, and the carrier
    // settles it ONCE, on the first call (`settled` is 3,000 steps).
    callSteps: TLAPS * lap, settleSteps: 3000,

    run: async (corr) => {
      const c = hold();
      let s2 = 0, n = 0;
      const err = [0, 1].map(() => new Float64Array(lap));
      for (let k = 0; k < TLAPS * lap; k++) {
        const kk = ((k % lap) + lap) % lap;
        const sp = ref(k), u0 = WB.inputsFor(sp[0], sp[1]);
        const u = corr ? corr.at(kk) : [0, 0];
        c.step(u0.map((v, j) => v + (u[j] || 0)));
        const want = WB.outputsFor(u0);
        // The last lap is the RECORD the teacher inverts; the last two are what it is SCORED on,
        // so a run is never scored across the lap that established its own operating point.
        if (k >= (TLAPS - TAVG) * lap) for (let j = 0; j < 2; j++) err[j][kk] += (c.y[j] - want[j]) / TAVG;
        if (k >= (TLAPS - 1) * lap) for (let j = 0; j < 2; j++) { s2 += (c.y[j] - want[j]) ** 2; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },

    // The plant's own drive loop for the oracle teacher; the iteration is in `oracleteach.mjs`.
    // It re-settles per call rather than using `hold()`, because the iteration compares scores
    // ACROSS passes and a carried plant makes pass k's starting point pass k-1's ending one —
    // which is the confound §72.15's carry was allowed precisely because `run` does not do.
    // THE PLANT'S OWN DRIVE LOOP, NAMED ONCE AND HANDED TO BOTH TEACHERS (plan §101, following
    // `distil-mill.mjs` and `distil-barrel.mjs`). It was INLINE and anonymous inside
    // `oracleConverge`, which is why `_iteratePolicy` could not be asked on this plant at all —
    // not a decision, just the one thing that was never hoisted (rule 61).
    ...(ORACLE ? { converge: oracleConverge({
      auto, lap, nc: 2, passes: +(process.env.OPASSES || 8), debug: process.env.ODBG === '1',
      drive: DRIVE,
    }) } : {}),
    // PARAM=1: the lap-free teacher. `oracleTeach` builds `run` AND `teach` from the SAME closure
    // `oracleConverge` takes, so a plant the oracle can teach can be taught parametrically with no
    // plumbing of its own — and its `run` deliberately overrides the one above, because the two
    // want opposite index orders and handing `_iteratePolicy` the wrong one reads `undefined` at
    // every step without throwing (plan §90.3).
    ...(PARAM ? oracleTeach({ auto, lap, nc: 2, drive: DRIVE }) : {}),
  };
});

/**
 * PARAM=1: THE LAP-FREE TEACHER, AND A PREDICTION THIS PROJECT WROTE DOWN FIRST (plan §90.3c,
 * reached in §101).
 *
 * `AutoStack._iteratePolicy` iterates a POLICY rather than a lap table, and §90.3c bounded it by
 * measurement rather than by argument: the increments come from the CASCADE, so *the lap-free
 * teacher can be no better than the cascade it takes them from*. The arm's cascade deploys at
 * 1.33-1.34x and the teacher works; the mill's is 1.74x and it works; the barrel's is the standing
 * refusal at 1.05x and it produced `passes 1` with all four runs dropped at every damping scale.
 *
 * It then named two plants it had NOT run, so the account could be read against what happens:
 * *the COLUMN (0.39x) and the QUADRUPLE TANK (refuses every layer) should produce nothing, and if
 * the column works anyway this account is wrong.*
 *
 * **IT WAS UNTESTABLE RATHER THAN UNRUN, WHICH IS A DIFFERENT STATE (rule 25).** Neither harness
 * wired `oracleTeach` at all — `PARAM` and `oracleTeach` each appeared zero times in both files —
 * so the prediction could not have been checked however many times it was quoted. Both DID already
 * have a suitable drive closure, passed INLINE and anonymous to `oracleConverge`; the mill and the
 * barrel NAMED theirs so both teachers could share one loop, which is rule 61, and that is the
 * whole of the change here.
 *
 * AND A CASCADE MUST EXIST FOR THE TEACHER TO TAKE INCREMENTS FROM: this plant runs `depth: 0` by
 * default, and §90.3 records that the first mill run under `PARAM=1` returned an increment of
 * exactly zero for precisely that reason, now a throw rather than a `teacher 1.000x, rows 0`
 * (rule 25, third time in this project). So `PARAM` raises the depth exactly as `ORACLE` does.
 */
const PARAM = process.env.PARAM === '1';

// THE TEACHER-FREE ①d RUNG, ARMED BY `DIRINV=1` AND PLACED FIRST BY `DIRFIRST=1` (plan §119).
// Its diet, inverse and window come from this plant's `dirinvall.mjs` entry through the one
// shared wiring; unset spreads to nothing and the ladder is byte-identical (rule 21).
const DI = await dirInvFor(/Wood-Berry column/i);

const spec = { ...wbSpec,
  ...DI,
  // NO CASCADE: this rung's teacher is `hff`, so the cascade would be commissioned,
  // scored and then REPLACED by the rung that wins (plan §73.1). `DEPTH=2` is the control.
  // `ORACLE=1` needs one, because the oracle teacher IS the commissioned pilot iterated.
  depth: (ORACLE || PARAM) ? 1 : 0,
  ...(process.env.MIMO === '1'
    ? { pilotOpts: { ...(wbSpec.pilotOpts || {}), mimo: true } } : {}),
  distil: { refDim: 2, ridge: env('RIDGE', 1e-6), offsets: OFFSETS,
    // THE ENGINE NEEDS BOTH HALVES AND MY FIRST RUN PROVED IT (plan §101). `AutoStack`'s gate is
    // `!!this.distilOpts.parametric && runs.every((t) => t.teach)`, so wiring `teach` alone takes
    // the hff route SILENTLY and reports `engine hff` — which is what the first PARAM=1 run here
    // printed, at 3.96x byte-identical to the control, looking exactly like "the parametric engine
    // ran and changed nothing". `distil-mill.mjs` says so in its own header and I wired it anyway;
    // rule 25 is not a thing you read once (plan §90.3).
    ...(PARAM ? { parametric: true, passes: +(process.env.PPASSES || 4) } : {}),
    // THE CASCADE IS THE TEACHER AND NOT A CANDIDATE TO SHIP (plan §73.14). A cascade exists on
    // these plants only because `ORACLE=1` asks for one to iterate; judged as a RUNG it changes
    // the bar the distilled policy must clear, and on the quadruple tank that is the difference
    // between shipping 2.59x and shipping the cascade's 1.05x with the policy refused for not
    // beating it. `lib/flexisim/autohost.js` has defaulted this to TRUE since the rung was built,
    // for exactly this reason; the plant harnesses never set it because they never had a cascade.
    ...(ORACLE ? { teacherOnly: true } : {}),
    ...(ridgeLadder() ? { ridges: ridgeLadder() } : {}),
    ...(gainLadder() ? { gains: gainLadder() } : {}),
    ...(teacherReuse() ? {} : { teacherReuse: false }),
    ...(process.env.STD === '1' ? { standardize: true } : {}),
    ...(process.env.ONLINE === '0' ? { online: false } : {}) },
  distilRuns };

announce();
const price = priceFrom();
if (process.env.MIMO === '1') console.log('  pilotOpts + {"mimo":true}');
const { rep, auto, scoreOn } = await ladder(spec);
// Closed the moment the ladder returns: `reportDistil`'s in-sample column re-runs every
// training program, and that is SCORING rather than commissioning (plan §72).
price.close({ dt: WB.DT, unit: 'min', rep });

const { inSample } = await reportDistil({ rep, runs: distilRuns(),
  nFeat: OFFSETS.length * 2 + 1, auto });

// ------------------------------------------- target 1, on a setpoint schedule it never scored
/**
 * TARGET 1's OWN BAR (plan §88.1), on the plant this project lost on for its whole history and
 * now wins. The SAME commissioned weight vector — no refit — through `scoreOn`, which is the
 * shared driver's own verify loop rather than a fourth copy of it (rule 61).
 *
 * The held-out program REVERSES THE ORDER OF THE TWO LOOPS: the shipped scenario steps channel 0
 * at k = 0 and channel 1 at k = 1000, and this one steps channel 1 first. Magnitudes are held at
 * 1, so it sits in the same input box, and the only thing that moves is WHICH INTERACTION the
 * column has to ride out — which on a plant whose whole difficulty is its 2x2 coupling (RGA 2.01,
 * measured with no model in the route) is the axis a transfer claim has to survive.
 */
const heldSet = (k) => [k >= 1500 ? 1 : 0, 1];
const heldRef = (k) => { const sp = heldSet(Math.min(k, WB.T_END - 1));
  return WB.inputsFor(sp[0], sp[1]); };
const heldFresh = () => { const c = WB.makeColumn(); const sp = heldSet(0);
  const u = WB.inputsFor(sp[0], sp[1]); for (let i = 0; i < 3000; i++) c.step(u); return c; };
const hOff = await scoreOn({ refAt: heldRef, fresh: heldFresh, N: WB.T_END }, { armed: false });
const hOn = await scoreOn({ refAt: heldRef, fresh: heldFresh, N: WB.T_END });
const xProg = rep.base / rep.best, xHeld = hOff.score / hOn.score;
console.log(`\n  TARGET 1 — the SAME object on a setpoint schedule it never scored, no refit`);
console.log(`    scored     channel 0 at k=0, channel 1 at k=1000   `
  + `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}   ${xProg.toFixed(3)}x`);
console.log(`    held out   channel 1 at k=0, channel 0 at k=1500   `
  + `${hOff.score.toExponential(3)} → ${hOn.score.toExponential(3)}   ${xHeld.toFixed(3)}x`
  + `   ${(xHeld / xProg).toFixed(3)} of the scored factor\n`);
emitRow(rep, auto, { t1: xHeld / xProg, t1Worse: xHeld < 1 });
check('target 1: the held-out schedule is not made worse', hOn.score <= hOff.score * 1.02,
  `${hOff.score.toExponential(3)} → ${hOn.score.toExponential(3)} = ${xHeld.toFixed(3)}x`);
/**
 * AND THE BOUND IS PRINTED RATHER THAN ASSERTED, WHILE "NOT MADE WORSE" IS ASSERTED (plan §88.4).
 * Target 1's 1.3x bound is measured as MISSED on three plants of seven — the Wood-Berry column at
 * 0.339 of its scored factor, the extruder barrel, and the real flexible arm, which is made
 * WORSE on two held-out programs of four. A suite pinned to a bar plants are known to fail is
 * permanently red and hides the next real failure (rule 3), and this project does not redden the
 * suite for target 4 either, which is missed on six plants of eight. What IS asserted is the
 * MANDATE's own clause — nothing made worse — and the bound's verdict per plant is carried in
 * `objtable.mjs`'s TARGET 1 column, where a count nobody can re-derive would otherwise become a
 * preference (rule 30).
 */
console.log(`    TARGET 1's 1.3x BOUND: ${xHeld >= xProg / 1.3 ? 'MET' : 'NOT MET'} — the held-out `
  + `schedule delivers ${(xHeld / xProg).toFixed(3)} of the scored factor`);

// ---------------------------------------------------------------- the PUBLISHED comparison
// THE LADDER SCORES AN RMS AND THE LITERATURE SCORES AN IAE, AND THEY ARE NOT THE SAME CLAIM
// (rule 19). Target 7's open clause is "beat the published BLT on Wood-Berry", where the numbers
// on record are IAE 43.90 for doing nothing and 51.95 for the BLT-tuned PI pair, so a 2.44x on
// the ladder's own metric does not settle it and must not be quoted as though it did.
//
// AND THE FIRST VERSION OF THIS BLOCK COMPARED TWO CONVENTIONS (rule 20). It warmed the column
// 3,000 steps before scoring — right by rule 13 — and then set that against `runBLT()`, which
// starts from a FRESH column, so a warmed candidate was being compared with a cold incumbent.
// It showed as doing nothing reading 29.12 where this project's record says 43.90, and the gap
// IS the startup transient: 1.51x, larger than anything being claimed. So there is ONE scoring
// loop here, every controller goes through it, and BOTH conventions are reported — the cold one
// because it is what the published numbers mean, the warmed one because it is what rule 13 says
// a controller should be scored on.
if (rep.distil && rep.distil.policy) {
  const pol = rep.distil.policy;
  /** One scoring loop. `ctrl(k, ref, c)` returns the correction to add to the reference. */
  const iaeOf = (ctrl, warm) => {
    const c = WB.makeColumn();
    if (warm) {
      const sp0 = WB.setpointAt(0), u0 = WB.inputsFor(sp0[0], sp0[1]);
      for (let i = 0; i < 3000; i++) c.step(u0);
    }
    const st = ctrl ? ctrl() : null;
    let iae = 0;
    for (let k = 0; k < WB.T_END; k++) {
      const sp = WB.setpointAt(k), ref = WB.inputsFor(sp[0], sp[1]);
      const u = st ? st(k, sp, c) : [0, 0];
      c.step(st && st.absolute ? u : ref.map((r, j) => r + (u[j] || 0)));
      iae += (Math.abs(sp[0] - c.y[0]) + Math.abs(sp[1] - c.y[1])) * WB.DT;
    }
    return iae;
  };
  /** The published baseline, as `woodberry-rig.mjs` states it — same gains, same anti-windup,
   *  same box — driven through the loop above so the convention is shared, not re-stated. */
  const bltCtrl = () => {
    const KC = [0.375, -0.075], TI = [8.29, 23.6], I = [0, 0];
    const f = (k, sp, c) => {
      const u = [0, 0];
      for (let i = 0; i < 2; i++) {
        const e = sp[i] - c.y[i];
        I[i] += e * WB.DT;
        let v = KC[i] * (e + I[i] / TI[i]);
        if (v > WB.UBOX.hi) { I[i] -= (v - WB.UBOX.hi) * TI[i] / KC[i]; v = WB.UBOX.hi; }
        if (v < WB.UBOX.lo) { I[i] -= (v - WB.UBOX.lo) * TI[i] / KC[i]; v = WB.UBOX.lo; }
        u[i] = v;
      }
      return u;
    };
    f.absolute = true;   // the PI pair commands the input outright, not a correction to it
    return f;
  };
  const polCtrl = () => (k) => pol.actLook((o) => {
    const sp = WB.setpointAt(Math.min(WB.T_END - 1, Math.max(0, k + o)));
    return WB.inputsFor(sp[0], sp[1]);
  });
  const row = (warm) => ({ nothing: iaeOf(null, warm), blt: iaeOf(bltCtrl, warm),
    pol: iaeOf(polCtrl, warm) });
  const cold = row(false), warm = row(true);
  console.log('\n  the PUBLISHED scenario, in the metric the literature reports (IAE):');
  console.log('                       cold start     settled first');
  console.log(`    doing nothing      ${cold.nothing.toFixed(2).padStart(10)}`
    + `${warm.nothing.toFixed(2).padStart(15)}`);
  console.log(`    BLT-tuned PI pair  ${cold.blt.toFixed(2).padStart(10)}`
    + `${warm.blt.toFixed(2).padStart(15)}`);
  console.log(`    the distilled map  ${cold.pol.toFixed(2).padStart(10)}`
    + `${warm.pol.toFixed(2).padStart(15)}`);
  console.log(`    over doing nothing ${(cold.nothing / cold.pol).toFixed(2).padStart(9)}x`
    + `${(warm.nothing / warm.pol).toFixed(2).padStart(14)}x`);
  console.log(`    over the BLT       ${(cold.blt / cold.pol).toFixed(2).padStart(9)}x`
    + `${(warm.blt / warm.pol).toFixed(2).padStart(14)}x`);
  console.log(`    the cold column's own startup transient is worth `
    + `${(cold.nothing / warm.nothing).toFixed(2)}x of the do-nothing number, which is larger `
    + 'than anything claimed here — hence both columns.');
  check('…and in BOTH conventions it beats DOING NOTHING, which is the bar this plant has failed '
    + 'for the whole project and the published BLT never cleared',
    cold.pol < cold.nothing && warm.pol < warm.nothing,
    `cold ${cold.pol.toFixed(2)} vs ${cold.nothing.toFixed(2)}, `
    + `warm ${warm.pol.toFixed(2)} vs ${warm.nothing.toFixed(2)}`);
  check('…and in BOTH conventions it beats the published BLT, which is target 7\'s standing '
    + 'open clause',
    cold.pol < cold.blt && warm.pol < warm.blt,
    `cold ${cold.pol.toFixed(2)} vs ${cold.blt.toFixed(2)}, `
    + `warm ${warm.pol.toFixed(2)} vs ${warm.blt.toFixed(2)}`);
  check('…and the cold do-nothing reproduces the number this project has on record (43.90), '
    + 'which is what says the scoring loop is the one those numbers came from (rule 21)',
    Math.abs(cold.nothing - 43.90) < 0.5, cold.nothing.toFixed(2));
  check('…and the cold BLT reproduces its own recorded 51.95 through this loop rather than '
    + 'through the rig\'s, which is the control that the shared loop did not change it',
    Math.abs(cold.blt - WB.iaeOf(WB.runBLT())) < 1e-9,
    `${cold.blt.toFixed(4)} against the rig's ${WB.iaeOf(WB.runBLT()).toFixed(4)}`);
}

check('the column is not made worse by anything the ladder ships',
  rep.best <= rep.base, `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}`);
// A rung SKIPPED by the plant-time budget (plan §120) is a stated state and not "never reached":
// the ladder wrote a row saying so, and that is what this check accepts (rule 25).
const skippedByBudget = !!(rep.budget && rep.budget.skipped.some((x) => /②d/.test(x.phase)));
check(skippedByBudget
  ? 'the distilled rung was SKIPPED by the plant-time budget, with a stated row'
  : 'the distilled rung reached this plant at all — it was offered, fitted and SCORED on the '
    + 'machine, whatever it then decided',
  skippedByBudget || !!(rep.distil && (rep.distil.policy || rep.distil.note)),
  JSON.stringify(rep.distil || rep.budget || null));
if (inSample) {
  check('…and its in-sample column exists, so a refusal can be read to TRANSFER or to the fit '
    + 'rather than left with two explanations (rule 9)',
    inSample.length === DIETS.length, JSON.stringify(inSample));
}
console.log(failed ? `\n  ${failed} check(s) failed\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);
