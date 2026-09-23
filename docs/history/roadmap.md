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
| Robust and tolerant | **CONTRADICTED on two plants — and both contradictions belong to `pilot.js`'s GATE, which ships on 0 of 11** | the OBJECT's own diet-draw distributions — §84.8 and §87.3 did six plants and **§136 the last two that ship the object; §136.4 then took the mill to 14 draws and found 2 HARMFUL at an uncommissioned line speed (0.953x, 0.985x), so this row's contradiction now includes the DEPLOYED object.** What would move it is a way to tell a harmful excursion schedule from a good one BEFORE the commissioning — §136.4 refuted the obvious one |
| Linear AND nonlinear alike | **four error classes of four tried** | a fifth class. Hysteresis (Bouc-Wen) is the named gap and is a vendoring problem, not a controller one |

And eight targets, of which one is badly missed and it is not the one the table above leads with:

```
  1  program-agnostic     5 of 11 MET, 0 made WORSE (§129) the DIET is NOT the lever below the split (§122);
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

**AND IT IS NOW FIVE PLANTS OF TEN, WITH THE TWO ADDED BEATING WHAT SHIPS (§126).** The rung was
armed on three plants because three harnesses had been edited, not because the others had been
asked — `dirInvFor` is one shared call and `dirinvall.mjs` carries an entry for every plant. The two
REAL-PROVENANCE process plants now arm it, and unlike the barrel and column the taught rung does
NOT win there: **real cascaded tanks 8.69x/15.9 days → 9.11x/2.6 days shipping ①d ALONE at 46 MAC;
real steam exchanger 89.77x/2.7 days → 104.72x/9.8 HOURS**, 6.1x and 6.6x less plant time for MORE
delivered, target 1 MET on both, nothing made worse. The placement is the whole result on both
(1.03x and 0.01x in the default order, CLAMPED on 37% and 16% of samples — rule 34's signature for
the third time), and the ladder reproduces `dirinvall.mjs` DIGIT FOR DIGIT on all eight excitation
draws. Stated against it: the tanks' ①d is SATURATED at its cap on 4 of 4 seeds, and §105 measured
raising it there as a non-result, so 9.11x is a shipped-authority figure.

**AND THEN THE VERIFY TURNED OUT TO BE THE CONVENTIONAL RUNG (§127).** With the teacher gone the
bill inverted, and 15 of the real tanks' 17 scored runs are rung ① — 65% of the commissioning, on a
rung the machine refuses. Priced from `ClassicFF.plan()` and gated on `spent + estimate`: **the
tanks ship 9.11x in 21.3 HOURS against 15.9 days unbudgeted, 17.9x less plant time at an identical
factor**, and the exchanger still admits the rung and keeps the 1.11x it buys. Gap 1 on the two
real-provenance process plants is now hours and days rather than days and weeks.

**AND EVERY CALENDAR IN THOSE TWO PARAGRAPHS IS UNDERSTATED, BECAUSE THOSE TWO RIGS SETTLED OUTSIDE
THEIR OWN METER (§131).** `fresh()` cost the meter ZERO on both — 2.2 h of tank and 25 min of
exchanger, once per excitation segment and once per scored run — while `dirinvall.mjs` PRINTED *NOT
counted by this rig, so this calendar OMITS its settle* in the same runs and nothing compared the
two (rule 15b). Repaired, every delivered factor byte-identical: **15.9 days is 19.3, 21.3 h is
39.1 h, 2.7 days is 3.1, and the exchanger's 104.72x costs 18.9 h and not 9.8.** The short budgeted
routes are out by 1.84-1.93x and the whole-ladder ones by 1.15-1.21x, which is what a per-`fresh()`
constant does to a route that spends few plant steps, so **§127's 17.9x is really 11.8x** at the
same 9.11x. A budget is a number in plant steps, so the exchanger's rung ① now flips ADMITTED →
SKIPPED at 60,000 and the plant ships 94.70x in 6.9 h; 90,000 buys it back at 104.72x in 18.9 h.
`test/pilot/freshmeter.test.mjs` makes the comparison a check and is asserted to fail on the
pre-repair state.

**WHAT IS STILL OPEN IN IT, STATED SO THE GAP IS NOT READ AS CLOSED.** Two things. **(a) The
excitation is the bill — and carrying the plant across it is clean on the column (§123) and on
BOTH real-provenance plants (§131), and VOID on the barrel alone**: on the two added the carry
removes 38% of the excitation with every SHUFFLE control at 1.000x and ships **9.12x in 28.0 h and
103.94x in 16.9 h**, and the prediction that separated them was written first — the barrel is the
only plant whose diet segments start somewhere other than where its `fresh()` settles. What remains
one plant's is the VOID, not the lever: under the budget ①d's open-loop segments are **61-67% of the plant
time** (column 2.5 days, barrel 45.8 h), and §105 already measured why — the route makes SEVEN
`fresh()` calls, each pre-rolling a settle, 68% of its own cost — and §72 already built the lever
for the teacher (`distilkit.carrier`, 64% of every call) and never applied it here. That is a
factor of about three on the calendar with no controller change, untaken. **(b) There WAS no bar
before the teacher runs, and there is now a calendar one (§124).** The gate prices the rung from the
teacher's own `plan()` and the ladder's own measured scored-run cost before admitting it, and the
estimate is an upper bound on the bill on both plants (1.12x column, 1.18x barrel). What it is not
is rule 42 across rungs: the taught rung's score is what the teacher produces, so the band can only
be read after the teacher has run (§119 reads it: 2.8% on the column, 1.66x on the barrel), and
unbudgeted the column still pays 26 teacher-days for 2.8% of factor. The lever that remains is the
BUDGET being set — a customer states a calendar and the gate holds it — not a bar the ladder
could find for itself.

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

**AND THAT CLAUSE IS NOW CLOSED AS A DEFAULT AND NOT ONLY AS A CAPABILITY (§129).** This paragraph
read *the repair exists, is cheaper than the fault, and is armed nowhere* — true for three sections
and no longer: `classicDiet` is in `realarmLadderSpec` at §106's own winning setting (edges 112/224,
40 laps), so the path `realarm.test.mjs` and `distil-realarm.mjs` both commission through carries
it. **1.93x → 2.25x on the scored program, the worst held-out row 0.877x → 1.367x, made worse 2 of
4 → 0 of 4.** `RA_CDIET=off` reproduces §88.3's numbers exactly. **The 1.3x BOUND is still missed
there** (1.367 against 1.73), so the count stays 5 of 11 MET and what changed is the *none made
worse* clause — which was the binding one.

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

**AND THAT ACCOUNT IS ITSELF REFUTED BY THE ROUTE §121 COULD NOT RUN (§125).** The drive seam is
repaired — the wrap was on a SPREAD COPY the harness's already-built teacher never saw — and on the
column the ORACLE teacher, which does not identify from the record, reads **0.48x at 64 against
`hff`'s 0.47x**: the same knee from two different mechanisms. `2·nh` now holds on one plant of four
and fails on three (arm 64 of 512, barrel 128-256 of 512, and the CART-POLE, the only plant asked
whose `nh` is not capped, at **≤32 of a predicted 260-366**). Three more proxies were tried and
refuted, including this section's own — a longer diet segment makes the column's knee WORSE with the
window held. **The barrel is asked**: 0.45 / 0.46 / 0.14 / 0.62 / 0.78 / **1.19** / 0.93 of the
tracker at K = 8 / 16 / 32 / 64 / 128 / 256 / 512, and the 1.19x is that plant's own drift, which
its `TH_NOAMB=1` control establishes by reversing it to 0.73x.

**What survives is the product statement and it is now narrower**: a touch probe commissions this
object where its count is swept ON THE MACHINE, and **no cheaper proxy for that count exists — four
were tried**. The CART-POLE is the one plant where the shop's instrument is free (11.93x flat from
K=32 to 512). **The LADDER AXIS this gap asked for is refused on two measured grounds (§125)**: a
touch-count candidate costs a FULL COMMISSIONING where a ridge candidate costs a refit — 335 days
of barrel to choose among seven counts, against the 35.3 its commissioning costs — and SCORING a
candidate uses the full instrument by construction, so the axis presupposes the tracker it exists to
avoid buying. It stays a bench instrument. **And the sharpest open risk is new**: under a degraded
instrument the teacher's own score is ANTI-correlated with what it delivers, reporting 22.7x while
delivering 1.71x on the column at K=32 — a 13x lie in the flattering direction, read by the gate
that stops the iteration.

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

**6. A bar before the teacher runs — rule 42 ACROSS rungs.** (task #97) **DONE IN ITS CALENDAR FORM
(§124), AND THE BAND FORM IS NOT A GATE.** The gate now prices the rung before admitting it — the
teacher's own `plan()` per training run at what one call costs the plant, plus the verify at the
ladder's own measured scored-run cost — and skips it when `spent + estimate` overruns. §123's defect
closes: raw-carried, the column reads *39,000 spent + ~504,000 this rung would spend > 43,200*, ships
①d at 3.79x in 2.7 days where the same budget had admitted 34.0 days. The estimate is an upper bound
on the bill on both plants (column 504,000 against 450,000, 1.12x; barrel 3,510,000 against
2,980,000, 1.18x) with the unbudgeted ladders byte-identical to §119. *What was asked and cannot be
built:* a band across rungs needs the taught rung's score, which is what the teacher produces, so
it is read after the teacher and never gates it; the step's kill (the band picking on the scored
program) therefore does not arise. *Still open:* seven harnesses state no `callSteps` and are priced
at one lap per call where their teachers drive two — the note says so, and the number is a lower
bound there until they declare.

**7. The probe count as a ladder axis, and the barrel.** (task #98) **DONE, AND THE AXIS IS REFUSED
ON A MEASUREMENT (§125).** The drive seam is repaired and pinned by a test checked to fail on the
pre-repair state; the ORACLE route is measured for the first time and refutes §121's attribution of
the knee to `hff`; the barrel is asked and reads 0.45-1.19 of its tracker across K = 8-512; the
cart-pole is FLAT from 32 up. *What killed the axis:* a candidate costs a FULL commissioning (335
barrel-days for seven counts against a 35.3-day commissioning, and the REFUSED candidate was the
most expensive row), and scoring one needs the full instrument by construction — the axis
presupposes the tracker it exists to replace. *Still open:* four proxies for the count are refuted
and none replaces them, so the count is swept per plant or the tracker is owned; and the teacher's
own score is anti-correlated with delivery under a degraded instrument (a 13x lie at K=32), which
no gate here detects.

**8. Arm ①d on the plants that never asked it.** (task #101) **DONE, §126 and §128.** Three of five
added. Two beat the incumbent at a sixth of the calendar; the QUADRUPLE TANK is asked and correctly
REFUSES at 0.05x, with the control byte-identical at 19.910x. *And the placement rule this step
proposed is REFUTED by that third plant (§128):* **place ①d before any rung that will deploy** would
send it first on the tank, where going first costs 1.82x and POISONS the incumbent (19.91x → 1.51x).
What separates the four is which of the two is stronger ALONE, which needs both orders run — so the
placement is a measurement per plant and `dirInv.first` stays a knob. **And that measurement is now
BUILT and run on six plants (§133), after the obvious form of it turned out to be wrong.** Scoring
the {①d, ①} PAIR reads 11.791x against 5.019x on the cart-pole and picks FIRST, where the COMPLETE
declared ladder reads 11.93x — the pair is wrong by the entire contribution of the rungs above it,
which is ④'s own opening sentence one rung lower down. Comparing two COMPLETE controllers instead
(①d probed alone before the ladder, against the ladder as it finished) picks the better of the two
library defaults on **6 of 6**, gaining 1.05x on two plants and losing nothing, for ONE extra scored
run (+10-16% of the calendar) — so `DIRPLACE` ships OFF on the cost, not on the result. *What is
left:* the 2R arm and EMPS, and neither is an edit — `distil-emps.mjs` is not a ladder, EMPS' ladder
is a contract test, and the arm's ladder plant is not the plant `dirinvall`'s arm entry drives
(rule 61); and the THIRD candidate, *①d first WITH the rungs above it*, is unmeasured and worth
1.11x on the exchanger.

**9. Price the CONVENTIONAL rung before the budget admits it.** (task #101) **DONE, §127.** It was
the one lap-spending rung with no estimate and, wherever the teacher is gone, the bill: 15 of the
real tanks' 17 scored runs, 65% of the commissioning, on a rung that is REFUSED. Gated on
`spent + estimate`, the tanks ship 9.11x in **21.3 hours** (was 2.6 days, was 15.9 days) at an
identical factor while the exchanger admits it and keeps its 1.11x. *What is left of it:* the
tanks' bill is now 75% EXCITATION, so §105's seven `fresh()` re-settles are the next term, and
§123 measured that lever as clean on one plant of two.

**10. Why does ①d transfer on the barrel and not the column?** (task #99) **DONE, §134 — THE SUSPECT
STANDS, IT IS BOUNDED, AND THE COLUMN KEEPS ITS TEACHER ANYWAY.** Swept, the column's ratio rises
**0.304 → 0.657** and the barrel's is **BYTE-IDENTICAL at 0.941 across a 16x span of its own cap**
— the control the falsifier needed. The mechanism is sharper than *clamped*: the two programs
SATURATE IN DIFFERENT PLACES (scored demand ≤ 0.8, held-out demand 1.6-3.2), so they want
corrections about **four times apart** and the shipped cap is sized for the smaller. Read the
absolute columns and not the ratio, which is non-monotone because its denominator collapses at
small caps (rule 19). *What it does not buy:* 0.657 still misses target 1's 0.77, and reaching it
asks for **6.4x the plant's whole declared input box**, so there is no authority both large enough
to help and small enough to be a setting — §104.1's sentence on the teacher-taught object, now on
the teacher-free one. *And the shipped cap is what keeps the project's `0 made WORSE` count clean*:
at UM 0.1-0.2 the held-out schedule reads 0.804x and 0.920x.

**11. One EDM LOGGING run — no controller.** (task #95) The falsifier `docs/edm.md` already names: **LEAD TIME
against the gap's own settling**, readable off records the machine produces anyway (§52.26
transplanted). *Makes it a result:* the first evidence in this project that is not a simulation.
*Kills it:* no lead time, in which case the preview-shaped sub-problem is not there and the doc's
own prediction was wrong before anything was built for it.

**12. ONE TRAINING LOOP, OWNED BY THE DRIVER — BEFORE ANY ST PORT.** (§138) An end-to-end trace
of the easiest plant here found the distilled rung's teacher had run on the BARE plant on every
plant where the conventional rung ships, and set it beside thirteen earlier defects of the same
shape: a piece of the commissioning loop written twice, once on the library's path and once in a
closure a host writes, with nothing checking they agree. §138 repaired the instance
(`AutoStack.composeBelow`, default on). The class is repaired by making a training run DATA —
`{ refAt, lap, fresh, step }` — driven by `rigs/ladder.mjs`'s own `run0`, which already applies
`act()`, the meter, `lookRaw` and `v`/`a`, and deleting the eleven hand-written training loops.
*Makes it a result:* the next plant added cannot reproduce any of the fourteen, because none of
them is a thing it writes. *Kills it:* a migrated harness that cannot reproduce §138's composed
numbers digit for digit — then the loops are not equivalent and the difference is the finding.
It belongs before the ST port because the ported block will be commissioned by exactly this
boundary, on a machine where a silent disagreement costs more than a re-run.

Steps 5 and 6 are gap 1 and compose (a carried excitation lowers the calendar of the object the bar
would ship). Steps 7, 9 and 10 are independent of them and of each other. **Steps 11 and 12 are
the two still open: 11 is the only one that changes the KIND of evidence, and 12 is the only one
that removes a CLASS of defect rather than an instance.** **The program that puts these in
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
  *degraded* is not *harmful*. **§100's own falsifier has since FIRED and this item stays off the
  list (§136.4, §136.5)**: two of fourteen mill diet draws read **0.953x and 0.985x** at an
  uncommissioned line speed, so the licence was granted, and armed there the guard is a **1.19x and
  1.22x LOSS on the very draws that license it** — it also refuses the 4.0 m/s row that is 0 of 14
  harmful. Over the 28 uncommissioned points those draws carry it replaces a geometric mean of
  **1.861x** with exactly 1.000x to remove a worst case of 4.7%. What that corrects is the CRITERION
  (a guard's support is the whole region it refuses, so one point below 1.000x cannot decide it —
  rule 19), and the replacement is *licensed where the distribution over the refused region has a
  geometric mean at or below 1.000x*. The repair with precedent is a DIET across the declared axis
  and not a guard, which is target 2's own lesson and §106's on the real arm; it is not built.
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
  column is clean. So gap 1's cheap lever is one plant's — and §131 then measured it CLEAN on both
  real-provenance process plants (38% of the excitation removed, every SHUFFLE control at 1.000x),
  so it is the BARREL that is the exception and not the lever. **§132 built the `fresh(s)` this
  line was waiting on and it settled the question the other way**: honour the segment and the
  FRESH arm voids too, so carrying is not what breaks this plant — the barrel's fresh rows were
  clean only because a settle ignoring its own segment injected an uncommanded transition into
  every segment. Its teacher-free figures stand as measured and its DIET is now on notice.
- **A third plant reads the touch-probe knee somewhere the teacher's harmonic count does not
  predict.** §121's account is one plant's confirmation of one prediction; a plant whose knee sits
  off `2·nh` says the mechanism is not the teacher's bandwidth either.
- **A plant appears where the deployed object's own diet draws produce a harmful deployment.** The
  *robust and tolerant* row is currently re-scopeable because every contradiction on record belongs
  to a component that ships nowhere; one such draw ends that. **IT FIRED, on the fourteenth mill draw (§136.4).** §136
  asked two more plants and reported it did not fire on seven draws each; seven MORE mill draws
  take the line-speed transfer's span from 1.56x to **2.42x** and produce **draw 10 at 0.953x —
  worse than doing nothing at an uncommissioned line speed, with the harness's own check red**.
  So the *robust and tolerant* row is no longer re-scopeable on the grounds that every
  contradiction belongs to a component shipping nowhere: this one belongs to the DEPLOYED OBJECT.
  What survives is narrower and still load-bearing — what the block SHIPS is unharmed (2.020x,
  1.474x, ladder byte-identical), 14 of 14 draws deploy and help at the commissioned point, the
  GAUGE transfer is exactly 1.000 on all fourteen, and the harm bisects to the ENGINEER's choice
  of excursions rather than the plant's noise. **What §136 found instead is on a different row**: the arm's
  shipped diet is the BEST draw of seven on all three programs at once, so the flagship factors in
  this record sit about 1.29x above a median commissioning of the same machine.
- **The EDM's logs show no lead time.** Then gap 4's named route is the wrong first machine, and the
  right response is to find another rather than to build for it anyway.
- **`objtable` or `screen` goes red.** Those two scrapes are the only checks the governing mandate —
  *every plant is a legitimate winner or is struck with a reason* — has ever had. If either stops
  being green, nothing else on this list matters until it is.
