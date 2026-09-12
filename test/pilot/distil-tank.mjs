/**
 * @file THE DEPLOYED OBJECT ON A THIRD PLANT — and the reason it had to be asked (plan §54.4).
 *
 * THE GAP THIS CLOSES IS NOT A MISSING NUMBER, IT IS A MISATTRIBUTED ONE. Under the memory's
 * retirement the deployed artefact is `distil.js`'s weight vector and nothing else —
 * `test/inventory.test.mjs` says so, `lib/pilot/deploy.js` reimplements it, and
 * `test/pilot/artefact.test.mjs` pins the two bit-identical. But `distil.js` is imported by
 * exactly TWO plant harnesses, the arm and the EMPS axis. Every other plant here — the tank,
 * Wood-Berry, the mill, the barrel, the cart-pole — scores `pilot.js`, which under that same
 * retirement is the TEACHER and not the product.
 *
 * So CLAUDE.md's "reusable across plants: 3 clear wins of 6" is a claim about a component that no
 * longer ships. The honest figure for the thing a customer receives is 2 of 7, and it stays 2 of 7
 * until a third plant is asked. This asks the tank.
 *
 * WHY THE TANK AND NOT THE MILL. The distilled policy is a map of a WINDOW OF THE COMMANDED
 * REFERENCE, so the only plants it can possibly help are ones whose error is a function of that
 * reference. The tank's recipe IS a commanded reference with structure — ramps and holds in pump
 * volts — so a deploy is physically possible there and the measurement is informative either way.
 * The mill's dominant error is roll eccentricity, an EXOGENOUS periodic disturbance that the
 * commanded reference carries no information about, so a refusal there would be predicted by the
 * design rather than measured from it (rule 16 in reverse: do not spend a commissioning to
 * confirm what the architecture already states). The mill is the right SECOND question and the
 * wrong first one.
 *
 * WHAT IS HELD OUT. The shipped `RECIPE` from `rigs/tanks-rig.mjs` — the exact program
 * `tanks.test.mjs` scores — appears in NO training run. The diet is built from the same generator
 * at other level pairs, which is the tank's analogue of the arm's polygon diet: the same class of
 * program at other parameters, never the production geometry (§49.11).
 *
 * EITHER OUTCOME IS A RESULT, and the file states which before running (rule 27, and §52.32's
 * lesson that a claim checked after the fact is worth less than one checked before):
 *   DEPLOYS AND HELPS  -> the product is 3 of 7, and the retirement has a plant it was not built on
 *   REFUSES            -> the product is 2 of 7 and CLAUDE.md's plant-agnosticism line needs
 *                         rewriting to say whose claim it is. A refusal is still target 3's
 *                         improve-or-refuse-with-a-reason, and the reason is what this prints.
 *   DEPLOYS AND HARMS  -> the gate failed on a plant where `verifyRef` was supposed to have fixed
 *                         exactly that, which would be the most valuable outcome of the three.
 *
 * Run: SUITE=full node test/pilot/distil-tank.mjs   [SEEDS=1,2]  [GRADE=fast]
 */
import { AutoStack } from '../../lib/pilot/autostack.js';
import { UCAP, makeTanks, voltsFor, SEG, HOLD, RECIPE, quintic, refAtStep, PROG }
  from './rigs/tanks-rig.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-tank: SKIPPED (full tier only — one commissioning per seed)\n');
  process.exit(0);
}

const G = [0.70, 0.60];

// THE REACH, DERIVED (see the `distil` block below). Tset 2769 x 0.61 = 1688 raw steps each way.
const REACH = 1688;
const OFFSETS = [0, 8, 16, 32, 64, 128, 224, 352, 512, 736, 1024, 1344, REACH]
  .flatMap((o) => (o === 0 ? [0] : [-o, o])).sort((a, b) => a - b);
const SEEDS = (process.env.SEEDS || '1').split(',').map(Number);
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
console.log('\ndistil-tank: the DEPLOYED object on a third plant\n');

// ---------------------------------------------------------------- the diet
// THE SAME GENERATOR AT OTHER LEVEL PAIRS. Not the shipped recipe, and not a different KIND of
// program: the arm's diet is polygons from the block's own designer and this is its analogue.
// Each is CYCLED so it has a lap, which is what the distilled rung's teacher needs — a batch
// recipe that repeats is an ordinary process, not a contrivance.
// AND THE DIET'S DISTANCE FROM PRODUCTION IS THE FIRST-ORDER TERM, WHICH THIS FILE LEARNED FROM
// THE BARREL (plan §66). There, four unrelated profiles read 0.85x and four built from the
// machine's OWN profiles in orders production never runs read 10.61x — the same rung, the same
// window, the same teacher, only the diet moving. `DIET=near` (the default) is that construction
// here: production runs RECIPE[0..4] in order, and these cycles are its own level pairs in other
// sequences, none of them production's. `DIET=far` keeps the unrelated levels this file shipped
// with, as the control that says which of the two the number came from.
const NEAR = [
  [RECIPE[0], RECIPE[2], RECIPE[1], RECIPE[3]],
  [RECIPE[1], RECIPE[4], RECIPE[0], RECIPE[2]],
  [RECIPE[3], RECIPE[0], RECIPE[4], RECIPE[1]],
  [RECIPE[2], RECIPE[4], RECIPE[3], RECIPE[0]],
];
const FAR = [
  [[9.8, 11.4], [12.9, 9.3], [9.1, 12.1], [11.8, 10.2]],
  [[11.2, 9.9], [8.9, 12.4], [12.6, 10.8], [10.1, 11.1]],
  [[10.2, 12.2], [13.1, 10.4], [9.6, 9.4], [11.4, 12.6]],
  [[12.4, 11.0], [9.4, 10.6], [11.9, 12.9], [10.6, 9.1]],
];
// AND THE ONE CONSTRUCTION THE CONFLICT LEAVES OPEN (plan §67.1): DECOUPLE SPEED FROM RATE.
// This plant's bind is that production's own ramp is 1.01x its settle, so a diet covering
// production's commanded-speed envelope teaches mostly from targets already at zero (teacher
// gains of 4e6 — rule 14) while a diet fast enough to excite falls outside the envelope and the
// coverage guard fades it. Bracketing the RATE cannot resolve that, because production's rate is
// itself quasi-static. But SPEED is |Δlevel| / ramp and the two factors are independent: a
// SMALLER level change on a FASTER ramp holds the speed and restores the excitation. At ramp 969
// (0.35·Tset, so every recipe excites) amplitudes of 0.20/0.35/0.60/0.85 cm give commanded speeds
// of 4.1e-4 … 1.75e-3, which brackets production's own measured 4.29e-4 … 1.82e-3. It is the
// default because it is the only diet here that satisfies both constraints; `DIET=far` and
// `DIET=near` remain as the controls that say what each of the other two measured.
const SPEED = [0.20, 0.35, 0.60, 0.85].map((A) => [
  [10.7 + A, 10.7 - A], [10.7 - A, 10.7 + A], [10.7 + A, 10.7 + A], [10.7 - A, 10.7 - A]]);
const DIETS = process.env.DIET === 'far' ? FAR
  : process.env.DIET === 'near' ? NEAR : SPEED;

// THE DIET'S RATE LADDER, AND IT TOOK TWO WRONG DIETS TO ARRIVE AT, BOTH RECORDED.
//
// FIRST WRONG DIET — QUASI-STATIC. Built at the shipped recipe's SEG of 4000 against this plant's
// measured Tset of 2769, every ramp gives the tank longer than a full settle, so it tracks its own
// commanded steady state almost exactly and there is nearly NO dynamic error to teach from. The
// teacher duly "converged" the training runs at gains of 3.2e6 to 5.6e6 — not a controller result,
// the signature of a target that is already zero (rule 14: a surprising measurement is a reason to
// check the instrument). That is rule 41b aimed at a training diet, which §50 paid for once.
//
// SECOND WRONG DIET — OUT OF THE SCORED PROGRAM'S ENVELOPE. Shortening every segment to 0.5·Tset
// made the lag real (gains fell to 4e4-4e5) and the rung still refused at EXACTLY 1.000x, which is
// the signature of a FADED correction rather than a scored one: the diet's ramps run 2.89x faster
// than the shipped recipe's, so the production program sits BELOW the commanded-speed span the fit
// saw and the coverage guard fades the correction to zero. That is §52.40's feedrate finding in
// mirror image — there the diet was commanded at the top of its own range and production had no
// headroom ABOVE it — and §52.41's remedy is the same and has no constant in it: BRACKET the
// production rate rather than sitting to one side of it.
//
// So the diet is a RATE LADDER around the shipped SEG of 4000, one recipe per rate, spanning
// 0.5·Tset to 1.5x the production segment. The holds keep the shipped recipe's 30% duty, so what
// varies across the ladder is the RATE and not the shape.
// THE SEGMENT LADDER IS NOW FLAT FOR THE SPEED DIET, because its ladder is in AMPLITUDE. A rate
// ladder here put 3 of its 4 recipes past a full settle (§67.1); one exciting rate with four
// amplitudes spans the same commanded speeds and leaves every recipe with something to teach.
const DSEGS = (process.env.DIET === 'far' || process.env.DIET === 'near')
  ? [Math.round(0.5 * 2769), 2770, SEG, Math.round(1.5 * SEG)]
  : [1385, 1385, 1385, 1385];
const holdOf = (seg) => Math.round(seg * (HOLD / SEG));
/** One recipe's reference in LEVELS, at raw step k, cycled at its own lap. */
const refOf = (rec, seg) => (k) => {
  const lap = seg * rec.length, hold = holdOf(seg);
  const kk = ((k % lap) + lap) % lap;
  const i = Math.floor(kk / seg);
  const t = (kk - i * seg - hold) / (seg - hold);
  const s = t <= 0 ? 0 : t >= 1 ? 1 : quintic(t);
  const a = rec[i], b = rec[(i + 1) % rec.length];
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
};

/** Settle the plant at a recipe's own start, so no run is scored across its startup (rule 13). */
function settled(rec, seg) {
  const p = makeTanks(G);
  const h0 = refOf(rec, seg)(0), v0 = voltsFor(G, h0[0], h0[1]);
  for (let i = 0; i < 30000; i++) p.step(v0[0], v0[1]);
  return p;
}

// ---------------------------------------------------------------- the ladder
async function once(seed) {
  const auto = new AutoStack({
    // ROUTED EXACTLY AS `tanks.test.mjs` ROUTES IT — same signals, same box, same guard, same cap.
    // If this harness gave the plant a different envelope it would be measuring a different plant
    // and the comparison against that file's numbers would be worthless (rule 20).
    nMeasured: 4, channels: [0, 1].map(() => ({ lo: 2.0, hi: 3.6, vMax: 4e-3, aMax: 2e-5, jMax: 2e-7 })),
    uMax: UCAP, guards: [{ index: 0, max: 19 }, { index: 1, max: 19 }],
    workspace: () => true, seed,
    classic: false, maxDepth: 1, periodic: false,
    // THE WINDOW IS RE-DERIVED FROM THIS PLANT'S OWN MEASURED SETTLE, not carried from the arm
    // (rule 31, which names the scoring window and the ridge among the constants this project has
    // carried and been wrong about). The arm's shipped ladder reaches ±2048 raw steps against its
    // own Tset of 3360 — a reach of 0.61·Tset each way — and `tanks.test.mjs` measures THIS plant
    // at Tset 2769, so the same reach is ±1688. The ladder below is that number with the arm's
    // geometric SHAPE, which is the part that is a design and not a constant: dense near now
    // where the correction is decided, sparse far out where it only has to span the memory.
    // THE TWO KNOBS THE BARREL NEEDED, AND THE REASON THIS FILE'S 1.000x MAY NEVER HAVE BEEN A
    // MACHINE VERDICT AT ALL. `act()` returns ZEROS when the fit did not vouch, so an EXACT
    // 1.000x is the signature of a fit that refused rather than a correction that was scored and
    // lost — and the barrel read exactly that until two things moved (plan §63.4, §63.6):
    // STANDARDISING the row, because `_rowFrom` leads with the ABSOLUTE reference (volts of
    // order 3.5 here) beside DIFFERENCES of order 0.1 under one ridge and one covariance prior
    // (rule 32); and the BATCH route, because the streaming shared-covariance fit could not find
    // a fit that exists, is well posed and has hundreds of rows per feature — reading held-out
    // -20 where batch read 0.95. Neither was ever tried on this plant.
    distil: { refDim: 2, ridge: 1e-6, offsets: OFFSETS,
      ...(process.env.STD === '1' ? { standardize: true } : {}),
      ...(process.env.ONLINE === '0' ? { online: false } : {}) },
  });

  const start = voltsFor(G, RECIPE[0][0], RECIPE[0][1]);
  auto.start = start;

  /** The SHIPPED recipe — held out of training, and the only thing scored. */
  // THE SCORED RUN'S OWN APPLIED SIGNAL, which is §67.2's named next measurement. The `actLook`
  // probe reads the policy saturated at its cap on this program while the rung's row reads the
  // bare machine's error to five figures, and those cannot both be true of one deploy path. This
  // prints what the SCORING loop actually added, per candidate, so the two can be compared
  // instead of reasoned about (rule 16: put the question to the machine).
  const run = async (corr, cname) => {
    const p = makeTanks(G);
    for (let i = 0; i < 30000; i++) p.step(start[0], start[1]);
    let s2 = 0, n = 0, uPk = 0;
    const e0 = new Float64Array(PROG), e1 = new Float64Array(PROG);
    for (let k = 0; k < PROG; k++) {
      const h = refAtStep(k), v = voltsFor(G, h[0], h[1]);
      // THE DEPLOYED RUNGS ACT THROUGH `auto.act`, AND THIS HOST NEVER CALLED IT. The distilled
      // rung is applied by `act()` — `rigs/ladder.mjs` calls it every step and adds the candidate
      // on top through `auto.into` — while this file applied ONLY the candidate `corr`. So the
      // rung was never present in the run that scored it: both scored calls came back with peak
      // |u| 0.000 and an rms identical to the bare machine to five figures, which is exactly the
      // 1.000x §54.4 reported as "scored on the machine, lost and was reverted". It was not
      // scored at all. (plan §67.3; rule 25 — "not measured" and "no better" are different
      // states, and this is the third time that distinction has cost this project a verdict.)
      const look = (o) => {
        const hh = refAtStep(Math.min(PROG - 1, Math.max(0, k + o)));
        return voltsFor(G, hh[0], hh[1]);
      };
      const sp = (() => {
        const p0 = refAtStep(Math.max(0, k - 1)), p1 = refAtStep(Math.min(PROG - 1, k + 1));
        const v0 = voltsFor(G, p0[0], p0[1]), v1 = voltsFor(G, p1[0], p1[1]);
        return Math.hypot(v1[0] - v0[0], v1[1] - v0[1]) * 0.5;
      })();
      const a = auto.act({ look, lookRaw: look, k, speed: sp });
      const w = corr ? auto.into(corr.at(k), cname, {}) : [0, 0];
      const u = [(a[0] || 0) + (w[0] || 0), (a[1] || 0) + (w[1] || 0)];
      uPk = Math.max(uPk, Math.abs(u[0] || 0), Math.abs(u[1] || 0));
      p.step(v[0] + (u[0] || 0), v[1] + (u[1] || 0));
      auto.observe([p.h[0], p.h[1], p.h[2], p.h[3]]);
      e0[k] = p.h[0] - h[0]; e1[k] = p.h[1] - h[1];
      if (k > SEG) { s2 += (p.h[0] - h[0]) ** 2 + (p.h[1] - h[1]) ** 2; n += 2; }
    }
    const out = { score: Math.sqrt(s2 / n), err: [e0, e1], uPk };
    if (process.env.APPLIED === '1') {
      console.log(`      scored run [${cname || 'bare'}]: rms ${out.score.toExponential(4)}, `
        + `peak |u| ${uPk.toExponential(3)} of ${UCAP}`);
    }
    return out;
  };

  /** The training diet: four recipes the scored program is not one of. */
  const distilRuns = () => DIETS.map((rec, di) => {
    const seg = DSEGS[di % DSEGS.length];
    const lap = seg * rec.length, ref = refOf(rec, seg);
    return {
      lap,
      refAt: (k) => { const h = ref(k); return voltsFor(G, h[0], h[1]); },
      // THE COVERAGE GUARD NEEDS A COMMANDED SPEED, AND THIS HOST NEVER GAVE IT ONE. `distil.js`
      // fades its correction outside the speed span the fit saw, and `_coverage(null)` returns 1
      // — so a host that omits `speedAt` disables the one mechanism built to stop a linear map
      // extrapolating off its training distribution. With the rung finally reaching the machine
      // (§67.3) it saturates at its cap on the production recipe and delivers 0.08x; the guard is
      // what that measurement is for. Speed is the commanded reference's own rate, differenced.
      speedAt: (k) => {
        const a = ref(k - 1), b = ref(k + 1);
        return Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.5;
      },
      // THE LAP IS CLOSED AND MUST SAY SO (plan §52.14, §65.1). `refOf` wraps at `lap`, but
      // `addProgram` clamps the window at index 0 unless the run declares itself closed — so
      // without this the fit skips the first REACH samples of every recipe AND the deployed
      // policy then reads wrapped windows at every lap start that the fit never saw. It was
      // missing here from the day this file was written, so §54.4's held-out 1.000x was measured
      // through it; the row count is what says so, and `distilkit.mjs` now checks it for free.
      closed: true,
      run: async (corr) => {
        const p = settled(rec, seg);
        let s2 = 0, n = 0;
        const e0 = new Float64Array(lap), e1 = new Float64Array(lap);
        for (let k = 0; k < 3 * lap; k++) {
          const kk = ((k % lap) + lap) % lap;
          const h = ref(k), v = voltsFor(G, h[0], h[1]);
          const u = corr ? corr.at(kk) : [0, 0];
          p.step(v[0] + (u[0] || 0), v[1] + (u[1] || 0));
          if (k >= 2 * lap) { e0[kk] = p.h[0] - h[0]; e1[kk] = p.h[1] - h[1]; }
          if (k >= lap) { s2 += (p.h[0] - h[0]) ** 2 + (p.h[1] - h[1]) ** 2; n += 2; }
        }
        return { score: Math.sqrt(s2 / n), err: [e0, e1] };
      },
    };
  });

  const rep = await auto.commission({ run, distilRuns });

  // THE SPLIT THAT SAYS *WHY*, and the one `distil-arm.mjs` exists to make: score the fitted
  // policy on its OWN TRAINING RUNS. Helps them and refuses the held-out recipe -> TRANSFER, and
  // the diet or the plant's program-to-program similarity is the subject. Cannot help even the
  // programs it was fitted on -> the map cannot EXPRESS this plant's correction, and no diet fixes
  // that. Without this column a refusal has two explanations and the table cannot tell them apart.
  // WHAT THE POLICY ACTUALLY APPLIES ON PRODUCTION, measured rather than inferred. The rung's row
  // reads identical to the bare machine to five digits while the fit VOUCHES (held-out 0.99999)
  // and the in-sample column reads 129-564x. There are only two ways that happens: the applied
  // correction is ZERO — a fade or a refused fit, and both are ruled out, since `_coverage(null)`
  // returns 1 and `deploy` is true — or it is NON-ZERO and cancels to nothing on this program.
  // Those are different findings with different fixes, so the applied signal is printed beside
  // the error it did or did not move (rule 25: "not measured" and "exactly zero" differ).
  if (rep.distil && rep.distil.policy) {
    const pol0 = rep.distil.policy;
    let uPk = 0, u2 = 0;
    for (let k = 0; k < PROG; k++) {
      const u = pol0.actLook((o) => {
        const h = refAtStep(Math.min(PROG - 1, Math.max(0, k + o)));
        return voltsFor(G, h[0], h[1]);
      });
      for (const v of u) { uPk = Math.max(uPk, Math.abs(v)); u2 += v * v; }
    }
    console.log(`    APPLIED on production: peak |u| ${uPk.toExponential(3)}, rms `
      + `${Math.sqrt(u2 / (2 * PROG)).toExponential(3)}, authority ${UCAP} — `
      + (uPk < 1e-9 ? 'ZERO, so the rung never acted'
        : 'NON-ZERO, so it acted and delivered nothing'));
  }

  let inSample = null;
  if (rep.distil && rep.distil.policy) {
    const pol = rep.distil.policy;
    inSample = [];
    for (const r of distilRuns()) {
      const bare = await r.run(null);
      const withP = await r.run({ at: (k) => pol.actLook((o) => r.refAt(k + o)) });
      inSample.push(bare.score / withP.score);
    }
  }
  return { auto, rep, inSample };
}

// ---------------------------------------------------------------- the run
const results = [];
for (const seed of SEEDS) {
  const t0 = Date.now();
  const r0 = await once(seed);
  const { auto, rep } = r0;
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(auto.table());
  const shipped = JSON.stringify(rep.deployed);
  console.log(`    seed ${seed}: shipped ${shipped}  ${rep.base.toExponential(4)} -> `
    + `${rep.best.toExponential(4)} cm rms   ${rep.gain.toFixed(3)}x   ${secs}s`);
  // THE RUNG'S OWN REPORT, read from the object rather than from a field this harness invented.
  if (rep.distil) console.log(`    ②d fit: deploy ${rep.distil && rep.distil.fit ? rep.distil.fit.deploy : '—'}, held-out ${
      rep.distil && rep.distil.fit ? JSON.stringify(rep.distil.fit.heldOutR2) : '—'}, rows ${
      rep.distil && rep.distil.fit ? rep.distil.fit.rows : '—'}
    ②d fit: deploy ${rep.distil && rep.distil.fit ? rep.distil.fit.deploy : '—'}, held-out ${rep.distil && rep.distil.fit ? JSON.stringify(rep.distil.fit.heldOutR2) : '—'}  — act() returns ZEROS when deploy is false, so an EXACT 1.000x is a fit that refused and
      not a correction that was scored and lost
    ②d report: ${JSON.stringify(rep.distil).slice(0, 400)}`);
  if (r0.inSample) {
    console.log(`    IN SAMPLE — the policy on its OWN training runs: `
      + r0.inSample.map((x) => x.toFixed(3) + 'x').join('  '));
  } else {
    console.log('    IN SAMPLE — not scored: the rung published no policy to score (a refusal before the fit)');
  }
  results.push({ seed, rep, inSample: r0.inSample,
    deployedDistil: !!(rep.deployed && rep.deployed.distil), gain: rep.gain });
}

// ---------------------------------------------------------------- what it means
const anyDeploy = results.some((r) => r.deployedDistil);
const worst = Math.min(...results.map((r) => r.gain));

if (SEEDS.length > 1) {
  const sig = results.map((r) => (r.inSample || []).map((x) => x.toFixed(6)).join(','));
  const same = sig.every((x) => x === sig[0]);
  console.log(`\n  ${same
    ? 'SEEDS ARE BYTE-IDENTICAL — and that is ONE draw N times, not N draws agreeing: no cascade\n'
      + '    builds here, so no seeded excitation runs. A spread on this plant needs the DIET varied.'
    : 'the seeds differ, so the spread below is a real distribution'}`);
}
console.log('\n  THE QUESTION THIS FILE EXISTS TO ANSWER:');
console.log(`    the deployed object reached a third plant: ${anyDeploy ? 'YES — it DEPLOYED' : 'NO — it REFUSED'}`);
console.log(`    worst delivered ratio across ${results.length} seed(s): ${worst.toFixed(3)}x`);

// BOTH HALVES (rule 9). "It refused" is only a good outcome if the refusal also did no harm, and
// "it deployed" is only a good outcome if the machine actually got better. Assert each separately
// so neither can carry the other.
check('the ladder REACHES the distilled rung on this plant — a row exists, deployed or refused',
  results.every((r) => r.rep && r.rep.deployed !== undefined), JSON.stringify(results.map((r) => r.rep && r.rep.deployed)));
check('…and NOTHING was made worse than the machine it sits on, deployed or refused',
  worst >= 0.995, `worst ${worst.toFixed(3)}x`);
if (anyDeploy) {
  check('…and where it deployed, the machine is actually better', worst > 1.0, `worst ${worst.toFixed(3)}x`);
  console.log('\n    => the DEPLOYED object is 3 of 7 plants, not 2. CLAUDE.md\'s plant line can say so.');
} else {
  const ins = results.flatMap((r) => r.inSample || []);
  const helpedOwn = ins.length && ins.every((x) => x > 1.02);
  console.log('\n    => the DEPLOYED object is still 2 of 7. The six-plant evidence belongs to the');
  console.log('       TEACHER, and CLAUDE.md must say whose claim it is (plan §54.4).');
  if (ins.length) {
    console.log(helpedOwn
      ? '    => and it HELPS its own training runs, so the refusal is TRANSFER: this plant\'s programs\n'
        + '       do not inform each other through a reference window, which is a property of the plant.'
      : '    => and it does NOT reliably help even its own training runs, so the limit is what the map\n'
        + '       can EXPRESS on this plant — a diet cannot fix that, and the next question is the basis.');
  }
}

console.log(failed ? `\ndistil-tank: ${failed} check(s) FAILED\n` : '\ndistil-tank: all checks passed\n');
process.exit(failed ? 1 : 0);
