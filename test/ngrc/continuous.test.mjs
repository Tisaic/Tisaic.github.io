// Validates lib/ngrc/continuous.js against golden vectors from the Python
// reference (test/ngrc/golden/continuous.json). Each config runs a deterministic
// series through step() and compares every per-cycle output, plus final weights
// and a non-mutating control probe.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Continuous } from '../../lib/ngrc/continuous.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(HERE, 'golden', 'continuous.json'), 'utf8'));

const TOL = 1e-9;
let failed = 0, checks = 0;
const approx = (a, b) => Math.abs(a - b) <= TOL + TOL * Math.abs(b);
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => approx(v, b[i]));
const mat2Eq = (a, b) => a.length === b.length && a.every((r, i) => arrEq(r, b[i]));
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}

// snake_case config keys → camelCase constructor opts
const OPT = {
  prediction_steps: 'predictionSteps', init_variance: 'initVariance', num_inputs: 'numInputs',
  use_delta: 'useDelta', max_cov_trace: 'maxCovTrace', use_clamp: 'useClamp',
  clamp_min: 'clampMin', clamp_max: 'clampMax', auto_normalize: 'autoNormalize',
  calib_samples: 'calibSamples', adaptive_forgetting: 'adaptiveForgetting', lam_min: 'lamMin',
  directional_forgetting: 'directionalForgetting', direct_horizons: 'directHorizons', lam: 'lam', stride: 'stride',
};

console.log('\nNGRC Continuous forecaster — golden-vector parity\n');

for (const name of Object.keys(g)) {
  const c = g[name];
  const cfg = c.config;
  const nv = cfg.num_variables, ni = cfg.num_inputs || 0;
  const opts = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (['name', 'num_variables', 'lag_order', 'poly_order', 'use_bias'].includes(k)) continue;
    opts[OPT[k] || k] = v;
  }
  const m = new Continuous(cfg.num_variables, cfg.lag_order, cfg.poly_order, cfg.use_bias, opts);

  let stepFail = 0;
  for (let t = 0; t < c.sig[0].length; t++) {
    const smp = Array.from({ length: nv }, (_, v) => c.sig[v][t]);
    const inv = ni ? Array.from({ length: ni }, (_, u) => c.inp[u][t]) : null;
    const r = m.step(smp, inv);
    const e = c.steps[t];
    let okStep = mat2Eq(r.prediction, e.prediction)
      && arrEq(r.rmse, e.rmse) && approx(r.overallRmse, e.overall_rmse)
      && arrEq(r.residual, e.residual) && arrEq(r.confidence, e.confidence)
      && r.warm === e.warm && r.diverged === e.diverged && r.sampleCount === e.sample_count;
    if (e.direct_prediction === null) okStep = okStep && r.directPrediction === null;
    else okStep = okStep && mat2Eq(r.directPrediction, e.direct_prediction);
    if (!okStep) { stepFail++; if (stepFail <= 2) console.log(`    step ${t} mismatch in ${name}`); }
  }
  check(`${name}: ${c.sig[0].length} steps`, stepFail === 0, `${stepFail} steps mismatched`);

  const theta = m.theta.map((th) => th.m);
  check(`${name}: theta`, mat2Eq(theta, c.theta));

  const probe = m.predictCandidate(
    Array.from({ length: nv }, (_, v) => c.sig[v][0]),
    ni ? Array.from({ length: ni }, (_, u) => c.inp[u][0]) : null);
  check(`${name}: probe`, arrEq(probe, c.probe), JSON.stringify(probe));
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${checks - failed}/${checks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
