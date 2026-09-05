/**
 * @file THE 57x, ON ONE DENOMINATOR — every method this project has, one machine, one program,
 * one metric.
 *
 * WHERE THE NUMBER COMES FROM. Mode 9's own report, run at K 0.25 / E 0.03 on the rounded
 * rectangle: the cascade leaves 2.4933e-1, and a lap-harmonic table fitted ON THE
 * CASCADE-DEPLOYED machine reaches 4.39e-3 at nh 16, capturing 100% of the band. So 57x of the
 * error the model leaves is still LAP-REPEATABLE — perfectly predictable, and invisible to the
 * model. That gap is the whole product problem: the memory gets it and the plant model does not.
 *
 * AND ONE METHOD HERE MAY ALREADY CLOSE IT WITHOUT BEING A MEMORY. Mode 10's compiled twin is a
 * SIMULATION — it propagates state instead of windowing it, which is why plan §41's twenty
 * falsifiers point at it: the elbow's measured memory is 6363-8649 steps, LONGER than a program
 * lap, so windowed features truncate it and closed paths alias it, and no basis or authority
 * fixes a window that cannot reach the mode. It delivers 44.5x at the canonical cell with zero
 * machine laps and zero tracker at load.
 *
 * BUT THE TWO HAVE NEVER BEEN MEASURED AGAINST EACH OTHER. `drivePath` scored JOINT rms and the
 * pilot scores CONTOUR, so mode 10 has never stood on the denominator every pilot number in this
 * project uses, and the comparison has only ever been made in prose — which is exactly the state
 * `reconcile.test.mjs` was built to end for mode 8, where putting one baseline under everything
 * moved the pilot's own number from 4.22x to 5.70x.
 *
 * So this scores, on ONE machine and ONE program, against ONE open loop:
 *   - the open loop
 *   - the pilot cascade (what mode 9 ships as its transferable layer)
 *   - the compiled twin (mode 10), through the SHARED drive loop's observer rather than a
 *     second copy of this arm's routing (rule 61: three copies have each shipped a defect)
 *
 * WHAT WOULD MAKE THIS A NULL: the twin scoring no better than the cascade on contour. Then its
 * 44.5x is an artefact of the joint-space objective it was measured on, the two objectives
 * disagree about what this machine's error IS, and that disagreement is the finding.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_denominator.mjs
 */
import { ContourScore, decompose } from '../lib/flexisim/contour.js';
// The AGNOSTIC core and the ARM's adapter are different modules and the split is the point:
// `lib/pilot/twin.js` knows no plant, `lib/flexisim/twin.js` is the arm's wiring.
import { identifyTwin, compileTwin } from '../lib/pilot/twin.js';
import { drivePath, armSimulators, twinResponse } from '../lib/flexisim/twin.js';
import { randomWander } from '../lib/flexisim/demopath.js';
import { PG, makeArm, mkPath, homeArm, commissionArm, deployOn } from './pilot/rigs/arm-rig.mjs';

const SHAPE = process.env.SHAPE || 'rounded';
const FEED = +(process.env.FEED || 4e-3);
const UCAP = +(process.env.UCAP || 0.6);
const SS = 9, PRE = 1500;
const path = mkPath(SHAPE, FEED);

// `fitted` starts at the truth and is OVERWRITTEN by the identification before the compile, so
// the simulators build the FITTED twin while `scoreTwin` always builds the true machine — the
// distinction the whole mode is about, and one a single default would quietly collapse.
let fitted = { K: PG.K, E: PG.E };
const buildArm = async (params) => makeArm(params || fitted);
const buildTrue = async () => makeArm({ K: PG.K, E: PG.E });
const destroyArm = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);
const sims = armSimulators({ buildArm, destroyArm, home, sample: SS });

// SCORED THROUGH THE RIG'S OWN METRIC, fed by the shared drive loop's observer. `decompose` and
// `ContourScore` are the same objects `deployOn` uses, so the twin's row and the pilot's row are
// the same measurement and not two that agree by inspection.
const scoreTwin = async (du) => {
  const m = await buildTrue();
  homeArm(m.arm, m.servo, path);
  const sc = new ContourScore({ joints: 2, reversalTravel: 2e-2 });
  // SCORE THE SETTLED LAPS, not the first. Lap 0 starts the machine at rest on a program that
  // demands motion immediately and that transient belongs in its own column (rules 13, 25).
  const skip = Math.ceil(path.lap);
  await drivePath({ arm: m.arm, servo: m.servo, path, sample: SS,
    steps: Math.ceil(path.lap * 3), du, preRoll: du ? PRE : 0,
    observe: ({ k, pt, tau }) => {
      if (k < skip) return;
      // `pt` — the commanded PATH POINT, which is what `decompose` reads `s` from. Handed the
      // joint pose instead it returns a believable contour and a NaN lag (measured, first run).
      if (!pt) return;
      const dec = decompose(path, m.arm.toolXY(), pt);
      sc.step(dec.contour, dec.lag, tau, [m.arm.j1.wM, m.arm.j2.wM]);
    } });
  const r = sc.report();
  await destroyArm(m);
  return r;
};

console.log(`\nthe 57x on one denominator — K ${PG.K} / E ${PG.E}, ${SHAPE} at `
  + `feed ${FEED.toExponential(1)}\n`);

const open = await scoreTwin(null);
console.log(`  open loop                total ${open.totalRms.toExponential(4)}  `
  + `contour ${open.contourRms.toExponential(4)}`);

// THE PILOT, through the rig — the same call every pilot number on this arm comes from.
const p = await commissionArm({ seed: 1, uCap: UCAP, train: { shape: SHAPE, feed: FEED } });
const pOff = await deployOn(p, SHAPE, false, FEED);
const pOn = await deployOn(p, SHAPE, p.verdict.deploy, FEED);
console.log(`  pilot, rig's own scoring  open ${pOff.r.totalRms.toExponential(4)} -> `
  + `${pOn.r.totalRms.toExponential(4)}  (${(pOff.r.totalRms / pOn.r.totalRms).toFixed(2)}x)`);

// THE TWIN: identify from ONE wander on the true machine, compile in software, apply.
const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const wpath = randomWander(mkRnd(301), 0.004, { centre: PG.centre });
console.log(`\n  identifying the twin from one wander…`);
const real = await buildTrue();
homeArm(real.arm, real.servo, wpath);
const rec = await drivePath({ arm: real.arm, servo: real.servo, path: wpath, sample: SS,
  steps: Math.ceil(wpath.lap) });
await destroyArm(real);
// THE SPACE IS THE SLIDERS' OWN DOMAINS, never the true values (plan §42: identification is
// over the ladder an operator can actually select, and a grid seeded at the answer measures
// nothing). `fitted` then drives the compile, so the twin is IDENTIFIED rather than given.
const fit = await identifyTwin({
  record: rec.e,
  simulate: sims.identifySim(wpath, rec.e.length),
  space: [
    { name: 'K', values: [0.25, 1, 4, 16] },
    { name: 'E', values: [0.03, 0.06, 0.10, 0.15] },
  ],
  refine: 3,
  onProgress: (m) => console.log(`    ${m}`),
});
fitted = { K: fit.params.K, E: fit.params.E };
console.log(`  identified K=${fitted.K.toPrecision(4)} (true ${PG.K}) `
  + `E=${fitted.E.toPrecision(4)} (true ${PG.E})  J=${fit.J.toExponential(2)}`);

// THE RESPONSE IS MEASURED ON THE FITTED TWIN, not the true machine — `buildArm` follows
// `fitted`, which the identification has just overwritten. That is the whole claim of the mode:
// zero machine laps past the one commissioning wander.
console.log(`  measuring the fitted twin's response…`);
const H = await twinResponse({ buildArm, destroyArm, path, sample: SS });
console.log(`  compiling the program through the fitted twin…`);
const compiled = await compileTwin({ simulate: sims.compileSim(path, { laps: 3, preRoll: PRE }),
  H, iters: 11, onProgress: (m) => console.log(`    ${m}`) });
const tw = await scoreTwin(compiled.du);
console.log(`\n  compiled twin (mode 10)   total ${tw.totalRms.toExponential(4)}  `
  + `contour ${tw.contourRms.toExponential(4)}  `
  + `(${(open.totalRms / tw.totalRms).toFixed(2)}x on total)`);
console.log(`\n  the pilot's rows and the twin's row are the SAME metric object fed from the`);
console.log(`  same drive loop, so the comparison is one measurement rather than two.\n`);
