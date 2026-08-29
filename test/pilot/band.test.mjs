// A SYNTHETIC PLANT WITH KNOWN COUPLING. The banded path must (a) run, (b) produce a
// different command from the diagonal one, and (c) do better where the coupling is real —
// otherwise it is wiring that reports success and changes nothing.
import { HarmonicFF } from '../../lib/pilot/hff.js';

const LAP = 256, NH = 6, CH = 2;
const COUP = +(process.env.COUP || 0.5);   // declared ABOVE the code that reads it
// A SMALL PASS BUDGET, DELIBERATELY. This plant is exactly linear and noiseless, so a frozen
// operator Newton drives it to machine precision whatever the operator is — measured, both
// reached 7.47e-11 in 39 laps. That is the same trap brick 63 fell into and the reason an
// endpoint on a fixed program cannot test a model. What a better operator buys is the RATE,
// so the budget is cut until the rate is what shows.
const PASSES = +(process.env.PASSES || 2);
// The plant: e[h] = A[h] u[h] + C[h] u[h-1], i.e. a deliberate one-sided coupling, plus a
// fixed disturbance to cancel. Everything is linear and exact, so the only question is
// whether the solver can invert what is actually there.
const rnd = (() => { let s = 7; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5); })();
const A = [], C = [];
for (let h = 0; h < NH; h++) {
  A.push(Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => (r === c ? 1 : 0) + 0.15 * rnd())));
  C.push(Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => COUP * rnd())));
}
const dist = [new Float64Array(LAP), new Float64Array(LAP)];
for (let k = 0; k < LAP; k++) for (let c = 0; c < CH; c++) {
  for (let h = 1; h <= NH; h++) dist[c][k] += 0.3 * Math.sin(2 * Math.PI * h * k / LAP + h + c);
}
const proj = (sig) => {
  const re = new Float64Array(NH), im = new Float64Array(NH);
  for (let h = 1; h <= NH; h++) { let a = 0, b = 0;
    for (let k = 0; k < LAP; k++) { const x = 2 * Math.PI * h * k / LAP; a += sig[k] * Math.cos(x); b -= sig[k] * Math.sin(x); }
    re[h - 1] = 2 * a / LAP; im[h - 1] = 2 * b / LAP; }
  return { re, im };
};
async function run(corr) {
  const u = [new Float64Array(LAP), new Float64Array(LAP)];
  if (corr) for (let k = 0; k < LAP; k++) { const v = corr.at(k); u[0][k] = v[0]; u[1][k] = v[1]; }
  const U = [proj(u[0]), proj(u[1])];
  const e = [new Float64Array(LAP), new Float64Array(LAP)];
  for (let c = 0; c < CH; c++) e[c].set(dist[c]);
  // Apply the operator in the frequency domain and synthesise back.
  for (let h = 0; h < NH; h++) {
    const x = [U[0].re[h], U[0].im[h], U[1].re[h], U[1].im[h]];
    const xm = h > 0 ? [U[0].re[h - 1], U[0].im[h - 1], U[1].re[h - 1], U[1].im[h - 1]] : [0, 0, 0, 0];
    const y = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) for (let j = 0; j < 4; j++) y[r] += A[h][r][j] * x[j] + C[h][r][j] * xm[j];
    for (let c = 0; c < CH; c++) for (let k = 0; k < LAP; k++) {
      const t = 2 * Math.PI * (h + 1) * k / LAP;
      e[c][k] += y[2 * c] * Math.cos(t) - y[2 * c + 1] * Math.sin(t);
    }
  }
  let s2 = 0;
  for (let c = 0; c < CH; c++) for (let k = 0; k < LAP; k++) s2 += e[c][k] * e[c][k];
  return { score: Math.sqrt(s2 / (LAP * CH)), err: e };
}
const go = async (banded) => {
  const h = new HarmonicFF({ lap: LAP, channels: CH, nh: NH, uMax: 50, banded,
    probeFracs: [0.25], passes: PASSES, backtracks: 1 });
  const rep = await h.commission(run);
  return { best: rep.best, laps: rep.laps, gb: !!h.Gb };
};
const d = await go(false), b = await go(true);
console.log(`\nsynthetic plant with KNOWN h->h-1 coupling (strength ${COUP})\n`);
console.log(`  diagonal operator   ${d.best.toExponential(4)}   ${d.laps} laps`);
console.log(`  banded operator     ${b.best.toExponential(4)}   ${b.laps} laps   Gb built: ${b.gb}`);
console.log(`  ratio banded/diagonal ${(b.best / d.best).toFixed(3)}\n`);

// ---- THE CHECKS. A wiring change that reports success and alters no command is the
// failure this file exists to catch: the banded path shipped once already in a state where
// every harmonic's fit came back null, the solve fell through to the diagonal one, and
// three coupling strengths all reported a ratio of exactly 1.000.
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${(!cond && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!cond) failed++;
};
const z = await (async () => { const s = process.env.COUP; process.env.COUP = '0'; const r = await go(true); process.env.COUP = s ?? ''; return r; })();
check('the banded operator is actually BUILT — not a flag that leaves every harmonic null, '
  + 'which is how this shipped the first time and reported a ratio of exactly 1.000',
  b.gb && z.gb, `banded run Gb built: ${b.gb}`);
check('it beats the diagonal solve on a plant with KNOWN neighbour coupling, at the same '
  + 'lap count — so it is the operator doing the work and not a longer refinement',
  b.best < d.best * 0.5 && b.laps === d.laps,
  `${b.best.toExponential(3)} against ${d.best.toExponential(3)}, ${b.laps} vs ${d.laps} laps`);
check('…and the harmonics really are coupled here, so the comparison above has something to '
  + 'find — the diagonal solve degrades as the coupling is turned up',
  d.best > 1e-5, `diagonal leaves ${d.best.toExponential(3)} at coupling ${COUP}`);
console.log(failed ? `\nband: ${failed} check(s) FAILED\n` : '\nband: all checks passed\n');
process.exit(failed ? 1 : 0);
