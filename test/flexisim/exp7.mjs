/**
 * @file EXPERIMENT 7 — THE PREVIEW-SHAPED STAGE, against the owner's bar: THE ERROR MUST
 * REACH e-3. The lead ladder proved a scalar lead cannot invert the loop's filter (worse
 * at 0, best at 750, worse past 1250 — a delay inverter applied to a roll-off), and the
 * iterative refit stalled at 4.13e-2. The upgrade: the SAME pose-modulated FIR features
 * evaluated at SEVERAL preview offsets JOINTLY, so the iterative refit can learn the
 * weighting across previews — a learned inverse filter of the loop, the state-addressed
 * analogue of the pilot QP's horizon shaping. Iteration on the machine remains the
 * self-reference answer (§38); the previews are what let it keep descending.
 */
import { writeFileSync } from 'node:fs';
import { Joint } from '../../lib/flexisim/joint.js';
import { FlexArm2R } from '../../lib/flexisim/arm2r.js';
import { buildLink, massProperties } from '../../lib/flexisim/link.js';
import { ChainServo } from '../../lib/flexisim/compensator.js';
import { roundedRect } from '../../lib/flexisim/toolpath.js';
import { RobotComp } from '../../lib/ngrc/robotcomp.js';
import { makeArmHost } from '../../lib/flexisim/autohost.js';

const K = +(process.env.K || 1), E = +(process.env.E || 0.06);
const BACKLASH = process.env.BL === '0' ? 0 : 1e-4;
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-Tisaic-github-io/932a1341-a996-534b-9a60-fb10b63f0258/scratchpad/campaign'
  + (BACKLASH ? '' : '-bl0') + '.json';
const H = 4, CLAMP = 3, nu = 0.3, rho = 1, g = 2e-6, RATIO = 100, DRIVE = 32;
const LEN1 = 14, LEN2 = 10, CENTRE = [12, 0];
const mkPath = (feed) => roundedRect({ w: 8, h: 8, r: 1.5, centre: CENTRE, feed,
  accel: 4e-5, cornerDt: 40, closed: true });

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

const path0 = mkPath(4e-3);
const LAP0 = Math.ceil(path0.lap);
const p0 = path0.at(0);
async function fresh() {
  const m = await machine();
  const rc = commissionComp(m.arm, m.servo);
  const [q1, q2] = m.arm.ik(p0.x, p0.y, true);
  settle(m.arm, m.servo, q1, q2);
  return { ...m, rc };
}

const T0 = Date.now();
console.log(`\nmechanism campaign: K ${K} / E ${E} / backlash ${BACKLASH}\n`);
const centre = [0, 0];
let hostRef = null;
{
  const m = await machine();
  const c = m.arm.ik(12, 0, true);
  centre[0] = c[0]; centre[1] = c[1];
  hostRef = makeArmHost({
    makeMachine: fresh, path: path0, lap: LAP0, K, centre,
    demo: {}, lapMemory: false, probeLaps: { warmup: 1, avg: 2 },
    onRung: (r) => console.log(`  [${((Date.now() - T0) / 60000).toFixed(0)}m] ${r.name}  `
      + `${r.score.toExponential(4)}${r.deployed ? '' : '  — NOT deployed'}`),
  });
  hostRef.auto.pilotOpts.start = m.arm.ik(p0.x, p0.y, true);
  hostRef.auto.pilotOpts.workspace = (q) => {
    const rr = Math.hypot(m.arm.L1 * Math.cos(q[0]) + m.arm.L2 * Math.cos(q[0] + q[1]),
      m.arm.L1 * Math.sin(q[0]) + m.arm.L2 * Math.sin(q[0] + q[1]));
    return rr > Math.abs(m.arm.L1 - m.arm.L2) + 0.5 && rr < m.arm.L1 + m.arm.L2 - 0.5;
  };
  await m.l1.destroy(); await m.l2.destroy();
}
const rep = await hostRef.auto.commission({ run: hostRef.run,
  drivePilot: hostRef.drivePilot, recordDemo: hostRef.recordDemo });
console.log(`  ladder best ${rep.best.toExponential(4)}, shipped `
  + `${JSON.stringify(hostRef.auto.deployed)}\n`);
await hostRef.dispose();

// ---- THE CONTROL TEST: fit the pose-modulated FIR on the deployed machine's first laps,
// then DRIVE WITH IT and let the machine say whether the mechanism is real. The model
// reads only COMMANDED joint-rate history (available ahead of time) modulated by pose and
// tangent; its prediction of the normal error is mapped to joint offsets through the
// Jacobian and subtracted, with an optional LEAD in steps (the correction rides the same
// servo loop it corrects, so the Move tab's measured pattern — evaluate ahead by about a
// loop time constant — applies here too).
const feed = 4e-3;
const path = mkPath(feed);
const T = path.lap, LAP = Math.ceil(T);
const S = hostRef.auto.stack ? hostRef.auto.stack.sample : 1;
const LAGS = [0, 2, 4, 6, 9, 13, 18, 24, 32, 42, 55, 70, 90, 115, 145, 180];
// PREVIEW OFFSETS IN STEPS, bracketing the loop's response — the single-tap curve
// (0 worse, 750 best, 1250 worse) is exactly the sampling a joint inverse needs.
const PREVIEWS = [0, 250, 500, 750, 1000];
const featAt = (hist, i, pose) => {
  // hist[j] = [dq1, dq2] at sample j (commanded); pose = {q1,q2,tx,ty} at sample i
  const x = [1];
  const s1 = Math.sin(pose.q1), c12 = Math.cos(pose.q1 + pose.q2);
  for (const d of LAGS) {
    const p = hist[i - d];
    if (!p) return null;
    x.push(p[0] * 1e3, p[1] * 1e3,
      p[0] * 1e3 * s1, p[1] * 1e3 * c12,
      p[0] * 1e3 * pose.tx, p[1] * 1e3 * pose.ty);
  }
  return x;
};

async function driveLaps(laps, model, lead) {
  const live = await fresh();
  hostRef.attach(live.arm, live.servo, live.rc, path, T);
  hostRef.auto.beginRun();
  // precompute per-sample commanded refs, rates and poses for the whole lap
  const NS = Math.ceil(LAP / S);
  const sref = [], srate = [], spose = [];
  for (let j = 0; j < NS; j++) {
    const cmd = path.at(j * S);
    const [q1, q2] = live.arm.ik(cmd.x, cmd.y, true);
    const rt = live.arm.ikRates(q1, q2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
    const sp = Math.hypot(cmd.vx, cmd.vy) || 1e-12;
    sref.push([q1, q2]); srate.push([rt.dq[0], rt.dq[1]]);
    spose.push({ q1, q2, tx: cmd.vx / sp, ty: cmd.vy / sp });
  }
  const histAt = (j) => srate[((j % NS) + NS) % NS];
  const featAtJ = (j) => {
    const hist = Array.from({ length: LAGS[LAGS.length - 1] + 1 },
      (_, d) => histAt(j - d)).reverse();
    return featAt(hist, hist.length - 1, spose[((j % NS) + NS) % NS]);
  };
  const jointFeat = (j0) => {
    const parts = [];
    for (const d of PREVIEWS) {
      const f = featAtJ(j0 + Math.round(d / S));
      if (!f) return null;
      parts.push(f);
    }
    return parts.flat();
  };
  const rows = [];
  let kP = 0;
  const en2 = [];
  for (let lap = 0; lap < laps; lap++) {
    let s2 = 0, n2 = 0;
    for (let k = 0; k < LAP; k++) {
      const cmd = path.at(kP);
      const [q1, q2] = live.arm.ik(cmd.x, cmd.y, true);
      const rt = live.arm.ikRates(q1, q2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const refs = [{ theta: q1, omega: rt.dq[0], alpha: rt.ddq[0] },
        { theta: q2, omega: rt.dq[1], alpha: rt.ddq[1] }];
      const dq = hostRef.actAt(kP, cmd, refs);
      let x0 = 0, x1 = 0;
      if (model) {
        // THE JOINT PREVIEW PREDICTION: the same features at every preview offset,
        // one weight vector across all of them — the learned inverse. The output is
        // cancelled along the CURRENT tangent's normal, joints through J⁻¹.
        const kIn = ((kP % T) + T) % T;
        const j0 = Math.floor(kIn / S);
        const f = jointFeat(j0);
        if (f) {
          let pred = 0;
          for (let i = 0; i < f.length; i++) pred += model[i] * f[i];
          const po = spose[((j0 % NS) + NS) % NS];
          const nx = -po.ty, ny = po.tx;
          const wx = -pred * nx, wy = -pred * ny;
          const J = live.arm.jacobian(q1, q2);
          const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
          if (Math.abs(det) > 1e-12) {
            x0 = (J[1][1] * wx - J[0][1] * wy) / det;
            x1 = (-J[1][0] * wx + J[0][0] * wy) / det;
          }
        }
      }
      const tau = live.servo.torques([{ ...refs[0], theta: q1 + dq[0] + x0 },
        { ...refs[1], theta: q2 + dq[1] + x1 }]);
      live.arm.step(tau[0], tau[1], 1);
      const en0 = live.arm.encoders();
      hostRef.auto.observe([en0[0].angle, en0[1].angle, en0[0].speed * 1e3, en0[1].speed * 1e3,
        tau[0] * 1e3, tau[1] * 1e3]);
      if (kP % S === 0) {
        const tool = live.arm.toolXY();
        const sp = Math.hypot(cmd.vx, cmd.vy) || 1e-12;
        const tx = cmd.vx / sp, ty = cmd.vy / sp;
        const ex = tool[0] - cmd.x, ey = tool[1] - cmd.y;
        const en = -ex * ty + ey * tx;
        rows.push({ lap, kIn: Math.floor((((kP % T) + T) % T) / S), en });
        if (lap >= 2) { s2 += en * en; n2++; }
      }
      kP++;
    }
    if (lap >= 2) en2.push(Math.sqrt(s2 / n2));
  }
  await live.l1.destroy(); await live.l2.destroy();
  return { rows, settled: en2 };
}

// 1. record the uncorrected deployed machine and fit the JOINT preview model, then
// iterate: each pass refits the REMAINING residual on the same joint rows and folds it in.
console.log('  recording the deployed machine, fitting the joint preview model…');
const rec = await driveLaps(5, null, 0);
{
  const NS = rec.rows.filter((r) => r.lap === 2).length;
  const pth = mkPath(feed);
  const m0 = await machine();
  const srate = [], spose2 = [];
  for (let j = 0; j < NS; j++) {
    const cmd = pth.at(j * S);
    const [q1, q2] = m0.arm.ik(cmd.x, cmd.y, true);
    const rt = m0.arm.ikRates(q1, q2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
    const sp = Math.hypot(cmd.vx, cmd.vy) || 1e-12;
    srate.push([rt.dq[0], rt.dq[1]]);
    spose2.push({ q1, q2, tx: cmd.vx / sp, ty: cmd.vy / sp });
  }
  await m0.l1.destroy(); await m0.l2.destroy();
  const histAt2 = (j) => srate[((j % NS) + NS) % NS];
  const featAtJ2 = (j) => {
    const hist = Array.from({ length: LAGS[LAGS.length - 1] + 1 },
      (_, d) => histAt2(j - d)).reverse();
    return featAt(hist, hist.length - 1, spose2[((j % NS) + NS) % NS]);
  };
  const jointFeat2 = (j0) => {
    const parts = [];
    for (const d of PREVIEWS) parts.push(featAtJ2(j0 + Math.round(d / S)));
    return parts.flat();
  };
  // THE ACTUATION-AWARE FIT: the first joint fit put its weight at preview 0 — the best
  // PREDICTOR of e(t) — and the machine diverged (5.9e-2 → 6.6e-2 → 7.4e-2), because
  // prediction is not actuation: a correction at offset 0 rides the loop's roll-off.
  // The regression target stays e, but the DESIGN COLUMNS are G-FILTERED — each feature
  // convolved with the identified hGrid at its decision cadence — so a weight is priced by
  // what its feature DOES through the loop, and the applied correction uses the raw
  // features. This is the deconvolution the scalar lead approximated.
  const P1 = hostRef.auto.stack.layers[0];
  const hbar = (() => {
    const a = P1.hs[0].hGrid, b = P1.hs[1].hGrid;
    const n = Math.min(a.length, b.length);
    const h = new Float64Array(n);
    for (let i = 0; i < n; i++) h[i] = 0.5 * (a[i] + b[i]);
    return h;
  })();
  const GRID = P1.grid;
  const fit = (rows) => {
    // raw rows in lap-order, then filter columns through hbar at decision cadence
    const raw = [], Y = [], keys = [];
    for (const r of rows) {
      if (r.lap < 1) continue;
      raw.push(jointFeat2(r.kIn)); Y.push(r.en); keys.push(r.lap * NS + r.kIn);
    }
    const nf = raw[0].length;
    const byKey = new Map(keys.map((k, i) => [k, i]));
    const X = raw.map((row, i) => {
      const out = new Float64Array(nf);
      for (let m = 0; m < hbar.length; m++) {
        const src = byKey.get(keys[i] - m * GRID);
        if (src === undefined) continue;
        const rr = raw[src], hm = hbar[m];
        for (let q = 0; q < nf; q++) out[q] += hm * rr[q];
      }
      return out;
    });
    const A = Array.from({ length: nf }, () => new Float64Array(nf));
    const b = new Float64Array(nf);
    for (let q = 0; q < X.length; q++) for (let i = 0; i < nf; i++) {
      b[i] += X[q][i] * Y[q];
      for (let j = 0; j < nf; j++) A[i][j] += X[q][i] * X[q][j];
    }
    for (let i = 0; i < nf; i++) A[i][i] += 1e-4 * A[i][i] + 1e-12;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c2 = 0; c2 < nf; c2++) {
      let p = c2; for (let r2 = c2 + 1; r2 < nf; r2++) if (Math.abs(M[r2][c2]) > Math.abs(M[p][c2])) p = r2;
      [M[c2], M[p]] = [M[p], M[c2]];
      for (let r2 = 0; r2 < nf; r2++) { if (r2 === c2 || !M[c2][c2]) continue;
        const f2 = M[r2][c2] / M[c2][c2]; for (let j = c2; j <= nf; j++) M[r2][j] -= f2 * M[c2][j]; }
    }
    return M.map((row, i) => row[nf] / (row[i] || 1));
  };
  console.log(`  baseline settled rms ${rec.settled.map((v) => v.toExponential(3)).join(' ')}`);
  let w = fit(rec.rows);
  let rowsCur = null;
  for (let pass = 1; pass <= 8; pass++) {
    const r = await driveLaps(5, w, 0);
    rowsCur = r.rows;
    console.log(`  pass ${pass}: settled rms ${r.settled.map((v) => v.toExponential(3)).join(' ')}`);
    const dw = fit(rowsCur);
    for (let i = 0; i < w.length; i++) w[i] += 0.8 * dw[i];
  }
}
console.log(`\n  total ${((Date.now() - T0) / 60000).toFixed(1)} min  —  the bar is e-3`);
