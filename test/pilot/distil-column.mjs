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
import { deriveWindow, reportDistil } from './rigs/distilkit.mjs';
import * as WB from './rigs/woodberry-rig.mjs';

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
const DIETS = [
  [[0.8, 0.0], [0.8, 0.8], [0.0, 0.8], [0.0, 0.0]],
  [[1.2, 0.4], [0.4, 1.2], [1.2, 1.2], [0.4, 0.4]],
  [[0.6, 1.0], [1.4, 0.2], [0.2, 0.6], [1.0, 1.4]],
  [[1.0, 0.0], [0.0, 1.0], [1.0, 1.0], [0.5, 0.5]],
];
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
const distilRuns = () => DIETS.map((rec) => {
  const lap = LAP(rec), ref = refOf(rec);
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

    run: async (corr) => {
      const c = settled(rec);
      let s2 = 0, n = 0;
      const err = [0, 1].map(() => new Float64Array(lap));
      for (let k = 0; k < 3 * lap; k++) {
        const kk = ((k % lap) + lap) % lap;
        const sp = ref(k), u0 = WB.inputsFor(sp[0], sp[1]);
        const u = corr ? corr.at(kk) : [0, 0];
        c.step(u0.map((v, j) => v + (u[j] || 0)));
        const want = WB.outputsFor(u0);
        // The last lap is the RECORD the teacher inverts; the last two are what it is SCORED on,
        // so a run is never scored across the lap that established its own operating point.
        if (k >= 2 * lap) for (let j = 0; j < 2; j++) err[j][kk] = c.y[j] - want[j];
        if (k >= lap) for (let j = 0; j < 2; j++) { s2 += (c.y[j] - want[j]) ** 2; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },
  };
});

const spec = { ...wbSpec,
  ...(process.env.MIMO === '1'
    ? { pilotOpts: { ...(wbSpec.pilotOpts || {}), mimo: true } } : {}),
  distil: { refDim: 2, ridge: env('RIDGE', 1e-6), offsets: OFFSETS,
    ...(process.env.STD === '1' ? { standardize: true } : {}),
    ...(process.env.ONLINE === '0' ? { online: false } : {}) },
  distilRuns };

announce();
if (process.env.MIMO === '1') console.log('  pilotOpts + {"mimo":true}');
const { rep, auto } = await ladder(spec);

const { inSample } = await reportDistil({ rep, runs: distilRuns(),
  nFeat: OFFSETS.length * 2 + 1, auto });

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
