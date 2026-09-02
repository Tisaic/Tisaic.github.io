/**
 * @file THE MECHANISM ANALYZERS, run against `residualcampaign.mjs`'s recorded JSON in
 * seconds — no recommissioning. Each block targets one hypothesis from the campaign
 * header; together they DEFINE where the deterministic residual comes from.
 *
 * Run: node test/flexisim/residualanalyze.mjs [IN=…/campaign.json]
 */
import { readFileSync } from 'node:fs';

const IN = process.env.IN || '/tmp/claude-0/-home-user-Tisaic-github-io/932a1341-a996-534b-9a60-fb10b63f0258/scratchpad/campaign.json';
const D = JSON.parse(readFileSync(IN, 'utf8'));
const C = Object.fromEntries(D.cols.map((n, i) => [n, i]));
const feeds = Object.keys(D.feeds).map(Number).sort((a, b) => a - b);
console.log(`\nmechanism analysis of ${IN}  (backlash ${D.BACKLASH})\n`);

// arc-length-bucketed mean profile over settled laps (lap >= 2), per feed
const NB = 400;
const profiles = {};
for (const f of feeds) {
  const { rows } = D.feeds[f];
  const sMax = Math.max(...rows.map((r) => r[C.s]));
  const acc = Array.from({ length: NB }, () => ({ s: 0, n: 0, s2: 0 }));
  for (const r of rows) {
    if (r[C.lap] < 2) continue;
    const b = Math.min(NB - 1, Math.floor(r[C.s] / sMax * NB));
    acc[b].s += r[C.en]; acc[b].n++;
  }
  profiles[f] = { sMax, prof: acc.map((a) => (a.n ? a.s / a.n : 0)) };
}

// ---- A1. FEED SCALING: project the profile at each arc position onto {1, feed, feed²}.
{
  const F = feeds, P = F.map((f) => profiles[f].prof);
  let vc = 0, vl = 0, vq = 0, vr = 0, vt = 0;
  const f0 = 4e-3;
  for (let b = 0; b < NB; b++) {
    const y = F.map((f, i) => P[i][b]);
    // least squares on [1, f/f0, (f/f0)^2] with 3 points → exact; attribute variance
    const x = F.map((f) => f / f0);
    const det = 1 * (x[1] * x[2] * x[2] - x[2] * x[1] * x[1])
      - x[0] * (x[2] * x[2] - x[1] * x[1]) + x[0] * x[0] * (x[2] - x[1]);
    // solve 3x3 via Cramer on rows [1, xi, xi^2]
    const M = x.map((xi) => [1, xi, xi * xi]);
    const solve3 = (A, r) => {
      const d = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
        - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
        + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
      const col = (j) => A.map((row, i) => row.map((v, jj) => (jj === j ? r[i] : v)));
      const det3 = (B) => B[0][0] * (B[1][1] * B[2][2] - B[1][2] * B[2][1])
        - B[0][1] * (B[1][0] * B[2][2] - B[1][2] * B[2][0])
        + B[0][2] * (B[1][0] * B[2][1] - B[1][1] * B[2][0]);
      return [det3(col(0)) / d, det3(col(1)) / d, det3(col(2)) / d];
    };
    const [a, bl, cq] = solve3(M, y);
    vc += a * a; vl += bl * bl; vq += cq * cq;
    vt += y.reduce((s2, v) => s2 + v * v, 0) / 3;
  }
  const tot = vc + vl + vq || 1;
  console.log('A1 FEED SCALING of the deterministic profile (exact 3-point decomposition):');
  console.log(`   constant (H-DROOP quasi-statics)  ${(100 * vc / tot).toFixed(1)}%`);
  console.log(`   ∝ feed   (H-LAG servo lag)        ${(100 * vl / tot).toFixed(1)}%`);
  console.log(`   ∝ feed²  (H-CENT inertial)        ${(100 * vq / tot).toFixed(1)}%`);
  for (const f of feeds) {
    const rms = Math.sqrt(profiles[f].prof.reduce((s2, v) => s2 + v * v, 0) / NB);
    console.log(`   profile rms @feed ${f}: ${rms.toExponential(3)}`);
  }
}

// ---- A2. SPATIAL: where does it live — straights, arcs, or transitions? --------------
for (const f of [4e-3]) {
  const { rows } = D.feeds[f];
  const settled = rows.filter((r) => r[C.lap] >= 2);
  const kaps = settled.map((r) => Math.abs(r[C.kap]));
  const kapTh = 0.1;
  // a TRANSITION is within W samples of a |Δkap| event
  const W = 6;
  const trans = new Set();
  for (let i = 1; i < settled.length; i++) {
    if (Math.abs(kaps[i] - kaps[i - 1]) > 0.05) {
      for (let d = -W; d <= W; d++) trans.add(i + d);
    }
  }
  let sArc = 0, nArc = 0, sStr = 0, nStr = 0, sTr = 0, nTr = 0;
  settled.forEach((r, i) => {
    const e2 = r[C.en] * r[C.en];
    if (trans.has(i)) { sTr += e2; nTr++; }
    else if (kaps[i] > kapTh) { sArc += e2; nArc++; }
    else { sStr += e2; nStr++; }
  });
  console.log(`\nA2 SPATIAL @feed ${f}: rms on straights ${Math.sqrt(sStr / nStr).toExponential(3)} `
    + `(${nStr}), arcs ${Math.sqrt(sArc / nArc).toExponential(3)} (${nArc}), `
    + `transitions ±${W}samp ${Math.sqrt(sTr / nTr).toExponential(3)} (${nTr})`);
}

// ---- A3. BACKLASH: residual conditioned near joint-velocity sign crossings ------------
for (const f of [4e-3]) {
  const { rows } = D.feeds[f];
  const settled = rows.filter((r) => r[C.lap] >= 2);
  const near = new Set();
  for (let i = 1; i < settled.length; i++) {
    for (const j of [C.dq1, C.dq2]) {
      if (Math.sign(settled[i][j]) !== Math.sign(settled[i - 1][j])) {
        for (let d = -2; d <= 4; d++) near.add(i + d);
      }
    }
  }
  let sN = 0, nN = 0, sF = 0, nF = 0;
  settled.forEach((r, i) => {
    const e2 = r[C.en] * r[C.en];
    if (near.has(i)) { sN += e2; nN++; } else { sF += e2; nF++; }
  });
  console.log(`A3 REVERSALS @feed ${f}: rms near dq-sign crossings ${Math.sqrt(sN / nN).toExponential(3)} `
    + `(${nN}), away ${Math.sqrt(sF / nF).toExponential(3)} (${nF})`);
}

// ---- A4. WINDOW REACH: held-out R² of the rich local basis vs window length -----------
{
  const f = 4e-3, { rows } = D.feeds[f];
  const rich = (r) => {
    const q1 = r[C.q1], q2 = r[C.q2], tx = r[C.tx], ty = r[C.ty];
    const sp = r[C.sp] / 4e-3, kap = r[C.kap], ax = r[C.ddq1], ay = r[C.ddq2];
    const s1 = Math.sin(q1), c1 = Math.cos(q1), s12 = Math.sin(q1 + q2), c12 = Math.cos(q1 + q2);
    return [1, s1, c1, s12, c12, tx, ty, sp, kap, kap * sp * sp,
      s1 * s12, c1 * c12, tx * c1, ty * s12, r[C.dq1] * 1e3, r[C.dq2] * 1e3,
      ax * 1e5, ay * 1e5, kap * c1, sp * s1];
  };
  const fitR2 = (lags) => {
    const train = [], test = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r[C.lap] < 1) continue;
      const parts = [rich(r)];
      let ok = true;
      for (const d of lags) {
        const p = rows[i - d];
        if (!p || p[C.lap] < 0) { ok = false; break; }
        parts.push(rich(p));
      }
      if (!ok) continue;
      const row = [parts.flat(), r[C.en]];
      if (r[C.lap] <= 3) train.push(row); else test.push(row);
    }
    const nf = train[0][0].length;
    const A = Array.from({ length: nf }, () => new Float64Array(nf));
    const b = new Float64Array(nf);
    for (const [x, y] of train) for (let i = 0; i < nf; i++) {
      b[i] += x[i] * y;
      for (let j = 0; j < nf; j++) A[i][j] += x[i] * x[j];
    }
    for (let i = 0; i < nf; i++) A[i][i] += 1e-4 * A[i][i] + 1e-12;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c2 = 0; c2 < nf; c2++) {
      let p = c2; for (let r2 = c2 + 1; r2 < nf; r2++) if (Math.abs(M[r2][c2]) > Math.abs(M[p][c2])) p = r2;
      [M[c2], M[p]] = [M[p], M[c2]];
      for (let r2 = 0; r2 < nf; r2++) { if (r2 === c2 || !M[c2][c2]) continue;
        const f2 = M[r2][c2] / M[c2][c2]; for (let j = c2; j <= nf; j++) M[r2][j] -= f2 * M[c2][j]; }
    }
    const w = M.map((row, i) => row[nf] / (row[i] || 1));
    let ss = 0, sr = 0, mu = 0;
    for (const [, y] of test) mu += y; mu /= test.length;
    for (const [x, y] of test) { let p = 0; for (let i = 0; i < nf; i++) p += w[i] * x[i];
      sr += (y - p) ** 2; ss += (y - mu) ** 2; }
    return { r2: 1 - sr / ss, rms: Math.sqrt(sr / test.length), nf };
  };
  console.log('\nA4 WINDOW REACH (rich local basis, held-out laps 5-6, feed 4e-3):');
  for (const lags of [[], [3, 6, 9, 15, 24, 40], [3, 6, 9, 15, 24, 40, 60],
    [3, 6, 9, 15, 24, 40, 60, 90], [3, 6, 9, 15, 24, 40, 60, 90, 130],
    [3, 6, 9, 15, 24, 40, 60, 90, 130, 180]]) {
    const span = lags.length ? lags[lags.length - 1] * D.sample : 0;
    const { r2, rms, nf } = fitR2(lags);
    console.log(`   window ${String(span).padStart(4)} steps (${String(nf).padStart(3)} feats): `
      + `R² ${r2.toFixed(4)}  rms ${rms.toExponential(3)}`);
  }
}

// ---- A5. PER-LAP SETTLING: does the profile still drift lap over lap? -----------------
{
  const f = 4e-3, { rows } = D.feeds[f];
  const sMax = Math.max(...rows.map((r) => r[C.s]));
  const lapProf = (l) => {
    const acc = Array.from({ length: NB }, () => ({ s: 0, n: 0 }));
    for (const r of rows) if (r[C.lap] === l) {
      const b = Math.min(NB - 1, Math.floor(r[C.s] / sMax * NB));
      acc[b].s += r[C.en]; acc[b].n++;
    }
    return acc.map((a) => (a.n ? a.s / a.n : 0));
  };
  const corr = (a, b) => {
    let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let i = 0; i < a.length; i++) { n++; sa += a[i]; sb += b[i];
      saa += a[i] * a[i]; sbb += b[i] * b[i]; sab += a[i] * b[i]; }
    return (sab - sa * sb / n) / Math.sqrt((saa - sa * sa / n) * (sbb - sb * sb / n));
  };
  const rms = (a) => Math.sqrt(a.reduce((s2, v) => s2 + v * v, 0) / a.length);
  const l2 = lapProf(2), l5 = lapProf(5);
  console.log(`\nA5 LAP-OVER-LAP SETTLING: profile corr lap2~lap5 ${corr(l2, l5).toFixed(4)}, `
    + `amplitude lap2 ${rms(l2).toExponential(3)} vs lap5 ${rms(l5).toExponential(3)}`);
}

// ---- A6. THE PHYSICS TEST: commanded joint rates ONLY, convolved over the loop's memory,
// optionally pose-modulated. If the mechanism is the servo loop's filtered response to
// commanded rates mapped through the kinematics, the rates-alone fit carries most of it
// and the pose modulation carries the rest.
{
  const f = 4e-3, { rows } = D.feeds[f];
  const LAGS = [0, 2, 4, 6, 9, 13, 18, 24, 32, 42, 55, 70, 90, 115, 145, 180];
  const build = (mod) => {
    const train = [], test = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r[C.lap] < 1) continue;
      const x = [1];
      let ok = true;
      for (const d of LAGS) {
        const p = rows[i - d];
        if (!p) { ok = false; break; }
        x.push(p[C.dq1] * 1e3, p[C.dq2] * 1e3);
        if (mod) {
          const s1 = Math.sin(r[C.q1]), c12 = Math.cos(r[C.q1] + r[C.q2]);
          x.push(p[C.dq1] * 1e3 * s1, p[C.dq2] * 1e3 * c12,
            p[C.dq1] * 1e3 * r[C.tx], p[C.dq2] * 1e3 * r[C.ty]);
        }
      }
      if (!ok) continue;
      if (r[C.lap] <= 3) train.push([x, r[C.en]]); else test.push([x, r[C.en]]);
    }
    const nf = train[0][0].length;
    const A = Array.from({ length: nf }, () => new Float64Array(nf));
    const b = new Float64Array(nf);
    for (const [x, y] of train) for (let i = 0; i < nf; i++) {
      b[i] += x[i] * y;
      for (let j = 0; j < nf; j++) A[i][j] += x[i] * x[j];
    }
    for (let i = 0; i < nf; i++) A[i][i] += 1e-4 * A[i][i] + 1e-12;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c2 = 0; c2 < nf; c2++) {
      let p = c2; for (let r2 = c2 + 1; r2 < nf; r2++) if (Math.abs(M[r2][c2]) > Math.abs(M[p][c2])) p = r2;
      [M[c2], M[p]] = [M[p], M[c2]];
      for (let r2 = 0; r2 < nf; r2++) { if (r2 === c2 || !M[c2][c2]) continue;
        const f2 = M[r2][c2] / M[c2][c2]; for (let j = c2; j <= nf; j++) M[r2][j] -= f2 * M[c2][j]; }
    }
    const w = M.map((row, i) => row[nf] / (row[i] || 1));
    let ss = 0, sr = 0, mu = 0;
    for (const [, y] of test) mu += y; mu /= test.length;
    for (const [x, y] of test) { let p = 0; for (let i = 0; i < nf; i++) p += w[i] * x[i];
      sr += (y - p) ** 2; ss += (y - mu) ** 2; }
    return { r2: 1 - sr / ss, rms: Math.sqrt(sr / test.length), nf };
  };
  console.log('\nA6 THE PHYSICS TEST (feed 4e-3, held-out laps 5-6, FIR over 1440 steps):');
  const a = build(false);
  console.log(`   commanded joint rates only     (${String(a.nf).padStart(3)} feats): R² ${a.r2.toFixed(4)}  rms ${a.rms.toExponential(3)}`);
  const b2 = build(true);
  console.log(`   + pose/tangent modulation      (${String(b2.nf).padStart(3)} feats): R² ${b2.r2.toFixed(4)}  rms ${b2.rms.toExponential(3)}`);
}
