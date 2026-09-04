// THE LAG WINDOW IS UNIFORMLY STRIDED, AND THAT COSTS IT EVERY OCTAVE BUT ONE.
//
// WHAT THE POSE-SWEEP ARC ENDED UP MEASURING. A lag window can only USE excitation between two
// bounds set by its own geometry: it cannot REACH a period longer than its span (rule 37), and it
// cannot SAMPLE one shorter than twice its stride. On this arm the row is 12 lags at stride 14
// samples, so the span is 1232 solver steps and the lattice is 112 — usable periods 224 to 1232,
// **one octave**. The commissioning scribble sits in the middle of it at a correlation time of
// 662, which is why it fits at R^2 0.995 while three better-designed excitations fitted at 0.01
// to 0.04. The ceiling is the REGRESSOR GEOMETRY, not the plant and not the excitation.
//
// AND THE PROJECT ALREADY RECORDED THE CONSEQUENCE WITHOUT NAMING THE CAUSE: "the corner is a
// 40-step event read by regressors 117 steps apart", and "forcing `sample` to 3 does not change
// it, because the tune raises stride to 39 to hold the same reach — spacing comes from Ts, a
// settling number, and the corner is a geometry one". Reach and resolution are in direct conflict
// over ONE uniform stride, and the tune can only trade them.
//
// THEY DO NOT HAVE TO BE. Log-spaced lags — 1, 2, 4, 8, ... out to the same span — give fine
// resolution near the present AND the same reach into the past, at the SAME COLUMN COUNT. Twelve
// log-spaced lags from 1 to 168 samples span periods from 16 to 2688 steps: seven octaves against
// one, for exactly the same arithmetic at deploy and the same memory.
//
// THE MEASUREMENT. Build the rows here rather than through `_row`, so the ONLY difference is the
// lag geometry — the poly, scheduled and lead blocks are omitted from both arms, which makes this
// a cleaner comparison than the shipped basis and a weaker absolute number. Fit on the
// commissioning record, score held-out on three programs, at three leads.
//
// WHAT WOULD KILL IT: log spacing no better than uniform at lead 0. Then the information really
// is concentrated in the one octave the uniform window happens to cover, the corner's 40-step
// event carries nothing about the error, and the geometry was never the constraint.
import { solveRidge } from '/home/user/Tisaic.github.io/lib/pilot/pilot.js';
import { PG, commissionArm, recordOpenLoop } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.LL_FEED || 0.004);
const UCAP = +(process.env.LL_UCAP || 0.6);
const SHAPES = (process.env.LL_SHAPES || 'rounded,circle,sharp').split(',');

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
if (!pilot._fit || !pilot._fit.eFree) { console.log('record released'); process.exit(1); }
const S = pilot.sample;

/** The two lag sets, in SAMPLES, at matched count and matched span. */
function lagSets(mL, stride) {
  const uniform = [];
  for (let l = 0; l < mL; l++) uniform.push(l * stride);
  const span = (mL - 1) * stride;
  const log = [0];
  for (let l = 1; l < mL; l++) {
    const v = Math.round(Math.exp((Math.log(span) * l) / (mL - 1)));
    log.push(Math.max(log[log.length - 1] + 1, v));
  }
  return { uniform, log };
}

/** One row: bias, every measured signal at every lag, and the command block at the lead. */
function rowAt(rec, k, L, offs, fL, cs) {
  const row = [1];
  for (let ch = 0; ch < pilot.nm; ch++) {
    for (const o of offs) row.push(rec.x[Math.max(0, k - o)][ch]);
  }
  for (let ch = 0; ch < pilot.nc; ch++) {
    for (let l = 0; l < fL; l++) {
      const idx = Math.max(0, Math.min(k + L - l * cs, rec.cmd.length - 1));
      const p0 = rec.cmd[idx][ch], p1 = rec.cmd[Math.max(0, idx - 1)][ch];
      row.push(p0, (p0 - p1) * (pilot.Ts / S));
    }
  }
  return row;
}

function build(rec, c, L, offs, ro, target) {
  const back = Math.max(offs[offs.length - 1], (ro.fLag - 1) * ro.stride - L);
  const to = target.length - L - 1;
  const X = [], y = [];
  for (let k = back; k < to; k++) {
    X.push(rowAt(rec, k, L, offs, ro.fLag, pilot.cmdStride || ro.stride));
    y.push(target[k + L]);
  }
  return { X, y };
}
const r2 = (X, y, w) => {
  let sse = 0, sy = 0, sy2 = 0;
  for (let i = 0; i < X.length; i++) {
    let p = 0; const r = X[i];
    for (let j = 0; j < w.length; j++) p += w[j] * r[j];
    const d = y[i] - p; sse += d * d; sy += y[i]; sy2 += y[i] * y[i];
  }
  return 1 - sse / Math.max(sy2 - (sy * sy) / X.length, 1e-300);
};

const recs = {};
for (const s of SHAPES) recs[s] = await recordOpenLoop(pilot, s, FEED);

for (let c = 0; c < pilot.nc; c++) {
  const ro = pilot.readouts[c];
  const sets = lagSets(ro.mLag, ro.stride);
  const spanSteps = (ro.mLag - 1) * ro.stride * S;
  console.log(`\n=== channel ${c} — ${ro.mLag} lags, span ${spanSteps} steps ===`);
  console.log(`  uniform lags (samples): ${sets.uniform.join(' ')}`);
  console.log(`      log lags (samples): ${sets.log.join(' ')}`);
  console.log(`  uniform can use periods ${2 * ro.stride * S}..${spanSteps} steps; `
    + `log can use ${2 * (sets.log[1] - sets.log[0]) * S}..${spanSteps}`);
  console.log('  lead   lags      cols   in-sample' + SHAPES.map((s) => s.padStart(11)).join(''));
  const LEADS = [0, ro.leads[Math.floor(ro.leads.length / 2)], ro.leads[ro.leads.length - 1]];
  for (const L of LEADS) {
    for (const [name, offs] of [['uniform', sets.uniform], ['log    ', sets.log]]) {
      const tr = build(pilot._rec, c, L, offs, ro, pilot._fit.eFree[c]);
      const w = solveRidge(tr.X, tr.y, ro.ridge, tr.X[0].map(() => 1));
      const cols = SHAPES.map((sh) => {
        const h = build(recs[sh], c, L, offs, ro, recs[sh].e.map((v) => v[c]));
        return r2(h.X, h.y, w).toFixed(4).padStart(11);
      }).join('');
      console.log(`  ${String(L).padStart(4)}   ${name}   ${String(tr.X[0].length).padStart(4)}`
        + `   ${r2(tr.X, tr.y, w).toFixed(4).padStart(9)}${cols}`);
    }
  }
}
console.log('EXIT 0');
