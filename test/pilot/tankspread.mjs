/**
 * @file THE TANK'S SCORE IS A DISTRIBUTION, NOT A NUMBER, AND UNTIL IT IS REPORTED AS ONE
 *       NOTHING CAN BE DERIVED AGAINST IT.
 *
 * `tanks.test.mjs` records this plant at 1.32x and is one of the two non-refusals in the
 * six-plant line. It went red, and chasing that produced a sequence of measurements that only
 * make sense together:
 *
 *   - the deploy is lost at `20de1b7` (nine leads built instead of every lead), confirmed by
 *     reversal in both directions;
 *   - the fix does not behave like a fix — LEAD_SAMPLES 9 refuses, 16 refuses, 24 DEPLOYS at
 *     1.28x, 32 refuses, 999 deploys;
 *   - and at the last PASSING commit, changing ONLY the commissioning seed, the plant passes at
 *     two offsets and fails five checks at a third.
 *
 * A knob whose result alternates is a marginal result being flipped by which rows the pool
 * happens to draw, and tuning a constant against it is fitting to a coin flip. Rule 3: a flaky
 * check is a bug report, not a number to chase. Rule 42's band belongs on a MEASURED spread.
 *
 * SO THIS FILE MEASURES THE SPREAD. Commission from N seeds, deploy each on the same held-out
 * recipe, and report the distribution — median, min, max, and how many of the N deployed at all.
 * The median is what a later check should assert against, for the reason `autostack.js` already
 * uses one: its floor was biased 3.9x high by taking the max of reported spreads.
 *
 * IT IS NOT A TEST and does not assert: an instrument that decided its own verdict before the
 * verdict was understood is how the 1.32x got written down in the first place.
 *
 * Run: node test/pilot/tankspread.mjs   [SEEDS=8] [QPI=4] [HTS=1.5]
 */
import { Pilot, setSolverDefaults, setVerifyRateDiv, setVerifyRef } from '../../lib/pilot/pilot.js';
import { ensemble, freezeConfig } from '../../lib/pilot/ensemble.js';
import { UCAP, makeTanks, levelsAt, voltsFor, RECIPE, refAtStep, PROG }
  from './rigs/tanks-rig.mjs';

const SEEDS = +(process.env.SEEDS || 8);
// THE VERIFY'S RATE DIVISOR. Quarter rate is a MEASURED result about choosing lambda and an
// untested one about the ratio the gate reads; RDIV=1 runs the regimes at the machine's own
// limits, which is what the machine's programs actually do. It moves both jobs at once, so a
// change in the ranking is evidence and not yet a design.
if (process.env.RDIV) setVerifyRateDiv(+process.env.RDIV);
// AND THE REPRESENTATIVE-PROGRAM GATE. On Wood-Berry it turned nine harmful deployments into
// twelve refusals and left EMPS byte-identical — but on that plant the right answer IS to refuse
// everything, so it cannot distinguish a gate that RANKS from one that merely refuses harder.
// This plant can: some draws here deliver 1.775x, so a gate that refuses those is worse, not
// better. The reference is the plant's own recipe, which is what the score is taken on.
if (process.env.REP === '1') {
  setVerifyRef((i, n) => {
    const h = refAtStep(Math.round(i * PROG / n));
    return voltsFor(GMP, h[0], h[1]);
  });
}
if (process.env.QPI || process.env.HTS) {
  setSolverDefaults({
    ...(process.env.QPI ? { qpIters: +process.env.QPI } : {}),
    ...(process.env.HTS ? { horizonTs: +process.env.HTS } : {}),
  });
}

// THE VALVE SPLITS, AS AN ARRAY, which is what the rig indexes — `g[0]`, `g[1]`. An object
// with named fields reads perfectly and hands the plant `undefined`, so every level goes NaN,
// nothing builds, and the failure surfaces three layers away inside the verify. Named GMP
// rather than G because the rig already exports G for gravity (rule 17: the instrument first).
const GMP = [0.70, 0.60];                             // gamma1 + gamma2 > 1: minimum phase

function commission(seed, before = null) {
  const p = makeTanks(GMP);
  const start = voltsFor(GMP, RECIPE[0][0], RECIPE[0][1]);
  for (let i = 0; i < 30000; i++) p.step(start[0], start[1]);
  const pilot = new Pilot({
    autoRefuse: true, nMeasured: 4,
    channels: [0, 1].map(() => ({ lo: 2.0, hi: 3.6, vMax: 4e-3, aMax: 2e-5, jMax: 2e-7 })),
    uMax: UCAP,
    start,
    guards: [{ index: 0, max: 19 }, { index: 1, max: 19 }],
    workspace: () => true,
    dwell: true,
    // THE BASIS PINNED WHEN ASKED, so an ensemble has draws it can actually average. On this
    // plant the basis SELECTION flips between commissioning seeds — the test's own checks are
    // about that — so only 2 of 8 draws shared a feature layout and the average was over two
    // models, a sqrt(2) at best. Pinning it removes the one discrete difference and leaves the
    // estimation variance the average is meant to remove. It is not a default: which basis a
    // plant needs is a measurement this project makes per plant.
    ...(process.env.BASIS ? { forceBasis: process.env.BASIS } : {}),
    seed,
  });
  // THE HOOK RUNS BEFORE THE FIRST STEP, which is the only point a frozen configuration can be
  // applied: the fit reads those values when it reaches the tune stage, and copying them onto a
  // pilot that has already fitted would change what its report SAYS without changing what it did.
  if (before) before(pilot);
  while (pilot.phase !== 'done') {
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    p.step(cmd[0].pos + cmd[0].u, cmd[1].pos + cmd[1].u);
    const want = levelsAt(GMP, cmd[0].pos, cmd[1].pos);
    pilot.observe([p.h[0], p.h[1], p.h[2], p.h[3]], [p.h[0] - want[0], p.h[1] - want[1]]);
  }
  return pilot;
}

/** Score one commissioned pilot on the held-out recipe, active or not. */
function scoreRecipe(pilot, active) {
  const p = makeTanks(GMP);
  const start = voltsFor(GMP, RECIPE[0][0], RECIPE[0][1]);
  for (let i = 0; i < 30000; i++) p.step(start[0], start[1]);
  const S = pilot.sample, cache = new Map();
  const refAt = (i) => {
    const k = Math.min(Math.max(i * S, 0), PROG);
    let r = cache.get(k);
    if (!r) { const h = refAtStep(k); r = voltsFor(GMP, h[0], h[1]); cache.set(k, r); }
    return r;
  };
  if (active) pilot._initRun();
  let s2 = 0, n = 0;
  for (let k = 0; k < PROG; k++) {
    const want = refAtStep(k), v = voltsFor(GMP, want[0], want[1]);
    let u = [0, 0];
    if (active) u = pilot.act((off) => refAt(Math.floor(k / S) + off));
    p.step(v[0] + u[0], v[1] + u[1]);
    if (active) pilot.observe([p.h[0], p.h[1], p.h[2], p.h[3]], null);
    const e0 = p.h[0] - want[0], e1 = p.h[1] - want[1];
    s2 += e0 * e0 + e1 * e1; n += 2;
  }
  return Math.sqrt(s2 / n);
}

console.log(`\npilot: the quadruple tank, scored across ${SEEDS} commissioning seeds`);
console.log('  the recorded figure is 1.32x from ONE seed; this is what that number is a draw from.');
console.log('\n   seed   deploy   off cm    on cm       x    GATE  regimes                         why');
const xs = [], deployed = [], ests = [], pilots = [];
// SEED0, BECAUSE A RATE MEASURED ON ONE RANGE OF SEEDS IS NOT A RATE. With the representative
// gate, seeds 1..8 deployed three controllers and all three helped — and seeds 100..103 let a
// 0.882x through. Eight draws from one contiguous range is a sample, not a guarantee, and quoting
// it as one is the same error as quoting a single draw, one level up.
const SEED0 = +(process.env.SEED0 || 1);
// OPTIMIZE: THE LIFT AGAINST k, WHICH NOBODY HAS MEASURED. The theory says the gain tracks the
// variance falling, so most of it should arrive by k = 4 to 8 and k = 32 should not be worth four
// times the commissioning. A gain that keeps rising linearly would say the mechanism is not
// variance reduction and the account is wrong. KSWEEP averages the first k draws for each k.
const KSWEEP = (process.env.KSWEEP || '').split(',').filter(Boolean).map(Number);
for (let s = SEED0; s < SEED0 + SEEDS; s++) {
  const pilot = commission(s);
  const st = pilot.status();
  // `pilot.verdict`, WHICH IS WHAT `act()` READS — not `report.verify.deploy`, which is the
  // verify round's own row and is not the thing the machine obeys. Reading the wrong one made
  // seed 2 print "not deployed" beside a correction that visibly moved the plant (0.4650 →
  // 0.8402), and two views of one quantity disagreeing is the check that caught it (rule 6).
  const dep = !!(pilot.verdict && pilot.verdict.deploy);
  const off = scoreRecipe(pilot, false);
  const on = scoreRecipe(pilot, true);
  const x = off / on;
  xs.push(x); if (dep) deployed.push(x);
  // A REFUSAL MUST BE A ZERO CORRECTION, and the machine is where that is checked: `act()`
  // returns zeros when the verdict says no, so a refused pilot has to score IDENTICALLY with
  // the correction switched on. If it does not, the verdict and the machine disagree.
  if (!dep && Math.abs(on - off) > 1e-12) {
    console.log(`         !! refused, yet the correction moved the plant: ${off.toFixed(4)} → `
      + `${on.toFixed(4)} — the verdict and act() disagree`);
  }
  const why = String((pilot.verdict && pilot.verdict.why) || 'no verdict').slice(0, 46);
  // THE GATE'S OWN ESTIMATE, BESIDE WHAT IT DELIVERED — which is the only way to tell a gate
  // whose THRESHOLD is wrong from one whose ESTIMATE is. CLAUDE.md already records the ordering
  // as inverted on EMPS (the estimate falls as the delivered benefit rises, and it understates
  // 9x); this is the same reading on a plant where the errors go the other way and are harmful.
  const V = st.report.verify || {};
  // THE NUMBER THE GATE NOW ACTS ON. `V.ratio` is the headline the old two-regime gate produced;
  // with a representative regime present that is no longer the column doing the deciding, and a
  // calibration statistic computed on the wrong column measures the instrument it replaced. It
  // reported -0.141 while the representative regime's own values ran 0.50 → 0.424x, 0.54 →
  // 0.820x, 0.88 → 1.248x, 1.27 → 1.512x, 1.58 → 1.775x — monotone in all five (rule 17).
  const repReg = (V.regimes || []).find((r) => r.name === 'representative');
  const est = repReg ? repReg.ratio : V.ratio;
  const regs = (V.regimes || []).map((r) => `${r.name} ${(+r.ratio).toFixed(2)}x`).join(' / ');
  ests.push({ est, x, dep });
  pilots.push(pilot);
  // THE LAYOUT ITSELF, PER DRAW. With the basis pinned, 3 of 8 draws still could not be averaged,
  // so something else discrete moves between commissionings and nobody has named it. Printing the
  // shape is how it gets named rather than guessed: feature count, lead count, stride and basis
  // per channel, which together are exactly what has to match for an average to be well-posed.
  console.log(`         layout: ${pilot.readouts.map((r) => `${r.w[0].length}f/${r.w.length}L`
    + `/s${r.stride}/${r.sched ? 'sch' : (r.poly ? 'quad' : 'lin')}`).join(' ')}`);
  console.log(`  ${String(s).padStart(5)}   ${dep ? ' yes ' : ' NO  '}  ${off.toFixed(4)}  `
    + `${on.toFixed(4)}  ${x.toFixed(3)}x  ${est == null ? '    —' : `${(+est).toFixed(2)}x`.padStart(6)}`
    + `  ${regs.padEnd(30)}  ${dep ? '' : why}`);
}

// THE ENSEMBLE COMES FROM THE LIBRARY, NOT FROM A COPY HERE. This file grew its own averaging
// helper while the idea was being measured, and the moment it worked that helper became a second
// implementation of a shipped object — the exact thing rule 61 and this project's own history
// warn about (two copies of a plant, two copies of a row builder, both paid for). The library
// version also does something this one did not: it averages over the MAJORITY layout rather than
// the first draw's, so one unusual commissioning cannot decide which others are admissible.
const med = (a) => { const b = [...a].sort((p, q) => p - q); const h = b.length >> 1;
  return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2; };
console.log(`\n  DELIVERED across all ${SEEDS} seeds:  median ${med(xs).toFixed(3)}x  `
  + `min ${Math.min(...xs).toFixed(3)}x  max ${Math.max(...xs).toFixed(3)}x`);
console.log(`  DEPLOYED ${deployed.length}/${SEEDS} seeds`
  + (deployed.length ? `, median ${med(deployed).toFixed(3)}x` : ''));
// THE SPREAD IS THE POINT. A plant whose delivered benefit varies by more than the 1.1x the
// gate asks for cannot have a single number quoted for it, and a check asserting one is
// asserting the seed.
const rel = Math.max(...xs) / Math.min(...xs);
console.log(`  spread max/min ${rel.toFixed(2)}x — the deploy gate's own threshold is 1.1x`);

// THE GATE'S CALIBRATION, WHICH IS THE NUMBER THAT SAYS WHETHER THE THRESHOLD OR THE ESTIMATE
// IS AT FAULT. A threshold slightly off shows up as a gate that ranks correctly and cuts in the
// wrong place; an estimate at fault shows up as no rank order at all.
const paired = ests.filter((e) => e.est != null && Number.isFinite(+e.est));
if (paired.length > 2) {
  const mx = paired.reduce((a, e) => a + +e.est, 0) / paired.length;
  const my = paired.reduce((a, e) => a + e.x, 0) / paired.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (const e of paired) {
    sxy += (+e.est - mx) * (e.x - my); sxx += (+e.est - mx) ** 2; syy += (e.x - my) ** 2;
  }
  const r = (sxx > 0 && syy > 0) ? sxy / Math.sqrt(sxx * syy) : 0;
  console.log(`  gate estimate vs delivered (${process.env.REP === '1' ? 'representative regime'
    : 'headline ratio'}), ${paired.length} seeds: correlation ${r.toFixed(3)}`
    + `  (mean estimate ${mx.toFixed(2)}x against mean delivered ${my.toFixed(3)}x)`);
  console.log('  a gate whose THRESHOLD is merely misplaced still ranks; one near zero is not '
    + 'measuring the thing it gates on.');
}

// ---- THE ENSEMBLE AGAINST THE THREE THINGS IT HAS TO BEAT
{
  if (KSWEEP.length) {
    for (const k of KSWEEP) {
      if (k > pilots.length) continue;
      // A FRESH COMMISSIONING PER k, because `ensemble` writes the average into the first usable
      // draw's own arrays — averaging k=2 and then k=4 over the same objects would average an
      // average. Re-commissioning is the honest way and it is what makes this sweep expensive.
      const fresh = [];
      for (let i = 0; i < k; i++) fresh.push(commission(SEED0 + i));
      const ek = ensemble(fresh);
      if (!ek.pilot) { console.log(`    k=${k}: ${ek.why}`); continue; }
      ek.pilot.verdict = { deploy: true, why: 'k-sweep' };
      const o = scoreRecipe(ek.pilot, false), n2 = scoreRecipe(ek.pilot, true);
      console.log(`    k=${String(k).padStart(2)}  averaged ${ek.used}/${k}  delivers `
        + `${(o / n2).toFixed(3)}x`);
    }
  }
  // AND THE SAME QUESTION PUT TO THE MACHINE RATHER THAN TO THE GEOMETRY.
  //
  // The geometry says averaging is cancellation and not shrinkage — |draw| tracks
  // sqrt(|mean|^2 + spread^2), which a common scaling cannot produce. But that is an argument, and
  // this project's own rule is that where a design and its prediction agree with each other and
  // disagree with the machine, the machine decides (rule 16). So: take ONE draw, refit it at a
  // ridge large enough to shrink it the way the average is shrunk, and score it. If a shrunken
  // single draw matches the ensemble, the k-fold cost buys nothing a ridge does not.
  //
  // `freezeConfig` is what makes this a one-variable test: the shrunken pilot inherits the same
  // window, stride and basis, so the ONLY difference is the ridge.
  if (process.env.RIDGEX) {
    const M = +process.env.RIDGEX;
    const donor = pilots[0];
    const shrunk = commission(SEED0, (p) => {
      freezeConfig(donor, p);
      p._frozenConfig.forEach((c) => { c.ridge *= M; });
    });
    const norm = (w) => Math.sqrt(w.reduce((a, v) => a + v * v, 0));
    shrunk.verdict = { deploy: true, why: 'ridge probe' };
    const o = scoreRecipe(shrunk, false), n3 = scoreRecipe(shrunk, true);
    console.log(`\n  RIDGE PROBE: one draw refit at ridge x${M} (same window, stride and basis)`);
    console.log(`    |w| ${norm(shrunk.readouts[0].w[0]).toExponential(3)} against the draw's own `
      + `${norm(donor.readouts[0].w[0]).toExponential(3)}`);
    console.log(`    delivers ${(o / n3).toFixed(3)}x — if this matches the ensemble, averaging is `
      + 'a ridge and the k-fold cost buys nothing');
  }

  // ANALYZE: IS THE AVERAGE JUST A SMALLER CORRECTION?
  //
  // The alternative explanation that has to be excluded before any of this is an architecture: if
  // averaging k models mostly SHRINKS the weights toward zero, it is equivalent to one
  // commissioning with a larger ridge — one knob, one commissioning, none of the k-fold cost. The
  // two are distinguishable by geometry. Shrinkage moves the mean along the draws' own direction
  // and leaves it inside their spread; genuine cancellation moves it somewhere no draw was, and
  // the residual disagreement between draws is what got removed.
  {
    const norm = (w) => Math.sqrt(w.reduce((a, v) => a + v * v, 0));
    const drawN = pilots.map((p) => norm(p.readouts[0].w[0]));
    const pre = Float64Array.from(pilots[0].readouts[0].w[0]);   // before ensemble() overwrites it
    const meanW = new Float64Array(pre.length);
    let nUsed = 0;
    const shape = (p) => JSON.stringify(p.readouts.map((r) => [r.w.length, r.w[0].length,
      r.stride, !!r.poly, !!r.sched]));
    const want = shape(pilots[0]);
    for (const p of pilots) {
      if (shape(p) !== want) continue;
      const wl = p.readouts[0].w[0];
      for (let i2 = 0; i2 < meanW.length; i2++) meanW[i2] += wl[i2];
      nUsed++;
    }
    for (let i2 = 0; i2 < meanW.length; i2++) meanW[i2] /= Math.max(1, nUsed);
    // The SPREAD between draws, as an rms distance from their own mean: this is the quantity
    // averaging removes, and it is what a ridge cannot touch, because a ridge shrinks every draw
    // the same way and leaves them just as far apart.
    let spread = 0, cnt = 0;
    for (const p of pilots) {
      if (shape(p) !== want) continue;
      const wl = p.readouts[0].w[0];
      let d = 0;
      for (let i2 = 0; i2 < meanW.length; i2++) d += (wl[i2] - meanW[i2]) ** 2;
      spread += Math.sqrt(d); cnt++;
    }
    spread /= Math.max(1, cnt);
    const mN = norm(meanW), avgN = drawN.reduce((a, v) => a + v, 0) / drawN.length;
    console.log(`\n  IS THE AVERAGE JUST A SMALLER CORRECTION? (channel 0, lead 0, ${nUsed} draws)`);
    console.log(`    mean |w| of the draws   ${avgN.toExponential(3)}`);
    console.log(`    |w| of their average    ${mN.toExponential(3)}   ratio ${(mN / avgN).toFixed(3)}`);
    console.log(`    rms spread about the mean ${spread.toExponential(3)}  `
      + `= ${(spread / avgN * 100).toFixed(1)}% of a draw's own size`);
    console.log('    a ratio near 1 with a large spread is CANCELLATION — the draws disagree and '
      + 'the disagreement is what leaves. A ratio well below 1 is shrinkage, i.e. a ridge.');
    void pre;
  }
  const e = ensemble(pilots);
  if (!e.pilot) {
    console.log(`\n  ensemble: ${e.why}`);
  } else {
    // FORCED TO DEPLOY, because the question is what the AVERAGED MODEL is worth, and a gate
    // verdict inherited from whichever draw happened to be first is not that question. A
    // commissioned pilot that refused carries `verdict.deploy === false` and `act()` then returns
    // zeros, which would score the ensemble as exactly 1.000x and look like a null result.
    // AND IT IS PUT THROUGH A REAL VERIFY, WHICH IS WHAT MAKES THIS AN ARCHITECTURE RATHER THAN
    // AN OBSERVATION. `_startVerify()` is already a re-entrant path — a guard derate re-enters
    // there — so the averaged model can be vouched for on the machine exactly like any other
    // commissioned one: commission k, average, VOUCH, deploy. Forcing the verdict instead would
    // answer "what does the average deliver" and leave "would this ever ship" unanswered.
    const mv = makeTanks(GMP);
    const startV = voltsFor(GMP, RECIPE[0][0], RECIPE[0][1]);
    for (let i = 0; i < 30000; i++) mv.step(startV[0], startV[1]);
    e.pilot._startVerify();
    let guardStop = 0;
    while (e.pilot.phase !== 'done') {
      if (e.pilot.phase === 'fit') { e.pilot.work(); continue; }
      const cmd = e.pilot.command();
      mv.step(cmd[0].pos + cmd[0].u, cmd[1].pos + cmd[1].u);
      const want = levelsAt(GMP, cmd[0].pos, cmd[1].pos);
      e.pilot.observe([mv.h[0], mv.h[1], mv.h[2], mv.h[3]],
        [mv.h[0] - want[0], mv.h[1] - want[1]]);
      if (++guardStop > 4e6) break;                 // never spin forever on a phase that sticks
    }
    const vv = e.pilot.status().report.verify;
    console.log(`\n  the ensemble VOUCHED FOR ITSELF: ${e.pilot.verdict.deploy ? 'DEPLOY' : 'refuse'}`
      + `${vv ? ` at ${(+vv.ratio).toFixed(2)}x` : ' (no verify)'}`
      + `${e.pilot.verdict.deploy ? '' : ` — ${String(e.pilot.verdict.why).slice(0, 70)}`}`);
    const vouched = !!e.pilot.verdict.deploy;
    // Scored as the machine would run it: if the gate refused, `act()` returns zeros and the
    // number below IS 1.000x, which is the honest reading rather than a forced one.
    if (!vouched) e.pilot.verdict = { deploy: true, why: 'ensemble, forced for comparison only' };
    const off = scoreRecipe(e.pilot, false), on = scoreRecipe(e.pilot, true);
    const x = off / on;
    const dep = ests.filter((q) => q.dep).map((q) => q.x);
    const picked = ests.filter((q) => q.est != null)
      .reduce((b, q) => (+q.est > +b.est ? q : b), ests.find((q) => q.est != null));
    console.log(`\n  ENSEMBLE of ${e.used}/${e.of} draws (one averaged weight vector, `
      + 'deployed cost unchanged):');
    console.log(`    delivers ${x.toFixed(3)}x  ${vouched ? '(and the gate vouched for it)'
      : '(FORCED — the gate refused it, so this is not what would ship)'}`);
    console.log(`    against: median draw ${med(xs).toFixed(3)}x · best draw `
      + `${Math.max(...xs).toFixed(3)}x · gate's pick ${picked ? picked.x.toFixed(3) + 'x' : '—'}`
      + `${dep.length ? ` · median DEPLOYED draw ${med(dep).toFixed(3)}x` : ''}`);
    console.log('    a k-draw average that only matches the median has removed no variance; one '
      + 'that beats the best single draw is finding something no draw had.');
  }
}
