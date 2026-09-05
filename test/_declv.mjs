/**
 * @file RAISE THE DECLARED VELOCITY — the one limit rule 41b's inertness result never moved.
 *
 * Rule 41b records that raising the declared numbers is inert, and the evidence behind it is
 * "two commissionings at 50x the acceleration and 1000x the jerk came back byte-identical".
 * ACCELERATION AND JERK ONLY. The same record says WHY they were inert — "the box TRAVERSE
 * binds through velocity, so a and j ride along" — so the experiment loosened the two limits
 * that were slack and left the one that binds untouched. `arm-rig.mjs` states it in its own
 * comment: at this box and these limits the tune settles at tc 662 with v/a/j at 73/58/55%.
 *
 * `test/_envelope.mjs` then measured that the cell under investigation is not the cell that
 * result was taken on. At the HOME feed the sharp square uses 63% of the declared velocity —
 * inside it, which is the configuration rule 41b describes. At feed 1.6e-2 it uses 252% and
 * 214%. The program is running at two and a half times the fastest thing the excitation was
 * allowed to do, so the plant is being inverted where it was never identified, in the one
 * variable the builder is actually constrained by.
 *
 * So this raises vMax alone and scores the machine (rule 16). Reported per rung: the tune the
 * builder settled on (tc, and the fraction of each limit it reached), the forecast, and the
 * delivered contour with its bias/oscillation split, because the arcs under investigation are
 * a contour feature (rule 39).
 *
 * WHAT WOULD MAKE THIS A NULL RATHER THAN A FIX: if the built series comes back byte-identical
 * the way the a/j sweep did, the binding story is wrong and this is another dead knob. And a
 * cell that improves here has to be checked against the HOME feed before anything is claimed —
 * this project has three separate records of a calibration that had to span the range it is
 * used over, and a limit tuned for the fast cell is a per-cell constant unless it is neutral
 * on the slow one (rules 31, 34).
 *
 * Run: ARM_K=0.25 ARM_E=0.005 SUITE=full node test/_declv.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEED = +(process.env.FEED || 1.6e-2);
const UCAP = +(process.env.UCAP || 0.6);
const MULTS = (process.env.MULTS || '1,2,4,8').split(',').map(Number);
const BASE = { vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 };

console.log(`\nraising the DECLARED velocity — K ${process.env.ARM_K || 16} / `
  + `E ${process.env.ARM_E || 0.15}, ${SHAPE} at feed ${FEED.toExponential(1)}`);
console.log(`  the program peaks at 2.02e-3 (shoulder) and 1.71e-3 (elbow), so 1x is 252%/214%`
  + ` over.\n`);
console.log(`  vMult   declared v    r2 ch0   r2 ch1    total      contour     bias        osc`
  + `        uPk`);

let off = null;
for (const m of MULTS) {
  const limits = { ...BASE, vMax: BASE.vMax * m };
  const p = await commissionArm({ seed: 1, uCap: UCAP, limits, train: { shape: SHAPE, feed: FEED } });
  const rep = p.status().report;
  const ro = rep.readouts;
  if (!off) off = await deployOn(p, SHAPE, false, FEED);
  const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
  console.log(`  ${String(m).padStart(4)}x   ${limits.vMax.toExponential(2)}     `
    + `${ro[0].r2Lead0.toFixed(3)}    ${ro[1].r2Lead0.toFixed(3)}   `
    + `${r.r.totalRms.toExponential(3)}  ${r.r.contourRms.toExponential(3)}  `
    + `${r.r.contourBias.toExponential(3)}  ${r.r.contourOsc.toExponential(3)}  `
    + `${r.uPk.toFixed(3)}${p.verdict.deploy ? '' : '  REFUSED'}`);
}
console.log(`\n  open loop  ${''.padEnd(30)}${off.r.totalRms.toExponential(3)}  `
  + `${off.r.contourRms.toExponential(3)}  ${off.r.contourBias.toExponential(3)}  `
  + `${off.r.contourOsc.toExponential(3)}\n`);
