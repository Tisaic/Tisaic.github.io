// THE BENCH MACHINE (`lib/flexisim/bench.js`) — the arm the FlexiSim page shows and the Node plant
// library commissions, checked as a machine before anything is fitted to it.
//
//   IK         the length-only inverse kinematics equals the arm's own, exactly
//   PROGRAM    a joint program has a whole number of scans per lap and is closed
//   CONVENTIONAL  the conventional machine follows the program, and its compliance feedforward
//              earns its place (the denominator must be a real incumbent, not a straw man)
//   FEASIBLE   the drive can follow the bench program: the closed-loop machine saturates on at most
//              0.1% of the sharp square's scans at the bench feed — and the old deviation-rule
//              corners (the control) saturate it by more than ten times that
//   REPEATS    two machines built alike and driven alike agree bit for bit
//   CARRY      a rebuilt arm that takes the old one's state has not moved
//   TABLES     the stored ILC tables (test/plants/ilc-tables) were learned on the programs this bench
//              generates today, bit for bit — otherwise they are stale
import { buildArm, calibrateComp, benchProgram, jointProgram, ikOf, conventional, snapshotArm, BENCH }
  from '../../lib/flexisim/bench.js';
import { sharpRect } from '../../lib/flexisim/toolpath.js';
import { driveTo } from '../../lib/flexisim/approach.js';
import { decompose } from '../../lib/flexisim/contour.js';
import { ilcTables, refMismatch } from '../plants/ilc-tables/index.mjs';

let failed = 0;
const ck = (n, c, d) => { console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`); if (!c) failed++; };
console.log('\nthe bench machine\n');

const m = await buildArm();
const ik = ikOf(m.arm.L1, m.arm.L2);
const prog = benchProgram('sharp', BENCH.feed, ik);
{
  let e = 0;
  for (let k = 0; k < prog.lap; k += 97) { const c = prog.cmd(k), a = ik(c.x, c.y), b = m.arm.ik(c.x, c.y, true); e = Math.max(e, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }
  ck('IK: the length-only inverse kinematics equals the arm\'s own', e < 1e-12, e);
  ck('PROGRAM: a whole number of scans per lap, and closed', Number.isInteger(prog.lap) && prog.lap >= prog.path.lap
    && prog.at(prog.lap)[0] === prog.at(0)[0] && prog.at(-1)[1] === prog.at(prog.lap - 1)[1], prog.lap);
}

{
  const tabs = ilcTables();
  const bad = tabs.filter((t) => refMismatch(t, benchProgram(t.shape, t.feed, ik)) !== 0);
  ck(`TABLES: all ${tabs.length} stored ILC tables match the bench's programs bit for bit`, tabs.length === 6 && bad.length === 0,
    bad.map((t) => t.file).join(', ') + ' — regenerate with test/plants/ilc-tables/gen.mjs');
  const t = tabs[0], moved = { ...t, ref: Float64Array.from(t.ref) };
  moved.ref[2 * (t.lap >> 1)] += 1e-12;
  ck('TABLES: …and the check sees one stored sample moved by 1e-12 rad (the control)',
    refMismatch(moved, benchProgram(t.shape, t.feed, ik)) > 0);
}

const rc = await calibrateComp(m);
const NONE = { feedforward: () => ({ dq: [0, 0] }) };
async function lap(comp, p = prog) {
  const mm = await buildArm();
  await driveTo(mm.arm, mm.servo, p.at(0), BENCH.feed);
  const c = conventional(mm, comp);
  c.reset(p.at(0));
  let s = 0, n = 0, sat = 0;
  const tools = [];
  for (let L = 0; L < 2; L++) {
    if (L === 1) mm.servo.resetLimitStats();
    for (let k = 0; k < p.lap; k++) {
      c.step(p.at(k));
      if (L === 1) { const t = mm.arm.toolXY(), d = decompose(p.path, t, p.cmd(k)); s += d.contour ** 2 + d.lag ** 2; n++; if (k % 500 === 0) tools.push(t[0], t[1]); }
    }
    if (L === 1) sat = Math.max(...mm.servo.limitStats().map((x) => x.fraction));
  }
  await mm.l1.destroy(); await mm.l2.destroy();
  return { rms: Math.sqrt(s / n), tools, sat };
}
{
  const a = await lap(rc), b = await lap(rc), z = await lap(NONE);
  console.log(`    conventional machine on the sharp square: ${a.rms.toExponential(3)} tool rms, without its compliance feedforward ${z.rms.toExponential(3)}`);
  ck('CONVENTIONAL: the compliance feedforward improves the machine (the incumbent is real)', a.rms < 0.9 * z.rms, `${a.rms} against ${z.rms}`);
  ck('CONVENTIONAL: the machine follows the program (tool error well inside the program\'s size)', a.rms < 0.25 * 8, a.rms);
  ck('REPEATS: two machines built and driven alike agree bit for bit', a.rms === b.rms && a.tools.every((v, i) => v === b.tools[i]));
  const legacy = jointProgram(sharpRect({ w: 8, h: 8, centre: BENCH.centre, feed: BENCH.feed, accel: 4e-5, cornerDt: 40 }), ik);
  const old = await lap(rc, legacy);
  console.log(`    drive saturated on ${(100 * a.sat).toFixed(3)}% of the bench program's scans; on the old deviation-rule corners ${(100 * old.sat).toFixed(2)}%`);
  ck('FEASIBLE: the drive follows the bench program (saturated on at most 0.1% of its scans)', a.sat <= 1e-3, a.sat);
  ck('FEASIBLE: …and the check sees the old deviation-rule corners saturate it (the control)', old.sat > 10 * Math.max(a.sat, 1e-4), old.sat);
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
