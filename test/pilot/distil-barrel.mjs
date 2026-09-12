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
 * KNOBS: WIN (reach in raw steps, overriding the derivation), STD, SEEDS, DSEG (the diet's
 * segment length), RIDGE. It asserts the plant is not made worse and reports everything else.
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { barrelSpec } from './rigs/specs.mjs';
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
const DIETS = [
  [[175, 195, 205], [190, 210, 218], [178, 198, 208]],
  [[185, 205, 215], [170, 190, 200], [192, 212, 220]],
  [[181, 199, 213], [196, 209, 223], [174, 194, 202]],
  [[188, 202, 214], [176, 196, 206], [194, 215, 220]],
];
const DSEG = env('DSEG', 2500);
const DHOLD = Math.round(DSEG * (TH.HOLD / TH.SEG));
const LAP = (rec) => DSEG * rec.length;

/** One recipe's setpoints at raw step k, cycled at its own lap. */
const refOf = (rec) => (k) => {
  const lap = LAP(rec);
  const kk = ((k % lap) + lap) % lap;
  const i = Math.floor(kk / DSEG);
  const t = (kk - i * DSEG - DHOLD) / (DSEG - DHOLD);
  const s = t <= 0 ? 0 : t >= 1 ? 1 : TH.quintic(t);
  const a = rec[i], b = rec[(i + 1) % rec.length];
  return a.map((av, j) => av + (b[j] - av) * s);
};

/** Settle the barrel at a recipe's own start, so no run is scored across its startup (rule 13). */
function settled(rec) {
  const p = TH.makeBarrel(7);
  const st = TH.powerFor(refOf(rec)(0));
  for (let i = 0; i < 20000; i++) p.step(st);
  return p;
}

// ---------------------------------------------------------------- the window
// The plant's memory, measured rather than assumed: the barrel's own step response settles in
// ~7,861 steps (`headroom.mjs` measures it from the response itself, no probe in the route).
const SETTLE = 7861;
const lap0 = LAP(DIETS[0]);
const REACH = Math.round(env('WIN', Math.min(0.61 * SETTLE, lap0 / 8)));
// The arm's geometric SHAPE — dense near now where the correction is decided, sparse far out
// where it only has to span the memory — scaled to this plant's own reach. The shape is a
// design; the reach is the plant's (rule 31).
const OFFSETS = [0, 0.008, 0.016, 0.031, 0.063, 0.125, 0.219, 0.344, 0.5, 0.719, 1]
  .flatMap((f) => { const o = Math.round(f * REACH); return o === 0 ? [0] : [-o, o]; })
  .sort((a, b) => a - b);
console.log(`  window reach ±${REACH} raw steps  (settle ${SETTLE}, diet lap ${lap0}, `
  + `min(0.61·settle, lap/8) = ${Math.round(Math.min(0.61 * SETTLE, lap0 / 8))})`);
console.log(`  ${OFFSETS.length} offsets per channel, ${DIETS.length} training recipes at `
  + `SEG ${DSEG}, none of them the scored program\n`);

/** The training diet as the rung consumes it: a lap, its reference, and a run closure. */
const distilRuns = () => DIETS.map((rec) => {
  const lap = LAP(rec), ref = refOf(rec);
  return {
    lap,
    refAt: (k) => TH.powerFor(ref(k)),
    run: async (corr) => {
      const p = settled(rec);
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
    ...(process.env.STD === '1' ? { standardize: true } : {}) },
  distilRuns };

announce();
const { rep } = await ladder(spec);

// ---------------------------------------------------------------- what it says and why
// THE SPLIT THAT SAYS *WHY* (the one `distil-arm.mjs` exists to make): score the fitted policy
// on its OWN TRAINING RUNS. Helps them and refuses the scored program -> TRANSFER, and the diet
// is the subject. Cannot help even the runs it was fitted on -> the map cannot EXPRESS this
// plant's correction, and no diet repairs that. Without this column a refusal has two
// explanations and nothing here can tell them apart.
let inSample = null;
if (rep.distil && rep.distil.policy) {
  inSample = [];
  for (const r of distilRuns()) {
    const bare = await r.run(null);
    const withP = await r.run({ at: (k) => rep.distil.policy.actLook((o) => r.refAt(k + o)) });
    inSample.push(bare.score / withP.score);
  }
  console.log(`\n  in sample, on its own training recipes: `
    + inSample.map((x) => `${x.toFixed(3)}x`).join('  '));
}
const dr = rep.rungs.find((r) => /distil/.test(r.name));
console.log(`  distilled rung: ${dr ? `${dr.deployed ? 'DEPLOYED' : 'REFUSED'} at `
  + `${dr.gain === null ? '—' : dr.gain.toFixed(3)}x` : 'not reported'}`);
console.log(`  ${rep.distil && rep.distil.note ? rep.distil.note : ''}`);

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
