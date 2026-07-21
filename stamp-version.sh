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
sed -i "s|.*// __STAMP__|    var BUILD = {version:${NUM},built:\"${BUILT}\"}; // __STAMP__|" index.html

# Write the server-side manifest the page fetches to detect staleness.
printf '{"version":%s,"built":"%s"}\n' "${NUM}" "${BUILT}" > version.json

echo "Stamped v${NUM} @ ${BUILT}"
