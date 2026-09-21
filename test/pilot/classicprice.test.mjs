// THE CONVENTIONAL RUNG IS PRICED BEFORE THE BUDGET ADMITS IT (plan §127).
//
// §124 gave the teacher-taught rung and the lap-periodic rung an ESTIMATE so a `plantBudget`
// could refuse either before it spent a lap. The CONVENTIONAL rung had none, and it is the
// larger bill wherever the teacher is already gone: on the real cascaded tanks it is 15 of a
// budgeted commissioning's 17 scored runs — 65% of the whole thing — and it is then REFUSED,
// while on the real steam exchanger the same 14 runs buy 1.11x. So the decision belongs to a
// budget and never to a blanket skip, and both of those outcomes must be reachable.
//
// WHAT IS PINNED, and it is deliberately NOT a plant result (rule 14): the ARITHMETIC, and the
// fact that the gate is asked BEFORE the rung's first lap. `ClassicFF.plan()` is the loop's own
// worst case, so the three early exits inside `commission` (headroom, dead trials, pace) can
// only make the bill smaller — which is what makes the estimate a BOUND rather than a guess,
// and the bound is ASSERTED here in the one direction that matters.
//
// BOTH HALVES (rule 9), because a gate that only ever skips is worth nothing: a budget that
// fits ADMITS the rung and it runs to completion; a budget that does not SKIPS it with a
// stated row and never calls the training closure; no budget at all is byte-identical to the
// path every existing caller commissions through (rule 21).
import { AutoStack } from '../../lib/pilot/autostack.js';
import { ClassicFF, motionBasis } from '../../lib/pilot/classic.js';

let failed = 0;
const ck = (n, c, d) => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`);
  if (!c) failed++;
};

console.log('\nTHE CONVENTIONAL RUNG, PRICED BEFORE IT RUNS (plan §127)\n');

const N = 40;
const ref = { q: new Float64Array(N), v: new Float64Array(N), a: new Float64Array(N) };
for (let k = 0; k < N; k++) {
  ref.q[k] = Math.sin(2 * Math.PI * k / N);
  ref.v[k] = Math.cos(2 * Math.PI * k / N);
  ref.a[k] = -Math.sin(2 * Math.PI * k / N);
}
const basis = motionBasis([ref], { bias: true });

// ------------------------------------------------------- (1) the plan is the loop's worst case
{
  const c = new ClassicFF({ basis, channels: 1, passes: 8, backtracks: 5 });
  const p = c.plan();
  const m = basis.n * 1;
  ck('plan() = 1 baseline + (m+1) probes + (passes + backtracks) refinement trials',
    p.laps === 1 + (m + 1) + 13 && p.parts.probes === m + 1 && p.parts.refine === 13,
    JSON.stringify(p));
  ck('...and it declares itself INEXACT, because every exit inside the loop can only shorten it',
    p.exact === false);
  // THE BOUND, ASSERTED IN THE DIRECTION THAT MATTERS: a commission that runs to completion
  // must not spend MORE laps than the plan said. Driven against a plant the rung can actually
  // improve, so the refinement loop genuinely runs rather than exiting on the first lap.
  let laps = 0;
  const gain = 0.4;
  const run = async (corr) => {
    laps++;
    const err = [new Float64Array(N)];
    for (let k = 0; k < N; k++) {
      const u = corr ? (corr.at(k)[0] || 0) : 0;
      err[0][k] = ref.v[k] * 0.5 - gain * u;
    }
    let s2 = 0; for (let k = 0; k < N; k++) s2 += err[0][k] ** 2;
    return { score: Math.sqrt(s2 / N), err };
  };
  const c2 = new ClassicFF({ basis, channels: 1, passes: 8, backtracks: 5 });
  const r = await c2.commission(run);
  ck('the commission never spends more laps than its own plan (the estimate is a BOUND)',
    laps <= p.laps, `${laps} laps against a plan of ${p.laps}`);
  ck('...and it was a real commission rather than an exit on lap one (rule 9c)',
    laps > 2 && r.best < r.base, `${laps} laps, ${r.base} → ${r.best}`);
}

// ------------------------------------------------- (2) the gate, both halves, through the ladder
// THE METER ADVANCES, because a host whose plant does not move cannot be priced at all — and
// the library now says so rather than reading every estimate as free (rule 25). One run is N
// steps, which is what makes `stepsPerScored` measurable and the gate reachable.
const mkHost = (spent0) => {
  let trained = 0, spent = spent0;
  const run = async (corr) => {
    spent += N;
    const err = [new Float64Array(N)];
    for (let k = 0; k < N; k++) {
      const u = corr && corr.at ? (corr.at(k)[0] || 0) : 0;
      err[0][k] = ref.v[k] * 0.5 - 0.4 * u;
    }
    let s2 = 0; for (let k = 0; k < N; k++) s2 += err[0][k] ** 2;
    return { score: Math.sqrt(s2 / N), err };
  };
  return {
    host: {
      run,
      runClassic: async (corr, name) => { trained++; return run(corr); },
      lap: N, refAt: (k) => [ref.q[((k % N) + N) % N]],
      look: (o) => [ref.q[((o % N) + N) % N]],
      spent: () => spent,
    },
    laps: () => trained,
  };
};

const mk = (budget) => new AutoStack({
  channels: [{ max: 3 }], authority: 1, floor: 0, maxDepth: 0, basis,
  ...(budget === null ? {} : { plantBudget: budget }) });

for (const [label, spent, budget, expectRun] of [
  ['no budget', 0, null, true],
  ['a budget that FITS', 0, 1e9, true],
  ['a budget that does NOT fit', 0, 200, false]]) {
  const { host, laps } = mkHost(spent);
  const a = mk(budget);
  const rep = await a.commission(host);
  const row = rep.rungs.find((r) => /conventional/.test(r.name));
  ck(`${label}: the rung ${expectRun ? 'RUNS' : 'does NOT run'}`,
    (laps() > 0) === expectRun, `${laps()} training lap(s)`);
  if (expectRun) {
    ck(`${label}: no SKIPPED row`, !!row && !/SKIPPED/.test(row.name), row && row.name);
  } else {
    ck(`${label}: a SKIPPED row states the estimate against the budget (rule 25)`,
      !!row && /SKIPPED/.test(row.name) && row.deployed === false
      && /this rung would spend/.test(row.note), row && row.note);
    ck(`${label}: the report names the phase and carries the estimate`,
      rep.budget.skipped.some((x) => /① conventional/.test(x.phase))
      && rep.budget.rungs['① conventional'].estimate.steps > 0,
      JSON.stringify(rep.budget && rep.budget.rungs));
    ck(`${label}: a skipped rung records NO spend — it never ran (rule 25)`,
      rep.budget.rungs['① conventional'].spent === undefined,
      JSON.stringify(rep.budget.rungs['① conventional']));
  }
}

// ------------------------------- (2b) A FROZEN METER IS *NOT MEASURED*, NOT FREE (rule 9b, 25)
//
// Found by this test's own first mock, which returned a CONSTANT `spent()`. `stepsPerScored` then
// measured 0, every estimate multiplied out to `0 steps`, and every rung was admitted whatever the
// budget — a gate that cannot fire, silently, which is the shape of the three guards that shipped
// armed and unreachable. The estimate is WITHHELD now and the report says why.
{
  const { host } = mkHost(0);
  host.spent = () => 5;                       // a meter that never advances
  const a = mk(1);
  const rep = await a.commission(host);
  ck('a frozen meter prices NOTHING and states the reason rather than reading as free',
    rep.budget.scoredRunSteps === null && /no rung can be priced/.test(rep.budget.note || ''),
    JSON.stringify(rep.budget));
  ck('...and nothing is skipped on an estimate that does not exist',
    rep.budget.skipped.every((x) => x.by !== 'estimate'), JSON.stringify(rep.budget.skipped));
}

// --------------------------------------------- (3) unbudgeted is byte-identical to the old path
{
  const { host: h1 } = mkHost(0);
  const { host: h2 } = mkHost(0);
  const r1 = await mk(null).commission(h1);
  const r2 = await mk(null).commission(h2);
  const strip = (r) => JSON.stringify(r.rungs.map((x) => [x.name, x.score, x.deployed]));
  ck('unset plantBudget leaves the ladder byte-identical run to run (rule 21)', strip(r1) === strip(r2));
  ck('...and records no budget at all', r1.budget === null, JSON.stringify(r1.budget));
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} check(s) failed\n`);
process.exit(failed === 0 ? 0 : 1);
