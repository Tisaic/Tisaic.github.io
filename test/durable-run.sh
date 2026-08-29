#!/usr/bin/env bash
# RUN SOMETHING LONG AND KEEP THE RESULT. This container is reclaimed on idle and the
# reclaim restores an OLD filesystem snapshot, so nothing local survives it — twice now a
# finished measurement was lost with the scratchpad it was written to. The git remote is
# the only durable store, so a run's log is committed and pushed the moment it finishes.
# A run killed mid-flight is still lost; that is a separate problem and is why the
# expensive measurements are being replaced by cheaper ones that answer the same question.
set -uo pipefail
name="$1"; shift
log="docs/history/runs/${name}.log"
mkdir -p docs/history/runs
"$@" > "$log" 2>&1
rc=$?
git add -- "$log"
git commit -q -m "run log: ${name} (exit ${rc})

Committed by test/durable-run.sh so the measurement survives a container
reclaim. Raw output, not a conclusion." -- "$log" 2>/dev/null
for i in 2 4 8 16; do
  git push -q origin HEAD:claude/rename-lattice-flowsim-4gedcq && break
  sleep $i
done
exit $rc
