# The digital twin — measured 2026-09-24

**The breakthrough.** A correction learned entirely on a MODEL of the arm, never on the machine, and
applied ONCE to programs the machine has never run:
- gives 11-27x with the full lattice twin;
- gives **6-20x with a reduced-order twin identified from the tool alone**, small enough for a
  controller;
- gives **4.4-34x on machines the twin was not built to match** (a tool payload, a stiffening
  gearbox, friction, triple backlash, all at once), once the twin identifies its payload and
  stiffening from the tool too. Every corner metric shrinks, and nothing is made worse.

Every correction learned from data and meant to transfer gave 0.86-2.45x on the same programs.

## Why the transferable models capped (`decomp.mjs`, `modes.mjs`, `arx.mjs`, `arx2.mjs`)

- Where the error comes from, exactly (sum check 1e-17), rms per joint on the untouched machine:
  LINK BENDING is the largest term (5.3e-2 rad on joint 1 on the circle at 3e-3, three times the
  total error) and the conventional controller does not compensate it at all; its compliance shift
  cancels the gearbox wind-up and nothing else.
- The dynamics move with pose: one coupled mode of ~2,700-3,200 scans, and a second whose period
  swings 4x across the workspace (550 to 2,000 scans).
- A data-fitted model WITH STATE (ARX on the error, LTI and pose-scheduled) still could not predict
  the untouched error on unseen programs (NRMSE 0.55-1.23 on joint 1). No fixed-coefficient model
  follows modes whose frequency moves with pose; the physics does, through M(q).

## The twin (`twin.mjs`, `ident.mjs`)

The twin is the bench arm's own structure (links, gearboxes, the servo, the machine's own
conventional controller and its calibration), with gearbox stiffness K, link stiffness E and link
damping D as unknowns. The correction for a program is learned by lap learning ON THE TWIN
(15 steps, 30 twin laps, offline), then applied once to the real machine.

| unseen program | exact twin | K x1.2, E x0.8 | K x1.2, E x0.8, D x1.5 | IDENTIFIED from the machine |
|---|---|---|---|---|
| sq6 f2.5 | 10.47x | 5.65x | 3.42x | **10.99x** |
| circ3 f3 | 235.70x | 7.06x | 4.35x | 120.36x |
| rnd8x6 f2.5 | 27.40x | 6.34x | 3.73x | **26.86x** |
| bench sharp 3e-3 | 9.27x | 5.87x | 3.60x | **13.16x** |

Identification: 40,000 scans of commissioning excitation measured on the machine; a coordinate
search over (K, E, D) in log space, starting 20-50% wrong, reproduces the machine's error to 1.33%
and recovers K x0.995, E x1.011, D x0.999 (truth 1, 1, 1) in 79 twin runs.

## The reduced-order twin, identified from the tool alone (`rident.mjs`, `rtwin.mjs`)

The lattice twin is far too heavy for a PLC. The reduced twin keeps the rigid 2R chain, both
geared joints, the servo and the machine's conventional controller, and replaces each lattice link
by TWO resonant modes driven by the inputs the lattice sees in its own frame (transverse gravity,
angular acceleration, and for link 2 the elbow's acceleration). Its outputs are link 1's tip
deflection and slope and link 2's tip deflection, assembled into the tool exactly as `toolXY` does.

**Identified from the tool alone.** A real machine gives only a tracker reading of the tool. The
links never push back on the joints (one-way coupling), so ONE rigid run of the twin per gearbox
stiffness K gives the pose, the links' frame inputs and the tool's Jacobian with respect to the
three deflections. The tool error is then LINEAR in the modal gains: least squares, with the mode
periods and dampings searched on a grid and K searched outside. 40,000 scans of excitation. It
lands on K x1.10 (truth 1: the modes absorb a little of the joint compliance) and misses the
machine's held-out tool error by 6.0%.

**Applied ONCE to the lattice machine** (15 learning steps, 32 twin laps, 1-2 s each, none on the
machine), on the eight unseen programs where every transferable model gave 0.86-2.45x
(`../transfer/FINDINGS.md`, the frozen row) and on the bench program:

| program | before (frozen model) | reduced twin, fitted from the links' own signals | from the TOOL alone | from the tool, 50% tracker noise | twin's miss of the untouched error |
|---|---|---|---|---|---|
| sq6 f2.5 | 1.66 | 11.51 | **8.02** | 8.80 | 8.4% |
| circ3 f3 | 0.86 | 41.11 | **13.53** | 13.59 | 7.2% |
| rect7x5 f1.5 | 1.63 | — | **6.14** | 7.16 | 7.8% |
| rnd6 f2 | 1.68 | — | **12.25** | 12.15 | 6.2% |
| circ3.5 f2 | 1.28 | — | **10.51** | 10.67 | 7.4% |
| sq5 f3 | 1.67 | — | **13.31** | 13.33 | 7.1% |
| rnd8x6 f2.5 | 1.45 | 23.06 | **11.51** | 11.29 | 7.5% |
| circ2.5 f1 | 2.45 | — | **20.47** | 20.06 | 3.5% |
| bench sharp 3e-3 | — | 14.38 | **10.95** | 8.60 | 8.9% |

- **The factor is set by the twin's fidelity, not by the learning.** It tracks 1 / (the twin's miss
  of the untouched error). Learning four times longer on the twin (60 steps) changes nothing
  (6.0-20.5x).
- **Tracker noise does not move the identification.** At 10% and 50% of the error rms it picks the
  same K and the same modes. Least squares averages white noise away over 40,000 scans.
- **Every corner metric improves in absolute terms, on every program.** Tool-only twin, untouched
  -> corrected:
  - the part not common to the corners falls 4-11x;
  - the fast part falls 1.8-8x;
  - the peak falls 4-12x.

  Bench sharp 3e-3: not common 1.5e-1 -> 1.6e-2, fast 3.7e-3 -> 1.1e-3, peak 0.600 -> 0.074. The
  shares rise (53% -> 59%, 1.3% -> 4.0%) because the smooth part is what the correction removes
  (rule 19).

## A machine the twin does not model (`mismatch.mjs`, `rident3.mjs`)

The reduced twin shares the machine's structure because both are built from the same code, which
flatters it (rules 15, 16). So the MACHINE is changed in its physics only; its drive and
conventional controller keep their nominal model, as a real drive's configured payload would:
- `payload`: a point mass at the tool, 20% of the links' mass, in the rigid solve only;
- `backlash3`: three times the gearbox backlash;
- `friction`: Stribeck friction on both motors, breakaway 8% and Coulomb 5% of the hold torque;
- `stiff`: a progressive gearbox, K 50% higher at the gravity-hold wind-up;
- `all`: every one of the above;
- `off`: all of them at values off the search grid (payload 0.13, stiffening 0.35).

**The nominal twin** (K-only search) was:
- unmoved by backlash and friction: 5.8-17.5x;
- badly hurt by the payload (2.1-7.8x) and the stiffening (2.0-7.0x);
- never worse than the untouched machine.

**The twin now carries a payload and gearbox stiffening, identified from the tool.** How they are
found matters:
- A coordinate search at fixed modes stalls (miss 12-29%): the modes, picked under the wrong
  physics, absorb the mismatch.
- The oracle settles it. With the true physics and only the modes fitted, the miss is 5.4-8.9%.
  The model was right and the search was wrong (rule 43 checked in the other direction).
- `rident3.mjs` searches the physics against a FIXED BANK of 16 modes per link, gains by least
  squares, so its objective does not hinge on a discrete mode choice. It uses a 48-run grid, then a
  coordinate refine, and only then picks the compact two-mode twin.

| machine | identified from the tool (truth) | twin's miss | first use on the lattice machine, nine unseen programs |
|---|---|---|---|
| nominal | K x1.09, payload 0, stiff 0 (1, 0, 0) | 6.1% | 7.3-21.6x |
| payload | K x0.975, payload 0.181 (1, 0.2) | 5.4% | 8.9-34.1x |
| stiff | K x1.000, stiff 0.500 (1, 0.5) | 8.6% | 6.2-22.3x |
| all | K x0.994, payload 0.191, stiff 0.445 (1, 0.2, 0.5) | 9.0% | 4.4-12.8x |
| off (off-grid) | K x1.045, payload 0.153, stiff 0.305 (1, 0.13, 0.35) | 8.8% | 4.6-22.1x |

- Both halves hold. On the nominal machine the payload and the stiffening come back at exactly 0.
- The grid contains 0.2 and 0.5, which flatters the search. The `off` machine is the control; its
  values are recovered to within 0.02 and 0.05.
- **Corners, all 54 program x machine rows (six machines, nine programs each): every corner metric
  is smaller than on the untouched machine.**
  - The part not common to the corners falls 2.6-21x.
  - The fast part falls 1.4-18x.
  - The peak falls 3.1-36x.
- Nothing was made worse anywhere. The worst factor on any machine is 4.4x.

## What the identification has to excite (`rident3b.mjs`)

Rule 41 says to size an excitation from the program's own peaks. For a PHYSICS twin that is wrong.
Identified inside the envelope of the smallest, slowest program (a 2.5 circle at feed 1e-3: q1
span 0.43 rad, q2 0.55, peak speed 1.1e-4 rad/scan, against 0.93, 0.95 and 2.5e-4 for the bench
square), the gearbox comes out at K x1.89. The slow excitation hardly loads it, and the modes
absorb what K should explain. The held-out miss is still 8.3%, on that same excitation.

| program | twin from the working range | twin from the small program's envelope | its miss of the untouched error |
|---|---|---|---|
| circ2.5 f1 (the one it was identified inside) | 21.55 | **12.26** | 6.5% |
| the other eight | 7.28-14.63 | **2.76-4.14** | 21-37% |

- Never worse, but the parameters do not transfer. The identification must excite the machine's
  working range, in pose and in speed, not one program's.
- **The twin's miss of a program's untouched lap says, before anything is applied, whether that
  program is inside what the twin knows** (6.5% here against 21-37%). A block without the first two
  rungs records exactly that lap. This is not yet used.

## Not claimed

- The twin has the machine's STRUCTURE (a rigid 2R, geared joints with backlash, the servo, the
  controller, bending links). The mismatches tried are the ones listed: a payload, a stiffening
  gearbox, friction and backlash. A real robot differs in ways not tried, including more axes,
  link-to-joint coupling and thermal drift.
- The masses and lengths of the links are taken as known (CAD), and so is the controller's
  configuration.
- The factors in the hundreds on the twin itself are the noise-free simulator (rule 14). The
  machine columns are the result.
- The correction for a program is learned from the WHOLE lap of its reference. A program must be
  known one lap ahead (a closed program seen once, or a part program read ahead). Motion only known
  a preview horizon ahead is not covered.
- Not in the block. The twin's per-scan cost is estimated, not measured: a few hundred MAC per
  twin step (rigid 2R solve, two joints, servo, ten resonators, tool kinematics). The
  identification's cost is not yet sliced against the 10,000 MAC budget.
