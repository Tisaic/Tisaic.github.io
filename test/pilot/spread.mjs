/**
 * @file EVERY PLANT'S NUMBER IS A DRAW. THIS IS THE DISTRIBUTION IT IS DRAWN FROM.
 *
 * The six-plant line in CLAUDE.md quotes one number per plant, and every one of them came from a
 * single commissioning seed. On the ONE plant where that has been checked — the quadruple tank,
 * `tankspread.mjs` — the number is a lucky draw: at the old defaults 4 of 8 seeds deployed and
 * ALL FOUR made the plant worse, deployed median 0.675x, against the 1.32x on record. There is
 * no reason to think the tank is special and every reason to check.
 *
 * IT RUNS EACH PLANT'S OWN TEST, NOT A COPY OF ITS RIG. `tankspread.mjs` rebuilt the tank's
 * commissioning loop in order to reach inside it, and immediately paid for it: a valve split
 * passed as `{g1,g2}` where the rig indexes `g[0]` sent every level to NaN, and the failure
 * surfaced three layers away. Two copies of a plant drift apart — this project has paid for that
 * already — so this file changes ONE module-level seed offset and re-runs the plant's own file,
 * scraping the plant's own headline. Nothing here re-scores anything.
 *
 * WHAT IT CANNOT SEE, stated because a spread that missed it would read as stability: a plant
 * whose test REFUSES on every seed reports its refusal score, and a refusal is 1.00x by
 * construction. A flat column here means either a robust plant or a plant that never deploys,
 * and the exit status is printed beside it so those cannot be confused (rule 25).
 *
 * Run: node test/pilot/spread.mjs   [SEEDS=6] [PLANTS=emps,woodberry]
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const PLANTS = [
  { name: 'tanks',     file: 'tanks.test.mjs',
    re: /recipe\s+[\d.]+ → [\d.]+ cm rms \(([\d.]+)x\)/,  unit: 'x',   better: 'up' },
  { name: 'thermal',   file: 'thermal.test.mjs',
    re: /changeover: temperature error [\d.]+ → [\d.]+ K rms.*?\(([\d.]+)x\)/, unit: 'x', better: 'up' },
  { name: 'woodberry', file: 'woodberry.test.mjs',
    re: /the pilot\s+([\d.]+)\s+\(([\d.]+)x BLT\)/, unit: 'IAE', better: 'down' },
  { name: 'rollmill',  file: 'rollmill.test.mjs',
    re: /verify ([\d.]+)x — /, unit: 'ver', better: 'up' },
  { name: 'emps',      file: 'emps.test.mjs',
    re: /the pilot\s+([\d.]+)\s+([\d.]+)x/, unit: 'mm',  better: 'down' },
  { name: 'arm',       file: 'arm.test.mjs',
    re: /rounded: contour [\d.e-]+ → ([\d.e-]+) \(([\d.]+)x\)/, unit: 'rms', better: 'down' },
];

const SEEDS = +(process.env.SEEDS || 6);
const want = (process.env.PLANTS || PLANTS.map((p) => p.name).join(',')).split(',');

function run(plant, off) {
  return new Promise((resolve) => {
    const lib = join(ROOT, 'lib/pilot/pilot.js'), tf = join(ROOT, 'test/pilot', plant.file);
    // EVERY KNOB THIS FILE SWEEPS IS A MODULE-LEVEL SETTER, applied in the child before the
    // plant's own test is imported. That is what keeps this file from owning a copy of any rig.
    const knobs = [`m.setSeedOffset(${off});`]
      .concat(process.env.EXSCALE ? [`m.setExciteScale(${+process.env.EXSCALE});`] : [])
      .concat(process.env.RDIV ? [`m.setVerifyRateDiv(${+process.env.RDIV});`] : [])
      .join(' ');
    const boot = `import(${JSON.stringify(lib)}).then((m) => { ${knobs} `
      + `return import(${JSON.stringify(tf)}); });`;
    const ch = spawn(process.execPath, ['--input-type=module', '-e', boot],
      { cwd: ROOT, env: { ...process.env, SUITE: 'full' } });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.stderr.on('data', (d) => { out += d; });
    ch.on('close', (code) => {
      const m = out.match(plant.re);
      resolve({ v: m ? +m[1] : null, ratio: m && m[2] ? +m[2] : null, code,
        // REFUSAL IS DETECTED FROM THE PILOT'S OWN WORDING, and this regex was wrong: it
        // matched REFUSED and "deploy":false but not the sentence the pilot actually prints —
        // "this pilot does not deploy a controller the machine has not vouched for". Wood-Berry
        // reported 0 of 12 refused while at least three had refused, and their scraped score was
        // the plant's NO-PILOT baseline. A spread table that cannot tell "the controller scored
        // this" from "the controller declined and you are reading the baseline" is measuring two
        // different quantities into one column (rule 25).
        refused: /REFUSED|does not deploy|refuses|"deploy":false/.test(out),
        // AND THE CROSS-CHECK, because a wording can change again: a refused pilot applies
        // nothing, so its peak correction is exactly zero. Two independent readings of one fact
        // (rule 6) — if they ever disagree, the table says so rather than picking one.
        uZero: /u peak 0\.000/.test(out),
        // THE GATE'S OWN TWO REGIME SCORES, so "can anything rank these draws?" becomes a
        // computation instead of an argument. The pilot prints them in its refusal and its
        // verify line alike: (scribble Ax, program Bx). If some rule on this pair separates the
        // deployments that HELP from the ones that HARM, the gate can be fixed; if none does,
        // the regimes themselves are the wrong measurement and no threshold will save them.
        scrib: (out.match(/scribble ([\d.]+)x/) || [])[1],
        prog: (out.match(/program ([\d.]+)x/) || [])[1] });
    });
  });
}

const med = (a) => { const b = [...a].sort((p, q) => p - q); const h = b.length >> 1;
  return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2; };

console.log(`\npilot: every plant across ${SEEDS} commissioning seeds — the number each one is `
  + 'a draw from');
console.log('  (a flat row is EITHER a robust plant OR one that never deploys; the refusal count '
  + 'is printed so those cannot be confused)');
console.log('\n  plant        median      min       max   spread   refused   red');
for (const name of want) {
  const plant = PLANTS.find((p) => p.name === name);
  if (!plant) { console.log(`  (no plant named ${name})`); continue; }
  const vals = [], reds = [], deployedVals = [], refusedVals = [];
  let refused = 0, disagree = 0;
  const gates = [];
  for (let o = 0; o < SEEDS; o++) {
    const r = await run(plant, o);
    if (r.v !== null) vals.push(r.v);
    if (r.refused) refused++;
    if (r.refused !== r.uZero && r.uZero !== undefined) disagree++;
    (r.refused ? refusedVals : deployedVals).push(r.v);
    gates.push({ off: o, v: r.v, refused: r.refused, scrib: r.scrib, prog: r.prog });
    if (r.code !== 0) reds.push(o);
  }
  if (!vals.length) { console.log(`  ${name.padEnd(11)}  — (no headline scraped in ${SEEDS} runs)`); continue; }
  const lo = Math.min(...vals), hi = Math.max(...vals);
  // THE SPREAD IS max/min ON THE QUANTITY ITSELF, whichever direction is better: a plant scored
  // in residual and one scored in ratio both answer "how much does this move between draws".
  const spread = lo > 0 ? hi / lo : NaN;
  // THE DRAWS THEMSELVES, NOT ONLY THE SUMMARY. Two 12-seed runs of Wood-Berry at different
  // excitation lengths reported an IDENTICAL minimum to four figures, which is either a
  // coincidence or an instrument reporting the same run twice — and a table of median/min/max
  // cannot tell those apart. A summary nobody can audit is how a stale number survives (rule 28).
  console.log(`    draws: ${vals.map((v) => v.toPrecision(4)).join(' ')}`);
  // SPLIT, BECAUSE A REFUSAL IS THE BASELINE AND NOT A SCORE. Pooling them answers "what does
  // this plant read", which is not the question; the question is what the controller does when
  // it acts, and how often it declines to.
  const dv = deployedVals.filter((v) => v !== null), rv = refusedVals.filter((v) => v !== null);
  if (dv.length) console.log(`    deployed (${dv.length}): ${dv.map((v) => v.toPrecision(4)).join(' ')}`
    + `   median ${med(dv).toPrecision(4)}`);
  if (rv.length) console.log(`    refused  (${rv.length}): ${rv.map((v) => v.toPrecision(4)).join(' ')}`
    + '   — these are the plant WITHOUT the pilot, not a controller result');
  if (disagree) console.log(`    !! ${disagree} draw(s) where the refusal wording and a zero `
    + 'correction peak disagree — one of the two readings is wrong');
  // THE GATE'S PAIR BESIDE THE OUTCOME, one row per draw. Ordered by what was DELIVERED, so a
  // gate that ranks shows up as its columns moving monotonically down the table and one that
  // does not shows up as noise — which is the whole question, read straight off the page.
  if (process.env.GATES) {
    const better = plant.better === 'down' ? 1 : -1;
    const sorted = gates.filter((g) => g.v !== null).sort((a, b) => better * (a.v - b.v));
    console.log('    draw   delivered   scribble   program   acted');
    for (const g of sorted) {
      console.log(`    ${String(g.off).padStart(4)}  ${g.v.toPrecision(4).padStart(10)}   `
        + `${(g.scrib || '—').padStart(8)}  ${(g.prog || '—').padStart(8)}   ${g.refused ? 'no' : 'YES'}`);
    }
  }
  console.log(`  ${name.padEnd(11)} ${med(vals).toPrecision(4).padStart(8)} `
    + `${lo.toPrecision(4).padStart(8)} ${hi.toPrecision(4).padStart(9)} `
    + `${spread.toFixed(2).padStart(6)}x  ${String(refused).padStart(5)}/${SEEDS}  `
    + `${reds.length ? reds.join(',') : '-'}`);
}
