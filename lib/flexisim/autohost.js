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
 * @param {boolean} [o.reuseMachine=true]  build and settle ONE machine and restore it per
 *   run instead of rebuilding. Measured bit-identical over the whole ladder and 1.35x faster
 *   end to end; `false` restores the rebuilding path. A host that reuses must be `dispose`d.
 * @param {Function} [o.onProgress]    a HEARTBEAT at every yield: `{what, run, lap, laps, k,
 *   LAP, phase}`. `onRung` fires on rung COMPLETION, and the lap-periodic rung takes 18 of
 *   the ladder's 32 minutes in Node and longer in a browser — so between two table rows the
 *   ladder is silent for the majority of its runtime, and an operator cannot tell a long
 *   measurement from a hung tab. This reports where it is, always.
 */
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
    if (!reuseMachine) return makeMachine();
    if (!heldM) { heldM = await makeMachine(); heldSnap = snapshotArm(heldM); }
    else restoreArm(heldSnap, heldM);
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

  let armRef = null;                 // the arm currently being driven, for the frame maps
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
    uMax: 3.0, periodic: LAP, maxDepth: 2, lapSynced: lapSync,
    basis: motionBasis([{ v: wv[0], a: wa[0] }, { v: wv[1], a: wa[1] }]),
    frames: { classic: { uMax: 1.5, map: worldToJoint }, stack: { uMax: stackAuth },
      hff: { uMax: stackAuth } },
    hff: { passes: o.passes ?? 24, banded },
    onRung: o.onRung || null,
    pilot: {
      nMeasured: 6, autoRefuse: false, gateForecasts: false,
      uMax: stackAuth,
      probeAmp: 0.15 * Math.min(1.0, 0.15 * (16 / K)),
      ditherAmp: 0.1 * Math.min(1.0, 0.15 * (16 / K)),
      start: null,                    // filled by the caller from the path's first point
      guards: [], refusePartial: false,
      workspace: null,                // filled by the caller: it needs the arm's reach
      seed: 1,
    },
  });

  /** One scored run: the deployed rungs, plus `extra` when a rung is being probed. */
  async function run(extra, name, laps = WARMUP + AVG) {
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
          const ctx = { v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k, look, q: [c1, c2] };
          const u = auto.act(ctx, extra ? extra.at(k) : null, name);
          const tau = servo.torques([{ ...base[0], theta: c1 + ff.dq[0] + u[0] },
            { ...base[1], theta: c2 + ff.dq[1] + u[1] }]);
          arm.step(tau[0], tau[1], 1);
          const en = arm.encoders();
          auto.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
            tau[0] * 1e3, tau[1] * 1e3]);
          const d = decompose(path, arm.toolXY(), cmd);
          le[k] = d.contour;
          if (l >= laps - AVG) {
            sc.step(d.contour, d.lag, tau, [arm.j1.wM, arm.j2.wM]);
            // THE WHOLE TOOL ERROR, in the frame the rung asking for it corrects in.
            // Narrowing it to the contour component cost half the benefit: the projection
            // onto a rotating normal is itself a lap-varying operator.
            const tp = arm.toolXY();
            let gx = tp[0] - cmd.x, gy = tp[1] - cmd.y;
            if (name === 'hff') { const j = worldToJoint([gx, gy], { q: [c1, c2] }); gx = j[0]; gy = j[1]; }
            ex[k] += gx / AVG; ey[k] += gy / AVG;
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
    for (let l = laps - AVG; l < laps; l++) {
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
    return { score: rep.contourRms, err: [ex, ey], bias: rep.contourBias, osc: rep.contourOsc,
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
  function attach(arm) { armRef = arm; refsFor(arm); }

  /**
   * The deployed correction at sample k on a live arm, in joint angles. The look-ahead is
   * built the same way the scored runs build it — indexed from the lap start when
   * `lapSync` — so the pilot sees in deployment exactly what it saw while commissioning.
   */
  function actAt(k, cmd, q) {
    const S = auto.stack ? auto.stack.sample : 1;
    const R = refsFor(armRef);
    const kSamp = lapSync ? Math.floor(k / S) : Math.floor(k / S);
    const look = (off) => R[(((kSamp + off) * S) % LAP + LAP) % LAP];
    return auto.act({ v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k, look, q });
  }

  return { auto, run, drivePilot, refsFor, worldToJoint, attach, actAt, dispose, wv, wa, AVG };
}
