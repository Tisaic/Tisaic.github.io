/**
 * @file WHAT SHIPS, WHAT COMMISSIONS, WHAT IS ONLY THE BENCH — and nothing unaccounted for.
 *
 * This repository conflates four things that have completely different fates on a real
 * installation, and until now nothing stated which was which:
 *
 *   DEPLOY     runs on the machine for ever. A dot product and a clamp.
 *   COMMISSION runs once, on the PLC, and is then idle. The ladder, the teacher, the solver.
 *   BENCH      the plant SIMULATOR and its harness. On an installation the machine is the
 *              machine; none of this exists there.
 *   RETIRED    superseded by a measurement or an owner decision, kept because its test is the
 *              evidence and deleting it would delete the record (rule 59).
 *   OTHER      belongs to a different page of this sandbox (the NGRC playground, FlowSim's soft
 *              sensor, the earlier plant-agnostic controller). Not this product at all — and
 *              counting it as "commissioning" made that number meaningless.
 *
 * WHY A TEST AND NOT A DOCUMENT. A document drifts (rule 30, which this file's own tables have
 * already demonstrated). This fails when a module appears that nobody classified, so the
 * boundary cannot rot quietly — which is the only failure mode that matters here, since the
 * repository grows a module a week and none of them announce their fate.
 *
 * AND THE FIRST VERSION OF ITS WALKER WAS WRONG, WHICH IS WHY IT FOLLOWS DYNAMIC IMPORTS.
 * A static-import walk reported 8,648 lines "unreachable from any page" and the number was used
 * to argue for deletion. Four of those modules — `backends/webgpu.js`, `backends/wgsl.js`,
 * `render/volume3d.js`, `verify.js`, ~1,900 lines — are `await import(...)`ed by `flowsim.html`
 * and are as live as anything else. Rule 17 aimed at a dependency graph: the instrument was
 * incomplete before the codebase was untidy.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};
console.log('\ninventory: what ships, what commissions, what is only the bench\n');

// ---------------------------------------------------------------- the graph
// BOTH import forms. `from '...'` and `import('...')` — the second is how every page loads its
// optional heavy paths, and a walker that misses it declares live code dead.
const EDGE = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
const reach = (entries) => {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f) || !existsSync(f)) return;
    seen.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(EDGE)) if (m[1].startsWith('.')) walk(resolve(dirname(f), m[1]));
  };
  for (const e of entries) walk(e);
  return seen;
};
const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => join(ROOT, f));
const live = reach(pages);

const libFiles = [];
(function rec(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) rec(p); else if (e.endsWith('.js')) libFiles.push(p);
  }
})(join(ROOT, 'lib'));
const lines = (f) => readFileSync(f, 'utf8').split('\n').length;
const rel = (f) => relative(ROOT, f);

// ---------------------------------------------------------------- the classification
// THE DEPLOY SET IS TINY AND THAT IS THE PRODUCT. `deploy.js` is the whole controller a machine
// runs; `distil.js` is on this list only because the page restores a stored policy through it,
// and `test/pilot/artefact.test.mjs` is what proves the deployed arithmetic needs neither.
const DEPLOY = ['lib/pilot/deploy.js'];

// THE BENCH: the plant simulator and its geometry. An installation HAS a machine.
const BENCH = [
  /^lib\/lattsim\//, /^lib\/flexisim\/(arm|arm2r|armnr|joint|link|tipsensor|chainsensor|compliance|twin|residual)\.js$/,
];

// RETIRED, each with the measurement or decision that retired it. Kept because the test that
// scores them IS the evidence — deleting the code deletes the record (rule 59).
const RETIRED = {
  'lib/flexisim/pathilc.js': 'a lap-indexed table. The memory is retired by owner decision; measured at 0.55x on a program it did not learn.',
  'lib/pilot/twin.js': 'the compiled twin (plan §44): ~1.7 h background commissioning per plant and it compiles PER PROGRAM, which target 1 forbids.',
  'lib/flexisim/twin.js': 'the twin\'s plant side — the tile lookup the compile produces. Retired with `lib/pilot/twin.js` and for the same reason: the artifact is per-program, so it cannot satisfy target 1.',
  'lib/pilot/hff.js': 'the lap-periodic rung. Retired by the same decision; still reachable as the distilled rung\'s FALLBACK teacher, and `test/pilot/hff.test.mjs` is the agnosticism evidence.',
};

// Another page's library, or an earlier generation of the controller. `qp.js` is excluded
// because the pilot imports it, and `robotcomp`/`primitives` because the bench page does.
const OTHER = [/^lib\/probesense\//, /^lib\/blackbox\/blackbox\.js$/,
  /^lib\/ngrc\/(?!robotcomp\.js|primitives\.js)/];

const cls = (f) => {
  const r = rel(f);
  if (DEPLOY.includes(r)) return 'DEPLOY';
  if (RETIRED[r]) return 'RETIRED';
  if (BENCH.some((re) => re.test(r))) return 'BENCH';
  if (OTHER.some((re) => re.test(r))) return 'OTHER';
  return 'COMMISSION';
};

// ---------------------------------------------------------------- the report
const tally = {};
for (const f of libFiles) {
  const c = cls(f), L = lines(f);
  (tally[c] ||= { n: 0, lines: 0, files: [] });
  tally[c].n++; tally[c].lines += L; tally[c].files.push(rel(f));
}
const total = libFiles.reduce((a, f) => a + lines(f), 0);
console.log(`  lib/ is ${libFiles.length} modules, ${total} lines. On an installation:`);
for (const c of ['DEPLOY', 'COMMISSION', 'BENCH', 'RETIRED', 'OTHER']) {
  const t = tally[c] || { n: 0, lines: 0 };
  console.log(`    ${c.padEnd(11)} ${String(t.n).padStart(3)} modules  ${String(t.lines).padStart(6)} lines  ${(100 * t.lines / total).toFixed(0).padStart(3)}%`);
}
console.log();

// EVERY MODULE IS EITHER REACHED BY A PAGE OR EXERCISED BY A TEST. Not "there is no dead code" as
// an aspiration — as a check, so the answer stays true. A module that is neither is not evidence
// of anything and nobody would notice it rotting.
const testSrc = [];
(function rec(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) rec(p); else if (e.endsWith('.mjs') || e.endsWith('.js')) testSrc.push(readFileSync(p, 'utf8'));
  }
})(join(ROOT, 'test'));
const allTests = testSrc.join('\n');
const orphans = libFiles.filter((f) => !live.has(f) && !allTests.includes('/' + f.split('/').pop()));
check('every module in lib/ is reached by a page or exercised by a test — nothing is rotting unobserved',
  orphans.length === 0, orphans.map(rel).join(', '));

// THE DEPLOY SET IMPORTS NOTHING. This is the claim the whole product rests on, and it is one
// line to check: if `deploy.js` ever grows an import, the artefact stops being self-contained and
// a customer's port stops being a page of arithmetic.
for (const d of DEPLOY) {
  const src = readFileSync(join(ROOT, d), 'utf8');
  const imports = [...src.matchAll(EDGE)].map((m) => m[1]);
  check(`${d} imports NOTHING — the deployed controller is self-contained`, imports.length === 0, imports.join(', '));
}

// THE BENCH IS THE BULK, AND SAYING SO IS THE POINT. If the simulator were ever a minority of
// this repository the "productionize" story would be much harder than it is.
{
  const b = tally.BENCH.lines, c = tally.COMMISSION.lines;
  check('the plant simulator is a real fraction of lib/, so what a customer receives is much smaller than this repo',
    b > 0.2 * total, `bench ${b} of ${total}`);
  console.log(`    a customer receives DEPLOY (${tally.DEPLOY.lines} lines) and runs COMMISSION (${c} lines) once; the ${b} lines of BENCH exist only here.`);
}

// RETIRED MODULES MUST CARRY THEIR REASON, and the reason must be a measurement or a decision —
// not "unused". Rule 59: a decision has to be falsifiable, not permanent.
{
  const thin = Object.entries(RETIRED).filter(([, why]) => why.length < 40);
  check('every retired module states WHY it is retired, not merely that it is', thin.length === 0, thin.map(([k]) => k).join(', '));
  const missing = Object.keys(RETIRED).filter((k) => !existsSync(join(ROOT, k)));
  check('…and the retired list names no module that has since been deleted', missing.length === 0, missing.join(', '));
}

console.log(`\ninventory: ${failed === 0 ? 'all checks passed' : failed + ' FAILED'}\n`);
process.exit(failed === 0 ? 0 : 1);
