// Validates lib/ngrc/servoff.js against golden vectors from the Python reference:
// identical inputs (ref/meas/tau arrays) → identical FF outputs, weights, and
// commissioning decision (pruned term set + preview delay).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ServoFF, commissionGmsThresholds } from '../../lib/ngrc/servoff.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(HERE, 'golden', 'servoff.json'), 'utf8'));

const TOL = 1e-9;
let failed = 0, checks = 0;
const approx = (a, b) => Math.abs(a - b) <= TOL + TOL * Math.abs(b);
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => approx(v, b[i]));
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}

console.log('\nNGRC ServoFF — golden-vector parity\n');

const { ref, meas, tau, params } = g;
const N = params.N;
const clampi = (i) => (i < 0 ? 0 : (i > N - 1 ? N - 1 : i));

const est = new ServoFF(params.dt, {
  lagDeltas: [1, 3], maxPreview: 5, npole: 8.0, gearh: [2, 3], lam: 1.0,
  directional: true, warmup: params.warmup, gmsThresholds: params.gms,
  limits: { velMax: 8.0, accMax: 300.0, decMax: 300.0, jerkMax: 5.0e5, tauMax: 50.0, tauRateMax: 2000.0 },
});

const ffs = [];
for (let t = 0; t < N; t++) ffs.push(est.step(meas[t], tau[t], (off) => ref[clampi(t + off)]));
const res = est.commission();

check('ff outputs', arrEq(ffs, g.ffs), `first mismatch shows drift`);
check('theta', arrEq(est.theta.m, g.theta));
check('tau_scale', approx(est.tauScale, g.tau_scale));
check('fault/outlier counts', est.faultCount === g.fault_count && est.outlierCount === g.outlier_count);

const c = g.commission;
check('commission.active', res.active.length === c.active.length && res.active.every((v, i) => v === c.active[i]), JSON.stringify(res.active));
check('commission.n_active', res.nActive === c.n_active, `${res.nActive} vs ${c.n_active}`);
check('commission.n_total', res.nTotal === c.n_total);
check('commission.preview', res.preview === c.preview && res.previewConfident === c.preview_confident, `${res.preview}/${res.previewConfident}`);
// The top-8 contrib is a diagnostic; its tail (gms/stribeck) is a near-degenerate
// cluster (~0.1352) whose slot-7/8 order is libm-dependent (~1 ULP in tanh/exp),
// below the 1e-9 weight tolerance. Validate the well-separated top-6 term
// identities and the sorted magnitudes (order-independent).
const pyKeys = Object.keys(c.contrib), jsKeys = Object.keys(res.contrib);
const top6 = pyKeys.slice(0, 6).every((k, i) => k === jsKeys[i]);
const pyVals = Object.values(c.contrib).sort((a, b) => b - a);
const jsVals = Object.values(res.contrib).sort((a, b) => b - a);
check('commission.contrib (top-6 keys + sorted magnitudes)',
  pyKeys.length === jsKeys.length && top6 && arrEq(jsVals, pyVals), JSON.stringify(jsKeys));

// commissionGmsThresholds pure-function parity
let gmsFail = 0;
for (const gc of g.gms_cases) if (!arrEq(commissionGmsThresholds(gc.d, gc.n, gc.dec), gc.out)) gmsFail++;
check('commissionGmsThresholds', gmsFail === 0);

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${checks - failed}/${checks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
