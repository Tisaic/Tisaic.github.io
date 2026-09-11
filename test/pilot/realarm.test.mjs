/**
 * @file THE BUTTON ON A PLANT WHOSE DYNAMICS CAME FROM REAL HARDWARE — DaISy 96-009, a
 * flexible robot arm, identified from its record and validated by free-run simulation on a
 * cut the fit never saw.
 *
 * WHY THIS PLANT AND NOT THE ONE THAT WAS ASKED FOR. The KUKA KR300 Industrial Robot
 * identification benchmark is the real-robot datum this project wants and every host that
 * serves it is blocked from this session; `rigs/realdata/PROVENANCE.md` names them. This is
 * the available real arm, and it is one link and 1024 samples against six axes and 40,000.
 *
 * WHAT IT IS FOR. Every arm number in this repository is quoted on a lattice simulator, and
 * §52.36 softened a claim about lightly damped modes on the strength of that simulator's own
 * ring — 5.6x decay per cycle, a memory of 2.3 cycles. This arm's identified modes decay
 * about 1.03x per cycle. If the method behaves the same way here, the lattice arm was not
 * flattering it; if it does not, a conclusion this file draws about FIR windows was drawn on
 * a simulator that is much friendlier than hardware.
 *
 * THE VALIDATION FIGURE QUOTED HERE IS THE POSITION ONE, 36%, NOT THE 2.8% THE RECORD
 * SUPPORTS IN ITS OWN DOMAIN (rule 19). The record is an acceleration; the plant is
 * controlled in position, which is that acceleration twice integrated, and integration
 * amplifies exactly the low frequencies an odd multisine pins down worst. Quoting 2.8% would
 * be quoting an instrument's accuracy about a quantity nobody controls.
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { motionBasis } from '../../lib/pilot/classic.js';
import * as A from './rigs/realarm-rig.mjs';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: the button on a REAL flexible robot arm (DaISy 96-009)\n');
announce();

// ---- WHAT THE RECORD SAYS, BEFORE ANY CONTROL RESULT IS QUOTED AGAINST IT (rule 27) ------
console.log(`  identified from the record: na=${A.MODEL.na} nb=${A.MODEL.nb} nk=${A.MODEL.nk}, `
  + `${A.MODEL.p} parameters, ridge ${A.MODEL.lam}`);
console.log(`  free-run on the held-out cut: ${A.VALID.accPct.toFixed(2)}% NRMSE in ACCELERATION `
  + `(the measured quantity), ${A.VALID.posPct.toFixed(2)}% in POSITION (the controlled one)`);
console.log(`  inertia J = ${(1 / A.G_DC).toFixed(2)} from the DC gain; drive limit `
  + `±${A.TMAX.toFixed(4)} is the record's own torque range`);
console.log(`  conventional machine (rigid feedforward + PD, kp=${A.LOOP.kp} kd=${A.LOOP.kd}): `
  + `${A.CONV_RMS.toExponential(3)} rms against ${A.DO_NOTHING.toExponential(3)} for doing `
  + `nothing — ${(A.DO_NOTHING / A.CONV_RMS).toFixed(2)}x`);
console.log(`  every run starts settled (${A.PROG / A.LAP} laps, ${A.LAP}-sample lap); the ring`
  + ' locks in over ~13 laps because the program\'s 30th harmonic lands 0.8% off a mode whose'
  + ' half-power bandwidth is 1.1%');

// THE PROGRAM'S OWN PEAKS, MEASURED (rule 41b). An excitation built to declared limits
// describes a machine the program does not run, and this project has paid for that twice.
const PK = (() => {
  let v = 0, a = 0, j = 0;
  const r = (i) => A.refAtStep(i)[0];
  for (let k = 2; k < A.PROG - 2; k++) {
    v = Math.max(v, Math.abs((r(k + 1) - r(k - 1)) / 2));
    a = Math.max(a, Math.abs(r(k + 1) - 2 * r(k) + r(k - 1)));
    j = Math.max(j, Math.abs((r(k + 2) - 2 * r(k + 1) + 2 * r(k - 1) - r(k - 2)) / 2));
  }
  return { v, a, j };
})();

const N = A.PROG;
const res = await ladder({
  name: 'real flexible robot arm (DaISy 96-009) — position, rms',
  channels: [{ lo: -1.25 * A.AMP, hi: 1.25 * A.AMP, vMax: PK.v, aMax: PK.a, jMax: PK.j }],
  uMax: A.UCORR,
  // Position, velocity, acceleration and the drive's own torque — a real servo publishes all
  // four, and nothing here is a quantity the machine would not have.
  nMeasured: 4,
  guards: [{ index: 0, max: 4 * A.AMP }],
  start: [A.refAtStep(0)[0]],
  N,
  refAt: (k) => A.refAtStep(Math.min(k, N - 1)),
  floor: 0,
  fresh: () => A.makeMachine(),
  step: (m, ref, u) => {
    const x = m.step(ref[0] + u[0]);
    return { measured: [x, m.v, m.acc, m.torque], truth: [x - ref[0]] };
  },
});

check('the arm commissions and ships something that does not make it worse',
  res.rep.best <= res.rep.base, `${res.rep.base.toExponential(3)} → ${res.rep.best.toExponential(3)}`);
check('…and the lap-periodic rung was never offered, because what is under test is a model '
  + 'of the plant and not a memory of this program',
  !res.rep.rungs.some((r) => /lap-periodic/.test(r.name)),
  JSON.stringify(res.rep.rungs.map((r) => r.name)));
// BOTH HALVES (rule 9): a plant that cannot be driven at all would also "not be made worse".
check('…on a plant the conventional machine already improves 70x over doing nothing, so the '
  + 'denominator is a working machine rather than a straw man',
  A.DO_NOTHING / A.CONV_RMS > 20, `${(A.DO_NOTHING / A.CONV_RMS).toFixed(2)}x`);
check('the identified plant is validated on a cut the fit never saw, in the domain it is '
  + 'controlled in', A.VALID.posPct < 50, `${A.VALID.posPct.toFixed(2)}% position NRMSE`);

console.log(failed ? `\nrealarm: ${failed} check(s) FAILED\n` : '\nrealarm: all checks passed\n');
process.exit(failed ? 1 : 0);
