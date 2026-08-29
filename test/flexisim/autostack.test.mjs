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
const CMDNORM = !!process.env.CMDNORM;
// THE FRAME THE LAP-PERIODIC RUNG CORRECTS IN. World was measured against a path-normal
// axis (8.86x against 0.99x) and the conclusion drawn was "a frame that does not rotate
// with the path". That is not the property that matters. What HarmonicFF needs is a frame
// in which the map from its correction to the error it reads is CONSTANT around the lap,
// because it fits ONE 2cx2c operator per harmonic and the DFT averages whatever varies.
// In world that map is J K^-1 J^T, and `_lti.mjs` measures it on this very machine: 5.41x
// between the stiffest and softest direction, the trace moving 29.9%, and the principal
// axis turning 127.6 degrees peak to peak. In JOINT space the pose dependence is entirely
// inside J, so what is left is the gearbox — very nearly constant. It is also the frame the
// pilot already reads its error in, three lines down in `drivePilot`.
const HFFJOINT = !!process.env.HFFJOINT;
// THE FULL TOOL ERROR RATHER THAN ITS NORMAL COMPONENT. Narrowing the signal to contour was
// meant to stop the rung spending authority on lag, which the score cannot see removed. It
// measured 2.05x -> 1.00x: the rung stopped being able to beat the cascade at all. The
// reason is that the narrowing is itself a ROTATING OPERATOR — projecting onto n(k) is
// P(k) = n n^T, and n turns 127.6 degrees around this lap, the very rotation `_lti.mjs`
// measures. So the fitted operator is P(k)G rather than G, and a lap-varying factor was
// introduced into exactly the map HarmonicFF assumes constant. Cancelling the whole error
// necessarily cancels its normal part too; the lag authority is wasted, not harmful.
const FULLERR = !!process.env.FULLERR;
// ONE ERROR SIGNAL IS RETURNED PER RUN AND BOTH RUNGS READ IT, so putting it in joint space
// for the lap-periodic rung also hands it to the conventional rung, whose basis is the
// reference's WORLD velocity and acceleration. That combination is not a variant, it is a
// frame error — so it refuses to run rather than producing a number nobody can interpret.
// Rule 51: silence is a failure mode.
if (HFFJOINT && !process.env.NOCLASSIC) {
  console.log('  HFFJOINT puts the shared error signal in joint space, which the '
    + 'conventional rung\'s world-fitted basis cannot read. Run it with NOCLASSIC=1.');
  process.exit(2);
}

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
  uMax: 3.0, periodic: LAP, maxDepth: 2,
  basis: process.env.NOCLASSIC ? null : motionBasis([{ v: wv[0], a: wa[0] }, { v: wv[1], a: wa[1] }]),
  frames: { classic: { uMax: 1.5, map: worldToJoint },
    hff: HFFJOINT ? { uMax: Math.min(2.0, 0.15 * (16 / K)) } : { uMax: 1.5, map: worldToJoint },
    stack: { uMax: Math.min(2.0, 0.15 * (16 / K)) } },      // composite.test.mjs's own figure
  pilot: {},                        // filled below, once the arm's own centre is known
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
      const kSamp = Math.floor((l * LAP + k) / S);
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
      // THE SIGNAL IS THE CONTOUR COMPONENT, CARRIED IN WORLD COORDINATES. The raw tool
      // error is contour + lag, and the score is contourRms only — so a rung handed the raw
      // error spends authority cancelling lag, which this project states is not a defect (the
      // part is the right shape, the cycle is slower) and which the score cannot see it
      // remove. This is NOT the path-normal FRAME that measured 0.99x: that expressed the
      // CORRECTION as one scalar along a rotating axis. Here the correction stays a full
      // two-vector in world; only which error it is asked to cancel changes.
      // AND THE NORMAL IS THE ONE THE MAGNITUDE WAS SIGNED AGAINST. `decompose` signs
      // `contour` by the left normal AT THE NEAREST POINT ON THE PATH; the commanded
      // velocity's left normal is a different point, separated along the path by the LAG,
      // so the two disagree by about lag x curvature — zero on the straights and largest
      // on exactly the corner arcs where contour error is largest. Rule 47: every term of a
      // projected quantity must be projected the same way. `path.tangent(d.s)` is the same
      // point, so it costs nothing to be right.
      if (l >= laps - AVG) {
        let nx, ny;
        if (CMDNORM) {
          const sp = Math.hypot(cmd.vx, cmd.vy) || 1;
          nx = -cmd.vy / sp; ny = cmd.vx / sp;
        } else {
          const t = path.tangent(d.s);
          nx = -t[1]; ny = t[0];
        }
        let gx, gy;
        if (FULLERR) { const tp = arm.toolXY(); gx = tp[0] - cmd.x; gy = tp[1] - cmd.y; }
        else { gx = d.contour * nx; gy = d.contour * ny; }
        // A RUNG MUST BE SHOWN THE ERROR IN THE FRAME IT CORRECTS IN. The pilot already is;
        // the lap-periodic rung was not, and it is the one whose method assumes the map
        // between the two is constant.
        if (HFFJOINT) { const j = worldToJoint([gx, gy], { q: [c1, c2] }); gx = j[0]; gy = j[1]; }
        ex[k] += gx / AVG; ey[k] += gy / AVG;
      }
    }
    lapE.push(le);
  }
  await l1.destroy(); await l2.destroy();
  const rep = sc.report();
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
    lag: rep.lagRms, lapE, spread, drift };
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
// THE PROBE SCALE MOVED WITH THE SIGNAL. HarmonicFF sizes its probe as a FRACTION of the
// peak of the error it is handed, and both fractions on its ladder are that same ratio —
// so narrowing the signal from the raw tool error to the contour component alone scales
// every probe candidate down by the contour:lag ratio, and the ladder cannot compensate by
// choosing a larger one. Arguably the more correct scale, since the probe should be sized
// to the error it intends to remove; recorded because if the harmonic rung collapses this
// is the first thing to look at.
console.log(`  the signal handed to the lap-periodic rung is the CONTOUR component: `
  + `${(probe0.score / probe0.lag).toFixed(2)}x the lag rms, which is the factor every `
  + `probe candidate's amplitude moved by`);
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
if (rep.unsettled && rep.unsettled.length) {
  console.log(`  NOT SETTLED when scored — the number is a point on a transient, not a `
    + `converged one:`);
  for (const u of rep.unsettled) {
    console.log(`    ${u.at}  score ${u.score.toExponential(3)}  drifting `
      + `${u.drift > 0 ? '+' : ''}${u.drift.toExponential(2)} across the ${AVG} averaged laps`);
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

console.log(failed ? `\nautostack-arm: ${failed} check(s) FAILED\n`
  : '\nautostack-arm: all checks passed\n');
process.exit(failed ? 1 : 0);
