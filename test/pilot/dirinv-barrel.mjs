/**
 * @file THE TEACHER-FREE DIRECT INVERSE ON THE BARREL — no teacher, no cascade, no lap index
 *       (plan §103). NOT A TEST.
 *
 * §99 named this route's one useful target and did not run it: *the BARREL and the COLUMN, where
 * §72 prices the whole commissioning at 30.0 and 33.3 DAYS of plant time, §73.13 prices the teacher
 * at 74-89% of that, and §96 measures the incumbent finding nothing at all.* On EMPS the route is
 * third of three because the incumbent reads 424.8x there; here the incumbent reads 1.00x and the
 * learned object is the whole result, so a teacher-free route buys most of the CALENDAR rather than
 * a factor. That is target 4, the target that fails hardest.
 *
 * ---------------------------------------------------------------- THE UNITS OBJECTION, AND WHY IT IS NOT ONE
 *
 * The direct inverse fits `c - y` and deploys `c = r + f(r)`, which only means anything where the
 * command and the output share units. On a servo axis they do. On a barrel the command is POWER and
 * the output is TEMPERATURE, and this is why the route was parked.
 *
 * It is not an obstacle, because this plant's reference ALREADY goes through the engineer's own
 * closed-form nominal inverse: `specs.mjs` hands the map `TH.powerFor(TH.setpointAt(k))`. So the
 * identity that sits implicitly inside EMPS' `c - y` is `powerFor` here:
 *
 *     fit     window of powerFor(ACHIEVED T)  ->  c - powerFor(ACHIEVED T)
 *     deploy  window of powerFor(SETPOINT)    ->  c = powerFor(r) + f(...)
 *
 * and `DistilPolicy` needs NO change, because the fit's input is already in the units of the
 * reference the shipped object reads. Every process plant here is the same shape — the column's
 * `WB.inputsFor`, the tank's `voltsFor` — so this generalises by construction rather than by luck.
 *
 * NARROWED HONESTLY: using `powerFor` reintroduces a model, so "no model" becomes **no model
 * IDENTIFIED BY US**. It is the engineer's closed form, it already ships as this plant's reference,
 * and §80.6 priced it (computing it at the MEASURED ambient rather than the nominal one is worth
 * 1.008x). What is removed is the TEACHER, not every model.
 *
 * ---------------------------------------------------------------- WHAT WOULD KILL IT (rule 59)
 *
 * NON-UNIQUENESS  direct inverse learning averages over commands producing the same output and the
 *                 average need not be a valid inverse (Jordan & Rumelhart).
 * RULE 35         an inverse model inside a loop is positive feedback unless trained over the
 *                 operating points the loop will occupy, so the excitation must DITHER.
 * COVERAGE        at deploy it is asked for setpoints the machine never achieved; that is the
 *                 diet's job, and rule 41b says size it from the PROGRAM's own span.
 *
 * ---------------------------------------------------------------- AND RULE 35 IS IN CONFLICT WITH ITSELF HERE
 *
 * **THE DITHER RULE 35 DEMANDS DESTROYS THE LABELS THE ROUTE NEEDS ON A LOW-PASSED PLANT.** The
 * target `c - powerFor(y)` contains the injected dither, and this plant attenuates a fast dither out
 * of `y` before a thermocouple sees it — so the dither is unrecoverable from the window BY
 * CONSTRUCTION and enters the fit as pure label noise. `DITH` is the ladder, held out BY SEGMENT:
 *
 *     DITH      R2 zone0 / zone1 / zone2        DELIVERED
 *     0         0.8652 / 0.8984 / 0.9096        7.051x
 *     0.015     0.7992 / 0.8924 / 0.7869        4.476x
 *     0.06      0.3200 / 0.4115 / 0.2145        4.022x
 *     0.12     -0.0204 / 0.1507 / 0.0511        3.331x
 *
 * READ THE TWO COLUMNS DIFFERENTLY (rule 19). The R2 column is clean: 0.87 -> -0.02 is far outside
 * anything the seed moves. The DELIVERED column is CONFOUNDED with the commissioning draw except at
 * the extremes — the seed spread below is 4.18-7.26x, so the 4.476x at DITH 0.015 is inside it and
 * only the 0.12 row is separable. The finding is the R2 collapse; the delivered column agrees in
 * direction and cannot carry the claim on its own.
 *
 * This is recorded because the FIRST run of this experiment was at 0.06, on a scratch probe, and I
 * nearly filed its 0.41/0.19/0.15 as *the barrel carries less information than EMPS* (rule 17: the
 * instrument fails before the model). On a servo the dither survives into the achieved position and
 * `c - y` stays learnable; here it does not. The coverage has to come from SLOW excitation — the
 * random changeovers themselves, which visit the operating points without injecting anything the
 * plant cannot pass. Predicts the same conflict on any plant whose actuator bandwidth greatly
 * exceeds its output bandwidth, which is a screen and not a barrel fact.
 *
 * ---------------------------------------------------------------- IT IS A DISTRIBUTION, NOT A NUMBER
 *
 * A commissioning is a DRAW (§87.3), and this one is a wide one. Four seeds, everything else held:
 *
 *     SEED      held-out R2                     DELIVERED    held-out ORDER
 *     1         0.7003 / 0.9333 / 0.7293        3.688x       1.954x
 *     2         0.7580 / 0.3571 / 0.7545        6.989x       1.973x
 *     3         0.7571 / 0.9192 / 0.9104        3.031x       1.896x
 *     4         0.8868 / 0.7855 / 0.6796       10.006x       2.013x
 *
 * **THE SCORED FACTOR SWINGS 3.3x AND WHAT TRANSFERS DOES NOT MOVE AT ALL.** 3.03-10.01x on the
 * program it was scored on, median about 5.3x — against a teacher-taught 7.00x that is itself one
 * draw of a ladder whose diet spread §84.8 puts at 1.66x, so the distributions OVERLAP and the
 * claim is *the same range at zero teacher laps*, never *it matches* and never *it wins*.
 *
 * But the held-out ORDER reads **1.896x-2.013x, a 1.06x spread**, while the scored program reads a
 * 3.3x one. So the target-1 RATIO's apparent variation (0.201-0.626) is its DENOMINATOR moving and
 * not its numerator — which is §89.1's own objection to the cheap comparator, arriving here from
 * the other side. What this route delivers on a program it has never run is about 1.95x and is
 * STABLE; what varies is how well a given draw fits the one program it was scored on.
 *
 * And the fit's gate does not rank the machine: seed 3 has the best held-out R2 of the four and the
 * WORST delivery, seed 4 the reverse. `distil.js`'s *the gate is a PRE-FILTER and the decision is a
 * machine-scored verify*, on a third plant.
 *
 * ---------------------------------------------------------------- TWO OF MY OWN NUMBERS WERE WRONG FIRST
 *
 * RULE 61  a first version scored through a PRIVATE copy of the barrel's routing and read 9.783x;
 *          driven through `barrelSpec.fresh()` and `barrelSpec.step()` — the two functions every
 *          other barrel number in this project comes from — the same fit reads 7.0x. A second copy
 *          of a plant's routing has now shipped a wrong number four times here.
 * RULE 13  and that private loop scored from k = 0, where `rigs/ladder.mjs` scores from
 *          `k >= pN * 0.05`, dropping the start transient. That is the whole of the 2.5% baseline
 *          discrepancy I could not explain: on the ladder's own support the open loop reproduces
 *          the record's 5.2708e+0 exactly (rule 21).
 *
 * Run: node test/pilot/dirinv-barrel.mjs  [DITH=..] [NSEG=..] [SEGLEN=..] [REACH=..] [RIDGE=..] [SEED=..]
 */
import { DistilPolicy } from '../../lib/pilot/distil.js';
import { deriveWindow } from './rigs/distilkit.mjs';
import { barrelSpec } from './rigs/specs.mjs';
import * as TH from './rigs/thermal-rig.mjs';

const SEED = +(process.env.SEED || 3);
const DITH = process.env.DITH === undefined ? 0 : +process.env.DITH;
// SEGMENTS AT THE SHIPPED DIET'S OWN LAP. `distil-barrel.mjs` uses 7500 and the window rule
// `min(0.61·settle, lapMin/8)` turns that into ±938; a first version of this file hardcoded 938
// while exciting in 5000-step segments, which is a reach carried from a diet with a different lap
// and spans 37% of the training lap where the aliasing bound allows 25% (rule 31, and §41's
// theorem it exists to respect). The rule is DERIVED here from this file's own diet now.
const NSEG = +(process.env.NSEG || 6), SEGLEN = +(process.env.SEGLEN || 7500);
const SETTLE = 7861;                                 // the barrel's measured settle, as distil-barrel.mjs
const RIDGE = +(process.env.RIDGE || 1e-6);
const DROP = 0.05;                                   // `rigs/ladder.mjs`'s own start-transient drop

function lcg(s0) { let s = s0 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const rnd = lcg(SEED);
// SIZED FROM THE RECIPE'S OWN SPAN, not from declared limits (rule 41b).
const lo = [170, 190, 200], hi = [200, 218, 226];
const pick = () => lo.map((a, j) => a + (hi[j] - a) * rnd());
const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

console.log(`\ndirinv-barrel: the teacher-free direct inverse on a plant whose commissioning costs 33 DAYS`);
console.log(`  dither ${(DITH * 100).toFixed(1)}%, ${NSEG} open-loop excitation segments of `
  + `${SEGLEN} steps, seed ${SEED}`);

// ---------------------------------------------------------------- EXCITATION: OPEN LOOP, NO TEACHER
const p0 = TH.makeBarrel(11);
{ const st = TH.powerFor(pick()); for (let i = 0; i < 20000; i++) p0.step(st); }
const C = [], Y = [];
{
  let cur = pick();
  for (let s = 0; s < NSEG; s++) {
    const nxt = pick(), hold = Math.floor(SEGLEN * 0.3);
    for (let k = 0; k < SEGLEN; k++) {
      const t = (k - hold) / (SEGLEN - hold);
      const f = t <= 0 ? 0 : t >= 1 ? 1 : TH.quintic(t);
      const base = TH.powerFor(cur.map((a, j) => a + (nxt[j] - a) * f));
      const c = DITH ? base.map((v) => v * (1 + DITH * (rnd() * 2 - 1))) : base;
      p0.step(c); C.push(c); Y.push(p0.read());
    }
    cur = nxt;
  }
}
const U = Y.map((y) => TH.powerFor(y));                          // the INPUT, in the reference's units
const TGT = C.map((c, k) => c.map((v, j) => v - U[k][j]));       // the PRE-DISTORTION
console.log(`  ${C.length} excitation steps, ZERO teacher laps`);
for (let j = 0; j < 3; j++) {
  console.log(`    zone ${j}: |c| ${rms(C.map((r) => r[j])).toFixed(3)}`
    + `  |powerFor(y)| ${rms(U.map((r) => r[j])).toFixed(3)}`
    + `  |target| ${rms(TGT.map((r) => r[j])).toFixed(4)}`);
}

// THE SHARED DERIVATION, not a second copy of it (rule 61).
const { reach: REACH, offsets: OFFS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin: SEGLEN, win: process.env.REACH === undefined ? undefined : +process.env.REACH });
console.log(`  window +/-${REACH} raw steps, ${OFFS.length} taps  `
  + `(settle ${SETTLE}, diet lap ${SEGLEN}, min(0.61*settle, lap/8) = ${RULE})`);

function fitOn(list) {
  const pol = new DistilPolicy({ channels: 3, refDim: 3, offsets: OFFS, uMax: TH.UCAP,
    ridge: RIDGE, online: false, standardize: true });
  for (const s of list) {
    const a = s * SEGLEN, b = a + SEGLEN, pre = [];
    for (let k = a; k < b; k++) pre.push(TGT[k]);
    pol.addProgram({ refAt: (k) => U[Math.max(a, Math.min(b - 1, k + a))], n: SEGLEN, prefix: pre, stride: 7 });
  }
  pol.fit();
  return pol;
}

// ---------------------------------------------------------------- HELD OUT BY SEGMENT
// Contiguous rows a few samples apart read most of the same window, so a shuffled split validates
// against data it has effectively seen. The segment is the only honest unit here.
const segs = [...Array(NSEG).keys()];
{
  const sse = [0, 0, 0], sst = [0, 0, 0]; let n = 0;
  for (const held of segs) {
    const pol = fitOn(segs.filter((s) => s !== held));
    const a = held * SEGLEN, b = a + SEGLEN;
    const mean = [0, 1, 2].map((j) => { let m = 0; for (let k = a; k < b; k++) m += TGT[k][j]; return m / SEGLEN; });
    for (let k = a + REACH; k < b - REACH; k += 7) {
      const pred = pol.actLook((o) => U[Math.max(0, Math.min(U.length - 1, k + o))], null);
      for (let j = 0; j < 3; j++) {
        const e = TGT[k][j] - pred[j]; sse[j] += e * e;
        const d = TGT[k][j] - mean[j]; sst[j] += d * d;
      }
      n++;
    }
  }
  console.log(`  held-out BY SEGMENT R2 over ${n} rows: `
    + [0, 1, 2].map((j) => (1 - sse[j] / sst[j]).toFixed(4)).join(' / '));
}

// ---------------------------------------------------------------- DELIVERED, THROUGH THE SHARED ROUTING
const pol = fitOn(segs);
const progOf = (order) => {
  const R = [];
  for (let k = 0; k <= TH.PROG; k++) {
    const i = Math.min(order.length - 2, Math.floor(k / TH.SEG));
    const t = (k - i * TH.SEG - TH.HOLD) / (TH.SEG - TH.HOLD);
    const s = t <= 0 ? 0 : t >= 1 ? 1 : TH.quintic(t);
    R.push(TH.powerFor(order[i].map((a, j) => a + (order[i + 1][j] - a) * s)));
  }
  return R;
};
const score = (R, armed) => {
  const p = barrelSpec.fresh();
  let s = 0, n = 0, pk = 0;
  for (let k = 0; k < TH.PROG; k++) {
    let u = [0, 0, 0];
    if (armed) {
      u = pol.actLook((o) => R[Math.max(0, Math.min(R.length - 1, k + o))], null);
      for (const v of u) pk = Math.max(pk, Math.abs(v));
    }
    const { truth } = barrelSpec.step(p, R[k], u);
    if (k >= TH.PROG * DROP) for (const e of truth) { s += e * e; n++; }
  }
  return { rms: Math.sqrt(s / n), pk };
};

const R0 = []; for (let k = 0; k <= TH.PROG; k++) R0.push(barrelSpec.refAt(k));
const off = score(R0, false), on = score(R0, true);
console.log(`\n  DELIVERED on the production recipe, through barrelSpec's OWN fresh()/step():`);
console.log(`    open loop (powerFor alone)   ${off.rms.toExponential(4)} K rms`
  + `   [the record's figure is 5.2708e+0 — reproduced, rule 21]`);
console.log(`    + teacher-free correction    ${on.rms.toExponential(4)} K rms`
  + `   ${(off.rms / on.rms).toFixed(3)}x   peak |u| ${on.pk.toFixed(2)} of ${TH.UCAP}`);
console.log(`    ${pol.cost()} MAC/decision, ${(JSON.stringify(pol.toJSON()).length / 1024).toFixed(1)} kB`);

// ---------------------------------------------------------------- TARGET 1, THE SAME FROZEN OBJECT
// A held-out recipe ORDER — the same four profiles production visits, sequenced differently, which
// is how §66 holds this plant's program out. No refit, no recommission.
const alt = [TH.RECIPE[2], TH.RECIPE[0], TH.RECIPE[3], TH.RECIPE[1]];
const Ra = progOf(alt);
const offA = score(Ra, false), onA = score(Ra, true);
const fac = off.rms / on.rms, facA = offA.rms / onA.rms;
console.log(`\n  TARGET 1 — the SAME frozen object on a recipe ORDER it never saw (no refit):`);
console.log(`    held-out order   ${offA.rms.toExponential(4)} -> ${onA.rms.toExponential(4)} K rms`
  + `   ${facA.toFixed(3)}x   ${(facA / fac).toFixed(3)} of the scored program's factor`
  + `   ${facA / fac >= 1 / 1.3 ? 'MET' : 'NOT MET'}${facA < 1 ? '  — MADE WORSE' : ''}`);

console.log(`\n  AGAINST THE INCUMBENTS ON THIS PLANT:`);
console.log(`    the conventional rung        1.00x   refused, the basis spanning 0.0% of the error energy (§96)`);
console.log(`    the TEACHER-taught object    7.00x   at ~33 days of plant time, 74-89% of it teacher (§72, §73.13)`);
console.log(`    this, teacher-free           ${fac.toFixed(3)}x   ${C.length} open-loop steps, no teacher, no cascade, no lap index`);
console.log(`\n  NOT CLAIMED. This is ONE DRAW of a WIDE distribution: over seeds 1-4 the route reads`);
console.log(`  3.688x / 6.989x / 3.031x / 10.006x on the scored program — a 3.3x spread, median ~5.3x —`);
console.log(`  while the HELD-OUT ORDER reads 1.954x / 1.973x / 1.896x / 2.013x, a 1.06x spread. So what`);
console.log(`  this route transfers is STABLE near 1.95x and what varies is the fit to the one program`);
console.log(`  it was scored on; the target-1 RATIO moves because its DENOMINATOR does (§89.1).`);
console.log(`  The teacher-taught 7.00x is itself one draw of a LADDER (§84.8 puts this plant's diet`);
console.log(`  spread at 1.66x), so the distributions OVERLAP: THE SAME RANGE AT ZERO TEACHER LAPS,`);
console.log(`  not a win. One excitation design, one ridge, no ladder, target 1 NOT MET on any seed.\n`);
