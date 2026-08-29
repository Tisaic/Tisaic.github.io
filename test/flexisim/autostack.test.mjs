import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { roundedRect } from '../../lib/flexisim/toolpath.js';
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';
import { RobotComp } from '../../lib/ngrc/robotcomp.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}


const H = 4, nu = 0.3, rho = 1, CLAMP = 3, RATIO = 100, g = 2e-6;
const LEN1 = 14, LEN2 = 10;
const K = +(process.env.K || 1), E = +(process.env.E || 0.06);
// THE PAGE'S OWN MACHINE: drive limits, backlash, and the centre the Path tab works about.
const CENTRE = [12, 0], BACKLASH = 1e-4, DRIVE = 32;
const PATH = { w: 8, h: 8, r: 1.5, centre: CENTRE, feed: 4e-3, accel: 4e-5,
  cornerDt: 40, closed: true };
const NH = +(process.env.NH || 16);
const STEP = +(process.env.STEP || 0.6);
const PASSES = +(process.env.PASSES || 9);
const AMP = 4e-3;
// The reconstruction normal: the path's own at the nearest point (right), or the commanded
// velocity's (the approximation). Kept switchable only to measure the difference.
const T0 = Date.now();
// ---- WHAT KIND OF VARIATION IS THE 'NOISE'? The bare machine repeats to 1.3e-10 — it is
// deterministic. The 5.84e-4 spread only appears once the pilot cascade is deployed, so it
// is lap-to-lap variation of a deterministic system rather than noise, and which kind it is
// decides the fix: independent scatter wants more averaging, a drift wants a longer settle,
// and an oscillation means the pilot and the lap are beating against each other and no
// amount of either will help. NOISEPROBE=N runs N extra laps on the shipped machine and
// classifies the sequence. NOHFF skips the lap-periodic rung so the probe costs the
// cascade's commissioning and nothing more.
const NOISEPROBE = +(process.env.NOISEPROBE || 0);
// ---- THE PILOT'S PHASE RELATIVE TO THE LAP. Its look-ahead is indexed continuously across
// laps — floor((l*LAP + k)/S) — so if its cadence S does not divide LAP, the pilot starts
// each lap at a different point within its own sample and its phase walks. That is a beat
// by construction, and a beat is the one thing a lap-indexed rung cannot correct: HarmonicFF
// represents integer harmonics of the lap, and a two-lap period is a HALF-integer one.
// LAPSYNC indexes from the lap start instead, which costs a discontinuity at a boundary
// that is not physical on a closed path, and makes the machine exactly lap-periodic.
const LAPSYNC = !!process.env.LAPSYNC;
const NOHFF = !!process.env.NOHFF;
// ---- THE SIGNAL EACH RUNG IS SHOWN. Both settled by a 2x2 on the machine, one variable
// each, with the pilot cascade coming back byte-identical (6.7033e-2 -> 5.5099e-2) in all
// five runs — which is what makes them comparisons rather than five different machines.
//
//                         world frame        joint frame
//   contour component     1.00x REFUSED      1.18x
//   full tool error       2.06x              2.65x      <- ships
//
// THE SIGNAL IS THE WHOLE TOOL ERROR. Narrowing it to the contour component was meant to
// stop the rung spending authority on lag, which the score cannot see removed. It cost
// half the rung's benefit, and the reason is that the narrowing is itself a ROTATING
// operator: projecting onto n(k) is P(k) = n n^T, and n turns 127.6 degrees around this lap
// (`_lti.mjs`). The fitted operator became P(k)G rather than G — a lap-varying factor put
// into exactly the map HarmonicFF assumes constant, while removing a different one.
// Cancelling the whole error necessarily cancels its normal part too, so the lag authority
// is wasted, not harmful. That was not the trade it looked like.
//
// AND EACH RUNG IS SHOWN IT IN THE FRAME IT CORRECTS IN. `host.run` is told which rung is
// asking, so this needs no flag: the lap-periodic rung reads joint space, where the pose
// dependence has been divided out and one operator per harmonic is a much better
// assumption, and the conventional rung keeps world, where its basis was fitted.
const CONTOURERR = !!process.env.CONTOURERR;   // reproduce the narrowed signal (a null)
const HFFWORLD = !!process.env.HFFWORLD;       // reproduce the world frame (a null)

async function machine() {
  const mk = (length) => buildLink({ length, section: H, clamp: CLAMP, E, nu, rho,
    damping: 3e-3 });
  const l1 = await mk(LEN1), l2 = await mk(LEN2);
  const jt = (mp) => new Joint({ ratio: RATIO, motorInertia: mp.inertiaAboutPivot / 1e4,
    loadInertia: mp.inertiaAboutPivot, stiffness: K, backlash: BACKLASH,
    damping: 2 * Math.sqrt(K * mp.inertiaAboutPivot / 2) });
  const arm = new FlexArm2R({ joint1: jt(massProperties(l1)), link1: l1,
    joint2: jt(massProperties(l2)), link2: l2, gravityWorld: [0, -g, 0], dt: 1 });
  const hold = Math.abs(arm.gravityTorque([0, 0])[0]) / RATIO;
  const servo = new ChainServo({ arm, bandwidth: 2e-3, tauMax: DRIVE * hold, speedMax: 0.2 });
  return { arm, l1, l2, servo };
}
function settle(arm, servo, a, b, n = 4000) {
  arm.setPose(a, b);
  for (let i = 0; i < n; i++) {
    const t = servo.torques([{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }]);
    arm.step(t[0], t[1], 1);
  }
}
/** The conventional machine's own compliance, from held poses. Always on: it is the baseline. */
function commissionComp(arm, servo) {
  const rc = new RobotComp(2, 2, 1e6);
  for (const [a, b] of [[0.10, 0.30], [-0.05, 0.55], [0.25, 0.15], [0.00, 0.42]]) {
    settle(arm, servo, a, b);
    const refs = [{ theta: a, omega: 0, alpha: 0 }, { theta: b, omega: 0, alpha: 0 }];
    rc.calibrate([[1, 0], [0, 1]], servo.jointTorques(refs),
      [arm.j1.windup(), arm.j2.windup()], 1.0);
  }
  return rc;
}


import { AutoStack } from '../../lib/pilot/autostack.js';
import { motionBasis } from '../../lib/pilot/classic.js';

console.log('\nflexisim: the button, on the arm — against the strongest number this repo has\n');

// THE MACHINE AND PROGRAM ARE `composite.test.mjs`'s, EXACTLY — same links, same joints,
// same backlash, same drive, same rounded rectangle at the same feed about the same centre.
// That file's hand-built stack reaches 1.340e-2 from a 4.122e-1 conventional machine, which
// is the strongest arm result in this repository. This one asks whether the SELF-TUNING
// ladder gets there with nothing set but the maxes, the authority and the floor. One
// variable: who chooses the constants.
// EACH CONFIGURATION HAS ITS OWN REFERENCE, and the softest one is a different machine
// rather than the same machine turned down. K 1 / E 0.06 is where composite.test.mjs's
// hand-built stack lives; K 0.25 / E 0.03 is the Path tab's softest sliders, where the page's
// own mode 5 at cascade depth 2 reaches 9.87e-2 from a bare 1.205 (brick 59). The bar on the
// softest row is that ABSOLUTE number: this harness's conventional machine already carries
// RobotComp's compliance, so its baseline is not the page's, and comparing gains rather than
// residuals across two different baselines would be comparing two machines.
const BARS = {
  '1/0.06': { conv: 4.122e-1, target: 1.340e-2, src: "composite.test.mjs's hand-built cascade(2) + HFF" },
  '0.25/0.03': { conv: 8.0716e-1, target: 9.87e-2, src: "the Path tab's mode 5 at cascade depth 2 (brick 59)" },
};
const BAR = BARS[`${K}/${E}`];
if (!BAR) { console.log(`  no reference recorded for K ${K} E ${E} — nothing to measure against`); process.exit(2); }
const TARGET = BAR.target;
const CONV = BAR.conv;

const path = roundedRect(PATH);
const LAP = Math.ceil(path.lap);
const p0 = path.at(0);

// The reference's own world velocity and acceleration, for the conventional rung's basis.
const wv = [new Float64Array(LAP), new Float64Array(LAP)];
const wa = [new Float64Array(LAP), new Float64Array(LAP)];
for (let k = 0; k < LAP; k++) {
  const c = path.at(k);
  wv[0][k] = c.vx; wv[1][k] = c.vy; wa[0][k] = c.ax; wa[1][k] = c.ay;
}

let armRef = null;                 // the arm currently being driven, for the frame maps

// THE JOINT REFERENCE FOR A FIXED PATH IS A CONSTANT, so it is solved once. It was being
// solved per SAMPLE per LAP, and again inside the look-ahead closure for every lead of the
// pilot's horizon — the same answer, for the same k, millions of times per run.
// `harmonic.test.mjs` has always precomputed it; this harness did not.
let REFS = null;
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

const centre = [0, 0];             // filled once an arm exists
const auto = new AutoStack({
  // THE COMMON FRAME IS JOINT SPACE, because that is where the pilot was measured to work and
  // where the machine is actually commanded. The other two rungs live in WORLD — the frame
  // the harmonic rung was measured to need, 8.86x against a path-normal 0.99x — and declare a
  // map into it. Forcing one frame on all three cost the pilot 2.9x when it was tried.
  channels: [0, 1].map(() => ({ lo: -3, hi: 3, vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
  uMax: 3.0, periodic: NOHFF ? null : LAP, maxDepth: 2,
  basis: process.env.NOCLASSIC ? null : motionBasis([{ v: wv[0], a: wa[0] }, { v: wv[1], a: wa[1] }]),
  frames: { classic: { uMax: 1.5, map: worldToJoint },
    hff: HFFWORLD ? { uMax: 1.5, map: worldToJoint } : { uMax: Math.min(2.0, 0.15 * (16 / K)) },
    stack: { uMax: Math.min(2.0, 0.15 * (16 / K)) } },      // composite.test.mjs's own figure
  pilot: {},                        // filled below, once the arm's own centre is known
  // THE LAP BUDGET IS THE OPERATOR'S, NOT THE PLANT'S. brick 67 measured this module still
  // DESCENDING at 20 passes on this arm and reaching 9.17x at 82 laps, past the hand-tuned
  // 8.86x — a machine that chooses its own step takes smaller ones, so the same endpoint
  // costs more laps. HFFPASSES exists to test whether the remaining distance to the
  // hand-built number is laps or model error, which are different problems with different
  // fixes and cannot be told apart from one budget.
  hff: { passes: +(process.env.HFFPASSES || 24),
    // The banded operator: h coupled to h+-1, identified and inverted together. Default off
    // until it is measured on THIS machine — it is worth 14-20x on a synthetic plant with
    // known coupling and byte-identical without, but that is a plant built to have the
    // thing it exploits.
    banded: !!process.env.HFFBANDED },
  // PROGRESS AS IT IS MEASURED. This commission takes about an hour; printed only as a
  // table at the end, a run going wrong is indistinguishable from one going well until it
  // is over. Rule 27: the unflattering diagnostic first, and soon enough to act on.
  onRung: (r) => console.log(`  [${((Date.now() - T0) / 60000).toFixed(0)}m] `
    + `${r.name}  ${r.score.toExponential(4)}`
    + `${r.gain === null ? '' : '  ' + r.gain.toFixed(2) + 'x'}`
    + `${r.deployed ? '' : '  — NOT deployed'}${r.note ? '   ' + r.note : ''}`),
});

async function fresh() {
  const m = await machine();
  const rc = commissionComp(m.arm, m.servo);
  const [q1, q2] = m.arm.ik(p0.x, p0.y, true);
  settle(m.arm, m.servo, q1, q2);
  return { ...m, rc };
}

/** One scored run: the deployed rungs, plus `extra` when a rung is being probed. */
const AVG = 4;                      // settled laps averaged into the error signal
async function run(extra, name, laps = 2 + AVG) {
  const { arm, l1, l2, servo, rc } = await fresh();
  armRef = arm;
  const R = refsFor(arm);
  auto.beginRun();
  const sc = new ContourScore({ joints: 2 });
  const ex = new Float64Array(LAP), ey = new Float64Array(LAP);
  const lapE = [];
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
      const kSamp = LAPSYNC ? Math.floor(k / S) : Math.floor((l * LAP + k) / S);
      const look = (off) => R[(((kSamp + off) * S) % LAP + LAP) % LAP];
      const ctx = { v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k, look, q: [c1, c2] };
      // THE RUNG UNDER TEST IS HANDED TO `act` RATHER THAN ADDED AFTER IT, so it goes through
      // its own frame map AND inside the same common cap it will deploy inside. Added
      // afterwards it was held only to its own authority while being scored.
      const u = auto.act(ctx, extra ? extra.at(k) : null, name);
      const d0 = u[0], d1 = u[1];
      const tau = servo.torques([{ ...base[0], theta: c1 + ff.dq[0] + d0 },
        { ...base[1], theta: c2 + ff.dq[1] + d1 }]);
      arm.step(tau[0], tau[1], 1);
      const en = arm.encoders();
      auto.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
        tau[0] * 1e3, tau[1] * 1e3]);
      const d = decompose(path, arm.toolXY(), cmd);
      le[k] = d.contour;
      // SCORED OVER THE SAME LAPS THE SIGNAL IS AVERAGED ON. Scoring one lap while
      // fitting on four judges a rung on a different sample of the machine than the one it
      // was handed, and a deployed pilot's lap-to-lap spread is a few percent — larger than
      // several of the differences the ladder decides on. Rule 12, and rule 20: same window.
      if (l >= laps - AVG) sc.step(d.contour, d.lag, tau, [arm.j1.wM, arm.j2.wM]);
      // AVERAGED OVER THE SETTLED LAPS, not read off the last one. A deployed pilot has a
      // lap-to-lap spread of a few percent, and one lap of that is noise in the very spectrum
      // the harmonic rung inverts — composite.test.mjs averages four for exactly this reason.
      // Rule 12: read the meter after it settles, and read it more than once.
      // THE ERROR SIGNAL, AVERAGED OVER THE SETTLED LAPS. What it contains and which
      // frame it is expressed in were both settled by measurement — see the note at the
      // top of the file; the two nulls it records are reachable behind CONTOURERR and
      // HFFWORLD so either can be reproduced rather than taken on trust.
      if (l >= laps - AVG) {
        let gx, gy;
        if (CONTOURERR) {
          // The recorded null, reachable: contour only, on the path's own normal at the
          // nearest point — the frame the magnitude was signed against.
          const t = path.tangent(d.s);
          gx = d.contour * -t[1]; gy = d.contour * t[0];
        } else {
          const tp = arm.toolXY(); gx = tp[0] - cmd.x; gy = tp[1] - cmd.y;
        }
        // THE LAP-PERIODIC RUNG READS JOINT SPACE, EVERY OTHER RUNG READS WORLD. `name` is
        // the rung asking, so each is shown the error in the frame it corrects in rather
        // than one signal being right for whichever rung happens to consume it.
        if (name === 'hff' && !HFFWORLD) {
          const j = worldToJoint([gx, gy], { q: [c1, c2] }); gx = j[0]; gy = j[1];
        }
        ex[k] += gx / AVG; ey[k] += gy / AVG;
      }
    }
    lapE.push(le);
  }
  await l1.destroy(); await l2.destroy();
  const rep = sc.report();
  // WHAT A LAP-HARMONIC CORRECTION COULD REMOVE AT BEST, from the signal itself. A rung that
  // writes a table indexed by lap phase and built from the first nh harmonics can only ever
  // cancel the part of the error that LIVES there. The rest — content above the cut, and
  // whatever does not repeat lap to lap — is a floor no number of Newton passes reaches,
  // because the iteration converges to zero error only within the set it can represent.
  // This is the achievable set measured by projection rather than inferred from an endpoint,
  // and it costs nothing: the signal is already in hand.
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
  // THIS RUN'S OWN UNCERTAINTY, on the same quantity as the score. The score is the contour
  // rms pooled over the last AVG laps, so its uncertainty is the standard error of the
  // per-lap contour rms across those laps. The bare machine repeats to rounding; a machine
  // with a pilot deployed does not, and the floor the ladder compares at has to be the
  // second one. Measured per run rather than assumed from the first (rule 31).
  const rl = [];
  for (let l = laps - AVG; l < laps; l++) {
    let s2 = 0;
    for (let k = 0; k < LAP; k++) s2 += lapE[l][k] * lapE[l][k];
    rl.push(Math.sqrt(s2 / LAP));
  }
  // ON SUCCESSIVE DIFFERENCES, WHICH A DRIFT CANNOT INFLATE. Taken as a plain standard
  // deviation about the mean, a configuration still converging across the averaged laps
  // reports its TRANSIENT as noise: on the arm that returned 3.47e-2 under a score of
  // 5.5e-2, i.e. 63% noise on a rig whose bare machine repeats to 1.6e-10. A linear drift
  // has constant successive differences, so their variance is zero and only the scatter
  // about the drift survives. Rule 13: a measurement taken across a transient describes
  // the transient — so the drift is reported SEPARATELY rather than folded in, because a
  // rung that has not settled is a thing to see, not a thing to average away (rule 27).
  const df = [];
  for (let i = 1; i < rl.length; i++) df.push(rl[i] - rl[i - 1]);
  const dMu = df.reduce((x, y) => x + y, 0) / Math.max(1, df.length);
  const dVa = df.reduce((x, y) => x + (y - dMu) * (y - dMu), 0) / Math.max(1, df.length - 1);
  const spread = Math.sqrt(Math.max(0, dVa / 2) / rl.length);
  const drift = dMu * (rl.length - 1);          // total travel across the averaged laps
  return { score: rep.contourRms, err: [ex, ey], bias: rep.contourBias, osc: rep.contourOsc,
    // THE CEILING FOR THIS MACHINE, not for the bare one. Computed here rather than only
    // for the first run, because the lap-periodic rung runs on the CASCADE-DEPLOYED machine
    // and that is whose spectrum decides what a lap-harmonic table can remove. The DFT is
    // tens of milliseconds against a run of tens of seconds, so every scored run can carry
    // its own denominator.
    lag: rep.lagRms, lapE, spread, drift, band,
    bands: Object.fromEntries([4, 8, 16, 32, 64].map((nh) => [nh, band(nh)])) };
}

/** Drive a Stack's phase machine in JOINT space, exactly as `composite.test.mjs` does. */
async function drivePilot(st) {
  const { arm, l1, l2, servo, rc } = await fresh();
  armRef = arm;
  let guard = 0;
  while (st.phase !== 'done' && guard++ < 4e6) {
    if (st.phase === 'fit') { st.work(); continue; }
    const cmd = st.command();
    const tgc = servo.jointTorques(cmd.map((c) => ({ theta: c.pos, omega: c.vel, alpha: c.acc })));
    const ff = rc.feedforward([[1, 0], [0, 1]], tgc, { enableToolff: false });
    // THE RUNGS BELOW THE PILOT ARE ARMED WHILE IT COMMISSIONS, because they will be armed
    // when it deploys — and they are fed the rates in THEIR OWN FRAME. The conventional rung
    // was fitted on the reference's WORLD velocity and acceleration; the pilot commands
    // JOINTS, so its commanded rates have to be carried through the Jacobian first. Handing
    // joint rates to a world-fitted basis and then mapping the answer back through J-inverse
    // is two frame errors that do not cancel: it drove this rung from 2.88x to 0.96x.
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
  }
  await l1.destroy(); await l2.destroy();
}

// ---- the pilot's own limits, in ITS frame, read off `composite.test.mjs`
{
  const m = await machine();
  const c = m.arm.ik(12, 0, true);
  centre[0] = c[0]; centre[1] = c[1];
  auto.channels = [0, 1].map((j) => ({ lo: c[j] - 0.55, hi: c[j] + 0.55,
    vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 }));
  auto.pilotOpts = {
    nMeasured: 6, autoRefuse: false, gateForecasts: false,
    uMax: Math.min(2.0, 0.15 * (16 / K)),
    probeAmp: 0.15 * Math.min(1.0, 0.15 * (16 / K)),
    ditherAmp: 0.1 * Math.min(1.0, 0.15 * (16 / K)),
    start: m.arm.ik(p0.x, p0.y, true),
    guards: [], refusePartial: false,
    workspace: (q) => {
      const rr = Math.hypot(m.arm.L1 * Math.cos(q[0]) + m.arm.L2 * Math.cos(q[0] + q[1]),
        m.arm.L1 * Math.sin(q[0]) + m.arm.L2 * Math.sin(q[0] + q[1]));
      return rr > Math.abs(m.arm.L1 - m.arm.L2) + 0.5 && rr < m.arm.L1 + m.arm.L2 - 0.5;
    },
    seed: 1,
  };
  await m.l1.destroy(); await m.l2.destroy();
}

// ---- THE INSTRUMENT'S FLOOR, MEASURED. A deterministic rig has none of its own.
// The SAME estimator every scored run reports for itself, on a full-length run so the two
// settling laps are excluded — a floor taken across a startup transient describes the
// transient (rule 13). It is a starting value: the ladder raises it to whatever the noisier
// deployed configurations measure for themselves.
const probe0 = await run(null, null);
auto.floor = probe0.spread;
console.log(`  [arm K ${K} E ${E}, rounded rect, feed ${PATH.feed}, lap ${LAP}]`);
console.log(`  conventional machine ${probe0.score.toExponential(4)}`
  + `  bias ${probe0.bias.toExponential(2)}  osc ${probe0.osc.toExponential(2)}`
  + `  lag ${probe0.lag.toExponential(2)}`
  + `   lap-to-lap floor ${auto.floor.toExponential(3)}`);
// WHAT THE LAP-PERIODIC RUNG IS ACTUALLY SHOWN, printed because it is the thing that
// moved the rung 2.06x -> 2.65x and because a stale version of this line described the
// narrowed signal for two commits after the narrowing was reverted (rule 30). It is
// derived from the flags rather than written beside them, so it cannot say the wrong thing.
console.log(`  the lap-periodic rung reads the ${CONTOURERR ? 'CONTOUR COMPONENT' : 'WHOLE TOOL ERROR'}`
  + ` in ${HFFWORLD ? 'WORLD' : 'JOINT'} space`
  + `${CONTOURERR || HFFWORLD ? '  — a REPRODUCTION of a measured null, not the default' : ''}`
  + `   [contour ${(probe0.score / probe0.lag).toFixed(2)}x the lag rms]`);
// THE CEILING ON THE LAP-PERIODIC RUNG, BEFORE IT IS COMMISSIONED. Reported first because
// it is the denominator every later row is judged against: a rung that reaches the floor of
// its own achievable set has nothing left to gain from a better operator, a bigger pass
// budget or a longer horizon, and one that does not has all three still open. Rule 27.
{
  const rows = [4, 8, 16, 32, 64].map((nh) => {
    const f = probe0.band(nh);
    return `nh ${String(nh).padStart(2)} ${(100 * f).toFixed(1)}%`
      + ` → ${(probe0.score * Math.sqrt(Math.max(0, 1 - f))).toExponential(2)}`;
  });
  console.log(`  a lap-harmonic table can only cancel what lives in its own band, so the`);
  console.log(`  floor it leaves is the rest — measured on this machine's own error:`);
  console.log(`    ${rows.join('   ')}`);
  console.log(`  (band share of the error's variance, and the residual a PERFECT correction`);
  console.log(`   inside that band would leave — no Newton loop can go below it)`);
}
check('the harness reproduces the conventional machine `composite.test.mjs` measures, so the '
  + 'comparison below is one variable — who chooses the constants — and not two machines',
  Math.abs(probe0.score - CONV) / CONV < 0.02,
  `${probe0.score.toExponential(4)} against composite's ${CONV.toExponential(4)}`);

const t0 = Date.now();
const rep = await auto.commission({ run, drivePilot });
console.log(`\n${auto.table()}`);
console.log(`\n  shipped ${JSON.stringify(rep.deployed)}   ${rep.base.toExponential(4)} → `
  + `${rep.best.toExponential(4)}   ${rep.gain.toFixed(2)}x   ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`  ${BAR.src}   ${TARGET.toExponential(4)}   ${(CONV / TARGET).toFixed(2)}x`);

// THE LAP-PERIODIC RUNG'S OWN CONVERGENCE, which has been recorded since the rung was
// written and never once shown. Whether it converged, stalled, or ran out of budget are
// three different problems with three different fixes, and the table above cannot tell
// them apart — every one of them prints a single number. `damped` is how many harmonics
// had their own step halved on each pass, so a plateau caused by a handful of badly
// identified harmonics looks different from one where the whole table gave up.
// THE CEILING ON THE MACHINE THE RUNG ACTUALLY RAN ON, beside the one on the bare machine.
// Where they differ, every headroom figure quoted against the bare one was measured on a
// spectrum the rung never saw.
if (rep.bandsBeforeHff) {
  const b = rep.bandsBeforeHff;
  const pre = rep.rungs.filter((r) => r.deployed && !/lap-periodic/.test(r.name)).pop();
  const sc = pre ? pre.score : probe0.score;
  console.log(`\n  what a lap-harmonic table could reach ON THE CASCADE-DEPLOYED machine`
    + ` (score ${sc.toExponential(3)}):`);
  console.log(`    ${[4, 8, 16, 32, 64].map((nh) => `nh ${String(nh).padStart(2)} `
    + `${(100 * b[nh]).toFixed(1)}% → ${(sc * Math.sqrt(Math.max(0, 1 - b[nh]))).toExponential(2)}`).join('   ')}`);
  console.log(`    (against ${(probe0.score * Math.sqrt(Math.max(0, 1 - probe0.band(16)))).toExponential(2)}`
    + ` at nh 16 on the BARE machine — the denominator every headroom figure has used so far)`);
}
if (rep.hff && rep.hff.hist && rep.hff.hist.length) {
  const h = rep.hff;
  const fmt = (xs) => xs.map((v) => v.toExponential(2)).join(' → ');
  console.log(`\n  the lap-periodic rung, pass by pass:`);
  console.log(`    ${fmt(h.hist)}`);
  if (h.damped && h.damped.length) {
    console.log(`    harmonics damped per pass: ${h.damped.join(' ')}`
      + `   (of ${h.cut || 'nh'} in the band)`);
  }
  // WHAT THE STEP DID, said only where it means something. With one global step there is
  // no per-harmonic survival to report, and printing a count from a field that was never
  // populated is how '0 harmonics above the floor' appeared on a run where every harmonic
  // was still moving.
  // THE NOISE THE PASSES WERE JUDGED AGAINST, and how many of them the instrument cannot
  // tell apart. A refinement that ends with most of its passes inside one standard
  // deviation of the best did not converge to that number — it drew it.
  if (h.sigma) {
    console.log(`    the machine repeats to ${h.sigma.toExponential(2)} (`
      + `${(100 * h.sigma / h.best).toFixed(1)}% of the score), and ${h.withinNoise} of `
      + `${h.hist.length} passes land within one of those of the best — so the deployed `
      + `table is one draw from ${h.withinNoise > 2 ? 'a cluster' : 'a clear winner'}`);
  }
  if (h.stopped) console.log(`    STOPPED: ${h.stopped}`);
  const fs = h.finalStep;
  console.log(`    step ended at ${fs === undefined ? 'not reported' : fs.toExponential(2)}`
    + (h.perHarmonicStep && h.stepH
      ? `, ${h.stepH.filter((x) => x >= fs).length} of ${h.stepH.length} harmonics still at it`
      : '')
    + (fs === undefined ? '' : `  — ${fs >= 1 ? 'the budget ran out with the step untouched'
      : 'the step was halved ' + Math.round(Math.log2(1 / fs)) + 'x, so passes were being rejected'}`));
}
if (rep.unsettled && rep.unsettled.length) {
  console.log(`  NOT SETTLED when scored — the number is a point on a transient, not a `
    + `converged one:`);
  for (const u of rep.unsettled) {
    console.log(`    ${u.at}  score ${u.score.toExponential(3)}  drifting `
      + `${u.drift > 0 ? '+' : ''}${u.drift.toExponential(2)} across the ${AVG} averaged laps`);
  }
}
// A DECISION THE FINAL FLOOR NO LONGER SUPPORTS is the one thing a rising floor can do
// quietly, so it is printed rather than left in the report object.
if (rep.floorRevised) {
  console.log(`  the floor rose UNDER a decision already made — these rungs were deployed on `
    + `a margin that no longer clears at the final resolution:`);
  for (const f of rep.floorRevised) {
    console.log(`    ${f.name}  ${f.score.toExponential(3)} against ${f.ref.toExponential(3)}`
      + `  judged at floor ${f.judgedAt.toExponential(2)}, final ${f.finalFloor.toExponential(2)}`);
  }
}
if (auto.floor > probe0.spread) {
  console.log(`  the instrument's floor ROSE during commissioning, `
    + `${probe0.spread.toExponential(2)} → ${auto.floor.toExponential(2)}, on `
    + `'${rep.floorFrom}' — the deployed machine is noisier than the bare one, and the `
    + `comparisons above were made at the coarser resolution`);
}

check(`THE HEADLINE: the self-tuning ladder matches or beats ${BAR.src} on the same machine `
  + 'and program — the strongest result this repository has at these settings',
  rep.best <= TARGET, `${rep.best.toExponential(4)} against ${TARGET.toExponential(4)}`);
check('…and it is not the common cap doing the work by accident: the cap was not binding when '
  + 'the shipped configuration was scored',
  auto.clipping().frac < 0.01, JSON.stringify(auto.clipping()));

// ---- THE VARIATION, CLASSIFIED. Per-lap contour rms on the shipped machine, then the two
// numbers that separate the three explanations: a linear trend (drift), and the lag-1
// autocorrelation of what is left after removing it (near 0 independent, near +1 still
// drifting, near -1 alternating).
if (NOISEPROBE > 0) {
  const probe = await run(null, null, 2 + NOISEPROBE);
  const r = [];
  for (let l = 2; l < 2 + NOISEPROBE; l++) {
    let s2 = 0;
    for (let k = 0; k < LAP; k++) s2 += probe.lapE[l][k] * probe.lapE[l][k];
    r.push(Math.sqrt(s2 / LAP));
  }
  const n = r.length, mu = r.reduce((x, y) => x + y, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (i - (n - 1) / 2) * (r[i] - mu); sxx += (i - (n - 1) / 2) ** 2; }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const res = r.map((v, i) => v - (mu + slope * (i - (n - 1) / 2)));
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) den += res[i] * res[i];
  for (let i = 1; i < n; i++) num += res[i] * res[i - 1];
  const ac1 = den > 0 ? num / den : 0;
  const sd = Math.sqrt(den / Math.max(1, n - 2));
  const S = auto.stack ? auto.stack.sample : 1;
  console.log(`\n  the shipped machine over ${n} laps — is the 'noise' noise?`);
  console.log(`    pilot cadence S ${S}, lap ${LAP}, LAP/S ${(LAP / S).toFixed(3)} — `
    + `${LAP % S === 0 ? 'S DIVIDES the lap, so the phase cannot walk'
      : `remainder ${LAP % S}, so the pilot starts each lap ${(100 * (LAP % S) / S).toFixed(0)}% `
        + 'of a sample later than the last'}`
    + `   [look-ahead indexed ${LAPSYNC ? 'FROM THE LAP START' : 'continuously'}]`);
  console.log(`    ${r.map((v) => v.toExponential(3)).join(' ')}`);
  console.log(`    mean ${mu.toExponential(3)}   drift ${(slope * n).toExponential(2)} across the run`
    + `   scatter about it ${sd.toExponential(2)} (${(100 * sd / mu).toFixed(1)}%)`);
  // IS THE DRIFT A TRANSIENT OR IS IT ONGOING? Split the run in half and compare: a machine
  // still settling drifts in the first half and less in the second, and one that is simply
  // wandering drifts as much in both. The answer decides whether the fix is a longer settle
  // before measuring, or a wider window — and they are not interchangeable, because
  // averaging cannot remove a drift that continues through the window.
  if (n >= 8) {
    const half = (arr) => {
      const m = arr.length, mid = Math.floor(m / 2);
      const fit = (a2) => {
        const nn = a2.length, mu2 = a2.reduce((x, y) => x + y, 0) / nn;
        let sxy2 = 0, sxx2 = 0;
        for (let i = 0; i < nn; i++) { sxy2 += (i - (nn - 1) / 2) * (a2[i] - mu2); sxx2 += (i - (nn - 1) / 2) ** 2; }
        return sxx2 > 0 ? (sxy2 / sxx2) * nn : 0;
      };
      return [fit(arr.slice(0, mid)), fit(arr.slice(mid))];
    };
    const [d1, d2] = half(r);
    console.log(`    drift first half ${d1.toExponential(2)}, second half ${d2.toExponential(2)} — `
      + (Math.abs(d2) < 0.4 * Math.abs(d1) ? 'SETTLING: a longer settle before measuring'
        : 'ONGOING: a wider window will not remove it, the machine is still moving'));
  }
  console.log(`    lag-1 autocorrelation ${ac1.toFixed(3)} — `
    + (ac1 > 0.5 ? 'STILL DRIFTING: a longer settle, not more averaging'
      : ac1 < -0.5 ? 'ALTERNATING: the pilot and the lap are beating, averaging an even number of laps'
        : 'INDEPENDENT: averaging N laps cuts it by sqrt(N)'));
}
console.log(failed ? `\nautostack-arm: ${failed} check(s) FAILED\n`
  : '\nautostack-arm: all checks passed\n');
process.exit(failed ? 1 : 0);
