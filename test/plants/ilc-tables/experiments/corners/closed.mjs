import { buildArm, calibrateComp, ikOf, jointProgram, conventional, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
import { decompose } from '../../../../../lib/flexisim/contour.js';
import { sharpRect, roundedRect, circle } from '../../../../../lib/flexisim/toolpath.js';
const ACC = +(process.env.ACC || 8e-6), JERK = +(process.env.JERK || 100), FEED = +(process.env.FEED || 3e-3);
const o = { feed: FEED, centre: BENCH.centre };
const variants = [
  ['old sharp', sharpRect({ ...o, w: 8, h: 8, accel: BENCH.ACCEL, cornerDt: BENCH.CORNER })],
  ['new sharp', sharpRect({ ...o, w: 8, h: 8, accel: ACC, cornerStop: true, dwell: JERK })],
  ['new rounded', roundedRect({ ...o, w: 8, h: 8, r: 1.5, closed: true, accel: ACC, cornerStop: true, dwell: JERK })],
  ['new circle', circle({ ...o, r: 4, accel: ACC, cornerStop: true, dwell: JERK })],
];
for (const [name, path] of variants) {
  const m = await buildArm(); const ik = ikOf(m.arm.L1, m.arm.L2); const rc = await calibrateComp(m);
  const prog = jointProgram(path, ik, name.startsWith('new') ? { smooth: JERK } : {}), L = prog.lap;
  await driveTo(m.arm, m.servo, prog.at(0), BENCH.feed);
  const c = conventional(m, rc); c.reset(prog.at(0));
  for (let k = 0; k < L; k++) c.step(prog.at(k));
  m.servo.resetLimitStats(); let ss = 0, n = 0, pk = 0;
  for (let k = 0; k < L; k++) { c.step(prog.at(k)); const d = decompose(prog.path, m.arm.toolXY(), prog.cmd(k)); const e2 = d.contour ** 2 + d.lag ** 2; ss += e2; n++; pk = Math.max(pk, Math.sqrt(e2)); }
  const st = m.servo.limitStats();
  console.log(`${name.padEnd(12)} lap ${String(L).padStart(6)}  tool rms ${Math.sqrt(ss / n).toExponential(3)}  peak ${pk.toExponential(3)}  saturated ${st.map((s) => (100 * s.fraction).toFixed(2) + '%').join('/')}  peak demand ${st.map((s) => (s.peakDemand / s.tauMax).toFixed(2) + 'x').join('/')}`);
  await m.l1.destroy(); await m.l2.destroy();
}
