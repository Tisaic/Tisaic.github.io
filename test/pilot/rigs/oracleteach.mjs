/**
 * @file THE PILOT AS THE TEACHER, FOR THE PLANT HARNESSES (plan §73.9).
 *
 * `hff` is 74-89% of what the PRODUCT costs these plants — 29.6 days of extruder on the barrel,
 * 26.3 of column — and §73.6 and §73.8 closed both ways of making its laps cheaper: the lap cannot
 * go below the plant's settle, and the settle lap inside a call cannot go at all. So the lever
 * that remains is a DIFFERENT teacher, and this project already has one and already prices it:
 * `lib/flexisim/autohost.js` iterates the COMMISSIONED PILOT with the measured error as its free
 * response, and CLAUDE.md records 6.6x in 10.1 machine-minutes against `hff`'s 107 on the arm.
 *
 * WHY IT IS CHEAP. `hff` spends its laps IDENTIFYING an operator by probing at the lap's own
 * harmonics. The oracle port replaces exactly that: `pilot.oracleF0` substitutes a MEASURED error
 * record for the model's forecast, so the QP inverts the truth instead of a prediction of it and
 * no probe set is needed. What it costs instead is a commissioned cascade — measured here at
 * **4.0 days on the barrel and 4.9 on the column at depth 1**, against the 29.6 and 26.3 that
 * `hff` spends. That is the whole trade, and it is why the arm's 10x does not transfer as a
 * number: the ratio is between two costs that scale differently with a plant's lap.
 *
 * THE ALGORITHM IS THE ARM'S, EXTRACTED RATHER THAN REWRITTEN (rule 61). Each pass runs the
 * program with the frozen prefix applied and the pilot OFF, recording the truth at every pilot
 * sample; then runs it again with the pilot ON and its free response REPLACED by that record, and
 * adds what the pilot applied to the prefix. The prefix ALONE is what the distillation receives,
 * so it is a correction of the conventional machine and never of a machine the pilot has moved.
 *
 * AND IT TEACHES FROM A REFUSED CASCADE, which is what made it reach three plants instead of one
 * (plan §73.13). `AutoStack` nulls `this.stack` the moment a cascade loses its verify, so the
 * column (0.39x) and the quadruple tank had nothing here to iterate and the report read as the
 * teacher trying and failing rather than never running (rule 25). The arm's host has done this
 * since plan §52.37 under `distilTeachRefused`, default ON, on the measured ground that a rung's
 * verify scores exactly what the teaching port replaces — a cascade at 0.62x there teaches a
 * policy as good as one at 1.34x. What is recovered is `built.stacks`' last entry;
 * `deployed.stack` is untouched, so a teacher can never become a controller.
 *
 * MONOTONE, as every iteration in this project is: a pass that made the machine worse is undone
 * and the loop stops, so what is handed on is the BEST prefix and never the last one.
 *
 * WHAT IS NOT CARRIED ACROSS FROM THE ARM: the arm band-limits each increment (`qFilter`) before
 * adding it to the prefix, and that filter is expressed in the arm's own harmonic basis with no
 * plant-agnostic form. The first version took the increment RAW and said so — and the barrel duly
 * refused it (plan §73.10): the teacher converged 3.77 -> 3.19, a mere 1.18x against `hff`'s
 * 4.3-8.1x on the same recipes, with `uPk` 8.7 of a cap of 12, and the SECOND pass made every run
 * worse. A full step at near-cap authority overshoots and one pass is all the monotone gate
 * allows.
 *
 * THE REMEDY CARRIES NO CONSTANT AND IS THIS PROJECT'S OWN: `hff` states it in its header — "take
 * a damped Newton step ... the STEP backtracks (1.0 converges the axis on pass one and diverges
 * the arm)". So a pass that fails is not the end of the iteration; it HALVES the step and tries
 * again, and only a pass that fails at the smallest step stops it. That is a search over step
 * length rather than a tuned damping, it costs one drive per backtrack exactly as `hff`'s does,
 * and it leaves the monotone guarantee intact — what is handed on is still the best prefix.
 */

/**
 * @param {object} o
 * @param {object} o.auto      the `AutoStack` being commissioned — its `stack` carries the layers
 *                             whose `oracleF0` port is wired, and it must have been built already
 * @param {number} o.lap       the program's lap in raw machine steps
 * @param {number} o.nc        channel count
 * @param {(a: object) => Promise<{score:number, rec:(Array<Array<number>>|null)}>} o.drive
 *        the plant's own loop, supplied by its harness. Called with
 *        `{ pre, active, rec, uOut, trace }`: apply `pre[c][k]` always; when `active`, add what
 *        `auto.act` returns and write it into `uOut[c][k]`; when `trace`, return `rec` — the
 *        measured truth per channel at every raw step of the scored lap.
 * @param {number} [o.passes=4]
 * @param {number} [o.backtracks=3]  halvings allowed before the iteration stops
 * @param {boolean} [o.debug]
 */
function oracleConverge({ auto, lap, nc, drive, passes = 4, backtracks = 3, debug = false }) {
  return async () => {
    const L = Math.round(lap);
    const pre = Array.from({ length: nc }, () => new Float64Array(L));
    const dbg = debug ? (m) => console.log(`      [oracle] ${m}`) : null;

    const first = await drive({ pre, trace: true });
    let rec = first.rec, base = first.score, best = base, bestPre = null, done = 0;
    if (dbg) dbg(`lap ${L}: base ${base.toExponential(4)}`);

    // ---- A REFUSED CASCADE IS STILL A TEACHER, AND THIS IS WHERE THE PLANTS NEEDED IT.
    //
    // `AutoStack` sets `this.stack = null` the moment a cascade attempt loses its verify, so on
    // a plant whose cascade does not ship there is nothing here to iterate — and the first
    // version of this file duly returned "no cascade layer was built" on the COLUMN (verify
    // 0.39x) and the TANK (no layer admitted at all), which read in the report as the oracle
    // teacher trying four passes and getting nowhere. It had not run (rule 25).
    //
    // The library already answers this and the measurement is on record: as a RUNG the cascade
    // is judged on whether its FORECAST inverts the machine well enough to ship, while as a
    // TEACHER it is handed the measured error through `oracleF0` and asked only for the
    // increment that cancels it — so its verify scores exactly what the teaching port replaces.
    // `lib/flexisim/autohost.js` does this for the arm under `distilTeachRefused`, DEFAULT ON
    // since plan §52.37, where a cascade scoring 0.62x teaches a policy as good as one scoring
    // 1.34x. This is that mechanism for the plant harnesses, written once (rule 61).
    //
    // `built.stacks` retains every commissioned cascade including the refused ones, and
    // `deployed.stack` is NOT touched — which is what arms a cascade — so what is recovered here
    // is a teacher and can never become a controller.
    let st = auto.stack;
    let recovered = false;
    if (!(st && st.layers && st.layers.length)) {
      const b = auto.built && auto.built.stacks;
      if (b && b.length) { st = b[b.length - 1]; recovered = true; }
    }
    const layers = (st && st.layers) || [];
    if (!layers.length) return { base, best: base, passes: 0, at: () => new Array(nc).fill(0),
      note: 'no cascade was commissioned at all, so there is no pilot to iterate' };
    const S = st.sample || 1;
    // The rung reads its decision stride off `auto.stack`, so a recovered teacher is published
    // there exactly as the arm's host publishes its fallback.
    if (recovered && !auto.stack) auto.stack = st;
    if (dbg && recovered) dbg('the cascade REFUSED its verify and is being used as a teacher anyway');

    // ---- ARMED FOR THE TEACHING DRIVE ONLY, AND THAT IS NOT THE SAME AS DEPLOYED.
    //
    // The plant harnesses reach the pilot through `auto.act`, which skips the cascade unless
    // `deployed.stack` is non-zero — so publishing a recovered teacher on `auto.stack` alone
    // produced an increment of EXACTLY ZERO at every backtrack scale on the column, which reads
    // in the log as an iteration that converged rather than one that never acted (rule 25
    // again, one level down). The arm's host does not hit this because it calls the Stack
    // directly. So the teaching drive arms it and a `finally` puts it back — the same shape as
    // the `oracleF0` port below, a property set for one drive and restored whether or not it
    // threw. Nothing outside this loop ever sees it armed, so the cascade cannot reach the
    // machine: what ships is decided after this returns, by scoring the distilled policy.
    const wasDeployed = auto.deployed.stack;
    const armDepth = layers.length;

    // ---- THE PASS COUNT IS A PLANT CONSTANT AND MUST NOT BE WRITTEN IN (rule 31).
    //
    // Swept on three plants it does not agree: the COLUMN peaks at 8 passes (1.92x at 2, 3.43x
    // at 4, 5.49x at 8, 4.87x at 16, 4.82x at 32 — §49's law firing on the far side), the TANK
    // peaks at 4 (2.942x against 2.621x at 8) and the MILL's own monotone gate stops it at 5-6
    // whatever is asked. So there is no number to pick, and this project's answer to that is the
    // ridge ladder's: hand the caller CANDIDATES and let it score them ON THE MACHINE.
    //
    // The iteration is monotone and already keeps the best prefix, so a snapshot at each rung of
    // the ladder is FREE — what is paid is the deepest rung, once, and every shallower candidate
    // comes out of the same drives. The ladder is a fixed geometric grid and carries no plant's
    // number, exactly as the ridge ladder and the offset SHAPE do.
    const ladder = [];
    for (let q = 2; q < passes; q *= 2) ladder.push(q);
    const snaps = [];
    const snapNow = (n) => {
      const cur = bestPre || pre;
      snaps.push({ passes: n, at: ((c) => (k) => { const i = (((k % L) + L) % L);
        return c.map((a) => a[i]); })(cur.map((a) => Float64Array.from(a))) });
    };

    for (let pass = 0; pass < passes; pass++) {
      if (ladder.includes(pass)) snapNow(pass);
      const uOut = Array.from({ length: nc }, () => new Float64Array(L));
      // THE ORACLE: the measured truth at this decision's step plus the lead, on the PILOT's own
      // grid. `leadSamp` is in pilot samples and the record is per raw step, so the conversion is
      // `leadSamp * S` — the units error this project keeps paying for, and the one that made the
      // arm's first oracle steer the machine wrong in both signs (plan §52.8).
      let kNow = 0;
      const or = rec ? (c, leadSamp) => rec[(((kNow + leadSamp * S) % L) + L) % L][c] : null;
      for (const p of layers) p.oracleF0 = or;
      let on;
      auto.deployed.stack = armDepth;
      try {
        on = await drive({ pre, active: true, uOut, trace: true, onStep: (k) => { kNow = k; } });
      } finally { for (const p of layers) p.oracleF0 = null; auto.deployed.stack = wasDeployed; }

      done = pass + 1;
      let pk = 0;
      for (let c = 0; c < nc; c++) for (let k = 0; k < L; k++) pk = Math.max(pk, Math.abs(uOut[c][k]));
      // THE STEP BACKTRACKS. The increment as the pilot produced it is a FULL Newton step at the
      // authority it was given; `hff` damps and backtracks for exactly this reason, and without it
      // the barrel overshoots on pass 0 and diverges on pass 1 (plan §73.10). A scale that fails
      // is halved and retried, and only failing at the smallest scale ends the iteration.
      let took = false;
      for (let bt = 0, scale = 1; bt <= backtracks; bt++, scale /= 2) {
        for (let c = 0; c < nc; c++) for (let k = 0; k < L; k++) pre[c][k] += scale * uOut[c][k];
        // Pass 0's own drive already scored scale 1, so it is not re-run (rule 2).
        const r = bt === 0 ? on : await drive({ pre, trace: true });
        if (dbg) dbg(`pass ${pass} @${scale}: scored ${r.score.toExponential(4)} (best ${best.toExponential(4)}), uPk ${(pk * scale).toExponential(3)}`);
        if (r.score < best) {
          best = r.score; bestPre = pre.map((a) => Float64Array.from(a));
          if (r.rec) rec = r.rec;
          took = true; break;
        }
        for (let c = 0; c < nc; c++) for (let k = 0; k < L; k++) pre[c][k] -= scale * uOut[c][k];
      }
      if (!took) break;
    }
    const fin = bestPre || pre;
    // The deepest rung is the one the loop just finished, whatever it stopped at.
    snapNow(done);
    return { base, best, passes: done,
      // Every rung of the ladder the iteration actually reached, shallowest first, for a caller
      // that scores them. A caller that ignores the field gets the deepest, as before.
      snapshots: snaps.filter((x, i) => i === snaps.length - 1 || x.passes < done),
      ...(recovered ? { note: 'taught by a cascade that REFUSED its own verify — the teaching '
        + 'port replaces the forecast that verify scores' } : {}),
      at: (k) => { const i = (((k % L) + L) % L); return fin.map((a) => a[i]); } };
  };
}

/**
 * ONE PILOT INCREMENT AGAINST THE POLICY'S OWN ERROR — the plant harnesses' missing `teach`
 * (plan §90.3).
 *
 * `AutoStack._iteratePolicy` is already the LAP-FREE teacher this project's retirement asks for:
 * what iterates is a `DistilPolicy`, a map of the commanded reference, and the lap index survives
 * only as an addressing scheme for ONE pass's target vector rather than as the thing that
 * converges. §52.16 measured it at 5.06x against the lap table's 6.04x on the arm.
 *
 * It has been arm-only for thirty sections and the reason is one line: it runs when
 * `runs.every((t) => t.teach)`, and `grep` says exactly ONE module in this repository supplies
 * `teach` — `lib/flexisim/autohost.js`. This is that closure for the plant harnesses, built from
 * the SAME `drive` they already hand `oracleConverge`, so a plant that can be taught by the oracle
 * can be taught parametrically with no new plumbing of its own (rule 61).
 *
 * WHAT IT IS AND IS NOT DOING. `oracleConverge` iterates a LAP PREFIX to convergence and hands the
 * distillation a finished target — *a target that contains, fully converged, everything the basis
 * cannot express*, which is §49's law and the reason a more faithful teacher teaches a worse
 * policy. This returns ONE increment and lets the LADDER fit and re-measure, so what the basis
 * cannot express is never accumulated. Same machinery, same oracle port, same units; a different
 * thing converges.
 *
 * TWO DIFFERENCES FROM `oracleConverge` ARE STATED BECAUSE THEY ARE NOT FREE:
 *
 * (1) NO BACKTRACKING. `oracleConverge` halves a failing step up to three times and §73.10
 *     measured that as load-bearing — without it *the barrel overshoots on pass 0 and diverges on
 *     pass 1*. `_iteratePolicy` has no line search: it fits the policy, scores it ON THE MACHINE
 *     and keeps it only if better, so an overshooting pass is REJECTED WHOLE rather than scaled.
 *     That is a machine-scored guard rather than a weaker one, and it is also a coarser one, so
 *     the prediction on record is that the barrel stalls early here (plan §90.3).
 * (2) THE CORRECTION IS MATERIALISED. `drive` takes a `pre` array indexed by lap position and
 *     `_iteratePolicy` hands round a closure; evaluating the closure over [0, L) is EXACT, because
 *     a policy's held output under a fixed program is a function of k and nothing else. No plant's
 *     drive closure changes.
 *
 * @param {object} o  the same bag `oracleConverge` takes: `auto`, `lap`, `nc`, `drive`
 * @returns {{run: Function, teach: Function}}  spread into one training-run descriptor
 */
function oracleTeach({ auto, lap, nc, drive }) {
  const L = Math.round(lap);
  const zero = () => Array.from({ length: nc }, () => new Float64Array(L));
  /** A correction closure evaluated over the lap — exact, see (2) above. */
  const materialise = (corr) => {
    const pre = zero();
    if (!corr) return pre;
    for (let k = 0; k < L; k++) {
      const c = corr.at(k);
      for (let ch = 0; ch < nc; ch++) pre[ch][k] = (c && c[ch]) || 0;
    }
    return pre;
  };
  /**
   * A REFUSED CASCADE IS STILL A TEACHER, recovered exactly as `oracleConverge` recovers it and
   * for the reason written out at length there: as a RUNG the cascade is judged on whether its
   * forecast inverts the machine well enough to ship, and as a TEACHER it is handed the measured
   * error and asked only for the increment that cancels it. `deployed.stack` is not touched
   * outside the teaching drive, so what is recovered here can never become a controller.
   */
  const layersOf = () => {
    let st = auto.stack;
    if (!(st && st.layers && st.layers.length)) {
      const b = auto.built && auto.built.stacks;
      if (b && b.length) { st = b[b.length - 1]; if (!auto.stack) auto.stack = st; }
    }
    return { st, layers: (st && st.layers) || [] };
  };
  return {
    /**
     * Score this program under a correction, and return the error record the teacher inverts.
     *
     * IT DELIBERATELY OVERRIDES THE HARNESS'S OWN `run`, AND THE REASON IS A SHAPE (rule 17).
     * A plant harness's `run` returns `err` indexed `[channel][k]` — what `hff` inverts — while
     * the oracle port reads `rec` indexed `[k][channel]`. They are different objects, not two
     * names for one, and handing `_iteratePolicy` the first would index a Float64Array by a
     * channel number and read `undefined` at every step without throwing. So this spread must sit
     * AFTER the harness's own `run` in the descriptor, which is where a reader should check first
     * if a parametric run ever reports an increment of exactly zero.
     *
     * BOTH shapes come back, `err` transposed from `rec`, so no consumer can be broken by the
     * override — the in-sample column in `reportDistil` calls the same `run`. What `err` here does
     * NOT carry is the TAVG multi-lap average, because that is a property of the LAP-INDEXED
     * teacher and this route has no lap to average over; under `parametric` that teacher does not
     * run, and the two knobs are armed together for exactly this reason.
     */
    run: async (corr) => {
      const r = await drive({ pre: materialise(corr), trace: true });
      const err = r.rec ? Array.from({ length: nc }, (_, c) => {
        const a = new Float64Array(L);
        for (let k = 0; k < L; k++) a[k] = r.rec[k] ? (r.rec[k][c] || 0) : 0;
        return a;
      }) : null;
      return { score: r.score, rec: r.rec, err };
    },
    /**
     * One increment. `rec` is the error record from the matching `run`, and the oracle port reads
     * it at this decision's step PLUS the lead in PILOT SAMPLES times the cascade's raw stride —
     * the units conversion that made the arm's first oracle steer the machine wrong in both signs
     * (plan §52.8), and the reason this is not re-derived here.
     */
    teach: async (corr, rec) => {
      const { st, layers } = layersOf();
      const uOut = zero();
      /**
       * NO CASCADE IS NOT A ZERO INCREMENT, IT IS A MISCONFIGURATION, AND IT MUST SAY SO (rule 25).
       *
       * The first version returned `uOut` all zeros here, and on the cold mill — which runs
       * `depth: 0`, because its shipped teacher is `hff` and a cascade would be commissioned only
       * to be replaced — that produced a target of zeros, a fit that refused, and a report reading
       * `teacher 1.000x, rows 0, DROPPED, engine parametric, passes 0`. Every one of those lines
       * is what a teacher that RAN AND FOUND NOTHING looks like, and what had actually happened is
       * that the increment generator was never built.
       *
       * That is the §90.2 coupling measured rather than assumed: the parametric engine iterates a
       * POLICY, but the thing that produces each increment is the PILOT CASCADE, so a plant cannot
       * have the lap-free teacher without commissioning one. A caller arming `parametric` must
       * also ask for `depth >= 1`.
       */
      if (!layers.length) {
        throw new Error('oracleTeach: no cascade layer exists to take an increment from — the '
          + 'parametric teacher needs `depth >= 1` commissioned, even though the cascade itself '
          + 'never ships (plan §90.2). Arming `distil.parametric` alone leaves nothing to iterate.');
      }
      const S = st.sample || 1;
      let kNow = 0;
      const or = rec ? (c, leadSamp) => rec[(((kNow + leadSamp * S) % L) + L) % L][c] : null;
      for (const p of layers) p.oracleF0 = or;
      const wasDeployed = auto.deployed.stack;
      auto.deployed.stack = layers.length;
      try {
        await drive({ pre: materialise(corr), active: true, uOut, trace: true, onStep: (k) => { kNow = k; } });
      } finally { for (const p of layers) p.oracleF0 = null; auto.deployed.stack = wasDeployed; }
      return { uOut };
    },
  };
}

export { oracleConverge, oracleTeach };
