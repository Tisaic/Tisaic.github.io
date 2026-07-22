#!/usr/bin/env python3
"""Generate golden vectors for the universal feature map from the Python reference.

Reference is `Testing/tests/feature_maps.py` (imports `ngrc_ref.primitives`), so
NGRC_TESTS must point at the NGRC repo's `Testing/` dir (default
/workspace/ngrc/Testing). Writes test/ngrc/golden/universal.json.
"""
import json, os, sys

TESTS = os.environ.get("NGRC_TESTS", "/workspace/ngrc/Testing")
sys.path.insert(0, TESTS)
from tests.feature_maps import (  # noqa: E402
    universal_params_ststyle, universal_expand_ststyle,
    universal_expand_pruned_ststyle, universal_prior_pruned_ststyle,
)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "golden", "universal.json")

cases = []
configs = [
    # base, nh, nf, seed, n_recip, prior overrides, z vectors, kept indices
    (4, 6, 6, 7, 0, {}, [[0.5, -0.3, 1.2, -0.8], [0.0, 0.0, 0.0, 0.0], [-1.5, 2.0, 0.1, -0.4]], [0, 1, 5, 12, 18]),
    (3, 4, 4, 11, 2, {"lin": 50.0, "quad": 2.0, "rand": 0.01, "recip": 0.5},
     [[1.0, -1.0, 0.25], [0.7, 0.7, -0.7]], [0, 2, 4, 9, 13]),
]
for (base, nh, nf, seed, n_recip, pk, zs, kept) in configs:
    Wh, bh, Wf, phf, four_scale, prior = universal_params_ststyle(
        base, nh, nf, seed, n_recip=n_recip,
        lin=pk.get("lin", 100.0), quad=pk.get("quad", 1.0),
        rand=pk.get("rand", 0.001), recip=pk.get("recip", 1.0))
    expands = [universal_expand_ststyle(z, base, nh, nf, Wh, bh, Wf, phf, four_scale, n_recip=n_recip)
               for z in zs]
    pruned = [universal_expand_pruned_ststyle(z, base, nh, nf, Wh, bh, Wf, phf, four_scale, kept, n_recip=n_recip)
              for z in zs]
    prior_pruned = universal_prior_pruned_ststyle(
        base, nh, nf, kept, lin=pk.get("lin", 100.0), quad=pk.get("quad", 1.0),
        rand=pk.get("rand", 0.001), n_recip=n_recip, recip=pk.get("recip", 1.0))
    cases.append({
        "base": base, "nh": nh, "nf": nf, "seed": seed, "n_recip": n_recip, "prior_opts": pk,
        "zs": zs, "kept": kept,
        "params": {"Wh": Wh, "bh": bh, "Wf": Wf, "phf": phf, "four_scale": four_scale, "prior": prior},
        "expands": expands, "pruned": pruned, "prior_pruned": prior_pruned,
    })

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump({"cases": cases}, f, indent=1)
print(f"wrote {OUT} from {TESTS}: {len(cases)} configs")
