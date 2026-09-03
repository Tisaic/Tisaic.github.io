// SUBSPACE GAUSS-NEWTON on the refined tile, against the twin. The gradient
// instrument measured: the sim objective is EXACTLY deterministic, and at the shipped
// refine's 3.12e-3 every probed direction still carries slope 1e3-1e5 above the
// repeatability floor (largest at the corner bins) — the six stalled schemes failed on
// DIRECTION, the objective is not exhausted. Since the objective is deterministic,
// every eval is a permanent constraint: probe M directions by central differences,
// collect measured response columns J*D_i, solve min ||R0 + C a||^2 + lambda||a||^2,
// step with backtracking, re-centre, repeat. Predicted rms is printed BEFORE each step
// (rule 27) so the machine grades the local-linear model (rule 16).
import { compileTwin, refineCompiled, applyCompiled } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { twinResponse, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500, BINS = 1024, nCh = 2;
const ROUNDS = +(process.env.SGN_ROUNDS || 4);
const M = +(process.env.SGN_M || 20);
const DELTA = 4e-3;
const path = mkPath('sharp', 0.004);
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);
const sims = armSimulators({ buildArm: () => makeArm(), destroyArm: destroy, home, sample: SS });

console.log('probe + compile + shipped refine…');
const H = await twinResponse({ buildArm: () => makeArm(), destroyArm: destroy, path, sample: SS });
const res = await compileTwin({ simulate: sims.compileSim(path, { laps: 5, preRoll: PRE }), H, iters: 11 });
const ref = await refineCompiled({ simulate: sims.compileSim(path, { laps: 4, preRoll: PRE }),
  H, du: res.du, sample: SS, lapSteps: path.lap, preRoll: PRE });
console.log(`refined ${ref.report.rms.toExponential(3)} (shipped class 3.12e-3)`);

const lapSamples = path.lap / SS;
const handoff = PRE + lapSamples;
let T = Array.from({ length: BINS }, (_, p) => ref.f((handoff + (p / BINS) * lapSamples) * SS));
const base = applyCompiled({ du: res.du, sample: SS, lapSteps: path.lap, preRoll: PRE });
const mkF = (tile) => (k) => {
  const s = k / SS;
  if (s <= handoff) return base(k);
  const x = (((s - handoff) % lapSamples) / lapSamples) * BINS;
  const p0 = Math.floor(x) % BINS, p1 = (p0 + 1) % BINS, fr = x - Math.floor(x);
  return [tile[p0][0] + fr * (tile[p1][0] - tile[p0][0]), tile[p0][1] + fr * (tile[p1][1] - tile[p0][1])];
};
const evalTile = async (tile) => {
  const e = await sims.compileSim(path, { laps: 4, preRoll: PRE })(mkF(tile));
  const start = Math.ceil(handoff + lapSamples);
  const R = new Float64Array(BINS * nCh);
  const W = new Array(BINS).fill(0);
  let s2 = 0, n2 = 0;
  for (let s = start; s < e.length; s++) {
    const p = Math.floor((((s - handoff) % lapSamples) / lapSamples) * BINS) % BINS;
    for (let c = 0; c < nCh; c++) { R[p * nCh + c] += e[s][c]; s2 += e[s][c] ** 2; }
    W[p]++; n2++;
  }
  for (let p = 0; p < BINS; p++) {
    if (W[p]) { for (let c = 0; c < nCh; c++) R[p * nCh + c] /= W[p]; continue; }
    const q = (p + BINS - 1) % BINS;
    for (let c = 0; c < nCh; c++) R[p * nCh + c] = R[q * nCh + c];
  }
  return { rms: Math.sqrt(s2 / (n2 * nCh)), R };
};

let z = 424242 >>> 0;
const rnd = () => ((z = (z * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const hatDir = (pc, c, w = 3) => {
  const D = new Float64Array(BINS * nCh);
  for (let d = -w; d <= w; d++) D[((pc + d + BINS) % BINS) * nCh + c] = 1 - Math.abs(d) / (w + 1);
  let s2 = 0;
  for (let i = 0; i < D.length; i++) s2 += D[i] * D[i];
  const n = 1 / Math.sqrt(s2 / D.length);
  for (let i = 0; i < D.length; i++) D[i] *= n;
  return D;
};
const smoothDir = (hMax) => {
  const D = new Float64Array(BINS * nCh);
  for (let c = 0; c < nCh; c++) for (let h = 1; h <= hMax; h += 1 + Math.floor(rnd() * 3)) {
    const a = rnd() - 0.5, ph = 2 * Math.PI * rnd();
    for (let p = 0; p < BINS; p++) D[p * nCh + c] += a * Math.cos((2 * Math.PI * h * p) / BINS + ph);
  }
  let s2 = 0;
  for (let i = 0; i < D.length; i++) s2 += D[i] * D[i];
  const n = 1 / Math.sqrt(s2 / D.length);
  for (let i = 0; i < D.length; i++) D[i] *= n;
  return D;
};
// residual-weighted bin sampling: heavier where R^2 is
const sampleBin = (R) => {
  let tot = 0;
  for (let i = 0; i < R.length; i++) tot += R[i] * R[i];
  let x = rnd() * tot;
  for (let p = 0; p < BINS; p++) for (let c = 0; c < nCh; c++) {
    x -= R[p * nCh + c] ** 2;
    if (x <= 0) return { p, c };
  }
  return { p: BINS - 1, c: nCh - 1 };
};
const addDir = (tile, D, s) => tile.map((r, p) => [r[0] + s * D[p * nCh], r[1] + s * D[p * nCh + 1]]);

let { rms: f0, R: R0 } = await evalTile(T);
console.log(`start f0 ${f0.toExponential(4)}  (target 2.7e-3 for 50x, floor ~4.3e-4)`);
let evals = 1;
const t0 = Date.now();
// v2: columns ACCUMULATE across rounds — the objective is deterministic, every probe
// pair stays a constraint (round 0's step verified the local-linear model to 0.4%, so
// carrying columns across a re-centre is Broyden-grade, and backtracking guards it) —
// and each round's first directions are STRUCTURED: the binned residual itself, raw and
// lead-shifted (the classic ILC direction, with its true response MEASURED rather than
// assumed from H), before residual-weighted hats fill the rest.
const dirsAll = [], C = [];
const residDir = (R, shift) => {
  const D = new Float64Array(BINS * nCh);
  for (let p = 0; p < BINS; p++) for (let c = 0; c < nCh; c++)
    D[p * nCh + c] = R[((p + shift) % BINS) * nCh + c];
  let s2 = 0;
  for (let i = 0; i < D.length; i++) s2 += D[i] * D[i];
  const n = 1 / Math.sqrt(s2 / D.length);
  for (let i = 0; i < D.length; i++) D[i] *= n;
  return D;
};
// lead in bins, from the grad instrument's H half-rise (~114 samples)
const LEADB = Math.round((114 / lapSamples) * BINS);
for (let round = 0; round < ROUNDS; round++) {
  const dirs = [];
  if (round < 3) {
    dirs.push(residDir(R0, LEADB));
    dirs.push(residDir(R0, Math.round(LEADB / 2)));
    dirs.push(residDir(R0, 0));
  }
  while (dirs.length < M) {
    if (dirs.length % 5 === 4) dirs.push(smoothDir(128));
    else { const { p, c } = sampleBin(R0); dirs.push(hatDir(p, c)); }
  }
  // central-difference response columns, appended to the accumulated set
  for (const D of dirs) {
    const rp = (await evalTile(addDir(T, D, DELTA))).R;
    const rm = (await evalTile(addDir(T, D, -DELTA))).R;
    evals += 2;
    const col = new Float64Array(BINS * nCh);
    for (let i = 0; i < col.length; i++) col[i] = (rp[i] - rm[i]) / (2 * DELTA);
    dirsAll.push(D); C.push(col);
  }
  // solve min ||R0 + C a||^2 + lam ||a||^2 over ALL accumulated columns
  const MA = C.length;
  const G = Array.from({ length: MA }, () => new Float64Array(MA));
  const g = new Float64Array(MA);
  for (let i = 0; i < MA; i++) {
    for (let j = i; j < MA; j++) {
      let s = 0;
      for (let k = 0; k < BINS * nCh; k++) s += C[i][k] * C[j][k];
      G[i][j] = s; G[j][i] = s;
    }
    let s = 0;
    for (let k = 0; k < BINS * nCh; k++) s += C[i][k] * R0[k];
    g[i] = -s;
  }
  let tr = 0;
  for (let i = 0; i < MA; i++) tr += G[i][i];
  const lam = 1e-3 * tr / MA;
  const A = G.map((row, i) => { const r = Array.from(row); r[i] += lam; return r; });
  const rhs = Array.from(g);
  for (let c = 0; c < MA; c++) {
    let piv = c;
    for (let i = c + 1; i < MA; i++) if (Math.abs(A[i][c]) > Math.abs(A[piv][c])) piv = i;
    [A[c], A[piv]] = [A[piv], A[c]]; [rhs[c], rhs[piv]] = [rhs[piv], rhs[c]];
    for (let i = c + 1; i < MA; i++) {
      const f = A[i][c] / A[c][c];
      for (let j = c; j < MA; j++) A[i][j] -= f * A[c][j];
      rhs[i] -= f * rhs[c];
    }
  }
  const alpha = new Float64Array(MA);
  for (let i = MA - 1; i >= 0; i--) {
    let v = rhs[i];
    for (let j = i + 1; j < MA; j++) v -= A[i][j] * alpha[j];
    alpha[i] = v / A[i][i];
  }
  // predicted residual under the linear model
  let pr2 = 0;
  for (let k = 0; k < BINS * nCh; k++) {
    let v = R0[k];
    for (let i = 0; i < MA; i++) v += C[i][k] * alpha[i];
    pr2 += v * v;
  }
  const predBin = Math.sqrt(pr2 / (BINS * nCh));
  let r02 = 0;
  for (let k = 0; k < BINS * nCh; k++) r02 += R0[k] * R0[k];
  const r0Bin = Math.sqrt(r02 / (BINS * nCh));
  console.log(`round ${round}: cols ${MA}, binned residual ${r0Bin.toExponential(3)} -> predicted ${predBin.toExponential(3)} (linear model)`);
  // backtracking step
  let took = false;
  for (const sc of [1, 0.5, 0.25, 0.1]) {
    const Tn = T.map((r, p) => {
      let d0 = 0, d1 = 0;
      for (let i = 0; i < MA; i++) { d0 += alpha[i] * dirsAll[i][p * nCh]; d1 += alpha[i] * dirsAll[i][p * nCh + 1]; }
      return [r[0] + sc * d0, r[1] + sc * d1];
    });
    const { rms: fn, R: Rn } = await evalTile(Tn);
    evals++;
    console.log(`  scale ${sc}: f ${fn.toExponential(4)} ${fn < f0 ? '*' : '(reject)'}`);
    if (fn < f0) { T = Tn; f0 = fn; R0 = Rn; took = true; break; }
  }
  let duPk = 0;
  for (const r of T) duPk = Math.max(duPk, Math.abs(r[0]), Math.abs(r[1]));
  console.log(`round ${round} done: f ${f0.toExponential(4)}  duPk ${duPk.toFixed(2)}  evals ${evals}  (${((Date.now() - t0) / 60000).toFixed(0)} min)`);
  if (!took) { console.log('no accepted step — stopping'); break; }
}
console.log(`SGN tile: ${f0.toExponential(4)}   (shipped 3.12e-3, 50x needs 2.7e-3, floor ~4.3e-4)`);

const score = async (duF, laps) => {
  const m = await makeArm();
  homeArm(m.arm, m.servo, path);
  if (duF) {
    const c0 = path.at(0);
    const [q1h, q2h] = m.arm.ik(c0.x, c0.y, true);
    for (let k = 0; k < PRE * SS; k++) {
      const d = duF(k);
      const tau = m.servo.torques([{ theta: q1h + d[0], omega: 0, alpha: 0 },
        { theta: q2h + d[1], omega: 0, alpha: 0 }]);
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
const got = await score(mkF(T), 8);
console.log('open:', open.map((v) => v.toExponential(2)).join('  '));
console.log('sgn :', got.map((v) => v.toExponential(2)).join('  '));
console.log(`gain over open: ${(open.at(-1) / got.at(-1)).toFixed(1)}x   (shipped 44.0x, target 50x)`);
console.log('EXIT 0');
