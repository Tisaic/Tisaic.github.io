// IS THE PILOT ALREADY CARRYING THE TORQUE? — the one experiment that explains both negatives.
//
// TWO RESULTS NEED EXPLAINING AND THEY POINT THE SAME WAY.
//   1. The ideal-correction map went 1.512x -> 4.781x on ONE feature, the rigid gearbox torque
//      M(q2)*qddot + C(q, qdot) - G(q) computed from the command.
//   2. Fitted to what a pilot CASCADE leaves, that same map is worth 1.121x instead of 4.781x —
//      and the ILC ceiling above the cascade has itself fallen to 1.3x-3.1x. The cascade had
//      already taken what the map takes.
//   3. And putting the identical torque INTO the pilot's forecast basis (`cmdFeat`) is null at
//      one tap — indistinguishable from a shuffled control — and harmful at six.
//
// THE OBVIOUS EXPLANATION IS THAT THE PILOT ALREADY HAS IT. `arm-rig.mjs` routes six measured
// signals: two encoder angles, two speeds, and TWO APPLIED TORQUES. The map's feature set is
// commanded KINEMATICS only and has no torque channel at all, which is exactly why naming the
// nonlinearity was worth 3x there — it was genuinely absent. The pilot reads the applied torque
// at every lag in its window, and the applied torque contains the servo's own rigid feedforward.
// So the term the map had to construct, the pilot is handed.
//
// THIS FILE PUTS THAT TO THE MACHINE (rule 16) rather than arguing it, and it is a THREE-row
// experiment because two rows could not distinguish "torque matters" from "capacity matters":
//
//   nm 6           the shipped routing — angles, speeds, torques.
//   nm 4           the SAME pilot with the torque channels withheld. `_row` iterates
//                  `ch < this.nm`, so this drops exactly the two torque signals and their whole
//                  lag block, and nothing else changes.
//   nm 4 + cmdFeat the withheld machine given the COMMANDED rigid torque back through the
//                  engineer's hook. If measured torque and commanded rigid torque are
//                  substitutes, this recovers what row 2 lost.
//
// WHAT EACH OUTCOME MEANS, WRITTEN DOWN BEFORE IT RUNS SO IT CANNOT BE READ AFTER THE FACT:
//   - nm 4 collapses and cmdFeat recovers it  -> the explanation is right; the torque is
//     load-bearing and the pilot already had the map's whole advantage.
//   - nm 4 collapses and cmdFeat does NOT     -> torque matters but the MEASURED one carries
//     something the commanded one cannot (the loop's own response), which is a different and
//     more interesting finding.
//   - nm 4 does not collapse                  -> the torque channels are not what is carrying
//     the pilot, the explanation above is wrong, and the map's advantage is still unexplained.
import { commissionArm, deployOn, makeArm, PG } from './pilot/rigs/arm-rig.mjs';
import { Stack } from '../lib/pilot/stack.js';

const FEED = +(process.env.TA_FEED || 0.004);
const UCAP = +(process.env.TA_UCAP || 0.6);
const MU = process.env.TA_MU !== undefined ? +process.env.TA_MU : 0.03;
const DEPTH = +(process.env.TA_DEPTH || 1);
const SHAPES = (process.env.TA_SHAPES || 'sharp,circle,rounded').split(',');

const { arm: refArm, servo: refServo } = await makeArm();
const tauHook = {
  taps: [0], n: 2,
  f: (p0, p1, p2, off, sample) => {
    const inv = 1 / sample, inv2 = inv * inv;
    const t = refServo.jointTorques([
      { theta: p0[0], omega: (p0[0] - p1[0]) * inv, alpha: (p0[0] - 2 * p1[0] + p2[0]) * inv2 },
      { theta: p0[1], omega: (p0[1] - p1[1]) * inv, alpha: (p0[1] - 2 * p1[1] + p2[1]) * inv2 },
    ]);
    return [t[0], t[1]];      // the library derives this block's scale from the record
  },
};

const ROWS = [
  { name: 'nm 6 (shipped)   ', nm: 6, cf: null },
  { name: 'nm 4 (no torque) ', nm: 4, cf: null },
  { name: 'nm 4 + cmd tau   ', nm: 4, cf: tauHook },
  { name: 'nm 6 + cmd tau   ', nm: 6, cf: tauHook },
];

console.log(`arm K ${PG.K} / E ${PG.E}, feed ${FEED}, uCap ${UCAP}, mu ${MU}, depth ${DEPTH}`);
const gm = (v) => Math.exp(v.reduce((a, x) => a + Math.log(x), 0) / v.length);
let open = null;
console.log('\n  configuration      cols' + SHAPES.map((s) => s.padStart(17)).join('')
  + '     geo mean');
for (const r of ROWS) {
  const extra = { ...(DEPTH > 1 ? { depth: DEPTH } : {}), nMeasured: r.nm };
  const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED },
    uCap: UCAP, Cls: DEPTH > 1 ? Stack : undefined, extra,
    before: (p) => {
      const set = (q) => { q.cmdFeat = r.cf; };
      set(p);
      if (p.opts) { p.opts.cmdFeat = r.cf; p.opts.nMeasured = r.nm; }
      (p.layers || []).forEach(set);
    } });
  if (!pilot) { console.log(`  ${r.name}: commissioning never terminated`); continue; }
  const layers = pilot.layers || [pilot];
  for (const p of layers) p.uWeight = MU > 0 ? new Array(p.nc).fill(MU) : null;
  if (!open) {
    open = {};
    for (const s of SHAPES) open[s] = (await deployOn(pilot, s, false, FEED)).r.totalRms;
    console.log('  open loop:  ' + SHAPES.map((s) => `${s} ${open[s].toExponential(3)}`).join('  '));
  }
  const xs = [], cols = [];
  for (const s of SHAPES) {
    const d = await deployOn(pilot, s, true, FEED);
    const x = open[s] / d.r.totalRms;
    xs.push(x); cols.push(`${x.toFixed(2)}x u${d.uPk.toFixed(3)}`.padStart(17));
  }
  const ro = layers[0].readouts && layers[0].readouts[0];
  const nf = ro && ro.w && ro.w[0] ? ro.w[0].length : 0;
  console.log(`  ${r.name}${String(nf).padStart(5)}${cols.join('')}${gm(xs).toFixed(3).padStart(12)}x`);
}
await refArm.l1.destroy(); await refArm.l2.destroy();
console.log('EXIT 0');
