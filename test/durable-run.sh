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

# The lines worth keeping: the machine's own description, the ceiling, every rung row, the
# shipped verdict, and any diagnostic that fired. Raw logs are not committed — they are
# thousands of lines of progress and the numbers are what the record is for.
{
  echo ""
  echo "### ${name} — exit ${rc} — $(date -u +%Y-%m-%dT%H:%MZ)"
  echo ""
  echo '```'
  grep -E '^\s*\[|^\s*(as it arrived|conventional|pilot cascade|lap-periodic|— the)|shipped|nh  4|the lap-periodic rung reads|NOT SETTLED|floor ROSE|✗|check\(s\) FAILED|all checks passed' "$log" \
    || echo "(no result lines — the run did not reach its table)"
  echo '```'
} >> docs/history/runs.md

git add -- docs/history/runs.md
git commit -q -F - -- docs/history/runs.md <<MSG
run: ${name} (exit ${rc})

Result lines only, appended by test/durable-run.sh so the measurement
survives a container reclaim. The raw log stays out of the repository.
MSG

for i in 2 4 8 16; do
  git push -q origin HEAD:claude/rename-lattice-flowsim-4gedcq && break
  sleep "$i"
done
exit $rc
