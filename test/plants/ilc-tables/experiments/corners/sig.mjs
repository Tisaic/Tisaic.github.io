// Corner signatures on the machine: the conventional machine alone, and with a stored lap table.
import { writeFileSync } from 'node:fs';
import { buildArm, calibrateComp, ikOf, jointProgram, benchProgram, conventional, BENCH } from '../../../../../lib/flexisim/bench.js';
import { driveTo } from '../../../../../lib/flexisim/approach.js';
import { decompose, cornerSignatures } from '../../../../../lib/flexisim/contour.js';
import { sharpRect } from '../../../../../lib/flexisim/toolpath.js';
const pr = await buildArm(); const ik = ikOf(pr.arm.L1, pr.arm.L2); await pr.l1.destroy(); await pr.l2.destroy();
async function run(prog, U, label) {
  const m = await buildArm(); const rc = await calibrateComp(m);
  await driveTo(m.arm, m.servo, prog.at(0), BENCH.feed);
  const c = conventional(m, rc); c.reset(prog.at(0));
  const L = prog.lap, tool = new Float64Array(2 * L); let ss = 0;
  for (let lap = 0; lap < 2; lap++) for (let k = 0; k < L; k++) {
    const r = prog.at(k); c.step(U ? [r[0] + U[2 * k], r[1] + U[2 * k + 1]] : r);
    if (lap === 1) { const t = m.arm.toolXY(); tool[2 * k] = t[0]; tool[2 * k + 1] = t[1]; const d = decompose(prog.path, t, prog.cmd(k)); ss += d.contour ** 2 + d.lag ** 2; }
  }
  const cs = cornerSignatures(prog, tool);
  console.log(`${label.padEnd(30)} tool rms ${Math.sqrt(ss / L).toExponential(3)} · corners ${cs.n}: spread ${(100 * cs.spread).toFixed(1)}%  rough ${(100 * cs.rough).toFixed(1)}%  peak ${cs.peak.toExponential(2)}`);
  await m.l1.destroy(); await m.l2.destroy();
  return cs;
}
const legacy = (feed) => jointProgram(sharpRect({ w: 8, h: 8, centre: BENCH.centre, feed, accel: 4e-5, cornerDt: 40 }), ik);
const out = {};
out.old = await run(legacy(3e-3), null, 'old sharp 3e-3 (bare)');
for (const [sh, f] of [['sharp', 3e-3], ['sharp', 2e-3], ['rounded', 3e-3], ['circle', 3e-3]]) out[`${sh}${f}`] = await run(benchProgram(sh, f, ik), null, `new ${sh} ${f} (bare)`);
if (process.env.TABLES) {
  const { ilcTables } = await import('../../index.mjs');
  for (const t of ilcTables().filter((x) => x.feed === 3e-3)) out[`tab-${t.shape}`] = await run(benchProgram(t.shape, t.feed, ik), t.U, `new ${t.shape} 3e-3 + lap table (${t.factor.toFixed(1)}x)`);
}
// dump signatures for plotting: sharp 3e-3 bare and table
const dump = (cs, name) => { const W = cs.window, rows = []; for (let j = 0; j < W; j += 2) rows.push([j, ...cs.sig.flatMap((g) => [g[2 * j], g[2 * j + 1]])].join(',')); writeFileSync(`${name}.csv`, 'j,' + cs.sig.map((_, i) => `c${i + 1}_along,c${i + 1}_across`).join(',') + '\n' + rows.join('\n')); };
dump(out.old, 'sig-old'); dump(out['sharp0.003'], 'sig-new');
if (out['tab-sharp']) dump(out['tab-sharp'], 'sig-table');
