// ROUTE B: THE FITTED LUMPED TEMPLATE. A generic 2R chain — rigid links, two-inertia
// joints with spring/damping/backlash (the library's own Joint), the engineer's own
// servo law — with EVERY plant parameter fitted by output error on one commissioning
// wander. Nothing from the real machine's construction is read: lengths, ratio, servo
// constants and drive limits are nameplate; masses, inertias, stiffnesses, dampings,
// backlash are learned. The template's structural mismatch is real (no distributed
// link flex at the softest links) and the free-run instrument prices it.
import { Joint } from '/home/user/Tisaic.github.io/lib/flexisim/joint.js';
import { ChainServo } from '/home/user/Tisaic.github.io/lib/flexisim/compensator.js';
import { compileTwin, refineCompiled } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { randomWander } from '/home/user/Tisaic.github.io/lib/flexisim/demopath.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500, LAPS_C = 5;
const path = mkPath('sharp', 0.004);
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };

// ---------------- nameplate (engineer-known): lengths, ratio, servo, drive, gravity
const real0 = await makeArm();
const NAME = { L1: real0.arm.L1, L2: real0.arm.L2, ratio: real0.arm.j1.N,
  bw: 2e-3, tauMax: real0.servo.tauMax, speedMax: real0.servo.speedMax, g: 2e-6 };
await destroy(real0);
console.log(`nameplate: L ${NAME.L1}/${NAME.L2}, ratio ${NAME.ratio}, tauMax ${NAME.tauMax.toExponential(2)}, speedMax ${NAME.speedMax}`);

// ---------------- the template
const rot = (x, y, th) => {
  const c = Math.cos(th), s = Math.sin(th);
  return [c * x - s * y, s * x + c * y];
};
class TemplateArm {
  // MINIMAL IDENTIFIABLE PARAMETERS (the EMPS IDIM-LS discipline): Ia = J1+J2+m2*L1^2,
  // B = m2*c2*L1 (the cos coefficient), J2, and the two gravity levers A1 = g*(m1*c1
  // + m2*L1), A2 = g*m2*c2 — plus the joint set {K, cJ, Jm} x2 and backlash.
  constructor(p) {
    this.L1 = NAME.L1; this.L2 = NAME.L2;
    this.p = p;
    this.gWorld = [0, -NAME.g, 0];
    const mkJ = (K, cJ, Jm) => new Joint({ ratio: NAME.ratio, motorInertia: Jm,
      loadInertia: 1, stiffness: K, backlash: p.bl, damping: cJ });
    this.j1 = mkJ(p.K1, p.cJ1, p.Jm1);
    this.j2 = mkJ(p.K2, p.cJ2, p.Jm2);
    if (p.Ia <= 2 * Math.abs(p.B) || p.J2 <= 0) throw new Error('indefinite M');
    this.q = [0, 0]; this.w = [0, 0]; this.alpha = [0, 0];
    this._sync();
  }
  setPose(q1, q2) {
    this.q = [q1, q2]; this.w = [0, 0];
    this.j1.thM = q1 * this.j1.N; this.j2.thM = q2 * this.j2.N;
    this.j1.wM = 0; this.j2.wM = 0;
    this._sync();
  }
  _sync() {
    this.j1.thL = this.q[0]; this.j1.wL = this.w[0];
    this.j2.thL = this.q[1]; this.j2.wL = this.w[1];
  }
  massMatrix(q2 = this.q[1]) {
    const cs = Math.cos(q2);
    const { Ia, B, J2 } = this.p;
    const m12 = J2 + B * cs;
    return [[Ia + J2 + 2 * B * cs, m12], [m12, J2]];
  }
  velocityTorque(q = this.q, w = this.w) {
    const h = -this.p.B * Math.sin(q[1]);
    return [h * w[1] * w[1] + 2 * h * w[0] * w[1], -h * w[0] * w[0]];
  }
  gravityTorque(q = this.q) {
    const { A1, A2 } = this.p;
    const c1 = Math.cos(q[0]), c12 = Math.cos(q[0] + q[1]);
    return [-(A1 * c1 + A2 * c12), -A2 * c12];
  }
  encoders() { return [this.j1.encoder(), this.j2.encoder()]; }
  toolXY() {
    const [q1, q2] = this.q;
    return [this.L1 * Math.cos(q1) + this.L2 * Math.cos(q1 + q2),
      this.L1 * Math.sin(q1) + this.L2 * Math.sin(q1 + q2)];
  }
  step(t1c, t2c, dt) {
    const t1 = this.j1.stepMotor(t1c, dt);
    const t2 = this.j2.stepMotor(t2c, dt);
    const M = this.massMatrix();
    const v = this.velocityTorque();
    const g = this.gravityTorque();
    const b = [t1 + g[0] - v[0], t2 + g[1] - v[1]];
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    const a1 = (M[1][1] * b[0] - M[0][1] * b[1]) / det;
    const a2 = (M[0][0] * b[1] - M[1][0] * b[0]) / det;
    this.alpha = [a1, a2];
    this.w = [this.w[0] + dt * a1, this.w[1] + dt * a2];
    this.q = [this.q[0] + dt * this.w[0], this.q[1] + dt * this.w[1]];
    this._sync();
    return this;
  }
}
const mkTemplate = (p) => {
  const arm = new TemplateArm(p);
  const servo = new ChainServo({ arm, bandwidth: NAME.bw,
    tauMax: NAME.tauMax, speedMax: NAME.speedMax });
  return { arm, servo };
};

// analytic kinematics of the NAMEPLATE lengths, for refs and routing (both sides use it)
const ik = (x, y) => {
  const { L1, L2 } = NAME;
  const r2 = x * x + y * y;
  const c2 = Math.max(-1, Math.min(1, (r2 - L1 * L1 - L2 * L2) / (2 * L1 * L2)));
  const q2 = Math.acos(c2);
  const q1 = Math.atan2(y, x) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
  return [q1, q2];
};
const fk = (q) => [NAME.L1 * Math.cos(q[0]) + NAME.L2 * Math.cos(q[0] + q[1]),
  NAME.L1 * Math.sin(q[0]) + NAME.L2 * Math.sin(q[0] + q[1])];
const route = (tool, q) => {
  const { L1, L2 } = NAME;
  const s1 = Math.sin(q[0]), c1 = Math.cos(q[0]), s12 = Math.sin(q[0] + q[1]), c12 = Math.cos(q[0] + q[1]);
  const J = [[-L1 * s1 - L2 * s12, -L2 * s12], [L1 * c1 + L2 * c12, L2 * c12]];
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  const a = fk(q);
  const ex = tool[0] - a[0], ey = tool[1] - a[1];
  return [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det];
};

// ---------------- the commissioning record on the REAL machine (tracker on)
console.log('recording the commissioning wander on the real machine…');
const recordReal = async (p, nSamples) => {
  const m = await makeArm();
  homeArm(m.arm, m.servo, p);
  const rows = [];
  for (let k = 0; k < nSamples * SS; k++) {
    const c = p.at(k);
    const [q1, q2] = m.arm.ik(c.x, c.y, true);
    const rt = m.arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    const tau = m.servo.torques([{ theta: q1, omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2, omega: rt.dq[1], alpha: rt.ddq[1] }]);
    m.arm.step(tau[0], tau[1], 1);
    if (k % SS === 0) rows.push({ e: route(m.arm.toolXY(), [q1, q2]), q: [q1, q2],
      w: [rt.dq[0], rt.dq[1]], al: [rt.ddq[0], rt.ddq[1]] });
  }
  await destroy(m);
  return rows;
};
const wpathA = randomWander(mkRnd(301), 0.004, { centre: [12, 0], reach: 6 });
const wpathB = randomWander(mkRnd(305), 0.004, { centre: [12, 0], reach: 6 });
const recA = await recordReal(wpathA, 1500);
const recB = await recordReal(wpathB, 900);

// replay a record through the template at params p → routed truth per sample
const replay = (p, rec, wp) => {
  const t = mkTemplate(p);
  const q0 = rec[0].q;
  t.arm.setPose(q0[0], q0[1]);
  for (let i = 0; i < 4000; i++) {
    const tau = t.servo.torques([{ theta: q0[0], omega: 0, alpha: 0 },
      { theta: q0[1], omega: 0, alpha: 0 }]);
    t.arm.step(tau[0], tau[1], 1);
  }
  const out = [];
  for (let k = 0; k < rec.length * SS; k++) {
    const c = wp.at(k);
    const q = ik(c.x, c.y);
    const i = Math.min(rec.length - 1, Math.floor(k / SS));
    const refs = [{ theta: q[0], omega: rec[i].w[0], alpha: rec[i].al[0] },
      { theta: q[1], omega: rec[i].w[1], alpha: rec[i].al[1] }];
    const tau = t.servo.torques(refs);
    t.arm.step(tau[0], tau[1], 1);
    if (k % SS === 0) out.push(route(t.arm.toolXY(), q));
  }
  return out;
};
const J = (p, rec, wp) => {
  let pred;
  try { pred = replay(p, rec, wp); } catch { return Infinity; }
  let s = 0;
  for (let i = 0; i < rec.length; i++) {
    if (!Number.isFinite(pred[i][0]) || !Number.isFinite(pred[i][1])) return Infinity;
    s += (pred[i][0] - rec[i].e[0]) ** 2 + (pred[i][1] - rec[i].e[1]) ** 2;
  }
  return s / rec.length;
};

// ---------------- stage 1: probe the REAL step response and fit the dynamics to it
console.log('probing the real machine step response (commissioning)…');
const probeReal = async () => {
  const m = await makeArm();
  const qh = m.arm.ik(12, 0, true);
  const Hout = [];
  for (const ch of [0, 1]) {
    m.arm.setPose(qh[0], qh[1]);
    for (let k = 0; k < 30000; k++) {
      const tau = m.servo.torques([{ theta: qh[0], omega: 0, alpha: 0 },
        { theta: qh[1], omega: 0, alpha: 0 }]);
      m.arm.step(tau[0], tau[1], 1);
    }
    const base = route(m.arm.toolXY(), qh);
    const resp = [];
    for (let k = 0; k < 12000; k++) {
      const refs = [{ theta: qh[0] + (ch === 0 ? 2e-3 : 0), omega: 0, alpha: 0 },
        { theta: qh[1] + (ch === 1 ? 2e-3 : 0), omega: 0, alpha: 0 }];
      const tau = m.servo.torques(refs);
      m.arm.step(tau[0], tau[1], 1);
      if (k % SS === 0) {
        const t = route(m.arm.toolXY(), qh);
        resp.push([(t[0] - base[0]) / 2e-3, (t[1] - base[1]) / 2e-3]);
      }
    }
    Hout.push(resp);
  }
  await destroy(m);
  return { H: Hout, qh };
};
const { H: Hreal, qh: QH } = await probeReal();
const templateH = (p) => {
  const t = mkTemplate(p);
  const Hout = [];
  for (const ch of [0, 1]) {
    t.arm.setPose(QH[0], QH[1]);
    t.arm.j1.wM = 0; t.arm.j2.wM = 0; t.arm.w = [0, 0];
    for (let k = 0; k < 30000; k++) {
      const tau = t.servo.torques([{ theta: QH[0], omega: 0, alpha: 0 },
        { theta: QH[1], omega: 0, alpha: 0 }]);
      t.arm.step(tau[0], tau[1], 1);
    }
    const base = route(t.arm.toolXY(), QH);
    const resp = [];
    for (let k = 0; k < 12000; k++) {
      const refs = [{ theta: QH[0] + (ch === 0 ? 2e-3 : 0), omega: 0, alpha: 0 },
        { theta: QH[1] + (ch === 1 ? 2e-3 : 0), omega: 0, alpha: 0 }];
      const tau = t.servo.torques(refs);
      t.arm.step(tau[0], tau[1], 1);
      if (k % SS === 0) {
        const tt = route(t.arm.toolXY(), QH);
        resp.push([(tt[0] - base[0]) / 2e-3, (tt[1] - base[1]) / 2e-3]);
      }
    }
    Hout.push(resp);
  }
  return Hout;
};
const JH = (p) => {
  let Ht;
  try { Ht = templateH(p); } catch { return Infinity; }
  let s = 0, n = 0;
  for (const ch of [0, 1]) for (let k = 0; k < Hreal[ch].length; k++) for (const c of [0, 1]) {
    const d = Ht[ch][k][c] - Hreal[ch][k][c];
    if (!Number.isFinite(d)) return Infinity;
    s += d * d; n++;
  }
  return s / n;
};

// ---------------- output-error fit: log-space pattern search, multi-start
const KEYS = ['K1', 'K2', 'cJ1', 'cJ2', 'Jm1', 'Jm2', 'Ia', 'B', 'J2', 'A1', 'A2', 'bl'];
const DYN = ['K1', 'K2', 'cJ1', 'cJ2', 'Jm1', 'Jm2', 'Ia', 'B', 'J2'];
const search = (obj, p0, keys, rounds = 60) => {
  let p = { ...p0 }, j = obj(p), step = 2.0;
  for (let round = 0; round < rounds && step > 1.01; round++) {
    let moved = false;
    for (const k of keys) {
      for (const f of [step, 1 / step]) {
        const q = { ...p, [k]: p[k] * f };
        const jq = obj(q);
        if (jq < j) { p = q; j = jq; moved = true; }
      }
    }
    if (!moved) step = Math.sqrt(step);
  }
  return { p, j };
};
const fit = (inits) => {
  let best = null;
  for (const init of inits) {
    // stage 1: dynamics on the step response (gravity levers barely enter a diff)
    const s1 = search(JH, init, DYN, 60);
    console.log(`  stage 1 (H match): ${s1.j.toExponential(3)}`);
    // stage 2: everything on the wander output error, from the H-matched start
    const s2 = search((p) => J(p, recA, wpathA), s1.p, KEYS, 60);
    console.log(`  stage 2 (wander): J ${s2.j.toExponential(3)}`);
    if (!best || s2.j < best.j) best = s2;
  }
  return best;
};
console.log('fitting the template by output error (pattern search, 3 starts)…');
const t0f = Date.now();
const starts = [
  { K1: 0.5, K2: 0.5, cJ1: 1, cJ2: 1, Jm1: 1e2, Jm2: 1e2, Ia: 6e4, B: 8e3, J2: 8e3, A1: 8e-3, A2: 2e-3, bl: 1e-4 },
  { K1: 0.1, K2: 0.1, cJ1: 0.2, cJ2: 0.2, Jm1: 20, Jm2: 20, Ia: 2e5, B: 2e4, J2: 3e4, A1: 3e-2, A2: 8e-3, bl: 5e-5 },
  { K1: 2, K2: 2, cJ1: 4, cJ2: 4, Jm1: 4e2, Jm2: 4e2, Ia: 2e4, B: 2e3, J2: 2e3, A1: 2e-3, A2: 5e-4, bl: 2e-4 },
];
const { p: P, j: Jfit } = fit(starts);
console.log(`fitted in ${((Date.now() - t0f) / 60000).toFixed(1)}m: J ${Jfit.toExponential(3)}`);
console.log('  params:', KEYS.map((k) => `${k}=${P[k].toExponential(2)}`).join(' '));

// holdout free-run (a wander never fitted) + the program
const nrmse = (pred, rec) => {
  const err = [[], []], tr = [[], []];
  for (let i = 50; i < rec.length; i++) for (const c of [0, 1]) {
    err[c].push(pred[i][c] - rec[i].e[c]); tr[c].push(rec[i].e[c]);
  }
  const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  return [rms(err[0]) / rms(tr[0]), rms(err[1]) / rms(tr[1])];
};
const hB = nrmse(replay(P, recB, wpathB), recB);
console.log(`holdout wander free-run NRMSE: ${hB[0].toFixed(3)}/${hB[1].toFixed(3)}`);
console.log('recording the program truth (scoring only)…');
const recP = await recordReal(path, Math.ceil(path.lap * 2 / SS));
const hP = nrmse(replay(P, recP, path), recP);
console.log(`PROGRAM free-run NRMSE: ${hP[0].toFixed(3)}/${hP[1].toFixed(3)}`);
// ---------------- compile the program against the FITTED TEMPLATE and deliver.
// The template is a nonlinear simulator (backlash, drive envelope), so the compile's
// guard verifies real trials and H comes from the template's own structural step
// response — the structure twin's pattern, with a fitted template underneath.
const progRefs = (() => {
  const total = Math.ceil(path.lap * LAPS_C);
  const refs = [];
  for (let k = 0; k <= total + SS; k++) {
    const c = path.at(k);
    refs.push({ q: ik(c.x, c.y), v: [c.vx, c.vy], a: [c.ax, c.ay] });
  }
  return refs;
})();
// rates for template refs by central difference of the commanded q (the template has
// no ikRates; the learned chain uses the same discipline)
const refAtT = (k) => {
  const i = Math.max(1, Math.min(progRefs.length - 2, k));
  const q = progRefs[i].q, qm = progRefs[i - 1].q, qp = progRefs[i + 1].q;
  return [0, 1].map((j) => ({ theta: q[j], omega: (qp[j] - qm[j]) / 2,
    alpha: qp[j] - 2 * q[j] + qm[j] }));
};
const simTemplate = (laps) => async (du) => {
  const duAt = du == null ? null : (typeof du === 'function' ? (k) => du(k) : (k) => {
    const t = k / SS;
    const s0 = Math.min(du.length - 2, Math.floor(t)), fr = t - s0;
    return [du[s0][0] + fr * (du[s0 + 1][0] - du[s0][0]),
      du[s0][1] + fr * (du[s0 + 1][1] - du[s0][1])];
  });
  const t = mkTemplate(P);
  const q0 = progRefs[0].q;
  t.arm.setPose(q0[0], q0[1]);
  for (let i = 0; i < 4000; i++) {
    const tau = t.servo.torques([{ theta: q0[0], omega: 0, alpha: 0 },
      { theta: q0[1], omega: 0, alpha: 0 }]);
    t.arm.step(tau[0], tau[1], 1);
  }
  const e = [];
  const total = PRE * SS + Math.ceil(path.lap * laps);
  for (let k = 0; k < total; k++) {
    const inPre = k < PRE * SS;
    const kk = inPre ? 0 : k - PRE * SS;
    const refs = inPre
      ? [{ theta: q0[0], omega: 0, alpha: 0 }, { theta: q0[1], omega: 0, alpha: 0 }]
      : refAtT(kk);
    const d = duAt ? duAt(k) : [0, 0];
    const tau = t.servo.torques([
      { ...refs[0], theta: refs[0].theta + d[0] },
      { ...refs[1], theta: refs[1].theta + d[1] }]);
    t.arm.step(tau[0], tau[1], 1);
    if (k % SS === 0) e.push(route(t.arm.toolXY(), [refs[0].theta, refs[1].theta]));
  }
  return e;
};
console.log('compiling the program against the fitted template…');
const Ht = templateH(P);
const res = await compileTwin({ simulate: simTemplate(LAPS_C), H: Ht, iters: 11,
  onProgress: (m) => console.log('  ' + m) });
console.log(`compiled: template rms ${res.report.rms.toExponential(2)}`);
const ref = await refineCompiled({ simulate: simTemplate(4), H: Ht, du: res.du,
  sample: SS, lapSteps: path.lap, preRoll: PRE,
  onProgress: (m) => console.log('  ' + m) });
console.log(`refined: ${ref.report.openRms.toExponential(2)} → ${ref.report.rms.toExponential(2)}`);
let duPk = 0;
for (let k = 0; k < (PRE + 4 * path.lap / SS) * SS; k += 3) {
  const d = ref.f(k);
  duPk = Math.max(duPk, Math.abs(d[0]), Math.abs(d[1]));
}
console.log(`duPk ${duPk.toExponential(2)}`);
console.log('delivering on the REAL machine…');
const score = async (duF, laps) => {
  const m = await makeArm();
  homeArm(m.arm, m.servo, path);
  if (duF) {
    const q0 = progRefs[0].q;
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
const open = await score(null, 2);
const got = await score(ref.f, 8);
console.log('open    :', open.map((v) => v.toExponential(2)).join('  '));
console.log('template:', got.map((v) => v.toExponential(2)).join('  '));
console.log(`gain over open: ${(open.at(-1) / got.at(-1)).toFixed(1)}x   (generic learned 5.6x, structure twin 44x)`);
console.log('EXIT 0');
