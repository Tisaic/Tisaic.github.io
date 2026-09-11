/**
 * @file DeePC — AN UPPER BOUND, NOT A RIVAL. Data-enabled predictive control on the EMPS axis,
 *       built as target 8's second rival and RECLASSIFIED by what it needs (plan §54.8).
 *
 * IT IS NOT AN ADMISSIBLE COMPETITOR AND THE REASON IS STRUCTURAL, NOT A MATTER OF DEGREE.
 * It reads `y_ini` — the measured TRACKING ERROR — at every decision, for ever. The deployed
 * object measures NOTHING at runtime; that is the whole of the tracker claim, and §52.42
 * prices the instrument at 3.9x over the best permanently-mounted alternative. A method that
 * keeps the commissioning instrument bolted on is answering a different question, so its
 * numbers belong beside §48's perfect-forecast ORACLE and not in a rivals table.
 *
 * IT IS KEPT BECAUSE AN UPPER BOUND IS WORTH HAVING, and because what it measures under NOISE
 * is the thing a customer actually decides with: how good an instrument you would have to own,
 * for ever, to beat an instrument-free feedforward.
 *
 * CLAUDE.md's target 8 says the quiet part out loud: "One method is not a field." What exists is
 * norm-optimal ILC, which agreed with `hff` to five figures on this axis INCLUDING on the failure,
 * and an engineered truth-free rival on the arm. Both are lap-indexed or model-based. Neither
 * contests the claim the shipped object actually makes.
 *
 * WHY DeePC IS THE RIGHT SECOND RIVAL, and not MPC or L1. The deployed artefact is a map REGRESSED
 * FROM DATA with no plant model anywhere in it — no transfer function, no identified state space,
 * no physics. DeePC is the literature's canonical form of exactly that claim: by Willems'
 * fundamental lemma, one persistently exciting input/output trajectory of a linear system spans
 * every trajectory it can produce, so a Hankel matrix of raw data REPLACES the model inside a
 * receding-horizon predictive controller. It is model-free in the same sense and predictive in the
 * way the pilot's QP is. Modern MPC would contest the cascade; L1 would contest an adaptive law
 * this project does not ship. DeePC contests the thing that ships.
 *
 * WHAT IS HELD EQUAL, on the NOILC precedent, because a comparison of two identifications is not a
 * comparison of two laws: the same machine from `emps-rig.mjs`, the same program, the same
 * correction channel (an additive term on the position reference), the same authority `UM`, and a
 * data budget that is NOT larger than what the shipped route pays for its own commissioning.
 *
 * AND THE RIVAL GETS THE SWEEP, WHILE OURS RUNS AT ITS DEFAULTS — the asymmetry `noilc-arm.mjs`
 * established as the honest way round. DeePC's free parameters are the two regularisers (`lg` on
 * the data weights, which is what makes it work at all on noisy real data, and `lu` on effort) and
 * the horizon pair. `SWEEP=1` runs them over orders of magnitude and the BEST cell is what gets
 * reported, so if the rival wins anywhere in its own knobs it wins the comparison.
 *
 * THE COLUMN THAT MATTERS IS TRANSFER, and this axis already has three numbers in it. On a two-tone
 * sine the machine has never run: a converged lap table reads 0.53x (worse than doing nothing), a
 * textbook norm-optimal ILC reads 0.53x, and the DISTILLED policy reads 33.15x. DeePC is not
 * lap-indexed — it re-solves from the machine's own recent history every step — so unlike the first
 * two it has no structural reason to fail there. If it transfers, this project has a real rival on
 * the claim it cares about. If it does not, the retirement's case gains a third independent law.
 *
 * Run: SUITE=full node test/pilot/deepc.mjs   [SWEEP=1]  [TINI=20] [NF=40] [TDATA=500]
 */
import { P, PR, makeMachine } from './emps-rig.mjs';
import { tone, rates } from './distil-emps.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndeepc: SKIPPED (full tier only)\n');
  process.exit(0);
}

const TINI = +(process.env.TINI || 20);      // past window the lemma needs to fix the state
const NF = +(process.env.NF || 40);          // prediction horizon
const TDATA = +(process.env.TDATA || 500);   // samples of the one exciting trajectory
const L = TINI + NF;
const NCOL = TDATA - L + 1;
const UM = 0.02;                             // the same authority the other rungs get on this axis
/**
 * MEASUREMENT NOISE ON THE OUTPUT, AND IT IS THE FALSIFIER RATHER THAN A ROBUSTNESS GARNISH.
 * Swept with no noise, this rival's score climbs without bound as its regulariser `lg` goes to
 * zero — 1.97x, then 17.9x, then 142.8x, then 189.7x, each time the grid was widened downward —
 * which is not a controller converging but an unregularised Hankel solve approaching EXACT
 * interpolation of its own data. That is available only because this rig is a DETERMINISTIC
 * simulator, and it is the exact regime regularised DeePC was invented to escape.
 *
 * So the number that decides this comparison is not the noiseless one. `NOISE=<mm>` puts a
 * realistic encoder-grade disturbance on what the controller MEASURES — not on the plant, and not
 * on the score — so the sweep is asked the question a real machine asks. The distilled policy
 * reads its own column unaffected BY CONSTRUCTION, because it measures nothing at deploy.
 */
const NOISE = +(process.env.NOISE || 0);

// ---------------------------------------------------------------- linear algebra
/** Cholesky of a symmetric positive-definite matrix, in place. */
function chol(A, n) {
  for (let j = 0; j < n; j++) {
    let d = A[j * n + j];
    for (let k = 0; k < j; k++) d -= A[j * n + k] ** 2;
    if (d <= 1e-300) return false;
    A[j * n + j] = Math.sqrt(d);
    for (let i = j + 1; i < n; i++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= A[i * n + k] * A[j * n + k];
      A[i * n + j] = s / A[j * n + j];
    }
  }
  return true;
}
/** Solve LL'x = b for a Cholesky factor already in the lower triangle. */
function cholSolve(Lm, n, b, x) {
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= Lm[i * n + k] * x[k];
    x[i] = s / Lm[i * n + i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let k = i + 1; k < n; k++) s -= Lm[k * n + i] * x[k];
    x[i] = s / Lm[i * n + i];
  }
}

// ---------------------------------------------------------------- the data
/**
 * ONE PERSISTENTLY EXCITING TRAJECTORY, which is the whole input DeePC is allowed. The excitation
 * is a bounded pseudo-random correction on top of the machine's own program — the same shape the
 * pilot's own probe uses, and bounded by the SAME authority, so the rival is not handed a larger
 * signal than the method it is being compared with.
 */
function collect(seed = 7) {
  const m = makeMachine(PR.q[0], 0);
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  const u = new Float64Array(TDATA), y = new Float64Array(TDATA);
  // A settle first, so no row of the Hankel describes a startup transient (rules 12, 13).
  for (let k = 0; k < 3 * P; k++) m.step(PR.q[k % P]);
  // One generator for the data and another for the run: reusing one stream would let the
  // controller see, at deploy, the very draws it was fitted on.
  let ns = 20261 >>> 0;
  const nz = () => { ns = (ns * 1103515245 + 12345) >>> 0; return (ns / 4294967296 - 0.5) * 3.464; };
  let hold = 0, cur = 0;
  for (let k = 0; k < TDATA; k++) {
    // Held random steps rather than white noise: an unshaped, HELD probe is what excites a plant
    // whose own loop would otherwise track a white command straight through (rule 33).
    if (hold-- <= 0) { cur = 2 * UM * rnd(); hold = 6 + Math.floor(12 * (rnd() + 0.5)); }
    const ref = PR.q[k % P];
    m.step(ref + cur);
    u[k] = cur;
    y[k] = m.q - PR.q[k % P] + NOISE * nz();   // the tracking error AS MEASURED, noise included
  }
  return { u, y };
}

/** Hankel block: rows `depth`, columns NCOL, taken from `v` starting at `off`. */
function hankel(v, off, depth) {
  const H = new Float64Array(depth * NCOL);
  for (let r = 0; r < depth; r++) for (let c = 0; c < NCOL; c++) H[r * NCOL + c] = v[off + r + c];
  return H;
}

// ---------------------------------------------------------------- the controller
/**
 * REGULARISED DeePC. The Hessian is CONSTANT — it depends only on the data and the weights, never
 * on time — so it is factorised ONCE and every step is a back-substitution against a new
 * right-hand side. That is not an approximation of the method, it is the method reassociated, and
 * it is the only reason a receding-horizon data solve is affordable in this harness at all.
 */
function makeDeePC(data, { lg, lu, lini }) {
  const Up = hankel(data.u, 0, TINI), Yp = hankel(data.y, 0, TINI);
  const Uf = hankel(data.u, TINI, NF), Yf = hankel(data.y, TINI, NF);
  const n = NCOL;
  const H = new Float64Array(n * n);
  const acc = (M, rows, w) => {
    for (let r = 0; r < rows; r++) {
      const base = r * n;
      for (let i = 0; i < n; i++) {
        const vi = M[base + i];
        if (vi === 0) continue;
        for (let j = 0; j <= i; j++) H[i * n + j] += w * vi * M[base + j];
      }
    }
  };
  // TRACKING on the future output, EFFORT on the future input, the past pinned hard, and `lg` on
  // the data weights themselves — the term that turns the lemma's exact statement into something
  // that survives a real machine's noise, and the one this rival is most sensitive to.
  acc(Yf, NF, 1); acc(Uf, NF, lu); acc(Up, TINI, lini); acc(Yp, TINI, lini);
  for (let i = 0; i < n; i++) H[i * n + i] += lg;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) H[i * n + j] = H[j * n + i];
  if (!chol(H, n)) return null;

  const g = new Float64Array(n), b = new Float64Array(n);
  return {
    /** One decision from the last TINI (u,y) pairs and the reference the horizon must hit. */
    act(uIni, yIni, rFut) {
      b.fill(0);
      for (let r = 0; r < TINI; r++) {
        const wu = lini * uIni[r], wy = lini * yIni[r], bu = r * n;
        for (let i = 0; i < n; i++) b[i] += wu * Up[bu + i] + wy * Yp[bu + i];
      }
      // The target for the future error is the NEGATIVE of what the program would leave, i.e. the
      // controller is asked to drive the tracking error to zero over the horizon.
      for (let r = 0; r < NF; r++) {
        const w = rFut[r], bu = r * n;
        if (w === 0) continue;
        for (let i = 0; i < n; i++) b[i] += w * Yf[bu + i];
      }
      cholSolve(H, n, b, g);
      let u0 = 0;
      for (let i = 0; i < n; i++) u0 += Uf[i] * g[i];
      return Math.max(-UM, Math.min(UM, u0));
    },
  };
}

// ---------------------------------------------------------------- scoring
/** Drive a program under a decision closure and report rms tracking error in mm. */
function score(q, lap, decide) {
  const m = makeMachine(q[0], 0);
  let ns = 99173 >>> 0;
  const nz = () => { ns = (ns * 1103515245 + 12345) >>> 0; return (ns / 4294967296 - 0.5) * 3.464; };
  const uIni = new Float64Array(TINI), yIni = new Float64Array(TINI);
  let s = 0, n = 0;
  for (let k = 0; k < 6 * lap; k++) {
    const ref = q[k % lap];
    const u = decide ? decide(uIni, yIni) : 0;
    m.step(ref + u);
    const e = m.q - q[k % lap];
    // THE CONTROLLER SEES THE NOISY ERROR; THE SCORE READS THE TRUE ONE. Scoring the noisy signal
    // would credit the controller for noise it cannot affect and is the instrument checking itself
    // (rule 15).
    for (let i = 0; i < TINI - 1; i++) { uIni[i] = uIni[i + 1]; yIni[i] = yIni[i + 1]; }
    uIni[TINI - 1] = u; yIni[TINI - 1] = e + NOISE * nz();
    if (k >= 5 * lap) { s += e * e; n++; }        // the LAST lap, after any transient (rule 12)
  }
  return 1000 * Math.sqrt(s / n);
}

// ---------------------------------------------------------------- the run
console.log('\ndeepc: DATA-ENABLED PREDICTIVE CONTROL against this project, on the EMPS axis\n');
console.log(`    Tini ${TINI}  N ${NF}  T ${TDATA}  ->  ${NCOL} Hankel columns, one factorisation`);
console.log(`    measurement noise on what the controller reads: ${NOISE === 0 ? 'NONE — a deterministic rig, which is the regime that most flatters an unregularised Hankel solve' : NOISE + ' mm rms'}\n`);

const data = collect();
const rFut = new Float64Array(NF);               // drive the tracking error to zero

const CELLS = process.env.SWEEP === '1'
  // THE GRID HAD TO BE EXTENDED DOWNWARD, because the first sweep's best cell sat on its own
  // EDGE (lg 1e-2, the smallest tried) — and a best cell on the boundary of a grid is not an
  // optimum, it is a statement that the grid was too small. Six more decades below it.
  ? [1e-12, 1e-10, 1e-8, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1, 10, 100, 1e3]
    // `lu` was on its edge too on the second pass (1e-4 best, 1e-2 an order worse), so it is
    // bracketed as well. The rival is swept until its optimum is INTERIOR in both knobs;
    // ours runs at its shipped defaults with no sweep at all, which is the asymmetry
    // `noilc-arm.mjs` established as the honest way round.
    .flatMap((lg) => [1e-12, 1e-10, 1e-8, 1e-6, 1e-4, 1e-2, 1].map((lu) => ({ lg, lu, lini: 1e4 })))
  : [{ lg: 1, lu: 1e-2, lini: 1e4 }];

const open = score(PR.q, P, null);
// THE HELD-OUT SINE, SIZED FROM THE PROGRAM'S OWN MEASURED PEAK VELOCITY. The first run of this
// file passed vProg = 1 and produced a trajectory whose OPEN LOOP was 9.9e4 mm — 99 metres, a
// machine failing to track rather than a program — which is §50's own recorded mistake made again
// on a second harness (rule 41b). `rates(PR.q).v` is what makes the sine a trajectory this axis
// can actually run, and 0.9 places it just inside the program's own rate.
const sine = tone(4800, 3, 7, 0.9, rates(PR.q).v);
const openSine = score(sine, 4800, null);
console.log(`    open loop — program ${open.toExponential(4)} mm   held-out sine ${openSine.toExponential(4)} mm\n`);
console.log('      lg      lu    program      x       held-out sine      x');

let best = null;
for (const c of CELLS) {
  const d = makeDeePC(data, c);
  if (!d) { console.log(`  ${String(c.lg).padStart(8)} ${String(c.lu).padStart(7)}   (Hessian not positive definite)`); continue; }
  const pr = score(PR.q, P, (u, y) => d.act(u, y, rFut));
  const sn = score(sine, 4800, (u, y) => d.act(u, y, rFut));
  console.log(`  ${String(c.lg).padStart(8)} ${String(c.lu).padStart(7)}  ${pr.toExponential(3)} ${(open / pr).toFixed(2).padStart(7)}x   `
    + `${sn.toExponential(3)} ${(openSine / sn).toFixed(2).padStart(7)}x`);
  if (!best || pr < best.pr) best = { c, pr, sn };
}

console.log('\n  THE COMPARISON, on this axis, against numbers already on record:');
console.log(`    open loop                            ${open.toExponential(4)} mm`);
console.log(`    DeePC (best of ${CELLS.length} cell${CELLS.length > 1 ? 's' : ''} of its OWN knobs)  ${best ? best.pr.toExponential(4) : '—'} mm`
  + `  ${best ? (open / best.pr).toFixed(2) + 'x' : ''}`);
console.log('    hff / NOILC (both, five figures)     242.1x        [on record]');
console.log('    the DISTILLED policy                  32.75x        [on record]');
console.log('\n  AND THE COLUMN THAT DECIDES IT — a two-tone sine the axis has NEVER run:');
console.log(`    open loop                            ${openSine.toExponential(4)} mm`);
console.log(`    DeePC                                ${best ? best.sn.toExponential(4) : '—'} mm`
  + `  ${best ? (openSine / best.sn).toFixed(2) + 'x' : ''}`);
console.log('    hff 0.53x   NOILC 0.53x   distilled 33.15x        [on record]');

// ---------------------------------------------------------------- what the number COSTS
// THE TWO THINGS THAT DECIDE WHAT A WIN HERE MEANS, and neither is the delivered error. A rival
// that beats the shipped object while needing an instrument it does not need, at arithmetic that
// does not fit the scan it must fit, has won a different competition — and that has to be MEASURED
// rather than argued, because it is exactly the kind of caveat that gets asserted and then quietly
// dropped when the headline is repeated (rules 16, 30).
const macPerDecision = 2 * NCOL * NCOL + 2 * NCOL * (TINI + NF);   // back-substitution + the RHS build
const BUDGET = 10000;
console.log('\n  WHAT THE NUMBER COSTS, which is the half a delivered error does not say:');
console.log(`    DeePC arithmetic          ${macPerDecision.toLocaleString()} MAC/decision`
  + `  = ${(100 * macPerDecision / BUDGET).toFixed(0)}% of a 1 ms PLC scan's 10% budget`
  + `  ${macPerDecision <= BUDGET ? 'FITS' : 'DOES NOT FIT'}`);
console.log('    the distilled policy           78 MAC/decision  = 0.8% of that budget   FITS   [on record]');
console.log(`    ratio                     ${(macPerDecision / 78).toFixed(0)}x more arithmetic`);
console.log('\n    AND THE INSTRUMENT: DeePC needs `y_ini` — the measured TRACKING ERROR — at every');
console.log('    decision, for ever. That is the tracker the deployed object explicitly does NOT');
console.log('    need at deploy, and which §52.42 prices at 3.9x over the best mounted alternative.');
console.log('    It is not a tuning difference; it is a different product with a different bill.');
console.log('\n  (nothing here is asserted — this is a rival, and what it measures is the result)\n');
