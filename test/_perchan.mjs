/**
 * @file DO THE TWO CHANNELS WANT DIFFERENT EXCITATIONS? — the split, put to the machine.
 *
 * `_ringing.mjs` falsified the inversion hypothesis and left a sharper fact behind. Raising the
 * declared velocity gives a model whose contour BIAS is better at every cell of the solver grid
 * (best -0.835 against the narrow model's best -1.451) and whose OSCILLATION is worse at every
 * cell (1.938 against 1.354), and truncating the solve does not recover it — at one iteration the
 * wide model still oscillates 43% more. The two components are carried by different
 * identifications, which is rule 39 arriving at the excitation instead of at the controller.
 *
 * THERE IS A CONFOUND AND IT IS THE WHOLE POINT. The wide excitation did not move both channels
 * the same way: the ELBOW's forecast went 0.546 -> 0.708 and the SHOULDER's went 0.992 -> 0.980,
 * and `_armswhich.mjs` measured the shoulder doing 2.21x of the 2.42x contour. So "the wide model
 * oscillates" and "the wide model degraded the channel that does the work" predict the same
 * table, and only a per-channel excitation can tell them apart.
 *
 * This declares a DIFFERENT velocity per channel and commissions ONE pilot, so there is no
 * splicing of fitted banks and no single-channel correction on a coupled arm — the trap this
 * project has already recorded ("not a smaller correction but one in a direction the QP never
 * chose"). The rig takes an array of limits; a bare object still broadcasts, so every other
 * caller is byte-identical (rule 21).
 *
 * WHAT EACH OUTCOME MEANS. If (shoulder 1x, elbow 2x) recovers the narrow model's oscillation
 * AND keeps the wide model's bias, the channels genuinely want different bandwidths and that is
 * a per-channel property the pilot can MEASURE rather than a constant anyone tuned. If it lands
 * between the two, the excitation is one shared record and the split is not separable that way.
 * If it is worse than both, the bandwidths interact through the coupling and this route is dead.
 *
 * Run: ARM_K=0.25 ARM_E=0.005 SUITE=full node test/_perchan.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEED = +(process.env.FEED || 1.6e-2);
const UCAP = +(process.env.UCAP || 0.6);
const BASE = { vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 };
const v = (m) => ({ ...BASE, vMax: BASE.vMax * m });
// The four corners of (shoulder, elbow) x (narrow, wide). Both diagonals are already measured
// by `_ringing.mjs`, and they are re-run here rather than quoted so every row of this table
// comes off one build of the rig (rule 30 — a second place that describes the first drifts).
const CELLS = [['1x / 1x', [1, 1]], ['1x / 2x', [1, 2]], ['2x / 1x', [2, 1]], ['2x / 2x', [2, 2]]];

console.log(`\nper-channel declared velocity — K ${process.env.ARM_K || 16} / `
  + `E ${process.env.ARM_E || 0.15}, ${SHAPE} at feed ${FEED.toExponential(1)}`);
console.log(`  shoulder/elbow    r2 ch0   r2 ch1    total      contour     bias        osc`);

let off = null;
for (const [name, [m0, m1]] of CELLS) {
  const p = await commissionArm({ seed: 1, uCap: UCAP, limits: [v(m0), v(m1)],
    train: { shape: SHAPE, feed: FEED } });
  const ro = p.status().report.readouts;
  if (!off) off = await deployOn(p, SHAPE, false, FEED);
  const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
  console.log(`  ${name.padEnd(16)}  ${ro[0].r2Lead0.toFixed(3)}    ${ro[1].r2Lead0.toFixed(3)}   `
    + `${r.r.totalRms.toExponential(3)}  ${r.r.contourRms.toExponential(3)}  `
    + `${r.r.contourBias.toExponential(3)}  ${r.r.contourOsc.toExponential(3)}`
    + `${p.verdict.deploy ? '' : '  REFUSED'}`);
}
console.log(`  ${'open loop'.padEnd(16)}                    `
  + `${off.r.totalRms.toExponential(3)}  ${off.r.contourRms.toExponential(3)}  `
  + `${off.r.contourBias.toExponential(3)}  ${off.r.contourOsc.toExponential(3)}\n`);
