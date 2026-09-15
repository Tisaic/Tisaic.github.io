/**
 * @file THE VERIFY'S CLOCK — two pure functions, in a module that IMPORTS NOTHING (plan §88.2).
 *
 * They lived in `rigs/specs.mjs` for about an hour, which was wrong for a measurable reason:
 * that module re-identifies four plants from their published records AT LOAD, so importing it
 * costs **5.4 s** and drags the real arm, the real tanks and the real exchanger into three plant
 * tests that have nothing to do with them. Rule 2 — a check too slow to run is a verification
 * problem — aimed at an import, and rule 61's own remedy does not require the shared thing to
 * live in the largest module that happens to be shared.
 */
/**
 * THE VERIFY'S CLOCK, WRITTEN ONCE (plan §88.2).
 *
 * `verifyRef(i, n)` hands the caller the verify's own step budget, which invites exactly one
 * idiom — `refAt(round(i * PROG / n))` — and four plants here wrote it independently. That maps
 * the program onto `n` steps, which RE-TIMES it by `PROG / n`, and nothing anywhere states the
 * factor. On the cart-pole it was **22x SLOWED**: the gate scored a staircase on which the
 * CONVENTIONAL machine reads 4.211e-1 against the real program's 2.913e-2, so it was deciding
 * about a machine fourteen times worse than the one that runs (plan §87.4, rule 11 aimed at a
 * gate). Four private copies of a re-timing nobody had measured is rule 61 exactly.
 *
 *   'resample' (the default)  the idiom, stated: the program is played in `n` steps.
 *   'natural'                 the program at its OWN rate, then HELD at its last point, which is
 *                             what `rigs/ladder.mjs` does when it scores the same program.
 *   'legacy'                  whatever the plant did before this existed, so a change of verdict
 *                             can be attributed rather than merely observed (rule 21).
 *
 * It returns an INDEX, not a reference, because each plant composes its own map from setpoint to
 * command (volts, power, two inputs) and a helper that owned that would be a second copy of it.
 */
function verifyIndex(prog, { legacy = null } = {}) {
  const mode = process.env.VREF || 'resample';
  if (mode === 'natural') return (i) => Math.min(i, prog - 1);
  if (mode === 'legacy' && legacy !== null) return (i, n) => Math.round(i * legacy / n);
  return (i, n) => Math.round(i * prog / n);
}

/**
 * WHAT THE VERIFY'S CLOCK DID TO THE PROGRAM, FOR THE MODE ACTUALLY IN FORCE. Above 1 the
 * program was COMPRESSED (played fast), below 1 STRETCHED, and `natural` re-times nothing at all
 * by construction — a helper that returned `prog / n` regardless would report a re-timing for the
 * one mode that does none, which is the reading this whole section exists to make impossible.
 * Returns `{ mode, n, factor }`, `factor` null where there is nothing to state.
 */
const verifyStretch = (prog, rep, { legacy = null } = {}) => {
  const mode = process.env.VREF || 'resample';
  const n = (rep && rep.verifyRegimes && rep.verifyRegimes.steps) || null;
  if (!n) return { mode, n: null, factor: null };
  if (mode === 'natural') return { mode, n, factor: 1 };
  const span = (mode === 'legacy' && legacy !== null) ? legacy : prog;
  return { mode, n, factor: span / n };
};

export { verifyIndex, verifyStretch };
