/**
 * @file ONE COMMISSIONING, FOUR PROGRAMS IT HAS NEVER RUN — two shapes at two feedrates.
 *
 * Targets 1 and 2 of the north star in one table. PROGRAM-AGNOSTIC asks whether a controller
 * commissioned once holds on shapes it did not see; FEEDRATE-AGNOSTIC asks whether it holds when
 * the same shape is run at a different speed. They have always been separate claims with separate
 * evidence, and neither has been measured on this plant as a matrix.
 *
 * WHY THESE TWO SHAPES. A CIRCLE has curvature everywhere and none of it changes, so the feedrate
 * profile settles to one speed and stays: it asks about steady tracking. A SHARP SQUARE has
 * corners with no arc at all, where the corner rule takes the junction velocity to nearly zero —
 * the machine stops and restarts four times a lap, and each reversal unloads the gearbox wind-up
 * through the backlash. That is the case a model fitted on smooth motion is least likely to have
 * seen, and it is where compliance shows.
 *
 * THE FEEDRATES ARE NOT A SCALING OF EACH OTHER, WHICH IS THE POINT. Doubling the commanded feed
 * takes the circle's lap from 6283 steps to 3142 — exactly half — and the sharp square's from
 * 8206 to 4590, a factor of 1.79. The corner rule caps the junction velocity independently of the
 * feed, so a faster program spends proportionally MORE of its time in corners. A controller that
 * transfers across feed on the circle has not been asked the same question as one that transfers
 * on the square.
 *
 * Run: node test/pilot/matrix.mjs   [K=1]
 */
import { ensemble, freezeConfig } from '../../lib/pilot/ensemble.js';
import { solveRidge, Pilot } from '../../lib/pilot/pilot.js';
import { PG, mkPath, commissionArm, deployOn, recordOpenLoop, recordCornerProbe } from './rigs/arm-rig.mjs';

const K = +(process.env.K || 1);
const FEEDS = (process.env.FEEDS || '0.004,0.008').split(',').map(Number);
const SHAPES = (process.env.SHAPES || 'circle,sharp,rounded').split(',');
// WHAT IT COMMISSIONS ON, AND ONLY THAT. Parameterised because the first run named the failure —
// trained on the rounded rectangle, the sharp square transfers at 1.69x against the circle's
// 7.72x — and the mechanism it suggested is testable by swapping the training program: if the
// square fails because the model never saw a machine STOP AND RESTART, then commissioning on the
// square should fix those rows. What it costs the smooth programs is the other half of the answer.
const UCAP = +(process.env.UCAP || 0.15);
const DWELL = process.env.DWELL === '1';
const DPT = +(process.env.DPT || 30);
const TRAIN = { shape: process.env.TRAIN || 'rounded', feed: +(process.env.TRAINFEED || 0.004) };
// A FORCED SWEEP BAND, in periods of solver steps: CHIRP=512,2048. Empty leaves the pilot's own
// gate to decide, which on this arm means no sweep at all.
const CHIRP = process.env.CHIRP ? process.env.CHIRP.split(',').map(Number) : false;
// THE DECLARED RATE LIMITS, WHICH ARE WHAT THE EXCITATION IS BUILT AGAINST AND — measured — not
// what the programs run at. LIM=v,a,j overrides them. The shipped triple is the one every number
// in this project's arm history was taken under.
const LIM = process.env.LIM
  ? (([v, a, j]) => ({ vMax: v, aMax: a, jMax: j }))(process.env.LIM.split(',').map(Number))
  : { vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 };
// THE EXCITATION'S BOX HALF-WIDTH, and the sample period if it is to be forced. Both are here
// because they are the two knobs that set how FAST the commissioning record is: the box sets the
// excitation's bandwidth (velocity binds the traverse) and the sample sets how finely the model
// can index it. The sharp square's corner transition is 40 solver steps; the shipped regressor
// spacing is stride 13 x sample 9 = 117.
const BOX = +(process.env.BOX || 0.55);
const SAMPLE = process.env.SAMPLE ? +process.env.SAMPLE : null;
// SPARSE CORNER EVENTS IN THE EXCITATION: EVENTS=vShare,ramp,width,every (e.g. 0.4,2,16,600).
// The velocity trapezoids are sized so the record carries the PROGRAM's acceleration and jerk —
// the regime twelve controller-side knobs could not reach because the scribble never visits it.
const EVENTS = process.env.EVENTS
  ? (([v, r, w, e]) => ({ vShare: v, ramp: r, width: w, every: e }))(
    process.env.EVENTS.split(',').map(Number))
  : null;

async function commission(seed, before = null) {
  // THE LOOP ITSELF LIVES IN THE RIG. It was here, and `test/pilot/forecast.mjs` needed the same
  // commissioned pilot — which is the exact shape of the two defects this rig was created for:
  // a second copy of the drive loop routed the wrong truth, and a second copy of `deployOn`
  // leaked two lattices per call. A third copy would not have been the third mistake, it would
  // have been the same one.
  return commissionArm({ seed, before, train: TRAIN, uCap: UCAP,
    dwell: DWELL, dpt: DPT, chirp: CHIRP, limits: LIM, box: BOX, sampleFixed: SAMPLE,
    events: EVENTS });
}

console.log('\npilot: one commissioning, four programs it has never run');
console.log(`  trained on ${TRAIN.shape} at feed ${TRAIN.feed}; every row below is held out.`);
console.log(`  arm: E ${PG.E} / K ${PG.K} / backlash ${PG.BL}${PG.E !== 0.15 || PG.K !== 16 ? '  (stiff default is E 0.15 / K 16)' : ''}`);
console.log(`  correction cap: ${UCAP} rad${UCAP !== 0.15 ? '  (default is 0.15)' : ''}`);
console.log(`  decision clock: ${DPT}/Ts${DPT !== 30 ? '  (default is 30)' : ''}`);
console.log(`  excitation: ${DWELL ? 'DWELLING — the noise is time-warped so the machine lingers'
  : 'the ordinary scribble, which never stops'}`);

// FORCE THE WINDOW, USING THE MACHINERY THAT ALREADY EXISTS. `freezeConfig` copies one pilot's
// chosen configuration onto another that has not fitted; overriding the lag count on the way is
// how "what if the window reached the settling time?" becomes a one-variable experiment rather
// than an argument. The tune picks 12 lags — the shortest of [12, 24, 40] — because rule 42 takes
// the cheapest inside a 5% band, and 12 x 13 x 9 = 1404 steps is HALF the arm's Tset of 2743.
// Rule 37 says a window must reach the period of what it has to see. On this plant the two rules
// disagree and the cheaper one is winning.
const WINDOW = +(process.env.WINDOW || 0);
const pilots = [];
for (let s = 1; s <= K; s++) {
  const t0 = Date.now();
  let p = await commission(s);
  if (WINDOW && p) {
    // Re-commission with the SAME choices except the window, so the comparison is one variable.
    const donor = p;
    p = await commission(s, (q) => {
      freezeConfig(donor, q);
      q._frozenConfig.forEach((c) => { c.mLag = WINDOW; c.fLag = WINDOW; });
    });
  }
  // THE REASON, NOT ONLY THE VERDICT. A refusal printed as the bare word "REFUSED" tells you the
  // machine declined and nothing about why, and the whole table below then reads 1.00x with no
  // explanation anywhere in it — which is exactly what the first diamond run produced.
  // DID THE PROBE FIND A MODE, AND DID THE EXCITATION SWEEP FOR IT? The sweep is GATED on the
  // probe ringing — a plant with no oscillation gets no frequency sweep, and a quarter of the
  // rate budget is not spent on one. If a softer arm rings where the stiff one does not, then the
  // excitation's content changes with stiffness, and any comparison across stiffness is comparing
  // two different experiments as well as two different machines.
  if (p) {
    const st = p.status();
    // RULE 37, PUT TO THIS PLANT: "a lag window must REACH the period of what it has to see." A
    // model that is to schedule stored energy must be able to REPRESENT it, and a lag-window map
    // can only carry what its window spans. If the window is shorter than the arm's own settling
    // time, the flex's state is outside the model and no optimiser can plan against it — which
    // would be a one-number explanation, plant-agnostic, for why anticipation is present and
    // ineffective.
    const ro = st.report.readouts || [];
    for (let c = 0; c < ro.length; c++) {
      const reach = (ro[c].lags || 0) * ro[c].stride * st.sample;
      console.log(`      ch${c} window ${ro[c].lags} lags x stride ${ro[c].stride} x sample `
        + `${st.sample} = ${reach} steps  vs Tset ${st.Tset}  → `
        + `${reach >= st.Tset ? 'REACHES the settling time'
          : `${(st.Tset / Math.max(1, reach)).toFixed(1)}x SHORT of it`}`);
    }
    // THE BASIS THE FIT CHOSE, AND WHY IT COULD CHOOSE IT. The open question is whether this
    // controller is blind to STATE — whether "many dynamical states can produce one tool
    // position" makes the map it fits ill-posed. The row already carries encoder speed and
    // TORQUE at every lag, and torque through a gearbox spring is the stored energy, so the
    // state is nominally there; the quadratic block is where tau^2, tau*omega and omega^2 —
    // energy and power — would enter, and it is OFFERED on held-out data every time.
    //
    // `levRatio` is what separates the two explanations when a lead fits badly. Above 1 the far
    // lead's held-out rows sit further outside the training data than the near lead's, so the fit
    // is EXTRAPOLATING and the excitation is the constraint. Near 1 with a bad r2Far, the rows
    // are covered and the DICTIONARY cannot span the target — which is when more state would
    // help. Same symptom, opposite fixes.
    for (let c = 0; c < ro.length; c++) {
      console.log(`      ch${c} basis ${String(ro[c].basis).padEnd(17)}`
        + ` R2 lin ${(+ro[c].r2Lin).toFixed(4)}`
        + `  quad ${ro[c].r2Poly === null || ro[c].r2Poly === undefined ? '  n/a  ' : (+ro[c].r2Poly).toFixed(4)}`
        + `  sched ${ro[c].r2Sched === null || ro[c].r2Sched === undefined ? '  n/a  ' : (+ro[c].r2Sched).toFixed(4)}`
        + `   lead0 ${(+ro[c].r2Lead0).toFixed(3)} mid ${(+ro[c].r2Mid).toFixed(3)}`
        + ` far ${(+ro[c].r2Far).toFixed(3)}`
        + `   lev ${ro[c].levRatio === null ? 'n/a' : (+ro[c].levRatio).toFixed(2)}`);
    }
    console.log(`      probe rings ${JSON.stringify(st.rings)}  Ts ${st.Ts}  Tset ${st.Tset}`
    + `  sweep ${(() => {
      // THE SHARE, NOT THE FIELD'S EXISTENCE. `meta.chirp` is an array of the sweep's share of the
      // rate budget, one entry per channel, and it is PUSHED UNCONDITIONALLY — `[0, 0]` when no
      // sweep was armed. An array of zeros is truthy, so the old `? 'YES' : 'no'` printed YES on
      // every run this project has ever logged, including the ones whose whole question was
      // whether the sweep was on (rule 25).
      const c = st.report.excite && st.report.excite.chirp;
      return Array.isArray(c) && c.some((v) => v > 0) ? `YES ${c.join('/')}` : 'no';
    })()}`);
  }
  console.log(`  commissioned draw ${s} in ${((Date.now() - t0) / 1000).toFixed(0)}s`
    + `${p ? ` — ${p.verdict && p.verdict.deploy ? 'deploy' : 'REFUSED'}` : ''}`);
  if (p && p.verdict && !p.verdict.deploy) {
    console.log(`      why: ${p.verdict.why}`);

  }
  if (p) pilots.push(p);
}
if (!pilots.length) { console.log('  nothing commissioned'); process.exit(1); }

/** One row of the matrix: contour error with the correction off and on. */
async function row(pilot, shape, feed) {
  const offR = await deployOn(pilot, shape, false, feed);
  const off = offR.r;
  const onR = await deployOn(pilot, shape, true, feed);
  const on = onR.r;
  // THE PEAK CORRECTION, AGAINST THE CAP IT IS ALLOWED. Two accounts of the sharp square have
  // failed — more model coverage and a faster decision clock — and there is a simpler one nobody
  // has looked at: the correction may be CLIPPED. `uMax` is 0.15 rad here and the rounded
  // rectangle already peaks at 0.125, so a program that demands more at its corners would be
  // saturating, and no improvement to the model or the horizon can help a controller that is
  // already asking for more authority than it is given.
  return { off: off.contourRms, on: on.contourRms, x: off.contourRms / on.contourRms,
    lagOff: off.lagRms, lagOn: on.lagRms, uPk: onR.uPk, sp: onR.split, spOff: offR.split, prof: onR.prof, profOff: offR.prof, reach: onR.reach, sideSteps: onR.sideSteps };
}

const subject = pilots.length > 1 ? (ensemble(pilots).pilot || pilots[0]) : pilots[0];
// COMMIT m MOVES INSTEAD OF ONE, SET AFTER COMMISSIONING SO IT IS ONE VARIABLE. The same
// weights, the same gate, the same machine — only how much of the plan is executed before the
// QP re-decides. The user's account of the sharp square is that the arm can only make a corner
// by loading and releasing its own flex on a schedule, and that it "cannot do it reactively";
// a receding horizon that applies one move and re-solves is reactive BY CONSTRUCTION, so this
// is that account's first testable consequence. Committing during the VERIFY as well would
// change the gate too, which is a second variable and a separate run.
const COMMIT = +(process.env.COMMIT || 1);
if (COMMIT > 1) {
  subject.commitM = COMMIT;
  console.log(`  committing ${COMMIT} moves per solve (default 1 — a pure receding horizon)`);
}

// ─── THE CORNER BANK AND ITS ROUTER — ROUTER=<shape> fits a second weight bank on the
// corner-tagged rows of an open-loop run of that shape and arms the pilot's per-lead router.
//
// The offline chain that earns this: one linear map per regime scores each regime at its solo
// ceiling; one map over both costs the smooth regime 11x in residual variance; the quadratic and
// scheduled dictionaries make the joint record worse; and the routed pair reads the sharp
// square's elbow at 0.946 against the deployed model's -0.105 — with 0.947 on a DIAMOND the
// corner map never fitted, which is what says it is a move-profile model and not a memory.
// ROUTER=diamond deployed on the square is therefore the honest machine test: geometry never
// fitted, corners shared, routing by command state alone.
const ROUTER = process.env.ROUTER || null;
if (ROUTER && subject.verdict && subject.verdict.deploy) {
  const t0r = Date.now();
  // TWO SOURCES FOR THE CORNER BANK'S ROWS. `ROUTER=probe` is the plant-agnostic one: a
  // severity ladder of velocity reversals built from the machine's OWN limits — no program is
  // supplied or consulted, which is the owner's requirement stated back as code. `ROUTER=<shape>`
  // fits on that shape's open-loop record instead, as the ceiling the probe is measured against.
  const recs = [];
  if (ROUTER === 'probe') {
    // Three records of 45k steps: the first pass used two of 30k and its 24-31 events were a
    // third of what one lap of the square shows the self-fit (90 corners) — the gap to the
    // self-fitted ceiling (3.26x against 2.08x) has row count as its cheapest explanation.
    for (const seed of [71, 72, 73]) {
      const r = await recordCornerProbe(subject, { seed, steps: 45000, train: TRAIN });
      recs.push(r);
      console.log(`  probe seed ${seed}: drive-sized to alpha ${r.sizing.alphaMult}x declared`
        + ` aMax at v ${r.sizing.vTop.toExponential(2)} (calibration peak `
        + `${(100 * r.sizing.peak).toFixed(0)}%, clip ${(100 * (r.sizing.clipFrac || 0)).toFixed(1)}%),`
        + ` ${r.events[0]} events, run sat `
        + r.sat.map((st) => `${(100 * st.fraction).toFixed(2)}% (peak ${(100 * st.peak).toFixed(0)}%)`).join(' / '));
    }
  } else {
    for (const f of [0.004, 0.008]) recs.push(await recordOpenLoop(subject, ROUTER, f));
  }
  // THE REGIME SCALE, from the fit record itself (rule 32): full corner engagement at half the
  // record's own peak command-acceleration spike. The blend below is CONTINUOUS — the binary
  // router this replaces mis-filed the rounded rectangle, whose corners are two orders of
  // magnitude milder than the square's and belong partway between the banks, not in either.
  let peak = 0;
  for (const r of recs) {
    for (let k = 1; k < r.cmd.length - 1; k++) {
      for (let c = 0; c < r.cmd[0].length; c++) {
        const a = Math.abs(r.cmd[k + 1][c] - 2 * r.cmd[k][c] + r.cmd[k - 1][c]);
        if (a > peak) peak = a;
      }
    }
  }
  // AFULLK is exposed because the regime scale is derived from the fit record's own peak, and
  // changing the EVENT SHAPE moves that peak: turn-through events spike at 2x the rest-only
  // tour's (a through-zero reversal is Δv = 2v), which silently halved every program's blend
  // engagement and made two shapes incomparable in one move (rule 24's cousin: a physics
  // number moved when a probe-design control moved).
  const aFull = +(process.env.AFULLK || 0.5) * peak, reachK = 1.7;
  let fitted = 0, kept = 0;
  for (let c = 0; c < 2; c++) {
    const ro = subject.readouts[c];
    const reach = Math.ceil(reachK * (ro.mLag - 1) * ro.stride);
    // ONE λ DEFINITION, FIT AND RUNTIME: Pilot.regimeLambdas is the same decaying peak-hold
    // _routerLambdas runs over the look-ahead at every decision step. The rows are weighted by
    // √λ (weighted least squares), so a mild corner teaches the bank in proportion to how much
    // of the bank will answer for it.
    const lams = recs.map((r) => Pilot.regimeLambdas(r.cmd, aFull, reach));
    const wB = [];
    for (let li = 0; li < subject.N; li++) {
      const L = ro.leads[Math.min(li, ro.leads.length - 1)];
      const back = Math.max((ro.mLag - 1) * ro.stride, (ro.fLag - 1) * ro.stride - L);
      const X = [], y = [];
      for (let ri = 0; ri < recs.length; ri++) {
        const rec = recs[ri], lam = lams[ri];
        const saved = subject._rec;
        subject._rec = { x: rec.x, cmd: rec.cmd, u: [], e: rec.e };
        try {
          for (let k = Math.max(back, rec.lap); k < rec.e.length - L - 1; k++) {
            const l2 = lam[Math.min(k + L, lam.length - 1)];
            if (l2 < 0.02) continue;
            // WEIGHT λ³, NOT λ. The runtime blend hands the corner bank full authority at
            // λ = 1, so the bank should BE the full-severity map — a λ-weighted fit lets the
            // probe's many mild rows tilt it toward dynamics the blend already covers from
            // the A side. Cubing concentrates the fit where the bank actually answers.
            const sw = Math.pow(l2, 1.5);
            const row = subject._row(c, k, L, ro.stride, ro.poly, ro.mLag, ro.fLag, ro.sched);
            for (let q2 = 0; q2 < row.length; q2++) row[q2] *= sw;
            X.push(row); y.push(rec.e[k + L][c] * sw);
          }
        } finally { subject._rec = saved; }
      }
      if (X.length > 4 * ro.w[0].length) { wB.push(solveRidge(X, y, ro.ridge)); fitted++; }
      else { wB.push(ro.w[Math.min(li, ro.w.length - 1)]); kept++; }
    }
    ro.wB = wB;
  }
  subject.router = { aFull, reachK };
  console.log(`  corner bank: source ${ROUTER}, aFull ${aFull.toExponential(2)}`
    + ` (${+(process.env.AFULLK || 0.5)}x peak),`
    + ` reach ${reachK}x window, CONTINUOUS blend — ${fitted} leads fitted, ${kept} kept`
    + ` scribble (${((Date.now() - t0r) / 1000).toFixed(0)}s)`);
}
if (pilots.length > 1) console.log(`  (averaged ${ensemble(pilots).used} of ${pilots.length} draws)`);

console.log(`\n  ${'program'.padEnd(18)} ${'contour off'.padStart(12)} ${'on'.padStart(11)}`
  + ` ${'x'.padStart(7)}   ${'lag off'.padStart(9)} ${'lag on'.padStart(9)}  ${'u peak'.padStart(7)}`
  + `  of ${UCAP}`);
// THE TRAINING PROGRAM FIRST, as the reference every held-out row is read against.
const seen = await row(subject, TRAIN.shape, TRAIN.feed);
console.log(`  ${`${TRAIN.shape} @${TRAIN.feed} (SEEN)`.padEnd(18)} ${seen.off.toExponential(3).padStart(12)}`
  + ` ${seen.on.toExponential(3).padStart(11)} ${seen.x.toFixed(2).padStart(6)}x   `
  + `${seen.lagOff.toExponential(2).padStart(9)} ${seen.lagOn.toExponential(2).padStart(9)}`
  + `  ${seen.uPk.toFixed(4).padStart(7)}${seen.uPk > 0.98 * UCAP ? '  AT THE CAP' : ''}`);
// AND THE SPATIAL SPLIT, PRINTED SEPARATELY because it answers a different question from the
// table above: not how much the correction removes, but WHERE what is left of it sits.
const spatial = [];
const held = [];
for (const shape of SHAPES) {
  for (const feed of FEEDS) {
    const r = await row(subject, shape, feed);
    held.push({ shape, feed, ...r });
    spatial.push({ name: `${shape} @${feed}`, ...r });
    console.log(`  ${`${shape} @${feed}`.padEnd(18)} ${r.off.toExponential(3).padStart(12)}`
      + ` ${r.on.toExponential(3).padStart(11)} ${r.x.toFixed(2).padStart(6)}x   `
      + `${r.lagOff.toExponential(2).padStart(9)} ${r.lagOn.toExponential(2).padStart(9)}`
      + `  ${r.uPk.toFixed(4).padStart(7)}${r.uPk > 0.98 * UCAP ? '  AT THE CAP' : ''}`);
  }
}

console.log(`\n  ${'program'.padEnd(18)} ${'corner C'.padStart(10)} ${'corner L'.padStart(10)}`
  + ` ${'straight C'.padStart(11)} ${'straight L'.padStart(11)}  ${'steps'.padStart(11)}`);
for (const r of [{ name: `${TRAIN.shape} @${TRAIN.feed}`, ...seen }].concat(spatial)) {
  if (!r.sp) continue;
  console.log(`  ${r.name.padEnd(18)} ${r.sp.cornerC.toExponential(3).padStart(10)}`
    + ` ${r.sp.cornerL.toExponential(3).padStart(10)} ${r.sp.straightC.toExponential(3).padStart(11)}`
    + ` ${r.sp.straightL.toExponential(3).padStart(11)}  ${`${r.sp.cornerN}/${r.sp.straightN}`.padStart(11)}`);
}

// THE PROFILE ALONG A SIDE — the shape settles it: a monotone decay from the corner is
// overshoot-and-recover, a U is acceleration ramps.
for (const r of spatial) {
  if (!r.prof) continue;
  console.log(`\n  ${r.name} — contour along a side, corner at 0% to corner at 100%:`);
  console.log(`    off  ${r.profOff.map((b) => b.c.toExponential(1)).join(' ')}`);
  console.log(`    on   ${r.prof.map((b) => b.c.toExponential(1)).join(' ')}`);
  const on = r.prof.map((b) => b.c);
  const firstHalf = on.slice(0, 5).reduce((a, v) => a + v, 0) / 5;
  const lastHalf = on.slice(5).reduce((a, v) => a + v, 0) / 5;
  const mid = (on[4] + on[5]) / 2, ends = (on[0] + on[9]) / 2;
  console.log(`    first half ${firstHalf.toExponential(2)} vs last half ${lastHalf.toExponential(2)}`
    + `  ·  ends ${ends.toExponential(2)} vs middle ${mid.toExponential(2)}`);
  // THE CORRECTION'S OWN PHASE, which is the question of whether it SCHEDULES or REACTS.
  console.log(`    |u|  ${r.prof.map((b) => b.u.toExponential(1)).join(' ')}`);
  const us = r.prof.map((b) => b.u);
  const uPeak = us.indexOf(Math.max(...us));
  console.log(`    |u| peaks in bucket ${uPeak} of 0..9  →  `
    + `${uPeak <= 1 || uPeak >= 8 ? 'AT the corner — reacting to it, or acting on the one behind'
      : 'mid-side — neither at the corner nor before the next'}`);
  console.log(`    horizon reaches ${r.reach} steps; a side lasts ${r.sideSteps} steps  →  `
    + `${r.reach >= r.sideSteps ? 'the next corner IS inside the preview'
      : `the next corner is ${(r.sideSteps / r.reach).toFixed(1)}x BEYOND the preview`}`);
  console.log(`    → ${ends > 1.3 * mid ? 'U-SHAPED: acceleration ramps'
    : (firstHalf > 1.3 * lastHalf ? 'DECAYING from the corner: overshoot-and-recover'
      : 'FLAT: neither account')}`);
}

// TARGET 1 AND TARGET 2 READ SEPARATELY, because they are separate claims and a single
// "it transferred" would hide which one failed.
const worst = held.reduce((a, r) => (r.x < a.x ? r : a));
console.log(`\n  PROGRAM-AGNOSTIC: worst held-out row is ${worst.shape} @${worst.feed} at `
  + `${worst.x.toFixed(2)}x against ${seen.x.toFixed(2)}x on the program it trained on`
  + ` — ${(seen.x / worst.x).toFixed(2)}x of degradation, target is 1.3x`);
for (const shape of SHAPES) {
  const rs = held.filter((r) => r.shape === shape);
  if (rs.length < 2) continue;
  const lo = rs[0], hi = rs[rs.length - 1];
  console.log(`  FEEDRATE-AGNOSTIC on the ${shape}: ${lo.x.toFixed(2)}x at ${lo.feed} against `
    + `${hi.x.toFixed(2)}x at ${hi.feed} — ${(Math.max(lo.x, hi.x) / Math.min(lo.x, hi.x)).toFixed(2)}x`
    + ' across a 2x feed change, target is 1.5x');
}
// AND NONE OF THEM MAY BE WORSE THAN LEAVING THE MACHINE ALONE, which is the floor the whole
// refusal contract exists to hold and is a different question from how much it gains.
const harmed = held.filter((r) => r.x < 1);
console.log(harmed.length
  ? `  !! ${harmed.length} held-out program(s) made WORSE: `
    + harmed.map((r) => `${r.shape}@${r.feed} ${r.x.toFixed(2)}x`).join(', ')
  : '  and no held-out program was made worse than leaving the machine alone');
