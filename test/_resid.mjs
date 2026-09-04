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
// SEVERAL TARGETS, NOT ONE, because sharp -> circle is the biggest jump available and a total
// failure there does not distinguish "does not transfer at all" from "transfers to nearby
// programs and not to far ones". The second is a cascade that can deepen within a program
// family; the first is a wall. A different FEEDRATE of the fitting program is the mildest
// target there is — same geometry, same corners, only the speed — so if transfer fails even
// there it is not a question of how far apart the shapes are.
const TESTS = (process.env.RS_TESTS || 'rounded,circle').split(',');
const FEEDS = (process.env.RS_FEEDS || '0.004,0.006').split(',').map(Number);
const FEED = +(process.env.RS_FEED || 0.004);
const UCAP = +(process.env.RS_UCAP || 0.6);
const DEPTH = +(process.env.RS_DEPTH || 2);
const LAGS = +(process.env.RS_LAGS || 24);
const STRIDE = +(process.env.RS_STRIDE || 13);
const RIDGE = +(process.env.RS_RIDGE || 1e-5);
const BINS = +(process.env.RS_BINS || 256);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, depth ${DEPTH}; `
  + `fit on ${FIT}, score on ${TESTS.join(', ')} and feeds ${FEEDS.join(', ')}`);
const st = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
  uCap: UCAP, Cls: Stack, extra: { depth: DEPTH } });
if (!st) { console.log('commissioning never terminated'); process.exit(1); }
console.log(`deployed ${st.report.layers.filter((l) => l.deployed).length} of `
  + `${st.layers.length} layers; sample ${st.sample}`);

// THE RESIDUAL A THIRD LAYER WOULD SEE: the tool error with the deployed cascade running,
// recorded at the cascade's own cadence, over the last two laps so the machine is settled.
const residual = async (shape, feed) => {
  const trace = [];
  const r = await deployOn(st, shape, true, feed, { trace });
  const lap = Math.round((await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs'))
    .mkPath(shape, feed).lap / st.sample);
  const from = Math.max(0, trace.length - 2 * lap);
  return { rows: trace.slice(from), lap, rms: r.r.totalRms };
};
const A = await residual(FIT, FEED);
console.log(`  fit on ${FIT} @ ${FEED}: ${A.rows.length} samples, lap ${A.lap}, `
  + `totalRms ${A.rms.toExponential(4)}`);
const targets = [];
for (const f of FEEDS) {
  if (f !== FEED) targets.push({ name: `${FIT} @ ${f}`, r: await residual(FIT, f) });
}
for (const t of TESTS) targets.push({ name: `${t} @ ${FEED}`, r: await residual(t, FEED) });
for (const t of targets) {
  console.log(`  score on ${t.name.padEnd(16)}: ${t.r.rows.length} samples, lap ${t.r.lap}, `
    + `totalRms ${t.r.rms.toExponential(4)}`);
}

// THE STATE ROUTE, AND IT MAY ONLY USE WHAT THE MACHINE HAS AT DEPLOY. The first version of
// this bench put the RESIDUAL itself at lagged times into the design matrix and reported an
// in-sample R^2 of 0.997 — which was the residual autocorrelating with itself, not a model of
// anything, and it would have been written up as "the fit finds it easily in sample and does
// not transfer". The pilot's own row carries the six ROUTED MEASURED signals (two encoder
// angles, two speeds, two torques) and the COMMAND, and never the truth; this mirrors that.
const design = (rows, c) => {
  const X = [], y = [];
  const need = (LAGS - 1) * STRIDE;
  for (let i = need; i < rows.length; i++) {
    const row = [1];
    for (let l = 0; l < LAGS; l++) {
      const s = rows[i - l * STRIDE];
      for (let j = 0; j < s.m.length; j++) row.push(s.m[j]);
      row.push(s.cmd[0], s.cmd[1]);
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

// THREE RUNGS, NOT TWO, because in-sample and cross-program cannot tell OVERFIT from
// PROGRAM-SPECIFIC and those need opposite work. 192 features on ~1750 rows will fit anything
// in sample; the held-out lap of the SAME program says whether there is a model there at all,
// and only then does the cross-program column mean "it does not transfer" rather than "there
// was never anything to transfer".
//
// AND THE COLUMN SCALING IS THE PILOT'S OWN. A flat ridge on unscaled columns re-regularises
// the inverse, which this session has already been caught by once.
const hdr = targets.map((t) => t.name.padStart(14)).join('');
console.log(`\n  route             ch   in-sample   HELD-OUT lap${hdr}`);
const L0 = st.layers[0];
for (let c = 0; c < 2; c++) {
  const a = design(A.rows, c);
  // fit on the FIRST lap of the fitting program, score on its second, then on every target
  const half = Math.floor(a.X.length / 2);
  const Xf = a.X.slice(0, half), yf = a.y.slice(0, half);
  const Xh = a.X.slice(half), yh = a.y.slice(half);
  const cs = L0._colScale ? L0._colScale(Xf[0]) : null;
  const w = solveRidge(Xf, yf, RIDGE, cs);
  const dot = (X) => X.map((r) => { let s = 0; for (let i = 0; i < w.length; i++) s += w[i] * r[i]; return s; });
  const cols = targets.map((t) => {
    const b = design(t.r.rows, c);
    return r2(b.y, dot(b.X)).toFixed(4).padStart(14);
  }).join('');
  console.log(`  state (lags ${LAGS})     ${c}   ${r2(yf, dot(Xf)).toFixed(4).padStart(8)}`
    + `    ${r2(yh, dot(Xh)).toFixed(4).padStart(9)}${cols}`);
}
// THE MEMORY ROUTE, as the negative control. A phase-indexed mean over `BINS` bins of the
// lap: it must score well in-sample and collapse cross-program, or this bench is not
// measuring what it says it is.
for (let c = 0; c < 2; c++) {
  const tab = new Float64Array(BINS), cnt = new Float64Array(BINS);
  A.rows.forEach((s, i) => { const b = Math.floor(((i % A.lap) / A.lap) * BINS) % BINS; tab[b] += s.e[c]; cnt[b]++; });
  for (let b = 0; b < BINS; b++) if (cnt[b]) tab[b] /= cnt[b];
  const scoreOn = (R, from = 0) => {
    const y = [], p = [];
    for (let i = from; i < R.rows.length; i++) {
      y.push(R.rows[i].e[c]);
      p.push(tab[Math.floor(((i % R.lap) / R.lap) * BINS) % BINS]);
    }
    return r2(y, p);
  };
  // the table is built on the WHOLE fitting record, so its "held-out lap" column is the
  // second lap of that same record — which is what a memory is FOR, and it should score well
  const cols = targets.map((t) => scoreOn(t.r).toFixed(4).padStart(14)).join('');
  console.log(`  memory (${BINS} bins)  ${c}   ${scoreOn(A).toFixed(4).padStart(8)}`
    + `    ${scoreOn(A, A.lap).toFixed(4).padStart(9)}${cols}`);
}
console.log('EXIT 0');
