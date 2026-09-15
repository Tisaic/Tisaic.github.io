/**
 * @file WHAT A SECOND PROGRAM COSTS — target 1's price, on the plants §72.12 never asked
 *       (plan §84.5). Not a test; a SCRAPE, like `commtime.mjs`, for the same reason.
 *
 * §72.12 split the product's commissioning in two and it is the most useful thing in that
 * section: *the plant is characterised ONCE — 59.2 days on the column, 79.6 on the barrel — and
 * each new program after that costs 7.5 and 8.3 days*. It measured two plants of four and the
 * arm not at all, and COM stands at 3 against PID+FF's 7 on the scorecard, so the split matters
 * more than almost anything else here. Every harness has been PRINTING it all along — `priceFrom`
 * emits `the teacher, per training run: 0: … · 1: …` on every full run — and nobody collected it.
 *
 * WHAT THE SPLIT IS, precisely, because the phrase "what a new program costs" hides a choice.
 * Run 0 of the teacher does probe sizing, the probe set, the trial sweep and the refinement; runs
 * 1..n REUSE the operator identified on run 0 (`teacherReuse`, the default since §72.6) and pay
 * the refinement alone. So:
 *
 *   ONCE   = run 0's teacher laps + everything outside the teacher (the cascade, the verify, the
 *            ridge and gain ladders) — paid once per PLANT, ever.
 *   MARGIN = the mean of runs 1..n — what one more program costs when ADDED TO THE DIET.
 *
 * AND THE THIRD NUMBER IS THE ONE THE PRODUCT CLAIMS, WHICH IS ZERO. The deployed object is a map
 * of the commanded reference and is program-agnostic BY CONSTRUCTION — that is target 1, and §75
 * and §50 measure it transferring to programs no diet contained. A customer whose new program is
 * inside the trained envelope pays NOTHING for it: no lap, no refit, no download. MARGIN is what
 * they pay only when transfer is not good enough and the diet has to be ENLARGED, which is a
 * different event from "a new part arrives".
 *
 * Quoting MARGIN as "the cost of a new program" would therefore overstate the bill by infinity,
 * and quoting ZERO without MARGIN would hide what a diet enlargement costs. Both are printed.
 *
 * Run: node test/pilot/progcost.mjs            (runs each harness; ~20 min)
 *      node test/pilot/progcost.mjs LOGS=dir   (scrape logs already on disk)
 */
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const PLANTS = [
  { name: 'cold mill',  file: 'distil-mill.mjs' },
  { name: 'quad tank',  file: 'distil-tank.mjs' },
  { name: 'Wood-Berry', file: 'distil-column.mjs' },
  { name: 'barrel',     file: 'distil-barrel.mjs' },
];

const PCOST = /the PRODUCT commissioned in (\d+) steps\s*=\s*([\d.]+)\s*(s|min|h|days)\b/;
const PER = /the teacher, per training run: (.+)$/m;
const WHERE = /where it goes: (.+)$/m;

const secs = (v, u) => (u === 's' ? v : u === 'min' ? v * 60 : u === 'h' ? v * 3600 : v * 86400);
const human = (s) => (s === null ? '—' : s < 90 ? `${s.toFixed(0)} s`
  : s < 5400 ? `${(s / 60).toFixed(1)} min`
  : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} days`);

/** `0: 18.0 min  ·  1: 8.7 min  ·  …   (kept 0,1,2,3)` -> [[idx, seconds], …] */
function parsePer(line) {
  const out = [];
  for (const part of line.split('·')) {
    const m = /(\d+):\s*([\d.]+)\s*(s|min|h|days)/.exec(part);
    if (m) out.push([+m[1], secs(+m[2], m[3])]);
  }
  return out;
}

async function textFor(p) {
  const dir = (process.env.LOGS || process.argv.find((a) => a.startsWith('LOGS='))?.slice(5)) || null;
  if (dir) {
    const f = join(dir, `${p.file.replace('.mjs', '')}.log`);
    return existsSync(f) ? readFileSync(f, 'utf8') : '';
  }
  return new Promise((res) => {
    const ch = spawn(process.execPath, [join(ROOT, 'test/pilot', p.file)],
      { cwd: ROOT, env: { ...process.env, SUITE: 'full' } });
    let out = ''; ch.stdout.on('data', (d) => { out += d; }); ch.stderr.on('data', (d) => { out += d; });
    ch.on('close', () => res(out));
  });
}

console.log('\nprogcost: what a SECOND program costs — target 1\'s price (plan §84.5)\n');

const rows = [];
for (const p of PLANTS) {
  const t = await textFor(p);
  const c = PCOST.exec(t), per = PER.exec(t), wh = WHERE.exec(t);
  if (!c || !per) { rows.push({ p, total: null }); continue; }
  const total = secs(+c[2], c[3]);
  const runs = parsePer(per[1]);
  const teach = runs.reduce((s, [, v]) => s + v, 0);
  const run0 = runs.length ? runs[0][1] : null;
  const rest = runs.slice(1);
  const margin = rest.length ? rest.reduce((s, [, v]) => s + v, 0) / rest.length : null;
  // Everything the teacher did NOT do is paid once per plant: the cascade, the verify, and the
  // ridge and gain ladders. `where it goes` is the report's own split and is used rather than
  // re-derived, so this file cannot disagree with the harness it scrapes (rule 30).
  rows.push({ p, total, teach, run0, margin, nRuns: runs.length, where: wh ? wh[1].trim() : null });
}

console.log('  plant         product total   ONCE per plant   + per program ADDED   marginal share');
for (const r of rows) {
  if (r.total === null) { console.log(`  ${r.p.name.padEnd(12)}  — not found`); continue; }
  const once = r.total - (r.margin === null ? 0 : r.margin * (r.nRuns - 1));
  console.log(`  ${r.p.name.padEnd(12)} ${human(r.total).padStart(11)}   ${human(once).padStart(12)}`
    + `   ${human(r.margin).padStart(16)}   ${(100 * (r.margin ?? 0) / r.total).toFixed(0)}%`);
}

console.log('\n  where each plant\'s time goes (the report\'s own split, not re-derived):');
for (const r of rows) if (r.where) console.log(`    ${r.p.name.padEnd(12)} ${r.where}`);

console.log('\n  AND THE NUMBER A CUSTOMER ACTUALLY PAYS FOR A NEW PART IS ZERO.');
console.log('  The deployed object is a map of the commanded reference and is program-agnostic by');
console.log('  construction — that IS target 1 — so a program inside the trained envelope costs no');
console.log('  lap, no refit and no download. The per-program column above is what a DIET');
console.log('  ENLARGEMENT costs, which is what you pay when transfer is not good enough, and it');
console.log('  is a different event from a new part arriving. Quoting it as "the cost of a new');
console.log('  program" would overstate the bill by infinity; quoting zero alone would hide what');
console.log('  the fallback costs. Both belong in the same sentence.\n');
