# THE PROGRAM — from a portfolio that wins on ten simulated plants to a world-class universal controller

**WHAT THIS FILE IS.** The owner's ask is *a world-class universal controller*. Those are two
adjectives, and this project has already paid for reading adjectives as results (rule 30, and the
scorecard's own history of cells written from an impression and then moved DOWN by measurement).
So this file first turns each adjective into a BAR that can be read off the record as a number,
states where the record sits against every bar today, and then lays out the program that closes
each gap — with the measurement that would say a step failed, because a step that cannot fail is a
preference (rules 25, 59).

**WHAT IT IS NOT.** `docs/plan.md` is the RECORD, `docs/scorecard.md` rates ten columns against the
incumbent, `docs/roadmap.md` is the next sequence of steps ordered by what blocks the north-star
sentence. This file is the ORDER ABOVE THE ROADMAP: what "world class" and "universal" mean as
bars, and which of the roadmap's steps serve which bar. **Every number here is a citation and never
a re-measurement.** Where this file and the record disagree, the record wins.

---

## The two adjectives, as bars

**UNIVERSAL** is the north star's own sentence — *wire it up, press one button, use it, on any
dynamical system, for any program it is later asked to run* — and CLAUDE.md already splits it into
five parts and eight targets. Read as bars it is four things, each with a count on record:

```
  U1  ANY PLANT     improve or refuse WITH A STATED REASON on every plant handed to it, including
                    a class it has never met                      10 of 10 plants (§55, §86); 4 error
                                                                  classes of 4 tried (§86.2)
  U2  ANY PROGRAM   none made worse, and within 1.3x of a per-program commission on every program
                                                                  5 of 11 MET, 1 made WORSE — of the
                                                                  SHIPPED configuration (§115)
  U3  ANY LOOP      it corrects the reference of the loop an installation already has, and refuses
                    when that loop is already good              the cart-pole on two loops (§84.10, §86.2);
                                                                  it does NOT synthesise a stabiliser (§52.32)
  U4  ANY FEED      the same object across the feed range the machine is run at
                                                                  MET inside its bound on ONE plant (§52.41)
```

**WORLD CLASS** is not an adjective this record can support by comparison to the field, and it says
so in three places (target 8; scorecard *What this file is not*; roadmap gap 4). Read as bars it is
what a buyer would actually check, each again with a count:

```
  W1  COMMISSIONS IN A SHIFT     under 8 hours of plant time, every plant, at a stated factor
                                  2 of 8 unbudgeted (mill 55 min, cart-pole 42.7 min, §87.7);
                                  the two 30-day plants read 3.1 and 3.8 DAYS budgeted (§120)
  W2  THE SHOP'S OWN INSTRUMENT  a touch probe or motor-side signals commission it, no tracker
                                  arm: 64 touches = the tracker (§74); column: 0.47x of it at 64,
                                  recovering at 256-512 (§121) — a constant to COMMISSION, one plant of two
  W3  FITS THE SCAN               under 10% of a 1 ms task, every cycle, deployed AND fitted
                                  deployed 8-330 MAC, 0.8-3.3% (§53, artefact.test.mjs); the FIT is
                                  scoped as a conditional (28% at stride 9) and not costed as sliced
                                  background compute on any plant but the arm (target 6)
  W4  BEATS THE FIELD ON ITS AXES admissible rivals, same machine, same authority, their own knobs swept
                                  3 rivals on ONE axis (NOILC, ZPETC, Koopman-EDMD), ZPETC on a second
                                  plant (§87.5), DeePC disqualified (§54.8) — not a field
  W5  ROBUST AND SELF-REPORTING   degrades gracefully off its commissioning, and a free reading says so
                                  11 cells of plant change, worst 1.78x, nothing made worse (§84.4);
                                  the 64-touch read tracks the drift to 0.6% (§75.5) — one plant
  W6  HAS MOVED A REAL MACHINE    at least one factor measured on hardware, not a rig
                                  ZERO. Three plants have real PROVENANCE and all are simulations (§55)
```

**The honest one-line reading of both tables**: the object is closer to UNIVERSAL than to WORLD
CLASS, and the three bars it is furthest from — W1, W2, W6 — are all about COMMISSIONING and none is
about the controller. That is consistent with the whole record: the deployed object has not been
improved by a better map since §52.16 (nine capacity experiments and five function classes, §52.31,
§54.9), and every factor since has come from an instrument, a diet, a declaration, a carried
constant re-derived, or the machine (§64-§122).

---

## What "world class" therefore CANNOT mean here, stated so nobody spends a session on it

Each of these is closed by measurement, and reopening one needs a reason the record does not
already answer:

- **A better MAP of the commanded reference.** Information ceiling R² 0.894 / 0.931 against a
  shipped fit of 0.856-0.870 (§52.31); ridge beats kernel ridge, LWR, MLP and kNN on the identical
  rows (§54.9). Not *no basis* — no FUNCTION CLASS.
- **Runtime ADAPTATION as a product feature.** Guided RLS with a PERFECT tracker destroys a held-out
  program (7.72x → 0.88x, §108); `learnLive` does not, and what protects it is the diet staying in
  the fit, not the gate (§110.1). Adaptation ships as a COMMISSIONING PHASE and the open question
  (#88: is §108 a diet-coverage failure?) is a cascade-only question — the cascade ships nowhere.
- **A runtime plant-side GUARD.** §82's fade makes the failure case monotonically worse; §100's
  declared-point guard works exactly as designed and costs 2.020x → 1.000x. A guard is scored on
  DELIVERED OUTCOME and *degraded* is not *harmful*.
- **Synthesising the stabilising loop.** Every plant here has a loop already closed and the object
  corrects its reference (§52.32). USLC/UP-OSI-class claims are a different product.
- **Interpretable coefficients.** 79-93% of the applied rms is outside the four names an engineer
  owns (§76); PRED and FOR are what an engineer asks for and both are pinned.
- **More rivals on the same simulated axis before a real machine.** Three on one axis are not a
  field, and a fourth there does not make one (target 8).

---

## The program, by bar

Ordered by what a buyer checks first. Each phase names its steps in `docs/roadmap.md` where one
exists, the measurement that closes it, and the one that kills it.

### PHASE 1 — W1, commissioning in a shift. The gap that decides whether this is a product.

**Where it stands.** Target 4 is met on 2 of 8 unbudgeted. Under `plantBudget` the two worst plants
read 3.1 and 3.8 days for 1.66x and 2.8% of factor (§120), and the bill is now 61-67% EXCITATION —
seven `fresh()` re-settles (§105) on a route whose teacher is already gone.

**Steps.** Roadmap 5 (carry the plant across the excitation segments — `distilkit.carrier` was
built for the teacher in §72 and never applied here) and roadmap 6 (a bar BEFORE the teacher, rule
42 across rungs with the calendar as the cost, ①d's machine score as the bar). Then the fit's own
arithmetic as sliced background compute on every plant, not the arm alone (W3's open half, target 6).

**Closes it.** Every plant in `commtime.mjs`'s table under 8 hours of plant time at a STATED factor
and a stated rung — the column and barrel at roughly a day if the excitation's share falls by its
own settles, and lower only by a lever not yet named.

**Kills it.** The carried excitation moves the delivered factor (rule 21 says it must not; the
barrel refused the same lever for the teacher in §72.18). Then the calendar's floor is the plant's
own settle times seven, and W1 is a trade rather than a bar.

### PHASE 2 — U2, any program. The lever changed hands this week.

**Where it stands.** 5 of 11 MET, 1 made worse, of the shipped configuration (§115). §84.9's
`prog/rise` predicts the misses. The DIET repair — assumed for a year — is refuted below the split:
the column's teacher drops added recipes and the barrel's transfer gets worse on every enlargement
(§122). The teacher-free ①d object reads **0.941 on the barrel changeover, MET**, where every taught
diet reads 0.30-0.39 (§120); on the column it reads 0.304.

**Steps.** Roadmap 8 (why the barrel and not the column — the named suspect is the column's ①d
sitting at 0.400 of its 0.4 cap, §104). Arm `classicDiet` on the real arm so the scrape's *made
worse* row reads zero for the SHIPPED configuration (§106 built it, nowhere declares it). Ask the
quadruple tank, which has never been asked either way. Then U4 on a second plant, which has been
"never asked" since §52.41.

**Closes it.** `objtable --read` printing `TARGET 1 asked on 11 of 11: 11 MET, 0 made WORSE` for
the SHIPPED configuration — not a capability, a default.

**Kills it.** A plant below the split where neither the teacher-free object nor the diet nor the
cap moves the ratio. Then U2 is bounded by `prog/rise` and the product statement is *commission per
program below ten response times per lap*, which §84.5 prices at 10-17% each.

### PHASE 3 — W2, the shop's own instrument. Now a constant to commission, not a number to quote.

**Where it stands.** The arm's 64 touches equal the tracker (§74); the column's do not (§121), and
the knee is the teacher's identification bandwidth (`2·nh`). One cell (K=128) makes a held-out
program worse.

**Steps.** Roadmap 7: the probe count as a machine-scored LADDER AXIS beside the ridge and the gain,
shipping the cheapest K within rule 42's band of the full instrument; wrap `oracleConverge` so the
`ORACLE=1` route is reachable under `probeRuns`; run the barrel. Then the cheaper truths §52.42
priced on the arm — wind-up readings at 1.72x against the tracker's 6.63x, encoders alone at
nothing — asked on the plants where a wind-up reading has no analogue.

**Closes it.** Every plant that ships the deployed object states a touch count and a factor at it,
and the INS column reads per plant rather than per arm.

**Kills it.** A plant where no K below the lap reaches the band. Then that plant needs the tracker,
INS says so per plant, and W2 is a per-plant property rather than a bar.

### PHASE 4 — W5, robust and self-reporting, on more than the arm.

**Where it stands.** The frozen map across eleven cells of plant change, worst 1.78x, nothing made
worse, with a free 64-touch drift reading constant to 0.6% (§84.4, §75.5) — ONE plant. Six of ten
plants have the OBJECT's own diet-draw distribution (§84.8, §87.3); the arm and EMPS are spread only
through the teacher (`spread.mjs`).

**Steps.** `PLANTSPAN`'s frozen-map protocol on a second plant that has named constants to move (the
real cascaded tanks' overflow level, the mill's transport delay — §89.2 already has the second as an
operating point). The object's diet-draw distribution on the arm and EMPS through the shared kit.

**Closes it.** *Nothing made worse across the plant span* on two plants sharing no physics, and every
row in `objtable` a distribution.

**Kills it.** One draw, on any plant, where the deployed object HARMS. The *robust and tolerant* row
is re-scopeable today only because every harmful deployment on record belongs to the gate that
ships nowhere; one such draw ends that.

### PHASE 5 — W4, the field. A second axis before a fourth rival.

**Where it stands.** Three admissible rivals on EMPS, one of them on the real arm. All three share
§56's finding — a model exact in prediction can be a bad thing to invert — and the one that survives
the noise falsifier fails the reproducibility control (§113).

**Steps.** The admissible rivals on the plants where the deployed object WINS ALONE and the
incumbent finds nothing (barrel, column, mill, arm — §96): ZPETC and Koopman-EDMD on the column,
where the published BLT is already beaten in both conventions (§64), so a rival must beat BLT to
count. Then the one plant class no plant here contains — hysteresis (Bouc-Wen), a vendoring problem
(the hosts are refused) and not a controller one.

**Closes it.** Three rivals on three plants sharing no physics, each swept on its own knobs, ours at
defaults, and the delivered ordering the same on all three.

**Kills it.** A rival that beats the deployed object on a plant where the incumbent finds nothing.
That is the useful outcome and the reason to run it: it names what to distil next.

### PHASE 6 — W6, a real machine. The only phase that changes the KIND of evidence.

**Where it stands.** Zero. `docs/edm.md` is scoped before any measurement, with its predictions
written down so they can be read against what happens: the FINISHING pass is this method's own
shape with the cut part as the truth (W2 for free), and ROUGHING gap regulation should be REFUSED.

**Steps.** Roadmap 9: one LOGGING run, no controller, reading LEAD TIME against the gap's own
settling off records the machine already produces (task #95, needs the owner's hardware). Then a
commissioning on that machine through the one press with `plantBudget` set to a shift.

**Closes it.** One factor on hardware, with the refusal on roughing asserted to be right for the
right reason.

**Kills it.** No lead time in the logs. Then the EDM is the wrong first machine and the right
response is another machine, not building for this one anyway.

---

## The order, and why it is not the order the scorecard gives

```
  phase   bar   what it buys                              blocked on
  1       W1    a product a customer can stop a plant for  nothing — two roadmap steps, both cheap
  2       U2    the sentence "for any program"             phase 1's object (①d is what transfers)
  3       W2    the instrument the shop owns               the oracle wrap, then plant time
  4       W5    "robust" on a second plant                 plant time only
  5       W4    "world class" as a comparison              phases 1-3 (a rival must be run at the cost we pay)
  6       W6    evidence that is not a simulation          the owner's hardware
```

The scorecard orders by column gap and its largest is INT, which it calls the one that does not
matter. This orders by what a buyer checks, and a buyer checks the calendar first, the program
second, and the instrument third — which is the roadmap's order with the bars named. Phase 6 does
not wait on the others; it is last only because it is not in this container's hands.

---

## What would prove this object is NOT world class, so the claim can fail rather than be revised

- **A plant where the one press ships a controller that HARMS** — the scrape going red. Everything
  else on this page is secondary to that check staying green.
- **The carried excitation moving the factor** (phase 1's kill). Then commissioning has a floor of
  days on process plants and W1 is not reachable by this route.
- **An admissible rival winning where the incumbent finds nothing** (phase 5's kill).
- **A real machine where the FINISHING prediction fails** — no repeatable geometric error on a
  repeated contour, in which case the method's own shape is not on the machine it was scoped for.
- **A second plant where the teacher-free object does not transfer** (phase 2). Then 0.941 on the
  barrel was one plant, and U2's lever is again unknown.

None of these is a reason to soften the bars. The bars are what the adjectives mean, and the point
of writing them down is that each can be read off the record by someone who did not write it.
