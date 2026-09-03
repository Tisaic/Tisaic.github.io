# The plan to reach the north star

Written against `CLAUDE.md`'s **THE NORTH STAR**. Every step below names the measurement that
decides whether to continue, because a plan whose steps cannot fail is a wish list.

## THE CURRENT SEQUENCE — read this first; everything below it is the record, not the plan

Rewritten after the gate repair and the ensemble arc. Where this and anything below disagree, this
is what is being worked.

### What changed, and it changed the shape of the problem

**THE CONTROLLER WAS NEVER THE BOTTLENECK.** Three independent measurements now say the same thing
from different directions:

* the QP is not binding — a receding horizon applies only its first move, and per-lead trust
  weights moved the arm 0.0%;
* the pilot sits AT its forecast bound on EMPS — R² 0.9957 leaves 6.6% of the truth's rms, which is
  0.038 mm against 0.045 delivered;
* and **a single commissioned model is more error than signal** — on the tank the disagreement
  between draws is **1.21x** the size of what they agree on.

So the remaining factor was never in the solver or the horizon. It is in the fact that one
commissioning is one draw from a wide distribution, and nobody was choosing.

**THREE THINGS THAT COST NOTHING AT DEPLOY NOW EXIST.**

```
 tank, eight commissioning seeds
   raw draws                       REFUSED, 1.000x   <- the gate correctly declined every one
   ridge x100 alone                         1.176x
   averaging 5 draws                        1.344x
   ridge AND averaging                      1.594x   vouched for itself at 1.58x
```

1.176 x 1.344 = 1.581 against 1.594 observed: they multiply, so they are two mechanisms. The ridge
shrinks each draw's own error; the average cancels the disagreement between draws. **All of it is
one weight vector at deploy** — same arithmetic, same memory as a single commissioning.

**AND THE GATE CAN NOW TELL DRAWS APART**, which is what makes any of it usable: a representative
program supplied for the DEPLOY DECISION ONLY takes the tank's gate from correlation -0.057 to
**0.989**, refuses all twelve harmful Wood-Berry deployments, scores the barrel for the first time
ever, and leaves EMPS and the arm byte-identical.

### The six steps, in the order their evidence justifies

**1. THE HELD-OUT TEST DECIDES WHETHER ANY OF THIS SURVIVES.** `armens.mjs` commissions the arm six
times, averages, and reads the CIRCLE — a program no draw was scored on and the average was not
selected on. **If the advantage is only on the shared program, averaging is a memory by a new route
and the retirement rules it out.** Nothing else on this list matters until that returns.

**2. THEN THE SIX-PLANT PASS, ON CONTRACTS AND NOT HEADLINES.** Three changes are waiting on it —
the lead basis (cascade depth 1 → 2 for +0.8% arithmetic), the ridge (the tune picks one 100x too
small on the tank), and the ensemble. The lesson is already paid for: the defaults change that
passed six plants' headlines broke the arm's model-only contract, because **a pass over plants is
not a pass over contracts.**

**3. PRICE k DOWN, WHICH IS NOW TARGET 4's PROBLEM AND ITS ANSWER AT ONCE.** k draws cost k
commissionings today. `freezeConfig` exists and makes them averageable by construction; sharing the
probe and running ONE verify on the average takes the cost to about `1 + k·(excite+fit)`. And the
bootstrap fork tests the theory while cutting the cost: resampling one record gives k fits for zero
machine time, but cannot add EXCITATION DIRECTIONS — so if it works the mechanism is not what this
says, and if it does not, the theory stands and the sharing route is the one.

**4. THE MODEL-ONLY BAR IS THE PRODUCT (targets 1, 2, 5).** The memory is retired, so the arm's
number is the model-only stack — 8.5e-2 against the ladder's 1.8e-2 — scored always on the FIRST
lap of a program never run, with the converged value beside it and never instead of it.

**5. THE PLC BUDGET, RE-DECIDED AGAINST CONTRACTS (target 6).** The cheap corner is measured and
reachable — 9,517 MAC/cycle against a 10,000 budget where the default is 42,914 — and is not the
default because it fails the arm contract. Re-run that search with the contracts in the objective.

**6. THEN A RIVAL (target 8).** Norm-optimal ILC on this bench. Last, because a rival measured
while the refusal machinery is still being repaired would measure the wrong thing — and because
this arc has already shown a comparison can be misdirected by a third party: Wood-Berry was quoted
against BLT for months while the plant WITHOUT the pilot beat BLT outright.

### Where the eight targets actually stand

| target | movement this arc |
|---|---|
| 1 program-agnostic | **pending step 1** — the held-out test is the whole question |
| 2 feedrate-agnostic | untouched |
| 3 plant-agnostic | **materially better**: refusals are now honest on all six, the barrel scored for the first time, two harmful deployments prevented |
| 4 commissioning in minutes | **in tension and with a route** — k draws cost k, reducible to `1 + k·(excite+fit)` |
| 5 higher | **1.594x on the tank from eight refusals**; the arm untested |
| 6 PLC scan | reachable at 95% of budget, not default — blocked on contracts |
| 7 breadth | **reframed**: Wood-Berry's baseline is beaten by doing nothing, so the target there is "beat 43.90 or refuse every time", and refusing is achieved |
| 8 a rival | untouched |

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

## AN ARCHITECTURAL CANDIDATE: AVERAGE THE COMMISSIONING DRAWS, FREE AT DEPLOY

**The chain that gets here.** The QP is not binding (a receding horizon applies only its first
move). The pilot sits AT its forecast bound on EMPS. So a remaining factor has to come from the
model — and re-rolling commissioning is worth **1.545x held-out** on the arm, which says the SEARCH
is where it lives rather than the model class.

**AND THE SPREAD IS ESTIMATION VARIANCE, NOT A DISCRETE PICK — measured, and it decided the
architecture.** Six arm draws delivered 6.18x down to 5.34x on one program and 10.02x down to 5.19x
on a held-out one, and **all six chose the identical configuration**: stride 13, ridge 1e-5, N 58.
A spread at a fixed layout is variance, and variance is what averaging removes.

**SO AVERAGE THE WEIGHT VECTORS.** k draws collapse to ONE vector of the same length — deployed
arithmetic and memory unchanged, against selection's identical cost and a per-lead bank's 68
covariances. Selection keeps 1 of k and discards k-1; the average keeps all of them.

```
 tank, 8 seeds, representative gate, basis pinned
   every individual draw           REFUSED — 0 of 8 deployed, best 1.000x
   the average of 5 of them        1.344x
```

**EVERY DRAW WAS BELOW THE BAR AND THEIR MEAN IS A WORKING CONTROLLER.** That is the classic
variance-reduction result in its strongest form: the average is not merely better than the median,
it is better than the best draw, so it is finding something no single commissioning had.

**TWO THINGS THAT ARE NOT YET ESTABLISHED, AND THE FIRST DECIDES WHETHER THIS IS AN ARCHITECTURE.**

* **THE ENSEMBLE VOUCHED FOR ITSELF — MEASURED, so this is an architecture and not an
  observation.** `_startVerify()` is already re-entrant (a guard derate re-enters there), so the
  averaged model goes through the same verify round as any commissioned one, on the machine.
  Result: **DEPLOY, delivering 1.344x**. Commission k → average → vouch → deploy is a complete
  loop, and every one of the eight draws that fed it had refused.
* **3 of 8 draws still differ in layout with the basis pinned**, so the basis is not the only
  discrete thing that moves between draws — most likely the tuned window. The layout guard
  excluded them rather than averaging incompatible rows, which is why the first attempt averaged
  only 2 of 8 and measured nothing (sqrt(2) of variance removed is not a result).

**AND IT REFRAMES TARGET 4.** Commissioning cost stops being pure overhead: k is a dial between
commissioning time and delivered performance, by two independent mechanisms now — selection
(1.545x, held out, rank 1 of 6) and averaging (a working controller from eight refusals).

## WHY AVERAGING WORKS HERE, AND WHAT THAT PREDICTS

**THE MECHANISM.** Each commissioning excites the plant with a different random draw, so each fit
is well-determined in the directions that draw happened to excite and poorly determined in the
rest. The ridge does not remove that error, it shrinks it — and the SHRUNK error still points
somewhere, in a direction set by the draw. Across draws those directions are independent, because
the only thing that differs is the excitation seed. So the errors partly cancel in the mean while
the signal, common to every draw, does not. That is ordinary variance reduction, and its
signature here is sharp: the average beat every draw rather than landing between them.

**AND IT EXPLAINS WHY A LONGER EXCITATION BOUGHT NOTHING.** Tripling the record moved Wood-Berry's
spread 2.18x → 2.27x. If the variance were sampling noise on a well-conditioned fit, three times
the data would visibly shrink it. It did not, which says the error lives in directions the
excitation does not cover no matter how long it runs — and lengthening a record does not add
directions, it adds rows in the directions already there. Averaging over draws DOES add
directions, because each draw covers a different set.

**FOUR PREDICTIONS, EACH OF WHICH COULD BE FALSE.**

1. **The gain grows with k and then flattens** — roughly as the variance falls, so most of it
   arrives by k = 4 to 8 and k = 32 is not worth 4x the commissioning. If the gain keeps rising
   linearly, the mechanism is not variance reduction and this account is wrong.
2. **It helps most where the spread is largest.** The tank (4.2x spread) should gain far more than
   EMPS (1.05x). If EMPS gains as much, the spread is not what averaging is removing.
3. **It should be strongest exactly where individual draws REFUSE** — a refusal means each draw's
   error is large enough to cost the machine, which is the regime where cancelling it matters.
   That is already the observed case (8 refusals → a vouched 1.344x) and it is the prediction most
   at risk of being a one-plant coincidence.
4. **Averaging should beat selection**, because selection keeps one draw's error and averaging
   cancels k of them. Measured so far: selection 1.545x held-out on the arm, averaging untested
   there. If selection wins on the arm, the two mechanisms are not what this says they are.

**AND ONE PREDICTION THAT WOULD KILL THE WHOLE THING.** If the averaged model's advantage
disappears on a HELD-OUT program — if it is merely fitting the program the draws shared — then it
is a memory by a new route, and the retirement rules it out. The arm is the plant that can answer
that, because it has two programs and the tank has one.

## REDUCE: k COMMISSIONINGS DO NOT NEED k FULL COMMISSIONINGS

Averaging costs k commissionings and commissioning is the thing this project already calls
outrageous — roughly half an hour on one plant. But k full commissionings is not what the
mechanism needs.

A commissioning is settle → probe → excite → fit → verify. The variance the average removes comes
from the EXCITATION draw: the probe measures a timescale and a response that do not depend on the
seed, and the settle is the machine reaching a start pose. Those are plant properties. **Only
excite → fit has to be repeated k times**, and the verify runs ONCE on the averaged model rather
than k times on models that will be thrown away — which is already how the measurement above was
taken, since the ensemble vouches for itself in a single verify round.

Measured on the tank, one commissioning is 217,893 steps of which the excitation is the declared
`exciteSteps`; on EMPS the whole thing is 67,400 steps and 3x excitation only reached 91,400,
which puts the excitation at roughly a third. So k draws sharing one probe and one verify cost
about `1 + k/3` commissionings rather than k — **k = 8 for the price of about 3.7**.

**IT IS NOT YET BUILT, AND THE REASON IT IS WORTH BUILDING IS THAT IT CHANGES THE TRADE.** At k
draws for k commissionings, averaging competes with every other use of that time. At `1 + k/3` it
is close to free next to a single commissioning, and target 4's "commissioning in minutes" and this
factor stop being in tension.

**WHAT WOULD MAKE IT WRONG:** if the probe's own measurement varies enough between seeds to matter,
sharing it would freeze one draw's timescale into every model and re-introduce exactly the
single-draw dependence the average exists to remove. That is checkable before building — compare
the probed Ts, Tset and sample across the eight draws already run.

## ANALYSED: THE SECOND DISCRETE VARIABLE IS THE WINDOW, AND IT SWINGS THE MODEL 3.3x

With the basis pinned, 3 of 8 tank draws still could not be averaged. Printing the layout per draw
names what moves:

```
 5 draws    97f/58L/s13/lin   97f/58L/s13/lin      <- the majority
 1 draw    321f/58L/s32/lin   97f/58L/s13/lin
 1 draw     97f/58L/s21/lin   97f/58L/s13/lin
 1 draw     97f/58L/s32/lin   97f/58L/s32/lin
```

**THE TUNED STRIDE FLIPS BETWEEN 13, 21 AND 32 ACROSS COMMISSIONING SEEDS**, and the feature count
with it — **97 against 321**. That is not a perturbation: a stride of 32 looks back over 2.5x the
window of a stride of 13, so the plant is being modelled at a different timescale depending on
which random excitation it happened to see.

**AND THE OBVIOUS EXPLANATION IS WRONG — THE TIE-BREAK IS ALREADY DETERMINISTIC.** Reading the
code rather than assuming it: the window sorts `near.sort((a, b) => a.lag - b.lag)`, shortest lag
inside the band, and the tune sorts `(a, b) => b.ridge - a.ridge || a.stride - b.stride`, largest
ridge then smallest stride. Both ties are broken, and broken the way rule 42 asks.

**WHAT MOVES IS THE BAND MEMBERSHIP, NOT THE TIE-BREAK.** Which combinations land within 5% of the
best depends on the held-out r2 of each, and those scores are measured on a seeded draw. A stride
that is inside the band on one commissioning is outside it on another, so a deterministic rule
selects from a different candidate set and returns a different answer. That is not a defect in the
rule; it is what selecting on a noisy score does, and no tie-break can fix it.

**WHICH POINTS AT A DIFFERENT FIX, AND A BETTER ONE.** For averaging, the configuration does not
need to be STABLE across draws — it needs to be THE SAME. So choose it once and draw k excitations
against that fixed choice: commission one pilot fully, keep its window, stride, ridge and basis,
and re-excite k times at that configuration. Every draw is then averageable by construction, k = 8
averages 8 rather than 5, and the k sweep stops being confounded.

**AND IT COMPOSES WITH THE REDUCTION ABOVE**, which wanted to share the probe and the verify across
draws for the same reason: those stages are not what the average is drawing from. Sharing the TUNE
as well makes the cost of k draws `1 + k·(excite+fit)` and makes them compatible in one move.

**TWO CONSEQUENCES, AND THEY POINT OPPOSITE WAYS.**

* **For averaging**, it is a nuisance: it cost 3 of 8 draws, and the fix is to break the window tie
  deterministically so every draw shares a layout. Then k = 8 averages 8.
* **For the controller**, it is a finding in its own right and possibly a larger one. A model whose
  window swings 2.5x between seeds is not a settled model, and every number this project quotes
  from a single commissioning inherits that. It is worth asking whether the stride tie is real —
  whether those held-out scores are genuinely within the band — before treating it as noise.

## OPTIMISED: THE LIFT AGAINST k, AND k = 2 IS WORSE THAN NOTHING

```
 k=2   averaged 2/2   delivers 0.687x     <- actively harmful
 k=4   averaged 4/4   delivers 1.493x
 k=8   averaged 5/8   delivers 1.344x     <- and only five of the eight were averageable
```

**PREDICTION 1 HOLDS IN SHAPE AND FAILS IN DETAIL.** The gain does arrive by k = 4 and does not
keep climbing, which is what variance reduction looks like. Two things the prediction did not say:

* **k = 2 is worse than not deploying at all.** Averaging two models is not a small version of
  averaging eight — with two draws the mean is as likely to sit between two errors as to cancel
  them, and here it produced a controller that harms. Anyone reaching for "average a couple of
  runs" gets the opposite of the result.
* **The k = 8 point is CONFOUNDED and cannot be read as a flattening.** It averaged 5 of 8 draws
  where k = 4 averaged 4 of 4, so it is a different MEMBERSHIP and not merely more of the same —
  the window instability above is contaminating the very sweep meant to measure the mechanism. The
  honest statement is that the gain arrives by k = 4 and that k = 8 has not yet been measured on
  this plant, because eight averageable draws do not exist until the window tie is broken.

**WHICH MAKES THE WINDOW TIE THE NEXT THING TO FIX RATHER THAN A NUISANCE.** It costs 3 of 8 draws,
it confounds the k sweep, and — separately from averaging — it means the shipped model's lookback
swings 2.5x on a coin.

## BOOTSTRAP vs RE-EXCITATION: THE TEST THAT SAYS WHICH VARIANCE IS BEING REMOVED

**THE REDUCTION.** k draws currently cost k excitations of the machine. But the k models do not
have to come from k runs: one commissioning record can be RESAMPLED — fit k times on bootstrap
draws of its own rows — for k fits and **zero extra machine time**. If that works, averaging costs
one commissioning plus k cheap fits, and the whole k-fold objection disappears.

**AND IT IS ALSO THE SHARPEST TEST OF THE THEORY, WHICH IS WHY IT IS WORTH RUNNING EVEN IF IT
FAILS.** The account says each fit is well-determined in the directions its own excitation covered
and shrunk-but-wrong elsewhere, and that averaging works because those directions differ BETWEEN
DRAWS. A bootstrap resamples rows from ONE record, so it cannot add directions — every resample
sees the same excitation coverage. So:

* **If bootstrap recovers most of the gain**, the variance is row noise on a fixed design, and the
  cheap version is the right version. It would also mean the theory above is wrong about
  directions, and the honest reading would be that a bigger record should have helped — which it
  did not (3x excitation, 2.18x → 2.27x spread), so this outcome would leave two measurements in
  conflict and something else to find.
* **If bootstrap recovers little**, the variance IS excitation coverage, the theory stands, k real
  excitations are irreducible, and the reduction has to come from sharing the probe, tune and
  verify instead — `1 + k·(excite+fit)` rather than `1 + k`.

**IT IS A GENUINE FORK.** One outcome makes averaging nearly free and falsifies the mechanism; the
other confirms the mechanism and prices the feature. Nothing measured so far distinguishes them,
and the 3x-excitation null is the only evidence either way — which points at the second.

## ANSWERED: THE AVERAGE IS CANCELLATION, AND A SINGLE COMMISSIONING IS MORE ERROR THAN SIGNAL

The alternative that had to be excluded: if averaging k models mainly SHRINKS the weights, it is
one commissioning with a bigger ridge and none of the k-fold cost is justified. Measured on the
tank, channel 0, lead 0, five averageable draws:

```
 mean |w| of the draws        1.333
 |w| of their average         0.739      ratio 0.554
 rms spread about the mean    0.896    = 67.2% of a draw's own size
```

**THE RATIO LOOKS LIKE SHRINKAGE UNTIL THE GEOMETRY IS CHECKED.** If each draw is one signal plus
an independent error, `|draw|` should be `sqrt(|mean|² + spread²)` = **1.161** against an observed
**1.333**. That is the signature of cancellation, not of a common scaling — and the 15% gap says
the errors are not perfectly independent, which is worth stating rather than rounding away.

**AND THE NUMBER THAT MATTERS IS THE RATIO OF ERROR TO SIGNAL: 1.21.** The disagreement between
draws is LARGER than what they agree on. A single commissioned model on this plant is more error
than signal, which is simultaneously why averaging works, why one draw's score is a coin, and why
every number this project quotes from a single commissioning deserves the spread beside it.

**AND THE MACHINE WAS ASKED, BECAUSE THE GEOMETRY IS AN ARGUMENT (rule 16).** One draw refit at
ridge x100 — same window, same stride, same basis, `freezeConfig` making the ridge the only
variable:

```
 raw draws (all eight)                            REFUSED, 1.000x
 one draw at ridge x100   |w| 0.276 vs 0.578      1.176x
 the average of five      |w| 0.739 vs 1.333      1.344x
```

**A RIDGE THAT SHRINKS MORE DELIVERS LESS.** It takes the weights to 0.478 of a draw's size against
averaging's 0.554 — more shrinkage — and reaches 1.176x against 1.344x. Averaging is not a ridge,
measured on the machine and not only in the geometry.

**AND MORE REGULARISATION DOES HELP THIS PLANT, WHICH IS WORTH SEPARATING FROM THE MAIN RESULT.**
1.000x → 1.176x is a real gain from the ridge alone, for one commissioning and no k-fold cost. The
tune picked a ridge two orders of magnitude smaller than that on every draw, which is its own
finding: rule 42 selects the ridge for the INVERSION rather than the fit, and on this plant it is
still selecting one too small. Whether the two compose — a larger ridge AND an average — is
untested and is the cheap next question.

**AND THE SWEEP SAYS 1.176x IS THE RIDGE'S CEILING, not one lucky multiplier:**

```
 ridge x10      |w| 0.441    1.076x
 ridge x100     |w| 0.276    1.176x   <- the ridge's best
 ridge x1000    |w| 0.106    1.004x
 ridge x10000   |w| 0.023    0.882x   <- over-regularised, actively harmful
 the average    |w| 0.739    1.344x
```

The ridge has an interior optimum and averaging clears it by 14%. Note also that the average's
weights are LARGER than any ridge setting that helps — 0.739 against 0.276 — so it is not reaching
its result by being small, which is the same conclusion the geometry gave from the other side.

## THEY COMPOSE, AND ALMOST EXACTLY MULTIPLICATIVELY: 1.594x FROM A PLANT WHERE EVERY DRAW REFUSED

```
 raw draws (all eight)              REFUSED, 1.000x
 ridge x100 alone                            1.176x
 averaging alone (5 draws)                   1.344x
 ridge x100 AND averaging (5 draws)          1.594x     <- and it vouched for itself at 1.58x
```

**1.176 x 1.344 = 1.581 against an observed 1.594 — a gap of 0.9%.** The two gains multiply, which
is what independent mechanisms do, and it is the strongest evidence yet that they ARE two
mechanisms rather than one seen twice:

* the **ridge** shrinks each draw's own error toward zero, a bias-variance trade inside one fit;
* the **average** cancels the disagreement BETWEEN draws, which no single fit can do at any ridge.

Had the ridge been suppressing variance badly, adding an average would have found little left to
remove and the combination would have landed near 1.344x. It did not.

**AND THE HEADLINE IS THE FIRST ROW.** Every one of the eight commissionings refused — the gate
looked at each and correctly declined to deploy it — and two changes that cost NOTHING at deploy
turn that into a controller delivering 1.594x which vouches for itself on the machine. The plant
this project has been quoting at 1.32x from a single lucky draw, and which at the old gate
deployed four harmful controllers in eight, is now a 1.594x plant.

**WHAT THIS IS NOT.** One plant, one ridge multiplier, k = 5, and a single program — the tank has
only one, which is exactly why the held-out arm test exists. Multiplicative composition on one
point is a suggestion, not a law; two more plants would make it a finding.

## THE HELD-OUT TEST: AVERAGING TRANSFERS, AND IT LOSES TO SELECTION

Six arm commissionings, the gate scoring the ROUNDED rectangle, the CIRCLE never part of any
selection or average:

```
 draw 1  rounded 6.18x   circle  7.72x
 draw 2  rounded 6.12x   circle 10.02x
 draw 3  rounded 5.47x   circle  6.72x
 draw 4  rounded 5.43x   circle  6.25x
 draw 5  rounded 5.34x   circle  5.85x
 draw 6  rounded 5.31x   circle  5.19x

 ENSEMBLE of 4/6      rounded 5.78x   CIRCLE 7.47x
 median draw          rounded 5.45x   circle 6.48x
 best draw            rounded 6.18x   circle 10.02x
```

**IT IS NOT A MEMORY, WHICH WAS THE QUESTION THAT MATTERED.** The average beats the median draw on
a program it was never scored on — 7.47x against 6.48x — so the thing it recovers is a property of
the PLANT and not of the trajectory the draws happened to share. That was the one outcome that
would have killed this outright, and it did not happen.

**AND PREDICTION 4 IS FALSIFIED. Selection beats averaging on this plant.** The prediction was that
averaging should win, because selection keeps one draw's error while averaging cancels k of them.
Measured: the gate picks draw 2 and gets **10.02x**; the average gets **7.47x**. Not close.

**THE TWO RESULTS TOGETHER SAY WHEN EACH ONE APPLIES, WHICH IS MORE USEFUL THAN EITHER WINNING.**

* **On the tank, every draw REFUSED.** There was nothing to select — the best of eight was 1.000x —
  and averaging turned that into a vouched 1.594x. Selection cannot rescue a set with no good
  member; averaging can, because the good model is not any of them.
* **On the arm, every draw DEPLOYS and one is much better than the rest** (10.02x against a median
  6.48x). Selection finds it. Averaging DILUTES it — mixing one excellent model with three ordinary
  ones lands between them, which is exactly what a mean does.

**SO THE RULE IS ABOUT THE SHAPE OF THE DISTRIBUTION, NOT ABOUT WHICH METHOD IS BETTER.** Where the
draws straddle the deploy bar and none is good, average. Where they are all usable and one is
clearly best, select. The gate is what makes either possible, and it is the same gate.

**AND THE OBVIOUS COMPOSITION IS UNTESTED:** select the best HALF of the draws and average those.
It would keep the ensemble's variance reduction while dropping the draws that dilute — and on the
tank, where nothing is worth keeping, it degenerates to averaging everything, which is correct.

*Four of six draws averaged, not six: two chose a different layout again. The arm's six draws
looked identical on a previous reading, so the layout instability is present here too and was
simply not visible in a sample that happened to agree.*

## TARGETS 1 AND 2 IN ONE TABLE: THE SHARP CORNER IS WHERE IT BREAKS

One commissioning on the rounded rectangle at feed 4e-3, then four programs it has never run —
two shapes at two feedrates (`test/pilot/matrix.mjs`).

```
 program                contour off       on        x      lag off    lag on
 rounded @4e-3 (SEEN)      1.343e-1  2.173e-2   6.18x    7.54e-2   2.76e-2
 circle  @4e-3             7.101e-2  9.201e-3   7.72x    3.91e-2   1.42e-2
 circle  @8e-3             3.479e-1  7.151e-2   4.86x    1.47e-1   6.22e-2
 sharp   @4e-3             2.025e-1  1.196e-1   1.69x    1.87e-1   1.56e-1
 sharp   @8e-3             3.675e-1  1.621e-1   2.27x    3.59e-1   2.93e-1
```

**PROGRAM-AGNOSTIC: FAILS, AND FAILS IN ONE PLACE.** The circle transfers BETTER than the program
the pilot trained on — 7.72x against 6.18x — so shape alone is not the problem. The sharp square
reads 1.69x, a **3.65x degradation** against a target of 1.3x. Nothing here is program-agnosticism
failing in general; it is one geometry the controller cannot handle.

**FEEDRATE-AGNOSTIC: NEARLY HOLDS.** Circle 7.72x → 4.86x across a 2x feed change, i.e. 1.59x
against a 1.5x target — just outside. Sharp 1.69x → 2.27x, **1.34x, inside**. So feed is close to
solved on this plant and shape is not, which is the opposite of how the two targets are usually
discussed.

**AND THE SHARP SQUARE GETS BETTER WHEN DRIVEN FASTER, WHICH IS BACKWARDS AND IS A CLUE.** Its
ratio rises 1.69x → 2.27x with the feed doubled, where the circle's falls. The corner rule caps
junction velocity independently of the commanded feed, so a faster program spends proportionally
MORE of its lap in corners — its lap is 8206 steps at 4e-3 and 4590 at 8e-3, a factor of 1.79 and
not 2. The open-loop error nearly doubles (2.025e-1 → 3.675e-1) while the correction removes a
similar absolute amount, so the RATIO improves while the machine gets worse. A ratio is not a
performance.

**THE LAG COLUMN SAYS WHAT IS ACTUALLY WRONG, and it is the reason lag was made a first-class
metric.** Decomposed:

```
 program              contour x   lag x   TOTAL x   the residual is
 rounded @4e-3 SEEN      6.18x   2.73x     4.38x   LAG
 circle  @4e-3           7.72x   2.75x     4.79x   LAG
 circle  @8e-3           4.87x   2.36x     3.98x   contour
 sharp   @4e-3           1.69x   1.20x     1.40x   LAG
 sharp   @8e-3           2.27x   1.23x     1.53x   LAG
```

**THE PILOT IS A CONTOUR CORRECTOR AND BARELY TOUCHES LAG — 1.20x on the sharp square against
1.69x on contour.** On four of the five programs the residual after correction is LAG rather than
shape, and on the sharp square the corrected lag (1.56e-1) is LARGER than the corrected contour
(1.196e-1). On the whole deviation the sharp square is a **1.40x** machine, not a 1.69x one.

**WHICH NAMES THE MECHANISM.** A sharp corner is where the machine stops and restarts, and a
reversal unloads the gearbox wind-up through the backlash — a discontinuity in the correction's
own target, not a smooth function of the state the forecast was fitted on. The model is
identified on a scribble that never stops, so the one motion it has never seen is the one the
square is made of.

**AND NOTHING WAS MADE WORSE**, on any of the four held-out programs, which is the floor the
refusal contract exists to hold and is a different claim from how much it gains.

## CORRECTION: THE TRAINING PROGRAM NEVER ENTERS THE MODEL, SO THAT MATRIX MEASURED CAPABILITY

Commissioning on the SHARP square instead of the rounded rectangle and re-running the same matrix:

```
                  trained on ROUNDED   trained on SHARP
 sharp   @4e-3           1.69x               1.69x
 circle  @4e-3           7.72x               7.66x
 circle  @8e-3           4.86x               4.84x
 sharp   @8e-3           2.27x               2.26x
 rounded @4e-3           6.18x               6.17x
```

**EVERY NUMBER IS WITHIN 1%.** The training program makes no difference at all, and the reason is
structural: **the pilot commissions on an EXCITATION SCRIBBLE built from the channel rate limits.**
The path handed to `commission()` supplies only the home pose and the gate's representative
reference. Nothing program-specific is ever fitted.

**SO THE PREVIOUS ENTRY MISLABELLED ITS OWN RESULT.** "PROGRAM-AGNOSTIC: 3.65x degradation" read
the sharp square's 1.69x as a transfer failure against the rounded rectangle's 6.18x. There is no
transfer to fail: both numbers come from the same model, fitted on the same scribble. What the
matrix measures is CAPABILITY PER GEOMETRY, and that is a different and better thing to know.

**THE MECHANISM I PROPOSED SURVIVES; THE FIX I IMPLIED DOES NOT.** "The model is identified on a
scribble that never stops, so the one motion it has never seen is the one the square is made of"
is still the best account of why sharp corners read 1.69x. But the implied remedy — commission on
the square — cannot work, because commissioning does not look at the square. **The lever is the
EXCITATION, not the training program.** If a stop-restart is what the model is missing, the
scribble has to contain one: dwells, reversals, and junction velocities near zero.

**AND THAT IS A CHEAP, FALSIFIABLE NEXT STEP.** `buildExcitation` already takes a `dwell` flag —
it is how the tank and the barrel declare that their programs hold still — and it has never been
tried on the arm, whose programs stop four times a lap at every sharp corner. If a dwelling
excitation lifts the sharp square and leaves the circle alone, the account is right and the fix is
one flag. If it does not, the missing thing is not the stop.

**ONE NEW NUMBER FELL OUT OF THE WIDER MATRIX:** the rounded rectangle at double feed reads
**2.61x** against 6.17x, a **2.37x** feed sensitivity — the worst of the three shapes and well
outside the 1.5x target, where the circle is 1.58x and the sharp square 1.34x. Feedrate-agnosticism
is not uniform across geometry either, and the shape that fails it is not the shape that fails
capability.

## THE DIAMOND IN THE EXCITATION: A CLEAN NEGATIVE, AND THE HOOK IS REMOVED WITH IT

The idea was well aimed. The excitation is filtered noise that never STOPS, a sharp-cornered
program stops four times a lap, and each reversal unloads the gearbox wind-up through the
backlash — so teach the machine that MOVE PROFILE on a path nothing will be scored on. A diamond
is the square rotated 45 degrees: same four corners, same corner rule, sharing no straight with
the square and sweeping a different part of the workspace.

**IT MADE THE MODEL WORSE AND THE GATE REFUSED.**

```
 appended: 9,281 steps onto a 47,837-step record  (19%)
 verify:   scribble 0.23x · program 0.40x · representative 0.88x  → REFUSED
 without it, the same setup deploys at 6.18x rounded and 7.72x circle
```

**AND THE MECHANISM IS ALREADY IN THIS PROJECT'S RECORD, FROM THE OTHER SIDE.** Identifying on a
program instead of a scribble takes EMPS from 12.70x to 3.93x, "since repeated trapezoids are
collinear". A diamond traversed at two feeds is exactly that: a structured, repeating trajectory
whose rows are nearly collinear, and 19% of them drag the fit toward a program-only solution. The
excitation's value is its RICHNESS, and appending structure dilutes it.

**SO THE IDEA SURVIVES AND THE IMPLEMENTATION DOES NOT.** What the model is missing is a STOP, not
a path. `buildExcitation` already takes a `dwell` flag — it is how the tank and the barrel declare
that their programs hold still — and it puts stops INTO the noise rather than appending structure
to it. That is the experiment worth running, and it needs no new library surface at all.

**AND THE HOOK IS GONE, WHICH IS THE POINT WORTH KEEPING.** `exciteAppend` was built for one
experiment, measured, and removed the same day. It was proven inert first — `arm.test.mjs`
byte-identical at 6.18x and 7.72x with the option present and unused — and it is now asserted
ABSENT in `ensemble.test.mjs`, because a re-introduction that defaulted to on would change what
every plant LEARNS and nothing else in the suite would notice. An experimental hook that is not
carrying a result is a liability; the finding belongs in this file, not in the library.

The diamond itself stays in `arm-rig.mjs` as a shape any experiment can score against. It is four
line segments and it changes nothing unless asked for.

## THE DWELLING EXCITATION: A SECOND NEGATIVE, AND THE HYPOTHESIS IS NOW IN DOUBT

The surviving half of the diamond experiment — put stops INTO the noise instead of appending
structure after it. `dwell` time-warps the excitation so the machine lingers, keeping the record
rich where the diamond made 19% of it collinear.

```
 program            scribble    dwelling
 rounded @4e-3        6.18x       3.40x
 circle  @4e-3        7.72x       3.06x
 circle  @8e-3        4.86x       3.76x
 sharp   @4e-3        1.69x       1.55x
 sharp   @8e-3        2.27x       2.00x
```

**IT DEPLOYED — unlike the diamond, which the gate refused — AND MADE EVERY PROGRAM WORSE**,
including the sharp square it was aimed at. Halving the circle is the price; the square did not
move in the right direction at all.

**ONE THING IMPROVED, AND IT IS NOT NOTHING:** feedrate sensitivity. The circle goes 1.59x → 1.23x
across a 2x feed change and the sharp square 1.34x → 1.30x, both inside the 1.5x target. A
dwelling excitation visits a wider range of speeds, so the model is flatter across feed — and
worse everywhere. That is a real trade and it is available if feedrate-agnosticism is ever the
binding constraint.

**TWO INDEPENDENT ATTEMPTS TO SUPPLY THE MISSING MOVE PROFILE HAVE NOW FAILED**, which is enough to
put the account itself in doubt rather than its implementations:

* appending a diamond — the model was destroyed by collinearity and the gate refused;
* dwelling the excitation — the model deployed and got uniformly worse.

**THE CAVEAT THAT KEEPS IT ALIVE, STATED BECAUSE IT IS LOAD-BEARING:** the warp has a **2% rate
floor**, and its own comment calls it "a dwell, not a stop". A corner takes junction velocity to
NEARLY ZERO, and it is the reversal through backlash that the model has never seen. So a true
zero-velocity reversal remains untried, and the right reading of this null is "the floor is too
high", not "stops do not help".

**BUT THE LAG COLUMN POINTS SOMEWHERE ELSE ENTIRELY, AND IT IS THE BETTER LEAD.** On the sharp
square the correction removes 1.55x of contour and only **1.20x of lag**, and the post-correction
residual is LAG on four of five programs. Lag is a timing quantity — how far the correction leads
the reference — not a coverage one. No amount of showing the model a stop changes what a receding
horizon can do about phase at a near-stop, where the plant's response is dominated by backlash and
stiction. **The next thing to measure is whether the sharp square's residual is a modelling failure
at all, or a horizon one**, and the two are distinguishable: a modelling failure shows up as a bad
forecast R² near the corners, a horizon failure shows up as a good forecast the QP cannot act on
in time.

## THE SHARP SQUARE: FOUR HYPOTHESES KILLED, AND A 1.5x GAIN FOUND ON THE WAY

```
 program            cap 0.15   cap 0.3   cap 0.6      u peak at 0.15
 rounded @4e-3        6.18x     6.05x     5.84x         0.125
 circle  @4e-3        7.72x     7.25x     6.44x         0.039
 circle  @8e-3        4.86x     6.82x     7.27x         0.150  AT THE CAP
 sharp   @4e-3        1.69x     1.68x     1.69x         0.150  AT THE CAP
 sharp   @8e-3        2.27x     2.20x     2.01x         0.150  AT THE CAP
```

**THE REAL GAIN: THE FAST CIRCLE WAS AUTHORITY-LIMITED, 4.86x → 7.27x.** It sat exactly on the cap
and rose by half again when given room. And feedrate-agnosticism on the circle goes **1.59x →
1.06x**, from outside the 1.5x target to comfortably inside, because the fast lap was the one being
clipped. That is target 2 met on this plant, by a knob nobody had looked at.

**AND THE SHARP SQUARE DOES NOT CARE.** It touches the same cap and reads 1.69 / 1.68 / 1.69 while
its peak correction rises to 0.24 — well past the limit that was supposedly binding. **Hitting the
cap is necessary but not sufficient evidence of being limited by it**: the square's saturation is
momentary, at the corners, and lifting it changes nothing.

**SO FOUR ACCOUNTS OF THE SHARP SQUARE ARE NOW DEAD, EACH BY A DIRECT MEASUREMENT:**

| hypothesis | test | result |
|---|---|---|
| the model has not seen a stop-restart | append a diamond at two feeds | model destroyed by collinearity, gate refused |
| …try it without adding structure | dwelling excitation | deployed, every program WORSE, square 1.69 → 1.55 |
| the QP cannot re-solve fast enough | decision clock 30 → 60 | smooth +2-4%, square +0.6% |
| the correction is clipped | cap 0.15 → 0.3 → 0.6 | fast circle +50%, square unchanged |

**WHAT SURVIVES IS THE LAG COLUMN, WHICH HAS BEEN THE SIGNATURE THROUGHOUT.** On the sharp square
the correction removes 1.69x of contour and 1.20x of lag, and every intervention above leaves that
ratio where it was. Lag at a corner is the machine arriving late out of a near-stop, and none of
model coverage, decision rate or authority touches it. The remaining candidates are the ones that
change WHEN the correction acts rather than how much or how well: the lead the correction is
applied with, and whether a receding horizon can act on a discontinuity at all.

**AND THE COST OF THE CAP IS REAL AND MUST BE STATED.** Every program that was NOT saturating gets
slightly worse with more authority — the rounded rectangle 6.18x → 5.84x, the slow circle 7.72x →
6.44x. More authority is not free; it is a trade against the programs that did not need it, which
is exactly why `uMax` is described in this project as the engineer's cap rather than a tuning knob.

## THE SHARP SQUARE WAS NEVER A CORNER PROBLEM, AND SIX EXPERIMENTS WERE AIMED AT 2% OF THE PATH

```
 program        corner C   corner L   straight C   straight L      steps
 rounded @4e-3  0.000e+0   0.000e+0     2.173e-2     2.763e-2     0/7356
 circle  @4e-3  0.000e+0   0.000e+0     9.201e-3     1.420e-2     0/6283
 circle  @8e-3  0.000e+0   0.000e+0     7.151e-2     6.215e-2     0/3141
 sharp   @4e-3  6.467e-2   1.474e-1     1.205e-1     1.562e-1   174/8032
 sharp   @8e-3  6.968e-2   1.951e-1     1.713e-1     3.043e-1   574/4016
```

**THE CORNER ERROR IS SMALLER THAN THE STRAIGHT ERROR.** Contour at the corners is 6.5e-2 and
along the straights 1.2e-1, nearly double — and the corners are 174 of 8206 steps, about 2% of the
lap. Whatever costs the sharp square its performance is happening on the other 98%.

**SIX HYPOTHESES WERE TESTED AGAINST A PREMISE NOBODY MEASURED.** A model that never saw a stop, a
QP that cannot re-solve fast enough, a clipped correction, a spring-loaded arm, backlash, a
dwelling excitation — every one of them assumes the residual lives at the corner, and the check
that would have said otherwise is three lines of accumulation in a loop that was already running.
It cost six experiments and most of a session.

**AND BACKLASH DIED IN THE SAME BATCH, cleanly.** Sharp @4e-3 reads 1.69x with backlash at 1e-4
and 1.69x with backlash at ZERO — residual 1.196e-1 either way, identical to four figures. Even
had the corner been the problem, lost motion was not it.

**WHAT THE STRAIGHTS ACTUALLY ARE, AND WHY THIS IS NOT A CONTRADICTION.** A sharp square's straight
is not a constant-speed traverse. The corner rule decelerates into the vertex and accelerates out
of it, so most of each edge is an ACCELERATION RAMP — the classifier used here (speed below half
the programmed feed) catches only the 174 steps at the vertex itself and books every ramp as
"straight". The circle, by contrast, holds one speed for its whole lap and shows a contour of
9.2e-3 where the square's straights show 1.2e-1, thirteen times worse. **The distinguishing
feature is not the corner, it is that speed is CHANGING**, and that is spread across the whole
path rather than concentrated anywhere.

**WHICH IS A TESTABLE STATEMENT AND THE NEXT MEASUREMENT.** Split by |acceleration| instead of by
speed. If the residual concentrates in the ramps, the target is a controller that handles
commanded acceleration — and that reframes every knob tried so far, because none of them was about
acceleration either.

## RULE 42'S TIE-BREAK IS DEFEATING RULE 37, AND FIXING IT IS WORTH 23%

The tune picks the lag window by rule 42 — among candidates within 5% of the best held-out score,
take the cheapest — and on the arm that selects **12 lags**, the shortest of `[12, 24, 40]`:

```
 12 lags x stride 13 x sample 9 = 1404 steps   vs Tset 2743  →  2.0x SHORT
 24 lags                        = 2808 steps                 →  reaches
 40 lags                        = 4680 steps                 →  reaches
```

Rule 37 says a lag window must REACH the period of what it has to see, and it is recorded as
measured twice. Rule 42 says take the cheapest inside the band. **On this plant they disagree and
the cheaper one wins**, so the model spans half the arm's own settling time.

```
 program          W12      W24      W40
 rounded @4e-3   6.18x    6.59x    6.82x
 circle  @4e-3   7.72x    8.85x    9.47x
 circle  @8e-3   4.86x    4.81x    4.84x
 sharp   @4e-3   1.69x    1.68x    1.71x
 sharp   @8e-3   2.27x    2.36x    2.41x
```

**+23% ON THE CIRCLE AND +10% ON THE ROUNDED RECTANGLE**, for no new machinery — the fix is to let
rule 37 veto rule 42's band rather than lose to it. It is plant-agnostic by construction: "the
window must span the settling time" is a comparison between two numbers the pilot already measures.

**AND IT DOES NOTHING FOR THE SHARP SQUARE.** 1.69x → 1.71x. Its corner LAG does improve, 1.474e-1
→ 1.208e-1, about 18% — so the longer window is representing something real near the corner — and
the headline does not move.

## WHY THE ARM CANNOT SCHEDULE ITS FLEX, AND WHAT WOULD LET IT

The owner's account of what a corner requires: load the arm's flex before the vertex and release it
through, staying on the line — a scheduled manoeuvre, not a reaction. Measured, the pilot already
does the easy half of that:

```
 |u| along a side   1.4e-1  9.2e-2  7.2e-2  5.2e-2  3.3e-2  3.8e-2  5.2e-2  5.7e-2  1.4e-1  1.2e-1
                    corner                          mid-side                        approaching
 horizon reach 4176 steps vs a side of 2051  →  the next corner IS inside the preview
```

**IT ANTICIPATES AND IT STILL FAILS.** `|u|` bottoms out mid-side and climbs to 1.4e-1 before the
vertex, and the horizon covers two full sides. Preview length is not the constraint.

**THE STRUCTURAL BARRIER IS THAT `act()` APPLIES ONE MOVE.** It returns `_uNowOf(c)` — the first
element of a plan over N leads — and re-solves next tick. A manoeuvre that must go OFF target now
to be ON target later is optimal only when the future cost dominates, and a receding horizon
re-optimises from the current state every tick, so the immediate error dominates every decision it
actually executes. **The controller can plan the load-and-release and can never commit to it.**
CLAUDE.md recorded the symptom without the diagnosis: "a receding horizon only ever applies its
FIRST move and re-solves, so the far leads shape it far less than the argument assumed."

**THREE PLANT-AGNOSTIC ROUTES, none of which know anything about arms.**

1. **COMMIT m MOVES INSTEAD OF ONE.** Execute the first m elements of the plan before re-solving.
   `m` is a number chosen by measurement per plant, exactly like `sample` and `grid`. This is NOT
   the move-blocking that measured null here — that blocked the DECISION VARIABLES to make the
   solve cheaper and changed nothing about what was executed. Committing the executed moves is the
   opposite change and has never been tried.
2. **GIVE THE MODEL THE STATE.** A lag-window map can only carry what its window spans, which is
   why the rule-37 fix above helped at all. A plant whose stored energy decays over Tset needs a
   window that reaches Tset — now enforceable — and possibly a state-space form where deflection is
   a variable the optimiser can aim at rather than a pattern it must infer.
3. **A TERMINAL COST.** If the horizon ends mid-manoeuvre the optimiser has no reason to finish in a
   good state. Weighting the final lead is standard MPC, is one number, and composes with (1).

**AND THE HONEST CAVEAT ON ALL THREE:** every one of them makes the controller commit further ahead
on a model that is measured to be more error than signal in a single draw (error/signal 1.21 on the
tank). Committing to a plan is only safe in proportion to how much the plan can be trusted, so
(1) and (3) should be measured AFTER the ensemble work, not before it — a controller that commits
harder to a worse model is the failure mode this project already has on record from ILC tables
pumped to 5.25.

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

---

## THE SHARP SQUARE IS A FORECAST FAILURE, AND THE EXCITATION CANNOT REACH IT AT ANY SETTING OF ANY KNOB THAT EXISTS

Ten experiments end here, and the useful thing about them is that nine are nulls with the
SAME cause. What follows is measured on the 2R arm at the shipped stiff defaults (E 0.15,
K 16, backlash 1e-4), commissioned once on the excitation scribble, scored on programs it
has never run. `sharp` is the sharp-cornered square, `rounded` the same square with 1.5
corner radii, `circle` a plain circle, all at feed 0.004.

### 1. Every controller-side knob is null on the square

| knob | setting | sharp | rounded | circle |
|---|---|---|---|---|
| baseline | — | **1.69x** | 6.18x | 7.72x |
| commit m moves per solve | m = 2 | 1.71x | 6.20x | 7.72x |
| | m = 4 | 1.72x | 5.76x | 7.79x |
| | m = 8 | 1.70x | 4.59x | 8.00x |
| forced frequency sweep | band 512–2048 | 1.70x | 5.78x | 8.02x |
| | band 1371–5486 (what the gate would arm) | 1.70x | 6.19x | 8.42x |
| | band 256–4096 | 1.69x | 6.11x | 7.43x |
| correction cap | 0.30 (peak reached 0.2363) | 1.68x | 6.05x | 7.25x |
| | 0.60 (peak reached 0.2421) | 1.69x | 5.84x | 6.44x |
| forced sample period | 3 instead of 9 | 1.64x | 5.12x | 6.30x |

Add the ones already on record — a dwelling excitation, the decision clock, backlash,
compliance, the lag window — and the square has now been immovable under twelve knobs.

**The cap was never binding even though it read as binding.** Every baseline row prints
`u peak 0.1500 AT THE CAP`, which is what sent this at the cap in the first place; raising
it to 0.30 lets the peak rise to 0.2363 and the score does not move. A saturated actuator
that gains nothing from being unsaturated was never the constraint.

**COMMIT m MOVES IS IMPLEMENTED AND SHIPPED OFF.** `commitM` (default 1) executes the first
m elements of the QP's plan before re-solving, which is the direct test of "the arm can only
make the corner by loading and releasing its flex on a schedule, and it cannot do it
reactively". At m = 1 the code path is the single-step shift it replaced, term for term, and
`arm.test.mjs` comes back byte-identical. The account is right about the machine and wrong
about the remedy: committing harder does nothing on the square and costs the rounded
rectangle a quarter of its factor by m = 8, which is what committing to a stale plan looks
like.

### 2. Because the square is a FORECAST failure — measured, not inferred

`test/pilot/forecast.mjs` evaluates the commissioned readout bank on rows built from an
OPEN-LOOP run of each program. Open loop, so the fit's target `eFree` is the truth exactly
and no reconstruction of the correction's own effect can contaminate it (rule 16).

| program | ch | R² lead 0 | R² mid | R² far | truth rms | resid rms |
|---|---|---|---|---|---|---|
| rounded | 0 | 0.979 | 0.986 | 0.979 | 1.26e-2 | 1.83e-3 |
| rounded | 1 | 0.898 | 0.854 | 0.874 | 5.07e-3 | 1.62e-3 |
| circle | 0 | 0.966 | 0.987 | 0.955 | 6.31e-3 | 1.16e-3 |
| circle | 1 | 0.902 | 0.891 | 0.845 | 2.80e-3 | 8.76e-4 |
| **sharp** | **0** | **0.701** | 0.682 | 0.651 | 2.18e-2 | 1.19e-2 |
| **sharp** | **1** | **−0.105** | −0.192 | −0.076 | 1.47e-2 | **1.54e-2** |

The elbow's forecast on the square is WORSE THAN PREDICTING THE MEAN, and its residual rms
exceeds the truth's. The machine is scored exactly as well as it is predicted, so every
controller-side knob above was null by construction — this is brick 55's EMPS argument
arriving on a second plant from the failing side.

**`TRAIN=` cannot test this and it looked as if it could.** Commissioned with the sharp
square, the circle and the rounded rectangle as the representative program, the R² table
comes back identical to three decimals. That is correct rather than null: `TRAIN` sets the
program the GATE is handed and the pose the arm homes to, and the fit is always on the
excitation. Reading it as a null would have been a fabricated finding.

### 3. The DICTIONARY is not the limit

Refit the same features, the same ridge, the same window on the square itself; fit at feed
0.004 and score at 0.0055, so the model cannot pass by learning where in a repeating cycle
it is (rule 36).

| refit | ch | R² lead 0 | R² mid | R² far |
|---|---|---|---|---|
| sharp 0.004 → 0.0055 | 0 | **0.962** | 0.511 | 0.941 |
| sharp 0.004 → 0.0055 | 1 | **0.946** | 0.381 | 0.584 |
| rounded 0.004 → 0.0055 | 1 | 0.917 | 0.636 | **−1.589** |
| circle 0.004 → 0.0055 | 0 | 0.982 | 0.836 | **−1.535** |

**Lead 0 says the features CAN represent the square: 0.946 against −0.105.** So more state —
stored energy, power, a scheduled term — is not what is missing; the quadratic block carries
τ², τω and ω² and is offered on held-out data every time, and both arm channels decline it
inside a 5% band. And BOTH HALVES are here (rule 9): the far leads collapse to −1.5 on every
shape when the fit is given one program, which is the collinearity `excite.js` was built to
avoid and the reason "just train on the program" is not the fix.

### 4. So it is COVERAGE, and the rate mismatch behind it had never been measured

`peakDiffs` on the joint commands each program actually issues, against the limits the
excitation is built to respect (vMax 8e-4, aMax 4e-6, jMax 2e-7):

| program | ch | %vMax | %aMax | %jMax |
|---|---|---|---|---|
| circle | 0 | 63% | 16% | **1%** |
| circle | 1 | 54% | 16% | 0% |
| rounded | 0 | 63% | 34% | 289% |
| rounded | 1 | 57% | 32% | 364% |
| **sharp** | **0** | 63% | **3132%** | **61537%** |
| **sharp** | **1** | 62% | **3893%** | **75419%** |

The circle uses one percent of the declared jerk and scores 7.72x. The square uses six
hundred times it and scores 1.69x. **A pilot commissioned against declared limits that its
program violates by three orders of magnitude has been commissioned for a machine that does
not exist.** This is brick 53's EMPS reading — "78.5% of its velocity but 9.2% of
acceleration and 3.1% of jerk against the program's 99.7% / 100.9%" — with the consequence
followed through instead of noted.

### 5. And RAISING the declared limits changes nothing, because they are not what binds

Measured on `buildExcitation` directly, box ±0.55:

```
box .55 shipped      tc  662   v 73%  a 58%  j 55%   | abs a 2.32e-6  j 1.11e-7
box .55 loose a/j    tc  662   v 73%  a  1%  j  0%   | abs a 2.32e-6  j 1.11e-7
box .55 4x vMax      tc  148   v 80%  a 20%  j  3%   | abs a 3.92e-5  j 6.35e-6
box .15 loose a/j    tc  199   v 62%  a  3%  j  0%   | abs a 5.82e-6  j 8.51e-7
box .05 loose a/j    tc   60   v 68%  a 10%  j  2%   | abs a 1.92e-5  j 3.50e-6
```

**VELOCITY binds, through the box traverse.** The tune only ever RAISES the correlation time
from its floor of 60, and a shorter correlation time across a fixed span means steeper
slopes; so a and j are along for the ride. Loosening them by 50x and 1000x leaves tc at 662
and the built series byte-identical, and two full commissionings at those limits came back
byte-identical on the machine — the control that says the knob was inert rather than
unhelpful (rule 21).

### 6. Shrinking the box makes the excitation faster and the MODEL WORSE

| | commissioning R² ch1 | rounded ch1 | circle ch1 | sharp ch1 |
|---|---|---|---|---|
| box ±0.55 | 0.833 | 0.898 | 0.902 | −0.105 |
| box ±0.15 | **0.970** | 0.871 | 0.836 | **−0.169** |

The commissioning fit improves because the excitation got easier to predict; every held-out
program gets worse. The gate refused the narrow-box pilot at 1.04x on its representative
regime, and **the gate was right** — the first explanation offered here was that the box
clips the representative program and the refusal was an artefact, and the held-out table
refutes that. This is the third independent time this project has reached *a calibration
must span the range it will be used over*.

### 7. The corner is a 40-step event and the regressors are 117 steps apart

`cornerDt` is 40 solver steps. The window is 12 lags at stride 13 with sample 9, so
consecutive regressors are 117 steps apart — the whole corner falls inside a third of one
lag interval. **Forcing `sample` to 3 does not change it:** the tune raises stride to 39 and
holds the same 117, because the spacing is chosen from Ts, a settling-time number, and the
corner is a geometry number. The machine gets slightly worse for the trouble (1.64x), and
the elbow selects the quadratic block for the first time — a real change to the model that
buys nothing.

### 8. What the spectra show, on one axis of periods in solver steps

`test/pilot/spectrum.mjs`, as a fraction of each signal's own variance:

| period | MODE | SHARP | CIRCLE | EXCITE | RESPONSE |
|---|---|---|---|---|---|
| 512–1024 | 0.0% | **37.3%** | 0.4% | **0.1%** | 23.2% |
| 1024–2048 | 0.0% | **34.8%** | 8.5% | **0.6%** | 48.0% |
| 2048–4096 | 0.1% | 16.8% | 9.5% | 18.4% | 21.2% |
| 4096–8192 | 0.6% | 1.8% | 17.0% | 17.2% | 5.0% |
| 8192–16384 | 1.0% | 4.8% | **64.7%** | **31.5%** | 1.2% |
| 16384–32768 | 98.2% | 1.3% | 0.0% | 27.5% | 0.5% |

**EXCITE covers 25% of the sharp square's error energy and 91% of the circle's** — the same
ordering as 1.69x against 7.72x, in a completely different instrument. The MODE row is the
free response to a held step and it is 98% the step itself: this arm does not ring, the
probe's `rings [0,0]` is correct, and a resonance is not the mechanism. Note the trap in the
RESPONSE row: the machine's own error DOES have 71% of its energy in 512–2048 while the
command that produced it has 0.7% there, so the truth looks well-explained while the
transfer at those frequencies is not identified at all.

**Two instrument faults were found on the way to that table and both produced the same wrong
reading** — that the arm has no dynamics. `toolXY()` returns an ARRAY and was read as
`{x, y}`, giving NaN; and before that the recorded signal was the tool's distance from the
BASE, which a shoulder step leaves very nearly constant. `octaves()` now refuses a
non-finite or constant record instead of returning a row of zeros (rule 25), and rule 17 held
twice in a row.

**`sweep YES` HAS BEEN A FALSE READOUT IN EVERY LOG THIS PROJECT HAS PRODUCED.** `meta.chirp`
is an array of the sweep's share, pushed unconditionally, so it is `[0, 0]` when no sweep was
armed — and an array of zeros is truthy. Both harnesses now print the share.

### What is left standing, and it is the one thing nobody has built

An excitation that SPANS the program's box — so the fit stays valid, per §6 — while also
carrying the program's own ACCELERATION and JERK content — so the corner regime is in the
record, per §4. Those are not in conflict: a large-span slow scribble with a superimposed
small-amplitude high-jerk component is one sequence. The frequency sweep is that idea built
wrong: tonal (rank-deficient in any lag window, which is the whole reason `excite.js` uses
noise), capped at a quarter of the rate budget, and aimed at a band derived from Tset rather
than from the program.

**The number to design against is measured and plant-agnostic:** run `peakDiffs` on the
representative program's own command, compare against the declared limits, and size the fast
component from the PROGRAM rather than from the engineer's box. Every plant here can produce
that comparison from a `verifyRef` it already has.

**What would kill it:** if a fast small-amplitude component cannot be added without either
(a) breaking the 85% box-traverse acceptance, or (b) making the held-out R² fall the way §6
did. Both are one commissioning to check, with `forecast.mjs` as the meter.

---

## THE SQUARE'S REGIME IS LEARNABLE, TRANSFERS TO A GEOMETRY IT NEVER FITTED, AND ONE MAP CANNOT HOLD IT TOGETHER WITH THE SMOOTH REGIME

This continues the section above, same plant, same instruments, and it ends somewhere none of
the twelve nulls pointed: not more excitation, not more state, not more authority — TWO MAPS
AND A ROUTER THE COMMAND ITSELF DRIVES.

### 9. The machine is never saturated, so none of this is an authority wall

The servo's own counters, two laps of each program: rounded peaks at 26% of `tauMax` on the
shoulder, the circle at 29%, **the sharp square at 86% — and 0.00% of steps clipped on every
program.** The square is inside the drive's real envelope; its corners are just three times
deeper into it than anything the other programs do. The owner's constraint — that cranking
accel and jerk past what a motor and gearbox can do is brute force that does not exist in real
life — is therefore respected by everything below: the fast content injected or fitted is
sized to what the PROGRAM already does, and the program is measured to be within the machine.
(The first read of these counters printed `peak 0%` for every program: `peakDemand` is
absolute torque and the script divided by nothing. Rule 17, fourth time this arc.)

### 10. Corner EVENTS in the excitation: built, measured, and they make the model WORSE

`cornerEvents` in `excite.js` (option `events`, default off): sparse out-and-back velocity
trapezoids superimposed on the scribble — the only shape that can carry the program's a/j
inside the velocity limit, because stationary noise fast enough for the square's jerk runs at
~25x vMax continuously while rare brief reversals do it at ~1.1x. Sized at `vShare 0.4, ramp
2, width 16`, the composed record carries a 1.6e-4 and j 1.6e-4 — the square's own scale.

Commissioned with it, held-out forecast R² at lead 0:

| | rounded ch1 | circle ch1 | sharp ch1 |
|---|---|---|---|
| no events | 0.898 | 0.902 | −0.105 |
| events every 600 | **−0.853** | **−5.099** | −0.111 |
| events every 300 | −8.020 | −27.819 | −0.508 (gate refuses at 0.43x) |

The square gains nothing and the smooth programs collapse. Injecting the fast regime into ONE
shared linear fit does not add coverage, it adds a second regime fighting over the same
weights — see §12, which measures that interpretation directly.

### 11. The verify meter agrees with the machine and the gate caught both bad ideas

The narrow box (§6) and the dense event train were both refused by the deploy gate, and in
both cases the held-out forecast table independently confirms the refusal. The gate is now
2-for-2 on excitation pathologies it was never designed for.

### 12. One map cannot hold both regimes, and the richer dictionaries make it worse

Fit ONE linear map on the sharp square's and the circle's rows together (feed 0.004), score
each at 0.0055:

| joint fit, lead 0 | ch0 | ch1 |
|---|---|---|
| sharp | 0.940 | 0.916 |
| circle | 0.797 | 0.857 |

Both hold roughly — but the circle's ch0 residual variance is **11x its solo fit's** (1−R²
0.203 against 0.018), and the mid/far leads collapse outright (circle ch1 mid −4.2, far
−18.5). And the tune's own richer bases go the wrong way on the joint record: quadratic takes
the circle's elbow from 0.857 to **−1.665** at lead 0, scheduled to −1.427. More columns on a
two-regime record buy variance, not regime capacity — the direct, measured answer to "does it
need more state (velocity, energy)?": the state is already in the row (speeds and torques at
every lag; τ² IS the stored energy and the quadratic block offers it every commissioning),
and richer dictionaries lose. What is missing is not a column, it is the licence to use
DIFFERENT weights in different regimes.

### 13. TWO MAPS, ROUTED BY THE COMMAND'S OWN ACCELERATION — and the diamond proves it is a model

Split the joint record's rows by one bit: does the command carry an acceleration spike (>10x
the record's own median |Δ²cmd|, rule 32) within the model's window reach of the predicted
sample. Fit a map on each half. Route test rows by the same bit. No program identity, no lap
phase — the routing variable is the commanded acceleration, which the host already hands the
QP N steps ahead, on any plant.

| lead 0 | sharp | circle | **diamond (never fitted)** | rounded (never fitted) |
|---|---|---|---|---|
| ch0 | **0.973** | **0.971** | **0.941** | 0.698 |
| ch1 | **0.930** | 0.688 | **0.950** | −1.614 |
| corner rows | 98% | 0% | 100% | 98% |

Against the deployed scribble model's −0.105 on the square's elbow, the routed pair reads
**0.930 — and 0.950 on the DIAMOND, a geometry that was never in the fit**, sharing only the
square's corner profile. That is the owner's diamond experiment landing at the right layer:
the corner map is a model of the MOVE PROFILE addressed by command state, not a memory of the
square — the exact distinction the memory retirement is built on, measured.

**What is honestly wrong with it, stated before anyone builds on it:** the rounded rectangle
collapses (−1.614) because the binary router mis-files it — its mild corners (jerk at ~300%
of the declared limit against the square's 61,000%) trip the same tag and get answered by a
map fitted on a much harsher regime; and the circle's elbow pays 0.879 → 0.688 because the
smooth map inherits the square's 2% of untagged rows. The regime is a continuum and the
router is a step function. The mid leads are also still poor in the corner regime (0.2–0.65).
The next measurements, in order: a threshold that separates the rounded rectangle's corners
from the square's (there are two orders of magnitude of room); a graded router (the accel
magnitude as a scheduling variable rather than a gate); and only then the runtime half —
`act()` selecting per-lead weights from the look-ahead's own accel tags, which the QP
machinery already supports shape-wise (per-lead weight vectors exist; they would differ by
regime instead of by lead alone).

**Fit data for map B remains the open cost.** These maps were fitted on program rows, which a
plant-agnostic commissioning does not have — but the pilot already asks the engineer for a
representative program (`verifyRef`), the corner map transfers across geometry, and §10 says
the alternative (events in the scribble) poisons the shared fit precisely because there is
only one fit to poison. Two maps remove that objection: the events could feed map B without
touching map A. That composition — scribble → map A, corner events → map B, command-accel
router between them — is the first architecture in this arc that every measurement above is
consistent with, and none contradicts.

### 14. THE COMPOSITION, BUILT AND MEASURED ON THE MACHINE: 1.69x → 2.15x WITH NO PROGRAM SUPPLIED

The runtime half now exists in the pilot (`router` + `readouts[].wB` + `_routerLambdas`, all
null by default — every existing plant byte-identical by construction), and the machine-score
ladder on the sharp square, smooth programs untouched in every row that follows:

| corner bank fitted on | sharp | rounded | circle |
|---|---|---|---|
| — (baseline) | 1.69x | 6.18x | 7.72x |
| binary router, diamond | 1.84x | 6.18x | 7.72x |
| continuous unshaped, diamond | 2.11x | 5.76x | 6.56x |
| continuous SHAPED, diamond | 1.86x | **6.18x** | **7.72x** |
| continuous shaped, sharp itself (ceiling) | **3.27x** | 6.18x | 7.72x |
| **continuous shaped, DRIVE-SIZED PROBE — no program** | **2.15x** | 6.18x | 7.72x |

The blend needed a SHAPE (smoothstep 0.15–0.6 of the peak-hold level): unshaped, the circle
engaged the corner bank at λ 0.06–0.21 and paid 15–45% for a regime it is never in — a
corner is an EVENT in the command, and sustained curvature must map to zero. Shaped, the
smooth programs return byte-identical, which is the control that makes every sharp-square
number above readable (rule 21). The sharp square's LAG also halves (1.56e-1 → 1.11e-1), so
in the total-error metric the machine goes 1.40x → 2.0x.

**The probe is the owner's requirement built and measured**: corners are program-specific but
corner SHAPES are not. `recordCornerProbe` gathers a stop-and-go TOUR — decelerate to a
random pose inside the commissioning box, dwell, go; one to three legs chained through a
turn — with the severity read off the DRIVE: a calibration ladder walks the decel rate up
from the declared aMax, both joints together, and keeps the harshest rung the machine runs
with ≤2.5% of event steps clipped. Six findings from building it, each measured:

- **A flying reversal is not a corner.** Reversals at 0.25·vMax demand 118% of tauMax; the
  square's corners run at 86%, because a program corner decelerates to crawl speed before it
  turns. The probe's first shape was a regime no machine runs, and its bank measured 0.77x.
- **The feedforward convention is half the demand.** Programs hand the servo a BOUNDED alpha
  and let feedback chase the spike (that chase is the contour error); feeding the spike to
  the ff read 161% / 252 clipped steps at 2x aMax and gated the ladder at 1x for ever.
- **The clip fraction is non-monotone in severity** — harsher events are shorter — so a
  ladder that stops at the first red rung parks at 1x; every rung is measured and the
  harshest passing one wins (128x the declared aMax, clip 0.0%).
- **Events at one pose fit one pose's corners** (bank at 1.35x, worse than nothing);
  compliance is pose-dependent, which is why the probe tours.
- **Row count saturates**: 121 events score 2.11x against 55 events' 2.08x.
- **Turn-through legs beat rest-only** (2.15x against 2.11x) — but only visible after fixing
  a confound: through-zero turns spike at 2x the tour's peak, and a regime scale derived
  from the record's peak silently halved every program's engagement when the event shape
  changed (AFULLK exposes it; a per-event-median scale is the honest fix and is open).

**Open, in order of expected value:** the probe-to-ceiling gap (2.15x against 3.27x — the
self-fitted bank still knows something about the square's specific corner geometry the tour
does not teach); a robust aFull; corner-regime mid leads (0.2–0.65 everywhere); and the
six-plant question — the router is armed by injection on one plant, and making it a library
default is exactly what rule 31 and the sixplant pass exist to gate.

### 15. THREE LAYERS — SLOW, MEDIUM, FAST — AND THE AXIS THAT HAD TO STOP CLAMPING

The owner's design, built as stated: the scribble bank at λ = 0 and two corner banks at knots
0.5 and 1.0 on the blend axis, each fitted by weighted least squares under a hat function
peaked at its own knot, the runtime interpolating piecewise-linearly between whichever two
layers bracket the moment's severity (`readouts[].wBanks` in the pilot; `wB` remains the
two-map shorthand). Fit rule and blend rule stay one definition.

Two instrument repairs were forced on the way:

- **The regime scale is anchored to the DECLARED aMax (x6, per sample²), not to the fit
  record's peak.** Three comparisons in a row had been confounded by a peak-derived scale:
  every change to the probe's event shape moved the peak and silently rescaled every
  program's engagement (rule 24). The multiple is a constant to re-derive per plant (31).
- **The axis had to stop saturating.** The smoothstep clamped at m = 0.6 — right for two
  banks, wrong for a ladder: the slow square (m 0.93) and fast square (m 1.85) both read
  λ = 1 and the knots could not tell them apart. Now: dead zone below 0.15 (the circle's
  steady curvature is not a corner — the property that keeps every smooth program
  byte-identical), then linear in severity to 2x the anchor.

Machine scores, sharp square at both feeds, probe-fitted (no program supplied anywhere):

| program | baseline | two banks | **three layers** |
|---|---|---|---|
| sharp @0.004 | 1.69x | 2.15x | **2.28x** |
| sharp @0.008 | 2.27x | **0.86x** | **1.84x** |
| rounded @0.004 / circle both | 6.18x / 7.72x / 4.86x | identical | identical |
| rounded @0.008 | 2.60x | 2.59x | 2.54x |

The two-bank 0.86x is the row that demanded the ladder: one bank fitted at full severity
served the slow square and betrayed the fast one, because the corner regime is itself a
spectrum and the probe's vTop had been read off one program's speeds (0.63x vMax — now full
vMax, sized by the drive ladder like everything else). Three layers recover the fast square
to 1.84x — still under its baseline, which is stated rather than absorbed: its severity sits
at axis 0.92 where the fast knot's fit rows are dominated by probe events far harsher still
(the probe reaches m ~ 5.5). Knot placement from the probe's own severity distribution, or
the LPV form (weights affine in the axis, one solve, no knots — with the measured caution
that extra columns on multi-regime records have lost every time here), are the two candidate
next steps; the self-fitted ceiling remains 3.27x on the slow square.

### 16. THE COVERAGE GUARD: A BANK MAY NOT ANSWER AT SPEEDS NO RECORD CONTAINS

Three nulls closed the fast square's remaining gap the honest way:

- **Hats on the unclamped severity axis** (so the top knot is not drowned by the probe's
  harshest events): byte-identical, hypothesis dead.
- **Row count**: saturated at §14.
- **Laddering the probe's speed past the declared vMax**: the DRIVE refuses — no (v, α) at
  1.5x vMax runs under the clip bar — so the regime the fast square cruises in (~126% of the
  declared vMax, the declared velocity being the same fiction the declared acceleration was)
  cannot be put into any bank. The machine can be commanded there; it cannot be PROBED there
  cleanly.

Which leaves exactly one right move, and it is the deploy gate's philosophy applied per lead:
**λ fades to zero where the commanded speed exceeds the probe's own ceiling** (`router.vTop`;
fade 1.0–1.15x, tightened from 1.3x after the residual 13% engagement measured a 10% cost).
The scheduling stays entirely on the COMMAND — known N steps ahead, feedback-free (routing on
actuals would put the blend inside the loop, rule 35), sharp-edged where the response smears —
while the ROW keeps the actuals, which is the split the composite already measured (pose-
scheduling pays on actual torque, 0.84 against 0.66 commanded).

| sharp square | baseline | two banks | three layers | + coverage guard |
|---|---|---|---|---|
| @0.004 | 1.69x | 2.15x | 2.28x | **2.28x** |
| @0.008 | 2.27x | 0.86x | 1.84x | **2.16x** |

No program supplied anywhere; rounded and circle byte-identical at 0.004, within 2% at 0.008.
The 0.008 row sits 5% under its baseline — the corner-engaged bank slightly misses at a feed
whose corners it only saw scaled — and the slow square holds its best number. Open: per-bank
TRUST from measured residuals (the actuals' honest way into the routing — a slow gate, not a
schedule), and the six-plant pass before any of this becomes a default (rule 31).

### 17. RANDOM POLYGONS BEAT THE BASELINE IN EVERY CELL — AND GEOMETRY DIVERSITY IS THE NEW WALL

The owner's licence — corner SHAPES can be designed with no part knowledge — built literally:
`randomPolygon` draws vertices around the workspace centre and traces them with the same
corner rule every real program uses (`ROUTER=poly`: three convex polygons at three feeds).
And a control that sharpens the question: star polygons (alternating radii, 40–80° vertices
against the convex ones' 100–130°), plus the pooled tour+polygon source.

| sharp square | baseline | tour (§16) | **polygons** | +stars | pooled tour+poly | self ceiling |
|---|---|---|---|---|---|---|
| @0.004 | 1.69x | **2.28x** | 2.02x | 1.97x | 1.86x | 3.27x |
| @0.008 | 2.27x | 2.16x | **2.63x** | 2.49x | 2.45x | — |

**The polygons are the first agnostic bank above baseline in BOTH cells** (+19% and +16%),
and the fast square's 2.63x beats its baseline for the first time by any route — Cartesian
coordination at the right feeds is what the joint-space tour could not teach. But the trend
across five fit-source configurations is monotone and it is the real finding: **every
increase in corner-geometry diversity makes the square worse** (tour alone 2.28 at its home
feed; add geometries and it falls 2.02 → 1.97 → 1.86). One linear bank per severity knot
AVERAGES over corner geometries, and the self bank's 3.27x is the measured value of knowing
this corner's geometry rather than corners in general.

So the wall has moved twice: coverage (§§4–8) → severity spectrum (§§14–15) → **geometry**.
The same shape of answer suggests itself and is NOT yet built: the turn's geometry is
command-derivable ahead of time exactly like its severity (the look-ahead contains the turn
angle and direction), so geometry could be a second scheduling variable rather than a thing
averaged over. The measured caution stands — every capacity increase on a mixed record has
lost here — so that experiment must hold the per-bank row count while splitting, not just
add banks.

### 18. THE ROUTER ON A PLC SCAN: COUNTED, SPARSE, AND ONE REAL BUG FOUND BY THE CONTROL

Target 6's frame: the pilot's deployed tick is 42,914 MAC/cycle at defaults, with a measured
cheap corner at 9,517 against a 10,000 budget (not default — fails the arm contract). The
question was whether the two-regime machinery fits that discipline. The answer, counted:

**What never touches the cyclic task:** every fit. The knot banks, the probe, the calibration
ladder, the polygons — all commissioning-time, like the existing tune. Deployed, the banks
are K × N × nw frozen doubles (~50 KB/channel) and the λ math is clamps, multiplies and
compares — no transcendentals, fixed-point friendly.

**What does, and how it got PLC-shaped:** the λ scan re-read ~700 look-ahead offsets per
decision (~17,000 MAC-equivalents — it would have blown the budget alone). But a peak-hold
with LINEAR decay is exactly max over past spikes of (mag − Δt/reach), a spike at or under
the dead zone can never surface, and corners are sparse by definition — so the profile is
carried exactly by a bounded list of corner events, ingesting only the `grid` offsets that
newly enter the horizon each decision. `routerCost()` counts it the way `PreviewMPC.cost()`
counts the QP: **worst case 20,852 MAC/decision both channels (every lead in corner regime,
event list at its cap), smooth-program case 320** — the dead zone is not only correctness
(byte-identical circles), it is the scan budget's friend: a machine cutting smooth geometry
pays ~0.7% of the default tick. The honest shaves if worst case must fit a tighter cycle,
in order: the event cap (24 is generous; 4 live events is typical), blending only engaged
leads, and the delta-bank form of the blend.

**And the sparse rewrite's first version had a real bug the side-by-side control caught:**
monotone-deque eviction (pop older events when a stronger one arrives) is only sound for
query times AFTER the new event — and the horizon queries times BETWEEN events, where the
popped event was still the maximum. Symptom, measured: identical peak λ to the full rescan
(0.289 = 0.289) with 6 engaged leads against its 33 — the corner fired and the approach to
it went dark, and the machine quietly returned to its baseline score. The sound pruning is
the reverse comparison: drop a NEW event the tail already dominates. After the fix the
machine scores are byte-identical to the full rescan (1.97x / 2.49x / 6.18x — rule 21).

### 19. AXIS TRIAGE, THE N-SITE GRID, AND A NULL WORTH MORE THAN THE FEATURE

**The triage** (`test/pilot/triage.mjs`): split the SELF-fitted corner bank — the 3.27x
ceiling — by each candidate lookup variable on the square's own record, held out across
feedrates, judged against an unsplit control AND a random split of the same rows into the
same bank count (the capacity control, rule 20). Verdict:

| axis (ch1 elbow) | lead 0 | mid |
|---|---|---|
| none (control) | 0.910 | −0.246 |
| random (capacity control) | 0.903 | −0.251 |
| speed | 0.530 | +0.122 |
| turn direction sign | 0.430 | +0.016 |
| **turn share (which joint the corner bends)** | 0.718 | **+0.552** |

**At lead 0 no axis carries information** — every informative split hurts while random
matches the control, so the lagged actuals already tell lead 0 everything. At MID leads the
geometry axis is decisive. Commanded torque is unavailable by contract (nobody commands
torque and the pilot has no model to derive it); actuals stay in the row (measured: 0.84 vs
0.66) and cannot schedule leads that have not happened.

**The N-fit-site architecture, built and PLC-shaped** (`wGrid` in the pilot): a knot grid
over (severity x turn angle θ = atan2(Δ²ch1, Δ²ch0) at the governing event), θ FOLDED to
period π (a turn at θ and θ+π bends the same joints; the sign axis measured +0.016) with
knots at 0 and π/2 — which IS the share split, continuously. Multilinear interpolation, at
most 2^d banks touched per lead whatever the grid holds: per-scan cost scales with the
DIMENSION count, memory alone with the bank count, every fit commissioning-time. The angle
rides on the same sparse event list at two extra numbers per event.

**And the machine said no, on a chain of evidence that closes the question rather than the
experiment.** First grid: knots at ±π/4, ±3π/4 — the exact boundaries of the informative
partition — and unfolded: null (1.98x/2.48x vs 1D's 1.97x/2.49x). Folded and aligned: still
null (1.96x/2.50x), and the cell diagnostic rules out starvation — the sev-1.0 row has zero
rows (polygon corners top out at axis ~0.5, dead weight), but the square deploys at axis
0.42 and the cells it consults fitted on 4,200+ rows each. The grid is live where the square
reads it and the machine does not move. The reconciliation: **the geometry axis's only
information is at mid leads, and this project has now measured three independent times that
mid-lead forecast quality does not move this machine** — leadTrust (weights moved, machine
identical to four significant figures), the forecast-gate arming, and now the θ-grid. A
receding horizon applies its first move and re-solves; lead 0 binds; no axis lifts lead 0
above the unsplit ceiling; so the self bank's remaining edge over the agnostic 2.28x is
DISTRIBUTION MATCH at lead 0, not any schedulable variable — the same lesson as rule 34,
arriving from the scheduling side.

**What this buys:** the grid machinery stays (it is the right shape for a plant whose
regime IS multi-dimensional — the six-plant pass will say), the geometry probe programme
stops before it spends weeks, and the honest statement of the agnostic ceiling on this
plant is ~2.3–2.6x against a self-fit 3.27x, with the residual being lead-0 distribution
match that no lookup variable reaches.

### 20. ONLINE ADAPTATION AT DEPLOY: THE DISTRIBUTION-MATCH ROUTE, FIRST MEASUREMENT

§19 said the self bank's remaining edge is lead-0 distribution match, which no lookup
variable reaches. The pilot has owned the mechanism for buying distribution match honestly
since the online work: `_onlineStep` — SharedRLS seeded from the commissioning posterior,
the correction's own response subtracted, an innovation gate against collinear repeats. It
had simply never been fed at deploy: the rig passed `truth = null`. It now routes the truth
through the same `routeSignals` as commissioning (one definition), with the honesty label
attached: on THIS plant a truth at deploy means a permanent tool tracker, an instrument
production may not have — EMPS and the tank read their truth off ordinary sensors, the arm
does not. `ONLINE=1` arms it per row with snapshot/restore, because the RLS updates the
commissioned bank in place and adaptation must not leak between the matrix's programs.

| ONLINE alone | @0.004 | @0.008 |
|---|---|---|
| sharp | 1.69 → **1.87** | 2.27 → **2.30** |
| rounded | 6.18 → **6.32** | 2.60 → **2.66** |
| circle | 7.72 → **8.66** | 4.86 → **5.01** |

**Every cell improves**, and stacked with the polygon router the square reads 2.16x / 2.49x.
This is the first mechanism in the whole arc that helps the smooth programs too — consistent
with what it is: distribution match, not regime coverage.

**AND THE INNOVATION GATE NEVER FIRED — 0 of 2,583 rows gated on a repeating program.** The
reference is the FIRST row's innovation (rule 38's exact shape: a guard calibrated on an
unrepresentative startup); a familiar first row makes the threshold microscopic and
everything after passes. So these gains were measured with an effectively ungated recursion
at λ = 0.9995 — the configuration the EMPS record warns about — and they still came out
positive. The gate reference needs to be a running property of the stream (next), and the
open questions behind it: more laps (does adaptation converge toward the 3.27x self-fit or
drift the way ungated EMPS did at 14.68 → 9.96), and shape-change transfer after adaptation
(the memory test).

**§20 addendum — the gate reference fixed and its next layer exposed.** With the reference a
running maximum (rule 38's fix), the gate fires exactly where repeats coexist with novelty:
864 of 2,583 rows gated on the sharp square (1.87 → 1.92x) — and zero on the smooth
programs, whose rows never set a high-water mark to be measured against. The next layer,
stated rather than absorbed: λ-forgetting at 0.9995 RE-INFLATES the covariance every update,
so a lap-two repeat never looks fully familiar to the innovation — THE FORGETTING FIGHTS THE
GATE, and the two knobs cannot be tuned independently. Directional forgetting (rule 41,
measured neutral five times as a FIT choice) may earn its keep here as a GATE enabler —
inflate only directions being excited — which would be the sixth measurement of that knob
and the first with a mechanism that wants it.


### 21. GUIDED COMMISSIONING: ADAPT WHILE THE TRUTH SOURCE IS PRESENT, FREEZE, TAKE IT AWAY

The owner's installation model, stated back and then measured: the truth source is a
PROPERTY OF THE INSTALLATION, not of the controller — present for ever (a permanent
tracker, or a plant whose truth is an ordinary sensor), present only for a GUIDED
COMMISSIONING phase (a tracker mounted for install, run through real movements or the
representative program, then removed), or never present. It is a setup switch and can never
be assumed fixed. The pilot now runs all three: `online` unarmed is the static machine;
armed with truth arriving it adapts; armed with truth gone it degrades to the frozen bank,
silently and safely, and `status().onlineAtDeploy` says which machine it actually was.

`test/pilot/trackaway.mjs`, sharp square @0.004, one commissioning, scored on laps 6–8 in
every protocol so the windows match (rule 20):

| installation | contour | vs open loop | lag |
|---|---|---|---|
| static (no truth ever) | 1.182e-1 | 1.71x | 1.56e-1 |
| permanent truth (adapts throughout) | 9.173e-2 | **2.20x** | **7.60e-2** |
| **take-away (truth laps 1–4, frozen after)** | 9.575e-2 | **2.11x** | 9.29e-2 |

**The adapted bank HOLDS once the truth source leaves — 96% of the permanent-instrument
gain at zero permanent instrumentation.** The gated recursion admitted 2,324 rows during
the guided laps and the frozen weights carried laps 6–8 within 4% of the always-adapting
machine. This composes with everything upstream: the corner banks were always fitted from
truth-bearing records, so the guided phase is where bank population naturally lives — run
the movements the machine will see, populate the grid, adapt the base, freeze, unbolt the
tracker. What remains to measure: the full composition (router banks + guided adaptation,
frozen together) and the transfer question — a bank adapted on the guided program, scored
on a program the guide never ran, which is the memory test applied to adaptation.

**§21 addendum — the transfer verdict.** Guide on one program, freeze, score on another:
`guide=diamond → sharp` reads **1.93x against the static 1.71x** — the adaptation TRANSFERS
across geometry when the guide shares the move profile, so it is a model by the
retirement's own test, not a lap memory. And `guide=rounded → sharp` reads 1.66x, slightly
BELOW static: a guide without the regime tilts the bank away from it (rule 9's other half,
and the same law as every fit source in this arc). The installation ladder on the square:
static 1.71 → diamond-guided frozen 1.93 → self-guided frozen 2.11 → permanent truth 2.20;
self-fitted bank ceiling 3.27. The guided-commissioning instruction follows measured:
guide with movements that SPAN the regimes production will run — the third arrival of
"a calibration must span the range it is used over", this time from the adaptation side.

### 22. THE FULL COMPOSITION, FROZEN: 2.39x WITH NOTHING PERMANENT AND NO PRODUCTION PROGRAM

`fitCornerBanks` moved into the rig (third harness, one definition — the founding rule), and
`trackaway.mjs` now runs the whole installation ladder on one commissioning, sharp square
@0.004, every protocol scored on laps 6–8:

| installation | score | lag |
|---|---|---|
| static | 1.71x | 1.56e-1 |
| guide=rounded, frozen | 1.66x | — |
| guide=diamond, frozen | 1.93x | — |
| self-guided, frozen | 2.11x | — |
| adapted, permanent truth | 2.20x | 7.60e-2 |
| polygon router, frozen | 2.19x | 1.07e-1 |
| **router + guide=diamond, ALL FROZEN** | **2.39x** | **7.71e-2** |
| router + adapted, permanent truth | 2.47x | 6.91e-2 |

**The mechanisms stack because they are different things**: the corner banks buy REGIME
COVERAGE (fitted from truth-bearing polygon records — which the guided phase provides
naturally) and the gated adaptation buys DISTRIBUTION MATCH; 2.19 + the diamond guide's
increment lands at 2.39 frozen, within 3% of the permanent-truth 2.47. The deployable
statement: polygon banks needing no program, one guided phase on a representative-profile
part with a temporary truth source, freeze, unbolt — **1.71 → 2.39x on the production
geometry the machine never saw during any of it**, against a 3.27x everything-on-the-square
ceiling. (Suite note for the record: `--only=pilot` is not an area — the pilot tests live
inside `flexisim`, and two suite launches ran only the parse checks before this was noticed;
the honest tally from them is "nothing was verified", not "nothing failed".)

### 23. TRANSFER TO EMPS: THE GATED ADAPTATION IS A MODEL BY THE TEST THAT CONVICTED THE ILC

The composition's most portable half — gated online adaptation — measured on the plant least
like the arm: real machine, real data, truth an ordinary sensor (the installation where the
switch is simply ON). The record said ungated online HURT this axis (14.68 → 9.96); with the
running-max gate (`test/pilot/empsonline.mjs`, same commissioning as `emps.test.mjs`):

| protocol | program, mm rms | vs shipped | two-tone sine (NEVER run) |
|---|---|---|---|
| static | 0.0393 | 14.8x | 0.0415 mm |
| online, gated, truth throughout | 0.0121 | **48.2x** | **0.0070 mm** |
| take-away (truth laps 1–4, frozen) | 0.0105 | **55.5x** | **0.0067 mm** |

Three findings, each carrying:

- **The repaired gate turns online from harm into a 3.7x multiplier** — 44,434 of 62,375
  rows gated in permanent mode. The pilot with no plant knowledge now sits ABOVE velocity
  feedforward (15.2x) on that page's controller ladder.
- **Frozen-after-guided BEATS always-adapting** (55.5x against 48.2x) — the second plant to
  show it: freezing locks the state before λ-forgetting drifts it on the collinear laps.
  The guided-commissioning protocol is not a workaround for a missing tracker; it is the
  better configuration even when the truth never leaves.
- **THE MEMORY TEST, PASSED WHERE THE ILC FAILED IT**: the adapted-frozen bank scores the
  two-tone sine — a program it never ran — at 0.0067 mm against the static bank's 0.0415,
  six times BETTER, on the same axis where the phase-indexed ILC's 125x collapses to 0.55x
  on this exact sine. State-addressed adaptation learned the machine; the lap-indexed table
  learned the lap. That is the retirement's distinction, measured on the second plant, and
  it is the north star's program-agnostic claim holding through adaptation.

### 24. ADAPTATION DOES NOT OVERTURN A REFUSAL — THE MILL'S NULL, AND WHAT THE MECHANISM IS

The transfer question aimed at the refusals: force-deploy the mill (the refusal stays on the
record; the gate is measured, not enforced — the page's own convention) and arm gated
adaptation on the gauge, with the same delayed-reference routing commissioning uses
(`test/pilot/millonline.mjs`):

| | µm rms |
|---|---|
| no AGC | 15.15 |
| BISRA gaugemeter | 18.08 (the famous amplification) |
| monitor AGC | 14.00 |
| forced static | 14.92 |
| forced + gated online | 15.25 |
| forced + take-away | 15.25 |

**Adaptation makes the mill slightly WORSE, with the gate working exactly as designed**
(1,004 of 19,333 rows admitted). The refusal stands. Placed beside the arm (+29% from
adaptation) and EMPS (3.7x), the mechanism's shape is now measured from both sides: gated
online MULTIPLIES a working model and does nothing for a broken one — rule 43 from the
adaptation side. The mill's problem was never distribution match; its truth through a 200 ms
gauge delay is barely predictable at all (the recorded eFree inflation), and no recursion on
an unpredictable target buys anything. The pilot's refusal was a verdict about the plant's
observability, and adaptation confirms it rather than overturning it. This also sharpens
when to reach for the guided-commissioning protocol: it pays where the STATIC verify already
vouches and the residual is distribution mismatch — the deploy gate's own ratio is the
selector, at zero extra cost.

### 25. THE FORGETTING IS THE MECHANISM, THE GATE IS ITS SAFETY — AND DIRECTIONAL FORGETTING FAILS ITS SIXTH AUDITION

§20 worried the λ-forgetting fights the innovation gate. Measured on EMPS (take-away
protocol, everything else identical), the roles are the opposite of the worry:

| recursion | program | sine (never run) |
|---|---|---|
| λ = 0.9995 (default) | **55.5x** | 0.0067 mm |
| λ = 1 (no forgetting) | 15.1x | 0.0403 mm |
| directional forgetting | 15.3x | 0.0395 mm |

**No forgetting kills the gain almost entirely, gate or no gate**: at λ = 1 the commissioning
posterior (40k rows) anchors the recursion and the 9k admitted deployment rows cannot move
it — no distribution match happens. The 0.9995 discount (~2,000-row memory) is what lets the
program's own rows take the model over; THAT is the distribution-match mechanism, and the
innovation gate is its safety — filtering collinear repeats so the takeover cannot collapse
onto one direction (which is exactly what the recorded ungated λ=1 harm was). The historical
reading flips: 14.68 → 9.96 was never "adaptation is dangerous", it was "takeover without a
working gate".

And **directional forgetting fails its sixth audition, its first non-neutral result**: it
matches λ = 1 almost exactly, because inflating only the excited directions keeps the
unexcited ones anchored — and on a low-dimensional deployment stream that is nearly the whole
posterior. Five neutrals said "default off"; this says it is the wrong tool for the one
mechanism that finally had a story for it. Default off, now with a reason instead of a shrug.

### 26. FOUR PLANTS, ONE LAW — AND THE TAKE-AWAY CHOICE HAS ITS OWN SELECTOR

The tank (`test/pilot/tankonline.mjs`, seed-walked to a deploying draw — seed 2 at verify
1.22x, seed 1 refusing at 1.08x, exactly the 3-of-8 record): static 1.47x, **online 1.73x
(+18%)**, take-away 1.57x. The cross-plant picture of gated adaptation is now complete
enough to state as law:

| plant | static verdict | adaptation | note |
|---|---|---|---|
| arm | deploys | +29%, take-away holds | tracker = temporary instrument |
| EMPS | deploys | **3.7x, take-away BEST** | repeating program → freeze wins |
| tank | deploys (seed-dependent) | +18%, always-on best | novel recipe → keep adapting |
| mill | refuses | null (slightly negative) | unpredictable truth; refusal correct |

**The law: gated adaptation multiplies a model the static verify already vouched for, in
proportion to the distribution mismatch, and does nothing for a broken one.** The deploy
gate's ratio is the free selector for whether to bother. And the take-away-vs-always-on
choice has its own selector, measured on two plants pointing opposite ways: a REPEATING
production stream (EMPS) wants freezing — adaptation done, drift the only remaining motion —
while an EVOLVING one (the tank's recipe) wants the truth kept if the installation has it,
because each segment presents novelty the gate correctly admits. One number the machine
already computes distinguishes them: the gate's admit rate late in the run (EMPS take-away
gated 8,603 of 24,935 and falling; the tank's first 40% gated 0 of 559 — everything still
novel).

**§26 addendum — the contract.** The gated-adaptation findings are now pinned as
`test/pilot/onlinegate.test.mjs` in the full tier (after `emps.test.mjs` in the suite): the
gate fires on repeats (its frozen-reference bug stays dead), adaptation multiplies the
static machine ≥2x, the take-away installation holds, the adapted-frozen bank passes the
memory test on the never-run sine, and λ=1 losing the gain pins the forgetting as the
mechanism. Properties with margins, not frozen numbers (rule 4). The exploratory
`empsonline.mjs` harness is retired into it — two near-copies of one protocol is how this
project's defects get made (rule 61).

### 27. THE SCOREBOARD UNDER THE COMPOSITION — one target met, every cell up, the safety clause intact

The full matrix with the composition armed (polygon banks + gated adaptation, permanent-truth
installation), against the plain pilot this arc started from:

| program | arc start | composition |
|---|---|---|
| rounded @0.004 (seen) | 6.18x | 6.32x |
| sharp @0.004 | 1.69x | **2.20x** |
| sharp @0.008 | 2.27x | **2.49x** |
| rounded @0.008 | 2.60x | 2.66x |
| circle @0.004 | 7.72x | **8.66x** |
| circle @0.008 | 4.86x | **5.01x** |

The matrix's own north-star readings:

- **PROGRAM-AGNOSTIC: worst held-out degradation 3.65x → 2.87x** (target 1.3x — the arc
  closed 40% of the gap on the metric the owner ranked first).
- **FEEDRATE-AGNOSTIC on the sharp square: 1.13x across a 2x feed change — INSIDE the 1.5x
  target.** The first north-star target formally met, and on the hardest program: the
  composition made the square's transfer across FEED nearly free (severity layers + coverage
  guard + adaptation each carried part of it). Rounded (2.37x) and circle (1.73x) remain
  outside — their @0.008 rows are capped-authority territory for every mechanism.
- **The safety clause holds under everything armed**: no held-out program made worse than
  leaving the machine alone, all six cells, u never past the engineer's cap.

### 28. THE CASCADE IS DOMINATED WHERE A TRUTH SOURCE EXISTS — the standing red reframed by rule 4

`stack.test.mjs`'s three standing reds pin a cascade whose layer 2 refuses (verify 0.95x) and
whose layer 3 collapses on the shared fit (held-out R² 0.0248). Diagnosed before this arc;
untouched by it. But this arc changed what the red MEANS, and rule 4 says a failing check can
be stale in either direction — the code got better around it:

| EMPS, mm rms | trapezoid program | two-tone sine (never run) | commissioning |
|---|---|---|---|
| stack, depth 3 (recorded best) | 0.0194 (29.8x) | 0.0140 (26.0x) | 3 layers, ~3x time |
| **one pilot + gated take-away** | **0.0105 (55.5x)** | **0.0067** | 1 layer + 4 guided laps |

**One gated layer beats the three-layer cascade on both of its headline rows at a third of
the commissioning.** The cascade was the route past the forecast bound when the record was
frozen; gated adaptation goes further for less — WHERE THE INSTALLATION HAS A TRUTH SOURCE,
permanent or guided. The cascade remains the best truth-free route (its layers need no
deploy truth at all), which is exactly the installation switch of §21: the two mechanisms
serve the two installations, and neither obsoletes the other outright.

**Recommendation, flagged for the owner rather than done unilaterally** (a contract's meaning
is not mine to rewrite): the stack's "depth buys accuracy" contract should either be
re-grounded on the truth-free installation it actually owns, or the Stack should learn to
carry the online option per layer — and the layer-3 shared-fit collapse, still real, drops
from "standing red on the flagship route" to "limitation of the fallback route", which is a
different urgency.

### 29. THE KINEMATICS-FREE CHAIN UNDER THE FULL COMPOSITION — 2.46x FROZEN, NOTHING KNOWS THE ARM

The owner's ask, built and measured (`test/pilot/ikfreecomp.mjs`, on the new `ikfree-rig`):
mode ⑥ — inverse learned from 90 tracker-held points (holdout 3.25e-4 rad), affine-observer
truth, verify 3.03x — with the corner banks, the command-routed blend, and gated adaptation
on top. The banks are fitted from polygon records whose COMMANDS came out of the learned
inverse itself: no geometry, no production program, anywhere in any fit.

| through the LEARNED inverse | circle | sharp square (first measurement ever) |
|---|---|---|
| open loop | 6.50e-2 | 1.91e-1 |
| static ⑥ | 6.87x | **1.89x** |
| + corner banks | 6.82x | 2.22x |
| + gated online | 6.54x | **2.53x** |
| + take-away (tracker unbolted) | 6.55x | **2.46x** |

Three findings:

- **The learned chain's STATIC square beats the analytic chain's** (1.89x against 1.69x) —
  brick 44's droop-carried-by-the-reference advantage, now measured on the corner program
  where it was never checked.
- **The composition stacks on a chain that has never seen ik()** exactly as on the analytic
  one — banks +17%, adaptation +14% on top — and holds frozen after the tracker leaves.
  2.46x with zero geometric knowledge and a temporary instrument is the arc's strongest
  full-agnosticism statement.
- **The circle is saturated** (6.87x static; nothing helps, adaptation trades ~4% — its
  residual is not distribution mismatch), and the blend's dead zone keeps the router
  byte-close there, the control that makes the square's column readable.

The `ikfree-rig` carries the gather/maps extracted verbatim; `ikfree.test.mjs` still holds
its own copies (a frozen contract — refactoring it mid-arc was judged riskier than the
duplication, which is FLAGGED: a change to either must be mirrored or not made, and folding
the test onto the rig is queued).

### 30. THE SOFT CORNER OF THE KINEMATICS-FREE CHAIN: AUTHORITY BINDS, AND ADAPTATION IS THE SAFE CONSUMER OF MORE

`ikfreecomp.mjs` at brick 44's configuration (K 0.25 / E 0.03; 45 points, degree 5, holdout
2.98e-3 rad), gate off per the contract's own precedent at this corner — the one place the
gate's verdict was disputed across three rebuilt verifies and only DELIVERED numbers count
(brick 58). The scribble vetoes at 0.40x; delivered:

| through the learned inverse, soft | cap 0.15 | cap 0.5 |
|---|---|---|
| circle: static | **5.91x** | 4.57x |
| circle: full composition | 5.94x (null) | **6.32x** |
| sharp: static | 2.99x | 4.37x |
| sharp: full composition | 2.96x (null) | **4.75x** |

Three findings:

- **The disputed gate verdict settles the same way again**: the scribble's 0.40x is
  narrowness under a stress regime, and the delivered programs read 5.91x / 2.99x. (The
  refusal stays printed; nothing here changes the gate's defaults.)
- **At the soft corner AUTHORITY binds, not the model**: every armed row at cap 0.15 pins u
  at 0.150 and the composition is NULL on contour (it still buys 17% of lag). The mechanism
  map across the arc is now complete: the STIFF arm was model-bound (cap raises measured
  null, composition paid), the SOFT arm is authority-bound (composition null, cap pays) —
  one diagnosis per machine, readable off u-at-cap plus a cap probe.
- **Static control MISUSES extra authority on the smooth program** (circle 5.91x → 4.57x at
  the bigger cap) **and gated adaptation reclaims it** (6.32x, the best soft-circle number).
  More authority on a frozen model overdrives; adaptation spends it against the measured
  truth. That pairing — raise the cap only with the adaptation armed — is the soft-machine
  operating instruction, measured.

### 31. THE QUEUE RUN TO THE END: SIX PLANTS, ONE THRESHOLD, AND A GREEN SUITE

Everything open, run without stopping on the owner's instruction:

**The law completed to six plants — and it sharpened.** The barrel, force-deployed with
gated adaptation (`thermalonline.mjs`): static 0.67x (the refusal was right), **online
1.17x — adaptation flips it from harmful to helpful.** Wood-Berry (`wbonline.mjs`): forced
static 0.53x, online 0.53x — no rescue, the twelve-seed refusal stands. Lined up, the six
plants order themselves on ONE number:

| plant | static verify | adaptation outcome |
|---|---|---|
| Wood-Berry | 0.01x | forced harmful; no rescue |
| mill | 1.07x | null |
| **barrel** | **1.10x** | **flips helpful (0.67x → 1.17x)** |
| tank | 1.22x | +18% |
| EMPS | 1.64x | 3.7x |
| arm | 3.03x | +29% and stacks |

**The deploy gate's own 1.1x threshold IS the adaptation selector** — every plant at or
above it benefits, every plant below stays null-or-harmful, and the barrel sits exactly on
the line and tips the right way. One number the machine already computes, now doing two jobs.

**The binding diagnosis ships** (`report.binding`): the verify counts the fraction of
correction-on time spent at the cap and states the verdict — authority-bound (probe: raise
uMax with adaptation armed) or model-bound (banks/adaptation are the lever; a larger cap
measured null) — the diagnosis this arc ran as experiments, now one report line.

**`ikfree.test.mjs` folded onto the rig** — local copies deleted, all checks pass on the
shared definitions (holdout 3.252e-4 rad byte-matches), the mirror-or-don't-touch flag
retired.

**The stack contract re-grounded and GREEN** — the three standing reds rewritten on the
truth-free installation the cascade owns (rule 4, on the owner's instruction): layer 2 finds
structure at the shared fit's measured level; depth never makes the machine worse and a
refused layer costs exactly nothing; and the deployed layer transfers as a model, not a
memory (8.8x on the never-run sine, where the phase table reads 0.55x — the margin bar
re-based from the unshared fit's 0.87 to the shared fit's traded 0.60). `pilot/stack: all
checks passed` — the suite's last red file is retired.

**The θ fold's two-channel limit is stated at its definition** (rule 59), with the
measurement that would change it named: a third-axis machine arming the grid.

### 32. TARGET 2 MET — FEEDRATE-AGNOSTIC ON ALL THREE PROGRAMS, BY THE REPORT'S OWN PRESCRIPTION

`report.binding` said the @0.008 rows were authority-bound and prescribed "raise uMax with
adaptation armed" (the soft-corner law: static control misuses extra authority, gated
adaptation reclaims it). One matrix run at cap 0.3 with the composition armed:

| feedrate-agnostic (target 1.5x) | before | after |
|---|---|---|
| sharp | 1.13x ✓ | **1.16x ✓** |
| rounded | 2.37x | **1.49x ✓** (its @0.008 row 2.60x → 4.20x) |
| circle | 1.73x | **1.14x ✓** (its @0.008 row 5.01x → 7.23x) |

**The second north-star target formally met, on every program at once**, no held-out program
worse than leaving the machine alone, and the diagnosis-to-fix path was exactly one report
line to one matrix run. Program-agnostic worst-row holds at 2.86x (the @0.004 sharp is
model-bound, as its own binding verdict says, and the cap change correctly left it alone).

### 33. TARGET 8, THE RIVAL — the verdict is two regimes, not a winner

The plan held this for last on purpose, and with the refusal machinery law-grade it ran.
A textbook norm-optimal ILC was built with model-free identification (`test/pilot/rival.mjs`:
two probe laps, impulse response by cross-correlation, adjoint steepest descent, zero-phase
Q). Two of its faults were mine and were repaired by this project's own rules — the step size
needed the PEAK frequency gain, not the kernel energy (it diverged in three laps), and the
kernel had to REACH the settling time (rule 37, biting the rival: at 257 taps against Tset's
~305 samples its truncated DC crept the update the wrong way). Repaired, it converges to
1.4x by lap 8 on the sharp square — and then DIVERGES from model error (6.4e-1 by lap 20),
and never improves the circle at all. **Even a clean norm-optimal is fragile on this bench**,
which is context for what PathILC's lead + zero-phase robustness is worth.

So the rival of record is PathILC, already measured to convergence on this machine, and the
target-8 verdict is a two-regime table rather than a winner:

| regime | PathILC (recorded) | the composition |
|---|---|---|
| converged, on its own program | **circle 8.9e-4 @15 laps; rectangle 2.53e-2** | circle ~8e-3; sharp 9.2e-2 |
| first part / a program never seen | 0.55x on the EMPS sine — worse than nothing | **transfers everywhere measured; 8.8x on that same sine** |
| installation | needs the error signal EVERY lap, for ever | needs it for a guided phase, then frozen |
| a program change | table invalid, relearn from lap one | same banks, same weights |

Converged-on-program, the lap-indexed table wins by an order — lap-to-lap repeatability is
0.3 µm against ~40 µm of model error, and remembering beats predicting where remembering is
allowed. Everywhere else — first parts, changed programs, removed instruments — the
composition wins outright. The north star chose its side of this table in its first line
("lap improvement is great but secondary to the unseen path performance"), and both sides
are now measured on the same machines with the same instruments.

### 34. TARGET 8 RE-ARMED BY THE OWNER: the right competition is TRUTH-FREE, and it is a Kalman

The owner overruled §33's framing: *"I don't think ILC is the right competition. I think
running without the truth is more in line. I want to pit it against a model based controller
using a kalman for the estimation — a learned controller with no model against a reasonably
engineered model."* That is the sharper question, because an ILC needs the error signal every
lap for ever, while both of these run blind at deploy. `test/pilot/kalmanrival.mjs`.

**Each side gets its own kind of prior, and only that.** The engineered side gets what an
engineer legitimately has: CAD geometry, the rigid-dynamics computed-torque servo, datasheet
gearbox constants (K, C, N, Jm), and — because the learned side's installation includes a
temporary tracker for its guided phase — a held-pose calibration too (RobotComp at four
settled poses, the reconcile file's conventional-machine recipe). On top of that, a per-joint
Kalman filter estimates the gearbox wind-up [δ, δ̇] from the only sensors on the machine,
encoder and commanded torque, via the motor-side torque balance z = N·τcmd − N²·Jm·q̈enc =
K·δ + C·δ̇, with the rigid model's load torque driving the process. The learned side is the
frozen composition: commissioned from noise, polygon corner banks, diamond-guided adaptation,
then frozen — no model, no geometry, no kinematics.

**The engineered side was made its best self before the verdict, three measured repairs:**
- R was set from the MEASURED noise of the z channel, which came out 48× and 93× its own
  signal (one-step encoder differencing through N³·Jm). A datasheet-tuned R made the filter
  chase that noise and its estimates were 30–80× the signal; the honest R makes the Kalman
  gain the principled statement of how much the sensor can add — almost nothing.
- The process inertia is M(q)'s diagonal; full coupling through the estimates was tried and
  measured WORSE (shoulder δ̂ error 3.52e-3 → 4.51e-3), so it was reverted (rule 16: the
  machine decided).
- The correction is low-passed (1/300): the estimate's DC is right (bias ~2e-5 on a 2e-3
  signal) and its AC is model mismatch — link elasticity and backlash the gearbox model
  cannot represent — so the fast part is noise to the command.

**The verdict, all rows on one machine (E 0.15 / K 16, feed 0.004, contour rms and the
gain over open loop):**

| program | open | KF only | static (RobotComp) | engineered full | learned, frozen |
|---|---|---|---|---|---|
| sharp | 2.025e-1 | 1.00× | 1.01× | 1.01× | **2.28×** |
| circle | 7.101e-2 | 1.02× | 1.12× | 1.13× | **2.38×** |
| rounded | 1.343e-1 | 1.01× | 1.02× | 1.02× | **2.86×** |

**The reason is structural, not a tuning failure.** The true gearbox wind-up on this machine
is ~2e-3 rad rms against a truth of ~2e-2 — the state the engineered observer can see is
about 10% of the error. The rest is link elasticity and servo lag, which an encoder-only
observer is blind to BY CONSTRUCTION: the servo closes on the encoder, so the encoder agrees
with the reference while the tool droops, and no filter on encoder + torque can recover a
deflection that never enters its measurement. The held-pose static model sees the DC droop
(hence circle's 1.12×, the one steady program) and nothing of the dynamics. The applied
corrections say the same thing: the engineered full's u peaks at 0.003–0.015 rad where the
learned side deploys 0.039–0.150 — the engineered model isn't wrong, it is SMALL, because
the model's states only span a tenth of the problem.

**What the learned side actually bought is the sensor, not the cleverness.** Its temporary
tracker SAW the tool during commissioning, so its banks encode tool-space reality the
engineer's observer structurally cannot estimate. The fair statement of the result: given
identical installations (temporary tracker, then truth-free), spending the tracker's
information in a learned map beats spending it on four calibration constants by 2.3–2.9×,
and the datasheet Kalman on top of the rigid model is worth ~1% because the observable state
is a tenth of the error. This is the anti-slosh rule from the other side once more: the
gearbox HAS a closed form and the Kalman duly recovers it — but what dominates this machine
has no closed form the engineer possesses, and that part must be learned.

**POSTSCRIPT AFTER §36: the learned side was itself understated, and the gap widens to
2.9–7.7×.** The bench's learned protocol carried two components the scale finding overturned
— anchor-scale labels (whose saturated λ had the fallback rejecting the corner weights at
every lead) and a diamond-guided phase (measured pulling the shared weights off-geometry:
−11% on the record-scale square and 3.2× on the circle). Its measured best self is record-
scale polygon+star banks, frozen, NO guided phase — a SIMPLER installation than before
(commissioning truth only, zero guided laps) — and the verdict re-reads: engineered full
1.01× / 1.13× / 1.02× against learned frozen **2.87× / 7.72× / 6.18×** (sharp / circle /
rounded), with the engineered rows byte-identical to the first table, which is the control
that says the learned side improved rather than the bench moved.

### 35. TARGET 6 CLOSED: the full composition on one scan, one counted number, one contract

The open item was that the budget claim covered the solver alone: `cost()` counted forecast +
QP + fit, `routerCost()` the router, and nothing asserted the SUM — three reports at three
cadences that had to be added by hand and were not. `Pilot.scanCost()` now composes them,
each term at its own cadence, and `test/pilot/scancost.test.mjs` is the contract, measured on
the arm because it is the one plant that arms every stage:

| arming | peak MAC/cycle | sliced MAC/cycle |
|---|---|---|
| bare (forecast 14,278 + QP 58,986 + interp 6) | 73,270 | 1,024 |
| + corner banks (router worst 20,852 / smooth 320) | 94,122 | 1,313 |
| + online RLS (72,600 per sample — the dominant term) | 166,722 | **9,380** |

**The full composition fits 10% of a 1 ms scan SLICED, at 94% of budget** — the update spread
over the interval between updates at the price of one more grid sample of look-ahead, exactly
the scheduling `cost()` documents. The honest other half: the PEAK — every cadence landing on
one scan — is 16.7× over, so a no-scheduling PLC cannot run this; the sliced schedule is the
deployment mode and that is stated, not hidden. The contract also pins the instrument itself:
each arming must move EXACTLY its own part (rule 21 — banks add only the router term, the RLS
adds only its term and its covariance bytes), the composed peak must equal `cost()`'s peak
plus the parts (rule 6), and the dead zone must keep a smooth program under 2% of the corner
case. The RLS at 72,600/sample is now visibly the dominant deployed cost — the doc's own "why
features are the first thing to cut," finally with a number attached.

### 36. THE GEOMETRY WALL WAS THE LABEL SCALE — the stale 3.27x, the archaeology, and the scale that lifts every bank

Target 1's confrontation began with a discrepancy: the recorded self-fit ceiling on the sharp
square is 3.27x, and the new price-of-agnosticism bench measured today's self-fit at 1.97x.
Both numbers are now REPRODUCED, and the story between them overturns three standing findings.

**The archaeology, both ends on the same machine and seed.** The severity-anchor commit
(2ce8f08) reads the self-fit row at 1.99x — byte-identical to today's head, so nothing since
regressed it. The commit before it (7ae94cb, record-peak scaling) reads **3.27x exactly as
recorded**. So the anchor commit — introduced to fix a real confound (changing the probe's
event shape moved the record peak and rescaled every program's engagement in one move) —
silently traded away the self-fit bank's entire advantage, and the 3.27x was then carried
forward through five tables as a static ceiling the machinery beneath it no longer reached
(rule 30 in a new costume). Three cheaper explanations were measured and killed first: the
coverage guard (vTop x2 is byte-identical — corners are LOW-velocity events and the guard
fades at HIGH velocity, so the hypothesis was physically backwards), authority (cap 0.3
reads 1.97x), and emulating the old scale through AFULLK=31 (fits zero leads — λ never
clears the dead zone).

**The mechanism is in the fit's own log line.** The square's corners run 31x the declared
aMax; `shapeLambda` saturates at 2x; so under the anchored scale every corner row lands at
λ=1, the knot strata collapse into one heterogeneous pool, and the held-out fallback rejects
the corner weights at ALL 116 leads — `116 kept scribble` against the record scale's `0`.
The anchored label was not conservative, it was BLIND: rule 32 verbatim (a threshold must be
scaled to the quantity it acts on — the fit labels rows of a RECORD, so the record's own
peak is the right scale), colliding with a constant that had been anchored for a different
purpose. `fitCornerBanks` now takes `fitScale: 'record'` (0.5x the records' peak |Δ²cmd|,
stored in `pilot.router` so fit labels and deploy addressing stay one quantity); the anchor
remains the cross-EXPERIMENT scale, which is what it was actually for.

**Measured, one instrument, sharp square (matrix, ROUTER diet as labeled):**

| config | @0.004 | @0.008 |
|---|---|---|
| baseline (no banks) | 1.69x | 2.27x |
| agnostic poly+stars, anchor | ~2.0x | 2.45x |
| **agnostic poly+stars, record scale** | **2.93x** | **2.42x** |
| **self-fit, record scale (ceiling)** | **3.54x** | **2.65x** |

Smooth programs stay byte-identical under the record scale (circle 9.201e-3, rounded
2.171e-2 — the shaped blend's control holds, rule 21), the safety floor holds (nothing worse
than doing nothing), and the worst held-out degradation improves 2.87x → 2.55x.

**Three standing findings overturned by one scale change:**

1. **"Every increase in corner-geometry diversity makes the square worse" was an artifact.**
   Under the anchor, adding stars measured 2.02x → 1.97x; under the record scale the same
   addition measures 2.39x → 2.93x — diversity PAYS once the labels can stratify it. The
   wall's third panel (coverage → severity → geometry) falls: geometry was never the wall,
   the label scale was.
2. **Diamond-guided adaptation helps only broken banks.** It bought +11% on anchor banks
   (which were near-scribble, so any adaptation adds) and costs the record-scale square
   -11% and the circle 3.2x — the shared-weight RLS pulls every program's weights toward
   the diamond's distribution. The composition SIMPLIFIES: record-scale banks, frozen; no
   guided phase; no truth after commissioning at all.
3. **Target 1's residual is not transfer.** The price of agnosticism — self-fit ceiling
   over the agnostic recipe, same instrument, same feed — is **1.21x @0.004 and 1.10x
   @0.008, both inside the 1.3x target.** What remains of the degradation metric is
   PROGRAM HARDNESS: the sharp square's own ceiling is 1.75x below the rounded rectangle's
   6.18x for any bank, including one fitted on the square itself. That ratio belongs to the
   machine and the corner rule (reversals crossing backlash at near-zero feed), and no
   commissioning diet can buy it back — a per-program commission does not reach it either,
   which is what the original metric assumed it would.

**Pinned:** `test/pilot/agnosticprice.mjs` (full tier) — price 1.27x on its own instrument
(ceiling 3.64x / agnostic 2.87x, and the agnostic row matches the Kalman-rival bench byte
for byte, rule 6's cross-check for free), with both halves asserted: the ceiling is real
(knowing the geometry still buys something) and the agnostic recipe clearly beats baseline.

**And on the KINEMATICS-FREE chain the protocol carries over with one asymmetry worth
stating.** Record-scale polygon+star banks through the learned inverse read sharp
router-static **2.37x with NO truth at deploy at all** (the old best frozen row was 2.46x
and needed a guided phase), online 2.54x, takeaway 2.53x; the circle is untouched
(6.87x/6.82x, the smooth-program control again). The learned chain keeps only 88 of 232
corner fits — its truth is the affine observer rather than the tool, and a noisier truth
rejects more weights — and unlike the analytic chain its online rows still ADD on the
scored shape (2.37x → 2.54x): guidance harmed only when it was a DIFFERENT geometry's
distribution pulling shared weights; truth on the shape being cut remains a gain.

### 37. THE DEMO-PATH CONTRACT AND THE ATTACK ON THE OPEN TARGETS — theory first, stated falsifiably

**The owner amended the one-press contract:** alongside routing the signals and stating the
limits, the engineer provides a DEMO PATH — representative dynamic moves (sharp corners,
real features) at reasonable workspace locations — before pressing GO. And the correction
that shapes everything: the demo does NOT span the workspace. Auto programs live in a
sub-region; manual modes reach the full box; the model must survive far from the demo.
The retirement holds absolutely: the demo is a DATA SOURCE, never an address — nothing
lap-indexed ships, banks stay addressed by command state.

**The architecture this implies is three tiers, and every tier already has measured parts:**

1. **The global model spans the box, always.** The scribble-fitted base layer stays
   commissioned over the full declared workspace — manual-mode survival and the safety
   floor rest on it. A demo-clamped commissioning box is REJECTED by prior measurement:
   one trajectory transfers 73x worse at the worst point (`transfer.test.mjs`), and the
   box-shrink experiment lifted commissioning R² 0.833→0.970 while dropping every held-out
   program — the third and fourth independent readings of "a calibration must span the
   range it is used over", where the range is now the box, not the program.
2. **The demo calibrates STATISTICS; generators provide COVERAGE.** The demo is measured
   (`peakDiffs`: severity, corner density, feed span — rule 41b's instrument) and its
   statistics drive the agnostic generators — random polygons and corner tours PLACED
   ACROSS THE WORKSPACE — so banks see demo-grade dynamics at poses the demo never visits.
   "One pose teaches one pose" is a measured finding, and the pose-scheduled basis (0.840
   against 0.771 held-out, on the actual-torque signal) is the other half of the answer.
3. **Graceful fade, never a cliff.** The router already fades λ where commanded speed
   exceeds probe coverage; the same shape applies in POSE space — bank engagement fades
   with distance from fitted pose coverage, falling back to the global model. Manual jogs
   are gentle, and the router's dead zone (320 MAC, zero engagement on smooth motion)
   already keeps banks out of manual moves by construction.

**THE CRITICAL NEW EXPERIMENT — the displacement sweep.** Score the sharp square at
increasing displacement and rotation from the demo's location, banks on and off. Both
halves (rule 9): near the demo the banks deliver ~self-fit performance (3.6x), and far away
they degrade MONOTONICALLY toward the base model and never below it — no cliff, never worse
than open loop anywhere in the box. Harm under displacement makes the pose-fade guard
mandatory rather than optional.

**Performance predictions** (each with its killer): program-statistics banks 1.2–1.9x where
corners matter (killed if the rounded program shows no headroom); cascade layer 2 fed the
demo record 1.3–1.7x over generic depth 2 (killed if EMPS's program-collinearity failure
reappears — 12.70x→3.93x was the forecast on trapezoids); DPT 60 + λ·(DPT/30)² is +12–25%
already measured on the arm and not yet default; ensemble averaging 1.1–1.3x (killed if the
arm's draws don't spread — at 1.13x over six seeds they barely do).

**TUNING TIME, NOW MEASURED RATHER THAN THEORIZED.** `commissionArm` carries a permanent
per-phase wall-clock instrument (`pilot._wall`), and the first reading overturns the
overhead theory: per-step cost is uniform (~0.22 ms), so this loop is physics-bound and
there is no flexisim-style 10x of plumbing. Where the 59.4s actually goes: **verify 25.4s
(43%, 108k steps — 2.8x the excitation itself), fit 20.3s (34%, batch ridge at 145 ms per
work() call)**, excite 8.5s (14%), probe+settle 4.2s, outside-loop 1.1s. So 77% of
commissioning is fit + verify, and both have principled cuts:

- **THE FIT'S CUT IS TARGET 6'S UNBUILT HALF.** Stream the shared-covariance RLS during
  the excite phase and the batch ridge disappears — fit wall time → ~0, and the on-PLC
  commissioning fit exists for the first time. One build, two targets.
- **THE VERIFY'S CUT IS THE DEMO.** It is already the decisive regime (0.989 rank
  correlation on the tank); the scribble regime shrinks to its veto role, sized against
  its own margin (rule 2). Projected pilot layer: ~60s → ~20–25s, compounding per cascade
  layer since each pays fit + verify again.

The experiment ladder, cheapest-falsifier first: ① wall-clock breakdown (DONE, above);
② program-statistics residual bank against generic layer 2 on the rounded program;
③ the displacement sweep; ④ the streamed RLS commissioning fit; ⑤ DPT default on the arm;
⑥ ensemble; ⑦ the integrated one-press bench — `autostack` takes the demo alongside
signals and limits and ships the whole composition.

**⑦ THE ONE PRESS RUNS END TO END, AND THE DEMO RUNG SHIPS ON ITS FIRST OUTING.**
`fitCornerBanks` moved to `lib/pilot/banks.js` (the rig re-exports it — every bench
byte-identical by construction), `AutoStack` gained rung ②b (demo banks on the cascade's
first layer, scored like any rung, reversibly disarmed if refused, skipped states reported),
and the shared host gained `recordDemo` — the demo driven exactly as the pilot's
commissioning truth saw the machine, one routing (rule 61). Controls first: the EMPS
no-demo button came back green (33 checks — the rung is inert when no demo is supplied).
Then `test/flexisim/demoladder.mjs` pressed the button on the soft arm, sharp square
scored, DIAMOND as the demo — a geometry the ladder is never scored on:

```
as it arrived              5.5131e-1
conventional (self-tuned)  refused — correctly, 1.00x
pilot cascade depth 1      2.6037e-1   2.12x
pilot cascade depth 2      2.5724e-1   1.01x
②b demo banks              1.8014e-1   1.43x   ← ships (189 fitted, 35 kept scribble)
total: 8.1 minutes, wire → demo → press
```

3.06x over the open loop with nothing supplied but signals, limits and a demo, every
refusal correct, and the banks earned their place through the ladder's own margin
machinery rather than by being believed. The owner's amended contract is now a measured
machine behavior, not a design. TWO OPEN ITEMS it exposes: the page (⑨ on flexisim.html)
does not yet offer a demo input, so the one press on SCREEN still runs the demo-less
ladder; and target 4's next cut is sitting in this table — 5 of the 8.1 minutes went to
the conventional rung's 23 laps, a rung that was then REFUSED, so a cheaper early-exit
for a rung that is measuring nothing is the largest remaining commissioning lever.

**THE COMMISSIONING-TIME ARC: 8.5 → 6.1 MINUTES, EVERY RUNG NUMBER BYTE-IDENTICAL.**
Three cuts, each verified on both the refusing plant (the arm's press) and the deploying
one (EMPS, 33 checks green throughout, 424.82x untouched):

1. **The exits** (`ClassicFF`): a headroom floor after the baseline lap (basis-spanned
   share of the error energy under 2% refuses before a single probe — fired on EMPS's own
   always-refused stage, 1 lap instead of a budget); a dead-trial stop (three trials with
   none accepted); and the PACE exit, measured into existence when the first two did NOT
   fire on the arm — its basis spans 27% of the error and its trials accept at the 0.1%
   level, so the verdict was in the pace: 0.36% after 4 refinement laps against the 2% the
   ladder demands, priced exactly there by `refuseBelow` (the ladder passes its margin).
   The ladder also stopped paying a deploy re-score for a rung whose commission found
   nothing. 23 laps → 20 (1 baseline + 15 probes + 4 trials — the probes now dominate).
2. **Probe grade** (`probeLaps`, opt-in): the rung's commissioning runs are identification,
   not decisions, and each was paying a full scored run (2 warmup + 4 averaged laps).
   Probe runs at 1+2 halve the block; every deploy re-score and ladder decision keeps full
   grade. 8.0 → 6.1 minutes, rung table byte-identical — the identical coefficients
   produced the identical re-score, which is the proof the grade split is free here.
3. What remains and what it costs: conventional ~2 min (45 machine laps of probes — fewer
   probes needs a smaller basis, a model change), cascade ~3 min (contains the measured
   depth-2 decision at +1%, which is a decision and not waste), demo recording ~1 min.
   The next big lever is the pilot's own VERIFY (43% of each layer's commissioning), and
   that is the six-plant `_verifySegLen` experiment — a different measurement per the
   verify's own warning, not a knob to turn on one plant.

**THE VERIFY SWEEP RAN, AND THE WARNING WAS RIGHT.** `PILOT_VERIFY_SCALE=0.5` across all
six plants, each test's own bars as the judge: thermal, Wood–Berry, the mill, EMPS and the
arm all green — and the TANK fails one check, the one that matters: the sweeping
excitation's deployed advantage collapses from 2.07x-vs-1.32x to 1.47x-vs-1.40x. The
half-length verify re-prices λ and the deployed effort with it, so the verify's length is
LOAD-BEARING on one plant of six and the 43% is bought, not wasted. The knob stays an
experiment, the default stands, and the commissioning-time arc closes at 6.1 minutes
(4.0 at depth 1) with the verify cut correctly refused by the machine it would have
broken.

**DEPTH 2 STILL EARNS ITS MINUTES — THROUGH THE RUNG ABOVE IT, NOT ITS OWN ROW.** The
owner asked whether the cascade's second layer is worth its CPU and time now that the demo
banks exist; the DEPTH=1 press answers: depth 2 + banks 1.7692e-1 (6.1 min) against
depth 1 + banks 1.9555e-1 (4.0 min) — a 10.5% better final machine for 2.1 minutes, on a
program where depth 2's DIRECT row reads a sub-margin +1.2%. Its value flows downstream:
banks fitted on what depth 2 leaves deliver 1.45x where banks on depth 1's residual
deliver 1.33x — the layer removes lag-structured error that makes the remainder more
bank-correctable, the cascade's thesis showing up BETWEEN rungs. (On the rounded program
depth 2 was already the only game; banks do nothing there.) The sharp edge of the finding:
the ladder judges rungs by their direct gain, and a rung's value can be downstream — a
margin that refused depth 2 on its 1.2% would have silently cost the banks 10%. The
per-rung table cannot see cross-rung enablement; the whole-prefix comparison just measured
is the instrument that can.

**AND THE DEMO IS NOW DESIGNED, WITH THE ENGINEER'S PROGRAM AS THE OVERRIDE — the owner's
next directive, measured the same day.** `lib/flexisim/demopath.js` generates the demo the
block asks the machine to run when no program is supplied: random sharp polygons plus
stars across a feed ladder, every design element a §36/§37 measurement (stars bracket a
square's 90° corner from below where convex shapes bracket it from above; diversity pays
under the record scale; feed² spans the severity knots), defaults reproducing the measured
diet byte for byte (pinned against the rig's generator before the rig was cut over to a
wrapper). The host falls back to it whenever the demo rung is armed without a `demoPath`;
a supplied program replaces the geometry, never the machinery; and the report stamps
`designed: true` so the two installations cannot be confused. Pressed on the same bench:

| demo | ②b residual | gain over cascade | fit |
|---|---|---|---|
| diamond (engineer-supplied) | 1.8014e-1 | 1.43x | 189 fitted, 35 kept scribble |
| **designed (nothing supplied)** | **1.7692e-1** | **1.45x** | **224 fitted, 0 kept scribble** |

The designed demo OUTPERFORMS the supplied one — modestly on the residual, decisively on
fit completeness: every lead carries real corner weights where the diamond left 35 on the
scribble fallback. So the one press now needs no program at all to reach 3.12x in 8.5
minutes, and handing it one is an override, not a requirement — exactly the contract the
owner stated.

**⑥ MEASURED, AND THE TANK'S TOOL IS THE ARM'S SECOND CHOICE.** Six draws on the arm
(rounded 5.31–6.18x, circle 5.19–10.02x — real spread), ensemble of the 4-draw majority
layout: rounded 5.78x, held-out circle **7.47x against the median draw's 6.48x** — outcome
(a) of the pre-stated three, a better plant model by variance reduction, +15% on a program
no draw shared. But beside `select.mjs` the ranking inverts: the gate-pick delivered draw 2
(10.02x on the circle, rank 1 of 6). So the k-commissioning budget has TWO tools and one
selector, and it is the same selector as everything else here — whether the draws DEPLOY:
draws that deploy and rank under the representative regime (0.989 correlation) want
SELECTION; draws that refuse (the tank, all eight) leave nothing to select and want the
AVERAGE, which vouched for itself there at 1.34x. Both are free at deploy; the choice costs
nothing at runtime.

**⑤ MEASURED ON THE RIG, AND RULE 42 SAYS NO.** DPT 60 reads rounded +2%, sharp nil,
circle +3.6% — not the +12–25% the soft ⑧-configuration measured — while N doubles to 115
and the QP arithmetic roughly quadruples. Two things worth keeping: the λ replay re-picked
the effort weight at exactly (60/30)² by itself, confirming the ⑧-arc's manual scaling law
from inside the machine; and the lever is now placed — the decision clock pays on SOFT
machines and not on stiff ones, a constant that must be re-derived per plant (rule 31),
which is exactly what the replay already does.

**AND THE FIT'S WALL CLOCK IS THE SEARCH, NOT THE RIDGE.** Sub-stage timing: tune 13.3s +
window 4.3s against the per-lead ladder's 2.5s. So ④ as designed (stream the ladder through
SharedRLS) buys almost no commissioning time — the on-PLC architecture claim stands on it,
but target 4's lever here is the SEARCH, and `ensemble.freezeConfig` already skips it for
every draw after the first. The verify (25.4s, 43%) remains the largest cut available.

**③ MEASURED, AND BOTH HALVES HOLD — WITH A BONUS THAT REVERSES THE EXPECTED COST.**
`test/pilot/displace.mjs`: commissioned at a workspace-sized box (±1.2 rad — the standard
±0.55 turned out to be PROGRAM-sized, the home square using 0.523 of it, so the workspace
requirement had never been represented by the rig), demo banks fitted on the sharp square
at (12,0), scored on squares displaced across the box. The banks fade MONOTONICALLY —
3.81x at home, 3.48x at d=1.4, 3.08x at d=2.8, 2.75x at d=4.2 — always well above the base
model (1.77–1.95x) and never near harm, so the pose-fade guard is optional rather than
mandatory: the corner bank is a move-profile model with mild pose sensitivity, exactly what
the diamond-transfer reading (0.950 on a never-fitted geometry) suggested. And the bonus:
the WIDE box did not cost the home program, it helped it — base 1.77x and banks 3.81x
against 1.69x/3.64x at the program-sized box. A commissioning that spans the range the
machine is actually used over (manual + auto) is better even for the sub-range, which is
the span rule arriving from its other side. Workspace-coverage generators remain worth
building only to close the 3.81→2.75 slope, a second-order gain now.

**② MEASURED, AND THE KILLER FIRED AS WRITTEN.** On the rounded program the self-fit
ceiling, the agnostic banks and no banks at all are BYTE-IDENTICAL — 2.173e-2, 6.18x, in
every row — so corner banks buy exactly nothing there even fitted on the rounded itself at
record scale. (One mechanism note: a multi-feed diet re-dilutes the scale for gentle
programs — the record's peak comes from the fastest feed's corners, so the slow feed's
corners fall back into the dead zone; irrelevant here since even the ceiling is flat, but
it will matter for demo-statistics scaling on mixed-feed demos.) Corner banks are a
SHARP-PROGRAM lever, full stop. The flagship program's remaining headroom is in the BASE
layer — forecast quality, DPT, cascade depth, ensemble — which re-ranks the ladder:
⑤ and ⑥ rise, and target 5's path does not run through the router at all.

**THE FIRST ON-SCREEN PRESS WAS A FIELD REPORT, AND IT FOUND THREE DEFECTS THE SUITE
COULD NOT.** The owner pressed ⑨ on the phone: 26 minutes, a "MEMORY" rung in the table,
and the sharp square at 5.97e-1 — WORSE than its 5.5e-1 open loop, the trace oscillating
wildly. All three were tested-to-app divergences, invisible to every check because the
scored runs only ever drive the commissioning path:

1. **The page ran the pre-retirement ladder.** The bench disables the lap-periodic rung
   (the retirement's model-only ladder); the page's host hardcoded `periodic: LAP`. 74 of
   the 26 minutes' laps were the retired memory being commissioned. Now one wired option
   (`lapMemory`, default true so the recorded 22.42x bar stays byte-identical; the bench
   and the page both pass false through the same wire, rule 61).
2. **The deployed look-ahead was frozen to the commissioning program.** `actAt` served the
   rounded rectangle's reference table forever, so after a program switch the cascade
   steered toward moves the machine was not making.
3. **The program signature was frozen too**, so the lap table's off-program guard compared
   the commissioning signature to itself and applied the memory to every program — the
   0.53x off-program failure this project has measured twice, now observed a third time,
   on screen. `attach` now takes the live path and re-arms the deploy state (rule 58: the
   deployed machine survives a program switch; these were its not-rebuilt dependencies),
   and the page re-attaches on every program change.

**AND A FOURTH DEFECT, THE ONE THE FIRST THREE UNCOVERED: 0.4 STEPS OF PHASE SLIP PER
LAP.** With the ladder fixed, the deployed machine still DIVERGED on its own program —
6.5e-2 climbing to 8e-1 over ~90 laps on the real page — while the Node parity bench held
flat. Driving ONE commissioned ladder under both stepping disciplines isolated it: the
command wraps at the path's TRUE fractional lap period (7356.6) while the deploy look-ahead
wrapped at its integer ceiling (7357), so a continuously-counted deployment slips the
correction's phase against the machine forever; commissioning never sees it because
lapSync restarts its counter every lap. `actAt` now derives its intra-lap position from
the true period — the discipline scoring always had — and the 20-lap two-style
verification reads 1.00x/0.99x, flat. The headless page-press instrument
(`test/_pagepress.mjs`) is what caught it: the operator's report was the only detector,
and the instrument turned the report into a number.

The sub-8-minute estimate was the bench's ladder, not the page's — old and new mixed, as
the owner said. With the ladders unified the honest expectation on screen is roughly half
the first press (the rounded keeps the drop-one pass the sharp bench never triggered, and
a browser lap costs more than a Node lap). `deploy.test.mjs` green (actAt still agrees
with what run() applies), browser suite green at zero failures.

### 38. THE MECHANISM CAMPAIGN — the deterministic residual defined, understood, and traced to its controller gap

The owner rejected the lap-harmonic framing ("there is no way the errors seen need 16 laps
of view") and ordered a deep dive until the mechanisms were defined. They now are, each by
measurement, on the deployed model-only machine (rounded, K1/E0.06, cascade(2), 5.9e-2):

**THE RESIDUAL IS 99.7% DETERMINISTIC** (lap-to-lap correlation 0.997, profile 5.91e-2
against a 3.4e-3 lap-noise floor) — the machine is physically capable of seventeen times
better from a pure function of state, which was the owner's premise, proven first.

**THE MECHANISM TABLE**, one analyzer per hypothesis, all on one recorded campaign:
| hypothesis | verdict | evidence |
|---|---|---|
| lap-over-lap settling (the owner's alternative) | **NULL** | profile corr lap2~lap5 0.9995, amplitude identical |
| backlash (H-LASH) | **minor, ≤5%** | reversal-conditioned rms 5.90e-2 vs 5.93e-2; BL=0 twin profile within 5% |
| corner/transition transients (H-TRANS) | **NULL** | spatially UNIFORM — straights 6.2e-2 ≥ arcs 5.5e-2 ≥ transitions 5.2e-2 |
| static droop (H-DROOP) | 11% | the feed-constant part of the 3-feed decomposition |
| inertial (H-CENT) | 19% | the ∝feed² part |
| **servo-loop response to commanded rates (H-LAG)** | **70%, and the window says the rest** | the ∝feed part; window-reach R² knees exactly at the loop's ~1000-step memory (0.57 instant → 0.82 @360 → 0.982 @1170 → sat 0.984) |

**THE DEFINING FIT:** commanded joint-rate history alone, FIR over the loop's memory,
R² 0.58; ADD POSE/TANGENT MODULATION and it reads **R² 0.9917, residual 5.4e-3** — within
1.6x of the noise floor, from 97 local, commanded-state-addressed features. Stated as one
sentence: **the residual is the servo loop's linear response to the commanded joint-rate
history — a ~1000-step FIR — modulated by pose through the kinematics.** The debate
resolves exactly: the needed view is the LOOP's memory (local physics, three orders below
a lap — the owner's rejection was right) and it is still three times the pilot's current
feature reach (the window insufficiency was real — at the servo scale, not the lap scale).

**THE INVERSE, PUT TO THE MACHINE (rule 16), AND WHAT ITS STALL TEACHES.** Applied as a
feedforward: lead 0 is WORSE (6.6e-2 — the correction rides the loop it corrects); the
gain peaks at lead 750 (4.54e-2) and iterative refit converges geometrically to **4.13e-2
and stalls**, far above the 5.4e-3 the model supports. A scalar lead inverts a delay; the
loop is a FILTER, and deconvolution needs the identified impulse response — WHICH IS
EXACTLY WHAT THE PILOT ALREADY OWNS (h identification + QP inversion). So the breakthrough
layer is not a new controller: it is the PILOT'S FORECAST given the features this campaign
proved sufficient — pose-modulated commanded-rate taps reaching the loop's own memory
(derivable per plant from its measured Ts, rule 31), offered in the tune search the way
poly and sched already are, taken where they earn their place. The QP then deconvolves
properly, and the measured ceiling for the whole composition moves from R² 0.42-class
forecasts to 0.99-class — the model reaching what only the memory could reach, which is
what the owner said the physics allowed.

**THE DELIVERY LEDGER (§38 continued): four routes into the machine, four convictions,
one surviving design.** The mechanism model predicts at R² 0.9917 offline and every naive
route into the pilot made the machine worse — each failure convicting one requirement:

| route | result | conviction |
|---|---|---|
| batch refit, pilot-SILENT records | REFUSED 1.96e-1 vs 8.3e-2 | rows must come from the DEPLOYED distribution |
| tune candidate at commissioning | won the scribble, cascade 3.59e-1 → 6.38e-1 | the scribble cannot SEE the mechanism; removed, refit-only |
| guided online on the program (block prior) | 2.17e-2 → 5.07e-2 | collinear rows learn the program; and online fits LEAD 0 ONLY — a shared vector dragged to one lead's map corrupts the rest (the recorded shared-vs-per-lead failure, sharpened by a strongly lead-dependent block) |
| guided online on demo diversity | 0.88x — worse than OPEN LOOP; circle destroyed 14x | same shared-vector structure, more energy to corrupt with |

Controls held throughout: the zero-extended arming is byte-identical before learning, and
every refusal reverted cleanly. The "surviving design" — per-lead, deployed-distribution, hGrid-deconvolved — FAILED
IDENTICALLY (0.85x, worse than open loop), and five convictions name the real law:

**THE RESIDUAL MODEL AND THE DEPLOYED CONTROLLER FORM A LOOP.** Identification on the
closed loop's own records is self-referential: the QP inverts the model, the inversion
drives the machine off the manifold the rows came from, and the model's null space —
invisible to any offline R², which is why 0.9917 lied five times — becomes active control
error. The scribble exists precisely to span what the QP will do; program-class rows,
however geometrically diverse, cannot. This is the deep form of the recorded EMPS lesson
(program identification 12.70x → 3.93x, "collinear trapezoids") and of rule 35 (a soft
sensor inside a loop is positive feedback).

**THE ONE MEASURED-POSITIVE ROUTE** is the separate feedforward stage OUTSIDE the pilot:
the pose-modulated FIR applied directly at the refs with a lead, +1.30x naive, converging
to 4.13e-2 (+1.43x) under iterative refit — the state-addressed analogue of what ILC does
about self-reference: iterate on the machine rather than invert a one-shot model. The
owner's "settles lap by lap" intuition was this, materialized: iteration is how a
self-referential inverse is honestly computed, and a table that is a MODEL (features, not
lap index) keeps the transfer the memory never had. That stage — hGrid-informed inverse,
iterative refit to convergence, frozen, scored by the ladder — is the defined next build;
rung ②c stays in the ladder opt-in (`demo: { lag: true }`) as the recorded refusal until
it exists.

## §39 — THE e-3 CAMPAIGN: THE PREVIEW FAMILY CONVICTED, AND TWELVE FALSIFIERS ON "COMPILE THE PROGRAM"

The owner set the bar — the error gets to e-3 — and licensed theorizing while the last
experiment ran. Three families came out of that session: (1) COMPILE THE PROGRAM through an
identified plant model (evaluate the model on the program's own command stream at load time,
deconvolve through hGrid, deploy the correction — a model evaluation, not a memory, IF the
model was identified program-free); (2) a MODEL-PREDICTIVE FEED GOVERNOR (slow down where
the predicted error exceeds target — e-3 by construction, paid in cycle time); (3) a
SOFT-SENSED SLOW TRIM (integrate an estimated error — feedback, which iteration has already
shown is how a self-referential inverse is honestly computed). Family 1 had the cheapest
falsifier — pure prediction, zero control risk — so it went first, and twelve falsifiers
later it is dead for the right reasons, with the mechanism mapped.

**THE PREVIEW FAMILY IS CLOSED FIRST.** §38's "defined next build" — the iterative
pose-modulated FIR stage — was built two more ways and convicted both times. The scalar-lead
ladder stalls at 4.13e-2 (+1.43x). The joint-preview form (5 preview offsets x 97 features)
DIVERGED as fitted — the fit weights preview 0 hardest because it predicts best, but
prediction is not actuation. Made actuation-aware (design columns convolved with the mean
hGrid, raw features at apply time) it descends two passes and then walks off monotonically:
5.92e-2 → 4.88 → **4.60** → 4.94 → 5.91 → 6.77 → 7.46 → 8.32 → 10.07e-2 by pass 8 — the
unguarded iterative pump the ILC monotone safeguard exists for, and even its best iterate is
1.29x. Three implementations, one band (~1.3–1.4x), divergence when pushed, against a bar
that needs 60x. The family is closed.

**WHAT THE TWELVE FALSIFIERS SETTLED**, in the order the evidence forced:

1. **The prize is real: the open-loop error is 97–99.8% DETERMINISTIC in the command.**
   rms(lap3 − lap2) on the same record: rounded 2.1e-4/1.1e-4 of 1.25e-2/5.1e-3 per channel,
   circle down to 1.6e-5. A perfect model leaves ~1e-4. Nothing floors e-3 away.
2. **The scribble does not span the programs** (its recorded job was the QP's manifold, not
   this one): scribble-fit predicts the elbow NEGATIVELY on all three programs at every
   reach tried, while self-fitting at 0.97–0.999.
3. **A single-program fit is a MEMORY wearing a model's clothes** — rule 36, now measured
   directly: self-fit 0.9999/0.9978, then R² −0.58/−13.9 on the SAME GEOMETRY at 3e-3
   feed. It scores by knowing where in the cycle it is; a feed change moves the cycle.
4. **Backlash is exonerated** — the ARM_BL=0 twin reproduces every number to three figures
   (rounded elbow self-fit 0.7550 vs 0.7568; transfer equally catastrophic). The clean
   control: nothing changed, so the hysteresis hidden state is not the wall.
5. **The truth's frame is exonerated** — `routeSignals` returns J⁻¹(cmd)·(tool − fk(cmd)),
   joint-space deflections, pose-consistent; no rotating-normal operator in the target.
6. **WINDOW REACH WAS THE CAPACITY WALL — rule 37's third strike.** At reach 1620 steps the
   rounded elbow tops out at R² 0.756 IN-SAMPLE with 245 features; extending the lag ladder
   to 3240 steps takes every self-fit to 0.998–0.9999, **rms 1–4e-4 — AT the repeatability
   floor**. The Newton–Euler products (cos q₂·ddq₁, sin q₂·dq₁², the terms the basis had
   omitted — rule 40) helped only marginally; the reach was the lever. The loop's memory is
   far longer than any window this project had used.
7. **ONE weight vector holds all three programs at the floor** — pooled in-sample R²
   0.994–0.9996, rms 1.2–5.7e-4. Capacity is fully proven.
8. **And NO program-free diet identifies it.** Scribble: negative. Six designed demo paths
   (the ②b diet): negative. Demos + scribble: negative. Leave-one-program-out: negative.
   Smoothness regularization across the lag axis (curvature penalty, the physically right
   prior for a filter): NULL at every strength. An exponential kernel bank (7 one-pole
   filters per product, 175 dof, infinite reach, zero-init matching the machine's rest —
   the rational-loop hypothesis): carries the memory compactly in-sample (elbow 0.988 where
   lags gave 0.756 at matched dof) and transfers WORSE. Reach ladder to 6300 steps:
   transfer climbs weakly and non-monotonically, confounded by its own overfitting.
9. **Feed diversity is the strongest decorrelator found** — rounded at {3,4,6}e-3 pooled
   gives the campaign's best cross-geometry shoulder (sharp 0.73, circle 0.67) and pulls
   the elbow from −73.6 to −1.1 — and the MAXIMAL diet (scribble + demos + two geometries
   x feeds) still asymptotes at ~0.5–0.7 shoulder, negative elbow. The identification
   curve bends an order of magnitude below the 0.99+ the deconvolution needs.

**THE MECHANISM, NAMED.** Each closed path is a one-dimensional manifold in a state space of
pose x rate x acceleration x thousands of steps of history. Any fit on few manifolds finds A
convolution that matches THOSE manifolds — many kernels fit any one manifold, and the true
kernel is pinned only by input diversity comparable to the kernel's support. In-sample
success at the floor plus universal transfer failure is what "the map is in the span but the
data cannot single it out" looks like. This is the fourth independent arrival at "a
calibration must span the range it is used over," and the first where the span needed is
measured to be impractical: the diversity asymptote is the result.

**WHAT DIES AND WHAT SURVIVES.** Compile-the-program dies as a first-lap mechanism: the only
records that identify the program's own map are the program's (a memory, banned and now also
measured as one — it dies at a feed change). The preview family dies. The falsifier scripts
and cached records are scratchpad instruments (`compile-falsifier*.mjs`,
`olrecs/demorecs/feedrecs/tourrecs.json`); nothing here touches shipped code, which is why
sixteen experiments cost one afternoon and zero risk.

**FOUR MORE FALSIFIERS CLOSED THE CAMPAIGN, AND THE LAST ONE NAMED THE SATURATION.**

10. **The space-filling tour is the cleanest domain-shift reading of the arc.** A
    `recordCornerProbe` pose-walking tour at drive-gated rates generalizes to a SECOND tour
    at R² 0.84–0.86 — the class transfers WITHIN a distribution — and to the programs at the
    worst numbers of the campaign (to −1210), while POISONING every pooled diet it joins.
    Two regimes fighting over one weight vector, §§9–17's cornerEvents lesson reproduced at
    the model level: the map is regime-local, and a global linear-in-dictionary fit is a
    first-order approximation valid only near its fitting distribution.
11. **Locality does not crack it either.** Locally-weighted identification (rows weighted by
    window-speed/accel regime distance, six cells per program, the maximal diet) reproduces
    the global fit almost exactly — 0.42–0.73 shoulder, elbow negative. The regime axis that
    matters is not speed.
12. **The measured signals — the record's own "THE ACTUAL TORQUE IS THE SIGNAL" — improve
    the shoulder and tighten capacity absurdly** (scribble→rounded 0.70, the best
    commissioning-only transfer measured; circle self-fit rms 6e-6), and the elbow's
    cross-distribution failure survives even this. Fourteen falsifiers had built every
    dictionary from the command stream; the fifteenth put the measured torque and encoder
    speeds in and the wall moved by a fraction, not an order.
13. **The failure decomposed (rule 39's spirit, applied to the instrument): it is part
    SCALE, part SHAPE, and the ceiling after an ORACLE gain is R² ~0.8.** Scribble-fit
    predictions correlate with program truth at 0.73–0.89 (shoulder) and up to 0.82 (elbow)
    but run systematically oversized (optimal gains 0.3–0.9); rescaled by a per-program
    scalar nobody agnostic can supply, the best cells reach R² 0.63–0.81. The deconvolution
    to e-3 needs 0.999. **Program-free identification on this machine saturates near
    corr 0.9**, an order of magnitude of residual variance short, invariant across sixteen
    falsifiers' feature classes, diets, regularizers and localities.

**THE OTHER TWO FAMILIES ARE PRICED OUT BY MEASUREMENTS ALREADY IN THE RECORD.** The FEED
GOVERNOR: the campaign's own feed-scaling law (70% ∝feed, 19% ∝feed², 11% constant) prices
e-3-by-slowdown at ~60x cycle time AND floors it at the feed-independent ~11% of today's
residual — it cannot reach e-3 at any speed. The SOFT-SENSED SLOW TRIM: ⑤ already removes
97.9% of the bias and the residual is oscillatory, which a quasi-static correction cannot
cancel (rule 39); ⑧'s live-trim row measured the fast version at 0.81x.

**THE HONEST POSITION ON THE e-3 BAR — AND THE OWNER'S CORRECTION, CONFIRMED BY
MEASUREMENT.** The first version of this paragraph claimed the soft config's 3.4e-3 "lap
floor" made e-3 unreachable there for any controller. The owner rejected that — "the model
can be controlled, we need to fix the controller" — and two measurements say the owner is
right and the paragraph was reading the wrong instrument (rule 17): the 3.4e-3 was measured
on the DEPLOYED machine, plant PLUS controller, and quoted as the plant's. (1) **The
plant's own open-loop lap floor at the soft config is 1.3e-5–6.2e-4** (`softfloor.mjs`,
rms(lap3−lap2) per channel across the three programs) — all below e-3. (2) **The deployed
machine repeats at 1.1–1.6e-4 joint-space while leaving a residual of 6.1e-3/7.9e-3 — the
controller leaves a 40x, 97.5%-repeatable, fully deterministic error on the table every
lap** (`deployfloor.mjs`, which also ties the frames: 6.1e-3 joint ≈ 5.9e-2 tool, the
campaign's own profile number, and 1.4e-4 joint ≈ the campaign's 3.4e-3 tool "floor"
through the ~20x kinematic lever — same numbers, wrong attribution). The correction itself
carries a second-order injection (u lap-diff 1.8e-3, 2% of u, tracking the rig's 3.19
step/lap phase walk — `deployOn` free-runs its counters where the page's `actAt` is
lap-synced), but the first-order problem is the repeatable residual the pilot cannot see.
(3) So the bar stands and the work is the CONTROLLER: the campaign's own discoveries name
the instrument — the pilot's forecast reach is an order short of the loop's measured memory
(the 0.756 → 0.998 in-sample jump at reach 3240), the measured signals are the features
the record already ruled are the signal, and the deployed distribution is the diet the
convictions require. Identification on the deployed rows of the RUNNING program is not the
banned memory: it is the §§20–26 online-adaptation route with a basis that can finally
reach what it must model. That build — prediction on deployed rows first, delivery through
hGrid second — is §40.

## §40 — THE CONTROLLER FIX DELIVERS e-3: 6.1e-3 → 3.95e-4 / 7.9e-3 → 6.76e-4 IN SIX REFIT PASSES

The owner's correction (§39's close) said the plant is controllable and the controller is
the gap. Two stages proved it on the machine, in one afternoon, with nothing changed in
shipped code yet.

**STAGE 1 — PREDICTION AT THE FLOOR ON DEPLOYED ROWS.** Fit the reach-3240 basis on laps
2–6 of the DEPLOYED distribution (conviction 1's requirement), validate on a HELD-OUT lap:
R² 0.9997/0.9999, rms 9.8e-5/6.8e-5 — at and below the machine's own 1.1–1.6e-4
repeatability (`deploymodel.mjs`). The ablation (`deploymodel2.mjs`) then found the
delivery-shaping fact: **command-only features predict at 1.1–1.2e-4 held-out** — the
measured signals add nothing — so the prediction is purely feedforward-computable,
available arbitrarily far ahead, with no feedback path and no rule-35 exposure.

**STAGE 2 — DELIVERY THROUGH THE PILOT'S OWN hGRID, ITERATED.** The correction is a FIXED
FILTER OF PREDICTIONS — state-addressed, no lap table: a regularized inverse of each
channel's identified `hGrid` (48 taps, delay at the response peak, λ = 1e-2·‖h‖²) applied
to the model's future predictions at decision cadence, linearly interpolated between ticks,
added to the pilot's u at scale 0.8 under a per-pass monotone guard. Each pass refits the
RESIDUAL the corrected machine actually leaves (2 settled laps of rows), which absorbs the
pilot's own reaction and the channel cross-coupling the diagonal hGrid misses
(`deploydeliver.mjs`, `deploydeliver2.mjs`):

```
                 ch0        ch1
open loop      4.3e-2     1.4e-2
pilot deployed 6.13e-3    7.85e-3
pass 1         2.66e-3    3.09e-3
pass 2         1.40e-3    2.22e-3
pass 3         8.52e-4    1.70e-3
pass 4         5.91e-4    1.28e-3
pass 5         4.62e-4    9.01e-4
pass 6         3.95e-4    6.76e-4    duPk 0.28/0.22, guard never tripped
```

Monotone the whole way, ~0.72x contraction per pass at pass 6, still descending toward the
1.4e-4 floor. **15.5x/11.6x past the deployed pilot, 109x/21x past open loop, both channels
through e-3 into the e-4 decade.** What made this converge where §38's six conviction
routes and the preview family diverged, item by item: the model was validated AT THE FLOOR
on held-out deployed rows BEFORE any control was attempted; the features are command-only
(no loop); the inverse comes from the identified hGrid rather than a guessed lead; the
correction never enters the pilot's own solver or weights (their interaction is measured by
the refit, not assumed away); and the iteration refits on measured post-correction rows
under a guard instead of pumping.

**WHAT IT IS AND IS NOT.** It is the §§20–26 online-adaptation posture with the two
ingredients the sixteen-falsifier campaign proved missing: a basis that reaches the loop's
measured memory, and the deployed distribution as the diet. It is addressed by command
state — no lap index anywhere — but it is fitted on the running program's rows, and
falsifier 11 says a single-program fit dies at a feed change: transfer of the CONVERGED
corrector is bounded by the campaign, and continuing adaptation is what carries a program
or feed change (re-convergence measured here at ~2 settled laps per halving). The cost was
18 laps for six passes and is compressible: the six stacked weight vectors are linear in
one feature row through one filter, so they COLLAPSE to a single vector at zero runtime
cost, a pass needs one settled lap of rows, and the batch refit has an exact RLS form.

**THE QUARTET COMPLETED THE PICTURE THE SAME AFTERNOON** (`deploydeliver3/4.mjs`,
`feedswitch.mjs`):

- **CIRCLE: CONVERGED TO THE MACHINE'S OWN REPEATABILITY — 3.07e-3/4.38e-3 →
  7.14e-6/1.65e-5, 430x/265x past the deployed pilot,** monotone in six passes with duPk
  9e-3/1.3e-2 (2% of authority). The circle's open-loop floor is 1.3–6e-5: on that program
  the controller now removes everything the plant can repeat. Nothing this project has
  measured on any plant is within two orders of it.
- **SHARP IS AUTHORITY-BOUND, MEASURED TWICE FROM ONE KNOB.** At a 0.4 correction cap it
  converges 3x (1.74e-2 → 5.8e-3 by pass 2, duPk PINNED at the cap) and then pumps —
  a clipped correction is not the deconvolved correction, so the refits fight the clip;
  the guard catches it. At cap 1.2: **monotone through all six passes, 1.74e-2/2.05e-2 →
  2.31e-3/2.96e-3 (7.5x/6.9x), duPk 0.93 and still descending.** The kinematics-free arc's
  "the soft corner is authority-bound — raise the cap only with adaptation armed" verdict,
  reproduced on the delivered system.
- **A FROZEN CORRECTOR AT A FOREIGN FEED IS 3x WORSE THAN NOTHING** — 5.7e-2/8.0e-2 at
  5.5e-3 against a plain-deploy control of ~2e-2/1.6e-2 — falsifier 11's prediction
  delivered as harm, the "every deployment harms the machine" shape. And re-adapting
  THROUGH the stale stack recovers only to control level in three passes: each re-pass
  fits a residual that includes five wrong vectors' harm. **The product form follows: a
  command-distribution change detector GATES the corrector off and CLEARS the stack**
  (fresh convergence is a halving per pass; dragging a stale stack is 0.63x per pass to
  merely break even), which is the refusal doctrine applied to adaptation, and the
  §§20–26 selector ("repeating production wants freezing, an evolving recipe wants the
  truth kept") now has its failure mode measured from the freezing side.

**THE LIBRARY FORM SHIPS: `lib/pilot/refine.js`, pinned by `test/pilot/refine.test.mjs`
(full tier).** `Refiner` is the corrector as a stage on a deployed pilot: streaming
refits (XtX accumulates online — no row storage, an RLS-shaped footprint), the pass
stack COLLAPSED to one weight vector per channel as it builds (the passes are linear in
one feature row, so revert is subtraction), the monotone guard (revert + halve, two
reverts freeze), truth-gated fitting (`observe(cmd, null)` applies frozen at zero truth
cost — the tracker-removed installation), and the command-rate gate that zeroes du
outside the band the fit saw. The test pins all three properties two-sidedly on the
bench config: CONVERGES 6.12e-3/7.85e-3 → 5.88e-4/1.33e-3 in five passes, zero reverts,
duPk 0.26 under a 0.4 cap; FREEZES with truth removed and HOLDS (5.72e-4/9.33e-4, no
drift); GATES at a foreign feed with the post-gate correction EXACTLY zero and the
machine at the plain-deploy control level (2.24e-2/1.51e-2 vs the 5.7e-2/8.0e-2 an
ungated stale corrector inflicts). One measured cost stated: the stale corrector rails
against its cap for the ~half lap before the rate-EMA trips — a surprise-based trigger
could shrink that window.

**STILL OPEN, STATED:** the PLC cost of the prediction+filter path (rule 42's table),
sharp's remaining descent toward e-3 under the full uMax, more seeds, page wiring (a
Refine control on ⑤/⑥), and the true RLS form (continuous refits instead of pass
boundaries). The eventual floor may be set by the second-order phase-walk injection
(§39: u lap-diff 1.8e-3 from the rig's free-running counters), which the page's
lap-synced `actAt` already avoids.

## §41 — THE LAP-1 REQUIREMENT REOPENS THE ESTIMATION, AND TEN MORE FALSIFIERS CORNER THE MECHANISM

The owner rejected §39's settlement — the requirement is LAP-1 accuracy on unseen
programs with the tracker at initial commissioning only, and "the limit found is gated by
estimation and we can improve that as well. We are copping out." The reopened campaign
(falsifiers 17–26, all scratchpad, zero shipped-code risk) dismantled the saturation
claim and replaced it with three MEASURED physical facts and one verdict.

**FACT 1 — THE MEMORY, MEASURED DIRECTLY (`impulse.mjs`).** A held-pose ref step:
shoulder settles to 2% in 3240 steps; **the ELBOW takes 6363 steps to 2% and 8649 to
0.1% — longer than a program lap, twice every window any falsifier had fitted.** At a
stroke this explained the elbow being the universally failing channel, the transfer
residual's 2100–3350-step harmonics (the truncated tail), and a structural theorem the
campaign had been paying for blind: **a closed path with lap shorter than the memory
cannot identify the deep tail — its own deep history is its own lap repeated, perfectly
aliased.** The demo diet (laps 2800–6000 steps) was incapable BY CONSTRUCTION, arcs or
no arcs; a truncated-window fit on a periodic command folds the deep taps modulo the lap
length, which is why every per-program fit worked and none transferred.

**FACT 2 — THE STEADY MAP IS UNIQUE (`compile-falsifier23.mjs`).** The same circle
entered from home and after a 20000-step random pose-walk: settled-lap error identical to
**eleven digits** (2.4e-11 of 7.0e-3), and one lap after entry to 1e-7. No hysteretic
rest state, no backlash memory, no multi-stability: there IS one true function to
identify, and history is forgotten within a lap.

**FACT 3 — THE FAILURE IS CLASS BIAS, isolated at last (`compile-falsifier25/26.mjs`).**
With both physics requirements finally met at once — reach 9000 ≥ the measured memory,
and a NON-PERIODIC program-regime diet (random open contour wanders through the corner
rule: arcs, corners, program feeds, ~25k steps each, never repeating) — transfer still
failed, and the in-diet holdout convicted the model class itself: **wander→wander, same
generator, same feeds, scores 0.51/−2.46.** The dictionary cannot generalize even inside
its own regime. Twenty falsifiers of diet, reach, ridge, smoothness, kernels, locality
and pose enrichment were pushing on estimation while the binding constraint was the
class. The grey box — the rigid inverse-dynamics torques M(q)q̈+C(q,q̇)q̇+G(q) computed
from the command through the arm's own closed forms, with small per-channel FIRs, 151
dof — moves the elbow holdout to −0.47 and every program cell up (shoulder to 0.54–0.66
from wanders+scribble alone), and still does not carry the elbow. The residual suspect is
structural: the elbow truth mixes link-2 bending with link-1's downstream TILT (the 1.44x
term), distributed dynamic states that no windowed regression on lumped signals has
reached.

**ALSO FALSIFIED ON THE WAY:** the arc-coverage hypothesis (the circle's rows are 100%
INSIDE the polygon diet's span by leverage, yet worst-predicted — in-span + wrong =
the feature vector is not a state); the slow-start-transient hypothesis (lap-2 and lap-3
transfer scores identical to three digits); richer pose Fourier statics (worse — added
dof feeds aliasing before it feeds accuracy); and the pooled 3-program vector itself
(it scores NEGATIVELY on the demos and scribble — the §39 "capacity at the floor" pooled
fit was three folded representations stitched, not one map).

**THE VERDICT AND THE BUILD.** Windowed regression — any features, any diet, any
regularizer — is exhausted on the elbow. What remains is different in KIND and is the
physically principled route (rule 40 at full strength, the EMPS lesson from the other
side): a REDUCED DYNAMIC TWIN — rigid 2R with fitted parameter corrections, per-joint
wind-up spring-damper, one modal bending DOF per link with its downstream tilt term,
~10–20 parameters — identified by OUTPUT ERROR on the commissioning records (scribble +
wanders, tracker on, no program knowledge), then evaluated by SIMULATION at program
load: states propagate, so there is no window to truncate and no lap to alias.
Prediction of each program's open-loop error becomes a model evaluation; the §40
deconvolution machinery then turns it into a lap-1 feedforward. That build is next; the
random-wander generator (program-regime, non-periodic, the record the theory demands)
and the physics-signal computation are already written and cached for it.

## §42 — THE COMPILED TWIN, STAGE A: LAP-1 AT e-3 TO e-4 ON ALL THREE PROGRAMS, ZERO MACHINE LAPS AT LOAD

The twin route's first stage ran with the PERFECT twin (the plant itself as the model),
which measures the CEILING of the compile concept and debugs the delivery with the model
axis held at zero. The compile: simulate the twin tracing the program, take the
whole-record error, update a correction by frequency-domain 2x2 deconvolution against
the twin's own centre-pose step response (Tikhonov-regularized per harmonic, cutoff
where |H| falls below 2% of peak, opened to 0.8% once the guard holds), re-simulate,
iterate under a MONOTONE BACKTRACKING guard — all software, zero machine laps, zero
tracker at load. Two defects surfaced and were fixed by measurement:

- **LAP 1 IS AN ENTRY-CAUSALITY PROBLEM, NOT A COMPILE DEFECT.** The periodic-lap compile
  delivered laps 2-3 exactly and left lap 1 at ~1e-2 (§27 run); compiling the whole
  record from home barely moved it — correcting a transient at t=0 needs correction
  energy BEFORE t=0, and there is no before. The fix is the ILC lesson from the record
  ("the flex has to be LOADED before the vertex") at program scale: a PRE-ROLL — 1500
  samples of dwell at the start pose with the correction ramping in — after which lap 1
  equals the settled laps.
- **SHARP NEEDS THE GUARD AND THE CUTOFF.** Unguarded full-band inversion with a
  centre-pose H pumps on the corner harmonics (iter 3: 1.7e-2/3.5e-2, worse than open
  loop); guarded and bandwidth-limited it descends monotonically.

**THE STAGE-A NUMBERS (`compile-falsifier29.mjs`), fresh machine, correction on from
the pre-roll, FIRST LAP:**

```
             open loop (settled)   COMPILED LAP 1        laps 2-3
rounded      1.3e-2 / 5.3e-3       2.45e-4 / 5.58e-4     1.2e-4 / 3.4e-4
circle       7.0e-3 / 3.1e-3       3.99e-4 / 2.18e-4     3.1e-5 / 6.8e-5
sharp        2.2e-2 / 1.7e-2       1.27e-3 / 2.10e-3     1.2e-3 / 1.9e-3
```

All three programs at or below ~e-3 on the FIRST LAP — the owner's requirement, at the
ceiling. The compiled artifact is a per-program correction trajectory plus pre-roll,
derived entirely from the model at program load (the owner's original "compile the
program through the identified plant", §39 family 1, delivered in the form the
twenty-falsifier campaign proved necessary: by SIMULATION, because regression's windows
truncate a 6-9k-step memory and closed laps alias it).

**STAGE B — THE PARAMETER TOLERANCE IS WIDE (`compile30/apply30.mjs`).** Compile against
a deliberately WRONG twin, apply the compiled correction to the true machine (rounded,
lap 1): joint stiffness +10% is FREE (2.67e-4/5.57e-4 vs the exact twin's
2.45e-4/5.58e-4), a backlash-ignorant twin is free (2.62e-4/5.71e-4), K+5%/E−5% costs
2.3x (5.62e-4/7.50e-4), and the one sensitive axis is the LINK MODULUS: E−10% lands at
1.18e-3/1.06e-3 — still e-3, still 11x/5x over open loop. The identification target is
therefore merely E within ~5% and K within ~10%.

**STAGE C — IDENTIFICATION CLOSES THE LOOP EXACTLY (`stageC.mjs`).** Output-error
identification on ONE commissioning wander record (28k steps of random open-path
contouring, tracker on, no program knowledge): a 5x5 grid over (K, E) plus two
refinement rings, each evaluation an exact seeded replay of the wander against candidate
parameters. The objective is sharply conditioned — machine-zero at the true values,
1e-4–2e-3 at the +-0.5/+-0.005 neighbors — and recovers K and E EXACTLY. The compile
with the FITTED twin, applied to the true machine: **LAP 1 = 2.45e-4/5.58e-4, identical
to the exact-twin ceiling.**

**THE PIPELINE, END TO END, UNDER THE OWNER'S CONSTRAINTS:** tracker used only at
initial commissioning (the wander record); parameters identified from that record alone;
any program compiled at load purely in software (simulate → guarded deconvolution →
pre-roll), zero machine laps, zero tracker; **first lap at 2.45e-4/5.58e-4 (rounded),
3.99e-4/2.18e-4 (circle), 1.27e-3/2.10e-3 (sharp)** — programs the identification never
saw. Lap-1 accurate, path-agnostic, tracker-free at load.

**WHAT REMAINS HONESTLY OPEN:** on this sandbox the twin's STRUCTURE matches the plant
exactly, so stage C measures parameter identification only; a real machine adds
structural mismatch, for which stage B's graceful degradation and the EMPS closed-form
precedent (275x from four published parameters) are the encouraging evidence, and the
§40 Refiner exists as the online trim for whatever a fitted-structure twin leaves. The
product form stands: the engineer declares the structure template (articulated chain),
commissioning fits its parameters, programs compile through it — "learn the parameters
that have no closed form; compute the ones that do."

**THE PHONE'S SECOND FIELD ROUND (§42 addendum) — four defects in an hour of the owner's
hands, three mine, each measured before it was fixed.** (1) **The thinned identification
grid**: the page identified K̂=1.47/Ê=0.0525 on a K=1.00/E=0.06 machine. Reproduced in
Node to the digit and isolated three ways: 900 samples + thinned ladders lands in the K/E
compensation valley (1.469/0.0525); the SAME record over the full ladders is EXACT (J=0);
the FULL record with the thinned grid is still wrong (2.125/0.0475). The thinning was the
whole defect — the coarse pass had dropped E=0.06 from the search and the refinement rings
cannot walk back across a valley. The page searches every ladder rung now, and the twin
test gained a soft-machine identification phase over the page's exact ladders, because a
stiff-only test passed before and after the bug. (2) **The twin's buttons stayed live
during ⑨'s 18-minute run** (`idle` never carried `autoComm`) — two commissioning drivers
on one live arm. Locked out now, under every commissioning. (3) **"Demo banks: failed —
call build() first"** on the phone's ⑨: convicted by elimination — the Node ladder at the
same config runs ②b clean (1.7692e-1, 224 fitted), a headless browser pressing ⑨ alone
runs it clean (224 fitted, 9 min), and the one thing the failing run had that neither
reproduction has is the concurrent twin commissioning that defect (2) permitted; the
combination is now impossible, and the demo-banks line reports rather than hides if it
ever recurs. (4) **⑨ force-loaded K 1 / E 0.06** ("I can change the sliders and then when
I hit the button it forces the sliders back") — a leftover from the ⑧ demo arc: the
one-press now commissions the machine and program ON SCREEN, the hint says where the
measured 22.42x machine lives instead of silently substituting it, and ⑧'s setup button
keeps the substitution because substitution is that button's stated job.

**THE MODE-⑨/⑩ END-TO-END TRACE ("performance is still e-1 and not the e-3/-4 seen in
Node") — the page was innocent, the units were part of it, and TWO artifact defects were
the rest.** A headless tracer (`test/_trace10.mjs`) pressed the owner's exact sequence on
the real page at K=1/E=0.06 and compared every stage against Node at the same machine.
The stages agreed to the digit: identify K̂=1/Ê=0.06 exact (J 2.5e-5), compile sim rms
1.72e-3 both sides, delivered laps 2.51e-2 / 9.43e-2 / 1.22–1.24e-1 flat against Node's
clamped reproduction 2.49e-2 / 9.48e-2 / 1.25e-1 — no wiring loss anywhere. Three
findings, in size order:

1. **The Node e-3/e-4 was the STIFF machine.** Every seam-round bench ran the rig default
   K=16/E=0.15 while the phone ran K=1/E=0.06; on the soft machine the same laps-3
   artifact delivers 1.26e-1 tiled — the owner's e-1 exactly. Rule 31 applied to a
   BENCHMARK: a validation is a constant too, and it was carried across plants.
2. **The 0.4 clamp is ⑧'s DQ_CLAMP defect in a third costume.** The twin's du carries
   the whole wind-up droop, which scales as 1/K: measured duPk 1.84 rad at K=1 against a
   0.4 constant — the correction ran at a fifth of its size through the pre-roll (the
   flex never loaded) and lap 1 paid 5x (2.5e-2 against 5.3e-3), the live probe pinned
   at 0.400. Both page sites now clamp at `pilotUMax()`, the page's one authority
   definition, which tracks the same 1/K physics (cap 2.0 at K=1, 0.15 at K=16, both
   above the measured need).
3. **The finite-window compile never becomes periodic, so no tiled lap can be right.**
   The consecutive-lap du difference PLATEAUS — 6.5e-2 → 2.4e-2 → 3.0e-2 on the laps-5
   artifact — because the transient's non-lap-harmonics leak corrections across the
   whole window; tiling any lap injects that difference every lap. Compiling more laps
   alone reached 5.6e-2 (from 1.26e-1); the tile had to be fitted as a PERIODIC object.
   `refineCompiled` (lib/pilot/twin.js): simulate the tiled correction, average the
   delivered truth at matched lap phase over every tiled lap but the handoff's, invert
   through H at each lap harmonic (same Tikhonov solve), damped step, monotone guard —
   HFF's shape run in software against the twin. Measured on K=1/E=0.06: **tail
   5.6e-2 → 4.3e-3 contour, joint 2.8e-4/5.2e-4 sustained over 8 laps, flat** — 100x
   over the open loop's 4.4e-1, and better than the artifact played straight (the
   periodic fit beats the transient-contaminated original inside its own span). Laps 3 +
   refine converges within 6.7% of laps 5 + refine but with a 2.3x worse handoff lap —
   outside rule 42's band, so laps 5 ships. `applyCompiled` also now tiles the
   PENULTIMATE compiled lap (identical at laps 3) and refuses an artifact too short to
   hold a middle lap.

The trace also scored ⑨ on the same machine end to end: ladder deployed the cascade
alone (classic withheld by measurement), delivered 5.7e-2 = 7.6x, consistent with its own
rung table — no ⑨ divergence.

**§43 — THE OWNER'S NEXT DIRECTIVE: ⑩ BECOMES FULLY LEARNED, KINEMATICS AND DYNAMICS
BOTH.** No analytic ik/fk/Jacobian anywhere in ⑩'s chain (refs from the learned inverse
map, truth through the learned affine observer — the ⑥ routing), and no structure
template either: the SIMULATOR the compile iterates against must itself be learned from
commissioning data, so the K/E ladder search disappears and commissioning becomes
gather + wander + probes. The honest prior art: §41 convicted windowed FEEDFORWARD maps
(memory 6363–8649 steps > a lap; closed paths alias their history) but never closed the
AUTOREGRESSIVE free-run class, which propagates state and is a simulation in §41's own
sense; the probe-constructed kernel thread (falsifiers 33–38) reached near-signal on the
elbow (4e-3) with the shoulder broken (8.8e-2). Both halves are being measured at the
canonical cell before any page wiring: the learned-chain kinematics bench
(gather 60 pts, holdout 7.5e-3 rad at K 0.25/E 0.03) and an AR free-run model-class
screen (fit on wanders, free-run seeded at the model's own fixed point — no tracker at
load — scored on the sharp program it never saw).

**§43 MEASURED — the two halves, both at the canonical cell, both bounded by their own
models, and every bound now a number.**

*Kinematics half (learned refs + affine-observer routing, structure twin underneath):*
first bench delivered 8.9e-2 contour on a gather whose degree-7 fit was
near-interpolating (45 training rows, 36 terms — holdout 7.5e-3 rad); the soft phase's
MEASURED config (45 pts, degree 5) improves the map to 3.0e-3 rad and the delivery to
**6.9e-2 — still 2.7x behind the analytic chain's 2.55e-2, and the gap is the map's AIM**:
the routed truth is nulled equally well (3.5e-3 vs 3.1e-3 joint) but the learned truth
cannot see the map's own error, because the map is its anchor. The learned-kinematics ⑩
reaches parity when the map reaches ~1e-3 rad; the adapter ships as `learnedChain` in
`lib/flexisim/twin.js` (chain-parameterized drivePath/twinResponse/armSimulators,
analytic path byte-identical when omitted).

*Dynamics half (no structure template at all):* five sweeps and two compiles, all on one
cached record set (6 wanders + holdout + program truth, 12k fit samples).
ONE-STEP IS NEVER THE QUESTION — 0.001-0.003 everywhere. FREE-RUN is:
plain AR diverges at light ridge and is bias-dead at heavy (0.4-0.8); leaky-integrator
states NULL; commanded-motion hysteresis states NULL; the corner-regime licensed-weight
split — the cure that fixed the FORECAST elbow — NULL in free-run form; scheduled refit
DIVERGES. What moves it: **dropping the e-feedback entirely** (input-only FIR — free-run
is one-step, stable by construction; §41's conviction of windowed feedforward was at
memory-truncating windows) and DATA — FIR L=384 at 12k samples reads **0.18 shoulder /
0.53 elbow** on the program never seen, the elbow's best by 30%, and L=780 wins on
wander (0.27) while breaking on the program — the deep window does not transfer.
**v0 compile (H from the model's own step response): 0.4x — WORSE THAN NOTHING.** A held
2e-3 step is outside the wander distribution; the compile inverted a fictional response.
**v1 (H probed on the REAL machine at commissioning — held ref steps, tracker on,
commissioning-legal — learned model only for the FREE response, superposition
simulator): 4.4x delivered, flat over 8 laps (2.56e-1),** landing exactly at the free
model's residual — the delivery equals what the model cannot predict, to the first
digit. H's pose sensitivity centre-vs-program-start is 3.2% rms, so ONE commissioning
pose suffices.

**WHERE ⑩-FULLY-LEARNED STANDS: 4.4x against the structure twin's 44x, and the whole
gap is one number — the elbow's free-response NRMSE (0.53).** Compile, refine, tiling,
clamp and H all transfer; nothing else binds. The measured leads on the elbow: the
parked probe-constructed kernel thread (falsifiers 33-38) had the OPPOSITE channel
split — elbow near-signal, shoulder broken — so the superposition-of-move-kernels free
model is the complementary route; and the wander is the excitation the FIR is fitted on,
which covers the program's corners exactly as poorly as the pilot's scribble did (the
§§9-17 lesson from the forecast side, now in free-run form).

**§43 CONTINUED — THE 50x DIRECTIVE, AND WHERE THE CAMPAIGN CLOSED.** The owner's bar:
50x, fully learned. The march from 4.4x: corner-rich records NULL for free-run (unlike
the forecast side); sign/friction features marginal; then TWO real mechanisms — the
mid-segment residual is SLOW (0/1 zero crossings, smooth ramps: the nonlinear droop
surface a linear kernel can only linearize) and **the commissioning excitation never
reached the program's workspace** (wander reach 4.2, polygon max 3.8, the square's
half-diagonal 5.66 — the FOURTH "calibration must span the range"). A workspace-spanning
corpus + a degree-5 pose polynomial: free-run **0.071/0.309**, and **v2 DELIVERS 5.6x**
(2.03e-1 flat). But v2 captured only a third of the model's improvement, and the gap
instrument said why: **the model-vs-machine gap ON THE CORRECTED RUN is 96% of the
corrected error** — rule 34: the model is scored open-loop and consulted at q+du.
**REACHING THE CORRECTED REGIME THEN FAILED FIVE INDEPENDENT WAYS, and the failures are
the finding**: three injection designs (OU noise, slew-limited, piecewise-held — even a
HELD 1.2 rad du displaces the machine off-path, truth 0.3-8 rad, because an arbitrary du
cancels nothing) and two bootstrap rounds (model-compiled cancelling corrections for the
spanning excitations at full and half gain — every one measured WORSE than open, all six
REFUSED by the machine-vouching gate; the refit control held at 5.6x). The coupling is
structural: visiting the corrected regime safely needs a model of the quality the visits
are meant to buy. The program compile survives it only because refine+tiling squeeze the
periodic case; the deep-lag L=780 cell separately measured §41's aliasing live (transfers
on open wanders, breaks on closed laps).
**THE FORK, STATED FOR THE OWNER (rule 59):** (A) a stronger model class — nonlinear
state-space fitted by simulation-error descent, or the kernel/primitives route — genuine
research, uncertain at the softest-nonlinear cell, unbounded weeks; or (B) a GENERIC
articulated-chain template with EVERY parameter fitted by output error (masses,
stiffnesses, damping, friction, backlash — §42's product form with nothing supplied but
the structure CLASS), which reaches 44x by construction and is days. What would change
the answer: a measured free-run at ≤0.05 NRMSE both channels from any learned class.

**THE OWNER CHOSE: B NOW, A IN BACKGROUND — and B's ladder is measured
(`test/_dyntemplate.mjs`).** The rigid-link lumped template (12 minimal identifiable
parameters — Ia/B/J2/two gravity levers plus the joint set, the EMPS IDIM-LS
discipline — fitted by H-staged output error on one wander, all machinery reused: Joint,
ChainServo, the verified rigid core) fits to J 4.6e-4 in 2 minutes of pattern search and
delivers **5.2x** — the same band as the generic learned model's 5.6x, and its open
free-run (0.209/0.343) does not decide that: the structural-extrapolation advantage the
lattice class shows under correction does NOT materialise in a class that lacks the
dominant physics. At E 0.03 the LINKS are the compliance, and no rigid-link fit carries
their distributed dynamics. **The B-ladder at the canonical cell: rigid-lumped 5.2x /
generic learned 5.6x / lattice-class template 44x — the whole 8x step is the link-flex
representation.** So B completes as the LATTICE-CLASS template with MORE parameters
freed: "the links are slender elastic beams" is a structure-class declaration of the
same epistemic status as "rigid links + springs", §42 proved K/E identification exact,
and the running experiment asks whether output error stays sharp when link damping and
backlash are fitted too (they were known constants). The lumped template stands as the
measured no-lattice lower bound, and A's falsifiable target is unchanged: any learned
class at ≤0.05 free-run NRMSE replaces the lattice.

**B MEASURED END TO END (`test/_dynlatt4.mjs`): the 4-parameter identification
CONVERGES TO TRUTH and the fitted template DELIVERS 33.3x.** Output error over
{K, E, link damping, backlash} from one 900-sample wander: K 0.2480 (truth 0.25),
E 0.02977 (0.03), damp 3.00e-3 (EXACT), backlash insensitive (§42 stage B already
measured backlash-ignorance free) — J 1.5e-6 in 26 lattice evaluations. **AND THE
2-PARAMETER FIT IS NOT JUST LESS LEARNED, IT IS WRONG OFF-SANDBOX**: the K/E grid with
damping held at a wrong guess misidentifies (K 0.19 / E 0.0375) — the page's current ⑩,
which fixes damping at the known value, would do exactly this on a real machine.
Delivered on the true machine at the fitted parameters: **3.4e-2 flat, 33.3x** against
the exact-parameter oracle's 44x — the 0.8% identification error costs ~25%. Tightening
the search 7x in J moved delivery 0.6% (33.5x): NOT precision. The attribution run —
truth parameters through the template's own constructor — delivered **44.0x, byte-class
equivalent to the oracle** (rule 21's control), so the gap was parameter error alone,
and the identification RECORD was the cause: the fit wander ran at reach 4.2 against
this section's own coverage rule. **On a spanning 1500-sample record the fit walks to
K 0.8% / E 0.2% / damp 1% and DELIVERS 44.5x — the fitted template now matches the
oracle** (2.55e-2 flat, lap 1 at 2.65e-2). The compensation ridge rotates with the
record (K and E swapped which is off), which is why coverage, not search precision, was
the binding constraint — the FIFTH appearance of "span the range".
**ROUTE B CLOSED. The canonical-cell ladder, final form: generic learned 5.6x /
rigid-lumped 5.2x / fitted lattice template 44.5x delivered / oracle 44.0x.** What
shipped next: ⑩'s page commissioning moved from the 2-parameter fit (measured WRONG
under a mis-guessed damping) to the 4-parameter spanning fit, with `refineParams`
LINE-SEARCHING each key — a single step per round was measured STEP-STARVED (the soft
cell's grid bias is 1.85x in E and two single-step rounds reach 1.17x; it stuck at
K 0.72 / E 0.092 on a 1 / 0.06 machine, recovered to 0.983 / 0.0601 with the line
search, delivery 7.5e-4 flat at the FITTED machine). Route A stays open at its bar.
**AND THE "4x PIPELINE GAP" THIS SECTION CLAIMED WAS A UNITS CONFUSION (rule 17,
corrected here where it was written): at truth parameters sim(ref.f) and the real
corrected run agree to 0.00e+0 — the pipeline is EXACTLY faithful — and the "gap"
was tool-space contour (2.55e-2) read against joint-space residual (3.3e-3), which
are the same number through the kinematic lever.** Past 44x therefore means shrinking
the refined artifact's own residual — **and five routes into it are now measured NULLS,
with the target quantified**: opening the cutoff/lambda (every opened cell reverted to
the guard; the shipped cell is the only improving one); fitting the tile on settled
laps only (`skipLaps` 3, window 7: 3.11e-3 vs 3.12e-3, 44.4x vs 44.0x — noise; the
option ships, default 1, byte-identical); probing H at the correction's own amplitude
(H(0.3) is 14.7% from H(2e-3) and refining with it is WORSE, 40x); and per-harmonic
step gains in two variants (HFF's design — worse both times, 40x, reverted with the
control reproducing 3.12e-3 exactly). **The decisive instrument: the corrected
residual REPEATS lap-to-lap to 4.3e-4 against the 3.1e-3 the refine leaves — 7x of
correctable headroom exists** — and the nulls together say the offending harmonics are
PHASE-wrong in the small-signal H around the 1.9 rad corrected orbit: a direction
error regresses at any positive gain, so no damping schedule can take the headroom.
The stated next route (rule 59): a per-harmonic SECANT Jacobian estimated from the
refine's own iterates (quasi-Newton in the frequency domain), which corrects direction
rather than step size.

**THE SECANT ROUTE IS A NULL, AND SO IS THE ONE AFTER IT — the refinement null-chain
is now six long and every entry stalls at the same number.** The per-harmonic
secant/Broyden Jacobian (diagonal complex gains learned from the refine's own iterates)
delivered **40.7x** and never matched the shipped refine's 3.12e-3 tile. Read as: the
per-harmonic CLASS is the fault, not the step law — a nonlinear du-response transfers
energy BETWEEN harmonics, and any block-diagonal inverse chases a residual it moves
somewhere else. The cross-harmonic-capable answer, time-domain **software-ILC against
the twin** (DC 2x2 mixing inverse from H's finals, lead from H's half-rise, zero-phase
boxcar, backtracking gain, up to 60 simulated laps — zero machine laps, §42's contract
holds), measured tile **3.239e-3 and delivered 42.3x** against the shipped 3.12e-3 /
44.0x, dead flat across 8 delivery laps. Two structurally different update laws now
stall at the SAME 3.1-3.2e-3. That degeneracy has two readings and they demand
different work: (a) the value is a true local optimum of the sim objective for the
periodic-tile class — no optimizer passes it and the tile class is exhausted; (b) all
six schemes share a defect and slope remains. The instrument that separates them is a
DIRECT gradient measurement at the shipped refined tile (rule 23): eval-repeatability
first (is the objective deterministic?), then central differences along random smooth
directions and hat bumps at the residual's own worst bins. Also sized on the way: the
50x directive needs only **1.15x** more tile (3.12e-3 → 2.7e-3) because the delivered
contour tracks the refined tile residual directly — not the 7x to the repeatability
floor.

**BOTH INSTRUMENTS CAME BACK, AND TOGETHER THEY EXONERATE THE PHYSICS AND CONVICT THE
OPTIMIZERS.** The gradient instrument (`test/_tilegrad.mjs`): the sim objective is
EXACTLY deterministic (two evals of the same tile differ by 0.00e+0), so any slope is
real — and at the shipped refined tile every one of six probed directions carries
slope 7e3-8.5e4 times the repeatability floor, the largest at the residual's own worst
bins (hat at ch1's worst bin: slope -2.13e-2, hat at ch2's: -1.89e-2). The residual is
CORNER-CONCENTRATED — the worst bins are two of the square's corners at 4-5x the rms —
and the tile is NOT at a local optimum: six schemes stalled at one value because all
six step in wrong directions (the phase-wrong small-signal H), not because the
objective is exhausted. And the backlash hypothesis is DEAD (`bench-nobl`): the
identical pipeline on a backlash-free machine compiles 5.89e-3 against 5.90e-3,
refines 3.105e-3 against 3.12e-3, delivers 44.4x against 44.0x — the dead zone costs
nothing measurable at the canonical cell and cannot be the wall. What follows from a
deterministic objective with surviving slope: every eval is a PERMANENT constraint, so
the optimizer that fits is subspace Gauss-Newton — probe M directions by central
differences (residual-weighted hats at the corner bins plus smooth broadband), collect
the MEASURED response columns J·D_i, solve the ridged least squares for the step in
the probed subspace, backtrack, re-centre, with the predicted residual printed BEFORE
each step so the machine grades the local-linear model (rules 16, 27). Running as
`test/_tilesgn.mjs`.

**THE OPTIMIZERS CONVICTED THEMSELVES IN ORDER (`_tilesgn.mjs`, `_tilesgn2.mjs`,
`_tilelvo.mjs`), AND THE LAST ONE TAUGHT THE REAL LESSON.** Subspace Gauss-Newton v1
(20 fresh probe directions/round, 4 rounds, 165 evals): tile 3.109e-3 → 2.876e-3 with
the linear model verified to 0.4% at full step, and **delivered 45.9x — the first
number past the shipped 44.0x** — transfer efficiency ~85%, so 50x needs tile ~2.6e-3.
Column accumulation (v2) matched v1 at 60% of the evals and was stopped as legibly
inferior once the operator route opened: fresh directions deplete because after the
corner-concentrated part is taken the residual spreads over MANY directions (~1%/round,
both variants). The LAP-VARYING OPERATOR (hat-bump kernels at 8 nodes placed at the
corners and mid-edges, hat-interpolated between nodes, whole-tile Gauss-Newton by CG on
the implicit operator): kernel support measured at 50%/121 bins, 99%/342 — long, as the
900-sample memory predicts — and the whole-tile solve took the tile to **2.689e-3 in 45
evals**, past everything. **AND IT DELIVERED 44.0x — NO TRANSFER (rule 21).** The
sim-objective improvement below ~2.8e-3 lived in the EVAL'S OWN BINNING: at 1024 bins
over ~817 samples/lap the 4-lap eval has ~2.4 samples per bin, and a whole-tile update
with bin-scale freedom can game that aliasing without touching the machine — SGN's
smoother few-direction steps could not, which is why its worse tile delivered more.
The objective must not be gameable at a resolution the machine cannot see: v2 of the
operator bench runs 512 bins, a first-difference smoothness penalty in the CG, an
out-of-config 8-sim-lap holdout printed each cycle, and the delivered JOINT rms beside
the contour so the transfer gap is measured rather than inferred.

**LVO v2 CLOSED THE ALIASING AND THE TRANSFER INSTRUMENT PAID FOR ITSELF TWICE
(`_tilelvo2.mjs`).** With 512 bins, the first-difference penalty and operator REFRESH
between step groups (v1's depletion was operator staleness: a refreshed operator's
first step took 7.3% where the stale one's last took 0.2%), the tile went 3.101e-3 →
**2.549e-3** in 181 evals, the 8-sim-lap holdout matching the 4-lap objective to 0.1%
at every cycle. Delivered: **47.7x** — and the instrument line settles where the
missing 4x went: **delivered joint rms 2.543e-3 against sim tile 2.549e-3 — the twin
transfers EXACTLY (0.2%)**. The gap to 50x is not sim-to-machine, it is JOINT-TO-TOOL:
the optimizer minimizes equally-weighted joint rms, the score is the contour projection
through the Jacobian lever, and the residual's lever ratio drifted 8.2 → 9.3 — the
solve parks error in the components the score punishes hardest. v3 therefore evaluates
residual AND kernels in TOOL space (per-bin 2x2 Jacobian, precomputable because the
bins align to program phase exactly), which the harmonic rung could never do — "the
projection onto a rotating normal is itself a lap-varying operator" is no obstacle to
an optimizer whose operator is lap-varying by construction — and warm-starts from v2's
checkpointed tile.

**v3 PASSED THE OWNER'S BAR: 53.6x (`_tilelvo3.mjs`).** Same machinery, one change —
the residual and the kernels are evaluated in TOOL space through the per-bin Jacobian
(precomputable because the tile's bins align to program phase exactly), so the
optimizer minimizes what the machine is scored on. Warm-started from v2's tile, four
refresh cycles, 163 evals: tool tile 2.674e-2 → **2.298e-2**, every holdout within
0.9%, and delivered **53.6x over the open loop** (contour 2.12e-2 steady over the
last six laps) with the transfer instrument again exact — delivered tool rms
2.306e-2 against sim 2.298e-2, 0.3%. The full arc from the six-null wall: shipped
44.0x → subspace GN 45.9x → operator-joint 47.7x → operator-tool **53.6x**, at
unchanged authority (duPk 1.92 against the 2.0 cap). Two lessons carried the arc: an
objective must not be gameable at a resolution the machine cannot see (rule 21's
costume), and it must WEIGH what the score weighs (the Path tab's own
corrected-for-both-scored-on-one, from the other side). Promotion to
`lib/pilot/twin.js` as `refineOperator` — plant-agnostic, the projection supplied by
the adapter — is the next work item.
(`test/_dynssm.mjs`).** The campaign's reading was that the generic learner lacked two
tools — stable deep state and rollout-error fitting. Both were built and provided: a
contraction-GUARANTEED nonlinear state-space (x' = g·x + (1−g)·tanh(Wx+Uu+b), g on a
time-constant ladder to 2000 samples, W's rows projected each update so
g + (1−g)·||W||₁ ≤ 0.999 — provable ∞-norm contraction, not regularized-and-hoped) fit
by full-record BPTT, where the model is input-driven so the training loss IS the
free-run error — no teacher forcing to hide behind. Warm-started statics, 18 records,
48 states. Result: prog [0.37, 0.57], w3 [0.44, 0.62] free-run NRMSE — AT the FIR wall.
Adding a 128-tap FIR block to the readout (state only has to carry what the window
can't): prog [0.33, 0.43], w3 [0.47, 0.46] — the elbow lands ~10% below the FIR-alone
wall. The two tools bought 10%, not 10x, against a bar of 0.05 — while the
4-parameter lattice-class template, driven by the SAME commands, sits near-exact on
both channels. What the generic class lacks is the CLASS, not state or the fitting
objective: the falsifiable bar stands (any learned class at ≤0.05 free-run NRMSE both
channels replaces the lattice) and route A goes back to background.

**THE CANONICAL BENCH (owner's standing rule: softest arm, sharp corners — K 0.25 /
E 0.03, the sharp square).** The twin pipeline in the shipped config, first measurement
at the cell that cannot flatter: open loop 1.13 contour; ⑩ lap 1 **2.65e-2**, tail flat
**2.55e-2** from lap 3 — **44x sustained, lap-1 accurate**, at the softest gearbox on the
program whose corners carry 61537% of the declared jerk. Two things the cell exposed:
**duPk 1.93 rad against the page's 2.0 cap** — the twin uses 97% of its authority here,
so the cap is nearly binding and any softer plant or faster feed will clip; and **the
refine bought only 7%** (3.35e-3 → 3.12e-3) because the delivery sits at the compile's
own residual (sim rms 5.9e-3) — at this nonlinearity the LINEAR deconvolution is the
wall, not the tiling. The delivered tail equals the refine's own measured residual, the
same at-its-bound signature as the pilot's forecast bound (brick 55): the next factor at
the canonical cell comes from a better inverse, not from more laps or more iterations. `test/flexisim/twin.test.mjs` gained the shipped-config
soft-delivery phase (laps 5 + refine on K=1/E=0.06, tail ≥ 15x under open, no drift);
the tracer is kept as `test/_trace10.mjs` beside `_pagepress.mjs`. **What remains
honestly open:** the page's lap-1 number with the cap fix is predicted (~7.7e-3 contour)
but not yet re-traced on screen; and the tool-space contour at the soft config floors
near 4e-3 while the stiff machine reached 1.4e-3 joint — whether that floor is the
compile's residual or the backlash this tab carries is unmeasured.

### The eight targets, restated (replacing the stale table above)

| target | state |
|---|---|
| 1 program-agnostic (1.3x) | **the price the claim owns is MET (§36): 1.21x/1.10x against the self-fit ceiling, same instrument** — the residual degradation (2.55x worst-row, from 3.65x) is program hardness no diet reaches, not transfer |
| 2 feedrate-agnostic (1.5x) | **MET — all three programs** (1.16 / 1.49 / 1.14) |
| 3 plant-agnostic | six plants, honest refusals, the 1.1x threshold law |
| 4 commissioning in minutes | one gated layer + guided laps replaced 3-layer cascades |
| 5 higher | EMPS 14.8x → 55.5x; arm composition 2.2–2.5x on its hardest program |
| 6 PLC scan | **CLOSED (§35)** — `scanCost()` composes QP + forecast + router + RLS; the full composition fits 10% of a 1 ms scan sliced (9,380 of 10,000), contract in `scancost.test.mjs` |
| 7 breadth | achieved as reframed; the barrel flips helpful under adaptation |
| 8 a rival | **measured twice — the two-regime PathILC verdict (§33), and the owner's truth-free Kalman rival (§34): engineered full 1.01–1.13× against the frozen composition's 2.87–7.72× after §36's scale repair** |
