/**
 * @file DOES OPTIMISING THE DELIVERED SCORE BEAT REGRESSING ONTO THE TEACHER? (plan §54.11)
 *
 * THE QUESTION BEHIND "WHAT ABOUT A GA / NEAT". Evolutionary search brings three things and this
 * project's own record already answers two of them. Topology search is answered by §54.9: a kernel
 * machine and an MLP both LOSE to the shipped linear ridge on identical rows, so the function class
 * is not the binding constraint and searching harder inside it cannot be. Evolvable recurrence is
 * answered by §52.36: a resonator bank driven by the reference reads 0.814 leave-one-program-out
 * against the window's own 0.836, and the reason is mechanical — plant memory ~7,850 steps against
 * a 7,356-step lap, so reaching the memory spans the lap.
 *
 * THE THIRD IS NOT ANSWERED AND IT IS THE ONLY ONE WORTH SPENDING MACHINE TIME ON. A GA needs no
 * differentiable target, so it can optimise **the delivered machine error itself**. Everything this
 * project ships is regressed onto a CONVERGED PREFIX — a surrogate — and §52.34's conflict (2) says
 * that surrogate is compromised: "a more converged teacher teaches a WORSE policy" (cap 0.10 →
 * 0.217, 0.15 → 0.269, 0.20 → 0.363), because convergence moves the target away from any function
 * of the window. No fit in this repository has ever optimised the quantity it is scored on.
 *
 * SO THE VARIABLE IS THE OBJECTIVE AND NOTHING ELSE (rule 20). Same plant, same program, same
 * authority, same feature row, same coefficient count — only the thing being minimised moves:
 *
 *   RIDGE      minimise squared error to the teacher's converged prefix        (what ships)
 *   DIRECT     minimise the DELIVERED rms on the machine, by a GA              (the question)
 *
 * THE PREDICTION IS STATED BEFORE THE RUN, because a result read after the fact is worth less
 * (§52.32's lesson). Optimising delivered error on ONE program is a memory-building objective by
 * construction: nothing in it rewards transfer, and this arc has produced nine consecutive
 * instances of more freedom improving the fitted case and harming the unseen one. So DIRECT is
 * predicted to BEAT ridge on the program it optimises and LOSE on the held-out sine. If it does,
 * the GA route is closed for the same reason every capacity route closed, and the surrogate target
 * is exonerated. If it beats ridge on BOTH, the teacher target is costing us and NEAT's topology
 * search becomes worth its bill.
 *
 * AND THE BILL IS THE OTHER HALF OF THE ANSWER (rule 2, and the reason DeePC was disqualified).
 * Every evaluation is a scored run. This harness COUNTS them and converts to the plant's own clock,
 * because target 4 is already missed on three plants by up to 1643x and a method that needs
 * thousands of scored laps is disqualified before its score is read.
 *
 * ITS RESULT IS NOT REPORTED, BECAUSE THE BASELINE ARM DOES NOT REPRODUCE THE SHIPPED ROUTE.
 * The ridge arm reads **5.49x on the program against the 32.75x `distil-emps.test.mjs` records for
 * this same axis, same block, same window** — 6x below a number already in this repository. A GA
 * compared against a baseline 6x off its own recorded value measures the harness, not the
 * objective, and it duly reads "the GA wins by 5.7x at home and 16.8x on the held-out sine", which
 * is precisely the shape a broken denominator produces.
 *
 * TWO HYPOTHESES WERE TESTED AND BOTH ARE REFUTED BY BYTE-IDENTICAL CONTROLS, which is what says
 * they are not the fault rather than that they were tried:
 *   1. A HAND-ROLLED ridge instead of the shipped block (rules 15, 61). Replaced with `DistilPolicy`
 *      itself, fitted on the same four training trajectories with the sine held out — 8.8900e-2
 *      against the hand-rolled 8.9032e-2. Not it.
 *   2. A DOUBLE CLAMP — this harness clamping at `UM` on top of the policy's own `5·UM`, which
 *      would be rule 34, a model deployed under a 5x tighter authority than it was fitted for.
 *      Removed: byte-identical. Not it either.
 *
 * WHAT IS STILL UNCHECKED, and where the next attempt should start: the `hff` teacher here is
 * commissioned at `uMax: UM*5` where `distil-emps.test.mjs` uses its own `UMAX` for the teacher and
 * `UMAX*5` only for the POLICY, so the two arms may be converging different prefixes; and the
 * `refAt`/`look` conventions between this file's closure and the shipped host's are not asserted
 * equal anywhere. Either would move the baseline and neither has been ruled out.
 *
 * THE FILE IS KEPT because the QUESTION is live and correctly posed — it is the one thing an
 * evolutionary search brings that §54.9 and §52.36 have not already answered — and because a
 * harness that reproduces the baseline is most of the work. It is not kept as a result.
 *
 * Run: SUITE=full node test/pilot/directopt.mjs  [POP=24] [GENS=40] [SEED=1]
 */
import { P, PR, makeMachine } from './emps-rig.mjs';
import { tone, rates, driveRef } from './distil-emps.mjs';
import { HarmonicFF } from '../../lib/pilot/hff.js';
import { DistilPolicy } from '../../lib/pilot/distil.js';

if (process.env.SUITE !== 'full') { console.log('\ndirectopt: SKIPPED (full tier only)\n'); process.exit(0); }

const POP = +(process.env.POP || 24);
const GENS = +(process.env.GENS || 40);
const SEED = +(process.env.SEED || 1);
const UM = 0.02;

// THE SHIPPED BLOCK ITSELF BUILDS THE ROW AND THE BASELINE — not a reimplementation.
// THE FIRST VERSION OF THIS FILE HAND-ROLLED BOTH, AND THAT IS THE WHOLE LESSON HERE. Its ridge
// read 5.49x on the program against the shipped policy's 32.75x on this same axis, so the "ridge"
// arm was 6x below what ships, and a GA that merely climbed back to roughly shipped level read as
// "the GA beats regression by 5x". A comparison against your own weak copy of the baseline is not
// a comparison (rules 15, 61) — and the tell was there to be read: a baseline 6x off a number
// already on record in this repository.
const OFFS = [-512, -256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
const SOFF = [-128, -32, -8, -2, 0, 2, 8, 32, 128];
const mkPol = () => new DistilPolicy({ channels: 1, refDim: 1, offsets: OFFS, signOffsets: SOFF,
  ridge: 1e-8, uMax: UM * 5 });
const NF = mkPol().nFeatures;

/**
 * Drive a program under a POLICY and return delivered rms in mm. Both arms go through the shipped
 * `actLook`, so the deploy path is identical and only the weights differ — which is the one
 * variable this file exists to move.
 */
function score(q, lap, pol) {
  const m = makeMachine(q[0], 0);
  const at = (k) => q[((k % lap) + lap) % lap];
  const look = (k) => (o) => [at(k + o)];
  let s = 0, n = 0;
  for (let k = 0; k < 6 * lap; k++) {
    // THE POLICY'S OWN CLAMP IS THE ONLY CLAMP. A second, tighter one here was the second
    // instrument fault in this file: the block is fitted for `uMax` and was being deployed under a
    // 5x smaller authority, which is rule 34 — commission a model in the configuration it will RUN
    // in — and it held the baseline at 5.49x against the 32.75x already on record for this axis.
    const u = pol ? pol.actLook(look(k))[0] : 0;
    m.step(at(k) + u);
    const e = m.q - at(k);
    if (k >= 5 * lap) { s += e * e; n++; }        // the LAST lap, after the transient (rule 12)
  }
  return 1000 * Math.sqrt(s / n);
}

let EVALS = 0, STEPS = 0;
const scored = (q, lap, w) => { EVALS++; STEPS += 6 * lap; return score(q, lap, w); };

console.log('\ndirectopt: does optimising the DELIVERED score beat regressing onto the teacher?\n');

const sine = tone(4800, 3, 7, 0.9, rates(PR.q).v);
const openP = score(PR.q, P, null), openS = score(sine, 4800, null);
console.log(`    open loop — program ${openP.toExponential(4)} mm   held-out sine ${openS.toExponential(4)} mm`);
console.log(`    ${NF} coefficients, the SHIPPED ladder, authority ${UM}\n`);

// ---------------------------------------------------------------- the teacher, and the ridge
// The same route the shipped policy takes: converge a lap-indexed correction, regress it onto the
// window. `driveRef` is the harness's own iteration, so the teacher here is not a second copy.
console.log('  [1/2] the SHIPPED route: converge a prefix, regress it onto the window');
// THE SAME TEACHER THE SHIPPED ROUTE USES — `HarmonicFF` converging a lap-indexed correction
// through `driveRef`, exactly as `distil-emps.test.mjs` does it. A second teacher would make this
// a comparison of two teachers rather than of two objectives (rule 61).
const hff = new HarmonicFF({ lap: P, channels: 1, uMax: UM });
const conv = await hff.commission(async (c) => driveRef(PR.q, P, c ? (k) => c.at(k)[0] : null));
const pref = Array.from({ length: P }, (_, k) => hff.at(k)[0]);
const tScore = conv && conv.best !== undefined ? conv.best : null;
console.log(`    teacher converged: ${openP.toExponential(4)} -> ${(tScore ?? NaN).toExponential ? tScore.toExponential(4) : tScore} mm`);

const TRAIN = [[4800, 3, 7, 0.60], [5600, 2, 5, 0.90], [4200, 5, 11, 1.20], [P, 0, 0, 0]];
const polR = mkPol();
for (const [lap, c1, c2, vf] of TRAIN) {
  const q = c1 ? tone(lap, c1, c2, vf, rates(PR.q).v) : PR.q;
  const h = new HarmonicFF({ lap, channels: 1, uMax: UM * 5 });
  await h.commission(async (c) => driveRef(q, lap, c ? (k) => c.at(k)[0] : null));
  const prefix = new Array(lap);
  for (let k = 0; k < lap; k++) prefix[k] = [h.at(k)[0]];
  polR.addProgram({ refAt: (k) => [q[((k % lap) + lap) % lap]], n: lap, prefix });
}
const repR = polR.fit();
console.log(`    fit: ${repR.rows} rows, ${repR.features} features, held-out R² `
  + `${repR.heldOutR2.map((v) => v.toFixed(4)).join('/')} — ${repR.deploy ? 'DEPLOYS' : 'REFUSES'}`);
const rP = score(PR.q, P, polR), rS = score(sine, 4800, polR);
console.log(`    ridge   program ${rP.toExponential(4)} ${(openP / rP).toFixed(2)}x   sine ${rS.toExponential(4)} ${(openS / rS).toFixed(2)}x\n`);

// ---------------------------------------------------------------- the GA, on delivered error
// A plain (mu, lambda) evolution strategy with self-adapting step: the point is the OBJECTIVE, not
// the optimiser, and a fancier one would only make the comparison harder to read. SEEDED from the
// ridge solution, because starting from noise would measure how hard the search is rather than
// whether the objective is better — and this project's question is the objective.
console.log(`  [2/2] the DIRECT route: a GA on the DELIVERED rms of the program, seeded from ridge`);
let s0 = (SEED * 2654435761) >>> 0;
const rnd = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// THE GA STARTS FROM THE FITTED POLICY'S OWN WEIGHTS and swaps them in through the same object,
// so the deploy path, the coverage guard and the clamp are all identical between the two arms.
const W0 = Float64Array.from(polR.W[0]);
const polG = mkPol();
Object.assign(polG, { W: polR.W.map((w) => Float64Array.from(w)), report: polR.report, xScale: polR.xScale });
const put = (w) => { polG.W[0] = w; return polG; };
const scale = new Float64Array(NF);
for (let j = 0; j < NF; j++) scale[j] = Math.max(1e-12, Math.abs(W0[j]));
let best = Float64Array.from(W0), bestF = scored(PR.q, P, put(best));
let sigma = 0.15;
const t0 = Date.now();
for (let g = 0; g < GENS; g++) {
  let improved = false;
  for (let i = 0; i < POP; i++) {
    const cand = new Float64Array(NF);
    for (let j = 0; j < NF; j++) cand[j] = best[j] + sigma * scale[j] * gauss();
    const f = scored(PR.q, P, put(cand));
    if (f < bestF) { bestF = f; best = cand; improved = true; }
  }
  // The 1/5th rule, crudely: widen on progress, narrow without it.
  sigma = improved ? Math.min(0.5, sigma * 1.3) : Math.max(1e-3, sigma * 0.8);
  if (g % 8 === 0 || g === GENS - 1) {
    console.log(`      gen ${String(g).padStart(3)}  program ${bestF.toExponential(4)} ${(openP / bestF).toFixed(2)}x   sigma ${sigma.toExponential(1)}   ${EVALS} evals`);
  }
}
const dP = bestF, dS = score(sine, 4800, put(best));
const secs = Math.round((Date.now() - t0) / 1000);

// ---------------------------------------------------------------- what it means
console.log(`\n  the two objectives, same architecture, same ${NF} coefficients:\n`);
console.log('                   program (OPTIMISED)        held-out sine (NEVER SCORED)');
console.log(`    ridge        ${rP.toExponential(4)} ${(openP / rP).toFixed(2).padStart(7)}x        ${rS.toExponential(4)} ${(openS / rS).toFixed(2).padStart(7)}x`);
console.log(`    direct GA    ${dP.toExponential(4)} ${(openP / dP).toFixed(2).padStart(7)}x        ${dS.toExponential(4)} ${(openS / dS).toFixed(2).padStart(7)}x`);

const homeWin = rP / dP, awayWin = rS / dS;
console.log(`\n    the GA is ${homeWin.toFixed(2)}x ${homeWin > 1 ? 'BETTER' : 'worse'} where it optimised`
  + ` and ${awayWin.toFixed(2)}x ${awayWin > 1 ? 'BETTER' : 'worse'} where it did not.`);
// THE VERDICT IS WITHHELD UNTIL THE BASELINE REPRODUCES. `distil-emps.test.mjs` records 32.75x on
// this axis for this block; if this arm is far below that, the denominator is wrong and no
// comparison against it means anything (rule 15).
const RECORDED = 32.75, ridgeX = openP / rP;
if (ridgeX < 0.5 * RECORDED) {
  console.log(`\n    *** NOT ESTABLISHED: the ridge arm reads ${ridgeX.toFixed(2)}x where this axis is`);
  console.log(`        ON RECORD at ${RECORDED}x for the same block and window. The baseline does not`);
  console.log('        reproduce the shipped route, so the comparison above measures this harness');
  console.log('        and not the objective. No conclusion is drawn (see the header).');
} else
console.log(homeWin > 1.02 && awayWin < 0.98
  ? '    => THE PREDICTED SHAPE: the direct objective buys the program it is scored on and gives\n'
    + '       back the one it is not. Optimising delivered error on one program is a MEMORY-BUILDING\n'
    + '       objective, which closes the GA route for the same reason every capacity route closed,\n'
    + '       and EXONERATES the teacher surrogate — it is not what is costing us.'
  : homeWin > 1.02 && awayWin > 1.02
    ? '    => IT BEATS RIDGE ON BOTH. The teacher target IS costing us, and a search that optimises\n'
      + '       delivered error directly — NEAT included — is worth its machine-time bill.'
    : '    => no clear separation: the objective is not the binding constraint either way.');

// THE BILL, which decides whether any of this is affordable regardless of the score (rule 2).
const MIN = STEPS / 1000 / 60;                     // 1 kHz axis, the plant's own clock
console.log(`\n  WHAT IT COST: ${EVALS} scored runs, ${STEPS.toLocaleString()} machine samples`
  + ` = ${MIN.toFixed(1)} minutes of plant time (${secs}s wall).`);
console.log(`    The shipped route pays ONE teacher convergence. At this budget the GA is`
  + ` ${(EVALS / 8).toFixed(0)}x more machine time,`);
console.log('    and target 4 is already missed on three plants — so an evolutionary route must state');
console.log('    this bill up front or it is disqualified before its score is read.\n');
