/**
 * @file THE PLANT'S OWN CLOCK, COUNTED AT THE PLANT — the instrument target 4 has always
 *       needed and never had for the object that actually ships (plan §72).
 *
 * `commtime.mjs` scrapes the line each plant test prints, and every one of those lines counts
 * the steps a bare `Pilot` advanced — the TEACHER. Under the memory's retirement the teacher is
 * not the product: the deployed artefact is `distil.js`'s weight vector, and the route to it is
 * a DIET of training runs whose prefixes have to be converged before a single row exists. Those
 * runs are laps on real hardware producing nothing, CLAUDE.md says so in its own words, and no
 * number in this repository has ever counted them.
 *
 * WHY THE COUNTER IS HERE AND NOT IN THE HARNESSES. Every harness advances its plant from a
 * different place — the ladder's scored `run`, its `drivePilot`, and each diet closure's own
 * loop — so a counter wired per call site is a counter that will miss the next call site added,
 * and a per-harness copy of the arithmetic is rule 61 with the ink still wet (this project has
 * paid for a second copy of a plant's routing three times). One tick inside the plant's own
 * `step` cannot be bypassed by any caller, counts the teacher and the product on the same axis,
 * and is the rig's own step — which is the unit `commtime.mjs` already converts.
 *
 * IT COUNTS STEPS AND NOTHING ELSE. A rig states its own seconds-per-step and the conversion
 * stays there, because a plant's clock is a property of the plant: the mill's step is 2 ms and
 * Wood-Berry's is six seconds of column, which is why steps and time RANK DIFFERENTLY and why a
 * target counted in steps measures the simulator (plan §54.6).
 *
 * `reset()` before the thing being priced, `count()` after. A module-load baseline — the rigs
 * that compute an open-loop or classical-controller reference at import — lands in the count
 * unless reset, and that is deliberate: it must be VISIBLE and subtracted on purpose rather
 * than never accrued (rule 25 — "not measured" and "zero" are different states).
 */

let n = 0;
let label = 'other';
let buckets = Object.create(null);

/** One plant step. Called from inside a rig's own `step`, so no caller can bypass it. */
function tick() { n++; buckets[label] = (buckets[label] || 0) + 1; }

/** Steps advanced since the last `reset()`. */
function count() { return n; }

/**
 * WHERE THE PLANT TIME GOES, WHICH IS THE HALF THAT DECIDES WHAT TO CUT. A total says target 4 is
 * missed; it does not say whether the cost is the teacher converging a diet, the cascade being
 * identified as that teacher, or the ladder SCORING candidates on the machine — and those have
 * nothing in common as levers. This project has already paid for the other version of this
 * mistake: target 4 recorded the physics at ~10% of a scored run and closed off the right lever,
 * where `test/flexisim/_cost.mjs` measures 69% (rule 17 aimed at an accounting).
 *
 * The label is set in ONE place — `rigs/ladder.mjs`, around the phases `AutoStack` calls back
 * into — so a harness never has to know the split exists, and a phase nobody labelled lands in
 * `other` rather than being silently attributed to the phase above it (rule 25).
 */
function into(l) { const was = label; label = l; return was; }

/** The per-phase counts since the last `reset()`. */
function split() { return { ...buckets }; }

/** Zero the meter, and return what it read — so a baseline is reported rather than discarded. */
function reset() { const was = n; n = 0; buckets = Object.create(null); label = 'other'; return was; }

export { tick, count, reset, into, split };
