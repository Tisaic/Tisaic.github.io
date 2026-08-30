/**
 * @file WHAT THE LADDER DEPLOYS MUST BE WHAT THE LADDER SCORED.
 *
 * `AutoStack` measures a machine driven as `theta = c + ff.dq + u`, where `ff` is the
 * RobotComp compliance identified on the plant and `u` is the ladder's own correction. The
 * ladder therefore models the error that REMAINS after that feedforward, and `u` alone is
 * not a controller for anything — it is one term of one.
 *
 * The page deployed `u` alone. The rung table reported 1.7316e-2 (23.8x over the open loop)
 * and the machine on screen delivered 3.5e-1 to 7.7e-1 against an open loop of 4.1e-1 —
 * WORSE THAN DOING NOTHING, from a correction whose own measurement was real.
 *
 * EVERY WIRING CHECK PASSED THROUGHOUT, because they asked whether selecting ⑨ changes the
 * applied correction and it does. That is mode ⑧'s defect exactly: an amputated half still
 * changes the output. The only question with teeth is rule 6's — where two views show one
 * quantity, assert they AGREE. So this drives the host's own scored path and its deploy path
 * over the same samples of the same machine and requires the correction to match to the last
 * bit, which no partial deployment can satisfy.
 */
import { machine, settle, commissionComp } from '../flexisim/_rig.mjs';
import { makeArmHost } from '../../lib/flexisim/autohost.js';
import { roundedRect } from '../../lib/flexisim/toolpath.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  → ${detail}`}`);
  if (!ok) failed++;
};

console.log('\npilot: the deployed correction IS the scored correction');

// The program the arm's ladder is measured on, read off `autostack.test.mjs`.
const path = roundedRect({ w: 8, h: 8, r: 1.5, centre: [12, 0],
  feed: 4e-3, accel: 4e-5, cornerDt: 40 });
const LAP = Math.ceil(path.lap);

const m = await machine({ K: 1, E: 0.06 });
const rc = commissionComp(m.arm, m.servo);
const c0 = path.at(0);
const [q1, q2] = m.arm.ik(c0.x, c0.y, true);
settle(m.arm, m.servo, q1, q2);

const host = makeArmHost({
  makeMachine: async () => ({ arm: m.arm, l1: m.l1, l2: m.l2, servo: m.servo, rc }),
  path, lap: LAP, K: 1, centre: m.arm.ik(12, 0, true),
});
host.attach(m.arm, m.servo, rc);

// THE HOST'S OWN SCORED EXPRESSION, written out here exactly as `run()` drives it. Two
// copies of a formula is normally the defect; here it is the instrument — an independent
// route to the same quantity is the only thing that can catch the two disagreeing (rule 15).
const R = host.refsFor(m.arm);
const scored = (k) => {
  const cmd = path.at(k);
  const [c1, c2] = R[k];
  const r = m.arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
  const base = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
    { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
  const ff = rc.feedforward([[1, 0], [0, 1]], m.servo.jointTorques(base),
    { enableToolff: false });
  const u = host.auto.act({ v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k,
    look: (off) => R[(((k + off) % LAP) + LAP) % LAP], q: [c1, c2] });
  return [ff.dq[0] + u[0], ff.dq[1] + u[1]];
};

let maxGap = 0, ffMag = 0;
for (const k of [0, 137, 900, 2500, 4001, 6200]) {
  const cmd = path.at(k);
  const [c1, c2] = R[k];
  const r = m.arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
  const refs = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
    { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
  const a = scored(k), b = host.actAt(k, cmd, refs);
  maxGap = Math.max(maxGap, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  const ff = rc.feedforward([[1, 0], [0, 1]], m.servo.jointTorques(refs),
    { enableToolff: false });
  ffMag = Math.max(ffMag, Math.abs(ff.dq[0]), Math.abs(ff.dq[1]));
}
console.log(`  worst disagreement ${maxGap.toExponential(2)}; the baseline term alone is `
  + `${ffMag.toExponential(2)} rad`);
check('the deploy path returns exactly what the scored path applies', maxGap < 1e-12,
  `${maxGap.toExponential(3)}`);
// AND THE CHECK HAS TEETH: the term that was missing is large, so a deployment without it
// could not have slipped under any tolerance this check would plausibly use.
check('…and the check has teeth — the baseline term it must include is not negligible',
  ffMag > 1e-4, `${ffMag.toExponential(3)} rad`);

// AND A HOST WITHOUT A BASELINE REFUSES rather than handing back half a correction — the
// silent-degradation path is how the original defect would have survived this very check.
const bare = makeArmHost({ makeMachine: async () => ({ arm: m.arm, l1: m.l1, l2: m.l2,
  servo: m.servo, rc }), path, lap: LAP, K: 1, centre: m.arm.ik(12, 0, true) });
bare.attach(m.arm);                                  // no servo, no rc
let threw = false;
try {
  const cmd = path.at(0), [c1, c2] = R[0];
  bare.actAt(0, cmd, [{ theta: c1, omega: 0, alpha: 0 }, { theta: c2, omega: 0, alpha: 0 }]);
} catch { threw = true; }
check('…and a host with no baseline REFUSES rather than deploying half a correction', threw,
  'it returned a partial correction, which is the original defect');

await m.l1.destroy(); await m.l2.destroy();
console.log(failed ? `\ndeploy: ${failed} check(s) FAILED\n` : '\ndeploy: all checks passed\n');
process.exit(failed ? 1 : 0);
