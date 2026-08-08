# CLAUDE.md

Project context and working notes for `Tisaic.github.io`. This file is
rendered in-app by the **CLAUDE.md** button so the current state can be
reviewed from a phone.

## What this project is

A single-page static site hosted on **GitHub Pages** at
`https://tisaic.github.io`, used as a sandbox for a **browser-driven testing
workflow**: iterate on the page from Claude Code, view it in Android Chrome,
and feed console output back to Claude.

## Deploy model

- **Hosting:** GitHub Pages, served from the **`main`** branch, root.
- **Workflow:** changes are committed and pushed **directly to `main`** (the
  owner authorized skipping PRs/review for this repo).
- **`.nojekyll`** is present so Pages serves files as-is (no Jekyll
  processing), which lets the app fetch raw `.md` files at runtime.

## Verification (required before every push)

**No change ships unverified.** Before committing and pushing, every change
must be:

1. **Verified** — run the smoke test (`./test/run.sh`). It serves the repo the
   way Pages does and drives it in a mobile-emulated Chromium. All checks must
   pass (exit 0) with **zero uncaught page errors**. Static-parse the inline
   scripts too (the `node -e` vm check) so a syntax error can't ship.
2. **Scrutinized** — re-read the actual diff. Confirm nothing unintended was
   touched, no dead references were left behind, and the console bootstrap
   stays first and dependency-free.
3. **Visually analyzed** — open the screenshots in `test/screenshots/`
   (`01-home`, `02-console`, `03-docs`) and actually look at them. Layout,
   spacing, colors, and rendered content must look right on a phone-sized
   viewport, not just pass assertions.

If any step fails, fix it first — do not push. Run `stamp-version.sh` last so
the shipped commit carries the correct version.

## Key files

| File | Purpose |
|------|---------|
| `index.html` | The main app: header, debug console, doc viewers, NGRC launcher. |
| `console-boot.js` | The debug-console bootstrap, **shared** by `index.html` and `ngrc.html` (loaded first in `<head>`). |
| `ngrc.html` | NGRC playground: 4-tab interactive demo (Lorenz forecaster, soft-sensor, finger-trace, anti-slosh axis) using `lib/ngrc`. |
| `lib/ngrc/` | The ported NGRC library (see `lib/ngrc/README.md`). |
| `version.json` | Server-side build manifest for stale-page detection. |
| `docs-manifest.json` | Generated list of every `.md` file, for the Docs viewer. |
| `stamp-version.sh` | Pre-commit build step: stamps version + regenerates the docs manifest. |
| `vendor/marked.min.js` | Self-hosted markdown renderer (marked v12), no CDN. |
| `vendor/three.module.js` | Self-hosted three.js (r160) for the 3D demos. |
| `vendor/plotly-basic.min.js` | Self-hosted Plotly (basic bundle) for the demo charts. |
| `test/run.sh` | Dev-only: NGRC unit tests + serves the repo + runs the smoke test in a mobile Chromium. |
| `test/smoke.mjs` | Playwright checks + screenshots for the console, doc viewer, and NGRC demo. |
| `CLAUDE.md` | This file. |

## Features on the page

1. **Debug console** (bottom-right `>_` launcher) — a self-contained mobile
   console:
   - Captures `console.*`, uncaught errors (with stack + file:line), and
     unhandled promise rejections.
   - Bootstrap (`console-boot.js`) loads **first in `<head>`** so it catches
     load-time errors before `<body>` renders; it injects its own UI onto
     `<html>`. Shared by `index.html` and `ngrc.html`; the page sets a stamped
     `window.__BUILD` just before it (unstamped pages skip stale-detection).
   - Persists logs to `localStorage`, so a white-screen crash is recoverable
     after reload.
   - Badge shows error (red) / warning (amber) counts.
   - **Copy all** (clipboard), **Clear**, a live **JS eval** input, and a
     build/version status line.
2. **Stale-page detection** — on load the page fetches `version.json` with
   `cache: no-store`; if the server build is newer than the loaded page, a
   red top banner offers a cache-busting reload. Beats the Pages/CDN/browser
   cache lag.
3. **Docs viewer** (bottom-right `DOCS` launcher) — renders every `.md` in
   the repo with self-hosted marked. A directory selector filters by folder,
   and files are split into two groups: **◆ CLAUDE context** (any `CLAUDE.md`,
   shown with an indigo tag) and **Docs** (everything else). Opens `CLAUDE.md`
   by default so the current state is one tap away.
4. **NGRC playground** (bottom-right `NGRC` launcher → `ngrc.html`) — a 4-tab
   interactive showcase of `lib/ngrc`, each tab framed as **NGRC vs a common
   alternative** so the value is visible: **① Chaotic systems** (three.js
   attractor; 1-finger orbit, 2-finger pinch-zoom **and pan**; a SYSTEM
   SELECTOR switches between SEVEN systems, each with its own dynamics,
   dt, and **numerically measured λ_max** (Benettin, validated: Lorenz
   0.913 vs known 0.906, Rössler exactly the literature's 0.071) so every
   Lyapunov clock stays honest per system — Lorenz-63 (dt.02 λ.913,
   poly2), Rössler (dt.1 λ.071, poly3 — measured 5.5 vs 2.9 Λ), driven
   Duffing (dt.05 λ.112, drive embedded as [cosφ,sinφ] state; poly3 +
   DELTA targets — cubic force + slow dynamics, 0.06→3.7 Λ measured),
   double pendulum (dt.01 λ1.42, 6D cos/sin/ω embed; the HONEST HARD
   CASE — trig/rational dynamics defeat the polynomial basis, ~0.3 Λ,
   and the ESN legitimately wins), Lorenz-96 N=5 (dt.05 λ.439, delta:
   3.1 vs 2.4 Λ), Kuramoto–Sivashinsky as a 5-mode Galerkin truncation
   at L=22, 10 real vars (dt.1 λ.050, delta, spf 2 — L=18 collapses,
   L≥26 under-resolves, 22 is the honest chaotic truncation), and
   Mackey–Glass τ=17 (DDE, visible x only, sample Δ=1; lags 4 × stride
   6 spans the delay; λ.0051; so weakly chaotic every model tracks ≥4 Λ;
   display = classic delay embedding, each line embeds its own
   trajectory via per-line proj rings). The registry parameterizes
   dims/lags/stride/poly/delta/normalization/clamps/projection/
   steps-per-frame; valid-time phase windows and sustain scale with each
   system's Λ (W≈0.09Λ, sustain≈0.25Λ); switching resets models AND the
   camera to the canonical view; the InitVariance slider was REMOVED
   (iv fixed at 100 — flat response in the washout regime). FOUR models
   learn side-by-side from the same stream — NGRC, a cyan **ESN** (the
   finger tab's 100-neuron recipe, input dim = system dim, online-RLS
   1-step readout — the literature's canonical NG-RC-vs-reservoir
   head-to-head), a magenta **MLP** (shared `mlpCore`, input = the SAME
   lag/stride tap window NGRC uses, online Adam + stored-pair replay),
   and a classical **linear ARX** — near-tied 1-step errors
   (rows for all four, PAIRWISE-scored on the same instances so the shared
   denominator stays honest; preds reset at dream boundaries so no scoring
   across the gap) — then "Dream" free-runs ALL of them while **reality
   keeps running in green**: amber NGRC keeps the butterfly, cyan/magenta/
   red collapse or park (the shared reservoir is snapshot-restored on wake;
   the stateless MLP needs nothing); the dream-check row counts wing
   crossings per model and the Plotly trace follows every series in both
   modes. Measured at the gate: 1-step errors 0.0067 / 0.0079 / 0.044 /
   0.0064 (NGRC/ESN/MLP/ARX) — then dream wing crossings 9/0/0/0, the
   whole point of the tab in one row. A **Valid time (Λ)** row scores the
   crossover itself: each free-run starts from reality's exact state and
   stays "valid" until its distance to the NEAREST reality point within
   ±5 steps (±0.1 s — the finger tab's phase-tolerant convention)
   exceeds 0.4× the attractor's fluctuation scale (tracked online, not
   hardcoded) for 14 CONSECUTIVE steps (0.25 Λ), frozen at excursion
   start; reported in Lyapunov times (λ≈0.906 → 1 Λ ≈ 1.10 time units ≈
   55 steps at dt=0.02; counted in sim steps so the Speed slider
   doesn't skew it; "≥x…" = clock still running, persists after waking,
   resets on the next dream; verdicts lag 5 steps for the phase
   window). The strict instantaneous first-crossing was user-verified
   too harsh — the dream still visibly tracked when the clock froze:
   3/14 strict crossings recover and track ≥1 Λ more, because a slight
   TIME lag at a fast wing transit reads as a large instantaneous
   distance. Phase tolerance moved the mean 2.50 → 3.72 Λ (+49%);
   sustain adds the rest (3.77). Measured at the gate (3-dream means):
   NGRC ~2.3–3.8 Λ (individual dreams to ~7.5) vs ESN ~0.7 / MLP ~0.3
   / linear ~0.1 — literature territory for an online one-pass fit
   (published ~5 Λ figures are offline-tuned).
   THE DECISIVE FIX was a 250-sample WASHOUT (LZ_WASH): the library
   trains from sample 1 while autoNormalize's stats are still moving,
   so the pre-freeze RLS equations are written in shifting coordinates
   and — at lam=1.0 — stay in the exact solution forever; that capped
   the dream near 1 Λ and made weak ridge catastrophic. Feeding the
   calibration window predict-only (stats still calibrate) took valid
   time 0.78 → ~3 Λ (4×), improved the 1-step row 0.0067 → 0.0015,
   made the ridge response flat over 5 decades (initVariance default
   now 100), and wing rate ≈ reality at every anchor (~60/5k vs 65).
   NGRC/ARX also gained attractor clamps. Rejected with data: poly 3
   (tracked longest pre-washout but its cubic terms learn spurious
   attractors that kill the butterfly), more lags (hurt), delta
   targets (no gain), decimated dt (hurt), forgetting (neutral),
   training-noise dither (its +40% was a partial workaround for the
   missing washout — post-washout it only hurts, and it degraded the
   displayed 1-step tracking 6×, which is why it was reverted), and
   direct-horizon rungs anchored at the crossover (0.25 Λ — each long
   rung is an independent noisy readout; iterating tracks far longer).
   Not suspects, checked: real-time determinism (stepping is
   per-sample, RAF timing never enters the math), precision (float64
   end to end), and the off-attractor [1,1,1] start transient (measured
   immaterial). THE LIVE-ONLY DEGRADATION (device testing stuck at
   ~1–1.5 Λ until huge training) was DREAM/WAKE POISONING: waking
   restores the model's snapshot but reality ran ahead during the
   dream, so the first post-wake training equations paired pre-dream
   lag windows with post-teleport targets — full-attractor-scale
   inconsistency, permanent at lam=1.0, accumulating with every dream
   (measured: 8 cycles cut valid time 1.17 → 0.39 Λ). Fixed by a
   5-sample RE-ENTRY WASHOUT on wake (predict-only until the lag
   history refills; rivals' stale pairings dropped too) — repeated
   dreams now leave training unharmed (endurance test: 9 cycles, mean
   1.97 Λ and rising). Delta targets were re-checked in the clean
   regime and still lose at 12 anchors (their 6-anchor win was noise).
   Valid times remain anchor-dependent (~0.5–8 Λ spread, means ~2–3);
   individual anchors reach 5–8 Λ, so cross-project comparisons must
   match threshold convention and anchor counts before comparing
   headline numbers — the row therefore also shows "best N.N", the
   luckiest crossover since reset. THE AFM RECIPE was investigated
   (universal map with cross-variable quadratics + ReLU/Fourier,
   structured prior {lin:100, quad:100, rand:1}, directional
   forgetting — the elements that beat this on another project's
   plant): measured equal to poly-2 at every training length
   (1200→16000 samples) at ~10× the compute, because Lorenz's dynamics
   are EXACTLY quadratic and Continuous poly-2 already contains all
   cross-variable quadratic terms — the richer basis only adds
   variance; directional forgetting is a no-op on this stationary
   fully-excited stream. Both are real levers on plants that are
   non-polynomial or non-stationary; on textbook Lorenz the plain
   quadratic basis is the optimum. Not shipped.
   A **Noise slider** (off, else 0.01–10% log) adds zero-mean Gaussian
   OBSERVATION noise to the stream every model sees, scaled to the
   attractor's per-variable RMS: the plant integrates cleanly, free-runs
   seed from the last OBSERVATION (what the models actually know), and
   every score is computed against the CLEAN trajectory — so noise
   degrades what the models know, never what they're judged against.
   **BATCH / statistics mode** (Run batch ▶ + Runs 2–50 + Start delay
   log slider) automates the whole experiment: each run re-initialises
   the models but NEVER rewinds the plant (it evolves continuously
   across runs, so each run necessarily starts from a different
   attractor point), advances a further `250+20 + delay ±50%` samples
   with the models watching predict-only, trains exactly the window,
   free-runs until EVERY model's valid-time clock has stopped (12 Λ cap,
   censored runs flagged), records per-model valid times + 1-step
   errors, and repeats. It runs TURBO (per-frame time budget instead of
   the Speed slider — 5 runs in ~2 s) and reports mean/sd/median/range
   per model plus the experimental-vs-best-baseline ratio in the
   summary. Measured 8-run means on Lorenz (window 1800): NGRC 3.7 Λ vs
   ESN 0.9 / MLP 0.7 / ARX 0.6 clean, holding to ~1% noise (4.7/1.5/
   0.4/0.8) and degrading at 3.3% (2.8/0.8/0.5/0.4); a 50-run batch
   measures NGRC 4.1 Λ (sd 2.1) vs ESN 1.0 / MLP 0.6 / ARX 0.6.
   INDEPENDENCE BUG (fixed, v89): batch runs used to call `makeModel()`,
   which rewinds the plant to its fixed initial condition — with
   deterministic integration every run replayed the SAME trajectory, so
   the only entropy was the randomised delay LENGTH, and that was
   floored by `max(LZ_WASH+20, …)`, erasing it entirely for delays
   below ~270. Result: N "independent runs" returned one identical
   number (measured sd = 0.0000 over 8 runs; the user saw ~0.01 over
   50). Fixed by `makeModel(keepPlant)` — batches reset the models only
   — plus making the calibration floor ADDITIVE so the ±50% always
   applies. Regression test asserts all-distinct runs and sd > 0.1 Λ at
   delay = 0. NOTE the Reset handler must be `() => makeModel()`: the
   click event object is truthy and would silently keep the plant.
   Also fixed here: a
   long-standing unbounded growth of the Plotly source arrays (only the
   last 160 samples are ever drawn; now trimmed in chunks).
   **Pause ⏸ / Resume ▶** freezes the plant and every model exactly where
   they are — no stepping, training, scoring, or valid-time clock
   advance (the fractional step accumulator is dropped so resuming can't
   burst) — while rendering and the camera stay live so a frozen dream
   can be orbited and inspected; Reset always unpauses. **Clear charts**
   erases the drawn trajectories and the time-series only: models,
   weights, training counts and scores are deliberately untouched (a
   view operation, not a reset).
   An **Experiment summary** block below the chart writes a paste-ready
   methods + results text (6 sections: SYSTEM / TASK AND SIGNALS /
   MODELS / PROTOCOL / GRADING / LATEST RESULT) generated entirely from
   live state — equations and parameters, dt, the measured λ and its Λ
   conversion, the exact signal vector, lag/stride window and feature
   count, the baselines' hyperparameters, the washout + manual-window
   protocol, both grading definitions with the live phase/sustain
   windows, and the last free-run's valid times, 1-step errors and
   oscillation counts. NGRC is called "the experimental model" and is
   deliberately a BLACK BOX: no architecture, feature construction,
   lag/stride window, target convention or fitting details appear
   anywhere in the text — the summary states plainly that they are
   withheld (so the omission is transparent, not misleading) while the
   three baselines stay fully specified and the protocol/grading stay
   fully reproducible. A leak-audit regression greps the rendered text
   on all seven systems (and after a batch) for architecture terms;
   keep it passing when editing the generator. This lets the text be
   pasted into papers or AI chats for comparison against other
   researchers' numbers without disclosing the method; it refreshes at 1 Hz and has a Copy button (clipboard API
   with an execCommand fallback).
   A **Speed slider (0.05–1×)** scales
   sim steps per frame via a fractional accumulator (0.05× really is 20×
   slower); drop it right at the Dream switch to watch the crossover in
   slow motion — every model tracks reality for a while, then diverges
   at its own pace. Survives Reset; verified 231→24 steps/s at 0.10×.
   MANUAL TRAINING LIFECYCLE: the attractor runs fully dynamic while
   all four models watch predict-only (normalization calibrates on real
   attractor data during idle — a 250-sample washout gates the Dream
   button only); **Start training ▶ / ⏸** opens and closes the training
   window at will, a **Training window slider** (log scale 0–20000,
   default 1800; measured knee ≈ 800 — full Λ from ~550 trained
   samples, dead flat to 20000) sets the target, and an **auto-dream
   checkbox** fires the Dream itself the moment the window is reached
   (training stops first, so the wake stays stopped; a manual dream
   taken mid-training resumes training on wake). lzTrainedN counts ONLY
   actually-trained samples — idle, washout, and post-dream re-entry
   never count — and the ESN/MLP train in exactly the same window
   (reservoir/lag state stays live while idle, weights don't move).
   Verified: idle trains nothing, slider maps log-style (47→200),
   auto-dream fires within a few samples of the window, stop freezes
   the count while the attractor keeps running. A **Trained row** shows
   trained samples AND Lyapunov times (N/55.2; the window label shows
   its Λ equivalent too), and a **Sim rate row** shows the measured
   steps/s + Λ/s — the Lorenz sim is FRAME-RATE COUPLED (4 steps per
   display frame × Speed slider, each step dt=0.02 model time; ~240
   steps/s on 60 Hz, ~480 on 120 Hz, headless CI ~175): per-sample math
   means refresh rate changes wall speed only, never results),
   **② soft-sensor** (drag/kick the blue motor; a soft lightly-damped coupling
   makes the hidden load lag and ring. THE PLANT IS DELIBERATELY NONLINEAR —
   a textbook linear plant is precisely where a Kalman filter is provably
   optimal, so the old demo was showing the learner at its worst. Added:
   **Stribeck friction** on both masses (stiction 0.9 / 0.20 breaking away to
   Coulomb 0.55 / 0.12 at Stribeck velocity 0.05 / 0.04 — the canonical
   unmodelable term), **backlash** ±0.02 in the coupling (inside it NO force
   is transmitted and the load free-flies), a **hardening spring**
   f = k·d + 35·d³ (which is also what breaks the algebraic shortcut),
   **cogging** ripple 0.55 at spatial period 0.22 (a deterministic function
   of motor position no linear state model can carry), and **encoder
   quantisation** 0.002 on the measured motor position. The autonomous drive
   was softened to 3.6/1.5/0.9 because the cubic spring transmits far more
   force at large deflection and was pinning the load against its end stops
   (18% → ~11% of samples). Plant-health counters (backlash-engaged,
   Stribeck-regime, end-stop fractions) are exposed and ASSERTED, so a future
   edit cannot silently neutralise the nonlinearity and revert the demo to a
   linear plant. THE SENSOR NOW USES THE LIBRARY'S **UNIVERSAL MAP** (bias +
   linear + quadratic + ReLU + Fourier, structured prior {lin 100, quad 1,
   rand 1}) on a 4-lag × stride-6 window: 16 base terms → 169 features,
   ~85 µs/sample (~2% of a core). Measured on the nonlinear plant: lean
   LINEAR features 0.037, universal map **0.018**; a 6×5 window (341
   features) is 4× the cost and WORSE (0.025) — more basis than the data
   supports is just variance. THE COST IS DATA: the 169-feature basis ties
   the filters for the first ~1200 adapt samples (~10 s) and leads by 2–5×
   from then on, so the regressions assert the win on a SAMPLE COUNT rather
   than at a wall-clock moment. Measured live once trained: NGRC 0.008 vs
   exact-linear KF 0.021 / engineering KF 0.026 / algebra 0.026 / lag filter
   0.135, and up to ~9× while the operator is dragging, where the
   nonlinearity is most excited. Amber `SoftSensor` caret vs a green
   **KALMAN FILTER** caret — the FAIR baseline, since for a linear plant the
   Kalman filter is the OPTIMAL state estimator and the old auto-tuned
   lag-filter bank was a straw man (it stays in the rows for scale only, and
   is off the stage). Four states (x₁,v₁,x₂,v₂) propagated by the plant's own
   semi-implicit integrator, driven by the known force, corrected by the
   measured motor position (C = [1 0 0 0]), symmetrised covariance, state
   clamped to the travel limits. TWO versions, and the pair is the whole
   point. On the LINEAR plant the EXACT filter was an ORACLE — measured
   **0.0000** nRMSE, exact to numerical precision, because a noiseless
   observable linear plant is precisely what a Kalman filter solves. On the
   NONLINEAR plant it is no longer an oracle at all (~0.021): it is merely
   the ceiling for a linear model, since it cannot represent friction,
   backlash, the cubic spring or cogging. That change is the entire point of
   making the plant realistic. The ENGINEERING filter carries the model a
   practitioner actually has: **masses and spring stiffness exact** (off the
   datasheet / CAD) but **friction and damping NOT MODELLED AT ALL**
   (b₁ = b₂ = c = 0), because nobody has those numbers on a real machine.
   Its noise settings are TUNED by sweep (q 1e-9…1e-1 × R_f 1e-6…1e1;
   shipped q 1e-5, R_f 1e-1) — untuned it scores 0.062 and would have been a
   fresh straw man, since raising the process noise is exactly how an
   engineer makes a filter lean on its measurements instead of on dynamics
   it does not know. Tuned it lands at ~0.017 against the learner's ~0.003.
   The headline row is NGRC vs the ENGINEERING filter (like-for-like:
   neither was given the damping) and it renders "N× worse" honestly if the
   learner loses. The forecast row is scored
   against the exact filter's OWN 1 s prediction — its state estimate rolled
   forward on a HELD input, since the operator's future force is unknowable
   to it too — and the learner WINS there (~1.2–1.9× live), because it has
   learned how the drive and the drags actually evolve instead of assuming
   the force is constant. Measured offline on a realistic drive/drag/kick
   stream: estimate 0.0000 (exact KF) / 0.0051 (learner) / ~0.017
   (engineering KF); 1 s forecast 0.1685 / 0.2081 / ~0.25 — but DURING A
   DRAG 0.2495 / 0.1756 / ~0.34, where the learner beats even the exact
   filter.
   A **MANUAL-MODE BIT** is routed as a fifth signal — whether the machine
   is running its program or being jogged by hand, which any real controller
   knows and which costs nothing to route. Given it, the model learns a
   distinct and appropriately humble response instead of extrapolating its
   program-mode map over an operator who moves far faster and more randomly
   than any drive. Measured LIVE under an identical scripted session, with
   CUMULATIVE per-regime errors (not the EWMA meters — read at one instant
   those reflect whatever the plant happened to be doing, which is why the
   earlier live A/Bs disagreed with each other): estimate 0.024 → 0.017
   autonomous and 0.111 → 0.065 manual; the 1 s forecast 0.901 → 0.735 in
   manual, which FLIPS it from losing to the exact-linear Kalman (0.97×) to
   beating it (1.20×). The autonomous forecast is unchanged (0.249 → 0.245)
   and still LOSES to that filter by ~1.37×: under the gentle autonomous
   drive the deflections are small, the plant is close to linear, and a
   filter holding the exact linear terms forecasts it well — an honest split
   worth keeping visible rather than tuning away.
   THE SAME BIT WAS OFFERED TO THE KALMAN FILTERS as a mode-dependent
   process noise (the standard engineering response). Swept over five
   decades it made them monotonically WORSE, so they do not use it; a linear
   filter has no mechanism for a regime switch short of an
   interacting-multiple-model design. The summary states that asymmetry.
   ARCHITECTURE, MEASURED AND REJECTED for the 1 s forecast: a TWO-STAGE
   design (`Continuous` + `directHorizons` forecasting the whole measured
   lag window at horizons 82/88/94/100, then pushing that predicted window
   through the sensor's own map) scores 0.155 against the direct readout's
   0.156 — identical; and a CONTROLLER LOOK-AHEAD (the commanded force at
   t+1 s, what a motion-controller look-ahead buffer actually holds) scores
   0.159, i.e. nothing, because this drive's phase is already recoverable
   from history. The reason nothing helps is the CEILING: batch least
   squares fitted offline on the TRUE plant state AND the future command,
   with quadratic features, scores 0.133 — the shipped readout is at 1.17×
   that. What is left is the plant's own unpredictability, which is exactly
   what stick-slip and backlash buy you a second out.
   ALL MODELS NOW READ THE **COUPLING FORCE** (f = k(x₁−x₂) + c(v₁−v₂)) as a
   fourth signal — what a load cell or torque transducer on the shaft gives
   you. It helps the learner 2× (estimate 0.0101 → 0.0051) and the Kalman
   filters take it as a second measurement row. But it carries the hidden
   state: since k ≫ c, **x₂ ≈ x₁ − f/k**, and that ONE-LINE ALGEBRAIC
   SHORTCUT — no model, no learning — scores **0.0175**, better than the
   untuned engineering filter. So it is shipped as its own reported baseline
   (row + on-stage text) rather than left implicit: adding a sensor that
   nearly solves the task and then not saying so would make every other
   number on the page look better than it is. The learner still wins, ~6×
   over both the engineering filter and the algebra. A first attempt at this baseline scored the exact filter at 0.132
   and was WRONG (missing covariance symmetrisation and no state clamp); the
   tell was that theory says it must be near-exact, so it was debugged
   against a numerical Jacobian and a clamp-free stream rather than shipped.
   A dedicated regression now asserts the exact filter really is an oracle
   (< 1e-3) and the identified one really is degraded, so this baseline can
   never silently rot back into a straw man. Plus a 5-trace Plotly chart.
   Plus PREDICTIVE soft-sensing (finger-tab
   payback): a violet hollow dashed "+1s" caret previews where the load
   WILL be in 1 s. It is now a **SECOND TARGET of the same `SoftSensor`**
   (SS_PREV_H=100 samples) rather than a hand-rolled readout on its own
   25-term linear basis: target 0 is the load NOW, target 1 the load in
   1 s, and the block's 169-term universal-map expansion is computed
   ONCE per sample and shared, so the forecast costs one extra RLS
   update and NO extra feature expansion. The block owns the map, the
   frozen standardisation, the structured prior, the weights and the
   output clamps (±2.05, the travel limits — the Kalman filters are
   clamped the same way); only the PAIRING is local, because
   `SoftSensor.adapt()` can express a contemporaneous pairing only.
   Feeding a horizon needs features from H samples ago against the
   target that has just arrived — exactly the `featRing` mechanism
   `Continuous` already uses for `directHorizons`; `SoftSensor` has no
   equivalent yet, so the ring lives in the page. (Adding
   `directHorizons` to `SoftSensor` — ~15 lines mirroring `Continuous`,
   opt-in and default-off — would move it into the library; not done,
   because it touches a port with golden-vector parity tests.)
   NOTE `estimate()` is deliberately NOT called: it recomputes the
   feature vector internally, which would double the cost and lose the
   whole point of sharing the expansion. Measured live at MATCHED
   training age, the bigger basis is WORSE early and BETTER once
   trained — 0.096 vs 0.059 at age 500 and 0.143 vs 0.074 at 1500, but
   0.041 vs 0.056 at 3000, 0.186 vs 0.216 settled, and 0.235 vs 0.256
   while interacting (excluding the first cycle, where the error meter
   itself has just restarted in both builds); the advantage over the
   Kalman forecast goes 1.05× → 1.26×. So the WARM GATE was raised
   300 → 2500 trained pairs, placed past the crossover so the displayed
   forecast is never the worse of the two — the cost is that the violet
   caret appears ~25 s in rather than ~3 s, stated live as
   "warming N/2500". Scored OUT-OF-SAMPLE:
   each prediction is stored at make-time and judged when its target
   arrives, before that pair trains. Baseline: **persistence** ("the load
   stays put"), the standard honest forecasting reference — a ringing
   load makes it genuinely bad. MANUAL SWITCHOVER: the sensor trains
   (adapts toward truth) until the user locks it — the 🔒 button stays
   disabled through calibration and until minimally ready (≥400 adapt
   samples, "minimally ready ✓" in the Mode row), then "Switch to
   estimation 🔒" freezes the sensor readout, the preview readout, AND
   the lag-filter bank's truth-peeking auto-tune selection;
   "Resume training ▶" toggles back, Reset re-calibrates. Recent-error
   meters restart at every switch so scores judge the current mode only
   — the point: excite the plant fully (or don't) before locking and
   see what showing it the full dynamics was worth (verified: locked
   after gentle-drive-only training, the estimate generalizes — near-
   linear plant — but the frozen preview drops to ~1× vs persistence
   on unseen kicks/drags). Rows: "Preview +1 s (NGRC)" /
   "Persistence +1 s" / "Preview advantage"; chart trace "preview (made
   1 s ago)" aligned at its target time. ON-STAGE VERIFICATION: a solid
   violet "made 1s ago" caret (upper row, drop-line to truth) is the
   matured prediction landing NOW — glued to the block = the preview
   came true — plus preview/persistence meter bars in the same visual
   language as the sensor pair, with their own ×-better readout.
   PREVIEW WINDOW — A REVERTED "FIX" (v91 → v92), kept here because the
   method mistake matters more than the code. v91 widened the readout's
   history window from 0.26 s (6 lags × stride 5) to 3.3 s (12 × 30) to
   match the load's ~2.8 s ring period, added the sensor's OWN estimate
   as a 4th input signal, switched to delta targets and lightened the
   ridge. Offline over 24k samples of a stationary trace it looked like
   a 3× win (drive 0.212 → 0.070 nRMSE, kicks 0.247 → 0.084). **The
   user reported it was way worse, and it was.** A live A/B harness
   (`scratchpad/ss-ab.mjs`: identical scripted interaction — 6 cycles of
   drag + kick — driven against each build) measured, on the metric that
   matters, the INTERACTING regime: short window 0.338 nRMSE / worst
   cycle 0.42, long window 0.486 / worst cycle **1.02**, and a
   1 s-window variant 1.019 / worst **3.99**. Cause: real use is short
   abrupt regime switches (drag → release → kick), not a stationary
   drive; a 3.3 s memory carries stale context across the switch and the
   delta base (anchored on the sensor's estimate) amplifies it. Reverted
   to the v90 configuration exactly — 6 lags × stride 5, 3 signals,
   absolute targets, iv 10 — re-measured live at 0.361 / worst 0.514 /
   settled 0.205, i.e. v90 within run noise. THE RULE: optimize in the
   regime the thing is actually used in; an offline sweep on a
   stationary trace is not that regime.
   PREVIEW, PROPERLY DIAGNOSED (v93). The revert removed a regression
   but fixed nothing, so the readout was measured instead of tuned, on
   a realistic drive/drag/kick stream (`scratchpad/ss-diag*.mjs`). Two
   reported symptoms, two findings, and they are not what they looked
   like. (1) The "bias" is not an offset — the bias weight is 0.010 and
   the amplitude is right (shrinkage 0.97). It is a LEAD DEFICIT: the
   issued forecast best correlates with the truth at 90 samples, not
   the 100 it is trained for, so it predicts 0.90 s while claiming
   1.00 s, which reads as the caret sitting short whenever the load
   moves. (2) The jitter is real — the forecast is 2.27× rougher than
   the load itself. BUT BOTH ARE PROPERTIES OF THE OPTIMAL PREDICTOR,
   NOT DEFECTS: batch least squares fitted offline on the TRUE plant
   state (x₁, v₁, x₂, v₂, u) shows the SAME lead 90 and the SAME 2.23×
   roughness, because shrinking and staying rough is what least squares
   should do when part of the target is unknowable. That oracle scores
   0.215 nRMSE; the shipped online readout scores 0.208 — it is AT the
   linear ceiling, so there was never anything to win in steady state.
   THE REAL DEFECT WAS THE TRANSIENT: a fresh readout ran at 0.49
   against a converged 0.20, and every session starts there, so the
   transient is the whole user experience. Fixed by a WARM GATE — no
   forecast is displayed or scored until the readout has genuinely
   trained (300 updates, not the previous 40, which was the middle of
   the RLS excursion); the row reads "warming N/300" so the gate is
   stated rather than hidden. Measured live at MATCHED training age:
   0.899 → 0.423 at age 500, 0.423 → 0.362 at age 1200, tied by 2500.
   Rejected with data, all of them: input standardisation (moving stats
   under an exact-RLS fit are strictly worse than none — bias +0.29;
   frozen stats merely tie the gate and cost converged accuracy
   0.196 → 0.206); a predict-only washout (a washout protects against
   statistics that MOVE, and with no standardisation nothing moves —
   measured 1.52 fresh, 3× worse, so the Lorenz-tab analogy does not
   transfer); averaging a ladder of horizons (roughness 2.27× → 1.28×
   but error 0.208 → 0.251, proving the roughness is signal); output
   low-pass (0.208 → 0.280, and it eats the lead); forgetting and
   directional forgetting (neutral to worse); ridge strength (flat);
   declining to train on pairs whose horizon overlaps a touch — the
   "don't learn the unlearnable" idea — which barely helps the drive
   (0.230 → 0.216) and wrecks the drag (0.180 → 0.436), so those
   targets are partly learnable after all; and POLY 2, the library's
   signature expansion, which this readout has never used: batch liked
   it (0.197 → 0.185) but online the 19 → 190 feature jump is
   catastrophic (fresh 2.02 drive / 5.91 interacting) and worse even
   converged, at 24× the CPU.
   A MEASUREMENT LESSON worth as much as the fix: the first live A/B
   read its meters at fixed WALL-CLOCK times, so builds landed at
   different training ages and different phases of the drive — its
   persistence baseline swung 0.58 → 1.09 between runs, which is a
   property of the trajectory and of no model. It could resolve the v91
   regression (a 3× effect) but reported this change as a regression
   when it is an improvement. `scratchpad/ss-ab2.mjs` gates every read
   on training age instead; compare builds at matched age.
   The honest remaining limit stands and is now quantified: during a
   drag the future input is unknowable by construction, so the ~2.8×
   interacting advantage is near the ceiling while the autonomous-drive
   advantage is ~7×. One unexploited lever remains — a long history
   window infers the deterministic drive's phase and is worth ~10%
   offline-converged (0.208 → 0.190) — but it is exactly what v91
   shipped, and it is unsafe in the transient, so it stays out.
   An **Experiment summary** block below the chart mirrors the Lorenz
   tab's (6 sections, Copy button, 1 Hz refresh, same BLACK-BOX
   contract — plant/signals/baselines/grading fully specified, the
   experimental model's internals withheld and stated as withheld). It
   documents both tasks (present-time estimate, 1 s forecast), both
   baselines — the exact and identified Kalman filters (stated plainly
   as oracle vs like-for-like), the lag filter's truth-peeking
   advantage, and persistence — the lock protocol, the warm gate, and
   the out-of-sample scoring rule), **③ finger-trace** (draw loops at ~20 Hz
   sampling; an optional **tracing guide** selector overlays one of 10 faint
   stencil shapes — circle/ellipse/square/triangle/hexagon/star/figure-8/
   heart/rose/lissajous — purely visual, never read by any model, default
   none; amber NGRC ghost vs a gray **analogue k-NN** rival (Lorenz's
   method of analogues: ONE COHERENT tracked match — nearest past
   (position, stored-EMA-velocity) moment of the multi-stroke log, advanced
   in lockstep each sample, re-locked only on 3× hysteresis or running out
   of displayed future, with BEST-EFFORT eligibility (require the
   displayed horizon of recorded future when the memory has it, else as
   much as the memory allows — a short memory at a long slider setting
   used to leave no eligible match and the gray ghost collapsed to the
   straight-line fallback ray) — serves the whole rung ladder: pred(h) =
   past[j+h] + (now − past[j])·0.88^h — the current match offset DECAYS
   onto the replayed path with the SAME schedule the NGRC path ghost
   uses (carrying it undamped to every horizon hurt the analogue at
   long rungs and quietly inflated NGRC's on-path advantage); targets
   ±1-sample smoothed. Per-rung independent
   argmins under real finger tremor picked DIFFERENT past laps per rung and
   the ladder zigzagged into scribble. It replays pen lifts too (exact
   brkAt flags from the history's own lift markers); straight-line survives
   only as its cold-start fallback, fallback rungs are excluded from the
   analogue's score, and the drawn gray ghost is the analogue's FULL
   per-step replayed segment out to the slider horizon (nulls at
   replayed lifts), not sparse rung chords. Head-to-head scoring is PAIRWISE: the SHOWN ghost and the
   analogue are judged on the same prediction instances, only on rungs the
   ghost actually displayed — anything else poisons one side with warmup
   the other never served), plus a cyan **ESN benchmark** (echo state
   network — the classical recurrent NN that NG-RC was designed to
   replace, the canonical rival of the NG-RC literature: N=100 sparse
   reservoir, spectral radius 0.9 via power iteration, leak 0.3, input
   scale 0.3 — tuned offline, response flat around this — driven by the
   SAME 4-var state stream; per rung a [1, state, reservoir] readout
   trains online by shared-P RLS λ=0.9995 on the same direct targets.
   ESN rows: its own miss + a "NGRC vs ESN" ratio that is LIKE-FOR-LIKE
   — the library's raw DIRECT readout vs the ESN (same inputs, targets,
   RLS; only features differ), gated only on the ESN readout being warm
   (>40 trainings). The SHOWN ghost is deliberately NOT the ESN's
   opponent: once locked it is the phase-domain pipeline whose
   structural prior ("this is a loop") the ESN was never given — that
   pipeline fairly races the kNN ("Ghost vs kNN" row: both exploit
   repetition), and the row tooltips state the attribution. A green
   **raw AFM** trace shows the autopilot brain WITHOUT the shape-lock
   scaffolding in both modes: in prediction it free-runs from the
   finger's own last states out to the slider horizon (manual
   predict-only rollout with a light history save/restore — θ/P are
   untouched, so no snapshots; escape watchdog ends the arc; ~0.3 ms
   per sample in the AFM CPU bucket), and during autopilot it free-runs
   as a rival trail whenever it is NOT the deployed model (when the AFM
   itself deploys, the amber trail IS the AFM — no duplicate). Verified
   visuals: on a circle the green arc rides the loop (the attractor
   training holds shape without scaffolding); on multi-stroke patterns
   it slides off the stroke and curls (a free-run cannot teleport) —
   the honest contrast justifying the path-replay deploy; cyan ghost capped at warm rungs ≤ ~1.2 s like every
   point-forecast family; ESN trace in the chart; its own CPU bucket
   (~1% of a core); freeze halts its training; Reset re-inits it.
   During **Autopilot the rivals race live**: the kNN replays its
   recording from the nearest (position, velocity) match — pen lifts
   included, re-matching when the recording runs out — the ESN
   free-runs a 1-step full-state readout (trained online alongside the
   rung readouts) from the current reservoir state, clamped, with an
   escape watchdog (the shared reservoir is snapshot-restored on
   stop), and the MLP free-runs its own 1-step head the same way.
   Verified visuals: on a circle the ESN dream contracts into a
   smaller drifting orbit (classic 1-step rollout decay) while the
   replay rides the recorded tremor; on multi-stroke patterns the
   replay lifts the pen and the ESN parks near one stroke (a free-run
   cannot teleport — same lesson as the AFM).
   Measured human-realistic steady state: NGRC ~1.1–1.2× better than
   the ESN at every horizon — the published NG-RC claim, live: a
   105-weight-per-rung polynomial model edging a 100-neuron reservoir
   at a fraction of the compute), plus a magenta **MLP benchmark**
   (a plain feedforward net — the NN everyone learns first, added as a
   reference for people who know ML but not reservoir computing: one
   32-unit tanh hidden layer on a 2-lag input window ([s(t), s(t−1)] —
   the SAME information NGRC's features are built from), a 2-output
   linear head per rung + a 4-output 1-step head, trained ONLINE by
   single-sample Adam (lr 3e-3) + experience replay — 8 random
   (moment, rung) pairs per sample from a 1200-sample state ring;
   without replay an online net forgets each rung between visits and
   lands 2–3× worse (offline sweep; response flat around this config,
   which matched the NGRC direct readouts on a human circle and edged
   them on a two-line pattern). Page rows: "MLP (feedforward NN)
   miss" + a like-for-like "NGRC vs MLP" ratio vs the raw DIRECT
   readout (same convention + warm gating as the ESN row, >40
   trainings per rung, pairwise same-instance scoring); magenta
   rung-sparse ghost, chart trace, its own CPU bucket (~1% of a core
   while drawing), freeze halts its training AND its replay-ring
   growth (frozen play must not seep into training data — but the
   prediction's s(t−1) lag comes from a freeze-immune slot, since a
   stale ring lag would degrade frozen predictions the way a frozen
   reservoir state would have degraded the ESN's), Reset
   re-inits it. During Autopilot it free-runs its 1-step head as a
   magenta rival trail — the net is stateless, so a rollout is pure
   forward passes and nothing needs snapshot-restore on stop; same
   loop-mean anchor, clamp, and escape watchdog as the ESN. Measured:
   ~1.1–1.2× behind NGRC direct at the probed rungs — honest
   same-league performance, which is the point of the reference),
   with a
   **ghost-horizon slider (0.2–20 s, geometric rungs, default 10 s)** — a
   25-rung ladder of the library's **direct multi-horizon readouts**
   (`directHorizons`) trains continuously (the original 21 rungs 4..208
   kept verbatim + 4 appended to 417 samples ≈ 20 s), so the slider needs
   no refit and the chart plots miss-vs-horizon curves over the whole
   range (dotted marker = slider). HONEST TRACES: the amber path arc
   draws the full per-step forecast to the slider horizon (no lap cap —
   wrapping the loop IS the prediction, so 5 s vs 20 s visibly differ);
   rung-sparse ghosts (ESN, MLP, fallback families) draw through midpoint
   quadratics and are validity-limited (warm/scored rungs), never
   arbitrarily capped; autopilot rival trails get the SAME 3-pt kernel
   AND the same alpha ramp as the amber trail. Because a wrapped loop
   re-inks the same pixels (raw length is invisible on a circle), the
   amber arc carries a TIME RULER — a dot every 1 s of forecast — plus
   a tip label ("10.0s ·×3.1 laps") and an alpha fade along the
   horizon; the gray replay arc gets one 3-pt smoothing pass (recorded
   tremor read as jagged ink; never smoothed across lifts). A rung can only score once its horizon
   of future has been drawn — the 20 s rung populates after ~21 s of
   drawing (physics, not a bug). Two scoring-pipeline fixes shipped with
   the extension: a dwell pause no longer flushes the pending queue (it
   silently discarded every long-horizon prediction whenever the finger
   hesitated ~0.5 s), and pend entries advance independently per rung
   (strict FIFO made every rung inherit the longest rung's 422-sample
   latency). Also: within the multi-stroke log, only EXPLICIT lift flags
   create lap gaps — `distJumps: false` — because an unflagged spatial
   jump mid-stroke is a loaded-frame sampling artifact (the finger was
   down; it did travel that path) and bridging it beats a phantom pen
   lift (commissioning's flag-less log keeps distance-based jumps). After ~8 s of doodling the ghost goes
   **path-locked** — the phase-domain rethink: a doodle factors into a PATH
   (kept as a fresh resampled loop, refreshed every ~1 s, first-peak
   autocorrelation for the lap length) traversed at a PHASE RATE, so the
   finger's phase is tracked PLL-style on the loop and an NGRC readout
   (library `rls`/`predict` primitives on lagged speed + phase-Fourier
   features) learns the tempo-vs-phase profile — you slow at the same
   corners every lap. Prediction = advance phase along the loop (transverse
   offset decays on), so it lands ON the future stroke by construction.
   Per-rung best-of (rolled / direct / path-locked, judged by live-tracked
   misses) is what the ghost draws. The **on-path miss** stat (untimed:
   distance from the prediction to the stroke actually drawn over the
   horizon) scores the shown ghost against the analogue. Honest
   human-realistic steady state (jitter + tempo random-walk, measured
   headless): the race is TIGHT — at 1.2 s the analogue is slightly
   ahead (its velocity-matching picks analogues at the current tempo);
   at 10 s NGRC wins (~1.2× timed, ~1.4× closer on-path, ~2× less
   error energy). On metronome-perfect machine traces the analogue is
   near-optimal by construction — don't panic-tune against that
   regime. Sub-10× ratios display with one decimal. A **CPU load** row
   (refreshed each second) splits main-thread time as % of one core:
   AFM (cyclic pump + autopilot stepping + commissioning) / kNN (the
   analogue baseline) / ESN (reservoir + readout training) / MLP
   (feedforward training + replay) / app (everything else in the frame
   loop). Typical while drawing: AFM ~20% (the pump's designed
   3 ms/frame budget), kNN ~0.1%, ESN ~1%, MLP ~1%, app ~10%.
   An **Experiment summary** block below the chart completes the set (all
   three tabs now have one): 6 sections, Copy button, 1 Hz refresh, same
   BLACK-BOX contract — the task, the signals, all three baselines and both
   grading rules fully specified, the experimental model's internals withheld
   and stated as withheld. It is the most different of the three because the
   "plant" is a HUMAN: no equations, non-stationary, with tremor, drifting
   tempo and pen lifts, so the SYSTEM section describes the sampling cadence
   and arc-length resampling instead of dynamics, and states that the stencil
   guide is never shown to any model. It reports the live rung (following the
   horizon slider), the lap-lock/autopilot/freeze state, and both measures —
   the TIMED miss and the ON-PATH miss — against all three baselines, noting
   that a metronome-steady machine trace flatters the analogue by
   construction. Before enough has been drawn it says so plainly rather than
   printing zeros.
   The resample step is clamped to [0.03, 0.05]: the floor keeps slow
   careful stencil-tracing from drowning the fit in ridge (tiny deltas)
   or blowing the fit window past one lap. Iterating the 1-step model
   compounds its error, a known-poor mode shown explicitly as a third series —
   and the model state uses the EMA velocity, not the raw one-sample diff,
   so finger tremor isn't a prediction target. Plus **Autopilot**: with brain=auto
   and a locked path it deploys INSTANTLY as a **path-locked replay** — the
   phase-domain engine draws the user's own stored loop at their learned
   tempo (crisp corners, exact geometry, cannot decay) while the
   straight-line "autopilot" is a dashed ray off-screen. The AFM brain now trains **continuously (cyclically)** in the background
   over the locked loop (~3 ms/frame budget, noise-hardened) — the
   library's continuous-training idea — so brain=AFM deploys **instantly**
   from the always-warm model (fallback: commissioned on demand when no
   loop is locked). The cold-start fallback is a short AFM-only sweep: the drawn path is arc-length-resampled to
   constant speed (kills the stall fixed points that corner dwells/tremor
   teach), then candidate brains — three variants of the library's **AFM
   universal map** (ReLU+Fourier, boosted `rand` prior — the default
   `rand=0.001` ridges the shape-carrying features out — with noise-injected
   replay so the doodle becomes a true attractor) (the single autopilot brain — the selector was removed) — are each free-run
   5000 steps with an anti-stall watchdog and scored on early/mid/late
   windows (shape = radius-histogram cosine **+ angular-profile cosine**;
   the radius histogram alone is blind to a lobe covering a star's radius
   range). The winner deploys by **snapshot-restore**: the runtime replays
   the *verified* orbit from its start and a watchdog restarts it at the
   verified horizon (5000/2400/1000 steps, whichever window stayed ≥75%
   faithful) or on escape/divergence — so the doodle never decays, ever.
   Winner runs as its own model; the online ghost predictor is never
   replaced. Verified headless: square/triangle/star/fig-8/circle at
   human and machine tempos, ≥75 s each, star arms intact throughout.
   A **Freeze ❄️ / Unfreeze ▶** button halts ALL learning — the online
   ghost model steps predict-only, the tempo-readout RLS pauses, the
   stored loop stops refreshing, the cyclic AFM pump stops feeding, AND
   the kNN's replay memory (fgAbs) stops growing and cannot be wiped by
   the relocation rule (the memory IS the memorizer's model; a stray
   frozen touch far from the doodle used to erase it while the
   AFM/ESN kept their weights) — while predictions, the ghosts, and
   Autopilot keep working, so the model can be played with without
   being affected. A small LIVE ring (fgLive, freeze-immune pure state)
   seeds the green AFM ghost so it always free-runs from the finger's
   NOW. The ESN's autopilot free-run anchors at the locked loop's mean
   (its state is centroid-relative; anchoring at the last stroke's
   centroid drew a correct shape in the wrong place after a stray
   touch). The brain row shows
   "training FROZEN ❄️" vs "training live"; Reset brain also unfreezes.
   **Disjointed (multi-stroke) doodles** — e.g. two vertical lines drawn
   alternately with pen lifts — are a first-class pattern: the lap is the
   strokes PLUS the teleports. A persistent multi-stroke log survives
   lifts (a REAL lift = a gap marker — ≥150 ms up or landing >0.05 away;
   a touch SKIP is bridged, and a flagged step that doesn't teleport
   >0.06 is ignored by `resamplePath`, else phantom gaps hijacked a
   circle's AFM deploy into path replay with a stall hole; the
   path-replay deploy also demands ≥2 recent lifts so one stray marker
   can't hijack it. A >3 s pause or a restart >2.5× the doodle's span
   away = a fresh doodle), `resamplePath` carries
   explicit break flags and returns gap indices, and lap detection uses
   mean-centered x+y autocorrelation (x-only was blind to vertical
   strokes AND locked onto multi-lap harmonics). The locked loop stores
   its gap set: never interpolated, smoothed, or seam-bridged across;
   the phase stays pinned to the stroke end until it crosses the gap
   index (so the visual jump and the pen-lift flag land on the same
   render segment); the phase forecast marks crossings so the ghost
   LIFTS and lands on the next stroke; and scoring survives pattern
   lifts (and the analogue baseline replays them, so the ghost race is
   fair across strokes).
   Autopilot on a gapped lap deploys instantly as **path-locked replay**
   (an AFM free-run cannot teleport) drawing each stroke with a real
   pen-up; the cyclic AFM pump feeds predict-only across teleport steps
   so they never train. Verified headless: 2-line and 1-line lift
   patterns lock with gaps and replay cleanly, continuous shapes stay
   gapless with instant AFM deploy, far relocation still resets), and
   **④ anti-slosh axis** — an industrial liquid-handling machine, and
   the first tab whose experimental side is mostly CLASSICAL control: the
   value is in what the single sensor is made to say. FOUR IDENTICAL MACHINES
   run the SAME command so the comparison is a controlled experiment rather
   than a before/after, and each step differs from the one above it by exactly
   ONE thing, so what each is worth can be read off separately: red **control**
   (no anti-slosh at all — the raw trapezoidal move through the same PD loop
   and the same textbook feedforward; the machine before anyone addresses the
   liquid), violet **hybrid** (THE RETROFIT — the conventional controller
   COMPLETELY UNTOUCHED with a learned additive force trim bolted on top, the
   configuration available when the shipped controller cannot be recertified),
   gray **conventional** (3-impulse ZVD shaper tuned once
   at the nominal 0.12 m fill, PD loop Kp 4200 / Kd 260 / 260 N limit, textbook
   feedforward M·a + B·v + Fc·sign(v) with M identified at that same fill —
   the correct textbook design, NOT a strawman; it is wrong everywhere else
   only because the load moves underneath it) vs amber **experimental** (same
   loop, same shaper family, same three feedforward terms; it differs only in
   reading the fill and the resonance off the SAME single gauge and retuning
   both). Plant: the standard equivalent-pendulum slosh analogue COUPLED to
   the carriage (the liquid pushes back), ω₁ = √(g(π/L)tanh(πh/L)) moving
   **1.8× across the fill range** against the ~±20% a ZVD tolerates, sloshing
   mass fraction (8/π³)(L/h)tanh(πh/L), Stribeck friction (9 N stiction → 5.5 N
   Coulomb at 0.02 m/s, viscous 12 N per m/s), cogging 3 N at a 0.05 m spatial
   period, and **wave breaking** past the freeboard. The ONLY liquid instrument
   is one downward gauge at xr=0.18 reading mean depth PLUS the local wave with
   no way to separate them from one sample — off-centre because the first mode
   has a **node at the tank centre**, a commissioning requirement rather than a
   detail. MEASURED LIVE, and it reproduces the mirror: at the fixed shaper's
   OWN design fill both machines carry an identical shaper, so the difference
   there is the feedforward alone — 0.31 vs 0.17 mm, against the mirror's
   0.323 → 0.188; at fill 0.05 m the three-way ladder measures **30.30 mm with
   no anti-slosh → 8.78 conventional → 0.87 experimental** (10× better than
   conventional, **35× better than no anti-slosh**), and the whole session
   3.25 vs 1.37 mm conventional-vs-experimental (2.4×, which INCLUDES the
   experimental machine's startup moves before it has seen any wave to tune
   from — both numbers are shown, labelled). Following error 1.71 / 1.35 mm,
   matching the mirror's ~1.5 mm scale. Only the RIGID mass is scheduled:
   scheduling on TOTAL liquid mass measured WORSE than freezing it (0.446 vs
   0.323 mm), because the sloshing fraction does not ride rigidly and the
   surplus acceleration re-excites the mode the shaper just cancelled.
   **Health check ▶** runs a deliberately UNSHAPED probe move, because a
   well-shaped move leaves no wave to measure — success at control removes the
   observability diagnosis needs, which is a general tension and not a quirk.
   The probe feeds a **vote-of-three fault panel**: the gauge's slow level, the
   wave's resonance and a load cell are three independent routes to one fill,
   so the CONSENSUS is the real fill change and each channel's DEVIATION names
   what moved (leak / gauge drift / mount / density, plus friction from the
   axis fit). Independent threshold tests, never an if/elif chain — a chain
   reports exactly one fault by construction and simultaneous faults are the
   point. Five injectable faults and any PAIR of them; the conventional
   following-error alarm stays silent throughout, because the position loop
   absorbs the fault into control effort. THREE THINGS HAD TO BE MEASURED
   INTO SHAPE before the panel worked, none of which a passing assertion would
   have found: (i) the PROBE NEEDS A LONGER SETTLE WINDOW (8 s, not the
   production 2.6) — a loosened mount or a leak LOWERS the resonance to a
   ~1.3 s period and the production window holds barely two zero crossings, too
   few to fit, so the panel reported "no usable wave" for precisely the faults
   it exists to name; (ii) FRICTION HAD TO BE MADE IDENTIFIABLE — over one move
   the carriage cruises at a nearly constant velocity, so `v` and
   `tanh(v/ε)` are collinear and the viscous/Coulomb SPLIT is arbitrary: the
   fitted Fc came back **−0.12 N against a true 5.5**, and a leak's mass change
   then leaked into it and raised a false lubrication alarm. The resistive
   force at the cruise velocity, B·v_max + Fc, is identifiable even when the
   split is not, and it now recovers the injected fault almost exactly
   (**9.83 N measured against 9.9 injected**, healthy 0.01, and 0.04 under a
   gauge fault — no cross-talk); (iii) DENSITY IS TESTED AS A DENSITY, not as a
   fill-equivalent — a density change displaces mass in proportion to the fill,
   so a fixed fill-equivalent threshold silently stopped detecting it in a
   half-empty tank (the mirror's own limitation, avoidable here). Comparing the
   implied density m_liq/(A·h_consensus) is fill-independent by construction
   and recovers **0.794 against an injected 0.78**.
   A FOURTH thing had to be compensated rather than thresholded: a mount fault
   ALONE drives the friction residual to 3.49 N at the nominal fill (29% of a
   healthy 12.1) because the changed slosh reaction loads the fit — the
   mirror's own false-lubrication finding, reproduced. The friction tolerance
   therefore WIDENS with the measured resonance shift (0.25 + 8·|Δfill_wave|).
   A flat 50% threshold would also have separated mount (29%) from a real
   lubrication fault (81%), but would have gone blind to anything milder than
   half severity; compensating keeps full sensitivity when the resonance has
   NOT moved. Measured verdicts, both fills: **5/5 singles plus healthy** at
   0.12 m and at 0.05 m, and at the default 0.12 m BOTH tested pairs resolve —
   mount+leak names both (which the Python mirror missed) and
   gauge_drift+density names both. At a shallow 0.05 m fill mount+leak
   collapses to the leak alone: the mirror's pair ambiguity, since a median of
   three tolerates ONE corrupted vote and that case corrupts two.
   THE HYBRID'S RESULT IS TWO-SIDED, and the negative half is the more useful
   one. Measured converged, wave in mm RMS / following error in mm:
     fill 0.12 m, shaper CORRECTLY tuned — none 9.58 · conventional
       0.305 / 1.524 · hybrid 0.214 / 1.464 · experimental 0.167 / 1.482
     fill 0.05 m, shaper MISTUNED by a third — none 20.83 · conventional
       3.038 / 1.721 · hybrid 2.958 / 1.540 · experimental 0.213 / 1.323
   So the trim cuts the wave by a THIRD when the shaper is right (closing about
   two thirds of the conventional→experimental gap) and by **2.6%, i.e.
   nothing**, when the shaper is mistuned — while improving the FOLLOWING ERROR
   in both cases (1.52→1.46 and 1.72→1.54). The mechanism is the whole point: a
   mistuned shaper is a failure of **TIMING**, and an additive force correction
   trims forces but cannot re-time a cancellation impulse. Only retuning the
   shaper does that, which is what the experimental machine does. It is also the
   third independent route by which this project has reached "tracking better
   and sloshing less are not the same objective" — the trim improves tracking in
   BOTH regimes and the wave in only one. A regression pins the NEGATIVE half
   specifically, because that is the claim a later edit would quietly break.
   A SEVENTH defect surfaced only when the control was added, and it had been
   biasing the shipped numbers: each machine's shaper has its own delay, so
   their references have different LENGTHS, and the settle window was taken as
   "everything after my own move ends" out of an array sized by the LONGEST
   machine — so the machine with the shortest shaper silently got the longest
   settle window (630 samples against 520 at a shallow fill). That flattered
   the conventional baseline and would have flattered the unshaped control most
   of all. Every machine is now scored over exactly SETTLE seconds after its
   own move ends. The bias ran AGAINST the experimental machine, which is the
   safe direction, but it was still wrong.
   The residual-wave chart is **log-scaled**: the control leaves ~30 mm against
   the experimental machine's ~0.9, and on a linear axis the comparison that
   actually matters is an invisible line along the bottom.
   The debug hook was wrong before any of this was: it recomputed the panel
   from whatever move had just finished rather than from the probe, so it
   reported `dfw = NaN` and friction deltas no verdict was ever based on.
   Fixed by storing what the diagnosis actually used — the recurring lesson of
   this project, that the instrument fails before the model does. THE LOAD CELL REPLACES the
   axis-identified mass as the third vote rather than joining it: keeping both
   measured WORSE than either (pairs 4/10 against 7/10) because they measure
   the same physical quantity, so a redundant reading drags the consensus
   without adding independence. **Kill gauge 💀** shows analytical redundancy —
   the inertia term falls back to the mass identified from the axis's own force
   and motion, calibrated against the gauge WHILE IT STILL WORKED (it carries a
   fixed offset and a 28% steeper slope, 76.7 vs the cell's exact 60.0 kg/m),
   measured 0.42 mm experimental against 2.85 conventional. A crest forecast
   warns before liquid goes over the rim and is fed the controller's
   **look-ahead buffer**; look-ahead in the FEEDFORWARD is deliberately ABSENT
   because it measured NEGATIVE there (following error 1.463 → 1.378 mm,
   residual wave 0.188 → 0.477 mm, monotone, no interior optimum: shaping
   cancels by exact TIMING and is a causal convolution, so preview only
   time-shifts the excitation). Same free signal, opposite sign in the two
   roles — see `slosh_evaluate.py` in the mirror.
   THREE DEPLOYMENT BUGS, all found by disbelieving the numbers rather than by
   a failing assertion, since every check passed while the numbers were wrong:
   (a) the health check REBUILT THE REFERENCE MID-MOVE, restarting it from the
   station while the carriage was elsewhere — a position-demand step of up to
   the whole stroke into a 4200 N/m gain, which saturated the drive and drove
   the slosh state to divergence (session waves read 33 mm against a physical
   ~0.3, and spills were counted at a fill whose freeboard is 0.27 m). Probes
   are now QUEUED for the next move boundary, as a real controller would.
   (b) Probe moves were scored as production, and a probe rings for ~10 moves
   at a shallow fill, so excluding just the probe was not enough. Fixed by a
   **settling dwell** — after a probe the axis HOLDS POSITION until both tanks
   are quiet, exactly as a commissioning routine does — which removes the
   contamination instead of discarding moves; the probe itself is the only
   thing ever excluded from scoring. (c) The healthy following-error reference
   was captured FROM the probe move, inflating it and making the conventional
   alarm too lenient — i.e. flattering the very baseline this tab exists to
   beat; it now comes from a production-move EMA.
   An **Experiment summary** completes the set (all four tabs have one): same
   6-section, 1 Hz, Copy-button, BLACK-BOX contract — the plant equations, the
   conventional baseline's every gain, the protocol and both grading rules are
   fully specified and reproducible, while HOW the experimental estimates and
   the forecast are constructed is withheld and stated as withheld. A
   leak-audit regression greps the rendered text.

## Versioning

`stamp-version.sh` runs **before each commit**. It:

- Sets the build number to `git rev-list --count HEAD + 1` (the number of the
  commit being created).
- Writes a UTC timestamp.
- Stamps both `index.html` (the `// __STAMP__` line) and `version.json`.
- Regenerates `docs-manifest.json`.

Run it, then commit, so the shipped commit and its version number match.

## Conventions

- **Self-contained / no external CDNs.** Everything is served from this
  origin so the page works offline and isn't at the mercy of blocked hosts.
- Vanilla JS, no build tooling beyond the shell script.
- Keep the console bootstrap first and dependency-free.
