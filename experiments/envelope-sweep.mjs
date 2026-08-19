/**
 * Does sweeping the operating range during commissioning make the reconstruction
 * tolerant of it? And is one linear map enough to cover an envelope?
 *
 * regime-change.mjs measured the failure this is meant to fix: a model trained at
 * one operating point and then frozen went from nRMSE 0.008 to 92 when the inlet
 * doubled, because its inputs left the range it was calibrated on (67.77% pinned at
 * the +/-10 sigma clamp). The proposed fix is standard system identification --
 * excite the plant across its envelope during commissioning so deployment
 * INTERPOLATES instead of extrapolating.
 *
 * The objection this tests is that the sensor-to-field relation is not ONE map. The
 * wake changes character with Reynolds number, so a single linear map fitted across
 * an envelope may be the AVERAGE map: robust everywhere, sharp nowhere. If so, the
 * cure for that is capacity that can depend on the regime, which is why two of the
 * arms are given the operating point itself.
 *
 * FOUR ARMS, each differing from the one above it by exactly ONE thing, so what each
 * change is worth can be read off separately:
 *   A  single-point, linear                    -- today's model
 *   B  SWEPT, linear                           -- adds the sweep
 *   B+ swept, linear, + the regime as an input -- adds knowing the operating point
 *   C  swept, linear, + regime + sensor x regime cross terms -- adds gain scheduling
 *
 * C tests the specific mechanism claimed rather than throwing a large basis at the
 * problem: a linear model given the regime can only SHIFT its output, while
 * sensor x regime products let the map itself change shape with the operating point.
 * A full universal expansion would confound that with generic nonlinearity, and at
 * this sample budget would also be short of data (the repo's own rule of thumb is a
 * 10:1 sample-to-feature margin).
 *
 * PROTOCOL. Phase 1 holds the training point and trains A alone; phase 2 sweeps the
 * envelope in randomised order and trains B/B+/C alone -- so every arm gets the same
 * sample budget, differing only in how it is DISTRIBUTED. Arms do not push during a
 * phase they are not training in, because the input standardisation freezes on the
 * first `warmup` samples and B's window must span the SWEEP rather than phase 1.
 * Phase 3 freezes everything and scores all four on the same stream at held-out
 * operating points, inside the envelope and outside it.
 */
import { channelFlow } from '../lib/lattsim/scenes.js';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const PHYS = { collision: 'trt', trtPolicy: 'stability', smagorinsky: 0.16 };
const RES = 24, EVERY = 4;
const HOME = 0.06;                                  // where the single-point arm trains
const LEVELS = [0.04, 0.056, 0.072, 0.088, 0.104, 0.12];   // the commissioning envelope
const TESTS = [0.06, 0.05, 0.09, 0.11, 0.16];       // last one is OUTSIDE the envelope
const PER_VISIT = 80, PASSES = 3;                   // 6 x 80 x 3 = 1440 training samples
const WARMUP = 480;                                 // one full pass, so the window spans it
const SCORE_N = 150, SETTLE = 600;

const sim = channelFlow({ resolution: RES, obstacle: 'cylinder', inletVelocity: HOME,
  dye: true, ...PHYS });
await sim.build({ backend: 'cpu' });
const L = sim.lattice, zc = L.nz >> 1, N = L.cellCount;

const sensors = [];
for (const yw of [1, L.ny - 2]) for (let s = 0; s < 6; s++) {
  const x = Math.min(L.nx - 1, Math.round(L.nx * (0.1 + 0.85 * s / 5)));
  const i = L.index(x, yw, zc); if (sim.flags[i] !== 1) sensors.push(i);
}
const target = [];
for (let y = 0; y < L.ny; y++) for (let x = 0; x < L.nx; x++) {
  const i = L.index(x, y, zc); if (sim.flags[i] !== 1) target.push(i);
}

const nS = 3 * sensors.length;
const mk = (nSignals) => new FieldReconstructor({ nSignals, nLocations: target.length,
  lag: 1, stride: 1, warmup: WARMUP, expand: false, ridge: 100, lam: 1.0 });
const arms = [
  { name: 'A single-pt', model: mk(nS), phase: 1, regime: false, cross: false },
  { name: 'B swept', model: mk(nS), phase: 2, regime: false, cross: false },
  { name: 'B+ regime', model: mk(nS + 1), phase: 2, regime: true, cross: false },
  { name: 'C scheduled', model: mk(nS + 1 + nS), phase: 2, regime: true, cross: true },
];

let u = HOME;
const setU = (v) => { u = v; sim.operators[0].setParams({ inletVelocity: [v, 0, 0] }); };

function readSignals() {
  const mac = sim.backend.read('macro');
  const base = [];
  for (const c of sensors) base.push(mac[N + c], mac[2 * N + c], mac[c]);   // ux, uy, rho
  return base;
}
const sigFor = (a, base) => {
  if (!a.regime) return base;
  // The operating point is a KNOWN process parameter -- a controller knows its own
  // setpoint -- so feeding it is not cheating, it is using what a plant already has.
  const s = base.concat([u]);
  return a.cross ? s.concat(base.map((v) => v * u)) : s;
};

const nrmseOf = (est, truth) => {
  let mean = 0; for (const y of truth) mean += y; mean /= truth.length;
  let se = 0, sd = 0;
  for (let j = 0; j < truth.length; j++) { se += (est[j] - truth[j]) ** 2; sd += (truth[j] - mean) ** 2; }
  return Math.sqrt(se / Math.max(sd, 1e-30));
};
const meanOf = (xs) => { const f = xs.filter((v) => v != null && Number.isFinite(v));
  return f.length ? f.reduce((s, v) => s + v, 0) / f.length : NaN; };

/** One sample. `train` selects which arms fit; the rest only estimate (or idle). */
function sample(phase, score) {
  sim.advance(EVERY);
  const base = readSignals();
  const conc = sim.backend.read('conc');
  const truth = target.map((i) => conc[i]);
  const out = {};
  for (const a of arms) {
    const active = phase === 0 || a.phase === phase;      // phase 0 = everyone (scoring)
    if (!active) continue;
    a.model.push(sigFor(a, base));
    const est = phase === 0 ? a.model.estimate() : a.model.observe(truth);
    if (score && est) out[a.name] = nrmseOf(est, truth);
  }
  return out;
}

// deterministic pseudo-random visit order -- randomised so the model cannot learn a
// ramp, but reproducible so the run can be repeated.
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

sim.advance(800);                                         // develop the plume
for (let i = 0; i < PER_VISIT * PASSES * LEVELS.length; i++) sample(1, false);   // phase 1: A

const visits = [];
for (let p = 0; p < PASSES; p++) {
  const order = LEVELS.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  visits.push(...order);
}
for (const v of visits) { setU(v); for (let i = 0; i < PER_VISIT; i++) sample(2, false); }   // phase 2

// ---- phase 3: everything frozen, scored on the same stream at held-out points
const rows = [];
for (const v of TESTS) {
  setU(v);
  sim.advance(SETTLE);
  const acc = {};
  for (const a of arms) acc[a.name] = [];
  for (let i = 0; i < SCORE_N; i++) {
    const r = sample(0, true);
    for (const k in r) acc[k].push(r[k]);
  }
  const d = await sim.diagnostics();
  rows.push({ u: v, inside: v >= Math.min(...LEVELS) && v <= Math.max(...LEVELS),
    limited: d.limited, uMax: d.uMax,
    score: Object.fromEntries(arms.map((a) => [a.name, meanOf(acc[a.name])])) });
}

console.log(JSON.stringify({ cells: N, sensors: sensors.length, target: target.length,
  envelope: [Math.min(...LEVELS), Math.max(...LEVELS)], home: HOME,
  trainSamples: PER_VISIT * PASSES * LEVELS.length, warmup: WARMUP,
  nf: Object.fromEntries(arms.map((a) => [a.name, a.model.nf])) }, null, 1));
console.log('\nFrozen at deployment, nRMSE at held-out operating points:');
console.log('    u    where     ' + arms.map((a) => a.name.padStart(12)).join(''));
for (const r of rows) {
  console.log(`  ${r.u.toFixed(3)}  ${(r.inside ? 'inside ' : 'OUTSIDE')}  `
    + arms.map((a) => (r.score[a.name] < 1e4 ? r.score[a.name].toFixed(4) : r.score[a.name].toExponential(1)).padStart(12)).join('')
    + (r.limited ? `   (${r.limited} cells limited)` : ''));
}
const inside = rows.filter((r) => r.inside);
console.log('\nMean over the INSIDE points:');
for (const a of arms) console.log(`  ${a.name.padEnd(12)} ${meanOf(inside.map((r) => r.score[a.name])).toFixed(4)}`);
sim.destroy();
