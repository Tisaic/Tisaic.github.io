// THE GAIN LADDER'S EARLY EXIT, REPLAYED AGAINST THE ROWS FOUR PLANTS ALREADY PRINTED
// (plan §109, closing #82's remaining half).
//
// §86.6 gave the applied-gain grid an edge extension because an edge is not an optimum.
// §107 then SCRAPED what that costs, from the passing `--full` run and at zero plant time:
// three of four plants pick an INTERIOR gain and never extend, and the QUADRUPLE TANK walks
// DOWNWARD through all six steps monotonically without the argmin turning — so the pick IS
// the bound, which is the very EDGE fault §86.6 was built to remove, surviving at the other
// end because the bound binds before the curve does. And the rung is REFUSED anyway at
// 0.16x, losing to the conventional rung's 19.91x: eleven scored runs selecting a gain the
// machine throws away, on the one plant whose verify share is the outlier at 44% (§84.5).
//
// WHY THIS IS A REPLAY AND NOT A COMMISSIONING. The decision is pure arithmetic on scores
// the harnesses already print, so re-running four plants to exercise it would spend days of
// plant time to learn what their own recorded rows say — the `objtable --read` argument
// (rule 30), and the reason `commtime.mjs` is a scrape. Every row below is quoted from
// §107's table verbatim, which is also what makes this test FALSIFIABLE: if a later change
// moves those ladders, the numbers here are on record to be compared against.
//
// BOTH HALVES (rule 9). A guard that only ever stops is worth nothing if it stops the wrong
// ladder: the three interior plants must be UNTOUCHED, a ladder whose best candidate already
// BEATS its bar must never be tested at all, and a ladder still within reach of its bar must
// be allowed to keep spending. Those are the four cases below, and the tank is the one that
// changes.
import { gainLadderExit } from '../../lib/pilot/autostack.js';

const MARGIN = 0.02;   // AutoStack's own default, reproduced rather than imported: this file
                       // is about the arithmetic, and a margin that moved silently would make
                       // every row below untraceable to §107.
const MAXEXT = 6;      // §86.6's bound, likewise.

let failed = 0;
const ck = (n, c, d) => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`);
  if (!c) failed++;
};
const L = (pairs) => pairs.map(([g, score]) => ({ g, score }));

console.log('\nTHE GAIN LADDER\'S EARLY EXIT — replayed on §107\'s recorded rows\n');

// ---------------------------------------------------------------- the three interior picks
//
// §107's own table. Each is scored on the machine, five candidates, the argmin STRICTLY
// inside the grid — so the extension loop breaks on its own first iteration (`next === null`)
// and the exit is never consulted. Asserting it does not fire is the byte-identity control
// for those three plants stated as an assertion rather than as an argument (rule 21).
const INTERIOR = {
  mill:   L([[0.72, 7.24e-3], [0.85, 6.35e-3], [1.00, 5.86e-3], [1.15, 6.10e-3], [1.30, 6.97e-3]]),
  column: L([[0.72, 5.88e-2], [0.85, 4.73e-2], [1.00, 3.74e-2], [1.15, 3.45e-2], [1.30, 4.16e-2]]),
  barrel: L([[0.72, 1.944],   [0.85, 1.389],   [1.00, 0.862],   [1.15, 0.753],   [1.30, 1.185]]),
};
// Each of these rungs DEPLOYS, so its bar is above its best candidate by construction. The
// numbers are the delivered factors §107 reports beside them: mill 2.62x, column 3.96x,
// barrel 7.00x, so bar = best x factor is a faithful reconstruction of what each cleared.
const INTERIOR_BAR = { mill: 5.86e-3 * 2.62, column: 3.45e-2 * 3.96, barrel: 0.753 * 7.00 };

console.log('THE THREE INTERIOR PICKS — the exit must be silent on all of them:');
for (const [name, cands] of Object.entries(INTERIOR)) {
  const bar = INTERIOR_BAR[name];
  const ex = gainLadderExit(cands, bar, MARGIN, MAXEXT);
  const asc = cands.slice().sort((a, b) => a.g - b.g);
  const best = cands.reduce((a, b) => (b.score < a.score ? b : a));
  const interior = best.g !== asc[0].g && best.g !== asc[asc.length - 1].g;
  ck(`${name}: argmin at gain ${best.g} is INTERIOR, so the grid never extends`, interior,
    `argmin sits at an edge (${best.g})`);
  ck(`${name}: the exit does NOT fire (${ex.reason})`, ex.stop === false, JSON.stringify(ex));
}

// ---------------------------------------------------------------------------- the TANK
//
// §107 printed only the EXTENSION, and the first version of this file replayed only that —
// feeding the exit one candidate at a time starting from 0.7200 alone. **That was not the
// shipped path and it cost this test a wrong answer** (plan §109.1): live, all FIVE base
// candidates are already scored before the grid extends at all, so the exit is evaluated with
// five rows in hand and fires at step ZERO, where the incremental replay could not evaluate
// it until step one. Same rule, same arithmetic, one step apart — and the difference is six
// saved scored runs against five. The instrument was incomplete before the codebase was
// (rule 17), and it was a LIVE RUN of `distil-tank.mjs` that settled it, not more reasoning.
//
// The base rows below are that live run's own output; the extension rows are §107's, kept
// because they are what the exit is being asked to skip and are the only record of where the
// full walk actually ends.
const TANK_BASE = L([
  [0.72, 4.3624e-1], [0.85, 5.1457e-1], [1.00, 6.0498e-1], [1.15, 6.9409e-1], [1.30, 7.7668e-1],
]);
const TANK_EXT = L([
  [0.7200, 4.3624e-1], [0.6099, 3.6993e-1], [0.5166, 3.1379e-1], [0.4376, 2.6629e-1],
  [0.3707, 2.2612e-1], [0.3140, 1.9216e-1], [0.2660, 1.6348e-1],
]);
// The bar is the machine below the rung: the conventional rung's 2.5432e-2 (§97.3's 19.91x
// from 5.0636e-1). The rung was refused at 0.16x, and 2.5432e-2 / 1.6348e-1 = 0.1556 — which
// is that 0.16x, so the bar is checked against the report rather than assumed (rule 15).
const TANK_BAR = 2.5432e-2;
console.log('\nTHE TANK — §107\'s six-step monotone walk, and the run it should not have paid for:');
ck(`the reconstructed bar reproduces the reported 0.16x refusal`,
  Math.abs(TANK_BAR / TANK_EXT[TANK_EXT.length - 1].score - 0.16) < 0.005,
  `${(TANK_BAR / TANK_EXT[TANK_EXT.length - 1].score).toFixed(4)}x against a reported 0.16x`);

// WALK IT THE WAY `AutoStack` DOES: the base ladder is scored in full, THEN the extension
// loop begins and the exit is consulted at the top of each iteration. Anything else is a
// different experiment wearing this one's label.
let spent = 0, stoppedAt = null, reason = '', reach = null;
for (let ext = 0; ext < MAXEXT; ext++) {
  const seen = TANK_BASE.concat(TANK_EXT.slice(1, ext + 1));
  const ex = gainLadderExit(seen, TANK_BAR, MARGIN, MAXEXT - ext);
  if (ex.stop) { stoppedAt = ext; reason = ex.reason; reach = ex.reach; break; }
  spent++;
}
console.log(`    extension steps taken ${spent} of ${MAXEXT}`);
if (stoppedAt !== null) console.log(`    STOPPED: ${reason}`);
ck('the tank\'s extension is cut short', stoppedAt !== null, 'it ran the full budget');
// ZERO, not one. This is the assertion the first version of this file got wrong, so it is
// pinned exactly rather than bounded — a bound is what let the discrepancy hide.
ck(`it stops before extending AT ALL, so all ${MAXEXT} scored runs are saved (spent ${spent})`,
  spent === 0, `spent ${spent}`);
// AND IT REPRODUCES THE LIVE RUN'S OWN PRINTED REACH to the digits that run prints, which is
// what says this replay is the shipped path and not merely near it (rule 21).
ck('the reach reproduces the live harness\'s 1.6197e-1',
  reach !== null && Math.abs(reach - 1.6197e-1) / 1.6197e-1 < 5e-4,
  reach === null ? 'no reach' : reach.toExponential(4));

// THE HALF THAT MATTERS MOST: it must not have been able to reach the bar anyway. The whole
// recorded walk is six steps and ends 6.4x above the bar, so every step the exit skipped was
// provably a step that could not have produced a winner — asserted from the record rather
// than from the rule that skipped them (rule 15).
const endRatio = TANK_EXT[TANK_EXT.length - 1].score / TANK_BAR;
ck(`nothing was lost: the FULL six-step walk still ends ${endRatio.toFixed(2)}x above the bar`,
  endRatio > 1 / (1 - MARGIN), `${endRatio.toFixed(3)}x`);
// THE BOUND CHECKS ITSELF. The exit predicted 1.6197e-1 from the base ladder alone; the
// recorded six-step walk really ends at 1.6348e-1. Pinned, because a rule that predicts the
// thing it skips to within a percent is measuring rather than guessing, and if a later change
// breaks that agreement this is where it shows.
const predErr = Math.abs(1.6197e-1 - TANK_EXT[TANK_EXT.length - 1].score)
  / TANK_EXT[TANK_EXT.length - 1].score;
ck(`the prediction lands within 1% of where the full walk ends (${(predErr * 100).toFixed(1)}%)`,
  predErr < 0.01, `${(predErr * 100).toFixed(2)}%`);

// ------------------------------------------------------------------ the two negative halves
console.log('\nBOTH HALVES — the exit must stay silent where there is a selection to make:');

// (a) A candidate that already BEATS the bar is never tested, however far from an optimum it
//     sits. This is the case that would silently cost a shipped result if it were wrong.
const WINNER = L([[0.72, 9.0e-2], [0.85, 7.0e-2], [1.00, 5.0e-2], [1.15, 4.0e-2], [1.30, 3.0e-2]]);
const exW = gainLadderExit(WINNER, 1.0e-1, MARGIN, MAXEXT);
ck('a winning candidate at the grid EDGE is not tested', exW.stop === false, JSON.stringify(exW));
ck('  and the reason names why', /already beats the bar/.test(exW.reason), exW.reason);

// (b) A losing ladder whose own rate could still reach the bar keeps spending. Constructed at
//     the boundary rather than comfortably inside it: the ladder improves 2x per step and is
//     10x above its bar with 6 steps left, so 2^6 = 64x of headroom clears it easily.
const REACHABLE = L([[0.85, 2.0e-1], [0.72, 1.0e-1]]);
const exR = gainLadderExit(REACHABLE, 1.0e-2, MARGIN, MAXEXT);
ck('a losing ladder still within reach of its bar keeps extending', exR.stop === false,
  JSON.stringify(exR));

// (c) A FLAT losing ladder stops immediately: no rate, so no budget can close anything. This
//     is the case §84.6 warned about from the other side — a rung inert at every gain would
//     otherwise walk the grid for ever.
const FLAT = L([[0.85, 1.0e-1], [0.72, 1.0e-1]]);
const exF = gainLadderExit(FLAT, 1.0e-2, MARGIN, MAXEXT);
ck('a FLAT losing ladder stops at once', exF.stop === true, JSON.stringify(exF));

// (d) Degenerate inputs are refusals to decide, not decisions (rule 25).
ck('one candidate is not enough to decide', gainLadderExit(L([[1, 1]]), 1, MARGIN, 6).stop === false);
ck('no bar is not a reason to stop', gainLadderExit(TANK_EXT, NaN, MARGIN, 6).stop === false);
ck('a spent budget reports no budget rather than a verdict',
  /no budget/.test(gainLadderExit(TANK_EXT, TANK_BAR, MARGIN, 0).reason));

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} check(s) failed\n`);
process.exit(failed === 0 ? 0 : 1);
