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
   *                                    the instrument can see is not an improvement.
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
    this.classic = null;
    this.stack = null;
    this.hff = null;
    this.deployed = { classic: false, stack: 0, hff: false };
    this.report = { rungs: [] };
  }

  /**
   * @param {object} host
   * @param {(corr: {at:Function}|null) => Promise<{score:number, err:Array<ArrayLike<number>>}>}
   *   host.run  drive the machine for one scored trial. Apply `this.act(...)` every sample —
   *   that is the rungs already deployed — and ADD `corr.at(k)` when `corr` is non-null, which
   *   is the rung currently being probed. Return the score the rungs are judged on and one
   *   lap-length error signal per channel.
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
    const rung = (name, score, note) => {
      const prev = rep.rungs.length ? rep.rungs[rep.rungs.length - 1].score : null;
      const atFloor = score <= this.floor;
      const r = { name, score, gain: prev === null ? null : prev / score, atFloor,
        note: atFloor ? `${note ? note + ' — ' : ''}AT THE INSTRUMENT'S FLOOR (${this.floor.toExponential(2)}), not distinguishable` : note };
      rep.rungs.push(r);
      return r;
    };

    const base = await host.run(null);
    rep.base = base.score;
    rung('as it arrived', base.score, null);
    let best = base.score;

    // ---- ① THE CONVENTIONAL LAYER
    if (this.basis) {
      const c = new ClassicFF({ basis: this.basis, channels: this.channels.length,
        uMax: this.authority('classic') });
      const r = await c.commission((corr) => host.run(corr, 'classic'));
      const kept = beats(r.best, best);
      rung('conventional (self-tuned)', r.best,
        `${r.laps} laps, ${r.names ? r.names.length : 0} coefficients` + (kept ? '' : ' — NOT deployed'));
      if (kept) { this.classic = c; this.deployed.classic = true; best = r.best; }
      rep.classic = r;
    }

    // ---- ② THE PILOT, AND AS DEEP AS IT PAYS
    if (host.drivePilot) {
      for (let depth = 1; depth <= this.maxDepth; depth++) {
        const st = new Stack({ ...this.pilotOpts, channels: this.channels, uMax: this.uMax, depth });
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
          this.beginRun();
          r = await host.run(null);
          if (!beats(r.score, best)) { this.stack = prev.stack; this.deployed.stack = prev.depth; }
        }
        const kept = armed && beats(r.score, best);
        rung(`pilot cascade, depth ${depth}`, r.score,
          armed ? (kept ? null : 'no better than the rung below — stopping')
            : `nothing to deploy: ${st.verdict ? st.verdict.why : 'did not commission'}`);
        if (!kept) break;
        best = r.score;
      }
    }

    // ---- ③ THE LAP-PERIODIC LAYER, LAST, AND ONLY IF THE PROGRAM REPEATS
    if (this.periodic) {
      const h = new HarmonicFF({ lap: this.periodic, channels: this.channels.length,
        uMax: this.authority('hff') });
      const r = await h.commission((corr) => host.run(corr, 'hff'));
      const kept = beats(r.best, best);
      rung('lap-periodic (harmonic)', r.best,
        `${r.laps} laps, probe ${r.style} at ${(100 * r.frac).toFixed(0)}%`
        + (kept ? ' — a MEMORY: it will not transfer to another program' : ' — NOT deployed'));
      if (kept) { this.hff = h; this.deployed.hff = true; best = r.best; }
      rep.hff = r;
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
    if (this.deployed.stack && this.stack) for (const p of this.stack.layers) if (p._initRun) p._initRun();
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
  act(ctx) {
    const nc = this.channels.length, out = new Array(nc).fill(0);
    const add = (u, name) => {
      const w = this.into(u, name, ctx);
      for (let c = 0; c < nc; c++) out[c] += w[c];
    };
    if (this.deployed.classic && ctx.v) add(this.classic.live(ctx.v, ctx.a), 'classic');
    if (this.deployed.stack && ctx.look) add(this.stack.act(ctx.look), 'stack');
    if (this.deployed.hff && ctx.k !== undefined) add(this.hff.at(ctx.k), 'hff');
    if (Number.isFinite(this.uMax)) {
      for (let c = 0; c < nc; c++) out[c] = Math.max(-this.uMax, Math.min(this.uMax, out[c]));
    }
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
