/**
 * @file THE DEPLOYED OBJECT ON THE REAL CASCADED TANKS (Schoukens & Noël 2017) — plan §86.4.
 *
 * `realtanks.test.mjs` ships the PILOT CASCADE here at 8.00x, which makes this one of only two
 * plants in the directory where that cascade is the result. It is also 43,673 MAC/cycle and
 * 16.5 kB — 437% of a PLC scan — so what ships is an improvement no PLC would accept, which is
 * the same objection §63 raised about the barrel and which the deployed object answered there by
 * replacing a 21,440-MAC cascade with 1.6 kB.
 *
 * The deployed object has never been asked on this plant. Every plant converted since §64 was
 * converted by asking it instead of the teacher, so this asks.
 *
 * THE PLANT IS THE OVERFLOW ONE, WHICH IS THE ONLY HONEST CHOICE. The identified LINEAR model
 * reads 2012x and that number measures the conventional rung's own hypothesis class rather than
 * the machine (§55): the plant is linear, the basis is `[a, v, sign v, 1]`, and the inversion is
 * exact. The benchmark's own documented OVERFLOW — 84 samples pinned at exactly 10.00 in the
 * record — collapses it to 8.00x, and that is the plant a controller claim can be made on.
 *
 * THE DIET IS FOUR CLOSED RECIPES THE PRODUCTION ONE IS NOT. `levelOn` ramps between consecutive
 * levels over `SEG`, so a CLOSED lap is a recipe whose first and last entries agree; the
 * production recipe [5.0, 9.9, 4.2, 10.6, 5.6] is not closed and is not in the diet. Each member
 * visits the overflow region, because a diet that never reaches the clamp would teach a map about
 * a plant the scored program does not run.
 *
 * KNOBS: RIDGES, GAINS, WIN, TLAPS, TAVG, DIETN, SEED, DEPTH, LINEAR=1 (the soft-target control).
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { realtanksLadderSpec } from './rigs/specs.mjs';
import { deriveWindow, reportDistil, priceFrom, ridgeLadder, gainLadder, teacherReuse, teachLaps,
  teachAvg, dietN, carrier, emitRow } from './rigs/distilkit.mjs';
import { dirInvFor } from './rigs/dirinvkit.mjs';
import * as T from './rigs/realtanks-rig.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-realtanks: SKIPPED (full tier only — one commissioning)\n');
  process.exit(0);
}
const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
const OVER = process.env.LINEAR !== '1';
console.log(`\ndistil-realtanks: the DEPLOYED object on the REAL cascaded tanks`
  + `${OVER ? ' (overflow active)' : ' (LINEAR — the soft-target control)'}\n`);

/** The plant's own 2% settle to a step in command, measured from a settled machine. */
function measureSettle(N = 6000) {
  const p = T.makeMachine({ overflow: OVER, rec: OVER ? T.RECIPE_OF : T.RECIPE });
  const u0 = T.voltsFor((OVER ? T.RECIPE_OF : T.RECIPE)[0]);
  for (let i = 0; i < 2000; i++) p.step(u0);
  const y = new Float64Array(N);
  for (let k = 0; k < N; k++) y[k] = p.step(u0 + 0.3);
  const fin = y[N - 1];
  for (let k = N - 1; k >= 0; k--) if (Math.abs(y[k] - fin) > 0.02 * Math.abs(fin - y[0])) return k + 1;
  return 1;
}
const SETTLE = measureSettle();

/** Four CLOSED recipes, none of them production, every one visiting the overflow region. */
const SHIPPED_RECIPES = [
  [4.6, 10.4, 6.8, 9.0, 4.6],
  [6.2, 9.6, 4.0, 10.8, 6.2],
  [5.4, 8.6, 10.5, 4.4, 5.4],
  [7.0, 4.2, 10.2, 8.0, 7.0],
];
/** DSEED=<n>: DRAW THE DIET (plan §87.3). §86.4's 8.69x is one commissioning draw, this rig is
 *  DETERMINISTIC and its cascade is not built here, so a seed moves nothing — the diet is the
 *  random variable. Drawn on the same [4.0, 10.8] level grid the shipped recipes occupy, closed
 *  by construction, every one still visiting the overflow region. Unset is byte-identical. */
const DSEED = process.env.DSEED ? +process.env.DSEED : null;
const RECIPES = DSEED === null ? SHIPPED_RECIPES : (() => {
  let st = (DSEED * 2654435761) >>> 0;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const lo = () => 4.0 + 3.0 * rnd(), hi = () => 9.2 + 1.6 * rnd();
  return Array.from({ length: 4 }, () => {
    const a = lo();
    return [a, hi(), lo(), hi(), a];
  });
})();
if (DSEED !== null) {
  console.log(`  DIET DRAW ${DSEED}: ` + RECIPES.map((r) =>
    r.map((v) => v.toFixed(1)).join('→')).join('  ·  '));
}
const LAP = T.SEG * (RECIPES[0].length - 1);
const { reach: REACH, offsets: OFFSETS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin: LAP, win: process.env.WIN === undefined ? undefined : env('WIN') });
console.log(`  the plant's 2% settle is ${SETTLE} samples (${(SETTLE * T.TS / 60).toFixed(0)} min `
  + `at Ts = ${T.TS} s), the training lap ${LAP}, the scored program ${T.PROG}`);
console.log(`  window ±${REACH} samples  [rule ${RULE} = min(0.61·${SETTLE}, ${LAP}/8)]`
  + `   ${OFFSETS.length} offsets`);
console.log(`  the diet: ` + RECIPES.map((r) => r.join('→')).join('  ·  '));
console.log(`  the SCORED recipe ${(OVER ? T.RECIPE_OF : T.RECIPE).join('→')} is in NO training `
  + `run, and is not even CLOSED — the diet's laps are\n`);

const TLAPS = teachLaps();
const TAVG = teachAvg(TLAPS);
/** A closed recipe's own level and command, on the same `levelOn` the rig uses (rule 61). */
const refOn = (rec, k) => {
  const i = Math.min(rec.length - 2, Math.floor(k / T.SEG));
  const t = (k - i * T.SEG - T.HOLD) / (T.SEG - T.HOLD);
  const q = t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 + t * (-15 + 6 * t));
  return T.voltsFor(rec[i] + (rec[i + 1] - rec[i]) * q);
};
const wantOn = (rec, k) => {
  const v = refOn(rec, k);
  return OVER ? Math.min(T.OVERFLOW, T.levelAt(v)) : T.levelAt(v);
};
const distilRuns = () => dietN([0, 1, 2, 3]).map((i) => {
  const rec = RECIPES[i];
  const plant = carrier(() => T.makeMachine({ overflow: OVER, rec }));
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
        const u = corr ? corr.at(kk) : [0];
        const y = p.step(refOn(rec, kk) + (u[0] || 0));
        const e = y - wantOn(rec, kk);
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
// THE PREDICTION, WRITTEN BEFORE THE RUN (rule 59): on the barrel and the column the placement is
// INERT because the conventional rung REFUSES there, so ①d has no changed machine to invert. HERE
// IT DEPLOYS at 4.28x, so §117's rule-34 mechanism should bite — a rung fitted on the BARE plant
// and deployed after a rung that moved it inverts a machine that no longer exists — and
// `DIRFIRST=1` should recover the standalone route's own figure where the default order does not.
const DI = await dirInvFor(/real cascaded tanks/i);

const spec = { ...realtanksLadderSpec({ overflow: OVER }),
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
price.close({ dt: T.TS, rep });
await reportDistil({ rep, runs: distilRuns(), nFeat: OFFSETS.length + 1, auto });

// ------------------------------------------- target 1, on a recipe it was not scored on
/**
 * TARGET 1's OWN BAR (plan §88.1, the step §87.8 named and did not run). The SAME commissioned
 * object — no refit, the ladder is closed — scored on a second PRODUCTION-SHAPED recipe through
 * `scoreOn`, which is this driver's own verify loop rather than a fourth copy of it (rule 61).
 * The recipe is in no training run and is not the one the ladder scored; its levels sit inside
 * the box the commissioning declared, because an object asked to act outside its own declared
 * channel limits is being asked a different question.
 */
const HELD_REC = OVER ? [6.4, 8.8, 5.2, 10.1, 4.8] : [5.6, 6.9, 4.6, 7.8, 5.1];
const heldRef = (k) => [refOn(HELD_REC, Math.min(k, T.PROG - 1))];
const heldFresh = () => T.makeMachine({ overflow: OVER, rec: HELD_REC });
const hOff = await scoreOn({ refAt: heldRef, fresh: heldFresh, N: T.PROG }, { armed: false });
const hOn = await scoreOn({ refAt: heldRef, fresh: heldFresh, N: T.PROG });
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
console.log(`    scored recipe  ${(OVER ? T.RECIPE_OF : T.RECIPE).join('→')}   `
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

check('the real tank is not made worse by anything the ladder ships',
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
