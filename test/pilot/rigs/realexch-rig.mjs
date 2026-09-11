/**
 * @file THE REAL HEAT EXCHANGER — DaISy 97-002, a liquid-saturated steam heat exchanger:
 * liquid flow rate in, outlet liquid temperature out, 4000 samples at 1 s.
 *
 * WHY THIS PLANT. The three-zone extruder barrel is one of this project's two standing
 * REFUSALS — a thermal plant radiating as T^4 through a transport delay, which the pilot
 * declines at 0.22x and which §52.7's own sweep showed is refused for the right reason (every
 * setting that applies a real correction is worse than doing nothing). This is a real thermal
 * plant with a real transport lag, and it asks whether that refusal is the plant class or our
 * simulation of it.
 *
 * ITS VALIDATION IS THE WEAKEST IN THIS DIRECTORY AND THAT IS SAID FIRST (rule 27). Free-run
 * on the held-out half reads 0.66 degC rms — against an output whose whole range is 8.6 degC
 * — and the ONE-STEP predictor, handed the true previous temperature at every sample, still
 * reads 48% NRMSE. So the record is disturbance-dominated: most of what this exchanger did is
 * not explained by the flow that was commanded. A control factor measured here is a factor on
 * the part of the plant the record does explain.
 *
 * THE NRMSE HERE IS A TRAP AND THE ABSOLUTE ERROR IS NOT (rule 19). Fitting the first half and
 * validating on the second reads 69% NRMSE; fitting the second and validating on the first
 * reads 35% — and the free-run rms is 0.71 and 0.62 degC, essentially the same model both
 * ways. The whole gap is that the two halves have different output variance (1.77 against
 * 1.04 degC), because the first half contains a sustained operating-point excursion and the
 * second does not. The direction used here is the UNFLATTERING one: fit where the excursion
 * is, so the static gain is identified from data that actually moved, and validate on the
 * quiet half where the normalised number looks worse.
 *
 * TWO PLANTS ARE BUILT FROM ONE RECORD, DELIBERATELY. `MODEL_LIN` is a linear ARX; `MODEL` adds
 * exp(-1/u), which is the counterflow effectiveness relation rather than a generic lift. The
 * nonlinear one validates 7% better (0.663 against 0.715 degC) and is the plant this rig
 * ships. The linear one is kept because `realtanks.test.mjs` measured a factor of 2012x on a
 * linear plant that collapsed to 6.5x the moment the plant left the correction's own
 * hypothesis class, and a finding on one plant is not a finding (rule 18). Here the same
 * comparison runs on a plant sharing no physics with a water tank.
 */
import { readCols, identify, makePlant, simulate } from './realdata/sysid.mjs';

const R = (k) => Array.from({ length: k }, (_, i) => i + 1);
const [, U_REC, Y_REC] = readCols('daisy-heat-exchanger.dat');
const HALF = U_REC.length >> 1;
const TS = 1;                                       // 1 s per sample, DaISy's own

/** The counterflow effectiveness is exponential in the reciprocal of the flow. */
const EFF = (yl, ul) => [Math.exp(-1 / Math.max(0.05, ul[0]))];

const BASE = {
  uEst: U_REC.slice(0, HALF), yEst: Y_REC.slice(0, HALF),
  uVal: U_REC.slice(HALF), yVal: Y_REC.slice(HALF),
  nas: R(6), nbs: R(8), nks: [1, 2, 3, 4, 6, 8], lams: [1e-8, 1e-6, 1e-4],
};
const IDENT = identify({ ...BASE, lift: EFF });
const IDENT_LIN = identify({ ...BASE, lift: null });
const MODEL = IDENT.model, MODEL_LIN = IDENT_LIN.model;

/** Free-run rms in degC on the held-out half — the figure no normalisation can flatter. */
function valRms(m) {
  const k0 = Math.max(m.na, m.nb + m.nk - 1);
  const s = simulate(m, BASE.uVal, BASE.yVal, BASE.yVal.length);
  let e = 0, n = 0;
  for (let k = k0; k < BASE.yVal.length; k++) { e += (BASE.yVal[k] - s[k]) ** 2; n++; }
  return Math.sqrt(e / n);
}
const VAL_RMS = valRms(MODEL), VAL_RMS_LIN = valRms(MODEL_LIN);

// ------------------------------------------------------------- the plant's static map
/**
 * The CONVENTIONAL MACHINE: the open-loop static inversion a process line runs from a
 * calibration curve. Solved numerically because the shipped model is not linear in the flow,
 * which is the whole point of it — and bracketed by the record's own flow range rather than
 * by a guess, so the inversion cannot wander into a machine this data does not describe.
 */
const UMIN = Math.min(...U_REC), UMAX = Math.max(...U_REC);
const TMIN = Math.min(...Y_REC), TMAX_T = Math.max(...Y_REC);
function tempAt(m, u) {
  let sa = 0; for (let i = 0; i < m.na; i++) sa += m.th[i];
  let sb = 0; for (let j = 0; j < m.nb; j++) sb += m.th[m.na + j];
  let extra = 0;
  if (m.lift) { const L = m.lift([0], [u]); for (let i = 0; i < L.length; i++) extra += L[i] * m.th[m.na + m.nb + 1 + i]; }
  return (sb * u + m.th[m.na + m.nb] + extra) / (1 - sa);
}
const tempFor = (u) => tempAt(MODEL, u);
/** The flow that holds a temperature — bisection on a map that falls monotonically with flow. */
function flowFor(T) {
  let lo = UMIN, hi = UMAX;
  for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (tempFor(mid) > T) lo = mid; else hi = mid; }
  return 0.5 * (lo + hi);
}

// ------------------------------------------------------------------------ the program
// A RECIPE of holds and ramps, in degC. Segment and hold are sized from THIS plant's own
// settle — a flow step reaches its new temperature in about 80 samples — and never carried
// from the tank, which settles hundreds of times slower (rule 31).
const SEG = 400, HOLD = 150;
const RECIPE = [97.5, 95.0, 99.5, 94.5, 98.0];
const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));
function tempAtStep(k) {
  const i = Math.min(RECIPE.length - 2, Math.floor(k / SEG));
  const t = (k - i * SEG - HOLD) / (SEG - HOLD);
  const s = t <= 0 ? 0 : t >= 1 ? 1 : quintic(t);
  return RECIPE[i] + (RECIPE[i + 1] - RECIPE[i]) * s;
}
const refAtStep = (k) => [flowFor(tempAtStep(k))];
const PROG = SEG * (RECIPE.length - 1);

/** An exchanger settled at the recipe's first temperature, so lap 0 is not a transient. */
function makeMachine(m = MODEL) {
  const u0 = flowFor(RECIPE[0]), t0 = tempAt(m, u0);
  const p = makePlant(m, new Array(12).fill(t0), new Array(12).fill(u0));
  for (let i = 0; i < 1500; i++) p.step(u0);
  return p;
}

/** The conventional machine's own tracking error on the program — the denominator. */
function convRms(m = MODEL) {
  const p = makeMachine(m);
  let ss = 0, c = 0;
  for (let k = 0; k < PROG; k++) {
    const y = p.step(refAtStep(k)[0]);
    if (k >= PROG * 0.05) { ss += (y - tempAtStep(k)) ** 2; c++; }
  }
  return Math.sqrt(ss / c);
}
const CONV_RMS = convRms(MODEL);
/** Three times the error the correction exists to remove, in flow units (rule 31). */
const UCORR = 3 * CONV_RMS / Math.abs((tempFor(0.45) - tempFor(0.25)) / 0.2);

export { U_REC, Y_REC, HALF, TS, IDENT, IDENT_LIN, MODEL, MODEL_LIN, VAL_RMS, VAL_RMS_LIN,
  UMIN, UMAX, TMIN, TMAX_T, tempAt, tempFor, flowFor, SEG, HOLD, RECIPE, tempAtStep,
  refAtStep, PROG, makeMachine, makePlant, convRms, CONV_RMS, UCORR, EFF };
