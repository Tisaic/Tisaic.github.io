/**
 * @file THE REAL CASCADED TANKS — the nonlinear system identification benchmark of
 * Schoukens and Noël (2017), measured on real hardware: a pump voltage into an upper tank
 * that drains into a lower one, and the LOWER tank's water level is the output.
 *
 * WHY THIS PLANT. `test/pilot/distil-tank.mjs` put the deployed object on our own quadruple
 * tank and it read 1.000x held out — the rung reached the plant, fitted 49,864 rows, was
 * scored on the machine, lost and was reverted — while `tankspread.mjs` measured 4 of 8
 * seeds deploying HARMFULLY at the old defaults. Both of those are simulator results. This
 * is the real counterpart, and the question is whether the refusal is a property of the
 * PLANT CLASS or of our simulation of it. Either answer is worth having: if the real tank
 * also refuses, the gate is right for a reason bigger than our rig; if it deploys, our
 * quadruple tank is the fault.
 *
 * ITS VALIDATION IS THE STRONGEST IN THIS DIRECTORY, and that is the benchmark's doing, not
 * ours: it ships TWO INDEPENDENT excitations, an estimation record and a validation record,
 * correlating at r = 0.12 with their means removed. So the held-out free run here really is
 * a different experiment, which is more than the flexible arm's cut can say.
 *
 * THE DOCUMENTED NONLINEARITY IS MEASURED AND IT DOES NOT HELP, WHICH IS WORTH RECORDING.
 * Torricelli outflow goes as the square root of level, so a sqrt lift is the obvious thing
 * to add — and it measures WORSE: linear 0.649 V free-run rms against sqrt(y) 0.738 and
 * sqrt(y)+u^2 0.692, all on the same held-out record. The honest reading is narrow: the lift
 * available here applies to the OBSERVED lower level, while the physics it approximates is
 * dominated by the UNOBSERVED upper tank's outflow, so this is not a test of the documented
 * nonlinearity — it is one more instance of more capacity transferring worse, which this
 * project has now measured about ten times. Rule 42 takes the linear model: cheapest within
 * 5% of the best MEASURED score, and here it is also the best.
 *
 * THE MODEL IS ONLY A PLANT BELOW THE OVERFLOW. The record contains 47 estimation and 37
 * validation samples with the level pinned at exactly 10.00, which is the tank brimming; the
 * linear fit learned through those samples and extrapolates to y = 20.9 at the record's own
 * top voltage, which is fiction — there is no 20 cm of tank. The program below therefore
 * lives in 4.0 to 8.5, and the guard is set at the overflow rather than at a round number.
 */
import { readCsv, identify, makePlant, simulate } from './realdata/sysid.mjs';

const R = (k) => Array.from({ length: k }, (_, i) => i + 1);
const REC = readCsv('cascaded-tanks.csv');
const TS = REC.Ts[0];                              // 4 s per sample, the benchmark's own

const IDENT = identify({
  uEst: REC.uEst, yEst: REC.yEst, uVal: REC.uVal, yVal: REC.yVal,
  nas: R(6), nbs: R(6), nks: [1, 2, 3], lams: [1e-10, 1e-8, 1e-6],
});
const MODEL = IDENT.model;
const K0 = Math.max(MODEL.na, MODEL.nb + MODEL.nk - 1);

/** Free-run rms on the independent validation record, in volts — no normalisation to flatter. */
const VAL_RMS = (() => {
  const s = simulate(MODEL, REC.uVal, REC.yVal, REC.yVal.length);
  let e = 0, n = 0;
  for (let k = K0; k < REC.yVal.length; k++) { e += (REC.yVal[k] - s[k]) ** 2; n++; }
  return Math.sqrt(e / n);
})();

// ------------------------------------------------------------- the plant's static map
// y_ss = GAIN * u + OFF, read off the identified model rather than stated: this is the
// CONVENTIONAL MACHINE, the open-loop static inversion a process line runs when it has a
// calibration curve and no dynamic model. It is exactly the role `voltsFor` plays on our own
// quadruple tank, which is what makes the two comparable.
const { GAIN, OFF } = (() => {
  let sa = 0; for (let i = 0; i < MODEL.na; i++) sa += MODEL.th[i];
  let sb = 0; for (let j = 0; j < MODEL.nb; j++) sb += MODEL.th[MODEL.na + j];
  return { GAIN: sb / (1 - sa), OFF: MODEL.th[MODEL.na + MODEL.nb] / (1 - sa) };
})();
const voltsFor = (h) => (h - OFF) / GAIN;
const levelAt = (v) => GAIN * v + OFF;

// THE BOX IS THE RECORD'S OWN. The pump was driven over these volts and the level reached
// these heights; nothing outside is a machine this data describes.
const UMIN = Math.min(...REC.uEst, ...REC.uVal);
const UMAX = Math.max(...REC.uEst, ...REC.uVal);
const OVERFLOW = Math.max(...REC.yEst, ...REC.yVal);   // 10.00 — the tank brimming

// ------------------------------------------------------------------------ the program
// A RECIPE, NOT A CONTOUR: hold a level, ramp smoothly to the next, hold again — the same
// shape our quadruple tank runs, so the comparison against §54.4 is like for like and not a
// comparison of two programs. Segment and hold are sized from THIS plant's own settle
// (several hundred samples at Ts = 4 s), never carried from the other tank (rule 31).
const SEG = 600, HOLD = 200;
const RECIPE = [5.0, 7.4, 4.2, 8.2, 5.6];
/**
 * THE SECOND RECIPE EXISTS BECAUSE THE FIRST ONE'S RESULT HAD TO BE CHECKED, NOT BECAUSE A
 * SECOND PROGRAM WAS WANTED (rule 14). On the recipe above the ladder reads 2012x, which is
 * not a plausible controller result and is a reason to check the instrument. It is: the
 * plant here is an identified LINEAR model and the conventional rung's basis is
 * [a, v, sign v, 1], so the correction and the plant are the same class of object and the
 * inversion is exact to numerical precision. Rule 15 — two wrongs that agree are
 * indistinguishable from two rights — and what agrees here is the model class with itself.
 *
 * This recipe drives the level into the tank's OVERFLOW, which is the benchmark's own
 * documented hard nonlinearity and is visible in the record as 47 estimation and 37
 * validation samples pinned at exactly 10.00. The linear fit provably cannot express it: it
 * extrapolates to 20.9 V at the record's own top voltage, where there is no 20 cm of tank.
 * So the clamp is not a nonlinearity invented to make a point; it is the one the data shows
 * and the model lost.
 */
const RECIPE_OF = [5.0, 9.9, 4.2, 10.6, 5.6];
const quintic = (t) => t * t * t * (10 + t * (-15 + 6 * t));
function levelOn(rec, k) {
  const i = Math.min(rec.length - 2, Math.floor(k / SEG));
  const t = (k - i * SEG - HOLD) / (SEG - HOLD);
  const s = t <= 0 ? 0 : t >= 1 ? 1 : quintic(t);
  return rec[i] + (rec[i + 1] - rec[i]) * s;
}
const levelAtStep = (k) => levelOn(RECIPE, k);
const refAtStep = (k) => [voltsFor(levelAtStep(k))];
const levelAtStepOF = (k) => levelOn(RECIPE_OF, k);
const refAtStepOF = (k) => [voltsFor(levelAtStepOF(k))];
const PROG = SEG * (RECIPE.length - 1);

/** A tank settled at the recipe's first level, so lap 0 is not a start-up transient (rule 13). */
function makeMachine({ overflow = false, rec = RECIPE } = {}) {
  const v0 = voltsFor(rec[0]);
  const p = makePlant(MODEL, new Array(8).fill(rec[0]), new Array(8).fill(v0));
  for (let i = 0; i < 2000; i++) p.step(v0);
  if (!overflow) return p;
  // THE TANK CANNOT HOLD MORE THAN THE TANK. Applied on top of the identified model rather
  // than inside it, and stated as the modelling decision it is: the fit was made through the
  // clipped samples and so has absorbed some of the ceiling already, which means this clamp
  // is a LOWER bound on the real nonlinearity, not a reconstruction of it.
  return { get y() { return Math.min(OVERFLOW, p.y); },
    step(u) { return Math.min(OVERFLOW, p.step(u)); } };
}

/** The conventional machine's own tracking error on the program — the denominator. */
const CONV_RMS = (() => {
  const p = makeMachine();
  let ss = 0, c = 0;
  for (let k = 0; k < PROG; k++) {
    const y = p.step(refAtStep(k)[0]);
    if (k >= PROG * 0.05) { ss += (y - levelAtStep(k)) ** 2; c++; }
  }
  return Math.sqrt(ss / c);
})();
/**
 * THE CORRECTION'S AUTHORITY, DERIVED FROM THE ERROR IT EXISTS TO REMOVE. Three times the
 * conventional machine's own rms, converted into command volts through the static gain:
 * enough to cancel that error with margin and not enough to be a second actuator. A cap
 * chosen any other way is a constant carried from a plant that is not this one (rule 31).
 */
const UCORR = 3 * CONV_RMS / Math.abs(GAIN);

export { REC, TS, IDENT, MODEL, K0, VAL_RMS, GAIN, OFF, voltsFor, levelAt,
  UMIN, UMAX, OVERFLOW, SEG, HOLD, RECIPE, RECIPE_OF, levelAtStep, refAtStep,
  levelAtStepOF, refAtStepOF, PROG, makeMachine, makePlant, CONV_RMS, UCORR };
