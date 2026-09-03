/**
 * @file THE COMPILED TWIN, PINNED (plan §42): identify → compile → lap-1 apply, through
 * the plant-AGNOSTIC core (`lib/pilot/twin.js`) and the arm adapter
 * (`lib/flexisim/twin.js`), on the pilot rig's arm.
 *
 * The three claims, each two-sided (rule 9):
 *  1) IDENTIFY: output error on ONE wander record (tracker data, no program knowledge)
 *     recovers K and E from a grid spanning the WHOLE slider domain — within the §42
 *     stage-B tolerance (E ~5%, K ~10%). The core never sees the true settings; the
 *     unbuildable corner of the domain (the elastic CFL refusal) is a recorded refusal.
 *  2) COMPILE + LAP 1: the program compiled through the FITTED twin, applied to the
 *     true machine from a pre-roll, delivers a FIRST LAP at least 8x below the open
 *     loop on both channels (measured ceiling: 53x/9.5x on rounded).
 *  3) MISMATCH IS OBSERVABLE, NOT HIDDEN: the same compiled correction applied to a
 *     DIFFERENT machine (E −20%) degrades — the number the app's slider experiment
 *     shows — while still not doing worse than that machine's own open loop.
 *
 * Full tier only: one wander record + a ~40-evaluation identification + a compile.
 */
import { identifyTwin, refineParams, compileTwin, applyCompiled, refineCompiled,
  refineOperator } from '../../lib/pilot/twin.js';
import { drivePath, twinResponse, armSimulators, toolProjection } from '../../lib/flexisim/twin.js';
import { randomWander } from '../../lib/flexisim/demopath.js';

const rig = await import('../pilot/rigs/arm-rig.mjs');
const { PG, makeArm, mkPath, homeArm } = rig;
const TRUE_K = PG.K, TRUE_E = PG.E;
const SS = 9;

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

let fitted = { K: TRUE_K, E: TRUE_E };   // overwritten by identification before compiling
// the rig's own constructor with parameter overrides (rule 61: one constructor) —
// candidates carry K/E and, since the §43 four-parameter fit, damping and backlash too
const buildArm = async (params) => makeArm(params || fitted);
const destroyArm = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };
const home = async (m, path) => homeArm(m.arm, m.servo, path);
const sims = armSimulators({ buildArm, destroyArm, home, sample: SS });

const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const wpath = randomWander(mkRnd(301), 0.004, { centre: PG.centre });

// the record: the TRUE machine over the wander, truth recorded (commissioning, tracker)
console.log('recording the wander on the true machine…');
const real = await makeArm();
homeArm(real.arm, real.servo, wpath);
const { e: record } = await drivePath({ arm: real.arm, servo: real.servo, path: wpath,
  sample: SS, steps: Math.ceil(wpath.lap) });
await destroyArm(real);
console.log(`  ${record.length} samples`);

// 1) identification over the sliders' whole domain, plus one unbuildable value so the
// refusal path is exercised (E=0.30 exceeds the lattice's elastic CFL limit)
console.log('identifying…');
const fit = await identifyTwin({
  record,
  simulate: sims.identifySim(wpath, record.length),
  space: [
    { name: 'K', values: [0.25, 1, 4, 16] },
    { name: 'E', values: [0.03, 0.06, 0.10, 0.15, 0.30] },
  ],
  refine: 3,
  onProgress: (m) => console.log(`  ${m}`),
});
fitted = { K: fit.params.K, E: fit.params.E };
console.log(`identified K=${fitted.K.toPrecision(4)} (true ${TRUE_K}), E=${fitted.E.toPrecision(4)} (true ${TRUE_E}), J=${fit.J.toExponential(2)}`);
check('identified K within 10%', Math.abs(fitted.K - TRUE_K) <= 0.10 * TRUE_K, `${fitted.K}`);
check('identified E within 5%', Math.abs(fitted.E - TRUE_E) <= 0.05 * TRUE_E, `${fitted.E}`);
check('the unbuildable corner was refused, not crashed',
  fit.evals.some((ev) => ev.refused), `${fit.evals.filter((ev) => ev.refused).length} refusals`);

// 2) compile rounded through the fitted twin; apply on the true machine
const path = mkPath('rounded', 0.004);
console.log('measuring the fitted twin response…');
const H = await twinResponse({ buildArm, destroyArm, path, sample: SS });
console.log('compiling…');
const PRE = 1500;
const compiled = await compileTwin({
  simulate: sims.compileSim(path, { laps: 3, preRoll: PRE }),
  H, iters: 11,
  onProgress: (m) => console.log(`  ${m}`),
});
const runOn = async (K, E, du) => {
  const m = await buildArm({ K, E });
  homeArm(m.arm, m.servo, path);
  const out = await drivePath({ arm: m.arm, servo: m.servo, path, sample: SS,
    steps: Math.ceil(path.lap * 3), du, preRoll: du ? PRE : 0 });
  await destroyArm(m);
  return out.perLap;
};
const open = await runOn(TRUE_K, TRUE_E, null);
const laps = await runOn(TRUE_K, TRUE_E, compiled.du);
console.log(`open loop settled: ${open.at(-1)[0].toExponential(2)}/${open.at(-1)[1].toExponential(2)}`);
laps.forEach((p, i) => console.log(`compiled lap ${i + 1}: ${p[0].toExponential(2)}/${p[1].toExponential(2)}`));
check('LAP 1 at least 8x below the open loop, both channels',
  laps[0][0] < open.at(-1)[0] / 8 && laps[0][1] < open.at(-1)[1] / 8,
  `${laps[0][0].toExponential(2)}/${laps[0][1].toExponential(2)}`);
check('lap 1 equals the settled laps (within 2.5x — the pre-roll holds)',
  laps[0][0] < laps.at(-1)[0] * 2.5 + 1e-9 && laps[0][1] < laps.at(-1)[1] * 2.5 + 1e-9);

// 3) the mismatch experiment the app exposes: same compiled du, softer machine
const soft = await runOn(TRUE_K, TRUE_E * 0.8, compiled.du);
const openSoft = await runOn(TRUE_K, TRUE_E * 0.8, null);
console.log(`E−20% machine: open ${openSoft.at(-1)[0].toExponential(2)}/${openSoft.at(-1)[1].toExponential(2)}  compiled L1 ${soft[0][0].toExponential(2)}/${soft[0][1].toExponential(2)}`);
check('mismatch degrades the compiled machine (observable)',
  soft[0][0] > laps[0][0] * 2 || soft[0][1] > laps[0][1] * 2,
  `${soft[0][0].toExponential(2)}/${soft[0][1].toExponential(2)} vs ${laps[0][0].toExponential(2)}/${laps[0][1].toExponential(2)}`);
check('and still not worse than that machine\'s own open loop',
  soft[0][0] < openSoft.at(-1)[0] * 1.2 && soft[0][1] < openSoft.at(-1)[1] * 1.2);

// 3b) THE TAIL, DRIVEN PAST THE COMPILED SPAN — the owner's second field defect. The
// artifact holds pre-roll + 3 laps; production runs longer, and the first accessor tiled
// the settled lap by a ROUNDED sample count against the FRACTIONAL true lap: a
// 0.4-sample-per-lap phase slip plus a du step at one fixed lap phase — measured 16.6x
// the lap median AT THE START CORNER, exactly where the owner saw it, with per-lap rms
// climbing 4.6e-3 → 5.3e-3. Eight laps THROUGH THE ACCESSOR (the form the page runs),
// both halves asserted: no phase bin spikes, and no lap-over-lap growth.
console.log('driving 8 laps through the compiled accessor (the tail check)…');
const acc = applyCompiled({ du: compiled.du, sample: SS, lapSteps: path.lap, preRoll: PRE });
const mTail = await buildArm({ K: TRUE_K, E: TRUE_E });
homeArm(mTail.arm, mTail.servo, path);
const tail8 = await drivePath({ arm: mTail.arm, servo: mTail.servo, path, sample: SS,
  steps: Math.ceil(path.lap * 8), du: acc, preRoll: PRE });
await destroyArm(mTail);
{
  const L = Math.round(path.lap / SS);
  const lapR = tail8.perLap.map((p) => Math.hypot(p[0], p[1]));
  console.log(`  per-lap rms: ${lapR.map((v) => v.toExponential(1)).join(' ')}`);
  const bins = Array.from({ length: 20 }, () => ({ s: 0, n: 0 }));
  for (let i = 2 * L; i < tail8.e.length; i++) {
    const ph = ((i * SS) % path.lap) / path.lap;
    const b = Math.min(19, Math.floor(ph * 20));
    bins[b].s += tail8.e[i][0] ** 2 + tail8.e[i][1] ** 2; bins[b].n++;
  }
  const prof = bins.map((b) => Math.sqrt(b.s / Math.max(1, b.n)));
  const worst = Math.max(...prof), med = [...prof].sort((a, b2) => a - b2)[10];
  console.log(`  phase bins (laps 3+): worst ${worst.toExponential(2)} vs median ${med.toExponential(2)} (${(worst / med).toFixed(1)}x)`);
  check('no lap-phase hotspot past the compiled span (the start-corner seam is gone)',
    worst < 3.5 * med, `${(worst / med).toFixed(1)}x`);
  check('no lap-over-lap drift in the tail (the phase slip is gone)',
    lapR.at(-1) < lapR[2] * 1.5,
    `lap3 ${lapR[2].toExponential(2)} -> lap8 ${lapR.at(-1).toExponential(2)}`);
  check('the tail laps hold the compiled accuracy (within 2x of lap 2)',
    lapR.at(-1) < lapR[1] * 2, `${lapR.at(-1).toExponential(2)} vs ${lapR[1].toExponential(2)}`);
}

// 4) THE PHONE'S FIELD DEFECT, PINNED: on a SOFT machine (K=1, E=0.06) the page's
// commissioning identified K̂=1.47/Ê=0.0525 — because its coarse grid THINNED the
// ladders, dropping E=0.06, and the refinement rings walked into the K/E compensation
// valley instead of back to truth. A stiff-only test passed before and after that bug,
// which is why it shipped. This phase identifies the soft machine over the page's FULL
// ladders on the page's own 900-sample record length and demands exactness.
// The record length is 900 samples where the page ships 1500 — shrunk against the
// assertion's own margin (rule 2): the longer record moved E 0.8% → 0.2% on the
// canonical cell, far inside this phase's 5% bar, and the protocol under test — grid
// at guesses, then coordinate descent over all four — is the page's exactly.
console.log('soft-machine STAGED identification (the page protocol: grid at guesses, then 4-param descent)…');
const SOFT_K = 1, SOFT_E = 0.06;
const softM = await makeArm({ K: SOFT_K, E: SOFT_E });
homeArm(softM.arm, softM.servo, wpath);
const softRec = await drivePath({ arm: softM.arm, servo: softM.servo, path: wpath,
  sample: SS, steps: 900 * SS });
await destroyArm(softM);
const softSims = armSimulators({ buildArm, destroyArm,
  home: async (m, path) => homeArm(m.arm, m.servo, path), sample: SS });
const softIdSim = softSims.identifySim(wpath, 900);
const softGrid = await identifyTwin({
  record: softRec.e,
  simulate: (p) => softIdSim({ ...p, damp: 1e-3, bl: 0 }),
  space: [
    { name: 'K', values: [0.25, 0.5, 1, 2, 4, 8, 16, 20, 32] },
    { name: 'E', values: [0.03, 0.06, 0.10, 0.15, 0.22] },
  ],
  refine: 2,
});
console.log(`  grid (damp/bl guessed): K=${softGrid.params.K.toPrecision(4)} E=${softGrid.params.E.toPrecision(4)} J=${softGrid.J.toExponential(2)}`);
const softFit = await refineParams({
  record: softRec.e,
  simulate: softIdSim,
  params: { K: softGrid.params.K, E: softGrid.params.E, damp: 1e-3, bl: 5e-5 },
  keys: [{ name: 'damp', factor: 3 }, { name: 'bl', factor: 3 },
    { name: 'K', factor: 1.15 }, { name: 'E', factor: 1.08 }],
  rounds: 2, shrink: [1.04],
});
console.log(`soft machine identified K=${softFit.params.K.toPrecision(4)} E=${softFit.params.E.toPrecision(4)} `
  + `damp=${softFit.params.damp.toExponential(2)} bl=${softFit.params.bl.toExponential(2)} J=${softFit.J.toExponential(2)}`);
check('the staged fit recovers K and E over the full page ladders',
  Math.abs(softFit.params.K - SOFT_K) <= 0.05 * SOFT_K
  && Math.abs(softFit.params.E - SOFT_E) <= 0.05 * SOFT_E,
  `${softFit.params.K}/${softFit.params.E}`);
check('…and the link damping, never told to it, within a factor of two',
  softFit.params.damp > 1.5e-3 && softFit.params.damp < 6e-3,
  `${softFit.params.damp.toExponential(2)} vs true 3e-3`);

// 5) THE SOFT MACHINE'S DELIVERY, IN THE PAGE'S SHIPPED CONFIG — the mode-⑨/⑩ trace's
// fix, pinned. The stiff machine's tail (3b) passed while the soft machine delivered
// 1.26e-1: compileTwin's finite-window du never becomes periodic (its consecutive-lap
// difference PLATEAUS — 6.5e-2 → 2.4e-2 → 3.0e-2 here — instead of settling), so tiling
// any lap of it injects that difference every lap, and a longer compile alone only
// reached 5.6e-2. The page now compiles laps 5 and REFINES the steady tile at lap
// harmonics against the tiled delivery (refineCompiled); this phase runs exactly that
// on K=1/E=0.06 and demands the delivery the bench measured (tail 4.3e-3 contour,
// joint 2.8e-4/5.2e-4, against an open loop of 4.5e-2/1.5e-2).
console.log('soft-machine delivery in the shipped config (laps 5 + refineCompiled)…');
fitted = { ...softFit.params };   // all four — the compile runs at the FITTED machine
const softPath = mkPath('rounded', 0.004);
const softH = await twinResponse({ buildArm, destroyArm, path: softPath, sample: SS });
const softCompiled = await compileTwin({
  simulate: softSims.compileSim(softPath, { laps: 5, preRoll: PRE }),
  H: softH, iters: 11,
  onProgress: (m) => console.log(`  ${m}`),
});
const softRef = await refineCompiled({
  simulate: softSims.compileSim(softPath, { laps: 4, preRoll: PRE }),
  H: softH, du: softCompiled.du, sample: SS, lapSteps: softPath.lap, preRoll: PRE,
  onProgress: (m) => console.log(`  ${m}`),
});
check('the refined tile improves on the unrefined one (the refine is live)',
  softRef.report.rms < softRef.report.openRms,
  `${softRef.report.openRms.toExponential(2)} → ${softRef.report.rms.toExponential(2)}`);
const softDrive = async (du) => {
  const m = await buildArm({ K: SOFT_K, E: SOFT_E });
  homeArm(m.arm, m.servo, softPath);
  const out = await drivePath({ arm: m.arm, servo: m.servo, path: softPath, sample: SS,
    steps: Math.ceil(softPath.lap * (du ? 8 : 2)), du, preRoll: du ? PRE : 0 });
  await destroyArm(m);
  return out.perLap.map((p) => Math.hypot(p[0], p[1]));
};
const softOpen8 = await softDrive(null);
const softLaps = await softDrive(softRef.f);
console.log(`  soft open: ${softOpen8.map((v) => v.toExponential(1)).join(' ')}`);
console.log(`  soft ⑩   : ${softLaps.map((v) => v.toExponential(1)).join(' ')}`);
check('soft lap 1 at least 8x below the soft open loop',
  softLaps[0] < softOpen8.at(-1) / 8,
  `${softLaps[0].toExponential(2)} vs open ${softOpen8.at(-1).toExponential(2)}`);
check('the soft tail holds at least 15x below the soft open loop',
  softLaps.at(-1) < softOpen8.at(-1) / 15,
  `${softLaps.at(-1).toExponential(2)}`);
check('no lap-over-lap drift in the soft tail',
  softLaps.at(-1) < softLaps[2] * 1.5,
  `lap3 ${softLaps[2].toExponential(2)} -> lap8 ${softLaps.at(-1).toExponential(2)}`);

// 6) THE OPERATOR REFINE (plan §43: 44.0x → 53.6x at the canonical cell in Node). The
// frequency refine assumes one lap-invariant response; refineOperator measures the
// tile's own lap-varying response by hat probes and Gauss-Newtons the whole tile in
// TOOL space through the adapter's projection. Reduced scale here against the
// assertion's own margin (rule 2): 4 nodes, 1 cycle, 2 steps is ~20 sim evals and the
// contract is the PROPERTY, both halves (rule 9) — the projected residual falls, AND
// the delivered tail does not regress against phase 5's (a sim-only gain that costs
// the machine is exactly the rule-21 failure this stage's holdout exists to catch).
console.log('operator refine at reduced scale (4 nodes, 1 cycle, 2 steps)…');
const softProject = await toolProjection({ buildArm, destroyArm, path: softPath });
const softOp = await refineOperator({
  simulate: softSims.compileSim(softPath, { laps: 4, preRoll: PRE }),
  f: softRef.f, sample: SS, lapSteps: softPath.lap, preRoll: PRE,
  nodes: 4, cycles: 1, steps: 2, project: softProject,
  onProgress: (m) => console.log(`  ${m}`),
});
check('the operator refine reduces the projected residual',
  softOp.report.rms < softOp.report.rms0,
  `${softOp.report.rms0.toExponential(2)} → ${softOp.report.rms.toExponential(2)} in ${softOp.report.evals} evals`);
const softOpLaps = await softDrive(softOp.f);
console.log(`  soft ⑩+op: ${softOpLaps.map((v) => v.toExponential(1)).join(' ')}`);
check('the operator-refined delivery does not regress the tail (rule 21 guard)',
  softOpLaps.at(-1) < softLaps.at(-1) * 1.05,
  `${softOpLaps.at(-1).toExponential(2)} vs ${softLaps.at(-1).toExponential(2)}`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
