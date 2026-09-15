/**
 * @file THE DEPLOYED OBJECT ON A REAL STEAM HEAT EXCHANGER (DaISy 97-002) — plan §86.5.
 *
 * `realexch.test.mjs` ships the CONVENTIONAL rung here at 89.8x and refuses the pilot cascade,
 * and that figure carries a standing caution this project made about itself: the 1364x the same
 * plant reads as a LINEAR ARX measures the conventional rung's own hypothesis class, and the
 * counterflow effectiveness relation `exp(-1/u)` in the fit is what collapses it to 89.8x. The
 * deployed object has never been asked here. Every plant converted since §64 was converted by
 * asking it instead of the teacher, so this asks.
 *
 * THIS PLANT IS THE FASTEST IN THE DIRECTORY RELATIVE TO ITS PROGRAM — a 2% settle of ~37
 * samples against a 1,600-sample recipe, which is 43 response times per program where §84.9's
 * screen puts the losing plants at 5-8. On that screen it should be easy, and the window rule's
 * REACH half gives ±23: the map is asked to read half a minute of the commanded flow either side
 * of now. If the screen is right this is the cheapest win in the set; if it is not, a 43-response-
 * time program is where that screen fails, and either is worth the run.
 *
 * THE DIET IS FOUR CLOSED RECIPES THE PRODUCTION ONE IS NOT, every one inside the temperature
 * span the record supports (92.8-101.4 °C), because a diet outside it would be teaching the map
 * about a machine this data does not describe.
 *
 * KNOBS: RIDGES, GAINS, WIN, TLAPS, TAVG, DIETN, SEED, DEPTH, LINEAR=1 (the soft-target control).
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { realexchLadderSpec } from './rigs/specs.mjs';
import { deriveWindow, reportDistil, priceFrom, ridgeLadder, gainLadder, teacherReuse, teachLaps,
  teachAvg, dietN, carrier } from './rigs/distilkit.mjs';
import * as E from './rigs/realexch-rig.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-realexch: SKIPPED (full tier only — one commissioning)\n');
  process.exit(0);
}
const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
const LIN = process.env.LINEAR === '1';
const MODEL = LIN ? E.MODEL_LIN : E.MODEL;
console.log(`\ndistil-realexch: the DEPLOYED object on a REAL steam heat exchanger`
  + `${LIN ? ' (LINEAR — the soft-target control)' : ''}\n`);

/** The plant's own 2% settle to a step in commanded flow, from a settled machine. */
function measureSettle(N = 4000) {
  const p = E.makeMachine(MODEL);
  const u0 = E.flowFor(E.RECIPE[0]);
  for (let i = 0; i < 2000; i++) p.step(u0);
  const y = new Float64Array(N);
  const du = 0.2 * (E.UMAX - E.UMIN);
  for (let k = 0; k < N; k++) y[k] = p.step(u0 + du);
  const fin = y[N - 1];
  for (let k = N - 1; k >= 0; k--) if (Math.abs(y[k] - fin) > 0.02 * Math.abs(fin - y[0])) return k + 1;
  return 1;
}
const SETTLE = measureSettle();

/** Four CLOSED recipes, none of them production, all inside the record's own span. */
const RECIPES = [
  [96.0, 100.5, 94.0, 98.5, 96.0],
  [98.8, 94.8, 100.0, 95.8, 98.8],
  [95.2, 99.0, 93.6, 100.8, 95.2],
  [97.0, 93.8, 99.8, 96.6, 97.0],
];
const LAP = E.SEG * (RECIPES[0].length - 1);
const { reach: REACH, offsets: OFFSETS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin: LAP, win: process.env.WIN === undefined ? undefined : env('WIN') });
console.log(`  the plant's 2% settle is ${SETTLE} samples (${SETTLE * E.TS} s at Ts = ${E.TS} s) `
  + `against a ${LAP}-sample lap — ${(LAP / SETTLE).toFixed(0)} response times per program`);
console.log(`  window ±${REACH} samples  [rule ${RULE} = min(0.61·${SETTLE}, ${LAP}/8)]`
  + `   ${OFFSETS.length} offsets`);
console.log(`  the diet: ` + RECIPES.map((r) => r.join('→')).join('  ·  '));
console.log(`  the SCORED recipe ${E.RECIPE.join('→')} is in NO training run, and is not CLOSED `
  + `— the diet's laps are\n`);

const TLAPS = teachLaps();
const TAVG = teachAvg(TLAPS);
/** A closed recipe's own command, on the same ramp the rig uses (rule 61). */
const refOn = (rec, k) => {
  const i = Math.min(rec.length - 2, Math.floor(k / E.SEG));
  const t = (k - i * E.SEG - E.HOLD) / (E.SEG - E.HOLD);
  const q = t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 + t * (-15 + 6 * t));
  return E.flowFor(rec[i] + (rec[i + 1] - rec[i]) * q);
};
const distilRuns = () => dietN([0, 1, 2, 3]).map((i) => {
  const rec = RECIPES[i];
  const plant = carrier(() => E.makeMachine(MODEL));
  return {
    lap: LAP,
    closed: true,
    refAt: (k) => [refOn(rec, ((k % LAP) + LAP) % LAP)],
    run: async (corr) => {
      const p = plant();
      let s2 = 0, n = 0;
      const err = [new Float64Array(LAP)];
      for (let j = 0; j < TLAPS * LAP; j++) {
        const kk = ((j % LAP) + LAP) % LAP;
        const r = refOn(rec, kk);
        const u = corr ? corr.at(kk) : [0];
        const y = p.step(r + (u[0] || 0));
        const e = y - E.tempAt(MODEL, r);
        if (j >= (TLAPS - TAVG) * LAP) err[0][kk] += e / TAVG;
        if (j >= (TLAPS - 1) * LAP) { s2 += e * e; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },
  };
});

const spec = { ...realexchLadderSpec(MODEL, LIN ? 'linear' : 'nonlinear'),
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
price.close({ dt: E.TS, rep });
await reportDistil({ rep, runs: distilRuns(), nFeat: OFFSETS.length + 1, auto });

check('the exchanger is not made worse by anything the ladder ships',
  rep.best <= rep.base, `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}`);
check('the distilled rung reached the plant — a fit, a refusal with a reason, or a stated skip, '
  + 'never silence (rule 25)',
  !!(rep.distil && (rep.distil.policy || rep.distil.note || rep.distil.error)),
  JSON.stringify(rep.distil || null));
console.log(failed ? `\n  ${failed} check(s) failed\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);
