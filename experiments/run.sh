#!/usr/bin/env bash
# Run one experiment so that a container reset cannot cost anything.
#
# This sandbox is ephemeral and has been reclaimed mid-run several times, each
# time restoring the working tree to the commit the container was cloned at.
# Everything uncommitted dies with it -- which is survivable for a cached
# simulation record (re-recording is minutes) and NOT survivable for source or
# for a measurement that took ten minutes to produce.
#
# So: recover the tree first, run detached with the log written straight to a
# tracked file, and commit the result the moment it exists rather than at the end
# of a session. The rule this encodes is the one the resets kept teaching --
# a number that is not committed has not been measured.
#
#   ./experiments/run.sh noise-common            run, log, commit, push
#   ./experiments/run.sh noise-common --no-push  run and log only
set -uo pipefail
cd "$(dirname "$0")/.."

NAME="${1:?usage: run.sh <experiment-name> [--no-push]}"
SCRIPT="experiments/${NAME}.mjs"
[ -f "$SCRIPT" ] || { echo "no such experiment: $SCRIPT" >&2; exit 2; }
OUT="experiments/results/${NAME}.txt"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# RECOVER BEFORE RUNNING. If the container was reclaimed, the tree is at an older
# commit and the experiment that is about to run may not be the one on disk.
git fetch -q origin "$BRANCH" 2>/dev/null || true
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/${BRANCH}" 2>/dev/null || echo "$LOCAL")"
if [ "$LOCAL" != "$REMOTE" ] && git merge-base --is-ancestor "$LOCAL" "$REMOTE" 2>/dev/null; then
  echo "tree is behind origin/${BRANCH} -- recovering before running"
  git reset -q --hard "$REMOTE"
fi

mkdir -p experiments/results
{
  echo "# ${NAME}"
  echo "# commit $(git rev-parse --short HEAD)   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
} > "$OUT"

START=$(date +%s)
node "$SCRIPT" 2>&1 | tee -a "$OUT"
STATUS=${PIPESTATUS[0]}
echo -e "\n# exit ${STATUS} after $(( $(date +%s) - START ))s" >> "$OUT"

git add "$OUT"
git commit -q -m "Record ${NAME} output" -- "$OUT" 2>/dev/null \
  && echo "committed ${OUT}" || echo "no change in ${OUT}"
if [ "${2:-}" != "--no-push" ]; then
  for delay in 2 4 8 16; do
    git push -q -u origin "$BRANCH" 2>/dev/null && { echo "pushed"; break; }
    echo "push failed, retrying in ${delay}s"; sleep "$delay"
  done
fi
exit "$STATUS"
