/**
 * @file CAN THE IDENTIFICATION FIT IN FIVE MINUTES? — where its time actually goes.
 *
 * The compiled twin closes the 57x (123x over the open loop, 42.9x past the pilot) and its
 * deployed artifact is a tile lookup, so target 6 is met by it and by nothing else here. What it
 * costs instead is COMMISSIONING: hours of background simulation against the pilot's two minutes.
 * That is now the binding constraint, and the identification is the first half of it.
 *
 * THE COST HAS ONE SHAPE: evaluations x the length of the record each evaluation simulates.
 * `identifyTwin` walks a full cartesian grid and then rings around the best, and every candidate
 * replays the whole wander. So there are exactly two levers — fewer evaluations, or a shorter
 * record per evaluation — and the library already has the second as `screen`, a cost stage that
 * ranks every cell on a SHORT record and lets only the `keep` best pay full price.
 *
 * ITS DOCSTRING NAMES THE OBLIGATION AND IT IS THE POINT OF THIS FILE: "the caller owns proving
 * the short record ranks like the long one — measured, not assumed." A thinned GRID has already
 * shipped a defect here (it dropped E=0.06 and the rings walked into the K/E compensation
 * valley), and this file's own north star records a coarse-seed shortcut that would have halved
 * commissioning and was REFUSED by the gate. So a shortcut is a claim about ranking, and this
 * measures the ranking rather than the endpoint.
 *
 * WHAT IS REPORTED per record length: wall clock, evaluations, the identified parameters against
 * truth, and — the part that decides it — whether the ORDER the short record puts the candidates
 * in matches the full record's. A shortcut that finds the same optimum by luck on one seed is
 * not a shortcut, it is a coin that landed well (rules 3, 31).
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_idcost.mjs
 */
import { identifyTwin } from '../lib/pilot/twin.js';
import { drivePath, armSimulators } from '../lib/flexisim/twin.js';
import { randomWander } from '../lib/flexisim/demopath.js';
import { PG, makeArm, homeArm } from './pilot/rigs/arm-rig.mjs';

const SS = 9;
const FRACS = (process.env.FRACS || '1,0.5,0.25,0.125').split(',').map(Number);
const SPACE = [
  { name: 'K', values: [0.25, 1, 4, 16] },
  { name: 'E', values: [0.03, 0.06, 0.10, 0.15] },
];

const buildArm = async (params) => makeArm(params || { K: PG.K, E: PG.E });
const destroyArm = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);
const sims = armSimulators({ buildArm, destroyArm, home, sample: SS });

const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const wpath = randomWander(mkRnd(301), 0.004, { centre: PG.centre });

console.log(`\ncan the identification fit in five minutes — K ${PG.K} / E ${PG.E}\n`);
console.log(`  recording the wander on the true machine…`);
const t0 = Date.now();
const real = await buildArm();
homeArm(real.arm, real.servo, wpath);
const rec = await drivePath({ arm: real.arm, servo: real.servo, path: wpath, sample: SS,
  steps: Math.ceil(wpath.lap) });
await destroyArm(real);
const tRec = (Date.now() - t0) / 1000;
console.log(`  the record itself: ${rec.e.length} samples in ${tRec.toFixed(1)} s — `
  + `MACHINE time, and the one part no shortcut to the search can touch\n`);

console.log(`  frac   samples   evals    wall     K        E        rank vs full`);
let full = null;
for (const f of FRACS) {
  const n = Math.max(20, Math.round(rec.e.length * f));
  const sub = rec.e.slice(0, n);
  const t = Date.now();
  const fit = await identifyTwin({ record: sub, simulate: sims.identifySim(wpath, n),
    space: SPACE, refine: 3 });
  const wall = (Date.now() - t) / 1000;
  // THE ORDER, not the winner. Two records that pick the same cell can still disagree about
  // every other cell, and it is the ORDERING a screen relies on: the screen keeps the top few
  // and throws the rest away, so a record that ranks differently throws away the right answer.
  const rank = fit.evals.filter((e) => Number.isFinite(e.J))
    .map((e) => ({ key: `${e.params.K}|${e.params.E}`, J: e.J }))
    .sort((a, b) => a.J - b.J).map((e) => e.key);
  let agree = '(reference)';
  if (full) {
    const common = rank.filter((k) => full.includes(k));
    // Spearman on the shared cells, which is what "ranks like the long one" has to mean.
    const n2 = common.length;
    let d2 = 0;
    for (const k of common) d2 += (common.indexOf(k) - full.filter((x) => common.includes(x)).indexOf(k)) ** 2;
    const rho = n2 > 2 ? 1 - (6 * d2) / (n2 * (n2 * n2 - 1)) : NaN;
    const top = rank[0] === full[0];
    agree = `rho ${rho.toFixed(3)}  top ${top ? 'SAME' : 'DIFFERENT'}`;
  } else full = rank;
  console.log(`  ${f.toFixed(3)}  ${String(n).padStart(7)}  ${String(fit.evals.length).padStart(5)}  `
    + `${wall.toFixed(1).padStart(6)}s  ${fit.params.K.toPrecision(4).padStart(7)}  `
    + `${fit.params.E.toPrecision(4).padStart(7)}  ${agree}`);
}
console.log(`\n  a shortcut is a claim about the ORDER, not about the winner: the screen keeps the`);
console.log(`  top few and discards the rest, so a record that ranks differently discards the`);
console.log(`  right answer. Same top cell AND a high rho is the bar.\n`);
