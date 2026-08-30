
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

### arm-shared-host — exit 0 — 2026-08-29T21:37Z

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

  shipped {"classic":false,"stack":2,"hff":true}   4.1216e-1 → 1.8387e-2   22.42x   1955s
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
  ✓ THE CONTRACT: the self-tuning ladder beats the same composite re-measured on THIS program at 6 passes (brick 66, 20.34x) on the same machine and program — if this goes red the ladder has regressed against a number it has held
  the stretch — composite.test.mjs's hand-built cascade(2) + HFF at its best case — is 1.3400e-2; this run is 1.8387e-2, 1.37x of it — not yet met
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored

autostack-arm: all checks passed

```

### browser-nine-full — exit 1 — 2026-08-29T21:57Z

```
Suite level: full   areas: flexisim   phase: browser
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
  ✓ and every module the pages import is in it
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
  flexisim: bias -7.365e-2 -> -8.872e-4, oscillation 1.602e-1 -> 1.361e-1
  ✓ flexisim: mode ② (open loop + prediction) actually collapses the bias
  ✓ flexisim: and it leaves the oscillation alone, which is the other mechanism
  ✓ flexisim: the feedforward is evaluated AHEAD of the move, not on it
  flexisim: rms limited by — the link ringing. A quasi-static model (② and ③) cannot canc…
  ✓ flexisim: the stats name which mechanism limits the rms, not just its value
  ✓ flexisim: mode ③ is REFUSED until the soft sensor is locked, and says which mode is live
  ✓ flexisim: the error chart tracks the run rather than freezing on its first points
  flexisim: chart means — commanded motor 7.36e-2, actual motor 7.93e-2, true arm 1.01e-2
  ✓ flexisim: the chart carries all five positions
  ✓ flexisim: with the correction on, the MOTOR is off target and the TOOL is on it
  flexisim: drawn/true tool error over 90 frames — 1.0000 to 1.0000 of the magnification (want 1.0)
  ✓ flexisim: the picture magnifies the WHOLE tool error, wind-up and bending alike
  ✓ flexisim: training dithers the correction, so the model sees the loop it will be inside
  flexisim: soft sensor estimating after 1440 pairs — estimate 0.0806 vs naive 1.1295, forecast 0.1023 vs persistence 0.6921
  ✓ flexisim: the soft sensor reaches a locked, frozen readout
  ✓ flexisim: and the LOCKED estimate beats the controller's own view of the tip
  ✓ flexisim: the forecast beats persistence on the readout's own estimate
  flexisim: closed loop active=closed offset 6.420 mrad — bias -7.365e-2 -> 1.001e-2, oscillation 1.602e-1 -> 1.645e-1
  ✓ flexisim: once LOCKED, mode ③ really engages
  ✓ flexisim: and the closed loop cuts the bias with no model at all
  ✓ flexisim: it leaves the oscillation alone too — it cannot chase what it sits on
  flexisim: compare filled open, ff, closed — bias open -7.13e-2 / ff 1.36e-4 / closed 1.00e-2
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
  flexisim: after auto-tune — running learned, sensor commissioned under learned, estimate 0.0274 vs naive 1.9057, forecast 0.0349 vs persistence 0.6389
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
  flexisim: drive — rated 32x hold, saturated 0.0%, rms 4.318e-2; rated 2x, saturated 44.3%, rms 4.204e-1
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
  flexisim/chain: tool sensor estimating after 1056 pairs — whole arm 0.0682, elbow only 0.0461 (0.68x), naive 1.0961
  flexisim/chain: drawn tool vs the model — 1.0059 of the magnification (want 1.0), axial 2.17e-2
  ✓ flexisim/chain: the picture draws the same tool error the model reports
  ✓ flexisim/chain: …and the sweep band spans the error it bounds
  ✓ flexisim/chain: both tool sensors reach a locked, frozen readout
  ✓ flexisim/chain: the whole-arm sensor beats the controller's own view of the tool
  ✓ flexisim/chain: and the elbow-only model at matched capacity also beats naive
  flexisim/chain: tool bias vs the program — open -1.027e-1 / model -8.995e-2 / closed -3.187e-3 (pre-distortion 5.36 mrad)
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
  flexisim/chain: auto-tune selected learned, mode period 862, board open 2.40e-1 / ff 2.35e-1 / learned 1.10e-1 / closed 2.29e-1
  ✓ flexisim/chain: auto-tune measures the bending mode from an unshaped kick
  ✓ flexisim/chain: …and turns the shaper on once it has one
  ✓ flexisim/chain: …fits the learned filter and reports its size
  ✓ flexisim/chain: …scores every mode, so the table is not empty
  ✓ flexisim/chain: …and the learned filter beats the quasi-static model it sits on
  ✓ flexisim/chain: …by reducing the OSCILLATION, which nothing else here can
  ✓ flexisim/chain: …and selects the mode its own table scored best
  flexisim/chain: sensors locked at step "lock them" after 6016 pairs, under learned
  ✓ flexisim/chain: the LOCK is the last step of the sequence, not one in the middle
  ✓ flexisim/chain: …so the sensors keep learning past the target and top up
  flexisim/chain: after auto-tune — running learned, sensors under learned, whole arm 0.0122 vs naive 1.0592
  ✓ flexisim/chain: …commissions the tool sensors in the configuration it chose
  ✓ flexisim/chain: …so the readout the user is left with is actually good
  flexisim/chain: control roughness — jerk off 1.25e-1, jerk 120 1.10e-3 (114x smoother)
  ✓ flexisim/chain: the jerk limit makes the shoulder correction smoother too
  ✓ flexisim/chain: …without shrinking it
  flexisim/chain: drive rated 32x hold, saturated 0.0% / 0.0%
  ✓ flexisim/chain: both joints have a rated drive that reports its demand
  ✓ flexisim/chain: …and it carries the shipped move without saturating
  ✓ flexisim/chain: the stage bounds the magnified shake with the swept band
  ✓ flexisim/chain: …and gives the manual controls back afterwards
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
  flexisim/path: feedrate 4.0e-3 → 1.0e-2, lap 7356 → 3268; arc 26.400 → 26.397 of 29.42
  ✓ flexisim/path: applying it changes the speed and keeps the place on the part
  ✓ flexisim/path: …and the error trail and chart are still being fed after it
  ✓ flexisim/path: the stage is painted
  flexisim/path: drawn tool vs the model — gap 0.00e+0 on a 12.67 reach
  ✓ flexisim/path: the drawn tool IS the tool every metric is computed from
  ✓ flexisim/path: ⑨ starts with nothing commissioned and its panel hidden
  ✓ flexisim/path: …and selecting ⑨ before commissioning is REFUSED, not run
  flexisim/path: identified c -4.559e-1 / -1.443e+0 against −1/K = -6.250e-2
  ✓ flexisim/path: the identified compliance has the gearbox's sign and exceeds it
  ✓ flexisim/path: …and selecting it is then honoured
  flexisim/path: learning, lap by lap — 5.87e-1 → 5.48e-1 → 4.84e-1 → 3.88e-1 → 2.68e-1 → 2.04e-1 → 1.74e-1 → 1.52e-1
  ✓ flexisim/path: the learner drives the contour error down lap on lap
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^

page.waitForFunction: Timeout 900000ms exceeded.
    at /home/user/Tisaic.github.io/test/smoke.mjs:2880:12 {
  name: 'TimeoutError'
}

Node.js v22.22.2
```

### browser-clean — exit 1 — 2026-08-29T22:44Z

```
Suite level: full   areas: flexisim   phase: browser
  (--all forces both; --only=ngrc,flowsim selects explicitly)

module parse
  ✓ no shipped module reaches for a Node global
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
  ✓ and every module the pages import is in it
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
  flexisim: bias -7.365e-2 -> -8.872e-4, oscillation 1.602e-1 -> 1.361e-1
  ✓ flexisim: mode ② (open loop + prediction) actually collapses the bias
  ✓ flexisim: and it leaves the oscillation alone, which is the other mechanism
  ✓ flexisim: the feedforward is evaluated AHEAD of the move, not on it
  flexisim: rms limited by — the link ringing. A quasi-static model (② and ③) cannot canc…
  ✓ flexisim: the stats name which mechanism limits the rms, not just its value
  ✓ flexisim: mode ③ is REFUSED until the soft sensor is locked, and says which mode is live
  ✓ flexisim: the error chart tracks the run rather than freezing on its first points
  flexisim: chart means — commanded motor 7.38e-2, actual motor 8.05e-2, true arm -1.03e-3
  ✓ flexisim: the chart carries all five positions
  ✓ flexisim: with the correction on, the MOTOR is off target and the TOOL is on it
  flexisim: drawn/true tool error over 90 frames — 1.0000 to 1.0000 of the magnification (want 1.0)
  ✓ flexisim: the picture magnifies the WHOLE tool error, wind-up and bending alike
  ✓ flexisim: training dithers the correction, so the model sees the loop it will be inside
  flexisim: soft sensor estimating after 1420 pairs — estimate 0.0784 vs naive 1.1296, forecast 0.1108 vs persistence 0.7050
  ✓ flexisim: the soft sensor reaches a locked, frozen readout
  ✓ flexisim: and the LOCKED estimate beats the controller's own view of the tip
  ✓ flexisim: the forecast beats persistence on the readout's own estimate
  flexisim: closed loop active=closed offset 6.708 mrad — bias -7.365e-2 -> 9.779e-3, oscillation 1.602e-1 -> 1.645e-1
  ✓ flexisim: once LOCKED, mode ③ really engages
  ✓ flexisim: and the closed loop cuts the bias with no model at all
  ✓ flexisim: it leaves the oscillation alone too — it cannot chase what it sits on
  flexisim: compare filled open, ff, closed — bias open -7.03e-2 / ff 1.36e-4 / closed 9.78e-3
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
  flexisim: drive — rated 32x hold, saturated 0.0%, rms 4.318e-2; rated 2x, saturated 43.6%, rms 4.204e-1
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
  flexisim/chain: tool sensor estimating after 1056 pairs — whole arm 0.0965, elbow only 0.0537 (0.56x), naive 1.0307
  flexisim/chain: drawn tool vs the model — 0.9987 of the magnification (want 1.0), axial 4.35e-1
  ✓ flexisim/chain: the picture draws the same tool error the model reports
  ✓ flexisim/chain: …and the sweep band spans the error it bounds
  ✓ flexisim/chain: both tool sensors reach a locked, frozen readout
  ✓ flexisim/chain: the whole-arm sensor beats the controller's own view of the tool
  ✓ flexisim/chain: and the elbow-only model at matched capacity also beats naive
  flexisim/chain: tool bias vs the program — open -1.023e-1 / model -1.152e-1 / closed -1.503e-3 (pre-distortion 5.37 mrad)
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
  flexisim/chain: auto-tune selected learned, mode period 862, board open 2.40e-1 / ff 2.35e-1 / learned 1.10e-1 / closed 2.29e-1
  ✓ flexisim/chain: auto-tune measures the bending mode from an unshaped kick
  ✓ flexisim/chain: …and turns the shaper on once it has one
  ✓ flexisim/chain: …fits the learned filter and reports its size
  ✓ flexisim/chain: …scores every mode, so the table is not empty
  ✓ flexisim/chain: …and the learned filter beats the quasi-static model it sits on
  ✓ flexisim/chain: …by reducing the OSCILLATION, which nothing else here can
  ✓ flexisim/chain: …and selects the mode its own table scored best
  flexisim/chain: sensors locked at step "lock them" after 6016 pairs, under learned
  ✓ flexisim/chain: the LOCK is the last step of the sequence, not one in the middle
  ✓ flexisim/chain: …so the sensors keep learning past the target and top up
  flexisim/chain: after auto-tune — running learned, sensors under learned, whole arm 0.0117 vs naive 1.0514
  ✓ flexisim/chain: …commissions the tool sensors in the configuration it chose
  ✓ flexisim/chain: …so the readout the user is left with is actually good
  flexisim/chain: control roughness — jerk off 1.25e-1, jerk 120 1.10e-3 (114x smoother)
  ✓ flexisim/chain: the jerk limit makes the shoulder correction smoother too
  ✓ flexisim/chain: …without shrinking it
  flexisim/chain: drive rated 32x hold, saturated 0.0% / 0.0%
  ✓ flexisim/chain: both joints have a rated drive that reports its demand
  ✓ flexisim/chain: …and it carries the shipped move without saturating
  ✓ flexisim/chain: the stage bounds the magnified shake with the swept band
  ✓ flexisim/chain: …and gives the manual controls back afterwards
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
  flexisim/path: feedrate 4.0e-3 → 1.0e-2, lap 7356 → 3268; arc 18.000 → 18.000 of 29.42
  ✓ flexisim/path: applying it changes the speed and keeps the place on the part
  ✓ flexisim/path: …and the error trail and chart are still being fed after it
  ✓ flexisim/path: the stage is painted
  flexisim/path: drawn tool vs the model — gap 0.00e+0 on a 15.27 reach
  ✓ flexisim/path: the drawn tool IS the tool every metric is computed from
  ✓ flexisim/path: ⑨ starts with nothing commissioned
  ✓ flexisim/path: …and its panel is shown exactly when ⑨ is the selected mode
  ✓ flexisim/path: …and selecting ⑨ before commissioning is REFUSED, not run
  flexisim/path: identified c -4.561e-1 / -1.433e+0 against −1/K = -6.250e-2
  ✓ flexisim/path: the identified compliance has the gearbox's sign and exceeds it
  ✓ flexisim/path: …and selecting it is then honoured
  flexisim/path: learning, lap by lap — 5.87e-1 → 5.48e-1 → 4.84e-1 → 3.88e-1 → 2.68e-1 → 2.04e-1 → 1.74e-1 → 1.52e-1
  ✓ flexisim/path: the learner drives the contour error down lap on lap
  ✓ flexisim/path: ⑤ commissioning runs to a result without halting
  flexisim/path: pilot deployed — verified 3.40x on the machine (program; scribble 4.28x / program 3.40x); Ts 2142, sample 9
  ✓ flexisim/path: the pilot commissions in the browser and the machine vouches for it
  ✓ flexisim/path: …and deploying lands in the selector, not just in a report
  flexisim/path: pilot lap — contour 2.097e-2, tau2 2.476e-4 against the open loop's 1.34e-1 / 5.93e-4
  ✓ flexisim/path: …and the deployed pilot cuts the contour on a program it never saw
  ✓ flexisim/path: ⑧ knows both halves are commissioned
  ✓ flexisim/path: …and its toggles are exposed and both on by default
  ✓ flexisim/path: ⑧ turning the pilot off changes the applied correction
  ✓ flexisim/path: …and turning the compliance off changes it too, so both toggles act
  ✓ flexisim/path: ⑧’s compliance half IS ③, to the last bit
  ✗ flexisim/path: …and ⑧’s pilot half IS ⑤, so no clamp of ③’s eats the pilot  → {"sComp":[0.0014092374454148671,0.01030015345552697],"sPilot":[-0.006053898331439339,-0.045151302156444195],"sBoth":[-0.004293462725726509,-0.035227313152322276],"only3":[0.0014092374454148671,0.01030015345552697],"only5":[-0.005351502010843413,-0.045903631059254296]}
  ✗ flexisim/path: …and ⑧ with both on is their sum  → {"sComp":[0.0014092374454148671,0.01030015345552697],"sPilot":[-0.006053898331439339,-0.045151302156444195],"sBoth":[-0.004293462725726509,-0.035227313152322276],"only3":[0.0014092374454148671,0.01030015345552697],"only5":[-0.005351502010843413,-0.045903631059254296]}
  ✓ flexisim/path: ⑧ over-commissioning the pilot runs to a result without halting
  ✓ flexisim/path: ⑧ commissions the pilot OVER the identified compliance when asked
  ✓ flexisim/path: ⑧ one tap sets up the plant the 5.70x was measured on
  ✓ flexisim/path: …and the program too — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: …and it arms the OVER-commissioning the stack needs, still on ⑧
  ✓ flexisim/path: …and the rebuild cleared the previous machine’s learners
  ✗ flexisim/path: (the machine is first driven OFF the measured configuration, so the checks below have teeth)  → {"K":32,"E":0.06,"shape":"","feed":0.001,"corner":10}
  ✓ flexisim/path: ⑨ sets up its own machine — K 1 / E 0.06, no other button pressed
  ✓ flexisim/path: …and its own program — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: ⑨ commissioning does not fail out of the gate
  ✓ flexisim/path: ⑨ the button builds the host and the machine turns
  ✓ flexisim/path: …and the report panel opens while it runs, so the run is visible
  ✓ flexisim/path: …and the button becomes a live Stop rather than going dead
  ✓ flexisim/path: …and stopping clears the host, so no partial ladder can deploy
  ✓ flexisim/path: …and ⑨ is refused again after the stop, as it was before it
  flexisim/blackbox: measured settling 2280 steps, DC gain 15.46 against an arm length of 15.5 it was never told; predicted 1.92x, MEASURED 5.34x, achieved 4.84x, as a constrained costing 5870 MAC/update = 84 MAC/cycle over the 70 cycles between updates (3.4% of 5% of a 1 ms cycle), basis top-128
  ✓ flexisim/blackbox: it measures the plant's own timescale from a step
  ✓ flexisim/blackbox: …and recovers the ARM LENGTH it was never given
  ✓ flexisim/blackbox: …and an impulse response agreeing with it in sign and size
  ✓ flexisim/blackbox: …and validates the PLANT model on held-out probe samples
  ✓ flexisim/blackbox: …then designs a feedforward that looks AHEAD of the command
  ✓ flexisim/blackbox: …and what it MEASURED on the machine is what it achieves
  ✓ flexisim/blackbox: …in an arithmetic budget a 1 ms PLC task can afford
  ✓ flexisim/blackbox: …without making the machine worse
  flexisim/blackbox: command second difference 146x the bare reference's, torque 1.7x the uncorrected machine's
  ✓ flexisim/blackbox: …and the command it hands the drive is one the drive can follow
  ✓ flexisim/blackbox: …and the trial ladder scored smoothness alongside tracking
  ✓ flexisim/blackbox: …and the tool is drawn ON the stage, not off it
  ✓ flexisim/blackbox: …and the estimate is drawn ON the tool, as its score says
  ✓ flexisim/blackbox: the correction is limited to 80% of what the drive has SPARE
  ✓ flexisim/blackbox: …and a supplied limit of zero is a LIMIT, not an absence
  flexisim/blackbox: jerk 120 → 1800 steps, move period 7062 → 10422, correction limit 3.831e-1 → 5.281e-1
  ✓ flexisim/blackbox: the jerk limit really changes the command it is given
  ✓ flexisim/blackbox: …and throws the commissioning away, because the map was of the old one
  flexisim/blackbox: with joint friction — R2 0.0025, dc -0.0615, gain -0.0184, REFUSED: the step test and the probe disagree about the plant's gain (-0.0615 against -0.0184)
  ✓ flexisim/blackbox: friction makes the plant unidentifiable, and it says so instead of designing against it
  ✓ flexisim/blackbox: …and applies no correction while refusing
  ✓ flexisim/blackbox: …and the panel says so instead of throwing on the missing fields
  flexisim/blackbox: settle 1 → 8 ring, move period 10422 → 24576
  ✓ flexisim/blackbox: the settle really lengthens the dwell between moves
  ✓ flexisim/blackbox: the stage is painted
  flexisim: chart containers — ss-chart 170px, err-chart 170px, cs-chart 170px, chain-pos 170px, chain-chart 170px, bb-chart 170px, path-chart 170px
  ✓ flexisim: every Plotly container gets its height from CSS, so none can strobe
  flexisim: chart widths — err-chart 388/388/svg 388, ss-chart 388/388/svg 388, chain-pos 388/388/svg 388, chain-chart 388/388/svg 388, cs-chart 388/388/svg 388, path-chart 388/388/svg 388, bb-chart 388/388/svg 388
  ✓ flexisim: …and its width, so no chart is drawn wider than the box it sits in
  ✓ flexisim: …and the page does not scroll sideways on a phone
  ✓ flexisim: every in-browser closed-form check passes
  ✗ flexisim: the page reports no errors of its own  → [{"type":"error","time":"22:41:36.447","text":"Uncaught TypeError: Cannot read properties of undefined (reading 'text')  @ http://127.0.0.1:8137/flexisim.html:7225:74\nTypeError: Cannot read properties of undefined (reading 'text')\n    at statsP (http://127.0.0.1:8137/flexisim.html:7225:74)\n    at

Section timings (s):
      4  index page
    162  flexisim move
    289  flexisim chain
    192  flexisim path
    152  flexisim black box
      1  flexisim verify

FAIL — 4 check(s) failed. Screenshots in test/screenshots/

```

### browser-final — exit 1 — 2026-08-29T22:54Z

```
Suite level: full   areas: flexisim   phase: browser
  (--all forces both; --only=ngrc,flowsim selects explicitly)

module parse
  ✓ no shipped module reaches for a Node global
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
  ✓ and every module the pages import is in it
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
  flexisim: bias -7.365e-2 -> -6.168e-4, oscillation 1.602e-1 -> 1.361e-1
  ✓ flexisim: mode ② (open loop + prediction) actually collapses the bias
  ✓ flexisim: and it leaves the oscillation alone, which is the other mechanism
  ✓ flexisim: the feedforward is evaluated AHEAD of the move, not on it
  flexisim: rms limited by — the link ringing. A quasi-static model (② and ③) cannot canc…
  ✓ flexisim: the stats name which mechanism limits the rms, not just its value
  ✓ flexisim: mode ③ is REFUSED until the soft sensor is locked, and says which mode is live
  ✓ flexisim: the error chart tracks the run rather than freezing on its first points
  flexisim: chart means — commanded motor 6.45e-2, actual motor 7.83e-2, true arm 1.07e-2
  ✓ flexisim: the chart carries all five positions
  ✓ flexisim: with the correction on, the MOTOR is off target and the TOOL is on it
  flexisim: drawn/true tool error over 90 frames — 1.0000 to 1.0000 of the magnification (want 1.0)
  ✓ flexisim: the picture magnifies the WHOLE tool error, wind-up and bending alike
  ✓ flexisim: training dithers the correction, so the model sees the loop it will be inside
  flexisim: soft sensor estimating after 1420 pairs — estimate 0.0675 vs naive 1.1295, forecast 0.0779 vs persistence 0.6966
  ✓ flexisim: the soft sensor reaches a locked, frozen readout
  ✓ flexisim: and the LOCKED estimate beats the controller's own view of the tip
  ✓ flexisim: the forecast beats persistence on the readout's own estimate
  flexisim: closed loop active=closed offset 6.592 mrad — bias -7.365e-2 -> 1.283e-2, oscillation 1.602e-1 -> 1.645e-1
  ✓ flexisim: once LOCKED, mode ③ really engages
  ✓ flexisim: and the closed loop cuts the bias with no model at all
  ✓ flexisim: it leaves the oscillation alone too — it cannot chase what it sits on
  flexisim: compare filled open, ff, closed — bias open -7.13e-2 / ff 1.36e-4 / closed 1.28e-2
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
  flexisim/chain: tool sensor estimating after 1056 pairs — whole arm 0.0803, elbow only 0.0549 (0.68x), naive 1.0150
  flexisim/chain: drawn tool vs the model — 1.0003 of the magnification (want 1.0), axial -8.62e-2
  ✓ flexisim/chain: the picture draws the same tool error the model reports
  ✓ flexisim/chain: …and the sweep band spans the error it bounds
  ✓ flexisim/chain: both tool sensors reach a locked, frozen readout
  ✓ flexisim/chain: the whole-arm sensor beats the controller's own view of the tool
  ✓ flexisim/chain: and the elbow-only model at matched capacity also beats naive
  flexisim/chain: tool bias vs the program — open -1.034e-1 / model -1.175e-1 / closed -3.521e-3 (pre-distortion 5.44 mrad)
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
  flexisim/chain: auto-tune selected learned, mode period 862, board open 2.40e-1 / ff 2.35e-1 / learned 1.10e-1 / closed 2.29e-1
  ✓ flexisim/chain: auto-tune measures the bending mode from an unshaped kick
  ✓ flexisim/chain: …and turns the shaper on once it has one
  ✓ flexisim/chain: …fits the learned filter and reports its size
  ✓ flexisim/chain: …scores every mode, so the table is not empty
  ✓ flexisim/chain: …and the learned filter beats the quasi-static model it sits on
  ✓ flexisim/chain: …by reducing the OSCILLATION, which nothing else here can
  ✓ flexisim/chain: …and selects the mode its own table scored best
  flexisim/chain: sensors locked at step "lock them" after 6016 pairs, under learned
  ✓ flexisim/chain: the LOCK is the last step of the sequence, not one in the middle
  ✓ flexisim/chain: …so the sensors keep learning past the target and top up
  flexisim/chain: after auto-tune — running learned, sensors under learned, whole arm 0.0122 vs naive 1.0592
  ✓ flexisim/chain: …commissions the tool sensors in the configuration it chose
  ✓ flexisim/chain: …so the readout the user is left with is actually good
  flexisim/chain: control roughness — jerk off 1.25e-1, jerk 120 1.10e-3 (114x smoother)
  ✓ flexisim/chain: the jerk limit makes the shoulder correction smoother too
  ✓ flexisim/chain: …without shrinking it
  flexisim/chain: drive rated 32x hold, saturated 0.0% / 0.0%
  ✓ flexisim/chain: both joints have a rated drive that reports its demand
  ✓ flexisim/chain: …and it carries the shipped move without saturating
  ✓ flexisim/chain: the stage bounds the magnified shake with the swept band
  ✓ flexisim/chain: …and gives the manual controls back afterwards
  ✓ flexisim/chain: the stage is painted
  flexisim/path: rounded, 29.42 long, lap 7356 steps, 1080 cells; homed 2.09e-2 from the start of the program
  ✓ flexisim/path: the arm homes onto the start of the program
  ✓ flexisim/path: …and it is a closed loop the machine never stops on
  ✓ flexisim/path: an identified correction that does not exist is not applied
  ✓ flexisim/path: …and so is a pilot that has not vouched for itself
  ✓ flexisim/path: …and ⑤+④ needs that same vouched pilot before its table acts
  ✓ flexisim/path: …and so is a fully learned system that has not been commissioned
  ✓ flexisim/path: …and ⑦ inherits exactly the same refusal
  flexisim/path: after 2700 steps — contour 9.67e-2, lag 4.02e-1, unobservable 1.30e-1 vs following 3.98e-1
  ✓ flexisim/path: the contour/lag split is live and both are finite
  ✓ flexisim/path: a feedrate change mid-lap is queued rather than applied
  flexisim/path: feedrate 4.0e-3 → 1.0e-2, lap 7356 → 3268; arc 25.200 → 25.197 of 29.42
  ✓ flexisim/path: applying it changes the speed and keeps the place on the part
  ✓ flexisim/path: …and the error trail and chart are still being fed after it
  ✓ flexisim/path: the stage is painted
  flexisim/path: drawn tool vs the model — gap 0.00e+0 on a 14.21 reach
  ✓ flexisim/path: the drawn tool IS the tool every metric is computed from
  ✓ flexisim/path: ⑨ starts with nothing commissioned
  ✓ flexisim/path: …and its panel is shown exactly when ⑨ is the selected mode
  ✓ flexisim/path: …and selecting ⑨ before commissioning is REFUSED, not run
  flexisim/path: identified c -4.557e-1 / -1.439e+0 against −1/K = -6.250e-2
  ✓ flexisim/path: the identified compliance has the gearbox's sign and exceeds it
  ✓ flexisim/path: …and selecting it is then honoured
  flexisim/path: learning, lap by lap — 5.87e-1 → 5.48e-1 → 4.84e-1 → 3.88e-1 → 2.68e-1 → 2.04e-1 → 1.74e-1 → 1.52e-1
  ✓ flexisim/path: the learner drives the contour error down lap on lap
  ✓ flexisim/path: ⑤ commissioning runs to a result without halting
  flexisim/path: pilot deployed — verified 3.49x on the machine (program; scribble 4.12x / program 3.49x); Ts 2142, sample 9
  ✓ flexisim/path: the pilot commissions in the browser and the machine vouches for it
  ✓ flexisim/path: …and deploying lands in the selector, not just in a report
  flexisim/path: pilot lap — contour 2.171e-2, tau2 2.462e-4 against the open loop's 1.34e-1 / 5.93e-4
  ✓ flexisim/path: …and the deployed pilot cuts the contour on a program it never saw
  ✓ flexisim/path: ⑧ knows both halves are commissioned
  ✓ flexisim/path: …and its toggles are exposed and both on by default
  ✓ flexisim/path: probing the applied correction does not MOVE it — two reads agree
  ✓ flexisim/path: ⑧ turning the pilot off changes the applied correction
  ✓ flexisim/path: …and turning the compliance off changes it too, so both toggles act
  ✓ flexisim/path: ⑧’s compliance half IS ③, to the last bit
  ✓ flexisim/path: …and ⑧’s pilot half IS ⑤, so no clamp of ③’s eats the pilot
  ✓ flexisim/path: …and ⑧ with both on is their sum
  ✓ flexisim/path: ⑧ over-commissioning the pilot runs to a result without halting
  ✓ flexisim/path: ⑧ commissions the pilot OVER the identified compliance when asked
  ✓ flexisim/path: ⑧ one tap sets up the plant the 5.70x was measured on
  ✓ flexisim/path: …and the program too — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: …and it arms the OVER-commissioning the stack needs, still on ⑧
  ✓ flexisim/path: …and the rebuild cleared the previous machine’s learners
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^

page.waitForFunction: RangeError: Maximum call stack size exceeded
    at window.__flxPathDbg (http://127.0.0.1:8137/flexisim.html:7650:16)
    at eval (eval at predicate (eval at evaluate (:226:30)), <anonymous>:1:15)
    at predicate (eval at evaluate (:226:30), <anonymous>:13:24)
    at next (eval at evaluate (:226:30), <anonymous>:32:31)
    at eval (eval at evaluate (:226:30), <anonymous>:42:11)
    at UtilityScript.evaluate (<anonymous>:228:17)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
    at /home/user/Tisaic.github.io/test/smoke.mjs:3183:12

Node.js v22.22.2
```

### browser-final2 — exit 0 — 2026-08-29T23:07Z

```
Suite level: full   areas: flexisim   phase: browser
  (--all forces both; --only=ngrc,flowsim selects explicitly)

module parse
  ✓ no shipped module reaches for a Node global
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
  ✓ and every module the pages import is in it
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
  flexisim: soft sensor estimating after 1420 pairs — estimate 0.0675 vs naive 1.1295, forecast 0.0779 vs persistence 0.6966
  ✓ flexisim: the soft sensor reaches a locked, frozen readout
  ✓ flexisim: and the LOCKED estimate beats the controller's own view of the tip
  ✓ flexisim: the forecast beats persistence on the readout's own estimate
  flexisim: closed loop active=closed offset 6.592 mrad — bias -7.367e-2 -> 1.283e-2, oscillation 1.602e-1 -> 1.645e-1
  ✓ flexisim: once LOCKED, mode ③ really engages
  ✓ flexisim: and the closed loop cuts the bias with no model at all
  ✓ flexisim: it leaves the oscillation alone too — it cannot chase what it sits on
  flexisim: compare filled open, ff, closed — bias open -7.13e-2 / ff 1.36e-4 / closed 1.28e-2
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
  flexisim: after auto-tune — running learned, sensor commissioned under learned, estimate 0.0274 vs naive 1.9057, forecast 0.0349 vs persistence 0.6389
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
  flexisim: drive — rated 32x hold, saturated 0.0%, rms 4.318e-2; rated 2x, saturated 43.6%, rms 4.204e-1
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
  flexisim/chain: tool sensor estimating after 1056 pairs — whole arm 0.0578, elbow only 0.0333 (0.58x), naive 1.1003
  flexisim/chain: drawn tool vs the model — 0.9993 of the magnification (want 1.0), axial -2.84e-1
  ✓ flexisim/chain: the picture draws the same tool error the model reports
  ✓ flexisim/chain: …and the sweep band spans the error it bounds
  ✓ flexisim/chain: both tool sensors reach a locked, frozen readout
  ✓ flexisim/chain: the whole-arm sensor beats the controller's own view of the tool
  ✓ flexisim/chain: and the elbow-only model at matched capacity also beats naive
  flexisim/chain: tool bias vs the program — open -1.026e-1 / model -8.894e-2 / closed -3.657e-3 (pre-distortion 5.32 mrad)
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
  flexisim/chain: auto-tune selected learned, mode period 862, board open 2.40e-1 / ff 2.35e-1 / learned 1.10e-1 / closed 2.29e-1
  ✓ flexisim/chain: auto-tune measures the bending mode from an unshaped kick
  ✓ flexisim/chain: …and turns the shaper on once it has one
  ✓ flexisim/chain: …fits the learned filter and reports its size
  ✓ flexisim/chain: …scores every mode, so the table is not empty
  ✓ flexisim/chain: …and the learned filter beats the quasi-static model it sits on
  ✓ flexisim/chain: …by reducing the OSCILLATION, which nothing else here can
  ✓ flexisim/chain: …and selects the mode its own table scored best
  flexisim/chain: sensors locked at step "lock them" after 6016 pairs, under learned
  ✓ flexisim/chain: the LOCK is the last step of the sequence, not one in the middle
  ✓ flexisim/chain: …so the sensors keep learning past the target and top up
  flexisim/chain: after auto-tune — running learned, sensors under learned, whole arm 0.0117 vs naive 1.0514
  ✓ flexisim/chain: …commissions the tool sensors in the configuration it chose
  ✓ flexisim/chain: …so the readout the user is left with is actually good
  flexisim/chain: control roughness — jerk off 1.25e-1, jerk 120 1.10e-3 (114x smoother)
  ✓ flexisim/chain: the jerk limit makes the shoulder correction smoother too
  ✓ flexisim/chain: …without shrinking it
  flexisim/chain: drive rated 32x hold, saturated 0.0% / 0.0%
  ✓ flexisim/chain: both joints have a rated drive that reports its demand
  ✓ flexisim/chain: …and it carries the shipped move without saturating
  ✓ flexisim/chain: the stage bounds the magnified shake with the swept band
  ✓ flexisim/chain: …and gives the manual controls back afterwards
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
  flexisim/path: feedrate 4.0e-3 → 1.0e-2, lap 7356 → 3268; arc 26.400 → 26.397 of 29.42
  ✓ flexisim/path: applying it changes the speed and keeps the place on the part
  ✓ flexisim/path: …and the error trail and chart are still being fed after it
  ✓ flexisim/path: the stage is painted
  flexisim/path: drawn tool vs the model — gap 0.00e+0 on a 12.67 reach
  ✓ flexisim/path: the drawn tool IS the tool every metric is computed from
  ✓ flexisim/path: ⑨ starts with nothing commissioned
  ✓ flexisim/path: …and its panel is shown exactly when ⑨ is the selected mode
  ✓ flexisim/path: …and selecting ⑨ before commissioning is REFUSED, not run
  flexisim/path: identified c -4.559e-1 / -1.443e+0 against −1/K = -6.250e-2
  ✓ flexisim/path: the identified compliance has the gearbox's sign and exceeds it
  ✓ flexisim/path: …and selecting it is then honoured
  flexisim/path: learning, lap by lap — 5.87e-1 → 5.48e-1 → 4.84e-1 → 3.88e-1 → 2.68e-1 → 2.04e-1 → 1.74e-1 → 1.52e-1
  ✓ flexisim/path: the learner drives the contour error down lap on lap
  ✓ flexisim/path: ⑤ commissioning runs to a result without halting
  flexisim/path: pilot deployed — verified 3.44x on the machine (program; scribble 3.87x / program 3.44x); Ts 2142, sample 9
  ✓ flexisim/path: the pilot commissions in the browser and the machine vouches for it
  ✓ flexisim/path: …and deploying lands in the selector, not just in a report
  flexisim/path: pilot lap — contour 2.190e-2, tau2 2.420e-4 against the open loop's 1.34e-1 / 5.93e-4
  ✓ flexisim/path: …and the deployed pilot cuts the contour on a program it never saw
  ✓ flexisim/path: ⑧ knows both halves are commissioned
  ✓ flexisim/path: …and its toggles are exposed and both on by default
  ✓ flexisim/path: probing the applied correction does not MOVE it — two reads agree
  ✓ flexisim/path: ⑧ turning the pilot off changes the applied correction
  ✓ flexisim/path: …and turning the compliance off changes it too, so both toggles act
  ✓ flexisim/path: ⑧’s compliance half IS ③, to the last bit
  ✓ flexisim/path: …and ⑧’s pilot half IS ⑤, so no clamp of ③’s eats the pilot
  ✓ flexisim/path: …and ⑧ with both on is their sum
  ✓ flexisim/path: ⑧ over-commissioning the pilot runs to a result without halting
  ✓ flexisim/path: ⑧ commissions the pilot OVER the identified compliance when asked
  ✓ flexisim/path: ⑧ one tap sets up the plant the 5.70x was measured on
  ✓ flexisim/path: …and the program too — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: …and it arms the OVER-commissioning the stack needs, still on ⑧
  ✓ flexisim/path: …and the rebuild cleared the previous machine’s learners
  ✓ flexisim/path: (the machine is first driven OFF the measured configuration, so the checks below have teeth)
  ✓ flexisim/path: ⑨ sets up its own machine — K 1 / E 0.06, no other button pressed
  ✓ flexisim/path: …and its own program — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: ⑨ commissioning does not fail out of the gate
  ✓ flexisim/path: ⑨ the button builds the host and the machine turns
  ✓ flexisim/path: …and the report panel opens while it runs, so the run is visible
  ✓ flexisim/path: …and the button becomes a live Stop rather than going dead
  ✓ flexisim/path: …and stopping clears the host, so no partial ladder can deploy
  ✓ flexisim/path: …and ⑨ is refused again after the stop, as it was before it
  flexisim/blackbox: measured settling 2300 steps, DC gain 15.45 against an arm length of 15.5 it was never told; predicted 1.95x, MEASURED 5.43x, achieved 4.86x, as a constrained costing 5870 MAC/update = 84 MAC/cycle over the 70 cycles between updates (3.4% of 5% of a 1 ms cycle), basis top-128
  ✓ flexisim/blackbox: it measures the plant's own timescale from a step
  ✓ flexisim/blackbox: …and recovers the ARM LENGTH it was never given
  ✓ flexisim/blackbox: …and an impulse response agreeing with it in sign and size
  ✓ flexisim/blackbox: …and validates the PLANT model on held-out probe samples
  ✓ flexisim/blackbox: …then designs a feedforward that looks AHEAD of the command
  ✓ flexisim/blackbox: …and what it MEASURED on the machine is what it achieves
  ✓ flexisim/blackbox: …in an arithmetic budget a 1 ms PLC task can afford
  ✓ flexisim/blackbox: …without making the machine worse
  flexisim/blackbox: command second difference 95x the bare reference's, torque 1.6x the uncorrected machine's
  ✓ flexisim/blackbox: …and the command it hands the drive is one the drive can follow
  ✓ flexisim/blackbox: …and the trial ladder scored smoothness alongside tracking
  ✓ flexisim/blackbox: …and the tool is drawn ON the stage, not off it
  ✓ flexisim/blackbox: …and the estimate is drawn ON the tool, as its score says
  ✓ flexisim/blackbox: the correction is limited to 80% of what the drive has SPARE
  ✓ flexisim/blackbox: …and a supplied limit of zero is a LIMIT, not an absence
  flexisim/blackbox: jerk 120 → 1800 steps, move period 7062 → 10422, correction limit 3.831e-1 → 5.281e-1
  ✓ flexisim/blackbox: the jerk limit really changes the command it is given
  ✓ flexisim/blackbox: …and throws the commissioning away, because the map was of the old one
  flexisim/blackbox: with joint friction — R2 0.0025, dc -0.0615, gain -0.0184, REFUSED: the step test and the probe disagree about the plant's gain (-0.0615 against -0.0184)
  ✓ flexisim/blackbox: friction makes the plant unidentifiable, and it says so instead of designing against it
  ✓ flexisim/blackbox: …and applies no correction while refusing
  ✓ flexisim/blackbox: …and the panel says so instead of throwing on the missing fields
  flexisim/blackbox: settle 1 → 8 ring, move period 10422 → 24576
  ✓ flexisim/blackbox: the settle really lengthens the dwell between moves
  ✓ flexisim/blackbox: the stage is painted
  flexisim: chart containers — ss-chart 170px, err-chart 170px, cs-chart 170px, chain-pos 170px, chain-chart 170px, bb-chart 170px, path-chart 170px
  ✓ flexisim: every Plotly container gets its height from CSS, so none can strobe
  flexisim: chart widths — err-chart 388/388/svg 388, ss-chart 388/388/svg 388, chain-pos 388/388/svg 388, chain-chart 388/388/svg 388, cs-chart 388/388/svg 388, path-chart 388/388/svg 388, bb-chart 388/388/svg 388
  ✓ flexisim: …and its width, so no chart is drawn wider than the box it sits in
  ✓ flexisim: …and the page does not scroll sideways on a phone
  ✓ flexisim: every in-browser closed-form check passes
  ✓ flexisim: the page reports no errors of its own

Section timings (s):
      4  index page
    137  flexisim move
    235  flexisim chain
    179  flexisim path
    151  flexisim black box
      1  flexisim verify

PASS — 0 check(s) failed. Screenshots in test/screenshots/

```

### browser-prog — exit 0 — 2026-08-29T23:39Z

```
Suite level: full   areas: flexisim   phase: browser
  (--all forces both; --only=ngrc,flowsim selects explicitly)

module parse
  ✓ no shipped module reaches for a Node global
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
  ✓ and every module the pages import is in it
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
  flexisim: bias -7.367e-2 -> -6.958e-4, oscillation 1.602e-1 -> 1.361e-1
  ✓ flexisim: mode ② (open loop + prediction) actually collapses the bias
  ✓ flexisim: and it leaves the oscillation alone, which is the other mechanism
  ✓ flexisim: the feedforward is evaluated AHEAD of the move, not on it
  flexisim: rms limited by — the link ringing. A quasi-static model (② and ③) cannot canc…
  ✓ flexisim: the stats name which mechanism limits the rms, not just its value
  ✓ flexisim: mode ③ is REFUSED until the soft sensor is locked, and says which mode is live
  ✓ flexisim: the error chart tracks the run rather than freezing on its first points
  flexisim: chart means — commanded motor 5.67e-2, actual motor 7.63e-2, true arm 3.55e-3
  ✓ flexisim: the chart carries all five positions
  ✓ flexisim: with the correction on, the MOTOR is off target and the TOOL is on it
  flexisim: drawn/true tool error over 90 frames — 1.0000 to 1.0000 of the magnification (want 1.0)
  ✓ flexisim: the picture magnifies the WHOLE tool error, wind-up and bending alike
  ✓ flexisim: training dithers the correction, so the model sees the loop it will be inside
  flexisim: soft sensor estimating after 1440 pairs — estimate 0.0638 vs naive 1.1129, forecast 0.0757 vs persistence 0.8018
  ✓ flexisim: the soft sensor reaches a locked, frozen readout
  ✓ flexisim: and the LOCKED estimate beats the controller's own view of the tip
  ✓ flexisim: the forecast beats persistence on the readout's own estimate
  flexisim: closed loop active=closed offset 6.336 mrad — bias -7.367e-2 -> 6.584e-3, oscillation 1.602e-1 -> 1.647e-1
  ✓ flexisim: once LOCKED, mode ③ really engages
  ✓ flexisim: and the closed loop cuts the bias with no model at all
  ✓ flexisim: it leaves the oscillation alone too — it cannot chase what it sits on
  flexisim: compare filled open, ff, closed — bias open -6.93e-2 / ff 1.36e-4 / closed 6.58e-3
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
  flexisim: after auto-tune — running learned, sensor commissioned under learned, estimate 0.0274 vs naive 1.9057, forecast 0.0349 vs persistence 0.6389
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
  flexisim: drive — rated 32x hold, saturated 0.0%, rms 4.318e-2; rated 2x, saturated 44.3%, rms 4.204e-1
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
  flexisim/chain: tool sensor estimating after 1056 pairs — whole arm 0.0578, elbow only 0.0333 (0.58x), naive 1.1003
  flexisim/chain: drawn tool vs the model — 0.9993 of the magnification (want 1.0), axial -2.84e-1
  ✓ flexisim/chain: the picture draws the same tool error the model reports
  ✓ flexisim/chain: …and the sweep band spans the error it bounds
  ✓ flexisim/chain: both tool sensors reach a locked, frozen readout
  ✓ flexisim/chain: the whole-arm sensor beats the controller's own view of the tool
  ✓ flexisim/chain: and the elbow-only model at matched capacity also beats naive
  flexisim/chain: tool bias vs the program — open -1.026e-1 / model -9.129e-2 / closed -3.238e-3 (pre-distortion 5.08 mrad)
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
  flexisim/chain: auto-tune selected learned, mode period 862, board open 2.40e-1 / ff 2.35e-1 / learned 1.10e-1 / closed 2.29e-1
  ✓ flexisim/chain: auto-tune measures the bending mode from an unshaped kick
  ✓ flexisim/chain: …and turns the shaper on once it has one
  ✓ flexisim/chain: …fits the learned filter and reports its size
  ✓ flexisim/chain: …scores every mode, so the table is not empty
  ✓ flexisim/chain: …and the learned filter beats the quasi-static model it sits on
  ✓ flexisim/chain: …by reducing the OSCILLATION, which nothing else here can
  ✓ flexisim/chain: …and selects the mode its own table scored best
  flexisim/chain: sensors locked at step "lock them" after 6016 pairs, under learned
  ✓ flexisim/chain: the LOCK is the last step of the sequence, not one in the middle
  ✓ flexisim/chain: …so the sensors keep learning past the target and top up
  flexisim/chain: after auto-tune — running learned, sensors under learned, whole arm 0.0122 vs naive 1.0592
  ✓ flexisim/chain: …commissions the tool sensors in the configuration it chose
  ✓ flexisim/chain: …so the readout the user is left with is actually good
  flexisim/chain: control roughness — jerk off 1.25e-1, jerk 120 1.10e-3 (114x smoother)
  ✓ flexisim/chain: the jerk limit makes the shoulder correction smoother too
  ✓ flexisim/chain: …without shrinking it
  flexisim/chain: drive rated 32x hold, saturated 0.0% / 0.0%
  ✓ flexisim/chain: both joints have a rated drive that reports its demand
  ✓ flexisim/chain: …and it carries the shipped move without saturating
  ✓ flexisim/chain: the stage bounds the magnified shake with the swept band
  ✓ flexisim/chain: …and gives the manual controls back afterwards
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
  flexisim/path: feedrate 4.0e-3 → 1.0e-2, lap 7356 → 3268; arc 24.000 → 23.997 of 29.42
  ✓ flexisim/path: applying it changes the speed and keeps the place on the part
  ✓ flexisim/path: …and the error trail and chart are still being fed after it
  ✓ flexisim/path: the stage is painted
  flexisim/path: drawn tool vs the model — gap 0.00e+0 on a 8.61 reach
  ✓ flexisim/path: the drawn tool IS the tool every metric is computed from
  ✓ flexisim/path: ⑨ starts with nothing commissioned
  ✓ flexisim/path: …and its panel is shown exactly when ⑨ is the selected mode
  ✓ flexisim/path: …and selecting ⑨ before commissioning is REFUSED, not run
  flexisim/path: identified c -4.595e-1 / -1.429e+0 against −1/K = -6.250e-2
  ✓ flexisim/path: the identified compliance has the gearbox's sign and exceeds it
  ✓ flexisim/path: …and selecting it is then honoured
  flexisim/path: learning, lap by lap — 5.87e-1 → 5.48e-1 → 4.84e-1 → 3.88e-1 → 2.68e-1 → 2.04e-1 → 1.74e-1 → 1.52e-1
  ✓ flexisim/path: the learner drives the contour error down lap on lap
  ✓ flexisim/path: ⑤ commissioning runs to a result without halting
  flexisim/path: pilot deployed — verified 3.44x on the machine (program; scribble 3.87x / program 3.44x); Ts 2142, sample 9
  ✓ flexisim/path: the pilot commissions in the browser and the machine vouches for it
  ✓ flexisim/path: …and deploying lands in the selector, not just in a report
  flexisim/path: pilot lap — contour 2.190e-2, tau2 2.420e-4 against the open loop's 1.34e-1 / 5.93e-4
  ✓ flexisim/path: …and the deployed pilot cuts the contour on a program it never saw
  ✓ flexisim/path: ⑧ knows both halves are commissioned
  ✓ flexisim/path: …and its toggles are exposed and both on by default
  ✓ flexisim/path: probing the applied correction does not MOVE it — two reads agree
  ✓ flexisim/path: ⑧ turning the pilot off changes the applied correction
  ✓ flexisim/path: …and turning the compliance off changes it too, so both toggles act
  ✓ flexisim/path: ⑧’s compliance half IS ③, to the last bit
  ✓ flexisim/path: …and ⑧’s pilot half IS ⑤, so no clamp of ③’s eats the pilot
  ✓ flexisim/path: …and ⑧ with both on is their sum
  ✓ flexisim/path: ⑧ over-commissioning the pilot runs to a result without halting
  ✓ flexisim/path: ⑧ commissions the pilot OVER the identified compliance when asked
  ✓ flexisim/path: ⑧ one tap sets up the plant the 5.70x was measured on
  ✓ flexisim/path: …and the program too — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: …and it arms the OVER-commissioning the stack needs, still on ⑧
  ✓ flexisim/path: …and the rebuild cleared the previous machine’s learners
  ✓ flexisim/path: (the machine is first driven OFF the measured configuration, so the checks below have teeth)
  ✓ flexisim/path: ⑨ sets up its own machine — K 1 / E 0.06, no other button pressed
  ✓ flexisim/path: …and its own program — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: ⑨ commissioning does not fail out of the gate
  ✓ flexisim/path: ⑨ the button builds the host and the machine turns
  ✓ flexisim/path: …and the report panel opens while it runs, so the run is visible
  ✓ flexisim/path: ⑨ reports where it is, and the report ADVANCES while it runs
  ✓ flexisim/path: …and the button becomes a live Stop rather than going dead
  ✓ flexisim/path: …and stopping clears the host, so no partial ladder can deploy
  ✓ flexisim/path: …and ⑨ is refused again after the stop, as it was before it
  flexisim/blackbox: measured settling 2280 steps, DC gain 15.46 against an arm length of 15.5 it was never told; predicted 1.92x, MEASURED 5.34x, achieved 4.90x, as a constrained costing 5870 MAC/update = 84 MAC/cycle over the 70 cycles between updates (3.4% of 5% of a 1 ms cycle), basis top-128
  ✓ flexisim/blackbox: it measures the plant's own timescale from a step
  ✓ flexisim/blackbox: …and recovers the ARM LENGTH it was never given
  ✓ flexisim/blackbox: …and an impulse response agreeing with it in sign and size
  ✓ flexisim/blackbox: …and validates the PLANT model on held-out probe samples
  ✓ flexisim/blackbox: …then designs a feedforward that looks AHEAD of the command
  ✓ flexisim/blackbox: …and what it MEASURED on the machine is what it achieves
  ✓ flexisim/blackbox: …in an arithmetic budget a 1 ms PLC task can afford
  ✓ flexisim/blackbox: …without making the machine worse
  flexisim/blackbox: command second difference 141x the bare reference's, torque 1.7x the uncorrected machine's
  ✓ flexisim/blackbox: …and the command it hands the drive is one the drive can follow
  ✓ flexisim/blackbox: …and the trial ladder scored smoothness alongside tracking
  ✓ flexisim/blackbox: …and the tool is drawn ON the stage, not off it
  ✓ flexisim/blackbox: …and the estimate is drawn ON the tool, as its score says
  ✓ flexisim/blackbox: the correction is limited to 80% of what the drive has SPARE
  ✓ flexisim/blackbox: …and a supplied limit of zero is a LIMIT, not an absence
  flexisim/blackbox: jerk 120 → 1800 steps, move period 7062 → 10422, correction limit 3.831e-1 → 5.281e-1
  ✓ flexisim/blackbox: the jerk limit really changes the command it is given
  ✓ flexisim/blackbox: …and throws the commissioning away, because the map was of the old one
  flexisim/blackbox: with joint friction — R2 0.0025, dc -0.00874, gain -0.0187, REFUSED: the plant model explains 0% of held-out probe data, which is not a plant model
  ✓ flexisim/blackbox: friction makes the plant unidentifiable, and it says so instead of designing against it
  ✓ flexisim/blackbox: …and applies no correction while refusing
  ✓ flexisim/blackbox: …and the panel says so instead of throwing on the missing fields
  flexisim/blackbox: settle 1 → 8 ring, move period 10422 → 24576
  ✓ flexisim/blackbox: the settle really lengthens the dwell between moves
  ✓ flexisim/blackbox: the stage is painted
  flexisim: chart containers — ss-chart 170px, err-chart 170px, cs-chart 170px, chain-pos 170px, chain-chart 170px, bb-chart 170px, path-chart 170px
  ✓ flexisim: every Plotly container gets its height from CSS, so none can strobe
  flexisim: chart widths — err-chart 388/388/svg 388, ss-chart 388/388/svg 388, chain-pos 388/388/svg 388, chain-chart 388/388/svg 388, cs-chart 388/388/svg 388, path-chart 388/388/svg 388, bb-chart 388/388/svg 388
  ✓ flexisim: …and its width, so no chart is drawn wider than the box it sits in
  ✓ flexisim: …and the page does not scroll sideways on a phone
  ✓ flexisim: every in-browser closed-form check passes
  ✓ flexisim: the page reports no errors of its own

Section timings (s):
      4  index page
    142  flexisim move
    263  flexisim chain
    186  flexisim path
    181  flexisim black box
      1  flexisim verify

PASS — 0 check(s) failed. Screenshots in test/screenshots/

```

### arm-fast — exit 1 — 2026-08-30T00:05Z

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
  [35m] lap-periodic (harmonic)  2.2413e-2  2.39x   76 laps, probe basis at 25% — a MEMORY: it will not transfer to another program

  as it arrived                                  4.1216e-1       
  conventional (self-tuned)                      3.3200e-1    1.24x   23 laps, 7 coefficients
  pilot cascade, depth 1                         9.9789e-2    3.33x
  pilot cascade, depth 2                         1.4156e-1    0.70x
  pilot cascade, depth 1 (rungs below withheld)  6.3021e-2    1.58x
  pilot cascade, depth 2 (rungs below withheld)  5.3554e-2    1.18x
  — the conventional rung WITHHELD               5.3554e-2    1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  lap-periodic (harmonic)                        2.2413e-2    2.39x   76 laps, probe basis at 25% — a MEMORY: it will not transfer to another program

  shipped {"classic":false,"stack":2,"hff":true}   4.1216e-1 → 2.2413e-2   18.39x   2092s
  composite.test.mjs's hand-built cascade(2) + HFF   1.3400e-2   30.76x

  what a lap-harmonic table could reach ON THE CASCADE-DEPLOYED machine (score 5.355e-2):
    nh  4 51.0% → 3.75e-2   nh  8 71.6% → 2.85e-2   nh 16 99.6% → 3.44e-3   nh 32 100.0% → 5.50e-4   nh 64 100.0% → 9.77e-5
    (against 4.23e-3 at nh 16 on the BARE machine — the denominator every headroom figure has used so far)

  the lap-periodic rung, pass by pass:
    3.68e-2 → 3.09e-2 → 2.72e-2 → 2.66e-2 → 2.31e-2 → 1.35e-1 → 2.37e-2 → 2.74e-2 → 2.49e-2 → 2.38e-2 → 2.25e-2 → 2.20e-2 → 2.38e-2
    harmonics damped per pass: 0 0 0 0 0 256 256 256 256 256 0 0 256   (of nh in the band)
    the machine repeats to 6.20e-4 (2.8% of the score), and 2 of 13 passes land within one of those of the best — so the deployed table is one draw from a clear winner
    step ended at 1.56e-2  — the step was halved 6x, so passes were being rejected
  the floor rose UNDER a decision already made — these rungs were deployed on a margin that no longer clears at the final resolution:
    pilot cascade, depth 2  1.416e-1 against 9.979e-2  judged at floor 8.40e-5, final 1.70e-4
  the instrument's floor ROSE during commissioning, 1.31e-10 → 1.70e-4, on 'median of 9 runs' — the deployed machine is noisier than the bare one, and the comparisons above were made at the coarser resolution
  ✗ THE CONTRACT: the self-tuning ladder beats the same composite re-measured on THIS program at 6 passes (brick 66, 20.34x) on the same machine and program — if this goes red the ladder has regressed against a number it has held  → 2.2413e-2 against 2.0260e-2
  the stretch — composite.test.mjs's hand-built cascade(2) + HFF at its best case — is 1.3400e-2; this run is 2.2413e-2, 1.67x of it — not yet met
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored

autostack-arm: 1 check(s) FAILED

```

### arm-reuse — exit 0 — 2026-08-30T00:15Z

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
  [4m] conventional (self-tuned)  3.3200e-1  1.24x   23 laps, 7 coefficients
  [5m] pilot cascade, depth 1  9.9789e-2  3.33x
  [8m] pilot cascade, depth 2  1.4156e-1  0.70x
  [9m] pilot cascade, depth 1 (rungs below withheld)  6.3021e-2  1.58x
  [11m] pilot cascade, depth 2 (rungs below withheld)  5.3554e-2  1.18x
  [11m] — the conventional rung WITHHELD  5.3554e-2  1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  [24m] lap-periodic (harmonic)  1.8387e-2  2.91x   68 laps, probe rand at 10% — a MEMORY: it will not transfer to another program

  as it arrived                                  4.1216e-1       
  conventional (self-tuned)                      3.3200e-1    1.24x   23 laps, 7 coefficients
  pilot cascade, depth 1                         9.9789e-2    3.33x
  pilot cascade, depth 2                         1.4156e-1    0.70x
  pilot cascade, depth 1 (rungs below withheld)  6.3021e-2    1.58x
  pilot cascade, depth 2 (rungs below withheld)  5.3554e-2    1.18x
  — the conventional rung WITHHELD               5.3554e-2    1.00x   the cascade above it commissions better without it: a cheap rung that costs an expensive one, which no amount of re-scoring after the fact can recover
  lap-periodic (harmonic)                        1.8387e-2    2.91x   68 laps, probe rand at 10% — a MEMORY: it will not transfer to another program

  shipped {"classic":false,"stack":2,"hff":true}   4.1216e-1 → 1.8387e-2   22.42x   1435s
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
  ✓ THE CONTRACT: the self-tuning ladder beats the same composite re-measured on THIS program at 6 passes (brick 66, 20.34x) on the same machine and program — if this goes red the ladder has regressed against a number it has held
  the stretch — composite.test.mjs's hand-built cascade(2) + HFF at its best case — is 1.3400e-2; this run is 1.8387e-2, 1.37x of it — not yet met
  ✓ …and it is not the common cap doing the work by accident: the cap was not binding when the shipped configuration was scored

autostack-arm: all checks passed

```

### browser-reuse — exit 0 — 2026-08-30T00:28Z

```
Suite level: full   areas: flexisim   phase: browser
  (--all forces both; --only=ngrc,flowsim selects explicitly)

module parse
  ✓ no shipped module reaches for a Node global
  ✓ no class defines the same method twice
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
  ✓ and every module the pages import is in it
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
  flexisim: bias -7.367e-2 -> -6.958e-4, oscillation 1.602e-1 -> 1.361e-1
  ✓ flexisim: mode ② (open loop + prediction) actually collapses the bias
  ✓ flexisim: and it leaves the oscillation alone, which is the other mechanism
  ✓ flexisim: the feedforward is evaluated AHEAD of the move, not on it
  flexisim: rms limited by — the link ringing. A quasi-static model (② and ③) cannot canc…
  ✓ flexisim: the stats name which mechanism limits the rms, not just its value
  ✓ flexisim: mode ③ is REFUSED until the soft sensor is locked, and says which mode is live
  ✓ flexisim: the error chart tracks the run rather than freezing on its first points
  flexisim: chart means — commanded motor 5.67e-2, actual motor 7.63e-2, true arm 3.55e-3
  ✓ flexisim: the chart carries all five positions
  ✓ flexisim: with the correction on, the MOTOR is off target and the TOOL is on it
  flexisim: drawn/true tool error over 90 frames — 1.0000 to 1.0000 of the magnification (want 1.0)
  ✓ flexisim: the picture magnifies the WHOLE tool error, wind-up and bending alike
  ✓ flexisim: training dithers the correction, so the model sees the loop it will be inside
  flexisim: soft sensor estimating after 1440 pairs — estimate 0.0638 vs naive 1.1129, forecast 0.0757 vs persistence 0.8018
  ✓ flexisim: the soft sensor reaches a locked, frozen readout
  ✓ flexisim: and the LOCKED estimate beats the controller's own view of the tip
  ✓ flexisim: the forecast beats persistence on the readout's own estimate
  flexisim: closed loop active=closed offset 6.336 mrad — bias -7.367e-2 -> 6.584e-3, oscillation 1.602e-1 -> 1.647e-1
  ✓ flexisim: once LOCKED, mode ③ really engages
  ✓ flexisim: and the closed loop cuts the bias with no model at all
  ✓ flexisim: it leaves the oscillation alone too — it cannot chase what it sits on
  flexisim: compare filled open, ff, closed — bias open -6.93e-2 / ff 1.36e-4 / closed 6.58e-3
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
  flexisim: after auto-tune — running learned, sensor commissioned under learned, estimate 0.0309 vs naive 1.9265, forecast 0.0411 vs persistence 0.6261
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
  flexisim: drive — rated 32x hold, saturated 0.0%, rms 4.318e-2; rated 2x, saturated 43.8%, rms 4.204e-1
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
  flexisim/chain: tool sensor estimating after 1056 pairs — whole arm 0.0803, elbow only 0.0549 (0.68x), naive 1.0150
  flexisim/chain: drawn tool vs the model — 1.0003 of the magnification (want 1.0), axial -8.62e-2
  ✓ flexisim/chain: the picture draws the same tool error the model reports
  ✓ flexisim/chain: …and the sweep band spans the error it bounds
  ✓ flexisim/chain: both tool sensors reach a locked, frozen readout
  ✓ flexisim/chain: the whole-arm sensor beats the controller's own view of the tool
  ✓ flexisim/chain: and the elbow-only model at matched capacity also beats naive
  flexisim/chain: tool bias vs the program — open -1.034e-1 / model -1.175e-1 / closed -3.521e-3 (pre-distortion 5.44 mrad)
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
  flexisim/chain: auto-tune selected learned, mode period 862, board open 2.40e-1 / ff 2.35e-1 / learned 1.10e-1 / closed 2.29e-1
  ✓ flexisim/chain: auto-tune measures the bending mode from an unshaped kick
  ✓ flexisim/chain: …and turns the shaper on once it has one
  ✓ flexisim/chain: …fits the learned filter and reports its size
  ✓ flexisim/chain: …scores every mode, so the table is not empty
  ✓ flexisim/chain: …and the learned filter beats the quasi-static model it sits on
  ✓ flexisim/chain: …by reducing the OSCILLATION, which nothing else here can
  ✓ flexisim/chain: …and selects the mode its own table scored best
  flexisim/chain: sensors locked at step "lock them" after 6016 pairs, under learned
  ✓ flexisim/chain: the LOCK is the last step of the sequence, not one in the middle
  ✓ flexisim/chain: …so the sensors keep learning past the target and top up
  flexisim/chain: after auto-tune — running learned, sensors under learned, whole arm 0.0122 vs naive 1.0592
  ✓ flexisim/chain: …commissions the tool sensors in the configuration it chose
  ✓ flexisim/chain: …so the readout the user is left with is actually good
  flexisim/chain: control roughness — jerk off 1.25e-1, jerk 120 1.10e-3 (114x smoother)
  ✓ flexisim/chain: the jerk limit makes the shoulder correction smoother too
  ✓ flexisim/chain: …without shrinking it
  flexisim/chain: drive rated 32x hold, saturated 0.0% / 0.0%
  ✓ flexisim/chain: both joints have a rated drive that reports its demand
  ✓ flexisim/chain: …and it carries the shipped move without saturating
  ✓ flexisim/chain: the stage bounds the magnified shake with the swept band
  ✓ flexisim/chain: …and gives the manual controls back afterwards
  ✓ flexisim/chain: the stage is painted
  flexisim/path: rounded, 29.42 long, lap 7356 steps, 1080 cells; homed 2.09e-2 from the start of the program
  ✓ flexisim/path: the arm homes onto the start of the program
  ✓ flexisim/path: …and it is a closed loop the machine never stops on
  ✓ flexisim/path: an identified correction that does not exist is not applied
  ✓ flexisim/path: …and so is a pilot that has not vouched for itself
  ✓ flexisim/path: …and ⑤+④ needs that same vouched pilot before its table acts
  ✓ flexisim/path: …and so is a fully learned system that has not been commissioned
  ✓ flexisim/path: …and ⑦ inherits exactly the same refusal
  flexisim/path: after 2700 steps — contour 9.67e-2, lag 4.02e-1, unobservable 1.30e-1 vs following 3.98e-1
  ✓ flexisim/path: the contour/lag split is live and both are finite
  ✓ flexisim/path: a feedrate change mid-lap is queued rather than applied
  flexisim/path: feedrate 4.0e-3 → 1.0e-2, lap 7356 → 3268; arc 25.200 → 25.197 of 29.42
  ✓ flexisim/path: applying it changes the speed and keeps the place on the part
  ✓ flexisim/path: …and the error trail and chart are still being fed after it
  ✓ flexisim/path: the stage is painted
  flexisim/path: drawn tool vs the model — gap 0.00e+0 on a 14.21 reach
  ✓ flexisim/path: the drawn tool IS the tool every metric is computed from
  ✓ flexisim/path: ⑨ starts with nothing commissioned
  ✓ flexisim/path: …and its panel is shown exactly when ⑨ is the selected mode
  ✓ flexisim/path: …and selecting ⑨ before commissioning is REFUSED, not run
  flexisim/path: identified c -4.557e-1 / -1.439e+0 against −1/K = -6.250e-2
  ✓ flexisim/path: the identified compliance has the gearbox's sign and exceeds it
  ✓ flexisim/path: …and selecting it is then honoured
  flexisim/path: learning, lap by lap — 5.87e-1 → 5.48e-1 → 4.84e-1 → 3.88e-1 → 2.68e-1 → 2.04e-1 → 1.74e-1 → 1.52e-1
  ✓ flexisim/path: the learner drives the contour error down lap on lap
  ✓ flexisim/path: ⑤ commissioning runs to a result without halting
  flexisim/path: pilot deployed — verified 3.44x on the machine (program; scribble 3.87x / program 3.44x); Ts 2142, sample 9
  ✓ flexisim/path: the pilot commissions in the browser and the machine vouches for it
  ✓ flexisim/path: …and deploying lands in the selector, not just in a report
  flexisim/path: pilot lap — contour 2.190e-2, tau2 2.420e-4 against the open loop's 1.34e-1 / 5.93e-4
  ✓ flexisim/path: …and the deployed pilot cuts the contour on a program it never saw
  ✓ flexisim/path: ⑧ knows both halves are commissioned
  ✓ flexisim/path: …and its toggles are exposed and both on by default
  ✓ flexisim/path: probing the applied correction does not MOVE it — two reads agree
  ✓ flexisim/path: ⑧ turning the pilot off changes the applied correction
  ✓ flexisim/path: …and turning the compliance off changes it too, so both toggles act
  ✓ flexisim/path: ⑧’s compliance half IS ③, to the last bit
  ✓ flexisim/path: …and ⑧’s pilot half IS ⑤, so no clamp of ③’s eats the pilot
  ✓ flexisim/path: …and ⑧ with both on is their sum
  ✓ flexisim/path: ⑧ over-commissioning the pilot runs to a result without halting
  ✓ flexisim/path: ⑧ commissions the pilot OVER the identified compliance when asked
  ✓ flexisim/path: ⑧ one tap sets up the plant the 5.70x was measured on
  ✓ flexisim/path: …and the program too — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: …and it arms the OVER-commissioning the stack needs, still on ⑧
  ✓ flexisim/path: …and the rebuild cleared the previous machine’s learners
  ✓ flexisim/path: (the machine is first driven OFF the measured configuration, so the checks below have teeth)
  ✓ flexisim/path: ⑨ sets up its own machine — K 1 / E 0.06, no other button pressed
  ✓ flexisim/path: …and its own program — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: ⑨ commissioning does not fail out of the gate
  ✓ flexisim/path: ⑨ the button builds the host and the machine turns
  ✓ flexisim/path: …and the report panel opens while it runs, so the run is visible
  ✓ flexisim/path: ⑨ reports where it is, and the report ADVANCES while it runs
  ✓ flexisim/path: …and the button becomes a live Stop rather than going dead
  ✓ flexisim/path: …and stopping clears the host, so no partial ladder can deploy
  ✓ flexisim/path: …and ⑨ is refused again after the stop, as it was before it
  flexisim/blackbox: measured settling 2290 steps, DC gain 15.53 against an arm length of 15.5 it was never told; predicted 2.05x, MEASURED 5.41x, achieved 5.36x, as a constrained costing 5870 MAC/update = 84 MAC/cycle over the 70 cycles between updates (3.4% of 5% of a 1 ms cycle), basis top-128
  ✓ flexisim/blackbox: it measures the plant's own timescale from a step
  ✓ flexisim/blackbox: …and recovers the ARM LENGTH it was never given
  ✓ flexisim/blackbox: …and an impulse response agreeing with it in sign and size
  ✓ flexisim/blackbox: …and validates the PLANT model on held-out probe samples
  ✓ flexisim/blackbox: …then designs a feedforward that looks AHEAD of the command
  ✓ flexisim/blackbox: …and what it MEASURED on the machine is what it achieves
  ✓ flexisim/blackbox: …in an arithmetic budget a 1 ms PLC task can afford
  ✓ flexisim/blackbox: …without making the machine worse
  flexisim/blackbox: command second difference 109x the bare reference's, torque 1.6x the uncorrected machine's
  ✓ flexisim/blackbox: …and the command it hands the drive is one the drive can follow
  ✓ flexisim/blackbox: …and the trial ladder scored smoothness alongside tracking
  ✓ flexisim/blackbox: …and the tool is drawn ON the stage, not off it
  ✓ flexisim/blackbox: …and the estimate is drawn ON the tool, as its score says
  ✓ flexisim/blackbox: the correction is limited to 80% of what the drive has SPARE
  ✓ flexisim/blackbox: …and a supplied limit of zero is a LIMIT, not an absence
  flexisim/blackbox: jerk 120 → 1800 steps, move period 7062 → 10422, correction limit 3.831e-1 → 5.281e-1
  ✓ flexisim/blackbox: the jerk limit really changes the command it is given
  ✓ flexisim/blackbox: …and throws the commissioning away, because the map was of the old one
  flexisim/blackbox: with joint friction — R2 0.0025, dc -0.0615, gain -0.0184, REFUSED: the step test and the probe disagree about the plant's gain (-0.0615 against -0.0184)
  ✓ flexisim/blackbox: friction makes the plant unidentifiable, and it says so instead of designing against it
  ✓ flexisim/blackbox: …and applies no correction while refusing
  ✓ flexisim/blackbox: …and the panel says so instead of throwing on the missing fields
  flexisim/blackbox: settle 1 → 8 ring, move period 10422 → 24576
  ✓ flexisim/blackbox: the settle really lengthens the dwell between moves
  ✓ flexisim/blackbox: the stage is painted
  flexisim: chart containers — ss-chart 170px, err-chart 170px, cs-chart 170px, chain-pos 170px, chain-chart 170px, bb-chart 170px, path-chart 170px
  ✓ flexisim: every Plotly container gets its height from CSS, so none can strobe
  flexisim: chart widths — err-chart 388/388/svg 388, ss-chart 388/388/svg 388, chain-pos 388/388/svg 388, chain-chart 388/388/svg 388, cs-chart 388/388/svg 388, path-chart 388/388/svg 388, bb-chart 388/388/svg 388
  ✓ flexisim: …and its width, so no chart is drawn wider than the box it sits in
  ✓ flexisim: …and the page does not scroll sideways on a phone
  ✓ flexisim: every in-browser closed-form check passes
  ✓ flexisim: the page reports no errors of its own

Section timings (s):
      4  index page
    134  flexisim move
    230  flexisim chain
    177  flexisim path
    147  flexisim black box
      1  flexisim verify

PASS — 0 check(s) failed. Screenshots in test/screenshots/

```

### browser-plan — exit 0 — 2026-08-30T00:50Z

```
Suite level: full   areas: flexisim   phase: browser
  (--all forces both; --only=ngrc,flowsim selects explicitly)

module parse
  ✓ no shipped module reaches for a Node global
  ✓ no class defines the same method twice
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
  ✓ and every module the pages import is in it
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
  flexisim: bias -7.365e-2 -> -6.168e-4, oscillation 1.602e-1 -> 1.361e-1
  ✓ flexisim: mode ② (open loop + prediction) actually collapses the bias
  ✓ flexisim: and it leaves the oscillation alone, which is the other mechanism
  ✓ flexisim: the feedforward is evaluated AHEAD of the move, not on it
  flexisim: rms limited by — the link ringing. A quasi-static model (② and ③) cannot canc…
  ✓ flexisim: the stats name which mechanism limits the rms, not just its value
  ✓ flexisim: mode ③ is REFUSED until the soft sensor is locked, and says which mode is live
  ✓ flexisim: the error chart tracks the run rather than freezing on its first points
  flexisim: chart means — commanded motor 6.45e-2, actual motor 7.83e-2, true arm 1.07e-2
  ✓ flexisim: the chart carries all five positions
  ✓ flexisim: with the correction on, the MOTOR is off target and the TOOL is on it
  flexisim: drawn/true tool error over 90 frames — 1.0000 to 1.0000 of the magnification (want 1.0)
  ✓ flexisim: the picture magnifies the WHOLE tool error, wind-up and bending alike
  ✓ flexisim: training dithers the correction, so the model sees the loop it will be inside
  flexisim: soft sensor estimating after 1440 pairs — estimate 0.0677 vs naive 1.1128, forecast 0.0839 vs persistence 0.8029
  ✓ flexisim: the soft sensor reaches a locked, frozen readout
  ✓ flexisim: and the LOCKED estimate beats the controller's own view of the tip
  ✓ flexisim: the forecast beats persistence on the readout's own estimate
  flexisim: closed loop active=closed offset 6.622 mrad — bias -7.365e-2 -> 1.195e-2, oscillation 1.602e-1 -> 1.645e-1
  ✓ flexisim: once LOCKED, mode ③ really engages
  ✓ flexisim: and the closed loop cuts the bias with no model at all
  ✓ flexisim: it leaves the oscillation alone too — it cannot chase what it sits on
  flexisim: compare filled open, ff, closed — bias open -6.72e-2 / ff 1.36e-4 / closed 1.19e-2
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
  flexisim/chain: tool sensor estimating after 1056 pairs — whole arm 0.0803, elbow only 0.0549 (0.68x), naive 1.0150
  flexisim/chain: drawn tool vs the model — 1.0003 of the magnification (want 1.0), axial -8.62e-2
  ✓ flexisim/chain: the picture draws the same tool error the model reports
  ✓ flexisim/chain: …and the sweep band spans the error it bounds
  ✓ flexisim/chain: both tool sensors reach a locked, frozen readout
  ✓ flexisim/chain: the whole-arm sensor beats the controller's own view of the tool
  ✓ flexisim/chain: and the elbow-only model at matched capacity also beats naive
  flexisim/chain: tool bias vs the program — open -1.034e-1 / model -1.175e-1 / closed -3.521e-3 (pre-distortion 5.44 mrad)
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
  flexisim/chain: auto-tune selected learned, mode period 862, board open 2.40e-1 / ff 2.35e-1 / learned 1.10e-1 / closed 2.29e-1
  ✓ flexisim/chain: auto-tune measures the bending mode from an unshaped kick
  ✓ flexisim/chain: …and turns the shaper on once it has one
  ✓ flexisim/chain: …fits the learned filter and reports its size
  ✓ flexisim/chain: …scores every mode, so the table is not empty
  ✓ flexisim/chain: …and the learned filter beats the quasi-static model it sits on
  ✓ flexisim/chain: …by reducing the OSCILLATION, which nothing else here can
  ✓ flexisim/chain: …and selects the mode its own table scored best
  flexisim/chain: sensors locked at step "lock them" after 6016 pairs, under learned
  ✓ flexisim/chain: the LOCK is the last step of the sequence, not one in the middle
  ✓ flexisim/chain: …so the sensors keep learning past the target and top up
  flexisim/chain: after auto-tune — running learned, sensors under learned, whole arm 0.0122 vs naive 1.0592
  ✓ flexisim/chain: …commissions the tool sensors in the configuration it chose
  ✓ flexisim/chain: …so the readout the user is left with is actually good
  flexisim/chain: control roughness — jerk off 1.25e-1, jerk 120 1.10e-3 (114x smoother)
  ✓ flexisim/chain: the jerk limit makes the shoulder correction smoother too
  ✓ flexisim/chain: …without shrinking it
  flexisim/chain: drive rated 32x hold, saturated 0.0% / 0.0%
  ✓ flexisim/chain: both joints have a rated drive that reports its demand
  ✓ flexisim/chain: …and it carries the shipped move without saturating
  ✓ flexisim/chain: the stage bounds the magnified shake with the swept band
  ✓ flexisim/chain: …and gives the manual controls back afterwards
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
  flexisim/path: feedrate 4.0e-3 → 1.0e-2, lap 7356 → 3268; arc 26.400 → 26.397 of 29.42
  ✓ flexisim/path: applying it changes the speed and keeps the place on the part
  ✓ flexisim/path: …and the error trail and chart are still being fed after it
  ✓ flexisim/path: the stage is painted
  flexisim/path: drawn tool vs the model — gap 0.00e+0 on a 12.67 reach
  ✓ flexisim/path: the drawn tool IS the tool every metric is computed from
  ✓ flexisim/path: ⑨ starts with nothing commissioned
  ✓ flexisim/path: …and its panel is shown exactly when ⑨ is the selected mode
  ✓ flexisim/path: …and selecting ⑨ before commissioning is REFUSED, not run
  flexisim/path: identified c -4.559e-1 / -1.443e+0 against −1/K = -6.250e-2
  ✓ flexisim/path: the identified compliance has the gearbox's sign and exceeds it
  ✓ flexisim/path: …and selecting it is then honoured
  flexisim/path: learning, lap by lap — 5.87e-1 → 5.48e-1 → 4.84e-1 → 3.88e-1 → 2.68e-1 → 2.04e-1 → 1.74e-1 → 1.52e-1
  ✓ flexisim/path: the learner drives the contour error down lap on lap
  ✓ flexisim/path: ⑤ commissioning runs to a result without halting
  flexisim/path: pilot deployed — verified 3.44x on the machine (program; scribble 3.87x / program 3.44x); Ts 2142, sample 9
  ✓ flexisim/path: the pilot commissions in the browser and the machine vouches for it
  ✓ flexisim/path: …and deploying lands in the selector, not just in a report
  flexisim/path: pilot lap — contour 2.190e-2, tau2 2.420e-4 against the open loop's 1.34e-1 / 5.93e-4
  ✓ flexisim/path: …and the deployed pilot cuts the contour on a program it never saw
  ✓ flexisim/path: ⑧ knows both halves are commissioned
  ✓ flexisim/path: …and its toggles are exposed and both on by default
  ✓ flexisim/path: probing the applied correction does not MOVE it — two reads agree
  ✓ flexisim/path: ⑧ turning the pilot off changes the applied correction
  ✓ flexisim/path: …and turning the compliance off changes it too, so both toggles act
  ✓ flexisim/path: ⑧’s compliance half IS ③, to the last bit
  ✓ flexisim/path: …and ⑧’s pilot half IS ⑤, so no clamp of ③’s eats the pilot
  ✓ flexisim/path: …and ⑧ with both on is their sum
  ✓ flexisim/path: ⑧ over-commissioning the pilot runs to a result without halting
  ✓ flexisim/path: ⑧ commissions the pilot OVER the identified compliance when asked
  ✓ flexisim/path: ⑧ one tap sets up the plant the 5.70x was measured on
  ✓ flexisim/path: …and the program too — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: …and it arms the OVER-commissioning the stack needs, still on ⑧
  ✓ flexisim/path: …and the rebuild cleared the previous machine’s learners
  ✓ flexisim/path: (the machine is first driven OFF the measured configuration, so the checks below have teeth)
  ✓ flexisim/path: ⑨ sets up its own machine — K 1 / E 0.06, no other button pressed
  ✓ flexisim/path: …and its own program — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: ⑨ commissioning does not fail out of the gate
  ✓ flexisim/path: ⑨ the button builds the host and the machine turns
  ✓ flexisim/path: …and the report panel opens while it runs, so the run is visible
  ✓ flexisim/path: ⑨ reports where it is, and the report ADVANCES while it runs
  ✓ flexisim/path: …and the button becomes a live Stop rather than going dead
  ✓ flexisim/path: …and stopping clears the host, so no partial ladder can deploy
  ✓ flexisim/path: …and ⑨ is refused again after the stop, as it was before it
  flexisim/blackbox: measured settling 2290 steps, DC gain 15.53 against an arm length of 15.5 it was never told; predicted 2.05x, MEASURED 5.41x, achieved 5.36x, as a constrained costing 5870 MAC/update = 84 MAC/cycle over the 70 cycles between updates (3.4% of 5% of a 1 ms cycle), basis top-128
  ✓ flexisim/blackbox: it measures the plant's own timescale from a step
  ✓ flexisim/blackbox: …and recovers the ARM LENGTH it was never given
  ✓ flexisim/blackbox: …and an impulse response agreeing with it in sign and size
  ✓ flexisim/blackbox: …and validates the PLANT model on held-out probe samples
  ✓ flexisim/blackbox: …then designs a feedforward that looks AHEAD of the command
  ✓ flexisim/blackbox: …and what it MEASURED on the machine is what it achieves
  ✓ flexisim/blackbox: …in an arithmetic budget a 1 ms PLC task can afford
  ✓ flexisim/blackbox: …without making the machine worse
  flexisim/blackbox: command second difference 109x the bare reference's, torque 1.6x the uncorrected machine's
  ✓ flexisim/blackbox: …and the command it hands the drive is one the drive can follow
  ✓ flexisim/blackbox: …and the trial ladder scored smoothness alongside tracking
  ✓ flexisim/blackbox: …and the tool is drawn ON the stage, not off it
  ✓ flexisim/blackbox: …and the estimate is drawn ON the tool, as its score says
  ✓ flexisim/blackbox: the correction is limited to 80% of what the drive has SPARE
  ✓ flexisim/blackbox: …and a supplied limit of zero is a LIMIT, not an absence
  flexisim/blackbox: jerk 120 → 1800 steps, move period 7062 → 10422, correction limit 3.831e-1 → 5.281e-1
  ✓ flexisim/blackbox: the jerk limit really changes the command it is given
  ✓ flexisim/blackbox: …and throws the commissioning away, because the map was of the old one
  flexisim/blackbox: with joint friction — R2 0.0025, dc -0.0618, gain -0.0185, REFUSED: the step test and the probe disagree about the plant's gain (-0.0618 against -0.0185)
  ✓ flexisim/blackbox: friction makes the plant unidentifiable, and it says so instead of designing against it
  ✓ flexisim/blackbox: …and applies no correction while refusing
  ✓ flexisim/blackbox: …and the panel says so instead of throwing on the missing fields
  flexisim/blackbox: settle 1 → 8 ring, move period 10422 → 24576
  ✓ flexisim/blackbox: the settle really lengthens the dwell between moves
  ✓ flexisim/blackbox: the stage is painted
  flexisim: chart containers — ss-chart 170px, err-chart 170px, cs-chart 170px, chain-pos 170px, chain-chart 170px, bb-chart 170px, path-chart 170px
  ✓ flexisim: every Plotly container gets its height from CSS, so none can strobe
  flexisim: chart widths — err-chart 388/388/svg 388, ss-chart 388/388/svg 388, chain-pos 388/388/svg 388, chain-chart 388/388/svg 388, cs-chart 388/388/svg 388, path-chart 388/388/svg 388, bb-chart 388/388/svg 388
  ✓ flexisim: …and its width, so no chart is drawn wider than the box it sits in
  ✓ flexisim: …and the page does not scroll sideways on a phone
  ✓ flexisim: every in-browser closed-form check passes
  ✓ flexisim: the page reports no errors of its own

Section timings (s):
      4  index page
    132  flexisim move
    241  flexisim chain
    181  flexisim path
    149  flexisim black box
      1  flexisim verify

PASS — 0 check(s) failed. Screenshots in test/screenshots/

```

### browser-deploy — exit 0 — 2026-08-30T03:09Z

```
Suite level: full   areas: flexisim   phase: browser
  (--all forces both; --only=ngrc,flowsim selects explicitly)

module parse
  ✓ no shipped module reaches for a Node global
  ✓ no class defines the same method twice
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
  ✓ and every module the pages import is in it
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
  flexisim: bias -7.367e-2 -> -6.958e-4, oscillation 1.602e-1 -> 1.361e-1
  ✓ flexisim: mode ② (open loop + prediction) actually collapses the bias
  ✓ flexisim: and it leaves the oscillation alone, which is the other mechanism
  ✓ flexisim: the feedforward is evaluated AHEAD of the move, not on it
  flexisim: rms limited by — the link ringing. A quasi-static model (② and ③) cannot canc…
  ✓ flexisim: the stats name which mechanism limits the rms, not just its value
  ✓ flexisim: mode ③ is REFUSED until the soft sensor is locked, and says which mode is live
  ✓ flexisim: the error chart tracks the run rather than freezing on its first points
  flexisim: chart means — commanded motor 5.67e-2, actual motor 7.63e-2, true arm 3.55e-3
  ✓ flexisim: the chart carries all five positions
  ✓ flexisim: with the correction on, the MOTOR is off target and the TOOL is on it
  flexisim: drawn/true tool error over 90 frames — 1.0000 to 1.0000 of the magnification (want 1.0)
  ✓ flexisim: the picture magnifies the WHOLE tool error, wind-up and bending alike
  ✓ flexisim: training dithers the correction, so the model sees the loop it will be inside
  flexisim: soft sensor estimating after 1440 pairs — estimate 0.0716 vs naive 1.1022, forecast 0.0794 vs persistence 0.8043
  ✓ flexisim: the soft sensor reaches a locked, frozen readout
  ✓ flexisim: and the LOCKED estimate beats the controller's own view of the tip
  ✓ flexisim: the forecast beats persistence on the readout's own estimate
  flexisim: closed loop active=closed offset 6.336 mrad — bias -7.367e-2 -> 6.584e-3, oscillation 1.602e-1 -> 1.647e-1
  ✓ flexisim: once LOCKED, mode ③ really engages
  ✓ flexisim: and the closed loop cuts the bias with no model at all
  ✓ flexisim: it leaves the oscillation alone too — it cannot chase what it sits on
  flexisim: compare filled open, ff, closed — bias open -6.93e-2 / ff 1.36e-4 / closed 6.58e-3
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
  flexisim: after auto-tune — running learned, sensor commissioned under learned, estimate 0.0309 vs naive 1.9265, forecast 0.0411 vs persistence 0.6261
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
  flexisim: drive — rated 32x hold, saturated 0.0%, rms 4.318e-2; rated 2x, saturated 44.5%, rms 4.203e-1
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
  flexisim/chain: tool sensor estimating after 1056 pairs — whole arm 0.0970, elbow only 0.0520 (0.54x), naive 1.0307
  flexisim/chain: drawn tool vs the model — 0.9987 of the magnification (want 1.0), axial 4.35e-1
  ✓ flexisim/chain: the picture draws the same tool error the model reports
  ✓ flexisim/chain: …and the sweep band spans the error it bounds
  ✓ flexisim/chain: both tool sensors reach a locked, frozen readout
  ✓ flexisim/chain: the whole-arm sensor beats the controller's own view of the tool
  ✓ flexisim/chain: and the elbow-only model at matched capacity also beats naive
  flexisim/chain: tool bias vs the program — open -1.022e-1 / model -1.082e-1 / closed -6.122e-4 (pre-distortion 5.40 mrad)
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
  flexisim/chain: auto-tune selected learned, mode period 862, board open 2.40e-1 / ff 2.35e-1 / learned 1.10e-1 / closed 2.29e-1
  ✓ flexisim/chain: auto-tune measures the bending mode from an unshaped kick
  ✓ flexisim/chain: …and turns the shaper on once it has one
  ✓ flexisim/chain: …fits the learned filter and reports its size
  ✓ flexisim/chain: …scores every mode, so the table is not empty
  ✓ flexisim/chain: …and the learned filter beats the quasi-static model it sits on
  ✓ flexisim/chain: …by reducing the OSCILLATION, which nothing else here can
  ✓ flexisim/chain: …and selects the mode its own table scored best
  flexisim/chain: sensors locked at step "lock them" after 6016 pairs, under learned
  ✓ flexisim/chain: the LOCK is the last step of the sequence, not one in the middle
  ✓ flexisim/chain: …so the sensors keep learning past the target and top up
  flexisim/chain: after auto-tune — running learned, sensors under learned, whole arm 0.0122 vs naive 1.0592
  ✓ flexisim/chain: …commissions the tool sensors in the configuration it chose
  ✓ flexisim/chain: …so the readout the user is left with is actually good
  flexisim/chain: control roughness — jerk off 1.25e-1, jerk 120 1.10e-3 (114x smoother)
  ✓ flexisim/chain: the jerk limit makes the shoulder correction smoother too
  ✓ flexisim/chain: …without shrinking it
  flexisim/chain: drive rated 32x hold, saturated 0.0% / 0.0%
  ✓ flexisim/chain: both joints have a rated drive that reports its demand
  ✓ flexisim/chain: …and it carries the shipped move without saturating
  ✓ flexisim/chain: the stage bounds the magnified shake with the swept band
  ✓ flexisim/chain: …and gives the manual controls back afterwards
  ✓ flexisim/chain: the stage is painted
  flexisim/path: rounded, 29.42 long, lap 7356 steps, 1080 cells; homed 2.09e-2 from the start of the program
  ✓ flexisim/path: the arm homes onto the start of the program
  ✓ flexisim/path: …and it is a closed loop the machine never stops on
  ✓ flexisim/path: an identified correction that does not exist is not applied
  ✓ flexisim/path: …and so is a pilot that has not vouched for itself
  ✓ flexisim/path: …and ⑤+④ needs that same vouched pilot before its table acts
  ✓ flexisim/path: …and so is a fully learned system that has not been commissioned
  ✓ flexisim/path: …and ⑦ inherits exactly the same refusal
  flexisim/path: after 2700 steps — contour 9.67e-2, lag 4.02e-1, unobservable 1.30e-1 vs following 3.98e-1
  ✓ flexisim/path: the contour/lag split is live and both are finite
  ✓ flexisim/path: a feedrate change mid-lap is queued rather than applied
  flexisim/path: feedrate 4.0e-3 → 1.0e-2, lap 7356 → 3268; arc 25.200 → 25.197 of 29.42
  ✓ flexisim/path: applying it changes the speed and keeps the place on the part
  ✓ flexisim/path: …and the error trail and chart are still being fed after it
  ✓ flexisim/path: the stage is painted
  flexisim/path: drawn tool vs the model — gap 0.00e+0 on a 14.21 reach
  ✓ flexisim/path: the drawn tool IS the tool every metric is computed from
  ✓ flexisim/path: ⑨ starts with nothing commissioned
  ✓ flexisim/path: …and its panel is shown exactly when ⑨ is the selected mode
  ✓ flexisim/path: …and selecting ⑨ before commissioning is REFUSED, not run
  flexisim/path: identified c -4.557e-1 / -1.439e+0 against −1/K = -6.250e-2
  ✓ flexisim/path: the identified compliance has the gearbox's sign and exceeds it
  ✓ flexisim/path: …and selecting it is then honoured
  flexisim/path: learning, lap by lap — 5.87e-1 → 5.48e-1 → 4.84e-1 → 3.88e-1 → 2.68e-1 → 2.04e-1 → 1.74e-1 → 1.52e-1
  ✓ flexisim/path: the learner drives the contour error down lap on lap
  ✓ flexisim/path: ⑤ commissioning runs to a result without halting
  flexisim/path: pilot deployed — verified 3.44x on the machine (program; scribble 3.87x / program 3.44x); Ts 2142, sample 9
  ✓ flexisim/path: the pilot commissions in the browser and the machine vouches for it
  ✓ flexisim/path: …and deploying lands in the selector, not just in a report
  flexisim/path: pilot lap — contour 2.190e-2, tau2 2.420e-4 against the open loop's 1.34e-1 / 5.93e-4
  ✓ flexisim/path: …and the deployed pilot cuts the contour on a program it never saw
  ✓ flexisim/path: ⑧ knows both halves are commissioned
  ✓ flexisim/path: …and its toggles are exposed and both on by default
  ✓ flexisim/path: probing the applied correction does not MOVE it — two reads agree
  ✓ flexisim/path: ⑧ turning the pilot off changes the applied correction
  ✓ flexisim/path: …and turning the compliance off changes it too, so both toggles act
  ✓ flexisim/path: ⑧’s compliance half IS ③, to the last bit
  ✓ flexisim/path: …and ⑧’s pilot half IS ⑤, so no clamp of ③’s eats the pilot
  ✓ flexisim/path: …and ⑧ with both on is their sum
  ✓ flexisim/path: ⑧ over-commissioning the pilot runs to a result without halting
  ✓ flexisim/path: ⑧ commissions the pilot OVER the identified compliance when asked
  ✓ flexisim/path: ⑧ one tap sets up the plant the 5.70x was measured on
  ✓ flexisim/path: …and the program too — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: …and it arms the OVER-commissioning the stack needs, still on ⑧
  ✓ flexisim/path: …and the rebuild cleared the previous machine’s learners
  ✓ flexisim/path: (the machine is first driven OFF the measured configuration, so the checks below have teeth)
  ✓ flexisim/path: ⑨ sets up its own machine — K 1 / E 0.06, no other button pressed
  ✓ flexisim/path: …and its own program — the rounded rectangle at 4e-3 / 4e-5 / 40
  ✓ flexisim/path: ⑨ commissioning does not fail out of the gate
  ✓ flexisim/path: ⑨ the button builds the host and the machine turns
  ✓ flexisim/path: …and the report panel opens while it runs, so the run is visible
  ✓ flexisim/path: ⑨ reports where it is, and the report ADVANCES while it runs
  ✓ flexisim/path: …and the button becomes a live Stop rather than going dead
  ✓ flexisim/path: …and stopping clears the host, so no partial ladder can deploy
  ✓ flexisim/path: …and ⑨ is refused again after the stop, as it was before it
  flexisim/blackbox: measured settling 2290 steps, DC gain 15.53 against an arm length of 15.5 it was never told; predicted 2.05x, MEASURED 5.41x, achieved 5.38x, as a constrained costing 5870 MAC/update = 84 MAC/cycle over the 70 cycles between updates (3.4% of 5% of a 1 ms cycle), basis top-128
  ✓ flexisim/blackbox: it measures the plant's own timescale from a step
  ✓ flexisim/blackbox: …and recovers the ARM LENGTH it was never given
  ✓ flexisim/blackbox: …and an impulse response agreeing with it in sign and size
  ✓ flexisim/blackbox: …and validates the PLANT model on held-out probe samples
  ✓ flexisim/blackbox: …then designs a feedforward that looks AHEAD of the command
  ✓ flexisim/blackbox: …and what it MEASURED on the machine is what it achieves
  ✓ flexisim/blackbox: …in an arithmetic budget a 1 ms PLC task can afford
  ✓ flexisim/blackbox: …without making the machine worse
  flexisim/blackbox: command second difference 120x the bare reference's, torque 1.6x the uncorrected machine's
  ✓ flexisim/blackbox: …and the command it hands the drive is one the drive can follow
  ✓ flexisim/blackbox: …and the trial ladder scored smoothness alongside tracking
  ✓ flexisim/blackbox: …and the tool is drawn ON the stage, not off it
  ✓ flexisim/blackbox: …and the estimate is drawn ON the tool, as its score says
  ✓ flexisim/blackbox: the correction is limited to 80% of what the drive has SPARE
  ✓ flexisim/blackbox: …and a supplied limit of zero is a LIMIT, not an absence
  flexisim/blackbox: jerk 120 → 1800 steps, move period 7062 → 10422, correction limit 3.831e-1 → 5.281e-1
  ✓ flexisim/blackbox: the jerk limit really changes the command it is given
  ✓ flexisim/blackbox: …and throws the commissioning away, because the map was of the old one
  flexisim/blackbox: with joint friction — R2 0.0025, dc -0.0615, gain -0.0184, REFUSED: the step test and the probe disagree about the plant's gain (-0.0615 against -0.0184)
  ✓ flexisim/blackbox: friction makes the plant unidentifiable, and it says so instead of designing against it
  ✓ flexisim/blackbox: …and applies no correction while refusing
  ✓ flexisim/blackbox: …and the panel says so instead of throwing on the missing fields
  flexisim/blackbox: settle 1 → 8 ring, move period 10422 → 24576
  ✓ flexisim/blackbox: the settle really lengthens the dwell between moves
  ✓ flexisim/blackbox: the stage is painted
  flexisim: chart containers — ss-chart 170px, err-chart 170px, cs-chart 170px, chain-pos 170px, chain-chart 170px, bb-chart 170px, path-chart 170px
  ✓ flexisim: every Plotly container gets its height from CSS, so none can strobe
  flexisim: chart widths — err-chart 388/388/svg 388, ss-chart 388/388/svg 388, chain-pos 388/388/svg 388, chain-chart 388/388/svg 388, cs-chart 388/388/svg 388, path-chart 388/388/svg 388, bb-chart 388/388/svg 388
  ✓ flexisim: …and its width, so no chart is drawn wider than the box it sits in
  ✓ flexisim: …and the page does not scroll sideways on a phone
  ✓ flexisim: every in-browser closed-form check passes
  ✓ flexisim: the page reports no errors of its own

Section timings (s):
      4  index page
    132  flexisim move
    230  flexisim chain
    178  flexisim path
    148  flexisim black box
      1  flexisim verify

PASS — 0 check(s) failed. Screenshots in test/screenshots/

```

### bench-phase1 — exit 0 — 2026-08-30T04:32Z

```

flexisim: the transfer bench — one commission, 5 programs x 4 feedrates
  [arm K 1 E 0.06, home = rounded 8x8 at 4e-3, lap 7457]
  [0m] commissioning on the home cell…
  [0m] as it arrived  3.8380e-1
  [4m] conventional (self-tuned)  3.5651e-1  1.08x
  [6m] pilot cascade, depth 1  8.8387e-2  4.03x
  [8m] pilot cascade, depth 2  1.2216e-1  0.72x
  [9m] pilot cascade, depth 1 (rungs below withheld)  6.2693e-2  1.41x
  [11m] pilot cascade, depth 2 (rungs below withheld)  5.7443e-2  1.09x
  [11m] — the conventional rung WITHHELD  5.7443e-2  1.00x
  [26m] lap-periodic (harmonic)  2.7276e-2  2.11x
  [26m] shipped {"classic":false,"stack":2,"hff":true}  3.8380e-1 → 2.7276e-2  14.07x at home

  FULL LADDER (as shipped) — gain over the same machine with the correction OFF
    program             1e-3     2e-3     4e-3     1e-2
    rounded 8x8       1.22x    2.41x   13.93x*   6.62x 
    rounded 10x6      1.60x    2.82x    9.20x    4.59x 
    circle r3         1.17x    1.87x    6.10x    9.05x 
    circle r5         1.22x    1.23x    2.55x   15.98x 
    sharp 9x7         1.22x    1.52x    2.36x    4.29x 
    (* the cell it was commissioned on)
    HOME  13.93x   WORST  1.17x  on circle r3 at 1e-3   spread 11.9x
    no cell made worse than the conventional machine

  MODEL LAYERS ONLY (lap-periodic rung disarmed) — gain over the same machine with the correction OFF
    program             1e-3     2e-3     4e-3     1e-2
    rounded 8x8       3.18x    4.80x    6.66x*   6.56x 
    rounded 10x6      4.37x    5.62x    6.79x    4.66x 
    circle r3         2.88x    3.73x   17.19x    7.84x 
    circle r5         3.01x    2.95x    5.95x   13.60x 
    sharp 9x7         1.45x    1.68x    2.39x    4.19x 
    (* the cell it was commissioned on)
    HOME  6.66x   WORST  1.45x  on sharp 9x7 at 1e-3   spread 4.6x
    no cell made worse than the conventional machine

  WHAT THIS DECIDES
    the memory is worth 2.09x at HOME and 0.81x at the WORST CELL.
    full ladder   home 13.93x  worst 1.17x  spread 11.9x  hurt 0/20
    model only    home 6.66x  worst 1.45x  spread 4.6x  hurt 0/20
    If the full ladder's SPREAD is not materially worse than the model-only
    spread, docs/plan.md's premise is wrong and the plan is the thing to change.

```

### lev-read — exit 0 — 2026-08-30T05:10Z

```

pilot: the 2R arm, route–limit–run–deploy
    commissioned in 129513 steps: Ts 2142, sample 9, grid 8, N 58; chose stride 13/ridge 0.00001, stride 13/ridge 0.00001
    verify: 3.20x at λ 4.9e-3
  ✓ the pilot measured the arm's timescale and derived its grids from it
  ✓ …autotune chose the windows and the ridge on held-out data
  ✓ …and the verify round measured better than 2x ON THE MACHINE before deploying
    rounded: contour 1.343e-1 → 2.253e-2 (5.96x), tau2 5.93e-4 → 3.80e-4, u peak 0.120
  ✓ on the rounded — a program the pilot has never seen — the contour falls 5x
  ✓ …while spending no more copper than the open loop times 1.15
  ✓ …and the rounded's correction never exceeded the engineer's cap
    circle: contour 7.101e-2 → 1.034e-2 (6.87x), tau2 2.23e-4 → 2.04e-4, u peak 0.038
  ✓ on the circle — a program the pilot has never seen — the contour falls 6x
  ✓ …and the circle's correction never exceeded the engineer's cap
    ⑤+④ circle ladder: 7.1e-2 7.8e-2 5.5e-2 2.7e-2 2.3e-2 1.8e-2 1.0e-2 7.1e-3 5.9e-3 5.3e-3 3.1e-3 5.7e-3
  ✓ ILC folding on the pilot's residual converges past what either does alone

pilot/arm: all checks passed

```

### lev-read2 — exit 0 — 2026-08-30T05:13Z

```

pilot: the 2R arm, route–limit–run–deploy
    commissioned in 129513 steps: Ts 2142, sample 9, grid 8, N 58; chose stride 13/ridge 0.00001, stride 13/ridge 0.00001
    verify: 3.20x at λ 4.9e-3
    ch R² lead0 0.986 → far 0.973   leverage lead0 1.53e-2 → far 2.01e-2   ratio 1.32   ⇒ covered — the FEATURES do not span it
    ch R² lead0 0.882 → far 0.831   leverage lead0 1.53e-2 → far 2.01e-2   ratio 1.32   ⇒ covered — the FEATURES do not span it
  ✓ the pilot measured the arm's timescale and derived its grids from it
  ✓ …autotune chose the windows and the ridge on held-out data
  ✓ …and the verify round measured better than 2x ON THE MACHINE before deploying
    rounded: contour 1.343e-1 → 2.253e-2 (5.96x), tau2 5.93e-4 → 3.80e-4, u peak 0.120
  ✓ on the rounded — a program the pilot has never seen — the contour falls 5x
  ✓ …while spending no more copper than the open loop times 1.15
  ✓ …and the rounded's correction never exceeded the engineer's cap
    circle: contour 7.101e-2 → 1.034e-2 (6.87x), tau2 2.23e-4 → 2.04e-4, u peak 0.038
  ✓ on the circle — a program the pilot has never seen — the contour falls 6x
  ✓ …and the circle's correction never exceeded the engineer's cap
    ⑤+④ circle ladder: 7.1e-2 7.8e-2 5.5e-2 2.7e-2 2.3e-2 1.8e-2 1.0e-2 7.1e-3 5.9e-3 5.3e-3 3.1e-3 5.7e-3
  ✓ ILC folding on the pilot's residual converges past what either does alone

pilot/arm: all checks passed

```

### guard-verify — exit 0 — 2026-08-30T05:17Z

```
Suite level: quick   areas: flexisim,pilot   phase: node
  (--all forces both; --only=ngrc,flowsim selects explicitly)

module parse
  ✓ no shipped module reaches for a Node global
  ✓ no class defines the same method twice
  ✓ 82 modules parse


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
    [margin 2] 1216 cells, 165.0 us/step, tip -0.055692253940486, slope -0.00453250838961
    [margin 1] 684 cells, 124.0 us/step, tip -0.055692253940486, slope -0.00453250838961
  ✓ one vacuum layer gives BIT-IDENTICAL statics to two
    [margin] 1.33x faster at 684 cells against 1216
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
    [backlash] dead band 7.35e-2 rad = 50% of the peak wind-up 1.47e-1
    [backlash] memoryless 0.6206 -> 0.7238   windowed 0.3645 -> 0.5884
  ✓ backlash degrades a MEMORYLESS estimator
    [backlash] memory is worth 1.70x clean and 1.23x under backlash; relative damage +16.6% vs +61.4%
  ✓ a history window still wins UNDER backlash, in the absolute terms a machine gets
  ✓ ...but it is hurt MORE in relative terms, having more structure to lose
  ✓ memory helps even without backlash, because a ringing phase needs history

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
    [whole arm] learner 0.0199   rigid model 0.9299   PLS frozen 0.1078   PLS adaptive 0.0737   "the tool is where the encoders say" 1.0000   (298 locked samples, 181 features from 10 signals)
  ✓ the chain sensor reaches a locked, frozen readout
  ✓ a locked whole-arm sensor beats the controller's own view of where the tool is
  ✓ …and it beats PLS, the linear model industry actually deploys for soft sensing
    [whole arm] PLS frozen 0.1078 vs adaptive 0.0737 — whichever leads here is a property of THIS stream's stationarity, not of the method
  ✓ and it beats the rigid two-joint compliance model, which knows M(q) and both stiffnesses

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


flexisim: active compensation
    [commission] c 1.21092 (1/K = 0.2500, so the link is 79% of it)   per pose 1.21454 1.21127 1.20918
  ✓ the servo holds a pose with no following error left
  ✓ every commissioning pose settled
  ✓ the identified compliance agrees across poses to 0.5%
    [commission] first bending mode 6.215e-3 rad/step (period 1011), zeta 0.236   Euler-Bernoulli would say 7.092e-3 (14% high)
  ✓ the measured bending mode is well below Euler-Bernoulli, as a stubby section must be
    static sag at the home pose 7.407e-2 (0.48% of the arm)
    [plain      ] bias 7.366e-2   oscillation 1.944e-1   rms 2.079e-1   settled 1.104e-1
    [compensated] bias 2.695e-4   oscillation 2.072e-1   rms 2.072e-1   settled 6.851e-2
    [shaped     ] bias 7.375e-2   oscillation 7.599e-2   rms 1.059e-1   settled 7.392e-2
    [both       ] bias 1.731e-4   oscillation 7.675e-2   rms 7.675e-2   settled 1.863e-2
    [bias]        compensation 273x, shaping 0.999x (i.e. nothing)
    [oscillation] compensation 0.94x (i.e. nothing), shaping 2.56x
    [rms]         compensation 1.00x, shaping 1.96x, TOGETHER 2.71x
  ✓ compensation removes the BIAS by more than 100x
  ✓ ...and does nothing whatever to the oscillation
  ✓ shaping cuts the oscillation by more than 2x
  ✓ ...and leaves the bias alone to a tenth of a percent, as a unit-sum convolution must
  ✓ what shaping leaves behind IS the static sag at the home pose
  ✓ TOGETHER the rms falls more than 2.5x, which neither alone gets near
  ✓ the residual bias is under 1% of the sag it removed
    [sign] bias uncompensated 7.366e-2 → correct 2.695e-4, backwards 1.476e-1 (2.00x)
  ✓ the sign is fixed by the plant: backwards DOUBLES the bias instead of removing it

  the jerk limit
  ✓ a boxcar is unit-sum, so the move still goes exactly as far
  ✓ …with one impulse per step, which is what makes the acceleration CONTINUOUS
  ✓ convolving with a shaper preserves unit sum
  ✓ …and the delays add rather than multiply
  ✓ convolveShapers(null, x) is x, so an unshaped page composes cleanly
  ✓ the jerk-limited move reaches exactly the same span
    [jerk] biggest one-step acceleration jump: bare 6.857e-7, limited 5.714e-9 → 120x smaller
  ✓ the jerk limit turns the acceleration STEP into a ramp
  ✓ …and the ramp is exactly amax/W, which is what a jerk limit means
  ✓ the tabulated profile IS the impulse sum, not an approximation of it

  the drive envelope
  ✓ an unrated drive is ideal, which is what the page shipped with
  ✓ at standstill the ceiling is the peak torque, both directions
  ✓ below the ceiling nothing is touched
  ✓ the ceiling falls linearly with speed
  ✓ …and reaches exactly zero at the no-load speed
  ✓ …and does not go NEGATIVE past it, which would be a motor driving itself back
  ✓ braking a fast motor keeps the FULL ceiling
  ✓ a colossal commanded acceleration comes back at the torque ceiling
  ✓ …so alpha_max is tau_max * N / J_reflected and needs no clamp of its own
  ✓ the drive counts what it could not deliver, so the page can say so
  ✓ …and the counters reset with the machine

all checks passed


flexisim: the toolpath and its feedrate
  ✓ a line's arc length is its length
  ✓ …and the contour error of a point offset from it IS that offset, signed
  ✓ a quarter arc's length is R times its sweep
  ✓ …and its curvature is 1/R
  ✓ …and a point at radius R+d is |d| off it
  ✓ the rounded rectangle is as long as its geometry says
    [feed] 3978 steps, covered 23.9398 of 23.9398, peak v 1.165e-2 (limit 2.000e-2), peak a 2.000e-5 (limit 2.000e-5)
  ✓ the profile covers the whole path and no more
  ✓ …without exceeding the commanded feedrate
  ✓ …or the acceleration limit
    [feed] fastest on a straight 1.165e-2, on an arc 4.899e-3 against sqrt(a*r) = 4.899e-3
  ✓ the feedrate comes down on the curves, to the centripetal limit
  ✓ …and it is faster on the straights, so the limit is a limit and not a crawl
    [corner] 90°: v at the corner 5.756e-4 against the junction rule's 5.657e-4, and 1.414e-2 away from it
  ✓ a corner the curvature limit cannot see still slows the feedrate
  ✓ …to the junction velocity the acceleration limit allows
    [decompose] a pure 120-step lag: tracking error up to 1.327e+0, contour error up to 4.839e-16 — a ratio of 2.7e+15
  ✓ a pure lag ALONG the path is a large tracking error
  ✓ …and essentially ZERO contour error, which is why the part comes out right
  ✓ …while a deviation NORMAL to it is a contour error of exactly that size

toolpath: all checks passed


flexisim: iterative learning on a path
  ✓ the running-sum ring filter equals the definition
  ✓ …and it is zero phase — the centroid does not move
  ✓ a visited bin takes the negated error
  ✓ …and an unvisited one is left alone, not driven to zero
  ✓ the bin index wraps rather than running off the end
    [lead  0] 5.30e-2 → 5.68e-1   9.33e-2×
    [lead  5] 5.30e-2 → 2.05e-3   2.58e+1×
    [lead 10] 5.30e-2 → 1.33e-4   4.00e+2×
    [lead 15] 5.30e-2 → 1.37e-4   3.89e+2×
    [lead 20] 5.30e-2 → 5.82e-4   9.12e+1×
    [lead 30] 5.30e-2 → 2.21e+0   2.40e-2×
    [lead 60] 5.30e-2 → 1.03e+3   5.13e-5×
  ✓ a lead near the plant's own delay converges by two orders of magnitude
  ✓ …with NO lead it winds up instead — the update is credited to the wrong place
  ✓ …and too much lead winds up harder still, so the optimum is interior
  ✓ at zero gain the laps repeat exactly, so the improvement is the learner

pathilc: all checks passed


flexisim: contour following
  ✓ forward kinematics undoes the inverse, in both elbow branches
  ✓ …and it refuses a point outside the reachable annulus
  ✓ …and the Jacobian agrees with a numerical derivative
    [Jdot] at constant Cartesian velocity the joints must still accelerate: ddq 5.83e-7, -6.48e-7
  ✓ a constant Cartesian velocity still needs joint acceleration, and J*ddq alone does not give zero
    [decompose] a 200-step LAG: tracking 2.627e+0, contour 9.113e-16
    [decompose] a 0.05 NORMAL offset: tracking 5.000e-2, contour 5.000e-2
  ✓ a pure lag is a large tracking error and no contour error
  ✓ …and a normal offset of the same kind of size is ALL contour error
  ✓ …so a single tracking number cannot tell a late part from a wrong one
    [trace] feed 8.0e-3 →   2039 steps, contour rms 4.918e-1 max 1.242e+0, lag rms 2.084e+0, tau^2 4.228e-3, work 8.28e-2, reversals 3
    [trace] feed 2.0e-3 →   8155 steps, contour rms 6.338e-2 max 1.596e-1, lag rms 1.964e+0, tau^2 1.143e-4, work 8.42e-3, reversals 4
    [trace] feed 5.0e-4 →  32618 steps, contour rms 3.955e-2 max 6.609e-2, lag rms 1.372e+0, tau^2 1.793e-4, work 5.67e-3, reversals 4
  ✓ the arm traces the path and stays on it at a feedrate it can follow
  ✓ …with the deviation dominated by LAG rather than by contour error
  ✓ going faster costs contour accuracy
    [floor] halving the feed twice buys 7.8x at the fast end and 1.60x at the slow end — the difference is the compliance, which slowing down cannot reach
  ✓ …and slowing down stops helping, because what is left is compliance
    [energy] tau^2 4.23e-3 → 1.14e-4 → 1.79e-4 — fast costs acceleration, slow costs holding position for longer
  ✓ motor energy has an interior minimum, so it does not optimise where accuracy does
  ✓ …and the score records reversals too, which no rms can show
    [reversals] one real direction change through a dwell: counting travel 0, counting sign 994
  ✓ counting TRAVEL makes the reversal count physical rather than arithmetic
    [bias/osc] offset part rms 0.2000 = bias -0.2000 + osc 0.0000; ringing part rms 0.2000 = bias -0.0000 + osc 0.2000
  ✓ two streams a single contour rms cannot tell apart ARE the same rms
  ✓ …the uniformly undersize part reads all bias and no oscillation
  ✓ …the right-size ringing part reads the reverse
  ✓ …and on a stream with both, rms² = bias² + osc² identically

contour: all checks passed


pilot: the excitation builder
  ✓ velocity, acceleration, jerk and the position box hold on every commanded sample
  ✓ …while the excitation still covers at least 95% of the box, which is its job
  ✓ the same seed commands the same trajectory, so a commissioning is reproducible
  ✓ a hostile workspace shrinks the span instead of being violated
  ✓ …and a workspace that rejects everything refuses with a reason, not a loop
  ✓ a duration these limits cannot fill refuses with the remedy, instead of returning a flat line that excites nothing
  ✓ …and the unwarped case refuses too — the approach alone cannot fit
  ✓ the approach ease respects the very limits its duration was solved from

excite: all checks passed


pilot: route, limit, run, deploy on a foreign plant
    commissioned in 48400 steps: Ts 50, sample 1, grid 2, N 203; verify 1.98x
  ✓ the pilot measures the plant's own timescale and derives every grid from it
  ✓ …the verify round measured an improvement ON THE MACHINE and deployed
  ✓ …and the forecast readouts validated on held-out data, not on what they fitted
    deployed on two incommensurate sines: error rms 2.59e-2 → 1.11e-3  (23.45x), u peak 0.118
  ✓ deployed on a program it never saw, the error falls by at least 2x
  ✓ …without the correction ever exceeding the cap the engineer gave
  ✓ a truth signal that never responds to the correction is REFUSED, with the reason
  ✓ …and a refused pilot outputs exactly zero, not its best guess
    guard: derates 2, verdict true
  ✓ a guard trip derates the excitation AND the dither, instead of ignoring the ceiling
  ✓ …and the derated commissioning still finishes and deploys
    noisy: verdict true, verify 7.29x, readout R² 0.962
  ✓ a quantised encoder and a dirty tracker still commission and deploy
    noisy deploy: 14.97x at 1.6x the commissioned velocity (4327 excursion ticks reported)
  ✓ …and the deployed improvement survives the dirt
  ✓ a program faster than anything commissioned is REPORTED as outside the envelope
  ✓ …while a program inside the envelope raises no excursion at all
  ✓ a finer clock halves the decision spacing
  ✓ …and the horizon grows to cover the same SETTLING TIME, not the same step count
  ✓ …and λ rises with its SQUARE, so the physical smoothness penalty is unchanged
  ✓ …and the default clock leaves λ where every plant on record had it

pilot: all checks passed


pilot: the quadruple-tank process — same algorithm, different signals
    excitation without dwell: verify 1.28x · recipe 0.506 → 0.245 cm rms (2.07x) · worst 1.17 → 0.64 cm · u peak 0.383 V
    excitation WITH dwell   : verify 2.28x · recipe 0.506 → 0.384 cm rms (1.32x) · worst 1.17 → 1.11 cm · u peak 0.283 V
    commissioned in 122643 steps = 204 min of process time; Ts 2048, Tset 2769, sample 9, N 58, rings [0,0], windows 13/13
  ✓ the pilot measures a timescale on a plant with no inertia in it anywhere
  ✓ …chooses its own windows and ridge on held-out data from these signals
  ✓ …asks for NO frequency sweep, because a tank has no mode to ring
  ✓ …and the machine vouched for the controller before it deployed
  ✓ on a recipe it never saw, level error falls — cm of liquid, from volts of pump
  ✓ …without exceeding the engineer's correction cap
  ✓ the sweeping excitation selects the nonlinear basis on a plant with sqrt outflow
  ✓ …and the dwelling one does not need it, and does not pay for it
  ✓ …and with the basis selected, the sweeping excitation is the better model
    the verify reported 2.28x against 1.32x on the recipe — within a factor since the verify learned to dwell, against 3.8x before it did
  ✓ the verify now tracks the program benefit within a factor of two on this plant
    non-minimum phase (γ 0.43,0.34): REFUSED · verify — · recipe 1.599 → 1.599 cm rms (1.00x) · open-loop error is 3.2x the minimum-phase plant's
  ✓ the pilot REFUSES the plant it cannot help, rather than deploying anyway
  ✓ …so the recipe is left exactly as it was
  ✓ …and it does not claim the minimum-phase win, because the RHP zero forbids it
    (three commissionings and six scored recipes in 58s)
    non-minimum phase with the gate OFF: DEPLOYED — would have refused: yes
  ✓ with the gate off the model deploys anyway
  ✓ …and the refusal it did not make is still reported

pilot/tanks: all checks passed


pilot: a three-zone extruder barrel — delay, noise, and a disturbance it cannot see
    commissioned in 276735 steps = 76.9 h of process time; Ts 3169, Tset 17112, sample 13, N 247, rings [1,1,2]
    readouts: z1 stride 13/ridge 1e-5 R² 0.745 · z2 stride 13/ridge 1e-5 R² 0.797 · z3 stride 13/ridge 1e-7 R² 0.753
    verify 0.92x — the verify round measured 0.92x against doing nothing on the program regime (program 0.92x) — this pilot does not deploy a controller the machine has not vouched for
  ✓ THREE channels commission from THREE signals, one measurement per channel
  ✓ …and the measured timescale accounts for the transport delay
    rings [1,1,2] overshoot ["1.108","1.196","1.232"] — the mode test on a plant with an unmeasured drift, see the note in this file
  ✓ the ring count is bounded rather than counting noise, which is what it did before
  ✓ …and on a plant it cannot help, the gate REFUSES rather than deploying
    changeover: temperature error 5.405 → 5.405 K rms (1.00x), worst 10.67 → 10.67 K, u peak 0.00% of 12%, negative-power clips 0
  ✓ …so the changeover runs exactly as it would have, untouched
  ✓ …and a host that keeps feeding a refused pilot is not a crash
    NOTE the autotune chose ridge 1e-5/1e-5/1e-7 against a noiseless plant's typical 1e-9..1e-5 — the first plant here where regularisation had observation noise to regularise
  ✓ the readouts still generalise on a plant with real measurement noise
  ✓ the barrel is SCORED before it is refused, not refused for want of a regime
  ✓ …and what could not be built is reported rather than swallowed
  ✓ the barrel accepts a nonlinear basis where its own physics is nonlinear
    (commissioned and scored in 155s)

pilot/thermal: all checks passed


pilot: the Wood–Berry column — a published benchmark against a published baseline
    commissioned in 67400 steps = 112 h of process time; Ts 436, Tset 660, sample 2, N 71, rings [0,0]
    verify 2.08x — verified 2.08x on the machine (program; scribble 3.33x / program 2.08x)
    IAE over the scenario (composition·min, both loops summed):
      steady-state inversion only   43.90
      Luyben BLT decentralized PI   51.95   [the published baseline]
      the pilot                     72.08   (0.72x BLT), u peak 0.400
      published bar: an extended-predictive tuning reports 28.9 against BLT's 55.34 on its own scenario — 1.91x
  ✓ the pilot commissions on a plant defined only by published transfer functions
  ✓ …and its measured timescale exceeds the longest dead time in the plant
  ✓ a plant defined by linear transfer functions selects the LINEAR basis
  ✓ our BLT baseline reproduces the published IAE for this plant within 15%
  ✓ …and the correction never exceeded the engineer's cap
    THE GATE OVERSTATES BY 3x: verify 2.08x against a measured 0.72x on the benchmark — it certified a controller that makes this plant worse
  ✓ the verify/benchmark gap is smaller than it was and still recorded
  ✓ …and the benchmark IAE is unchanged by the gate work
    (three controllers scored in 24s)

pilot/woodberry: all checks passed


pilot: a cold mill stand — roll eccentricity, and the gaugemeter that amplifies it
    commissioned in 142400 steps = 285 s of rolling; Ts 9, Tset 9, sample 1, N 14, rings [0]
    verify 0.54x — the scribble regime measured 0.57x — the correction makes the machine worse away from its program, whatever it is worth on one (scribble 0.57x, program 0.54x) — this pilot does not deploy a controller the machine has not vouched for
    exit gauge deviation over 40 s of rolling (microns rms / worst), eccentricity 30 µm at 1.22 Hz, gauge 200 ms downstream:
      no AGC (fixed gap)            15.15 / 29.97
      gaugemeter (BISRA) AGC        18.08 / 29.04
      monitor AGC (X-ray, delayed)  14.00 / 25.85
      the pilot                     15.15 / 29.97   u peak 0.0 µm
  ✓ the gaugemeter AMPLIFIES roll eccentricity, which is why this plant is the test
  ✓ …while monitor AGC, honest but late, buys only a little
  ✓ the pilot commissions from force, gap and a delayed noisy gauge
    PREDICTION FAILED: this plant was chosen as the pilot's wheelhouse and it refuses (verify 0.54x). Four routings, no change.
  ✓ the pilot REFUSES rather than deploying onto a mill it cannot help
  ✓ …so the mill runs exactly as it would have, and the gaugemeter's 1.19x penalty is avoided by declining

pilot/rollmill: all checks passed


pilot: EMPS — a real servo axis, real data, and a conventional method that wins
    the machine: 0.5764 mm rms / 0.8517 mm peak against the recorded 0.5814 / 0.8522
    commissioned done — Ts 19 Tset 45 sample 1 grid 1 N 68; verify 1.35x
    tracking error over the program, mm rms (x against the shipped machine):
      as shipped, cascade P/P             0.5764      1.0x   no plant knowledge
      the pilot                           0.0454     12.7x   no plant knowledge
      + velocity feedforward              0.0380     15.2x   no plant knowledge
      ILC, Q width 21, best of 12 laps    0.0049    119x   a Q filter, tuned by hand
      + inverse-dynamics feedforward      0.0021    275x   M, Fv, Fc, OF identified
      the machine's own repeatability     0.0003    1900x   (the floor, measured lap to lap)
      ILC with no Q filter                0.0177 at lap 4, then 63.5 mm by lap 40 — DIVERGED
  ✓ our identification agrees with the published reference model
  ✓ the rig reproduces the recorded tracking error within 1%
  ✓ the measured friction curve departs from the four-parameter model by a few N
  ✓ the pilot commissions and deploys with no plant model at all
  ✓ …and it improves the shipped machine by at least 8x
  ✓ …at a cadence derived from the rise the probe measured, not from a floor
  ✓ …without ever exceeding the authority it was given
  ✓ a hand-tuned ILC beats the pilot on this machine
  ✓ …and the same ILC with no Q filter diverges past the uncontrolled machine
  ✓ the model-based feedforward beats everything learned here

  all checks passed


pilot: harmonic feedforward on a real servo axis — the same module, another plant

    candidates, each commissioned briefly and scored ON THE MACHINE:
      spread probe 25% of the error peak   fit residual 0.029   machine 2.394e-3 mm
      spread probe 25% of the error peak   fit residual 0.029   machine 5.356e-3 mm
      spread probe 25% of the error peak   fit residual 0.029   machine 2.381e-3 mm
      spread probe 25% of the error peak   fit residual 0.029   machine 5.356e-3 mm
      spread probe 10% of the error peak   fit residual 0.024   machine 2.406e-3 mm
      spread probe 10% of the error peak   fit residual 0.024   machine 5.362e-3 mm
      spread probe 10% of the error peak   fit residual 0.024   machine 2.385e-3 mm
      spread probe 10% of the error peak   fit residual 0.024   machine 5.358e-3 mm
      basis  probe 25% of the error peak   fit residual 0.007   machine 2.405e-3 mm
      basis  probe 25% of the error peak   fit residual 0.007   machine 5.938e-3 mm
      basis  probe 25% of the error peak   fit residual 0.007   machine 2.393e-3 mm
      basis  probe 25% of the error peak   fit residual 0.007   machine 5.939e-3 mm
      basis  probe 10% of the error peak   fit residual 0.006   machine 2.466e-3 mm
      basis  probe 10% of the error peak   fit residual 0.006   machine 5.388e-3 mm
      basis  probe 10% of the error peak   fit residual 0.006   machine 2.472e-3 mm
      basis  probe 10% of the error peak   fit residual 0.006   machine 5.397e-3 mm
    picked spread at 10%   71 laps   256/256 harmonics live
    5.7640e-1 → 2.3805e-3 mm rms   242.1x   peak correction 2.00 mm allowed
  ✓ the same module that was derived on a compliant two-link arm commissions itself on a real servo axis, told only the lap length, the channel count and its authority
  ✓ …and improves the machine by at least 100x, which is well outside the 1.6 µm the rig reproduces the hardware to
  ✓ …which is at least the hand-tuned ILC's 119x on this same rig and program, so a correction with nothing tuned is the conventional one's equal here
  ✓ …and it lands within the rig's own fidelity of the INVERSE-DYNAMICS feedforward at the published parameters, which is a learned correction reaching a model-based one without the model
  ✓ …because this plant's channel still has reach at harmonic 160, where the arm's was dead by 16 — so a hand-set count is a plant constant wearing a method's clothes
  ✓ the candidate the FIT likes best is not the one the MACHINE likes best — which is why the probe design and amplitude are chosen by deploying them, not by their residual
  ✓ …and the difference is worth having, so this is a real selection and not a coin toss between equals
  ✓ the deployed correction is never worse than not correcting at all, whatever the refinement did on the way
  ✓ …and the refinement it kept improved monotonically
    starved to 0.5 mm of authority against a 0.85 mm error: 2.2531e-1 mm  2.56x
  ✓ given a third of the authority the correction actually needs, it still helps and is still bounded — the cap binds, the method does not fall over

    a channel that dies at h~12, a saturating actuator, and measurement noise (mean of 6 draws):
      open loop                    1.483e-1
      shrink as shipped            1.236e-2   12.00x
      REACH removed                1.305e-1   1.14x
      CONFIDENCE removed           1.352e-2   10.97x
      both removed                 1.315e-1   1.13x
      REACH as an affordability CUT 3.556e-2   4.17x
  ✓ on a plant whose channel dies — the arm's defining property, which this axis does not have — the shipped shrink converges at least 3x
  ✓ …and with BOTH the ceiling and the weighting removed it barely converges at all, so bounding the inversion is what matters rather than which instrument does it
  ✓ …and each factor still EARNS its place in the shipped configuration, measured one at a time against it
  ✓ …and the affordability CUT, built to replace the weighting, is no better than what the machine-scored ceiling already does
  ✓ at least one variant's refinement actually goes BACKWARDS at some pass — otherwise the guard check below is vacuous and would pass with no guard at all
  ✓ …and on every variant what DEPLOYS is the best pass rather than the last one, which is the guard's whole contract
  ✓ …and none of them is driven past the machine it started from
  ✓ …while on the real axis, where every harmonic HAS reach, the same factor is inert to four figures — which is what makes it a selection and not an attenuation

hff: all checks passed


synthetic plant with KNOWN h->h-1 coupling (strength 0.5), 2 passes

  diagonal operator   1.4819e-2   26 laps
  banded operator     9.9806e-4   20 laps   Gb built: true
  ratio banded/diagonal 0.067

  CONTROL — a plant with NO coupling, 14 passes each so both converge:
    diagonal 4.0333e-16   banded 4.0290e-16   ratio 0.999

  ✓ the banded operator is actually BUILT — not a flag that leaves every harmonic null, which is how this shipped the first time and reported a ratio of exactly 1.000
  ✓ it beats the diagonal solve on a plant with KNOWN neighbour coupling WITHOUT spending more laps — so it is the operator doing the work and not a longer refinement
  ✓ …and the harmonics really ARE coupled here, so the comparison above has something to find
  ✓ CONTROL: on a plant with no coupling at all, and a budget where both converge, banded lands where diagonal lands — the case it should not touch comes back untouched
  ✓ …and that control is not vacuous: the uncoupled plant really did converge, so the two agreeing means the operators agree rather than both having failed

band: all checks passed

  ✓ all three armed is EXACTLY the sum of the three armed alone, to double precision
  ✓ …and each rung alone really contributes something, so the sum above is not three zeros
  ✓ a rung declaring a frame is mapped OUT of it before summing, and the other rungs are NOT
  ✓ the cap clamps the SUM and does so once — not each rung separately
  ✓ …and the clamp is COUNTED rather than silent
  ✓ the peak DEMAND is recorded even when the cap never binds — the case a clamp counter cannot distinguish from safety
  ✓ …and a cap larger than the channel box is reported as such, since it cannot protect it
  ✓ a rung returning NaN is COUNTED — NaN compares false against every bound, so no range check catches it by accident

sum: all checks passed


an operator identified on one program, reused on another

  program A, identified from scratch   4.6769e-16   32 laps
  program B, identified from scratch   6.1146e-16   32 laps
  program B, operator REUSED from A    5.9816e-16   10 laps

  laps saved 22 of 32  (69%)
  residual ratio reused/fresh 0.978
  (both land at machine precision on an exact plant, so the residual ratio is
   not informative — the LAP COST is what this measures)

  ✓ the reused operator costs far fewer laps than identifying again — identification is where this rung spends them
  ✓ …and it still corrects the second program, rather than being cheap and useless
  ✓ …and it reports that it REUSED rather than identified, so a run cannot silently be cheaper than it looks
  ✓ an operator from a different lap is REFUSED rather than reinterpreted — harmonic h is not the same frequency on both

reuse: all checks passed


can a yielding host drive the ladder?

  straight through   2.622492e-3   {"classic":true,"stack":0,"hff":true}
  yielding every 7   2.622492e-3   {"classic":true,"stack":0,"hff":true}

  ✓ a host that awaits mid-run reaches the SAME result as one that runs straight through — so the ladder carries no state across an await that a frame boundary would break
  ✓ …and every rung row matches, not just the final number — a ladder can reach the same place by a different route and that would still be a bug
  ✓ …and the commission actually did something, so the comparison is not two nulls

yield: all checks passed


pilot: the harmonic rung publishes a plan it keeps
  ✓ plan() names every stage and gives each a run count and a criterion
  ✓ …and the CEILINGS are exactly the stages that genuinely cannot be counted ahead
  BUDGET THE RUN REPORTS: {"base":1,"probeSizing":1,"probes":12,"trials":48,"refocus":3,"refine":11,"total":75}
  PLAN: [["baseline",1],["sizing the probe",1],["probing candidate designs",12],["scoring candidates",48],["identifying the operator",3],["refining",11]]
  runs spent 76; plan total ~76 (exact stages 17, refining ≤59); stages seen: baseline → sizing the probe → probing candidate designs → scoring candidates → probing candidate designs → scoring candidates → probing candidate designs → scoring candidates → probing candidate designs → scoring candidates → identifying the operator → refining
  ✓ the run spends at least the stages that CANNOT stop early
  ✓ …and never more than the published total, so the denominator cannot be exceeded
  refinement used its full budget
  ✓ …and a run that ends short SAYS why, rather than just ending
  ✓ every stage the plan names is actually entered and reported
  ✓ …and the rung still works — the correction improves the machine

plan: all checks passed


pilot: the deployed correction IS the scored correction
  worst disagreement 0.00e+0; the baseline term alone is 8.83e-2 rad
  ✓ the deploy path returns exactly what the scored path applies
  ✓ …and the check has teeth — the baseline term it must include is not negligible
  ✓ …and a host with no baseline REFUSES rather than deploying half a correction
  contour — host loop 3.8380e-1, page loop 3.8380e-1
  ✓ the page’s deployment loop reproduces the host’s scored loop

deploy: all checks passed


pilot: the lap-periodic rung is withheld off its own program
  home 0.25   away 0   never-stamped 0.25   withheld {"hffOffProgram":1}
  ✓ on its own program the table is applied, exactly as before the guard existed
  ✓ on ANOTHER program it is withheld
  ✓ …and a rung that was never stamped is NOT withheld — the guard stays inert
  ✓ it reports WITHHELD, distinctly from starved

offprogram: all checks passed


pilot: the leverage the Cholesky already pays for
  ✓ asking for the leverage leaves the weights byte-identical
  worst disagreement against an independently inverted A: 2.22e-16
  ✓ the leverage matches an independently computed x’A⁻¹x
  well-excited 1.02e-2   barely-excited 2.47e+1 (2417x more)
  inside the data 6.14e-3   far outside 9.92e+1 (16167x more)
  ✓ a barely-excited direction costs far more variance than a well-excited one
  ✓ …and a point far outside the data costs more than one inside it

leverage: all checks passed


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


(--node — skipping the browser)

```

### lev-ikfree — exit 0 — 2026-08-30T05:24Z

```

pilot: kinematics-free geometry — the inverse learned from the tracker
    90 held points; degree 7: train 7.35e-5, HOLDOUT 3.252e-4 rad
  ✓ the inverse is learned from the tracker to sub-milliradian holdout
    static hold error on the circle: analytic 4.481e-2 (max 6.33e-2), learned 2.165e-3 (max 4.52e-3) — 20.7x
  ✓ holding real path points, the learned map lands within 5e-3 of the ask
  ✓ …and beats the analytic kinematics at least 5x, because it learned the MACHINE (droop and wind-up included) rather than the drawing
    ⑥ pilot on the learned routing: deploys, verify 3.14x
    ⑥ ch R² lead0 0.984 → far 0.972   leverage 1.53e-2 → 2.01e-2   ratio 1.32   ⇒ far lead predicted well — nothing to explain
    ⑥ ch R² lead0 0.874 → far 0.828   leverage 1.53e-2 → 2.01e-2   ratio 1.32   ⇒ far lead predicted well — nothing to explain
  ✓ the pilot commissions on the learned truth routing and the machine vouches for it
    ⑦ circle ladder: 5.9e-2 6.9e-2 4.8e-2 2.5e-2 2.1e-2 1.7e-2 9.6e-3 5.3e-3 4.8e-3 3.5e-3 2.6e-3 1.7e-3
  ✓ ⑦ — iteration on the fully learned chain — converges on the circle
    softest corner DELIVERED on the circle: open 1.18e+0 → 2.71e-1 (4.36x) — against a verify that read scribble 0.28x / program 1.36x
    softest corner (K 0.25, E 0.03): deploys, verify 1.36x
  ✓ at the softest sliders the fully learned system commissions and deploys
  ✓ …and its correction HELPS on a program, whatever the scribble regime said

pilot/ikfree: all checks passed

```
