/**
 * THE DEPLOYED CONTROLLER, AND NOTHING ELSE — the artefact a machine actually receives.
 *
 * `distil.js` states in prose that the deployed object is "one weight vector per channel; no QP,
 * no forecast bank, no tracker, no lap index and no per-plant constant". Nothing checked it. That
 * is rule 30's failure mode — a page describing its own behaviour in a second place — and the
 * second place drifts. This file makes the claim FALSIFIABLE BY CONSTRUCTION: it is a complete
 * reimplementation of the deploy path from the STORED RECORD alone, it imports nothing, and
 * `test/pilot/deploy.test.mjs` asserts it reproduces `DistilPolicy.actLook` to the last bit over
 * random windows. If a dependency ever creeps onto the deploy path, that check goes red.
 *
 * IT IS ALSO THE DELIVERABLE. A customer does not receive this repository; they receive a
 * commissioned artefact and an implementation note. The artefact is `DistilPolicy.toJSON()`, and
 * this is the note: a dot product, a smoothstep and a clamp, over a window of the COMMANDED
 * reference. It is ~60 lines because that is genuinely all the machine runs — the 18,000-line
 * closure the bench page loads is a plant simulator and a commissioning ladder, and neither
 * exists on an installation.
 *
 * WHAT THE MACHINE MUST SUPPLY. One closure, `look(o)` — the commanded reference `o` DECISION
 * SAMPLES from now, negative for the past, as an array of `refDim` numbers. Any machine that can
 * look ahead in its own program already has it. `o` is in the policy's own sample units, and the
 * conversion from raw servo steps is the caller's: getting that wrong is the units error this
 * project has paid for three times (plan §51.5, §52.8, §52.33), so `strideOf` states it.
 *
 * WHAT IT DOES NOT NEED, WHICH IS THE POINT: no solver, no ridge, no covariance, no plant model,
 * no lap counter, no truth, no clock. It is stateless between decisions.
 */

/** Smoothstep. The one nonlinearity, used so the coverage guard cannot switch discontinuously. */
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * The coverage guard's gain: 1 inside the commanded-speed span the fit saw, fading to 0 over
 * `coverageFade` of that span beyond it. It FADES rather than extrapolating, which is what makes
 * an out-of-envelope program read ~1.0x instead of being harmed (measured: plan §52.40, feeds
 * above the trained span read 1.17-1.19x with the correction faded to nothing).
 */
export function coverageGain(rec, speed) {
  const sp = rec.report && rec.report.speedSpan;
  if (speed == null || !sp) return 1;
  const lo = sp[0], hi = sp[1], m = Math.max(1e-12, (hi - lo) * rec.coverageFade);
  if (speed >= lo && speed <= hi) return 1;
  return speed < lo ? smooth((speed - (lo - m)) / m) : smooth(((hi + m) - speed) / m);
}

/**
 * The feature row from a relative reader. Every term is a difference against the window's centre
 * except that centre itself, the direction-of-travel block and the bias — so the row is invariant
 * to where the program sits in space, which is why it transfers across programs.
 *
 * @param {object} rec       what `DistilPolicy.toJSON()` produced
 * @param {(o:number)=>number[]} look  commanded reference `o` samples from now
 * @param {number[]|null} state        only if the record carries `stateDim`
 */
export function featureRow(rec, look, state = null) {
  const D = rec.refDim, q0 = look(0), r = [];
  for (let d = 0; d < D; d++) r.push(q0[d]);
  for (const o of rec.offsets) {
    if (o === 0) continue;
    const q = look(o);
    for (let d = 0; d < D; d++) r.push(q[d] - q0[d]);
  }
  for (const o of rec.signOffsets || []) {
    const a = look(o - 1), b = look(o + 1);
    for (let d = 0; d < D; d++) { const v = (b[d] - a[d]) * 0.5; r.push(Math.sign(v), Math.abs(v)); }
  }
  if (rec.schedule) {
    const n0 = r.length, d1 = q0[0] - rec.scheduleCentre[0], d2 = q0[1] - rec.scheduleCentre[1];
    for (let j = 0; j < n0; j++) r.push(r[j] * d1);
    for (let j = 0; j < n0; j++) r.push(r[j] * d2);
  }
  if (rec.stateDim) {
    if (!state || state.length !== rec.stateDim) throw new Error(`deploy: record carries a ${rec.stateDim}-term state and none was given`);
    for (let j = 0; j < rec.stateDim; j++) r.push(state[j]);
  }
  r.push(1);
  if (rec.xScale) for (let j = 0; j < r.length; j++) r[j] /= rec.xScale[j];
  return r;
}

/**
 * HOW BENT THE WINDOW IS, AGAINST ITS OWN TYPICAL BEND (plan §78).
 *
 * A window is a SAMPLED SMOOTH TRAJECTORY, so every interior tap lies near the line through its two
 * neighbours, to within the plant's curvature times the gap. One corrupted tap breaks that and
 * nothing else does. Returned as the WORST interior tap's bend over the MEDIAN tap's — a RATIO, so
 * the plant's own curvature divides out and no constant is carried across plants.
 *
 * WHY THIS SHAPE AND NOT A SPEED CHECK. The obvious guard compares the window's implied speed
 * against the speed the host declares, and it was built and measured first (rule 1). It catches a
 * FROZEN input perfectly (ratio exactly 0) and is blind to everything else — and a frozen input
 * moves the applied correction by only 5.4%, while a single corrupted tap moves it by **106% of its
 * own rms and past the cap**. The cheap detector caught the least harmful fault and missed the
 * worst, which is rule 19: it was being judged on whether it fires rather than on whether it fires
 * on what matters.
 *
 * WHAT IT CANNOT SEE, BY CONSTRUCTION: a window that is VALID but WRONG — a stale program, an
 * off-by-one lap phase, a window read backwards. Those are smooth, so no smoothness test finds
 * them, and detecting them needs a second source of truth this object does not have. Measured, they
 * move the correction by 0.2%, 9.9-35.7% and 10.7%.
 */
export function windowBend(rec, look) {
  const D = rec.refDim, offs = rec.offsets;
  if (offs.length < 3) return 0;
  const res = [];
  for (let i = 1; i < offs.length - 1; i++) {
    const oa = offs[i - 1], ob = offs[i], oc = offs[i + 1];
    const a = look(oa), b = look(ob), c = look(oc);
    const t = (ob - oa) / (oc - oa);
    let s = 0;
    for (let d = 0; d < D; d++) { const lin = a[d] + t * (c[d] - a[d]); s += (b[d] - lin) ** 2; }
    // Normalised by the span it is measured over, so a wide gap's larger bend does not dominate a
    // geometric offset ladder.
    res.push(Math.sqrt(s) / (oc - oa));
  }
  res.sort((x, y) => x - y);
  const med = res[res.length >> 1];
  if (!(med > 0)) return res[res.length - 1] > 0 ? Infinity : 0;
  return res[res.length - 1] / med;
}

/**
 * ONE DECISION. Returns the correction per channel, already capped at the engineer's authority.
 *
 * @param {object} rec    the commissioned record
 * @param {(o:number)=>number[]} look  the machine's own look-ahead closure
 * @param {number|null} speed          commanded speed, for the coverage guard; null disables it
 * @param {number[]|null} state        only if the record carries `stateDim`
 */
export function decide(rec, look, speed = null, state = null) {
  const n = rec.channels, out = new Array(n);
  if (!rec.W || !(rec.report && rec.report.deploy)) return out.fill(0);
  // ---- A WINDOW WITH A CORRUPTED TAP IS REFUSED, WHERE THE RECORD SAYS WHAT ITS OWN BEND IS.
  //
  // The threshold is not a constant anyone picked: `report.bendMax` is the WORST ratio the
  // COMMISSIONING itself observed over its own rows, stored exactly as the coverage guard stores
  // the speed span it saw. A record without the field — anything commissioned before this existed
  // — skips the check and is byte-identical.
  //
  // THE MARGIN IS NOT A TUNED NUMBER AND THE MEASUREMENT SAYS HOW MUCH ROOM IT HAS. A first
  // version of this comment claimed the two populations were three decades apart, on figures from
  // a scratch record with different offsets; on the reference record the band is narrower and it is
  // asymmetric, which is the useful part. `artefact.test.mjs` sweeps it: **zero false refusals at
  // EVERY margin from 1 to 64, in sample AND on a program the fit never saw**, while corrupted-tap
  // detection reads 200/200 at margins 1-4, 198 at 8, 194 at 16, then falls to 164 and 113. So the
  // risk of arming it is measured at zero and the cost of a margin set too high is missed
  // detections; 8 sits inside the band with room on both sides.
  //
  // IT DOUBLES THE DEPLOYED ARITHMETIC — about 104 MAC against the act path's 102 on that record —
  // and that is stated rather than folded in, because "a dot product and a clamp" is this object's
  // whole claim. At 206 MAC it is still 2% of a 1 ms scan's 10% budget.
  //
  // Zero is the correct action and not a sentinel (rule 26): apply no correction, i.e. fall back
  // to the machine below, exactly as a non-finite window and an out-of-coverage speed do.
  const bm = rec.report && rec.report.bendMax;
  if (bm > 0 && windowBend(rec, look) > bm * (rec.bendMargin || 8)) return out.fill(0);
  const row = featureRow(rec, look, state), g = coverageGain(rec, speed), cap = rec.uMax;
  for (let c = 0; c < n; c++) {
    const W = rec.W[c];
    let s = 0;
    for (let j = 0; j < row.length; j++) s += W[j] * row[j];
    s *= g;
    // ---- A NON-FINITE WINDOW MUST NOT REACH THE MACHINE (plan §77.4).
    //
    // Every comparison with NaN is FALSE, so a clamp written as `s > cap ? cap : s < -cap ? -cap :
    // s` passes NaN straight through — rule 55's exact class ("0/0 is NaN, which passes every
    // bounds check"), on the deploy path, found by asking what happens when the machine hands this
    // object a CORRUPTED look-ahead rather than merely an unusual one. Measured before the fix: a
    // single NaN at one offset produced a NaN correction; an Inf clamped correctly, because
    // `Infinity > cap` is true. So the bounded-output check that did not include non-finite inputs
    // was measuring the easy half.
    //
    // ZERO IS NOT A SENTINEL HERE (rule 26). It is the genuinely correct control action: apply no
    // correction, which is what the coverage guard does outside its span, so a corrupted window
    // degrades to the CONVENTIONAL MACHINE rather than to a NaN command or a held stale value.
    out[c] = Number.isFinite(s) ? (s > cap ? cap : s < -cap ? -cap : s) : 0;
  }
  return out;
}

/**
 * WHAT AN INSTALLATION MUST LOG SO THAT ANY DECISION CAN BE RECONSTRUCTED LATER (plan §77).
 *
 * The property an engineer actually needs from a learned controller is not that they can read it
 * at a glance — they tune once and never look again — it is that when something goes wrong, an
 * investigation can establish HOW the number was computed. That is impossible if the log does not
 * contain the inputs, and it is the difference between this object and a neural network: not that
 * the weights are fewer, but that the decision is a DOT PRODUCT of a window the machine already
 * knows, so the whole computation can be replayed and attributed exactly.
 *
 * This returns the complete list of what has to be recorded per decision. It is short by
 * construction, and that is the claim: the record plus these fields determine the output to the
 * last bit, with no hidden state, no clock and no accumulated history.
 */
export function logSpec(rec) {
  const offs = new Set();
  for (const o of rec.offsets) offs.add(o);
  for (const o of rec.signOffsets || []) { offs.add(o - 1); offs.add(o + 1); }
  offs.add(0);
  return {
    // The commanded reference at these DECISION-SAMPLE offsets, `refDim` numbers each.
    lookOffsets: [...offs].sort((a, b) => a - b),
    refDim: rec.refDim,
    // The commanded speed, only because the coverage guard reads it. Null if the record has no span.
    needsSpeed: !!(rec.report && rec.report.speedSpan),
    // A state vector only if the record declares one; the shipped configuration does not.
    stateDim: rec.stateDim || 0,
    // Numbers per decision, which is what a log budget is sized from.
    numbersPerDecision: offs.size * rec.refDim + (rec.report && rec.report.speedSpan ? 1 : 0)
      + (rec.stateDim || 0),
  };
}

/**
 * ONE DECISION, FULLY ATTRIBUTED — the forensic form of `decide` (plan §77).
 *
 * Returns the same numbers `decide` returns, plus the term-by-term account of how each was
 * reached: every feature's name, the value it took, the weight it met and the product it
 * contributed. The contributions SUM to the pre-gain total exactly — asserted in
 * `test/pilot/artefact.test.mjs`, bit-exactly, because an attribution that only roughly adds up
 * is not evidence.
 *
 * It is deliberately in the DEPLOYED file and not on the fit side. An investigation happens on an
 * installation, months later, from the stored record and a log — not from this repository — so a
 * forensic tool that needed the commissioning machinery would not be available when it was wanted.
 */
export function explain(rec, look, speed = null, state = null) {
  const D = rec.refDim, names = [];
  for (let d = 0; d < D; d++) names.push({ kind: 'reference', offset: 0, dim: d });
  for (const o of rec.offsets) {
    if (o === 0) continue;
    for (let d = 0; d < D; d++) names.push({ kind: 'difference', offset: o, dim: d });
  }
  for (const o of rec.signOffsets || []) {
    for (let d = 0; d < D; d++) {
      names.push({ kind: 'direction', offset: o, dim: d });
      names.push({ kind: 'speed', offset: o, dim: d });
    }
  }
  if (rec.schedule) {
    const n0 = names.length;
    for (let j = 0; j < n0; j++) names.push({ kind: 'scheduled1', of: names[j] });
    for (let j = 0; j < n0; j++) names.push({ kind: 'scheduled2', of: names[j] });
  }
  for (let j = 0; j < (rec.stateDim || 0); j++) names.push({ kind: 'state', dim: j });
  names.push({ kind: 'bias' });

  const row = featureRow(rec, look, state);
  const g = coverageGain(rec, speed), cap = rec.uMax;
  const channels = [];
  for (let c = 0; c < rec.channels; c++) {
    const W = rec.W[c], terms = new Array(row.length);
    let raw = 0;
    for (let j = 0; j < row.length; j++) {
      const contrib = W[j] * row[j];
      // Summed in the SAME ORDER `decide` sums them, so the total is bit-identical rather than
      // merely close — floating-point addition is not associative and an attribution that
      // reordered the sum would disagree in the last bits exactly when it mattered most.
      raw += contrib;
      terms[j] = { ...names[j], value: row[j], weight: W[j], contribution: contrib };
    }
    const gained = raw * g;
    const u = gained > cap ? cap : gained < -cap ? -cap : gained;
    channels.push({ u, raw, gained, clamped: u !== gained, terms });
  }
  return { channels, coverage: g, cap, row };
}

/**
 * How often a decision is due, in the machine's own servo steps, and how many MAC it costs.
 * The record's `stride` is in DECISION samples and the caller owns the conversion to raw steps —
 * stated here because a per-row cost quoted against a per-scan budget is the units error this
 * project keeps paying for (plan §52.38 measures the peak and the average separately for it).
 */
export function strideOf(rec) { return rec.stride || 1; }

/** MAC per decision, from the record alone — the number a scan budget is checked against. */
export function macPerDecision(rec) {
  const nF = rec.W[0].length;
  const rowOps = rec.refDim * (rec.offsets.length - 1) + (rec.signOffsets || []).length * rec.refDim * 2;
  return rec.channels * nF + rowOps + (rec.xScale ? nF : 0);
}
