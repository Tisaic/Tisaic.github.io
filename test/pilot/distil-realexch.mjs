/**
 * @file THE DEPLOYED OBJECT ON A REAL STEAM HEAT EXCHANGER (DaISy 97-002) — plan §86.5.
 *
 * `realexch.test.mjs` ships the CONVENTIONAL rung here at 89.8x and refuses the pilot cascade,
 * and that figure carries a standing caution this project made about itself: the 1364x the same
 * plant reads as a LINEAR ARX measures the conventional rung's own hypothesis class, and the
 * counterflow effectiveness relation `exp(-1/u)` in the fit is what collapses it to 89.8x. The
 * deployed object has never been asked here. Every plant converted since §64 was converted by
 * asking it instead of the teacher, so this asks.
 *
 * THIS PLANT IS THE FASTEST IN THE DIRECTORY RELATIVE TO ITS PROGRAM — a 2% settle of ~37
 * samples against a 1,600-sample recipe, which is 43 response times per program where §84.9's
 * screen puts the losing plants at 5-8. On that screen it should be easy, and the window rule's
 * REACH half gives ±23: the map is asked to read half a minute of the commanded flow either side
 * of now. If the screen is right this is the cheapest win in the set; if it is not, a 43-response-
 * time program is where that screen fails, and either is worth the run.
 *
 * THE DIET IS FOUR CLOSED RECIPES THE PRODUCTION ONE IS NOT, every one inside the temperature
 * span the record supports (92.8-101.4 °C), because a diet outside it would be teaching the map
 * about a machine this data does not describe.
 *
 * KNOBS: RIDGES, GAINS, WIN, TLAPS, TAVG, DIETN, SEED, DEPTH, LINEAR=1 (the soft-target control).
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { realexchLadderSpec } from './rigs/specs.mjs';
import { deriveWindow, reportDistil, priceFrom, ridgeLadder, gainLadder, teacherReuse, teachLaps,
  teachAvg, dietN, carrier, emitRow } from './rigs/distilkit.mjs';
import { dirInvFor } from './rigs/dirinvkit.mjs';
import * as E from './rigs/realexch-rig.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-realexch: SKIPPED (full tier only — one commissioning)\n');
  process.exit(0);
}
const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
const LIN = process.env.LINEAR === '1';
const MODEL = LIN ? E.MODEL_LIN : E.MODEL;
console.log(`\ndistil-realexch: the DEPLOYED object on a REAL steam heat exchanger`
  + `${LIN ? ' (LINEAR — the soft-target control)' : ''}\n`);

/** The plant's own 2% settle to a step in commanded flow, from a settled machine. */
function measureSettle(N = 4000) {
  const p = E.makeMachine(MODEL);
  const u0 = E.flowFor(E.RECIPE[0]);
  for (let i = 0; i < 2000; i++) p.step(u0);
  const y = new Float64Array(N);
  const du = 0.2 * (E.UMAX - E.UMIN);
  for (let k = 0; k < N; k++) y[k] = p.step(u0 + du);
  const fin = y[N - 1];
  for (let k = N - 1; k >= 0; k--) if (Math.abs(y[k] - fin) > 0.02 * Math.abs(fin - y[0])) return k + 1;
  return 1;
}
const SETTLE = measureSettle();

/** Four CLOSED recipes, none of them production, all inside the record's own span. */
const SHIPPED_RECIPES = [
  [96.0, 100.5, 94.0, 98.5, 96.0],
  [98.8, 94.8, 100.0, 95.8, 98.8],
  [95.2, 99.0, 93.6, 100.8, 95.2],
  [97.0, 93.8, 99.8, 96.6, 97.0],
];
/** DSEED=<n>: DRAW THE DIET (plan §87.3). A REFUSAL is a result too, and a refusal from one diet
 *  draw is a refusal from one diet draw — the question is whether the object refuses on every
 *  diet or only on this one. Drawn inside the record's own 92.8-101.4 °C span, closed. */
const DSEED = process.env.DSEED ? +process.env.DSEED : null;
const RECIPES = DSEED === null ? SHIPPED_RECIPES : (() => {
  let st = (DSEED * 2654435761) >>> 0;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const t = () => 93.5 + 7.3 * rnd();
  return Array.from({ length: 4 }, () => { const a = t(); return [a, t(), t(), t(), a]; });
})();
if (DSEED !== null) {
  console.log(`  DIET DRAW ${DSEED}: ` + RECIPES.map((r) =>
    r.map((v) => v.toFixed(1)).join('→')).join('  ·  '));
}
const LAP = E.SEG * (RECIPES[0].length - 1);
const { reach: REACH, offsets: OFFSETS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin: LAP, win: process.env.WIN === undefined ? undefined : env('WIN') });
console.log(`  the plant's 2% settle is ${SETTLE} samples (${SETTLE * E.TS} s at Ts = ${E.TS} s) `
  + `against a ${LAP}-sample lap — ${(LAP / SETTLE).toFixed(0)} response times per program`);
console.log(`  window ±${REACH} samples  [rule ${RULE} = min(0.61·${SETTLE}, ${LAP}/8)]`
  + `   ${OFFSETS.length} offsets`);
console.log(`  the diet: ` + RECIPES.map((r) => r.join('→')).join('  ·  '));
console.log(`  the SCORED recipe ${E.RECIPE.join('→')} is in NO training run, and is not CLOSED `
  + `— the diet's laps are\n`);

const TLAPS = teachLaps();
const TAVG = teachAvg(TLAPS);
/** A closed recipe's own command, on the same ramp the rig uses (rule 61). */
const refOn = (rec, k) => {
  const i = Math.min(rec.length - 2, Math.floor(k / E.SEG));
  const t = (k - i * E.SEG - E.HOLD) / (E.SEG - E.HOLD);
  const q = t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 + t * (-15 + 6 * t));
  return E.flowFor(rec[i] + (rec[i + 1] - rec[i]) * q);
};
const distilRuns = () => dietN([0, 1, 2, 3]).map((i) => {
  const rec = RECIPES[i];
  const plant = carrier(() => E.makeMachine(MODEL));
  return {
    lap: LAP,
    closed: true,
    refAt: (k) => [refOn(rec, ((k % LAP) + LAP) % LAP)],
    run: async (corr) => {
      const p = plant();
      let s2 = 0, n = 0;
      const err = [new Float64Array(LAP)];
      for (let j = 0; j < TLAPS * LAP; j++) {
        const kk = ((j % LAP) + LAP) % LAP;
        const r = refOn(rec, kk);
        const u = corr ? corr.at(kk) : [0];
        const y = p.step(r + (u[0] || 0));
        const e = y - E.tempAt(MODEL, r);
        if (j >= (TLAPS - TAVG) * LAP) err[0][kk] += e / TAVG;
        if (j >= (TLAPS - 1) * LAP) { s2 += e * e; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },
  };
});

// THE TEACHER-FREE ①d RUNG, ARMED BY `DIRINV=1` AND PLACED FIRST BY `DIRFIRST=1` (plan §126).
// Its diet, nominal inverse and window come from this plant's `dirinvall.mjs` entry through the
// one shared wiring; unset spreads to nothing and the ladder is byte-identical (rule 21).
//
// THE PREDICTION, WRITTEN BEFORE THE RUN (rule 59): this plant's conventional rung takes 89.77x
// and leaves the distilled rung nothing (§86.5), so ①d placed AFTER it should find nothing
// either — a machine already corrected by four coefficients is not the bare one its open-loop
// segments describe (rule 34). Placed FIRST it inverts the machine it was fitted on, and
// `dirinvall.mjs` measures this route standalone at 95.6x, ABOVE the incumbent.
const DI = await dirInvFor(/real steam exchanger/i);

const spec = { ...realexchLadderSpec(MODEL, LIN ? 'linear' : 'nonlinear'),
  ...DI,
  depth: process.env.DEPTH !== undefined ? +process.env.DEPTH : 0,
  distil: { refDim: 1, ridge: env('RIDGE', 1e-6), offsets: OFFSETS,
    ...(ridgeLadder() ? { ridges: ridgeLadder() } : {}),
    ...(gainLadder() ? { gains: gainLadder() } : {}),
    ...(teacherReuse() ? {} : { teacherReuse: false }),
    ...(process.env.STD === '0' ? {} : { standardize: true }),
    ...(process.env.ONLINE === '0' ? { online: false } : {}) },
  distilRuns };

announce();
const price = priceFrom();
const { rep, auto, scoreOn } = await ladder(spec);
price.close({ dt: E.TS, rep });
await reportDistil({ rep, runs: distilRuns(), nFeat: OFFSETS.length + 1, auto });

// ------------------------------------------- target 1, on a recipe it was not scored on
/**
 * TARGET 1's OWN BAR (plan §88.1). The object this plant SHIPS is the conventional rung — the
 * distilled rung refuses at 0.045x — so what is scored here is a four-coefficient map of the
 * reference's own rate and acceleration, which is program-agnostic BY CONSTRUCTION. §87.8 wrote
 * the prediction down before the run: its ratio should read ~1.0, and a plant whose shipped
 * object cannot in principle depend on the program is the cleanest place for that bar to be met.
 * If it is not met here, the bar is measuring the harness rather than the object.
 */
const HELD_REC = [96.8, 99.2, 94.8, 98.6, 95.4];
const heldRef = (k) => [refOn(HELD_REC, Math.min(k, E.PROG - 1))];
const heldFresh = () => E.makeMachine(MODEL);
const hOff = await scoreOn({ refAt: heldRef, fresh: heldFresh, N: E.PROG }, { armed: false });
const hOn = await scoreOn({ refAt: heldRef, fresh: heldFresh, N: E.PROG });
/**
 * TARGET 1's BAR IS ONE-SIDED, AND THE FIRST VERSION OF THIS CHECK WAS NOT (plan §88.1).
 * The target reads *within 1.3x of a controller commissioned on each program individually, on
 * every program, with none made worse*, so what it forbids is the held-out program DELIVERING
 * LESS — a program that is easier, and on which the same object therefore reads a LARGER factor,
 * satisfies the target rather than failing it. Written symmetrically it duly went red on the real
 * cascaded tanks at 8.694x against 12.515x, which is the object doing better than it was asked to
 * (rule 19: the metric's support has to match the claim's).
 *
 * STATED, because it bounds what this number is worth: the comparator is the factor on the SCORED
 * program, not a per-program COMMISSION. A true per-program commission costs a second
 * commissioning per plant and is the stronger test; this is the cheap form, and it is the same
 * comparison the quadruple tank already carries (3.268x production against 2.657x held out).
 * Where the held-out factor is the larger, the cheap form is LOOSER than the target — the object
 * could still be short of what a commissioning on that program alone would have reached.
 */
const xProg = rep.base / rep.best, xHeld = hOff.score / hOn.score;
const ratio = Math.max(xProg, xHeld) / Math.min(xProg, xHeld);
console.log(`\n  TARGET 1 — the SAME object on a second recipe, no refit`);
console.log(`    scored recipe  ${E.RECIPE.join('→')}   `
  + `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}   ${xProg.toFixed(3)}x`);
console.log(`    held out       ${HELD_REC.join('→')}   `
  + `${hOff.score.toExponential(3)} → ${hOn.score.toExponential(3)}   ${xHeld.toFixed(3)}x`);
console.log(`    the held-out program delivers ${(xHeld / xProg).toFixed(3)}x of what the `
  + `scored one does; target 1 forbids < 0.769 (1/1.3), spread ${ratio.toFixed(3)}x\n`);
emitRow(rep, auto, { t1: xHeld / xProg, t1Worse: xHeld < 1 });
check('target 1: the held-out recipe is not made worse', hOn.score <= hOff.score * 1.02,
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
  + `recipe delivers ${(xHeld / xProg).toFixed(3)} of the scored factor`);

check('the exchanger is not made worse by anything the ladder ships',
  rep.best <= rep.base, `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}`);
// THE ①d RUNG IS ARMED-AND-REACHED, OR IT IS NOT ARMED (rule 9c, plan §126). §120 paid for the
// other state: `rigs/ladder.mjs` never forwarded `dirInv`, so a run PRINTED that it had armed the
// rung and the rung never ran — indistinguishable from a refusal (rule 25). `DI` non-empty is the
// harness's own intent; `rep.dirInv.rows` is the ladder saying the fit saw the plant.
if (DI.dirInv) {
  check('DIRINV=1 REACHED the rung — a fit with rows, not a printed banner (rule 9c)',
    !!(rep.dirInv && rep.dirInv.rows > 0),
    rep.dirInv ? JSON.stringify(rep.dirInv).slice(0, 140) : 'rep.dirInv is absent entirely');
}

check('the distilled rung reached the plant — a fit, a refusal with a reason, or a stated skip, '
  + 'never silence (rule 25)',
  !!(rep.distil && (rep.distil.policy || rep.distil.note || rep.distil.error)),
  JSON.stringify(rep.distil || null));
console.log(failed ? `\n  ${failed} check(s) failed\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);
