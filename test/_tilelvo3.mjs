// THE LAP-VARYING OPERATOR, measured and inverted whole. SGN v1/v2 measured the wall
// as spread: after the corner-concentrated part is taken, the remaining residual lives
// in MANY directions and a 12-20 column subspace per round buys <1%. So stop probing
// directions and measure the OPERATOR: the response to a hat bump at 8 nodes around
// the lap — nodes AT the corners and mid-edges, because the pose-dependence is what
// makes the operator lap-varying and the corners are where it changes fastest — with
// hat-interpolated kernels between nodes (local shift-invariance, the same
// interpolation the router's severity layers use). Then Gauss-Newton on the WHOLE
// 2048-dim tile at once: implicit J, CG on the normal equations, ridge, backtracking,
// re-linearize. 32 evals buy the operator; each step after costs one.
import { compileTwin, refineCompiled, applyCompiled } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { twinResponse, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
// v1's lesson (rule 21): tile 2.689e-3 on the 4-lap binned objective DELIVERED 44.0x —
// no transfer — while SGN's worse 2.876e-3 delivered 45.9x. At 1024 bins over ~817
// samples/lap the eval has ~2.4 samples/bin and a bin-scale alternation can game the
// binning without touching the machine. v2: 512 bins, a first-difference smoothness
// penalty in the CG solve, an out-of-config 8-lap sim check each cycle, and joint rms
// beside contour at delivery.
const SS = 9, PRE = 1500, BINS = +(process.env.LVO_BINS || 512), nCh = 2, NODES = 8, SEG = BINS / NODES;
const STEPS = +(process.env.LVO_STEPS || 10);
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
// v3: THE OBJECTIVE IS THE TOOL ERROR, NOT THE JOINT ERROR. v2's transfer instrument
// read delivered joint rms 2.543e-3 against sim tile 2.549e-3 — the twin transfers
// EXACTLY — and still delivered 47.7x, because the optimizer minimizes equally-weighted
// joint rms while the score is the tool projection through the Jacobian lever, and the
// residual's lever ratio drifted 8.2 → 9.3: the solve parks error where the score
// punishes hardest. The rotating projection is itself a lap-varying operator — which is
// no obstacle to an optimizer whose operator is lap-varying by construction. Bins align
// to program phase exactly (handoff − PRE is one lap), so the per-bin 2x2 Jacobian is
// precomputed once and residual AND kernels are measured through it.
const PB = [];
{
  const m0 = await makeArm();
  for (let p = 0; p < BINS; p++) {
    const k = Math.round((p / BINS) * path.lap) % Math.ceil(path.lap);
    const c = path.at(k);
    const [q1, q2] = m0.arm.ik(c.x, c.y, true);
    PB.push(m0.arm.jacobian(q1, q2).map((row) => row.slice()));
  }
  await destroy(m0);
}
const evalTile = async (tile) => {
  const e = await sims.compileSim(path, { laps: 4, preRoll: PRE })(mkF(tile));
  const start = Math.ceil(handoff + lapSamples);
  const R = new Float64Array(BINS * nCh);
  const W = new Array(BINS).fill(0);
  let s2 = 0, n2 = 0;
  for (let s = start; s < e.length; s++) {
    const p = Math.floor((((s - handoff) % lapSamples) / lapSamples) * BINS) % BINS;
    const J = PB[p];
    const tx = J[0][0] * e[s][0] + J[0][1] * e[s][1];
    const ty = J[1][0] * e[s][0] + J[1][1] * e[s][1];
    R[p * nCh] += tx; R[p * nCh + 1] += ty;
    s2 += tx * tx + ty * ty;
    W[p]++; n2++;
  }
  for (let p = 0; p < BINS; p++) {
    if (W[p]) { for (let c = 0; c < nCh; c++) R[p * nCh + c] /= W[p]; continue; }
    const q = (p + BINS - 1) % BINS;
    for (let c = 0; c < nCh; c++) R[p * nCh + c] = R[q * nCh + c];
  }
  return { rms: Math.sqrt(s2 / (n2 * nCh)), R };
};

// ---- measure the operator: hat bump (w=3, unit peak) at each node, each channel ----
const HATW = 3;
const bumpTile = (tile, node, c, amp) => tile.map((r, p) => {
  const d = Math.min((p - node * SEG + BINS) % BINS, (node * SEG - p + BINS) % BINS);
  if (d > HATW) return [r[0], r[1]];
  const v = amp * (1 - d / (HATW + 1));
  return c === 0 ? [r[0] + v, r[1]] : [r[0], r[1] + v];
});
// v2: NEWTON WITH A REFRESHED JACOBIAN. v1 measured the operator once and its steps
// depleted from 5% to 0.2% as the tile left the region the kernels were measured in —
// so alternate: re-measure the operator at the CURRENT tile, take a few steps, repeat.
// The tile checkpoints to JSON after every accepted step so a container roll-back
// costs minutes, not the run (and TILE_IN warm-starts from a previous run's file).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const TILE_CK = process.env.TILE_CK || '/tmp/claude-0/-home-user-Tisaic-github-io/932a1341-a996-534b-9a60-fb10b63f0258/scratchpad/lvo-tile.json';
if (process.env.TILE_IN && existsSync(process.env.TILE_IN)) {
  T = JSON.parse(readFileSync(process.env.TILE_IN, 'utf8'));
  console.log(`tile warm-started from ${process.env.TILE_IN}`);
}
const CYCLES = +(process.env.LVO_CYCLES || 3);
const STEPSPC = +(process.env.LVO_STEPSPC || 5);
let { rms: f0, R: R0 } = await evalTile(T);
console.log(`start f0 ${f0.toExponential(4)}  (target 2.7e-3 for 50x, floor ~4.3e-4)`);
let evals = 1;
const t0 = Date.now();
const K = Array.from({ length: NODES }, () => []);
const measureOperator = async () => {
  for (let node = 0; node < NODES; node++) {
    K[node] = [];
    for (let c = 0; c < nCh; c++) {
      const rp = (await evalTile(bumpTile(T, node, c, DELTA))).R;
      const rm = (await evalTile(bumpTile(T, node, c, -DELTA))).R;
      evals += 2;
      const col = new Float64Array(BINS * nCh);
      const pc = node * SEG;
      for (let q = 0; q < BINS; q++) {
        const off = (q - pc + BINS) % BINS;
        for (let co = 0; co < nCh; co++) col[off * nCh + co] = (rp[q * nCh + co] - rm[q * nCh + co]) / (2 * DELTA);
      }
      K[node].push(col);
    }
  }
  console.log(`operator measured at f ${f0.toExponential(4)}, evals ${evals} (${((Date.now() - t0) / 60000).toFixed(0)} min)`);
};

// ---- implicit J apply with hat interpolation between nodes ----------------------
// dR[q,co] = sum_{p,ci} dT[p,ci] * sum_node wNode(p) * K[node][ci][(q-p mod B), co]
const applyJ = (dT) => {
  const out = new Float64Array(BINS * nCh);
  for (let p = 0; p < BINS; p++) {
    const x = p / SEG;
    const n0 = Math.floor(x) % NODES, n1 = (n0 + 1) % NODES, w1 = x - Math.floor(x), w0 = 1 - w1;
    for (let ci = 0; ci < nCh; ci++) {
      const a = dT[p * nCh + ci];
      if (a === 0) continue;
      const k0 = K[n0][ci], k1 = K[n1][ci];
      for (let q = 0; q < BINS; q++) {
        const off = (q - p + BINS) % BINS;
        out[q * nCh] += a * (w0 * k0[off * nCh] + w1 * k1[off * nCh]);
        out[q * nCh + 1] += a * (w0 * k0[off * nCh + 1] + w1 * k1[off * nCh + 1]);
      }
    }
  }
  return out;
};
const applyJT = (r) => {
  const out = new Float64Array(BINS * nCh);
  for (let p = 0; p < BINS; p++) {
    const x = p / SEG;
    const n0 = Math.floor(x) % NODES, n1 = (n0 + 1) % NODES, w1 = x - Math.floor(x), w0 = 1 - w1;
    for (let ci = 0; ci < nCh; ci++) {
      const k0 = K[n0][ci], k1 = K[n1][ci];
      let s = 0;
      for (let q = 0; q < BINS; q++) {
        const off = (q - p + BINS) % BINS;
        s += r[q * nCh] * (w0 * k0[off * nCh] + w1 * k1[off * nCh]);
        s += r[q * nCh + 1] * (w0 * k0[off * nCh + 1] + w1 * k1[off * nCh + 1]);
      }
      out[p * nCh + ci] = s;
    }
  }
  return out;
};

// ---- Gauss-Newton steps: CG on (J'J + lam I) dT = -J'R, backtrack, re-linearize ----
const dot = (a, bb) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * bb[i]; return s; };
for (let cycle = 0; cycle < CYCLES; cycle++) {
await measureOperator();
for (let it = 0; it < STEPSPC; it++) {
  const g = applyJT(R0);
  const lam = 0.05 * Math.sqrt(dot(g, g) / (BINS * nCh)) + 1e-12;
  // smoothness: mu * D'D with D the circular first difference, scaled to lam
  const mu = +(process.env.LVO_MU ?? 1) * lam;
  const applyDTD = (v) => {
    const out = new Float64Array(BINS * nCh);
    for (let c = 0; c < nCh; c++) for (let p = 0; p < BINS; p++) {
      const pm = (p + BINS - 1) % BINS, pp = (p + 1) % BINS;
      out[p * nCh + c] = 2 * v[p * nCh + c] - v[pm * nCh + c] - v[pp * nCh + c];
    }
    return out;
  };
  // CG
  let xv = new Float64Array(BINS * nCh);
  let r = g.map((v) => -v);
  let pv = Float64Array.from(r);
  let rs = dot(r, r);
  for (let k = 0; k < 40; k++) {
    const Ap = applyJT(applyJ(pv));
    const Dp = applyDTD(pv);
    for (let i = 0; i < Ap.length; i++) Ap[i] += lam * pv[i] + mu * Dp[i];
    const al = rs / Math.max(dot(pv, Ap), 1e-30);
    for (let i = 0; i < xv.length; i++) { xv[i] += al * pv[i]; r[i] -= al * Ap[i]; }
    const rs2 = dot(r, r);
    if (rs2 < 1e-8 * rs) break;
    for (let i = 0; i < pv.length; i++) pv[i] = r[i] + (rs2 / rs) * pv[i];
    rs = rs2;
  }
  // predicted residual
  const Jx = applyJ(xv);
  let pr2 = 0;
  for (let i = 0; i < Jx.length; i++) pr2 += (R0[i] + Jx[i]) ** 2;
  console.log(`step ${it}: predicted binned ${Math.sqrt(pr2 / (BINS * nCh)).toExponential(3)}`);
  let took = false;
  for (const sc of [1, 0.5, 0.25, 0.1]) {
    const Tn = T.map((row, p) => [row[0] + sc * xv[p * nCh], row[1] + sc * xv[p * nCh + 1]]);
    const got = await evalTile(Tn);
    evals++;
    console.log(`  scale ${sc}: f ${got.rms.toExponential(4)} ${got.rms < f0 ? '*' : '(reject)'}`);
    if (got.rms < f0) { T = Tn; f0 = got.rms; R0 = got.R; took = true; break; }
  }
  let duPk = 0;
  for (const row of T) duPk = Math.max(duPk, Math.abs(row[0]), Math.abs(row[1]));
  console.log(`cycle ${cycle} step ${it} done: f ${f0.toExponential(4)}  duPk ${duPk.toFixed(2)}  evals ${evals}  (${((Date.now() - t0) / 60000).toFixed(0)} min)`);
  if (took) writeFileSync(TILE_CK, JSON.stringify(T));
  if (!took) break;
}
// out-of-config check (rule 21's guard): the same tile at 8 sim laps — an
// improvement that lives only in the 4-lap binning shows up as a gap here
{
  const e8 = await sims.compileSim(path, { laps: 8, preRoll: PRE })(mkF(T));
  const start8 = Math.ceil(handoff + lapSamples);
  let s2 = 0, n2 = 0;
  for (let s = start8; s < e8.length; s++) {
    const p = Math.floor((((s - handoff) % lapSamples) / lapSamples) * BINS) % BINS;
    const J = PB[p];
    const tx = J[0][0] * e8[s][0] + J[0][1] * e8[s][1];
    const ty = J[1][0] * e8[s][0] + J[1][1] * e8[s][1];
    s2 += tx * tx + ty * ty; n2 += 2;
  }
  evals += 2;
  console.log(`cycle ${cycle} holdout (8 sim laps, tool): ${Math.sqrt(s2 / n2).toExponential(4)}  vs 4-lap f ${f0.toExponential(4)}`);
}
}
console.log(`LVO3 tile (TOOL rms): ${f0.toExponential(4)}   (shipped 3.12e-3, 50x needs 2.7e-3, floor ~4.3e-4)`);

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
  const rows = []; let cAcc = 0, cn = 0, lapNo = 0, jAcc = 0, tAcc = 0;
  for (let k = 0; k < total; k++) {
    const now = Math.floor(k / path.lap);
    if (now !== lapNo) { rows.push(Math.sqrt(cAcc / cn)); cAcc = 0; cn = 0; jAcc = 0; tAcc = 0; lapNo = now; }
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
      const cx = m.arm.L1 * Math.cos(q1) + m.arm.L2 * Math.cos(q1 + q2);
      const cy = m.arm.L1 * Math.sin(q1) + m.arm.L2 * Math.sin(q1 + q2);
      const J = m.arm.jacobian(q1, q2);
      const det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      const ex = tool[0] - cx, ey = tool[1] - cy;
      const j1 = (J[1][1] * ex - J[0][1] * ey) / det, j2 = (-J[1][0] * ex + J[0][0] * ey) / det;
      jAcc += (j1 * j1 + j2 * j2) / 2;
      tAcc += (ex * ex + ey * ey) / 2;
    }
  }
  if (cn > 10) { rows.push(Math.sqrt(cAcc / cn)); rows.jointLast = Math.sqrt(jAcc / cn); rows.toolLast = Math.sqrt(tAcc / cn); }
  await destroy(m);
  return rows;
};
const open = await score(null, 2);
const got = await score(mkF(T), 8);
console.log('open:', open.map((v) => v.toExponential(2)).join('  '));
console.log('lvo :', got.map((v) => v.toExponential(2)).join('  '));
console.log(`delivered tool rms (last lap): ${got.toolLast.toExponential(3)}  vs sim tile f ${f0.toExponential(3)} — the transfer instrument (joint ${got.jointLast.toExponential(3)})`);
console.log(`gain over open: ${(open.at(-1) / got.at(-1)).toFixed(1)}x   (shipped 44.0x, target 50x)`);
console.log('EXIT 0');
