/**
 * @file THE SANITY CHECK — the deployed object on the most ordinary plant there is: one PV, one
 * MV, one PID, a setpoint that moves (plan §137).
 *
 * WHY THIS RUN EXISTS. Everything in this project is measured on plants chosen because they are
 * hard — a lattice arm, an open-loop-unstable cart-pole, a coupled 2x2 column, a mill whose
 * error arrives through a 100-step transport delay. None of them is what a controls engineer
 * meets on a Tuesday, and before any of this is translated to ST and put on a real controller
 * the honest question is not *how large is the factor* but *does the block do the obviously
 * right thing on a case whose answer everyone already knows*.
 *
 * THE TWO CONSTRAINTS THAT DESIGNED THIS PLANT are in `rigs/pidloop-rig.mjs`'s header and both
 * come out of the record rather than out of taste: the setpoint has to MOVE (§105 — a
 * regulator's reference window is identical at every k, so the map is representationally unable
 * to act and the mill reads a correction spread of exactly 0.0e+0 to prove it), and the valve
 * has to be NONLINEAR (§55 — on a linear plant `classic.js`'s `[a, v, sign v, 1]` inverts
 * exactly and the factor measures the hypothesis class, which cost this project 2012x → 6.5x on
 * the real tanks and 1364x → 89.8x on the real exchanger).
 *
 * WHAT IS BEING ASKED, AND IT IS NOT "IS THE NUMBER BIG". Four things, in this order:
 *
 *   1. DOES IT REFUSE TO HARM. On a plant a PID already handles competently, the one
 *      unacceptable outcome is making the loop worse. Asserted, on the commissioned schedule
 *      and on one the commissioning never saw.
 *   2. DOES THE INCUMBENT GET ITS FAIR SHOT. `classic.js` IS the self-tuned PID+FF this method
 *      is sold against, and §89.6's split (`xClassic` x `xAdded`) says on FIVE rows of eleven
 *      the incumbent is the whole result and the ladder correctly ships it. If that happens
 *      here it is a PASS, not a failure — it is the portfolio working.
 *   3. IS ANY LEARNED INCREMENT THE VALVE OR THE CLASS. `LINEAR=1` is the matched control
 *      (rule 20): same loop, same schedule, same diet, only the valve characteristic moving.
 *   4. IS IT THE LOOP RATHER THAN THE CONTROLLER. §52.32 is the reason — the cart-pole's
 *      9.770x turned out to be its stabiliser, and re-tuned it refused all four seeds. So the
 *      PID is tuned by SIMC at its published rule AND `PID_TAUC` sweeps that rule.
 *
 * KNOBS: LINEAR=1 (the matched control), PID_TAUC=<s> (the tuning sweep), RIDGES, GAINS, WIN,
 *        TLAPS, TAVG, DIETN, DSEED, DEPTH.
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { pidLoopLadderSpec } from './rigs/specs.mjs';
import { deriveWindow, reportDistil, priceFrom, ridgeLadder, gainLadder, teacherReuse,
  teachLaps, teachAvg, dietN, carrier, emitRow } from './rigs/distilkit.mjs';
import * as PL from './rigs/pidloop-rig.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-pidloop: SKIPPED (full tier only — one commissioning)\n');
  process.exit(0);
}
const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
const LIN = process.env.LINEAR === '1';
const MODEL = LIN ? PL.MODEL_LIN : PL.MODEL;
const TAUC = process.env.PID_TAUC === undefined ? PL.THETA : env('PID_TAUC');
const OPTS = { tauc: TAUC };

console.log(`\ndistil-pidloop: the DEPLOYED object on an ORDINARY PID temperature loop`
  + `${LIN ? '  (LINEAR valve — the matched control of §55)' : ''}\n`);

// ------------------------------------------------------------------ what the loop is
{
  const p = PL.makeLoop(MODEL, OPTS);
  console.log(`  the plant   FOPDT  K ${PL.KP} °C · tau ${PL.TAU} s · theta ${PL.THETA} s `
    + `(theta/tau ${(PL.THETA / PL.TAU).toFixed(2)}) at Ts ${PL.TS} s`);
  console.log(`  the valve   ${MODEL.tag}${LIN ? '' : `  equal-% R=${PL.RANGE} · stiction `
    + `${(PL.STIC_D * 100).toFixed(1)}%+${(PL.STIC_S * 100).toFixed(1)}% · rate ${PL.RATE * 100}%/s`}`
    + `  ·  measurement ${PL.QUANT} °C`);
  console.log(`  the PID     SIMC at tauc = ${TAUC} s:  Kc ${p.tuning.Kc.toFixed(3)} `
    + `· Ti ${p.tuning.TI.toFixed(0)} s · Td ${p.tuning.TD} `
    + `(installed gain ${p.tuning.Kinst.toFixed(3)} °C/% at the schedule's own operating point)`);
}

/** The loop's own 2% settle to a setpoint step, from a settled loop — never assumed (rule 31). */
function measureSettle(N = 1500) {
  const p = PL.makeLoop(MODEL, OPTS);
  const y0 = p.y, y = new Float64Array(N);
  for (let k = 0; k < N; k++) y[k] = p.step(PL.RECIPE[0] + 10);
  const fin = y[N - 1];
  for (let k = N - 1; k >= 0; k--) if (Math.abs(y[k] - fin) > 0.02 * Math.abs(fin - y0)) return k + 1;
  return 1;
}
const SETTLE = measureSettle();

// ------------------------------------------------------------------ the diet
/** Four CLOSED setpoint schedules, none of them production, inside the loop's declared span. */
const SHIPPED_RECIPES = [
  [62, 48, 72, 52, 62],
  [50, 70, 58, 80, 50],
  [66, 54, 44, 64, 66],
  [58, 78, 50, 70, 58],
];
const DSEED = process.env.DSEED ? +process.env.DSEED : null;
const RECIPES = DSEED === null ? SHIPPED_RECIPES : (() => {
  let st = (DSEED * 2654435761) >>> 0;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const t = () => 44 + 36 * rnd();
  return Array.from({ length: 4 }, () => { const a = t(); return [a, t(), t(), t(), a]; });
})();
if (DSEED !== null) console.log(`  DIET DRAW ${DSEED}: `
  + RECIPES.map((r) => r.map((v) => v.toFixed(0)).join('→')).join('  ·  '));

const LAP = PL.SEG * (RECIPES[0].length - 1);
const { reach: REACH, offsets: OFFSETS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin: LAP, win: process.env.WIN === undefined ? undefined : env('WIN') });
console.log(`\n  the loop's 2% settle is ${SETTLE} samples (${SETTLE * PL.TS} s) against a `
  + `${PL.PROG}-sample program — ${(PL.PROG / SETTLE).toFixed(1)} response times per program`);
console.log(`  §84.9's screen splits at about TEN and every plant above it meets target 1; this `
  + `one is ${PL.PROG / SETTLE >= 10 ? 'ABOVE' : 'BELOW'} the split, and not by much — stated `
  + `rather than tuned, because lengthening a segment to clear a screen is fitting the benchmark`);
console.log(`  window ±${REACH} samples  [rule ${RULE} = min(0.61·${SETTLE}, ${LAP}/8)]`
  + `   ${OFFSETS.length} offsets`);
console.log(`  the diet: ` + RECIPES.map((r) => r.join('→')).join('  ·  '));
console.log(`  the SCORED schedule ${PL.RECIPE.join('→')} is in NO training run\n`);

// ------------------------------------------------------------------ the teacher's runs
const TLAPS = teachLaps();
const TAVG = teachAvg(TLAPS);
const distilRuns = () => dietN([0, 1, 2, 3]).map((i) => {
  const rec = RECIPES[i];
  const plant = carrier(() => PL.makeLoop(MODEL, { ...OPTS, sp0: rec[0] }));
  return {
    lap: LAP,
    closed: true,
    refAt: (k) => [PL.spOn(rec, ((k % LAP) + LAP) % LAP)],
    run: async (corr) => {
      const p = plant();
      let s2 = 0, n = 0;
      const err = [new Float64Array(LAP)];
      for (let j = 0; j < TLAPS * LAP; j++) {
        const kk = ((j % LAP) + LAP) % LAP;
        const sp = PL.spOn(rec, kk);
        const u = corr ? corr.at(kk) : [0];
        const y = p.step(sp + (u[0] || 0));
        const e = y - sp;
        if (j >= (TLAPS - TAVG) * LAP) err[0][kk] += e / TAVG;
        if (j >= (TLAPS - 1) * LAP) { s2 += e * e; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },
  };
});

// ------------------------------------------------------------------ the ZERO control
/**
 * AN ALL-ZERO CORRECTION MUST REPRODUCE THE BARE PID LOOP BIT-EXACTLY, and this is asserted
 * rather than assumed because this project has already shipped the other outcome: `distil-tank.mjs`
 * scored a rung its own loop never applied and reported *1.000x, nothing harmed, TRANSFER* for two
 * sections (§67.3). A harness that cannot tell "the correction did nothing" from "the correction
 * was never applied" cannot report a refusal either.
 */
{
  const spec = pidLoopLadderSpec(MODEL, OPTS);
  const p = spec.fresh();
  let s2 = 0, n = 0;
  for (let k = 0; k < PL.PROG; k++) {
    const r = spec.refAt(k);
    const { truth } = spec.step(p, r, [0]);
    if (k >= PL.PROG * 0.05) { s2 += truth[0] * truth[0]; n++; }
  }
  const viaSpec = Math.sqrt(s2 / n), viaRig = PL.convRms(MODEL, OPTS);
  check('ZERO control: the spec\'s own loop with u = 0 IS the bare PID loop, bit-exact',
    viaSpec === viaRig, `${viaSpec.toExponential(12)} against ${viaRig.toExponential(12)}`);
  console.log(`    the conventional machine — the PID alone — reads ${viaRig.toFixed(4)} °C rms\n`);
}

// ------------------------------------------------------------------ the ladder
const spec = { ...pidLoopLadderSpec(MODEL, OPTS),
  depth: process.env.DEPTH !== undefined ? +process.env.DEPTH : 0,
  distil: { refDim: 1, ridge: env('RIDGE', 1e-6), offsets: OFFSETS,
    ...(ridgeLadder() ? { ridges: ridgeLadder() } : {}),
    ...(gainLadder() ? { gains: gainLadder() } : {}),
    ...(teacherReuse() ? {} : { teacherReuse: false }),
    ...(process.env.STD === '0' ? {} : { standardize: true }),
    ...(process.env.ONLINE === '0' ? { online: false } : {}) },
  distilRuns };

announce();
const price = priceFrom();
const { rep, auto, scoreOn } = await ladder(spec);
price.close({ dt: PL.TS, rep });
await reportDistil({ rep, runs: distilRuns(), nFeat: OFFSETS.length + 1, auto });

// ------------------------------------------------------------------ target 1
const HELD_REC = [60, 46, 76, 56, 64];
const heldRef = (k) => [PL.spOn(HELD_REC, Math.min(k, PL.PROG - 1))];
const heldFresh = () => PL.makeLoop(MODEL, { ...OPTS, sp0: HELD_REC[0] });
const hOff = await scoreOn({ refAt: heldRef, fresh: heldFresh, N: PL.PROG }, { armed: false });
const hOn = await scoreOn({ refAt: heldRef, fresh: heldFresh, N: PL.PROG });

const xProg = rep.base / rep.best, xHeld = hOff.score / hOn.score;
console.log(`\n  TARGET 1 — the SAME object on a schedule it was never commissioned on, no refit`);
console.log(`    scored    ${PL.RECIPE.join('→')}   `
  + `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}   ${xProg.toFixed(3)}x`);
console.log(`    held out  ${HELD_REC.join('→')}   `
  + `${hOff.score.toExponential(3)} → ${hOn.score.toExponential(3)}   ${xHeld.toFixed(3)}x`);
console.log(`    the held-out schedule delivers ${(xHeld / xProg).toFixed(3)} of what the scored `
  + `one does; target 1 forbids < 0.769 (1/1.3)`);
console.log(`    TARGET 1's 1.3x BOUND: ${xHeld >= xProg / 1.3 ? 'MET' : 'NOT MET'}`);
emitRow(rep, auto, { t1: xHeld / xProg, t1Worse: xHeld < 1 });

// ------------------------------------------------------------------ what the checks are
console.log('');
check('the loop is not made worse by anything the ladder ships',
  rep.best <= rep.base, `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}`);
check('the held-out schedule is not made worse either',
  hOn.score <= hOff.score * 1.02,
  `${hOff.score.toExponential(3)} → ${hOn.score.toExponential(3)} = ${xHeld.toFixed(3)}x`);
check('the distilled rung reached the plant — a fit, a refusal with a reason, or a stated skip, '
  + 'never silence (rule 25)',
  !!(rep.distil && (rep.distil.policy || rep.distil.note || rep.distil.error)),
  JSON.stringify(rep.distil || null));

/**
 * THE INCUMBENT'S OWN SPLIT (plan §89.6). `xClassic` x `xAdded` multiply to the headline by
 * construction, so a row where they do not is an instrument fault and not a result. On FIVE rows
 * of eleven the incumbent IS the result and the ladder correctly ships it — which on THIS plant
 * would be the expected outcome and a PASS, because a self-tuned `[a, v, sign v, 1]` is exactly
 * what a FOPDT loop's lag-dominated residual wants.
 */
const cls = rep.rungs && rep.rungs.find((r) => /classic|conventional/i.test(r.name || ''));
if (cls) {
  const xC = cls.deployed ? rep.base / cls.score : 1;
  console.log(`\n  THE SPLIT — incumbent against learned increment`);
  console.log(`    conventional rung  ${cls.deployed ? 'DEPLOYED' : 'REFUSED'}  ${xC.toFixed(3)}x`
    + `   ·   everything above it  ${(xProg / xC).toFixed(3)}x   =   ${xProg.toFixed(3)}x`);
}

console.log(failed ? `\n  ${failed} check(s) failed\n` : `\n  all checks passed\n`);
process.exit(failed ? 1 : 0);
