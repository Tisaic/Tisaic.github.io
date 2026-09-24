// The arm's ringing period, measured: a small setpoint step on one joint at three poses, the tool's
// error in joint coordinates, the period from successive zero crossings of its oscillation.
import { buildArm, calibrateComp, ikOf, conventional, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
const m = await buildArm(); const ik = ikOf(m.arm.L1, m.arm.L2); const rc = await calibrateComp(m);
for (const pose of [[-0.8, 2.0], [-0.4, 1.6], [-1.1, 2.4]]) for (const j of [0, 1]) {
  await driveTo(m.arm, m.servo, pose, BENCH.feed);
  const c = conventional(m, rc); c.reset(pose);
  for (let k = 0; k < 3000; k++) c.step(pose);
  const sp = [pose[0], pose[1]]; sp[j] += 2e-3;
  const tr = [];
  for (let k = 0; k < 6000; k++) { c.step(sp); const t = m.arm.toolXY(), q = ik(t[0], t[1]); tr.push(q[j] - sp[j]); }
  // detrend with a slow moving average, then zero crossings of the remainder
  const W = 150, osc = tr.map((v, i) => { let s = 0, n = 0; for (let t = Math.max(0, i - W); t <= Math.min(tr.length - 1, i + W); t++) { s += tr[t]; n++; } return v - s / n; });
  const z = []; for (let i = 200; i < 5000; i++) if (osc[i - 1] < 0 && osc[i] >= 0) z.push(i);
  const per = z.length > 2 ? (z[z.length - 1] - z[0]) / (z.length - 1) : NaN;
  const pk = Math.max(...tr.slice(0, 3000).map(Math.abs));
  console.log(`pose ${pose} joint ${j + 1}: ringing period ${per.toFixed(0)} scans (${z.length} crossings), peak |err| ${pk.toExponential(2)} on a 2e-3 step`);
}
