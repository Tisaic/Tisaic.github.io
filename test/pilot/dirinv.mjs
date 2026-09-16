/**
 * @file LEARN THE COMMAND DIRECTLY — the owner's routing, run dynamically (plan §93).
 *
 * ---------------------------------------------------------------- READ THIS FIRST (plan §99)
 *
 * **EVERY DELIVERED NUMBER THIS FILE PRODUCED BEFORE §99 WAS TAKEN THROUGH A BROKEN READER, AND
 * §93's CENTRAL NEGATIVE IS RETRACTED.** `DistilPolicy` has two entry points taking DIFFERENT
 * reader shapes — `act(refAt, k)` wants an ABSOLUTE-INDEX reader and builds its own window
 * `look = (o) => refAt(k + o)`; `actLook(look)` wants an OFFSET-FROM-NOW reader, already centred.
 * All seven deploy sites here passed an offset-from-now closure to `act(…, i)`, so the closure was
 * handed `k + o = i + o` as its own offset and the window was read **centred at 2i**. At i = 0 the
 * two agree exactly, which is why it survived §93, §94 and §98 unnoticed. Section L is the dump.
 *
 * The library was right and only this caller was wrong: `distil.test.mjs` pins the two readers to
 * agree away from a record boundary and to differ at it, and a grep of every `act`/`actLook` call
 * site in the repository finds this file alone (plan §99). Nothing that ships was affected.
 *
 * WHAT MOVES, at the same fit, same diet, same machine — only the window's centre:
 *
 *     scribble diet, gain 1          0.588x  ->  2.658x     program R²  -1.886  ->  0.8584
 *     own-class diet (D)             0.701x  ->  5.508x     program R²  -1.017  ->  0.9671
 *     the gain ladder (A)   monotone to 1.00x  ->  3.183x at gain 0.5, an interior optimum
 *     forward-reach ladder (E)  0.701->0.703x  ->  5.505x -> 6.084x, and MONOTONE as predicted
 *
 * §94 is NOT affected and reproduces byte-identically (25,167 labels, held-out -0.1142 against a
 * null of -0.0044, deploy FALSE, the lift -0.4340 / -0.0182 / 0.0020) because its fit REFUSED, so
 * nothing was ever applied and the broken reader never ran — rule 21's signature from the far side.
 * What §94's CONCLUSION rested on does not survive: *the obstacle is the FUNCTION CLASS, measured
 * from four directions* counted `-1.02 fitted directly` as one of the four, and that direction now
 * reads **+0.9671**.
 *
 * NOT A TEST. The proposal: *learn the controller output directly; set and actuals routed in; the
 * ground truth is routed as the "setpoint" at commissioning, and after commissioning the setpoint
 * is the setpoint.*
 *
 * **THIS PROJECT HAS DONE IT STATICALLY AND IT WON BY 23-44x.** `docs/history/flexisim.md` brick 40
 * (`ikfree.test.mjs`): *fed only held tracker points during commissioning it fits the direct
 * inverse (x,y)→commands itself, and holding real path points that learned map beats the analytic
 * `ik()` 23-44x statically*. That is exactly this routing on the KINEMATIC map. The DYNAMIC
 * version has never been run here, and this file is it.
 *
 * ---------------------------------------------------------------- WHAT IS ACTUALLY DIFFERENT
 *
 * Everything this project deploys today imitates a CORRECTION produced by a TEACHER:
 *
 *     truth -> teacher iterates on the machine -> converged correction -> regress -> map
 *
 * and that one fact is behind four separate entries in the record. §49's law: a MORE converged
 * teacher teaches a WORSE policy, because the target carries what the map cannot express. §73.13:
 * the teacher is **74-89% of the commissioning bill**, which is why target 4 fails on six plants
 * of eight. §80.3: every teacher here is lap-indexed, which is the disturbance-rejection ceiling.
 * §90.2: the teacher needs a commissioned cascade as its increment generator, so it drags 4,534
 * lines along with it.
 *
 * The direct inverse deletes all four. There is no teacher, no lap index, no cascade and no
 * forecast — so §56's *a model can be exact in prediction and still be a bad thing to invert*
 * cannot apply to something that was never inverted. And §92.1 is evidence FOR it rather than
 * against: there the map fit its teacher's target at R² 0.9975 and DELIVERED WORSE, so fitting the
 * teacher better is not the lever.
 *
 * ---------------------------------------------------------------- THE ROUTING, EXACTLY
 *
 * At COMMISSIONING, for every decision k, three things are recorded: the command `c[k]` that was
 * actually sent, the tool position `y[k]` it actually achieved (the tracker — the one thing only
 * commissioning has), and the machine's own measured state.
 *
 *     fit:      window of ACHIEVED y   ->   c - y      "to have been here, I commanded that much
 *                                                        more than here"
 *     deploy:   window of DESIRED  r   ->   c = r + f(r)
 *
 * The truth never appears at runtime because its job was to LABEL THE INPUT, not to compute a
 * target. After commissioning the desired trajectory goes into the slot the achieved one occupied
 * — which is the owner's sentence, mechanically.
 *
 * **THE TARGET IS `c - y` AND NOT `c`**, so the quantity learned is the PRE-DISTORTION — small,
 * inside the same clamp and the same coverage guard the shipped object already carries, and
 * exactly what `DistilPolicy` is shaped for. `f(y) = c - y` fitted and `c = r + f(r)` deployed are
 * the same map; the difference is only that one of them fits inside the artefact that already
 * ships.
 *
 * **AND IT REUSES THE DEPLOYED OBJECT UNCHANGED**, which is what makes this a routing experiment
 * rather than a new controller: `DistilPolicy` regresses a target on a window of whatever `refAt`
 * hands it. Today that is the commanded reference and the target is a teacher's correction. Here
 * it is the achieved trajectory and the target is the command. Same 40-odd coefficients, same
 * straddling window, same clamp, same guard, same `deploy.js` at runtime.
 *
 * ---------------------------------------------------------------- WHAT WOULD KILL IT (rule 59)
 *
 * Written down before the run:
 *   NON-UNIQUENESS  direct inverse learning averages over commands that produce the same output,
 *                   and the average need not be a valid inverse (Jordan & Rumelhart's objection).
 *                   It is checked below rather than assumed, on the diet, before anything is fitted.
 *   RULE 35         an inverse model inside a loop is positive feedback unless it was trained over
 *                   the operating points the loop will occupy, so the excitation DITHERS.
 *   COVERAGE        at deploy it is asked for setpoints the machine never achieved. That is the
 *                   diet's job and where rule 41b bites, so the excitation is sized from the
 *                   PROGRAM'S OWN peaks and not from declared limits.
 *
 * Run: node test/pilot/dirinv.mjs  [REACH=..] [TAPS=..] [RIDGE=..] [SCRIB=..] [SEED=..]
 */
import { DistilPolicy } from '../../lib/pilot/distil.js';
import { DT, P, PR, RUNS as PRUNS, ACC, V0, makeMachine } from './emps-rig.mjs';

const SEED = +(process.env.SEED || 1);
const SCRIB = +(process.env.SCRIB || 6);          // excitation laps
const RIDGE = process.env.RIDGE === undefined ? 1e-6 : +process.env.RIDGE;

function lcg(s0) { let s = s0 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const rnd = lcg(SEED);
const gauss = () => { const u = Math.max(1e-12, rnd()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };

// ---------------------------------------------------------------- the program's own demand
/** Rule 41b: size the excitation from what the PROGRAM asks for, never from declared limits. */
let vPk = 0, aPk = 0;
for (let k = 1; k < P - 1; k++) {
  vPk = Math.max(vPk, Math.abs((PR.q[k + 1] - PR.q[k - 1]) / 2));
  aPk = Math.max(aPk, Math.abs(PR.q[k + 1] - 2 * PR.q[k] + PR.q[k - 1]));
}
console.log(`\ndirinv: LEARN THE COMMAND DIRECTLY — the owner's routing, run dynamically (plan §93)`);
console.log(`  EMPS servo axis. The program demands peak |v| ${vPk.toExponential(3)} `
  + `and |a| ${aPk.toExponential(3)} per step; the excitation is sized from those (rule 41b).\n`);

// ---------------------------------------------------------------- the excitation
/**
 * A FILTERED-NOISE SCRIBBLE AT THE PROGRAM'S OWN SCALE, plus the program itself. Two-pole smoothing
 * so the commanded acceleration stays inside what the axis actually runs, and a DITHER amplitude
 * that makes the loop visit the operating points around each one rather than only the nominal
 * (rule 35 — a model fitted only at the nominal is positive feedback when the loop moves off it).
 */
function scribble(n) {
  const out = new Float64Array(n);
  let x = PR.q[0], v = 0;
  for (let k = 0; k < n; k++) {
    v += 0.02 * (gauss() * aPk * 6 - 0.04 * v);
    v = Math.max(-vPk * 1.2, Math.min(vPk * 1.2, v));
    x += v;
    // Kept inside the axis's own travel, softly, so the excitation is a trajectory rather than a
    // machine on its end stop.
    if (x < 0.02) { x = 0.02; v = Math.abs(v); }
    if (x > 0.25) { x = 0.25; v = -Math.abs(v); }
    out[k] = x;
  }
  return out;
}

/**
 * Run the machine on a command trajectory and record what it ACHIEVED. `c[k]` is the position
 * command sent at step k and `y[k]` is where the tool actually was at that step — read BEFORE the
 * step, so the pair is (what I asked for now, where I am now) and the map's window supplies the
 * lead rather than an off-by-one hiding in the record (rule 17: this project's recurring fault is
 * a record built on one clock and read on another).
 */
function drive(c) {
  const m = makeMachine(c[0], 0);
  const y = new Float64Array(c.length);
  for (let k = 0; k < c.length; k++) { y[k] = m.q; m.step(c[k]); }
  return y;
}

// ---------------------------------------------------------------- the diet
const RUNS = [];
for (let i = 0; i < SCRIB; i++) { const c = scribble(P); RUNS.push({ c, y: drive(c) }); }
// The program itself is NOT in the diet — it is the held-out score.
console.log(`  diet: ${SCRIB} filtered-noise scribbles of ${P} steps each, the PROGRAM held out`);

// ---------------------------------------------------------------- is the inverse even a function?
/**
 * JORDAN & RUMELHART'S OBJECTION, CHECKED BEFORE ANYTHING IS FITTED (rule 1). Direct inverse
 * learning regresses a command on an output, and if two different commands produce the same output
 * the regression averages them and the average need not be a valid inverse. The check: over the
 * diet, find pairs of windows of `y` that are CLOSE and ask how far apart their commands are. If
 * the target disagreement at small window distance is large, the inverse is not a function of this
 * input and no amount of fitting will make it one — which is `consist.mjs`'s own instrument
 * pointed at a different pair of signals.
 */
{
  const W = 24, N = 2000, rows = [];
  for (const r of RUNS) {
    for (let t = 0; t < N; t++) {
      const k = W + Math.floor(rnd() * (P - 2 * W - 2));
      const w = new Float64Array(2 * W + 1);
      for (let j = -W; j <= W; j++) w[j + W] = r.y[k + j] - r.y[k];
      rows.push({ w, t: r.c[k] - r.y[k] });
    }
  }
  const nrm = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };
  const tS = Math.sqrt(rows.reduce((s, r) => s + r.t * r.t, 0) / rows.length);
  const bins = [[0, 0.02], [0.02, 0.05], [0.05, 0.1], [0.1, 0.25]];
  const acc = bins.map(() => ({ n: 0, s: 0 }));
  let wS = 0, wn = 0;
  for (let t = 0; t < 40000; t++) {
    const a = rows[Math.floor(rnd() * rows.length)], b = rows[Math.floor(rnd() * rows.length)];
    const d = nrm(a.w, b.w); wS += d; wn++;
  }
  const wMean = wS / wn;
  for (let t = 0; t < 200000; t++) {
    const a = rows[Math.floor(rnd() * rows.length)], b = rows[Math.floor(rnd() * rows.length)];
    const d = nrm(a.w, b.w) / wMean;
    for (let bi = 0; bi < bins.length; bi++) {
      if (d >= bins[bi][0] && d < bins[bi][1]) { acc[bi].n++; acc[bi].s += (a.t - b.t) ** 2; break; }
    }
  }
  console.log(`\n  IS THE INVERSE A FUNCTION OF THIS INPUT? (Jordan & Rumelhart, checked first)`);
  console.log(`    window distance      target disagreement, as a fraction of the target's own rms`);
  for (let bi = 0; bi < bins.length; bi++) {
    const a = acc[bi];
    console.log(`    ${bins[bi][0].toFixed(2)}-${bins[bi][1].toFixed(2)}  (n ${String(a.n).padStart(6)})   `
      + `${a.n ? (Math.sqrt(a.s / a.n) / tS).toFixed(4) : '—'}`);
  }
  console.log(`    A disagreement that FALLS toward zero as the windows close is a function; one`);
  console.log(`    that flattens at a large value is an inverse this input cannot express, and no`);
  console.log(`    fit will make it one. R² is bounded by 1 - (that fraction)².\n`);
}

// ---------------------------------------------------------------- fit the direct inverse
/** The shipped window shape: geometric offsets straddling NOW, because §49.14 measured causal-only
 *  at 0.89x against 1.43x for the same taps translated across now — and an INVERSE is the case
 *  where that is not a preference but arithmetic: to be somewhere you must command before. */
const REACH = +(process.env.REACH || 96);
const TAPS = +(process.env.TAPS || 15);
const OFFS = [];
for (let i = 0; i < TAPS; i++) {
  const t = (i / (TAPS - 1)) * 2 - 1;
  OFFS.push(Math.round(Math.sign(t) * REACH * t * t));
}
const UNIQ = [...new Set(OFFS)].sort((a, b) => a - b);
console.log(`  window ±${REACH} raw steps, ${UNIQ.length} offsets straddling NOW: `
  + `${UNIQ.slice(0, 4).join(',')} … ${UNIQ.slice(-3).join(',')}`);

let pol = new DistilPolicy({
  channels: 1, refDim: 1, offsets: UNIQ, ridge: RIDGE,
  uMax: 0.05, online: false, standardize: true,
});
for (const r of RUNS) {
  const prefix = new Array(P);
  for (let k = 0; k < P; k++) prefix[k] = [r.c[k] - r.y[k]];
  pol.addProgram({ refAt: (k) => [r.y[Math.max(0, Math.min(P - 1, k))]], n: P, prefix, stride: 1 });
}
const rep = pol.fit();
console.log(`  the FIT: ${rep.rows} rows / ${rep.features} features, held-out R² `
  + `${rep.heldOutR2.map((v) => v.toFixed(4))}, null ${rep.controlR2.map((v) => v.toFixed(4))}, `
  + `deploy ${rep.deploy}`);
if (!rep.deploy) console.log(`    REFUSED: ${rep.reason}`);

// ---------------------------------------------------------------- deploy on the held-out program
/** `c = r + f(r)`: the DESIRED trajectory goes into the slot the ACHIEVED one occupied at
 *  commissioning. Nothing reads the tracker. */
/**
 * `g` scales the applied correction — §79's applied-gain axis, which costs ONE SCORED RUN and no
 * refit because the gain folds into the weights. It is here as a BISECTION and not as a tuning
 * knob: if the map is the right SHAPE at the wrong SCALE, some g delivers and the fault is the
 * fit's conditioning; if every g is at or below 1.00x, the shape itself is wrong and no scale
 * repairs it (rule 9 — both halves).
 *
 * `src` is what the map is handed at deploy. The shipped routing is `PR.q`, the DESIRED
 * trajectory, which is the whole proposal. Passing the ACHIEVED trajectory of a bare run instead
 * separates the two candidate faults: the map's INPUT distribution (fitted on achieved `y`,
 * deployed on desired `r`, and those differ by exactly the error being corrected) from the map
 * itself. A map that delivers on achieved and fails on desired is a DISTRIBUTION fault and is
 * repairable by iterating; one that fails on both is not.
 */
function score(active, g = 1, src = null, ref = null, P2 = null) {
  const R = ref || PR.q, Q = P2 || P;
  const m = makeMachine(R[0], 0);
  const inp = src || R;
  let s = 0, n = 0, uPk = 0;
  const LAPS = 6;
  for (let k = 0; k < LAPS * Q; k++) {
    const i = k % Q;
    const u = active ? g * pol.actLook((o) => [inp[(((i + o) % Q) + Q) % Q]], null)[0] : 0;
    uPk = Math.max(uPk, Math.abs(u));
    const e = m.q - R[i];
    if (k >= (LAPS - 4) * Q) { s += e * e; n++; }
    m.step(R[i] + u);
  }
  return { rms: 1000 * Math.sqrt(s / n), uPk: 1000 * uPk };
}

/** The bare machine's ACHIEVED trajectory over one settled lap of the program. */
function bareAchieved() {
  const m = makeMachine(PR.q[0], 0);
  const y = new Float64Array(P);
  for (let k = 0; k < 6 * P; k++) {
    const i = k % P;
    if (k >= 5 * P) y[i] = m.q;
    m.step(PR.q[i]);
  }
  return y;
}
const off = score(false), on = score(true);
console.log(`\n  ON THE PROGRAM, WHICH IS IN NO TRAINING RUN`);
console.log(`    bare machine            ${off.rms.toFixed(4)} mm rms`);
console.log(`    direct inverse          ${on.rms.toFixed(4)} mm rms   `
  + `${(off.rms / on.rms).toFixed(3)}x   uPk ${on.uPk.toFixed(3)} mm`);

// ---------------------------------------------------------------- THE BISECTION (rule 1, rule 9)
// Two candidate faults and one run each. Neither is a knob to tune: both exist to say WHICH of the
// two the 0.9953 fit's failure is, and the answer decides whether this routing is repairable.
console.log(`\n  BISECTION A — is it the SCALE? (§79's gain axis, no refit)`);
let bestG = null;
for (const g of [0.02, 0.05, 0.1, 0.25, 0.5, 1]) {
  const r = score(true, g);
  const x = off.rms / r.rms;
  if (!bestG || x > bestG.x) bestG = { g, x, rms: r.rms };
  console.log(`    gain ${String(g).padStart(5)}   ${r.rms.toFixed(4)} mm   ${x.toFixed(3)}x`);
}
console.log(`    best ${bestG.x.toFixed(3)}x at gain ${bestG.g}`
  + (bestG.x > 1.05 ? '  — the SHAPE is right and the SCALE is wrong'
                    : '  — no scale delivers, so the shape itself is wrong'));

console.log(`\n  BISECTION B — is it the INPUT the map is handed at deploy?`);
const yb = bareAchieved();
let dev = 0, rr = 0;
for (let i = 0; i < P; i++) { dev += (yb[i] - PR.q[i]) ** 2; rr += PR.q[i] ** 2; }
console.log(`    the achieved trajectory differs from the desired by `
  + `${(1000 * Math.sqrt(dev / P)).toFixed(4)} mm rms, which IS the error being corrected`);
for (const g of [bestG.g, 1]) {
  const r = score(true, g, yb);
  console.log(`    on ACHIEVED input, gain ${String(g).padStart(5)}   ${r.rms.toFixed(4)} mm   `
    + `${(off.rms / r.rms).toFixed(3)}x`);
}
console.log(`    a map that delivers on ACHIEVED and fails on DESIRED is a DISTRIBUTION fault;`);
console.log(`    one that fails on both is the map.`);

// ---------------------------------------------------------------- WHERE THE 0.9953 GOES
// Both bisections came back negative, so the map is wrong while fitting its own target at 0.9953.
// That is rule 16 — the fit and the machine disagree — and it has exactly one cheap resolution.
//
// The PROGRAM supplies its own labelled row, free and with no teacher in it: the bare machine was
// commanded `PR.q` and achieved `yb`, so on the program the TRUE target is `PR.q[i] - yb[i]`,
// the identical quantity the fit was trained on. Scoring the map against it says whether the fit
// TRANSFERS from the scribble diet to the program — and the fit's own held-out folds cannot,
// because they are other scribbles.
console.log(`\n  DOES THE 0.9953 TRANSFER TO THE PROGRAM? (the program's own labelled row, no teacher)`);
{
  let se = 0, st = 0, mt = 0, sp = 0, spk = 0;
  for (let i = 0; i < P; i++) mt += (PR.q[i] - yb[i]);
  mt /= P;
  for (let i = 0; i < P; i++) {
    const t = PR.q[i] - yb[i];
    const f = pol.actLook((o) => [yb[(((i + o) % P) + P) % P]], null)[0];
    se += (t - f) ** 2; st += (t - mt) ** 2; sp += f * f;
    spk = Math.max(spk, Math.abs(f));
  }
  const r2 = 1 - se / st;
  console.log(`    the target's own rms      ${(1000 * Math.sqrt(st / P)).toFixed(4)} mm`);
  console.log(`    what the map applies      ${(1000 * Math.sqrt(sp / P)).toFixed(4)} mm rms, `
    + `peak ${(1000 * spk).toFixed(4)} mm`);
  console.log(`    R² on the PROGRAM         ${r2.toFixed(4)}   `
    + `against ${(0.9953).toFixed(4)} held out WITHIN the diet`);
  console.log(r2 > 0.9
    ? `    the fit TRANSFERS, so the failure is downstream of the map (rule 16 again)`
    : `    the fit DOES NOT TRANSFER: 0.9953 within the diet and ${r2.toFixed(3)} on the program,`);
  if (r2 <= 0.9) {
    console.log(`    so the held-out folds were measuring the diet and not the routing — every`);
    console.log(`    scribble is the same KIND of signal, and rule 36's memory arrives as a fold`);
    console.log(`    split that cannot separate them (rule 15: two wrongs that agree).`);
  }
}


// ---------------------------------------------------------------- C: IS THE ROUTING SOUND AT ALL?
/**
 * The two bisections and the transfer number together say the map is wrong on the PROGRAM while
 * being right on the DIET. That has two readings and they are not the same product: the ROUTING is
 * broken (a direct inverse cannot control this plant however it is trained), or the DIET is too far
 * from the program (§52.17 and §66, on two plants sharing no physics — what bounds a
 * program-agnostic feedforward is how far the diet is from the program it will run).
 *
 * One run separates them: score the SAME map on a SEVENTH SCRIBBLE, drawn from the same generator
 * and in NO training run. If it delivers there, the routing works and the fault is the diet's
 * distance — which is a diet to fix. If it fails there too, the routing itself does not control
 * this plant and no diet repairs it.
 */
console.log(`\n  C — THE SAME MAP ON A HELD-OUT SCRIBBLE (same class as the diet, in no training run)`);
const held = scribble(P);
{
  const o = score(false, 1, null, held), a = score(true, 1, null, held);
  console.log(`    bare                    ${o.rms.toFixed(4)} mm rms`);
  console.log(`    direct inverse          ${a.rms.toFixed(4)} mm rms   ${(o.rms / a.rms).toFixed(3)}x`);
  // RULE 17 BEFORE THE VERDICT. This reading is only worth something if the held-out scribble
  // is as HARD as the program, and it is not: the diet was sized from the program's peak |v| and
  // |a| (rule 41b, correctly) but two-pole smoothing means the realised trajectory never holds
  // either, so the diet's own bare error is a fraction of the program's. A map scored where there
  // is nine times less to correct cannot be read as "the routing fails".
  const hard = o.rms / off.rms;
  console.log(`    the diet's bare error is ${(100 * hard).toFixed(1)}% of the program's, `
    + `so this row is ${hard < 0.5 ? 'CONFOUNDED — the diet never visits the regime being corrected'
                                   : 'comparable in difficulty'}`);
  if (hard >= 0.5) {
    console.log(o.rms / a.rms > 1.3
      ? `    THE ROUTING WORKS and the failure on the program is the DIET's distance from it.`
      : `    the routing fails on its OWN class too, so no diet repairs it.`);
  } else {
    console.log(`    so D below — a diet of the program's OWN CLASS, which reaches the program's`);
    console.log(`    own error by construction — is what decides it (rule 17: the instrument`);
    console.log(`    fails before the model).`);
  }
}

// ---------------------------------------------------------------- D: THE PROGRAM'S OWN CLASS
/**
 * §66 took the barrel from 0.85x to 10.6x by nothing but a diet of THIS MACHINE'S OWN profiles in
 * orders production never runs, and §52.17 measured the same bound on the arm. If C says the
 * routing works, this is the test that says whether the diet is the whole of it here: build the
 * diet from the program's OWN class — bang-bang acceleration trapezoids like `program()` — with
 * the run lengths and accelerations PERTURBED so the scored program is in no training run, and
 * refit the identical map with nothing else moved.
 */
function trapezoid(rnd2) {
  const runs = PRUNS.map((L) => Math.max(1, Math.round(L * (0.7 + 0.6 * rnd2()))));
  const accs = ACC.map((A) => A * (0.75 + 0.5 * rnd2()) * (A < 0 ? 1 : 1));
  const n = runs.reduce((x, y) => x + y, 0);
  const a = new Float64Array(n), q = new Float64Array(n);
  let i = 0, ai = 0, on = true;
  for (const L of runs) { const v = on ? (accs[ai++ % accs.length]) : 0; for (let j = 0; j < L; j++) a[i++] = v; on = !on; }
  let x = PR.q[0], vv = V0 * (0.8 + 0.4 * rnd2());
  for (let k = 0; k < n; k++) { vv += a[k] * DT; x += vv * DT; q[k] = Math.max(0.02, Math.min(0.25, x)); }
  return q;
}
console.log(`\n  D — THE DIET IS THE PROGRAM'S OWN CLASS (bang-bang trapezoids, the program held out)`);
{
  const r2 = lcg(SEED * 7919 + 13);
  const pol2 = new DistilPolicy({
    channels: 1, refDim: 1, offsets: UNIQ, ridge: RIDGE,
    uMax: 0.05, online: false, standardize: true,
  });
  let ds = 0, dn = 0;
  for (let i = 0; i < SCRIB; i++) {
    const c = trapezoid(r2), y = drive(c), n = c.length;
    const prefix = new Array(n);
    for (let k = 0; k < n; k++) { prefix[k] = [c[k] - y[k]]; ds += (c[k] - y[k]) ** 2; dn++; }
    pol2.addProgram({ refAt: (k) => [y[Math.max(0, Math.min(n - 1, k))]], n, prefix, stride: 1 });
  }
  const dietHard = 1000 * Math.sqrt(ds / dn) / off.rms;
  const fr = pol2.fit();
  console.log(`    the diet's own bare error, as a fraction of the program's: `
    + `${(100 * dietHard).toFixed(1)}%`);
  const keep = pol;
  // eslint-disable-next-line no-global-assign
  pol = pol2;
  const a = score(true, 1);
  let se = 0, st = 0, mt = 0;
  for (let i = 0; i < P; i++) mt += PR.q[i] - yb[i]; mt /= P;
  for (let i = 0; i < P; i++) {
    const t = PR.q[i] - yb[i];
    const f = pol2.actLook((o) => [yb[(((i + o) % P) + P) % P]], null)[0];
    se += (t - f) ** 2; st += (t - mt) ** 2;
  }
  console.log(`    the FIT: ${fr.rows} rows, held-out R² `
    + `${fr.heldOutR2.map((z) => z.toFixed(4))}, null ${fr.controlR2.map((z) => z.toFixed(4))}, `
    + `deploy ${fr.deploy}`);
  console.log(`    R² on the PROGRAM       ${(1 - se / st).toFixed(4)}   (the scribble diet read 0.8584)`);
  console.log(`    direct inverse          ${a.rms.toFixed(4)} mm rms   ${(off.rms / a.rms).toFixed(3)}x`
    + `   (the scribble diet read 2.658x)`);
  pol = keep;
}


// ---------------------------------------------------------------- E: WHY THE 0.99 IS WORTHLESS
/**
 * THE MECHANISM, WITH A FALSIFIER RATHER THAN AN ARGUMENT (rule 59, written down before the run).
 *
 * The map fits `c[k] - y[k]` at R² 0.93-0.995 in its own diet and reads NEGATIVE on the program
 * under BOTH diets, including one at 98% of the program's own difficulty. A fit that good which
 * transfers that badly is not learning an inverse — it is reading the ANSWER out of the machine's
 * own response. The window STRADDLES now, so it sees `y[k+1..k+96]`, and those samples are what
 * the command `c[k]` DROVE THE MACHINE TO. Recovering `c[k]` from the future of `y` is nearly
 * exact and completely non-transferable, because at deploy the future of `r` is a DESIRED
 * trajectory and not the machine's response to anything.
 *
 * If that is the mechanism, shrinking the FORWARD reach must RAISE the program's R² while
 * LOWERING the in-diet one — the two moving in opposite directions is the signature, and no other
 * account predicts it. If both fall together it is ordinary capacity and the mechanism is wrong.
 *
 * Note what this would mean if it holds: §49.14 measured the straddling window as load-bearing for
 * the SHIPPED routing (0.89x causal against 1.43x straddling) and `distil.js` REFUSES a causal
 * window at construction because of it. The two routings would then want opposite windows — which
 * is why the forward reach is shrunk to 1 rather than to 0 here, the guard being correct for the
 * routing it was measured on.
 */
console.log(`\n  E — IS THE FIT READING THE MACHINE'S OWN RESPONSE OUT OF THE FUTURE OF y?`);
console.log(`    back reach held at ${REACH}; the FORWARD reach shrinks. If the mechanism is right,`);
console.log(`    in-diet R² FALLS and program R² RISES — opposite directions (rule 59).`);
{
  const r3 = lcg(SEED * 7919 + 13);
  const diet = [];
  for (let i = 0; i < SCRIB; i++) { const c = trapezoid(r3); diet.push({ c, y: drive(c), n: c.length }); }
  console.log(`\n    fwd   in-diet R²   program R²   delivered`);
  for (const fwd of [96, 48, 16, 4, 1]) {
    const back = [], fwdo = [];
    for (let i = 0; i < 8; i++) { const t = (i + 1) / 8; back.push(-Math.round(REACH * t * t)); }
    for (let i = 0; i < 6; i++) { const t = (i + 1) / 6; fwdo.push(Math.round(fwd * t * t)); }
    const offs = [...new Set([...back, 0, ...fwdo.filter((z) => z > 0)])].sort((a, b) => a - b);
    if (offs[offs.length - 1] <= 0) continue;
    const pe = new DistilPolicy({
      channels: 1, refDim: 1, offsets: offs, ridge: RIDGE,
      uMax: 0.05, online: false, standardize: true,
    });
    for (const d of diet) {
      const pre = new Array(d.n);
      for (let k = 0; k < d.n; k++) pre[k] = [d.c[k] - d.y[k]];
      pe.addProgram({ refAt: (k) => [d.y[Math.max(0, Math.min(d.n - 1, k))]], n: d.n, prefix: pre, stride: 1 });
    }
    const fr = pe.fit();
    let se = 0, st = 0, mt = 0;
    for (let i = 0; i < P; i++) mt += PR.q[i] - yb[i]; mt /= P;
    for (let i = 0; i < P; i++) {
      const t = PR.q[i] - yb[i];
      const f = pe.actLook((o) => [yb[(((i + o) % P) + P) % P]], null)[0];
      se += (t - f) ** 2; st += (t - mt) ** 2;
    }
    const keep = pol; pol = pe;
    const a = score(true, 1);
    pol = keep;
    console.log(`    ${String(fwd).padStart(3)}   ${fr.heldOutR2[0].toFixed(4).padStart(9)}   `
      + `${(1 - se / st).toFixed(4).padStart(9)}   ${(off.rms / a.rms).toFixed(3)}x`
      + `   rows ${fr.rows} feat ${fr.features} deploy ${fr.deploy}`
      + `${fr.deploy ? '' : '  REFUSED: ' + fr.reason}   offs ${offs.join(',')}`);
  }
}


// ---------------------------------------------------------------- F: THE CHECK, POINTED PROPERLY
/**
 * FOUR CAUSES ARE DEAD AND ONE INVARIANT IS LEFT, SO THE CHECK THAT PASSED IS THE SUSPECT.
 *
 * Scale, input distribution, diet distance and the forward window are all measured and none of
 * them is it. What survives every one of them is R² ≈ -1.0 on the program with an applied rms of
 * 0.79 mm against a target of 0.58 — and R² = -1 at matched magnitude is the arithmetic signature
 * of an output UNCORRELATED with the target. A fit at 0.93 producing an uncorrelated output is
 * Jordan & Rumelhart's objection, which this file checked FIRST and recorded as passing.
 *
 * It passed because it was asked the wrong question. It binned window distance against target
 * disagreement WITHIN THE DIET, and within the diet the map works. The question that decides this
 * routing is whether a window of the PROGRAM lands near any window of the DIET at all, and what
 * the diet says the command should be there. Same instrument, same bins, one signal changed —
 * which is `consist.mjs`'s own cross-program column, arriving on the pair of signals this routing
 * actually deploys on.
 */
console.log(`\n  F — THE NON-UNIQUENESS CHECK, ACROSS THE DIET→PROGRAM BOUNDARY (not within the diet)`);
{
  const r4 = lcg(SEED * 104729 + 7);
  const W = 24;
  const dietRows = [], progRows = [];
  const push = (arr, c, y, n) => {
    for (let t = 0; t < 3000; t++) {
      const k = W + Math.floor(r4() * (n - 2 * W - 2));
      const w = new Float64Array(2 * W + 1);
      for (let j = -W; j <= W; j++) w[j + W] = y[k + j] - y[k];
      arr.push({ w, t: c[k] - y[k] });
    }
  };
  const r5 = lcg(SEED * 7919 + 13);
  for (let i = 0; i < SCRIB; i++) { const c = trapezoid(r5); push(dietRows, c, drive(c), c.length); }
  push(progRows, PR.q, yb, P);

  const nrm = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };
  const tS = Math.sqrt(progRows.reduce((s, r) => s + r.t * r.t, 0) / progRows.length);
  // The same scale the within-diet check used, so the two tables are comparable (rule 19).
  let wS = 0;
  for (let t = 0; t < 40000; t++) {
    wS += nrm(dietRows[Math.floor(r4() * dietRows.length)].w,
              dietRows[Math.floor(r4() * dietRows.length)].w);
  }
  const wMean = wS / 40000;

  // For each PROGRAM window, its NEAREST diet window — which is what the map actually consults.
  let near = 0, agree = 0, cnt = 0, worst = 0;
  for (let t = 0; t < 400; t++) {
    const a = progRows[Math.floor(r4() * progRows.length)];
    let bd = Infinity, bt = 0;
    for (let i = 0; i < dietRows.length; i += 3) {
      const d = nrm(a.w, dietRows[i].w);
      if (d < bd) { bd = d; bt = dietRows[i].t; }
    }
    near += bd / wMean; agree += (a.t - bt) ** 2; cnt++;
    worst = Math.max(worst, bd / wMean);
  }
  const dAvg = near / cnt, disag = Math.sqrt(agree / cnt) / tS;
  console.log(`    for each PROGRAM window, the NEAREST window in the diet:`);
  console.log(`      mean distance              ${dAvg.toFixed(4)}  (worst ${worst.toFixed(4)})`);
  console.log(`      its command disagrees by   ${disag.toFixed(4)} of the target's own rms`);
  console.log(`    the within-diet table read 0.0317 at distance 0.00-0.02 and 0.0965 at 0.05-0.10.`);
  console.log(disag > 0.5
    ? `    SO THE INVERSE IS A FUNCTION WITHIN A CLASS OF TRAJECTORY AND NOT ACROSS CLASSES:\n`
      + `    the diet's nearest window carries a command ${disag.toFixed(2)}x the target's own rms away\n`
      + `    from the right one, which BOUNDS R² at ${(1 - disag * disag).toFixed(3)} on the program\n`
      + `    before any fit — and the measured -1.0 is at that bound. Jordan & Rumelhart's\n`
      + `    objection, which the within-diet check could not see because within the diet the\n`
      + `    map works (rule 15: two wrongs that agree; rule 19: match the metric's support).`
    : `    the diet DOES carry the program's answer nearby, so non-uniqueness is not the cause\n`
      + `    and the failure is downstream of the data.`);
}


// ---------------------------------------------------------------- G: IT IS THE FUNCTION CLASS
/**
 * F SAYS THE DATA CARRIES THE ANSWER AND THE LINEAR MAP THROWS IT AWAY, SO ASK A LOCAL ONE.
 *
 * Five causes are dead — scale, input distribution, diet distance, forward window, non-uniqueness
 * — and F bounds R² on the program at 1 - 0.046² = 0.998 from the DATA, before any fit. The linear
 * map reads -1.0 against that bound. The one thing left standing between them is the FUNCTION
 * CLASS, and `nonlinear.mjs` is this project's instrument for exactly that question.
 *
 * It matters which way this goes, and the two outcomes are opposite in what they say:
 *
 *   IT DELIVERS   the direct inverse is real on this plant and the shipped LINEAR artefact cannot
 *                 carry it — which INVERTS §54.9, where ridge beat kernel ridge, locally weighted,
 *                 an MLP and kNN on the teacher routing. Under that routing the linear map sits at
 *                 the information ceiling; under this one it would be the only thing in the way.
 *                 The cost is that a local model is the whole diet at runtime, not 40 coefficients.
 *   IT FAILS      the bound is an artefact of scoring a nearest neighbour on windows of the
 *                 ACHIEVED trajectory, which is not what deploy hands it — so F is measuring the
 *                 record and not the routing, and the whole route is closed.
 *
 * Deployed the same way everything else here is: `c = r + f(r)`, on the machine, scored over the
 * last four of six laps. The neighbour is searched over windows of the DESIRED trajectory at
 * deploy and of the ACHIEVED one in the diet, which is the routing's whole claim.
 */
console.log(`\n  G — THE SAME DATA, A LOCAL MODEL INSTEAD OF A LINEAR ONE (§54.9's instrument)`);
const W = 24, STR = 4;
/** A bank of (window of ACHIEVED y, command offset) pairs from a list of driven trajectories. */
function bankFrom(cs) {
  const bank = [];
  for (const c of cs) {
    const y = drive(c), n = c.length;
    for (let k = W; k < n - W - 1; k += STR) {
      const w = new Float64Array(2 * W + 1);
      for (let j = -W; j <= W; j++) w[j + W] = y[k + j] - y[k];
      bank.push({ w, t: c[k] - y[k] });
    }
  }
  return bank;
}
function localRun(bank, label) {

  /** K-nearest over the shape-normalised window, inverse-distance weighted. */
  const K = 8;
  const predict = (w) => {
    const best = [];
    for (let i = 0; i < bank.length; i++) {
      let d = 0; const b = bank[i].w;
      for (let j = 0; j < w.length; j++) { const e = w[j] - b[j]; d += e * e; }
      if (best.length < K) { best.push({ d, t: bank[i].t }); best.sort((x, y2) => x.d - y2.d); }
      else if (d < best[K - 1].d) { best[K - 1] = { d, t: bank[i].t }; best.sort((x, y2) => x.d - y2.d); }
    }
    let sw = 0, st2 = 0;
    for (const b of best) { const g = 1 / (Math.sqrt(b.d) + 1e-12); sw += g; st2 += g * b.t; }
    return st2 / sw;
  };

  // Precompute the correction over one lap of the DESIRED trajectory — it is a pure function of
  // the program, so it is the same every lap, exactly as the linear map's is.
  const uK = new Float64Array(P);
  for (let i = 0; i < P; i++) {
    const w = new Float64Array(2 * W + 1);
    const c0 = PR.q[i];
    for (let j = -W; j <= W; j++) w[j + W] = PR.q[(((i + j) % P) + P) % P] - c0;
    uK[i] = predict(w);
  }
  // R² against the program's own labelled target, the identical comparison the linear map got.
  let se = 0, st = 0, mt = 0, sp = 0;
  for (let i = 0; i < P; i++) mt += PR.q[i] - yb[i]; mt /= P;
  for (let i = 0; i < P; i++) {
    const t = PR.q[i] - yb[i];
    se += (t - uK[i]) ** 2; st += (t - mt) ** 2; sp += uK[i] * uK[i];
  }
  console.log(`    ${label}`);
  console.log(`      bank ${bank.length} windows x ${2 * W + 1} taps`);
  console.log(`      R² on the PROGRAM     ${(1 - se / st).toFixed(4)}   `
    + `(the linear map read 0.9671 — §99; it read -1.0172 through a broken reader)`);
  console.log(`      applies               ${(1000 * Math.sqrt(sp / P)).toFixed(4)} mm rms `
    + `against a target of ${(1000 * Math.sqrt(st / P)).toFixed(4)}`);

  // On the machine, the same six-lap score everything else here is quoted on.
  const UCAP = 0.05;
  const m = makeMachine(PR.q[0], 0);
  let s2 = 0, n2 = 0, uPk = 0;
  for (let k = 0; k < 6 * P; k++) {
    const i = k % P;
    const u = Math.max(-UCAP, Math.min(UCAP, uK[i]));
    uPk = Math.max(uPk, Math.abs(u));
    const e = m.q - PR.q[i];
    if (k >= 2 * P) { s2 += e * e; n2++; }
    m.step(PR.q[i] + u);
  }
  const rms = 1000 * Math.sqrt(s2 / n2);
  console.log(`      ON THE MACHINE        ${rms.toFixed(4)} mm rms   `
    + `${(off.rms / rms).toFixed(3)}x   uPk ${(1000 * uPk).toFixed(3)} mm`);
  return off.rms / rms;
}

// The two banks. The trapezoid one shares the program's CLASS, which is §66's own diet design and
// is what the program is held out OF rather than held out FROM — so the SCRIBBLE bank is the
// control that says whether the class is doing the work (rule 21: the thing that should not
// change must come back unchanged, and here it is allowed to change, which is the finding).
{
  const r6 = lcg(SEED * 7919 + 13);
  const traps = []; for (let i = 0; i < SCRIB; i++) traps.push(trapezoid(r6));
  const xT = localRun(bankFrom(traps), 'bank = the program\'s OWN CLASS (trapezoids)');
  const xS = localRun(bankFrom(RUNS.map((r) => r.c)), 'bank = the SCRIBBLE diet (a different class) — the CONTROL');
  console.log(`\n    the diet is worth ${(xT / xS).toFixed(2)}x. READ IT NARROWLY (rule 19): the`);
  console.log(`    scribble bank does not make a WRONG correction, it makes almost NO correction`);
  console.log(`    — 0.05 mm applied against a 0.58 mm target — which is the signature of a`);
  console.log(`    neighbour search finding only windows that carry small commands. That diet is`);
  console.log(`    10.7% as hard as the program (test C), so CLASS and MAGNITUDE are confounded`);
  console.log(`    here exactly as they were there. What is established is that a diet nine times`);
  console.log(`    too gentle buys nothing; that a diet must share the program's CLASS is NOT.`);

  // TARGET 6 IS UNCONDITIONAL, so the bill is stated where the result is (rule 27).
  const nb = bankFrom(traps).length;
  const mac = nb * (2 * W + 1);
  console.log(`\n    WHAT IT COSTS: ${nb} windows x ${2 * W + 1} taps = `
    + `${(mac / 1000).toFixed(0)}k MAC/decision, ${(nb * (2 * W + 2) * 4 / 1024).toFixed(0)} kB`);
  console.log(`      against a 10,000-MAC budget that is ${(mac / 10000).toFixed(0)}x over, and the`);
  console.log(`      deployed object is 78 MAC and 0.2 kB. THE ROUTING DELIVERS AND THIS ARTEFACT`);
  console.log(`      CANNOT SHIP — which is a different sentence from the one the linear map gave.`);
}


// ---------------------------------------------------------------- H: CAN THE FREE TEACHER SHIP?
/**
 * G LEAVES ONE QUESTION AND IT IS THE ONLY ONE THAT MATTERS COMMERCIALLY (plan §94).
 *
 * The local model delivers 22.599x with no teacher, no cascade, no lap index and no iteration —
 * and it is 430k MAC/decision in 1.7 MB, which target 6 forbids outright. This project's entire
 * distillation machinery exists to turn a teacher into a 78-MAC weight vector, and it has never
 * been pointed at a teacher that costs NO PLANT TIME.
 *
 * **AND THE DISTILLATION SET IS FREE TOO, WHICH IS THE PART THAT MAKES THIS DIFFERENT FROM EVERY
 * OTHER DISTILLATION HERE.** Every teacher in this project must be CONVERGED ON THE MACHINE for
 * each training program, so enlarging the diet costs laps (§84.5 prices it at 10-17% of a
 * commissioning per program). This teacher's input is a window of the COMMANDED REFERENCE, so it
 * can be evaluated on ANY reference at all with the machine switched off. The distillation set is
 * as large and as diverse as we care to make it, at zero cost, which is exactly the lever §52.17
 * and §66 identify as what bounds a program-agnostic feedforward.
 *
 * ---------------------------------------------------------------- THE PREDICTION, FIRST (rule 59)
 *
 * I expect this to FAIL, and the evidence is already in hand: the linear map fits its own diet at
 * R² 0.9265 and transfers to the program at -1.017. **THAT SECOND NUMBER IS RETRACTED BY §99 — it
 * was the deploy reader and the transfer is +0.9671 — so the premise of this prediction was false
 * when it was written. The prediction is kept verbatim because the block below still REFUSES, and
 * an argument that reaches a true conclusion from a false premise is worth knowing about.** A map that is right locally and wrong globally
 * is a locally-valid LINEAR APPROXIMATION of a relation that is not linear — and no amount of
 * relabelling changes the function class. If that reading is right, the distilled linear map
 * reproduces its teacher where the diet is dense and diverges where it is not, and reads far below
 * 22.599x on the program.
 *
 * What would REFUTE it, and it is worth knowing either way: if the failure was DISTRIBUTION rather
 * than CLASS — the diet's windows never covering the program's — then labelling a wide, cheap
 * distillation set with a teacher that DOES transfer is precisely the repair, and this delivers.
 *
 * Two R² columns are printed because they answer different questions (rule 19): against the
 * TEACHER's output, which says whether the distillation succeeded as a distillation, and against
 * the TRUE target, which says whether that was worth anything.
 */
console.log(`\n  H — CAN THE FREE TEACHER BE DISTILLED ONTO WHAT SHIPS? (plan §94)`);
{
  const r7 = lcg(SEED * 7919 + 13);
  const bank = bankFrom(Array.from({ length: SCRIB }, () => trapezoid(r7)));
  const W = 24;
  const K = 8;
  const predict = (w) => {
    const best = [];
    for (let i = 0; i < bank.length; i++) {
      let d = 0; const b = bank[i].w;
      for (let j = 0; j < w.length; j++) { const e = w[j] - b[j]; d += e * e; }
      if (best.length < K) { best.push({ d, t: bank[i].t }); best.sort((x, y2) => x.d - y2.d); }
      else if (d < best[K - 1].d) { best[K - 1] = { d, t: bank[i].t }; best.sort((x, y2) => x.d - y2.d); }
    }
    let sw = 0, st2 = 0;
    for (const b of best) { const g = 1 / (Math.sqrt(b.d) + 1e-12); sw += g; st2 += g * b.t; }
    return st2 / sw;
  };

  // The distillation set: references the teacher is EVALUATED on, with the machine switched off.
  // They are drawn from the same design space and none of them is the scored program.
  const r8 = lcg(SEED * 31337 + 5);
  // EVERY STEP IS LABELLED, and the reason is a fault this harness already made: `addProgram`
  // iterates `for (i = lo + 1; i < n; i += stride)` with `lo = -offsets[0]`, so a strided label
  // set at k ≡ 0 (mod 4) is read at k ≡ 1 (mod 4) and EVERY row used carries target 0. The fit
  // duly read held-out R² 0.0000 and REFUSED, which is a fit that never happened rather than a
  // route that declined (rule 25). Labelling every step removes the alignment rather than
  // patching it, and the assertion below is the check whose absence let it through.
  const NDIS = 4;
  const pol3 = new DistilPolicy({
    channels: 1, refDim: 1, offsets: UNIQ, ridge: RIDGE,
    uMax: 0.05, online: false, standardize: true,
  });
  let labels = 0, tSum = 0, tSq = 0;
  for (let d = 0; d < NDIS; d++) {
    const rr = trapezoid(r8), n = rr.length;
    const prefix = new Array(n);
    for (let k = 0; k < n; k++) {
      const w = new Float64Array(2 * W + 1);
      const c0 = rr[k];
      for (let j = -W; j <= W; j++) w[j + W] = rr[(((k + j) % n) + n) % n] - c0;
      const t = predict(w);
      prefix[k] = [t]; labels++; tSum += t; tSq += t * t;
    }
    // `closed: true` because these references are played as closed laps by `score` and the
    // teacher labelled them through WRAPPED windows — §52.14's own lesson, which otherwise
    // drops the first 96 rows of every trajectory and deploys windows the fit never saw.
    pol3.addProgram({ refAt: (k) => [rr[(((k % n) + n) % n)]], n, prefix, stride: 1, closed: true });
  }
  const tVar = tSq / labels - (tSum / labels) ** 2;
  const fr = pol3.fit();
  // THE CHECK THAT WAS MISSING. A target with no variance, or a fit that used a different number
  // of rows than there are labels, is an instrument fault and not a result (rules 17, 25).
  if (!(tVar > 0)) throw new Error(`H: the distillation target has no variance (${tVar})`);
  if (Math.abs(fr.rows - labels) > labels * 0.02) {
    throw new Error(`H: the fit used ${fr.rows} rows against ${labels} labels — the stride and the `
      + `label set are misaligned, which is what made this read R² 0.0000 the first time`);
  }
  console.log(`    ${NDIS} reference trajectories labelled by the teacher with the MACHINE OFF:`);
  console.log(`      ${labels} labels (target rms ${(1000 * Math.sqrt(tSq / labels)).toFixed(4)} mm), `
    + `ZERO plant steps — the teacher is a lookup and its input is`);
  console.log(`      a window of the commanded reference, so the set costs nothing`);
  console.log(`    the FIT: ${fr.rows} rows, held-out R² ${fr.heldOutR2.map((z) => z.toFixed(4))}, `
    + `null ${fr.controlR2.map((z) => z.toFixed(4))}, deploy ${fr.deploy}`);

  // Both R² columns on the PROGRAM, against two different references (rule 19).
  let seT = 0, stT = 0, mT = 0, seY = 0, stY = 0, mY = 0;
  const tea = new Float64Array(P), mine = new Float64Array(P);
  for (let i = 0; i < P; i++) {
    const w = new Float64Array(2 * W + 1);
    const c0 = PR.q[i];
    for (let j = -W; j <= W; j++) w[j + W] = PR.q[(((i + j) % P) + P) % P] - c0;
    tea[i] = predict(w);
    mine[i] = pol3.actLook((o) => [PR.q[(((i + o) % P) + P) % P]], null)[0];
    mT += tea[i]; mY += PR.q[i] - yb[i];
  }
  mT /= P; mY /= P;
  for (let i = 0; i < P; i++) {
    seT += (tea[i] - mine[i]) ** 2; stT += (tea[i] - mT) ** 2;
    seY += ((PR.q[i] - yb[i]) - mine[i]) ** 2; stY += ((PR.q[i] - yb[i]) - mY) ** 2;
  }
  console.log(`    R² against its TEACHER on the program   ${(1 - seT / stT).toFixed(4)}   `
    + `(did the distillation succeed?)`);
  console.log(`    R² against the TRUE target              ${(1 - seY / stY).toFixed(4)}   `
    + `(the teacher itself reads 0.9966; the direct linear fit reads 0.9671 — §99)`);

  {
    // score() closes over `pol`, so swap it for this one run and put it back.
    const keep = pol; pol = pol3;
    const b = score(true, 1);
    pol = keep;
    console.log(`    ON THE MACHINE          ${b.rms.toFixed(4)} mm rms   `
      + `${(off.rms / b.rms).toFixed(3)}x   (teacher 22.599x · direct linear fit 5.510x — §99)`);
  }

  // -------------------------------------------------------------- THE LIFT, §94's OWN FALSIFIER
  /**
   * §94 CLOSES THE ROUTE FOR A LINEAR MAP OF THE RAW WINDOW AND NAMES EXACTLY ONE THING LEFT.
   *
   * The deployed artefact does not have to be linear in the raw window — a LIFTED basis is still
   * linear in parameters, still one weight vector, still `deploy.js`'s dot product, and costs MAC
   * rather than architecture. §54.9 measured lifts LOSING, but that belongs to the TEACHER
   * routing, which is the verdict §94 inverts, so its evidence does not carry here.
   *
   * The lift is the LIBRARY'S OWN and not a second copy (rule 61): `signOffsets` pushes
   * `sign(v)` and `|v|` at each named offset, which is `classic.js`'s basis and is exactly the
   * shape this plant's nonlinearity has — a 61-bin friction curve, a drive saturation and an
   * encoder quantisation, all of which switch on the SIGN of velocity where no window of
   * POSITIONS can recover a switch.
   *
   * THE BAR IS STATED FIRST (rule 59): held-out R² against the teacher's own labels. Below about
   * 0.9 the route is closed for good; above it the only remaining question is the MAC.
   */
  console.log(`\n    THE LIFT — §94's own falsifier, on the same free labels`);
  for (const nSign of [1, 5, 15]) {
    const so = [];
    for (let i = 0; i < nSign; i++) {
      so.push(UNIQ[Math.round((i / Math.max(1, nSign - 1)) * (UNIQ.length - 1))]);
    }
    const sq = [...new Set(so)];
    const pl = new DistilPolicy({
      channels: 1, refDim: 1, offsets: UNIQ, signOffsets: sq, ridge: RIDGE,
      uMax: 0.05, online: false, standardize: true,
    });
    const r9 = lcg(SEED * 31337 + 5);
    for (let d = 0; d < NDIS; d++) {
      const rr = trapezoid(r9), n = rr.length;
      const prefix = new Array(n);
      for (let k = 0; k < n; k++) {
        const w = new Float64Array(2 * W + 1);
        const c0 = rr[k];
        for (let j = -W; j <= W; j++) w[j + W] = rr[(((k + j) % n) + n) % n] - c0;
        prefix[k] = [predict(w)];
      }
      pl.addProgram({ refAt: (k) => [rr[(((k % n) + n) % n)]], n, prefix, stride: 1, closed: true });
    }
    const f2 = pl.fit();
    const keep2 = pol; pol = pl;
    const b2 = score(true, 1);
    pol = keep2;
    console.log(`      ${String(sq.length).padStart(2)} sign taps, ${f2.features} features   `
      + `held-out R² ${f2.heldOutR2[0].toFixed(4).padStart(8)}   deploy ${String(f2.deploy).padEnd(5)}   `
      + `${(off.rms / b2.rms).toFixed(3)}x on the machine`);
  }
  console.log(`    the raw window read -0.1142. Below ~0.9 the route is CLOSED for good; above it`);
  console.log(`    what remains is only how many MAC the lift costs (rule 59, stated first).`);
}


// ---------------------------------------------------------------- I: THE PLC-SHAPED LOCAL MODEL
/**
 * §94 WROTE "THE ROUTE IS CLOSED FOR GOOD" AND IT TESTED ONLY *GLOBAL* FORMS (plan §98).
 *
 * What delivers on this routing is a LOCAL model — R² 0.9966, 22.599x — and it was priced at 430k
 * MAC in 1.7 MB and abandoned. But a local model does not have to be an 8,769-window
 * nearest-neighbour search. A handful of LOCAL LINEAR MAPS with a cheap selector is the same
 * object in PLC shape: `R` weight vectors, two evaluated per decision with a blend, which is the
 * form `distil.js` already ships and costs order 40 MAC here. §94 tested global linear and global
 * lifted and wrote its verdict as though it had tested every linear-in-parameters form. That is
 * the gap, and this closes it.
 *
 * THE PRIOR EVIDENCE IS AGAINST AND IS STATED FIRST (rule 59). §51 measured PER-FEED BANDING on
 * the arm and found **blending beats switching (2.34x against 2.14x) and BOTH lose to the POOLED
 * map at 3.37x**, with the mechanism named: at one feed the band index is confounded with the
 * thing it indexes, so a band map restores the very confound the pooled map breaks. That is a
 * band on an EXTERNAL index. This bands on a SCALAR OF THE WINDOW ITSELF, which is what "local"
 * means and is not the same object — but the prior is close enough that it has to be beaten
 * rather than ignored.
 *
 * THE BAR, STATED BEFORE THE RUN: held-out R² on the PROGRAM, where the global linear map reads
 * -1.0172 (RETRACTED by §99: the reader; it reads 0.9671) and the local model reads 0.9966.
 * Above ~0.9 at under 10,000 MAC this is a rung worth
 * registering; below it, §94's verdict stands and the route really is closed.
 *
 * The selector is the window's own local VELOCITY, binned by quantile over the training rows,
 * because that is the scalar this plant's nonlinearity actually switches on — a friction curve, a
 * drive saturation and a quantiser all turn on the sign and size of v (rule 32: scale the
 * threshold to the quantity it acts on).
 */
console.log(`\n  I — A PLC-SHAPED LOCAL MODEL: R local linear maps, blended (plan §98)`);
{
  /** Ridge solve of a small normal system, Cholesky. Self-contained: this is an instrument. */
  const solve = (XtX, Xty, n, lam) => {
    const A = XtX.slice(); for (let i = 0; i < n; i++) A[i * n + i] += lam;
    const L = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let v = A[i * n + j];
        for (let k = 0; k < j; k++) v -= L[i * n + k] * L[j * n + k];
        if (i === j) { if (v <= 1e-300) return null; L[i * n + i] = Math.sqrt(v); }
        else L[i * n + j] = v / L[j * n + j];
      }
    }
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) { let v = Xty[i]; for (let k = 0; k < i; k++) v -= L[i * n + k] * y[k]; y[i] = v / L[i * n + i]; }
    const w = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let v = y[i]; for (let k = i + 1; k < n; k++) v -= L[k * n + i] * w[k]; w[i] = v / L[i * n + i]; }
    return w;
  };
  // The same window shape the global fit used, so only the FUNCTION CLASS moves (rule 20).
  const OF = UNIQ, NF = OF.length + 1;
  const rowOf = (get) => {
    const q0 = get(0), r = new Float64Array(NF);
    let i = 0; r[i++] = q0;
    for (const o of OF) { if (o === 0) continue; r[i++] = get(o) - q0; }
    r[NF - 1] = 1; return r;
  };
  const velOf = (get) => (get(1) - get(-1)) * 0.5;

  const r9 = lcg(SEED * 7919 + 13);
  const diet = [];
  for (let i = 0; i < SCRIB; i++) { const c = trapezoid(r9); diet.push({ c, y: drive(c), n: c.length }); }

  // Bin edges by QUANTILE of the training velocity, so every region carries rows (rule 32).
  const vs = [];
  for (const d of diet) for (let k = 1; k < d.n - 1; k++) vs.push(velOf((o) => d.y[Math.max(0, Math.min(d.n - 1, k + o))]));
  vs.sort((a, b) => a - b);

  console.log(`\n     R   feat   MAC/dec   held-out R² on the PROGRAM   on the machine`);
  // R = 1 IS THE MATCHED CONTROL AND WITHOUT IT THIS TABLE MEANS NOTHING (rules 15, 20).
  // The global figures it would be read against — 0.9671 fitted directly (§99; -1.0172 as first
  // measured, through a reader centred at 2i), 0.0020 lifted — come
  // from `DistilPolicy`, which standardises, carries sign taps and applies its own gate. This
  // section uses a self-contained ridge over a plainer row, so a difference between them could be
  // the ROW BUILDER rather than the locality. R = 1 is this file's own global fit: same builder,
  // same solver, same ridge, same scoring, only the region count moving.
  for (const R of [1, 2, 4, 8, 16]) {
    const edge = [];
    for (let i = 1; i < R; i++) edge.push(vs[Math.floor((i / R) * vs.length)]);
    const ctr = [];
    for (let i = 0; i < R; i++) ctr.push(vs[Math.floor(((i + 0.5) / R) * vs.length)]);
    // Blend between the two nearest centres — §51 measured blending beating switching.
    const mix = (v) => {
      let j = 0; while (j < R - 1 && v > ctr[j + 1]) j++;
      if (v <= ctr[0]) return [[0, 1]];
      if (v >= ctr[R - 1]) return [[R - 1, 1]];
      const t = (v - ctr[j]) / Math.max(1e-300, ctr[j + 1] - ctr[j]);
      return [[j, 1 - t], [j + 1, t]];
    };
    const XtX = Array.from({ length: R }, () => new Float64Array(NF * NF));
    const Xty = Array.from({ length: R }, () => new Float64Array(NF));
    let nrow = 0;
    for (const d of diet) {
      for (let k = 1; k < d.n - 1; k++) {
        const get = (o) => d.y[Math.max(0, Math.min(d.n - 1, k + o))];
        const row = rowOf(get), t = d.c[k] - d.y[k];
        for (const [j, wj] of mix(velOf(get))) {
          const A = XtX[j], b = Xty[j];
          for (let p2 = 0; p2 < NF; p2++) { const rp = row[p2] * wj; b[p2] += rp * t; for (let q = 0; q <= p2; q++) A[p2 * NF + q] += rp * row[q]; }
        }
        nrow++;
      }
    }
    for (let j = 0; j < R; j++) { const A = XtX[j]; for (let p2 = 0; p2 < NF; p2++) for (let q = p2 + 1; q < NF; q++) A[p2 * NF + q] = A[q * NF + p2]; }
    let tr = 0; for (let j = 0; j < R; j++) for (let p2 = 0; p2 < NF; p2++) tr += XtX[j][p2 * NF + p2];
    const lam = RIDGE * (tr / (R * NF));
    const W = []; let bad = false;
    for (let j = 0; j < R; j++) { const w = solve(XtX[j], Xty[j], NF, lam); if (!w) { bad = true; break; } W.push(w); }
    if (bad) { console.log(`    ${String(R).padStart(2)}   ${NF}   — singular`); continue; }

    const predict = (get) => {
      const row = rowOf(get); let s = 0;
      for (const [j, wj] of mix(velOf(get))) { const w = W[j]; let t = 0; for (let p2 = 0; p2 < NF; p2++) t += w[p2] * row[p2]; s += wj * t; }
      return s;
    };
    // R² on the PROGRAM against its own labelled target — the identical comparison §93 D/G made.
    let se = 0, st = 0, mt = 0;
    for (let i = 0; i < P; i++) mt += PR.q[i] - yb[i]; mt /= P;
    const uL = new Float64Array(P);
    for (let i = 0; i < P; i++) {
      const get = (o) => PR.q[(((i + o) % P) + P) % P];
      uL[i] = predict(get);
      const t = PR.q[i] - yb[i];
      se += (t - uL[i]) ** 2; st += (t - mt) ** 2;
    }
    // On the machine, six laps, last four scored — the same score every row here is quoted on.
    const UCAP = 0.05, m = makeMachine(PR.q[0], 0);
    let s2 = 0, n2 = 0;
    for (let k = 0; k < 6 * P; k++) {
      const i = k % P, u = Math.max(-UCAP, Math.min(UCAP, uL[i]));
      const e = m.q - PR.q[i];
      if (k >= 2 * P) { s2 += e * e; n2++; }
      m.step(PR.q[i] + u);
    }
    const rms = 1000 * Math.sqrt(s2 / n2);
    const mac = 2 * NF + (NF - 1) + 4;       // two maps blended, the row, the selector
    console.log(`    ${String(R).padStart(2)}   ${String(NF).padStart(4)}   ${String(mac).padStart(7)}`
      + `   ${(1 - se / st).toFixed(4).padStart(22)}   ${(off.rms / rms).toFixed(3)}x`);
  }
  console.log(`    global linear 0.9671 (§99) · global lifted 0.0020 · the LOCAL model 0.9966 at 430k MAC`);
  console.log(`    the bar (stated before the run): above ~0.9 under 10,000 MAC is a rung worth having.`);
}


// ---------------------------------------------------------------- J: THE RIDGE IS A REAL AXIS
/**
 * WHY THIS BLOCK EXISTS, AND WHAT IT NOW MEASURES (plan §98.1, then §99).
 *
 * It was built to test whether §94's closure was a RIDGE — rule 32, with precedent: §70's "the
 * 0.08x was the ridge, `1e-6`, the ARM's value, carried here and never re-derived", and
 * `headroom.mjs`, where a ridge 3e-8 of the diagonal it regularised "read as a transfer failure at
 * R² -13273". Swept over seven decades it never recovered from -1.017, so the ridge was recorded
 * as refuted and §98's discrepancy left open.
 *
 * **§99 FOUND THE ACTUAL CAUSE — the deploy READER, centred at 2i (section L) — AND THIS TABLE
 * BECAME SOMETHING ELSE.** With the window read where it belongs, the ridge is not inert: it is
 * worth a factor of 2.5x, 5.510x at the default `1e-6` to **13.688x at ridge 1**, with an interior
 * optimum and a collapse past it. So §98.1's verdict stands as an account of the -1.017 (no ridge
 * repaired it, because no ridge could) and is wrong as a statement about the axis.
 *
 * AND THE SHAPE IS THE FINDING, because it is not selected: in-diet held-out R² falls
 * MONOTONICALLY (0.9265 → 0.8266) while R² on the PROGRAM rises (0.9671 → 0.9946). The fit's own
 * gate ranks this axis BACKWARDS — §49's law on a ninth knob, and `distil.js`'s stated "the gate is
 * a cheap PRE-FILTER and the decision is a machine-scored verify" with a number on it for the third
 * time. Read the delivered column NARROWLY (rule 19): ridge 1 is picked by scoring the program it
 * is quoted on, so 13.688x is a measurement of the AXIS and not a claim about the controller. The
 * claimable number is 5.510x, the default, with nothing selected.
 */
console.log(`\n  J — THE RIDGE LADDER ON THIS ROUTING (plan §98.1, re-read by §99)`);
{
  const r10 = lcg(SEED * 7919 + 13);
  const diet = [];
  for (let i = 0; i < SCRIB; i++) { const c = trapezoid(r10); diet.push({ c, y: drive(c), n: c.length }); }
  let mt = 0; for (let i = 0; i < P; i++) mt += PR.q[i] - yb[i]; mt /= P;
  console.log(`      ridge      held-out R² (fit)   R² on the PROGRAM   on the machine`);
  for (const rg of [1e-6, 1e-4, 1e-2, 1e-1, 1, 10]) {
    const pj = new DistilPolicy({
      channels: 1, refDim: 1, offsets: UNIQ, ridge: rg,
      uMax: 0.05, online: false, standardize: true,
    });
    for (const d of diet) {
      const pre = new Array(d.n);
      for (let k = 0; k < d.n; k++) pre[k] = [d.c[k] - d.y[k]];
      pj.addProgram({ refAt: (k) => [d.y[Math.max(0, Math.min(d.n - 1, k))]], n: d.n, prefix: pre,
        stride: 1, closed: true });
    }
    const fr = pj.fit();
    let se = 0, st = 0;
    for (let i = 0; i < P; i++) {
      const t = PR.q[i] - yb[i];
      const f = pj.actLook((o) => [yb[(((i + o) % P) + P) % P]], null)[0];
      se += (t - f) ** 2; st += (t - mt) ** 2;
    }
    const keep = pol; pol = pj; const sc = score(true, 1); pol = keep;
    console.log(`    ${String(rg).padStart(8)}   ${fr.heldOutR2[0].toFixed(4).padStart(15)}`
      + `   ${(1 - se / st).toFixed(4).padStart(17)}   ${(off.rms / sc.rms).toFixed(3)}x`
      + `${fr.deploy ? '' : '   (fit REFUSED)'}`);
  }
  console.log(`    in-diet R² FALLS monotonically while PROGRAM R² RISES — §49's law on a ninth knob,`);
  console.log(`    so this fit's own gate ranks the ridge BACKWARDS and cannot be used to pick it.`);
}


// ---------------------------------------------------------------- K: STANDARDISE vs SIGN TAPS
/**
 * BUILT TO SEPARATE TWO CANDIDATES FOR §98's DISCREPANCY, AND IT IS WHAT EXPLAINS WHAT IS LEFT OF
 * IT (plan §98.2, then §99).
 *
 * §99 established that the discrepancy was the deploy READER (section L), which accounts for
 * -1.0172 against +0.9607. What it does NOT account for is the remaining 3%: with the reader
 * fixed, `DistilPolicy` reads 0.9671 / 5.510x where section I's plain global fit reads 0.9607 /
 * 5.681x, and the two are still not the same object. This 2x2 is that gap, measured one variable
 * at a time (rule 20).
 *
 * **STANDARDISATION IS THE WHOLE OF IT AND IT COSTS ~18% ON THIS ROUTING**: off, the same fit reads
 * 6.513x against 5.510x, and the SIGN TAPS are inert to 0.6% in both rows. That is not a general
 * verdict — §63 measured standardisation worth 3-5x on the barrel, where `_rowFrom`'s absolute
 * leading term is 18-62% of full power against differences of order 0.1 — it is this routing's
 * row, whose leading term is a POSITION and whose differences carry the command, being flattened
 * by a per-feature rms that treats them as commensurable.
 */
console.log(`\n  K — STANDARDISATION vs THE SIGN TAPS, one variable at a time (plan §98.2, §99)`);
{
  const r11 = lcg(SEED * 7919 + 13);
  const diet = [];
  for (let i = 0; i < SCRIB; i++) { const c = trapezoid(r11); diet.push({ c, y: drive(c), n: c.length }); }
  let mt = 0; for (let i = 0; i < P; i++) mt += PR.q[i] - yb[i]; mt /= P;
  console.log(`      standardise   sign taps   held-out R²   R² on the PROGRAM   on the machine`);
  for (const std of [true, false]) {
    for (const sgn of [true, false]) {
      const pk = new DistilPolicy({
        channels: 1, refDim: 1, offsets: UNIQ, ridge: RIDGE,
        signOffsets: sgn ? [0] : [], uMax: 0.05, online: false, standardize: std,
      });
      for (const d of diet) {
        const pre = new Array(d.n);
        for (let k = 0; k < d.n; k++) pre[k] = [d.c[k] - d.y[k]];
        pk.addProgram({ refAt: (k) => [d.y[Math.max(0, Math.min(d.n - 1, k))]], n: d.n, prefix: pre,
          stride: 1, closed: true });
      }
      const fr = pk.fit();
      let se = 0, st = 0;
      for (let i = 0; i < P; i++) {
        const t = PR.q[i] - yb[i];
        const f = pk.actLook((o) => [yb[(((i + o) % P) + P) % P]], null)[0];
        se += (t - f) ** 2; st += (t - mt) ** 2;
      }
      const keep = pol; pol = pk; const sc = score(true, 1); pol = keep;
      console.log(`    ${String(std).padStart(11)}   ${String(sgn).padStart(9)}   `
        + `${fr.heldOutR2[0].toFixed(4).padStart(11)}   ${(1 - se / st).toFixed(4).padStart(17)}   `
        + `${(off.rms / sc.rms).toFixed(3)}x${fr.deploy ? '' : '   (REFUSED)'}`);
    }
  }
  console.log(`    the plain global fit of section I (neither) reads 0.9607 and 5.681x — the 3% gap`);
  console.log(`    §98 could not explain is this table: standardisation costs ~18% on this routing.`);
}

// ---------------------------------------------------------------- L: IT WAS THE READER
/**
 * §98 LEFT AN OPEN DISCREPANCY AND NAMED THE STEP THAT WOULD CLOSE IT: *dump both paths' feature
 * rows for the SAME window index and diff them element by element.* Done, and the difference is
 * in the ROW — the two paths were not reading the same window at all.
 *
 * `DistilPolicy` has TWO entry points and they take DIFFERENT READER SHAPES:
 *
 *   act(refAt, k)    `refAt` is an ABSOLUTE-INDEX reader. It builds its own window internally,
 *                    `look = (o) => refAt(k + o)`.
 *   actLook(look)    `look` is an OFFSET-FROM-NOW reader, already centred. Identical arithmetic.
 *
 * Every call in this file passed an offset-from-now closure `(o) => [ref[i + o]]` to `act(…, i)`,
 * so the closure was handed `k + o = i + o` as its OWN offset and indexed `ref[i + (i + o)]`.
 * **The window was read centred at 2i.** At i = 0 the two agree exactly, which is why the deploy
 * path never looked wrong — and it is the reason a fit at R² 0.9953 delivered 0.588x.
 *
 * The dump below is the evidence rather than the argument: the reference is replaced by a RAMP,
 * so every entry of the row IS the index it was read at, and the two rows can be compared by eye.
 * Rule 17 again — the instrument fails before the model does, and this one had been failing
 * since §93 was written.
 */
console.log(`\n  L — THE ROW DUMP §98 ASKED FOR (plan §99, rule 17)`);
{
  const ramp = new Float64Array(P);
  for (let i = 0; i < P; i++) ramp[i] = i;            // value === index
  const I = 100;
  const lookC = (o) => [ramp[(((I + o) % P) + P) % P]];
  const SHOW = UNIQ.filter((_, j) => j % 3 === 0).slice(0, 5);
  const viaAct = SHOW.map((o) => lookC(I + o)[0]);    // what act(lookC, I) builds internally
  const viaLook = SHOW.map((o) => lookC(o)[0]);       // what actLook(lookC) builds
  const pad = (v) => String(v).padStart(7);
  console.log(`      offsets          ${SHOW.map(pad).join('')}`);
  console.log(`      act(look, k)     ${viaAct.map(pad).join('')}   <- centred at 2i`);
  console.log(`      actLook(look)    ${viaLook.map(pad).join('')}   <- centred at i`);
  console.log(`      wanted           ${SHOW.map((o) => pad((((I + o) % P) + P) % P)).join('')}`);
  const wrong = SHOW.filter((o, j) => viaAct[j] !== viaLook[j]).length;
  console.log(`      ${wrong} of ${SHOW.length} taps differ at i = ${I}; at i = 0 all of them AGREE,`);
  console.log(`      which is exactly why this survived §93, §94 and §98 unnoticed.`);
  // BOTH HALVES (rule 9). The i = 0 row must be built by the SAME construction as the row above,
  // or it is the identity `f(o) === f(o)` wearing a check's clothes: what makes it a control is
  // that ONE closure, read two ways, disagrees at i = 100 and agrees at i = 0 — which is the
  // double offset `i + (i + o)` collapsing to `o` exactly where i is zero and nowhere else.
  const rowsAt = (c) => {
    const lk = (o) => [ramp[(((c + o) % P) + P) % P]];
    return [UNIQ.map((o) => lk(c + o)[0]), UNIQ.map((o) => lk(o)[0])];
  };
  const [a0, b0] = rowsAt(0), [aI, bI] = rowsAt(I);
  const agree0 = a0.every((v, j) => v === b0[j]);
  const differI = aI.filter((v, j) => v !== bI[j]).length;
  console.log(`      i = 0 control: the two readers agree on all ${UNIQ.length} taps — ${agree0}`);
  console.log(`      i = ${I}:        they differ on ${differI} of ${UNIQ.length} — so the control has teeth`);
  if (!agree0 || differI === 0) throw new Error('L: the row dump is not measuring the reader shape');
}

console.log(`\n  for scale, on this axis: the shipped distilled policy reads 32.75x over the`);
console.log(`  cascade's 0.5764 mm and the conventional rung alone reads 425x — both of them`);
console.log(`  taught by an iterated teacher this route does not have (plan §93).\n`);
