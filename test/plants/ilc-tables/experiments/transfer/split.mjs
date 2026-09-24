// Where the conventional machine's error is, on the feasible programs: contour (off the path) vs lag (along it).
import { buildArm, calibrateComp, ikOf, benchProgram, conventional, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
import { decompose } from '../../../../../lib/flexisim/contour.js';
const pr = await buildArm(); const ik = ikOf(pr.arm.L1, pr.arm.L2); await pr.l1.destroy(); await pr.l2.destroy();
for (const sh of ['sharp', 'rounded', 'circle']) for (const f of [3e-3, 2e-3]) {
  const prog = benchProgram(sh, f, ik), m = await buildArm(), rc = await calibrateComp(m);
  await driveTo(m.arm, m.servo, prog.at(0), BENCH.feed); const c = conventional(m, rc); c.reset(prog.at(0));
  let sc = 0, sl = 0, pc = 0, pl = 0; const L = prog.lap;
  for (let lap = 0; lap < 2; lap++) for (let k = 0; k < L; k++) { c.step(prog.at(k)); if (lap) { const d = decompose(prog.path, m.arm.toolXY(), prog.cmd(k)); sc += d.contour ** 2; sl += d.lag ** 2; pc = Math.max(pc, Math.abs(d.contour)); pl = Math.max(pl, Math.abs(d.lag)); } }
  console.log(`${sh.padEnd(8)} ${f}: contour rms ${Math.sqrt(sc / L).toExponential(2)} (peak ${pc.toExponential(2)})  lag rms ${Math.sqrt(sl / L).toExponential(2)} (peak ${pl.toExponential(2)})  lag share of energy ${(100 * sl / (sc + sl)).toFixed(0)}%`);
  await m.l1.destroy(); await m.l2.destroy();
}
