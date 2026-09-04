// CAN THE FORECAST CARRY THE PLANT'S MEMORY IN STATES INSTEAD OF TAPS?
//
// WHERE THIS COMES FROM. The arm's pilot delivers 2.9-3.5x and its elbow forecast reads held-out
// R^2 ~0.90, which bounds delivery at 1/sqrt(1-0.90) ~ 3x: the controller is AT its forecast
// bound, exactly as EMPS was measured to be. So no controller-side knob can move it, and every
// one that was swept came back null. What is left is the model.
//
// AND THE MODEL'S DEFECT IS ALREADY MEASURED. Plan section 41: the elbow's memory is 6363-8649
// solver steps, longer than a program lap and far longer than the lag window's 2496-step reach,
// so windowed features TRUNCATE it. Two repairs were tried and both failed for opposite reasons:
// widening the window STARVES the fit (`_resid`: 177 features against ~450 rows, held-out R^2
// -6.43), and a one-step state-space recursion COMPOUNDS (`_ssmfc`: R^2 0.88 at lead 0 and -1.94
// by lead 184, where the direct bank holds 0.85 across the horizon).
//
// THE THIRD OPTION, WHICH HAS NOT BEEN TRIED: carry the memory in STATES rather than taps. A
// leaky integrator `z[k] = z[k-1] + a*(x[k] - z[k-1])` with `a = 1 - exp(-1/tau)` remembers `tau`
// samples in ONE number and ONE multiply-add per step. A bank of them log-spaced from the sample
// rate out past the plant's memory spans 8192 solver steps in five columns per signal, where the
// tap window needs a thousand. That is:
//   - not starved   — tens of columns, not hundreds, so the fit keeps its rows;
//   - not compounding — the readout stays a DIRECT per-lead regression, unchanged;
//   - state-addressed — a filtered history of the machine's own signals, so it transfers, which
//     is what the memory's retirement requires;
//   - PLC-trivial   — one MAC per state per step, and the states replace nothing.
//
// THE MEASUREMENT. Refit the pilot's OWN row, by this file's own ridge and column scaling, with
// and without the leaky block, and score held-out R^2 on OPEN-LOOP runs of three programs — open
// loop because with u = 0 the fit's target is the truth exactly and needs no reconstruction
// (rule 16). Both arms use identical machinery and differ in exactly the block, so this is a
// matched-capacity comparison of one variable (rule 20) — and the control arm must reproduce the
// pilot's own reported R^2, or the harness is measuring itself.
//
// WHAT WOULD KILL IT: no lift at lead 0 on the held-out programs. Then the memory beyond the
// window carries no information about the error, `_resid`'s starvation was not the whole story,
// and the forecast bound is where it is for a different reason.
import { solveRidge } from '/home/user/Tisaic.github.io/lib/pilot/pilot.js';
import { PG, commissionArm, recordOpenLoop } from '/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs';

const FEED = +(process.env.LK_FEED || 0.004);
const UCAP = +(process.env.LK_UCAP || 0.6);
const SHAPES = (process.env.LK_SHAPES || 'rounded,circle,sharp').split(',');
// TIME CONSTANTS IN SAMPLES, log-spaced. The longest must exceed the measured memory: at sample 8
// the elbow's 6363-8649 steps are 795-1081 samples, so the bank has to reach past 1024.
const TAUS = (process.env.LK_TAUS || '4,16,64,256,1024').split(',').map(Number);
// RESONATOR PERIODS IN SAMPLES, log-spaced over the same span. A LEAKY INTEGRATOR IS THE WRONG
// SHAPE FOR HELD ENERGY: elastic energy in a lightly damped mode is OSCILLATORY, so a monotone
// decay can carry how much history there is but not what phase it is in. A resonator carries
// both in two numbers — `z[k] = rho*e^{i.theta}*z[k-1] + x[k]`, real and imaginary parts — and
// it is the same one-MAC-per-state object at deploy. `RQ` is how many periods it takes to decay
// by 1/e, which is the only free number and is deliberately loose: the fit chooses the weights,
// the basis only has to SPAN the modes.
const PERS = (process.env.LK_PERS || '8,24,72,216,648').split(',').map(Number);
const RQ = +(process.env.LK_RQ || 4);

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED }, uCap: UCAP });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
console.log(`sample ${pilot.sample}; taus ${TAUS.join(',')} samples `
  + `= ${TAUS.map((t) => t * pilot.sample).join(',')} solver steps`);

/** The leaky-state bank for one record, causal, one pass. Measured signals AND commands. */
function resoStates(rec, nm) {
  const n = rec.x.length;
  const P = PERS.map((p) => ({ c: Math.exp(-1 / (RQ * p)) * Math.cos(2 * Math.PI / p),
    s: Math.exp(-1 / (RQ * p)) * Math.sin(2 * Math.PI / p) }));
  const zr = new Float64Array(nm * P.length), zi = new Float64Array(nm * P.length);
  const out = [];
  const cur = new Float64Array(2 * nm * P.length);
  for (let k = 0; k < n; k++) {
    let i = 0;
    for (let ch = 0; ch < nm; ch++) {
      const v = rec.x[k][ch];
      for (let j = 0; j < P.length; j++, i++) {
        const r = zr[i], m = zi[i];
        zr[i] = P[j].c * r - P[j].s * m + v;
        zi[i] = P[j].s * r + P[j].c * m;
      }
    }
    for (let j = 0; j < zr.length; j++) { cur[2 * j] = zr[j]; cur[2 * j + 1] = zi[j]; }
    out.push(Float64Array.from(cur));
  }
  return out;
}

function leakyStates(rec, nm, nc) {
  const A = TAUS.map((t) => 1 - Math.exp(-1 / t));
  const n = rec.x.length;
  const z = [];                                   // z[k] = flat array of states at k
  const cur = new Float64Array((nm + nc) * TAUS.length);
  for (let k = 0; k < n; k++) {
    let i = 0;
    for (let ch = 0; ch < nm; ch++) {
      const v = rec.x[k][ch];
      for (let j = 0; j < A.length; j++, i++) cur[i] += A[j] * (v - cur[i]);
    }
    for (let ch = 0; ch < nc; ch++) {
      const v = rec.cmd[Math.min(k, rec.cmd.length - 1)][ch];
      for (let j = 0; j < A.length; j++, i++) cur[i] += A[j] * (v - cur[i]);
    }
    z.push(Float64Array.from(cur));
  }
  return z;
}

/** Design matrix for one channel at one lead: the pilot's own row, optionally + the states. */
function build(rec, c, L, ro, withZ, z, target) {
  const saved = pilot._rec;
  pilot._rec = { x: rec.x, cmd: rec.cmd, u: [], e: rec.e };
  const mL = ro.mLag, fL = ro.fLag, stride = ro.stride;
  const back = Math.max((mL - 1) * stride, (fL - 1) * stride - L);
  const from = Math.max(back, rec.lap ? Math.min(rec.lap, rec.x.length >> 2) : back);
  const to = target.length - L - 1;
  const X = [], y = [];
  try {
    for (let k = from; k < to; k++) {
      const row = pilot._row(c, k, L, stride, ro.poly, mL, fL, ro.sched, ro.longR || null);
      // `_row` SETS `nBase` ITSELF, before the rich blocks, and the pilot's `_colScale` ridges
      // everything past it a hundred times harder. Overwriting it — which the first version of
      // this file did — moves the poly, scheduled and lead blocks into the CHEAP prior, so the
      // control arm was a different model from the pilot's and scored 0.53 where the pilot's own
      // weights score 0.90 (rule 17: the instrument fails before the model).
      const nB = row.nBase;
      if (withZ) for (let i = 0; i < z[k].length; i++) row.push(z[k][i]);
      row.nBase = nB;
      row.nRich = withZ ? row.length - z[k].length : row.length;
      X.push(row); y.push(target[k + L]);
    }
  } finally { pilot._rec = saved; }
  return { X, y };
}

const r2 = (X, y, w) => {
  let sse = 0, sy = 0, sy2 = 0;
  for (let i = 0; i < X.length; i++) {
    let p = 0; const r = X[i];
    for (let j = 0; j < w.length; j++) p += w[j] * r[j];
    const d = y[i] - p; sse += d * d; sy += y[i]; sy2 += y[i] * y[i];
  }
  const varY = sy2 - (sy * sy) / X.length;
  return 1 - sse / Math.max(varY, 1e-300);
};

// THE COLUMN SCALE IS THE PILOT'S OWN — 1 on the base block, 100 on every rich block past
// `nBase` — because that prior is load-bearing: measured on this arm, dropping it to 10 and then
// to 1 makes the scheduled block score WORSE held-out, not better. The STATE block gets its own
// penalty `LK_PEN`, swept, because it is a linear filter of the same signals rather than a
// nonlinear expansion and there is no reason to assume it wants the rich prior.
const PEN = +(process.env.LK_PEN || 100);
const scale = (row0) => row0.map((_, i) => (i < row0.nBase ? 1 : (i < row0.nRich ? 100 : PEN)));

const recs = {};
for (const s of SHAPES) recs[s] = await recordOpenLoop(pilot, s, FEED);
const trainRec = pilot._rec;
// THE TRAINING TARGET IS `_fit.eFree`, NOT `_rec.e` — during commissioning the machine is being
// dithered, so the recorded error is not the FREE error the bank is fitted to. Reading the wrong
// one here would fit a different question and still print a plausible number (rule 17).
if (!pilot._fit || !pilot._fit.eFree) {
  console.log('the commissioning record was released; nothing to refit'); process.exit(1);
}
const trainY = pilot._fit.eFree;
const BANKS = [
  { name: 'base  ', z: null },
  { name: '+leaky', z: (r) => leakyStates(r, pilot.nm, pilot.nc) },
  { name: '+reson', z: (r) => resoStates(r, pilot.nm) },
];
for (const b of BANKS) {
  if (!b.z) continue;
  b.train = b.z(trainRec);
  b.hold = {}; for (const s of SHAPES) b.hold[s] = b.z(recs[s]);
}

for (let c = 0; c < pilot.nc; c++) {
  const ro = pilot.readouts[c];
  const LEADS = [0, Math.floor(ro.leads.length / 2), ro.leads.length - 1]
    .map((i) => ro.leads[Math.min(i, ro.leads.length - 1)]);
  console.log(`\n=== channel ${c} — held-out R^2, ${ro.mLag} lags x stride ${ro.stride}`
    + ` (reach ${(ro.mLag - 1) * ro.stride * pilot.sample} steps), ridge ${ro.ridge} ===`);
  console.log('  lead   block      cols   in-sample' + SHAPES.map((s) => s.padStart(11)).join(''));
  for (const L of LEADS) {
    // THE CONTROL: the PILOT'S OWN weight vector at this lead, scored on the same rows by the
    // same code. If the refit `base` arm does not land near it, this harness is measuring itself
    // rather than the block, and no row below means anything.
    {
      const li = ro.leads.indexOf(L);
      if (li >= 0 && ro.w[li]) {
        const cols = SHAPES.map((sh) => {
          const h = build(recs[sh], c, L, ro, false, null, recs[sh].e.map((v) => v[c]));
          return (h.X[0].length === ro.w[li].length ? r2(h.X, h.y, ro.w[li]).toFixed(4)
            : `len ${h.X[0].length}/${ro.w[li].length}`).padStart(11);
        }).join('');
        console.log(`  ${String(L).padStart(4)}   pilot     ${String(ro.w[li].length).padStart(4)}`
          + `          -${cols}`);
      }
    }
    for (const b of BANKS) {
      const tr = build(trainRec, c, L, ro, !!b.z, b.train, trainY[c]);
      const w = solveRidge(tr.X, tr.y, ro.ridge, scale(tr.X[0]));
      const cols = SHAPES.map((s) => {
        const h = build(recs[s], c, L, ro, !!b.z, b.z ? b.hold[s] : null, recs[s].e.map((v) => v[c]));
        return r2(h.X, h.y, w).toFixed(4).padStart(11);
      }).join('');
      console.log(`  ${String(L).padStart(4)}   ${b.name}   `
        + `${String(tr.X[0].length).padStart(4)}   ${r2(tr.X, tr.y, w).toFixed(4).padStart(9)}${cols}`);
    }
  }
}
console.log('EXIT 0');
