// SWEEP 2 for the learned-dynamics twin: the first sweep measured the plain AR class
// at 0.4-0.8 free-run NRMSE with L=24 (216 steps) against a measured memory of
// 6363-8649 STEPS. Extensions measured here, one axis at a time:
//   A: longer e/q lag windows (L 48/96/192 samples)
//   B: leaky-integrator input features (exp histories of dq at 5 time constants +
//      quadratic pose terms) — deep memory with few features, stable by construction
//   C: scheduled refit (e-lags replaced by the model's own free-run, refit — optimizes
//      the free-run property the deploy actually needs)
// Records cached to dynrecords.json so a sweep iteration costs seconds.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ridgeMulti } from '/home/user/Tisaic.github.io/test/pilot/rigs/ikfree-rig.mjs';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
import { randomWander, randomPolygon } from '/home/user/Tisaic.github.io/lib/flexisim/demopath.js';
import { ToolPath, SEG } from '/home/user/Tisaic.github.io/lib/flexisim/toolpath.js';
// polygons that SPAN THE WORKSPACE the program runs in — the library generator maxes at
// r 3.8 and the wander at 4.2, while the sharp square's half-diagonal is 5.66: the
// fourth appearance of "a calibration must span the range it is used over"
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
const { makeArm, mkPath, homeArm } = rig;
const SS = 9;
const CACHE = '/tmp/claude-0/-home-user-Tisaic-github-io/932a1341-a996-534b-9a60-fb10b63f0258/scratchpad/dynrecords.json';
const path = mkPath('sharp', 0.004);
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };

const record = async (p, nSamples) => {
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

let R;
if (existsSync(CACHE)) {
  R = JSON.parse(readFileSync(CACHE, 'utf8'));
  console.log('records loaded from cache');
} else {
  console.log('recording (once)…');
  R = {
    w1: await record(randomWander(mkRnd(301), 0.004, { centre: [12, 0] }), 2000),
    w2: await record(randomWander(mkRnd(302), 0.004, { centre: [12, 0] }), 2000),
    w3: await record(randomWander(mkRnd(303), 0.004, { centre: [12, 0] }), 1000),
    prog: await record(path, Math.ceil(path.lap * 2 / SS)),
  };
  writeFileSync(CACHE, JSON.stringify(R));
}
if (!R.p1) {
  console.log('extending the cache with corner-rich records (polygons + stars)…');
  R.p1 = await record(randomPolygon(mkRnd(401), 0.004, { centre: [12, 0] }), 2000);
  R.p2 = await record(randomPolygon(mkRnd(402), 0.004, { centre: [12, 0], star: true }), 2000);
  R.p3 = await record(randomPolygon(mkRnd(403), 0.004, { centre: [12, 0] }), 2000);
  R.p4 = await record(randomPolygon(mkRnd(404), 0.004, { centre: [12, 0], star: true }), 2000);
  writeFileSync(CACHE, JSON.stringify(R));
}
if (!R.c1) {
  console.log('extending the cache with a WORKSPACE-SPANNING corpus (reach 6)…');
  for (let i = 0; i < 6; i++) {
    R['c' + (i + 1)] = await record(randomWander(mkRnd(601 + i), 0.004, { centre: [12, 0], reach: 6 }), 2000);
    writeFileSync(CACHE, JSON.stringify(R));
  }
  for (let i = 0; i < 6; i++) {
    R['d' + (i + 1)] = await record(bigPolygon(mkRnd(611 + i), 0.004, { star: i % 2 === 1 }), 2000);
    writeFileSync(CACHE, JSON.stringify(R));
  }
}
if (!R.e1) {
  console.log('extending the spanning corpus (12 more)…');
  for (let i = 0; i < 6; i++) {
    R['e' + (i + 1)] = await record(randomWander(mkRnd(701 + i), 0.004, { centre: [12, 0], reach: 6 }), 2000);
    writeFileSync(CACHE, JSON.stringify(R));
  }
  for (let i = 0; i < 6; i++) {
    R['f' + (i + 1)] = await record(bigPolygon(mkRnd(711 + i), 0.004, { star: i % 2 === 1 }), 2000);
    writeFileSync(CACHE, JSON.stringify(R));
  }
}
if (!R.x1) {
  console.log('extending the cache with twelve more records (reach corpus)…');
  for (let i = 0; i < 12; i++) {
    const star = i % 3 === 2;
    const gen = i % 3 === 0 ? randomWander(mkRnd(500 + i), 0.004, { centre: [12, 0] })
      : randomPolygon(mkRnd(500 + i), 0.004, { centre: [12, 0], star });
    R['x' + (i + 1)] = await record(gen, 2000);
    writeFileSync(CACHE, JSON.stringify(R));
  }
}
if (!R.w4) {
  console.log('extending the cache with four more wanders (data scaling)…');
  R.w4 = await record(randomWander(mkRnd(304), 0.004, { centre: [12, 0] }), 2000);
  R.w5 = await record(randomWander(mkRnd(305), 0.004, { centre: [12, 0] }), 2000);
  R.w6 = await record(randomWander(mkRnd(306), 0.004, { centre: [12, 0] }), 2000);
  R.w7 = await record(randomWander(mkRnd(307), 0.004, { centre: [12, 0] }), 2000);
  writeFileSync(CACHE, JSON.stringify(R));
}
const { w1, w2, w3, prog } = R;
const FIT = process.env.COVER2
  ? [...'cdef'].flatMap((ch) => Array.from({ length: 6 }, (_, i) => R[ch + (i + 1)]))
      .concat([R.w1, R.w2, R.p1, R.p2, R.p3, R.p4]).filter(Boolean)
  : process.env.COVER
  ? [...Array.from({ length: 6 }, (_, i) => R['c' + (i + 1)]),
     ...Array.from({ length: 6 }, (_, i) => R['d' + (i + 1)]),
     R.w1, R.w2, R.p1, R.p2, R.p3, R.p4].filter(Boolean)
  : process.env.HUGE
  ? [R.w1, R.w2, R.w4, R.w5, R.w6, R.w7, R.p1, R.p2, R.p3, R.p4,
     ...Array.from({ length: 12 }, (_, i) => R['x' + (i + 1)])].filter(Boolean)
  : process.env.CORNERS ? [R.w1, R.w2, R.w4, R.w5, R.p1, R.p2, R.p3, R.p4]
  : process.env.BIG ? [R.w1, R.w2, R.w4, R.w5, R.w6, R.w7] : [R.w1, R.w2];
const CQ = [0, 0];
{
  let s0 = 0, s1 = 0, n = 0;
  for (const r of [...w1, ...w2]) { s0 += r.q[0]; s1 += r.q[1]; n++; }
  CQ[0] = s0 / n; CQ[1] = s1 / n;
}
const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

// leaky-integrator states of dq, propagated over the whole record once per tau
const TAUS = [50, 150, 400, 1000, 2500];          // steps
const leakyOf = (rows) => {
  const out = rows.map(() => []);
  for (const tau of TAUS) {
    const a = Math.exp(-SS / tau);
    let s0 = 0, s1 = 0;
    for (let t = 0; t < rows.length; t++) {
      const dq0 = t ? rows[t].q[0] - rows[t - 1].q[0] : 0;
      const dq1 = t ? rows[t].q[1] - rows[t - 1].q[1] : 0;
      s0 = a * s0 + (1 - a) * dq0; s1 = a * s1 + (1 - a) * dq1;
      out[t].push(s0, s1);
    }
  }
  return out;
};
for (const rows of [w1, w2, w3, prog]) rows.leaky = undefined;
const LK = {};
// hysteresis (backlash) states: h += dq, clamped to [-b, b] — the wind-up-within-lash
// observer, per joint per candidate width, computable online from commands alone
const LASH = [2e-5, 5e-5, 1e-4, 2e-4];
const hystOf = (rows) => {
  const out = rows.map(() => []);
  for (const b of LASH) {
    let h0 = 0, h1 = 0;
    for (let t = 0; t < rows.length; t++) {
      const dq0 = t ? rows[t].q[0] - rows[t - 1].q[0] : 0;
      const dq1 = t ? rows[t].q[1] - rows[t - 1].q[1] : 0;
      h0 = Math.max(-b, Math.min(b, h0 + dq0));
      h1 = Math.max(-b, Math.min(b, h1 + dq1));
      out[t].push(h0 / b, h1 / b);
    }
  }
  return out;
};
const HY = {};
const hyOf = () => { throw new Error('hyst retired'); };
const lkOf = () => { throw new Error('leaky retired'); };

// feature builders — each returns feat(rows, t, eOf)
const mkPlain = (L) => (rows, t, eOf) => {
  const f = [1];
  for (let i = 0; i < L; i++) { const e = eOf(t - i); f.push(e[0], e[1]); }
  for (let i = 0; i < L; i++) { const q = rows[t - i].q; f.push(q[0] - CQ[0], q[1] - CQ[1]); }
  for (let i = 0; i < L; i++) {
    const q = rows[t - i].q, qm = rows[t - i - 1].q;
    f.push(q[0] - qm[0], q[1] - qm[1]);
  }
  return f;
};
const mkLeaky = (Le) => (rows, t, eOf) => {
  const f = [1];
  for (let i = 0; i < Le; i++) { const e = eOf(t - i); f.push(e[0], e[1]); }
  const lk = lkOf(rows)[t];
  for (const v of lk) f.push(v);
  const u = rows[t].q[0] - CQ[0], v2 = rows[t].q[1] - CQ[1];
  f.push(u, v2, u * u, u * v2, v2 * v2);
  for (let i = 0; i < 24; i++) {
    const q = rows[t - i].q, qm = rows[t - i - 1].q;
    f.push(q[0] - qm[0], q[1] - qm[1]);
  }
  return f;
};

// the corner-regime bit, from COMMANDED acceleration alone (the shipped router's rule:
// a spike > 10x the record's own median within the window reach)
const bitOf = (rows) => {
  const acc = rows.map((r, t) => {
    if (t < 2) return 0;
    return Math.max(Math.abs(rows[t].q[0] - 2 * rows[t - 1].q[0] + rows[t - 2].q[0]),
      Math.abs(rows[t].q[1] - 2 * rows[t - 1].q[1] + rows[t - 2].q[1]));
  });
  const med = [...acc].sort((a, b) => a - b)[Math.floor(acc.length / 2)] || 1e-12;
  const raw = acc.map((a) => (a > 10 * med ? 1 : 0));
  // widen: a corner's influence outlasts the spike — hold the bit for 12 samples
  const bit = raw.slice();
  for (let t = 0; t < bit.length; t++) if (raw[t]) for (let j = 1; j <= 12 && t + j < bit.length; j++) bit[t + j] = 1;
  return bit;
};
const BT = new Map();
const btOf = (rows) => { if (!BT.has(rows)) BT.set(rows, bitOf(rows)); return BT.get(rows); };
const mkSplit = (L) => (rows, t, eOf) => {
  const f = mkPlain(L)(rows, t, eOf);
  const b = btOf(rows)[t];
  const out = new Array(2 * f.length);
  for (let i = 0; i < f.length; i++) { out[i] = b ? 0 : f[i]; out[f.length + i] = b ? f[i] : 0; }
  return out;
};
const mkHyst = (L) => (rows, t, eOf) => {
  const f = mkPlain(L)(rows, t, eOf);
  const hy = hyOf(rows);
  for (const i of [0, 4, 12, 32]) for (const v of hy[Math.max(0, t - i)]) f.push(v);
  return f;
};
// input-only FIR: no e-lags at all — free-run IS one-step, stable by construction.
// section 41 convicted short-window feedforward; this is the same class at TRUE memory
// length, which that campaign never reached.
const mkFIR = (L) => (rows, t) => {
  const f = [1];
  for (let i = 0; i < L; i++) { const q = rows[t - i].q; f.push(q[0] - CQ[0], q[1] - CQ[1]); }
  for (let i = 0; i < L; i += 2) {
    const q = rows[t - i].q, qm = rows[t - i - 1].q;
    f.push(q[0] - qm[0], q[1] - qm[1]);
  }
  return f;
};
// FIR + friction features: sign(dq) and |dq| lags — a Stribeck reversal is a STEP in
// the truth at dq=0, which no linear-in-dq dictionary can draw
const mkSign = (L) => (rows, t) => {
  const f = mkFIR(L)(rows, t);
  const sm = (i) => {
    const q = rows[Math.max(0, t - i)].q, qm = rows[Math.max(0, t - i - 1)].q;
    return [q[0] - qm[0], q[1] - qm[1]];
  };
  for (let i = 0; i < 96; i += 2) {
    const d = sm(i);
    f.push(Math.tanh(d[0] * 2e4), Math.tanh(d[1] * 2e4), Math.abs(d[0]), Math.abs(d[1]));
  }
  return f;
};
// log-spaced lags: full memory reach at a fraction of the parameters
const LOGL = (() => {
  const taps = [];
  for (let i = 0; i < 48; i++) taps.push(i);                       // dense recent
  let v = 48;
  while (v < 950) { taps.push(Math.round(v)); v *= 1.13; }         // ~26 log taps
  return taps;
})();
const mkLog = () => (rows, t) => {
  const at = (i) => rows[Math.max(0, t - i)].q;
  const f = [1];
  for (const i of LOGL) { const q = at(i); f.push(q[0] - CQ[0], q[1] - CQ[1]); }
  for (const i of LOGL) {
    const q = at(i), qm = rows[Math.max(0, t - i - 1)].q;
    f.push(q[0] - qm[0], q[1] - qm[1]);
  }
  for (let i = 0; i < 96; i += 2) {
    const q = at(i), qm = rows[Math.max(0, t - i - 1)].q;
    const d = [q[0] - qm[0], q[1] - qm[1]];
    f.push(Math.tanh(d[0] * 2e4), Math.tanh(d[1] * 2e4));
  }
  return f;
};
const LOG_REACH = LOGL[LOGL.length - 1];
// FIR + a DEGREE-5 POSE POLYNOMIAL: the mid-segment residual is the slow nonlinear
// droop surface, which a linear kernel can only linearize (measured: smooth ramps,
// 0/1 zero crossings across a segment, ~2.4e-2 floor on both channels)
const poly5 = (q) => {
  const u = (q[0] - CQ[0]) / 0.55, v = (q[1] - CQ[1]) / 0.55;
  const out = [];
  for (let i = 0; i <= 5; i++) for (let j = 0; j <= 5 - i; j++) out.push(u ** i * v ** j);
  return out;
};
const mkPoly = (L) => (rows, t) => {
  const f = mkFIR(L)(rows, t);
  for (const v of poly5(rows[t].q)) f.push(v);
  for (const v of poly5(rows[Math.max(0, t - 8)].q)) f.push(v);
  for (const v of poly5(rows[Math.max(0, t - 32)].q)) f.push(v);
  return f;
};
const run = (feat, L, ridge, { refits = 0 } = {}) => {
  const fitOn = (eSrcOf) => {
    const X = [], Y = [];
    for (const w of FIT) {
      const eSrc = eSrcOf(w);
      for (let t = L; t < w.length - 1; t++) {
        X.push(feat(w, t, (i) => eSrc[i]));
        Y.push(w[t + 1].e);
      }
    }
    return ridgeMulti(X, Y, ridge);
  };
  let W = fitOn((w) => w.map((r) => r.e));
  const predict = (f) => W.map((w) => { let s = 0; for (let i = 0; i < f.length; i++) s += w[i] * f[i]; return s; });
  // teacher-forced warmup seed (truth for the first L samples), free-run after: generous
  // only at the start, which the score skips — the CLASS question (does free-run track
  // over ~1600 samples of a program never seen) is answered the same; honest seeding
  // (the model's own fixed point at the held start) is the shipping build's job.
  const freeRun = (rows) => {
    const eh = [];
    for (let i = 0; i <= L; i++) eh.push(rows[i].e.slice());
    for (let t = L; t < rows.length - 1; t++) eh.push(predict(feat(rows, t, (i) => eh[i])));
    return eh;
  };
  for (let r = 0; r < refits; r++) {
    // scheduled refit: e-lags come from the model's own free-run over the fit records
    const pred1 = freeRun(w1), pred2 = freeRun(w2);
    W = fitOn((w) => (w === w1 ? pred1 : pred2));
  }
  const scoreOn = (rows) => {
    const eh = freeRun(rows);
    const err = [[], []], tr = [[], []];
    for (let t = L + 50; t < rows.length - 1; t++) {
      for (const c of [0, 1]) { err[c].push(eh[t][c] - rows[t].e[c]); tr[c].push(rows[t].e[c]); }
    }
    return [rms(err[0]) / rms(tr[0]), rms(err[1]) / rms(tr[1])];
  };
  return { wf: scoreOn(w3), pf: scoreOn(prog) };
};

const cell = (v) => (Number.isFinite(v) && v < 99 ? v.toFixed(3) : 'DIV');
console.log('variant                 wander free-run   program free-run');
for (const [name, feat, L, ridge, opts] of [
  ['poly L=384 r=1e-2  ', mkPoly(384), 384, 1e-2, {}],
  ['poly L=780 r=1e-2  ', mkPoly(780), 780, 1e-2, {}],
  ['poly L=780 r=1e0   ', mkPoly(780), 780, 1, {}],
]) {
  try {
    const { wf, pf } = run(feat, L, ridge, opts);
    console.log(`${name}   ${cell(wf[0])}/${cell(wf[1])}       ${cell(pf[0])}/${cell(pf[1])}`);
  } catch (err) {
    console.log(`${name}   ERROR ${err.message.slice(0, 60)}`);
  }
}
console.log('EXIT 0');
