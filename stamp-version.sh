#!/usr/bin/env bash
# Stamps the build version + UTC timestamp into index.html and version.json.
# Run this immediately before committing a deploy so the version number
# matches the commit that ships it. The stale-detector in the page compares
# the baked-in version against version.json fetched from the server.
set -euo pipefail

BUILT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# This commit's number = current commit count + 1 (this script runs pre-commit).
NUM="$(( $(git rev-list --count HEAD) + 1 ))"

# Replace the marked line in index.html (marker survives so it's re-stampable).
sed -i "s|.*// __STAMP__.*|  <script>window.__BUILD = {version:${NUM},built:\"${BUILT}\"}; // __STAMP__</script>|" index.html
sed -i "s|.*// __NGRC_STAMP__.*|  <script>window.__BUILD = {version:${NUM},built:\"${BUILT}\"}; // __NGRC_STAMP__</script>|" ngrc.html
sed -i "s|.*// __FLEXISIM_STAMP__.*|  <script>window.__BUILD = {version:${NUM},built:\"${BUILT}\"}; // __FLEXISIM_STAMP__</script>|" flexisim.html
sed -i "s|.*// __FLOWSIM_STAMP__.*|  <script>window.__BUILD = {version:${NUM},built:\"${BUILT}\"}; // __FLOWSIM_STAMP__</script>|" flowsim.html

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

# THE MODULE MANIFEST, and it exists because a stale-page banner that busts only
# the document is a half fix. The pages are ESM: `import './lib/.../x.js'` carries
# no version query, so a browser will pair a freshly fetched HTML with a CACHED
# module from an earlier build -- and the version check then reads "latest",
# truthfully, about the HTML, while the page is dead. console-boot.js re-fetches
# this list with {cache:"reload"} before reloading, which is the only way to reach
# the whole graph without stamping a query onto every import in the repo (which
# would churn every file's diff on every commit and bury the real changes).
MODS="$(find lib console-boot.js -type f -name '*.js' \
  -not -path '*/node_modules/*' | sed 's|^\./||' | sort)"
{
  printf '{"version":%s,"built":"%s","modules":[' "${NUM}" "${BUILT}"
  first=1
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if [ "${first}" -eq 1 ]; then first=0; else printf ','; fi
    printf '"%s"' "$f"
  done <<EOF
${MODS}
EOF
  printf ']}\n'
} > modules.json

echo "Stamped v${NUM} @ ${BUILT}"
echo "Module manifest: $(printf '%s\n' "${MODS}" | grep -c . ) script(s)"
echo "Docs manifest: $(printf '%s\n' "${FILES}" | grep -c . ) markdown file(s)"
