// Validates lib/ngrc/universal.js against golden vectors from the Python
// reference (test/ngrc/golden/universal.json). This also validates the portable
// LCG / Box-Muller RNG: the JS-generated params must match the reference's.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  universalParams, universalExpand, universalExpandPruned, universalPriorPruned,
} from '../../lib/ngrc/universal.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(HERE, 'golden', 'universal.json'), 'utf8'));

const TOL = 1e-9;
let failed = 0, checks = 0;
const approx = (a, b) => Math.abs(a - b) <= TOL + TOL * Math.abs(b);
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => approx(v, b[i]));
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}

console.log('\nNGRC universal map — golden-vector parity\n');

g.cases.forEach((c, ci) => {
  const po = c.prior_opts || {};
  const opts = { nRecip: c.n_recip, lin: po.lin, quad: po.quad, rand: po.rand, recip: po.recip };
  const p = universalParams(c.base, c.nh, c.nf, c.seed, opts);

  // RNG / param parity (the strict test of the LCG + draw order)
  check(`case[${ci}].Wh`, arrEq(p.Wh, c.params.Wh));
  check(`case[${ci}].bh`, arrEq(p.bh, c.params.bh));
  check(`case[${ci}].Wf`, arrEq(p.Wf, c.params.Wf));
  check(`case[${ci}].phf`, arrEq(p.phf, c.params.phf));
  check(`case[${ci}].fourScale`, approx(p.fourScale, c.params.four_scale));
  check(`case[${ci}].prior`, arrEq(p.prior, c.params.prior));

  const eopts = { nRecip: c.n_recip, recipEps: 0.25 };
  c.zs.forEach((z, zi) => {
    const out = universalExpand(z, c.base, c.nh, c.nf, p.Wh, p.bh, p.Wf, p.phf, p.fourScale, eopts);
    check(`case[${ci}].expand[${zi}]`, arrEq(out, c.expands[zi]), `len ${out.length} vs ${c.expands[zi].length}`);
    const pr = universalExpandPruned(z, c.base, c.nh, c.nf, p.Wh, p.bh, p.Wf, p.phf, p.fourScale, c.kept, eopts);
    check(`case[${ci}].pruned[${zi}]`, arrEq(pr, c.pruned[zi]), JSON.stringify(pr));
  });

  const pp = universalPriorPruned(c.base, c.nh, c.nf, c.kept,
    { lin: po.lin, quad: po.quad, rand: po.rand, recip: po.recip });
  check(`case[${ci}].prior_pruned`, arrEq(pp, c.prior_pruned), JSON.stringify(pp));
});

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${checks - failed}/${checks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
