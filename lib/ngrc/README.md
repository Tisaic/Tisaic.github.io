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

### Roadmap

1. **Core** — primitives ✅; AFM feature-selection blocks ✅; universal map ✅ →
   `Continuous` online forecaster (build → train → forecast loop with roll-out).
2. **Soft sensors / AFM** (prioritized) — AFM trainer/runner ✅; universal map ✅ →
   `SoftSensor` multi-target virtual sensors (standardizer + RLS bank over the
   universal or linear feature map).
3. Later — DropIn, servo blocks, commissioners.

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
