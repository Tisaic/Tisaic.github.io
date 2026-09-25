/**
 * @file FB_AutoFF — the auto-commissioning feedforward trim, as ONE function block.
 *
 * WHAT IT IS. A block that sits between an existing reference source (a recipe generator, a motion
 * planner) and an existing closed loop's setpoint, on N channels, and adds a trim to that setpoint.
 * It commissions itself — press `xCommission` and it identifies, fits, scores every candidate ON THE
 * MACHINE and keeps only what beats the machine as it arrived — and then runs the trim for ever as a
 * few hundred multiply-adds per scan. It never replaces the loop, it never reads the loop's internals,
 * and a correction that does not win is not shipped.
 *
 * WHY IT IS ONE BLOCK, AND WHY THAT IS THE POINT (plan §138). An end-to-end trace of the easiest plant
 * in this project found fourteen defects of ONE shape: a piece of the commissioning loop written twice
 * — once on the library's path and once in a closure a host writes — with nothing checking they
 * agree. The worst of them taught the learned rung on the BARE plant on every plant where the
 * conventional rung ships. This block has no host closures at all. It is CALLED once per scan with
 * the reference and the measurement, and EVERY experiment it runs — the baseline, each probe, each
 * Newton trial, the excitation, each candidate map — is applied by writing it into the live record and
 * calling the same `affDecide` the deployed controller calls. What it scored is what it ships, by
 * construction, and the rung below is always under the rung being taught because there is only one
 * loop.
 *
 * WRITTEN FOR THE ST PORT (IEC 61131-3), which is the next step:
 *   - LREAL throughout (JS `number` is IEEE-754 binary64 — bit-identical arithmetic);
 *   - every array is a typed array sized by a compile-time maximum and allocated in the constructor;
 *     `cycle()` allocates nothing;
 *   - inputs and outputs are fixed-shape structs (`this.in`, `this.out`), set by the caller and read
 *     after `cycle()` exactly as an FB instance's VAR_INPUT / VAR_OUTPUT are;
 *   - heavy work (Gram matrices, Cholesky, the operator solve) runs as RESUMABLE JOBS that stop when
 *     the scan's multiply-add budget is spent and continue next scan — no scan exceeds the budget, and
 *     `out.udiMacPeak` reports the worst one so a test can assert it. A budget too small to hold the
 *     largest single unit of work is refused at construction rather than stalling in the field;
 *   - states and reasons are integer enumerations (`E_AFF_STATE`, `E_AFF_REASON`), names for display.
 *
 * WHAT v1 CONTAINS, and what it does not (stated so nobody reads more into it):
 *   ① the CONVENTIONAL rung — `[a, v, sign v]` per channel plus a bias, the self-tuned PID+FF this
 *     project's portfolio ships on most plants — commissioned IN PRODUCTION on the repeating program,
 *     and tried once more WITHOUT its sign terms (which step the setpoint at every reversal), shipped
 *     so where that is indistinguishable on the gain,
 *     by `ClassicFF`'s own algorithm (unit-slot probes, least-squares operator, damped Newton with
 *     backtracking and a monotone guard);
 *   ①d the TEACHER-FREE learned map — a window of the achieved output fitted onto the reference
 *     correction from a generated EXCITATION, with the conventional rung armed underneath (rule 34),
 *     ridge and applied gain each chosen ON THE MACHINE — and only where the engineer has granted the
 *     block the setpoint for excitation (`xExciteAllowed`);
 *   ③ the PROGRAM TABLE — a correction for each scan of the commissioned program, learned lap by lap
 *     on the machine (P-type iterative learning, its lead and filter width chosen per channel ON THE
 *     MACHINE), with the rungs below armed underneath, and applied only while the reference matches
 *     the program it was learned on: on any other program it fades out and ① and ② run alone.
 *     `xRelearnTable` learns it afresh on the program running now, keeping ① and ② as deployed;
 *   NOT the teacher-taught distilled rung (`hff` + distillation), the cascade, placement scoring, or
 *   any runtime guard beyond the speed coverage fade and the program match. They are named in
 *   `docs/block.md` with the measurement that would justify adding each.
 *
 * THE HOST CONTRACT (what the machine must do), all of it:
 *   - call `cycle()` once per scan, after writing `in.aRefAhead` (the reference NOW and up to
 *     `nAhead` scans ahead, row-major `[i * AFF_MAX_CH + c]`) and `in.aMeas` (each channel's achieved
 *     output, in the SAME UNITS as its reference);
 *   - pulse `in.xCycleStart` TRUE on the scan the repeating program starts (a sequencer already has
 *     this signal), in commissioning AND in production: the block commissions on those laps, and the
 *     program table is indexed from that edge;
 *   - apply `out.aRefOut` as the loop's setpoint;
 *   - while `out.xOwnsRef` is TRUE, HOLD the program (the block is driving the setpoint through its
 *     excitation inside the production envelope and will ramp back to the held value before releasing).
 */
import {
  AFF_MAX_CH, AFF_MAX_NB, AFF_MAX_OFFS, AFF_MAX_FEAT, AFF_MAX_LAP, AFF_SHAPE,
  affNewRecord, affCopyRecord, affFlatten, affFlatSize, affChecksum,
  affFeatures, affZeroIndex, affDecide, affSpeed, affCoverage, affProgMatch,
} from './runtime.js';

export { AFF_MAX_LAP };
/** Compile-time maxima of the commissioning side. */
export const AFF_MAX_REACH = 2048;           // largest window reach, scans
const AFF_MIN_LAP = 32;                      // a lap shorter than this has no 5% drop worth the name
const RING = 2 * AFF_MAX_REACH + 2;          // past samples kept (a fit row reads 2R back)
const MAX_M = AFF_MAX_CH * AFF_MAX_NB;       // conventional operator size (52)
const MAX_MOVES = 256;                       // excitation moves per channel
const RIDGES = [1e-6, 1e-4, 1e-3, 1e-2, 1e-1, 1];   // `distilkit.DEFAULT_RIDGES`, scaled to the diagonal
const GAINS = [0.72, 0.85, 1.15, 1.3];              // `DEFAULT_GAINS` without 1.0, which the ridge laps score
const N_RIDGE = RIDGES.length;
const N_GAIN = GAINS.length;
const PASSES = 8, BACKTRACKS = 5, DEAD_TRIALS = 3;   // `ClassicFF`'s defaults
const ACCEPT = 1e-3;                                 // a trial must beat the best by this fraction
const HEADROOM_MIN = 0.02;                           // `ClassicFF.minHeadroom`
const EXCITE_LAPS = 4;                               // the diet size used on every plant here
const HEALTH_LAPS = 3, HEALTH_FACTOR = 1.5;          // RUN: laps this much worse request a recommission
const SIGN_SHARE = 0.05;                             // ①: the step-free candidate may give up this share of the gain
// THE GUARD DURING THE EXCITATION is twice the guard elsewhere. The guard catches a RUNAWAY, which
// grows without bound; the excitation's error is bounded but larger than the program's, because it
// drives the machine through combinations of pose and speed the program never makes, under a
// conventional rung fitted to the program. Measured on the arm (K 0.25 / E 0.03, 2e-3): routinely
// 3.6x the program's baseline peak, and 4.0x at worst. At 4x that tripped a healthy commissioning.
const EXCITE_GUARD = 2;
// The program table's learning: per channel a (lead, width) candidate, as fractions of the lap, tried
// in this order and changed after PROG_STALLS trials that did not gain PROG_GOOD; the step starts at
// PROG_BETA0 and halves on every trial that made the channel worse. PROG_IDLE trials in a row kept
// on no channel end the learning early.
const PROG_LEADS = [1 / 128, 1 / 64, 1 / 256, 1 / 32];
const PROG_WIDTHS = [1 / 100, 1 / 200];
const N_PROG_CAND = PROG_LEADS.length * PROG_WIDTHS.length;
const PROG_LEAD_MAX = 1 / 32, PROG_WIDTH_MAX = 1 / 100;          // the ladders' largest, for the guard's reach
const PROG_BETA0 = 0.5, PROG_STALLS = 3, PROG_GOOD = 0.02, PROG_IDLE = 2 * PROG_STALLS;
const PROG_MODE_BAR = 0, PROG_MODE_TRIAL = 1, PROG_MODE_MEASURE = 2, PROG_MODE_FINAL = 3;

export const E_AFF_STATE = Object.freeze({
  IDLE: 0, DISARM: 1, WAIT_LAP: 2, RECORD: 3, ANALYSE: 4, CONV_PROBE: 5, CONV_IDENTIFY: 6,
  CONV_REFINE: 7, EXCITE: 8, RETURN: 9, LEARN_WAIT: 10, LEARN_BAR: 11, LEARN_SCORE: 12,
  WASHOUT: 13, RUN: 14, FAULT: 15, PROG_LEARN: 16,
});
export const E_AFF_REASON = Object.freeze({
  NONE: 0, ABORTED: 1, GUARD_TRIPPED: 2, LAP_TOO_LONG: 3, PROGRAM_CHANGED: 4, NO_HEADROOM: 5,
  OPERATOR_SINGULAR: 6, CONV_NO_GAIN: 7, NOT_PERMITTED: 8, NO_PREVIEW: 9, WINDOW_TOO_SHORT: 10,
  LEARN_NO_GAIN: 11, RECORD_REJECTED: 12, SCOPE_CONVENTIONAL: 13, FIT_TOO_FEW_ROWS: 14, DISABLED: 15,
  LAP_TOO_SHORT: 16, BUSY: 17, PROG_NO_GAIN: 18, PROG_OFF: 19, NOT_RUNNING: 20,
});
/** Rung verdicts, per rung, for the report. */
export const E_AFF_VERDICT = Object.freeze({ NOT_RUN: 0, DEPLOYED: 1, REFUSED: 2, SKIPPED: 3 });

const STATE_NAME = Object.fromEntries(Object.entries(E_AFF_STATE).map(([k, v]) => [v, k]));
const REASON_NAME = Object.fromEntries(Object.entries(E_AFF_REASON).map(([k, v]) => [v, k]));
const VERDICT_NAME = Object.fromEntries(Object.entries(E_AFF_VERDICT).map(([k, v]) => [v, k]));
export const affStateName = (s) => STATE_NAME[s] || '?';
export const affReasonName = (r) => REASON_NAME[r] || '?';
export const affVerdictName = (v) => VERDICT_NAME[v] || '?';

/**
 * THE LARGEST SINGLE UNIT OF SLICED WORK, in multiply-adds, for a channel count — plus a margin for
 * the scan's own fixed work. A budget below this could never complete a job, so the constructor
 * refuses it (a configuration error at init, never a commissioning that hangs in the field).
 */
export function affMinBudget(nc) {
  const nb = 3 * nc + 1, m = nb * nc, np = m + 1, n = AFF_MAX_OFFS * nc + 1;
  const units = [np * m + 2 * m * m, 2 * m * m + 4 * m + nc * nb * nb, n * n + n, (n * (n + 1)) / 2 + 4 * n * nc,
    4 * Math.round(AFF_MAX_LAP * PROG_WIDTHS[0]) + 4];
  return Math.max(...units) + 1500;
}

export class FB_AutoFF {
  /**
   * @param {object} cfg  the engineer's configuration — deliberately short
   * @param {number} cfg.nChannels     1..AFF_MAX_CH
   * @param {number} cfg.nAhead        how many scans ahead the reference source can supply (>= 1)
   * @param {number[]} [cfg.aAuthority] largest trim the block may add, per channel, in reference units;
   *                                   0 or absent DERIVES it as 3x the baseline error rms (reported)
   * @param {number} [cfg.udiKey=0]    the plant key — change it when the loop is retuned, and a stored
   *                                   record will no longer load (plan §52.37)
   * @param {number} [cfg.udiMacBudget=10000]  multiply-adds allowed per scan (10% of a 1 ms task)
   * @param {'FULL'|'CONVENTIONAL'} [cfg.sScope='FULL']
   * @param {number} [cfg.udiSeed=1]   excitation seed (deterministic)
   * @param {number} [cfg.rGuardFactor=4]  abort commissioning if |error| exceeds this x the baseline peak
   * @param {number} [cfg.udiProgLaps=60]  laps the program table may spend learning; 0 turns ③ off
   * @param {boolean} [cfg.xKeepSign=false]  TEST ONLY: never try the conventional rung without its sign terms
   */
  constructor(cfg) {
    const nc = cfg.nChannels | 0;
    if (!(nc >= 1 && nc <= AFF_MAX_CH)) throw new Error(`FB_AutoFF: nChannels must be 1..${AFF_MAX_CH}`);
    const nAhead = cfg.nAhead | 0;
    if (!(nAhead >= 1 && nAhead <= AFF_MAX_REACH)) throw new Error(`FB_AutoFF: nAhead must be 1..${AFF_MAX_REACH}`);
    this.nc = nc;
    this.nAhead = nAhead;
    this.udiKey = (cfg.udiKey >>> 0) || 0;
    this.udiMacBudget = cfg.udiMacBudget || 10000;
    const need = affMinBudget(nc);
    if (this.udiMacBudget < need) throw new Error(`FB_AutoFF: udiMacBudget ${this.udiMacBudget} is below the ${need} MAC the largest unit of work needs at ${nc} channel(s)`);
    this.sScope = cfg.sScope === 'CONVENTIONAL' ? 'CONVENTIONAL' : 'FULL';
    this.udiSeed = (cfg.udiSeed >>> 0) || 1;
    this.rGuardFactor = cfg.rGuardFactor > 0 ? cfg.rGuardFactor : 4;
    this.udiProgLaps = cfg.udiProgLaps === undefined ? 60 : Math.max(0, cfg.udiProgLaps | 0);
    this.aAuthCfg = new Float64Array(AFF_MAX_CH);
    for (let c = 0; c < nc; c++) this.aAuthCfg[c] = (cfg.aAuthority && cfg.aAuthority[c] > 0) ? cfg.aAuthority[c] : 0;
    this.xKeepSign = !!cfg.xKeepSign;

    // ---- VAR_INPUT
    this.in = {
      xEnable: false, xCommission: false, xAbort: false, xArm: true, xCycleStart: false,
      xExciteAllowed: false, xRelearnTable: false,
      aRefAhead: new Float64Array((AFF_MAX_REACH + 1) * AFF_MAX_CH),
      aMeas: new Float64Array(AFF_MAX_CH),
    };
    // ---- VAR_OUTPUT
    this.out = {
      aRefOut: new Float64Array(AFF_MAX_CH), aTrim: new Float64Array(AFF_MAX_CH),
      eState: E_AFF_STATE.IDLE, eReason: E_AFF_REASON.NONE,
      xBusy: false, xDone: false, xOwnsRef: false, xDeployed: false, xRecommission: false,
      eConvVerdict: E_AFF_VERDICT.NOT_RUN, eLearnVerdict: E_AFF_VERDICT.NOT_RUN, eProgVerdict: E_AFF_VERDICT.NOT_RUN,
      eConvReason: E_AFF_REASON.NONE, eLearnReason: E_AFF_REASON.NONE, eProgReason: E_AFF_REASON.NONE,
      rFactor: 1, rConvFactor: 1, rLearnFactor: 1, rProgFactor: 1, rCoverage: 1, rHealth: 0,
      xProgActive: false, rProgGain: 0, iPhase: -1,
      rHeadroom: 0, aUMax: new Float64Array(AFF_MAX_CH), xConvSign: false, rConvSignFree: 0,
      udiLaps: 0, udiCommissionScans: 0, udiMacLast: 0, udiMacPeak: 0,
      nLap: 0, nReach: 0, nSettle: 0, nFitRows: 0, nWarmLaps: 0,
    };

    // ---- the records: `rec` is deployed; `live` is what `affDecide` applies THIS scan
    this.rec = affNewRecord();
    this.live = affNewRecord();
    this._flat = new Float64Array(affFlatSize());

    // ---- scratch for the decision (no allocation in a scan)
    this._aB = new Float64Array(AFF_MAX_NB);
    this._aF = new Float64Array(AFF_MAX_FEAT);
    this._aTap = new Float64Array(AFF_MAX_OFFS * AFF_MAX_CH);
    this._aV = new Float64Array(AFF_MAX_CH);
    this._aA = new Float64Array(AFF_MAX_CH);
    this._aR0 = new Float64Array(AFF_MAX_CH);       // the reference NOW, whatever its source
    this._aTarget = new Float64Array(AFF_MAX_CH);   // the trim the decision asks for
    this._aApplied = new Float64Array(AFF_MAX_CH);  // the trim actually applied (faded in and out in RUN)
    this._speed = 0;

    // ---- history rings: the reference as commanded, and the measurement
    this._ringR = new Float64Array(RING * AFF_MAX_CH);
    this._ringY = new Float64Array(RING * AFF_MAX_CH);
    this._ringHead = 0;           // index of the NEWEST sample
    this._ringFill = 0;

    // ---- the production lap, recorded once
    this._lapRef = new Float64Array(AFF_MAX_LAP * AFF_MAX_CH);
    this._lapErr = new Float64Array(AFF_MAX_LAP * AFF_MAX_CH);

    // ---- per-lap accumulators
    this._lapSs = new Float64Array(AFF_MAX_CH);     // sum of squares after the drop
    this._lapRhs = new Float64Array(AFF_MAX_CH * AFF_MAX_NB);  // sum b(k) e_c(k)

    // ---- the production envelope, measured on the recorded lap
    this._envLo = new Float64Array(AFF_MAX_CH); this._envHi = new Float64Array(AFF_MAX_CH);
    this._vPk = new Float64Array(AFF_MAX_CH);
    this._aPk = new Float64Array(AFF_MAX_CH); this._jPk = new Float64Array(AFF_MAX_CH);   // the program's peak a and jerk
    this._epk = new Float64Array(AFF_MAX_CH); this._baseRms = new Float64Array(AFF_MAX_CH);
    this._baseSs = new Float64Array(AFF_MAX_CH);
    this._uMax = new Float64Array(AFF_MAX_CH);
    this._settleC = new Float64Array(AFF_MAX_CH);
    this._holdStart = new Float64Array(AFF_MAX_CH);
    this._lastBad = new Float64Array(AFF_MAX_CH);
    this._tmpOff = new Float64Array(AFF_MAX_OFFS);

    // ---- the conventional rung
    this._nb = 3 * nc + 1; this._m = this._nb * nc;
    this._G = new Float64Array(AFF_MAX_NB * AFF_MAX_NB);       // Gram, then its Cholesky factor
    this._Gram = new Float64Array(AFF_MAX_NB * AFF_MAX_NB);    // Gram, kept for the headroom
    this._E0 = new Float64Array(AFF_MAX_CH * AFF_MAX_NB);      // baseline projection
    this._Ecur = new Float64Array(AFF_MAX_CH * AFF_MAX_NB);    // current best's projection
    this._X = new Float64Array((MAX_M + 1) * MAX_M);            // probe coefficients, row per probe
    this._Y = new Float64Array((MAX_M + 1) * MAX_M);            // projected response, row per probe
    this._A = new Float64Array(MAX_M * MAX_M);                  // X'X, then its Cholesky factor
    this._M = new Float64Array(MAX_M * MAX_M);                  // the operator, then its LU
    this._piv = new Int32Array(MAX_M);
    this._Wacc = new Float64Array(AFF_MAX_CH * AFF_MAX_NB);
    this._Wtrial = new Float64Array(AFF_MAX_CH * AFF_MAX_NB);
    this._bestW = new Float64Array(AFF_MAX_CH * AFF_MAX_NB);
    this._vec = new Float64Array(MAX_M);
    this._vec2 = new Float64Array(MAX_M);
    this._combPk = new Float64Array(AFF_MAX_CH);
    this._trialPk = new Float64Array(AFF_MAX_CH);
    this._trialArmed = false;

    // ---- the learned map
    this._XtX = new Float64Array(AFF_MAX_FEAT * AFF_MAX_FEAT);
    this._XtY = new Float64Array(AFF_MAX_FEAT * AFF_MAX_CH);
    this._Lw = new Float64Array(AFF_MAX_FEAT * AFF_MAX_FEAT);  // work matrix for the Cholesky
    this._rhs = new Float64Array(AFF_MAX_FEAT);
    this._sol = new Float64Array(AFF_MAX_FEAT);
    this._cand = new Float64Array(N_RIDGE * AFF_MAX_CH * AFF_MAX_FEAT);
    this._candOk = new Uint8Array(N_RIDGE);
    this._candScore = new Float64Array(N_RIDGE);
    this._gainScore = new Float64Array(N_GAIN);

    // ---- the excitation program, per channel: move start times, ramps, levels
    this._excT = new Float64Array(AFF_MAX_CH * (MAX_MOVES + 1));
    this._excRamp = new Float64Array(AFF_MAX_CH * MAX_MOVES);
    this._excFrom = new Float64Array(AFF_MAX_CH * MAX_MOVES);
    this._excTo = new Float64Array(AFF_MAX_CH * MAX_MOVES);
    this._excN = new Int32Array(AFF_MAX_CH);
    this._retFrom = new Float64Array(AFF_MAX_CH); this._retTo = new Float64Array(AFF_MAX_CH);
    this._retT = new Float64Array(AFF_MAX_CH);

    // ---- the program table: the kept table, the error it was measured with, the lap being recorded
    this._progU = new Float64Array(AFF_MAX_LAP * AFF_MAX_CH);
    this._progE = new Float64Array(AFF_MAX_LAP * AFF_MAX_CH);
    this._progEn = new Float64Array(AFF_MAX_LAP * AFF_MAX_CH);
    this._progA = new Float64Array(AFF_MAX_LAP);                 // the filter's first pass, one channel
    this._progCi = new Int32Array(AFF_MAX_CH);                   // candidate (lead, width) per channel
    this._progBeta = new Float64Array(AFF_MAX_CH);
    this._progRej = new Int32Array(AFF_MAX_CH);
    this._progRms = new Float64Array(AFF_MAX_CH);                // the kept table's measured rms
    this._progKeep = new Uint8Array(AFF_MAX_CH);                 // job 5: U <- live on this channel
    this._progRestore = new Uint8Array(AFF_MAX_CH);              // job 5: live <- U on this channel
    this._phase = -1; this._progOff = true; this._progGain = 0; this._progClean = false;

    // ---- the display report — NOT part of the ST interface
    this.report = { ridge: 0, gain: 0, bar: 0, ridgeScores: new Float64Array(N_RIDGE), gainScores: new Float64Array(N_GAIN),
      progBar: 0, progLaps: 0, progTrials: 0, progLead: new Float64Array(AFF_MAX_CH), progWidth: new Float64Array(AFF_MAX_CH),
      progBeta: new Float64Array(AFF_MAX_CH) };

    this._state = E_AFF_STATE.IDLE;
    this._prevCycle = false; this._prevCommission = false; this._prevRelearn = false; this._tableOnly = false;
    this._washout = 0; this._rampN = 100; this._healthBad = 0; this._fade = 0; this._progFade = 0;
    this._runOpen = false; this._runK = 0; this._runN = 0;
    this._resetCommission();
  }

  // ======================================================================================= cycle
  /** ONE SCAN. Reads `this.in`, writes `this.out`. */
  cycle() {
    const I = this.in, O = this.out, nc = this.nc, S = E_AFF_STATE;
    this._mac = 0;
    const edgeCycle = I.xCycleStart && !this._prevCycle;
    const edgeComm = I.xCommission && !this._prevCommission;
    const edgeRelearn = I.xRelearnTable && !this._prevRelearn;
    this._prevCycle = I.xCycleStart; this._prevCommission = I.xCommission; this._prevRelearn = I.xRelearnTable;
    // the position in the program's lap, from the host's own lap edge; -1 until the first edge. The
    // program table may engage at an edge only if the lap just ended was ITS program throughout and
    // of its length, because the machine's state at a lap's start is the last lap's doing. While
    // commissioning, where a lap that does not repeat is already a PROGRAM_CHANGED fault, it may.
    if (edgeCycle) {
      const prevOk = this._progClean && this._phase + 1 === this.live.nProgLap;
      this._phase = 0; this._progClean = true;
      this._progOff = !(prevOk || this._commissioning());
    } else if (this._phase >= 0 && ++this._phase >= AFF_MAX_LAP) this._phase = -1;

    if (!I.xEnable) {
      this._ownsRef = false; this._inLap = false; this._runOpen = false;
      O.xDone = false;
      this._enter(S.IDLE, E_AFF_REASON.DISABLED);
      this._fade = 0; this._progFade = 0;
      for (let c = 0; c < nc; c++) { this._aApplied[c] = 0; O.aTrim[c] = 0; O.aRefOut[c] = I.aRefAhead[c]; }
      this._publish();
      return;
    }
    if (this._state === S.IDLE && O.eReason === E_AFF_REASON.DISABLED) O.eReason = E_AFF_REASON.NONE;
    // `xArm` FALSE forces the trim to zero, which would score every experiment as nothing and
    // conclude "no gain" from a measurement that was never taken — so during a commissioning it
    // is an ABORT, stated, and never a silent refusal (rule 25).
    if ((I.xAbort || !I.xArm) && this._commissioning()) this._fault(E_AFF_REASON.ABORTED);
    if (edgeComm && !this._commissioning()) this._startCommission();
    else if (edgeRelearn) this._startRelearn();
    if (this._state === S.IDLE && this._recArmed()) {
      affCopyRecord(this.live, this.rec);
      this._enter(S.WASHOUT);
    }

    // ---- the lap boundary is handled BEFORE this scan's trim: the scan that raises xCycleStart is
    // sample 0 of the new lap, and the next experiment must already be applied to it.
    if (this._laps()) {
      if (edgeCycle) this._lapBoundary();
      else if (this._inLap && ++this._k >= AFF_MAX_LAP) this._fault(E_AFF_REASON.LAP_TOO_LONG);
    }

    // ---- the reference NOW and around it, from whichever source owns it this scan
    this._refNow();
    this._pushRings();
    this._motion();

    // ---- the decision: ALWAYS through affDecide, on the live record
    const learnOn = this.live.xLearnArmed;
    if (learnOn) this._gatherTaps();
    this._progGuard();
    this._mac += affDecide(this.live, this._aTap, this._aV, this._aA, this._speed, this._phase, this._progGain,
      this._aB, this._aF, this._aTarget);
    O.rCoverage = learnOn ? affCoverage(this.live, this._speed) : 1;
    this._applyTrim();

    // ---- bookkeeping for whatever experiment is running
    if (this._commissioning()) {
      O.udiCommissionScans++;
      this._accumulate();
      this._stateStep();
      this._runJobs();
    } else if (this._state === S.WASHOUT) {
      if (++this._washout > this._washoutLen()) { this._enter(S.RUN); this._runOpen = false; }
    } else if (this._state === S.RUN) {
      this._runHealth(edgeCycle);
    }

    for (let c = 0; c < nc; c++) { O.aTrim[c] = this._aApplied[c]; O.aRefOut[c] = this._aR0[c] + this._aApplied[c]; }
    this._publish();
  }

  // ================================================================== lifecycle and persistence
  /** The commissioned controller, with its checksum. Copy it to retentive memory. */
  saveRecord() {
    const r = affCopyRecord(affNewRecord(), this.rec);
    r.udiChecksum = 0;
    const n = affFlatten(r, this._flat);
    r.udiChecksum = affChecksum(this._flat, n);
    return r;
  }

  /**
   * Load a stored controller. FAILS SAFE: any mismatch — version, channel count, plant key or
   * checksum — rejects it, arms nothing, and says why in `out.eReason`. A loaded record starts with
   * a predict-only WASHOUT (TC_NGRC paybacks §7b: after any restore, feed until the history holds
   * real samples) and a bumpless ramp in. Refused while a commissioning is running.
   */
  loadRecord(r) {
    if (this._commissioning()) { this.out.eReason = E_AFF_REASON.BUSY; return false; }
    const n = r ? affFlatten(r, this._flat) : 0;
    const ok = !!r && r.nVersion === this.rec.nVersion && r.nChannels === this.nc && r.udiKey === this.udiKey
      && affChecksum(this._flat, n) === r.udiChecksum;
    if (!ok) { this.out.eReason = E_AFF_REASON.RECORD_REJECTED; return false; }
    affCopyRecord(this.rec, r);
    affCopyRecord(this.live, r);
    this._rampN = Math.max(1, Math.round(0.01 * (r.nLap || 10000)));
    this.out.xDeployed = !!(r.xConvArmed || r.xLearnArmed || r.xProgArmed);
    this._enter(E_AFF_STATE.WASHOUT, E_AFF_REASON.NONE);
    return true;
  }

  _recArmed() { return this.rec.nChannels === this.nc && !!(this.rec.xConvArmed || this.rec.xLearnArmed || this.rec.xProgArmed); }

  _washoutLen() {
    const r = this.live;
    return r.nOffsets > 0 ? 2 * Math.abs(r.aOffsets[r.nOffsets - 1]) + 2 : 2;
  }

  // ======================================================================= the reference sources
  _refNow() {
    const nc = this.nc, R0 = this._aR0;
    if (this._ownsRef) { for (let c = 0; c < nc; c++) R0[c] = this._ownAt(c, this._t); }
    else for (let c = 0; c < nc; c++) R0[c] = this.in.aRefAhead[c];
  }

  /** The reference `o` scans from now on channel c (o <= 0 reads the ring; o > 0 the preview). */
  _refAt(c, o) {
    if (o <= 0) {
      if (o === 0) return this._aR0[c];
      const back = Math.min(-o, this._ringFill - 1);
      return this._ringR[((this._ringHead - back + RING) % RING) * AFF_MAX_CH + c];
    }
    if (this._ownsRef) return this._ownAt(c, this._t + o);
    return this.in.aRefAhead[Math.min(o, this.nAhead) * AFF_MAX_CH + c];
  }

  _pushRings() {
    const nc = this.nc;
    this._ringHead = (this._ringHead + 1) % RING;
    if (this._ringFill < RING) this._ringFill++;
    const b = this._ringHead * AFF_MAX_CH;
    for (let c = 0; c < nc; c++) { this._ringR[b + c] = this._aR0[c]; this._ringY[b + c] = this.in.aMeas[c]; }
    this._mac += 2 * nc;
  }

  /** Velocity and acceleration of the reference, central differences per scan, and the speed. */
  _motion() {
    for (let c = 0; c < this.nc; c++) {
      const p0 = this._refAt(c, -1), p1 = this._aR0[c], p2 = this._refAt(c, 1);
      this._aV[c] = (p2 - p0) * 0.5; this._aA[c] = p2 - 2 * p1 + p0;
    }
    this._speed = affSpeed(this.live, this._aV);
    this._mac += 6 * this.nc;
  }

  _gatherTaps() {
    const L = this.live, nc = this.nc;
    for (let i = 0; i < L.nOffsets; i++) {
      const o = L.aOffsets[i];
      for (let c = 0; c < nc; c++) this._aTap[i * AFF_MAX_CH + c] = this._refAt(c, o);
    }
    this._mac += L.nOffsets * nc;
  }

  /**
   * THE PROGRAM TABLE'S GUARD. The table is right only on the program it was learned on, at the
   * position the host's lap edge gives. From an edge that closed a clean lap of that program, it is
   * on for as long as every scan's reference, now and as far ahead as the table reaches, matches the
   * stored one (`affProgMatch`); the first scan that does not turns it off until an edge that closes a
   * clean lap again. Another program, a program that has been edited, or a lap that runs long never
   * receives a correction learned somewhere else. In RUN the trim's bumpless ramp carries the change.
   */
  _progGuard() {
    const L = this.live;
    if (!L.xProgArmed) { this._progGain = 0; this._progFade = 0; return; }
    const nowOk = !this._ownsRef && affProgMatch(L, this._phase, this.in.aRefAhead, 0);
    if (!nowOk || !affProgMatch(L, this._phase, this.in.aRefAhead, this.nAhead)) { this._progClean = false; this._progOff = true; }
    const raw = this._progOff ? 0 : 1;
    // in RUN the table fades in and out over rampN scans (1% of the lap). A change seen AHEAD fades it
    // (the guard looks as far ahead as the table reaches, about 5% of the lap, so it is out before it
    // would act on the wrong program); a program that differs NOW cuts it at once. During
    // commissioning it switches at once, as every experiment does.
    if (!nowOk) this._progFade = 0;
    else if (this._state === E_AFF_STATE.RUN) {
      const step = 1 / this._rampN;
      this._progFade += raw > this._progFade ? Math.min(step, raw - this._progFade) : -Math.min(step, this._progFade - raw);
    } else this._progFade = raw;
    this._progGain = this._progFade;
    this._mac += 4 * this.nc;
  }

  /**
   * THE TRIM THAT REACHES THE MACHINE. During commissioning each experiment switches at a lap
   * boundary and applies at once — exactly as a scored run in `rigs/ladder.mjs` does — and the 5%
   * drop at the start of each lap keeps the switch out of the score. In RUN, WASHOUT, DISARM and
   * IDLE the whole trim FADES in and out (bumpless) over `rampN` scans, and when faded in it is
   * EXACTLY the decision. A FAULT removes it at once.
   *
   * IT USED TO BE A SLEW LIMIT, at most `uMax / rampN` per scan on the trim itself, in every RUN
   * scan. That is not a fade: it clipped any correction that moves faster, so production ran a
   * slewed copy of what was scored. On the arm on its jerk-limited paths the program table's corner
   * corrections outran it, and the machine settled in production at 3.8e-3 rms per joint against
   * the 7.6e-4 scored (reported 7.35x, 3.42x against the ghost).
   */
  _applyTrim() {
    const nc = this.nc, S = E_AFF_STATE, s = this._state;
    const zero = s === S.WASHOUT || s === S.DISARM || s === S.IDLE || !this.in.xArm;
    const bumpless = s === S.RUN || s === S.WASHOUT || s === S.DISARM || s === S.IDLE;
    if (s === S.FAULT) { this._fade = 0; for (let c = 0; c < nc; c++) this._aApplied[c] = 0; return; }
    if (!bumpless) { this._fade = 1; for (let c = 0; c < nc; c++) this._aApplied[c] = this._aTarget[c]; return; }
    const want = zero ? 0 : 1, step = 1 / this._rampN;
    this._fade += want > this._fade ? Math.min(step, want - this._fade) : -Math.min(step, this._fade - want);
    for (let c = 0; c < nc; c++) this._aApplied[c] = this._fade * this._aTarget[c];
  }

  // ============================================================================ the commissioning
  _commissioning() {
    const s = this._state, S = E_AFF_STATE;
    return s !== S.IDLE && s !== S.RUN && s !== S.WASHOUT && s !== S.FAULT;
  }

  /** States that follow the host's lap (xCycleStart): everything but the excitation and its return. */
  _laps() {
    const s = this._state, S = E_AFF_STATE;
    return s === S.WAIT_LAP || s === S.RECORD || s === S.ANALYSE || s === S.CONV_PROBE
      || s === S.CONV_IDENTIFY || s === S.CONV_REFINE || s === S.LEARN_WAIT
      || s === S.LEARN_BAR || s === S.LEARN_SCORE || s === S.PROG_LEARN;
  }

  _resetCommission() {
    this._inLap = false; this._k = 0; this._lapLen = 0; this._drop = 0; this._q = 0;
    this._lapN = 0; this._lapProgErr = 0; this._envSpan = 0;
    this._job = 0; this._jobI = 0; this._jobJ = 0; this._jobPhase = 0; this._jobDone = true;
    this._noise = 0; this._margin = 0.02; this._best = 1; this._step = 1;
    this._budget = 0; this._dead = 0; this._accepted = 0; this._bar = 1;
    this._candI = 0; this._ridgeBest = -1; this._ownsRef = false; this._t = 0;
    this._excLen = 0; this._retLen = 0; this._reach = 0; this._settle = 0; this._dwell = 0;
    this._headroom = 0; this._re2 = 0; this._settleUnknown = false; this._holdRuns = 0; this._holdTotal = 0;
    this._basisReady = false; this._convRefusedByJob = false; this._warmLaps = 0; this._lapIsWarm = false;
    this._rows = 0; this._XtX.fill(0); this._XtY.fill(0);
    this._candOk.fill(0); this._candScore.fill(0); this._gainScore.fill(0);
    this._convScore = 1; this._learnScore = 1; this._progScore = 1; this._progBar = 1;
    this._progMode = PROG_MODE_BAR; this._progLap0 = 0; this._progUScore = 1; this._progBuild = false;
    this._progInit = false; this._progTrials = 0; this._progSub = 0; this._progSum = 0; this._progIdle = 0;
    this._excSpeedLo = Infinity; this._excSpeedHi = -Infinity;
    this._epk.fill(0);
    this._tableOnly = false;
  }

  _startCommission() {
    this._resetCommission();
    const O = this.out;
    O.xDone = false; O.xRecommission = false; O.rHealth = 0;
    O.eConvVerdict = E_AFF_VERDICT.NOT_RUN; O.eLearnVerdict = E_AFF_VERDICT.NOT_RUN; O.eProgVerdict = E_AFF_VERDICT.NOT_RUN;
    O.eConvReason = E_AFF_REASON.NONE; O.eLearnReason = E_AFF_REASON.NONE; O.eProgReason = E_AFF_REASON.NONE;
    O.udiLaps = 0; O.udiCommissionScans = 0; O.rFactor = 1; O.rConvFactor = 1; O.rLearnFactor = 1; O.rProgFactor = 1;
    O.nFitRows = 0; O.rHeadroom = 0;
    this._healthBad = 0;
    // Disarm first — the baseline is the machine as it ARRIVED — ramped, not stepped.
    this._enter(E_AFF_STATE.DISARM, E_AFF_REASON.NONE);
  }

  /**
   * RELEARN THE PROGRAM TABLE ONLY (`xRelearnTable`, a rising edge, in RUN with a controller
   * deployed). The table belongs to the one program it was learned on; ① and ② transfer. This
   * learns ③ afresh on the program running NOW and leaves ① and ② exactly as the record holds them,
   * every weight, scale, window and authority.
   *
   * It runs the commissioning's own path with the ① and ② stages left out: the trim fades out, a bare
   * lap is recorded and analysed (the baseline, the guard's peak, the lap, the noise — the machine as
   * it arrived on THIS program), then ① and ② come back from the record and the table learns on top
   * of them exactly as it does in a full commissioning, against the bar of ① and ② alone. A table
   * that wins replaces the record's table, lap and baseline; one that does not, and any fault on the
   * way, leaves the deployed record as it was, table and all, and says why in `eReason`. The record
   * holds ONE table: a new one replaces the old, which the old program then no longer has.
   */
  _startRelearn() {
    const O = this.out, R = E_AFF_REASON;
    if (this._commissioning()) { O.eReason = R.BUSY; return; }
    if (this._state !== E_AFF_STATE.RUN || !this._recArmed()) { O.eReason = R.NOT_RUNNING; return; }
    if (this.sScope !== 'FULL') { O.eReason = R.SCOPE_CONVENTIONAL; return; }
    if (!(this.udiProgLaps > 0)) { O.eReason = R.PROG_OFF; return; }
    this._resetCommission();
    this._tableOnly = true;
    O.xDone = false; O.xRecommission = false; O.rHealth = 0;
    O.eProgVerdict = E_AFF_VERDICT.NOT_RUN; O.eProgReason = R.NONE; O.rProgFactor = 1;
    O.udiLaps = 0; O.udiCommissionScans = 0;
    this._healthBad = 0;
    this._enter(E_AFF_STATE.DISARM, R.NONE);
  }

  /**
   * A commissioning that cannot continue. The trim is removed AT ONCE, and if a controller was
   * deployed before this commissioning started it is RESTORED (through a washout and a bumpless
   * ramp) — the last good model is kept (TC_NGRC's CommStore rule) and the reason stays in
   * `out.eReason`. With nothing to restore the block holds in FAULT with no trim until the next
   * `xCommission` or an `xEnable` cycle.
   */
  _fault(reason) {
    this._ownsRef = false; this._inLap = false; this._jobDone = true; this._tableOnly = false;
    for (let c = 0; c < this.nc; c++) this._aApplied[c] = 0;
    this._fade = 0; this._progFade = 0;
    if (this._recArmed()) {
      affCopyRecord(this.live, this.rec);
      this._enter(E_AFF_STATE.WASHOUT, reason);
    } else {
      this._clearLive();
      this._enter(E_AFF_STATE.FAULT, reason);
    }
  }

  _enter(state, reason) {
    this._state = state;
    if (reason !== undefined) this.out.eReason = reason;
    if (state === E_AFF_STATE.WASHOUT) this._washout = 0;
  }

  /** The live record carries only the channel count, the authority and the scales: nothing armed. */
  _clearLive() {
    const L = this.live;
    L.nChannels = this.nc; L.xConvArmed = 0; L.xLearnArmed = 0; L.xProgArmed = 0;
    for (let c = 0; c < AFF_MAX_CH; c++) L.aUMax[c] = this._uMax[c];
  }

  /** The per-scan state work that is not tied to a lap boundary. */
  _stateStep() {
    const s = this._state, S = E_AFF_STATE, nc = this.nc;
    if (s === S.DISARM) {
      let zero = true;
      for (let c = 0; c < nc; c++) if (this._aApplied[c] !== 0) zero = false;
      if (zero) { this._clearLive(); this._enter(S.WAIT_LAP); }
    } else if (s === S.EXCITE) {
      if (++this._t >= this._excLen) this._beginReturn();
    } else if (s === S.RETURN) {
      if (++this._t >= this._retLen) {
        this._ownsRef = false;
        this._enter(S.LEARN_WAIT);
        this._startJob(3);
      }
    }
  }

  // ------------------------------------------------------------------------ per-scan accumulation
  _accumulate() {
    const s = this._state, S = E_AFF_STATE, nc = this.nc, I = this.in;
    if (s === S.EXCITE || s === S.RETURN) {
      for (let c = 0; c < nc; c++) this._guardOne(c, I.aMeas[c] - this._aR0[c], EXCITE_GUARD);
      if (s === S.EXCITE && this._state === S.EXCITE) this._fitRow();
      return;
    }
    if (!this._inLap) return;
    const k = this._k, recording = s === S.RECORD;
    if (!recording && k < this._lapLen) {
      // the program must repeat: the identification assumes it
      for (let c = 0; c < nc; c++) {
        const d = Math.abs(this._aR0[c] - this._lapRef[k * AFF_MAX_CH + c]);
        if (d > this._lapProgErr) this._lapProgErr = d;
      }
      this._mac += nc;
    }
    const scored = !recording && !this._lapIsWarm && k >= this._drop
      && ((s !== S.CONV_REFINE && s !== S.PROG_LEARN) || this._trialArmed);
    const progRec = s === S.PROG_LEARN && !this._lapIsWarm && k < this._lapLen;
    const needB = scored && (s === S.CONV_PROBE || s === S.CONV_REFINE) && k < this._lapLen;
    if (needB) this._basisAt(k, this._aB);
    const nb = this._nb;
    for (let c = 0; c < nc; c++) {
      const e = I.aMeas[c] - this._aR0[c];
      if (recording) {
        if (k < AFF_MAX_LAP) { this._lapRef[k * AFF_MAX_CH + c] = this._aR0[c]; this._lapErr[k * AFF_MAX_CH + c] = e; }
        continue;
      }
      this._guardOne(c, e);
      if (progRec) this._progEn[k * AFF_MAX_CH + c] = e;
      if (scored) this._lapSs[c] += e * e;
      if (needB) { const w = c * AFF_MAX_NB; for (let j = 0; j < nb; j++) this._lapRhs[w + j] += this._aB[j] * e; }
    }
    if (scored) this._lapN++;
    this._mac += 4 * nc + (needB ? nb * nc + 6 * nc : 0);
  }

  /** Armed only once the analysis has finished measuring the baseline peak — never on a partial one. */
  _guardOne(c, e, k = 1) {
    if (this._basisReady && this._epk[c] > 0 && Math.abs(e) > k * this.rGuardFactor * this._epk[c]
        && this._commissioning()) this._fault(E_AFF_REASON.GUARD_TRIPPED);
  }

  /**
   * The conventional basis at lap index k, from the recorded lap (the lap is closed: it wraps).
   * 6 nc MAC, charged by the CALLER as part of its unit — like the dense kernels below.
   */
  _basisAt(k, out) {
    const L = this._lapLen, nc = this.nc, sc = this.live.aConvScale;
    const km = (k - 1 + L) % L, kp = (k + 1) % L;
    for (let c = 0; c < nc; c++) {
      const p0 = this._lapRef[km * AFF_MAX_CH + c], p1 = this._lapRef[k * AFF_MAX_CH + c], p2 = this._lapRef[kp * AFF_MAX_CH + c];
      const v = (p2 - p0) * 0.5, a = p2 - 2 * p1 + p0;
      out[3 * c] = a / sc[3 * c];
      out[3 * c + 1] = v / sc[3 * c + 1];
      out[3 * c + 2] = (v > 0 ? 1 : v < 0 ? -1 : 0) / sc[3 * c + 2];
    }
    out[3 * nc] = 1 / sc[3 * nc];
  }

  /** Score of the lap just closed: rms per channel, normalised to the baseline, then rms over channels. */
  _lapScore() {
    const nc = this.nc;
    let s = 0;
    for (let c = 0; c < nc; c++) {
      const rms = Math.sqrt(this._lapSs[c] / Math.max(1, this._lapN));
      const r = rms / this._baseRms[c];
      s += r * r;
    }
    return Math.sqrt(s / nc);
  }

  /**
   * Open a lap. `experiment` marks a lap that starts a NEW experiment — a probe, a trial, a candidate
   * — which, where the loop's own memory is longer than the 5% drop, is preceded by one unscored
   * WARM-UP lap of the same experiment: the switch at the boundary is a transient the next lap would
   * otherwise score, and measured at four channels it turned every Newton trial into a harm (1.17x)
   * where a lap long enough to outlast it deployed at 3.35x. Whether it is needed is MEASURED — the
   * settle the analysis reads off the production lap's own holds — never assumed.
   */
  _openLap(experiment = false, alwaysWarm = false) {
    this._lapIsWarm = experiment && (alwaysWarm || this._warmLaps > 0);
    this._inLap = true; this._k = 0; this._lapN = 0; this._lapProgErr = 0;
    this._lapSs.fill(0); this._lapRhs.fill(0);
    this.out.udiLaps++;
  }

  // ================================================================================ lap boundaries
  _lapBoundary() {
    const S = E_AFF_STATE, s = this._state;
    const closing = this._inLap, len = this._k + 1;
    if (closing && s !== S.RECORD && s !== S.WAIT_LAP) {
      if (len !== this._lapLen || this._lapProgErr > 1e-9 * (1 + this._envSpan)) return this._fault(E_AFF_REASON.PROGRAM_CHANGED);
    }
    if (closing && this._lapIsWarm) { this._openLap(false); return; }   // warm-up done: now score it
    if (s === S.WAIT_LAP) { this._enter(S.RECORD); this._openLap(); return; }
    if (s === S.RECORD) { if (this._closeRecord(len)) this._openLap(); return; }
    if (s === S.ANALYSE) return this._closeAnalyse();
    if (s === S.CONV_PROBE) return this._closeProbe();
    if (s === S.CONV_IDENTIFY) {
      if (!this._jobDone) { this._openLap(); return; }       // still solving: another bare lap
      if (this._convRefusedByJob) return this._afterConv();
      return this._beginRefine();
    }
    if (s === S.CONV_REFINE) return this._closeTrial();
    if (s === S.LEARN_WAIT) {
      if (!this._jobDone) return;                              // still solving: wait for the next lap
      if (this.out.eLearnVerdict === E_AFF_VERDICT.REFUSED) return this._afterLearn();
      this._setLiveConvOnly(); this._enter(S.LEARN_BAR); this._openLap(true); return;
    }
    if (s === S.LEARN_BAR) return this._closeBar();
    if (s === S.LEARN_SCORE) return this._closeCandidate();
    if (s === S.PROG_LEARN) return this._closeProg();
  }

  // ------------------------------------------------------------------------ RECORD and ANALYSE
  /** Returns true if the analysis lap should open. */
  _closeRecord(len) {
    if (len > AFF_MAX_LAP) { this._fault(E_AFF_REASON.LAP_TOO_LONG); return false; }
    if (len < AFF_MIN_LAP) { this._fault(E_AFF_REASON.LAP_TOO_SHORT); return false; }
    this._lapLen = len;
    this._drop = Math.ceil(0.05 * len);
    this.out.nLap = len;
    this._clearLive();
    this._enter(E_AFF_STATE.ANALYSE);
    this._startJob(1);
    return true;
  }

  _closeAnalyse() {
    if (!this._jobDone) { this._openLap(); return; }   // the analysis needs more scans: another bare lap
    const s2 = this._lapScore();
    this._noise = Math.abs(s2 - 1);                    // two bare laps: the machine's own repeatability
    this._margin = Math.max(0.02, 2 * this._noise);
    this.out.rHeadroom = this._headroom;
    if (this._tableOnly) {                             // a table-only relearn: ① and ② as deployed
      affCopyRecord(this.live, this.rec); this.live.xProgArmed = 0;
      for (let c = 0; c < AFF_MAX_CH; c++) { this._uMax[c] = this.rec.aUMax[c]; this.out.aUMax[c] = this.rec.aUMax[c]; }
      return this._afterLearn();
    }
    if (this._headroom < HEADROOM_MIN) {
      this.out.eConvVerdict = E_AFF_VERDICT.REFUSED; this.out.eConvReason = E_AFF_REASON.NO_HEADROOM;
      return this._afterConv();
    }
    this._q = 0;
    this._setProbe(0);
    this._enter(E_AFF_STATE.CONV_PROBE);
    this._openLap(true);
  }

  /** Probe q: unit slot q of the operator (m slots), then one combined probe, each at the target peak. */
  _setProbe(q) {
    const nc = this.nc, nb = this._nb, m = this._m, L = this.live, x = this._X;
    L.xConvArmed = 1; L.rConvGain = 1; L.nConvBasis = nb;
    L.aConvW.fill(0);
    for (let i = 0; i < m; i++) x[q * MAX_M + i] = 0;
    if (q < m) {
      const c = (q / nb) | 0, j = q % nb;
      const tgt = this._probeTarget(c);
      L.aConvW[c * AFF_MAX_NB + j] = tgt; x[q * MAX_M + c * nb + j] = tgt;
    } else {
      const s = 1 / Math.sqrt(m);
      for (let c = 0; c < nc; c++) {
        const sc = this._combPk[c] > 0 ? this._probeTarget(c) / this._combPk[c] : 0;
        for (let j = 0; j < nb; j++) {
          const w = ((c + j) % 2 ? -s : s) * sc;
          L.aConvW[c * AFF_MAX_NB + j] = w; x[q * MAX_M + c * nb + j] = w;
        }
      }
    }
  }

  _probeTarget(c) { return Math.min(0.25 * this._epk[c], this._uMax[c]); }

  _closeProbe() {
    const q = this._q, nc = this.nc, nb = this._nb, m = this._m;
    // D_q = G^-1 rhs per channel; the response is D_q - E0
    for (let c = 0; c < nc; c++) {
      this._cholSolve(this._G, nb, AFF_MAX_NB, this._lapRhs, c * AFF_MAX_NB, this._vec);
      for (let j = 0; j < nb; j++) this._Y[q * MAX_M + c * nb + j] = this._vec[j] - this._E0[c * AFF_MAX_NB + j];
    }
    this._mac += nc * nb * nb;
    if (q < m) { this._q = q + 1; this._setProbe(this._q); this._openLap(true); return; }
    this._clearLive();
    this._enter(E_AFF_STATE.CONV_IDENTIFY);
    this._startJob(2);
    this._openLap();
  }

  // ----------------------------------------------------------------------------- Newton refine
  _beginRefine() {
    this._Ecur.set(this._E0);
    this._Wacc.fill(0); this._bestW.fill(0);
    this._signTried = false; this._signTrial = false; this.out.xConvSign = false; this.out.rConvSignFree = 0;
    this._best = 1; this._step = 1; this._budget = PASSES + BACKTRACKS; this._dead = 0; this._accepted = 0;
    if (!this._nextTrial()) return this._finishConv();
    this._enter(E_AFF_STATE.CONV_REFINE);
    this._openLap(true);
  }

  /**
   * Build the next Newton trial's DIRECTION. Returns false when refinement is over. The trial is not
   * applied yet: job 4 measures its exact peak over the recorded lap and scales it, and until then
   * the machine runs the best correction so far. That job finishes inside the lap's unscored first
   * 5% (its cost per sample is ~nb·nc against a scan budget of thousands, whatever the lap length),
   * and the lap is not scored until the trial is armed.
   */
  _nextTrial() {
    const nc = this.nc, nb = this._nb, m = this._m, L = this.live;
    if (this._budget <= 0 || this._step < 1 / 32) return false;
    if (!this._accepted && this._dead >= DEAD_TRIALS) return false;
    this._budget--;
    for (let c = 0; c < nc; c++) for (let j = 0; j < nb; j++) this._vec[c * nb + j] = -this._Ecur[c * AFF_MAX_NB + j];
    this._luSolve(this._M, m, MAX_M, this._piv, this._vec, this._vec2);
    for (let c = 0; c < nc; c++) for (let j = 0; j < nb; j++) {
      this._Wtrial[c * AFF_MAX_NB + j] = this._Wacc[c * AFF_MAX_NB + j] + this._step * this._vec2[c * nb + j];
    }
    L.xConvArmed = 1; L.rConvGain = 1; L.nConvBasis = nb;
    for (let i = 0; i < AFF_MAX_CH * AFF_MAX_NB; i++) L.aConvW[i] = this._Wacc[i];
    this._trialArmed = false;
    this._startJob(4);
    this._mac += 2 * m * m + 5 * m;
    return true;
  }

  /**
   * THE CAP SCALES THE CORRECTION, it does not clip it (`classic.js`: clipping makes the applied
   * correction a nonlinear function of the coefficients and the frozen operator stops describing the
   * machine). ONE factor for every channel — the tightest channel's `uMax / peak` — because scaling
   * channels separately bends the direction of a coupled correction the Newton step solved for, which
   * measured at four channels as every trial making the machine WORSE (1.16x-1.18x).
   */
  _armTrial() {
    const nc = this.nc, nb = this._nb, L = this.live;
    let g = 1;
    for (let c = 0; c < nc; c++) if (this._trialPk[c] > this._uMax[c]) g = Math.min(g, this._uMax[c] / this._trialPk[c]);
    for (let c = 0; c < nc; c++) for (let j = 0; j < nb; j++) {
      const w = this._Wtrial[c * AFF_MAX_NB + j] * g;
      this._Wtrial[c * AFF_MAX_NB + j] = w; L.aConvW[c * AFF_MAX_NB + j] = w;
    }
    this._trialArmed = true;
  }

  _closeTrial() {
    const nc = this.nc, nb = this._nb;
    if (!this._trialArmed || this._lapN === 0) { this._openLap(); return; }   // not measured: run it again
    const s = this._lapScore();
    if (this._signTrial) {                    // the step-free candidate: kept if indistinguishable on the gain
      this._signTrial = false;
      const F = 1 / this._best, Fc = 1 / s, band = Math.max(SIGN_SHARE * (F - 1), 2 * this._margin);
      this.out.rConvSignFree = Fc;
      if (Fc >= F - band) { this._best = s; this._bestW.set(this._Wtrial); this.out.xConvSign = false; }
      return this._finishConv();
    }
    if (s < this._best * (1 - ACCEPT)) {
      this._best = s; this._accepted++;
      this._Wacc.set(this._Wtrial); this._bestW.set(this._Wtrial);
      for (let c = 0; c < nc; c++) {
        this._cholSolve(this._G, nb, AFF_MAX_NB, this._lapRhs, c * AFF_MAX_NB, this._vec);
        for (let j = 0; j < nb; j++) this._Ecur[c * AFF_MAX_NB + j] = this._vec[j];
      }
      this._mac += nc * nb * nb;
    } else { this._step /= 2; this._dead++; }
    if (!this._nextTrial()) return this._signFree() ? this._openLap(true) : this._finishConv();
    this._openLap(true);
  }

  /**
   * THE CONVENTIONAL RUNG WITHOUT ITS SIGN TERMS, tried once when the refine ends. Rule 42: among
   * candidates indistinguishable on the gain (within 5% of it, or twice the noise margin), take the
   * cheaper, and here the cheaper one is the one with no steps. `sign v` is a Coulomb model. As a
   * setpoint trim it STEPS at every reversal: on the arm, 0.031 rad on a joint at every corner, which
   * the arm answers with a visible jerk. Where the terms earn their gain they stay: the EMPS axis
   * (real friction), and the arm on the bench cell at 2e-3 (1.68x with them, 1.29x without). Returns
   * false when there is nothing to try.
   */
  _signFree() {
    const nc = this.nc, nb = this._nb, L = this.live;
    if (this._signTried || !(this._best < 1 - this._margin)) return false;
    this._signTried = true;
    let any = false;
    for (let c = 0; c < nc; c++) for (let d = 0; d < nc; d++) if (this._bestW[c * AFF_MAX_NB + 3 * d + 2] !== 0) any = true;
    this.out.xConvSign = any;                 // what ships unless the step-free candidate wins
    if (!any || this.xKeepSign) return false;
    for (let i = 0; i < AFF_MAX_CH * AFF_MAX_NB; i++) this._Wtrial[i] = this._bestW[i];
    for (let c = 0; c < nc; c++) for (let d = 0; d < nc; d++) this._Wtrial[c * AFF_MAX_NB + 3 * d + 2] = 0;
    L.xConvArmed = 1; L.rConvGain = 1; L.nConvBasis = nb;
    for (let i = 0; i < AFF_MAX_CH * AFF_MAX_NB; i++) L.aConvW[i] = this._bestW[i];
    this._trialArmed = false; this._signTrial = true;
    this._startJob(4);
    this._mac += nc * nb;
    return true;
  }

  _finishConv() {
    const O = this.out, nc = this.nc, nb = this._nb, L = this.live;
    if (this._best < 1 - this._margin) {
      L.xConvArmed = 1; L.rConvGain = 1; L.nConvBasis = nb;
      L.aConvW.fill(0);
      for (let c = 0; c < nc; c++) for (let j = 0; j < nb; j++) L.aConvW[c * AFF_MAX_NB + j] = this._bestW[c * AFF_MAX_NB + j];
      this._convScore = this._best;
      O.eConvVerdict = E_AFF_VERDICT.DEPLOYED; O.rConvFactor = 1 / this._best;
    } else {
      L.xConvArmed = 0;
      this._convScore = 1;
      O.eConvVerdict = E_AFF_VERDICT.REFUSED; O.eConvReason = E_AFF_REASON.CONV_NO_GAIN;
    }
    this._afterConv();
  }

  // ------------------------------------------------------------------------ the learned map
  _afterConv() {
    const O = this.out;
    const skip = (why) => { O.eLearnVerdict = E_AFF_VERDICT.SKIPPED; O.eLearnReason = why; this._afterLearn(); };
    if (this.sScope !== 'FULL') return skip(E_AFF_REASON.SCOPE_CONVENTIONAL);
    if (!this.in.xExciteAllowed) return skip(E_AFF_REASON.NOT_PERMITTED);
    if (this._reach < 8) return skip(this.nAhead < 8 ? E_AFF_REASON.NO_PREVIEW : E_AFF_REASON.WINDOW_TOO_SHORT);
    this._inLap = false;
    this._planExcitation();
    this._ownsRef = true; this._t = 0;
    this._enter(E_AFF_STATE.EXCITE);
  }

  /**
   * THE EXCITATION IS GENERATED FROM THE PRODUCTION LAP ITSELF: every channel moves independently
   * between levels drawn inside the production envelope, at no more than the production's own peak
   * rate (rule 41b — a diet built to the declared limits describes a machine the program does not
   * run), holding for about the production's own dwell. Four production laps long, the diet size
   * used on every plant in this project. Deterministic from `udiSeed`. Moves continue past the end
   * so the look-ahead at the last excitation scans reads the plan and not the return.
   */
  _planExcitation() {
    const nc = this.nc;
    let s = this.udiSeed >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const len = EXCITE_LAPS * this._lapLen + 2 * this._reach;
    for (let c = 0; c < nc; c++) {
      let t = 0, lvl = this._aR0[c], n = 0;
      const lo = this._envLo[c], hi = this._envHi[c];
      const vpk = Math.max(this._vPk[c], 1e-12 * (1 + Math.abs(hi) + Math.abs(lo)));
      const base = c * (MAX_MOVES + 1);
      while (t < len + this._reach && n < MAX_MOVES) {
        const to = lo + (hi - lo) * rnd();
        const ramp = this._moveT(c, to - lvl, vpk);
        const hold = Math.max(1, Math.round(this._dwell * (0.5 + rnd())));
        const i = c * MAX_MOVES + n;
        this._excT[base + n] = t;
        this._excRamp[i] = ramp; this._excFrom[i] = lvl; this._excTo[i] = to;
        t += ramp + hold; lvl = to; n++;
      }
      this._excT[base + n] = t;
      this._excN[c] = n;
    }
    this._excLen = len;
  }

  /**
   * HOW LONG A MOVE OF `d` TAKES, as a quintic that exceeds none of the program's own peaks: speed
   * (1.875 d / T), acceleration (5.77 d / T^2) and jerk (60 d / T^3). Rule 41: an excitation sized
   * from the program's peak SPEED alone asked, on a short move, for ~150x the program's peak
   * acceleration. On the soft arm (K 0.25 / E 0.01) that shook the links until the guard tripped.
   */
  _moveT(c, d, vpk) {
    const x = Math.abs(d), apk = this._aPk[c], jpk = this._jPk[c];
    let T = 1.875 * x / vpk;
    if (apk > 0) T = Math.max(T, Math.sqrt(5.7735 * x / apk));
    if (jpk > 0) T = Math.max(T, Math.cbrt(60 * x / jpk));
    return Math.max(2, Math.ceil(T));
  }

  /** The block's own reference at time t, channel c: the excitation plan, or in RETURN the ramp home. */
  _ownAt(c, t) {
    if (this._state === E_AFF_STATE.RETURN) {
      const T = this._retT[c];
      if (!(T > 0) || t >= T) return this._retTo[c];
      if (t <= 0) return this._retFrom[c];
      const u = t / T;
      return this._retFrom[c] + (this._retTo[c] - this._retFrom[c]) * u * u * u * (10 - 15 * u + 6 * u * u);
    }
    const n = this._excN[c], base = c * (MAX_MOVES + 1);
    if (n === 0) return this._aR0[c];
    let lo = 0, hi = n - 1;                                  // the last move starting at or before t
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this._excT[base + mid] <= t) lo = mid; else hi = mid - 1; }
    const i = c * MAX_MOVES + lo, dt = t - this._excT[base + lo], T = this._excRamp[i];
    if (dt <= 0) return this._excFrom[i];
    if (dt >= T) return this._excTo[i];
    const u = dt / T;
    return this._excFrom[i] + (this._excTo[i] - this._excFrom[i]) * u * u * u * (10 - 15 * u + 6 * u * u);
  }

  /** Back to the HELD production value, at the production's own rate. */
  _beginReturn() {
    const nc = this.nc;
    let len = 1;
    for (let c = 0; c < nc; c++) {
      this._retFrom[c] = this._aR0[c];
      this._retTo[c] = this.in.aRefAhead[c];
      this._retT[c] = this._moveT(c, this._retTo[c] - this._retFrom[c], Math.max(this._vPk[c], 1e-300));
      if (this._retT[c] > len) len = this._retT[c];
    }
    this._retLen = len + 1;
    this._t = 0;
    this._enter(E_AFF_STATE.RETURN);
  }

  /**
   * ONE FIT ROW, R scans late so its window can straddle it: the achieved output around t = now - R,
   * onto the correction the reference needed there, c(t) - y(t). The conventional rung is armed
   * underneath while this runs, because it is the same loop that deploys (rule 34). Rows start once
   * the whole window lies inside the excitation, so nothing measured under a Newton trial enters.
   */
  _fitRow() {
    const R = this._reach, nc = this.nc, L = this.live;
    if (this._speed < this._excSpeedLo) this._excSpeedLo = this._speed;
    if (this._speed > this._excSpeedHi) this._excSpeedHi = this._speed;
    if (this._t < 2 * R) return;
    const cen = (this._ringHead - R + RING) % RING;
    for (let i = 0; i < L.nOffsets; i++) {
      const idx = ((cen + L.aOffsets[i]) % RING + RING) % RING;
      for (let c = 0; c < nc; c++) this._aTap[i * AFF_MAX_CH + c] = this._ringY[idx * AFF_MAX_CH + c];
    }
    const n = affFeatures(nc, L.nOffsets, affZeroIndex(L), L.aXScale, this._aTap, this._aF);
    const f = this._aF;
    for (let c = 0; c < nc; c++) this._rhs[c] = this._ringR[cen * AFF_MAX_CH + c] - this._ringY[cen * AFF_MAX_CH + c];
    for (let i = 0; i < n; i++) {
      const fi = f[i], row = i * AFF_MAX_FEAT;
      for (let j = i; j < n; j++) this._XtX[row + j] += fi * f[j];
      for (let c = 0; c < nc; c++) this._XtY[i * AFF_MAX_CH + c] += fi * this._rhs[c];
    }
    this._rows++;
    this.out.nFitRows = this._rows;
    this._mac += (n * (n + 1)) / 2 + n * nc + L.nOffsets * nc + 2 * n;
  }

  _setLiveConvOnly() {
    const L = this.live;
    L.xLearnArmed = 0;
    if (this.out.eConvVerdict !== E_AFF_VERDICT.DEPLOYED) L.xConvArmed = 0;
  }

  _closeBar() {
    this._bar = this._lapScore();
    this.report.bar = this._bar;
    this._candI = -1;
    this._nextCandidate();
  }

  /** Arm the next ridge candidate (gain 1), then each gain on the best ridge. */
  _nextCandidate() {
    const L = this.live, nc = this.nc, n = L.nFeat;
    this._candI++;
    while (this._candI < N_RIDGE && !this._candOk[this._candI]) this._candI++;
    let r = -1, gain = 1;
    if (this._candI < N_RIDGE) r = this._candI;
    else if (this._ridgeBest >= 0 && this._candI - N_RIDGE < N_GAIN) { r = this._ridgeBest; gain = GAINS[this._candI - N_RIDGE]; }
    if (r < 0) return this._finishLearn();
    const b = r * AFF_MAX_CH * AFF_MAX_FEAT;
    for (let c = 0; c < nc; c++) for (let j = 0; j < n; j++) L.aLearnW[c * AFF_MAX_FEAT + j] = this._cand[b + c * AFF_MAX_FEAT + j];
    L.rLearnGain = gain; L.xLearnArmed = 1;
    L.rSpeedLo = this._excSpeedLo; L.rSpeedHi = this._excSpeedHi; L.rFade = 0.25;
    this._enter(E_AFF_STATE.LEARN_SCORE);
    this._openLap(true);
  }

  _closeCandidate() {
    const s = this._lapScore();
    if (this._candI < N_RIDGE) {
      this._candScore[this._candI] = s; this.report.ridgeScores[this._candI] = s;
      if (this._ridgeBest < 0 || s < this._candScore[this._ridgeBest]) this._ridgeBest = this._candI;
    } else {
      this._gainScore[this._candI - N_RIDGE] = s; this.report.gainScores[this._candI - N_RIDGE] = s;
    }
    this._nextCandidate();
  }

  _finishLearn() {
    const O = this.out, L = this.live, nc = this.nc, n = L.nFeat;
    let best = this._ridgeBest >= 0 ? this._candScore[this._ridgeBest] : Infinity, gain = 1;
    for (let g = 0; g < N_GAIN; g++) if (this._gainScore[g] > 0 && this._gainScore[g] < best) { best = this._gainScore[g]; gain = GAINS[g]; }
    if (this._ridgeBest >= 0 && best < this._bar * (1 - this._margin)) {
      const b = this._ridgeBest * AFF_MAX_CH * AFF_MAX_FEAT;
      for (let c = 0; c < nc; c++) for (let j = 0; j < n; j++) L.aLearnW[c * AFF_MAX_FEAT + j] = this._cand[b + c * AFF_MAX_FEAT + j];
      L.rLearnGain = gain; L.xLearnArmed = 1;
      this._learnScore = best;
      O.eLearnVerdict = E_AFF_VERDICT.DEPLOYED; O.rLearnFactor = this._bar / best;
      this.report.ridge = RIDGES[this._ridgeBest]; this.report.gain = gain;
    } else {
      L.xLearnArmed = 0;
      O.eLearnVerdict = E_AFF_VERDICT.REFUSED; O.eLearnReason = E_AFF_REASON.LEARN_NO_GAIN;
    }
    this._afterLearn();
  }

  // ------------------------------------------------------------------------ ③ the program table
  /**
   * ③ THE PROGRAM TABLE, learned on the commissioned program itself, with ① and ② armed underneath as
   * they will run (rule 34). Each trial is U' = Q(U − β·e(k + τ)) per channel — the last kept table
   * less a step of the error it was measured with, read τ scans AHEAD because the loop answers late,
   * then Q, a circular moving average of half-width W applied twice, which keeps what the loop can
   * follow and drops what it cannot. Neither τ nor W has a closed form on a machine the block cannot
   * see inside (rule 40), so each channel tries a candidate (τ, W) from a ladder scaled to the lap
   * and moves on after PROG_STALLS trials that did not gain PROG_GOOD. Every trial is scored ON THE
   * MACHINE: a channel keeps its trial only if its own lap rms fell, and a trial kept on some channels
   * and not others is measured again as kept, so every score the rung carries is a lap of exactly the
   * table it holds. It deploys only if its measured lap beats the lap measured without it (the bar).
   */
  _afterLearn() {
    const O = this.out, nc = this.nc, L = this.live;
    const skip = (why) => { O.eProgVerdict = E_AFF_VERDICT.SKIPPED; O.eProgReason = why; this._finish(); };
    if (this.sScope !== 'FULL') return skip(E_AFF_REASON.SCOPE_CONVENTIONAL);
    if (!(this.udiProgLaps > 0)) return skip(E_AFF_REASON.PROG_OFF);
    for (let c = 0; c < nc; c++) {
      this._progCi[c] = 0; this._progBeta[c] = PROG_BETA0; this._progRej[c] = 0; this._progRms[c] = 0;
      this._progKeep[c] = 0; this._progRestore[c] = 0;
    }
    L.xProgArmed = 0; L.nProgLap = this._lapLen; L.rProgTol = 1e-6 * (1 + this._envSpan);
    // the farthest the table's correction reaches: the longest lead and the two filter passes
    L.nProgAhead = Math.round(PROG_LEAD_MAX * this._lapLen) + 2 * Math.round(PROG_WIDTH_MAX * this._lapLen);
    this._progLap0 = this.out.udiLaps; this._progTrials = 0; this._progIdle = 0;
    this._progMode = PROG_MODE_BAR; this._progInit = true; this._progBuild = false;
    this._trialArmed = false;
    this._enter(E_AFF_STATE.PROG_LEARN);
    this._startJob(5);                        // the stored program and a zero table, then armed
    this._openLap(true, true);
  }

  _closeProg() {
    const nc = this.nc;
    if (!this._trialArmed || this._lapN === 0) { this._openLap(); return; }   // not measured: run it again
    const score = this._lapScore();
    const mode = this._progMode;
    let heldIsLive = true;                    // does the live table equal the kept one after this lap?
    for (let c = 0; c < nc; c++) { this._progKeep[c] = 0; this._progRestore[c] = 0; }
    if (mode === PROG_MODE_FINAL) return this._finishProg(score);
    if (mode === PROG_MODE_BAR || mode === PROG_MODE_MEASURE) {
      if (mode === PROG_MODE_BAR) { this._progBar = score; this.report.progBar = score; }
      for (let c = 0; c < nc; c++) this._progRms[c] = Math.sqrt(this._lapSs[c] / this._lapN);
      this._progSwapE();
      this._progUScore = score;
    } else {
      this._progTrials++;
      let all = true, any = false;
      for (let c = 0; c < nc; c++) {
        const r = Math.sqrt(this._lapSs[c] / this._lapN), was = this._progRms[c];
        const imp = r < was, good = r < was * (1 - PROG_GOOD);
        if (imp) { this._progKeep[c] = 1; any = true; } else { this._progRestore[c] = 1; all = false; this._progBeta[c] *= 0.5; }
        if (good) this._progRej[c] = 0;
        else if (++this._progRej[c] >= PROG_STALLS) {
          this._progCi[c] = (this._progCi[c] + 1) % N_PROG_CAND; this._progRej[c] = 0;
          this._progBeta[c] = Math.min(PROG_BETA0, 4 * this._progBeta[c]);
        }
      }
      if (all) {                              // the lap just scored IS the kept table: its measurement stands
        for (let c = 0; c < nc; c++) this._progRms[c] = Math.sqrt(this._lapSs[c] / this._lapN);
        this._progSwapE();
        this._progUScore = score;
      } else heldIsLive = false;
      this._progIdle = any ? 0 : this._progIdle + 1;
      if (!all && any) {                      // kept on some channels only: measure what is now held
        if (this._progLapsLeft() < 1) return this._progFinal();
        this._progMode = PROG_MODE_MEASURE; this._progBuild = false;
        return this._progLap();
      }
    }
    // the next trial, if the budget holds one; otherwise deploy what is held
    if (this._progLapsLeft() < 1 || this._progIdle >= PROG_IDLE) return heldIsLive ? this._finishProg(this._progUScore) : this._progFinal();
    this._progMode = PROG_MODE_TRIAL; this._progBuild = true;
    return this._progLap();
  }

  /** Laps the budget still allows, each experiment a warm-up lap and a scored one. */
  _progLapsLeft() { return Math.floor((this.udiProgLaps - (this.out.udiLaps - this._progLap0)) / 2); }

  /**
   * Every table is measured on its SECOND lap, whatever the settle says: the learning reads the
   * error of a lap as the answer to that lap's table alone, which holds only once the machine is
   * periodic under it. Scored on its first lap, the arm learned 3.3x/2.0x and then stalled.
   */
  _progLap() {
    this._trialArmed = false;
    this._startJob(5);
    this._openLap(true, true);
  }

  /** The last trial was not kept everywhere: restore the kept table and measure it as deployed. */
  _progFinal() {
    this._progMode = PROG_MODE_FINAL; this._progBuild = false;
    for (let c = 0; c < this.nc; c++) this._progRestore[c] = this._progKeep[c] ? 0 : 1;
    this._progLap();
  }

  /** The lap just recorded becomes the error the next trial learns from (a buffer swap, no copy). */
  _progSwapE() { const t = this._progE; this._progE = this._progEn; this._progEn = t; }

  _finishProg(score) {
    const O = this.out, L = this.live, nc = this.nc;
    this.report.progLaps = O.udiLaps - this._progLap0; this.report.progTrials = this._progTrials;
    for (let c = 0; c < nc; c++) {
      const ci = this._progCi[c];
      this.report.progLead[c] = this._progLead(ci); this.report.progWidth[c] = this._progWidth(ci);
      this.report.progBeta[c] = this._progBeta[c];
    }
    if (score < this._progBar * (1 - this._margin)) {
      L.xProgArmed = 1;
      this._progScore = score;
      O.eProgVerdict = E_AFF_VERDICT.DEPLOYED; O.rProgFactor = this._progBar / score;
    } else {
      L.xProgArmed = 0;
      O.eProgVerdict = E_AFF_VERDICT.REFUSED; O.eProgReason = E_AFF_REASON.PROG_NO_GAIN;
    }
    this._finish();
  }

  _progLead(ci) { return Math.max(0, Math.round(PROG_LEADS[(ci / PROG_WIDTHS.length) | 0] * this._lapLen)); }
  _progWidth(ci) { return Math.max(1, Math.round(PROG_WIDTHS[ci % PROG_WIDTHS.length] * this._lapLen)); }

  /** Commissioning ends: what passed becomes the deployed record. */
  _finish() {
    const O = this.out, L = this.live, nc = this.nc;
    this._ownsRef = false; this._inLap = false;
    if (this._tableOnly && !L.xProgArmed) {            // a relearn that did not win: the record stands
      this._tableOnly = false;
      affCopyRecord(L, this.rec);
      O.xDone = true;
      this._rampN = Math.max(1, Math.round(0.01 * (this.rec.nLap || 10000)));
      this._healthBad = 0; this._runOpen = false;
      this._enter(E_AFF_STATE.RUN, O.eProgReason || E_AFF_REASON.PROG_NO_GAIN);
      return;
    }
    this._tableOnly = false;
    L.nVersion = this.rec.nVersion; L.nChannels = nc; L.udiKey = this.udiKey; L.nLap = this._lapLen;
    for (let c = 0; c < AFF_MAX_CH; c++) { L.aUMax[c] = this._uMax[c]; L.aBaseRms[c] = c < nc ? this._baseRms[c] : 0; }
    const score = L.xProgArmed ? this._progScore : L.xLearnArmed ? this._learnScore : L.xConvArmed ? this._convScore : 1;
    L.rBestScore = score;
    L.udiChecksum = 0;
    affCopyRecord(this.rec, L);
    O.rFactor = 1 / score;
    O.xDeployed = !!(L.xConvArmed || L.xLearnArmed || L.xProgArmed);
    O.xDone = true;
    this._rampN = Math.max(1, Math.round(0.01 * this._lapLen));
    this._healthBad = 0; this._runOpen = false;
    this._enter(E_AFF_STATE.RUN, E_AFF_REASON.NONE);
  }

  /**
   * RUN: each complete lap OF THE COMMISSIONED LENGTH is scored against the commissioned score, on
   * the baseline the commissioning measured. Three laps in a row worse than `HEALTH_FACTOR` x the
   * commissioned score raise `xRecommission` — a REQUEST, never an action. A lap of another length
   * is another program and is not scored (`rHealth` reads 0 = not measured, rule 25).
   */
  _runHealth(edge) {
    const nc = this.nc, R = this.rec, O = this.out;
    if (edge) {
      if (this._runOpen && this._runK === R.nLap && this._runN > 0 && R.rBestScore > 0) {
        let s = 0;
        for (let c = 0; c < nc; c++) {
          const r = Math.sqrt(this._lapSs[c] / this._runN) / (R.aBaseRms[c] || 1);
          s += r * r;
        }
        const ratio = Math.sqrt(s / nc) / R.rBestScore;
        O.rHealth = ratio;
        this._healthBad = ratio > HEALTH_FACTOR ? this._healthBad + 1 : 0;
        if (this._healthBad >= HEALTH_LAPS) O.xRecommission = true;
      } else if (this._runOpen) O.rHealth = 0;
      this._runOpen = true; this._runK = 0; this._runN = 0; this._lapSs.fill(0);
    }
    if (!this._runOpen) return;
    if (this._runK >= Math.ceil(0.05 * R.nLap)) {
      for (let c = 0; c < nc; c++) { const e = this.in.aMeas[c] - this._aR0[c]; this._lapSs[c] += e * e; }
      this._runN++;
      this._mac += 2 * nc;
    }
    if (++this._runK > AFF_MAX_LAP) this._runOpen = false;
  }

  // =============================================================================== sliced jobs
  _startJob(id) { this._job = id; this._jobI = 0; this._jobJ = 0; this._jobPhase = 0; this._jobDone = false; this._phaseInit = false; }

  /** Spend what is left of this scan's budget on the current job. Each job returns when out of budget. */
  _runJobs() {
    if (this._jobDone || !this._commissioning()) return;
    const limit = this.udiMacBudget;
    let spins = 0;
    while (!this._jobDone && this._mac < limit && spins++ < 64) {
      const before = this._mac;
      if (this._job === 1) this._jobAnalyse(limit);
      else if (this._job === 2) this._jobIdentify(limit);
      else if (this._job === 3) this._jobSolve(limit);
      else if (this._job === 4) this._jobPeak(limit);
      else if (this._job === 5) this._jobProg(limit);
      else this._jobDone = true;
      if (this._mac === before && !this._jobDone) break;      // out of budget for the next unit
    }
  }

  /**
   * JOB 1 — ANALYSE THE RECORDED LAP. Phase 0: envelope, basis scales (unit peak), baseline error
   * statistics and the derived authority. Phase 1: Gram matrix, baseline projection, combined-probe
   * peak, holds and settle, the error energy. Phase 2: the Gram's Cholesky row by row, the baseline
   * projection and the headroom per channel, then the window. Each unit is charged before it runs.
   */
  _jobAnalyse(limit) {
    const nc = this.nc, nb = this._nb, Lp = this._lapLen, L = this.live;
    if (this._jobPhase === 0) {
      if (this._jobI === 0 && !this._phaseInit) {
        if (this._mac + 4 * nc + AFF_MAX_NB > limit) return;
        this._phaseInit = true;
        for (let c = 0; c < nc; c++) {
          this._envLo[c] = Infinity; this._envHi[c] = -Infinity; this._vPk[c] = 0; this._aPk[c] = 0; this._jPk[c] = 0;
          this._baseSs[c] = 0; this._epk[c] = 0;
        }
        L.aConvScale.fill(0);
        this._mac += 4 * nc;
      }
      const cost = 20 * nc;
      while (this._jobI < Lp && this._mac + cost < limit) {
        const k = this._jobI, km = (k - 1 + Lp) % Lp, kp = (k + 1) % Lp, kpp = (k + 2) % Lp;
        for (let c = 0; c < nc; c++) {
          const p0 = this._lapRef[km * AFF_MAX_CH + c], p1 = this._lapRef[k * AFF_MAX_CH + c], p2 = this._lapRef[kp * AFF_MAX_CH + c];
          const v = (p2 - p0) * 0.5, a = p2 - 2 * p1 + p0, e = this._lapErr[k * AFF_MAX_CH + c];
          const jk = Math.abs(this._lapRef[kpp * AFF_MAX_CH + c] - 3 * p2 + 3 * p1 - p0);   // one scan's change of a
          if (Math.abs(a) > this._aPk[c]) this._aPk[c] = Math.abs(a);
          if (jk > this._jPk[c]) this._jPk[c] = jk;
          if (p1 < this._envLo[c]) this._envLo[c] = p1;
          if (p1 > this._envHi[c]) this._envHi[c] = p1;
          if (Math.abs(v) > this._vPk[c]) this._vPk[c] = Math.abs(v);
          if (Math.abs(a) > L.aConvScale[3 * c]) L.aConvScale[3 * c] = Math.abs(a);
          if (v !== 0) L.aConvScale[3 * c + 2] = 1;
          if (Math.abs(e) > this._epk[c]) this._epk[c] = Math.abs(e);
          if (k >= this._drop) this._baseSs[c] += e * e;
        }
        this._mac += cost; this._jobI++;
      }
      if (this._jobI < Lp || this._mac + 10 * nc + nb > limit) return;
      let span = 0;
      const nScored = Math.max(1, Lp - this._drop);
      for (let c = 0; c < nc; c++) {
        L.aConvScale[3 * c + 1] = this._vPk[c];
        this._baseRms[c] = Math.sqrt(this._baseSs[c] / nScored) || 1e-300;
        this._uMax[c] = this.aAuthCfg[c] > 0 ? this.aAuthCfg[c] : 3 * this._baseRms[c];
        this.out.aUMax[c] = this._uMax[c];
        span = Math.max(span, Math.abs(this._envHi[c]), Math.abs(this._envLo[c]));
      }
      for (let j = 0; j < nb; j++) if (!(L.aConvScale[j] > 0)) L.aConvScale[j] = 1;
      L.aConvScale[nb - 1] = 1;
      this._envSpan = span;
      this._clearLive();                                // copies the authority into the live record
      this._basisReady = true;
      this._G.fill(0); this._lapRhs.fill(0); this._combPk.fill(0);
      this._settleC.fill(0); this._holdStart.fill(-1); this._lastBad.fill(-1);
      this._settleUnknown = false; this._holdRuns = 0; this._holdTotal = 0; this._re2 = 0;
      this._jobPhase = 1; this._jobI = 0;
      this._mac += 10 * nc + nb;
      return;
    }
    if (this._jobPhase === 1) {
      const B = this._aB, s = 1 / Math.sqrt(this._m);
      const cost = (nb * (nb + 1)) / 2 + 3 * nb * nc + 22 * nc;   // 6 nc of it is `_basisAt`
      while (this._jobI <= Lp && this._mac + cost < limit) {
        const k = this._jobI;
        if (k < Lp) {
          // the combined probe's peak over the WHOLE lap (it is applied over the whole lap); the Gram,
          // the projection and the energy on the SCORED support, the samples every lap's rhs sees
          this._basisAt(k, B);
          const onSupport = k >= this._drop;
          if (onSupport) for (let i = 0; i < nb; i++) { const bi = B[i]; for (let j = i; j < nb; j++) this._G[i * AFF_MAX_NB + j] += bi * B[j]; }
          for (let c = 0; c < nc; c++) {
            const e = this._lapErr[k * AFF_MAX_CH + c];
            let comb = 0;
            for (let j = 0; j < nb; j++) {
              if (onSupport) this._lapRhs[c * AFF_MAX_NB + j] += B[j] * e;
              comb += (((c + j) % 2) ? -s : s) * B[j];
            }
            if (Math.abs(comb) > this._combPk[c]) this._combPk[c] = Math.abs(comb);
            if (onSupport) this._re2 += e * e;
          }
        }
        // holds and settle: a hold is where the reference does not move; the settle is the last
        // sample of a hold still outside 2% of the lap's error peak, counted from the hold's start
        for (let c = 0; c < nc; c++) {
          let hold = false;
          if (k < Lp) {
            const km = (k - 1 + Lp) % Lp, kp = (k + 1) % Lp;
            const v = (this._lapRef[kp * AFF_MAX_CH + c] - this._lapRef[km * AFF_MAX_CH + c]) * 0.5;
            hold = Math.abs(v) <= 1e-6 * this._vPk[c];
          }
          if (hold) {
            if (this._holdStart[c] < 0) { this._holdStart[c] = k; this._lastBad[c] = -1; }
            if (Math.abs(this._lapErr[k * AFF_MAX_CH + c]) > 0.02 * this._epk[c]) this._lastBad[c] = k;
          } else if (this._holdStart[c] >= 0) {
            const h0 = this._holdStart[c], runLen = k - h0;
            if (runLen >= 2) {
              this._holdRuns++; this._holdTotal += runLen;
              if (this._lastBad[c] >= k - 1) this._settleUnknown = true;       // never settled
              else if (this._lastBad[c] >= h0) this._settleC[c] = Math.max(this._settleC[c], this._lastBad[c] - h0 + 1);
            }
            this._holdStart[c] = -1;
          }
        }
        this._mac += cost; this._jobI++;
      }
      if (this._jobI <= Lp || this._mac + nb * nb > limit) return;
      for (let i = 0; i < nb; i++) for (let j = 0; j < i; j++) this._G[i * AFF_MAX_NB + j] = this._G[j * AFF_MAX_NB + i];
      this._Gram.set(this._G);
      // a vanishing jitter on the diagonal so a basis row the lap never excites cannot stop the factor
      let dmax = 0;
      for (let i = 0; i < nb; i++) dmax = Math.max(dmax, this._G[i * AFF_MAX_NB + i]);
      for (let i = 0; i < nb; i++) this._G[i * AFF_MAX_NB + i] += 1e-12 * (dmax || 1);
      this._jobPhase = 2; this._jobI = 0; this._jobJ = 0; this._headroom = 0;
      this._mac += nb * nb;
      return;
    }
    if (this._jobPhase === 2) {                        // the Gram's Cholesky, one row per unit
      while (this._jobI < nb && this._mac + nb * nb < limit) {
        if (!this._cholRow(this._G, nb, AFF_MAX_NB, this._jobI)) { this._jobPhase = 4; return; }
        this._mac += nb * nb; this._jobI++;
      }
      if (this._jobI < nb) return;
      this._jobPhase = 3; this._jobI = 0; this._rb2 = 0;
      return;
    }
    if (this._jobPhase === 3) {                        // baseline projection and spanned energy, per channel
      while (this._jobI < nc && this._mac + 2 * nb * nb < limit) {
        const c = this._jobI;
        this._cholSolve(this._G, nb, AFF_MAX_NB, this._lapRhs, c * AFF_MAX_NB, this._vec);
        for (let j = 0; j < nb; j++) this._E0[c * AFF_MAX_NB + j] = this._vec[j];
        for (let i = 0; i < nb; i++) {
          let t = 0;
          for (let j = 0; j < nb; j++) t += this._Gram[i * AFF_MAX_NB + j] * this._vec[j];
          this._rb2 += this._vec[i] * t;
        }
        this._mac += 2 * nb * nb; this._jobI++;
      }
      if (this._jobI < nc) return;
      this._headroom = this._re2 > 0 ? this._rb2 / this._re2 : 0;
      this._jobPhase = 4;
      return;
    }
    // phase 4: the window — `distilkit.deriveWindow`'s rule min(0.61 settle, lap/8), capped by preview
    if (this._mac + 20 * AFF_MAX_OFFS * nc > limit) return;
    let settle = 0;
    for (let c = 0; c < nc; c++) settle = Math.max(settle, this._settleC[c]);
    this._settle = this._settleUnknown ? 0 : settle;
    this._dwell = this._holdRuns > 0 ? this._holdTotal / this._holdRuns : Lp / 8;
    let R = Math.floor(Lp / 8);
    if (this._settle > 0) R = Math.min(R, Math.round(0.61 * this._settle));
    R = Math.min(R, AFF_MAX_REACH, this.nAhead);
    this._reach = R;
    this._warmLaps = (this._settleUnknown || this._settle > this._drop) ? 1 : 0;
    this.out.nReach = R; this.out.nSettle = this._settle; this.out.nWarmLaps = this._warmLaps;
    // offsets, deduplicated and ascending (insertion into a sorted list; no allocation)
    const tmp = this._tmpOff;
    let n = 0;
    for (let s = 0; s < AFF_SHAPE.length; s++) {
      const o = Math.round(AFF_SHAPE[s] * R);
      for (let side = 0; side < (o === 0 ? 1 : 2); side++) {
        const x = side === 0 ? o : -o;
        let at = n, dup = false;
        for (let i = 0; i < n; i++) { if (tmp[i] === x) { dup = true; break; } if (tmp[i] > x) { at = i; break; } }
        if (dup || n >= AFF_MAX_OFFS) continue;
        for (let i = n; i > at; i--) tmp[i] = tmp[i - 1];
        tmp[at] = x; n++;
      }
    }
    L.nOffsets = n; L.aOffsets.fill(0);
    for (let i = 0; i < n; i++) L.aOffsets[i] = tmp[i];
    // feature scales from the production envelope: level, level change over each offset, bias
    let j = 0;
    const iz = affZeroIndex(L);
    for (let c = 0; c < nc; c++) L.aXScale[j++] = Math.max(1e-12, Math.abs(this._envLo[c]), Math.abs(this._envHi[c]));
    for (let i = 0; i < n; i++) {
      if (i === iz) continue;
      const o = Math.abs(L.aOffsets[i]);
      for (let c = 0; c < nc; c++) L.aXScale[j++] = Math.max(1e-12, Math.min(this._envHi[c] - this._envLo[c], this._vPk[c] * o));
    }
    L.aXScale[j++] = 1;
    L.nFeat = j;
    this._mac += 20 * AFF_MAX_OFFS * nc;
    this._jobDone = true;
  }

  /**
   * JOB 2 — THE OPERATOR. A = X'X over the m+1 probes, M[r] = A^-1 X'Y[:, r] (`classic.js`'s least
   * squares), then M's LU for the Newton solves. One matrix row per unit.
   */
  _jobIdentify(limit) {
    const m = this._m, np = m + 1;
    if (this._jobPhase === 0) {                       // A = X'X
      while (this._jobI < m && this._mac + np * m < limit) {
        const i = this._jobI;
        for (let j = 0; j < m; j++) { let s = 0; for (let q = 0; q < np; q++) s += this._X[q * MAX_M + i] * this._X[q * MAX_M + j]; this._A[i * MAX_M + j] = s; }
        this._mac += np * m; this._jobI++;
      }
      if (this._jobI < m) return;
      this._jobPhase = 1; this._jobI = 0;
      return;
    }
    if (this._jobPhase === 1) {                       // Cholesky of A, in place, one row per unit
      while (this._jobI < m && this._mac + m * m < limit) {
        if (!this._cholRow(this._A, m, MAX_M, this._jobI)) return this._identifyRefused();
        this._mac += m * m; this._jobI++;
      }
      if (this._jobI < m) return;
      this._jobPhase = 2; this._jobI = 0;
      return;
    }
    if (this._jobPhase === 2) {                       // M[r] = A^-1 (X' Y[:, r])
      while (this._jobI < m && this._mac + np * m + 2 * m * m < limit) {
        const r = this._jobI;
        for (let i = 0; i < m; i++) { let s = 0; for (let q = 0; q < np; q++) s += this._X[q * MAX_M + i] * this._Y[q * MAX_M + r]; this._vec[i] = s; }
        this._cholSolve(this._A, m, MAX_M, this._vec, 0, this._vec2);
        for (let j = 0; j < m; j++) this._M[r * MAX_M + j] = this._vec2[j];
        this._mac += np * m + 2 * m * m; this._jobI++;
      }
      if (this._jobI < m || this._mac + m * m > limit) return;
      this._jobPhase = 3; this._jobI = 0;
      for (let i = 0; i < m; i++) this._piv[i] = i;
      this._luTol = 0;
      for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) this._luTol = Math.max(this._luTol, Math.abs(this._M[i * MAX_M + j]));
      this._luTol *= m * 2.3e-16;
      this._mac += m * m;
      return;
    }
    // phase 3: LU with partial pivoting, one pivot column per unit
    while (this._jobI < m && this._mac + m * m < limit) {
      if (!this._luStep(this._M, m, MAX_M, this._piv, this._jobI)) return this._identifyRefused();
      this._mac += m * m; this._jobI++;
    }
    if (this._jobI >= m) this._jobDone = true;
  }

  _identifyRefused() {
    this.out.eConvVerdict = E_AFF_VERDICT.REFUSED; this.out.eConvReason = E_AFF_REASON.OPERATOR_SINGULAR;
    this._jobDone = true; this._convRefusedByJob = true;
  }

  /**
   * JOB 3 — THE LEARNED MAP'S CANDIDATES: for each ridge on the ladder, (X'X + lambda I) w = X'Y by
   * Cholesky, lambda scaled to the largest diagonal (`solveRidge`'s convention, rule 32). Too few
   * rows to fit refuses the rung with a stated reason rather than scoring nothing (rule 25).
   */
  _jobSolve(limit) {
    const n = this.live.nFeat, nc = this.nc;
    if (this._jobPhase === 0 && this._jobI === 0 && this._rows < 2 * n) {
      this._candOk.fill(0);
      this.out.eLearnVerdict = E_AFF_VERDICT.REFUSED; this.out.eLearnReason = E_AFF_REASON.FIT_TOO_FEW_ROWS;
      this._jobDone = true; return;
    }
    while (this._jobI < N_RIDGE) {
      const r = this._jobI;
      if (this._jobPhase === 0) {                      // copy + ridge
        if (this._mac + n * n + n > limit) return;
        let dmax = 0;
        for (let i = 0; i < n; i++) dmax = Math.max(dmax, this._XtX[i * AFF_MAX_FEAT + i]);
        const lam = RIDGES[r] * (dmax || 1);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const a = i <= j ? this._XtX[i * AFF_MAX_FEAT + j] : this._XtX[j * AFF_MAX_FEAT + i];
          this._Lw[i * AFF_MAX_FEAT + j] = a + (i === j ? lam : 0);
        }
        this._mac += n * n + n; this._jobPhase = 1; this._jobJ = 0; this._candOk[r] = 1;
      }
      if (this._jobPhase === 1) {                      // Cholesky rows
        while (this._jobJ < n && this._mac + n * n < limit) {
          if (!this._cholRow(this._Lw, n, AFF_MAX_FEAT, this._jobJ)) { this._candOk[r] = 0; this._jobJ = n; break; }
          this._mac += n * n; this._jobJ++;
        }
        if (this._jobJ < n) return;
        this._jobPhase = 2; this._jobJ = 0;
      }
      if (this._jobPhase === 2) {                      // solve, one channel per unit
        while (this._jobJ < nc && this._candOk[r] && this._mac + n * n + 2 * n < limit) {
          const c = this._jobJ, b = r * AFF_MAX_CH * AFF_MAX_FEAT;
          for (let i = 0; i < n; i++) this._rhs[i] = this._XtY[i * AFF_MAX_CH + c];
          this._cholSolve(this._Lw, n, AFF_MAX_FEAT, this._rhs, 0, this._sol);
          for (let j = 0; j < n; j++) this._cand[b + c * AFF_MAX_FEAT + j] = Number.isFinite(this._sol[j]) ? this._sol[j] : 0;
          this._mac += n * n + 2 * n; this._jobJ++;
        }
        if (this._candOk[r] && this._jobJ < nc) return;
        this._jobPhase = 0; this._jobI++;
      }
    }
    this._jobDone = true;
  }

  /** JOB 4 — the Newton trial's exact peak per channel over the recorded lap, then arm it scaled. */
  _jobPeak(limit) {
    const nc = this.nc, nb = this._nb, Lp = this._lapLen, B = this._aB;
    if (this._jobI === 0 && !this._phaseInit) { this._trialPk.fill(0); this._phaseInit = true; }
    const cost = nb * nc + 8 * nc;
    while (this._jobI < Lp && this._mac + cost < limit) {
      this._basisAt(this._jobI, B);
      for (let c = 0; c < nc; c++) {
        let s = 0;
        const w = c * AFF_MAX_NB;
        for (let j = 0; j < nb; j++) s += this._Wtrial[w + j] * B[j];
        if (Math.abs(s) > this._trialPk[c]) this._trialPk[c] = Math.abs(s);
      }
      this._mac += cost; this._jobI++;
    }
    if (this._jobI < Lp || this._mac + nc * nb + nc > limit) return;
    this._armTrial();
    this._mac += nc * nb + nc;
    this._jobDone = true;
  }

  /**
   * JOB 5 — THE PROGRAM TABLE. Phase 0 (once per commissioning): the stored program from the
   * recorded lap, and a zero table. Phase 1: per channel, keep the table the lap just measured
   * (U ← live) or restore the kept one (live ← U). Phase 2, when a trial is due: per channel,
   * d(k) = U(k) − β·E(k + τ), then Q — a circular moving average of half-width W, applied twice by
   * running sums — into the live table. Then the table is armed, and only then is the lap scored.
   */
  _jobProg(limit) {
    const nc = this.nc, Lp = this._lapLen, L = this.live, CH = AFF_MAX_CH;
    if (this._jobPhase === 0) {
      if (this._progInit) {
        while (this._jobI < Lp && this._mac + 3 * nc < limit) {
          const o = this._jobI * CH;
          for (let c = 0; c < nc; c++) { L.aProgRef[o + c] = this._lapRef[o + c]; L.aProgU[o + c] = 0; this._progU[o + c] = 0; }
          this._mac += 3 * nc; this._jobI++;
        }
        if (this._jobI < Lp) return;
        this._progInit = false;
      }
      this._jobPhase = 1; this._jobI = 0; this._jobJ = 0;
    }
    if (this._jobPhase === 1) {
      while (this._jobJ < nc) {
        const c = this._jobJ, keep = this._progKeep[c], restore = this._progRestore[c];
        if (keep || restore) {
          while (this._jobI < Lp && this._mac + 1 < limit) {
            const i = this._jobI * CH + c;
            if (keep) this._progU[i] = L.aProgU[i]; else L.aProgU[i] = this._progU[i];
            this._mac += 1; this._jobI++;
          }
          if (this._jobI < Lp) return;
        }
        this._jobJ++; this._jobI = 0;
      }
      this._jobPhase = 2; this._jobJ = 0; this._jobI = 0; this._progSub = 0;
    }
    if (this._jobPhase === 2 && this._progBuild) {
      const A = this._progA;
      while (this._jobJ < nc) {
        const c = this._jobJ, ci = this._progCi[c], beta = this._progBeta[c];
        const tau = this._progLead(ci), W = Math.min(this._progWidth(ci), (Lp - 1) >> 1), n = 2 * W + 1;
        if (this._progSub === 0) {                       // pass 1's first window sum
          if (this._mac + 2 * n + 2 > limit) return;
          let s = 0;
          for (let j = -W; j <= W; j++) s += this._progD(c, j, tau, beta);
          this._progSum = s; this._mac += 2 * n + 2; this._progSub = 1; this._jobI = 0;
        }
        if (this._progSub === 1) {                       // pass 1: d -> A
          while (this._jobI < Lp && this._mac + 6 < limit) {
            const k = this._jobI;
            A[k] = this._progSum / n;
            this._progSum += this._progD(c, k + W + 1, tau, beta) - this._progD(c, k - W, tau, beta);
            this._mac += 6; this._jobI++;
          }
          if (this._jobI < Lp) return;
          this._progSub = 2;
        }
        if (this._progSub === 2) {                       // pass 2's first window sum
          if (this._mac + n + 2 > limit) return;
          let s = 0;
          for (let j = -W; j <= W; j++) s += A[this._wrap(j)];
          this._progSum = s; this._mac += n + 2; this._progSub = 3; this._jobI = 0;
        }
        while (this._jobI < Lp && this._mac + 4 < limit) {   // pass 2: A -> the live table
          const k = this._jobI;
          L.aProgU[k * CH + c] = this._progSum / n;
          this._progSum += A[this._wrap(k + W + 1)] - A[this._wrap(k - W)];
          this._mac += 4; this._jobI++;
        }
        if (this._jobI < Lp) return;
        this._jobJ++; this._jobI = 0; this._progSub = 0;
      }
    }
    L.xProgArmed = 1;
    this._trialArmed = true;
    this._jobDone = true;
  }

  /** Index k of the recorded lap, wrapped: the program is closed. */
  _wrap(k) { const L = this._lapLen; return ((k % L) + L) % L; }

  /** The trial's input before the filter: the kept table less a step of the error τ scans ahead. */
  _progD(c, k, tau, beta) {
    const w = this._wrap(k);
    return this._progU[w * AFF_MAX_CH + c] - beta * this._progE[this._wrap(w + tau) * AFF_MAX_CH + c];
  }

  // ============================================================================ dense kernels
  // None of these charges the MAC count: every caller charges its own unit before running it, so a
  // job's budget check and its charge are the same number.

  /** Cholesky row i of a symmetric matrix held in full in `A`, in place (lower factor). */
  _cholRow(A, n, ld, i) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * ld + j];
      for (let t = 0; t < j; t++) s -= A[i * ld + t] * A[j * ld + t];
      if (i === j) {
        if (!(s > 0)) return false;
        A[i * ld + i] = Math.sqrt(s);
      } else A[i * ld + j] = s / A[j * ld + j];
    }
    return true;
  }

  /** Solve L L' x = b with the lower factor in `A`; b read from `b[off..off+n)`. */
  _cholSolve(A, n, ld, b, off, x) {
    for (let i = 0; i < n; i++) {
      let s = b[off + i];
      for (let t = 0; t < i; t++) s -= A[i * ld + t] * x[t];
      x[i] = s / A[i * ld + i];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let t = i + 1; t < n; t++) s -= A[t * ld + i] * x[t];
      x[i] = s / A[i * ld + i];
    }
  }

  /** One column of LU with partial pivoting (row swaps recorded in `piv`), against a RELATIVE floor. */
  _luStep(A, n, ld, piv, c) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r * ld + c]) > Math.abs(A[p * ld + c])) p = r;
    if (!(Math.abs(A[p * ld + c]) > this._luTol)) return false;
    if (p !== c) {
      for (let j = 0; j < n; j++) { const t = A[c * ld + j]; A[c * ld + j] = A[p * ld + j]; A[p * ld + j] = t; }
      const t = piv[c]; piv[c] = piv[p]; piv[p] = t;
    }
    for (let r = c + 1; r < n; r++) {
      const f = A[r * ld + c] / A[c * ld + c];
      A[r * ld + c] = f;
      for (let j = c + 1; j < n; j++) A[r * ld + j] -= f * A[c * ld + j];
    }
    return true;
  }

  /** Solve with the LU in `A` and permutation `piv`. */
  _luSolve(A, n, ld, piv, b, x) {
    for (let i = 0; i < n; i++) {
      let s = b[piv[i]];
      for (let t = 0; t < i; t++) s -= A[i * ld + t] * x[t];
      x[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let t = i + 1; t < n; t++) s -= A[i * ld + t] * x[t];
      x[i] = s / A[i * ld + i];
    }
  }

  // =============================================================================== output
  _publish() {
    const O = this.out;
    O.eState = this._state;
    O.xBusy = this._commissioning();
    O.xOwnsRef = this._ownsRef;
    O.iPhase = this._phase; O.rProgGain = this._progGain; O.xProgActive = this._progGain > 0;
    O.udiMacLast = this._mac;
    if (this._mac > O.udiMacPeak) O.udiMacPeak = this._mac;
  }
}
