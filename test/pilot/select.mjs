/**
 * @file COMMISSION k TIMES AND KEEP THE BEST — and the only honest way to test it.
 *
 * Every plant's headline is one commissioning draw, and the draws vary: 2.18x across twelve seeds
 * on Wood-Berry, 4.18x across eight on the tank. A spread that large is a loss if the draws
 * cannot be told apart and a FACTOR if they can. Step 1 made the deploy gate rank (tank
 * correlation 0.989 with a representative program, against -0.057 without), so the obvious move
 * is to commission k times, score each with the gate, and ship the best.
 *
 * THE OBVIOUS MOVE IS ALSO THE OBVIOUS WAY TO FOOL YOURSELF. Selecting on a number and then
 * validating against that same number measures nothing — the gate's representative regime runs
 * the recipe, and delivery runs the recipe, so a correlation between them is partly the same
 * measurement twice (rules 15, 16). A selector is only worth what it is worth on a program it
 * did not select on.
 *
 * SO THE TEST IS HELD OUT, AND THE ARM IS THE PLANT THAT CAN DO IT. It runs TWO programs — a
 * rounded rectangle and a circle — and the representative regime is built from the rounded one
 * alone. Selecting k draws on the rounded rectangle's gate score and then reading the CIRCLE is a
 * genuine held-out question: does picking the best-vouched commissioning give a better machine on
 * a program the vouching never saw?
 *
 * WHAT WOULD KILL IT: if the selected draw's held-out score is no better than the median draw's,
 * the gate's ranking does not survive being used for selection — which is the classic way a
 * validation signal dies — and the spread has to be shrunk rather than spent. Neither excitation
 * length (3x measured, buys nothing) nor the solver knobs shrink it, so that would be a dead end
 * worth knowing about early.
 *
 * Run: node test/pilot/select.mjs   [K=6] [PLANT=arm]
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

// The selector is the gate's score on the program it was GIVEN; the held-out reading is a
// different program the same commissioning is scored on. Both come from the plant's own test.
const PLANTS = {
  arm: {
    file: 'arm.test.mjs',
    // what the gate said, on the rounded rectangle it was handed
    gate: /representative ([\d.]+)x/,
    // and the two deliveries: the selected program, and the one held out from the selector
    onSel: /rounded: contour [\d.e-]+ → ([\d.e-]+) \(([\d.]+)x\)/,
    onOut: /circle: contour [\d.e-]+ → ([\d.e-]+) \(([\d.]+)x\)/,
    better: 'up',       // the x figures: larger is better
  },
};

const K = +(process.env.K || 6);
const name = process.env.PLANT || 'arm';
const P = PLANTS[name];
if (!P) { console.log(`no plant named ${name}`); process.exit(1); }

function run(off) {
  return new Promise((resolve) => {
    const lib = join(ROOT, 'lib/pilot/pilot.js'), tf = join(ROOT, 'test/pilot', P.file);
    const boot = `import(${JSON.stringify(lib)}).then((m) => { m.setSeedOffset(${off}); `
      + `return import(${JSON.stringify(tf)}); });`;
    const ch = spawn(process.execPath, ['--input-type=module', '-e', boot],
      { cwd: ROOT, env: { ...process.env, SUITE: 'full' } });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.stderr.on('data', (d) => { out += d; });
    ch.on('close', () => {
      const g = out.match(P.gate), a = out.match(P.onSel), b = out.match(P.onOut);
      resolve({ off, gate: g ? +g[1] : null,
        sel: a ? +a[2] : null, out: b ? +b[2] : null,
        refused: /REFUSED|does not deploy/.test(out) });
    });
  });
}

console.log(`\npilot: commission ${K} times and keep the best — validated on a HELD-OUT program`);
console.log('  the gate scores the ROUNDED rectangle; the CIRCLE is never part of the selection.');
const rows = [];
for (let o = 0; o < K; o++) rows.push(await run(o));

console.log('\n   draw    gate    rounded x    circle x   acted');
for (const r of rows) {
  console.log(`  ${String(r.off).padStart(5)}  ${(r.gate === null ? '—' : r.gate.toFixed(2) + 'x').padStart(6)}  `
    + `${(r.sel === null ? '—' : r.sel.toFixed(2) + 'x').padStart(10)}  `
    + `${(r.out === null ? '—' : r.out.toFixed(2) + 'x').padStart(10)}   ${r.refused ? 'no' : 'YES'}`);
}

const ok = rows.filter((r) => r.gate !== null && r.out !== null);
if (ok.length < 3) { console.log('\n  too few complete draws to conclude anything'); process.exit(0); }
const med = (a) => { const b = [...a].sort((p, q) => p - q); const h = b.length >> 1;
  return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2; };
const picked = ok.reduce((best, r) => (r.gate > best.gate ? r : best));
const outs = ok.map((r) => r.out);
// THREE NUMBERS AND THE MIDDLE ONE IS THE BAR. "Best achievable" is not available to a selector
// and quoting it as the target would make any selector look bad; "median draw" is what shipping
// one commissioning gets you, and beating it is the whole claim.
console.log(`\n  SELECTED draw ${picked.off} (gate ${picked.gate.toFixed(2)}x) delivers `
  + `${picked.out.toFixed(2)}x on the HELD-OUT circle`);
console.log(`  median draw delivers ${med(outs).toFixed(2)}x   ·   best draw delivers `
  + `${Math.max(...outs).toFixed(2)}x   ·   worst ${Math.min(...outs).toFixed(2)}x`);
const lift = picked.out / med(outs);
console.log(`  selection is worth ${lift.toFixed(3)}x over shipping one commissioning`
  + `, at ${K}x the commissioning cost`);
// AND THE RANK, because a lift can be one lucky pick. Where the selected draw SITS in the
// held-out ordering is the thing that generalises.
const rank = [...outs].sort((a, b) => b - a).indexOf(picked.out) + 1;
console.log(`  the selected draw ranks ${rank} of ${ok.length} on the held-out program`
  + ` (1 = the gate picked the genuinely best commissioning)`);
