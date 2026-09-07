/**
 * @file THE ARM'S HOST FOR `AutoStack`, SHARED BY THE BAR AND THE PAGE.
 *
 * `AutoStack` needs a host: something that drives the machine for a scored run, and drives a
 * Stack's phase machine while the pilot commissions. Everything the ladder measures depends
 * on the details of that host — which signals it observes, which frame each rung's error is
 * expressed in, whether the rungs below the pilot are armed while it commissions, how the
 * look-ahead is indexed. Get one of those wrong and the ladder is still perfectly
 * self-consistent; it is just describing a different machine.
 *
 * WHICH IS WHY THIS IS ONE MODULE AND NOT TWO. The Node bar measures 22.42x on this arm. If
 * the page built its own host, the number on the screen would be from a machine nobody
 * measured, and every check would still pass — this project has that exact failure on record
 * for the Path tab's mode ⑧, whose first version contained neither half of what it claimed
 * while every wiring assertion held. The page and the bar import the same host so the page
 * runs the tested configuration by construction rather than by review.
 *
 * The browser difference is scheduling, not behaviour: `yieldEvery` lets a host await a frame
 * mid-run so the tab stays alive. `test/pilot/yield.test.mjs` pins that a yielding host
 * reaches an identical result, rung row for rung row.
 */
import { AutoStack } from '../pilot/autostack.js';
import { driveTo } from './approach.js';
import { motionBasis } from '../pilot/classic.js';
import { ContourScore, decompose } from './contour.js';
import { designDemoPaths, designTour } from './demopath.js';

/**
 * @param {object} o
 * @param {() => Promise<{arm,l1,l2,servo,rc,borrowed?}>} o.makeMachine  a machine, wherever
 *   it is; the host DRIVES it to each run's start. Called once (`reuseMachine`) or once per
 *   scored run. `borrowed: true` marks a machine the caller owns and keeps.
 * @param {object} o.path       a ToolPath; `path.at(k)` and `path.tangent(u)`
 * @param {number} o.lap        samples in one lap
 * @param {number} o.K          gearbox stiffness — sizes the pilot's authority
 * @param {number[]} o.centre   the joint pose the channels are centred on
 * @param {number} [o.avg=4]    settled laps averaged into the error signal and the score
 * @param {number} [o.warmup=2]  laps run before scoring begins. Covers the machine's
 *   transient AND the deployed correction's own — only the first is removed by
 *   `reuseMachine`, so this is a knob to measure against, not a free saving.
 * @param {boolean} [o.lapSync=false]  re-phase the cascade's decision tick at every lap start (measured worse; off)
 * @param {boolean} [o.banded=true]    identify and invert h with h±1 together
 * @param {number} [o.yieldEvery=0]    await after this many samples; 0 never yields
 * @param {Function} [o.onYield]       what to await — a frame, in a browser
 * @param {Function} [o.onRung]        called with each rung row as it is measured
 * @param {Function} [o.onStage]       called as a rung enters each stage of its own plan:
 *   `{stage, i, of, ends, plan}`. `onRung` fires on rung COMPLETION and `onProgress` proves
 *   liveness; this is the one that says how far through and what has to happen next.
 * @param {number} [o.maxDepth=2]  ceiling on cascade layers. 1 commissions a SINGLE pilot and
 *   never builds a second layer, which is a caller policy rather than a default: the bar keeps
 *   2 because its 22.42x is recorded there, and the page sets 1. Depth is still MEASURED below
 *   the ceiling — a layer that cannot vouch for itself ends the stack either way.
 * @param {boolean} [o.reuseMachine=true]  build ONE machine and DRIVE it to each run's start
 *   from wherever the last run left it, instead of rebuilding. `false` rebuilds per run. A
 *   host that reuses must be `dispose`d unless `makeMachine` returned `borrowed: true`.
 * @param {number} [o.feed=path.feed]  the tool speed the approaches between runs are timed at
 * @param {object} [o.approachPolicy]  the settle read at each run's start (see `approach.js`)
 * @param {Function} [o.onProgress]    a HEARTBEAT at every yield: `{what, run, lap, laps, k,
 *   LAP, phase}`. `onRung` fires on rung COMPLETION, and the lap-periodic rung takes 18 of
 *   the ladder's 32 minutes in Node and longer in a browser — so between two table rows the
 *   ladder is silent for the majority of its runtime, and an operator cannot tell a long
 *   measurement from a hung tab. This reports where it is, always.
 */
/**
 * WHICH PROGRAM THIS IS, cheaply and deterministically.
 *
 * The lap-periodic rung's table is addressed by position in a lap, so it is only valid on the
 * program it was formed on — measured, not assumed: across five programs and four feedrates
 * the table is a net negative, and its worst cell is a change of SHAPE at the commissioning
 * feedrate. `AutoStack` withholds it off its own program, and this is how the two are
 * compared.
 *
 * BOTH HALVES MATTER. The LAP LENGTH catches a feedrate change, the coarse case. The
 * reference SAMPLES catch a change of shape at the SAME lap length, which the length alone
 * cannot see and which is exactly the worst cell on the bench.
 *
 * EXPORTED BECAUSE THE BENCH NEEDS IT TOO, and needs the same one. The first bench built its
 * own context without a signature at all, so `ctx.program` was undefined, the guard never
 * fired, and a run intended to measure the guard measured the unguarded ladder a second time
 * — returning a number identical to the previous run, which is what gave it away.
 *
 * @param {{at:(k:number)=>{x:number,y:number}}} path
 * @param {number} lap  samples in one lap
 */
export function programSignature(path, lap) {
  let h = 0x811c9dc5;
  const mix = (x) => {
    // Quantised so the signature is stable under the last bits of arithmetic, and fine
    // enough that two different programs cannot collide by rounding.
    h ^= Math.round(x * 1e6) | 0;
    h = Math.imul(h, 0x01000193) | 0;
  };
  mix(lap);
  // A SUBSAMPLE, NOT THE WHOLE LAP: 64 points spread over the program distinguish any two
  // shapes this tab can build, and cost nothing to compute once.
  for (let i = 0; i < 64; i++) {
    const c = path.at(Math.floor(i * lap / 64));
    mix(c.x); mix(c.y);
  }
  return h;
}

export function makeArmHost(o) {
  const { makeMachine, path, lap: LAP, K, centre } = o;
  const AVG = o.avg ?? 4;
  // LAPS RUN BEFORE SCORING STARTS, and they cover TWO transients that are easy to conflate.
  //
  //  (a) the MACHINE's — what the approach's settle left in it (plan §52.12: the host reads
  //      "arrived" at 1e-4 of tool travel, and what remains is exactly what these laps are
  //      for; measured, the delivered number does not move against a bit-identical restore);
  //  (b) the CORRECTION's — a deployed pilot ramps its output over its own cadence and a
  //      lap-periodic table only applies once the lap is under way. That one is NOT removed
  //      by restoring anything, because it is a property of the controller, not the plant.
  //
  // So this is a knob to be MEASURED against, not a saving to be assumed: it is tempting to
  // read "the machine starts settled now" as "the warmup is free to delete", and (b) says
  // otherwise. Default unchanged.
  const WARMUP = o.warmup ?? 2;
  // PROBE GRADE, OPT-IN (`probeLaps: {warmup, avg}`): the conventional rung's commissioning
  // runs — baseline, probes, refinement trials — are IDENTIFICATION, not decisions, and
  // paying decision-grade measurement (2 warmup + 4 averaged laps) for each of them is the
  // largest remaining commissioning cost after the exits. Applied ONLY to runs the rung
  // labels 'classic'; every deploy re-score and ladder decision keeps full grade. Omitted,
  // nothing changes anywhere.
  const PROBE = o.probeLaps || null;
  // RE-PHASING THE CASCADE AT EVERY LAP START IS OPT-IN, BECAUSE IT MEASURED WORSE. With the
  // look-ahead read exactly at the decision step (below), the old `lapSync` index has nothing
  // left to do; what remains is restarting the pilot's decision tick and ring at each lap so
  // every lap is decided at the phase commissioning used. Measured on the bench square, the
  // cascade reads 4.7557e-1 (2.23x) free-running and 4.8406e-1 (2.19x) re-phased — a nine-step
  // hold at every seam is a cost and the phase pattern is not a benefit — while the distilled
  // row is byte-identical either way (plan §52.15). So it ships off, and the page runs the same.
  const lapSync = o.lapSync === true;
  const banded = o.banded !== false;
  const yieldEvery = o.yieldEvery || 0;
  const onYield = o.onYield || (() => Promise.resolve());
  // A REPORTER MUST NOT BE ABLE TO FAIL A MEASUREMENT — the same contract `AutoStack` gives
  // `onRung`. Whatever the host does with this, the ladder carries on.
  const onProgress = o.onProgress
    ? (d) => { try { o.onProgress(d); } catch { /* a reporter must not fail a run */ } }
    : null;
  let runNo = 0;                    // runs begun: the coarsest progress signal there is
  // ---- MACHINE SAMPLES SPENT, WHICH IS WHAT COMMISSIONING COSTS ON A REAL MACHINE.
  //
  // Wall clock measures the SIMULATOR. On a plant, commissioning is laps: the machine is
  // producing nothing while the ladder scores rungs, and that time is the thing an owner
  // actually pays. CLAUDE.md's target 4 says so outright — "a number that counts only the
  // arithmetic is measuring the half that is free" — and until now this project had no
  // instrument for the other half on this arm.
  //
  // Counted AT EVERY `arm.step` in this file, so it cannot drift from what runs (rule 30) —
  // a count kept beside a list of call sites would eventually describe the call sites the
  // file used to have, which is the same fault one level down. It does NOT count
  // `makeMachine`'s lattice settles: those are a property of building a SIMULATED arm and
  // have no counterpart on a real one.
  let mSamples = 0;

  // ---- ONE MACHINE, DRIVEN BETWEEN RUNS — NEVER RESTORED, NEVER TELEPORTED ----------------
  //
  // Every scored run needs to start from a comparable state, and the first way this host got
  // one was to snapshot the settled machine and RESTORE it before each run — bit-identical,
  // free, and a thing no machine can do. On screen it was the arm jumping to the start dozens
  // of times per commissioning; on a plant it would be a teleport. The owner's rule is that
  // the arm is CONTINUOUS, so the machine is built once and then DRIVEN to each run's start
  // from wherever the previous run left it, through the one planner every move in this
  // project uses (`approach.js`): a rapid at the program's feed, then a settle read by rule
  // 45 — the tool has not moved over a window — with a stated cap. What the previous run left
  // in the machine (link vibration, gearbox wind-up) is carried, as it would be on a plant.
  //
  // WHAT THAT COSTS, MEASURED (plan §52.12): the approach's settle is machine time the
  // restore did not spend, and each run now starts from a state the settle CONVERGED to
  // rather than the same bits — so the bench square through this host is re-measured beside
  // the restore's 0.2264 / 8.5 machine-minutes, and the delivered number moved by less than
  // the grade's own lap spread. `reuseMachine: false` still rebuilds per run (a machine
  // built AT the start is initialised there, which is not a move — every machine is
  // somewhere when it is switched on); `makeMachine` may return `borrowed: true` for a
  // machine the caller owns and keeps driving, which this host then never destroys.
  const reuseMachine = o.reuseMachine !== false;
  const FEED = o.feed ?? path.feed;
  // THE SETTLE IS SIZED TO WHAT THE RUN NEEDS, NOT TO WHAT THE EYE NEEDS. The page settles a
  // visible approach until the tool has moved less than 1e-5 over 300 steps, which on this
  // compliant arm takes thousands of steps of ringing to satisfy. Every scored run here runs
  // WARMUP laps before it scores precisely to absorb what is left of a transient, so the host
  // reads "arrived" at a tenth of that quiet — 1e-4 is 0.05% of the error being scored — and
  // caps the wait at 6,000 steps without calling it a fault. Measured on the bench square:
  // the page's policy costs 5.4 machine-minutes of settling per commissioning (8.5 → 13.9) for
  // a delivered 2.2648e-1 against the restore's 2.2635e-1 (plan §52.12).
  const POLICY = o.approachPolicy || { min: 500, window: 300, quiet: 1e-4, cap: 6000 };
  let heldM = null;
  /** Drive a machine to a joint pose, counted and yielded like every other step here. */
  async function approachTo(m, q) {
    const a = await driveTo(m.arm, m.servo, q, FEED,
      { onStep: () => { mSamples++; }, yieldEvery, onYield, policy: POLICY });
    if (m.servo.resetLimitStats) m.servo.resetLimitStats();
    return a;
  }
  /**
   * The machine, AT `target` — a joint pose, or a function of the arm returning one; the
   * program's own start when omitted. Reached by a drive from wherever the machine is.
   */
  async function acquire(target = null) {
    let m;
    if (!reuseMachine) m = await makeMachine();
    else { if (!heldM) heldM = await makeMachine(); m = heldM; }
    lastRc = m.rc;
    armRef = m.arm;
    const q = typeof target === 'function' ? target(m.arm, m.servo) : (target || refsFor(m.arm)[0]);
    await approachTo(m, q);
    return m;
  }
  async function release(m) {
    // ONE MACHINE OWNS ITS LATTICES across runs; a borrowed one is the caller's to destroy.
    if (reuseMachine || m.borrowed) return;
    await m.l1.destroy(); await m.l2.destroy();
  }
  /** Destroy the held machine, if any and if it is ours. A host that reuses one must be disposed. */
  async function dispose() {
    if (!heldM) return;
    const m = heldM; heldM = null;
    if (m.borrowed) return;
    await m.l1.destroy(); await m.l2.destroy();
  }

  // The reference's own world velocity and acceleration, for the conventional rung's basis.
  const wv = [new Float64Array(LAP), new Float64Array(LAP)];
  const wa = [new Float64Array(LAP), new Float64Array(LAP)];
  for (let k = 0; k < LAP; k++) {
    const c = path.at(k);
    wv[0][k] = c.vx; wv[1][k] = c.vy; wa[0][k] = c.ax; wa[1][k] = c.ay;
  }

  /**
   * WHICH PROGRAM THIS IS, cheaply and deterministically.
   *
   * The lap-periodic rung's table is addressed by position in a lap, so it is only valid on
   * the program it was formed on — measured, not assumed: across five programs and four
   * feedrates the table is a net negative, and its worst cell is a change of SHAPE at the
   * commissioning feedrate. `AutoStack` withholds it off its own program, and this is how the
   * two are compared.
   *
   * Both halves matter. The LAP LENGTH catches a feedrate change, which is the coarse case.
   * The reference SAMPLES catch a change of shape at the same lap length, which the length
   * alone cannot see and which is exactly the worst cell on the bench.
   */
  const PROGRAM = programSignature(path, LAP);
  // THE DEPLOYED MACHINE FOLLOWS THE PROGRAM ON SCREEN, NOT THE ONE IT COMMISSIONED ON.
  // `actAt` used to read the commissioning path's reference table and its frozen program
  // signature, so after the operator switched programs the deployed cascade's look-ahead
  // fed moves the machine was not making, and the lap-periodic guard compared the frozen
  // signature to itself and applied its table to every program — measured on the page as a
  // sharp square at 5.97e-1 against a 5.5e-1 open loop, the 0.53x memory-off-program
  // failure this project has on record twice. Every check passed, because the scored runs
  // only ever drive the commissioning path, where frozen and live are the same thing
  // (rule 58: the deployed machine survives a program switch; these were its not-rebuilt
  // dependencies). `attach` re-arms this state; without a live path it keeps the
  // commissioning values, so every existing caller is byte-identical.
  const DEPLOY = { path, lap: LAP, T: path.lap, refs: null, program: PROGRAM, lastKr: -1 };

  let armRef = null;                 // the arm currently being driven, for the frame maps
  let servoRef = null;               // and its servo, for the baseline feedforward on deploy
  let lastRc = null;                 // the compliance the scored runs ran ON TOP OF
  let REFS = null;                   // the joint reference, constant for a fixed path
  const refsFor = (arm) => {
    if (REFS) return REFS;
    REFS = new Array(LAP);
    for (let k = 0; k < LAP; k++) { const c = path.at(k); REFS[k] = arm.ik(c.x, c.y, true); }
    return REFS;
  };
  /*
   * WHAT THE DISTILLED POLICY READS AT EACH OFFSET (`distilRef`, plan §52.16). 'angles' is the
   * commanded joint pose — what shipped. But a compliant arm's error is gearbox wind-up and
   * link bend, and both are LINEAR IN THE REFERENCE TORQUE (tau / K, and the beam under its
   * load), not in the angle: a window of angles has to reconstruct cos(q) and M(q)·alpha
   * through a linear map, which is the representational ceiling the in-sample numbers sit at
   * (5-7x under every engine against the converged prefix's 9-11x). 'torques' hands it the
   * rigid-body inverse dynamics of the reference — computed, never learned (rule 40) — scaled
   * by the plant's own hold torque so the rows are O(1); 'both' stacks the two.
   */
  // 'both' ships: 6.05x against 5.65x on the bench square, 3.96x against 4.00x on the soft cell.
  const distilRef = o.distilRef || 'both';
  const refDimOf = distilRef === 'both' ? 4 : 2;
  const refRow = (arm, servo, p, k) => {
    const c = p.at(k);
    const q = arm.ik(c.x, c.y, true);
    if (distilRef === 'angles') return q;
    const rt = arm.ikRates(q[0], q[1], c.vx, c.vy, c.ax, c.ay);
    const tj = servo.jointTorques([{ theta: q[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    // Scaled by the DRIVE'S OWN LIMIT at the load (motor limit times the ratio): the rows are
    // then bounded by physics at |1| — the hold torque as a scale put a corner's inertial spike
    // at 19 and the streaming fit diverged (held-out R² -14,446).
    const sc = 1 / Math.max(1e-12, servo.tauMax * arm.j1.N);
    const t = [tj[0] * sc, tj[1] * sc];
    return distilRef === 'torques' ? t : [q[0], q[1], t[0], t[1]];
  };
  let REFX = null;
  const refsXFor = (arm, servo) => {
    if (REFX) return REFX;
    REFX = new Array(LAP);
    for (let k = 0; k < LAP; k++) REFX[k] = refRow(arm, servo, path, k);
    return REFX;
  };
  /** World (dx, dy) into joint offsets at the pose the machine is commanded to. */
  const worldToJoint = (u, ctx) => {
    const J = armRef.jacobian(ctx.q[0], ctx.q[1]);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!(Math.abs(det) > 1e-12)) return [0, 0];
    return [(J[1][1] * u[0] - J[0][1] * u[1]) / det, (-J[1][0] * u[0] + J[0][0] * u[1]) / det];
  };

  const stackAuth = Math.min(2.0, 0.15 * (16 / K));
  // THE DISTILLED RUNG REPLACES THE COMPLIANCE FEEDFORWARD RATHER THAN SITTING UNDER IT —
  // the composition `test/_distil.mjs` measured, and the default (plan §52.8). The training
  // runs converge without the feedforward and the rung deploys without it; every run that
  // applies the rung, or is scored with it deployed, goes bare, while the base and the rungs
  // below keep the feedforward, so the gate still compares against the conventional machine.
  // Measured with the pilot teacher at the ±256-sample window and the 0.10 cap: bare 0.217
  // against 0.338 under the feedforward. With the hff teacher it was a null (1.43x against
  // 1.36x); `distilReplaces: false` keeps the other composition reachable.
  const distilReplaces = o.distilReplaces !== false;
  const bareFor = (name) => distilReplaces
    && (name === 'distil' || !!(auto.deployed && auto.deployed.distil));
  const auto = new AutoStack({
    // THE COMMON FRAME IS JOINT SPACE, because that is where the pilot was measured to work
    // and where the machine is commanded. The conventional rung lives in WORLD and declares
    // a map into it; the lap-periodic rung reads joint space, which is where its operator
    // varies least (44% and 128 degrees in world against 11.9% and 9.5 in joint).
    channels: [0, 1].map((j) => ({ lo: centre[j] - 0.55, hi: centre[j] + 0.55,
      vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
    // THE LAP-PERIODIC RUNG IS THE RETIRED MEMORY: nothing addressed by position in a
    // lap survives the retirement, and the measured one-press runs without it. It stays
    // available (`lapMemory: true`, the default, keeps the recorded 22.42x bar
    // byte-identical) but a product surface passes false and ships the model-only ladder.
    uMax: 3.0, periodic: o.lapMemory === false ? null : LAP, maxDepth: o.maxDepth ?? 2,
    // The look-ahead is read at the in-lap step exactly (see `run()`), so the ladder's
    // phase-walk diagnostic — written for a look-ahead pinned to a walking grid — does not apply.
    lapSynced: true,
    // THE CONVENTIONAL RUNG IS A CALLER POLICY TOO. `basis` is what unlocks it — AutoStack's
    // `if (this.basis)` — so `classic: false` skips it with no new switch in the ladder.
    //
    // MEASURED BOTH WAYS ON THIS ARM, at both cells that have a recorded reference. At
    // K 0.25 / E 0.03 the ladder commissions it (23 laps, two of four minutes), scores it
    // 1.07x, then measures that building on it makes the cascade WORSE and discards it —
    // "a cheap rung that costs an expensive one". Removed, the same ladder delivers
    // 2.7878e-1 in TWO minutes instead of four: identical to four significant figures, half
    // the clock (rule 21 — the thing that should not change comes back unchanged and only
    // the cost moves). At K 1 / E 0.06 the bar withholds it as well.
    //
    // AND IT IS NOT A LIBRARY DEFAULT, because the EMPS axis says the opposite and says it
    // twice over: there the ladder ships this rung ALONE at 424.8x, and removing it does not
    // merely cost 2.2x (196.2x) — it makes the ladder fall back to a THREE-layer cascade and
    // the retired lap-periodic rung, so the cheapest thing in the ladder is what keeps the
    // most expensive things out. Four plants that refuse everything are indifferent. One
    // plant of six wants it gone; one needs it; this is the one that wants it gone.
    basis: o.classic === false ? null
      : motionBasis([{ v: wv[0], a: wa[0] }, { v: wv[1], a: wa[1] }]),
    // EVERY RUNG'S AUTHORITY IS DERIVED FROM THE PLANT, INCLUDING THE DISTILLED ONE. Without
    // its own frame `authority('distil')` fell through to the common cap (3.0), while the stack
    // and the lap-periodic rung got `stackAuth` (2.0 at K 0.25) — so the training prefixes it
    // regressed were capped at one number and the rungs it is compared against at another. A
    // constant right for one rung, carried to another unmeasured (rule 31). Stated as a repair
    // of the derivation, not as the cause of any score: the 0.22x measured at demo grade was
    // taken before this and is not attributed to it.
    frames: { classic: { uMax: 1.5, map: worldToJoint }, stack: { uMax: stackAuth },
      hff: { uMax: stackAuth }, distil: { uMax: o.distilCap ?? stackAuth } },
    hff: { passes: o.passes ?? 24, banded },
    // THE OFF-DIAGONAL SOLVE AND ITS SCALE, both caller policy and both default OFF.
    //
    // This arm is a coupled 2x2 and the pilot inverts a DIAGONAL, which is measured as the
    // mechanism behind the bowed edges on a sharp corner: at feed 1.6e-2 the shoulder-to-elbow
    // cross response (0.542) is LARGER than the elbow's own (0.484), while at 4.0e-3 the same
    // pair reads 0.234 against 0.974. Arming `mimo` alone is worth up to 2x on a cell and
    // HARMFUL on a third of those measured, because the held probe fixes the cross kernel's
    // scale at rest at one pose; `crossGain: 'auto'` lets the ladder propose a scale from its
    // own delivered ratio and SCORE it, keeping the diagonal when the proposal loses.
    //
    // Default off on both counts because `mimo` costs nc^2 solve blocks against nc, which
    // target 6 counts, and because it makes the extruder barrel worse on every zone — so it is
    // a plant-by-plant decision an operator takes, not a library default (rule 31).
    ...(o.mimo ? { crossGain: o.crossGain ?? 'auto' } : {}),
    // GUIDED COMMISSIONING: laps run with the TRACKER STILL ATTACHED after the cascade rung
    // commissions, then frozen. A commissioning instrument and never a deploy mode — the ladder
    // nulls adaptation the moment the phase ends and re-scores with truth gone, and keeps the
    // guided model only if that frozen score is better. Measured on this arm at 6 laps: 9 of 9
    // cells better over three seeds and three programs, geometric mean 1.79x, worst 1.07x, and
    // the programs it never ran gain most. Default 0 — the shipped ladder runs no guided phase.
    guidedLaps: o.guidedLaps ?? 0,
    // ---- ②d THE DISTILLED RUNG, OPT-IN (`distil: {}` for the measured window).
    //
    // A LOG-SPACED, TWO-SIDED WINDOW ON THE COMMANDED REFERENCE. Two-sided because a
    // correction on a compliant arm must load the flex BEFORE the corner, and the matched
    // control settles it rather than the argument: the same tap count, span and spacing
    // translated so no tap lies in the future reads 0.89x — WORSE than doing nothing — against
    // 1.43x straddling. `DistilPolicy` refuses a causal-only window at construction for that
    // reason, so this geometry is a requirement and not a preference.
    //
    // Log spacing because the elbow's measured memory is 6363-8649 solver steps: a linear
    // window that reaches it costs a thousand taps, and geometric spacing keeps resolution
    // near t=0 where the fast dynamics are while still reaching out.
    //
    // THE WINDOW IS STATED IN THE PILOT'S SAMPLES, AS IT WAS MEASURED (plan §52.8). This is
    // `test/_distil.mjs`'s `cmd` row — 23 offsets to ±256 pilot samples, no sign block, 47
    // features — which reads 6.40x on the sharp square from the bare machine. The rung
    // converts it at the stack's own sample (8 here, so ±2048 steps). The earlier raw ±512
    // with a sign block was that window ported in the wrong units and read a quarter of the
    // reach; it stays reachable through `distil.offsets` for the record, not as a default.
    // RIDGE 1e-3, NOT 1e-6 (rule 32): the delivered number is flat from 1e-6 to 1e-3 (6.05x /
    // 6.05x / 6.04x) and falls past it (5.97x at 1e-2, 5.68x at 1e-1), while the held-out R²
    // on the elbow reads 0.84 at 1e-3 against 0.76 at 1e-6 — the same policy, better conditioned.
    ...(o.distil ? { distil: { refDim: refDimOf, ridge: o.distil.ridge ?? 1e-3,
      ...(o.distil.offsets ? { offsets: o.distil.offsets } : { offsetsPerSample: o.distil.offsetsPerSample
        || [-256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256] }),
      ...(o.distil.signOffsets ? { signOffsets: o.distil.signOffsets }
        : { signOffsetsPerSample: o.distil.signOffsetsPerSample || [] }),
      // THE PLANT'S SIGN FOR DEPLOY-TIME ADAPTATION. On this arm the truth handed to
      // `observe` is actual - commanded in joint units and the correction ADDS to the
      // command, so a positive residual needs a NEGATIVE increment. Declared by the host
      // that defines the truth, never guessed by the block.
      adaptSign: o.distil.adaptSign ?? -1,
      // ONE ROW PER DECISION AND THE CORRECTION HELD BETWEEN — the harness's cadence.
      stride: o.distil.stride ?? 'pilot',
      // THE CASCADE IS THE TEACHER, NOT A CANDIDATE: the policy is scored against the machine
      // BELOW the cascade (plan §52.12). `distilTeacherOnly: false` scores it against the cascade.
      teacherOnly: o.distil.teacherOnly ?? o.distilTeacherOnly ?? true,
      // THE PARAMETRIC ENGINE (plan §52.16): iterate the policy rather than the signal.
      ...(o.distil.parametric !== undefined ? { parametric: o.distil.parametric } : o.distilParametric !== undefined ? { parametric: o.distilParametric } : {}),
      ...(o.distil.passes !== undefined ? { passes: o.distil.passes } : o.distilPasses !== undefined ? { passes: o.distilPasses } : {}),
      ...(o.distil.coverageFade !== undefined ? { coverageFade: o.distil.coverageFade } : {}),
      online: o.distil.online !== false } } : {}),
    // THE DEMO RUNG (②b): armed only when the caller supplies BOTH the demo paths to
    // record (`demoPath`) and the fit options (`demo`, `{}` for the measured defaults) —
    // one without the other is reported by the ladder, not silently ignored.
    ...(o.demo ? { demo: o.demo } : {}),
    onRung: o.onRung || null,
    onStage: o.onStage || null,
    pilot: {
      nMeasured: 6, autoRefuse: false, gateForecasts: false,
      uMax: stackAuth,
      probeAmp: 0.15 * Math.min(1.0, 0.15 * (16 / K)),
      ditherAmp: 0.1 * Math.min(1.0, 0.15 * (16 / K)),
      start: null,                    // filled by the caller from the path's first point
      guards: [], refusePartial: false,
      workspace: null,                // filled by the caller: it needs the arm's reach
      seed: 1,
      // THE SOLVER BUDGET, PASSED THROUGH RATHER THAN READ FROM AN ENVIRONMENT. `lib/` may
      // not touch `process` (rule 60), so the knob is a host option and the caller decides.
      // Omitted, the Pilot's own defaults apply and this arm runs exactly as measured.
      ...(o.horizonTs ? { horizonTs: o.horizonTs } : {}),
      ...(o.qpIters ? { qpIters: o.qpIters } : {}),
      ...(o.mimo ? { mimo: true } : {}),
    },
  });

  /** One scored run: the deployed rungs, plus `extra` when a rung is being probed. */
  const ZFF = { dq: [0, 0] };
  async function run(extra, name, laps, guided = false) {
    const bare = bareFor(name);
    const cheap = name === 'classic' && PROBE;
    const W = cheap ? PROBE.warmup : WARMUP;
    const A = cheap ? PROBE.avg : AVG;
    laps = laps ?? (W + A);
    runNo++;
    // BEFORE `makeMachine`, WHICH IS ITSELF TENS OF THOUSANDS OF STEPS. A heartbeat that
    // starts only once the scored loop is turning is silent through the settle.
    if (onProgress) onProgress({ what: name || 'scoring', run: runNo, lap: 0, laps, k: 0,
      LAP, phase: 'build' });
    const held = await acquire();
    const { arm, l1, l2, servo, rc } = held;
    armRef = arm;
    const R = refsFor(arm), RX = refsXFor(arm, servo);
    auto.beginRun();
    const sc = new ContourScore({ joints: 2 });
    const ex = new Float64Array(LAP), ey = new Float64Array(LAP);
    const lapE = [];
    let step = 0;
    try {
      // CONTINUOUS TIME, AS THE PAGE COUNTS IT. This loop restarted its step at every lap on
      // `ceil(lap)` steps while the program wraps at its fractional period, so the command
      // stepped BACK 0.4 steps at every seam — a one-step velocity discontinuity of 40% of
      // the feed once a lap that the page never has. `n` now counts through the whole run,
      // the command is `path.at(n)`, and `k` is the in-lap step by the TRUE period — the
      // index every lap-addressed thing (the look-ahead grid, the lap table, the error
      // arrays) is read at, exactly as `actAt` derives it on the page.
      const T = path.lap, total = Math.round(laps * T);
      let le = new Float64Array(LAP), l = 0, lastK = -1;
      for (let n = 0; n < total; n++) {
        const lNow = Math.min(laps - 1, Math.floor(n / T));
        if (lNow !== l) { lapE.push(le); le = new Float64Array(LAP); l = lNow; }
        const k = Math.min(LAP - 1, Math.floor(n - l * T));
        // RE-PHASED AT THE LAP START: the cascade's decision tick and ring sample restart with
        // the in-lap index, so every lap is decided at the phase commissioning used.
        if (lapSync && k <= lastK) auto.syncLap();
        lastK = k;
        {
          const cmd = path.at(n);
          const [c1, c2] = arm.ik(cmd.x, cmd.y, true);
          const r = arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
          const base = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
            { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
          const ff = bare ? ZFF : rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base), { enableToolff: false });
          const S = auto.stack ? auto.stack.sample : 1;
          // (The lap-start re-phasing above is what the old `lapSync` index did for the look-ahead
          // grid alone — measured 20.70x → 22.42x when the phase walk was first found.)
          // EXACT AT THE STEP IT IS READ. It was `R[(floor(k / S) + off) * S]` — the look-ahead
          // pinned to the lap's sample grid while the pilot decides on its own tick, which put
          // "now" up to 8 steps behind the machine at every decision. Commissioning's verify
          // reads its look-ahead at the decision step itself; so does this.
          const look = (off) => R[(((k + off * S) % LAP) + LAP) % LAP];
          // THE UNDECIMATED LOOK-AHEAD, for the rung whose window is in raw samples. The
          // cascade reads `look`, on its own cadence grid; the distilled rung regresses a
          // prefix indexed by the machine's step and must read the reference on that grid.
          const lookRaw = (off) => RX[(((k + off) % LAP) + LAP) % LAP];
          const ctx = { v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k, look, lookRaw,
            q: [c1, c2], speed: Math.hypot(cmd.vx, cmd.vy), program: PROGRAM };
          const u = auto.act(ctx, extra ? extra.at(k) : null, name);
          const tau = servo.torques([{ ...base[0], theta: c1 + ff.dq[0] + u[0] },
            { ...base[1], theta: c2 + ff.dq[1] + u[1] }]);
          arm.step(tau[0], tau[1], 1); mSamples++;
          const en = arm.encoders();
          // THE TRACKER, DURING COMMISSIONING ONLY, and only when a caller asks for it.
          //
          // A scored run normally hands `observe` measured signals and NOTHING else, because
          // truth is an installation property the deployed machine does not have. But truth IS
          // available at commissioning, and a few laps of it refine the scribble-fitted
          // posterior into a better model of the PLANT: measured on this arm at depth 1 over
          // three seeds and three programs, 9 of 9 cells improve, geometric mean 1.79x, worst
          // 1.07x — and the two programs the adaptation never ran gain MORE than the one it did
          // (circle 2.73x geometric against rounded's 1.79x), which is what a plant model does
          // and a memory does not.
          //
          // `guided` is therefore a COMMISSIONING phase, never a deploy mode: the caller runs it,
          // freezes, and every scored number after it is taken with the tracker gone. Passing
          // truth on a run that is not guided would make a deployed score depend on an
          // instrument the deployed machine does not carry, which is the one thing this must
          // never do.
          const jt = guided
            ? worldToJoint([arm.toolXY()[0] - cmd.x, arm.toolXY()[1] - cmd.y], { q: [c1, c2] })
            : null;
          auto.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
            tau[0] * 1e3, tau[1] * 1e3], jt);
          const d = decompose(path, arm.toolXY(), cmd);
          le[k] = d.contour;
          if (l >= laps - A) {
            sc.step(d.contour, d.lag, tau, [arm.j1.wM, arm.j2.wM]);
            // THE WHOLE TOOL ERROR, in the frame the rung asking for it corrects in.
            // Narrowing it to the contour component cost half the benefit: the projection
            // onto a rotating normal is itself a lap-varying operator.
            const tp = arm.toolXY();
            let gx = tp[0] - cmd.x, gy = tp[1] - cmd.y;
            if (name === 'hff') { const j = worldToJoint([gx, gy], { q: [c1, c2] }); gx = j[0]; gy = j[1]; }
            ex[k] += gx / A; ey[k] += gy / A;
          }
          if (yieldEvery && ++step % yieldEvery === 0) {
            if (onProgress) onProgress({ what: name || 'scoring', run: runNo, lap: l + 1,
              laps, k, LAP, phase: 'run' });
            await onYield();
          }
        }
      }
      lapE.push(le);
    } finally {
      // DESTROY EVEN ON A THROW. The page aborts a commission by throwing out of its yield
      // point, and a bare `destroy()` after the loop leaks two lattices on every scored run
      // — on WebGPU that is buffers, not memory, and the next build inherits them (rule 57).
      await release(held);
    }
    const rep = sc.report();
    // This run's own uncertainty, on the same quantity as the score: the standard error of
    // the per-lap contour rms across the laps it pooled, on successive differences so a
    // drift cannot inflate it.
    const rl = [];
    for (let l = laps - A; l < laps; l++) {
      let s2 = 0;
      for (let k = 0; k < LAP; k++) s2 += lapE[l][k] * lapE[l][k];
      rl.push(Math.sqrt(s2 / LAP));
    }
    const df = [];
    for (let i = 1; i < rl.length; i++) df.push(rl[i] - rl[i - 1]);
    const dMu = df.reduce((x, y) => x + y, 0) / Math.max(1, df.length);
    const dVa = df.reduce((x, y) => x + (y - dMu) * (y - dMu), 0) / Math.max(1, df.length - 1);
    const band = (nh) => {
      let inb = 0, tot = 0;
      for (let c = 0; c < 2; c++) {
        const e = c ? ey : ex;
        let dc = 0;
        for (let k = 0; k < LAP; k++) dc += e[k];
        dc /= LAP;
        for (let k = 0; k < LAP; k++) tot += (e[k] - dc) * (e[k] - dc);
        for (let h = 1; h <= nh; h++) {
          let a2 = 0, b2 = 0;
          for (let k = 0; k < LAP; k++) {
            const x = 2 * Math.PI * h * k / LAP;
            a2 += (e[k] - dc) * Math.cos(x); b2 -= (e[k] - dc) * Math.sin(x);
          }
          inb += 2 * (a2 * a2 + b2 * b2) / LAP;
        }
      }
      return tot > 0 ? inb / tot : null;
    };
    // THE SCORE IS THE WHOLE DEVIATION, contour AND lag. It was the contour component alone,
    // on the argument that a lag leaves the part the right shape and only the cycle slower —
    // which holds for a UNIFORM lag on one closed contour and nowhere else. The consequence
    // was that the ladder chose every rung, every depth and every prefix against half of its
    // own error, while `lagRms` sat in the report being looked at by nobody. Note the pilot's
    // truth on this arm was ALREADY the whole tool error in joint space (narrowing it to the
    // contour component cost half the benefit, brick 76), so the machine was being corrected
    // for both and scored on one — the two halves of the same object disagreeing, which is
    // the shape rule 6 exists to catch.
    // BOTH COMPONENTS STAY IN THE REPORT, because they have different causes and different
    // fixes; what changes is that a rung can no longer buy one with the other unseen.
    return { score: rep.totalRms, contour: rep.contourRms,
      err: [ex, ey], bias: rep.contourBias, osc: rep.contourOsc,
      lag: rep.lagRms, lapE, band,
      spread: Math.sqrt(Math.max(0, dVa / 2) / rl.length),
      drift: dMu * (rl.length - 1),
      bands: Object.fromEntries([4, 8, 16, 32, 64].map((nh) => [nh, band(nh)])) };
  }

  /** Drive a Stack's phase machine in JOINT space, with the rungs below it armed. */
  async function drivePilot(st) {
    const held = await acquire();
    const { arm, l1, l2, servo, rc } = held;
    armRef = arm;
    let guard = 0, step = 0;
    try {
      while (st.phase !== 'done' && guard++ < 4e6) {
        if (st.phase === 'fit') {
          st.work();
          // THE FIT ADVANCES NO STEP COUNTER, so it is the one phase a step-based heartbeat
          // cannot see — and it is where ⑤ silently died for months.
          if (onProgress) onProgress({ what: 'pilot', run: runNo, phase: st.phase, k: step });
          if (yieldEvery) await onYield();
          continue;
        }
        const cmd = st.command();
        const tgc = servo.jointTorques(cmd.map((c) => ({ theta: c.pos, omega: c.vel, alpha: c.acc })));
        const ff = rc.feedforward([[1, 0], [0, 1]], tgc, { enableToolff: false });
        // The rungs below are armed while it commissions, because they will be armed when it
        // deploys — and fed the rates in THEIR OWN frame. Handing joint rates to a
        // world-fitted basis and mapping back through J-inverse is two frame errors that do
        // not cancel: it drove this rung from 2.88x to 0.96x.
        const Jc = arm.jacobian(cmd[0].pos, cmd[1].pos);
        const wvx = Jc[0][0] * cmd[0].vel + Jc[0][1] * cmd[1].vel;
        const wvy = Jc[1][0] * cmd[0].vel + Jc[1][1] * cmd[1].vel;
        const wax = Jc[0][0] * cmd[0].acc + Jc[0][1] * cmd[1].acc;
        const way = Jc[1][0] * cmd[0].acc + Jc[1][1] * cmd[1].acc;
        const below = auto.actBelow('stack', { v: [wvx, wvy], a: [wax, way],
          q: [cmd[0].pos, cmd[1].pos] });
        const refs = cmd.map((c, j) => ({ theta: c.pos + c.u + ff.dq[j] + below[j],
          omega: c.vel, alpha: c.acc }));
        const tau = servo.torques(refs);
        arm.step(tau[0], tau[1], 1); mSamples++;
        const en = arm.encoders(), tool = arm.toolXY();
        const q1 = cmd[0].pos, q2 = cmd[1].pos;
        const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
        const cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
        const J = arm.jacobian(q1, q2);
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        const exw = tool[0] - cx, eyw = tool[1] - cy;
        st.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
          tau[0] * 1e3, tau[1] * 1e3],
        [(J[1][1] * exw - J[0][1] * eyw) / det, (-J[1][0] * exw + J[0][0] * eyw) / det]);
        if (yieldEvery && ++step % yieldEvery === 0) {
          if (onProgress) onProgress({ what: 'pilot', run: runNo, phase: st.phase, k: step });
          await onYield();
        }
      }
    } finally {
      // DESTROY EVEN ON A THROW. The page aborts a commission by throwing out of its yield
      // point, and a bare `destroy()` after the loop leaks two lattices on every scored run
      // — on WebGPU that is buffers, not memory, and the next build inherits them (rule 57).
      await release(held);
    }
  }

  /**
   * POINT THE FRAME MAPS AT A LIVE ARM, for deployment rather than commissioning.
   *
   * `worldToJoint` closes over whichever arm the host is currently driving, and during
   * commissioning that is the throwaway machine each scored run builds. A page deploying the
   * ladder afterwards drives its OWN arm, and without this the conventional rung's world
   * correction would be mapped through the Jacobian of a machine that no longer exists —
   * a frame error that produces plausible numbers rather than an exception.
   */
  function attach(arm, servo, rc, livePath, liveLap) {
    armRef = arm; servoRef = servo || null;
    if (rc) lastRc = rc;
    if (livePath) {
      DEPLOY.path = livePath;
      DEPLOY.T = liveLap ?? livePath.lap;       // the TRUE, fractional lap period
      DEPLOY.lap = Math.ceil(DEPLOY.T);
      DEPLOY.refs = null; DEPLOY.refsX = null;
      DEPLOY.program = programSignature(livePath, DEPLOY.lap);
    } else { DEPLOY.refs = null; DEPLOY.refsX = null; }   // a new arm invalidates the cached tables either way
    DEPLOY.lastKr = -1;
    refsFor(arm);
  }

  /**
   * The deployed correction at sample k on a live arm, in joint angles. The look-ahead is
   * built the same way the scored runs build it — indexed from the lap start when
   * `lapSync` — so the pilot sees in deployment exactly what it saw while commissioning.
   */
  function actAt(k, cmd, refs) {
    const q = [refs[0].theta, refs[1].theta];
    const S = auto.stack ? auto.stack.sample : 1;
    const D = DEPLOY;
    if (!D.refs) {
      D.refs = new Array(D.lap);
      for (let j = 0; j < D.lap; j++) { const c = D.path.at(j); D.refs[j] = armRef.ik(c.x, c.y, true); }
    }
    if (!D.refsX) {
      D.refsX = new Array(D.lap);
      for (let j = 0; j < D.lap; j++) D.refsX[j] = refRow(armRef, servoRef, D.path, j);
    }
    const R = D.refs, RX = D.refsX, L = D.lap;
    // LAP-SYNCED, EXACTLY AS EVERY SCORED RUN WAS. The command wraps at the path's TRUE
    // lap period (fractional — 7356.6 here) while an index taken as k mod ceil(lap) wraps
    // at 7357, so a continuously-counted deploy slipped 0.4 steps of phase per lap between
    // the correction and the machine, forever. Commissioning never sees it: `lapSync`
    // restarts its counter each lap. Measured before this line existed: the identical
    // commissioned ladder, flat at 5.98e-2 for 15 laps under per-lap indexing, climbing
    // monotonically under the continuous counter — and on the real page (~12 s laps, ~90
    // laps in 18 minutes) the same slip compounded to 6x over the open loop. The deploy
    // path now derives its intra-lap position from the TRUE period, which is the same
    // discipline scoring has always had.
    const kIn = ((k % D.T) + D.T) % D.T;
    const kr = Math.floor(kIn);
    // EXACT AT THIS STEP, as in every scored run (see `run()`); and the cascade is re-phased
    // when the in-lap step wraps, as the scored runs re-phase it at every lap.
    if (lapSync && kr < D.lastKr) auto.syncLap();
    D.lastKr = kr;
    const look = (off) => R[(((kr + off * S) % L) + L) % L];
    const lookRaw = (off) => RX[(((kr + off) % L) + L) % L];
    // AND THE SAMPLE INDEX THE RUNGS READ IS THE IN-LAP ONE TOO. The paragraph above fixed
    // the look-ahead and left `ctx.k` as the continuous counter — which the lap table indexes
    // `k % ceil(lap)` (the same 0.4-step-per-lap slip, back through the other door) and the
    // distilled rung's hold reads `k % stride` (a decision phase that walked against the one
    // it was fitted at, since 7357 is not a multiple of 9). Every scored run hands `act()`
    // the in-lap step; so does this.
    const u = auto.act({ v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k: kr, look, lookRaw, q,
      speed: Math.hypot(cmd.vx, cmd.vy), program: D.program });
    // ---- THE BASELINE THE LADDER COMMISSIONED ON TOP OF, WHICH IS NOT OPTIONAL ----------
    //
    // Every scored run drives `theta = c + ff.dq + u`, where `ff` is the RobotComp
    // compliance identified on the machine. The ladder therefore models the error that
    // REMAINS after that feedforward, and its correction is only meaningful on a machine
    // carrying it. Deploying `u` alone hands a correction to a plant with a large error term
    // it was never shown, and the result is worse than doing nothing: measured on the page,
    // the ladder reported 1.7316e-2 and the machine delivered 3.5e-1 to 7.7e-1 against an
    // open loop of 4.1e-1.
    //
    // NOTHING CAUGHT IT, WHICH IS THE FAMILIAR PART. Every wiring check passed — selecting ⑨
    // does change the applied correction, the rung table is real, the commissioning is real.
    // It is mode ⑧'s defect exactly: an amputated half still changes the output. Rule 6 is
    // the answer, and `test/pilot/deploy.test.mjs` now asserts it: where two views show one
    // quantity, assert they AGREE — `actAt` must return what `run()` applies.
    // REFUSE, DO NOT DEGRADE. Returning `u` alone when the baseline is missing is exactly
    // the bug this function was just fixed for: a correction that is one term of two, handed
    // over as if it were whole, produces a plausible number and a worse machine. A caller
    // that has not supplied the baseline has not finished wiring the deployment, and saying
    // so at the first step beats discovering it from a contour trace (rule 51).
    if (!lastRc || !servoRef) {
      throw new Error('actAt: no baseline to deploy on — call attach(arm, servo[, rc]) with '
        + 'the servo, and commission (or pass the RobotComp) so the correction carries the '
        + 'compliance feedforward every scored run was driven with');
    }
    const ff = bareFor(null) ? ZFF : lastRc.feedforward([[1, 0], [0, 1]],
      servoRef.jointTorques(refs), { enableToolff: false });
    return [ff.dq[0] + u[0], ff.dq[1] + u[1]];
  }

  /**
   * OPEN-LOOP DEMO RECORDS FOR THE ②b BANKS (plan §37). The engineer's demo path is driven
   * with the machine AS THE PILOT'S COMMISSIONING TRUTH SAW IT — the conventional
   * compliance feedforward applied and the rungs below the stack armed, the pilot itself
   * silent — and routed and subsampled exactly as `drivePilot` routes, so the banks are
   * fitted on the quantity the deployed model corrects (rule 34) and a second copy of the
   * routing cannot drift (rule 61). Returns records in the `pilot._rec` shape, one per
   * demo path, or null when the host was built without a `demoPath`.
   */
  async function recordDemo(st) {
    // THE ENGINEER'S PROGRAM WINS; THE DESIGNED DEMO IS THE FALLBACK (plan §37, the
    // owner's contract). With `demo` armed and no `demoPath` supplied, the block designs
    // its own demo — `designDemoPaths`, the measured optimal-dynamics recipe (polygons +
    // stars across a feed ladder) — so the one press never needs a program to fit banks,
    // and a supplied program simply replaces the geometry, never the machinery.
    let paths = o.demoPath ? (Array.isArray(o.demoPath) ? o.demoPath : [o.demoPath]) : null;
    let designed = false;
    if (!paths && auto.demoOpts) {
      paths = designDemoPaths({ centre: o.demoCentre || [12, 0],
        ...(o.demoFeeds ? { feeds: o.demoFeeds } : {}) });
      designed = true;
    }
    if (!paths || !paths.length) return null;
    const S = st.sample;
    const recs = [];
    for (const dp of paths) {
      // DRIVEN to this program's start from wherever the last run ended — no held pose.
      const c0 = dp.at(0);
      const held = await acquire((a) => a.ik(c0.x, c0.y, true));
      const { arm, servo, rc } = held;
      armRef = arm;
      try {
        const x = [], cmd = [], e = [];
        const total = Math.ceil(dp.lap * 3);
        for (let k = 0; k < total; k++) {
          const c = dp.at(k);
          const [q1, q2] = arm.ik(c.x, c.y, true);
          const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
          const base = [{ theta: q1, omega: rt.dq[0], alpha: rt.ddq[0] },
            { theta: q2, omega: rt.dq[1], alpha: rt.ddq[1] }];
          const ff = rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base),
            { enableToolff: false });
          const Jc = arm.jacobian(q1, q2);
          const below = auto.actBelow('stack', {
            v: [Jc[0][0] * rt.dq[0] + Jc[0][1] * rt.dq[1],
              Jc[1][0] * rt.dq[0] + Jc[1][1] * rt.dq[1]],
            a: [Jc[0][0] * rt.ddq[0] + Jc[0][1] * rt.ddq[1],
              Jc[1][0] * rt.ddq[0] + Jc[1][1] * rt.ddq[1]],
            q: [q1, q2] });
          const refs = base.map((b, j) => ({ theta: b.theta + ff.dq[j] + below[j],
            omega: b.omega, alpha: b.alpha }));
          const tau = servo.torques(refs);
          arm.step(tau[0], tau[1], 1); mSamples++;
          if (k % S === 0) {
            const tool = arm.toolXY();
            const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
            const cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
            const det = Jc[0][0] * Jc[1][1] - Jc[0][1] * Jc[1][0];
            const exw = tool[0] - cx, eyw = tool[1] - cy;
            const en = arm.encoders();
            x.push([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
              tau[0] * 1e3, tau[1] * 1e3]);
            cmd.push([q1, q2]);
            e.push([(Jc[1][1] * exw - Jc[0][1] * eyw) / det,
              (-Jc[1][0] * exw + Jc[0][0] * eyw) / det]);
          }
          if (yieldEvery && k % yieldEvery === 0) await onYield();
        }
        recs.push({ x, cmd, e, lap: Math.round(dp.lap / S) });
      } finally { await release(held); }
    }
    if (designed) recs.designed = true;
    return recs;
  }

  /**
   * ---- TRAINING RUNS FOR THE DISTILLED RUNG (②d), on this arm (plan §§49-50).
   *
   * The rung converges a lap-periodic correction on SEVERAL programs and then regresses those
   * converged prefixes onto a local window of the COMMANDED REFERENCE, so what deploys is
   * addressed by the reference rather than by lap phase. This supplies the programs, and
   * nothing else: the convergence and the regression are the rung's, in `lib/pilot/`.
   *
   * THE DIET IS THE DESIGNED DEMO, NOT THE PRODUCTION PROGRAM. Plan §49.11's window trade is
   * the reason and it is forced: the window must REACH the plant's memory (6363-8649 steps on
   * this arm) and must not SPAN the training lap (a program lap is 7356), and on ONE closed
   * program the two cannot both hold — measured at +/-1024 samples, 24.93x on the programs it
   * was fitted on and 0.47x, worse than doing nothing, on one it was not. What breaks it is
   * training laps that DIFFER, which is exactly what `designDemoPaths` produces and what the
   * ②b banks already use. A caller with programs of its own passes `distilPath`.
   *
   * EVERY TEST PROGRAM IS THEREFORE HELD OUT BY CONSTRUCTION: the geometry comes from the
   * block's own designer and the machine's production program appears in no training set.
   *
   * The error is returned in JOINT SPACE, which is the frame the rung corrects in and the
   * same mapping `run()` uses for the lap-periodic rung — the projection onto a rotating path
   * normal is itself a lap-varying operator, and narrowing to it cost half the benefit there.
   */
  async function distilRuns() {
    let paths = o.distilPath ? (Array.isArray(o.distilPath) ? o.distilPath : [o.distilPath])
      : null;
    if (!paths && o.distilDiet && o.distilDiet.tour) {
      // A TOUR DIET (plan §52.16): long closed laps, several shapes each, so a window that
      // REACHES the plant's memory (rule 37) still spans a small fraction of the lap it is
      // fitted on (§41's aliasing theorem) — the two constraints that could not both hold on
      // a single polygon at the soft cell (§52.12).
      const t = o.distilDiet.tour;
      const mk = (sd) => { let z = sd >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
      const feeds = o.distilDiet.feeds || o.distilFeeds || [4e-3];
      paths = feeds.map((f, i) => designTour(mk((t.seed ?? 131) + 7 * i), f,
        { centre: o.demoCentre || [12, 0], nShapes: t.nShapes ?? 6, spread: t.spread ?? 1.6,
          rMin: o.distilDiet.rMin ?? 2.0, rSpan: o.distilDiet.rSpan ?? 1.6 }));
    }
    if (!paths) {
      // THE DIET IS A MEASURED OBJECT, NOT A DEFAULT. `designDemoPaths` alone is the `demo` diet
      // of plan §49 — a feed ladder at r 2.2-3.8 — which that harness measured at 0.22x-1.09x on
      // the square, worse than doing nothing, because it confounds FEED with SCALE against the
      // programs' r 4. The diet that carried §49's 4.99x is the same designer at the programs'
      // own scale (rMin 3.4, rSpan 2.4) and one feed; `distilDiet` hands those through.
      paths = designDemoPaths({ centre: o.demoCentre || [12, 0],
        ...(o.distilFeeds ? { feeds: o.distilFeeds } : o.demoFeeds ? { feeds: o.demoFeeds } : {}),
        ...(o.distilDiet ? Object.fromEntries(Object.entries(o.distilDiet).filter(([k]) => k !== 'tour')) : {}) });
    }
    if (!paths || !paths.length) return null;
    // THE TEACHER IS THE PILOT ONLY IF ONE WAS COMMISSIONED AND ADMITTED. `distilEngine:
    // 'pilot'` asks for it; a cascade that refused leaves nothing to iterate with, and the
    // rung falls back to `HarmonicFF` and says so through the report's `engine` field.
    const engine = (o.distilEngine ?? 'pilot') === 'pilot' && auto.stack
      && auto.stack.layers.some((p) => auto.stack._admitted(p));
    const DISTIL_PASSES = o.distilPasses ?? 4;
    // THE TEACHER'S CAP IS A REGULARISER, MEASURED AS A LADDER (plan §52.8). Bare machine,
    // ±256-sample window, stride 8, four passes, the sharp square from 1.059:
    //   cap   2.0      0.25     0.15     0.10     0.05
    //   rms   0.363    0.321    0.269    0.217    0.444
    // The prefix converges further at a looser cap (12-15x against 7-11x at 0.10) and teaches
    // a WORSE policy — §49's law, the cap standing where the tracker noise stood in §50.1 —
    // and at 0.05 four passes cannot converge it. 0.10 reproduces the harness's 0.213 to 2%
    // (that harness iterates its own pilot at 0.15). One plant, one cell, one seed (rule 31).
    const TEACH_CAP = o.distilTeachCap === undefined ? 0.10 : o.distilTeachCap;
    // THE TEACHER'S LAPS PER DRIVE (warmup + scored) and whether the prefix is re-measured
    // between passes — both commissioning-time knobs measured in plan §52.9. Null laps means
    // the scoring grade's own W + A.
    // COMMISSIONING TIME, MEASURED AS A LADDER (plan §52.9), machine-minutes at 1 ms, bench square:
    //   re-measure the prefix between passes   26.8 min  0.2169   (the first shipped teacher)
    //   active run doubles as the record       16.4 min  0.2169   free
    //   + 2 laps per teacher drive             12.7 min  0.2151   free
    //   + 4 training programs                   9.7 min  0.2263   4% (inside rule 42's band)
    //   + hold 500 steps before each drive      8.5 min  0.2264   free
    //   3 passes / 2 passes / 1 lap            0.300 / 0.464 / refused — the result goes with them
    // So two laps and four programs ship; the passes and the cap do not move. The 500-step hold
    // is gone with every other held pose: each drive now starts with an APPROACH — a rapid
    // from wherever the machine is, then rule 45's settle — which is the hold and the move in
    // one (plan §52.12).
    const TEACH_LAPS = o.distilTeachLaps ?? 2;
    const TEACH_TRACE = !!o.distilTeachTrace;
    // A Q-FILTER ON THE LEARNED INCREMENT (`distilQ`, a circular moving average of this many
    // steps over the lap; 0 is none). The teacher is iterative learning with the model inverse
    // as its gain and, without this, no robustness filter — so every pass amplifies whatever
    // the model does not represent, which is the textbook reason ILC carries a Q-filter. The
    // project's own record reads like the symptom list: a more converged prefix teaches a
    // WORSE policy (§52.7), the teacher's cap acts as a regulariser (§52.8), and more tracker
    // noise reads better (§50.1). Measured in plan §52.16.
    const TEACH_Q = Math.max(0, Math.round(o.distilQ ?? 0));
    const qFilter = (x) => {
      if (TEACH_Q < 2) return x;
      const n = x.length, h = Math.floor(TEACH_Q / 2), out = new Float64Array(n);
      for (let k = 0; k < n; k++) {
        let acc = 0;
        for (let j = -h; j <= h; j++) acc += x[(((k + j) % n) + n) % n];
        out[k] = acc / (2 * h + 1);
      }
      return out;
    };
    const out = [];
    for (const dp of paths) {
      const L = Math.ceil(dp.lap);
      // The joint reference and the commanded speed, computed ONCE per path: the rung reads
      // them thousands of times while it fits, and they are a property of the geometry.
      const R = new Array(L), RXp = new Array(L), SP = new Float64Array(L);
      // ONE DRIVE LOOP for the scored run and for every pass of the teacher, so the two
      // cannot drift (rule 61). `corr` is a lap-indexed correction under test; `pre` a frozen
      // prefix; `active` arms the commissioned pilot with `rec` as its oracle free response and
      // `uOut` receives what it applied; `trace` records the joint-space truth per pilot sample
      // of the scored laps for the next pass.
      const drive = async ({ corr = null, pre = null, active = false, rec = null, uOut = null, trace = false, laps: lapsOpt = null } = {}) => {
        // A TRAINING PASS IS A RUN OF THE MACHINE, so it advances the same counter every
        // other pass does — otherwise `samples().runs` reports a commissioning that spent
        // laps it will not admit to, and `onProgress` below stamps a stale index.
        runNo++;
        // FILLED FROM THE ARM THAT IS ABOUT TO RUN, not from a captured one: `refsFor`
        // exists for the production path and this is a different geometry. Then the machine
        // is DRIVEN to this program's start, from wherever the previous drive left it.
        const fill = (a, sv) => {
          if (!R[0]) {
            for (let k = 0; k < L; k++) {
              const c = dp.at(k);
              R[k] = a.ik(c.x, c.y, true);
              RXp[k] = refRow(a, sv, dp, k);
              SP[k] = Math.hypot(c.vx, c.vy);
            }
          }
          return R[0];
        };
        const held = await acquire(fill);
        const { arm, servo, rc } = held;
        armRef = arm;
        // A caller may state the laps outright (the teacher's drives); the scored run keeps
        // the grade's warmup and average. With one lap to score, A is 1.
        const laps = lapsOpt ?? (WARMUP + AVG), A = lapsOpt ? Math.max(1, Math.min(AVG, lapsOpt - 1)) : AVG;
        const e0 = new Float64Array(L), e1 = new Float64Array(L);
        const st = active ? auto.stack : null;
        // THE RECORD'S GRID IS THE PILOT'S, WHETHER OR NOT THE PILOT IS ACTING. The record is
        // built in a pilot-OFF drive and read in a pilot-ON one; taking the stride from `st`
        // (null when off) built it per STEP and read it per SAMPLE — index 205 was step 205
        // where the pilot wanted step 1640 — and every pass read as the oracle steering the
        // machine wrong in BOTH signs. Measured before this line: 1.52x WORSE at pass 0;
        // the rig's own loop with the same pilot, record and index arithmetic: 3.9x better.
        const S = auto.stack ? auto.stack.sample : 1;
        // THE RECORD IS PER STEP, so the oracle reads the truth at the DECISION step plus the
        // lead, not at the nearest sample-grid point 0-8 steps away from it.
        const recOut = trace ? Array.from({ length: L }, () => [0, 0]) : null;
        let s2 = 0, n = 0, step = 0, kNow = 0, t2 = 0;
        const probe = [0, 1].map(() => ({ n: 0, xy: 0, xx: 0, yy: 0 }));
        // THE TEACHER'S STEP MAY BE CAPPED. The harness that measured §49 iterated its pilot
        // under a 0.15 rad cap — its prefix reads exactly 0.1500 on pass 0 — so each pass could
        // add a bounded increment; `distilTeachCap` sets the cap the teacher iterates under
        // (the QP's box and the stack's clamp), restored after the drive. The deployed policy's
        // cap is its own.
        const capSave = [];
        if (st && TEACH_CAP != null) {
          capSave.push([st, st.uMax]); st.uMax = TEACH_CAP;
          for (const p of st.layers) { capSave.push([p, p.uMax]); p.uMax = TEACH_CAP; }
        }
        if (st) {
          st._initRun();
          // THE ORACLE PORT, indexed by the pilot's own sample within the lap exactly as
          // `deployOn` indexes it, modulo the lap because the program is closed.
          // THE CONTROL SHAPE: an oracle that hands back the fitted value must reproduce the
          // un-oracled run to the last digit, which is the check that the port itself changes
          // nothing (rule 21). And the alignment is measured rather than assumed: at lead 0
          // the record and the model's own forecast are correlated over the run.
          const ctl = o.distilOracle === 'control';
          const or = ctl ? ((c, leadSamp, fitted) => fitted)
            : rec ? ((c, leadSamp, fitted) => {
              const v = rec[(((kNow + leadSamp * S) % L) + L) % L][c];
              // THE ALIGNMENT, MEASURED: at lead 0 the record and the model's own forecast of
              // the same quantity are correlated over the run and reported per pass. The
              // stride fault above read as corr -0.42 here; the repaired record reads +0.7-0.9
              // on pass 0 and falls toward 0 as the prefix removes what the model can forecast.
              if (leadSamp === 0) { const a = probe[c]; a.n++; a.xy += v * fitted; a.xx += v * v; a.yy += fitted * fitted; }
              return v;
            }) : null;
          for (const p of st.layers) p.oracleF0 = or;
        }
        try {
          // CONTINUOUS TIME, as `run()` and the page (no 0.4-step seam); `k` is the in-lap step.
          const T = dp.lap, total = Math.round(laps * T);
          let l = 0, lastK = -1;
          for (let nn = 0; nn < total; nn++) {
            l = Math.min(laps - 1, Math.floor(nn / T));
            const k = Math.min(L - 1, Math.floor(nn - l * T));
            if (lapSync && st && k <= lastK) st.syncLap();
            lastK = k; kNow = k;
            {
              const c = dp.at(nn);
              const [q1, q2] = arm.ik(c.x, c.y, true);
              const rt = arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
              const base = [{ theta: q1, omega: rt.dq[0], alpha: rt.ddq[0] },
                { theta: q2, omega: rt.dq[1], alpha: rt.ddq[1] }];
              // THE SAME BASELINE EVERY SCORED RUN CARRIES. Converging a correction on a
              // machine WITHOUT the compliance feedforward would fit the error that
              // feedforward removes, and the deployed map would double-correct it — unless
              // the rung REPLACES that feedforward, in which case the training runs must be
              // bare exactly as the deployed machine will be (`distilReplaces`).
              const ff = distilReplaces ? ZFF : rc.feedforward([[1, 0], [0, 1]],
                servo.jointTorques(base), { enableToolff: false });
              const u = corr ? corr.at(k).slice() : [0, 0];
              if (st) {
                const look = (off) => R[(((k + off * S) % L) + L) % L];   // exact at this step
                const pu = st.act(look);
                if (uOut) { uOut[0][k] = pu[0]; uOut[1][k] = pu[1]; }
                u[0] += pu[0]; u[1] += pu[1];
              }
              if (pre) { u[0] += pre[0][k]; u[1] += pre[1][k]; }
              const tau = servo.torques([{ ...base[0], theta: q1 + ff.dq[0] + u[0] },
                { ...base[1], theta: q2 + ff.dq[1] + u[1] }]);
              arm.step(tau[0], tau[1], 1); mSamples++;
              if (st) {
                const en = arm.encoders();
                st.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
                  tau[0] * 1e3, tau[1] * 1e3], null);
              }
              if (l >= laps - A) {
                const tp = arm.toolXY();
                const j = worldToJoint([tp[0] - c.x, tp[1] - c.y], { q: [q1, q2] });
                e0[k] += j[0] / A; e1[k] += j[1] / A;
                s2 += j[0] * j[0] + j[1] * j[1]; n++;
                t2 += (tp[0] - c.x) ** 2 + (tp[1] - c.y) ** 2;
                if (recOut) { recOut[k][0] += j[0] / A; recOut[k][1] += j[1] / A; }
              }
              if (yieldEvery && ++step % yieldEvery === 0) {
                if (onProgress) onProgress({ what: 'distil', run: runNo, lap: l + 1, laps,
                  k, LAP: L, phase: active ? 'teach' : 'run' });
                await onYield();
              }
            }
          }
        } finally {
          if (st) for (const p of st.layers) p.oracleF0 = null;
          for (const [obj, v] of capSave) obj.uMax = v;
          await release(held);
        }
        const align = probe.map((a) => a.n
          ? { corr: a.xy / Math.sqrt(Math.max(1e-300, a.xx * a.yy)), ratio: Math.sqrt(a.xx / Math.max(1e-300, a.yy)), n: a.n }
          : null);
        const lim = servo.limitStats ? servo.limitStats() : null;
        return { score: Math.sqrt(s2 / Math.max(1, n)), err: [e0, e1], rec: recOut, align, toolRms: Math.sqrt(t2 / Math.max(1, n)),
          sat: lim ? lim.fraction : null };
      };
      out.push({
        lap: L,
        closed: !!dp.closed,      // a closed lap wraps its window; a finite record clamps it
        refAt: (k) => RXp[(((k % L) + L) % L)],
        refDim: refDimOf,
        speedAt: (k) => SP[(((k % L) + L) % L)],
        /**
         * One convergence lap set with `corr` applied, scored on the machine.
         * @returns {{score:number, err:number[][]}} joint-space error per channel, averaged
         *   over the scored laps, in the lap's own index.
         */
        run: async (corr, o2 = null) => (await drive({ corr, trace: !!(o2 && o2.trace), laps: o2 && o2.laps ? o2.laps : null })),
        /**
         * ONE TEACHING PASS FOR A PARAMETRIC ITERATION (plan §52.16): drive with `corr` applied
         * and the pilot ON, its free response replaced by `rec` — the error measured under
         * `corr` — and return what the pilot added (`uOut`, per step), the error it left
         * (`rec`), and its score. The caller owns the iteration: it fits a POLICY to
         * `corr + uOut` across every program and drives THAT next, so each pass adds only what
         * the policy can express.
         */
        ...(engine ? { teach: async (corr, rec) => {
          const uOut = [new Float64Array(L), new Float64Array(L)];
          const on = await drive({ corr, active: true, rec: o.distilOracle === false ? null : rec, uOut, trace: true, laps: TEACH_LAPS });
          return { score: on.score, uOut: [qFilter(uOut[0]), qFilter(uOut[1])], rec: on.rec, align: on.align };
        }, teachLaps: TEACH_LAPS } : {}),
        /**
         * THE PILOT AS THE TEACHER (plan §52.8): the iteration engine `test/_distil.mjs`
         * measured at 6.40x on the square, in the ladder. Present only when the host was asked
         * for it and a cascade layer was commissioned and admitted; absent, the rung converges
         * with `HarmonicFF` as before, byte-identical.
         *
         * Each pass: run the program with the prefix applied and the pilot OFF, recording the
         * joint-space truth at every pilot sample of the scored laps; then run it with the pilot
         * ON and its free response REPLACED by that record (`oracleF0`, the port arm-rig wired
         * for §48), so the QP inverts the truth rather than a forecast of it, and add what the
         * pilot applied to the prefix. The converged prefix ALONE, pilot off, is scored and
         * handed to the distillation. Bare of the pilot at every scored step, so the prefix is
         * a correction of the conventional machine and never of a machine the pilot has moved.
         * @returns {Promise<{base:number, best:number, at:(k:number)=>number[], passes:number}>}
         */
        ...(engine ? { converge: async (passes = DISTIL_PASSES) => {
          const pre = [new Float64Array(L), new Float64Array(L)];
          const st = auto.stack;
          const first = await drive({ pre, trace: true, laps: TEACH_LAPS });
          let rec = first.rec, base = first.score, best = base, bestPre = null, done = 0;
          const dbg = o.distilDebug ? (m) => console.log(`      [teach] ${m}`) : null;
          const aligns = [];
          if (dbg) dbg(`lap ${L}: base ${base.toExponential(4)}`);
          for (let pass = 0; pass < passes; pass++) {
            const uOut = [new Float64Array(L), new Float64Array(L)];
            // THE ACTIVE RUN IS ALSO THE NEXT RECORD. The live pilot on top of the frozen
            // prefix and the next prefix frozen alone read the same machine to four figures
            // (2.9369e-2 against 2.9371e-2, every pass, every program), so re-measuring the
            // prefix between passes bought a digit the machine cannot see at the price of a
            // drive per pass. `distilTeachTrace: true` restores the re-measurement, as the
            // control.
            const on = await drive({ pre, active: true, rec: o.distilOracle === false ? null : rec, uOut,
              trace: true, laps: TEACH_LAPS });
            let pk = 0; for (let c = 0; c < 2; c++) for (let k = 0; k < L; k++) pk = Math.max(pk, Math.abs(uOut[c][k]));
            const inc = [qFilter(uOut[0]), qFilter(uOut[1])];
            for (let c = 0; c < 2; c++) for (let k = 0; k < L; k++) pre[c][k] += inc[c][k];
            const r = TEACH_TRACE ? await drive({ pre, trace: true, laps: TEACH_LAPS }) : on;
            aligns.push(on.align);
            if (dbg) dbg(`pass ${pass}: pilot ON with prefix scored ${on.score.toExponential(4)}, uPk ${pk.toFixed(4)}, prefix alone ${TEACH_TRACE ? r.score.toExponential(4) : '(not re-measured)'} (best ${best.toExponential(4)})`
              + (on.align[0] ? `  oracle vs fitted at lead 0: corr ${on.align.map((a) => a.corr.toFixed(3)).join('/')}, rms ratio ${on.align.map((a) => a.ratio.toFixed(3)).join('/')}` : ''));
            done = pass + 1;
            // MONOTONE, AS EVERY ITERATION HERE IS: a pass that made the machine worse is
            // undone and the iteration stops, so what is handed on is the best prefix and
            // never the last one (the harness's own fifteen-pass argmin lesson).
            if (r.score < best) { best = r.score; bestPre = pre.map((a) => Float64Array.from(a)); rec = r.rec; }
            else { for (let c = 0; c < 2; c++) for (let k = 0; k < L; k++) pre[c][k] -= inc[c][k]; break; }
          }
          const fin = bestPre || pre;
          return { base, best, passes: done, align: aligns, at: (k) => [fin[0][(((k % L) + L) % L)], fin[1][(((k % L) + L) % L)]] };
        } } : {}),
      });
    }
    return out;
  }

  /**
   * Machine samples spent so far, and the runs they were spent over. One sample is one
   * servo step, so at a 1 kHz task `samples().samples / 1000` seconds is the machine time
   * the commissioning has consumed — the half of target 4's cost that wall clock cannot see.
   */
  const samples = () => ({ samples: mSamples, runs: runNo, lap: LAP });

  return { auto, run, drivePilot, recordDemo, distilRuns, refsFor, worldToJoint, attach,
    actAt, dispose, samples, wv, wa, AVG };
}
