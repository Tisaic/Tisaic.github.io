/**
 * @file A SOFT SENSOR FOR THE TOOL ERROR, FITTED AT COMMISSIONING AND READ FROM THE MOTOR SIDE.
 *
 * WHY IT EXISTS (task #73). Every number in this project is obtained with GROUND-TRUTH TOOL
 * POSITION available at commissioning — on a real machine a laser tracker, which is a metrology
 * service and machine downtime. ONLINE ADAPTATION is the largest measured lever on the
 * retirement's replacement list (9 of 9 cells improve, geometric 1.79x, and the two programs it
 * never ran gain more than the one it did) and it ships as a COMMISSIONING-ONLY phase for exactly
 * one reason: `pilot.observe(measured, truth)` wants that tracker at every sample. If the truth
 * could be ESTIMATED from signals the deployed machine already has, adaptation would be legal for
 * ever and the project's largest commercial gap would shrink.
 *
 * WHAT IS ALREADY MEASURED AND IS NOT RE-DERIVED HERE (plan §52.23): every hidden state of this
 * arm is observable from the motor side across programs at R² 0.9-0.99; the map from those states
 * to the TOOL is geometry, so it needs a POSE-SCHEDULED block; and CHAINED — instruments at
 * commissioning only, nothing bolted on at deploy — the composition delivers the SECOND channel at
 * 0.85-0.95 and the first at 0.2-0.6. This module is that chain, built live so it can be read
 * inside a run rather than offline afterwards.
 *
 * WHY §52.26 IS NOT REPEATED. That section routed a soft sensor into the pilot's FEEDBACK layer
 * and it failed for a reason that has nothing to do with the sensor — this gearbox answers ~951
 * steps later, so feedback through the command cannot reach what it predicts. Correct conclusion,
 * wrong consumer. ADAPTATION does not have to react inside the ring: it updates a model between
 * laps, and a 951-step lag is nothing to it.
 *
 * THE PROTOCOL THIS MODULE ENFORCES, because the cheating versions are easy and silent:
 *   - it is FITTED on programs the adaptation will not run on, and scored on the one it will.
 *     Fitted and scored on the same program it reads 0.9-1.0 for anything (rule 36), which is
 *     §52.23's own memory control.
 *   - it reads MOTOR-SIDE SIGNALS AND THE COMMAND ONLY at estimate time. The instruments
 *     (a load-side encoder's wind-up, a strain gauge's bend) are stage 1's TRUTH and are never
 *     read when estimating — that is what "chained" means.
 *   - `mode: 'direct'` is the control: one stage, the same features, no instrument anywhere, so
 *     what the chain BUYS is measured rather than assumed (rule 9, both halves).
 *
 * THE FEATURE SETS ARE `test/pilot/observe.mjs`'s OWN GROUPS, at its own offsets — `cmd`,
 * `m@lag` and `sched_m0`/`sched_inst` — because the numbers this module is checked against were
 * measured through those and a second set of offsets would make the comparison meaningless
 * (rule 20). What is new is only that they are evaluated causally, one row at a time, from a ring.
 */
import { solveRidge } from '../../../lib/pilot/pilot.js';

// The offsets of `observe.mjs`'s `cmd` group and its `m@lag` ladder, in PILOT SAMPLES. The
// estimator multiplies by the pilot's own stride where it needs raw steps, exactly as that file
// does, so the window is the same piece of geometry.
const CMD_OFFS = [-256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256];
const LAGS = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];

/** The pose's six trig terms, from the newest motor-side angles — `observe.mjs`'s `trigOf`. */
function trigOf(m) {
  return [Math.cos(m[0]), Math.sin(m[0]), Math.cos(m[1]), Math.sin(m[1]),
    Math.cos(m[0] + m[1]), Math.sin(m[0] + m[1])];
}
const sched = (v, tg) => { const out = []; for (const a of v) for (const b of tg) out.push(a * b); return out; };

/**
 * ONE FEATURE ROW, from a ring of past motor-side samples and a reference reader.
 * `mAt(l)` returns the measured vector `l` PILOT SAMPLES ago (0 = newest); `qAt(o)` the commanded
 * joint reference `o` pilot samples from now. Every term is causal in `m` and reads the command
 * ahead, which is what the deployed machine has.
 */
function baseRow(mAt, qAt) {
  const m0 = mAt(0);
  if (!m0) return null;
  const f = [1];
  const q0 = qAt(0);
  f.push(q0[0], q0[1]);
  for (const o of CMD_OFFS) {
    if (o === 0) continue;
    const qo = qAt(o);
    f.push(qo[0] - q0[0], qo[1] - q0[1]);
  }
  for (const l of LAGS) {
    const ml = mAt(l);
    for (let i = 0; i < 6; i++) f.push(ml[i]);
  }
  // `sched_m0`: the newest motor-side sample, the two angles taken as DEVIATIONS from the
  // command so the block carries the error and not the pose twice, multiplied by the pose's
  // own sines and cosines. Deployable — nothing in it is an instrument.
  const tg = trigOf(m0);
  for (const v of sched([m0[0] - q0[0], m0[1] - q0[1], m0[2], m0[3], m0[4], m0[5]], tg)) f.push(v);
  return f;
}

/** Stage 2's extra block: the ESTIMATED hidden states, pose-scheduled (`sched_inst`). */
function schedStates(est, m0) { return sched(est, trigOf(m0)); }

/**
 * ONE NORMAL MATRIX, MANY TARGETS, MANY RIDGES.
 *
 * `solveRidge` accumulates `X'X` per call and takes one target, and the ridge selection below
 * needs 5 states x 2 channels x a ladder of ridges per fold — which would be a hundred
 * accumulations of the same matrix. This accumulates it ONCE and re-factors per ridge, which is
 * the cheap half by three orders of magnitude. It is checked against `solveRidge` on the first
 * fit of every run (rule 15: a second route that does not share the mistake), and the harness
 * prints the agreement, so a fast path that quietly disagrees cannot pass for the shared one.
 */
function normalEq(X, Ys) {
  const n = X[0].length, m = X.length, nt = Ys.length;
  const A = Array.from({ length: n }, () => new Float64Array(n));
  const B = Array.from({ length: nt }, () => new Float64Array(n));
  for (let r = 0; r < m; r++) {
    const xr = X[r];
    for (let i = 0; i < n; i++) {
      const xi = xr[i];
      if (xi === 0) continue;
      for (let j = i; j < n; j++) A[i][j] += xi * xr[j];
      for (let t = 0; t < nt; t++) B[t][i] += xi * Ys[t][r];
    }
  }
  let scale = 0;
  for (let i = 0; i < n; i++) scale = Math.max(scale, A[i][i]);
  return { A, B, n, scale: scale || 1 };
}
function solveAt({ A, B, n, scale }, ridge) {
  const lam = ridge * scale;
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s2 = (j <= i ? A[j][i] : A[i][j]) + (i === j ? lam : 0);
    for (let t = 0; t < j; t++) s2 -= L[i][t] * L[j][t];
    if (i === j) L[i][i] = Math.sqrt(Math.max(s2, 1e-300));
    else L[i][j] = s2 / L[j][j];
  }
  return B.map((b) => {
    const z = new Float64Array(n), w = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s2 = b[i];
      for (let t = 0; t < i; t++) s2 -= L[i][t] * z[t];
      z[i] = s2 / L[i][i];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s2 = z[i];
      for (let t = i + 1; t < n; t++) s2 -= L[t][i] * w[t];
      w[i] = s2 / L[i][i];
    }
    return w;
  });
}
const dotv = (w, f) => { let s = 0; for (let i = 0; i < f.length; i++) s += w[i] * f[i]; return s; };
const r2of = (pred, truth) => {
  let mu = 0;
  for (const t of truth) mu += t;
  mu /= truth.length;
  let sr = 0, ss = 0;
  for (let i = 0; i < truth.length; i++) { sr += (truth[i] - pred[i]) ** 2; ss += (truth[i] - mu) ** 2; }
  return 1 - sr / Math.max(1e-300, ss);
};

/** The ridge ladder, a DESIGN and not a plant's number — geometric, no constant carried in. */
const RIDGES = [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1];

/**
 * FIT THE SENSOR ON TRACES TAKEN WITH THE TRACKER ON.
 *
 * @param {Array} traces `deployOn`'s own `trace` arrays — one per fitting program, each entry
 *   `{ m, e, cmd, x }` at one pilot sample: the measured vector, the joint-space tool error, the
 *   commanded joint reference, and the commissioning instruments.
 * @param {object} o
 * @param {'chain'|'direct'} o.mode  the two-stage chain, or one stage as the control.
 * @param {number} o.ridge  relative to the normal matrix's own scale, as `solveRidge` takes it.
 * @param {number} o.skip   samples dropped from the head of each trace, so no row reads a ring
 *   that is still filling (rule 13 — a window over a transient describes the transient).
 * @returns {{row, predict, nFeat, nRows, inSample}} `predict(mAt, qAt)` is the deployed reader.
 */
export function fitSoftSensor(traces, { mode = 'chain', ridge = null, skip = 0, verbose = false } = {}) {
  const need = Math.max(...LAGS);
  const rowsOf = (tr) => {
    const out = [];
    const mAtOf = (k) => (l) => tr[Math.max(0, k - l)].m;
    const qAtOf = (k) => (o) => tr[Math.max(0, Math.min(tr.length - 1, k + o))].cmd;
    for (let k = Math.max(need, skip); k < tr.length; k++) {
      out.push({ f: baseRow(mAtOf(k), qAtOf(k)), t: tr[k].e, x: tr[k].x, m0: tr[k].m });
    }
    return out;
  };
  const byProg = traces.map(rowsOf);
  const all = byProg.flat();
  if (!all.length) throw new Error('softsense: no fitting rows');
  const stateOf = (x) => [x.wu[0] * 1e2, x.wu[1] * 1e2, x.w[0] * 1e2, x.w[1] * 1e2, x.s1 * 1e2];

  /** Fit both stages on `rows` at one ridge; returns a predictor over a prepared row. */
  const fitAt = (rows, lam) => {
    const X1 = rows.map((r) => r.f);
    let W1 = null;
    if (mode === 'chain') {
      const Ys = [0, 1, 2, 3, 4].map((sIdx) => rows.map((r) => stateOf(r.x)[sIdx]));
      W1 = solveAt(normalEq(X1, Ys), lam);
    }
    const st2 = (f, m0) => (mode === 'chain'
      ? f.concat(schedStates(W1.map((w) => dotv(w, f)), m0))
      : f);
    const X2 = rows.map((r) => st2(r.f, r.m0));
    const W2 = solveAt(normalEq(X2, [rows.map((r) => r.t[0]), rows.map((r) => r.t[1])]), lam);
    return { W1, W2, st2 };
  };

  // ---- THE RIDGE IS CHOSEN LEAVE-ONE-PROGRAM-OUT, WHICH IS THE ONLY HONEST FOLD HERE.
  //
  // Rows a few samples apart read most of the same window, so a shuffled row split validates
  // against data it has effectively seen (`distil.js`'s own reason for contiguous folds with a
  // gap). Whole PROGRAMS are the natural fold and they are also the quantity that matters: this
  // sensor will be used on a program it was not fitted on, so the selection criterion is the
  // thing it is being selected for. The number it reports is directly comparable to §52.23's own
  // LOPO column, which is why it is printed rather than merely used.
  let lopo = null, picked = ridge;
  if (ridge === null && byProg.length > 1) {
    const table = RIDGES.map((lam) => {
      const per = [];
      for (let h = 0; h < byProg.length; h++) {
        const tr = byProg.filter((_, i) => i !== h).flat(), te = byProg[h];
        const { W2, st2 } = fitAt(tr, lam);
        per.push([0, 1].map((c) => r2of(te.map((r) => dotv(W2[c], st2(r.f, r.m0))), te.map((r) => r.t[c]))));
      }
      const mean = [0, 1].map((c) => per.reduce((a, b) => a + b[c], 0) / per.length);
      return { lam, mean, score: (mean[0] + mean[1]) / 2 };
    });
    table.sort((a, b) => b.score - a.score);
    picked = table[0].lam;
    lopo = { picked, best: table[0].mean, table: table.slice().sort((a, b) => a.lam - b.lam) };
  }
  if (picked === null) picked = 1e-4;

  const { W1, W2, st2 } = fitAt(all, picked);
  // THE CONTROL (rule 15): the shared `solveRidge` on the same rows and the same ridge must give
  // the same stage-2 channel-0 weights. A fast accumulator that disagrees would move every number
  // below and nothing else here would notice.
  let agree = null;
  if (verbose) {
    const Xc = all.map((r) => st2(r.f, r.m0));
    const wRef = solveRidge(Xc, all.map((r) => r.t[0]), picked);
    let num = 0, den = 0;
    for (let i = 0; i < wRef.length; i++) { num += (wRef[i] - W2[0][i]) ** 2; den += wRef[i] * wRef[i]; }
    agree = Math.sqrt(num / Math.max(1e-300, den));
  }

  const X2all = all.map((r) => st2(r.f, r.m0));
  const inSample = [0, 1].map((c) => r2of(X2all.map((x) => dotv(W2[c], x)), all.map((r) => r.t[c])));

  return {
    nFeat: X2all[0].length, nRows: all.length, nProgs: byProg.length, inSample, lopo, ridge: picked,
    mode, agree,
    predict: (mAt, qAt) => {
      const f = baseRow(mAt, qAt);
      if (!f) return null;
      const r2 = st2(f, mAt(0));
      return [dotv(W2[0], r2), dotv(W2[1], r2)];
    },
  };
}

/**
 * THE LIVE READER `deployOn`'s `softTruth` port takes: it owns the ring, so the estimator is fed
 * one sample at a time exactly as an installation would feed it, and cannot accidentally see a
 * future sample the way an offline row builder can.
 */
export function liveReader(sensor, { warm = Math.max(...LAGS) } = {}) {
  const ring = [];
  let n = 0;
  return (measured, kSamp, refAt) => {
    ring.push(measured.slice());
    if (ring.length > 4 * warm + 8) ring.splice(0, warm);
    n++;
    const mAt = (l) => ring[Math.max(0, ring.length - 1 - l)];
    const qAt = (o) => refAt(kSamp + o);
    // NOT A ZERO AND NOT A GUESS: until the ring holds the longest lag the estimator has no
    // reading, and an unmeasured sample is not a measured zero (rule 25). `null` is what the
    // pilot's own observe path already means by "no truth this sample".
    if (n <= warm) return null;
    return sensor.predict(mAt, qAt);
  };
}

/** Pearson R² of an estimate against the truth it stands in for, per channel, streaming. */
export function r2Meter() {
  const rows = [];
  return {
    push: (est, truth) => { if (est) rows.push([est.slice(), truth.slice()]); },
    report: () => [0, 1].map((c) => {
      if (rows.length < 2) return NaN;
      let mu = 0;
      for (const [, t] of rows) mu += t[c];
      mu /= rows.length;
      let sr = 0, ss = 0;
      for (const [e, t] of rows) { sr += (t[c] - e[c]) ** 2; ss += (t[c] - mu) ** 2; }
      return 1 - sr / Math.max(1e-300, ss);
    }),
    n: () => rows.length,
    /** The rms of the estimate and of the truth, so a fit that shrank to nothing is visible. */
    scale: () => [0, 1].map((c) => {
      let se = 0, st = 0;
      for (const [e, t] of rows) { se += e[c] * e[c]; st += t[c] * t[c]; }
      return [Math.sqrt(se / Math.max(1, rows.length)), Math.sqrt(st / Math.max(1, rows.length))];
    }),
  };
}
