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
| `ngrc.html` | NGRC playground: 3-tab interactive demo (Lorenz forecaster, soft-sensor, finger-trace) using `lib/ngrc`. |
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
4. **NGRC playground** (bottom-right `NGRC` launcher → `ngrc.html`) — a 3-tab
   interactive showcase of `lib/ngrc`, each tab framed as **NGRC vs a common
   alternative** so the value is visible: **① Lorenz** (three.js attractor;
   1-finger orbit, 2-finger pinch-zoom **and pan**; FOUR models learn
   side-by-side from the same stream — NGRC, a cyan **ESN** (the finger
   tab's 100-neuron recipe with 3 inputs, online-RLS 1-step readout — the
   literature's canonical NG-RC-vs-reservoir head-to-head ON Lorenz), a
   magenta **MLP** (shared `mlpCore`, [u(t),u(t−1)] → u(t+1), online Adam +
   light replay), and a classical **linear ARX** — near-tied 1-step errors
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
   A **Speed slider (0.05–1×)** scales
   sim steps per frame via a fractional accumulator (0.05× really is 20×
   slower); drop it right at the Dream switch to watch the crossover in
   slow motion — every model tracks reality for a while, then diverges
   at its own pace. Survives Reset; verified 231→24 steps/s at 0.10×.
   A **warmup selector** (1800 default / 900 / 450 / 200 / 100) sets the
   mandatory training gate before Dream unlocks — drop it to test
   undertrained dreams; the washout/calibration window scales with it
   (min(250, gate/2)) so a short warmup still trains before the gate,
   and changing it resets the models),
   **② soft-sensor** (drag/kick the blue motor; a soft lightly-damped coupling
   makes the hidden load lag and ring; amber `SoftSensor` caret vs a gray
   **auto-tuned lag-filter** caret — the realistic DIY baseline, best of a
   scored filter bank — with an on-stage error meter + ×-better readout, ~4×,
   and a 4-trace Plotly chart. Plus PREDICTIVE soft-sensing (finger-tab
   payback): a violet hollow dashed "+1s" caret previews where the load
   WILL be in 1 s — a direct h-ahead readout (library `rls`/`predict`
   primitives, bias + 6-lag × stride-5 window over the sensor's own
   conditioned signals, SS_PREV_H=100 samples) scored OUT-OF-SAMPLE:
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
   language as the sensor pair, with their own ×-better readout. Measured: ~7-8× better than
   persistence under the autonomous drive, honestly narrowing to ~2-3×
   during unpredictable dragging — future INPUT is unknowable, the
   dynamics still aren't), **③ finger-trace** (draw loops at ~20 Hz
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
   gapless with instant AFM deploy, far relocation still resets).

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
