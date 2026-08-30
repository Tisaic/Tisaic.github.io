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
import { snapshotArm, restoreArm } from '../../lib/flexisim/arm2r.js';
import { ContourScore, decompose } from '../../lib/flexisim/contour.js';
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

// ---- AND THE WHOLE LOOP, NOT JUST ONE SAMPLE OF IT ------------------------------------
//
// Matching `actAt` against the scored expression catches a missing TERM. It cannot catch a
// missing CALL, and that was the other half of the same defect: the host's scored loop calls
// `auto.observe()` on every step, and the page called it on none. The pilot cascade is a
// receding-horizon controller — `act()` computes from what `observe()` was given — so a
// deployed ladder with no observations steers from an empty ring. It produced a real,
// non-zero, entirely wrong correction, which is why every wiring check passed.
//
// So this drives the machine the way the PAGE drives it and requires the same contour the
// host's own `run()` produces. A loop that is missing a call cannot pass it.
const armed = host.auto;
armed.deployed.classic = false; armed.deployed.stack = 0; armed.deployed.hff = false;

const contourOf = async (drive) => {
  restoreArm(snap0, m);
  armed.beginRun();
  const sc = new ContourScore({ joints: 2 });
  for (let l = 0; l < 2; l++) {
    for (let k = 0; k < LAP; k++) {
      const cmd = path.at(k);
      const [c1, c2] = R[k];
      const r = m.arm.ikRates(c1, c2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
      const refs = [{ theta: c1, omega: r.dq[0], alpha: r.ddq[0] },
        { theta: c2, omega: r.dq[1], alpha: r.ddq[1] }];
      const tau = drive(k, cmd, refs, c1, c2);
      m.arm.step(tau[0], tau[1], 1);
      if (l === 1) {
        const d = decompose(path, m.arm.toolXY(), cmd);
        sc.step(d.contour, d.lag, tau, [m.arm.j1.wM, m.arm.j2.wM]);
      }
    }
  }
  return sc.report().contourRms;
};

const snap0 = snapshotArm(m);
// THE HOST'S OWN EXPRESSION, and the PAGE'S. Identical inputs, identical machine.
const asHost = await contourOf((k, cmd, refs, c1, c2) => {
  const ff = rc.feedforward([[1, 0], [0, 1]], m.servo.jointTorques(refs), { enableToolff: false });
  const u = armed.act({ v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k,
    look: (off) => R[(((k + off) % LAP) + LAP) % LAP], q: [c1, c2] });
  const tau = m.servo.torques([{ ...refs[0], theta: c1 + ff.dq[0] + u[0] },
    { ...refs[1], theta: c2 + ff.dq[1] + u[1] }]);
  const en = m.arm.encoders();
  armed.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
    tau[0] * 1e3, tau[1] * 1e3]);
  return tau;
});
const asPage = await contourOf((k, cmd, refs, c1, c2) => {
  const dq = host.actAt(k, cmd, refs);
  const tau = m.servo.torques([{ ...refs[0], theta: c1 + dq[0] },
    { ...refs[1], theta: c2 + dq[1] }]);
  const en = m.arm.encoders();
  armed.observe([en[0].angle, en[1].angle, en[0].speed * 1e3, en[1].speed * 1e3,
    tau[0] * 1e3, tau[1] * 1e3]);
  return tau;
});
console.log(`  contour — host loop ${asHost.toExponential(4)}, page loop ${asPage.toExponential(4)}`);
check('the page\u2019s deployment loop reproduces the host\u2019s scored loop',
  Math.abs(asPage / asHost - 1) < 1e-9, `${asHost.toExponential(6)} vs ${asPage.toExponential(6)}`);

await m.l1.destroy(); await m.l2.destroy();
console.log(failed ? `\ndeploy: ${failed} check(s) FAILED\n` : '\ndeploy: all checks passed\n');
process.exit(failed ? 1 : 0);
