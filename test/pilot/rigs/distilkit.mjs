/**
 * @file THE TWO THINGS EVERY DISTILLED-RUNG HARNESS SHARES, SO THEY ARE WRITTEN ONCE.
 *
 * `distil-tank.mjs`, `distil-arm.mjs` and `distil-barrel.mjs` each derive a window and each print
 * a verdict, and a second copy of either has already drifted in this project: `distil-tank.mjs`
 * carries the arm's 0.61·Tset reach as though it were a rule, and §63.7 sized a window from
 * `DIETS[0]`'s lap when the diet's laps had stopped being equal. Neither is a plant's business —
 * the DIET is plant-specific and belongs in the plant's own harness; the derivation and the
 * report are not, and belong here (rule 61).
 *
 * WHAT THE WINDOW RULE IS AND WHY IT HAS NO PLANT CONSTANT IN IT. Two constraints pull opposite
 * ways (§49.11, rule 37 against §41's aliasing theorem): the window must REACH the plant's memory
 * and must not SPAN the training lap. Every harness before §63 obeyed the first alone, which is
 * right only while the plant's settle is short against its program — on the barrel the settle is
 * 7,861 steps against 15,000 and a reach-sized window aliases. `min(0.61·settle, lap/8)` obeys
 * both. The 0.61 is the arm's shipped reach as a FRACTION of its own settle, which is a design;
 * the lap/8 is the aliasing bound. It is evidence and not proof: on the barrel the rule reads
 * ±938 where §62.5 measured the transfer optimum at ±983 by an offline route with no rung in it,
 * which is agreement to 5% on a plant sharing no physics with the one the fraction came from, and
 * that ladder locates the optimum only to about a factor of two.
 *
 * THE LAP IS THE SHORTEST IN THE DIET, not the first: the aliasing half is about the lap the
 * window could span, so a diet of mixed rates is bounded by its fastest recipe.
 */

import { count, reset, split } from './meter.mjs';

/**
 * WHAT THE PRODUCT COSTS THE PLANT, on the plant's own clock (plan §72).
 *
 * `commtime.mjs` collects the line each plant test prints, and every one of those counts the
 * steps a bare `Pilot` advanced — the TEACHER. Under the memory's retirement the teacher is not
 * the product, and the route to the product adds a DIET whose prefixes must be converged before
 * one row exists. CLAUDE.md names that cost in prose — "laps on real hardware producing nothing"
 * — and no number here has ever counted it.
 *
 * `priceFrom()` zeroes the meter and REPORTS what it read, because the rigs that compute an
 * open-loop or classical reference at import have already advanced the plant and that baseline
 * must be visible rather than never accrued (rule 25). `close()` prints steps and the plant's own
 * time, in a wording `commtime.mjs` scrapes separately from the teacher's, so the two columns can
 * be read against each other rather than one silently replacing the other.
 */
function priceFrom() {
  const pre = reset();
  return {
    pre,
    close({ dt, unit = 's', rep = null }) {
      // Which runs the rung KEPT, read off the report rather than restated (rule 30).
      const kept = rep && rep.distil && rep.distil.runs
        ? rep.distil.runs.map((c, i) => (c.dropped ? null : i)).filter((x) => x !== null) : null;
      const steps = count();
      const s = unitS(steps, dt, unit);
      console.log(`\n  the PRODUCT commissioned in ${steps} steps = ${human(s)} of plant time`
        + `  (rig baseline before this, not charged: ${pre} steps)`);
      const by = split();
      // The per-run teacher buckets are rolled up for the headline and printed separately, so
      // "the teacher is 96%" and "run 2 of that 96% was thrown away" are both readable.
      const roll = Object.create(null);
      for (const [k, v] of Object.entries(by)) {
        const key = k.startsWith('teacher#') ? 'teacher' : k;
        roll[key] = (roll[key] || 0) + v;
      }
      const ord = Object.entries(roll).sort((a, b) => b[1] - a[1]);
      if (ord.length) {
        console.log('    where it goes: ' + ord.map(([k, v]) =>
          `${k} ${human(unitS(v, dt, unit))} (${(100 * v / (steps || 1)).toFixed(0)}%)`).join('  ·  '));
      }
      const per = Object.entries(by).filter(([k]) => k.startsWith('teacher#'))
        .sort((a, b) => a[0].localeCompare(b[0]));
      if (per.length > 1) {
        console.log('    the teacher, per training run: ' + per.map(([k, v]) =>
          `${k.slice(8)}: ${human(unitS(v, dt, unit))}`).join('  ·  ')
          + (kept ? `   (kept ${kept.join(',')})` : ''));
      }
      return { steps, seconds: s, pre, by };
    },
  };
}

/** A rig's own step count in seconds, given its stated step and the unit that step is in. */
const unitS = (n, dt, unit) => (unit === 'min' ? n * dt * 60
  : unit === 'h' ? n * dt * 3600 : unit === 'days' ? n * dt * 86400 : n * dt);

/** Seconds on one axis, so six rigs with six different steps print comparably. */
const human = (s) => (s < 90 ? `${s.toFixed(0)} s`
  : s < 5400 ? `${(s / 60).toFixed(1)} min`
  : s < 172800 ? `${(s / 3600).toFixed(1)} h`
  : `${(s / 86400).toFixed(1)} days`);

/**
 * THE RIDGE LADDER, READ ONCE (rule 61). `RIDGES=1e-6,1e-4,1e-2,1e-1,1` hands `AutoStack`'s ②d
 * rung a set of candidates to REFIT and SCORE ON THE MACHINE, rule 42's band picking the largest
 * within 5% of the best improvement. Unset returns null and every harness is byte-identical.
 *
 * `DEFAULT_RIDGES` is a fixed geometric grid spanning six decades and is a DESIGN in the same
 * sense as `SHAPE` above: it carries no plant's number, which is the whole point — `1e-6` was the
 * arm's value carried to every plant after it, and on the quadruple tank that carried value
 * delivers 0.08x where 1e-1 delivers 1.80x (plan §70, §72).
 */
const DEFAULT_RIDGES = [1e-6, 1e-4, 1e-3, 1e-2, 1e-1, 1];
function ridgeLadder(env = process.env.RIDGES) {
  if (!env) return null;
  if (env === '1' || env === 'default') return DEFAULT_RIDGES;
  const v = env.split(',').map(Number).filter((x) => Number.isFinite(x) && x > 0);
  return v.length > 1 ? v : null;
}

/**
 * THE TEACHER'S OPERATOR REUSE, READ ONCE. `REUSE=1` hands the operator identified on the first
 * KEPT training run to every later member of the diet, which is where 94-98% of the product's
 * plant time goes (plan §72.6). Unset is false and byte-identical.
 */
const teacherReuse = () => process.env.REUSE === '1';

/** The geometric offset SHAPE — dense near now where the correction is decided, sparse far out
 * where it only has to span the memory. The shape is a design; the reach is the plant's. */
const SHAPE = [0, 0.008, 0.016, 0.031, 0.063, 0.125, 0.219, 0.344, 0.5, 0.719, 1];

/**
 * @param {object} o
 * @param {number} o.settle   the plant's own measured settle, in raw steps
 * @param {number} o.lapMin   the SHORTEST lap in the training diet, in raw steps
 * @param {number} [o.win]    an override in raw steps, so the derivation can be swept not asserted
 */
function deriveWindow({ settle, lapMin, win }) {
  const rule = Math.min(0.61 * settle, lapMin / 8);
  const reach = Math.round(win === undefined || win === null || !Number.isFinite(win) ? rule : win);
  const offsets = SHAPE
    .flatMap((f) => { const o = Math.round(f * reach); return o === 0 ? [0] : [-o, o]; })
    .sort((a, b) => a - b);
  return { reach, offsets, rule: Math.round(rule) };
}

/**
 * The verdict, with the unflattering diagnostics FIRST (rule 27).
 *
 * A prequential R² below zero has at least three cheap explanations that the score itself cannot
 * tell apart — a target the teacher never converged (`distil-tank.mjs` read gains of 3.2e6 on a
 * quasi-static diet, which is a target already at zero rather than a controller result), a diet
 * whose runs were dropped, and too few rows for the features — and `rep.distil.runs` carries all
 * three for nothing. They are printed before any account of the fit.
 *
 * THE IN-SAMPLE COLUMN IS THE ONE THAT SAYS *WHY* (the split `distil-arm.mjs` exists to make):
 * helps its own training runs and harms the scored program -> TRANSFER, and the diet is the
 * subject; cannot help even the runs it was fitted on -> the map cannot EXPRESS this plant's
 * correction and no diet repairs that. Without it a refusal has two explanations and nothing
 * distinguishes them.
 */
async function reportDistil({ rep, runs, nFeat, segs = null, auto = null }) {
  // ---- THE TWO CHECKS THAT WOULD HAVE CAUGHT §65's DEFECTS, AND DID NOT EXIST.
  //
  // Both faults were silent, both were of a class this project had already paid for once, and
  // both were found by an outside objection rather than by a check. Each is one line.
  //
  // (1) A CLOSED LAP MUST CONTRIBUTE EVERY SAMPLE. If a run's `refAt` wraps but the descriptor
  //     does not declare `closed`, `addProgram` clamps the window at index 0 and the fit silently
  //     skips the first REACH samples — 939 of 7,500 on the barrel, 376 of 3,000 on the column,
  //     each exactly the window's own reach (plan §52.14, §65.1). The row count says so for free.
  //
  // (2) A DECIMATED LOOK-AHEAD MUST BE DECLARED. The rung's offsets are RAW machine steps and
  //     `_distilTerm` falls back to `ctx.look`, so a host whose cascade decides on its own sample
  //     deploys a window stretched by that factor against the one the fit saw — invisible wherever
  //     the cascade refuses, because there the stride is 1 (plan §51.5, §65.2).
  if (rep.distil && rep.distil.runs) {
    for (const [i, c] of rep.distil.runs.entries()) {
      if (c.dropped) continue;
      const want = Math.ceil(c.lap / (rep.distil.stride || 1));
      if (c.used < want) {
        console.log(`  ⚠ run ${i} contributed ${c.used} rows of a ${c.lap}-step lap — short by `
          + `${want - c.used}. A CLOSED lap must declare \`closed: true\` on its run descriptor, `
          + 'or `addProgram` clamps the window at index 0 and the fit never sees the wrap the '
          + 'deployed policy will read (plan §52.14, §65.1).');
      }
    }
  }
  const strideBelow = auto && auto.stack ? (auto.stack.sample || 1) : 1;
  if (auto && auto.distilNoLookRaw && strideBelow > 1) {
    console.log(`  ⚠ the cascade below decides on a stride of ${strideBelow} and the host `
      + 'declared no `lookRaw` — the DEPLOYED window is stretched by that factor against the one '
      + 'the fit saw, silently (plan §51.5, §65.2).');
  }
  let inSample = null;
  if (rep.distil && rep.distil.policy) {
    inSample = [];
    for (const r of runs) {
      const bare = await r.run(null);
      const withP = await r.run({ at: (k) => rep.distil.policy.actLook((o) => r.refAt(k + o)) });
      inSample.push(bare.score / withP.score);
    }
    console.log('\n  in sample, on its own training runs: '
      + inSample.map((x) => `${x.toFixed(3)}x`).join('  '));
  }
  if (rep.distil && rep.distil.runs) {
    console.log('  the TEACHER, per training run:');
    for (const [i, c] of rep.distil.runs.entries()) {
      console.log(`    run ${i}: ${segs ? `SEG ${segs[i % segs.length]}  ` : ''}lap ${c.lap}  `
        + `teacher ${c.gain.toFixed(3)}x  rows ${c.used}  ${c.dropped ? 'DROPPED' : 'kept'}`
        + `  engine ${c.engine}`
        + (c.passes === null || c.passes === undefined ? '' : `  passes ${c.passes}`));
    }
  }
  // THE LADDER'S OWN TABLE, printed whenever one ran — the fit's score beside what the MACHINE
  // said, because on the tank those two order INVERSELY and a report showing one alone would
  // reproduce the fault this ladder exists to remove (plan §70, §72).
  if (rep.distil && rep.distil.ridges) {
    console.log('  the RIDGE LADDER, scored on the machine:');
    for (const c of rep.distil.ridges) {
      console.log(`    ridge ${String(c.ridge).padStart(7)}  `
        + `machine ${c.score === null ? 'not scored (the fit refused)' : c.score.toExponential(4)}`
        + `  held-out ${JSON.stringify(c.heldOutR2)}`
        + (c.ridge === rep.distil.ridgePicked ? '   <- PICKED (rule 42: largest in the band)' : ''));
    }
  }
  if (rep.distil && rep.distil.ridgeNote) console.log(`  ${rep.distil.ridgeNote}`);
  if (rep.distil && rep.distil.fit) {
    const f = rep.distil.fit;
    console.log(`  the FIT: ${f.rows} rows / ${nFeat} features, `
      + `held-out ${JSON.stringify(f.heldOutR2)}, deploy ${f.deploy}`);
  }
  const dr = rep.rungs.find((r) => /distil/.test(r.name));
  console.log(`  distilled rung: ${dr ? `${dr.deployed ? 'DEPLOYED' : 'REFUSED'} at `
    + `${dr.gain === null ? '—' : dr.gain.toFixed(3)}x` : 'not reported'}`);
  if (rep.distil && rep.distil.note) console.log(`  ${rep.distil.note}`);
  return { inSample, dr };
}

export { deriveWindow, reportDistil, priceFrom, ridgeLadder, teacherReuse, human, SHAPE, DEFAULT_RIDGES };
