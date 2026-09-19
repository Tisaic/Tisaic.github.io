# THE ROADMAP — what has to happen to make the north-star claim TRUE

**WHAT THIS FILE IS.** The north star is *wire it up, press one button, use it — on any dynamical
system, for any program it is later asked to run.* This file is the SEQUENCE from where the record
actually stands to a claim that sentence supports, with a falsifier on every step.

**WHAT IT IS NOT, because this project has three documents that could each drift into being the
others (rule 30).** `docs/plan.md` is the measurement RECORD — what was tried, what it measured,
what was retracted. `docs/scorecard.md` rates ten COLUMNS against the incumbent and orders them by
gap size. This file orders by **what blocks the CLAIM**, which is a different ordering and says so:
the scorecard's largest gap is INT at −6 and that file itself calls it *the one that does not
matter*. **Every number here is a citation, never a re-measurement.** Where this file and the
record disagree, the record wins and this file is what is wrong.

---

## Where the claim stands, part by part

Five parts, and the honest reading is that **the product-shaped half is in better condition than
the headline suggests and the calendar is what is not.**

| Part of the claim | Status | THE ONE THING that would move it |
|---|---|---|
| Completely self-tuning | **SUPPORTED** | nothing — this is the strongest thing here and the work is to not break it |
| PLC memory and CPU | **MET for what ships** (8-330 MAC/decision, 0.7-1.8 kB, `artefact.test.mjs` bit-identical) | the COMMISSIONING arithmetic, which the PLC-only rule also binds and which has never been costed as sliced background compute |
| Reusable across plants | **6 of 11 rows ship the deployed object, 5 the conventional rung, 0 the cascade, none made worse** (§115, scraped) | nothing on the plants already asked — this is the portfolio working. It moves by a plant nobody here chose |
| Robust and tolerant | **CONTRADICTED on two plants — and both contradictions belong to `pilot.js`'s GATE, which ships on 0 of 11** | the OBJECT's own diet-draw distributions on the plants where only the TEACHER was ever spread (§84.8, §87.3 did four; the rest are unmeasured) |
| Linear AND nonlinear alike | **four error classes of four tried** | a fifth class. Hysteresis (Bouc-Wen) is the named gap and is a vendoring problem, not a controller one |

And eight targets, of which one is badly missed and it is not the one the table above leads with:

```
  1  program-agnostic     5 of 11 MET, 1 made WORSE       the DIET is NOT the lever below the split (§122);
                                                        the teacher-free object is (barrel 0.941, §120)
  2  feedrate-agnostic    MET inside its bound, 1 plant   never asked on plant 2
  3  plant-agnostic       improve-or-refuse on 10 of 10   holds
  4  commissioning        MET on 2 of 8 unbudgeted; 3.1 and 3.8 DAYS on the two 30-day plants
                          under plantBudget (§120), at 1.66x and 2.8% of the factor   <-- a priced trade now
  5  higher not merely    arm ships 8.23x past the 7.70x bar          met, re-scoped
  6  PLC scan             met for the deployed object     the fit is scoped, not closed
  7  breadth              both standing refusals closed   met
  8  vs the field         3 admissible rivals, 1-2 axes   not a field
```

---

## The four gaps, in the order they block the claim

### GAP 1 — COMMISSIONING TIME. The only gap that makes this unsellable rather than weaker.

Target 4 is met on 2 plants of 8 and **the misses are 30.0 and 33.3 DAYS of plant time** (§72).
Nobody stops a distillation column for a month. Every other gap on this list makes the product
worse; this one makes it unbuyable, and it is therefore first whatever the column ratings say.

**The lever is measured and unpriced.** The teacher is **74-89% of the bill** (§73.13) and ships on
zero plants. §117 established on the cart-pole that the teacher-free `①d` rung placed FIRST recovers
the route's full standalone capability **exactly** — 8.8017e-3, bit-identical to `dirinvall.mjs`'s
own instrument — and that the whole ladder above it then correctly refuses, so the block ships ①d
alone at **ZERO teacher laps**. §105 already measured that route standalone on both expensive
plants: **barrel 4.641x median, column 3.652x median** over four seeds, against teacher-taught
7.00x and 3.96x — overlapping distributions at no teacher cost.

**DONE (§119): on both plants ①d lands inside the standalone distribution through the one press —
barrel 4.21x, column 3.85x, zero teacher laps — and the TAUGHT rung still wins on both, 7.00x and
3.96x.** Placement is inert (the conventional rung refuses on both). On the column the two objects
are 2.8% apart and the teacher is 26.3 of 32.1 days; on the barrel the teacher is worth 1.66x.
**AND CLOSED AS A CALENDAR (§120): with a 3-day `plantBudget` the barrel commissions in 3.1 days and
the column in 3.8, shipping ①d, every skipped rung stated — 11.4x and 8.4x less plant time for
1.66x and 2.8% of the scored factor, and on the barrel's held-out changeover the cheap object is
1.44x BETTER.** Gap 1 is no longer *unbuyable*; it is a priced trade.

**WHAT IS STILL OPEN IN IT, STATED SO THE GAP IS NOT READ AS CLOSED.** Two things. **(a) The
excitation is now the bill — and carrying the plant across it is clean on the column and VOID on
the barrel (§123)**, so the lever is one plant's: under the budget ①d's open-loop segments are **61-67% of the plant
time** (column 2.5 days, barrel 45.8 h), and §105 already measured why — the route makes SEVEN
`fresh()` calls, each pre-rolling a settle, 68% of its own cost — and §72 already built the lever
for the teacher (`distilkit.carrier`, 64% of every call) and never applied it here. That is a
factor of about three on the calendar with no controller change, untaken. **(b) There is no bar
before the teacher runs.** Unbudgeted, the column still pays 26 teacher-days for 2.8% of factor,
because rule 42's band is applied WITHIN a rung and never ACROSS rungs with the calendar as the
cost. §119 names the only bar on record — ①d's own machine score — and nothing consults it.

### GAP 2 — PROGRAMS THE COMMISSIONING DID NOT SEE. 5 of 11.

Target 1 is the second half of *for any program it is later asked to run*, and the record already
predicts which plants miss: §84.9's `prog/rise` — how many of its own response times a program
contains — splits at about ten on nine plants, and **every plant above the split meets the bound
while every plant below it misses** (column 7.6, barrel 5.2, quad tank 7.9).

**The repair is not a better map and the record closes that door from two sides**: §52.31's
information ceiling (R² 0.894 measured / 0.931 extrapolated against a shipped fit of 0.856-0.870)
and §54.9's five function classes, where nothing beats the linear ridge. **The repair is a DIET, and
it is demonstrated twice on plants sharing no physics** — §106 took the real arm's two harmful
programs to 1.134x and 1.128x with 0 of 4 made worse **in 0.42x of the commissioning it replaces**,
and §66 is the barrel's whole result. §84.5 prices a diet enlargement at **10-17% per program**.

**AND THE SCRAPE STILL READS ONE PROGRAM MADE WORSE, WHICH IS NOT A CONTRADICTION AND MUST NOT BE
QUOTED AS ONE.** §106 built that repair behind `classicDiet`, **no plant declares it**, and the row
`objtable` reads is the SHIPPED configuration. So the clause is closed as a CAPABILITY and open as a
DEFAULT, and the honest sentence is *the repair exists, is cheaper than the fault, and is armed
nowhere* — which is this list's own argument for generalising it rather than evidence it is done.

So this is a procedure to generalise, not a discovery to make — **AND ON THE TWO PLANTS BELOW THE
SPLIT THAT PROCEDURE IS REFUTED (§122).** `DIETADD` enlarges each diet from its harness's own design
space: the column's teacher DROPS the added recipes (+1, +2 byte-identical to the shipped fit; +4
reads 0.379 at +52% of plant time) and the barrel's held-out changeover gets WORSE on every
enlargement (0.393 → 0.303-0.329). More laps of the same class give a lap-taught object more to
memorise — §49's law on the diet axis. **What moves the ratio is the TEACHER**: the teacher-free ①d
object reads **0.941 on the barrel changeover, MET**, where every taught diet reads 0.30-0.39 (§120),
and on the column it reads 0.304, so the finding is one plant's. The diet repair therefore stands
where it was demonstrated — the real arm's conventional rung, §106 — and does not generalise
downward. The quadruple tank has not been asked either way.

### GAP 3 — THE INSTRUMENT. "SIXTY-FOUR TOUCHES" WAS THE ARM'S NUMBER, AND THE COUNT IS A CONSTANT TO COMMISSION.

§74 read that **64 touches per lap buy what a laser tracker buys** (6.67x against 6.63x), 32 within
2%, reproducing to 0.6% over three draws, and this file called it the best news in the record. It
had never been asked on a second plant because `distilProbePts` lived in `autohost.js` alone.

**Asked (§121), the second plant refuted the knee.** `probeRuns` in the shared kit puts the same
degradation on every harness, and the COLUMN reads **0.47x of the tracker at 64 touches with `hff`**,
0.59x with the parametric teacher, non-monotone below, recovering only at **256-512 — `hff`'s own
harmonic count** — with **K=128 making a held-out program WORSE (0.543x)**, the first instrument
degradation here to harm transfer. So the knee is the TEACHER's identification bandwidth: the arm's
oracle teacher reads the record as a target and never identifies from it, which is why 64 sufficed
there. *Sixty-four, whatever the part* is withdrawn.

**What survives is smaller and is still the product statement**: a touch probe commissions this
object on both plants once its count is swept ON THE MACHINE like every other constant — at K=512
the column reads 4.07x against the tracker's 3.96x. That makes the count a LADDER AXIS (the ridge
and the gain already are), and no harness has one. NOT reached: the barrel, and the `ORACLE=1` route
on any plant harness — `oracleConverge` reads the harness `drive` directly and is not wrapped, so
three runs launched under it were a vacuous control (rule 9c).

### GAP 4 — NOTHING HERE HAS EVER MOVED A MACHINE.

**Every plant in this project is a simulation and three merely have real PROVENANCE** (§55). That is
not a caveat to carry; it is the largest single risk to the whole claim, and §55 is also the reason:
a plant identified as a linear ARX sits INSIDE the conventional rung's own hypothesis class, so its
factor measures the class rather than the machine — proved by the collapses when the documented
nonlinearity is restored (**2012x → 6.5x** on the tanks, **1364x → 89.8x** on the exchanger).

**No item in gaps 1-3 reduces this risk by any amount.** `docs/edm.md` is the route and is scoped
before any measurement exists, deliberately so the predictions can be read against what happens:
the FINISHING pass is this method's own shape — a repeatable geometric error on a repeated contour
with the CUT PART as the commissioning truth, which is gap 3's answer arriving for free — while
ROUGHING gap regulation is stochastic and the gate should REFUSE it.

---

## The sequence

Ordered by dependency, not by prize. Every step names what would kill it, because a step that
cannot fail is a preference (rules 25, 59).

**1. The teacher-free route where the calendar is — the BARREL and the COLUMN.** (task #91 — DONE, §119)
Arm `dirInv` + `DIRFIRST` the way `distil-pend.mjs` does, window from `deriveWindow` on a MEASURED
settle, three configurations per plant (unset byte-identical, `DIRINV=1`, `DIRINV=1 DIRFIRST=1`).
*Makes it a result:* the ladder ships ①d alone on a plant whose teacher costs weeks, inside the
teacher-taught distribution. *Kills it:* ①d refuses, or lands below that distribution's floor, or
the conventional rung still wins — in which case the placement is free and worth nothing, and that
is publishable too.

**2. The calendar as an input.** (task #92 — DONE, §120) §119 said the teacher is never thrown
away, so no exit can decide for the customer; `plantBudget` lets the customer decide. At 3 days
the barrel ships 4.21x in 3.1 days (was 7.00x in 35.3) and the column 3.85x in 3.8 days (was 3.96x
in 32.1), every skipped rung stated. Target 4's two 30-day misses are now 3-4 days at a stated
cost in factor. *What is still open:* the excitation is 61-67% of the budgeted bill and re-settles
seven times (§105's untaken lever).

**3. The diet repair on the plants below the `prog/rise` split.** (task #93 — DONE on the column
and barrel, §122, and the KILL branch fired.) The column's teacher drops the added recipes and the
barrel's held-out transfer gets worse on every enlargement; the ratio does not move. What moves it
is the TEACHER: the teacher-free object reads 0.941 on the barrel changeover where every taught
diet reads 0.30-0.39. The tank (conventional rung, own loop) is not asked.

**4. `distilProbePts` into the shared kit, then a second plant.** (task #94 — DONE, §121, and the
KILL branch fired.) `probeRuns` reaches every harness; on the column 64 touches read 0.47x of the
tracker with `hff` and 0.59x with the parametric teacher, `hff` recovering only at 256-512 — its own
harmonic count — and K=128 makes a held-out program WORSE. The knee is the teacher's identification
bandwidth, not the plant's timescale or the map's window. *Sixty-four, whatever the part* is
withdrawn; the touch count is commissioned on the machine like every other constant.

**5. Carry the plant across ①d's excitation segments.** (task #96 — DONE, §123, and the kill
branch fired on ONE plant of two.) The COLUMN is clean: carried seeds within 1.7% of fresh, the
shuffle at 1.000x, and the ladder ships **3.86x in 3.1 days against 3.85x in 3.8** at §120's own
budget. The BARREL is VOID by its own shuffle control on 3 of 4 seeds, raw or dwelled, with the
ambient drift refuted as the cause (`TH_NOAMB=1` still delivers) and the surviving candidate a diet
difference the rig makes silently (`barrelSpec.fresh` ignores the segment). `DICARRY` ships off.
*What it found on the way:* the budget gate admitted a 26-day teacher under a 3-day budget the
moment the excitation got cheaper — it estimates nothing about the rung it admits — which is step 6's
motivating defect.

**6. A bar before the teacher runs — rule 42 ACROSS rungs.** (task #97) Score ①d on the machine, then let the
ladder decline to commission a rung whose calendar is more than the customer's budget when the
cheap object already sits within 5% of the best MEASURED bar. *Makes it a result:* the column ships
①d unbudgeted (3.85x within 2.8% of 3.96x) and pays 0 of its 26 teacher-days, while the barrel still
buys its teacher (1.66x is outside any band) — both halves asserted. *Kills it:* the band picks the
cheap object on a plant where the taught one is later shown to transfer better — the column's own
held-out reads 0.304 against the taught 0.339, so this rule can only be scored on a HELD-OUT program,
never on the scored one.

**7. The probe count as a ladder axis, and the barrel.** (task #98) `probeRuns` becomes a machine-scored ladder
like the ridge and the gain — commission at a geometric ladder of K, ship the cheapest within rule
42's band of the full-instrument row. Wrap `oracleConverge`'s `drive` so the `ORACLE=1` route is
reachable, then run the barrel. *Makes it a result:* every plant that ships the deployed object
states a touch count and a factor at it. *Kills it:* a plant where no K below the lap reaches the
band, in which case that plant needs the tracker and the INS column says so per plant.

**8. Why does ①d transfer on the barrel and not the column?** (task #99) 0.941 against 0.304 (§120), one plant
each. The named suspect is authority: the column's ①d sits at **0.400 of a 0.4 cap on every seed**
(§104), so its held-out reading is clamp-shaped where the barrel's is not. *Falsifier:* `UCAP` swept
on the held-out schedule with the scored program's factor held — if the ratio rises with the cap the
suspect stands; if it is flat, it is the plant and the column keeps its teacher.

**9. One EDM LOGGING run — no controller.** (task #95) The falsifier `docs/edm.md` already names: **LEAD TIME
against the gap's own settling**, readable off records the machine produces anyway (§52.26
transplanted). *Makes it a result:* the first evidence in this project that is not a simulation.
*Kills it:* no lead time, in which case the preview-shaped sub-problem is not there and the doc's
own prediction was wrong before anything was built for it.

Steps 5 and 6 are gap 1 and compose (a carried excitation lowers the calendar of the object the bar
would ship). Steps 7 and 8 are independent of them and of each other. Step 9 is the only one that
changes the KIND of evidence and should not wait for the others. **The program that puts these in
the context of a world-class bar, with the bar stated as measurements, is `docs/program.md`.**

---

## What is deliberately NOT on this list

Each of these is closed by measurement, and re-opening one needs a reason the record does not
already answer:

- **A better MAP of the commanded reference.** Nine capacity experiments, five function classes, and
  an information ceiling measured three ways (§52.31, §54.9). Not *no basis* — **no function class**.
- **Deleting the pilot cascade.** It ships on zero plants and is 4,534 lines, and §90.2a REVERSED
  that recommendation by building the thing that would have replaced it: **the increment generator
  IS the cascade.** What changes is the classification, not the code. *Still open and not on this
  list only because nothing depends on it:* whether a cheaper increment generator exists.
- **A runtime plant-side guard.** §82 built the obvious one and measured it making the failure case
  monotonically WORSE; §100 reached a guard that works exactly as designed and it cost **2.020x →
  1.000x**. The standing criterion is now the finding: score a guard on DELIVERED OUTCOME, and
  *degraded* is not *harmful*.
- **More rivals before a real machine.** Three admissible rivals is not a field, and a fourth
  measured on the same simulated axis does not make it one.
- **INT, the largest column gap on the scorecard.** −6, and that file states why it does not matter:
  an engineer tunes once and leaves it alone, and R² ~0.84 bounds what any explanation could capture.

---

## What would make this roadmap wrong

Stated so it can fail rather than be revised (rule 59):

- **Step 1 refused on both expensive plants** — the first entry here, and it did not fire (§119).
  **The carried excitation moves the delivered factor** — the second, and it fired on the barrel in
  a stronger form than written: the shuffle CONTROL fails there, raw or dwelled (§123), while the
  column is clean. So gap 1's cheap lever is one plant's, and on the barrel the calendar is a trade
  the customer pays in days until a `fresh(s)` that honours the segment settles whether the void is
  the rig's own diet difference.
- **A third plant reads the touch-probe knee somewhere the teacher's harmonic count does not
  predict.** §121's account is one plant's confirmation of one prediction; a plant whose knee sits
  off `2·nh` says the mechanism is not the teacher's bandwidth either.
- **A plant appears where the deployed object's own diet draws produce a harmful deployment.** The
  *robust and tolerant* row is currently re-scopeable because every contradiction on record belongs
  to a component that ships nowhere; one such draw ends that.
- **The EDM's logs show no lead time.** Then gap 4's named route is the wrong first machine, and the
  right response is to find another rather than to build for it anyway.
- **`objtable` or `screen` goes red.** Those two scrapes are the only checks the governing mandate —
  *every plant is a legitimate winner or is struck with a reason* — has ever had. If either stops
  being green, nothing else on this list matters until it is.
