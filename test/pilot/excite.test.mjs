/**
 * @file THE EXCITATION BUILDER, against its own contract: every limit holds ON THE
 * SEQUENCE THAT WILL BE COMMANDED — ramp, seam and regeneration included — the box is
 * actually covered, and a hostile workspace shrinks the span rather than being violated.
 */
import { buildExcitation, peakDiffs, easeSteps, smoother } from '../../lib/pilot/excite.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: the excitation builder');

const LIMS = [{ lo: -0.9, hi: 0.1, vMax: 5e-4, aMax: 2e-6, jMax: 5e-8 },
  { lo: 1.5, hi: 2.6, vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 }];

{
  const e = buildExcitation({ channels: LIMS, steps: 30000, start: [-0.2, 2.0], seed: 3 });
  let all = true, cover = true;
  for (const [c, p] of e.pos.entries()) {
    const pk = peakDiffs(p);
    const lo = Math.min(...p), hi = Math.max(...p);
    if (pk.v > LIMS[c].vMax || pk.a > LIMS[c].aMax || pk.j > LIMS[c].jMax) all = false;
    if (lo < LIMS[c].lo - 1e-12 || hi > LIMS[c].hi + 1e-12) all = false;
    if ((hi - lo) < 0.95 * (LIMS[c].hi - LIMS[c].lo)) cover = false;
  }
  // MEASURED ON THE COMMANDED SEQUENCE, because that is where the two shipped defects
  // lived: the ramp-to-rest seam put one velocity-sized jerk where no filtering upstream
  // could see it, and the full-length regeneration renormalised past the tuned peaks.
  check('velocity, acceleration, jerk and the position box hold on every commanded sample',
    all);
  check('…while the excitation still covers at least 95% of the box, which is its job',
    cover);
  const e2 = buildExcitation({ channels: LIMS, steps: 30000, start: [-0.2, 2.0], seed: 3 });
  let same = true;
  for (let c = 0; c < 2; c++) for (let k = 0; k < e.pos[c].length; k += 97) {
    if (e.pos[c][k] !== e2.pos[c][k]) same = false;
  }
  check('the same seed commands the same trajectory, so a commissioning is reproducible',
    same && e.ramp === e2.ramp);
}

{
  // A workspace that rejects part of the box: the span SHRINKS and the predicate holds
  // on every sample — the trajectory is never allowed to visit what the machine cannot.
  const ws = (q) => q[0] > -0.75 && q[1] < 2.45;
  const e = buildExcitation({ channels: LIMS, steps: 30000, start: [-0.2, 2.0],
    workspace: ws, seed: 3 });
  let ok = true;
  for (let k = 0; k < e.total; k++) if (!ws([e.pos[0][k], e.pos[1][k]])) ok = false;
  check('a hostile workspace shrinks the span instead of being violated',
    ok && e.meta.shrink < 1, `shrink ${e.meta.shrink.toFixed(3)}`);
  let threw = false;
  try {
    buildExcitation({ channels: LIMS, steps: 30000, start: [-0.2, 2.0],
      workspace: () => false, seed: 3 });
  } catch (err) { threw = /workspace/.test(err.message); }
  check('…and a workspace that rejects everything refuses with a reason, not a loop', threw);
}

{
  // LIMITS THE DURATION CANNOT SATISFY ARE A REFUSAL, NOT A DEGRADED RESULT. At jerk
  // 5e-8 the velocity limit alone takes ~4500 steps to reach, so an 8000-step scribble
  // across a 1-radian box does not exist — and the first version of this builder
  // "succeeded" anyway, by escalating its corner period to 2.4e16 until the trajectory
  // went FLAT: a flat line passes every rate limit while exciting nothing. Coverage is
  // now part of the acceptance, and the impossible case says what to change.
  // dwell: true, because that is where the pathology lived — the warp's renormalisation
  // amplifies every derivative, the corner period escalates without bound, and at this
  // duration nothing satisfiable remains. With the warp off the same duration is
  // legitimately feasible, and it builds (checked below rather than assumed).
  let threw = false;
  try {
    buildExcitation({ channels: LIMS, steps: 8000, start: [-0.2, 2.0], seed: 3, dwell: true });
  } catch (err) { threw = /cannot traverse|approach alone|rate limit/.test(err.message); }
  check('a duration these limits cannot fill refuses with the remedy, instead of '
    + 'returning a flat line that excites nothing', threw);
  // The unwarped case at 8000 steps refuses too, and legitimately: the approach ramp
  // alone, at the 20% of vMax the blend reserves, needs ~14.6k steps for this reach —
  // asserted rather than assumed, because the first version of this check claimed it
  // would build and the builder correctly disagreed. (That 30000 steps DOES build at
  // full span is what the first block of this file pins.)
  let threw8 = false;
  try {
    buildExcitation({ channels: LIMS, steps: 8000, start: [-0.2, 2.0], seed: 3 });
  } catch (err) { threw8 = /excitation/.test(err.message); }
  check('…and the unwarped case refuses too — the approach alone cannot fit', threw8);
}

{
  // The ease's closed forms: its own peak diffs stay under the limits it was sized for.
  const lim = { vMax: 3e-4, aMax: 1e-6, jMax: 3e-8 };
  const A = 0.7, n = easeSteps(A, lim);
  const p = new Float64Array(n + 4);
  for (let k = 0; k < n + 4; k++) p[k] = A * smoother(k / n);
  const pk = peakDiffs(p);
  check('the approach ease respects the very limits its duration was solved from',
    pk.v <= lim.vMax && pk.a <= lim.aMax && pk.j <= lim.jMax,
    JSON.stringify({ v: pk.v, a: pk.a, j: pk.j }));
}

console.log(failed ? `\nexcite: ${failed} check(s) FAILED\n` : '\nexcite: all checks passed\n');
process.exit(failed ? 1 : 0);
