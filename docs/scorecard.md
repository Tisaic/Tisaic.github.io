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
| 1 | **SET** setpoint / path tracking | how much better does the part get? | **8** | 5 | six of six plants asked deploy: arm 8.23x, EMPS 33.15x held out, Wood-Berry 5.49x, extruder 6.12x, tank 2.91x, mill 2.59x, cart-pole 9.4-9.8x |
| 2 | **DIS** disturbance rejection | can it reject what the setpoint does not contain? | **4** | 6 | plan §71: a DECLARED, measurable, known-ahead disturbance yes (mill, roll eccentricity, 1.45x past both classical AGCs); an unmeasured or stochastic one no — the mill's own entry wander is why its cascade beats its map |
| 3 | **COM** commissioning cost | how long does the plant stop earning? | **4** | 8 | plan §72-§73: mill 55 min, tank 1.3 d, Wood-Berry 30 d, extruder 33 d. One of four inside "a day or less"; the other three are a property of a five-hour lap, not of the method (§72.12) |
| 4 | **CPU** runtime arithmetic and memory | does it fit the scan it has to run in? | **9** | 9 | 78-330 MAC/decision against a 10,000 MAC budget — 0.8-3.3%; 0.7-1.8 kB. `artefact.test.mjs` pins the deployed path bit-identical to a 117-line reimplementation that imports nothing. DeePC on the same axis is 145,082 MAC, 1451% of a scan |
| 5 | **GEN** generalisation | does it hold off the program it was commissioned on? | **6** | 7 | target 2 MET inside its bound (6.65-7.94x across a 5x feed span, nothing made worse, plan §52.41); target 1 partly — the deployed map transfers by construction and the retired memory did not (0.53x, reproduced by a textbook norm-optimal ILC) |
| 6 | **INS** instrument the customer must own | what does it cost to commission at all? | **3** | 9 | plan §52.42: the teacher needs GROUND-TRUTH TOOL POSITION at every sample — a laser tracker, worth **3.9x** over the best permanently mounted alternative, and motor encoders alone deliver **nothing** (all four training runs dropped). A touch probe on the cut part is measured in plan §74 |
| 7 | **SAF** safe failure | what happens when it cannot help? | **8** | 7 | it REFUSES with a stated reason and applies nothing — 4 of 4 cart-pole seeds on a well-tuned loop, the barrel before §66, Wood-Berry's 12 of 12 under `verifyRef`. `AutoStack` scores every rung on the machine and reverts |
| 8 | **ROB** robustness to what it was not shown | does it degrade or fall over? | **4** | 8 | CLAUDE.md states it plainly: change the feedrate, plant or path outside what was commissioned and it degrades — the coverage guard FADES rather than extrapolating (1.17-1.19x above the trained span), which is a refusal rather than robustness |
| 9 | **EXP** explainability | can the engineer see why? | **6** | 9 | the record IS the controller (a weight vector plus a window), and every rung prints its own verdict, cost and refusal reason — but nobody can read 111 coefficients the way they read a PID gain |
| 10 | **BRD** breadth of plant classes | how many kinds of machine? | **7** | 9 | eleven plants, three with real-hardware provenance, one open-loop unstable, one with a dominant transport delay. Two error classes of three tried (mechanical compliance/friction; periodic disturbance through a declared dead time); the class it loses on is strongly coupled MIMO |

## Which column is next, and why

The gaps against the incumbent, largest first:

```
  INS   3 vs 9   -6     the instrument the customer must own
  ROB   4 vs 8   -4     anything the commissioning did not see
  COM   4 vs 8   -4     was -5 before plan §72-§73
  EXP   6 vs 9   -3
  DIS   4 vs 6   -2     was -4 before plan §71
  BRD   7 vs 9   -2
```

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
