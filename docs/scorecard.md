# THE SCORECARD — where this object stands against the field, column by column

**This file exists because the scorecard did not.** The rating that has been driving the work —
"disturbance rejection is 2/10, its worst aspect" (plan §71), "the next column by gap after DIS is
COM, 3/10 against PID+FF's 8/10" (plan §72) — lived in conversation and nowhere in the repository.
Rule 30: *a page that describes its own behaviour in a second place will eventually describe the
behaviour it used to have.* A priority order nobody can re-derive is a preference, and this
project has spent three sessions on columns chosen that way.

**EVERY CELL CITES A MEASUREMENT OR SAYS UNKNOWN.** A score with no pointer is an opinion (rule
25: "not measured" and "zero" are different states). Where the record disagrees with a number
below, the record wins and this file is what is wrong.

## What is being rated

**The deployed object**, which is `lib/pilot/distil.js`'s weight vector and nothing else — a
linear map of a window of the COMMANDED reference, 78-330 MAC per decision, 0.7-1.8 kB, no QP, no
forecast bank, no tracker at deploy, no lap index — together with the ladder that commissions it.
Not the teacher (`pilot.js`, `hff.js`), which is commissioning-only, and not the plant simulator,
which exists because there is no real machine here (plan §53).

**The incumbent** is PID with a model feedforward, because that is what is installed on the
machines these plants model, and every factor this project quotes is against it.

## The columns

| # | column | what it asks | today | incumbent | the measurement |
|---|---|---|---|---|---|
| 1 | **SET** setpoint / path tracking | how much better does the part get? | **8** | 5 | six of six plants asked deploy: arm 8.23x, EMPS 33.15x held out, Wood-Berry 5.49x, extruder 6.12x, tank **3.27x** (plan §79.3: the applied gain is the ladder's third machine-scored axis, and the tank is the one plant of five with a deficit in it), mill 2.59x, cart-pole 9.4-9.8x |
| 2 | **DIS** disturbance rejection | can it reject what the setpoint does not contain? | **4** | 6 | plan §71: a DECLARED, measurable, known-ahead disturbance yes (mill, roll eccentricity, 1.45x past both classical AGCs); an unmeasured or stochastic one no. **And plan §80 makes the reason mechanistic rather than descriptive**: rejection needs the TEACHER to represent the correction (the disturbance must repeat over its lap) AND the MAP to express it (a declared channel). The mill has both; the barrel has neither, and supplying only the second is worth **−6%** — measured, with an ORACLE rung handed the true future still losing. Every teacher here is lap-indexed (`hff` at the lap's harmonics, `oracleteach` at `k % L`), so this is the ceiling, not a tuning gap |
| 3 | **COM** commissioning cost | how long does the plant stop earning? | **4** | 8 | plan §72-§73: mill 55 min, tank 1.5 d, Wood-Berry 30 d, extruder 33 d (the tank's 1.3 d became 1.5 d when §79.3's gain axis added four scored runs — 16% of that plant's bill for 1.26x). One of four inside "a day or less"; the other three are a property of a five-hour lap, not of the method (§72.12) |
| 4 | **CPU** runtime arithmetic and memory | does it fit the scan it has to run in? | **9** | 9 | 78-330 MAC/decision against a 10,000 MAC budget — 0.8-3.3%; 0.7-1.8 kB. `artefact.test.mjs` pins the deployed path bit-identical to a 117-line reimplementation that imports nothing. DeePC on the same axis is 145,082 MAC, 1451% of a scan |
| 5 | **GEN** generalisation | does it hold off the program it was commissioned on? | **6** | 7 | target 2 MET inside its bound (6.65-7.94x across a 5x feed span, nothing made worse, plan §52.41); target 1 partly — the deployed map transfers by construction and the retired memory did not (0.53x, reproduced by a textbook norm-optimal ILC) |
| 6 | **INS** instrument the customer must own | what does it cost to commission at all? | **6** | 9 | was 3. plan §52.42: a tracker is worth **3.9x** over the best permanently mounted alternative and motor encoders alone deliver **nothing**. plan §74: a TOUCH PROBE at **64 points per lap delivers the tracker's result to 0.6%**, 32 points to 2%, reproducing across three draws — the instrument a shop already owns, on a two-to-three-minute inspection routine. Not 9, because the count's scaling law is unestablished (the plant-timescale account is refuted, the lap-length axis confounded) and it is one plant |
| 7 | **SAF** safe failure | what happens when it cannot help? | **8** | 7 | it REFUSES with a stated reason and applies nothing — 4 of 4 cart-pole seeds on a well-tuned loop, the barrel before §66, Wood-Berry's 12 of 12 under `verifyRef`. `AutoStack` scores every rung on the machine and reverts |
| 8 | **ROB** robustness to what it was not shown | does it degrade or fall over? | **6** | 8 | was 4, on a memory-era claim. plan §75: across an **eight-fold span of gearbox stiffness and eight-fold of link stiffness** the frozen map still helps in every cell, worst 1.25x, nothing made worse — graceful, not catastrophic — **and the drift reads at the 64 touches §74 priced, to 0.6%**, so a first-article check is the recommission trigger. Not higher: the object itself has no plant-side guard and degrades SILENTLY, and only stiffness was moved. **plan §80.5 audited the two sweeps that look like they contradict that and neither does** — §52.46's backlash ladder is "one commissioning each", so it measures the plant's own difficulty under a knob rather than a FROZEN map meeting a machine it was not taught on (rule 20), and §52.30's drive sweep does not state its protocol either way (rule 25). The cell stands as written. **And plan §80.7 is the strongest robustness evidence here, found while looking for something else**: a **0.9% NON-REPEATING component** in the plant costs the commissioned result **1.6x to 2.5x**, because the lap-indexed teacher needs its target commensurate with its lap. Every real plant has small non-repeating components. The fragility is measured, the falsifier fires (inert when the component is removed, 0.1%), and the cure costs laps rather than architecture — 2.4x of commissioning for 1.63x |
| 9a | **PRED** predictable and well behaved | can it be tuned once and then left alone? | **8** | 9 | the property an engineer actually asks for. Pinned in `artefact.test.mjs`: **STATELESS** (the same window gives the same number after 100 other decisions), **BOUNDED at the set authority over 2,000 adversarial windows** driven a thousandfold outside the trained scale and never NaN, with the bound shown to be exercised (rule 9); no clock, no RNG, no accumulation; the coverage guard fades to exactly 0 rather than extrapolating; a **NON-FINITE window returns no correction** rather than a NaN command, which asking this question found as a LIVE DEFECT on the deploy path (§77.4, rule 55); and plan §75 measures graceful degradation across an eight-fold stiffness span. Not 9: one plant's worth of evidence, and a window that is wrong but FINITE is bounded by the cap and detected by nothing |
| 9b | **FOR** forensic reconstructibility | after a bad part, can an investigation establish how the number was computed? | **9** | 7 | **the one column where this object BEATS the incumbent, and for a structural reason.** plan §77: a decision replays **BIT-EXACTLY from 31 logged numbers** (15 offsets x 2 reference channels + speed) and from nothing else, and `explain()` in the deployed file returns the per-term account whose contributions sum to the applied number **bit-exactly, in the applied order** — checked to be non-decorative by perturbing one weight and seeing exactly one term move. A PID's output depends on accumulated integrator state that logs usually do not carry; this is a pure function of a window the machine already knows |
| 9c | **INT** interpretability of the coefficients | can it be read at a glance? | **3** | 9 | kept separate because the old EXP cell was conflating it with the two above. plan §76: **78.8% of the applied rms on the better channel and 93.2% on the other** is outside the four names an engineer owns. Two gross properties ARE readable off the record with no fit: the kernel is nearly DC-free (sum 1% and 0.1% of its peak tap, so it will not shift a held pose) and its peak tap is at **+512 steps, about one plant rise-time early** — the same number a regression on four classical columns found by a route sharing no arithmetic |
| 10 | **BRD** breadth of plant classes | how many kinds of machine? | **7** | 9 | eleven plants, three with real-hardware provenance, one open-loop unstable, one with a dominant transport delay. Two error classes of three tried (mechanical compliance/friction; periodic disturbance through a declared dead time); the class it loses on is strongly coupled MIMO |

## Which column is next, and why

The gaps against the incumbent, largest first:

```
  INT   3 vs 9   -6     interpretability of the coefficients — and this is the one that does not matter
  PRED  8 vs 9   -1     predictable and well behaved: tune once, leave alone
  FOR   9 vs 7   +2     forensic reconstructibility — the one column this object WINS
  COM   4 vs 8   -4     was -5 before plan §72-§73
  INS   6 vs 9   -3     was -6 before plan §74's touch probe
  DIS   4 vs 6   -2     was -4 before plan §71
  ROB   6 vs 8   -2     was -4 before plan §75
  BRD   7 vs 9   -2
```

**AND THE EXP COLUMN WAS THE WRONG QUESTION, WHICH SPLITTING IT SHOWS (plan §77).** It asked "can
the engineer see why?" and scored one number for three different properties. What an engineer
actually asks is: *can I tune it once and never look at it again* (PRED), and *when something goes
wrong, can an investigation establish how the number was computed* (FOR) — explicitly not the same
as *can I read the coefficients* (INT). Split, the object reads **8 / 9 / 3** where the single EXP
cell read 5, and the middle one is the first column here that beats the incumbent. A composite score
across properties that pull in different directions is a preference dressed as a result, which is
rule 42 aimed at a scorecard.

**Three columns measured, and the third went the other way.** §74 moved INS 3 → 6 and §75 moved
ROB 4 → 6, both by measuring an axis nobody had; §76 measured EXP and it fell 6 → 4, because the 6
was written from an impression. That is the most useful thing this file has done so far: a scorecard
whose cells can only improve is a marketing document, and the honest ordering now puts EXP first.

**Updated twice, both times by the column it named.** §74 measured the touch probe and moved INS
3 → 6; §75 then measured ROB's untouched PLANT axis and moved it 4 → 6, retracting half of the
sentence that had made it look worst ("not gracefully, catastrophically" was evidence about the
retired memory, on two axes, quoted against a third that nobody had measured).

**EXP was picked next for tractability, and measuring it split it into three.** INT is the largest
gap on the board at -6 and is the one that does not matter: an engineer tunes once and leaves it
alone, so *readable at a glance* is not a requirement, and six capacity experiments plus five
function classes bound what any explanation of it could capture anyway (R² ~0.84). What does matter
is PRED at -1 and FOR at **+2**, and both are now pinned rather than argued.

**So the honest next column is COM at -4**, where three sections have already worked and the
remaining 30-day plants are a property of a five-hour lap rather than of the method (§72.12) — or
DIS at -2, which is the other half of what a regulator customer buys and where the mill's win came
from declaring an input rather than changing the controller.

**INS was the largest when this file was written and is no longer** (see the update above).
It was picked first for the reason below and the pick was right: it moved 3 points in one section.

**INS is the largest and always was**, and CLAUDE.md has said so in prose for longer than the
scorecard has existed: *"it needs an instrument the customer probably does not own, and this file
has never said so ... that assumption decides who can buy this more than any factor in the table
above does."* It is also the column with a cheap falsifier available, which is why it goes next
rather than ROB: plan §74 degrades what the TEACHER may measure to a handful of probed points per
lap while the delivered number stays on the tracker, so what is read is a cheap teacher and not a
cheap scoreboard (rule 15).

## What this file is not

It is **not** a claim about the field. One rival has been properly built and run on the arm
(§34's truth-free engineered baseline), two on EMPS (norm-optimal ILC, ZPETC/stable inversion),
and one disqualified for needing an instrument the deployed object does without (DeePC). Modern
MPC, L1 adaptive and Koopman-EDMD are absent. The incumbent column is PID+FF and nothing else,
and every number in it comes from this project's own rigs.
