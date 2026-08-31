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

function commission(seed) {
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
  console.log(`  ${String(s).padStart(5)}   ${dep ? ' yes ' : ' NO  '}  ${off.toFixed(4)}  `
    + `${on.toFixed(4)}  ${x.toFixed(3)}x  ${est == null ? '    —' : `${(+est).toFixed(2)}x`.padStart(6)}`
    + `  ${regs.padEnd(30)}  ${dep ? '' : why}`);
}

// ================= THE ENSEMBLE, WHICH IS FREE AT DEPLOY AND IS THE POINT =================
//
// Selection keeps the best of k commissionings and throws away k-1 of them. AVERAGING keeps all
// of them, and on this architecture it costs NOTHING to run: every draw fits the same feature
// layout, so k weight vectors average to ONE vector of the same length — deployed arithmetic and
// memory unchanged, against selection's identical cost and the per-lead bank's 68 covariances.
//
// IT IS WELL-POSED BECAUSE THE SPREAD IS ESTIMATION VARIANCE, NOT A DISCRETE PICK. Measured on
// the arm: six draws, delivered 6.18x down to 5.34x on one program and 10.02x down to 5.19x on a
// held-out one, and ALL SIX chose the identical configuration — stride 13, ridge 1e-5, N 58. A
// spread at a fixed layout is variance, and variance is what averaging removes.
//
// AND THE LAYOUT IS CHECKED RATHER THAN ASSUMED. A draw that chose a different basis has a
// different row and averaging it in would evaluate the model on a vector it was never fitted on —
// the exact defect the deploy path's length guard exists to catch (rule 61). Mismatched draws are
// excluded and SAID, not silently dropped.
function ensembleOf(pilots) {
  const base = pilots[0];
  const shape = (p) => JSON.stringify(p.readouts.map((r) => [r.w.length, r.w[0].length,
    r.stride, r.poly, r.sched]));
  const want = shape(base);
  const usable = pilots.filter((p) => shape(p) === want);
  if (usable.length < 2) return { pilot: null, used: usable.length, of: pilots.length };
  // The average is written into the FIRST pilot's own arrays, so everything downstream — act(),
  // the guards, the cap — is the ordinary deployed path with no ensemble-specific branch.
  base.readouts.forEach((ro, c) => {
    for (let L = 0; L < ro.w.length; L++) {
      const acc = new Float64Array(ro.w[L].length);
      for (const p of usable) {
        const wl = p.readouts[c].w[L];
        for (let i = 0; i < acc.length; i++) acc[i] += wl[i];
      }
      for (let i = 0; i < acc.length; i++) acc[i] /= usable.length;
      ro.w[L].set(acc);
    }
  });
  return { pilot: base, used: usable.length, of: pilots.length };
}

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
  const e = ensembleOf(pilots);
  if (!e.pilot) {
    console.log(`\n  ensemble: only ${e.used} of ${e.of} draws share a feature layout — not averaged`);
  } else {
    // FORCED TO DEPLOY, because the question is what the AVERAGED MODEL is worth, and a gate
    // verdict inherited from whichever draw happened to be first is not that question. A
    // commissioned pilot that refused carries `verdict.deploy === false` and `act()` then returns
    // zeros, which would score the ensemble as exactly 1.000x and look like a null result.
    e.pilot.verdict = { deploy: true, why: 'ensemble, scored directly' };
    const off = scoreRecipe(e.pilot, false), on = scoreRecipe(e.pilot, true);
    const x = off / on;
    const dep = ests.filter((q) => q.dep).map((q) => q.x);
    const picked = ests.filter((q) => q.est != null)
      .reduce((b, q) => (+q.est > +b.est ? q : b), ests.find((q) => q.est != null));
    console.log(`\n  ENSEMBLE of ${e.used}/${e.of} draws (one averaged weight vector, `
      + 'deployed cost unchanged):');
    console.log(`    delivers ${x.toFixed(3)}x`);
    console.log(`    against: median draw ${med(xs).toFixed(3)}x · best draw `
      + `${Math.max(...xs).toFixed(3)}x · gate's pick ${picked ? picked.x.toFixed(3) + 'x' : '—'}`
      + `${dep.length ? ` · median DEPLOYED draw ${med(dep).toFixed(3)}x` : ''}`);
    console.log('    a k-draw average that only matches the median has removed no variance; one '
      + 'that beats the best single draw is finding something no draw had.');
  }
}
