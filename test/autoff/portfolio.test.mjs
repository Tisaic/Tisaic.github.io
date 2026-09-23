// FB_AutoFF ACROSS THE PLANT LIBRARY — one press on every machine in `test/plants/`.
//
// For each plant: settle the bare loop, commission on its main program through the one host,
// run the commissioned machine, then load the SAVED RECORD onto a fresh machine running the
// held-out program it never saw. What is asserted is what the product promises on any machine:
//
//   SETTLES   the commissioning finishes — in RUN, or refusing/faulting with a STATED reason
//   HARM      nothing is made worse: a deployment improves the commissioned program, and a
//             refusal leaves the trim at exactly zero
//   HELD-OUT  a deployed record does not make the program it never saw worse
//   15b       the block's own reported factor agrees with the host's independent scored lap
//   BUDGET    no scan, commissioning included, exceeded the MAC budget
//
// Factors are REPORTED, never asserted: a plant marked `insideClass` is linear and inside the
// conventional feedforward's own model class, so its factor measures the class and not the method.
//
// Quick tier: every plant not marked `slow`. Full tier (SUITE=full): all of them.
// ONLY=key,key limits the run to named plants.
import { PLANTS } from '../plants/index.mjs';
import { E_AFF_STATE, E_AFF_REASON, affReasonName } from '../../lib/autoff/autoff.js';
import { commission, bareLap, factorOf, deployOn, describe, fx } from './host.mjs';

const FULL = process.env.SUITE === 'full';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
let plants = PLANTS.filter((p) => (ONLY ? ONLY.includes(p.key) : FULL || !p.slow));
if (FULL && (!ONLY || ONLY.includes('arm2r'))) plants.push((await import('../plants/arm2r.mjs')).arm2r);
if (ONLY) plants = plants.filter((p) => ONLY.includes(p.key));

let failed = 0;
const ck = (n, c, d) => {
  console.log(`    ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`);
  if (!c) failed++;
};
const plantTime = (s) => (s < 120 ? `${s.toFixed(0)} s` : s < 7200 ? `${(s / 60).toFixed(1)} min`
  : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${(s / 86400).toFixed(1)} d`);

console.log(`\nFB_AutoFF across ${plants.length} plants (${FULL ? 'full' : 'quick'} tier)\n`);
if (!plants.length) { console.log('portfolio: no plant selected — nothing was run'); process.exit(1); }

const rows = [];
for (const p of plants) {
  const t0 = Date.now();
  console.log(`  ${p.name}  [${p.key}, ${p.nc} ch]`);
  const bare = await bareLap(p, p.main), bareH = await bareLap(p, p.heldOut);
  const r = await commission(p, { udiSeed: 7 });
  const O = r.fb.out;
  console.log(`    ${describe(r.fb)}`);
  const run = r.h.laps[r.h.laps.length - 1];
  const x = factorOf(run, bare);
  const deployed = O.xDeployed && O.eState === E_AFF_STATE.RUN;

  ck('SETTLES: in RUN, or stopped with a stated reason',
    (O.xDone && O.eState === E_AFF_STATE.RUN) || (O.eState === E_AFF_STATE.FAULT && O.eReason !== E_AFF_REASON.NONE),
    `state ${O.eState}, reason ${affReasonName(O.eReason)}`);
  ck(`BUDGET: peak ${O.udiMacPeak} of ${r.fb.udiMacBudget} MAC in any scan`, O.udiMacPeak <= r.fb.udiMacBudget);

  let xh = null;
  if (deployed) {
    ck(`HARM: the commissioned program improves — ${fx(x)}x`, x > 1, `${fx(x, 4)}x`);
    ck(`15b: reported ${fx(O.rFactor)}x agrees with the scored lap's ${fx(x)}x within 1.25x`,
      Math.max(x / O.rFactor, O.rFactor / x) < 1.25);
    const d = await deployOn(p, p.heldOut, r.fb.saveRecord());
    xh = factorOf(d.lap, bareH);
    ck(`HELD-OUT: the saved record loads and the unseen program is not made worse — ${fx(xh)}x`,
      d.ok && xh >= 1, `loaded ${d.ok}, ${fx(xh, 4)}x`);
  } else {
    ck('HARM: nothing deployed, and the trim is exactly zero', Array.from(O.aTrim.slice(0, p.nc)).every((t) => t === 0),
      Array.from(O.aTrim.slice(0, p.nc)).join('/'));
  }
  rows.push({ p, O, x: deployed ? x : null, xh, laps: O.udiLaps, time: O.udiCommissionScans * p.dt,
    secs: (Date.now() - t0) / 1000 });
}

console.log('\n  plant        verdict                             main     held-out   laps   plant time');
for (const { p, O, x, xh, laps, time } of rows) {
  const v = O.eState === E_AFF_STATE.RUN ? (O.xDeployed ? 'deployed' : 'refused') : `FAULT ${affReasonName(O.eReason)}`;
  const flag = p.insideClass ? '  (inside the model class — not a result)' : p.regulator ? '  (a regulator — nothing to trim)' : '';
  console.log(`  ${p.key.padEnd(11)}  ${v.padEnd(34)} ${x === null ? '    —  ' : (fx(x) + 'x').padStart(8)}  `
    + `${xh === null ? '    —   ' : (fx(xh) + 'x').padStart(8)}  ${String(laps).padStart(5)}   ${plantTime(time)}${flag}`);
}
const deployedN = rows.filter((r) => r.x !== null).length;
console.log(`\n  ${deployedN} of ${rows.length} deployed; the rest refused or faulted with a stated reason; made worse: `
  + `${rows.filter((r) => (r.x !== null && r.x <= 1) || (r.xh !== null && r.xh < 1)).length}`);
console.log(failed ? `\nportfolio: ${failed} check(s) FAILED` : '\nportfolio: all checks passed');
process.exit(failed ? 1 : 0);
