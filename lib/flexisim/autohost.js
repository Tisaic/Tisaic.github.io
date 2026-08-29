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
 * @param {boolean} [o.lapSync=true]   index the look-ahead from the lap start
 * @param {boolean} [o.banded=true]    identify and invert h with h±1 together
 * @param {number} [o.yieldEvery=0]    await after this many samples; 0 never yields
 * @param {Function} [o.onYield]       what to await — a frame, in a browser
 * @param {Function} [o.onRung]        called with each rung row as it is measured
 */
export function makeArmHost(o) {
  const { makeMachine, path, lap: LAP, K, centre } = o;
  const AVG = o.avg ?? 4;
  const lapSync = o.lapSync !== false;
  const banded = o.banded !== false;
  const yieldEvery = o.yieldEvery || 0;
  const onYield = o.onYield || (() => Promise.resolve());

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
    uMax: 3.0, periodic: LAP, maxDepth: 2,
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
  async function run(extra, name, laps = 2 + AVG) {
    const { arm, l1, l2, servo, rc } = await makeMachine();
    armRef = arm;
    const R = refsFor(arm);
    auto.beginRun();
    const sc = new ContourScore({ joints: 2 });
    const ex = new Float64Array(LAP), ey = new Float64Array(LAP);
    const lapE = [];
    let step = 0;
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
        if (yieldEvery && ++step % yieldEvery === 0) await onYield();
      }
      lapE.push(le);
    }
    await l1.destroy(); await l2.destroy();
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
    const { arm, l1, l2, servo, rc } = await makeMachine();
    armRef = arm;
    let guard = 0, step = 0;
    while (st.phase !== 'done' && guard++ < 4e6) {
      if (st.phase === 'fit') { st.work(); if (yieldEvery) await onYield(); continue; }
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
      if (yieldEvery && ++step % yieldEvery === 0) await onYield();
    }
    await l1.destroy(); await l2.destroy();
  }

  return { auto, run, drivePilot, refsFor, worldToJoint, wv, wa };
}
