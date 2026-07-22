#!/usr/bin/env python3
"""Golden vectors for CommStore from the Python reference."""
import json, os, sys

REF = os.environ.get("NGRC_REF", "/workspace/ngrc/Testing/ngrc_ref")
sys.path.insert(0, os.path.dirname(REF))
from ngrc_ref.commstore import CommStore     # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "golden", "commstore.json")

SIG = 0xABCD1234
theta = [0.123456789, -1.5, 42.0, 1e-7, -3.14159]
norm = [0.5, 2.0]

cs = CommStore(SIG, quality_floor=85.0, drift_limit=40.0, save_on_change=1e-3, recommission_sustain=5)
cs.register("theta", len(theta))
cs.register("norm", len(norm))
cs.capture({"theta": theta, "norm": norm}, quality=97.5, stamp=42)
blob = cs.to_blob()

# round-trip load into a fresh store
cs2 = CommStore(SIG, recommission_sustain=5)
cs2.register("theta", len(theta))
cs2.register("norm", len(norm))
ok_good, reason_good = cs2.load(blob)
restored_theta = cs2.restore("theta")

# corrupt payload -> checksum fail
bad = dict(blob); bad_payload = list(blob["payload"]); bad_payload[0] += 1e-6
bad["payload"] = bad_payload
cs3 = CommStore(SIG, recommission_sustain=5)
cs3.register("theta", len(theta)); cs3.register("norm", len(norm))
ok_bad, reason_bad = cs3.load(bad)

# wrong signature
cs4 = CommStore(SIG ^ 0x1, recommission_sustain=5)
cs4.register("theta", len(theta)); cs4.register("norm", len(norm))
ok_sig, reason_sig = cs4.load(blob)

# monitor hysteresis: 5 degraded scans -> recommission
mon = []
for i in range(7):
    rc = cs.monitor(quality=80.0, drift_pct=10.0, diverged=False)
    mon.append({"recommission": rc, "state": cs.state, "reason": cs.recommission_reason})

# autosave throttle
cs.state = 1
saved1 = cs.maybe_autosave({"theta": theta, "norm": norm}, 90.0)          # no change -> False
theta2 = list(theta); theta2[0] += 5e-3
saved2 = cs.maybe_autosave({"theta": theta2, "norm": norm}, 90.0)         # big change -> True

out = {
    "sig": SIG, "theta": theta, "norm": norm,
    "checksum": cs2.checksum, "blob_checksum": blob["checksum"],
    "load_good": [ok_good, reason_good], "restored_theta": restored_theta,
    "load_bad": [ok_bad, reason_bad], "load_sig": [ok_sig, reason_sig],
    "monitor": mon, "saved1": saved1, "saved2": saved2,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)
print(f"wrote {OUT}: checksum={blob['checksum']}")
