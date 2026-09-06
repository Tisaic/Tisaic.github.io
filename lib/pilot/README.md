# lib/pilot — route, limit, run, deploy

## What is in here

This directory grew past the one module this file used to describe, and a README that names
only `pilot.js` is rule 30 aimed at itself. Every entry states what it is addressed by, because
that is the distinction the whole design turns on: a component addressed by the machine's STATE
transfers to a program it has never run, and one addressed by POSITION IN A LAP does not.

| Module | What it is | Addressed by |
|---|---|---|
| `pilot.js` | The receding-horizon controller described below: settle → probe → excite → fit → verify → deploy-or-refuse, over a box-constrained QP. | machine state |
| `classic.js` | The conventional rung, self-tuned — a static feedforward in the reference's own state `[a, v, sign v, 1]`, fitted on the machine. | reference state |
| `stack.js` | A cascade of pilots: layer k models what layers 1..k−1 left, each frozen beneath it. | machine state |
| `distil.js` | The distilled iteration. Lap-indexed iteration converges to a correction worth *less than nothing* on a trajectory the machine has not run; this regresses that converged correction onto a local window of the commanded reference and deploys the regression. Window must straddle now. Fit streams. | commanded reference |
| `hff.js` | Harmonic feedforward: invert the machine at the lap's own harmonics. **A memory** — it is retired by the north star and kept because it is the thing distillation distils, and because its operator is a plant model even though its table is not. | lap phase |
| `twin.js` | Identify a parametric twin, simulate it, compile a lap-1 feedforward in software. | simulated state |
| `rls.js` | Shared-covariance recursive least squares — one covariance, many targets. The online fit for everything above. | — |
| `ensemble.js` | Average k commissioning draws into one weight vector; free at deploy. | — |
| `excite.js`, `banks.js`, `refine.js` | Excitation design, corner banks, refinement. | — |
| `autostack.js` | **One button.** Commissions the ladder, scores every rung on the machine, ships the best prefix. | — |

`distil.js` is not yet a rung of `autostack.js`, so the one press does not reach it.

## `pilot.js` in detail

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
