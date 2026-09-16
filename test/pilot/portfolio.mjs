/**
 * @file THE BLOCK IS A PORTFOLIO, AND THE CLAIM IS THAT IT IS NEVER WORSE THAN ITS OWN BEST PART
 * (plan §97).
 *
 * NOT A TEST in the sense of re-scoring anything: it READS the row each plant's own harness
 * emitted where it measured it, exactly as `objtable.mjs` and `commtime.mjs` do, so no plant is
 * re-run and none is scored by a metric this file invented (rule 30).
 *
 * ---------------------------------------------------------------- WHY THIS IS THE RIGHT CLAIM
 *
 * §96 measured the incumbent on all ten plants and the table has three regions: five where
 * `classic.js` finds NO headroom and the learned object is the whole result (barrel 7.00x, arm
 * 6.63x, column 3.96x, tank 3.27x, mill 2.62x — three of them refusing at literally 0.0% of the
 * error energy); two where they COMPOSE (cart-pole 4.66x x 2.56x, real tanks 4.28x x 2.03x); and
 * four where the incumbent wins outright (EMPS 424.8x, exchanger 89.77x, tuned cart-pole 9.24x,
 * real arm 1.93x).
 *
 * No single one of those controllers wins everywhere and there is no reason one should: a
 * `[a, v, sign v, 1]` basis is exactly right for an axis whose whole error is velocity lag and
 * cannot express a tank at sqrt(h) or a barrel radiating as T^4. **What CAN win everywhere is the
 * thing that tries both on the machine and keeps whichever measured better** — which is what
 * `AutoStack` has always been, scoring every rung and calling `h.revert()` on the ones that lose.
 *
 * So the product claim is not "our controller beats a PID+FF". It is:
 *
 *     THE BLOCK IS NEVER WORSE THAN DOING NOTHING, AND NEVER WORSE THAN ITS OWN BEST PART.
 *
 * Both halves are asserted here, because a portfolio that merely *contains* a winner is worth
 * nothing if its selection can pick the loser (rule 9 — assert both halves).
 *
 * ---------------------------------------------------------------- WHAT IT CANNOT SEE, STATED
 *
 * `xClassic` for a REFUSED rung is exactly 1 by definition rather than by measurement — what was
 * measured is that the rung found no headroom, which the plants report with a stated reason. And a
 * plant whose harness never OFFERED the incumbent reads `not offered` and is excluded from the
 * selection check rather than counted as a pass (rule 25); §97 made the offer the default on the
 * two flagship harnesses that were opting out, so that exclusion should now be empty.
 *
 * Run: OBJTABLE_OUT=<dir> node test/pilot/portfolio.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.env.OBJTABLE_OUT;
if (!DIR) {
  console.log('\nportfolio: set OBJTABLE_OUT=<dir> to the directory the harnesses emitted into\n');
  process.exit(0);
}
const f = join(DIR, 'rows.jsonl');
if (!existsSync(f)) {
  console.log(`\nportfolio: no rows at ${f} — run the plant harnesses with OBJTABLE_OUT set first\n`);
  process.exit(0);
}

// The LAST emission per (script, label) wins: a harness re-run supersedes its own earlier row, and
// keying by the script rather than by a passed name is what keeps a different claim's rows out
// (rule 19 — `plants.test.mjs` drives the same plants for the TEACHER and does not belong here).
const seen = new Map();
const collided = [];
for (const line of readFileSync(f, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let d; try { d = JSON.parse(line); } catch { continue; }
  if (!d || !d.file || !('xClassic' in d)) continue;
  if (!d.name) continue;                       // the bare duplicate each harness also writes
  const key = `${d.file}|${d.name}`;
  // A COLLAPSE MUST BE VISIBLE. One harness run under two configurations emits two rows under the
  // same label — the cart-pole's shipped and tuned loops are exactly that — and silently keeping
  // the last one loses a plant from the table while the count still reads right. It is kept as
  // the last-wins row AND reported, because a table that quietly drops a row is the fault this
  // file's own §95 was built to stop (rule 25).
  const prev = seen.get(key);
  if (prev && Math.abs((prev.gain || 0) - (d.gain || 0)) > 1e-6) {
    collided.push(`${d.name.split(' — ')[0]}: two runs share this label `
      + `(${(prev.gain || 0).toFixed(3)}x and ${(d.gain || 0).toFixed(3)}x) — only the last is shown`);
  }
  seen.set(key, d);
}
const rows = [...seen.values()];
if (!rows.length) { console.log('\nportfolio: no usable rows\n'); process.exit(0); }

console.log(`\nportfolio: the block CHOOSES, and the claim is that it never picks the loser (plan §97)\n`);
console.log(`  ${'plant'.padEnd(34)}${'incumbent'.padStart(10)}${'learned'.padStart(9)}`
  + `${'SHIPPED'.padStart(11)}${'MAC'.padStart(7)}${'kB'.padStart(7)}   what it chose`);

let fails = 0, asked = 0, notOffered = 0;
const notes = [];
for (const d of rows.sort((a, b) => (b.gain || 0) - (a.gain || 0))) {
  const lbl = String(d.name).split(' — ')[0].slice(0, 33);
  const xc = d.xClassic, xa = d.xAdded, tot = d.gain;
  const dep = d.deployed || {};
  const chose = Object.keys(dep).filter((k) => dep[k]).join('+') || 'nothing';
  if (xc === null) {
    notOffered++;
    notes.push(`${lbl}: the incumbent was NOT OFFERED, so this row cannot check the selection`);
    console.log(`  ${lbl.padEnd(34)}${'not offered'.padStart(10)}`
      + `${(xa === null ? '—' : xa.toFixed(2) + 'x').padStart(9)}`
      + `${tot.toFixed(2).padStart(10)}x${String(d.mac ?? '—').padStart(7)}`
      + `${String(d.kb ?? '—').padStart(7)}   ${chose}`);
    continue;
  }
  asked++;
  // THE TWO HALVES. `best` is the strongest single part the block had available; `tot` is what it
  // shipped. A portfolio is worth something only if it never lands below either.
  const bestPart = Math.max(xc, xa === null ? 1 : xa, 1);
  // THE TOLERANCE IS THE EMITTED PRECISION AND NOT A MARGIN. `xClassic` and `xAdded` are rounded
  // to four decimals where `gain` is full precision, so an exact selection reads 9.2445 against a
  // shipped 9.24449813 and a literal comparison calls it a failure — which the first version did,
  // on three plants, and would have reported the block picking the loser when it had picked
  // exactly right (rule 17: the instrument before the model). A REAL selection failure is a
  // factor, not one part in ten thousand.
  const TOL = 1e-3;
  const okNothing = tot >= 1 - 1e-9;
  const okBest = tot >= bestPart * (1 - TOL);
  if (!okNothing) { fails++; notes.push(`${lbl}: SHIPPED ${tot.toFixed(3)}x — WORSE THAN DOING NOTHING`); }
  if (!okBest) { fails++; notes.push(`${lbl}: SHIPPED ${tot.toFixed(3)}x below its own best part ${bestPart.toFixed(3)}x`); }
  console.log(`  ${lbl.padEnd(34)}${(xc.toFixed(2) + 'x').padStart(10)}`
    + `${(xa === null ? '—' : xa.toFixed(2) + 'x').padStart(9)}`
    + `${tot.toFixed(2).padStart(10)}x${String(d.mac ?? '—').padStart(7)}`
    + `${String(d.kb ?? '—').padStart(7)}   ${chose}`);
}

// THE PLC BUDGET IS UNCONDITIONAL AND THE PORTFOLIO IS WHAT A MACHINE RECEIVES, so the worst
// plant's peak is the number that decides it — an average would hide exactly the scan that fails.
const macs = rows.map((d) => d.peak ?? d.mac).filter((v) => Number.isFinite(v));
const kbs = rows.map((d) => d.kb).filter((v) => Number.isFinite(v));
const worstMac = macs.length ? Math.max(...macs) : null;
const worstKb = kbs.length ? Math.max(...kbs) : null;

console.log(`\n  of ${rows.length} rows: ${asked} can check the selection, ${notOffered} cannot `
  + `(the incumbent was never offered there)`);
if (worstMac !== null) {
  console.log(`  the WORST plant's deployed peak: ${worstMac} MAC/decision `
    + `(${(worstMac / 100).toFixed(1)}% of a 10,000-MAC budget) in ${worstKb} kB`);
}
for (const n of collided) console.log(`    ! ${n}`);
for (const n of notes) console.log(`    · ${n}`);
console.log(fails === 0
  ? `\n  ✓ the block is never worse than doing nothing, and never worse than its own best part\n`
  : `\n  ✗ ${fails} FAILURE(S) — the selection picked below what it had available\n`);
process.exit(fails === 0 ? 0 : 1);
