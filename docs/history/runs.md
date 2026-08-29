
### aarm21-defaults — exit 1 — 2026-08-29T15:31Z

```
  [arm K 1 E 0.06, rounded rect, feed 0.004, lap 7357]
  conventional machine 4.1216e-1  bias -1.15e-1  osc 3.96e-1  lag 2.21e-1   lap-to-lap floor 1.309e-10
  the lap-periodic rung reads the WHOLE TOOL ERROR in JOINT space   [contour 1.87x the lag rms]
    nh  4 48.4% → 2.96e-1   nh  8 96.1% → 8.09e-2   nh 16 100.0% → 4.23e-3   nh 32 100.0% → 7.05e-4   nh 64 100.0% → 1.36e-4
  [0m] as it arrived  4.1216e-1
  [6m] conventional (self-tuned)  3.3200e-1  1.24x   23 laps, 7 coefficients
  [8m] pilot cascade, depth 1  9.7217e-2  3.42x
  [10m] pilot cascade, depth 2  1.4120e-1  0.69x
  [11m] pilot cascade, depth 1 (rungs below withheld)  6.7033e-2  1.45x
  [14m] pilot cascade, depth 2 (rungs below withheld)  5.5099e-2  1.22x
  [14m] — the conventional rung WITHHELD  5.5099e-2  1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  [35m] lap-periodic (harmonic)  2.0770e-2  2.65x   79 laps, probe spread at 10% — a MEMORY: it will not transfer to another program
  as it arrived                                  4.1216e-1       
  conventional (self-tuned)                      3.3200e-1    1.24x   23 laps, 7 coefficients
  pilot cascade, depth 1                         9.7217e-2    3.42x
  pilot cascade, depth 2                         1.4120e-1    0.69x
  pilot cascade, depth 1 (rungs below withheld)  6.7033e-2    1.45x
  pilot cascade, depth 2 (rungs below withheld)  5.5099e-2    1.22x
  — the conventional rung WITHHELD               5.5099e-2    1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  lap-periodic (harmonic)                        2.0770e-2    2.65x   79 laps, probe spread at 10% — a MEMORY: it will not transfer to another program
  shipped {"classic":false,"stack":2,"hff":true}   4.1216e-1 → 2.0770e-2   19.84x   2124s
  the instrument's floor ROSE during commissioning, 1.31e-10 → 5.84e-4, on 'pilot cascade depth 2, deployed' — the deployed machine is noisier than the bare one, and the comparisons above were made at the coarser resolution
  ✗ THE HEADLINE: the self-tuning ladder matches or beats composite.test.mjs's hand-built cascade(2) + HFF on the same machine and program — the strongest result this repository has at these settings  → 2.0770e-2 against 1.3400e-2
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored
autostack-arm: 1 check(s) FAILED
```
