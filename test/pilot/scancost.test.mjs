/**
 * @file TARGET 6'S CONTRACT: the FULL deployed composition — forecast, QP, router, online
 * RLS, interpolation — fits 10% of a 1 ms PLC scan as ONE COUNTED NUMBER, not three reports
 * at three cadences added by hand. Until `scanCost()` existed the budget claim covered the
 * solver alone: the router was counted in its own report, the RLS in the fit's, and nothing
 * asserted the sum — which is how a budget claim quietly stops covering what actually runs.
 *
 * The composition is measured on the arm, the one plant that arms every stage: commissioned
 * from noise, corner banks from random polygons (arming the router), adaptation armed (the
 * RLS). Each arming is also a CONTROL (rule 21): it must move exactly its own part and leave
 * every other part byte-identical, or the instrument cannot see the change it exists to
 * measure. And the sum is asserted against the parts (rule 6: two views of one quantity).
 *
 * MEASURED, and the numbers the bars are set from:
 *   bare        peak  73,270   sliced 1,024   (forecast 14,278 + QP 58,986 + interp 6)
 *   + banks     peak  94,122   sliced 1,313   (router worst 20,852; smooth 320)
 *   + online    peak 166,722   sliced 9,380   (RLS 72,600 per sample — the dominant term,
 *                                              which is the doc's own "why features are the
 *                                              first thing to cut" made visible)
 *
 * THE HONEST STATEMENT: the PEAK — every cadence landing on one scan — is 16.7x over
 * budget, so a no-scheduling PLC cannot run this composition. What fits is the SLICED
 * schedule (the update spread over the interval between updates, at the price of one more
 * grid sample of look-ahead, exactly as `cost()` documents), at 94% of budget. That is a
 * real deployment mode and a real price, both stated.
 *
 * Run: node test/pilot/scancost.test.mjs
 */
import { commissionArm, recordOpenLoop, randomPolygon, fitCornerBanks }
  from './rigs/arm-rig.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const BUDGET = 10000; // 10% of a 1 ms scan, the same figure emps.test.mjs budgets against

const pilot = await commissionArm({ seed: 1 });
if (!pilot || !pilot.verdict.deploy) { console.log('  FAIL  pilot refused'); process.exit(1); }

const bare = pilot.scanCost();

const rnd = (s0) => { let z = s0 >>> 0;
  return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const recs = [];
for (const [seed, feed] of [[81, 0.004], [82, 0.008], [83, 0.0055]]) {
  recs.push(await recordOpenLoop(pilot, randomPolygon(rnd(seed), feed), feed));
}
fitCornerBanks(pilot, recs, {});
const banks = pilot.scanCost();

pilot.online = {};
const full = pilot.scanCost();
pilot.online = null;

console.log(`\n  bare   peak ${bare.peak.toLocaleString()} sliced ${bare.sliced.toLocaleString()}`);
console.log(`  +banks peak ${banks.peak.toLocaleString()} sliced ${banks.sliced.toLocaleString()}`);
console.log(`  +rls   peak ${full.peak.toLocaleString()} sliced ${full.sliced.toLocaleString()}`
  + `  bytes ${full.bytes.toLocaleString()}\n`);

// THE CONTRACT: the full composition fits the scan, sliced.
check('the full composition — QP + forecast + router + RLS — fits 10% of a 1 ms scan, sliced',
  full.sliced < BUDGET, `${full.sliced.toLocaleString()} MAC/cycle against ${BUDGET.toLocaleString()}`);
// ...and it is not cheap by being disarmed (rule 9): every stage is live in the figure.
check('…and every stage is armed in that figure, not priced at zero',
  full.parts.router > 0 && full.parts.rls > 0 && full.parts.qp > 0 && full.parts.forecast > 0,
  `router ${full.parts.router}, rls ${full.parts.rls}`);
// The peak is stated, not hidden: the coincidence scan is over budget and that is the
// price of no scheduling.
check('the peak (no scheduling) is over budget and reported as such',
  full.peak > BUDGET, `${full.peak.toLocaleString()} MAC — the sliced schedule is the deployment mode`);

// CONTROLS (rule 21): each arming moves exactly its own part.
// ARMING THE BANKS COSTS TWO THINGS, NOT ONE, AND THE SECOND IS A REAL LIMITATION RATHER THAN
// AN ACCOUNTING ARTEFACT. The forecast evaluates its lead-INVARIANT columns once for the whole
// horizon — the constant and the measured block, read at fixed offsets and multiplied by one
// shared weight vector. A router blend materialises a DIFFERENT weight vector per lead, so that
// hoist cannot fire and the forecast reverts to `features * leads`. This check used to assert
// pure additivity and it was right to go red when the hoist landed: arming the banks really does
// move the forecast term, and an engineer choosing whether to arm them needs the number.
check('arming the banks adds the router term AND forfeits the forecast hoist',
  banks.parts.router > 0 && bare.parts.router === 0
  && banks.parts.forecast >= bare.parts.forecast
  && banks.parts.qp === bare.parts.qp
  && banks.parts.rls === bare.parts.rls && banks.parts.interp === bare.parts.interp,
  `router 0 → ${banks.parts.router}, forecast ${bare.parts.forecast.toLocaleString()} → `
  + `${banks.parts.forecast.toLocaleString()}`);
// AND THE FORFEIT IS ASSERTED TO BE REAL, so it cannot quietly become zero if the hoist is
// disabled or its guard is widened without anyone noticing (rule 9, both halves).
check('…and that forfeit is non-zero, so the hoist is genuinely unavailable under a router',
  banks.parts.forecast > bare.parts.forecast,
  `${(banks.parts.forecast - bare.parts.forecast).toLocaleString()} MAC/cycle is what the`
  + ' lead-invariant hoist is worth, and a router-armed plant does not get it');
check('arming the RLS adds ONLY the rls term (and its covariance bytes)',
  full.parts.rls > 0 && banks.parts.rls === 0
  && full.parts.qp === banks.parts.qp && full.parts.forecast === banks.parts.forecast
  && full.parts.router === banks.parts.router && full.bytes > banks.bytes,
  `rls 0 → ${full.parts.rls}; bytes ${banks.bytes.toLocaleString()} → ${full.bytes.toLocaleString()}`);

// THE SUM IS THE PARTS (rule 6): the composed peak against the solver's own report.
const c = pilot.cost();
check('the composed peak equals cost().peak + router + rls, exactly',
  full.peak === Math.round(c.peakMacPerCycle + full.parts.router + full.parts.rls),
  `${full.peak} = ${Math.round(c.peakMacPerCycle)} + ${full.parts.router} + ${full.parts.rls}`);

// The router's dead zone earns its keep: a smooth program pays under 2% of the corner case.
check('the smooth-program router cost is under 2% of its worst case',
  full.parts.routerSmooth < 0.02 * full.parts.router,
  `${full.parts.routerSmooth} against ${full.parts.router}`);

console.log(failed ? `\n  ${failed} check(s) FAILED\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);
