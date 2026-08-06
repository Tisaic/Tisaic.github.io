# TC_NGRC paybacks — lessons from the browser sandbox

What the finger-trace tab ("the orange line model") taught us that pays back
to the original **TC_NGRC** structured-text (IEC 61131-3) project. The finger
tab accidentally simulated PLC deployment constraints — noisy real-world
input, online learning under a hard per-frame time budget, live rival models,
production freeze semantics — so most of what it forced us to learn is
general. Each item below is grounded in something measured or debugged in
this repo, not speculation.

## 1. Bounded-budget cyclic training maps 1:1 to PLC scan cycles

The cyclic AFM pump trains continuously under a hard ~3 ms/frame slice
(`pumpCyc`), and the page stayed responsive with a model that is always warm
— autopilot deploys instantly instead of commissioning on demand. The ST
integration pattern this validates: **N RLS updates per task cycle,
time-boxed, with per-component cycle-time attribution** (the CPU-bucket row
is the instrumentation template: measure each component against wall time,
report % of budget every second).

## 2. A production `bFreeze` needs a precise live/halt state split

Freeze is not "stop calling the train method." The split we converged on
after real bugs:

- **Halt:** weight/covariance updates (θ/P), training-data memory rings,
  reference refreshes (the stored loop), and anything that grows from input.
- **Keep live:** lag history, state estimation (the PLL phase, the ESN's
  reservoir state), and centering/normalization state.
- **Freeze-immune slots:** any *lag* used by a prediction must come from a
  slot that keeps updating while frozen. A frozen ring buffer serving
  s(t−1) silently degraded frozen predictions (found twice: the ESN's
  reservoir would have had this; the MLP actually did).
- The memorizer's memory IS its model: a frozen k-NN memory must neither
  grow **nor be wiped** by unrelated events (a stray touch far from the
  doodle used to erase it while parametric models kept their weights).

## 3. Deploy-by-verification with a runtime watchdog

`autotune` already rejects unstable models offline. The finger tab added the
**runtime** half: free-run the candidate over early/mid/late windows, score
shape fidelity, deploy by **snapshot**, and on escape/divergence restart from
the verified snapshot instead of flying off. On real hardware this is the
bounded-behavior wrapper a learned feedforward wants: validate on a test
trajectory before enabling, clamp outputs, revert on divergence. The doodle
never decays because the verified orbit is replayed, not trusted forever.

## 4. The operational argument for NGRC, now with evidence

To make an ordinary feedforward NN merely **match** the NGRC direct readouts
online, we had to add Adam, offline hyperparameter tuning, and a 1200-sample
experience-replay buffer — without replay the online net forgets each rung
between visits and lands 2–3× worse. The ESN needed a 100-neuron reservoir
to get within ~1.1–1.2× of a 105-weight-per-rung polynomial readout. RLS is
**one-pass, fixed-FLOP, seed-free, deterministic** — no replay buffers, no
optimizer schedules, no initialization luck. That is the argument that
matters on a PLC, and the sandbox measured it live with fair scoring.

## 5. Fair-benchmark methodology (for justifying deployment)

- **Pairwise, same-instance scoring:** rivals are judged on the same
  prediction instances, or one side gets poisoned with warmup the other
  never served (measured: a 16× distortion before the fix).
- **Warm gating:** score a readout only after it has trained (>40 updates).
- **Never score invisible predictions:** if a display/trust cap hides a
  prediction, don't count it against the model.
- **Attribute pipelines honestly:** the shape-locked ghost's win belongs to
  its structural prior, not the library primitives — so the like-for-like
  rows compare raw readout vs rival, and the systems race is labeled as one.
- **Match offset-decay schedules** between rivals (an undamped analogue
  offset quietly inflated NGRC's advantage until both used the same decay).

## 6. Data conditioning before fitting

- **EMA-filtered derivatives for states** — raw one-sample diffs make sensor
  noise a prediction target (finger tremor ⇔ encoder quantization).
- **Constant-rate / arc-length resampling** — corner dwells teach stall
  fixed points; resampling to constant speed killed them.
- **Noise-injected replay** hardens a learned trajectory into a true
  attractor (free-runs return to the orbit instead of drifting off).
- **Band-limit the model's own inputs** (soft-sensor tab): HF content the
  physics can't express leaks into the estimate; filtering the sensor's own
  inputs removed spikes AND improved accuracy 6×.

## 7. Expose (and document) the AFM ridge prior

The library default `rand = 0.001` ridged the shape-carrying random features
out of the AFM solution — the universal map only worked for attractor
learning with a strongly boosted prior (`rand = 1`). An ST user hits the
same wall silently. The prior should be an exposed, documented tunable with
guidance: *if free-runs collapse to a blob, raise the random-feature prior.*

## 7b. The washout trap — and the exact conditions that arm it

Found on the Lorenz tab (it capped the free-run near 1 Λ and made weak
ridge look catastrophic): `Continuous` trains from the first sample while
`autoNormalize`'s statistics are still settling, so the pre-freeze RLS
equations are written in **moving, badly-scaled coordinates** (a Welford σ
estimated from a handful of samples can be near zero → normalized features
10–100× too large) and — at λ=1.0 — they stay in the exact least-squares
solution forever with full weight. Feeding the calibration window
predict-only (stats still calibrate; nothing trains) fixed it: free-run
valid time ×4, 1-step error ×4 better, ridge sensitivity flattened over
five decades.

The full-app audit then showed the trap needs **two ingredients at once**:

1. a **never-forgetting fit** (λ=1.0 exact RLS — forgetting λ<1 or SGD
   self-heals), AND
2. **high-leverage early equations** — feature coordinates that move AND
   mis-scale during warmup (normalization mid-calibration). Bounded,
   hand-scaled coordinates are safe: the finger tab's per-stroke centroid
   transient is the same *shape* of flaw, but its states stay clamped O(1),
   so a measured washout changed steady-state misses by exactly nothing
   (identical to 4 decimals on a circle).

Audit results across this repo: `SoftSensor` is immune **by design** (its
standardizer freezes before `adapt()` ever runs — the reference pattern);
the preview readout uses raw settled features (immune); the cyclic AFM uses
stable absolute coordinates + λ=0.9995 (immune); ESN/MLP/tempo readouts
forget or overwrite (self-healing); only the Lorenz `Continuous` models had
both ingredients.

**ST audit rule**: any block combining `autoNormalize` (or any evolving
standardization) with λ≈1 RLS must not write training equations until the
statistics freeze — add a washout, or adopt the SoftSensor warmup contract.
`ServoFF` (auto-normalize + directional forgetting) and `Continuous`-based
deployments are the places to check; directional forgetting mitigates but
does not remove the pre-freeze leverage.

## 8. Online scoring pipelines have two silent traps

Found while extending horizons to 20 s, both silently biased results:

- **Dwell flush:** pausing input flushed the pending-prediction queue, so
  long-horizon predictions were discarded whenever input hesitated —
  long-rung scores simply never populated for realistic input.
- **Strict-FIFO latency:** advancing scoring entries in lockstep made every
  horizon inherit the longest horizon's latency (422 samples even for the
  0.2 s rung). Entries must advance independently per horizon.

Any ST health monitor that scores predictions online (CommStore's health
monitor is adjacent) should be checked for both.

## 9. Structural priors beat capacity on cyclic motion

The shown ghost beats every general model at long horizons not by capacity
but by a prior: *this is a loop* → factor into path + phase rate + tempo
profile, predict by riding the path. The industrial cousin is **cyclic
machinery** (cam profiles, press cycles, pick-and-place): encode the cycle
structure explicitly — path + phase + learned tempo residual — and use NGRC
for the residual, rather than asking a general forecaster to rediscover
periodicity every cycle.

## 10. Validate against realistic input, not ideal input

On metronome-perfect machine traces the k-NN memorizer is near-optimal by
construction and every model looks different than it will in service. The
honest regime for tuning was human-realistic noise (jitter + tempo
random-walk). Servo equivalent: validate learned compensation against real
jittery motion profiles, not only commanded trajectories.

## What does NOT transfer

The phase-PLL/pen-lift machinery is doodle-specific. Multi-touch UI
plumbing, canvas rendering, and the stale-page detection are web concerns.
Everything above them is portable.
