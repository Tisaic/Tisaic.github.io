#!/usr/bin/env python3
"""Generate golden vectors for SoftSensor from the Python reference.

Reference is `Testing/experiments/softsensor.py` (uses `ngrc_ref.primitives` and
`tests.feature_maps`). NGRC_TESTS must point at the NGRC repo's `Testing/` dir
(default /workspace/ngrc/Testing). Writes test/ngrc/golden/softsensor.json.
"""
import json, math, os, sys

TESTS = os.environ.get("NGRC_TESTS", "/workspace/ngrc/Testing")
sys.path.insert(0, TESTS)
from experiments.softsensor import SoftSensor          # noqa: E402
from tests.feature_maps import UniversalMap             # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "golden", "softsensor.json")

ns, nt, lag, stride, warmup, N = 2, 2, 3, 1, 10, 60
sig = [[], []]
for t in range(N):
    sig[0].append(math.sin(0.2 * t))
    sig[1].append(math.cos(0.15 * t))
tgt = [[], []]
for t in range(N):
    tgt[0].append(0.8 * sig[0][t] - 0.5 * sig[1][t] + 0.3)
    tgt[1].append(sig[0][t] * sig[1][t] + 0.1 * sig[0][max(0, t - 1)])


def run_case(fmap, prior):
    s = SoftSensor(ns, nt, lag, stride, warmup, fmap=fmap, prior=prior, init_variance=10.0, lam=1.0)
    ests = []
    for t in range(N):
        s.push([sig[0][t], sig[1][t]])
        if not s.frozen:
            s.warmup_step(s._raw())
        else:
            s.adapt([tgt[0][t], tgt[1][t]])
        ests.append(s.estimate() if (s.ready() and s.frozen) else None)
    return {"nfeat": s.nf, "theta": [th.m[:] for th in s.theta], "ests": ests}


out = {"data": {"sig": sig, "tgt": tgt, "ns": ns, "nt": nt, "lag": lag,
                "stride": stride, "warmup": warmup, "N": N}}
out["linear"] = run_case(None, None)

base = ns * lag
uni = UniversalMap(base, 4, 4, 7)
out["universal"] = {"base": base, "nh": 4, "nf": 4, "seed": 7, **run_case(uni, uni.prior())}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
print(f"wrote {OUT} from {TESTS}")
print(f"linear nfeat={out['linear']['nfeat']}, universal nfeat={out['universal']['nfeat']}")
