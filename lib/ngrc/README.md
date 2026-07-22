# NGRC (JavaScript)

A production-quality JavaScript port of **TC_NGRC** — nonlinear
vector-autoregression (NG-RC / NVAR) with online Recursive Least Squares
learning. Ported from the Python reference (`Testing/ngrc_ref/` in the NGRC
repo, a mirror of the IEC 61131 ST library) and validated for numeric parity
against golden vectors generated from that reference.

- **Zero dependencies**, browser-native ES modules — imported directly by the
  test page, and publishable to npm later.
- **Numeric fidelity:** ST `LREAL` = IEEE-754 float64 = JS `number`, and each
  function mirrors the reference's operation order, so results match bit-for-bit.

## Status

| Module | Status |
|--------|--------|
| `primitives.js` — Block, build-lags, poly-expand, add-bias, predict, RLS init/update, rolling-update, RMSE, calc-mem | ✅ ported, 70/70 golden checks |
| `afm_select.js` — ridge Gauss-Jordan solve, working-set Gram/admit/screen, nRMSE, structured-prior ridge | ✅ ported |
| `afm.js` — `LoggedTrainer`, `LiveTrainer`, `Runner` (online feature selection + frozen inference) | ✅ ported, 8/8 golden checks |
| `universal.js` — portable LCG/Box-Muller RNG, universal feature map (bias+linear+quadratic+ReLU+Fourier+reciprocal), full + pruned expand, structured prior | ✅ ported, 24/24 golden checks (incl. RNG parity) |
| `feature_map.js` — `universalMap` / `prunedMap` objects (`.expand`/`.m`/`.prior`) | ✅ ported |
| `softsensor.js` — `SoftSensor` multi-target virtual-sensor bank (standardizer + shared feature vector + per-target online-RLS readout) | ✅ ported, 10/10 golden checks (linear + universal) |
| `commission.js` — `commissionSoftSensor` offline model search (linear-first → pruned-universal, per-target held-out gating, importance-ranked pruning) | ✅ ported, 12/12 golden checks |
| `continuous.js` — `Continuous` online forecaster: score→build→train→push→forecast roll-out; NARX inputs, delta-target, gray-box baseline, guards+clamp, auto-normalize, adaptive/directional forgetting, direct multi-horizon readouts, snapshot/restore | ✅ ported, 12/12 golden checks (4 feature combos) |
| `dropin.js` — `DropInEstimator` turnkey front-end: angular `[sin,cos]` auto-embed + `atan2` map-back, auto-normalize, lean linear NVAR, one forgetting mode | ✅ ported, 6/6 golden checks |
| `robotcomp.js` — `RobotComp` N-axis compliance + tool-force feedforward (exact-RLS calibration) and `CompCommissioner` (zero-tune per-pose gate) | ✅ ported, 5/5 golden checks |
| `commstore.js` — `CommStore` commissioning store/lifecycle (versioned payload, BigInt checksum, fail-safe load, health monitor, throttled autosave) | ✅ ported, 8/8 golden checks |
| `autotune.js` — `autotune` offline commissioner for `Continuous` (linear-first, ridge sweep, free-run stability reject, derived clamps + windup bound) + `makeModel` | ✅ ported, 12/12 golden checks |

### Roadmap

1. **Core** — primitives ✅; AFM feature-selection blocks ✅; universal map ✅;
   `Continuous` online forecaster ✅.
2. **Soft sensors / AFM** (prioritized) — **complete**: AFM trainer/runner ✅;
   universal map ✅; `SoftSensor` runtime ✅; `commissionSoftSensor` ✅.
3. **Turnkey** — `DropIn` estimator ✅.
4. Next — servo blocks (`ServoFF`, `AxisComp`) and their feature bases.

### SoftSensor quickstart

```js
import { SoftSensor } from './lib/ngrc/softsensor.js';
import { universalMap } from './lib/ngrc/feature_map.js';

const fmap = universalMap(numSignals * lag, 16, 16, 7);   // or null for a lean linear map
const s = new SoftSensor(numSignals, numTargets, lag, stride, warmup,
                         { fmap, prior: fmap.prior(), lam: 1.0 });
for (const scan of stream) {
  s.push(scan.signals);                    // measured signals only
  if (!s.frozen) s.warmupStep(s._raw());   // freeze mean/std over `warmup`
  else s.adapt(scan.targets);              // online RLS toward known truth
}
const est = s.estimate();                  // sensorless estimate per target
```

### Feature-selection quickstart

```js
import { LiveTrainer, Runner } from './lib/ngrc/afm.js';
// m = dictionary size, seed = protected backbone (bias + linear), cap = budget
const trainer = new LiveTrainer(m, ridge, [0, 1], cap, batch);
for (const [features, target] of stream) trainer.push((j) => features[j], target);
const { S, theta } = trainer.freeze();     // kept indices + weights
const est = new Runner(S, theta);
const yhat = est.predict((j) => liveFeatures[j]);
```

## Memory convention

Every vector/matrix is a **header-first block**: a row-major `[rows × cols]`
matrix. Feature vectors are columns `[n × 1]`, `theta` is `[n × 1]`, `P` is
`[n × n]`. `Block.m` is the flat row-major data.

## Testing

`test/ngrc/primitives.test.mjs` checks the JS against
`test/ngrc/golden/primitives.json` (committed, so no Python needed to run
tests). Regenerate the golden data from the reference with:

```
NGRC_REF=/path/to/ngrc/Testing/ngrc_ref python3 test/ngrc/gen_golden.py
```

The whole suite (NGRC unit tests + the page smoke test) runs via `./test/run.sh`.
