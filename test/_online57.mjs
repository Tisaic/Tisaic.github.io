/**
 * @file THE ONE SURVIVING LEVER, ON THE ONE DENOMINATOR — gated online adaptation, scored on
 * contour at the cell every other number in this arc was taken at.
 *
 * WHAT IS LEFT AFTER THREE FALSIFICATIONS. The compiled twin reaches 123x but its artifact is
 * lap-indexed (a path table) and its identification searches gearbox stiffness and link modulus
 * (plant knowledge), so it fails two standing constraints independently. Running the twin online
 * is 5.4x slower than the machine. A recursive state-space forecast, run as a deployable
 * simulator with no truth injected, reads elbow 0.369 against the shipped FIR bank's 0.840 —
 * worse, and the long-memory framing that motivated it does not survive its own test.
 *
 * WHAT SURVIVED IS A NUMBER RATHER THAN A HYPOTHESIS. The same experiment measured the elbow at
 * 0.369 WITHOUT the tracker and 0.999 WITH it, on a program never seen. On a machine that is
 * scored exactly as well as it is predicted, that is what a permanent tracker is worth — and it
 * is admissible: truth is an INSTALLATION property the report states (permanent /
 * guided-then-removed / absent), never an assumption, and asking whether a tracker stays wired
 * is not asking the engineer anything about the plant.
 *
 * AND THE MACHINERY EXISTS AND IS MEASURED — arm +29%, tank +18%, EMPS 14.8x -> 55.5x with the
 * truth REMOVED at lap 4 and the bank frozen — but NEVER ON CONTOUR AT THIS CELL. Every one of
 * those figures is on a different objective or a different plant, which is precisely the state
 * that hid the twin-versus-pilot comparison until it was put on one denominator.
 *
 * THE THREE INSTALLATIONS ARE SCORED SIDE BY SIDE, because the choice between them is the
 * product decision and a single number cannot express it:
 *   static             — the shipped configuration, truth at commissioning only
 *   guided-then-frozen — truth for the early laps, then removed and the bank frozen
 *   permanent          — truth stays wired
 *
 * WHAT WOULD KILL IT: adaptation no better than static on contour here. The law says it
 * MULTIPLIES a model the verify already vouched for and does nothing for a broken one, and this
 * cell's pilot deploys at 2.87x, so it is on the side of the law where it should work — a null
 * would mean the law does not hold on this objective.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_online57.mjs
 */
import { commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const HELD = process.env.HELD || 'circle';
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);

console.log(`\nthe surviving lever on one denominator — K ${PG.K} / E ${PG.E}, `
  + `${SHAPE} at feed ${FEED.toExponential(1)}, held out on ${HELD}\n`);

const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED } });
console.log(`  commissioned: verdict ${p.verdict.deploy ? 'DEPLOYS' : 'REFUSES'}, `
  + `r2Lead0 ${p.status().report.readouts.map((r) => r.r2Lead0.toFixed(3)).join(' / ')}`);

// THE INSTALLATIONS. `truthUntilLap` is the rig's own switch for how long the tracker stays,
// so the three rows differ in ONE thing and it is the thing the product decision is about.
// `online` is set on the pilot rather than at construction so all three rows share ONE
// commissioned model — the static row is then the control that must reproduce the shipped
// number, and any drift in it is a fault in this harness rather than a result (rule 21).
// ONLY ONE OF THESE IS ADMISSIBLE AT DEPLOY and the constraint is the owner's: the tracker may
// be used during COMMISSIONING ONLY. The two adapting rows below are kept because they bound
// what adaptation is worth, and they are labelled as inadmissible rather than quietly dropped —
// a number that cannot ship is still evidence about where the benefit lives.
const RUNS = [
  ['static (ships)', null, Infinity],
  ['[X] guided at deploy', {}, 2],
  ['[X] permanent truth', {}, Infinity],
];
const saved = p.online;
console.log(`\n  installation           program                        held-out ${HELD}`);
console.log(`  ${''.padEnd(22)} total      contour    x        total      contour    x`);
let base = null, baseH = null;
for (const [name, online, untilLap] of RUNS) {
  p.online = online ? { ...(saved || {}), ...online } : null;
  const off = base ? null : await deployOn(p, SHAPE, false, FEED);
  if (off) base = off.r.totalRms;
  const offH = baseH ? null : await deployOn(p, HELD, false, FEED);
  if (offH) baseH = offH.r.totalRms;
  const r = await deployOn(p, SHAPE, p.verdict.deploy, FEED, { truthUntilLap: untilLap });
  const h = await deployOn(p, HELD, p.verdict.deploy, FEED, { truthUntilLap: untilLap });
  console.log(`  ${name.padEnd(22)} ${r.r.totalRms.toExponential(3)}  `
    + `${r.r.contourRms.toExponential(3)}  ${(base / r.r.totalRms).toFixed(2)}x    `
    + `${h.r.totalRms.toExponential(3)}  ${h.r.contourRms.toExponential(3)}  `
    + `${(baseH / h.r.totalRms).toFixed(2)}x`);
}
p.online = saved;

// THE ADMISSIBLE VERSION: adapt during COMMISSIONING, freeze, deploy with no tracker at all.
//
// The gain above is not the tracker being present while the machine produces — it is that a
// couple of laps of truth find a better model than the scribble fit does. Commissioning is
// exactly when truth is allowed, so the same physical thing is legal if it happens there: fit
// on the scribble, run a program with the tracker still attached, adapt, FREEZE, unwire the
// tracker, deploy. The engineer already supplies a representative program for `verifyRef`, and
// `demopath.js` designs one when none is given, so this asks for nothing new.
//
// The scoring is what the last table got wrong: the held-out row there had two laps of truth ON
// THE HELD-OUT PROGRAM, so it was not a transfer at all. Here the adaptation happens once, on
// the commissioning program, and the held-out program is then scored with `truthUntilLap: 0` —
// no truth, ever, on a program the adapted model has never run.
console.log(`\n  --- adapt at COMMISSIONING, freeze, deploy with no tracker ---`);
p.online = { ...(saved || {}) };
const guided = await deployOn(p, SHAPE, p.verdict.deploy, FEED, { truthUntilLap: Infinity });
p.online = null;                       // FROZEN: the tracker comes off here and never returns
const frozenProg = await deployOn(p, SHAPE, p.verdict.deploy, FEED, { truthUntilLap: 0 });
const frozenHeld = await deployOn(p, HELD, p.verdict.deploy, FEED, { truthUntilLap: 0 });
console.log(`  ${'adapted then FROZEN'.padEnd(22)} ${frozenProg.r.totalRms.toExponential(3)}  `
  + `${frozenProg.r.contourRms.toExponential(3)}  ${(base / frozenProg.r.totalRms).toFixed(2)}x    `
  + `${frozenHeld.r.totalRms.toExponential(3)}  ${frozenHeld.r.contourRms.toExponential(3)}  `
  + `${(baseH / frozenHeld.r.totalRms).toFixed(2)}x`);
console.log(`  (the guided commissioning lap itself measured `
  + `${guided.r.totalRms.toExponential(3)}, and is not a deployable score)`);
console.log(`\n  open loop              ${base.toExponential(3)}`
  + `${''.padEnd(23)}${baseH.toExponential(3)}`);
console.log(`\n  the held-out column is the one that matters: a correction that only pays on the`);
console.log(`  program it adapted on is a memory however it is implemented.\n`);
