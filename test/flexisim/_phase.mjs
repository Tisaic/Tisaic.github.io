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


import { HarmonicFF } from '../../lib/pilot/hff.js';
import { Stack } from '../../lib/pilot/stack.js';

console.log('\nPHASE OF THE FROZEN OPERATOR: clean machine vs deployed cascade\n');

const path = roundedRect(PATH);
const LAP = Math.ceil(path.lap);
const p0 = path.at(0);
const AVG = 4;

async function fresh() {
  const m = await machine();
  const rc = commissionComp(m.arm, m.servo);
  const [q1, q2] = m.arm.ik(p0.x, p0.y, true);
  settle(m.arm, m.servo, q1, q2);
  return { ...m, rc };
}

let STACK = null, ARM_ON = true;

/** One scored run. `armed` decides whether the deployed cascade acts. */
async function run(corr, laps = 2 + AVG) {
  const { arm, l1, l2, servo, rc } = await fresh();
  if (STACK && ARM_ON) for (const p of STACK.layers) if (p._initRun) p._initRun();
  const sc = new ContourScore({ joints: 2 });
  const ex = new Float64Array(LAP), ey = new Float64Array(LAP);
  for (let l = 0; l < laps; l++) {
    for (let k = 0; k < LAP; k++) {
      const cmd = path.at(k);
      const [c1, c2] = arm.ik(cmd.x, cmd.y, true);
      const r = arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const base = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
      const ff = rc.feedforward([[1, 0], [0, 1]], servo.jointTorques(base), { enableToolff: false });
      let d0 = 0, d1 = 0;
      if (STACK && ARM_ON) {
        const S = STACK.sample, kS = Math.floor((l * LAP + k) / S);
        const look = (off) => { const c = path.at((((kS + off) * S) % LAP + LAP) % LAP); return arm.ik(c.x, c.y, true); };
        const u = STACK.act(look); d0 += u[0]; d1 += u[1];
      }
      if (corr) {
        const w = corr.at(k);
        const J = arm.jacobian(c1, c2);
        const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        if (Math.abs(det) > 1e-12) {
          d0 += (J[1][1] * w[0] - J[0][1] * w[1]) / det;
          d1 += (-J[1][0] * w[0] + J[0][0] * w[1]) / det;
        }
      }
      const tau = servo.torques([{ ...base[0], theta: c1 + ff.dq[0] + d0 },
        { ...base[1], theta: c2 + ff.dq[1] + d1 }]);
      arm.step(tau[0], tau[1], 1);
      if (STACK && ARM_ON) {
        const en = arm.encoders();
        STACK.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
          tau[0] * 1e3, tau[1] * 1e3], null);
      }
      const d = decompose(path, arm.toolXY(), cmd);
      if (l === laps - 1) sc.step(d.contour, d.lag, tau, [arm.j1.wM, arm.j2.wM]);
      if (l >= laps - AVG) {
        const tp = arm.toolXY();
        ex[k] += (tp[0] - cmd.x) / AVG; ey[k] += (tp[1] - cmd.y) / AVG;
      }
    }
  }
  await l1.destroy(); await l2.destroy();
  return { score: sc.report().contourRms, err: [ex, ey] };
}

// ---- commission the cascade the ladder actually deploys (classic withheld, depth 2)
{
  const m = await machine();
  const c = m.arm.ik(12, 0, true);
  const opts = {
    nMeasured: 6, autoRefuse: false, gateForecasts: false, refusePartial: false,
    channels: [0, 1].map((j) => ({ lo: c[j] - 0.55, hi: c[j] + 0.55, vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
    uMax: Math.min(2.0, 0.15 * (16 / K)),
    probeAmp: 0.15 * Math.min(1.0, 0.15 * (16 / K)),
    ditherAmp: 0.1 * Math.min(1.0, 0.15 * (16 / K)),
    start: m.arm.ik(p0.x, p0.y, true), guards: [],
    workspace: (q) => {
      const rr = Math.hypot(m.arm.L1 * Math.cos(q[0]) + m.arm.L2 * Math.cos(q[0] + q[1]),
        m.arm.L1 * Math.sin(q[0]) + m.arm.L2 * Math.sin(q[0] + q[1]));
      return rr > Math.abs(m.arm.L1 - m.arm.L2) + 0.5 && rr < m.arm.L1 + m.arm.L2 - 0.5;
    }, seed: 1, depth: 2 };
  await m.l1.destroy(); await m.l2.destroy();
  STACK = new Stack(opts);
  const { arm, l1, l2, servo, rc } = await fresh();
  let guard = 0;
  while (STACK.phase !== 'done' && guard++ < 4e6) {
    if (STACK.phase === 'fit') { STACK.work(); continue; }
    const cmd = STACK.command();
    const tgc = servo.jointTorques(cmd.map((q) => ({ theta: q.pos, omega: q.vel, alpha: q.acc })));
    const ff = rc.feedforward([[1, 0], [0, 1]], tgc, { enableToolff: false });
    const tau = servo.torques(cmd.map((q, j) => ({ theta: q.pos + q.u + ff.dq[j], omega: q.vel, alpha: q.acc })));
    arm.step(tau[0], tau[1], 1);
    const en = arm.encoders(), tool = arm.toolXY();
    const q1 = cmd[0].pos, q2 = cmd[1].pos;
    const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
    const cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
    const J = arm.jacobian(q1, q2);
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
    const exw = tool[0] - cx, eyw = tool[1] - cy;
    STACK.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
      tau[0] * 1e3, tau[1] * 1e3],
    [(J[1][1] * exw - J[0][1] * eyw) / det, (-J[1][0] * exw + J[0][0] * eyw) / det]);
  }
  await l1.destroy(); await l2.destroy();
  console.log(`  cascade commissioned: ${JSON.stringify(STACK.verdict).slice(0, 100)}`);
}

/** Identify only — no refinement — and hand back the operator. */
async function identify(disarmForProbe) {
  const H = new HarmonicFF({ lap: LAP, channels: 2, nh: +(process.env.PNH || 256), uMax: 1.5, probeStyle: 'spread',
    probeFracs: [0.10], reachPows: [1], cuts: [0], passes: 0, backtracks: 0, trialPasses: 0 });
  await H.commission(async (corr, phase) => {
    ARM_ON = !(disarmForProbe && phase === 'probe');
    try { return await run(corr); } finally { ARM_ON = true; }
  });
  return H;
}

const clean = await identify(true);      // cascade OFF during probes — what ships
const deployed = await identify(false);  // cascade ON during probes — the machine being corrected

/** Diagonal block of channel c read as a complex gain a+ib. */
const cgain = (M, c) => (M ? { a: (M[2 * c][2 * c] + M[2 * c + 1][2 * c + 1]) / 2,
  b: (M[2 * c + 1][2 * c] - M[2 * c][2 * c + 1]) / 2 } : null);
const deg = (g) => Math.atan2(g.b, g.a) * 180 / Math.PI;

// the error spectrum of the DEPLOYED machine — which harmonics actually carry the energy
const base = await run(null);
const ESPEC = clean._project(base.err);
const rows = [];
for (let h = 0; h < clean.nh; h++) {
  const e = Math.hypot(ESPEC.re[0][h], ESPEC.im[0][h], ESPEC.re[1][h], ESPEC.im[1][h]);
  rows.push({ h: h + 1, e });
}
rows.sort((x, y) => y.e - x.e);
console.log(`\n  deployed machine ${base.score.toExponential(4)}   the twelve harmonics carrying the most error:\n`);
console.log('     h    |E|        |Gclean| argGclean   |Gdep|  argGdep    Δphase    Δ|G|');
let wsum = 0, wtot = 0;
for (const r of rows.slice(0, 12)) {
  const gc = cgain(clean.G[r.h - 1], 0), gd = cgain(deployed.G[r.h - 1], 0);
  if (!gc || !gd) continue;
  const mc = Math.hypot(gc.a, gc.b), md = Math.hypot(gd.a, gd.b);
  let dp = deg(gd) - deg(gc);
  while (dp > 180) dp -= 360; while (dp < -180) dp += 360;
  wsum += r.e * Math.abs(dp); wtot += r.e;
  console.log(`  ${String(r.h).padStart(4)}  ${r.e.toExponential(2)}  ${mc.toFixed(4).padStart(8)}`
    + ` ${deg(gc).toFixed(1).padStart(8)}  ${md.toFixed(4).padStart(8)} ${deg(gd).toFixed(1).padStart(8)}`
    + `  ${dp.toFixed(1).padStart(8)}  ${(md / mc).toFixed(3).padStart(6)}`);
}
console.log(`\n  ENERGY-WEIGHTED MEAN |Δphase| ACROSS THOSE HARMONICS: ${(wsum / wtot).toFixed(1)} degrees`);
console.log('  A frozen operator inverts the machine it was identified on. If that phase differs');
console.log('  materially from the deployed machine\'s, the correction lands out of phase and the');
console.log('  refinement plateaus early — which is exactly the symptom on this arm.');
