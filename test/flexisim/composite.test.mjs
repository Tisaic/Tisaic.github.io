/**
 * THE COMPOSITE: A CASCADE OF PILOTS WITH HARMONIC FEEDFORWARD ON TOP — 29.2x.
 *
 * Two mechanisms that fail separately and compose in exactly one order.
 *
 * WHAT EACH ONE IS. The pilot inverts identified DYNAMICS over a receding horizon and is
 * commissioned from noise, so it knows nothing about the program; a cascade is the same
 * object twice, the second layer commissioned with the first deployed and frozen. Harmonic
 * feedforward inverts the plant AT THE PROGRAM'S OWN LAP HARMONICS, in the WORLD frame,
 * refined by a damped Newton step against a frozen operator.
 *
 * THE ORDER IS NOT SYMMETRIC, and the reason is structural rather than tuning. The pilot
 * commissions on a program-agnostic SCRIBBLE while an HFF table is indexed by LAP PHASE, so
 * "commission the pilot over HFF" applies a phase-indexed correction to a machine that is not
 * on the path: measured at 0.71x, WORSE than the double correction it was meant to fix. The
 * reverse composes cleanly because HFF is identified on the machine AS IT RUNS.
 *
 * AND THE OPERATOR MUST COME FROM THE CLEAN MACHINE. Re-probing the channel with the pilot
 * active cannot be clean at any amplitude -- the pilot is a box-constrained QP that REACTS to
 * the probe, so the composite is not LTI: 4e-3 drowns in the pilot's own lap-to-lap spread,
 * 0.02 gives 8.64x, 0.05 gives 11.27x, all with erratic traces. The channel from a command
 * offset to the tool belongs to the PLANT AND SERVO and does not change when a feedforward is
 * switched on, and identified on the conventional machine it is clean enough that two probe
 * amplitudes fifty times apart agree to 1.00. Using it instead: 11.27x -> 16.93x.
 *
 * MEASURED, one plant, one program, one conventional baseline:
 *
 *     conventional (computed torque + PD + RobotComp)   4.122e-1
 *     pilot alone                                       6.616e-2    6.23x
 *     HFF alone                                         4.653e-2    8.86x
 *     HFF + pilot commissioned bare (double correction) 4.176e-1    0.99x
 *     HFF + pilot commissioned OVER it (wrong order)    5.797e-1    0.71x
 *     pilot + HFF on top                                2.434e-2   16.93x
 *     CASCADE(2) + HFF on top                           1.411e-2   29.21x
 *
 * WHAT IS NOT THE LIMIT, each eliminated by measurement rather than argument: drive
 * saturation (peak demand 30% of tauMax, zero saturations), lap non-repeatability on the
 * conventional machine (0.03%), cross-harmonic coupling (a tridiagonal solve measures 8.46x
 * against the diagonal's 8.47x), a stale Jacobian (re-identifying at the converged point
 * returns the same operator), basis size (more harmonics is worse), and measurement noise
 * (averaging four laps into each update halves the lap-to-lap scatter and moves the result
 * by 0.6%).
 */
/**
 * HARMONIC FEEDFORWARD: cancelling a contour error in the frame the plant is diagonal in.
 *
 * THE MEASUREMENT THAT STARTED IT. On the page's machine the stack's residual is 99.1%
 * OSCILLATION and 100% LAP-SYNCHRONOUS -- every one of the top eight spectral peaks is an
 * exact integer harmonic of the lap (lap/2 25.3%, lap/4 18.6%, lap/7 11.5%, lap/3 10.5%).
 * Nothing is resonating. The error is a deterministic path-locked waveform living in the
 * first ~20 harmonics, which is why four separate "stop exciting the mode" ideas were built
 * and all measured dead:
 *
 *   - a NOTCH in the QP's effort penalty (built in `boxQP`, plumbed through `Pilot`, and
 *     used by nothing): there is no free mode to notch.
 *   - a TORQUE-DOMAIN correction channel, on the theory that a position-reference offset is
 *     low-passed by the position loop while a torque lands at the plant input: both roll
 *     off at -6dB by harmonic 4, and position is the stronger channel on 15 of the first 20.
 *   - MODE-AWARE FEEDRATE SHAPING: dodges a resonance that is not there.
 *   - RAISING THE SERVO BANDWIDTH: replicates the trap already recorded in compensator.js,
 *     now on this program too -- the stack goes 6.843e-2 -> 1.293e-1 at 4e-3 and 1.105e-1
 *     at 8e-3, because Ts collapses 2110 -> 683 and the pilot models a different plant.
 *
 * WHAT WORKS, AND THE ONE THING THAT DECIDED IT. A lap-periodic error is exactly cancellable
 * by a lap-periodic correction, so invert the plant at the program's own harmonics. Done in
 * the PATH-NORMAL frame that gives 1.09x and nothing else -- because the normal direction
 * AND the Jacobian both rotate around the lap, so a single injected harmonic comes back
 * SMEARED across its neighbours and `G_hh` is only the diagonal of an operator with large
 * off-diagonal terms. Inverting a diagonal that is not the operator cancels nothing.
 *
 * WORLD X AND Y DO NOT ROTATE. The same solve in the world frame, identifying the full 2x2
 * complex response per harmonic from four probe laps, is 2.92x on the first pass with the
 * bias cut 126x. This is rule 47 in a new costume: every term of a projected quantity must
 * be projected, and a frame that spins is not a frame you may invert one harmonic at a time.
 *
 * IDENTIFY ONCE, THEN REFINE -- and DAMP IT. The operator belongs to the machine and the
 * program, so later passes reuse it: solve, measure what is left, solve again against the
 * SAME matrices, add. That is a Newton step with a frozen Jacobian, one measurement lap per
 * pass and no re-identification, which is what separates it from iterative learning where
 * every lap buys one update and nothing is ever modelled. UNDAMPED IT DIVERGES -- measured
 * 2.92x, 2.84x, 1.71x, 0.98x with peak|W| climbing 1.18 -> 2.80 -- which is the same
 * unguarded-iteration failure this repo already records for an ILC table pumped to 5.25. At
 * a 0.6 step it is monotone and reaches 8.86x, BEATING the fully commissioned pilot's 6.02x
 * on the same machine and program, for 4 identification laps plus 9 refinement laps against
 * the pilot's ~130,000 steps of commissioning.
 *
 * MORE HARMONICS IS WORSE, which is the roll-off stated from the other side: at NH=24 the
 * added harmonics have |G| ~ 0.008, far below the channel's authority, and inverting them
 * explodes -- peak|W| 8.69 and divergence by pass 3. NH=16 is not a tuning choice, it is
 * where the channel stops being able to act.
 *
 * TWO WAYS OF COMBINING IT WITH THE PILOT BOTH FAIL, stated because the obvious next move is
 * to stack them. Identifying with the pilot ACTIVE is noise-dominated -- its lap-to-lap
 * spread (+/-4%) exceeds the probe signal, so G comes back as noise and the solve amplifies
 * it (0.40x on the first pass). Identifying on the clean machine and deploying UNDER the
 * pilot is worse than the pilot alone (2.240e-1 against 6.843e-2), because two feedforwards
 * do not simply add when one of them is a receding-horizon controller that responds to the
 * other's effect. Commissioning the pilot OVER a deployed HFF is the untried third option.
 */
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
console.log('\nflexisim: harmonic feedforward — the frame decides, and the step size decides\n');

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

const zero = () => ({ xre: new Array(NH).fill(0), xim: new Array(NH).fill(0),
  yre: new Array(NH).fill(0), yim: new Array(NH).fill(0) });

/**
 * One run of the conventional machine with an optional lap-periodic correction.
 *
 * `frame` picks WHERE the correction lives: 'world' injects (dx, dy) directly, 'normal'
 * injects along the path normal. That switch is the entire experiment -- same plant, same
 * solve, same harmonics, and a factor of nearly three between them.
 */
async function run({ w = null, frame = 'world', laps = 3 }) {
  const { arm, l1, l2, servo } = await machine();
  const rc = commissionComp(arm, servo);
  const path = roundedRect(PATH);
  const lap = Math.ceil(path.lap);
  const refsAt = new Array(lap);
  for (let k = 0; k < lap; k++) { const c = path.at(k); refsAt[k] = arm.ik(c.x, c.y, true); }
  settle(arm, servo, refsAt[0][0], refsAt[0][1]);
  const score = new ContourScore({ joints: 2 });
  const tx = [], ty = [];
  for (let l = 0; l < laps; l++) {
    for (let k = 0; k < lap; k++) {
      const cmd = path.at(k);
      const [c1, c2] = refsAt[k];
      const r = arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const base = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
      const ff = rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base),
        { enableToolff: false });
      let dq = [0, 0];
      if (w) {
        let wx = 0, wy = 0;
        for (let h = 1; h <= NH; h++) {
          const a = 2 * Math.PI * h * k / lap, c = Math.cos(a), sn = Math.sin(a);
          wx += w.xre[h - 1] * c + w.xim[h - 1] * sn;
          wy += w.yre[h - 1] * c + w.yim[h - 1] * sn;
        }
        if (frame === 'normal') {
          // THE FRAME THAT DOES NOT WORK, kept because the comparison IS the finding.
          const sp = Math.hypot(cmd.vx, cmd.vy) || 1;
          const nx = -cmd.vy / sp, ny = cmd.vx / sp;
          const s = wx; wx = s * nx; wy = s * ny;
        }
        const J = arm.jacobian(c1, c2);
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        if (Math.abs(det) > 1e-12) {
          dq = [(J[1][1] * wx - J[0][1] * wy) / det, (-J[1][0] * wx + J[0][0] * wy) / det];
        }
      }
      const tau = servo.torques([
        { ...base[0], theta: c1 + ff.dq[0] + dq[0] },
        { ...base[1], theta: c2 + ff.dq[1] + dq[1] }]);
      arm.step(tau[0], tau[1], 1);
      const d = decompose(path, arm.toolXY(), cmd);
      if (l === laps - 1) {
        score.step(d.contour, d.lag, tau, [arm.j1.wM, arm.j2.wM]);
        const tp = arm.toolXY();
        tx.push(tp[0] - cmd.x); ty.push(tp[1] - cmd.y);
      }
    }
  }
  await l1.destroy(); await l2.destroy();
  const rep = score.report();
  return { contour: rep.contourRms, bias: rep.contourBias, osc: rep.contourOsc, tx, ty };
}

function project(x) {
  const n = x.length, re = [], im = [];
  for (let h = 1; h <= NH; h++) {
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      const wv = 2 * Math.PI * h * i / n;
      a += x[i] * Math.cos(wv); b += x[i] * Math.sin(wv);
    }
    re.push(2 * a / n); im.push(2 * b / n);
  }
  return { re, im };
}
function solve4(M, b) {
  const n = 4, a = M.map((r, i) => r.slice().concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let j = c; j <= n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((r, i) => r[n] / a[i][i]);
}

import { Pilot } from '../../lib/pilot/pilot.js';
import { Stack } from '../../lib/pilot/stack.js';
// A CASCADE AS THE FIRST LAYER. Layer k is an ordinary pilot commissioned with the layers
// below it deployed and frozen, so each models what the previous one left. HFF then sits on
// the whole thing, cancelling the lap-periodic part of what the cascade cannot reach.
const DEPTH = +(process.env.DEPTH || 2);
const STEP2 = +(process.env.STEP || 0.6);
const PASSES2 = +(process.env.PASSES || 12);

const base = await run({});
console.log(`  conventional                      ${base.contour.toExponential(3)}`);

// 1. Converge the HFF table on the conventional machine.
const X0 = project(base.tx), Y0 = project(base.ty);
async function probe(field, phase) {
  const pr = zero(); pr[field + (phase === 'c' ? 're' : 'im')].fill(AMP);
  const r = await run({ w: pr });
  return { X: project(r.tx), Y: project(r.ty) };
}
const pxc = await probe('x', 'c'), pxs = await probe('x', 's');
const pyc = await probe('y', 'c'), pys = await probe('y', 's');
const Mh = [];
for (let hh = 0; hh < NH; hh++) Mh.push([
  [(pxc.X.re[hh]-X0.re[hh])/AMP,(pxs.X.re[hh]-X0.re[hh])/AMP,(pyc.X.re[hh]-X0.re[hh])/AMP,(pys.X.re[hh]-X0.re[hh])/AMP],
  [(pxc.X.im[hh]-X0.im[hh])/AMP,(pxs.X.im[hh]-X0.im[hh])/AMP,(pyc.X.im[hh]-X0.im[hh])/AMP,(pys.X.im[hh]-X0.im[hh])/AMP],
  [(pxc.Y.re[hh]-Y0.re[hh])/AMP,(pxs.Y.re[hh]-Y0.re[hh])/AMP,(pyc.Y.re[hh]-Y0.re[hh])/AMP,(pys.Y.re[hh]-Y0.re[hh])/AMP],
  [(pxc.Y.im[hh]-Y0.im[hh])/AMP,(pxs.Y.im[hh]-Y0.im[hh])/AMP,(pyc.Y.im[hh]-Y0.im[hh])/AMP,(pys.Y.im[hh]-Y0.im[hh])/AMP]]);
const W = zero();
{
  let cur = base, best = Infinity;
  for (let p = 1; p <= (process.env.ONLY_TOP ? 0 : PASSES2); p++) {
    const Xr = project(cur.tx), Yr = project(cur.ty);
    const trial = { xre: W.xre.slice(), xim: W.xim.slice(), yre: W.yre.slice(), yim: W.yim.slice() };
    for (let hh = 0; hh < NH; hh++) {
      const v = solve4(Mh[hh], [-Xr.re[hh], -Xr.im[hh], -Yr.re[hh], -Yr.im[hh]]);
      if (!v) continue;
      trial.xre[hh] += STEP2 * v[0]; trial.xim[hh] += STEP2 * v[1];
      trial.yre[hh] += STEP2 * v[2]; trial.yim[hh] += STEP2 * v[3];
    }
    const next = await run({ w: trial });
    if (next.contour > best) break;
    best = next.contour; cur = next;
    for (const k of ['xre', 'xim', 'yre', 'yim']) W[k] = trial[k].slice();
  }
  if (!process.env.ONLY_TOP) console.log(`  + HFF                             ${best.toExponential(3)}   ${(base.contour / best).toFixed(2)}x`);
}

// 2. COMMISSION THE PILOT ON THE MACHINE HFF LEAVES. The excitation, the fit and the verify
// all run with the converged HFF table applied, so what the pilot models is the RESIDUAL
// after HFF rather than the whole error. Commissioning it bare and then adding HFF is the
// double-correction that made mode 8 measure worse than its own half.
function tableAt(T, k, lap) {
  let wx = 0, wy = 0;
  for (let h = 1; h <= NH; h++) {
    const ang = 2 * Math.PI * h * k / lap, c = Math.cos(ang), sn = Math.sin(ang);
    wx += T.xre[h - 1] * c + T.xim[h - 1] * sn;
    wy += T.yre[h - 1] * c + T.yim[h - 1] * sn;
  }
  return [wx, wy];
}
function hffAt(k, lap) {
  let wx = 0, wy = 0;
  for (let h = 1; h <= NH; h++) {
    const ang = 2 * Math.PI * h * k / lap, c = Math.cos(ang), sn = Math.sin(ang);
    wx += W.xre[h - 1] * c + W.xim[h - 1] * sn;
    wy += W.yre[h - 1] * c + W.yim[h - 1] * sn;
  }
  return [wx, wy];
}
async function commissionPilotOver(useHff) {
  const { arm, l1, l2, servo } = await machine();
  const rc = commissionComp(arm, servo);
  const path = roundedRect(PATH);
  const lap = Math.ceil(path.lap);
  const centre = arm.ik(12, 0, true);
  const p0 = path.at(0);
  const opts = {
    nMeasured: 6, autoRefuse: false, gateForecasts: false,
    channels: [0, 1].map((j) => ({ lo: centre[j] - 0.55, hi: centre[j] + 0.55,
      vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
    uMax: Math.min(2.0, 0.15 * (16 / K)),
    probeAmp: 0.15 * Math.min(1.0, 0.15 * (16 / K)),
    ditherAmp: 0.1 * Math.min(1.0, 0.15 * (16 / K)),
    start: arm.ik(p0.x, p0.y, true),
    guards: [],
    workspace: (q) => {
      const rr = Math.hypot(arm.L1 * Math.cos(q[0]) + arm.L2 * Math.cos(q[0] + q[1]),
        arm.L1 * Math.sin(q[0]) + arm.L2 * Math.sin(q[0] + q[1]));
      return rr > Math.abs(arm.L1 - arm.L2) + 0.5 && rr < arm.L1 + arm.L2 - 0.5;
    },
    seed: 1 };
  const pilot = DEPTH > 1 ? new Stack({ ...opts, depth: DEPTH, refusePartial: false })
    : new Pilot(opts);
  let guard = 0, k = 0;
  while (pilot.phase !== 'done' && guard++ < 4e6) {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    const tgc = servo.jointTorques(cmd.map((c) => ({ theta: c.pos, omega: c.vel, alpha: c.acc })));
    const ff = rc.feedforward([[1, 0], [0, 1]], tgc, { enableToolff: false });
    let hx = 0, hy = 0;
    if (useHff) { const w = hffAt(k % lap, lap); hx = w[0]; hy = w[1]; }
    const J = arm.jacobian(cmd[0].pos, cmd[1].pos);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    const hq = Math.abs(det) > 1e-12
      ? [(J[1][1] * hx - J[0][1] * hy) / det, (-J[1][0] * hx + J[0][0] * hy) / det] : [0, 0];
    const refs = cmd.map((c, j) => ({ theta: c.pos + c.u + ff.dq[j] + hq[j],
      omega: c.vel, alpha: c.acc }));
    const tau = servo.torques(refs);
    arm.step(tau[0], tau[1], 1);
    k++;
    const enc = arm.encoders(), tool = arm.toolXY();
    const q1 = cmd[0].pos, q2 = cmd[1].pos;
    const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
    const cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
    const Jj = arm.jacobian(q1, q2);
    const dt = Jj[0][0] * Jj[1][1] - Jj[0][1] * Jj[1][0];
    const ex = tool[0] - cx, ey = tool[1] - cy;
    pilot.observe([enc[0].angle, enc[1].angle, enc[0].speed * 1e3, enc[1].speed * 1e3,
      tau[0] * 1e3, tau[1] * 1e3],
    [(Jj[1][1] * ex - Jj[0][1] * ey) / dt, (-Jj[1][0] * ex + Jj[0][0] * ey) / dt]);
  }
  await l1.destroy(); await l2.destroy();
  return pilot;
}

/** Deploy any combination of the two on one fresh machine. */
async function deploy({ hff = false, pilot = null, table = null }) {
  const { arm, l1, l2, servo } = await machine();
  const rc = commissionComp(arm, servo);
  const path = roundedRect(PATH);
  const lap = Math.ceil(path.lap);
  const refsAt = new Array(lap);
  for (let k = 0; k < lap; k++) { const c = path.at(k); refsAt[k] = arm.ik(c.x, c.y, true); }
  settle(arm, servo, refsAt[0][0], refsAt[0][1]);
  if (pilot) pilot._initRun();
  const S2 = pilot ? pilot.sample : 1;
  const sampRef = (i) => refsAt[((i * S2) % lap + lap) % lap];
  const score = new ContourScore({ joints: 2 });
  const dtx = new Array(lap).fill(0), dty = new Array(lap).fill(0), ptx = [], pty = [];
  let uPk = 0;
  for (let l = 0; l < LAPS0; l++) {
    for (let k = 0; k < lap; k++) {
      const kk = l * lap + k;
      const cmd = path.at(k);
      const [c1, c2] = refsAt[k];
      const r = arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const b2 = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
      const ff = rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(b2), { enableToolff: false });
      let dq = [0, 0];
      if (hff) {
        const [wx, wy] = table ? tableAt(table, k, lap) : hffAt(k, lap);
        const J = arm.jacobian(c1, c2);
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        if (Math.abs(det) > 1e-12) {
          dq = [(J[1][1] * wx - J[0][1] * wy) / det, (-J[1][0] * wx + J[0][0] * wy) / det];
        }
      }
      if (pilot) {
        const u = pilot.act((off) => sampRef(Math.floor(kk / S2) + off));
        dq = [dq[0] + u[0], dq[1] + u[1]];
      }
      uPk = Math.max(uPk, Math.abs(dq[0]), Math.abs(dq[1]));
      const tau = servo.torques([
        { ...b2[0], theta: c1 + ff.dq[0] + dq[0] },
        { ...b2[1], theta: c2 + ff.dq[1] + dq[1] }]);
      arm.step(tau[0], tau[1], 1);
      const d = decompose(path, arm.toolXY(), cmd);
      // THE PILOT'S FULL MEASUREMENT VECTOR. Zeroing four of its six signals here made it
      // measure 0.15x against the 6.02x the same object reaches in reconcile.test.mjs -- a
      // harness bug, not a property of the controller, and the kind that looks like a
      // finding if the known-good number is not sitting next to it.
      if (pilot) {
        const en = arm.encoders();
        pilot.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
          tau[0] * 1e3, tau[1] * 1e3], null);
      }
      if (l >= LAPS0 - AVG) {
        // AVERAGE THE ERROR OVER SEVERAL LAPS BEFORE UPDATING. With the pilot deployed the
        // machine is 20% non-repeatable lap to lap (4.92e-3 against a 2.50e-2 residual)
        // where the conventional machine is 0.03%, because a dynamic controller reacting to
        // measurements does not repeat exactly. An update computed from ONE noisy lap chases
        // that noise, which is what makes the iteration bounce and the stall counter fire.
        const tp = arm.toolXY();
        const idx = k;
        dtx[idx] = (dtx[idx] || 0) + (tp[0] - cmd.x) / AVG;
        dty[idx] = (dty[idx] || 0) + (tp[1] - cmd.y) / AVG;
      }
      if (l === LAPS0 - 1) {
        score.step(d.contour, d.lag, tau, [arm.j1.wM, arm.j2.wM]);
      }
      // THE PREVIOUS LAP, so a number reached by destabilising the machine is visible.
      if (l === LAPS0 - 2) { const tp = arm.toolXY(); ptx.push(tp[0] - cmd.x); pty.push(tp[1] - cmd.y); }
    }
  }
  const sat = [servo.saturated[0], servo.saturated[1]];
  const dem = [servo.peakDemand[0], servo.peakDemand[1]];
  const tm = servo.tauMax;
  await l1.destroy(); await l2.destroy();
  const rep = score.report();
  let nr = 0;
  for (let i = 0; i < Math.min(dtx.length, ptx.length); i++) {
    nr += (dtx[i] - ptx[i]) ** 2 + (dty[i] - pty[i]) ** 2;
  }
  return { contour: rep.contourRms, uPk, tx: dtx, ty: dty,
    nonrep: Math.sqrt(nr / Math.max(1, dtx.length)), sat, dem, tauMax: tm };
}

const pBare = await commissionPilotOver(false);
const pOver = process.env.ONLY_TOP ? null : await commissionPilotOver(true);
console.log(`  pilot commissioned BARE  ${JSON.stringify(pBare.verdict).slice(0, 90)}`);
if (pOver) console.log(`  pilot commissioned OVER  ${JSON.stringify(pOver.verdict).slice(0, 90)}`);
const rows = process.env.ONLY_TOP ? [] : [
  ['pilot alone (bare)', { pilot: pBare }],
  ['HFF + pilot(bare)  — the double correction', { hff: true, pilot: pBare }],
  ['HFF + pilot(OVER)  — commissioned on what HFF leaves', { hff: true, pilot: pOver }],
];
console.log('');
for (const [name, cfg] of rows) {
  const r = await deploy(cfg);
  console.log(`  ${name.padEnd(46)} ${r.contour.toExponential(3)}`
    + `   ${(base.contour / r.contour).toFixed(2)}x   uPk ${r.uPk.toFixed(3)}`);
}

// ---- THE COMPOSITION THAT CAN WORK: PILOT FIRST, THEN HFF ON TOP.
//
// The row above fails for a structural reason worth stating rather than tuning around: the
// pilot commissions on a program-agnostic SCRIBBLE while an HFF table is indexed by LAP
// PHASE, so "commission the pilot over HFF" applies a phase-indexed correction to a machine
// that is not on the path. The two live in different domains and that direction cannot work.
//
// The reverse composes cleanly, because HFF is IDENTIFIED ON THE MACHINE AS IT RUNS: deploy
// the pilot, then identify and invert the channel of (machine + pilot) and cancel whatever it
// leaves. An earlier attempt at this drowned -- the pilot's own lap-to-lap spread is about
// 4% and the probe was 4e-3 -- so the probe here is 0.05, twelve times larger, which the
// two-amplitude linearity check (0.05 vs 0.20 agreeing to 1.00) already showed is still in
// the linear regime.
const PAMP = +(process.env.PAMP || 0.05);
const AVG = +(process.env.AVG || 4);        // laps averaged into each update
const LAPS0 = 2 + AVG;                      // settle, then AVG scored laps
{
  const p0r = await deploy({ pilot: pBare });
  const PX0 = project(p0r.tx), PY0 = project(p0r.ty);
  console.log(`\n  pilot deployed, HFF identified ON TOP (probe ${PAMP})`);
  const pb = async (field, phase) => {
    const pr = zero(); pr[field + (phase === 'c' ? 're' : 'im')].fill(PAMP);
    const r = await deploy({ hff: true, table: pr, pilot: pBare });
    return { X: project(r.tx), Y: project(r.ty), rms: r.contour };
  };
  // USE THE CLEAN OPERATOR unless asked to re-probe. The channel from a command offset to
  // the tool belongs to the PLANT AND SERVO, and it was identified on the conventional
  // machine with two amplitudes fifty times apart agreeing to 1.00. Re-identifying it
  // through an active box-constrained QP cannot be clean at ANY amplitude: 0.02 and 0.05
  // give 8.64x and 11.27x with erratic traces, because the pilot reacts to the probe and
  // the composite is not LTI. Nothing about the plant changed when the pilot was switched
  // on, so the clean operator is the better estimate of it.
  const REPROBE = !!process.env.REPROBE;
  const a1 = REPROBE ? await pb('x', 'c') : null, a2b = REPROBE ? await pb('x', 's') : null;
  const a3 = REPROBE ? await pb('y', 'c') : null, a4 = REPROBE ? await pb('y', 's') : null;
  if (REPROBE) console.log(`    probe rms ${a1.rms.toExponential(3)} ${a2b.rms.toExponential(3)}`
    + ` ${a3.rms.toExponential(3)} ${a4.rms.toExponential(3)}  (baseline ${p0r.contour.toExponential(3)})`);
  else console.log(`    using the CLEAN operator identified without the pilot`
    + `  (baseline ${p0r.contour.toExponential(3)})`);
  const M2 = [];
  if (!REPROBE) { for (let h = 0; h < NH; h++) M2.push(Mh[h]); }
  else for (let h = 0; h < NH; h++) M2.push([
    [(a1.X.re[h]-PX0.re[h])/PAMP,(a2b.X.re[h]-PX0.re[h])/PAMP,(a3.X.re[h]-PX0.re[h])/PAMP,(a4.X.re[h]-PX0.re[h])/PAMP],
    [(a1.X.im[h]-PX0.im[h])/PAMP,(a2b.X.im[h]-PX0.im[h])/PAMP,(a3.X.im[h]-PX0.im[h])/PAMP,(a4.X.im[h]-PX0.im[h])/PAMP],
    [(a1.Y.re[h]-PY0.re[h])/PAMP,(a2b.Y.re[h]-PY0.re[h])/PAMP,(a3.Y.re[h]-PY0.re[h])/PAMP,(a4.Y.re[h]-PY0.re[h])/PAMP],
    [(a1.Y.im[h]-PY0.im[h])/PAMP,(a2b.Y.im[h]-PY0.im[h])/PAMP,(a3.Y.im[h]-PY0.im[h])/PAMP,(a4.Y.im[h]-PY0.im[h])/PAMP]]);
  const T = zero();
  let cur = p0r, best = Infinity, st = STEP2, stall = 0;
  const hist = [];
  for (let p = 1; p <= PASSES2; p++) {
    const Xr = project(cur.tx), Yr = project(cur.ty);
    const trial = { xre: T.xre.slice(), xim: T.xim.slice(), yre: T.yre.slice(), yim: T.yim.slice() };
    for (let h = 0; h < NH; h++) {
      const v = solve4(M2[h], [-Xr.re[h], -Xr.im[h], -Yr.re[h], -Yr.im[h]]);
      if (!v) continue;
      trial.xre[h] += st * v[0]; trial.xim[h] += st * v[1];
      trial.yre[h] += st * v[2]; trial.yim[h] += st * v[3];
    }
    const next = await deploy({ hff: true, table: trial, pilot: pBare });
    hist.push(next.contour);
    // BACKTRACK, DO NOT STOP. An overshoot says the step is too long, not that the direction
    // is wrong -- stopping on the first one is what capped the un-backtracked HFF at 8.88x.
    if (next.contour > best) { st *= 0.4; if (++stall >= 3) break; continue; }
    stall = 0; best = next.contour; cur = next;
    for (const k of ['xre', 'xim', 'yre', 'yim']) T[k] = trial[k].slice();
  }
  console.log(`    ${hist.map((v) => v.toExponential(2)).join(' → ')}`);
  const fin = await deploy({ hff: true, table: T, pilot: pBare });
  console.log(`\n  PILOT + HFF-ON-TOP                             ${best.toExponential(3)}`
    + `   ${(base.contour / best).toFixed(2)}x over the conventional machine`);
  console.log(`    drive: peak ${fin.dem[0].toExponential(2)} / ${fin.dem[1].toExponential(2)}`
    + ` against tauMax ${fin.tauMax.toExponential(2)}, saturated ${fin.sat[0]} / ${fin.sat[1]}`);
  console.log(`    lap-to-lap ${fin.nonrep.toExponential(2)} against a residual of `
    + `${fin.contour.toExponential(2)} — the machine still repeats, so this is a correction`
    + ` and not a destabilisation`);
  console.log(`    correction peak ${fin.uPk.toFixed(3)} rad`);
  const pilotAlone = p0r.contour;
  check('the composite beats the conventional machine at least 20x',
    base.contour / best > 20, `${base.contour.toExponential(3)} → ${best.toExponential(3)}`);
  check('…and beats the cascade it sits on at least 2x, so the harmonic layer is doing '
    + 'work the dynamic one could not', pilotAlone / best > 2,
    `cascade ${pilotAlone.toExponential(3)} vs composite ${best.toExponential(3)}`);
  // A NUMBER REACHED BY SATURATING THE DRIVE IS NOT A CONTROL RESULT, and one reached by
  // destabilising the machine is not either. Both are asserted rather than assumed.
  check('…without saturating the drive',
    fin.sat[0] === 0 && fin.sat[1] === 0
      && Math.max(fin.dem[0], fin.dem[1]) < 0.9 * fin.tauMax,
    `peak ${fin.dem[0].toExponential(2)} of ${fin.tauMax.toExponential(2)}, sat ${fin.sat}`);
  check('…and with the machine still repeating lap to lap, so it is a correction rather '
    + 'than a destabilisation', fin.nonrep < fin.contour,
    `lap-to-lap ${fin.nonrep.toExponential(2)} vs residual ${fin.contour.toExponential(2)}`);
  console.log(failed ? `\ncomposite: ${failed} check(s) FAILED\n`
    : '\ncomposite: all checks passed\n');
  process.exit(failed ? 1 : 0);
}
process.exit(0);
