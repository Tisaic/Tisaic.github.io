/**
 * @file THE COMPILED TWIN, PINNED (plan §42): identify → compile → lap-1 apply, through
 * `lib/flexisim/twin.js`, on the pilot rig's arm.
 *
 * The three claims, each two-sided (rule 9):
 *  1) IDENTIFY: output error on ONE wander record (tracker data, no program knowledge)
 *     recovers K and E from a grid spanning the WHOLE slider domain — within the §42
 *     stage-B tolerance (E ~5%, K ~10%), with the objective's minimum well separated.
 *  2) COMPILE + LAP 1: the program compiled through the FITTED twin, applied to the
 *     true machine from a pre-roll, delivers a FIRST LAP at least 8x below the open
 *     loop on both channels (measured ceiling: 53x/9.5x on rounded).
 *  3) MISMATCH IS OBSERVABLE, NOT HIDDEN: the same compiled correction applied to a
 *     DIFFERENT machine (E −20%) degrades — the number the app's slider experiment
 *     shows — while still not doing worse than that machine's own open loop.
 *
 * Full tier only: one wander record + a ~40-evaluation identification + a compile.
 */
import { identifyTwin, compileTwin, twinResponse, drivePath } from '../../lib/flexisim/twin.js';
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

const buildAt = (K, E) => async () => {
  PG.K = K; PG.E = E;
  const m = await makeArm();
  PG.K = TRUE_K; PG.E = TRUE_E;
  return m;
};
const destroyArm = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };

const mkRnd = (s) => { let z = s >>> 0; return () => (z = (z * 1664525 + 1013904223) >>> 0) / 4294967296; };
const wpath = randomWander(mkRnd(301), 0.004, { centre: PG.centre });

// the record: the TRUE machine driven over the wander, truth recorded (commissioning)
console.log('recording the wander on the true machine…');
const real = await makeArm();
homeArm(real.arm, real.servo, wpath);
const record = await drivePath({ arm: real.arm, servo: real.servo, path: wpath,
  sample: SS, steps: Math.ceil(wpath.lap) });
await destroyArm(real);
console.log(`  ${record.e.length} samples`);

// 1) identification over the sliders' whole domain (nothing read from the machine)
console.log('identifying…');
const fit = await identifyTwin({
  record, path: wpath, sample: SS,
  buildArm: ({ K, E }) => buildAt(K, E)(),
  destroyArm,
  grid: { K: [1, 4, 16, 32], E: [0.03, 0.06, 0.15, 0.30] },
  refine: 3,
  onProgress: (m) => console.log(`  ${m}`),
});
console.log(`identified K=${fit.K.toPrecision(4)} (true ${TRUE_K}), E=${fit.E.toPrecision(4)} (true ${TRUE_E}), J=${fit.J.toExponential(2)}`);
check('identified K within 10%', Math.abs(fit.K - TRUE_K) <= 0.10 * TRUE_K, `${fit.K}`);
check('identified E within 5%', Math.abs(fit.E - TRUE_E) <= 0.05 * TRUE_E, `${fit.E}`);

// 2) compile rounded through the fitted twin; apply on the true machine
const path = mkPath('rounded', 0.004);
console.log('measuring the fitted twin response…');
const H = await twinResponse({ buildArm: buildAt(fit.K, fit.E), destroyArm, path, sample: SS });
console.log('compiling…');
const compiled = await compileTwin({ buildArm: buildAt(fit.K, fit.E), destroyArm,
  path, sample: SS, H, iters: 9,
  onProgress: (m) => console.log(`  ${m}`) });
const applyOn = async (K, E) => {
  const m = await buildAt(K, E)();
  homeArm(m.arm, m.servo, path);
  const out = await drivePath({ arm: m.arm, servo: m.servo, path, sample: SS,
    steps: Math.ceil(path.lap * 3), du: compiled.du, preRoll: compiled.preRoll });
  await destroyArm(m);
  return out.perLap;
};
const open = await (async () => {
  const m = await makeArm();
  homeArm(m.arm, m.servo, path);
  const out = await drivePath({ arm: m.arm, servo: m.servo, path, sample: SS,
    steps: Math.ceil(path.lap * 3) });
  await destroyArm(m);
  return out.perLap;
})();
const laps = await applyOn(TRUE_K, TRUE_E);
console.log(`open loop settled: ${open.at(-1)[0].toExponential(2)}/${open.at(-1)[1].toExponential(2)}`);
laps.forEach((p, i) => console.log(`compiled lap ${i + 1}: ${p[0].toExponential(2)}/${p[1].toExponential(2)}`));
check('LAP 1 at least 8x below the open loop, both channels',
  laps[0][0] < open.at(-1)[0] / 8 && laps[0][1] < open.at(-1)[1] / 8,
  `${laps[0][0].toExponential(2)}/${laps[0][1].toExponential(2)}`);
check('lap 1 equals the settled laps (within 2.5x — the pre-roll holds)',
  laps[0][0] < laps.at(-1)[0] * 2.5 + 1e-9 && laps[0][1] < laps.at(-1)[1] * 2.5 + 1e-9);

// 3) the mismatch experiment the app exposes: same compiled du, softer machine
const soft = await applyOn(TRUE_K, TRUE_E * 0.8);
const openSoft = await (async () => {
  const m = await buildAt(TRUE_K, TRUE_E * 0.8)();
  homeArm(m.arm, m.servo, path);
  const out = await drivePath({ arm: m.arm, servo: m.servo, path, sample: SS,
    steps: Math.ceil(path.lap * 3) });
  await destroyArm(m);
  return out.perLap;
})();
console.log(`E−20% machine: open ${openSoft.at(-1)[0].toExponential(2)}/${openSoft.at(-1)[1].toExponential(2)}  compiled L1 ${soft[0][0].toExponential(2)}/${soft[0][1].toExponential(2)}`);
check('mismatch degrades the compiled machine (observable)',
  soft[0][0] > laps[0][0] * 2 || soft[0][1] > laps[0][1] * 2,
  `${soft[0][0].toExponential(2)}/${soft[0][1].toExponential(2)} vs ${laps[0][0].toExponential(2)}/${laps[0][1].toExponential(2)}`);
check('and still not worse than that machine\'s own open loop',
  soft[0][0] < openSoft.at(-1)[0] * 1.2 && soft[0][1] < openSoft.at(-1)[1] * 1.2);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
