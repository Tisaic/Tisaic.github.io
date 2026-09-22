/**
 * @file THE MOST ORDINARY PLANT IN THIS PROJECT — a single FOPDT temperature loop under a PID
 * tuned by a published rule, with the actuator nonlinearity a real loop actually has.
 *
 * WHY IT EXISTS. Every plant here is either exotic (a lattice arm, a cart-pole), a MIMO
 * textbook case (Wood-Berry), or a process plant driven OPEN LOOP from a calibration curve
 * (the barrel, the exchanger). None of them is the thing a controls engineer meets every day:
 * one PV, one MV, one PID, a setpoint that moves. This is a SANITY CHECK on the machinery
 * before any of it is translated to ST — the question is not whether the factor is large but
 * whether the block does the right thing on a case whose answer everyone already knows.
 *
 * ------------------------------------------------------------------ the two constraints
 *
 * 1. IT SEQUENCES SETPOINTS, AND THAT IS NOT A CONVENIENCE (plan §105). The deployed object
 *    reads a WINDOW OF THE COMMANDED REFERENCE. On a regulator holding one setpoint that
 *    window is identical at every k, so the map emits ONE NUMBER for the whole run whatever
 *    the fit found — a representational impossibility rather than a poor fit, which the cold
 *    mill demonstrates by reading a correction spread of exactly 0.0e+0 over 20,000 steps at
 *    1.000x with a perfectly good held-out R² of 0.919. So a fixed-setpoint loop is the one
 *    case this object provably cannot act on, and a "standard PID sanity check" built as one
 *    would read 1.000x for a reason that has nothing to do with whether the method works.
 *    What is built here is the askable half and also the commoner one: a loop whose setpoint
 *    moves through a schedule.
 *
 * 2. THE VALVE IS NONLINEAR, AND WITHOUT THAT THE NUMBER MEASURES THE CONVENTIONAL RUNG'S OWN
 *    HYPOTHESIS CLASS (plan §55). `classic.js` fits `[a, v, sign v, 1]`; on a LINEAR plant the
 *    inversion is exact and the factor says nothing about the machine. This project has paid
 *    for that twice and measured the collapse both times — the real cascaded tanks read 2012x
 *    linear against 6.5x with their documented OVERFLOW restored, and the real exchanger 1364x
 *    against 89.8x with the counterflow relation in the fit. So `MODEL_LIN` is built beside
 *    `MODEL` as the MATCHED CONTROL (rule 20): whatever the learned object is worth here is
 *    the gap between the two rows, and if the linear plant delivers the same factor then the
 *    number is the class and not the valve.
 *
 * THE NONLINEARITY IS THE DOCUMENTED ONE AND NOT A GENERIC LIFT, exactly as the exchanger's
 * `exp(-1/u)` is the counterflow effectiveness rather than a convenient curve:
 *
 *   EQUAL-PERCENTAGE TRIM   f(x) = R^(x-1), R = 50 — the ISA characteristic most temperature
 *                           and flow valves ship with. Its installed gain varies 50-fold across
 *                           travel, which is why a PID tuned at one operating point detunes at
 *                           another, and that detuning is not something a PID can express.
 *   STICTION                the two-parameter deadband + slip-jump model (Choudhury et al.),
 *                           the single most-cited cause of poor loop performance in the process
 *                           industries. A PID answers it with a limit cycle.
 *   RATE LIMIT              5 %/s — a pneumatic valve strokes in about twenty seconds.
 *   QUANTISATION            0.02 °C on the measurement. Deterministic on purpose: every
 *                           paired-run control in this project (the ZERO control, `invert.mjs`'s
 *                           subtraction) is exact only because the rigs replay bit-for-bit, and
 *                           a noise term would make them statistical instead.
 *
 * ------------------------------------------------------------------ the loop is not a straw man
 *
 * §52.32 is the reason this rig tunes by a citable rule and then sweeps it. The cart-pole
 * deployed at 9.770x and the number turned out to be THE LOOP: re-tuned over 560 cells of its
 * own gains the same commissioning REFUSED all four times. A sanity check whose denominator is
 * a badly tuned PID proves nothing, so:
 *
 *   SIMC (Skogestad), for FOPDT:   Kc = tau / (K' · (tauc + theta))
 *                                  tauI = min(tau, 4·(tauc + theta))
 *                                  tauD = 0                     <- so it runs as PI, which is
 *                                                                  what most real loops are
 *   the published tight choice:    tauc = theta
 *
 * `K'` is the INSTALLED gain at the operating point, obtained by perturbing the actual plant
 * rather than from the model's own constant — which is what an engineer does with a bump test,
 * and which is also why the loop detunes away from that point on an equal-percentage valve.
 * `PID_TAUC` sweeps tauc so no claim here rests on one tuning.
 *
 * The controller is positional ISA-form with BACK-CALCULATION anti-windup and DERIVATIVE ON
 * MEASUREMENT (so a setpoint step does not kick the valve) — the form that ships in a B&R,
 * Siemens or Rockwell function block, not a textbook simplification.
 *
 * ------------------------------------------------------------------ where the correction goes
 *
 * THE BLOCK TRIMS THE SETPOINT AND DOES NOT REPLACE THE PID. `step` applies `u` to the
 * setpoint the loop is given, exactly as the cart-pole corrects the cart's position reference
 * into a stabiliser it does not touch. That is the retrofit an installation can actually
 * accept: the existing loop, its tuning, its alarms and its operator interface all stay, and
 * the block is a trim on the setpoint the loop already follows.
 */
import { tick } from './meter.mjs';

// ------------------------------------------------------------------------ the process
const TS = 1;                    // s per sample — a temperature loop's normal scan
const TAU = 60;                  // s, process time constant
const THETA = 20;                // s, transport dead time  (theta/tau = 0.33, an ordinary loop)
const KP = 80;                   // °C at full flow
const Y0 = 20;                   // °C with the valve shut
const DEAD = Math.round(THETA / TS);

// the valve
const RANGE = 50;                // equal-percentage rangeability, ISA standard trim
const STIC_D = 0.010;            // stiction deadband, fraction of travel
const STIC_S = 0.005;            // slip jump
const RATE = 0.05 * TS;          // 5 %/s stroke limit, per sample
const QUANT = 0.02;              // °C measurement resolution

/** Equal-percentage installed characteristic, normalised so f(1) = 1. */
const eqPct = (x) => Math.pow(RANGE, Math.max(0, Math.min(1, x)) - 1);
/** The LINEAR valve — the matched control of plan §55, and the only difference between plants. */
const linear = (x) => Math.max(0, Math.min(1, x));

const MODEL = { tag: 'nonlinear', trim: eqPct, stiction: true };
const MODEL_LIN = { tag: 'linear', trim: linear, stiction: false };

// ------------------------------------------------------------------------ the plant
/**
 * A settled loop. `step(sp)` advances ONE sample with the PID closing on `sp` and returns the
 * measured temperature. Every advance is counted by the shared meter, so `priceFrom` reports
 * this plant's commissioning in its own seconds rather than printing a 0 that reads as free
 * (rule 25) — AND THE SETTLE IS INSIDE THAT COUNT, which plan §131 found two rigs doing wrong.
 */
function makeLoop(model = MODEL, opts = {}) {
  const tauc = opts.tauc === undefined ? THETA : opts.tauc;
  const sp0 = opts.sp0 === undefined ? RECIPE[0] : opts.sp0;

  // ---- actuator state
  let x = 0.5;            // actual valve travel, fraction
  let xReq = 0.5;         // last requested travel, for the stiction band
  let moving = false;
  const buf = new Float64Array(DEAD + 1).fill(model.trim(0.5));
  let bi = 0;
  let y = Y0 + KP * model.trim(0.5);

  // ---- the actuator, all three effects in the order a valve applies them
  function actuate(cmd) {
    const want = Math.max(0, Math.min(1, cmd));
    let tgt = want;
    if (model.stiction) {
      // Two-parameter stiction, Choudhury's distinction between static and dynamic friction: a
      // STUCK stem does not move until the demand leaves the deadband and then JUMPS by the slip;
      // a MOVING stem follows the demand until it catches up, and sticks again there.
      if (!moving) {
        const gap = Math.abs(want - x);
        if (gap > STIC_D) { moving = true; tgt = x + Math.sign(want - x) * (gap - STIC_D + STIC_S); }
        else tgt = x;
      } else if (Math.abs(want - x) < 1e-9) { moving = false; tgt = x; }
      xReq = want;
    }
    const step = Math.max(-RATE, Math.min(RATE, tgt - x));   // the stroke limit
    x += step;
    x = Math.max(0, Math.min(1, x));
    return model.trim(x);
  }

  // ---- the PID, tuned on THIS plant AT THE OPERATING POINT THE SCHEDULE ACTUALLY OCCUPIES.
  // The first version tuned at travel 0.5 and the loop runs at 0.70-0.90, so `Kc` was 2.2x to
  // 4.9x too high and the "conventional machine" was a badly tuned loop — §52.32's own straw-man
  // denominator, which is the fault this rig exists to avoid rather than commit. The bump test an
  // engineer runs is at the working point, so that is what this is: the mean of the schedule.
  // What survives is the HONEST nonlinearity — the installed gain still varies 0.98 to 2.15 across
  // the schedule's own span, a 2.2x detune no fixed PID can express, and that is the thing the
  // learned object is being asked about.
  const xOp = invTrim(model, (RECIPE.reduce((a, b) => a + b, 0) / RECIPE.length - Y0) / KP);
  const Kinst = installedGain(model, xOp);
  const Kc = TAU / (Kinst * (tauc + THETA));
  const TI = Math.min(TAU, 4 * (tauc + THETA));
  const TD = opts.td === undefined ? 0 : opts.td;          // SIMC gives 0 for FOPDT: it runs PI
  const NFILT = 10;                                         // derivative filter, the usual N
  let integ = 0, dState = 0, yPrev = y;

  // The integrator is seeded so the settled loop starts at its own steady state rather than
  // winding up from zero, which would make lap 0 a transient the score then describes
  // (rules 12, 13).
  integ = 100 * invTrim(model, (sp0 - Y0) / KP);

  const loop = {
    get y() { return y; },
    get travel() { return x; },
    /** One sample: PID on (sp - y), actuator, dead time, first-order lag. */
    step(sp) {
      tick();
      const e = sp - y;
      const P = Kc * e;
      // derivative on MEASUREMENT (never on the setpoint — a step would kick the valve)
      if (TD > 0) {
        const a = TD / (TD + NFILT * TS);
        dState = a * dState - Kc * TD * (1 - a) * (y - yPrev) / TS;
      } else dState = 0;
      let u = P + integ + dState;
      const uSat = Math.max(0, Math.min(100, u));
      // back-calculation anti-windup: the integrator tracks what the valve could actually take
      integ += Kc * (TS / TI) * e + (uSat - u) * (TS / TI);
      yPrev = y;

      const w = actuate(uSat / 100);
      buf[bi] = w; bi = (bi + 1) % buf.length;
      const wDel = buf[bi];                                  // DEAD samples old
      y = y + (TS / TAU) * (Y0 + KP * wDel - y);
      y = Math.round(y / QUANT) * QUANT;                     // the instrument's own resolution
      return y;
    },
    tuning: { Kc, TI, TD, tauc, Kinst },
  };
  for (let i = 0; i < 1200; i++) loop.step(sp0);             // settle, inside the meter
  return loop;
}

/**
 * The INSTALLED gain (°C per % of valve travel) at a working point, obtained by perturbing the
 * actual characteristic rather than read off a constant — the bump test an engineer runs. On an
 * equal-percentage valve this varies 50-fold across travel, which is the whole reason the loop
 * detunes away from where it was tuned.
 */
function installedGain(model, x) {
  const h = 0.01;
  return KP * (model.trim(x + h) - model.trim(x - h)) / (2 * h) / 100;
}
/** Travel that gives a flow fraction — the inverse characteristic, for seeding the integrator. */
function invTrim(model, w) {
  const f = Math.max(1 / RANGE, Math.min(1, w));
  return model.stiction || model.trim === eqPct ? 1 + Math.log(f) / Math.log(RANGE) : f;
}

// ------------------------------------------------------------------------ the program
/**
 * A SETPOINT SCHEDULE, which is what makes this plant askable at all (plan §105) and is also
 * what a real sequencing loop does. Segment and hold are sized so the program contains many of
 * the loop's own response times — §84.9's `prog/rise` screen splits at about ten, and every
 * plant above the split meets target 1 while every plant below it misses.
 */
const SEG = 600, HOLD = 250;
const RECIPE = [55, 75, 45, 68, 58];               // °C, the production schedule
const SP_LO = 40, SP_HI = 90;                      // the loop's declared setpoint span
const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));
function spOn(rec, k) {
  const i = Math.min(rec.length - 2, Math.floor(k / SEG));
  const t = (k - i * SEG - HOLD) / (SEG - HOLD);
  const s = t <= 0 ? 0 : t >= 1 ? 1 : quintic(t);
  return rec[i] + (rec[i + 1] - rec[i]) * s;
}
const spAt = (k) => spOn(RECIPE, k);
const refAtStep = (k) => [spAt(Math.min(k, PROG - 1))];
const PROG = SEG * (RECIPE.length - 1);

/** The conventional machine: the PID alone, following the schedule. This is the denominator. */
function convRms(model = MODEL, opts = {}) {
  const p = makeLoop(model, opts);
  let ss = 0, n = 0;
  for (let k = 0; k < PROG; k++) {
    const y = p.step(spAt(k));
    if (k >= PROG * 0.05) { ss += (y - spAt(k)) ** 2; n++; }   // the 5% start transient dropped
  }
  return Math.sqrt(ss / n);
}

export { TS, TAU, THETA, KP, Y0, DEAD, RANGE, STIC_D, STIC_S, RATE, QUANT,
  eqPct, linear, MODEL, MODEL_LIN, makeLoop, installedGain,
  SEG, HOLD, RECIPE, SP_LO, SP_HI, spOn, spAt, refAtStep, PROG, convRms };
