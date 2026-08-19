/**
 * What is continuous adaptation worth? Freeze a trained field reconstruction, then
 * change the flow underneath it.
 *
 * The blind reconstruction holds beautifully on a STATIONARY flow (measured: nRMSE
 * 0.114 training -> 0.125 blind, over 1500 steps). That is not a hard test: a frozen
 * linear map keeps working precisely because the sensor-to-field relation is not
 * moving. The real test of a soft sensor is a REGIME CHANGE -- the operating point
 * moving somewhere the training history never went. This repo has already measured
 * that failure once, for frozen PLS on the servo tab: 0.2438 the moment history ran
 * out, against ~0.02 for the adapting model.
 *
 * THREE ARMS, IDENTICAL UP TO THE SWITCH, so the only difference afterwards is
 * whether (and how) the model keeps learning:
 *   frozen        lam 1.0, LOCKED at the switch -- the blind soft sensor
 *   adaptive      lam 1.0, keeps training       -- infinite memory
 *   forgetting    lam 0.999, keeps training     -- discounts old data
 * `frozen` and `adaptive` are the same configuration on the same stream, so their
 * weights are IDENTICAL at the moment of the switch: a genuine control, not a
 * lookalike. All three are scored on the SAME instances every sample.
 *
 * The regime change is the inlet speed, doubled. It runs on the CPU reference
 * because that backend reads the operator's parameters fresh every step, so the new
 * inlet takes effect immediately without a rebuild -- a rebuild would reset the flow
 * and destroy the very history being tested.
 *
 * NOTE what "adaptive" can and cannot do here: RLS updates the WEIGHTS, but the
 * bank's input standardisation was frozen at calibration. So every arm meets the new
 * regime with training-era input scaling, and only the weights can respond. That is
 * the honest configuration of a recursive soft sensor, and it is why the inputs may
 * saturate rather than merely shift.
 *
 * MEASURED (res 24 dye channel, 12 wall sensors, 1559 cells, u 0.06 -> 0.12):
 *   baseline    frozen 0.0076 · adaptive 0.0076 · forgetting 0.0058
 *   +600 steps  frozen 92.94  · adaptive 5.08   · forgetting 5.21
 *   +1200       frozen 87.13  · adaptive 0.0400 · forgetting 0.0315
 *   +1800       frozen 91.62  · adaptive 0.0110 · forgetting 0.0062
 *   +3600       frozen 91.62  · adaptive 0.0031 · forgetting 0.0012
 *   saturation  0.00% before the switch -> 67.77% after, ALL THREE ARMS
 *
 * THE CONTROL HELD: frozen and adaptive score identically at baseline (0.0076), so
 * everything after the switch is adaptation and nothing else.
 *
 * FROZEN DOES NOT DEGRADE, IT BREAKS -- and stays broken. nRMSE 92 is an output
 * about 92x the field's own spread; a blind readout that is merely useless would
 * score 1.0. So the ratio at the end (~30000x) is the ratio of a BROKEN number to a
 * working one and is not worth quoting as the value of adaptation.
 *
 * AND THE SATURATION MEASUREMENT OVERTURNED THE FIRST EXPLANATION, which is the
 * useful part. "The frozen model fails because its inputs saturate" is WRONG: the
 * adaptive arms meet the SAME 67.77% saturation on the SAME stream and recover to
 * 0.003. Two thirds of the inputs being pinned at the clamp is survivable, because a
 * clipped vector is still a deterministic function of the state and a re-fitted map
 * accommodates the distortion. What is not survivable is a FIXED map fed values ten
 * times larger than any it was fitted on: the error scales with the weights, so the
 * failure is unbounded rather than graceful. The information is still there; the
 * CALIBRATION is what expired.
 *
 * ADAPTATION IS NOT INSTANT EITHER. Both adaptive arms spike to ~5.0 immediately
 * after the change -- five times worse than predicting the mean -- and need ~1200
 * steps to come back. Any regime change buys a blind window; adaptation shortens it,
 * it does not remove it.
 *
 * FORGETTING WINS EVERYWHERE, not only after the change: 0.0058 vs 0.0076 at
 * baseline and 0.0012 vs 0.0031 at the end. The prediction that lam = 1.0 would
 * recover more slowly held (0.0110 vs 0.0062 at +1800), but the reason is not only
 * memory of the old regime -- lam 0.999 also tracks the flow's own slow evolution
 * within a regime, which is why it leads before the switch as well.
 *
 * WHAT THIS SAYS TO BUILD: a blind soft sensor must know when its inputs have left
 * the window it was calibrated on, and say so, instead of emitting a confident wrong
 * number. The bank already counts exactly that signal (`clamped`), and the page's
 * blind mode now surfaces it. Automatic recalibration is the other half and exists
 * in FieldSoftSensor (`_recalibrateIfUnrepresentative`) but is NOT wired into
 * FieldReconstructor -- the obvious next step, and deliberately not done here so the
 * failure above stays measured rather than papered over.
 */
import { channelFlow } from '../lib/lattsim/scenes.js';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const PHYS = { collision: 'trt', trtPolicy: 'stability', smagorinsky: 0.16 };
const U_A = 0.06, U_B = 0.12;             // the regime change: double the inlet speed
const RES = 24, EVERY = 4;
const TRAIN = 700, BASE = 120, AFTER = 900;

const sim = channelFlow({ resolution: RES, obstacle: 'cylinder', inletVelocity: U_A,
  dye: true, ...PHYS });
await sim.build({ backend: 'cpu' });
const L = sim.lattice, zc = L.nz >> 1;

// wall sensors on both no-slip walls; target is the whole mid-plane
const sensors = [];
for (const yw of [1, L.ny - 2]) for (let s = 0; s < 6; s++) {
  const x = Math.min(L.nx - 1, Math.round(L.nx * (0.1 + 0.85 * s / 5)));
  const i = L.index(x, yw, zc); if (sim.flags[i] !== 1) sensors.push(i);
}
const target = [];
for (let y = 0; y < L.ny; y++) for (let x = 0; x < L.nx; x++) {
  const i = L.index(x, y, zc); if (sim.flags[i] !== 1) target.push(i);
}

const mk = (lam) => new FieldReconstructor({ nSignals: 3 * sensors.length, nLocations: target.length,
  lag: 1, stride: 1, warmup: 120, expand: false, ridge: 100, lam });
const arms = [
  { name: 'frozen', model: mk(1.0), lock: true, locked: false },
  { name: 'adaptive', model: mk(1.0), lock: false, locked: false },
  { name: 'forgetting', model: mk(0.999), lock: false, locked: false },
];

const nrmseOf = (est, truth) => {
  let mean = 0; for (const y of truth) mean += y; mean /= truth.length;
  let se = 0, sd = 0;
  for (let j = 0; j < truth.length; j++) { se += (est[j] - truth[j]) ** 2; sd += (truth[j] - mean) ** 2; }
  return Math.sqrt(se / Math.max(sd, 1e-30));
};

/** One sample: identical inputs and truth to every arm, scored pairwise. */
function step() {
  sim.advance(EVERY);
  const mac = sim.backend.read('macro'), N = L.cellCount;
  const sig = [];
  for (const c of sensors) sig.push(mac[N + c], mac[2 * N + c], mac[c]);   // ux, uy, rho
  const conc = sim.backend.read('conc');
  const truth = target.map((i) => conc[i]);
  const out = {};
  for (const a of arms) {
    a.model.push(sig);
    const est = a.locked ? a.model.estimate() : a.model.observe(truth);
    out[a.name] = est ? nrmseOf(est, truth) : null;
  }
  return out;
}

const meanOf = (xs) => xs.filter((v) => v != null && Number.isFinite(v))
  .reduce((s, v, _, arr) => s + v / arr.length, 0);

sim.advance(500);                                   // develop the plume at regime A
for (let i = 0; i < TRAIN; i++) step();             // train all three, same stream

// baseline at the training regime -- the arms should agree here, and if they do not
// the comparison afterwards is measuring something other than the regime change.
const base = { frozen: [], adaptive: [], forgetting: [] };
for (let i = 0; i < BASE; i++) { const r = step(); for (const k in base) base[k].push(r[k]); }

// ---- THE SWITCH: lock the frozen arm, then move the operating point
for (const a of arms) if (a.lock) a.locked = true;
const clampAtSwitch = arms.map((a) => a.model.bank.clamped);
const pushesAtSwitch = arms.map((a) => a.model.bank.nPushed);
sim.operators[0].params.inletVelocity = [U_B, 0, 0];

const win = [];                                     // windowed scores after the change
const W = 150;
for (let w = 0; w < Math.ceil(AFTER / W); w++) {
  const acc = { frozen: [], adaptive: [], forgetting: [] };
  for (let i = 0; i < W; i++) { const r = step(); for (const k in acc) acc[k].push(r[k]); }
  win.push({ steps: (w + 1) * W * EVERY, frozen: meanOf(acc.frozen),
    adaptive: meanOf(acc.adaptive), forgetting: meanOf(acc.forgetting) });
}

const d = await sim.diagnostics();
console.log(JSON.stringify({ cells: L.cellCount, sensors: sensors.length, target: target.length,
  uA: U_A, uB: U_B, limited: d.limited, uMax: d.uMax, stable: d.stable && d.stable.state }, null, 1));
console.log(`\nBaseline at the training regime (u ${U_A}), nRMSE:`);
for (const k of ['frozen', 'adaptive', 'forgetting']) console.log(`  ${k.padEnd(11)} ${meanOf(base[k]).toFixed(4)}`);
console.log(`\nAfter the inlet doubles to ${U_B} (solver steps since the switch):`);
console.log('  steps   frozen   adaptive   forgetting');
for (const r of win) {
  console.log(`  ${String(r.steps).padStart(5)}   ${r.frozen.toFixed(4)}   ${r.adaptive.toFixed(4)}     ${r.forgetting.toFixed(4)}`);
}
// WHY the frozen arm fails the way it does. The inputs are standardised on the
// training window and clamped at +/-10 sigma; if the new regime pushes them past
// that, they pin at the clamp and stop carrying information, and frozen weights
// then map a saturated vector to a large constant error. That is a different
// failure from merely stale weights, and it is the one the fix would target.
console.log('\nInput saturation (share of input slots hitting the +/-10 sigma clamp):');
for (let i = 0; i < arms.length; i++) {
  const a = arms[i];
  const dPush = a.model.bank.nPushed - pushesAtSwitch[i];
  const dClamp = a.model.bank.clamped - clampAtSwitch[i];
  const before = clampAtSwitch[i] / Math.max(1, pushesAtSwitch[i] * a.model.bank.base);
  const after = dClamp / Math.max(1, dPush * a.model.bank.base);
  console.log(`  ${a.name.padEnd(11)} before ${(100 * before).toFixed(2)}%   after ${(100 * after).toFixed(2)}%`);
}
const last = win[win.length - 1];
console.log(`\nadaptation is worth ${(last.frozen / Math.max(last.adaptive, 1e-9)).toFixed(2)}x `
  + `(frozen / adaptive) and ${(last.frozen / Math.max(last.forgetting, 1e-9)).toFixed(2)}x with forgetting, `
  + 'at the end of the run');
sim.destroy();
