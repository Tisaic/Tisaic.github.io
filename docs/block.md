# FB_AutoFF — the auto-commissioning feedforward trim, as one function block

`lib/pilot/autoff.js` (commissioning) + `lib/pilot/autoff_runtime.js` (the deployed decision),
tested by `test/pilot/fb_autoff.test.mjs`. Plan §139. This is the object an ST port starts from;
it is written in JS for the test environment and shaped for IEC 61131-3 throughout.

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

### VAR_INPUT (`fb.in`)

| Field | Meaning |
|---|---|
| `xEnable` | FALSE: passthrough, no trim, IDLE. TRUE with a deployed record: washout, then run it |
| `xCommission` | rising edge starts a commissioning |
| `xAbort` | stops a commissioning: trim removed at once, the previous controller restored if one exists |
| `xArm` | FALSE ramps the trim to zero without forgetting the controller; during a commissioning it ABORTS it (a zeroed experiment would read as "no gain"). **Declare it `:= TRUE` in ST**, where a BOOL input defaults FALSE |
| `xCycleStart` | TRUE on the scan the repeating program starts (a sequencer already has this signal) |
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
| `eConvVerdict`/`eConvReason`, `eLearnVerdict`/`eLearnReason` | per rung: DEPLOYED, REFUSED or SKIPPED, with the reason |
| `rFactor`, `rConvFactor`, `rLearnFactor` | total over the bare loop; the conventional rung over bare; the learned rung over the conventional |
| `rHealth` | the last complete RUN lap's score over the commissioned score (0 = not measured) |
| `rCoverage` | the learned map's speed-coverage gain this scan |
| `rHeadroom`, `aUMax`, `nLap`, `nSettle`, `nReach`, `nWarmLaps`, `nFitRows` | what the analysis measured and derived |
| `udiLaps`, `udiCommissionScans`, `udiMacLast`, `udiMacPeak` | what it cost, and the worst scan |

### Persistence

`saveRecord()` returns the controller (`ST_AFF_Record`, fixed layout, FNV-1a checksum over the
IEEE-754 bytes of every field). `loadRecord(r)` **fails safe**: version, channel count, plant key
and checksum must all match or nothing is armed and `eReason` reads `RECORD_REJECTED`. A loaded
record starts with a predict-only washout and a bumpless ramp (TC_NGRC paybacks §7b).

## The host contract — all of it

1. Once per scan: write `aRefAhead` and `aMeas`, call `cycle()`, apply `aRefOut`.
2. Pulse `xCycleStart` on the first scan of each program repetition.
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
     ─► RUN   (health on every lap of the commissioned length)
```

- **The conventional rung** is `ClassicFF`'s algorithm in production: `[a, v, sign v]` per
  channel plus a bias, unit-peak scaled; unit-slot probes at a quarter of each channel's error
  peak; a least-squares operator; damped Newton with backtracking. The cap SCALES the whole
  correction by one factor from its exact peak; it never clips it.
- **The learned rung** is the teacher-free route (①d, §104-§126): a window of the ACHIEVED output
  fitted onto `c − y` from the excitation, deployed on the same window of the reference. The
  window is `distilkit.deriveWindow`'s rule `min(0.61·settle, lap/8)`, capped by the preview.
  Ridge and applied gain are both chosen ON THE MACHINE.
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

Measured (`fb_autoff.test.mjs`, the closed recipe 55→75→45→68→55 °C):

```
  conventional rung DEPLOYED 6.16x · learned rung REFUSED (LEARN_NO_GAIN) · total 6.16x
  bare 2.4973 °C rms → running 0.4067 °C rms, 6.14x measured independently
  ClassicFF on the same program, same plant:          0.4066 °C rms, 6.14x
  29 laps, 84,071 scans = 23.4 h of furnace at 1 s; worst scan 9,997 MAC of 10,000
```

The refusal of the learned rung is the §138 reading: what a self-tuned PID+FF leaves on this
loop is not a function of the reference window.

On Wood–Berry under its published BLT PI pair (two coupled channels), the conventional rung reads
3.53x and the learned rung 1.46x on top of it, for **5.17x** over the bare BLT loops. That took 69
laps and 225,845 scans, **15.7 days of column at 6 s per scan**, which is target 4's bill stated
rather than hidden. The program is the block's own closed two-channel recipe, so the figure is
**not comparable** to §64's step scenario (rule 19).

## What v1 does not contain, and what would justify adding each

| Not in v1 | Why not yet | What would add it |
|---|---|---|
| the teacher-taught distilled rung (`hff` + distillation) | its teacher costs 74-89% of a commissioning (§73.13) and ships on zero plants as a cascade | a plant where ①d is refused and the taught rung wins by more than rule 42's band at an affordable calendar (§119: the barrel, 1.66x) |
| the pilot cascade | ships on zero of ten plants (§86.7) | none foreseen |
| the lap-periodic memory | retired (owner's decision) | none |
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

## Notes for the ST port

- **Types.** Every `number` is an LREAL and every typed array an `ARRAY[0..MAX-1] OF LREAL`.
  `Int32Array`/`Uint8Array` map to DINT/BYTE. Enumerations are the `E_AFF_*` integers. Booleans
  are BOOL.
- **No allocation after construction.** `cycle()` and every job only index preallocated arrays.
  `saveRecord()` builds a new record, which in ST is a copy into a retained `ST_AFF_Record`.
- **Record layout.** `affFlatten` is the single definition of field order; the checksum is
  FNV-1a (32-bit, `Math.imul` = multiplication modulo 2^32) over each LREAL's 8 little-endian
  bytes (`MEMCPY` into an `ARRAY[0..7] OF BYTE`). **Bump `AFF_VERSION` on any layout change.**
- **Jobs.** Each job is a small state machine (`_job`, `_jobPhase`, `_jobI`, `_jobJ`) that
  checks `mac + cost < budget` before each unit, so it maps directly onto a CASE statement
  called once per scan. `affMinBudget(nc)` is the configuration check to run in `FB_init`.
- **The dense kernels** (`_cholRow`, `_cholSolve`, `_luStep`, `_luSolve`) take a leading
  dimension and charge nothing themselves; their callers charge the unit. Port them as
  functions on `REFERENCE TO ARRAY` with explicit `n` and `ld`.
- **Conformance.** Drive the ST block and this JS block with the same `aRefAhead`/`aMeas`
  sequence (the test's `makeHost` is the recipe). Every output must agree bit-exactly, because
  the arithmetic is IEEE-754 binary64 in the same order. Start with `affDecide` on a stored
  record, which is what `fb_autoff.test.mjs`'s RECORD block already checks in JS.
