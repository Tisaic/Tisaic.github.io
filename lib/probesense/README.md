# probesense — soft-sensing a field from one point in it

**The composition layer.** `lib/lattsim` and `lib/ngrc` share nothing — that
independence is a claim this project makes and keeps — so the thing that joins
them cannot live inside either. This module depends on `lib/ngrc` for the model
and on **nothing at all** for the physics: it is fed numbers. The page reads them
off a lattice; the tests read them off an array.

## The question

Put a probe where you could actually instrument a machine — a cell against a
wall, downstream of an obstacle — and ask whether the recent history of that one
point is enough to say what the fluid is doing somewhere you cannot reach, or
what it will be doing shortly.

A lattice simulation is an unusually honest testbed for this, because the whole
field is known: the "unmeasured" target is available for training and for
grading without instrumenting anything. In a real plant, the target is the whole
reason you are here.

## Two readouts, one expansion

| readout | pairing | question |
|---|---|---|
| `estimate` | contemporaneous | what is the target doing **now**? |
| `predict` | features from H samples ago against the truth that just arrived | what will it be doing in H? |

Both share one lag embedding and one feature expansion, computed once per
sample, and differ only in the **delay** at which features are paired with
truth. That is what makes the forecast score out-of-sample and what makes it
alignable on a chart.

`SoftSensor` from `lib/ngrc` is the right class for the contemporaneous target
and is the model this is built on, but its `adapt()` can only express a
contemporaneous pairing — a horizon needs a ring of feature columns in the
caller. The NGRC soft-sensor page solves it the same way for its "+1 s" caret.
Adding `directHorizons` to `SoftSensor` (~15 lines, mirroring `Continuous`)
belongs in the Python mirror first, since that port carries golden-vector parity
tests.

## Protocol

A lifecycle, not a switch:

```
idle → calibrating → training → estimating (locked)
```

- **calibrating** — predict-only while the per-feature mean and standard
  deviation are gathered. Gated, not optional: standardising against statistics
  that are still moving writes the RLS equations in shifting coordinates, and at
  `lam = 1` that error never washes out.
- **training** — estimating *and* adapting toward truth. `train()` re-anchors the
  calibration window, so asking for training also says "this is the flow I mean".
- **estimating** — locked. The readouts are frozen and run open-loop, which is
  the whole point of a soft sensor: excite the flow while it trains, then freeze
  it and see whether what it learned holds.

Scores restart at every transition — a meter read across a mode change is
measuring the mix.

## Reporting

Every score is **out of sample**: each value is graded before the pair it came
from is trained on, and a forecast is graded only once its target has arrived.

nRMSE is **error ÷ the truth's own standard deviation**, not its RMS. `|u|` in a
channel is a large mean plus a small fluctuation, so dividing by the RMS would
score "predict the average" at a few percent and flatter every model at once.
Against the standard deviation the mean predictor scores exactly **1.0**, and
only genuine tracking beats it.

Baselines are model-free and honest: a **scaled sensor reading** for the
estimate (the calibration constant a technician would fit) and **persistence**
for the forecast.

## Three things that are guarded, and why

**A steady target is not a bad score, it is no question.** `steadyTarget` fires
when the target varies by less than 1e-4 of its value. Measured on the shipped
channel after it converged: the truth spanned 0.0821 to 0.0821 — a variation of
1e-7 — and every nRMSE there is noise divided by noise.

**A target riding a large offset must be normalised.** Density is a ~1%
fluctuation on a level of 1.0, and an un-normalised readout has the prior
regularising its bias weight and its modulation weights alike. Measured at 1.69
nRMSE — worse than predicting its own mean — against 1.6e-2 for velocity targets
on the identical stream. Centring and scaling on the same frozen window fixes it,
and leaves the already-working targets untouched.

**A calibration window can be unrepresentative, and only afterwards can you tell.**
A no-slip wall cell barely moves and a lattice starts from rest, so an early
window describes a transient. Measured across four decades: a window with 1e-7 of
the eventual variance gave nRMSE 1.58e7. Guarded by a relative floor, a clamp at
ten deviations, and automatic recalibration when the inputs saturate — bounded to
three attempts, and asserted not to fire when the window was fine.

## Tests

`test/probesense/sensor.test.mjs` runs against a **synthetic field** — a sensor
point carrying one waveform and a hidden point carrying a different waveform of
the same phase. The information is there but not as a scale factor, which is what
makes the model-free baselines genuinely bad rather than straw men. Isolating the
model from the solver this way also means the checks run in a second rather than
twenty minutes on a software GPU.

What the browser verifies instead is what only the browser can: the wiring, the
sampling cadence, and the chart's alignment.
