/**
 * @file THE DEPLOYED OBJECT ON THE ONE PLANT CLASS THE OTHERS DO NOT CONTAIN (plan §86.2).
 *
 * `pend.test.mjs` has driven the cart-pole with a bare `Pilot` since §52.32, and §84.10 settled
 * that reading: on the shipped loop it deploys at 9.4-9.8x, on a loop tuned 3.5x better it
 * REFUSES at every one of five authorities, so the headline was the loop and the plant stands as
 * ASKED AND CORRECTLY REFUSED rather than as a factor. That section ends by naming what it did
 * NOT do, and this file is it:
 *
 *   "NOT BUILT: the DEPLOYED object has never been asked here, and all four plants converted
 *    since §64 were converted by asking it instead of the teacher (rule 59)."
 *
 * The column, the mill, the tank and the barrel were every one of them converted the same way —
 * not by changing the controller, but by asking `distil.js`'s weight vector instead of `Pilot`'s
 * QP. This asks it here, on BOTH loops, because a result on the weak denominator alone is the
 * mistake §84.10 exists to have corrected.
 *
 * WHAT THE OBJECT IS TOLD is the commanded cart reference and nothing else — no pole angle, no
 * cart speed, no instrument at deploy. On an OPEN-LOOP UNSTABLE plant that is the sharpest form
 * of the claim this project makes: the stabiliser is what keeps the pole up, and the question is
 * whether a map of what the machine was ASKED to do can still remove the tip's swing.
 *
 * THE DIET is four moves the program is not — different distance, acceleration, feed and dwell —
 * and the scored program appears in NO training run. Their dwells are long enough that the
 * window rule's REACH half binds rather than its aliasing half, which is a design and is stated:
 * a diet of short laps would force a window too short to reach a 282-step settle, and §49.11's
 * forced trade would decide the result instead of the plant.
 *
 * KNOBS: PEND_TUNED=1 (the swept loop), PEND_UCAP, PEND_SUB, RIDGES, GAINS, WIN, TLAPS, TAVG,
 * DIETN, SEED.
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { pendSpec } from './rigs/specs.mjs';
import { deriveWindow, reportDistil, priceFrom, ridgeLadder, gainLadder, teacherReuse, teachLaps,
  teachAvg, dietN, carrier } from './rigs/distilkit.mjs';
import * as PD from './rigs/pend-rig.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-pend: SKIPPED (full tier only — one commissioning)\n');
  process.exit(0);
}
const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
console.log(`\ndistil-pend: the DEPLOYED object on an OPEN-LOOP UNSTABLE plant`
  + `${PD.TUNED ? '  (loop TUNED — the strong denominator)' : '  (the shipped loop)'}\n`);

// ------------------------------------------------------ the settle, MEASURED not asserted
/** The tip's own 2% settle to a step on the cart reference, from the settled machine. It is the
 *  reach half of the window rule and it belongs to the LOOP, which is why it is re-measured when
 *  the loop changes rather than written down once (rule 31). */
function measureSettle(amp = 0.05, N = 20000) {
  const p = PD.makeSettled();
  const y = new Float64Array(N);
  for (let k = 0; k < N; k++) { PD.stepCart(p, PD.baseline(p, amp)); y[k] = PD.tipOf(p); }
  const fin = y[N - 1];
  for (let k = N - 1; k >= 0; k--) if (Math.abs(y[k] - fin) > 0.02 * Math.abs(fin)) return k + 1;
  return 1;
}
const SETTLE = measureSettle();

// ------------------------------------------------------------------------- the diet
/** Four moves the scored program is not. The dwells are long so the REACH half of the window
 *  rule binds; the distances, feeds and accelerations differ from the program in every member. */
const SHIPPED_DIET = [
  { d: 0.30, acc: 0.80, vmx: 0.30, dwell: 2.10 },
  { d: 0.65, acc: 0.35, vmx: 0.40, dwell: 0.90 },
  { d: 0.45, acc: 1.20, vmx: 0.25, dwell: 1.50 },
  { d: 0.60, acc: 0.50, vmx: 0.45, dwell: 1.30 },
];
/**
 * DSEED=<n>: DRAW THE DIET, BECAUSE THE SEED VARIES NOTHING HERE (plan §87.3, §84.8's method).
 *
 * §86.2's 11.93x is ONE commissioning draw and this project has already mistaken one of those for
 * a result. `spread.mjs` cannot make it a distribution: this rig is DETERMINISTIC and there is no
 * cascade to seed, so `SEED` moves nothing (the recorded signature is `distil-tank.mjs`'s three
 * byte-identical "seeds" — one draw three times, rule 61 aimed at a seed). What varies between two
 * commissionings of the same plant is WHICH FOUR MOVES the engineer picked, so that is the random
 * variable, drawn from the same design space the shipped diet occupies. Unset is byte-identical.
 *
 * The DWELL is drawn to keep each lap past 1,380 steps, which is what makes the window rule's
 * REACH half bind rather than its aliasing half — a constraint the shipped diet also obeys, so
 * the draw explores the same space rather than a larger one (rule 20).
 */
const DSEED = process.env.DSEED ? +process.env.DSEED : null;
const DIET = (DSEED === null ? SHIPPED_DIET : (() => {
  let st = (DSEED * 2654435761) >>> 0;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const pick = (lo, hi) => lo + (hi - lo) * rnd();
  return Array.from({ length: 4 }, () => {
    for (let tries = 0; tries < 200; tries++) {
      const d = pick(0.25, 0.65), acc = pick(0.30, 1.30), vmx = pick(0.22, 0.48);
      const ta = vmx / acc, da = 0.5 * acc * ta * ta;
      if (d - 2 * da <= 0.02) continue;                    // too short for this feed and accel
      const tmove = 2 * ta + (d - 2 * da) / vmx;
      const dwell = Math.max(0.3, 1380 * PD.DT / 2 - tmove + pick(0, 0.8));
      return { d, acc, vmx, dwell };
    }
    return SHIPPED_DIET[0];
  });
})()).map((o) => PD.makeProgram(o));
if (DSEED !== null) {
  console.log(`  DIET DRAW ${DSEED}: ` + DIET.map((g) =>
    `${g.d.toFixed(2)}m@${g.vmx.toFixed(2)}/${g.acc.toFixed(2)} dwell ${g.dwell.toFixed(2)}`).join('  ·  '));
}
const LAPMIN = Math.min(...DIET.map((g) => g.lap));
const { reach: REACH, offsets: OFFSETS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin: LAPMIN, win: process.env.WIN === undefined ? undefined : env('WIN') });
console.log(`  the tip's 2% settle is ${SETTLE} steps (${(SETTLE * PD.DT).toFixed(2)} s), the `
  + `shortest training lap ${LAPMIN}, the scored lap ${PD.LAP}`);
console.log(`  window ±${REACH} raw steps  [rule ${RULE} = min(0.61·${SETTLE}, ${LAPMIN}/8)]`
  + `   ${OFFSETS.length} offsets`);
console.log(`  the diet: ` + DIET.map((g) =>
  `${g.d}m@${g.vmx}/${g.acc} dwell ${g.dwell} (lap ${g.lap})`).join('  ·  '));
console.log(`  the SCORED program is ${PD.D}m@${PD.VMX}/${PD.ACC} dwell ${PD.DWELL} `
  + `(lap ${PD.LAP}) and is in NO training run\n`);

const TLAPS = teachLaps();
const TAVG = teachAvg(TLAPS);
const distilRuns = () => dietN([0, 1, 2, 3]).map((i) => {
  const g = DIET[i];
  // ONE PLANT PER TRAINING RUN, CARRIED (plan §72.15). The lap is closed and a deployed machine
  // runs continuously; re-settling from cold between the teacher's calls is 2,000 steps of a
  // plant already at its operating point.
  const plant = carrier(() => PD.makeSettled());
  return {
    lap: g.lap,
    closed: true,
    refAt: (k) => [g.at(k)],
    run: async (corr) => {
      const p = plant();
      let s2 = 0, n = 0;
      const err = [new Float64Array(g.lap)];
      for (let j = 0; j < TLAPS * g.lap; j++) {
        const kk = ((j % g.lap) + g.lap) % g.lap;
        const xr = g.at(kk);
        const u = corr ? corr.at(kk) : [0];
        PD.stepCart(p, PD.baseline(p, xr + (u[0] || 0)));
        const e = PD.tipOf(p) - xr;
        if (j >= (TLAPS - TAVG) * g.lap) err[0][kk] += e / TAVG;
        if (j >= (TLAPS - 1) * g.lap) { s2 += e * e; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },
  };
});

const spec = { ...pendSpec,
  uMax: env('PEND_UCAP', pendSpec.uMax),
  // NO CASCADE: the teacher here is `hff`, so a cascade would be commissioned, scored and then
  // REPLACED by the rung that wins (plan §73.1).
  depth: 0,
  distil: { refDim: 1, ridge: env('RIDGE', 1e-6), offsets: OFFSETS,
    ...(ridgeLadder() ? { ridges: ridgeLadder() } : {}),
    ...(gainLadder() ? { gains: gainLadder() } : {}),
    ...(teacherReuse() ? {} : { teacherReuse: false }),
    ...(process.env.STD === '0' ? {} : { standardize: true }),
    ...(process.env.ONLINE === '0' ? { online: false } : {}) },
  distilRuns };

announce();
const price = priceFrom();
const { rep, auto } = await ladder(spec);
price.close({ dt: PD.DT, rep });
await reportDistil({ rep, runs: distilRuns(), nFeat: OFFSETS.length + 1, auto });

// ---------------------------------------------------------------- what it delivers, and safety
/** The scored program, run through the ladder's own deployed set — the same `act` the ladder
 *  verified with, never a re-statement of the controller. The pole angle is watched because a
 *  correction that wins by leaning the machine past its guard has not won.
 *
 *  THE REFERENCE'S OWN RATE AND ACCELERATION MUST BE PASSED, and the first version of this
 *  function did not. `auto.act` routes `v` and `a` to the CONVENTIONAL rung, whose basis is
 *  `[a, v, sign v, 1]`; without them that rung reads zero and contributes nothing, so this read
 *  2.468x where the ladder's own run read 6.30x. That is `distil-tank.mjs`'s recorded fault
 *  exactly — a harness scoring a rung that was not in the run it scored (plan §67.3) — and the
 *  tell is the same one: the ladder and the harness disagreeing about one machine. */
const NSC = PD.LAP * 4;
const VV = new Float64Array(NSC), AA = new Float64Array(NSC);
for (let k = 1; k < NSC - 1; k++) {
  const p0 = PD.xrefAt(k - 1), p1 = PD.xrefAt(k), p2 = PD.xrefAt(k + 1);
  VV[k] = (p2 - p0) / 2; AA[k] = p2 - 2 * p1 + p0;
}
function score(active) {
  const p = PD.makeSettled();
  if (active) auto.beginRun();
  let s2 = 0, n = 0, uPk = 0, thPk = 0;
  for (let k = 0; k < NSC; k++) {
    const xr = PD.xrefAt(k);
    const look = (off) => [PD.xrefAt(k + off)];
    const u = active ? auto.act({ v: [VV[k]], a: [AA[k]], look, lookRaw: look, k }) : [0];
    uPk = Math.max(uPk, Math.abs(u[0] || 0));
    PD.stepCart(p, PD.baseline(p, xr + (u[0] || 0)));
    auto.observe([p.x, p.v, p.th, p.w]);
    thPk = Math.max(thPk, Math.abs(p.th));
    if (k >= PD.LAP) { const e = PD.tipOf(p) - xr; s2 += e * e; n++; }
  }
  return { rms: Math.sqrt(s2 / n), uPk, thPk };
}
const off = score(false), on = score(true);
console.log(`\n  the CONVENTIONAL machine   tip rms ${off.rms.toExponential(3)} m   `
  + `|θ| peak ${off.thPk.toFixed(3)} rad`);
console.log(`  the DEPLOYED object        tip rms ${on.rms.toExponential(3)} m   `
  + `|θ| peak ${on.thPk.toFixed(3)} rad   uPk ${on.uPk.toFixed(4)} of ${spec.uMax}`);
console.log(`  delivered ${(off.rms / on.rms).toFixed(3)}x   shipped `
  + `${JSON.stringify(rep.deployed)}\n`);

check('the pole stays up with whatever the ladder shipped applied',
  on.thPk < 0.30, `|θ| peak ${on.thPk.toFixed(3)} against the 0.30 guard`);
check('the machine is not made worse by what shipped', on.rms <= off.rms * 1.02,
  `${off.rms.toExponential(3)} → ${on.rms.toExponential(3)} = ${(off.rms / on.rms).toFixed(3)}x`);
check('the correction stayed inside the authority it was given', on.uPk <= spec.uMax * 1.001,
  `${on.uPk.toFixed(4)} of ${spec.uMax}`);
console.log(failed ? `\n  ${failed} check(s) failed\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);
