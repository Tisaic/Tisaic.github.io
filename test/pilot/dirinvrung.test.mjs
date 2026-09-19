// THE TEACHER-FREE DIRECT INVERSE, DRIVEN THROUGH `AutoStack` RATHER THAN CALLED (plan §112).
//
// §105 ended with a standing line — *nothing is integrated; `dirinvall.mjs` is an INSTRUMENT and
// no `AutoStack` rung offers this route* — and §112 built the rung. What this file pins is the
// PATH to it, which is the part that keeps breaking here: rule 9b was written because THREE
// guards shipped armed and unreachable and every one of them passed its own unit test, because a
// unit test calls the function and what is broken is the wiring to it. §102.1 then found two more
// where `AutoStack` simply never passed the option to the object it built.
//
// So every check below goes through `commission()` on a host, never through `DistilPolicy`
// directly. The plant is a deliberately trivial one built here — a first-order lag with a known
// static gain — because what is under test is the RUNG, and a plant whose right answer is not
// known cannot say whether the rung got it.
//
// THE FACTOR THIS FILE PRINTS IS NOT A CONTROLLER RESULT AND MUST NEVER BE QUOTED AS ONE
// (rule 14). The plant here is a NOISELESS, EXACTLY INVERTIBLE first-order lag, so a linear map of
// the right window inverts it to machine precision and the rung reads of order 1e6x. That is the
// DeePC signature §54.8 disqualified a rival for — a score climbing without bound because an
// unregularised solve is approaching exact interpolation of its own data on a deterministic rig —
// and here it is the RIG BY CONSTRUCTION rather than a finding. It is what makes this a good PATH
// test (if the route is wired correctly the answer is unmistakable, and any wiring fault collapses
// it to exactly 1.000x) and it is why the assertion below is on the PATH and a loose bound, never
// on the magnitude. The route's real factors are on ten plants in §§103-105 and §111: 3.0-10.0x on
// the barrel, 3.4-4.5x on the column, 1.39-1.70x on the 2R arm.
//
// BOTH HALVES (rule 9): the rung REACHES the machine and improves it when the route applies, AND
// it is a STATED skip rather than a silent one on a host that does not offer the hook; AND a host
// that offers the hook but no window is told so rather than being given a default window, because
// the window is the plant's own and §103 measured a carried one costing 2.3x of a headline.
import { AutoStack } from '../../lib/pilot/autostack.js';

let failed = 0;
const ck = (n, c, d) => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`);
  if (!c) failed++;
};

// ---------------------------------------------------------------------------- the plant
// y[k+1] = y[k] + A*(G*u[k] - y[k]). Its nominal inverse is y/G, so a commanded `c` in reference
// units is `u = c/G`, and the ACHIEVED output mapped back is `inv(y) = y/G`. The lag is what the
// correction has to undo, and it is first-order so a short window can express it exactly — which
// is the point: if the rung cannot win here it cannot win anywhere.
const G = 2.0, A = 0.25, N = 2000;
const inv = (y) => y / G;
const mkPlant = () => { let y = 0; return { step: (u) => { y += A * (G * u - y); return y; } }; };

// A reference the machine has to chase: piecewise ramps and holds, deterministic.
const refAt = (k) => {
  const seg = Math.floor(k / 250) % 4;
  const t = (k % 250) / 250;
  return [seg === 0 ? t : seg === 1 ? 1 : seg === 2 ? 1 - t : 0];
};

/** One open-loop run: drive `c` through the plant's own nominal inverse and record both series. */
const openLoop = (cAt, n) => {
  const p = mkPlant(), C = [], U = [];
  for (let k = 0; k < n; k++) {
    const c = cAt(k);
    const y = p.step(c[0] / G * G / G === 0 ? 0 : c[0]);   // u = c in reference units here
    C.push([c[0]]); U.push([inv(y)]);
  }
  return { C, U, n };
};

// The EXCITATION diet — deliberately not the scored program (rule 36's own shape).
const rnd = (s0) => { let s = s0 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
const dietRuns = () => {
  const out = [];
  for (let d = 0; d < 3; d++) {
    const r = rnd(7 + d); let cur = 0, hold = 0;
    out.push(openLoop((k) => { if (hold-- <= 0) { cur = r(); hold = 20 + Math.floor(60 * r()); } return [cur]; }, 1500));
  }
  return out;
};

const OFFS = [-24, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 24];

/**
 * A host of the shape `AutoStack` actually drives, and THE FIRST VERSION OF THIS WAS WRONG IN THE
 * WAY THIS PROJECT HAS PAID FOR TWICE.
 *
 * `scored(corr, ...)` hands the host the CANDIDATE correction, not the ladder's act path — the
 * host is expected to call `auto.act(ctx)` itself for whatever is ARMED and to add `corr` on top
 * for the rung being tried. My first mock treated the callback as the act function, so with
 * `corr` null it applied NOTHING, and the rung duly read a fit at held-out R² 0.999999999978 and
 * a machine at EXACTLY 1.000x. That is `distil-tank.mjs`'s §67.3 defect reproduced inside the
 * test written to prevent it: the rung was absent from the run that scored it.
 *
 * So the loop mirrors `rigs/ladder.mjs`'s: `auto.act(...)`, then `auto.into(corr.at(k))` added on
 * top (rule 61 — one shape for one thing, even in a mock).
 */
const mkHost = (auto, extra = {}) => ({
  channels: [{ max: 3 }],
  run: async (corr, cname) => {
    const p = mkPlant(); let s2 = 0, n = 0, pk = 0;
    for (let k = 0; k < N; k++) {
      const c = refAt(k);
      const look = (o) => refAt(k + o);
      const u = auto.act({ v: [0], a: [0], look, lookRaw: look });
      if (corr) { const w = auto.into(corr.at(k), cname, {}); u[0] += w[0]; }
      if (u[0]) pk = Math.max(pk, Math.abs(u[0]));
      const y = p.step(c[0] + u[0]);
      if (k > N * 0.05) { s2 += (inv(y) - c[0]) ** 2; n++; }
    }
    return { score: Math.sqrt(s2 / n), clip: { frac: 0, over: null }, uPk: pk };
  },
  ...extra,
});

console.log('\nTHE TEACHER-FREE DIRECT INVERSE, THROUGH THE ONE PRESS (plan §112)\n');

// ------------------------------------------------------------ (1) a host WITHOUT the hook
const a0 = new AutoStack({ channels: [{ max: 3 }], authority: 0.6, floor: 0,
  classic: false, maxDepth: 0, dirInv: { offsets: OFFS } });
await a0.commission(mkHost(a0));
ck('a host with NO dirInvRuns gets a STATED skip, not a silent one (rule 25)',
  !!(a0.report.dirInv && /has no dirInvRuns/.test(a0.report.dirInv.note || '')),
  JSON.stringify(a0.report.dirInv));

// ------------------------------------------------ (2) the hook present but NO window given
const a1 = new AutoStack({ channels: [{ max: 3 }], authority: 0.6, floor: 0,
  classic: false, maxDepth: 0, dirInv: {} });
await a1.commission(mkHost(a1, { dirInvRuns: dietRuns }));
ck('offered the hook but no offsets, it says so rather than inventing a window (§103\'s 2.3x)',
  !!(a1.report.dirInv && /no offsets/.test(a1.report.dirInv.note || '')),
  JSON.stringify(a1.report.dirInv));

/**
 * THE PLACEMENT AND THE SLOT-RESTORE CONTRACT ARE PINNED ON A PLANT, NOT HERE, AND THAT IS
 * DELIBERATE (plan §117, rule 9b). `dirInv.first` moves this rung to the other side of the
 * conventional one, and §117 found that with ①d deployed a LATER rung's refusal disarmed it —
 * `②d` nulled `deployed.distil` unconditionally, which had been right by accident for as long as
 * nothing else could fill that slot. Neither fault is reachable from this file: it runs
 * `classic: false, maxDepth: 0`, so there is no rung on either side to be placed against and no
 * teacher-taught candidate to refuse. Reproducing them here would mean building a second ladder
 * in a mock, which is the thing rule 9b says does not catch this class — what catches it is the
 * SHIPPED path, and `distil-pend.mjs` carries it: `DIRFIRST=1` exercises the placement and a check
 * asserts the ladder's own shipped factor against an independent scored run, fired both ways.
 */

// ------------------------------------------------------------- (3) THE RUNG REACHES THE MACHINE
const a2 = new AutoStack({ channels: [{ max: 3 }], authority: 0.6, floor: 0,
  classic: false, maxDepth: 0, dirInv: { offsets: OFFS } });
const rep2 = await a2.commission(mkHost(a2, { dirInvRuns: dietRuns }));
const row = rep2.rungs.find((r) => /direct inverse/.test(r.name));
ck('the rung RAN and appears in the ladder', !!row, JSON.stringify(rep2.rungs.map((r) => r.name)));
ck('the fit vouched for itself', !!(rep2.dirInv && rep2.dirInv.deploy),
  JSON.stringify(rep2.dirInv && rep2.dirInv.reason));
if (row) {
  console.log(`    ${row.name}  ${row.score.toExponential(4)}  `
    + `${row.gain === null ? '—' : row.gain.toFixed(3) + 'x'}`);
  console.log(`    rows ${rep2.dirInv.rows}, features ${rep2.dirInv.features}, `
    + `${rep2.dirInv.mac} MAC/decision, held-out R² ${JSON.stringify(rep2.dirInv.heldOutR2)}`);
  // IT MUST ACTUALLY IMPROVE THE MACHINE, not merely be admitted. This plant's lag is exactly
  // expressible by the window, so a rung that cannot beat the open loop here is broken rather
  // than merely unlucky.
  ck('it DEPLOYED — it beat the machine below it on the machine', row.deployed === true,
    `gain ${row.gain}`);
  // A LOOSE BOUND ON PURPOSE. The magnitude belongs to the toy plant (see the header); what is
  // being asserted is that the correction REACHED the machine, and the failure mode this catches
  // is the one it already caught once — a rung fitted, vouched for and never applied reads
  // EXACTLY 1.000x, which is `distil-tank.mjs`'s §67.3 signature.
  ck('and the improvement is real, not inside the floor', row.gain > 1.5, `${row.gain}x`);
  ck('...and it is the RIG that makes it enormous, not a result (rule 14) — stated, not asserted',
    true);
}
ck('ZERO teacher laps: no cascade was built and none was needed',
  !a2.deployed.stack, `stack ${a2.deployed.stack}`);

// ------------------------------------------- (4) the CONTROL: shuffled targets must not deliver
// The same rows against a permuted target. If this still deploys and helps, the rung is reading
// the excitation's mean or a scoring artefact and not the map (rule 15).
const shuffled = () => dietRuns().map((s) => {
  const idx = [...s.C.keys()]; const r = rnd(99);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { C: idx.map((i) => s.C[i]), U: s.U, n: s.n };
});
const a3 = new AutoStack({ channels: [{ max: 3 }], authority: 0.6, floor: 0,
  classic: false, maxDepth: 0, dirInv: { offsets: OFFS } });
const rep3 = await a3.commission(mkHost(a3, { dirInvRuns: shuffled }));
const row3 = rep3.rungs.find((r) => /direct inverse/.test(r.name));
const shuffledHelped = !!(row3 && row3.deployed && row3.gain > 1.1);
ck('SHUFFLE control: a fit on permuted targets does not deliver (rule 15)', !shuffledHelped,
  row3 ? `${row3.name} at ${row3.gain}x` : 'the rung did not run at all');

// ------------------------------------------------ (5) the deploy path is the SHIPPED distil one
ck('it arms through the SAME deployed.distil path the ②d rung uses (rule 61)',
  a2.deployed.distil === true, `distil ${a2.deployed.distil}`);
ck('and what it armed is the object it fitted', a2.distil === rep2.dirInv.policy);

// ------------------------------------------------ (6) THE PLANT-TIME BUDGET GATE (plan §120)
//
// A rung past the budget must NOT START — the gate is asked before `host.distilRuns()` is called,
// so a skipped teacher spends nothing. BOTH HALVES (rule 9): no budget calls the teacher and is
// byte-identical to the report shape above; a budget that is not yet spent calls it too; a budget
// already spent skips it with a STATED row and never calls it (rule 25).
const teacherRow = (rep) => rep.rungs.find((r) => /②d distilled/.test(r.name));
for (const [label, spent, budget, expectCalled] of [
  ['no budget', 10, null, true], ['budget not yet spent', 10, 100, true], ['budget spent', 200, 100, false]]) {
  let called = false;
  const a = new AutoStack({ channels: [{ max: 3 }], authority: 0.6, floor: 0, classic: false,
    maxDepth: 0, dirInv: { offsets: OFFS }, distil: { offsets: OFFS },
    ...(budget === null ? {} : { plantBudget: budget }) });
  const rep = await a.commission(mkHost(a, { dirInvRuns: dietRuns, spent: () => spent,
    distilRuns: () => { called = true; return []; } }));
  ck(`${label}: the teacher is ${expectCalled ? 'CALLED' : 'NOT called'}`, called === expectCalled);
  const row = teacherRow(rep);
  if (expectCalled) {
    ck(`${label}: no SKIPPED row and the ②d note is the host's own`, !row && /returned no runs/.test((rep.distil || {}).note || ''),
      JSON.stringify(rep.distil));
    ck(`${label}: the report's budget field is ${budget === null ? 'null' : 'empty'}`,
      budget === null ? rep.budget === null : rep.budget.skipped.length === 0, JSON.stringify(rep.budget));
  } else {
    ck(`${label}: a SKIPPED row states the spend against the budget`,
      !!row && /SKIPPED/.test(row.name) && row.deployed === false && /200 of 100/.test(row.note), row && row.note);
    ck(`${label}: the report names the skipped phase`, rep.budget.skipped.length === 1
      && /②d/.test(rep.budget.skipped[0].phase) && rep.budget.skipped[0].spent === 200, JSON.stringify(rep.budget));
    ck(`${label}: the ①d rung below it still shipped`, a.deployed.distil === true && rep.dirInv && rep.dirInv.policy === a.distil);
  }
}
let a5 = new AutoStack({ channels: [{ max: 3 }], authority: 0.6, floor: 0, classic: false, maxDepth: 0,
  dirInv: { offsets: OFFS }, distil: { offsets: OFFS }, plantBudget: 1 });
let called5 = false;
const rep5 = await a5.commission(mkHost(a5, { dirInvRuns: dietRuns, distilRuns: () => { called5 = true; return []; } }));
ck('a budget on a host with NO spent() enforces nothing and SAYS so (rule 25)',
  called5 && /no spent/.test(rep5.budget.note || ''), JSON.stringify(rep5.budget));

// ------------------------------------------------------------ (7) a segment that carries its OWN
// reader of `U` outside [0, n) — the shape a host hands when it excited the plant CONTINUOUSLY
// across segments (plan §123). Rule 9b, both halves: a reader that IS the clamp must leave the fit
// bit-identical (the wiring changes nothing where it should not, rule 21), and a reader that says
// something DIFFERENT outside the record must change the fit (the wiring is live, not decorative).
const fitWith = async (mk) => {
  const a = new AutoStack({ channels: [{ max: 3 }], authority: 0.6, floor: 0, classic: false,
    maxDepth: 0, dirInv: { offsets: OFFS } });
  const rep = await a.commission(mkHost(a, { dirInvRuns: () => dietRuns().map(mk) }));
  return rep.dirInv && rep.dirInv.policy ? rep.dirInv.policy.W.map((w) => Array.from(w)) : null;
};
const plainW = await fitWith((sg) => sg);
const clampW = await fitWith((sg) => ({ ...sg, at: (k) => sg.U[Math.max(0, Math.min(sg.n - 1, k))] }));
const shiftW = await fitWith((sg) => ({ ...sg, at: (k) => (k < 0 || k >= sg.n) ? [sg.U[0][0] + 0.5] : sg.U[k] }));
ck('a segment reader that IS the clamp leaves the ①d fit BIT-IDENTICAL',
  !!plainW && JSON.stringify(plainW) === JSON.stringify(clampW));
ck('a segment reader that differs outside the record CHANGES the fit — the path is live, not decorative',
  !!shiftW && JSON.stringify(plainW) !== JSON.stringify(shiftW));

// ------------------------------------------------ (8) THE GATE PRICES THE RUNG BEFORE IT RUNS
//
// §123's motivating defect: with the excitation cheaper, the column's spend at the gate fell
// UNDER a 3-day budget and the gate admitted a 26-day teacher, because it asked only whether the
// budget was already spent. Now a rung hands the gate an ESTIMATE (plan §124). BOTH HALVES
// (rule 9): a budget the rung's estimate would overrun SKIPS it with a stated row and the teacher
// is never called; a budget it fits RUNS it, records what it spent beside the estimate, and the
// estimate is an UPPER BOUND on the bill (the teacher's `plan()` is its sweep at its widest).
// The meter is a real counter ticked by every plant step the mock advances, because an estimate
// checked against a constant is not checked (rule 15).
let meter = 0, teacherCalls = 0;
const teachRun = (lap, phase, withCost = true) => {
  const ref = (k) => { const t = (((k % lap) + lap) % lap) / lap; return [0.5 + 0.4 * Math.sin(2 * Math.PI * (t + phase))]; };
  let p = null;
  return {
    lap, refAt: ref, closed: true, ...(withCost ? { callSteps: lap, settleSteps: 0 } : {}),
    run: async (corr) => {
      if (!p) p = mkPlant();
      meter += lap; teacherCalls++;
      const err = [new Float64Array(lap)]; let s2 = 0;
      for (let k = 0; k < lap; k++) {
        const c = ref(k); const u = corr ? corr.at(k) : [0];
        const e = inv(p.step(c[0] + (u[0] || 0))) - c[0];
        err[0][k] = e; s2 += e * e;
      }
      return { score: Math.sqrt(s2 / lap), err };
    },
  };
};
const meteredHost = (a, extra) => {
  const h = mkHost(a, { ...extra, spent: () => meter });
  const run0 = h.run;
  h.run = async (...x) => { meter += N; return run0(...x); };
  return h;
};
const distilRow = (rep) => rep.budget && rep.budget.rungs && rep.budget.rungs['②d distilled'];
for (const [label, budget, fits] of [['a budget the estimate OVERRUNS', 5000, false], ['a budget the rung FITS', 1e7, true]]) {
  meter = 0; teacherCalls = 0;
  const a = new AutoStack({ channels: [{ max: 3 }], authority: 0.6, floor: 0, classic: false,
    maxDepth: 0, dirInv: { offsets: OFFS }, distil: { offsets: OFFS }, plantBudget: budget });
  const rep = await a.commission(meteredHost(a, { dirInvRuns: dietRuns,
    distilRuns: () => [teachRun(300, 0), teachRun(300, 0.3), teachRun(300, 0.6, false)] }));
  const row = teacherRow(rep), br = distilRow(rep);
  ck(`${label}: one scored run is PRICED by the baseline lap, off the meter (${rep.budget.scoredRunSteps})`,
    rep.budget.scoredRunSteps === N);
  ck(`${label}: the estimate exists and prices teacher AND verify`,
    !!(br && br.estimate && br.estimate.teacher > 0 && br.estimate.verify > 0 && br.estimate.steps === br.estimate.teacher + br.estimate.verify),
    JSON.stringify(br));
  ck(`${label}: a run that states no callSteps is priced at one lap per call and the estimate SAYS so (rule 25)`,
    !!(br && br.estimate && br.estimate.notes.some((n) => /callSteps assumed/.test(n))), br && JSON.stringify(br.estimate.notes));
  if (!fits) {
    ck(`${label}: the teacher was NEVER called`, teacherCalls === 0, `${teacherCalls} calls`);
    ck(`${label}: a SKIPPED row states spent + estimate against the budget`,
      !!row && /SKIPPED/.test(row.name) && row.deployed === false && /would spend/.test(row.note) && /5,000/.test(row.note), row && row.note);
    ck(`${label}: the report names the phase and that it was skipped ON THE ESTIMATE, with the spend still under budget`,
      rep.budget.skipped.length === 1 && rep.budget.skipped[0].by === 'estimate' && rep.budget.skipped[0].spent < budget
      && rep.budget.skipped[0].estimate === br.estimate.steps, JSON.stringify(rep.budget.skipped));
    ck(`${label}: the ②d note says why, and the ①d rung below it still shipped`,
      /SKIPPED on the plant-time estimate/.test((rep.distil || {}).note || '') && a.deployed.distil === true, JSON.stringify(rep.distil));
    ck(`${label}: a skipped rung records NO spend (it never ran)`, br.spent === undefined, JSON.stringify(br));
  } else {
    ck(`${label}: the teacher RAN`, teacherCalls > 0 && !!row && !/SKIPPED/.test(row.name), `${teacherCalls} calls, ${row && row.name}`);
    ck(`${label}: no rung was skipped`, rep.budget.skipped.length === 0, JSON.stringify(rep.budget.skipped));
    ck(`${label}: what the rung SPENT is recorded beside its estimate`, !!br && br.spent > 0 && br.estimateOverSpent > 0, JSON.stringify(br));
    ck(`${label}: and the estimate was an UPPER BOUND on the bill (estimate/spent ${br && br.estimateOverSpent && br.estimateOverSpent.toFixed(2)})`,
      !!br && br.estimate.steps >= br.spent, JSON.stringify(br));
    ck(`${label}: the bound is not vacuous — within 4x of the bill`, !!br && br.estimateOverSpent < 4, br && br.estimateOverSpent);
  }
}
// And WITHOUT a budget nothing is priced: the report carries no budget at all (rule 21).
{
  meter = 0; teacherCalls = 0;
  const a = new AutoStack({ channels: [{ max: 3 }], authority: 0.6, floor: 0, classic: false,
    maxDepth: 0, dirInv: { offsets: OFFS }, distil: { offsets: OFFS } });
  const rep = await a.commission(meteredHost(a, { dirInvRuns: dietRuns, distilRuns: () => [teachRun(300, 0)] }));
  ck('no budget: nothing is priced, the teacher runs, and the report carries no budget field', rep.budget === null && teacherCalls > 0);
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} check(s) failed\n`);
process.exit(failed === 0 ? 0 : 1);
