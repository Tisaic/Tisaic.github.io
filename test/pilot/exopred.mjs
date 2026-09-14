/**
 * @file NOT A TEST — CAN A CAUSAL WINDOW PREDICT A MEASURED DISTURBANCE? (plan §80.1)
 *
 * The cheapest thing that can falsify "declare what you measure" (rule 1), run BEFORE any of it
 * was wired. The cold mill wins because its roll phase is CLOSED FORM in k, so the straddling
 * window previews it legitimately; a wall thermocouple has no future, so the only admissible read
 * of a measured disturbance is CAUSAL. That is worth building only if a causal window can predict
 * the disturbance at the lead the correction acts at.
 *
 * It reads the BARREL RIG's own `ambientAt`/`ambientRead` rather than a second copy of the
 * formula, because a disturbance defined twice is two disturbances (rule 61) — and because the
 * whole point is to ask about the signal the plant actually experiences.
 *
 * THE NOISE COLUMN IS THE POINT, NOT A CAVEAT (rule 15). This rig's ambient is two exact sines,
 * so a linear map predicts it at R2 > 0.9995 and that number measures the SIMULATOR. The row that
 * means anything is the rig's own stated 0.35 K thermocouple noise, and it is the only one quoted
 * anywhere. What it does NOT establish: a real room's temperature is not two sines, and how
 * predictable a real one is is not measured here or anywhere in this project.
 *
 * Run: node test/pilot/exopred.mjs
 */
import { NOISE, PROG, TA0, ambientAt, ambientRead, makeBarrel, powerFor, powerForAt, setpointAt, tempsAt }
  from './rigs/thermal-rig.mjs';

/** Ridge on the normal equations, Cholesky — the smallest solver that answers the question. */
function fit(X, y, lam) {
  const n = X[0].length, A = Array.from({ length: n }, () => new Float64Array(n)), b = new Float64Array(n);
  for (const [i, row] of X.entries()) {
    for (let a = 0; a < n; a++) { b[a] += row[a] * y[i]; for (let c = 0; c <= a; c++) A[a][c] += row[a] * row[c]; }
  }
  let tr = 0; for (let a = 0; a < n; a++) tr += A[a][a];
  for (let a = 0; a < n; a++) { A[a][a] += lam * tr / n; for (let c = a + 1; c < n; c++) A[a][c] = A[c][a]; }
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let a = 0; a < n; a++) for (let c = 0; c <= a; c++) {
    let s = A[a][c]; for (let j = 0; j < c; j++) s -= L[a][j] * L[c][j];
    L[a][c] = a === c ? Math.sqrt(Math.max(1e-300, s)) : s / L[c][c];
  }
  const z = new Float64Array(n), w = new Float64Array(n);
  for (let a = 0; a < n; a++) { let s = b[a]; for (let j = 0; j < a; j++) s -= L[a][j] * z[j]; z[a] = s / L[a][a]; }
  for (let a = n - 1; a >= 0; a--) { let s = z[a]; for (let j = a + 1; j < n; j++) s -= L[j][a] * w[j]; w[a] = s / L[a][a]; }
  return w;
}

// The causal half of the barrel's own shipped window, at the ladder's geometric spacing.
const OFFS = [0, -40, -80, -160, -320, -640, -1250, -2500];
const LEADS = [0, 60, 250, 500, 1000, 2500];
// 0 is the simulator's own answer and is printed to be dismissed; NOISE is the rig's stated value.
const SIGMA = [0, 0.05, NOISE];
const FIT0 = 3000, FITN = 20000, LAM = 1e-6;

const ambRms = (() => { let s = 0; for (let k = 0; k < 40000; k++) s += (ambientAt(k) - TA0) ** 2; return Math.sqrt(s / 40000); })();
console.log('\nCAN A CAUSAL WINDOW PREDICT A MEASURED DISTURBANCE AT THE LEAD THE MAP ACTS AT?');
console.log(`  the barrel's own ambient, rms about its mean ${ambRms.toFixed(4)} K; the rig reads it at ${NOISE} K noise`);
console.log(`  ${OFFS.length} causal taps reaching -${-OFFS[OFFS.length - 1]}; fitted on ${FITN.toLocaleString()} steps, scored on the NEXT ${FITN.toLocaleString()} it never saw\n`);
console.log('    sigma(K)   ' + LEADS.map((L) => `lead +${L}`.padStart(11)).join(''));

for (const sg of SIGMA) {
  // `ambientRead` carries the rig's OWN noise sequence; scaling it keeps one generator and one
  // definition, so the sigma column is the same instrument turned up and down rather than a
  // second noise source that could differ in shape.
  const meas = (k) => ambientAt(k) + (sg / NOISE) * (ambientRead(k) - ambientAt(k));
  const cells = LEADS.map((L) => {
    const X = [], y = [], Xv = [], yv = [];
    for (let k = FIT0; k < FIT0 + FITN; k++) { X.push(OFFS.map((o) => meas(k + o) - TA0)); y.push(ambientAt(k + L) - TA0); }
    for (let k = FIT0 + FITN; k < FIT0 + 2 * FITN; k++) { Xv.push(OFFS.map((o) => meas(k + o) - TA0)); yv.push(ambientAt(k + L) - TA0); }
    const w = fit(X, y, LAM);
    let se = 0, st = 0, mu = 0;
    for (const v of yv) mu += v; mu /= yv.length;
    for (const [i, row] of Xv.entries()) {
      let p = 0; for (let a = 0; a < row.length; a++) p += row[a] * w[a];
      se += (p - yv[i]) ** 2; st += (yv[i] - mu) ** 2;
    }
    return 1 - se / st;
  });
  console.log(`    ${sg.toFixed(2).padStart(8)}   ` + cells.map((r) => (r > 0.9995 ? '>0.9995' : r.toFixed(4)).padStart(11)).join('')
    + (sg === 0 ? '   <- the SIMULATOR, not a barrel' : sg === NOISE ? '   <- the rig\'s OWN instrument' : ''));
}
console.log('\n  R2 of the TRUE future ambient against a causal read of its own noisy past.');
console.log('  It did not fire: a causal read predicts well at the leads that matter, so §80 went on');
console.log('  to build the declared channel — which then LOST, for a reason that is not this one.\n');

// ---------------------------------------------------------------------------------------------
// WHAT DOES THE ENGINEER'S OWN MODEL GET FROM THE SAME DECLARATION? (plan §80.6)
//
// §80.2 declared the ambient to the learned MAP and lost. Before building a second learned layer
// for it, price the INCUMBENT with the same information (rule 20) — because on this plant the
// disturbance is exactly setpoint-equivalent: ambient enters as -HL*(T-Ta), so a 1 K ambient drop
// needs precisely the power a 1 K setpoint rise needs. That correction is available to the
// engineer's closed-form feedforward with NOTHING LEARNED: compute `powerFor` at the MEASURED
// ambient instead of the nominal one.
//
// If that recovers the drift's cost, the honest product sentence is "your existing feedforward
// should do this" and a learned disturbance layer is answering a question the cabinet already
// answers. Three rows, one plant, no controller and no commissioning in any of them.
{
  const N = PROG;
  const run = (mode) => {
    const p = makeBarrel(7);
    const st = powerFor(setpointAt(0));
    for (let i = 0; i < 20000; i++) p.step(st);
    let s2 = 0, n = 0;
    for (let k = 0; k < N; k++) {
      const want = setpointAt(Math.min(k, N));
      // NOMINAL is what ships: the feedforward is computed at TA0 and the wall is assumed still.
      // MEASURED is the classical fix. TRUE is the same thing with a perfect thermometer — the
      // bound, printed so the instrument's share is separable from the idea's (rule 15).
      const Ta = mode === 'nominal' ? TA0 : mode === 'true' ? ambientAt(20000 + k) : ambientRead(20000 + k);
      p.step(powerForAt(want, Ta));
      const y = p.read(), tgt = tempsAt(powerFor(want));
      if (k > 5000) for (let c = 0; c < y.length; c++) { s2 += (y[c] - tgt[c]) ** 2; n++; }
    }
    return Math.sqrt(s2 / n);
  };
  const base = run('nominal'), meas = run('measured'), tru = run('true');
  console.log('  AND WHAT THE INCUMBENT GETS FROM THE SAME DECLARATION (plan §80.6) — no learning at all:');
  console.log(`    feedforward at the NOMINAL ambient (what ships)   ${base.toExponential(4)} K rms`);
  console.log(`    ...at the MEASURED ambient, 0.35 K thermocouple    ${meas.toExponential(4)} K rms   ${(base / meas).toFixed(3)}x`);
  console.log(`    ...at the TRUE ambient, a perfect thermometer      ${tru.toExponential(4)} K rms   ${(base / tru).toFixed(3)}x   <- the bound`);
  console.log('    scored past the 5,000-step startup (rule 13); the plant, program and warmup are the rig\'s own.\n');
}
