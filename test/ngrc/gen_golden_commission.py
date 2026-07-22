#!/usr/bin/env python3
"""Generate golden vectors for commission_softsensor from the Python reference.

Reference is `Testing/experiments/softsensor.py`. NGRC_TESTS points at the NGRC
repo's `Testing/` dir (default /workspace/ngrc/Testing). Writes
test/ngrc/golden/commission.json.
"""
import json, math, os, sys

TESTS = os.environ.get("NGRC_TESTS", "/workspace/ngrc/Testing")
sys.path.insert(0, TESTS)
from experiments.softsensor import commission_softsensor   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "golden", "commission.json")

# Deterministic 2-signal, 1-target log with a genuinely nonlinear map (product +
# square), so the linear-first path fails and the pruned-universal is selected.
Ntot, n = 270, 250
sig = [[], []]
for t in range(Ntot):
    sig[0].append(math.sin(0.20 * t))
    sig[1].append(math.cos(0.13 * t))
tgt = [[]]
for t in range(Ntot):
    tgt[0].append(sig[0][t] * sig[1][t] + 0.5 * sig[0][t] ** 2 - 0.2 * sig[1][t])

sig_c = [s[:n] for s in sig]
tgt_c = [y[:n] for y in tgt]
opts = dict(lags=(2,), strides=(1,), n_hinge=6, n_fourier=6, seed=7)
s, info = commission_softsensor(sig_c, tgt_c, **opts)

result = {"deployed": info["deployed"]}
ests = []
if info["deployed"]:
    result.update({"config": info["config"], "lag": info["lag"], "stride": info["stride"],
                   "n_full": info["n_full"], "n_deployed": info["n_deployed"],
                   "nrmse": info["nrmse"], "kept": info["kept"]})
    theta = [th.m[:] for th in s.theta]
    for t in range(n, Ntot):
        s.push([sig[0][t], sig[1][t]])
        ests.append(s.estimate())
else:
    theta = []

out = {"data": {"sig": sig, "tgt": tgt, "Ntot": Ntot, "n": n},
       "opts": {"lags": [2], "strides": [1], "nHinge": 6, "nFourier": 6, "seed": 7},
       "result": result, "theta": theta, "ests": ests}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
print(f"wrote {OUT}: deployed={info['deployed']} config={info.get('config')} "
      f"n_deployed={info.get('n_deployed')} nrmse={info.get('nrmse')}")
