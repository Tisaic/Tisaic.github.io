/**
 * @file THE SECOND PLANT'S CONTRACT (plan §50) — full tier.
 *
 * `lib/pilot/distil.js` is one plant's result until another plant carries it. This pins the EMPS
 * measurement so the numbers cannot rot: a real servo axis, real data, no physics in common with
 * the 2R arm, and a negative control this project did not choose — on a two-tone sine the axis has
 * never run, a converged lap table reads 0.53x, worse than doing nothing, and a textbook
 * norm-optimal ILC reads 0.53x there too (`noilcbench.mjs`).
 *
 * IT ASSERTS BOTH HALVES (rule 9). A distillation that helped on the sine while the table also
 * helped would say nothing about memories; the claim only has teeth if the table HARMS the machine
 * on that trajectory and the policy HELPS on the same one, from the same converged correction.
 * And the PRICE is asserted too, because a transfer bought by giving up everything at home is a
 * different product — so the home column is pinned as a real cost rather than left unmentioned.
 *
 * It imports the harness rather than re-deriving the routing: three separate copies of a rig's
 * routing have each shipped a defect in this repository (rule 61).
 */

import { runEmpsDistil } from './distil-emps.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-emps: SKIPPED (full tier only — five harmonic commissions)\n');
  process.exit(0);
}

console.log('\ndistil-emps: the distilled policy on a second plant');
const r = await runEmpsDistil({ log: () => {} });

console.log(`    sine: table ${r.sineTable.toFixed(2)}x   distilled ${r.sinePol.toFixed(2)}x`);
console.log(`    home: table ${r.homeTableX.toFixed(2)}x   distilled ${r.homePolX.toFixed(2)}x`);
console.log(`    fit ${r.rep.rows} rows, ${r.rep.features} features, held-out R² `
  + `${r.rep.heldOutR2.map((v) => v.toFixed(4)).join(' / ')} `
  + `(null ${r.rep.controlR2.map((v) => v.toFixed(4)).join(' / ')})`);

check('the converged TABLE makes the machine worse than doing nothing on a trajectory it has '
  + 'never run — the negative control, and it is not ours',
  r.sineTable < 1, `${r.sineTable.toFixed(3)}x`);
check('…while the policy DISTILLED FROM THAT SAME CORRECTION helps on it substantially',
  r.sinePol > 10, `${r.sinePol.toFixed(2)}x`);
check('…which is the whole claim: what iteration converges to contains a transferable part '
  + 'addressed by the commanded reference rather than by lap phase',
  r.sinePol / r.sineTable > 20, `${(r.sinePol / r.sineTable).toFixed(1)}x apart`);

// THE PRICE, ASSERTED AS A PRICE. The table is enormously better at home and that is expected;
// what must not happen is the policy failing to correct at home at all.
check('the table is far better AT HOME, which is what a memory is for and is the cost of '
  + 'retiring it', r.homeTableX > r.homePolX * 3, `${r.homeTableX.toFixed(1)}x vs ${r.homePolX.toFixed(1)}x`);
check('…and the policy still corrects the machine substantially at home, so the transfer is '
  + 'not bought by giving up the program it was trained on',
  r.homePolX > 10, `${r.homePolX.toFixed(2)}x`);

check('the fit deploys, on a held-out score that beats its own null through the same folds',
  r.rep.deploy && r.rep.heldOutR2.every((v, i) => v > r.rep.controlR2[i]),
  `${JSON.stringify(r.rep.heldOutR2)} vs ${JSON.stringify(r.rep.controlR2)}`);
check('…and the deployed object stays inside a PLC scan on this plant too',
  r.rep.mac < 10000, `${r.rep.mac} MAC/decision`);

console.log(failed ? `\ndistil-emps: ${failed} check(s) FAILED\n` : '\ndistil-emps: all checks passed\n');
process.exit(failed ? 1 : 0);
