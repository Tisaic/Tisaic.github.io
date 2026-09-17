/**
 * @file THE CONVENTIONAL RUNG'S DIET ON THE REAL FLEXIBLE ARM — plan §89.3's named repair,
 * measured (task #70).
 *
 * WHAT THIS IS FOR. §88.3 found the first plant in this project where target 1's *none made
 * worse* clause fails, and it fails for `classic.js` — the CONVENTIONAL rung, which is what
 * actually ships here at 1.93x. §89.3 then REFUTED the obvious repair by measurement: a
 * coverage guard on commanded SPEED cannot separate the harmful rows because they STRADDLE the
 * commissioning value (0.577x and 1.666x of it), so any threshold refusing one admits the other
 * or refuses the SOFTER program that delivers 2.825x. Its conclusion was structural and is the
 * whole reason this file exists:
 *
 *   "A coverage guard fades outside the span THE COMMISSIONING SAW, and the rung that ships on
 *    this plant is identified on ONE program: its span is a POINT, not an interval, so there is
 *    nothing to fade against. What this plant needs is not a guard but a DIET."
 *
 * WHAT A DIET IS HERE, AND WHY THE DEPLOYED OBJECT DOES NOT CHANGE FORM. `ClassicFF` deploys
 * `live(v, a)` — four coefficients per channel read off the reference's OWN rate and
 * acceleration, evaluated on whatever the machine is asked to do next. Pooling several programs
 * into one record changes the COEFFICIENTS and the row NORMALISATION and nothing else: there is
 * no table, no index and no extra arithmetic at deploy. So the question this asks is narrow and
 * answerable — does a rung fitted across a SPAN of edge widths stop harming a sharper program?
 *
 * WHAT IS HELD OUT. The four programs §88.3 bisected are built by the RIG (`t1Variants`), so
 * this harness and `distil-realarm.mjs` score the identical objects (rule 61 — the construction
 * was inline in that file and is bit-identical across the move, checked). The diet's edge widths
 * are chosen to EXCLUDE 96 and 200 exactly, and `CDIET=...` states them, so nothing in the test
 * set is in the training set.
 *
 * THE CONTROLS, because a diet that only moves the number is not a finding (rules 9, 21):
 *   CDIET=off    the control — one program, exactly what ships today.
 *   CDIET=pool1  the SAME program as a one-member diet, through the pooling machinery. It must
 *                reproduce `off` to every digit or the plumbing is what moved the result.
 *   CDIET=amp    four AMPLITUDES at the commissioned edge — pooling with NO shape span. §88.3
 *                measured amplitude as the axis that does not harm, so this predicts nothing.
 *   CDIET=soft   a span that does NOT bracket the sharp end. If a diet works by giving the rung
 *                a SHAPE span, this must leave edge 96 harmed.
 *
 * KNOBS: CDIET (off | pool1 | amp | soft | <comma-separated edge widths>), DLAPS (each diet
 * member's length in laps, default the scored program's own 280).
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { realarmLadderSpec } from './rigs/specs.mjs';
import { reset, count, split } from './rigs/meter.mjs';
import * as A from './rigs/realarm-rig.mjs';

const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
console.log('\nclassicdiet-realarm: a DIET for the CONVENTIONAL rung (plan §89.3, task #70)\n');

const MODE = process.env.CDIET || 'off';
const DLAPS = Math.max(1, env('DLAPS', A.PROG / A.LAP));
const DN = DLAPS * A.LAP;

// ---- THE DIET ---------------------------------------------------------------------------
/**
 * Each member is a program of the SAME FAMILY at a different edge width, at the amplitude the
 * rig's OWN headroom rule derives for that width — the same rule the shipped program and every
 * one of §88.3's variants is built by, so no amplitude is invented here (rule 41b; this rig has
 * already paid once for a reference sized from a quantity the program does not live at).
 *
 * `fresh` warms on the MEMBER'S OWN program rather than the shipped one, because a run that
 * settles onto one trajectory and is then scored on another is measuring the change-over
 * (rules 12, 13). The ring locks in over ~13 laps here and `makeMachine`'s warm is 20.
 */
const member = (g) => ({
  refAt: (k) => g.at(Math.min(k, DN - 1)),
  N: DN,
  fresh: () => {
    const m = A.makeMachine(A.LOOP, { warm: false });
    for (let k = 0; k < 20 * A.LAP; k++) m.step(g.at(k)[0]);
    return m;
  },
  g,
});
const scaled = (g, amp) => ({ lap: g.lap, edge: g.edge, amp,
  at: (k) => [amp * g.at(k)[0] / g.amp] });

let DIET = null, dietWhat = 'the scored program alone — the control, exactly what ships';
if (MODE === 'pool1') {
  DIET = [member(A.makeProgram({}))];
  dietWhat = 'ONE member, the scored program itself — the plumbing control (rule 21)';
} else if (MODE === 'amp') {
  const base = A.makeProgram({});
  DIET = [0.35, 0.6, 1.0, 1.6].map((f) => member(scaled(base, f * A.AMP)));
  dietWhat = 'four AMPLITUDES at edge 160 — pooling with NO shape span';
} else if (MODE === 'soft') {
  DIET = [176, 216, 240, 256].map((e) => member(A.makeProgram({ edge: e })));
  dietWhat = 'edges 176/216/240/256 — a span that does NOT bracket the sharp end';
} else if (MODE !== 'off') {
  DIET = MODE.split(',').map(Number).map((e) => member(A.makeProgram({ edge: e })));
  dietWhat = `edges ${MODE}`;
}

/** Peak |torque| over a settled span of a program, as a fraction of the drive's own limit —
 *  printed for every diet member because rule 41b is about the program's own demand and not
 *  about a declared range, and this rig has already shipped a reference demanding 11x the
 *  torque the machine has. */
function driveFrac(at, lap, laps = 24) {
  const m = A.makeMachine(A.LOOP, { warm: false });
  for (let k = 0; k < laps * lap; k++) m.step(at(k)[0]);
  let pk = 0;
  for (let k = laps * lap; k < (laps + 4) * lap; k++) { m.step(at(k)[0]); pk = Math.max(pk, Math.abs(m.torque)); }
  return pk / A.TMAX;
}

console.log(`  CDIET=${MODE}: ${dietWhat}`);
if (DIET) {
  for (const t of DIET) {
    console.log(`    edge ${String(t.g.edge).padStart(3)}  amp ${t.g.amp.toExponential(3)}  `
      + `|a|/|v| ${A.shapeOf(t.g, A.LAP).av.toExponential(3)}  `
      + `drive ${(100 * driveFrac(t.g.at, A.LAP)).toFixed(1)}% of the limit  ${DLAPS} laps`);
  }
}
console.log(`  the SCORED program is lap ${A.LAP} edge ${A.EDGE} amp ${A.AMP.toExponential(3)}, `
  + `drive ${(100 * driveFrac((k) => A.refAtStep(k), A.LAP)).toFixed(1)}%`);
const T = A.t1Variants();
const COMM = A.shapeOf(T.E160, A.LAP);
console.log(`  the commissioned program reads peak |v| ${COMM.pv.toExponential(3)} and `
  + `|a|/|v| ${COMM.av.toExponential(3)}  (the SHAPE reading, exactly amplitude-free)\n`);

// ---- THE LADDER -------------------------------------------------------------------------
// DEPTH 0: no cascade. `realarm.test.mjs` REFUSES it (§84.11: INVERSE 128.3%) and
// `distil-realarm.mjs` runs at depth 0 for the same reason, so this measures the object those
// two ship — the conventional rung — and not a second configuration (rule 20).
const spec = { ...realarmLadderSpec,
  depth: process.env.DEPTH !== undefined ? +process.env.DEPTH : 0,
  ...(DIET ? { classicDiet: DIET } : {}) };

announce();
const t0 = Date.now();
// WHAT THE COMMISSIONING COSTS THE PLANT, counted at the plant (plan §72). The diet is more
// programs and each one is a run, so the bill is the first thing an owner asks about and it has
// to be MEASURED rather than multiplied out — `fresh()` warms 20 laps per run and a harness
// arithmetic would miss that. Reset here so the module-load baselines (`CONV_RMS`, `DO_NOTHING`,
// the identification) are visible as a number rather than silently folded in (rule 25).
const preload = reset();
const { rep, auto, scoreOn } = await ladder(spec);
const commSteps = count(), commSplit = split();
let xProg = rep.base / rep.best;

/**
 * `ASCALE=f` — THE FALSIFIER FOR THE MECHANISM THIS FILE MEASURED, and it is a sweep rather
 * than a repair (plan §89.3, task #70). The diets that work move exactly ONE of the four
 * deployed coefficients: the ACCELERATION term falls by about half while velocity, `sign v` and
 * the bias move a few percent. If that is the whole story then scaling the CONTROL fit's
 * acceleration weight by hand must reproduce the diet's delivered numbers, and the diet's own
 * value must sit at the sweep's optimum rather than beside it. It is not offered as a
 * controller: a hand-scaled coefficient is a constant nobody derived (rule 31), and what makes
 * the diet a method is that the machine picks the split by measurement.
 *
 * The scored program is RE-SCORED after the scaling, because `rep.best` belongs to the object
 * the ladder commissioned and reporting it beside a modified object would be two rungs in one
 * row (rule 19).
 */
const ASCALE = env('ASCALE', null);
if (ASCALE !== null && auto.classic) {
  const cf = auto.classic;
  cf.W[0][0] *= ASCALE; cf.touch();
  const sc = cf.basis.scale, g = cf._sc(cf.W);
  console.log(`\n  ASCALE=${ASCALE}: the acceleration weight scaled by hand AFTER commissioning`
    + ` — deployed a0 ${(g * cf.W[0][0] / sc[0]).toExponential(3)}`);
  const re = await scoreOn({ refAt: (k) => A.refAtStep(Math.min(k, A.PROG - 1)),
    fresh: () => A.makeMachine(A.LOOP), N: A.PROG });
  xProg = rep.base / re.score;
  console.log(`  the scored program re-scored: ${rep.base.toExponential(3)} → `
    + `${re.score.toExponential(3)}   ${xProg.toFixed(3)}x`);
}

console.log(`\n  TARGET 1 — the SAME object on programs it was not scored on, no refit`);
console.log(`    scored program  lap ${A.LAP} edge ${A.EDGE} amp ${A.AMP.toExponential(2)}   `
  + `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}   ${xProg.toFixed(3)}x`);
const rows = [];
for (const [tag, g] of T.rows) {
  const ref = (k) => g.at(Math.min(k, A.PROG - 1));
  const o = await scoreOn({ refAt: ref, fresh: () => A.makeMachine(A.LOOP), N: A.PROG },
    { armed: false });
  const n = await scoreOn({ refAt: ref, fresh: () => A.makeMachine(A.LOOP), N: A.PROG });
  const x = o.score / n.score, sh = A.shapeOf(g, A.LAP);
  rows.push({ tag, x, o: o.score, n: n.score, sh });
  console.log(`    ${tag}  amp ${g.amp.toExponential(2)}   ${o.score.toExponential(3)} → `
    + `${n.score.toExponential(3)}   ${x.toFixed(3)}x   ${(x / xProg).toFixed(3)} of the scored factor`);
  console.log(`      speed ${(sh.pv / COMM.pv).toFixed(3)}x of the commissioning   `
    + `SHAPE |a|/|v| ${(sh.av / COMM.av).toFixed(3)}x of it`);
}
const worst = rows.reduce((a, b) => (b.x < a.x ? b : a));
const [sharpBoth, sharpOnly, ampOnly, softer] = rows;
const MET = worst.x >= 1 && worst.x >= xProg / 1.3;
console.log(`\n    TARGET 1 ON THIS PLANT: ${MET ? 'MET' : 'NOT MET'} — worst held-out row `
  + `${worst.x.toFixed(3)}x, ${rows.filter((r) => r.x < 1).length} of ${rows.length} made worse`);
// The coefficients, because the whole claim is that the object does not change FORM (rule 30).
const c = rep.classic;
console.log(`    the rung: ${c && c.coeff ? c.coeff[0].length : 0} coefficients `
  + `${c && c.names ? '[' + c.names.join(', ') + ']' : ''}, ${c ? c.laps : 0} laps, `
  + `headroom ${c && c.headroom !== undefined ? (100 * c.headroom).toFixed(1) + '%' : '—'}`
  + `${c && c.why ? ' — ' + c.why : ''}`);
if (c && c.coeff) console.log(`    raw coefficients ${c.coeff[0].map((w) => w.toExponential(3)).join('  ')}`);
/**
 * AND THE SAME COEFFICIENTS IN THE UNITS THE MACHINE SEES, WHICH IS THE ONLY FORM TWO DIETS CAN
 * BE COMPARED IN (rule 17). `motionBasis` normalises every row to unit PEAK over the record it
 * was built on, so a raw weight is in units of "this record's own peak" and a pooled record has
 * different peaks — comparing raw weights across diets is comparing two different rulers.
 * `live(v, a)` computes `g · Σ W[j]·b_j` with `b = [a/sa, v/sv, sign v/ssv, 1/sb]`, so
 * `g·W[j]/scale[j]` is the coefficient that multiplies the PHYSICAL quantity and is the same
 * number whatever record it was fitted on.
 */
if (auto.classic && auto.classic.basis && auto.classic.basis.scale) {
  const cf = auto.classic, g = cf._sc(cf.W), sc = cf.basis.scale;
  console.log(`    DEPLOYED coefficients (physical units, gain ${g.toFixed(4)}): `
    + cf.basis.names.map((n, j) => `${n} ${(g * cf.W[0][j] / sc[j]).toExponential(3)}`).join('   '));
}
// The plant's own clock. This rig states no seconds-per-step, so the figure is STEPS and the
// time column reads UNKNOWN rather than a wall clock from a simulator (rule 25, and
// `commtime.mjs`'s own finding that steps and time rank differently).
console.log(`    COMMISSIONING: ${commSteps.toLocaleString()} plant steps `
  + `(${Object.entries(commSplit).map(([k, v]) => `${k} ${(100 * v / commSteps).toFixed(0)}%`).join(' · ')})`
  + `   — the rig states no clock, so seconds are UNKNOWN; ${preload.toLocaleString()} steps of `
  + `module-load baseline are excluded`);
console.log(`    ${((Date.now() - t0) / 1000).toFixed(0)}s of Node\n`);

// BOTH HALVES (rule 9): a diet that fixes the harmful program by giving up the ones that work
// is not a repair, it is a different trade — so the report asserts the harmful rows AND the
// two that already worked AND the commissioned program.
check('the SHARPER edge is no longer made worse, at its own amplitude and at the shipped one',
  sharpBoth.x >= 1 && sharpOnly.x >= 1,
  `${sharpBoth.x.toFixed(3)}x and ${sharpOnly.x.toFixed(3)}x`);
check('…and the two rows that already worked are not given up',
  ampOnly.x >= 1 && softer.x >= 1,
  `amplitude-only ${ampOnly.x.toFixed(3)}x, softer ${softer.x.toFixed(3)}x`);
check('…and the commissioned program is still improved', xProg >= 1, `${xProg.toFixed(3)}x`);
console.log(failed ? `\n  ${failed} check(s) failed — see the table above\n`
  : '\n  all checks passed\n');
// REPORTED, NOT EXITED NON-ZERO: this is an instrument, and a plant measured as failing a bar
// is a result to read rather than a red line to tolerate (rule 3).
process.exit(0);
