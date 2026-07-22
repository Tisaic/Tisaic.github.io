#!/usr/bin/env python3
"""Golden vectors for AxisComp — a faithful transcription of TC_NGRC_AxisComp.st
built on the golden `rls` primitive (the ST is the spec; there is no separate
Python class reference). Validates the JS port against the ST math."""
import json, math, os, sys

REF = os.environ.get("NGRC_REF", "/workspace/ngrc/Testing/ngrc_ref")
sys.path.insert(0, os.path.dirname(REF))
from ngrc_ref.primitives import Block, rls, rls_init   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "golden", "axiscomp.json")

POSMIN, POSMAX, TMIN, TMAX, LEAD = 0.0, 300.0, 0.0, 40.0, 10.0
INITVAR = 10.0
W = 2.0 * math.pi / LEAD

pmid, psc = 0.5 * (POSMIN + POSMAX), 0.5 * (POSMAX - POSMIN)
tmid, tsc = 0.5 * (TMIN + TMAX), 0.5 * (TMAX - TMIN)
MEAN = [pmid, pmid * pmid, 0, 0, 0, 0, tmid, tmid * pmid, 0, 0]
SCALE = [psc, psc * psc, 1, 1, 1, 1, tsc, tsc * psc, 0, 1]


def axis_feat(pos, dT, d):
    return [pos, pos * pos, math.cos(W * pos), math.sin(W * pos), math.cos(2 * W * pos),
            math.sin(2 * W * pos), dT, dT * pos, 1.0, d]


def stdz(x):
    return [(x[j] - MEAN[j]) / SCALE[j] if SCALE[j] > 1e-9 else 1.0 for j in range(10)]


# true error model: lead error (linear + per-rev) + thermal + backlash B/2 * dir
B = 0.012
def true_err(pos, dT, d):
    return (2e-4 * pos + 3e-3 * math.cos(W * pos) + 1e-3 * math.sin(W * pos)
            + 5e-5 * dT * pos + 1e-3 * dT + (B / 2.0) * d)


th, P = rls_init(10, INITVAR)
backlash_hist = []
# calibration grid: positions x directions x two temperatures
positions = [10 + 20 * i for i in range(14)]
for temp in (0.0, 25.0):
    for d in (+1.0, -1.0):
        for pos in positions:
            xs = stdz(axis_feat(pos, temp, d))
            rls(th, P, Block(10, 1, xs), true_err(pos, temp, d), 1.0, 0.0, False)
            backlash_hist.append(2.0 * abs(th.m[9] / SCALE[9]))

# RUN sweep with limits + slew
last = 0.0
runs = []
for k in range(40):
    pos = 5.0 + 7.0 * k
    d = 1.0 if (k % 8) < 4 else -1.0
    temp = 15.0
    xs = stdz(axis_feat(pos, temp, d))
    pitch = sum(th.m[i] * xs[i] for i in range(9))
    back = th.m[9] * xs[9]
    corr = -pitch - back
    maxc = 0.05
    if corr > maxc:
        corr = maxc
    elif corr < -maxc:
        corr = -maxc
    dm = 0.02 * 1.0   # corr_rate_max * dt
    if corr > last + dm:
        corr = last + dm
    elif corr < last - dm:
        corr = last - dm
    last = corr
    runs.append(corr)

out = {
    "par": {"posMin": POSMIN, "posMax": POSMAX, "tempMin": TMIN, "tempMax": TMAX, "lead": LEAD, "initVariance": INITVAR},
    "true": {"B": B},
    "positions": positions,
    "theta": list(th.m),
    "backlash_hist": backlash_hist,
    "backlash_final": 2.0 * abs(th.m[9] / SCALE[9]),
    "runs": runs,
    "run_cfg": {"maxCorrection": 0.05, "corrRateMax": 0.02, "dt": 1.0},
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
print(f"wrote {OUT}: backlash learned {out['backlash_final']:.5f} (true {B})")
