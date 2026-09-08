/**
 * IS THE RESIDUAL OBSERVABLE FROM THE MOTOR SIDE, THROUGH WHAT LIFT, AND WITH WHAT INSTRUMENT?
 * (plan §52.21, §52.22)
 *
 * The distilled policy leaves link ringing and wind-up. A full-state controller could only damp
 * it if that state can be RECONSTRUCTED from what the deployed machine reads. This runs the
 * distilled machine — the policy armed exactly as deployed — on the polygon DIET and on three
 * programs the fit will never see, taps every step (motor angles, speeds, torques; the truth;
 * and instruments a customer could bolt on), accumulates ONE normal matrix per program over a
 * library of ~300 columns in named GROUPS, and then answers every question below by solving
 * sub-matrices, so a thousand fits cost what one accumulation costs:
 *
 *   sets     nested feature sets — the command window, linear motor lags, a quadratic lift, an
 *            ENERGY lift (the quadratic forms an energy is made of, windowed ∑τ·ω, configuration
 *            trig), the pilot's own row shape; and the INSTRUMENTS: a tool accelerometer, link
 *            strain (tip deflections and slope), gearbox wind-up.
 *   scoring  fitted on the pooled diet and scored on programs never fitted — the claim — beside
 *            later laps of the fitted square, the memory control that reads 0.9-1.0 for anything.
 *   SELECT=1 greedy forward selection over the groups, scored LEAVE-ONE-PROGRAM-OUT over the
 *            diet (never in-sample, rule 36), reported with the never-fitted programs' scores at
 *            every step — does a small transferable subset of the energy library exist?
 */
import { machine, settle, commissionComp } from '../flexisim/_rig.mjs';
import { makeArmHost } from '../../lib/flexisim/autohost.js';
import { sharpRect, roundedRect, circle } from '../../lib/flexisim/toolpath.js';
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
const t0 = Date.now();
const rep = await host.auto.commission({ run: host.run, drivePilot: host.drivePilot, recordDemo: host.recordDemo, distilRuns: host.distilRuns });
console.log(`\ncommissioned: ${rep.base.toExponential(4)} -> ${rep.best.toExponential(4)} (${rep.gain.toFixed(2)}x) in ${Math.round((Date.now() - t0) / 1000)} s; distil ${rep.deployed.distil}`);
if (!rep.deployed.distil) { console.log('the distilled policy did not deploy; nothing to observe'); process.exit(0); }
const S = host.auto.stack ? host.auto.stack.sample : 9;   // the pilot's cadence, as the lag spacing
const HLAPS = +(process.env.HLAPS || 4);
// ---- every program through the SAME tap, the policy armed as deployed, held between decisions
const heldPolicy = (p, tr) => { const st = p.stride || 1; let held = [0, 0]; return { at: (k) => { if (k % st === 0) held = p.act(tr.refAt, k, tr.speedAt(k)); return held; } }; };
const capture = async (tr, name, laps) => {
  const cap = [];
  const r = await tr.run(heldPolicy(host.auto.distil, tr), { laps, tap: (nn, k, m, t, x) => cap.push({ m, t, x }) });
  const P = { name, cap, LAP: tr.lap, q: (k) => tr.refAt(k).slice(0, 2) };
  const N = cap.length; P.P1 = new Float64Array(N + 1); P.P2 = new Float64Array(N + 1);
  for (let k = 0; k < N; k++) { const m = cap[k].m; P.P1[k + 1] = P.P1[k] + m[4] * m[2]; P.P2[k + 1] = P.P2[k] + m[5] * m[3]; }
  // A TOOL ACCELEROMETER, read from the tool's own position: a central second difference over
  // the pilot's cadence, plus 5% white noise so a perfect instrument is not what is scored.
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  P.acc = new Array(N); let s2 = 0;
  for (let k = 0; k < N; k++) { const a = Math.max(S, Math.min(N - 1 - S, k)); const p0 = cap[a].x.tool, pm = cap[a - S].x.tool, pp = cap[a + S].x.tool; const ax = (pp[0] - 2 * p0[0] + pm[0]) / (S * S), ay = (pp[1] - 2 * p0[1] + pm[1]) / (S * S); P.acc[k] = [ax, ay]; s2 += ax * ax + ay * ay; }
  const sig = 0.05 * Math.sqrt(s2 / (2 * N)); for (let k = 0; k < N; k++) { P.acc[k][0] += sig * gauss(); P.acc[k][1] += sig * gauss(); }
  let e2 = 0; for (let k = P.LAP; k < N; k++) e2 += cap[k].t[0] ** 2 + cap[k].t[1] ** 2;
  console.log(`  recorded ${cap.length.toLocaleString()} steps (${laps} laps) of the ${name} (lap ${tr.lap}): score ${r.score.toExponential(4)}, residual rms ${Math.sqrt(e2 / (N - P.LAP)).toExponential(3)}`);
  return P;
};
const dietRuns = await host.distilRuns();
const diet = []; for (let i = 0; i < dietRuns.length; i++) diet.push(await capture(dietRuns[i], `polygon ${i}`, HLAPS));
const heldRuns = await host.distilRuns({ paths: [path,
  circle({ r: 4, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40 }),
  roundedRect({ w: 8, h: 8, r: 1.5, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40, closed: true })] });
const square = await capture(heldRuns[0], 'square', HLAPS + 2);
const held = [square, await capture(heldRuns[1], 'circle', HLAPS), await capture(heldRuns[2], 'rounded', HLAPS)];
// ---- THE LIBRARY, in named groups. Every column is a function of (program, k).
const CMD_OFFS = [-256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256].map((o) => o * S);
const LAGS = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64].map((l) => l * S);
const MLAGS_Q = [0, 1, 2, 4, 8, 16, 32].map((l) => l * S);
const EW = [32, 128, 512, 2048];
const groups = [];   // { name, kind, fn(P,k) -> number[] }
const at = (P, k) => P.cap[Math.max(0, Math.min(P.cap.length - 1, k))];
groups.push({ name: 'bias', kind: 'base', fn: () => [1] });
groups.push({ name: 'cmd', kind: 'cmd', fn: (P, k) => { const q0 = P.q(k); const f = [q0[0], q0[1]]; for (const o of CMD_OFFS) { if (o === 0) continue; const qo = P.q(k + o); f.push(qo[0] - q0[0], qo[1] - q0[1]); } return f; } });
for (const l of LAGS) groups.push({ name: `m@${l}`, kind: 'motor', fn: (P, k) => at(P, k - l).m.slice() });
for (const l of MLAGS_Q) groups.push({ name: `E@${l}`, kind: 'energy', fn: (P, k) => { const r = at(P, k - l).m, w1 = r[2], w2 = r[3], t1 = r[4], t2 = r[5], c2 = Math.cos(r[1]); return [w1 * w1, w2 * w2, w1 * w2, w1 * w1 * c2, w1 * w2 * c2, t1 * t1, t2 * t2, t1 * t2, t1 * w1, t2 * w2, t1 * w2, t2 * w1]; } });
for (const W of EW) groups.push({ name: `P@${W}`, kind: 'energy', fn: (P, k) => { const a = Math.max(0, k - W); return [P.P1[k + 1] - P.P1[a], P.P2[k + 1] - P.P2[a]]; } });
groups.push({ name: 'trig', kind: 'energy', fn: (P, k) => { const r = at(P, k).m; return [Math.cos(r[0]), Math.sin(r[0]), Math.cos(r[1]), Math.sin(r[1]), Math.cos(r[0] + r[1]), Math.sin(r[0] + r[1])]; } });
for (const l of LAGS) groups.push({ name: `acc@${l}`, kind: 'accel', fn: (P, k) => P.acc[Math.max(0, k - l)].slice() });
for (const l of LAGS) groups.push({ name: `str@${l}`, kind: 'strain', fn: (P, k) => { const x = at(P, k - l).x; return [x.w[0], x.w[1], x.s1]; } });
for (const l of LAGS) groups.push({ name: `wu@${l}`, kind: 'windup', fn: (P, k) => at(P, k - l).x.wu.slice() });
// POSE-SCHEDULED blocks (rule 40's generic form): the map from a stored state to the tool is
// geometry through the configuration, so the state readings are multiplied by the pose's sines
// and cosines. `sched_m0`: the newest motor-side sample and the command, scheduled — deployable.
// `sched_inst`: the instruments' newest readings, scheduled — the learned composition an
// installed strain gauge or load-side encoder would need.
const trigOf = (P, k) => { const r = at(P, k).m; return [Math.cos(r[0]), Math.sin(r[0]), Math.cos(r[1]), Math.sin(r[1]), Math.cos(r[0] + r[1]), Math.sin(r[0] + r[1])]; };
const sched = (v, tg) => { const out = []; for (const a of v) for (const b of tg) out.push(a * b); return out; };
groups.push({ name: 'sched_m0', kind: 'sched', fn: (P, k) => { const r = at(P, k).m, q0 = P.q(k); return sched([r[0] - q0[0], r[1] - q0[1], r[2], r[3], r[4], r[5]], trigOf(P, k)); } });
groups.push({ name: 'sched_inst', kind: 'schedinst', fn: (P, k) => { const x = at(P, k).x; return sched([x.wu[0], x.wu[1], x.w[0], x.w[1], x.s1], trigOf(P, k)); } });
// the quadratic lift is too wide for one matrix beside everything else; it is its own library
const quad = (v) => { const out = []; for (let i = 0; i < v.length; i++) for (let j = i; j < v.length; j++) out.push(v[i] * v[j]); return out; };
const quadGroup = { name: 'quad', kind: 'quad', fn: (P, k) => { const v = []; for (const l of MLAGS_Q) v.push(...at(P, k - l).m); return quad(v); } };
// column layout
const layout = (gs) => { let off = 0; const cols = new Map(); for (const g of gs) { const n = g.fn(square, square.LAP + 1).length; cols.set(g.name, { off, n }); off += n; } return { cols, dim: off }; };
let LIB = layout(groups);
console.log(`  library: ${groups.length} groups, ${LIB.dim} columns; pilot cadence ${S}`);
// ---- ONE ACCUMULATION PER PROGRAM (and per lead): A = XᵀX, b = Xᵀy, yy, sy, n
// TARGET=wu: the target is the gearbox WIND-UP rather than the tool error — what an external
// (load-side) encoder present during commissioning would supply as truth for a soft sensor.
// TARGET=bend: the links' tip deflections (a strain gauge present during commissioning).
const TARGET = process.env.TARGET || 'residual';
const targetOf = (P, k) => TARGET === 'wu' ? P.cap[k].x.wu : TARGET === 'bend' ? P.cap[k].x.w : P.cap[k].t;
const accumulate = (gs, L, P, from, to, lead, tf = targetOf) => {
  const nt = tf(P, from).length;
  const A = new Float64Array(L.dim * L.dim), b = Array.from({ length: nt }, () => new Float64Array(L.dim));
  let yy = new Array(nt).fill(0), sy = new Array(nt).fill(0), n = 0; const x = new Float64Array(L.dim);
  for (let k = from; k + lead < Math.min(to, P.cap.length); k++) {
    let o = 0; for (const g of gs) { const v = g.fn(P, k); for (let i = 0; i < v.length; i++) x[o++] = v[i]; }
    const t = tf(P, k + lead);
    for (let i = 0; i < L.dim; i++) { const xi = x[i]; if (xi === 0) continue; for (let c = 0; c < nt; c++) b[c][i] += xi * t[c]; const ro = i * L.dim; for (let j = i; j < L.dim; j++) A[ro + j] += xi * x[j]; }
    for (let c = 0; c < nt; c++) { yy[c] += t[c] * t[c]; sy[c] += t[c]; } n++;
  }
  for (let i = 0; i < L.dim; i++) for (let j = 0; j < i; j++) A[i * L.dim + j] = A[j * L.dim + i];
  return { A, b, yy, sy, n, dim: L.dim };
};
const addAcc = (a, c) => { if (!a) return { A: c.A.slice(), b: c.b.map((v) => v.slice()), yy: c.yy.slice(), sy: c.sy.slice(), n: c.n, dim: c.dim }; for (let i = 0; i < a.A.length; i++) a.A[i] += c.A[i]; for (let ch = 0; ch < a.b.length; ch++) { for (let i = 0; i < a.dim; i++) a.b[ch][i] += c.b[ch][i]; a.yy[ch] += c.yy[ch]; a.sy[ch] += c.sy[ch]; } a.n += c.n; return a; };
// fit a column subset on `acc` (standardised ridge, Cholesky); returns raw-unit weights per channel
const fitSub = (acc, idx, lam) => {
  const n = idx.length, sc = new Float64Array(n);
  for (let i = 0; i < n; i++) sc[i] = Math.sqrt(acc.A[idx[i] * acc.dim + idx[i]] / acc.n) || 1;
  const M = new Float64Array(n * n);
  for (let i = 0; i < n; i++) { const ri = idx[i] * acc.dim; for (let j = 0; j < n; j++) M[i * n + j] = acc.A[ri + idx[j]] / (sc[i] * sc[j]); M[i * n + i] += lam * acc.n; }
  const Lc = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s2 = M[i * n + j]; for (let k = 0; k < j; k++) s2 -= Lc[i * n + k] * Lc[j * n + k]; Lc[i * n + j] = i === j ? Math.sqrt(Math.max(s2, 1e-300)) : s2 / Lc[j * n + j]; }
  return acc.b.map((_, ch) => {
    const z = new Float64Array(n); for (let i = 0; i < n; i++) { let s2 = acc.b[ch][idx[i]] / sc[i]; for (let k = 0; k < i; k++) s2 -= Lc[i * n + k] * z[k]; z[i] = s2 / Lc[i * n + i]; }
    // standardised weights first, raw units only once the back-substitution is complete
    const ws = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s2 = z[i]; for (let k = i + 1; k < n; k++) s2 -= Lc[k * n + i] * ws[k]; ws[i] = s2 / Lc[i * n + i]; }
    const w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = ws[i] / sc[i];
    return w;
  });
};
// R² of raw-unit weights on another program's accumulation: ss = yy - 2 w·b + wᵀAw
const r2on = (acc, idx, W) => W.map((_, ch) => {
  const w = W[ch]; let wb = 0, wAw = 0;
  for (let i = 0; i < idx.length; i++) { wb += w[i] * acc.b[ch][idx[i]]; const ri = idx[i] * acc.dim; let s2 = 0; for (let j = 0; j < idx.length; j++) s2 += acc.A[ri + idx[j]] * w[j]; wAw += w[i] * s2; }
  const ss = acc.yy[ch] - 2 * wb + wAw, st = acc.yy[ch] - acc.sy[ch] * acc.sy[ch] / acc.n;
  return 1 - ss / st;
});
const idxOf = (L, names) => { const out = []; for (const nm of names) { const c = L.cols.get(nm); for (let i = 0; i < c.n; i++) out.push(c.off + i); } return out; };
const fmt = (r) => r.map((v) => (Math.abs(v) < 10 ? v.toFixed(3) : v.toFixed(0))).join('/');
// ---- THE CHAIN (plan §52.23): instruments present at COMMISSIONING ONLY. Stage 1 learns the
// hidden states — both wind-ups, both tip deflections, link 1's slope — from the motor side and
// the command, with the load-side encoder and the strain gauge as truth; stage 2 composes the
// ESTIMATED states, pose-scheduled, into the tool error with the tracker as truth. Deployed with
// neither instrument. Stage 1 is fitted on the diet and evaluated everywhere, so on the diet its
// estimates are in-sample, which flatters the chain's LOPO slightly and not its never-fitted columns.
{
  const g1 = [groups[0], groups[1], ...groups.filter((g) => g.kind === 'motor')], L1 = layout(g1);
  const hidden = (P, k) => { const x = P.cap[k].x; return [x.wu[0], x.wu[1], x.w[0], x.w[1], x.s1]; };
  let a1 = null; for (const P of diet) a1 = addAcc(a1, accumulate(g1, L1, P, P.LAP, P.cap.length, 0, hidden));
  const idx1 = idxOf(L1, g1.map((g) => g.name)), W1 = fitSub(a1, idx1, 1e-3);
  const x1 = new Float64Array(L1.dim);
  for (const P of [...diet, ...held]) {
    P.est = new Array(P.cap.length);
    for (let k = 0; k < P.cap.length; k++) { let o = 0; for (const g of g1) { const v = g.fn(P, k); for (let i = 0; i < v.length; i++) x1[o++] = v[i]; } P.est[k] = W1.map((w) => { let s2 = 0; for (let i = 0; i < w.length; i++) s2 += w[i] * x1[i]; return s2; }); }
  }
  const r2h = held.map((P) => r2on(accumulate(g1, L1, P, P.LAP, P.cap.length, 0, hidden), idx1, W1).map((v) => v.toFixed(3)).join('/'));
  console.log(`  stage 1 (motor side -> wu1/wu2/w1/w2/s1), fitted on the diet, R² on square | circle | rounded: ${r2h.join(' | ')}`);
  groups.push({ name: 'est', kind: 'chain', fn: (P, k) => P.est[k].slice() });
  groups.push({ name: 'sched_est', kind: 'chain', fn: (P, k) => sched(P.est[k], trigOf(P, k)) });
  LIB = layout(groups);
}
const k0 = 64 * S + 1;
const LEADS = (process.env.LEADS || '0').split(',').map(Number);
const LAMS = (process.env.RIDGE || '1e-4,1e-3,1e-2,1e-1').split(',').map(Number);
// ---- the named sets, as group lists
const gm = (kind) => groups.filter((g) => g.kind === kind).map((g) => g.name);
const lay = host.auto.built.stack && host.auto.built.stack.layers && host.auto.built.stack.layers[0];
const ro = lay && lay.readouts && lay.readouts[0];
if (ro) console.log(`  the pilot's own reach: sample ${lay.sample}, ${ro.mLag} measured lags at stride ${ro.stride}, command -${(ro.fLag - 1) * ro.stride * lay.sample}..+${ro.leads[Math.min(lay.N, ro.leads.length) - 1] * lay.sample} steps`);
const sets = {
  'command window only (feedforward can see)': ['bias', 'cmd'],
  '+ motor-side lags, linear (the pilot\'s shape)': ['bias', 'cmd', ...gm('motor')],
  '+ ENERGY lift (physical quadratics, power integrals)': ['bias', 'cmd', ...gm('motor'), ...gm('energy')],
  'motor-side lags ALONE, linear (no command)': ['bias', ...gm('motor')],
  'ENERGY lift + motor lags ALONE (no command)': ['bias', ...gm('motor'), ...gm('energy')],
  'INSTRUMENT: + tool ACCELEROMETER lags (5% noise)': ['bias', 'cmd', ...gm('motor'), ...gm('accel')],
  'INSTRUMENT: + link STRAIN lags (tip deflections, slope)': ['bias', 'cmd', ...gm('motor'), ...gm('strain')],
  'INSTRUMENT: + gearbox WIND-UP lags': ['bias', 'cmd', ...gm('motor'), ...gm('windup')],
  'INSTRUMENT: accelerometer ALONE + motor lags (no command)': ['bias', ...gm('motor'), ...gm('accel')],
  'INSTRUMENT: all three + motor lags + command': ['bias', 'cmd', ...gm('motor'), ...gm('accel'), ...gm('strain'), ...gm('windup')],
  'SCHEDULED: motor lags + command + pose-scheduled newest sample': ['bias', 'cmd', ...gm('motor'), 'sched_m0'],
  'SCHEDULED: + energy lift': ['bias', 'cmd', ...gm('motor'), ...gm('energy'), 'sched_m0'],
  'INSTRUMENT SCHEDULED: strain + wind-up lags, their newest readings pose-scheduled': ['bias', 'cmd', ...gm('motor'), ...gm('strain'), ...gm('windup'), 'sched_inst'],
  'INSTRUMENT SCHEDULED: newest strain + wind-up, scheduled, NO lags': ['bias', 'cmd', 'm@0', 'str@0', 'wu@0', 'sched_inst'],
  'MINIMAL deployable: command + newest sample pose-scheduled (no lags)': ['bias', 'cmd', 'sched_m0'],
  'MINIMAL deployable + one motor lag block at the pilot\'s stride': ['bias', 'cmd', 'sched_m0', 'm@0', `m@${LAGS[6]}`],
  'THE OBSERVER the soft cell selected: command + scheduled sample + scheduled instruments': ['bias', 'cmd', 'sched_m0', 'sched_inst'],
  'CHAIN: command + scheduled sample + ESTIMATED states, scheduled (no instrument at deploy)': ['bias', 'cmd', 'sched_m0', 'est', 'sched_est'],
  'CHAIN + motor lags': ['bias', 'cmd', ...gm('motor'), 'sched_m0', 'est', 'sched_est'],
};
for (const lead of LEADS) {
  const tA = Date.now();
  const acc = new Map();
  for (const P of diet) acc.set(P.name, accumulate(groups, LIB, P, P.LAP, P.cap.length, lead));
  // the square split in two for the memory control: fit laps 2..H, test the last two
  acc.set('square:train', accumulate(groups, LIB, square, square.LAP, (HLAPS) * square.LAP, lead));
  acc.set('square:test', accumulate(groups, LIB, square, HLAPS * square.LAP, square.cap.length, lead));
  for (const P of held) acc.set(P.name, accumulate(groups, LIB, P, P.LAP, P.cap.length, lead));
  let dietAcc = null; for (const P of diet) dietAcc = addAcc(dietAcc, acc.get(P.name));
  console.log(`\n  lead ${lead}, target ${TARGET}: accumulated ${acc.size} programs in ${Math.round((Date.now() - tA) / 1000)} s`);
  // ---- memory control: fitted on the square's own laps
  console.log(`  A. fitted on the SQUARE's laps 2-${HLAPS}, scored on its last two laps (memory control) and on the circle / rounded, λ ${LAMS[0]}:`);
  for (const [name, gs] of Object.entries(sets)) {
    const idx = idxOf(LIB, gs), W = fitSub(acc.get('square:train'), idx, LAMS[0]);
    console.log(`    ${name.padEnd(60)} ${String(idx.length).padStart(4)}   ${fmt(r2on(acc.get('square:test'), idx, W)).padEnd(16)} ${fmt(r2on(acc.get('circle'), idx, W)).padEnd(16)} ${fmt(r2on(acc.get('rounded'), idx, W))}`);
  }
  // ---- the claim: fitted on the pooled diet, scored on programs never fitted, best ridge by LOPO
  console.log(`  B. fitted on the pooled diet (${diet.length} polygons), λ chosen leave-one-program-out, scored on SQUARE / CIRCLE / ROUNDED:`);
  const lopo = (idx, lam) => { let s2 = 0; for (const P of diet) { let tr = null; for (const Q of diet) if (Q !== P) tr = addAcc(tr, acc.get(Q.name)); const r = r2on(acc.get(P.name), idx, fitSub(tr, idx, lam)); s2 += (r[0] + r[1]) / 2; } return s2 / diet.length; };
  const bestLam = (idx) => { let best = null; for (const lam of LAMS) { const v = lopo(idx, lam); if (!best || v > best.v) best = { lam, v }; } return best; };
  for (const [name, gs] of Object.entries(sets)) {
    const idx = idxOf(LIB, gs), bl = bestLam(idx), W = fitSub(dietAcc, idx, bl.lam);
    console.log(`    ${name.padEnd(60)} ${String(idx.length).padStart(4)}  λ ${String(bl.lam).padEnd(6)} LOPO ${bl.v.toFixed(3)}   ${held.map((P) => fmt(r2on(acc.get(P.name), idx, W)).padEnd(16)).join(' ')}`);
  }
  // the quadratic lift, its own library
  if (lead === LEADS[0] && process.env.QUAD !== '0') {
    const gq = [groups[0], groups[1], ...groups.filter((g) => g.kind === 'motor'), quadGroup], LQ = layout(gq);
    const aq = new Map(); for (const P of [...diet, ...held]) aq.set(P.name, accumulate(gq, LQ, P, P.LAP, P.cap.length, lead));
    let dq = null; for (const P of diet) dq = addAcc(dq, aq.get(P.name));
    const idx = idxOf(LQ, gq.map((g) => g.name));
    let best = null; for (const lam of LAMS) { let s2 = 0; for (const P of diet) { let tr = null; for (const Q of diet) if (Q !== P) tr = addAcc(tr, aq.get(Q.name)); const r = r2on(aq.get(P.name), idx, fitSub(tr, idx, lam)); s2 += (r[0] + r[1]) / 2; } if (!best || s2 > best.v) best = { lam, v: s2 / diet.length }; }
    const W = fitSub(dq, idx, best.lam);
    console.log(`    ${'+ quadratic lift of the motor-side lags (NGRC / EDMD)'.padEnd(60)} ${String(idx.length).padStart(4)}  λ ${String(best.lam).padEnd(6)} LOPO ${best.v.toFixed(3)}   ${held.map((P) => fmt(r2on(aq.get(P.name), idx, W)).padEnd(16)).join(' ')}`);
  }
  // ---- SELECTION BY TRANSFER: greedy forward over groups, scored leave-one-program-out
  if (process.env.SELECT !== '0' && lead === LEADS[0]) {
    for (const [label, pool] of [['DEPLOYABLE groups (motor side, command, energy, scheduled)', groups.filter((g) => ['cmd', 'motor', 'energy', 'sched'].includes(g.kind))],
      ['ALL groups, instruments included', groups.filter((g) => g.kind !== 'base')]]) {
      console.log(`\n  C. greedy forward selection over ${label}, scored leave-one-program-out on the diet (mean R² over folds and channels):`);
      const chosen = ['bias']; let cur = lopo(idxOf(LIB, chosen), LAMS[0]), curLam = LAMS[0];
      for (let step = 0; step < 14; step++) {
        let best = null;
        for (const g of pool) {
          if (chosen.includes(g.name)) continue;
          const idx = idxOf(LIB, [...chosen, g.name]);
          for (const lam of LAMS) { const v = lopo(idx, lam); if (!best || v > best.v) best = { g: g.name, v, lam }; }
        }
        if (!best || best.v < cur + 0.005) { console.log(`    stop: no group adds 0.005 (best ${best ? best.g + ' ' + best.v.toFixed(3) : 'none'})`); break; }
        chosen.push(best.g); cur = best.v; curLam = best.lam;
        const idx = idxOf(LIB, chosen), W = fitSub(dietAcc, idx, curLam);
        console.log(`    + ${best.g.padEnd(9)} LOPO ${cur.toFixed(3)}  λ ${String(curLam).padEnd(6)} cols ${String(idx.length).padStart(4)}   never-fitted: ${held.map((P) => `${P.name} ${fmt(r2on(acc.get(P.name), idx, W))}`).join('   ')}`);
      }
    }
  }
}
await host.dispose(); await m0.l1.destroy(); await m0.l2.destroy();
