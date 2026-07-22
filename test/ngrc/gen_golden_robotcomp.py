#!/usr/bin/env python3
"""Golden vectors for RobotComp + CompCommissioner from the Python reference."""
import json, math, os, sys

REF = os.environ.get("NGRC_REF", "/workspace/ngrc/Testing/ngrc_ref")
sys.path.insert(0, os.path.dirname(REF))
from ngrc_ref.robotcomp import RobotComp, CompLimits   # noqa: E402
from ngrc_ref.commission import CompCommissioner        # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "golden", "robotcomp.json")

NJ, NW = 3, 3
C_TRUE = [1.0e-4, 2.0e-4, 1.5e-4]


def jac_at(t):
    return [[math.sin(0.2 * t + 0.7 * a + 0.3 * j) + 0.4 * math.cos(0.05 * t + a)
             for j in range(NJ)] for a in range(NW)]


def wrench_at(t):
    return [10.0 * math.sin(0.13 * t + a) for a in range(NW)]


def delta(jac, wrench, c):
    g = [sum(jac[a][j] * wrench[a] for a in range(NW)) for j in range(NJ)]
    return [sum(jac[a][j] * c[j] * g[j] for j in range(NJ)) for a in range(NW)]


# --- RobotComp: calibrate trajectory + a limited feedforward readout ---
rc = RobotComp(NJ, NW, init_variance=1.0)
theta_hist = []
for t in range(60):
    jac, w = jac_at(t), wrench_at(t)
    rc.calibrate(jac, w, delta(jac, w, C_TRUE))
    theta_hist.append(list(rc.theta.m))
ff = []
lim = CompLimits(deflect_max=1e-3, deflect_rate_max=2e-4, tau_max=8.0, tau_rate_max=1.0)
for t in range(60, 70):
    jac, w = jac_at(t), wrench_at(t)
    tau, dq = rc.feedforward(jac, w, limits=lim, dt=1.0)
    ff.append({"tau": tau, "dq": dq})

# --- CompCommissioner: submit poses (two touches, small disagreement) ---
com = CompCommissioner(NJ, num_wrench=NW, warmup=10, target_samples=200, consistency_tol=5e-4,
                       innov_floor=4e-4, innov_factor=6.0)
com_hist = []
for t in range(80):
    jac, w = jac_at(t), wrench_at(t)
    d = delta(jac, w, C_TRUE)
    d1 = [x + 1e-5 * math.sin(0.9 * t + a) for a, x in enumerate(d)]
    d2 = [x - 1e-5 * math.sin(0.9 * t + a) for a, x in enumerate(d)]
    acc = com.submit_pose(jac, w, d1, d2)
    com_hist.append({"acc": acc, "accepted": com.accepted, "rejected": com.rejected,
                     "quality": com.quality_pct, "theta": list(com.rc.theta.m)})

out = {"NJ": NJ, "NW": NW,
       "robotcomp": {"theta_hist": theta_hist, "ff": ff,
                     "compliance": rc.compliance, "stiffness": rc.stiffness},
       "commissioner": {"hist": com_hist}}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
print(f"wrote {OUT}: final compliance {rc.compliance}")
