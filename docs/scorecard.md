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
| 1 | **SET** setpoint / path tracking | how much better does the part get? | **8** | 5 | six of six plants asked deploy: arm 8.23x, EMPS 33.15x held out, **Wood-Berry 3.96x**, **extruder 7.00x**, tank **3.27x**, mill 2.63x — the column and barrel moved up in plan §84.6, where the applied-gain grid was found to STOP AT 1.0 so three of four plants' "picks 1.0" were grid EDGES rather than optima; widened, only the mill's survives. **The CART-POLE is off this list (plan §84.10)**: swept over a 24-fold span of authority it refuses at every one on a properly tuned loop, so its 9.4-9.8x was the loop and is not a factor this object earned. **And two of the six are now DISTRIBUTIONS rather than single draws (plan §84.8)**: the diet is the random variable, and over six draws each the column and barrel DEPLOY 6 of 6 and HELP 6 of 6, spreads 1.53x and 1.66x |
| 2 | **DIS** disturbance rejection | can it reject what the setpoint does not contain? | **4** | 6 | plan §71: a DECLARED, measurable, known-ahead disturbance yes (mill, roll eccentricity, 1.45x past both classical AGCs); an unmeasured or stochastic one no. **And plan §80 makes the reason mechanistic rather than descriptive**: rejection needs the TEACHER to represent the correction (the disturbance must repeat over its lap) AND the MAP to express it (a declared channel). The mill has both; the barrel has neither, and supplying only the second is worth **−6%** — measured, with an ORACLE rung handed the true future still losing. Every teacher here is lap-indexed (`hff` at the lap's harmonics, `oracleteach` at `k % L`), so this is the ceiling, not a tuning gap. **AND plan §81 measures the case an owner actually means — an unmodelled external force — for the first time: the object contributes ZERO to rejecting it, and beyond about half of tauMax of sustained load it CONSUMES the drive headroom the loop needs (saturating 14.0% against the bare machine's 8.1%) until at full tauMax it delivers 0.87x, worse than not having it** **AND THE EVIDENCE BASE IS NARROWER THAN THIS CELL READ (plan §84.3).** `disscreen.mjs` decomposes each plant's open-loop error at the rig: **of eleven plants ONE is a disturbance testbed and it is 95% EXHAUSTED** — the mill's eccentricity is 87.0% of its open-loop error ENERGY, and a PERFECT rejector of it leaves 2.78x where the shipped object already delivers 2.63x. The barrel is screened out more decisively than §80.6 did it: the drift's share is **−6.93% of the whole run and +3.24% of the settled part**, so the SIGN FLIPS with the denominator. Everything else has no exogenous component at all. **AND THAT "NEARLY USED UP" READING IS CORRECTED WITHIN THE HOUR BY plan §85, WHICH IS WHY DIS IS THE COLUMN WITH THE CLEAREST NEXT EXPERIMENT RATHER THAN THE DEADEST.** §84.3's bound was on the wrong support — it bounds corrections of the mill's DECLARED component, and the object is 95% through that one, but the UNDECLARED entry wander is a different component it has not touched. Held flat, each column against its own open loop, the mill reads **2.625x as it ships against 7.029x with the wander gone**: that component is 7% of the OPEN-LOOP error and **88% of the error ENERGY the object LEAVES**, worth 2.68x — and the residual then sits at the gauge's own 2.0 µm noise, so nothing else remains in the plant. So DIS stays at 4 on capability, the plant is 0% exhausted of its undeclared disturbance, and the next experiment is a DISTURBANCE OBSERVER on the mill (whose output is measured at runtime and whose wander is slow against its 121-step rise) rather than a hunt for a second plant. (§84.7's reference-correlated payload is a ROB result and is scored there, not here: an inertial load IS partly contained in the commanded reference, which is exactly why the object handles it.) |
| 3 | **COM** commissioning cost | how long does the plant stop earning? | **5** | 8 | plan §72-§73: mill 55 min, tank 1.5 d, Wood-Berry 30 d, extruder 33 d (the tank's 1.3 d became 1.5 d when §79.3's gain axis added four scored runs — 16% of that plant's bill for 1.26x). One of four inside "a day or less"; the other three are a property of a five-hour lap, not of the method (§72.12). **Was 4, and plan §84.5 is why it moves: the number a customer pays REPEATEDLY is ZERO.** `progcost.mjs` scrapes the split every harness already prints — adding one more program to the DIET costs **10-17% of the commissioning on all four plants** (mill 29.2 min once + 9.9 min each, tank 26.4 h + 3.9 h, column 20.1 d + 4.0, barrel 21.1 d + 4.7), a narrow spread across bills differing by 900x. But that is the price of a DIET ENLARGEMENT, which is the fallback when transfer is not good enough; the deployed object is program-agnostic by construction, so a program inside the trained envelope costs no lap, no refit and no download. Quoting the marginal column as "the cost of a new program" overstates the bill by infinity and quoting zero alone hides the fallback, so both are printed. Not higher: the ONCE-per-plant figure is still 20-21 days on two of four |
| 4 | **CPU** runtime arithmetic and memory | does it fit the scan it has to run in? | **9** | 9 | 78-330 MAC/decision against a 10,000 MAC budget — 0.8-3.3%; 0.7-1.8 kB. `artefact.test.mjs` pins the deployed path bit-identical to a 117-line reimplementation that imports nothing. DeePC on the same axis is 145,082 MAC, 1451% of a scan |
| 5 | **GEN** generalisation | does it hold off the program it was commissioned on? | **6** | 7 | target 2 MET inside its bound (6.65-7.94x across a 5x feed span, nothing made worse, plan §52.41); target 1 partly — the deployed map transfers by construction and the retired memory did not (0.53x, reproduced by a textbook norm-optimal ILC) |
| 6 | **INS** instrument the customer must own | what does it cost to commission at all? | **6** | 9 | was 3. plan §52.42: a tracker is worth **3.9x** over the best permanently mounted alternative and motor encoders alone deliver **nothing**. plan §74: a TOUCH PROBE at **64 points per lap delivers the tracker's result to 0.6%**, 32 points to 2%, reproducing across three draws — the instrument a shop already owns, on a two-to-three-minute inspection routine. Not 9, because the count's scaling law is unestablished (the plant-timescale account is refuted, the lap-length axis confounded) and it is one plant |
| 7 | **SAF** safe failure | what happens when it cannot help? | **8** | 7 | it REFUSES with a stated reason and applies nothing — 4 of 4 cart-pole seeds on a well-tuned loop, the barrel before §66, Wood-Berry's 12 of 12 under `verifyRef`. `AutoStack` scores every rung on the machine and reverts. **Not higher, and plan §81 is why: every one of those refusals is a COMMISSIONING-time decision. At RUNTIME the object has no plant-side guard at all** — under a sustained unmodelled load it goes on applying full authority, silently, past the point where it is making the machine worse, and its peak drive demand exceeds the conventional machine's under the same load (417x against 315x of tauMax) |
| 8 | **ROB** robustness to what it was not shown | does it degrade or fall over? | **7** | 8 | was 4, on a memory-era claim. plan §75: across an **eight-fold span of gearbox stiffness and eight-fold of link stiffness** the frozen map still helps in every cell, worst 1.25x, nothing made worse — graceful, not catastrophic — **and the drift reads at the 64 touches §74 priced, to 0.6%**, so a first-article check is the recommission trigger. Not higher: the object itself has no plant-side guard and degrades SILENTLY, and only stiffness was moved. **plan §80.5 audited the two sweeps that look like they contradict that and neither does** — §52.46's backlash ladder is "one commissioning each", so it measures the plant's own difficulty under a knob rather than a FROZEN map meeting a machine it was not taught on (rule 20), and §52.30's drive sweep does not state its protocol either way (rule 25). **That audit was right and its conclusion was that the axes had not been measured, not that they could not be** — §84.4 then measured them under the frozen map, which is what moves this cell below. **And plan §80.7's "strongest robustness evidence here" — a 0.9% NON-REPEATING component costing the commissioned result 1.6x to 2.5x, on the grounds that every real plant has one — IS RETRACTED BY plan §84.1, in the direction that makes this cell BETTER.** Moved into the shared kit as `teachAvg` and asked of three more plants it is **INERT ON ALL THREE**: the column byte-identical at 3.7440e-2 with an identical teacher at every setting, the tank 0.006%, the mill's product 0.3% across a ladder that triples its laps. The two nulls are the correct ones — a deterministic rig has no non-repeating component for such a knob to find — and the MILL is the finding: its TEACHER falls 2.9x while the delivered object does not notice, because `hff` was inverting an unmeasured wander a map of the commanded reference could never express. So the fragility is ONE plant's and not a property of the method, and what replaces the claim is a screen the ladder already prints: the SPREAD of the teacher's per-run scores. **And plan §81 adds the axis a customer actually changes — an unmodelled PAYLOAD or SHOVE — with the envelope measured: graceful to a quarter of tauMax (6.07x), degrading by half (3.62x), worse than nothing by full tauMax — **though §82.1 corrects that last cell: there the CONVENTIONAL machine is itself 8.2x worse and the drive is saturated on both, so the machine has failed and the comparison is not a controller result. Across the span where the machine still works the object degrades smoothly and keeps 3.62x.** Its RECOVERY from an impulse degrades 503% where the bare machine's degrades 22%. **And the obvious fix is REFUTED (§82): a plant-side guard fading on the drive's own distress is provably inert where nothing is wrong (0.00% apart) and makes the failure case WORSE the harder it fades (0.87x / 0.84x / 0.80x)** **AND THE "only stiffness was moved" CLAUSE IS NOW CLOSED, WHICH IS WHY THIS CELL MOVES 6 → 7 (plan §84.4).** `PLANTSPAN` takes named machine overrides, so §75's frozen-map protocol reaches the constants it never touched, each cell still scored against the CONVENTIONAL machine at its own cell. **BACKLASH IS FREE AND MORE OF IT IS BETTER** — none to thirty times the rig's, the conventional machine gets worse while the policy's delivered error FALLS, 8.15x → 8.49x, which is §52.46's direction in the stronger form §80.5 said that ladder could not support, since no cell here got its own fit. **THE DRIVE IS THE FAILURE AXIS: 8.17x → 5.79x → 2.09x → 1.78x as the torque limit falls**, a 4.6x collapse reached INDEPENDENTLY of §81, which found the same bound by adding load rather than removing headroom — so the tolerance is set by the drive and not by the structure. More drive is also worse (64 reads 7.34x against 32's 8.17x), as is more or less loop bandwidth: both axes have an interior optimum on the commissioning value rather than a safe direction. **Nothing is made worse than the conventional machine on any of the eleven cells, worst 1.78x**, and §75.5's free detector holds on all three new axes at 0.707-0.711, constant to 0.6%. **And plan §84.7 adds the load class an owner most often means and it is FREE**: an unmodelled INERTIAL PAYLOAD at half a tauMax costs the conventional machine 10% and the policy **0.26%**, so the policy's advantage RISES 6.62x → 7.25x, and training with it is inert — the object's own rigid-body reference-torque features already give the correction the right SHAPE for a heavier machine. That completes §81 and §83 into one classification: **reference-correlated loads free, sustained/constant loads costly, random loads a hedge priced 1:1.** **And plan §84.8 makes two plants' headlines distributions** — the DIET as the random variable, 6 of 6 deploying and 6 of 6 helping on each, spreads 1.53x and 1.66x. Not 8: it still degrades SILENTLY, the guard is refuted, and the drive axis is a real 4.6x collapse |
| 9a | **PRED** predictable and well behaved | can it be tuned once and then left alone? | **8** | 9 | the property an engineer actually asks for. Pinned in `artefact.test.mjs`: **STATELESS** (the same window gives the same number after 100 other decisions), **BOUNDED at the set authority over 2,000 adversarial windows** driven a thousandfold outside the trained scale and never NaN, with the bound shown to be exercised (rule 9); no clock, no RNG, no accumulation; the coverage guard fades to exactly 0 rather than extrapolating; a **NON-FINITE window returns no correction** rather than a NaN command, which asking this question found as a LIVE DEFECT on the deploy path (§77.4, rule 55); and plan §75 measures graceful degradation across an eight-fold stiffness span. Not 9: one plant's worth of evidence, and a window that is wrong but FINITE is bounded by the cap and detected by nothing |
| 9b | **FOR** forensic reconstructibility | after a bad part, can an investigation establish how the number was computed? | **9** | 7 | **the one column where this object BEATS the incumbent, and for a structural reason.** plan §77: a decision replays **BIT-EXACTLY from 31 logged numbers** (15 offsets x 2 reference channels + speed) and from nothing else, and `explain()` in the deployed file returns the per-term account whose contributions sum to the applied number **bit-exactly, in the applied order** — checked to be non-decorative by perturbing one weight and seeing exactly one term move. A PID's output depends on accumulated integrator state that logs usually do not carry; this is a pure function of a window the machine already knows |
| 9c | **INT** interpretability of the coefficients | can it be read at a glance? | **3** | 9 | kept separate because the old EXP cell was conflating it with the two above. plan §76: **78.8% of the applied rms on the better channel and 93.2% on the other** is outside the four names an engineer owns. Two gross properties ARE readable off the record with no fit: the kernel is nearly DC-free (sum 1% and 0.1% of its peak tap, so it will not shift a held pose) and its peak tap is at **+512 steps, about one plant rise-time early** — the same number a regression on four classical columns found by a route sharing no arithmetic |
| 10 | **BRD** breadth of plant classes | how many kinds of machine? | **7** | 9 | eleven plants, three with real-hardware provenance, one open-loop unstable, one with a dominant transport delay. Two error classes of three tried (mechanical compliance/friction; periodic disturbance through a declared dead time); the class it loses on is strongly coupled MIMO. **And a THIRD losing class is now NAMED rather than merely refused (plan §84.11)**: the real flexible arm reads **INVERSE 128.3%** in `invert.mjs` — the only non-zero in six plants — so a held correction first goes 1.28x further the WRONG way than it ever goes the right way, and the pilot inverts a forecast, which is exactly the record's own "the correction is wrong rather than clipped". §59 refuted non-minimum phase on four plants and §84.9 showed the WINNER reads 0.0% too: the column discriminated nothing because none of those five had it. **And the cart-pole is counted here as ASKED AND CORRECTLY REFUSED, never as a factor** (§84.10) |

## Which column is next, and why

The gaps against the incumbent, largest first:

```
  INT   3 vs 9   -6     interpretability of the coefficients — and this is the one that does not matter
  COM   5 vs 8   -3     was -5 before §72-§73, -4 before §84.5 priced a new PROGRAM at zero
  INS   6 vs 9   -3     was -6 before §74's touch probe
  DIS   4 vs 6   -2     was -4 before §71 — and §84.3 narrows its evidence to ONE plant, 95% exhausted
  BRD   7 vs 9   -2
  PRED  8 vs 9   -1
  ROB   7 vs 8   -1     was -4 before §75, -2 before §84.4 closed the "only stiffness was moved" clause
  SET   8 vs 5   +3
  FOR   9 vs 7   +2     forensic reconstructibility — the one column this object WINS
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

**AND A TEN-STEP PASS MOVED TWO CELLS AND NARROWED A THIRD (plan §84.1-§84.12).** COM 4 → 5,
because §84.5 measured the thing a customer pays REPEATEDLY and it is zero — the 10-17% is a diet
enlargement, the fallback when transfer is not good enough. ROB 6 → 7, because §84.4 closed this
file's own "only stiffness was moved" clause on three more axes and §84.1 RETRACTED the fragility
claim ROB was leaning on as its strongest evidence. And DIS holds at 4 while its evidence base
shrinks: §84.3 finds one disturbance testbed in eleven plants and measures it 95% exhausted.

**THE ORDERING THAT FOLLOWS IS NOT THE ONE THIS FILE HAD.** With COM and ROB each a point better
and INT permanently excluded as the gap that does not matter, **COM and INS are tied at -3** — and
they differ in kind: COM's remaining gap is 20-21 days of ONCE-per-plant characterisation on two of
four plants, which §72.12 shows is a property of a five-hour lap; INS's is a scaling law for the
touch-probe count that is unestablished on one plant. INS is the cheaper measurement and COM is the
larger customer cost.

**DIS is the column that most needs a SECOND PLANT rather than more work on the one it has**, and
§84.3 states the bar as a number for the first time: an exogenous component that is a large share
of the open-loop error AND worth more than the incumbent already recovers from knowing it. The mill
passes at 87% and 3/2-amplification; the barrel fails at ±5% and 1.008x.

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
