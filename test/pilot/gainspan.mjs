/**
 * @file IS THE `k` THE MACHINE WANTS EVEN IN THE FAMILY THE SOLVER PRODUCES? (plan §91.1)
 *
 * NOT A TEST — the cheap falsifier that goes before building anything (rule 1).
 *
 * The owner's reframing is *relate the controller to the prediction rather than inverting it*, and
 * the object it describes is already built: §6's explicit gain collapses the whole QP to
 * `u0 = k·f0 + bias`, a LINEAR RELATION between the prediction and the correction, 61,006 MAC to
 * 120. What is wrong is only its PROVENANCE — `_buildGain` obtains `k[i] = solve(e_i, 0) - bias`,
 * the solver probed with unit vectors, which is the inversion reassociated.
 *
 * As `qpIters` moves, that construction traces a ONE-PARAMETER FAMILY of rows, and the machine is
 * already on record preferring a point far down it: two iterations beat sixty on the arm and one
 * beats sixty-eight on EMPS. So the project has been pulling a derived inverse back toward
 * something the machine prefers — with `qpIters`, with `lambda`, and with §79's applied gain —
 * without ever asking whether what it prefers is ON that curve at all.
 *
 * THIS FILE ASKS EXACTLY THAT AND NOTHING ELSE. Commission ONE pilot, read its `k`, and score the
 * MACHINE at points ON the family (the ladder of iteration counts) against points OFF it (random
 * directions, and structured ones). It fits nothing and it proposes nothing.
 *
 *   IMPROVES OFF-FAMILY  the inversion's span does not contain what the machine wants, and
 *                        fitting the relation is a BUILD rather than a re-description.
 *   DOES NOT             the family contains it, only the regulariser choice ever mattered, and
 *                        the reframing is a truer ACCOUNT of the shipped object rather than a
 *                        different object. That is worth knowing and is not a new controller.
 *
 * IT IS CHEAP FOR THE SAME REASON §79's GAIN LADDER WAS: `k` deploys as a stored row, so a
 * perturbed `k` needs NO REFIT — each candidate costs one scored run and the commissioning is paid
 * once.
 *
 * THE CONTROL IS THE PLANT. EMPS is where §56 found the identified path MINIMUM PHASE, with `out`
 * ZERO in every delivering row, so the inverse is well-posed and the family SHOULD already contain
 * the answer. The prediction written down in plan §91.1 is that this plant reads INERT, and a
 * result that improves everywhere by a similar factor is not this mechanism at all — it is the
 * applied gain again in a new costume, which is why the SCALE row below is measured beside the
 * random ones (rule 20, and §79's own uniform-gain control).
 *
 * Run: node test/pilot/gainspan.mjs  [DIRS=12] [MAGS=0.02,0.05,0.1,0.2] [SEED=1] [ITERS=...]
 */
import { Pilot } from '../../lib/pilot/pilot.js';
import { DT, P, PR, makeMachine } from './emps-rig.mjs';

const DIRS = +(process.env.DIRS || 12);
const MAGS = (process.env.MAGS || '0.02,0.05,0.1,0.2,0.4').split(',').map(Number);
const ITERS = (process.env.ITERS || '1,2,4,8,16,32,60').split(',').map(Number);
const SEED = +(process.env.SEED || 1);

/** One deterministic stream, so a row can be reproduced from its seed alone. */
function lcg(s0) { let s = s0 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const rnd = lcg(SEED);
const gauss = () => { const u = Math.max(1e-12, rnd()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };

const UMAX = 2e-3;
const pilot = new Pilot({
  autoRefuse: true, nMeasured: 1,
  channels: [{ lo: -0.02, hi: 0.27, vMax: 1.25e-4, aMax: 8.3e-7, jMax: 5e-8 }],
  uMax: UMAX,
  start: [PR.q[0]],
  guards: [{ index: 0, max: 0.4 }],
  workspace: () => true,
  seed: 1,
  exciteSteps: 40000,
  // THE WHOLE POINT: the QP collapsed to a row, so there is a `k` to perturb at all.
  explicitGain: true,
});
{
  const m = makeMachine(PR.q[0], 0);
  let prevRef = PR.q[0];
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    m.step(prevRef);
    prevRef = cmd[0].pos + cmd[0].u;
    pilot.observe([m.q], [m.q - cmd[0].pos]);
  }
}
if (!pilot._gain || !pilot._gain.length) {
  console.log('\ngainspan: the explicit gain was not built — nothing to perturb, and that is a '
    + 'configuration fault rather than a result (rule 25).\n');
  process.exit(1);
}

/** The scored run, identical in shape to `qpsweep.mjs`'s so the two are comparable. */
function runPilot(prog = PR, active = true) {
  const m = makeMachine(prog.q[0], 0), S = pilot.sample;
  pilot._initRun();
  let s = 0, n = 0, uPk = 0, pref = prog.q[0];
  const LAPS = 10;
  for (let k = 0; k < LAPS * P; k++) {
    m.step(pref);
    const u = active ? pilot.act((off) => [prog.q[(((Math.floor(k / S) + off) * S) % P + P) % P]]) : [0];
    uPk = Math.max(uPk, Math.abs(u[0]));
    pref = prog.q[k % P] + u[0];
    pilot.observe([m.q], null);
    if (k >= (LAPS - 4) * P) { const e = m.q - prog.q[k % P]; s += e * e; n++; }
  }
  return { rms: 1000 * Math.sqrt(s / n), uPk: 1000 * uPk };
}

const K0 = Float64Array.from(pilot._gain[0].k);
const N = K0.length;
const nrm = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0));
const K0N = nrm(K0);
/**
 * WRITTEN TO THE LIVE ROW, AND THE FIRST VERSION CAPTURED A STALE ONE (rule 17).
 *
 * `_buildGain` REPLACES `pilot._gain` with a fresh array, and the on-family sweep below calls it
 * once per iteration count. A `setK` closing over the object read before that loop therefore wrote
 * to a DETACHED row for every perturbation afterwards — and the machine duly scored the built
 * gain every time, so every scale row and every random row came back **bit-identical to the
 * unperturbed one** and the file printed *the family holds*, which is a finding.
 *
 * It was caught by the digits rather than by a check: a 20%-of-norm perturbation reading the same
 * four figures as no perturbation is not a null, it is an instrument measuring nothing. That is
 * why `assertMoves` below exists — this file could not detect its own no-op, which is the one
 * failure mode it is most exposed to.
 */
const setK = (k) => { const g = pilot._gain[0]; for (let i = 0; i < N; i++) g.k[i] = k[i]; };

console.log(`\ngainspan: is the machine's preferred k IN the family the solver produces? (plan §91.1)`);
console.log(`  EMPS, one commissioned pilot, N=${N}, |k| = ${K0N.toExponential(3)}, `
  + `qpIters as built = ${pilot.qpIters}`);
console.log(`  EMPS is the CONTROL plant: §56 found its identified path MINIMUM PHASE with `
  + `out ZERO in every delivering row, so the inverse is well posed here and`);
console.log(`  plan §91.1 predicts this reads INERT. A plant where the inversion is measured `
  + `ill-posed is where it should move.\n`);

const base = runPilot();
console.log(`  the built k                                  ${base.rms.toFixed(4)} mm   `
  + `uPk ${base.uPk.toFixed(3)}`);

/**
 * THE INSTRUMENT'S OWN BOTH-HALVES CONTROL, AND IT RUNS BEFORE ANY ROW IS REPORTED (rule 9).
 *
 * Every number below is a comparison against `base`, so the one way this file can be silently
 * wrong is if a perturbation never reaches the machine — which is exactly what its first version
 * did. A deliberately large, obviously harmful perturbation MUST move the score; if it does not,
 * nothing downstream means anything and the file refuses rather than printing a table (rule 27).
 * Restoring it must then reproduce `base` EXACTLY, or the harness is leaking state between runs
 * and a row could differ for a reason that is not its `k`.
 */
{
  const K = Float64Array.from(pilot._gain[0].k);
  setK(Float64Array.from(K, (v) => v * 2));
  const hit = runPilot();
  setK(K);
  const back = runPilot();
  if (hit.rms === base.rms) {
    console.log(`\n  gainspan: REFUSING TO REPORT. Doubling k moved the score by exactly nothing `
      + `(${hit.rms.toFixed(6)} against ${base.rms.toFixed(6)}), so the perturbation is not `
      + `reaching the machine and every row below would be the built gain wearing a label.`);
    process.exit(1);
  }
  if (back.rms !== base.rms) {
    console.log(`\n  gainspan: REFUSING TO REPORT. Restoring k did not reproduce the baseline `
      + `(${back.rms.toFixed(6)} against ${base.rms.toFixed(6)}), so state leaks between scored `
      + `runs and a row could differ for a reason that is not its k.`);
    process.exit(1);
  }
  console.log(`  control: doubling k moves it to ${hit.rms.toFixed(4)} and restoring reproduces `
    + `${back.rms.toFixed(4)} EXACTLY — the perturbation reaches the machine and nothing leaks`);
}

// ---------------------------------------------------------------- ON the family
console.log(`\n  ON THE FAMILY — the same construction at other iteration counts, which is the`);
console.log('  one-parameter curve _buildGain traces, and the only part anyone has swept:');
let bestOn = base.rms, bestOnAt = `built (${pilot.qpIters})`;
for (const it of ITERS) {
  // Rebuilt through the pilot's own constructor path rather than recomputed here, so what is
  // scored is the row that would actually deploy (rule 61 — a second copy of `_buildGain` is
  // exactly how this file would come to sweep something the machine never runs).
  const was = pilot.qpIters;
  pilot.qpIters = it;
  pilot._gain = null; pilot._buildGain();
  const r = runPilot();
  const kIt = Float64Array.from(pilot._gain[0].k);
  const cos = kIt.reduce((s, v, i) => s + v * K0[i], 0) / Math.max(1e-300, nrm(kIt) * K0N);
  console.log(`    iters ${String(it).padStart(3)}   ${r.rms.toFixed(4)} mm   `
    + `|k| ${nrm(kIt).toExponential(3)}   cos to built ${cos.toFixed(4)}`);
  if (r.rms < bestOn) { bestOn = r.rms; bestOnAt = `iters ${it}`; }
  pilot.qpIters = was;
}
// back to the built row for every off-family row below
pilot._gain = null; pilot._buildGain();
const G = pilot._gain[0];
const KB = Float64Array.from(G.k);

// ---------------------------------------------------------------- the SCALE control
/**
 * §79's APPLIED GAIN, IN THE ONE PLACE IT CAN BE CONFUSED WITH THIS (rule 20). Scaling `k`
 * uniformly is exactly scaling the applied correction, which this project already measured as
 * worth 1.26x on the quadruple tank. If the random rows below improve by about what the scale row
 * improves by, this instrument has rediscovered the gain axis and not the span question.
 */
console.log(`\n  THE SCALE CONTROL — k scaled uniformly, which IS §79's applied gain and stays`);
console.log(`  inside the family's own direction. Random rows that only match this have found it:`);
let bestScale = base.rms, bestScaleAt = '1.00';
for (const a of [0.72, 0.85, 1.15, 1.3]) {
  setK(Float64Array.from(KB, (v) => v * a));
  const r = runPilot();
  console.log(`    x${a.toFixed(2)}        ${r.rms.toFixed(4)} mm`);
  if (r.rms < bestScale) { bestScale = r.rms; bestScaleAt = a.toFixed(2); }
}
setK(KB);

// ---------------------------------------------------------------- OFF the family
/**
 * A RANDOM DIRECTION ORTHOGONALISED AGAINST `k` ITSELF, because a random vector in N dimensions
 * has a component along `k` and adding it back is the scale control again wearing noise. What is
 * asked here is strictly the part of the space the family's own direction does not span.
 */
console.log(`\n  OFF THE FAMILY — ${DIRS} random directions ORTHOGONAL to k, at each magnitude as`);
console.log(`  a fraction of |k|. Orthogonalised because a random row has a component along k and`);
console.log(`  adding that back is the scale control again (rule 20).\n`);
console.log(`    |dk|/|k|     best of ${DIRS}      median       worst     better than the family?`);
let bestOff = Infinity, bestOffAt = null;
for (const mag of MAGS) {
  const got = [];
  for (let d = 0; d < DIRS; d++) {
    const v = new Float64Array(N);
    for (let i = 0; i < N; i++) v[i] = gauss();
    const dot = v.reduce((s, x, i) => s + x * KB[i], 0) / (K0N * K0N);
    for (let i = 0; i < N; i++) v[i] -= dot * KB[i];
    const vn = nrm(v);
    if (!(vn > 0)) continue;
    const sc = (mag * K0N) / vn;
    setK(Float64Array.from(KB, (x, i) => x + sc * v[i]));
    got.push(runPilot().rms);
  }
  setK(KB);
  got.sort((a, b) => a - b);
  const med = got[got.length >> 1];
  if (got[0] < bestOff) { bestOff = got[0]; bestOffAt = mag; }
  console.log(`    ${mag.toFixed(3).padStart(8)}   ${got[0].toFixed(4)}      ${med.toFixed(4)}    `
    + `${got[got.length - 1].toFixed(4)}    ${got[0] < bestOn ? 'YES' : 'no'}`);
}

// ---------------------------------------------------------------- the verdict
console.log(`\n  best ON the family    ${bestOn.toFixed(4)} mm  at ${bestOnAt}`);
console.log(`  best SCALE of it      ${bestScale.toFixed(4)} mm  at x${bestScaleAt}   (§79's axis)`);
console.log(`  best OFF the family   ${bestOff.toFixed(4)} mm  at |dk|/|k| ${bestOffAt}`);
/**
 * THE VERDICT IS PRINTED AND NOTHING IS ASSERTED, because an instrument that decided its own
 * answer before the answer was understood is how the quadruple tank's 1.32x got written down
 * (`tankspread.mjs` says the same of itself). What it reports is the SIGN of a comparison and the
 * margin, and the margin against a best-of-N is the part to distrust: taking the best of
 * DIRS random rows is a selection, and a selection beats a single point by luck alone. The MEDIAN
 * column is there so that can be read rather than argued.
 */
const won = bestOff < bestOn && bestOff < bestScale;
console.log(`\n  ${won ? 'OFF-FAMILY WINS' : 'the family holds'} — `
  + `${won ? `fitting the relation is a BUILD: the inversion's span does not contain what this `
    + `machine wants, by ${((bestOn / bestOff - 1) * 100).toFixed(1)}%`
    : `on this plant the solver's own curve contains what the machine wants, so the reframing is a `
    + `truer ACCOUNT of the shipped object rather than a different object`}`);
console.log(`  READ THE MEDIAN, NOT THE BEST: best-of-${DIRS} is a selection and beats a single`);
console.log(`  point by luck alone. A mechanism moves the median.\n`);
