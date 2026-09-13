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

    // The stack's layers carry the port. A host whose cascade never built has nothing to arm,
    // and says so rather than silently converging nothing (rule 25).
    const layers = (auto.stack && auto.stack.layers) || [];
    if (!layers.length) return { base, best: base, passes: 0, at: () => new Array(nc).fill(0),
      note: 'no cascade layer was built, so there is no pilot to iterate' };
    const S = auto.stack.sample || 1;

    for (let pass = 0; pass < passes; pass++) {
      const uOut = Array.from({ length: nc }, () => new Float64Array(L));
      // THE ORACLE: the measured truth at this decision's step plus the lead, on the PILOT's own
      // grid. `leadSamp` is in pilot samples and the record is per raw step, so the conversion is
      // `leadSamp * S` — the units error this project keeps paying for, and the one that made the
      // arm's first oracle steer the machine wrong in both signs (plan §52.8).
      let kNow = 0;
      const or = rec ? (c, leadSamp) => rec[(((kNow + leadSamp * S) % L) + L) % L][c] : null;
      for (const p of layers) p.oracleF0 = or;
      let on;
      try {
        on = await drive({ pre, active: true, uOut, trace: true, onStep: (k) => { kNow = k; } });
      } finally { for (const p of layers) p.oracleF0 = null; }

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
    return { base, best, passes: done,
      at: (k) => { const i = (((k % L) + L) % L); return fin.map((a) => a[i]); } };
  };
}

export { oracleConverge };
