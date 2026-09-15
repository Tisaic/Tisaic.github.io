/**
 * @file THE DEPLOYED OBJECT ON THE REAL CASCADED TANKS (Schoukens & Noël 2017) — plan §86.4.
 *
 * `realtanks.test.mjs` ships the PILOT CASCADE here at 8.00x, which makes this one of only two
 * plants in the directory where that cascade is the result. It is also 43,673 MAC/cycle and
 * 16.5 kB — 437% of a PLC scan — so what ships is an improvement no PLC would accept, which is
 * the same objection §63 raised about the barrel and which the deployed object answered there by
 * replacing a 21,440-MAC cascade with 1.6 kB.
 *
 * The deployed object has never been asked on this plant. Every plant converted since §64 was
 * converted by asking it instead of the teacher, so this asks.
 *
 * THE PLANT IS THE OVERFLOW ONE, WHICH IS THE ONLY HONEST CHOICE. The identified LINEAR model
 * reads 2012x and that number measures the conventional rung's own hypothesis class rather than
 * the machine (§55): the plant is linear, the basis is `[a, v, sign v, 1]`, and the inversion is
 * exact. The benchmark's own documented OVERFLOW — 84 samples pinned at exactly 10.00 in the
 * record — collapses it to 8.00x, and that is the plant a controller claim can be made on.
 *
 * THE DIET IS FOUR CLOSED RECIPES THE PRODUCTION ONE IS NOT. `levelOn` ramps between consecutive
 * levels over `SEG`, so a CLOSED lap is a recipe whose first and last entries agree; the
 * production recipe [5.0, 9.9, 4.2, 10.6, 5.6] is not closed and is not in the diet. Each member
 * visits the overflow region, because a diet that never reaches the clamp would teach a map about
 * a plant the scored program does not run.
 *
 * KNOBS: RIDGES, GAINS, WIN, TLAPS, TAVG, DIETN, SEED, DEPTH, LINEAR=1 (the soft-target control).
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { realtanksLadderSpec } from './rigs/specs.mjs';
import { deriveWindow, reportDistil, priceFrom, ridgeLadder, gainLadder, teacherReuse, teachLaps,
  teachAvg, dietN, carrier } from './rigs/distilkit.mjs';
import * as T from './rigs/realtanks-rig.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-realtanks: SKIPPED (full tier only — one commissioning)\n');
  process.exit(0);
}
const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
const OVER = process.env.LINEAR !== '1';
console.log(`\ndistil-realtanks: the DEPLOYED object on the REAL cascaded tanks`
  + `${OVER ? ' (overflow active)' : ' (LINEAR — the soft-target control)'}\n`);

/** The plant's own 2% settle to a step in command, measured from a settled machine. */
function measureSettle(N = 6000) {
  const p = T.makeMachine({ overflow: OVER, rec: OVER ? T.RECIPE_OF : T.RECIPE });
  const u0 = T.voltsFor((OVER ? T.RECIPE_OF : T.RECIPE)[0]);
  for (let i = 0; i < 2000; i++) p.step(u0);
  const y = new Float64Array(N);
  for (let k = 0; k < N; k++) y[k] = p.step(u0 + 0.3);
  const fin = y[N - 1];
  for (let k = N - 1; k >= 0; k--) if (Math.abs(y[k] - fin) > 0.02 * Math.abs(fin - y[0])) return k + 1;
  return 1;
}
const SETTLE = measureSettle();

/** Four CLOSED recipes, none of them production, every one visiting the overflow region. */
const RECIPES = [
  [4.6, 10.4, 6.8, 9.0, 4.6],
  [6.2, 9.6, 4.0, 10.8, 6.2],
  [5.4, 8.6, 10.5, 4.4, 5.4],
  [7.0, 4.2, 10.2, 8.0, 7.0],
];
const LAP = T.SEG * (RECIPES[0].length - 1);
const { reach: REACH, offsets: OFFSETS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin: LAP, win: process.env.WIN === undefined ? undefined : env('WIN') });
console.log(`  the plant's 2% settle is ${SETTLE} samples (${(SETTLE * T.TS / 60).toFixed(0)} min `
  + `at Ts = ${T.TS} s), the training lap ${LAP}, the scored program ${T.PROG}`);
console.log(`  window ±${REACH} samples  [rule ${RULE} = min(0.61·${SETTLE}, ${LAP}/8)]`
  + `   ${OFFSETS.length} offsets`);
console.log(`  the diet: ` + RECIPES.map((r) => r.join('→')).join('  ·  '));
console.log(`  the SCORED recipe ${(OVER ? T.RECIPE_OF : T.RECIPE).join('→')} is in NO training `
  + `run, and is not even CLOSED — the diet's laps are\n`);

const TLAPS = teachLaps();
const TAVG = teachAvg(TLAPS);
/** A closed recipe's own level and command, on the same `levelOn` the rig uses (rule 61). */
const refOn = (rec, k) => {
  const i = Math.min(rec.length - 2, Math.floor(k / T.SEG));
  const t = (k - i * T.SEG - T.HOLD) / (T.SEG - T.HOLD);
  const q = t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (10 + t * (-15 + 6 * t));
  return T.voltsFor(rec[i] + (rec[i + 1] - rec[i]) * q);
};
const wantOn = (rec, k) => {
  const v = refOn(rec, k);
  return OVER ? Math.min(T.OVERFLOW, T.levelAt(v)) : T.levelAt(v);
};
const distilRuns = () => dietN([0, 1, 2, 3]).map((i) => {
  const rec = RECIPES[i];
  const plant = carrier(() => T.makeMachine({ overflow: OVER, rec }));
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
        const u = corr ? corr.at(kk) : [0];
        const y = p.step(refOn(rec, kk) + (u[0] || 0));
        const e = y - wantOn(rec, kk);
        if (j >= (TLAPS - TAVG) * LAP) err[0][kk] += e / TAVG;
        if (j >= (TLAPS - 1) * LAP) { s2 += e * e; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },
  };
});

const spec = { ...realtanksLadderSpec({ overflow: OVER }),
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
price.close({ dt: T.TS, rep });
await reportDistil({ rep, runs: distilRuns(), nFeat: OFFSETS.length + 1, auto });

check('the real tank is not made worse by anything the ladder ships',
  rep.best <= rep.base, `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}`);
check('the distilled rung reached the plant — a fit, a refusal with a reason, or a stated skip, '
  + 'never silence (rule 25)',
  !!(rep.distil && (rep.distil.policy || rep.distil.note || rep.distil.error)),
  JSON.stringify(rep.distil || null));
console.log(failed ? `\n  ${failed} check(s) failed\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);
