/**
 * @file THE TEACHER-FREE DIRECT INVERSE, ASKED OF EVERY PLANT THAT HAS A NOMINAL INVERSE (plan §104, §105).
 *
 * NOT A TEST. This is target 4's instrument: the teacher is 74-89% of what a commissioning costs
 * these plants (§73.13), it ships on ZERO of ten (§86.7), and target 4 is met on two of eight. If
 * the teacher is removable the calendar moves, and a factor is not the point.
 *
 * One driver, one kit, the plant's OWN spec — so a fourth plant cannot repeat the three mistakes
 * §103 made, each of which was a second copy of something that already existed (rules 61, 13, 31).
 *
 * WHAT EACH PLANT SUPPLIES: a DIET (open-loop excitation segments, in command units) and its
 * NOMINAL INVERSE applied to an achieved output. Nothing else.
 *
 * EVERY ROW CARRIES ITS CONTROLS AND THEY ARE ASSERTED:
 *   ZERO     an all-zero map must reproduce the open loop BIT-EXACTLY (§67.3's defect)
 *   SHUFFLE  a fit on permuted targets must NOT deliver (rule 15)
 *   and where the record states a baseline, it must be reproduced (rule 21).
 *
 * ---------------------------------------------------------------- WHICH PLANTS THE ROUTE REACHES
 *
 * §105 asks the remaining eight, and the answer is STRUCTURAL rather than a score. The route needs
 * four things and each one excludes a different plant:
 *
 *   1  A NOMINAL INVERSE must exist. Every plant here has one — the process plants because
 *      `refAt` IS that map (`powerFor`, `inputsFor`, `voltsFor`, `flowFor`), the servos because
 *      command and output share units and it is the IDENTITY. This excludes nothing in this
 *      repository and is a real bar in general: a plant commanded in units unrelated to its
 *      output, with no calibration curve, cannot be asked at all.
 *   2  THE DEPLOYED INPUT MUST VARY. The map reads a window of `refAt`; on a REGULATOR that
 *      window is the same window at every k, so the map can emit ONE number for the whole run.
 *      Not a poor fit — a representational impossibility, and asserted here rather than inferred
 *      from a score near 1.000x: the COLD MILL's deployed correction is constant to the last bit
 *      over 20,000 steps and reads exactly 1.000x.
 *   3  THE ERROR MUST BE A FUNCTION OF THE COMMANDED TRAJECTORY. The mill fails this twice over
 *      even if its setpoint moved: §84.3 measures its open-loop error as 87% roll eccentricity
 *      and 13% entry wander, neither of which any map of the setpoint can express. What DOES
 *      work there is already on file and is a different route: §71's win is provably ALL of one
 *      DECLARED roll phase — withhold it and the object is inert at exactly 1.000x — so a
 *      regulator is reachable only by widening `refDim` with a channel that varies, which is a
 *      declaration the engineer supplies and not something this route can discover.
 *   4  THE PLANT MUST BE INVERTIBLE IN THE CLASS. The REAL FLEXIBLE ARM fails: `invert.mjs` reads
 *      it at INVERSE 128.3%, the only non-zero in that table, and here the route is monotone
 *      HARMFUL in its own authority (0.576x / 0.487x / 0.349x / 0.252x as the cap doubles, then
 *      saturating at 0.25x with the demand off its cap). A map that is merely too small gets
 *      better as it shrinks and reaches 1.000x; one that is WRONG does what this does.
 *
 * AND A FIFTH THING, WHICH IS ABOUT WHAT THE NUMBERS MEAN RATHER THAN WHETHER THE ROUTE RUNS.
 * §55: a plant identified as a LINEAR ARX sits inside a linear feedforward's own hypothesis class,
 * and §54.8: a score that climbs as a regulariser is removed, on a DETERMINISTIC rig, is exact
 * interpolation rather than a controller. Both arrive here together. Freed of its authority cap
 * the REAL CASCADED TANKS read 13.7x .. 2099.9x over six seeds — a 153x spread — and the CART-POLE
 * reads 567x .. 584x. The cap is what bounds them, and at the shipped cap they read 8.1-9.1x and
 * 11.8x, level with what the block already ships. Quote the capped column; the free one measures
 * the simulator.
 *
 * ---------------------------------------------------------------- WHAT IS NOT ASKED, AND WHY
 *
 * THE 2R ARM, which is nine plants of ten rather than ten. It HAS a nominal inverse — the arm's
 * own inverse kinematics, and its `refAt` is joint angles produced by exactly that — so it is in
 * scope by requirement 1 and this is a MISSING MEASUREMENT and not an exclusion (rule 25). What
 * stops it is that `rigs/arm-rig.mjs` exports `commissionArm`/`deployOn` and no `{ fresh, step,
 * refAt, uMax }` spec, so asking it through this kit means writing a second copy of that plant's
 * routing — the fault this kit was extracted to prevent, and one that has already shipped a wrong
 * number four times here (rule 61, §103's own 9.783x against 7.0x). The route to it is the move
 * `specs.mjs` already made for the other nine: give `arm-rig.mjs` a spec, with `plants.test.mjs`
 * and `distil-arm.mjs` byte-identical across it as the control.
 *
 * Run: node test/pilot/dirinvall.mjs [ONLY=barrel,column] [SEEDS=1,2,3,4] [RIDGE=..] [UCAP=..]
 */
import * as TH from './rigs/thermal-rig.mjs';
import * as WB from './rigs/woodberry-rig.mjs';
import * as TK from './rigs/tanks-rig.mjs';
import * as RT from './rigs/realtanks-rig.mjs';
import * as RX from './rigs/realexch-rig.mjs';
import * as RM from './rigs/rollmill-rig.mjs';
import * as PD from './rigs/pend-rig.mjs';
import * as RA from './rigs/realarm-rig.mjs';
import * as EM from './emps-rig.mjs';
import { barrelSpec, wbSpec, tankSpec, empsSpec, pendSpec, realarmLadderSpec,
  realtanksLadderSpec, realexchLadderSpec, millSpec, armSpec, armDiet, G_MP } from './rigs/specs.mjs';
import { excite, fitInverse, heldOutR2, scoreOn, refSeries, deriveWindow, lcg,
  measureSettle, priceOf } from './rigs/dirinvkit.mjs';
// THE ARM'S SECOND METRIC — see its `alt` row. `decompose` is the SHARED geometry `deployOn` and
// `autohost.js` both score through, so the number below is produced by the same code that produced
// the 8.18x it is being set against, and not by a second reading of "contour error" (rule 61).
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';

const SEEDS = (process.env.SEEDS || '1,2,3,4').split(',').map(Number);
const RIDGE = +(process.env.RIDGE || 1e-6);
const CARRY = process.env.CARRY === '1' || process.env.CARRY === 'raw';   // plan §123: one rebuild for the whole excitation
const DWELL = process.env.CARRY === '1';   // and a dwell of one settle at each new segment; `raw` is the void negative
import { pathToFileURL } from 'node:url';

const IS_ENTRY = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

// ---------------------------------------------------------------- THE PLANTS
const PLANTS = [{
  name: 'extruder barrel',
  spec: barrelSpec, nc: 3, N: TH.PROG,
  settle: 7861,                                    // as `distil-barrel.mjs`
  dt: TH.DT, unit: 's',
  incumbent: 'the learned object 7.00x (§95); the conventional rung REFUSES at 1.00x',
  baseline: '5.2708e+0 K rms (the record)',
  inv: (y) => TH.powerFor(y),
  // SIZED FROM THE RECIPE'S OWN SPAN (rule 41b), laps at the shipped diet's own 7500 so the window
  // rule produces the reach it produces there rather than one carried in.
  seglen: 7500,
  // THE TRANSITION IS A QUINTIC RAMP OVER 70% OF THE SEGMENT, AND plan §132 MEASURED THAT AS TOO
  // LITTLE EXCITATION TO IDENTIFY THIS PLANT. `TH_DIETSTEP=1` makes it a commanded STEP at the
  // same instant instead — the same levels, the same segment length, the same hold, only the
  // transition's shape moving, so what it buys is excitation bandwidth and nothing else. Default
  // OFF and byte-identical, because every barrel figure on record was taken on the ramp.
  diet: (rnd) => {
    const lo = [170, 190, 200], hi = [200, 218, 226];
    const pick = () => lo.map((a, j) => a + (hi[j] - a) * rnd());
    const STEP = process.env.TH_DIETSTEP === '1';
    const segs = []; let cur = pick();
    for (let s = 0; s < 6; s++) {
      const nxt = pick(), n = 7500, hold = Math.floor(n * 0.3);
      const c0 = cur.slice(), c1 = nxt.slice();
      segs.push({ n, refAt: (k) => {
        const t = (k - hold) / (n - hold);
        const f = t <= 0 ? 0 : t >= 1 ? 1 : (STEP ? 1 : TH.quintic(t));
        return TH.powerFor(c0.map((a, j) => a + (c1[j] - a) * f));
      } });
      cur = nxt;
    }
    return segs;
  },
}, {
  name: 'Wood-Berry column',
  spec: wbSpec, nc: 2, N: WB.T_END,
  settle: 994,                                     // as `distil-column.mjs`, from headroom.mjs
  dt: WB.DT * 60, unit: 's',                       // the rig states MINUTES per step — one of its steps is six seconds of column
  incumbent: 'the learned object 3.96x (§95); the conventional rung REFUSES at 1.00x',
  baseline: null,
  inv: (y) => WB.inputsFor(y[0], y[1]),
  seglen: 3000,
  // THE COLUMN'S PROGRAM IS A STEP SEQUENCE, not a trajectory, so the diet is step sequences at
  // other amplitudes and other times — none of them the published scenario (steps at 0 and 1000).
  diet: (rnd) => {
    const segs = [];
    for (let s = 0; s < 6; s++) {
      const a1 = 0.4 + 1.2 * rnd(), a2 = 0.4 + 1.2 * rnd();
      const t1 = Math.floor(200 + 600 * rnd()), t2 = Math.floor(1200 + 900 * rnd()), n = 3000;
      segs.push({ n, refAt: (k) => WB.inputsFor(k >= t1 ? a1 : 0, k >= t2 ? a2 : 0) });
    }
    return segs;
  },
},

// ============================================================ CLASS A, the three plants §104 left
// A SETPOINT-SEQUENCING PROCESS PLANT: `refAt` is a non-trivial nominal inverse of a MOVING
// setpoint, so a window of it carries the whole program and the route is built for this shape.
{
  name: 'quadruple tank',
  spec: tankSpec, nc: 2, N: TK.PROG,
  dt: TK.DT, unit: 's',
  // RULE 19 — QUOTE AGAINST THE RIGHT INCUMBENT. §97.3 retracted this plant from the "incumbent
  // finds no headroom" list: its conventional rung had never been handed `v` and `a` at all, and
  // repaired it reads 19.91x from SEVEN coefficients, six times better than everything §70, §72
  // and §79 built here. The distilled object's 3.268x is what the LEARNED route delivers and is
  // no longer what the block ships. A teacher-free route is measured against 19.91x.
  incumbent: 'conventional rung 19.91x (§97.3) — the distilled object reads 3.268x and is refused',
  baseline: null,
  // The step is 25% of this plant's own correction authority (UCAP 1.2), never a carried number.
  settle: () => measureSettle(tankSpec, { delta: 0.3 }),
  inv: (y) => TK.voltsFor(G_MP, y[0], y[1]),
  seglen: TK.SEG * (TK.RECIPE.length - 1),
  diet: (rnd) => {
    // SIZED FROM THE PROGRAM'S OWN SPAN (rule 41b) — the levels `TK.RECIPE` actually visits, not
    // the channel box — and every recipe STARTS where `fresh()` settles, so the record is the
    // plant answering its command rather than recovering from a mismatched initial condition.
    const lo = [0, 1].map((j) => Math.min(...TK.RECIPE.map((r) => r[j])));
    const hi = [0, 1].map((j) => Math.max(...TK.RECIPE.map((r) => r[j])));
    const pick = () => lo.map((a, j) => a + (hi[j] - a) * rnd());
    const segs = [];
    for (let s = 0; s < 6; s++) {
      const rec = [TK.RECIPE[0].slice(), pick(), pick(), pick(), pick()];
      const n = TK.SEG * (rec.length - 1);
      segs.push({ n, refAt: (k) => {
        const i = Math.min(rec.length - 2, Math.floor(k / TK.SEG));
        const t = (k - i * TK.SEG - TK.HOLD) / (TK.SEG - TK.HOLD);
        const f = t <= 0 ? 0 : t >= 1 ? 1 : TK.quintic(t);
        return TK.voltsFor(G_MP, rec[i][0] + (rec[i + 1][0] - rec[i][0]) * f,
          rec[i][1] + (rec[i + 1][1] - rec[i][1]) * f);
      } });
    }
    return segs;
  },
}, {
  name: 'real cascaded tanks',
  spec: realtanksLadderSpec(), nc: 1, N: RT.PROG,
  dt: RT.TS, unit: 's',
  // The OVERFLOW plant, for §55's reason: the identified LINEAR one reads 2012x and that measures
  // the conventional rung's own hypothesis class rather than the machine (rule 15).
  incumbent: 'the block ships 8.69x = conventional 4.28x x learned 2.03x (§95); the pilot cascade 8.00x at 43,673 MAC',
  baseline: null,
  settle: () => measureSettle(realtanksLadderSpec(), { delta: 0.3 }),
  inv: (y) => [RT.voltsFor(y[0])],
  seglen: RT.SEG * (RT.RECIPE.length - 1),
  diet: (rnd) => {
    // Levels drawn across the OVERFLOW recipe's own span, so the diet visits the region where
    // the plant's documented clip makes the nominal inverse WRONG — which is the only thing a
    // correction of this class can find here.
    const lo = Math.min(...RT.RECIPE_OF), hi = Math.max(...RT.RECIPE_OF);
    const pick = () => lo + (hi - lo) * rnd();
    const segs = [];
    for (let s = 0; s < 6; s++) {
      const rec = [RT.RECIPE_OF[0], pick(), pick(), pick(), pick()];
      const n = RT.SEG * (rec.length - 1);
      segs.push({ n, refAt: (k) => {
        const i = Math.min(rec.length - 2, Math.floor(k / RT.SEG));
        const t = (k - i * RT.SEG - RT.HOLD) / (RT.SEG - RT.HOLD);
        const f = t <= 0 ? 0 : t >= 1 ? 1 : quintic(t);
        return [RT.voltsFor(rec[i] + (rec[i + 1] - rec[i]) * f)];
      } });
    }
    return segs;
  },
}, {
  name: 'real steam exchanger',
  spec: realexchLadderSpec(), nc: 1, N: RX.PROG,
  dt: RX.TS, unit: 's',
  incumbent: 'conventional rung 89.77x (§86.5) — the distilled object reads 0.045x of it and REFUSES',
  baseline: null,
  settle: () => measureSettle(realexchLadderSpec(), { delta: 0.05 }),
  inv: (y) => [RX.flowFor(y[0])],
  seglen: RX.SEG * (RX.RECIPE.length - 1),
  diet: (rnd) => {
    const lo = Math.min(...RX.RECIPE), hi = Math.max(...RX.RECIPE);
    const pick = () => lo + (hi - lo) * rnd();
    const segs = [];
    for (let s = 0; s < 6; s++) {
      const rec = [RX.RECIPE[0], pick(), pick(), pick(), pick()];
      const n = RX.SEG * (rec.length - 1);
      segs.push({ n, refAt: (k) => {
        const i = Math.min(rec.length - 2, Math.floor(k / RX.SEG));
        const t = (k - i * RX.SEG - RX.HOLD) / (RX.SEG - RX.HOLD);
        const f = t <= 0 ? 0 : t >= 1 ? 1 : quintic(t);
        return [RX.flowFor(rec[i] + (rec[i + 1] - rec[i]) * f)];
      } });
    }
    return segs;
  },
},

// ============================================================ CLASS B: the nominal inverse is the IDENTITY
// A SERVO whose command and output share units. §99 built the route on exactly this shape on
// EMPS; it is the same route with `inv = y -> y`, and EMPS is here as the CONTROL that says the
// shared kit reaches §99's own answer without §99's private loop (rules 21, 61).
{
  name: 'EMPS servo axis',
  spec: empsSpec, nc: 1, N: EM.P,
  dt: EM.DT, unit: 's',
  // AND THE SHARED KIT DOES NOT REPRODUCE §99's 5.510x HERE, WHICH IS THE ROW'S REAL VALUE.
  // §99 measured this same routing on this same plant through its OWN private loop and read
  // 5.510x; through the kit it reads 0.92-0.96x. The two are different MEASUREMENTS and three
  // differences are named rather than one being called wrong (rule 20):
  //   1. §99 scores the LAST FOUR of SIX repeated laps on a machine that keeps running, with the
  //      window wrapped MODULO the lap — a closed program, settled. The kit scores ONE pass from
  //      `fresh()` on the ladder's own support with the window CLAMPED at the ends.
  //   2. §99 records `y[k] = m.q` BEFORE stepping, so its pair is (command now, position now);
  //      the kit records after, so its pair is (command now, position after that command).
  //   3. §99 fixes a ±96 window at 15 quadratic taps; the kit DERIVES ±113 at 21 geometric taps.
  // This is the third time here that a private routing read higher than the shared one — §103's
  // own 9.783x against 7.0x, and `distil-tank.mjs`'s 1.000x that was never applied (rule 61) —
  // and in all three the optimistic number is the private one. Nothing here says which score is
  // the right one to want; it says the kit's is the one comparable to the other nine rows.
  incumbent: 'conventional rung 424.82x (§96) — the distilled object 32.75x, §99\'s own private-loop direct inverse 5.510x',
  baseline: null,
  settle: () => measureSettle(empsSpec, { delta: 0.005 }),
  inv: (y) => [y[0]],
  seglen: EM.P,
  // BANG-BANG ACCELERATION TRAPEZOIDS — §99's OWN `trapezoid` design, built from the rig's own
  // `RUNS` and `ACC` with the lengths and accelerations perturbed, so the scored program is in no
  // training run and the diet occupies the same design space (rules 20, 41b, 61).
  //
  // THE FIRST VERSION OF THIS DIET WAS RULE 41b EXACTLY AND THE MACHINE SAID SO. Its accelerations
  // were picked by hand at 4e-4 against this axis's own 0.83, so the excitation travelled 2.5 mm
  // where the program travels 230 — the map was fitted in a neighbourhood a hundred times smaller
  // than the one it was deployed over, saturated at its cap and delivered 0.027x with a held-out
  // R² of 1.000. The fit was perfect ON THE DIET and the diet described a different machine.
  diet: (rnd) => {
    const segs = [];
    for (let s = 0; s < 6; s++) {
      const runs = EM.RUNS.map((L) => Math.max(1, Math.round(L * (0.7 + 0.6 * rnd()))));
      const accs = EM.ACC.map((A) => A * (0.75 + 0.5 * rnd()));
      const n = runs.reduce((a, b) => a + b, 0);
      const q = new Float64Array(n);
      let i = 0, ai = 0, on = true, x = EM.PR.q[0], v = EM.V0 * (0.8 + 0.4 * rnd());
      for (const L of runs) {
        const a = on ? accs[ai++ % accs.length] : 0;
        for (let j = 0; j < L; j++) { v += a * EM.DT; x += v * EM.DT; q[i++] = Math.max(0.02, Math.min(0.25, x)); }
        on = !on;
      }
      segs.push({ n, refAt: (k) => [q[Math.max(0, Math.min(n - 1, k))]] });
    }
    return segs;
  },
}, {
  name: 'cart-pole (open-loop unstable)',
  spec: pendSpec, nc: 1, N: PD.LAP * 4,
  dt: PD.DT, unit: 's',
  incumbent: 'the block ships 11.93x = conventional 4.66x x learned 2.56x (§86.2, §95)',
  baseline: null,
  // THE CART'S SETTLE, NOT THE TIP'S, AND THEY ARE DIFFERENT NUMBERS. `measureSettle` reads one
  // MEASURED channel and the tip is not one — it is `x + L sin(th)`, computed. This reads 411
  // steps on the cart where `distil-pend.mjs` measures 281 on the tip, so the window rule gives
  // ±251 here against that harness's ±171. Longer is the conservative direction for the REACH
  // half and it stays well inside the aliasing half (lap/8 = 545), but it is a different
  // instrument reading and is stated rather than presented as the same number (rule 17).
  settle: () => measureSettle(pendSpec, { delta: 0.05, idx: 0 }),
  // THE ACHIEVED TIP IN THE CART REFERENCE'S OWN UNITS. Both are metres of horizontal position
  // and the stabiliser's NOMINAL job is to put the tip at the reference, so the nominal inverse
  // is the identity — and the tip is computed from `measured`, which carries x and theta, so
  // nothing is read that the machine does not already publish.
  inv: (y) => [y[0] + PD.L * Math.sin(y[2])],
  seglen: PD.LAP * 4,
  diet: (rnd) => {
    // MOVES THE SCORED PROGRAM IS NOT — `distil-pend.mjs`'s OWN `DSEED` draw, copied in its
    // design rather than re-invented (rule 20): the same ranges, the same REJECTION of a distance
    // too short for its own feed and acceleration, and the same dwell rule keeping every lap past
    // 1,380 steps so the window rule's REACH half binds rather than its aliasing half.
    //
    // The rejection is not decoration: a first version drew d, acc and vmx independently and
    // `makeProgram` THREW on the third draw — `0.318 m is too short for 0.390 m/s at 0.479 m/s²`.
    const segs = [];
    for (let s = 0; s < 6; s++) {
      let o = null;
      for (let tries = 0; tries < 200 && !o; tries++) {
        const d = 0.25 + 0.40 * rnd(), acc = 0.30 + 1.00 * rnd(), vmx = 0.22 + 0.26 * rnd();
        const ta = vmx / acc, da = 0.5 * acc * ta * ta;
        if (d - 2 * da <= 0.02) continue;
        const tmove = 2 * ta + (d - 2 * da) / vmx;
        o = { d, acc, vmx, dwell: Math.max(0.3, 1380 * PD.DT / 2 - tmove + 0.8 * rnd()) };
      }
      const pr = PD.makeProgram(o || {});
      segs.push({ n: pr.lap * 4, refAt: (k) => [pr.at(k)] });
    }
    return segs;
  },
}, {
  name: 'real flexible arm',
  spec: realarmLadderSpec, nc: 1, N: RA.PROG,
  dt: 0.01, unit: 's',                                  // DaISy 96-009's own 100 Hz sampling
  incumbent: 'conventional rung 1.93x (§55) — the distilled object refuses EIGHT ways (§86.3), ZPETC 1.135x (§87.5)',
  baseline: null,
  settle: () => measureSettle(realarmLadderSpec, { delta: 0.2 * RA.AMP, N: 40000 }),
  inv: (y) => [y[0]],
  seglen: RA.LAP * 8,
  diet: (rnd) => {
    // TOURS, for §86.3's reason: this plant's memory is 4,385 steps against a 512-step lap, the
    // worst ratio in the project, so a closed lap of several different transitions is §49.11's
    // one measured escape from the forced window trade.
    const segs = [];
    for (let s = 0; s < 6; s++) {
      const lap = RA.LAP * 8, nSeg = 8;
      const edges = Array.from({ length: nSeg }, () => Math.round(40 + 200 * rnd()));
      const pr = RA.makeProgram({ lap, edges, headroom: 0.12 + 0.10 * rnd() });
      segs.push({ n: lap * 2, refAt: (k) => pr.at(k) });
    }
    return segs;
  },
},

{
  // ---------------------------------------------------------------- THE PLANT §105 RECORDED AS NOT ASKED
  //
  // §105's own words: *the 2R arm is NOT ASKED and that is a missing measurement, not an
  // exclusion — it has a nominal inverse, its own IK, which is what produces its `refAt`, but
  // `rigs/arm-rig.mjs` exports no spec, so asking it means a second copy of that plant's
  // routing.* `specs.mjs` carries `armSpec` now and the routing stayed in the rig (`homeAt`,
  // `stepArm`), so this row is the move §105 named rather than a tenth private loop.
  //
  // IT IS THE ONE PLANT HERE WHOSE `inv` READS AN INSTRUMENT THE CUSTOMER MUST BUY. Requirement 1
  // says a nominal inverse must exist; the nine that came before could not show its fine print,
  // because on every one of them the ACHIEVED OUTPUT the route inverts is an ordinary sensor — a
  // thermocouple, a level, a position encoder. Here it is the TOOL, which no motor-side signal
  // carries, so `inv` reads a LASER TRACKER. That is legal, because the tracker is already this
  // project's commissioning instrument and the teacher needs it too; it is not free, and §52.42
  // prices it at 3.9x over the best permanently mounted alternative.
  name: '2R compliant arm (bench cell)',
  spec: armSpec, nc: 2, N: armSpec.N,
  // THE RIG STATES NO CLOCK. `arm.step(tau1, tau2, 1)` advances one SOLVER step and nothing here
  // converts that to seconds — `commtime.mjs` already records this plant as *UNKNOWN, the rig
  // states no clock*, and it does not tick `meter.mjs` either, so the CALENDAR column below reads
  // UNKNOWN rather than zero (rule 25). The step count is exact and is printed by hand.
  dt: 1, unit: 'step',
  incumbent: 'the block ships 6.63x = conventional 1.01x (REFUSED) x learned 6.63x (§96); '
    + 'the teacher-taught distilled object 1.6159e-1 contour rms',
  baseline: null,
  // THE SETTLE IS READ ON THE TRACKER, NOT ON THE ENCODER. Channel 6 is the tool; channels 0-1
  // are motor-side and settle with the POSITION LOOP while the thing the window has to reach is
  // the LINK's ring (§52.36 measures its memory at ~7,850 raw steps). Reading the encoder here
  // would size the window from the loop and call it the plant.
  settle: () => measureSettle(armSpec, { delta: 0.25 * armSpec.uMax, idx: 6, N: 30000 }),
  inv: (y) => armSpec.inv(y),
  // THE DIET'S LAPS ARE DRAWN, so the aliasing bound must be the SHORTEST lap any seed produces
  // and not one seed's. §103's headline moved 2.3x on exactly this (rule 31).
  seglen: () => Math.min(...SEEDS.flatMap((sd) => armDiet(lcg(sd)).map((g) => g.n))),
  diet: armDiet,
  // ONE MACHINE PER `fresh()`, BECAUSE A RE-HOMED ARM IS NOT A FRESH ONE. Counted rather than
  // guessed: 1 settle probe + 1 open loop + 1 ZERO control + 1 price + per seed (6 excitation
  // segments + the fitted run + the shuffle), with a few spare so an exhausted pool is a bug and
  // never a silent re-use.
  prime: () => armSpec.prime(12 + 8 * (SEEDS.length - 1) + 6),
  /**
   * THE SECOND METRIC, AND IT EXISTS TO CLOSE A RULE-19 GAP THE RECORD NAMES IN ITS OWN WORDS.
   *
   * §111: *THE FACTOR IS NOT COMPARABLE TO 6.63x IN THE SAME METRIC — this is JOINT rms and
   * `distil-arm.mjs` quotes CONTOUR rms — so "the teacher is worth 4.7x here" is NOT a claim the
   * record supports.* Every other term in that comparison already matches: same plant, same cell
   * (K 0.25 / E 0.03), same SHIPPED loop (`armSpec` passes `BENCH_SERVO.bandwidth` explicitly
   * rather than taking `arm-rig.mjs`'s pre-§52.37 default), same sharp square, same BARE
   * denominator — `scoreSet` scores bare→policy and reads **8.18x** there (CLAUDE.md's target-1
   * table). One term differed, and it is the only one this row could not state.
   *
   * AND §111's OWN SENTENCE IS HALF WRONG, WHICH ONLY READING BOTH LOOPS SHOWS. It says
   * `distil-arm.mjs` quotes CONTOUR rms; that is true of `rep.base / rep.best` (6.63x), which
   * comes from `autohost.js`'s top-level `run` returning `{ score: rep.totalRms }` — but the
   * 8.18x is `scoreSet`, and `scoreSet` drives the TRAINING-RUN closure, whose `run` returns
   * `score: Math.sqrt(s2/n)` where `s2` accumulates `worldToJoint(tool − commanded)`. So the
   * 8.18x is JOINT rms — THE SAME QUANTITY THIS ROW ALREADY PRINTS — by the same Jacobian-inverse
   * formula `routeSignals` uses. The metric gap §111 names is real; it is between the 6.63x and
   * this row, not between the 8.18x and this row.
   *
   * SO IT IS THE SAME READING, NOT A SECOND ONE. `stepArm` publishes the tool on measured channels
   * 6 and 7 — the tracker, commissioning-only — and `decompose` + `ContourScore` are the objects
   * `deployOn` and `autohost.js` already score through (rule 61).
   *
   * WHAT STILL DIFFERS AND IS STATED RATHER THAN FOLDED IN (rule 19, from the other side): the
   * SUPPORT and the NORMALISATION. This kit scores ONE pass of the lap with the first 5% dropped
   * and advances `n` ONCE PER CHANNEL; `autohost.js` runs `warmup` laps, averages `avg` settled
   * ones and advances `n` once per STEP — exactly √2 apart for a two-channel plant, before any
   * support difference. Asked for the same BARE machine the two read 1.0178e+0 against
   * `scoreSet`'s 1.4564e+0 in TOOL units (1.43x) and 6.400e-2 against 1.3046e-1 in JOINT units
   * (2.04x); divide out the √2 and the joint column reads 1.44x — ONE support factor, measured
   * the same size by two metrics sharing no arithmetic (rule 15). Both apply to numerator and
   * denominator alike, so a common factor cancels in a FACTOR and not in an rms.
   *
   * DO NOT COMPARE AGAINST `host.run`'s 1.0717e+0: that loop arms `rc.feedforward` and is the
   * CONVENTIONAL machine, where `scoreSet`'s closure runs `ZFF` because the distilled rung
   * REPLACES that feedforward. The first draft of this comparison did exactly that, read 5.3%
   * and called two harnesses in agreement — a bare machine against a conventional one, agreeing
   * by coincidence (rules 14, 17).
   *
   * The tau and omega handed to `ContourScore.step` are ZERO: this row wants the three deviation
   * rms values and not the energy or reversal columns, and those accumulate harmlessly from zeros.
   */
  alt: {
    name: 'tool totalRms (contour ⊕ lag) — `distil-arm.mjs`\'s own metric, bare → ①d',
    make: () => {
      const path = armSpec.meta.path;
      const kMax = Math.ceil(path.lap);
      const sc = new ContourScore({ joints: 2 });
      const Z = [0, 0];
      return {
        tap: (k, r) => {
          const cmd = path.at(Math.max(0, Math.min(kMax, k)));
          const d = decompose(path, [r.measured[6], r.measured[7]], cmd);
          sc.step(d.contour, d.lag, Z, Z);
        },
        read: () => { const rp = sc.report(); return { v: rp.totalRms, c: rp.contourRms, l: rp.lagRms }; },
      };
    },
  },
},

// ============================================================ CLASS C: a REGULATOR, and the route cannot address it
{
  name: 'cold mill AGC',
  spec: millSpec, nc: 1, N: RM.T_RUN,
  dt: RM.DT, unit: 's',
  incumbent: 'the learned object 2.62x (§95); the conventional rung REFUSES at 1.00x',
  baseline: '15.154335422210291 µm open loop (§89.2)',
  // NOT PROBED, AND THE REASON IS THE INSTRUMENT (rule 17). The only output this plant publishes
  // is the X-ray gauge, which carries 2 µm of noise; a gap step inside the channel box moves it
  // ~13 µm, so a 2% settle threshold sits at 0.27 µm — six times BELOW the noise, and the probe
  // would return its own window length and read as a plant with an enormous memory. This is
  // `distil-mill.mjs`'s own stated 400, whose reason is structural rather than fitted: the capsule
  // lag is 10 steps and what the window must span is the 100-step transport delay.
  settle: 400,
  // The gaugemeter's own static inverse: h = (MM·S + QM·H0)/(MM+QM) at nominal entry gauge and
  // zero eccentricity, so S = (h(MM+QM) − QM·H0)/MM. It is the closed form `S0` is computed from
  // in the rig, read backwards; the achieved gauge is measured signal 2.
  inv: (y) => [(y[2] * (RM.MM + RM.QM) - RM.QM * RM.H0) / RM.MM],
  seglen: RM.T_RUN,
  // THE STRUCTURAL CLAIM, ASSERTED RATHER THAN INFERRED FROM A SCORE. `millSpec.refAt` is a
  // CONSTANT, so at deploy every window of it is the same window and the map can emit ONE number
  // for the whole run. A near-1.000x row would be indistinguishable from a fit that found
  // nothing; a correction SPREAD of exactly zero is the representational statement (rule 25).
  constant: true,
  diet: (rnd) => {
    // Sized from the CHANNEL BOX rather than the program, because a regulator's program has NO
    // SPAN to size from — which is itself part of the finding: any diet here is off-program by
    // construction, so rule 41b cannot even be applied in its usual form.
    const lo = millSpec.channels[0].lo, hi = millSpec.channels[0].hi;
    const pick = () => lo + (hi - lo) * rnd();
    const segs = [];
    for (let s = 0; s < 6; s++) {
      const n = RM.T_RUN, SEG = Math.floor(n / 4), HOLD = Math.floor(SEG * 0.3);
      const rec = [RM.S0, pick(), pick(), pick(), pick()];
      segs.push({ n, refAt: (k) => {
        const i = Math.min(rec.length - 2, Math.floor(k / SEG));
        const t = (k - i * SEG - HOLD) / (SEG - HOLD);
        const f = t <= 0 ? 0 : t >= 1 ? 1 : quintic(t);
        return [rec[i] + (rec[i + 1] - rec[i]) * f];
      } });
    }
    return segs;
  },
}];

const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));

const fmt = (v) => (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-2)) ? v.toExponential(4) : v.toFixed(4);

// THE BANNER IS THE DRIVER'S, NOT THE MODULE'S. A harness importing `PLANTS` for one plant's
// declarations should not print this file's header into the middle of its own report (rule 30).
if (IS_ENTRY) {
  console.log(`\ndirinvall — the TEACHER-FREE direct inverse, one kit, every plant with a nominal inverse`);
  console.log(`  seeds ${SEEDS.join(',')}, ridge ${RIDGE}\n`);
}

/** Plant steps in that plant's own time base — target 4's units, never the simulator's clock. */
const human = (steps, dt) => {
  const s = steps * dt;
  if (s < 90) return `${s.toFixed(1)} s`;
  if (s < 5400) return `${(s / 60).toFixed(1)} min`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} days`;
};

/**
 * THE DECLARATIONS ARE IMPORTABLE; THE DRIVER RUNS ONLY AS AN ENTRY POINT (plan §116).
 *
 * `PLANTS` holds each plant's DIET, its nominal INVERSE and its settle probe — the three things a
 * harness needs to reach `AutoStack`'s ①d rung — and until now importing this module RAN THE WHOLE
 * DRIVER, verified by a bare `import()` that began commissioning the barrel. So the table could not
 * be consumed without executing every plant, and a harness reaching for one plant's diet would have
 * had to COPY it, which is the second copy rule 61 exists to prevent.
 *
 * The guard is the ITERABLE rather than a wrapper block, deliberately: wrapping 130 lines would
 * reindent every one of them and bury the real change in whitespace, where iterating an EMPTY list
 * on import is one line and obviously equivalent. Everything above is a `const` or a pure function,
 * and every plant's `settle` is a CLOSURE that probes only when the driver calls it — so an import
 * advances no plant. The control is that running this file as a script is BYTE-IDENTICAL.
 */
export { PLANTS };

for (const P of (IS_ENTRY ? PLANTS : [])) {
  if (ONLY && !ONLY.some((o) => P.name.toLowerCase().includes(o.toLowerCase()))) continue;
  // THE SETTLE IS MEASURED ON THE PLANT WHERE THE PLANT ALLOWS IT (rule 31). The barrel's and the
  // column's are the numbers their OWN `distil-*.mjs` harnesses derive, carried here so those two
  // rows stay the §104 control; every plant added since measures its own through the shared kit.
  // A PLANT MAY NEED BUILDING BEFORE IT CAN BE ASKED ANYTHING (the 2R arm's links are lattices and
  // `buildLink` is async). Every other plant declares no `prime` and this line is inert for it.
  if (P.prime) await P.prime();
  const settle = typeof P.settle === 'function' ? P.settle() : P.settle;
  if (settle === null) throw new Error(`${P.name}: the settle probe read NO MOVEMENT — that is an instrument fault, not a fast plant (rule 25)`);
  const seglen = typeof P.seglen === 'function' ? P.seglen() : P.seglen;
  const { reach, offsets, rule } = deriveWindow({ settle, lapMin: seglen });
  const R = refSeries(P.spec.refAt, P.N);
  // THE AUTHORITY IS A KNOB BECAUSE A CORRECTION PINNED AT ITS CAP IS NOT A CONTROLLER RESULT.
  // §62.4 is the precedent: the barrel's forced correction sat at EXACTLY uPk 12.0000 of 12, and
  // §84.10 had to sweep the cart-pole over a 24-fold span of authority before its factor could be
  // called a result rather than an artefact. If the delivered factor moves with `UCAP`, the number
  // measures the cap; if it has an INTERIOR optimum, it measures the map.
  const uMax = P.spec.uMax * +(process.env.UCAP || 1);
  const opts = { offsets, uMax, ridge: RIDGE, nc: P.nc, refDim: P.nc, stride: 7 };

  console.log(`${P.name}${CARRY ? `   [plant CARRIED across excitation segments${DWELL ? `, ${settle}-step dwell at each` : ', RAW — no dwell'}]` : ''}`);
  console.log(`  window ±${reach} raw steps, ${offsets.length} taps  (settle ${settle}, diet lap `
    + `${seglen}, min(0.61·settle, lap/8) = ${rule})`);
  if (P.incumbent) console.log(`  the INCUMBENT on this plant: ${P.incumbent}`);

  // A PLANT MAY DECLARE A SECOND READING OF THE SAME RUN (the 2R arm does; see its `alt`). It is
  // built fresh per scored run and only READS, so every other plant is byte-identical.
  const openAlt = P.alt ? P.alt.make() : null;
  const openP = priceOf(() => scoreOn(P.spec, R, null, { N: P.N, tap: openAlt && openAlt.tap }));
  const open = openP.value;
  const openA = openAlt && openAlt.read();
  console.log(`  open loop  ${fmt(open.rms)}${P.baseline ? `   [${P.baseline}]` : ''}`);
  if (openA) {
    console.log(`  ALSO, on the same run and the same support: ${P.alt.name}`);
    console.log(`  open loop  ${fmt(openA.v)}   (contour ${fmt(openA.c)}, lag ${fmt(openA.l)})`);
  }

  const rows = [];
  let exciteSteps = 0;
  for (const seed of SEEDS) {
    const ex = priceOf(() => excite(P.spec, P.diet, { seed, carry: CARRY, dwell: DWELL ? settle : 0 }));
    const segs = ex.value;
    if (seed === SEEDS[0]) exciteSteps = ex.steps;
    // THE PER-SEGMENT MEAN OF THE TARGET `c − inv(y)`, printed under `SEGMEANS=1` (plan §123).
    // Built to name the mechanism behind the carried barrel's DELIVERING shuffle control — the
    // hypothesis being that a carried segment begins inside the previous transient and so carries
    // a per-segment offset a permutation keeps — AND IT REFUTED IT: fresh segments carry offsets of
    // the same size (0.4-1.3 against an rms of 1.2-2.4 on seed 1, all of one sign on channel 0),
    // and carried ones alternate in sign. Kept because a refuted instrument on record is worth more
    // than a deleted one (rule 59), and because the sign pattern is the one reading here that
    // separates the two excitations.
    if (process.env.SEGMEANS === '1' && seed === SEEDS[0]) {
      const rmsT = (seg) => { let ss = 0, n = 0; for (let k = 0; k < seg.n; k++) for (let j = 0; j < P.nc; j++) { const t = seg.C[k][j] - P.inv(seg.Y[k])[j]; ss += t * t; n++; } return Math.sqrt(ss / n); };
      console.log(`  per-segment target MEAN (c − inv(y)), each channel, against the target's rms:`);
      for (const seg of segs) {
        const m = new Array(P.nc).fill(0);
        for (let k = 0; k < seg.n; k++) { const u = P.inv(seg.Y[k]); for (let j = 0; j < P.nc; j++) m[j] += (seg.C[k][j] - u[j]) / seg.n; }
        console.log(`    mean [${m.map((v) => v.toExponential(2)).join(', ')}]   rms ${rmsT(seg).toExponential(2)}`
          + (seg.dwell ? `   (dwell ${seg.dwell})` : seg.carried ? '   (raw carry)' : '   (fresh)'));
      }
    }

    // ---- CONTROL 1: an all-zero map must reproduce the open loop BIT-EXACTLY. This is the check
    // `distil-tank.mjs` lacked for two sections while reporting "1.000x, nothing harmed".
    if (seed === SEEDS[0]) {
      const zero = fitInverse(segs, P.inv, opts);
      zero.W = zero.W.map((w) => w.map(() => 0));
      const z = scoreOn(P.spec, R, zero, { N: P.N });
      if (z.rms !== open.rms) throw new Error(`${P.name}: ZERO control failed — ${z.rms} vs ${open.rms}; the scored run is not applying what it says`);
      if (z.pk !== 0) throw new Error(`${P.name}: ZERO control applied ${z.pk}`);
    }

    const pol = fitInverse(segs, P.inv, opts);
    const gotAlt = P.alt ? P.alt.make() : null;
    const got = scoreOn(P.spec, R, pol, { N: P.N, tap: gotAlt && gotAlt.tap });
    const gotA = gotAlt && gotAlt.read();
    const ho = heldOutR2(segs, P.inv, opts, reach);

    // ---- CONTROL 2: the SAME rows against a PERMUTED target. If this delivers, the harness is not
    // measuring the map (rule 15).
    const sh = fitInverse(segs, P.inv, { ...opts, shuffle: lcg(1000 + seed) });
    const shs = scoreOn(P.spec, R, sh, { N: P.N });

    // ---- CONTROL 3, ON A REGULATOR ONLY: the deployed correction must be CONSTANT, because the
    // reference it reads is. Asserted, so the structural claim is a measurement and not a reading
    // of a score that happens to sit near 1.000x (rule 25).
    if (P.constant && got.spread !== 0) {
      throw new Error(`${P.name}: declared a REGULATOR but the correction varies by ${got.spread} — `
        + 'either the reference is not constant or this claim is wrong');
    }
    // ---- AND THE OTHER HALF OF IT (rule 9). Requirement 2 was only ever asserted in the
    // direction that fails: the mill's spread must be 0. A plant declared NON-constant must then
    // have a spread that is NOT 0, or "the deployed input varies" is an assumption about every
    // other row rather than a measurement — and a harness that only ever checks the failing half
    // cannot tell a working map from one that emitted a constant for a different reason.
    if (!P.constant && !(got.spread > 0)) {
      throw new Error(`${P.name}: the deployed correction is CONSTANT (spread ${got.spread}) on a `
        + 'plant whose reference moves — requirement 2 fails here and the row is not a map (rule 9)');
    }

    rows.push({ seed, x: open.rms / got.rms, pk: got.pk, r2: ho.r2, shuf: open.rms / shs.rms, rms: got.rms,
      xAlt: gotA ? openA.v / gotA.v : null, altRms: gotA ? gotA.v : null });
    console.log(`    seed ${seed}   ${fmt(got.rms)}  ${(open.rms / got.rms).toFixed(3)}x`
      + `   peak |u| ${got.pk.toFixed(3)} of ${uMax.toFixed(3)}${got.pk >= uMax * 0.999 ? ' SATURATED' : ''}`
      + `   held-out R² ${ho.r2.map((v) => v.toFixed(3)).join('/')}`
      + `   SHUFFLE ${(open.rms / shs.rms).toFixed(3)}x`
      + (P.constant ? `   correction SPREAD ${got.spread.toExponential(1)}` : ''));
    if (gotA) {
      console.log(`             ALT ${fmt(gotA.v)}  ${(openA.v / gotA.v).toFixed(3)}x`
        + `   (contour ${(openA.c / gotA.c).toFixed(3)}x, lag ${(openA.l / gotA.l).toFixed(3)}x)`);
    }
  }
  const xs = rows.map((r) => r.x).sort((a, b) => a - b);
  const shf = rows.map((r) => r.shuf);
  // THERE IS NO GATE IN THIS KIT AND THAT IS DELIBERATE. `AutoStack` scores every rung on the
  // machine and reverts what does not win, so a row below 1.000x here is what the ROUTE produces
  // and not what a block would ship — the one press would refuse it. Printing the raw verdict is
  // the honest half: a harmful row is a result about the route (rule 27).
  const verdict = xs[xs.length - 1] < 0.995 ? 'MADE WORSE — the raw route harms this plant; a machine-scored verify would REFUSE it'
    : xs[0] > 1.005 ? 'HELPS on every seed'
      : 'LEVEL / mixed';
  console.log(`  ---- ${P.name}: ${xs[0].toFixed(3)}x .. ${xs[xs.length - 1].toFixed(3)}x over ${xs.length} seeds`
    + `  (spread ${(xs[xs.length - 1] / xs[0]).toFixed(2)}x, median ${((xs[(xs.length - 1) >> 1] + xs[xs.length >> 1]) / 2).toFixed(3)}x)`
    + `   ${verdict}`);
  if (rows.every((r) => r.xAlt != null)) {
    const as = rows.map((r) => r.xAlt).sort((a, b) => a - b);
    console.log(`  ---- ${P.name}, ${P.alt.name}: ${as[0].toFixed(3)}x .. ${as[as.length - 1].toFixed(3)}x`
      + `  (median ${((as[(as.length - 1) >> 1] + as[as.length >> 1]) / 2).toFixed(3)}x)`);
  }
  if (rows.some((r) => r.pk >= uMax * 0.999)) {
    console.log(`       *** SATURATED at the cap on ${rows.filter((r) => r.pk >= uMax * 0.999).length} of `
      + `${rows.length} seeds — this number may measure the CAP and not the MAP. Sweep \`UCAP\` `
      + `and read whether it has an INTERIOR optimum (§62.4, §84.10).`);
  }
  console.log(`       SHUFFLE control ${Math.min(...shf).toFixed(3)}x .. ${Math.max(...shf).toFixed(3)}x`
    + `   — ${Math.max(...shf) < 1.15 ? 'does NOT deliver, so the fit is reading the map' : '*** DELIVERS — the harness is measuring something else, the row is VOID ***'}`);
  console.log(`       ZERO control: an all-zero map reproduced the open loop bit-exactly (asserted)`);
  if (P.constant) {
    console.log(`       REGULATOR control: the deployed correction is CONSTANT to the last bit over `
      + `${P.N} steps (asserted). A map OF THE SETPOINT cannot address a plant whose setpoint never moves.`);
  }
  // THE CALENDAR, IN THIS PLANT'S OWN TIME BASE (rule 19), COUNTED AT THE PLANT BY `meter.mjs`
  // AND NOT COMPUTED FROM SEGMENT LENGTHS — WHICH IS WHAT §104 DID, AND IT UNDERSTATED BOTH OF
  // ITS OWN ROWS. §104 wrote *barrel 45,000 excite + 20,000 verify = 65,000 = 18.1 h*; the meter
  // reads 200,000 and 2.3 days, because `barrelSpec.fresh()` pre-rolls 20,000 settling steps and
  // there are seven `fresh()` calls. The column goes 21,000 to 42,000 the same way. So §104's
  // 44x and 21x against the teacher-taught calendars are about 3x and 2x too generous.
  //
  // IT IS THE SAME METER `priceFrom` PRICES THE TEACHER-TAUGHT ROUTE WITH, so each plant's RATIO
  // is like for like whatever that plant's rig does. What the rigs do is NOT uniform and is
  // printed rather than assumed (rule 30): they tick during `fresh()`, except EMPS and the 2R
  // arm, which never tick at all and read UNKNOWN rather than zero (rule 25).
  //
  // AND UNTIL plan §131 TWO OF THEM RETURNED THEIR COUNTING WRAPPER ONLY AFTER THE SETTLE, so
  // their pre-roll was invisible to any caller — THE LINE BELOW SAID SO, on the real cascaded
  // tanks and the real steam exchanger, while §126 and §127 published `priceFrom`'s number from
  // the same run. Printing a disagreement is not comparing it (rule 15b, which §117 wrote after
  // paying for exactly this), so `test/pilot/freshmeter.test.mjs` is that comparison made a
  // check: a plant that ticks on `step` and meters 0 on `fresh()` is now RED, and it is checked
  // to fail on the pre-repair state.
  const freshSteps = priceOf(() => P.spec.fresh()).steps;
  const totSteps = exciteSteps + openP.steps;
  if (totSteps === 0) {
    // "NOT MEASURED" AND "FREE" ARE DIFFERENT STATES (rule 25). Two rigs here never call the
    // meter's `tick` — `commtime.mjs` already records EMPS as *UNKNOWN, the rig states no clock*
    // — so the counter reads 0 and a calendar printed from it would say this commissioning costs
    // the plant nothing, which is the most flattering number in the table and is not a reading.
    console.log(`       CALENDAR: UNKNOWN — this rig does not tick \`meter.mjs\`, so the plant's own `
      + `clock cannot be read here (as \`commtime.mjs\` already records). NOT zero.\n`);
  } else {
    console.log(`       CALENDAR: excitation ${exciteSteps.toLocaleString()} steps + verify `
      + `${openP.steps.toLocaleString()} = ${totSteps.toLocaleString()} @ ${P.dt} ${P.unit}/step`
      + `  =  ${human(totSteps, P.dt)}   (ZERO teacher laps)`);
    console.log(`                 of which each \`fresh()\` pre-roll is ${freshSteps.toLocaleString()}`
      + ` steps — ${freshSteps > 0 ? 'COUNTED here and in `priceFrom`' : 'NOT counted by this rig, so this calendar OMITS its settle'}\n`);
  }
}
