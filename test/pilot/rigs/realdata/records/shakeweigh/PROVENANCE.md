# Grain weight in a shaking basket — a real load cell under forced vibration

**Sitorus, Agustami (2021), "Data of grain (maize and soybean) weight in the shake basket",
Mendeley Data, V3, doi: [10.17632/nnb24g7w39.3](https://doi.org/10.17632/nnb24g7w39.3)** —
licensed **CC BY 4.0**. Related article: Sitorus et al., *Bulletin of Electrical Engineering and
Informatics*, <https://beei.org/index.php/EEI/article/view/2178>. Contributed by LIPI Pusat
Penelitian Teknologi Tepat Guna. Supplied to this repository by the owner; the Mendeley host is
not reachable from this session's egress policy.

`shake.json` is the four published `.xlsx` workbooks reduced to the three columns that carry
information — treatment code, true mass, measured mass — at 61 kB against 1.18 MB of
spreadsheet. Nothing is resampled, reordered or filtered: the readings are in the order and to
the precision the workbooks give them (0.01 g). The charts, the per-row error column (which is
recomputable) and the summary sheets are dropped.

## What it is

A grain basket on a load cell, deliberately **shaken** at a controlled amplitude, with the true
mass of the grain known independently from a 0.01 g reference scale. An ESP8266 microcontroller
logged the cell to a cloud server.

  - **Treatment codes** are `B<mass>A<amplitude>` — e.g. `B2000A26` is 2000 g at amplitude 26.
  - **5 loads** — 100, 500, 1000, 1500, 2000 g.
  - **6 amplitudes** — **A0 is the static, unshaken control**, then 22, 24, 26, 28, 30.
  - **4 rigs** — maize and soybean, each in two basket types.
  - 21,000 readings over 115 treatments, 21 to 391 readings each.

## What it is NOT, stated because the gap decides what any result means

It is a **shaking basket**, not a batching hopper. There is no fill, no gate, no cutoff and no
settle transient — the vibration is imposed and sustained, and the question it can answer is
"how accurately can a load cell be read while it is being shaken", not "how early can a settle
be read". Those are different products sharing a mechanism, and `shakeweigh.test.mjs` reports
the first and claims nothing about the second.

**There is no timestamp and no stated sample rate**, so a reading is a sample and not a second.
Every result quoted in samples stays in samples; converting to time would be inventing the
missing column (rule 17).
