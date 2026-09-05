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
import { snapshotArm, restoreArm } from './arm2r.js';
import { motionBasis } from '../pilot/classic.js';
import { ContourScore, decompose } from './contour.js';
import { designDemoPaths } from './demopath.js';

/**
 * @param {object} o
 * @param {() => Promise<{arm,l1,l2,servo,rc}>} o.makeMachine  a SETTLED machine on the path's
 *   first point. Called once per scored run: every run starts from the same state, which is
 *   what makes two rungs comparable.
 * @param {object} o.path       a ToolPath; `path.at(k)` and `path.tangent(u)`
 * @param {number} o.lap        samples in one lap
 * @param {number} o.K          gearbox stiffness — sizes the pilot's authority
 * @param {number[]} o.centre   the joint pose the channels are centred on
 * @param {number} [o.avg=4]    settled laps averaged into the error signal and the score
 * @param {number} [o.warmup=2]  laps run before scoring begins. Covers the machine's
 *   transient AND the deployed correction's own — only the first is removed by
 *   `reuseMachine`, so this is a knob to measure against, not a free saving.
 * @param {boolean} [o.lapSync=true]   index the look-ahead from the lap start
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
 * @param {boolean} [o.reuseMachine=true]  build and settle ONE machine and restore it per
 *   run instead of rebuilding. Measured bit-identical over the whole ladder and 1.35x faster
 *   end to end; `false` restores the rebuilding path. A host that reuses must be `dispose`d.
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
  //  (a) the MACHINE's, from a freshly built and imperfectly settled arm — which
  //      `reuseMachine` removes outright, since a restored machine is bit-identical to one
  //      that has already been settled properly;
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
  const lapSync = o.lapSync !== false;
  const banded = o.banded !== false;
  const yieldEvery = o.yieldEvery || 0;
  const onYield = o.onYield || (() => Promise.resolve());
  // A REPORTER MUST NOT BE ABLE TO FAIL A MEASUREMENT — the same contract `AutoStack` gives
  // `onRung`. Whatever the host does with this, the ladder carries on.
  const onProgress = o.onProgress
    ? (d) => { try { o.onProgress(d); } catch { /* a reporter must not fail a run */ } }
    : null;
  let runNo = 0;                    // runs begun: the coarsest progress signal there is

  // ---- A MACHINE BUILT AND SETTLED ONCE, RESTORED PER RUN ------------------------------
  //
  // Every scored run needs to start from the same state or two rungs are not comparable, and
  // the obvious way to get that is to rebuild and re-settle. Measured on this arm that is
  // 4.2 s of a 13.2 s run — a THIRD of the ladder's 32 minutes spent re-deriving a state it
  // has already had a hundred times (`test/flexisim/_cost.mjs`).
  //
  // AND RESTORING IS MORE EXACT THAN REBUILDING. Re-settling only converges TOWARDS the same
  // state: the 4000-step settle leaves the joint wind-up 0.25% from its 40000-step value
  // (`_settle.mjs`), so the "identical" machines differed by a fraction of a percent nobody
  // could remove from the caller. A restore is bit-identical — `snapshot.test.mjs` pins a
  // 2000-step asymmetric drive reproducing to the LAST BIT, and pins that it diverges
  // without the restore, so the claim is not passing on a machine that ignores its state.
  //
  // ON BY DEFAULT, BECAUSE IT EARNED IT. `arm-reuse` ran the whole ladder against the
  // rebuilding control and reproduced every rung byte for byte — 4.1216e-1, 3.3200e-1,
  // 9.9789e-2, 1.4156e-1, 6.3021e-2, 5.3554e-2 twice, 1.8387e-2 — shipping the same
  // {classic:false, stack:2, hff:true} at 22.42x with every check green, in 1435 s against
  // 1934 s, and that while sharing the machine with another full bar run. Rule 21 in its
  // strongest form: the cases this should not touch came back identical.
  // `reuseMachine: false` restores the rebuilding path.
  const reuseMachine = o.reuseMachine !== false;
  let heldM = null, heldSnap = null;
  async function acquire() {
    if (!reuseMachine) { const m = await makeMachine(); lastRc = m.rc; return m; }
    if (!heldM) { heldM = await makeMachine(); heldSnap = snapshotArm(heldM); }
    else restoreArm(heldSnap, heldM);
    lastRc = heldM.rc;
    return heldM;
  }
  async function release(m) {
    // THE CACHE OWNS ITS LATTICES; a run must not destroy what the next run will restore.
    if (reuseMachine) return;
    await m.l1.destroy(); await m.l2.destroy();
  }
  /** Destroy the held machine, if any. A host that reuses one must be disposed. */
  async function dispose() {
    if (!heldM) return;
    const m = heldM; heldM = null; heldSnap = null;
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
  const DEPLOY = { path, lap: LAP, T: path.lap, refs: null, program: PROGRAM };

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
  /** World (dx, dy) into joint offsets at the pose the machine is commanded to. */
  const worldToJoint = (u, ctx) => {
    const J = armRef.jacobian(ctx.q[0], ctx.q[1]);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    if (!(Math.abs(det) > 1e-12)) return [0, 0];
    return [(J[1][1] * u[0] - J[0][1] * u[1]) / det, (-J[1][0] * u[0] + J[0][0] * u[1]) / det];
  };

  const stackAuth = Math.min(2.0, 0.15 * (16 / K));
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
    uMax: 3.0, periodic: o.lapMemory === false ? null : LAP, maxDepth: o.maxDepth ?? 2, lapSynced: lapSync,
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
    frames: { classic: { uMax: 1.5, map: worldToJoint }, stack: { uMax: stackAuth },
      hff: { uMax: stackAuth } },
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
  async function run(extra, name, laps) {
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
    const R = refsFor(arm);
    auto.beginRun();
    const sc = new ContourScore({ joints: 2 });
    const ex = new Float64Array(LAP), ey = new Float64Array(LAP);
    const lapE = [];
    let step = 0;
    try {
      for (let l = 0; l < laps; l++) {
        const le = new Float64Array(LAP);
        for (let k = 0; k < LAP; k++) {
          const cmd = path.at(k);
          const [c1, c2] = R[k];
          const r = arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
          const base = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
            { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
          const ff = rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base), { enableToolff: false });
          const S = auto.stack ? auto.stack.sample : 1;
          // INDEXED FROM THE LAP START. A cadence that does not divide the lap makes the
          // pilot's phase walk — 9 against 7357 here, so each lap starts 44% of a sample late
          // — and that walk is a beat at a HALF-integer harmonic the lap-periodic rung cannot
          // represent. Measured: autocorrelation -0.764 continuous against -0.135 synced, and
          // the ladder 20.70x against 22.42x.
          const kSamp = lapSync ? Math.floor(k / S) : Math.floor((l * LAP + k) / S);
          const look = (off) => R[(((kSamp + off) * S) % LAP + LAP) % LAP];
            const ctx = { v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k, look, q: [c1, c2],
            program: PROGRAM };
          const u = auto.act(ctx, extra ? extra.at(k) : null, name);
          const tau = servo.torques([{ ...base[0], theta: c1 + ff.dq[0] + u[0] },
            { ...base[1], theta: c2 + ff.dq[1] + u[1] }]);
          arm.step(tau[0], tau[1], 1);
          const en = arm.encoders();
          auto.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
            tau[0] * 1e3, tau[1] * 1e3]);
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
        lapE.push(le);
      }
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
        arm.step(tau[0], tau[1], 1);
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
      DEPLOY.refs = null;
      DEPLOY.program = programSignature(livePath, DEPLOY.lap);
    } else DEPLOY.refs = null;   // a new arm invalidates the cached ik table either way
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
    const R = D.refs, L = D.lap;
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
    const kSamp = Math.floor(kIn / S);
    const look = (off) => R[(((kSamp + off) * S) % L + L) % L];
    const u = auto.act({ v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k, look, q,
      program: D.program });
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
    const ff = lastRc.feedforward([[1, 0], [0, 1]], servoRef.jointTorques(refs),
      { enableToolff: false });
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
      const held = await acquire();
      const { arm, servo, rc } = held;
      armRef = arm;
      try {
        const c0 = dp.at(0);
        const [a0, b0] = arm.ik(c0.x, c0.y, true);
        const hold = [{ theta: a0, omega: 0, alpha: 0 }, { theta: b0, omega: 0, alpha: 0 }];
        for (let i = 0; i < 4000; i++) {
          const t = servo.torques(hold); arm.step(t[0], t[1], 1);
          if (yieldEvery && i % yieldEvery === 0) await onYield();
        }
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
          arm.step(tau[0], tau[1], 1);
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

  return { auto, run, drivePilot, recordDemo, refsFor, worldToJoint, attach, actAt,
    dispose, wv, wa, AVG };
}
