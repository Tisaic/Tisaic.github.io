/**
 * @file THE BUTTON ON A REAL HEAT EXCHANGER — DaISy 97-002, the counterpart to the extruder
 * barrel, which is one of this project's two standing refusals.
 *
 * IT ALSO CARRIES THE REPLICATION OF A FINDING THAT WOULD OTHERWISE BE ONE PLANT'S.
 * `realtanks.test.mjs` measured 2012x on a linearly-identified tank and 6.5x on the same
 * plant with its documented overflow restored — a factor of 307 — and concluded that a factor
 * measured on a plant inside the correction's own hypothesis class is a measurement of that
 * class. A common factor across plants that share no physics is a property of the CODE
 * (rule 18), and its converse is what makes that conclusion worth anything: here the same
 * comparison runs on steam and water rather than on two water tanks, between a linear ARX and
 * a fit carrying the counterflow effectiveness relation.
 *
 * ITS VALIDATION IS THE WEAKEST OF THE THREE AND IS PRINTED FIRST (rule 27): 0.66 degC
 * free-run against an 8.6 degC range, and 48% NRMSE even ONE STEP ahead with the true
 * previous temperature in hand. The record is disturbance-dominated, and what is measured
 * below is a factor on the part of this exchanger the record explains.
 */
import { ladder, announce } from './rigs/ladder.mjs';
import * as E from './rigs/realexch-rig.mjs';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: the button on a REAL heat exchanger (DaISy 97-002)\n');
announce();
console.log(`  identified from the record, two ways:`);
console.log(`    nonlinear (exp(-1/u), the counterflow effectiveness): na=${E.MODEL.na} nb=${E.MODEL.nb} `
  + `nk=${E.MODEL.nk}, ${E.MODEL.p} parameters — free-run ${E.VAL_RMS.toFixed(4)} °C on the held-out half`);
console.log(`    linear ARX:                                          na=${E.MODEL_LIN.na} nb=${E.MODEL_LIN.nb} `
  + `nk=${E.MODEL_LIN.nk}, ${E.MODEL_LIN.p} parameters — free-run ${E.VAL_RMS_LIN.toFixed(4)} °C`);
console.log(`  the record's whole output range is ${(E.TMAX_T - E.TMIN).toFixed(2)} °C, so this plant's `
  + `dynamics are known to about ${(100 * E.VAL_RMS / (E.TMAX_T - E.TMIN)).toFixed(0)}% of its own span`);

const PK = (() => {
  let v = 0, a = 0, j = 0;
  const r = (i) => E.refAtStep(Math.max(0, Math.min(E.PROG - 1, i)))[0];
  for (let k = 2; k < E.PROG - 2; k++) {
    v = Math.max(v, Math.abs((r(k + 1) - r(k - 1)) / 2));
    a = Math.max(a, Math.abs(r(k + 1) - 2 * r(k) + r(k - 1)));
    j = Math.max(j, Math.abs((r(k + 2) - 2 * r(k + 1) + 2 * r(k - 1) - r(k - 2)) / 2));
  }
  return { v, a, j };
})();

async function run(tag, model) {
  const conv = E.convRms(model);
  console.log(`\n  conventional machine on the ${tag} plant: ${conv.toFixed(4)} °C rms over `
    + `${E.PROG} s = ${(E.PROG / 60).toFixed(0)} min of plant time`);
  return ladder({
    name: `real heat exchanger (${tag}) — outlet temperature, °C rms`,
    channels: [{ lo: E.UMIN, hi: E.UMAX, vMax: PK.v, aMax: PK.a, jMax: PK.j }],
    uMax: E.UCORR,
    // The outlet temperature is the one thing this exchanger measures.
    nMeasured: 1,
    guards: [{ index: 0, max: E.TMAX_T + 5 }],
    start: [E.refAtStep(0)[0]], N: E.PROG,
    refAt: (k) => E.refAtStep(Math.min(k, E.PROG - 1)), floor: 0,
    fresh: () => E.makeMachine(model),
    step: (p, ref, u) => {
      const y = p.step(ref[0] + u[0]);
      return { measured: [y], truth: [y - E.tempAt(model, ref[0])] };
    },
  });
}

const nl = await run('nonlinear', E.MODEL);
const lin = await run('linear', E.MODEL_LIN);

check('the real exchanger commissions and ships something that does not make it worse',
  nl.rep.best <= nl.rep.base, `${nl.rep.base.toExponential(3)} → ${nl.rep.best.toExponential(3)}`);
console.log(`\n  nonlinear plant ${nl.rep.gain.toFixed(1)}x  vs  linear plant ${lin.rep.gain.toFixed(1)}x`);
check('…and the LINEAR plant scores higher, replicating on steam what the tanks measured on '
  + 'water: a factor taken on a plant inside the correction\'s own hypothesis class is a '
  + 'measurement of that class, not of the machine (rule 18 in its useful direction)',
  lin.rep.gain > nl.rep.gain, `${lin.rep.gain.toFixed(1)}x vs ${nl.rep.gain.toFixed(1)}x`);

console.log(failed ? `\nrealexch: ${failed} check(s) FAILED\n` : '\nrealexch: all checks passed\n');
process.exit(failed ? 1 : 0);
