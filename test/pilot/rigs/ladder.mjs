/**
 * @file THE LADDER DRIVER — one plant's commissioning, told everything the machine knows
 * about itself and nothing about the controller.
 *
 * EXTRACTED FROM `plants.test.mjs` when the real-data plants needed the same driver. A
 * shared configuration exists to stop two copies drifting (rule 61), and this project has
 * paid for a second copy of a plant's routing three separate times — `rigs/arm-rig.mjs`
 * says so in its own header. `plants.test.mjs` is byte-identical across the extraction,
 * which is the control that says the move changed nothing.
 *
 * The env knobs travel WITH the driver rather than being re-read per caller, for the same
 * reason. `announce()` is kept separate from module load so a caller keeps its own output
 * ordering: printing the overrides at import time would put them above the caller's header.
 */
import { AutoStack } from '../../../lib/pilot/autostack.js';
import { motionBasis } from '../../../lib/pilot/classic.js';
import { into, count as meterCount } from './meter.mjs';
import { printCost, emitRow, probeRuns, motionOf } from './distilkit.mjs';
// THE SOLVER BUDGET AS A KNOB, so `docs/plan.md` step 6b can be gated on plants that share
// no physics. Both are pass-through Pilot options and both default to the library's own
// values, so an unset environment runs byte-identically (rule 21). The proposed joint change
// is HORIZON_TS=1.2 QPITERS=2 — measured better AND ~30-57x cheaper on the two plants that
// deploy, and NOT separable, so they move together or not at all.
const SOLVER = {};
if (process.env.HORIZON_TS) SOLVER.horizonTs = +process.env.HORIZON_TS;
if (process.env.QPITERS) SOLVER.qpIters = +process.env.QPITERS;

// THE TEACHER'S OWN BUDGET AS A KNOB, because it is where the PRODUCT's plant time goes and
// nothing here had ever priced it (plan §72). `hff` spends `passes` refinement laps per training
// run on top of its identification, and §49's law says a MORE converged prefix teaches a WORSE
// policy — which, if it holds here, makes a shorter teacher cheaper AND better rather than a
// trade. Unset is the library's own 24 and byte-identical (rule 21).
const HFF = {};
if (process.env.TPASSES) HFF.passes = +process.env.TPASSES;
if (process.env.TTRIALS) HFF.trialPasses = +process.env.TTRIALS;
// AND THE PROBE PHASE, WHICH IS THE LARGEST REMAINING TERM (plan §73). The candidate designs are
// (style x frac) and both axes are already `hff` options: `probeStyle` 'auto' gives two styles and
// `probeFracs` defaults to two fractions, so FOUR designs are probed at `nq` laps each — 28 of the
// barrel's 54 teacher laps and 20 of the column's. `hff` has halved this once already on the arm
// ("8 probe sets where 4 suffice: 20 wasted laps of 64") and it has never been swept here.
// `TSTYLE=spread|basis` fixes the style, `TFRACS=0.25,0.1` sets the ladder — unset is both.
if (process.env.TSTYLE) HFF.probeStyle = process.env.TSTYLE;
if (process.env.TFRACS) HFF.probeFracs = process.env.TFRACS.split(',').map(Number);

// THE SCAN THE LADDER HAS TO FIT, when one is stated. `BUDGET=mac,bytes` turns it on; unset,
// nothing is enforced and every number in this file is what it always was. It exists because
// the barrel deployed 1.04x for 21,830 MAC/cycle and 256.7 kB — an improvement the machine
// measured honestly and no PLC would accept — and nothing in the ladder priced it.
const BUDGET = process.env.BUDGET
  ? { mac: +process.env.BUDGET.split(',')[0], bytes: +process.env.BUDGET.split(',')[1] }
  : null;
// THE PLANT TIME THE LADDER MAY SPEND, in this plant's own STEPS (plan §120): `PLANTBUDGET=n`.
// Read off the meter that ticks inside the plant's `step`, from the moment the ladder starts, so
// a rig's module-load baseline is not charged. Unset, nothing is enforced.
const PLANTBUDGET = process.env.PLANTBUDGET ? +process.env.PLANTBUDGET : null;
// THE TEACHER'S INSTRUMENT, DEGRADED TO K TOUCHES PER LAP (plan §121): `PROBEPTS=K`. The arm's
// `distilProbePts` for every plant that drives its teacher through this driver. Unset is untouched.
const PROBEPTS = process.env.PROBEPTS ? +process.env.PROBEPTS : 0;
// THE DISTILLED RUNG'S TEACHER ON THE MACHINE IT DEPLOYS ON (plan §138). The library composes
// the armed conventional rung under every training run by default; `DCOMPOSE=0` is the control
// that reproduces the pre-§138 bare-teacher configuration. One knob here reaches every plant this
// driver runs, rather than one per harness (rule 61).
const DCOMPOSE_OFF = process.env.DCOMPOSE === '0';

/** Print the active overrides at the caller's chosen point in its own output. */
function announce() {
  if (Object.keys(SOLVER).length) console.log(`  solver budget override: ${JSON.stringify(SOLVER)}`);
  if (DCOMPOSE_OFF) console.log('  DCOMPOSE=0: the distilled rung\'s teacher runs on the BARE machine — the pre-§138 control');
  if (Object.keys(HFF).length) console.log(`  teacher budget override: ${JSON.stringify(HFF)}`);
  if (BUDGET) console.log(`  scan budget: ${BUDGET.mac.toLocaleString()} MAC/cycle, `
    + `${(BUDGET.bytes / 1024).toFixed(0)} kB`);
  if (PLANTBUDGET !== null) console.log(`  plant-time budget: ${PLANTBUDGET.toLocaleString()} steps`);
  if (PROBEPTS) console.log(`  the TEACHER reads the truth at ${PROBEPTS} touches per lap and nowhere else`);
}

/**
 * One plant's ladder. `spec` supplies everything the machine knows about itself and nothing
 * about the controller.
 */
async function ladder(spec) {
  const { name, channels, uMax, guards, nMeasured, start, N, refAt, fresh, step, floor,
    pilotOpts, distil, distilRuns, dirInv, dirInvRuns, depth, classicDiet } = spec;

  // The reference's own rate and acceleration, in COMMAND space, by differencing the program
  // it will actually run. This is what the conventional rung reads; it is not a model.
  const nc = channels.length;
  // ONE DIFFERENCER. The same five lines were written three times in this file — here, in
  // `scoreOn`, and now for the diet — and a second copy of a plant's routing has shipped a
  // defect three times in this project (rule 61). Byte-identical to what it replaces.
  const derive = (rAt, n) => {
    const dv = Array.from({ length: nc }, () => new Float64Array(n));
    const da = Array.from({ length: nc }, () => new Float64Array(n));
    for (let k = 1; k < n - 1; k++) {
      const p0 = rAt(k - 1), p1 = rAt(k), p2 = rAt(k + 1);
      for (let c = 0; c < nc; c++) { dv[c][k] = (p2[c] - p0[c]) / 2; da[c][k] = p2[c] - 2 * p1[c] + p0[c]; }
    }
    return { v: dv, a: da };
  };
  const { v, a } = derive(refAt, N);

  // ---- THE CONVENTIONAL RUNG'S DIET (plan §89.3's named repair, task #70) ------------------
  //
  // `classic.js` is identified on ONE program, so it has a shape SPAN of a POINT — which is
  // why §89.3 refused to build a coverage guard for the real flexible arm and named a DIET
  // instead. A diet here is one POOLED record: several programs concatenated, one basis
  // normalised over all of them, one least-squares fit, one deployed object of the SAME FORM
  // (the rung is `live(v, a)` — a static map of the reference's own state — so pooling changes
  // the four coefficients and nothing else; there is no table and no index).
  //
  // POOLING IS EXACT HERE ONLY BECAUSE THE BASIS IS LAG-FREE. `motionBasis`'s delay taps WRAP
  // modulo the record, which across a pooled record wraps one program's start onto another
  // program's end; this driver builds the default (unlagged) basis at every call site, so the
  // question does not arise — and it is written down rather than assumed, because a lagged
  // pooled basis would need a segment table and would be silently wrong without one.
  //
  // The DEPLOY decision is still taken on the scored program (`run`), because that is what the
  // machine runs. A spec that declares no diet leaves every number this driver produces
  // byte-identical: `cv`/`ca` are then `v`/`a` and no `runClassic` is passed (rule 21).
  const DIETP = (classicDiet || []).map((P) => ({ ...P, ...derive(P.refAt, P.N) }));
  const POOL = DIETP.length ? DIETP.reduce((t, P) => t + P.N, 0) : N;
  const cv = Array.from({ length: nc }, () => new Float64Array(POOL));
  const ca = Array.from({ length: nc }, () => new Float64Array(POOL));
  if (DIETP.length) {
    let off = 0;
    for (const P of DIETP) {
      for (let c = 0; c < nc; c++) { cv[c].set(P.v[c], off); ca[c].set(P.a[c], off); }
      off += P.N;
    }
  } else for (let c = 0; c < nc; c++) { cv[c].set(v[c]); ca[c].set(a[c]); }
  const auto = new AutoStack({
    // DEPTH IS A KNOB SO THE DEPTH QUESTION CAN BE ASKED ON PLANTS THAT SHARE NO PHYSICS.
    // The default 2 is what every number in this file is quoted at; `DEPTH=4` runs the
    // experiment testing whether the LEVERAGE LEVEL predicts the layer that will fail to
    // vouch. One plant is not a method — a common factor across plants sharing no physics is
    // a property of the CODE (rule 18), and that is exactly what a stopping rule has to be.
    // A SPEC MAY DECLARE ITS OWN CASCADE DEPTH, AND THE DISTIL HARNESSES DECLARE ZERO (plan
    // §73.1). Where the distilled rung's teacher is `hff` the cascade is not the teacher: it is
    // commissioned, scored, and then REPLACED by the rung that wins — 14.9 of the barrel's 77.9
    // days and 5.3 of the column's 59.3, for a delivered number identical to four figures. That
    // is the arm's own recorded finding ("two of its four minutes commissioning a correction it
    // scores at 1.07x and then DISCARDS") on plants sharing no physics with it. It is a SPEC
    // field and not a driver default because `plants.test.mjs` drives the same plants through
    // this driver and there the cascade IS the result — the mill ships at 1.74x on it.
    channels, uMax, periodic: null, floor, budget: BUDGET,
    ...(PLANTBUDGET !== null ? { plantBudget: PLANTBUDGET } : {}),
    maxDepth: process.env.DEPTH !== undefined ? +process.env.DEPTH
      : (depth !== undefined ? depth : 2),
    // THE CONVENTIONAL RUNG, WITHHOLDABLE FOR THE SIX-PLANT PASS. `basis` is what unlocks it —
    // `if (this.basis)` in AutoStack — so NOCLASSIC=1 skips it with no new option. The question
    // it answers is whether the rung can be dropped from the ladder for compute: on the ARM the
    // bar's own table says the cascade commissions BETTER without it ("a cheap rung that costs
    // an expensive one"), while on the EMPS axis it IS the result (425x in 14 laps, past the
    // published inverse-dynamics feedforward). Six plants decide it, not either one.
    basis: process.env.NOCLASSIC === '1' ? null
      : motionBasis(channels.map((_, c) => ({ v: cv[c], a: ca[c] }))),
    // PER-PLANT PILOT OPTIONS, WHICH EXIST FOR ONE REASON AND IT IS NOT TUNING. A transport
    // delay is DECLARED BY THE ENGINEER WHO MOUNTED THE INSTRUMENT — a mounting distance over a
    // line speed, geometry rather than a fitted constant — and the probe provably CANNOT recover
    // it, because a dead time and a slow rise move the 90% crossing identically. Without the
    // passthrough this file drove the mill as an undeclared machine while `rollmill.test.mjs`
    // drove the same rig as a declared one, which is exactly the two-copies drift of rule 61 and
    // was written down in `plants.test.mjs` as a known gap rather than left to be found.
    //
    // `pilotOpts` is applied AFTER the shared defaults and BEFORE `SOLVER`, so a plant may state
    // what it knows about itself while the environment override still wins — an env knob that a
    // spec could silently defeat would make the six-plant pass measure the wrong configuration.
    // THE COMMISSIONING SEED IS A KNOB, because a plant's number is a DRAW and this project has
    // already mistaken one for a result: the tank's 1.32x came from a distribution that deployed
    // four harmful controllers in eight, and `spread.mjs` exists because of it. Unset is seed 1
    // and byte-identical to every number this driver has ever produced (rule 21).
    pilot: { nMeasured, start, guards, workspace: () => true,
      seed: +(process.env.SEED || 1), autoRefuse: false,
      ...(pilotOpts || {}), ...SOLVER },
    // THE DISTILLED RUNG, OFFERED ONLY WHERE A SPEC SUPPLIES ITS OWN TRAINING DIET. It is the
    // DEPLOYED object — every other plant in this driver scores the TEACHER — and §62 measured
    // two of these four as winnable by it and won by neither: the column's oracle correction is
    // 99% expressible by a causal map of the commanded reference AND transfers at 2.59x against
    // 2.62x at home, and the barrel's reaches 5.38x on a program it never saw where the pilot
    // delivers 1.05x and refuses. A spec that declares neither field leaves every number this
    // driver produces byte-identical (rule 21).
    ...(distil ? { distil: DCOMPOSE_OFF ? { ...distil, composeBelow: false } : distil } : {}),
    // AND THE TEACHER-FREE RUNG'S OPTIONS, WHICH THIS DRIVER DID NOT FORWARD (plan §116).
    // §112 built ①d and shipped a PATH test for it, and the path it tested was the library's.
    // This driver never destructured `dirInv`, so a spec declaring it was silently ignored: the
    // harness printed that it had armed the rung, the rung never ran, and the output was
    // indistinguishable from one where it ran and declined — rule 9b for the SIXTH time, and
    // rule 25's *did not run* wearing *ran and found nothing*. Unset is byte-identical.
    ...(dirInv ? { dirInv } : {}),
    ...(Object.keys(HFF).length ? { hff: HFF } : {}),
  });

  // WHERE THE PLANT TIME GOES, LABELLED IN ONE PLACE (plan §72.4). `AutoStack` calls back into
  // exactly three things that advance the machine — this scored `run`, `drivePilot`, and the
  // host's own diet closures — and the three are completely different levers: a verify is one
  // program, the cascade is a probe-and-excite, and the diet is the teacher iterating a prefix to
  // convergence on every training run. A total cannot say which to cut, and this project has
  // already shipped one accounting that closed off the right lever by guessing that split
  // (target 4's "~10%" against `_cost.mjs`'s measured 69%). Anything the labels do not cover
  // lands in `other` rather than being attributed to the phase above it (rule 25).
  const inPhase = async (label, fn) => {
    const back = into(label);
    try { return await fn(); } finally { into(back); }
  };
  const run0 = async (corr, cname, prog, kOff = 0) => {
    const P = prog || { refAt, fresh, N, v, a };
    const { refAt: pRefAt, fresh: pFresh, N: pN, v: pV, a: pA } = P;
    const st = pFresh();
    auto.beginRun();
    let ss = 0, n = 0;
    // The error signal per channel over the whole program — what the conventional rung's
    // operator is identified against. One output per channel, in the output's own units:
    // the operator is a derivative of THIS with respect to the coefficients, so the units
    // divide out and the correction comes back in command space.
    const err = Array.from({ length: nc }, () => new Float64Array(pN));
    for (let k = 0; k < pN; k++) {
      const ref = pRefAt(k);
      const S = auto.stack ? auto.stack.sample : 1;
      const kS = Math.floor(k / S);
      const look = (off) => pRefAt(Math.min(pN - 1, Math.max(0, (kS + off) * S)));
      // AND THE RAW-STEP LOOK-AHEAD BESIDE IT, because two rungs here read the reference on two
      // different grids. The cascade decides on its own `sample` and its offsets are in DECISIONS,
      // so `look` is decimated by S; the distilled rung's offsets are RAW machine steps, because
      // what it regresses is a converged prefix indexed by the machine's own step. `autostack.js`
      // warns about exactly this in its own comment — a host with a decimated look-ahead must
      // declare `lookRaw`, and one with a single grid passes only `look` and is byte-identical —
      // and this driver did not, so `_distilTerm` fell back to `look` and the DEPLOYED window was
      // stretched by S against the one the fit saw, with nothing thrown and no diagnostic naming
      // it (plan §51.5). It was invisible on the column, where the cascade REFUSES and S is 1,
      // and it is the barrel's whole signature: in-sample 9-14x read through the raw reference,
      // and 0.27-0.48x on the machine read through a window S times too wide.
      const lookRaw = (off) => pRefAt(Math.min(pN - 1, Math.max(0, k + off)));
      // THE DECLARED OPERATING POINT THIS PROGRAM IS BEING RUN AT (plan §90.4, reached in §100).
      // A spec that declares nothing passes `undefined` and every existing plant is
      // byte-identical, exactly as `speed` and `load` are. It is stated per SCORED RUN rather
      // than per plant because that is what the guard is about: the same frozen object asked to
      // act somewhere its commissioning did not observe.
      const u = P.armed === false ? channels.map(() => 0)
        : auto.act({ v: channels.map((_, c) => pV[c][k]), a: channels.map((_, c) => pA[c][k]),
          look, lookRaw, decls: P.decls || undefined });
      // `kOff` is the POOLED index of this program's first sample, and it is 0 — hence
      // `corr.at(k)` — for every run but a diet member's (rule 21).
      if (corr) { const w = auto.into(corr.at(k + kOff), cname, {}); for (let c = 0; c < nc; c++) u[c] += w[c]; }
      const r = step(st, ref, u, k);
      auto.observe(r.measured);
      for (let c = 0; c < nc; c++) err[c][k] = r.truth[c];
      // SCORED AFTER THE START TRANSIENT, not across it: a measurement taken over a
      // transient describes the transient.
      if (k >= pN * 0.05) { for (const e of r.truth) { ss += e * e; n++; } }
    }
    return { score: Math.sqrt(ss / n), err, ss, n };
  };
  const run = (corr, cname) => inPhase('verify', () => run0(corr, cname));
  /**
   * THE DIET'S POOLED RUN — one trial of the conventional rung over every training program, in
   * the POOLED index its basis was built in. The score is the rms over all of them (each
   * member's own 5% start transient dropped by `run0`, rule 13), so the commission's monotone
   * guard is judged on the diet as a whole and cannot buy one member with another.
   */
  const runClassic = DIETP.length ? async (corr, cname) => inPhase('verify', async () => {
    const err = Array.from({ length: nc }, () => new Float64Array(POOL));
    let ss = 0, n = 0, off = 0;
    for (const P of DIETP) {
      const r = await run0(corr, cname, P, off);
      for (let c = 0; c < nc; c++) err[c].set(r.err[c], off);
      ss += r.ss; n += r.n; off += P.N;
    }
    return { score: Math.sqrt(ss / n), err };
  }) : null;
  /**
   * TARGET 1's INSTRUMENT: THE SAME COMMISSIONED OBJECT ON A PROGRAM IT WAS NOT SCORED ON
   * (plan §88.1). A harness hands back an alternate `{refAt, fresh, N}` and gets the SCORED RUN
   * this driver already runs — the same `auto.act`, the same look-ahead pair, the same 5% start
   * transient dropped — rather than a fourth private copy of the loop, which is the fault
   * `arm-rig.mjs` and `rigs/ladder.mjs` both exist to prevent (rule 61) and which
   * `distil-tank.mjs` already paid for once by scoring a rung its own loop never applied.
   * `armed: false` applies NOTHING rather than disarming the rungs, so the denominator belongs
   * to THAT program and the commissioned object is never mutated to measure it — a harness that
   * had to un-arm and re-arm to read a baseline could leave the ladder in a state its own
   * verify never saw.
   */
  const scoreOn = async ({ refAt: rAt, fresh: fr, N: n2, decls: d2 = null }, { armed = true } = {}) => {
    const { v: v2, a: a2 } = derive(rAt, n2);
    return run0(null, null, { refAt: rAt, fresh: fr, N: n2, v: v2, a: a2, armed, decls: d2 });
  };
  const drivePilot0 = async (stk) => {
    const st = fresh();
    let guard = 0;
    while (stk.phase !== 'done' && guard++ < 4e6) {
      if (stk.phase === 'fit') { stk.work(); continue; }
      const cmd = stk.command();
      const below = auto.actBelow('stack', { v: cmd.map((c) => c.vel), a: cmd.map((c) => c.acc) });
      const r = step(st, cmd.map((c) => c.pos), cmd.map((c, j) => c.u + below[j]), -1);
      stk.observe(r.measured, r.truth);
    }
  };
  const drivePilot = (stk) => inPhase('cascade', () => drivePilot0(stk));

  const t0 = Date.now();
  // The diet's run closures belong to the plant's harness, so they are labelled HERE by wrapping
  // what `distilRuns` hands back — one place, and a harness that never heard of the meter is
  // still counted correctly (rule 61).
  // Every closure a run descriptor can carry is wrapped, not just `run` — `teach`, `converge` and
  // `captureState` all advance the machine, and a phase that is added later and not listed here
  // lands in `other` rather than being credited to whatever ran before it (rule 25).
  // PER TRAINING RUN, because the aggregate hides the lever. On Wood-Berry three of four runs are
  // DROPPED below the rung's 1.5x bar (plan §64) and each one paid a full identification first, so
  // the question "how much of the teacher's time bought rows that were kept" is the one that
  // decides whether the diet or the teacher is the thing to cut — and a single `teacher` bucket
  // cannot answer it.
  // THE SPEC'S DIET CLOSURE IS HANDED THE LADDER'S OWN `auto` (plan §73.9). The oracle teacher
  // iterates the COMMISSIONED PILOT, so a harness that wants it must reach the stack whose
  // `oracleF0` port it arms — and this driver builds that object internally. A closure that takes
  // no argument is unaffected, so every existing spec is byte-identical.
  // WHAT THE PROBE INSTRUMENT ACTUALLY REACHED, kept so the run can say it rather than assert it
  // (plan §125). `announce()` claims the teacher reads K touches and nowhere else, and on the
  // ORACLE route that claim was FALSE for a whole section — so the claim is now a reading.
  const probed = [];
  let probe = null;
  const metered = distilRuns ? async () => probeRuns(await distilRuns(auto), PROBEPTS).map((t, i) => {
    probed.push(t);
    const w = { ...t, run: (...a) => inPhase(`teacher#${i}`, () => t.run(...a)) };
    for (const k of ['teach', 'converge', 'captureState']) {
      if (t[k]) w[k] = (...a) => inPhase(`teacher#${i}`, () => t[k](...a));
    }
    // THE CONVENTIONAL RUNG'S OWN SERIES ON THIS RUN (plan §138), so `composeBelow` can put
    // the armed rung under the teacher in its own units. One helper, shared with the in-sample
    // column that re-runs these programs (rule 61). Read only when composing.
    if (!t.motion) { const m = motionOf(t, nc); if (m) w.motion = m; }
    return w;
  }) : null;
  const spentBase = meterCount();
  const rep = await auto.commission({ run, drivePilot,
    spent: () => meterCount() - spentBase,
    ...(runClassic ? { runClassic } : {}),
    ...(metered ? { distilRuns: metered } : {}),
    // The ①d rung's OPEN-LOOP segments. They cost ZERO teacher laps, so they are not wrapped in
    // the teacher's phase meter; the excitation is priced by the harness that supplies it.
    ...(dirInvRuns ? { dirInvRuns: () => inPhase('excite', () => dirInvRuns()) } : {}) });
  console.log(`\n  ${name}`);
  console.log(auto.table());
  // THE BUDGET GATE'S ESTIMATE, BESIDE WHAT THE RUNG THEN COST (plan §124). An estimate the
  // bill never checks is a sentence; here every rung that spends laps prints both, and the
  // ratio is what says whether the bound was a bound.
  if (PROBEPTS) {
    // BOTH HALVES OF WHAT THE KNOB DID (rules 9, 25). A descriptor that published no drive is a
    // route the instrument cannot reach and reads as such; one that published a drive and was
    // never called is *wired and inert*, which is the state §121 was in and could not see.
    //
    // AND THE ONE STATE THAT IS A DEFECT IS NAMED RATHER THAN LEFT TO BE READ: a descriptor that
    // BUILT a drive-taking teacher, PUBLISHED its drive, and degraded ZERO drives is §121 exactly
    // — the knob set, the route unreached, and an output indistinguishable from the knob doing
    // nothing. A harness that never built such a teacher is not that, and must not read as it.
    const withDrive = probed.filter((t) => t.probeDrives);
    const hits = withDrive.reduce((a, t) => a + t.probeDrives(), 0);
    const built = probed.filter((t) => t.converge || t.teach).length;
    probe = { k: PROBEPTS, runs: probed.length, published: withDrive.length, built, drives: hits,
      unreached: !!(built && withDrive.length && !hits) };
    console.log(`    probe instrument: ${PROBEPTS} touches/lap on ${probed.length} training run(s)`
      + `, record+score degraded on run/teach`
      + (withDrive.length
        ? `, and on the TEACHER'S OWN DRIVE — ${hits} drive(s) degraded across `
          + `${withDrive.length} run(s)`
          + (hits ? '' : built ? '  *** UNREACHED: a drive-taking teacher was BUILT and none was degraded (§121) ***'
            : ' — wired, and no drive-taking teacher was built')
        : '; NO run published a drive, so an ORACLE/PARAM teacher built by the harness is NOT degraded'));
  }
  if (rep.budget && rep.budget.rungs && Object.keys(rep.budget.rungs).length) {
    console.log(`    plant-time budget ${rep.budget.steps.toLocaleString()} steps; one scored run `
      + `${rep.budget.scoredRunSteps === null ? 'unpriced' : rep.budget.scoredRunSteps.toLocaleString() + ' steps'}`);
    for (const [ph, r] of Object.entries(rep.budget.rungs)) {
      const e = r.estimate;
      console.log(`      ${ph.padEnd(18)} estimate ${e ? Math.round(e.steps).toLocaleString().padStart(11) : '    (none)'}`
        + `   spent ${r.spent === undefined ? '(skipped)' : r.spent.toLocaleString().padStart(11)}`
        + (r.estimateOverSpent ? `   estimate/spent ${r.estimateOverSpent.toFixed(2)}` : '')
        + (e && e.notes && e.notes.length ? `   [${e.notes.join('; ')}]` : ''));
    }
  }
  console.log(`    shipped ${JSON.stringify(rep.deployed)}   ${rep.base.toExponential(3)} → `
    + `${rep.best.toExponential(3)}   ${rep.gain.toFixed(2)}x   ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  // ---- CAN A CASCADE KNOW WHEN TO STOP WITHOUT PAYING A COMMISSION TO FIND OUT? ---------
  //
  // Measured on the EMPS axis: the leverage RATIO stays flat with depth while the LEVEL
  // triples — each deeper fit progressively less well-determined, the cascade running out of
  // signal, visible DURING the fit. `Stack` currently discovers the same thing by
  // commissioning a layer and finding it cannot vouch for itself ON THE MACHINE, which costs
  // a full commission per layer.
  //
  // If a leverage threshold predicts the failing layer on plants that share no physics, depth
  // stops costing a commission to discover. If it predicts on ONE plant only, it is a
  // property of that plant and not a rule (rule 18). Printed against the verify each layer
  // actually earned, so the two can be compared rather than asserted.
  if (auto.stack && auto.stack.layers && auto.stack.layers.length) {
    for (const [i, p] of auto.stack.layers.entries()) {
      const ro = (p.status && p.status().report && p.status().report.readouts) || [];
      const lev = ro.length && ro[0].levLead0 !== null && ro[0].levLead0 !== undefined
        ? ro[0].levLead0 : null;
      const vouched = !!(p.verdict && p.verdict.deploy);
      console.log(`      layer ${i + 1}: ${vouched ? 'vouched' : 'REFUSED'}`
        + `   verify ${p.verdict && p.verdict.ratio ? p.verdict.ratio.toFixed(2) + 'x' : '—'}`
        + `   R² lead0 ${ro.length ? ro[0].r2Lead0.toFixed(3) : '—'}`
        + `   leverage ${lev === null ? '—' : lev.toExponential(2)}`);
    }
  }
  // ONE FORMATTER (plan §87.2). `objtable.mjs` reads this line, so the three harnesses that drive
  // their own host print it through the same function rather than a second copy of the format.
  printCost(auto);
  // The table's row, where it was measured (plan §87.1).
  emitRow(rep, auto, { name });
  return { rep, auto, scoreOn, probe };
}


export { ladder, announce, SOLVER, BUDGET, HFF };
