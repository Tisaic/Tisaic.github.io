// Validates lib/ngrc/dropin.js against golden vectors from the Python reference
// (test/ngrc/golden/dropin.json). Checks the embedded forecasts, the raw-unit
// state predictions (angular mapped back via atan2), and final weights.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DropInEstimator } from '../../lib/ngrc/dropin.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(HERE, 'golden', 'dropin.json'), 'utf8'));

const TOL = 1e-9;
let failed = 0, checks = 0;
const approx = (a, b) => Math.abs(a - b) <= TOL + TOL * Math.abs(b);
const arrEq = (a, b) => (a == null || b == null) ? a === b : (a.length === b.length && a.every((v, i) => approx(v, b[i])));
const mat2Eq = (a, b) => a.length === b.length && a.every((r, i) => arrEq(r, b[i]));
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}

console.log('\nNGRC DropInEstimator — golden-vector parity\n');

for (const name of Object.keys(g)) {
  const c = g[name];
  const ns = c.kinds.length, ni = c.num_inputs;
  const est = new DropInEstimator(c.kinds, {
    numInputs: ni, lag: c.lag, adapt: c.adapt, predictionSteps: c.prediction_steps,
  });
  let stepFail = 0;
  for (let t = 0; t < c.state[0].length; t++) {
    const st = Array.from({ length: ns }, (_, s) => c.state[s][t]);
    const iv = ni ? Array.from({ length: ni }, (_, u) => c.inp[u][t]) : null;
    const r = est.step(st, iv);
    const e = c.steps[t];
    const sp = r.statePrediction === undefined ? null : r.statePrediction;
    const sph = r.statePredictionH === undefined ? null : r.statePredictionH;
    const ok = mat2Eq(r.prediction, e.prediction) && arrEq(r.rmse, e.rmse)
      && r.warm === e.warm && r.sampleCount === e.sample_count
      && arrEq(sp, e.state_prediction) && arrEq(sph, e.state_prediction_h);
    if (!ok) { stepFail++; if (stepFail <= 2) console.log(`    step ${t} mismatch in ${name}`); }
  }
  check(`${name}: ${c.state[0].length} steps`, stepFail === 0, `${stepFail} mismatched`);
  const theta = est.model.theta.map((th) => th.m);
  check(`${name}: theta`, mat2Eq(theta, c.theta));
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${checks - failed}/${checks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
