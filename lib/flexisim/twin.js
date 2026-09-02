/**
 * @file THE COMPILED TWIN — lap-1 accuracy from a model, with the tracker only at
 * commissioning (plan §42).
 *
 * The mechanism, proven in three staged falsifiers before this file existed:
 *
 *  - IDENTIFY: fit the plant's parameters (joint stiffness K, link modulus E) by OUTPUT
 *    ERROR on ONE wander record — random open-path contouring at program rates, made on
 *    the live machine with the tracker, no program knowledge. The objective is an exact
 *    replay of the wander against candidate parameters; measured sharply conditioned
 *    (machine-zero at truth, 1e-4–2e-3 at the ±0.5/±0.005 neighbours).
 *  - COMPILE: at program load, simulate the fitted twin tracing the program, update a
 *    correction by frequency-domain 2x2 deconvolution against the twin's own step
 *    response (Tikhonov per harmonic, |H| cutoff opened once the guard holds), iterate
 *    under a MONOTONE BACKTRACKING guard. All software; zero machine laps; zero tracker.
 *  - PRE-ROLL: lap 1 is a causality problem — correcting a transient at t=0 needs
 *    correction energy BEFORE t=0 — so the compiled artifact starts with a dwell at the
 *    start pose where the correction pre-loads the flex. After it, lap 1 equals the
 *    settled laps: 2.45e-4/5.58e-4 rounded, 3.99e-4/2.18e-4 circle, 1.27e-3/2.10e-3
 *    sharp, against open loops of 1.3e-2/5.3e-3, 7.0e-3/3.1e-3, 2.2e-2/1.7e-2.
 *
 * WHY A SIMULATION AND NOT A REGRESSION: the elbow's measured memory is 6363–8649 steps
 * — longer than a program lap — so windowed features truncate it and closed laps alias
 * it (twenty falsifiers, §41). A simulation propagates state; there is no window and no
 * lap. And the parameter tolerance is wide (§42 stage B: K±10% free, E−10% still e-3),
 * which is what makes identification-from-data sufficient.
 *
 * NOTHING HERE READS THE APP'S SLIDER VALUES (the owner's constraint): the caller hands
 * `buildArm(params)` and the grid of candidate parameters; identification finds the
 *  machine in the data, so the sliders can be moved AFTER training to observe mismatch.
 */

/** J⁻¹(cmd)·(tool − fk(cmd)) — the same truth routing the rigs use, from the arm's
 * public API, at the COMMANDED pose. */
function routeTruth(arm, q1, q2) {
  const tool = arm.toolXY();
  const cx = arm.L1 * Math.cos(q1) + arm.L2 * Math.cos(q1 + q2);
  const cy = arm.L1 * Math.sin(q1) + arm.L2 * Math.sin(q1 + q2);
  const J = arm.jacobian(q1, q2);
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
  const ex = tool[0] - cx, ey = tool[1] - cy;
  return [(J[1][1] * ex - J[0][1] * ey) / det, (-J[1][0] * ex + J[0][0] * ey) / det];
}

/** Iterative radix-2 FFT, in place on {re, im}. N must be a power of two. */
function fft(re, im, inverse = false) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
}

/**
 * Drive an arm over a path from its current state, optionally with a compiled
 * correction, recording the routed truth per sample. The ONE drive loop every consumer
 * shares — a second copy of a drive loop is the defect class the rigs exist to prevent.
 *
 * @param {object} o
 *   arm, servo    the machine (caller owns construction and destruction)
 *   path          .at(k) / .lap
 *   sample        record cadence in steps
 *   steps         total plant steps to run (caller computes: ceil(lap·laps) for closed)
 *   du, preRoll   compiled correction over samples of [preRoll + trajectory], or null
 *   yield_        optional async fn awaited every yieldEvery steps (UI liveness)
 * @returns {Promise<{e: number[][], perLap: number[][]}>}
 */
export async function drivePath({ arm, servo, path, sample, steps, du = null, preRoll = 0,
  yield_ = null, yieldEvery = 4000 }) {
  const e = [], perLap = [];
  let acc = [0, 0], n = 0, lapNo = 0;
  const total = steps + preRoll * sample;
  for (let kk = 0; kk < total; kk++) {
    const inPre = kk < preRoll * sample;
    const k = inPre ? 0 : kk - preRoll * sample;
    const c = path.at(k);
    const [q1, q2] = arm.ik(c.x, c.y, true);
    const rt = inPre ? null : arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
    let d0 = 0, d1 = 0;
    if (du) {
      const s = kk / sample;
      const s0 = Math.min(du.length - 2, Math.floor(s)), fr = s - s0;
      d0 = du[s0][0] + fr * (du[s0 + 1][0] - du[s0][0]);
      d1 = du[s0][1] + fr * (du[s0 + 1][1] - du[s0][1]);
    }
    const tau = servo.torques([
      { theta: q1 + d0, omega: inPre ? 0 : rt.dq[0], alpha: inPre ? 0 : rt.ddq[0] },
      { theta: q2 + d1, omega: inPre ? 0 : rt.dq[1], alpha: inPre ? 0 : rt.ddq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (kk % sample === 0) {
      e.push(routeTruth(arm, q1, q2));
      if (!inPre) {
        const t = e[e.length - 1];
        acc[0] += t[0] * t[0]; acc[1] += t[1] * t[1]; n++;
        const now = Math.floor(k / path.lap);
        if (now !== lapNo) {
          perLap.push([Math.sqrt(acc[0] / n), Math.sqrt(acc[1] / n)]);
          acc = [0, 0]; n = 0; lapNo = now;
        }
      }
    }
    if (yield_ && kk % yieldEvery === 0) await yield_();
  }
  if (n > 10) perLap.push([Math.sqrt(acc[0] / n), Math.sqrt(acc[1] / n)]);
  return { e, perLap };
}

/**
 * Identify plant parameters by output error: exact replay of a recorded drive against
 * candidate parameters, coarse grid then `refine` rings at halving spacing. The grid is
 * the CALLER'S domain (the app passes its slider ranges) — nothing here knows or reads
 * the machine's true settings.
 *
 * @param {object} o
 *   record        { e } from drivePath on the REAL machine over `path` (tracker data)
 *   path, sample  the same trajectory, replayed exactly
 *   buildArm      async (params) => { arm, servo } at candidate params; caller destroys
 *   destroyArm    async ({arm, servo}) — teardown (lattice links must be destroyed)
 *   grid          { K: number[], E: number[] } candidate values spanning the domain
 *   refine        refinement rings (default 2)
 *   onProgress    (msg) => {}
 * @returns {Promise<{K:number, E:number, J:number, evals:Array}>}
 */
export async function identifyTwin({ record, path, sample, buildArm, destroyArm,
  grid, refine = 2, yield_ = null, onProgress = null }) {
  const steps = record.e.length * sample;
  const evals = [];
  const seen = new Set();
  let best = null;
  const evalAt = async (K, E) => {
    const key = `${K.toFixed(4)}|${E.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const m = await buildArm({ K, E });
    const sim = await drivePath({ arm: m.arm, servo: m.servo, path, sample, steps, yield_ });
    await destroyArm(m);
    let sd = 0, n = 0;
    const L = Math.min(sim.e.length, record.e.length);
    for (let i = 0; i < L; i++) {
      sd += (sim.e[i][0] - record.e[i][0]) ** 2 + (sim.e[i][1] - record.e[i][1]) ** 2;
      n++;
    }
    const J = Math.sqrt(sd / n);
    evals.push({ K, E, J });
    if (!best || J < best.J) best = { K, E, J };
    if (onProgress) onProgress(`K=${K.toPrecision(4)} E=${E.toPrecision(4)} → ${J.toExponential(2)}${best.J === J ? ' *' : ''}`);
  };
  for (const K of grid.K) for (const E of grid.E) await evalAt(K, E);
  // ring spacing from the coarse grid's LOCAL spacing around the best (log-safe)
  let dK = ringStep(grid.K, best.K), dE = ringStep(grid.E, best.E);
  for (let r = 0; r < refine; r++) {
    dK /= 2; dE /= 2;
    const centre = { ...best };
    for (const sK of [-1, 0, 1]) for (const sE of [-1, 0, 1]) {
      if (!sK && !sE) continue;
      const K = centre.K + sK * dK, E = centre.E + sE * dE;
      if (K > 0 && E > 0) await evalAt(K, E);
    }
  }
  return { ...best, evals };
}

function ringStep(values, at) {
  const v = [...values].sort((a, b) => a - b);
  let bi = 0;
  for (let i = 0; i < v.length; i++) if (Math.abs(v[i] - at) < Math.abs(v[bi] - at)) bi = i;
  const lo = v[Math.max(0, bi - 1)], hi = v[Math.min(v.length - 1, bi + 1)];
  return Math.max((hi - lo) / 2, at * 0.02);
}

/**
 * Measure the twin's 2x2 truth response to a ref step at the path's start pose, at
 * sample cadence. One measurement serves every compile at these parameters.
 */
export async function twinResponse({ buildArm, destroyArm, path, sample,
  settleSteps = 30000, respSteps = 12000, stepSize = 2e-3, yield_ = null }) {
  const H = [];
  for (const ch of [0, 1]) {
    const m = await buildArm();
    const c0 = path.at(0);
    const q0 = m.arm.ik(c0.x, c0.y, true);
    for (let k = 0; k < settleSteps; k++) {
      const tau = m.servo.torques([{ theta: q0[0], omega: 0, alpha: 0 }, { theta: q0[1], omega: 0, alpha: 0 }]);
      m.arm.step(tau[0], tau[1], 1);
      if (yield_ && k % 4000 === 0) await yield_();
    }
    const base = routeTruth(m.arm, q0[0], q0[1]);
    const resp = [];
    for (let k = 0; k < respSteps; k++) {
      const refs = [{ theta: q0[0] + (ch === 0 ? stepSize : 0), omega: 0, alpha: 0 },
        { theta: q0[1] + (ch === 1 ? stepSize : 0), omega: 0, alpha: 0 }];
      const tau = m.servo.torques(refs);
      m.arm.step(tau[0], tau[1], 1);
      if (k % sample === 0) {
        const t = routeTruth(m.arm, q0[0], q0[1]);
        resp.push([(t[0] - base[0]) / stepSize, (t[1] - base[1]) / stepSize]);
      }
      if (yield_ && k % 4000 === 0) await yield_();
    }
    await destroyArm(m);
    H.push(resp);
  }
  return H;
}

/**
 * Compile a program through the twin: guarded frequency-domain deconvolution iterated
 * through the nonlinear simulation, pre-roll included. Returns the compiled artifact.
 *
 * @param {object} o
 *   buildArm/destroyArm   the FITTED twin's constructor (parameters already applied)
 *   path, sample          the program
 *   H                     from twinResponse at the same parameters
 *   laps (3), preRoll (1500), iters (11), scale (0.9)
 *   cutoffs               [primary, opened] |H| cutoff fractions (default [0.02, 0.008]);
 *                         opened after `openAt` iterations (default 7)
 * @returns {Promise<{du, preRoll, report}>}
 */
export async function compileTwin({ buildArm, destroyArm, path, sample, H,
  laps = 3, preRoll = 1500, iters = 11, openAt = 7, scale = 0.9,
  cutoffs = [0.02, 0.008], lambda = 1e-3, yield_ = null, onProgress = null }) {
  const steps = Math.ceil(path.lap * laps);
  const run = async (du) => {
    const m = await buildArm();
    const out = await drivePath({ arm: m.arm, servo: m.servo, path, sample, steps, du, preRoll, yield_ });
    await destroyArm(m);
    let s = 0;
    for (const t of out.e) s += t[0] * t[0] + t[1] * t[1];
    out.rms = Math.sqrt(s / out.e.length);
    return out;
  };
  let cur = await run(null);
  const Ls = cur.e.length;
  let N = 1;
  while (N < Ls + H[0].length + 64) N <<= 1;
  // frequency response from the differenced step response, padded to N
  const Hf = [];
  for (const cin of [0, 1]) {
    const out = [];
    for (const cout of [0, 1]) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let k = 0; k < H[cin].length; k++) {
        const prev = k ? H[cin][k - 1][cout] : 0;
        re[k] = H[cin][k][cout] - prev;
      }
      fft(re, im);
      out.push({ re, im });
    }
    Hf.push(out);
  }
  let hMax = 0;
  for (let f = 0; f < N; f++) {
    hMax = Math.max(hMax, Math.hypot(Hf[0][0].re[f], Hf[0][0].im[f]) + Math.hypot(Hf[1][1].re[f], Hf[1][1].im[f]));
  }
  let du = Array.from({ length: Ls }, () => [0, 0]);
  let bestDu = du.map((d) => d.slice());
  let best = cur.rms, sc = scale;
  const report = { iters: [], openLoop: cur.perLap.slice() };
  for (let it = 1; it <= iters; it++) {
    const cut = (it <= openAt ? cutoffs[0] : cutoffs[1]) * hMax;
    const E = [0, 1].map((c) => {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let k = 0; k < Ls; k++) re[k] = cur.e[k][c];
      fft(re, im);
      return { re, im };
    });
    const D = [0, 1].map(() => ({ re: new Float64Array(N), im: new Float64Array(N) }));
    for (let f = 0; f < N; f++) {
      const gain = Math.hypot(Hf[0][0].re[f], Hf[0][0].im[f]) + Math.hypot(Hf[1][1].re[f], Hf[1][1].im[f]);
      if (gain < cut) continue;
      // solve sum_j H[j][c](f)·du_j(f) = −e_c(f), Tikhonov-regularized 2x2 complex
      const cm = (pr, pi, qr, qi) => [pr * qr - pi * qi, pr * qi + pi * qr];
      const M = [[[Hf[0][0].re[f], Hf[0][0].im[f]], [Hf[1][0].re[f], Hf[1][0].im[f]]],
                 [[Hf[0][1].re[f], Hf[0][1].im[f]], [Hf[1][1].re[f], Hf[1][1].im[f]]]];
      const r = [[-E[0].re[f], -E[0].im[f]], [-E[1].re[f], -E[1].im[f]]];
      const A = [[[0, 0], [0, 0]], [[0, 0], [0, 0]]];
      const b = [[0, 0], [0, 0]];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        for (let c = 0; c < 2; c++) {
          const p = cm(M[c][i][0], -M[c][i][1], M[c][j][0], M[c][j][1]);
          A[i][j][0] += p[0]; A[i][j][1] += p[1];
        }
      }
      for (let i = 0; i < 2; i++) for (let c = 0; c < 2; c++) {
        const p = cm(M[c][i][0], -M[c][i][1], r[c][0], r[c][1]);
        b[i][0] += p[0]; b[i][1] += p[1];
      }
      const lam = lambda * (A[0][0][0] + A[1][1][0] + 1e-30);
      A[0][0][0] += lam; A[1][1][0] += lam;
      const det = [A[0][0][0] * A[1][1][0] - A[0][0][1] * A[1][1][1] - (A[0][1][0] * A[1][0][0] - A[0][1][1] * A[1][0][1]),
        A[0][0][0] * A[1][1][1] + A[0][0][1] * A[1][1][0] - (A[0][1][0] * A[1][0][1] + A[0][1][1] * A[1][0][0])];
      const dm = det[0] * det[0] + det[1] * det[1] + 1e-30;
      const di = [det[0] / dm, -det[1] / dm];
      const n0 = [A[1][1][0] * b[0][0] - A[1][1][1] * b[0][1] - (A[0][1][0] * b[1][0] - A[0][1][1] * b[1][1]),
        A[1][1][0] * b[0][1] + A[1][1][1] * b[0][0] - (A[0][1][0] * b[1][1] + A[0][1][1] * b[1][0])];
      const n1 = [A[0][0][0] * b[1][0] - A[0][0][1] * b[1][1] - (A[1][0][0] * b[0][0] - A[1][0][1] * b[0][1]),
        A[0][0][0] * b[1][1] + A[0][0][1] * b[1][0] - (A[1][0][0] * b[0][1] + A[1][0][1] * b[0][0])];
      const x0 = cm(di[0], di[1], n0[0], n0[1]);
      const x1 = cm(di[0], di[1], n1[0], n1[1]);
      D[0].re[f] = x0[0]; D[0].im[f] = x0[1];
      D[1].re[f] = x1[0]; D[1].im[f] = x1[1];
    }
    for (const c of [0, 1]) fft(D[c].re, D[c].im, true);
    const trial = du.map((d, k) => [d[0] + sc * D[0].re[k], d[1] + sc * D[1].re[k]]);
    const res = await run(trial);
    if (res.rms < best) {
      du = trial; cur = res; best = res.rms;
      bestDu = du.map((d) => d.slice());
      report.iters.push({ it, scale: sc, rms: res.rms, perLap: res.perLap });
      if (onProgress) onProgress(`compile iter ${it}: rms ${res.rms.toExponential(2)}`);
    } else {
      sc /= 2;
      report.iters.push({ it, scale: sc, rms: res.rms, reverted: true });
      if (onProgress) onProgress(`compile iter ${it}: regressed, scale → ${sc.toFixed(2)}`);
      if (sc < 0.08) break;
    }
  }
  report.rms = best;
  return { du: bestDu, preRoll, sample, report };
}

/** Sample-indexed accessor over a compiled artifact for a host's own drive loop:
 * f(totalStepsSinceEngage) → [d0, d1]. The host restarts its program at engage so the
 * pre-roll and the trajectory line up; past the compiled span the settled tail lap
 * repeats (the artifact's own last lap, tiled). */
export function applyCompiled({ du, preRoll, sample, lapSamples }) {
  const span = du.length;
  const tail0 = Math.max(0, span - lapSamples);
  return (k) => {
    let s = k / sample;
    if (s >= span - 1) s = tail0 + ((s - tail0) % lapSamples);
    const s0 = Math.min(span - 2, Math.floor(s)), fr = s - s0;
    return [du[s0][0] + fr * (du[s0 + 1][0] - du[s0][0]),
      du[s0][1] + fr * (du[s0 + 1][1] - du[s0][1])];
  };
}
