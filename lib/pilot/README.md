# lib/pilot — route, limit, run, deploy

A controller commissioned by one button, told nothing about the plant. Built on the
NGRC discipline — window features, ridge readouts, everything measured — plus the
box-constrained QP from `lib/blackbox/qp.js`. Imports no plant knowledge: the boundary
is the directory, same as `lib/blackbox/`.

**The engineer does four things.** *Route*: measured signals in, one correction per
control channel out, a tracker's error during commissioning only, the command's
look-ahead at runtime. *Limit*: per channel a position box and velocity / acceleration /
jerk ceilings, a correction cap, guard signals with abort ceilings, an optional workspace
predicate. *Run*: one call sequence — settle, probe, excite, fit, verify. *Deploy*: only
if the verify round measured an improvement on the machine itself.

**What the run does, all measured.** The probe steps each channel's correction and
records the truth's full response — the timescale sets the sample grid, the window
reach and the QP horizon. The excitation is 3-pole filtered noise (a multisine is
rank-deficient in a lag window — measured 10x worse on held-out trajectories), blended
onto the machine's pose with a C² quintic (a cosine ease's endpoint acceleration step is
a jerk violation the interior never shows), and every limit is verified on the commanded
sequence itself. Windows and ridge are chosen per channel on held-out data. Per-lead
forecast readouts are made consistent with the probe's response by subtracting its
convolution. The verify round runs the finished controller against doing nothing,
interleaved, at quarter rates (an effort weight priced on a maximally busy trajectory is
priced wrong — measured), picks λ smoothest-within-5%, and refuses to deploy anything
the machine did not vouch for.

**Runtime.** A warm-started projected-gradient box-QP over the forecast ladder, fixed
iteration count — the worst case is the average case, which is what a cyclic task
budgets.

**Not built, and what would change the answer** (each stated in `pilot.js`): linear
readouts only; SISO per channel with cross-coupling measured and reported; the probe
response taken at one pose; guards armed during excite/verify only.

Tests: `test/pilot/` — the excitation contract, the full pipeline on a plant that shares
no physics with the arm (refusal and guard-derate paths included), and the arm end to
end at full tier. Measurements: `docs/history/flexisim.md`, brick 35.
