# Stored ILC tables — the bench arm's exact correction on six programs

Each table is the per-scan setpoint trim the compliant 2R arm (bench cell, K 0.25 / E 0.03, its
conventional control closed) needs to follow one of the bench's FEASIBLE programs (exact stops at
corners, 3 g, the 100-scan jerk filter — `lib/flexisim/bench.js`), **learned on the machine lap by lap**
(`gen.mjs`: FB_AutoFF's program-table algorithm run standalone, 35 iterations). They are the target
any transferable model must reproduce on programs it was not fitted on, stored so that a future
effort starts from them instead of spending ~25 minutes of simulation regenerating them.

| Table | Lap (scans) | Learned over the conventional machine |
|---|---|---|
| `sharp-3e-3` | 13,067 | 9.77x |
| `rounded-3e-3` | 9,809 | 13.65x |
| `circle-3e-3` | 8,378 | 587.41x |
| `sharp-2e-3` | 17,734 | 3.32x |
| `rounded-2e-3` | 14,713 | 23.16x |
| `circle-2e-3` | 12,567 | 847.30x |

**Read the factors with the simulation in mind.** The machine repeats bit for bit, so on the
smooth circle lap learning removes almost all of the error (rule 14): hundreds of x measure the
simulator's repeatability. On the cornered paths the learning stopped at its 35-iteration budget,
not at a floor.

- **Format:** `<shape>-<feed>.f64` is little-endian Float64: `ref[2L]` then `U[2L]`, each
  row-major `[k * 2 + joint]`, in radians. `manifest.json` holds each table's lap, bare and learned
  rms per joint, factor, sha256, iterations and the commit it was generated at.
- **Load:** `ilcTables()` from `index.mjs`, which checks every file against its sha256.
- **Stale detection:** `test/flexisim/bench.test.mjs` asserts every stored program is bit-identical
  to what `lib/flexisim/bench.js` generates today. If the bench machine's programs or its geometry
  change, that check fails, and the tables must be regenerated (`gen.mjs`). A change to the
  machine's dynamics that leaves the programs alone is NOT detected: regenerate after one.
- **Regenerate one:** `SHAPE=sharp FEED=3e-3 IT=35 node test/plants/ilc-tables/gen.mjs`.

**What the first set showed (2026-09-23, on the old deviation-rule programs, before they were
replaced; `experiments/FINDINGS.md`):** fitted on two programs at feed 3e-3 and asked to
predict the third, a linear map of the reference window missed the true table by 30-100% of its
size (NRMSE 0.26-1.16), and a pose-scheduled version did worse, overfitting two programs.

**On these programs (2026-09-24):** the sharp square's table buys 9.8x in rms at 3e-3 but makes the
corners rougher and less alike — 6.9% of the corner error faster than the jerk filter against the
conventional machine's 1.3%, and 72% of it not common to all four corners against 53%
(`cornerSignatures`, `lib/flexisim/contour.js`). At 2e-3 the learning stalls at 3.3x.
