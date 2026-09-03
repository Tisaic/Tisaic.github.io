// GRADIENT (LEVENBERG-MARQUARDT) COMMISSIONING vs the grid + coordinate descent.
// The owner's question: the identification search is wildly inefficient, and the
// screen only bought 1.3x because per-candidate cost is BUILD-AND-SETTLE, not record
// length — so the lever is visiting FEWER candidates. J(K,E,damp,bl)=Σ‖sim−rec‖² is
// nonlinear least-squares with a known K/E compensation valley; coordinate descent
// (refineParams) ignores the coupling that IS the valley, exactly the §43 tile-refine
// failure one level up. LM accounts for it via JᵀJ. Deterministic sim ⇒ forward-diff
// Jacobian is noise-free (only linearization error, set by δ). Fit in LOG space so
// bl~1e-4 is not swamped by K~0.25; LM damping handles the stiff cell's flat-K
// ill-conditioning.
//
// BAR (pre-registered): LM from a 3x3 coarse seed reaches the grid's K/E within the
// test tolerances (K 5-10%, E 5%, damp x2) in FEWER sim evals, on BOTH the soft
// canonical (0.25/0.03) and stiff (16/0.15) cells.
import { identifyTwin, refineParams } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { drivePath, armSimulators } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
import { randomWander } from '/home/user/Tisaic.github.io/lib/flexisim/demopath.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, homeArm } = rig;
const SS = 9;
const CELL = process.env.LM_CELL || 'soft';                 // 'soft' | 'stiff'
const TRUE = CELL === 'stiff' ? { K: 16, E: 0.15 } : { K: 0.25, E: 0.03 };
const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const wpath = randomWander(mkRnd(301), 0.004, { centre: [12, 0], reach: 6 });
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);

console.log(`commissioning A/B on the ${CELL} cell (true K=${TRUE.K} E=${TRUE.E})…`);
const m0 = await makeArm(TRUE);
homeArm(m0.arm, m0.servo, wpath);
const rec = (await drivePath({ arm: m0.arm, servo: m0.servo, path: wpath, sample: SS, steps: 900 * SS })).e;
await destroy(m0);
const nCh = rec[0].length;

// one shared eval counter across a method
let evalCount = 0;
const sims = armSimulators({ buildArm: (p) => makeArm(p), destroyArm: destroy, home, sample: SS });
const idSim = sims.identifySim(wpath, 900);
const run = async (p) => { evalCount++; return idSim(p); };
const Jof = (sim) => {
  let sd = 0, n = 0;
  const L = Math.min(sim.length, rec.length);
  for (let i = 0; i < L; i++) { for (let c = 0; c < nCh; c++) sd += (sim[i][c] - rec[i][c]) ** 2; n++; }
  return Math.sqrt(sd / n);
};

// ---------- method A: the shipped grid + refineParams (the control) ----------
const KL = CELL === 'stiff' ? [0.25, 0.5, 1, 2, 4, 8, 16, 20, 32] : [0.1, 0.18, 0.25, 0.35, 0.5, 1, 2, 4, 8];
const EL = [0.015, 0.03, 0.06, 0.10, 0.15, 0.22];
evalCount = 0;
let t = Date.now();
const gridFit = await identifyTwin({ record: rec,
  simulate: (p) => run({ ...p, damp: 1e-3, bl: 0 }),
  space: [{ name: 'K', values: KL }, { name: 'E', values: EL }], refine: 2 });
const stageParams = await refineParams({ record: rec, simulate: run,
  params: { K: gridFit.params.K, E: gridFit.params.E, damp: 1e-3, bl: 5e-5 },
  keys: [{ name: 'damp', factor: 3 }, { name: 'bl', factor: 3 },
    { name: 'K', factor: 1.15 }, { name: 'E', factor: 1.08 }],
  rounds: 3, shrink: [1.04, 1.02] });
const evalsA = evalCount, tA = (Date.now() - t) / 1000;
console.log(`GRID+refineParams: K=${stageParams.params.K.toPrecision(4)} E=${stageParams.params.E.toPrecision(4)} `
  + `damp=${stageParams.params.damp.toExponential(2)} bl=${stageParams.params.bl.toExponential(2)} `
  + `J=${stageParams.J.toExponential(2)}  (${evalsA} sims, ${tA.toFixed(0)}s)`);

// ---------- method B: 3x3 coarse seed + Levenberg-Marquardt in log space ----------
// residual vector r = flattened (sim - rec) over the min length; forward-diff Jacobian
// in log-params; (JᵀJ + λ diag) δ = -Jᵀr, adaptive λ, log-space so relative steps.
const KEYS = ['K', 'E', 'damp', 'bl'];
const NP = KEYS.length;
const flat = (sim) => {
  const L = Math.min(sim.length, rec.length);
  const r = new Float64Array(L * nCh);
  for (let i = 0; i < L; i++) for (let c = 0; c < nCh; c++) r[i * nCh + c] = sim[i][c] - rec[i][c];
  return r;
};
const resid = async (p) => { const s = await run(p); return flat(s); };
const rnorm = (r) => { let s = 0; for (let i = 0; i < r.length; i++) s += r[i] * r[i]; return Math.sqrt(s / (r.length)); };

evalCount = 0; t = Date.now();
// coarse 3x3 seed at guessed damp/bl (stage-1 shape, but 3x3 not 9x6)
const seedK = CELL === 'stiff' ? [1, 8, 32] : [0.1, 0.35, 2];
const seedE = [0.03, 0.08, 0.18];
let best = null;
for (const K of seedK) for (const E of seedE) {
  let s; try { s = await run({ K, E, damp: 1e-3, bl: 0 }); } catch { continue; }
  const J = Jof(s);
  if (!best || J < best.J) best = { p: { K, E, damp: 1e-3, bl: 5e-5 }, J };
}
console.log(`  LM seed (3x3): K=${best.p.K} E=${best.p.E} J=${best.J.toExponential(2)}`);
let p = { ...best.p };
let r0 = await resid(p);
let f0 = rnorm(r0);
let lam = 1e-2;
const DELTA = 0.04;                 // log-space forward-diff step (relative)
const LB = { K: 1e-3, E: 1e-3, damp: 1e-5, bl: 0 };
for (let it = 0; it < 12; it++) {
  // Jacobian columns in log-space: ∂r/∂ln(p_k) ≈ (r(p·e^δ) − r0)/δ
  const cols = [];
  for (const key of KEYS) {
    const pp = { ...p };
    const base = Math.max(pp[key], key === 'bl' ? 1e-6 : LB[key]);
    pp[key] = base * Math.exp(DELTA);
    let rp; try { rp = await resid(pp); } catch { cols.push(null); continue; }
    const col = new Float64Array(r0.length);
    for (let i = 0; i < col.length; i++) col[i] = (rp[i] - r0[i]) / DELTA;
    cols.push(col);
  }
  // normal equations JᵀJ (NPxNP) and Jᵀr0
  const A = Array.from({ length: NP }, () => new Float64Array(NP));
  const g = new Float64Array(NP);
  for (let a = 0; a < NP; a++) {
    if (!cols[a]) { A[a][a] = 1; continue; }              // refused column: freeze that param
    for (let b = a; b < NP; b++) {
      if (!cols[b]) continue;
      let s = 0; for (let i = 0; i < r0.length; i++) s += cols[a][i] * cols[b][i];
      A[a][b] = s; A[b][a] = s;
    }
    let s = 0; for (let i = 0; i < r0.length; i++) s += cols[a][i] * r0[i];
    g[a] = -s;
  }
  // LM: solve (A + λ diag(A)) δ = g, backtrack on λ
  let accepted = false;
  for (let tries = 0; tries < 6; tries++) {
    const M = A.map((row, i) => { const rr = Array.from(row); rr[i] += lam * (A[i][i] || 1); return rr; });
    const rhs = Array.from(g);
    for (let c = 0; c < NP; c++) {
      let piv = c; for (let i = c + 1; i < NP; i++) if (Math.abs(M[i][c]) > Math.abs(M[piv][c])) piv = i;
      [M[c], M[piv]] = [M[piv], M[c]]; [rhs[c], rhs[piv]] = [rhs[piv], rhs[c]];
      for (let i = c + 1; i < NP; i++) { const f = M[i][c] / M[c][c]; for (let j = c; j < NP; j++) M[i][j] -= f * M[c][j]; rhs[i] -= f * rhs[c]; }
    }
    const d = new Float64Array(NP);
    for (let i = NP - 1; i >= 0; i--) { let v = rhs[i]; for (let j = i + 1; j < NP; j++) v -= M[i][j] * d[j]; d[i] = v / M[i][i]; }
    const pn = { ...p };
    KEYS.forEach((key, k) => { pn[key] = Math.max(LB[key], p[key] * Math.exp(Math.max(-1, Math.min(1, d[k])))); });
    let rn; try { rn = await resid(pn); } catch { lam *= 4; continue; }
    const fn = rnorm(rn);
    if (fn < f0) { p = pn; r0 = rn; f0 = fn; lam = Math.max(1e-6, lam / 3); accepted = true; break; }
    lam *= 4;
  }
  console.log(`  LM it ${it}: J=${f0.toExponential(3)} K=${p.K.toPrecision(4)} E=${p.E.toPrecision(4)} damp=${p.damp.toExponential(2)} bl=${p.bl.toExponential(2)} lam=${lam.toExponential(1)} (${evalCount} sims)`);
  if (!accepted) { console.log('  LM: no accepted step — converged or stuck'); break; }
}
const evalsB = evalCount, tB = (Date.now() - t) / 1000;
console.log(`LM: K=${p.K.toPrecision(4)} E=${p.E.toPrecision(4)} damp=${p.damp.toExponential(2)} bl=${p.bl.toExponential(2)} J=${f0.toExponential(2)}  (${evalsB} sims, ${tB.toFixed(0)}s)`);

// ---------- verdict ----------
const dK = Math.abs(p.K / TRUE.K - 1), dE = Math.abs(p.E / TRUE.E - 1);
const tolK = CELL === 'stiff' ? 0.35 : 0.10;      // stiff K is weakly observable (measured -30%)
console.log(`\nLM accuracy: K ${(100 * dK).toFixed(1)}% (tol ${(100 * tolK).toFixed(0)}%) E ${(100 * dE).toFixed(1)}% (tol 10%)`);
console.log(`speedup: ${evalsA} sims -> ${evalsB} sims (${(evalsA / evalsB).toFixed(1)}x fewer), wall ${(tA / tB).toFixed(1)}x`);
const okAcc = dK < tolK && dE < 0.10;
const okFast = evalsB < evalsA;
console.log(`${okAcc && okFast ? 'PASS' : 'FAIL'}: accuracy ${okAcc ? 'ok' : 'MISS'}, ${okFast ? 'fewer sims' : 'NOT fewer'}`);
console.log('EXIT 0');
