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
import { makeArmHost, programSignature } from '../../lib/flexisim/autohost.js';
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
  const S = host.auto.stack ? host.auto.stack.sample : 1;
  const u = host.auto.act({ v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k,
    look: (off) => R[(((k + off * S) % LAP) + LAP) % LAP], q: [c1, c2] });
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

// ---- AND ON THE SECOND LAP, WHERE THE COUNTER HAS PASSED THE FRACTIONAL PERIOD. The page
// counts steps continuously; every scored run restarts at the lap. `actAt` derives the
// look-ahead from the true period, but handed `act()` the CONTINUOUS step, which the lap
// table indexes `k % ceil(lap)` and the distilled rung's hold reads `k % stride` — so on
// the page the table slid 0.4 steps per lap and the decision phase walked. A fake table
// that returns its own index makes the slip a number.
{
  const T = path.lap;
  const saved = { hff: host.auto.hff, on: host.auto.deployed.hff, built: host.auto.built.hff, prog: host.auto._hffProgram };
  host.auto.built.hff = { lap: LAP, channels: 2, at(i) { const kk = ((i % LAP) + LAP) % LAP; return [kk * 1e-6, 0]; } };
  host.auto.hff = host.auto.built.hff; host.auto.deployed.hff = true; host.auto._hffProgram = programSignature(path, LAP);
  let worst = 0;
  for (const k of [LAP + 5, 3 * LAP + 1000, 40 * LAP + 7]) {
    const kr = Math.floor(((k % T) + T) % T);
    const cmd = path.at(k), [c1, c2] = R[kr];
    const refs = [{ theta: c1, omega: 0, alpha: 0 }, { theta: c2, omega: 0, alpha: 0 }];
    const ff = rc.feedforward([[1, 0], [0, 1]], m.servo.jointTorques(refs), { enableToolff: false });
    const got = host.actAt(k, cmd, refs)[0] - ff.dq[0];
    worst = Math.max(worst, Math.abs(got / 1e-6 - kr));
  }
  console.log(`  lap-table index on later laps: worst slip ${worst.toFixed(2)} steps`);
  check('on later laps the deploy path reads every rung at the IN-LAP step — no slip against the fractional period', worst < 1e-9, `${worst} steps`);
  host.auto.hff = saved.hff; host.auto.deployed.hff = saved.on; host.auto.built.hff = saved.built; host.auto._hffProgram = saved.prog;
}

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
  const S = armed.stack ? armed.stack.sample : 1;
  const u = armed.act({ v: [cmd.vx, cmd.vy], a: [cmd.ax, cmd.ay], k,
    look: (off) => R[(((k + off * S) % LAP) + LAP) % LAP], q: [c1, c2] });
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

// ---- THE ARM CAN NOW REACH THE DISTILLED RUNG, AND THE HOST'S HALF OF IT IS HERE.
//
// `AutoStack`'s ②d converges a lap-periodic correction on several training programs and
// regresses it onto the commanded reference; the host supplies the programs and the machine.
// Until now `makeArmHost` had no `distilRuns`, so the rung was reachable on the EMPS axis and
// on a synthetic substrate and NOT on this arm — the gap CLAUDE.md named as not started.
//
// A SMALL FAST PATH IS PASSED IN rather than letting the block design its diet: this asserts
// the CONTRACT, and running six designed polygons at the commissioning feed to do it would be
// minutes of machine to learn nothing the one path cannot say (rule 2).
{
  const before = host.samples().samples;
  const tiny = roundedRect({ w: 6, h: 6, r: 1.2, centre: [12, 0],
    feed: 4e-2, accel: 4e-5, cornerDt: 40 });
  const dHost = makeArmHost({
    makeMachine: async () => ({ arm: m.arm, l1: m.l1, l2: m.l2, servo: m.servo, rc }),
    path, lap: LAP, K: 1, centre: m.arm.ik(12, 0, true), distilPath: [tiny],
  });
  dHost.attach(m.arm, m.servo, rc);
  const runs = await dHost.distilRuns();
  const tr = runs && runs[0];
  check('the arm host supplies training runs for the distilled rung',
    !!tr && runs.length === 1 && tr.lap === Math.ceil(tiny.lap),
    JSON.stringify(runs && runs.map((r) => r.lap)));
  const r0 = await tr.run(null);
  // THE ERROR COMES BACK PER CHANNEL AT THE LAP'S OWN LENGTH, in JOINT space — the frame the
  // rung corrects in, and the same mapping `run()` uses for the lap-periodic rung. A record
  // returned in the wrong frame would still be finite and still be the right length.
  check('…and one open-loop pass returns a finite per-channel record at the lap length',
    r0.score > 0 && Number.isFinite(r0.score) && r0.err.length === 2
      && r0.err.every((e) => e.length === tr.lap && e.every(Number.isFinite)),
    `${r0.score}, ${r0.err.map((e) => e.length).join('/')}`);
  // BOTH HALVES: the reference must be the JOINT command (two channels here, so a plant-agnostic
  // block that quietly assumed a fixed dimension would be caught), and the speed must be the
  // commanded one the coverage guard fades against rather than a constant.
  //
  // ZERO AT THE LAP START IS THE PROFILE BEING RIGHT, NOT A MISSING READING. A closed toolpath
  // begins at rest and the look-ahead feedrate profile ramps into it, so `speedAt(0)` is
  // exactly 0 — this check first demanded every sample be positive and failed on the machine
  // telling the truth. What has teeth is that the speed VARIES and reaches a real cruise:
  // a constant would satisfy any weaker version and is what a wrong wiring would return.
  const rf = tr.refAt(10), sp = [0, 1, 2, 3].map((k) => tr.speedAt(k * 37));
  check('…addressed by the JOINT reference, with a commanded speed that actually varies',
    rf.length === 2 && rf.every(Number.isFinite)
      && sp.every((v) => Number.isFinite(v) && v >= 0)
      && Math.max(...sp) > 0 && Math.max(...sp) > Math.min(...sp),
    `${JSON.stringify(rf)}  speeds ${sp.map((v) => v.toExponential(2)).join(' ')}`);
  // COMMISSIONING COST IN THE UNIT AN OWNER PAYS. `samples()` counts machine steps at the four
  // places the host advances the machine, so a pass of W+A laps plus its settle has to show up
  // as at least that many. It is the half of target 4 a wall clock cannot see.
  const spent = dHost.samples().samples;
  check('…and the host counts the MACHINE SAMPLES it spent, which is what commissioning costs '
    + 'on a plant', spent >= (dHost.AVG + 2) * tr.lap,
    `${spent} samples over ${dHost.samples().runs} runs`);
  // The two hosts count independently: this one must not have moved the first host's meter.
  check('…on its own meter, not the other host’s',
    host.samples().samples === before, `${host.samples().samples} vs ${before}`);
}

await m.l1.destroy(); await m.l2.destroy();
console.log(failed ? `\ndeploy: ${failed} check(s) FAILED\n` : '\ndeploy: all checks passed\n');
process.exit(failed ? 1 : 0);
