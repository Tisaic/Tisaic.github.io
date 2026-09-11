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
 * AND ITS FIRST VERSION HAD THE VERY FAULT IT WAS BUILT TO CLOSE (plan §54.3). It ran six PLANT
 * tests and scraped six headlines — and the regression that made it necessary, and that was then
 * made the default and REVERTED, went red in `autostack.test.mjs` and `stack.test.mjs`, NEITHER OF
 * WHICH IS A PLANT TEST. CLAUDE.md recorded the diagnosis at the time — "the pass measured six
 * plants' HEADLINES while the contracts sat one level down, which is the same fault it was built
 * to close" — and then nothing changed, so a second default move would have shipped exactly the
 * same way. The CONTRACTS block below is that fix: the cross-cutting tests run under every
 * configuration too, and their exit status is reported beside the headlines. A configuration that
 * turns one red is REPORTED AS DISQUALIFIED however good its headline table looks, because that is
 * precisely the trade the revert had to be made by hand.
 *
 * WHAT IT COSTS, STATED (rule 2). `autostack.test.mjs` is ~19 min and `stack.test.mjs` ~1.5 min per
 * configuration, so contracts roughly triple a three-config pass. That is the price of the check
 * whose absence cost a shipped regression, and `CONTRACTS=` narrows or `CONTRACTS=none` skips it —
 * a skip prints as a stated skip rather than an empty column, because "not measured" and "passed"
 * are different states (rule 25).
 *
 * Run: node test/pilot/sixplant.mjs   [CONFIGS="4:1.5,4:1.5:r2"]  [PLANTS=tanks,woodberry]
 *      [CONTRACTS=stack,autostack|none]
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

// THE CONTRACTS, WHICH ARE NOT PLANTS. These pin cross-cutting behaviour — the ladder's shipped
// prefix, the cascade's admitted depth, the deployed artefact's bit-identity — and they are where
// the reverted regression actually went red. They have no headline to scrape: their result IS
// their exit status, which is the whole point. `stack` first because it is 13x cheaper and caught
// the same regression, so a config that fails it never pays for `autostack`.
const CONTRACTS = [
  { name: 'stack',     file: 'stack.test.mjs' },
  { name: 'autostack', file: 'autostack.test.mjs' },
];
const wantC = process.env.CONTRACTS === 'none' ? []
  : (process.env.CONTRACTS || CONTRACTS.map((c) => c.name).join(',')).split(',').filter(Boolean);

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
  // A FIFTH FIELD: `2:1.2:-:-:gain` arms the explicit gain, which replaces the deployed QP with
  // the fixed row it is equal to while its box is inactive. It belongs in the configuration
  // rather than beside it for the same reason the plant gain does — it is not separable from
  // `qpIters`, since the gain IS whatever that iteration count produced.
  const g2 = c.split(':')[4];
  if (g2 === 'gain') cfg.explicitGain = true;
  return cfg;
});

/** Run one plant's own test with the module defaults set, and scrape its own headline. */
function runPlant(plant, cfg) {
  return new Promise((resolve) => {
    // A WRAPPER RATHER THAN AN ENV READ INSIDE THE LIBRARY. `lib/` may not touch `process`
    // (rule 60, and `test/parse.mjs` rejects it), so the knob is an exported setter and the
    // child imports it before the test.
    // AND THE CHILD READS BACK WHAT IT WAS SET TO, which is rule 61's own remedy and was missing
    // at exactly the place a regression shipped from. `setSolverDefaults` silently IGNORES a knob
    // it does not recognise and clamps the ones it does, so a config this table prints is not
    // necessarily the config the plant commissioned with — the two literals happening to agree is
    // construction in name only. The child prints the ACCEPTED defaults and the parent compares;
    // a mismatch is reported per row rather than left for a later session to discover.
    const boot = `import('${JSON.stringify(join(ROOT, 'lib/pilot/pilot.js')).slice(1, -1)}')`
      + `.then((m) => { m.setSolverDefaults(${JSON.stringify(cfg)}); `
      + `console.log('SIXPLANT_ACCEPTED ' + JSON.stringify(m.getSolverDefaults())); `
      + `return import('${JSON.stringify(join(ROOT, 'test/pilot', plant.file)).slice(1, -1)}'); });`;
    const t0 = Date.now();
    const ch = spawn(process.execPath, ['--input-type=module', '-e', boot],
      { cwd: ROOT, env: { ...process.env, SUITE: 'full' } });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.stderr.on('data', (d) => { out += d; });
    ch.on('close', (code) => {
      // A CONTRACT HAS NO HEADLINE — its result IS its exit status, so `re` is optional and a
      // missing one is not a scrape miss. Distinguishing the two matters: `—` under a plant means
      // the report changed shape and the number is unknown; under a contract it means there was
      // never a number to read (rule 25).
      const m = plant.re ? out.match(plant.re) : null;
      // What the child ACTUALLY commissioned with. Compared only on the keys this row asked for:
      // the rest are the module's own defaults and are not this table's business.
      const am = out.match(/SIXPLANT_ACCEPTED (.*)$/m);
      let drift = null;
      if (!am) drift = 'the child never reported its accepted defaults';
      else {
        const acc = JSON.parse(am[1]);
        const bad = Object.keys(cfg).filter((k) => String(acc[k]) !== String(cfg[k]));
        if (bad.length) drift = bad.map((k) => `${k} asked ${cfg[k]} got ${acc[k]}`).join('; ');
      }
      resolve({ drift, score: m ? m[1] : null, ratio: m && m[2] ? m[2] : null, code,
        secs: Math.round((Date.now() - t0) / 1000),
        // The failing check NAMES itself, so a red contract says WHICH assertion moved rather
        // than only that one did — otherwise the table sends you to a 19-minute rerun to find out.
        failed: (out.match(/^\s*✗ .*$/gm) || []).map((l) => l.trim().slice(2)).slice(0, 3),
        refused: /REFUSED|refused|deploy":false/.test(out) });
    });
  });
}

const rows = [];
const cRows = [];
for (const cfg of configs) {
  for (const name of want) {
    const plant = PLANTS.find((p) => p.name === name);
    if (!plant) { console.log(`  (no plant named ${name})`); continue; }
    const r = await runPlant(plant, cfg);
    rows.push({ cfg, plant, ...r });
    console.log(`  ${`${cfg.qpIters}:${cfg.horizonTs}${cfg.hGain ? ':' + cfg.hGain : ''}${cfg.probeRises ? ':p' + cfg.probeRises : ''}`.padStart(7)}  ${name.padEnd(10)} `
      + `${(r.score === null ? '—' : r.score).padStart(10)} ${plant.unit.padEnd(4)} `
      + `${r.ratio ? `${r.ratio}x` : ''.padEnd(6)}`.padEnd(9)
      + `  ${r.code === 0 ? 'pass' : `EXIT ${r.code}`}${r.refused ? '  refused' : ''}  ${r.secs}s`
      + (r.drift ? `\n${' '.repeat(22)}CONFIG DRIFT — ${r.drift}` : ''));
  }
  // THE CONTRACTS, under the same configuration. Cheapest first, and a red one SHORT-CIRCUITS the
  // rest of this configuration's contracts — the config is already disqualified and there is no
  // information in paying 19 more minutes to disqualify it again (rule 2).
  if (!wantC.length) {
    console.log(`  ${''.padStart(7)}  contracts   SKIPPED — CONTRACTS=none; this configuration is UNVERIFIED, not verified`);
  }
  for (const name of wantC) {
    const c = CONTRACTS.find((x) => x.name === name);
    if (!c) { console.log(`  (no contract named ${name})`); continue; }
    const r = await runPlant(c, cfg);
    cRows.push({ cfg, contract: c, ...r });
    console.log(`  ${`${cfg.qpIters}:${cfg.horizonTs}`.padStart(7)}  ${('~' + name).padEnd(10)} `
      + `${''.padStart(15)}${r.code === 0 ? 'CONTRACT pass' : `CONTRACT RED`}  ${r.secs}s`
      + (r.failed && r.failed.length ? `\n${' '.repeat(22)}${r.failed.join(`\n${' '.repeat(22)}`)}` : ''));
    if (r.code !== 0) { console.log(`  ${''.padStart(7)}  — remaining contracts skipped: this configuration is already disqualified`); break; }
  }
}

console.log('\n  the six-plant pass, one row per plant per configuration:');
console.log('  qp:hTs    plant        headline          verdict');
for (const r of rows) {
  console.log(`  ${`${r.cfg.qpIters}:${r.cfg.horizonTs}`.padStart(7)}  ${r.plant.name.padEnd(10)} `
    + `${(r.score === null ? '—' : r.score).padStart(10)} ${r.plant.unit.padEnd(4)}  `
    + `${r.code === 0 ? 'pass' : `EXIT ${r.code}`}`);
}

// THE VERDICT PER CONFIGURATION, AND IT LEADS WITH THE CONTRACTS (rule 27). A headline table is
// what made the reverted regression look like a win; the contract column is what said it was not.
// So a configuration is DISQUALIFIED by a red contract regardless of how the six headlines read,
// and this block says so in that order rather than leaving the reader to cross-reference.
console.log('\n  per configuration — CONTRACTS FIRST, because a headline table is what shipped the regression:');
for (const cfg of configs) {
  const key = `${cfg.qpIters}:${cfg.horizonTs}`;
  const cs = cRows.filter((r) => r.cfg === cfg);
  const red = cs.filter((r) => r.code !== 0);
  const ps = rows.filter((r) => r.cfg === cfg);
  const scraped = ps.filter((r) => r.score !== null).length;
  const verdict = !wantC.length ? 'UNVERIFIED — contracts were skipped, so this configuration is not a candidate'
    : red.length ? `DISQUALIFIED — ${red.length} contract(s) RED: ${red.map((r) => r.contract.name).join(', ')}`
    : `contracts green (${cs.length}) — eligible; now read the headlines`;
  console.log(`  ${key.padStart(7)}  ${verdict}`);
  console.log(`  ${''.padStart(7)}  ${scraped}/${ps.length} plant headlines scraped, ${ps.filter((r) => r.refused).length} refused`);
  for (const r of red) for (const f of r.failed || []) console.log(`  ${''.padStart(7)}    ✗ ${f}`);
}
