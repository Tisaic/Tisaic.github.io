// Validates lib/ngrc/commission.js against golden vectors from the Python
// reference (test/ngrc/golden/commission.json): the full model search selects
// the same config + kept features, and the deployed sensor matches.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { commissionSoftSensor } from '../../lib/ngrc/commission.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(HERE, 'golden', 'commission.json'), 'utf8'));

const TOL = 1e-9;
let failed = 0, checks = 0;
const approx = (a, b) => Math.abs(a - b) <= TOL + TOL * Math.abs(b);
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => approx(v, b[i]));
const intEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}

console.log('\nNGRC commission_softsensor — golden-vector parity\n');

const { sig, tgt, Ntot, n } = g.data;
const sigC = sig.map((s) => s.slice(0, n));
const tgtC = tgt.map((y) => y.slice(0, n));
const o = g.opts;
const { sensor, info } = commissionSoftSensor(sigC, tgtC,
  { lags: o.lags, strides: o.strides, nHinge: o.nHinge, nFourier: o.nFourier, seed: o.seed });

const r = g.result;
check('deployed', info.deployed === r.deployed, `${info.deployed} vs ${r.deployed}`);
if (r.deployed) {
  check('config', info.config === r.config, `${info.config} vs ${r.config}`);
  check('lag', info.lag === r.lag);
  check('stride', info.stride === r.stride);
  check('n_full', info.nFull === r.n_full, `${info.nFull} vs ${r.n_full}`);
  check('n_deployed', info.nDeployed === r.n_deployed, `${info.nDeployed} vs ${r.n_deployed}`);
  check('nrmse', approx(info.nrmse, r.nrmse), `${info.nrmse} vs ${r.nrmse}`);
  check('kept', info.kept === null ? r.kept === null : intEq(info.kept, r.kept), JSON.stringify(info.kept));

  // deployed sensor: weights + sensorless estimates on the continuation
  const theta = sensor.theta.map((th) => th.m);
  check('theta.length', theta.length === g.theta.length);
  for (let j = 0; j < g.theta.length; j++) check(`theta[${j}]`, arrEq(theta[j], g.theta[j]));

  const ests = [];
  for (let t = n; t < Ntot; t++) {
    sensor.push([sig[0][t], sig[1][t]]);
    ests.push(sensor.estimate());
  }
  check('ests.length', ests.length === g.ests.length);
  let bad = 0;
  for (let t = 0; t < g.ests.length; t++) if (!arrEq(ests[t], g.ests[t])) bad++;
  check(`ests (${g.ests.length} scans)`, bad === 0, `${bad} mismatched`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${checks - failed}/${checks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
