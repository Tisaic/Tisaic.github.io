
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
