/**
 * @file THE SECOND PLANT'S CONTRACT (plan §50) — full tier.
 *
 * `lib/pilot/distil.js` is one plant's result until another plant carries it. This pins the EMPS
 * measurement so the numbers cannot rot: a servo axis identified from a real record, no physics in common with
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

import { runEmpsDistil, rates, tone } from './distil-emps.mjs';
import { P, PR, makeMachine } from './emps-rig.mjs';
import { AutoStack } from '../../lib/pilot/autostack.js';

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

// ---- THE ONE PRESS ON A REAL PLANT, AGAINST THE MEMORY IT REPLACES.
// The block above proves the distillation works on this axis; this proves the LADDER can find
// it. The rungs are narrowed to distil → lap-periodic deliberately: those two are the whole
// question, since one is addressed by the commanded reference and the other by lap phase, and
// the ladder must choose between them by measuring rather than by being told. The flagship
// ladder in `autostack.test.mjs` is untouched by this — a separate AutoStack, so its 425x
// contract cannot move.
//
// EITHER OUTCOME IS A RESULT. If the distilled rung ships, the retirement has a rung on a real
// machine; if it is refused, the refusal is a stated reason on a plant where the memory reaches
// 242x, and that is worth knowing too. What must NOT happen is that it deploys and harms.
const UM = 2e-3;
const VP = rates(PR.q).v;
const A2 = new AutoStack({
  channels: [{ lo: -0.02, hi: 0.27, vMax: 1.25e-4, aMax: 8.3e-7, jMax: 5e-8 }],
  uMax: UM, floor: 1.6e-3, periodic: P,
  distil: { refDim: 1, ridge: 1e-8,
    offsets: [-512, -256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512],
    signOffsets: [-128, -32, -8, -2, 0, 2, 8, 32, 128] },
});
const look2 = (k) => (off) => [PR.q[((((k + off) % P) + P) % P)]];
const run2 = async (extra) => {
  const m = makeMachine(PR.q[0], 0);
  A2.beginRun();
  let s = 0, n = 0; const e = new Float64Array(P);
  for (let k = 0; k < 8 * P; k++) {
    const kk = ((k - 1) % P + P) % P;
    let u = A2.act({ k: kk, look: look2(kk) })[0];
    if (extra) u += extra.at(kk)[0];
    m.step(PR.q[kk] + Math.max(-UM, Math.min(UM, u)));
    A2.observe([m.q]);
    const ee = m.q - PR.q[k % P];
    if (k >= 7 * P) e[k % P] = ee;
    if (k >= 4 * P) { s += ee * ee; n++; }
  }
  return { score: 1000 * Math.sqrt(s / n), err: [e] };
};
const distilRuns = () => [[4800, 3, 7, 0.60], [5600, 2, 5, 0.90], [4200, 5, 11, 1.20]]
  .map(([lap, c1, c2, vf]) => {
    const q = tone(lap, c1, c2, vf, VP);
    return { lap, refAt: (k) => [q[(((k % lap) + lap) % lap)]],
      run: async (corr) => {
        const m = makeMachine(q[0], 0); let s = 0, n = 0; const e = new Float64Array(lap);
        for (let k = 0; k < 8 * lap; k++) {
          const kk = ((k - 1) % lap + lap) % lap;
          m.step(q[kk] + (corr ? corr.at(kk)[0] : 0));
          const ee = m.q - q[k % lap];
          if (k >= 7 * lap) e[k % lap] = ee;
          if (k >= 5 * lap) { s += ee * ee; n++; }
        }
        return { score: 1000 * Math.sqrt(s / n), err: [e] };
      } };
  });

const rep2 = await A2.commission({ run: run2, distilRuns });
console.log('\n    the one press, distil against the memory it replaces:\n');
console.log(A2.table());
console.log(`    shipped ${JSON.stringify(rep2.deployed)}   ${rep2.base.toExponential(4)} -> `
  + `${rep2.best.toExponential(4)} mm   ${rep2.gain.toFixed(1)}x`);
const drow2 = rep2.rungs.find((r) => r.name.startsWith('②d'));

check('the ladder REACHES the distilled rung on a real plant and produces a row for it',
  !!drow2, JSON.stringify(rep2.rungs.map((r) => r.name)));
// The row's own verdict and what finally shipped must agree, UNLESS the drop-one phase later
// removed the rung — which is a legitimate outcome and is reported rather than asserted away.
const rowKept = !!drow2 && !drow2.name.includes('REFUSED');
const dropped = rowKept && !rep2.deployed.distil;
if (dropped) console.log('    (the rung won its own row and drop-one later removed it — '
  + 'a greedy ladder revisiting a decision made before the rungs above existed)');
check('…and its row\'s verdict agrees with what shipped, or drop-one removed it and says so',
  dropped || rowKept === !!rep2.deployed.distil,
  `row ${drow2 && drow2.name}, shipped ${JSON.stringify(rep2.deployed)}`);
// THE HALF THAT MUST NEVER FAIL, whichever way the verdict goes.
check('…and whatever it decided, the ladder did not end up WORSE than the bare machine',
  rep2.best <= rep2.base + 1e-12, `${rep2.base.toExponential(4)} -> ${rep2.best.toExponential(4)}`);
check('…and the training runs are reported individually, so a diet fault is visible as one',
  !!(rep2.distil && Array.isArray(rep2.distil.runs) && rep2.distil.runs.length === 3),
  JSON.stringify(rep2.distil));

console.log(failed ? `\ndistil-emps: ${failed} check(s) FAILED\n` : '\ndistil-emps: all checks passed\n');
process.exit(failed ? 1 : 0);
