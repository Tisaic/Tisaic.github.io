// Validates lib/ngrc/axiscomp.js against the TC_NGRC_AxisComp.st spec (golden
// vectors from a faithful transcription on the golden rls primitive).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { AxisComp } from '../../lib/ngrc/axiscomp.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(HERE, 'golden', 'axiscomp.json'), 'utf8'));

const TOL = 1e-9;
let failed = 0, checks = 0;
const approx = (a, b) => Math.abs(a - b) <= TOL + TOL * Math.abs(b);
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => approx(v, b[i]));
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}

console.log('\nNGRC AxisComp — spec parity (TC_NGRC_AxisComp.st)\n');

const p = g.par;
const W = 2.0 * Math.PI / p.lead;
const B = g.true.B;
const trueErr = (pos, dT, d) => (2e-4 * pos + 3e-3 * Math.cos(W * pos) + 1e-3 * Math.sin(W * pos)
  + 5e-5 * dT * pos + 1e-3 * dT + (B / 2.0) * d);

const ax = new AxisComp(p);
const backlashHist = [];
for (const temp of [0.0, 25.0]) {
  for (const d of [1.0, -1.0]) {
    for (const pos of g.positions) {
      backlashHist.push(ax.calibrate(pos, d, trueErr(pos, temp, d), temp));
    }
  }
}
check('theta', arrEq(ax.theta.m, g.theta));
check('backlash history', arrEq(backlashHist, g.backlash_hist));
check('backlash final', approx(ax.backlashLearned, g.backlash_final), `${ax.backlashLearned} vs ${g.backlash_final}`);

const rc = g.run_cfg;
const runs = [];
for (let k = 0; k < 40; k++) {
  const pos = 5.0 + 7.0 * k;
  const d = (k % 8) < 4 ? 1.0 : -1.0;
  runs.push(ax.run(pos, d, 15.0, { maxCorrection: rc.maxCorrection, corrRateMax: rc.corrRateMax, dt: rc.dt }));
}
check('run corrections (limits + slew)', arrEq(runs, g.runs));

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${checks - failed}/${checks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
