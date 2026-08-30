/**
 * @file A MEMORY MAY ONLY BE APPLIED WHERE IT WAS FORMED.
 *
 * The lap-periodic rung is a table indexed by position in a lap. `bench.test.mjs` measured
 * what that costs off its own program: across five programs and four feedrates from ONE
 * commission, the table is a net negative — the model layers alone beat the full ladder in 14
 * of 20 cells, geometric mean 4.53x against 3.11x — and its worst cell is a change of SHAPE
 * at the COMMISSIONING FEEDRATE, where the model alone reaches 17.19x and the full ladder
 * 6.10x.
 *
 * So the rung is now withheld off its program. This pins BOTH halves, because a guard that
 * only ever fires is as broken as one that never does (rule 9):
 *
 *   - on the program it was formed on it is INERT — the correction is unchanged, bit for bit,
 *     which is the only thing that can show the guard did not cost the home result (rule 21);
 *   - on any other program the table is withheld, the other rungs still act, and the machine
 *     SAYS it withheld rather than silently applying nothing.
 */
import { AutoStack } from '../../lib/pilot/autostack.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};

console.log('\npilot: the lap-periodic rung is withheld off its own program');

const LAP = 64;
const auto = new AutoStack({
  channels: [{ lo: -1, hi: 1, vMax: 1, aMax: 1, jMax: 1 }],
  uMax: 1, periodic: LAP,
});
// ARM THE RUNG BY HAND with a table that is easy to recognise, and stamp it with a program.
// Commissioning it for real is `bench.test.mjs`'s job and takes half an hour; what is under
// test here is the guard, which is a comparison.
auto.deployed.hff = true;
auto.hff = { at: (k) => [0.25] };
const HOME = 12345, OTHER = 54321;
auto._hffProgram = HOME;
auto.beginRun();

const at = (program) => auto.act({ v: [0], a: [0], k: 3, look: () => [0], q: [0], program });

const home = at(HOME);
const away = at(OTHER);
const unstamped = (() => { const a2 = new AutoStack({
  channels: [{ lo: -1, hi: 1, vMax: 1, aMax: 1, jMax: 1 }], uMax: 1, periodic: LAP });
  a2.deployed.hff = true; a2.hff = { at: () => [0.25] }; a2.beginRun();
  return a2.act({ v: [0], a: [0], k: 3, look: () => [0], q: [0], program: OTHER }); })();

console.log(`  home ${home[0]}   away ${home[0] === 0 ? '' : ''}${away[0]}   `
  + `never-stamped ${unstamped[0]}   withheld ${JSON.stringify(auto.starved())}`);

check('on its own program the table is applied, exactly as before the guard existed',
  home[0] === 0.25, `${home[0]}`);
check('on ANOTHER program it is withheld', away[0] === 0, `${away[0]}`);
// THE GUARD MUST NOT FIRE ON A HOST THAT NEVER ANSWERS THE QUESTION. `_hffProgram` is null
// until the rung commissions through a host that supplies a signature; an unstamped rung
// keeps the old behaviour rather than silently disarming itself.
check('…and a rung that was never stamped is NOT withheld — the guard stays inert',
  unstamped[0] === 0.25, `${unstamped[0]}`);
// WITHHELD AND STARVED MUST NOT READ THE SAME. One is the guard working; the other is a
// wiring fault, and confusing them sends somebody hunting a defect that is not there.
const st = auto.starved();
check('it reports WITHHELD, distinctly from starved', !!st && st.hffOffProgram === 1 && !st.hff,
  JSON.stringify(st));

console.log(failed ? `\noffprogram: ${failed} check(s) FAILED\n` : '\noffprogram: all checks passed\n');
process.exit(failed ? 1 : 0);
