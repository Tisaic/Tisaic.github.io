/**
 * @file THE DEPLOYED OBJECT ON THE BARREL — the plant this project has refused since it was
 * built, and which §62 measured as WINNABLE by the object we actually ship.
 *
 * WHY THIS PLANT AND WHY NOW. `headroom.mjs` solves for the best piecewise-constant correction
 * with the MACHINE IN THE LOOP and reaches **15.11x** here, against the pilot's 1.05x and a
 * refusal. 97-99% of that oracle correction is expressible by a causal map of the COMMANDED
 * REFERENCE — `distil.js`'s own form — and at the right window **5.38x of it SURVIVES a program
 * with a different clock and different magnitudes**. So the standing verdict ("the refusal is
 * proved correct") is right about the PILOT and wrong about the PLANT, which is the same shape
 * the mill's missing warmup had. This asks the machine whether the ladder can reach that.
 *
 * IT DRIVES THROUGH THE SHARED `ladder()` AND THE SHARED `barrelSpec` (rule 61). A second copy
 * of a plant's routing has shipped a defect three separate times here; `distil-tank.mjs` is one
 * such copy and is the reason this file is not another. What it adds to the spec is exactly two
 * fields — the rung's options and its training diet — so `plants.test.mjs` is byte-identical and
 * is the control that says nothing else moved.
 *
 * THE WINDOW IS DERIVED AND THE DERIVATION IS THE EXPERIMENT. Two constraints pull opposite ways
 * (§49.11, and rule 37 against §41's aliasing theorem): the window must REACH the plant's memory
 * and must not SPAN the training lap. Every other harness here has sized it from the first
 * constraint alone — `distil-tank.mjs` takes 0.61·Tset from the arm's shipped ladder — and on
 * THIS plant that is the wrong one to obey, because the barrel's measured settle is 7,861 steps
 * against a 15,000-step program. So the reach is `min(0.61·settle, lap/8)`, which has no plant
 * constant in it, and `WIN` sweeps it so the derivation can be checked rather than asserted:
 * §62.5 measured the transfer optimum at ±983 steps by a route with no rung in it, and if the
 * rule lands near that on a plant sharing no physics with the one it came from, it is a rule.
 *
 * AND THE ROW'S SCALES ARE THIS PLANT'S, NOT THE ARM'S (rule 31, rule 32). `_rowFrom` leads with
 * the ABSOLUTE reference at now and follows it with DIFFERENCES from now: on the arm those are a
 * joint angle in radians beside small travels, all within an order of magnitude of the constant
 * term, and `distil.js` already records that one ridge and one covariance prior act on every
 * feature alike. On this plant the absolute term is PERCENT OF FULL POWER — 18 to 62 — beside
 * differences of order 0.1, so the same prior is ~400x too weak on one block and ~40x too strong
 * on another. `STD=1` divides each feature by its rms over the training rows, which `distil.js`
 * built for exactly this and which §52.40 measured as INERT on the arm — the signature of a
 * repair that is a no-op where it was measured and load-bearing where it was not.
 *
 * AND THE ONE DIFFERENCE LEFT IS THE FIT ROUTE, WHICH THIS PROJECT HAS SUSPECTED SINCE §52.16
 * AND NEVER TESTED WHERE IT DECIDES AN ANSWER. The teacher converges these recipes at 11-15x,
 * none is dropped, and the fit has 410 rows per feature — so the diet is good, the target is a
 * real correction and the solve is massively over-determined. Meanwhile §62 fitted the SAME
 * object on this plant by BATCH normal equations and read 97-99% in sample. Two routes to one
 * quantity disagreeing, with one of them already on record as suspect — §52.16: "the streaming
 * fit returns weights 30-150x the batch fit's on an exactly linear target and REFUSES ROWS THE
 * BATCH ROUTE DEPLOYS" — is rule 15 in its useful direction. `ONLINE=0` takes the batch route.
 * It matters beyond this plant: target 6 requires the fit to STREAM, so a streaming fit that
 * cannot fit what the batch route can is a product constraint and not a harness detail.
 *
 * KNOBS: WIN (reach in raw steps, overriding the derivation), STD, ONLINE, SEEDS, DSEG (the
 * diet's segment length), RIDGE. It asserts the plant is not made worse and reports the rest.
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { barrelSpec } from './rigs/specs.mjs';
import { deriveWindow, reportDistil, priceFrom, ridgeLadder, gainLadder, teacherReuse, carrier, teachLaps, teachAvg, dietN, emitRow } from './rigs/distilkit.mjs';
import { oracleConverge, oracleTeach } from './rigs/oracleteach.mjs';

// THE ORACLE TEACHER IS OPT-IN UNTIL IT IS MEASURED (plan §73.9). It needs a cascade to iterate,
// which §73.1 dropped here as waste — so `ORACLE=1` also restores `depth`, and the two must be
// priced together: the cascade is 4.0 days on this plant at depth 1 against hff's 29.6.
const ORACLE = process.env.ORACLE === '1';
/**
 * PARAM=1: THE LAP-FREE TEACHER (plan §90.3), and this plant is where it is DISCRIMINATING.
 *
 * §84.1's screen reads the SPREAD of the teacher's per-run scores across the diet: tight means it
 * is converging and a different teacher will not help; erratic means it is fighting a target that
 * moves between calls. The mill reads 6.78-8.25x (1.22x, tight) and this plant reads 1.03-4.03x
 * (**3.9x**), so the prediction written down first is level-or-worse there and BETTER here.
 */
const PARAM = process.env.PARAM === '1';
import * as TH from './rigs/thermal-rig.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-barrel: SKIPPED (full tier only — one commissioning, ~15 min)\n');
  process.exit(0);
}

const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
console.log('\ndistil-barrel: the DEPLOYED object on the plant we have always refused\n');

// ---------------------------------------------------------------- the diet
// THE SAME GENERATOR AT OTHER PROFILES. Not the shipped recipe and not a different KIND of
// program — a changeover between three-zone temperature profiles, which is what this machine
// does — and each one CYCLED so it has a lap, because the rung's teacher converges a
// lap-indexed correction. A batch recipe that repeats is an ordinary process, not a contrivance.
// THE RATE VARIES BY THE NUMBER OF SETPOINTS, NOT THE LENGTH OF EACH, SO EVERY LAP IS THE SAME
// (§63.7). A ladder built from segment length makes a slower recipe a LONGER lap, and the fit
// duly weighted itself 4.4x toward the recipes carrying 0.43x the teaching — rule 20 violated by
// a construction in which nothing looks like a capacity knob. Six points at 2500, four at 3750,
// three at 5000 and two at 7500 all close in 15,000 steps, so the rates span 0.67x to 2.0x of
// production WITH PRODUCTION INSIDE and every recipe contributes the same rows. It needs no
// per-program stride, which matters: `AutoStack` passes ONE stride to every program, and a
// per-recipe weighting would be a library change made to rescue a diet.
// THE DIET'S PROFILES. Default: this machine's OWN recipe points, in orders production never
// runs — `DIET=near`. §65.4 left the barrel neutral rather than harmful once its deploy path was
// repaired, so what is untested is whether a diet CLOSER to production carries anything, and the
// closest legal one shares production's transitions while holding out its sequence. Production
// runs A→B→C→D; these cycles contain those transitions and their reverses in other orders, and
// none of them is A→B→C→D. `DIET=far` restores the unrelated profiles as the control, because a
// diet that wins only by being production in disguise is a memory and the comparison says which.
const NEAR = TH.RECIPE;
const FAR = [[175, 195, 205], [190, 210, 218], [178, 198, 208],
  [185, 205, 215], [170, 190, 200], [192, 212, 220]];
const POINTS = process.env.DIET === 'far' ? FAR : NEAR;
// EVERY RECIPE'S LAP MUST EXCEED THE PLANT'S OWN SETTLE, AND THEY SHOULD BE EQUAL. A lap of
// 5,000 steps on a plant that settles in 7,861 is a "converged" correction the machine never
// reached steady state inside — and because the window rule takes the SHORTEST lap, that one
// recipe also dragged the reach to ±625, well under the ±983-1965 band §62.5 measured offline.
// Four setpoints each at the production segment gives laps of 20,000: longer than the settle,
// equal across the diet so no recipe outweighs another, and a reach of ±2,500 against a
// production ramp of SEG-HOLD = 3,500 steps, which is the feature the correction has to invert.
// DSEED=<n>: DRAW THE DIET, BECAUSE THE SEED VARIES NOTHING HERE EITHER (plan §84.8). This rig
// is deterministic — §84.3 measured two runs from `fresh()` agreeing bit-exactly, the ambient
// drift being a function of the plant's own step counter — so a commissioning "seed" cannot make
// this plant's headline a distribution. What varies between two engineers commissioning the same
// barrel is WHICH ORDERS OF THE SAME RECIPE POINTS they trained on, which is exactly what `PICK`
// is. Unset is the shipped ordering and byte-identical.
const DSEED = process.env.DSEED ? +process.env.DSEED : null;
const PICK = DSEED !== null ? (() => {
  let st = (DSEED * 2654435761) >>> 0;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  // The index set is POINTS.length, not a literal 6: the NEAR set is the rig's own four-recipe
  // RECIPE and the FAR set has six, and a hard-coded 6 duly indexed off the end of NEAR on the
  // first draw. The error was loud, which is the only good thing about it.
  return Array.from({ length: 4 }, () => {
    const ix = POINTS.map((_, i) => i);
    for (let i = ix.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ix[i], ix[j]] = [ix[j], ix[i]]; }
    return ix;
  });
})() : process.env.DIET === 'far'
  ? [[0, 1, 2, 3], [2, 3, 4, 5], [0, 2, 4, 5], [1, 3, 5, 0]]
  : [[0, 2, 1, 3], [1, 0, 3, 2], [0, 3, 1, 2], [2, 0, 1, 3]];
if (DSEED !== null) console.log(`  DIET DRAW ${DSEED}: ${JSON.stringify(PICK.map((r) => r.slice(0, 4)))}\n`);
// AND HOW MANY SETPOINTS A RECIPE CYCLES THROUGH, WHICH IS THE LAP ITSELF (plan §73.5). The rule
// above is "the lap must EXCEED the plant's settle", and at the production segment two setpoints
// give 10,000 steps against a 7,861-step settle — still legal, half the lap, and a reach of ±1,250
// which is CLOSER to the ±983 §62.5 measured offline as this plant's transfer optimum than the
// ±2,500 four setpoints give. Every teacher lap is 5.56 h of extruder at four and 2.8 h at two, so
// this is the one knob that halves the commissioning without touching a phase count. `DPTS=4` is
// the control.
const DPTS = Math.max(2, +(process.env.DPTS || 4));
const DIETS = PICK.map((ix) => ix.slice(0, DPTS).map((i) => POINTS[i]));
// THE DIET'S RATE LADDER, WHICH IS THE LEVER §63.6 MEASURED AND HAS NO CONSTANT IN IT. The first
// diet ran every recipe at SEG 2500 against the production program's 5000, so every training ramp
// was twice production's rate and the whole diet sat to ONE SIDE of it — `distil-tank.mjs`'s
// second wrong diet exactly, and §52.40's feedrate finding in mirror image. §52.41's remedy is to
// BRACKET the production rate rather than sit beside it. The ladder is therefore 0.5x, 1.0x, 1.5x
// and 2.0x of the shipped SEG, so production sits INSIDE the span rather than at its edge, and
// the holds keep the shipped program's duty so what varies across the ladder is the RATE and not
// the shape. `DSEG` still forces a single segment length, which is how the one-sided diet is
// reproduced as the control.
// THE DIET RUNS AT PRODUCTION'S OWN SEGMENT, which is a match rather than a tuned constant: the
// correction has to invert a ramp of SEG-HOLD, so a diet commanded at another rate is inverting a
// different feature. Laps are then rec.length*SEG — equal across the diet, and longer than this
// plant's 7,861-step settle, which §65.3 measured as necessary. Deriving SEG from a lap budget
// instead gave 3,750 and read 8.69x where production's own 5,000 reads 11.22x.
// ---------------------------------------------------------- THE DECLARED DISTURBANCE (plan §80)
//
// `EXO=causal|oracle|off` (default off, byte-identical). The cold mill wins 1.45x and §71 proved
// the win is ALL of one declaration — withhold its roll phase and the object is inert at exactly
// 1.000x. This asks whether that route is GENERAL, on the plant that is its own counterexample:
// §72.18 measured this barrel's UNDECLARED ambient drift at 3.951x against 14.949x with the drift
// held flat, so a factor of 3.8 sits in a disturbance the machine already has a sensor for.
//
// THE MILL'S PHASE IS KNOWN AHEAD AND AMBIENT IS NOT, WHICH DECIDES THE DESIGN. `phase(k)` is
// closed form in k, so the straddling window previews it legitimately; a wall thermocouple has no
// future. Appending `ambientRead(k)` as a reference channel would let the window read +2500 steps
// of a disturbance's FUTURE, which is an ORACLE and not a controller — and it would read well.
//
// So the admissible channel is a DELAYED copy: at decision k the map is handed the thermocouple
// as it read at k - REACH, and the window's most-future tap (+REACH) is therefore ambient NOW.
// Every tap is causal by CONSTRUCTION rather than by a guard, no library change is needed, and an
// installation implements it with a ring buffer. `oracle` removes the delay and is the BOUND (as
// §48's perfect forecast is), never a product. The falsifier ran first (rule 1): a causal read of
// this signal's own noisy past predicts its true future at R2 0.88 at +60 and 0.82 at +250, at
// the rig's own 0.35 K instrument noise — and >0.9995 at zero noise, which is the simulator.
const EXO = process.env.EXO || 'off';
if (!['off', 'causal', 'oracle'].includes(EXO)) throw new Error(`EXO must be off|causal|oracle, got ${EXO}`);
const EXO_ON = EXO !== 'off';
const REFDIM = EXO_ON ? 4 : 3;
// The declared value at ABSOLUTE plant step `kAbs`, centred so the channel is a deviation rather
// than a 25-K pedestal the standardiser has to absorb (rule 32).
const exoAt = (kAbs, lag) => TH.ambientRead(kAbs - lag) - TH.TA0;

const DSEGS = DIETS.map(() => env('DSEG', TH.SEG));
const holdOf = (seg) => Math.round(seg * (TH.HOLD / TH.SEG));
const LAP = (rec, seg) => seg * rec.length;

/** One recipe's setpoints at raw step k, cycled at its own lap. */
const refOf = (rec, seg) => (k) => {
  const lap = LAP(rec, seg);
  const kk = ((k % lap) + lap) % lap;
  const i = Math.floor(kk / seg);
  const t = (kk - i * seg - holdOf(seg)) / (seg - holdOf(seg));
  const s = t <= 0 ? 0 : t >= 1 ? 1 : TH.quintic(t);
  const a = rec[i], b = rec[(i + 1) % rec.length];
  return a.map((av, j) => av + (b[j] - av) * s);
};

/** Settle the barrel at a recipe's own start, so no run is scored across its startup (rule 13). */
function settled(rec, seg) {
  const p = TH.makeBarrel(7);
  const st = TH.powerFor(refOf(rec, seg)(0));
  for (let i = 0; i < 20000; i++) p.step(st);
  return p;
}

// ---------------------------------------------------------------- the window
// The plant's memory, measured rather than assumed: the barrel's own step response settles in
// ~7,861 steps (`headroom.mjs` measures it from the response itself, no probe in the route).
const SETTLE = 7861;
// The window rule, the offset shape and the shortest-lap bound live in `rigs/distilkit.mjs` —
// they are not this plant's business and a second copy of either has already drifted here.
const lapMin = Math.min(...DIETS.map((rec, i) => rec.length * DSEGS[i % DSEGS.length]));
const { reach: REACH, offsets: OFFSETS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin, win: process.env.WIN === undefined ? undefined : env('WIN') });
console.log(`  window reach ±${REACH} raw steps  (settle ${SETTLE}, shortest diet lap ${lapMin}, `
  + `min(0.61·settle, lap/8) = ${RULE})`);
console.log(`  ${OFFSETS.length} offsets per channel, ${DIETS.length} training recipes at SEG `
  + `${DSEGS.join('/')} (laps ${DIETS.map((r, i) => r.length * DSEGS[i]).join('/')}) `
  + `against the scored program's ${TH.SEG} — `
  + `${DSEGS.some((d) => d < TH.SEG) && DSEGS.some((d) => d > TH.SEG)
    ? 'production is INSIDE the span' : 'production is at the EDGE of the span'}\n`);

/** The training diet as the rung consumes it: a lap, its reference, and a run closure. */
// LAPS PER TEACHER CALL (plan §73.2). One lap settles under the correction just handed over, the
// rest are scored and the last is the record the teacher inverts. With the plant carried the
// first is the only settle there is, so `TLAPS=2` asks whether the second scored lap is buying
// noise reduction worth a third of the commissioning. Unset is 3 and byte-identical.
const TLAPS = teachLaps();
// TAVG=<n>: AVERAGE THE TEACHER'S RECORD OVER THE LAST n LAPS (plan §80.7). The mechanism, the
// measurement and the two controls are in `distilkit.mjs` beside the knob, because §80.7's claim
// is about any plant with a small non-repeating component and not about this one (§84.1).
const TAVG = teachAvg(TLAPS);
const distilRuns = (auto) => dietN(DIETS).map((rec, di) => {
  const seg = DSEGS[di % DSEGS.length];
  const lap = LAP(rec, seg), ref = refOf(rec, seg);
  // THE PLANT'S OWN DRIVE LOOP, NAMED ONCE AND HANDED TO BOTH TEACHERS (plan §90.3) — it differs
  // from `run` above in three ways: it applies a frozen PREFIX rather than a candidate, it may arm
  // `auto.act` on top of that prefix and capture what it applied, and it may return the measured
  // truth per raw step.
  const DRIVE = async ({ pre, active = false, uOut = null, trace = false, onStep = null }) => {
      const p = hold();
      let s2 = 0, n = 0;
      const out = trace ? Array.from({ length: lap }, () => [0, 0, 0]) : null;
      for (let k = 0; k < TLAPS * lap; k++) {
        const kk = ((k % lap) + lap) % lap;
        if (onStep) onStep(kk);
        const want = ref(k), P = TH.powerFor(want);
        // The pilot decides on the cascade's own grid and the prefix is per raw step, so both
        // are read at `kk` and the pilot's own stride is its business (plan §51.5).
        const look = (o) => TH.powerFor(ref(k + o));
        const a = active ? auto.act({ look, lookRaw: look, k }) : null;
        for (let c = 0; c < 3; c++) {
          const v = pre[c][kk] + (a ? (a[c] || 0) : 0);
          if (uOut && a) uOut[c][kk] = a[c] || 0;
          P[c] += v;
        }
        p.step(P);
        const y = p.read();
        if (trace && k >= (TLAPS - 1) * lap) for (let c = 0; c < 3; c++) out[kk][c] = y[c] - want[c];
        if (k >= (TLAPS - 1) * lap) for (let c = 0; c < 3; c++) { s2 += (y[c] - want[c]) ** 2; n++; }
      }
    return { score: Math.sqrt(s2 / n), rec: out };
  };
  // THE PLANT IS CARRIED, AND THAT COSTS THIS PLANT'S HEADLINE 11.176x -> 3.951x (plan §72.18).
  //
  // Rebuilding per teacher call scored far better and the reason is not a property of the barrel.
  // `ambient(k)` reads the plant's OWN step counter, so a rebuild resets the unmeasured drift to
  // k = 0 and every teacher call sees the IDENTICAL disturbance trajectory. A lap-periodic teacher
  // can invert a disturbance that repeats exactly and cannot invert one that does not — and 20,000
  // steps is a whole number of neither 9,300 nor 4,100. The falsifier confirms it outright: carried
  // with `TH_NOAMB=1` the teacher recovers to 10.9/13.2/10.9/10.4x and the rung reads 14.949x.
  //
  //   rebuilt + drift    teacher  9.3/11.0/ 9.3/ 9.2x   11.176x   94.4 d
  //   carried + drift    teacher  1.85/1.03/2.17/4.03x   3.951x   77.9 d   <- ships
  //   carried, NO drift  teacher 10.9/13.2/10.9/10.4x   14.949x   73.5 d
  //
  // A real barrel's room temperature is not phase-locked to a five-hour recipe cycle, so the
  // CARRIED configuration is the one that models a machine and the rebuild was flattering the
  // teacher by a factor of three. It is also cheaper, which is not why it is chosen. `CARRY=0`
  // restores the old configuration as the control.
  const hold = process.env.CARRY === '0' ? () => settled(rec, seg)
    : carrier(() => settled(rec, seg));
  // THE DECLARED CHANNEL IS INDEXED BY THE PLANT'S OWN STEP, NOT THE LAP'S (plan §80.2), and that
  // is the whole reason the rig had to expose its counter. The reference wraps because it really
  // is lap-periodic; the ambient does not, because it is not — §72.18's entire finding. So the
  // window near a lap's start reads the ambient just BEFORE that lap began, which is what the
  // plant actually experienced, where wrapping it would invent a discontinuity that never
  // happened. `scoredBase` is set by `run` below: the teacher inverts the LAST lap, so the rows
  // `addProgram` builds correspond to plant steps [base, base + lap).
  let scoredBase = 0;
  const lag = EXO === 'oracle' ? 0 : REACH;
  return {
    lap,
    refAt: (k) => (EXO_ON ? [...TH.powerFor(ref(k)), exoAt(scoredBase + k, lag)]
      : TH.powerFor(ref(k))),
    // THE LAP IS CLOSED AND MUST SAY SO. `refAt` above wraps at `lap`, but `addProgram` clamps
    // the window at index 0 unless the run declares itself closed — so without this the fit skips
    // the first REACH samples of every recipe (measured: 939 of 7500 on the barrel, 376 of 3000
    // on the column, each equal to the window's own reach) AND the deployed policy then reads
    // wrapped windows at every lap start that the fit never saw. That is plan §52.14's defect
    // exactly, which cost the arm 19% and the soft cell 2.61x -> 3.98x, reappearing because a new
    // host is the one place the flag has to be set by hand.
    closed: true,

    run: async (corr) => {
      const p = hold();
      scoredBase = p.steps() + (TLAPS - 1) * lap;
      let s2 = 0, n = 0;
      const err = [0, 1, 2].map(() => new Float64Array(lap));
      for (let k = 0; k < TLAPS * lap; k++) {
        const kk = ((k % lap) + lap) % lap;
        const want = ref(k), P = TH.powerFor(want);
        const u = corr ? corr.at(kk) : [0, 0, 0];
        p.step(P.map((v, j) => v + (u[j] || 0)));
        const y = p.read();
        // The last TAVG laps are the RECORD the teacher inverts, accumulated here and divided
        // below; the last two are what it is SCORED on, so a run is never scored across the lap
        // that established its own operating point.
        if (k >= (TLAPS - TAVG) * lap) for (let c = 0; c < 3; c++) err[c][kk] += (y[c] - want[c]) / TAVG;
        if (k >= (TLAPS - 1) * lap) for (let c = 0; c < 3; c++) { s2 += (y[c] - want[c]) ** 2; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },

    // ---- THE PILOT AS THE TEACHER, OFFERED WHERE A CASCADE WAS BUILT (plan §73.9).
    //
    // `hff` is 79% of what this plant's commissioning costs — 29.6 days of extruder — and §73.6
    // and §73.8 closed both ways of making its laps cheaper. What remains is a different teacher,
    // and the oracle port replaces exactly the thing `hff` spends its probe sets identifying: a
    // forecast. The iteration itself is `rigs/oracleteach.mjs`, written once for every plant; this
    // is only the plant's own drive loop, which differs from `run` above in three ways — it
    // applies a frozen PREFIX rather than a candidate, it may arm `auto.act` on top of that
    // prefix and capture what it applied, and it may return the measured truth per raw step.
    // PARAM=1: THE LAP-FREE TEACHER (plan §90.3). This plant is the DISCRIMINATING one, because
    // §84.1's own screen predicts opposite results on it and on the mill: read the SPREAD of the
    // teacher's per-run scores across the diet, and a TIGHT one (the mill at 6.78-8.25, 1.22x)
    // means `hff` is converging and a different teacher should not help, while an ERRATIC one
    // (this plant at 1.03-4.03x, **3.9x**) means it is fighting a target that moves between calls.
    // The prediction on record is that parametric is level-or-worse on the mill and BETTER here.
    ...(PARAM ? oracleTeach({ auto, lap, nc: 3, drive: DRIVE }) : {}),
    ...(ORACLE ? { converge: oracleConverge({
      auto, lap, nc: 3, passes: +(process.env.OPASSES || 8), debug: process.env.ODBG === '1',
      drive: DRIVE,
    }) } : {}),
  };
});

// The ladder's plant is `barrelSpec.fresh()`, which settles 20,000 steps before step 0 — so the
// absolute step at ladder index k is `EXO_WARM + k`, and the declared channel must say the same
// thing to the machine that it said to the fit or the map is reading a different disturbance
// (rule 61 aimed at a clock). It is a literal here because it is the rig's, and it is asserted
// against the rig rather than trusted.
const EXO_WARM = 20000;
if (EXO_ON) {
  const w = barrelSpec.fresh().steps();
  if (w !== EXO_WARM) throw new Error(`EXO: the rig settles ${w} steps, not the ${EXO_WARM} this `
    + 'harness indexes the declared channel by — the map would be fitted on one disturbance and '
    + 'deployed against another (rule 61)');
}
const spec = { ...barrelSpec,
  ...(EXO_ON ? { refAt: (k) => [...TH.powerFor(TH.setpointAt(Math.min(k, TH.PROG))),
    exoAt(EXO_WARM + k, EXO === 'oracle' ? 0 : REACH)] } : {}),
  // NO CASCADE: this rung's teacher is `hff`, so the cascade would be commissioned,
  // scored and then REPLACED by the rung that wins (plan §73.1). `DEPTH=2` is the control.
  // BOTH non-default teachers take their increments from a commissioned cascade, so both ask for
  // one; it is never armed, because what ships is decided by scoring the distilled policy after
  // (plan §90.2 — the mill measured this coupling by producing a silent zero without it).
  depth: (ORACLE || PARAM) ? 1 : 0,
  // STANDARDISATION IS ON BY DEFAULT HERE, AND IT IS A SCALE REPAIR RATHER THAN A TUNED KNOB
  // (rule 32). `_rowFrom` leads with the ABSOLUTE reference and follows with DIFFERENCES: on the
  // arm that is a joint angle beside small travels, all within an order of magnitude of the
  // trailing constant, and §52.40 duly measured this inert there; here the absolute term is
  // PERCENT OF FULL POWER, 18-62, beside differences of order 0.1, so one ridge and one
  // covariance prior act on blocks ~400x apart. Measured on this plant: 8.69x → 11.22x.
  // `STD=0` turns it off as the control.
  distil: { refDim: REFDIM, ridge: env('RIDGE', 1e-6), offsets: OFFSETS,
    ...(PARAM ? { parametric: true, passes: +(process.env.PPASSES || 4),
      backtracks: +(process.env.PBT || 0) } : {}),
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
    ...(process.env.STD === '0' ? {} : { standardize: true }),
    // AND THE FIT STREAMS BY DEFAULT, WHICH §63.6 SAID IT COULD NOT. That section measured the
    // streaming shared-covariance route failing to find a fit the batch route found (held-out -20
    // against 0.95) and called it a constraint on the PRODUCT, since target 6 forbids batch
    // normal equations outright. It was a property of the DIET, not of the route: on this diet
    // streaming reads 0.951/0.938/0.915 and delivers 11.22x, BETTER than batch's 10.61x.
    // `ONLINE=0` is the control that says so.
    ...(process.env.ONLINE === '0' ? { online: false } : {}) },
  distilRuns };

announce();
// WHAT THE PRODUCT COSTS THE PLANT, metered at the plant's own `step` so no caller can
// bypass it (plan §72). Opened here and closed the moment the ladder returns, because
// `reportDistil`'s in-sample column re-runs every training program and that is SCORING, not
// commissioning — charging it would price the instrument.
const price = priceFrom();
const { rep, auto, scoreOn } = await ladder(spec);
price.close({ dt: TH.DT, rep });

// ---------------------------------------------------------------- what it says and why
const { inSample } = await reportDistil({ rep, runs: distilRuns(),
  nFeat: OFFSETS.length * REFDIM + 1, segs: DSEGS, auto });

// ---------------------------------------------------------------- WHERE the harm is
// THE TRAINING RUNS ARE CLOSED LAPS AND THE PRODUCTION PROGRAM IS AN OPEN RECORD. Every row the
// fit saw came from a window that WRAPPED; the deployed window CLAMPS at both ends, so the first
// and last REACH steps of production read a window shape the fit never saw — here 5,000 of
// 15,000 steps, a third of the program. That is a structural mismatch rather than a tuning one,
// and it is cheap to locate: score the policy on production and report the rms by thirds against
// the same thirds undriven. If the ENDS carry the harm, the mismatch is the subject; if the
// MIDDLE does too, it is not, and the diet or the map is.
if (rep.distil && rep.distil.policy) {
  const pol = rep.distil.policy;
  const N = TH.PROG;
  const drive = (on) => {
    const p = barrelSpec.fresh();
    const e = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      // TWO READERS, DELIBERATELY: the PLANT is driven by the three power channels
      // (`barrelSpec.refAt`) and the POLICY reads whatever the commissioning declared
      // (`spec.refAt`, four channels under EXO). Handing the plant the declared row would
      // step it with an ambient reading as though it were a power demand.
      const ref = barrelSpec.refAt(k);
      const u = on
        ? pol.actLook((o) => spec.refAt(Math.min(N - 1, Math.max(0, k + o))))
        : [0, 0, 0];
      const r = barrelSpec.step(p, ref, u, k);
      let s2 = 0; for (const v of r.truth) s2 += v * v;
      e[k] = Math.sqrt(s2 / r.truth.length);
    }
    return e;
  };
  const bare = drive(false), withP = drive(true);
  const rmsOn = (a, lo, hi) => { let s = 0; for (let k = lo; k < hi; k++) s += a[k] * a[k];
    return Math.sqrt(s / (hi - lo)); };
  const bands = [['head (window clamps)', 0, REACH],
    ['middle (window whole)', REACH, N - REACH],
    ['tail (window clamps)', N - REACH, N]];
  console.log(`\n  WHERE the correction helps and harms, by band of the production program`
    + ` (reach ±${REACH} of ${N} steps):`);
  for (const [name, lo, hi] of bands) {
    const b = rmsOn(bare, lo, hi), w = rmsOn(withP, lo, hi);
    console.log(`    ${name.padEnd(24)} ${b.toFixed(4)} → ${w.toFixed(4)}   ${(b / w).toFixed(3)}x`);
  }
  const clampFrac = (2 * REACH) / N;
  console.log(`    the clamped bands are ${(100 * clampFrac).toFixed(0)}% of the program, and `
    + 'every row the fit saw came from a window that WRAPPED — so if the harm lives there, the '
    + 'closed-lap diet and the open production record are the mismatch (plan §65.4).');
}


// ------------------------------------------- target 1, on a recipe it was not scored on
/**
 * TARGET 1's OWN BAR (plan §88.1). The SAME commissioned weight vector — no refit — on a second
 * changeover the ladder never scored, through `scoreOn`, which is this driver's own verify loop
 * (rule 61). §66 recorded that what bounds this object here is *how far the diet is from the
 * program it will run*, and the diet contains production's transitions in other orders; this
 * asks the complementary question, which is how far the object carries to a changeover that is
 * neither the diet's nor production's.
 *
 * The held-out recipe visits the same zone-temperature band at different levels and in a
 * different order, so it stays inside the power box the commissioning declared.
 */
const HELD_REC = [[186, 204, 214], [174, 194, 206], [194, 212, 220], [180, 200, 210]];
const heldSet = (k) => {
  const i = Math.min(HELD_REC.length - 2, Math.floor(k / TH.SEG));
  const t = (k - i * TH.SEG - TH.HOLD) / (TH.SEG - TH.HOLD);
  const q = t <= 0 ? 0 : t >= 1 ? 1 : TH.quintic(t);
  return HELD_REC[i].map((a, j) => a + (HELD_REC[i + 1][j] - a) * q);
};
const heldRef = (k) => TH.powerFor(heldSet(Math.min(k, TH.PROG)));
const hOff = await scoreOn({ refAt: heldRef, fresh: barrelSpec.fresh, N: TH.PROG },
  { armed: false });
const hOn = await scoreOn({ refAt: heldRef, fresh: barrelSpec.fresh, N: TH.PROG });
const xProg = rep.base / rep.best, xHeld = hOff.score / hOn.score;
console.log(`\n  TARGET 1 — the SAME object on a second changeover, no refit`);
console.log(`    scored recipe  ${TH.RECIPE.map((r) => r.join('/')).join(' → ')}`);
console.log(`                   ${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}   ${xProg.toFixed(3)}x`);
console.log(`    held out       ${HELD_REC.map((r) => r.join('/')).join(' → ')}`);
console.log(`                   ${hOff.score.toExponential(3)} → ${hOn.score.toExponential(3)}   ${xHeld.toFixed(3)}x`
  + `   ${(xHeld / xProg).toFixed(3)} of the scored factor\n`);
emitRow(rep, auto, { t1: xHeld / xProg, t1Worse: xHeld < 1 });
check('target 1: the held-out changeover is not made worse', hOn.score <= hOff.score * 1.02,
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
  + `changeover delivers ${(xHeld / xProg).toFixed(3)} of the scored factor`);
check('the barrel is not made worse by anything the ladder ships',
  rep.best <= rep.base, `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}`);
check('the distilled rung reached this plant at all — it was offered, fitted and SCORED on the '
  + 'machine, whatever it then decided',
  !!(rep.distil && (rep.distil.policy || rep.distil.note)),
  JSON.stringify(rep.distil || null));
if (inSample) {
  check('…and its in-sample column exists, so a refusal can be read to TRANSFER or to the fit '
    + 'rather than left with two explanations (rule 9)',
    inSample.length === DIETS.length, JSON.stringify(inSample));
}
console.log(failed ? `\n  ${failed} check(s) failed\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);
