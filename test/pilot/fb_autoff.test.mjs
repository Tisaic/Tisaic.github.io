// FB_AutoFF, DRIVEN AS A PLC DRIVES IT — one `cycle()` per scan, nothing else (plan §139).
//
// The block exists because the commissioning loop kept being written twice (plan §138), so this
// test does not call a single internal of it: a HOST writes the reference preview and the
// measurement, pulses `xCycleStart` at the start of each lap, applies `aRefOut` to an existing
// closed loop, and holds its program while `xOwnsRef` is TRUE. That is the whole contract, and it
// is what an ST port will be checked against.
//
// Two plants, both with the loop already closed and the block trimming its SETPOINT:
//   - the §137 PID temperature loop (one channel, nonlinear valve, SIMC-tuned PI);
//   - Wood–Berry under its published BLT PI pair (two channels, strongly coupled, dead times).
//
// WHAT IS ASSERTED, both halves wherever there are two (rule 9):
//   ZERO      an enabled, uncommissioned block passes the reference through BIT-EXACTLY;
//   HARM      after commissioning nothing is worse than the bare loop, on either plant;
//   15b       the block's own reported factor agrees with an independent scored run of the
//             machine it left behind, and its conventional rung with `ClassicFF` on the same
//             program — two routes that share no code (rule 15b: compared, not printed);
//   BUDGET    no scan exceeds `udiMacBudget` — including the commissioning;
//   RECORD    save → load reproduces the deployed trim bit-exactly; a flipped bit, another plant
//             key and another channel count are each REJECTED and arm nothing;
//   ABORT     removes the trim at once; with a previous controller it is restored;
//   BOUNDARY  the runtime half imports nothing.
import { readFileSync } from 'node:fs';
import { FB_AutoFF, E_AFF_STATE, E_AFF_REASON, E_AFF_VERDICT, affStateName, affReasonName, affVerdictName,
  affMinBudget } from '../../lib/pilot/autoff.js';
import { AFF_MAX_CH, affDecide, affNewRecord } from '../../lib/pilot/autoff_runtime.js';
import { ClassicFF, motionBasis } from '../../lib/pilot/classic.js';
import * as PL from './rigs/pidloop-rig.mjs';
import * as WB from './rigs/woodberry-rig.mjs';

let failed = 0;
const ck = (n, c, d) => {
  console.log(`  ${c ? '✓' : '✗'} ${n}${(!c && d !== undefined) ? '  → ' + d : ''}`);
  if (!c) failed++;
};
const fx = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

// ------------------------------------------------------------------------------ the programs
const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));
/** A closed recipe: hold, then a quintic ramp to the next level, per segment. */
function recipeAt(levels, seg, hold, k) {
  const n = levels.length - 1, L = seg * n;
  const kk = ((k % L) + L) % L, i = Math.floor(kk / seg);
  const t = (kk - i * seg - hold) / (seg - hold);
  const s = t <= 0 ? 0 : t >= 1 ? 1 : quintic(t);
  return levels[i] + (levels[i + 1] - levels[i]) * s;
}

// §137's schedule, CLOSED so it can repeat: production returns to its first level.
const PID_LEVELS = [55, 75, 45, 68, 55];
const PID_LAP = PL.SEG * (PID_LEVELS.length - 1);
const pidRef = (k) => [recipeAt(PID_LEVELS, PL.SEG, PL.HOLD, k)];

// Wood–Berry: both compositions move, on different clocks, inside the box the BLT pair can reach.
const WB_SEG = 750, WB_HOLD = 300;
const WB_L0 = [0, 1, 0.4, 0.8, 0], WB_L1 = [0.5, 0, 1, 0.3, 0.5];
const WB_LAP = WB_SEG * (WB_L0.length - 1);
const wbRef = (k) => [recipeAt(WB_L0, WB_SEG, WB_HOLD, k), recipeAt(WB_L1, WB_SEG, WB_HOLD, k + WB_SEG / 2)];

// ------------------------------------------------------------------------------ the plants
function pidPlant() {
  const loop = PL.makeLoop(PL.MODEL, { sp0: PID_LEVELS[0] });
  return { meas: (o) => { o[0] = loop.y; }, step: (sp) => { loop.step(sp[0]); } };
}
/** Wood–Berry with the published BLT PI pair closed around it (`woodberry-rig.runBLT`'s loop). */
function wbPlant() {
  const col = WB.makeColumn();
  const KC = [0.375, -0.075], TI = [8.29, 23.6], I = [0, 0], u = [0, 0];
  return {
    meas: (o) => { o[0] = col.y[0]; o[1] = col.y[1]; },
    step: (sp) => {
      for (let i = 0; i < 2; i++) {
        const e = sp[i] - col.y[i];
        I[i] += e * WB.DT;
        let v = KC[i] * (e + I[i] / TI[i]);
        if (v > WB.UBOX.hi) { I[i] -= (v - WB.UBOX.hi) * TI[i] / KC[i]; v = WB.UBOX.hi; }
        if (v < WB.UBOX.lo) { I[i] -= (v - WB.UBOX.lo) * TI[i] / KC[i]; v = WB.UBOX.lo; }
        u[i] = v;
      }
      col.step(u);
    },
  };
}

// ------------------------------------------------------------------------------ the host
/**
 * The machine around the block: a sequencer that holds its program counter while the block owns
 * the setpoint, and a scorer that reads each lap of the PROGRAM (never of the block's excitation).
 * `fb` may be null: then the setpoint is the reference, which is the bare loop.
 */
function makeHost({ nc, lap, refAt, plant, nAhead }) {
  let pc = 0;
  const meas = new Float64Array(AFF_MAX_CH), sp = new Float64Array(nc);
  const drop = Math.ceil(0.05 * lap);
  let lapSs = new Float64Array(nc), lapN = 0, lapK = 0;
  const laps = [];                     // per completed program lap: rms per channel
  return {
    get pc() { return pc; },
    laps,
    scan(fb) {
      plant.meas(meas);
      const ref0 = refAt(pc);
      if (fb) {
        const A = fb.in.aRefAhead;
        for (let i = 0; i <= nAhead; i++) { const r = refAt(pc + i); for (let c = 0; c < nc; c++) A[i * AFF_MAX_CH + c] = r[c]; }
        for (let c = 0; c < nc; c++) fb.in.aMeas[c] = meas[c];
        fb.in.xCycleStart = pc % lap === 0;
        fb.cycle();
        for (let c = 0; c < nc; c++) sp[c] = fb.out.aRefOut[c];
      } else for (let c = 0; c < nc; c++) sp[c] = ref0[c];
      const owned = fb && fb.out.xOwnsRef;
      if (!owned) {                    // score the program only while the program is running
        if (lapK >= drop) { for (let c = 0; c < nc; c++) lapSs[c] += (meas[c] - ref0[c]) ** 2; lapN++; }
        lapK++;
      }
      plant.step(sp);
      if (!owned) {
        pc++;
        if (pc % lap === 0) {
          laps.push(Array.from(lapSs, (s) => Math.sqrt(s / Math.max(1, lapN))));
          lapSs = new Float64Array(nc); lapN = 0; lapK = 0;
        }
      }
      return sp;
    },
  };
}

/** Score of a lap against a bare lap, the block's own convention: rms over channels of rms ratios. */
const scoreOf = (lapRms, bareRms) => Math.sqrt(lapRms.reduce((s, r, c) => s + (r / bareRms[c]) ** 2, 0) / lapRms.length);

/** The bare loop, settled: the last of `n` program laps. */
function bareLap(spec, n = 4) {
  const h = makeHost({ ...spec, plant: spec.mkPlant() });
  for (let k = 0; k < n * spec.lap; k++) h.scan(null);
  return h.laps[h.laps.length - 1];
}

/** Commission to completion (or a scan limit), then run `after` more program laps. */
function commission(spec, cfg, { after = 3, excite = true, abortAt = null } = {}) {
  const fb = new FB_AutoFF({ nChannels: spec.nc, nAhead: spec.nAhead, ...cfg });
  const h = makeHost({ ...spec, plant: spec.mkPlant() });
  fb.in.xEnable = true; fb.in.xExciteAllowed = excite;
  const states = new Set();
  // two bare laps first, so the loop is settled when the button is pressed
  for (let k = 0; k < 2 * spec.lap; k++) h.scan(fb);
  fb.in.xCommission = true;
  const limit = 200 * spec.lap;
  let k = 0;
  for (; k < limit; k++) {
    h.scan(fb);
    states.add(fb.out.eState);
    if (abortAt !== null && fb.out.eState === abortAt) { fb.in.xAbort = true; h.scan(fb); fb.in.xAbort = false; break; }
    if (fb.out.xDone) break;
  }
  fb.in.xCommission = false;
  const lapsAtDone = h.laps.length;
  for (let j = 0; j < after * spec.lap; j++) h.scan(fb);
  return { fb, h, states, scans: k, lapsAtDone };
}

function describe(fb) {
  const O = fb.out;
  return `state ${affStateName(O.eState)} (${affReasonName(O.eReason)})  conv ${affVerdictName(O.eConvVerdict)}`
    + `${O.eConvReason ? '/' + affReasonName(O.eConvReason) : ''} ${fx(O.rConvFactor, 2)}x · learned `
    + `${affVerdictName(O.eLearnVerdict)}${O.eLearnReason ? '/' + affReasonName(O.eLearnReason) : ''} `
    + `${fx(O.rLearnFactor, 2)}x · total ${fx(O.rFactor, 2)}x\n      lap ${O.nLap} · settle ${O.nSettle} · `
    + `reach ±${O.nReach} · headroom ${fx(O.rHeadroom, 3)} · uMax ${Array.from(O.aUMax.slice(0, fb.nc), (u) => fx(u, 3)).join('/')} · `
    + `fit rows ${O.nFitRows} · ${O.udiLaps} laps · ${O.udiCommissionScans} scans · peak ${O.udiMacPeak} MAC/scan`;
}

const PID = { nc: 1, lap: PID_LAP, refAt: pidRef, mkPlant: pidPlant, nAhead: 400 };
const WBS = { nc: 2, lap: WB_LAP, refAt: wbRef, mkPlant: wbPlant, nAhead: 600 };

console.log('\nFB_AutoFF — one block, one scan at a time (plan §139)\n');

// =============================================================================== BOUNDARY
{
  const src = readFileSync(new URL('../../lib/pilot/autoff_runtime.js', import.meta.url), 'utf8');
  ck('BOUNDARY: the runtime half imports nothing, so the deployed object is checkable by construction',
    !/^\s*import\s/m.test(src) && !/\bimport\(/.test(src));
  let threw = false;
  try { new FB_AutoFF({ nChannels: 4, nAhead: 10, udiMacBudget: affMinBudget(4) - 1 }); } catch { threw = true; }
  ck(`a MAC budget below the largest unit of work (${affMinBudget(4)} at 4 channels) is refused at construction`, threw);
}

// =============================================================================== ZERO
{
  const bare = makeHost({ ...PID, plant: PID.mkPlant() });
  const fb = new FB_AutoFF({ nChannels: 1, nAhead: PID.nAhead });
  fb.in.xEnable = true;
  const withFb = makeHost({ ...PID, plant: PID.mkPlant() });
  let maxd = 0, maxsp = 0;
  for (let k = 0; k < 2 * PID.lap; k++) {
    const a = bare.scan(null)[0], b = withFb.scan(fb)[0];
    maxd = Math.max(maxd, Math.abs(a - b)); maxsp = Math.max(maxsp, Math.abs(fb.out.aTrim[0]));
  }
  ck('ZERO: an enabled, never-commissioned block passes the setpoint through BIT-EXACTLY over two laps',
    maxd === 0 && maxsp === 0, `max |diff| ${maxd}, max |trim| ${maxsp}`);
  ck('...and says it is IDLE with nothing deployed', fb.out.eState === E_AFF_STATE.IDLE && !fb.out.xDeployed,
    affStateName(fb.out.eState));
}

// =============================================================================== PID LOOP
let pidRec = null;
{
  console.log('\n  THE PID TEMPERATURE LOOP (§137), one channel, the block trimming the setpoint');
  const bare = bareLap(PID);
  const t0 = Date.now();
  const r = commission(PID, { udiSeed: 7 });
  const { fb, h } = r;
  console.log(`    ${describe(fb)}  (${((Date.now() - t0) / 1000).toFixed(1)} s of Node)`);
  const run = h.laps[h.laps.length - 1];
  const measured = 1 / scoreOf(run, bare);
  console.log(`    bare lap ${fx(bare[0], 4)} °C rms → running ${fx(run[0], 4)} °C rms: ${fx(measured, 2)}x `
    + `measured on the machine the block left behind`);
  ck('it completes: DONE, in RUN, something deployed', fb.out.xDone && fb.out.eState === E_AFF_STATE.RUN && fb.out.xDeployed,
    describe(fb));
  ck('the conventional rung DEPLOYS (on this plant the incumbent is expected to win — §137)',
    fb.out.eConvVerdict === E_AFF_VERDICT.DEPLOYED, affVerdictName(fb.out.eConvVerdict));
  ck('HARM: the running machine is no worse than the bare loop', measured >= 1, `${fx(measured)}x`);
  ck('15b: the block\'s own factor agrees with the independent scored run within 1.25x',
    Math.max(measured / fb.out.rFactor, fb.out.rFactor / measured) < 1.25, `${fx(fb.out.rFactor)}x reported against ${fx(measured)}x measured`);
  ck(`BUDGET: no scan exceeded ${fb.udiMacBudget} MAC, the commissioning included`, fb.out.udiMacPeak <= fb.udiMacBudget,
    `${fb.out.udiMacPeak}`);
  ck('the learned rung ran and reached a verdict — DEPLOYED or REFUSED, never NOT_RUN',
    fb.out.eLearnVerdict === E_AFF_VERDICT.DEPLOYED || fb.out.eLearnVerdict === E_AFF_VERDICT.REFUSED,
    affVerdictName(fb.out.eLearnVerdict));
  ck('the excitation ran and produced fit rows', r.states.has(E_AFF_STATE.EXCITE) && fb.out.nFitRows > 0,
    `rows ${fb.out.nFitRows}`);
  pidRec = { fb, spec: PID };

  // ---- 15b, the second route: `ClassicFF` on the same closed program, same plant, same authority
  {
    const loop = PL.makeLoop(PL.MODEL, { sp0: PID_LEVELS[0] });
    const L = PID_LAP, drop = Math.ceil(0.05 * L);
    const q = new Float64Array(L), v = new Float64Array(L), a = new Float64Array(L);
    for (let k = 0; k < L; k++) {
      const p0 = pidRef(k - 1)[0], p1 = pidRef(k)[0], p2 = pidRef(k + 1)[0];
      q[k] = p1; v[k] = (p2 - p0) / 2; a[k] = p2 - 2 * p1 + p0;
    }
    const lapOf = (corr) => {
      const err = [new Float64Array(L)];
      let ss = 0, n = 0;
      for (let k = 0; k < L; k++) {
        const y0 = loop.y, r0 = q[k];
        err[0][k] = y0 - r0;
        if (k >= drop) { ss += err[0][k] ** 2; n++; }
        loop.step(r0 + (corr ? corr.at(k)[0] : 0));
      }
      return { score: Math.sqrt(ss / n), err };
    };
    for (let i = 0; i < 2; i++) lapOf(null);
    const cf = new ClassicFF({ basis: motionBasis([{ v, a }], { bias: true }), channels: 1, uMax: fb.out.aUMax[0] });
    const rep = await cf.commission(async (corr) => lapOf(corr));
    const xc = rep.base / rep.best;
    console.log(`    ClassicFF on the same program: ${fx(rep.base, 4)} → ${fx(rep.best, 4)} °C rms, ${fx(xc, 2)}x in ${rep.laps} laps`
      + `  ·  the block's conventional rung: ${fx(fb.out.rConvFactor, 2)}x`);
    ck('15b: the block\'s conventional rung and `ClassicFF` agree within 1.25x on the same program (both scale by the exact peak)',
      Math.max(xc / fb.out.rConvFactor, fb.out.rConvFactor / xc) < 1.25, `${fx(fb.out.rConvFactor)}x against ${fx(xc)}x`);
  }
}

// =============================================================================== RECORD
{
  const { fb } = pidRec;
  const rec = fb.saveRecord();
  const replay = (target) => {
    // the same inputs into two blocks, and the trims compared scan for scan
    const h = makeHost({ ...PID, plant: PID.mkPlant() });
    const fresh = new FB_AutoFF({ nChannels: 1, nAhead: PID.nAhead });
    fresh.in.xEnable = true;
    const ok = fresh.loadRecord(target);
    return { ok, fresh, h };
  };
  const { ok, fresh, h } = replay(rec);
  ck('RECORD: a saved record loads', ok && fresh.out.xDeployed, affReasonName(fresh.out.eReason));
  // after the washout, the loaded block and the direct runtime call must agree bit-exactly
  for (let k = 0; k < PID.lap; k++) h.scan(fresh);
  ck('...and reaches RUN after its washout', fresh.out.eState === E_AFF_STATE.RUN, affStateName(fresh.out.eState));
  let maxd = 0;
  const aB = new Float64Array(32), aF = new Float64Array(128), out = new Float64Array(AFF_MAX_CH);
  for (let k = 0; k < 500; k++) {
    h.scan(fresh);
    affDecide(fb.rec, fresh._aTap, fresh._aV, fresh._aA, fresh._speed, aB, aF, out);
    maxd = Math.max(maxd, Math.abs(out[0] - fresh._aTarget[0]));
  }
  ck('...and the loaded record decides BIT-EXACTLY as the commissioned one on the same inputs', maxd === 0, `max |diff| ${maxd}`);

  const flipped = { ...rec, aConvW: Float64Array.from(rec.aConvW) };
  flipped.aConvW[1] = flipped.aConvW[1] * (1 + 2 ** -50);
  const r1 = replay(flipped);
  ck('a single weight moved in its last bits is REJECTED by the checksum and arms nothing',
    !r1.ok && r1.fresh.out.eReason === E_AFF_REASON.RECORD_REJECTED && !r1.fresh.out.xDeployed);
  const other = new FB_AutoFF({ nChannels: 1, nAhead: PID.nAhead, udiKey: 99 });
  ck('another plant key (the loop was retuned) is REJECTED', !other.loadRecord(rec) && other.out.eReason === E_AFF_REASON.RECORD_REJECTED);
  const two = new FB_AutoFF({ nChannels: 2, nAhead: PID.nAhead });
  ck('another channel count is REJECTED', !two.loadRecord(rec));
  ck('a missing record is REJECTED rather than thrown', !two.loadRecord(null));
}

// =============================================================================== ABORT
{
  const r = commission(PID, { udiSeed: 7 }, { abortAt: E_AFF_STATE.CONV_PROBE, after: 0 });
  ck('ABORT with nothing deployed before: FAULT, reason ABORTED, trim removed at once',
    r.fb.out.eState === E_AFF_STATE.FAULT && r.fb.out.eReason === E_AFF_REASON.ABORTED && r.fb.out.aTrim[0] === 0,
    describe(r.fb));
  // with a controller already deployed: the last good model is restored
  const { fb } = pidRec;
  const h = makeHost({ ...PID, plant: PID.mkPlant() });
  for (let k = 0; k < PID.lap; k++) h.scan(fb);
  fb.in.xCommission = false; h.scan(fb); fb.in.xCommission = true;
  let reached = false;
  for (let k = 0; k < 10 * PID.lap && !reached; k++) {
    h.scan(fb);
    if (fb.out.eState === E_AFF_STATE.CONV_PROBE) { fb.in.xAbort = true; h.scan(fb); fb.in.xAbort = false; reached = true; }
  }
  fb.in.xCommission = false;
  const after = fb.out.eState;
  for (let k = 0; k < PID.lap; k++) h.scan(fb);
  ck('ABORT with a controller deployed before: it is RESTORED through a washout, and the reason is kept',
    reached && after === E_AFF_STATE.WASHOUT && fb.out.eState === E_AFF_STATE.RUN && fb.out.eReason === E_AFF_REASON.ABORTED
      && fb.out.xDeployed, `${affStateName(after)} → ${describe(fb)}`);
}

// =============================================================================== THE HOST CONTRACT
{
  // (a) without permission to excite, the block NEVER takes the setpoint, and says why
  const r = commission(PID, { udiSeed: 7 }, { excite: false, after: 0 });
  ck('xExciteAllowed FALSE: the learned rung is SKIPPED with NOT_PERMITTED and the setpoint was never taken',
    r.fb.out.eLearnVerdict === E_AFF_VERDICT.SKIPPED && r.fb.out.eLearnReason === E_AFF_REASON.NOT_PERMITTED
      && !r.states.has(E_AFF_STATE.EXCITE) && r.fb.out.xDone, describe(r.fb));
  // (b) disabling the block mid-excitation hands the setpoint back THAT scan
  const fb = new FB_AutoFF({ nChannels: 1, nAhead: PID.nAhead, udiSeed: 7 });
  const h = makeHost({ ...PID, plant: PID.mkPlant() });
  fb.in.xEnable = true; fb.in.xExciteAllowed = true; fb.in.xCommission = true;
  let owned = false;
  for (let k = 0; k < 60 * PID.lap && !owned; k++) { h.scan(fb); owned = fb.out.xOwnsRef; }
  fb.in.xEnable = false; h.scan(fb);
  ck('xEnable FALSE during the excitation releases the setpoint on that scan, with no trim',
    owned && !fb.out.xOwnsRef && fb.out.aTrim[0] === 0 && fb.out.eState === E_AFF_STATE.IDLE,
    `owned ${owned}, now ${affStateName(fb.out.eState)} ownsRef ${fb.out.xOwnsRef}`);
  // (b2) xArm FALSE during a commissioning is an ABORT, never a silent "no gain"
  {
    const f = new FB_AutoFF({ nChannels: 1, nAhead: PID.nAhead, udiSeed: 7 });
    const hh = makeHost({ ...PID, plant: PID.mkPlant() });
    f.in.xEnable = true; f.in.xCommission = true;
    let probing = false;
    for (let k = 0; k < 20 * PID.lap && !probing; k++) { hh.scan(f); probing = f.out.eState === E_AFF_STATE.CONV_PROBE; }
    f.in.xArm = false; hh.scan(f);
    ck('xArm FALSE mid-commissioning ABORTS it rather than scoring zeroed experiments as "no gain"',
      probing && f.out.eState === E_AFF_STATE.FAULT && f.out.eReason === E_AFF_REASON.ABORTED && f.out.aTrim[0] === 0, describe(f));
  }
  // (c) the program must repeat: a different program mid-commissioning is a FAULT, not a result
  let prog = pidRef;
  const g = new FB_AutoFF({ nChannels: 1, nAhead: PID.nAhead, udiSeed: 7 });
  const h2 = makeHost({ ...PID, refAt: (k) => prog(k), plant: PID.mkPlant() });
  g.in.xEnable = true; g.in.xCommission = true;
  let swapped = false;
  for (let k = 0; k < 40 * PID.lap; k++) {
    h2.scan(g);
    if (!swapped && g.out.eState === E_AFF_STATE.CONV_PROBE) { prog = (j) => [recipeAt([55, 70, 50, 65, 55], PL.SEG, PL.HOLD, j)]; swapped = true; }
    if (g.out.eState === E_AFF_STATE.FAULT) break;
  }
  ck('a DIFFERENT PROGRAM mid-commissioning faults with PROGRAM_CHANGED and removes the trim',
    swapped && g.out.eState === E_AFF_STATE.FAULT && g.out.eReason === E_AFF_REASON.PROGRAM_CHANGED && g.out.aTrim[0] === 0,
    describe(g));
}

// =============================================================================== WOOD–BERRY
{
  console.log('\n  WOOD–BERRY under the published BLT PI pair, two coupled channels');
  const bare = bareLap(WBS);
  const t0 = Date.now();
  const r = commission(WBS, { udiSeed: 3 });
  const { fb, h } = r;
  console.log(`    ${describe(fb)}  (${((Date.now() - t0) / 1000).toFixed(1)} s of Node)`);
  const run = h.laps[h.laps.length - 1];
  const measured = 1 / scoreOf(run, bare);
  console.log(`    bare lap ${bare.map((x) => fx(x, 4)).join(' / ')} → running ${run.map((x) => fx(x, 4)).join(' / ')}: `
    + `${fx(measured, 2)}x measured`);
  ck('it completes on two coupled channels', fb.out.xDone && fb.out.eState === E_AFF_STATE.RUN, describe(fb));
  ck('HARM: the running machine is no worse than the bare BLT loops', measured >= 1 - 1e-9, `${fx(measured)}x`);
  ck('15b: the block\'s own factor agrees with the independent scored run within 1.25x',
    Math.max(measured / fb.out.rFactor, fb.out.rFactor / measured) < 1.25, `${fx(fb.out.rFactor)}x against ${fx(measured)}x`);
  ck(`BUDGET: no scan exceeded ${fb.udiMacBudget} MAC`, fb.out.udiMacPeak <= fb.udiMacBudget, `${fb.out.udiMacPeak}`);
}

// =============================================================================== FOUR CHANNELS
// The block's compile-time maximum, where its largest unit of work (the operator's least-squares
// row at m = 52) sits closest to the budget: a check at one or two channels cannot see it. The
// plant is four closed loops with a first-order response, a dead time and an interaction with the
// next loop's transient (Wood–Berry's kind of coupling, no steady-state offset). Its first version
// coupled through the neighbour's SETPOINT DERIVATIVE at gain 3 — a derivative kick no real loop
// pair has — and the block's own probes then drove errors to 4-5x the baseline peak and its guard,
// correctly, aborted: a plant invented badly, recorded so nobody reads that as a block fault.
// ITS FACTOR IS NOT A RESULT (rule 14, §55): a linear first-order plant with a dead time sits INSIDE
// the conventional basis's own hypothesis class, so the rung inverts it almost exactly and reads
// hundreds of x. Only completion, the budget, no harm and 15b's agreement are asserted here.
{
  console.log('\n  FOUR CHANNELS — the compile-time maximum, where the budget is tightest');
  const TAU4 = [18, 25, 32, 40], DEL4 = 6, SEG4 = 400, HOLD4 = 150;
  const LV = [[0, 1, 0.3, 0], [0.5, 0, 1, 0.5], [0.2, 0.8, 0.1, 0.2], [1, 0.4, 0.7, 1]];
  const ref4 = (k) => LV.map((lv, c) => recipeAt(lv, SEG4, HOLD4, k + c * 60));
  const plant4 = () => {
    const y = [0, 0, 0, 0], hist = [];
    for (let i = 0; i <= DEL4; i++) hist.push([0, 0, 0, 0]);
    return {
      meas: (o) => { for (let c = 0; c < 4; c++) o[c] = y[c]; },
      step: (sp) => {
        hist.push([sp[0], sp[1], sp[2], sp[3]]); hist.shift();
        const d = hist[0];
        const e0 = [0, 1, 2, 3].map((c) => (d[c] - y[c]) / TAU4[c]);
        for (let c = 0; c < 4; c++) y[c] += e0[c] + 0.5 * e0[(c + 1) % 4];
      },
    };
  };
  const S4 = { nc: 4, lap: SEG4 * 3, refAt: ref4, mkPlant: plant4, nAhead: 200 };
  const bare = bareLap(S4);
  const t0 = Date.now();
  const r = commission(S4, { udiSeed: 5 });
  const { fb, h } = r;
  console.log(`    ${describe(fb)}  (${((Date.now() - t0) / 1000).toFixed(1)} s of Node)`);
  console.log('    (a linear plant inside the conventional basis\'s own class — the factor measures the class, not a machine)');
  const measured = 1 / scoreOf(h.laps[h.laps.length - 1], bare);
  ck('it completes at four channels', fb.out.xDone && fb.out.eState === E_AFF_STATE.RUN, describe(fb));
  ck(`BUDGET at four channels: no scan exceeded ${fb.udiMacBudget} MAC (the largest unit is ${affMinBudget(4) - 1500})`,
    fb.out.udiMacPeak <= fb.udiMacBudget, `${fb.out.udiMacPeak}`);
  ck('HARM: no worse than the bare loops', measured >= 1 - 1e-9, `${fx(measured)}x`);
  ck('15b: reported and measured factors agree within 1.25x',
    Math.max(measured / fb.out.rFactor, fb.out.rFactor / measured) < 1.25, `${fx(fb.out.rFactor)}x against ${fx(measured)}x`);
}

console.log(failed ? `\nfb_autoff: ${failed} check(s) FAILED` : '\nfb_autoff: all checks passed');
process.exit(failed ? 1 : 0);
