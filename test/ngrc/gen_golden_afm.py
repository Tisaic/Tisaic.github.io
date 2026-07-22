#!/usr/bin/env python3
"""Generate golden vectors for the AFM blocks from the Python reference.

Reference package is `Testing/` in the NGRC repo (imports `tests.afm_blocks` and
`tests.adaptive_feature_map`). Point at it with NGRC_TESTS (defaults to
/workspace/ngrc/Testing). Writes test/ngrc/golden/afm.json for the JS test.
"""
import json, math, os, sys

TESTS = os.environ.get("NGRC_TESTS", "/workspace/ngrc/Testing")
sys.path.insert(0, TESTS)
from tests.adaptive_feature_map import solve_ridge          # noqa: E402
from tests.afm_blocks import LoggedTrainer, LiveTrainer, Runner  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "golden", "afm.json")

# --- deterministic feature matrix + target ---
N, m = 80, 12
Phi = []
for r in range(N):
    t = r * 0.1
    Phi.append([
        1.0,                          # 0 bias
        math.sin(t),                  # 1
        math.cos(t),                  # 2
        math.sin(2 * t),              # 3
        t * 0.05,                     # 4
        math.sin(t) * math.cos(t),    # 5
        math.sin(t) ** 2,             # 6
        math.cos(2 * t),              # 7
        math.sin(3 * t),              # 8
        (t * 0.05) ** 2,              # 9
        math.sin(t) * 0.5 + math.cos(2 * t) * 0.3,  # 10
        math.cos(t) ** 2,             # 11
    ])
y = [2.0 * Phi[r][1] - 1.0 * Phi[r][2] + 0.5 * Phi[r][6] + 0.3 for r in range(N)]
ridge = [1e-3] * m
seed = [0, 1]
cap, batch = 6, 4

out = {"data": {"Phi": Phi, "y": y, "ridge": ridge, "m": m, "N": N},
       "config": {"seed": seed, "cap": cap, "batch": batch}}

# solve_ridge unit cases
out["solve_ridge"] = []
for (G, c, rg) in [
    ([[4.0, 1.0], [1.0, 3.0]], [1.0, 2.0], [0.1, 0.1]),
    ([[2.0, 0.0, 0.0], [0.0, 5.0, 1.0], [0.0, 1.0, 4.0]], [1.0, -1.0, 2.0], [0.0, 0.0, 0.0]),
]:
    theta = solve_ridge([row[:] for row in G], c[:], rg[:], {"mac": 0})
    out["solve_ridge"].append({"G": G, "c": c, "ridge": rg, "theta": theta})

# LoggedTrainer
lt = LoggedTrainer(Phi, y, ridge, seed, cap, batch)
steps = 0
while lt.step():
    steps += 1
S_lg, th_lg = lt.freeze()
out["logged"] = {"S": S_lg, "theta": th_lg, "steps": steps}

# LiveTrainer (deterministic: no RNG)
live = LiveTrainer(m, ridge, seed, cap, batch, window=10, lam=0.999, warmup=10)
for r in range(N):
    row = Phi[r]
    live.push(lambda j, row=row: row[j], y[r])
S_lv, th_lv = live.freeze()
out["live"] = {"window": 10, "lam": 0.999, "warmup": 10, "S": S_lv, "theta": th_lv}

# Runner on the logged result
run = Runner(S_lg, th_lg)
rows = list(range(0, N, 10))
out["runner"] = {"S": S_lg, "theta": th_lg, "rows": rows,
                 "preds": [run.predict(lambda j, row=Phi[r]: row[j]) for r in rows]}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
print(f"wrote {OUT} from {TESTS}")
print(f"logged: {len(S_lg)} feats {S_lg} in {steps} steps; live: {len(S_lv)} feats {S_lv}")
