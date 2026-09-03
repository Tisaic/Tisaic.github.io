// IS THE CASCADE'S REMAINING RESIDUAL A MODEL OR A MEMORY? — the question that decides
// whether depth can go further, and it is the retirement's own question one level in.
//
// WHERE THIS SITS. Iteration is the pilot's whole gap to ⑩ and the cascade is its
// north-star-legal form: depth 2 at raised authority is worth 1.85x over the shipped
// configuration on three unseen programs. Depth stops there — layer 3 refuses at 0.95x on the
// machine with a held-out R^2 of 0.734 — while the ORACLE ladder's third pass, with a perfect
// forecast of the same residual and the same authority, takes 12.11x to 16.43x. So the
// residual IS reachable by the actuator through the same `h`; what layer 3 lacks is a forecast
// of it, not the means to act.
//
// TWO EXPLANATIONS, AND THEY DEMAND OPPOSITE WORK. Either the residual is predictable from
// the machine's STATE and layer 3's fit is simply not finding it — a window, a basis, a ridge
// — or it is not state-predictable at all, in which case no state-addressed layer will ever
// take it and the only thing that can is a memory, which the retirement forbids. The first is
// a tuning problem; the second is a wall, and it would be the most important thing this
// session could establish.
//
// THE TEST IS CROSS-PROGRAM AND IT HAS TO BE. On the program it was fitted to, a phase-indexed
// table scores beautifully and means nothing — this project has measured that twice (125x on
// the program it learned, 0.55x on a sine). So both candidates are fitted on ONE program's
// residual and scored on ANOTHER'S:
//
//   state route   the pilot's own row builder, at its own leads, window and ridge
//   memory route  a phase-indexed table, which must collapse cross-program or the
//                 instrument is not measuring what it claims (rule 9, both halves)
//
// A state route that transfers says depth 3 is a fitting problem. One that does not says the
// cascade is finished at two and the remaining error belongs to something else.
import { solveRidge } from '/home/user/Tisaic.github.io/lib/pilot/pilot.js';
import { Stack } from '/home/user/Tisaic.github.io/lib/pilot/stack.js';
import { commissionArm, deployOn, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FIT = process.env.RS_FIT || 'sharp';
const TEST = process.env.RS_TEST || 'circle';
const FEED = +(process.env.RS_FEED || 0.004);
const UCAP = +(process.env.RS_UCAP || 0.6);
const DEPTH = +(process.env.RS_DEPTH || 2);
const LAGS = +(process.env.RS_LAGS || 24);
const STRIDE = +(process.env.RS_STRIDE || 13);
const RIDGE = +(process.env.RS_RIDGE || 1e-5);
const BINS = +(process.env.RS_BINS || 256);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, depth ${DEPTH}; `
  + `fit on ${FIT}, score on ${TEST}`);
const st = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
  uCap: UCAP, Cls: Stack, extra: { depth: DEPTH } });
if (!st) { console.log('commissioning never terminated'); process.exit(1); }
console.log(`deployed ${st.report.layers.filter((l) => l.deployed).length} of `
  + `${st.layers.length} layers; sample ${st.sample}`);

// THE RESIDUAL A THIRD LAYER WOULD SEE: the tool error with the deployed cascade running,
// recorded at the cascade's own cadence, over the last two laps so the machine is settled.
const residual = async (shape) => {
  const trace = [];
  const r = await deployOn(st, shape, true, FEED, { trace });
  const lap = Math.round((await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs'))
    .mkPath(shape, FEED).lap / st.sample);
  const from = Math.max(0, trace.length - 2 * lap);
  return { rows: trace.slice(from), lap, rms: r.r.totalRms };
};
const A = await residual(FIT), B = await residual(TEST);
console.log(`  ${FIT}: ${A.rows.length} samples, lap ${A.lap}, totalRms ${A.rms.toExponential(4)}`);
console.log(`  ${TEST}: ${B.rows.length} samples, lap ${B.lap}, totalRms ${B.rms.toExponential(4)}`);

// THE STATE ROUTE. Lagged measured signals — the same shape the pilot's row carries — with
// the readout's own ridge and column scaling, because substituting my own re-regularises the
// inverse and this project has measured that confound once already.
const design = (rows, c) => {
  const X = [], y = [];
  const need = (LAGS - 1) * STRIDE;
  for (let i = need; i < rows.length; i++) {
    const row = [1];
    for (let l = 0; l < LAGS; l++) {
      const s = rows[i - l * STRIDE];
      row.push(s.u[0], s.u[1], s.e[0], s.e[1]);
    }
    X.push(Float64Array.from(row)); y.push(rows[i].e[c]);
  }
  return { X, y };
};
const r2 = (y, p) => {
  let sMM = 0, sD = 0, sY = 0, n = y.length;
  for (let i = 0; i < n; i++) { sY += y[i]; }
  const m = sY / n;
  for (let i = 0; i < n; i++) { sMM += (y[i] - m) ** 2; sD += (y[i] - p[i]) ** 2; }
  return 1 - sD / sMM;
};

console.log('\n  route          ch   in-sample R2    CROSS-PROGRAM R2');
for (let c = 0; c < 2; c++) {
  const a = design(A.rows, c), b = design(B.rows, c);
  const w = solveRidge(a.X, a.y, RIDGE, null);
  const dot = (X) => X.map((r) => { let s = 0; for (let i = 0; i < w.length; i++) s += w[i] * r[i]; return s; });
  console.log(`  state (lags ${LAGS})  ${c}   ${r2(a.y, dot(a.X)).toFixed(4).padStart(8)}`
    + `        ${r2(b.y, dot(b.X)).toFixed(4).padStart(8)}`);
}
// THE MEMORY ROUTE, as the negative control. A phase-indexed mean over `BINS` bins of the
// lap: it must score well in-sample and collapse cross-program, or this bench is not
// measuring what it says it is.
for (let c = 0; c < 2; c++) {
  const tab = new Float64Array(BINS), cnt = new Float64Array(BINS);
  A.rows.forEach((s, i) => { const b = Math.floor(((i % A.lap) / A.lap) * BINS) % BINS; tab[b] += s.e[c]; cnt[b]++; });
  for (let b = 0; b < BINS; b++) if (cnt[b]) tab[b] /= cnt[b];
  const scoreOn = (R) => {
    const y = R.rows.map((s) => s.e[c]);
    const p = R.rows.map((s, i) => tab[Math.floor(((i % R.lap) / R.lap) * BINS) % BINS]);
    return r2(y, p);
  };
  console.log(`  memory (${BINS} bins) ${c}   ${scoreOn(A).toFixed(4).padStart(8)}`
    + `        ${scoreOn(B).toFixed(4).padStart(8)}`);
}
console.log('EXIT 0');
