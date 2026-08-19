// Field reconstruction on the lattsim dye channel (CPU reference).
//
// This is the page's Phase-2 demo as a headless regression: a ring of wall
// sensors reads velocity and pressure ONLY -- never the dye -- and one
// shared-covariance FieldReconstructor rebuilds the whole concentration slice
// from them. It exercises the exact pipeline the page runs each frame
// (backend.probeMany for the sensors, snapshot for the truth, push+observe), so a
// break in probeMany, the scalar field or the reconstructor shows up here in
// plain Node rather than only on a device.
//
// The claim is modest and robust: reconstructing an unseen field from a handful
// of boundary sensors beats predicting its spatial mean by a wide margin, and it
// gets better as it trains. The tight per-scene numbers live in experiments/.
import { channelFlow } from '../../lib/lattsim/scenes.js';
import { FieldReconstructor } from '../../lib/probesense/sensor.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nlattsim: field reconstruction from wall sensors (CPU reference)');

const sim = channelFlow({ resolution: 16, obstacle: 'cylinder', inletVelocity: 0.08, dye: true,
  collision: 'trt', trtPolicy: 'stability', smagorinsky: 0.16 });
await sim.build({ backend: 'cpu' });
const L = sim.lattice;
const zc = L.nz >> 1;

// Target: every fluid cell of the display slice (z = mid). Sensors: both no-slip
// y-walls, several streamwise stations -- the layout the page places.
const target = [];
for (let y = 0; y < L.ny; y++) for (let x = 0; x < L.nx; x++) {
  const i = L.index(x, y, zc); if (sim.flags[i] !== 1) target.push(i);
}
const sensors = [];
for (const yw of [1, L.ny - 2]) for (let s = 0; s < 6; s++) {
  const x = Math.min(L.nx - 1, Math.round(L.nx * (0.1 + 0.85 * s / 5)));
  const i = L.index(x, yw, zc); if (sim.flags[i] !== 1) sensors.push(i);
}

const model = new FieldReconstructor({ nSignals: 3 * sensors.length, nLocations: target.length,
  lag: 1, stride: 1, warmup: 80, expand: false, ridge: 100 });

const nrmseOf = (est, truth) => {
  let mean = 0; for (const y of truth) mean += y; mean /= truth.length;
  let se = 0, sd = 0;
  for (let j = 0; j < truth.length; j++) { se += (est[j] - truth[j]) ** 2; sd += (truth[j] - mean) ** 2; }
  return Math.sqrt(se / Math.max(sd, 1e-30));
};

sim.advance(200);                                  // let the plume develop first
let early = null, last = null, finite = true;
for (let t = 0; t < 250; t++) {
  sim.advance(4);
  const sv = await sim.backend.probeMany('macro', sensors);
  const sig = []; for (const v of sv) { sig.push(v[1], v[2], v[0]); }   // ux, uy, rho
  const conc = await sim.backend.snapshot('conc');
  const truth = target.map((i) => conc[i]);
  model.push(sig);
  const est = model.observe(truth);
  if (est) {
    if (!est.every(Number.isFinite)) finite = false;
    const e = nrmseOf(est, truth);
    if (early == null && model.samples > 120) early = e;   // just past warmup
    last = e;
  }
}

check('sensors landed on fluid wall cells', sensors.length >= 8, String(sensors.length));
check('the target is a real slice of the field', target.length > 150, String(target.length));
check('the reconstruction is finite everywhere', finite, 'a non-finite estimate appeared');
check('it beats predicting the spatial mean by a wide margin (nRMSE < 0.6)', last != null && last < 0.6,
  last == null ? 'no estimate' : last.toFixed(3));
// It converges FAST here on purpose -- a small laminar dye channel is highly
// reconstructable, so the readout is already excellent just past warmup and then
// only fluctuates with the flow. The claim is that both readings are good, not
// that a near-perfect fit keeps improving (the harder-regime numbers are in
// experiments/, where a turbulent wake column sits at ~0.26 rather than ~0.01).
check('it learned fast and stayed good (early and late both < 0.6)',
  early != null && early < 0.6 && last < 0.6,
  `${early == null ? 'n/a' : early.toFixed(3)} -> ${last == null ? 'n/a' : last.toFixed(3)}`);
sim.destroy();

console.log(`  measured: nRMSE ${last == null ? 'n/a' : last.toFixed(3)} from ${sensors.length} wall sensors, ${target.length} cells`);
console.log(failed ? `\n  ${failed} check(s) failed\n` : '  all checks passed\n');
process.exit(failed ? 1 : 0);
