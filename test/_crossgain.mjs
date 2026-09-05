/**
 * @file IS THE SCHEDULING LAW MEASURED OR ASSUMED? — sweep the cross kernel's own gain.
 *
 * `_crossfeed.mjs` measured the plant's linear cross response against its diagonal across the
 * feed span: 0.183 / 0.355 / 0.443 on the sharp square over a 4x feed, and — the fact the whole
 * investigation turns on — at the FAST feed the elbow's own response is 0.484 while the
 * shoulder-to-elbow cross is 0.542. The cross term is LARGER than the diagonal one. At the slow
 * feed the same pair reads 0.974 against 0.234, four to one the other way.
 *
 * That reversal predicts every result in this arc: the elbow forecasts badly at speed because
 * half its response is not its own; widening the excitation improves that forecast because the
 * record then carries the coupling; the DIAGONAL solve gets worse anyway because a better model
 * of the wrong structure inverts wrong; the off-diagonal solve repairs it where cross and
 * diagonal are comparable; and it wrecks the slow feed where the diagonal dominates four to one.
 *
 * WHAT THAT IS NOT YET is a law. "Scale the cross kernel with rate" is an assumption until the
 * machine is asked what scale it wants, and this project's standing failure is a constant chosen
 * on one cell (rule 31). So this commissions ONCE with the off-diagonal solve armed and then
 * re-deploys THAT SAME MODEL with the cross blocks scaled by a ladder of gains, at both feeds.
 * Only the cross gain varies — the diagonal, the fit, the horizon and the solver are the model
 * the pilot commissioned.
 *
 * Gain 0 is the diagonal solve, so it is the control that must reproduce the unarmed numbers,
 * and gain 1 is the shipped off-diagonal one (rule 21, rule 9's both halves).
 *
 * WHAT THE OUTCOMES MEAN. If the best gain RISES with feed and does so roughly as the measured
 * cross/diagonal ratio does, the law is measured and the scheduling variable is a quantity the
 * pilot already carries. If the best gain is the same at both feeds, the transfer failure is not
 * the size of the cross correction and scheduling it will not help. And if no gain recovers the
 * slow feed, the fault is the kernel's SHAPE rather than its scale — which is the pose
 * dependence `_mimomove.mjs` was built for, not a gain at all.
 *
 * Run: ARM_K=0.25 ARM_E=0.005 SUITE=full node test/_crossgain.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEEDS = (process.env.FEEDS || '1.6e-2,4e-3').split(',').map(Number);
const GAINS = (process.env.GAINS || '0,0.25,0.5,0.75,1').split(',').map(Number);
const UCAP = +(process.env.UCAP || 0.6);
const VMULT = +(process.env.VMULT || 1);
const BASE = { vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 };
const lim = { ...BASE, vMax: BASE.vMax * VMULT };

// THE TRAINING PROGRAM IS FIXED, NOT KEYED OFF THE FEED LADDER. It was `FEEDS[0]`, which meant
// three runs of this file commissioned against three different representative programs and the
// same cell read 2.73x in one and 2.71x in another — a sweep whose control moved with its
// variable. `TRAIN_FEED` defaults to the slowest feed on the ladder so every row is one model.
const TRAIN_FEED = +(process.env.TRAIN_FEED || Math.min(...FEEDS));
const p = await commissionArm({ seed: 1, uCap: UCAP, limits: [lim, lim],
  train: { shape: SHAPE, feed: TRAIN_FEED }, extra: { mimo: true } });
const st = p.status();
if (!st.mimo) throw new Error('mimo asked but status says it was not built');

// KEEP THE COMMISSIONED CROSS BLOCKS AND SCALE COPIES, never scale in place — a ladder that
// multiplies the same array each pass measures a geometric sequence and reports it as a sweep.
const H = p._mimoH, nc = H.length;
const ORIG = H.map((row, j) => row.map((b, c) => (j === c || !b ? null : Float64Array.from(b))));
const setGain = (g) => {
  for (let j = 0; j < nc; j++) for (let c = 0; c < nc; c++) {
    if (j === c || !ORIG[j][c]) continue;
    const src = ORIG[j][c], dst = new Float64Array(src.length);
    for (let i = 0; i < src.length; i++) dst[i] = src[i] * g;
    H[j][c] = dst;
  }
};

console.log(`\ncross-kernel gain against feed — K ${process.env.ARM_K || 16} / `
  + `E ${process.env.ARM_E || 0.15}, ${SHAPE}, excitation ${VMULT}x, `
  + `commissioned at feed ${TRAIN_FEED.toExponential(1)}`);
console.log(`  measured cross/diagonal on the plant: 0.183 at 4.0e-3, 0.443 at 1.6e-2\n`);
console.log(`  feed      gain    contour      bias        osc         uPk`);
for (const f of FEEDS) {
  const off = await deployOn(p, SHAPE, false, f);
  console.log(`  ${f.toExponential(1)}   open   ${off.r.contourRms.toExponential(3)}  `
    + `${off.r.contourBias.toExponential(3)}  ${off.r.contourOsc.toExponential(3)}`);
  for (const g of GAINS) {
    setGain(g);
    const r = await deployOn(p, SHAPE, p.verdict.deploy, f);
    console.log(`  ${f.toExponential(1)}   ${g.toFixed(2)}   ${r.r.contourRms.toExponential(3)}  `
      + `${r.r.contourBias.toExponential(3)}  ${r.r.contourOsc.toExponential(3)}  `
      + `${r.uPk.toFixed(3)}   ${(off.r.contourRms / r.r.contourRms).toFixed(2)}x`);
  }
  console.log('');
}
setGain(1);
console.log(`  gain 0 is the diagonal solve and must reproduce the unarmed numbers; gain 1 is`);
console.log(`  what ships when \`mimo\` is armed today.\n`);
