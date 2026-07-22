#!/usr/bin/env python3
"""Golden vectors for autotune from the Python reference."""
import json, math, os, sys

REF = os.environ.get("NGRC_REF", "/workspace/ngrc/Testing/ngrc_ref")
sys.path.insert(0, os.path.dirname(REF))
from ngrc_ref.autotune import autotune, make_model   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "golden", "autotune.json")

# stable, near-linear 1-var series (linear ARX should win the search)
N = 180
y = [0.1, 0.2]
for t in range(2, N):
    y.append(0.6 * y[t - 1] - 0.25 * y[t - 2] + 0.4 * math.sin(0.10 * t))
data = [[y[t]] for t in range(N)]

cfg = autotune(data, num_vars=1, lag_orders=(2, 4), init_variances=(1.0, 10.0),
               horizon=15, val_frac=0.35)

# instantiate the chosen config and run the data to a final theta
m = make_model(cfg, num_vars=1)
for t in range(N):
    m.step(data[t])
theta = [th.m[:] for th in m.theta]

out = {
    "data": data,
    "chosen": {k: cfg[k] for k in ("name", "lag_order", "poly_order", "init_variance",
                                   "num_features", "num_vars", "num_inputs", "use_clamp",
                                   "clamp_min", "clamp_max", "max_cov_trace", "lam", "val_nrmse")},
    "report": cfg["report"],
    "final_theta": theta,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
print(f"wrote {OUT}: chosen {cfg['name']} lag={cfg['lag_order']} iv={cfg['init_variance']} "
      f"nfeat={cfg['num_features']} nrmse={cfg['val_nrmse']:.5f}")
