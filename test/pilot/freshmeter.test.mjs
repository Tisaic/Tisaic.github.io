// EVERY PLANT'S SETTLE IS INSIDE ITS OWN METER, OR THE PLANT STATES IT HAS NO CLOCK (plan §131).
//
// `meter.mjs` exists so the TEACHER and the PRODUCT land on one axis, and its own header says
// why the tick is inside the rig's `step`: a counter wired per call site misses the next call
// site added. It does not defend against the other shape, which is what `realtanks-rig.mjs` and
// `realexch-rig.mjs` shipped — the settle loop ran on the RAW plant and the object whose `step`
// ticks was built AFTERWARDS, so `fresh()` cost the meter ZERO while costing the tank 2.2 hours
// and the exchanger 25 minutes, once per excitation segment and once per scored run.
//
// IT WAS NOT A HIDDEN FAULT. `dirinvall.mjs` measures `priceOf(() => spec.fresh())` and prints
// *of which each `fresh()` pre-roll is 0 steps — NOT counted by this rig, so this calendar OMITS
// its settle* — in plain words, on those two plants, while §126 and §127 published `priceFrom`'s
// number from the same run. Two routes in one report with nothing comparing them is one route
// and a decoration (rule 15b, which §117 wrote after paying for exactly this). This file is that
// comparison, made a check.
//
// THE THREE STATES ARE DIFFERENT AND ONLY ONE IS A FAULT (rule 25):
//   TICKS + fresh() > 0        the settle is charged                      OK
//   never ticks at all         the rig states no clock, as `commtime.mjs` already records
//                              for EMPS and the 2R arm                    UNKNOWN, not zero
//   TICKS + fresh() === 0      a settle outside the meter                 RED
//
// BOTH HALVES (rule 9c), because a check that cannot fail is not a check: the fault shape is
// reconstructed here as a spec of its own and the rule is asserted to FIRE on it.
import { reset as meterReset, count as meterCount } from './rigs/meter.mjs';
import { tick } from './rigs/meter.mjs';
import * as S from './rigs/specs.mjs';

let failed = 0;
const ck = (n, c, d) => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`);
  if (!c) failed++;
};

console.log('\nTHE SETTLE IS INSIDE THE METER (plan §131)\n');

/** What one `fresh()` costs the meter, and whether this plant's `step` ticks at all. */
function audit(spec) {
  meterReset();
  const p = spec.fresh();
  const fresh = meterCount();
  const before = meterCount();
  // One step through the spec's own `step`, with a zero correction — the same function the
  // excitation and the scored run advance the plant by, so a rig that ticks anywhere ticks here.
  const c = spec.refAt(0);
  spec.step(p, c, c.map(() => 0), 0);
  return { fresh, ticks: meterCount() - before > 0 };
}

const PLANTS = [['extruder barrel', S.barrelSpec], ['Wood-Berry column', S.wbSpec],
  ['quadruple tank', S.tankSpec], ['cold mill', S.millSpec], ['EMPS servo axis', S.empsSpec],
  ['cart-pole', S.pendSpec], ['real flexible arm', S.realarmLadderSpec],
  ['real cascaded tanks', S.realtanksLadderSpec()], ['real steam exchanger', S.realexchLadderSpec()]];

let silent = 0, unknown = 0;
for (const [name, spec] of PLANTS) {
  let a;
  try { a = audit(spec); } catch (e) { ck(`${name}: audited`, false, e.message); continue; }
  if (!a.ticks) {
    unknown++;
    console.log(`  · ${name.padEnd(22)} does not tick at all — UNKNOWN, as \`commtime.mjs\` records. NOT zero.`);
    continue;
  }
  silent += a.fresh > 0 ? 0 : 1;
  ck(`${name.padEnd(22)} fresh() is CHARGED (${a.fresh.toLocaleString()} steps)`, a.fresh > 0,
    'the plant ticks on `step` but its settle does not — a settle outside the meter');
}
ck('every plant that has a clock charges its own settle', silent === 0, `${silent} do not`);
// The 2R arm is not in the list (its pool is primed per harness); EMPS is the one that reads
// UNKNOWN here, and that it does is asserted so the exemption cannot silently grow.
ck('exactly ONE plant states no clock, and it is the one already on record as doing so',
  unknown === 1, `${unknown} plants read UNKNOWN`);

// ------------------------------------------------------- BOTH HALVES: the rule FIRES on the fault
{
  // The pre-repair shape, reconstructed: a plant that ticks on `step` and settles on the raw
  // object before the ticking wrapper exists.
  let y = 0;
  const raw = { step(u) { y += 0.1 * (u - y); return y; } };
  const broken = {
    N: 4, refAt: () => [1],
    fresh: () => { for (let i = 0; i < 50; i++) raw.step(1); return { step(u) { tick(); return raw.step(u); } }; },
    step: (p, ref, u) => ({ measured: [p.step(ref[0] + u[0])] }),
  };
  const a = audit(broken);
  ck('the fault shape reads TICKS + fresh() === 0, so this check would go red on it',
    a.ticks && a.fresh === 0, JSON.stringify(a));
  const fixed = {
    N: 4, refAt: () => [1],
    fresh: () => { const w = { step(u) { tick(); return raw.step(u); } };
      for (let i = 0; i < 50; i++) w.step(1); return w; },
    step: (p, ref, u) => ({ measured: [p.step(ref[0] + u[0])] }),
  };
  const b = audit(fixed);
  ck('...and the repaired shape reads TICKS + fresh() === 50, so it would not', b.ticks && b.fresh === 50,
    JSON.stringify(b));
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} check(s) failed\n`);
process.exit(failed === 0 ? 0 : 1);
