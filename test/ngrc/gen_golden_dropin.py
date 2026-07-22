#!/usr/bin/env python3
"""Generate golden vectors for DropInEstimator from the Python reference.

Reference is `Testing/ngrc_ref/dropin.py`. NGRC_REF points at the NGRC repo's
`Testing/ngrc_ref` dir (default /workspace/ngrc/Testing/ngrc_ref). Writes
test/ngrc/golden/dropin.json.
"""
import json, math, os, sys

REF = os.environ.get("NGRC_REF", "/workspace/ngrc/Testing/ngrc_ref")
sys.path.insert(0, os.path.dirname(REF))
from ngrc_ref.dropin import DropInEstimator          # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "golden", "dropin.json")

N = 90


def run(kinds, num_inputs, lag, adapt, prediction_steps):
    ns = len(kinds)
    state = [[2.0 * math.sin(0.10 * t + 0.4 * s) for t in range(N)] for s in range(ns)]
    inp = [[0.5 * math.sin(0.07 * t + u) for t in range(N)] for u in range(num_inputs)]
    est = DropInEstimator(kinds, num_inputs=num_inputs, lag=lag, adapt=adapt,
                          prediction_steps=prediction_steps)
    steps = []
    for t in range(N):
        st = [state[s][t] for s in range(ns)]
        iv = [inp[u][t] for u in range(num_inputs)] if num_inputs else None
        r = est.step(st, iv)
        steps.append({
            "prediction": r["prediction"], "rmse": r["rmse"], "warm": r["warm"],
            "sample_count": r["sample_count"],
            "state_prediction": r.get("state_prediction"),
            "state_prediction_h": r.get("state_prediction_h"),
        })
    theta = [th.m[:] for th in est.model.theta]
    return {"kinds": kinds, "num_inputs": num_inputs, "lag": lag, "adapt": adapt,
            "prediction_steps": prediction_steps, "state": state, "inp": inp,
            "steps": steps, "theta": theta}


out = {
    "angular_linear_narx_multistep": run(["angular", "linear"], 1, 2, False, 3),
    "twolinear_adapt": run(["linear", "linear"], 0, 3, True, 1),
    "angular_only": run(["angular"], 0, 2, False, 2),
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
print(f"wrote {OUT}: {len(out)} configs x {N} steps")
