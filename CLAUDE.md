# CLAUDE.md

Working notes for `Tisaic.github.io`. The **CLAUDE.md** button renders this file in the app, so
the current state can be read from a phone.

## What this project is

A static site on **GitHub Pages** (`https://tisaic.github.io`), used as a sandbox for a
browser-driven workflow: change it from Claude Code, look at it in Android Chrome, and feed the
console output back. Three pages hang off the hub: **FlexiSim** (the product, below), **FlowSim**
(a GPU lattice physics engine) and **NGRC** (a playground for next-generation reservoir computing).

## The product: FB_AutoFF

**Wire it up, press one button, use it — on any machine, for any program.** FB_AutoFF is a
self-commissioning feedforward trim, written as one scan-cyclic IEC 61131-3-shaped function block
(in JS for this test environment, shaped for an ST port). It sits between a machine's existing
reference source and its existing closed loop, on 1–4 channels, and adds a trim to the loop's
setpoint. It never replaces or reads inside the loop.

- `lib/autoff/autoff.js` — the block: commissioning and the scan cycle. Every heavy computation is
  a resumable job charged against a MAC budget before it runs (10,000 per scan = 10% of a 1 ms
  task, EVERY scan, commissioning included). Every experiment is applied through the same decision
  the deployed controller runs for ever. There are no host closures.
- `lib/autoff/runtime.js` — the deployed half: the decision `affDecide`, the record, its checksum.
  It imports nothing. This is what a machine runs for ever.
- `docs/block.md` — the engineer's page: interface tables, the host contract, the state flow,
  what v1 excludes and why, notes for the ST port.

**The host contract, all of it.** Each scan: write the reference preview (`in.aRefAhead`) and the
measurement (`in.aMeas`, in the reference's units); raise `in.xCycleStart` on the scan the program
starts a lap; call `cycle()`; apply `out.aRefOut` as the loop's setpoint; while `out.xOwnsRef` is
TRUE, hold the program (the block is exciting the machine).

**What it does when the button is pressed.** It records the machine as it arrived, then tries
three rungs, each scored on the machine and kept only if it beats what came before:

1. **conventional** — coefficients on the reference's own acceleration, velocity, direction of
   travel and a bias, fitted by probes and a damped Newton step (the classical self-tuned
   feedforward, with the hand taken out);
2. **learned** — a linear map of a window of the reference, fitted from an excitation the block
   generates inside the program's own envelope, with the conventional rung armed underneath;
3. **program table** — a correction for each scan of the commissioned program, learned lap by lap
   (P-type iterative learning, lead and filter width chosen per channel on the machine) with ① and
   ② armed underneath. It is applied only while the reference matches that program, now and as far
   ahead as the table reaches, after one clean lap of it; on any other program ① and ② run alone.

It refuses with a stated reason (`eReason`) rather than deploy something that did not win, and a
guard aborts if the error runs away while probing. The result is a checksummed record that loads
fail-safe: another plant key, another channel count or one moved bit is rejected.

**Where it stands** — one press on every machine in the plant library (`test/autoff/portfolio`,
the saved record reloaded onto the commissioned program and onto one it never saw):

```
                                         deployed                       main   table off   held-out
  PID temperature loop, nonlinear valve  conventional + table          30.48x      6.11x      5.13x
  Wood–Berry column under BLT PI         conventional + learned + table 12.61x     4.95x      4.73x
  EMPS servo axis                        conventional + table         817.51x    460.00x    200.46x
  cart-pole (open-loop unstable)         conventional (table refused)  25.88x       —        10.22x
  steam heat exchanger (real record)     conventional + table        2314.18x    149.85x    190.37x
  quadruple tank                         conventional + learned + table 28.48x     9.02x      6.57x
  extruder barrel                        learned (table refused)        1.14x       —         1.07x
  compliant 2R arm (the FlexiSim page)   learned + table               13.50x      2.21x      2.10x
  flexible robot arm (real record)       FAULT: guard tripped while probing, nothing applied
  cold mill gauge regulator              refused: a regulator, nothing to trim
```

"main" is the commissioned program with everything deployed; "table off" is the same program and
record with the host giving no lap edge, so ③ cannot engage (① and ② alone); "held-out" is a
program the block never saw, where ③ never engages. **Read "main" with the first bullet of Not
claimed: every plant here repeats exactly, and on a noise-free repeating simulation lap learning
removes nearly all of the error, so factors in the hundreds and thousands measure the simulator's
repeatability, not a controller (rule 14).**

**Nothing is made worse on any plant, on either program**, and no scan exceeds the budget.

**Not claimed:**
- **The program table's factors are not controller results on these plants.** Every plant repeats
  bit for bit. With white sensor noise at 1% and 10% of the bare error rms given to the block (the
  host scores the truth), the table added 1.0x–1.8x or was refused, and nothing was made worse.
  A real machine's lap-to-lap repeatability bounds it; that is not measured here.
- The table is learned on ONE program and is worth nothing on another: "held-out" is the
  transferable result.
- **"Nothing is made worse" is NOT established for arbitrary motion on the arm.** On eight programs
  it never saw (new shapes, sizes, positions, feeds; one lap each), a transferable model commissioned
  once gave 0.86x-2.45x — one of them worse than the untouched machine — and keeping it learning in
  production did not help (a short memory harmed, down to 0.47x). The portfolio's held-out check
  tries one program per plant. `test/plants/ilc-tables/experiments/transfer/FINDINGS.md`.
- **On the arm, the table's rms gain is bought with rough, inconsistent corners.** On the sharp square
  at 3e-3, lap learning takes the tool rms 12x down but the corner error goes from 1.3% to 6.9% faster
  than the jerk filter, and from 53% to 72% not common to the four corners (`cornerSignatures`). The
  block does not yet weigh corner shape. Learning allowed to keep only trials that stay smooth and no
  less consistent reached 2.9x in rms and 2.7x in peak with the baseline's character intact
  (scratch experiment, not in the block).
- The four corners of the arm genuinely differ (pose-dependent dynamics and the slow mode carried
  from corner to corner): one correction shared by all four removed only the small common part
  (0.277 -> 0.227). Consistent corners need a correction that knows the pose; none is built.
- Every plant is a simulation. Some have constants identified from a real record, but nothing
  here has moved a real machine.
- The linear plants sit inside the conventional rung's own model class: the PID loop with a
  linear valve, the real tanks below their overflow, and four synthetic loops. Their factors
  measure the class, not the method.
- Commissioning costs the plant real time: hours to days on the process plants, stated per plant
  by the portfolio test.
- The real flexible arm is not helped: its guard trips while probing.
- The arm plants need a tracker, a commissioning instrument the customer may not own.

## The FlexiSim page — `flexisim.html`

One machine and one block, driven scan by scan in the browser. The machine is the compliant 2R
arm on the bench cell: two lattice-elastic links, geared joints with backlash, a joint servo and a
compliance feedforward identified at four held poses. It is defined once in
`lib/flexisim/bench.js`, which both the page and the Node plant library use.

The block trims the two joint setpoints. Its measurement is the tool's position mapped back to
joints, which is a tracker. **Commission** runs the whole thing in about nine minutes of browser at
the default feed (519 s measured by the gate), and reports about 7.5x in its own per-joint measure,
12.6x against the ghost at the tool. The page shows both, and the CORNERS beside them: how much of
the corner error is not common to all four corners, how rough it is, and its peak, for the lap and
for the ghost (`cornerSignatures` in `lib/flexisim/contour.js`). The
**ghost** is the same machine with the block disarmed, recorded per plant and program; with
nothing commissioned the live lap IS the ghost, which is the page's control.

**The programs are ones the drives can follow** (`benchProgram` in `lib/flexisim/bench.js`): exact stops
at corners, the tool's acceleration limited to 3 g, and the interpolator's 100-scan jerk filter on the
joint setpoints with a matching dwell at each stop. The old deviation-rule corners asked the shoulder
for ~2,240x its torque at every corner of the sharp square (4.4% of scans saturated); now the closed
loop saturates on 0.02% of them, and the untouched machine's tool error fell 2.5x (0.70 to 0.28). The
bench test asserts both halves. The feed runs 5e-4 … 3e-3 (default 2e-3; the sharp square's lap is
13,067 scans at 3e-3 and 17,734 at 2e-3).
A program change keeps the block running: the program table switches off, because it belongs to
the commissioned program, and ① and ② carry on, which shows what transfers. Back on the
commissioned program the table re-engages after one clean lap. A plant change (K or E) rebuilds
the arm, and the stored record (in IndexedDB: with its table it runs to megabytes) is rejected
because the plant key moved.

## The plant library and the harness

- `test/plants/` — every machine the block is tested on, behind one interface:
  `{ key, name, units, nc, dt, main, heldOut, make(prog) → { meas(out), step(sp) }, about }`.
  - Each plant is a machine WITH ITS EXISTING CONTROL CLOSED: a PID, a servo, a stabiliser, or a
    steady-state model run open loop.
  - The block only ever trims that control's setpoint, in the units of the measured quantity.
  - Programs are CLOSED, so they repeat.
  - Flags:
    - `slow`: full tier only.
    - `regulator`: the setpoint never moves.
    - `insideClass`: linear, so the factor is not a result.
  - The real records and their identification are in `test/plants/records/` and
    `test/plants/sysid.mjs`, with provenance in `records/PROVENANCE.md`.
  - **To add a plant:** write one module, add it to `index.mjs`, and the portfolio test asks it.
  - `test/plants/ilc-tables/` — the bench arm's exact per-scan correction on six programs (three
    shapes × feeds 2e-3 and 3e-3), learned lap by lap and stored with a loader (`ilcTables()`),
    sha256s and the generator. The target any transferable model must reproduce; the bench test
    fails if the programs they were learned on stop matching the bench.
- `test/autoff/host.mjs` — the ONE host every test drives the block through: the contract above,
  plus a scorer that reads each lap of the program and never the block's excitation.
- `test/autoff/contract.test.mjs` — what the block promises: boundary, zero control, record, abort,
  permission, disable, program change, and agreement with the reference implementation.
- `test/autoff/portfolio.test.mjs` — one press on every plant (`ONLY=key,…` narrows it). It asserts
  that the commissioning settles, that nothing is made worse on the commissioned or held-out
  program, that the reported factor agrees with the host's independent score, and the budget.
  Factors are reported, never asserted.
- `test/reference/classic.mjs` — `ClassicFF`, the conventional rung's algorithm as separate code,
  kept so a test can commission the same plant both ways and require agreement.

## Verification (required before every push)

**No change ships unverified.**

1. **Run** `./test/run.sh` and get exit 0 with zero uncaught page errors.
   - Tiers: `--full` adds the slow plants, the 2R arm and the long browser scenarios.
   - Areas: default `flexisim`; `--all` or `--only=ngrc,flowsim,flexisim` select others.
   - Halves: `--node` and `--browser` run one half only.
   - Run `--full` for anything touching the block or a library default. Run `--all --full` for
     anything shared: `lib/lattsim`, `lib/ngrc`, `console-boot.js`, `test/run.sh`, `test/smoke.mjs`.
2. **Scrutinise** the diff: nothing unintended touched, no dead references, and the console
   bootstrap stays first and dependency-free.
3. **Look** at the screenshots in `test/screenshots/`: `01-home`, `02-console`, `03-docs`, plus the
   FlexiSim ones for a FlexiSim change.
4. Run `./stamp-version.sh` **last**, then commit, so the shipped commit carries its version.

**Owner's standing rules:**
- Performance claims on the arm are measured on the bench cell: K 0.25 / E 0.03, the sharp square
  at feed 3e-3, the fastest the page offers, with its exact-stop, 3 g, jerk-filtered timing. It is the
  softest cell on the hardest program the drives can follow. Report the corners (spread, roughness,
  peak) beside the rms: a smaller error that is erratic is not an improvement to an engineer.
- Everything runs on the PLC, including commissioning, identification and fitting, inside
  10,000 MAC per 1 ms scan, every scan. Any new fitting machinery must state its per-scan cost.

## Deploy model

GitHub Pages serves **`main`**, root. Changes are pushed directly to `main` (the owner waived PRs
for this repo). `.nojekyll` makes Pages serve files as-is, so the app can fetch raw `.md` files.
`stamp-version.sh` sets the build number (`git rev-list --count HEAD + 1`) and a UTC timestamp in
`index.html`, `flexisim.html` and `version.json`, and regenerates `docs-manifest.json` and
`modules.json`. On load, a page compares itself with `version.json` and raises a banner when stale.

## Conventions

- Self-contained, with no CDNs: `vendor/` holds marked, three.js and Plotly.
- Vanilla JS, no build step beyond the stamp script.
- The debug console (`console-boot.js`) is first in `<head>` and dependency-free. It injects its
  UI into the host page, so it states its own geometry.
- A Node global (`process`, `require`, `__dirname`) never appears in `lib/`, and `test/parse.mjs`
  rejects it: it throws only in the browser, and only when reached.

## THE RULES

Each one cost at least one defect that shipped. The measurements behind them are in
`docs/history/`.

### Verification
1. **Verify by the cheapest route that can actually falsify the claim.** Plain Node, then the
   browser, then a device. When a check moves down that list, say what the lower tier can no
   longer see.
2. **A check too slow to be run is a verification problem.** Shrink it against the assertion's own
   margin, measured.
3. **A flaky check is a bug report.** Three times here an intermittent failure was a real defect.
4. **A failing check can be stale in either direction.** Assert the PROPERTY against the machine's
   own limits, never a frozen number.
5. **Assert geometry, not presence.** An element can exist, report visible, and be off the screen.
6. **The commonest defect here is the wrong picture with no error.** Look at the screenshots.
   Where two views show one quantity, assert they agree.
7. **Neither `pageerror` nor a console listener reports unhandled rejections.** Assert the page's
   own error buffer.
8. **A conservation law that would pass with the physics removed is not a check.**
9. **Assert both halves.** The guard fires when it should AND not when it should not.
   - **A control that cannot fail is not a control.** Before quoting one, ask what would turn it
     red and what would turn it green.
     - A tier skip that exits 0 is not a pass.
     - A knob set to its own default proves nothing.
     - A filter that matches nothing proves nothing.
     - A check that cannot pass is as bad as one that cannot fail.
   - **Assert that the run produced its rows before comparing anything.**
   - **A guard is verified through the shipped path, not a unit test.** What fails is the wiring
     to it. Every guard needs its own flag, off by default. Score a guard on delivered outcome;
     degraded is not harmful.
10. **A rate beats an absolute number.**
11. **A test must drive the machine with the command it tells the model about.**

### Measurement
12. **Read the meter after it settles.**
13. **A measurement taken across a transient describes the transient**, and that includes scoring
    windows.
14. **A surprising measurement is a reason to check the instrument**, and a factor in the
    thousands is not a controller result.
15. **Two wrongs that agree are indistinguishable from two rights.** Bring in a route that does
    not share the mistake. Then COMPARE the two routes; printing both is not a comparison.
16. **A number computed from the model cannot check the model.** Put the question to the machine.
17. **The instrument fails before the model does.** Check the units, frame and window first.
18. **A common factor across plants that share no physics is a property of the code.**
19. **Match the metric's support to the claim's.** A ratio can move because its denominator moved.
20. **Compare at matched capacity and matched age.** Change one variable.
21. **A fix that improves everything has usually changed the measurement.** A real repair leaves
    the cases it should not touch byte-identical.
22. **A difference measured with a broken instrument is not a finding.**

### Instruments and reporting
23. **If the question cannot be answered from the picture, build the number.**
24. **A physics number must not move when a viewing control moves.**
25. **"Not measured" and "exactly zero" are different states.** So are "did not run" and "ran and
    declined".
26. **Zero is a limit, not an absence.** Never use a meaningful value as a sentinel; use `null`.
27. **Report the unflattering diagnostic first.**
28. **Keep the permanent debug dump**, so a phone report can be a paste.
29. **Draw a prediction where it is ABOUT, not where it was issued.**
30. **A page that describes its own behaviour in a second place will eventually describe the
    behaviour it used to have.** Generate the description from the thing.

### Models and commissioning
31. **A constant right for one plant must be re-derived for another**, and a benchmark is a
    constant too.
32. **Scale a threshold or prior to the quantity it acts on.**
33. **Success at cancelling a disturbance removes the evidence of it.** Commission with an
    unshaped, held probe, and never score a probe as production.
34. **Commission a model in the configuration it will run in.** A correction changes both the
    model's inputs and its target.
35. **A soft sensor inside a loop is positive feedback** unless it was trained over the operating
    points the loop will occupy.
36. **A model fitted to a repeating stream scores by learning where in the cycle it is.** Report
    on what it has not seen.
37. **A lag window must REACH the period of what it has to see.**
38. **A frozen standardisation belongs to the stream it was frozen on.**
39. **Decompose the error into bias and oscillation.**
40. **Learn the parameters that have no closed form; compute the ones that do.**
41. **An excitation built to the declared limits describes a machine the program does not run.**
    Size it from the program's own peaks.
42. **Selection: among candidates within 5% of the best measured score, take the cheapest.** Put
    the band on the improvement, never the residual. Break ties on the next criterion, never on
    loop order.
43. **A better optimiser on a wrong model buys nothing.**
44. **A sub-task restarted whenever its result is missing can only loop.** It needs a
    started-flag.
45. **Quiet is "it has not moved", not "it is moving slowly."** Measure travel over a window.

### Physics and geometry
46. **The boundary is where the SCHEME puts it**, half a cell out from the last cell centre.
47. **Every term of a projected quantity must be projected.**
48. **A bent link also TILTS everything downstream.**
49. **A sign convention is free to change only where every consumer is even in it.**
50. **Declare reads and writes.** Two operators must never write one field in a stage.

### Platform traps
51. **Silence is a failure mode.** Refuse to build rather than run producing zeros.
52. **A more specific CSS rule wins only the properties it names**, and `hidden` is only a UA
    `display:none`.
53. **WGSL `vec3<f32>` is size 12, align 16.** Write the offsets out, computed.
54. **`Plotly.react` compares data by reference.** Give every container a height and make it
    visible before drawing.
55. **A hidden canvas has no size, and 0/0 is NaN**, which passes every bounds check.
56. **Never destroy a buffer with a `mapAsync` in flight.**
57. **A rebuild that can throw needs `try/finally`.**
58. **A fix that makes state survive an operation makes its not-rebuilt dependencies reachable.**
59. **State what is NOT built, and the measurement that would change the answer.**
60. **A Node global in shipped library code is invisible to the half that could catch it.**
61. **A loop written twice will disagree.** FB_AutoFF exists because of this rule:
    - Mutate a shared configuration; never replace it.
    - Put the check on the boundary between copies.
    - Never guess a quantity's units across that boundary.

## Key files

| File | Purpose |
|---|---|
| `index.html` | The hub: header, debug console, docs viewer, launchers. |
| `console-boot.js` | The debug console, shared by every page, loaded first. |
| `flexisim.html` | FB_AutoFF on the compliant arm, scan by scan. |
| `flowsim.html` | FlowSim: the GPU lattice-field engine (Simulate / Verify / Architecture). |
| `ngrc.html` | The NGRC playground: four interactive tabs on `lib/ngrc`. |
| `lib/autoff/` | **The product**: `autoff.js` (the block) and `runtime.js` (the deployed decision). |
| `lib/flexisim/` | The bench machine: `bench.js` and the parts it is built from (`joint`, `link`, `arm2r`, `compensator`, `toolpath`, `contour`, `approach`). |
| `lib/lattsim/` | The lattice engine: fields, operators (fluid, scalar, elastic, frame), solver, WebGPU and CPU backends. |
| `lib/ngrc/` | The NGRC library, with golden-vector parity tests (`robotcomp` is also the arm's compliance feedforward). |
| `lib/probesense/` | Soft-sensing a field from one point in it (FlowSim). |
| `test/run.sh` | The suite. |
| `test/smoke.mjs` | Playwright checks and screenshots for every page. |
| `test/plants/`, `test/autoff/`, `test/reference/` | The plant library, the block's harness and tests, the independent reference. |
| `test/inventory.test.mjs` | Classifies every module in `lib/`: DEPLOY, COMMISSION, BENCH or OTHER. It fails on an unclassified, unreachable or impure one. |
| `test/lattsim/`, `test/ngrc/`, `test/flexisim/`, `test/probesense/` | Each library against its closed forms or golden vectors. |
| `stamp-version.sh`, `version.json`, `modules.json`, `docs-manifest.json` | Versioning and stale-page detection. |
| `vendor/` | Self-hosted marked, three.js and Plotly. |

## Where the history lives

`docs/history/` holds the record of how everything got here: the FlowSim, NGRC and FlexiSim build
logs, and the R&D programme that produced FB_AutoFF. That programme includes:
- `plan.md`: 139 sections of measurements and retractions;
- `CLAUDE-rd.md`: the previous version of this file, with the north-star scorecard and every
  plant's history;
- the roadmap, program, scorecard, flagship and EDM notes.

The R&D code was deleted when the block replaced it. **The last commit carrying the whole R&D tree
is `005da94`**. Recover any file with `git checkout 005da94 -- <path>`; the local tag
`rd-archive-2026-09` marks the same commit.
