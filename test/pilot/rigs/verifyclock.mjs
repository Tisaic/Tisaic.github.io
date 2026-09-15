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
/**
 * VSCALE=<s>: THE CLOCK AS A CONTINUOUS KNOB, WHICH IS WHAT TURNS §88.2's FINDING INTO A
 * FALSIFIER (plan §89.4, task #65).
 *
 * §88.2 measured that the tank's 2.2x-slowed resampling is LOAD-BEARING AND BENEFICIAL — 3 of 8
 * seeds deploy and ALL THREE HELP, against 6 of 8 deploying and TWO HARMING at the program's own
 * rate — and could not say WHY, so the default was left where the measurement put it rather than
 * where an argument would. A slowed gate could be a genuine REGULARISER on the deploy decision
 * (a candidate must hold up over a longer excursion, so a marginal one is refused), or it could
 * be a coincidence of where `5·segLen + PAD` happens to land. Those predict different things and
 * one run separates them: a regulariser is MONOTONE in the clock, a coincidence is not.
 *
 * `s` multiplies the playback rate, so `s = 1` is `resample` exactly and `s = n/prog` is
 * `natural`. It is a pure multiplier on the index the mode already computes, which is what keeps
 * `VSCALE=1` byte-identical to the default rather than merely close to it.
 */
function verifyIndex(prog, { legacy = null } = {}) {
  const mode = process.env.VREF || 'resample';
  const s = process.env.VSCALE ? Number(process.env.VSCALE) : 1;
  if (mode === 'natural') return (i) => Math.min(Math.round(i * s), prog - 1);
  const span = (mode === 'legacy' && legacy !== null) ? legacy : prog;
  if (s === 1) return (i, n) => Math.round(i * span / n);
  return (i, n) => Math.min(prog - 1, Math.round(i * span * s / n));
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
  const s = process.env.VSCALE ? Number(process.env.VSCALE) : 1;
  if (mode === 'natural') return { mode, n, factor: s, scale: s };
  const span = (mode === 'legacy' && legacy !== null) ? legacy : prog;
  return { mode, n, factor: (span * s) / n, scale: s };
};

export { verifyIndex, verifyStretch };
