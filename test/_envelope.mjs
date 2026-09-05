/**
 * @file IS THIS CELL OUTSIDE ITS OWN COMMISSIONING ENVELOPE? — rule 41b, measured.
 *
 * On the soft/fast cell (K 0.25 / E 0.005, sharp square at feed 1.6e-2) four candidate limits
 * have each been closed by measurement: the horizon spans 7.4 edges; longer lag windows were
 * offered and lost monotonically; a 3x correction cap makes the machine 1.8x WORSE; and the
 * elbow's weak forecast is worth 10% at the margin, with the shoulder doing 2.21x of the 2.42x.
 *
 * What survives is a configuration that should not struggle: the shoulder forecasts at 0.992,
 * its correction sits AT the cap in every configuration, and 4.665 of contour still becomes
 * 1.931. A near-perfect forecast that saturates and still leaves 40% of the error is a
 * signature, not a shrug — the plan is right and the delivery is bounded.
 *
 * RULE 41b NAMES THE REMAINING SUSPECT: "an excitation built to the DECLARED limits describes a
 * machine the program does not run." The commissioning scribble is held to the engineer's
 * declared v/a/j; the program's corners can exceed them by orders of magnitude — this arm's
 * sharp square is on record at 61537% of declared jerk at the HOME feed, and this cell runs 4x
 * faster. If the program lives far outside what the excitation covered, the QP is inverting a
 * plant identified where the machine never goes, and no knob inside the loop fixes that.
 *
 * So this measures the PROGRAM's own peak velocity, acceleration and jerk against the DECLARED
 * limits, per channel, at the cell in question and at the home feed for contrast. It asserts
 * nothing: rule 41b also records that RAISING the declared numbers is inert (the box traverse
 * binds through velocity) and that shrinking the box makes every held-out program worse, so a
 * large number here is a diagnosis and not yet a fix.
 *
 * Run: ARM_K=0.25 ARM_E=0.005 SUITE=full node test/_envelope.mjs
 */
import { peakDiffs } from '../lib/pilot/excite.js';
import { mkPath, makeArm } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEEDS = (process.env.FEEDS || '4e-3,1.6e-2').split(',').map(Number);
// The rig's declared limits for the arm's channels, as commissionArm states them.
const LIM = { vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 };

const { arm } = await makeArm();
console.log(`\nthe program's own rates against the DECLARED limits — ${SHAPE}`);
console.log(`  declared  v ${LIM.vMax.toExponential(1)}  a ${LIM.aMax.toExponential(1)}`
  + `  j ${LIM.jMax.toExponential(1)}\n`);
for (const feed of FEEDS) {
  const path = mkPath(SHAPE, feed);
  const L = Math.round(path.lap);
  const q = [new Float64Array(L), new Float64Array(L)];
  for (let k = 0; k < L; k++) {
    const c = path.at(k);
    const ik = arm.ik(c.x, c.y, true);
    q[0][k] = ik[0]; q[1][k] = ik[1];
  }
  console.log(`  feed ${feed.toExponential(1)}  lap ${L}`);
  for (let c = 0; c < 2; c++) {
    const pk = peakDiffs(q[c]);
    const pct = (x, lim) => `${(100 * x / lim).toFixed(0)}%`;
    console.log(`    ch${c} ${c ? '(elbow)   ' : '(shoulder)'} `
      + `v ${pk.v.toExponential(2)} ${pct(pk.v, LIM.vMax).padStart(7)}   `
      + `a ${pk.a.toExponential(2)} ${pct(pk.a, LIM.aMax).padStart(8)}   `
      + `j ${pk.j.toExponential(2)} ${pct(pk.j, LIM.jMax).padStart(9)}`);
  }
}
console.log(`\n  the excitation is built to the DECLARED numbers, so a program far above them is`);
console.log(`  running where the plant was never identified (rule 41b). Raising the declared`);
console.log(`  numbers is on record as INERT — the box traverse binds through velocity — so a`);
console.log(`  large number here is a diagnosis, not a knob.\n`);
