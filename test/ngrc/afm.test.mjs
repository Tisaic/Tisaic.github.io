// Validates lib/ngrc/afm_select.js + lib/ngrc/afm.js against golden vectors
// generated from the Python AFM reference (test/ngrc/golden/afm.json).
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { solveRidge } from '../../lib/ngrc/afm_select.js';
import { LoggedTrainer, LiveTrainer, Runner } from '../../lib/ngrc/afm.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(HERE, 'golden', 'afm.json'), 'utf8'));

const TOL = 1e-9;
let failed = 0, checks = 0;
const approx = (a, b) => Math.abs(a - b) <= TOL + TOL * Math.abs(b);
const arrEq = (a, b) => a.length === b.length && a.every((v, i) => approx(v, b[i]));
const intEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function check(name, cond, detail) {
  checks++;
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? '  → ' + detail : ''}`); }
}

console.log('\nNGRC AFM blocks — golden-vector parity\n');

const { Phi, y, ridge, m } = g.data;
const { seed, cap, batch } = g.config;

// solve_ridge
g.solve_ridge.forEach((c, i) => {
  const theta = solveRidge(c.G.map((r) => r.slice()), c.c.slice(), c.ridge.slice());
  check(`solve_ridge[${i}]`, arrEq(theta, c.theta), JSON.stringify(theta));
});

// LoggedTrainer
{
  const lt = new LoggedTrainer(Phi, y, ridge, seed, cap, batch);
  let steps = 0;
  while (lt.step()) steps++;
  const f = lt.freeze();
  check('logged.steps', steps === g.logged.steps, `${steps} vs ${g.logged.steps}`);
  check('logged.S', intEq(f.S, g.logged.S), `${f.S} vs ${g.logged.S}`);
  check('logged.theta', arrEq(f.theta, g.logged.theta), JSON.stringify(f.theta));
}

// LiveTrainer (deterministic)
{
  const live = new LiveTrainer(m, ridge, seed, cap, batch, g.live.window, g.live.lam, g.live.warmup);
  for (let r = 0; r < y.length; r++) {
    const row = Phi[r];
    live.push((j) => row[j], y[r]);
  }
  const f = live.freeze();
  check('live.S', intEq(f.S, g.live.S), `${f.S} vs ${g.live.S}`);
  check('live.theta', arrEq(f.theta, g.live.theta), JSON.stringify(f.theta));
}

// Runner
{
  const run = new Runner(g.runner.S, g.runner.theta);
  const preds = g.runner.rows.map((r) => run.predict((j) => Phi[r][j]));
  check('runner.preds', arrEq(preds, g.runner.preds), JSON.stringify(preds));
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${checks - failed}/${checks} checks passed\n`);
process.exit(failed === 0 ? 0 : 1);
