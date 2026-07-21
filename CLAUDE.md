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

## Key files

| File | Purpose |
|------|---------|
| `index.html` | The entire app: header, debug console, doc viewers. |
| `version.json` | Server-side build manifest for stale-page detection. |
| `docs-manifest.json` | Generated list of every `.md` file, for the Docs viewer. |
| `stamp-version.sh` | Pre-commit build step: stamps version + regenerates the docs manifest. |
| `vendor/marked.min.js` | Self-hosted markdown renderer (marked v12), no CDN. |
| `CLAUDE.md` | This file. |

## Features on the page

1. **Debug console** (bottom-right `>_` launcher) — a self-contained mobile
   console:
   - Captures `console.*`, uncaught errors (with stack + file:line), and
     unhandled promise rejections.
   - Bootstrap runs **first in `<head>`** so it catches load-time errors
     before `<body>` renders; it injects its own UI onto `<html>`.
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
