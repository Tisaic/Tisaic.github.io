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
// THE CLAIM THIS TEST USED TO MAKE WAS UNFALSIFIABLE, and correcting it is most of
// what changed here. It asserted the reconstruction beats "predicting the spatial
// mean", which on a settled dye plume is a very low bar -- and the number it
// reported (~0.01) was measured on a flow so steady that a STATIC MAP, each
// location's own time average using no sensor at all, does BETTER. A small nRMSE
// is not a result without the do-nothing control, and on the steady scene the
// honest verdict was that the sensors were not earning their place.
//
// Two consequences. The inlet is now DRIVEN (multitone), because the scalar is
// one-way coupled -- dye is advected by the flow and never acts on it -- so on a
// steady flow the plume is a fixed function of the flow, a constant per location
// is the right answer, and there is nothing to infer. And the static map is
// carried as a rival in every check, so the claim is "better than doing nothing"
// rather than "small".
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
  inletMode: 'multitone', inletAmplitude: 0.3, inletRate: 0.004,
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

sim.advance(400);                                  // let the plume develop first
let early = null, last = null, finite = true, grade = null;
// TRAINING BEGINS AT 2x WARMUP, NOT AT WARMUP. The bank calibrates its inputs over
// `warmup` samples and the reconstructor calibrates its per-location target scale
// over `warmup` more, running PREDICT-ONLY until it has one -- because before the
// freeze the normalised target would be the raw concentration, and at lam = 1
// those wrong-scale equations are carried forever. An earlier version of this test
// sampled `early` at 120 with warmup 80, i.e. inside that window, and so measured
// an untrained model (1.444) while calling it "just past warmup".
const TRAIN_AT = 2 * 80;
for (let t = 0; t < 700; t++) {
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
    if (early == null && model.samples > TRAIN_AT + 60) early = e;
    last = e;
    grade = model.grade(truth, est);
  }
}

check('sensors landed on fluid wall cells', sensors.length >= 8, String(sensors.length));
check('the target is a real slice of the field', target.length > 150, String(target.length));
check('the reconstruction is finite everywhere', finite, 'a non-finite estimate appeared');
check('it beats predicting the spatial mean by a wide margin (nRMSE < 0.6)', last != null && last < 0.6,
  last == null ? 'no estimate' : last.toFixed(3));
// THE CONTROL, AND IT IS THE CHECK THAT MATTERS. Without it this file passed for
// months on a configuration where doing nothing was fifty times better.
check('the field is actually doing something (activity > 1%)',
  grade && grade.activity > 0.01,
  grade ? `activity ${(100 * grade.activity).toFixed(2)}%` : 'no grade');
check('it beats the DO-NOTHING static map (a constant per cell)',
  grade && grade.ratio != null && grade.ratio > 1,
  grade ? `model ${grade.model.toExponential(2)} vs static map ${grade.staticMap.toExponential(2)}`
    + ` = ${grade.ratio.toFixed(2)}x` : 'no grade');
// Both readings good, rather than "keeps improving": once the target scale exists
// the fit converges quickly on this geometry and then only fluctuates with the
// flow. `early` is sampled after training has genuinely begun -- see TRAIN_AT.
check('it learned fast and stayed good (early and late both < 0.6)',
  early != null && early < 0.6 && last < 0.6,
  `${early == null ? 'n/a' : early.toFixed(3)} -> ${last == null ? 'n/a' : last.toFixed(3)}`);
sim.destroy();

console.log(`  measured: nRMSE ${last == null ? 'n/a' : last.toExponential(2)} from ${sensors.length}`
  + ` wall sensors, ${target.length} cells`
  + (grade ? ` · static map ${grade.staticMap.toExponential(2)} (${grade.ratio.toFixed(1)}x)`
    + ` · activity ${(100 * grade.activity).toFixed(2)}%` : ''));
console.log(failed ? `\n  ${failed} check(s) failed\n` : '  all checks passed\n');
process.exit(failed ? 1 : 0);
