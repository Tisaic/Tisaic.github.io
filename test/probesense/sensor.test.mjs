// The composition layer: soft-sensing a field from one point in it.
//
// Tested against a SYNTHETIC field rather than a simulation, deliberately. The
// module is fed numbers and knows nothing about lattices, so a synthetic stream
// with a known answer isolates the model and the protocol from the solver -- and
// runs in a second instead of twenty minutes on a software GPU.
//
// The field: a sensor point carrying one waveform, and a hidden point carrying a
// DIFFERENT waveform of the same phase. That is the soft-sensor situation in
// miniature -- the information is there, but not as a scale factor -- and it is
// what makes the no-model baselines genuinely bad rather than straw men.
import { FieldSoftSensor, QUANTITIES, Score } from '../../lib/probesense/sensor.js';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\nprobesense: field soft sensor');

const EVERY = 20;
const PERIOD = 300;                      // solver steps per cycle
const W = 2 * Math.PI / PERIOD;
// Sensor point: velocity components and a density ripple, all of one phase.
const sensorAt = (step) => [
  1 + 0.03 * Math.sin(W * step + 0.4),
  0.08 * Math.sin(W * step),
  0.02 * Math.cos(W * step),
  0,
];
// Hidden point: a different waveform of the same phase, with a second harmonic
// so a linear map of the sensor cannot reproduce it.
const targetAt = (step) => [
  1 + 0.01 * Math.cos(W * step),
  0.05 * Math.sin(W * step - 1.1) + 0.02 * Math.sin(2 * W * step),
  0.01 * Math.cos(W * step - 1.1),
  0,
];

function drive(ss, nSamples, step0 = 0) {
  let step = step0;
  for (let i = 0; i < nSamples; i++) {
    step += EVERY;
    ss.sample(step, sensorAt(step), targetAt(step));
  }
  return step;
}

// ------------------------------------------------------------------ quantities
{
  const v = [1.5, 3, 4, 12];
  check('|u| is the magnitude of the three components', QUANTITIES.speed.of(v) === 13);
  check('rho reads the first slot', QUANTITIES.rho.of(v) === 1.5);
  check('components read their own slots',
    QUANTITIES.ux.of(v) === 3 && QUANTITIES.uy.of(v) === 4 && QUANTITIES.uz.of(v) === 12);
}

// ------------------------------------------------------------------ nRMSE
{
  const s = new Score();
  // Predicting the mean of a varying signal must score EXACTLY 1.0 -- that is the
  // property the whole reporting convention rests on.
  const ys = [1, 2, 3, 4, 5, 6, 7, 8];
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  for (const y of ys) s.add(y, mean);
  check('predicting the mean scores nRMSE 1.0', Math.abs(s.nrmse - 1) < 1e-12, s.nrmse);
}

// ------------------------------------------------------------------ protocol
{
  const ss = new FieldSoftSensor({ inputs: ['ux', 'uy', 'rho'], target: 'ux',
    horizon: 8, lag: 4, stride: 3, warmup: 200, every: EVERY });
  drive(ss, 30);
  check('idle mode learns nothing', ss.trained === 0 && ss.mode === 'idle');
  // Calibration accumulates whenever samples flow, including while idle.
  check('calibration accumulates while idle', ss.status().calibrationLeft < 200,
    ss.status().calibrationLeft);
  // BUT `train()` RE-ANCHORS THE WINDOW, and that is deliberate: on a lattice
  // starting from rest, statistics gathered from the moment a probe was placed
  // describe a developing transient. Pressing "start training" is the operator
  // saying "this is the flow I mean", so the window starts there.
  ss.train();
  check('starting training re-anchors the calibration window',
    ss.status().calibrationLeft === 200, ss.status().calibrationLeft);
  drive(ss, 40);
  // The calibration window is a GATE, not a suggestion: no readout may train
  // while the standardisation statistics are still moving.
  check('training is gated behind the calibration window',
    ss.trained === 0 && ss.status().calibrating,
    `trained ${ss.trained}, left ${ss.status().calibrationLeft}`);
  drive(ss, 400);
  // 470 samples driven, 30 of them before training was asked for and 200 spent on
  // the window that request re-anchored. Arithmetic, not a round number to clear.
  const expect = 470 - 30 - 200;
  check('training proceeds once calibrated', Math.abs(ss.trained - expect) <= 2,
    `${ss.trained}, expected about ${expect}`);
  const at = ss.trained;
  ss.lock();
  drive(ss, 200);
  check('locking freezes every readout', ss.trained === at, `${at} → ${ss.trained}`);
  check('a locked sensor still estimates', ss.status().estimate.n > 100,
    ss.status().estimate.n);
}

// ------------------------------------------------------------------ accuracy
{
  const mk = (target) => {
    const ss = new FieldSoftSensor({ inputs: ['ux', 'uy', 'rho'], target,
      horizon: 8, lag: 4, stride: 3, warmup: 200, every: EVERY });
    ss.train(); drive(ss, 2500); return ss.status();
  };
  // A SMOOTH target for the absolute-accuracy claim. u_x at the hidden point is a
  // different waveform of the same phase, so recovering it is the soft-sensor task
  // in its cleanest form.
  const smooth = mk('ux');
  check('the estimate beats a scaled sensor reading', smooth.estimate.ratio > 10,
    `${smooth.estimate.nrmse.toExponential(2)} vs ${smooth.estimate.baseline.toExponential(2)}`);
  check('the estimate tracks the hidden point', smooth.estimate.nrmse < 0.05,
    smooth.estimate.nrmse);
  check('the prediction beats persistence', smooth.predict.ratio > 10,
    `${smooth.predict.nrmse.toExponential(2)} vs ${smooth.predict.baseline.toExponential(2)}`);
  check('the prediction was graded on real instances', smooth.predict.n > 1000,
    smooth.predict.n);

  // |u| AT THE HIDDEN POINT IS A HARDER TARGET AND THE REASON IS GEOMETRIC, not a
  // defect: its dominant component crosses zero, so the magnitude has a sharp
  // V-shaped minimum (measured floor 9.2e-3 against a 0.05 peak) that 15 samples
  // per cycle cannot resolve. It still beats every model-free rival by a wide
  // margin, and pinning that keeps the difference from being read as a bug later.
  const mag = mk('speed');
  check('a rectified target is harder but still beats its baselines',
    mag.estimate.nrmse > smooth.estimate.nrmse && mag.estimate.ratio > 5
    && mag.predict.ratio > 5,
    `est ${mag.estimate.nrmse.toExponential(2)} (x${mag.estimate.ratio.toFixed(1)}), `
    + `pred x${mag.predict.ratio.toFixed(1)}`);

  // A TARGET WHOSE FLUCTUATION IS 1% OF ITS LEVEL. Density is exactly that, and
  // before the target was centred and scaled it was UNLEARNABLE: measured 1.69,
  // worse than predicting its own mean, and 5x worse than persistence, while the
  // velocity targets on the identical stream scored 1.6e-2. The prior regularises
  // the bias weight and the modulation weights alike, so an un-normalised readout
  // ridges the 1% modulation a hundred times harder than the offset it rides on.
  const dens = mk('rho');
  check('a target riding a large offset is learnable', dens.estimate.nrmse < 0.1,
    dens.estimate.nrmse);
  check('and its forecast beats persistence', dens.predict.ratio > 5,
    `${dens.predict.nrmse.toExponential(2)} vs ${dens.predict.baseline.toExponential(2)}`);
  // The normalisation must be confined to where the defect was. If it moved the
  // velocity targets too, it changed the measurement rather than fixing a fault.
  check('normalisation left the already-working targets alone',
    Math.abs(smooth.estimate.nrmse - 2.88e-2) < 5e-3, smooth.estimate.nrmse);
  check('the frozen target statistics are reported',
    Math.abs(dens.targetMean - 1) < 0.01 && dens.targetStd > 0 && dens.targetStd < 0.02,
    `mean ${dens.targetMean}, std ${dens.targetStd}`);
}

// ------------------------------------------------------------------ alignment
// THE CHART'S CORRECTNESS LIVES HERE. A forecast trace is only readable if each
// point is drawn at the step it is ABOUT, not the step it was issued at.
{
  const H = 10;
  const ss = new FieldSoftSensor({ inputs: ['ux', 'uy'], target: 'ux',
    horizon: H, lag: 3, stride: 4, warmup: 150, every: EVERY });
  ss.train();
  const last = drive(ss, 1200);
  check('the live forecast is stamped exactly one horizon ahead',
    ss.live && ss.live.step === last + H * EVERY, JSON.stringify(ss.live));
  const m = ss.matured[ss.matured.length - 1];
  check('a matured prediction is stamped at the step it is about',
    m && m.step <= last && m.step > last - 2 * EVERY, JSON.stringify(m));
  // And it must actually be the value issued a horizon earlier, not a fresh one.
  const truthNow = QUANTITIES.ux.of(targetAt(m.step));
  check('the matured value lands on the truth at that step',
    Math.abs(m.value - truthNow) < 0.02 * 0.05, `${m.value} vs ${truthNow}`);
  const series = ss.series[ss.series.length - 1];
  check('the series is stamped in solver steps', series.step === last, series.step);
}

// ------------------------------------------------------------------ washout
// A rebuild leaves the lag window straddling two unrelated flows. Pairing across
// that seam teaches a transition that never happened, and at lam = 1 the damage
// is permanent -- measured on the Lorenz tab as compounding with every occurrence.
{
  const ss = new FieldSoftSensor({ inputs: ['ux'], target: 'ux',
    horizon: 6, lag: 4, stride: 3, warmup: 100, every: EVERY });
  ss.train();
  drive(ss, 800);
  const before = ss.trained;
  ss.breakStream();
  const depth = ss.status().depth;
  drive(ss, depth - 1);
  check('a stream break holds training off until the window refills',
    ss.trained === before, `${before} → ${ss.trained}`);
  check('a stream break drops predictions that would land across the seam',
    ss.pending.length <= 1, ss.pending.length);
  drive(ss, 40);
  check('training resumes after the re-entry washout', ss.trained > before, ss.trained);
}

// ------------------------------------------------------------------ inputs
// The point of the input selector: what the model is SHOWN changes the problem.
// A magnitude-only sensor cannot see the sign of a velocity, so it cannot
// reconstruct a signed target as well as the components can. If this ever came
// out equal, the selector would not be doing anything.
{
  const cfg = { target: 'ux', horizon: 8, lag: 4, stride: 3, warmup: 200, every: EVERY };
  const full = new FieldSoftSensor({ ...cfg, inputs: ['ux', 'uy', 'rho'] });
  const magOnly = new FieldSoftSensor({ ...cfg, inputs: ['speed'] });
  full.train(); magOnly.train();
  drive(full, 2000); drive(magOnly, 2000);
  const a = full.status().estimate.nrmse, b = magOnly.status().estimate.nrmse;
  check('components beat magnitude-only on a signed target', a < b,
    `components ${a.toExponential(2)} vs |u| only ${b.toExponential(2)}`);
  check('both remain better than nothing', a < 1 && b < 1, `${a} / ${b}`);
}

// ------------------------------------------------------------------ expansion
{
  const cfg = { inputs: ['ux', 'uy', 'rho'], target: 'speed', horizon: 8,
    lag: 4, stride: 3, warmup: 200, every: EVERY };
  const rich = new FieldSoftSensor({ ...cfg, expand: true });
  const lean = new FieldSoftSensor({ ...cfg, expand: false });
  rich.train(); lean.train();
  drive(rich, 2000); drive(lean, 2000);
  check('the expanded map carries more features than the lean one',
    rich.status().features > lean.status().features,
    `${rich.status().features} vs ${lean.status().features}`);
  // |u| of a signed sinusoid is a rectified wave -- not a linear function of the
  // components at any coefficients -- so this gap is structural, not tuning.
  check('the expansion beats lean linear on a rectified target',
    rich.status().estimate.nrmse < lean.status().estimate.nrmse,
    `${rich.status().estimate.nrmse.toExponential(2)} vs ${lean.status().estimate.nrmse.toExponential(2)}`);
}

// ------------------------------------------------------------------ calibration
// THE DEFECT THIS SECTION EXISTS FOR. A lattice starts from rest and a no-slip
// wall cell barely moves, so a calibration window taken early describes a
// transient: the frozen standard deviation lands far below the flow's eventual
// variation, every later sample is divided by it, and the quadratic terms square
// the result. Measured on the page at nRMSE 1419 against baselines near 2, and
// reproduced here across four decades of calibration-window amplitude.
{
  const quietThen = (quietAmp, wakeAt) => (i) => {
    const a = i < wakeAt ? quietAmp : 2e-3;
    return [1 + a * 1e-3 * Math.sin(i / 7), a * Math.sin(i / 11), a * Math.cos(i / 13), 0];
  };
  const hidden = (i) => [1, 0.05 * Math.sin(i / 11 - 1.1), 0.01 * Math.cos(i / 13), 0];
  const run = (quietAmp) => {
    const ss = new FieldSoftSensor({ inputs: ['ux', 'uy', 'rho'], target: 'speed',
      horizon: 14, lag: 4, stride: 6, warmup: 228, every: EVERY });
    ss.train();
    const sen = quietThen(quietAmp, 260);
    for (let i = 0; i < 2200; i++) ss.sample(i * EVERY, sen(i), hidden(i));
    return ss.status();
  };
  const bad = [1e-9, 1e-7, 1e-6, 1e-5, 1e-4].map(run);
  check('an unrepresentative calibration window is detected and redone',
    bad.every((st) => st.recalibrations >= 1), bad.map((st) => st.recalibrations).join(','));
  // Without this the same configurations measured 1.0 to 1.6e7. The point of the
  // check is the ORDER OF MAGNITUDE, not a tuned threshold.
  check('and the model then works instead of exploding',
    bad.every((st) => st.estimate.nrmse < 0.5),
    bad.map((st) => st.estimate.nrmse.toExponential(1)).join(' '));
  check('recalibration leaves the inputs no longer saturating',
    bad.every((st) => st.clamped === 0), bad.map((st) => st.clamped).join(','));

  // AND IT MUST NOT FIRE WHEN THE WINDOW WAS FINE. A guard that always triggers
  // is not a guard, it is a delay -- and it would silently discard a good window.
  const good = [1e-3, 2e-3].map(run);
  check('a representative window is left alone',
    good.every((st) => st.recalibrations === 0 && st.clamped === 0),
    good.map((st) => `${st.recalibrations}/${st.clamped}`).join(' '));

  // The attempts are bounded, so a flow that never settles cannot loop forever.
  const never = new FieldSoftSensor({ inputs: ['ux'], target: 'ux', horizon: 6,
    lag: 3, stride: 3, warmup: 120, every: EVERY });
  never.train();
  for (let i = 0; i < 6000; i++) {
    // Amplitude growing without bound: every window is unrepresentative of the next.
    const a = Math.exp(i / 300);
    never.sample(i * EVERY, [1, a * Math.sin(i / 9), 0, 0], [1, a * Math.sin(i / 9 - 1), 0, 0]);
  }
  check('recalibration attempts are bounded', never.status().recalibrations <= 3,
    never.status().recalibrations);
}

console.log(failed ? `\n${failed} check(s) failed\n` : '\nall checks passed\n');
process.exit(failed ? 1 : 0);
