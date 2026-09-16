/**
 * @file LEARN THE COMMAND DIRECTLY — the owner's routing, run dynamically (plan §93).
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
    const u = active ? g * pol.act((o) => [inp[(((i + o) % Q) + Q) % Q]], i, null)[0] : 0;
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
    const f = pol.act((o) => [yb[(((i + o) % P) + P) % P]], i, null)[0];
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
    const f = pol2.act((o) => [yb[(((i + o) % P) + P) % P]], i, null)[0];
    se += (t - f) ** 2; st += (t - mt) ** 2;
  }
  console.log(`    the FIT: ${fr.rows} rows, held-out R² `
    + `${fr.heldOutR2.map((z) => z.toFixed(4))}, null ${fr.controlR2.map((z) => z.toFixed(4))}, `
    + `deploy ${fr.deploy}`);
  console.log(`    R² on the PROGRAM       ${(1 - se / st).toFixed(4)}   (the scribble diet read -1.886)`);
  console.log(`    direct inverse          ${a.rms.toFixed(4)} mm rms   ${(off.rms / a.rms).toFixed(3)}x`
    + `   (the scribble diet read 0.588x)`);
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
      const f = pe.act((o) => [yb[(((i + o) % P) + P) % P]], i, null)[0];
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
    + `(the linear map read -1.0172)`);
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

console.log(`\n  for scale, on this axis: the shipped distilled policy reads 32.75x over the`);
console.log(`  cascade's 0.5764 mm and the conventional rung alone reads 425x — both of them`);
console.log(`  taught by an iterated teacher this route does not have (plan §93).\n`);
