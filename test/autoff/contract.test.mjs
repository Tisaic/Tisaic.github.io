// FB_AutoFF's CONTRACT — what the block promises the machine it is fitted to, checked on the PID
// loop through the one host every test uses (`host.mjs`). Nothing inside the block is called: a
// test writes inputs, calls `cycle()`, and reads outputs, exactly as a PLC does.
//
//   BOUNDARY  the deployed half imports nothing, and a budget too small to finish a job is refused
//   ZERO      an enabled, never-commissioned block passes the setpoint through bit-exactly
//   RECORD    save → load decides bit-exactly; a moved bit, another plant key, another channel
//             count and a missing record are each rejected and arm nothing
//   ABORT     removes the trim at once; with a controller deployed before, restores it
//   HOST      no excitation without permission; disable releases the setpoint that scan; xArm
//             FALSE mid-commissioning aborts; a different program mid-commissioning faults
//   15b       the conventional rung agrees with ClassicFF (test/reference) on the same program
import { readFileSync } from 'node:fs';
import { FB_AutoFF, E_AFF_STATE, E_AFF_REASON, E_AFF_VERDICT, affStateName, affReasonName, affVerdictName,
  affMinBudget } from '../../lib/autoff/autoff.js';
import { AFF_MAX_CH, affDecide } from '../../lib/autoff/runtime.js';
import { ClassicFF, motionBasis } from '../reference/classic.mjs';
import { pidloop as PID } from '../plants/pidloop.mjs';
import { recipe } from '../plants/program.mjs';
import { makeHost, commission, nAheadFor, describe, fx } from './host.mjs';

let failed = 0;
const ck = (n, c, d) => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`);
  if (!c) failed++;
};
const NA = nAheadFor(PID.main);
const newFb = (cfg = {}) => { const f = new FB_AutoFF({ nChannels: 1, nAhead: NA, ...cfg }); f.in.xEnable = true; return f; };

console.log('\nFB_AutoFF — the contract, on the PID loop\n');

// ================================================================================= BOUNDARY
{
  const src = readFileSync(new URL('../../lib/autoff/runtime.js', import.meta.url), 'utf8');
  ck('BOUNDARY: the deployed half (runtime.js) imports nothing', !/^\s*import\s/m.test(src) && !/\bimport\(/.test(src));
  let threw = false;
  try { new FB_AutoFF({ nChannels: 4, nAhead: 10, udiMacBudget: affMinBudget(4) - 1 }); } catch { threw = true; }
  ck(`a MAC budget below the largest unit of work (${affMinBudget(4)} at 4 channels) is refused at construction`, threw);
}

// ================================================================================= ZERO
{
  const bare = await makeHost(PID, PID.main), withFb = await makeHost(PID, PID.main);
  const fb = newFb();
  let maxd = 0, maxt = 0;
  for (let k = 0; k < 2 * PID.main.lap; k++) {
    const a = bare.scan(null)[0], b = withFb.scan(fb)[0];
    maxd = Math.max(maxd, Math.abs(a - b)); maxt = Math.max(maxt, Math.abs(fb.out.aTrim[0]));
  }
  ck('ZERO: an enabled, never-commissioned block passes the setpoint through BIT-EXACTLY over two laps',
    maxd === 0 && maxt === 0, `max |diff| ${maxd}, max |trim| ${maxt}`);
  ck('...and reports IDLE with nothing deployed', fb.out.eState === E_AFF_STATE.IDLE && !fb.out.xDeployed, affStateName(fb.out.eState));
}

// ================================================================================= COMMISSION
const base = await commission(PID, { udiSeed: 7 });
console.log(`    ${describe(base.fb)}`);
ck('the PID loop commissions to RUN with the conventional rung deployed',
  base.fb.out.xDone && base.fb.out.eState === E_AFF_STATE.RUN && base.fb.out.eConvVerdict === E_AFF_VERDICT.DEPLOYED,
  describe(base.fb));
ck('the learned rung ran and reached a verdict (DEPLOYED or REFUSED, never NOT_RUN)',
  [E_AFF_VERDICT.DEPLOYED, E_AFF_VERDICT.REFUSED].includes(base.fb.out.eLearnVerdict), affVerdictName(base.fb.out.eLearnVerdict));
ck('the excitation ran and produced fit rows', base.states.has(E_AFF_STATE.EXCITE) && base.fb.out.nFitRows > 0,
  `rows ${base.fb.out.nFitRows}`);

// ================================================================================= 15b: ClassicFF
{
  const L = PID.main.lap, drop = Math.ceil(0.05 * L), at = (k) => PID.main.at(k)[0];
  const m = await PID.make(PID.main);
  const v = new Float64Array(L), a = new Float64Array(L), o = [0];
  for (let k = 0; k < L; k++) { v[k] = (at(k + 1) - at(k - 1)) / 2; a[k] = at(k + 1) - 2 * at(k) + at(k - 1); }
  const lapOf = (corr) => {
    const err = [new Float64Array(L)];
    let ss = 0, n = 0;
    for (let k = 0; k < L; k++) {
      m.meas(o); err[0][k] = o[0] - at(k);
      if (k >= drop) { ss += err[0][k] ** 2; n++; }
      m.step([at(k) + (corr ? corr.at(k)[0] : 0)]);
    }
    return { score: Math.sqrt(ss / n), err };
  };
  lapOf(null); lapOf(null);
  const cf = new ClassicFF({ basis: motionBasis([{ v, a }], { bias: true }), channels: 1, uMax: base.fb.out.aUMax[0] });
  const rep = await cf.commission(async (corr) => lapOf(corr));
  const xc = rep.base / rep.best, xb = base.fb.out.rConvFactor;
  console.log(`    ClassicFF on the same program: ${fx(xc)}x in ${rep.laps} laps · the block's conventional rung ${fx(xb)}x`);
  ck('15b: the block\'s conventional rung and ClassicFF (sharing no code) agree within 1.25x',
    Math.max(xc / xb, xb / xc) < 1.25, `${fx(xb)}x against ${fx(xc)}x`);
}

// ================================================================================= RECORD
{
  const rec = base.fb.saveRecord();
  const fresh = newFb();
  const ok = fresh.loadRecord(rec);
  ck('RECORD: a saved record loads', ok && fresh.out.xDeployed, affReasonName(fresh.out.eReason));
  const h = await makeHost(PID, PID.main);
  h.run(fresh, 1);
  ck('...and reaches RUN after its washout', fresh.out.eState === E_AFF_STATE.RUN, affStateName(fresh.out.eState));
  let maxd = 0;
  const aB = new Float64Array(32), aF = new Float64Array(128), out = new Float64Array(AFF_MAX_CH);
  for (let k = 0; k < 500; k++) {
    h.scan(fresh);
    affDecide(base.fb.rec, fresh._aTap, fresh._aV, fresh._aA, fresh._speed, aB, aF, out);
    maxd = Math.max(maxd, Math.abs(out[0] - fresh._aTarget[0]));
  }
  ck('...and decides BIT-EXACTLY as the commissioned record on the same inputs', maxd === 0, `max |diff| ${maxd}`);
  const moved = { ...rec, aConvW: Float64Array.from(rec.aConvW) };
  moved.aConvW[1] *= 1 + 2 ** -50;
  const f1 = newFb();
  ck('one weight moved in its last bits is REJECTED by the checksum and arms nothing',
    !f1.loadRecord(moved) && f1.out.eReason === E_AFF_REASON.RECORD_REJECTED && !f1.out.xDeployed);
  const other = newFb({ udiKey: 99 });
  ck('another plant key (the loop was retuned) is REJECTED', !other.loadRecord(rec) && other.out.eReason === E_AFF_REASON.RECORD_REJECTED);
  const two = new FB_AutoFF({ nChannels: 2, nAhead: NA });
  ck('another channel count is REJECTED', !two.loadRecord(rec));
  ck('a missing record is REJECTED rather than thrown', !two.loadRecord(null));
}

// ================================================================================= ABORT
{
  const r = await commission(PID, { udiSeed: 7 }, { abortAt: E_AFF_STATE.CONV_PROBE, after: 0 });
  ck('ABORT with nothing deployed before: FAULT, reason ABORTED, trim removed at once',
    r.fb.out.eState === E_AFF_STATE.FAULT && r.fb.out.eReason === E_AFF_REASON.ABORTED && r.fb.out.aTrim[0] === 0, describe(r.fb));
  const fb = base.fb, h = await makeHost(PID, PID.main);
  h.run(fb, 1);
  fb.in.xCommission = false; h.scan(fb); fb.in.xCommission = true;
  let reached = false;
  for (let k = 0; k < 10 * PID.main.lap && !reached; k++) {
    h.scan(fb);
    if (fb.out.eState === E_AFF_STATE.CONV_PROBE) { fb.in.xAbort = true; h.scan(fb); fb.in.xAbort = false; reached = true; }
  }
  fb.in.xCommission = false;
  const after = fb.out.eState;
  h.run(fb, 1);
  ck('ABORT with a controller deployed before: it is RESTORED through a washout, the reason kept',
    reached && after === E_AFF_STATE.WASHOUT && fb.out.eState === E_AFF_STATE.RUN && fb.out.eReason === E_AFF_REASON.ABORTED
      && fb.out.xDeployed, `${affStateName(after)} → ${describe(fb)}`);
}

// ================================================================================= THE HOST CONTRACT
{
  const r = await commission(PID, { udiSeed: 7 }, { excite: false, after: 0 });
  ck('xExciteAllowed FALSE: the learned rung is SKIPPED (NOT_PERMITTED) and the setpoint is never taken',
    r.fb.out.eLearnVerdict === E_AFF_VERDICT.SKIPPED && r.fb.out.eLearnReason === E_AFF_REASON.NOT_PERMITTED
      && !r.states.has(E_AFF_STATE.EXCITE) && r.fb.out.xDone, describe(r.fb));

  const fb = newFb({ udiSeed: 7 }), h = await makeHost(PID, PID.main);
  fb.in.xExciteAllowed = true; fb.in.xCommission = true;
  let owned = false;
  for (let k = 0; k < 60 * PID.main.lap && !owned; k++) { h.scan(fb); owned = fb.out.xOwnsRef; }
  fb.in.xEnable = false; h.scan(fb);
  ck('xEnable FALSE during the excitation releases the setpoint on that scan, with no trim',
    owned && !fb.out.xOwnsRef && fb.out.aTrim[0] === 0 && fb.out.eState === E_AFF_STATE.IDLE,
    `owned ${owned}, now ${affStateName(fb.out.eState)}`);

  const f = newFb({ udiSeed: 7 }), hh = await makeHost(PID, PID.main);
  f.in.xCommission = true;
  let probing = false;
  for (let k = 0; k < 20 * PID.main.lap && !probing; k++) { hh.scan(f); probing = f.out.eState === E_AFF_STATE.CONV_PROBE; }
  f.in.xArm = false; hh.scan(f);
  ck('xArm FALSE mid-commissioning ABORTS rather than scoring zeroed experiments as "no gain"',
    probing && f.out.eState === E_AFF_STATE.FAULT && f.out.eReason === E_AFF_REASON.ABORTED && f.out.aTrim[0] === 0, describe(f));

  const other = recipe([55, 70, 50, 65, 55], 600, 250);
  let refAt = PID.main.at, swapped = false;
  const g = newFb({ udiSeed: 7 }), h2 = await makeHost(PID, PID.main);
  g.in.xCommission = true;
  for (let k = 0; k < 40 * PID.main.lap; k++) {
    h2.scan(g, refAt);
    if (!swapped && g.out.eState === E_AFF_STATE.CONV_PROBE) { refAt = other.at; swapped = true; }
    if (g.out.eState === E_AFF_STATE.FAULT) break;
  }
  ck('a DIFFERENT PROGRAM mid-commissioning faults with PROGRAM_CHANGED and removes the trim',
    swapped && g.out.eState === E_AFF_STATE.FAULT && g.out.eReason === E_AFF_REASON.PROGRAM_CHANGED && g.out.aTrim[0] === 0,
    describe(g));
}

console.log(failed ? `\ncontract: ${failed} check(s) FAILED` : '\ncontract: all checks passed');
process.exit(failed ? 1 : 0);
