/**
 * Not a test — WHAT DOES THE PILOT'S HORIZON ACTUALLY REACH, IN RAW MACHINE STEPS? (plan §52.28).
 *
 * A lead index is `grid` SAMPLES and a sample is `sample` raw steps, so the horizon is
 * `N * grid * sample` steps and not `N * grid` — the units error this project keeps paying for
 * (rule 17), and one this section nearly made. `§52.26` measured the tool error's response to a
 * command correction rising over ~3,000 steps; `timescales.mjs` measured 943 steps 10-90% and
 * showed that rise is the POSITION LOOP's designed bandwidth rather than the gearbox spring. So
 * the question the QP's authority turns on is whether `N*grid*sample` reaches that rise, and it
 * has never been printed. This commissions one pilot on the arm and prints the geometry it chose,
 * `hGrid` against its own DC, and the fraction of the response that lies inside the horizon.
 */
import { commissionArm, PG } from './rigs/arm-rig.mjs';

const rep = await commissionArm({ seed: +(process.env.SEED || 1), uCap: +(process.env.UCAP || 0.15) });
const p = rep;  // commissionArm returns the pilot itself
const H = p.N * p.grid * p.sample;
console.log(`\ncell K ${PG.K} / E ${PG.E}, servo bw ${process.env.ARM_BW || '2e-3'}`);
console.log(`  probe:   Ts ${p.Ts}   Tset ${p.Tset}   Tset/Ts ${(p.Tset / p.Ts).toFixed(2)}   (the code clamps Tset at 6*Ts = ${6 * p.Ts}, so the clamp ${p.Tset >= 6 * p.Ts - 1 ? 'BINDS' : 'does not bind'})`);
console.log(`  solver:  sample ${p.sample} steps   grid ${p.grid} samples   N ${p.N} leads   horizonTs ${p.horizonTs}`);
console.log(`  HORIZON = N*grid*sample = ${H} raw machine steps   (one lead is ${p.grid * p.sample} steps)`);
for (let c = 0; c < p.hs.length; c++) {
  const h = p.hs[c], hg = h.hGrid || [];
  // hGrid[m] is the response at lag m grid-ticks to a decision now; its running sum against the
  // DC is what the QP has authority over inside its own horizon.
  let cum = 0; const tot = hg.reduce((a, v) => a + v, 0);
  const marks = [];
  for (let m = 0; m < hg.length; m++) { cum += hg[m]; if (m === Math.floor(hg.length / 4) || m === Math.floor(hg.length / 2) || m === hg.length - 1) marks.push(`${(100 * cum / (tot || 1)).toFixed(0)}% by lead ${m} (${m * p.grid * p.sample} steps)`); }
  console.log(`  ch${c}: dc ${h.dc.toExponential(3)}  hGrid ${hg.length} leads, sum ${tot.toExponential(3)}  ->  ${marks.join(', ')}`);
}
console.log(`\n  A horizon shorter than the plant's own rise is an inversion with no authority over its own`);
console.log(`  decision — the cold mill's fault (a 14-step horizon on a plant that cannot move for 100).`);
