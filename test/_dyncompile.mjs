// V0 OF THE FULLY LEARNED DYNAMICS TWIN, DELIVERED: fit the best measured FIR
// (L=384, r=1e-2, 12k wander samples), use it as the compile's simulator (H = the
// model's own step response, guard = the model), then deliver the compiled+refined
// correction ON THE REAL MACHINE at the canonical cell. The number this prints is the
// honest v0 against the structure twin's 44x.
import { readFileSync } from 'node:fs';
import { ridgeMulti } from '/home/user/Tisaic.github.io/test/pilot/rigs/ikfree-rig.mjs';
import { compileTwin, refineCompiled } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500, L = 384, RIDGE = 1e-2, LAPS_C = 5;
const CACHE = '/tmp/claude-0/-home-user-Tisaic-github-io/932a1341-a996-534b-9a60-fb10b63f0258/scratchpad/dynrecords.json';
const path = mkPath('sharp', 0.004);
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };

const R = JSON.parse(readFileSync(CACHE, 'utf8'));
const FIT = [R.w1, R.w2, R.w4, R.w5, R.w6, R.w7];
const CQ = [0, 0];
{
  let s0 = 0, s1 = 0, n = 0;
  for (const w of FIT) for (const r of w) { s0 += r.q[0]; s1 += r.q[1]; n++; }
  CQ[0] = s0 / n; CQ[1] = s1 / n;
}
// features over a plain q-series (array of [q0,q1] per sample), held-extended below 0
const featQ = (qs, t) => {
  const at = (i) => qs[Math.max(0, i)];
  const f = [1];
  for (let i = 0; i < L; i++) { const q = at(t - i); f.push(q[0] - CQ[0], q[1] - CQ[1]); }
  for (let i = 0; i < L; i += 2) {
    const q = at(t - i), qm = at(t - i - 1);
    f.push(q[0] - qm[0], q[1] - qm[1]);
  }
  return f;
};
console.log('fitting FIR L=384 on 12k wander samples…');
const X = [], Y = [];
for (const w of FIT) {
  const qs = w.map((r) => r.q);
  for (let t = L; t < w.length - 1; t++) { X.push(featQ(qs, t)); Y.push(w[t + 1].e); }
}
const W = ridgeMulti(X, Y, RIDGE);
const predict = (f) => W.map((w) => { let s = 0; for (let i = 0; i < f.length; i++) s += w[i] * f[i]; return s; });

// the program's command series at sample cadence: held start + laps
const qCmdAt = (k) => { const c = path.at(k); return path && rigIk(c); };
let rigArm = await makeArm();                 // ik only — no stepping
const rigIk = (c) => rigArm.arm.ik(c.x, c.y, true);
const q0 = rigIk(path.at(0));
const progQ = (laps) => {
  const qs = [];
  for (let t = 0; t < PRE; t++) qs.push(q0.slice());
  const total = Math.ceil(path.lap * laps);
  for (let k = 0; k < total; k += SS) qs.push(rigIk(path.at(k)));
  return qs;
};

// the learned simulator: e over the window given du (array rows or accessor)
const simFor = (laps) => async (du) => {
  const duAt = du == null ? null : (typeof du === 'function'
    ? (t) => du(t * SS)
    : (t) => {
      const s0 = Math.min(du.length - 2, Math.floor(t)), fr = t - s0;
      return [du[s0][0] + fr * (du[s0 + 1][0] - du[s0][0]),
        du[s0][1] + fr * (du[s0 + 1][1] - du[s0][1])];
    });
  const base = progQ(laps);
  const qs = base.map((q, t) => {
    if (!duAt) return q;
    const d = duAt(t);
    return [q[0] + d[0], q[1] + d[1]];
  });
  const e = [];
  for (let t = 0; t < qs.length; t++) e.push(predict(featQ(qs, t)));
  return e;
};

// V1: H MEASURED ON THE REAL MACHINE AT COMMISSIONING (held ref steps, tracker on —
// commissioning-legal). v0 used the model's own step response and delivered 0.4x: a
// held 2e-3 step is outside the wander distribution the FIR knows, so the compile
// inverted a fictional response. H is probed at the GATHER CENTRE pose (the program is
// unknown at commissioning); the same probe at the program's start pose is measured
// beside it as the pose-sensitivity instrument.
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
console.log('probing H on the REAL machine (centre pose, commissioning-legal)…');
const qc = rigIk({ x: 12, y: 0 });
const H = await probeH(qc);
const Hstart = await probeH(q0);
{
  let d2 = 0, n2 = 0, m2 = 0;
  for (const ch of [0, 1]) for (let k = 0; k < H[ch].length; k++) for (const c of [0, 1]) {
    d2 += (H[ch][k][c] - Hstart[ch][k][c]) ** 2; m2 += Hstart[ch][k][c] ** 2; n2++;
  }
  console.log(`H pose sensitivity (centre vs program start): ${(Math.sqrt(d2 / m2) * 100).toFixed(1)}% rms`);
}
// the simulator becomes: learned e_free + REAL-H convolution of du (superposition)
const eFreeOf = new Map();
const dH = H.map((rows) => rows.map((r, k) => [r[0] - (k ? rows[k - 1][0] : 0), r[1] - (k ? rows[k - 1][1] : 0)]));
const simSuper = (laps) => async (du) => {
  const key = laps;
  if (!eFreeOf.has(key)) {
    const qs = progQ(laps);
    const ef = [];
    for (let t = 0; t < qs.length; t++) ef.push(predict(featQ(qs, t)));
    eFreeOf.set(key, ef);
  }
  const ef = eFreeOf.get(key);
  if (du == null) return ef.map((r) => r.slice());
  const duAt = typeof du === 'function'
    ? (t) => du(t * SS)
    : (t) => {
      const s0 = Math.min(du.length - 2, Math.floor(t)), fr = t - s0;
      return [du[s0][0] + fr * (du[s0 + 1][0] - du[s0][0]),
        du[s0][1] + fr * (du[s0 + 1][1] - du[s0][1])];
    };
  const n = ef.length;
  const duS = Array.from({ length: n }, (_, t) => duAt(t));
  const out = ef.map((r) => r.slice());
  const Lh = dH[0].length;
  for (let t = 0; t < n; t++) {
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
};

console.log('compiling against the LEARNED simulator…');
const res = await compileTwin({ simulate: simSuper(LAPS_C), H, iters: 11,
  onProgress: (m) => console.log('  ' + m) });
console.log(`compiled: model rms ${res.report.rms.toExponential(2)}`);
const ref = await refineCompiled({ simulate: simSuper(4), H, du: res.du,
  sample: SS, lapSteps: path.lap, preRoll: PRE,
  onProgress: (m) => console.log('  ' + m) });
console.log(`refined: ${ref.report.openRms.toExponential(2)} → ${ref.report.rms.toExponential(2)}`);

// DELIVER ON THE REAL MACHINE
await destroy(rigArm);
const drive = async (duF, laps) => {
  const m = await makeArm();
  homeArm(m.arm, m.servo, path);
  if (duF) {
    const [h1, h2] = q0;
    for (let k = 0; k < PRE * SS; k++) {
      const d = duF(k);
      const tau = m.servo.torques([{ theta: h1 + d[0], omega: 0, alpha: 0 },
        { theta: h2 + d[1], omega: 0, alpha: 0 }]);
      m.arm.step(tau[0], tau[1], 1);
    }
  }
  const total = Math.ceil(path.lap * laps);
  const rows = []; let cAcc = 0, cn = 0, lapNo = 0;
  for (let k = 0; k < total; k++) {
    const now = Math.floor(k / path.lap);
    if (now !== lapNo) { rows.push(Math.sqrt(cAcc / cn)); cAcc = 0; cn = 0; lapNo = now; }
    const c = path.at(k);
    const [q1, q2] = m.arm.ik(c.x, c.y, true);
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
console.log('delivering on the REAL machine…');
const open = await drive(null, 2);
const got = await drive(ref.f, 8);
console.log('open   :', open.map((v) => v.toExponential(2)).join('  '));
console.log('v0 ⑩dyn:', got.map((v) => v.toExponential(2)).join('  '));
console.log(`gain over open: ${(open.at(-1) / got.at(-1)).toFixed(1)}x   (structure twin: 44x)`);
console.log('EXIT 0');
