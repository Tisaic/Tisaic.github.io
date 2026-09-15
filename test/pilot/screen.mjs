/**
 * @file WHAT TO EXPECT OF A PLANT, BEFORE ANY CONTROLLER IS BUILT FOR IT (plan §90.1).
 *
 * §55.12's KUKA is this file's whole argument: four sections were spent vendoring, identifying and
 * measuring a 222 MB record before anyone decomposed its torque — and the decomposition is what
 * said it could not support a plant at all. The lesson written down there was *screen it first*,
 * and three instruments in this directory already answer the screen's questions:
 *
 *   `invert.mjs`    prog/rise — how many of the plant's own response times its program contains,
 *                   the ~10 split that predicts BOTH the window rule and target 1 on nine plants;
 *                   and INVERSE %, which is non-zero on exactly one plant and is the one plant
 *                   that resists both admissible objects.
 *   `disscreen.mjs` the open-loop error's exogenous share, which found ONE disturbance testbed in
 *                   eleven plants.
 *
 * NOBODY EVER RAN THEM TOGETHER, and a screen nobody runs as one thing is not a gate. So this is a
 * SCRAPE in exactly the shape `objtable.mjs` established: each instrument EMITS its row where it
 * measured it, `READ=1` reads them back, and no plant is re-run or re-scored by a metric this file
 * invented. What it adds is the one thing neither has: a VERDICT per plant, from rules with
 * numbers in them, set against what that plant ACTUALLY did.
 *
 * THE VERDICT RULES, each citing the measurement that set its number:
 *   prog/rise < 10        expect to need a designed DIET and a re-derived window (§84.9, §87.6 —
 *                         nine plants, four winners, the split holding at ten)
 *   INVERSE > 50%         a forecast-inverting correction is wrong in SIGN; expect a refusal
 *                         (§84.11 — the real arm at 128.3%, the only non-zero in six)
 *   exoShare > 50%        a disturbance testbed: the component must be DECLARED or nothing can
 *                         reject it (§71, §80, §84.3 — the mill at 87.0%)
 *
 * THE COLUMN THAT MAKES IT A CHECK RATHER THAN A TABLE is the last one: the screen's prediction
 * against `objtable`'s own row for the same plant. A screen that agrees with the record everywhere
 * is worth reporting; one that disagrees is worth more, and this project's scrapes have disagreed
 * with its prose every time they were built (rule 30, §86.7, §88.9).
 *
 * Run:  SCREEN_OUT=<dir> node test/pilot/invert.mjs
 *       SCREEN_OUT=<dir> node test/pilot/disscreen.mjs
 *       SCREEN_OUT=<dir> OBJTABLE_OUT=<dir> READ=1 node test/pilot/screen.mjs
 */
import { readFrom } from './rigs/emit.mjs';

const DIR = process.env.SCREEN_OUT;
const ODIR = process.env.OBJTABLE_OUT;
if (process.env.READ !== '1') {
  console.log('\nscreen: pass READ=1 with SCREEN_OUT set. This file re-runs nothing — it reads the');
  console.log('        rows `invert.mjs` and `disscreen.mjs` emit where they measure them.\n');
  process.exit(0);
}

const inv = readFrom(DIR, 'screen.jsonl');
const dis = readFrom(DIR, 'dis.jsonl');
const obj = readFrom(ODIR, 'rows.jsonl', 'file');

if (!inv.length && !dis.length) {
  console.log('\nscreen: no rows. Run invert.mjs and disscreen.mjs with SCREEN_OUT set first.\n');
  process.exit(0);
}

// `objtable` keys by the SCRIPT that produced the row, this keys by the plant; the map is written
// out rather than derived from a string transform, because `distil-realarm` -> `realarm` works and
// `distil-emps.test` -> `emps` does not, and a transform that is right four times in five is how a
// table quietly attributes one plant's result to another (rule 19).
const FILE_OF = { tank: 'distil-tank', column: 'distil-column', mill: 'distil-mill',
  barrel: 'distil-barrel', emps: 'distil-emps.test', arm: 'distil-arm', realarm: 'distil-realarm',
  pend: 'distil-pend', realtanks: 'distil-realtanks', realexch: 'distil-realexch' };

const names = [...new Set([...inv.map((r) => r.name), ...dis.map((r) => r.name)])];
const byName = (rows) => new Map(rows.map((r) => [r.name, r]));
const I = byName(inv), D = byName(dis);
const O = new Map(obj.map((r) => [r.file, r]));

console.log('\nscreen: WHAT TO EXPECT OF A PLANT, from instruments that already measured it\n');
console.log('  read ' + inv.length + ' invert row(s) and ' + dis.length + ' disturbance row(s)'
  + (obj.length ? `, against ${obj.length} objtable row(s)` : ', with NO objtable rows to check against'));

const verdictOf = (i, d) => {
  const out = [];
  if (i && i.progRise !== null && i.progRise !== undefined && i.progRise < 10) {
    out.push('DIET+WINDOW');
  }
  if (i && i.inverse > 0.5) out.push('INVERSE — expect a refusal');
  if (d && d.exoShare > 0.5) out.push('DECLARE the disturbance');
  if (!out.length) out.push('the window rule as derived');
  return out.join(' · ');
};

console.log('\n  plant        prog/rise   INVERSE   exo share   the screen says'
  + '                        what it did');
let disagree = 0, checked = 0;
for (const n of names.sort()) {
  const i = I.get(n), d = D.get(n);
  const v = verdictOf(i, d);
  const o = O.get(FILE_OF[n]);
  // WHAT THE PLANT DID, in the screen's own terms: it needed help if the object was refused, or if
  // its harness had to carry a designed diet or a re-derived constant. Only the first of those is
  // readable from a row, so that is the only one claimed here (rule 25) and the column says so.
  let did = '—', flag = '';
  if (o) {
    checked++;
    const shipped = o.rung === 'DEPLOYED';
    did = shipped ? `object at ${o.gain === null ? '?' : o.gain.toFixed(2)}x` : 'object REFUSED';
    const predictedTrouble = v !== 'the window rule as derived';
    if (predictedTrouble !== !shipped) { flag = '  <- the screen and the record disagree'; disagree++; }
  }
  console.log(`  ${n.padEnd(12)}${(i && i.progRise !== null && i.progRise !== undefined
    ? i.progRise.toFixed(1) : '—').padStart(9)}`
    + `${(i ? (100 * i.inverse).toFixed(1) + '%' : '—').padStart(10)}`
    + `${(d ? (100 * d.exoShare).toFixed(1) + '%' : '—').padStart(12)}   `
    + `${v.padEnd(38)}${did}${flag}`);
}

/**
 * AND THE SCREEN IS A PREDICTOR, NOT A GATE, WHICH IS THE HONEST CLAIM (rule 59, rule 25).
 *
 * `DIET+WINDOW` says *expect to need a designed diet and a re-derived constant*, and every plant
 * it fires on DID need one — but needing one and getting it are different outcomes, and four of
 * those plants then WON. So a disagreement here is not a failure of the screen; it is the screen
 * saying "this will be work" about a plant that was then worked on successfully. What a
 * disagreement in the OTHER direction means is worse and is the one to read: a plant the screen
 * called easy and the object refused is a plant whose difficulty none of these three columns can
 * see — which is exactly what the real flexible arm was until §84.11 gave INVERSE a non-zero row.
 */
console.log(`\n  ${disagree} of ${checked} rows disagree with what the plant did`
  + (checked ? '' : ' — nothing to check against'));
console.log('  A disagreement is not a failure of the screen: `DIET+WINDOW` predicts WORK, and four');
console.log('  plants it fires on were worked on and won. The row worth reading is the opposite —');
console.log('  a plant the screen called easy and the object refused, which is a difficulty none of');
console.log('  these three columns can see (§84.11, which is how INVERSE got its first non-zero).\n');
