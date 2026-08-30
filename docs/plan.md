# The plan to reach the north star

Written against `CLAUDE.md`'s **THE NORTH STAR**. Every step below names the measurement that
decides whether to continue, because a plan whose steps cannot fail is a wish list.

## What the record already settles

Three findings make this plan shorter than it looks, and all three are measured rather than
assumed.

**Three of the four layers already transfer.** The conventional rung fits in the reference's
own state. The pilot cascade models what the layer below it left, and transfers to a signal
the machine has never run — 26.0x on a two-tone sine where a phase-indexed table is worth
0.55x, *worse than nothing*. And the harmonic rung's OPERATOR is a plant model that transfers
too: measured on a program it was not fitted on, 0.61 against 0.60 at home. Only the harmonic
rung's TABLE is a memory.

**So the problem is one component, not the architecture.** The table is the part addressed by
position in a lap, and it is the part that dies on a change of program or feedrate.

**And the gap it fills is about 1.9x, not 130x.** On the arm the cascade alone reaches 10.94x
and the composite 20.34x. The 130x figure in the record is the EMPS axis's model-error against
lap-repeatability, which is the hardest case; the arm's gap is a factor a better model could
plausibly close.

## What `lib/ngrc/` already has, and what it is worth here

**Seven of its fifteen modules — about 1700 of 2700 lines — are reachable only from their own
tests.** They are ported and golden-checked against the Python/ST reference, which is a
parity claim and NOT a performance claim on this arm; none of them has ever been scored on a
FlexiSim plant except `ServoFF`. That is the caveat on everything below. What follows is
what each would be FOR, and the measurement that would decide it.

### `servoff.js` (267 lines) — the strongest single candidate

Self-commissioning feedforward torque over a "Universal Servo Basis" that HAS coulomb,
Stribeck and viscous terms in it, plus GMS pre-sliding, preview delay, significance pruning,
directional forgetting and output guards. It learns the required-torque map from the closed
loop's own behaviour **while the existing feedforward is still driving**.

Compare `lib/pilot/classic.js`, the rung this ladder actually ships: it fits `[a, v, sign v,
1]`. `sign v` is a crude coulomb term with no Stribeck and no pre-sliding, and it is a
STATE-ADDRESSED model, so whatever it learns transfers by construction.

- **Targets 1, 2, 5** — a better transferable rung is exactly the thing the north star says
  is being out-scored by a memory.
- **Target 4** — it learns while the machine runs. No dedicated commissioning laps at all.
- **Already pointed at this arm.** `test/flexisim/servoff.test.mjs` exists and states the
  two-sided claim properly: on a plant with friction the learned feedforward wins because the
  hand model is missing a real term; on a plant without it, it loses, because a fit to an
  exact model can only add variance.
- **Caveat:** single axis. The arm is two coupled axes, and the coupling is the thing
  `RobotComp` handles with a 2x2. Per-axis ServoFF plus the existing compliance may be the
  shape, and that is a measurement, not a guess.

**Decides it:** ServoFF in place of `classic.js` in the ladder, scored on the Phase 0 bench.
It has to beat 1.24x — what the conventional rung is currently worth on the arm — and it has
to do it on the WORST cell.

### `continuous.js` (407 lines) — the forecast layer the pilot hand-rolls

An online NARX forecaster with **direct multi-horizon readouts**, difference-target,
guards + per-variable clamp, auto-normalization, adaptive/directional forgetting, snapshot
and restore — and a **gray-box residual mode (`baselineFn`)**.

That last one is the cascade's own structure as a first-class feature: layer k models what the
layers below it left. `lib/pilot/stack.js` builds that by stacking whole Pilots, each with its
own commissioning cost; `Continuous` expresses it as one model with a baseline function.

- **Target 5** — the pilot is AT its forecast bound, measured. This is a richer forecaster.
- **Target 4** — if a gray-box baseline replaces a stacked layer, a cascade level stops
  costing a full commission.
- **The trap, and it is on the record:** *a forecast is not a controller.* Every model in
  brick 63 that predicted deflection well made the machine WORSE applied directly, because
  |G| runs 1.2 to 0.09 with phase +36 to -38 degrees. The QP INVERTS this model, and the
  record is explicit that regularisation there serves the inversion rather than the fit. A
  better held-out R^2 is not the acceptance test; the machine score on the bench is.

### `commission.js` (179 lines) — move basis search OFF the machine

Offline model search: linear-first, deploy linear if its held-out error clears the gate;
otherwise fit the full universal map, rank features by contribution, and keep the SMALLEST
subset within a margin of the full error. Gating is PER TARGET so an easy channel cannot mask
a hard one.

The pilot solves a thinner version of this by offering a quadratic block and picking on
held-out data. The harmonic rung solves a different version by scoring 24-48 candidates ON
THE MACHINE.

- **Target 4, directly.** An offline search over a log costs zero machine time.
- **Caveat, and it is the one that matters:** the record says the fit ranks probe designs
  BACKWARDS — on both plants measured, the best-fitting candidate was the worst controller.
  So an offline screen may prune the winner. It must be validated against a full machine
  sweep before it is trusted to prune anything, and if it disagrees, that disagreement is
  itself the finding.

### `commstore.js` (168 lines) — the missing half of "commission once"

Versioned payload with a config signature and a BigInt checksum; loads on startup and FAILS
SAFE on any mismatch rather than applying a stale compensation; a health monitor that raises a
recommission request with hysteresis; throttled autosave.

Nothing in `lib/pilot/` persists anything. Every commission is thrown away when the page
reloads, which is why "commission once per plant" is not currently a thing the product can
do even when the model would allow it.

- **Targets 1, 2 and 4** — this is the storage and lifecycle half of Phase 3B, already built.
- **And the drift half nobody has planned for:** a controller that transfers still has to
  notice when the PLANT has changed. The health monitor with hysteresis is exactly that, and
  it fails safe, which is the refusal discipline this project already applies everywhere else.

### The rest

- **`afm.js` + `afm_select.js` (376)** — online feature selection with working-set
  Gram/admit/screen and a frozen-inference `Runner`. `pilot.js` borrows the AFM's structured
  prior BY COMMENT and none of its selection machinery.
- **`axiscomp.js` (97)** — ballscrew pitch and BACKLASH position compensation. The Path tab
  is the only tab that runs with backlash on, because it is the only one whose metrics can
  see it, and nothing on it compensates backlash explicitly.
- **`autotune.js` (139)** — offline commissioner for `Continuous`: linear-first, ridge sweep,
  free-run stability REJECT, derived clamps and a windup bound. Pairs with `continuous.js`.
- **`dropin.js` (86)** — turnkey front-end, angular `[sin,cos]` auto-embed. Least relevant
  here; the arm's channels are already handled.

### How this changes the phases

Phase 2's candidate list was written as "improve the pilot's forecast". It should read: **the
pilot's basis and forecaster are a restricted re-implementation of blocks that already exist,
tested, in this repository.** The order changes accordingly, cheapest decisive experiment
first:

1. **ServoFF against `classic.js`** on the bench. Smallest change, strongest prior, and it
   attacks commissioning cost and transfer at the same time.
2. **`commission.js`'s offline search against the harmonic rung's on-machine sweep** — not to
   replace it yet, but to find out whether an offline screen agrees with the machine. If it
   does, 24-48 runs come out of every commission. If it does not, that is a sharper statement
   of the "fit ranks them backwards" finding than currently exists.
3. **`CommStore` wired to `AutoStack`.** Independent of which route Phase 3 takes, and it is
   what makes "commission once" mean anything across a page reload.
4. **`Continuous` as the pilot's forecaster**, last of the four, because it is the largest
   change and the one most exposed to the forecast-is-not-a-controller trap.

## Phase 0 — build the bench, because transfer cannot be optimised unmeasured

Nothing else in this plan is steerable without this, and it is the single largest gap in the
project's instrumentation today: **the contract bar is one program at one feedrate.**

- A `transfer.test.mjs` that commissions ONCE and scores a matrix: programs (rounded 8x8,
  rounded 10x6, circle r3, circle r5, sharp 9x7) x feedrates (1e-3, 2e-3, 4e-3, 1e-2).
  Report the matrix, the worst cell, and the ratio to a per-cell commission.
- The headline becomes the WORST CELL, not the home cell. A method that wins at home and
  loses at 1e-3 has not improved anything.
- Wire the same matrix into the page's Sweep, so the degradation is visible rather than
  inferred.

**Decides:** nothing yet. It is the instrument. Cost: ~1 day, and every later number depends
on it.

## Phase 1 — baseline the transferable half honestly

Run the bench on cascade-only (no harmonic rung) and on the full ladder.

**Expected from the record:** cascade-only 2.48x-10.94x across programs; the full ladder
better at home and worse or catastrophic away. If the full ladder is NOT worse away, the
premise of this plan is wrong and the north star needs rewriting — which is exactly the
check worth running first.

### Phase 1 ANSWERED — and harder than the plan assumed

`test/flexisim/bench.test.mjs`, one commission on the home cell, the matrix scored twice from
the SAME commissioned object with only the lap-periodic rung armed or disarmed:

```
FULL LADDER              1e-3     2e-3     4e-3     1e-2
  rounded 8x8           1.22x    2.41x   13.93x*   6.62x
  rounded 10x6          1.60x    2.82x    9.20x    4.59x
  circle r3             1.17x    1.87x    6.10x    9.05x
  circle r5             1.22x    1.23x    2.55x   15.98x
  sharp 9x7             1.22x    1.52x    2.36x    4.29x

MODEL LAYERS ONLY        1e-3     2e-3     4e-3     1e-2
  rounded 8x8           3.18x    4.80x    6.66x*   6.56x
  rounded 10x6          4.37x    5.62x    6.79x    4.66x
  circle r3             2.88x    3.73x   17.19x    7.84x
  circle r5             3.01x    2.95x    5.95x   13.60x
  sharp 9x7             1.45x    1.68x    2.39x    4.19x
```

**The premise held, and then went further than it claimed.** The plan assumed the memory wins
at home and fails to transfer. It does not merely fail to transfer — **it is a net negative
across the envelope**:

- **model-only beats the full ladder in 14 of the 20 cells**
- **geometric mean 4.53x against 3.11x — disarming the memory is 1.46x BETTER overall**
- worst cell 1.45x against 1.17x; home/worst spread 4.6x against 11.9x
- neither configuration made any cell worse than the conventional machine

**And it is not only a feedrate effect.** The largest single loss is `circle r3` at **4e-3 —
the commissioning feedrate** — where the model alone reaches 17.19x and the full ladder 6.10x.
A change of SHAPE at the speed it was tuned on costs 2.8x. So the memory is brittle in both
axes it was suspected of, and the one number it earns — 2.09x at home — it repays at 0.81x on
the worst cell, i.e. it makes the worst cell WORSE.

**What this decides.** Phase 3A is no longer conditional on Phase 2 succeeding: the ladder is
better off, today, without the lap-periodic rung anywhere except its home cell. The remaining
question is not "can a model replace the memory" but "how much of the memory's 2.09x home
advantage can a model recover" — a smaller and much better-posed question, and one where the
model layer starts 1.46x ahead rather than 2.09x behind.

The default ladder should stop deploying the harmonic rung unless the program it was
commissioned on is the program being run — which the machine can check, and currently does
not.

## Phase 2 — THE DECIDING EXPERIMENT, run early because it chooses the route

The north star's own falsification clause: **can a model-based layer, given the same
commissioning budget, reach within 1.3x of the lap-periodic table on the table's own
program?**

Three candidate improvements to the pilot's forecast, each already pointed at by a
measurement:

1. **Pose-scheduling on the ACTUAL applied torque.** The composite measured held-out R^2
   across programs: static/commanded 0.20, +memory 0.68, pose-scheduled on COMMANDED torque
   0.66 (nothing), actual torque +memory 0.77, **actual +memory +pose-scheduled 0.84** —
   against a shuffled-target control of 0.46. The pilot observes torque already; it does not
   pose-schedule. This is the cheapest test and has the strongest prior.
2. **NGRC as the forecast basis.** `lib/ngrc/` is a golden-vector-tested nonlinear vector
   autoregression built for exactly this shape — lag window plus polynomial features — and
   it is not used by the pilot, whose basis is a linear ARX with an optional quadratic block.
   The NGRC page already measures it against an ESN, an MLP and a linear ARX on prediction.
3. **A window that REACHES the mode** (rule 37), and multi-rate lags. Measured twice: linear
   features with the right window beat a 544-feature map with the wrong one at a third of
   the cost.

**Every candidate is scored ON THE MACHINE across the Phase 0 bench, never on fit.** The
record is unambiguous that fit ranks these backwards: on both plants measured, the
best-fitting probe design is the worst controller. Selection by rule 42 — within 5% of the
best measured improvement, take the cheapest.

**~~Decides the route~~ — THE ROUTE IS DECIDED, BY INSTRUCTION.** The memory is retired and the
controller is PLANT, not PATH; alternative algorithms replace what the lap rung was doing.
Phase 3B (make the memory cheap and honest) is DEAD and Phase 3A is the road.

So this phase is no longer a fork, it is a SEARCH, and its bar changed with it. It was "within
1.3x of the table on the table's own program" — that measurement has now been taken on the arm
and the answer is **2.91x apart** (model layers 5.3554e-2, table on top 1.8387e-2), which under
the old framing would have triggered the rewrite clause. It does not any more. The bar is the
ENVELOPE: within 1.3x of a per-program commission on every program and feedrate, none worse
than the conventional machine.

**AND CANDIDATE 1 IS ALREADY BUILT, which this file did not know.** "The pilot observes torque
already; it does not pose-schedule" is stale: `schedTerms` multiplies the whole lagged block by
the normalised command, `_row` offers linear / linear+quadratic / linear+scheduled per CHANNEL,
and the choice is made on held-out data under the structured prior. What was missing was any
way to see which one a run picked — the ladder reported none of it — and that is now in the
rung row beside `N` and the iteration count.

**SO THE ORDER CHANGES, and the new first candidate has the strongest claim to what the table
was doing:**

0. **~~ONLINE ADAPTATION~~ — MEASURED, AND FIRST-ORDER LMS IS NOT THE REPLACEMENT.**

   The hypothesis was sound: a frozen model is stuck at its commissioning residual, while one
   that keeps updating converges on what the machine is doing NOW and is still addressed by
   STATE, so it transfers. `Pilot.adapt` implements it as normalised LMS per lead. Run on the
   EMPS axis — chosen because the controlled quantity IS the measured one, so the truth is a
   production signal and the algorithm is not confounded with the sensing question — one
   commissioned model, weights restored between settings, 20 laps, scored on the program AND
   on a two-tone sine it has never run:

   ```
     mu  clamp  stride   program   held-out sine   updates    drift
   frozen    —      —     12.70x       8.27x           —        —
    0.05  0.25      8     12.72x       8.26x         6785    0.010   FROZE
    0.4   0.25      1     12.69x       3.39x         6841    0.008   FROZE
    1.5   0.25      8     12.74x       8.18x       124719    0.039
    1.5   0.25      1     12.59x       1.03x       124775    0.037
    1.5      4      1     12.02x       0.98x       124775    0.121
   ```

   **The best case is +0.3% on the program it can see and −1% on the one it cannot**, and the
   more thoroughly it adapts the worse transfer gets: adapting EVERY lead takes the held-out
   sine from 8.27x to **0.98x — worse than doing nothing**. That is the failure the retirement
   exists to avoid, arriving from the direction that was supposed to prevent it.

   **THREE APPARATUS FAULTS HAD TO COME OUT FIRST and every one produced a plausible null.**
   The report was read from `status().report`, which is the COMMISSIONING report and carries no
   live adaptation state, so every row printed `updates: 0` while the machine moved. Then the
   freeze guard was found to RATCHET — `e0` was assigned only when a window improved, so it
   walked down to the best window ever seen, and three consecutive windows above that MINIMUM
   froze the law. And its window was counted in UPDATES rather than time, so its duration
   depended on `leadStride`: 28 samples at stride 8, under FOUR at stride 1, against a
   6240-sample lap. Fixed, the guard still fires on most settings — which on this evidence is
   it doing its job.

   **WHAT IT DOES NOT KILL.** This is first-order LMS on the deployed readout, not adaptation
   in general. The principled version is SECOND-ORDER: online RLS maintains the exact ridge
   solution over a forgetting window instead of taking a gradient step per sample, and it is
   the same object `lib/ngrc/primitives.js` already implements and golden-tests.
   **AND IT IS ALREADY REQUIRED BY TARGET 6.** The PLC budget says batch
   normal-equations-and-Cholesky is an offline algorithm that must become shared-covariance
   RLS to run online at all. So the fit this project has to build for cost reasons IS the
   adaptation mechanism done properly, and the two threads are one piece of work rather than
   two. *That is the next thing to build, and it is the first time both halves of the north
   star have pointed at the same code.*
## Ideas from the wider field that survive these constraints

The constraints do most of the filtering. Anything needing an unbounded solver, a per-plant
prior, or a training budget measured in episodes is out before it is considered. What follows
survived, and each is tied to a measurement THIS project already made — that is the reason to
believe it applies here rather than in general.

### 1. The predictive variance the RLS already computes and throws away

`primitives.rls()` returns `innovVar` = `x'Px`, the predictive variance implied by the
parameter covariance, **on every single update**. `continuous.js` stores it as `confidence`.
`lib/pilot/` never asks for it. This is a Bayesian/GP-flavoured quantity without any of the
GP cost, and it is a by-product of arithmetic already being done.

Three uses, each attacking a stated target:

- **Per-lead trust in the QP.** `boxQP` already takes an optional per-lead weight; the
  held-out weights measured *exactly neutral* (3.40x -> 3.40x, identical to four figures) and
  ship OFF. A variance-derived weight is a different quantity, principled, and free.
- **Refusal by extrapolation distance.** `x'Px` is large exactly where the operating point is
  poorly covered by the training data. That is a stateable reason to decline — a much better
  one than a threshold — and it serves the "robust and tolerant" half of the claim directly.
- **A commissioning STOPPING rule.** Stop exciting when the parameter variance stops falling
  rather than after a fixed budget (target 4).

**Cheapest experiment:** log `innovVar` alongside the existing forecast diagnostics during one
commission and check whether it rises where the bench's worst cells are. If it does, it is a
transfer predictor the machine can compute at run time.

### 1b. MEASURED — and it retires idea 2's forecast claim while finding a better use

The leverage was read on a three-layer cascade, where this project's hard forecasts actually
live (a layer models the residual of an already-good controller — less signal, more noise,
every lap):

```
layer 1   R² 0.991 → far 0.987   leverage 7.73e-5 → 7.78e-5   ratio 1.01   verify 1.35x
layer 2   R² 0.777 → far 0.566   leverage 1.49e-4 → 1.43e-4   ratio 0.96   verify 1.54x
layer 3   R² 0.514 → far 0.046   leverage 2.21e-4 → 2.20e-4   ratio 0.99   verify 1.70x
```

**No extrapolation at any depth.** The ratio is 1 throughout, so the far-lead rows are as well
covered as the near ones. The forecast decay is a SPANNING failure, not an excitation one —
which retires half of idea 2 below: **a persistency-of-excitation rule cannot improve forecast
quality here.** It may still shorten commissioning, and that is worth having, but it is a
different claim and should stop being written as one.

**And the machine improves as the forecast decays** — verify rises 1.35x → 1.54x → 1.70x while
R² falls to 0.046 at the far lead. That reconfirms the measured null on per-lead trust weights
from a new direction: a receding horizon applies only its FIRST move, so the far lead barely
shapes what the machine feels. Any diagnosis keyed on `r2Far` is diagnosing something that is
not hurting anyone, which the first version of this instrument duly did.

**THE LEVERAGE LEVEL IS THE FINDING, AND IT IS A NEW CAPABILITY.** The ratio stays flat while
the absolute value TRIPLES across three layers — 7.73e-5 → 1.49e-4 → 2.21e-4. Each deeper fit
is progressively less well-determined: the cascade running out of signal, visible DURING the
fit.

`Stack` currently stops when a layer cannot vouch for itself ON THE MACHINE, which is a
post-hoc measurement costing a full commission per layer — and on the arm the ladder spends
two of its rungs discovering exactly that. Leverage is the same information, earlier and free.

**Next experiment, and it is cheap:** commission four or five layers on two plants, record the
leverage level per layer against the verify each layer earns, and find whether a leverage
threshold predicts the layer that will fail to vouch. If it does, cascade depth stops costing
a commission to discover — which is target 4 (commissioning in minutes) reached by not doing
work rather than by doing it faster, and unlike every other lever measured so far it costs no
result quality.

### 2. Persistency of excitation as the stopping rule — behavioural systems theory

Willems' fundamental lemma: a single input-output trajectory that is persistently exciting of
sufficient order spans EVERY length-L behaviour of a linear system. That is the formal
statement of "commission once, run any program", and it converts "how much excitation is
enough" from a budget into a RANK TEST.

**Why it applies here specifically:** this project already hit the failure mode the theory
names. Identifying on a program instead of a scribble measured **12.70x -> 3.93x**, because
"repeated trapezoids are collinear". Collinearity IS a persistency-of-excitation deficiency.
The empirical finding and the theorem are the same fact, and the theorem comes with a test.

**Cheapest experiment:** compute the PE order of the excitation the pilot already collects,
and of a program, and check the ranking matches the measured 12.70x/3.93x. If it does, the
excitation can stop when the rank condition is met — which is the commissioning-time lever
that does NOT cost result quality, unlike every knob measured so far.

### 3. Koopman / EDMD — CORRECTED: the premise was wrong, and the correction is sharper

**Originally written as "fit the propagator, not one step", on the assumption that the
forecast is fitted for near-term accuracy and compounds error across leads. Reading
`pilot.js` kills that: it already fits every lead DIRECTLY.** `_planFits` builds a ladder of
`N` leads and `F.ladder.push({ch, L, w, val})` stores a separate weight vector per (channel,
lead), each from its own design matrix and its own block split. That is precisely the "direct
multi-horizon readouts" `continuous.js` offers as a feature — the pilot has it already.

**So `r2Far` at -0.035 is not compounding error.** It is a direct fit to the far lead that
cannot predict it. That is a FEATURE problem, not a fitting-scheme problem, and the two need
opposite responses:

- if the far lead is unpredictable because the features do not SPAN it, a richer dictionary
  is the fix and Koopman's contribution is real — but it is about choosing lifting functions,
  not about how the fit is arranged;
- if it is unpredictable because it is genuinely unpredictable at that horizon, no dictionary
  helps and the honest move is to shorten the horizon the QP trusts.

**And the instrument to tell them apart now exists.** `solveRidge`'s leverage answers exactly
this: high leverage at the far lead means the far-lead rows are extrapolating from data that
did not cover them — an EXCITATION deficiency, which is idea 2's territory and cheap to fix.
Low leverage with negative R² means the features genuinely do not span the target, which is
idea 3's territory and expensive. Nobody has looked, and the two have completely different
plans behind them.

**Cheapest experiment, replacing the one that was wrong:** during one commission, record the
leverage of the far-lead design rows alongside the per-lead `val` the ladder already stores.
That is one number against a number already kept, and it splits a question the project has
been treating as one thing.

### 3b. What the original idea 3 was reaching for, and where it survives

The QP inverts the model over a HORIZON, but the forecast is fitted for near-term accuracy and
error compounds across leads: `r2Far` was measured at **-0.035**, worse than predicting the
mean. Koopman's contribution is to choose the lifting dictionary so the MULTI-STEP propagator
is linear, making a linear predictive controller exact rather than approximate.

**This project arrived at the same constraint from the other side.** "A nonlinear map of the
fast variable breaks the LTI-ness the QP needs" — hence the affine observer, which was worth
0.48x -> 5.02x. That patch is a special case of the Koopman condition.

**The machinery that IS still unused:** `universalMap`/`prunedMap`, a dictionary with
importance-ranked pruning. The pilot offers a quadratic block under a structured prior and
picks on held-out data; that is a two-option search where the NGRC side has a ranked,
prunable dictionary. If the leverage test above says the features do not span the far lead,
this is what to reach for — and `commission.js` is the search procedure for it.

### 4. VRFT — one-shot controller synthesis from one dataset

Virtual Reference Feedback Tuning: from a single open-loop dataset, solve DIRECTLY by least
squares for the controller parameters that make the closed loop match a reference model. No
iteration, no plant model.

The conventional rung currently costs **23 laps** of frozen-operator Newton with backtracking.
VRFT would initialise it from one dataset, and the Newton loop becomes refinement rather than
search. Maximally PLC-compatible: it is a least-squares solve.

**Cheapest experiment:** VRFT-initialise `classic.js` on the EMPS axis, where the rung is
worth 425x and the ground truth is published, and count the laps to reach the same figure.

### 5. L1-style filtered adaptation, replacing the ad-hoc safeguards

L1 adaptive control decouples adaptation RATE from robustness by low-passing the control law,
giving a stated bandwidth-versus-robustness trade instead of a tripwire.

The monotone safeguard here — backoff, settling dwell, freeze after 3 — is the ad-hoc version,
and its measured endpoint is telling: on a soft gearbox it lands at "exactly the continuous
open loop". It protects by surrendering. A filter gives a design knob with a margin attached.

### 6. Online period estimation — adaptive feedforward cancellation / higher-order RC

`hff.js` is TOLD the lap length. AFC and higher-order repetitive control estimate the
fundamental online and tolerate period variation by construction.

**Phase 1 demoted this.** With the memory measured as a net negative across the envelope, the
lap-periodic rung is a fallback rather than the main line, and period tracking only matters
under Phase 3B. Kept on the list because if the memory earns its place back on a repeating
program, this is what makes it survive a feedrate change.

### What does NOT survive the constraints, and why

- **DeePC in raw form** — the Hankel-matrix QP grows with the data and has no fixed
  arithmetic bound. Take the lemma (idea 2), not the algorithm.
- **GP-MPC** — cubic in the data. `x'Px` from the RLS is the affordable shadow of it (idea 1).
- **Reinforcement learning** — sample cost measured in episodes on a real machine, and no
  refusal semantics. Adopting it would mean giving up the one part of the product claim the
  evidence currently SUPPORTS.

### Where these land in the plan

1 and 2 belong in **Phase 4** as well as Phase 2: both attack commissioning time without
spending result quality, which every knob measured so far does. 3 belongs in Phase 2, since
after Phase 1 the question is "how much of the memory's 2.09x home advantage can a model
recover" and the horizon fit is the most likely source of it. 4 is independent and cheap. 5
and 6 are robustness work that should wait for a route decision.

## Phase 3A — retire the memory

If a model layer matches the table, the harmonic rung comes out of the default ladder and:

- Commissioning collapses. The harmonic rung is 85 of ~127 planned runs and 56% of wall
  clock; a model layer commissions like a pilot layer, roughly 8-10 runs.
- Program- and feedrate-agnosticism follow by construction, because nothing is addressed by
  lap phase any more.
- The 22.42x has to be re-earned on the bench's WORST cell, not at home.

## Phase 3B — make the memory cheap and honest

If the model cannot match it, the fallback is already half built and should be wired
regardless, because it helps under either route:

- **`exportOperator()` is the plant model, and it transfers.** A second program of the same
  lap pays for refinement only — measured 32 laps -> 10. Wire it into `AutoStack` and the page
  so a change of program re-uses the identified operator instead of re-identifying.
- **Re-index the table by ARC LENGTH on the part rather than by lap sample**, so a feedrate
  change addresses the same physical point. This is what `pathilc.js` already does and what
  `hff.js` does not.
- Then the honest claim becomes "one identification per plant, a short re-commission per
  program", and the north star is rewritten to that.

## Phase 4 — commissioning cost, beyond what Phase 3 gives free

Measured already, so this is arithmetic rather than hope:

- Machine restore instead of rebuild: **done**, 1.35x, byte-identical.
- The obvious knobs are NOT free: banded off with refinement 24 -> 10 ships 18.39x against
  22.42x and fails the contract. Do not spend result quality for time.
- **Move candidate selection off the machine.** The harmonic rung spends 24-48 runs scoring
  candidates. Screen them on held-out data and score only the survivors — but the record
  warns the fit ranks them backwards, so the screen must be validated against a full machine
  sweep before it is trusted to prune.
- `WARMUP` is a built knob and still unmeasured. It covers the machine's transient AND the
  correction's; only the first is removed by machine restore. Measure both halves.

## Phase 5 — plant agnosticism, held and widened

- The six-plant bar must not regress: 2R arm, quadruple tank, extruder barrel, Wood-Berry
  column, cold mill AGC, EMPS servo axis.
- **Add a plant whose DELAY dominates its own response.** None of the six has one, and a
  receding-horizon controller with a forecast is exactly where dead time bites.
- Re-examine the standing refusals with the bench in hand: the mill at 0.42x, Wood-Berry
  losing to the published BLT, the barrel. A refusal that is right for a measured reason is
  a result; one that is right by accident is a defect waiting.

## Phase 6 — the four things that make the product claim checkable

Targets 6, 7 and 8 in the north star are not performance work; they are the difference
between a claim and a measurement. Three of the four are cheap, and each either supports the
claim or kills it — both useful, neither optional.

### 6a. A scan-time and memory budget for the DEPLOYED ladder

`test/smoke.mjs` already asserts the black box fits *"an arithmetic budget a 1 ms PLC task can
afford"* — MACs against a stated budget. The ladder that actually ships has no such number.

- Count MACs and bytes per scan for the deployed path: the conventional rung's basis
  evaluation, each cascade layer's feature build and readout, and `boxQP`'s fixed 8
  iterations of two convolutions.
- Report per plant, against a stated task period, and make it a CHECK rather than a print, so
  a change that quietly doubles the scan cost fails.
- The pieces are there: `boxQP` takes a FIXED iteration count by design, and
  `primitives.calcMem` exists for exactly this.

**Days of work, and it is the single largest gap between what is claimed and what is known.**

### 6b. Win on a linear plant, or explain the loss

Wood–Berry is a linear plant with dead time and a classical method beats this one on it:
72.08 against the published BLT's 51.95. That is the standing loss and it is the cleanest
target in the project, because the plant is fully known and the rival is published.

Two outcomes and both are worth having: either the self-tuning ladder beats a hand-designed
classical controller on its home ground, or the reason it cannot is a real and stateable
limit of the method. Today neither is known.

### 6c. Turn a refusal into a result

The mill (0.42x) and the barrel refuse. A refusal for a measured reason is a result and this
project treats it as one — but two of six is a lot of the plant range to decline, and the
distinction that matters has never been drawn: is the refusal the RIGHT ANSWER for that plant,
or an inability wearing a gate? Rule 9 applies — assert BOTH halves.

### 6d. One rival from the literature, implemented properly

Every comparison in this project is against its own conventional machine, a published number
for a specific rig, or a hand-tuned ILC. That cannot locate the work in its field.

**Norm-optimal ILC on the arm, on the bench**, is the cheapest honest choice: it is the method
this one is closest to, it is well specified, and the bench already scores transfer, which is
where the two should differ most. Modern MPC, L1 adaptive, DeePC and Koopman-EDMD are the
other candidates and are all larger.

Until one of these exists, the defensible sentence is: *beats the conventional machine, and on
one real axis beats the published model-based feedforward at its own published parameters.*
That is a good sentence. It is not the one the product claim makes.

## Phase 7 — THE PLC-SHAPED REBUILD, ten steps

The budget — under 10% of every 1 ms cycle, always, with commissioning and fitting ONLINE —
does not adjust the design, it dictates it. Batch normal-equations-and-Cholesky is an offline
algorithm and misses by about two million cycles; the deployed path alone misses by 4x and
only works sliced, which "always" forbids. What follows is sequenced so the cheap
falsifications come first and nothing is built on an unchecked assumption.

**1. Cost the FIT as a check, not a note.** `Pilot.cost()` excludes fitting on the grounds
that "the deployed path does not fit" — void the moment commissioning is online, and it was
the assumption doing the most work. Extend it to report both regimes (batch as today, RLS as
required) and ASSERT the online budget. *Decides nothing; it makes every later step
measurable.*

**2. Prove the shared-covariance claim before building on it.** Every lead uses the same
design matrix, so `X'X` is common and only `X'y` differs — that is the whole reason the fit
can be afforded. Verify NUMERICALLY that per-lead batch solves equal a shared-factor
multi-target solve on the same data. *If they disagree, steps 5-6 collapse and the envelope
is smaller than computed.*

**3. Find the smallest basis that holds the result — NOW THE ONLY LEVER LEFT, and worth less
than the "241 features" premise assumed.** The count is **37** on EMPS, not 241, so the
forecast is 2,553 of the 14,354 MAC/cycle the deployed path costs at one QP iteration — 18%,
and cutting it to zero would still leave 118% of budget. `lib/ngrc/commission.js` is exactly
this search — linear-first, per-target held-out gating, importance-ranked pruning to the
smallest subset within margin — and has never been pointed at the pilot. *Scored on the
bench, never on fit: the record is unambiguous that fit ranks these backwards. And it can no
longer close the gap alone, so what it is really being asked is whether the last 1.44x comes
from here or from the free response, which is a comparable 2,278.*

**4. ~~Truncate the lead bank~~ — MEASURED, AND IT DOES NOT TRUNCATE.** The premise was that
the bank is most of the memory and largely paying for nothing, on two indirect readings:
per-lead trust weights measured EXACTLY neutral, and verify RISING 1.35x → 1.54x → 1.70x
while far-lead R² collapsed to 0.046. Both are still true and neither predicted the machine.
The same fitted bank truncated to its first N leads, at 4 iterations on EMPS:

```
N            8      12      16      24      32      48      68
x         2.34    1.63    3.94    4.95    4.22   11.07   12.17
```

**N=48 costs 9%, N=32 loses two thirds.** `1.5·Tset/grid` is not slack, and a far lead with
R² 0.046 is evidently still shaping the applied first move — which is the same lesson the
`leadTrust` null already carried and nobody had connected to the horizon: a receding horizon
applies only u[0], and u[0] is set by the whole plan. The curve is also NOT monotone (12 worse
than 8, 32 worse than 24), which is stated rather than smoothed. *So memory does not fall
linearly and the QP does not fall as N², because N cannot move. Step 4 is closed as a
negative.*

**5. Replace batch ridge with an online fit — AND THE SHAPE OF IT CHANGED TWICE UNDER
MEASUREMENT.**

**FIRST, THE ECONOMY THIS STEP ASSUMED DOES NOT EXIST.** "Every lead shares a design matrix, so
one covariance serves the bank" was the difference between 4079% of budget and 56%, and it is
FALSE: `Pilot._row` indexes the command block at `k + L`, so 12 of 25 features are
lead-dependent and `X'X` genuinely differs per lead. `shared.test.mjs` could not see it because
it built its own shared `X` and verified linear algebra on it — assuming the fact it claimed to
pin (rule 15). It now calls the real row builder at two leads and compares column by column.

**SECOND, SHARING THE WEIGHTS WORKS WHERE SHARING THE COVARIANCE CANNOT.** The rows differ by
lead in exactly the right way — a lead is the same function of (state now, command then) at a
different `then` — so stacking every lead's rows into ONE regression is well-posed rather than
approximate. Measured on EMPS, held out by TIME (the last 30%, so nothing scores by
interpolating between rows it has seen), 9 leads across a 68-lead horizon:

```
 lead   per-lead R²   one model   one model + lead
    0       0.99703     0.99549          0.99416
    8       0.99664     0.99565          0.99577
   24       0.99635     0.99684          0.99693
   44       0.99645     0.99689          0.99660
   67       0.99563     0.99622          0.99655
 mean       0.99643     0.99627          0.99613
```

**ONE MODEL MATCHES SIXTY-EIGHT TO 0.00016 OF MEAN HELD-OUT R², for 68x less covariance memory
— 727 kB to 10.7 kB per channel — and a fit that is ONE recursion instead of 68.**

**AND THE PREDICTION WRITTEN DOWN BEFORE THE RUN WAS BACKWARDS, which is the more useful
half.** The argument was that predicting `e(k+L)` from the state at `k` uses information L
samples STALE, that how stale is a property of the lead, and that a shared model would
therefore fail at LONG leads and need to be told the lead. The opposite happened: the shared
model is worse at SHORT leads (lead 0, residual variance 0.00451 against 0.00297 — 52% more)
and BETTER at long ones (lead 67, 0.00378 against 0.00437). Pooling nine leads' rows is nine
times the data, and the far leads are the noisy ones that benefit; the near leads are the easy,
specific ones that a dedicated fit does better on. It is bias-variance, not staleness. And the
lead-scheduled variant — the fix for a problem that turned out not to exist — is WORSE on
average than plain sharing (0.99613 against 0.99627), because it spends features on variance.

**AND THE MACHINE PREFERS IT — 14.42x AGAINST 12.70x.** Both commissioned from the same stream
through `Pilot`'s own fit path (`sharedWeights`), both deployed, scored on the EMPS program:

```
              mm rms        x     deployed        stored weights
per-lead     0.04539    12.70x    576,034 MAC     68 vectors
one model    0.03998    14.42x    576,034 MAC      1 vector
```

**13.5% BETTER for 68x less storage**, which makes this the third time in this phase that the
fit statistic ranked two candidates backwards against the machine — after the QP's iteration
count and the probe designs before it. Lead 0's residual really is worse under sharing, and the
machine really does not care: the QP plans over the whole horizon and the far leads, which
pooling IMPROVES, are most of it.

**THE DEPLOYED ARITHMETIC IS UNCHANGED AND THAT IS CORRECT** — the forecast still evaluates
every lead, so `dots` is the same 576,034 MAC. What sharing removes is the FIT and the STORAGE,
which is precisely the half of target 6 that was unbuilt. `cost()` could not see the storage
change at first and reported 25.4 kB for both, because it counted one weight vector per lead;
it now counts by reference identity, so the saving is a property of the object rather than of a
flag someone might forget to pass.

**THE DEFAULTS HAVE MOVED AND THE OTHER MODES ARE DELETED.** The per-lead bank, the LMS
adaptation path, per-lead trust and `boxQP`'s weights argument are gone; `qpIters` defaults to
4; the pooled fit is capped at 60,000 rows and builds ~9 leads instead of N.

**AND COMMISSIONING TIME DID NOT SIMPLY FALL, which is the correction worth keeping.** Across
the four-plant bar the tank went 45s → 23s, the column 20s → 11s and the mill 12s → 8s, all
shipping identically — but the **barrel went 98s → 334s**, because the sampled fit made its
model BETTER (depth 1, 5.1869e+0 → 5.0948e+0), enough to cross a deploy bar it had been
refusing, and a rung that deploys costs scored runs that a refusal does not. So the honest
statement is: **the fit got cheaper everywhere, and commissioning got faster only where nothing
new deployed.** A cheaper fit that finds more to do is not a cheaper commission.

**AND "DEPLOYS" WAS NOT "WORTH DEPLOYING" — NOW PRICED, AND THE COST WAS WORSE THAN QUOTED.**
The barrel shipped 1.04x, and the figure repeated for it here was "21,830 MAC/cycle and
256.7 kB". **The MAC was the SLICED number**, read off the report line that says so, and used
as though it were the per-cycle cost. Its PEAK is **1,657,248 MAC/cycle** — 76x larger, and
peak is the only figure that means anything against a requirement to fit EVERY scan. Quoting
the sliced number against a peak budget credits a restructuring nobody has done.

`AutoStack` now takes a `budget` and refuses a rung that exceeds it, reported as REFUSED ON
COST with the factor. Measured on the four-plant bar at 10,000 MAC/cycle and 64 kB:

```
barrel   REFUSED ON COST: 1,657,248 MAC/cycle and 122.9 kB — 165.7x the budget
tank     ships classic, 21 MAC/cycle and 0.1 kB, 10.53x
```

**Both halves, which is the whole test of a gate**: it refuses the rung that provoked it and it
does not refuse the cheap one that earns its place. The refusal fires at depth 1, before depth 2
is attempted, so the commissioning that would have built the second layer is not spent either.

*What remains: the arm and EMPS on the new defaults. Also worth noting that the deleted bank
and `SharedRLS` compose exactly — one weight vector and one covariance per channel is the shape
the online recursion wanted in the first place, and it was reachable by changing the model
rather than by finding an economy in the algebra that was not there.*

**5. Replace batch ridge with multi-target RLS.** One shared `P`, one readout per lead,
`lib/ngrc/primitives.js`'s exact RLS. *Gate: it must reproduce the batch fit within noise on
a FIXED dataset before it is allowed near a machine — a new fitting method that quietly
changes the model is worse than a slow one.*

**6. Restructure to bounded work per cycle — MEASURED, and the naive form fails.**

One RLS update and one QP iteration per cycle, warm-started, in the real-time-iteration shape.
The peak per cycle is what must be asserted; an average is the wrong statistic for "always
fits". Two measurements changed what this step is:

**One iteration per cycle does NOT track sixty.** Driven over 400 cycles against a moving
horizon, the applied move comes out 7x SMALLER (rms 0.097 against 0.704) — 88% of the signal,
with a worst cycle at 135% of rms. It never builds up: one iteration barely moves off a warm
start that decays on every shift. The 60x lever is not available naively.

**And the shipped QP is not converged either, which is the more useful half.** At N=48:

```
iters   30      60      120     240     480     960     1920
rms     0.466   0.688   0.803   0.869   0.896   0.891   0.892
```

Sixty — the shipped setting — delivers **77% of the move its own optimum would**, and
convergence needs about 480. Shortening the horizon does not help: >256 iterations are needed
at N=48, 32, 24, 16, 12 AND 8 alike, because the convergence rate is set by the Hessian's
conditioning (the plant's own spectrum) rather than by the number of variables.

**WHICH MEANS THE SWEEP ABOVE ASKS THE WRONG QUESTION.** It scores the solver against its own
optimum. The pilot has been running a heavily truncated solve for its entire measured history
— 5.96x, 12.70x, 22.42x, all of it — so truncation is evidently acting as implicit
regularisation rather than as a defect. "How few iterations CONVERGE" and "how few still work
ON THE MACHINE" are different questions and only the second one matters (rule 16: a number
computed from the model cannot check the model).

**AND THE OBVIOUS FIX IS ALREADY IN THE FILE, WHICH KILLS THE CHEAP ROUTE.** The sentence
that stood here proposed replacing the solver with an accelerated projected gradient, "since
it costs about two extra vector operations per iteration and changes the rate from O(1/k) to
O(1/k²)". `lib/blackbox/qp.js` **is** FISTA — the momentum, the `t` recursion and the
`beta` extrapolation are all there and have been since it was written. The 480 iterations
above are what an accelerated method already delivers on this Hessian, so acceleration is
spent, not available. Writing a plan step against a file's docstring instead of its code is
rule 17 from the other side: check the instrument before proposing to replace the model.

**TWO THINGS WERE THEN MEASURED AGAINST THE ACTUAL SOLVER, and one of them is real.**

*The step size comes off a loose bound, and tightening it is worth exactly 2x.* The step is
`1/L` for `L = 2((sum|h|)²·wMax + 4λ)`. `(sum|h|)²` bounds `‖T‖²` from above — always safe,
which is why it is there — but on this impulse response it is **1.82x** the true spectral
norm (451.3 against 248.1 by power iteration), so the solver has been stepping 1.82x shorter
than it may. Replacing it with a power iteration at DESIGN time — twenty convolutions, once,
free online — moves the 5% point from **480 iterations to 240**:

```
                                    8      16     32     60     120    240    480
as shipped (loose L)               79%    69%    53%    36%    20%    6.4%   1.0%
tight L (power iteration)          75%    62%    44%    29%    14%    2.1%   0.7%
```

*FISTA adaptive restart is a NULL here, which is worth recording because it is the next
obvious thing to reach for.* Gradient restart (`t ← 1` whenever `g·(u − u_old) > 0`) gives a
curve **identical to four figures** with or without the tight `L`. The restart test never
fires on a warm-started receding horizon: the shifted previous plan is close enough that the
momentum never overshoots. Measured against a local re-implementation of the solver, so it is
recorded here rather than asserted in `test/pilot/rti.test.mjs` — a duplicate of the solver
cannot pin a property of the solver (rule 15).

**AND THE MACHINE ANSWERS FOUR, WHERE THE SOLVER ANSWERED FOUR HUNDRED AND EIGHTY.**
`test/pilot/qpsweep.mjs` commissions ONE pilot on the EMPS axis and re-deploys that same
model at a ladder of iteration budgets, changing nothing else. mm rms over the last four of
ten laps, against the shipped cascade's 0.5764:

```
iters       1       2       4       8      16      32      60     120     240     480
mm rms  0.0543  0.0557  0.0474  0.0493  0.0469  0.0459  0.0454  0.0454  0.0453  0.0453
x        10.62   10.35   12.17   11.69   12.28   12.56   12.70   12.71   12.71   12.71
uPk       0.76    0.76    0.77    0.77    0.91    1.28    1.49    1.47    1.47    1.47
```

**Four iterations reach 12.17x against sixty's 12.70x** — inside the 5% band, so rule 42 takes
the cheapest and the answer is **4**. Even ONE iteration delivers 10.62x, 84% of the benefit at
1/60 of the cost. The machine saturates at 60 and 120/240/480 are identical to four figures,
so the extra 420 iterations the solver needs to converge buy the machine nothing whatsoever.

**THAT IS A 15x COST REDUCTION THE SOLVER-RESIDUAL SWEEP WOULD HAVE FORBIDDEN**, and the two
views disagreeing is the finding rather than a problem with either (rule 6). At 60 iterations
the solve is 36% from its own optimum and delivers 12.70x; at 4 it is ~85% from its own
optimum and delivers 12.17x. Truncation is not degrading the answer, it is choosing a
different one.

**THE `uPk` COLUMN SAYS WHY, and it is the most useful number in the table.** The truncated
solve applies HALF the peak correction — 0.76 mm against 1.49 — for 96% of the result. The
converged QP is spending twice the authority to buy 4%. Truncation is acting as an effort
penalty that nobody tuned, which is exactly the implicit-regularisation reading, and it means
the iteration count and `lambda` are the same knob approached from opposite ends. A future
`lambda` search has to hold `qpIters` fixed or it is searching one dimension twice.

**AND ON THE ARM THE TRUNCATED SOLVE IS NOT A COMPROMISE, IT IS BETTER.** The second plant —
two channels, coupled, with backlash, `test/pilot/qpsweep-arm.mjs`, one commissioned model
re-deployed nine times. Contour rms against the open loop's 1.343e-1 (rounded) and 7.101e-2
(circle):

```
iters          1      2      4      8     16     32     60    120
rounded     6.18x  6.94x  6.58x  6.29x  6.07x  5.96x  5.97x  5.96x
circle      8.59x  8.71x  8.25x  7.67x  7.11x  6.83x  6.92x  6.87x
uPk (rnd)   0.110  0.118  0.123  0.122  0.121  0.120  0.120  0.120
osc (rnd)   0.022  0.019  0.020  0.021  0.022  0.023  0.022  0.023
```

**Two iterations beat sixty by 16% on the rectangle and 26% on the circle**, and both curves
fall monotonically from 2 upward. The flagship 5.96x on the rounded rectangle — the number on
the page — is what SIXTY iterations delivers; two deliver 6.94x, at 1/30 of the cost. Lower
cost and higher performance from the same change, which is not a trade at all.

**AND IT IS NOT THE CORRECTION GETTING SMALLER, which is the explanation to kill first.** On
EMPS `uPk` halved (1.49 → 0.76) so "less authority happened to suit that plant" was live
there. On the arm `uPk` is **0.118 against 0.120** — the same size correction, a different
SHAPE. Rule 39's decomposition says where: bias is ~0 in every row, and the whole difference
is OSCILLATION, 0.019 at two iterations against 0.023 at thirty-two. **The converged solve
rings; the truncated one does not.**

**THE MECHANISM IS ONE THIS PROJECT ALREADY WROTE DOWN FROM THE OTHER SIDE.** `lib/pilot/`
notes that "the QP inverts this model, so regularisation serves the inversion, not the fit."
The iteration count is a second regulariser on the same inversion, and nobody was treating it
as one: a converged inverse of an imperfect forecast chases the forecast's high-frequency
error, and a truncated one cannot. `qpIters` and `lambda` are therefore one knob approached
from two ends, and a λ search must hold `qpIters` fixed or it searches one dimension twice.

**WHAT IS NOT YET DONE, STATED RATHER THAN ASSUMED.** The default is NOT changed here. Two
plants agree on the direction and disagree on the number — EMPS wants 4 (2 costs it 19%), the
arm wants 2 (4 costs it 5%) — and rule 31 says a constant right for one plant must be
re-derived for another. Changing `qpIters` moves every gate in the suite, so it needs the
six-plant pass of step 8, and 4 is the joint candidate: EMPS −4%, arm +10%/+19%. Note also
that only two of the six plants deploy at all (three refuse, one loses), so a "six-plant"
iteration constant is really a two-plant one with four negative controls, and saying otherwise
would be the kind of claim rule 18 exists to stop.

**AND THE COST TABLE SAYS WHAT IS LEFT.** From the pilot's own `cost()` on the EMPS model
(N=68, one channel, `cyclesPerUpdate` 1 so peak and sliced are the same number), against the
10,000 MAC per 1 ms cycle the online requirement allows:

```
iters        1        2        4        8       16       60
MAC/cyc  32,442   41,962   61,002   99,082  175,242  594,122
% budget    324%     420%     610%     991%    1752%    5941%
```

**Sixty iterations is 5941% of the budget and four is 610% — a 9.7x cut for a 4% loss.** But
the slope is 9,520 MAC per iteration and the INTERCEPT is 22,922: with the QP entirely free
the forecast bank alone is 229% of budget. So iterations were the biggest single term and are
no longer, and the remaining gap cannot be closed by this lever at all.

**THE HORIZON IS THE ONLY KNOB THAT CUTS BOTH** — the QP as `N·min(N,M)` per iteration and
the forecast as `nFeat·N` dot products. **So it was measured, and on EMPS it does not
truncate.** Same commissioned bank, truncated to its first N leads (which needs no
re-commission: a shorter horizon is a strictly smaller model fitted by the same run), at 4
iterations:

```
N            8      12      16      24      32      48      68
x         2.34    1.63    3.94    4.95    4.22   11.07   12.17
uPk       1.17    1.33    1.03    0.66    0.63    0.76    0.77
```

**Two thirds of the horizon is load-bearing.** N=48 already costs 9%, N=32 loses two thirds
of the benefit and N=16 loses more than two thirds. The commissioned N=68 is `1.5·Tset/grid`
and that is evidently not slack. Note also that the curve is NOT monotone — 12 is worse than
8, and 32 worse than 24 — which is stated rather than smoothed: something is interacting with
the horizon length beyond "shorter sees less", and it has not been chased.

**SO THE ONLINE CLAIM DOES NOT COME FROM TRUNCATION, IT COMES FROM ITERATIONS AND A CORRECTED
COST MODEL.** Measuring this found two faults in `cost()` itself, both of the same kind — the
model of the code had drifted from the code (rules 17, 30) — and both were making the picture
look worse than it is:

* **It counted the stored lead bank, not the leads `act()` evaluates.** `_horizon` runs
  `for (i = 0; i < this.N; i++)`, so a truncated horizon pays for fewer forecast rows. As
  written, the forecast term was INVARIANT under the one knob that cuts it, which would have
  reported the sweep above as buying only the QP.
* **It costed the free response as `min(N,M)·M/2` on the FINE impulse.** `_horizon` builds it
  from `hGrid`, which is N long; `hSample` here is 599 taps. That is the arithmetic
  `PreviewMPC.cost()` counts, because the blackbox preview really does convolve the sampled
  impulse, and it was carried across. It overstated the term by M/N — **20,366 MAC against
  2,278**, a third of the reported total, and a third that would not have moved when the
  horizon was cut.

With both corrected, on the EMPS model (nFeat 37, leads 68, one channel, `cyclesPerUpdate` 1):

```
iters             1        4       60
MAC/cycle    14,354   42,914  576,074
% budget        144%     429%    5761%
delivered     10.62x   12.17x   12.70x
```

**One iteration at the full horizon is 144% of the 10,000 MAC budget and delivers 84% of the
result** — the closest this project has been to the online requirement. The remaining 1.44x
is not reachable by the horizon alone, which the sweep above ruled out on this plant, so the
two knobs were run TOGETHER.

**AND THE CORNER CLOSES IT: 14.16x AT 101% OF BUDGET, BETTER THAN WHAT SHIPS AT 5761%.**

```
iters   N     mm rms       x    peak MAC   % budget
    1  40    0.12300    4.69x      5,660        57%
    1  48    0.06615    8.71x      7,744        77%
    1  56    0.04070   14.16x     10,148       101%
    1  68    0.05429   10.62x     14,354       144%
    2  48    0.04535   12.71x     12,544       125%
    2  56    0.04531   12.72x     16,644       166%
    4  68    0.04735   12.17x     42,914       429%
   60  68    0.04539   12.70x    576,074      5761%
```

**Fifty-seven times cheaper and 12% better than the configuration that ships.** But the
surface is RUGGED and not separable — at one iteration N=56 gives 14.16x and N=68 gives 10.62x
— which is what two knobs that are both regularisers on the same inversion would look like,
and it also means picking the best cell is fitting the grid. Rule 42's 5% band contains only
that one cell, which is a warning rather than an endorsement.

**AND IT SURVIVES THE HELD-OUT PROGRAM, WHICH IS WHAT MAKES IT A SETTING.** Scored on the
two-tone sine the model has never seen, in the same table (open loop 0.36337 mm):

```
iters   N   program        sine    peak MAC   % budget
    1  48     8.71x       6.64x       7,744        77%
    1  52    12.46x       8.12x       8,906        89%
    1  56    14.16x       8.66x      10,148       101%
    1  60    13.78x       8.49x      11,470       115%
    1  68    10.62x       7.36x      14,354       144%
    2  52    13.83x       8.68x      14,522       145%
    2  68    10.35x       7.28x      23,874       239%
```

**The sine peaks at the same place**, N=52–56 at one to two iterations, and falls off toward
N=68 exactly as the fitted program does. Two programs, one optimum, and the cheapest cell in
it is (1, 56) at 101% of budget. **The commissioned `1.5·Tset` horizon is not merely slack on
this plant, it is PAST THE OPTIMUM** — more horizon makes the machine worse — which no
argument from settling time predicts and which only a machine measurement could find
(rule 16).

**THE ARM IS A DIFFERENT REGIME IN EVERY TERM, WHICH IS WHY IT HAD TO BE MEASURED (rule 31).**
Rounded rectangle, one commissioned model, contour x against the open loop's 1.343e-1:

```
iters   N    contour      x     osc    peak MAC   peak %   sliced %
    1  32   3.296e-2   4.07x   0.033     13,336     133%         2%
    1  44   2.514e-2   5.34x   0.025     20,884     209%         3%
    2  32   2.328e-2   5.77x   0.023     17,688     177%         3%
    2  44   1.945e-2   6.90x   0.019     28,980     290%         4%
    2  58   1.937e-2   6.93x   0.019     45,430     454%         6%
   60  58   2.255e-2   5.95x   0.023    852,790    8528%       119%
```

**2 iterations at N=44 is 29x cheaper than what ships and 16% better** (6.90x against 5.95x).
Three things differ from EMPS and every one of them reverses a conclusion:

* **Its horizon DOES truncate.** N=44 costs 0.4% where on EMPS N=48 cost 9%.
* **Its forecast is the dominant fixed term**: 14,278 MAC, i.e. ~121 features PER CHANNEL
  against EMPS's 37. So step 3 is an ARM lever and barely an EMPS one — the same constant,
  re-derived, coming out four times different.
* **`cyclesPerUpdate` is 72 here and 1 on EMPS**, so the arm has real slicing headroom and
  EMPS has none. Both columns are reported because they answer different questions: `peak %`
  is what "always fits" requires TODAY, and `sliced %` is what a restructured update — doing
  1/72 of the work per scan — could reach. Quoting `sliced` as if it were `peak` is the exact
  thing target 6's "in EVERY cycle rather than on average" was written to forbid.

**6b. THE JOINT DEFAULT CHANGE, which is what steps 4 and 6 together now propose.** Today
`N = ceil(1.5·Tset/sample/grid)` and `qpIters = 60`. Both plants that deploy want roughly
`1.2·Tset` and 1–2 iterations: EMPS's optimum is N=56 of 68 (0.82) and the arm's flat point is
N=44 of 58 (0.76). *Gate: the six-plant pass of step 8, because the knobs are NOT separable —
cutting `qpIters` alone regresses EMPS from 12.70x to 10.35x — and because four of the six
plants currently REFUSE or lose, so what has to be checked is whether a cheaper solve flips a
refusal. A refusal that flips to a deploy is not automatically good news; it has to be the
right answer for the right reason, which is the contract those four files pin.*

**THE GATE HAS RUN ON FIVE OF THE SIX, AND IT TURNS A STANDING REFUSAL INTO AN IMPROVEMENT.**
`HORIZON_TS=1.2 QPITERS=2` against the defaults, whole ladder, one commission each side:

| plant | ships, default | ships, 1.2/2 | the cascade rung's own score |
|---|---|---|---|
| quadruple tank | classic, 10.53x | classic, 10.53x | 0.29x → 0.19x, refused both ways |
| Wood–Berry | nothing | nothing | 0.56x → 0.53x |
| cold mill | nothing | nothing | **0.49x → 1.01x**, still below the bar |
| extruder barrel | **nothing (0.96x)** | **stack(2), 1.13x** | 1.13x, two layers vouching, R² 0.974 / 0.918 |
| EMPS axis | classic, 424.8x | classic, 424.8x | 0.39x → 0.29x, refused both ways |

**No plant is made worse and every contract in both files still holds.** The barrel was one of
the two standing refusals target 7 names, and a cheaper solve is what moved it — which is not
a result anyone would have predicted from "spend less arithmetic".

**THREE THINGS QUALIFY IT AND ALL THREE ARE THE POINT.**

* **1.13x is small, and it costs 4x the commissioning** (149 s → 600 s), because the flip is
  a second cascade layer being admitted rather than the first getting better.
* **It deploys but it is not DEPLOYABLE: 1,541 kB.** The budget row this whole phase is about
  is memory as well as arithmetic, and a rung that ships 1.5 MB has not met it. "Deploys" and
  "fits a PLC" are different verdicts and the barrel now has one of each.
* **The corner does NOT carry to the cascaded position.** On EMPS the pilot rung is commissioned
  OVER the conventional rung, so its plant is not the bare axis the 14.16x was measured on —
  and there the cheaper solver is WORSE (0.39x → 0.29x). It is refused either way, so nothing
  moves, but it says the corner is a property of a pilot on a raw machine and has to be
  re-measured wherever the machine underneath it has changed (rule 31, again).

**AND THE ARM'S FIRST ANSWER WAS A WIRING FAULT WEARING A MEASUREMENT'S CLOTHES.** Run both
ways it came back BYTE-IDENTICAL — 22.42x either way, every rung to five significant figures
— which is impossible for a change that moves the horizon 56 → 45 and the iteration count
60 → 2. It was not a null result: `test/flexisim/autostack.test.mjs` held a SECOND copy of
the pilot's option bag and assigned it over `auto.pilotOpts` wholesale, after `makeArmHost`
had built one, so the options never reached the pilot. Value for value the copies agreed, so
nothing had ever been wrong and no check had ever gone red.

Every hop tested clean in isolation — the host forwards, `AutoStack` carries, `Stack` spreads,
the `Pilot` stores, and the four-plant bar visibly changes behaviour under the same override —
and the wiring was genuinely there. What found it was making the ladder PRINT the solver it
commissioned with and watching that disagree with the host: `pilotOpts.qpIters 2`,
`layer0.qpIters 60`. That is now **rule 61**, the duplicate is deleted, and the bar asserts
that every cascade layer commissioned with the solver the host was handed.

**THE REPAIR IS VALUE-NEUTRAL AND THE ARM'S REAL ANSWER IS A LOSS.** Removing the duplicate
returned exactly 22.42x, which is the signature of a repair rather than a change of
measurement (rule 21). With the override actually reaching the pilot:

```
rung                             N 56 / it 60      N 45 / it 2
cascade depth 1                    9.9789e-2        1.1095e-1
depth 1 (rungs below withheld)     6.3021e-2        7.0356e-2
depth 2 (rungs below withheld)     5.3554e-2        5.9538e-2
lap-periodic, 68 vs 79 laps        1.8387e-2        1.9094e-2
SHIPPED                              22.42x           21.59x
```

**11% worse at every cascade stage, 3.7% worse end to end, and 11 more harmonic laps.** The
lap-periodic rung on top absorbs most of the cascade's loss, which is itself worth noting:
the memory hides a weaker model underneath it, so a rung that is not program-agnostic is also
what makes the degradation look small.

**AND THAT CONTRADICTS THIS PROJECT'S OWN SWEEP ON THE SAME ARM**, which measured 2 iterations
BEATING 60 by 16%. Both cannot be facts about the setting, and the difference is what was
varied: `qpsweep-arm.mjs` re-deploys ONE model commissioned at `N 58 / it 60`, so it isolates
the solve the MACHINE runs; the ladder commissions WITH the cheap solver, and the verify round
and the effort-weight replay both solve, so the model that comes out is a different model. The
sweep's own horizon table rules out N as the cause (58 → 44 costs 0.4%).

**THE OBVIOUS EXPLANATION — "commissioning wants the rich solve, deployment does not" — WAS
TESTED AND IS FALSE.** Commissioning the bare-pilot rig at `horizonTs 1.2 / qpIters 2` and
deploying it both ways, against the same rig commissioned rich:

```
                              deployed at 2    deployed at 60
commissioned N 46 / it  2          6.95x            6.03x
commissioned N 58 / it 60          6.94x            5.95x
```

**6.95x against 6.94x — commissioning cheap costs NOTHING**, three figures, and the cheap
deploy beats the rich one by 15% under EITHER commission. The verify ratio DID fall (3.20x →
2.82x) while the delivered machine did not move at all, which is this project's inverted gate
ordering appearing again and a reminder that the verify is an estimate, not the result.

**SO THE DIFFERENCE IS THE RIG, NOT THE PHASE — and the two rigs are not the same controller.**
The bare-pilot sweep runs at `uMax` 0.15; the ladder's stack rung runs at `min(2.0, 0.15·16/K)`
= **2.0 at K=1, thirteen times the authority**, over a conventional rung, with a second layer
on top. On a tightly capped rung the constrained optimum sits ON the box and two iterations
reach it; on a loosely capped one the optimum is far from the warm start and truncation
shrinks the move. That is a HYPOTHESIS with one supporting observation, not a result.

**WHAT IS ESTABLISHED:**

* On the bare pilot, cheap commissioning AND cheap deployment together are **15% BETTER and
  17x cheaper** — 31,114 MAC peak, 311% of budget (4% sliced), against 543,370 and 5434%.
* On the arm's SHIPPED ladder the same setting is a small loss, 22.42x → 21.59x.
* On EMPS the corner is a clear win at 101% of budget.
* So `qpIters` is not a constant to be re-derived once per plant (rule 31) but **once per
  RUNG**, because a rung's authority is part of what sets it — and that is a harder claim
  than the one this step started with.

*What would settle the hypothesis: sweep `qpIters` against `uMax` on ONE rig. If the best
iteration count rises with authority, the rule is derivable rather than tuned, and a rung can
choose it from the cap it was given — which is what a self-tuning machine has to do anyway.*

**6c. MOVE BLOCKING — BUILT, MEASURED, AND A NULL. The theory was right and it bought nothing.**

The QP is 66–89% of the deployed cost and is `2*N*min(N,M)` per iteration because `T` is a
full Toeplitz: every iteration convolves the whole horizon twice, while a receding horizon
applies `u[0]` and re-decides the rest next update. So the far plan is computed at full
resolution and discarded, for ever. Holding `u` constant over geometrically widening blocks
keeps the projection a CLAMP (disjoint blocks, so a box on `u` is a box on `z`), gives lead 0
its own block, and precomputes each block's plant response — `2*N*nb` per iteration instead of
`2*N*N`, **1,088 against 9,520** at N 68, nb 8. Against the full solver at matched iteration
counts the applied moves tracked to 2–5%.

**ON THE MACHINE IT SITS JUST BELOW THE FRONTIER IT WAS MEANT TO MOVE.** EMPS, one commissioned
model, x per 1000 MAC/cycle as the common currency:

```
 config        MAC/cycle   % budget      x     x per 1000 MAC
 blocked  2        7,010       70%    10.47         1.494
 blocked  4        9,186       92%    12.27         1.336
 full 1 @N56      10,148      101%    12.84         1.265
 blocked  8       13,538      135%    13.58         1.003
 full 1 @N68      14,354      144%    13.94         0.971
 blocked 16       22,242      222%    14.29         0.642
 full 4 @N68      42,914      429%    14.69         0.342
```

**Cheaper iterations, but MORE of them: blocked needs 16 to reach what the full solve reaches
in 1** (14.29x at 22,242 MAC against 13.94x at 14,354). Every blocked point is a little under
the unblocked one nearest it in cost — 9,186 MAC for 12.27x against 10,148 for 12.84x. The
parameterisation costs about as much delivery as its arithmetic saves, because it makes each
iteration cheaper and the problem harder to solve.

**SO SHORTENING THE HORIZON REMAINS THE BETTER LEVER**, and the two do not compose: they are
the same trade taken two ways. *Deleted rather than kept as a third mode.*

**AND THE FRONTIER ITSELF IS THE USEFUL OUTPUT.** `x per 1000 MAC` falls monotonically with
spend — 1.49 at 70% of budget down to 0.34 at 429% — so this controller has strongly
diminishing returns in arithmetic, and the shipped setting sits at the far end of them. That
is an argument for the budget gate rather than against the controller: told a scan, the ladder
should land near 1.3–1.5 and not near 0.34.

**6d. AN 11% REGRESSION ON THE ARM THAT THREE HYPOTHESES FAILED TO EXPLAIN — STATED, NOT
SOLVED.** The arm's model-only stack (conventional withheld, which is what survives the
retirement) reads 7.4340e-2 on one historical run with `sharedWeights` forced and every lead
pooled uncapped, and **8.3e-2 consistently now**. Tested and killed in order:

* **Lead sampling.** Re-run at 34 samples instead of 9: 8.2614e-2 against 8.3206e-2, within
  0.7%. Not it — and testing it is what exposed the pool bug below.
* **The pool cap under-filling.** Its stride was computed from `this.N` while only
  `LEAD_SAMPLES` leads are built, so the pool held ~7,875 rows against 60,000 — a real bug,
  fixed. Re-run: **8.3121e-2**, 0.1% different. Not it either.
* **Run-to-run noise.** Three current runs give 8.3206, 8.2614, 8.3121 — a spread of 0.4%. The
  historical 7.4340e-2 sits well outside it, so the difference is real.

**WHAT REMAINS UNTESTED** is the per-lead validation change that landed with the sampling: `val`
was the pooled R² for every lead and is now a held-out score per sampled lead with
nearest-neighbour inheritance. It feeds `wouldGate`, `r2Far` and the leverage readout. Gating
is OFF on this arm (`gateForecasts: false`) so the obvious path is closed, which is why it is
listed as untested rather than as the answer.

**AND THE MEASUREMENT DISCIPLINE THIS FORCED IS WORTH MORE THAN THE 11%.** Two arm runs
differing only in lead samples SHIPPED 23.12x and 19.96x — a 15% spread, because the
lap-periodic rung probes randomly — while their model-only rows moved 0.7%. **Single-run
comparisons on the shipped number are not evidence**, and several in this file were made that
way. The model-only row is the stable one, and it is also the row the retirement leaves.

**7. Re-measure the rebuilt ladder on the transfer bench.** Programs x feedrates, headline is
the WORST CELL. *This is where the shrink's cost shows up. If the worst cell falls below the
4.53x the model layers already reach, the rebuild has bought budget with performance and the
trade has to be argued rather than assumed.*

**8. Hold the budget on plants that share no physics.** The six-plant bar, each reporting its
own MAC/cycle and kB. *A budget met on one plant is a property of that plant; rule 18 says a
common factor across plants sharing no physics is a property of the CODE, and that is what a
budget claim has to be.*

**9. ~~Choose cascade depth from the leverage~~ — FALSIFIED, and the null is the finding.**

The hypothesis was that the leverage LEVEL, which tripled across three layers while the ratio
stayed flat, marks the cascade running out of signal and could stop it without paying a
commission per layer. A fourth layer was commissioned on the EMPS axis to test it:

```
layer 1  deployed  verify 1.35x  R² lead0 0.991  leverage 7.73e-5
layer 2  deployed  verify 1.54x  R² lead0 0.777  leverage 1.49e-4
layer 3  deployed  verify 1.70x  R² lead0 0.514  leverage 2.21e-4
layer 4  REFUSED   verify 1.09x  R² lead0 0.543  leverage 1.94e-4
```

**Both candidate predictors point the wrong way.** The layer that fails to vouch has a BETTER
forecast than the one that succeeded (0.543 against 0.514) and a LOWER leverage (1.94e-4
against 2.21e-4). The triple across three points was a trend fitted to a monotone run, and
the fourth point breaks it.

**So neither forecast quality nor conditioning predicts deployability, and only the verify
did.** That is consistent with this project's own hardest-won line — a forecast is not a
controller — arriving from a new direction: layer 4 predicts the residual perfectly well and
still cannot ACT on it, because what is left after three layers is not in a direction the QP
can move with the authority it has.

**What it costs us:** cascade depth genuinely requires a machine measurement. It cannot be
read off the fit, and the commissioning time spent discovering the last layer is not
recoverable this way. One of the two cheap levers on target 4 is gone, and the remaining one
is fewer features rather than fewer layers.

**What it is worth:** a stopping rule that looked obviously right, on three points, was wrong
on the fourth. It cost one commission to find out and would have cost a rebuilt `Stack` to
find out later.

**10. Restate the scoreboard honestly.** Update the north star's table with what the rebuild
actually achieves against all five parts of the claim. *Including, if it comes to it, that the
PLC budget and the 22.42x cannot both be had — which would be a real finding and belongs in
the open rather than in a footnote.*

## What would kill this plan

- **Phase 1 shows the full ladder does not degrade away from home.** Then the premise is
  wrong and this document is the thing to throw away.
- **Phase 2 fails across plants.** Then memory is doing something a model cannot, and the
  product is a fast per-program re-commission rather than transfer. That is a different north
  star and must be written as one rather than quietly become this one.
- **A model matches on the arm and fails on the EMPS axis.** The axis has a four-parameter
  closed form and its authors published it; its model-error-to-repeatability ratio is 130x
  against the arm's ~2x. One plant agreeing is not a method — the six-plant bar exists
  precisely because a common factor across plants that share no physics is a property of the
  code (rule 18).
