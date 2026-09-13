/**
 * @file WHAT COMMISSIONING COSTS THE PLANT, ON EVERY PLANT — target 4's number, which each plant
 *       has been PRINTING all along and which nobody ever collected (plan §54.6).
 *
 * CLAUDE.md's target 4 reads "COMMISSIONING IN MINUTES, NOT AN AFTERNOON. MET ON THE ARM — 17
 * MINUTES TO 2", and states its own caveat two sections earlier: "AND COMPUTE TIME IS NOT
 * COMMISSIONING TIME. The '2 minutes on the arm' is wall clock for the ladder." Then it quotes the
 * wall clock against the target anyway, and records "WHAT IS NOT YET DONE: the same measurement on
 * the other five plants."
 *
 * It was already done. Every plant test prints its own commissioning cost IN ITS OWN PROCESS TIME
 * — "421 min of process time", "91.2 h", "333 s of rolling" — because each rig converts its own
 * step to its own clock. Six numbers, printed on every full run, never put in one table. This is
 * that table, and it is a scrape rather than a re-measurement precisely so that no plant is
 * re-scored by a metric this file invented.
 *
 * WHAT IT FOUND, and it is not what target 4 says. Ranked by what the plant actually pays:
 *
 *     cold mill    166,400 steps      5.5 min       MET
 *     quad tank    252,613 steps      7.0 h         MISSED
 *     barrel       328,270 steps      3.8 days      MISSED
 *     Wood-Berry    91,400 steps      6.3 days      MISSED
 *     EMPS          48,400 steps      —             UNKNOWN — the rig states no clock
 *     2R arm       165,643 steps      —             UNKNOWN — the rig states no clock
 *
 * ONE of the four plants that state a clock meets target 4, and the spread is 1643x. The two that
 * do not state one are UNKNOWN and not met: "not measured" and "passed" are different states
 * (rule 25), and the arm is the plant target 4 currently claims as MET — on a WALL CLOCK, which is
 * the simulator's and not the machine's, and its rig does not convert.
 *
 * AND STEPS AND TIME RANK DIFFERENTLY, WHICH IS WHAT SETTLES IT. By steps Wood-Berry is the
 * CHEAPEST commissioning here (91,400); by the clock its plant pays it is the most expensive
 * (6.3 days), because one of its steps is six minutes of column. So a target counted in steps —
 * or in a simulator's wall clock — is measuring this repository and not the machine, and the
 * instrument prints that disagreement rather than leaving it to be noticed.
 *
 * AND THE SHARP PART: THE TWO PLANTS THAT REFUSE ARE THE TWO MOST EXPENSIVE. Wood-Berry spends
 * 6.3 days to arrive at "no controller" and the barrel 3.8 days to arrive at 0.22x and the same
 * answer. The refusals are correct — this file's strongest claim — and each one costs the better
 * part of a working week of production. Nothing in the north star prices a refusal, and on the two
 * plants where refusing is the right answer it is the most expensive outcome available.
 *
 * AND EVERY NUMBER ABOVE PRICES THE WRONG OBJECT (plan §72). Each of those lines counts the
 * steps a bare `Pilot` advanced — the TEACHER. Under the memory's retirement the teacher is not
 * what a machine receives: the product is `distil.js`'s weight vector, and the route to it adds a
 * DIET of training runs whose prefixes have to be CONVERGED before one row exists. CLAUDE.md
 * names that cost in prose — "laps on real hardware producing nothing" — and nothing counted it.
 *
 * `PRODUCT=1` runs the distilled harness for each plant that has one and reads the meter
 * `rigs/meter.mjs` keeps inside the plant's own `step`, so no caller can bypass it. The two
 * columns print side by side, because the second is not a correction of the first — they are the
 * costs of two different objects and only one of them ships:
 *
 *     plant         TEACHER              PRODUCT            factor
 *     cold mill     5.5 min   MET        4.6 h   MISSED       50x
 *     Wood-Berry    6.3 days  MISSED     249 days MISSED      40x
 *
 * SO TARGET 4 IS WORSE THAN THE FILE SAYS, AND ON THE ONE PLANT IT CLAIMED. The mill was the
 * single plant of four meeting "commissioning in minutes"; the object that actually deploys
 * there costs fifty times more and misses. A target measured against the teacher was measuring
 * a component that the retirement had already removed from the deliverable.
 *
 * Run: node test/pilot/commtime.mjs [LOG=<a full-tier node run's log>] [PRODUCT=1]
 *      With no LOG it runs each plant's own test in a child, which is the same work the suite
 *      already does — about 15 minutes. Scraping a log you already have is free and identical,
 *      which is why it is the documented route (rule 1: the cheapest instrument that answers).
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

// Each plant, the test that prints its cost, and the HEADING that test prints first — the heading
// is how a cost line is attributed, because several plants print the same shape of line.
const PLANTS = [
  { name: 'EMPS',       file: 'emps.test.mjs',      head: /^pilot: route, limit, run, deploy on a foreign plant/m },
  { name: '2R arm',     file: 'arm.test.mjs',       head: /^pilot: the 2R arm/m },
  { name: 'cold mill',  file: 'rollmill.test.mjs',  head: /^pilot: a cold mill stand/m },
  { name: 'quad tank',  file: 'tanks.test.mjs',     head: /^pilot: the quadruple-tank/m },
  { name: 'Wood-Berry', file: 'woodberry.test.mjs', head: /^pilot: the Wood–Berry column/m },
  { name: 'barrel',     file: 'thermal.test.mjs',   head: /^pilot: a three-zone extruder barrel/m },
];

// THE HARNESS THAT COMMISSIONS THE THING THAT SHIPS, where one exists. Four of the six plants
// have been asked for the deployed object; the arm and EMPS reach it through their own hosts and
// state no plant clock, so they stay UNKNOWN here exactly as they do in the teacher column
// (rule 25 — a plant that does not state its clock has not passed, it has not been asked).
const PRODUCT = {
  'cold mill': 'distil-mill.mjs',
  'quad tank': 'distil-tank.mjs',
  'Wood-Berry': 'distil-column.mjs',
  barrel: 'distil-barrel.mjs',
};

// `the PRODUCT commissioned in N steps = T unit of plant time` — printed by `distilkit.mjs`'s
// `priceFrom`, deliberately worded so it can never be mistaken for the teacher's line above.
const PCOST = /the PRODUCT commissioned in (\d+) steps\s*=\s*([\d.]+)\s*(s|min|h|days)\b/;

// `commissioned in N steps[ = T UNIT of ...]`. The process-time clause is OPTIONAL because two
// rigs do not convert — and a missing conversion must read as MISSING rather than as zero, which
// is the whole of rule 25 and the reason target 4 could sit unmeasured while being printed.
const COST = /commissioned in (\d+) steps(?:\s*=\s*([\d.]+)\s*(s|min|h)\b)?/;

/** Seconds of the PLANT's own clock, so six different rigs land on one axis. */
const secs = (v, u) => (u === 's' ? v : u === 'min' ? v * 60
  : u === 'h' ? v * 3600 : v * 86400);
const human = (s) => (s < 90 ? `${s.toFixed(0)} s`
  : s < 5400 ? `${(s / 60).toFixed(1)} min`
  : s < 172800 ? `${(s / 3600).toFixed(1)} h`
  : `${(s / 86400).toFixed(1)} days`);

/** The PRODUCT's own line, from the distilled harness (or from a log that already has it). */
async function productFor(plant) {
  const file = PRODUCT[plant.name];
  if (!file) return null;
  if (process.env.PLOG) {
    const m = PCOST.exec(readFileSync(process.env.PLOG, 'utf8'));
    return m ? { steps: +m[1], t: secs(+m[2], m[3]) } : null;
  }
  const out = await new Promise((res) => {
    const ch = spawn(process.execPath, [join(ROOT, 'test/pilot', file)],
      { cwd: ROOT, env: { ...process.env, SUITE: 'full' } });
    let o = ''; ch.stdout.on('data', (d) => { o += d; }); ch.stderr.on('data', (d) => { o += d; });
    ch.on('close', () => res(o));
  });
  const m = PCOST.exec(out);
  return m ? { steps: +m[1], t: secs(+m[2], m[3]) } : null;
}

async function textFor(plant) {
  if (process.env.LOG) {
    const all = readFileSync(process.env.LOG, 'utf8');
    const m = plant.head.exec(all);
    // Attribute by heading, then take only the block up to the next plant heading, so a cost line
    // can never be credited to the plant above it.
    return m ? all.slice(m.index, m.index + 4000) : '';
  }
  return new Promise((res) => {
    const ch = spawn(process.execPath, [join(ROOT, 'test/pilot', plant.file)],
      { cwd: ROOT, env: { ...process.env, SUITE: 'full' } });
    let out = ''; ch.stdout.on('data', (d) => { out += d; }); ch.stderr.on('data', (d) => { out += d; });
    ch.on('close', () => res(out));
  });
}

console.log('\ncommtime: what commissioning costs THE PLANT, in the plant\'s own clock (plan §54.6)\n');
if (!process.env.LOG) console.log('  (no LOG= given — running each plant, ~15 min; a full-tier log is the same answer for free)\n');

const rows = [];
for (const p of PLANTS) {
  const m = COST.exec(await textFor(p));
  rows.push({ p, steps: m ? +m[1] : null, t: m && m[2] ? secs(+m[2], m[3]) : null });
}
rows.sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity));

console.log('  plant           steps      the PLANT\'s own time    target 4');
for (const r of rows) {
  // TARGET 4 SAYS "MINUTES, NOT AN AFTERNOON". Read literally: under an hour is met, and an
  // unconverted rig is UNKNOWN rather than met — a plant that does not state its clock has not
  // passed, it has not been asked (rule 25).
  const verdict = r.t === null ? (r.steps === null ? 'NOT FOUND' : 'no clock — UNKNOWN')
    : r.t <= 3600 ? 'MET' : 'MISSED';
  console.log(`  ${r.p.name.padEnd(12)} ${(r.steps === null ? '—' : r.steps.toLocaleString()).padStart(10)}`
    + `   ${(r.t === null ? '—' : human(r.t)).padStart(12)}          ${verdict}`);
}

const known = rows.filter((r) => r.t !== null);
const met = known.filter((r) => r.t <= 3600);
console.log(`\n  ${met.length} of ${known.length} plants that state a clock meet target 4;`
  + ` the spread is ${known.length ? (known[known.length - 1].t / known[0].t).toFixed(0) : '—'}x.`);
// THE ORDERING IS THE FINDING (rule 27 — the unflattering diagnostic first). If steps and time
// ranked the same way, "commissioning steps" would be a fair proxy and target 4 could stay as it
// is. They do not, and this prints the disagreement rather than leaving it to be noticed.
const byStep = [...known].sort((a, b) => a.steps - b.steps).map((r) => r.p.name).join(' < ');
const byTime = known.map((r) => r.p.name).join(' < ');
console.log(`  by STEPS: ${byStep}`);
console.log(`  by TIME:  ${byTime}`);
console.log(`  ${byStep === byTime ? 'they agree — steps would be a fair proxy'
  : 'THEY DISAGREE — a target counted in steps is measuring the simulator, not the plant'}\n`);

// ---- AND THE SAME QUESTION ASKED OF THE THING THAT SHIPS (plan §72) --------------------
//
// The table above is the TEACHER's cost. It is the right number for what it measures and it is
// not the product's: the deployed artefact is a weight vector distilled from a DIET whose
// prefixes have to be converged first, which is laps of the plant producing nothing. The two
// print side by side rather than one replacing the other, because they price two different
// objects and the FACTOR between them is the finding — the route to the thing that transfers
// costs one to two orders of magnitude more plant time than the thing that does not.
if (process.env.PRODUCT === '1') {
  console.log('\n  and the same question of THE OBJECT THAT SHIPS (plan §72):\n');
  console.log('  plant           product steps   the PLANT\'s own time   target 4   vs TEACHER');
  let anyMet = 0, nProd = 0;
  for (const r of rows) {
    if (!PRODUCT[r.p.name]) {
      console.log(`  ${r.p.name.padEnd(12)} ${'—'.padStart(14)}   ${'—'.padStart(12)}`
        + '   never asked for the deployed object');
      continue;
    }
    const q = await productFor(r.p);
    if (!q) { console.log(`  ${r.p.name.padEnd(12)} ${'—'.padStart(14)}   NOT FOUND`); continue; }
    nProd++;
    const verdict = q.t <= 3600 ? 'MET' : 'MISSED';
    if (q.t <= 3600) anyMet++;
    console.log(`  ${r.p.name.padEnd(12)} ${q.steps.toLocaleString().padStart(14)}`
      + `   ${human(q.t).padStart(12)}   ${verdict.padEnd(8)}`
      + `   ${r.t === null ? '—' : `${(q.t / r.t).toFixed(0)}x more`}`);
  }
  // RULE 27: the unflattering line first, and it is the one that changes target 4's verdict.
  console.log(`\n  ${anyMet} of ${nProd} plants meet target 4 for the object that actually`
    + ' deploys. The teacher column above is not a lower bound on this one — it is the cost of a'
    + ' component the retirement removed from the deliverable.\n');
}
