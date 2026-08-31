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
const SHAPES = (process.env.SHAPES || 'circle,sharp').split(',');
const TRAIN = { shape: 'rounded', feed: 0.004 };      // what it commissions on, and only that

async function commission(seed) {
  const { arm, servo } = await makeArm();
  const startPath = mkPath(TRAIN.shape, TRAIN.feed);
  homeArm(arm, servo, startPath);
  const centre = arm.ik(12, 0, true);
  const pilot = new Pilot({
    autoRefuse: true, nMeasured: 6,
    channels: [0, 1].map((j) => ({ lo: centre[j] - 0.55, hi: centre[j] + 0.55,
      vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
    uMax: 0.15,
    start: arm.ik(startPath.at(0).x, startPath.at(0).y, true),
    guards: [{ index: 4, max: 6 }, { index: 5, max: 6 }],
    workspace: (q) => {
      const r = Math.hypot(arm.L1 * Math.cos(q[0]) + arm.L2 * Math.cos(q[0] + q[1]),
        arm.L1 * Math.sin(q[0]) + arm.L2 * Math.sin(q[0] + q[1]));
      return r > Math.abs(arm.L1 - arm.L2) + 0.5 && r < arm.L1 + arm.L2 - 0.5;
    },
    seed,
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

const pilots = [];
for (let s = 1; s <= K; s++) {
  const t0 = Date.now();
  const p = await commission(s);
  console.log(`  commissioned draw ${s} in ${((Date.now() - t0) / 1000).toFixed(0)}s`
    + `${p ? ` — ${p.verdict && p.verdict.deploy ? 'deploy' : 'REFUSED'}` : ''}`);
  if (p) pilots.push(p);
}
if (!pilots.length) { console.log('  nothing commissioned'); process.exit(1); }

/** One row of the matrix: contour error with the correction off and on. */
async function row(pilot, shape, feed) {
  const off = (await deployOn(pilot, shape, false, feed)).r;
  const on = (await deployOn(pilot, shape, true, feed)).r;
  return { off: off.contourRms, on: on.contourRms, x: off.contourRms / on.contourRms,
    lagOff: off.lagRms, lagOn: on.lagRms };
}

const subject = pilots.length > 1 ? (ensemble(pilots).pilot || pilots[0]) : pilots[0];
if (pilots.length > 1) console.log(`  (averaged ${ensemble(pilots).used} of ${pilots.length} draws)`);

console.log(`\n  ${'program'.padEnd(18)} ${'contour off'.padStart(12)} ${'on'.padStart(11)}`
  + ` ${'x'.padStart(7)}   ${'lag off'.padStart(9)} ${'lag on'.padStart(9)}`);
// THE TRAINING PROGRAM FIRST, as the reference every held-out row is read against.
const seen = await row(subject, TRAIN.shape, TRAIN.feed);
console.log(`  ${`${TRAIN.shape} @${TRAIN.feed} (SEEN)`.padEnd(18)} ${seen.off.toExponential(3).padStart(12)}`
  + ` ${seen.on.toExponential(3).padStart(11)} ${seen.x.toFixed(2).padStart(6)}x   `
  + `${seen.lagOff.toExponential(2).padStart(9)} ${seen.lagOn.toExponential(2).padStart(9)}`);
const held = [];
for (const shape of SHAPES) {
  for (const feed of FEEDS) {
    const r = await row(subject, shape, feed);
    held.push({ shape, feed, ...r });
    console.log(`  ${`${shape} @${feed}`.padEnd(18)} ${r.off.toExponential(3).padStart(12)}`
      + ` ${r.on.toExponential(3).padStart(11)} ${r.x.toFixed(2).padStart(6)}x   `
      + `${r.lagOff.toExponential(2).padStart(9)} ${r.lagOn.toExponential(2).padStart(9)}`);
  }
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
