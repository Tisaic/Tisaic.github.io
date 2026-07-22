#!/usr/bin/env python3
"""Generate golden vectors for the Continuous forecaster from the Python reference.

Reference is `Testing/ngrc_ref/continuous.py`. NGRC_REF points at the NGRC repo's
`Testing/ngrc_ref` dir (default /workspace/ngrc/Testing/ngrc_ref). Writes
test/ngrc/golden/continuous.json. Covers the main feature combinations.
"""
import json, math, os, sys

REF = os.environ.get("NGRC_REF", "/workspace/ngrc/Testing/ngrc_ref")
sys.path.insert(0, os.path.dirname(REF))            # parent has `ngrc_ref` package
from ngrc_ref.continuous import Continuous           # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "golden", "continuous.json")

N = 80


def series(nv, ni):
    """Deterministic multi-variable signal + optional exogenous input."""
    sig = [[math.sin(0.20 * t + 0.5 * v) + 0.3 * math.cos(0.11 * t) for t in range(N)] for v in range(nv)]
    inp = [[0.5 * math.sin(0.07 * t + u) for t in range(N)] for u in range(ni)]
    return sig, inp


def run(cfg):
    nv = cfg["num_variables"]; ni = cfg.get("num_inputs", 0)
    sig, inp = series(nv, ni)
    kw = {k: v for k, v in cfg.items()
          if k not in ("name", "num_variables", "lag_order", "poly_order", "use_bias")}
    m = Continuous(cfg["num_variables"], cfg["lag_order"], cfg["poly_order"], cfg["use_bias"], **kw)
    steps = []
    for t in range(N):
        smp = [sig[v][t] for v in range(nv)]
        inv = [inp[u][t] for u in range(ni)] if ni else None
        r = m.step(smp, inv)
        steps.append({
            "prediction": r["prediction"], "rmse": r["rmse"], "overall_rmse": r["overall_rmse"],
            "residual": r["residual"], "confidence": r["confidence"],
            "warm": r["warm"], "diverged": r["diverged"], "sample_count": r["sample_count"],
            "direct_prediction": r["direct_prediction"],
        })
    # a non-mutating candidate probe at the end (control inverse)
    probe = m.predict_candidate([sig[v][0] for v in range(nv)], [inp[u][0] for u in range(ni)] if ni else None)
    theta = [th.m[:] for th in m.theta]
    return {"sig": sig, "inp": inp, "steps": steps, "theta": theta, "probe": probe}


configs = [
    {"name": "basic_poly2_multistep", "num_variables": 1, "lag_order": 2, "poly_order": 2,
     "use_bias": True, "prediction_steps": 3, "lam": 1.0, "init_variance": 1.0},
    {"name": "multivar_narx", "num_variables": 2, "lag_order": 2, "poly_order": 1, "use_bias": True,
     "num_inputs": 1, "prediction_steps": 2, "lam": 0.99, "init_variance": 100.0},
    {"name": "delta_directional_clamp", "num_variables": 1, "lag_order": 3, "poly_order": 2,
     "use_bias": True, "use_delta": True, "directional_forgetting": True, "lam": 0.98,
     "max_cov_trace": 50.0, "use_clamp": True, "clamp_min": [-5.0], "clamp_max": [5.0],
     "init_variance": 10.0},
    {"name": "autonorm_adaptive_direct", "num_variables": 1, "lag_order": 2, "poly_order": 2,
     "use_bias": True, "auto_normalize": True, "calib_samples": 20, "adaptive_forgetting": True,
     "lam": 0.999, "lam_min": 0.95, "direct_horizons": [1, 5], "init_variance": 10.0},
]

out = {}
for cfg in configs:
    out[cfg["name"]] = {"config": cfg, **run(cfg)}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
print(f"wrote {OUT}: {len(configs)} configs x {N} steps")
