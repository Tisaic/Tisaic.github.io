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

import fs from 'node:fs';
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
 * delivers 0.08x where the machine's own pick delivers 2.591x (plan §70, §72).
 *
 * IT IS THE DEFAULT ON ALL FOUR PLANTS, and `RIDGES=none` is the control. What licenses that is
 * four plants sharing no physics, measured (plan §72.9): the tank goes from a REFUSAL to 2.591x,
 * the mill +25%, the column +19%, and the barrel -0.4% — the one plant it costs anything, because
 * it is the only one whose band has more than one member. The bill is +1% of plant time, because
 * the teacher's prefixes are converged once and a candidate is a refit plus one scored run.
 */
/**
 * THE APPLIED-GAIN LADDER (plan §79.2), and it was found by an accident rather than designed.
 *
 * The ridge above selects the FIT's regularisation. The gain the fitted map is APPLIED at is a
 * different quantity with its own optimum and nothing in this project had ever scored it: §78.6's
 * false refusal zeroed the tank's map on 28% of its steps and was worth 19%, and §79.1 reproduced
 * that entire benefit with a UNIFORM 0.9 — so there was no structure in it, only a gain, and the
 * tank's own optimum sits at 0.72 for 2.59x -> 3.19x.
 *
 * IT IS THE CHEAPEST CANDIDATE HERE. A gain needs NO REFIT — scaling the stored weights by `g` is
 * exactly equivalent to scaling the output — so a candidate costs ONE SCORED RUN against the ridge
 * axis's refit-plus-run, and the deployed object is unchanged in form: same weight vector, same
 * MAC, same bytes, because the gain is folded into the weights and never appears at deploy.
 *
 * **1.0 IS IN THE GRID**, so a plant with no gain deficit picks it and is byte-identical, which is
 * what makes this a measurement rather than a tuning (rule 21). `GAINS=none` is the control.
 *
 * AND THE GRID IS NOW TWO-SIDED, BECAUSE THE ONE-SIDED ONE WAS ANSWERING A QUESTION IT COULD NOT
 * ASK (plan §84.6). §79 recorded that "the mill, column, barrel and arm all pick 1.0 and come back
 * byte-identical" and read that as four plants with no gain deficit. For three of them 1.0 was the
 * TOP OF THE GRID, so the pick was an EDGE and not an optimum — the exact fault §79 itself named
 * when it widened the arm's grid above 1 and then left every other plant's one-sided. Widened:
 *
 *     plant     0.85     1.0      1.15     1.3      picks   delivered
 *     mill     6.35e-3  5.86e-3  6.10e-3  6.97e-3   1.00    2.625x  <- a real interior optimum
 *     column   4.73e-2  3.74e-2  3.45e-2  4.16e-2   1.15    3.643x -> 3.959x
 *     barrel   1.39e+0  8.62e-1  7.53e-1  1.19e+0   1.15    6.116x -> 6.997x
 *     tank     1.55e-1  1.95e-1  2.62e-1  3.41e-1   0.85    2.593x -> 3.268x
 *
 * So THREE of four plants want a gain off 1.0 and TWO of them want it ABOVE — the opposite of what
 * a one-sided grid could ever have found — and only the mill's 1.0 is an optimum rather than an
 * edge. The grid keeps 1.0, drops 0.5 (worst on all four by a wide margin, and never picked), and
 * reaches 1.3; the cost is one more scored run than §79 priced.
 */
const DEFAULT_GAINS = [0.72, 0.85, 1, 1.15, 1.3];
function gainLadder(env = process.env.GAINS) {
  if (env === 'none' || env === '0') return null;
  if (!env || env === '1' || env === 'default') return DEFAULT_GAINS;
  const v = env.split(',').map(Number).filter((x) => Number.isFinite(x) && x > 0);
  return v.length > 1 ? v : null;
}

const DEFAULT_RIDGES = [1e-6, 1e-4, 1e-3, 1e-2, 1e-1, 1];
function ridgeLadder(env = process.env.RIDGES) {
  if (env === 'none' || env === '0') return null;
  if (!env || env === '1' || env === 'default') return DEFAULT_RIDGES;
  const v = env.split(',').map(Number).filter((x) => Number.isFinite(x) && x > 0);
  return v.length > 1 ? v : null;
}

/**
 * HOW MUCH OF THE DIET TO USE, READ ONCE (plan §73.3).
 *
 * Wood-Berry DROPS three of its four training runs below the rung's 1.5x bar and pays a full
 * teacher for each of them — three quarters of that plant's commissioning buying no rows at all.
 * `DIETN=<n>` takes the first n members, which measures the bound on stopping the diet early
 * before any stopping RULE is built. Unset is the whole diet and byte-identical.
 */
const dietN = (d) => (process.env.DIETN ? d.slice(0, Math.max(1, +process.env.DIETN)) : d);

/**
 * HOW MANY LAPS A TEACHER CALL COSTS, READ ONCE (plan §73.2).
 *
 * Every diet closure runs `3*lap` per call: one lap to settle under the correction just handed to
 * it, then two that are scored, the last of which is the record the teacher inverts. With the
 * plant CARRIED (§72.15) the first of those three is the only settle there is, so the question is
 * whether the SECOND scored lap is buying noise reduction worth a third of the commissioning.
 * MEASURED ON THREE PLANTS AND IT IS FREE (plan §73.2): the column 42.7 -> 30.0 days at an
 * identical 3.744e-2, the tank 48.0 -> 31.7 h at an identical 1.9531e-1, the mill 57.6 -> 54.8 min
 * and 6.085e-3 -> 5.865e-3, BETTER. So two is the default and `TLAPS=3` is the control. The
 * mechanism is §49's law once more: a second scored lap makes `hff`'s own score quieter, which
 * lets it refine FURTHER, and a more converged teacher teaches a worse policy.
 *
 * AND `TLAPS=1` IS NOW EXPRESSIBLE, WHICH IS THE QUESTION "WHAT IF WE DO NOT SETTLE AT ALL?"
 * (plan §73.8). It scores and records the SAME lap the new correction was applied on, so the
 * teacher's target carries that correction's own transient rather than the periodic steady state
 * it settles to. Every harness scores the LAST lap — `(TLAPS-1)*lap`, which at two is exactly the
 * `k >= lap` they all had, so the shipped default is byte-identical and only the new setting is
 * new. Whether a transient-contaminated target teaches a worse policy or, by §49's law, a better
 * one is a measurement and not a prediction.
 */
const teachLaps = (def = 2) => Math.max(1, +(process.env.TLAPS || def));

/**
 * AVERAGE THE TEACHER'S RECORD OVER THE LAST n LAPS (plan §80.7, §84.1).
 *
 * §72.18 read the barrel's ambient drift as costing 3.951x against 14.949x and filed it as a
 * DISTURBANCE the teacher cannot invert. §80.6 refuted that: the drift is **0.9% of the open-loop
 * error** and the engineer's own closed-form feedforward recovers 1.008x from being told it, so a
 * component that small cannot cost a factor of 3.8 by going uncorrected. What it costs it by is
 * CORRUPTING A LAP-INDEXED TEACHER, whose target has to be COMMENSURATE with its lap. The
 * barrel's is not — 9,300 and 4,100 against a 20,000-step lap land near harmonics 2 and 5 and
 * BEAT against them — so the record moves between calls and the iteration fights that.
 *
 * If that is the mechanism the cure needs no new architecture, because a component incommensurate
 * with the lap averages DOWN over laps and a lap-periodic one does not. Every harness's teacher
 * inverts the LAST lap; this averages the record over the last n instead, which costs laps and
 * nothing else. MEASURED ON THE BARREL: 6.116x (no averaging) -> 9.995x at 5 laps / 4 averaged,
 * with the MATCHED CONTROL firing the right way — more laps ALONE reads 3.643x, WORSE, so a
 * ladder that only raised the lap count would have concluded the opposite (rule 20) — and the
 * FALSIFIER firing too: with the drift removed there is nothing incommensurate to average and the
 * knob is inert at 15.054x against 15.069x (rule 21).
 *
 * IT IS HERE AND NOT IN ONE HARNESS BECAUSE §80.7 IS ONE PLANT AND ITS CLAIM IS GENERAL — *a 0.9%
 * NON-REPEATING component costs the commissioned result 1.6 to 2.5x, and every real plant has
 * small non-repeating components*. Rule 31 says that is a constant to re-derive on another plant
 * rather than to carry, and it cannot be re-derived from a knob that exists in one file.
 *
 * `TAVG=1` is the default and is byte-identical: the accumulator starts at zero and `/1` is
 * exact, so `err[c][kk] += r / TAVG` over one lap is the assignment it replaces.
 *
 * @param {number} tlaps The harness's own `teachLaps()`, which bounds the averaging window: one
 *   lap always establishes the operating point and is never part of the record (rule 13).
 */
const teachAvg = (tlaps) => {
  const n = Math.max(1, Number(process.env.TAVG || 1));
  if (n > tlaps - 1) {
    throw new Error(`TAVG ${n} needs TLAPS >= ${n + 1} (one lap establishes the operating point `
      + 'and is never part of the record — rule 13); raise TLAPS');
  }
  return n;
};

/**
 * THE TEACHER'S OPERATOR REUSE, READ ONCE — now the default, `REUSE=0` the control. It hands the
 * operator identified on the first KEPT training run to every later member of the diet, which is
 * where 84-98% of the product's plant time goes (plan §72.6). Measured on all four plants: the
 * bill falls 2.4-2.8x and the DELIVERED NUMBER DOES NOT MOVE on any of them, which is rule 21's
 * signature rather than a trade. The library carries the same default for the same reason — the
 * operator is a property of the plant, not of the program — so this reads it only for the control.
 */
const teacherReuse = () => process.env.REUSE !== '0';

/**
 * THE TEACHER MAY READ THE TRUTH AT K TOUCHES OF THE LAP AND NOWHERE ELSE (plan §121).
 *
 * §74 measured on the arm that 64 evenly spaced touches buy what a laser tracker buys, and it lived
 * in `lib/flexisim/autohost.js` alone — one plant's evidence because the instrument was one plant's
 * (the `_iteratePolicy` history repeating). This is the same degradation for every harness that
 * drives its teacher through `distilRuns`: each training run's RECORD (`err[c][k]`, what `hff`
 * inverts; `rec[k][c]`, what the oracle port reads) is replaced by its K probe points linearly
 * interpolated around the CLOSED lap — an unmeasured sample is not a zero (rule 25) — and its
 * SCORE, the teacher's monotone gate, by the rms at those K points alone, which is what a probe
 * report gives a shop. The ladder's own scored runs stay on the full instrument, exactly as the arm
 * keeps them (rule 15): what is measured is a cheap TEACHER, never a cheap scoreboard. `K = 0`
 * returns the runs untouched.
 */
function probeRuns(runs, K) {
  K = Math.max(0, Math.round(K || 0));
  if (!K) return runs;
  return runs.map((t) => {
    const L = Math.ceil(t.lap);
    const ix = []; const on = new Uint8Array(L);
    for (let i = 0; i < K; i++) { const j = Math.round(i * L / K) % L; if (!on[j]) { on[j] = 1; ix.push(j); } }
    ix.sort((a, b) => a - b);
    const interp = (get, set) => {
      for (let i = 0; i < ix.length; i++) {
        const a = ix[i], b = ix[(i + 1) % ix.length];
        const span = ((b - a) + L) % L || L;
        const va = get(a), vb = get(b);
        for (let d = 1; d < span; d++) set((a + d) % L, va + (vb - va) * (d / span));
      }
    };
    const degrade = (r) => {
      if (!r) return r;
      let s2 = 0, n = 0;
      if (r.err) {
        for (const e of r.err) {
          for (const j of ix) { s2 += e[j] * e[j]; n++; }
          interp((k) => e[k], (k, v) => { e[k] = v; });
        }
      }
      if (r.rec) {
        const nc = r.rec[0].length;
        for (let c = 0; c < nc; c++) {
          if (!r.err) for (const j of ix) { s2 += r.rec[j][c] ** 2; n++; }
          interp((k) => r.rec[k][c], (k, v) => { r.rec[k][c] = v; });
        }
      }
      if (n) r.score = Math.sqrt(s2 / n);
      return r;
    };
    const w = { ...t, probePts: ix.length };
    for (const k of ['run', 'teach']) if (t[k]) w[k] = async (...a) => degrade(await t[k](...a));
    // ---- AND THE ORACLE TEACHER'S DRIVE, WHICH IS NOT ON THIS DESCRIPTOR'S SURFACE (plan §125).
    //
    // `converge` is built by the HARNESS, closed over the harness's own drive loop, so wrapping
    // `run` and `teach` degrades the `hff` and parametric routes and leaves the ORACLE route
    // reading the FULL instrument. §121 launched three `ORACLE=1 PROBEPTS=K` runs on exactly that
    // configuration before anyone checked, and recorded them as a vacuous control (rule 9c) — a
    // knob set, a route unreached, and an output indistinguishable from one where the knob did
    // nothing because it did nothing.
    //
    // The seam is `t.drive`: a harness that builds a teacher publishes its drive loop and hands
    // the teacher a CALL-TIME read of it, and this replaces it IN PLACE. In place rather than on
    // the spread copy, because the teacher's closure was built before this runs and would never
    // see a new object — which is the same reason §121's wrap missed it. A harness that publishes
    // no drive is untouched and says so, rather than reading as one that was degraded (rule 25).
    if (typeof t.drive === 'function') {
      const raw = t.drive;
      let hits = 0;
      t.drive = async (...a) => { hits++; return degrade(await raw(...a)); };
      w.drive = t.drive;
      w.probeDrives = () => hits;
    }
    return w;
  });
}

/**
 * ONE PLANT PER TRAINING RUN, CARRIED ACROSS THE TEACHER'S CALLS (plan §72.15).
 *
 * Every diet closure here rebuilds and re-settles its plant on every call the teacher makes, and
 * the teacher makes tens of them per run. On the quadruple tank that settle is 30,000 steps
 * against a 5,540-step lap — **64% of every call is bringing a plant to an operating point it was
 * already at**, because the lap is CLOSED and a run ends where it starts.
 *
 * `lib/flexisim/autohost.js` already makes the opposite choice for the arm and states the reason
 * in its own header: it "drives ONE machine between runs and never restores a snapshot", and
 * plan §52.12 measured that a per-run snapshot restore was dozens of teleports per commissioning.
 * The plant harnesses are the copy that never got the lesson (rule 61).
 *
 * IT IS NOT A FREE CHANGE AND IS NOT CLAIMED AS ONE. The carried plant begins a call where the
 * previous one left it — under the previous correction — rather than at a cold settle, so the
 * numbers move and must be re-measured. It is also the more honest configuration: a deployed
 * machine runs continuously and is not re-settled from cold between laps (rule 34).
 */
function carrier(build) {
  let p = null;
  return () => (p === null ? (p = build()) : p);
}

/**
 * THE TABLE'S ROW, EMITTED BY THE HARNESS THAT MEASURED IT (plan §87.1).
 *
 * `objtable.mjs` built the winning table by SPAWNING every plant's harness and scraping its
 * stdout, which is right for an instrument run on demand and wrong for a CHECK: the suite already
 * runs every one of those harnesses, so spawning them again is fifteen minutes of duplicated plant
 * time to learn what the suite just measured. Worse, a table nobody runs is not a check, and the
 * mandate this project works to — *every plant is a legitimate winner or is struck with a reason*
 * — has never had one.
 *
 * So each harness EMITS its row where it measured it, and `objtable.mjs READ=1` reads them. The
 * row is keyed by the SCRIPT that produced it (`process.argv[1]`'s basename) rather than by a name
 * the caller passes, because a name passed by hand is a second description that can drift from the
 * thing (rule 30) — and the same key is what lets the reader keep only the `distil-*` harnesses,
 * so the TEACHER rows `plants.test.mjs` produces through the same driver do not land in a table
 * about the deployed object.
 *
 * Unset `OBJTABLE_OUT` and nothing is written, so every existing run is byte-identical (rule 21).
 */
function emitRow(rep, auto, extra = {}) {
  const dir = process.env.OBJTABLE_OUT;
  if (!dir || !rep) return;
  const cost = (auto && auto.cost && auto.cost()) || null;
  const file = (process.argv[1] || '').split('/').pop().replace(/\.mjs$/, '');
  const row = {
    file, name: extra.name || null, deployed: rep.deployed || null,
    base: Number.isFinite(rep.base) ? rep.base : null,
    best: Number.isFinite(rep.best) ? rep.best : null,
    gain: Number.isFinite(rep.gain) ? rep.gain : null,
    mac: cost ? Math.round(cost.slicedMac) : null,
    peak: cost && cost.mac !== undefined ? Math.round(cost.mac) : null,
    kb: cost ? +(cost.bytes / 1024).toFixed(1) : null,
    // WHETHER THE RUNG SHIPPED, WHICH IS `deployed.distil` AND NOT WHETHER A POLICY EXISTS.
    // The first version read `rep.distil.policy`, which is true whenever the FIT vouched for
    // itself — and on the real steam exchanger the fit vouches and the MACHINE refuses it at
    // 0.045x, so the table read DEPLOYED for a rung that did not (rule 25, and `distil.js`'s own
    // "the gate is a PRE-FILTER and the decision is a machine-scored verify").
    rung: rep.distil ? ((rep.deployed && rep.deployed.distil) ? 'DEPLOYED' : 'REFUSED') : null,
    /**
     * WHAT THE FOUR-COEFFICIENT RUNG TAKES, AND WHAT THE LEARNED MAP ADDS ON TOP OF IT.
     *
     * The headline factor is the WHOLE ladder against the bare machine, and `classic.js` —
     * `[a, v, sign v, 1]` fitted on the machine — is essentially a self-tuned feedforward, which
     * is the incumbent class. So a plant's headline can be mostly the incumbent with a small
     * learned increment on it, and nothing here has ever separated the two: the split is printed
     * per plant in each ladder's own rows and has never been collected, which is the same shape
     * as every other count this project has had to turn from a sentence into a scrape (rule 30).
     * `rep.rungs` already carries it — the row NAMED `conventional (self-tuned)` and the row
     * named for the distilled rung, each with the score it was measured at — so this is a read of
     * the object's own record and not a second measurement.
     *
     * `xClassic` is base/classic and `xAdded` is classic/best, so their product is the headline
     * by construction.
     *
     * **THERE ARE THREE STATES AND THE FIRST VERSION COLLAPSED THEM INTO TWO, WHICH IS THE FAULT
     * ITS OWN COMMENT WARNED AGAINST (plan §95, rules 25 and 30).** It read *a rung that did not
     * run must not read as one that ran and contributed nothing* and then emitted `xClassic: 1`
     * for both, because it looked the rung up with `&& r.deployed` — so a rung the harness NEVER
     * OFFERED and a rung that RAN AND FOUND NO HEADROOM were indistinguishable in the row. Six
     * plants of ten duly read `classicRan: false`, and the barrel's own log shows it offered the
     * rung, ran it and refused it at a genuine 1.00x. A table built on that would have reported
     * six non-measurements as measurements, on exactly the question the incumbent column exists
     * to answer.
     *
     *   NOT OFFERED   no rung by that name exists      -> `xClassic: null`, verdict 'not offered'
     *   REFUSED       it ran and found no headroom     -> `xClassic: 1`,    verdict 'refused'
     *   DEPLOYED      it ran and shipped               -> `base/score`,     verdict 'deployed'
     *
     * The middle row is a REAL measurement of the incumbent and belongs in the count; the first is
     * not and must not.
     */
    ...(() => {
      const rs = Array.isArray(rep.rungs) ? rep.rungs : [];
      const cl = rs.find((r) => r.name === 'conventional (self-tuned)');
      const ran = !!cl;
      const dep = !!(cl && cl.deployed);
      const xClassic = !ran ? null
        : (dep && Number.isFinite(rep.base) && Number.isFinite(cl.score) && cl.score > 0)
          ? rep.base / cl.score : 1;
      const afterClassic = dep && Number.isFinite(cl.score) ? cl.score : rep.base;
      const xAdded = (Number.isFinite(afterClassic) && Number.isFinite(rep.best) && rep.best > 0)
        ? afterClassic / rep.best : null;
      return { xClassic: xClassic === null ? null : +xClassic.toFixed(4),
        xAdded: xAdded === null ? null : +xAdded.toFixed(4),
        classicRan: ran,
        classicVerdict: !ran ? 'not offered' : dep ? 'deployed' : 'refused' };
    })(),
    ...extra,
  };
  try {
    // Appended rather than rewritten, because several harnesses run in one suite and a row that
    // overwrites the file would leave a table of one plant (rule 25 — a missing row must read as
    // missing, not as the table being complete).
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(`${dir}/rows.jsonl`, JSON.stringify(row) + '\n');
  } catch (e) { console.log(`  (objtable row not emitted: ${e.message})`); }
}

/**
 * THE DEPLOYED COST LINE, PRINTED THE SAME WAY EVERYWHERE (plan §87.2).
 *
 * `rigs/ladder.mjs` has printed this for every plant it drives since §63, and the three harnesses
 * that drive their own host — the arm, EMPS and the quadruple tank — never did. `objtable.mjs`
 * reads exactly this line, so those three read `—` for MAC and kB in a table built to stop
 * hand-carried numbers (rule 30): the arm's 274 MAC/decision and EMPS' 78 live in `CLAUDE.md`
 * prose and nowhere a check can see them. One formatter, four callers.
 *
 * It prints the SLICED figure and the peak beside it, because `cost()` reports both and a rung
 * that decides on its own stride and HOLDS between pays the peak on the scan it decides and
 * nothing on the others (§52.38) — quoting one without the other is the reassuring half.
 */
function printCost(auto, indent = '      ') {
  const cost = auto && auto.cost && auto.cost();
  if (!cost) return null;
  const rungs = Object.keys(cost.rungs || {}).join('+') || 'none';
  console.log(`${indent}cost: ${Math.round(cost.slicedMac)} MAC/cycle sliced, `
    + `${(cost.bytes / 1024).toFixed(1)} kB   rungs ${rungs}`
    + (cost.mac !== undefined ? `   peak ${Math.round(cost.mac)} MAC/decision` : ''));
  return cost;
}

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
  // DEDUPED, because a plant with a SHORT reach rounds several shape fractions to the same tap
  // and two identical columns are exactly collinear. On the real heat exchanger the reach is 23
  // steps and the geometric shape collapses to 0, ±1, ±3, ±5, ±8, ±12, ±17, ±23 with four
  // duplicates; on every plant with a reach above ~100 the shape is already distinct, so the four
  // that carry this rule today are byte-identical (rule 21).
  const offsets = [...new Set(SHAPE
    .flatMap((f) => { const o = Math.round(f * reach); return o === 0 ? [0] : [-o, o]; }))]
    .sort((a, b) => a - b);
  return { reach, offsets, rule: Math.round(rule) };
}

/**
 * THE APPLIED-GAIN LADDER'S REPORT, WRITTEN ONCE (plan §119). `distil-tank.mjs` kept its own copy of
 * this format and so had no path to the extension-exit line §109 added here (rule 30); both sites
 * call this now, at their own indent, and the output is byte-identical at each.
 */
export function printGainLadder(rep, pad = '  ') {
  if (!rep.distil || !rep.distil.gains) return;
  console.log(`${pad}the APPLIED-GAIN LADDER, scored on the machine (no refit — the gain folds into `
    + 'the weights, so a candidate costs one scored run):');
  for (const c of rep.distil.gains) {
    console.log(`${pad}  gain ${String(c.gain).padStart(5)}  machine `
      + `${c.score === null ? 'not scored' : c.score.toExponential(4)}`
      + (c.gain === rep.distil.gainPicked ? '   <- PICKED' : ''));
  }
  // AN UNFLATTERING DIAGNOSTIC FIRST (rule 27): if the ladder stopped extending because the
  // rung was already losing by more than its budget could close, that is the row's headline
  // and not a footnote — the axis spent its runs and had nothing to select (plan §109).
  if (rep.distil.gainExit) {
    console.log(`${pad}  EXTENSION STOPPED after ${rep.distil.gainExit.at} step`
      + `${rep.distil.gainExit.at === 1 ? '' : 's'}: ${rep.distil.gainExit.reason}`);
  }
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
  // ---- AN EXCEPTION INSIDE THE RUNG MUST NOT PASS FOR A REFUSAL (plan §72.15).
  //
  // `AutoStack` catches whatever `host.distilRuns()` throws into `rep.distil.error` — right, so
  // one bad diet cannot take a commissioning down — and nothing above it ever read that field.
  // A missing import in this very change duly produced `{"error":"carrier is not defined"}`, a
  // rung that never ran, a 1.000x, and a GREEN test whose own summary read "it REFUSED". That is
  // rule 25 exactly: "did not run" and "ran and declined" are different states, and the harness
  // could not tell them apart. It throws now, because a refusal is a result and a crash is not.
  if (rep.distil && rep.distil.error) {
    throw new Error(`the distilled rung THREW rather than refusing: ${rep.distil.error} `
      + '— a crash is not a verdict (rule 25)');
  }
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
  if (rep.distil && rep.distil.teacherFallback) {
    console.log(`  the TEACHER FELL BACK: ${rep.distil.teacherFallback}`);
  }
  if (rep.distil && rep.distil.runs) {
    console.log('  the TEACHER, per training run:');
    for (const [i, c] of rep.distil.runs.entries()) {
      console.log(`    run ${i}: ${segs ? `SEG ${segs[i % segs.length]}  ` : ''}lap ${c.lap}  `
        + `teacher ${c.gain.toFixed(3)}x  rows ${c.used}  ${c.dropped ? 'DROPPED' : 'kept'}`
        + `  engine ${c.engine}`
        + (c.passes === null || c.passes === undefined ? '' : `  passes ${c.passes}`)
        // A TEACHER THAT NEVER RAN READS AS ONE THAT RAN AND GOT NOWHERE, unless it says so.
        // The oracle teacher needs a commissioned pilot to iterate and returns a stated note
        // when there is none; both produce gain EXACTLY 1.000x and DROPPED (rule 25).
        + (c.note ? `\n             note: ${c.note}` : ''));
      // The teacher's own laps by phase, which decides what can be cut (plan §72.11).
      if (c.budget) {
        console.log(`             laps: ${Object.entries(c.budget)
          .filter(([k]) => k !== 'total').map(([k, v]) => `${k} ${v}`).join(' · ')}`
          + `   TOTAL ${c.budget.total}`);
      }
    }
  }
  // THE LADDER'S OWN TABLE, printed whenever one ran — the fit's score beside what the MACHINE
  // said, because on the tank those two order INVERSELY and a report showing one alone would
  // reproduce the fault this ladder exists to remove (plan §70, §72).
  // THE TEACHER'S PASS LADDER, SCORED ON THE MACHINE (plan §73.14) — printed beside the
  // ridge's for the same reason: the pick is a measurement and the table is what says so.
  if (rep.distil && rep.distil.teacherLadder) {
    console.log('  the TEACHER LADDER, scored on the machine:');
    for (const c of rep.distil.teacherLadder) {
      console.log(`    ${String(c.passes).padStart(3)} pass(es)  machine `
        + `${c.score === null ? '—        ' : c.score.toExponential(4)}`
        + `  held-out [${(c.heldOutR2 || []).map((x) => x.toFixed(4)).join(', ')}]`
        + `${rep.distil.teacherPicked === c.passes ? '   <- PICKED' : ''}`);
    }
  }
  if (rep.distil && rep.distil.ridges) {
    console.log('  the RIDGE LADDER, scored on the machine:');
    for (const c of rep.distil.ridges) {
      console.log(`    ridge ${String(c.ridge).padStart(7)}${c.passes ? ` · teacher ${String(c.passes).padStart(2)}p` : ""}  `
        + `machine ${c.score === null ? 'not scored (the fit refused)' : c.score.toExponential(4)}`
        + `  held-out ${JSON.stringify(c.heldOutR2)}`
        + (c.ridge === rep.distil.ridgePicked && c.passes === rep.distil.teacherPicked ? '   <- PICKED'
          : (rep.distil.ridgeBand || []).includes(c.ridge) ? '   (in band)' : ''));
    }
  }
  printGainLadder(rep, '  ');
  if (rep.distil && rep.distil.ridgeNote) console.log(`  ${rep.distil.ridgeNote}`);
  if (rep.distil && rep.distil.fit) {
    const f = rep.distil.fit;
    console.log(`  the FIT: ${f.rows} rows / ${nFeat} features, `
      + `held-out ${JSON.stringify(f.heldOutR2)}, deploy ${f.deploy}`);
  }
  const dr = rep.rungs.find((r) => /distil/.test(r.name));
  console.log(`  distilled rung: ${dr ? /SKIPPED/.test(dr.name) ? `SKIPPED — ${dr.note}`
    : `${dr.deployed ? 'DEPLOYED' : 'REFUSED'} at ${dr.gain === null ? '—' : dr.gain.toFixed(3)}x`
    : 'not reported'}`);
  if (rep.distil && rep.distil.note) console.log(`  ${rep.distil.note}`);
  return { inSample, dr };
}

export { printCost, emitRow, deriveWindow, reportDistil, priceFrom, ridgeLadder, gainLadder, probeRuns, teacherReuse, carrier, teachLaps, teachAvg, dietN, human, SHAPE, DEFAULT_RIDGES, DEFAULT_GAINS };
