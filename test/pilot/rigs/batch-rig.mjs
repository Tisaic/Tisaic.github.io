/**
 * @file A GRAVIMETRIC BATCHING WEIGH HOPPER — the plant for the settle-prediction question.
 *
 * THE PRODUCT QUESTION. A batching hopper fills, the gate shuts, and the indicated weight rings
 * and creeps for seconds before anyone dares read it. That settle is dead time in every cycle.
 * If the FINAL weight can be read out of the first fraction of it, the cycle shortens and the
 * ground truth costs nothing — you get it by waiting, which is what the machine does today.
 * That is the whole commercial case, and it inverts this project's worst problem: every other
 * plant here needs an instrument the customer does not own (§52.42 prices the arm's tracker at
 * 3.9x), while here the truth IS the same sensor, later, on every cycle, for ever.
 *
 * **THIS SIMULATOR IS THE THING MOST LIKELY TO BE WRONG, AND IT IS BUILT AGAINST ITSELF.**
 * §55's standing caution is that a plant fitted as a linear model is a soft target for a linear
 * method, and `docs/edm.md` says building a simulator to suit the controller is rule 15 exactly.
 * A weigh hopper modelled as "second-order ring + noise" would be inverted perfectly by a linear
 * window and the factor would measure this file. So the four things that make the real problem
 * hard are STRUCTURAL here, not optional:
 *
 *   1. THE DROP HEIGHT FALLS AS THE HOPPER FILLS. Impact force and flight time both depend on
 *      it, so both drift WITHIN a batch and differ ACROSS target weights. A fixed in-flight
 *      constant — the incumbent "preact" — cannot express that, and neither can any estimator
 *      that assumes a time-invariant channel.
 *   2. THE RINGING FREQUENCY MOVES WITH FILL. omega_n = sqrt(k/(m_vessel + m)) drops as mass
 *      accumulates, so the impulse response at cutoff is not the impulse response at tare. This
 *      is the one property that makes a fixed FIR an approximation rather than an inverse.
 *   3. IMPACT FORCE AND IN-FLIGHT MASS PARTLY CANCEL. At cutoff the stream's momentum force
 *      disappears (a step DOWN of mdot*v) while the material already in the air still has to
 *      land (a step UP of mdot*t_fall*g). Their ratio is v/(g*t_fall) = 1 by construction for a
 *      free fall, so they cancel to FIRST ORDER and what is left is the second-order remainder.
 *      Any method that "sees the step" is reading the residue of two large opposed terms.
 *   4. THE MATERIAL IS NOT REPEATABLE. Bulk density, moisture and gate flow vary batch to batch.
 *      That variance is invisible in the signal before it lands and is therefore an IRREDUCIBLE
 *      FLOOR on any predictor. `batch.mjs` reports it, and an estimator that beats it has found
 *      a leak in this file rather than a result (rule 14).
 *
 * WHERE THE CONSTANTS COME FROM, because inventing them is how a simulator flatters a method:
 *   - The RING is anchored to a figure in the public record rather than chosen: US 4,222,448
 *     (automatic batch weighing) describes a 2000 lb load producing excursions of order 750 lb
 *     that attenuate over a ~2 s weighing period. That is ~37% overshoot settling in ~2 s, and
 *     `DAMP` and `K_CELL` below are set to reproduce that magnitude at a full hopper.
 *   - CREEP is the OIML R60 order of magnitude for a load cell: a few 1e-4 of applied load,
 *     drifting over minutes. It matters here because it means the plant NEVER fully settles, so
 *     even "wait for ever" is a convention rather than a truth (rule 25).
 *   - Everything else is nominal for a mid-size dry-solids hopper and is a knob, not a fact.
 *     Nothing in this file has been checked against a real machine. That is the gap the whole
 *     exercise is waiting on, and no number this rig produces is a claim about a real hopper.
 */

const SR = 500;                 // indicator sample rate, Hz — mid-range for a batching indicator
const DT = 1 / SR;
const G = 9.80665;

/** Nominal hopper and weighing-frame constants. All knobs; none measured on a real machine. */
const RIG = {
  capacity: 500,                // kg, load cell rated capacity
  mVessel: 120,                 // kg, empty weigh vessel + frame carried by the cells
  kCell: 3.0e6,                 // N/m, cells + frame + legs; set so the settle matches the ~2 s
                                //      in US 4,222,448 rather than chosen for convenience
  damp: 0.10,                   // structural damping ratio; material in the vessel damps it
  dropTop: 1.60,                // m, gate to hopper floor
  area: 0.55,                   // m^2, hopper cross-section
  density: 750,                 // kg/m^3, nominal bulk density (a granular solid)
  resolution: 0.02,             // kg per indicator count (500 kg / 25000)
  ctrlTau: 0.08,                // s, the indicator's own filter ahead of the setpoint compare.
                                //    Every real batcher has one; without it the controller
                                //    trips on a ring peak and cuts 7.5% light, which is a
                                //    modelling artefact wearing the costume of a plant fault.
  consolTau: 0.9,               // s, material consolidating in the hopper after it lands
  consolFrac: 2.0e-3,           // base fraction of landed mass that arrives "tall" and settles
  consolVel: 0.55,              // how much of that scales with IMPACT SPEED. Material dropped
                                //    faster and from higher piles looser and consolidates more,
                                //    so the settle TAIL is a function of how the batch landed —
                                //    drop height and flow rate at the cut — and not of its mass
                                //    alone. With it at 0 the tail is consolFrac*mass, which ONE
                                //    fitted constant removes completely, and the whole question
                                //    is answered trivially in the negative by this file rather
                                //    than by a hopper (rule 15). It is a knob so both can be run.
  creepFrac: 2.5e-4,            // fraction of applied load that creeps in
  creepTau: 90,                 // s, creep time constant
};

/** A seeded generator — one stream per batch so a batch is reproducible from its index. */
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const gauss = (r) => {
  const u = Math.max(1e-12, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/**
 * THE FEED PLAN — two-speed, which is how dry batching is actually run: bulk to near target,
 * then dribble to the cut. THE CUT IS ON WEIGHT, NOT ON TIME. A first version of this file ran
 * the feed for a duration computed from the nominal rate, which is VOLUMETRIC dosing; a
 * gravimetric batcher watches its own indicator and shuts the gate when the reading crosses
 * target minus a preact. The difference is not cosmetic — timed feeding put 8.5% of scatter on
 * the final mass where a real plant holds a fraction of a percent, so the "irreducible floor"
 * would have been this file's own modelling error wearing the costume of a material property.
 *
 * `preact` is the incumbent's one constant: the operator's allowance for material in flight.
 * It is deliberately a SINGLE NUMBER here, because that is what it is on a real batcher, and
 * the whole in-flight literature is about tuning it. Its inadequacy is the plant's, not a straw
 * man: it cannot vary with drop height, and drop height changes as the hopper fills.
 */
function feedPlan(target, o = {}) {
  return {
    target,
    bulkRate: o.bulkRate == null ? 22 : o.bulkRate,   // kg/s
    dribRate: o.dribRate == null ? 3.0 : o.dribRate,  // kg/s
    dribAt: o.dribAt == null ? 0.92 : o.dribAt,       // hand to dribble at 92% of target
    preact: o.preact == null ? 0.9 : o.preact,        // kg, the operator's in-flight allowance
  };
}

/**
 * RUN ONE BATCH. Returns the indicated-weight trace, the commanded rate at every sample, the
 * cutoff index, and the TRUE final mass — the free label this whole idea rests on.
 *
 * `vary` scales batch-to-batch material variability. At 0 the material is repeatable and the
 * irreducible floor vanishes, which is the control that separates what the estimator achieved
 * from what the material allowed (rule 9).
 */
function runBatch(target, seed, o = {}) {
  const R = { ...RIG, ...(o.rig || {}) };
  const vary = o.vary == null ? 1 : o.vary;
  const plan = feedPlan(target, o.plan);
  const r = rng(seed);

  // --- per-batch material draw: the part no signal can reveal before it lands -------------
  const rateScale = 1 + vary * 0.045 * gauss(r);
  const densScale = 1 + vary * 0.030 * gauss(r);
  const density = R.density * densScale;
  const tClose = 0.18 * (1 + vary * 0.06 * gauss(r));

  let m = 0, force = R.mVessel * G, vel = 0, creep = 0, pulse = 0;
  let ctrl = 0, consol = 0;    // filtered reading the controller acts on; material consolidation
  const air = [];
  let cutAt = null;                      // time the gate was told to shut

  const tMax = o.tMax == null ? 40 : o.tMax;
  const tail = o.tail == null ? 6.0 : o.tail;
  const nMax = Math.ceil(tMax / SR ** 0) * SR;
  const w = [], cmd = [];
  let cutIdx = 0, i = 0;

  for (; i < nMax; i++) {
    const t = i * DT;
    const kgRaw = (force + creep) / G - R.mVessel;
    ctrl += DT * (kgRaw - ctrl) / R.ctrlTau;          // what the controller actually compares
    const kgNow = ctrl;

    // --- the batching controller: two speeds, then cut on WEIGHT ------------------------
    let want;
    if (cutAt != null) {
      want = t < cutAt + tClose ? plan.dribRate * (1 - (t - cutAt) / tClose) : 0;
    } else if (kgNow >= plan.target - plan.preact) {
      cutAt = t; cutIdx = i; want = plan.dribRate;
    } else {
      want = kgNow < plan.target * plan.dribAt ? plan.bulkRate : plan.dribRate;
    }
    cmd.push(want);

    // ACTUAL rate: commanded, scaled by this batch's material, modulated by feeder pulsation.
    // A screw or slide gate does not deliver a smooth stream, and that pulsation is what a
    // short averaging window mistakes for signal. Multiplicative so it cannot rectify to a
    // positive bias the way an additive term through a max(0,.) does.
    // OU process; q chosen so the steady-state modulation is ~5% of rate (q*sqrt(tau/2)), which
    // is feeder-plausible. A first version ran at 27% and swamped everything: with the material
    // HELD it produced MORE final-mass scatter than with it varying, which is the control saying
    // the "irreducible floor" was this term and not the material at all (rule 9).
    pulse += DT * (-pulse / 0.12) + Math.sqrt(DT) * (0.20 * vary) * gauss(r);
    const rate = Math.max(0, want * rateScale * (1 + Math.max(-0.9, Math.min(0.9, pulse))));

    // Drop height falls as the hopper fills — THE structural nonlinearity here.
    const fill = m / (density * R.area);
    const h = Math.max(0.05, R.dropTop - fill);
    if (rate > 0) air.push({ mass: rate * DT, land: t + Math.sqrt(2 * h / G), v: Math.sqrt(2 * G * h) });

    let landed = 0, impulse = 0;
    while (air.length && air[0].land <= t) { const p = air.shift(); landed += p.mass; impulse += p.mass * p.v; }
    m += landed;

    // Material lands "tall" and consolidates: a slow tail that is NOT the load cell's creep and
    // is the part of the settle a predictor has most to gain from.
    // Consolidation injected in proportion to landed mass AND to how hard it landed.
    const vRef = Math.sqrt(2 * G * R.dropTop);
    const loose = R.consolFrac * (1 + R.consolVel * ((landed > 0 ? impulse / landed : 0) / vRef - 1));
    consol += DT * (-consol / R.consolTau) + loose * landed;
    const fApp = (R.mVessel + m - consol) * G + impulse / DT;
    const wn = Math.sqrt(R.kCell / (R.mVessel + m));     // rings SLOWER as it fills
    vel += DT * (wn * wn * (fApp - force) - 2 * R.damp * wn * vel);
    force += DT * vel;
    creep += DT * ((R.creepFrac * fApp) - creep) / R.creepTau;

    const amb = 1.5 * Math.sin(2 * Math.PI * 23.5 * t) + 2.5 * gauss(r);
    w.push(Math.round(((force + creep + amb) / G - R.mVessel) / R.resolution) * R.resolution);

    if (cutAt != null && t >= cutAt + tClose + tail) { i++; break; }
  }

  let inAir = 0; for (const p of air) inAir += p.mass;
  return { w: Float64Array.from(w), cmd: Float64Array.from(cmd), cutIdx, dt: DT, n: i,
    target, plan, truth: m + inAir, tClose, rateScale, densScale };
}

/** When does the indicated value first stay inside `tol` kg of its own final value? */
function settleIndex(b, tol) {
  const fin = b.w[b.n - 1];
  let i = b.n - 1;
  while (i > b.cutIdx && Math.abs(b.w[i - 1] - fin) <= tol) i--;
  return i;
}

export { RIG, SR, DT, G, feedPlan, runBatch, settleIndex, rng, gauss };
