/**
 * IS THE RESIDUAL OBSERVABLE FROM THE MOTOR SIDE, AND THROUGH WHAT LIFT? (plan §52.21)
 *
 * The distilled policy leaves link ringing and wind-up on the square. A full-state controller
 * could only damp it if that state can be RECONSTRUCTED from what the deployed machine reads —
 * motor encoders, their speeds, the applied torques — through some lifting. This fits, offline,
 * the residual (the tool error in joint space, the truth) from nested feature sets and reports
 * held-out R²:
 *   (a) the COMMAND window alone  — what feedforward can ever see;
 *   (b) + lagged motor-side signals, LINEAR (the pilot's forecast, in shape);
 *   (c) + quadratic lifts of the same (an NGRC / EDMD-style lifted state);
 *   (d) + an ENERGY lift — only the quadratic forms an energy is made of (ω², ω1ω2, ω²cos θ2,
 *       τ², τ·ω) and the energy delivered through the motor port over a window (∑ τ·ω), plus
 *       the configuration's sines and cosines: a physical fifth of (c) with no plant constant;
 *   (e) the PILOT's own row shape, read from the teacher layer the ladder just built.
 * The gap (b)−(a) is what a linear observer buys; (c)−(b) what a nonlinear lift buys; (d)
 * against (c) whether an energy state is that lift's generic form; (e) whether a feedback layer
 * identified through `drivePilot` can see the residual at all.
 *
 * TWO VALIDATIONS, AND ONLY THE SECOND COUNTS (rule 36). Held-out LAPS of the square are the
 * first — cheap, and they cannot tell a model from a memory: a rich enough lift of a repeating
 * stream learns where in the lap it is, and the first version of this file read R² 1.000 there
 * for 2,747 features. So every fit is ALSO scored on programs the machine ran but the fit never
 * saw — the circle and the rounded rectangle, on the same distilled machine — and that column
 * is the observability claim. A lift that transfers is a plant model; one that does not is a
 * lap memory in a costume. MEASURED (plan §52.21): within-program everything reads 0.9-1.0;
 * across programs a LINEAR observer reads 0.3-0.6 on the bench and 0.3-0.8 on the soft cell, the
 * quadratic and energy lifts transfer worse at every ridge, and an energy state alone is not an
 * observer of this residual. Half the residual is observable from the motor side; half is not.
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
// ---- record the DISTILLED machine on the square: measured signals + truth, per step
const LAPS = +(process.env.LAPS || 6);
const square = { name: 'square', cap: [], LAP };
{
  const o0 = host.auto.observe.bind(host.auto);
  host.auto.distil.observe = () => false;      // no adaptation while we look
  host.auto.observe = (meas, truth) => { if (truth) square.cap.push({ m: meas.slice(), t: truth.slice() }); return o0(meas, null); };
  await host.run(null, null, LAPS, true);
  host.auto.observe = o0;
  const R = host.refsFor(m0.arm);
  square.q = (k) => R[((k % LAP) + LAP) % LAP];
}
console.log(`recorded ${square.cap.length.toLocaleString()} steps (${LAPS} laps) of the square on the distilled machine`);
// ---- and the SAME machine on two programs the fit will never see, the policy armed as deployed
const heldPolicy = (p, tr) => { const st = p.stride || 1; let held = [0, 0]; return { at: (k) => { if (k % st === 0) held = p.act(tr.refAt, k, tr.speedAt(k)); return held; } }; };
const heldRuns = await host.distilRuns({ paths: [
  circle({ r: 4, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40 }),
  roundedRect({ w: 8, h: 8, r: 1.5, centre: [12, 0], feed: F, accel: 4e-5, cornerDt: 40, closed: true })] });
const HLAPS = +(process.env.HLAPS || 3);
const held = [];
for (const [i, nm] of [['circle'], ['rounded rectangle']].map((a, i) => [i, a[0]])) {
  const tr = heldRuns[i], cap = [];
  const r = await tr.run(heldPolicy(host.auto.distil, tr), { laps: HLAPS, tap: (nn, k, m, t) => cap.push({ m, t }) });
  held.push({ name: nm, cap, LAP: tr.lap, q: (k) => tr.refAt(k).slice(0, 2) });
  console.log(`recorded ${cap.length.toLocaleString()} steps (${HLAPS} laps) of the ${nm}: ${r.score.toExponential(4)} with the policy armed`);
}
// ---- feature sets, each a function of (program, k)
const CMD_OFFS = [-256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256].map((o) => o * S);
const LAGS = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64].map((l) => l * S);
const MLAGS_Q = [0, 1, 2, 4, 8, 16, 32].map((l) => l * S);
const EW = [32, 128, 512, 2048];
const quad = (v) => { const out = []; for (let i = 0; i < v.length; i++) for (let j = i; j < v.length; j++) out.push(v[i] * v[j]); return out; };
const cmdWithin = (offs) => (P, k) => { const q0 = P.q(k); const f = [q0[0], q0[1]]; for (const o of offs) { if (o === 0) continue; const qo = P.q(k + o); f.push(qo[0] - q0[0], qo[1] - q0[1]); } return f; };
const motorAt = (offs) => (P, k) => { const f = []; for (const l of offs) { const r = P.cap[Math.max(0, k - l)].m; for (let j = 0; j < 6; j++) f.push(r[j]); } return f; };
const featsCmd = cmdWithin(CMD_OFFS), featsMotor = motorAt(LAGS);
const featsMotorQ = (P, k) => quad(motorAt(MLAGS_Q)(P, k));
// the energy lift needs a prefix sum of the power through each motor port, per program
for (const P of [square, ...held]) {
  const N = P.cap.length; P.P1 = new Float64Array(N + 1); P.P2 = new Float64Array(N + 1);
  for (let k = 0; k < N; k++) { const r = P.cap[k].m; P.P1[k + 1] = P.P1[k] + r[4] * r[2]; P.P2[k + 1] = P.P2[k] + r[5] * r[3]; }
}
const featsEnergy = (P, k) => {
  const f = [];
  for (const l of MLAGS_Q) {
    const r = P.cap[Math.max(0, k - l)].m, w1 = r[2], w2 = r[3], t1 = r[4], t2 = r[5], c2 = Math.cos(r[1]);
    f.push(w1 * w1, w2 * w2, w1 * w2, w1 * w1 * c2, w1 * w2 * c2, t1 * t1, t2 * t2, t1 * t2, t1 * w1, t2 * w2, t1 * w2, t2 * w1);
  }
  for (const W of EW) { const a = Math.max(0, k - W); f.push(P.P1[k + 1] - P.P1[a], P.P2[k + 1] - P.P2[a]); }
  const r0 = P.cap[k].m; f.push(Math.cos(r0[0]), Math.sin(r0[0]), Math.cos(r0[1]), Math.sin(r0[1]), Math.cos(r0[0] + r0[1]), Math.sin(r0[0] + r0[1]));
  return f;
};
const sets = {
  'command window only (feedforward can see)': (P, k) => [...featsCmd(P, k), 1],
  '+ motor-side lags, linear (the pilot\'s shape)': (P, k) => [...featsCmd(P, k), ...featsMotor(P, k), 1],
  '+ quadratic lift of the motor-side lags (NGRC / EDMD)': (P, k) => [...featsCmd(P, k), ...featsMotor(P, k), ...featsMotorQ(P, k), 1],
  '+ ENERGY lift (physical quadratics, power integrals)': (P, k) => [...featsCmd(P, k), ...featsMotor(P, k), ...featsEnergy(P, k), 1],
  'motor-side lags ALONE, linear (no command)': (P, k) => [...featsMotor(P, k), 1],
  'ENERGY lift + motor lags ALONE (no command)': (P, k) => [...featsMotor(P, k), ...featsEnergy(P, k), 1],
};
// ---- THE PILOT'S OWN SHAPE: its measured lags at its own offsets, and the command only within
// the reach its rows carry — `(fLag-1)·stride` behind to `leads[N-1]` ahead, in its samples.
{
  const lay = host.auto.built.stack && host.auto.built.stack.layers && host.auto.built.stack.layers[0];
  const ro = lay && lay.readouts && lay.readouts[0];
  if (ro) {
    const PS = lay.sample, mOffs = lay._lagOffsets(ro.mLag, ro.stride).map((o) => o * PS);
    const back = (ro.fLag - 1) * ro.stride * PS, ahead = ro.leads[Math.min(lay.N, ro.leads.length) - 1] * PS;
    console.log(`  the pilot's own reach: sample ${PS}, ${ro.mLag} measured lags at stride ${ro.stride} (${mOffs[mOffs.length - 1]} steps back), command -${back}..+${ahead} steps, against the policy's ±${256 * S}`);
    const fc = cmdWithin(CMD_OFFS.filter((o) => o >= -back && o <= ahead)), fm = motorAt(mOffs);
    sets['PILOT-SHAPED: its own motor lags + command within its reach'] = (P, k) => [...fc(P, k), ...fm(P, k), 1];
  } else console.log('  (no teacher stack to read the pilot\'s shape from)');
}
// ---- STREAMING ridge (standardised, Cholesky): the normal equations are accumulated row by
// row and no row is stored, so a pooled diet of programs at a thousand features fits in memory.
const accum = (f, P, from, to, lead, acc = null) => {
  let A = acc && acc.A, b = acc && acc.b, n = acc ? acc.n : 0, dim = acc ? acc.dim : 0;
  for (let k = from; k + lead < Math.min(to, P.cap.length); k++) {
    const x = f(P, k);
    if (!A) { dim = x.length; A = new Float64Array(dim * dim); b = [new Float64Array(dim), new Float64Array(dim)]; }
    const y0 = P.cap[k + lead].t[0], y1 = P.cap[k + lead].t[1];
    for (let i2 = 0; i2 < dim; i2++) { const xi = x[i2]; b[0][i2] += xi * y0; b[1][i2] += xi * y1; const ro = i2 * dim; for (let j = i2; j < dim; j++) A[ro + j] += xi * x[j]; }
    n++;
  }
  return { A, b, n, dim };
};
const solve = ({ A, b, n, dim }, lam) => {
  const sc = new Float64Array(dim); for (let j = 0; j < dim; j++) sc[j] = Math.sqrt(A[j * dim + j] / n) || 1;
  const M = new Float64Array(dim * dim);
  for (let i2 = 0; i2 < dim; i2++) for (let j = i2; j < dim; j++) { const v = A[i2 * dim + j] / (sc[i2] * sc[j]); M[i2 * dim + j] = v; M[j * dim + i2] = v; }
  for (let i2 = 0; i2 < dim; i2++) M[i2 * dim + i2] += lam * n;
  const L = new Float64Array(dim * dim);
  for (let i2 = 0; i2 < dim; i2++) for (let j = 0; j <= i2; j++) { let s2 = M[i2 * dim + j]; for (let k = 0; k < j; k++) s2 -= L[i2 * dim + k] * L[j * dim + k]; L[i2 * dim + j] = i2 === j ? Math.sqrt(Math.max(s2, 1e-300)) : s2 / L[j * dim + j]; }
  return b.map((bc) => {
    const z = new Float64Array(dim); for (let i2 = 0; i2 < dim; i2++) { let s2 = bc[i2] / sc[i2]; for (let k = 0; k < i2; k++) s2 -= L[i2 * dim + k] * z[k]; z[i2] = s2 / L[i2 * dim + i2]; }
    const w = new Float64Array(dim); for (let i2 = dim - 1; i2 >= 0; i2--) { let s2 = z[i2]; for (let k = i2 + 1; k < dim; k++) s2 -= L[k * dim + i2] * w[k]; w[i2] = s2 / L[i2 * dim + i2]; }
    return (x) => { let s2 = 0; for (let j = 0; j < dim; j++) s2 += w[j] * x[j] / sc[j]; return s2; };
  });
};
// R² per channel of `preds` on one program over [from, to) at `lead`, streamed
const score = (preds, f, P, from, to, lead) => {
  const y = [[], []]; let n = 0, ss = [0, 0], mu = [0, 0];
  for (let k = from; k + lead < Math.min(to, P.cap.length); k++) { const t = P.cap[k + lead].t; mu[0] += t[0]; mu[1] += t[1]; n++; }
  mu = mu.map((v) => v / n);
  let st = [0, 0];
  for (let k = from; k + lead < Math.min(to, P.cap.length); k++) {
    const x = f(P, k), t = P.cap[k + lead].t;
    for (let c = 0; c < 2; c++) { const e = t[c] - preds[c](x); ss[c] += e * e; st[c] += (t[c] - mu[c]) ** 2; }
  }
  return [0, 1].map((c) => 1 - ss[c] / st[c]);
};
const fmt = (r) => r.map((v) => (Math.abs(v) < 10 ? v.toFixed(3) : v.toFixed(0))).join('/');
const rms = (P, from) => { let s2 = 0, n = 0; for (let k = from; k < P.cap.length; k++) { const t = P.cap[k].t; s2 += t[0] * t[0] + t[1] * t[1]; n++; } return Math.sqrt(s2 / n); };
const k0 = 64 * S + 1, trainEnd = (LAPS - 3) * LAP, testStart = (LAPS - 2) * LAP;
// ---- THE DIET: the designed polygons the policy was distilled from, run on the distilled
// machine with the policy armed — several programs, so a fit on them can only be a plant model.
const dietRuns = await host.distilRuns();
const diet = [];
for (let i = 0; i < dietRuns.length; i++) {
  const tr = dietRuns[i], cap = [];
  const r = await tr.run(heldPolicy(host.auto.distil, tr), { laps: HLAPS, tap: (nn, k, m, t) => cap.push({ m, t }) });
  const P = { name: `polygon ${i}`, cap, LAP: tr.lap, q: (k) => tr.refAt(k).slice(0, 2) };
  const N = cap.length; P.P1 = new Float64Array(N + 1); P.P2 = new Float64Array(N + 1);
  for (let k = 0; k < N; k++) { const m = cap[k].m; P.P1[k + 1] = P.P1[k] + m[4] * m[2]; P.P2[k + 1] = P.P2[k] + m[5] * m[3]; }
  diet.push(P);
  console.log(`recorded ${cap.length.toLocaleString()} steps (${HLAPS} laps) of polygon ${i} (lap ${tr.lap}): ${r.score.toExponential(4)} with the policy armed`);
}
console.log(`\n  residual rms with the policy armed — square ${rms(square, LAP).toExponential(3)}, circle ${rms(held[0], held[0].LAP).toExponential(3)}, rounded ${rms(held[1], held[1].LAP).toExponential(3)}, diet ${diet.map((P) => rms(P, P.LAP).toExponential(2)).join(' ')}`);
// ---- TABLE A, the control: fitted on the square's own laps. Later laps of the square against
// programs it never saw — a memory reads high in the first column and collapses in the others.
console.log(`\n  A. fitted on the SQUARE's first ${LAPS - 3} laps (the memory control):`);
console.log(`  ${'feature set'.padEnd(58)} ${'feat'.padStart(5)}   ${'square (later laps)'.padEnd(20)} ${'circle'.padEnd(16)} rounded`);
for (const [name, f] of Object.entries(sets)) {
  const preds = solve(accum(f, square, k0, trainEnd, 0), 1e-4);
  const within = score(preds, f, square, testStart, square.cap.length, 0);
  const across = held.map((P) => score(preds, f, P, P.LAP, P.cap.length, 0));
  console.log(`  ${name.padEnd(58)} ${String(preds.length && accum(f, square, k0, k0 + 1, 0).dim).padStart(5)}   ${fmt(within).padEnd(20)} ${fmt(across[0]).padEnd(16)} ${fmt(across[1])}`);
}
// ---- TABLE B, the claim: fitted on the pooled DIET, scored on three programs it never saw.
console.log(`\n  B. fitted on the pooled diet (${diet.length} polygons, laps 2-${HLAPS}), scored on programs the fit never saw:`);
console.log(`  ${'feature set'.padEnd(58)} ${'feat'.padStart(5)}   ${'SQUARE'.padEnd(16)} ${'CIRCLE'.padEnd(16)} ROUNDED`);
// RIDGE=1e-4,1e-2,... scores every set at a ladder of ridges, because a lift that transfers
// worse than the linear rows can be variance (rule 32) rather than non-transfer, and only the
// ladder tells them apart. The accumulation is shared; only the solve repeats.
const LAMS = (process.env.RIDGE || '1e-4').split(',').map(Number);
const accDiet = (f, lead) => { let acc = null; for (const P of diet) acc = accum(f, P, P.LAP, P.cap.length, lead, acc); return acc; };
const fitDiet = (f, lead, lam = LAMS[0]) => solve(accDiet(f, lead), lam);
for (const [name, f] of Object.entries(sets)) {
  const acc = accDiet(f, 0);
  for (const lam of LAMS) {
    const preds = solve(acc, lam);
    const r = [square, ...held].map((P) => score(preds, f, P, P.LAP, P.cap.length, 0));
    console.log(`  ${(name + (LAMS.length > 1 ? `  λ ${lam}` : '')).padEnd(58)} ${String(acc.dim).padStart(5)}   ${fmt(r[0]).padEnd(16)} ${fmt(r[1]).padEnd(16)} ${fmt(r[2])}`);
  }
}
// ---- AT THE LEADS A CONTROLLER NEEDS, diet-fitted: the lifted state at k predicting k + lead
console.log(`\n  B at a ladder of leads (steps), diet-fitted, R² square | circle | rounded:`);
const ladder = ['+ motor-side lags, linear (the pilot\'s shape)', '+ ENERGY lift (physical quadratics, power integrals)',
  'ENERGY lift + motor lags ALONE (no command)', 'PILOT-SHAPED: its own motor lags + command within its reach'].filter((n) => sets[n]);
for (const name of ladder) {
  const f = sets[name], row = [];
  for (const lead of [0, 81, 243, 729]) {
    const preds = fitDiet(f, lead);
    const r = [square, ...held].map((P) => score(preds, f, P, P.LAP, P.cap.length, lead));
    row.push(`${String(lead).padStart(3)}: ${r.map(fmt).join(' | ')}`);
  }
  console.log(`  ${name.slice(0, 44).padEnd(44)} ${row.join('   ')}`);
}
await host.dispose(); await m0.l1.destroy(); await m0.l2.destroy();
