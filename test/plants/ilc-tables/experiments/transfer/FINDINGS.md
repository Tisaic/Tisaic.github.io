# Transfer on the feasible programs — measured 2026-09-24

The question: what does the arm get on motion the block has NOT seen, with no repetition to learn
from? Scripts here run from this directory. Factor = per-joint rms against the untouched machine
(the block's own measure), one seed.

## Where the error is (`split.mjs`)

The untouched machine's error is mostly OFF the path, not along it: 57-77% of the energy is
contour on the circle and rounded rectangle, 41% on the sharp square. Pure lag would be cheap to
remove; this is not.

## A model identified once from excitation (`inv2.mjs`)

| program | sparse (the block's taps) | dense | dense x pose | dense + gravity terms |
|---|---|---|---|---|
| circle 3e-3 / 2e-3 | 3.36 / 3.20 | 3.88 / 4.24 | 2.96 / 2.84 | 4.38 / 4.30 |
| rounded 3e-3 / 2e-3 | 1.73 / 2.18 | 1.52 / 2.26 | 1.42 / 1.89 | 1.51 / 2.25 |
| sharp 3e-3 / 2e-3 | 1.88 / 1.85 | 1.64 / 1.59 | 1.44 / 1.43 | 1.62 / 1.56 |

The ceiling measured on the old programs (2-4x) holds on feasible ones.

## Learning in production (`adapt.mjs`, `adapt_nr.mjs`)

The same model, commissioned once, then kept learning from every scan (exponentially forgotten
normal equations, 47 features, re-solved every 500 scans).

On a workload that REPEATS (four programs, two laps each; first lap -> second) it looks strong:
circle 2e-3 went 1.37 -> 2.94 frozen but 1.43 -> 13.1 learning. On a workload that NEVER repeats
(eight new shapes, sizes, positions and feeds, one lap each) it does not help, and a short memory
harms:

| memory | sq6 | circ3 | rect7x5 | rnd6 | circ3.5 | sq5 | rnd8x6 | circ2.5 |
|---|---|---|---|---|---|---|---|---|
| frozen | 1.66 | 0.86 | 1.63 | 1.68 | 1.28 | 1.67 | 1.45 | 2.45 |
| 20,000 scans | 1.73 | 0.87 | 1.80 | 1.71 | 1.25 | 1.58 | 1.29 | 3.25 |
| 5,000 scans | 1.78 | 0.87 | 1.90 | 1.18 | 1.09 | 1.07 | 0.82 | 2.42 |
| 2,000 scans | 1.75 | 0.80 | 1.18 | 1.14 | 1.16 | 0.61 | 0.47 | 0.89 |

The repeating gains were lap learning in disguise (rule 36).

## The defect this exposes

The frozen, commissioned model made one unseen program WORSE (circle r 3 at (13, -1), 0.86x). The
portfolio's held-out check tries one program per plant and would not see it. "Nothing is made worse"
is not established for arbitrary motion on the arm.
