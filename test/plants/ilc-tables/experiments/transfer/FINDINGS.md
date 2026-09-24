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

## Two feedforwards on one signal pool (`phys.mjs`, `phys2.mjs`, `sag.mjs`) — 2026-09-24

The owner's proposal: a solid base feedforward for the large slow offsets, and the learned map as a
residual eliminator on top, both reading the same pool of reference signals. Frozen after
commissioning, one lap on each of the eight never-seen programs (and two bench programs):

| program | generic | physics (rigid-body torques, derivatives, gravity, pose-weighted) | physics + generic, jointly | static pose map alone | static + dynamic |
|---|---|---|---|---|---|
| sq6 f2.5 | 1.63 | 1.37 | 2.03 | 1.27 | 2.03 |
| circ3 f3 | 2.68 | 2.07 | 2.83 | 1.20 | 2.81 |
| rect7x5 f1.5 | 1.70 | 1.30 | 2.14 | 1.75 | 2.13 |
| rnd6 f2 | 2.15 | 1.96 | 2.51 | 1.66 | 2.52 |
| circ3.5 f2 | 2.65 | 2.14 | 2.53 | 1.87 | 2.53 |
| sq5 f3 | 1.79 | 1.44 | 2.88 | 1.25 | 2.88 |
| rnd8x6 f2.5 | 1.81 | 1.76 | 2.16 | 1.40 | 2.16 |
| circ2.5 f1 | 3.00 | 2.78 | 2.82 | **4.20** | 2.81 |
| bench sharp 3e-3 | 1.72 | 1.35 | 1.77 | 1.19 | 1.77 |
| bench circle 3e-3 | 2.59 | 2.06 | 2.70 | 1.30 | 2.68 |

- With the features STANDARDISED before the ridge, nothing is made worse on any unseen program: the
  0.86x of the earlier frozen model was the regression's conditioning, not the plant.
- THE LARGE SLOW OFFSET IS STATIC SAG. With the arm held still at a 7x7 grid of poses, the settled
  tool error is a smooth function of pose (joint 1: -4.6e-3 to -1.7e-2 rad, mostly with q1). That map
  explains 28-30% of the error energy on the sharp square at 3e-3, 31-59% on the circle, 62-72% on
  the rounded rectangle at 2e-3 and 93%/78% on the sharp square at 1e-3.
- At production feeds the DYNAMICS dominate, and no model tried transfers them beyond ~2-3x. On the
  slow unseen circle the dynamic model HURT what the static map alone achieved (4.20x -> 2.81x): a
  second feedforward must act only where it is measured to help.
