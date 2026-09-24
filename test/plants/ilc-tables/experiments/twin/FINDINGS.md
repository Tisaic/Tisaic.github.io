# The digital twin — measured 2026-09-24

**The breakthrough.** A correction learned entirely on a MODEL of the arm (the same structure, its
parameters identified from the machine), never on the machine, applied ONCE to programs the machine
has never run, gives 11-27x. Every correction learned from data and meant to transfer gave 2-3x.

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

## Not claimed

- The twin has EXACTLY the machine's structure; only its parameters were unknown. A real robot's
  twin differs in structure too. The wrong-parameter columns bound what parameter error costs;
  structural error is not measured.
- The circle's 120-236x is the noise-free simulator (rule 14).
- The twin here is the full lattice simulation: far too heavy for a PLC. A reduced-order twin
  (flexible joints + a first bending mode per link) is what a controller would run; not built.
- Noise-free. Corners (spread, roughness) not yet measured for the twin's correction.
