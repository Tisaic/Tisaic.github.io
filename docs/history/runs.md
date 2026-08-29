
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

### emps-ladder — exit 1 — 2026-08-29T15:45Z

```
    conventional: 5.7640e-1 → 1.3568e-3 mm   424.8x   14 laps   fit residual 0.0016
  as it arrived                                  5.7640e-1       
  conventional (self-tuned)                      1.3568e-3  424.82x   14 laps, 4 coefficients — AT THE INSTRUMENT'S FLOOR (1.60e-3), not distinguishable
  pilot cascade, depth 1                         3.4388e-3    0.39x   no better than the rung below — stopping
  pilot cascade, depth 1 (rungs below withheld)  5.0974e-2    0.03x   no better than the rung below — stopping
  lap-periodic (harmonic)                        1.3540e-4   10.02x   84 laps, probe basis at 10% — NOT deployed — AT THE INSTRUMENT'S FLOOR (1.60e-3), not distinguishable
    shipped {"classic":true,"stack":0,"hff":false}   5.7640e-1 → 1.3568e-3 mm   424.8x
  ✓ the harmonic rung really did score better than the one that shipped — so the refusal is the FLOOR talking and not a rung that failed
  as it arrived              2.5509e-2       
  conventional (self-tuned)  2.5476e-2    1.00x   13 laps, 4 coefficients — NOT deployed
  lap-periodic (harmonic)    1.2284e-3   20.77x   83 laps, probe spread at 10% — a MEMORY: it will not transfer to another program
    shipped {"classic":false,"stack":0,"hff":true}   2.551e-2 → 1.228e-3   20.8x
  ✗ …and the floor label discriminates — some rows carry it and some do not, so it is informative rather than decoration  → [["as it arrived","2.55e-2",false],["conventional (self-tuned)","2.55e-2",false],["lap-periodic (harmonic)","1.23e-3",false]]
autostack: 1 check(s) FAILED
```

### five-plants — exit 0 — 2026-08-29T15:46Z

```
  as it arrived                                  4.7706e-1       
  conventional (self-tuned)                      4.5307e-2   10.53x   24 laps, 7 coefficients
  pilot cascade, depth 1                         1.5805e-1    0.29x   no better than the rung below — stopping
  pilot cascade, depth 1 (rungs below withheld)  2.2130e-1    0.20x   no better than the rung below — stopping
    shipped {"classic":true,"stack":0,"hff":false}   4.771e-1 → 4.531e-2   10.53x   44s
  as it arrived              1.3933e-1       
  conventional (self-tuned)  1.3933e-1    1.00x   16 laps, 7 coefficients — NOT deployed
  pilot cascade, depth 1     2.4709e-1    0.56x   no better than the rung below — stopping
    shipped {"classic":false,"stack":0,"hff":false}   1.393e-1 → 1.393e-1   1.00x   19s
  as it arrived              1.5301e-2       
  conventional (self-tuned)  1.5301e-2    1.00x   6 laps, 4 coefficients — NOT deployed
  pilot cascade, depth 1     3.1168e-2    0.49x   no better than the rung below — stopping
    shipped {"classic":false,"stack":0,"hff":false}   1.530e-2 → 1.530e-2   1.00x   11s
  as it arrived              5.2708e+0       
  conventional (self-tuned)  5.2708e+0    1.00x   32 laps, 10 coefficients — NOT deployed
  pilot cascade, depth 1     5.4773e+0    0.96x   no better than the rung below — stopping
    shipped {"classic":false,"stack":0,"hff":false}   5.271e+0 → 5.271e+0   1.00x   185s
plants: all checks passed
```

### emps-ladder-refix — exit 0 — 2026-08-29T15:50Z

```
    conventional: 5.7640e-1 → 1.3568e-3 mm   424.8x   14 laps   fit residual 0.0016
  as it arrived                                  5.7640e-1       
  conventional (self-tuned)                      1.3568e-3  424.82x   14 laps, 4 coefficients — AT THE INSTRUMENT'S FLOOR (1.60e-3), not distinguishable
  pilot cascade, depth 1                         3.4388e-3    0.39x   no better than the rung below — stopping
  pilot cascade, depth 1 (rungs below withheld)  5.0974e-2    0.03x   no better than the rung below — stopping
  lap-periodic (harmonic)                        1.3540e-4   10.02x   84 laps, probe basis at 10% — NOT deployed — AT THE INSTRUMENT'S FLOOR (1.60e-3), not distinguishable
    shipped {"classic":true,"stack":0,"hff":false}   5.7640e-1 → 1.3568e-3 mm   424.8x
  ✓ the harmonic rung really did score better than the one that shipped — so the refusal is the FLOOR talking and not a rung that failed
  as it arrived              2.5509e-2       
  conventional (self-tuned)  2.5476e-2    1.00x   13 laps, 4 coefficients — NOT deployed
  lap-periodic (harmonic)    1.2284e-3   20.77x   83 laps, probe spread at 10% — a MEMORY: it will not transfer to another program
    shipped {"classic":false,"stack":0,"hff":true}   2.551e-2 → 1.228e-3   20.8x
autostack: all checks passed
```

### aarm22-perharmonic — exit 1 — 2026-08-29T16:18Z

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
  [40m] lap-periodic (harmonic)  2.4171e-2  2.28x   98 laps, probe spread at 25% — a MEMORY: it will not transfer to another program
  as it arrived                                  4.1216e-1       
  conventional (self-tuned)                      3.3200e-1    1.24x   23 laps, 7 coefficients
  pilot cascade, depth 1                         9.7217e-2    3.42x
  pilot cascade, depth 2                         1.4120e-1    0.69x
  pilot cascade, depth 1 (rungs below withheld)  6.7033e-2    1.45x
  pilot cascade, depth 2 (rungs below withheld)  5.5099e-2    1.22x
  — the conventional rung WITHHELD               5.5099e-2    1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  lap-periodic (harmonic)                        2.4171e-2    2.28x   98 laps, probe spread at 25% — a MEMORY: it will not transfer to another program
  shipped {"classic":false,"stack":2,"hff":true}   4.1216e-1 → 2.4171e-2   17.05x   2445s
  the instrument's floor ROSE during commissioning, 1.31e-10 → 5.84e-4, on 'pilot cascade depth 2, deployed' — the deployed machine is noisier than the bare one, and the comparisons above were made at the coarser resolution
  ✗ THE HEADLINE: the self-tuning ladder matches or beats composite.test.mjs's hand-built cascade(2) + HFF on the same machine and program — the strongest result this repository has at these settings  → 2.4171e-2 against 1.3400e-2
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored
autostack-arm: 1 check(s) FAILED
```

### aarm24-diagonal-hist — exit 1 — 2026-08-29T17:19Z

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
  shipped {"classic":false,"stack":2,"hff":true}   4.1216e-1 → 2.0770e-2   19.84x   2140s
  the instrument's floor ROSE during commissioning, 1.31e-10 → 5.84e-4, on 'pilot cascade depth 2, deployed' — the deployed machine is noisier than the bare one, and the comparisons above were made at the coarser resolution
  ✗ THE HEADLINE: the self-tuning ladder matches or beats composite.test.mjs's hand-built cascade(2) + HFF on the same machine and program — the strongest result this repository has at these settings  → 2.0770e-2 against 1.3400e-2
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored
autostack-arm: 1 check(s) FAILED
```
