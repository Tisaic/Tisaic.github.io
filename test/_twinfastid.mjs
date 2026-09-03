// THE TWO EFFICIENCY LEVERS THE OWNER ASKED FOR, MEASURED BEFORE THE PAGE ADOPTS THEM.
// 1. SCREENED IDENTIFICATION: every grid cell is still visited (a thinned grid already
//    shipped a defect here) but on a 250-sample record first; only the best 8 pay full
//    length. Bar: the fitted K/E move less than 1% from the full search's — the screen
//    may only change the COST, never the answer.
// 2. FORWARD-DIFF OPERATOR PROBES: half the evals per cycle. Bar: the refined tile rms
//    after one cycle within ~3% of central's — the objective decides (rule 16).
import { identifyTwin, refineParams, compileTwin, refineCompiled, refineOperator } from '/home/user/Tisaic.github.io/lib/pilot/twin.js';
import { drivePath, twinResponse, armSimulators, toolProjection } from '/home/user/Tisaic.github.io/lib/flexisim/twin.js';
import { randomWander } from '/home/user/Tisaic.github.io/lib/flexisim/demopath.js';
const rig = await import('/home/user/Tisaic.github.io/test/pilot/rigs/arm-rig.mjs');
const { makeArm, mkPath, homeArm } = rig;
const SS = 9, PRE = 1500, SCREEN_N = 250;
const path = mkPath('sharp', 0.004);
const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const wpath = randomWander(mkRnd(301), 0.004, { centre: [12, 0], reach: 6 });
const destroy = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, p) => homeArm(m.arm, m.servo, p);
const KL = [0.25, 0.5, 1, 2, 4, 8, 16, 20, 32], EL = [0.03, 0.06, 0.10, 0.15, 0.22];

console.log('recording (900-sample wander at canonical)…');
const m0 = await makeArm();
homeArm(m0.arm, m0.servo, wpath);
const rec = await drivePath({ arm: m0.arm, servo: m0.servo, path: wpath, sample: SS, steps: 900 * SS });
await destroy(m0);
const sims = armSimulators({ buildArm: (p) => makeArm(p), destroyArm: destroy, home, sample: SS });
const idSim = sims.identifySim(wpath, 900);
const idSimShort = sims.identifySim(wpath, SCREEN_N);
const space = [{ name: 'K', values: KL }, { name: 'E', values: EL }];

const t0 = Date.now();
const full = await identifyTwin({ record: rec.e,
  simulate: (p) => idSim({ ...p, damp: 1e-3, bl: 0 }), space, refine: 2 });
const tFull = (Date.now() - t0) / 1000;
console.log(`FULL search: K=${full.params.K.toPrecision(4)} E=${full.params.E.toPrecision(4)} J=${full.J.toExponential(2)}  (${full.evals.length} full evals, ${tFull.toFixed(0)}s)`);

const t1 = Date.now();
const scr = await identifyTwin({ record: rec.e,
  simulate: (p) => idSim({ ...p, damp: 1e-3, bl: 0 }), space, refine: 2,
  screen: { record: rec.e.slice(0, SCREEN_N),
    simulate: (p) => idSimShort({ ...p, damp: 1e-3, bl: 0 }), keep: 8 } });
const tScr = (Date.now() - t1) / 1000;
console.log(`SCREENED   : K=${scr.params.K.toPrecision(4)} E=${scr.params.E.toPrecision(4)} J=${scr.J.toExponential(2)}  (${scr.evals.length} full evals, ${tScr.toFixed(0)}s, ${(tFull / tScr).toFixed(1)}x faster)`);
const dK = Math.abs(scr.params.K / full.params.K - 1), dE = Math.abs(scr.params.E / full.params.E - 1);
console.log(`screen parity: dK ${(100 * dK).toFixed(2)}% dE ${(100 * dE).toFixed(2)}%  ${dK < 0.01 && dE < 0.01 ? 'PASS (<1%)' : 'FAIL — the screen moved the answer'}`);

// ---- operator probes: central vs forward, one cycle each on the same artifact ------
console.log('compile + shipped refine for the operator A/B…');
const H = await twinResponse({ buildArm: () => makeArm(), destroyArm: destroy, path, sample: SS });
const res = await compileTwin({ simulate: sims.compileSim(path, { laps: 5, preRoll: PRE }), H, iters: 11 });
const ref = await refineCompiled({ simulate: sims.compileSim(path, { laps: 4, preRoll: PRE }),
  H, du: res.du, sample: SS, lapSteps: path.lap, preRoll: PRE });
const project = await toolProjection({ buildArm: () => makeArm(), destroyArm: destroy, path });
const runOp = async (diff) => {
  const t = Date.now();
  const op = await refineOperator({
    simulate: sims.compileSim(path, { laps: 4, preRoll: PRE }),
    f: ref.f, sample: SS, lapSteps: path.lap, preRoll: PRE,
    cycles: 1, steps: 4, diff, project });
  return { rms: op.report.rms, evals: op.report.evals, s: (Date.now() - t) / 1000 };
};
const cen = await runOp('central');
console.log(`central: rms ${cen.rms.toExponential(3)} in ${cen.evals} evals (${cen.s.toFixed(0)}s)`);
const fwd = await runOp('forward');
console.log(`forward: rms ${fwd.rms.toExponential(3)} in ${fwd.evals} evals (${fwd.s.toFixed(0)}s, ${(cen.s / fwd.s).toFixed(1)}x faster)`);
const dOp = fwd.rms / cen.rms - 1;
console.log(`operator parity: forward is ${(100 * dOp).toFixed(1)}% ${dOp >= 0 ? 'worse' : 'better'}  ${dOp < 0.03 ? 'PASS (<3%)' : 'FAIL — forward loses too much'}`);
console.log('EXIT 0');
