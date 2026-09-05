/**
 * @file THE SIX-PLANT PASS. Not a test — the table that has to exist before any solver default
 *       moves, and whose absence is why two regressions shipped.
 *
 * CLAUDE.md says it twice, in the sentence right above the thing that broke: a default change
 * "moves every gate in the suite, so it needs the six-plant pass". It was never run. The shared
 * fit was measured on the two plants that deploy — EMPS 12.70x → 14.42x, the arm 7.8154e-2 →
 * 7.4340e-2 — written up as a straight win, and it costs Wood-Berry 17.6% and the tank its
 * basis selection. A change measured only on the plants that already win has been measured on
 * the plants least able to falsify it.
 *
 * AND THE TWO SOLVER KNOBS ARE NOT SEPARABLE, which is the other half of why one plant is not
 * enough. `qpIters` and `horizonTs` are two regularisers of the SAME inversion: at one iteration
 * EMPS reads 14.16x at N=56 and 10.62x at N=68. Sweeping either alone measures a diagonal of a
 * surface and calls it a gradient.
 *
 * WHAT IT DOES. For each configuration it runs every plant's own test file in a child process
 * with the module defaults set, and scrapes that plant's own headline number — the one the plant
 * already prints, so no plant is re-scored by a metric this file invented. Exit status is kept
 * beside it, because a plant that REFUSES is a result and not a gap: this project's strongest
 * claim is that it declines to deploy what it cannot vouch for, and a table that hid refusals
 * would be measuring the wrong thing.
 *
 * Run: node test/pilot/sixplant.mjs   [CONFIGS="4:1.5,4:1.5:r2"]  [PLANTS=tanks,woodberry]
 *      a config is qpIters:horizonTs[:hGain], where hGain 'r2' derives the per-channel plant
 *      gain from each plant's own held-out forecast quality and 'off' is the shipped default.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

// EACH PLANT'S OWN HEADLINE, scraped from the line that plant already prints. The regex is the
// contract: if a plant's report changes shape this file must go blank rather than quietly
// report a stale number, so a miss prints `—` and is visible in the table (rule 25).
const PLANTS = [
  { name: 'tanks',     file: 'tanks.test.mjs',
    re: /recipe\s+[\d.]+ → [\d.]+ cm rms \(([\d.]+)x\)/,  unit: 'x' },
  { name: 'thermal',   file: 'thermal.test.mjs',
    re: /changeover: temperature error [\d.]+ → [\d.]+ K rms.*?\(([\d.]+)x\)/, unit: 'x' },
  { name: 'woodberry', file: 'woodberry.test.mjs',
    re: /the pilot\s+([\d.]+)\s+\(([\d.]+)x BLT\)/, unit: 'IAE' },
  // THE DELIVERY, not the verify ratio: the mill deploys now, so its own headline is the µm
  // rms the machine got. A seed or a default that makes it refuse lands here as the open
  // loop's 15.15 and is visibly worse, which is what a refusal should look like in this table.
  { name: 'rollmill',  file: 'rollmill.test.mjs',
    re: /the pilot\s+([\d.]+) \/ [\d.]+\s+u peak/, unit: 'um' },
  { name: 'emps',      file: 'emps.test.mjs',
    re: /the pilot\s+([\d.]+)\s+([\d.]+)x/, unit: 'mm' },
  { name: 'arm',       file: 'arm.test.mjs',
    re: /rounded: contour [\d.e-]+ → ([\d.e-]+) \(([\d.]+)x\)/, unit: 'rms' },
];

const want = (process.env.PLANTS || PLANTS.map((p) => p.name).join(',')).split(',');
// A THIRD FIELD, OPTIONAL: `4:1.5:r2` also arms the derived per-channel plant gain. It is written
// as part of the configuration rather than as a separate axis because it is not separable from the
// solver knobs — the gain and the iteration count are both regularisers of the same inversion, and
// this project has measured that coupling twice. `off` states the default explicitly where a row
// wants to say so.
const configs = (process.env.CONFIGS || '4:1.5,2:1.2,1:1.2').split(',').map((c) => {
  const [q, h, g, r] = c.split(':');
  const cfg = { qpIters: Number(q), horizonTs: Number(h) };
  if (g && g !== '-') cfg.hGain = g;
  if (r) cfg.probeRises = Number(r);
  return cfg;
});

/** Run one plant's own test with the module defaults set, and scrape its own headline. */
function runPlant(plant, cfg) {
  return new Promise((resolve) => {
    // A WRAPPER RATHER THAN AN ENV READ INSIDE THE LIBRARY. `lib/` may not touch `process`
    // (rule 60, and `test/parse.mjs` rejects it), so the knob is an exported setter and the
    // child imports it before the test.
    const boot = `import('${JSON.stringify(join(ROOT, 'lib/pilot/pilot.js')).slice(1, -1)}')`
      + `.then((m) => { m.setSolverDefaults(${JSON.stringify(cfg)}); `
      + `return import('${JSON.stringify(join(ROOT, 'test/pilot', plant.file)).slice(1, -1)}'); });`;
    const t0 = Date.now();
    const ch = spawn(process.execPath, ['--input-type=module', '-e', boot],
      { cwd: ROOT, env: { ...process.env, SUITE: 'full' } });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.stderr.on('data', (d) => { out += d; });
    ch.on('close', (code) => {
      const m = out.match(plant.re);
      resolve({ score: m ? m[1] : null, ratio: m && m[2] ? m[2] : null, code,
        secs: Math.round((Date.now() - t0) / 1000),
        refused: /REFUSED|refused|deploy":false/.test(out) });
    });
  });
}

const rows = [];
for (const cfg of configs) {
  for (const name of want) {
    const plant = PLANTS.find((p) => p.name === name);
    if (!plant) { console.log(`  (no plant named ${name})`); continue; }
    const r = await runPlant(plant, cfg);
    rows.push({ cfg, plant, ...r });
    console.log(`  ${`${cfg.qpIters}:${cfg.horizonTs}${cfg.hGain ? ':' + cfg.hGain : ''}${cfg.probeRises ? ':p' + cfg.probeRises : ''}`.padStart(7)}  ${name.padEnd(10)} `
      + `${(r.score === null ? '—' : r.score).padStart(10)} ${plant.unit.padEnd(4)} `
      + `${r.ratio ? `${r.ratio}x` : ''.padEnd(6)}`.padEnd(9)
      + `  ${r.code === 0 ? 'pass' : `EXIT ${r.code}`}${r.refused ? '  refused' : ''}  ${r.secs}s`);
  }
}

console.log('\n  the six-plant pass, one row per plant per configuration:');
console.log('  qp:hTs    plant        headline          verdict');
for (const r of rows) {
  console.log(`  ${`${r.cfg.qpIters}:${r.cfg.horizonTs}`.padStart(7)}  ${r.plant.name.padEnd(10)} `
    + `${(r.score === null ? '—' : r.score).padStart(10)} ${r.plant.unit.padEnd(4)}  `
    + `${r.code === 0 ? 'pass' : `EXIT ${r.code}`}`);
}
