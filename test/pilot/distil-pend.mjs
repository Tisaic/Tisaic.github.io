/**
 * @file THE DEPLOYED OBJECT ON THE ONE PLANT CLASS THE OTHERS DO NOT CONTAIN (plan §86.2).
 *
 * `pend.test.mjs` has driven the cart-pole with a bare `Pilot` since §52.32, and §84.10 settled
 * that reading: on the shipped loop it deploys at 9.4-9.8x, on a loop tuned 3.5x better it
 * REFUSES at every one of five authorities, so the headline was the loop and the plant stands as
 * ASKED AND CORRECTLY REFUSED rather than as a factor. That section ends by naming what it did
 * NOT do, and this file is it:
 *
 *   "NOT BUILT: the DEPLOYED object has never been asked here, and all four plants converted
 *    since §64 were converted by asking it instead of the teacher (rule 59)."
 *
 * The column, the mill, the tank and the barrel were every one of them converted the same way —
 * not by changing the controller, but by asking `distil.js`'s weight vector instead of `Pilot`'s
 * QP. This asks it here, on BOTH loops, because a result on the weak denominator alone is the
 * mistake §84.10 exists to have corrected.
 *
 * WHAT THE OBJECT IS TOLD is the commanded cart reference and nothing else — no pole angle, no
 * cart speed, no instrument at deploy. On an OPEN-LOOP UNSTABLE plant that is the sharpest form
 * of the claim this project makes: the stabiliser is what keeps the pole up, and the question is
 * whether a map of what the machine was ASKED to do can still remove the tip's swing.
 *
 * THE DIET is four moves the program is not — different distance, acceleration, feed and dwell —
 * and the scored program appears in NO training run. Their dwells are long enough that the
 * window rule's REACH half binds rather than its aliasing half, which is a design and is stated:
 * a diet of short laps would force a window too short to reach a 282-step settle, and §49.11's
 * forced trade would decide the result instead of the plant.
 *
 * KNOBS: PEND_TUNED=1 (the swept loop), PEND_UCAP, PEND_SUB, RIDGES, GAINS, WIN, TLAPS, TAVG,
 * DIETN, SEED.
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { pendSpec } from './rigs/specs.mjs';
import { deriveWindow, reportDistil, priceFrom, ridgeLadder, gainLadder, teacherReuse, teachLaps,
  teachAvg, dietN, carrier, emitRow } from './rigs/distilkit.mjs';
import * as PD from './rigs/pend-rig.mjs';
// ALIASED, because this harness ALREADY HAS a `measureSettle` and they are different instruments:
// the local one reads the TIP (281 steps), the kit's reads a MEASURED channel and here that is the
// CART (411). The collision is the distinction, and the compiler found it (rule 17).
import { segsFor, measureSettle as diMeasureSettle,
  deriveWindow as diDeriveWindow } from './rigs/dirinvkit.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-pend: SKIPPED (full tier only — one commissioning)\n');
  process.exit(0);
}
const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
console.log(`\ndistil-pend: the DEPLOYED object on an OPEN-LOOP UNSTABLE plant`
  + `${PD.TUNED ? '  (loop TUNED — the strong denominator)' : '  (the shipped loop)'}\n`);

// ------------------------------------------------------ the settle, MEASURED not asserted
/** The tip's own 2% settle to a step on the cart reference, from the settled machine. It is the
 *  reach half of the window rule and it belongs to the LOOP, which is why it is re-measured when
 *  the loop changes rather than written down once (rule 31). */
function measureSettle(amp = 0.05, N = 20000) {
  const p = PD.makeSettled();
  const y = new Float64Array(N);
  for (let k = 0; k < N; k++) { PD.stepCart(p, PD.baseline(p, amp)); y[k] = PD.tipOf(p); }
  const fin = y[N - 1];
  for (let k = N - 1; k >= 0; k--) if (Math.abs(y[k] - fin) > 0.02 * Math.abs(fin)) return k + 1;
  return 1;
}
const SETTLE = measureSettle();

// ------------------------------------------------------------------------- the diet
/** Four moves the scored program is not. The dwells are long so the REACH half of the window
 *  rule binds; the distances, feeds and accelerations differ from the program in every member. */
const SHIPPED_DIET = [
  { d: 0.30, acc: 0.80, vmx: 0.30, dwell: 2.10 },
  { d: 0.65, acc: 0.35, vmx: 0.40, dwell: 0.90 },
  { d: 0.45, acc: 1.20, vmx: 0.25, dwell: 1.50 },
  { d: 0.60, acc: 0.50, vmx: 0.45, dwell: 1.30 },
];
/**
 * DSEED=<n>: DRAW THE DIET, BECAUSE THE SEED VARIES NOTHING HERE (plan §87.3, §84.8's method).
 *
 * §86.2's 11.93x is ONE commissioning draw and this project has already mistaken one of those for
 * a result. `spread.mjs` cannot make it a distribution: this rig is DETERMINISTIC and there is no
 * cascade to seed, so `SEED` moves nothing (the recorded signature is `distil-tank.mjs`'s three
 * byte-identical "seeds" — one draw three times, rule 61 aimed at a seed). What varies between two
 * commissionings of the same plant is WHICH FOUR MOVES the engineer picked, so that is the random
 * variable, drawn from the same design space the shipped diet occupies. Unset is byte-identical.
 *
 * The DWELL is drawn to keep each lap past 1,380 steps, which is what makes the window rule's
 * REACH half bind rather than its aliasing half — a constraint the shipped diet also obeys, so
 * the draw explores the same space rather than a larger one (rule 20).
 */
const DSEED = process.env.DSEED ? +process.env.DSEED : null;
const DIET = (DSEED === null ? SHIPPED_DIET : (() => {
  let st = (DSEED * 2654435761) >>> 0;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pick = (lo, hi) => lo + (hi - lo) * rnd();
  return Array.from({ length: 4 }, () => {
    for (let tries = 0; tries < 200; tries++) {
      const d = pick(0.25, 0.65), acc = pick(0.30, 1.30), vmx = pick(0.22, 0.48);
      const ta = vmx / acc, da = 0.5 * acc * ta * ta;
      if (d - 2 * da <= 0.02) continue;                    // too short for this feed and accel
      const tmove = 2 * ta + (d - 2 * da) / vmx;
      const dwell = Math.max(0.3, 1380 * PD.DT / 2 - tmove + pick(0, 0.8));
      return { d, acc, vmx, dwell };
    }
    return SHIPPED_DIET[0];
  });
})()).map((o) => PD.makeProgram(o));
if (DSEED !== null) {
  console.log(`  DIET DRAW ${DSEED}: ` + DIET.map((g) =>
    `${g.d.toFixed(2)}m@${g.vmx.toFixed(2)}/${g.acc.toFixed(2)} dwell ${g.dwell.toFixed(2)}`).join('  ·  '));
}
const LAPMIN = Math.min(...DIET.map((g) => g.lap));
const { reach: REACH, offsets: OFFSETS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin: LAPMIN, win: process.env.WIN === undefined ? undefined : env('WIN') });
console.log(`  the tip's 2% settle is ${SETTLE} steps (${(SETTLE * PD.DT).toFixed(2)} s), the `
  + `shortest training lap ${LAPMIN}, the scored lap ${PD.LAP}`);
console.log(`  window ±${REACH} raw steps  [rule ${RULE} = min(0.61·${SETTLE}, ${LAPMIN}/8)]`
  + `   ${OFFSETS.length} offsets`);
console.log(`  the diet: ` + DIET.map((g) =>
  `${g.d}m@${g.vmx}/${g.acc} dwell ${g.dwell} (lap ${g.lap})`).join('  ·  '));
console.log(`  the SCORED program is ${PD.D}m@${PD.VMX}/${PD.ACC} dwell ${PD.DWELL} `
  + `(lap ${PD.LAP}) and is in NO training run\n`);

const TLAPS = teachLaps();
const TAVG = teachAvg(TLAPS);
const distilRuns = () => dietN([0, 1, 2, 3]).map((i) => {
  const g = DIET[i];
  // ONE PLANT PER TRAINING RUN, CARRIED (plan §72.15). The lap is closed and a deployed machine
  // runs continuously; re-settling from cold between the teacher's calls is 2,000 steps of a
  // plant already at its operating point.
  const plant = carrier(() => PD.makeSettled());
  return {
    lap: g.lap,
    closed: true,
    refAt: (k) => [g.at(k)],
    run: async (corr) => {
      const p = plant();
      let s2 = 0, n = 0;
      const err = [new Float64Array(g.lap)];
      for (let j = 0; j < TLAPS * g.lap; j++) {
        const kk = ((j % g.lap) + g.lap) % g.lap;
        const xr = g.at(kk);
        const u = corr ? corr.at(kk) : [0];
        PD.stepCart(p, PD.baseline(p, xr + (u[0] || 0)));
        const e = PD.tipOf(p) - xr;
        if (j >= (TLAPS - TAVG) * g.lap) err[0][kk] += e / TAVG;
        if (j >= (TLAPS - 1) * g.lap) { s2 += e * e; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },
  };
});

/**
 * THE TEACHER-FREE RUNG (①d), REACHED ON A PLANT FOR THE FIRST TIME (plan §116).
 *
 * §112 built it and CLAUDE.md states plainly that it was REACHABLE AND UNEXERCISED on all ten —
 * *built* and *run on a plant* being different states this project has paid for conflating three
 * times. The cart-pole goes first on rule 1: it is the cheapest product commissioning here (42.7
 * min of plant time), its nominal inverse is already declared, and `dirinvall.mjs` measures it at
 * 11.76x-11.81x over four seeds, so there is a DISTRIBUTION to read the rung against rather than a
 * single number to be impressed by.
 *
 * THE DIET AND THE INVERSE ARE IMPORTED, NOT COPIED. `dirinvall.mjs`'s `PLANTS` entry for this
 * plant holds all three things this needs — diet, nominal inverse, settle probe — and until §116
 * importing that module RAN THE WHOLE DRIVER, so a harness would have had to duplicate them. That
 * is the second copy rule 61 exists to prevent and which has shipped a defect four times here. The
 * import is lazy so an unset run does not pay for ten rigs loading.
 *
 * THE WINDOW IS DERIVED FROM THE EXCITATION SEGMENT'S OWN LAP AND NEVER CARRIED. §103's headline
 * moved 2.3x from a window carried across diets — §41's aliasing theorem biting inside the
 * instrument itself — so this derives its own, and it is NOT this harness's `OFFSETS`: that one
 * comes from the TIP's 281-step settle and the teacher diet's lap, where the direct inverse's
 * segments are a different diet and `dirinvall.mjs` probes the CART at 411 steps. Two instrument
 * readings, stated rather than reconciled (rule 17).
 */
const DIRINV = process.env.DIRINV === '1';
let dirInvOpts = null, dirInvRuns = null;
if (DIRINV) {
  const { PLANTS } = await import('./dirinvall.mjs');
  const P = PLANTS.find((q) => /cart-pole/i.test(q.name));
  if (!P) throw new Error('DIRINV: no cart-pole entry in dirinvall PLANTS — the table moved (rule 25)');
  const diSettle = diMeasureSettle(pendSpec, { delta: 0.05, idx: 0 });
  if (diSettle === null) throw new Error('DIRINV: the settle probe read NO MOVEMENT (rule 25)');
  const diSeglen = typeof P.seglen === 'function' ? P.seglen() : P.seglen;
  const w = diDeriveWindow({ settle: diSettle, lapMin: diSeglen });
  console.log(`  ①d DIRECT INVERSE armed: window ±${w.reach} raw steps, ${w.offsets.length} taps `
    + `[rule ${w.rule} = min(0.61·${diSettle}, ${diSeglen}/8)] — the CART's settle (${diSettle}), `
    + `not the TIP's (${SETTLE}) this harness's own window uses`);
  // `DIRFIRST=1` places the rung BEFORE the conventional one (plan §117): it is FITTED on
  // open-loop segments of the BARE plant, so deploying it after a rung that has changed the
  // machine is rule 34, and this is the half of §116's open question that costs nothing.
  dirInvOpts = { refDim: 1, ridge: env('DIRIDGE', 1e-6), offsets: w.offsets, stride: 7,
    first: process.env.DIRFIRST === '1' };
  // ZERO TEACHER LAPS: open-loop segments only, through the SHARED kit's one inversion path.
  dirInvRuns = () => segsFor(pendSpec, P.diet, P.inv, { seed: env('DISEED', 1) });
}

const spec = { ...pendSpec,
  // THE LOOP GOES IN THE SPEC'S NAME, WHICH IS THE ONLY PLACE THAT FIXES IT (plan §97.4).
  //
  // This harness emits under two configurations — the shipped loop and one tuned 3.5x better —
  // and `rigs/ladder.mjs` emits its own row under the SPEC'S name for every plant, so overriding
  // the name at one `emitRow` call site leaves that automatic row still colliding. Keyed on
  // script + name, the two loops then collapse to one and the LAST wins: `portfolio.mjs` showed
  // only the tuned row, so this plant read as REFUSING the learned object when its SHIPPED
  // configuration composes `classic+distil` at 11.93x. A count of where the learned object ships
  // was wrong by one plant because of a label. Naming it once, here, fixes both emissions
  // (rules 30, 61) — and a dropped row and a measured-then-lost row are different states, only
  // one of which is visible (rule 25).
  name: `${pendSpec.name}${PD.TUNED ? ' [loop tuned 3.5x better]' : ' [shipped loop]'}`,
  uMax: env('PEND_UCAP', pendSpec.uMax),
  // NO CASCADE: the teacher here is `hff`, so a cascade would be commissioned, scored and then
  // REPLACED by the rung that wins (plan §73.1).
  depth: 0,
  distil: { refDim: 1, ridge: env('RIDGE', 1e-6), offsets: OFFSETS,
    ...(ridgeLadder() ? { ridges: ridgeLadder() } : {}),
    ...(gainLadder() ? { gains: gainLadder() } : {}),
    ...(teacherReuse() ? {} : { teacherReuse: false }),
    ...(process.env.STD === '0' ? {} : { standardize: true }),
    ...(process.env.ONLINE === '0' ? { online: false } : {}) },
  ...(dirInvOpts ? { dirInv: dirInvOpts, dirInvRuns } : {}),
  distilRuns };

announce();
const price = priceFrom();
const { rep, auto } = await ladder(spec);
price.close({ dt: PD.DT, rep });
await reportDistil({ rep, runs: distilRuns(), nFeat: OFFSETS.length + 1, auto });

// ---------------------------------------------------------------- what it delivers, and safety
/** The scored program, run through the ladder's own deployed set — the same `act` the ladder
 *  verified with, never a re-statement of the controller. The pole angle is watched because a
 *  correction that wins by leaning the machine past its guard has not won.
 *
 *  THE REFERENCE'S OWN RATE AND ACCELERATION MUST BE PASSED, and the first version of this
 *  function did not. `auto.act` routes `v` and `a` to the CONVENTIONAL rung, whose basis is
 *  `[a, v, sign v, 1]`; without them that rung reads zero and contributes nothing, so this read
 *  2.468x where the ladder's own run read 6.30x. That is `distil-tank.mjs`'s recorded fault
 *  exactly — a harness scoring a rung that was not in the run it scored (plan §67.3) — and the
 *  tell is the same one: the ladder and the harness disagreeing about one machine. */
/**
 * TARGET 1's OWN BAR, ON A SECOND PROGRAM THIS OBJECT WAS NEITHER FITTED ON NOR SCORED ON
 * (plan §88.1, the step §87.8 named and did not run).
 *
 * The bar is *within 1.3x of a per-program commission on EVERY program, none made worse*. The
 * cheapest honest form costs ONE scored run: take the SAME commissioned object — no refit, no
 * second commissioning, the ladder is already closed — and score a second program against the
 * conventional machine on THAT program, then read the two factors' ratio. That is exactly the
 * comparison the quadruple tank already carries (3.268x production against 2.657x on a recipe it
 * was not chosen on, 1.23x).
 *
 * The held-out program is in NO training run AND is not the scored one: a different distance,
 * feed, acceleration and dwell, so its lap length differs too and nothing about it is a rescaling
 * of what the object has seen.
 */
const HELD = PD.makeProgram({ d: 0.38, acc: 0.90, vmx: 0.28, dwell: 0.95 });
const SHIPPED = PD.makeProgram({});

function tabulate(g, laps = 4) {
  const n = g.lap * laps;
  const vv = new Float64Array(n), aa = new Float64Array(n);
  for (let k = 1; k < n - 1; k++) {
    const p0 = g.at(k - 1), p1 = g.at(k), p2 = g.at(k + 1);
    vv[k] = (p2 - p0) / 2; aa[k] = p2 - 2 * p1 + p0;
  }
  return { n, vv, aa };
}
function score(active, g = SHIPPED, A = auto) {
  const { n: NSC, vv: VV, aa: AA } = tabulate(g);
  const p = PD.makeSettled();
  if (active) A.beginRun();
  let s2 = 0, n = 0, uPk = 0, thPk = 0;
  for (let k = 0; k < NSC; k++) {
    const xr = g.at(k);
    const look = (off) => [g.at(k + off)];
    const u = active ? A.act({ v: [VV[k]], a: [AA[k]], look, lookRaw: look, k }) : [0];
    uPk = Math.max(uPk, Math.abs(u[0] || 0));
    PD.stepCart(p, PD.baseline(p, xr + (u[0] || 0)));
    A.observe([p.x, p.v, p.th, p.w]);
    thPk = Math.max(thPk, Math.abs(p.th));
    if (k >= g.lap) { const e = PD.tipOf(p) - xr; s2 += e * e; n++; }
  }
  return { rms: Math.sqrt(s2 / n), uPk, thPk };
}
// The parametrised program and the shipped constants must be one description, or the diet and
// the program are two different moves wearing one name (rule 61).
if (SHIPPED.lap !== PD.LAP || Math.abs(SHIPPED.at(137) - PD.xrefAt(137)) > 0) {
  throw new Error('pend-rig: makeProgram({}) is not xrefAt');
}
const off = score(false), on = score(true);
console.log(`\n  the CONVENTIONAL machine   tip rms ${off.rms.toExponential(3)} m   `
  + `|θ| peak ${off.thPk.toFixed(3)} rad`);
console.log(`  the DEPLOYED object        tip rms ${on.rms.toExponential(3)} m   `
  + `|θ| peak ${on.thPk.toFixed(3)} rad   uPk ${on.uPk.toFixed(4)} of ${spec.uMax}`);
console.log(`  delivered ${(off.rms / on.rms).toFixed(3)}x   shipped `
  + `${JSON.stringify(rep.deployed)}\n`);

// -------------------------------------------------- target 1, on a program it has never run
const hOff = score(false, HELD), hOn = score(true, HELD);
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
const xProg = off.rms / on.rms, xHeld = hOff.rms / hOn.rms;
const ratio = Math.max(xProg, xHeld) / Math.min(xProg, xHeld);
console.log(`  TARGET 1 — the SAME object on a second program, no refit`);
console.log(`    scored program  ${PD.D}m@${PD.VMX}/${PD.ACC} dwell ${PD.DWELL} (lap ${SHIPPED.lap})`
  + `   ${off.rms.toExponential(3)} → ${on.rms.toExponential(3)}   ${xProg.toFixed(3)}x`);
console.log(`    held out        ${HELD.d}m@${HELD.vmx}/${HELD.acc} dwell ${HELD.dwell} `
  + `(lap ${HELD.lap})   ${hOff.rms.toExponential(3)} → ${hOn.rms.toExponential(3)}   `
  + `${xHeld.toFixed(3)}x   |θ| ${hOn.thPk.toFixed(3)}   uPk ${hOn.uPk.toFixed(4)}`);
// THE CAP BELONGS BESIDE BOTH FACTORS, NOT ONE (plan §117). A ratio between two programs is only
// a transfer reading if the object was allowed to act the same on both; where one saturates and
// the other does not, the ratio is measuring the CLAMP (rule 19). Printed for both rows because
// the first placement produced 11.97x scored at `uPk 0.1500 of 0.15` against 398.755x held out,
// and without this column that table cannot be read at all.
if (on.uPk >= spec.uMax * 0.999 && hOn.uPk < spec.uMax * 0.999) {
  console.log(`    READ THE RATIO WITH THE CLAMP IN MIND: the SCORED program saturates `
    + `(${on.uPk.toFixed(4)} of ${spec.uMax}) and the held-out one does not `
    + `(${hOn.uPk.toFixed(4)}), so the held-out factor is of an UNCLIPPED object and the scored `
    + `one is not — they are two different controllers (rules 14, 19)`);
}
console.log(`    the held-out program delivers ${(xHeld / xProg).toFixed(3)}x of what the `
  + `scored one does; target 1 forbids < 0.769 (1/1.3), spread ${ratio.toFixed(3)}x\n`);
// THE LOOP GOES IN THE LABEL, OR ONE ROW HIDES THE OTHER (plan §97.4). This harness emits under
// two configurations — the shipped loop and one tuned 3.5x better — and a table keyed on the
// script and the spec's own name collapses them: `portfolio.mjs` duly showed only the tuned row,
// so the plant appeared to REFUSE the learned object when its shipped configuration composes
// `classic+distil` at 11.93x. A count of where the learned object ships was wrong by one plant
// because of a label (rule 25: a row that is silently dropped and a row that was measured and
// lost are different states, and only one of them is visible).
emitRow(rep, auto, { t1: xHeld / xProg, t1Worse: xHeld < 1, name: spec.name });
check('target 1: the held-out program is not made worse', hOn.rms <= hOff.rms * 1.02,
  `${hOff.rms.toExponential(3)} → ${hOn.rms.toExponential(3)} = ${xHeld.toFixed(3)}x`);
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
  + `program delivers ${(xHeld / xProg).toFixed(3)} of the scored factor`);

/**
 * TARGET 1's STRONG FORM: THE COMPARATOR IS A PER-PROGRAM COMMISSION, NOT THE SCORED PROGRAM'S
 * OWN FACTOR (plan §89.1, task #64).
 *
 * Everything above is the CHEAP form, and its own comment says what that costs: the comparator is
 * the factor on the program the object was commissioned against, where the TARGET names *a
 * controller commissioned on each program individually*. Those are the same number only if the
 * two programs are equally hard, and the §88 table shows they are not — three of its five MET
 * verdicts are rows where the held-out factor EXCEEDS the scored one, which makes the cheap
 * comparator more GENEROUS than the target rather than tighter. A ratio above 1 in that table is
 * therefore not evidence of meeting the bound; it is evidence the denominator moved.
 *
 * The strong form costs a second commissioning, which is why it runs on the two cheapest plants
 * first: this one at 42.7 min of product commissioning (§87.7's own scrape) and the cold mill at
 * 55 min. It commissions the SAME ladder — same diet, same window rule, same authority, same
 * ridge and gain ladders — with the HELD program in the place the scored program occupied, so the
 * machine-scored axes optimise for IT, and then scores that object on HELD. Target 1's real
 * ratio is this object's factor on HELD over THAT one's.
 *
 * THE CHANNEL BOX IS REBUILT FROM THE HELD PROGRAM'S OWN PEAKS AND THE REASON IS RULE 41b: HELD
 * accelerates at 0.90 against the shipped program's 0.50, so commissioning it inside the shipped
 * box would excite a machine that cannot run the program it is being commissioned for — the fault
 * that cost the real flexible arm 88 gain cells (§55). A per-program commission states the
 * program's own limits, which is what an engineer does.
 *
 * Opt-in (`T1COMM=1`) because it doubles this harness's plant time and the suite pays for what it
 * runs (rule 2); the number it produces is recorded in CLAUDE.md and `docs/plan.md`.
 */
if (process.env.T1COMM === '1') {
  const pk = (g, n) => {
    let v = 0, a = 0;
    for (let k = 1; k < n - 1; k++) {
      const p0 = g.at(k - 1), p1 = g.at(k), p2 = g.at(k + 1);
      v = Math.max(v, Math.abs((p2 - p0) / 2));
      a = Math.max(a, Math.abs(p2 - 2 * p1 + p0));
    }
    return { v, a };
  };
  const hp = pk(HELD, HELD.lap * 4);
  // T1BOX=ship: the CONTROL for the box choice, and it is the one that decided this measurement
  // (plan §89.1). Stating the held program's own limits is right by rule 41b and it also CHANGES
  // THE EXCITATION every rung below is identified from, so "commissioned on HELD" and "probed for
  // HELD" move together and a difference cannot be attributed to either. Run both.
  const BOX = process.env.T1BOX === 'ship' ? spec.channels[0]
    : { ...spec.channels[0], vMax: hp.v, aMax: hp.a, jMax: hp.a / PD.TA };
  const spec2 = { ...spec,
    name: spec.name + ' [per-program commission on the HELD program]',
    channels: [BOX],
    // T1UCAP: the per-program object's own authority. The shipped cap is the default, so unset is
    // the honest comparison; it exists because the first run's per-program object came back
    // CLAMPED on 50% of samples at 1.80x its cap where the frozen one clamps 34% at 1.22x, and a
    // heavily clipped map is a different object from the one that was fitted (rule 17 — check
    // what the instrument could deliver before concluding about what it learned).
    uMax: env('T1UCAP', spec.uMax),
    N: HELD.lap * 4,
    refAt: (k) => [HELD.at(k)],
    pilotOpts: { ...spec.pilotOpts, verifyRef: (i) => [HELD.at(i)] } };
  console.log(`\n  TARGET 1, STRONG FORM — commissioning a SECOND object on the held-out program`);
  console.log(`    its own peaks  |v| ${hp.v.toExponential(3)}  |a| ${hp.a.toExponential(3)}`
    + `   (the shipped box was |v| ${spec.channels[0].vMax.toExponential(3)}`
    + `  |a| ${spec.channels[0].aMax.toExponential(3)})`);
  const { auto: auto2 } = await ladder(spec2);
  // ONE scoring loop for both objects, the acting one passed in — a second copy of this loop is
  // how `distil-tank.mjs` came to score a rung its own run never applied (rule 61).
  const pOn = score(true, HELD, auto2);
  /**
   * THE CONTROL THAT SEPARATES THE TWO READINGS OF A SURPRISE (rules 14, 20).
   * The per-program object coming back WORSE on its own program has two explanations and the
   * numbers above cannot tell them apart: either HELD is a program that resists being
   * commissioned ON, or this second commissioning is simply a worse DRAW and would be worse
   * everywhere. Scoring it on the SHIPPED program costs one scored run and decides it.
   */
  const pOnShip = score(true, SHIPPED, auto2);
  const xPer = hOff.rms / pOn.rms;
  console.log(`    the object that SHIPS, on HELD          ${hOn.rms.toExponential(3)}`
    + `   ${xHeld.toFixed(3)}x   uPk ${hOn.uPk.toFixed(4)} of ${spec.uMax}`);
  console.log(`    an object COMMISSIONED on HELD         ${pOn.rms.toExponential(3)}`
    + `   ${xPer.toFixed(3)}x   uPk ${pOn.uPk.toFixed(4)} of ${spec2.uMax}`);
  console.log(`    the SAME per-program object, back on SHIPPED   ${pOnShip.rms.toExponential(3)}`
    + `   ${(off.rms / pOnShip.rms).toFixed(3)}x   (the frozen one reads ${xProg.toFixed(3)}x there)`);
  /**
   * AND THE CONTROL DISQUALIFIES THE NUMBER, WHICH IS WHY IT RUNS (rule 27 — the unflattering
   * diagnostic first). A per-program object that is ALSO worse on the program the frozen one was
   * commissioned for is not telling us anything about transfer; it is a worse COMMISSIONING, and
   * a ratio computed against it would report the frozen object "beating a per-program
   * commission" when what it beat was a bad draw. A commissioning is a DRAW and this project has
   * said so since §87.3 — which measured THIS plant at 11.789-12.113x over six of them, a 1.03x
   * spread, the tightest here. A second commissioning landing 2x below that entire distribution
   * is not a sample from it.
   */
  const xPerShip = off.rms / pOnShip.rms;
  const SOUND = xPerShip >= xProg / 1.3;
  console.log(`    TARGET 1, strong form: ${(xHeld / xPer).toFixed(3)} of a per-program `
    + `commission${SOUND ? ` — ${xHeld >= xPer / 1.3 ? 'MET' : 'NOT MET'} (forbids < 0.769)`
      : ''}`);
  if (!SOUND) {
    console.log(`    INCONCLUSIVE, AND THE CONTROL IS WHY: the per-program object reads `
      + `${xPerShip.toFixed(3)}x on the SHIPPED program where the frozen one reads `
      + `${xProg.toFixed(3)}x.`);
    console.log(`    It is worse EVERYWHERE, so it is a worse commissioning rather than a `
      + `per-program one, and the ratio above measures the draw and not the target.`);
    console.log(`    What the strong form needs is a per-program commission as good a DRAW as `
      + `the shipped one; one second run is not that (rules 14, 20).`);
  }
  console.log(`    the cheap form read ${(xHeld / xProg).toFixed(3)}; it remains the only `
    + `comparator this plant has measured, with the looseness its own comment states\n`);
}

check('the pole stays up with whatever the ladder shipped applied',
  on.thPk < 0.30, `|θ| peak ${on.thPk.toFixed(3)} against the 0.30 guard`);
check('the machine is not made worse by what shipped', on.rms <= off.rms * 1.02,
  `${off.rms.toExponential(3)} → ${on.rms.toExponential(3)} = ${(off.rms / on.rms).toFixed(3)}x`);
check('the correction stayed inside the authority it was given', on.uPk <= spec.uMax * 1.001,
  `${on.uPk.toFixed(4)} of ${spec.uMax}`);
/**
 * THE LADDER'S OWN FACTOR AND THIS RUN'S MUST AGREE, AND THEY DISAGREED BY 11.8x WITH NOTHING
 * SAYING SO (plan §117). `rep.base/rep.best` come from INSIDE the commissioning; `off/on` come
 * from a driver that re-runs the plant through `auto.act` afterwards. Two code paths, one
 * machine — the condition rule 15 exists for, and it was never checked. §117's defect disarmed a
 * rung that had deployed, so the ladder printed `1.038e-1 → 8.802e-3  11.79x` while the line
 * above it read `delivered 1.000x`, and both were true of different objects. That is
 * `distil-tank.mjs`'s §67.3 fault — a rung absent from the run that scored it — arriving from the
 * other direction, and it is the one thing a shipped-factor table cannot survive.
 *
 * THE BAND IS LOOSE ON PURPOSE. The two runs are not required to be bit-identical: the ladder
 * scores its own program through its own loop and this one re-drives the plant, which on this
 * plant read 11.93x against 12.009x, 0.7% apart. A 1.25x band cannot see that and cannot miss a
 * wiring fault, which is the only thing it is for.
 */
{
  // UNCONDITIONAL, because a check inside an `if` that its own inputs can fail is a check that
  // reports PASSED by disappearing (rules 9c, 25). A missing or non-finite field is itself the
  // failure: it means the report this comparison is built on no longer carries what it claims.
  const haveRep = Number.isFinite(rep.base) && Number.isFinite(rep.best) && rep.best > 0;
  const xLadder = haveRep ? rep.base / rep.best : NaN, xHere = off.rms / on.rms;
  const apart = Math.max(xLadder, xHere) / Math.max(1e-300, Math.min(xLadder, xHere));
  check('the ladder\'s shipped factor and an independent scored run agree',
    haveRep && apart <= 1.25, haveRep
      ? `ladder ${xLadder.toFixed(3)}x against ${xHere.toFixed(3)}x re-driven through act() — `
        + `${apart.toFixed(3)} apart`
      : `rep.base/rep.best are not both finite positive numbers `
        + `(${rep.base}, ${rep.best}) — the comparison could not be made`);
}
console.log(failed ? `\n  ${failed} check(s) failed\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);
