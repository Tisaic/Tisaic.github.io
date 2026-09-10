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
  const row = featureRow(rec, look, state), g = coverageGain(rec, speed), cap = rec.uMax;
  for (let c = 0; c < n; c++) {
    const W = rec.W[c];
    let s = 0;
    for (let j = 0; j < row.length; j++) s += W[j] * row[j];
    s *= g;
    out[c] = s > cap ? cap : s < -cap ? -cap : s;
  }
  return out;
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
