/**
 * @file WHICH CONSTRAINT BINDS, read from the pilot rather than re-run as an experiment.
 *
 * The feedrate span measured `uPk` pinned at the 0.6 cap from 3.0e-3 upward — five of six
 * feeds, the home feed included — so every ratio in that table was delivered by a correction
 * clamped at its peak, which on a sharp square is the corner where the error lives. That makes
 * the span a LOWER BOUND rather than the model's capability, and it raises a competing
 * explanation for the feedrate stability itself: a correction pinned at its cap across most of
 * the span is trivially similar across the span.
 *
 * `report.binding` already answers this — time-at-cap during the verify, with the verdict the
 * arc that built it wrote down: authority → raise uMax WITH ADAPTATION ARMED; model → banks and
 * adaptation. Reading it costs one commissioning; sweeping the cap would cost six and measure
 * something this already states (rule 1: the cheapest route that can falsify the claim).
 *
 * AND THE HAZARD IS ON THE RECORD, so a naive cap rise is not the follow-up: static control
 * MISUSES extra authority on this arm — the circle measured 5.91x → 4.57x at a larger cap,
 * with gated adaptation reclaiming it to 6.32x.
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEED = +(process.env.FEED || 4e-3);
const CAPS = (process.env.CAPS || '0.6').split(',').map(Number);

console.log(`\nwhich constraint binds — ${SHAPE} at feed ${FEED.toExponential(1)}, `
  + `arm K ${process.env.ARM_K || 16} / E ${process.env.ARM_E || 0.15}\n`);

for (const cap of CAPS) {
  const p = await commissionArm({ seed: 1, uCap: cap, train: { shape: SHAPE, feed: FEED } });
  const off = await deployOn(p, SHAPE, false, FEED);
  const on = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
  const b = p.report.binding || null;
  console.log(`  uCap ${cap}`);
  console.log(`    binding   ${b ? `${b.verdict}  capFrac ${b.capFrac.toFixed(4)}` : '(not reported)'}`);
  if (b && b.probe) console.log(`    lever     ${b.probe}`);
  console.log(`    delivered ${off.r.totalRms.toExponential(4)} -> ${on.r.totalRms.toExponential(4)}`
    + `  (${(off.r.totalRms / on.r.totalRms).toFixed(2)}x)  uPk ${on.uPk.toFixed(3)} of ${cap}`
    + `${on.uPk > 0.98 * cap ? '  AT THE CAP' : ''}`);
  console.log(`    verdict   ${p.verdict.deploy ? 'DEPLOYS' : 'REFUSES'} — ${p.verdict.why}\n`);
}
