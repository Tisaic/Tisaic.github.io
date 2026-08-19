// CHEAP SANITY GATE, run before the expensive experiment rather than after.
// Can this configuration reconstruct at all? Train at ONE operating point with the
// domain properly flushed, freeze, re-settle, score. If this is not small, nothing
// built on top of it means anything -- and two envelope runs have already been
// thrown away for exactly that reason.
import { channelFlow } from '../lib/lattsim/scenes.js';
import { FieldReconstructor } from '../lib/probesense/sensor.js';

const PHYS = { collision: 'trt', trtPolicy: 'stability', smagorinsky: 0.16 };
const RES = +(process.env.RES || 16), U = 0.06, EVERY = 2, TRAIN = 600, SCORE = 100;

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
for (let i = 0; i < TRAIN; i++) { sim.advance(EVERY); const { sig, truth } = read(); model.push(sig); last = nrmseOf(model.observe(truth), truth); }
const trained = last;

flush(1);                                   // and now with nothing being fitted
const blind = [];
for (let i = 0; i < SCORE; i++) { sim.advance(EVERY); const { sig, truth } = read(); model.push(sig); blind.push(nrmseOf(model.estimate(), truth)); }
const mean = blind.reduce((a, b) => a + b, 0) / blind.length;

const d = await sim.diagnostics();
const conc = sim.backend.read('conc');
const tv = target.map((i) => conc[i]);
const tmean = tv.reduce((a, b) => a + b, 0) / tv.length;
const tstd = Math.sqrt(tv.reduce((a, b) => a + (b - tmean) ** 2, 0) / tv.length);
console.log(JSON.stringify({ res: RES, cells: N, size: [L.nx, L.ny, L.nz], sensors: sensors.length,
  target: target.length, transit: transit(), obstacleCells: sim.meta.obstacleCells,
  blockage: +(sim.meta.obstacleCells / L.ny).toFixed(2),
  trainedLast: +trained.toFixed(4), blindMean: +mean.toFixed(4),
  targetSpread: +tstd.toExponential(2), targetMean: +tmean.toFixed(4),
  limited: d.limited, residual: d.residual }, null, 1));
console.log(mean < 0.2
  ? `GATE PASS: res ${RES} reconstructs (blind nRMSE ${mean.toFixed(4)}). The envelope run can use it.`
  : `GATE FAIL: res ${RES} cannot reconstruct even at one settled point (blind nRMSE ${mean.toFixed(4)}).`
    + ' Fix the configuration before running the envelope experiment.');
sim.destroy();
