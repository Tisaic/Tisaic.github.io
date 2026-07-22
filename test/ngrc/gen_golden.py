#!/usr/bin/env python3
"""Generate golden vectors for the NGRC primitives from the Python reference.

The reference is `Testing/ngrc_ref/primitives.py` in the NGRC repo. Point at it
with NGRC_REF (defaults to /workspace/ngrc/Testing/ngrc_ref). Writes
test/ngrc/golden/primitives.json, which the JS test consumes — so running the
JS test needs no Python and no access to the NGRC repo.

Regenerate only when the reference changes; commit the JSON.
"""
import json, os, sys

REF = os.environ.get("NGRC_REF", "/workspace/ngrc/Testing/ngrc_ref")
sys.path.insert(0, REF)
import primitives as P  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "golden", "primitives.json")


def blk(rows, cols, data):
    return P.Block(rows, cols, data)


cases = {}

# --- build_lags_stride ---
cases["build_lags_stride"] = []
for (hists, lag, nv, stride, inh, ni) in [
    ([[3.0, 2.0, 1.0]], 3, 1, 1, None, 0),
    ([[5.0, 4.0, 3.0, 2.0, 1.0]], 3, 1, 2, None, 0),
    ([[1.1, 0.9], [2.2, 1.8]], 2, 2, 1, None, 0),
    ([[1.0, 0.5]], 2, 1, 1, [[9.0, 8.0]], 1),  # NARX
]:
    histb = [blk(len(h), 1, h) for h in hists]
    inhb = [blk(len(h), 1, h) for h in inh] if inh else None
    out = P.build_lags_stride(histb, lag, nv, stride, inhb, ni)
    cases["build_lags_stride"].append({
        "histories": hists, "lag_order": lag, "num_vars": nv, "stride": stride,
        "in_histories": inh, "num_inputs": ni, "out": None if out is None else out.m,
    })

# --- poly_expand ---
cases["poly_expand"] = []
for (x, order) in [([2.0], 1), ([2.0, 3.0], 2), ([1.0, -1.0, 0.5], 2), ([1.0, 2.0], 3)]:
    out = P.poly_expand(blk(len(x), 1, x), order)
    cases["poly_expand"].append({"x": x, "order": order, "out": None if out is None else out.m})

# --- add_bias ---
cases["add_bias"] = []
for x in [[1.0], [2.0, 3.0, 4.0]]:
    out = P.add_bias(blk(len(x), 1, x))
    cases["add_bias"].append({"x": x, "out": None if out is None else out.m})

# --- predict ---
cases["predict"] = []
for (x, th) in [([1.0, 2.0, 3.0], [0.5, -1.0, 2.0]), ([1.0], [4.0])]:
    out = P.predict(blk(len(x), 1, x), blk(len(th), 1, th))
    cases["predict"].append({"x": x, "theta": th, "out": out})

# --- rls_init ---
cases["rls_init"] = []
for (n, iv) in [(3, 10.0), (2, [1.0, 100.0])]:
    theta, Pm = P.rls_init(n, iv)
    cases["rls_init"].append({"n": n, "init_variance": iv, "theta": theta.m, "P": Pm.m})

# --- rmse ---
cases["rmse"] = []
for (a, b) in [([1.0, 2.0, 3.0], [1.0, 2.0, 4.0]), ([0.0, 0.0], [3.0, 4.0])]:
    out = P.rmse(blk(len(a), 1, a), blk(len(b), 1, b))
    cases["rmse"].append({"a": a, "b": b, "out": out})

# --- calc_mem ---
cases["calc_mem"] = []
for (nv, lag, po, ub, stride, ni) in [
    (6, 2, 1, True, 1, 0), (3, 2, 2, True, 1, 0), (2, 2, 3, False, 1, 0), (2, 2, 1, True, 1, 1),
]:
    out = P.calc_mem(nv, lag, po, ub, stride, ni)
    cases["calc_mem"].append({
        "num_vars": nv, "lag_order": lag, "poly_order": po, "use_bias": ub,
        "stride": stride, "num_inputs": ni, "out": out,
    })

# --- rls sequences (init + several updates, snapshot theta/P after each) ---
cases["rls_sequence"] = []
seqs = [
    {"n": 3, "init_variance": 10.0, "lam": 1.0, "directional": False, "max_cov_trace": 0.0,
     "steps": [([1.0, 0.5, -0.5], 1.0), ([0.8, 0.6, -0.2], 0.9), ([0.2, 1.0, 0.3], 1.3),
               ([0.5, 0.5, 0.5], 0.7)]},
    {"n": 2, "init_variance": 1.0, "lam": 0.98, "directional": False, "max_cov_trace": 50.0,
     "steps": [([1.0, 0.0], 2.0), ([0.0, 1.0], 1.0), ([0.7, 0.7], 1.5), ([0.1, 0.1], 0.2)]},
    {"n": 2, "init_variance": 10.0, "lam": 0.98, "directional": True, "max_cov_trace": 0.0,
     "steps": [([1.0, 0.2], 1.0), ([0.9, 0.3], 0.8), ([0.05, 0.02], 0.1), ([0.4, 0.9], 1.2)]},
]
for s in seqs:
    theta, Pm = P.rls_init(s["n"], s["init_variance"])
    snaps = []
    for (x, y) in s["steps"]:
        ok, iv = P.rls(theta, Pm, blk(s["n"], 1, x), y, s["lam"], s["max_cov_trace"], s["directional"])
        snaps.append({"ok": ok, "innov_var": iv, "theta": list(theta.m), "P": list(Pm.m)})
    cases["rls_sequence"].append({**s, "snapshots": snaps})

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(cases, f, indent=1)
print(f"wrote {OUT} from ref {REF}")
n = sum(len(v) for v in cases.values())
print(f"{len(cases)} function groups, {n} cases")
