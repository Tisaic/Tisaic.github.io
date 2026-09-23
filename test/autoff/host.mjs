/**
 * @file The PLC host: one plant, one program, and FB_AutoFF called once per scan.
 *
 * This is the whole of what a machine does around the block, and nothing else — every test drives
 * the block through it, so there is one copy of the contract:
 *
 *   1. write the reference preview (`in.aRefAhead`, now and `nAhead` scans ahead) and the
 *      measurement (`in.aMeas`, in the reference's units);
 *   2. raise `in.xCycleStart` on the scan the program starts a lap;
 *   3. call `cycle()`;
 *   4. apply `out.aRefOut` as the existing loop's setpoint;
 *   5. while `out.xOwnsRef` is TRUE, hold the program counter (the block is exciting the machine).
 *
 * The host SCORES the program as it runs — per completed lap, the rms error of each channel
 * against the reference, with the first 5% of the lap dropped — and never scores the scans the
 * block owns. With `fb` null the setpoint is the reference: the bare loop.
 *
 * `noise` (per channel, in the measurement's units) adds a seeded white noise to what the BLOCK
 * reads, never to what the host scores: every simulated plant here repeats exactly, and a real
 * sensor does not. `edges: false` never raises `xCycleStart`, which is a host that does not say
 * where the lap starts: the program table cannot engage, and the rungs below run alone.
 */
import { FB_AutoFF, AFF_MAX_REACH, affStateName, affReasonName, affVerdictName } from '../../lib/autoff/autoff.js';
import { AFF_MAX_CH } from '../../lib/autoff/runtime.js';

/** Preview the host supplies: enough for the block's widest window on this program. */
export const nAheadFor = (prog) => Math.min(AFF_MAX_REACH, Math.ceil(prog.lap / 8) + 1);

/** A host around a machine `m` (from `await plant.make(prog)`) running `prog`. */
export function hostOn(plant, prog, m, { nAhead = nAheadFor(prog), noise = null, seed = 12345, edges = true } = {}) {
  const nc = plant.nc, lap = prog.lap, drop = Math.ceil(0.05 * lap);
  let s = seed >>> 0;
  const uni = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(uni())) * Math.cos(2 * Math.PI * uni());
  const meas = new Float64Array(AFF_MAX_CH), sp = new Float64Array(nc);
  let pc = 0, lapSs = new Float64Array(nc), lapN = 0, lapK = 0;
  const laps = [];
  let progOn = 0;
  return {
    laps,
    /** Scans on which the block applied its program table. */
    get progOn() { return progOn; },
    get pc() { return pc; },
    /** One scan. `refAt` may be overridden to change the program under the block. */
    scan(fb, refAt = prog.at) {
      m.meas(meas);
      const r0 = refAt(pc);
      if (fb) {
        const A = fb.in.aRefAhead;
        for (let i = 0; i <= nAhead; i++) {
          const r = refAt(pc + i);
          for (let c = 0; c < nc; c++) A[i * AFF_MAX_CH + c] = r[c];
        }
        for (let c = 0; c < nc; c++) fb.in.aMeas[c] = meas[c] + (noise ? noise[c] * gauss() : 0);
        fb.in.xCycleStart = edges && pc % lap === 0;
        fb.cycle();
        if (fb.out.xProgActive) progOn++;
        for (let c = 0; c < nc; c++) sp[c] = fb.out.aRefOut[c];
      } else for (let c = 0; c < nc; c++) sp[c] = r0[c];
      const owned = !!(fb && fb.out.xOwnsRef);
      if (!owned) {
        if (lapK >= drop) { for (let c = 0; c < nc; c++) lapSs[c] += (meas[c] - r0[c]) ** 2; lapN++; }
        lapK++;
      }
      m.step(sp);
      if (!owned && ++pc % lap === 0) {
        laps.push(Array.from(lapSs, (s) => Math.sqrt(s / Math.max(1, lapN))));
        lapSs = new Float64Array(nc); lapN = 0; lapK = 0;
      }
      return sp;
    },
    /** Run whole program laps. */
    run(fb, nLaps) { const want = laps.length + nLaps; while (laps.length < want) this.scan(fb); return laps[laps.length - 1]; },
  };
}

/** A fresh machine settled on `prog`, with a host around it. */
export const makeHost = async (plant, prog, o = {}) => hostOn(plant, prog, await plant.make(prog), o);

/** The block's own score of a lap against a bare lap: rms over channels of the rms ratios. */
export const scoreOf = (lapRms, bareRms) =>
  Math.sqrt(lapRms.reduce((s, r, c) => s + (r / bareRms[c]) ** 2, 0) / lapRms.length);

/** Improvement factor of a lap over the bare lap (above 1 is better). */
export const factorOf = (lapRms, bareRms) => 1 / scoreOf(lapRms, bareRms);

/** The bare loop on a program, settled: its last of `n` laps. */
export const bareLap = async (plant, prog, n = 3) => (await makeHost(plant, prog)).run(null, n);

/**
 * Commission on `plant.main`: two bare laps, press the button, run until DONE (or a lap limit),
 * then `after` production laps. `abortAt` aborts the first time the block enters that state.
 */
export async function commission(plant, cfg = {}, { after = 3, excite = true, abortAt = null, maxLaps = 250, noise = null } = {}) {
  const prog = plant.main;
  const fb = new FB_AutoFF({ nChannels: plant.nc, nAhead: nAheadFor(prog), ...cfg });
  const h = await makeHost(plant, prog, { noise });
  fb.in.xEnable = true; fb.in.xExciteAllowed = excite;
  h.run(fb, 2);
  fb.in.xCommission = true;
  const states = new Set();
  let scans = 0;
  for (const limit = maxLaps * prog.lap; scans < limit; scans++) {
    h.scan(fb);
    states.add(fb.out.eState);
    if (abortAt !== null && fb.out.eState === abortAt) { fb.in.xAbort = true; h.scan(fb); fb.in.xAbort = false; break; }
    if (fb.out.xDone) break;
  }
  fb.in.xCommission = false;
  if (after > 0) h.run(fb, after);
  return { fb, h, states, scans };
}

/**
 * Deploy a saved record on a FRESH machine running `prog`, through `loadRecord` and its washout,
 * exactly as an installation restarts; return the last of `n` laps.
 */
export async function deployOn(plant, prog, record, n = 3, o = {}) {
  const fb = new FB_AutoFF({ nChannels: plant.nc, nAhead: nAheadFor(prog) });
  fb.in.xEnable = true;
  const ok = fb.loadRecord(record);
  const h = await makeHost(plant, prog, o);
  return { ok, fb, h, lap: h.run(fb, n) };
}

const fx = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
export { fx };

/** One line on what the block did — state, the three rungs, and what it cost. */
export function describe(fb) {
  const O = fb.out;
  const rung = (v, r, x) => `${affVerdictName(v)}${r ? '/' + affReasonName(r) : ''} ${fx(x)}x`;
  return `${affStateName(O.eState)}${O.eReason ? ' (' + affReasonName(O.eReason) + ')' : ''} · conventional `
    + `${rung(O.eConvVerdict, O.eConvReason, O.rConvFactor)} · learned ${rung(O.eLearnVerdict, O.eLearnReason, O.rLearnFactor)}`
    + ` · program ${rung(O.eProgVerdict, O.eProgReason, O.rProgFactor)}`
    + ` · total ${fx(O.rFactor)}x · ${O.udiLaps} laps, peak ${O.udiMacPeak} MAC/scan`;
}
