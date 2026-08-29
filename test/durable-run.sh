#!/usr/bin/env bash
# RUN SOMETHING LONG AND KEEP THE RESULT ACROSS A CONTAINER RECLAIM.
#
# This container is reclaimed on idle, and the reclaim restores an OLD filesystem snapshot:
# HEAD goes backwards, the scratchpad is gone, and anything running dies. Twice a finished
# measurement was lost that way. The git remote is the only durable store here.
#
# THE LOG IS WRITTEN OUTSIDE THE REPO. The first version of this script wrote it straight
# into a tracked path, so the working tree was dirty for the whole run and every check of
# `git status` reported uncommitted changes that were just a log growing. That is noise
# standing exactly where a real uncommitted change would stand, which makes the signal
# useless. Only the SUMMARY is committed, once, after the run has exited.
#
#   ./test/durable-run.sh <name> <command...>
set -uo pipefail
name="$1"; shift
scratch="${CLAUDE_SCRATCH:-/tmp}/runs"
mkdir -p "$scratch"
log="$scratch/${name}.log"

"$@" > "$log" 2>&1
rc=$?

# KEEP THE WHOLE LOG WHEN IT IS SMALL, which it almost always is.
#
# This filtered by naming the lines worth keeping, and a filter that names lines drops
# tomorrow's diagnostic. It did: a run added to answer whether a drift settles or continues
# had its entire answer — the per-lap sequence, the two half-run drifts, the autocorrelation
# — matched by none of the patterns, so the record kept the rung table and threw away the
# finding, and the raw log was gone with the scratchpad by the time anyone looked.
#
# These logs are three or four kilobytes. The reason to filter was 'thousands of lines of
# progress', which was true of a suite run and never of a single test. So: whole log under
# the cap, filtered only above it, and the filter is a fallback rather than the rule.
CAP=$((64 * 1024))
{
  echo ""
  echo "### ${name} — exit ${rc} — $(date -u +%Y-%m-%dT%H:%MZ)"
  echo ""
  echo '```'
  if [ "$(wc -c < "$log")" -le "$CAP" ]; then
    cat "$log"
  else
    echo "(log $(wc -c < "$log") bytes, over the ${CAP} cap — result lines only)"
    grep -E '^\s*\[|^\s*(as it arrived|conventional|pilot cascade|lap-periodic|— the)|shipped|nh  4|reads the|NOT SETTLED|floor ROSE|lag-1|drift|mean |STOPPED|✗|check\(s\) FAILED|all checks passed' "$log" \
      || echo "(no result lines — the run did not reach its table)"
  fi
  echo '```'
} >> docs/history/runs.md

git add -- docs/history/runs.md
git commit -q -F - -- docs/history/runs.md <<MSG
run: ${name} (exit ${rc})

Appended by test/durable-run.sh so the measurement survives a container
reclaim, which takes the scratchpad with it. Whole log when it is small
enough to be worth keeping, result lines only above the cap.
MSG

for i in 2 4 8 16; do
  git push -q origin HEAD:claude/rename-lattice-flowsim-4gedcq && break
  sleep "$i"
done
exit $rc
