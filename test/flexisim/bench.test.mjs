/**
 * @file PHASE 1 — WHAT THE LADDER IS WORTH AWAY FROM HOME.
 *
 * This is the experiment that can kill `docs/plan.md`. The plan's premise is that the ladder
 * wins at home and degrades badly off it, and that the degradation is carried by the ONE
 * rung addressed by lap position rather than by machine state. If the full ladder does not
 * degrade away from home, the premise is wrong and the north star needs rewriting — so this
 * runs before anything is built.
 *
 * ONE COMMISSION, TWO CONFIGURATIONS. The ladder is commissioned once, on the home cell, and
 * then scored across the matrix twice: as shipped, and with the lap-periodic rung disarmed.
 * Both use the SAME commissioned object, so the comparison is one variable — whether the
 * memory is armed — and not two separately-commissioned machines. That is the only way to
 * attribute the degradation rather than infer it.
 *
 * Run with SUITE=full. It is a long measurement, not a check.
 */
import { machine, settle, commissionComp } from './_rig.mjs';
import { makeArmHost } from '../../lib/flexisim/autohost.js';
import { PROGRAMS, FEEDS, HOME_FEED, CENTRE, runMatrix, printMatrix } from './bench.mjs';

const T0 = Date.now();
const el = () => `[${((Date.now() - T0) / 60000).toFixed(0)}m]`;
const K = +(process.env.K || 1), E = +(process.env.E || 0.06);

const home = PROGRAMS.find((p) => p.home).make(HOME_FEED);
const LAP = Math.ceil(home.lap);
console.log(`\nflexisim: the transfer bench — one commission, ${PROGRAMS.length} programs x `
  + `${FEEDS.length} feedrates`);
console.log(`  [arm K ${K} E ${E}, home = rounded 8x8 at ${HOME_FEED.toExponential(0)}, lap ${LAP}]`);

const p0 = home.at(0);
async function fresh() {
  const m = await machine({ K, E });
  const rc = commissionComp(m.arm, m.servo);
  const [q1, q2] = m.arm.ik(p0.x, p0.y, true);
  settle(m.arm, m.servo, q1, q2);
  return { ...m, rc };
}

const live = await fresh();
const host = makeArmHost({
  makeMachine: fresh, path: home, lap: LAP, K,
  centre: live.arm.ik(CENTRE[0], CENTRE[1], true),
  onRung: (r) => console.log(`  ${el()} ${r.name}  ${r.score.toExponential(4)}`
    + `${r.gain === null ? '' : '  ' + r.gain.toFixed(2) + 'x'}`
    + `${r.deployed ? '' : '  — NOT deployed'}`),
});
host.auto.pilotOpts.start = live.arm.ik(p0.x, p0.y, true);
host.auto.pilotOpts.workspace = (q) => {
  const rr = Math.hypot(live.arm.L1 * Math.cos(q[0]) + live.arm.L2 * Math.cos(q[0] + q[1]),
    live.arm.L1 * Math.sin(q[0]) + live.arm.L2 * Math.sin(q[0] + q[1]));
  return rr > Math.abs(live.arm.L1 - live.arm.L2) + 0.5 && rr < live.arm.L1 + live.arm.L2 - 0.5;
};

console.log(`  ${el()} commissioning on the home cell…`);
const rep = await host.auto.commission({ run: host.run, drivePilot: host.drivePilot });
console.log(`  ${el()} shipped ${JSON.stringify(rep.deployed)}  `
  + `${rep.base.toExponential(4)} → ${rep.best.toExponential(4)}  ${rep.gain.toFixed(2)}x at home`);

// THE MACHINE THE MATRIX IS SCORED ON is the one on screen, not a throwaway: `attach` points
// the frame maps at it and supplies the baseline every scored run was driven with.
host.attach(live.arm, live.servo, live.rc);
const auto = host.auto;

const full = runMatrix({ m: live, rc: live.rc, auto, label: 'FULL LADDER (as shipped)' });
printMatrix(full);

// ONE VARIABLE: the memory, disarmed. Same commissioned object, same machine, same cells.
const hadHff = auto.deployed.hff;
auto.deployed.hff = false;
const model = runMatrix({ m: live, rc: live.rc, auto, label: 'MODEL LAYERS ONLY (lap-periodic rung disarmed)' });
printMatrix(model);
auto.deployed.hff = hadHff;

console.log(`\n  WHAT THIS DECIDES`);
console.log(`    the memory is worth ${(full.home.gain / model.home.gain).toFixed(2)}x at HOME`
  + ` and ${(full.worst.gain / model.worst.gain).toFixed(2)}x at the WORST CELL.`);
console.log(`    full ladder   home ${full.home.gain.toFixed(2)}x  worst ${full.worst.gain.toFixed(2)}x`
  + `  spread ${(full.home.gain / full.worst.gain).toFixed(1)}x  hurt ${full.hurt.length}/${full.rows.length}`);
console.log(`    model only    home ${model.home.gain.toFixed(2)}x  worst ${model.worst.gain.toFixed(2)}x`
  + `  spread ${(model.home.gain / model.worst.gain).toFixed(1)}x  hurt ${model.hurt.length}/${model.rows.length}`);
console.log(`    If the full ladder's SPREAD is not materially worse than the model-only`);
console.log(`    spread, docs/plan.md's premise is wrong and the plan is the thing to change.`);

await live.l1.destroy(); await live.l2.destroy();
console.log('');
