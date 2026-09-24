/**
 * @file WHAT SHIPS, WHAT COMMISSIONS, WHAT IS ONLY THE BENCH — and nothing unaccounted for.
 *
 *   DEPLOY      runs on the machine for ever: FB_AutoFF's decision (`lib/autoff/runtime.js`), and the
 *               arm's twin with the job that learns each new program's table on it
 *               (`twin2r.js`, `twinlearn.js`).
 *   COMMISSION  runs on the PLC while commissioning, then idles: the rest of the block.
 *   BENCH       the simulated machines and the physics engine they are built on. An installation
 *               has a real machine; none of this exists there.
 *   OTHER       another page of this sandbox (the NGRC playground, FlowSim's soft sensor).
 *
 * A test and not a document, because a document drifts: this fails when a module appears that
 * nobody classified, when one is neither reached by a page nor exercised by a test, or when the
 * deployed half grows an import. The walker follows `import(...)` as well as `from '...'`,
 * because pages load their heavy paths dynamically.
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

const EDGE = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
const reach = (entries) => {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f) || !existsSync(f)) return;
    seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(EDGE)) if (m[1].startsWith('.')) walk(resolve(dirname(f), m[1]));
  };
  for (const e of entries) walk(e);
  return seen;
};
const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => join(ROOT, f));
const live = reach(pages);

const listFiles = (d, ok) => {
  const out = [];
  (function rec(x) {
    for (const e of readdirSync(x)) {
      if (e === 'node_modules') continue;
      const p = join(x, e);
      if (statSync(p).isDirectory()) rec(p); else if (ok(e)) out.push(p);
    }
  })(d);
  return out;
};
const libFiles = listFiles(join(ROOT, 'lib'), (e) => e.endsWith('.js'));
const rel = (f) => relative(ROOT, f);
const lines = (f) => readFileSync(f, 'utf8').split('\n').length;

const DEPLOY = ['lib/autoff/runtime.js', 'lib/autoff/twin2r.js', 'lib/autoff/twinlearn.js'];
const COMMISSION = ['lib/autoff/autoff.js'];
const BENCH = [/^lib\/lattsim\//, /^lib\/flexisim\//, /^lib\/ngrc\/(robotcomp|primitives)\.js$/];
const OTHER = [/^lib\/ngrc\//, /^lib\/probesense\//];
const cls = (f) => {
  const r = rel(f);
  if (DEPLOY.includes(r)) return 'DEPLOY';
  if (COMMISSION.includes(r)) return 'COMMISSION';
  if (BENCH.some((re) => re.test(r))) return 'BENCH';
  if (OTHER.some((re) => re.test(r))) return 'OTHER';
  return null;
};

const tally = {};
for (const f of libFiles) {
  const c = cls(f) || 'UNCLASSIFIED';
  (tally[c] ||= { n: 0, lines: 0, files: [] });
  tally[c].n++; tally[c].lines += lines(f); tally[c].files.push(rel(f));
}
const total = libFiles.reduce((a, f) => a + lines(f), 0);
console.log(`  lib/ is ${libFiles.length} modules, ${total} lines:`);
for (const c of ['DEPLOY', 'COMMISSION', 'BENCH', 'OTHER', 'UNCLASSIFIED']) {
  const t = tally[c];
  if (t) console.log(`    ${c.padEnd(12)} ${String(t.n).padStart(3)} modules  ${String(t.lines).padStart(6)} lines`);
}
console.log();

check('every module in lib/ is classified', !tally.UNCLASSIFIED, tally.UNCLASSIFIED && tally.UNCLASSIFIED.files.join(', '));
for (const d of [...DEPLOY, ...COMMISSION]) check(`${d} exists`, existsSync(join(ROOT, d)));

// this file names modules in its own lists, so it must not count as exercising them
const testSrc = listFiles(join(ROOT, 'test'), (e) => e.endsWith('.mjs') || e.endsWith('.js'))
  .filter((f) => f !== fileURLToPath(import.meta.url))
  .map((f) => readFileSync(f, 'utf8')).join('\n');
const orphans = libFiles.filter((f) => !live.has(f) && !testSrc.includes('/' + f.split('/').pop()));
check('every module in lib/ is reached by a page or exercised by a test', orphans.length === 0, orphans.map(rel).join(', '));

for (const d of DEPLOY) {
  const imports = [...readFileSync(join(ROOT, d), 'utf8').matchAll(EDGE)].map((m) => m[1]);
  const outside = imports.filter((i) => !DEPLOY.includes(relative(ROOT, resolve(dirname(join(ROOT, d)), i))));
  check(`${d} imports nothing outside the deployed set — what a machine runs is self-contained`, outside.length === 0, outside.join(', '));
}
check('the deployed decision itself imports NOTHING', [...readFileSync(join(ROOT, DEPLOY[0]), 'utf8').matchAll(EDGE)].length === 0);
{
  const imports = [...readFileSync(join(ROOT, COMMISSION[0]), 'utf8').matchAll(EDGE)].map((m) => m[1]);
  check('the commissioning half imports only the deployed half', imports.every((i) => DEPLOY.includes(`lib/autoff/${i.replace('./', '')}`)), imports.join(', '));
}
console.log(`    a machine receives DEPLOY (${tally.DEPLOY.lines} lines) and runs COMMISSION (${tally.COMMISSION.lines} lines) once.`);

console.log(`\ninventory: ${failed === 0 ? 'all checks passed' : failed + ' FAILED'}\n`);
process.exit(failed === 0 ? 0 : 1);
