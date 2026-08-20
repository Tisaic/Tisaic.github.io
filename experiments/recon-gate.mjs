// CHEAP SANITY GATE, run before the expensive experiment rather than after.
// Can this configuration reconstruct at all? Train at ONE operating point with the
// domain properly flushed, freeze, re-settle, score. If this is not small, nothing
// built on top of it means anything -- and two envelope runs have already been
// thrown away for exactly that reason.
//
// THE FIRST VERSION OF THIS GATE PASSED A CONFIGURATION WITH NO CONTENT, and the
// fix is the control it was missing rather than a tighter threshold. It asked
// "is the blind error small", got 0.079, and passed. What it needed to ask is
// "is it better than doing nothing" -- and a STATIC MAP, each location's own time
// average with no sensor read at all, scores 1.7e-3 on that same stream. The
// model was FIFTY TIMES WORSE than a constant.
//
// The cause was physics: at resolution 16 and inlet 0.06 the cylinder sits at
// Re ~72, below the confined shedding threshold this project measured as lying
// between 72 and 120. The wake oscillates while decaying, the plume settles, and
// a field that does not move cannot be inferred -- only recalled. Every noise and
// layout result built on that stream measured how a perturbation disturbs a model
// that had nothing to fit.
//
// So the gate now reports the static-map baseline and the field's own activity,
// and PASSING REQUIRES BEATING THE BASELINE. A small number is not a result.
import { channelFlow } from '../lib/lattsim/scenes.js';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const PHYS = { collision: 'trt', trtPolicy: 'stability', smagorinsky: 0.16 };
// U is settable because it is the cheap Reynolds lever: Re = u*D/nu scales with
// it AND the transit time shortens, so a supercritical case costs less to settle
// rather than more. The 0.06 default is the value this gate wrongly passed at.
const RES = +(process.env.RES || 16), U = +(process.env.U || 0.06);
const EVERY = 2, TRAIN = 600, SCORE = 100;

const sim = channelFlow({ resolution: RES, obstacle: 'cylinder', inletVelocity: U,
  dye: true, ...PHYS });
await sim.build({ backend: 'cpu' });
const L = sim.lattice, zc = L.nz >> 1, N = L.cellCount;

// TRANSITS, not a residual threshold. The per-step residual of a slow transient sits
// below the convergence threshold while the flow is still crossing the domain, which
// is how the previous run settled in 100 steps and measured nothing.
const transit = () => Math.ceil(L.nx / U);
const flush = (n) => sim.advance(n * transit());

const sensors = [];
for (const yw of [1, L.ny - 2]) for (let s = 0; s < 6; s++) {
  const x = Math.min(L.nx - 1, Math.round(L.nx * (0.1 + 0.85 * s / 5)));
  const i = L.index(x, yw, zc); if (sim.flags[i] !== 1) sensors.push(i);
}
const target = [];
for (let y = 0; y < L.ny; y += 2) for (let x = 0; x < L.nx; x += 2) {
  const i = L.index(x, y, zc); if (sim.flags[i] !== 1) target.push(i);
}
const model = new FieldReconstructor({ nSignals: 3 * sensors.length, nLocations: target.length,
  lag: 1, stride: 1, warmup: 200, expand: false, ridge: 100, lam: 1.0 });

const read = () => {
  const mac = sim.backend.read('macro'), sig = [];
  for (const c of sensors) sig.push(mac[N + c], mac[2 * N + c], mac[c]);
  const conc = sim.backend.read('conc');
  return { sig, truth: target.map((i) => conc[i]) };
};
const nrmseOf = (est, truth) => {
  let m = 0; for (const y of truth) m += y; m /= truth.length;
  let se = 0, sd = 0;
  for (let j = 0; j < truth.length; j++) { se += (est[j] - truth[j]) ** 2; sd += (truth[j] - m) ** 2; }
  return Math.sqrt(se / Math.max(sd, 1e-30));
};

flush(2);
let last = null;
// The static map is accumulated over the SAME window the model trains on, so it
// is the honest do-nothing rival: it is given exactly the history the model is,
// and simply never looks at a sensor.
const smMu = new Float64Array(target.length), smM2 = new Float64Array(target.length);
let smN = 0;
for (let i = 0; i < TRAIN; i++) {
  sim.advance(EVERY);
  const { sig, truth } = read();
  smN++;
  for (let k = 0; k < target.length; k++) {
    const d = truth[k] - smMu[k];
    smMu[k] += d / smN; smM2[k] += d * (truth[k] - smMu[k]);
  }
  model.push(sig);
  // null until the calibration window closes -- there is no feature column yet.
  const est = model.observe(truth);
  if (est) last = nrmseOf(est, truth);
}
const trained = last;
// Field activity: how much a location moves in TIME against how much the field
// varies in SPACE, which is nRMSE's denominator. Below about a percent there is
// nothing to infer and the task has collapsed into recall.
const tempStd = Array.from(smM2, (v) => Math.sqrt(v / smN));
const meanTemp = tempStd.reduce((a, b) => a + b, 0) / tempStd.length;

flush(1);                                   // and now with nothing being fitted
const blind = [], baseline = [];
let spatial = 0;
for (let i = 0; i < SCORE; i++) {
  sim.advance(EVERY);
  const { sig, truth } = read();
  model.push(sig);
  const est = model.estimate();
  if (est) blind.push(nrmseOf(est, truth));
  baseline.push(nrmseOf(smMu, truth));
  let m = 0; for (const v of truth) m += v; m /= truth.length;
  spatial += Math.sqrt(truth.reduce((a, v) => a + (v - m) ** 2, 0) / truth.length) / SCORE;
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const mean = avg(blind), base = avg(baseline);

const d = await sim.diagnostics();
const conc = sim.backend.read('conc');
const tv = target.map((i) => conc[i]);
const tmean = tv.reduce((a, b) => a + b, 0) / tv.length;
const tstd = Math.sqrt(tv.reduce((a, b) => a + (b - tmean) ** 2, 0) / tv.length);
console.log(JSON.stringify({ res: RES, cells: N, size: [L.nx, L.ny, L.nz], sensors: sensors.length,
  target: target.length, transit: transit(), obstacleCells: sim.meta.obstacleCells,
  blockage: +(sim.meta.obstacleCells / L.ny).toFixed(2),
  trainedLast: trained == null ? null : +trained.toFixed(4),
  blindMean: Number.isFinite(mean) ? +mean.toFixed(4) : null, blindSamples: blind.length,
  staticMapNrmse: +base.toExponential(3),
  modelOverStaticMap: +(mean / base).toFixed(2),
  temporalOverSpatial: +(meanTemp / spatial).toExponential(2),
  targetSpread: +tstd.toExponential(2), targetMean: +tmean.toFixed(4),
  limited: d.limited, residual: d.residual }, null, 1));

// TWO CONDITIONS, AND THE SECOND IS THE ONE THAT WAS MISSING. A small error means
// nothing if a constant per location already achieves it.
const beatsBaseline = mean < 0.5 * base;
const hasContent = meanTemp / spatial > 0.01;
console.log(!hasContent
  ? `GATE FAIL: the field is STEADY (temporal/spatial ${(meanTemp / spatial).toExponential(2)}).`
    + ` A static map scores ${base.toExponential(2)} with no sensor at all, so there is`
    + ' nothing here to infer. Raise the Reynolds number until the wake sheds.'
  : !beatsBaseline
    ? `GATE FAIL: blind nRMSE ${mean.toFixed(4)} does not beat the do-nothing static map`
      + ` (${base.toExponential(3)}); the sensors are not earning their place.`
    : `GATE PASS: res ${RES} reconstructs (blind nRMSE ${mean.toFixed(4)}, static map`
      + ` ${base.toExponential(3)}, ${(base / mean).toFixed(1)}x better than doing nothing).`);
sim.destroy();
