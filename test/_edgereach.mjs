/**
 * @file DOES THE HORIZON REACH THE ERROR'S OWN PERIOD? — the owner's phone trace, measured.
 *
 * The screenshot at K 0.25 / E 0.005 / sharp / feed 1.6e-2 shows the shape of the error, not
 * just its size: the contour error swings SIGN (+0.9 to -0.6), so it is oscillation and not
 * bias; it has FOUR cycles per lap, one per edge, each a smooth bulge with a sharp notch at
 * the corner where the commanded feed drops to zero; and the tool sits OUTSIDE the program on
 * the edges. That is the spring-loaded excursion — accelerate along an edge, the link flexes,
 * the tool carries wide, the corner stops it and the flex releases — and it is the same
 * component the feed span found growing as feed^1.40 while lag grew as feed^1.03.
 *
 * THE HYPOTHESIS THE PICTURE SUGGESTS, and it is rule 37, which this project has paid for
 * twice: a lag window must REACH the period of what it has to see. The lap is ~7099 steps and
 * the error's own period is a quarter of that, ~1775 steps. The ladder reported N 50, so the
 * question is whether N * grid * sample spans an edge or only part of one — a QP that sees a
 * fraction of the rise cannot anticipate the excursion it is asked to cancel.
 *
 * This reports the reach against the measured period rather than asserting either, because the
 * rule's own wording is "report the reach against the measured mode".
 *
 * Run: ARM_K=0.25 ARM_E=0.005 SUITE=full node test/_edgereach.mjs
 */
import { commissionArm, deployOn, mkPath } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'sharp';
const FEED = +(process.env.FEED || 1.6e-2);
const UCAP = +(process.env.UCAP || 0.6);

const path = mkPath(SHAPE, FEED);
const LAP = Math.round(path.lap);
const EDGE = LAP / 4;                       // four real corners, so four edges

console.log(`\nthe error's own period against the pilot's reach`);
console.log(`  arm K ${process.env.ARM_K || 16} / E ${process.env.ARM_E || 0.15}, `
  + `${SHAPE} at feed ${FEED.toExponential(1)}, uCap ${UCAP}`);
console.log(`  lap ${LAP} steps, one edge ${EDGE.toFixed(0)} steps\n`);

const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED } });
const st = p.status();
const grid = p.grid, sample = p.sample, N = p.N;
const reach = N * grid * sample;
console.log(`  Ts ${st.Ts}  sample ${sample}  grid ${grid}  N ${N}`);
console.log(`  horizon reach ${reach} steps = ${(reach / EDGE).toFixed(2)} of ONE EDGE`
  + `  ${reach >= EDGE ? '— spans it' : '— DOES NOT SPAN IT'}`);
const ro = st.report.readouts;
ro.forEach((r, c) => console.log(`  ch${c}: window ${r.lags} lags x stride ${r.stride} x sample `
  + `${sample} = ${(r.lags - 1) * r.stride * sample} steps back `
  + `(${((r.lags - 1) * r.stride * sample / EDGE).toFixed(2)} of an edge)  basis ${r.basis}`
  + `  r2Lead0 ${r.r2Lead0.toFixed(3)}`));

const off = await deployOn(p, SHAPE, false, FEED);
const on = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
console.log(`\n  delivered ${off.r.totalRms.toExponential(4)} -> ${on.r.totalRms.toExponential(4)}`
  + `  (${(off.r.totalRms / on.r.totalRms).toFixed(2)}x)  uPk ${on.uPk.toFixed(3)} of ${UCAP}`);
// RULE 39: the picture says OSCILLATION rather than bias, and this is the number that says so.
console.log(`  open   contour ${off.r.contourRms.toExponential(3)}  bias `
  + `${off.r.contourBias.toExponential(3)}  osc ${off.r.contourOsc.toExponential(3)}`);
console.log(`  pilot  contour ${on.r.contourRms.toExponential(3)}  bias `
  + `${on.r.contourBias.toExponential(3)}  osc ${on.r.contourOsc.toExponential(3)}`);
console.log(`  bias removed ${(100 * (1 - Math.abs(on.r.contourBias) / Math.abs(off.r.contourBias))).toFixed(1)}%`
  + `   oscillation removed ${(100 * (1 - on.r.contourOsc / off.r.contourOsc)).toFixed(1)}%\n`);
