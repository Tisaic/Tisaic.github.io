// Validates lib/ngrc/robotcomp.js against golden vectors from the Python reference.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RobotComp, CompCommissioner } from '../../lib/ngrc/robotcomp.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(HERE, 'golden', 'robotcomp.json'), 'utf8'));

const TOL = 1e-9;
let failed = 0, checks = 0;
const approx = (a, b) => Math.abs(a - b) <= TOL + TOL * Math.abs(b);
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => approx(v, b[i]));
const mat2Eq = (a, b) => a.length === b.length && a.every((r, i) => arrEq(r, b[i]));
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}

console.log('\nNGRC RobotComp + CompCommissioner — golden-vector parity\n');

const NJ = g.NJ, NW = g.NW, C_TRUE = [1.0e-4, 2.0e-4, 1.5e-4];
const jacAt = (t) => Array.from({ length: NW }, (_, a) => Array.from({ length: NJ }, (_, j) =>
  Math.sin(0.2 * t + 0.7 * a + 0.3 * j) + 0.4 * Math.cos(0.05 * t + a)));
const wrenchAt = (t) => Array.from({ length: NW }, (_, a) => 10.0 * Math.sin(0.13 * t + a));
const delta = (jac, w, c) => {
  const gg = Array.from({ length: NJ }, (_, j) => { let s = 0; for (let a = 0; a < NW; a++) s += jac[a][j] * w[a]; return s; });
  return Array.from({ length: NW }, (_, a) => { let s = 0; for (let j = 0; j < NJ; j++) s += jac[a][j] * c[j] * gg[j]; return s; });
};

// RobotComp
{
  const rc = new RobotComp(NJ, NW, 1.0);
  const thetaHist = [];
  for (let t = 0; t < 60; t++) { const jac = jacAt(t), w = wrenchAt(t); rc.calibrate(jac, w, delta(jac, w, C_TRUE)); thetaHist.push([...rc.theta.m]); }
  check('robotcomp.theta_hist', mat2Eq(thetaHist, g.robotcomp.theta_hist));
  check('robotcomp.compliance', arrEq(rc.compliance, g.robotcomp.compliance), JSON.stringify(rc.compliance));
  check('robotcomp.stiffness', arrEq(rc.stiffness, g.robotcomp.stiffness));
  const lim = { deflectMax: 1e-3, deflectRateMax: 2e-4, tauMax: 8.0, tauRateMax: 1.0 };
  let ffFail = 0;
  for (let i = 0, t = 60; t < 70; t++, i++) {
    const jac = jacAt(t), w = wrenchAt(t);
    const { tauFf, dq } = rc.feedforward(jac, w, { limits: lim, dt: 1.0 });
    if (!(arrEq(tauFf, g.robotcomp.ff[i].tau) && arrEq(dq, g.robotcomp.ff[i].dq))) ffFail++;
  }
  check('robotcomp.feedforward', ffFail === 0, `${ffFail} mismatched`);
}

// CompCommissioner
{
  const com = new CompCommissioner(NJ, { numWrench: NW, warmup: 10, targetSamples: 200, consistencyTol: 5e-4, innovFloor: 4e-4, innovFactor: 6.0 });
  let histFail = 0;
  for (let t = 0; t < 80; t++) {
    const jac = jacAt(t), w = wrenchAt(t);
    const d = delta(jac, w, C_TRUE);
    const d1 = d.map((x, a) => x + 1e-5 * Math.sin(0.9 * t + a));
    const d2 = d.map((x, a) => x - 1e-5 * Math.sin(0.9 * t + a));
    const acc = com.submitPose(jac, w, d1, d2);
    const e = g.commissioner.hist[t];
    if (!(acc === e.acc && com.accepted === e.accepted && com.rejected === e.rejected
      && approx(com.qualityPct, e.quality) && arrEq(com.rc.theta.m, e.theta))) histFail++;
  }
  check('commissioner.hist', histFail === 0, `${histFail} mismatched`);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${checks - failed}/${checks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
