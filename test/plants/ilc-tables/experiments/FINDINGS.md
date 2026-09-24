# What limits the arm — measured 2026-09-23

**Measured on the OLD programs** (deviation-rule corners, 20 g, no jerk filter). They were replaced
by feasible ones because of finding 1; the stored tables were regenerated on the new programs, so
these scripts no longer reproduce these numbers exactly. The conclusions are the record.

Scripts here run from this directory (`node sat.mjs`, `node inv.mjs`, …) against the stored tables
and the bench machine. Every number below is from the bench arm (K 0.25 / E 0.03), joint rms after
a 5% drop, factor = 1 / rms-over-joints of (rms / bare rms).

## 1. The sharp square is infeasible for the drive (`sat.mjs`)

| Program | Shoulder drive saturated | Peak torque demand / limit |
|---|---|---|
| circle 3e-3 / 2e-3 | 0.0% / 0.0% | 0.06x / 0.04x |
| rounded 3e-3 / 2e-3 | 1.8% / 0.3% | 7.2x / 3.1x |
| sharp 3e-3 / 2e-3 | 4.4% / 1.5% | **2,238x / 2,240x** |

At every sharp corner the program asks the shoulder for over two thousand times the torque it has.
No trim of the setpoint makes a torque-limited drive turn that corner; what any feedforward buys on
the sharp square is a workaround for one program. The bench cell's "hardest program, cannot
flatter" was measuring the drive's torque limit.

## 2. No reference-only model transfers beyond ~2-4x (`fit2.mjs`, `inv.mjs`)

- Fitted to the stored tables (leave one program out), a linear window of the reference misses the
  held-out table by 30-100% on joint 1; pose scheduling is worse. Even IN-SAMPLE a dense 329-feature
  filter cannot reproduce the sharp square's own table (NRMSE 0.7-1.0): that table is not a
  function of the reference's acceleration (it is saturation recovery, `sharp-3e-3-table.png`).
- Identified from 120,000 scans of broadband excitation inside the programs' envelope and applied
  unchanged on the machine:

| Program | sparse (the block's 21 taps) | dense FIR (150 taps) | dense x pose |
|---|---|---|---|
| circle 3e-3 / 2e-3 | 2.83x / 3.33x | 3.41x / 3.82x | 2.61x / 2.77x |
| rounded 3e-3 / 2e-3 | 1.66x / 2.33x | 1.55x / 2.42x | 1.57x / 2.06x |
| sharp 3e-3 / 2e-3 | 1.86x / 1.81x | 1.44x / 1.49x | 1.53x / 1.42x |

  The exact per-program correction on the circle is 572x (the stored table). The model class is not
  the lever.

## 3. Learning with the identified model converges in a few laps where the drive is not saturated (`mbilc.mjs`)

The identified inverse used as the LEARNING FILTER of lap learning (U <- U - beta Ginv(e), accepted
only if the lap improves), started from the transferable map:

| Program | map | +1 lap | +2 | +3 | best of 8 |
|---|---|---|---|---|---|
| circle 3e-3 | 3.21x | 9.41x | 23.34x | 43.44x | 46.18x |
| rounded 3e-3 | 1.45x | (rejected) | 2.10x | stalls | 2.14x |
| sharp 3e-3 | 1.14x | stalls | | | 1.15x |

Each learning step costs a warm lap and a scored lap. Against FB_AutoFF's P-type table (2.1x,
4.2x, 6.5x after one, two, three steps on the sharp square from bare), the model-based step is about
five times faster per lap on a program the drive can follow, and useless where it saturates.

## Not measured

- Sensor noise: the inverse used as a learning filter amplifies it; every number here is noise-free.
- Whether a feasibility layer (a feed override that keeps the drives inside their envelope at
  corners) recovers the cornered programs, and what it costs in cycle time.
