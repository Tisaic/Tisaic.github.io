// THE BENCH MACHINE (`lib/flexisim/bench.js`) — the arm the FlexiSim page shows and the Node plant
// library commissions, checked as a machine before anything is fitted to it.
//
//   IK         the length-only inverse kinematics equals the arm's own, exactly
//   PROGRAM    a joint program has a whole number of scans per lap and is closed
//   CONVENTIONAL  the conventional machine follows the program, and its compliance feedforward
//              earns its place (the denominator must be a real incumbent, not a straw man)
//   REPEATS    two machines built alike and driven alike agree bit for bit
//   CARRY      a rebuilt arm that takes the old one's state has not moved
import { buildArm, calibrateComp, benchPath, jointProgram, ikOf, conventional, snapshotArm, BENCH }
  from '../../lib/flexisim/bench.js';
import { driveTo } from '../../lib/flexisim/approach.js';
import { decompose } from '../../lib/flexisim/contour.js';

let failed = 0;
const ck = (n, c, d) => { console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`); if (!c) failed++; };
console.log('\nthe bench machine\n');

const m = await buildArm();
const ik = ikOf(m.arm.L1, m.arm.L2);
const prog = jointProgram(benchPath('sharp'), ik);
{
  let e = 0;
  for (let k = 0; k < prog.lap; k += 97) { const c = prog.cmd(k), a = ik(c.x, c.y), b = m.arm.ik(c.x, c.y, true); e = Math.max(e, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }
  ck('IK: the length-only inverse kinematics equals the arm\'s own', e < 1e-12, e);
  ck('PROGRAM: a whole number of scans per lap, and closed', Number.isInteger(prog.lap) && prog.lap >= prog.path.lap
    && prog.at(prog.lap)[0] === prog.at(0)[0] && prog.at(-1)[1] === prog.at(prog.lap - 1)[1], prog.lap);
}

const rc = await calibrateComp(m);
const NONE = { feedforward: () => ({ dq: [0, 0] }) };
async function lap(comp) {
  const mm = await buildArm();
  await driveTo(mm.arm, mm.servo, prog.at(0), BENCH.feed);
  const c = conventional(mm, comp);
  c.reset(prog.at(0));
  let s = 0, n = 0;
  const tools = [];
  for (let L = 0; L < 2; L++) {
    for (let k = 0; k < prog.lap; k++) {
      c.step(prog.at(k));
      if (L === 1) { const t = mm.arm.toolXY(), d = decompose(prog.path, t, prog.cmd(k)); s += d.contour ** 2 + d.lag ** 2; n++; if (k % 500 === 0) tools.push(t[0], t[1]); }
    }
  }
  await mm.l1.destroy(); await mm.l2.destroy();
  return { rms: Math.sqrt(s / n), tools };
}
{
  const a = await lap(rc), b = await lap(rc), z = await lap(NONE);
  console.log(`    conventional machine on the sharp square: ${a.rms.toExponential(3)} tool rms, without its compliance feedforward ${z.rms.toExponential(3)}`);
  ck('CONVENTIONAL: the compliance feedforward improves the machine (the incumbent is real)', a.rms < 0.9 * z.rms, `${a.rms} against ${z.rms}`);
  ck('CONVENTIONAL: the machine follows the program (tool error well inside the program\'s size)', a.rms < 0.25 * 8, a.rms);
  ck('REPEATS: two machines built and driven alike agree bit for bit', a.rms === b.rms && a.tools.every((v, i) => v === b.tools[i]));
}
{
  const s = snapshotArm(m), t1 = m.arm.toolXY();
  const m2 = await buildArm(0.5, 0.03, s), t2 = m2.arm.toolXY();
  ck('CARRY: a rebuilt arm (another gearbox) that takes the old state has not moved', Math.hypot(t1[0] - t2[0], t1[1] - t2[1]) < 1e-9);
  await m2.l1.destroy(); await m2.l2.destroy();
}
await m.l1.destroy(); await m.l2.destroy();

console.log(failed ? `\nbench: ${failed} check(s) FAILED` : '\nbench: all checks passed');
process.exit(failed ? 1 : 0);
