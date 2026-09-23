import { buildArm, calibrateComp, benchPath, jointProgram, ikOf, conventional, BENCH } from '../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../lib/flexisim/approach.js';
import { ilcTables } from '../index.mjs';
const only = process.env.ONLY;
for (const t of ilcTables().filter((x) => !only || x.file.startsWith(only))) {
  const m = await buildArm(); const ik = ikOf(m.arm.L1, m.arm.L2);
  const prog = jointProgram(benchPath(t.shape, t.feed), ik), L = prog.lap;
  const rc = await calibrateComp(m); await driveTo(m.arm, m.servo, prog.at(0), BENCH.feed);
  const c = conventional(m, rc); c.reset(prog.at(0));
  const lap = (useU) => { m.servo.resetLimitStats(); for (let k = 0; k < L; k++) { const r = prog.at(k); c.step(useU ? [r[0] + t.U[2 * k], r[1] + t.U[2 * k + 1]] : r); } return m.servo.limitStats().map((s) => (100 * s.fraction).toFixed(1) + '% (peak ' + (s.peakDemand / s.tauMax).toFixed(2) + 'x the limit)'); };
  lap(false); const b = lap(false); lap(true); const u = lap(true);
  console.log(t.file.padEnd(16), 'bare: saturated', b.join(' / '), '  with table:', u.join(' / '));
  await m.l1.destroy(); await m.l2.destroy();
}
