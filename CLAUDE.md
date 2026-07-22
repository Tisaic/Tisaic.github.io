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
   interactive showcase of the ported `lib/ngrc` library: **① Lorenz** (a
   three.js attractor the model learns online, then free-runs to "dream" the
   chaos itself, with an InitVariance stability slider and a live Plotly
   real-vs-predicted trace), **② soft-sensor** (a two-mass spring; the
   `SoftSensor` estimates the hidden load from the motor's history alone —
   canvas viz + Plotly true-vs-estimate), and **③ finger-trace** (drag your
   finger; a `Continuous` multi-step roll-out rides an amber ghost ahead of
   your fingertip, with a Plotly nRMSE-vs-horizon bar chart). All three built.

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
