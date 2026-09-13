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
 * WHAT IS NOT CARRIED ACROSS FROM THE ARM, AND IS SAID RATHER THAN HIDDEN: the arm band-limits
 * each increment (`qFilter`) before adding it to the prefix. That filter is expressed in the arm's
 * own harmonic basis and there is no plant-agnostic form of it here, so this takes the increment
 * raw. If a plant's prefix picks up high-frequency content the machine cannot follow, that is the
 * first thing to look at and the monotone gate is what keeps it from shipping.
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
 * @param {boolean} [o.debug]
 */
function oracleConverge({ auto, lap, nc, drive, passes = 4, debug = false }) {
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

      for (let c = 0; c < nc; c++) for (let k = 0; k < L; k++) pre[c][k] += uOut[c][k];
      done = pass + 1;
      let pk = 0;
      for (let c = 0; c < nc; c++) for (let k = 0; k < L; k++) pk = Math.max(pk, Math.abs(uOut[c][k]));
      if (dbg) dbg(`pass ${pass}: scored ${on.score.toExponential(4)} (best ${best.toExponential(4)}), uPk ${pk.toExponential(3)}`);
      if (on.score < best) { best = on.score; bestPre = pre.map((a) => Float64Array.from(a)); rec = on.rec; }
      else { for (let c = 0; c < nc; c++) for (let k = 0; k < L; k++) pre[c][k] -= uOut[c][k]; break; }
    }
    const fin = bestPre || pre;
    return { base, best, passes: done,
      at: (k) => { const i = (((k % L) + L) % L); return fin.map((a) => a[i]); } };
  };
}

export { oracleConverge };
