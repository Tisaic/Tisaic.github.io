# The plan to reach the north star

Written against `CLAUDE.md`'s **THE NORTH STAR**. Every step below names the measurement that
decides whether to continue, because a plan whose steps cannot fail is a wish list.

## THE CURRENT SEQUENCE — read this first; the phases below predate it

The phase order further down was written before the owner retired the memory, before the score
became the FIRST SCORED LAP of an unseen program, and before the seed spreads were measured. It
is kept because its measurements stand, but where it and this section disagree, this is what is
being worked. Six steps, in the order their evidence justifies.

**1. FINISH THE GATE, WHICH IS THE ONLY THING MEASURED TODAY THAT IS WORTH A FACTOR WITHOUT
TOUCHING THE CONTROLLER.** `verifyRef` makes the deploy decision rank (tank correlation 0.989
against -0.057; Wood-Berry's 9 harmful deployments become 12 refusals; EMPS byte-identical). It
has been run on two plants of six. Run it on the arm — the second winner, where the control
matters most — then the mill and the barrel. **Kill condition:** if it refuses on the arm, or if
any plant's verdicts move where they should not, the third regime is a stricter gate rather than
a better one and the tank's 0.989 was a coincidence of one plant.

**2. THEN SPEND THE SPREAD, WHICH IS THE FACTOR ITSELF.** Every plant's headline is one
commissioning draw; the plants that lose vary 2.2x and 4.2x across seeds. A gate that ranks turns
that into a gain: commission k times, score each with the representative regime, keep the best.
On the tank that is a deployed median of 1.512x against draws that reach 0.424x; on Wood-Berry it
is the difference between refusing and shipping a controller that harms. **Target: the k-draw
result is at least the best single draw, on every plant, with commissioning cost stated in laps.**
**Kill condition:** if the gate's ranking does not survive being used for selection — the classic
way a validation signal dies — then the spread cannot be spent and must be shrunk instead, and
neither excitation length (measured: 3x buys nothing) nor the solver knobs shrink it.

**3. CLEAR THE THREE RED TESTS, BECAUSE THEY HIDE THE NEXT ONE (rule 3).** `tanks`, `woodberry`
and `stack` are all red and all pre-existing; all three were invisible behind the `set -e` abort
until the collector, and `stack` was crashing rather than reporting. Two of them are the plants
step 1 is about, so this is mostly step 1's bill. `stack`'s is separate: the EMPS cascade admits
two layers where the test asserts three, and whether that is a regression or the machine's honest
answer has not been established.

**4. THE MODEL-ONLY BAR IS NOW THE PRODUCT (targets 1, 2, 5).** The memory is retired by
decision, so the number that matters on the arm is the model-only stack — 8.5e-2, against the
22.42x ladder's 1.8e-2 — and everything about "higher" runs through improving a cascade that has
no lap table in it. Scored, always, on the FIRST lap of a program it has never run, with the
converged value beside it and never instead of it. **Target: within 1.3x of a per-program
commission on every program and feedrate, none worse than the conventional machine.**

**5. THE PLC BUDGET, RE-DECIDED AGAINST CONTRACTS RATHER THAN HEADLINES (target 6).** The cheap
corner is measured and reachable — 9,517 MAC/cycle against 10% of a 1 ms scan, where the default
is 42,914 — and it is better on both plants this project loses on. It is NOT the default because
it fails the arm's model-only contract. Re-run the corner search with the contracts in the
objective, not the six plants' headlines. That is the single lesson of the failed defaults change
and it is worth repeating: **a pass over plants is not a pass over contracts.**

**6. THEN, AND ONLY THEN, A RIVAL (target 8).** Norm-optimal ILC on the arm, on this bench. Every
comparison this project has is against its own baseline or a published number for a specific rig.
It is last because a rival implemented while two plants are still harming their machines would
measure the wrong thing — and because step 1 has already shown that a comparison can be
misdirected by a third party: Wood-Berry was quoted against BLT for months while the plant WITHOUT
the pilot beat BLT outright.

### What is NOT on this list, and why

**Target 7 as written is superseded.** "Beat the published BLT on Wood-Berry" was the goal; the
measurement says the steady-state inversion already does (43.90 against 51.95), and the pilot's
job there is to stop making a good machine worse. The real target on that plant is: **deploy
something that beats 43.90, or refuse every time.** Step 1 already achieves the second.

**Online adaptation is parked, not dead.** It delivers 9.32x against a frozen 8.77x on the first
unseen lap — 6% — and its 12.16x is twenty laps of one program, which the scoring rule now
excludes. The covariance bound makes it stable and the anchor makes the commissioning
unforgettable, both measured, both shipped off. It becomes interesting again only if step 4's
model stops improving.

## STEP 1 IS DONE: THE REPRESENTATIVE GATE ON ALL SIX PLANTS

Each plant supplies one program in its own units, indexed the way its own machine drives it. The
fit never sees it; only the deploy decision does.

```
 plant       representative regime          outcome
 tank        its own recipe                 gate RANKS: corr 0.989 (was -0.057); 3/8 deploy, ALL HELP
 woodberry   its benchmark scenario         9 harmful deployments of 12 -> 12 refusals
 EMPS        its trapezoid program          BYTE-IDENTICAL, 0.0412 mm / 14.0x        <- control
 arm         its toolpath, step-indexed     BYTE-IDENTICAL, 6.18x / 7.72x            <- control
 mill        a HOLD at S0                   0.61x — refusal independently confirmed
 barrel      its changeover recipe          FIRST EVER SCORED: representative 0.22x, refused
```

**BOTH CONTROLS PASS, AND ONE OF THEM ONLY COUNTS BECAUSE IT WAS CHECKED.** The arm returned
identical numbers with and without the third regime, which is the control passing IF the regime
ran and a silent no-op if it did not — indistinguishable from outside. `arm.test.mjs` now prints
the regimes the gate scored and asserts the representative one is among them, and ABSENT under
`NOREP=1`: `scribble + program + representative`, 6.18x unchanged. Rule 61, caught before it
became a result.

**THE BARREL IS THE FIRST-TIME SCORE.** This plant has never been scored here: its refusal was
traced to a dwelling scribble that cannot cross a 44 K box at quarter rates, i.e. a construction
failure wearing a rate-limit message. Built from the recipe, the regime cannot fail that way, and
the answer is a MEASURED refusal — **representative 0.22x** against **program 1.10x**. The program
regime would have deployed it, one hundredth above the threshold; the recipe says the correction
makes the machine four and a half times worse. Second plant where the new regime stops a
deployment the old gate would have allowed.

**THE MILL IS A CLEAN NEGATIVE AND IT KILLS A GOOD HYPOTHESIS.** A regulator's representative
program is a HOLD — its setpoint never moves while an eccentricity disturbance acts — and both
built-in regimes MOVE, so the gate had been scoring a disturbance-rejection machine on tracking,
twice over. That was the best available explanation for a refusal this project calls a PREDICTION
FAILURE. The hold reads **0.61x** beside scribble 0.63x and program 0.57x: all three agree, the
refusal is right, and the hypothesis is dead.

**SO THE SCORECARD FOR THE CHANGE IS: two harmful deployments prevented (tank seeds, barrel), one
refusal independently confirmed, one plant scored for the first time, and the two plants that work
untouched to four figures.** No plant lost anything.

**WHAT IT COSTS, STATED.** The engineer must supply one representative program. That is a real
addition to "wire it up and press one button" — though it is one they almost always have, and it
is asked for at the point where they are deciding whether to let a controller onto their plant.

## STEP 1b: THE REGIME THAT PREDICTS DELIVERY WAS RELEGATED TO A VETO

The gate's rule was right about WHICH KIND of regime decides — a program the machine runs, not a
stress regime it never will — and it had only a SYNTHETIC program to apply that to: a trapezoid
built from the rate limits. That synthetic program does not rank. On the tank its ratio correlates
**-0.057** with delivered benefit while the caller's own recipe correlates **0.989** over the same
eight commissionings.

Left as a veto the better regime could not act. Seed 100 deployed on a representative score of
**0.98** — above the 0.85 harm floor, so no veto fired — while the synthetic program's **4.05x**
carried the benefit decision, and the machine delivered 1.088x. **The regime that knew was
outvoted by the regime that did not.** Seed 102 went further and delivered **0.882x**, actual harm
through a gate I had just written up as letting nothing harmful through.

So when a representative program is supplied it now BECOMES the benefit regime and the synthetic
trapezoid joins the scribble as a veto. Absent one, nothing changes.

**MEASURED ON A DIFFERENT SEED RANGE FROM THE ONE THAT MOTIVATED IT**, which is the only kind of
validation worth having here:

```
 gate                          seeds     deploy   min delivered   deployed median
 old (two synthetic regimes)   1..8       4/8     0.368x  ALL FOUR HARM   0.675x
 representative as VETO        1..8       3/8     1.000x                  1.512x
 representative as VETO        100..103   3/4     0.882x  ONE HARMS       —
 representative DECIDES        100..111   5/12    1.000x                  1.324x
```

**Nothing is made worse on any of the twelve, and the deployed median is 1.324x.** The correlation
on that range reads 0.706 rather than 0.989, and the difference is worth stating rather than
averaging: the set is now CENSORED, because only draws the gate passed are in it, so the statistic
is computed on a narrower spread of estimates than before.

**AND MY EARLIER CLAIM WAS SEED-RANGE-SPECIFIC.** "3 of 8 deploy and all three help" was true of
seeds 1..8 and false of 100..103. Eight draws from one contiguous range is a sample, not a
guarantee, and quoting it as one is the same error as quoting a single draw — one level up.
`tankspread.mjs` takes a `SEED0` now so a rate can be measured across ranges.

## STEP 2 IS DONE: THE SPREAD IS SPENDABLE, 1.545x, ON A HELD-OUT PROGRAM

Commission six times, score each with the gate on the ROUNDED rectangle, ship the best — and read
the CIRCLE, which the selection never saw:

```
 draw   gate    rounded    circle
    0   3.72x    6.18x      7.72x
    1   4.10x    6.12x     10.02x   <- the gate's pick
    2   3.64x    5.47x      6.72x
    3   3.52x    5.43x      6.25x
    4   3.64x    5.34x      5.85x
    5   3.87x    5.31x      5.19x

 selected delivers 10.02x on the held-out circle · median draw 6.48x · worst 5.19x
 selection is worth 1.545x over shipping one commissioning, at 6x the commissioning cost
 the selected draw ranks 1 of 6 on the held-out program
```

**RANK 1 OF 6.** The gate did not merely beat the median; it picked the genuinely best
commissioning of the six on a program it never scored.

**AND IT IS NOT CIRCULARITY, WHICH IS THE PART THAT MAKES IT WORTH ANYTHING.** The obvious
objection is that the gate's representative regime runs the rounded rectangle and the selection is
then validated on the same commissioning — so a correlation could be one measurement twice. The
table refutes it directly: **draw 0 is the best on the rounded rectangle (6.18x against 6.12x) and
the gate did not pick it.** It picked draw 1, which is SECOND on the program the gate scored and
FIRST on the one it did not. A selector echoing its own program would have taken draw 0.

**WHAT IT COSTS AND WHAT THAT MEANS FOR TARGET 4.** Six commissionings for 1.545x, and
commissioning is already the thing this project calls outrageous. But the trade is now a knob
rather than a mystery: the spread is real, it is rankable, and k is a dial between commissioning
time and delivered performance. It also reframes target 4 — cutting commissioning cost by 6x and
spending the saving on six draws would be free.

**WHAT WOULD KILL IT, RESTATED SINCE IT SURVIVED THE FIRST TEST.** Six draws on one plant with one
held-out program. If the rank-1 pick does not replicate on the tank (where a bad draw is actively
harmful rather than merely weaker) or across more draws, this is one lucky ordering.

## AND THE SHARED FIT COSTS THE THIRD CASCADE LAYER — THE THIRD PLACE IT HAS BEEN CAUGHT

`stack.test.mjs` is the last of the three pre-existing reds. At `c24bede` it fails ONE check (the
PLC budget, 2,694,105 MAC against 50,000 — a standing honest red). With `sharedWeights` forced on
at that same commit and nothing else changed, it fails THREE, and the new two say what happened:

```
 …while still finding real structure in what reached it  → [0.9971, 0.3829, 0.0248]
 …and a refusal is a MACHINE measurement falling short   → layer 3, verify 1.35x, r2 0.0248
```

**Layer 3's held-out R² collapses to 0.0248** — the shared model cannot represent what layer 2
leaves — so the layer cannot vouch for itself and the stack stops at two. That is the same
mechanism as Wood-Berry (where the shared fit costs 17.6% of IAE) and the tank's basis checks,
and it is now three plants deep.

**THE SHARED FIT IS STILL NOT REVERSIBLE.** It is what makes the online budget reachable — 2n²
per sample against nt·2n² — and the cost here is measured and specific: the third layer of a
cascade on one plant. The honest statement is that one model for every lead is a MODELLING choice
with a measured price, not the free win it was written up as, and the price falls on residual
signals that are already hard.

## THE LAST RED IS A REAL REGRESSION, AND IT IS THE ONE THAT MATTERS MOST

`stack.test.mjs` no longer crashes and no longer asserts a layer count the machine is entitled to
change. What it now reports is worse than the crash was:

```
 depth buys accuracy on the program it was commissioned against
   → 0.5764  0.0393  0.0393  0.0393      open, depth 1, depth 2, depth 3
 …while still finding real structure in what reached it   → [0.9947, 0.1774]
 …AND on a program it has never seen, by at least as much → 8.8x unseen vs 14.7x trained
```

**DEPTH BUYS NOTHING ON EMPS. Depth 2 and depth 3 are IDENTICAL to depth 1 to four figures**,
because layer 2 cannot vouch for itself (verify 0.95x) and the stack correctly stops at one. Layer
2's held-out R² is 0.1774 where the contract asks 0.3.

**AND THE CASCADE IS THE MEMORY'S REPLACEMENT.** It is the component this project measured at 26.0x
on a two-tone sine the machine had never run, against a phase-indexed table's 0.55x — the evidence
that a stack of plant models transfers where a lap table does not. On EMPS it is now one layer
deep.

**THE CAUSE IS ISOLATED AND IS NOT REVERSIBLE.** With `sharedWeights` forced on at `c24bede` and
nothing else changed, layer 3's held-out R² collapses to 0.0248 and the same three checks fail. One
model for every lead is what makes the online budget reachable (2n² per sample against nt·2n²), so
it cannot simply be undone — but its price is now measured in three places: Wood-Berry's 17.6% of
IAE, the tank's basis selection, and here, the cascade's depth.

**THIS CHECK STAYS RED ON PURPOSE.** The requirement — depth must buy accuracy — is correct, and
the machine does not meet it. Restating it to pass would be deleting the finding. It is the top
open item in this file: **make the shared fit able to model a residual**, because until it can, the
cascade is a one-layer object and the memory's replacement does not exist.

## THE FIX FOR THE CASCADE: A LEAD-SCALED BLOCK, +5 COLUMNS, +0.8% ARITHMETIC

The shared fit models a plant beautifully and a residual not at all, measured on the same rows:

```
 layer        1        2        3
 per-lead   0.9908   0.7771   0.5137     held-out R², EMPS cascade
 shared     0.9947   0.1774   0.0248
```

Layer 1's map barely varies with lead, so pooling is free and even helps. What layer 2 LEAVES does
vary — it is dominated by dynamics whose phase rotates along the horizon — so one weight vector
fitted across all leads fits the average of incompatible maps. `_blockSplit`'s leverage readout
says which failure that is: a bad R² at ordinary leverage is a SPANNING failure, not extrapolation.

So the row carries the lead itself, normalised, plus the newest block scaled by it — one vector can
then express a map that rotates along the horizon. `setLeadBasis`, off by default.

```
                 layer 2 verify   layer 2 R²   depth   MAC/cycle   depth 1 → 2
 control          0.95x REFUSED     0.1774       1       42,914    0.0393 → 0.0393
 lead basis       1.48x deployed    0.2399       2       43,259    0.0398 → 0.0278
```

**`depth buys accuracy` passes for the first time since the shared fit landed**, and it costs five
columns and 0.8% of the deployed arithmetic — against a per-lead bank's 68 covariances.

**IT IS A PARTIAL RECOVERY AND THE REMAINDER IS INTERESTING.** Layer 3 still refuses at R² 0.0956
against the per-lead bank's 0.5137 — but its VERIFY reads **1.44x**, so the machine says it helps
and the FORECAST GATE refuses it anyway. This project already has one reading on that: arming a
negative-R² channel on the arm made the machine BETTER, 2.93x → 3.18x. A fit gate overriding a
machine measurement is exactly what `stack.test.mjs`'s own check objects to — "a refusal is a
MACHINE measurement falling short, not a fit falling short" — and that check is now failing for
that reason rather than for a missing layer.

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

**6d. THE 11% WAS THE POOL CEILING, AND IT TOOK FOUR ATTEMPTS TO ASK THE QUESTION PROPERLY.**
Run at `LEAD_SAMPLES=68` with the cap effectively removed, the arm's model-only stack returns
**7.4340e-2 — the historical number exactly**. So pooling every row of every lead is worth 11%
on this plant against the 60,000-row cap, and the trade is now priced rather than mysterious:
the cap buys commissioning time and costs delivery.

**THE THREE FAILED ATTEMPTS ARE THE USEFUL PART.** Lead sampling was tested (34 against 9:
0.7% apart) and cleared. The pool STRIDE was found genuinely wrong — sized for 68 contributors
while 9 are built, 7,875 rows against 60,000 — fixed, re-run, unchanged, and read as clearing
the cap. **It cleared the stride and left the ceiling at 60,000, which is 32x below the
configuration being compared against.** A conclusion drawn from a test that did not vary the
thing being concluded about, for the third time in this phase.

---

**6e. ONLINE RLS ADAPTATION MAKES THE MACHINE WORSE, AND λ=1 SAYS THAT IS A FAULT RATHER THAN
A FINDING.** EMPS, one commissioned model, weights and recursion reset between settings:

```
 lambda    program       sine     updates
 frozen    14.68x       8.77x         —
      1     9.96x       2.91x    124,775
 0.9999     7.55x       7.18x    124,800
  0.999      0.21x      0.11x    124,800
   0.99      0.21x        NaN    124,800
```

**λ = 1 is the internal control and it is the row that matters.** With no forgetting the
recursion IS the batch fit continued, on more data drawn from the same process — a correct
setup should leave a correct model roughly where it was. It goes 14.68x → 9.96x, so the update
is fitting the WRONG QUANTITY, and the lower λ rows are that error compounded rather than
evidence about tracking.

**THE APPARATUS IS INNOCENT THIS TIME, AND CHECKING IT PRODUCED ONE MORE WRONG CONCLUSION
FIRST.** The deploy row was fed to the COMMISSIONED weights with no adaptation at all, and the
first reading — R² 0.011 against ~0.996 at commissioning — said the pairing was broken. It was
not: that probe normalised the residual by `truth`'s variance instead of the TARGET's, and the
target carries `conv`, which is far larger. Scored properly:

```
target form              R² of the commissioned model
truth − conv                 0.99534     <- what is implemented
truth + conv                -2.92944
truth                     -205.15304
```

**The model predicts `truth − conv` to R² 0.995 at deploy.** The row is right, the target is
right, and the sign is right.

**SO λ=1 IS A REAL RESULT, AND IT IS A FINDING THIS PROJECT ALREADY HAS FROM THE OTHER
DIRECTION.** CLAUDE.md records that identifying on a PROGRAM instead of a scribble takes EMPS
from 12.70x to 3.93x, "since repeated trapezoids are collinear". Online adaptation on a
production program feeds the estimator exactly that collinear stream, so accumulating it drags
a scribble-fitted model toward the program-only solution — 14.68x → 9.96x here, the same
mechanism through a new door. Lower λ weights the collinear recent data harder, which is why
0.999 collapses to 0.21x rather than tracking anything.

**BUILT, AND IT WORKS: 14.68x → 21.20x ON THE PROGRAM AND 8.77x → 12.16x ON A PROGRAM IT HAS
NEVER SEEN.** Two things were needed and each was measured wrong first.

* **AN EXCITATION GATE.** The update accepts a row only if it carries information the model
  does not already have, and `x'Px` — the innovation variance — is that number and is computed
  on the way to the gain anyway. At λ=1 it admits 102,374 rows of 124,800 and skips 18%: a
  lap-one row is new, the same row on lap two is not.
* **AND THE COMMISSIONING POSTERIOR AS THE PRIOR.** Seeded from `(1/ridge)I` — uninformative —
  the recursion trusted its next two rows more than a fit that had seen sixty thousand, and
  **two updates took the machine from 14.68x to 5.83x**. Seeded from the posterior the fit
  already computes from its Cholesky factor, the same rows improve it.

```
 lambda    program       sine     updates
 frozen    14.68x       8.77x         —
      1    21.20x      12.16x    102,374
 0.9999    10.85x       9.23x    124,800
  0.999     0.28x       0.08x     30,357
```

**λ = 1 IS THE SETTING, WHICH IS WORTH SAYING PLAINLY: NO FORGETTING AT ALL.** The gate does
the work forgetting was supposed to do, and does it better — forgetting discards old
information on a timer, while the gate declines new information that is redundant. With λ below
1 the covariance never shrinks, the gate stops firing (124,800 admissions at 0.9999), and 0.999
collapses to 0.28x. Rule 41 says directional forgetting has measured neutral five times here;
this is the sixth reading and it says plain forgetting is worse than none once the gate exists.

**AGAINST THE MEMORY IT REPLACES, ON THE SAME AXIS:** the lap table reaches 242x on the program
it learned and **0.53x — worse than nothing — on this sine**. Online adaptation reaches 21.20x
and **12.16x**. Far less on the trained program, and it IMPROVES the untrained one where the
table destroys it. That is the trade the retirement was asking for, measured rather than
argued.

*Three faults came out on the way and all three were mine: a probe that normalised by the wrong
variance and declared the pairing broken; a gate whose threshold was undefined because the
constructor's defaults are not applied when a host sets `pilot.online` directly — the deleted
LMS path carried a comment about exactly that for its own clamp, and the lesson was not carried
forward with it; and the uninformative prior above.*

**6e-CORRECTED. THE SCORING WAS WRONG, AND CORRECTING IT REVERSES WHICH SETTING WINS.**

Everything above scores the LAST FOUR OF TWENTY LAPS. That measures the thing the retirement
exists to remove: a controller that reaches its number only after laps of one program is a
memory however it is implemented. The owner's ordering is explicit — *the unseen path is the
score, lap improvement is secondary* — so the headline is now the FIRST SCORED LAP OF A PROGRAM
THE MODEL HAS NEVER RUN, and `test/pilot/adapt.mjs` reports it that way.

Two instrument corrections came with it. Lap 0 carries a start-up transient — the machine
begins at rest on a sine that demands motion immediately — and it is IDENTICAL for a frozen and
an adapting model (frozen sine: 0.1191 mm on lap 0, 0.0415 mm on lap 1, weights untouched, a
factor of 2.9 that belongs to the transient), so it gets its own column and the first SCORED
lap is lap 1 (rules 13, 25). And the dead `FREEZE` constant, left behind by the LMS law it
guarded, is gone.

```
            |  UNSEEN two-tone sine — THE NUMBER THAT DECIDES  |  seen program   |
   lambda   |  start   lap 1       x   converged       x  |   lap 1       x  |  updates
   frozen   |  0.1191  0.0415    8.77x     0.0415    8.77x  |  0.0393   14.68x  |        —
        1   |  0.1188  0.0390    9.32x     0.0299   12.16x  |  0.0379   15.19x  |   102374
   0.9999   |  0.1187  0.0379    9.60x     0.0394    9.23x  |  0.0371   15.55x  |   124800
    0.999   |  0.1169  0.0112   32.49x     4.4505    0.08x  |  0.0118   48.95x  |    30357
```

**THE 8.77x → 12.16x HEADLINE IS 6% OF CONTROLLER AND 39% OF REPETITION.** On the first unseen
lap λ=1 reads 9.32x against frozen's 8.77x, and the rest of the way to 12.16x is twenty laps of
that one sine. On the seen program, first lap, it is 14.68x → 15.19x: 3%.

**AND THE SETTING THE OLD SCORE THREW AWAY IS THE ONE THAT WINS THE NEW ONE.** λ=0.999 was
recorded above as "collapses to 0.08x". Scored on the first unseen lap it reads **32.49x
against frozen's 8.77x — 3.7x better on a path it has never run, on the lap it first sees it**
— and 48.95x on the seen program. Then it walks away. The lap trace says which of the two
behaviours it is:

```
frozen, sine        0.1191 0.0415 0.0415 … 0.0415   (flat, by construction)
lambda 0.999 sine   0.1169 0.0114 0.0507 0.0437 3.0827 4.4733 … 4.44
lambda 0.9995 sine  0.1183 0.0225 0.0082 0.0182 0.0507 0.0767 0.0427 0.0970 0.5001 … 0.50
```

λ=0.9995 reaches **0.0082 mm on lap 2 — 44x, five times better than the frozen model — and
blows up on lap 8**. So the estimator genuinely finds a far better model early and then
destroys it, which is not a reason to prefer the estimator that never improves; it is a
stability problem with a name.

**THE MECHANISM IS COVARIANCE WIND-UP, and it is a property of the recursion rather than of
this plant.** `P` is divided by λ on every update, so a stream that stops carrying new
information inflates it geometrically — 1/0.999 is e³¹ over the thirty thousand rows this axis
runs — and the gain grows until the estimator answers noise at full strength. The excitation
gate cannot stop it: as `P` inflates, `x'Px` grows, so the gate that was meant to hold back
redundant rows stops firing. That is exactly what the λ=0.9999 row shows above — 124,800
admissions, i.e. not one skip.

**SO THE FIX IS A BOUND ON THE COVARIANCE, TAKEN AS A MULTIPLE OF THE POSTERIOR THE FIT ALREADY
COMPUTED** (`SharedRLS.setTraceBound`, `pilot.online.traceGain`, off at 0 so λ=1 stays
byte-identical). A multiple, never an absolute number: `P0` carries the commissioning fit's own
column scale, so a constant here would be a constant in units nobody chose (rule 32). It is
applied by SCALING `P`, which keeps it positive definite and keeps every direction's relative
confidence — the information the seed exists to carry — where clamping the diagonal would leave
the off-diagonals describing a covariance that no longer exists.

**AND IT CURES IT COMPLETELY. THE BOUND IS THE KNOB; λ IS NOT.** Same commissioned model,
same runs, `traceGain` swept. Every lap trace is monotone decreasing — no blow-up anywhere —
and the first unseen lap improves with the bound:

```
 traceGain   unseen sine lap 1        converged sine      seen program lap 1
   frozen    0.0415    8.77x        0.0415    8.77x        0.0393   14.68x
        1    0.0390    9.32x        0.0297   12.22x        0.0379   15.19x
        2    0.0374    9.72x        0.0210   17.26x        0.0366   15.74x
        8    0.0312   11.65x        0.0104   34.84x        0.0312   18.47x
 (unbounded) 0.0112   32.49x        4.4505    0.08x        0.0118   48.95x
```

**λ = 0.999 AND λ = 0.9995 NOW GIVE THE SAME MACHINE TO THREE FIGURES** (9.32x/9.32x at bound 1,
9.72x/9.70x at 2, 11.65x/11.24x at 8), which is the clearest statement of what the bound does:
once it binds, the covariance is held at a fixed size and the forgetting factor no longer
decides anything. One knob replaces the other, and it is the one with a bounded failure mode.

**AND THE BOUND KEEPS THE EARLY GAIN TOO — THE TRADE WAS AN ARTEFACT OF STOPPING AT 8.**
Swept up, λ=0.999 throughout, unseen sine:

```
 traceGain   lap 1 (THE SCORE)   converged      seen prog lap 1   lap trace, sine
   frozen    0.0415    8.77x   0.0415  8.77x    0.0393  14.68x   flat by construction
        8    0.0312   11.65x   0.0104 34.84x    0.0312  18.47x   monotone down
       32    0.0210   17.32x   0.0077 47.41x    0.0223  25.88x   monotone down
      128    0.0126   28.95x   0.0078 46.41x    0.0148  38.94x   0.0126 → 0.0077, then FLAT
      512    0.0092   39.58x   0.0108 33.51x    0.0117  49.36x   0.0077 at lap 2, drifting UP
 unbounded   0.0112   32.49x   4.4505  0.08x    0.0118  48.95x   0.0114 → 4.47, gone by lap 5
```

**THE FIRST UNSEEN LAP IS MONOTONE IN THE BOUND** — 11.65x, 17.32x, 28.95x, 39.58x at 8, 32,
128, 512 — and **the seen program comes along for free**: 14.68x → 49.36x on its FIRST lap at
bound 512, against the previously reported 21.20x that took twenty laps to reach.

**AND THEN SIXTY LAPS FALSIFIED THE TWENTY-LAP READING, WHICH IS WHY IT WAS RUN.** Written from
the 20-lap trace, bound 128 "settles to 0.0077 mm and STAYS there". It does not. Every bound
creeps back up; they differ in the RATE, not in whether it happens (unseen sine, mm rms):

```
 traceGain   lap 1     floor (lap ~3-6)   lap 20    lap 60     drift off the floor
      128    0.0126        0.0077         0.0078    0.0086          +12%
      256    0.0103        0.0077         0.0089    0.0115          +49%
      512    0.0092        0.0077         0.0110    0.0168         +118%
 unbounded   0.0112        0.0114          4.47      —           gone by lap 5
```

**THREE THINGS THIS SETTLES AND ONE IT OPENS.**

* **The bound converts a divergence into a drift, which is a real repair and not a complete
  one.** Unbounded reaches 4.47 mm by lap 5 — 0.08x, worse than no controller. Bounded, nothing
  blows up at any setting out to sixty laps.
* **The floor is the same 0.0077 mm (47x) at every bound**, reached by lap 3 to 6. So the bound
  does not decide how good the model gets; it decides how fast the model gets there and how fast
  it then decays. That is one quantity, not two knobs.
* **The bound is the knob and λ is inert once it binds** — λ 0.999 and 0.9995 give the same
  machine to three figures at bounds 1, 2 and 8.
* **THE RESIDUAL DRIFT IS WIND-UP AT A SLOWER RATE, NOT AN ABSENT ONE.** The excitation gate
  does not stop it (203,800 admissions in the 60-lap run).

**SO DIRECTIONAL FORGETTING WAS BUILT AND MEASURED, AND IT IS THE SIXTH NEUTRAL READING RULE 41
PREDICTS — BUT NOT FOR THE REASON THE RULE GIVES.** Ordinary forgetting divides the WHOLE
covariance by λ, unexcited directions included, and that is where the residual drift lives.
Discounting only ALONG the incoming row (`SharedRLS.directional`, coefficient derived rather
than chosen: `g g'/r` is the projection onto the row's direction in the P-metric, and adding
`(1−λ) g g'/(r(λ+r))` without dividing the matrix reproduces exactly the ordinary update's
inflation of THAT direction and leaves every other one alone).

**IT WORKS EXACTLY AS ADVERTISED AND IT LOSES THE THING THAT MATTERS.** Sixty laps, λ=0.999,
unseen sine:

```
                        lap 1            lap 20    lap 53+   drift off floor
 frozen             0.0415   8.77x       0.0415    0.0415    none, by construction
 directional        0.0388   9.37x       0.0156    0.0078    NONE — monotone all 60 laps
 ordinary + bound 128  0.0126  28.95x    0.0078    0.0086    +12%
 ordinary + bound 512  0.0092  39.58x    0.0110    0.0168   +118%
 ordinary, unbounded   0.0112  32.49x      4.47      —      diverged by lap 5
```

**THE TRACE BOUND NEVER BINDS UNDER DIRECTIONAL FORGETTING** — `traceGain` 0 and 128 give
byte-identical traces — which is the mechanism confirmed directly: there is no wind-up left to
bound. And the price is the whole point. On the first lap of a program it has never run,
directional reads **9.37x against the bounded ordinary law's 28.95x**: it removes the drift by
behaving like λ=1, creeping down over fifty laps to the same 0.0078 mm floor everything else
reaches by lap 3. Under the owner's ordering — first unseen lap first — that is a loss, and the
converged column it wins (58x on the seen program by lap 53) is the column that does not decide.
So the bound ships and directional does not, both default off, and rule 41 gets its sixth
reading with the mechanism isolated rather than assumed.

**AND THE UNIT CHECK CAME WITH IT.** `test/pilot/rls.test.mjs` now pins all of it directly
rather than through a plant: 20,000 rows in ONE direction wind an unbounded λ=0.999 covariance
up by **x2.45e+8** and the bound holds it at exactly x8.00; a bounded recursion still follows a
plant that genuinely changes 5 → 9; and `setTraceBound(0)` is byte-identical to not having the
option at all, which is what makes it safe to ship default-off (rules 9, 21).

**6e-RETENTION. DOES A FORGETTING LAW DISCARD THE SCRIBBLE IT WAS IDENTIFIED ON? MEASURED —
AND THE ANSWER IS NO, WHICH OVERTURNS WHAT THE DRIFT ABOVE LOOKED LIKE.**

**THE TRAP, STATED FIRST BECAUSE IT IS THE RIGHT WORRY.** The pilot is identified on a broadband
scribble and then run on ONE production program. A law that discounts old rows on a timer will,
given enough of that program, have discounted away every row that carried the scribble's
excitation — leaving a model of the one program, which is the memory rebuilt by an adaptive law
and the exact object the retirement removes. Its shape is the worst a failure can have: correct
immediately, bad slowly, invisible to a short test. The requirement is asymmetric — the
identification is kept for ever, and forgetting applies only to what adaptation ADDS on top.

**AND THE DRIFT IS NOT THAT.** Reading the creeping lap trace as the commissioning being lost
was an inference from an instrument that cannot separate two faults: a trace that climbs is
equally consistent with a correction that is merely becoming mistuned for the program in front
of it. The instrument that CAN separate them is a transfer — adapt on program A for the whole
run, FREEZE the weights so what is scored is the model rather than the law, then score B, which
it never adapted on, against the commissioned model on that same B. Both directions, because a
law can lose one program's information and not the other's (rule 9).

```
 60 laps, lambda 0.999    adapted on SINE → program    adapted on PROGRAM → sine
 frozen (commissioned)          14.68x                        8.77x
 bound 128                      30.13x   +105%                53.38x   +509%
 bound 512                      20.84x    +42%                30.72x   +250%
 directional                    28.99x    +97%                52.96x   +504%
```

**EVERY SETTING COMES OUT OF SIXTY LAPS ON ONE PROGRAM WITH A MODEL THAT IS BETTER ON THE OTHER
ONE** — twice as good on the program, six times on the sine. The scribble identification is not
merely retained, it is improved: the production stream is adding information the scribble did
not carry rather than displacing what it did. **Bound 128 retains better than 512** (+105%
against +42%), which is the expected ordering and the reason the aggressive setting's better
first lap is not free.

**AND AT 300 LAPS — ~1,000,000 ROWS — IT IS STILL POSITIVE, BUT IT IS DECAYING.** Same law,
same settings, the horizon multiplied by five:

```
 laps    adapted on SINE → program    adapted on PROGRAM → sine
   60         30.13x   +105%                53.38x   +509%
  300         28.44x    +94%                38.49x   +339%
```

**SO THE WORRY IS THE RIGHT SHAPE AND THE MAGNITUDE IS NOT ALARMING YET.** Retention erodes
monotonically with the horizon — the sine direction loses a third of its advantage between 60
and 300 laps — and at a million rows the carried model is still 1.9x and 4.4x BETTER than the
commissioned one on the program it never adapted on. It has not crossed. Whether it eventually
does is a longer run than this, and it is the reason the anchor exists rather than a reason to
call the law safe.

**THE ANCHOR IS MEASURED AND IT IS NOT A STRAIGHT WIN, WHICH IS WHY IT SHIPS OFF.** At
`anchorRows` 50,000 over the same 300 laps it REVERSES the asymmetry rather than lifting both
directions: sine → program 28.44x → **42.33x (+188% against +94%)**, and program → sine
38.49x → **12.93x (+48% against +339%)**. Its converged score is better (39.09x against 31.54x)
and its first unseen lap slightly worse (26.54x against 28.95x). One knob, four numbers, two of
them moving each way: that is a trade to be chosen against a horizon and a duty cycle, not a
default. Off until a case is measured that needs it.

**AND THE ANCHOR IS BUILT FOR IT REGARDLESS** (`SharedRLS.setAnchor`, `pilot.online.anchorRows`,
off at 0). The estimate is pulled back toward the commissioned weights a fixed fraction per row —
`1/kappa` is the pull-back's time constant IN ROWS, which is the unit the caller thinks in and
makes the constant a property of the stream rather than the plant (rule 32) — so the deviation
settles where the update's pull and the anchor's balance, and the commissioned fit is a FLOOR
the estimate cannot walk away from however long the machine runs. It is applied AFTER the
update, so a row's information is taken in full and the accumulated DEVIATION is discounted
rather than the row: discounting the row would make the estimator deaf to a plant that really
changed, which is the thing the exercise exists to keep.

**6e-REGRESSION. THE TANK FAILS 6 CHECKS AT HEAD — AND THE RESULT IT "LOST" WAS NEVER
REPRODUCIBLE. THE FIRST DIAGNOSIS HERE WAS WRONG AND IS CORRECTED IN PLACE.**

`test/pilot/tanks.test.mjs` fails 6 checks at HEAD and passed at `c24bede`, so the whole suite
stops there under `set -e` and every pilot test after it stopped running. Bisected by running
that one test at each commit, with the two `_notch` crashes accounted for:

```
 c24bede                                   PASS
 65c86f6 / effc58a  (_notch crash)         throws — not evidence either way
 3baa869            (_notch restored)      3 FAIL — the DEPLOY check still passes
 20de1b7            (nine leads built)     6 FAIL — the deploy goes to 0.07x
 HEAD                                      6 FAIL — 0.08x
```

**FIRST DIAGNOSIS, AND IT WAS WRONG.** Forcing `sharedWeights` on at `c24bede` reproduces three
failures, so sharing was written up here as the cause. It is not the cause of the one that
matters: at `c24bede` with sharing forced the DEPLOY check still passes. Sharing costs the basis
comparison and the gate-off control; the deployment is lost one commit later, at `20de1b7`.

**AND `20de1b7` IS CONFIRMED BY REVERSAL, WHICH IS THE ONLY KIND OF CONFIRMATION WORTH HAVING.**
At that commit with `LEAD_SAMPLES` raised from 9 to every lead, the tank recovers to 3 failures
and deploys again. At HEAD the same reversal works — `LEAD_SAMPLES` 999 with the pool cap at its
default takes 6 failures to 3.

**THREE OTHER EXPLANATIONS WERE KILLED FIRST, EACH BY A DIRECT MEASUREMENT.** `qpIters` 60 → 4
is not it (forced back to 60 at HEAD: still 6 failures, scribble 0.64x against 0.08x — better and
still refusing). The FORECAST is not it: dumped per lead, the tank's held-out R² is 0.93–0.99 at
lead 0, mid and far, and NOTHING is gated — a model that good with a correction that measures
0.08x is rule 16 exactly, and the gating hypothesis is dead. And my working changes are not it
(identical 6 failures with `lib/pilot` stashed).

**THEN THE FIX REFUSED TO BEHAVE LIKE A FIX, WHICH IS THE ACTUAL FINDING.** Swept, `LEAD_SAMPLES`
is not monotone: 9 refuses at 0.08x, 16 refuses at 0.08x, **24 DEPLOYS at 1.28x**, 32 refuses at
0.08x, 999 deploys. A knob whose result alternates is not a knob with a knee; it is a marginal
result being flipped by which rows the pool happens to draw. Restricting the pool to the near
leads — on the hypothesis that a receding horizon only ever applies lead 0, and the shared fit is
measurably worse there — moves the scribble 0.08x → 0.68x → 0.65x and never reaches the 1.1x
gate, so that mechanism is real and second-order.

**SO THE QUESTION BECAME: WAS THE TANK EVER ROBUST? IT WAS NOT.** At `c24bede`, the last commit
where this test passes, changing ONLY the commissioning seed:

```
 seed offset   0     PASS, recipe 2.07x
 seed offset  10     PASS
 seed offset  20     5 FAIL — the basis selection flips on BOTH loops, the sweeping/dwelling
                     comparison reverses (1.92x against 2.88x), and the gate-off control
                     refuses on a guard trip
```

**THE RESULT THAT WAS "LOST" FLIPS ON THE RANDOM SEED AT THE COMMIT THAT PASSES.** So the shared
fit and the lead sampling did not break a solid measurement; they moved a marginal one across a
threshold it was already sitting on. CLAUDE.md's six-plant line records the tank at 1.32x as one
of the two non-refusals; at three seeds on the same commit it reads 2.07x, passes, and fails five
checks — which is not a controller result, it is a coin.

**WHICH CHANGES WHAT THE FIX IS.** Tuning `LEAD_SAMPLES` until the tank goes green would be
fitting a constant to a coin flip, and rule 3 says a flaky check is a bug report rather than a
number to chase. What has to happen first is that the tank's own result is made reproducible —
scored across seeds rather than at one, with the spread reported — and only then is there
something for a lead count to be measured against. The lead sampling still has to be re-derived
per plant either way (rule 31: nine leads was measured on EMPS and carried to five other plants),
but it cannot be derived against an instrument that answers differently on Tuesday.

**6e-SUITE. ONE RED TEST WAS CANCELLING TWENTY, AND THE FIX FOUND A SECOND RED PLANT IN ITS
FIRST RUN.**

`test/run.sh` is `set -euo pipefail`, so the first non-zero exit aborted the whole run: when
`tanks.test.mjs` went red, the twenty-odd pilot tests after it never ran and their state was
simply unknown. This repository has already paid for this exact thing once — `composite.test.mjs`
exited 1 from the commit that added it and "set -e meant it took the whole pilot block down with
it" — and it recurred because nothing was changed after that diagnosis. A red suite that hides
the next real failure is rule 3 in its most expensive form.

Every check now runs through a collector: failures are recorded by name, the run continues, and
it exits non-zero at the END with the list. The suite is exactly as red as it was; it now says
how red, and `report_failures` is called before every early `exit 0` so a clean browser exit
cannot step over a Node failure collected an hour earlier.

**IT PAID FOR ITSELF ON THE FIRST RUN.** `--node --only=flexisim` now reports TWO failures where
it used to report one and stop:

```
FAILED:
  node test/pilot/tanks.test.mjs
  node test/pilot/woodberry.test.mjs
```

**AND WOOD–BERRY IS A SECOND REGRESSION NOBODY KNEW ABOUT.** Its benchmark IAE is pinned against
a published baseline and reads **82.10 against the 72.08 recorded in CLAUDE.md** — 14% worse on a
plant this project already LOSES on (Luyben's BLT is 51.95, so the pilot has gone from 0.72x to
0.63x of it). Thirty test files ran after `tanks` in that run; nothing after it had been executed
since the tank went red.

**6e-WOODBERRY. THE SHARED FIT COSTS THIS PLANT 17.6%, AND THE REASON IS THAT IT IS A BETTER
FORECAST. THAT IS NOT A PARADOX, IT IS RULE 16.**

`woodberry.test.mjs` pins the pilot's IAE against a published baseline and reads **82.10 against
the 72.08 this file recorded** — 14% worse on the one plant this project already LOSES on
(Luyben's BLT is 51.95, so the pilot has gone 0.72x → 0.63x of it). It was invisible behind the
tank until the suite stopped aborting.

**ISOLATED IN ONE VARIABLE.** At `c24bede`, the last commit before the shared fit, the same test
reads 72.08 and passes; with `sharedWeights` forced on and nothing else changed, **84.75**.

**AND THE OBVIOUS EXPLANATIONS ARE ALL DEAD, EACH BY MEASUREMENT.**

```
 lead sampling   9 → all leads          82.10 → 82.64      not it
 qpIters         4 → 16 → 60            82.10 → 84.47 → 84.71   not it (60 is WORSE)
 pool only near leads  1 → .5 → .25 → .125   82.10 → 81.19 → 86.76 → 89.85   not it
```

The near-lead hypothesis is the one worth naming as dead: the shared fit is measurably worse at
lead 0 on EMPS, a receding horizon only ever applies lead 0, and on the tank restricting the pool
to near leads moved the scribble 0.08x → 0.68x. On Wood-Berry it does nothing and then hurts.

**SO THE FIT WAS PUT UNDER A PROBE, AND IT SAYS THE OPPOSITE OF WHAT THE MACHINE SAYS.**
`_poolFit` now re-fits the per-lead bank on demand — same rows, same ridge, same held-out tail,
one variable — and on Wood-Berry the SHARED model wins everywhere:

```
 ch 0  L0 0.741/0.246   L112 0.748/0.050   L280 0.752/0.617   L490 0.778/-0.877
 ch 1  L0 0.842/0.932   L112 0.847/0.503   L280 0.850/0.815   L490 0.847/-0.704
        (shared / per-lead, held-out R² on the same tail)
```

**A FORECAST THAT IS BETTER AT NINE OF TEN LEADS AND FIVE TIMES BETTER AT THE FAR END, DRIVING A
MACHINE THAT IS 17.6% WORSE.** The per-lead bank is plainly overfitting here — negative R² at the
far leads — and inverting an overfitted model is producing a better controller than inverting a
well-fitted one.

**WHICH IS THIS PROJECT'S OWN RULE, ARRIVING FROM A NEW DIRECTION.** The ridge is already chosen
NOT on the residual, on exactly this reasoning: *"the QP INVERTS this model, so regularisation
serves the inversion, not the fit."* Pooling every lead's rows into one scale-relative ridge
changes the effective regularisation of that inversion, and it changes it in the direction that
fits better and inverts worse. **The consequence is binding: the shared-versus-per-lead choice
cannot be made on held-out data.** Offered that evidence, any selector picks shared — on the
plant where shared loses.

**BOTH REGULARISERS OF THE INVERSION AGREE, AND POINT THE SAME WAY.** Less inversion is better
here:

```
 qpIters    1  78.96      2  80.92      4  82.10
 horizonTs  0.75  81.27   1.0  79.98    1.5  82.10    2.0  86.21
```

That recovers about a third of the gap without touching the fit, and neither knob is at its
default. It does not reach 72.08 and nothing here reaches BLT's 51.95, so this stays a LOSS —
which is target 7, and the first time the loss has had a mechanism attached to it rather than a
number.

**THE CHECK IS LEFT RED ON PURPOSE.** It asserts `|iae − 72.08|/72.08 < 0.05`, a hard-coded
ceiling of exactly the kind rule 4 warns about — but it is reporting a real 14% regression, and
editing a failing check until it passes is the one thing that must not happen. It stays red until
the plant is fixed.

**6e-TANK. THE GATE DOES NOT MERELY FLIP ON THIS PLANT — WHEN IT DEPLOYS, IT IS WRONG.**

`test/pilot/tankspread.mjs` commissions the minimum-phase tank from eight seeds and scores every
one on the same held-out recipe. It asserts nothing: an instrument that decided its own verdict
before the verdict was understood is how the 1.32x got written down in the first place.

```
 seed   deploy   off cm    on cm       x
    1     NO     0.4650   0.4650   1.000    refused: scribble 0.08x
    2    yes     0.4650   0.8402   0.553
    3     NO     0.4650   0.4650   1.000    refused: scribble 0.67x
    4     NO     0.4650   0.4650   1.000    refused: scribble 0.64x
    5    yes     0.4650   0.5836   0.797
    6    yes     0.4650   1.2645   0.368
    7    yes     0.4650   0.4248   1.095
    8     NO     0.4650   0.4650   1.000    refused: scribble 0.14x

 DELIVERED  median 1.000x   min 0.368x   max 1.095x
 DEPLOYED   4 of 8 seeds, median 0.675x
```

**EVERY SEED THAT DEPLOYS MAKES THE PLANT WORSE.** The best deployment in eight draws is 1.095x —
inside the noise of doing nothing — and the worst is 0.368x, nearly three times worse than the
uncorrected machine. The median DEPLOYED benefit is **0.675x**. The four refusals are the four
good outcomes, because on this plant "do nothing" is 1.000x and beats every controller that got
through.

**SO THE 1.32x IN THE SIX-PLANT LINE IS NOT A COIN BETWEEN GOOD AND NEUTRAL.** It is a single
lucky draw from a distribution whose deployed median is 0.675x, and it has been quoted as one of
the two non-refusals in this project's agnosticism claim.

**AND IT LANDS ON THE ONE CLAIM THE NORTH STAR CALLS SUPPORTED.** "It REFUSES with a stated
reason, asserted to be right for the right reason" is the strongest thing in this repository. On
this plant the refusal machinery is right four times out of eight and wrong four times out of
eight, and its errors are all in the dangerous direction — it never refuses something that would
have helped, it deploys things that hurt. That is not a gate with a threshold slightly off; the
gate's scribble regime reads 0.08x to 0.67x on the seeds it refuses, so where it refuses it is
emphatic, and where it deploys it did not see the harm at all.

**TWO INSTRUMENT DEFECTS CAME OUT OF BUILDING IT, BOTH MINE, BOTH CAUGHT BY THE MACHINE
DISAGREEING WITH THE READOUT (rule 6).** The first read `report.verify.deploy` — the verify
round's own row — instead of `pilot.verdict`, which is what `act()` obeys, and printed "not
deployed" beside a correction that visibly moved the plant from 0.4650 to 0.8402. The file now
CROSS-CHECKS the two: a refused pilot must score identically with the correction switched on,
because `act()` returns zeros, and any difference is printed as a disagreement rather than
averaged into the table. The second was a valve split passed as `{g1, g2}` where the rig indexes
`g[0]`, `g[1]` — every level went NaN, nothing built, and the failure surfaced three layers away
inside the verify.

**AND THE SECOND ONE FOUND A REAL LIBRARY DEFECT.** With no regime producing a scored candidate,
`_finishVerify` read `cands[0]` and threw a TypeError. A pilot that cannot verify has exactly one
honest thing to say and it is the thing this project is best at saying, so it now REFUSES with
`no verify regime produced a scored candidate — nothing was measured, so there is nothing to
vouch for`. A crash three layers from the cause is the same fault as the barrel's refusal that
was "a construction failure wearing a rate-limit message".

**6e-SIXPLANT. THE PASS THAT WAS NEVER RUN, RUN — AND IT CHOOSES THE DEFAULTS, FINDS A NaN, AND
MEETS THE PLC BUDGET.**

`test/pilot/sixplant.mjs` runs every plant's OWN test in a child process with the module solver
defaults set, and scrapes that plant's OWN headline — no plant is re-scored by a metric this file
invented, and a scraper that misses prints `—` rather than a stale number (rule 25). Refusals are
kept in the table beside the scores, because a plant that refuses is a result and not a gap.

The knob it sweeps is `setSolverDefaults`, a new export: `qpIters` and `horizonTs` were
constructor arguments with hard defaults, so sweeping them meant editing six test files. A
caller's explicit value still wins; this only moves what "unspecified" means. It is a setter and
not an env read because `lib/` may not touch `process` (rule 60, enforced by `test/parse.mjs`).

```
 qp:hTs   tanks   thermal   woodberry   rollmill      emps         arm      EMPS MAC/cycle
  4:1.5   1.00x   1.00x     82.10 IAE   ver 0.57x    14.7x       6.18x      42,914   429%
  2:1.2   1.00x   1.00x     78.28 IAE   ver 0.70x    14.0x       5.99x       9,517    95%   <-
  1:1.2   1.00x   1.00x     76.39 IAE   ver 0.85x    13.3x   4.96x RED       ~5,900    59%
```

**THE TABLE DECIDES IT, BY RULE 42's BAND ON THE IMPROVEMENT.** At 2 iterations and a 1.2·Tset
horizon, EMPS is 4.8% down and the arm 3.1% — both inside the 5% band — while **Wood-Berry, the
plant this project LOSES on, improves 4.7%** and the mill's own verify climbs **23%** (0.57x →
0.70x, toward the 0.85x veto it has to clear before it can deploy at all). One iteration is
better still on both losers and is ruled out by both WINNERS rather than by preference: EMPS
falls 9.5%, outside the band, and the arm falls 20% with its own test going red.

**AND IT IS THE FIRST TIME WHAT SHIPS FITS THE SCAN.** The deployed EMPS path is **9,517 MAC per
cycle against 10% of a 1 ms task** — target 6, met, on the one plant it has been costed on —
where the old default is 42,914, i.e. 429%. CLAUDE.md's projected cheap corner reached 101% and
gave up 13% of the delivery; this reaches 95% and gives up 4.8%, because the projection was made
at one iteration with the fit mode held fixed and the two are not separable.

**THE DIRECTION IS THE INTERESTING PART, AND IT IS THE SAME ONE WOOD-BERRY FOUND.** Less
inversion helps the plants that lose and costs the plants that win, monotonically, on all four
that move. That is not a coincidence of tuning: the QP inverts the forecast, so iterations and
horizon are two regularisers of that inversion, and a plant whose forecast is poor is a plant
whose inversion should be regularised harder. The band is what stops it going further.

**AND THE PASS IMMEDIATELY EARNED ITSELF BY FINDING A NaN NO CHECK COULD SEE.** At 2:1.2,
`emps.test.mjs` reported `NaN at 10,148 MAC`. `pilot.N` is writable and the test sets it to 56 to
score the budget-fitting corner — a TRUNCATION at the default horizon and an EXTENSION past the
fitted bank at any shorter one. Extended, `act()` reads leads that were never fitted and returns
NaN, the machine drives on a number nobody computed, and nothing fires because **NaN passes every
bounds test** (rule 51: silence is a failure mode). `_initRun` now clamps the horizon to the bank
and RECORDS it in `report.horizonClamped` — clamping quietly would leave a later reading of "N
56" describing a horizon the machine did not run (rule 30). With that fixed the corner reads
0.0434 mm at 9,517 MAC and EMPS passes at the new defaults.

**WHAT THE PASS DOES NOT DO IS RESCUE THE TWO REFUSALS.** The tank and the barrel read 1.00x at
every configuration — neither knob touches them, because neither is what is wrong there.

**6e-GATE. THE GATE'S ESTIMATE CARRIES NO INFORMATION ABOUT WHAT IT DELIVERS — CORRELATION
-0.06 ON EIGHT DRAWS. THAT IS A DIFFERENT FAULT FROM A MISPLACED THRESHOLD, AND A WORSE ONE.**

`tankspread.mjs` now prints the gate's OWN estimate and its two regime scores beside the
delivered benefit, which is the only way to tell a gate whose THRESHOLD is wrong from one whose
ESTIMATE is. At the NEW defaults, eight seeds:

```
 seed  deploy   x delivered   gate     regimes
    1    NO       1.000       —        (guard on measured[0] tripped three times)
    2    NO       1.000      1.78x     scribble 0.77x / program 1.78x
    3   yes       1.512      1.75x     scribble 0.90x / program 1.75x
    4   yes       1.775      1.71x     scribble 3.43x / program 1.71x
    5   yes       0.820      2.98x     scribble 2.38x / program 2.98x
    6   yes       0.424      1.42x     scribble 5.29x / program 1.42x
    7   yes       1.249      2.06x     scribble 2.39x / program 2.06x
    8    NO       1.000      1.40x     scribble 0.22x / program 1.40x

 DEPLOYED 5/8, median 1.249x    gate estimate vs delivered: correlation -0.057
                                mean estimate 1.87x, mean delivered 1.111x
```

**THE DEFAULT CHANGE HELPED THIS PLANT A LOT AND DID NOT FIX IT.** Deployed median goes 0.675x →
**1.249x**, and two deployments now genuinely beat the recorded 1.32x (1.512x and 1.775x). But
two of the five still HURT, and the worst is 0.424x.

**AND THE RANKING IS THE FINDING.** A gate whose threshold is merely in the wrong place still
ranks: its estimate would rise with the delivered benefit and the cut would be in the wrong
spot. This one does not rank at all. The seed it rates HIGHEST (2.98x) delivers 0.820x; the seed
that delivers best (1.775x) it rates second-LOWEST of those it passed; the 5.29x scribble on seed
6 precedes a 0.424x machine. On seven paired draws the correlation is **-0.057**, and the mean
estimate overstates by 68%.

**SO THE GATE IS NOT MEASURING THE THING IT GATES ON, ON THIS PLANT.** CLAUDE.md already records
the ordering as inverted on EMPS — "the estimate falls as the delivered benefit rises", and it
understates 9x there — and this is the same defect read on a plant where the errors point the
dangerous way. Two independent plants now say the verify's ratio is not a predictor of delivered
benefit, which is a claim about the INSTRUMENT rather than about either plant, and it sits
directly under the one line the north star calls SUPPORTED.

**EIGHT DRAWS IS EIGHT DRAWS.** A correlation on seven paired points has a wide interval and this
is not a proof that the estimate is worthless; it is enough to say the gate has never been shown
to rank, and that showing it must come before anything else is derived from it. What the number
does establish beyond argument is the SPREAD — 4.18x between best and worst delivered, against a
gate threshold of 1.1x — because that is a direct measurement and not an inference.

**6g. THE SPREAD PASS: EVERY PLANT'S NUMBER IS A DRAW, AND ON TWO PLANTS EVERY DEPLOYMENT
HARMS THE MACHINE.**

`test/pilot/spread.mjs` runs each plant's OWN test with one module-level seed offset changed and
scrapes that plant's OWN headline — no rig is copied, nothing is re-scored. `setSeedOffset`
OFFSETS rather than overrides, because a test that passes different seeds to different
commissionings is making a point with them and forcing them to one number silently rewrites the
experiment (measured: forcing it made a passing commit report two unrelated failures).

```
 plant       median      min      max   spread   refused
 emps       0.03980  0.03940  0.04120    1.05x     0/8
 arm         0.02366  0.02240  0.02528    1.13x     0/6
 woodberry     62.40    43.90    95.73    2.18x    3/12
 tanks         1.000x   0.368x   1.775x   4.18x     3/8   (from `tankspread.mjs`)
```

**THE VARIANCE TRACKS WHETHER THE PLANT IS IN THE METHOD'S WHEELHOUSE.** The two plants this
project WINS on are repeatable to 5% and 13%; the two it loses or refuses on are draws of 2.2x
and 4.2x. That is a sharper statement of the north star's "ONE ERROR CLASS done very well" than
the win/loss table gives, because it says the failures are not merely smaller wins — they are
different in kind.

**AND SPLITTING THE DRAWS BY WHETHER THE PILOT ACTUALLY ACTED IS THE FINDING.**

```
 Wood-Berry, 12 seeds
   deployed (9)  78.28 60.18 61.58 64.65 78.17 61.13 88.62 95.73 63.22   median 64.65
   refused  (3)  43.90 43.90 43.90    <- the plant WITHOUT the pilot
   steady-state inversion only                43.90
   Luyben BLT decentralized PI                51.95   [the published baseline]
```

**EVERY ONE OF THE NINE DEPLOYMENTS IS WORSE THAN NOT DEPLOYING.** The median deployment makes
the plant 1.47x worse than the machine it sits on, the best is still 37% worse, and the three
refusals are the three good outcomes. That is the same shape the tank showed at the old defaults
— 4 of 8 deployed and all four hurt — on a plant that shares no physics with it.

**AND THE BASELINE THIS PROJECT HAS BEEN "LOSING TO" IS BEATEN BY DOING NOTHING.** The
steady-state inversion alone reads 43.90 against the published BLT's 51.95. So "the pilot loses
to a 1980s classical method" was never the right frame: the pilot is making a machine that
already beats BLT substantially worse, and quoting it against BLT hid that behind a comparison
with a third party.

**THE TARGET-7 CLAIM I MADE ONE STEP EARLIER WAS WRONG AND IS WITHDRAWN.** Reading the 12-seed
minimum of 43.90 against BLT's 51.95, I wrote that the pilot beats the published baseline on one
draw in twelve. It does not: that draw is the pilot REFUSING, `u peak 0.000`, and the number
belongs to the plant. Three seeds share it to four figures, which is what made it checkable —
three identical values are a floor, not a coincidence, and the summary table could not show that
until it printed the draws (rule 28).

**THE INSTRUMENT HAD THE MATCHING DEFECT AND IT IS FIXED.** `spread.mjs` detected refusals with
`/REFUSED|refused|"deploy":false/` and the pilot's actual sentence is *"this pilot does not
deploy a controller the machine has not vouched for"* — so Wood-Berry reported **0 of 12 refused
while three had refused**, and their scraped score was the baseline pooled into a column of
controller results. It now matches the real wording AND cross-checks it against `u peak 0.000`,
two independent readings of one fact, printing a warning if they ever disagree (rule 6).

**TWO EXPLANATIONS FOR THE VARIANCE WERE TESTED AND BOTH FAILED.**

* **The verify's quarter rate.** CLAUDE.md carries the hypothesis in as many words — both regimes
  run at quarter rates while the machine runs at its limits. `setVerifyRateDiv` exposes it. At
  full rate on the tank the gate does not start ranking, it **anti-ranks**: correlation -0.445
  against -0.057, with 6 of 8 deploying and the worst still 0.368x. The hypothesis is dead, and
  the quarter rate stands on the measurement it was chosen for.
* **A longer excitation.** `setExciteScale` triples it — 67,400 steps to 91,400 on Wood-Berry,
  and at seed 0 that is worth 78.28 to 63.07. Across twelve seeds it buys nothing: spread 2.18x
  to **2.27x**, median 62.40 to 66.50. More data does not close it, which is a real answer to
  target 4 from the other side — commissioning length is not what is buying the result, so it is
  a candidate for cutting rather than extending.

**WHICH LEAVES THE ONE LEVER THAT WOULD CONVERT THE SPREAD INTO A GAIN, AND SAYS WHY IT IS
BLOCKED.** A 2.2x spread is an opportunity if the draws can be RANKED: commission k times, keep
the best, and Wood-Berry's median deployment goes from 64.65 to its best 60.18 — or, better, to
the refusal at 43.90. Ranking is exactly what the gate does not do (correlation -0.06 on the
tank), so the spread is currently pure loss. **Making the verify rank is now the highest-value
open item in this file**, ahead of any further work on the controller itself, because it is worth
a factor on two plants without changing the algorithm at all.

**6h. NO RULE ON THE GATE'S OWN NUMBERS SEPARATES THE HARMFUL DEPLOYMENTS, BECAUSE ON THIS PLANT
THERE IS NOTHING TO SEPARATE.**

`spread.mjs` now records the gate's two regime ratios beside what each draw delivered, sorted by
the outcome, so "can anything rank these?" is read off the page rather than argued.

```
 draw   delivered   scribble   program   acted
    5       43.90       2.58      0.95   no      <- the three refusals are the three
    9       43.90       0.83      1.04   no         best outcomes on this plant
   10       43.90       0.28      1.26   no
    1       60.18       7.95      1.64   YES
    6       61.13       2.68      1.39   YES
    2       61.58       7.73      3.22   YES
   11       63.22       2.24      1.19   YES
    3       64.65       1.44      1.19   YES
    4       78.17       1.95      1.36   YES
    0       78.28       1.58      1.22   YES
    7       88.62       2.33      1.20   YES
    8       95.73       1.70      1.33   YES
```

**NEITHER COLUMN ORDERS THE OUTCOMES.** The worst deployment (95.73) has a program ratio of 1.33
and the fifth-best (64.65) has 1.19; the scribble runs 1.44 to 7.95 across deployments with no
relation to delivery at all, and a scribble of 2.58 refused while 1.44 deployed. Raising the
deploy threshold from 1.1 to 1.7 would pass only draws 1 and 2 — which deliver 60.18 and 61.58,
still 37% and 40% worse than refusing.

**SO THE GATE IS NOT MISCALIBRATED. IT IS ANSWERING A DIFFERENT QUESTION.** No threshold on this
pair can work, because the correct policy on this plant is REFUSE EVERYTHING and the pair does not
know that. The existing scribble veto reaches the right answer three times in twelve, and it does
so by accident of the draw rather than by seeing the harm.

**WHICH NAMES THE ACTUAL DEFECT: THE VERIFY SCORES REGIMES IT INVENTED, AND THE MACHINE RUNS A
PROGRAM.** The two regimes are a filtered-noise scribble and a trapezoid built from the LIMITS —
both synthetic, both program-agnostic by design, and neither is the scenario the plant is scored
on. On the plants where the method works that gap does not bite (EMPS and the arm are repeatable
to 5% and 13% and their gates behave); on the two where it does not, the gate is estimating the
benefit of a controller on a trajectory nobody will run.

**AND THAT SUGGESTS THE ONE CHANGE WORTH TRYING NEXT, STATED SO IT CAN BE SHOWN FALSE.** The
pilot is program-agnostic at COMMISSIONING, which is the product claim and must not change. It
does not follow that it must be program-blind at VERIFY: an engineer who is about to let a
controller onto a plant almost always has one representative program, and letting the verify
score THAT — while the model is still fitted from the scribble — costs nothing the north star
asks for. The falsifiable form: gating on a caller-supplied representative program refuses the
nine harmful Wood-Berry deployments and keeps the arm's and EMPS' current verdicts unchanged. If
it does not, the verify's problem is deeper than its regimes.

**6i. THE FIX, AND IT PASSES BOTH HALVES OF ITS OWN PREDICTION: A REPRESENTATIVE PROGRAM FOR THE
VERIFY ONLY.**

Built as stated in 6h. `verifyRef` is an optional `(i, n, start) => [pos per channel]` the caller
supplies; it is scored as a third regime alongside the scribble and the limits-trapezoid and
takes part in the same worst-case veto. **The fit never sees it** — the model is still identified
from a program-agnostic scribble, which is the product claim and does not change. Only the
DEPLOY DECISION sees it, and deciding whether to let a controller onto a plant is a question
about the thing that will actually run. Absent, nothing changes.

It is clamped into the engineer's own box rather than trusted raw: a caller's program is written
for their machine and this one may have been derated by a guard, so an unclamped reference would
have the verify measuring a saturation.

**HALF ONE — IT REFUSES THE HARMFUL DEPLOYMENTS.** Wood-Berry, the plant's own benchmark scenario
as the reference, every seed:

```
 without    78.28 60.18 61.58 64.65 78.17 [43.90] 61.13 88.62 95.73 [43.90] [43.90] 63.22
 with       43.90 43.90 43.90 43.90 43.90  43.90  43.90 43.90 43.90  43.90   43.90  ...
            — every seed refuses, u peak 0.000, and 43.90 is the plant without the pilot
```

Nine harmful deployments become zero. On this plant the measurement says the correct policy is to
refuse everything, and the gate now reaches it every time instead of three times in twelve.

**HALF TWO — IT LEAVES THE PLANT THAT WORKS ALONE, BYTE FOR BYTE.** EMPS with and without the
representative regime: **0.0412 mm, 14.0x, identical**. That is the control rule 21 asks for — a
repair that changes the cases it should not touch has changed the measurement rather than fixed
anything — and it is what separates this from simply making the gate stricter until the bad plant
goes quiet.

**WHAT IS NOT YET SHOWN, STATED RATHER THAN IMPLIED.** This is two plants of six. The arm, the
tank, the mill and the barrel have not been run with a representative reference, and the tank is
the one that matters most, because there the correct policy is NOT "refuse everything" — some
draws deliver 1.775x — so it tests something Wood-Berry cannot: whether the gate now RANKS, or
merely refuses harder. A gate that only ever refuses would pass both halves above and be useless.

**AND THE KNOBS THIS ARC ADDED ARE ALL THE SAME SHAPE, DELIBERATELY.** `setSolverDefaults`,
`setSeedOffset`, `setVerifyRateDiv`, `setExciteScale`, `setVerifyRef` — module-level setters with
constructor overrides, so a harness can sweep six plants without editing six test files and
without `lib/` ever reaching for `process` (rule 60). Every experiment in 6e-6i is one of these
plus `spread.mjs`.

**6j. THE TANK SETTLES IT: THE GATE NOW RANKS. CORRELATION 0.989 AGAINST -0.057.**

Wood-Berry could not distinguish a gate that RANKS from one that merely refuses harder, because
there the right answer is to refuse everything. The tank can: some draws genuinely deliver 1.775x,
so refusing those would be worse and not better. With the plant's own recipe as the reference:

```
 seed  deploy   delivered   scribble  program  REPRESENTATIVE
    1    NO       1.000        —         —        —        (guard tripped three times)
    2    NO       1.000       0.77      1.78     0.48       refused by the scribble veto
    3   yes       1.512       0.90      1.75     1.27
    4   yes       1.775       3.43      1.71     1.58
    5    NO       1.000       2.38      2.98     0.54       refused BY THE REPRESENTATIVE
    6    NO       1.000       5.29      1.42     0.50       refused BY THE REPRESENTATIVE
    7   yes       1.248       2.39      2.06     0.88
    8    NO       1.000       0.22      1.40     0.34       refused by the scribble veto
```

**EVERY DEPLOYMENT NOW HELPS, AND NOTHING IS MADE WORSE.** Deployed 3 of 8 at a median of
**1.512x**; the minimum delivered across all eight seeds is **1.000x**, because a refusal applies
nothing. The two seeds the representative regime vetoed are exactly the two that harmed the plant
without it — 0.820x and 0.424x — and it caught them while the old gate rated them 2.98x and 1.42x,
its highest and its middle.

**AND THE REPRESENTATIVE REGIME'S OWN NUMBER TRACKS DELIVERY ALMOST EXACTLY:**

```
 representative   0.50    0.54    0.88    1.27    1.58
 delivered       0.424   0.820   1.248   1.512   1.775      monotone in all five
```

**Correlation 0.989 against the old headline's -0.057.** The three readings on this plant now run:

```
 old defaults, old gate    4/8 deploy, ALL FOUR HARM, deployed median 0.675x, corr -0.057
 new defaults, old gate    5/8 deploy, two harm,      deployed median 1.249x
 new defaults, NEW gate    3/8 deploy, ALL THREE HELP, deployed median 1.512x, corr 0.989
```

**ONE MORE INSTRUMENT FAULT, CAUGHT BY THE SAME RULE AS THE OTHERS.** The first run of this
reported correlation **-0.141** and it was reading `V.ratio`, the headline the OLD two-regime gate
produced — no longer the column doing the deciding. A calibration statistic computed on the wrong
column measures the instrument it replaced (rule 17). Reading the representative regime's own
value gives 0.989 from the same eight commissionings.

**WHAT IS STILL OPEN.** Three plants — the arm, the mill, the barrel — have not been run with a
representative reference, and the arm is the one that matters, because it is the second winner and
the control has only been taken on EMPS. And the reference has to come from somewhere: this is a
new thing the engineer must supply, which is a real cost against "wire it up and press one button"
even though it is one they almost always have.

**6k. THE DEFAULTS CHANGE IS REVERTED, AND THE PASS THAT JUSTIFIED IT HAD THE SAME HOLE IT WAS
BUILT TO CLOSE.**

`sixplant.mjs` swept six plants, rule 42's band picked 2 iterations at 1.2·Tset, and the defaults
were changed. The full suite then failed two tests that the pass never looked at:

* **`autostack.test.mjs`, THE CONTRACT.** The arm's ladder actually SHIPS BETTER at the new
  defaults — 2.0129e-2 total, **23.15x against the 22.42x on record** — while the contract, which
  is on the **model-only** stack because that is what survives the memory's retirement, goes
  8.5e-2 to **9.14e-2 and red**. The headline improved and the falsifiable claim regressed.
* **`stack.test.mjs`.** On EMPS the cascade admits TWO layers instead of three (layer 2 refused at
  verify 1.04x — the machine's answer, correctly reported), and the test indexes `L[2]` blind.

**SO THE PASS MEASURED SIX HEADLINES WHILE THE CONTRACTS SAT ONE LEVEL DOWN.** That is precisely
the fault this file recorded two entries earlier about the shared fit — "measured on the two
plants least able to falsify it" — repeated in a new costume by the instrument built to prevent
it. A pass over PLANTS is not a pass over CONTRACTS, and the six plants' own headlines are not
where this project's claims live.

**REVERTED TO 4:1.5.** What the measurement still buys is real and is kept: the cheap corner is
reachable and costed at **9,517 MAC/cycle against 10% of a 1 ms scan** where the default is
42,914, and it is better on both plants this project loses on. It stays available through
`setSolverDefaults` and is not imposed — the same shape as every other constant here (rule 31).

**AND `stack.test.mjs` TURNS OUT TO HAVE BEEN RED ALREADY — A THIRD PRE-EXISTING FAILURE, AND MY
CHANGES ARE EXONERATED BY THE CONTROL.** It still failed after the revert, which pointed at the
one remaining candidate in the diff (the `_initRun` horizon clamp, which touches every deployed
run). Run at `3d8db01`, the commit this session started from and before any library change here:
**the identical machine answer, layer 2 refusing at verify 0.95x, exit 1**. So it joins
`tanks.test.mjs` and `woodberry.test.mjs` as a test whose state was simply unknown — all three
invisible behind the `set -e` abort at the tank, and all three surfaced only by the collector.
The one difference my change makes is that at `3d8db01` it CRASHES with a TypeError and now it
REPORTS the refusal, which is the diagnosis improving on a failure that was always there.

**AND ONE TEST DEFECT IS FIXED RATHER THAN WORKED AROUND.** How deep the cascade goes is a MACHINE
measurement — a layer that cannot vouch for itself ends the stack — so two layers where three ran
before is a legitimate answer, not an error. `stack.test.mjs` turned it into `Cannot read
properties of undefined`: a crash instead of a report, on a run whose interesting content was the
refusal it had just printed. It now checks the layer count and FAILS with the refusal in the
message, so a machine answering differently and a test falling over are no longer the same
observation (rule 51).

**6f. AN 11% REGRESSION ON THE ARM — SUPERSEDED BY 6d, KEPT FOR THE METHOD.** The arm's model-only stack (conventional withheld, which is what survives the
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

**AND IT PRODUCED A BETTER ARGUMENT FOR THE RETIREMENT THAN ANY OF THE TRANSFER NUMBERS.**
Three arm runs, same machine, same program, same code, differing only in a lead-sample count
that moves the model by 0.7%:

```
              shipped (with the lap rung)     model-only stack
run 1                    23.12x                   8.3206e-2
run 2                    19.96x                   8.2614e-2
run 3                    18.49x                   8.3121e-2
spread                     25%                        0.7%
```

**The lap-periodic rung is not merely non-transferable — it is not REPEATABLE.** Its probe is
random, and the whole 25% is its. The model layers reproduce to 0.7% on the same runs. A rung
whose contribution swings a quarter on re-commissioning is not something a machine can be
specified against, quite apart from what it does on a program it has not seen.

**AND SINGLE-RUN COMPARISONS ON THE SHIPPED NUMBER ARE THEREFORE NOT EVIDENCE.** Several in
this file were made that way, including the claim that the new defaults took this arm from
20.08x to 23.12x: that difference is inside the noise and cannot be claimed. The model-only row
is the stable one, and it is also the row the retirement leaves.

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
