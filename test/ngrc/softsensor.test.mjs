// Validates lib/ngrc/softsensor.js (+ feature_map.js) against golden vectors
// from the Python reference (test/ngrc/golden/softsensor.json). Exercises both
// the linear map and the universal map, over a full warmup→adapt→estimate run.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SoftSensor } from '../../lib/ngrc/softsensor.js';
import { universalMap } from '../../lib/ngrc/feature_map.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(HERE, 'golden', 'softsensor.json'), 'utf8'));

const TOL = 1e-9;
let failed = 0, checks = 0;
const approx = (a, b) => Math.abs(a - b) <= TOL + TOL * Math.abs(b);
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => approx(v, b[i]));
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}

console.log('\nNGRC SoftSensor — golden-vector parity\n');

const d = g.data;

function runCase(fmap, prior) {
  const s = new SoftSensor(d.ns, d.nt, d.lag, d.stride, d.warmup,
    { fmap, prior, initVariance: 10.0, lam: 1.0 });
  const ests = [];
  for (let t = 0; t < d.N; t++) {
    s.push([d.sig[0][t], d.sig[1][t]]);
    if (!s.frozen) s.warmupStep(s._raw());
    else s.adapt([d.tgt[0][t], d.tgt[1][t]]);
    ests.push((s.ready() && s.frozen) ? s.estimate() : null);
  }
  return { nfeat: s.nf, theta: s.theta.map((th) => th.m), ests };
}

function checkCase(label, got, exp) {
  check(`${label}.nfeat`, got.nfeat === exp.nfeat, `${got.nfeat} vs ${exp.nfeat}`);
  for (let j = 0; j < exp.theta.length; j++) {
    check(`${label}.theta[${j}]`, arrEq(got.theta[j], exp.theta[j]));
  }
  check(`${label}.ests.length`, got.ests.length === exp.ests.length);
  let estFail = 0, estN = 0;
  for (let t = 0; t < exp.ests.length; t++) {
    if (exp.ests[t] === null) { if (got.ests[t] !== null) estFail++; continue; }
    estN++;
    if (!arrEq(got.ests[t], exp.ests[t])) estFail++;
  }
  check(`${label}.ests (${estN} non-null)`, estFail === 0, `${estFail} mismatched`);
}

// linear map (fmap = null)
checkCase('linear', runCase(null, null), g.linear);

// universal map
const uni = universalMap(g.universal.base, g.universal.nh, g.universal.nf, g.universal.seed);
checkCase('universal', runCase(uni, uni.prior()), g.universal);

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${checks - failed}/${checks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
