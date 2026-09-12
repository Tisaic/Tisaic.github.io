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
import { deriveWindow, reportDistil } from './rigs/distilkit.mjs';
import * as TH from './rigs/thermal-rig.mjs';

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
const POINTS = [[175, 195, 205], [190, 210, 218], [178, 198, 208],
  [185, 205, 215], [170, 190, 200], [192, 212, 220]];
const PICK = [[0, 1, 2, 3, 4, 5], [0, 2, 3, 5], [1, 3, 4], [0, 4]];
const DIETS = PICK.map((ix) => ix.map((i) => POINTS[i]));
// THE DIET'S RATE LADDER, WHICH IS THE LEVER §63.6 MEASURED AND HAS NO CONSTANT IN IT. The first
// diet ran every recipe at SEG 2500 against the production program's 5000, so every training ramp
// was twice production's rate and the whole diet sat to ONE SIDE of it — `distil-tank.mjs`'s
// second wrong diet exactly, and §52.40's feedrate finding in mirror image. §52.41's remedy is to
// BRACKET the production rate rather than sit beside it. The ladder is therefore 0.5x, 1.0x, 1.5x
// and 2.0x of the shipped SEG, so production sits INSIDE the span rather than at its edge, and
// the holds keep the shipped program's duty so what varies across the ladder is the RATE and not
// the shape. `DSEG` still forces a single segment length, which is how the one-sided diet is
// reproduced as the control.
const EQLAP = env('EQLAP', 3 * TH.SEG);   // every recipe closes in the production lap
const DSEGS = process.env.DSEG
  ? DIETS.map(() => env('DSEG', TH.SEG))
  : DIETS.map((rec) => Math.round(EQLAP / rec.length));
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
const distilRuns = () => DIETS.map((rec, di) => {
  const seg = DSEGS[di % DSEGS.length];
  const lap = LAP(rec, seg), ref = refOf(rec, seg);
  return {
    lap,
    refAt: (k) => TH.powerFor(ref(k)),
    run: async (corr) => {
      const p = settled(rec, seg);
      let s2 = 0, n = 0;
      const err = [0, 1, 2].map(() => new Float64Array(lap));
      for (let k = 0; k < 3 * lap; k++) {
        const kk = ((k % lap) + lap) % lap;
        const want = ref(k), P = TH.powerFor(want);
        const u = corr ? corr.at(kk) : [0, 0, 0];
        p.step(P.map((v, j) => v + (u[j] || 0)));
        const y = p.read();
        // The last lap is the RECORD the teacher inverts; the last two are what it is SCORED on,
        // so a run is never scored across the lap that established its own operating point.
        if (k >= 2 * lap) for (let c = 0; c < 3; c++) err[c][kk] = y[c] - want[c];
        if (k >= lap) for (let c = 0; c < 3; c++) { s2 += (y[c] - want[c]) ** 2; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },
  };
});

const spec = { ...barrelSpec,
  distil: { refDim: 3, ridge: env('RIDGE', 1e-6), offsets: OFFSETS,
    ...(process.env.STD === '1' ? { standardize: true } : {}),
    ...(process.env.ONLINE === '0' ? { online: false } : {}) },
  distilRuns };

announce();
const { rep } = await ladder(spec);

// ---------------------------------------------------------------- what it says and why
const { inSample } = await reportDistil({ rep, runs: distilRuns(),
  nFeat: OFFSETS.length * 3 + 1, segs: DSEGS });

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
