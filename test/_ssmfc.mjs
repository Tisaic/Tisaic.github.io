// PROPAGATE THE STATE INSTEAD OF WIDENING THE WINDOW — the shape change, measured as a
// FORECAST before any of it is allowed near the QP.
//
// WHY THE WINDOW CANNOT BE FIXED BY MAKING IT LONGER. The pilot predicts `eFree` at each lead
// from a lag window, and this arm's elbow memory is 6,363-8,649 solver steps — longer than a
// program lap. A window short of that truncates the memory; a window long enough aliases it on
// a closed path and costs parameters linearly in reach. Both failures are now measured on the
// same residual: 24 uniform lags (2,496 steps) transfers at 0.0023 across a feedrate, and 16
// log-spaced lags reaching 9,000 steps scores -6.43 on a HELD-OUT LAP because 177 features had
// ~450 rows to fit. Section 43 reached the same wall from the twin's side — L=384 best, L=780
// winning on the wander and breaking on the program, and what moved it was DATA.
//
// A PROPAGATING MODEL PAYS FIXED COST FOR UNBOUNDED MEMORY. One step of a recursion carries
// everything the state carries, however old, and iterating it forward reaches any horizon with
// the same parameters.
//
// AND THE DEPLOYABLE FORM IS FORCED BY WHAT THE MACHINE HAS. An autoregression on `eFree` is
// impossible — `eFree` is the tool error and there is no tracker at deploy. The six ROUTED
// MEASURED signals are available every sample, so the recursion has to run on THOSE:
//
//   1. a one-step model of the measured signals themselves, driven by the command:
//      m[k] = A(m[k-1..k-p]) + B(cmd[k..k-q])          — every term measurable at deploy
//   2. the pilot's own readout shape on top: eFree = C(m, cmd)
//   3. to predict lead L: iterate (1) forward L steps on the KNOWN future command, then apply (2)
//
// SECTION 43 CONVICTED THE FREE-RUN VERSION OF THIS AND THIS IS NOT THAT. There, a simulator
// ran open over a whole program with no measurements and plain AR diverged or went bias-dead.
// Here the recursion is re-seeded from actual measurements every sample and runs only to the
// horizon, which is an OBSERVER — the measurements bound the state that a free-run lets walk.
// Whether that distinction is worth anything is what this measures, per lead, against the
// pilot's own fitted bank on programs neither has seen.
import { solveRidge } from '/home/user/Tisaic.github.io/lib/pilot/pilot.js';
import { commissionArm, recordOpenLoop, PG }
  from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.SS_FEED || 0.004);
const SHAPES = (process.env.SS_SHAPES || 'sharp,circle,rounded').split(',');
const P = +(process.env.SS_P || 6);        // lags of the measured state in the recursion
const Q = +(process.env.SS_Q || 6);        // lags of the command driving it
const RIDGE = +(process.env.SS_RIDGE || 1e-7);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}; one-step recursion p=${P} q=${Q}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const rec = pilot._rec;
const NM = rec.x[0].length, NC = rec.cmd[0].length;
console.log(`commissioning record: ${rec.x.length} samples, ${NM} measured, ${NC} commanded; `
  + `sample ${pilot.sample}, grid ${pilot.grid}, N ${pilot.N}`);

// THE FIT TARGET IS THE PILOT'S OWN `eFree`, not the raw truth: the h-consistent target with
// the dither's own response convolved out, so the two forecasts are predicting the same thing
// and the comparison is one variable.
const eFree = [];
for (let c = 0; c < NC; c++) {
  const h = pilot.hs[c].hSample, out = new Float64Array(rec.e.length);
  for (let k = 0; k < rec.e.length; k++) {
    let s = 0;
    const top = Math.min(h.length, k + 1);
    for (let t = 0; t < top; t++) s += h[t] * rec.u[k - t][c];
    out[k] = rec.e[k][c] - s;
  }
  eFree.push(out);
}

// ---- 1. the one-step recursion on the MEASURED signals, driven by the command -------------
const stateRow = (i, m, cmd) => {
  const r = [1];
  for (let l = 1; l <= P; l++) for (let j = 0; j < NM; j++) r.push(m[i - l][j]);
  for (let l = 0; l <= Q; l++) for (let j = 0; j < NC; j++) r.push(cmd[i - l][j]);
  return r;
};
const need = Math.max(P, Q) + 1;
const Xs = [], Ys = [];
for (let i = need; i < rec.x.length; i++) { Xs.push(Float64Array.from(stateRow(i, rec.x, rec.cmd))); Ys.push(i); }
const A = [];
for (let j = 0; j < NM; j++) A.push(solveRidge(Xs, Ys.map((i) => rec.x[i][j]), RIDGE, pilot._colScale(Xs[0])));
// ---- 2. the readout: eFree from the measured state and the command ------------------------
const C = [];
for (let c = 0; c < NC; c++) C.push(solveRidge(Xs, Ys.map((i) => eFree[c][i]), RIDGE, pilot._colScale(Xs[0])));
{
  const pr = (w, y) => {
    let sD = 0, sM = 0, sY = 0, n = Xs.length;
    for (let i = 0; i < n; i++) {
      let p = 0; for (let t = 0; t < w.length; t++) p += w[t] * Xs[i][t];
      sD += (y[i] - p) ** 2; sY += y[i]; sM += y[i] * y[i];
    }
    return 1 - sD / (sM - sY * sY / n);
  };
  console.log(`  one-step fits on the commissioning scribble: `
    + `state R2 ${A.map((w, j) => pr(w, Ys.map((i) => rec.x[i][j])).toFixed(4)).join(' ')}`);
  console.log(`  readout  R2 ${C.map((w, c) => pr(w, Ys.map((i) => eFree[c][i])).toFixed(4)).join(' ')}`);
}

// ---- 3. iterate forward on a program the model has never seen -----------------------------
const LEADS = [0, Math.floor(pilot.N / 3), Math.floor((2 * pilot.N) / 3), pilot.N - 1]
  .map((i) => i * pilot.grid);
console.log(`\n  leads in samples: ${LEADS.join(', ')} (horizon ${pilot.N * pilot.grid})`);
console.log('  program   ch   ' + LEADS.map((L) => `lead ${String(L).padStart(3)}`).join('   '));
for (const shape of SHAPES) {
  const R = await recordOpenLoop(pilot, shape, FEED);
  const lap = R.lap;
  const tgt = [];
  for (let c = 0; c < NC; c++) tgt.push(R.e.map((v) => v[c]));   // open loop: truth IS eFree
  const from = lap, to = Math.min(R.e.length, 2 * lap);
  const acc = Array.from({ length: NC }, () => LEADS.map(() => ({ sD: 0, sY: 0, sM: 0, n: 0 })));
  for (let i = from; i < to; i++) {
    // THE STATE IS RE-SEEDED FROM ACTUAL MEASUREMENTS AT EVERY i — this is the observer, and
    // the whole difference from a free run: the walk only ever lasts one horizon.
    const m = R.x.slice(0, i + 1).map((v) => v.slice());
    const cmd = R.cmd;
    for (let li = 0; li < LEADS.length; li++) {
      const L = LEADS[li];
      // iterate the recursion L steps on the KNOWN future command
      for (let s = m.length; s <= i + L; s++) {
        const row = stateRow(s, m, cmd);
        m[s] = A.map((w) => { let p = 0; for (let t = 0; t < w.length; t++) p += w[t] * row[t]; return p; });
      }
      const row = stateRow(i + L, m, cmd);
      for (let c = 0; c < NC; c++) {
        let p = 0; for (let t = 0; t < C[c].length; t++) p += C[c][t] * row[t];
        const y = tgt[c][Math.min(i + L, tgt[c].length - 1)];
        const a = acc[c][li];
        a.sD += (y - p) ** 2; a.sY += y; a.sM += y * y; a.n++;
      }
    }
  }
  for (let c = 0; c < NC; c++) {
    const cols = acc[c].map((a) => {
      const v = a.sM - a.sY * a.sY / a.n;
      return (1 - a.sD / v).toFixed(4).padStart(11);
    }).join('   ');
    console.log(`  ${shape.padEnd(9)} ${c}   ${cols}`);
  }
}
console.log('EXIT 0');
