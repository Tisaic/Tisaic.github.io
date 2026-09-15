/**
 * @file THE BUTTON ON THE REAL CASCADED TANKS — the counterpart to this project's own
 * quadruple tank, which is where the deployed object was last refused.
 *
 * THE QUESTION IS NOT "does it work here", IT IS "was the refusal the plant class or our
 * simulator". `distil-tank.mjs` measured 1.000x held out on our quadruple tank — the rung
 * reached the plant, fitted 49,864 rows, was scored and reverted — and `tankspread.mjs`
 * measured 4 of 8 seeds deploying HARMFULLY at the old defaults. Both are simulator results
 * on a plant we wrote. This one's dynamics come from real hardware, and its held-out
 * validation is the strongest in the directory because the benchmark ships two INDEPENDENT
 * excitations rather than a split of one.
 *
 * THE COMPARISON IS LIKE FOR LIKE BY CONSTRUCTION: this plant is commanded in pump volts and
 * scored in level, with the CONVENTIONAL MACHINE being the open-loop static inversion — the
 * same arrangement `plants.test.mjs` gives the quadruple tank through `voltsFor`, and the
 * same recipe shape of holds and ramps. What differs is where the dynamics came from.
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { realtanksLadderSpec } from './rigs/specs.mjs';
import * as T from './rigs/realtanks-rig.mjs';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: the button on the REAL cascaded tanks (Schoukens & Noël 2017)\n');
announce();

console.log(`  identified from the record: na=${T.MODEL.na} nb=${T.MODEL.nb} nk=${T.MODEL.nk}, `
  + `${T.MODEL.p} parameters, ridge ${T.MODEL.lam}`);
console.log(`  free-run on the benchmark's OWN independent validation record: `
  + `${T.IDENT.model.val.toFixed(2)}% NRMSE, ${T.VAL_RMS.toFixed(4)} V rms`);
console.log(`  static map y = ${T.GAIN.toFixed(3)}·u ${T.OFF < 0 ? '−' : '+'} ${Math.abs(T.OFF).toFixed(3)}; `
  + `the record's own box is u ${T.UMIN.toFixed(2)}–${T.UMAX.toFixed(2)} V, overflow at `
  + `${T.OVERFLOW.toFixed(2)}`);
console.log(`  conventional machine (the static inversion): ${T.CONV_RMS.toFixed(4)} rms over a `
  + `${T.PROG} sample recipe = ${(T.PROG * T.TS / 3600).toFixed(2)} h of plant time`);

// THE SPECS MOVED TO `rigs/specs.mjs` when `distil-realtanks.mjs` needed the same plants
// (plan §86.4); this file is byte-identical across the move (rule 21).
const res = await ladder(realtanksLadderSpec({ overflow: false }));

// ---- THE CONTROL THAT SAYS WHAT THE FIRST NUMBER MEASURED (rules 14, 15, 9) -------------
// 2012x is not a controller result. The plant above is an identified LINEAR model and the
// conventional rung's basis is [a, v, sign v, 1]: the correction and the plant are the same
// class of object, so the inversion is exact and the number measures the MODEL CLASS. The
// cheapest way to show that is to give the plant a nonlinearity the correction provably
// cannot express — the benchmark's own documented OVERFLOW, visible in the record as 84
// samples pinned at exactly 10.00, which the linear fit lost so completely that it
// extrapolates to 20.9 V where there is no 20 cm of tank. If the 2012x survives the clamp it
// was a controller result after all; if it collapses, it was the model class.
console.log('\n  the same plant with its documented OVERFLOW restored (clips 15.6% of samples):');
const ofl = await ladder(realtanksLadderSpec({ overflow: true }));

check('the real tank commissions and ships something that does not make it worse',
  res.rep.best <= res.rep.base, `${res.rep.base.toExponential(3)} → ${res.rep.best.toExponential(3)}`);
check('the identified plant is validated against an excitation the fit never saw — the '
  + 'benchmark ships two, which is more than a time split of one can claim',
  T.VAL_RMS < 1.0, `${T.VAL_RMS.toFixed(4)} V free-run rms`);
check('the overflow plant commissions and is not made worse either',
  ofl.rep.best <= ofl.rep.base, `${ofl.rep.base.toExponential(3)} → ${ofl.rep.best.toExponential(3)}`);
// BOTH HALVES (rule 9): the control is only a control if the two differ. If a nonlinearity
// the correction cannot express leaves the factor untouched, the linear-plant hypothesis for
// the 2012x is WRONG and this file should say so rather than keep the explanation.
console.log(`\n  linear plant ${res.rep.gain.toFixed(1)}x  vs  overflow active ${ofl.rep.gain.toFixed(1)}x`
  + `  — a factor of ${(res.rep.gain / ofl.rep.gain).toFixed(1)} between them`);
check('…and the two differ, which is what makes the comparison a control rather than a '
  + 'restatement: a factor measured on a plant inside the correction\'s own hypothesis class '
  + 'is a measurement of that class',
  res.rep.gain > 3 * ofl.rep.gain,
  `${res.rep.gain.toFixed(1)}x vs ${ofl.rep.gain.toFixed(1)}x`);

console.log(failed ? `\nrealtanks: ${failed} check(s) FAILED\n` : '\nrealtanks: all checks passed\n');
process.exit(failed ? 1 : 0);
