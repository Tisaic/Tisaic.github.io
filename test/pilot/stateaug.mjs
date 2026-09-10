/**
 * IS THE CONVERGED CORRECTION A FUNCTION OF THE REFERENCE WINDOW, OR OF THE STATE TOO? (plan §52.27)
 *
 * The shipped policy regresses each training program's converged prefix onto a ±256-sample window
 * of the reference and reads held-out R² 0.86 on it; on its own programs it delivers 7.4x where the
 * prefix delivers 8-11x, and 6.6x on the square. That 0.86 is the ceiling of the route, and every
 * gain in this arc that beat it stored the answer. This asks what the missing 14% is a function of:
 * the ladder keeps every training program's converged prefix; each is run with that prefix applied
 * and the motor-side state tapped; the prefix is then fitted on (A) the reference window alone,
 * (B) the window plus the newest measured sample pose-scheduled, (C) B plus state lags — scored
 * leave-one-program-out over the diet and on the SQUARE's own converged prefix, which no fit sees.
 */
import { machine, settle, commissionComp } from '../flexisim/_rig.mjs';
import { makeArmHost } from '../../lib/flexisim/autohost.js';
import { sharpRect } from '../../lib/flexisim/toolpath.js';
const K = +(process.env.ARM_K || 0.25), E = +(process.env.ARM_E || 0.03), F = 4e-3;
const path = sharpRect({ w: 8, h: 8, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40 });
const LAP = Math.ceil(path.lap);
const m0 = await machine({ K, E });
const host = makeArmHost({
  makeMachine: async () => { const m = await machine({ K, E }); const rc = commissionComp(m.arm, m.servo); const c0 = path.at(0); const [q1, q2] = m.arm.ik(c0.x, c0.y, true); settle(m.arm, m.servo, q1, q2); return { arm: m.arm, l1: m.l1, l2: m.l2, servo: m.servo, rc }; },
  path, lap: LAP, K, centre: m0.arm.ik(12, 0, true), classic: false, maxDepth: 1, demo: null, lapMemory: false, distil: {},
  distilDiet: { feeds: [F, F], rMin: 3.4, rSpan: 2.4 }, avg: 2, warmup: 1, passes: 8, probeLaps: { warmup: 1, avg: 1 },
});
host.auto.pilotOpts.start = m0.arm.ik(path.at(0).x, path.at(0).y, true);
const rep = await host.auto.commission({ run: host.run, drivePilot: host.drivePilot, recordDemo: host.recordDemo, distilRuns: host.distilRuns });
console.log(`commissioned: ${rep.base.toExponential(4)} -> ${rep.best.toExponential(4)} (${rep.gain.toFixed(2)}x); distil ${rep.deployed.distil}; fit held-out R² ${JSON.stringify((host.auto.distil && host.auto.distil.fit && host.auto.distil.fit.heldOutR2 || []).map((v) => +v.toFixed(3)))}`);
const diet = host.auto._distilDiet || [];
if (!diet.length) { console.log('no retained diet'); process.exit(0); }
const S = host.auto.built.stack ? host.auto.built.stack.sample : 9;
// the square's own converged prefix — the teacher is the cascade the ladder built, put back for this
const sq = (await host.distilRuns({ paths: [path] }))[0];
const prevStack = host.auto.stack; host.auto.stack = host.auto.built.stack;
const rsq = await sq.converge();
host.auto.stack = prevStack;
const sqPrefix = Array.from({ length: sq.lap }, (_, k) => rsq.at(k));
console.log(`square prefix converged: ${rsq.base.toExponential(4)} -> ${rsq.best.toExponential(4)} (${(rsq.base / rsq.best).toFixed(2)}x)`);
// ---- run every program WITH its prefix applied, tapping the state
const progs = [];
const capture = async (tr, prefix, name) => {
  const cap = []; const L = tr.lap;
  const r = await tr.run({ at: (k) => prefix[((k % L) + L) % L] }, { laps: 3, tap: (nn, k, m, t) => cap.push({ m, t }) });
  progs.push({ name, tr, prefix, cap, L });
  console.log(`  ${name.padEnd(10)} lap ${L}: with its prefix ${r.score.toExponential(4)}, ${cap.length.toLocaleString()} steps tapped`);
};
for (let i = 0; i < diet.length; i++) await capture(diet[i].tr, diet[i].target, `polygon ${i}`);
await capture(sq, sqPrefix, 'square');
// ---- features at a decision step k (steps), target = the prefix at k
const OFFS = [-256, -128, -64, -32, -16, -8, -4, -2, -1, 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256];
const trig = (m) => { const c0 = Math.cos(m[0]), s0 = Math.sin(m[0]), c1 = Math.cos(m[1]), s1 = Math.sin(m[1]); return [c0, s0, c1, s1, c0 * c1, c0 * s1, s0 * c1, s0 * s1]; };
const refRow = (P, k) => { const r0 = P.tr.refAt(k); const f = [1, ...r0]; for (const o of OFFS) { const r = P.tr.refAt(k + o * S); for (let j = 0; j < r0.length; j++) f.push(r[j] - r0[j]); } return f; };
const at = (P, k) => P.cap[Math.max(0, Math.min(P.cap.length - 1, k))].m;
const stateRow = (P, k) => { const m = at(P, k), q = P.tr.refAt(k); const base = [m[0] - q[0], m[1] - q[1], m[2], m[3], m[4], m[5]]; const tg = trig(m); const f = [...m]; for (const a of base) for (const t of tg) f.push(a * t); return f; };
const lagRow = (P, k) => { const f = []; for (const l of [1, 4, 16]) f.push(...at(P, k - l * S)); return f; };
// D: the GENERIC scheduling — an order-2 polynomial of the measured positions normalised to the
// channels' declared box, with its order-0 term — the form the shipped block can carry without
// knowing the channels are angles (plan §52.25).
const CH = host.auto.channels;
const polyOf = (m) => { const n = [0, 1].map((c) => (m[c] - (CH[c].lo + CH[c].hi) / 2) / ((CH[c].hi - CH[c].lo) / 2)); return [1, n[0], n[1], n[0] * n[0], n[0] * n[1], n[1] * n[1]]; };
const stateRowPoly = (P, k) => { const m = at(P, k), q = P.tr.refAt(k); const base = [m[0] - q[0], m[1] - q[1], m[2], m[3], m[4], m[5]]; const sv = polyOf(m); const f = [m[0], m[1]]; for (const a of base) for (const t of sv) f.push(a * t); return f; };
// E and F split D into the part that needs NO measurement — the reference's own newest sample
// (speed and rigid torque, from the reference, scheduled by the REFERENCE pose) — and the part
// that is feedback: the measured DEVIATION from that reference sample, scheduled the same way.
// Whichever carries D's R² decides whether the state term can deploy at all (plan §52.27).
const refSample = (P, k) => { const q = P.tr.refAt(k), qa = P.tr.refAt(k - S), qb = P.tr.refAt(k + S); return [q[0], q[1], (qb[0] - qa[0]) / (2 * S) * 1e3, (qb[1] - qa[1]) / (2 * S) * 1e3, q[2] * TSC, q[3] * TSC]; };
const TSC = m0.servo.tauMax * 1e3; // reference joint torque (scaled by tauMax·N) back to MOTOR torque, ×1e3 as measVec
const schedRow = (base, pos, head) => { const sv = polyOf(pos); const f = [...head]; for (const a of base) for (const t of sv) f.push(a * t); return f; };
const stateRowRefOnly = (P, k) => { const r = refSample(P, k); return schedRow([r[2], r[3], r[4], r[5]], r, [r[0], r[1]]); };
const stateRowDev = (P, k) => { const m = at(P, k), r = refSample(P, k); return schedRow([m[0] - r[0], m[1] - r[1], m[2] - r[2], m[3] - r[3], m[4] - r[4], m[5] - r[5]], r, []); };
// THE ONE TERM MEASURED ABOVE THE REFERENCE WINDOW'S CEILING IS THE MEASURED DEVIATION (F,
// R2 0.962 against A's 0.836), and deployed it is worse than not having it — 3.24x against
// 6.04x, even fitted with the policy in the loop over aggregated rounds. The reading in §52.27
// was that the plant answers 951 steps later, so a loop closed on the deviation rings. That is a
// statement about the FAST part of the deviation. The SLOW part — a bias that persists far longer
// than the plant's own rise — is a trim, and a loop closed on it has almost no gain at the
// frequency that rings. So the question §52.27 never separated: how much of F's lift survives
// when the deviation is averaged over a window LONGER than the 951-step response, which is the
// only form of it this plant can safely be given (rule 39: bias and oscillation are different
// mechanisms and one rms hides both).
const devAvg = (P, k, W) => { const r = refSample(P, k); const a = [0, 0, 0, 0, 0, 0]; let n = 0;
  for (let j = k - W; j <= k; j += S) { const m = at(P, j), q = refSample(P, j); for (let c = 0; c < 6; c++) a[c] += m[c] - q[c]; n++; }
  for (let c = 0; c < 6; c++) a[c] /= (n || 1); return schedRow(a, r, []); };
// A RECURSIVE STATE, WHICH IS THE ONE THING NO EXPERIMENT IN THIS ARC HAS TRIED (plan §52.36).
// Every capacity experiment here added more FUNCTIONS OF THE SAME TRUNCATED WINDOW; none added
// MEMORY. And FIR is now closed from both ends by measurement: `modes.mjs` puts this plant's
// impulse memory at ~7,850 raw steps, the arm's program lap is 7,356, so a window that REACHES
// the memory SPANS the lap and §41's aliasing theorem bites — measured, +/-4096 at preserved
// spacing reads 3.19e-1 against the shipped 1.75e-1 — while reaching it by SCALING the same taps
// loses the resolution instead (§52.16's x2/x3). A second-order resonator driven by the commanded
// reference has no window at all: it reaches arbitrarily far back in O(1) state and O(1)
// arithmetic, so it is subject to neither failure, and it is still a function of the COMMANDED
// REFERENCE alone — no tracker, no lap index, admissible under the retirement.
//
// The bank is a geometric ladder of periods with no per-plant constant: the ridge selects, which
// is what rule 40 asks (learn what has no closed form, compute what does). It brackets the
// measured 3,166-3,868-step ring by a wide margin so that nothing here is fitted to it.
const RES_T = (process.env.REST || '850,1700,3400,6800,13600').split(',').map(Number);
const RES_Z = +(process.env.RESZ || 0.27);      // from the measured 5.6x decay per cycle
/**
 * Run the bank over one closed lap of a program and return `(k) -> states`. Driven by the
 * reference ANGLE of each channel, so the two state variables are a band-passed and an
 * integrated view of the command's own history. The lap is CLOSED, so the filter is warmed over
 * several laps before the states are kept — a resonator started at rest reads its own startup
 * transient for as long as its memory, which is the whole quantity being measured (rule 13).
 */
const resonators = (P) => {
  const L = P.L, nT = RES_T.length, nc = 2, warm = 4;
  const st = Array.from({ length: nT * nc }, () => ({ x: 0, v: 0 }));
  const out = Array.from({ length: L }, () => new Float64Array(nT * nc * 2));
  for (let pass = 0; pass < warm + 1; pass++) {
    for (let k = 0; k < L; k++) {
      const q = P.tr.refAt(k);
      for (let t = 0; t < nT; t++) {
        const w = 2 * Math.PI / RES_T[t];
        for (let c = 0; c < nc; c++) {
          const e = st[t * nc + c];
          // semi-implicit Euler at dt = 1 raw step: stable for w << 1, which every period here is
          e.v += (w * w * (q[c] - e.x) - 2 * RES_Z * w * e.v);
          e.x += e.v;
          if (pass === warm) { const b = (t * nc + c) * 2; out[k][b] = e.x - q[c]; out[k][b + 1] = e.v / w; }
        }
      }
    }
  }
  return (k) => out[((k % L) + L) % L];
};
const RES = new Map();
const resRow = (P, k) => { if (!RES.has(P.name)) RES.set(P.name, resonators(P)); return Array.from(RES.get(P.name)(k)); };
// THE DEVIATION AS A SLOW PARAMETER OF THE MAP, NOT AS A TERM ADDED TO IT (plan §52.42).
// §52.27 measured that the newest measured DEVIATION carries the content the reference window
// lacks (0.836 -> 0.962) and §52.26/§52.27 measured that DEPLOYING it fails (1.44x offline-fitted,
// 3.24x fitted in the loop, both below the 6.04x of the map without it). §52.33 then measured the
// obvious remedy — SMOOTH it, so the correction has almost no gain at the frequency that rings —
// and found it worth LESS the more it is smoothed (0.906 / 0.756 / 0.664 at 256 / 1024 / 4096,
// the last two BELOW the window alone). That is the ADDITIVE form, and it is refuted.
//
// This is the multiplicative one, and it is a different object. A slow scalar ADDED to the
// correction contributes its own value; the same scalar MULTIPLYING the row changes the map's
// SHAPE without contributing anything of its own — at s = 0 the deployed controller is exactly
// the shipped one. So it is gain scheduling on a slow measured state rather than feedback
// through it, its bandwidth is the smoother's rather than the loop's, and it cannot excite the
// 3,400-step ring at any gain. It is addressed by the machine's STATE, so it is admissible under
// the retirement, and it is the one route §52.36 left open.
//
// THE RISK IS RULE 36 AND LOPO IS WHY THIS IS THE TEST. A scalar smoothed over thousands of steps
// is nearly constant within a program, so a modulated row can key WHICH PROGRAM is running and
// score beautifully in sample. A held-out program's scalar was never seen, so LOPO is the column
// that decides — and in-sample rising while LOPO falls is the signature this arc has produced six
// times already.
const devSlow = (P, k, W) => { const a = [0, 0]; let n = 0;
  for (let j = k - W; j <= k; j += S) { const m = at(P, j), q = refSample(P, j); a[0] += m[0] - q[0]; a[1] += m[1] - q[1]; n++; }
  return [a[0] / (n || 1), a[1] / (n || 1)]; };
// The row, then the row scaled by each slow scalar. Column scale is irrelevant — `fit` standardises
// every column by its own rms before the ridge — so no constant is chosen here (rule 32).
const modRow = (P, k, W) => { const r = refRow(P, k), sc = devSlow(P, k, W), out = r.slice();
  for (const m of sc) for (const x of r) out.push(m * x); return out; };
const sets = { 'A: reference window only (the shipped shape)': (P, k) => refRow(P, k),
  'R:  + a RESONATOR BANK driven by the reference': (P, k) => [...refRow(P, k), ...resRow(P, k)],
  'Rs: + the bank, pose-scheduled': (P, k) => [...refRow(P, k), ...schedRow(resRow(P, k), refSample(P, k), [])],
  'M256:  window MODULATED by the deviation averaged over 256 steps': (P, k) => modRow(P, k, 256),
  'M1024: window MODULATED by the deviation averaged over 1024 steps': (P, k) => modRow(P, k, 1024),
  'M4096: window MODULATED by the deviation averaged over 4096 steps': (P, k) => modRow(P, k, 4096),
  'Fa256:  + deviation AVERAGED over the last 256 steps': (P, k) => [...refRow(P, k), ...devAvg(P, k, 256)],
  'Fa1024: + deviation AVERAGED over the last 1024 steps': (P, k) => [...refRow(P, k), ...devAvg(P, k, 1024)],
  'Fa4096: + deviation AVERAGED over the last 4096 steps': (P, k) => [...refRow(P, k), ...devAvg(P, k, 4096)],
  'E: + newest REFERENCE sample, ref-pose scheduled': (P, k) => [...refRow(P, k), ...stateRowRefOnly(P, k)],
  'F: + measured DEVIATION from it, ref-pose scheduled': (P, k) => [...refRow(P, k), ...stateRowDev(P, k)],
  'G: E + F': (P, k) => [...refRow(P, k), ...stateRowRefOnly(P, k), ...stateRowDev(P, k)],
  'D: + newest sample, order-2 POLYNOMIAL scheduled': (P, k) => [...refRow(P, k), ...stateRowPoly(P, k)],
  'B: + newest measured sample, pose-scheduled': (P, k) => [...refRow(P, k), ...stateRow(P, k)],
  'C: B + measured lags at 1, 4, 16 samples': (P, k) => [...refRow(P, k), ...stateRow(P, k), ...lagRow(P, k)] };
const tgt = (P, k) => P.prefix[((k % P.L) + P.L) % P.L];
// ---- normal-matrix fits (from observe.mjs)
const accumulate = (f, P, from, to) => { const nt = 2; let A = null, b = null, yy = [0, 0], sy = [0, 0], n = 0, dim = 0;
  for (let k = from; k < Math.min(to, P.cap.length); k += S) { const x = f(P, k); if (!A) { dim = x.length; A = new Float64Array(dim * dim); b = [new Float64Array(dim), new Float64Array(dim)]; } const t = tgt(P, k);
    for (let i = 0; i < dim; i++) { const xi = x[i]; b[0][i] += xi * t[0]; b[1][i] += xi * t[1]; const ro = i * dim; for (let j = i; j < dim; j++) A[ro + j] += xi * x[j]; }
    yy[0] += t[0] * t[0]; yy[1] += t[1] * t[1]; sy[0] += t[0]; sy[1] += t[1]; n++; }
  for (let i = 0; i < dim; i++) for (let j = 0; j < i; j++) A[i * dim + j] = A[j * dim + i]; return { A, b, yy, sy, n, dim }; };
const addAcc = (a, c) => { if (!a) return { A: c.A.slice(), b: c.b.map((v) => v.slice()), yy: c.yy.slice(), sy: c.sy.slice(), n: c.n, dim: c.dim }; for (let i = 0; i < a.A.length; i++) a.A[i] += c.A[i]; for (let ch = 0; ch < 2; ch++) { for (let i = 0; i < a.dim; i++) a.b[ch][i] += c.b[ch][i]; a.yy[ch] += c.yy[ch]; a.sy[ch] += c.sy[ch]; } a.n += c.n; return a; };
const fit = (acc, lam) => { const n = acc.dim, sc = new Float64Array(n); for (let i = 0; i < n; i++) sc[i] = Math.sqrt(acc.A[i * n + i] / acc.n) || 1;
  const M = new Float64Array(n * n); for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) M[i * n + j] = acc.A[i * n + j] / (sc[i] * sc[j]); M[i * n + i] += lam * acc.n; }
  const Lc = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s2 = M[i * n + j]; for (let k = 0; k < j; k++) s2 -= Lc[i * n + k] * Lc[j * n + k]; Lc[i * n + j] = i === j ? Math.sqrt(Math.max(s2, 1e-300)) : s2 / Lc[j * n + j]; }
  return acc.b.map((bc) => { const z = new Float64Array(n); for (let i = 0; i < n; i++) { let s2 = bc[i] / sc[i]; for (let k = 0; k < i; k++) s2 -= Lc[i * n + k] * z[k]; z[i] = s2 / Lc[i * n + i]; } const ws = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s2 = z[i]; for (let k = i + 1; k < n; k++) s2 -= Lc[k * n + i] * ws[k]; ws[i] = s2 / Lc[i * n + i]; } const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = ws[i] / sc[i]; return w; }); };
const r2on = (acc, W) => W.map((w, ch) => { let wb = 0, wAw = 0; for (let i = 0; i < acc.dim; i++) { wb += w[i] * acc.b[ch][i]; let s2 = 0; for (let j = 0; j < acc.dim; j++) s2 += acc.A[i * acc.dim + j] * w[j]; wAw += w[i] * s2; } const ss = acc.yy[ch] - 2 * wb + wAw, st = acc.yy[ch] - acc.sy[ch] * acc.sy[ch] / acc.n; return 1 - ss / st; });
const fmt = (r) => r.map((v) => (Math.abs(v) < 10 ? v.toFixed(3) : v.toFixed(0))).join('/');
const dietP = progs.slice(0, -1), sqP = progs[progs.length - 1];
console.log(`\n  the converged prefix regressed on each row shape (rows at stride ${S}); LOPO over the diet, and fitted on the whole diet -> the SQUARE's prefix:`);
for (const [name, f] of Object.entries(sets)) {
  const accs = new Map(); for (const P of progs) accs.set(P.name, accumulate(f, P, P.L + 64 * S, P.cap.length));
  let all = null; for (const P of dietP) all = addAcc(all, accs.get(P.name));
  for (const lam of [1e-4, 1e-3, 1e-2]) {
    let lopo = 0; for (const P of dietP) { let tr = null; for (const Q of dietP) if (Q !== P) tr = addAcc(tr, accs.get(Q.name)); const r = r2on(accs.get(P.name), fit(tr, lam)); lopo += (r[0] + r[1]) / 2; } lopo /= dietP.length;
    const W = fit(all, lam);
    console.log(`    ${name.padEnd(48)} ${String(all.dim).padStart(4)} cols  λ ${String(lam).padEnd(6)} LOPO ${lopo.toFixed(3)}   in-sample ${fmt(r2on(all, W))}   SQUARE ${fmt(r2on(accs.get(sqP.name), W))}`);
  }
}
await host.dispose(); await m0.l1.destroy(); await m0.l2.destroy();
