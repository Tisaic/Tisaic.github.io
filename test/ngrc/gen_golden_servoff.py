#!/usr/bin/env python3
"""Golden vectors for ServoFF from the Python reference."""
import json, math, os, sys

TESTS = os.environ.get("NGRC_TESTS", "/workspace/ngrc/Testing")
sys.path.insert(0, TESTS)
from experiments.servo_ff import ServoFF, DriveLimits, commission_gms_thresholds   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "golden", "servoff.json")

EPS = 0.002
N, WARMUP, DT, D = 140, 70, 0.001, 2
A, W = 1.0, 2.0 * math.pi * 2.0


def clampi(i):
    return 0 if i < 0 else (N - 1 if i > N - 1 else i)


ref = []
for i in range(N):
    t = i * DT
    ref.append({"th": A * math.sin(W * t), "v": A * W * math.cos(W * t),
                "a": -A * W * W * math.sin(W * t), "dT": 0.01 * i})

meas, tau = [], []
for i in range(N):
    r = ref[clampi(i - D)]
    m = {"th": r["th"], "v": r["v"], "a": r["a"], "dT": 0.01 * i}
    meas.append(m)
    tau.append(0.5 * m["a"] + 0.2 * m["v"] + 0.3 * math.tanh(m["v"] / EPS) + 0.15 * math.cos(m["th"]))

gms = commission_gms_thresholds(1.0e-3, n=2)
lim = DriveLimits(vel_max=8.0, acc_max=300.0, dec_max=300.0, jerk_max=5.0e5, tau_max=50.0, tau_rate_max=2000.0)
est = ServoFF(DT, lag_deltas=(1, 3), max_preview=5, npole=8.0, gearh=(2, 3), lam=1.0,
              directional=True, warmup=WARMUP, limits=lim, gms_thresholds=gms)


def ref_at(t):
    return lambda off: ref[clampi(t + off)]


ffs = []
for t in range(N):
    ffs.append(est.step(meas[t], tau[t], ref_at(t)))
res = est.commission()

# a couple of pure-function checks for the GMS threshold commissioner
gms_cases = [{"d": 1e-3, "n": 4, "dec": 1.8, "out": commission_gms_thresholds(1e-3, 4, 1.8)},
             {"d": 2e-4, "n": 1, "dec": 1.8, "out": commission_gms_thresholds(2e-4, 1, 1.8)},
             {"d": 5e-3, "n": 3, "dec": 2.0, "out": commission_gms_thresholds(5e-3, 3, 2.0)}]

out = {
    "params": {"N": N, "warmup": WARMUP, "dt": DT, "gms": gms},
    "ref": ref, "meas": meas, "tau": tau,
    "ffs": ffs, "theta": list(est.theta.m),
    "tau_scale": est.tau_scale, "fault_count": est.fault_count, "outlier_count": est.outlier_count,
    "commission": {"active": res["active"], "n_active": res["n_active"], "n_total": res["n_total"],
                   "preview": res["preview"], "preview_confident": res["preview_confident"],
                   "contrib": res["contrib"]},
    "gms_cases": gms_cases,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
print(f"wrote {OUT}: n_active={res['n_active']}/{res['n_total']} preview={res['preview']} "
      f"kept={res['active'][:6]}")
