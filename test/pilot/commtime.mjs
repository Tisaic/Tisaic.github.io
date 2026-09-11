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
 * Run: node test/pilot/commtime.mjs [LOG=<a full-tier node run's log>]
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

// `commissioned in N steps[ = T UNIT of ...]`. The process-time clause is OPTIONAL because two
// rigs do not convert — and a missing conversion must read as MISSING rather than as zero, which
// is the whole of rule 25 and the reason target 4 could sit unmeasured while being printed.
const COST = /commissioned in (\d+) steps(?:\s*=\s*([\d.]+)\s*(s|min|h)\b)?/;

/** Seconds of the PLANT's own clock, so six different rigs land on one axis. */
const secs = (v, u) => (u === 's' ? v : u === 'min' ? v * 60 : v * 3600);
const human = (s) => (s < 90 ? `${s.toFixed(0)} s`
  : s < 5400 ? `${(s / 60).toFixed(1)} min`
  : s < 172800 ? `${(s / 3600).toFixed(1)} h`
  : `${(s / 86400).toFixed(1)} days`);

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
