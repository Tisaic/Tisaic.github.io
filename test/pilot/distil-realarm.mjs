/**
 * @file THE DEPLOYED OBJECT ON A PLANT WHOSE DYNAMICS CAME FROM REAL HARDWARE, AND WHOSE
 * RESPONSE GOES THE WRONG WAY FIRST (plan §86.3).
 *
 * `realarm.test.mjs` ships the conventional rung at 1.93x and REFUSES the pilot cascade, and
 * §84.11 gave that refusal a cause: put into `invert.mjs` this is the only plant of six reading
 * **INVERSE 128.3%** — hold a correction and the plant first goes 1.28 times further the WRONG
 * way than it ever goes the right way. The pilot INVERTS A FORECAST, so on a plant whose first response
 * is of the opposite sign the inversion is wrong in SIGN, which is the record's own "wrong rather
 * than clipped" measured rather than inferred. §84.11 then says what it does not say:
 *
 *   "It does NOT say the plant is unwinnable — §56's ZPETC rival exists for exactly this
 *    inversion and the deployed object has never been asked here."
 *
 * THE DEPLOYED OBJECT DOES NOT INVERT A MODEL. It regresses a CONVERGED CORRECTION onto a window
 * of the commanded reference, so a response that begins in the wrong direction is something the
 * teacher measures and the map reproduces, rather than something a sign has to be right about.
 * That is the whole reason this plant is worth asking.
 *
 * THE WINDOW IS THE HARD PART AND IT IS WHY THE DIET IS TOURS. This plant's memory is **4,385
 * steps against a 512-step lap — 8.6 laps**, the worst ratio in this project (the lattice arm is
 * 1.07). `min(0.61·settle, lap/8)` on the scored program's own lap gives ±64, which reaches 1.5%
 * of the memory, and §49.11's forced trade has exactly one measured escape: training laps that
 * DIFFER, and in particular a single long TOUR. So every diet member is one closed lap of 12-16
 * transitions at different edge widths, and the aliasing bound is then the tour's lap rather than
 * the program's.
 *
 * AND EVERY TOUR IS SIZED ON THE MACHINE, NOT FROM THE SPECTRAL BOUND. The rig's own amplitude
 * rule sums |R_m|/|H_pos| over the program's harmonics, which is a worst-case bound: measured, the
 * shipped program demands 16.8% of the drive where that bound reserves 30%, and the bound's
 * conservatism GROWS with the number of harmonics, so a longer tour sized by it would be 10-40x
 * smaller than the program. A diet at a fortieth of the program's amplitude is rule 41b in its
 * other direction, and this rig has already paid for that fault once. Each tour is therefore
 * bisected to demand the SAME fraction of the drive the shipped program actually demands (rule 20).
 *
 * KNOBS: RIDGES, GAINS, WIN, TLAPS, TAVG, DIETN, SEED, DEPTH.
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { realarmLadderSpec } from './rigs/specs.mjs';
import { deriveWindow, reportDistil, priceFrom, ridgeLadder, gainLadder, teacherReuse, teachLaps,
  teachAvg, dietN, carrier } from './rigs/distilkit.mjs';
import * as A from './rigs/realarm-rig.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-realarm: SKIPPED (full tier only — one commissioning)\n');
  process.exit(0);
}
const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
console.log('\ndistil-realarm: the DEPLOYED object on a REAL flexible arm (DaISy 96-009)\n');

// ------------------------------------------------ the plant's memory, MEASURED not asserted
/** Two machines from the same construction under the same program, one carrying a HELD
 *  correction, differenced — so the program cancels exactly and what is left is the plant's own
 *  response to a correction. `invert.mjs`'s method, here for the window's reach half. */
function memory(amp = 0.02 * A.AMP, N = 40000) {
  const a = A.makeMachine(), b = A.makeMachine();
  const d = new Float64Array(N);
  for (let k = 0; k < N; k++) d[k] = b.step(A.refAtStep(k)[0] + amp) - a.step(A.refAtStep(k)[0]);
  let fin = 0; for (let k = N - 2000; k < N; k++) fin += d[k] / 2000;
  for (let k = N - 1; k >= 0; k--) if (Math.abs(d[k] - fin) > 0.02 * Math.abs(fin)) return k + 1;
  return 1;
}
const SETTLE = memory();

// ------------------------------------------------------ what the drive the program asks for
/** Peak |torque| over a settled span, which is the quantity the diet is matched on. */
function peakDrive(at, lap, laps = 24) {
  const m = A.makeMachine(A.LOOP, { warm: false });
  for (let k = 0; k < laps * lap; k++) m.step(at(k));
  let pk = 0;
  for (let k = laps * lap; k < (laps + 4) * lap; k++) { m.step(at(k)); pk = Math.max(pk, Math.abs(m.torque)); }
  return pk;
}
const PROG_DRIVE = peakDrive((k) => A.refAtStep(k)[0], A.LAP) / A.TMAX;

/** A tour sized to demand the same drive fraction the shipped program does. Bisected on the
 *  MACHINE because the rig's spectral rule is a worst-case sum whose conservatism grows with the
 *  harmonic count, and a tour has eight times as many harmonics as the program. */
function sizeTour(lap, edges) {
  const g = A.makeProgram({ lap, edges });
  const unit = (k) => g.at(k)[0] / g.amp;
  let lo = 1e-4, hi = 1e4;
  for (let i = 0; i < 28; i++) {
    const mid = Math.sqrt(lo * hi);
    if (peakDrive((k) => mid * unit(k), lap, 12) / A.TMAX > PROG_DRIVE) hi = mid; else lo = mid;
  }
  const amp = Math.sqrt(lo * hi);
  return { lap, edges, amp, at: (k) => [amp * unit(k)] };
}

/** Four tours, none of them the scored program: 12-16 transitions per closed lap, every edge
 *  width different, segment durations held at the program's own 256 samples so the diet lives in
 *  the same band the program does. */
/** TOURX repeats each tour's edge list, so the LAP grows while the segment duration and the
 *  spectral content stay put. It is the one lever that can make the window rule's two halves
 *  compatible on this plant: the reach wants 2,675 steps and the aliasing bound is lap/8, so a
 *  window that reaches this memory needs a lap of at least ~21,000. Unset is 1. */
const TOURX = Math.max(1, env('TOURX', 1));
const rep4 = (a) => Array.from({ length: TOURX }, () => a).flat();
const DIET = [
  [4096, [40, 90, 140, 190, 240, 140, 60, 200, 110, 250, 80, 170, 220, 50, 130, 190]],
  [4096, [60, 120, 180, 240, 200, 100, 150, 220, 80, 140, 200, 60, 240, 160, 100, 180]],
  [3072, [50, 110, 170, 230, 90, 150, 210, 70, 130, 190, 240, 120]],
  [3584, [70, 130, 190, 250, 110, 170, 230, 90, 150, 210, 60, 200, 140, 180]],
].map(([lap, edges]) => sizeTour(lap * TOURX, rep4(edges)));
const LAPMIN = Math.min(...DIET.map((g) => g.lap));
const { reach: REACH, offsets: OFFSETS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin: LAPMIN, win: process.env.WIN === undefined ? undefined : env('WIN') });
console.log(`  the plant's own memory is ${SETTLE} steps against a ${A.LAP}-step scored lap — `
  + `${(SETTLE / A.LAP).toFixed(1)} LAPS, the worst ratio in this project`);
console.log(`  so the diet is TOURS: shortest lap ${LAPMIN}, window ±${REACH} raw steps `
  + `[rule ${RULE} = min(0.61·${SETTLE}, ${LAPMIN}/8)], ${OFFSETS.length} offsets`);
console.log(`  the shipped program demands ${(100 * PROG_DRIVE).toFixed(1)}% of the drive; every `
  + `tour is bisected to the same, amplitudes ` + DIET.map((g) => g.amp.toExponential(2)).join(', ')
  + `  against the program's ${A.AMP.toExponential(2)}`);
console.log(`  the SCORED program (lap ${A.LAP}, edge ${A.EDGE}) is in NO training run\n`);

// THE TEACHER MUST SETTLE, AND ON THIS PLANT THAT IS LAPS AND NOT ONE LAP (rules 12, 13). The
// ring locks in over ~13 laps of the scored program, and the memory above is 4,385 steps: with a
// tour lap of 3,072-4,096 two settle laps clear it and one lap is the record. The default
// everywhere else is 2; here it is 3, stated rather than carried (rule 31).
const TLAPS = teachLaps(3);
const TAVG = teachAvg(TLAPS);
const distilRuns = () => dietN([0, 1, 2, 3]).map((i) => {
  const g = DIET[i];
  const plant = carrier(() => A.makeMachine(A.LOOP, { warm: false }));
  return {
    lap: g.lap,
    closed: true,
    refAt: (k) => g.at(k),
    run: async (corr) => {
      const m = plant();
      let s2 = 0, n = 0;
      const err = [new Float64Array(g.lap)];
      for (let j = 0; j < TLAPS * g.lap; j++) {
        const kk = ((j % g.lap) + g.lap) % g.lap;
        const r = g.at(kk)[0];
        const u = corr ? corr.at(kk) : [0];
        const x = m.step(r + (u[0] || 0));
        const e = x - r;
        if (j >= (TLAPS - TAVG) * g.lap) err[0][kk] += e / TAVG;
        if (j >= (TLAPS - 1) * g.lap) { s2 += e * e; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },
  };
});

const spec = { ...realarmLadderSpec,
  // NO CASCADE: §84.11 measured why it refuses and the teacher here is `hff`, so a cascade would
  // be commissioned, scored and then replaced by the rung that wins (plan §73.1). `DEPTH=1` is
  // the control and reproduces `realarm.test.mjs`'s own refusal.
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
const { rep, auto } = await ladder(spec);
price.close({ dt: 1, rep });
await reportDistil({ rep, runs: distilRuns(), nFeat: OFFSETS.length + 1, auto });

check('the arm is not made worse by anything the ladder ships',
  rep.best <= rep.base, `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}`);
check('the distilled rung reached the plant at all — a fit, a refusal with a reason, or a '
  + 'stated skip, never silence (rule 25)',
  !!(rep.distil && (rep.distil.policy || rep.distil.note || rep.distil.error)),
  JSON.stringify(rep.distil || null));
console.log(failed ? `\n  ${failed} check(s) failed\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);
