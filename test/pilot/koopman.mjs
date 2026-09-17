/**
 * @file KOOPMAN-EDMD — TARGET 8'S LAST NAMED RIVAL, AND THE ADMISSIBILITY VERDICT COMES FIRST
 *       BECAUSE IT DECIDES WHICH OBJECT IS EVEN BEING MEASURED (plan §113).
 *
 * CLAUDE.md's target 8 has carried the same sentence for several sections: "Still absent entirely:
 * modern MPC, L1 adaptive, DeePC, Koopman-EDMD. One method is not a field." DeePC was then built
 * and RECLASSIFIED (§54.8b) — it reads the measured tracking error at every decision for ever, so
 * it is an upper bound and not a rival. ZPETC was built, debugged and measured (§56). Koopman-EDMD
 * is the last name on that list that has never been touched.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * THE ADMISSIBILITY VERDICT, STATED BEFORE ANY NUMBER, BECAUSE THERE ARE TWO KOOPMANS AND ONLY ONE
 * OF THEM IS A RIVAL.
 *
 * §54.8b states the test once so it can be applied rather than re-argued. A competitor must deploy
 * with (a) NO RUNTIME TRUTH, (b) no lap index or per-program table, (c) transfer to programs the
 * commissioning never saw, (d) inside the scan budget (10,000 MAC per 1 ms, met EVERY cycle).
 *
 *   KOOPMAN ①, THE LITERATURE'S CONTROLLER — Koopman MPC (Korda & Mezić 2018, and the whole
 *   "Koopman operator control" line since). Lift the MEASURED STATE through a dictionary, advance
 *   it with an identified linear operator, solve a linear MPC in the lifted space. **INADMISSIBLE,
 *   on DeePC's own ground and for the same reason**: the lift is evaluated at ψ(x_k) with x_k the
 *   measured state, so the commissioning instrument stays bolted on for ever. §52.42 prices that
 *   instrument at 3.9x over the best permanently-mounted alternative, and §54.8b's table already
 *   rules out DeePC, MPC, L1 and MRAC on exactly this. Its numbers would belong beside §48's
 *   perfect-forecast ORACLE, not in a rivals table. It is NOT built here, and what it would have
 *   cost to run anyway is priced at the bottom of this file rather than waved at.
 *
 *   KOOPMAN ②, THE ADMISSIBLE ONE — the lift used only at COMMISSIONING, to identify a model that
 *   is then INVERTED into a feedforward deployed as a fixed map of the COMMANDED REFERENCE. No
 *   measurement is read at deploy, ever; the deployed object is a weight vector, a dictionary and
 *   a short reference window — the shape §53's deploy boundary is drawn around. **This is the one
 *   built and measured below.** Both are buildable; this file says which it built and prices the
 *   other's instrument rather than quietly picking the flattering one.
 *
 * KOOPMAN ② IS THE NONLINEAR GENERALISATION OF §56's ZPETC, WHICH IS WHY IT IS WORTH RUNNING AT
 * ALL. ZPETC identifies a LINEAR ARX model and inverts it exactly; §56 measured 2.45x / 3.28x,
 * found the identified path MINIMUM PHASE so stable inversion degenerated to exact inversion, and
 * its sharpest line is *every model in the sweep fits at R² 1.000 and they deliver 0.03x to 2.45x*.
 * EDMD changes exactly one thing: the model is linear in a NONLINEAR DICTIONARY of the state, which
 * is the entire Koopman claim. This axis has a Coulomb friction curve that jumps from −18.7 to
 * +17.3 N across v = 0 (`emps-rig.mjs`'s own binned table), a ±10 V drive saturation and a 0.05 µm
 * encoder — none of which an ARX can express. If the lift is worth anything anywhere it is worth it
 * here.
 *
 * AND THE HARNESS IS BUILT SO THE LIFT IS THE ONLY VARIABLE. `LIFTS=none` is the same data, the
 * same solver, the same inversion and the same scoring with the dictionary EMPTY: the matched
 * linear control (rule 20) sitting inside this file rather than across a comparison with another
 * one. Whatever the dictionary is worth is the difference between two rows of one table.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IS IDENTIFIED, AND THE FIRST VERSION OF THIS FILE GOT IT WRONG IN THE WAY RULE 19 NAMES.
 *
 * The obvious EDMDc is to model the OUTPUT: y_k from lagged y and lagged command. Built that way
 * it fits at one-step R² **0.9998** and delivers **0.03x-0.09x — thirty times worse than doing
 * nothing**, capped for half of every lap. Both numbers are right. `y` on this axis has a spread of
 * order 30 mm and the quantity a rung exists to cancel is 0.49 mm, so 1 − R² = 1.8e-4 of y's
 * variance IS the whole tracking error: a model can be a superb predictor of the trajectory and
 * carry no information at all about the thing being corrected. That is rule 19 exactly — match the
 * metric's support to the claim's — and it is why ZPETC identifies ERROR paths (`Gu`, `Gr`) rather
 * than the output. The row is kept in the plan because an R² of 0.9998 attached to a 0.03x is the
 * most persuasive wrong number this file could have produced.
 *
 * So the target is the TRACKING ERROR, and one regression carries both of ZPETC's paths at once:
 *
 *     e_k = Σ a_i e_{k-i}  +  Σ b_j u_{k-d-j}  +  Σ (g_l Δr_{k-l} + h_l Δ²r_{k-l})  +  Σ w_m φ_m(Δr)  +  w_0
 *
 * The reference enters as DIFFERENCES rather than absolute positions, which is physically right on
 * a plant whose error has no dependence on where it is (and `classic.js` confirms: its dominant
 * coefficient matches the loop's own vPeak/kp to 2.4%) and is also what makes the design matrix
 * conditionable — lags of a smooth trajectory are collinear to ten decades. Columns are centred and
 * scaled to unit spread before the ridge, because a ridge against columns spanning six orders of
 * magnitude regularises one of them and not the others (rule 32; `headroom.mjs` published an R² of
 * −13273 from that exact fault).
 *
 * WITH THE DICTIONARY EMPTY THIS IS `classic.js`'s BASIS WITH LAGS, plus the correction path — i.e.
 * the control arm is an incumbent this project already ships, not a straw man.
 *
 * WHAT DEPLOYS. Set the desired error to zero and solve the one remaining unknown:
 *     u_{k-d} = − ( Σ a_i ê_{k-i} + Σ_{j≥1} b_j u_{k-d-j} + Σ (g_l Δr + h_l Δ²r) + Σ w_m φ_m + w_0 ) / b_0
 * where `ê` is the model's OWN predicted error under the commands actually applied — an internal
 * model, not a measurement, so the object still reads nothing but the reference. It needs the
 * reference `d` steps ahead, which is PREVIEW, the same structural requirement §49.14 measured for
 * our own window (0.89x causal against 1.43x straddling). The correction is clamped at the SAME
 * authority every other rung on this axis gets, and the CLAMPED command is what enters the
 * recursion's history — honest, because it is what the machine received, and it is the anti-windup
 * that bounds the inverse recursion when the B polynomial is marginal.
 *
 * HELD EQUAL, on the NOILC/ZPETC precedent: the same machine from `emps-rig.mjs`, the same
 * programs, the same authority `UM = 0.02`, the same excitation shape (a bounded HELD pseudo-random
 * correction, rule 33), and an identification budget of 8,000 samples — the SAME total `zpetc.mjs`
 * pays for its two paths. THE RIVAL GETS THE SWEEP AND OURS RUNS AT ITS DEFAULTS, which is the
 * asymmetry `noilc-arm.mjs` established as the honest way round: the dictionary, the model orders,
 * the delay, the reference reach and the ridge all move, and nothing of ours is touched.
 *
 * FOUR CONTROLS, EVERY ONE OF WHICH HAS ALREADY CAUGHT A RIVAL OR A RESULT HERE:
 *   1. GRID RUNAWAY (§54.8, what disqualified DeePC — each earlier best sat on its own EDGE and
 *      the margin grew every time the grid widened). Every knob's grid is widened until the best
 *      cell is INTERIOR, and the file PRINTS the verdict per knob and refuses to call an edge an
 *      optimum (rule 14).
 *   2. THE NOISE FALSIFIER (§56, §54.8). `NOISE=0.0016` puts the rig's OWN stated 1.6 µm
 *      identification fidelity on what the COMMISSIONING reads. Deployment reads nothing, so the
 *      deployed arithmetic is unaffected BY CONSTRUCTION — which is the whole instrument claim, and
 *      is asserted here rather than said. DeePC collapsed to 1.00x there and ZPETC to 0.06-0.27x.
 *   3. MAC/DECISION AND BYTES against the policy's 78 MAC / 0.2 kB and the 10,000-MAC budget, with
 *      the transcendental count priced SEPARATELY and both ways, because an `exp` is not one MAC on
 *      a PLC and folding it either way would be the instrument flattering the model.
 *   4. TWO SCORING CONVENTIONS. `zpetc.mjs` and `deepc.mjs` both quote "32.75x / 33.15x [on record]"
 *      beside columns produced by their own `score()` on their own `tone(4800,3,7,0.9)` — which is
 *      not the loop or the trajectory those two numbers were measured on. This file prints BOTH:
 *      the rivals' convention (comparable to ZPETC and DeePC by construction) and the distilled
 *      policy's own `driveRef`/`transfer` on `twoTone` (comparable to what it is set against).
 *
 * AND A ZERO CONTROL WITH NO PLANT ARGUMENT IN IT: a correction of exactly zero must reproduce the
 * open loop BIT-EXACTLY. `distil-tank.mjs` reported *1.000x, nothing harmed, TRANSFER* for two
 * sections with the rung absent from the run that scored it; this is the cheap assertion that the
 * correction path is wired at all (rule 25).
 *
 * Run: SUITE=full node test/pilot/koopman.mjs
 *      [LIFTS=none,sgn,tanh,rbf,…] [NAS=…] [NBS=…] [DELAYS=…] [RLAGS=…] [RIDGES=…] [NRBF=12]
 *      [DLAGS=1] [NOISE=<mm>] [SEED=0] [TDATA=4000] [QUIET=1]
 */
import { P, PR, makeMachine } from './emps-rig.mjs';
import { tone, rates, driveRef, transfer, TQ, N2 } from './distil-emps.mjs';

if (process.env.SUITE !== 'full' && !process.env.KOOP_LIB) {
  console.log('\nkoopman: SKIPPED (full tier only)\n');
  process.exit(0);
}

const UM = 0.02;                              // the authority every rung on this axis gets
const TDATA = +(process.env.TDATA || 4000);   // per excitation; two of them = zpetc's own 8,000
const NOISE = +(process.env.NOISE || 0);      // on what the COMMISSIONING reads, never on the score
const SEED = +(process.env.SEED || 0);
const NRBF = +(process.env.NRBF || 12);
const DLAGS = +(process.env.DLAGS || 1);      // how many reference lags the dictionary is built at
/**
 * THE PROBE AMPLITUDE, AND IT IS A SWEPT KNOB BECAUSE RULE 41b SAYS IT MUST BE. `zpetc.mjs` and
 * `deepc.mjs` both excite at `2*UM` = ±0.02 m, which is the AUTHORITY rather than anything the
 * machine's own numbers imply — and the correction this axis actually needs is **7.3e-4 m**
 * (measured: the open-loop error trace applied as a hand feedforward, which reaches 65x at a peak
 * |u| of 7.27e-4). So the default excitation drives the machine 27x further off its program than
 * any deployed correction ever will, straight through the friction reversal and the drive's clip,
 * and identifies a regime the controller does not operate in. An excitation built to the DECLARED
 * limits describes a machine the program does not run (rule 41b, this project's seventh time).
 */
const PROBE = +(process.env.PROBE || 1e-3);
// THE SCREEN. Ranking the whole grid at the full six-lap score is hundreds of millions of machine
// steps; a pure feedforward with a short internal state reaches its steady behaviour within one
// lap, so the sweep RANKS on two laps and every REPORTED number is re-measured at the full six.
// The agreement between the two on the best cell is printed, because a screen that disagrees with
// the thing it screens for is an instrument fault (rule 15).
const SLAPS = +(process.env.SLAPS || 2);
const BUDGET = 10000;

// ───────────────────────────────────────────────────────────── the excitation
/**
 * ONE EXCITATION SHAPE, TWO REFERENCES, AND THE SECOND IS NOT OPTIONAL. The machine's own program
 * is a single periodic trajectory, and a reference-path model identified on it alone would be a
 * model of that program (rule 36) — `zpetc.mjs` hit this and identified its `Gr` on a rich
 * multi-tone. The same applies here and harder, because a dictionary has more capacity to memorise
 * with. So half the budget is the program and half a two-tone, each carrying the SAME bounded HELD
 * pseudo-random correction the pilot's own probe uses (rule 33 — a white command is tracked
 * straight through and excites nothing).
 */
function collect(seed = SEED, amp = PROBE, shift = 0) {
  let s = (12345 + 7919 * seed) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  let ns = (777 + 104729 * seed) >>> 0;
  const nz = () => { ns = (ns * 1103515245 + 12345) >>> 0; return (ns / 4294967296 - 0.5) * 3.464; };

  const mix = tone(1600, 2, 5, 0.8, rates(PR.q).v);
  const segs = [{ q: PR.q, lap: P }, { q: mix, lap: 1600 }];
  const R = [], U = [], E = [], SEG = [];
  let si = 0;
  for (const sg of segs) {
    const m = makeMachine(sg.q[0], 0);
    for (let k = 0; k < 3 * P; k++) m.step(sg.q[k % sg.lap]);   // settle first (rules 12, 13)
    let hold = 0, cur = 0;
    for (let k = 0; k < TDATA; k++) {
      if (hold-- <= 0) { cur = 2 * amp * rnd(); hold = 6 + Math.floor(12 * (rnd() + 0.5)); }
      // `shift` COMMISSIONS IN THE OTHER SCORING CONVENTION'S OWN LOOP (rule 34). `driveRef` — the
      // loop the distilled policy's 32.75x / 33.15x were measured in — commands `q[k-1]` and scores
      // against `q[k]`, which is not the same plant-plus-loop as `score()`: its open loop reads
      // 5.7640e-1 against 4.8849e-1, 18% worse, entirely from that one sample of commanded lag. An
      // object identified in one and deployed in the other is being asked to transfer across a loop
      // change, which is a different question from the one this column exists to answer.
      const r = sg.q[k % sg.lap];
      m.step(sg.q[((k - shift) % sg.lap + sg.lap) % sg.lap] + cur);
      R.push(r); U.push(cur);
      E.push(m.q - r + NOISE * nz());   // the tracking error AS MEASURED at commissioning
      SEG.push(si);
    }
    si++;
  }
  return { R: Float64Array.from(R), U: Float64Array.from(U), E: Float64Array.from(E), SEG: Int8Array.from(SEG) };
}

// ───────────────────────────────────────────────────────────── the dictionary
/**
 * THE KOOPMAN DICTIONARY, AND EVERY TERM IS A FUNCTION OF THE COMMANDED REFERENCE ALONE.
 *
 * That restriction is what keeps the object admissible AND the inverse explicit: a dictionary term
 * reading the measured state would need the tracker, and one reading the current input would need
 * an inner solve. Evaluating on the reference costs nothing in fidelity here, because the same
 * quantity is available at identification and at deploy — unlike the OUTPUT-lift version, where the
 * fit sees `y` and the deployed inverse must substitute `r` for it.
 *
 * The terms are chosen against THIS plant's stated nonlinearities rather than from a menu. `sgn` is
 * the Coulomb term outright; `tanh` is its smooth family at a ladder of widths (the standard
 * Koopman friction observable); `rbf` is the canonical EDMD dictionary — Korda & Mezić use
 * Gaussians on the state, and the state coordinate that matters here is velocity; `quad` is the
 * even/odd velocity pair; `rbfa` puts Gaussians on acceleration, where the drive saturates. Every
 * scale is taken from the identification data's OWN spread (rules 31, 32): a width in absolute
 * units is a constant carried from somewhere else.
 */
const GROUPS = ['sgn', 'tanh', 'quad', 'rbf', 'rbfa'];

function dictScales(V, A) {
  const span = (X) => {
    let mn = Infinity, mx = -Infinity, s2 = 0;
    for (const v of X) { if (v < mn) mn = v; if (v > mx) mx = v; s2 += v * v; }
    return { mn, mx, sd: Math.sqrt(s2 / X.length) || 1e-12 };
  };
  const v = span(V), a = span(A);
  const centres = (sp, n) => Array.from({ length: n }, (_, i) => sp.mn + (sp.mx - sp.mn) * (i + 0.5) / n);
  return {
    v, a,
    c: centres(v, NRBF), w: (v.mx - v.mn) / NRBF || 1e-12,
    ca: centres(a, NRBF), wa: (a.mx - a.mn) / NRBF || 1e-12,
    th: [0.25, 0.5, 1, 2, 4].map((f) => f * v.sd),
  };
}

/** Evaluate the enabled groups at one reference lag. `dv` velocity proxy, `ac` acceleration proxy. */
function lift(gset, sc, dv, ac, out, n0) {
  let n = n0;
  if (gset.has('sgn')) { out[n++] = Math.sign(dv); out[n++] = Math.sign(ac); }
  if (gset.has('tanh')) for (const s of sc.th) out[n++] = Math.tanh(dv / s);
  if (gset.has('quad')) { out[n++] = dv * Math.abs(dv); out[n++] = dv * dv; out[n++] = Math.abs(dv); }
  if (gset.has('rbf')) for (const c of sc.c) out[n++] = Math.exp(-(((dv - c) / sc.w) ** 2));
  if (gset.has('rbfa')) for (const c of sc.ca) out[n++] = Math.exp(-(((ac - c) / sc.wa) ** 2));
  return n;
}
function liftSize(gset) {
  let n = 0;
  if (gset.has('sgn')) n += 2;
  if (gset.has('tanh')) n += 5;
  if (gset.has('quad')) n += 3;
  if (gset.has('rbf')) n += NRBF;
  if (gset.has('rbfa')) n += NRBF;
  return n * DLAGS;
}
/** Transcendental evaluations per decision, priced separately because an `exp` is not one MAC. */
function liftTrans(gset) {
  let n = 0;
  if (gset.has('tanh')) n += 5;
  if (gset.has('rbf')) n += NRBF;
  if (gset.has('rbfa')) n += NRBF;
  return n * DLAGS;
}

// ───────────────────────────────────────────────────────────── the row
/**
 * ONE ROW BUILDER, USED BY THE FIT AND BY THE DEPLOYED INVERSE. There is not a second copy: the
 * inverse calls this and then solves for the single column it owns. Rule 61 — §56's headline defect
 * was an ordering error inside a polynomial helper that one shared routine would have prevented,
 * and this project has shipped a defect three times from a second copy of a plant's routing.
 *
 * Layout:  [ e-lags (na) | u-lags (nb) | dr,d2r at RLAG reference lags (2·nr) | dictionary | 1 ]
 * The u-block's FIRST entry is the unknown the inverse solves for, which is why it is placed at a
 * fixed offset rather than being appended last.
 */
function rowAt(sp, row, eAt, uAt, rAt, k) {
  const { na, nb, nr, d, gset, sc } = sp;
  let n = 0;
  for (let i = 0; i < na; i++) row[n++] = eAt(k - 1 - i);
  for (let j = 0; j < nb; j++) row[n++] = uAt(k - d - j);
  for (let l = 0; l < nr; l++) {
    const r0 = rAt(k - l), r1 = rAt(k - l - 1), r2 = rAt(k - l - 2);
    row[n++] = r0 - r1;
    row[n++] = r0 - 2 * r1 + r2;
  }
  for (let l = 0; l < DLAGS; l++) {
    const r0 = rAt(k - l), r1 = rAt(k - l - 1), r2 = rAt(k - l - 2);
    n = lift(gset, sc, r0 - r1, r0 - 2 * r1 + r2, row, n);
  }
  row[n++] = 1;
  return n;
}
const nFeat = (sp) => sp.na + sp.nb + 2 * sp.nr + liftSize(sp.gset) + 1;
const uOff = (sp) => sp.na;     // where the unknown lives

// ───────────────────────────────────────────────────────────── EDMDc identification
/**
 * EDMDc: ONE LINEAR REGRESSION OF THE NEXT OBSERVABLE ON THE CURRENT ONES. With delay-embedded
 * error and input coordinates the linear part reduces EXACTLY to the ARX form ZPETC inverts, which
 * is why `LIFTS=none` is a matched control rather than a different experiment.
 *
 * COLUMNS ARE CENTRED AND SCALED before the ridge and mapped back afterwards. The blocks here span
 * six orders of magnitude (an error of 5e-4, a Δr of 1e-4, a sign of 1, an RBF of 1) and a single
 * ridge against raw columns regularises one block and leaves the others untouched (rule 32).
 */
function design(data, sp) {
  const nF = nFeat(sp), T = data.E.length;
  const k0 = Math.max(sp.na, sp.d + sp.nb, sp.nr + 2, DLAGS + 2) + 1;
  const rows = [];
  const row = new Float64Array(nF);
  const eAt = (i) => data.E[i], uAt = (i) => data.U[i], rAt = (i) => data.R[i];
  const X = [], Y = [];
  for (let k = k0; k < T; k++) {
    // Never straddle the seam between the two excitation segments.
    if (data.SEG[k] !== data.SEG[k - k0]) continue;
    rowAt(sp, row, eAt, uAt, rAt, k);
    X.push(Float64Array.from(row)); Y.push(data.E[k]);
  }
  const n = X.length;
  const mu = new Float64Array(nF), sd = new Float64Array(nF);
  for (const x of X) for (let j = 0; j < nF; j++) mu[j] += x[j];
  for (let j = 0; j < nF; j++) mu[j] /= n;
  for (const x of X) for (let j = 0; j < nF; j++) sd[j] += (x[j] - mu[j]) ** 2;
  for (let j = 0; j < nF; j++) { sd[j] = Math.sqrt(sd[j] / n); if (!(sd[j] > 1e-300)) { sd[j] = 1; mu[j] = 0; } }
  let my = 0; for (const y of Y) my += y; my /= n;
  const A = new Float64Array(nF * nF), B = new Float64Array(nF), z = new Float64Array(nF);
  for (let i = 0; i < n; i++) {
    const x = X[i];
    for (let j = 0; j < nF; j++) z[j] = (x[j] - mu[j]) / sd[j];
    const dy = Y[i] - my;
    for (let a = 0; a < nF; a++) { const za = z[a]; if (za === 0) continue; for (let b = 0; b <= a; b++) A[a * nF + b] += za * z[b]; B[a] += za * dy; }
  }
  for (let a = 0; a < nF; a++) for (let b = a + 1; b < nF; b++) A[a * nF + b] = A[b * nF + a];
  return { A, B, mu, sd, my, nF, n, sp, X, Y };
}

function solve(des, ridge) {
  const { nF } = des;
  let tr = 0; for (let a = 0; a < nF; a++) tr += des.A[a * nF + a];
  const M = Array.from({ length: nF }, (_, i) => [...des.A.slice(i * nF, i * nF + nF), des.B[i]]);
  for (let a = 0; a < nF; a++) M[a][a] += ridge * tr / nF;
  for (let c = 0; c < nF; c++) {
    let p = c; for (let r = c + 1; r < nF; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (!isFinite(M[c][c]) || Math.abs(M[c][c]) < 1e-300) return null;
    for (let r = 0; r < nF; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= nF; j++) M[r][j] -= f * M[c][j]; }
  }
  const zs = M.map((r, i) => r[nF] / M[i][i]);
  if (zs.some((v) => !isFinite(v))) return null;
  // Back to the raw column scale, with the intercept absorbing the centring.
  const w = new Float64Array(nF);
  let w0 = des.my;
  for (let j = 0; j < nF; j++) { w[j] = zs[j] / des.sd[j]; w0 -= w[j] * des.mu[j]; }
  // The constant column is in the row too; fold the intercept into it so the deployed object is
  // one dot product with no special case.
  w[nF - 1] += w0;
  // IN-SAMPLE R² ON THE ERROR — the meaningful denominator, which the output-target version of this
  // file did not have (rule 19).
  let ss = 0, st = 0;
  for (let i = 0; i < des.n; i++) {
    let p = 0; const x = des.X[i];
    for (let j = 0; j < nF; j++) p += w[j] * x[j];
    ss += (des.Y[i] - p) ** 2; st += (des.Y[i] - des.my) ** 2;
  }
  return { w, nF, sp: des.sp, r2: st > 0 ? 1 - ss / st : 0 };
}

// ───────────────────────────────────────────────────────────── the deployed object
/**
 * THE INVERSE, AND IT IS THE WHOLE DEPLOYED ARTEFACT: a weight vector, a dictionary, `d` steps of
 * reference preview and two short ring buffers. It reads the commanded reference and NOTHING else
 * — no measured state, no tracking error, no lap index — which is what makes Koopman ② admissible
 * where Koopman ① is not.
 */
function makeFF(md) {
  const sp = md.sp, nF = md.nF, ui = uOff(sp), b0 = md.w[ui];
  const row = new Float64Array(nF);
  // The rings are indexed by an INTERNAL monotone tick, never by the reference index, because
  // `driveRef` calls a correction with a WRAPPED lap phase while `score` calls it with an absolute
  // sample — an object keyed on the caller's index would be a different controller under the two
  // scoring conventions this file exists to print side by side.
  const NH = Math.max(sp.na, sp.d + sp.nb, 4) + 4;
  const eRing = new Float64Array(NH), uRing = new Float64Array(NH);
  let tick = 0;
  return {
    md, b0,
    reset() { eRing.fill(0); uRing.fill(0); tick = 0; },
    /** `at(k)` is the reference, readable `d` steps ahead. Returns the correction to add at `k`. */
    step(at, k) {
      const kk = k + sp.d;
      const slot = (o) => ((tick - o) % NH + NH) % NH;
      uRing[slot(0)] = 0;                              // the unknown's own column is zero
      const eAt = (idx) => { const o = kk - idx; return o >= 1 && o < NH ? eRing[slot(o)] : 0; };
      const uAt = (idx) => { const o = kk - sp.d - idx; return o >= 0 && o < NH ? uRing[slot(o)] : 0; };
      rowAt(sp, row, eAt, uAt, at, kk);
      let s = 0;
      for (let j = 0; j < nF; j++) if (j !== ui) s += md.w[j] * row[j];
      let u = -s / b0;
      if (!isFinite(u)) u = 0;
      u = Math.max(-UM, Math.min(UM, u));
      // THE CLAMPED COMMAND IS WHAT ENTERS THE HISTORY, because it is what the machine received —
      // and it is the anti-windup: this recursion's poles are the B polynomial's own zeros, so a
      // marginal inverse would otherwise run away, and reporting a runaway as a plant result is
      // exactly what §54.10 refused to do.
      uRing[slot(0)] = u;
      eRing[slot(0)] = s + b0 * u;          // the model's OWN predicted error, 0 when unclamped
      tick++;
      return u;
    },
  };
}

/** What a decision costs, both ways, because an `exp` is not one MAC on a PLC. */
function cost(md) {
  const sp = md.sp;
  const mac = md.nF - 1;                    // one dot product over the row, minus the unknown, + a divide
  const tr = liftTrans(sp.gset);
  const bytes = 8 * (md.nF + (sp.gset.has('rbf') ? NRBF + 1 : 0) + (sp.gset.has('rbfa') ? NRBF + 1 : 0)
    + (sp.gset.has('tanh') ? 5 : 0) + 2 * (Math.max(sp.na, sp.nb, 4) + 4));
  return { mac, tr, macHard: mac + 20 * tr, bytes };
}

// ───────────────────────────────────────────────────────────── scoring
/**
 * THE RIVALS' CONVENTION — the loop `zpetc.mjs` and `deepc.mjs` score in, so the three rivals are
 * comparable by construction: six laps, the LAST one scored (rule 12), the same ±UM clamp, the same
 * trajectories.
 */
function score(q, lap, ff, laps = 6) {
  const m = makeMachine(q[0], 0);
  const at = (k) => q[((k % lap) + lap) % lap];
  if (ff) ff.reset();
  let s = 0, n = 0, uPk = 0, capped = 0, tot = 0;
  for (let k = 0; k < laps * lap; k++) {
    let u = 0;
    if (ff) u = ff.step(at, k);
    if (!isFinite(u)) u = 0;
    uPk = Math.max(uPk, Math.abs(u));
    if (Math.abs(u) >= 0.999 * UM) capped++;
    tot++;
    m.step(at(k) + u);
    const e = m.q - at(k);
    if (k >= (laps - 1) * lap) { s += e * e; n++; }
  }
  return { rms: 1000 * Math.sqrt(s / n), uPk, cap: capped / tot };
}

// ───────────────────────────────────────────────────────────── the run
export { collect, design, solve, makeFF, score, dictScales, rowAt, nFeat, GROUPS, UM, cost };

if (process.env.KOOP_LIB) { /* imported as a library — the run below is skipped */ } else {
const t0 = Date.now();
console.log('\nkoopman: KOOPMAN-EDMD ON THE EMPS AXIS — target 8\'s last named rival\n');
console.log('  ADMISSIBILITY FIRST (plan §113, on §54.8b\'s test), because there are TWO Koopmans:');
console.log('    (1) the LITERATURE\'S CONTROLLER — lift the MEASURED STATE, advance it, solve an MPC');
console.log('        in the lifted space (Korda & Mezic 2018). INADMISSIBLE on DeePC\'s own ground:');
console.log('        psi(x_k) keeps the commissioning instrument bolted on for ever, and §52.42');
console.log('        prices that at 3.9x. NOT BUILT — priced at the end rather than waved at.');
console.log('    (2) the lift used ONLY at commissioning, the model INVERTED into a feedforward that');
console.log('        deploys as a fixed map of the COMMANDED REFERENCE. No runtime truth, no lap');
console.log('        index, transfers by construction. ADMISSIBLE — **this is what is measured**.\n');

// The dictionary's scales come from the REFERENCE, which no knob here moves, so they are computed
// once and every arm sees the identical dictionary.
const ref0 = collect(SEED, 0);
const V = [], AC = [];
for (let k = 2; k < ref0.R.length; k++) {
  if (ref0.SEG[k] !== ref0.SEG[k - 2]) continue;
  V.push(ref0.R[k] - ref0.R[k - 1]);
  AC.push(ref0.R[k] - 2 * ref0.R[k - 1] + ref0.R[k - 2]);
}
const sc = dictScales(V, AC);

const sine = tone(4800, 3, 7, 0.9, rates(PR.q).v);
const openP = score(PR.q, P, null).rms, openS = score(sine, 4800, null).rms;
console.log(`  identification: 2 x ${TDATA} samples (the program and a two-tone) = zpetc.mjs's OWN`);
console.log(`                  total budget for its two paths${NOISE ? `, with ${NOISE} mm rms on what it reads` : ', no noise'}`);
console.log(`\n  open loop — program ${openP.toExponential(4)} mm   held-out sine ${openS.toExponential(4)} mm`);
const REPRO = Math.abs(openP - 4.8849e-1) < 5e-5 && Math.abs(openS - 3.2430e-1) < 5e-5;
console.log(`  §56 records 4.8849e-1 and 3.2430e-1 through this loop — `
  + `${REPRO ? 'REPRODUCED, so this is that machine (rule 21)' : '*** DOES NOT REPRODUCE — the instrument moved ***'}`);
const zeroP = score(PR.q, P, { reset() {}, step: () => 0 }).rms;
console.log(`  ZERO control — a correction of exactly 0 reproduces the open loop: `
  + `${zeroP === openP ? 'BIT-EXACT' : `*** ${zeroP.toExponential(6)} vs ${openP.toExponential(6)} ***`}`);

// THE ADMISSIBILITY CLAIM, ASSERTED RATHER THAN STATED. "It reads nothing at runtime" is the whole
// difference between Koopman ② and Koopman ①, and a claim that decides a classification must not
// rest on reading the source. `§81` established the form: the deployed object's output is a function
// of the COMMANDED REFERENCE alone, so putting the MACHINE somewhere else must leave the correction
// sequence BIT-IDENTICAL over every decision. If any measurement ever leaked into the act path this
// goes red, whatever the prose says.
{
  const probe = collect(SEED, 2e-4);
  const des = design(probe, { na: 1, nb: 8, nr: 4, d: 8, gset: new Set(['sgn']), sc: dictScales(
    Array.from({ length: probe.R.length - 2 }, (_, i) => probe.R[i + 2] - probe.R[i + 1]),
    Array.from({ length: probe.R.length - 2 }, (_, i) => probe.R[i + 2] - 2 * probe.R[i + 1] + probe.R[i])) });
  const md = solve(des, 1);
  const at = (k) => PR.q[((k % P) + P) % P];
  const run = (q0) => {
    const m = makeMachine(q0, 0), f = makeFF(md), out = [];
    f.reset();
    for (let k = 0; k < 4000; k++) { const u = f.step(at, k); out.push(u); m.step(at(k) + u); }
    return out;
  };
  const a1 = run(PR.q[0]), a2 = run(PR.q[0] + 5e-3);   // the machine started 5 mm away
  const same = a1.length === a2.length && a1.every((v, i) => v === a2[i]);
  console.log(`  RUNTIME-TRUTH control — start the MACHINE 5 mm off and the correction sequence is `
    + `${same ? 'BIT-IDENTICAL over 4,000 decisions' : '*** DIFFERENT — something measured has leaked into the act path ***'}`);
}

const NAS = (process.env.NAS || '0,1,2').split(',').map(Number);
const NBS = (process.env.NBS || '4,8,32').split(',').map(Number);
const DELAYS = (process.env.DELAYS || '0,8,16,32').split(',').map(Number);
const RLAGS = (process.env.RLAGS || '4,16,32').split(',').map(Number);
const RIDGES = (process.env.RIDGES || '1e-10,1e-8,1e-6,1e-4,1e-2,1,1e2').split(',').map(Number);
const LIFTS = (process.env.LIFTS
  || 'none,sgn,tanh,quad,rbf,rbfa,sgn+quad,tanh+quad,rbf+sgn,rbf+quad,rbf+rbfa,sgn+tanh+quad+rbf+rbfa').split(',');
// STAGE 2's PROBE SET IS DERIVED FROM STAGE 1's OWN ARGMIN AND ITS TWO LADDER NEIGHBOURS, NOT
// WRITTEN DOWN. A fixed list is right only while stage 1's optimum happens to sit inside it, and
// the NOISE falsifier is exactly the case where it does not — under 1.6 µm the optimum moves a
// decade, so a hardcoded list would have swept stage 2 at three amplitudes none of which was the
// one stage 1 chose, and reported the difference as the dictionary's (rule 31: a constant right for
// one configuration must be re-derived for another).
const PROBES_ENV = process.env.PROBES ? process.env.PROBES.split(',').map(Number) : null;
const S1 = { na: NAS, nb: NBS, d: DELAYS, nr: (process.env.RLAGS1 || '4,16').split(',').map(Number) };
const LADDER = (process.env.LADDER || '2e-2,4e-3,1e-3,4e-4,2e-4,1e-4,5e-5,2e-5,1e-5,3e-6').split(',').map(Number);

/**
 * Sweep one dictionary over a structure grid at one probe; return the best cell by SCREEN.
 *
 * STAGE 1 IS GIVEN A LEANER GRID THAN STAGE 2 AND THE REASON IS STATED: it exists to choose the
 * EXCITATION AMPLITUDE, not the structure, and running the full grid at ten probes costs more
 * arithmetic than the whole of stage 2. Each probe still gets the same grid as every other probe,
 * which is what a comparison down that column needs; the winning probes are then re-swept at full
 * width in stage 2, so nothing is decided on the lean grid except the probe.
 */
function sweep(data, gset, ls, probe, g = null) {
  const NA = g ? g.na : NAS, NB = g ? g.nb : NBS, DL = g ? g.d : DELAYS, RL = g ? g.nr : RLAGS;
  let b = null, n = 0;
  for (const na of NA) for (const nb of NB) for (const d of DL) for (const nr of RL) {
    const des = design(data, { na, nb, nr, d, gset, sc });
    for (const ridge of RIDGES) {
      const md = solve(des, ridge);
      if (!md) continue;
      const ff = makeFF(md);
      if (!isFinite(ff.b0) || ff.b0 === 0) continue;
      const rp = score(PR.q, P, ff, SLAPS);
      n++;
      if (!b || rp.rms < b.screen) b = { ls, probe, na, nb, d, nr, ridge, md, screen: rp.rms };
    }
  }
  return { best: b, n };
}

// ───────────────────────────────────────────────────────────── STAGE 1: the excitation
/**
 * THE PROBE AMPLITUDE LADDER, ON THE LINEAR ARM, AND IT IS THE LARGEST SINGLE EFFECT IN THIS FILE.
 * rule 41b: an excitation built to the DECLARED limits describes a machine the program does not
 * run. `zpetc.mjs` and `deepc.mjs` both excite at the AUTHORITY, ±0.02 m; the correction this axis
 * actually needs peaks at 7.3e-4 m.
 */
console.log('\n  STAGE 1 — THE EXCITATION, swept on the LINEAR arm (rule 41b). The dictionary cannot');
console.log('  repair an identification taken in a regime the controller never occupies.\n');
console.log('    probe |u|    best structure                       program       x');
let bestProbe = null;
const ladder = [];
for (const amp of LADDER) {
  const d0 = collect(SEED, amp);
  const { best: b } = sweep(d0, new Set(), 'none', amp, S1);
  if (!b) { console.log(`    ${amp.toExponential(1)}      (no cell solved)`); continue; }
  const ff = makeFF(b.md);
  b.rp = score(PR.q, P, ff);
  ladder.push(b);
  console.log(`    ${amp.toExponential(1)}      na ${String(b.na).padStart(1)}  nb ${String(b.nb).padStart(2)}  d ${String(b.d).padStart(2)}  nr ${String(b.nr).padStart(2)}  ridge ${String(b.ridge).padStart(6)}   `
    + `${b.rp.rms.toExponential(3)} ${(openP / b.rp.rms).toFixed(2).padStart(7)}x`);
  if (!bestProbe || b.rp.rms < bestProbe.rp.rms) bestProbe = b;
}
const lprobe = LADDER.map(Number);
const probeEdge = bestProbe.probe === Math.min(...lprobe) ? 'BOTTOM EDGE'
  : bestProbe.probe === Math.max(...lprobe) ? 'TOP EDGE' : 'interior';
console.log(`\n    best probe ${bestProbe.probe.toExponential(1)} m — ${probeEdge} of a ladder spanning `
  + `${(Math.max(...lprobe) / Math.min(...lprobe)).toFixed(0)}x, and ${(2e-2 / bestProbe.probe).toFixed(0)}x SMALLER than`);
// The comparison is against the ROW AT 0.02 if the ladder contains it, and says so if it does not —
// quoting the ladder's first row as "the default" would be true only by accident of the ladder.
const dflt = ladder.find((r) => r.probe === 0.02);
console.log(`    the ±0.02 m zpetc.mjs and deepc.mjs both excite at. At the ladder's own optimum this`);
console.log(`    arm reads ${(openP / bestProbe.rp.rms).toFixed(2)}x; at ±0.02 it reads `
  + (dflt ? `${(openP / dflt.rp.rms).toFixed(2)}x${openP / dflt.rp.rms < 1 ? ', WORSE THAN DOING NOTHING' : ''}.`
    : 'UNKNOWN — 0.02 is not on this ladder (rule 25).'));

// ───────────────────────────────────────────────────────────── STAGE 2: the dictionary
const bi = LADDER.indexOf(bestProbe.probe);
const PROBES = PROBES_ENV || [LADDER[bi - 1], LADDER[bi], LADDER[bi + 1]].filter((v) => v !== undefined);
console.log(`\n  STAGE 2 — THE KOOPMAN LIFT at probes ${PROBES.map((v) => v.toExponential(1)).join(', ')} — stage 1's own`);
console.log('  argmin and its two ladder neighbours, derived rather than written down — everything else swept.');
console.log('  `none` is the MATCHED CONTROL: same data, same solver, same inverse, dictionary EMPTY,');
console.log('  so whatever the lift is worth is the gap between two rows of ONE table (rule 20).\n');
console.log('  lift                  probe  na nb  d  nr    ridge   nF    R2(e)     program      x        sine       x   cap%');
let best = null; const rows = [];
let nCells = 0;
const cache = new Map();
for (const probe of PROBES) {
  if (!cache.has(probe)) cache.set(probe, collect(SEED, probe));
}
for (const ls of LIFTS) {
  const gset = new Set(ls === 'none' ? [] : ls.split('+'));
  for (const g of gset) if (!GROUPS.includes(g)) { console.log(`  unknown dictionary group '${g}'`); process.exit(1); }
  let b = null;
  for (const probe of PROBES) {
    const r = sweep(cache.get(probe), gset, ls, probe);
    nCells += r.n;
    if (r.best && (!b || r.best.screen < b.screen)) b = r.best;
  }
  if (!b) continue;
  const ff = makeFF(b.md);
  b.rp = score(PR.q, P, ff); b.rs = score(sine, 4800, ff);
  rows.push(b);
  if (!best || b.rp.rms < best.rp.rms) best = b;
  console.log(`  ${b.ls.padEnd(21)} ${b.probe.toExponential(0).padStart(6)} ${String(b.na).padStart(3)} ${String(b.nb).padStart(2)} ${String(b.d).padStart(2)} ${String(b.nr).padStart(3)} `
    + `${String(b.ridge).padStart(8)} ${String(b.md.nF).padStart(4)} ${b.md.r2.toFixed(5).padStart(8)}  `
    + `${b.rp.rms.toExponential(3)} ${(openP / b.rp.rms).toFixed(2).padStart(7)}x  `
    + `${b.rs.rms.toExponential(3)} ${(openS / b.rs.rms).toFixed(2).padStart(6)}x ${(100 * b.rp.cap).toFixed(0).padStart(4)}`);
}
if (!best) { console.log('\n  no cell solved at all.\n'); process.exit(0); }
const lin = rows.find((r) => r.ls === 'none');

console.log(`\n  SCREEN CONTROL: the ${SLAPS}-lap ranking score and the reported 6-lap score for the best`
  + ` cell are ${best.screen.toExponential(4)} and ${best.rp.rms.toExponential(4)} mm`
  + ` (${(100 * Math.abs(best.screen - best.rp.rms) / best.rp.rms).toFixed(2)}% apart)`);

// ───────────────────────────────────────────────────────────── CONTROL 1
// `na = 0` and `d = 0` are FLOORS OF THE QUANTITY and not edges of a grid — there is no negative
// autoregressive order and no negative preview — so they are reported as floors. Calling one an
// edge would demand a widening that does not exist, which is the mirror of the fault this control
// exists to catch.
const edge = (v, arr, floor = null) => (arr.length < 2 ? 'single value — NOT SWEPT'
  : (floor !== null && v === floor) ? "at the quantity's FLOOR — no widening exists"
  : v === Math.min(...arr) ? 'BOTTOM EDGE' : v === Math.max(...arr) ? 'TOP EDGE' : 'interior');
console.log(`\n  BEST CELL OVERALL: lift '${best.ls}'  probe ${best.probe.toExponential(1)}  na ${best.na}  nb ${best.nb}  d ${best.d}  nr ${best.nr}  ridge ${best.ridge}  (${best.md.nF} features)`);
console.log(`    program ${best.rp.rms.toExponential(4)} mm  ${(openP / best.rp.rms).toFixed(2)}x     sine ${best.rs.rms.toExponential(4)} mm  ${(openS / best.rs.rms).toFixed(2)}x`);
console.log('\n  CONTROL 1 — DOES IT RUN AWAY WITH ITS OWN GRID? (§54.8, what disqualified DeePC)');
const knobs = [['ridge', best.ridge, RIDGES, null], ['probe', best.probe, LADDER, null],
  ['err AR', best.na, NAS, 0], ['inp lags', best.nb, NBS, null], ['delay', best.d, DELAYS, 0],
  ['ref lags', best.nr, RLAGS, null]];
let allInterior = true;
for (const [nm, v, arr, fl] of knobs) {
  const e = edge(v, arr, fl);
  if (e !== 'interior' && !e.startsWith("at the quantity")) allInterior = false;
  console.log(`    ${nm.padEnd(9)} ${String(v).padEnd(9)} in [${arr.join(',')}]${' '.repeat(Math.max(1, 34 - arr.join(',').length))}${e}`);
}
console.log(`    -> ${allInterior ? 'the optimum is INTERIOR in every knob; the grid is not deciding it.'
  : 'at least one knob\'s optimum sits on an EDGE — that knob must be widened before this is read as an optimum (rule 14).'}`);

// ───────────────────────────────────────────────────────────── CONTROL 4
// THE OTHER SCORING CONVENTION, AND THE OBJECT IS RE-COMMISSIONED IN IT RATHER THAN CARRIED INTO IT.
// `driveRef`/`transfer` command `q[k-1]` and score against `q[k]`; `score()` does neither, and the
// two loops' OPEN LOOPS differ by 18% (5.7640e-1 against 4.8849e-1). Deploying the (a) object into
// (b) would measure transfer across a loop change, not the object. So the identification is re-run
// with `shift = 1` and the SAME structure the (a) sweep selected — carried, not re-selected, which
// can only understate this column. Both loops also index the correction differently: `driveRef`
// hands back a WRAPPED lap phase, so the object is driven from its own monotone counter, or its
// internal model would be re-seeded with stale history at every lap boundary.
const homeOpen = driveRef(PR.q, P, null).score;
const openT = transfer(null);
const dataB = collect(SEED, best.probe, 1);
const desB = design(dataB, { na: best.na, nb: best.nb, nr: best.nr, d: best.d, gset: best.md.sp.gset, sc });
const mdB = solve(desB, best.ridge);
const progAt = (k) => PR.q[((k % P) + P) % P];
const sineAt = (k) => TQ[Math.min(N2 - 1, Math.max(0, k))];
let homeK = NaN, koopT = NaN;
if (mdB) {
  const bff = makeFF(mdB); bff.reset();
  let kc = 0;
  homeK = driveRef(PR.q, P, () => bff.step(progAt, kc++)).score;
  const bff2 = makeFF(mdB); bff2.reset();
  let kc2 = 0;
  koopT = transfer(() => bff2.step(sineAt, kc2++));
}

console.log('\n  THE COMPARISON — BOTH CONVENTIONS, because the two on record are not the same loop:');
console.log('\n    (a) the RIVALS\' convention — `score()` on tone(4800,3,7,0.9), as zpetc.mjs / deepc.mjs use:');
console.log(`        open loop                     program ${openP.toExponential(4)}        sine ${openS.toExponential(4)} mm`);
console.log(`        KOOPMAN-EDMD (best of ${String(nCells).padStart(4)})   ${best.rp.rms.toExponential(4)} ${(openP / best.rp.rms).toFixed(2).padStart(7)}x    ${best.rs.rms.toExponential(4)} ${(openS / best.rs.rms).toFixed(2).padStart(6)}x`);
if (lin) console.log(`        the matched LINEAR control    ${lin.rp.rms.toExponential(4)} ${(openP / lin.rp.rms).toFixed(2).padStart(7)}x    ${lin.rs.rms.toExponential(4)} ${(openS / lin.rs.rms).toFixed(2).padStart(6)}x`);
console.log('        ZPETC (§56)                                 2.45x                   3.28x    [on record]');
console.log('        DeePC at 1.6 um (§54.8)                     1.00x                   1.00x    [on record, INADMISSIBLE]');
console.log('\n    (b) the DISTILLED POLICY\'S OWN convention — `driveRef`/`transfer` on `twoTone`, which');
console.log('        is the loop and the trajectory 32.75x / 33.15x were actually measured on:');
console.log(`        open loop                     program ${homeOpen.toExponential(4)}        sine ${openT.toExponential(4)} mm`);
console.log(`        KOOPMAN-EDMD (same structure, re-commissioned in THIS loop)`);
console.log(`                                      ${homeK.toExponential(4)} ${(homeOpen / homeK).toFixed(2).padStart(7)}x    ${koopT.toExponential(4)} ${(openT / koopT).toFixed(2).padStart(6)}x`);
console.log('        the DISTILLED policy                       32.75x                  33.15x    [on record]');
console.log('        the CONVENTIONAL rung                     424.8x        — and it is what the one press ships here');

// ───────────────────────────────────────────────────────────── CONTROL 3
const c3 = cost(best.md);
console.log('\n  CONTROL 3 — WHAT THE NUMBER COSTS, which a delivered error does not say:');
console.log(`    KOOPMAN-EDMD feedforward  ${String(c3.mac).padStart(7)} MAC/decision = ${(100 * c3.mac / BUDGET).toFixed(1)}% of the budget   ${c3.mac <= BUDGET ? 'FITS' : 'DOES NOT FIT'}`);
console.log(`      + ${c3.tr} transcendental evaluations at 20 MAC each: ${c3.macHard} MAC = ${(100 * c3.macHard / BUDGET).toFixed(1)}%   ${c3.macHard <= BUDGET ? 'STILL FITS' : 'DOES NOT FIT'}`);
console.log(`    deployed state            ${String(c3.bytes).padStart(7)} bytes, and ${best.d} step${best.d === 1 ? '' : 's'} of reference PREVIEW`);
console.log('    the distilled policy           78 MAC/decision = 0.8%   FITS   in 0.2 kB   [on record]');
console.log('    DeePC                     145,082 MAC/decision = 1451%  DOES NOT FIT       [on record]');

console.log('\n  CONTROL 2 — THE NOISE FALSIFIER: re-run with NOISE=0.0016, the rig\'s OWN stated 1.6 um');
console.log('    identification fidelity. It lands on what the COMMISSIONING reads; the deployed object');
console.log('    reads nothing, so its arithmetic is unaffected BY CONSTRUCTION. DeePC collapsed to');
console.log('    1.00x there and ZPETC to 0.06-0.27x.');
console.log(`    this run: ${NOISE ? `${NOISE} mm rms ON — this IS the falsifier` : 'NO NOISE — the flattering regime; run the falsifier before quoting anything'}`);

const mpcMac = 2 * 40 * 40 + best.md.nF * best.md.nF;
console.log('\n  AND KOOPMAN (1), PRICED RATHER THAN WAVED AT. A lifted MPC over the same dictionary at');
console.log(`    nF = ${best.md.nF}, horizon 40, ONE projected-gradient iteration: ~${mpcMac.toLocaleString()} MAC/decision`);
console.log(`    (${(100 * mpcMac / BUDGET).toFixed(0)}% of the budget) — and it reads the measured state at every one`);
console.log('    of them. It is not built because the INSTRUMENT disqualifies it, not the arithmetic.');

console.log(`\n  ${nCells} cells in stage 2, ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
console.log('  (nothing here is asserted — this is a rival, and what it measures is the result)\n');
}
