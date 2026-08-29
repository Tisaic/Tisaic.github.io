
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

### suite-node-flexisim — exit 0 — 2026-08-29T17:22Z

```
elastic: all checks passed
joint: all checks passed
    [self-weight] |sag| 5.3842e-1 vs theory 5.4276e-1 (-0.80%), bending 5.083e-1 + shear 3.446e-2
    [joint limit] link sag 1.346e-1 is 1.32% of the joint tilt 1.021e+1
    [split] K=1e-1  joint 4.845e+0  link 5.384e-1  joint share 90.0%
    [split] K=2e-1  joint 2.151e+0  link 5.384e-1  joint share 80.0%
    [split] K=4e-1  joint 1.256e+0  link 5.384e-1  joint share 70.0%
    [split] K=9e-1  joint 5.384e-1  link 5.384e-1  joint share 50.0%
    [mode 1] L/H 3.92  period 2817.7 steps  w 2.2299e-3 vs Euler-Bernoulli 2.4655e-3  (-9.56%)  over 5 crossings
    [dynamic] alpha 5.5535e-7 vs 5.5535e-7 (0.000%)  windup 9.5115e-3 vs 9.5115e-3 (0.00%)
    [dynamic] tip: tilt -2.235e-1 + bend -3.902e+0 = -4.126e+0   encoder 4.4483e+0 vs true link angle 4.4388e+0
    [margin 2] 1216 cells, 168.5 us/step, tip -0.055692253940486, slope -0.00453250838961
    [margin 1] 684 cells, 127.0 us/step, tip -0.055692253940486, slope -0.00453250838961
    [margin] 1.33x faster at 684 cells against 1216
  ✓ …and it is the shipped one, at a real saving
arm: all checks passed
    [inertia] M11 folded 38468 → straight 77780 (2.02x)   M12 -4368 / 5460 / 1.529e+4
    [conservation] over 20000 free steps: energy drift 2.09e-4, momentum drift 1.60e-4   (shoulder swept 3.16 rad, elbow 3.079)
    [conservation] with the Coriolis terms removed it drifts 2.31e-2 in a tenth of the run
    [gravity] shoulder torque straight 1.006e-2 → folded 7.152e-3 (1.41x)
    [frame] link 2 sees omega 4.000e-4, origin accel [-2.160e-6, 0.000e+0] (-L1 w^2 = -2.160e-6)
    [frame] spun at omega 4.0e-4: sigma_xx fits the OFFSET bar to 0.60% and the un-offset one to 212.9%
    [reach] straight 23.000 → folded 4.000 (L1 13.5, L2 9.5)
    [load side] one step from rest — alpha load-side 2.462e-8 / -6.120e-8, closed form 2.462e-8 / -6.120e-8, motor-side 0.000e+0
2R: all checks passed
    [locked] learner 0.3645  compliance model 1.4223  "tip = encoder" 1.0012  (500 locked samples, 544 features)
    [forecast +15 samples = 150 steps] learner 0.1035   persistence-of-estimate 0.6581   persistence-of-TRUTH 0.5417 (an oracle)
    [delay] the motor-side baseline lines up with the tip at lag 52 samples = 520 steps (r 0.5003); a quarter of the gearbox period would be 26
    [alignment] estimate correlates at lag 0 (r 0.9814), forecast at lag 14 (r 0.9969)
    [backlash] dead band 7.35e-2 rad = 50% of the peak wind-up 1.47e-1
    [backlash] memoryless 0.6206 -> 0.7238   windowed 0.3645 -> 0.5884
    [backlash] memory is worth 1.70x clean and 1.23x under backlash; relative damage +16.6% vs +61.4%
tipsensor: all checks passed
    [agreement] worst relative difference over 12 states — M 2.81e-15, G 1.36e-16, C 1.08e-15, frame params 0.00e+0
    [inertia] base M11 straight 1.7910e+5 · elbow folded 40428 · both folded 45548 (4.43× across the range)
    [conservation] over 20000 free steps: energy drift 4.88e-4, momentum drift 3.85e-4   (base swept 2.75 rad)
    [conservation] with the bias torques removed it drifts 4.40e-2 in a tenth of the run
    [frame] link 3 sees omega 4.000e-4, origin accel -3.680e-6 (-(L1+L2) w^2 = -3.680e-6)
    [frame] spun straight at omega 4.0e-4: sigma_xx fits the OFFSET bar to 1.95% and the un-offset one to 529%
    [levers] reach 29.50; tilts -2.950e-2 / -1.600e-2 / -6.500e-3
    [projection] pose 0.00,0.00,0.00  lever 29.500 against a distance of 29.500   tilt[0] -2.950e-2
    [projection] pose 0.00,0.60,0.40  lever 22.544 against a distance of 27.111   tilt[0] -2.254e-2
    [projection] pose 0.00,1.57,0.00  lever 16.000 against a distance of 20.934   tilt[0] -1.600e-2
    [projection] pose 0.00,2.60,0.40  lever 1.885 against a distance of 5.913   tilt[0] -1.885e-3
    [projection] wrist folded: lever -16.500 against a distance of 16.500   tilt[0] 1.650e-2
NR: all checks passed
    [whole arm] learner 0.0199   rigid model 0.9299   PLS frozen 0.1078   PLS adaptive 0.0737   "the tool is where the encoders say" 1.0000   (298 locked samples, 181 features from 10 signals)
    [whole arm] PLS frozen 0.1078 vs adaptive 0.0737 — whichever leads here is a property of THIS stream's stationarity, not of the method
chain sensor: all checks passed
residual: all checks passed
    [commission] c 1.21092 (1/K = 0.2500, so the link is 79% of it)   per pose 1.21454 1.21127 1.20918
    [commission] first bending mode 6.215e-3 rad/step (period 1011), zeta 0.236   Euler-Bernoulli would say 7.092e-3 (14% high)
    [plain      ] bias 7.366e-2   oscillation 1.944e-1   rms 2.079e-1   settled 1.104e-1
    [compensated] bias 2.695e-4   oscillation 2.072e-1   rms 2.072e-1   settled 6.851e-2
    [shaped     ] bias 7.375e-2   oscillation 7.599e-2   rms 1.059e-1   settled 7.392e-2
    [both       ] bias 1.731e-4   oscillation 7.675e-2   rms 7.675e-2   settled 1.863e-2
    [bias]        compensation 273x, shaping 0.999x (i.e. nothing)
    [oscillation] compensation 0.94x (i.e. nothing), shaping 2.56x
    [rms]         compensation 1.00x, shaping 1.96x, TOGETHER 2.71x
    [sign] bias uncompensated 7.366e-2 → correct 2.695e-4, backwards 1.476e-1 (2.00x)
    [jerk] biggest one-step acceleration jump: bare 6.857e-7, limited 5.714e-9 → 120x smaller
  ✓ an unrated drive is ideal, which is what the page shipped with
all checks passed
    [feed] 3978 steps, covered 23.9398 of 23.9398, peak v 1.165e-2 (limit 2.000e-2), peak a 2.000e-5 (limit 2.000e-5)
    [feed] fastest on a straight 1.165e-2, on an arc 4.899e-3 against sqrt(a*r) = 4.899e-3
    [corner] 90°: v at the corner 5.756e-4 against the junction rule's 5.657e-4, and 1.414e-2 away from it
    [decompose] a pure 120-step lag: tracking error up to 1.327e+0, contour error up to 4.839e-16 — a ratio of 2.7e+15
toolpath: all checks passed
    [lead  0] 5.30e-2 → 5.68e-1   9.33e-2×
    [lead  5] 5.30e-2 → 2.05e-3   2.58e+1×
    [lead 10] 5.30e-2 → 1.33e-4   4.00e+2×
    [lead 15] 5.30e-2 → 1.37e-4   3.89e+2×
    [lead 20] 5.30e-2 → 5.82e-4   9.12e+1×
    [lead 30] 5.30e-2 → 2.21e+0   2.40e-2×
    [lead 60] 5.30e-2 → 1.03e+3   5.13e-5×
pathilc: all checks passed
    [Jdot] at constant Cartesian velocity the joints must still accelerate: ddq 5.83e-7, -6.48e-7
    [decompose] a 200-step LAG: tracking 2.627e+0, contour 9.113e-16
    [decompose] a 0.05 NORMAL offset: tracking 5.000e-2, contour 5.000e-2
    [trace] feed 8.0e-3 →   2039 steps, contour rms 4.918e-1 max 1.242e+0, lag rms 2.084e+0, tau^2 4.228e-3, work 8.28e-2, reversals 3
    [trace] feed 2.0e-3 →   8155 steps, contour rms 6.338e-2 max 1.596e-1, lag rms 1.964e+0, tau^2 1.143e-4, work 8.42e-3, reversals 4
    [trace] feed 5.0e-4 →  32618 steps, contour rms 3.955e-2 max 6.609e-2, lag rms 1.372e+0, tau^2 1.793e-4, work 5.67e-3, reversals 4
    [floor] halving the feed twice buys 7.8x at the fast end and 1.60x at the slow end — the difference is the compliance, which slowing down cannot reach
    [energy] tau^2 4.23e-3 → 1.14e-4 → 1.79e-4 — fast costs acceleration, slow costs holding position for longer
    [reversals] one real direction change through a dwell: counting travel 0, counting sign 994
    [bias/osc] offset part rms 0.2000 = bias -0.2000 + osc 0.0000; ringing part rms 0.2000 = bias -0.0000 + osc 0.2000
contour: all checks passed
excite: all checks passed
pilot: all checks passed
pilot/tanks: all checks passed
pilot/thermal: all checks passed
pilot/woodberry: all checks passed
pilot/rollmill: all checks passed
    tracking error over the program, mm rms (x against the shipped machine):
      as shipped, cascade P/P             0.5764      1.0x   no plant knowledge
  ✓ …and it improves the shipped machine by at least 8x
  all checks passed
      shrink as shipped            1.236e-2   12.00x
  ✓ on a plant whose channel dies — the arm's defining property, which this axis does not have — the shipped shrink converges at least 3x
  ✓ …and each factor still EARNS its place in the shipped configuration, measured one at a time against it
hff: all checks passed
  ✓ the banded operator is actually BUILT — not a flag that leaves every harmonic null, which is how this shipped the first time and reported a ratio of exactly 1.000
band: all checks passed
sum: all checks passed
reuse: all checks passed
    conventional: 5.7640e-1 → 1.3568e-3 mm   424.8x   14 laps   fit residual 0.0016
  as it arrived                                  5.7640e-1       
  conventional (self-tuned)                      1.3568e-3  424.82x   14 laps, 4 coefficients — AT THE INSTRUMENT'S FLOOR (1.60e-3), not distinguishable
  pilot cascade, depth 1                         3.4388e-3    0.39x   no better than the rung below — stopping
  pilot cascade, depth 1 (rungs below withheld)  5.0974e-2    0.03x   no better than the rung below — stopping
  lap-periodic (harmonic)                        1.3549e-4   10.01x   71 laps, probe basis at 10% — NOT deployed — AT THE INSTRUMENT'S FLOOR (1.60e-3), not distinguishable
    shipped {"classic":true,"stack":0,"hff":false}   5.7640e-1 → 1.3568e-3 mm   424.8x
  ✓ the harmonic rung really did score better than the one that shipped — so the refusal is the FLOOR talking and not a rung that failed
  as it arrived              2.5509e-2       
  conventional (self-tuned)  2.5476e-2    1.00x   13 laps, 4 coefficients — NOT deployed
  lap-periodic (harmonic)    1.1515e-3   22.15x   75 laps, probe spread at 10% — a MEMORY: it will not transfer to another program — AT THE INSTRUMENT'S FLOOR (1.15e-3), not distinguishable
    shipped {"classic":false,"stack":0,"hff":true}   2.551e-2 → 1.151e-3   22.2x
autostack: all checks passed
```

### aarm23-banded — exit 1 — 2026-08-29T17:25Z

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
  [43m] lap-periodic (harmonic)  1.9907e-2  2.77x   68 laps, probe spread at 10% — a MEMORY: it will not transfer to another program
  as it arrived                                  4.1216e-1       
  conventional (self-tuned)                      3.3200e-1    1.24x   23 laps, 7 coefficients
  pilot cascade, depth 1                         9.7217e-2    3.42x
  pilot cascade, depth 2                         1.4120e-1    0.69x
  pilot cascade, depth 1 (rungs below withheld)  6.7033e-2    1.45x
  pilot cascade, depth 2 (rungs below withheld)  5.5099e-2    1.22x
  — the conventional rung WITHHELD               5.5099e-2    1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  lap-periodic (harmonic)                        1.9907e-2    2.77x   68 laps, probe spread at 10% — a MEMORY: it will not transfer to another program
  shipped {"classic":false,"stack":2,"hff":true}   4.1216e-1 → 1.9907e-2   20.70x   2617s
  the instrument's floor ROSE during commissioning, 1.31e-10 → 5.84e-4, on 'pilot cascade depth 2, deployed' — the deployed machine is noisier than the bare one, and the comparisons above were made at the coarser resolution
  ✗ THE HEADLINE: the self-tuning ladder matches or beats composite.test.mjs's hand-built cascade(2) + HFF on the same machine and program — the strongest result this repository has at these settings  → 1.9907e-2 against 1.3400e-2
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored
autostack-arm: 1 check(s) FAILED
```

### noise-probe — exit 1 — 2026-08-29T17:55Z

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
  as it arrived                                  4.1216e-1       
  conventional (self-tuned)                      3.3200e-1    1.24x   23 laps, 7 coefficients
  pilot cascade, depth 1                         9.7217e-2    3.42x
  pilot cascade, depth 2                         1.4120e-1    0.69x
  pilot cascade, depth 1 (rungs below withheld)  6.7033e-2    1.45x
  pilot cascade, depth 2 (rungs below withheld)  5.5099e-2    1.22x
  — the conventional rung WITHHELD               5.5099e-2    1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  shipped {"classic":false,"stack":2,"hff":false}   4.1216e-1 → 5.5099e-2   7.48x   822s
  the instrument's floor ROSE during commissioning, 1.31e-10 → 5.84e-4, on 'pilot cascade depth 2, deployed' — the deployed machine is noisier than the bare one, and the comparisons above were made at the coarser resolution
  ✗ THE HEADLINE: the self-tuning ladder matches or beats composite.test.mjs's hand-built cascade(2) + HFF on the same machine and program — the strongest result this repository has at these settings  → 5.5099e-2 against 1.3400e-2
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored
  the shipped machine over 16 laps — is the 'noise' noise?
autostack-arm: 1 check(s) FAILED
```

### noise-lapsync — exit 1 — 2026-08-29T18:14Z

```
  [arm K 1 E 0.06, rounded rect, feed 0.004, lap 7357]
  conventional machine 4.1216e-1  bias -1.15e-1  osc 3.96e-1  lag 2.21e-1   lap-to-lap floor 1.309e-10
  the lap-periodic rung reads the WHOLE TOOL ERROR in JOINT space   [contour 1.87x the lag rms]
    nh  4 48.4% → 2.96e-1   nh  8 96.1% → 8.09e-2   nh 16 100.0% → 4.23e-3   nh 32 100.0% → 7.05e-4   nh 64 100.0% → 1.36e-4
  [0m] as it arrived  4.1216e-1
  [6m] conventional (self-tuned)  3.3200e-1  1.24x   23 laps, 7 coefficients
  [8m] pilot cascade, depth 1  9.9789e-2  3.33x
  [10m] pilot cascade, depth 2  1.4156e-1  0.70x
  [11m] pilot cascade, depth 1 (rungs below withheld)  6.3021e-2  1.58x
  [14m] pilot cascade, depth 2 (rungs below withheld)  5.3554e-2  1.18x
  [14m] — the conventional rung WITHHELD  5.3554e-2  1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  as it arrived                                  4.1216e-1       
  conventional (self-tuned)                      3.3200e-1    1.24x   23 laps, 7 coefficients
  pilot cascade, depth 1                         9.9789e-2    3.33x
  pilot cascade, depth 2                         1.4156e-1    0.70x
  pilot cascade, depth 1 (rungs below withheld)  6.3021e-2    1.58x
  pilot cascade, depth 2 (rungs below withheld)  5.3554e-2    1.18x
  — the conventional rung WITHHELD               5.3554e-2    1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  shipped {"classic":false,"stack":2,"hff":false}   4.1216e-1 → 5.3554e-2   7.70x   819s
    pilot cascade, depth 2  1.416e-1 against 9.979e-2  judged at floor 8.40e-5, final 2.02e-4
  the instrument's floor ROSE during commissioning, 1.31e-10 → 2.02e-4, on 'median of 6 runs' — the deployed machine is noisier than the bare one, and the comparisons above were made at the coarser resolution
  ✗ THE HEADLINE: the self-tuning ladder matches or beats composite.test.mjs's hand-built cascade(2) + HFF on the same machine and program — the strongest result this repository has at these settings  → 5.3554e-2 against 1.3400e-2
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored
  the shipped machine over 16 laps — is the 'noise' noise?
autostack-arm: 1 check(s) FAILED
```

### noise-cont — exit 1 — 2026-08-29T18:15Z

```
  [arm K 1 E 0.06, rounded rect, feed 0.004, lap 7357]
  conventional machine 4.1216e-1  bias -1.15e-1  osc 3.96e-1  lag 2.21e-1   lap-to-lap floor 1.309e-10
  the lap-periodic rung reads the WHOLE TOOL ERROR in JOINT space   [contour 1.87x the lag rms]
    nh  4 48.4% → 2.96e-1   nh  8 96.1% → 8.09e-2   nh 16 100.0% → 4.23e-3   nh 32 100.0% → 7.05e-4   nh 64 100.0% → 1.36e-4
  [1m] as it arrived  4.1216e-1
  [7m] conventional (self-tuned)  3.3200e-1  1.24x   23 laps, 7 coefficients
  [8m] pilot cascade, depth 1  9.7217e-2  3.42x
  [11m] pilot cascade, depth 2  1.4120e-1  0.69x
  [12m] pilot cascade, depth 1 (rungs below withheld)  6.7033e-2  1.45x
  [14m] pilot cascade, depth 2 (rungs below withheld)  5.5099e-2  1.22x
  [14m] — the conventional rung WITHHELD  5.5099e-2  1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  as it arrived                                  4.1216e-1       
  conventional (self-tuned)                      3.3200e-1    1.24x   23 laps, 7 coefficients
  pilot cascade, depth 1                         9.7217e-2    3.42x
  pilot cascade, depth 2                         1.4120e-1    0.69x
  pilot cascade, depth 1 (rungs below withheld)  6.7033e-2    1.45x
  pilot cascade, depth 2 (rungs below withheld)  5.5099e-2    1.22x
  — the conventional rung WITHHELD               5.5099e-2    1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  shipped {"classic":false,"stack":2,"hff":false}   4.1216e-1 → 5.5099e-2   7.48x   855s
    pilot cascade, depth 2  1.412e-1 against 9.722e-2  judged at floor 1.09e-4, final 3.25e-4
  the instrument's floor ROSE during commissioning, 1.31e-10 → 3.25e-4, on 'median of 6 runs' — the deployed machine is noisier than the bare one, and the comparisons above were made at the coarser resolution
  ✗ THE HEADLINE: the self-tuning ladder matches or beats composite.test.mjs's hand-built cascade(2) + HFF on the same machine and program — the strongest result this repository has at these settings  → 5.5099e-2 against 1.3400e-2
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored
  the shipped machine over 16 laps — is the 'noise' noise?
autostack-arm: 1 check(s) FAILED
```

### drift-40 — exit 1 — 2026-08-29T18:33Z

```
  [arm K 1 E 0.06, rounded rect, feed 0.004, lap 7357]
  conventional machine 4.1216e-1  bias -1.15e-1  osc 3.96e-1  lag 2.21e-1   lap-to-lap floor 1.309e-10
  the lap-periodic rung reads the WHOLE TOOL ERROR in JOINT space   [contour 1.87x the lag rms]
    nh  4 48.4% → 2.96e-1   nh  8 96.1% → 8.09e-2   nh 16 100.0% → 4.23e-3   nh 32 100.0% → 7.05e-4   nh 64 100.0% → 1.36e-4
  [0m] as it arrived  4.1216e-1
  [6m] conventional (self-tuned)  3.3200e-1  1.24x   23 laps, 7 coefficients
  [8m] pilot cascade, depth 1  9.9789e-2  3.33x
  [10m] pilot cascade, depth 2  1.4156e-1  0.70x
  [12m] pilot cascade, depth 1 (rungs below withheld)  6.3021e-2  1.58x
  [14m] pilot cascade, depth 2 (rungs below withheld)  5.3554e-2  1.18x
  [14m] — the conventional rung WITHHELD  5.3554e-2  1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  as it arrived                                  4.1216e-1       
  conventional (self-tuned)                      3.3200e-1    1.24x   23 laps, 7 coefficients
  pilot cascade, depth 1                         9.9789e-2    3.33x
  pilot cascade, depth 2                         1.4156e-1    0.70x
  pilot cascade, depth 1 (rungs below withheld)  6.3021e-2    1.58x
  pilot cascade, depth 2 (rungs below withheld)  5.3554e-2    1.18x
  — the conventional rung WITHHELD               5.3554e-2    1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  shipped {"classic":false,"stack":2,"hff":false}   4.1216e-1 → 5.3554e-2   7.70x   835s
    pilot cascade, depth 2  1.416e-1 against 9.979e-2  judged at floor 8.40e-5, final 2.02e-4
  the instrument's floor ROSE during commissioning, 1.31e-10 → 2.02e-4, on 'median of 6 runs' — the deployed machine is noisier than the bare one, and the comparisons above were made at the coarser resolution
  ✗ THE HEADLINE: the self-tuning ladder matches or beats composite.test.mjs's hand-built cascade(2) + HFF on the same machine and program — the strongest result this repository has at these settings  → 5.3554e-2 against 1.3400e-2
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored
  the shipped machine over 40 laps — is the 'noise' noise?
autostack-arm: 1 check(s) FAILED
```

### aarm25-lapsync-banded — exit 1 — 2026-08-29T18:48Z

```

flexisim: the button, on the arm — against the strongest number this repo has

  [arm K 1 E 0.06, rounded rect, feed 0.004, lap 7357]
  conventional machine 4.1216e-1  bias -1.15e-1  osc 3.96e-1  lag 2.21e-1   lap-to-lap floor 1.309e-10
  the lap-periodic rung reads the WHOLE TOOL ERROR in JOINT space   [contour 1.87x the lag rms]
  a lap-harmonic table can only cancel what lives in its own band, so the
  floor it leaves is the rest — measured on this machine's own error:
    nh  4 48.4% → 2.96e-1   nh  8 96.1% → 8.09e-2   nh 16 100.0% → 4.23e-3   nh 32 100.0% → 7.05e-4   nh 64 100.0% → 1.36e-4
  (band share of the error's variance, and the residual a PERFECT correction
   inside that band would leave — no Newton loop can go below it)
  ✓ the harness reproduces the conventional machine `composite.test.mjs` measures, so the comparison below is one variable — who chooses the constants — and not two machines
  [0m] as it arrived  4.1216e-1
  [6m] conventional (self-tuned)  3.3200e-1  1.24x   23 laps, 7 coefficients
  [8m] pilot cascade, depth 1  9.9789e-2  3.33x
  [10m] pilot cascade, depth 2  1.4156e-1  0.70x
  [11m] pilot cascade, depth 1 (rungs below withheld)  6.3021e-2  1.58x
  [14m] pilot cascade, depth 2 (rungs below withheld)  5.3554e-2  1.18x
  [14m] — the conventional rung WITHHELD  5.3554e-2  1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  [32m] lap-periodic (harmonic)  1.8387e-2  2.91x   68 laps, probe rand at 10% — a MEMORY: it will not transfer to another program

  as it arrived                                  4.1216e-1       
  conventional (self-tuned)                      3.3200e-1    1.24x   23 laps, 7 coefficients
  pilot cascade, depth 1                         9.9789e-2    3.33x
  pilot cascade, depth 2                         1.4156e-1    0.70x
  pilot cascade, depth 1 (rungs below withheld)  6.3021e-2    1.58x
  pilot cascade, depth 2 (rungs below withheld)  5.3554e-2    1.18x
  — the conventional rung WITHHELD               5.3554e-2    1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  lap-periodic (harmonic)                        1.8387e-2    2.91x   68 laps, probe rand at 10% — a MEMORY: it will not transfer to another program

  shipped {"classic":false,"stack":2,"hff":true}   4.1216e-1 → 1.8387e-2   22.42x   1949s
  composite.test.mjs's hand-built cascade(2) + HFF   1.3400e-2   30.76x

  what a lap-harmonic table could reach ON THE CASCADE-DEPLOYED machine (score 5.355e-2):
    nh  4 51.0% → 3.75e-2   nh  8 71.6% → 2.85e-2   nh 16 99.6% → 3.44e-3   nh 32 100.0% → 5.50e-4   nh 64 100.0% → 9.77e-5
    (against 4.23e-3 at nh 16 on the BARE machine — the denominator every headroom figure has used so far)

  the lap-periodic rung, pass by pass:
    3.45e-2 → 3.14e-2 → 2.70e-2 → 2.41e-2 → 2.37e-2 → 2.07e-2 → 3.43e-2 → 2.05e-2 → 1.89e-2 → 1.92e-2 → 1.90e-2 → 1.87e-2 → 4.27e-2 → 2.12e-2 → 1.87e-2
    harmonics damped per pass: 0 0 0 0 0 0 256 0 0 256 256 0 256 256 256   (of nh in the band)
    the machine repeats to 3.27e-4 (1.7% of the score), and 4 of 15 passes land within one of those of the best — so the deployed table is one draw from a cluster
    step ended at 1.56e-2  — the step was halved 6x, so passes were being rejected
  the floor rose UNDER a decision already made — these rungs were deployed on a margin that no longer clears at the final resolution:
    pilot cascade, depth 2  1.416e-1 against 9.979e-2  judged at floor 8.40e-5, final 1.68e-4
  the instrument's floor ROSE during commissioning, 1.31e-10 → 1.68e-4, on 'median of 9 runs' — the deployed machine is noisier than the bare one, and the comparisons above were made at the coarser resolution
  ✗ THE HEADLINE: the self-tuning ladder matches or beats composite.test.mjs's hand-built cascade(2) + HFF on the same machine and program — the strongest result this repository has at these settings  → 1.8387e-2 against 1.3400e-2
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored

autostack-arm: 1 check(s) FAILED

```

### emps-report-complete — exit 0 — 2026-08-29T18:50Z

```

pilot: one button on a real servo axis — and the conventional layer wins

    conventional: 5.7640e-1 → 1.3568e-3 mm   424.8x   14 laps   fit residual 0.0016
      a0 0.055mm   v0 0.797mm   sgn v0 0.014mm   1 -0.002mm
  ✓ four coefficients fitted on the machine beat the INVERSE-DYNAMICS FEEDFORWARD at the published M, Fv, Fc and OF — a learned correction reaching a model-based one with no model
  ✓ …and it costs under twenty laps to do it
      the velocity coefficient is 0.797 mm against the position loop's own lag vPeak/kp = 0.778 mm
  ✓ …and the dominant coefficient IS the position loop's velocity lag, recovered from data to within 5% of vPeak/kp — an independent route agreeing, not a better score

    a two-tone sine the axis has NEVER run:
      open loop                                   4.7537e-1 mm
      the same four coefficients, evaluated live  2.7996e-3 mm   169.8x
      the identical signal replayed as a table    8.9865e-1 mm   0.53x
  ✓ the coefficients transfer to a trajectory the machine has never run, because they multiply the reference's own state rather than an index
  ✓ …and the IDENTICAL correction signal replayed as a lap-indexed table makes that machine WORSE THAN NOTHING — which is the difference between a model and a memory, on one signal, with everything else held

    the button — nothing set but the maxes, the authority and the floor:

  as it arrived                                  5.7640e-1       
  conventional (self-tuned)                      1.3568e-3  424.82x   14 laps, 4 coefficients — AT THE INSTRUMENT'S FLOOR (1.60e-3), not distinguishable
  pilot cascade, depth 1                         3.4388e-3    0.39x   no better than the rung below — stopping
  pilot cascade, depth 1 (rungs below withheld)  5.0974e-2    0.03x   no better than the rung below — stopping
  lap-periodic (harmonic)                        1.3549e-4   10.01x   71 laps, probe basis at 10% — NOT deployed — AT THE INSTRUMENT'S FLOOR (1.60e-3), not distinguishable

    shipped {"classic":true,"stack":0,"hff":false}   5.7640e-1 → 1.3568e-3 mm   424.8x
  ✓ the button ships something that improves the machine at least 100x, chosen from a ladder it measured rather than a rung it was told to use
  ✓ …and what it ships is the rung that TRANSFERS, not the lap-indexed one that scored better below the instrument's floor
  ✓ …and the refused rungs are REPORTED with what they measured, not hidden — a refusal that fires silently hides the thing worth looking at
  ✓ the pilot rung was genuinely driving the machine when it was scored, so "it did not help" is a measurement and not a wiring fault
  ✓ …and it was refused, because the rung below it had already removed the velocity lag that is this pilot's whole benefit on this axis
  ✓ the harmonic rung really did score better than the one that shipped — so the refusal is the FLOOR talking and not a rung that failed
  ✓ …and every rung that landed below the instrument's floor says so in its own row
  ✓ the conventional rung, armed alone, puts its OWN correction on the output — not a rung that is present in the wiring and contributing zero
  ✓ …the pilot rung likewise, through the look-ahead closure and not around it
  ✓ …and the harmonic rung likewise, indexed by lap phase
  ✓ …and all three armed together is EXACTLY their sum, so no rung is silently dropped or double-counted when they are combined
  ✓ a rung declaring a frame is mapped OUT of it before summing — asserted against a rotation computed by hand, so an identity map cannot pass
  ✓ …and the map is not the identity on this input, so the check above has teeth
  ✓ …and each rung goes through ITS OWN map, not one map applied to the sum
  ✓ …and actBelow maps too, so a rung commissions on the same machine it deploys onto
  ✓ …and actBelow STOPS at the named rung — it is the machine beneath it, not including it
  ✓ the conventional rung honours its OWN authority — asserted on coefficients that demand far more than it, because on this axis the cap never binds by itself
  ✓ …and the live path is capped identically to the lap-indexed one, so a rung cannot be bounded when replayed and unbounded when driven
  ✓ a rung demanding more than the COMMON cap is clipped — and the clipping is COUNTED, so an amputated rung shows up as a number instead of as a disappointing score
  ✓ …and a rung that fits inside the cap reports NO clipping, so the counter is not simply always on

    a disturbance no function of the reference's own state can express:
  as it arrived              2.5509e-2       
  conventional (self-tuned)  2.5476e-2    1.00x   13 laps, 4 coefficients — NOT deployed
  lap-periodic (harmonic)    1.1515e-3   22.15x   75 laps, probe spread at 10% — a MEMORY: it will not transfer to another program — AT THE INSTRUMENT'S FLOOR (1.15e-3), not distinguishable
    shipped {"classic":false,"stack":0,"hff":true}   2.551e-2 → 1.151e-3   22.2x
  ✓ the conventional rung is REFUSED when the disturbance is orthogonal to everything its basis can express — the refusal path, which the axis above never takes
  ✓ …and the harmonic rung DEPLOYS on the same plant, so its deploy path is exercised by a real commission and not only by a hand-armed wiring check
  ✓ …and the machine gets better by a margin far larger than the floor, so the deployment is a measurement and not the rig flattering itself
  ✓ …leaving essentially the noise and nothing else, which is what removing a lap-periodic disturbance from a lap-periodic plant should leave
  ✓ …and the floor label discriminates across the suite — some rows carry it and some do not, so the check above cannot pass vacuously
  ✓ …and every row that carries it really is at or below the floor, and every row that does not really is above — the label follows the measurement, not the other way round
  ✓ …while the conventional rung's own row still REPORTS what it measured, so a refusal is a number and not a silence
  ✓ every field the report is PRINTED from is populated — a missing one renders as a default and is believed, which is how six diagnostics went wrong in a day

autostack: all checks passed

```

### drift-40b — exit 1 — 2026-08-29T18:53Z

```

flexisim: the button, on the arm — against the strongest number this repo has

  [arm K 1 E 0.06, rounded rect, feed 0.004, lap 7357]
  conventional machine 4.1216e-1  bias -1.15e-1  osc 3.96e-1  lag 2.21e-1   lap-to-lap floor 1.309e-10
  the lap-periodic rung reads the WHOLE TOOL ERROR in JOINT space   [contour 1.87x the lag rms]
  a lap-harmonic table can only cancel what lives in its own band, so the
  floor it leaves is the rest — measured on this machine's own error:
    nh  4 48.4% → 2.96e-1   nh  8 96.1% → 8.09e-2   nh 16 100.0% → 4.23e-3   nh 32 100.0% → 7.05e-4   nh 64 100.0% → 1.36e-4
  (band share of the error's variance, and the residual a PERFECT correction
   inside that band would leave — no Newton loop can go below it)
  ✓ the harness reproduces the conventional machine `composite.test.mjs` measures, so the comparison below is one variable — who chooses the constants — and not two machines
  [0m] as it arrived  4.1216e-1
  [6m] conventional (self-tuned)  3.3200e-1  1.24x   23 laps, 7 coefficients
  [8m] pilot cascade, depth 1  9.9789e-2  3.33x
  [10m] pilot cascade, depth 2  1.4156e-1  0.70x
  [11m] pilot cascade, depth 1 (rungs below withheld)  6.3021e-2  1.58x
  [14m] pilot cascade, depth 2 (rungs below withheld)  5.3554e-2  1.18x
  [14m] — the conventional rung WITHHELD  5.3554e-2  1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover

  as it arrived                                  4.1216e-1       
  conventional (self-tuned)                      3.3200e-1    1.24x   23 laps, 7 coefficients
  pilot cascade, depth 1                         9.9789e-2    3.33x
  pilot cascade, depth 2                         1.4156e-1    0.70x
  pilot cascade, depth 1 (rungs below withheld)  6.3021e-2    1.58x
  pilot cascade, depth 2 (rungs below withheld)  5.3554e-2    1.18x
  — the conventional rung WITHHELD               5.3554e-2    1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover

  shipped {"classic":false,"stack":2,"hff":false}   4.1216e-1 → 5.3554e-2   7.70x   821s
  composite.test.mjs's hand-built cascade(2) + HFF   1.3400e-2   30.76x
  the floor rose UNDER a decision already made — these rungs were deployed on a margin that no longer clears at the final resolution:
    pilot cascade, depth 2  1.416e-1 against 9.979e-2  judged at floor 8.40e-5, final 2.02e-4
  the instrument's floor ROSE during commissioning, 1.31e-10 → 2.02e-4, on 'median of 6 runs' — the deployed machine is noisier than the bare one, and the comparisons above were made at the coarser resolution
  ✗ THE HEADLINE: the self-tuning ladder matches or beats composite.test.mjs's hand-built cascade(2) + HFF on the same machine and program — the strongest result this repository has at these settings  → 5.3554e-2 against 1.3400e-2
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored

  the shipped machine over 40 laps — is the 'noise' noise?
    pilot cadence S 9, lap 7357, LAP/S 817.444 — remainder 4, so the pilot starts each lap 44% of a sample later than the last   [look-ahead indexed FROM THE LAP START]
    5.335e-2 5.341e-2 5.325e-2 5.401e-2 5.399e-2 5.479e-2 5.360e-2 5.568e-2 5.356e-2 5.380e-2 5.345e-2 5.389e-2 5.370e-2 5.421e-2 5.457e-2 5.440e-2 5.516e-2 5.391e-2 5.348e-2 5.384e-2 5.410e-2 5.356e-2 5.360e-2 5.433e-2 5.458e-2 5.492e-2 5.476e-2 5.297e-2 5.407e-2 5.322e-2 5.415e-2 5.301e-2 5.406e-2 5.389e-2 5.485e-2 5.492e-2 5.302e-2 5.483e-2 5.310e-2 5.463e-2
    mean 5.402e-2   drift 1.77e-4 across the run   scatter about it 6.68e-4 (1.2%)
    drift first half 4.98e-4, second half 5.47e-5 — SETTLING: a longer settle before measuring
    lag-1 autocorrelation -0.120 — INDEPENDENT: averaging N laps cuts it by sqrt(N)

autostack-arm: 1 check(s) FAILED

```

### emps-phasewalk — exit 0 — 2026-08-29T19:22Z

```

pilot: one button on a real servo axis — and the conventional layer wins

    conventional: 5.7640e-1 → 1.3568e-3 mm   424.8x   14 laps   fit residual 0.0016
      a0 0.055mm   v0 0.797mm   sgn v0 0.014mm   1 -0.002mm
  ✓ four coefficients fitted on the machine beat the INVERSE-DYNAMICS FEEDFORWARD at the published M, Fv, Fc and OF — a learned correction reaching a model-based one with no model
  ✓ …and it costs under twenty laps to do it
      the velocity coefficient is 0.797 mm against the position loop's own lag vPeak/kp = 0.778 mm
  ✓ …and the dominant coefficient IS the position loop's velocity lag, recovered from data to within 5% of vPeak/kp — an independent route agreeing, not a better score

    a two-tone sine the axis has NEVER run:
      open loop                                   4.7537e-1 mm
      the same four coefficients, evaluated live  2.7996e-3 mm   169.8x
      the identical signal replayed as a table    8.9865e-1 mm   0.53x
  ✓ the coefficients transfer to a trajectory the machine has never run, because they multiply the reference's own state rather than an index
  ✓ …and the IDENTICAL correction signal replayed as a lap-indexed table makes that machine WORSE THAN NOTHING — which is the difference between a model and a memory, on one signal, with everything else held

    the button — nothing set but the maxes, the authority and the floor:

  as it arrived                                  5.7640e-1       
  conventional (self-tuned)                      1.3568e-3  424.82x   14 laps, 4 coefficients — AT THE INSTRUMENT'S FLOOR (1.60e-3), not distinguishable
  pilot cascade, depth 1                         3.4388e-3    0.39x   no better than the rung below — stopping
  pilot cascade, depth 1 (rungs below withheld)  5.0974e-2    0.03x   no better than the rung below — stopping
  lap-periodic (harmonic)                        1.3549e-4   10.01x   71 laps, probe basis at 10% — NOT deployed — AT THE INSTRUMENT'S FLOOR (1.60e-3), not distinguishable

    shipped {"classic":true,"stack":0,"hff":false}   5.7640e-1 → 1.3568e-3 mm   424.8x
  ✓ the button ships something that improves the machine at least 100x, chosen from a ladder it measured rather than a rung it was told to use
  ✓ …and what it ships is the rung that TRANSFERS, not the lap-indexed one that scored better below the instrument's floor
  ✓ …and the refused rungs are REPORTED with what they measured, not hidden — a refusal that fires silently hides the thing worth looking at
  ✓ the pilot rung was genuinely driving the machine when it was scored, so "it did not help" is a measurement and not a wiring fault
  ✓ …and it was refused, because the rung below it had already removed the velocity lag that is this pilot's whole benefit on this axis
  ✓ the harmonic rung really did score better than the one that shipped — so the refusal is the FLOOR talking and not a rung that failed
  ✓ …and every rung that landed below the instrument's floor says so in its own row
  ✓ the conventional rung, armed alone, puts its OWN correction on the output — not a rung that is present in the wiring and contributing zero
  ✓ …the pilot rung likewise, through the look-ahead closure and not around it
  ✓ …and the harmonic rung likewise, indexed by lap phase
  ✓ …and all three armed together is EXACTLY their sum, so no rung is silently dropped or double-counted when they are combined
  ✓ a rung declaring a frame is mapped OUT of it before summing — asserted against a rotation computed by hand, so an identity map cannot pass
  ✓ …and the map is not the identity on this input, so the check above has teeth
  ✓ …and each rung goes through ITS OWN map, not one map applied to the sum
  ✓ …and actBelow maps too, so a rung commissions on the same machine it deploys onto
  ✓ …and actBelow STOPS at the named rung — it is the machine beneath it, not including it
  ✓ the conventional rung honours its OWN authority — asserted on coefficients that demand far more than it, because on this axis the cap never binds by itself
  ✓ …and the live path is capped identically to the lap-indexed one, so a rung cannot be bounded when replayed and unbounded when driven
  ✓ a rung demanding more than the COMMON cap is clipped — and the clipping is COUNTED, so an amputated rung shows up as a number instead of as a disappointing score
  ✓ …and a rung that fits inside the cap reports NO clipping, so the counter is not simply always on

    a disturbance no function of the reference's own state can express:
  as it arrived              2.5509e-2       
  conventional (self-tuned)  2.5476e-2    1.00x   13 laps, 4 coefficients — NOT deployed
  lap-periodic (harmonic)    1.1515e-3   22.15x   75 laps, probe spread at 10% — a MEMORY: it will not transfer to another program — AT THE INSTRUMENT'S FLOOR (1.15e-3), not distinguishable
    shipped {"classic":false,"stack":0,"hff":true}   2.551e-2 → 1.151e-3   22.2x
  ✓ the conventional rung is REFUSED when the disturbance is orthogonal to everything its basis can express — the refusal path, which the axis above never takes
  ✓ …and the harmonic rung DEPLOYS on the same plant, so its deploy path is exercised by a real commission and not only by a hand-armed wiring check
  ✓ …and the machine gets better by a margin far larger than the floor, so the deployment is a measurement and not the rig flattering itself
  ✓ …leaving essentially the noise and nothing else, which is what removing a lap-periodic disturbance from a lap-periodic plant should leave
  ✓ …and the floor label discriminates across the suite — some rows carry it and some do not, so the check above cannot pass vacuously
  ✓ …and every row that carries it really is at or below the floor, and every row that does not really is above — the label follows the measurement, not the other way round
  ✓ …while the conventional rung's own row still REPORTS what it measured, so a refusal is a number and not a silence
  ✓ every field the report is PRINTED from is populated — a missing one renders as a default and is believed, which is how six diagnostics went wrong in a day

autostack: all checks passed

```

### suite-full-node — exit 1 — 2026-08-29T21:02Z

```
Suite level: full   areas: ngrc,flowsim,flexisim   phase: node
  (--all forces both; --only=ngrc,flowsim selects explicitly)

module parse
  ✓ 81 modules parse


NGRC primitives — golden-vector parity


PASS — 70/70 checks passed


NGRC AFM blocks — golden-vector parity


PASS — 8/8 checks passed


NGRC universal map — golden-vector parity


PASS — 24/24 checks passed


NGRC SoftSensor — golden-vector parity


PASS — 10/10 checks passed


NGRC commission_softsensor — golden-vector parity


PASS — 12/12 checks passed


NGRC Continuous forecaster — golden-vector parity


PASS — 12/12 checks passed


NGRC DropInEstimator — golden-vector parity


PASS — 6/6 checks passed


NGRC RobotComp + CompCommissioner — golden-vector parity


PASS — 5/5 checks passed


NGRC CommStore — golden-vector parity


PASS — 8/8 checks passed


NGRC autotune — golden-vector parity


PASS — 12/12 checks passed


NGRC ServoFF — golden-vector parity


PASS — 10/10 checks passed


NGRC AxisComp — spec parity (TC_NGRC_AxisComp.st)


PASS — 4/4 checks passed


lattsim: D3Q19 velocity set
  ✓ 19 velocities and 19 weights
  ✓ sum of weights is 1
  ✓ first moment vanishes (no preferred direction)
  ✓ second moment is cs^2 * I (isotropy)
  ✓ cs^2 = 1/3
  ✓ every velocity has its opposite
  ✓ opposite is an involution
  ✓ rest velocity is its own opposite
  ✓ speeds are 0 x1, 1 x6, 2 x12
  ✓ no duplicate velocities
  ✓ equilibrium recovers density (rho=1, u=[0,0,0])
  ✓ equilibrium recovers momentum (rho=1, u=[0,0,0])
  ✓ equilibrium recovers density (rho=1.05, u=[0.08,-0.03,0.02])
  ✓ equilibrium recovers momentum (rho=1.05, u=[0.08,-0.03,0.02])
  ✓ equilibrium recovers density (rho=0.9, u=[-0.1,0.05,0.07])
  ✓ equilibrium recovers momentum (rho=0.9, u=[-0.1,0.05,0.07])
  ✓ WGSL constants emit all 19 velocities
  ✓ WGSL constants emit all 19 weights + opposites
  ✓ WGSL weights are full precision (not rounded to 1/18 ~ 0.056)
  all checks passed


lattsim: engine scaffolding
  ✓ cell count is the product of the dimensions
  ✓ index is x + Nx*(y + Ny*z), x fastest
  ✓ index <-> coords round-trips for every cell
  ✓ forEachCell visits every cell exactly once
  ✓ bounded axes report no neighbour off the edge
  ✓ interior neighbours resolve
  ✓ periodic axes wrap in both directions
  ✓ position honours spacing and half-cell offset
  ✓ extent is dims x spacing
  ✓ degenerate lattices are refused
  ✓ non-positive spacing is refused
  ✓ velocity round-trips
  ✓ viscosity round-trips
  ✓ length round-trips
  ✓ tau <-> lattice viscosity are inverses
  ✓ nu = cs^2 (tau - 1/2)
  ✓ a negative-viscosity tau is refused, not clamped
  ✓ fromVelocity pins the lattice velocity
  ✓ audit reports the lattice Mach number
  ✓ audit warns when the lattice velocity is too high
  ✓ audit is quiet on a well-scaled setup
  ✓ scalar is 1 component, vector is 3
  ✓ a distribution field needs an explicit component count
  ✓ an explicit component count overrides the kind default
  ✓ duplicate field names are refused
  ✓ unknown field lookups throw rather than return undefined
  ✓ memory report counts the ping-pong second buffer
  ✓ the distribution field dominates the budget
  ✓ formatBytes is readable
  ✓ walls, a sphere and an inlet all land
  ✓ the census sums to the cell count
  ✓ the inlet region overwrote the wall where they overlap (order matters)
  ✓ the sphere is where it was asked for
  ✓ two operators writing one field is refused at build time
  ✓ an operator no backend can execute is refused, not skipped
  ✓ writing an undeclared field is refused
  ✓ tau <= 1/2 is refused when the operator is constructed
  ✓ the distribution field is double-buffered
  ✓ one step swaps the read buffer
  ✓ the macro field is single-buffered (it is a cache, not state)
  ✓ a lid-driven cavity conserves mass exactly (no inlet, no outlet)
  ✓ the lid is not a mass source (interior density spread < 1%)
  ✓ the density extreme is confined to the walls, not the bulk
  ✓ a closed box driven by a lid is stable, not marginal
  ✓ the lid actually drives the fluid
  ✓ no fluid moves faster than the lid that drives it
  ✓ the cavity recirculates (flow reverses between lid and floor)
  ✓ channel: declares a preferred slice plane
  ✓ channel: a sphere is far harder to shed than a cylinder
  ✓ channel: the obstacle is offset from the centreline (so shedding can start)
  ✓ channel: the domain is long enough for a wake
  ✓ channel: declares a reference speed
  ✓ channel: the reference speed matches the flow it has to colour
  ✓ channel: the declared slice plane shows structure
  ✓ poiseuille: declares a preferred slice plane
  ✓ poiseuille: declares a reference speed
  ✓ poiseuille: the reference speed matches the flow it has to colour
  ✓ poiseuille: the declared slice plane shows structure
  ✓ cavity: declares a preferred slice plane
  ✓ cavity: declares a reference speed
  ✓ cavity: the reference speed matches the flow it has to colour
  ✓ cavity: the declared slice plane shows structure
  ✓ dye: declares a preferred slice plane
  ✓ dye: declares a reference speed
  ✓ dye: the reference speed matches the flow it has to colour
  ✓ dye: the declared slice plane shows structure
  ✓ a fresh periodic box is at rest
  ✓ stirring puts momentum into the fluid
  ✓ stirring conserves mass
  ✓ the impulse is LOCAL, not global (momentum matches the forced volume)
  ✓ the mid-run reading is exactly one half step behind
  ✓ the impulse expires rather than becoming a permanent source
  ✓ neither configuration diverges, because the limiter will not let them
  ✓ but WITHOUT the sub-grid model the limiter has to hold cells up
  ✓ WITH it, far fewer cells need holding (the run is solved, not rescued)
  ✓ an oscillating lid drives momentum in BOTH directions
  ✓ an oscillating lid is still a wall (mass is conserved)
  ✓ once settled, a steady lid holds still while an oscillating one keeps going
  ✓ the wall velocity traces the requested period
  ✓ zero frequency leaves the wall steady
  ✓ the scene reports the Stokes depth only when it oscillates
  ✓ the cylinder at resolution 96 fits a 128 MiB storage binding
  ✓ resolution 96 puts 20 cells across the cylinder
  ✓ a sphere keeps its cubic domain, a cylinder does not
  ✓ the limiter does not engage in a healthy run
  ✓ a healthy run is not reported as limited
  ✓ a configuration that used to diverge now survives
  ✓ and it reports that it is being held up, not that all is well
  ✓ a NaN injected into the populations is gone after one step
  ✓ and it did not spread: the field is still finite 200 steps later
  ✓ the residual is reported
  ✓ a driven flow settles: the residual falls by >10x
  ✓ a settled run says so in the verdict
  ✓ the residual is per step, so the reading cadence barely moves it
  ✓ the first reading has no residual to report
  ✓ a reading with no steps since the last one reports nothing, not zero
  ✓ a residual of exactly zero is steady, not unreported
  ✓ an unreported residual is not called steady
  all checks passed


lattsim: conservation (CPU reference)
  -- f32 storage
  ✓ [f32] mass conserved over 200 steps (periodic, unforced)
  ✓ [f32] momentum conserved over 200 steps
  ✓ [f32] the seeded flow is actually moving
  ✓ [f32] the run stayed stable
  ✓ [f32] viscosity decays the kinetic energy
  ✓ [f32] a body force injects exactly F per cell per step
  ✓ [f32] mass still conserved under forcing
  ✓ [f32] tiny forces (1e-7) lose >0.1% to round-off — a real limit, pinned
  ✓ [f32] mass conserved in a closed box (bounce-back walls)
  ✓ [f32] a closed box spins down
  ✓ [f32] solid cells were actually created
  -- f64 storage
  ✓ [f64] mass conserved over 200 steps (periodic, unforced)
  ✓ [f64] momentum conserved over 200 steps
  ✓ [f64] the seeded flow is actually moving
  ✓ [f64] the run stayed stable
  ✓ [f64] viscosity decays the kinetic energy
  ✓ [f64] a body force injects exactly F per cell per step
  ✓ [f64] mass still conserved under forcing
  ✓ [f64] mass conserved in a closed box (bounce-back walls)
  ✓ [f64] a closed box spins down
  ✓ [f64] solid cells were actually created
  ✓ the mass residual is ARITHMETIC, not a leak (f64 improves it >1e4x)
  all checks passed


lattsim: Poiseuille flow vs the analytic profile
    H=13, zc=7, nu=0.16667, converged in 1800 steps; peak 2.0280e-2 vs analytic 2.0280e-2
  ✓ reaches steady state
  ✓ the flow is stable
  ✓ profile matches the analytic parabola within 1% (L2)
  ✓ peak velocity matches within 1%
  ✓ the profile is symmetric about the centreline
  ✓ no-slip is respected (first fluid node well below the peak)
  ✓ H = Nz-2 (halfway bounce-back) beats H = Nz-1 and H = Nz-3
    tau      nu       BGK L2      TRT L2
    0.600  0.0333  7.670e-3  1.786e-7
    0.800  0.1000  4.213e-3  2.496e-8
    0.933  0.1443  8.667e-9  8.667e-9
    1.000  0.1667  2.701e-3  3.363e-9
    1.500  0.3333  3.511e-2  4.774e-11
    2.500  0.6667  1.647e-1  8.989e-12
  ✓ BGK: the error minimum sits at the predicted tau = 1/2 + sqrt(3/16) ~ 0.933
  ✓ BGK: bounce-back degrades at large tau (>2% at tau=1.5, worse at 2.5)
  ✓ TRT: the wall position is exact at every tau, not just the magic one
  ✓ TRT: no longer degrades at large tau -- it improves
  ✓ TRT beats BGK by >1e6 at tau = 2.5
  ✓ at the magic tau the two agree, because there TRT reduces to BGK
    BGK nz=9 (144 cells, 600 steps): L2 9.313e-3 in 262 ms
    BGK nz=15 (240 cells, 1800 steps): L2 2.701e-3 in 1197 ms
    BGK nz=25 (400 cells, 5000 steps): L2 8.627e-4 in 5568 ms
  ✓ BGK: every resolution matches within 2%
  ✓ BGK: convergence is at least first order, consistent with second
    TRT nz=9/15/25: 1.71e-12, 3.36e-9, 9.39e-8
  ✓ TRT is at machine precision at every resolution, not converging towards it
    Cs=0.16: analytic L2 3.363e-9 -> 6.947e-4, worst per-node shift 8.832e-4
  ✓ the sub-grid model is OFF by default (the analytic cases are unmodelled)
  ✓ with the model on, laminar over-dissipation stays under 0.2%
  ✓ the laminar shift matches the predicted nu_t / nu_0 within 2x
  ✓ f32 reproduces the f64 profile to better than 0.5%
  all checks passed


lattsim: equation of state (sound speed)
  ✓ ideal gas propagates sound at cs = 1/sqrt(3)
  ✓ a stiffer EOS raises the sound speed to its set value
  ✓ a softer EOS lowers it
  ✓ a quadratic EOS gives a density-dependent sound speed
  ✓ the ideal EOS is byte-identical to no EOS at all

all checks passed


lattsim: passive scalar advection-diffusion (CPU reference)
  ✓ the fluid stayed at rest (u ~ 0)
  ✓ the Gaussian did not drift in a still fluid
  ✓ the variance grows LINEARLY in time (heat equation)
  ✓ measured diffusivity matches D = cs^2 (tau_g - 1/2) to 2%
  ✓ the carrier flow is actually uniform and moving
  ✓ the blob centroid moves at the flow speed U to 1%
  ✓ advection does not create or destroy scalar
  ✓ [f32] total scalar conserved over 300 steps (periodic advection)
  ✓ [f32] there is scalar present to conserve
  ✓ [f64] total scalar conserved over 300 steps (periodic advection)
  ✓ [f64] there is scalar present to conserve
  ✓ the scalar-conservation residual is ARITHMETIC, not a leak (f64 improves it >1e3x)
  all checks passed


lattsim: field reconstruction from wall sensors (CPU reference)
  ✓ sensors landed on fluid wall cells
  ✓ the target is a real slice of the field
  ✓ the reconstruction is finite everywhere
  ✓ it beats predicting the spatial mean by a wide margin (nRMSE < 0.6)
  ✓ it learned fast and stayed good (early and late both < 0.6)
  measured: nRMSE 0.080 from 12 wall sensors, 647 cells
  all checks passed


lattsim: linear elastodynamics
  ✓ Lame <-> engineering constants round-trip
  ✓ lambda grows and mu does not as nu -> 1/2
  ✓ Poisson's ratio outside (-1, 1/2) is refused
  ✓ stating both (E,nu) and (lambda,mu) is refused
  ✓ a well-conditioned solid passes the CFL gate
  ✓ a solid past the CFL limit is refused at build time, not at step 30
  ✓ the CFL limit is 1/sqrt(3) for this 3D stencil
  ✓ a P wave travels at c_p = sqrt((lambda+2mu)/rho)
  ✓ an S wave travels at c_s = sqrt(mu/rho)
  ✓ c_p / c_s carries the Poisson ratio, not a shared scale factor
  ✓ the wave neither grows nor decays (no numerical dissipation)
  ✓ dispersion error falls ~4x per doubling (second order in space)
  ✓ velocity is a 3-component vector field
  ✓ stress is stored as 6 components, not 9 (it is symmetric by construction)
  ✓ both fields are single-buffered (the leapfrog needs no ping-pong)
  ✓ the stress component order is the one the kernel writes
  ✓ a solid at rest stays at rest (no self-excitation)
  ✓ with damping off the amplitude is untouched
  ✓ the uniaxial bar reaches static equilibrium
  ✓ a free lateral surface gives uniaxial STRESS: sigma_xx / eps_xx = E
  ✓ and the lateral stress really is free (sigma_yy ~ 0)
  ✓ the bar contracts sideways by Poisson's ratio
  ✓ the cantilever reaches static equilibrium
  ✓ a tip-loaded cantilever matches FL^3/3EI + the shear term
  ✓ and the shear term is doing real work (Euler-Bernoulli alone is worse)
  ✓ every cantilever in the convergence study actually settled
  ✓ the cantilever error converges at least second order in the section
  ✓ the hanging bar settles
  ✓ gravity: sigma_xx(x) = rho g (L - x), the weight hanging below
  ✓ and the free surface really is the outer face, not the last cell centre
  ✓ a frame accelerating at -g is bit-for-bit identical to gravity g
  ✓ the spinning bar settles
  ✓ centrifugal: sigma_xx(r) = 1/2 rho w^2 (L^2 - r^2), quadratic and not linear
  ✓ and a linear profile through the same endpoints fits far worse
  ✓ Coriolis is present at all (it is not silently zero)
  ✓ Coriolis does no work: f . v is zero to round-off at every cell

elastic: all checks passed


flexisim: the lumped joint
  ✓ the dead zone transmits nothing inside +/-b
  ✓ and is continuous at the edges, not a step
  ✓ zero backlash is exactly the identity
  ✓ friction opposes motion in both directions
  ✓ dry friction falls from stiction toward Coulomb as speed builds
  ✓ friction is exactly zero at rest
  ✓ the drive reflects N^2 J_m to the output
  ✓ a torque step accelerates it at tau*N / (N^2 J_m + J_l)
  ✓ and ignoring the reflected inertia would be wrong by ~3x here
  ✓ the gearbox rings at sqrt(K (1/J_l + 1/(N^2 J_m)))
  ✓ and the load-only formula is visibly different (so the check discriminates)
  ✓ a held motor under load winds up by exactly tau/K
  ✓ ...and the encoder reports nothing at all
  ✓ backlash: the transmitted torque is zero over exactly 2b of encoder travel
  ✓ and the dead band is centred on zero wind-up
  ✓ inside the dead zone the link free-flies (no torque, so no acceleration)
  ✓ progressive stiffness rises with wind-up
  ✓ and a zero stiffening coefficient is exactly linear
  ✓ a torque below breakaway does not move the motor at all
  ✓ ...and one above it does

joint: all checks passed


flexisim: the hybrid arm (lumped joint + lattice link)
  ✓ the link mass is the material the solver actually steps
  ✓ and the centroid is the mean of the same distribution, not a formula
  ✓ the gravity torque follows from those two
  ✓ the self-weight link settles
    [self-weight] |sag| 5.3842e-1 vs theory 5.4276e-1 (-0.80%), bending 5.083e-1 + shear 3.446e-2
  ✓ a rigid joint leaves the self-weight sag rho g A L^4 / 8EI (+ shear)
  ✓ and the same weight at the tip would deflect 8/3 as far (so the two differ)
    [joint limit] link sag 1.346e-1 is 1.32% of the joint tilt 1.021e+1
  ✓ with a stiff link the tip motion is the joint wind-up, tilted
  ✓ and the wind-up is exactly tau_g / K
    [split] K=1e-1  joint 4.845e+0  link 5.384e-1  joint share 90.0%
    [split] K=2e-1  joint 2.151e+0  link 5.384e-1  joint share 80.0%
    [split] K=4e-1  joint 1.256e+0  link 5.384e-1  joint share 70.0%
    [split] K=9e-1  joint 5.384e-1  link 5.384e-1  joint share 50.0%
  ✓ the joint share falls monotonically as the gearbox stiffens
  ✓ and a realistic gearbox puts the tip error in the 70-90% band
  ✓ the link term is percent-level, not negligible -- which is why it is a lattice
  ✓ the encoder reads zero while the tip is not where it is commanded
    [mode 1] L/H 3.92  period 2817.7 steps  w 2.2299e-3 vs Euler-Bernoulli 2.4655e-3  (-9.56%)  over 5 crossings
  ✓ the link rings, and does so at a measurable period
  ✓ the first bending mode is within 12% of (1.875)^2 sqrt(EI/rho A L^4)
  ✓ and it rings LOW, which is what shear and rotary inertia do
    [mode 1] L/H 5.92  deficit 5.95% against 9.56% at L/H 3.92
  ✓ the frequency deficit shrinks as the beam gets slender (so it is shear, not scale)
    [dynamic] alpha 5.5535e-7 vs 5.5535e-7 (0.000%)  windup 9.5115e-3 vs 9.5115e-3 (0.00%)
    [dynamic] tip: tilt -2.235e-1 + bend -3.902e+0 = -4.126e+0   encoder 4.4483e+0 vs true link angle 4.4388e+0
  ✓ a commanded torque accelerates the arm at tau*N / (N^2 J_m + J_link)
  ✓ and delivering that acceleration winds the gearbox up by J*alpha/K
  ✓ the encoder leads the true link angle by exactly the wind-up it cannot see
  ✓ and the tip error is a real fraction of the move, not round-off
  ✓ tip error against the reference and against the encoder differ by the following error (ref 0)
  ✓ tip error against the reference and against the encoder differ by the following error (ref 0.3)
  ✓ tip error against the reference and against the encoder differ by the following error (ref -1.2)
  ✓ and the tilt is MINUS the wind-up times the arm
  ✓ the link rings during the move rather than sitting at a static offset
  ✓ an unintegrable gearbox is refused at build time, not discovered as NaN
    [margin 2] 1216 cells, 164.5 us/step, tip -0.055692253940486, slope -0.00453250838961
    [margin 1] 684 cells, 142.0 us/step, tip -0.055692253940486, slope -0.00453250838961
  ✓ one vacuum layer gives BIT-IDENTICAL statics to two
    [margin] 1.16x faster at 684 cells against 1216
  ✓ …and it is the shipped one, at a real saving

arm: all checks passed


flexisim: the two-link arm
    2R: joint N=100 K=4 J_refl=9.254e+4 w_n=0.01796 rad/s + joint N=100 K=4 J_refl=1.092e+4 w_n=0.03828 rad/s | L1=13.5 L2=9.5 M11=7.778e+4 M12=1.529e+4 M22=5460
    [inertia] M11 folded 38468 → straight 77780 (2.02x)   M12 -4368 / 5460 / 1.529e+4
  ✓ the mass matrix is symmetric, as a kinetic-energy quadratic form must be
  ✓ M(q2=0.00) matches the closed form
  ✓ M(q2=0.70) matches the closed form
  ✓ M(q2=1.57) matches the closed form
  ✓ M(q2=2.40) matches the closed form
  ✓ M(q2=3.14) matches the closed form
  ✓ the shoulder inertia changes by more than 2x across the elbow range
    [conservation] over 20000 free steps: energy drift 2.09e-4, momentum drift 1.60e-4   (shoulder swept 3.16 rad, elbow 3.079)
  ✓ a free arm conserves its energy
  ✓ and the momentum conjugate to the cyclic shoulder angle
  ✓ and it actually moved, so the conservation is not trivial
    [conservation] with the Coriolis terms removed it drifts 2.31e-2 in a tenth of the run
  ✓ without the Coriolis terms the momentum drifts by orders of magnitude more
  ✓ gravity torques at (0, 0) match the trigonometric form
  ✓ gravity torques at (0.6, -0.9) match the trigonometric form
  ✓ gravity torques at (1.4, 2) match the trigonometric form
    [gravity] shoulder torque straight 1.006e-2 → folded 7.152e-3 (1.41x)
  ✓ folding the elbow back unloads the shoulder
    [frame] link 2 sees omega 4.000e-4, origin accel [-2.160e-6, 0.000e+0] (-L1 w^2 = -2.160e-6)
  ✓ the elbow's acceleration is centripetal, -L1 omega^2 along the link
    [frame] spun at omega 4.0e-4: sigma_xx fits the OFFSET bar to 0.60% and the un-offset one to 212.9%
  ✓ the spun link settled
  ✓ link 2's stress is the rotating-bar profile about the SHOULDER, not its own root
    [frame] with the elbow term DROPPED: offset 69.4%, un-offset 4.15%
  ✓ dropping it lands on the un-offset profile instead -- a wrong answer, not an error
    [reach] straight 23.000 → folded 4.000 (L1 13.5, L2 9.5)
  ✓ the reach folds with the elbow: L1 + L2 straight, |L1 - L2| folded
  ✓ a milliradian at the shoulder costs more at the tool than one at the elbow
    [load side] one step from rest — alpha load-side 2.462e-8 / -6.120e-8, closed form 2.462e-8 / -6.120e-8, motor-side 0.000e+0
  ✓ a load-side torque is a generalised force on the LINK: alpha = M^-1 [T, 0]
  ✓ …while the same torque at the MOTOR reaches the link through the gearbox, so on the first step it delivers nothing
  ✓ …and the encoder reports the load-side torque as absent
  ✓ a zero load is bit-for-bit the same as no load

2R: all checks passed


flexisim: the tip-error soft sensor
    [locked] learner 0.3645  compliance model 1.4223  "tip = encoder" 1.0012  (500 locked samples, 544 features)
  ✓ the lifecycle reaches a locked, frozen readout
  ✓ and training is REFUSED once locked (the tracker is gone)
  ✓ a locked soft sensor beats the controller's own view of where the tip is
  ✓ and it beats the physics-based compliance model too
    [forecast +15 samples = 150 steps] learner 0.1035   persistence-of-estimate 0.6581   persistence-of-TRUTH 0.5417 (an oracle)
  ✓ the forecast beats the persistence baseline a machine could actually run
  ✓ and at this lead it beats the ORACLE persistence too, which needs the tracker
    [delay] the motor-side baseline lines up with the tip at lag 52 samples = 520 steps (r 0.5003); a quarter of the gearbox period would be 26
    [alignment] estimate correlates at lag 0 (r 0.9814), forecast at lag 14 (r 0.9969)
  ✓ the forecast lines up with the truth at its trained lead, to a sample
  ✓ and it correlates with the truth better than the present-time readout does
    [closed loop] estimate 0.0459  forecast 0.0402  best shift 0 (0.0459)  [open loop was 0.3645 / 0.1035]
  ✓ under a servo, no time shift improves the estimate — the error is not a lead
  ✓ …and the estimate is an order better than the open-loop protocol's
  ✓ …and the forecast advantage is gone: the two agree within 1.5x
    [backlash] dead band 7.35e-2 rad = 50% of the peak wind-up 1.47e-1
    [backlash] memoryless 0.6206 -> 0.7238   windowed 0.3645 -> 0.5884
  ✓ backlash degrades a MEMORYLESS estimator
    [backlash] memory is worth 1.70x clean and 1.23x under backlash; relative damage +16.6% vs +61.4%
  ✓ a history window still wins UNDER backlash, in the absolute terms a machine gets
  ✓ ...but it is hurt MORE in relative terms, having more structure to lose
  ✓ memory helps even without backlash, because a ringing phase needs history
    [horizon] lead   5 (  50 steps)  forecast 0.2911  persist-truth 0.1846  persist-est 0.4039  lag 5 r 0.9884
    [horizon] lead  15 ( 150 steps)  forecast 0.1035  persist-truth 0.5417  persist-est 0.6581  lag 14 r 0.9969
    [horizon] lead  30 ( 300 steps)  forecast 0.4064  persist-truth 1.0394  persist-est 1.1328  lag 28 r 0.9666
    [horizon] lead  60 ( 600 steps)  forecast 0.6576  persist-truth 1.8179  persist-est 1.9182  lag 60 r 0.9443
  ✓ the forecast beats the production persistence baseline at EVERY lead
  ✓ persistence degrades monotonically with the horizon
  ✓ the learner has an INTERIOR minimum -- worse at a shorter lead AND at a longer one
  ✓ every forecast lines up at its own trained lead to within two samples
  ✓ adding a forecast leaves the present-time estimate byte-identical
    [stiffness] K= 0.05  learner 0.8077  compliance 6.1800  advantage 7.65x
  ✓ the learner beats the compliance model at K=0.05
    [stiffness] K= 0.15  learner 0.6034  compliance 2.4521  advantage 4.06x
  ✓ the learner beats the compliance model at K=0.15
    [stiffness] K=  0.4  learner 0.3645  compliance 1.4223  advantage 3.90x
  ✓ the learner beats the compliance model at K=0.4
    [stiffness] K=1.282  learner 0.4745  compliance 1.0824  advantage 2.28x
  ✓ the learner beats the compliance model at K=1.282
    [dir bit] memoryless  no bit 0.6206 -> 0.7238 (+16.6%)   with bit 0.6322 -> 0.7009 (10.9%)
  ✓ AxisComp's direction bit reduces what backlash costs a MEMORYLESS model
    [dir bit] windowed   no bit 0.5884 (+61.4%)  with bit 0.7093 (+49.3%)   features 544 -> 751
  ✓ but with a lag window it buys no better ABSOLUTE score, at 207 more features
    [forgetting] lam 1.0 0.5884 tr 1.56e+3   lam .999 plain 0.6104 tr 4.14e+3   lam .999 directional 0.5892 tr 1.57e+3
  ✓ directional forgetting prevents the covariance wind-up plain forgetting causes
  ✓ directional forgetting matches lam = 1 in accuracy
  ✓ ...and plain forgetting is worse, so the bounded covariance costs nothing here

tipsensor: all checks passed


flexisim: the N-link chain
    [agreement] worst relative difference over 12 states — M 2.81e-15, G 1.36e-16, C 1.08e-15, frame params 0.00e+0
  ✓ the recursive solve reproduces the hand-derived 2R mass matrix to machine precision
  ✓ ...and its gravity and Coriolis torques
  ✓ ...and the frame parameters, which is the term only a chain has
    3R: L=[13.5, 9.5, 6.5] m=[272, 208, 160] M11=1.7910e+5 reach=29.50
    [inertia] base M11 straight 1.7910e+5 · elbow folded 40428 · both folded 45548 (4.43× across the range)
  ✓ the base inertia varies by more than 3x across the workspace
  ✓ the mass matrix is symmetric, as a kinetic-energy quadratic form must be
    [conservation] over 20000 free steps: energy drift 4.88e-4, momentum drift 3.85e-4   (base swept 2.75 rad)
  ✓ a free three-link arm conserves its energy
  ✓ and the momentum conjugate to the cyclic base angle
  ✓ and it actually moved, so the conservation is not trivial
    [conservation] with the bias torques removed it drifts 4.40e-2 in a tenth of the run
  ✓ without the Coriolis terms the momentum drifts by orders of magnitude more
    [frame] link 3 sees omega 4.000e-4, origin accel -3.680e-6 (-(L1+L2) w^2 = -3.680e-6)
  ✓ link 3's origin acceleration accumulates through BOTH joints upstream
    [frame] spun straight at omega 4.0e-4: sigma_xx fits the OFFSET bar to 1.95% and the un-offset one to 529%
  ✓ the spun third link settled
  ✓ link 3's stress is the rotating-bar profile about the BASE, not its own root
    [frame] with the origin acceleration DROPPED: offset 84%, un-offset 3.00%
  ✓ dropping it lands on the un-offset profile instead
    [levers] reach 29.50; tilts -2.950e-2 / -1.600e-2 / -6.500e-3
  ✓ each joint's wind-up is levered by the distance from THAT joint to the tool
  ✓ and the tool error is the sum of every tilt, every slope and every bend
    [projection] pose 0.00,0.00,0.00  lever 29.500 against a distance of 29.500   tilt[0] -2.950e-2
  ✓ the base wind-up is levered by the PROJECTION at pose 0.0
    [projection] pose 0.00,0.60,0.40  lever 22.544 against a distance of 27.111   tilt[0] -2.254e-2
  ✓ the base wind-up is levered by the PROJECTION at pose 0.6
    [projection] pose 0.00,1.57,0.00  lever 16.000 against a distance of 20.934   tilt[0] -1.600e-2
  ✓ the base wind-up is levered by the PROJECTION at pose 1.6
    [projection] pose 0.00,2.60,0.40  lever 1.885 against a distance of 5.913   tilt[0] -1.885e-3
  ✓ the base wind-up is levered by the PROJECTION at pose 2.6
    [projection] wrist folded: lever -16.500 against a distance of 16.500   tilt[0] 1.650e-2
  ✓ …and somewhere in the workspace that projection is NEGATIVE, where a distance cannot be

NR: all checks passed


flexisim: the tool sensor on a chain
    [whole arm] learner 0.0166   rigid model 0.9432   PLS frozen 0.0370   PLS adaptive 0.0428   "the tool is where the encoders say" 1.0181   (398 locked samples, 181 features from 10 signals)
  ✓ the chain sensor reaches a locked, frozen readout
  ✓ a locked whole-arm sensor beats the controller's own view of where the tool is
  ✓ …and it beats PLS, the linear model industry actually deploys for soft sensing
    [whole arm] PLS frozen 0.0370 vs adaptive 0.0428 — whichever leads here is a property of THIS stream's stationarity, not of the method
  ✓ and it beats the rigid two-joint compliance model, which knows M(q) and both stiffnesses
    [whole arm] forecast +150 steps 0.0595 vs persistence-of-estimate 0.7788
  ✓ the forecast beats the persistence baseline a machine could actually run
    [inputs, all at 181 features] whole arm 0.0166   shoulder only 0.0323   elbow only 0.0307
  ✓ reading both axes beats reading only the elbow's own signals
  ✓ ...and beats reading only the shoulder's
    [single axis] shoulder 0.0323 against elbow 0.0307 — a tie
  ✓ neither single axis has a monopoly on the tool, which the corrected target shows
  ✓ but each single-axis model still beats the naive view, so neither is blind
    [regime] elbow HELD: whole arm 0.0486   elbow only 0.2557   (both joints moving: 0.0166 / 0.0307)
  ✓ with the elbow HELD the whole-arm model still wins, once the window reaches the ring
    [regime] at the OLD 40-step window: whole arm 0.4696   elbow only 0.5542
  ✓ …and the narrow window, not the regime, is what the old reversal was measuring

chain sensor: all checks passed


flexisim: the residual trim and the feedrate governor

  ✓ a trim passes its estimate through when enabled
  ✓ …and injects EXACTLY zero when switched off, not merely a small number
  ✓ …and comes back on to the same value, so an A/B is reversible
  ✓ the per-joint scale converts the estimate into the domain's own units
  ✓ the magnitude limit clamps rather than refusing
  ✓ …and the peak is reported, because a trim held at its limit is being rescued rather than solving and the score cannot tell those apart
  ✓ the slew limit bounds the FIRST step too, from a standing start
  ✓ a non-finite estimate injects zero rather than propagating into the command
  ✓ below the deadband the feed is untouched
  ✓ at the tolerance the feed is cut to the floor
  ✓ …and past it, no further -- the floor is a floor
  ✓ halfway between deadband and tolerance is halfway to the floor
  ✓ the override slews rather than stepping, so the governor cannot excite the mode it was added to avoid
  ✓ time cost is mean(1/override), not 1/mean(override)
  ✓ a machine inside tolerance pays no cycle time at all

residual: all checks passed


flexisim: conventional control, and what a learner adds on top

  [soft  K 1 E 0.06]  conventional baseline contour 4.396e-1  (bias -1.32e-1 osc 4.19e-1)
      + T torque      5.292e-1  0.83x
      + P position    5.443e-1  0.81x   estimate nRMSE 0.322
      + F feedrate    3.870e-1  1.14x   time 1.176x  (min override 0.50)
      + P and F       4.710e-1  0.93x   time 1.339x
      + T P and F     7.387e-1  0.60x   time 1.396x
      + P trained LIVE (injection active while learning) 5.381e-1  0.82x   estimate nRMSE 0.177
      + T trained LIVE  5.321e-1  0.83x
  ✓ the conventional machine is a real baseline, not an open loop
  ✓ a learned layer improves on properly commissioned conventional control
  ✓ a correction driven by a LIVE error reading does not beat the conventional machine, at either injection domain
  ✓ …and not because the estimate is poor, which is what separates an architecture result from a sensor one
  ✓ training WITH the injection active makes the estimate markedly better
  ✓ …and the machine is NOT better for it, so the limit is the loop and not the fit
  ✓ the predictive feedrate governor IS worth its place, acting on the forecast and on the planner rather than on the loop
  ✓ the feedrate governor reports its cycle-time cost rather than hiding it
  [stiff K 16 E 0.15]  conventional baseline contour 1.428e-1  (bias -4.52e-2 osc 1.35e-1)
      + T torque      2.458e-1  0.58x
      + P position    1.581e-1  0.90x   estimate nRMSE 0.272
      + F feedrate    1.057e-1  1.35x   time 1.646x  (min override 0.50)
      + P and F       1.314e-1  1.09x   time 1.555x
      + T P and F     3.473e-1  0.41x   time 1.438x
      + P trained LIVE (injection active while learning) 1.585e-1  0.90x   estimate nRMSE 0.187
      + T trained LIVE  2.384e-1  0.60x

  [ENVELOPE-commissioned, deployed on a SHARP SQUARE it never ran]
      conventional     4.773e-1   (7784 samples over 5 trajectories, then locked)
      + P position     5.388e-1  0.89x   estimate nRMSE 0.584
      + F feedrate     4.265e-1  1.12x   time 1.158x
  ✓ the sensor transfers to the unseen deploy path well enough to be worth reading
  ✓ …and the feedrate governor still earns its place on a path nobody commissioned

hybrid: all checks passed


flexisim: what a locked soft sensor says about a path it has never run

    commissioned over 5 trajectories (7784 samples)
  ✓ the tracker is packed away and never comes back
    SAME path (what ILC needs)     estimate nRMSE 0.3051   (ILC on this path: converges)
    same shape, 30% SLOWER         estimate nRMSE 0.4361   (ILC on this path: 1.0000 — no table)
    same shape, 40% BIGGER         estimate nRMSE 0.3255   (ILC on this path: 1.0000 — no table)
    a CIRCLE, never seen           estimate nRMSE 0.6234   (ILC on this path: 1.0000 — no table)
    a SHARP square, never seen     estimate nRMSE 0.5609   (ILC on this path: 1.0000 — no table)
  ✓ it estimates well on the path it trained on
  ✓ …and it still beats predicting the mean on EVERY unseen path — different speed, different size, different geometry
  ✓ …including a path whose CORNERS it never saw, which is the hardest transfer here
    transfer costs 2.04x at its worst (0.3051 → 0.6234)

transfer: all checks passed


flexisim: the pilot and the stack, finally on the same denominator

    pilot commissioned: Ts 2149 N 58 — {"deploy":true,"why":"verified 2.86x on the machine (program; scribble 1.70x / program 2.86x)"}

  [K 1 E 0.06, rounded rectangle, last of 3 laps]
    conventional (computed torque + PD + RobotComp)  4.396e-1
    + PILOT          7.715e-2  5.70x   uPk 0.3186
    + tipcomp        4.388e-1  1.00x   uPk 0.0568
    + live trim      5.446e-1  0.81x   uPk 0.0500
  ✓ the pilot commissioned and vouched for itself on this machine
  ✓ the PILOT beats the conventional machine — which the stack never tested, because it did not contain a pilot
  ✓ …and the live-reading trim does not, so the two are different mechanisms and the earlier conclusion was about the wrong one

reconcile: all checks passed


flexisim: harmonic feedforward — the frame decides, and the step size decides

  [conventional machine, K 1 E 0.06, rounded rectangle, NH 16]
    conventional                    4.122e-1   bias -1.15e-1  osc 3.96e-1
  ✓ the residual of a properly commissioned conventional machine is OSCILLATION, not bias — which is what makes a lap-periodic correction the right shape
    + world-frame HFF,  9 passes     4.653e-2   8.86x
      2.16e-1 → 1.32e-1 → 8.86e-2 → 6.88e-2 → 6.64e-2 → 6.22e-2 → 6.01e-2 → 5.23e-2 → 4.65e-2
    + path-normal HFF, same solve   4.159e-1   0.99x
  ✓ a lap-periodic correction identified in the WORLD frame beats the conventional machine at least 4x
  ✓ …and it beats the SAME correction expressed in the rotating path-normal frame at least 2x, because a frame that spins smears one harmonic across its neighbours and the operator is then not diagonal
  ✓ …and the refinement is MONOTONE while it runs, rather than pumping — the guard stops it instead of letting it diverge
  ✓ …and it drives the bias to a fraction of what it removes, so the gain is not one term being traded for another

harmonic: all checks passed


flexisim: harmonic feedforward — the frame decides, and the step size decides

  conventional                      4.122e-1
  + HFF                             4.653e-2   8.86x
  pilot commissioned BARE  {"deploy":true,"why":"2 of 2 layer(s) verified (3.35x then 1.86x)"}
  pilot commissioned OVER  {"deploy":true,"why":"2 of 2 layer(s) verified (0.73x then 0.55x)"}

  pilot alone (bare)                             5.811e-2   7.09x   uPk 0.283
  HFF + pilot(bare)  — the double correction     4.029e-1   1.02x   uPk 0.654
  HFF + pilot(OVER)  — commissioned on what HFF leaves 1.378e+1   0.03x   uPk 2.390

  pilot deployed, HFF identified ON TOP (probe 0.05)
    using the CLEAN operator identified without the pilot  (baseline 5.668e-2)
    3.59e-2 → 2.82e-2 → 2.41e-2 → 2.15e-2 → 1.84e-2 → 1.59e-2 → 1.44e-2 → 1.35e-2 → 1.39e-2 → 1.38e-2 → 1.34e-2 → 1.40e-2

  PILOT + HFF-ON-TOP                             1.340e-2   30.76x over the conventional machine
    drive: peak 9.40e-4 / 2.68e-4 against tauMax 3.22e-3, saturated 0 / 0
    lap-to-lap 2.95e-3 against a residual of 1.38e-2 — the machine still repeats, so this is a correction and not a destabilisation
    correction peak 0.382 rad
  ✓ the composite beats the conventional machine at least 20x
  ✓ …and beats the cascade it sits on at least 2x, so the harmonic layer is doing work the dynamic one could not
  ✓ …without saturating the drive
  ✓ …and with the machine still repeating lap to lap, so it is a correction rather than a destabilisation

composite: all checks passed


flexisim: harmonic feedforward — the frame decides, and the step size decides


flexisim: global vs local, selected by leave-one-program-out

  converging a table per program:
    rounded 8x8 r1.5 f4e-3         4.122e-1 → 5.229e-2  7.88x
    rounded 10x6 r2 f3e-3 @13,1    2.350e-1 → 7.563e-2  3.11x
    rounded 6x10 r1 f5e-3 @11,-1   5.193e-1 → 2.604e-1  1.99x
    circle r3 f2e-3                8.361e-2 → 5.746e-2  1.46x
    circle r5 f6e-3 @13,1 ccw      4.759e-1 → 1.811e-1  2.63x
    sharp 9x7 f4e-3 @12,1          4.314e-1 → 1.288e-1  3.35x

  selection: fit on all but one program, then DEPLOY on the one held back
    mode      ridge    contour on the held-back program     vs its own open loop
    local      0.01   4.371e-1   0.987x   uRms 2.79e-1
    local       0.1   4.174e-1   1.033x   uRms 2.15e-1
    local         1   3.451e-1   1.250x   uRms 1.07e-1
    local        10   4.033e-1   1.070x   uRms 3.56e-2
    preview    0.01   4.527e-1   0.953x   uRms 3.73e-1
    preview     0.1   3.342e-1   1.291x   uRms 2.53e-1
    preview       1   3.186e-1   1.354x   uRms 1.30e-1
    preview      10   3.555e-1   1.214x   uRms 4.18e-2
    global     0.01   1.295e+1   0.033x   uRms 2.28e+0
    global      0.1   3.688e+0   0.117x   uRms 1.09e+0
    global        1   3.596e+0   0.120x   uRms 6.03e-1
    global       10   1.538e+0   0.280x   uRms 1.71e-1

  SELECTED ON THE MACHINE: preview, ridge 1, 1.354x on the program held back from the fit

  constant rung: mean training correction [-1.45e-3, 3.92e-3]

  ON HELD-OUT PROGRAMS (in neither the convergence nor the fit):
    circle r4 f3e-3      1.283e-1 → 9.696e-2   1.32x   uRms 2.32e-2 peak 0.056   [shuffle 0.77x, constant 0.95x]
    sharp 8x8 f4e-3      4.346e-1 → 2.172e-1   2.00x   uRms 1.02e-1 peak 0.347   [shuffle 0.85x, constant 1.01x]
  ✓ a map selected for transfer helps on a program it has never seen
  ✓ …and it beats a CONSTANT correction, so the features are doing the work

global-vs-local: all checks passed


flexisim: the button, on the arm — against the strongest number this repo has

  [arm K 1 E 0.06, rounded rect, feed 0.004, lap 7357]
  conventional machine 4.1216e-1  bias -1.15e-1  osc 3.96e-1  lag 2.21e-1   lap-to-lap floor 1.309e-10
  the lap-periodic rung reads the WHOLE TOOL ERROR in JOINT space   [contour 1.87x the lag rms]
  a lap-harmonic table can only cancel what lives in its own band, so the
  floor it leaves is the rest — measured on this machine's own error:
    nh  4 48.4% → 2.96e-1   nh  8 96.1% → 8.09e-2   nh 16 100.0% → 4.23e-3   nh 32 100.0% → 7.05e-4   nh 64 100.0% → 1.36e-4
  (band share of the error's variance, and the residual a PERFECT correction
   inside that band would leave — no Newton loop can go below it)
  ✓ the harness reproduces the conventional machine `composite.test.mjs` measures, so the comparison below is one variable — who chooses the constants — and not two machines
  [0m] as it arrived  4.1216e-1
  [6m] conventional (self-tuned)  3.3200e-1  1.24x   23 laps, 7 coefficients
  [8m] pilot cascade, depth 1  9.9789e-2  3.33x
  [10m] pilot cascade, depth 2  1.4156e-1  0.70x
  [12m] pilot cascade, depth 1 (rungs below withheld)  6.3021e-2  1.58x
  [14m] pilot cascade, depth 2 (rungs below withheld)  5.3554e-2  1.18x
  [14m] — the conventional rung WITHHELD  5.3554e-2  1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  [32m] lap-periodic (harmonic)  1.8387e-2  2.91x   68 laps, probe rand at 10% — a MEMORY: it will not transfer to another program

  as it arrived                                  4.1216e-1       
  conventional (self-tuned)                      3.3200e-1    1.24x   23 laps, 7 coefficients
  pilot cascade, depth 1                         9.9789e-2    3.33x
  pilot cascade, depth 2                         1.4156e-1    0.70x
  pilot cascade, depth 1 (rungs below withheld)  6.3021e-2    1.58x
  pilot cascade, depth 2 (rungs below withheld)  5.3554e-2    1.18x
  — the conventional rung WITHHELD               5.3554e-2    1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  lap-periodic (harmonic)                        1.8387e-2    2.91x   68 laps, probe rand at 10% — a MEMORY: it will not transfer to another program

  shipped {"classic":false,"stack":2,"hff":true}   4.1216e-1 → 1.8387e-2   22.42x   1934s
  composite.test.mjs's hand-built cascade(2) + HFF   1.3400e-2   30.76x

  what a lap-harmonic table could reach ON THE CASCADE-DEPLOYED machine (score 5.355e-2):
    nh  4 51.0% → 3.75e-2   nh  8 71.6% → 2.85e-2   nh 16 99.6% → 3.44e-3   nh 32 100.0% → 5.50e-4   nh 64 100.0% → 9.77e-5
    (against 4.23e-3 at nh 16 on the BARE machine — the denominator every headroom figure has used so far)

  the lap-periodic rung, pass by pass:
    3.45e-2 → 3.14e-2 → 2.70e-2 → 2.41e-2 → 2.37e-2 → 2.07e-2 → 3.43e-2 → 2.05e-2 → 1.89e-2 → 1.92e-2 → 1.90e-2 → 1.87e-2 → 4.27e-2 → 2.12e-2 → 1.87e-2
    harmonics damped per pass: 0 0 0 0 0 0 256 0 0 256 256 0 256 256 256   (of nh in the band)
    the machine repeats to 3.27e-4 (1.7% of the score), and 4 of 15 passes land within one of those of the best — so the deployed table is one draw from a cluster
    step ended at 1.56e-2  — the step was halved 6x, so passes were being rejected
  PHASE WALK: the pilot's cadence (9) does not divide the lap (7357): each lap starts 44% of a sample later than the last, so its phase walks and the lap-periodic rung sees a beat at a HALF-INTEGER harmonic it cannot represent. Index the host's look-ahead from the lap start to remove it.
  the floor rose UNDER a decision already made — these rungs were deployed on a margin that no longer clears at the final resolution:
    pilot cascade, depth 2  1.416e-1 against 9.979e-2  judged at floor 8.40e-5, final 1.68e-4
  the instrument's floor ROSE during commissioning, 1.31e-10 → 1.68e-4, on 'median of 9 runs' — the deployed machine is noisier than the bare one, and the comparisons above were made at the coarser resolution
  ✗ THE HEADLINE: the self-tuning ladder matches or beats composite.test.mjs's hand-built cascade(2) + HFF on the same machine and program — the strongest result this repository has at these settings  → 1.8387e-2 against 1.3400e-2
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored

autostack-arm: 1 check(s) FAILED

```

### browser-nine — exit 1 — 2026-08-29T21:33Z

```
Suite level: quick   areas: flexisim   phase: browser
  (--all forces both; --only=ngrc,flowsim selects explicitly)

module parse
  ✓ 82 modules parse


Smoke test → http://127.0.0.1:8137/

  ✓ page loads with no uncaught errors
  ✓ build version is stamped (> 0)
  ✓ debug launcher present
  ✓ console captured log/warn/error
  ✓ console panel opens
  ✓ version status reads "latest" vs local server
  ✓ eval box evaluates JS (1 + 2 → 3)
  ✓ modules.json ships and lists the module graph
  ✗ and every module the pages import is in it  → flexisim.html -> lib/flexisim/autohost.js
  ✓ a stale MODULE raises the banner, where "latest" alone would have hidden it
  ✓ index: the console Close button is on screen
  ✓ index: the console launcher keeps its own 46px size
  ✓ index: clicking Close actually closes the console
  ✓ docs launcher present
  ✓ marked library loaded
  ✓ opens CLAUDE.md with CLAUDE tag
  ✓ CLAUDE.md renders markdown (h1 element)
  ✓ file list groups CLAUDE context + Docs
  ✓ flexisim.html loads and builds the hybrid arm
  ✓ flexisim: the lattice link is built
  ✓ flexisim: the console Close button is on screen
  ✓ flexisim: the console launcher keeps its own 46px size
  ✓ flexisim: clicking Close actually closes the console
  ✓ flexisim: commissioning identifies a compliance and a bending mode
  ✓ flexisim: the identified compliance exceeds the gearbox alone, as a tip measurement must
  flexisim: softest link E 0.02, decay record 23532 steps -> mode 1.967e-3 (period 3194), analytic true
  ✓ flexisim: the softest link commissions without crashing
  ✓ flexisim: the softest link is reported OVER-DAMPED rather than mis-measured
  ✓ flexisim: and input shaping is disabled, because there is no mode to cancel
  ✓ flexisim: a plant rebuild leaves commissioning available again
  ✓ flexisim: a failed decay fit falls back and SAYS so, rather than throwing
  ✓ flexisim: and the badge names it as estimated rather than measured
  ✓ flexisim: and re-commissioning a link that DOES ring recovers a measured mode
  flexisim: bias -7.367e-2 -> -1.016e-3, oscillation 1.602e-1 -> 1.361e-1
  ✓ flexisim: mode ② (open loop + prediction) actually collapses the bias
  ✓ flexisim: and it leaves the oscillation alone, which is the other mechanism
  ✓ flexisim: the feedforward is evaluated AHEAD of the move, not on it
  flexisim: rms limited by — the link ringing. A quasi-static model (② and ③) cannot canc…
  ✓ flexisim: the stats name which mechanism limits the rms, not just its value
  ✓ flexisim: mode ③ is REFUSED until the soft sensor is locked, and says which mode is live
  ✓ flexisim: the error chart tracks the run rather than freezing on its first points
  flexisim: chart means — commanded motor 7.36e-2, actual motor 7.92e-2, true arm 1.01e-2
  ✓ flexisim: the chart carries all five positions
  ✓ flexisim: with the correction on, the MOTOR is off target and the TOOL is on it
  flexisim: drawn/true tool error over 90 frames — 1.0000 to 1.0000 of the magnification (want 1.0)
  ✓ flexisim: the picture magnifies the WHOLE tool error, wind-up and bending alike
  ✓ flexisim: training dithers the correction, so the model sees the loop it will be inside
  flexisim: soft sensor estimating after 1420 pairs — estimate 0.0665 vs naive 1.1186, forecast 0.0775 vs persistence 0.7097
  ✓ flexisim: the soft sensor reaches a locked, frozen readout
  ✓ flexisim: and the LOCKED estimate beats the controller's own view of the tip
  ✓ flexisim: the forecast beats persistence on the readout's own estimate
  flexisim: closed loop active=closed offset 6.771 mrad — bias -7.367e-2 -> 1.283e-2, oscillation 1.602e-1 -> 1.645e-1
  ✓ flexisim: once LOCKED, mode ③ really engages
  ✓ flexisim: and the closed loop cuts the bias with no model at all
  ✓ flexisim: it leaves the oscillation alone too — it cannot chase what it sits on
  flexisim: compare filled open, ff, closed — bias open -6.89e-2 / ff 1.36e-4 / closed 1.28e-2
  ✓ flexisim: Compare runs every mode by itself and fills the table
  ✓ flexisim: and the table it produced ranks the corrections below the open loop
  ✓ flexisim: Auto-tune starts a sequence and reports which step it is on
  ✓ flexisim: …and LOCKS the manual controls while it owns the machine
  flexisim: auto-tune selected learned, board open 9.51e-2 / ff 4.32e-2 / learned 2.28e-2 / closed 6.69e-2
  ✓ flexisim: Auto-tune finishes and leaves a correction selected
  ✓ flexisim: the learned filter gets fitted and reports its size
  flexisim: learned 2.28e-2 vs model 4.32e-2 vs open 9.51e-2
  ✓ flexisim: …and beats the quasi-static model it sits on top of
  ✓ flexisim: …by reducing the OSCILLATION, which nothing else here can
  ✓ flexisim: …the one its own table scored best, not a favourite
  flexisim: after auto-tune — running learned, sensor commissioned under learned, estimate 0.0275 vs naive 1.8594, forecast 0.0366 vs persistence 0.5891
  ✓ flexisim: the sensor is commissioned in the configuration auto-tune chose
  flexisim: sensor locked at step "lock it" after 6020 pairs, under learned
  ✓ flexisim: …and the LOCK is the last step of the sequence, not one in the middle
  ✓ flexisim: …so the sensor keeps learning past the training target and tops up
  ✓ flexisim: …and it is locked, so the tracker really has gone away
  ✓ flexisim: …so the readout the user is left looking at is actually good
  ✓ flexisim: …and so is its forecast
  ✓ flexisim: …and the winner it kept is the one the settled machine measures
  flexisim: control roughness — jerk off 1.29e-1, jerk 120 1.19e-3 (109x smoother), period 6516 -> 6756
  ✓ flexisim: the jerk limit makes the control signal dramatically smoother
  ✓ flexisim: …and it does NOT shrink the correction, which would be cheating
  ✓ flexisim: …the dwell grows to cover its delay, so the move still finishes
  flexisim: drive — rated 32x hold, saturated 0.0%, rms 4.318e-2; rated 2x, saturated 45.1%, rms 4.203e-1
  ✓ flexisim: the drive has a torque rating and reports what it was asked for
  ✓ flexisim: …the shipped rating carries the shipped move without saturating
  ✓ flexisim: …and a drive too small for the move SATURATES and lags, as a real one does
  ✓ flexisim: the stage draws the excursion the tool actually sweeps
  ✓ flexisim: …and the arm drawn NOW is inside the band drawn around it
  ✓ flexisim: …with the settled value between the two, which is what the tick marks
  ✓ flexisim: and the manual controls come back afterwards
  ✓ flexisim: the sinusoid profile takes, with the period the frequency slider asked for
  ✓ flexisim: and only ONE profile's sliders are on screen at a time
  ✓ flexisim: and the arm actually follows it rather than sitting at the home pose
  ✓ flexisim: the stage is painted
  flexisim/chain: M11 straight 7.778e+4 folded 3.847e+4 (2.02x); elbow load rms M21a1 9.03e-3 vs M22a2 4.86e-4; tool error 7.06e-3 over reach 22.0
  ✓ flexisim/chain: the shoulder inertia changes by more than 2x across the elbow range
  ✓ flexisim/chain: with the elbow commanded to HOLD, its inertial load is mostly the shoulder's
  ✓ flexisim/chain: and the elbow gearbox really carries a torque it was never commanded
  flexisim/chain: tool sensor estimating after 1056 pairs — whole arm 0.0779, elbow only 0.0559 (0.72x), naive 1.0306
  flexisim/chain: drawn tool vs the model — 0.9987 of the magnification (want 1.0), axial 4.35e-1
  ✓ flexisim/chain: the picture draws the same tool error the model reports
  ✓ flexisim/chain: …and the sweep band spans the error it bounds
  ✓ flexisim/chain: both tool sensors reach a locked, frozen readout
  ✓ flexisim/chain: the whole-arm sensor beats the controller's own view of the tool
  ✓ flexisim/chain: and the elbow-only model at matched capacity also beats naive
  flexisim/chain: tool bias vs the program — open -1.023e-1 / model -1.152e-1 / closed -2.182e-3 (pre-distortion 5.29 mrad)
  ✓ flexisim/chain: every correction mode reaches the shoulder as a real pre-distortion
  ✓ flexisim/chain: and the loop SETTLES rather than running to its clamp
  ✓ flexisim/chain: no correction makes the tool dramatically worse
  ✓ flexisim/chain: a full scoring window really produces a table row
  ✓ flexisim/chain: the learned filter is offered as a fourth correction
  ✓ flexisim/chain: …and is REFUSED until one has been fitted
  ✓ flexisim/chain: input shaping is refused until the bending mode is measured
  flexisim/chain: with the ring fit forced to fail — stopped, badge "auto-tune: could not measure the bending mode — no usable ring in the decay, so shaping stays off"
  ✓ flexisim/chain: a sub-task that cannot succeed STOPS the sequence rather than restarting it for ever
  ✓ flexisim/chain: …and says which step could not be done
  ✓ flexisim/chain: …and unwinds the training it had turned on
  ✓ flexisim/chain: the stage is painted
  flexisim/path: rounded, 29.42 long, lap 7356 steps, 1080 cells; homed 2.09e-2 from the start of the program
  ✓ flexisim/path: the arm homes onto the start of the program
  ✓ flexisim/path: …and it is a closed loop the machine never stops on
  ✓ flexisim/path: an identified correction that does not exist is not applied
  ✓ flexisim/path: …and so is a pilot that has not vouched for itself
  ✓ flexisim/path: …and ⑤+④ needs that same vouched pilot before its table acts
  ✓ flexisim/path: …and so is a fully learned system that has not been commissioned
  ✓ flexisim/path: …and ⑦ inherits exactly the same refusal
  flexisim/path: after 3000 steps — contour 9.20e-2, lag 3.81e-1, unobservable 1.24e-1 vs following 3.78e-1
  ✓ flexisim/path: the contour/lag split is live and both are finite
  ✓ flexisim/path: a feedrate change mid-lap is queued rather than applied
  flexisim/path: feedrate 4.0e-3 → 1.0e-2, lap 7356 → 3268; arc 19.200 → 19.200 of 29.42
  ✓ flexisim/path: applying it changes the speed and keeps the place on the part
  ✓ flexisim/path: …and the error trail and chart are still being fed after it
  ✓ flexisim/path: the stage is painted
  flexisim/path: drawn tool vs the model — gap 0.00e+0 on a 10.71 reach
  ✓ flexisim/path: the drawn tool IS the tool every metric is computed from
  flexisim: chart containers — ss-chart 170px, err-chart 170px, cs-chart 170px, chain-pos 170px, chain-chart 170px, bb-chart 170px, path-chart 170px
  ✓ flexisim: every Plotly container gets its height from CSS, so none can strobe
  flexisim: chart widths — err-chart 388/388/svg 388, ss-chart 388/388/svg 388, chain-pos 388/388/svg 388, chain-chart 388/388/svg 388, cs-chart 388/388/svg 388, path-chart 388/388/svg 388, bb-chart 388/388/svg 388
  ✓ flexisim: …and its width, so no chart is drawn wider than the box it sits in
  ✓ flexisim: …and the page does not scroll sideways on a phone
  ✓ flexisim: every in-browser closed-form check passes
  ✓ flexisim: the page reports no errors of its own

Section timings (s):
      1  startup
      5  index page
    161  flexisim move
     47  flexisim chain
      7  flexisim path
      1  flexisim verify

FAIL — 1 check(s) failed. Screenshots in test/screenshots/

```
