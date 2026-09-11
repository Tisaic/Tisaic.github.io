/**
 * @file THE REAL FLEXIBLE ROBOT ARM — DaISy 96-009, a real arm on an electrical motor,
 * reaction torque of the structure on the ground against the acceleration of the arm.
 *
 * THIS IS THE REAL-ARM DATUM, AND IT IS NOT THE ONE THAT WAS ASKED FOR. The KUKA KR300
 * Industrial Robot benchmark WAS obtained — supplied by the owner after every host serving it
 * was refused — and it was then measured and DELETED (plan §55.8-§55.12): its records were
 * 222 MB, 89% of this repository, and four sections established that they identify the robot's
 * STATICS while a forward simulation needs its DYNAMICS. So this record is still one link,
 * 1024 samples and a single multisine against six axes, and the gap is still stated rather
 * than papered over — but it is open because the six-axis record does not work, not because
 * it could not be reached.
 *
 * WHAT IT BUYS ANYWAY IS THE THING THIS PROJECT MOST NEEDED: a structural resonance
 * MEASURED ON REAL HARDWARE. Every arm number in this repository is quoted on a lattice
 * simulator whose ring `test/pilot/modes.mjs` measures decaying 5.6x per cycle — moderately
 * damped, a memory of 2.3 cycles. This arm's identified modes sit near zeta 0.005, decaying
 * about 1.03x per cycle: roughly fifty times lighter, and the regime §52.36 called hopeless
 * for an FIR window before measuring the simulator and softening the claim. So this plant is
 * a falsifier for a conclusion this file drew on a simulator.
 *
 * THE DAMPING IS A BOUND, NOT A MEASUREMENT, AND THE INSTRUMENT SAYS SO (rule 17). The
 * record is 1024 samples, so its frequency resolution is one bin and the dominant output
 * peak spans two, which means a Q above about 65 is not resolvable from this data at all —
 * and the fit reports 92. Worse, the two modes come back with Q equal to within 1%: two
 * independent physical modes agreeing that closely is a signature of the FIT sitting near
 * its own stability edge, not of the plant. What survives both caveats is the direction and
 * the order of magnitude, not the figure.
 */
import { readCols, identify, makePlant, simulate } from './realdata/sysid.mjs';

const R = (k) => Array.from({ length: k }, (_, i) => i + 1);

// ------------------------------------------------------- the plant, FROM the record
// Re-identified at module load rather than baked as constants: a description generated from
// the thing cannot drift from it (rule 30), and 1024 rows of ridge costs microseconds.
const [U_REC, Y_REC] = readCols('daisy-robot-arm.dat');
const HALF = U_REC.length >> 1;

/**
 * THE VALIDATION, AND ITS WEAKNESS STATED BEFORE ITS NUMBER (rule 27). The order is chosen
 * by FREE-RUN simulation on the second half, which the fit never saw — but the input over
 * that half is the first half's NEGATION to r = -0.996, because this is one period of an
 * ODD multisine. So the held-out cut tests that the model holds a trajectory under its own
 * output for 512 steps, and tests independent measurement noise; it does NOT test
 * extrapolation to unexcited frequencies, and for a LINEAR model the input novelty is nil.
 * That is the most this record can support, and it is less than the cascaded tanks' cut
 * supports, where the benchmark ships two independent excitations.
 */
const IDENT = identify({
  uEst: U_REC.slice(0, HALF), yEst: Y_REC.slice(0, HALF),
  uVal: U_REC.slice(HALF), yVal: Y_REC.slice(HALF),
  nas: R(12), nbs: R(12), nks: [0, 1, 2], lams: [1e-10, 1e-8, 1e-6],
});
const MODEL = IDENT.model;
const K0 = Math.max(MODEL.na, MODEL.nb + MODEL.nk - 1);

/** |H(e^{jw})| of the identified model — used to SIZE the program and to state the modes. */
function mag(w) {
  const a = MODEL.th.slice(0, MODEL.na), b = MODEL.th.slice(MODEL.na, MODEL.na + MODEL.nb);
  let ar = 1, ai = 0;
  for (let i = 1; i <= MODEL.na; i++) { ar -= a[i - 1] * Math.cos(i * w); ai += a[i - 1] * Math.sin(i * w); }
  let br = 0, bi = 0;
  for (let j = 0; j < MODEL.nb; j++) { const d = MODEL.nk + j; br += b[j] * Math.cos(d * w); bi -= b[j] * Math.sin(d * w); }
  return Math.hypot(br, bi) / Math.hypot(ar, ai);
}
/** Position responds as the acceleration twice integrated: |H| / |1 - e^{-jw}|^2. */
const magPos = (w) => mag(w) / (2 * Math.sin(w / 2)) ** 2;

/**
 * THE VALIDATION IN THE DOMAIN THE PLANT IS ACTUALLY CONTROLLED IN, which is not the domain
 * it was measured in, and the two differ by more than an order of magnitude (rule 19 —
 * match the metric's support to the claim's). The record is an ACCELERATION and the free
 * run reproduces it to 2.83% NRMSE; the plant below is controlled in POSITION, which is
 * that acceleration twice integrated, and double integration amplifies exactly the low
 * frequencies an odd multisine pins down worst. In position the same model, on the same
 * held-out cut, reads 36.45%. THAT is this plant's validation figure and it is the one
 * quoted beside every control result it produces. Reporting the 2.83% instead would be
 * quoting an instrument's accuracy about a quantity nobody controls.
 */
const VALID = (() => {
  const uV = U_REC.slice(HALF), yV = Y_REC.slice(HALF);
  const s = simulate(MODEL, uV, yV, HALF);
  const i2 = (a) => { let v = 0, x = 0; const X = new Float64Array(a.length);
    for (let k = K0; k < a.length; k++) { v += a[k]; x += v; X[k] = x; } return X; };
  const rms = (a, b) => { let e = 0, n = 0; for (let k = K0; k < a.length; k++) { e += (a[k] - b[k]) ** 2; n++; } return Math.sqrt(e / n); };
  const std = (a) => { let m = 0, n = 0; for (let k = K0; k < a.length; k++) { m += a[k]; n++; } m /= n;
    let q = 0; for (let k = K0; k < a.length; k++) q += (a[k] - m) ** 2; return Math.sqrt(q / n); };
  const Xt = i2(yV), Xs = i2(s);
  return { accRms: rms(yV, s), accPct: 100 * rms(yV, s) / std(yV),
    posRms: rms(Xt, Xs), posPct: 100 * rms(Xt, Xs) / std(Xt) };
})();

// THE AUTHORITY IS THE MACHINE'S OWN, not a number chosen to suit a result: the record was
// driven over +/-0.409 of reaction torque and that is the whole of what is known to be a
// safe excursion on this structure. The loop gets the full range; the CORRECTION gets a
// tenth of it, which is this project's usual split between a loop and what rides on it.
let TMAX = 0;
for (const v of U_REC) TMAX = Math.max(TMAX, Math.abs(v));
const UCAP = 0.10 * TMAX;
const JEFF = 1 / mag(1e-7);                  // rigid-body inertia, the DC gain's reciprocal

// ------------------------------------------------------------------------ the program
// A SMOOTHED SQUARE in commanded POSITION — the hardest shape the band admits, on the
// owner's standing rule that the benchmark which cannot flatter is the one to measure on.
const LAP = 512, EDGE = 160;
const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));
function shape(k) {
  const p = ((k % LAP) + LAP) % LAP, h = LAP >> 1;
  const inHi = p < h;
  const t = (inHi ? p : p - h) / EDGE;
  const s = t >= 1 ? 1 : quintic(t);
  return inHi ? -1 + 2 * s : 1 - 2 * s;
}

/**
 * THE AMPLITUDE IS DERIVED FROM THE PLANT, AND THE FIRST VERSION WAS RULE 41b EXACTLY.
 * It was sized from the RECORD'S OWN acceleration range (+/-0.789) — and that range is a
 * RESONANT response, reached where |H| = 36.7, not where a program lives. At the program's
 * own frequencies |H| is 0.108, so the first program demanded ELEVEN TIMES the torque the
 * machine has. The symptom was easy to misread as a plant property: a loop swept over 88
 * gain cells could not beat DOING NOTHING at any of them, because the reference was simply
 * unreachable and the error was the reference.
 *
 * So the demand is computed from the identified response — the sum over the program's own
 * harmonics of |R_m| / |H_pos(w_m)| — and the amplitude is a stated fraction of what the
 * torque cap delivers. No literal, and it re-derives itself if the fit ever changes.
 */
const TORQUE_PER_AMP = (() => {
  let need = 0;
  for (let m = 1; m < LAP / 2; m++) {
    let re = 0, im = 0;
    for (let k = 0; k < LAP; k++) { const A = -2 * Math.PI * m * k / LAP; re += shape(k) * Math.cos(A); im += shape(k) * Math.sin(A); }
    const M = Math.hypot(re, im) * 2 / LAP;
    if (M < 1e-4) continue;
    need += M / magPos(2 * Math.PI * m / LAP);
  }
  return need;
})();
const HEADROOM = 0.30;
const AMP = HEADROOM * TMAX / TORQUE_PER_AMP;
const refAtStep = (k) => [AMP * shape(k)];
// LONG ENOUGH THAT THE DRIVER'S 5% SCORING SKIP CLEARS THE RE-SETTLE. The machine reaches
// its final per-lap error 13 laps after anything changes, and a correction is a change, so a
// run must discard at least that much: 5% of 280 laps is 14. Sized from the measurement, not
// from a round number.
const PROG = LAP * 280;

// --------------------------------------------------------- the CONVENTIONAL machine
/**
 * THE DENOMINATOR IS A RIGID-BODY FEEDFORWARD PLUS A PD, WHICH IS WHAT A REAL SERVO DOES
 * AND WHAT THIS PROJECT'S OWN LATTICE ARM IS ALREADY MEASURED AGAINST. `RobotComp` is a
 * lumped COMPLIANCE model identified at four held poses — a crude model of a rich plant —
 * and the learned layers earn their keep on what it leaves. The analogue here is the one
 * number a rigid model knows: the inertia, which is the identified DC gain's reciprocal.
 * The feedforward is `a_ref / G_DC` and the flexibility is what it cannot see.
 *
 * A PD ALONE CANNOT DO IT, AND THE MEASUREMENT IS WHY THIS BASELINE EXISTS. Swept over 192
 * gain cells with no feedforward, the best loop reads 1.2x over doing nothing and the
 * surface is flat and meaningless — kp 0.01 and kp 100 score alike. The plant's resonant
 * peak is 336x its DC gain, so a loop with enough gain to TRACK has 336 times that at a
 * mode damped at zeta ~ 0.005: the designed second-order gains saturate the drive 93% of the
 * time, because the derivative term feeds the ring straight back. That is not a defect of
 * the sweep; it is the reason industry uses feedforward on flexible structures, and it is
 * the same no-timescale-separation trap §52.28 found on the lattice bench cell — there at a
 * factor of 1.9, here at 336.
 *
 * FEEDFORWARD ALONE FAILS TOO, in the other direction: with no loop the double integrator
 * drifts on the fit's own -5.0e-6 constant and the run reads 510 against a reference of 13.7.
 * Both halves are needed, which is why both are here (rule 9).
 *
 * The gains are NOT carried from anywhere. `sweepLoop` derives them on this plant over a
 * grid whose best cell is checked to be INTERIOR, and rule 42 takes the cheapest within 5%
 * of the best measured score. A factor quoted over a loop nobody derived is a joint property
 * of the controller and that loop — §52.32, where a cart-pole read 9.8x on a loop that was
 * itself 3.5x off its own optimum, and the headline turned out to be the loop.
 */
const G_DC = (() => {
  let sa = 0; for (let i = 0; i < MODEL.na; i++) sa += MODEL.th[i];
  let sb = 0; for (let j = 0; j < MODEL.nb; j++) sb += MODEL.th[MODEL.na + j];
  return sb / (1 - sa);                      // NEGATIVE: positive reaction torque, negative move
})();
const LOOP = { kp: +(process.env.RARM_KP || 0.02), kd: +(process.env.RARM_KD || 0.003) };

// HOW LONG THIS MACHINE TAKES TO SETTLE, AND WHY IT IS NOT A DETAIL (rule 12, for the
// SEVENTH time in this project). The program's 30th harmonic has period 17.07 samples and
// the mode sits at 17.2 — 0.8% away, INSIDE a resonance whose half-power bandwidth is 2*zeta
// = 1.1%. So a periodic program pumps the mode, and the error LOCKS IN over hundreds of laps
// rather than reaching its value in one.
//
// That is not a curiosity: the first loop sweep here scored 20 laps and chose kd = 0.01,
// which reads 1.06 at lap 20 and 12.36 once settled — the gain that locks ONTO the
// resonance looked best because the measurement stopped before the ring had built. Re-swept
// on laps 400-460 the same grid picks kd = 0.003 at 0.185, which is SIXTY-SEVEN TIMES
// better, at zero drive saturation, and interior to the grid in both gains. Every number on
// this plant is therefore taken after a settle whose length was MEASURED, not assumed: under
// the chosen loop the per-lap rms is inside 2% of its final value from lap 13 and constant
// to four figures thereafter.
const SETTLE_LAPS = 20;

// THE FEEDFORWARD READS THE REFERENCE THE DRIVE IS ACTUALLY HANDED, by second difference
// inside the machine — which is EMPS' own convention and it is load-bearing: a correction
// injected into the reference is then fed forward exactly the way the program is, so the
// pilot commissions on the machine it deploys on (rule 34). Differentiating the commanded
// signal is what a real interpolator does.

/**
 * One machine: the identified acceleration plant, twice integrated to position, with the
 * rigid feedforward and the PD closed around it. `makeMachine().step(ref)` advances one
 * sample and returns the position.
 */
function makeMachine(loop = LOOP, { warm = true } = {}) {
  const p = makePlant(MODEL, new Array(16).fill(0), new Array(16).fill(0));
  let v = 0, x = 0, tq = 0, acc = 0, r1 = refAtStep(0)[0], r2 = refAtStep(0)[0];
  const M = {
    get x() { return x; }, get v() { return v; }, get acc() { return acc; },
    get torque() { return tq; }, get saturated() { return Math.abs(tq) >= TMAX * 0.999; },
    /** `ref` is the commanded position — the program plus whatever correction is riding on it. */
    step(ref) {
      const aff = ref - 2 * r1 + r2;
      r2 = r1; r1 = ref;
      const un = aff / G_DC - loop.kp * (ref - x) + loop.kd * v;
      tq = Math.max(-TMAX, Math.min(TMAX, un));
      acc = p.step(tq);
      v += acc; x += v;
      return x;
    },
  };
  // EVERY RUN STARTS SETTLED, the way the quadruple tank's `fresh()` pre-rolls 30,000 steps
  // before handing the plant over. Without it lap 0 is an 8.6-rms start-up transient against
  // a settled 0.185, and a scoring window that straddles it describes the transient
  // (rule 13). A correction still needs its own re-settle, which is why the program below is
  // long enough that the driver's 5% skip clears it.
  if (warm) for (let k = 0; k < SETTLE_LAPS * LAP; k++) M.step(refAtStep(k)[0]);
  return M;
}

/**
 * THE LOOP SWEEP, kept in the rig so the constants above can be re-derived rather than
 * trusted (rule 31). Scores the CONVENTIONAL machine — no correction — on the program, so it
 * measures the loop and nothing else. `ff: false` reproduces the measurement that refused a
 * PD-only baseline, so both halves of that claim stay runnable.
 */
function sweepLoop(kps, kds, { ff = true, n = PROG } = {}) {
  const out = [];
  for (const kp of kps) for (const kd of kds) {
    const m = makeMachine({ kp, kd });
    let ss = 0, c = 0, sat = 0, blown = false;
    for (let k = 1; k < n; k++) {
      const r = refAtStep(k)[0];
      const x = m.step(r);
      if (m.saturated) sat++;
      if (!isFinite(x) || Math.abs(x) > 1e4 * AMP) { blown = true; break; }
      if (k >= n * 0.05) { ss += (x - r) ** 2; c++; }
    }
    out.push({ kp, kd, sat: 100 * sat / n, rms: blown ? Infinity : Math.sqrt(ss / c) });
  }
  return out.sort((a, b) => a.rms - b.rms);
}

/**
 * THE CORRECTION'S AUTHORITY, DERIVED FROM THE ERROR IT EXISTS TO REMOVE rather than picked.
 * Three times the conventional machine's own tracking rms: enough to cancel that error
 * outright with margin, and not enough to be a second actuator. A cap chosen any other way
 * is a constant carried from a plant that is not this one (rule 31).
 */
const CONV_RMS = (() => {
  const m = makeMachine();
  let ss = 0, c = 0;
  for (let k = 1; k < PROG; k++) {
    const r = refAtStep(k)[0], x = m.step(r);
    if (k >= PROG * 0.05) { ss += (x - r) ** 2; c++; }
  }
  return Math.sqrt(ss / c);
})();
const UCORR = 3 * CONV_RMS;

/** Doing nothing — the reference's own rms, which is the error of a machine that never moves. */
const DO_NOTHING = (() => {
  let ss = 0, c = 0;
  for (let k = Math.floor(PROG * 0.05); k < PROG; k++) { ss += refAtStep(k)[0] ** 2; c++; }
  return Math.sqrt(ss / c);
})();

export { IDENT, MODEL, VALID, K0, U_REC, Y_REC, HALF, TMAX, UCAP, UCORR, CONV_RMS, JEFF,
  G_DC, mag, magPos, LAP, EDGE, AMP, TORQUE_PER_AMP, HEADROOM, PROG, refAtStep, shape,
  makeMachine, makePlant, sweepLoop, LOOP, DO_NOTHING };
