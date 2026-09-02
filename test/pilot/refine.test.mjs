/**
 * @file THE §40 CORRECTOR AS A LIBRARY, PINNED TO WHAT THE BENCH MEASURED.
 *
 * `Refiner` converges the deployed machine's repeatable residual toward the plant's own
 * floor while truth flows, freezes when truth stops, and GATES OFF on a command-
 * distribution change instead of harming (a corrector frozen across a feed change
 * measured 3x WORSE than no corrector — docs/plan.md §40).
 *
 * Three properties, each two-sided (rule 9):
 *   1) CONVERGES: with truth, the settled residual drops well below the deployed
 *      pilot's — and monotonically enough that the guard never fires on this machine.
 *   2) FREEZES: with truth removed the correction still applies and the residual HOLDS
 *      (no drift up), at zero truth cost.
 *   3) GATES: at a foreign feed the corrector turns itself off (du -> 0) rather than
 *      apply a stale model — and having gated, the machine is the plain deployed one,
 *      not a harmed one.
 *
 * Config is the §39-40 bench's: the SOFT arm (K 1 / E 0.06), rounded @4e-3, seed 1.
 * Full tier only — a commissioning plus ~25 laps of lattice arm.
 */
process.env.ARM_K = process.env.ARM_K || '1';
process.env.ARM_E = process.env.ARM_E || '0.06';
const rig = await import('./rigs/arm-rig.mjs');
const { commissionArm, makeArm, mkPath, homeArm, routeSignals } = rig;
const { Refiner } = await import('../../lib/pilot/refine.js');

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const pilot = await commissionArm({ seed: 1 });
if (!pilot || !pilot.verdict.deploy) {
  console.log('FAIL commissioning refused — cannot test the refiner');
  process.exit(1);
}
const { arm, servo } = await makeArm();
let path = mkPath('rounded', 0.004);
homeArm(arm, servo, path);
const SS = pilot.sample;
let refCache = new Map();
const refAt = (i) => {
  let r = refCache.get(i);
  if (!r) { const c = path.at(i * SS); r = arm.ik(c.x, c.y, true); refCache.set(i, r); }
  return r;
};
pilot._initRun();
const refiner = new Refiner(pilot, { cap: 0.4 });

// drive n laps; truthOn feeds the refiner's refits; returns last-lap settled rms.
// The refiner's contract: observe + act once per SAMPLE, the correction held between
// samples (the bench's own cadence).
let kGlob = 0, kSamp = 0, dHold = [0, 0];
const drive = (nLaps, truthOn) => {
  const kEnd = kGlob + Math.ceil(path.lap * nLaps);
  let acc = [0, 0], n = 0, lapNo = Math.floor(kGlob / path.lap), last = null;
  for (; kGlob < kEnd; kGlob++) {
    const k = kGlob;
    const cmd = path.at(k);
    const [q1, q2] = arm.ik(cmd.x, cmd.y, true);
    const rt = arm.ikRates(q1, q2, cmd.vx, cmd.vy, cmd.ax, cmd.ay);
    const u = pilot.act((off) => refAt(kSamp + off));
    if (k % SS === 0) {
      // truth read off the machine as it stands (only .truth is used; tau enters
      // .measured alone), then the correction for the coming sample
      const rs0 = routeSignals(arm, [{ pos: q1 }, { pos: q2 }], [0, 0]);
      refiner.observe([q1, q2], truthOn ? rs0.truth : null);
      const baseSamp = Math.floor(k / SS);
      dHold = refiner.act((off) => refAt(baseSamp + off));
    }
    const tau = servo.torques([
      { theta: q1 + u[0] + dHold[0], omega: rt.dq[0], alpha: rt.ddq[0] },
      { theta: q2 + u[1] + dHold[1], omega: rt.dq[1], alpha: rt.ddq[1] }]);
    arm.step(tau[0], tau[1], 1);
    if (k % SS === 0) kSamp++;
    const rs = routeSignals(arm, [{ pos: q1 }, { pos: q2 }], tau);
    pilot.observe(rs.measured, null);
    if (k % SS === 0) {
      acc[0] += rs.truth[0] ** 2; acc[1] += rs.truth[1] ** 2; n++;
      const nowLap = Math.floor(k / path.lap);
      if (nowLap !== lapNo) {
        last = [Math.sqrt(acc[0] / n), Math.sqrt(acc[1] / n)];
        acc = [0, 0]; n = 0; lapNo = nowLap;
      }
    }
  }
  if (n > 100) last = [Math.sqrt(acc[0] / n), Math.sqrt(acc[1] / n)];
  return last;
};

console.log('phase 1: deployed baseline, 3 laps');
const base = drive(3, false);
console.log(`  baseline ${base[0].toExponential(2)}/${base[1].toExponential(2)}`);

console.log('phase 2: refining with truth, 14 laps');
const refined = drive(14, true);
const rep1 = refiner.report();
console.log(`  refined ${refined[0].toExponential(2)}/${refined[1].toExponential(2)}  passes ${rep1.passes.length} reverts ${rep1.reverts} duPk ${rep1.duPk.toExponential(2)}`);
check('converges: ch0 at least 4x below the deployed pilot', refined[0] < base[0] / 4,
  `${refined[0].toExponential(2)} vs ${base[0].toExponential(2)}`);
check('converges: ch1 at least 3x below the deployed pilot', refined[1] < base[1] / 3,
  `${refined[1].toExponential(2)} vs ${base[1].toExponential(2)}`);
check('at least 3 passes fitted', rep1.passes.length >= 3, `${rep1.passes.length}`);
check('guard never tripped on this machine', rep1.reverts === 0, `${rep1.reverts}`);
check('correction within cap', rep1.duPk <= 0.4 + 1e-9, `${rep1.duPk.toExponential(2)}`);

console.log('phase 3: truth removed (tracker unmounted), 3 laps frozen');
const frozen = drive(3, false);
console.log(`  frozen ${frozen[0].toExponential(2)}/${frozen[1].toExponential(2)}`);
check('freeze holds: no drift above 1.5x the refined residual',
  frozen[0] < refined[0] * 1.5 && frozen[1] < refined[1] * 1.5,
  `${frozen[0].toExponential(2)}/${frozen[1].toExponential(2)}`);

console.log('phase 4: feed change to 5.5e-3 — the gate must refuse, not harm');
path = mkPath('rounded', 0.0055);
homeArm(arm, servo, path);
refCache = new Map();
kGlob = 0; kSamp = 0;
pilot._initRun();
const foreign = drive(3, false);
const rep2 = refiner.report();
console.log(`  foreign-feed ${foreign[0].toExponential(2)}/${foreign[1].toExponential(2)}  gated ${rep2.gated}`);
check('gate engaged at the foreign feed', rep2.gated === true);
// the assertion is the MECHANISM, not a residual number the pilot's own foreign-feed
// ramp can wobble past: once gated, the applied correction must be EXACTLY zero
const pkAtGate = refiner.duPk;
const post = drive(1, false);
check('post-gate correction is exactly zero (duPk stops growing)',
  refiner.duPk === pkAtGate, `${refiner.duPk.toExponential(2)} vs ${pkAtGate.toExponential(2)}`);
// and the residual sits with the plain deployed machine (control ~1.8-2.3e-2), far from
// the measured 5.7e-2/8.0e-2 an UNGATED stale corrector inflicts (§40)
check('no harm: foreign-feed residual stays below 4.5e-2, well under the ungated 5.7e-2',
  post[0] < 4.5e-2 && post[1] < 4.5e-2,
  `${post[0].toExponential(2)}/${post[1].toExponential(2)}`);

await arm.l1.destroy(); await arm.l2.destroy();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
