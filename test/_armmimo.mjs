/**
 * @file DOES THE MIMO SOLVE PAY ON THE PLANT THAT WINS? The falsifier this option was built
 *       against is on the ARM — CLAUDE.md: "On the 2R arm the linear part of the cross response
 *       reaches 4.3x its own DC and is pose-dependent" — and `mimo` has only ever been measured
 *       on plants that REFUSE. Today it took Wood-Berry from 82.10 to 52.52 IAE and made the
 *       barrel worse on every zone; neither plant deploys, so neither says whether inverting the
 *       off-diagonal is worth anything to a machine that is actually running.
 *
 * ONE VARIABLE, THROUGH THE SHARED RIG. `commissionArm`'s `extra` is spread into the Pilot
 * constructor, so nothing here restates the arm's routing, box, limits or clock — a copy of that
 * constructor with one line different is indistinguishable from a copy with one line wrong, which
 * is what the rig exists to prevent (rule 61).
 *
 * THE BENCH CELL IS THE OWNER'S STANDING ONE: softest arm (K 0.25 / E 0.03) on the SHARP-CORNER
 * program, because that is the cell that cannot flatter — compliance at its largest and the corner
 * regime the excitation covers worst.
 *
 * COST IS PART OF THE ANSWER, NOT A FOOTNOTE. `boxQPm` forms one residual per OUTPUT from every
 * CHANNEL, so both the free response and the per-iteration work scale as nc^2 against nc — a
 * factor of 2 here. The owner's standing rule is that new machinery states its MAC/cycle slice or
 * it does not ship, so the table prints it beside the score.
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';

const PROGS = [['sharp', 0.004], ['circle', 0.004], ['rounded', 0.004]];

async function run(mimo) {
  const t0 = Date.now();
  const pilot = await commissionArm({ seed: 1, uCap: 0.6,
    train: { shape: 'rounded', feed: 0.004 },
    ...(mimo ? { extra: { mimo: true } } : {}) });
  const cost = pilot.cost();
  const out = { mimo, deploy: pilot.verdict.deploy, why: pilot.verdict.why,
    verify: pilot.report.verify ? pilot.report.verify.ratio : null,
    mac: cost.peakMacPerCycle, blocks: cost.channels, secs: ((Date.now() - t0) / 1000).toFixed(0),
    scores: {} };
  for (const [shape, feed] of PROGS) {
    const off = await deployOn(pilot, shape, false, feed);
    const on = await deployOn(pilot, shape, pilot.verdict.deploy, feed);
    // THE WHOLE DEVIATION, not the contour component: `totalRms` is contour AND lag, which is
    // what this tab scores and what the pilot is corrected for (rule 6 — a rung must not buy
    // one with the other unseen).
    out.scores[shape] = { off: off.r.totalRms, on: on.r.totalRms,
      x: off.r.totalRms / on.r.totalRms, uPk: on.uPk };
  }
  return out;
}

const rows = [];
for (const m of [false, true]) rows.push(await run(m));
console.log('\nthe MIMO solve on the arm — softest cell, one commissioning each, same seed\n');
console.log('  mimo   deploy  verify    MAC/cycle   ' + PROGS.map(([s]) => s.padStart(9)).join(''));
for (const r of rows) {
  console.log(`  ${String(r.mimo).padEnd(6)} ${String(r.deploy).padEnd(7)} `
    + `${r.verify === null ? '   —  ' : r.verify.toFixed(2) + 'x'}  ${String(r.mac).padStart(10)}   `
    + PROGS.map(([s]) => (r.scores[s].x.toFixed(2) + 'x').padStart(9)).join(''));
}
const a = rows[0], b = rows[1];
console.log('\n  per program, off -> on (total rms), and the ratio between the two configurations:');
for (const [s] of PROGS) {
  console.log(`    ${s.padEnd(9)} siso ${a.scores[s].on.toExponential(4)} (${a.scores[s].x.toFixed(2)}x)`
    + `   mimo ${b.scores[s].on.toExponential(4)} (${b.scores[s].x.toFixed(2)}x)`
    + `   -> ${(a.scores[s].on / b.scores[s].on).toFixed(3)}x`);
}
console.log(`\n  arithmetic: ${a.mac.toLocaleString()} -> ${b.mac.toLocaleString()} MAC/cycle `
  + `(${(b.mac / a.mac).toFixed(2)}x), commissioning ${a.secs}s -> ${b.secs}s`);
console.log(`  verdicts: siso ${a.why}\n            mimo ${b.why}\n`);
