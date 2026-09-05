/**
 * @file DOES GUIDED COMMISSIONING STACK WITH THE CASCADE? — both admissible, both addressing
 * different things.
 *
 * Guided commissioning — adapt with the tracker attached, FREEZE, deploy with no tracker — took
 * this arm's single pilot from 2.76x to 7.58x on a held-out program at six laps, and the
 * held-out score beats the home score at every adapted lap count, which is what a plant model
 * does and a program fit does not.
 *
 * THE CASCADE ADDRESSES SOMETHING ELSE: layer k models what layers below it LEFT, each measuring
 * its own timescale on the machine they leave behind. So the two are not obviously redundant,
 * and they are not obviously additive either — this project has measured a second layer HARMING
 * the learned-IK chain (3.40x -> 2.93x) because what an unforecastable channel marks is a layer
 * with nothing left to model. A composition has to be measured, not assumed.
 *
 * BOTH ARE ADMISSIBLE UNDER EVERY STANDING CONSTRAINT: the tracker is used at commissioning
 * only, nothing is addressed by lap position, no plant constant is named, and the deployed
 * object is the same frozen bank per layer with no RLS at deploy. The cascade's cost is the one
 * thing that moves, and it moves in the direction target 6 cannot afford — which is why the
 * depth-1 row is kept beside it rather than replaced by it.
 *
 * ADAPTATION IS ARMED ON EVERY LAYER EXPLICITLY. `Stack` presents a Pilot's surface but holds
 * its layers separately, so setting `online` on the stack object would arm nothing and report
 * nothing — a switch that is set and a path that runs are different things, and this repository
 * has shipped that exact failure with every wiring check green (rule 61). The count of layers
 * actually armed is printed, so a silent zero is visible rather than read as a null result.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_guidedstack.mjs
 */
import { Stack } from '../lib/pilot/stack.js';
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const HELD = process.env.HELD || 'circle';
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);
const GUIDED = +(process.env.GUIDED || 6);
const DEPTHS = (process.env.DEPTHS || '1,2').split(',').map(Number);

console.log(`\nguided commissioning against the cascade — K ${PG.K} / E ${PG.E}, `
  + `${GUIDED} guided laps on ${SHAPE}, held out on ${HELD}\n`);
console.log(`  config                  ${SHAPE}                    ${HELD} (never run)`);
console.log(`  ${''.padEnd(23)} total      contour    x        total      contour    x`);

let base = null, baseH = null;
for (const depth of DEPTHS) {
  for (const guided of [0, GUIDED]) {
    const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED },
      ...(depth > 1 ? { Cls: Stack, extra: { depth } } : {}) });
    if (base === null) {
      base = (await deployOn(p, SHAPE, false, FEED)).r.totalRms;
      baseH = (await deployOn(p, HELD, false, FEED)).r.totalRms;
    }
    let armed = 0;
    if (guided > 0) {
      const layers = p.layers || [p];
      for (const L of layers) { if (L) { L.online = { ...(L.online || {}) }; armed++; } }
      await deployOn(p, SHAPE, p.verdict.deploy, FEED,
        { laps: guided + 1, truthUntilLap: Infinity });
      for (const L of layers) if (L) L.online = null;
    }
    const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED, { truthUntilLap: 0 });
    const h = await deployOn(p, HELD, p.verdict.deploy, FEED, { truthUntilLap: 0 });
    const tag = `depth ${depth}${guided ? ` + ${guided} guided` : ' static'}`;
    console.log(`  ${tag.padEnd(23)} ${r.r.totalRms.toExponential(3)}  `
      + `${r.r.contourRms.toExponential(3)}  ${(base / r.r.totalRms).toFixed(2)}x    `
      + `${h.r.totalRms.toExponential(3)}  ${h.r.contourRms.toExponential(3)}  `
      + `${(baseH / h.r.totalRms).toFixed(2)}x`
      + `${guided ? `   [${armed} layer(s) armed]` : ''}`);
  }
}
console.log(`\n  open loop               ${base.toExponential(3)}`
  + `${''.padEnd(23)}${baseH.toExponential(3)}`);
console.log(`\n  the cascade's cost moves in the direction target 6 cannot afford, so the`);
console.log(`  depth-1 row stays beside it rather than being replaced by it.\n`);
