#!/usr/bin/env bash
# Stamps the build version + UTC timestamp into index.html and version.json.
# Run this immediately before committing a deploy so the version number
# matches the commit that ships it. The stale-detector in the page compares
# the baked-in version against version.json fetched from the server.
set -euo pipefail

BUILT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# This commit's number = current commit count + 1 (this script runs pre-commit).
# THE COMMIT COUNT IS ONLY A BUILD NUMBER IF THE HISTORY IS ALL THERE.
#
# This repo is cloned SHALLOW into the remote sandbox, and `rev-list --count` then
# counts what was fetched rather than what exists: it returned 77 against a real
# 213, and stamping that REGRESSED version.json from 179 to 77 before this guard
# existed. That breaks the one thing the number is for -- the page compares its own
# build to the server's and offers a cache-busting reload when the server is NEWER,
# so a number that goes backwards means a genuinely stale page is never told.
#
# Nothing failed when it happened. The stamp succeeded, the commit looked right,
# and the staleness banner would simply have stopped working.
if [ -f .git/shallow ] || [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
  echo "stamp-version: shallow clone -- run 'git fetch --unshallow' first," >&2
  echo "               or the build number will go BACKWARDS." >&2
  exit 1
fi
NUM="$(( $(git rev-list --count HEAD) + 1 ))"
# And a check against the number actually shipped, since a shallow clone is only
# one way to lose history (a graft, a filtered clone, a rewritten branch). The
# version must never go backwards, whatever the cause.
PREV="$(sed -n 's/.*"version":[[:space:]]*\([0-9]\+\).*/\1/p' version.json 2>/dev/null | head -1)"
if [ -n "$PREV" ] && [ "$NUM" -le "$PREV" ]; then
  echo "stamp-version: refusing to stamp v$NUM over v$PREV -- the build number" >&2
  echo "               must increase or stale-page detection silently stops working." >&2
  exit 1
fi

# Replace the marked line in index.html (marker survives so it's re-stampable).
sed -i "s|.*// __STAMP__.*|  <script>window.__BUILD = {version:${NUM},built:\"${BUILT}\"}; // __STAMP__</script>|" index.html
sed -i "s|.*// __NGRC_STAMP__.*|  <script>window.__BUILD = {version:${NUM},built:\"${BUILT}\"}; // __NGRC_STAMP__</script>|" ngrc.html
sed -i "s|.*// __LATTSIM_STAMP__.*|  <script>window.__BUILD = {version:${NUM},built:\"${BUILT}\"}; // __LATTSIM_STAMP__</script>|" lattsim.html

# Write the server-side manifest the page fetches to detect staleness.
printf '{"version":%s,"built":"%s"}\n' "${NUM}" "${BUILT}" > version.json

# Regenerate the docs manifest: every .md file in the repo (excluding git,
# vendored libs, and node_modules). The Docs viewer fetches this to list files.
FILES="$(find . -type f -name '*.md' \
  -not -path './.git/*' -not -path './vendor/*' \
  -not -path '*/node_modules/*' -not -path './test/*' \
  | sed 's|^\./||' | sort)"
{
  printf '{"generated":"%s","files":[' "${BUILT}"
  first=1
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    dir="$(dirname "$f")"; name="$(basename "$f")"
    if [ "${first}" -eq 1 ]; then first=0; else printf ','; fi
    printf '{"path":"%s","dir":"%s","name":"%s"}' "$f" "$dir" "$name"
  done <<EOF
${FILES}
EOF
  printf ']}\n'
} > docs-manifest.json

echo "Stamped v${NUM} @ ${BUILT}"
echo "Docs manifest: $(printf '%s\n' "${FILES}" | grep -c . ) markdown file(s)"
