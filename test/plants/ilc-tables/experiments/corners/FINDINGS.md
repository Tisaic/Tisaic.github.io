# Corners — measured 2026-09-24

Scripts run from this directory against the bench machine. Sharp square unless stated, feed 3e-3,
tool rms = contour + lag against the program; corner metrics from `cornerSignatures`
(`lib/flexisim/contour.js`): *not common* = share of the corner error that differs between the four
corners, *rough* = share faster than the 100-scan jerk filter.

## The machine and the program (`mode.mjs`, `size.mjs`, `closed.mjs`)

- The soft cell's ringing period is ~3,000 scans (half-periods 1,410-1,520 on both joints).
- With exact stops, the 100-scan jerk filter on the joint setpoints and the tool's acceleration at
  3 g, the closed-loop drive saturates on 0.02% of the sharp square's scans (4 g: 0.10%; 15 g: 11%).
  The old deviation-rule corners: 4.42%, at 2,238x the shoulder's torque.
- Smoothing the TIMING along the path (not the joint setpoints) left the rounded rectangle at 7x the
  torque limit: its line-arc junctions step the sideways acceleration whatever the timing, and the
  conventional machine's compliance shift turns that step into a torque spike through the position
  gain. Hence the filter on the joint setpoints.

## What each approach does to the corners (`sig.mjs`, `target.mjs`, `target_c.mjs`, `shared.mjs`)

| | tool rms | not common | rough | peak |
|---|---|---|---|---|
| old program, machine alone | 0.699 | 61% | 0.8% | 1.83 |
| new program, machine alone | 0.277 | 53% | 1.3% | 0.60 |
| + lap table (rms only) | 0.023 | 71-72% | 6.9-7.5% | 0.070 |
| + lap learning toward a smoothed target (T=150) | 0.027 | 75% | 5.5% | 0.083 |
| + ONE corner correction shared by all four | 0.227 | 92% | 1.5% | 0.34 |
| + lap learning kept only if smooth (≤2%) and no less consistent | **0.095** | **52%** | **2.0%** | **0.22** |

- The per-scan table buys rms by fitting each corner's leftovers differently: rougher and less alike.
- A designed target does not help while the learning's residual is larger than the designed rounding.
- A shared correction removes only the common part; the four corners of this arm genuinely differ
  (pose-dependent dynamics, and the slow mode carried from corner to corner).
- Constraining what the learning may keep preserves the baseline's smooth, predictable character and
  still cuts rms 2.9x and the peak 2.7x. The roughness cap is what binds.

## Not built

- A correction that knows the pose, which is what consistent corners on this arm need.
- The constrained learning inside FB_AutoFF: the block knows no path, but roughness is generic (the
  share of an error faster than a stated time); spread across corners is not.
