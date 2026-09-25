# FB_AutoFF — the auto-commissioning feedforward trim, as one function block

`lib/autoff/autoff.js` (commissioning) + `lib/autoff/runtime.js` (the deployed decision),
tested by `test/autoff/` — its contract, and one press on every machine in `test/plants/`. This is
the object an ST port starts from; it is written in JS for the test environment and shaped for
IEC 61131-3 throughout. Section references (§NN) point into the development record,
`docs/history/plan.md`.

## What it is, in one paragraph

A block that sits between an existing reference source (a recipe generator, a motion planner)
and an existing closed loop's **setpoint**, on 1-4 channels, and adds a **trim** to that
setpoint. Press `xCommission` and it identifies, fits and **scores every candidate on the
machine**, keeping only what beats the machine as it arrived; then it runs the trim for ever at
a few hundred multiply-adds per scan. It never replaces the loop, never reads the loop's
internals, and never ships a correction that did not win.

## Why it is ONE block (plan §138)

An end-to-end trace of the easiest plant in this project found fourteen defects of one shape: a
piece of the commissioning loop written twice — once on the library's path, once in a closure a
host writes — with nothing checking that they agree. This block has **no host closures**. It is
called once per scan with the reference and the measurement, and every experiment it runs (the
baseline, each probe, each Newton trial, the excitation, each candidate map) is applied by
writing it into the live record and calling the same `affDecide` the deployed controller calls.
What it scored is what it ships, by construction, and the rung below is always under the rung
being taught, because there is only one loop.

## Where it sits

```
  recipe / motion planner ──aRefAhead[0..nAhead]──► FB_AutoFF ──aRefOut──► existing loop (PID, servo) ──► plant
                                                        ▲                                                  │
                                                        └──────────────────── aMeas (PV) ◄─────────────────┘
```

## Interface

### Configuration (constructor) — deliberately short

| Field | Type | Default | Meaning |
|---|---|---|---|
| `nChannels` | INT | — | 1..4 |
| `nAhead` | INT | — | how many scans ahead the reference source can supply (1..2048) |
| `aAuthority` | ARRAY OF LREAL | 0 = derive | largest trim per channel, in reference units. 0 **derives** it as 3x the baseline error rms (the same default the ladder's specs use) and reports it in `out.aUMax` |
| `udiKey` | UDINT | 0 | the plant key. Change it when the loop is retuned and a stored record will no longer load (§52.37) |
| `udiMacBudget` | UDINT | 10000 | multiply-adds allowed per scan (10% of a 1 ms task). A budget below `affMinBudget(nChannels)` is **refused at construction** — it could never complete a job |
| `sScope` | `'FULL'`/`'CONVENTIONAL'` | `'FULL'` | `CONVENTIONAL` never runs the learned rung |
| `udiSeed` | UDINT | 1 | the excitation's seed; commissioning is deterministic |
| `rGuardFactor` | LREAL | 4 | abort commissioning if any channel's error exceeds this x its baseline peak |
| `udiProgLaps` | UDINT | 60 | laps the program table may spend learning (warm-up laps included); 0 turns the rung off (`PROG_OFF`) |
| `xKeepSign` | BOOL | FALSE | TEST ONLY: never try the conventional rung without its sign terms |

### VAR_INPUT (`fb.in`)

| Field | Meaning |
|---|---|
| `xEnable` | FALSE: passthrough, no trim, IDLE. TRUE with a deployed record: washout, then run it |
| `xCommission` | rising edge starts a commissioning |
| `xAbort` | stops a commissioning: trim removed at once, the previous controller restored if one exists |
| `xArm` | FALSE ramps the trim to zero without forgetting the controller; during a commissioning it ABORTS it (a zeroed experiment would read as "no gain"). **Declare it `:= TRUE` in ST**, where a BOOL input defaults FALSE |
| `xCycleStart` | TRUE on the scan the repeating program starts (a sequencer already has this signal) — in commissioning AND in production: the program table is indexed from this edge, and without it the table never engages |
| `xExciteAllowed` | grants the block the setpoint for a generated excitation inside the production envelope. FALSE: the learned rung is SKIPPED, stated |
| `aRefAhead` | the reference NOW and up to `nAhead` scans ahead, row-major `[i * 4 + c]` |
| `aMeas` | each channel's achieved output, in the SAME UNITS as its reference |

### VAR_OUTPUT (`fb.out`)

| Field | Meaning |
|---|---|
| `aRefOut` | the setpoint to apply: reference + trim |
| `aTrim` | the trim alone |
| `eState`, `eReason` | where it is and why (`E_AFF_STATE`, `E_AFF_REASON`) |
| `xBusy`, `xDone`, `xDeployed` | commissioning; finished (latched until the next start); a controller is running |
| `xOwnsRef` | **the host must hold its program while this is TRUE** |
| `xRecommission` | a REQUEST: three laps of the commissioned program in a row worse than 1.5x the commissioned score |
| `eConvVerdict`/`eConvReason`, `eLearnVerdict`/`eLearnReason`, `eProgVerdict`/`eProgReason` | per rung: DEPLOYED, REFUSED or SKIPPED, with the reason |
| `rFactor`, `rConvFactor`, `rLearnFactor`, `rProgFactor` | total over the bare loop; the conventional rung over bare; the learned rung over the conventional; the program table over the rungs below it |
| `xProgActive`, `rProgGain`, `iPhase` | the program table is being applied this scan; its gain (0 or 1); the scan's position in the lap (-1 before the first edge) |
| `rHealth` | the last complete RUN lap's score over the commissioned score (0 = not measured) |
| `rCoverage` | the learned map's speed-coverage gain this scan |
| `rHeadroom`, `aUMax`, `nLap`, `nSettle`, `nReach`, `nWarmLaps`, `nFitRows` | what the analysis measured and derived |
| `udiLaps`, `udiCommissionScans`, `udiMacLast`, `udiMacPeak` | what it cost, and the worst scan |
| `xConvSign`, `rConvSignFree` | the deployed conventional rung carries its `sign v` terms; what the step-free candidate scored (0 = not tried) |

### Persistence

`saveRecord()` returns the controller (`ST_AFF_Record`, fixed layout, FNV-1a checksum over the
IEEE-754 bytes of every field). `loadRecord(r)` **fails safe**: version, channel count, plant key
and checksum must all match or nothing is armed and `eReason` reads `RECORD_REJECTED`. A loaded
record starts with a predict-only washout and a bumpless ramp (TC_NGRC paybacks §7b).

## The host contract — all of it

1. Once per scan: write `aRefAhead` and `aMeas`, call `cycle()`, apply `aRefOut`.
2. Pulse `xCycleStart` on the first scan of each program repetition, always.
3. While `xOwnsRef` is TRUE, **hold** the program counter. The block ramps back to the held value
   before releasing.

## The flow

```
IDLE ─xCommission─► DISARM (trim ramps to 0: the baseline is the machine as it ARRIVED)
     ─► WAIT_LAP ─► RECORD (one bare lap stored)
     ─► ANALYSE (bare lap; sliced job: envelope, unit-peak scales, baseline, authority, Gram,
                  projection, headroom, settle, window; the second bare lap measures the noise)
     ─► CONV_PROBE (m+1 laps, m = nb·nc: unit-slot probes then one combined probe)
     ─► CONV_IDENTIFY (sliced job: least-squares operator and its LU; bare laps meanwhile)
     ─► CONV_REFINE (≤ 13 Newton trials, one lap each, backtracking, monotone guard)
     ─► EXCITE / RETURN (block owns the setpoint: 4 laps of generated excitation, conventional
                          rung armed underneath; fit rows accumulate; then a ramp home)
     ─► LEARN_WAIT (sliced job: six ridge candidates) ─► LEARN_BAR (the bar lap)
     ─► LEARN_SCORE (six ridge laps, then four gain laps on the best)
     ─► PROG_LEARN (the bar lap with the table at zero, then trials of warm lap + scored lap;
                    sliced job 5 builds each trial; a closing lap measures what is kept)
     ─► RUN   (health on every lap of the commissioned length)
```

- **The conventional rung** is `ClassicFF`'s algorithm in production: `[a, v, sign v]` per
  channel plus a bias, unit-peak scaled; unit-slot probes at a quarter of each channel's error
  peak; a least-squares operator; damped Newton with backtracking. The cap SCALES the whole
  correction by one factor from its exact peak; it never clips it. When the refine ends, the rung
  is tried once more WITHOUT its `sign v` terms: they step the setpoint at every reversal (0.031 rad
  on a joint at the arm's corners, which it answers with a visible jerk). Rule 42: if the step-free rung is
  indistinguishable on the gain (within 5% of it, or twice the noise margin), it ships. Where the
  terms earn their gain they stay: on the EMPS axis (real friction) and on the soft arm.
- **Bumpless is a fade, not a slew limit.** In RUN the whole trim fades in and out over 1% of the
  lap (on load, disarm, washout), and so does the program table's gain when it engages or leaves
  on a change seen ahead (a program that already differs cuts it at once);
  faded in, the trim is EXACTLY the decision. It used to cap the trim's change at `uMax / rampN` a
  scan in every RUN scan, which clipped any correction moving faster: on the arm on its jerk-limited
  paths production ran a slewed copy of what was scored and settled at 3.8e-3 rms per joint against
  the 7.6e-4 scored (reported 7.35x, 3.42x against the ghost). Now production equals the last scored
  lap.
- **The excitation** moves as quintics that exceed none of the program's own peaks: speed,
  acceleration AND jerk (rule 41). Sized from the speed alone, a short move asked for ~150x the
  program's acceleration. Its guard is twice the guard elsewhere: its error is bounded but larger
  than the program's (3.6x the program's baseline peak routinely on the arm, 4.0x at worst), and a
  runaway still trips it.
- **The learned rung** is the teacher-free route (①d, §104-§126): a window of the ACHIEVED output
  fitted onto `c − y` from the excitation, deployed on the same window of the reference. The
  window is `distilkit.deriveWindow`'s rule `min(0.61·settle, lap/8)`, capped by the preview.
  Ridge and applied gain are both chosen ON THE MACHINE.
- **The program table** is P-type iterative learning on the commissioned program, with ① and ②
  armed underneath as they will run. Each trial is `U' = Q(U − β·e(k + τ))` per channel: the kept
  table less a step of the error it was measured with, read τ scans ahead because the loop answers
  late, then `Q`, a circular moving average of half-width W applied twice. τ and W have no closed
  form on a machine the block cannot see inside, so each channel walks a ladder of eight (τ, W)
  pairs scaled to the lap (τ ∈ L·{1/128, 1/64, 1/256, 1/32}, W ∈ L·{1/100, 1/200}), moving on after
  three trials that did not gain 2%; β starts at 0.5 and halves on a trial that made the channel
  worse. A channel keeps its trial only if its own lap rms fell; a trial kept on some channels and
  not others is measured again as kept, so every score the rung holds is a lap of exactly the table
  it holds. Every table is scored on its SECOND lap — the learning reads a lap's error as the answer
  to that lap's table alone, which is true only once the machine is periodic under it; scored on
  its first lap the arm stalled at 3.3x/2.0x. Six trials in a row kept on no channel end it early.
  Job 5 costs about 10 MAC per sample per channel and finishes inside the lap's unscored 5%.
- **The program table's guard.** The table is right only on its own program. At a lap edge it may
  engage only if the lap just ended was its program throughout and of its length (the machine's
  state at a lap start is the last lap's doing); then it stays on while the reference matches the
  stored one within `rProgTol` = 1e-6·(1 + span), both NOW and at the preview offset the table
  reaches (`nProgAhead` = the longest lead plus two filter widths, capped by `nAhead`). The first
  scan that fails turns it off until an edge closes a clean lap again. A program change therefore
  turns it off BEFORE the new reference arrives, as far ahead as the preview allows.
- **Every experiment switches at a lap boundary**, and the first 5% of every lap is unscored. Where
  the loop's own settle, read off the production lap's holds, is longer than that drop or
  unmeasurable, each experiment gets **one unscored warm-up lap** first (`nWarmLaps`).
- **Every heavy computation is a resumable job** that stops when the scan's MAC budget is spent,
  and each unit of work is charged before it runs. `udiMacPeak` is asserted ≤ the budget on every
  scan of every test, the commissioning included.

## A typical use: the §137 temperature loop

The engineer has a PI loop on a furnace zone, a recipe generator producing ramp-and-hold
setpoints, and a sequencer that knows when a recipe starts. Wiring:

1. `aRefAhead` ← the recipe generator evaluated at now … now+400 s (it knows its own future).
2. `aMeas[0]` ← the zone temperature. `xCycleStart` ← the sequencer's "recipe start" bit.
3. The PI loop's setpoint ← `aRefOut[0]`. The sequencer's hold ← `xOwnsRef`.
4. `nChannels 1, nAhead 400`, everything else default. `xExciteAllowed` TRUE because the
   engineer accepts setpoint moves inside the recipe's own envelope, at its own ramp rate.
5. Press `xCommission` at the start of a production run and leave it.

Measured (`test/autoff/`, the closed recipe 55→75→45→68→55 °C):

```
  conventional rung DEPLOYED 6.12x · learned rung REFUSED (LEARN_NO_GAIN) · program table DEPLOYED 5.04x
  total 30.79x reported; 30.48x measured independently by the host on the running machine
  the same record with the table unable to engage: 6.11x; on a recipe it never saw: 5.13x
  ClassicFF (test/reference/, sharing no code) on the same program and plant: 6.15x
  67 laps = 2.0 days of furnace at 1 s; worst scan 9,997 MAC of 10,000
  with sensor noise at 10% of the bare error: table 1.84x, 30.28x measured (contract NOISE)
```

The refusal of the learned rung is the §138 reading: what a self-tuned PID+FF leaves on this
loop is not a function of the reference window. The table's 5x is what repeating the same recipe
buys on a loop that repeats exactly; the day of furnace it costs is the price of that.

## Across the plant library

One press on every machine in `test/plants/`, commissioned on its main program and then loaded
from the SAVED RECORD onto fresh machines running the same program and a program it never saw
(`test/autoff/portfolio.test.mjs`, seed 7):

```
  plant                                  deployed                     main   table off  held-out  laps  plant time
  PID temperature loop, nonlinear valve  conventional + table        30.48x     6.11x     5.13x    67    2.0 d
  Wood–Berry column under BLT PI         conv + learned + table      12.61x     4.95x     4.73x   127   11.1 h
  EMPS servo axis                        conventional + table       817.51x   460.00x   200.46x    55    6.4 min
  cart-pole (open-loop unstable)         conventional (table refused) 25.88x      —      10.22x    67    6.7 min
  steam heat exchanger (real record)     conventional + table      2314.18x   149.85x   190.37x    67   30.2 h
  quadruple tank                         conv + learned + table      28.48x     9.02x     6.57x   131    2.5 d
  extruder barrel                        learned (table refused)      1.14x      —        1.07x   103   20.3 d
  compliant 2R arm (the FlexiSim page)   learned + table              8.54x     1.85x     1.86x    94   18.1 min
  flexible robot arm (real record)       FAULT — its guard tripped while probing; nothing applied
  cold mill gauge regulator              refused — a regulator, nothing to trim
```

"table off" is the commissioned program and the same record with no lap edge from the host, so the
program table cannot engage; "held-out" is a program never seen, where it never engages (asserted).
**The "main" column is not a set of controller results**: every plant here repeats exactly, and
iterative learning on an exactly repeating simulation removes nearly all of the error (see NOT
CLAIMED). The transferable result is "held-out".

Nothing is made worse on any plant, on the commissioned or the held-out program. Three rows not
shown are linear plants inside the conventional feedforward's own model class (a linear valve, the
real tanks below their overflow, four synthetic loops), whose factors measure the class and are not
results. The Wood–Berry figure is on the library's own closed two-channel recipe and is **not
comparable** to the literature's step scenario.

## What v1 does not contain, and what would justify adding each

| Not in v1 | Why not yet | What would add it |
|---|---|---|
| the teacher-taught distilled rung (`hff` + distillation) | its teacher costs 74-89% of a commissioning (§73.13) and ships on zero plants as a cascade | a plant where ①d is refused and the taught rung wins by more than rule 42's band at an affordable calendar (§119: the barrel, 1.66x) |
| the pilot cascade | ships on zero of ten plants (§86.7) | none foreseen |
| a table that transfers to another program | the transferable rung (②) is capped near 1.8x on the arm by its linear map class; the table does not transfer by construction | a map class that reaches the table's result on a program it never saw |
| placement scoring (①d before ①) | costs a scored run; wins on two plants of six (§133) | a plant family where it is decisive |
| runtime guards beyond the speed fade | every one measured was a loss or unreachable (§100, §136.5) | a distribution over the refused region with geometric mean ≤ 1.000x |
| MIMO scaling per channel | measured harmful: bends the Newton direction (§139) | — |

## NOT CLAIMED

- One seed per plant, and one program per plant. The 4-channel test plant is LINEAR and sits
  inside the conventional basis's own class, so its factor measures the class (§55). It is there
  to prove completion and the budget at four channels, not a result.
- The conventional trim is computed from the REFERENCE's motion. When the learned trim is also
  armed, the loop's true command is reference + learned trim, so a second-order term
  `conv(learned)` is missing. It is small wherever the learned trim is small against the
  reference's own motion; it is not measured.
- The excitation draws independent levels inside each channel's own production range. On a plant
  where some COMBINATION of channel levels is unsafe, the engineer must leave `xExciteAllowed`
  FALSE; the block cannot know that.
- The guard is `rGuardFactor` x the baseline peak. A plant whose own probes legitimately exceed
  that (a derivative cross-coupling was measured doing it, §139) needs a larger factor, and says
  so by faulting — which restores the previous controller rather than leaving the machine bare.
- The health check scores only laps of the commissioned length. A different program is not
  scored, and `rHealth` reads 0 (not measured) rather than a number.
- **The program table's factors on the simulated plants measure how exactly a simulation repeats.**
  Every plant here repeats bit for bit, so iterative learning can remove almost all of the error,
  and several plants read in the hundreds or thousands with it (rule 14). With white sensor noise
  at 1% and 10% of the bare error rms (the host scores the truth; `contract.test.mjs` NOISE), the
  table gave 1.0x–1.8x on top or was refused, and nothing was made worse. A real machine's
  lap-to-lap repeatability bounds it; it is not measured here.
- The table is learned on ONE program and is worth nothing on another; the held-out column is the
  transferable result, and the portfolio's "table off" column is the commissioned program without it.
- The record grows with the table: two arrays of `nProgLap × 4` LREAL, up to 4 MB at the largest
  lap (65,536 scans). Its checksum and copies cover only the used part, but `saveRecord`,
  `loadRecord` and the copy from the live record into the deployed one at the end of commissioning
  are not sliced: on a PLC they are a one-shot MEMCPY of up to 4 MB and an FNV pass over it, outside
  the scan budget. Slicing them is ST-port work, not done here.

## Notes for the ST port

- **Types.** Every `number` is an LREAL and every typed array an `ARRAY[0..MAX-1] OF LREAL`.
  `Int32Array`/`Uint8Array` map to DINT/BYTE. Enumerations are the `E_AFF_*` integers. Booleans
  are BOOL.
- **No allocation after construction.** `cycle()` and every job only index preallocated arrays.
  `saveRecord()` builds a new record, which in ST is a copy into a retained `ST_AFF_Record`.
- **Record layout.** `affFlatten` is the single definition of field order (the program table
  contributes `nProgLap × 4` entries of each array, so the flattened length follows `nProgLap`,
  which the checksum covers); the checksum is
  FNV-1a (32-bit, `Math.imul` = multiplication modulo 2^32) over each LREAL's 8 little-endian
  bytes (`MEMCPY` into an `ARRAY[0..7] OF BYTE`). **Bump `AFF_VERSION` on any layout change.**
- **Jobs.** Each job is a small state machine (`_job`, `_jobPhase`, `_jobI`, `_jobJ`) that
  checks `mac + cost < budget` before each unit, so it maps directly onto a CASE statement
  called once per scan. `affMinBudget(nc)` is the configuration check to run in `FB_init`.
- **The dense kernels** (`_cholRow`, `_cholSolve`, `_luStep`, `_luSolve`) take a leading
  dimension and charge nothing themselves; their callers charge the unit. Port them as
  functions on `REFERENCE TO ARRAY` with explicit `n` and `ld`.
- **Conformance.** Drive the ST block and this JS block with the same `aRefAhead`/`aMeas`
  sequence (`test/autoff/host.mjs` is the recipe). Every output must agree bit-exactly, because
  the arithmetic is IEEE-754 binary64 in the same order. Start with `affDecide` on a stored
  record, which is what `test/autoff/contract.test.mjs`'s RECORD block already checks in JS.
