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
import { Pilot } from '../../lib/pilot/pilot.js';
import { ensemble } from '../../lib/pilot/ensemble.js';
import { PG, makeArm, mkPath, homeArm, routeSignals, deployOn } from './rigs/arm-rig.mjs';

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

async function commission(seed) {
  const { arm, servo } = await makeArm();
  const startPath = mkPath(TRAIN.shape, TRAIN.feed);
  homeArm(arm, servo, startPath);
  const centre = arm.ik(12, 0, true);
  const pilot = new Pilot({
    autoRefuse: true, nMeasured: 6,
    channels: [0, 1].map((j) => ({ lo: centre[j] - 0.55, hi: centre[j] + 0.55,
      vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
    uMax: UCAP,
    start: arm.ik(startPath.at(0).x, startPath.at(0).y, true),
    guards: [{ index: 4, max: 6 }, { index: 5, max: 6 }],
    workspace: (q) => {
      const r = Math.hypot(arm.L1 * Math.cos(q[0]) + arm.L2 * Math.cos(q[0] + q[1]),
        arm.L1 * Math.sin(q[0]) + arm.L2 * Math.sin(q[0] + q[1]));
      return r > Math.abs(arm.L1 - arm.L2) + 0.5 && r < arm.L1 + arm.L2 - 0.5;
    },
    seed,
    // A DWELLING EXCITATION, WHICH PUTS STOPS INTO THE NOISE RATHER THAN STRUCTURE AFTER IT.
    //
    // This is the surviving half of the diamond experiment. What the model is missing on a sharp
    // corner is a STOP — the corner rule takes junction velocity to nearly zero four times a lap
    // and each reversal unloads the gearbox wind-up through the backlash — and the excitation is
    // filtered noise that never stops. `dwell` time-warps that noise so it lingers, keeping the
    // record RICH where appending a diamond made 19% of it collinear and took the gate below one.
    //
    // WORTH KNOWING BEFORE READING THE RESULT: the warp has a 2% RATE FLOOR, and its own comment
    // calls it "a dwell, not a stop". If a true zero-velocity reversal is what the model needs,
    // this flag cannot supply it and the right reading of a null result is "the floor is too
    // high", not "stops do not help".
    dwell: DWELL,
    // THE DECISION CLOCK, WHICH IS THE HORIZON HALF OF THE QUESTION.
    //
    // Two attempts to fix the sharp square by giving the MODEL more coverage have failed, and the
    // lag column says the residual is timing rather than shape: the correction removes 1.55x of
    // contour and 1.20x of lag. `decisionsPerTs` is how often the QP re-solves within a settling
    // time — a pure timing knob that changes nothing about what the model knows.
    //
    // CLAUDE.md already records it moving exactly this case: 30 → 60 is worth 4.62 → 5.19x sharp,
    // 6.43 → 8.02x rounded, 12.99 → 14.16x circle, and ONLY with the effort weight scaled as
    // (DPT/30)^2 because the QP differences DECISION steps. If the sharp square improves here, its
    // residual is a horizon failure; if it does not while the smooth programs do, it is not.
    decisionsPerTs: DPT,
    // THE DIAMOND-IN-EXCITATION EXPERIMENT RAN AND IS REMOVED WITH ITS HOOK. Appending a diamond
    // at both feeds to the end of the scribble — the same corner profile on a path nothing is
    // scored on — took all three verify regimes below one (scribble 0.23x, program 0.40x,
    // representative 0.88x) and the gate refused. 9,281 structured rows on a 47,837-row record is
    // 19% collinear data, and this project already measured that mechanism from the other side:
    // identifying on a program instead of a scribble takes EMPS from 12.70x to 3.93x. The idea is
    // sound and the implementation was not; `dwell` is the one to try, because it puts stops INTO
    // the noise instead of appending structure to it.
    // THE REPRESENTATIVE PROGRAM IS THE ONE IT TRAINS ON, which is the honest setup: an engineer
    // hands the gate the program they have. Every row below is a program that gate never saw.
    verifyRef: (i) => {
      const c = startPath.at(i % Math.max(1, Math.round(startPath.lap)));
      return arm.ik(c.x, c.y, true);
    },
  });
  let n = 0;
  while (pilot.phase !== 'done') {
    if (++n > 6e6) { console.log(`  draw ${seed}: ABANDONED in '${pilot.phase}'`); return null; }
    if (pilot.phase === 'fit') { pilot.work(); continue; }
    const cmd = pilot.command();
    const refs = cmd.map((c) => ({ theta: c.pos + c.u, omega: c.vel, alpha: c.acc }));
    const tau = servo.torques(refs);
    arm.step(tau[0], tau[1], 1);
    const r = routeSignals(arm, cmd, tau);
    pilot.observe(r.measured, r.truth);
  }
  await arm.l1.destroy(); await arm.l2.destroy();
  return pilot;
}

console.log('\npilot: one commissioning, four programs it has never run');
console.log(`  trained on ${TRAIN.shape} at feed ${TRAIN.feed}; every row below is held out.`);
console.log(`  arm: E ${PG.E} / K ${PG.K} / backlash ${PG.BL}${PG.E !== 0.15 || PG.K !== 16 ? '  (stiff default is E 0.15 / K 16)' : ''}`);
console.log(`  correction cap: ${UCAP} rad${UCAP !== 0.15 ? '  (default is 0.15)' : ''}`);
console.log(`  decision clock: ${DPT}/Ts${DPT !== 30 ? '  (default is 30)' : ''}`);
console.log(`  excitation: ${DWELL ? 'DWELLING — the noise is time-warped so the machine lingers'
  : 'the ordinary scribble, which never stops'}`);

const pilots = [];
for (let s = 1; s <= K; s++) {
  const t0 = Date.now();
  const p = await commission(s);
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
    console.log(`      probe rings ${JSON.stringify(st.rings)}  Ts ${st.Ts}  Tset ${st.Tset}`
      + `  sweep ${st.report.excite && st.report.excite.chirp ? 'YES' : 'no'}`);
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
    lagOff: off.lagRms, lagOn: on.lagRms, uPk: onR.uPk, sp: onR.split, spOff: offR.split };
}

const subject = pilots.length > 1 ? (ensemble(pilots).pilot || pilots[0]) : pilots[0];
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
