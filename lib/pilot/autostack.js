/**
 * @file ONE BUTTON. Route the signals, state the maxes, press it.
 *
 * Everything in `lib/pilot/` is a rung, and until now choosing between them was the
 * engineer's job: which layers, in what order, how deep, and whether the machine's
 * conventional loop was good enough to build on. Every one of those is a MEASUREMENT, and a
 * measurement is the machine's job, not a person's. This file makes it one call.
 *
 *     const auto = new AutoStack({ channels: [{lo, hi, vMax, aMax, jMax}], uMax });
 *     const report = await auto.commission(host);      // <- the button
 *     const u = auto.act(ctx);                          // <- the correction, thereafter
 *
 * The only things it is TOLD are the ones a machine cannot discover for itself without
 * risking damage: the travel and rate limits of each channel, and how much correction
 * authority the engineer is willing to hand over. Two optional hints make it better and
 * neither is required: `periodic` (the program repeats every N samples) and a reference
 * whose derivatives can be read, which unlocks the conventional layer.
 *
 * WHAT IT DECIDES FOR ITSELF, each by measuring on the machine rather than by a rule:
 *
 *   · the timescale — the pilot has always measured its own Ts from a quiet-detected step
 *     test, and nothing here overrides it;
 *   · whether the conventional layer is worth deploying, and its coefficients;
 *   · how deep to cascade — layers are added while each one still pays and stopped when one
 *     does not, instead of the engineer picking a depth;
 *   · whether the lap-periodic layer helps, when the program repeats;
 *   · and WHICH PREFIX OF THE LADDER TO SHIP, because every rung is scored on the machine
 *     with everything below it deployed, so the best composition is read off a table rather
 *     than assumed. A rung that measures worse than the rung below it is not deployed.
 *
 * THE ORDER IS NOT A PREFERENCE, IT IS MEASURED, and it is not symmetric:
 *
 *   ① CONVENTIONAL first (`classic.js`). It is static, cheap — 8 laps on a real servo axis
 *     — and it is the largest single win there (425x). Everything above it should model what
 *     it LEAVES, not what it already removes.
 *   ② THE PILOT, then its cascade (`pilot.js`, `stack.js`). Dynamic, program-agnostic,
 *     transfers to programs never run.
 *   ③ THE LAP-PERIODIC LAYER last (`hff.js`), and only if the program repeats. It must be
 *     last because it is indexed by LAP PHASE while everything below it is indexed by the
 *     machine's state: commissioning a program-agnostic layer on top of a phase-indexed one
 *     applies a phase-indexed correction to a machine that is not on the path, and this
 *     project measured that arrangement at 0.71x — worse than the double correction it was
 *     meant to fix.
 *
 * WHAT THE RUNGS ARE FOR, so a refusal reads as information rather than failure. The
 * conventional layer is STATIC: it cannot cancel a resonance. The pilot has memory but is
 * program-agnostic: it cannot know where in a lap it is. The harmonic layer knows exactly
 * where in the lap it is and nothing else: it cannot transfer to another program. A machine
 * whose error is entirely velocity lag will deploy ① and refuse ② and ③, and that is the
 * right answer, not a shortfall.
 *
 * MEMORY DOES NOT TRANSFER AND A MODEL DOES, which is why ③ is gated on the `periodic` hint
 * rather than discovered. On the EMPS axis the conventional layer's four coefficients are
 * worth 425x on the program they were fitted to and 169.8x on a two-tone sine the machine has
 * never run; the IDENTICAL correction signal replayed as a lap-indexed table is 0.53x on that
 * sine — worse than not correcting. If the machine will only ever run one program, ③ is free
 * performance. If it will run programs nobody has written yet, ③ is a liability and ① and ②
 * are the stack.
 */
import { ClassicFF } from './classic.js';
import { HarmonicFF } from './hff.js';
import { Stack } from './stack.js';

export class AutoStack {
  /**
   * @param {object} o
   * @param {Array<object>} o.channels  per-channel {lo, hi, vMax, aMax, jMax} — the maxes
   * @param {number} o.uMax             correction authority, per channel
   * @param {number|null} [o.periodic]  samples in a lap, if the program repeats
   * @param {object|null} [o.basis]     from `motionBasis()`, if reference derivatives can be
   *                                    read. Without it the conventional rung is skipped.
   * @param {number} [o.maxDepth=3]     ceiling on cascade layers; depth is MEASURED, not set
   * @param {object} [o.pilot]          extra Pilot options (start, guards, workspace, seed…)
   * @param {object} [o.frames]         per-rung frames, `{classic|stack|hff: {uMax, map}}`.
   *                                    `map(u, ctx)` takes that rung's output into the
   *                                    COMMON space — the one `channels` and `uMax`
   *                                    describe and the host commands in — and `uMax` is
   *                                    that rung's authority in its OWN frame. Omit it and
   *                                    every rung shares one frame, which is right for a
   *                                    single-axis machine and wrong for a 2R arm.
   * @param {number} [o.margin=0.02]    a rung must beat the one below it by this fraction to
   *                                    be deployed. Not a tuning knob — it is the width of
   *                                    "no difference", and a rung that cannot clear it is
   *                                    paying commissioning time for nothing.
   * @param {number} [o.floor=0]        the smallest score the INSTRUMENT can resolve. A rung
   *                                    is not credited for going below it, and the report
   *                                    says so. GIVE THIS ONE. Without it a deterministic
   *                                    rig will happily report four thousand x: the EMPS
   *                                    simulation reproduces its hardware to 1.6 µm and its
   *                                    machine repeats lap to lap to 0.3 µm, so a lap-indexed
   *                                    layer measured 4254x on it — a property of the
   *                                    simulator, since a perfectly repeating plant has no
   *                                    floor of its own. An improvement smaller than what
   *                                    the instrument can see is not an improvement. This is
   *                                    a STARTING value: it rises to any larger `spread` a
   *                                    scored run reports for itself.
   */
  constructor(o) {
    this.channels = o.channels;
    this.uMax = o.uMax;
    this.periodic = o.periodic || null;
    this.basis = o.basis || null;
    this.maxDepth = o.maxDepth ?? 3;
    this.pilotOpts = o.pilot || {};
    // THE RUNGS DO NOT SHARE A FRAME ON A MULTI-AXIS MACHINE, and forcing one costs the
    // rung that had the most to give. The harmonic rung was MEASURED to need a frame that
    // does not rotate with the path (world 8.86x against a path-normal 0.99x on the same
    // solve); the pilot on the same 2R arm performs in JOINT space and loses thirteen times
    // the residual bias when it is made to command world points instead. Run everything in
    // world and the arm's pilot cascade leaves 0.550 where its joint-space equivalent leaves
    // 0.1875 — 2.9x worse, on the same machine and sliders.
    //
    // So a rung may declare its own frame: its own authority, and a map into the COMMON
    // space the host actually commands in. The common space is whatever `channels` and
    // `uMax` describe — for a single-axis servo that is everything and this is all inert.
    this.frames = o.frames || {};
    this.margin = o.margin ?? 0.02;
    this.floor = o.floor ?? 0;
    // The floor as GIVEN, kept so the measured median can never take the ladder below what
    // the engineer stated the instrument can resolve.
    this.floor0 = this.floor;
    this._spreads = [];
    // Optional: called with each rung row as it is measured, for hosts that want progress
    // out of a long commission rather than one table at the end.
    this.onRung = o.onRung || null;
    // WHERE A RUNG IS INSIDE ITSELF, for something watching a run that takes tens of minutes.
    this.onStage = o.onStage || null;
    // Passed through to HarmonicFF. Everything it needs it measures for itself; this exists
    // so a BUDGET — how many passes the ladder is willing to spend — can be set by whoever
    // is paying for the laps, which is not a property of the plant.
    this.hffOpts = o.hff || {};
    // The host declaring that it indexes the pilot's look-ahead from the LAP START, so its
    // phase cannot walk. The library cannot tell from the outside — see `phaseWalk`.
    this.lapSynced = !!o.lapSynced;
    this.classic = null;
    this.stack = null;
    this.hff = null;
    this.deployed = { classic: false, stack: 0, hff: false };
    // EVERY RUNG THAT WAS BUILT, deployed or not. A refused rung is still a measurement,
    // and discarding the object means the report can describe it but nothing can inspect it.
    this.built = { classic: null, stack: null, stacks: [], hff: null };
    this._identifying = false;   // true only during the harmonic rung's PROBE laps
    this.report = { rungs: [] };
    this._starve = { classic: 0, stack: 0, hff: 0 };
    this._peak = new Array(this.channels.length).fill(0);
    this._nonfinite = 0;
    // NULL, NOT 1 — the same rule `act()` states forty lines further down and this line
    // broke. `clipping()` documents `over: null` as 'the cap never bound', and `beginRun()`
    // resets to null; the constructor seeded 1, so a `clipping()` read before any run
    // reported a worst demand of EXACTLY the cap — 'measured at the limit' where the truth
    // is 'not measured'. Rule 26, in the file that quotes it.
    this._clip = 0; this._clipPk = null; this._acts = 0;
  }

  /**
   * @param {object} host
   * @param {(corr: {at:Function}|null) => Promise<{score:number, err:Array<ArrayLike<number>>}>}
   *   host.run  drive the machine for one scored trial. Apply `this.act(...)` every sample —
   *   that is the rungs already deployed — and ADD `corr.at(k)` when `corr` is non-null, which
   *   is the rung currently being probed. Return the score the rungs are judged on and one
   *   lap-length error signal per channel. MAY also return `spread`, the measured
   *   uncertainty of that run's own score (e.g. the standard error of the per-lap scores it
   *   averaged); the floor rises to the largest one reported, so later comparisons are made
   *   at the resolution of the noisiest machine actually measured rather than of the bare
   *   one the static floor was taken on.
   * @param {(stack: Stack) => Promise<void>} [host.drivePilot]  run a Stack's phase machine
   *   to completion against the machine. Omit it and the pilot rung is skipped.
   */
  async commission(host) {
    const rep = this.report;
    // A rung must beat the one below it by the margin, MEASURED AT THE INSTRUMENT'S
    // RESOLUTION — both sides floored, so an improvement the instrument cannot see is not
    // credited, and one it can is not refused for being large. Written the obvious way
    // first (`score > floor`) it REJECTED THE BEST RUNG ON THE MACHINE for landing below
    // the floor, and shipped a worse one: going under the floor is the goal, and all it
    // costs is the ability to say by how much.
    const res = (x) => Math.max(x, this.floor);
    const beats = (score, ref) => res(score) < res(ref) * (1 - this.margin);
    let bestSoFar = Infinity;      // declared ABOVE the closure that reads it, not below it
    let savedClassic = false;
    const rung = (name, score, note, clip, kept) => {
      // AN UNFLATTERING DIAGNOSTIC FIRST (rule 27): if the cap was cutting this rung while
      // it was scored, that is the first thing about the row, not a footnote.
      if (clip && clip.frac > 0.01 && clip.over !== null) {
        note = `CLAMPED on ${(100 * clip.frac).toFixed(0)}% of samples, worst demand `
          + `${clip.over.toFixed(2)}x the cap — this score is of a CLIPPED rung`
          + (note ? ` — ${note}` : '');
      }
      // AGAINST THE BEST SO FAR, not the previous ROW. A refused rung still gets a row, and
      // measuring the next rung against it credits that rung with undoing a regression
      // nobody deployed — on the arm it printed 1.72x for a rung that delivered 1.19x.
      const prev = rep.rungs.length ? bestSoFar : null;
      // THE FLOOR MOVES DURING A COMMISSION, so a row has to record the one it was judged
      // against. It rises whenever a noisier configuration measures itself, which means the
      // first rows were compared at a finer resolution than the last — and `atFloor`
      // evaluated against 'the floor now' would label rows by a number that was not yet
      // known when they were scored. Reported per row rather than smoothed over: a table
      // whose rows were judged at different resolutions is a fact about the run, and
      // hiding it would make the label mean two things.
      const floorAt = this.floor;
      const atFloor = score <= floorAt;
      if (kept !== false) bestSoFar = Math.min(bestSoFar, score);
      const r = { name, score, deployed: kept !== false, gain: prev === null ? null : prev / score, atFloor,
        floorAt, ref: prev,
        note: atFloor ? `${note ? note + ' — ' : ''}AT THE INSTRUMENT'S FLOOR (${floorAt.toExponential(2)}), not distinguishable` : note };
      rep.rungs.push(r);
      // A ROW IS EMITTED WHEN IT IS MEASURED, NOT WHEN THE LADDER FINISHES. Commissioning
      // the arm takes an hour and the table printed only at the end, so a run that was
      // going wrong looked exactly like a run that was going well until it was over — and
      // four of those in parallel is four hours before anything can be steered. `onRung` is
      // optional and the report is unchanged; a host that does not pass one sees no
      // difference.
      if (this.onRung) { try { this.onRung(r); } catch { /* a reporter must not fail a run */ } }
      return r;
    };

    // Every scored run reports whether the common cap bound during it. A rung whose score
    // was taken while the cap was cutting it was not measured — it was measured CLAMPED.
    // AND WHETHER THE MACHINE IT WAS SCORED ON IS NOISIER THAN THE ONE THE FLOOR WAS
    // MEASURED ON. The floor is taken once, on the BARE machine, which on a deterministic
    // rig repeats to rounding — but every rung after the first is scored with a pilot
    // deployed, and a deployed pilot's lap-to-lap spread is percent-level. A floor of 1e-9
    // applied to scores that repeat to 4% is a floor that never engages: `res()` is the
    // identity, and a difference inside the noise is credited as a win.
    // So a host MAY return `spread` — its own measured uncertainty for THAT run — and the
    // floor rises to the largest one seen.
    // AND THAT MAKES EARLY COMPARISONS FINER THAN LATE ONES, which an earlier version of
    // this comment denied: it claimed a comparison is never made at a resolution finer than
    // the machine turned out to have. It is — every comparison made before the noisiest
    // configuration measured itself was made at whatever floor was known then, and the
    // ladder does not go back. Rungs therefore carry the floor they were judged against,
    // and `report.floorRevised` names any deployed rung whose margin no longer clears under
    // the FINAL floor. Reported, not silently re-decided: re-deciding would mean re-scoring
    // rungs whose commissioning cost tens of thousands of laps, and a decision the operator
    // can see is worth more than one quietly reversed. A host that returns nothing keeps the
    // static floor: "not measured" and "zero" stay different states (rule 26).
    // `label` IS NOT `name`. `name` routes the probed rung through the host and is null at
    // every one of these call sites — base, and the four re-scores through the deploy path
    // — so labelling the floor's source with it named the bare machine as the source of
    // noise measured on a fully deployed one. On the arm that printed a floor of 3.47e-2,
    // 63% of the score beneath it, attributed to a run that repeats to 1.6e-10. A
    // diagnostic naming the wrong source is worse than none: it was pointing at the one
    // configuration that could not possibly have produced it.
    const scored = async (corr, name, label = null) => {
      this.beginRun();
      const r = await host.run(corr, name);
      r.clip = this.clipping();
      // A RUNG ARMED AND NEVER REACHED makes the score describe a machine missing a layer,
      // so it is recorded on the run rather than left for someone to notice.
      const st2 = this.starved();
      if (st2) (rep.starved = rep.starved || []).push({ at: label || name || 'unlabelled run', rungs: st2 });
      r.range = this.range();
      // The ceiling belongs to the machine that was just scored. Kept as the ladder walks,
      // so the rung about to be commissioned can be judged against ITS OWN achievable set
      // rather than against the bare machine's.
      if (r.bands) this._lastBands = r.bands;
      if (r.range.nonfinite || r.range.outsideBox) {
        (rep.rangeFlags = rep.rangeFlags || []).push({ at: label || name || 'unlabelled run',
          nonfinite: r.range.nonfinite, outsideBox: r.range.outsideBox, peak: r.range.peak });
      }
      // ---- THE MEDIAN OF THE REPORTED SPREADS, NOT THE LARGEST.
      //
      // Taking the running maximum looked conservative and is simply biased. Each run
      // estimates its own spread from a handful of laps — three differences, on this arm —
      // so the estimate is noisy, and the largest of twenty noisy estimates sits far above
      // the truth. Measured: the ladder's floor read 5.84e-4 while the actual repeatability
      // of a four-lap score, taken from sixteen laps of the shipped machine, is 1.51e-4.
      // A floor 3.9x too large does not fail safe — it refuses real improvements and calls
      // differences indistinguishable that the machine can produce all day.
      //
      // The median estimates the typical repeatability and does not chase one unlucky run.
      // The static floor still acts as a lower bound, so a host that reports nothing, or
      // reports absurdly small spreads, cannot talk the ladder below what it was given.
      if (Number.isFinite(r.spread)) {
        (this._spreads = this._spreads || []).push(r.spread);
        const srt = [...this._spreads].sort((x, y) => x - y);
        const med = srt.length % 2 ? srt[(srt.length - 1) / 2]
          : 0.5 * (srt[srt.length / 2 - 1] + srt[srt.length / 2]);
        if (med > this.floor0) { this.floor = med; rep.floorFrom = `median of ${srt.length} runs`; }
      }
      // A CONFIGURATION STILL CONVERGING IS NOT A SCORE YET. A host may report the drift
      // across the laps it averaged; where that is large against the score, the number
      // above it is a point on a transient and the ladder is comparing one plant's settling
      // to another's. Reported, never silently corrected — the fix is more laps, and only
      // whoever set the lap count can pay for it.
      if (Number.isFinite(r.drift) && Math.abs(r.drift) > 0.25 * r.score) {
        (rep.unsettled = rep.unsettled || []).push({
          at: label || name || 'unlabelled run', score: r.score, drift: r.drift });
      }
      return r;
    };
    const base = await scored(null, null, 'as it arrived');
    rep.base = base.score;
    rung('as it arrived', base.score, null, null, true);
    let best = base.score;

    // ---- ① THE CONVENTIONAL LAYER
    if (this.basis) {
      const c = this.built.classic = new ClassicFF({ basis: this.basis, channels: this.channels.length,
        uMax: this.authority('classic') });
      const r = await c.commission((corr) => host.run(corr, 'classic'));
      // RE-SCORE THE WINNER THROUGH THE DEPLOY PATH. `commission` drove the machine with the
      // rung passed as `corr`; production drives it through `act()`. Those are two different
      // code paths and only the second is the one that ships, so the number the decision is
      // made on comes from the second — and this is also where the cap's clipping is read.
      const prevC = { c: this.classic, on: this.deployed.classic };
      this.classic = c; this.deployed.classic = true;
      const rc2 = await scored(null, null, 'conventional, deployed');
      this.classic = prevC.c; this.deployed.classic = prevC.on;
      const kept = beats(rc2.score, best);
      rung('conventional (self-tuned)', rc2.score,
        `${r.laps} laps, ${r.names ? r.names.length : 0} coefficients` + (kept ? '' : ' — NOT deployed'),
        rc2.clip, kept);
      if (kept) { this.classic = c; this.deployed.classic = true; savedClassic = true; best = rc2.score; }
      rep.classic = r;
    }

    // ---- ② THE PILOT, AND AS DEEP AS IT PAYS
    //
    // TRIED BOTH ON AND OFF THE RUNGS BELOW IT, because a greedy ladder cannot see that a
    // cheap rung may cost an expensive one. On the arm the conventional rung deploys at 1.24x
    // and then the cascade commissioned above it stops at depth 1 (9.64e-2, second layer
    // REFUSED); with that rung withheld the same cascade reaches depth 2 at 5.57e-2 and the
    // machine ends 1.66x better overall. The drop-one pass below cannot recover this: it
    // measures whether a rung hurts the FINAL machine, and it found nothing, because by then
    // the damage is baked into a model that was fitted on the wrong plant.
    //
    // The price is one extra commissioning of the expensive rung. That is the honest cost of
    // rungs that are not additive, and it is paid only when there IS something below.
    const belowArmed = () => ['classic'].some((n) => this.deployed[n]);
    if (host.drivePilot) {
      const attempts = belowArmed() ? [true, false] : [true];
      let bestAttempt = null;
      for (const withBelow of attempts) {
      const savedBelow = { classic: this.deployed.classic };
      if (!withBelow) this.deployed.classic = false;
      const attemptStart = withBelow ? best : rep.base;
      let attemptBest = attemptStart, attemptStack = null, attemptDepth = 0;
      for (let depth = 1; depth <= this.maxDepth; depth++) {
        // ITS OWN AUTHORITY, like every other rung. The common cap belongs to the SUM in
        // the common frame; handing it to a rung as that rung's own limit is how a cap
        // meant for one correction ends up sizing another.
        const st = new Stack({ ...this.pilotOpts, channels: this.channels,
          uMax: this.authority('stack'), depth });
        // EVERY ONE OF THEM, not the last one assigned. `built` exists so a refused rung can
        // be inspected rather than only described, and the cascade builds several — two
        // attempts times up to maxDepth — so a single slot overwritten each time held
        // whichever happened to be constructed last, which is neither the deployed one nor
        // a complete record. `built.stack` is set to the one that SHIPS once that is known.
        (this.built.stacks = this.built.stacks || []).push(st);
        await host.drivePilot(st);
        // PROVISIONALLY DEPLOYED, THEN MEASURED, THEN ROLLED BACK IF IT DID NOT PAY. The
        // pilot acts through a look-ahead closure rather than a lap index, so it cannot be
        // handed to the host as "one more correction to add"; every rung is instead armed on
        // this object and scored through `act()`, which is the same path production uses.
        const armed = st.verdict && st.verdict.deploy;
        let r = { score: best };
        if (armed) {
          const prev = { stack: this.stack, depth: this.deployed.stack };
          this.stack = st; this.deployed.stack = depth;
          r = await scored(null, null, `pilot cascade depth ${this.deployed.stack}, deployed`);
          if (!beats(r.score, best)) { this.stack = prev.stack; this.deployed.stack = prev.depth; }
        }
        const kept = armed && beats(r.score, best);
        // THE ROW SAYS WHICH MACHINE IT WAS COMMISSIONED ON. Two attempts print two rows,
        // and rows that differ only in a number nobody can attribute are not a report.
        rung(`pilot cascade, depth ${depth}${withBelow ? '' : ' (rungs below withheld)'}`, r.score,
          armed ? (kept ? null : 'no better than the rung below — stopping')
            : `nothing to deploy: ${st.verdict ? st.verdict.why : 'did not commission'}`,
          r.clip, kept);
        if (!kept) break;
        attemptBest = r.score; attemptStack = this.stack; attemptDepth = depth;
      }
      // Record the attempt, then put the machine back the way it was before scoring the next.
      if (bestAttempt === null || attemptBest < bestAttempt.score) {
        bestAttempt = { score: attemptBest, stack: attemptStack, depth: attemptDepth,
          classic: withBelow ? savedBelow.classic : false, withBelow };
      }
      this.deployed.classic = savedBelow.classic;
      this.stack = null; this.deployed.stack = 0;
      }
      if (bestAttempt && bestAttempt.stack) {
        this.stack = bestAttempt.stack; this.deployed.stack = bestAttempt.depth;
        this.built.stack = bestAttempt.stack;
        this.deployed.classic = bestAttempt.classic;
        best = bestAttempt.score;
        if (!bestAttempt.withBelow && savedClassic) {
          rung('— the conventional rung WITHHELD', bestAttempt.score,
            'the cascade above it commissions better without it: a cheap rung that costs an '
            + 'expensive one, which no amount of re-scoring after the fact can recover',
            null, true);
        }
      } else if (bestAttempt) {
        this.deployed.classic = bestAttempt.classic;
      }
    }

    // ---- ③ THE LAP-PERIODIC LAYER, LAST, AND ONLY IF THE PROGRAM REPEATS
    if (this.periodic) {
      // WHAT THE LAP-PERIODIC RUNG CAN REACH ON THE MACHINE IT IS ABOUT TO CORRECT. Every
      // 'headroom' figure so far divided by a ceiling measured on the BARE machine, which
      // is not the machine this rung runs on: the cascade below it has already removed part
      // of the spectrum and may have added structure of its own.
      rep.bandsBeforeHff = this._lastBands || null;
      // ---- DOES THE PILOT'S PHASE WALK AGAINST THE LAP?
      //
      // The host builds the look-ahead closure, so the library cannot fix this — but it can
      // see it, and it is invisible from anywhere else. A pilot indexed continuously across
      // laps starts each one at a different point within its own sample unless its cadence
      // divides the lap, and its phase then walks: a BEAT, at a period set by the remainder.
      //
      // It matters specifically to the rung about to be commissioned. HarmonicFF represents
      // INTEGER harmonics of the lap, so a beat is a half-integer or worse — energy in a
      // place its basis cannot reach and no number of passes removes. Measured on the 2R
      // arm: cadence 9 against a lap of 7357, remainder 4, so the pilot started each lap 44%
      // of a sample late and the lap-to-lap autocorrelation was -0.764. Indexing from the
      // lap start instead took it to -0.135 and the machine from 5.5099e-2 to 5.3554e-2,
      // with the ladder going 20.70x to 22.42x.
      //
      // Reported, not corrected, because the closure belongs to the host. A run that trips
      // this is leaving performance on the table AND handing the rung above a target it
      // cannot represent.
      // A HOST THAT ALREADY INDEXES FROM THE LAP START HAS NO WALK, and the library cannot
      // see which it does — the closure belongs to the host. So the host declares it. Without
      // this the detector fires on every lap-synced run, which is worse than not having it:
      // a diagnostic that cries wolf on a machine that fixed the problem gets ignored on the
      // machine that has it.
      if (!this.lapSynced && this.stack && this.deployed.stack
          && Number.isFinite(this.stack.sample)) {
        const S = this.stack.sample, rem = this.periodic % S;
        if (rem !== 0) {
          rep.phaseWalk = { lap: this.periodic, sample: S, remainder: rem,
            fraction: rem / S,
            note: `the pilot's cadence (${S}) does not divide the lap (${this.periodic}): `
              + `each lap starts ${(100 * rem / S).toFixed(0)}% of a sample later than the `
              + `last, so its phase walks and the lap-periodic rung sees a beat at a `
              + `HALF-INTEGER harmonic it cannot represent. Index the host's look-ahead from `
              + `the lap start to remove it.` };
        }
      }
      const h = this.built.hff = new HarmonicFF({ lap: this.periodic, channels: this.channels.length,
        uMax: this.authority('hff'), onStage: this.onStage, ...this.hffOpts });
      // THE PLAN, BEFORE THE SPEND. This rung is the majority of the ladder's runtime, so an
      // operator watching it needs a denominator and the criterion that ends each stage —
      // otherwise "run 37" is a liveness signal being read as a progress bar.
      if (this.onStage) this.onStage({ stage: 'starting', rung: 'hff', plan: h.plan(), i: 0, of: 1,
        ends: 'the lap-periodic rung: probe the machine at the lap harmonics, invert, and '
          + 'take damped Newton steps against a frozen operator' });
      // IDENTIFY ON THE CLEAN MACHINE, REFINE ON THE DEPLOYED ONE. The pilot is a receding
      // horizon controller: it REACTS to the harmonic probe, so an operator identified
      // through it describes the loop rather than the plant. The conventional rung is a
      // static function of the reference and reacts to nothing, so it stays armed — what is
      // disarmed is exactly what is reactive. Measured on the arm: identified through the
      // active pilot the harmonic rung is worth 1.02x, identified clean it is worth 4.2x.
      const r = await h.commission(async (corr, phase) => {
        this._identifying = (phase === 'probe');
        try { return await host.run(corr, 'hff'); } finally { this._identifying = false; }
      });
      // SAME DEPLOY-PATH RE-SCORE as the conventional rung: decide on the number produced by
      // the code that ships, not by the one that commissioned.
      const prevH = { h: this.hff, on: this.deployed.hff };
      this.hff = h; this.deployed.hff = true;
      const rh2 = await scored(null, null, 'lap-periodic, deployed');
      this.hff = prevH.h; this.deployed.hff = prevH.on;
      const kept = beats(rh2.score, best);
      rung('lap-periodic (harmonic)', rh2.score,
        `${r.laps} laps, probe ${r.style} at ${(100 * r.frac).toFixed(0)}%`
        + (kept ? ' — a MEMORY: it will not transfer to another program' : ' — NOT deployed'),
        rh2.clip, kept);
      if (kept) { this.hff = h; this.deployed.hff = true; best = rh2.score; }
      rep.hff = r;
    }

    // ---- ④ DROP-ONE. A GREEDY LADDER CANNOT SEE THAT A RUNG WHICH HELPS ALONE MAY COST THE
    // RUNG ABOVE IT. Each rung here is kept because it beat the machine BELOW it, which is a
    // decision made before the rungs above existed; nothing revisits it once they do. On the
    // arm the conventional rung deploys at 1.24x and the pilot commissioned on top of it then
    // reaches 9.6e-2, where the same pilot on a bare machine reaches 5.8e-2 — the cheap rung
    // pays for itself and charges the expensive one double.
    //
    // So try removing each deployed rung, one at a time, and MEASURE. No re-commissioning:
    // this is three scored laps per rung, against the tens of thousands a rung costs to
    // build. A rung whose removal does not make the machine worse is not earning its place.
    const armed = () => ['classic', 'stack', 'hff'].filter((n) => this.deployed[n]);
    for (const name of armed()) {
      if (armed().length < 2) break;                 // never strip the machine back to bare
      const save = this.deployed[name];
      this.deployed[name] = name === 'stack' ? 0 : false;
      const without = await scored(null, null, 'drop-one pass');
      if (beats(without.score, best)) {
        rung(`— dropped ${name}`, without.score,
          `it was COSTING the rungs above it: removing it is better, so it is not deployed`,
          without.clip, true);
        best = without.score;
      } else {
        this.deployed[name] = save;                  // it earns its place; put it back
      }
    }

    // ---- DID THE FLOOR MOVE UNDER A DECISION ALREADY MADE? Only rows judged at a finer
    // floor than the final one can be affected, and only deployed ones matter.
    if (rep.rungs.some((r) => r.floorAt < this.floor)) {
      const resF = (x) => Math.max(x, this.floor);
      const shaky = rep.rungs.filter((r) => r.deployed && r.ref !== null && r.floorAt < this.floor
        && !(resF(r.score) < resF(r.ref) * (1 - this.margin)));
      if (shaky.length) {
        rep.floorRevised = shaky.map((r) => ({ name: r.name, score: r.score, ref: r.ref,
          judgedAt: r.floorAt, finalFloor: this.floor }));
      }
    }
    rep.best = best;
    rep.gain = base.score / best;
    rep.deployed = { ...this.deployed };
    return rep;
  }

  /**
   * CALL THIS AT THE TOP OF EVERY RUN. The dynamic rungs carry runtime state — lag rings,
   * a look-ahead cursor — and a rung that is armed but never initialised returns ZEROS,
   * which is indistinguishable from a rung that refused. That is not hypothetical: it cost
   * a run here, and the report said "no better than the rung below" about a layer that had
   * contributed literally nothing.
   */
  beginRun() {
    this._clip = 0; this._clipPk = null; this._acts = 0;
    this._starve = { classic: 0, stack: 0, hff: 0 };
    this._peak = new Array(this.channels.length).fill(0);
    this._nonfinite = 0;
    if (this.deployed.stack && this.stack) for (const p of this.stack.layers) if (p._initRun) p._initRun();
  }

  /**
   * THE RANGE EVERY SIGNAL ACTUALLY OCCUPIED, against the three limits it passes.
   *
   * `peak` is the largest correction demanded per channel before the cap. `cap` is the
   * common authority. `travel` is the half-width of the channel's own declared box, which
   * is the limit the engineer stated for the MACHINE rather than for the correction — and
   * on a machine where cap exceeds travel, the cap cannot protect the box. `outsideBox`
   * names the channels whose demand alone exceeded their declared travel.
   *
   * `nonfinite` counts samples where some rung returned NaN or Infinity. It is not
   * hypothetical arithmetic: a rank-deficient solve in this project once produced an
   * operator of noise, and a hidden canvas divided 0/0 and passed every bounds check
   * because NaN compares false against everything.
   */
  range() {
    const half = this.channels.map((c) => 0.5 * (c.hi - c.lo));
    const outsideBox = [];
    for (let c = 0; c < this._peak.length; c++) if (this._peak[c] > half[c]) outsideBox.push(c);
    return { peak: [...this._peak], cap: this.uMax, travel: half,
      capBindsBeforeBox: half.every((h) => this.uMax <= h),
      outsideBox: outsideBox.length ? outsideBox : null,
      nonfinite: this._nonfinite || null };
  }

  /**
   * Rungs that were ARMED but never reached during the run just scored, because the piece of
   * `ctx` they need was not passed. Anything non-zero means a deployed rung contributed
   * nothing and the score describes a machine missing a layer it was supposed to have.
   */
  starved() {
    const out = {};
    for (const k of ['classic', 'stack', 'hff']) if (this._starve[k]) out[k] = this._starve[k];
    return Object.keys(out).length ? out : null;
  }

  /**
   * How hard the COMMON cap bound during the run just scored. `frac` is the share of
   * channel-samples it cut; `over` is the worst demand as a multiple of the cap. Both zero
   * and one mean the rungs fit inside the authority they were given, which is the only
   * state in which their measured scores mean what they appear to mean.
   */
  clipping() {
    return { frac: this._acts ? this._clip / (this._acts * this.channels.length) : 0,
      over: this._clipPk };   // `over` is null when the cap never bound at all
  }

  /**
   * ROUTE THE MEASUREMENTS IN, every sample. The static rungs do not need them; the pilot
   * does, and it is blind without them.
   * @param {number[]} measured the same signals the pilot was commissioned on
   */
  observe(measured) {
    if (this.deployed.stack && this.stack) this.stack.observe(measured, null);
  }

  /**
   * The deployed correction: every armed rung, summed, and clamped ONCE at the authority.
   * Clamping the terms separately is how this project once ran a pilot at a sixth of its
   * authority — a cap that belonged to one rung wrapped around another that carried its own.
   *
   * @param {object} ctx
   * @param {number[]} [ctx.v] reference velocity per channel   (the conventional rung)
   * @param {number[]} [ctx.a] reference acceleration per channel
   * @param {number}   [ctx.k] lap index                        (the harmonic rung)
   * @param {Function} [ctx.look] look-ahead closure            (the pilot rung)
   */
  act(ctx, extra = null, extraName = null) {
    const nc = this.channels.length, out = new Array(nc).fill(0);
    const add = (u, name) => {
      const w = this.into(u, name, ctx);
      for (let c = 0; c < nc; c++) out[c] += w[c];
    };
    // ---- A DEPLOYED RUNG WHOSE CONTEXT IS MISSING CONTRIBUTES ZERO, SILENTLY.
    //
    // Each line below is guarded on the piece of `ctx` that rung needs, and a host that
    // forgets one gets no correction from that rung and no indication of it. That is the
    // exact failure `beginRun` is documented against — 'a rung that is armed but never
    // initialised returns ZEROS, which is indistinguishable from a rung that refused' —
    // reachable through a second door the guard never covered.
    //
    // COUNTED, NOT THROWN: this runs every sample of a deployed control loop, where an
    // exception is a worse outcome than a wrong number, and a count is a measurement the
    // report can carry. `starved()` names any rung that was armed and never reached, so a
    // wiring fault shows up as a number instead of as a disappointing score.
    if (this.deployed.classic) {
      if (ctx.v) add(this.classic.live(ctx.v, ctx.a), 'classic'); else this._starve.classic++;
    }
    if (this.deployed.stack && !this._identifying) {
      if (ctx.look) add(this.stack.act(ctx.look), 'stack'); else this._starve.stack++;
    }
    if (this.deployed.hff) {
      if (ctx.k !== undefined) add(this.hff.at(ctx.k), 'hff'); else this._starve.hff++;
    }
    // THE RUNG BEING COMMISSIONED GOES INSIDE THE SAME CAP IT WILL DEPLOY INSIDE. Added by
    // the host AFTER this call, it is held only to its own authority while it is being
    // scored and to the common cap once it ships — so it can be measured uncapped and
    // deployed capped, which is rule 34 with the roles reversed. Per-rung authorities are
    // not required to sum inside the common one and on the arm they do not (1.5 + 1.5 + 2.0
    // against 3.0), so this is reachable rather than hypothetical.
    if (extra) add(extra, extraName);
    // THE COMMON CAP IS THE LAST THING THAT TOUCHES THE CORRECTION, AND IT MUST NOT DO SO
    // SILENTLY. Each rung is already held to `authority(name)` in its OWN frame; those
    // numbers are not comparable across frames, so nothing can check at construction time
    // that they sum inside this one. That is exactly the shape of the defect that ran a
    // pilot at a sixth of its authority for a whole brick — a cap belonging to one
    // correction wrapped around another that carried its own — and it was invisible because
    // clamping changes the output without reporting anything. So COUNT IT: if this cap is
    // binding, the report says on what fraction of samples and by how much, and a rung that
    // is being quietly amputated shows up as a number instead of as a disappointing score.
    // ---- WHAT WAS ACTUALLY DEMANDED, per channel, before anything clamped it. The cap
    // reports how often it BOUND; this reports how large the demand was when it did not,
    // which is the difference between 'the cap is protecting the machine' and 'the cap is
    // nowhere near the action'. On this arm the common cap is 3.0 rad against a declared
    // channel travel of +-0.55, so it cannot bind until the correction is already five
    // times outside the box the channels state — a fact no counter of clamp events can
    // show, because the count is zero in both the safe case and the dangerous one.
    for (let c = 0; c < nc; c++) {
      const m = Math.abs(out[c]);
      if (!(m <= 1e308)) this._nonfinite++;          // NaN or Infinity from some rung
      if (m > this._peak[c]) this._peak[c] = m;
    }
    if (Number.isFinite(this.uMax)) {
      for (let c = 0; c < nc; c++) {
        const v = out[c];
        if (v > this.uMax || v < -this.uMax) {
          this._clip++;
          // NULL, not 1. A demand of exactly the cap is a real reading; using it as the
          // 'never clipped' sentinel makes 'not measured' and 'measured at the limit'
          // the same value, which is rule 26 and has cost this project a selection rule.
          this._clipPk = Math.max(this._clipPk === null ? 0 : this._clipPk, Math.abs(v) / this.uMax);
          out[c] = Math.max(-this.uMax, Math.min(this.uMax, v));
        }
      }
    }
    this._acts++;
    return out;
  }

  /**
   * The deployed rungs strictly BELOW `name` in the ladder, in the common frame.
   *
   * A host commissioning the pilot must drive the machine with this applied, because that is
   * the machine the pilot will deploy onto. Commissioning on a bare plant and deploying onto
   * a corrected one is rule 34 in one line: a model fitted to one configuration, scored in
   * another. It is not hypothetical — a locked model here once scored 0.032 under the mode it
   * trained in and 1.225 under another, a 38x spread with its weights frozen.
   */
  /*
   * AND IT DOES NOT APPLY THE COMMON CAP, which `act` does. That is a real asymmetry and it
   * is the rule stated one paragraph up, turned on this function: in deployment the SUM of
   * every rung is clamped once at `uMax`, so where that clamp binds, the machine the pilot
   * commissioned onto is not the machine it deploys onto.
   *
   * It is not fixed by clamping here, because deployment does not clamp the rungs BELOW the
   * pilot — it clamps the total including the pilot's own command, which this function has
   * never seen. The honest arrangement is for the host to sum its pilot command with this
   * and put the total through `capTotal`, which is the identical clamp `act` applies.
   *
   * Where the cap does not bind the two are the same, and that is the normal case and an
   * asserted one — the arm harness checks the cap was not binding when the shipped
   * configuration was scored, and it holds at under 1% of samples. So this is a latent
   * inconsistency rather than an active defect, and it is written down rather than left for
   * the first machine whose corrections are large enough to find it.
   */
  actBelow(name, ctx) {
    const order = ['classic', 'stack', 'hff'], stop = order.indexOf(name);
    const nc = this.channels.length, out = new Array(nc).fill(0);
    const add = (u, n) => { const w = this.into(u, n, ctx); for (let c = 0; c < nc; c++) out[c] += w[c]; };
    if (stop > 0 && this.deployed.classic && ctx.v) add(this.classic.live(ctx.v, ctx.a), 'classic');
    if (stop > 1 && this.deployed.stack && ctx.look) add(this.stack.act(ctx.look), 'stack');
    return out;
  }

  /**
   * Map one rung's output out of its own frame and into the common one. Identity unless the
   * rung declared a frame, so a single-frame machine pays nothing for this existing.
   *
   * THE HOST MUST USE THIS TOO, on the rung it is probing — `commission` hands `run` the
   * rung's name for exactly that reason. A rung commissioned through a different map than
   * it deploys through is identifying one machine and correcting another.
   */
  into(u, name, ctx) {
    const f = this.frames[name];
    return f && f.map ? f.map(u, ctx) : u;
  }

  /**
   * The clamp `act` applies to the summed correction, exposed so a host driving a rung
   * outside `act` — commissioning the pilot, say — can put its total through the identical
   * one instead of an approximation of it. Does NOT count toward `clipping()`: that counter
   * belongs to runs the ladder scored, and mixing a host's own clamping into it would make
   * the clipping report describe two different things.
   */
  capTotal(u) {
    if (!Number.isFinite(this.uMax)) return u;
    return u.map((v) => Math.max(-this.uMax, Math.min(this.uMax, v)));
  }

  /** The authority a rung is held to, in ITS OWN frame. */
  authority(name) {
    const f = this.frames[name];
    return f && f.uMax !== undefined ? f.uMax : this.uMax;
  }

  /** A one-screen account of what was tried, what it measured, and what shipped. */
  table() {
    const w = Math.max(...this.report.rungs.map((r) => r.name.length));
    return this.report.rungs.map((r) => `  ${r.name.padEnd(w)}  ${r.score.toExponential(4)}`
      + `  ${r.gain === null ? '     ' : (r.gain.toFixed(2) + 'x').padStart(7)}`
      + (r.note ? `   ${r.note}` : '')).join('\n');
  }
}
