// THE COMMISSIONING BOOTSTRAP for the learned-dynamics twin (rule 34, done right):
// random injected du displaces the machine off-path (measured, three ways), so the
// corrected regime is reachable only through corrections that CANCEL — which the model
// itself can compile. Round 0: fit M0 on the clean spanning corpus. Round 1: for each
// of several spanning excitations, compile a cancelling du against M0 (software), DRIVE
// it with the tracker on (commissioning), record (q+du, truth). Refit M1 on everything.
// Then compile the program against M1 and deliver. Program-agnostic throughout: the
// program's data never enters a fit.
import { readFileSync } from 'node:fs';
import { ridgeMulti } from '/home/user/Tisaic.github.io/test/pilot/rigs/ikfree-rig.mjs';
import { compileTwin, refineCompiled } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { randomWander } from '/home/user/Tisaic.github.io/lib/flexisim/demopath.js';
import { ToolPath, SEG } from '/home/user/Tisaic.github.io/lib/flexisim/toolpath.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500, L = 384, RIDGE = 1e-2, LAPS_C = 5;
const CACHE = '/tmp/claude-0/-home-user-Tisaic-github-io/932a1341-a996-534b-9a60-fb10b63f0258/scratchpad/dynrecords.json';
const path = mkPath('sharp', 0.004);
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const bigPolygon = (rnd, feed, { centre = [12, 0], star = false } = {}) => {
  const [cx, cy] = centre;
  const n = star ? 8 : 4 + Math.floor(3 * rnd());
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n + 0.4 * (rnd() - 0.5);
    const r = star ? (i % 2 ? 2.6 : 6.0) : 3.0 + 3.0 * rnd();
    pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
  }
  return new ToolPath({ start: pts[0], feed, accel: 4e-5, closed: true, cornerDt: 40,
    segments: pts.slice(1).map((pt) => [SEG.LINE, pt]).concat([[SEG.LINE, pts[0]]]) });
};

const R = JSON.parse(readFileSync(CACHE, 'utf8'));
const CLEAN = [...'cdef'].flatMap((ch) => Array.from({ length: 6 }, (_, i) => R[ch + (i + 1)]))
  .concat([R.w1, R.w2, R.p1, R.p2, R.p3, R.p4]).filter(Boolean);
const CQ = [0, 0];
{
  let s0 = 0, s1 = 0, n = 0;
  for (const w of CLEAN) for (const r of w) { s0 += r.q[0]; s1 += r.q[1]; n++; }
  CQ[0] = s0 / n; CQ[1] = s1 / n;
}
const poly5 = (q) => {
  const u = (q[0] - CQ[0]) / 0.55, v = (q[1] - CQ[1]) / 0.55;
  const out = [];
  for (let i = 0; i <= 5; i++) for (let j = 0; j <= 5 - i; j++) out.push(u ** i * v ** j);
  return out;
};
const featQ = (qs, t) => {
  const at = (i) => qs[Math.max(0, i)];
  const f = [1];
  for (let i = 0; i < L; i++) { const q = at(t - i); f.push(q[0] - CQ[0], q[1] - CQ[1]); }
  for (let i = 0; i < L; i += 2) {
    const q = at(t - i), qm = at(t - i - 1);
    f.push(q[0] - qm[0], q[1] - qm[1]);
  }
  for (const v of poly5(at(t))) f.push(v);
  for (const v of poly5(at(t - 8))) f.push(v);
  for (const v of poly5(at(t - 32))) f.push(v);
  return f;
};
const fitModel = (recs) => {
  const X = [], Y = [];
  for (const w of recs) {
    const qs = w.map((r) => r.q);
    for (let t = L; t < w.length - 1; t++) { X.push(featQ(qs, t)); Y.push(w[t + 1].e); }
  }
  console.log(`  fit: ${X.length} rows x ${X[0].length} features`);
  const W = ridgeMulti(X, Y, RIDGE);
  return (f) => W.map((w) => { let s = 0; for (let i = 0; i < f.length; i++) s += w[i] * f[i]; return s; });
};

// real machine: drive a path (with optional du at STEP granularity) recording q_total
// and routed truth per sample — commissioning's tracker
const ikArm = await makeArm();
const ik = (c) => ikArm.arm.ik(c.x, c.y, true);
const driveRecord = async (p, nSamples, duF) => {
  const m = await makeArm();
  homeArm(m.arm, m.servo, p);
  if (duF) {
    const q0 = ik(p.at(0));
    for (let k = 0; k < PRE * SS; k++) {
      const d = duF(k);
      const tau = m.servo.torques([{ theta: q0[0] + d[0], omega: 0, alpha: 0 },
        { theta: q0[1] + d[1], omega: 0, alpha: 0 }]);
      m.arm.step(tau[0], tau[1], 1);
    }
  }
  const rows = [];
  for (let k = 0; k < nSamples * SS; k++) {
    const c = p.at(k);
    let [q1, q2] = ik(c);
    const rt = m.arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    if (duF) { const d = duF(PRE * SS + k); q1 += d[0]; q2 += d[1]; }
    const tau = m.servo.torques([{ theta: q1, omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2, omega: rt.dq[1], alpha: rt.ddq[1] }]);
    m.arm.step(tau[0], tau[1], 1);
    if (k % SS === 0) {
      const tool = m.arm.toolXY();
      const cx = m.arm.L1 * Math.cos(q1) + m.arm.L2 * Math.cos(q1 + q2);
      const cy = m.arm.L1 * Math.sin(q1) + m.arm.L2 * Math.sin(q1 + q2);
      const J = m.arm.jacobian(q1, q2);
      const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      const ex = tool[0] - cx, ey = tool[1] - cy;
      rows.push({ e: [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det],
        q: [q1, q2] });
    }
  }
  await destroy(m);
  return rows;
};

// real H, probed once at the centre (commissioning)
const probeH = async (qh) => {
  const Hout = [];
  for (const ch of [0, 1]) {
    const m = await makeArm();
    m.arm.setPose(qh[0], qh[1]);
    for (let k = 0; k < 30000; k++) {
      const tau = m.servo.torques([{ theta: qh[0], omega: 0, alpha: 0 },
        { theta: qh[1], omega: 0, alpha: 0 }]);
      m.arm.step(tau[0], tau[1], 1);
    }
    const routed = () => {
      const tool = m.arm.toolXY();
      const cx = m.arm.L1 * Math.cos(qh[0]) + m.arm.L2 * Math.cos(qh[0] + qh[1]);
      const cy = m.arm.L1 * Math.sin(qh[0]) + m.arm.L2 * Math.sin(qh[0] + qh[1]);
      const J = m.arm.jacobian(qh[0], qh[1]);
      const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      const ex = tool[0] - cx, ey = tool[1] - cy;
      return [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det];
    };
    const base = routed();
    const resp = [];
    for (let k = 0; k < 12000; k++) {
      const refs = [{ theta: qh[0] + (ch === 0 ? 2e-3 : 0), omega: 0, alpha: 0 },
        { theta: qh[1] + (ch === 1 ? 2e-3 : 0), omega: 0, alpha: 0 }];
      const tau = m.servo.torques(refs);
      m.arm.step(tau[0], tau[1], 1);
      if (k % SS === 0) {
        const t = routed();
        resp.push([(t[0] - base[0]) / 2e-3, (t[1] - base[1]) / 2e-3]);
      }
    }
    await destroy(m);
    Hout.push(resp);
  }
  return Hout;
};

// the superposition simulator for a given model and path
const mkSim = (predict, p, nSamples) => {
  const q0 = ik(p.at(0));
  const base = [];
  for (let t = 0; t < PRE; t++) base.push(q0.slice());
  for (let k = 0; k < nSamples * SS; k += SS) base.push(ik(p.at(k)));
  const eFree = [];
  for (let t = 0; t < base.length; t++) eFree.push(predict(featQ(base, t)));
  return { q0, base, sim: async (du) => {
    if (du == null) return eFree.map((r) => r.slice());
    const duAt = typeof du === 'function'
      ? (t) => du(t * SS)
      : (t) => {
        const s0 = Math.min(du.length - 2, Math.floor(t)), fr = t - s0;
        return [du[s0][0] + fr * (du[s0 + 1][0] - du[s0][0]),
          du[s0][1] + fr * (du[s0 + 1][1] - du[s0][1])];
      };
    const out = eFree.map((r) => r.slice());
    const Lh = dH[0].length;
    const duS = Array.from({ length: out.length }, (_, t) => duAt(t));
    for (let t = 0; t < out.length; t++) {
      for (let k = 0; k < Math.min(Lh, t + 1); k++) {
        for (const cin of [0, 1]) {
          const u = duS[t - k][cin];
          if (u === 0) continue;
          out[t][0] += dH[cin][k][0] * u;
          out[t][1] += dH[cin][k][1] * u;
        }
      }
    }
    return out;
  } };
};

console.log('probing H (real machine, centre)…');
const H = await probeH(ik({ x: 12, y: 0 }));
const dH = H.map((rows) => rows.map((r, k) => [r[0] - (k ? rows[k - 1][0] : 0), r[1] - (k ? rows[k - 1][1] : 0)]));

console.log('ROUND 0: fitting M0 on the clean corpus…');
let predict = fitModel(CLEAN);

console.log('ROUND 1 (damped, gated): half-gain corrections on PERIODIC excitations only;');
console.log('a boot record is admitted only if the machine measured it BETTER than open…');
const BOOT = [];
for (let i = 0; i < 6; i++) {
  const p = bigPolygon(mkRnd(831 + i), 0.004, { star: i % 2 === 1 });
  const N = 1800;
  const openRec = await driveRecord(p, N, null);
  let o2 = [0, 0];
  for (const r of openRec) { o2[0] += r.e[0] ** 2; o2[1] += r.e[1] ** 2; }
  const openRms = Math.sqrt((o2[0] + o2[1]) / (2 * openRec.length));
  const { sim } = mkSim(predict, p, N);
  const c = await compileTwin({ simulate: sim, H, iters: 7, onProgress: null });
  const GAIN = 0.5;
  const rec = await driveRecord(p, N, (k) => {
    const t = k / SS;
    const s0 = Math.max(0, Math.min(c.du.length - 2, Math.floor(t))), fr = t - s0;
    return [GAIN * (c.du[s0][0] + fr * (c.du[s0 + 1][0] - c.du[s0][0])),
      GAIN * (c.du[s0][1] + fr * (c.du[s0 + 1][1] - c.du[s0][1]))];
  });
  let s2 = [0, 0], pk = 0;
  for (const r of rec) { s2[0] += r.e[0] ** 2; s2[1] += r.e[1] ** 2; }
  for (const row of c.du) for (const v of row) pk = Math.max(pk, Math.abs(v) * GAIN);
  const corrRms = Math.sqrt((s2[0] + s2[1]) / (2 * rec.length));
  const keep = corrRms < openRms;
  console.log(`  boot ${i}: duPk ${pk.toFixed(2)}, open ${openRms.toExponential(2)} → corrected ${corrRms.toExponential(2)}`
    + `  ${keep ? 'ADMITTED' : 'REFUSED (worse than open)'}`);
  BOOT.push(openRec);                        // the open drive is honest data either way
  if (keep) BOOT.push(rec);
}

console.log('refit M1 on clean + admitted records…');
predict = fitModel(CLEAN.concat(BOOT));

console.log('compile the PROGRAM against M1…');
const nProg = Math.ceil(path.lap * LAPS_C / SS);
const { sim: simProg } = mkSim(predict, path, nProg);
const res = await compileTwin({ simulate: simProg, H, iters: 11,
  onProgress: (m) => console.log('  ' + m) });
console.log(`compiled: model rms ${res.report.rms.toExponential(2)}`);
const { sim: simProg4 } = mkSim(predict, path, Math.ceil(path.lap * 4 / SS));
const ref = await refineCompiled({ simulate: simProg4, H, du: res.du,
  sample: SS, lapSteps: path.lap, preRoll: PRE,
  onProgress: (m) => console.log('  ' + m) });
console.log(`refined: ${ref.report.openRms.toExponential(2)} → ${ref.report.rms.toExponential(2)}`);

console.log('deliver on the REAL machine…');
const score = async (duF, laps) => {
  const m = await makeArm();
  homeArm(m.arm, m.servo, path);
  if (duF) {
    const q0 = ik(path.at(0));
    for (let k = 0; k < PRE * SS; k++) {
      const d = duF(k);
      const tau = m.servo.torques([{ theta: q0[0] + d[0], omega: 0, alpha: 0 },
        { theta: q0[1] + d[1], omega: 0, alpha: 0 }]);
      m.arm.step(tau[0], tau[1], 1);
    }
  }
  const total = Math.ceil(path.lap * laps);
  const rows = []; let cAcc = 0, cn = 0, lapNo = 0;
  for (let k = 0; k < total; k++) {
    const now = Math.floor(k / path.lap);
    if (now !== lapNo) { rows.push(Math.sqrt(cAcc / cn)); cAcc = 0; cn = 0; lapNo = now; }
    const c = path.at(k);
    const [q1, q2] = ik(c);
    const rt = m.arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const d = duF ? duF(PRE * SS + k) : [0, 0];
    const tau = m.servo.torques([{ theta: q1 + d[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + d[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    m.arm.step(tau[0], tau[1], 1);
    if (k % SS === 0) {
      const tool = m.arm.toolXY();
      const sp = Math.hypot(c.vx, c.vy) || 1;
      const cerr = (c.vx / sp) * (tool[1] - c.y) - (c.vy / sp) * (tool[0] - c.x);
      cAcc += cerr * cerr; cn++;
    }
  }
  if (cn > 10) rows.push(Math.sqrt(cAcc / cn));
  await destroy(m);
  return rows;
};
const open = await score(null, 2);
const got = await score(ref.f, 8);
console.log('open :', open.map((v) => v.toExponential(2)).join('  '));
console.log('v3   :', got.map((v) => v.toExponential(2)).join('  '));
console.log(`gain over open: ${(open.at(-1) / got.at(-1)).toFixed(1)}x   (v2 was 5.6x, structure twin 44x)`);
console.log('EXIT 0');
