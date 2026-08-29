// A BANDED OPERATOR ON A PLANT WITH KNOWN NEIGHBOUR COUPLING.
//
// The plant is built here, so the coupling strength is a knob and the CONTROL is a plant
// with genuinely none of it. That matters more than it sounds: two earlier versions of this
// file called a run 'no coupling' while the plant still had it — the coupling matrices are
// built once and an env var flipped afterwards changes nothing — so the control was a
// second coupled run wearing the control's label.
//
// TWO QUESTIONS, TWO BUDGETS. 'Does banded converge FASTER where the plant is coupled?'
// needs a budget too small to converge, or an exactly linear plant reaches machine precision
// either way and the endpoint says nothing — the trap brick 63 fell into. 'Does it differ
// from diagonal where the plant is NOT coupled?' needs the opposite: a budget where both
// converge, so what is compared is the operator rather than how many passes each was given.
import { HarmonicFF } from '../../lib/pilot/hff.js';

const LAP = 256, NH = 6, CH = 2;
const COUP = +(process.env.COUP ?? 0.5);
const PASSES = +(process.env.PASSES || 2);   // small: the rate is what shows
const CTRL = 14;                             // large: both converge, the operator shows

let failed = 0;
const ck = (n, c, d) => { console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`); if (!c) failed++; };
const proj = (sig) => {
  const re = new Float64Array(NH), im = new Float64Array(NH);
  for (let h = 1; h <= NH; h++) { let a = 0, b = 0;
    for (let k = 0; k < LAP; k++) { const x = 2 * Math.PI * h * k / LAP; a += sig[k] * Math.cos(x); b -= sig[k] * Math.sin(x); }
    re[h - 1] = 2 * a / LAP; im[h - 1] = 2 * b / LAP; }
  return { re, im };
};

/** e[h] = A[h] u[h] + coup * C[h] u[h-1], plus a fixed lap-periodic disturbance to cancel. */
function makePlant(coup) {
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5);
  const A = [], C = [];
  for (let h = 0; h < NH; h++) {
    A.push(Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => (r === c ? 1 : 0) + 0.15 * rnd())));
    C.push(Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => coup * rnd())));
  }
  const dist = [new Float64Array(LAP), new Float64Array(LAP)];
  for (let k = 0; k < LAP; k++) for (let c = 0; c < CH; c++)
    for (let h = 1; h <= NH; h++) dist[c][k] += 0.3 * Math.sin(2 * Math.PI * h * k / LAP + h + c);
  return async (corr) => {
    const u = [new Float64Array(LAP), new Float64Array(LAP)];
    if (corr) for (let k = 0; k < LAP; k++) { const v = corr.at(k); u[0][k] = v[0]; u[1][k] = v[1]; }
    const U = [proj(u[0]), proj(u[1])];
    const e = [new Float64Array(LAP), new Float64Array(LAP)];
    for (let c = 0; c < CH; c++) e[c].set(dist[c]);
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
  };
}

const go = async (plant, banded, passes) => {
  const h = new HarmonicFF({ lap: LAP, channels: CH, nh: NH, uMax: 50, banded,
    probeFracs: [0.25], passes, backtracks: 1 });
  const rep = await h.commission(plant);
  return { best: rep.best, laps: rep.laps, gb: !!h.Gb };
};

const coupled = makePlant(COUP), plain = makePlant(0);
const d = await go(coupled, false, PASSES), b = await go(coupled, true, PASSES);
console.log(`\nsynthetic plant with KNOWN h->h-1 coupling (strength ${COUP}), ${PASSES} passes\n`);
console.log(`  diagonal operator   ${d.best.toExponential(4)}   ${d.laps} laps`);
console.log(`  banded operator     ${b.best.toExponential(4)}   ${b.laps} laps   Gb built: ${b.gb}`);
console.log(`  ratio banded/diagonal ${(b.best / d.best).toFixed(3)}`);

const zd = await go(plain, false, CTRL), zb = await go(plain, true, CTRL);
console.log(`\n  CONTROL — a plant with NO coupling, ${CTRL} passes each so both converge:`);
console.log(`    diagonal ${zd.best.toExponential(4)}   banded ${zb.best.toExponential(4)}`
  + `   ratio ${(zb.best / zd.best).toFixed(3)}\n`);

ck('the banded operator is actually BUILT — not a flag that leaves every harmonic null, '
  + 'which is how this shipped the first time and reported a ratio of exactly 1.000', b.gb);
ck('it beats the diagonal solve on a plant with KNOWN neighbour coupling WITHOUT spending '
  + 'more laps — so it is the operator doing the work and not a longer refinement',
  b.best < d.best * 0.5 && b.laps <= d.laps,
  `${b.best.toExponential(3)} against ${d.best.toExponential(3)}, ${b.laps} vs ${d.laps} laps`);
ck('…and the harmonics really ARE coupled here, so the comparison above has something to '
  + 'find', d.best > 1e-5, `diagonal leaves ${d.best.toExponential(3)} at coupling ${COUP}`);
ck('CONTROL: on a plant with no coupling at all, and a budget where both converge, banded '
  + 'lands where diagonal lands — the case it should not touch comes back untouched',
  Math.abs(zb.best - zd.best) <= 1e-2 * Math.abs(zd.best) + 1e-12,
  `${zb.best.toExponential(4)} against ${zd.best.toExponential(4)}`);
ck('…and that control is not vacuous: the uncoupled plant really did converge, so the two '
  + 'agreeing means the operators agree rather than both having failed',
  zd.best < 1e-8, `diagonal reached ${zd.best.toExponential(3)}`);

console.log(failed ? `\nband: ${failed} check(s) FAILED\n` : '\nband: all checks passed\n');
process.exit(failed ? 1 : 0);
