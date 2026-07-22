// Validates lib/ngrc/primitives.js against golden vectors generated from the
// Python reference (test/ngrc/golden/primitives.json). No Python needed here —
// the golden JSON is committed. Run via ./test/ngrc/run.sh (or node directly).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  Block, buildLagsStride, polyExpand, addBias, predict,
  rlsInit, rls, rmse, calcMem,
} from '../../lib/ngrc/primitives.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(HERE, 'golden', 'primitives.json'), 'utf8'));

const TOL = 1e-12;
let failed = 0, checks = 0;

function approx(a, b, tol = TOL) {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= tol + tol * Math.abs(b);
}
function arrEq(a, b, tol = TOL) {
  if (a == null || b == null) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!approx(a[i], b[i], tol)) return false;
  return true;
}
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}
const col = (a) => new Block(a.length, 1, a);

console.log('\nNGRC primitives — golden-vector parity\n');

// build_lags_stride
golden.build_lags_stride.forEach((c, i) => {
  const hists = c.histories.map(col);
  const inh = c.in_histories ? c.in_histories.map(col) : null;
  const out = buildLagsStride(hists, c.lag_order, c.num_vars, c.stride, inh, c.num_inputs);
  check(`build_lags_stride[${i}]`, arrEq(out ? out.m : null, c.out), JSON.stringify(out ? out.m : null));
});

// poly_expand
golden.poly_expand.forEach((c, i) => {
  const out = polyExpand(col(c.x), c.order);
  check(`poly_expand[${i}]`, arrEq(out ? out.m : null, c.out), JSON.stringify(out ? out.m : null));
});

// add_bias
golden.add_bias.forEach((c, i) => {
  const out = addBias(col(c.x));
  check(`add_bias[${i}]`, arrEq(out ? out.m : null, c.out));
});

// predict
golden.predict.forEach((c, i) => {
  const out = predict(col(c.x), col(c.theta));
  check(`predict[${i}]`, approx(out, c.out), `${out} vs ${c.out}`);
});

// rls_init
golden.rls_init.forEach((c, i) => {
  const { theta, P } = rlsInit(c.n, c.init_variance);
  check(`rls_init[${i}].theta`, arrEq(theta.m, c.theta));
  check(`rls_init[${i}].P`, arrEq(P.m, c.P));
});

// rmse
golden.rmse.forEach((c, i) => {
  const out = rmse(col(c.a), col(c.b));
  check(`rmse[${i}]`, approx(out, c.out), `${out} vs ${c.out}`);
});

// calc_mem
golden.calc_mem.forEach((c, i) => {
  const out = calcMem(c.num_vars, c.lag_order, c.poly_order, c.use_bias, c.stride, c.num_inputs);
  const ok = out.baseDim === c.out.base_dim && out.numFeatures === c.out.num_features &&
    out.historyDepth === c.out.history_depth && out.thetaSize === c.out.theta_size &&
    out.pSize === c.out.p_size;
  check(`calc_mem[${i}]`, ok, JSON.stringify(out));
});

// rls sequences — the numerically sensitive path
golden.rls_sequence.forEach((c, i) => {
  const { theta, P } = rlsInit(c.n, c.init_variance);
  c.steps.forEach((step, s) => {
    const [x, y] = step;
    const { ok, innovVar } = rls(theta, P, col(x), y, c.lam, c.max_cov_trace, c.directional);
    const exp = c.snapshots[s];
    check(`rls_seq[${i}].step[${s}].ok`, ok === exp.ok);
    check(`rls_seq[${i}].step[${s}].innov`, approx(innovVar, exp.innov_var), `${innovVar} vs ${exp.innov_var}`);
    check(`rls_seq[${i}].step[${s}].theta`, arrEq(theta.m, exp.theta), JSON.stringify(theta.m));
    check(`rls_seq[${i}].step[${s}].P`, arrEq(P.m, exp.P));
  });
});

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${checks - failed}/${checks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
