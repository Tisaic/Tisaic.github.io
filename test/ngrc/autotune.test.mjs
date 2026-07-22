// Validates lib/ngrc/autotune.js against golden vectors from the Python reference:
// the search selects the same config + report, and the built model matches.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { autotune, makeModel } from '../../lib/ngrc/autotune.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(HERE, 'golden', 'autotune.json'), 'utf8'));

const TOL = 1e-9;
let failed = 0, checks = 0;
const approx = (a, b) => Math.abs(a - b) <= TOL + TOL * Math.abs(b);
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => approx(v, b[i]));
const mat2Eq = (a, b) => a.length === b.length && a.every((r, i) => arrEq(r, b[i]));
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}

console.log('\nNGRC autotune — golden-vector parity\n');

const cfg = autotune(g.data, { numVars: 1, lagOrders: [2, 4], initVariances: [1.0, 10.0], horizon: 15, valFrac: 0.35 });
const e = g.chosen;
check('chosen.name', cfg.name === e.name, `${cfg.name} vs ${e.name}`);
check('chosen.lag', cfg.lagOrder === e.lag_order);
check('chosen.poly', cfg.polyOrder === e.poly_order);
check('chosen.init_variance', approx(cfg.initVariance, e.init_variance));
check('chosen.num_features', cfg.numFeatures === e.num_features);
check('chosen.use_clamp', cfg.useClamp === e.use_clamp);
check('chosen.clamp_min', arrEq(cfg.clampMin, e.clamp_min));
check('chosen.clamp_max', arrEq(cfg.clampMax, e.clamp_max));
check('chosen.max_cov_trace', approx(cfg.maxCovTrace, e.max_cov_trace), `${cfg.maxCovTrace} vs ${e.max_cov_trace}`);
check('chosen.val_nrmse', approx(cfg.valNrmse, e.val_nrmse), `${cfg.valNrmse} vs ${e.val_nrmse}`);

// report parity (name, lag, iv, nfeat, nrmse, bounded)
let repFail = 0;
if (cfg.report.length !== g.report.length) repFail++;
else for (let i = 0; i < cfg.report.length; i++) {
  const a = cfg.report[i], b = g.report[i];
  if (!(a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && approx(a[4], b[4]) && a[5] === b[5])) repFail++;
}
check(`report (${g.report.length} entries)`, repFail === 0, `${repFail} mismatched`);

// build the chosen model and run — final weights must match
const m = makeModel(cfg, { numVars: 1 });
for (let t = 0; t < g.data.length; t++) m.step(g.data[t]);
check('final theta', mat2Eq(m.theta.map((th) => th.m), g.final_theta));

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${checks - failed}/${checks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
