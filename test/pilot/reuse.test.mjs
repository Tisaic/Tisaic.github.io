// AN OPERATOR IDENTIFIED ONCE, REUSED ON A SECOND PROGRAM.
//
// The lap-indexed table is a memory and does not transfer. The OPERATOR does: fitted on one
// program and scored on another of the same lap, held-out prediction error is 15.8% against
// 15.6% within the program it was fitted on (brick 72b). Identification is where this rung
// spends its laps — the probe sets and the candidate sweep — so a second program should be
// able to start from an operator already in hand and pay only for refinement.
//
// Two plants here, same lap and same channel count, DIFFERENT disturbance and slightly
// different dynamics: that is the second program. The operator is identified on the first
// and handed to the second.
import { HarmonicFF } from '../../lib/pilot/hff.js';

const LAP = 256, NH = 6, CH = 2;
let failed = 0;
const ck = (n, c, d) => { console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`); if (!c) failed++; };
const proj = (sig) => {
  const re = new Float64Array(NH), im = new Float64Array(NH);
  for (let h = 1; h <= NH; h++) { let a = 0, b = 0;
    for (let k = 0; k < LAP; k++) { const x = 2 * Math.PI * h * k / LAP; a += sig[k] * Math.cos(x); b -= sig[k] * Math.sin(x); }
    re[h - 1] = 2 * a / LAP; im[h - 1] = 2 * b / LAP; }
  return { re, im };
};
const mkPlant = (seed, distPhase) => {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
  const A = [];
  for (let h = 0; h < NH; h++) A.push(Array.from({ length: 4 }, (_, r) =>
    Array.from({ length: 4 }, (_, c) => (r === c ? 1 : 0) + 0.15 * rnd())));
  const dist = [new Float64Array(LAP), new Float64Array(LAP)];
  for (let k = 0; k < LAP; k++) for (let c = 0; c < CH; c++)
    for (let h = 1; h <= NH; h++) dist[c][k] += 0.3 * Math.sin(2 * Math.PI * h * k / LAP + h + c + distPhase);
  return async (corr) => {
    const u = [new Float64Array(LAP), new Float64Array(LAP)];
    if (corr) for (let k = 0; k < LAP; k++) { const v = corr.at(k); u[0][k] = v[0]; u[1][k] = v[1]; }
    const U = [proj(u[0]), proj(u[1])];
    const e = [new Float64Array(LAP), new Float64Array(LAP)];
    for (let c = 0; c < CH; c++) e[c].set(dist[c]);
    for (let h = 0; h < NH; h++) {
      const x = [U[0].re[h], U[0].im[h], U[1].re[h], U[1].im[h]], y = [0, 0, 0, 0];
      for (let r = 0; r < 4; r++) for (let j = 0; j < 4; j++) y[r] += A[h][r][j] * x[j];
      for (let c = 0; c < CH; c++) for (let k = 0; k < LAP; k++) {
        const t = 2 * Math.PI * (h + 1) * k / LAP;
        e[c][k] += y[2 * c] * Math.cos(t) - y[2 * c + 1] * Math.sin(t);
      }
    }
    let s2 = 0;
    for (let c = 0; c < CH; c++) for (let k = 0; k < LAP; k++) s2 += e[c][k] * e[c][k];
    return { score: Math.sqrt(s2 / (LAP * CH)), err: e };
  };
};
const opts = { lap: LAP, channels: CH, nh: NH, uMax: 50, probeFracs: [0.25], passes: 6, backtracks: 3 };
const planA = mkPlant(7, 0), planB = mkPlant(7, 1.7);      // same machine, different program

console.log('\nan operator identified on one program, reused on another\n');
const a = new HarmonicFF({ ...opts });
const ra = await a.commission(planA);
console.log(`  program A, identified from scratch   ${ra.best.toExponential(4)}   ${ra.laps} laps`);

const fresh = new HarmonicFF({ ...opts });
const rf = await fresh.commission(planB);
console.log(`  program B, identified from scratch   ${rf.best.toExponential(4)}   ${rf.laps} laps`);

const reused = new HarmonicFF({ ...opts, operator: ra.operator });
const rr = await reused.commission(planB);
console.log(`  program B, operator REUSED from A    ${rr.best.toExponential(4)}   ${rr.laps} laps`);
console.log(`\n  laps saved ${rf.laps - rr.laps} of ${rf.laps}  (${(100 * (rf.laps - rr.laps) / rf.laps).toFixed(0)}%)`);
console.log(`  residual ratio reused/fresh ${(rr.best / rf.best).toFixed(3)}`);
// WHAT THIS TEST DOES AND DOES NOT SHOW. The plant is exactly linear and noiseless, so a
// frozen-operator Newton drives it to machine precision whatever operator it starts from —
// both columns land near 1e-16 and the residual ratio is not evidence of anything. What is
// measured here is the LAP COST and the refusal. Whether a reused operator is as GOOD as a
// freshly identified one is a different question, answered by prediction rather than by an
// endpoint: brick 72b measured 15.8% held-out error on a program the operator never saw
// against 15.6% within the one it was fitted on.
console.log(`  (both land at machine precision on an exact plant, so the residual ratio is`);
console.log(`   not informative — the LAP COST is what this measures)\n`);

ck('the reused operator costs far fewer laps than identifying again — identification is '
  + 'where this rung spends them', rr.laps < rf.laps * 0.5, `${rr.laps} against ${rf.laps}`);
ck('…and it still corrects the second program, rather than being cheap and useless',
  rr.best < rf.base * 0.2, `${rr.best.toExponential(3)} against a base of ${rf.base.toExponential(3)}`);
ck('…and it reports that it REUSED rather than identified, so a run cannot silently be '
  + 'cheaper than it looks', rr.style === 'reused' && !!rr.reused, `style ${rr.style}`);
ck('an operator from a different lap is REFUSED rather than reinterpreted — harmonic h is '
  + 'not the same frequency on both', await (async () => {
    try { await new HarmonicFF({ ...opts, lap: 128, operator: ra.operator }).commission(planB); return false; }
    catch { return true; }
  })());
console.log(failed ? `\nreuse: ${failed} FAILED\n` : '\nreuse: all checks passed\n');
process.exit(failed ? 1 : 0);
