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
   1-finger orbit, 2-finger pinch-zoom **and pan**; NGRC and a classical
   **linear ARX** learn side-by-side — near-tied 1-step errors — then "Dream"
   free-runs both while **reality keeps running in green**: amber NGRC keeps
   the butterfly, red linear collapses; the Plotly trace follows both modes),
   **② soft-sensor** (drag/kick the blue motor; a soft lightly-damped coupling
   makes the hidden load lag and ring; amber `SoftSensor` caret vs a gray
   **auto-tuned lag-filter** caret — the realistic DIY baseline, best of a
   scored filter bank — with an on-stage error meter + ×-better readout, ~4×,
   and a 3-trace Plotly chart), **③ finger-trace** (draw loops at ~20 Hz
   sampling; an optional **tracing guide** selector overlays one of 10 faint
   stencil shapes — circle/ellipse/square/triangle/hexagon/star/figure-8/
   heart/rose/lissajous — purely visual, never read by any model, default
   none; amber NGRC ghost vs gray **straight-line extrapolation**, with a
   **ghost-horizon slider (0.2–10 s, geometric rungs)** — a 21-rung ladder of the library's
   **direct multi-horizon readouts** (`directHorizons`) trains continuously,
   so the slider needs no refit and the chart plots miss-vs-horizon curves
   over the whole range (dotted marker = slider). After ~8 s of doodling the ghost goes
   **path-locked** — the phase-domain rethink: a doodle factors into a PATH
   (kept as a fresh resampled loop, refreshed every ~1 s, first-peak
   autocorrelation for the lap length) traversed at a PHASE RATE, so the
   finger's phase is tracked PLL-style on the loop and an NGRC readout
   (library `rls`/`predict` primitives on lagged speed + phase-Fourier
   features) learns the tempo-vs-phase profile — you slow at the same
   corners every lap. Prediction = advance phase along the loop (transverse
   offset decays on), so it lands ON the future stroke by construction.
   Per-rung best-of (rolled / direct / path-locked, judged by live-tracked
   misses) is what the ghost draws. New **on-path miss** stat (untimed:
   distance from the prediction to the stroke actually drawn over the
   horizon): at 10 s the path-locked ghost measures ~70× closer than straight-line
   (~5,000× less error energy) live in-browser, timed advantage ~40×.
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
   stored loop stops refreshing, and the cyclic AFM pump stops feeding —
   while predictions, the ghost, and Autopilot keep working, so the model
   can be played with without being affected. The brain row shows
   "training FROZEN ❄️" vs "training live"; Reset brain also unfreezes).

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
