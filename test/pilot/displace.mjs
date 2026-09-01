/**
 * @file THE DISPLACEMENT SWEEP — plan §37's critical test for the demo-path contract.
 *
 * The demo teaches DYNAMICS at its own poses; auto programs live in a sub-region; manual
 * modes reach the whole box. So the claim to falsify has both halves (rule 9): near the
 * demo the banks deliver their fitted benefit, and away from it they degrade GRACEFULLY
 * toward the base model — never a cliff, never below the open loop anywhere in the box.
 *
 * A finding from the geometry alone, before any dynamics ran: the standard commissioning
 * box (±0.55 rad) is PROGRAM-sized — the home square uses 0.523 of it — so the workspace
 * requirement was never represented by the rig at all, and this bench must commission
 * WIDER (BOX, default 1.2 rad, spans centres out to ~(15,3)). That makes the home rows a
 * second product number for free: the cost of workspace coverage on the home program.
 *
 * Rows per centre: open loop, base model alone (banks disarmed), base + demo banks. The
 * demo is the sharp square at (12,0) recorded at three feeds, record-scale labels (§36).
 *
 * Run: node test/pilot/displace.mjs [BOX=1.2] [FEED=0.004]
 */
import { sharpRect } from '../../lib/flexisim/toolpath.js';
import { commissionArm, deployOn, recordOpenLoop, fitCornerBanks, mkPath }
  from './rigs/arm-rig.mjs';

const BOX = +(process.env.BOX || 1.2);
const FEED = +(process.env.FEED || 0.004);
const CENTRES = [[12, 0], [13, 1], [14, 2], [15, 3]];

console.log(`\ndisplacement sweep: demo at (12,0), commissioning box ±${BOX} rad`);
const pilot = await commissionArm({ seed: 1, box: BOX });
if (!pilot || !pilot.verdict.deploy) {
  console.log(`  commissioning at box ${BOX} did not deploy: ${pilot ? pilot.verdict.why : 'null'}`);
  process.exit(1);
}
console.log(`  commissioned at box ${BOX}: verify ${JSON.stringify(pilot.report?.wouldRefuse || 'deploys')}`);

const recs = [];
for (const feed of [0.004, 0.008, 0.0055]) {
  recs.push(await recordOpenLoop(pilot, mkPath('sharp', feed), feed));
}
const fb = fitCornerBanks(pilot, recs, { fitScale: 'record' });
console.log(`  demo banks: fitted ${fb.fitted}, kept ${fb.kept}\n`);
console.log(`  ${'centre'.padEnd(9)} ${'open'.padStart(10)} ${'base model'.padStart(12)}`
  + ` ${'x'.padStart(6)} ${'+demo banks'.padStart(12)} ${'x'.padStart(6)}`);

for (const [cx, cy] of CENTRES) {
  const mk = () => sharpRect({ feed: FEED, accel: 4e-5, cornerDt: 40,
    centre: [cx, cy], w: 8, h: 8, closed: true });
  const off = await (async () => {
    const saved = pilot.verdict;
    pilot.verdict = { deploy: false, why: 'off' };
    const r = await deployOn(pilot, mk(), true, FEED);
    pilot.verdict = saved;
    return r;
  })();
  const routerSaved = pilot.router;
  pilot.router = null;
  const base = await deployOn(pilot, mk(), true, FEED);
  pilot.router = routerSaved;
  const banks = await deployOn(pilot, mk(), true, FEED);
  const d = Math.hypot(cx - 12, cy - 0);
  console.log(`  (${cx},${cy}) d=${d.toFixed(1)} ${off.r.contourRms.toExponential(2).padStart(9)}`
    + ` ${base.r.contourRms.toExponential(2).padStart(12)}`
    + ` ${(off.r.contourRms / base.r.contourRms).toFixed(2).padStart(5)}x`
    + ` ${banks.r.contourRms.toExponential(2).padStart(12)}`
    + ` ${(off.r.contourRms / banks.r.contourRms).toFixed(2).padStart(5)}x`);
}
