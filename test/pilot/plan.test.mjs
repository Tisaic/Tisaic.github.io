/**
 * @file THE PLAN A RUNG PUBLISHES MUST BE THE PLAN IT SPENDS.
 *
 * Commissioning is tens of minutes and the page now shows a denominator and a per-stage
 * criterion, so an operator can answer "how far through" and "what is it waiting for". Both
 * come from `HarmonicFF.plan()`.
 *
 * A PLAN THAT DRIFTS FROM THE RUN IS WORSE THAN NO PLAN. "run 41 of ~85" is read as fact; if
 * the real spend were 120 the reader would conclude the machine was stuck at exactly the
 * moment it was working normally — which is the failure this whole line of work started
 * from. So the estimate is pinned against the budget the run actually reports.
 */
import { HarmonicFF } from '../../lib/pilot/hff.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};

console.log('\npilot: the harmonic rung publishes a plan it keeps');

// A TINY LAP-PERIODIC PLANT. The plan is arithmetic on the rung's own constants, so it does
// not need the arm to be exercised — what needs exercising is that the arithmetic matches
// the laps a real commission spends.
const LAP = 48, NC = 1;
const disturbance = (k) => 0.4 * Math.sin(2 * Math.PI * 3 * k / LAP)
  + 0.2 * Math.cos(2 * Math.PI * 5 * k / LAP);
let runs = 0;
const run = async (corr) => {
  runs++;
  const err = [new Float64Array(LAP)];
  let s2 = 0;
  for (let k = 0; k < LAP; k++) {
    const u = corr ? corr.at(k)[0] : 0;
    err[0][k] = disturbance(k) - 0.8 * u;
    s2 += err[0][k] * err[0][k];
  }
  return { score: Math.sqrt(s2 / LAP), err };
};

const h = new HarmonicFF({ lap: LAP, channels: NC, uMax: 2, nh: 8, passes: 6, banded: false });
const plan = h.plan();
const stages = [];
h.onStage = (d) => { if (!stages.length || stages.at(-1) !== d.stage) stages.push(d.stage); };

check('plan() names every stage and gives each a run count and a criterion',
  plan.stages.length >= 4 && plan.stages.every((s) => s.name && s.runs > 0 && s.ends.length > 20),
  JSON.stringify(plan.stages.map((s) => [s.name, s.runs])));
// A STAGE IS INEXACT ONLY IF IT REALLY CANNOT BE COUNTED IN ADVANCE. Refinement stops early
// by design; the candidate sweep depends on whether a knee is found in the measured error
// spectrum. Everything else is arithmetic on constants and must be exact, or the plan is
// hedging where it does not need to — a ceiling on a stage that has a known cost makes the
// total useless in the direction that reads as a stall.
const inexact = plan.stages.filter((x) => !x.exact).map((x) => x.name);
check('…and the CEILINGS are exactly the stages that genuinely cannot be counted ahead',
  inexact.length === 2 && inexact.includes('refining') && inexact.includes('scoring candidates'),
  JSON.stringify(plan.stages.map((x) => [x.name, x.exact])));

const rep = await h.commission(run);
const exact = plan.stages.filter((s) => s.exact).reduce((a, s) => a + s.runs, 0);
console.log('  BUDGET THE RUN REPORTS:', JSON.stringify(rep.budget));
console.log('  PLAN:', JSON.stringify(plan.stages.map((s) => [s.name, s.runs])));
console.log(`  runs spent ${runs}; plan total ~${plan.total} (exact stages ${exact}, `
  + `refining ≤${plan.total - exact}); stages seen: ${stages.join(' → ')}`);

// THE REAL SPEND MUST LIE INSIDE THE PLAN: at least the stages that cannot stop early, and
// never more than the whole budget. A run that exceeded its own published ceiling would make
// the denominator a lie in the direction that reads as a stall.
check('the run spends at least the stages that CANNOT stop early', runs >= exact,
  `${runs} spent against ${exact} unavoidable`);
check('…and never more than the published total, so the denominator cannot be exceeded',
  runs <= plan.total, `${runs} spent against a published ~${plan.total}`);
// WHETHER IT STOPPED EARLY IS THE PLANT'S BUSINESS, NOT THE PLAN'S. On a clean synthetic
// plant the refinement can legitimately use its whole budget, so asserting early exit here
// would be asserting a property of this test's disturbance. What must hold is that when it
// DOES stop early it says why — a run that quietly ends short is indistinguishable from one
// that failed.
console.log(`  refinement ${rep.stopped ? `stopped early: ${rep.stopped.slice(0, 80)}` : 'used its full budget'}`);
check('…and a run that ends short SAYS why, rather than just ending',
  runs === plan.total || typeof rep.stopped === 'string',
  `spent ${runs} of ${plan.total} with stopped=${JSON.stringify(rep.stopped)}`);
check('every stage the plan names is actually entered and reported',
  plan.stages.every((s) => stages.includes(s.name)),
  `planned ${JSON.stringify(plan.stages.map((s) => s.name))} vs seen ${JSON.stringify(stages)}`);
check('…and the rung still works — the correction improves the machine',
  rep.best < rep.base, `${rep.base} → ${rep.best}`);

console.log(failed ? `\nplan: ${failed} check(s) FAILED\n` : '\nplan: all checks passed\n');
process.exit(failed ? 1 : 0);
