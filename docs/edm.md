# EDM — WHAT THIS METHOD CAN AND CANNOT DO ON A WIRE/HOLE-POPPER MACHINE

**Status: nothing here is measured.** This is a scoping document written before any EDM plant
exists in this repository, and its whole purpose is to say — in advance, so it can be checked
against later — which of the machine's two named problems this method's own evidence says it
should win, which it says it should not, and what data would settle it. Every number quoted is a
number from another plant in this project, cited so the reasoning can be audited.

The machine: a custom wire EDM and hole popper on one frame, B&R controls. The two stated
control objectives:

1. **ROUGHING** — cut speed without breaking the wire (and without arcing damage).
2. **FINISHING** — cut speed against surface finish and dimensional tolerance.

They are different problems and this method's evidence divides sharply between them.

---

## 1. WHAT THE DEPLOYED OBJECT ACTUALLY IS

Not a controller synthesiser. On all seven plants here there is **already a loop closed** and
this corrects its REFERENCE (`CLAUDE.md`, §52.32 — the line that narrows the product claim
against USLC/UP-OSI, which synthesise a controller for an unknown plant; this does not).

What ships is `lib/pilot/deploy.js`: **117 lines, importing nothing** — a feature row from a
window of the COMMANDED reference, a dot product per channel, a smoothstep coverage guard and a
clamp. 102-330 MAC per decision. Everything else in `lib/` is commissioning or the plant
simulator (`test/inventory.test.mjs`: 1 module of 69 deploys).

Two properties decide whether a problem fits it:

- **The window MUST STRADDLE NOW.** Causal-only taps read **0.89x — worse than doing nothing —
  against 1.43x for the same count, span and spacing translated across now** (§49.14). The
  correction works because it is in place BEFORE the error arrives. It is preview.
- **The correction must be a function of the commanded reference.** The information the
  reference carries about the correction is exhausted at R² ≈ 0.84 on the arm and **six
  independent capacity experiments failed to move it** (§52.36). What the reference cannot
  express, this object cannot correct, at any basis.

So the question for EDM is not "is the plant hard" — it is **"is the error a deterministic
function of the commanded geometry, known ahead of time?"** Where the answer is yes, this method
is on its home ground. Where it is no, it has nothing to add and should refuse.

---

## 2. FINISHING — THE PROBLEM THIS METHOD IS SHAPED FOR

Skim passes are, structurally, the arm's problem:

| the arm | wire EDM finishing |
|---|---|
| commanded toolpath, repeated laps | commanded contour, repeated skim passes |
| tool lags and bends under load | wire lags and bows against the feed |
| corner error from compliance + preview-able geometry | corner rounding/undercut from wire lag |
| error is repeatable to 0.03% | the same part cut twice repeats |
| ground truth from a laser tracker at commissioning | **ground truth from measuring the cut part** |

Wire lag in a finishing pass is small, stable and **geometric** — it is a function of feed,
kerf, wire tension, flushing and the local curvature of the commanded path, all of which are
either constants of the pass or known from the program ahead of time. Corner strategies in
commercial controls (slow into the corner, modify the offset) are exactly a hand-written
version of what `distil.js` regresses from measurement.

**And this closes an open question in this project's own north star.** `CLAUDE.md` states, as
an unmeasured gap: *"Still unmeasured: a touch probe on the cut part, which is the instrument a
shop actually owns, and which supplies one rms per run rather than truth per sample."* A wire
EDM finishing pass is precisely that instrument: you cut, you measure the part on a CMM or a
comparator, and you get **one geometric error profile per pass, indexed by position along the
contour** — which is richer than one rms and poorer than truth per sample.

Why that matters commercially is already priced here from the other side: §50.1 measured the
tracker as worth **1.50x above the best noisy reading and 2.3x above sigma 1e-3**, and §52.42
measured the best PERMANENTLY-MOUNTED alternative at **1.72x against the tracker's 6.63x** —
a 3.9x instrument premium. A measured part sits between those two cases and nothing here has
measured it. **On this machine the instrument is free**: the part must be measured anyway.

The iteration structure is also already built and measured twice. `hff` converges a lap-indexed
correction (the "skim pass N+1 offset table"); `distil` regresses that converged correction onto
a window of the commanded reference and **deploys the regression instead of the table**, which
is what makes it survive a change of part. The numbers that motivate the swap: the converged
table reads **0.53x — worse than nothing — on a trajectory the machine has not run**, confirmed
independently by a textbook norm-optimal ILC reading 0.53x there too; the distilled policy reads
**33.15x** on that same trajectory (§50). A per-part offset table is a memory. The regression of
it is a model.

**Prediction, stated so it can fail:** on finishing passes, a preview feedforward on the
commanded contour, distilled from measured part error, should beat a per-part corner/offset
table on a part it was not fitted on, and should be within the noise of it on the part it was.
If it is not within 1.3x of the table on the table's own part, this route is wrong for EDM and
the honest answer is a per-part calibration — which is a different product.

---

## 3. ROUGHING — WHERE THIS METHOD'S EVIDENCE SAYS IT SHOULD REFUSE

The roughing objective is **not a tracking problem**. The optimum sits ON the stable/arcing
boundary: faster is better until it is catastrophic, and the constraint is a stochastic process
— debris in the gap, flushing quality, wire wear — not a deterministic function of the
commanded path. The Karalic (1997) EDM dataset shows the human doing exactly this: the operator
drives to the boundary and backs off, and the two knobs (gap, flow) are never moved together in
any of its 154 rows, so the policy is separable and monotone. That is a constraint-follower, not
a trajectory inverter.

A preview feedforward on the commanded reference has **nothing to say about a stochastic
constraint**, and this project's own gate should refuse it. Which is the useful part: on the
cart-pole, the pilot **refused all four seeds with a stated reason** once the loop beneath it
was properly tuned (§52.32), and on Wood-Berry a representative-program verify turns 9 harmful
deployments out of 12 into 12 refusals. A method that refuses roughing gap regulation and
deploys on finishing geometry is behaving correctly, not failing.

**But there is a preview-shaped sub-problem inside roughing, and it is the one that breaks
wire.** The events that concentrate discharge energy and precede a break are largely **known
from the program**:

- **corners and small radii** — the arc of contact and the flushing both change;
- **workpiece height steps** — the number of simultaneous discharges scales with height, so a
  step in height is a **step change in plant gain**; commercial controls take a height input for
  exactly this reason;
- **entry, exit and breakthrough** — the flushing regime changes discontinuously;
- **slot vs open cut / approaching a previously cut region** — flushing again.

Every one of these is a function of the commanded geometry, available ahead of time. A
feedforward that reduces the commanded feed BEFORE a height step, rather than a gap servo that
reacts after the voltage collapses, is preview and is what this object does. The plant's
response to a feed change is slow relative to the discharge rate, which is the same argument
that makes preview necessary on the arm (§52.26: feedback through the command cannot reach what
it predicts when the plant answers hundreds of steps later, so *"preview is the only correction
that can be in place when the error arrives"*).

**So the honest split of roughing is:**

| sub-problem | fits this method? |
|---|---|
| gap regulation against the arcing boundary | **no** — stochastic, not a function of the reference. Keep the conventional gap servo. |
| geometry-scheduled feed (corners, height steps, entry/exit, flushing regime) | **yes** — this is preview on the commanded reference |
| deciding how close to the boundary to sit | **no** — that is a constraint/economics problem, not this |

The second row is worth having: it is the row the wire actually breaks on.

---

## 4. THE ARCHITECTURE ON B&R, AND THE RATE SPLIT

EDM gap sensing is per-discharge — microseconds. The deployed object runs at the PLC cyclic
rate. These are different machines and conflating them is the units error this project has paid
for three times (§51.5, §52.8, §52.33).

```
  FAST  (µs, FPGA / X20 pulse hardware / analogue front end)
        ignition-delay measurement, pulse classification A/B/C (open / effective / arc-short),
        per-pulse energy, immediate short retract.  NOT this method.

  SLOW  (PLC cyclic task, 400 µs - 1 ms)
        the conventional gap servo: feed command from averaged pulse statistics.  Already exists.
        + THIS METHOD: a feedforward correction on the FEED (roughing) or the OFFSET/feed
          (finishing) reference, from a window of the commanded geometry.
        102-330 MAC per decision.  The 10%-of-scan budget rule is a B&R cyclic-task budget.
```

The deployed artefact is `DistilPolicy.toJSON()` — **~1.8 kB of JSON**: the weight vector per
channel, the window offsets, one cap, one speed span. `lib/pilot/deploy.js` is the
implementation note; porting it to Structured Text or ANSI-C in an X20 cyclic task is a page of
arithmetic with no library. `test/pilot/artefact.test.mjs` asserts the reference implementation
and the deployed one agree **bit-exactly** over 4,000 random windows and `EXPORT=<path>` writes a
conformance vector, so a B&R port can be checked in Automation Studio without running this
repository at all. That pair exists precisely so the deliverable is checkable by someone who
does not have this code.

The **coverage guard** matters more on EDM than it did on the arm: outside the commanded-speed
span the fit saw, the correction FADES to zero rather than extrapolating (measured: feeds above
the trained span read 1.17-1.19x, uncorrected rather than harmed — §52.40). On a machine where
extrapolating a feedforward means breaking wire, a guard that refuses to act outside what it was
shown is the property you want, and it is already the shipped behaviour.

---

## 5. WHAT WOULD HAVE TO BE BUILT, AND THE GATE

**The gate is data, and it is not a simulator.** There is no public EDM time-series dataset
that gives gap dynamics — a search for one found response-surface/DoE tables in abundance
(pulse-on-time vs Ra vs MRR) and no dynamic records. Building an EDM simulator from a published
structure and then commissioning this controller on it would be **rule 15 exactly**: a model and
a controller built on the same assumptions cannot check each other, and the resulting number
would be a statement about my simulator. None of the seven plants here came from a dataset —
Wood-Berry is a 1968 transfer-function matrix, the quadruple tank is Johansson's model, EMPS is
the one real-data plant and it ships with both an identified model and full I/O records — so
the precedent is a *published model*, not a dataset, and no citable EDM gap/flush dynamic model
with parameters has been found.

**The machine removes the gate.** Real commissioning records from the actual machine are worth
more than any published model, and they cost nothing extra to collect while the machine is being
built and tuned. What to log, so a plant can be IDENTIFIED rather than invented:

### The logging spec

At the PLC cyclic rate, time-stamped, for every cut (roughing and finishing alike):

| channel | why |
|---|---|
| commanded position (all axes) and commanded feed | the reference — the input the whole method is a function of |
| actual position | to separate servo error from process error |
| **commanded gap-servo setpoint and its output feed** | the loop this corrects the reference of |
| average gap voltage | the conventional gap observable |
| **mean ignition delay** | the better gap observable; the thing a preview correction would move |
| pulse counts per class per cycle (open / effective / arc / short) | the constraint. The arcing boundary is defined here, and it is what "how close to the edge" means |
| wire tension, wire feed rate, wire wear indication | the roughing constraint's other axis |
| flush pressure (upper and lower) | the disturbance that dominates and is partly commanded |
| workpiece height (if known/measured) | the plant-gain schedule |
| pulse generator settings (on-time, off-time, current, open voltage, servo reference) | the operating point; a constant per pass, but it must be recorded or the pass is unlabelled |

At the per-cut rate:

| channel | why |
|---|---|
| **the measured part** — CMM or comparator profile, indexed by position along the contour | the commissioning truth. This is the whole finishing route. |
| surface finish (Ra) per pass, per region if it varies | the finishing objective's other axis |
| wire breaks: timestamp, position along the contour, and the 5 s of log preceding | the roughing objective. Every break is one labelled example of the boundary, and there are never many. |

Two things about that list are load-bearing:

- **The break log is the most valuable thing on it and the easiest to lose.** A break is rare,
  and what precedes it is the only direct evidence of the boundary. A ring buffer that dumps on
  a break costs nothing and cannot be reconstructed later.
- **Pulse classification counts, not just average voltage.** The average voltage is what the
  conventional servo uses and it is a lossy summary of exactly the distinction (spark vs arc)
  that decides whether the wire survives. Rule 17: the instrument fails before the model.

### What would then be built, in order, with each step's falsifier

1. **A plant identified from those logs** — feed → gap-observable dynamics at a fixed operating
   point, plus the height-step gain schedule. Falsifier: it must predict a HELD-OUT cut it was
   not fitted on, at R² stated. If it cannot, no controller result on it means anything.
2. **The finishing route first**, because it is where the evidence says this wins: distil a
   measured-part error profile onto a window of the commanded contour, and score it on a part
   the fit never saw. Falsifier: `CLAUDE.md` target 1 — within 1.3x of a per-part commission on
   every part in the set, **with none made worse**.
3. **The roughing geometry schedule second**: feed feedforward at height steps and corners,
   scored on breaks-per-metre and on cut time, with the gap servo untouched underneath.
   Falsifier: it must not increase breaks. A method that goes faster and breaks more has not
   solved the problem.
4. **The gap-regulation problem is NOT on this list** and should be refused until something
   changes, because nothing in this project's evidence supports a preview feedforward against a
   stochastic constraint.

**What is not claimed:** none of the above is measured. This document exists so that when it is,
the predictions can be read against what was written before the measurement rather than after.
