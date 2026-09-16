# THE FLAGSHIP — what this is, what it does, and what it costs

**One block. Several controllers inside it. It tries each one ON THE MACHINE, ships whichever
measured best, and says which it picked and why.**

That is the product. It is not "a learned controller that beats a PID+FF" — no single controller
wins everywhere and there is no reason one should. A `[a, v, sign v, 1]` feedforward is exactly
right for an axis whose whole error is velocity lag and cannot express a tank at √h or a barrel
radiating as T⁴. **What wins everywhere is the thing that measures which applies.**

Every number below is scraped from the plants' own harnesses by `test/pilot/portfolio.mjs` and
`test/pilot/objtable.mjs` — no plant is re-run and none is scored by a metric invented for this
page (rule 30). Where this page and the record disagree, the record wins.

---

## What ships, per plant

```
  plant                              incumbent   learned    TOTAL    ships
  ── the incumbent CANNOT do the job: the learned object is the whole result ──
  extruder barrel                       1.00x     7.00x     7.00x    distil
  2R arm (lattice, bench cell)          1.01x     6.63x     6.63x    distil
  Wood-Berry column                     1.00x     3.96x     3.96x    distil
  cold mill AGC                         1.00x     2.62x     2.62x    distil
  ── they COMPOSE ──
  cart-pole (shipped loop)              4.66x     2.56x    11.93x    classic+distil
  real cascaded tanks (overflow)        4.28x     2.03x     8.69x    classic+distil
  ── the incumbent IS the result and the block ships IT ──
  EMPS servo axis                     424.82x     1.00x   424.82x    classic
  real steam heat exchanger            89.77x     1.00x    89.77x    classic
  quadruple tank                       19.91x     1.00x    19.91x    classic
  cart-pole (loop tuned 3.5x better)    9.24x     1.00x     9.24x    classic
  real flexible arm (DaISy 96-009)      1.93x     1.00x     1.93x    classic
```

**Ten plants sharing no physics. Nothing is made worse. The learned object ships on six of them
and is the entire result on four.** On the barrel and the column the conventional rung runs and
finds **0.0% of the error energy** — there is nothing there for it — and the learned map delivers
7.00x and 3.96x by itself.

---

## The claim, and it is a CHECK rather than a sentence

> **The block is never worse than doing nothing, and never worse than its own best part.**

Both halves, asserted on every row by `portfolio.mjs` in the full suite. A portfolio that merely
*contains* a winner is worth nothing if its selection can pick the loser (rule 9). The selection is
right in both directions and that is what makes it a portfolio and not a bundle: it ships the
incumbent and **refuses the learned rung at 0.16x** on the quadruple tank, refuses the incumbent
and ships the learned object on the barrel, arm, column and mill, and ships **both** on the real
cascaded tanks.

---

## What a machine actually receives

**A 1.8 kB JSON record and 359 lines that import nothing.** `lib/pilot/deploy.js` is a complete
reimplementation of the act path from the stored record, and `test/pilot/artefact.test.mjs` pins it
**bit-identical** to the fitting library over 4,000 random windows. The two share no code, so if
anything on the deploy path ever reaches back into the commissioning side, that check goes red.

**The output path, per decision:**

1. **`look(o)`** — the commanded reference `o` samples from now, negative for the past. That is
   all the machine supplies. *No measured position, no tracker, no error signal, no plant model,
   no lap counter, no clock.* Stateless between decisions.
2. **Feature row** — the absolute reference now, then *differences* from it at each stored offset
   (geometric spacing, straddling now), optionally `sign(v)` and `|v|`, then a constant.
3. **One dot product per channel.**
4. **Three gains, each in [0,1]** so each can only reduce and never add energy: *coverage* (fades
   outside the commanded-speed span the fit saw), *load* (fades when the drive is more distressed
   than commissioning observed — free, the drive already reports it), *declared* (fades outside a
   declared operating point).
5. **Clamp** at the engineer's authority; **non-finite → 0**, which is not a sentinel but the
   correct action: apply nothing, fall back to the machine below.

The result is added to the commanded reference. It is a feedforward pre-distortion: *to end up
here, command that much more than here.*

**Cost, worst plant of ten: 276 MAC/decision — 2.8% of a 10,000-MAC budget — in 1.6 kB.** Held
between decisions at `stride`, so most scans cost nothing.

**Forensics:** `logSpec` states what an installation must record per decision — **31 numbers** —
and a decision rebuilt from only those fields reproduces the original **bit-exactly**, with the
replay closure throwing if asked for a field the spec omitted. `explain` returns the per-term
account, summing to the applied number bit-exactly in the order it was summed.

---

## What is true, and what is not

**MET.** Self-tuning: no per-plant constants, every threshold re-derived from measurement, and it
refuses with a stated reason. PLC budget: 2.8% of scan, worst of ten. Plant-agnostic:
ten plants sharing no physics, four of them with dynamics identified from published hardware
records. Improve-or-refuse: holds on all ten.

**PARTLY MET.** Program-agnostic (target 1): five of nine plants asked meet the 1.3x bound; one
plant has a program made worse. Commissioning in minutes: met on two plants of eight.

**NOT MET, and the largest gap.** **The instrument.** Every number here is obtained with
ground-truth tool position available *during commissioning* — a laser tracker or equivalent. The
tracker being commissioning-only is real and hard-won and is **not** the same as not needing one.
Measured: the tracker is worth 3.9x over the best permanently-mounted alternative, and motor
encoders alone are worth nothing at all. The best news in the file is that **64 touches per part
buy what a laser tracker buys** — an inspection routine a shop already runs on a first article.

**Against the field.** Two admissible rivals built and run: norm-optimal ILC (agrees with us to
five figures on EMPS, including on the failure; splits on the arm at every setting of its own
knob) and ZPETC/stable inversion (2.45x against the deployed object's 32.75x, and destroyed by the
rig's own noise floor). DeePC was built, beat us on a noiseless simulator, and was **disqualified**
— it needs the live tracking error for ever, which is the instrument this object exists to do
without. Absent: modern MPC, L1 adaptive, Koopman-EDMD. **One method is not a field, and this is
three.**

---

## The two things most worth knowing

**A plant declared hard must be re-asked with the cheapest thing in the box before anything is
built for it.** The quadruple tank has been worked on harder than any other plant here — a carried
ridge re-derived, a commissioning cut from 19.3 days to 2.0, an entire third ladder axis built on
it — and **four coefficients beat all of it by 6.1x** the moment they were allowed to act.

**A portfolio is only as good as the candidates it can actually evaluate.** Two harnesses
commissioned the incumbent correctly and never passed it `v` and `a` at deploy, so it contributed
exactly zero and read as "the incumbent finds nothing" on two plants. The gate was working
perfectly; the wiring was not. That is now a property to check rather than assume.
