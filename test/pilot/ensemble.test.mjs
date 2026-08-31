/**
 * @file THE ENSEMBLE'S CONTRACT, PINNED — because it is now a shipped library object and the
 *       measurement that motivated it lives in an experiment script that the suite never runs.
 *
 * What is asserted here is the part that must not rot: the averaging is EXACT, it refuses to
 * average models that were not fitted on the same row, it averages over the MAJORITY layout rather
 * than the first draw's, and it says what it excluded. The measured performance claim — eight tank
 * draws that all refused averaging to a vouched 1.344x — belongs to `tankspread.mjs` and is not
 * re-run here, because a contract test that commissions a plant eight times is a contract test
 * nobody runs.
 */
import { ensemble, freezeConfig } from '../../lib/pilot/ensemble.js';
import { Pilot } from '../../lib/pilot/pilot.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};
console.log('\npilot: the ensemble — averaging k commissioning draws');

/** A stand-in pilot: only the fields `ensemble` reads, so the contract is about those alone. */
const mk = (vals, { stride = 13, poly = false, sched = false, leads = 2, n = 4 } = {}) => ({
  readouts: [{
    stride, poly, sched,
    w: Array.from({ length: leads }, () => Float64Array.from(
      Array.from({ length: n }, (_, i) => vals[i % vals.length]))),
  }],
});

// ---- THE AVERAGE IS THE ARITHMETIC MEAN, EXACTLY.
{
  const a = mk([1, 2, 3, 4]), b = mk([3, 4, 5, 6]), c = mk([5, 6, 7, 8]);
  const r = ensemble([a, b, c]);
  const w = r.pilot.readouts[0].w[0];
  check('three draws average to their arithmetic mean, element by element',
    [...w].every((v, i) => Math.abs(v - (1 + i + 3 + i + 5 + i) / 3) < 1e-12), JSON.stringify([...w]));
  check('…on every lead of the bank, not only the first',
    [...r.pilot.readouts[0].w[1]].every((v, i) => Math.abs(v - (3 + i)) < 1e-12),
    JSON.stringify([...r.pilot.readouts[0].w[1]]));
  check('…and it reports how many draws it used', r.used === 3 && r.of === 3, JSON.stringify(r));
}

// ---- IT REFUSES TO AVERAGE ACROSS A DIFFERENT ROW, WHICH IS THE WHOLE SAFETY PROPERTY.
//
// A draw that chose a different stride or basis was fitted on a different feature row. Averaging
// across one evaluates the model on a vector it was never fitted on — silently, because the vector
// LENGTHS can still match. This is the same class as the deploy path's positional length guard.
{
  const same = [mk([1, 1, 1, 1]), mk([3, 3, 3, 3])];
  const odd = mk([9, 9, 9, 9], { stride: 32 });
  const r = ensemble([...same, odd]);
  check('a draw fitted at a different stride is EXCLUDED, not averaged in',
    r.used === 2 && Math.abs(r.pilot.readouts[0].w[0][0] - 2) < 1e-12,
    JSON.stringify({ used: r.used, w0: r.pilot.readouts[0].w[0][0] }));
  check('…and the exclusion is reported rather than silent',
    typeof r.why === 'string' && /excluded/.test(r.why), JSON.stringify(r.why));
  const rb = ensemble([mk([1, 1, 1, 1]), mk([3, 3, 3, 3], { poly: true })]);
  check('…and a different BASIS is excluded the same way, leaving too few to average',
    rb.pilot === null && rb.shapes === 2, JSON.stringify(rb));
}

// ---- THE MAJORITY LAYOUT DECIDES, NOT THE FIRST DRAW'S.
//
// Taking the first draw's layout lets one unusual commissioning decide which of the others are
// admissible — on a plant where the layout flips, that silently averages the MINORITY and reports
// a k it did not use.
{
  const odd = mk([9, 9, 9, 9], { stride: 32 });
  const maj = [mk([1, 1, 1, 1]), mk([3, 3, 3, 3]), mk([5, 5, 5, 5])];
  const r = ensemble([odd, ...maj]);
  check('the majority layout is averaged even when a minority draw comes first',
    r.used === 3 && Math.abs(r.pilot.readouts[0].w[0][0] - 3) < 1e-12,
    JSON.stringify({ used: r.used, w0: r.pilot.readouts[0].w[0][0] }));
}

// ---- AND IT WILL NOT PRETEND WITH ONE DRAW.
{
  const r = ensemble([mk([1, 1, 1, 1])]);
  check('a single draw is not an ensemble and says so',
    r.pilot === null && /at least two/.test(r.why), JSON.stringify(r));
}

// ---- freezeConfig HANDS OVER EXACTLY THE FIELDS THE FIT READS.
{
  const from = mk([1, 1, 1, 1], { stride: 21 });
  from.readouts[0].ridge = 1e-7; from.readouts[0].mLag = 24; from.readouts[0].fLag = 24;
  const to = {};
  freezeConfig(from, to);
  check('freezeConfig copies stride, ridge, window and basis onto a pilot that has not fitted',
    to._frozenConfig[0].stride === 21 && to._frozenConfig[0].ridge === 1e-7
      && to._frozenConfig[0].mLag === 24 && to._frozenConfig[0].poly === false,
    JSON.stringify(to._frozenConfig));
}

// ---- THE EXPERIMENTAL HOOKS ARE OFF, AND STAY OFF.
//
// `verifyRef` gives the deploy gate a program to score, and it changes what a machine DEPLOYS, so
// a default that quietly flipped would alter every plant in the suite while every test still
// passed — the changed behaviour would look like the plant rather than like a switch.
//
// Its sibling `exciteAppend` was built for one experiment, measured, and REMOVED: injecting a
// structured path into the excitation took all three verify regimes below one and the gate
// refused. An experimental hook that is not carrying a result is a liability, and this check
// exists partly to make its absence permanent.
//
// Asserted on a constructed Pilot rather than by reading the source, because the question is what
// a caller who asks for nothing actually gets.
{
  const p = new Pilot({
    nMeasured: 1, channels: [{ lo: -1, hi: 1, vMax: 1e-3, aMax: 1e-5, jMax: 1e-7 }],
    uMax: 0.1, start: [0], workspace: () => true, seed: 1,
  });
  check('a pilot that asks for nothing gets no verify reference, so the gate scores its own regimes',
    p.verifyRef === null, String(p.verifyRef));
  // AND THE REMOVED HOOK IS STILL ABSENT, asserted rather than assumed: a re-introduction that
  // defaulted to on would change what every plant LEARNS, and nothing else here would notice.
  check('…and the removed excitation hook has not come back',
    p.exciteAppend === undefined && p.report.exciteAppended === undefined,
    JSON.stringify({ hook: p.exciteAppend, report: p.report.exciteAppended }));
}

console.log(failed ? `\npilot/ensemble: ${failed} check(s) FAILED\n` : '\npilot/ensemble: all checks passed\n');
process.exit(failed ? 1 : 0);
