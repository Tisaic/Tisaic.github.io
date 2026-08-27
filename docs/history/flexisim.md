# FlexiSim and the black box — the measurement history

**What is settled** is in `CLAUDE.md`'s current-state section; this file is the record of
32 bricks: what each one measured, what failed, and where a later brick overturned an
earlier one's conclusion. Where this file and `CLAUDE.md` disagree, `CLAUDE.md` is what
ships.

Several entries here were later CORRECTED by a subsequent brick — the sign error in
`tipError()` that moved every number in brick 8, the resonance diagnosis brick 108
proposed and brick 110 refuted, the "price of knowing nothing" that fell from 4x to 20%
when a units bug was found. Both versions are kept deliberately: the correction is the
lesson, and the distilled form of each is in `CLAUDE.md`'s rules.

The libraries are `lib/flexisim/`, `lib/blackbox/` and `lib/lattsim/`; the page is
`flexisim.html`.

---

7. **FlexiSim** — compliant serial chains. DESIGN SETTLED; BRICKS 1–4 BUILT.
**BRICK 1 IS THE ELASTIC OPERATOR, AND IT IS VERIFIED.**
`lib/lattsim/operators/elastic.js` + a CPU reference kernel, checked in plain
Node by `test/lattsim/elastic.test.mjs` — no browser, no adapter, seconds, and
f64 available, which is the verification rule applied rather than quoted.
**IT IS THE FIRST OPERATOR THAT IS NOT A LATTICE-BOLTZMANN DISTRIBUTION**, which
is the point: `scalar.js` proved "adding a field needs no core change" with a
second D3Q19 distribution — the easy case, same stencil, same streaming, same
shape. This one registers a VECTOR velocity and a symmetric 6-component TENSOR
stress, advances them by a scheme with no populations in it, and still touches
ZERO of the solver, the operator base, the field registry or the simulation
façade. `FIELD_KIND.TENSOR` had been declared and unused since the beginning.
**THE SCHEME IS VELOCITY–STRESS LEAPFROG ON A STAGGERED GRID (Virieux), AND THE
STAGGERING IS NOT DECORATION:** a COLLOCATED central difference of this system
decouples the odd and even lattice points — the classic checkerboard — and
produces a field that looks like a solution and satisfies nothing. The half-cell
offsets live in the MEANING of each slot, never in the indexing, so
`x + Nx(y + Ny z)` is untouched.
MEASURED (lattice units, f64, one wavelength over 64 cells, 40 steps):
  P wave  0.374038 against the analytic 0.374166  (**−0.034%**)
  S wave  0.199923 against the analytic 0.200000  (**−0.038%**)
  c_p/c_s 1.87091  against 1.87083
  amplitude 0.50000000 → 0.49999962 (P) and → 0.49999904 (S)
**THE RATIO IS THE PART A SCALE ERROR CANNOT FAKE** — one global factor wrong
moves both speeds together and the ratio not at all, while confusing λ with μ
moves the ratio. And the amplitude is the conservation check: an undamped linear
solid is conservative, so a free plane wave that decays means the scheme is
dissipating energy nobody asked it to.
**THE ABSOLUTE ERROR COULD BE A COINCIDENCE; THE CONVERGENCE RATE CANNOT.**
Refining at a fixed phase advance: **5.303e-3 → 1.354e-3 → 3.419e-4, ratios
3.917 and 3.959** — clean second order. A first-order mistake (one difference
taken one-sided rather than as a centred pair) reads ~2, and a wrong stencil
reads no clean rate at all. What is left at 64 cells per wavelength is
NUMERICAL DISPERSION, a property of the stencil rather than an error in it, and
the convergence study is the instrument that tells those two apart.
**THE FIRST RUN FAILED, AND THE TEST WAS WRONG RATHER THAN THE KERNEL.** Both
speeds came back as exactly 1.6 with the amplitude collapsing 0.5 → 0.06 —
identical for P and S, which no physics produces. Seeding VELOCITY ALONE with
zero stress is not a travelling wave: it is an equal superposition of a
left-going and a right-going one, i.e. a STANDING wave, whose phase does not
advance at all while its amplitude oscillates. That is precisely the measured
signature, and it says nothing whatever about the operator. A one-way wave needs
the impedance relation **σ = −ρcv**, plus the half-step TIME offset the leapfrog
builds in (`step()` advances v first, so v starts half a step behind σ). The
time offset cancels out of the speed — a constant phase offset subtracts away
between the two readings — so it is there for the AMPLITUDE check, where a
residual backward wave would show up as a beat.
**BOTH FIELDS ARE SINGLE-BUFFERED, WHICH LOOKS LIKE A VIOLATION OF THE SOLVER'S
SECOND RULE AND IS NOT.** That rule exists because reading and writing one
buffer leaves a cell's neighbours half-updated, which on a GPU is a race with no
error message. A staggered leapfrog does not have that shape: the velocity pass
reads only STRESS and writes only VELOCITY at its own cell, and the stress pass
reads only VELOCITY and writes only STRESS. No cell ever reads a field being
written in the same dispatch, so in-place is race-free by construction and the
two dispatches supply the ordering. It halves ~104 B/cell to ~52 — and for this
tab the memory IS the argument.
Also pinned: a solid at rest stays EXACTLY at rest over 50 steps (any asymmetry
between the forward and backward differences stirs a field out of nothing, and
it would be invisible in a wave test where something is already moving); the
CFL gate refuses c_p ≥ 1/√3 at BUILD time rather than at step 30; and stating
both (E, ν) and (λ, μ) is refused, since a mismatched pair is a physics error
that would surface as a wave speed nobody expected.
**BRICK 2 — BOUNDARIES, AND THEY ARE EXACT.** `CELL.ELASTIC` and `CELL.CLAMPED`,
added rather than overloaded; every other id is VACUUM to this operator, which
is what makes "outside the part" traction-free with no special case in the
stencil — and why an elastic run with no ELASTIC cells is now REFUSED at build
time rather than producing a lattice of exact zeros at full speed (the same
failure shape as the WGSL reserved word that once shipped silence).
THE UNIAXIAL CHECK IS THE ONE THAT CANNOT BE FOOLED: a bar with FREE lateral
faces is in uniaxial STRESS, σ_xx = E ε_xx with lateral contraction −ν ε_xx; one
whose "free" surface silently is not one is in uniaxial STRAIN, σ_xx =
(λ+2μ) ε_xx with NO lateral motion at all. At ν 0.3 those differ by 34%, and the
contraction differs by everything since one is exactly zero. **Measured:
E = 5.00000e-2 against 0.05 (0.00%), ν = 0.30000, σ_yy/σ_xx = 1.4e-9, settled to
peak |v| 2.0e-19.** Machine exact, so the tolerances are 1e-6 and not a percent
— a loose one here passes with the surface subtly wrong, which is what the first
three attempts looked like.
THREE DEFECTS, EACH LOOKING LIKE THE PHYSICS WAS NEARLY RIGHT. (i) Zeroing the
stress in vacuum is only HALF the vacuum formalism: a velocity node straddling
material and vacuum carries half the mass, so the same traction must accelerate
it twice as hard, and a shear node straddling four cells takes the HARMONIC mean
of μ — zero the moment any is vacuum, and that zero IS the traction-free shear
condition. Without the pair: E 18% low, ν 0.46 against 0.3. (ii) A VELOCITY NODE
IS SHARED BETWEEN TWO CELLS, so skipping vacuum cells wholesale left the +x face
free and the −x face silently CLAMPED; the pass is now per component and a node
is live if EITHER cell it straddles is material. (iii) Out of range on a bounded
axis zeroed the whole DIFFERENCE — a zero-gradient edge, not a free surface — so
a loaded end felt the traction with nothing pulling back. The symptom was
unmistakable once measured: uniform σ_xx growing linearly with time, velocity
linear in x and UNCHANGING over 6000 steps, terminal speed exactly f/(ρ·damping)
— the bar creeping like a viscous fluid because the load was balanced by damping
alone.
**BRICK 3 — THE CANTILEVER, AND THE STUDY THAT SAYS WHICH ERROR IT IS.**
FL³/3EI tests BENDING, which nothing before it did. Timoshenko rather than
Euler–Bernoulli, since at L/H = 4 the shear term is ~5% of the total — against
bending alone the same measurement is out by nearly 8%, and a check pins that so
nobody simplifies it away. **Measured at H = 6: δ 1.7247e-2 against 1.6837e-2,
+2.436%.** AND THAT RESIDUAL IS THE LATTICE'S, NOT BEAM THEORY'S: at fixed H it
is 2.46 / 2.53 / 2.59 % at L/H 3.9 / 5.9 / 7.9, i.e. FLAT in aspect ratio, where
beam theory's own finite-thickness error would shrink. It shrinks with
RESOLUTION instead — **6.751 → 2.460 → 0.926 → 0.180 % at H = 4, 6, 8, 10**, every
ratio beating the second-order prediction (2.74 vs 2.25, 2.66 vs 1.78, 5.16 vs
1.56). Faster than second order over one sweep is more likely two error terms of
opposite sign cancelling than a higher-order scheme, so the check asserts AT
LEAST second order rather than claiming an order it cannot support.
DAMPING SCALES WITH THE BEAM (ω ~ 1/L² for the first bending mode), and getting
it wrong makes an over-damped run indistinguishable from a converged one by the
deflection alone — measured at LEN 40 with the LEN 24 value, the tip reached 46%
of its final deflection and looked entirely like a physics result. Every run
asserts it settled. AND "SETTLED" IS RELATIVE: the first gate was |v| < 1e-12,
read off a 20000-step run, and it rejected |v| = 1.65e-10 while the DEFLECTION
agreed to seven figures — failing a converged answer for moving too fast
relative to nothing in particular.
**BRICK 4 — GRAVITY AND THE NON-INERTIAL FRAME**, `operators/frame.js`, which
WRITES the shared body-force field while the elastic operator READS it, so the
coupling is declared rather than implied by call order. Measured:
  gravity      σ_xx(x) = ρg(L−x)              **7.7e-9 %**  (machine exact)
  centrifugal  σ_xx(r) = ½ρω²(L²−r²)          **0.043 %**
  Coriolis     f·v / (|f||v|)                 **1.1e-14**   (an identity)
GRAVITY IS LINEAR IN x AND CENTRIFUGAL IS QUADRATIC IN r, which is what makes
the pair a real test rather than two ways of saying "some outward force": a term
built with a constant instead of r, or with r from the lattice origin instead of
the pivot, still gives a monotone believable profile and fits neither. A LINEAR
profile through the same endpoints measures **25.00%** against the quadratic's
0.043% — a factor of 580. Coriolis has no static closed form (it vanishes at
equilibrium), so it is checked as the identity it is: −2Ω×v is perpendicular to
v by construction, so f·v must be zero for ANY velocity field. And a frame
accelerating at −g is asserted **bit for bit** identical to gravity g, which is
the only thing that catches a sign error in `originAccel`.
**THE BODY FORCE IS DIVIDED BY THE PLAIN DENSITY, NOT THE EFFECTIVE ONE**, and
that asymmetry against the traction term is the physics: a body force is per
unit VOLUME, so a half-material node carries half the force AND half the mass
and they cancel — gravity accelerates material at g however much of the node is
material. The symptom of getting it wrong was subtle: the hanging bar came out
EXACTLY ρg(NX−x), perfectly linear, exactly the right slope, and exactly HALF A
CELL off the closed form — which is precisely the extra force the one surface
node was getting. That half cell is now pinned the way Poiseuille's H = Nz−2 is:
the free surface is the OUTER FACE of the last material cell, and the two
plausible alternatives measure 2.13% and 4.35% against this one's zero.
THE SAME FIX EXPOSED A LOAD-BOOKKEEPING ERROR IN THE CANTILEVER: loading the
whole tip layer puts force on the top surface node, which has half the volume
and delivers half the force, while its mirror at the bottom surface is owned by
a VACUUM cell and gets none — 8.3% of the load silently missing and its centroid
0.27 cells off the section centre, a torsion nobody asked for.
**NO CO-ROTATIONAL FORMULATION, AND THE REASON IS WRITTEN DOWN** rather than
left as an apparent omission: a link rotating rigidly is STATIONARY in its own
body frame, so there is no large rotation inside any lattice and no rotated
strain measure to get wrong. The rotation lives entirely in the transform
between frames — per-link frames make the co-rotational terms unnecessary rather
than solving them.
**BRICK 5 — THE LUMPED JOINT, WHERE 70–90% OF THE TIP ERROR LIVES.**
`lib/flexisim/joint.js` — gearbox, motor, backlash, Stribeck friction, progressive
stiffness. No lattice at all, so it verifies in milliseconds. VERIFYING THE JOINT
ALONE IS THE POINT: the claim this tab makes is about how tip error SPLITS
between joints and links, and a split is only measurable if each side is known to
be right on its own — otherwise a discrepancy has two homes and no way to choose.
Closed forms, all passing: reflected inertia N²J_m + J_l (at N = 100 a 1e-4 rotor
presents 1.0 at the output against the link's own 0.5, so dropping the N² is
wrong by 3× — asserted, so the check visibly has teeth); the gearbox resonance
ω_n = √(K(1/J_l + 1/N²J_m)) to 0.2% by zero crossings (the load-only formula is
22% low, which is what makes it discriminate); static wind-up τ/K — **AND THE
ENCODER REPORTS NONE OF IT**, which is the tab's whole premise as a number;
backlash zero-torque over exactly 2b of encoder travel; progressive stiffness.
**STICTION IS A STATE, NOT A LARGE FRICTION COEFFICIENT**, and treating it as the
latter is a convincing bug rather than an obvious one. The Stribeck curve is
exactly zero at ω = 0, so a motor at rest under a sub-breakaway torque always
takes off; next step it is moving, full stiction applies, it is pushed back to
rest, and it takes off again. Measured before the fix: a 0.5 N·m command against
a 0.9 N·m breakaway walked the motor **2.4e-2 rad in one second**, a clean limit
cycle at a frequency set by dt. It reads exactly like creep and it is a
discretisation artefact.

**BRICK 6 — THE HYBRID ARM, AND THE 70–90% CLAIM MEASURED RATHER THAN INHERITED.**
`lib/flexisim/arm.js`. THE TWO CONTRIBUTIONS SEPARATE EXACTLY, which is what makes
this a measurement: the gearbox winds up by τ_g/K and TILTS the link rigidly
(δ = τ_g/K · L) while the link sags under that same weight as a cantilever
(ρgAL⁴/8EI). E → ∞ leaves the first, K → ∞ the second, and both limits are
asserted against their closed forms so neither term is trusted on the strength of
the other. Measured: self-weight sag **5.3842e-1 against 5.4276e-1 (−0.80%)**;
the split **K 9.9e-2 → 90.0% joint, 2.23e-1 → 80.0%, 3.82e-1 → 70.0%, 8.91e-1 →
50.0%**. THE SELF-WEIGHT SAG IS A DIFFERENT CLOSED FORM FROM THE TIP-LOADED ONE
and that is why it is checked: a uniformly distributed load gives L⁴/8EI, not
L³/3EI, and the same weight at the tip deflects 8/3 as far — a body force wrongly
lumped at the end passes brick 3 and fails this.
THE STIFFNESSES ARE CHOSEN FROM THE MEASUREMENT, and the first attempt would have
"confirmed" the literature by measuring a regime nobody operates in: a
plausible-looking 3e-4…1e-2 sweep put every row above 98% joint share. The check
asserts BOTH halves — the share falls monotonically as the gearbox stiffens AND a
realistic gearbox lands in the 70–90% band — rather than the single-sided "the
joint dominates", which any soft enough joint satisfies. **AND THE LINK TERM IS
ASSERTED NOT TO BE NEGLIGIBLE**, which is the half that justifies the lattice at
all: at a thousandth a beam element would do; at percent level, where-the-load-
sits and section shape matter.
**THE MASS PROPERTIES COME OUT OF THE LATTICE ITSELF** rather than being stated —
the gravitational torque a link puts on its joint and the inertia it presents are
integrals over the SAME distribution the elastic solver steps, and stating them
independently would let a lightening hole drift out of agreement silently, both
halves self-consistent and only their relationship wrong.

**BRICK 7a — THE FIRST BENDING MODE, i.e. THE FIRST CHECK THAT IS NOT A SETTLED
STATE.** Static and dynamic closed forms pin DIFFERENT combinations of the
constants: a tip deflection goes as 1/E and does not involve ρ at all, while the
ringing frequency goes as √(E/ρ). Together they pin E and ρ independently and
neither alone can. Measured at L/H 3.92: period 2817.7 steps, ω **2.2299e-3
against Euler–Bernoulli 2.4655e-3, 9.56% LOW**.
THE SIGN OF THE DEFICIT IS THE INFORMATIVE PART: a lattice beam rings LOW, never
high, because shear deformation and rotary inertia both soften a stubby beam. A
frequency ABOVE it would mean the model is stiffer or lighter than the material
it was given — a different class of fault. AND THE DEFICIT SHRINKS WITH
SLENDERNESS (9.56% at L/H 3.9 against 5.95% at 5.9), which is what separates the
Timoshenko correction from a wrong mass or a wrong stiffness: a scale error in
either is CONSTANT in aspect ratio.
AND THE ARM TEST WAS FOUR IDENTICAL SOLVES DRESSED UP AS A PARAMETER STUDY — the
sag does not depend on K at all and the wind-up is exactly τ_g/K, so the
K-dependence is ANALYTIC and one solve serves every row. **50 s → 10 s, every
number identical.**

**BRICK 7b — A COMMANDED MOVE, AND THE TIP ERROR THE ENCODER CANNOT SEE.** Every
stage has a closed form: α = τN/(N²J_m + J_link) (**0.000%**), windup =
J_link·α/K (**0.00%**), tilt = windup·L, bend the link's own ringing. J_link is
INTEGRATED FROM THE LATTICE, so the first check is really asking whether the mass
the rigid dynamics use is the mass the elastic solver steps — they could disagree
silently with no symptom but an acceleration nobody cross-checked. Measured after
4000 steps: the encoder reads 4.4483 while the link is at 4.4388 and **the
difference is EXACTLY the wind-up, to 1e-9 relative**.
**THE COUPLING IS ONE-WAY, AND THE REASON IS MEASURED RATHER THAN ASSUMED.**
Feeding the link's reaction back explicitly, with the one-step lag any staggered
co-simulation has, went unstable at ~1200 steps in EVERY configuration tried —
lattice damping 0, 1e-4, 3e-4 and 1e-3 alike — so it is a gain-driven instability
of the lag and damping cannot buy it. The first formulation made it worse by
DIFFERENCING the link's angular momentum, a high-pass filter on a field with
grid-scale content; the clamp reaction now in the elastic kernel is local and
exact and needs no derivative. `couplingResidual()` reports what is neglected, so
the approximation is a number rather than a hope.
Also: THE JOINT HAS ITS OWN STABILITY LIMIT and it is not the lattice's
(semi-implicit Euler on a two-mass oscillator needs ω_n·dt < 2; the first attempt
ran at 1e4 and gave NaN with no clue which half produced it), and THE CLAMP
REACTION HAS TO BE REQUESTED BEFORE `build()` — asking after sets the flag,
leaves the accumulator null, and reports zero for every reaction, silently.

**BRICK 8 — THE TIP-ERROR SOFT SENSOR, AND A SIGN ERROR THAT SURVIVED FOUR
BRICKS.** `lib/flexisim/tipsensor.js`, motor-side signals only, scored against
the physics-based estimate a good engineer builds (τ/K times the arm, with the
torque inferred from the encoder's own acceleration). EVERY NUMBER IS LOCKED —
training stops, the tracker goes away, and a check asserts training is REFUSED
after the lock rather than merely stopped. Measured, 500 locked samples, 544
features: learner **0.3645**, compliance model 1.4223, "the tip is where the
encoder says" **1.0012**. That last scoring ≈ 1.0 is not a coincidence — it IS
the mean, so the controller's own picture of where the tool is carries almost no
information about the error.
**THE TRUTH THESE WERE FIRST MEASURED AGAINST HAD ITS SIGN WRONG, AND FIXING IT
MOVED EVERY CONCLUSION IN THIS SECTION.** θ_link = θ_encoder − windup, so wind-up
puts the tip BEHIND where the encoder says it is: the tilt is −windup·L, and
under gravity that is the SAME direction as the sag, so the two ADD. `tipError()`
had a `+`, which SUBTRACTED them. Nothing showed it, because the physics baseline
in the same file was built on the same wrong formula and the learner simply
fitted whatever it was shown — **two wrongs that agree are indistinguishable from
two rights until something outside the pair is compared.** What compared them was
brick 10's `tipTrackingError`, measured against the COMMAND rather than the
encoder, and the identity that now pins it forever:
    tipTrackingError(arm, ref) === tipError().total + L·(encoder − ref)
i.e. the two references differ by exactly the following error, which the
controller knows. Under the old sign it failed by 2·windup·L. Asserted at three
reference angles.
PATH DEPENDENCE — the claim this plant was built to make, and the corrected
version is weaker and more ordinary. Backlash makes the same motor position
correspond to different link positions depending on which way you arrived, so a
memoryless model is provably insufficient. Measured with a dead band at 50% of
the peak wind-up: memoryless 0.6206 → 0.7238 (**+16.6%**), windowed 0.3645 →
0.5884 (**+61.4%**). **The window wins in both regimes in the ABSOLUTE terms a
machine gets** — 1.70× clean and 1.23× under backlash — **and is hurt MORE in
relative terms**, because the better model had more fine timing to lose and
backlash is precisely a disruption of it. The earlier entry claimed "history
absorbs about two thirds of the damage"; that was the sign error, and it is
false. Memory still earns its place with NO backlash for a separate reason: the
link rings and a phase cannot be read from one instant (0.6206 → 0.3645).
TWO OTHER THINGS THE MEASUREMENT CORRECTED, both still true. (i) **The target was
unlearnable at realistic damping**: at 2e-4/step the tip error is a free
vibration whose phase lies outside any affordable window, and EVERY estimator
scored near 1.0. (ii) **The baseline was a straw man for a units reason**: the
encoder acceleration was differenced between SAMPLES and handed to a formula
expecting rad/step², wrong by exactly `sampleEvery`. The learner would not have
noticed — it standardises its inputs and a constant scale vanishes into the
weights — but the baseline does not.
FULL TIER carries a stiffness sweep, and the advantage over the physics baseline
falls monotonically as the gearbox stiffens: **7.65× at K 0.05, 4.06× at 0.15,
3.90× at 0.4, 2.28× at 1.282**. A soft gearbox is also a SLOW one — at K = 0.05
the resonance period is ~2950 steps against a 1700-step move — so the wind-up
never reaches the quasi-static value the static formula assumes. It fails
precisely when the joint dominates, which is when compensation matters most.
(The sweep had to be re-run at the headline's training length: at nTrain 900 the
K = 0.4 row scored 1.4712 against 0.3645 at 1200, so it was measuring training
length and calling it stiffness.)
**THE NGRC AUDIT: FOUR BLOCKS BUILT FOR THIS DOMAIN AND USED BY NONE OF IT** —
`RobotComp`/`CompCommissioner` (per-joint compliance learned by exact RLS from
measured TCP deflection, with the command PRE-DISTORTED by −dq), `ServoFF`,
`AxisComp` (position-domain pitch + BACKLASH compensation from static laser
dwells in both directions), `Continuous`/`directHorizons`. Two of their ideas were
cheap to test. **Both were first measured against the sign-wrong target above and
both reversed when it was fixed**, which is why the numbers here are the
corrected ones and the earlier, more interesting versions are not.
(1) **AxisComp's DIRECTION BIT.** Memoryless 0.6206 → 0.7238 under backlash
(+16.6%) without it, 0.6322 → 0.7009 (**+10.9%**) with it; windowed +61.4% →
+49.3%. So the bit REDUCES what backlash costs, in both configurations, which is
AxisComp's design working. It still ships OFF — but on COST rather than on harm:
with a lag window it buys no better absolute score (0.5884 → 0.7093) while adding
207 features, because **a latched signal is nearly constant across a window**, so
its lags are almost collinear and carry information the first one already had.
The earlier entry said it "immunises a memoryless model completely" and made a
windowed one worse; both halves were the sign error.
(2) **DIRECTIONAL FORGETTING**, now plumbed through `SoftSensor` (opt-in, default
false, every golden vector byte-identical): λ 1.0 → 0.5884 with trace(P) 1.56e3;
λ 0.999 plain → 0.6104 with trace(P) 4.14e3; λ 0.999 directional → **0.5892**
with trace(P) 1.57e3. **The fifth independent measurement in this project agrees
with the first four: it is NEUTRAL.** Plain forgetting is 3.7% worse AND winds the
covariance up 2.7×; directional holds it at the λ = 1 value for nothing. The
earlier entry had plain forgetting 9% BETTER, making the guarantee a trade — the
sign error again. **The WRONG target produced the more interesting claim, twice
in one section, which is the lesson: a surprising measurement is a reason to
check the instrument, not a reason to celebrate.**

**BRICK 9 — THE STRUCTURED RIVAL, AND WHY COMPLIANCE IS ONLY IDENTIFIABLE AT
REST.** `lib/flexisim/compliance.js` learns ONE number with a physical meaning
inside a model mechanics fixes — δ = J diag(c) Jᵀ W, which for a planar
single-joint arm is δ = L c τ, linear in c and recoverable by exact RLS.
THE POINT IS NOT THE IN-DISTRIBUTION SCORE. A constant EXTRAPOLATES and a fitted
map does not, and a constant CAN BE CHECKED AGAINST THE TRUTH — a black-box
readout offers no number to be right or wrong about except its output. Identified
from three static poses it predicts a FOURTH never shown, whose gravity torque is
2.8× smaller, to within 2e-3: stiff link **c 3.4590 against a closed-form
3.4594**, nominal **6.3369 against 6.3376**.
WHAT THE CONSTANT IS AND WHAT IT IS NOT: c_eff = 6.338 against the gearbox's own
1/K = 2.500, because the link's sag is 154% of the wind-up tilt. That is a
property of the INSTRUMENT — a tracker at the tip measures wind-up and bending
SUMMED, and no fit to a sum can separate its parts. Splitting them needs a
link-side encoder, which is a commissioning fact rather than a modelling
shortcut; and for compensation the effective constant is the right one anyway.
**COMPLIANCE IS ONLY IDENTIFIABLE AT REST**, and `CompCommissioner`'s design says
so by taking pose TOUCHES rather than a trace — which I ignored, and the
measurement corrected me. Fitting the same model to a MOVING trace recovers
**c = 0.833 against a true 2.500**: neither the stiffness nor the effective
compliance. The gearbox transmits K·d + C·ḋ and this drive is damped near
critical, so **C = 132.6 dwarfs K = 0.4** — during a move the DAMPER carries most
of the torque and a static-compliance fit to dynamic data measures a blend of a
stiffness and a damping, which is neither of them.
**THE PRIOR HAS TO BE WEAK RELATIVE TO THE REGRESSOR'S SCALE**, not weak in the
abstract, and this cost an hour looking at a fit that seemed broken. The regressor
is L·τ ≈ 0.06 in lattice units, so one sample carries r = P0·x². At RobotComp's
default P0 = 1e-6 that is 4e-9 and the posterior does not move AT ALL; at P0 = 1
it is 0.004 and five poses recovered c = 0.0399 against a true 2.5 — which reads
exactly like a broken regression and is a prior never given a chance to update.
At 1e6 the same five poses identify it to the digit.
And the per-pose spread is ~1e-4 rather than machine precision because δ = L c τ
is purely TRANSVERSE while the body-frame gravity has an AXIAL component that
stretches the link without bending it — named rather than tolerated.

**BRICK 10 — ACTIVE COMPENSATION, AND A 2×2 THAT IS ORTHOGONAL TO FOUR DIGITS.**
`lib/flexisim/compensator.js`: `AngleProfile` (a closed-form trapezoid, optionally
convolved with an input shaper), `PositionServo` (a PD loop on the ENCODER with
rigid-body feedforward), `TipCompensator` (RobotComp's `feedforward()` finally
driven, with its magnitude and slew limits), `ringFit`, `zv`/`zvdShaper`. Bricks 8
and 9 both ESTIMATED the tip error and neither moved anything; this pre-distorts
the commanded angle so the tip lands where the program asked, using ONLY what a
controller has after the tracker is packed away — the commanded trajectory, the
rigid mass properties, the encoder, and one identified constant. The model is
evaluated at the COMMAND, never at anything measured, which is what makes it a
production correction rather than a demonstration.
Measured over a full out-and-back at res 16, K 4.0, E 0.2 (arm 15.5 cells,
gravity sag 0.48% of the arm):
  plain         bias 7.366e-2   oscillation 1.944e-1   rms 2.079e-1
  compensated   bias 2.695e-4   oscillation 2.072e-1   rms 2.072e-1
  shaped        bias 7.375e-2   oscillation 7.599e-2   rms 1.059e-1
  both          bias 1.731e-4   oscillation 7.675e-2   rms 7.675e-2
TWO ERRORS, TWO MECHANISMS, ONE FIX EACH. Compensation removes the bias **273×**
and moves the oscillation by 6%; shaping cuts the oscillation 2.56× and leaves the
bias unchanged **to 0.1%** — which it must, since a shaper is a convolution with
unit-sum impulses and cannot change where a move ENDS. Alone they are worth 1.00×
and 1.96× on the rms; together **2.71×**.
**THE DECOMPOSITION IS THE FINDING, AND GETTING IT WRONG HID THE RESULT TWICE.**
As one RMS over the move, compensation reads "1.1×" and looks like a
disappointment. Scored over a settled dwell window instead, the answer depends on
HOW LONG THE DWELL IS: at 600 steps the vibration has not decayed and compensation
reads 0.99×; at 1100 it has, and **the same runs read 4.35×**. Neither number is
about compensation. The mean and standard deviation of one error record separate
the two mechanisms with no window to choose.
**THE SIGN IS FIXED BY THE PLANT, NOT CHOSEN**, and it is asserted because a
correction applied backwards does not degrade — it applies the error a second
time: measured **2.00×** the uncompensated bias, exactly.
**THE SHAPER'S FREQUENCY IS MEASURED ON THE MACHINE.** Euler–Bernoulli says
7.09e-3 rad/step for this link; the machine says 6.22e-3, 14% high — the same
Timoshenko correction brick 7a pinned. A 2.5% frequency error in a ZV shaper cost
a factor of four in the residual, which is why commissioning excites a decay
DELIBERATELY (an uncontrolled move, for the same reason the anti-slosh health
check needs one) and why the shipped shaper is the robust ZVD.
**THE HONEST LIMIT:** c was identified under GRAVITY, a uniform body force, and
applied to an INERTIAL load growing with radius. Sag per unit joint torque is
0.95939 against 1.02332 — the inertial load deflects **1.0666×** more, against a
thin-beam prediction of (11/40)/(1/4) = 1.10 that shear and root rotation dilute.
It does not show in the bias only because a full out-and-back averages the
commanded acceleration to zero; a one-way move would see it directly.
Also pinned: RobotComp's magnitude limit degrades the correction rather than
breaking it (clamped to a tenth of what it wants, bias 4.8e-2 against 7.4e-2
uncompensated and 2.7e-4 unclamped).

**BRICK 11 — THE FORECAST, AND PREDICTING AHEAD IS EASIER THAN PREDICTING NOW.**
`SoftSensor` gains `opts.leads` — a ring of past FEATURE vectors, so target j is
trained by pairing the expansion from `leads[j]` samples ago with the truth that
has just arrived. It is `Continuous`'s `directHorizons` mechanism, which
`SoftSensor` had no equivalent of and which FlowSim's page therefore hand-rolled.
Opt-in, default all-zero, every golden vector byte-identical; the expansion is
computed ONCE and shared, so a forecast costs one extra RLS update and no extra
features. It also gains `observe()` — the same reading WITHOUT stepping — so a
caller running its own control law (the page) can drive the plant and still meet
the cadence contract `sample()` enforces internally.
Measured, locked, lead 15 samples = 150 solver steps: forecast **0.1035**,
persistence-of-estimate 0.6581 (what a machine could run), persistence-of-TRUTH
0.5417 (an ORACLE — it needs the tracker back).
**THE FORECAST IS 3.5× MORE ACCURATE THAN THE PRESENT-TIME ESTIMATE** (0.1035
against 0.3645). The pairing is verified by an alignment check and the scoring
window is the same, so the effect is real rather than a bookkeeping artefact.
**I DO NOT HAVE A CLEAN MECHANISM FOR IT, AND THE OBVIOUS ONE DOES NOT SURVIVE
MEASUREMENT.** A motor-to-tip transport delay would explain it and a quarter of
the gearbox period (~260 steps) is the right order — but the instrument that
would locate that delay, where the PURE MOTOR-SIDE baseline best lines up with
the tip's truth, reports 52 samples at a correlation of only 0.50: far too flat a
peak to read a delay off. Naming a number from the gearbox period and calling it
the cause would be fitting an explanation to a result, so it is stated as
unexplained.
WHAT IS MEASURED IS THE FALSIFIABLE PART — an INTERIOR minimum, which any
delay-like explanation predicts and which plain extrapolation cannot produce,
since extrapolation only gets harder with distance:
  lead   5 (  50 steps)  forecast 0.2911  persist-truth 0.1846
  lead  15 ( 150 steps)  forecast **0.1035**  persist-truth 0.5417
  lead  30 ( 300 steps)  forecast 0.4064  persist-truth 1.0394
  lead  60 ( 600 steps)  forecast 0.6576  persist-truth 1.8179
Persistence degrades MONOTONICALLY, which is the difference between a model and
an assumption. The learner beats production persistence at every lead and beats
the ORACLE from lead 15 on.
AND THE ALIGNMENT IS CHECKED, not just the score: a forecast trained at lead L
must correlate best near L, since an off-by-one in the ring is an error no score
would reveal. Measured 5→5, 15→14, 30→28, 60→60 — a **LEAD DEFICIT** of a sample
or two rather than a pairing error, which this project has measured before
(FlowSim's 1 s preview correlates best at 90 samples while trained for 100, and
so does a batch fit on the TRUE plant state: least squares shrinks toward the
mean at the far end of what it cannot know, and shrinkage reads as a slight lag).
A real off-by-one would be a CONSTANT offset at every lead, which is what the
sweep checks.
EITHER WAY IT IS THE USEFUL DIRECTION: a correction takes effect after the loop
closes and the mechanism moves, so a compensator driven by an ESTIMATE needs the
error it will HAVE. Brick 10's feedforward sidesteps that only because a static
constant can be evaluated at the command; anything that READS the machine has to
predict.

**BRICK 12 — THE PAGE.** `flexisim.html`, three tabs. **Move** builds the hybrid
arm, runs COMMISSIONING inside the frame loop (three pose holds, then a
deliberately excited decay for the bending mode) so the workflow is watched
rather than hidden in a blocking call, and then drives the repeating move with
compensation, input shaping and an INVERT toggle. The picture draws three lines:
what the program asked, what the ENCODER believes, and the truth — the link at
its real angle, bent by its own load, with the deflection exaggerated by a
labelled slider because it is well under a percent of the arm. **Verify** runs
the closed forms in this browser against the same modules. **Architecture** is
the design note.
TWO DISPLAY DEFECTS, BOTH OF THE CLASS THIS PROJECT KEEPS MEETING — no error,
nothing blank, just the wrong picture. (i) **THE LINK BENT TOWARD THE SKY.**
Body→world is a rotation by +θ and screen Y points DOWN; the first version
rotated by −θ and then flipped Y, which leaves a STRAIGHT arm looking correct
(the two negations cancel when the deflection is zero) while drawing every sag
upward. It is the anti-slosh tab's wave-on-the-wrong-wall bug in a different
frame, and it is fixed at the point of drawing. (ii) **THE CHART FROZE ON ITS
FIRST FIFTEEN POINTS.** `Plotly.react` compares data BY REFERENCE, so the live
arrays mutated in place are a no-op: the page showed a run that had stopped after
350 steps while the simulation was sixteen thousand steps in. A smoke check now
asserts the last plotted step is near the run's own step counter.
AND THE CHART IS SAMPLED IN SOLVER STEPS, not once per frame, because a
per-frame trace rescales itself whenever the steps-per-frame slider moves — a
viewing control changing the shape of a physics plot, which is FlowSim's
residual defect over again.
THE SMOKE TEST DOES NOT RE-MEASURE THE PHYSICS, which is already pinned in plain
Node where f64 is available. It checks what only a browser can break: that the
modules load as modules over HTTP, that commissioning reaches `ready`, that the
canvas is painted, that the in-browser closed forms pass, and that the
COMPENSATION CHECKBOX actually collapses the bias (−7.365e-2 → 2.811e-4, the
same numbers Node measures) while leaving the oscillation alone.
ONE CHECK FAILED FIRST AND THE PAGE WAS RIGHT: the in-browser self-weight sag
used the material span 16 instead of the ARM LENGTH 15.5 and read 10% low. The
boundary sits where the scheme puts it, not where the loop bounds are — the same
lesson as Poiseuille's H = Nz−2.

**BRICK 13 — THE SOFT SENSOR ON THE PAGE.** Under the tip-error chart: the
lifecycle as buttons (calibrating → **Start training ▶** → **Lock 🔒** →
estimating), a chart of truth against the estimate and the +150-step forecast,
and the scores. MEASURED IN THE BROWSER, locked after 1440 pairs on the same
servo-driven arm: **estimate 0.2600 against 1.0641** for "the tip is where the
encoder says" (4.1×), **forecast 0.1932 against 0.7238** for persistence (3.7×)
— the Node numbers, reproduced through the page's own sampling.
THE FORECAST IS DRAWN WHERE IT IS ABOUT, not where it was ISSUED: drawing it at
the moment of issue shifts it by exactly the lead, which makes a perfect forecast
look wrong and a lagging one look right (FlowSim's probe chart documents the same
trap). And THE METER RESTARTS AT THE LOCK, because a score spanning it is a blend
of the model that was still being told the answer and the one that is not.
THE PAGE HAD TO MEET THE MODEL'S CADENCE CONTRACT, which is what
`TipSensor.observe()` exists for: the lag window is counted in SAMPLES, so the
frame loop splits its step budget at sample boundaries rather than reading once
per frame — a frame loop free to step a partial interval pairs a reading with a
plant state between boundaries, and steps-per-frame is a VIEWING control.
The target is the ENCODER-relative error — the part the controller is
structurally blind to — and the page states the identity that converts it to the
command-relative one the stage draws, so the two traces on one screen cannot be
confused for the same quantity.

**THE SOFT SENSOR'S ESTIMATE WENT FLAT WHERE THE TRUTH WAS STILL MOVING (v222),
AND THE WINDOW WAS A TENTH OF THE RING.** Reported from the device with a
screenshot: the cyan estimate holds a constant through a whole section while the
white truth wanders, and the trace carries high-frequency spikes. The owner's two
proposals — route the COMMAND, and route the ACTUAL motor torque, "muted because
of the reflection through the gearbox but it will be there" — are both right, and
the second is the sharper one.
**THE CAUSE IS THAT EVERY SIGNAL IS MEASURED AND THE MACHINE IS PARKED.** During
a dwell the encoder speed is zero, the acceleration is zero, the pose is fixed and
the commanded torque is just the static gravity term, while the tip is still
ringing — and a flat input must give a flat output whatever the model. On top of
that the window reached back **(6−1)×2×10 = 100 solver steps against a 1011-step
bending period**, i.e. 10% of one cycle, so a free vibration's phase was outside
what the model could see even in principle.
**AND THE PAGE'S OWN HEADLINE AVERAGED IT AWAY**: 0.3071 overall against **0.5710
over the parked stretch alone**, with the estimate carrying only 52% of the
truth's motion there. Scoring the dwell separately is what turned a screenshot
into a number.
MEASURED, one plant and one stream — nRMSE overall / parked / share of the truth's
motion while parked / roughness as the estimate's 2nd difference over the truth's
own / cost per sample including the plant:
  narrow 6×2 universal (shipped)  0.3071  0.5710   52%   145×   4258 µs
  narrow 6×2 linear               0.5305  0.9143   22%   221×   3145 µs
    + motor reaction              0.3663  0.8135   46%    29×   3089 µs
    + commanded as well           0.2826  0.3968   67%    58×   3077 µs
  WIDE 12×9 linear                0.0809  0.1300   99%    15×   3092 µs
    + reaction + commanded        **0.0068  0.0106  100%   2.6×   3111 µs**
  WIDE 12×9 universal             0.0045  0.0096  100%   2.6×  29401 µs
**THE REACTION DOES EXACTLY WHAT WAS PREDICTED OF IT**: it doubles the estimate's
motion during a dwell (22% → 46%) because it is the one measured quantity that
survives being parked — the link's ringing pushes back through the gear teeth, and
a real drive's current loop must supply it, so measured current carries it while
the demand does not.
**AND THE MUTING COSTS NOTHING, WHICH IS THE USEFUL SURPRISE.** Scoring the
un-muted shaft torque instead gives **0.3663 — identical to four figures** —
because the model standardises its inputs and a constant 1/N vanishes into the
weights. No torque transducer is needed; the reflected signal is as good.
**THE SPIKES WERE A SYMPTOM AND ARE GONE WITHOUT A FILTER.** Roughness falls
**145× → 2.6×** of the truth's own, because the cause was `alpha_enc` — a first
difference of speed, i.e. a high-pass — being the only DYNAMIC input the model
had. Adding a smooth one displaced it. An auto-tuned output filter was the obvious
answer and would have treated the symptom.
**LINEAR SHIPS, AND IT IS CHEAPER THAN WHAT IT REPLACES.** Once the window and the
signals are right the 544-feature universal map is 9.5× the cost for 1.5× the
accuracy. Shipped: lag 12 × stride 9 (990 steps against a 1011-step ring), linear
features, plus the reaction and the commanded pair. In the browser the page's own
locked readout goes **estimate 0.3055 → 0.0513 and forecast 0.2401 → 0.0614**.
The stats now report the WINDOW REACH against the measured ring and turn red when
it is short, which is the diagnostic that would have made this visible without a
screenshot.
STILL OPEN, found on the way and not yet fixed: changing the Move span or speed
while the sensor is LOCKED leaves it running on a standardisation frozen for a
different trajectory, and it scores ~30 — worse than predicting the mean.
`applyMotion()` clears the board and the window and never touches the sensor.
FlowSim's soft sensor has rolling recalibration for exactly this; TipSensor has
none.

**BRICK 14 — THE SECOND JOINT, i.e. THE FIRST THING HERE THAT IS ACTUALLY A
CHAIN.** `lib/flexisim/arm2r.js`: two lumped joints, two lattice links, ONE
COUPLED SOLVE. Three terms appear that a single joint cannot show and that a
per-joint model has no way to represent.
**THE INERTIA IS THE CONFIGURATION.** M11 carries 2 m₂L₁c₂cos q₂, measured
**77780 straight against 38468 folded — 2.02×** — so a controller tuned at one
pose is mistuned at another. Every constant is INTEGRATED FROM THE LATTICES, the
same discipline as brick 6 and for the same reason.
**THE JOINTS ARE COUPLED THROUGH M**, so accelerating the shoulder puts M₂₁α₁ on
the elbow whether or not the elbow was asked to do anything — the term the tab's
premise is about, and the encoder on joint 2 sees none of it.
**THE SECOND BODY FRAME'S ORIGIN ACCELERATES AS WELL AS ROTATING.** The elbow is
being swung around by joint 1, so link 2's frame carries the elbow's LINEAR
acceleration — tangential L₁α₁ and centripetal L₁ω₁², two parts with different
signatures, so a test that only accelerates from rest sees one and a test that
only spins at constant rate sees the other.
**THE CLOSED FORM THAT PINS IT IS THE OFFSET ROTATING BAR.** Spun at constant ω
with the elbow straight, link 2's σ_xx must be ½ρω²((L₁+L)² − R²), the profile
about the SHOULDER rather than about its own root. Measured: **0.60% against the
offset profile and 212.9% against the un-offset one** — and with the elbow term
DROPPED it lands on the other one instead (69.4% / 4.2%), which is what makes the
omission a plausible wrong answer rather than a visible failure.
THE HALF-CELL BIT AGAIN, and it cost 11%: the free surface is the OUTER FACE of
the last material cell, half a cell beyond the last cell CENTRE that
`armLength()` reports. Using `armLength` as the free radius fits to 11.15% and
reads like a missing physics term rather than an off-by-half. Same lesson as
gravity's ρg(NX−x) and Poiseuille's H = Nz−2.
**WHERE THERE IS NO CLOSED FORM THE CHECK IS A CONSERVATION LAW, WHICH IS
BETTER** — it is not anything the solver computes. With no gravity and no joint
torques the arm is closed and conservative, so the ENERGY is constant and so is
**the momentum conjugate to q₁** (Noether: with no gravity the shoulder angle is
a CYCLIC coordinate — the Lagrangian depends on the elbow angle and not on where
the arm is pointing). Measured over 20000 free steps: energy drift 2.1e-4,
momentum drift 1.6e-4, with the shoulder sweeping 3.2 rad. **AND IT HAS TEETH**:
the Coriolis terms are exactly what make that momentum conserved, so stepping
without them drifts **2.3e-2 in a tenth of the run** — asserted, because a
conservation law that would pass with the physics removed is not a check.
THE FREE ARM'S ELBOW OSCILLATES RATHER THAN SPINNING, which is the physics and
not a stuck integrator: with the energy and p₁ both fixed the elbow moves in an
effective one-degree-of-freedom potential and is generally trapped in it. The
shoulder is the coordinate that sweeps, so that is what the non-triviality check
reads — the first version read the elbow, saw 0.02 rad, and would have called a
correct run stuck.
`Joint.stepMotor()` splits out because the LOAD side can no longer be integrated
inside each joint — M couples them — while the motor half genuinely is per-joint,
sitting upstream of the gear teeth and seeing only the reaction τ/N. `step()` is
unchanged as the single-DOF composition of the two halves.
AND THE SHOULDER'S WIND-UP IS LEVERED BY THE WHOLE REACH, not by link 2: a
milliradian at the shoulder costs (L₁+L₂)/L₂ times what a milliradian at the
elbow does, and the reach itself folds with the elbow (23.0 straight, 4.0
folded). `tipError()` reports the four contributions separately rather than
folding link 1's bending in with a lever arm it does not have — that term needs
the SLOPE at link 1's tip, not its deflection.

**BRICK 15 — THE CHAIN ON THE PAGE**, its own tab and its own plant, sharing
nothing with the Move tab's single-joint arm except the modules. `ChainServo`
joins `lib/flexisim/compensator.js`: **computed torque**, evaluating the arm's
own rigid model AT THE COMMANDED POSE — per-joint PD is not enough on a chain,
because the shoulder's inertia depends on the elbow by a factor of two and each
joint's acceleration loads the other. The N·J_m term is in it because at ratio
100 the motor accelerating ITSELF is comparable to the whole link. What it
deliberately does not model is the gearbox compliance or either link's
flexibility — that is the subject of the tab.
**THE CHART IS THE CLAIM, AND IT IS NOT A TAUTOLOGY.** With the elbow commanded
to HOLD, its gearbox carries a torque anyway; the chart splits that inertial load
into **M₂₁·α₁ (the shoulder's doing) and M₂₂·α₂ (its own)**, measured in-browser
at rms **1.15e-2 against 8.2e-4 — 14×**. Plotting the SUM against the transmitted
torque would prove nothing, since M₂₁α₁ + M₂₂α₂ ≡ τ₂ + G₂ − C₂ IS the equation of
motion; splitting it is what says something.
**A CHAIN HAS TO BE DRAWN AS A CHAIN.** Link 2 hangs off link 1's DRAWN tip —
position AND slope — not off the rigid elbow: the deflections are exaggerated, so
a forearm attached at the un-exaggerated elbow floats away from the upper arm and
the picture reads as a broken linkage rather than a bent one. The SLOPE is the
part that is easy to forget — a bent upper arm does not merely move the elbow, it
TILTS everything downstream, levered by the whole forearm.
Three cosmetic corrections that were really honesty corrections: the CLAMPED root
cells are no longer drawn (they are the joint's output flange and sit at negative
body x, i.e. inside the joint, so drawing them puts a stub out of the back of the
shoulder); the default plant was stiffened to E 0.15 / K 16 because at E 0.1 / K 8
the tool ran **6% of the reach** off target and walked off the stage at any
readable exaggeration (it is now 0.2%); and the chain only steps while its own tab
is showing, since two lattices are 1.6× the Move tab's cost and a hidden
simulation burning the frame budget is the page competing with itself.
AND ONE SMOKE CHECK WAS TOO TIGHT AND HAD BEEN PASSING BY LUCK: the error chart's
lag tolerance was 600 steps when the chart refreshes every sixth frame, which at
the slider's maximum is 1200 steps of legitimate lag. It is looking for a chart
FROZEN at its first points — a gap of tens of thousands — not for one a frame
behind.

**BRICK 16 — THE TOOL SENSOR ON A CHAIN, AND THE ARCHITECTURE QUESTION A CHAIN
MAKES ASKABLE.** `lib/flexisim/chainsensor.js`. The single-joint sensor had one
possible set of inputs; a chain forces the choice a real controller faces —
**PER-JOINT** (each axis estimates from its own signals: what a distributed drive
naturally supports, and what every servo vendor's compensation package looks
like) or **WHOLE-ARM** (one model reads every axis, which needs the signals
gathered in one place and is a real cost on a real machine).
MEASURED, locked, 496 samples: whole-arm learner **0.0689** against a RIGID
two-joint compliance model that is given M(q), both stiffnesses and both lever
arms (**0.9396**, 13.6×) and against "the tool is where the encoders say"
(1.0380). The forecast 150 steps ahead scores 0.1707 against 0.8555 for
persistence.
**THE COMPARISON IS ONLY WORTH ANYTHING AT MATCHED CAPACITY**, and getting that
right is most of the work: the whole-arm model reads 10 signals and a single-axis
one reads 5, so at equal lag counts it would have three times the features and
part of any gap would be model SIZE rather than information. Six lags for the
single-axis models against three for the whole-arm one puts all of them at the
same 30-dimensional base and the same 544-feature basis — and hands the
single-axis models a window TWICE AS LONG, which if anything favours them.
  whole arm      **0.0689**
  shoulder only    0.1373   (2.0×)
  elbow only       0.1771   (2.6×)
**IF YOU CAN ONLY INSTRUMENT ONE AXIS, INSTRUMENT THE SHOULDER** — it is levered
by the whole reach AND it drives the coupling that loads the elbow, so its
signals carry more about the tool than the elbow's own do. That is the opposite
of the intuition that the joint nearest the tool matters most.
**AND NEITHER SINGLE-AXIS MODEL IS BLIND, WHICH IS THE HONEST HALF.** "The elbow
cannot see the shoulder's acceleration by construction" is the tidier claim and
it is WRONG: the coupling back-drives the elbow's encoder and the elbow's servo
fights it, so it leaves an indirect trace in the elbow's own signals through two
layers of loop dynamics. Both single-axis models beat the naive view comfortably.
They are handicapped, not blind.
**THE GOLDEN RATIO IS NOT DECORATION.** The move profile is exactly periodic, and
a 544-feature model fitted to a periodic stream can score beautifully by learning
WHERE IN THE CYCLE it is — at which point the test set is the same cycle it
trained on and the number means nothing. The command's amplitude is modulated at
an INCOMMENSURATE rate so every cycle is a state the model has not seen. Measured:
modulation off **0.0142**, on **0.0454** at the same settings — and a window taken
FURTHER out still, on states even less like the training ones, reads **0.0355**,
LOWER rather than higher. That is what says it generalises rather than recalls,
and it is the check the single-joint sensor never needed because its plant was
never this over-parameterised.

**BRICK 17 — THE TOOL SENSOR ON THE PAGE, TWO MODELS ON ONE STREAM.** Under the
coupling chart: a whole-arm readout and an elbow-only one trained SIDE BY SIDE on
the same samples at the same 544-feature capacity, so the comparison is
like-for-like at every instant rather than two runs apart. Measured in-browser
after 1152 pairs with both joints moving: **whole arm 0.0873, elbow only 0.1914
(2.19×), naive 1.0240** — the library's 0.0689 / 0.1771 reproduced through the
page's own sampling.
**AND THE ANSWER REVERSES BY REGIME, WHICH IS NOW MEASURED AND STATED RATHER
THAN AVOIDED.** With the elbow commanded to HOLD — the configuration that makes
the coupling clearest — the whole-arm model LOSES: **0.562 against 0.494**, and
both models are five to eight times worse than with both joints moving, so that
regime is harder for everyone rather than for one architecture. **I DO NOT HAVE
A CLEAN MECHANISM, AND THE OBVIOUS ONE DIED ON MEASUREMENT**: matching feature
count forces different TIME SPANS (3 lags at stride 2 reach back 4 samples
against the single-axis model's 10), so the natural guess is the window — but
giving the whole-arm model stride 5, which matches the span exactly at the same
feature count, makes it **worse still, 0.793**. Two wrong hypotheses, both
falsified, and the finding recorded as regime dependence without a story
attached.
CHANGING THE REGIME RESTARTS THE SENSORS, because a frozen standardisation
belongs to the stream it was calibrated on — carrying a model trained with the
elbow held into a run where the elbow moves is exactly the drift failure
FlowSim's soft sensor documents. It also means the training button cannot enable
while the loop is paused, which the first smoke check learned by waiting thirty
seconds for a button that could not light.
THE COMMAND'S AMPLITUDE IS MODULATED ON THE PAGE TOO, for the reason brick 16
gives: an exactly periodic stream lets a 544-feature model score by recognising
where in the cycle it is.

**BRICK 18 — THE DRIVE-SIDE FEEDFORWARD, AND THE ONE TERM NOBODY HAS THE NUMBER
FOR.** The servo carries the textbook feedforward (J_refl·α + τ_load)/N: exactly
right about inertia and gravity, because both come off the CAD, and silent about
FRICTION, because nobody has that number on a real machine. That is the same
asymmetry the anti-slosh tab's "engineering" Kalman filter is built on.
`ServoFF` — the last unused block the audit named — watches the closed loop while
the hand model drives and learns the TOTAL APPLIED torque, which is the
self-commissioning premise: the PD loop is already generating whatever the hand
model omits, so the learner does not have to be told what is missing.
**THE CLAIM IS TWO-SIDED AND BOTH SIDES ARE ASSERTED.** Following error, rms, over
one move after handing the feedforward over with the PD loop unchanged:
  with Stribeck friction   hand **7.336e-3** → learned **2.725e-3**   (2.69×)
  with NO friction         hand **6.630e-4** → learned **8.564e-4**   (0.77×)
The learner wins only where the hand model is WRONG, and costs 30% where it is
exact — a fit to an exact model can only add variance. A brick that measured the
first row alone would be claiming that learning beats knowing. And the missing
term's price is the third number: the same feedforward and the same gains go
6.63e-4 → 7.34e-3, **11×**, when friction is added.
The terms it leans on are `coulomb`, `viscous`, `grav_s`, `grav_c`, `inertia` —
naming them is what separates "it fitted something" from "it fitted the missing
physics".
**AND ITS TERM PRUNING IS MEASURED AND REJECTED HERE.** Two things went wrong,
and the first is this project's oldest lesson: `pruneFloor` is an ABSOLUTE
threshold on |θ|, and in lattice units where the torques are ~1e-4 it prunes
EVERY term — the same class of error as `RobotComp`'s prior being weak in the
abstract rather than weak relative to the regressor. With the floor removed the
fractional threshold keeps 7 of 39 and the feedforward is still **14× worse**,
because the basis is deliberately REDUNDANT: the lag terms duplicate the
instantaneous ones on a smooth reference, RLS splits the weight across
near-collinear terms in large near-cancelling pairs, and pruning by magnitude
removes one side of a cancellation. Ships with every term live.
ALSO MEASURED: a snappier move (200/300/700 instead of 300/400/1100) raises the
inertial torque and shrinks friction's share of it, and the same plant then shows
1.4× instead of 2.7×. That is a different question rather than a weaker answer —
what a missing friction term costs depends on how hard the move pushes.
Full tier: ~100k solver steps, and it is a measurement about a library block
rather than a contract of the shipped page, which uses the hand-built model.

**BRICK 19 — THE N-LINK CHAIN, AND THE TWO-LINK CASE AS ITS TEST.**
`lib/flexisim/armnr.js` does the same physics by RECURSIVE NEWTON-EULER — one
O(N) pass for the bias torques C q̇ + G, N more for the columns of M(q) — so
nothing is differentiated by hand and adding a joint is a list entry rather than
a derivation. Gravity enters by accelerating the base at −g, which is the same
equivalence brick 4 asserted bit-for-bit on the lattice.
**THE HAND-DERIVED 2R IS WHAT VERIFIES IT.** That one was checked against closed
forms and conservation laws before this existed, so the general solve is required
to REPRODUCE it at N = 2 over twelve poses and rates: **M to 2.8e-15, gravity to
1.4e-16, Coriolis to 1.1e-15, and the frame parameters EXACTLY**. Two independent
routes to the same matrix is a far stronger statement than either alone, and it
is what lets a third link be trusted without a third derivation.
THREE LINKS, and the numbers are wider than two: the base inertia varies
**4.43×** across the workspace (1.79e5 straight, 4.04e4 with the elbow folded)
against the 2R's 2.02×, because the base now has two links to fold back over it.
Free-arm conservation over 20000 steps: energy 4.9e-4, the momentum conjugate to
the cyclic base angle 3.9e-4, with the base sweeping 2.8 rad — and removing the
bias torques drifts **4.4e-2 in a tenth of the run**, so the law has teeth.
**THE THIRD LINK IS WHAT A TWO-LINK DERIVATION CANNOT EXERCISE**: its body frame
is carried by TWO joints, so its origin's acceleration accumulates through both.
Spun straight, its σ_xx fits the rotating-bar profile about the BASE to **1.95%**
and the un-offset one to **529%**; with the origin acceleration dropped it lands
on the other (84% / 3.0%). And each joint's wind-up is levered by the distance
from THAT joint to the tool — 29.5 / 16.0 / 6.5 here — which is why the joints do
not contribute equally and why `tipError()` reports them separately.
Three seconds at both tiers: the conservation checks never touch a lattice.

**THE WGSL ELASTIC KERNEL IS DELIBERATELY NOT BUILT, AND THE REASON IS MEASURED
RATHER THAN ASSERTED.** The whole point of per-link body-frame lattices is that
each link is SMALL and dense, and a small dense lattice is exactly where a GPU
dispatch is not worth its overhead. CPU reference throughput, f32, measured:
  10×4²    832 cells   0.202 ms/step   4.1 Mcell/s
  16×4²   1216 cells   0.295 ms/step   4.1 Mcell/s
  24×6²   2700 cells   0.779 ms/step   3.5 Mcell/s
  40×8²   6192 cells   1.995 ms/step   3.1 Mcell/s
  64×12² 17152 cells   6.421 ms/step   2.7 Mcell/s
  96×16² 39600 cells  16.471 ms/step   2.4 Mcell/s
The shipped links are the second row. A step needs THREE dispatches (the frame
force, the velocity pass, the stress pass) at roughly 20–100 µs of encode-and-
submit each, against 295 µs of CPU work — so a GPU backend would be at best
break-even and probably slower at the geometry the page actually runs.
WHAT WOULD CHANGE THE ANSWER, stated so the decision is falsifiable rather than
permanent: the design note's own sizing for a real arm is ~22k cells per link at
dx 8 mm, which is the 64×12² row — 6.4 ms/step on the CPU and three links of it,
where a GPU would pay several-fold. So the kernel is worth building for a
REAL-RESOLUTION arm and is not worth building for this one, and the crossover is
between the 6k and 17k rows. Until a page needs that resolution, a WGSL port
would be a slower path verified only under a software adapter.


**BRICK 20 — THREE CORRECTIONS ON ONE CONTROL, AND THE CLOSED LOOP DIVERGED THE
FIRST TIME BECAUSE OF WHAT IT DID TO ITS OWN SENSOR.** The Move and Chain tabs
each get a three-way selector rather than a checkbox, because the modes are
ALTERNATIVES and there is no machine that is both: **① open loop** (no correction
at all), **② open loop + prediction** (the identified compliance, evaluated at the
COMMAND, which is what makes it a production correction rather than a
demonstration), **③ closed loop** (the servo setpoint driven so the ESTIMATED tool
reaches the program's setpoint, using the soft sensor and no model at all). A
scoreboard scores each over exactly one move period, and **Compare ▶** runs the
whole sequence by itself — settling each mode before reading it, and settling ③
for five moves rather than one, because it is a lag and reading it earlier would
be reading a meter before it settles.
**THE SIGN AND THE LAW ARE THE SAME FOR ALL THREE, WHICH IS THE POINT.** The tool
sits at L·θ_encoder + e, so landing it on L·θ_ref needs θ_encoder = θ_ref − e/L.
② predicts e as L·c·τ; ③ measures it. Same law, different source.
**THE FEEDBACK SIGNAL IS THE ESTIMATED TOOL AGAINST THE PROGRAM, not the estimate
alone** — the difference is the FOLLOWING ERROR, which the controller knows
exactly and the sensor cannot see. It costs nothing on the Move tab, where the
servo tracks to a fraction of the sag, and it is MOST OF THE ERROR on the chain.
**AND THEN MODE ③ DIVERGED, FOR A REASON THAT GENERALISES TO EVERY SOFT SENSOR
PUT INSIDE A LOOP.** The correction shifts the encoder angle; the encoder angle is
a model INPUT; and a 544-feature universal map asked about an operating point it
never saw during training answers confidently and wrong. Held at a FIXED
pre-distortion with the truth measured alongside, trained without a dither:
  off 0.000  estimate 1.00× the truth      off 0.010  5.09×
  off 0.002  1.60×                         off 0.020  6.27×
  off 0.005  2.67×                         off 0.050  26.1×
**THE TRUTH IS FLAT ACROSS EVERY ROW** — a pre-distortion moves the encoder and
the link together, so the tip error relative to the encoder does not care — and
the estimate moves in the direction that demands MORE correction. That is
positive feedback: measured, the correction ran to its 0.05 clamp and the tool
ended up 0.58 out instead of 0.074, i.e. **eight times worse than doing nothing**.
**THE FIX IS A COMMISSIONING DITHER, and it is this project's oldest lesson in a
new costume.** Training now deliberately dithers the pre-distortion — at 1.5× the
tracker-measured tip error over the arm, which is the correction the machine needs
BY DEFINITION — on a period incommensurate with the move. Retrained:
  off 0.000  1.01×    0.005  0.98×    0.020  0.67×    0.050  0.18×
Flat over the range the loop occupies and degrading GRACEFULLY outside it rather
than exploding. The loop then converges: the pre-distortion settles at 7.4e-3 and
the tool's bias against the program goes **−7.7e-2 → −2.9e-3, a 26× reduction with
no model at all**.
**IT IS NOT FREE AND THE PRICE IS STATED**: in the controlled Node comparison —
one script, one variable — the locked open-loop estimate goes nRMSE 0.383 → 0.400
at a dither of 0.004 and 0.413 at 0.008, so about 8% of accuracy buys a loop that
converges instead of diverging. IN THE BROWSER THE SPREAD SWALLOWS IT: three runs
measured 0.3384 (no dither), 0.3870 and 0.3346 (with), i.e. run-to-run variation
as large as the effect, which is why the price is quoted from the controlled
comparison and not from the page. This is the anti-slosh
tab's health-check probe exactly: **success at correcting an error removes the
evidence of it**, so the machine has to be driven somewhere it would not otherwise
go in order to learn what it needs. There it was an unshaped probe move; here it
is a wobble on the correction.
**THE CHAIN'S RIVAL HAD TO BE MADE A REAL ONE.** The first version drove the
shoulder from `ChainSensor.rigidEstimate`, which carries the INERTIAL term alone —
and an inertial term is ZERO-MEAN over an out-and-back move, so it cannot touch a
bias no matter how right it is. Measured, it made the chain's tool bias WORSE.
`ChainServo` now exposes `jointTorques()` (the load-side M(q)a + C − G it already
computed for its own feedforward, split out so a compensator cannot end up with a
second copy of the same model) and `toolOffset()`, each joint's wind-up levered by
the distance from THAT joint to the tool. Gravity is what makes a compliance model
able to correct anything in steady state.
**"THE COMPENSATED MOVES ARE UNDERWHELMING" — REPORTED FROM THE DEVICE, AND THE
NUMBERS AGREE WITH THE COMPLAINT WHILE THE MECHANISM EXONERATES THE CORRECTION.**
At the shipped move the ringing is **94% of the error**, so a correction that
removes the bias 246× moves the rms by **1.00×**. That is not a defect and it is
not a disappointment either — it is the decomposition this tab was built to show,
read at the one setting where the half it fixes is the small half.
MEASURED, one plant, one identified constant, rms of the tool against the program
over a whole move plus the settled dwell alone:
  open loop                        bias −7.36e-2 · osc 1.92e-1 · rms 2.06e-1 · settled 1.27e-1
  + prediction                     bias  2.99e-4 · osc 2.05e-1 · rms 2.05e-1 · settled 1.30e-1
  + prediction + ZVD               bias  1.52e-4 · osc 6.14e-2 · rms 6.14e-2 · settled 3.24e-2
  + prediction, 2× gentler move    bias  1.50e-4 · osc 5.60e-2 · rms 5.60e-2 · settled 4.37e-2
  + prediction + ZVD + 2× gentler  bias  1.20e-4 · osc 2.68e-2 · rms 2.68e-2 · settled 1.18e-2
**SHAPING IS WORTH 3.3× ON THE RMS AND A GENTLER MOVE 3.7×; TOGETHER WITH THE
CORRECTION, 7.7× ON THE RMS AND 11× ON THE SETTLED ERROR.** The correction is
necessary for all of it — the bias survives every shaper, since a unit-sum
convolution cannot move where a move ENDS — but it is never sufficient.
**WHY NO COMPENSATOR CAN DO THE OTHER HALF, stated as physics rather than as an
excuse:** `TipCompensator` already carries the inertial term, but it is
QUASI-STATIC — it assumes the deflection follows the commanded torque instantly.
A resonance does not; it is excited by the acceleration steps and rings at its
own period afterwards. Cancelling that needs the EXCITATION changed, which is
what a shaper does and what a gentler ramp does.
**AND A HYPOTHESIS WAS FALSIFIED ON THE WAY**, which is why it is recorded: the
obvious guess was that shaping only the link's bending mode leaves the GEARBOX
resonance (1.91e-2 rad/step, period 329, against the link's 6.2e-3 and period
1011) untouched. Convolving a second ZVD for it buys **8% on the moving rms and
makes the settled case WORSE** (3.24e-2 → 3.57e-2) — its extra delay costs more
than the mode it cancels is worth. The gearbox is not the limit here; the link
is. The anti-slosh tab's multi-mode shaper was the right answer to its plant and
is the wrong one to this.
The page now says all of this where it is needed: the stats report what FRACTION
of the error is oscillation and name the control that addresses the dominant
half, and mode ②'s hint states up front that the rms will barely move.

**THE FEEDFORWARD WAS NEVER LOOKING AHEAD, AND IT SHOULD HAVE BEEN FROM THE
START.** Raised from the device — "the feed forward needs to use an adequately far
ahead estimation, just want to make sure we are using it that way and not on the
current estimation" — and it was not: `offsetNow` fed `TipCompensator` the pose
and acceleration commanded at THIS step, so the pre-distortion for a deflection
was applied at the instant the deflection was already happening. The plant cannot
answer that fast: the servo's time constant is 1/SERVO_BW = 500 steps, the gearbox
rings at 329 and the link at 1011, so a zero-lead correction lands about a half
period late on the mode that dominates the error.
**TWO INDEPENDENT SWEEPS PUT THE OPTIMUM AT THE SERVO'S OWN TIME CONSTANT**, which
is why `FF_LEAD = round(1/SERVO_BW)` is derived rather than picked. Sweeping the
lead on the shipped model (rms of the tool against the program):
  lead    0     200    350    500    550    650    800   1000   1300
  rms  2.05e-1 1.76 1.60 1.60 1.63 1.73 1.89 2.05 2.09  (e-1) → **1.28× at 350–550**
and iteratively refining a per-phase correction profile — which bounds what ANY
feedforward can achieve, whatever generates it — peaks in the same place:
  lead   260    400    550    700    850
  best  1.0×   2.8×   6.7×   3.7×   1.4×
**THE INTERIOR OPTIMUM IS THE PART THAT MATTERS.** Pure extrapolation is monotone,
so a peak at 550 with worse on both sides is a PHASE result and not a
"more-preview-is-better" one. Measured in the browser afterwards, the oscillation
goes 2.04e-1 → 1.62e-1, i.e. 1.26× against the 1.28× Node predicted.
**IT CONTRADICTS THE ANTI-SLOSH TAB, AND BOTH ARE RIGHT.** There, preview in the
feedforward measured NEGATIVE (residual wave 0.188 → 0.477 mm, monotone, no
interior optimum) because the shaper was already cancelling by exact timing and
preview only re-shifted an excitation that was being handled. Here nothing is
correcting the phase at all. Same free signal, opposite sign in two roles — which
is exactly what that entry said to expect, and this is the first time the other
sign has been measured.
**AND THE LEAD RECOVERS ONLY 1.28× OF THE 6.7%, WHICH LOCATES THE REAL LIMIT.**
The gap is the model's FORM, not its timing: a quasi-static scalar δ = L·c·τ
evaluated at any single future instant cannot reproduce what the converged profile
does, because the required pre-distortion is not a function of one instant's
torque — it is a FILTER over the command across the resonance period, of which a
shaper and a scalar gain are both special cases. That is the case for a LEARNED
dynamic feedforward (a lag/lead window over the commanded kinematics, fitted by
the library's own RLS against the tracker during commissioning and then locked),
and it is measured rather than asserted: the ceiling is 6.7× and still falling at
the 28th iteration. NOT YET BUILT.
THE CHAIN TAB'S CORRECTION IS STILL ZERO-LEAD; the same fix applies there and has
not been measured on it.

**THE LEARNED DYNAMIC FEEDFORWARD: MEASURED, GENERALISING, AND NOT YET BUILT.**
The design the gap above calls for, prototyped in Node end to end. Commissioning
converges a per-phase correction against the tracker by iterative refinement, and
a REGRESSION on the commanded kinematics is then fitted to that profile — twelve
taps of (θ, ω, α) spanning −300 to +1500 steps, which covers the servo's 500-step
response and more than one 1011-step bending period. Afterwards it runs on the
COMMAND alone, so the tracker goes away exactly as it does for every other block
on this tab.
**FITTED TO ONE TRAJECTORY IT MEMORISES THE TRAJECTORY**, and that failure is the
more useful half of the result. On the move it was trained on it reproduces the
iterative ceiling almost exactly — **5.83×**, against a fit residual of 1.0% — and
on moves it has not seen it is a catastrophe:
  double the span   0.24×      2.2× faster   1.17×      half span, gentler  0.05×
i.e. up to **twenty times WORSE than doing nothing**. This is brick 16's finding
in a new place: a model fitted to a single periodic stream can score beautifully
by learning WHERE IN THE CYCLE it is, and the commissioning PROTOCOL matters more
than the model class does.
**TRAINED ACROSS THREE MOVES IT LEARNS THE DYNAMICS INSTEAD** (spans 0.072 /
0.144 / 0.288 at three ramp rates, features standardised because the taps carry
θ ~ 1e-1 against α ~ 1e-6 and an unnormalised ridge is a different penalty on
each). Against the compensator WITH its lead:
  TRAINED   span .144 1.0×    1.600e-1 → 5.148e-2   3.11×
  HELD OUT  span .216 1.4×    3.472e-1 → 9.756e-2   **3.56×**
  HELD OUT  span .100 0.7×    6.461e-2 → 3.539e-2   1.83×
  HELD OUT  span .360 2.2×    8.492e-1 → 2.439e-1   **3.48×**
**THE HELD-OUT MOVES SCORE AS WELL AS THE TRAINED ONE**, which is the signature
that separates a learned map from a memorised one — and the trained move FELL from
5.83× to 3.11× in the process, which is the honest price of a model that has to
serve many trajectories instead of one.
WHAT REMAINS BEFORE IT CAN SHIP is cost, not doubt: three iterative convergences
is ~320k solver steps of commissioning, against the ~24k the pose touches and the
decay take today, so the routine needs a step budget of its own rather than the
viewing slider's. The measurement above is what says it is worth paying.

**AND THE MOVE PROFILE IS NOW A CHOICE**, because a point-to-point move and a
sinusoid ask different questions: the trapezoid excites the plant with a broadband
transient whose content depends on the ramp, while a sinusoid excites it at ONE
frequency, so sweeping past the bending mode is how a compensator's response is
actually characterised. `SineProfile` is closed-form for the same reason
`AngleProfile` is — the reference is what every error is measured against, so it
must not share the plant's own integration error. **THE FREQUENCY SLIDER'S RANGE
COMES FROM THE PLANT**: the servo's bandwidth is 2e-3 rad/step (period ~3100) and
the bending mode runs 900–2800 steps across the E ladder, so periods of 800 to
12000 span quasi-static, through the resonance, to past what the servo can follow
— and the readout prints the period AS A MULTIPLE OF THE BENDING PERIOD, since a
number of steps says nothing about which side of the resonance you are on.
**AND THE PROFILE SELECTOR SHOWED BOTH PROFILES' SLIDERS AT ONCE, found in a
screenshot and by nothing else.** `hidden` is only a UA `display:none`, and ANY
class rule that sets `display` beats it — `.controls` sets `display:flex`, so
hiding one group did nothing. No error, nothing blank, just the wrong picture, and
the attribute was set exactly as intended the whole time. It is the console
button's `min-width` bug in a different property, and the regression asserts
VISIBILITY (a measured height of zero) rather than the attribute, for the same
reason that one had to assert geometry rather than presence.
**AND THE CHAIN'S SCOREBOARD WAS MEASURING THE WRONG THING ENTIRELY, which the
corrections only exposed.** The chain's reference is amplitude-modulated at the
golden ratio so the tool sensor cannot score by learning where in the cycle it is
— but `refs2()` scaled theta, omega and alpha by the SAME factor m, when
d/dk (m·theta) = m·theta' + m'·theta. The computed-torque feedforward was
therefore being handed a velocity that is not the derivative of the position it
tracks, and the servo made up the difference with a following error that swings
with the modulation's PHASE. Six consecutive identical 9000-step blocks with NO
correction at all measured the tool's bias against the program at
  −0.186 / +0.243 / −0.672 / −0.121 / −0.816 / −0.172
— a spread of **1.06 against corrections worth about 0.09**, so the scoreboard was
reporting the modulation's phase and calling it the correction, and it duly
reported that the model made things worse. With the derivatives made consistent
the same six blocks read −0.059 / −0.089 / −0.093 / −0.075 / −0.076 / −0.046, a
spread of **0.047 (22× tighter)** sitting right beside the −0.073 an UNMODULATED
reference gives. The modulation was never the problem; an inconsistent derivative
was — and it had been shipping since brick 15, silently costing following error,
because nothing until now tried to measure a bias.
MEASURED ON THE CHAIN once that was fixed (Node, the loop fed the truth so the
ceiling is separated from the sensor's own error): bias **−8.9e-2 open → −6.3e-2
with the rigid model (1.4×) → −2.1e-3 closed (43×)**. THE MODEL HELPS ONLY A
LITTLE, AND THAT IS THE RESULT rather than a weak check: it carries the gearbox
wind-up and has no term at all for either link's own BENDING, which on this chain
is most of the tool error. It is a real rival — given M(q), the Coriolis terms,
gravity, both stiffnesses and both lever arms — and the loop beats it by better
than an order of magnitude.
**AND THE CHAIN'S NUMBERS ARE NOISIER THAN THE MOVE TAB'S BY A LOT, which decided
what the browser is allowed to assert.** In the shipped regime — both joints
moving, the amplitude modulated at the golden ratio so the sensor cannot score by
cycle position — the tool's bias against the program is about **5e-2 to 1e-1**,
while the whole-arm sensor's nRMSE of ~0.10 against a tool error whose spread is
~0.46 leaves a residual of **the same 4e-2**. A LOOP CAN ONLY NULL WHAT ITS
INSTRUMENT CAN RESOLVE. Three separate readings of the same three modes:
  browser run A   open −5.1e-2 · model −6.8e-2 · closed −4.5e-2
  browser run B   open −7.2e-2 · model −4.9e-2 (1.5×) · closed −2.4e-2 (2.9×)
  the page's own board, run B   open −1.08e-1 · model −2.6e-2 (4.1×) ·
                                closed −1.8e-2 (6.0×)
The corrections DO work — the two later readings agree on the ranking and on the
direction — but run A puts the model on the wrong side of the open loop, so the
effect and the measurement's own noise are the same size. The browser is therefore
asked to pin the WIRING and the STABILITY (every mode reaches the shoulder as a
real pre-distortion; the loop settles rather than running to its clamp; nothing
makes the tool dramatically worse) and the CEILING is measured in Node, where the
loop can be fed the truth and the comparison controlled — which is the tier rule
this file already states.
**THE MOVE TAB IS CRISP BY COMPARISON AND THE DIFFERENCE IS THE REFERENCE.** There
the move repeats exactly, the model learns the periodic pattern, its residual is
zero-MEAN even though its rms is comparable, and the same loop takes the bias
**−7.4e-2 → 2.8e-3** reproducibly across every run. A non-repeating reference is
what a real machine has, and this is what it costs: the estimate's rms is not the
number that matters to a loop, its BIAS is, and nothing about an nRMSE tells the
two apart.
**AND THE CHAIN NEEDED TWO NUMBERS DERIVED RATHER THAN CARRIED OVER FROM THE MOVE
TAB, both of which the first version simply reused.** (i) THE SCORING WINDOW: the
Move tab's reference repeats exactly, so one move period is the whole experiment;
the chain's is amplitude-modulated at the golden ratio with the elbow a quarter
period out of phase, deliberately non-repeating, so a mean over one period reports
where in the BEAT the window fell. Six consecutive identical open-loop blocks —
  1 period   −0.121 / +0.048 / −0.212 / +0.002 / −0.053 / −0.185   spread 0.26
  3 periods  −0.088 / −0.098 / −0.090 / −0.071 / −0.056 / −0.056   spread 0.042
6× tighter against corrections worth about 0.03. (ii) THE LOOP GAIN: a bias over a
whole move cannot be corrected by a loop faster than the move. At the Move tab's
time constant of ~1200 steps against a 3800-step move the pre-distortion swung
between 2e-3 and 3.7e-2 and took the tool's bias with it; derived from the move
period instead it settles. Both are the same mistake in different clothes — a
constant that was right for one plant carried to another without re-deriving it,
which is the double pendulum's ridge all over again.

**BRICK 22 — THE CHAIN GETS THE RINGING UNDER CONTROL: A MEASURED SHAPER AND THE
LEARNED FILTER, AND THE PARAMETERS ARE THE CHAIN'S RATHER THAN THE MOVE TAB'S.**
Reported from the device: "both auto-tuned results are pretty bad unless really
slow and the chain can't even be slow enough because the slider is bottomed out …
there is a note about resonance not being able to be captured. This has to be
addressed and the oscillation must become controllable." Four things were wrong
and only one of them was the note.
(i) **THE COMPARE TABLE ON THE CHAIN HAD NEVER RECORDED A SINGLE ROW**, and every
surface said otherwise: each mode ran, the sequence advanced, the badge said
"compare done", and auto-tune then reported "nothing scored". The settling loop
was copied from the Move tab, where the scoring window is ONE move period, so
clearing the window at every boundary it waits out is harmless. The chain's window
is THREE periods (its reference beats at the golden ratio, so one period reports
where in the beat the reading fell), one period after the last clear left it a
third full, `win2Stats().full` was false, and `recordBoard2()` returned without
writing. The settling and the READING are now separate counts. Same class as the
two constants above: right for one plant, carried to another.
(ii) **THE CHAIN RINGS AND NOTHING ON THE TAB COULD TOUCH IT.** It now measures its
own mode from a deliberately UNSHAPED kick — the anti-slosh tab's argument, that
success at cancelling a resonance removes the evidence of it — and shapes with a
ZVD. Measured: **period 860 steps, ζ 0.251, 9 peaks**, and a periodogram of the
same decay says ONE mode: its only other peak is at 455, exactly half, i.e. the
second harmonic. So a single ZVD is right here and the anti-slosh tab's convolved
pair is not. A failed fit disables shaping rather than shaping at a guess — the
Move tab has an analytic fallback because it has ONE link and a closed form; a
two-link chain's tool mode is not that.
(iii) **MODE ④, THE LEARNED FILTER, on the chain.** Its reference deliberately does
not repeat and iterative refinement needs repetition, so the refinement runs with
the modulation OFF and the fitted filter is deployed with it ON. THAT IS NOT A
WORKAROUND, IT IS THE GENERALISATION TEST — and it is nearly free, measured: the
same filter scores 1.94× on an unmodulated move of the deployed span and 1.84× on
the modulated one, so the non-repeating reference costs 5%.
(iv) **AND THE SENSORS WERE BEING LOCKED TOO EARLY**, exactly as reported: 1000
pairs is about three move periods of a reference whose amplitude beats at the
golden ratio, so most of the amplitudes it will be asked about had not happened.
4000 now, the Move tab's number.
MEASURED IN THE BROWSER through the page's own auto-tune (residual tool error vs
the PROGRAM, rms, three move periods):
  no shaping, no correction     3.98e-1     (the machine before any of this)
  shaping only                  2.37e-1     1.68x
  + ② the rigid model           2.32e-1     1.02x on top — it removes a bias
  + ③ the closed loop           2.41e-1     1.00x on top — same, and it is a bias
  + ④ the learned filter        1.71e-1     **1.36x on top, 2.33x overall**
The bias column is the other half and it separates the mechanisms cleanly: ④ takes
the bias −7.16e-2 → −5.05e-3 (**14.2×**) AND the oscillation 2.26e-1 → 1.71e-1
(1.3×), while ② manages 1.2× on the bias and **1.0× on the oscillation**, which is
the quasi-static limit stated as a number rather than as a caveat.
**THE REFINEMENT'S GAIN HAD TO BE MEASURED ON THE CHAIN, AND THE SHAPER HALVES THE
STABILITY MARGIN.** Swept in Node against the chain plant, residual rms on the
hardest of the three training moves (span 0.5, 16–18 passes):
  UNSHAPED  lead 0 / 200 / 350 / 550 / 800 / 1100 → DIVERGES / 1.63 / 0.98 / 0.79 /
            1.53 / 2.18 — an INTERIOR optimum, so the lead is a real phase
            alignment and not a fudge factor
            gain 0.5 → 0.314   1.0 → 0.314   1.5 → 0.308   4.0 → DIVERGES
  SHAPED    gain 0.3 → 0.291   0.6 → **0.276**   1.0 → 0.290   1.5 → **DIVERGES**
THAT ARRIVED AS A FAILURE, WHICH IS THE PART WORTH KEEPING. Gain 1.5 was measured
on the unshaped plant; with shaping on, two of the three moves turned around after
pass 5 and climbed, and the filter fitted in good faith to a correction the
refinement had already ruined then scored **WORSE than doing nothing** (2.53e-1
against 2.45e-1). The cause is structural: the shaper delays the COMMAND but the
correction is added to the reference after it, so the phase between the correction
and the error it answers is not the one the lead was tuned against. 0.6 is stable
in BOTH configurations, which is what matters when shaping is a control the user
can toggle. And the refinement now **harvests its best pass rather than its last**
and stops after three passes without gain — a guard that costs nothing when the
gain is right, and the difference between a fit that is merely imperfect and one
that is confidently wrong.
**THE CEILING IS MEASURED TOO, so what is left is stated rather than implied.** A
repeatable shoulder pre-distortion converged as far as it will go leaves 1.55e-1
of 3.77e-1 at the shipped span — 2.43×, and the deployed filter reaches 1.71e-1,
so the FIT costs about 10% and the rest is the refinement's own limit. Neither
more capacity nor a better fit can pass it. The floor is also strongly
superlinear in span (5.6e-3 at 0.072, 7.8e-2 at 0.144, 3.1e-1 at 0.5), which is
why the three training moves BRACKET the shipped default instead of sitting on
one side of it.
**AND THE ELBOW'S MODULATION HAD THE SHOULDER'S OLD DERIVATIVE BUG.** The
inconsistent-derivative fix recorded above was applied to the shoulder and left
the elbow scaling θ, ω and α by the same m, so the elbow's commanded velocity was
not the derivative of its commanded position. One joint over, same defect, found
only because the reference had to be refactored to be readable at an arbitrary
step for the filter's window.

**BRICK 23 — ONE BUTTON, AND THE SENSOR IT LEFT BEHIND WAS WORSE THAN PREDICTING
THE MEAN.** Reported from the device with a screenshot: "all I did was launch the
app and hit the autotune. This performance is pretty bad." The panel read estimate
nRMSE **1.2247** against 1.4904 for "the tip is where the encoder says", and the
forecast 1.1936 against 1.5752 for persistence — a soft sensor carrying almost no
information. Reproduced first try, to the digit.
**THE MACHINE WAS FINE AND THE INSTRUMENT WAS NOT**, which is this project's oldest
pattern arriving in a new place: the same run's tool error was 2.489e-2 rms with ④
correctly selected, i.e. the correction was working exactly as measured. What was
broken was the readout of it.
**THE CAUSE IS THE SEQUENCE'S ORDER.** Auto-tune trained the soft sensor under ②,
then scored every correction, then selected ④. The correction PRE-DISTORTS the
setpoint, the ENCODER follows the pre-distorted setpoint, and the encoder is a model
INPUT — and the target is the tip error measured against that same encoder. So
changing the correction changes both the input distribution and the target. Measured
on ONE locked model, one plant, one stream, scored under each correction in turn:
  trained under ②   **0.0320**
  ① open loop         0.3779
  ③ closed loop       0.3152
  ④ learned filter    **1.2253**   — worse than predicting the mean
**A 38× SPREAD WITH THE WEIGHTS FROZEN.** This is the diverging-closed-loop finding
again — there the correction was the loop's own and a commissioning dither answered
it — except that here the operating point is moved by the SEQUENCE itself, so no
amount of dither sized for ③ could have covered it.
THE FIX IS THE ORDER: ①, ② and ④ need no sensor (it is a readout there), so they are
scored FIRST and the winner chosen; the sensor is then commissioned in that
configuration; and ③ — the one correction that IS the sensor — is scored afterwards
against the incumbent. One button, from launch, now measures **estimate 0.0307
against naive 1.5263 (50×) and forecast 0.0333 against persistence 0.5989 (18×)**,
with the machine's own rms unchanged at 2.489e-2. A 40× improvement in the readout
and nothing changed about the plant.
**AND FIXING THE ORDER EXPOSED THREE MORE, EACH INVISIBLE ON ITS OWN.**
(i) **THE COMMISSIONING DITHER WAS BEING SCORED AS PRODUCTION.** The dither
deliberately wobbles the correction so the model sees the operating points the loop
will occupy, which makes the machine measurably worse while it runs — and the
passive board recorder was writing that in as the correction's score. Measured: the
learned row went **2.49e-2 → 1.24e-1** during training, and auto-tune then read its
own table and picked the runner-up. It is the anti-slosh tab's rule exactly — a
health-check probe is the one move never scored as production — and it had to be
applied here too.
(ii) **THE DITHER WAS SIZED FROM THE CHANGEOVER TRANSIENT.** It is sized from the
error the machine has under the chosen correction, but the window had just been
cleared by the mode change, so it read **1.39e-1 on a machine whose settled error is
2.49e-2** and asked for a dither five times larger than it needed. Waiting for a
full window took the dither 1.35e-2 → 2.4e-3 rad and the estimate 0.0352 → 0.0301.
Read the meter after it settles: the third place on this tab that rule has applied.
ALSO CORRECTED: the dither is sized from the window's RMS rather than its BIAS,
because a working correction removes the bias — so sizing from the bias sizes the
dither from the thing that has just been fixed and gives ~0.
(iii) **`startCompare2` HARD-CODED `setCtl2Mode('open')`** instead of the sequence's
first mode. It was written when the sequence always began with the open loop, and it
went wrong the moment a partial compare did not: the chain's closed-loop pass ran all
thirteen of its move boundaries in OPEN loop, overwrote the open row with a
near-identical number, and left the table with no closed row — which reads as "the
closed loop was never scored" rather than as a fault.
**AND THE TEST GAP IS THE POINT.** Every sensor assertion in the suite ran BEFORE
auto-tune, so it measured 0.050 while a user pressing the one button and looking at
the same panel saw 1.22. The suite now scores the sensor AFTER auto-tune on both
tabs and asserts it was commissioned in the configuration that was selected — the
check whose absence is the whole reason this shipped.
Chain, same treatment, measured: open 2.25e-1 / ② 2.20e-1 / ④ **1.59e-1** / ③
2.21e-1, sensors commissioned under ④, whole-arm 0.1605 against naive 1.0240.

**BRICK 24 — THE JITTER WAS IN THE COMMAND, AND A JERK LIMIT IS FREE.** Reported
from the device: "the average of the auto-tune is centered but there is a high
frequency jitter in the controls. It needs to be as smooth as possible and keep the
average error tight."
**MEASURED FIRST, AND THE FIRST MEASUREMENT ELIMINATED THE OBVIOUS SUSPECT.** Sampling
the pre-distortion over a whole move period: mode ② roughness 6.95e-4 rad/step² and
mode ④ 7.03e-4 — IDENTICAL, so the learned filter is not what is rough. Reading the
traces straight off the Plotly div, second difference relative to each trace's own
spread: **commanded motor 0.297, actual motor 0.014, the reference itself 0.002.** The
command was ~20× rougher than anything the machine could follow.
**THE CAUSE IS THE MODEL'S OWN FORM.** `TipCompensator` is quasi-static, δ = L·c·τ, and
τ carries J·α — so the correction is proportional to the COMMANDED ACCELERATION, and a
trapezoid's acceleration is piecewise CONSTANT. The pre-distortion therefore STEPS
instantaneously at every corner of the profile, and the ZVD triples the number of
corners. That content is 500× faster than the servo's own time constant: nothing can
follow it, so it is a torque spike into the PD loop and nothing else.
**A JERK LIMIT IS A BOXCAR, WHICH IS THE SAME OBJECT AS AN INPUT SHAPER.** Convolving
the acceleration with a normalised boxcar of width W ramps it linearly over W, i.e.
limits the jerk to a_max/W — the anti-slosh tab's S-curve, expressed in the impulse-list
form `AngleProfile` already takes, so the two COMPOSE by convolution and unit-sum is
preserved. `boxcarShaper` and `convolveShapers` join the library; a wide list is
TABULATED over one period rather than summed per call (a jerk limit is hundreds of
impulses inside the solver's inner loop), and a check asserts the table IS the sum to
1e-15 rather than approximating it.
MEASURED IN NODE, mode ②, width → bias / oscillation / control second difference
relative to the control's own spread / move period:
  0     1.47e-4 / 5.31e-2 / 1.29e-1 / 4552
  30    1.47e-4 / 5.27e-2 / 4.41e-3 / 4612        30× smoother
  120   1.47e-4 / 5.08e-2 / 1.19e-3 / 4792       108× smoother  (shipped)
  300   1.37e-4 / 4.49e-2 / 7.17e-4 / 5152
  450   1.33e-4 / 3.98e-2 / 4.51e-4 / 5452       287× smoother
**THE BIAS DOES NOT MOVE, WHICH IT CANNOT**: a boxcar is a unit-sum convolution, so it
cannot change where a move ENDS — the same property the shaper relies on. And the
OSCILLATION improves monotonically, because a gentler acceleration excites the bending
mode less. Smoother AND tighter, which is rare enough to state.
THE PRICE IS CYCLE TIME, and only because a bug had to be fixed to charge it: the dwell
was sized for the SHAPER's delay alone, so a wide jerk limit ran the move past the start
of the next one (at 450 the move needs 1000 + 982 + 450 = 2432 steps against a half
period of 2276). Sized for both, the period grows with W — 5% at the shipped 120.
120 rather than 450 because past a couple of hundred steps the boxcar is a large
fraction of the 300-step acceleration and is really making the move gentler, which is
what the Move speed slider is for; keeping the two apart is this page's rule.
IN THE BROWSER, both tabs, one button: **control roughness 109× lower on the Move tab
and 107× on the chain**, with every score improving — Move board open 1.05e-1 → 1.03e-1,
② 5.30e-2 → 5.07e-2, ④ **2.49e-2 → 2.27e-2**; chain ④ **1.59e-1 → 1.17e-1 (1.36×)**. The
learned filter's weight norm fell 1.14 → 0.24, because the fit is far better conditioned
once its features are smooth.
**AND IT COST THE CHAIN'S ARCHITECTURE CLAIM, WHICH IS THE FINDING RATHER THAN A
CAVEAT.** Measured in Node, one script, one variable, both tool sensors on the same
stream at matched capacity — nRMSE and the absolute error behind it:
  jerk off   whole 0.0814 / elbow 0.1911  (2.35×)   absolute 4.09e-2 / 9.60e-2
  jerk 120   whole 0.1798 / elbow 0.1821  (1.01×)   absolute 8.54e-2 / 8.63e-2
The truth's own spread barely moves (5.03e-1 → 4.75e-1), so this is not a normalisation
artefact: the WHOLE-ARM model's absolute error DOUBLES while the elbow-only one slightly
improves. Its advantage lived in the shoulder's sharp acceleration steps — M₂₁·α₁ is the
one thing the elbow cannot see directly, and an unlimited trapezoid makes it a
distinctive high-frequency signal. Smooth the command and that channel carries much
less; widening the whole-arm window does not recover it (0.2314 at stride 5).
THE BROWSER SAYS IT MORE LOUDLY THAN NODE DOES — 1.67× the other way on one run against
Node's 1.01× tie — so the effect and the run-to-run spread are the same size, and the
smoke test asserts only what survives that: both architectures beat the naive view
comfortably. Asserting a direction there would be asserting noise. **A smoother machine
is a less observable one**, which is this project's oldest tension (an unshaped probe is
needed to see a resonance) arriving in the soft sensor rather than in the controller.
ALSO FIXED HERE, both tabs: a change of move now discards the LEARNED FILTER as well as
recommissioning the sensor — it is a map from the commanded trajectory to a correction,
so a different trajectory is a different map — and the learning profiles carry the SAME
shaper and jerk limit the deployed move does, for the same reason the sensor is
commissioned under the correction that will run.

**BRICK 25 — THE DRIVE GETS A RATING, AND THE PICTURE GETS A BOUND.** Reported from
the device: "the actual motor position has to be speed, accel and torque limited to
match a real world scenario. Real motors can't react like it can now" and "the
deflection view slider makes this look worse than it is — it amplifies the error but
also the noise."
**THE TWO ARE SEPARATE, AND MEASURING SAID SO BEFORE ANY CODE CHANGED.** The tip
error's spectrum has peaks at 1638 / 910 / 546 / 431 steps and **0.1% of its power
below a 120-step period** — so at 60 steps per frame the picture is NOT aliasing
physics, and the drawn tool jumping 26% of its own range every frame is real motion.
The slider makes it look worse; it does not make it be worse.
**ONE CURVE GIVES ALL THREE MOTOR LIMITS.** `driveEnvelope()` is the classic
torque-speed characteristic — peak torque at standstill falling linearly to zero at the
no-load speed — which yields the TORQUE limit directly, the ACCELERATION limit for free
(α_max = τ_avail·N/J_reflected) and the SPEED limit as the point where nothing is left
to overcome the load. Three limits from one curve rather than three clamps that could
disagree. Braking keeps the full ceiling, because back-EMF opposes the supply only when
the motor already turns the way it is pushed, and a drive that could not STOP a fast
motor is the opposite of a limit — asserted, since that is the plausible wrong version.
**THE RATING IS QUOTED AS A MULTIPLE OF THE HOLD TORQUE**, which is how a servo is
actually sized, and computed from the plant so the same "32×" means different
newton-metres as the E and K sliders move. Measured at the shipped move, which demands
3.7× the hold torque (rating → % of steps saturated / bias / rms):
  ideal  0.0% / 1.43e-4 / 5.078e-2      16×  0.1% / 1.43e-4 / 5.078e-2
    8×   1.1% / 1.43e-4 / 5.078e-2       6×  1.9% / 1.43e-4 / 5.078e-2
    4×   3.3% / 1.44e-4 / 5.078e-2       3× 12.2% / −4.27e-2 / 6.846e-2
    2×  28.6% / −2.36e-1 / 2.803e-1
and at the most aggressive corner of the two ladders (span 0.8 at 4.6×, demanding 78×):
ideal 8.515e-1 rms, 78× → 4.5% saturated and 8.252e-1, 32× → 15.8% and 1.744e+0,
16× → 26.4% and 3.646e+0.
**32× SHIPS**, which is a real machine's sizing: the duty it is built for never notices
(0.1% of steps, score unchanged to four figures) and several times that duty makes it
lag, exactly as a real one does. In the browser, the shipped move saturates 0.0% at 32×
and 65.5% at 2×, where the rms goes 5.07e-2 → 7.40e-1. A rating tight enough to bite on
the DEFAULT move would be a machine that cannot do its own default move.
AND THE HONEST HALF: **at the shipped settings the limit changes nothing**, because the
shipped move is well inside the drive. It is a fidelity fix and a control that can be
made to bite, not a cure for the picture.
**I SIZED THE NO-LOAD SPEED FROM THE OUTPUT SPEED AND APPLIED IT TO THE MOTOR**, the
factor of N that `driveEnvelope`'s own comment warns about. The drive then saturated
60% of the time on the SHIPPED move and the rms went to 2.0 — a "limit" that made the
machine unusable, which read as the mechanism being wrong when the mechanism was right
and the number was a hundred times too small. Third time this project has recorded that
the instrument was wrong before the model was.
**THE PICTURE'S FIX IS A BOUND, NOT A FILTER.** Hiding the motion would be hiding
physics, so the stage now draws the SWEEP over the same window the bias and oscillation
are computed on — a translucent band at the tool with a tick where it settles — and
states the magnification in real terms ("×30 · tool error 0.164% of the arm") rather
than as a bare number. The line still shows where the tool is NOW; the band says how far
it goes and the tick says where it sits. A regression asserts the arm drawn now lies
INSIDE the band drawn around it, which is the only way to catch a picture that is
lying about its own claim.

**BRICK 26 — THE BLACK BOX: A CONTROLLER GIVEN NOTHING, AND THE PRICE OF THAT,
MEASURED.** Asked directly: the library's promise is to walk up to any dynamical
system, route signals into the blocks, press one button and get estimation, forecasting
and control without modelling information — how does FlexiSim compare, and if the
answer changes too much, build a tab that actually does it.
**THE AUDIT FIRST, BECAUSE THE ANSWER WAS NOT FLATTERING.** Of the Move tab's control
path: `PositionServo`'s gains and feedforward are the reflected inertia, the gravity
torque and the ratio, all CAD; `TipCompensator` is given the structure δ = L·c·τ plus
L, J and τ_g, with only `c` identified; `ilcRefine` is given the arm length and a
hand-tuned phase lead; only the ZVD's ω and ζ are measured, and only `TipSensor` is
genuinely model-free. **The estimation half already was the workflow; the control half
was not.**
`lib/blackbox/` is the control half done properly, and it is its own directory so the
boundary is visible — nothing in it imports anything from `lib/flexisim/`, so it cannot
learn about an arm by accident. **What it is given: a scalar command it can read at any
step, a scalar correction it can add, an array of signals whose meaning it never learns,
and a tracker during commissioning only.** No units, no geometry, no sign convention,
no resonance, not even that the machine is a robot.
**IT DETERMINES ITS OWN TIMESCALE**, which is what makes the rest automatic: hold, wait
until the machine is QUIET (detected from the signal, not counted), one step, wait until
it is quiet again, and read the settling time and DC gain off the record. The
identification grid, the probe's bandwidth, the impulse-response length and the
inverse's target width all follow from that one number, so a plant settling in 300 steps
and one settling in 6000 are both sized correctly with neither mentioned.
**THREE IDENTIFIED OBJECTS, ONE JOINT SOLVE:** `h`, the impulse response from correction
to truth (which replaces the arm length, the sign convention, the servo lead and the
bending mode); `ê`, a map from a window of the command to the truth; and `q`, the
regularised FIR inverse of h. h and ê are estimated TOGETHER, because the truth during a
probe is the probe's response plus the trajectory's own disturbance and on a real machine
the second is much the larger — deconvolving the probe alone reported a gain of **−13.7
where the truth is +15.5**, right magnitude and WRONG SIGN, with a "resonance" of 30
steps against a real 980.
MEASURED ON THE ARM, told nothing: settling **1750 steps**, DC gain **14.28 against an
arm length of 15.5**, impulse ringing **960 steps against a real bending mode of ~980**.
**PORTABILITY IS THE CLAIM, SO IT IS CHECKED THE ONLY WAY IT CAN BE**: the identical
module, unchanged apart from a sample rate, against three plants that share no physics —
a lightly damped actuator; an over-damped process with a **NEGATIVE gain two hundred
times smaller** and no ringing, whose disturbance is driven by the command's value
rather than its curvature; and the real hybrid arm. **0.98× / 2.19× / 1.15×**, gains
identified rather than given, spanning 200× and both signs. If a plant constant had
leaked in, exactly one of them would work.
**AND IT PREDICTS WHAT IT WILL ACHIEVE BEFORE IT DEPLOYS ANYTHING.** The only free
parameter after identification is how much of the plant the inverse may claim, and that
cannot be a constant — it depends on where the disturbance sits relative to where the
plant can be trusted. Both objects needed to answer it are already identified, so the
search costs no plant time: run the designed loop against the MEASURED disturbance on
HELD-OUT samples and read off the residual, then pick the scalar 0..1 the same way.
THAT IS HOW PLANT A BECOMES A PASS RATHER THAN A FAILURE: its disturbance sits ON its
own lightly damped resonance, so nothing helps — the design predicts 1.1×, the scalar
comes back at 0.21, and the machine is left alone (0.98×). Chosen IN-sample instead it
predicted **73× on a plant where it went on to achieve 2.8×**, and on plant A it took
the machine to **0.58×, actively worse, with complete confidence.**
**TWO BUGS OF MINE ARE WORTH RECORDING.** (i) The correction's convolution ran
BACKWARDS — (q*e)(k) needs ê(k + (centre−j)·grid) and I indexed (j−centre). Identification
was excellent throughout (plant B's DC gain came back at −6.000e-2 against a true −0.06)
and the correction made all three plants WORSE. A correct inverse convolved the wrong
way is a plausible filter answering the wrong question, and no closed-loop score can
tell it from a bad inverse — which is why `firInverse` is now checked against its own
convolution. (ii) The step test measured the gravity sag settling in rather than its own
step, because it stepped before the machine was quiet.
**DOES IT KNOW IT IS AN ARM? NO — AND THE ONE ASSUMPTION IT DOES MAKE IS STATED.** The
PLANT path is treated as LTI: h, q and the correction are all linear. The DISTURBANCE
map is not — it uses the library's universal basis (bias + linear + cross-quadratics +
ReLU + Fourier), because backlash, stiction and a hardening spring make the disturbance
a nonlinear function of the command. Measured, linear window against universal map: the
correction is unchanged (1.17× vs 1.15×, inside the run spread) while the IDENTIFICATION
improves a lot — the ringing comes back at 960 steps rather than 400, the delay at 650
rather than 2450. **What limits the arm is the linear inverse, not the disturbance
model**, and the design's own prediction says so before the plant is touched.
**THE PRICE OF KNOWING NOTHING, ON THIS PLANT: about 4×.** Tab ① reaches 4.6× with the
CAD in hand; the black box reaches 1.07× on the page and 1.15× in Node. The gap is not
evenly split: the SOFT SENSOR half is already model-free on both and scores the same
(nRMSE ~0.06 from five unlabelled signals), while the CONTROL half pays for everything —
tab ① is handed a compliance model whose STRUCTURE is correct and converges its filter
over twelve repetitions of a trajectory it is allowed to assume repeats; this identifies
an LTI inverse from one probe and deploys it one-shot. The page's predicted 1.06× against
its achieved 1.07× is the part that matters: it is not wrong about itself.

**BRICK 27 — THE NONLINEAR IDENTIFICATION QUESTION, ANSWERED NEGATIVELY, AND THE BUG IT
UNCOVERED.** Asked to investigate the nonlinear generalisation of linear transfer-
function identification — Hammerstein/Wiener if that is it, otherwise the best candidate
for automated nonlinear model identification. The answer for this plant is that it needs
none of them, and finding that out found the real defect.
**THE PROBE HAD TO CHANGE BEFORE THE QUESTION COULD BE ASKED.** A binary PRBS visits
exactly TWO amplitudes, so a static input nonlinearity is UNIDENTIFIABLE from it — any f
agreeing at ±a fits the record identically. Whatever the answer, a multi-level sequence
is a precondition.
**AND THE FIRST EXPERIMENT HAD NO RESOLUTION**, which the numbers said before any
conclusion was drawn: fitting each candidate jointly with the disturbance and comparing
held-out residuals gave the SAME value to four digits at 3% and at 12% probe amplitude,
which is impossible if the probe is what is being measured. The residual was dominated
by the disturbance model's error. Running the identical trajectory TWICE, once with the
probe and once without, and DIFFERENCING removes the disturbance exactly — the plant is
deterministic, so whatever the trajectory does happens in both runs.
MEASURED THAT WAY, on the real arm: the probe response departs from **exact linear
scaling by 0.04%** over a 4× amplitude range (0.00% on a control plant that is linear by
construction), and an LTI model explains **99.03%** of it. Every nonlinear structure is
WORSE out of sample:
  LTI                          resid 3.500e-3   explains 99.03%   1.000×
  Hammerstein poly-3           3.949e-3         98.77%            0.886×
  Hammerstein deadzone basis   3.739e-3         98.90%            0.936×
  LPV on commanded velocity    3.727e-3         98.90%            0.939×
  LPV on direction (backlash)  3.573e-3         98.99%            0.980×
  both                         3.994e-3         98.74%            0.876×
— the same pattern the linear control plant shows, which is what says the comparison has
teeth rather than just counting parameters. **Hammerstein, Wiener and LPV all buy
nothing here.** (Wiener was not fitted: it is not linear in the parameters, so it needs
iteration, and there was nothing left for it to explain. Volterra is linear in the
parameters but has no clean FIR inverse, which is the whole requirement. A neural NARX
is not one-shot invertible.)
**SO WHERE WAS THE 4×? IN A UNITS BUG OF MINE, AND EVERY SYMPTOM POINTED ELSEWHERE.**
The disturbance map explained only 49–50% of the disturbance out of sample, which caps
ANY inverse at 1.4× — and the module honestly predicted 1.4× and honestly achieved 1.07×,
with an excellent identification and a prediction that matched the outcome. Nothing
looked broken. It looked exactly like the price of knowing nothing, and the previous
entry said so.
WHAT FOUND IT WAS ASKING A DIFFERENT QUESTION: a crude **96-bin phase-indexed average
explained 100.0%** of the same disturbance. That proves the disturbance is perfectly
predictable, so the map was FAILING rather than the problem being hard. The map's taps
were sized in identification-GRID samples and then used as solver STEPS — `features()`
adds them straight to k — so its window spanned **70 steps instead of 2800**, a fiftieth
of the move it was meant to explain. With the taps in steps the same map explains
**100.0%** too.
**PLANT C: 1.15× → 3.85×.** Against tab ①'s 4.6× with the full CAD, the price of knowing
nothing about this plant is about **20%**, not the factor of four previously recorded.
Plants A and B are unchanged (0.98× and 2.19×) — their disturbances are simple functions
of the command, so the narrow window was already enough, which is why two of the three
plants could not have revealed it either.
THE GENERAL LESSON IS THE OLD ONE IN A NEW COSTUME: **a wrong unit is not a modelling
limit**, and a module that is honest about its own performance will report a wrong unit
as a limit with complete confidence. What separated them was a second, cruder instrument
that did not share the mistake. Also worth keeping: the soft sensor's nRMSE went 0.058 →
0.180 across this fix, which is the NORMALISATION artefact and not a regression — the
absolute estimate error improved 1.20e-2 → 9.7e-3 while the truth it is divided by got
four times smaller.

**THE BLACK BOX TAB STROBED, AND THE TAB'S LOGIC WAS FINE.** Reported from the device
as the UI "strobing and switching state and generally freaking out". Measured by
sampling every watched element's bounding box once per animation frame: **every element
on the tab moved 30–39 times in four seconds**, i.e. about eight times a second, in
every phase including idle.
THE CAUSE WAS ONE MISSING CSS SELECTOR. `#bb-chart` was not in the rule that gives every
other Plotly container `height:170px`, so its height came from its CONTENT — which
Plotly is creating. Plotly rendered at its own default, the container grew to match,
`responsive:true` saw a resize and re-rendered, and the two chased each other. Adding
the id to the existing rule took the geometry churn to **0**.
AND THE BADGE WAS UNREADABLE FOR A SECOND REASON: its text carries a per-sample counter
and it was written every frame, so it changed on **234 of 235 consecutive frames**. It
is now written on the stats cadence — the button states still sync every frame, because
those must be right the instant something is tapped, while a label that lags an eighth
of a second does not.
**THE REGRESSION READS THE IDS OUT OF THE PAGE'S OWN `Plotly.newPlot` CALLS** rather
than listing them, so the next chart added to any tab is covered without anyone
remembering. This is a whole class of defect the suite could not see: the page had no
errors, every functional check passed, and the numbers were all correct — what was
wrong was that nothing would hold still to be read.

**BRICK 28 — IT HAS TO RUN ON A PLC, AND THE MOVE DOES NOT REPEAT. FIVE THINGS BROKE,
AND THE ONE I WAS SUREST OF WAS THE ONE THAT WAS WRONG.** Asked to use the identified
model PREDICTIVELY — pre-actuate, track during the move, spend less control effort —
and then, mid-work, to make the whole thing fit a **B&R APC4100 at 5% of a 1 ms cycle**
while **assuming the motion does not repeat**. Final numbers, one module, three plants
that share no physics: **A 1.22× · B 2.86× · C 3.92×**, against 1.15× / ~1.8× / 2.8×
before, at **979–1208 multiply-accumulates per update out of a 2500 budget — 39–48% of
5% of a 1 ms cycle**. Almost none of that came from better optimisation.

**THE PERIODIC SOLVER WAS BUILT, MEASURED AT 6.9×, AND DELETED.** Solving the whole
trajectory at once as a circulant system is exact for all time and costs nothing at run
time — and it is worth nothing the moment the program stops repeating. Worse, a period
detector run on a repeating TEST command would have selected it and shipped a table
that is wrong in production. It is replaced by an **optimal preview FIR** answering the
same objective, min ‖Hu+d‖² + λ‖Du‖², with the taps applied to the command's look-ahead
instead of to a phase index: no period anywhere in it, `taps` multiply-accumulates per
sample, and free to pre-actuate because taps before the centre multiply the FUTURE.
THE ORIENTATION IS PINNED AGAINST A PLANT WHOSE ANSWER IS EXACT — a pure delay of D
grid samples and gain g must produce exactly one nonzero tap, at j = centre − D with
value −1/g — because this project has already shipped a correction convolved the wrong
way round once, and no closed-loop score can tell a filter that looks forward from one
that looks backward.

**THE REPEATING COMMAND WAS HIDING CATASTROPHIC OVER-FITTING, AND IT HAD ALREADY
SHIPPED.** The disturbance map is 735 features fitted on ~900 rows. On the repeating
command it scored beautifully out of sample — because every held-out sample of a
repeating command is a near-replica of a training one. On an APERIODIC command the same
map scores **R² = −6.93** out of sample against the plain linear window's **+0.88**.
Brick 16 learned this on a different plant and had a golden-ratio modulation built for
it; it had to be learned again here, so the test commands and the page's own demo are
now modulated at an incommensurate rate rather than left to be discovered a third time.
The basis is now CHOSEN, on held-out data, under the cycle budget: rank the full
universal map's features by the weight the fit gave them, refit on the top K, keep the
cheapest candidate within 5% of the best. The plain linear window is a point in that
same search (keeping indices [0..nBase] IS the linear window), not a separate path.

**THE JOINT IDENTIFICATION WAS WRONG AND ONLY A CLOSED-LOOP MEASUREMENT COULD SHOW IT.**
Brick 26 identified the plant and the disturbance in ONE solve while the machine ran its
program, and the argument was good: the PRBS is uncorrelated with the command, so the
blocks are nearly orthogonal, it removes a phase, and it fixed a real failure. Its
impulse response has the RIGHT DC GAIN — 14.8 against the step test's 14.3, which is the
cross-check that was passing — and the WRONG SHAPE: delay 30 grid samples against 11.
The instrument that separates them is to run the same command twice, bare and corrected,
because the DIFFERENCE of the two error records IS the plant's response to the
correction. Against that, the joint fit explains the response at **gain 0.10, correlation
0.33**; a probe taken while the machine was HELD explains it at **0.57 and 0.75**.
The consequence was a design that could not know it was wrong: the scorer convolves each
candidate with the same h it was designed from, so the design and its prediction agree
with each other and disagree with the machine — **PREDICTED 1.81×, ACHIEVED 1.13×**.
Split into "identify the plant while HELD, the disturbance while RUNNING" the same
search **predicts 2.39× and achieves 2.84×**, and a prediction that is EXCEEDED is the
signature worth trusting, since nothing in the design can flatter a number the machine
goes on to beat. The failure the joint fit existed to prevent cannot occur here: it came
from the trajectory's disturbance dominating the record, and a held machine has no
trajectory. The price is that commissioning holds the machine for the probe as well as
the step test, which is what a commissioning routine does.

**CENTRE BOTH RECORDS OR NEITHER — MY OWN LINE, AND IT COST A THIRD OF THE GAIN.**
Removing the mean from the OUTPUT alone tells the fit that a constant input produces no
output, which is false for any plant with a DC gain, and it biases the recovered
response down by exactly the probe's DC content. Against a synthetic whose answer is
known: true 16.286, centre-the-output-only **10.927 (33% low)**, centre both 16.282,
centre neither 16.286. It surfaced as all three plants under-recovering their gain by
the same 0.61–0.70 factor while every other number looked right — **a common factor
across plants that share no physics is a property of the code, not of any plant**, and
that is what made it findable at all.

**DEPLOY IT AND MEASURE IT, BECAUSE A PREDICTION COMPUTED FROM THE MODEL CANNOT CHECK
THE MODEL.** A `verify` phase now applies the correction and scores it against the map's
own prediction of what the error would have been — window-matched, needing no second
baseline run, and biased AGAINST accepting since the map understates the disturbance by
its fit error. On plant A that reads **9.68× predicted against 1.05× measured** and it
is not even a wrong model there (R² 1.000) — the plant is lightly damped with its
resonance near the identification grid and nothing at that sample rate inverts it.
THE SEARCH GOES BOTH WAYS, and the upward half is not symmetry for its own sake: on the
over-damped plant the design predicted 1.19× and the machine returned **1.57×**, so a
rule that could only back off would have left that on the table. It tries ×1, ×2, ×0.5,
keeps the measured best, and deploys NOTHING if none of them beats doing nothing.

**THE KNEE BAND HAS TO BE ON THE IMPROVEMENT, NOT ON THE RESIDUAL.** "Within 5% of the
best residual, take the cheapest" is scale-wrong: where the best feasible design only
improves the residual by 2%, a 5% band on the RESIDUAL reaches past doing nothing, so
the zero filter falls inside it and wins on effort, being free. Measured: under a tight
cap the search returned the zero filter and reported 1.00× — not because nothing was
feasible, but because the rule could not tell "cheap and nearly as good" from "cheap and
useless".

**AND THE THING I WAS SUREST OF WAS WRONG.** The best design wants a peak correction of
**twice the command's own swing**, which reads as a linear model being extrapolated far
outside anything the probe visited, so a cap was added and a robustness argument was
ready for it: a high-gain inversion has no margin. Commissioned on the nominal arm and
run on arms with a 25% softer gearbox, a 25% softer link, and both:
  cap 0.25 (24% of the swing)   1.20× · 1.21× · 1.25× · 1.26×
  cap 0.50 (50%)                1.42× · 1.43× · 1.53× · 1.53×
  cap 1.00 (98%)                1.62× · 1.62× · 1.66× · 1.65×
  cap 2.00 (166%)               2.70× · 2.74× · 2.73× · 2.68×
**FLAT ACROSS THE DRIFT AT EVERY SIZE**, with the drive's own saturation counter reading
**0.0% of steps at every one of them**. The cap stays — this drive was sized with 32×
the gravity hold torque and a real axis is not, and a limit is what lets the module
refuse to demand the impossible rather than discover it — but the DEFAULT is generous
because the measurement says so, not because bigger scored better. What generalises past
this plant is not the number but the verify phase.

**WHAT THIS IS, IN THE NAMES THE THEORY USES**, since the question was asked directly.
For a general nonlinear plant, HAMILTON–JACOBI–BELLMAN is a PDE over the whole state
space and is not going anywhere near a 1 ms task; for the model this module can actually
identify — linear, quadratic cost — HJB collapses to the Riccati equation, and
min ‖Hu+d‖² + λ‖Du‖² solved offline over a preview window IS that solution written in
lifted form. So the preview filter is not an alternative to HJB, it is HJB's answer
precomputed, which is why the run time is a dot product. PONTRYAGIN gives the same
answer unconstrained, and says something DIFFERENT only under hard limits, where the
optimum is not the clipped linear law — the honest name for what ships here is a
penalty-method approximation of that (λ raised until the cap is met), and the exact
version is a QP, PLC-able as explicit MPC. The LAGRANGIAN/energy framing is where the
original intuition lives: "move away first to build an inertial wave" is **stable
inversion of a non-minimum-phase plant**, whose bounded inverse is non-causal with a
pre-actuation transient — the filter's future taps, learned rather than derived.
Energy-shaping proper (passivity-based, IDA-PBC) needs a Hamiltonian structure, which is
exactly the prior knowledge this module is not allowed.
**BUT THE ORDERING IS THE POINT: 1.13× → 2.84× CAME ENTIRELY FROM FIXING THE
IDENTIFICATION, WITH THE OPTIMISER UNCHANGED.** A better optimality principle on a wrong
model buys nothing, and every one of the five defects above was a modelling or
measurement defect rather than a control-theoretic one.

**BRICK 29 — THE CONSTRAINED OPTIMUM, AND THE ROUND THAT DECIDES HAD TO MOVE ONTO THE
MACHINE.** Brick 28 closed by naming the constrained design as the open step, on the
grounds that Pontryagin says the optimum under an active limit is not the clipped or
detuned unconstrained one. It is built (`lib/blackbox/qp.js`), it is worth what the
theory says where the limit binds, it is worth LESS THAN NOTHING where it does not —
and finding that out cost the module its offline decision rule. Final, three plants
that share no physics: **A 1.17× · B 3.59× · C 4.30×**, against 1.22 / 2.86 / 3.92
before.

**WHAT IT IS.** A box-constrained QP over a receding horizon of the command's own
look-ahead, `min ‖d + Tu‖² + λ‖Du‖²` s.t. `|u_i| ≤ U`, solved by accelerated projected
gradient with a FIXED iteration count. Fixed, because an interior-point or active-set
solver has data-dependent run time and a cyclic task can only be given a number known
before it runs. The projection is a clamp, so there is no factorisation, no active-set
bookkeeping and no matrix inverse anywhere in it.
**AND IT COSTS ONE MAP PREDICTION PER UPDATE, exactly like the filter it competes
with** — the horizon of predicted disturbance is a ring with one new entry at the far
end, not `horizon` fresh evaluations. Getting that wrong would multiply the map's cost
by the horizon and put the whole thing outside any cycle budget.

**THE SOLVER IS CHECKED AGAINST THE PROBLEM, NOT AGAINST A CLOSED-LOOP SCORE**, because
a subtly wrong solver produces a plausible command and no score can attribute the
shortfall. The adjoint identity `⟨Tx,y⟩ = ⟨x,Tᵀy⟩` holds to 1e-12 (this project shipped
a convolution the wrong way round once already); with the box wide open it reaches the
exact unconstrained solution; at a binding box it satisfies KKT to **2.6e-16** with 17
of 24 variables ON the bound; it never leaves the box; and against a constant
disturbance it settles on the exact DC inverse.
**THE CLAIM THE OBJECT EXISTS FOR, IN ONE NUMBER: the constrained optimum beats the
clipped unconstrained one by 1.26× in objective.** If it did not, this file could be a
clamp on the filter's output and none of the rest would be needed.

**MEASURED ON THE ARM**, improvement against no correction — the detuned filter (one
gain, effort weight raised until its peak meets the limit), the loose filter hard
CLIPPED at the same limit, and the constrained solve:
  limit 0.10 of the command's swing   1.09× · 1.07× · **1.21×**
  limit 0.25                          1.18× · 1.19× · **1.50×**
  limit 0.50                          1.41× · 1.43× · **1.95×**
  limit 1.00                          1.74× · 1.91× · **2.56×**
  limit 2.00                          2.74× · **2.95×** · 2.81×
The constrained one's peak sits exactly ON the limit in every row with 0% of samples
over it, which is the half a filter cannot promise at all — a filter meets a peak limit
by being detuned EVERYWHERE, and does not actually guarantee it on a stretch of command
it was not designed against.
**AND THE LAST ROW REVERSES, WHICH IS THE HONEST HALF.** At a limit that does not bind
there is nothing to be constrained about, and the fixed iteration count makes the solve
approximate where the filter is exact, so it loses by ~5%. It is not a better design,
it is a design for a different situation.

**THE WARM START MAKES IT NEARLY FREE, AND THAT IS THE MEASUREMENT THAT MAKES IT
DEPLOYABLE.** Between updates the horizon shifts by exactly one sample, so the previous
solution shifted along is already very nearly right. At limit 0.25:
  1 iteration   1.443×    2896 MAC/update      58 MAC/cycle spread
  2             1.467×    5072               101
  4             1.484×    9424               188
  8             1.495×   18128               363
 12             1.500×   26832               537
**ONE ITERATION REACHES 96% OF WHAT TWELVE DO.** So the iteration count is a CANDIDATE
rather than a ceiling to be filled: the budget says what is affordable and the search
says what is worth buying, and the module takes the cheapest within 5% of the best.
Spending the rest of the budget to chase the last 4% would be eighteen times the
arithmetic for it.
SLICING IS ALLOWED AND THE PRICE IS STATED: the answer is for a moment a whole horizon
of look-ahead away, so the work can be spread across the interval between updates
rather than landing in one cycle — at the cost of ONE more grid sample of preview,
since it must be finished before the update it belongs to rather than during it.
`sliceBudget: false` forbids it.

**THE DRIVE RATING IS THE CORRECTION LIMIT, AND THE HOST ALREADY HAS IT.** The
correction is added to a setpoint and the loop turns that into effort, so on a position
loop the limit is `tauMax/kp` — both nameplate numbers, not plant knowledge being
slipped in. Measured on the arm: the shipped 32×-hold drive can follow a setpoint
offset of **5.0× the whole command swing**, which is why nothing ever saturated and why
the limit never bound; a realistically rated 3–6× drive lands at **0.47–0.94** of the
swing, squarely in the range where the constrained design was worth 1.38–1.47×.

**AND THEN THE OFFLINE ROUND PICKED THE WRONG ONE — IN BOTH DIRECTIONS, WHICH IS THE
FINDING.** Every candidate is scored by convolving it with the identified plant, and
that plant is LINEAR, so the score cannot see the ACTUATOR saturating and cannot see
what a hard limit is worth either.
OVER-RATED IT on a 3×-rated drive, where the constrained solve won the offline round
and then measured **1.65× against the filter's 1.81×, with the drive limited on 29.5%
of steps against 19.9%** — it pushes right up to its limit, which looks free in a
linear score and is not.
AND UNDER-RATED IT ON THE ARM, where the constrained design's own open-loop prediction
is **2.33× against the filter's 2.80×** — the offline round ranks it SECOND — and the
machine then measures it at **4.24×, achieving 4.30×**. Same on the over-damped plant:
predicted 1.34×, measured 3.62×.
A criterion that is wrong in one direction can be corrected with a margin. One that is
wrong in both cannot, and no amount of held-out data fixes it, because the held-out
data is scored through the same linear model.
**SO THE VERIFY PHASE STOPPED BEING A CHECK ON ONE DESIGN AND BECAME THE ROUND THAT
DECIDES.** It already had the machinery — it was running a scale ladder on the machine
— and the generalisation is to put the runner-up FAMILY on the ladder too: filter ×1,
×2, ×0.5, then constrained ×1, ×0.5, each measured over its own window, and the best
MEASURED one deployed. On the 3× drive it now picks the filter and returns the filter's
1.81× and 19.9%; on plants B and C it picks the constrained solve and beats the filter
by 1.26× and 1.10× respectively.
MEASURED ACROSS THE DRIVE LADDER afterwards, forcing the filter against letting the
machine choose — achieved / peak as a fraction of the limit / % of steps the drive was
limited on:
  3× rated   filter only 1.81× · 0.89 · 19.9%    it chose 1.81× · 0.89 · 19.9%
  6×         filter only 1.78× · 0.78 · 16.2%    it chose 1.78× · 0.78 · 16.2%
  32×        filter only 2.95× · 0.41 ·  0.0%    it chose 2.95× · 0.41 ·  0.0%
Identical in every row: where the constrained solve is the wrong answer the machine
says so and it is not deployed, at no cost.
AND ONE THING THAT TABLE EXPOSES AND THIS DOES NOT FIX: at 6× the filter reaches only
0.78 of its limit and the drive is STILL limited on 16% of steps, because `tauMax/kp`
is the offset a drive can hold STATICALLY and the trajectory is already using part of
the actuator. The correction's real share is what is LEFT after the move, which the
host could compute from its own feedforward and does not. Not built, and named rather
than approximated.
A CONSTRAINED DESIGN IS MADE GENTLER BY LOWERING ITS LIMIT, NOT BY SCALING ITS OUTPUT:
multiplying the answer of a solve by a half gives a command that is no longer the
optimum of anything and throws away the one property it was bought for.
**THIS IS THE THIRD TIME IN TWO BRICKS THAT A NUMBER COMPUTED FROM THE MODEL HAS BEEN
WRONG ABOUT THE MODEL** — the joint fit's impulse response, the design's own predicted
ratio, and now the ranking between two families. Each time the fix was the same shape:
put the question to the machine.

**AND THE PICTURE WENT WRONG THE MOMENT THE CORRECTION GOT BIG, which nothing in the
suite could see.** The stage magnifies deviations ×30 because the elastic deflection is
well under a percent of the arm — and the CORRECTION is not a deviation, it is a
deliberate commanded angle that the constrained design drives all the way to its limit,
up to 20% of the move. Through a ×30 magnifier that is an arm bent through several
radians, drawn off the canvas entirely. No error, nothing blank, every functional check
green, and the numbers all correct: the drawing was lying about a machine that was
working.
AND THE FIRST FIX WAS WRONG IN THE OTHER DIRECTION, which is the part worth keeping.
Re-basing the tool on the ENCODER magnifies the wind-up — and the correction works by
winding the gearbox up DELIBERATELY, so that gap is large by design and the arm went
off the bottom of the stage instead of the side. WHICH FRAME EACH LINE IS DRAWN IN IS
THE WHOLE STORY: the command and the encoder are meant to be somewhere else and are
drawn at TRUE scale; the tool is the thing that lands on the program anyway and its
miss is under a percent of the arm, so it is magnified against the PROGRAM. The
regression now asserts the tool is drawn INSIDE the stage rather than that the stage is
painted — a check on presence cannot see a defect in geometry, which this project
learned on the console's Close button and had to learn again here.

**AND A FLAKY CHECK ON A DIFFERENT TAB TURNED OUT TO BE A REAL DEFECT.** The chain's
`auto-tune measures the bending mode from an unshaped kick` failed on one run and
passed on the next with the SAME code: period 834 with 9 usable half-cycles one time,
858 with 3 the other. The fit was right both times — what varied was how much decay it
had to fit. The chain's commissioning settled for a FIXED 4000 steps before kicking, so
it began from wherever the arm happened to be when the button was pressed, and the
decay carried whatever residual motion was already there on top of the kick's own. It
now waits until the arm is QUIET, detected from the signal with a bounded fallback,
which is the discipline the black box's own step test has had from the start. A check
that fails intermittently for a reason unrelated to what it checks is worth more as a
bug report than as a red line, and this project's rule is that it gets fixed rather
than tolerated, because a red suite hides the next real failure.

WHAT SHIPS WHERE: plant A keeps the filter (its limit never binds and its plant cannot
be inverted at that sample rate anyway); plant B and the arm take the constrained solve.
The arm's deployed controller is 6592 MAC/update — **132 MAC/cycle spread over the 50
cycles between updates, 5.3% of the 2500-MAC budget**, which is 5% of a 1 ms cycle.

**BRICK 30 — THE CORRECTION GETS 80% OF WHAT IS LEFT, AND THE JERK LIMIT IS A CONTROL
BECAUSE THE TWO MECHANISMS TRADE.** Asked for the limits to be 80% of the motor's actual
limit, and for a jerk-limit filter so the difference between a bare trapezoid and
properly jerk-limited motion can be seen.

**80% OF WHAT IS LEFT, NOT 80% OF THE DRIVE**, and that closes the item brick 29 left
open. `tauMax/kp` is the setpoint offset a drive could follow if it had nothing else to
do, and it never has nothing else to do — the trajectory's own feedforward is already
spending part of the actuator. Handing the black box the whole rating over-states its
share, which this page had already measured rather than argued: at a 6× rating the
correction reached only 0.78 of the limit it was given and the drive was STILL limited
on 16% of steps. The host now computes the peak feedforward over one period of the
command it is about to hand over, and the correction gets **80% of the residual**. At
the shipped settings the move asks for 34% of the drive, so the correction is capped at
0.8 × 66% of it — and both bounds still apply, the sanity cap on the command's own swing
and this one, with the smaller winning. It is the HOST's arithmetic, not the module's:
the black box is handed a number and never learns where it came from.

**THE JERK LIMIT IS A BOXCAR CONVOLVED INTO THE ACCELERATION**, i.e. the same object as
an input shaper, so it composes with one — and changing it THROWS THE COMMISSIONING
AWAY, because the disturbance map is a fit from the command window to what the machine
does and a different jerk limit is a different command. The ladder runs 0 (a bare
trapezoid) to 1800 steps, six times the acceleration phase.

**AND SWEEPING IT SHOWS TWO MECHANISMS PULLING IN OPPOSITE DIRECTIONS, WITH THE BEST
TOTAL IN THE MIDDLE.** Measured, drive 32×, the same aperiodic command, the controller
never told the jerk limit exists — what the move asks of the drive / error with no
correction / error corrected / the controller's own factor / which design the machine
picked:
  jerk    0    34%   2.155e-1 → 5.123e-2   4.21×   constrained
  jerk   60    34%   2.147e-1 → 5.082e-2   4.22×   constrained
  jerk  120    34%   2.122e-1 → 4.972e-2   4.27×   constrained
  jerk  240    34%   2.047e-1 → 3.830e-2   5.34×   constrained
  jerk  450    24%   1.690e-1 → 2.439e-2   6.93×   constrained
  jerk  900    13%   1.077e-1 → 1.417e-2   **7.60×**  residual
  jerk 1800     8%   8.092e-2 → 4.557e-2   1.78×   residual
THE PROFILE AND THE CONTROLLER BOTH IMPROVE, UP TO A POINT. From 0 to 900 the bare error
halves (the profile is doing it) AND the controller's factor rises from 4.21× to 7.60×
(the residual is more predictable), so the corrected error falls **3.6×** — the two are
complementary rather than competing, which was not obvious in advance.
**AND AT 1800 IT REVERSES.** The bare error is the lowest on the table, 8.09e-2, and the
controller manages only 1.78× of it, so the CORRECTED error is three times worse than at
900. Past that point the profile has removed the very transient the controller was
predicting, and what is left is friction and backlash at the reversals, which no map
from the command window can see. The best total is at 900, in the middle, which is the
whole reason this is a slider rather than a constant.
**AND ON AN UNDERSIZED DRIVE THE JERK LIMIT IS WORTH MORE THAN ANY CONTROLLER HERE.**
The same ladder at a 4× rating — what the move asks of the drive / the correction's
limit / bare / corrected / factor / how often the drive was limited:
  jerk    0   **272%**  none   5.597e-1 → 2.479e-1  2.26×  **31.1%**
  jerk  120     271%    none   4.984e-1 → 2.296e-1  2.17×    29.9%
  jerk  450     188%    none   3.219e-1 → 1.433e-1  2.25×    18.6%
  jerk 1800    **67%**  2.4e-2 8.092e-2 → 4.557e-2  1.78×   **0.0%**
The move goes from demanding nearly THREE TIMES the drive to two thirds of it, the
saturation from a third of all steps to none, and the bare error falls **6.9×** — which
is what jerk limiting is for on a real machine, and it dwarfs everything the controller
does. Note the drive rating is quoted in multiples of the gravity HOLD torque, and this
move is inertia-dominated, so "4× hold" is nowhere near enough for a bare trapezoid.

**AND THAT TABLE REVERSED A DECISION I HAD ALREADY MADE.** With the peak demand above
the rating the residual headroom is negative, so the 80% rule returns zero, and I had
the module refuse: nothing left to correct with, said out loud. The first three rows
above were measured with a bug that ignored the zero — and they show the correction
was worth **2.26×** anyway, on a loop saturating 31% of the time. THE PEAK IS A WORST
CASE: the drive has headroom most of the time, and when the worst case has already gone
negative the bound carries no information rather than carrying the value zero. Refusing
on it would have been exactly the open-loop reasoning brick 29 showed to be unreliable
— and the instrument that disagreed was the verify round, the one thing here that can
see a saturating actuator at all. So where the headroom is negative the drive-derived
limit is WITHDRAWN, the sanity cap governs, and the machine decides.
The library keeps the stricter fix regardless: **zero is a limit, not an absence.** The
sentinel for "no limit supplied" was 0, which is also the honest answer when the
trajectory uses the whole actuator, so a host that meant "nothing left" was being read
as meaning "unlimited" — the exact opposite. It is `null` now, and a supplied 0 means 0.

**AND THE DESIGN THE MACHINE CHOOSES CHANGES ALONG THE WAY, unforced.** Up to 450 it
picks the constrained solve; from 900 it goes back to the plain filter — because a
smoother command needs a smaller correction, so the limit stops binding, and brick 29
measured that where the limit does not bind the constrained solve is the worse of the
two. Nobody told it to switch; it is the verify round ranking them on the machine.

**BRICK 31 — THE LOCK IS THE LAST STEP NOW, ON ALL THREE TABS, AND ON ONE OF THEM IT
DID NOT EXIST.** Reported from the device after testing all three: the auto-tunes could
leave the soft sensor training until everything else is finished and lock it last. They
could, and doing it exposed something worse on the black box.

**THE OLD ORDER LOCKED IN THE MIDDLE.** Both the Move and Chain sequences ran
`… pick the best → train the sensor → LOCK → score the closed loop → select the best`,
so the sensor sat idle through the last two steps — time it could have been learning —
and the lock, the one decision on those tabs that cannot be revisited without the
tracker coming back, happened before the sequence had finished deciding anything. Worse:
when the selection landed on the closed loop, the sensor had been locked under a
DIFFERENT correction, which is exactly brick 23's defect surviving in the one case that
reordering was supposed to fix.

**WHAT BLOCKED THE OBVIOUS FIX WAS A GOOD REASON, AND IT NEEDED SPLITTING RATHER THAN
OVERRULING.** The closed loop was gated on the sensor being LOCKED, and the stated
reason is sound: an RLS fit handed the truth every sample tracks it far better than the
frozen weights that actually ship, so a score taken while it adapts flatters the loop.
But that reason is about the SCORE, and it was being enforced at the CONTROL gate —
which is what forced the lock to happen early. The two are now separated: whether the
loop may RUN on a model is a question about the model's quality (`ssReady()`: enough
pairs), and whether a NUMBER may be written down is a question about whether the tracker
is correcting it at that moment (`recordBoard()` refuses to record any row while the
sensor is adapting — the stronger form of the dither rule it already had).
With that split the sequence can HOLD the sensor — pause adaptation, which is reversible
— score the closed loop honestly against frozen weights, choose a winner, and only then
train again.

**THE NEW ORDER**, both tabs: `… pick the best → train the sensor (with the dither) →
score the closed loop (held) → select the best → TOP UP under whatever won, no dither →
lock`. The top-up has no dither because the deployed correction is the operating point
now, so the machine is already showing the model where it lives.
MEASURED END TO END on the Move tab: the sensor locks at step `lock it` after **6001
pairs against 4000 before**, under the correction that was actually selected, and the
board is byte-identical to the old order (open 1.03e-1 / ff 5.07e-2 / learned 2.27e-2 /
closed 8.15e-2) — so the reordering bought the sensor half as much training again and
changed none of the machine's own scores, which is the signature that it moved when the
lock happens and nothing else.

**AND A VISUALISATION BUG OF MINE MADE THE SAME TAB'S SENSOR LOOK USELESS.** Reported
from the device: the black box's estimate looks really bad on the 2D stage, "there is no
way that is how bad it is." There was not — the model scores nRMSE ~0.06 and the ring
was being drawn EIGHT ARM-LENGTHS from the tool.
THE CAUSE IS A FRAME I ASSUMED INSTEAD OF CHECKING. This module's truth is
`tipTrackingError(arm, ref)` — the tool against the PROGRAM — so `bb.est` already IS the
deviation the tool marker shows, and the two should be drawn from one expression. I
carried over the Move tab's convention, where `TipSensor`'s target genuinely is measured
against the ENCODER, and added the encoder's own offset on top; the constrained
correction then drives that offset to a fifth of the move, magnified ×30.
**THE CHART HAD IT RIGHT THE WHOLE TIME**, plotting the same two numbers on top of each
other — and two views of one quantity cannot disagree, which is what says the stage was
the wrong one rather than the model. The regression now measures the SEPARATION between
the two drawn markers as a fraction of the drawn arm: 0.4% after the fix, and it is a
statement about the picture that no functional check can make.

**AND THE BLACK BOX NEVER LOCKED AT ALL, WHICH CONTRADICTED ITS OWN FIRST PARAGRAPH.**
That tab's whole premise is stated at the top of it: a tracker **during commissioning
only**. The page passed the truth in on every sample and never called `lock()`, so the
sensor trained for as long as the page was left open and the estimate on screen was
being corrected by an instrument the machine would not have. It now trains through every
phase the module needs — the probe, the observation, the verify round — and a further
4000 pairs of the DEPLOYED correction, and then locks. That last count is taken FROM THE
MOMENT the correction starts running, which had to be measured into shape: a plain total
is already at 26000 pairs by the time commissioning ends, so it was met the instant
`correct` was reached and the last phase bought nothing. That is the same rule as the
other two tabs and it is the tab's own claim, finally true.

**BRICK 32 — THE CORRECTION WAS A STAIRCASE, AND EVERY SCORE ON THE PAGE WAS BLIND TO
IT.** Reported from the device: measure performance on accuracy tip-to-target AND on
minimum, smooth motor effort, because "the black box solution is jerky and looks bad but
maybe scores well currently." It did score well and it was jerky, and the two facts had
the same cause.
**MEASURED BEFORE ANYTHING CHANGED** — second difference of each signal over its own
spread, at the SOLVER's rate, on the shipped arm:
  no correction   tracking 1.722e-1 · cmd 4.87e-6 · enc 4.66e-6 · torque 7.52e-4
  corrected       tracking 4.678e-2 · cmd 3.09e-2 · enc 3.87e-6 · torque 3.99e-2
The commanded motor position was **6354× rougher than the bare reference** and the drive
torque **53× rougher**, for 3.68× of tracking. **AND THE ENCODER CAME OUT SMOOTHER THAN
WITH NO CORRECTION AT ALL**, which is the number that says what was happening: the servo
could not follow any of it, so every bit of that roughness was torque the drive spent
moving nothing.
**THE CAUSE IS THE HOLD, AND IT IS FREE TO FIX.** The correction is designed on a grid of
50 solver steps and was HELD between updates, so a zero-order hold put a discontinuity
into the setpoint 20 times a move. Linear interpolation is the right reconstruction and
costs NO LAG — it passes exactly through the designed samples, and a zero-order hold is
the one carrying the half-sample lag. It needs the NEXT value at the start of each
interval and both designs already have it: the receding-horizon solve plans the whole
horizon and applies one element (`PreviewMPC.next()`), and the preview filter is simply
evaluated one grid sample ahead — the same single dot product it already ran.
  cmd 3.09e-2 → 1.06e-3 (**28×**) · torque 3.99e-2 → 1.89e-3 (**21×**)
  and the TRACKING IMPROVED, 3.68× → 5.23×
**A SMOOTHER RECONSTRUCTION WAS TRIED AND IS WORSE.** t → t²(3−2t) passes through the
same samples with zero slope at each, so it looked like the next step; measured, it made
BOTH numbers worse (cmd 1.06e-3 → 1.13e-3, torque 1.89e-3 → 1.99e-3) at identical
tracking, because zero slope at every knot is the stair's dwell coming back in a smooth
costume. The straight line between samples is the reconstruction of a band-limited
signal and nothing gentler than it is closer.
**ACROSS THE THREE PLANTS THAT SHARE NO PHYSICS: A 1.17× → 1.75× · B 3.59× → 7.71× ·
C 4.30× → 6.13×.** Plant A is the one where "nothing helps" because its disturbance sits
on its own lightly damped resonance — and a staircase 20 times a move was exciting
exactly that, so removing it is worth 50% there.
**THE OPEN-LOOP PREDICTION IS NOW CONSERVATIVE BY CONSTRUCTION, and a check had to move
because of it.** `h` is identified from a probe HELD for a whole grid interval and the
correction is deployed interpolated — a difference that lives entirely BETWEEN grid
samples, so the grid-rate model the design scores itself with cannot see it at all.
Predicted 2.33× against 6.13× achieved. The two-sided check on plant C is now the
MEASURED number against the achieved one (the convention plants A and B already used),
plus a ONE-SIDED assertion that the prediction never flatters the design — optimism is
the direction that is a defect, since that is where a design and its own prediction
agree with each other and disagree with the machine.
**AND THE SELECTION NOW ASKS BOTH HALVES OF THE QUESTION, ON ALL THREE TABS.** Tracking
alone has no opinion about a command, so the verify ladder was free to return the
twitchiest design on it. Each trial now measures the SLEW and the CURVATURE of its own
correction on the machine, normalised by the command's swing, and the rule is the same
KNEE the rest of the module uses: **among the trials within 5% of the best MEASURED
tracking, the smoothest.** The Move and Chain boards get a `control d²` column and
`bestScored()` applies the identical band. A weighted sum of two incommensurable
quantities is a preference dressed as a result; "as accurate as the best, and the
gentlest of those" is a statement anyone can check.
**THE EFFORT WEIGHT SPANNED THREE DECADES AND MOVED NOTHING**, which is what the
frontier report exposed. `boxQP` minimises ‖Hu+d‖² + λ‖Du‖² with λ RAW, and sum(h²) is
7.28 here, so the shipped ladder 1e-1 / 1e-2 / 1e-3 returned residuals identical to four
figures and efforts identical to three — three copies of one design, and nothing
downstream could tell. Normalising by sum(h²) makes λ = 1 mean "a unit of command
movement is worth a unit of tracking error" and the ladder bites on any plant.
**AND SCALING IT EXPOSED A SECOND DEFECT UNDERNEATH.** Every λ at one (horizon, iters)
costs exactly the same MAC, so "cheapest within the band" is a tie across the whole
ladder and a plain reduce kept whichever the loop reached first. Once λ could bite, that
accident selected a candidate **1.5% worse offline and 36% worse ON THE MACHINE (6.98×
against 4.48×)**. Fixed by breaking the MAC tie on residual.
**THE GENTLE END OF THE BAND GOES TO THE MACHINE RATHER THAN BEING CHOSEN OFFLINE**, and
the first attempt at choosing it offline is why. Taking the gentlest candidate within the
same 5% band cost 17% of measured tracking and bought 2% of measured roughness — because
the offline scorer's `effort` is the FIRST difference of u, and once the correction is a
ramp rather than a stair what the drive feels is its CURVATURE. So `mpc-gentle` is now
its own rung on the verify ladder, and it is a DIFFERENT rung from `×0.5`: that one
lowers the LIMIT, making the correction smaller, and this one raises the effort weight,
making it SMOOTHER. Measured on the arm the machine declines it — 5.98× against 6.99× for
8% less curvature, outside the band — which is the honest answer and not a wasted rung.
**SETTLING TIME IS A CONTROL NOW, ON ALL THREE TABS, AND IT IS QUOTED IN RINGS.** The
dwell already covered the shaper's and the jerk limit's delays, which is the minimum that
stops one move running into the next; `Settle` is added on top and is what lets the
MACHINE come to rest. In periods of the measured mode rather than in steps, because the
Move tab's bending period spans 900 to 2800 across the stiffness ladder and a dwell in
steps means something different at each — and the readout states the DECAY rather than
the count (at the measured ζ 0.236, one ring is "to 22%"), since that is the thing being
asked for. On the black box tab it is the HOST's number, sized from the CAD bending
period, and the module is told neither it nor the period; a longer dwell is simply a
different command, so it throws the commissioning away exactly as the jerk limit does.

**AND THE SETTLE CONTROL IMMEDIATELY FOUND A REAL DEFECT IN THE CHAIN'S TOOL SENSOR —
v222's FIX, NEVER APPLIED HERE.** With a real dwell the whole-arm model scored nRMSE
**0.6438 against a naive 1.0415**, i.e. barely better than assuming the tool is where the
encoders say. The chain's bending mode is ~860 steps and the shipped window reached
3 lags × stride 2 × 10 = **40 steps of it, 4.6% of one cycle**, so the phase of a free
vibration was outside what the model could see even in principle. It scored well only
because every move ran into the next and there was never a stretch of ringing with no
input; a settling dwell created 34% of samples with both joints parked, and it collapsed.
MEASURED, one plant, one stream per row — whole-arm nRMSE, and the parked stretch alone:
  reach   features            dwell 1911            dwell 900
   40 st  universal 544   1.2367 (parked 2.33)   0.1418
   40 st  linear     31   0.3859 (parked 0.43)   0.1193
  900 st  linear     61   0.1445 (parked 0.17)   0.0464
  880 st  linear    121   0.1131 (parked 0.15)   0.0335
 1020 st  linear    181   **0.0532 (parked 0.07)**  **0.0234**
**WORSE THAN PREDICTING THE MEAN before, 23× better with the window right** — and LINEAR
beats the 544-feature universal map at every window and at a third of the cost, which is
v222's finding reproduced: once the model can see the phase it does not need a rich basis
to guess it. On the page the locked whole-arm readout goes **0.0689 → 0.0234**.
THE OBVIOUS FIX WAS THE WRONG ONE, AGAIN. The Move tab's v222 entry credits the motor
REACTION torque — the one measured quantity that survives being parked — so that was
built first and measured: it made the whole-arm model **WORSE (1.2367 → 1.6973)** while
the window was still short, and helped the elbow-only one only slightly. It ships opt-in
and off. A signal cannot substitute for a window that cannot reach the period.

**AND IT RESOLVED A MYSTERY BRICK 17 HAD RECORDED AS UNEXPLAINED.** That entry reported
that with the elbow commanded to HOLD the whole-arm model LOSES (0.562 against 0.494),
said plainly that it had no clean mechanism, and recorded two falsified hypotheses. Both
were tested at a window that reached 4.6% of the ring. At a window that spans a full
period the whole-arm model wins that regime too — **0.0371 against 0.2051, 5.5×, a
LARGER margin than with both joints moving** — which is what the physics predicted from
the start: the elbow cannot see M₂₁·α₁ directly and that term is 14× the one it can.
**AND THE REVERSAL WAS NEVER A STABLE PROPERTY.** Re-measuring the old pair does not
reproduce its ordering either. It was two numbers a few percent apart taken from models
that could see almost none of the period they were being asked about — a difference
measured with a broken instrument, recorded as a finding. What IS stable is that the
window is worth 8× to the whole-arm model there. The headline numbers move with it:
whole arm **0.0689 → 0.0146**, forecast **0.1707 → 0.0700** against persistence 0.84.

NOT YET BUILT: the WGSL elastic kernel (see the measurement above); general
block-sparse bricks for a CLOSED structure — a gantry or a machine frame, where
members are not separable into per-link frames and the swept box is genuinely
the geometry.

The second regime on the same lattice engine: a 2–3 joint arm whose TOOL TIP
is measured by a laser tracker during dynamic moves (ground truth), while the
model reads only MOTOR-SIDE signals — torque, position, following error.
**THE UNOBSERVABILITY IS PHYSICAL, NOT CONSTRUCTED:** the encoder sits on the
motor side of the gearbox, reading θ_motor/N, and is structurally blind to
everything downstream of the gear teeth — lost motion, joint wind-up, link
bending. Position and following error both look perfect while the tip is a
millimetre out. That is why robot accuracy and repeatability are different
numbers, and it is a far better version of the argument FlowSim's soft sensor
makes on a dye field.
**THE PLANT IS HYBRID, AND SAYING SO IS THE HONEST PART.** Joint compliance —
gearbox torsional stiffness, bearing compliance, harmonic-drive lost motion —
is commonly cited at 70–90% of tip deflection on an industrial arm, so a
beautifully resolved voxel link would be resolving the SMALL term. Joints are
therefore LUMPED nonlinear elements (progressive stiffness, backlash, Stribeck
friction, ratio N, motor inertia — the same shapes the NGRC soft-sensor plant
already carries) and LINKS are the lattice, which is what buys the distributed
behaviour a beam element cannot give: real mode shapes, stiffness that depends
on where the load sits, lightening holes, non-prismatic castings, inter-link
coupling. The split is to be MEASURED (each term's contribution to tip
deflection) and the link resolution chosen from that measurement.
**A SERIAL CHAIN DOES NOT NEED A SPARSE LATTICE, IT NEEDS ONE LATTICE PER LINK.**
Estimated at dx 8 mm (~10 cells through an 80 mm section), three links of
0.6/0.5/0.3 m: the links are ~22k cells but their swept bounding box is ~2.3M,
a fill fraction near 1%. At ~104 B/cell (3 velocity + 6 stress, f32,
double-buffered) that is **~240 MiB dense against ~2.3 MiB** — dense is not
merely wasteful, it is past the 128 MiB storage-binding limit that has already
bitten this project twice, so `build()` would refuse. Each link is a rigid-body
transform of its own geometry, so each gets its own SMALL DENSE lattice in its
own body frame with the joint rotation carried as a transform: ~100× the memory
win with none of an index list's indirection, and the coalescing that
structure-of-arrays exists for is preserved exactly. General block-sparse bricks
(allocate only the 8³ bricks containing material) remain the right answer for a
CLOSED structure — a gantry, a machine frame — where members are not separable.
Not built.
**THE PRICE OF THE BODY FRAMES IS THAT THE DYNAMICS GET SUBTLE.** Large rotation
with small strain needs a CO-ROTATIONAL formulation or a link that merely swings
develops spurious stress; and a body frame on a moving link is NON-INERTIAL, so
the fictitious forces — centrifugal, Coriolis, Euler, and the frame's own linear
acceleration — must be added or the dynamics are quietly wrong. They are local
per-cell body forces, structurally identical to gravity, so they are cheap; what
they are not is optional, and a missing term yields a plausible wrong answer
rather than an error.
**INERTIA AND GRAVITY ARE BOTH REQUIRED, FOR DIFFERENT REASONS.** Gravity is the
dominant static load and is what makes compliance POSE-DEPENDENT — joint wind-up
τ_g(pose)/K_θ varies across the workspace, and without it the arm is perfect
everywhere. Inertia is the whole reason the test is a DYNAMIC move: acceleration
→ joint torque → wind-up → tip error, the link's own modes rung by the same
acceleration, reflected motor inertia N²J_m (which dominates link inertia at
high ratio), and Coriolis coupling so a fast joint-1 move loads joint 2. That
coupling is precisely what a per-joint model cannot see and a learner reading
every motor signal can. Gravity is a body force ρg in the momentum update —
structurally the Guo forcing term the LBM operator already carries — and the
gravitational torque on each joint comes out of the lattice's OWN mass
distribution rather than being a separate parameter, so it stays consistent by
construction.
**PLANNED VERIFICATION, ALL CLOSED FORM:** cantilever tip deflection FL³/3EI per
link in its body frame at second-order convergence; the clamped–free first
bending frequency (1.875)²√(EI/ρAL⁴); **rigid-body rotation ⇒ IDENTICALLY ZERO
stress**, at machine precision, which is what guards the co-rotational
formulation; **a link spinning at constant ω ⇒ exactly the rotating-bar stress
σ(r) = ½ρω²(L²−r²)**, which is what guards the fictitious forces — between them
those two pin the whole non-inertial machinery; links made rigid (E→∞) ⇒ tip
deflection exactly τ/K_θ × lever arm, which SEPARATES the joint contribution
from the link contribution so the 70–90% claim above is measured rather than
inherited; reflected inertia N²J_m against the analytic two-mass-with-gearbox
free response; and hysteresis loop area = energy dissipated per cycle.
**PLASTIC DEFORMATION IS DEFERRED TO ITS OWN APPLICATION** and costs this tab
nothing, because the property it was wanted for arrives anyway: a harmonic drive
has a documented HYSTERESIS loop, so the same torque gives different wind-up
depending on which way you came from. Path dependence therefore lives in the
gearbox, where it has to be modelled regardless — and it carries the same
falsifiable claim yield was going to carry, that a MEMORYLESS estimator is
provably insufficient and a lag window recovers it. Gearbox scope is stiffness +
friction + backlash first, with hysteresis added DELIBERATELY as its own step so
it is measured on its own rather than arriving mixed in with three other
nonlinearities.
**THE LASER TRACKER IS A COMMISSIONING INSTRUMENT, NOT A PRODUCTION ONE**, which
is exactly the lifecycle FlowSim's soft sensor already implements — train
against truth, lock, run without it. So `idle → calibrating → training →
estimating/locked`, the frozen standardisation, the rolling recalibration and
the `__fsSSdbg()`-style diagnostics transplant rather than get rebuilt. Starts
PLANAR (2–3 joints in a plane) with the operator kept 3D-capable: planar makes
both the verification and the picture far easier and loses almost nothing about
compliance.

---

## BRICK 33 — SEVEN REVIEWS, AND THE WORST DEFECT WAS IN THE INSTRUMENTS

Seven parallel reviews of the whole app — controls theory, the drawing maths, the
auto-tune state machines, UI, code quality, performance, and one challenging the
assumptions. What they found was not a list of small bugs: it was that several of the
NUMBERS THIS FILE QUOTES were measured with broken instruments.

**THE FLAGSHIP TEST DROVE THE MACHINE WITH A DIFFERENT COMMAND FROM THE ONE IT TOLD THE
MODULE.** `blackbox.test.mjs` built a golden-ratio-modulated `ref` for the black box and
then drove the servo from the UNMODULATED `prof.at(k)`, and scored against it. So the
executed command repeated exactly and the anti-overfit protection — the whole reason for
the modulation, brick 16's lesson — was NOT ACTIVE on the one plant with a real
disturbance. Telling the module a command wrong by ±35% costs 0.7%; making the EXECUTED
command genuinely non-repeating costs **28%**, and plant C's headline fell 6.13× → 4.43×.
That asymmetry is itself the finding: the map was recovering PHASE, not the command.

**THE VERIFY ROUND INHERITED THE MAP'S BIAS EXACTLY.** Each rung is scored as the measured
error against the MAP'S OWN prediction of what it would have been — so an over-stating map
makes the correction wrong by a factor AND the reported ratio wrong by the same factor in
the same direction. Two wrongs that agree, the failure brick 28 fixed for `h` and left
standing here. Six repeats of one rung span 1.5%, so the round is PRECISE — and it sat 37%
above what the machine achieved on an aperiodic command and 0% above on a periodic one,
i.e. the bias appears exactly where the map generalises worse. A **ZERO RUNG** measures
that bias directly (with the correction off, the same ratio IS the bias) and every other
rung is divided by it. Verified against achieved went **5.78/4.43 → 5.04/5.19 on the arm,
6.74/6.79 on plant B** — and it doubles as the do-nothing reference the ladder never had.

**`_isQuiet` COULD NOT DETECT QUIET ON ANY NOISY MACHINE, AND THEN MY FIX COULD NOT DETECT
MOTION.** `spanSeen` was measured against `y0`, which is only assigned when the first wait
ENDS, so throughout it the scale was 1e-300 and "quiet" meant bit-exactly constant:
measured, the hold went 62k → **1 262 000 solver steps** at 1e-9 noise, twenty minutes at
a 1 ms cycle, reported as normal progress. Seeding the scale fixed that and introduced the
opposite defect — a per-sample RATE test called a first-order settle quiet at step 3350
with **40% of the travel still to come**, because a slow approach has a small rate. It is
a TRAVEL test now: the reading has not moved by more than a tolerance of the span over a
whole window. Terminates at ~12 800 steps across six decades of noise, with 1.4% left.
Both halves are asserted, which is what caught the second defect.

**A REPRODUCIBLE CRASH BEHIND A COMMENT THAT SAID THE OPPOSITE.** `_design` said
"width 0 is the do-nothing end of the family, always feasible". `firInverse` with width ≤ 0
sets `d[c] = 1` — a pure DELTA target, the most aggressive member, largest `umax`. So every
candidate can fail the cap, `best` stays null, and the design throws. Reproduced at a
correction limit of 1e-8, and reachable in production because the host derives that limit
from whatever the drive has spare. A genuinely feasible zero filter is added explicitly,
and a design that deploys nothing now reports `none` rather than `residual` with zero taps.

**THE CHAIN'S TOOL ERROR WAS WRONG BY 1.44x AND MISSING ITS LARGEST TERM.** `tipError()`
is a sum of first-order perturbations projected onto one direction, and three of the four
terms were not projected: `tilt1` used `toolRadius()`, the MAGNITUDE of the shoulder-to-
tool vector rather than `L1 cos q2 + L2`; `bend1` was added unprojected though it is
transverse to link ONE; and link 1's TIP SLOPE — which rotates the whole forearm — was
absent entirely while a comment claimed it was "reported separately". Measured at the
shipped pose: −7.18e-2 against a correct −1.03e-1, and the omitted slope term alone is
**2.9× the sum of both gearbox wind-ups**. The lever error changes SIGN at a folded pose,
where the projection is −4.00 and the distance +4.00.
IT WAS NOT A REPORTING ERROR. This is `ChainSensor`'s training target and the basis of
`toolTrackingError`, so the chain's tool sensor was estimating a quantity that is not the
tool's error, and mode ③ was driving it. `toolLever()` is now one expression used by the
error, the page, the servo, the ILC and the dither. `armnr.js` had the identical
construction for N links and is corrected the same way.
**AND IT OVERTURNED A DEPLOYMENT CONCLUSION.** This file recorded "if you can only
instrument one axis, instrument the SHOULDER", measured at 0.0250 against 0.0334. Against
the corrected target the two measure **0.0323 and 0.0307 — a tie**, because once the
target is dominated by link 1's bending slope both joints see it: the shoulder through its
own torque, the elbow through the reaction its servo is fighting. What survives is the
claim the tab exists for — reading both axes beats reading either, by 1.9×.

**AND THE CHECK THAT SHOULD HAVE CAUGHT IT WAS VACUOUS.** `lastGeom2` reported
`mag * tipError().total` against `tipError().total`, so its ratio was identically `mag`
whatever the drawing did — the instrument was comparing a quantity with itself. It is
measured off the canvas now, and the sweep band, which was drawn **9.5× too short**
(win2 holds a LENGTH and it was being divided by L2) and anchored on the machine rather
than on the program, is fixed with it.

**THREE SEQUENCES THAT COULD NOT FAIL, ONLY LOOP.** Every auto-tune step has the shape
"if the result exists move on, else start the sub-task" — and a sub-task that FAILS clears
both its handle and its result, so the next tick starts it again for ever. On the chain
that is reachable and was unguarded: the bending-mode fit has no analytic fallback by
design, so a failed `ringFit` settled, kicked and re-fitted indefinitely with Run disabled
and Stop the only exit. A started-once flag is the whole fix. `stopAuto` also now unwinds
what the sequence turned on — it used to leave a commissioning dither running permanently
with the board frozen, because no row may be written while the sensor adapts. The seam to
force the failure has existed all along and no check ever used it; one does now.

**HALF OF EVERY CHART WAS OFF-SCREEN.** All six Plotly containers were created BEFORE
being made visible, so Plotly sized against `display:none`, fell back to its 700px default
inside a 388px box, and with `body{overflow-x:hidden}` the right 45% was invisible AND
unreachable. It corrected itself only if the user left the tab and came back. Measured
388/700; now 388/388 on all six, with the page's own horizontal overflow asserted.

**AND ONE DEFECT I SHIPPED AN HOUR EARLIER.** The smoothness tie-break recorded `rough: 0`
both for the open loop (never measured) and for mode ③ (a constant over a move period, so
its spread is zero) — and zero is the minimum, so either could win the tie-break without
having been measured, and auto-tune could deploy NO correction at all. FlowSim's residual
rule, broken in a second place within the same day it was quoted.

Also: `try/finally` on every rebuild (a throw left the tab permanently dead with the
rejection invisible); the frame throttle advances for every tab rather than only inside
the Move branch; the Move tab's ILC gets the chain's harvest-best and rise-stop guards,
the deployed dwell, and the HOME pose it is deployed at; the page's hints are generated
from `AUTO_STEPS` so they cannot describe a superseded order again; and the lock finally
has a `Reset sensor ↺` the stats row had been telling users to press for weeks.

**STILL OPEN, and named rather than quietly dropped:** the black box's plant carries no
friction, backlash or stiffening, so "the plant path is LTI and the disturbance is
nonlinear" is validated on a plant where both halves are linear — and with Stribeck
friction at 9% of hold torque the module correctly measures 0.91× and ships nothing, which
means the 4.4× is a linear-plant result. There is also no feedback anywhere in the control
path: the locked soft sensor's estimate drives nothing, so any disturbance not a function
of the command window is invisible and, after the lock, undetectable.

---

## Brick 33 — CONTOURING, and every point-to-point metric on the project stops applying

Asked, plainly: *the arms will be used in CNC pathing; the current step-move testing should
never be relevant; keep to path as accurately as possible at all times, and minimise motor
energy and direction change.* That is not a longer version of the existing question, it is
a different one, and almost every control and metric on the page answers the wrong half of
it.

**AN INPUT SHAPER IS THE MOVE TAB'S BEST CONTROL AND IS A DEFECT HERE.** It works by
delaying the command; at the end of a move a delay costs nothing, and along a path a delay
is a contour error everywhere. Same for the settle dwell, which is the Chain tab's most
valuable control and is meaningless on a machine that never settles. And a tracking rms
sums two things that are not comparable failures:

- **contour error** — normal to the path. The part is the wrong shape and no amount of
  time fixes it.
- **lag** — along the path. The tool is on the right curve, just late. The part is
  correct; the cycle is slower.

`lib/flexisim/contour.js` measures them separately and deliberately does not penalise the
second. It also reports energy as TWO numbers, `∫τ²` (copper loss, what heats the motor)
and `∫|τω|` (mechanical work, what the wall pays for), because a move can be cheap in one
and dear in the other — and the measurement below shows they disagree about the answer.

### The reversal counter measured arithmetic before it measured anything physical

A direction change costs something because the gear teeth change faces and stiction
re-breaks. Counting SIGN CHANGES of joint velocity counts neither: a joint dwelling near
zero crosses it on rounding alone — measured, **994 against one physical reversal**. A
speed deadband relative to a running peak is worse, because the peak is meaningless until
it has been seen, so a run that dwells before it moves is counted against a threshold near
zero (970 against 1). It is now a zigzag filter on integrated TRAVEL with the threshold
set to the joint's own lost motion.

### Three wrong feedrate profiles, all of which looked right

`lib/flexisim/toolpath.js` is arc-length parameterised with the standard corner rule and a
look-ahead. Getting the acceleration limit right took three attempts:

1. Estimating the available tangential acceleration from the SOURCE speed lets a step into
   an arc spend the whole budget tangentially and then arrive needing it all
   centripetally — measured, exactly **√2 over the limit**, while every scalar check
   passed (the speed was exactly √(ar) and the ramp exactly a).
2. Estimating it from the LARGER of the two speeds collapses instead: where the ceiling
   already sits at √(ar) the centripetal term is the whole budget, so the backward pass
   propagates the end-of-path zero along the arc — the profile **stopped 1.9 units short
   of the end of its own path**.
3. The constraint has a closed form. `v_i² ≤ v_j² + 2·ds·√(a² − (v_i²κ)²)` squares to one
   quadratic in `v_i²`; its larger root is the answer and it collapses to the ordinary
   pass at κ = 0.

Also: **the sampling resolution has to come from the FEEDRATE, not the path length.** At
one sample per unit of arc the corner arcs got two samples each, so the curvature ceiling
was evaluated almost nowhere and the arcs ran at 1.6× the centripetal limit. And the
reported tangential acceleration was a finite difference times the speed at the END of the
interval, which is exactly 2a wherever the speed doubles across one sample — i.e. the
first interval of every path that starts from rest.

### A closed path is not an open path with the ends joined

Three separate defects, each of which puts a self-inflicted transient into a program that
should be perfectly smooth: a **zero-length closing segment** (a degenerate line has no
tangent, so the corner rule reads the seam as a right-angle turn and stops the machine);
**unwrapped forward/backward passes** (v[0] and v[N] disagree, so the feedrate steps once
per lap); and **wrapping the clock by the CEILING of the lap time** rather than by the real
number, which inserts a fraction of a step of dwell at the seam.

### THE DOMINANT ERROR IS NOT WHAT THE POINT-TO-POINT TABS MEASURE

Split at feed 4e-3 on the shipped arm: the tool is **0.16 from where the encoders say** and
only **0.0055 from where the servo was commanded**. The following error — the thing a servo
tuner chases — is a thirtieth of the problem. Everything else is wind-up and bending, which
no encoder reports.

And the static sag at rest is 0.021 while the running deviation is 0.69 at feed 1e-2: it is
**97% dynamic**, which is what kills the obvious correction.

### The identified compliance is worth 5.4× and then nothing, and it does not degrade gracefully

`e = J diag(c) τ_g` is linear in c and fits by exact least squares from one lap with the
tracker. Contour rms, identified against none:

| feed | none | identified | |
|---|---|---|---|
| 1e-3 | 3.03e-2 | 5.61e-3 | **5.4×** |
| 2e-3 | 3.98e-2 | 2.25e-2 | 1.8× |
| 4e-3 | 1.34e-1 | 1.30e-1 | 1.03× |
| 1e-2 | 5.61e-1 | 5.96e-1 | *worse* |

A compliance constant answers a QUASI-STATIC question, and above the structure's modes the
error is a ringing response with a phase of its own. No constant times the present torque
has a phase.

**AND THE IDENTIFYING LAP HAS TO BE SLOW, which cost a browser run to find.** Fitted at the
shipped feedrate the elbow's constant came back **+1.81 where the physics requires a
negative number**, and the correction then applied the error a second time: contour 1.34e-1
→ 2.65e-1. This project had already measured the mechanism on a single joint (brick 9: a
static fit to a moving trace recovered 0.833 against a true 2.500, because the gearbox's
DAMPER carries most of the torque during a move) and I ignored it. Commissioning now runs at
the bottom of the ladder whatever the machine is set to, and reproduces to four figures in
Node and in the browser: **c = −0.4582 / −1.405**.

**THOSE CONSTANTS OVERTURN THE TAB'S OWN PREMISE FOR THIS ARM.** They are **7.3×** and
**22.5×** the gearbox's own 1/K, so here the LINKS are the dominant compliance, not the
gearbox — the opposite of the 70–90% split brick 6 measured at its own stiffnesses. The
split is a property of the machine, not a law.

### What works is memory of the lap

A closed toolpath is exactly periodic, so the error at a point ON THE PART is repeatable.
`lib/flexisim/pathilc.js` keeps a per-joint correction table **indexed by arc length** —
not by step, because a step index needs the lap to be a whole number of steps or the phase
drifts without bound, and because arc length makes the table a property of the part.

One scored lap each, feed 4e-3, same plant, same program:

| correction | contour rms | max | lag | ∫τ² | work | torque rev |
|---|---|---|---|---|---|---|
| none | 1.342e-1 | 4.16e-1 | 7.54e-2 | 5.93e-4 | 3.12e-2 | 12 |
| wind-up τ/K | 1.327e-1 | 4.05e-1 | 7.45e-2 | 5.98e-4 | 3.14e-2 | 10 |
| identified | 1.303e-1 | 3.41e-1 | 8.44e-2 | 6.27e-4 | 3.21e-2 | 20 |
| **learned, 14 laps** | **2.567e-2** | 6.96e-2 | 2.34e-2 | **3.92e-4** | **2.80e-2** | 34 |

**5.2× on the shape and 34% less copper loss at the same time**, which was not the expected
trade: less ringing is less torque as well as less error, and the lag falls 3.2× as a side
effect nobody asked for. The cost lands exactly on the third objective — **2.8× the torque
direction changes** — while VELOCITY reversals do not move at all (8 either way), because
those are the corners of the part and no correction removes them.

Convergence, lap by lap: 1.33e-1 → 9.4e-2 → 6.8e-2 → 5.2e-2 → 4.2e-2 → 3.5e-2 → 3.1e-2 →
2.9e-2 → 2.7e-2 → 2.6e-2 → 2.55e-2 → 2.53e-2, then flat.

**EVERY ONE OF THE LEARNER'S THREE NUMBERS WAS MEASURED AND TWO OF THEM HAVE FAILURES ON
BOTH SIDES.** The lead, in steps, against contour rms after eight laps: 0 → 0.182
(diverging) · 300 → 0.0854 · **500 → 0.0578** · 700 → 0.0834 · 900 → 0.153 · 1200 → 0.183.
The optimum is 500, which is **1/bandwidth of the position loop** — the loop's own time
constant, not a number that had to be searched for. The zero-phase filter's half-width, in
bins: 60 → 8.6e-2 · 30 → 4.6e-2 · **12 → 2.58e-2** · 6 → 2.56e-2 then drifting up · 3 and 0
→ drifting. Too much filtering leaves error the correction is not allowed to touch; too
little lets it chase content the plant does not reproduce and the tables creep.

The library test drives a plant whose delay can be written down (a pure delay plus a
first-order lag) precisely so the lead can be swept across it and BOTH failures asserted —
a convergence check that only ran at the shipped lead would pass with the mechanism
removed.

### The two energy numbers disagree, which is the argument for reporting both

Uncorrected, straight off the page's own Sweep button:

| feed | lap steps | contour rms | ∫τ² | work | torque rev |
|---|---|---|---|---|---|
| 1.6e-2 | 2893 | 7.19e-1 | 6.62e-3 | 2.58e-1 | 22 |
| 1.0e-2 | 3268 | 5.61e-1 | 5.39e-3 | 1.60e-1 | 22 |
| 6.0e-3 | 4904 | 3.50e-1 | 1.95e-3 | 6.19e-2 | 16 |
| 4.0e-3 | 7356 | 1.34e-1 | 5.93e-4 | 3.12e-2 | 12 |
| 2.0e-3 | 14712 | 3.97e-2 | **1.258e-4** | 1.42e-2 | 12 |
| 1.0e-3 | 29425 | 3.03e-2 | 1.365e-4 | **1.18e-2** | 4 |

Copper loss has an **interior minimum at 2e-3** — fast costs acceleration, slow costs
holding the arm up for longer — while mechanical work falls monotonically and says go as
slow as you can. Contour error keeps improving but **flattens**: halving the feed from 4e-3
buys 3.4×, halving it again buys 1.31×, because what is left down there is the arm sagging
under its own weight and winding up against gravity, and neither cares how fast you go.

### The picture, and what is exaggerated

Every other stage on this page magnifies the deflection because a point-to-point move has
nothing else to show. Here the SHAPE is the subject, so the arm is drawn at TRUE geometry
(each link's own deflected centre line, through exactly the transform `toolXY()` uses) and
the deviation is drawn as its own object: each recorded sample placed at the nearest point
of the program and pushed out along that point's NORMAL by a stated factor. The trail is
therefore a picture of the contour error alone, and the lag — which is not a defect —
deliberately does not appear in it. The scale is uniform in x and y, because a circle drawn
with two scales is an ellipse and the whole point of a ball-bar test is that a departure
from a circle is the machine.

Three drawing defects, all of the class this project keeps meeting — no error, nothing
blank, just the wrong picture. **The view frame was fitted to the program alone**, and this
arm's elbow hangs well below the workpiece, so the forearm arrived from off screen. **The
content was pinned to an edge** rather than centred, and a uniform scale means one axis has
slack, so the picture sat in the bottom of the stage. And **the error index wraps**: a tool
behind the command at the start of a lap has its nearest point at the far end of a closed
path, so the series jumps from ~L back to ~0 and joining those two samples drew a chord
straight across the picture and a horizontal line across the chart. A break is inserted
instead of a join.

### A feedrate change is a change of speed, not a teleport

Installing a new profile and restarting its clock at zero sends the command back to the
start of the part while the tool is somewhere else — a position step into the servo's gain,
which is this project's oldest self-inflicted transient under a new name. `timeAt(s)`
inverts the profile so the new one starts at the arc length the old one had reached, which
is what a feedrate override actually does. It is also what lets the learned table survive
one: the table is indexed by position on the part, and only the LEAD — which is a time —
has to be re-converted. Measured: a table converged at 4e-3 still leaves 1.79e-1 at 6e-3
against 3.10e-1 with no table, so it partially transfers and then goes on learning.

### Backlash is on for this tab and nowhere else

A point-to-point move crosses a dead band once and settles; a contour crosses it wherever a
joint reverses, and the step it leaves in the surface is the quadrant glitch every machine
tool builder knows. Turning it off would leave the direction-change count measuring
something with no cost attached to it.

### And the Chain tab's picture-vs-number check was comparing two different quantities

Found while running the suite for this brick, and it is the same shape as everything else
in it. `lastGeom2` measured the drawn tool against the drawn encoder chain as a `hypot` —
the full separation in the canvas — and compared it against `tipError().total`, which is a
scalar TRANSVERSE to link 2 and by construction carries no axial term. Measured on one run:
drawn 0.7760 against a true 0.7203, a 7.7% disagreement against a 6% tolerance — and
`sqrt(0.7203² + 0.2910²) = 0.7766`, i.e. **the whole discrepancy was the axial term**. Since
the axial displacement moves with the pose and the smoke test samples at whatever instant
the run stops, the check drifted in and out of its own tolerance run to run (1.0334 one
run, 1.0774 the next) with nothing changing. Projecting onto the transverse direction makes
them the same quantity, and the tolerance comes down from 6% to 1% — a tolerance wide
enough to absorb an axial term is wide enough to absorb a real drawing defect, which is
what the check exists to catch.

### And the convergence check reported a converging learner as a diverging one

The full-tier smoke check read `1.77e-1 → 5.33e-1 → 5.28e-1 → 4.93e-1 → 4.63e-1 → 4.61e-1`
and failed. The learner was fine: at that feedrate Node measures **5.87e-1 → 1.07e-1 over
16 laps**, still falling at lap 8. Two things were wrong with the reading. The check
arrived from the commissioning restore **a third of the way into a lap**, so its first
history entry scored a third of a lap (1.77e-1) and every full lap after it looked like a
regression against it — a partial lap is now folded into the tables (a bin nobody visited
is left alone, so the update is still valid) but is no longer *reported* as a lap. And it
waited for six laps when the claim needs eight; the plateau it thought it saw was the
middle of a convergence.

### The learner's ceiling was a guard meant for something else

With the reporting fixed the browser still plateaued: `5.87e-1 → 5.32 → 5.25 → 4.94 → 4.64
→ 4.60 → 4.61 → 4.60`, against Node's `5.87e-1 → … → 1.07e-1` on the same plant and the
same program. The cause was a **single shared clamp**. The quasi-static corrections predict
a wind-up of a few milliradians, so a 0.05 rad bound on the pre-distortion is fifty times
anything physical and only ever catches a fit that has gone wrong — measured not to bind at
all up to feed 4e-3 (identical scores with the bound ten times looser). The LEARNED table is
a different object: it is measured rather than predicted and it has to invert the position
loop's own lag as well as the compliance, so at the top of the ladder it legitimately
reaches **0.45 rad**. Applying the same 0.05 to it was not a guard, it was the ceiling.

Reproduced in Node by adding the clamp to the harness, which is what makes it a diagnosis
rather than a guess — contour rms after ten laps at feed 1e-2: **clamp 0.05 → 4.61e-1**
(the browser's trace to three figures), **0.25 → 1.72e-1**, **none → 1.29e-1**. And the
large table is not waste: at that feedrate the converged learner reads contour 1.07e-1
against 5.60e-1, ∫τ² **3.08e-3 against 5.38e-3**, work 1.34e-1 against 1.60e-1, and even
velocity reversals 6 against 8. Every objective the tab measures improves at once.

The learner's guard is now its own and is a runaway catcher (1 rad). What keeps a large
correction honest is not a limit but a reading: the panel reports the peak **against the
joint's own commanded travel over the lap** (0.82 and 0.91 rad here), and says so when it
passes a quarter of it — because a correction that is half the move is a fact about the
feedrate being near the limit of what the loop can follow, not about the learner.

### And a check I added earlier in the same session had been taking the suite down

The full tier ended with a ten-minute `waitForFunction` timeout, in the black box's
friction gate — and it had done the same on the previous full run, which I had recorded as
green because the failure came after the last check printed. Changing the friction slider
REBUILDS the plant and throws the commissioning away, which is what the two checks
immediately above it assert; the check then waited for a design from a module sitting idle
because nobody had pressed Go. It now presses Go. A red suite hides the next real failure,
which in this case was three sections further down.

### The friction note was wrong by a factor of a hundred, and so was the check beside it

With the check finally running (see above), it failed: the module identified the plant
perfectly well under the friction the slider was set to. The page's note claimed *"Coulomb
friction at 2% of the motor-side hold torque returns a DC gain of −0.08 against a true
15.5 and a probe fit explaining 0.3% of held-out data."* Re-measured across the ladder:

| friction (% of motor-side hold) | R² | step-test DC | outcome |
|---|---|---|---|
| 2% | 0.998 | 12.9 | identifies, designs, deploys |
| 5% | 0.997 | 14.9 | identifies, designs, deploys |
| **20%** | **0.0025** | **−4.26** (probe implies −0.03) | **REFUSES** |

The original measurement was taken while the ladder was a fraction of the **load-side**
hold torque; it was later corrected to motor-side — a factor of the gear ratio, 100 — and
neither the note nor the check was re-measured. So the page carried a false claim and the
check asserted it, and the only reason nobody noticed is that the check had been timing out
before it could disagree.

**And the ladder now stops at 20%**, which is a measured floor rather than a round number:
at 50% and above the joint barely breaks away, the commissioning never reaches a design or
a refusal (ten minutes, no message), and the tab is stuck. A slider position that hangs the
page is a trap — the same conclusion FlowSim reached about its viscosity floor.

### And the gate's first real firing crashed the panel

With the friction level corrected the gate finally fired in a suite run — and the black
box's stats panel threw `Cannot read properties of undefined (reading 'toExponential')`.
A refusal is not a design with zeros in it: there is no filter, no preview and no
correction size, so `umax` is simply absent, and three rows read it unconditionally. The
panel had never been rendered in the one state the gate exists to produce.

**The instrument that caught it was the page's own error buffer**, not `pageerror` and not
the console listener — the third time in this project that buffer has been the only thing
that saw a defect (the `mapAsync` rejection in FlowSim v114, the stale-backend read in
v140, this). Every functional check in the section passed while it was throwing. The panel
now names the refusal and why, which is what it should have said all along.

---

## Brick 34 — inverting the readout for control, and the regime where it is worth anything

The idea: stop bolting compensators around the soft sensor and use it AS the controller —
forecast the error at a ladder of horizons and invert each one into the correction that
would null it. Structurally it is standard and the machinery is already here. Make the
prediction

    yhat(k+L) = A(measured history at k) + sum_m h(m) u(k+L-m)

nonlinear in the state and **affine in the control**, and the plan is a box-constrained QP
over the horizon — `SoftSensor.opts.leads` gives the ladder, `lib/blackbox/qp.js` solves it.
Every number below is measured on a recording, so the whole exploration cost minutes rather
than a build.

**TWO INSTRUMENT CHECKS FIRST.** The `u → error` response identified from a *dithered
running* record matches a *directly measured held* step test to **0.9% at DC** (0.7074
against 0.7012) — two routes sharing no arithmetic. And the cross-axis term is **0.5%** of
the direct one, so treating it as two SISO loops is measured rather than assumed.

### In-sample R² is worthless here, and the command channel is a memorisation channel

Trained on one part program and tested on ANOTHER — the only honest test for a controller
that must work on a part it has never cut. Every variant scores ~0.99 in sample and they
differ by a hundredfold out of it:

| features | in-sample | rect→circle | circle→rect | rect→circle @250 steps |
|---|---|---|---|---|
| raw command window | 0.996 | 0.236 | **−1.91** | **−3.04** |
| structured (rigid-model tau_g) | 0.968 | 0.968 | 0.549 | **0.917** |
| measured readout | 0.997 | 0.961 | 0.517 | 0.732 |
| measured + command | 1.000 | 0.512 | 0.115 | **−8.76** (and −98.8 at 500) |

**A raw window of the command is worse than predicting the mean on a program it has not
seen**, and adding it to a measured model makes that model catastrophically worse. It is a
fingerprint of *where in the program you are*, which is exactly what does not transfer.
That is a direct finding about `lib/blackbox/`, whose disturbance map is a `WindowMap` over
the command: on the black box tab's single repeating move it can never show, and on a CNC
program it would be ruinous. A STRUCTURED command feature — the rigid model's commanded
gearbox torque — transfers instead, and barely degrades with lead (0.968 → 0.917 at 250
steps), which is what a plant that takes 660 steps to deliver half a correction needs.

### And on this machine the readout adds nothing the model has not already got

Fit the structured model, then ask how much of ITS residual the measured readout explains
on a held-out program:

| | lead 0 | 250 steps | 500 steps |
|---|---|---|---|
| rect→circle | **0%** | **0%** | 0% |
| circle→rect | **0%** | **0%** | 0% |
| rect→square | 8% | 15% | 0% |

Nothing. And the mechanism is mechanical rather than statistical: **on a well-following
servo the motor-side measurements are very nearly a function of the command** (the
following error is a thirtieth of the total error here), so there is no independent
information in them to forecast with. The soft sensor's value on this plant is as a
READOUT — what is the tool doing now, when nothing measures it — not as a forecaster.

### The ceiling, for completeness

A receding-horizon solve on a recording, with a PERFECT forecast: ~**6×** on joint tracking
error at ≥1200 steps of preview, **3.7×** at 300 steps, and **worse than nothing** below
about 100 — the plant cannot deliver a correction faster than that. The first version of
this sweep was non-monotonic in preview (11.3× at 300 steps against 6.6× at 2400), which is
impossible for an optimal controller and was the tell: at 40 iterations the QP is
under-solved and therefore accidentally less greedy, and a short-horizon MPC that solves its
horizon exactly dumps the cost just outside it. At 800 iterations the curve is monotone.

### Where it DOES earn its place: a load the command does not determine

Two instrument failures had to be cleared to find this out, and both are the same lesson.

1. **A disturbance a thousand times too small.** The band-limited noise was scaled by the
   filter's input gain and not renormalised, so it came out with a standard deviation of
   0.08 instead of 1. It moved the tool error by **1.00× in every configuration** — which
   is not a small effect, it is no effect at all, and "exactly 1.00" is what should have
   been read as a broken instrument rather than a null result.
2. **A motor-side disturbance is rejected by the position loop.** That is what a position
   loop is for: the encoder sees it. Measured, a slow torque disturbance at **140% of the
   operating torque** moved the tool error by **11%**. To matter, a disturbance has to act
   past the gear teeth, where the encoder is structurally blind — so `FlexArm2R.step()` now
   takes an optional load-side torque, pinned by a one-step closed form (`alpha = M^-1
   [T,0]` for a load-side torque, and exactly ZERO for a motor-side one, because a gearbox
   at zero wind-up transmits nothing).

With a load-side cutting torque at 1.5× the commanded tau_g, everything inverts:

| | no load | cutting load |
|---|---|---|
| structured model | R² 0.968 | R² **−0.538** — worse than useless |
| readout, on what the model leaves | **0%** | **88–92%**, and still **91% at 500 steps of lead** |
| ILC over laps | 1.25e-1 → 2.62e-2 (**5.2×**) | 1.87e-1 → **1.10e+0** — 2–6× WORSE, never converges |

ILC does not merely stop helping under a disturbance that does not repeat: it learns a
correction for something that will not be there next lap and applies it as noise.

**So each method owns a regime and none of them covers both.** A model of the command wins
when the error is the command's own doing; iterative learning wins when the part repeats;
the inverse readout is the only one of the three that can act on a load nobody commanded,
and it is the only one whose advantage survives out to half the loop's time constant. That
is the head-to-head the Path tab should show, and it is the reason to build a cutting-load
control at the same time as the controller — without one there is no regime in which the
inverse readout earns its keep, and the honest answer would be to use the model with
preview instead.

---

## Brick 35 — the Pilot: route, limit, run, deploy

Brick 34 ended with each correction owning a regime and a readout that added nothing
because the commissioning hid it. This brick is the flagship the page was heading at:
`lib/pilot/` — a controller commissioned by ONE BUTTON, told nothing about the plant,
purely NGRC in its algorithms. The engineer routes signals (measured in, corrections out,
a tracker during commissioning only, the command's look-ahead at runtime) and states
limits (position box, velocity, acceleration, jerk per channel; a correction cap; torque
guards; a workspace predicate). Everything else — the excitation, the sample grid, the
window reach, the ridge, the horizon, the effort weight, and the decision to deploy at
all — is measured from the machine.

### The one measurement that unlocked it

Brick 34's readout added 0% on top of the structured model — trained on a part program.
The scribble idea (excite the space, not the path) failed first in its obvious form and
the failure is dimensional: **a sum of n sinusoids spans a 2n-dimensional subspace in any
lag window**, so a window regression fitted to a six-tone scribble is rank-deficient —
exact inside the subspace, ridge-arbitrary outside it, and every deployment trajectory is
outside it. Measured: RMSE 1.38e-2 on a held-out program against 1.39e-3 for a model
trained on another program — ten times worse than the thing it was meant to replace, and
worse than predicting zero. **Three-pole filtered noise excites every direction**: same
features, same test, R² −5.2 → +0.97.

Then the second unlock: **handed the future of the command, the scribble-trained readout
holds R² 0.99 flat to 500 steps of lead** on programs never seen — the same feature set
that scored −98 when trained on a program. The memorisation channel was never the
features; it was the commissioning trajectory. On a scribble, cmd(k) does not determine
cmd(k+250), so the future window is used as physics or not at all.

### The closed loop, and the defect ladder on the way

| version | rounded rect | what was wrong |
|---|---|---|
| v1: h from the regression | 1.16×, saturated, 105 torque reversals | the u-taps spanned 1200 steps of a 2400-step response — the QP inverted a TRUNCATED h, over-corrected, and fought its own tail. Root cause: the encoders see the dither too, so a joint fit splits the response between u-taps and measured features (0.55/0.07 of a true 0.93) |
| v2: h from a probe, readouts h-consistent | 1.64× | the probe measures the whole response (0.9% DC agreement between the running fit and the held step — two routes, no shared arithmetic); every lead's target has the probe-h convolution subtracted, so the predictor the QP inverts is consistent across the horizon by construction |
| v3: the Pilot, everything auto | **2.10×, copper BELOW the open loop** | autotune beat the hand-picked windows (stride 13/ridge 1e-5 over my 22/1e-8 — the elbow's held-out R² went 0.90 → 0.95) |

### What the Pilot measures on itself, and the three instrument lessons inside it

- **The excitation's limits are verified on the commanded sequence, not on the
  construction.** Two defects said why: a cosine ease's endpoint acceleration step is a
  jerk violation no interior sample shows (the peak sat at 17× the limit and every sample
  of it lived at the seam — the C² quintic fixed it), and the full-length regeneration
  renormalises past the short series' tuned peaks.
- **A guard trip derates the dither too.** The first derate path shrank the trajectory's
  rates and left the dither's own velocity spikes — which were what was tripping the
  guard — untouched: three retries changed nothing and the pilot refused a healthy
  machine.
- **The effort weight must be priced where the machine will live.** Deployed on a real
  program, λ is DOMINATED: 7.8e-2 beat 0 on contour (6.24e-2 vs 6.75e-2), copper
  (4.75e-4 vs 7.25e-4, below the open loop's 5.93e-4) and torque reversals (16 vs 60).
  Yet the verify round at full excitation rates chose λ = 0 by more than its 5% band, and
  at half rates still did — a fast scribble's free error is broadband, so chasing it fast
  pays there and never on a program. At QUARTER rates the verify's own preference finally
  matches the machine's and picks λ 1.95e-2 by the smoothest-within-5% rule.

### The numbers that ship

One commissioning (~128k steps, about a minute of machine time), then programs never
seen: **rounded rect 1.343e-1 → 6.4e-2 (2.1×), circle 7.1e-2 → 9.9e-3 (7.1×)** — both on
LESS copper than the open loop, u never past the engineer's cap. Verified 5.95× on the
machine before deploying. Against the alternatives: ILC needs 12+ laps of THE part to
reach 2.6e-2 on the rectangle and transfers only partially; the identified compliance is
1.03× at this feed; and under the cutting load that makes ILC 2–6× WORSE the pilot still
helps (1.10× — bounded by what any controller can do against a disturbance whose
correlation time is comparable to the plant's own delivery time).

And the same module, unchanged, on a plant sharing no physics with the arm (a mass behind
a compliant coupling on a fast servo): commissioned in 50k steps, verified 18×, deployed
**23×** on a program of incommensurate sines it never saw. A truth signal routed to noise
is REFUSED with the reason; a guard trip derates once and the commissioning still lands.

### And one more read race, same shape as the last one

The first browser read of the deployed pilot's lap said contour 8.7e-2 and τ² 6.0e-5 — a
copper number a factor of eight from Node's, for one quantity. The lap score RESETS at
every lap boundary, and a wait that resolves at 95% of a lap followed by a separate read
one frame later is a race: measured, a "full lap" read **131 steps** of the next one. The
smoke check now takes its snapshot INSIDE the wait predicate — the JSON it asserts is the
JSON that satisfied the wait — and the browser and Node instruments agree: full lap 6887
steps, contour 6.9e-2, τ² 2.99e-4 against the open loop's 5.93e-4.

---

## Brick 36 — hardening the Pilot, and the attribution instrument that found 2× hiding in plain sight

The question that drove this brick came from outside: *ILC eventually draws the shape
nearly perfectly — that proves the machine is capable of that accuracy without ILC, so how
do we get there?* The reasoning is exactly right: ILC converging to 2.53e-2 is an
existence proof that a correction sequence within the actuators' reach achieves it. The
pilot's 6.5e-2 was therefore model error somewhere, and the job was to find WHERE.

### Two hypotheses measured dead before the real one was found

**Pose scheduling: null.** The stated caveat — "the probe response is taken at one pose" —
was the obvious suspect on an arm whose inertia varies 2× with the elbow. Probed at five
poses across the commissioning box: DC 0.942–0.946 (**0.4%**), t50 within ±20 steps, shape
max deviation ≤ 2%. The u→e response is servo-and-gearbox dominated and the pose variation
is simply not there to schedule against. Cross-coupling peaks at 2.8% at the extended pose
(5× the centre's figure, still small). Not built, and now the caveat carries a number.

**Dwell coverage: null where it mattered, negative elsewhere.** Programs brake to near
rest at corners; the scribble never stops; hypothesis — that regime gap explains the
square's 1.6×. A time-warp (the scribble's own feedrate profile: smooth rate dips to a 2%
floor, position coverage preserved) was built and measured: square 1.64× → 1.69×
(nothing), rounded rect 2.10× → 1.79×, circle 7.10× → 4.87×. Crawling 60% of the time
starves the fits of information about the dynamics that matter at speed and buys nothing
at the corners. Default off; the option stays with the measurement in its comment, because
a heavier-stiction plant may answer differently.

The detour paid anyway: it caught the excitation builder RETURNING A FLAT LINE when limits
and duration were incompatible — the corner period escalated to 2.4e16, the trajectory
went flat, and a flat line passes every rate limit while exciting nothing. Coverage is now
part of the acceptance, refusals name the dominant cause across attempts (a single
attempt's tune failure had been masking "the workspace rejects everything"), and an
infeasible excitation is a REFUSAL with a remedy, not a crash. It also caught the held-out
TAIL metric collapsing on a warped record (R² 0.37 beside a 15× verify — the tail landed
on a quiet stretch and R² is against the tail's own variance; rule 19). Validation is now
two blocks spread through the record, weights refit on everything.

### The attribution instrument, and what it found

One new number: at every control tick, record what the QP's own model PREDICTS the lead-0
residual will be, and compare with what the machine delivers. On the rounded rectangle:
predicted **2.8e-3**, delivered **6.1e-3** — ratio **2.16**. The forecast (held-out R²
0.99) could account for almost none of that. So the plan was right and its EXECUTION was
mismodelled — and the predicted residual, 2.8e-3, was already ILC-class. The whole gap to
ILC was in how the plan mapped onto the machine.

Two timing-registration defects, found in order:

1. **The QP's T used zero-order-hold grid differences of the step response, but the
   runtime applies u LINEARLY INTERPOLATED between ticks** — each decision reaches the
   plant as a triangle spanning two grid intervals, not a held step. Planning against a
   command the runtime never sends carries a built-in half-grid timing bias. T now uses
   the response to the interpolation's own triangular basis, computed numerically from the
   probe's per-sample response. Attribution 2.16 → 1.80; rounded 2.06× → 2.44×.
2. **The triangle was registered one grid early** — crediting every decision with a full
   grid of delivery it had not made. A decision made NOW starts rising NOW: its effect at
   lag m grids is the response at m·g, and h[0] is exactly zero because a correction that
   has not risen has not arrived. Attribution 1.80 → **1.04**; rounded 2.44× → **4.15×**.

### Where it stands

| | contour | ∫τ² | torque rev |
|---|---|---|---|
| open loop | 1.343e-1 | 5.93e-4 | 12 |
| pilot, first part ever | **3.23e-2 (4.15×)** | **4.00e-4** | **16** |
| ILC, lap 14 of that part | 2.53e-2 (5.3×) | 3.92e-4 | 34 |

The machine now executes the pilot's plan to 4%; the one-shot controller sits within 28%
of the fourteen-lap learner, on less copper and half the reversals, and the circle reads
**8.1×**. What remains on the rectangle is the forecast floor itself (the predicted
residual), and on the square (still ~1.65×, λ-insensitive, attribution 2–3.5) the
diagnosis is different and stated: the corners PIN u AT THE ENGINEER'S OWN CAP and are
exactly where a generic forecast is weakest — an authority limit with two named levers
(raise uMax, or corner-shaped features), not a hidden defect.

### The rest of the hardening

A quantised encoder and a dirty tracker still commission, verify honestly and deploy
(23.7× on the noisy synthetic — while running at 1.6× the commissioned velocity, which the
new ENVELOPE REPORT correctly flagged 1465 times: the first version of that check asserted
zero and the instrument was right, the test's assumption was wrong). Deployment outside
the envelope is measured graceful (1.63× at feed 1e-2 against 2.1× inside, at the time),
so the report informs rather than interlocks. A channel whose forecast fails held-out
validation is disarmed rather than deployed on hope, refusals are ordered by cause (a
probe that saw nothing is a routing problem; every downstream symptom follows from it),
and an infeasible excitation inside the pilot is a verdict, not an exception.

---

## Brick 37 — the one-shot pilot passes the fifteen-lap learner

The target, set from outside: within 5% of ILC at 15 iterations. On the rectangle that
meant ≤ 2.66e-2 from a starting 3.23e-2; on the circle, ILC@15 converges to **8.9e-4**
(28× — a smooth path with no corners lets it dig), so ≤ 9.3e-4 from 8.7e-3. Method:
decompose before optimising, with an ORACLE — the pilot's machinery fed a perfect
recording of the repeatable error, which is exactly the information ILC consumes.

### What the oracle ruled out, in one sweep each

Grid refinement (decisions every 72 → 18 steps): **null** on both shapes. QP iterations
60 → 300: **worse** (the warm-start truncation is useful implicit regularisation; exact
solutions chatter — torque reversals 35 → 101). The probe's missing DC tail (a real 3%
found by a 12k-step probe): **null**. The response in the MOVING regime, measured by a
twin experiment — the identical scribble run twice, with and without dither, difference =
H·u exactly, since the machine repeats to 1.6e-5: **matches the held-pose probe**; null.
Lap-to-lap repeatability: **1.6e-5** — no floor problem. Oracle registration: correct.

### What it ruled in

1. **The horizon.** N·grid = 1.0×Ts means an error component is first seen exactly one
   settling time ahead — and the plant needs the whole settle to deliver, so every
   correction systematically arrives ~90% complete. At 1.5×Ts: circle 7.9e-3 → 5.1e-3,
   rectangle 2.22e-2 → 2.02e-2, flat by 2.0×. Shipped.
2. **The effort weight, for the third and last time.** The λ basin on every DEPLOYED
   program, both plants: flat and dominant from 0.005·dc² to ~0.08·dc². Every automatic
   pricing scheme — full-rate verify, quarter-rate verify, and a replay against held-out
   commissioning data — picked outside it, because commissioning data is broadband and
   programs are smooth: chasing fast error pays on a scribble and never on a program.
   λ is now the plant-scaled constant 0.005·dc², the replay ladder is still computed and
   REPORTED, and the verify still gates the deploy. A measured surrender, recorded as one.
3. **The machinery was never the limit.** The same QP, horizon and interpolation against
   an exactly known linear plant leaves a residual of **2.7e-6** — six orders below the
   free error. Everything real sat in the models and the registrations.

### Where it landed

| rounded rect, feed 4e-3 | contour | ∫τ² | torque rev |
|---|---|---|---|
| open loop | 1.343e-1 | 5.93e-4 | 12 |
| **pilot, one shot, part #1** | **2.178e-2 (6.16×)** | **3.80e-4** | **23** |
| ILC, lap 14 of that part | 2.53e-2 | 3.92e-4 | 34 |

**The one-shot controller is 14% below the fifteen-lap learner's converged figure**, on
36% less copper than the open loop, with fewer reversals than the learner. Circle: 7.1e-2
→ 1.02e-2 (6.98×). Target met on the rectangle with margin; not on the circle, and the
reason is now a measured mechanism rather than a mystery:

### The one-shot / iteration boundary, located

The circle's residual against a perfect repeatable forecast is **one localised burst per
lap** — 2.2e-3 against a 2.5e-4 floor everywhere else — at a joint velocity reversal, and
its size equals the backlash lost-motion carried to the tool (2e-4 rad × the lever). The
recording knows where the crossing happened UNCORRECTED; applying a correction moves the
event; no one-shot plan can know where its own correction will put a discontinuity. The
iterated oracle proves the point from the other side: fold one observed residual back in
and the circle drops 7.9e-3 → **8.2e-4** — at ILC's level — in a single pass. Iteration
is not a better optimiser here; it is strictly more information, delivered after the
correction moved the event. The distributed part of the circle's error — everything that
is not the backlash burst — is already at ~2.5e-4, BELOW the ≤5% target.

What would move the circle without iteration, in order of plausibility: direction-aware
forecast features (the AxisComp direction-bit lesson — a linear readout cannot represent
a sign discontinuity, and sgn(v) features can carry backlash), or a smaller backlash. On
a machine with tighter gears than 2e-4 rad of lost motion, the burst shrinks with it.

## Brick 38 — nine nulls, and the burst that was never a burst

Brick 37 closed with a mechanism and a prediction: the circle's residual was "one
localised burst per lap, the size of the backlash lost-motion", and direction-aware
features were the plausible lever. This brick overturns both. It is the record of
exhausting the one-shot levers, and the levers are now exhausted — every candidate below
was MEASURED, on the oracle (the machinery fed a perfect recording of the repeatable
error, so nothing here is confounded by forecast quality).

### The burst re-attributed (rule 14, twice in one turn)

Profile the FREE error around the lap in 24 bins: it peaks at 1.2–1.8e-2 in exactly the
bins where the residual "burst" sits, against 4.6e-4 on the quiet stretches. The residual
is not a localised event on a clean floor — it is the free error's own shape at a uniform
~8–12%, everywhere. The burst was where the free error is big, nothing more. The
backlash-lost-motion size match in brick 37 was a coincidence that a localisation profile
of the free error would have caught immediately; brick 37 profiled the RESIDUAL and
never the free error beside it. Rule 6's own instrument, pointed at the wrong trace.

The second rule-14 catch: a twin fit (identical scribble with and without dither,
difference = H·u exactly) read the moving-regime response DC as 0.91–0.93 against the
held probe's ~1.0 — suspiciously equal to the uniform shortfall. Sweeping the MODEL's h
gain over 0.85–1.0 on the oracle settled it: monotone worse as the gain drops, on both
shapes (circle 5.05e-3 at 1.00 → 1.18e-2 at 0.85). Unity is correct; the twin's DC was
the instrument — regression bias on a finite record — not the plant.

### The nulls, each with its number

| # | lever | verdict |
|---|---|---|
| 1 | pose-scheduled h (DC varies 0.4% over the box) | null |
| 2 | dwell / time-warped excitation | null on the square, negative elsewhere |
| 3 | decision grid 8 → 2 | null |
| 4 | QP iterations 60 → 300 | worse (brick 37) |
| 5 | probe DC tail — a real 3% creep found by a 12–16k hold | null deployed |
| 6 | twin moving-regime h substituted for the probe's | worse |
| 7 | direction features tanh(Δcmd/v₀), four leads | never better, burst rmse worse |
| 8 | full-support h tail in the past-u bookkeeping | null (5.05e-3 → 5.50e-3) |
| 9 | model h gain 0.85–1.0 | monotone worse; unity correct |

Also killed on the way: the dead-zone theory (twin fit split near/away from command
reversals — response DC 0.915 vs 0.918 and 0.872 vs 0.877; identical, no authority
collapse at reversals).

### What is left, and why it is a boundary and not a defect

The ledger, circle at feed 4e-3: open 7.1e-2 → live pilot 1.02e-2 (7.0×) → oracle with a
PERFECT free-error recording 5.05e-3 (14×) → target 9.3e-4. The machinery is exact
(2.7e-6 in pure sim), h is correct at unity, and every parameterisation of a better
response model — scheduled, moving-regime, longer-tailed, gain-trimmed, sign-featured —
measured null. What remains is uniform, proportional to the free error, and therefore
not IN the response model at all: **applying the correction changes the state path, and
the state-dependent disturbance the recording was made against moves with it, by about a
tenth of itself.** e_free(corrected trajectory) ≠ e_free(free trajectory), and no
measurement taken without deploying can know the first one.

The measurement that would change the answer (rule 59): one lap cut UNDER the
correction, folded back in — the iterated oracle reads 8.2e-4 in a single pass, at the
fifteen-lap learner's level. That is ILC's information channel, excluded here by the
one-shot decision, not by ability. The one-shot line on this machine: rectangle
2.178e-2, BELOW ILC@15's 2.53e-2; circle 5.05e-3 at the oracle floor against a 9.3e-4
target that one deployed lap would meet. Stated, with the price of crossing it measured:
one lap.

## Brick 39 — the estimation error was never a lead, and the 3.5× was the protocol

The owner looked at the soft sensor and said the estimation error is not a lead. That
is the opposite of the flavour brick 11 left — a forecast 3.5× better than the
present-time estimate, an interior minimum over lead, a "lead deficit", a mechanism
declared unexplained — so it was measured rather than argued with. The owner is right,
and the measurement dismantles brick 11's headline.

### No shift helps, anywhere

Sweep a pure time shift of the locked estimate against the truth, ±40 samples, on the
open-loop session brick 11 was measured on: **the best shift is exactly 0** (0.3645;
±10 samples reads 0.52, ±20 reads 0.79). Not a lead, not a lag — the error has no
alignment structure at all. The same sweep under every other protocol below also
returns 0.

### What it actually was: an affine sweep found a growing bias

A gain-and-offset fit takes the estimate from 0.3645 to **0.1920** — half the error was
a constant-ish bias, and tracked by decile it is not constant but GROWING: −0.007 std
of the truth early in training, −0.15 in the first half of the locked window, **−0.47**
by the end, while the forecast's bias holds at −0.05 throughout. A frozen readout
drifting away from a plant that is going somewhere.

### Where the drift comes from: the test protocol, not the sensor

The brick-8/11 session drives the arm OPEN LOOP in torque. The move profile is
symmetric, but stiction asymmetry walks the pose **−3.3 rad across the training
window** — pose and time perfectly confounded in the training data — and the truth
carries a slow component the frozen weights mis-extrapolate once the walk stops.
Under a POSITION SERVO — the regime the page runs and any production machine lives in —
the pose distribution is stationary and the story inverts:

  servo, periodic move          estimate **0.0033**  forecast 0.0034   (recall regime)
  servo, golden-ratio modulated estimate **0.0459**  forecast 0.0402   (generalisation)

The modulated row is the honest one (brick 16's rule: an exactly periodic stream lets a
big basis score by remembering where in the cycle it is). Estimate and forecast agree
to **1.1×**; the bias deciles wobble around zero; the best shift is 0. "Predicting
ahead is easier than predicting now" was never a property of the sensor — it was a
property of an unregulated pose distribution meeting a frozen linear readout. The
full tier now pins all three corrected claims (shift 0, estimate < 0.15, agreement
within 1.5×) on the servo-driven modulated stream.

The lesson is brick 8's, third time through: a surprising measurement is a reason to
check the instrument — and the "instrument" here was the whole test protocol. The
open-loop numbers stay in the record as what they are: a measurement of what pose
drift does to a frozen readout, mislabelled as a measurement of forecasting.

## Brick 40 — the kinematics were never given, and the learned inverse beats the drawing

The owner asked for a test where the system is not given the kinematics — no link
lengths, no ik(), no Jacobian — to see whether it can solve the inverse as part of the
learning. It can, and the strong half of the result was not that it matches the
analytic kinematics but that it is an order better statically, because the two are not
answers to the same question: the analytic ik() commands the DRAWING — rigid geometry —
while the learned map was trained on where the tool of the real machine actually
settles, gravity droop, gearbox wind-up and backlash mean included. Robot
calibration's classic result, produced by route–limit–run with zero geometric
knowledge.

### The commissioning

Visit held points inside the engineer's command box (quintic eases at the routed
limits, settle, read the tracker), record (tool x,y → channel commands), and fit the
DIRECT INVERSE with an agnostic polynomial ridge basis. 180 points cost 204 seconds of
machine time. The degree ladder, holdout every fourth pair:

  degree 4 → 2.5e-3 rad    degree 6 → 4.8e-4 rad    degree 8 → **1.17e-4 rad**

healthy to the end (train 6.1e-5 against holdout 1.2e-4 at degree 8 — basis-limited,
not memorising). 90 points carry degree 7 to 2-4e-4 rad, which is what the committed
full-tier check uses.

### Measured on the machine, holding twelve real path points each

  circle   analytic ik 4.51e-2 (max 6.4e-2)   learned **1.02e-3** (max 2.7e-3)   44x
  rounded  analytic ik 4.64e-2 (max 6.9e-2)   learned **2.04e-3** (max 6.3e-3)   23x

The 4.5e-2 the analytic kinematics leaves is the machine's static droop and wind-up —
error the drawing cannot know. At production feed, open-loop laps are
dynamics-dominated and the static win is buried (circle 7.10e-2 → 6.42e-2, rounded a
tie), which is the expected shape: geometry decides where you settle, dynamics decide
how you move.

### The full chain, with the pilot on top and no kinematics anywhere

The pilot's commissioning truth was re-routed through the learned map itself —
`inv(tracker) − command`, the deviation in command coordinates — so the entire chain
from Cartesian program to motor command contains no analytic kinematics at all:
geometry from the tracker, dynamics from the pilot's noise excitation, routing from
the same fitted map.

  circle   6.42e-2 → **1.69e-2** (3.8x)   [analytic + pilot: 1.02e-2]
  rounded  1.33e-1 → **2.37e-2** (5.6x)   [analytic + pilot: 2.18e-2]

Within 9% of the analytic-kinematics system on the rectangle; the circle carries a
0.7e-2 penalty from the noisier truth channel (verify 1.46x against the analytic
routing's 2x+), which is the honest cost of not knowing the geometry, stated rather
than hidden.

### The defect on the way, and it is a lesson about degree

The first composed run was REFUSED — verify 1.01x, the pilot's own gate holding. The
truth routing used the degree-8 geometry fit, evaluated at the MOVING tool during
excitation; a high-degree polynomial leaves the training hull violently, the truth
channel spiked, and every fit downstream was poisoned. The fix is a division of
labour: the geometry keeps degree 8 (evaluated only on the program, deep inside the
hull) and the ROUTING gets its own degree-5 fit with inputs clamped to the hull —
truth peak 0.055 rad, zero spikes, verify 1.46x, deploys. A map used as an instrument
has different requirements from the same map used as an answer: the instrument must
above all fail gently.

## Brick 41 — modes ⑥ and ⑦: the fully learned system goes on the page

Brick 40's experiment becomes the Path tab's modes ⑥ and ⑦. **Commission ⑥** runs the
whole thing watched, in two stages: GATHER (90 held points inside the command box,
quintic eases at the routed limits, the tracker teaching the geometry; degree-7 inverse
fitted with a holdout report) and then the pilot's noise commissioning with its truth
routed through the learned map. The refusal shape is inherited exactly: ⑥ or ⑦ selected
before the geometry is learned AND the pilot has vouched quietly runs open, the same as
③ before commissioning and ⑤ before its verify.

**⑦ stacks a PathILC table on the learned chain**, with the lap's tool error mapped to
joint units through the learned routing — route(tool) − route(command) — so the ④ block's
analytic Jacobian appears nowhere in it. The table is a separate object from ④'s (it
corrects a different plant: the learned refs, not the analytic ones), managed the same
way — kept across a feedrate change, remade with the program, folded at lap boundaries.

Measured in Node (test/pilot/ikfree.test.mjs pins the composed chain):

  circle   lap 1 5.90e-2 → lap 14 **1.14e-3**   analytic-kinematics ILC@15: 8.9e-4
  rounded  lap 1 6.97e-2 → lap 14 **1.27e-2**   analytic-kinematics ILC@15: 2.53e-2

The circle lands within 28% of what the fifteen-lap learner reaches WITH the kinematics;
the rectangle lands 2× BELOW it. Iteration absorbs both the learned map's static
residual and the state-dependent disturbance that brick 38 located as the one-shot
boundary — so the fully learned stack, given laps, crosses the line the one-shot pilot
measured and stated.

One wiring rule mattered on the page: in modes ⑥/⑦ the REFERENCES THEMSELVES come from
the learned map (central-differenced for rates), not a pre-distortion on top of ik() —
that is the difference between demonstrating a learned system and decorating an analytic
one. And the routing/geometry split from brick 40 ships as constants (degree 7 for the
answer, degree 5 hull-clamped for the instrument) with the measured failure documented
beside them.

## Brick 42 — ⑤+④: iteration on the pilot, and it erases the knowing/learning gap

The owner asked for ILC on mode ⑤ as well. The stacking mirrors ⑦ exactly, on the
analytic chain: the pilot's one-shot correction plus a PathILC table folding per lap,
tool error mapped through the analytic Jacobian as mode ④ maps it. A third distinct
table — ④'s corrects the bare kinematics, ⑦'s corrects the learned chain, ⑤+④'s
corrects what the pilot leaves behind — with the same lifecycle (kept across a feedrate
change, remade with the program) and the same refusal gate as ⑤.

Measured, 14 laps at feed 4e-3 (pinned in test/pilot/arm.test.mjs at 12 laps):

  circle   7.08e-2 (cold rings) → **1.03e-3**   ⑤ alone 1.02e-2 · ④ alone @15 8.9e-4
  rounded  6.19e-2             → **1.30e-2**   ⑤ alone 2.18e-2 · ④ alone @15 2.53e-2

This is brick 38's boundary crossed from the analytic side: the pilot delivers the
one-shot bulk and the table folds in the part of the disturbance only a deployed lap
can see. The circle converges into the analytic ILC's own territory; the rectangle
lands twice below what ④ alone ever reaches, because the pilot's correction is
information ILC does not have to relearn.

**AND THE COMPARISON WITH ⑦ IS THE FINDING.** Same laps, same tables, one chain given
the kinematics and one that learned them from 90 tracker holds:

           ⑤+④ (analytic)    ⑦ (fully learned)
  circle     1.03e-3            1.14e-3
  rounded    1.30e-2            1.27e-2

Iteration erases the difference between knowing the kinematics and having learned
them — the two stacks converge to the same numbers, within lap-to-lap noise, from
static-accuracy starting points that differ by an order of magnitude. The geometry a
drawing supplies and the geometry a tracker teaches are interchangeable once the part
is allowed to speak.

## Brick 43 — the tracer that never came back, and two compliance sliders

**"Sometimes the orange tracer goes away and doesn't come back."** Reported from the
device, reproduced deterministically, and the mechanism is one line: a queued feedrate
change re-enters the program through `timeAt(s0)`, which INTERPOLATES — so the resumed
step counter is fractional (measured k = 390370.26), `kP++` keeps the fraction forever,
and `kP % 8 === 0` is satisfied never again. Every modulo-gated sampler in the loop
starved silently: the error trail plateaued at the ~2 points per lap the wrap-break
path pushes (invisible), and the chart series stopped growing entirely. Nothing threw,
nothing halted — the run was CORRECT throughout, which is why it read as a display
ghost rather than a bug.

The reproduction was cheap once the instrument existed: `__flxPathDbg` now reports the
trail and chart fill counts, and the smoke test changes feedrate mid-session, resumes,
and waits for the trail to refill — with the bug present it never does (trail 0, chart
0, 90 s timeout); with `Math.round` on the re-entry clock it refills within a lap. A
trail of two points per lap is indistinguishable from a missing one on screen, and only
a count says which. Same family as FlowSim's "0/0 is NaN, not zero" and the frozen
Plotly chart: the picture cannot report its own absence.

**And the compliance controls the owner asked for**, both floors measured before they
became rungs (v118's rule): the path tab gets its OWN gearbox ladder, extended 64×
looser at the bottom — 0.25 to 32 against the old floor of 1 — and a new **Link E**
slider, 0.03 to 0.22. Every corner traces a finite open-loop lap: K 0.25 leaves contour
4.1e-1, E 0.03 leaves 2.8e-1, the combined softest corner 6.1e-1 — honestly floppy
machines, not broken ones. The E ceiling is not taste but the lattice's CFL gate:
c_p = 0.544 at E 0.22 against the 0.577 limit, and E 0.3 would be refused at build.
Either slider rebuilds the plant and clears every learner on the tab, because a
compliance constant, a pilot, a learned geometry and three ILC tables all belong to
exactly one machine.

## Brick 44 — the softest corner: two observer lessons, an ILC safeguard, and a basis null

Three reports in one session, all at the new compliance sliders' bottom end, all
measured to ground.

### ⑥ refused at K 0.25 / E 0.03, and it took two fixes because the first exposed the second

Localised immediately: at the same corner ⑤ with analytic routing deploys (verify
2.80×) while ⑥ refuses (0.98×) — the failure is in the learned pieces. **Defect one:
the fixed 2200-step gather settle was tuned on a stiff machine.** At the soft corner
the tool was still ringing 7.4e-2 (max 0.32) when "settled" readings were taken, and
the inverse fitted ring, not geometry: holdout 2.2e-2 rad, 100× the stiff figure. The
fix is the settle every other instrument here already uses — hold until the tracker is
measurably QUIET (span of the last 400 readings under 2e-3, capped) — and it reads
7.5e-4 rad at the soft corner while making a stiff gather FASTER.

**And the good map made the verify WORSE — 0.98× → 0.48× — which is what exposed the
real defect.** The clamp was the suspect and the instrument cleared it (rule 14): only
3.7% of steps left the hull, and the learned truth correlated 0.87 with the analytic
truth. The cause was CURVATURE: the routing evaluated a degree-5 polynomial at the
MOVING TOOL, and a nonlinear map of the fast variable has a gain that changes along
the trajectory — which breaks the LTI assumption the QP's response model rests on.
Invisible at stiff (the tool never leaves the settled manifold's neighbourhood), fatal
at soft. The fix is the **affine observer**: truth = G(cmd) · (tool − fwd(cmd)), the
forward map and the inverse gradient both learned from the same pairs and both
evaluated at the COMMAND — in the training domain by construction — so the tool enters
linearly. Measured at the corner: r² 0.75/0.59 → **0.99/0.85** (identical to the
analytic observer) and verify 0.48× → **5.02×** — deploying with more margin than ⑤'s
own 2.80× there. An instrument must not merely fail gently; used inside a linear
control loop it must BE affine in the fast variable.

### The ILC divergence is the gearbox, and the safeguard's endpoint is exactly open loop

"ILC makes control much worse over time with the more flexible link" — measured, the
axis is the GEARBOX: soft links alone converge over 30 laps (K 16 / E 0.03: 2.8e-1 →
3.2e-2), but a soft gearbox adds a slow, lightly damped lag the fixed 500-step lead
does not cover, and the table pumps: K 1 / E 0.03 climbs to 1.07 and keeps going;
K 0.25 / E 0.03 reaches **5.25** with the arm flailing. Every learning table on the
tab now carries a **monotone safeguard**: snapshot the table that PRODUCED the best
lap (the first ordering snapshotted post-fold and latched on a never-validated table —
measured, then fixed), and when a lap regresses past 1.6× that best, halve the gain,
restore the snapshot, and hold a **settling dwell** until the tool is quiet — the
anti-slosh tab's lesson, needed here because a bad lap KICKS the machine into a
backlash limit cycle that persists under open-loop driving (measured: continuous open
loop at the soft corners runs 6.37e-1 / 1.21 lap after lap, against 4.0e-1 / 6.1e-1
for a first lap from rest — the machine itself sustains the ring). After three
backoffs the table FREEZES, empty unless its best lap clearly beat its first, and the
panel says so. The endpoint was verified against the continuous open loop and matches
it to the third digit: never worse than switching iteration off, invisible on any
converging ladder (zero backoffs at every healthy corner), honest refusal where the
lead cannot serve the plant.

### And the basis question: the pilot's forecast is linear, measured to stay so

Asked whether the new modes carry NGRC's full nonlinear form. The learned GEOMETRY
does — a degree-7 polynomial map is precisely the polynomial-basis idea, applied to
the variable that is actually nonlinear. The pilot's FORECAST is linear lag taps, and
the quadratic expansion was measured rather than assumed: NGRC monomials on a reduced
tap window (121 → 374 features), same records, the pilot's own block-split holdout,
three ridges, both stiffness corners. It loses everywhere — mildly at lead 0,
catastrophically at far leads (held-out R² to −22). The same shape as FlowSim's
poly-2-online null: a basis the data cannot support is variance, and this plant's
response to its channels is linear enough that the right lag window carries it. The
nulls table gains a ninth row; the nonlinearity stays where it was measured to belong.

## Brick 45 — the correction cap was a ceiling, and saturation was feeding the limit cycle

Reported: ⑥ performs poorly at the softest sliders. Attributed before optimising, and
the attribution overturned the plan. At K 0.25 / E 0.03, contour rms over three laps:

  open loop (analytic ik)        6.2e-1 → 1.20 → 1.20
  learned geometry refs alone    5.4e-1 → 1.11 → 1.11
  ⑥ full (geometry + pilot)      4.2e-1 → 6.4e-1 → 6.2e-1

**THE LEARNED GEOMETRY BUYS 8% HERE**, against the 14–44× it measured statically
(brick 40) — because at this corner the error is DYNAMIC, and a map fitted at held
poses does not contain it. And **every mode DEGRADES lap over lap** rather than
settling, which is the tell that mattered.

The cause is authority: `uMax` was a fixed 0.15 rad while wind-up goes as 1/K, so at
64× softer the engineer's cap had quietly become a ceiling — the correction sat at the
cap for **26.5% of the lap**, and a saturated correction cannot damp the backlash limit
cycle it is fighting. Released, it wants 0.457 rad, the error settles at **3.2e-1** and
the ladder goes FLAT (3.1e-1 / 3.3e-1 / 3.2e-1). The degradation WAS the saturation.
The cap now scales with the plant, anchored so the stiff machine is bit-for-bit
unchanged (K 16 → 0.15) and bounded at 1.0 rad; guards, workspace and the verify gate
are untouched, so a larger cap widens what the pilot may ASK for and changes nothing
about what it must prove.
**THE PILOT'S OWN VERIFY COULD NOT SEE THIS**, which is the generalisable part:
commissioning excites a smaller envelope than a production feed, so a cap that binds
on the program need not bind on the scribble the verify round scores.

ALSO DIAGNOSED, NOT YET FIXED: `Ts` is the FIRST crossing of 90% of DC — rise time, not
settle time. On an underdamped plant it undershoots: measured 2012 against a true
2%-settle of 3266 (1.6×), so the horizon is 1.6× short at this corner.
LEDGER: 1.20 → 0.32 is 3.8× of a 20–100× ask. One blocker, not the blocker.

## Brick 46 — one number was answering two questions

Avenue 2 from the soft-corner ledger: `Ts` was the FIRST crossing of 90% of DC, which
on an underdamped plant is the rise INTO the first overshoot — the machine is called
settled while it is still ringing. Measured: stiff 1924 against a true 2%-settle of
2695, softest gearbox 1476 against 3266 (2.2×). Since the horizon, the sample rate, the
grid and the fit stride all derive from that one number, a short read shortens the plan
exactly where the plant needs it longest.

**REPLACING IT WHOLESALE IMPROVED THE STIFF MACHINE AND KILLED THE SOFT ONE** — rounded
2.178e-2 → 2.058e-2 and circle 1.019e-2 → 9.466e-3, but at K 0.25 / E 0.03 the pilot's
own verify fell 4.62× → **0.99× and REFUSED**. The settle is 1.6× the rise there, so
the sample period coarsened 8 → 14 steps and the loop stopped seeing its own dynamics.
Two different questions: the SETTLE says how far ahead a plan must reach; the RISE says
how fast the loop has to be sampled. The horizon now uses the measured settling time
(`Tset`) and every other cadence keeps the rise-based `Ts`.

  soft corner (K 0.25 / E 0.03)   3.24e-1 → **2.46e-1**, deploys 3.71×, bias −0.12 →
                                  −0.05, and the ladder now IMPROVES lap over lap
                                  (3.18e-1 → 2.46e-1 → 2.46e-1) instead of holding
  stiff default                   rounded 2.161e-2, circle 1.019e-2 — every gate passes

Note for later: the stiff machine's gain in the wholesale version came from the COARSER
sample, not the longer horizon (with the split it is back to 2.161e-2). The sample rate
is therefore its own lever, unmeasured.
LEDGER at the soft corner: 1.20 → 0.246 is 4.9× of a 20–100× ask.

## Brick 47 — the excitation could not spring-load the arm, so the plan could not preempt

Watched on the device: drawing the rectangle counter-clockwise, the arm comes down with
gravity, shoots past the corner nearest the base, spring-loads, and the next two sides
fight the ring. The owner asked whether the tuning moves ever load the spring, and
whether something control-side has to REWARD a preemptive move.

Binned around the lap, the observation is exact — quiet arcs 0.07–0.12 against loud
arcs 0.46–0.61, a **6–8× localisation**, with the loud stretch about one ring period
(~2600–3400 steps on the shoulder) long. The elbow barely rings at all: one zero
crossing.

**THE PILOT NEEDS NO NEW REWARD TERM, AND THE MEASUREMENT SUPPORTS THAT.** The horizon
already covers 1.4–1.9 ring periods, and an MPC minimising predicted error over a window
that reaches past an event will leave the path early to avoid it — that IS the
objective. What suppresses the preemptive move is uncertainty: least squares shrinks
toward zero where it cannot predict, so a model that never saw the arm ring produces a
TIMID optimal action. Ignorance, not the cost function.

**AND THE OWNER'S HYPOTHESIS WAS RIGHT, WITH A NUMBER.** Commanded-acceleration band
power at the shoulder's ring frequency: the part program carries **2.7× more than the
excitation does**, while matching it in overall rms. Filtered noise under a jerk limit
is broadband but SMOOTH, and smooth is what the tune loop rewards — so the energy sits
below the mode that matters. A log **frequency sweep** now rides on the noise, its band
taken from the pilot's own measured settling time.

THREE THINGS HAD TO BE MEASURED INTO SHAPE, and each failed silently first.
(i) The sweep's share was halved on every noise-tune failure — and this plant's jerk
limit needs NINE tune iterations, so the share reached zero and the built series was
BYTE-IDENTICAL to the old one. A sine's derivatives are closed form, so it is sized to
fit its share before a sample exists and never needs tuning at all.
(ii) Normalising the noise to a reduced span to make room FAILED THE COVERAGE CHECK —
24 attempts refused with cause `limits`, span 0.75 of the box against a required 0.85.
The composed series is re-normalised instead.
(iii) **THE FIRST BAND WAS THREE OCTAVES AND IT BOUGHT NOTHING** — 2% more in-band
energy, error profile unchanged. Amplitude is bounded by the rate limits at the FASTEST
frequency swept and acceleration goes as Aω², so reaching to Tset/8 costs a factor of
16 in what the sweep may be worth. One octave each way around Tset brackets the mode
and buys the amplitude back.

Measured, K 0.25 / E 0.03: contour **2.46e-1 → 1.97e-1**, verify **3.71× → 5.97×**, and
the bias vanishes (−0.052 → +0.018). Per-arc, most of the lap collapses (bin 8 5×,
bin 4 6×) — but the near-base corner itself goes 0.46 → 0.55 and is now the single
dominant term, which is the owner's corner, isolated.

**THE SWEEP IS NOT FREE AND SHIPS CONDITIONAL.** It takes a quarter of the rate budget
the broadband noise would spend, and on a machine with no lightly damped mode that is a
pure loss: measured on the stiff default, an unconditional sweep cost 7% (rounded
2.161e-2 → 2.318e-2). The probe already says which machine it is — zero crossings of the
response about its own settled value — so the pilot decides rather than the engineer.
Two or more crossings is a mode. Stiff is restored bit for bit (2.161e-2 / 1.019e-2).
LEDGER at the soft corner: 1.20 → 0.197 is 6.1× of a 20–100× ask, and it is now ONE
corner rather than a whole lap.

## Brick 48 — the same pilot on a plant that shares nothing with the arm

The claim the flagship makes is that route–limit–run–deploy is generic. `test/pilot/
tanks.test.mjs` is that claim under test, and it is only worth anything because
`lib/pilot/` gained EIGHT LINES, all of them passing one option through — no plant
hook, no special case, no constant that suits an arm.

**THE PLANT IS THE QUADRUPLE-TANK PROCESS** (Johansson 2000), the standard benchmark for
multivariable difficulty: liquid level from pump voltage, no inertia anywhere, nonlinear
by Torricelli (gain falls as a tank fills), cross-coupled through the upper tanks so each
input reaches both outputs by two paths, and a valve split that decides its ZERO. Units
are centimetres and volts, the timescale is minutes, the program is a RECIPE — hold,
ramp, hold — and the pilot is told none of it. Four measured signals where the arm routed
six; two correction channels; truth in cm against corrections in V, which needs no
conversion because the probe measures d(truth)/d(u) itself.

### What transferred, unchanged

It measured a timescale on a plant with no inertia (Ts 2000, Tset 2613), chose its own
windows and ridge on held-out data, correctly asked for NO frequency sweep (rings [1,1] —
a tank has no mode), respected the guard and the cap, and put itself in front of the
machine before deploying. **Recipe level error 0.506 → 0.344 cm rms, 1.47×**, worst
excursion 1.17 → 0.80 cm.

### THE NULL THAT WAS A PROPERTY OF THE ARM, NOT OF THE OPTION

`dwell` warps the excitation's time base so it lingers as well as sweeps. It measured
null-to-negative on the arm and shipped off — and the reason turns out to be that a
TOOLPATH NEVER STOPS. A process recipe holds a level between ramps, so the pilot had
never seen a stationary command on a plant whose program is half stationary:

  excitation without dwell   verify 2.75× · recipe 1.03× · worst 1.33 cm · u peak 0.466 V
  excitation WITH dwell      verify 5.62× · recipe **1.47×** · worst 0.80 cm · u peak 0.282 V

A 1.43× improvement that also uses LESS authority, which is what separates learning from
shoving. Default stays false, because the arm's measurement stands; it is now an option
with both halves of its evidence written down. This is the entire argument for testing a
second plant: a null measured on one machine is a null about that machine.

### THE CAP IS AS DECISIVE HERE AS ON THE ARM

At 0.35 V the correction pins at the cap and the recipe gets **WORSE** — 0.506 → 0.839,
i.e. 0.60×. Same failure shape as the soft gearbox in brick 45, on a plant with no
gearbox in it.

### AND THE REFUSAL CONTRACT WORKED ON A PLANT NOBODY WROTE IT FOR

With gamma1+gamma2 < 1 the plant is NON-MINIMUM PHASE: raise a pump and the level it
controls first FALLS. No feedforward inverse can cancel that. The pilot cannot know what
a right-half-plane zero is — and does not have to: its verify round measured **0.91× on
its own scribble, declined, and the recipe ran untouched at exactly 1.000×**.

### THE ONE REAL LIMIT THIS EXPOSED, and it is in the gate

The verify reported **5.62× against the recipe's 1.47× — a 3.8× overstatement**. The
verify scribble is drawn from the EXCITATION's distribution, so it measures the
commissioning regime; on the arm that regime and the program's happen to agree, and here
they do not. It remains the right gate — it refused the non-minimum-phase plant
correctly — but it is an optimistic estimate of program benefit rather than a prediction
of one, and this is where that was first measured. A check now records it rather than
letting it pass unnoticed.

## Brick 49 — the third plant, and five statistics that only worked because nothing was noisy

The arm and the tank process differ in every physical way and still agreed on four things
the pilot had never been tested without: two channels, no transport delay, NOISELESS
measurements, and an actuator that pushes both ways. `test/pilot/thermal.test.mjs` is a
three-zone extruder barrel with none of them — three channels from three signals (the
leanest routing yet), 60 steps of pure transport delay, 0.35 K of thermocouple noise on
every reading, an unmeasured ambient drift, and heaters that cannot remove heat.

**THE NOISE BROKE FIVE PROBE STATISTICS, AND ALL FIVE HAD THE SAME SHAPE:** a quantity
computed over a long record, compared against the wrong notion of uncertainty. On the
first run the pilot reported a settling time of **60199** on a plant that settles in
about 1500, **4224 rings** on a diffusion chain that cannot oscillate at all, and a
horizon of 1673 grid points; the probe never went quiet, so it ran to its absolute cap on
every channel — **253398 steps, 70 hours of process time** — and then refused the plant
for unidentifiability while its own readouts were fitting at R² 0.85–0.98.

  1. **the quiet detector** used raw total variation, which grows with the record on any
     noisy signal and never falls below a fraction of the range. It now measures a
     boxcar-smoothed series: has it stopped MOVING, as against stopped jittering.
  2. **the settling time** was "the last sample outside a band" — an extreme-value
     statistic. Over 60000 samples a 4σ excursion is expected several times and the LAST
     one lands near the end of the record. Smoothed, with the band tightened by √W.
  3. **the ring counter** counted sign changes of a raw signal about its own mean, which
     is a noise counter. Smoothed, gated on the swing clearing the band, and counted
     only INSIDE the settling window, because a ring is part of a step response.
  4. **identifiability** compared `dc` — the MEAN of the response's tail — against a
     SINGLE reading's noise, which is too strict by √N. Averaging is precisely how you
     tell a small response seen through a noisy instrument from a correction that never
     arrives.
  5. **the probe hold** had only an absolute escape. A plant under a persistent
     disturbance never goes quiet — correctly, because it IS moving, just not because of
     the probe — so the hold now also ends once the record holds ten rise times.

Two further bounds fell out: the settle cannot exceed six rise times (a record claiming
forty is describing the environment, not the plant — every plant here that settles
honestly reads 1.3 to 2.2), and a mode must OVERSHOOT, because sign changes alone cannot
separate "my step made it ring" from "something else is moving it".

### What it cost the plants that already worked, stated rather than buried

The probe changes are correctness, and they still moved the noiseless plants: the arm's
rectangle 2.161e-2 → 2.252e-2 (6.21× → 5.96×) and the tank recipe's dwell A/B 1.47/1.03
→ 1.32/1.11. Every gate still passes. The tank gate that froze the measured multiple was
relaxed to the property it exists to defend (rule 4, from the other direction).

### AND THE PLANT ITSELF DEFEATED THE PILOT, WHICH IS THE CONTRACT WORKING

With the machinery repaired it commissions cleanly on all three channels, puts the dead
time into its measured timescale, chooses ridge 1e-5 on every zone (the first plant here
where regularisation had observation noise to regularise), and then **measures 0.94× on
its own verify round and REFUSES**. The changeover runs untouched at exactly 1.000×. The
tank process reached the same answer for a different reason — a right-half-plane zero —
and in both cases the pilot got there from measurements alone, with no idea what a dead
time or a zero IS. A host that keeps feeding a refused pilot is now a no-op rather than
a crash.

### THE OPEN FINDING, with the numbers that would falsify it

`dc` is the mean of the response's tail, and EVERY probe statistic is normalised by it,
so an unmeasured drift comparable to the probe's own response destabilises all of them
together. Across three probe amplitudes on this same plant the measured rise read
**2354 / 2219 / 306** steps and the overshoot **1.36 / 1.42 / 0.00**. The classical
answer is a DIFFERENTIAL probe — step up, step down, difference the two, and anything
slower than the probe cancels exactly. NOT BUILT; the test's drift is scoped below the
probe response so the rest of the file measures what it claims to.

## Brick 50 — a published benchmark, and the gate that certified a controller which harms

The first four plants were ours, so "6x better" was measured against a baseline we also
wrote. `test/pilot/woodberry.test.mjs` is not: the **Wood–Berry binary distillation
column** (Wood & Berry, 1973) is the standard 2×2 benchmark of the process-control
literature, its model is quoted identically across decades of papers, and the
decentralized PI everyone compares against — **Luyben's BLT tuning** — has published
gains, `diag(0.375 + 0.0452/s, −0.075 − 0.00318/s)`.

  G(s) = | 12.8 e^−s /(16.7s+1)   −18.9 e^−3s/(21s+1)   |
         |  6.6 e^−7s/(10.9s+1)   −19.4 e^−3s/(14.4s+1) |

Four dead times including **seven minutes on a cross path**, four different lags, and a
published relative gain near 2 — every move on one loop lands on the other one late and
out of proportion.

### The rig is validated before anything is claimed from it

Our BLT implementation on our stated scenario measures **IAE 51.95 against the published
55.34** — within 6%. The plant, the baseline gains, the anti-windup and the IAE
convention are therefore the ones the papers used, which is what makes every other
number here mean something.

### Where we stand, and it is behind

  steady-state inversion only   43.90
  Luyben BLT decentralized PI   51.95      [published: 55.34]
  the pilot                     72.08      0.72× BLT
  published bar                 28.9 vs BLT's 55.34 on its own scenario — **1.91×**

**The pilot LOSES on this plant**, to the published baseline and to a plain model
inverse, and no correction cap changes it: measured at 0.15 / 0.4 / 0.8 / 2.0 the IAE
reads 91.4 / 72.1 / 70.4 / 76.5. Not saturation, not the cap. (A second honest finding
falls out: on setpoint tracking with a perfect model, a plain steady-state inversion
beats the classical robust tuning — BLT is deliberately detuned, which is precisely the
gap MPC exists to close.)

### THE SERIOUS PART IS THAT THE GATE CERTIFIED IT

The verify round is the pilot's entire safety contract — it exists to refuse a
controller the machine has not vouched for. On the runs measuring **0.72×** on the
benchmark it reported **5.81×, 13.40×, 18.20×, 22.88×**. The tank process had already
shown this gap at 3.8× and it was written up as an optimistic estimate; here it is
eight- to thirty-fold and it is the difference between refusing and deploying something
that makes the plant worse.

**One partial repair shipped.** The verify built filtered noise even when the excitation
had been told the program holds still — it now inherits `dwell`. On the tank process
that closed the gap from a 3.8× OVERSTATEMENT to a slight understatement (verify 1.15×
against a measured 1.32×), which is the safe direction for a gate. On Wood–Berry it is
not sufficient: still 8×.

**And one repair measured and REVERTED.** Doubling the verify segment when dwelling — to
answer the builder's own "More time" refusal on the barrel — moved every plant the wrong
way at once: the tank's agreement 0.87× → 2.89×, Wood–Berry 8× → 19×, and the barrel
went from honestly refusing to deploying a controller that harmed it. A longer verify
segment is a different measurement, not a better one.

### The open finding, stated with what would falsify it

The verify scores a scribble drawn from the EXCITATION's distribution; a program is
steps and holds, and on a plant with four dead times the response to a step shares
almost nothing with the response to a scribble. The arm is simply the plant where those
two regimes agree, which is why this survived four bricks. The repair is to score the
verify on a program-like regime and probably to gate on the WORST of several regimes —
real machinery that has to be re-validated on all five plants, so it is recorded rather
than patched blind. The benchmark test asserts the gap exists, so the day it is fixed,
that check fails and says so.

## Brick 51 — a cold mill, a prediction stated in advance, and the prediction was wrong

The Wood–Berry column found the boundary. This was meant to be the other side of it: a
single 4-high cold rolling stand, whose dominant disturbance — ROLL ECCENTRICITY, a
periodic gap error at backup-roll rotation frequency — is exactly the repeatable,
forecastable structure four plants had identified as the pilot's wheelhouse. The
prediction was written into the file BEFORE the run: it should win here, and win largest
against the baseline famous for failing.

**IT DOES NOT. Its verify measures 0.42×, it declines, and the mill runs untouched.**

### The benchmark itself is sound, and reproduces the industrially famous result

  mill spring   h = S + F/M      plastic curve   F = Q(H−h)      M 500, Q 250 kN/mm

The gaugemeter (BISRA) AGC infers the exit gauge as h_hat = S + F/M from signals
available with no delay, and it is excellent against entry-gauge variation. Against
eccentricity the algebra gives h_hat − h = **−e** exactly: the estimate moves OPPOSITE
to the truth, so the gaugemeter sees the strip getting thin precisely when it is getting
thick and closes the gap further. Measured over 40 s of rolling, 30 µm of eccentricity
at 1.22 Hz, X-ray gauge 200 ms downstream (µm rms / worst):

  no AGC (fixed gap)             15.15 / 29.97
  gaugemeter (BISRA) AGC         **18.08** / 29.04     — WORSE than nothing, by 1.19×
  monitor AGC (X-ray, delayed)   14.00 / 25.85         — honest but late, buys 8%
  the pilot                      15.15 / 29.97         — refused, so untouched

Both classical results are asserted, so the plant cannot quietly stop being a benchmark.

### Four routings, three of them genuinely wrong, and none of them the answer

Recorded because each is a mistake a real integrator would make. The X-ray gauge was
compared against the target implied by the command NOW rather than the command 200 ms
ago — strip tracking, which every mill does. The gauge was READ TWICE per sample, so the
model and the truth it was asked to predict carried independent noise; the pilot
reported exactly that ("nothing about the truth is predictable from these signals") and
was right. And the routed slew limit sat BELOW the disturbance's own 4.6e-4 mm/step, so
the excitation could not carry energy where the disturbance lives — brick 47's lesson,
missed again in a new costume. Fixing all three moved the verify from 0.40× to 0.42×.

### What this costs the claim, stated rather than absorbed

The pilot's wheelhouse is narrower than four plants had suggested. Every win it has —
the arm's droop and wind-up, the tank recipe, the chain — is a repeatable error that is
a FUNCTION OF THE COMMAND, which the forecast reaches through the reference it is given.
It has not been shown to win where the repeatable error is an EXOGENOUS RHYTHM the
command does not explain, and roll eccentricity is exactly that: the roll turns whether
or not the mill is asked to do anything.

NOT RULED OUT, and left as the next attempt's starting point rather than a conclusion:
the lag window is sized from the PLANT's settling time (~240 steps here) while the
disturbance has a timescale of its own (410 steps), so the window may be too short to
carry its phase. The experiment that would settle it — sweeping the disturbance period
against the window — was attempted and did not run (a broken shell substitution left
three identical runs), so it is a hypothesis and is labelled one.

**AND THE REFUSAL IS WORTH SOMETHING ON ITS OWN.** Declining is what avoids the 1.19×
penalty the classical gaugemeter pays on this plant. Three plants in a row — the
non-minimum-phase tanks, the barrel, and now the mill — the gate has correctly said no
from measurements alone, on failure modes nobody described to it.

## Brick 52 — a real machine, real measurements, and the pilot comes fourth of six

Every plant the pilot had met was written here or transcribed from a paper's transfer
function. This one is hardware: the **EMPS** (Electro-Mechanical Positioning System), a
prismatic joint of the kind that drives a robot axis or a machine-tool slide — DC motor,
low-friction ball screw, incremental encoder — published as a nonlinear system-ID
benchmark by A. Janot, M. Gautier and M. Brunot, *Data Set and Reference Models of EMPS*,
2019 Workshop on Nonlinear System Identification Benchmarks, Eindhoven. `DATA_EMPS.mat`
(sha256 `6cf6814a…07facf7e`, 626039 bytes) holds 24841 samples at 1 kHz of the reference,
the encoder and the controller output, plus the machine's own constants. It is not
vendored — third-party data an order of magnitude larger than this repository's source —
so `test/pilot/emps.test.mjs` carries everything measured out of it instead.

### The rig is validated against the machine twice before it is used for anything

**Our IDIM-LS recovers the published parameters.** Butterworth `filtfilt` at 100 Hz,
central differences twice, least squares of `gtau·vir` on `[q̈, q̇, sign q̇, 1]`:

| | M | Fv | Fc | OF |
|---|---|---|---|---|
| measured here | 95.0856 | 205.117 | 20.228 | −3.181 |
| published | 95.1089 | 203.503 | 20.394 | −3.165 |

0.02% / 0.8% / 0.8% / 0.5%. The benchmark also ships an "asymmetric friction" script;
it fits Fc⁺ = 17.047 and Fc⁻ = −23.409 instead of Fc and an offset, whose half-sum and
half-difference are exactly Fc and OF and whose residual is identical to six figures. It
is a **reparameterisation, not a refinement**.

**The closed loop reproduces the recorded motion.** Driven by the recorded reference the
rig tracks the recorded encoder to **1.6 µm rms / 11 µm peak over 25 s**, and its
tracking error is 0.5812 mm rms / 0.8517 peak against the machine's recorded
0.5814 / 0.8522 — **0.03%**.

### What the record says before any controller is proposed

- The shipped cascade leaves **0.5814 mm rms, 0.8522 mm peak**.
- The reference is **exactly periodic at 6240 samples** (residual 1.7e-16 m) — four laps
  of a three-speed trapezoid, i.e. a production program, not an identification sweep.
- The error is **99.95% repeatable**: lap to lap it differs by 0.3 µm rms out of 581.
  That is the premise of every learning controller in the file, measured on hardware
  rather than assumed, and it puts the ceiling for a command pre-distortion near 1900×.
- **One millisecond of latency is worth 0.125 mm of it.** The loop compares the encoder
  against the PREVIOUS tick's reference; simulating that one-sample shift moves the peak
  0.7272 → 0.8518 mm and the rms 0.4926 → 0.5812, onto the recorded numbers exactly.
  Without it the rig is 15% optimistic.

**The control law was not published with the data and was recovered from it.** Three
candidate cascades scored against the recorded `vir`: two are hopeless (7.4 V and 22.5 V
rms residual against a 1.54 V signal) and one is exact —
`vir = kv·(kp·(qg − qm) − dqm)` with `dqm` a backward difference of a 2-tap average —
**0.0037 V, 0.24% of the signal**.

**The friction is the machine's own.** `gtau·vir − M·q̈` binned by velocity over the whole
record IS the friction curve, and it is what the plant uses. It is not the four-parameter
shape: near zero velocity the model over-predicts by up to 5 N and at the extremes by 4 N.
Binning the leftover by POSITION found nothing (±0.6 N, no trend), so friction here is a
function of velocity and the plant is written that way.

### Where the pilot stands: fourth of six

Tracking error over the program, mm rms:

| controller | rms | ×shipped | what it needs |
|---|---|---|---|
| as shipped, cascade P/P | 0.5764 | 1.0 | nothing |
| **the pilot** | **0.1204** | **4.8** | **nothing** |
| + velocity feedforward | 0.0380 | 15.2 | nothing (a drive feature) |
| ILC, Q width 21, best of 12 laps | 0.0049 | 119 | a Q filter, tuned by hand |
| + inverse-dynamics feedforward | 0.0021 | 275 | M, Fv, Fc, OF identified |
| the machine's own repeatability | 0.0003 | 1900 | — (the floor) |

**The reason is the plant, not a defect.** This machine HAS a closed form, it has four
parameters, and its authors published them. The anti-slosh tab reached the same
conclusion from the other side — learn the parameters that have no closed form, COMPUTE
the ones that do — and EMPS is the cleanest test of it: the lattice arm the pilot wins on
has distributed flexibility, a pose-dependent inertia and no closed form for its tip
error; here a first-year textbook model beats every learner in the file. **A prediction
was stated before this was built** — friction-dominated tracking would be the pilot's
wheelhouse, because friction error is a function of commanded velocity — **and it was
wrong for exactly that reason**: so is the feedforward's model, and the feedforward's is
right to a couple of newtons.

**The one thing the pilot has that the winner does not** is that the ILC's Q filter is a
design, not a detail. Six widths at learning gain 0.7, best / after-40-laps in mm rms:
w1 0.0177/63.8, w5 0.0167/94.6, w11 0.0134/70.7, **w21 0.0047/0.0049**, w41 0.0103/0.0103,
w81 0.0253/0.0253 — **three of six diverge**, and the wrong choice leaves the machine a
hundred times worse than doing nothing with nothing in the loop to say which you have.
That is the failure the pilot's commission-and-refuse contract exists to remove, which
makes the next two findings the serious ones.

### Defect 1 — the cadence has a 200-step floor, and a 1 kHz servo is the first plant fast enough to trip it

The probe measures this machine correctly: `h.Ts` 17 steps, `h.Tset` 45, dc 1.0000,
overshoot 1.199 — matching a direct step test on the rig (rise 15, peak 1.199 at step 26).
Then `_deriveCadence` does `Math.max(...hs.map(h => h.Ts), 200)` and the measured 17
becomes 200: Ts 222, grid 7 steps, fit stride 12, for a loop that settles in 45. Arm,
tanks, barrel, column and mill are all slower than 200 steps, so the floor had never
bound and had never been questioned.

Measured by lowering the floor and forcing the deployment:

| floor | Ts | grid | N | verify | delivered |
|---|---|---|---|---|---|
| 200 | 222 | 7 | 48 | 28.68× | 4.79× ← as shipped |
| 100 | 111 | 4 | 42 | 1.45× | 6.95× |
| 50 | 56 | 2 | 42 | 1.23× | 12.24× |
| 40 | 44 | 1 | 68 | 1.04× | 15.38× |
| 30 | 33 | 1 | 68 | 1.04× | 15.55× |
| 20 | 22 | 1 | 68 | 1.05× | 13.96× |
| 8 | 19 | 1 | 68 | 1.05× | 12.70× ← the measured rise |

The floor costs **3.2×**, and the pilot's honest place in the table is 15.5× — level with
the velocity feedforward — rather than 4.8×. **It is not fixed, because at every floor
that helps the gate refuses**: lowering the floor alone takes this machine from 4.79× to
1.00×. The two are one piece of work.

### Defect 2 — the gate ranks these backwards, and on a well-tuned drive it certifies harm

Read the last two columns above together: as the cadence gets finer the delivered benefit
rises 4.79 → 15.55× while the gate's estimate falls 28.68 → 1.04×. The ORDERING is
inverted, so the gate certifies 28.68× for the configuration that delivers 4.79 and
refuses the one that delivers 15.55.

And with the drive's own feedforward switched on — commissioned and deployed on that same
machine, so nothing is stale:

| drive | baseline | with the pilot | the gate said |
|---|---|---|---|
| no FF | 0.5764 | 0.1204 (4.8×) | 28.68× |
| velocity FF | 0.0380 | 0.0345 (1.1×) | 3.74× |
| + ID FF | 0.0021 | **0.0090 (0.23×)** | 2.03× |

The last row is the one that matters: the gate is the pilot's entire safety contract, and
it approved a correction that degraded a working machine **4.3×**. The tanks showed this
gap at 3.8× and it was written up as optimism; the Wood–Berry column showed it at
thirtyfold; this is the first time the HARM has been measured on the machine.

**The cause is the recorded one, now with a mechanism.** The verify round scores a
filtered-noise scribble drawn from the excitation's own distribution at quarter rate
limits, so its timescale comes from the POSITION BOX and the declared rate limits and has
nothing to do with the plant. On this machine that makes it slow and smooth: a long
horizon tracks it well and a short one cannot see the end of it. The gate is measuring
horizon reach against an arbitrary timescale, not benefit on a program. The fix is to
score a regime the machine will actually run — steps, ramps and dwells at the plant's own
measured timescale — and to gate on the WORST of the regimes rather than on one. It is
the outstanding work on this pilot and it now blocks two improvements, not one.

## Brick 53 — the gate scored one regime and it was the wrong one

Brick 52 left two defects on the EMPS servo axis and said they were one piece of work.
They were.

### What the scribble actually was, measured rather than described

The verify round scores filtered noise. `channelNoise` is white noise through three
cascaded one-pole filters with a SINGLE correlation time `tc`, and the tune loop raises
`tc` by 1.35 until the peak first, second and third differences all fit under 0.8 of
their limits — then stops. Nothing sweeps; `tc` never varies within a run. The chirp
(brick 47) does sweep, but it is gated on `rings >= 2 && overshoot > 1.05` and
`_startVerify` never passed `chirpBand` at all, so **the verify never got the sweep even
when commissioning did**.

And the tune stops at the FIRST limit to bind. Because the builder demands the series
span 85% of the position box, that limit is always VELOCITY:

| | v | a | j |
|---|---|---|---|
| commissioning scribble, tc 1206 | **83.2%** | 19.7% | 10.8% |
| verify scribble, tc 7303, quarter rates | **78.5%** | 9.2% | 3.1% |
| the EMPS machine's own program | 99.7% | 100.9% | 1674% |

`tc` is therefore ≈ box/vMax. On EMPS the verify's fastest feature was **7303 steps —
longer than a whole 6240-step lap of the machine's own program**, whose ramps are 35–148.

### The fix is not a different corner frequency, it is a different shape

`buildProgram` generates what a machine runs: point-to-point TRAPEZOID moves separated by
DWELLS. That separates the two timescales the scribble fuses — the move LENGTH covers the
box, the RAMP is what the machine has to track — and the ramp comes from the LIMITS
ALONE: `t_ramp >= 1.875·vMax/aMax` and `>= sqrt(5.774·vMax/jMax)`, the peak first and
second derivatives of the C² blend. On EMPS that is 282 steps against the machine
program's 148, and it is invariant under the verify's quarter-rate reduction because
scaling all three limits together leaves the ratios alone. Measured, the program regime
uses **90% / 90% / 16%** of v/a/j and spans 93% of the box.

**An earlier guess said the verify should be sized from the plant's measured settling
time. The measurement says otherwise** — the ramp is a property of the limits, not of the
plant.

The gate now scores BOTH regimes on the same interleaved on/off plan and deploys on the
**worse** ratio. The scribble half runs FIRST and from the machine's own resting point,
so it is byte-identical to what the gate measured before and the program is strictly
added.

### Two bugs found on the way, both invisible until two regimes ran back to back

**The run-out was at the END of the plan and inside a scored segment.** `steps =
plan.length*segLen + 4000` put the excitation's approach ramp — when the machine is barely
moving — inside segment 0, which is an OFF segment. That deflated the OFF average on every
plant, always. It became visible only with two halves: the second half's first OFF segment
read 7.4e-2 against 1.9e-1 and 3.0e-1 for the other two on the tank, and the gate turned a
2.02× program into a 0.79× refusal. The pad is now at the FRONT of each half and unscored.

**The segment map was off by that pad.** A single `floor(i/segLen)` across the pair billed
4000 steps of one regime to the other's opening segment. Each half now has its own map.

### Then the cadence floor could finally go

`_deriveCadence` floored the measured rise at 200 steps. Every plant here is slower than
that, so it never bound — until a 1 kHz servo whose rise the probe measured correctly at
17. The floor is now **8**, enough for the grid and stride arithmetic to mean something;
whether the number means anything is what `identifiable` answers, and a probe that saw
nothing is refused anyway. Measured on EMPS, forcing the deployment:

| floor | Ts | grid | N | gate was | gate now | delivered |
|---|---|---|---|---|---|---|
| 200 | 222 | 7 | 48 | 28.68× | 7.98× | 4.79× |
| 100 | 111 | 4 | 42 | 1.45× | 2.00× | 6.95× |
| 50 | 56 | 2 | 42 | 1.23× | 1.64× | 12.24× |
| 30 | 33 | 1 | 68 | 1.04× | 1.35× | 15.55× |
| 20 | 22 | 1 | 68 | 1.05× | 1.36× | 13.96× |
| 8 | 19 | 1 | 68 | 1.05× | 1.37× | 12.70× |

**The two had to move together**: at every floor that helps, the OLD gate refused, so
lowering the floor alone would have taken this machine from 4.79× to 1.00×. With the new
gate the fine cadences clear the 1.1× threshold and EMPS ships at **12.70×**. Note the row
that is not the shipped one — Ts 33 delivers 15.55× — left alone deliberately, because
picking 33 would be fitting a constant to one machine, which is what the 200 was.

**And the faster cadence exposed a third bug immediately.** The dither's hold is
`2·grid·sample`, so it now switches 3.5× faster on the foreign SISO plant, jerks the servo
harder, and trips the guard a second time. The guard derated the RATE LIMITS and not the
BOX — so it then demanded the same span in the same duration at 0.49× the speed, and
`buildExcitation` refused with `these rate limits cannot traverse the position box`. The
box now derates with the limits, which keeps the traversal feasible AND reduces the
excursion that tripped the guard.

### Where it landed, on every plant

| plant | gate before | gate now | delivered | verdict |
|---|---|---|---|---|
| 2R arm | 2.6× | 2.59× | 5.96× / 6.87× | deploys — flagship unchanged |
| tanks, dwelling | 1.15× | 1.48× | 1.32× | deploys |
| tanks, non-dwelling | 3.62× | 0.59× | (1.11×) | now **REFUSED** |
| tanks, non-minimum phase | refused | refused | — | ✓ |
| extruder barrel | refused | refused | — | ✓ |
| Wood–Berry column | 5.81× | 2.08× | 0.72× | deploys, still loses |
| cold mill AGC | 0.42× | refused | — | ✓ |
| **EMPS, no feedforward** | 28.68× | 1.35× | **12.70×** | deploys |
| **EMPS + velocity FF** | 3.74× → deployed 1.10× | **0.96×** | — | now **REFUSED** |
| **EMPS + inverse-dynamics FF** | 2.03× → deployed **0.23×** | **0.05×** | — | now **REFUSED** |

**The last row is why this work happened.** Brick 52 measured the gate approving a
correction that made a fully-tuned drive four times worse. It now reads 0.05× and refuses.

**And the controllers did not move, only the estimates of them.** The tank's delivered
recipe figures are byte-identical before and after (1.11× and 1.32×) while its gate went
3.62× → 1.28× and 1.15× → 1.48×; Wood–Berry's benchmark IAE is 72.08 either way while its
overstatement fell 8× → 2.9×. A fix that had also moved the delivered numbers would have
changed the measurement rather than repaired the gate.

**The non-dwelling tank is now refused, and that is the gate working.** A model fitted on
an excitation that never holds still is not vouched for on a program that does. It is a
sharper form of the same finding the old peak-authority check made.

### What is still wrong, stated rather than absorbed

**The ordering is still inverted.** Read the last two columns of the floor table: the
estimate still falls as the delivered benefit rises.

**And on EMPS the error changed SIGN rather than went away.** The gate now UNDERSTATES by
9× (1.35× against 12.70× delivered) and clears its own 1.1× threshold by a quarter, on a
controller worth twelve. Understating is the safe direction; a gate that nearly refuses a
12.7× controller is not a good gate.

**A hypothesis, labelled as one because it could not be tested here:** both regimes run at
QUARTER rate limits (brick 43, chosen so the effort weight is priced on a trajectory like
the ones machines actually run), and the pilot's benefit on EMPS is dominated by the
velocity-lag term q̇/kp, which scales with speed while the friction term does not — so at a
quarter speed the predictable part of the error is a smaller fraction of it. Raising the
verify's rates to test this pushed the SCRIBBLE builder into a `cannot traverse the box`
refusal on this very axis, so it is recorded as unrun rather than as evidence.

## Brick 54 — the nonlinear features are selected, not decided

The pilot's header said its readouts are linear windows and that "a plant whose truth is
strongly nonlinear in the signals would reopen it". That was written from ONE plant. The
NGRC library has carried the machinery to settle it per plant since the AFM work — a
UNIVERSAL MAP under a STRUCTURED PRIOR, where the nonlinear block is ridged far harder
than the linear one so it has to earn its weights rather than merely be available — and
none of the pilot used it.

### Measured on six plants, best held-out R² of the linear basis against linear+quadratic

The quadratic block is products of a REDUCED base — the most recent lag of each measured
signal and the lead-0 command tap pair of each channel — under a prior that ridges it
100× harder, the AFM's own {lin, quad} shape.

| plant | channel | linear | +quadratic | |
|---|---|---|---|---|
| quadruple tank, sweeping excitation | 0 | 0.9661 | **0.9818** | quadratic |
| quadruple tank, sweeping excitation | 1 | 0.9354 | **0.9686** | quadratic |
| quadruple tank, dwelling excitation | 0 | **0.8397** | 0.7412 | linear |
| quadruple tank, dwelling excitation | 1 | **0.8043** | 0.7875 | linear |
| extruder barrel | 0 | 0.7288 | **0.7647** | quadratic |
| extruder barrel | 1 | **0.8450** | 0.8526 | linear (inside the band) |
| extruder barrel | 2 | 0.7898 | **0.8112** | quadratic |
| Wood–Berry column | 0 | **0.9641** | 0.9396 | linear |
| Wood–Berry column | 1 | **0.9487** | 0.9316 | linear |
| cold mill AGC | 0 | **0.0680** | 0.0178 | linear |
| EMPS servo axis | 0 | 0.9930 | 0.9933 | linear (a tie) |
| 2R arm | 0 | **0.9969** | 0.9913 | linear |
| 2R arm | 1 | 0.8330 | 0.8388 | linear (inside the band) |

**THE SELECTION TRACKS THE PHYSICS.** Every plant with an algebraic nonlinearity in its
state equations accepts curvature where its excitation exposes it — a quadruple tank
whose outflow goes as √h, a barrel that radiates as T⁴ — and every plant defined by
linear equations declines it. **Wood–Berry is the negative control**: it is transfer
functions and nothing else, and the fit says so on both loops. The arm, which is where
the original "linear by measurement" note came from, still chooses linear on both
channels — the note was right about the arm and wrong to be generalised.

### The tie-break is on the RESIDUAL, and that is what decides it

Rule 42 takes the smoothest candidate within 5% of the best measured score. On R² that
would discard the tank's quadratic block — 0.9818 against 0.9661 is inside any 5% band —
while the UNEXPLAINED VARIANCE it leaves is 0.0182 against 0.0339, **nearly halved**. A
forecast the QP inverts is worth what its residual is worth, so the basis is chosen on
`1 − R²` with the same 5% band and the LINEAR basis winning inside it, because it is the
cheaper one to evaluate every sample.

### And it overturned a shipped finding

Brick 48 measured a dwelling excitation beating a sweeping one on this dwelling plant, and
brick 53's two-regime gate agreed by refusing the sweeping one. **Both were reading a
linear basis.** A sweeping excitation visits the whole level range where √h curves, while
a dwelling one spends its time near operating points where the plant looks linear — so
the sweeping fit is the one that NEEDS curvature, and given it, the ranking reverses:

| | basis selected | delivered on the recipe |
|---|---|---|
| sweeping excitation | linear+quadratic | 1.11× → **2.07×** |
| dwelling excitation | linear | 1.32× (unchanged) |

**The dwell advantage was compensating for a basis that could not represent the plant.**
The tank's checks now assert the mechanism — that the configuration whose fit needs
curvature selects curvature, and that it is the one that wins — rather than the direction.

### What it cost, and what is kept honest

The nonlinear block lives in ONE place (`polyTerms`), because the fit builds its design
matrix in `_row` and the runtime rebuilds the same vector inline: the linear layout is
already duplicated between them, and duplicating a quadratic layout as well is how the two
silently disagree. Every readout reports its `basis`, `r2Lin` and `r2Poly`, so which way
each channel went is visible rather than inferred. The arm's flagship figures are
unchanged (5.96× / 6.87×), as are the column's IAE and the mill's and barrel's refusals.

## Brick 55 — the barrel had never been scored, and the ceiling is a model's, not a QP's

Two investigations, one small fix, and two avenues closed by measurement.

### A regime that cannot be BUILT is not evidence about the controller

The extruder barrel has refused since it was written, and the ledger recorded it as
"refuses (0.94×)". **There was never a 0.94×, or any other number.** `_startVerify` threw
before the verify existed: the barrel declares `dwell: true`, and a DWELLING scribble
cannot cross its 44 K box at the verify's quarter rates — the tune loop fails 21 times and
the builder correctly says `these rate limits cannot traverse the position box`. The
message names the limits, so it reads as a plant problem; it is a construction problem.

Measured on the same channels: `buildProgram` builds without difficulty (tRamp 295, 23–25
moves, 90/86/90% of v/a/j), and the barrel's own forecasts were never the issue —
**held-out R² 0.69 / 0.92 / 0.84, none gated.** The verify now scores whichever regimes
built and reports what was skipped. The barrel is finally scored: **0.86×, and it still
refuses** — but as a measurement rather than a construction failure. Forced deployment
confirms the refusal is right.

### The mill's forecast was being destroyed by its own fit target

Forced and un-gated, the mill produces 42.79 µm against 15.15 doing nothing, so the gate
is right. But the reason is not the plant:

| fit target | stride 3 | stride 10 | stride 20 |
|---|---|---|---|
| `eFree` (h-consistent, shipped) | 0.034 | 0.046 | 0.051 |
| **raw truth** | **0.467** | **0.676** | **0.730** |

`eFree` subtracts the probe response convolved with the dither. The mill's probe is
garbage — Ts 0, dc 1.07, and a **−1.27 inverse-response undershoot** from the 200 ms gauge
delay — so the subtraction adds four times more than it removes: **eFree rms is 4.16× the
truth's**. The truth is an exactly linear function of the recorded window (identity
residual 8e-4 against a truth rms of 1.5e-2), so R² ≈ 1 was always available. The
inflation ratio elsewhere: EMPS 0.99, tanks 0.96/1.02/0.77/0.89, Wood–Berry 0.99/1.00,
barrel 1.08/1.02/1.06. **A guard at 1.25 fires on exactly one plant.** Not built yet.

### Cross-coupling orders every remaining outcome

| plant | cross ÷ direct | outcome |
|---|---|---|
| 2R arm | ~0.005 | 5.96× |
| tanks, minimum phase | 0.49 / 0.55 | 2.07× |
| Wood–Berry | 0.52 / **0.97** | deploys and loses |
| tanks, non-minimum phase | **1.46 / 1.88** | refuses |

Below ~0.5 it works, near 1 it loses, above 1 it refuses. And the NMP tank's
inverse-response undershoot is only −0.11 against a cross of 1.88 — **it is a coupling
failure more than an RHP-zero one.** One thing that shrinks the job: the FORECAST is
already MIMO (`_row` carries every channel's command taps); only the INVERSION is SISO.

### Two avenues closed

**Identifying on the program instead of the scribble is much WORSE** — EMPS 12.70× →
3.93× (program only) and 3.56× (half and half). Repeated trapezoids are collinear;
identification wants broadband. So the split is right and now measured: **identification
wants the scribble, scoring wants the program.**

**And there is no distribution mismatch to fix anyway.** The scribble-fitted model scored
on program data reads R² **0.9957**, against 0.9908 on the scribble it was fitted to and
0.9976 refitted on the program itself.

### The ceiling is the model's residual, and memory does not have one

√(1 − 0.9957) = 6.6% of the truth's rms = 0.038 mm predicted residual, against **0.045 mm
delivered**. The pilot is AT its forecast bound — the QP, the cap and the horizon are not
the constraint. Reaching the ILC's 0.0046 mm would need R² = **0.99994**, sixty times less
residual variance, which a lag-window linear forecast will not reach.

Folding a phase-indexed residual table on top of the deployed pilot, EMPS, mm rms per lap:

```
ILC alone      0.5764  0.1737  0.0531  0.0176  0.0084  0.0069  …  0.0049
pilot + fold   0.0494  0.0206  0.0110  0.0080  0.0070  0.0068  …  0.0046
```

**12.7× frozen → 125× with memory** — and the honest half: the two converge to the same
floor. The pilot's model buys LAP ZERO (0.049 against 0.576, a 12× better first part) and
about four laps of head start, not a better endpoint. Model error on this machine is
~40 µm and lap-to-lap repeatability is **0.3 µm**: a factor of 130 sits between predicting
the error and remembering it, and the pilot only predicts.

**Why ILC is not simply the answer, and what makes this different:** three of six Q widths
diverge to 60–95 mm, a hundred times worse than doing nothing, and the width is a human's
guess. The pilot already measures everything that choice needs — the probe's impulse
response is the loop gain against frequency — so the learning gain and the filter cutoff
can be COMPUTED. Not built yet; it is the next brick.

## Brick 56 — feed the error back (no), tune the window (barely), cascade the pilot (yes)

Three ideas explored, two nulls and one that works.

### Feeding the control output and the error back in as inputs — measured, and it does nothing

The forecast row carries measured lags and command taps. It does not carry the applied
correction `u`, nor the error signal itself. Both were added as regressor blocks and
scored held-out at the mid and far leads:

| plant | base | +truth | +u | +both |
|---|---|---|---|---|
| EMPS servo | 0.9965 / 0.9956 | 0.9965 / 0.9956 | 0.9966 / 0.9956 | 0.9966 / 0.9956 |
| quadruple tank | 0.9743 / 0.8609 | 0.9685 / 0.7951 | 0.9733 / 0.7836 | 0.9676 / 0.7866 |
| cold mill | 0.0236 / 0.0277 | 0.0492 / 0.0508 | 0.0236 / 0.0277 | 0.0492 / 0.0508 |

**Nothing on EMPS, WORSE on the tank, and on the mill it doubles a baseline that was
broken for another reason.** The cause is structural: on every plant here
`truth = measured − fwd(command)`, and both are already in the row, so lagged truth is
ALREADY SPANNED — it adds collinearity, not information. Feeding it back would only pay
where the forward model is unavailable to the pilot, which is none of these. And it would
cost something real: `truth(k)` as an input makes the LEAD-0 readout degenerate, and
lead 0 is the number the gate uses to disarm a channel. Not built.

### The h-consistent target is now checked against the thing it cleans up

`eFree` subtracts the probe response convolved with the dither — right when the probe
response is right. The cold mill's probe reports Ts 0, dc 1.07 and a **−1.27
inverse-response undershoot**, all artefacts of a 200 ms gauge delay, so the subtraction
adds four times more than it removes: eFree's rms is **4.16×** the truth's. Every other
plant is 0.96–1.08, so a guard at 1.25 fires on one of six.

Measured on the mill: forecast held-out R² **0.062 (gated, disarmed) → 0.8807 (live)**.
It still refuses (0.54×), and the reason is now visible and different: **Ts 9, N 14 — a
fourteen-step horizon on a plant with a two-hundred-step measurement delay.** The probe
reads transport delay as inverse response rather than as dead time, so the horizon never
covers it. That is the mill's next defect and it is a different one.

### The window length is tuned now, and it earns its place once in six

`_mLag()`/`_fLag()` were the constant 12 from the first version and the tune never
searched them. An offline sweep said 40 taps beat 12 at every lead on EMPS — residual
variance 0.498 of the twelve's at lead 0 — worth about 1.4×.

**It did not survive contact with the inversion.** A joint window/ridge search picks the
LOOSER ridge, and on EMPS that is a better held-out fit (0.99305 against 0.98931) and a
**worse machine: 12.7× down to 10.2×**. Rule 42 — take the largest ridge within 5% of the
best — exists for a reason this measurement made concrete: **the QP INVERTS this model,
and a loosely-fitted one has larger weights whose inversion amplifies. Regularisation here
serves the inversion, not the fit.** So the basis choice compares residuals (brick 54) and
the ridge choice does not, and the two are now deliberately different rules.

With rule 42 restored the window stage changes nothing on EMPS, the tank, the barrel or
the column — and picks **24 taps on the cold mill**, the one plant where a longer window
was the original hypothesis. It was right all along and invisible only because that
plant's fit target was broken.

### A cascade of pilots — `lib/pilot/stack.js`

A pilot delivers its forecast bound and nothing better, so the way past it is a second
model of what the first one missed. `Stack` commissions ordinary pilots in sequence, each
with the layers below it deployed and FROZEN — so layer k's plant is (machine + layers
1..k−1), a fixed system, and each layer measures its own timescale on it.

| depth | trained trapezoid | **unseen sine** |
|---|---|---|
| 0 | 0.5764 | 0.3634 |
| 1 | 0.0454 | 0.0439 |
| 2 | 0.0258 | 0.0248 |
| 3 | **0.0194 (29.8×)** | **0.0140 (26.0×)** |

**THE SECOND COLUMN IS THE POINT.** A phase-indexed ILC table reaches 125× on the program
it learned and measures **0.55× on that same sine — it makes the machine worse.** The
cascade improves the unseen program by as much as the trained one, because every layer is
a plant model rather than a memory.

Per-layer forecasts on what reached them: **R² 0.991 → 0.777 → 0.514**, each vouching for
itself on the machine (verify 1.35× / 1.54× / 1.70×). And the timescale separation is not
engineered — layer 2 measured its own response on (machine + layer 1) and chose a LONGER
horizon than layer 1, N 95 against 68, because what layer 1 leaves is slower than what
layer 1 was built for.

A layer that cannot vouch for itself ends the stack: the next one would be commissioned
against exactly the residual this one just failed on. The summed correction is clamped
ONCE at the engineer's own cap and the binding is counted rather than hidden (zero over
the scored runs). **The cost is commissioning time, multiplied** — 70 s a layer on this
axis, 62 hours a layer on the extruder barrel — so depth is the engineer's decision, made
on what each layer's own gate reports.

### The two-regime gate had to change, and a verification hole let it ship broken

Brick 53 gated on the WORSE of the two regimes. That refused the 2R arm's LEARNED-
KINEMATICS system (⑥): scribble 0.89× against program 3.14×. Forced, ⑥ deploys and ⑦'s
circle ladder converges to **1.7e-3** — a real capability lost to the gate.

But program-only is not the fix either. On the non-minimum-phase tank the split is
scribble 0.33× / program 1.20× — the same shape — and deploying there was measured at
**0.61× on the recipe: actual harm.**

So the two regimes answer different questions. A PROGRAM is what the machine runs, so its
ratio is the BENEFIT. A scribble is a broad stress regime the machine never runs, so a
poor score there is narrowness rather than danger — but a BAD one is danger, and that is
all it may veto on. **The representative regime decides the benefit at the unchanged 1.1×
bar; every other regime holds a veto only below 0.85×.** The two measured cases sit at
0.89 and 0.33, either side of it, so the floor is not delicately placed.

**AND IT SHIPPED BROKEN FOR THREE BRICKS BECAUSE THE VERIFICATION HAD A HOLE.** A
full-tier test file run directly — `node test/pilot/ikfree.test.mjs` — SKIPS and exits 0
unless `SUITE=full` is set. Every post-brick check that ran those files bare therefore
passed vacuously, and the last genuine full-tier run was before brick 53. The failure was
found only when a real `--full` run finally happened here. Checking a full-tier file means
`SUITE=full node …`, and an exit code of 0 from one without it means nothing ran.

**One thing this did NOT resolve.** At the softest compliance corner (K 0.25, E 0.03) ⑥
is now refused: program 1.28×, scribble 0.25×. Two explanations fit and they need
different fixes — either the correction really is that narrow there, which is what the
veto exists for, or the scribble is not a valid measurement at all because ⑥'s truth is
routed through a LEARNED map with a limited validity hull that a broad scribble leaves,
in which case the 0.25× scores extrapolated truth rather than the controller. The
soft-corner section commissions and never scores a program, so there is no delivered
number to appeal to. The check records the refusal and both candidate explanations rather
than asserting either.

## Brick 57 — the gate is opt-in, and off by default

`autoRefuse` (default **false**). Everything the verify measures is still measured and
reported — both regimes, both ratios, the harm veto's verdict — but by default it does not
VETO: the model deploys and the numbers are the engineer's to read. `autoRefuse: true`
restores the contract the pilot was built around.

**What that costs is measured, not hypothetical.** With the gate off, the configurations
this suite records as harmful deploy too: the non-minimum-phase tank delivered **0.61×**
on its recipe and the Wood–Berry column **0.72×** against its published baseline.
`report.wouldRefuse` carries the reason the gate would have given, so a refusal that did
not happen is still legible, and the tank's test asserts exactly that pair — deployed
anyway, and the refusal it did not make still reported.

Two things still cannot deploy whatever the flag says, because they are arithmetic rather
than policy: a commissioning with every channel's forecast disarmed has nothing to act
with, and `act()` returns zero for a gated channel regardless.

Every test in `test/pilot/` passes `autoRefuse: true`, because those files exist to pin
the CONTRACT; `flexisim.html` passes it too, because ⑤ and ⑥ advertise that they deploy
only on a verify the machine vouched for. The default is what a host gets when it does not
ask.

## Brick 58 — a refused pilot looks exactly like a broken one

The owner reported ⑥ "much worse than the last time I did this same combo" at minimum
compliance sliders. It was not worse. Nothing about the controller had degraded.

**Measured on the page at that combo (K 0.25, E 0.03), driving it headlessly:**

| feedrate | open loop | ⑥ deployed | |
|---|---|---|---|
| 0.004 | 1.199 | **0.340** | 3.5× better |
| 0.016 (max) | 3.996 | **1.516** | 2.6× better |

And in the test, the softest corner over this whole session went the RIGHT way:
pre-session library 1.18 → 0.948 (1.25×), current 1.18 → 0.426 (**2.78×**).

**What changed is that the gate started refusing it.** The page's own commissioning
reports `wouldRefuse: the scribble regime measured 0.46x`, and a refused pilot applies
EXACTLY ZERO correction — so the arm runs open loop at 1.199 instead of 0.340. From
outside, a controller that declines to act and a controller that has got worse are the
same picture. That is the failure mode, and the page gave no visible sign it had declined.

The window was brick 53 (the two-regime gate) to the gate-off commit; the opt-in gate
(brick 57) already restores deployment there.

**AND THE SOFT CORNER NOW HAS A DELIVERED NUMBER, which it never did.** Its verify ratio
had been quoted across three bricks — 0.48×, then 5.02×, then 1.28× program against 0.25×
scribble — with the verify rebuilt twice in between, so none of those were comparable to
each other and none was a delivered figure. The section commissioned and destroyed its arm
without ever running a program. It now scores one, and the number settles the dispute the
ratios could not: **the correction helps 2.78× at a corner whose scribble regime called it
four times worse than nothing.** That is also the clearest evidence yet that a scribble
score is not a verdict about a machine that runs programs.

**A verification note that cost real time here.** Three separate hypotheses were tested
against this and all three were WRONG — the gate-off (the page helps either way), the
correction authority (1.0 rad delivers 4.12× against 0.15's 2.78×, better not worse), and
the brick-54 basis selector (linear-only scores 0.352 against the quadratic's 0.340). Each
was plausible and each took a measurement to kill. The one that was right came from
reproducing the owner's own combo on the actual page rather than reasoning about which
library change could explain it.

## Brick 59 — the cascade was never wired to anything, and it had a registration bug

The owner asked, plainly: *"The residual cascades are active for mode 5 and 6?"*

**No.** `lib/pilot/stack.js` had been built and measured on the EMPS axis in brick 56 —
12.7× → 29.8× on the trained trapezoid, 8.3× → 26.0× on a program it had never seen — and
then never connected to anything a person can click. `flexisim.html` constructed a plain
single `Pilot` for both ⑤ and ⑥. Every number in brick 56 was real; none of it was
reachable from the page. That is the whole of the answer to why the page's ⑤ and ⑥ had not
improved: the improvement existed in a library and nowhere else.

### Wiring it exposed a defect that a single pilot cannot have

A **Cascade depth** slider (1–3) now feeds one `makePilot()` factory used by both ⑤ and ⑥.
Depth 1 still constructs the plain `Pilot`, not a one-layer `Stack`, because the flagship
numbers were measured on that object.

Making `Stack` a genuine drop-in turned up three things, and the third is the one that
mattered:

1. **`verdict` must be null until the whole stack is done.** A host reads `verdict` as the
   "is it finished" flag — that is what a `Pilot`'s means — so a partial stack whose first
   layer had deployed answered `deploy: true` while layer 2 was still driving the machine
   through its own excitation.
2. **`work()` has to advance layers, not just `observe()`.** A fit that disarms every
   forecast ends a layer without another `observe` ever arriving, and the stack would have
   reported `done` after one layer.
3. **EVERY LAYER WAS READING THE LOOK-AHEAD AT SOMEONE ELSE'S CADENCE.** `act(off)` is
   indexed in samples and the host builds exactly ONE look-ahead closure. Each layer
   derives its own `sample` from its own measured `Ts`, and on the 2R arm at the softest
   sliders they disagree — layer 1 Ts 2009 → sample 8, layer 2 Ts 2137 → sample 9 — so
   layer 2's whole 73-sample horizon was registered 73 solver steps short of where its
   forecast was about. Rule 29, arriving through a door a single pilot does not have.

**Measured at the owner's own combo (K 0.25, E 0.03, feed 0.004, rounded rectangle):**

| | contour rms | | bias | oscillation |
|---|---|---|---|---|
| open loop | 1.205 | | −0.626 | 1.030 |
| ⑤ depth 1 | 0.1875 | 6.43× | −0.0134 | 0.187 |
| ⑤ depth 2, unregistered | 0.1669 | 7.23× | | |
| ⑤ depth 2, closure re-indexed | 0.1170 | 10.30× | | |
| ⑤ depth 2, cadence pinned | **0.0987** | **12.21×** | −0.0292 | 0.0943 |

Layer 2 vouched for itself at 2.07× on top of layer 1's 2.59×, with held-out R² 0.440/0.571
on what layer 1 left — real structure, independently verified, exactly the claim the
cascade exists to make. What the second layer buys is almost entirely OSCILLATION: 0.187 →
0.0943, a factor of two, while the bias it inherits from layer 1 does not improve (−0.0134
→ −0.0292, and layer 1 had already taken 97.9% of it). That is the decomposition earning
its place immediately — a single rms would have said "1.9× better" and left which
mechanism moved as a guess.

**Re-indexing the closure per layer was tried first and rejected — and it was both worse
AND more dangerous, which is worth recording because the safe fix is usually the one that
costs something.** Scaling `off` by the sample ratio recovers most of the loss (10.30×
against the pinned 12.21×) but silently fails when the upper layer samples FASTER than the
first: two adjacent layer-samples round onto one host index and the velocity regressor
reads zero, with nothing thrown and nothing blank. Rule 51. Pinning every layer above the
first to the first's cadence is correct by construction, and costs nothing that matters:
Ts, Tset, the grid, the horizon N, the lag windows, the ridge and the basis are all still
the layer's own, which is where the timescale separation actually lives (on EMPS layer 2
still chooses N 95 against layer 1's 68 by itself).

The stack test now pins the one-cadence contract, and says out loud that **on the EMPS axis
the pin is inert** — every layer there floors to sample 1, so the assertion would pass with
the pin removed. The arm is where it bites and the table above is what it bought.

### Two instruments, three significant figures

The owner sent three phone screenshots — no correction, ⑤, ⑥ — and they are what made the
rest of this trustworthy. The page reads open 1.19e+0, ⑤ 1.93e-1, ⑥ 3.12e-1. A headless
Node rig built independently of the page, from the same libraries, reads open 1.205,
⑤ 0.1875, ⑥ 0.334. Rule 15: two routes that do not share the mistake.

### Bias and oscillation are now separate numbers (rule 39)

The screenshots showed something no ratio does. The no-correction error chart sits between
−3 and 0 — almost pure **bias**. ⑤'s sits at ±0.4 centred on zero — the bias is gone and
what is left is **oscillation**. `ContourScore` reported one rms and could not tell them
apart, which means the CLAUDE.md rule that says to decompose the error had no instrument
behind it on the tab where contouring is actually measured.

It reports `contourBias` (the signed mean) and `contourOsc` (the spread about it) now, and
the page shows both under the contour row. Measured on ⑤:

    open   contour 1.205   =  bias -0.626   + osc 1.030
    ⑤ on   contour 0.1875  =  bias -0.0134  + osc 0.187

The pilot annihilates the bias — 47× — and cuts the oscillation 5.5×. The test pins the
decomposition on two synthetic streams a single rms cannot tell apart: a part cut uniformly
0.2 undersize and a part the right size ringing about it have the SAME contour rms, and
must read all-bias-no-oscillation and the reverse. Both halves, rule 9.

### ⑥ against ⑤: two hypotheses killed before anything was found

⑥ delivers 3.40× where ⑤ delivers 6.43× at this corner. The pilot's forecast is NOT the
difference — it is essentially the same on both routings:

| | ⑤ | ⑥ |
|---|---|---|
| held-out R², ch1 / ch2 | 0.968 / 0.792 | 0.971 / 0.758 |
| verify, program regime | 2.59× | 1.70× |
| verify, scribble regime | 2.53× | 0.49× |
| delivered on the rectangle | **6.43×** | **3.40×** |

Equal models, unequal delivery — rule 16 says the difference is then not in the model, and
two plausible suspects were measured and both are innocent:

- **The maps' round trip.** ⑥ commands the machine from `predict` (degree 7) and its
  observer believes `fwd` (degree 5); where they disagree the pilot nulls toward a point
  the program never asked for, and that would be a static bias field. Measured over the
  path: rms **5.1e-3**, max 1.2e-2, against a 0.33 contour it would have to explain. 1.5%.
  Not it.
- **The lever.** The observer scales the tool error by `gradAt`, the GRADIENT of a fitted
  degree-5 inverse, and differentiating a ridge-fitted polynomial amplifies exactly the
  wiggle the ridge left behind — a gain error there would be invisible to held-out R²,
  because the fit is self-consistent with it. Measured against the arm's exact inverse
  Jacobian: gain ratio **1.0072**, p05–p95 within 1.5%, worst relative matrix error 9.2%.
  Not it either.

### What the decomposition found in one reading

    open ⑤   1.205  =  bias -0.626  + osc 1.030
    open ⑥   1.135  =  bias -0.666  + osc 0.918
    ⑤ on     0.1875 =  bias -0.0134 + osc 0.187     bias removed 97.9%
    ⑥ on     0.3341 =  bias -0.1774 + osc 0.283     bias removed 73.4%

**⑥ LEAVES THIRTEEN TIMES THE BIAS ⑤ LEAVES.** Its oscillation is 1.5× worse, which is a
margin; its residual bias is 13× worse, which is a mechanism. ⑥'s problem is DC AUTHORITY,
not dynamics — and that is a different search from the one two dead hypotheses above were
conducting. Its correction peaks at 0.397 where ⑤'s peaks at 0.552, under the same 1.0 rad
of available authority with zero clamping: it is not being stopped, it is not asking.

### The signature that matches it, and what is NOT built

The readouts carry a matching fingerprint. Held-out R² across the horizon, elbow channel:

| | lead 0 | far lead |
|---|---|---|
| ⑤ | 0.792 | **0.150** |
| ⑥ | 0.758 | **−0.035** |

⑥'s elbow forecast is worse than predicting the mean at the far end of its own horizon, and
⑤'s is nearly there. **The QP trusts every lead equally.** The only forecast-quality gate in
the pilot is `readouts[c].gated = val[0] < 0.2` — it looks at LEAD 0 ONLY, so a channel
whose forecast is sound at lead 0 and worthless at lead 30 is fully armed across all 79
leads, and the plan is fitted to noise over most of its horizon. A cost minimised against
noise on most of its terms, with an effort weight priced on the whole, resolves toward the
smaller correction — which is exactly the under-drive and exactly the DC deficit measured.

**IT WAS BUILT, MEASURED, AND IT IS DEAD.** `boxQP` gained an optional per-lead weight on
the tracking residual — a weighted least squares, with the Lipschitz bound seeing the
weights so the step size cannot overshoot — and the pilot derives them from each readout's
own held-out validation, normalised to mean 1. The normalisation is the design: weighting
by raw R² would shrink the tracking term against a fixed λ and double as an effort
increase, so a gain could not be told from the correction merely getting smaller.

Measured on ONE commissioned model deployed twice, so the only difference between the rows
is the weighting:

| | contour | | bias | oscillation | u peak |
|---|---|---|---|---|---|
| ⑤ open | 1.205 | | −0.626 | 1.030 | |
| ⑤ flat weights | 0.1875 | 6.43× | −0.0134 | 0.1870 | 0.552 |
| ⑤ per-lead trust | 0.1860 | 6.48× | −0.0111 | 0.1857 | 0.674 |
| ⑥ open | 1.135 | | −0.666 | 0.918 | |
| ⑥ flat weights | 0.3341 | 3.40× | −0.1774 | 0.2831 | 0.397 |
| ⑥ per-lead trust | **0.3341** | **3.40×** | −0.1747 | 0.2848 | 0.736 |

**0.8% ON ⑤ AND NOTHING WHATEVER ON ⑥** — identical to four significant figures. And the
weights are not inert: ⑥'s far-lead weight is **exactly 0.00** (R² −0.035, clamped), so the
QP was told to ignore an entire channel's far horizon, and `uPk` nearly DOUBLED, 0.397 →
0.736. The solver responded substantially. The machine did not care.

**THAT IS THE STRONGEST FORM OF A NULL, and it is worth more than the fix would have been:
the QP is not the binding constraint.** A plan fitted to noise over most of its horizon
turns out to cost almost nothing, because the receding horizon only ever applies its FIRST
move and re-solves — the far leads shape that move far less than the argument assumed. The
ceiling is not in how the plan is priced.

The mechanism ships opt-in and OFF (`leadTrust`), because it is correct and costs nothing
when unused, and because a later plant with a genuinely long effective horizon is where it
would earn its place if anywhere does.

### AIM AGAINST DELIVERY, and ⑥'s bias finally has an explanation

⑥'s residual bias of −0.177 had survived a second cascade layer, arming its gated channel,
and re-pricing its whole horizon — three controller-side changes, no movement — while the
maps' round trip (5.1e-3) and the learned lever (gain 1.0072) excluded the obvious routing
faults. What was missing was an instrument that separates the two.

The pilot's truth is `tool − anchor(cmd)` and it drives that to zero, so the ANCHOR is where
the loop is AIMED. Put the anchor through the SAME signed-normal decomposition as the tool
and the two readings are directly comparable: the aim is the contour error a PERFECT pilot
would still leave, and the rest is delivery.

| | AIM bias | AIM rms | tool bias | tool rms | delivery gap |
|---|---|---|---|---|---|
| ⑤ | **−4.4e-18** | 1.4e-15 | −0.0134 | 0.1875 | 0.188 |
| ⑥ learned anchor | 9.2e-5 | 0.0029 | −0.1774 | 0.3341 | 0.334 |
| ⑦ rigid anchor | −0.252 | 0.594 | −0.3077 | 0.647 | 0.257 |

⑤'s aim is exact to DOUBLE PRECISION, which is the control: `fk(cmd)` sits on the program
by construction, so anything else would have meant a mis-projection rather than a machine
fault. **⑥'s aim is 9.2e-5, nineteen hundred times smaller than the bias it leaves.
ROUTING IS EXCLUDED. ⑥ aims at the program and does not get there.**

### THE ANCHOR SWAP WAS CONFOUNDED, AND THE INSTRUMENT CAUGHT IT ONE RUN LATER

⑦ is ⑥ with exactly one thing changed — the anchor, from the learned `fwd` to the rigid
`fk` — to test whether ⑥'s deficit is DC STARVATION: `fwd` is fitted to SETTLED poses, so
`tool − fwd(cmd)` has the static droop subtracted out and the model trains on a signal
whose DC was removed by construction, while `tool − fk(cmd)` retains it.

It VERIFIED at 2.61x program and 5.84x scribble — matching ⑤ and far past ⑥'s 1.70x/0.49x
— and delivered **0.647, worse than ⑥ and three times worse than ⑤**. The aim says why:
the anchor became `fk(predict(x,y))`, the RIGID position of a DROOP-COMPENSATED command,
which is the program plus the droop. **A perfect ⑦ would land 0.252 off by construction,
and the verify measured truth reduction against a mis-aimed truth and called it excellent.**
One code change, two physical changes. The aim decomposition, built one run earlier to
diagnose ⑥, immediately caught a flaw in the experiment designed to follow it.

### WHAT SURVIVES, AND WHY THERE IS NO ⑥-PRESERVING FIX IN THIS DIRECTION

The DELIVERY GAP is the one column the confound does not touch, and it moved the predicted
way: **0.334 → 0.257, a 23% improvement**, from giving the truth its DC back. The DC story
is supported.

But it also shows the trade is not available. **THE DROOP HAS TO BE CARRIED EITHER BY THE
REFERENCE OR BY THE CORRECTION, AND WHICHEVER CARRIES IT, THE OTHER IS DC-FREE.** ⑥ puts it
in the reference, since `predict` is fitted to settled poses, so its pilot necessarily
trains on a DC-free signal; make the anchor DC-rich and the aim moves by exactly the droop,
because they are the same quantity appearing twice.

That explains every measurement at once: ⑥'s OPEN loop is BETTER than ⑤'s (1.135 against
1.205) because the static droop is pre-compensated; its CORRECTED loop is worse because what
is left is the DYNAMIC droop delta and its pilot has weak DC authority over it; its aim is
fine; and nothing on the controller side moved it.

**A DROOP CARRIED BY THE CORRECTION IS RE-MEASURED AT SPEED EVERY STEP; A DROOP CARRIED BY
THE REFERENCE IS FROZEN AT WHATEVER THE STATIC GATHER SAW.** That is why ⑤ wins, and it is a
design property of ⑥ rather than a defect in it. Whether a gather taken AT FEED, or a
reference that deliberately does NOT compensate droop, recovers it is the next experiment
and is not measured.

Note also that ⑥'s open loop is 1.135 against ⑤'s 1.205: the learned map pre-compensates
about 6% of the static droop by itself before any pilot acts.

### THE CASCADE DOES NOT RESCUE ⑥ — IT HARMS IT, AND ITS OWN VERIFY SAID OTHERWISE

The obvious move, once depth 2 took ⑤ from 6.43× to 12.21×, was to point it at ⑥. It makes
the machine worse:

| ⑥ | contour | | bias | oscillation | copper | u peak |
|---|---|---|---|---|---|---|
| open | 1.135 | | −0.666 | 0.918 | 4.58e-4 | |
| depth 1 | **0.3341** | **3.40×** | −0.1774 | 0.283 | 3.72e-4 | 0.397 |
| depth 2 | 0.3867 | 2.93× | −0.1544 | 0.3545 | **1.15e-3** | 0.907 |

Layer 2 **verified at 1.85× — BETTER than layer 1's 1.70×** — pulled its own scribble
regime from 0.49× to 0.86×, chose a shorter horizon (N 50 against 69) on its own, and
delivered a worse machine on **3.1× the copper**. A verify round that decides rather than
checks is the pilot's central claim, and here it decided wrong.

**The reason is in its readouts, and it is not a margin: R² [0.848, −0.117].** Layer 2's
elbow forecast is NEGATIVE at lead 0 — worse than predicting the mean — so `gated` fires
and that channel's correction is zeroed. What deploys is a **ONE-CHANNEL correction on a
coupled 2R arm.** That is not a smaller correction; it is a correction in a direction the
QP never chose, because the plan it priced assumed both channels were free to help. The
decomposition shows exactly that shape: the bias improves slightly (−0.177 → −0.154, layer
2 doing what it was built for) while the oscillation goes UP (0.283 → 0.3545) and the peak
correction more than doubles. ⑤'s layer 2, with both channels alive at 0.440/0.571, has no
such problem.

**`Stack` now FLAGS a layer that cannot forecast every channel of a multi-channel plant**,
and refuses it only if the engineer asks (`refusePartial`, default OFF — see the next
section). The layer's OWN verdict is left exactly as it recorded it: an instrument's
reading is not the stack's to rewrite (rule 27).

### …and the mechanism written above is WRONG, which only turning the refusal OFF revealed

The owner's instruction was blunt and correct: *"Stop refusing anything on this page. It is
not production it is for r&d and you are preventing me from learning from the failures."*
Disarming the forecast gate produced the measurement that refutes the paragraph above.

| ⑥ depth 2, at the softest sliders | contour | | bias | osc | copper |
|---|---|---|---|---|---|
| layer refused — i.e. plain depth 1 | 0.3341 | **3.40×** | −0.1774 | 0.283 | 3.72e-4 |
| layer deployed, elbow ACTING (gate off) | 0.3565 | 3.18× | −0.1040 | 0.3410 | 1.22e-3 |
| layer deployed, elbow GATED to zero | 0.3867 | 2.93× | −0.1544 | 0.3545 | 1.15e-3 |

**ARMING THE NEGATIVE-R² CHANNEL MAKES THE MACHINE BETTER, NOT WORSE** — 2.93× → 3.18×,
with layer 2's own verify rising 1.85× → 2.20×. The gate was costing a quarter of a factor
by declining to act. So the misaiming argument is real in DIRECTION: a partial correction
on a coupled arm measures worse than a full one.

**But the fully armed layer still LOSES to not stacking at all**, 3.18× against 3.40×.
Partiality was therefore a second-order cost and NOT the cause of the harm. What the flag
actually marks is a layer with nothing left to model; a channel that fails held-out
validation is simply the cheapest available signal of that. The flag is a good predictor
(it fires exactly where the layer is not worth stacking) attached to a wrong explanation,
and it took disabling the refusal to tell those apart.

⑤ depth 2 came back **byte-identical** at 12.21× with the gate off, because nothing on ⑤
was ever gated — rule 21's signature, and the control that says the ⑥ change is real.

### Nothing on the Path tab refuses any more

Three separate refusals were live on that tab, each replacing a visible failure with the
absence of one:

1. **The deploy gate** (`autoRefuse`) — already off since brick 57, now passed explicitly
   at the factory so it cannot drift back.
2. **The forecast gate** — `gated = R²(lead 0) < 0.2` **silently zeroed a channel**.
   Nothing thrown, nothing blank, that joint simply stopped correcting. This is the one
   that was still biting, and the table above is what it was costing.
3. **The stack admission rule** — added earlier in this same brick, and it would have
   dropped the layer before anyone could watch it fail.

All three are now MEASURED and REPORTED rather than enforced: `report.wouldRefuse`,
`readouts[c].wouldGate`, and a `partial` note on the layer. The stats panel shows each,
plus a new row giving held-out R² at lead 0 against the FAR lead per channel — which
appears whenever a channel forecasts nothing at the end of a horizon the QP trusts
uniformly, and is the current ceiling. Both new gates are library options defaulting to the
old behaviour, so every plant under test keeps its contract; only this page turns them off.

A refusal on the tab now means only that there is nothing to deploy — the excitation could
not be built, or the guards tripped three times. Those are not judgements, they are a
machine that cannot be driven, and the badge says so instead of "REFUSED".

## Brick 60 — the sharp corner, the commissioning budget, and the cyclic task

Three questions from the owner, run down separately. Two of them killed a hypothesis of
mine and the third found a defect in a documented knob.

### The sharp square: it saturates, and it reverses

Commissioned ONCE and scored on three shapes, so the only difference is the program:

| shape | open | corrected | | bias | osc | reversals | u peak |
|---|---|---|---|---|---|---|---|
| circle | 1.267 | 0.0999 | **12.68×** | +0.009 | 0.100 | 4 | 0.589 |
| rounded | 1.205 | 0.1875 | 6.43× | −0.013 | 0.187 | 10 | 0.552 |
| sharp | 1.129 | 0.2683 | **4.21×** | **−0.128** | 0.236 | **36** | **1.000** |

The AIM is machine-zero on all three, so none of it is routing. Three things separate the
sharp square, and the obvious one is the least important:

- **~~THE CORRECTION SATURATES.~~ WRONG, AND CORRECTED BELOW.** `uPk = 1.000` IS the cap,
  on this shape and neither other — but `uPk` is a PEAK, one sample touching the ceiling,
  not a duty. Released to a cap of 2.0 with the identification held fixed, the peak goes
  to **1.043** and every delivered number is IDENTICAL to four significant figures. Brick
  45 used the right instrument for exactly this question — "hit at the cap for 26.5% of
  the lap" — and this used the wrong one. The cap was never the constraint.
- **36 JOINT REVERSALS** against 10 and 4. Every one crosses a 2e-4 rad backlash dead band
  where no torque transmits, and a dead band is not a linear function of anything the
  pilot reads: the same encoder angle and the same torque look identical arriving from
  either side.
- **The corner crawl is real and secondary.** At a 90° corner the planner's rule gives
  `v = a·cornerDt / (2 sin(φ/2))` = 1.131e-3 against a commanded 4e-3 — measured, and
  matching the closed form exactly. But it is 2.1% of the lap, while the rounded square's
  r = 1.5 corners give `sqrt(a/k)` = 7.75e-3, ABOVE the feed, so they never slow at all.

**THE DIRECTION BIT WAS THE PROPOSED FIX AND IT IS HARMFUL.** Two extra signals, the sign
of each joint's commanded velocity — free to a real controller, and the mechanism
`AxisComp` was built around. Measured:

| | sharp | bias | reversals | uPk | rounded |
|---|---|---|---|---|---|
| 6 signals | **4.25×** | −0.126 | 36 | 1.000 | **6.43×** |
| 8 signals | 3.71× | −0.192 | 28 | 0.898 | 5.56× |

It did exactly what was predicted on the sub-metrics — reversals 36 → 28, saturation
relieved 1.000 → 0.898 — and made the contour WORSE ON BOTH SHAPES, with the scribble
regime falling 2.53× → 1.25×. **The reason was already written down in this file** for the
tip sensor: a latched signal is nearly constant across a lag window, so its lags are almost
collinear and carry what the first one already had. Two signals × 12 lags of near-constant
data dilute the fit. Reading the existing note would have cost nothing and saved the run.

### THE CAP WAS NOT THE CONSTRAINT, AND RAISING IT EXPOSED A WORSE PROBLEM

Doubling `uMax` measured WORSE on all three shapes — rounded 6.43× → 4.44×, circle
12.68× → 6.67×, sharp 4.21× → 3.57× — and the commissioning moved with it: Ts 2009 → 2048,
N 79 → 70. **That is the tell.** A runtime clamp has no business changing the identified
settling time.

`uMax` set THREE unrelated things: the QP's runtime clamp, the probe step (0.15×) and the
excitation dither (0.1×). So raising the correction authority — an operating decision —
silently re-identified the plant, and the experiment could not separate the two. Neither
could the caller.

`probeAmp` and `ditherAmp` are now separate options, defaulting to exactly the old
expressions so every plant on record is unchanged, and the page pins them to what they
were at the 1.0 ceiling. With identification held fixed and ONLY the clamp doubled:

| | clamp 1.0 | clamp 2.0 |
|---|---|---|
| rounded | 0.1875 (6.43×) | **0.1875 (6.43×)** |
| circle | 0.0999 (12.68×) | **0.0999 (12.68×)** |
| sharp | 0.2683 (4.21×) | **0.2683 (4.21×)**, uPk 1.000 → 1.043 |

**Identical to four significant figures on all three.** The entire degradation was the
probe and the dither, and none of it was the cap. The doubled ceiling is harmless and
buys nothing; what it cost, before the split, was a third of the rounded square's
improvement and half the circle's.

WHAT IS LEFT: the sharp square's deficit is the 36 backlash reversals, and `cornerDt` is
untested.

### A USELESS SIGNAL IS FREE; A PARTLY-INFORMATIVE ONE IS EXPENSIVE

Two attempts to route backlash information into the pilot, and both made the machine
WORSE — on the rounded square as well as the sharp one, which is the tell: a signal about
reversals should not touch a shape that barely reverses.

| 8th and 9th signal | sharp | rounded |
|---|---|---|
| — (6 signals) | **4.21×** | **6.43×** |
| direction bit, `sign(v_cmd)` | 3.71× | 5.56× |
| dead-band coordinate | 3.13× | 4.60× |
| **two channels of PURE NOISE** | **4.24×** | **6.47×** |

**THE NOISE CONTROL IS THE WHOLE FINDING.** Two signals carrying NOTHING, at exactly the
same feature cost — 2 signals × 12 lags = 24 extra regressors — are FREE, marginally better
than baseline and inside run-to-run variation. So the feature count is not the cost, and
the first explanation offered here ("24 extra regressors cost variance") was wrong.

What separates them is COLLINEARITY. Noise is uncorrelated with everything, so the ridge
shrinks it to nothing and it costs nothing. The direction bit and the dead-band coordinate
are DETERMINISTIC FUNCTIONS OF THE COMMAND, so they are tangled with regressors that
already carry real information, and the ridge cannot shrink them without shrinking what
they are tangled with. They displace informative weight rather than being discarded.

**So the question to ask of a new signal is not "does it carry information" but "is it
collinear with what is already there".** That inverts the obvious intuition, and it is
measured rather than argued.

**AND THE OWNER'S OWN HYPOTHESIS FOUND A REAL BLINDNESS, WHICH THE FIRST FIX DID NOT
CURE.** Watching a cascade-2 ⑤ on the sharp square at the loosest arm: the tool slows into
a corner, accelerates out of it, falls behind, catches up, and rings along the following
side. The proposal — feed the model acceleration, or feed torque forward.

Torque feedforward TURNED OUT TO ALREADY EXIST and to be complete at the rigid level:
`ChainServo.jointTorques` computes `M(q)·α + Coriolis − gravity` at the commanded pose and
adds `N·Jm·α` for the rotor. What it assumes is a RIGID arm, so at K 0.25 the motor gets the
right torque and the load still lags through the soft gearbox — which is the ringing.

The acceleration half found something real. The row carries, per command channel per lag, a
POSITION and a VELOCITY and nothing else — while the correction a compliant machine needs is
the wind-up `τ/K` with `τ = M(q)·α`. **The model is asked for something proportional to an
acceleration it is never shown**, and it cannot reconstruct one either: the command lags are
STRIDED 280 solver steps apart while a corner's acceleration event lasts `cornerDt` = 40, so
one lag spacing is seven times longer than the whole event.

Supplying it at all twelve lags made things WORSE — sharp 4.21× → 2.89×, rounded 6.43× →
4.64×, and the correction saturated the doubled cap at 2.000. That is 24 more deterministic
functions of the command, i.e. exactly the category the noise control just showed to be
expensive. The information genuinely missing is the FINE-GRAINED acceleration, which one lag
supplies; twelve strided copies supply nothing the first did not. `cmdAccel` is therefore a
LAG COUNT rather than a flag, and the one-lag measurement is what separates "the idea is
wrong" from "it was added twelve times over".

### THE SHARP SQUARE'S SIDE IS EXACTLY ONE SETTLING TIME LONG

The owner's reading of the live page turned out to be right and to point somewhere none of
the fixes above could reach. Measured on the CORRECTED run's own contour error — the signal
on the screen — at the shipped feed:

| | steps |
|---|---|
| the plant's measured settling time `Ts` | **2009** |
| one side of the sharp square at feed 0.004 | **2052** |
| ratio | **1.02** |

Within one side, de-trended: **two zero crossings in 2052 steps** — not a ripple at all, ONE
excursion. The tool deviates after the corner and comes back, once, and what reads as
resonance across the square is that hump repeating at four corners.

**HALVING THE FEED RESOLVES IT AND CONFIRMS THE MECHANISM.** At feed 0.002 a side is
4010 steps and the same analysis gives **7 crossings, period 1188 steps, 3.4 cycles per
side, DECAYING 8.30e-2 → 5.39e-2 across the side.** So the mode is real, it is ~1188 steps,
and at the shipped feed a side holds only 1.7 cycles of it — it never settles before the
next corner arrives.

THE ASYMMETRY IS THE PROOF, and it needs the ABSOLUTE error rather than the ratio, because
slowing down improves the open loop too and the ratio falls for everything:

| contour, corrected | feed 0.004 | feed 0.002 | |
|---|---|---|---|
| sharp | 0.2657 | **0.1626** | 1.63× better |
| circle | 0.0999 | 0.0939 | 1.06× better |

The sharp square gains 1.63× from the extra settling time; the circle, which has no corner
transient to settle, gains 6%. **The limit is not authority and not blindness — the pilot's
horizon is 5056 steps, two and a half sides, so it SEES the corner coming. The plant needs
~Ts to recover and the disturbance repeats every Ts.**

AND "NOTHING RINGS" WAS WRONG, which is worth recording because the instrument was at
fault twice over. A step in the joint reference with the loop closed returned "no usable
decay" on BOTH the wind-up and the tip traces — the closed loop absorbs a reference step,
so the kick never excited the mode the CORNER excites. The first attempt also fed `ringFit`
a MAGNITUDE, which is non-negative, so de-meaning it yields crossings of the mean rather
than of an oscillation. Right question, wrong instrument, twice.

### INPUT SHAPING IS STRUCTURALLY INAPPLICABLE TO CONTOURING

With the frequency finally measured from the phenomenon (ω 5.289e-3, ζ 0.041, ZVD impulses
`[0.283,0] [0.498,594] [0.219,1189]`), shaping the joint reference measured:

| | open | corrected | | AIM |
|---|---|---|---|---|
| sharp | 0.900 | 1.202 | **0.75×** | **2.589e-1** |
| circle | 1.351 | 1.427 | 0.95× | **3.546e-1** |

**THE AIM WENT FROM 1e-15 TO 0.26**, and that is the whole explanation. A ZVD blends the
command at delays of 0, 594 and 1189 steps; on a CLOSED PATH that is a GEOMETRIC blend, not
a time lag. At 58% of a side it averages points that are around a corner from each other and
cuts the corners off. The shaped reference no longer traces the square.

That is not an implementation defect, it is what input shaping DOES to a contour: it trades
path fidelity for vibration, and path fidelity is exactly what contour error measures. It
works on the Move tab because a point-to-point move has no path to distort — only an
endpoint, which unit-sum impulses provably preserve. A contour is nothing but path.

WHAT IS LEFT, and it is a timing relationship rather than a controller: the corner's
excitation (`cornerDt`) against the side's traverse time against `Ts`. Those trade directly
against cycle time and can now be computed rather than tuned.

### THE CORRECTION IS ROUTED THROUGH A CHANNEL FIFTY TIMES SLOWER THAN THE DISTURBANCE

The owner: *"The controller is not understanding how to shape and preshape the commands to
get the desired contours with the link bend physics."* That reframing was right about where
to look and it took eight experiments to find out what it actually implies.

The COMMAND WINDOW genuinely cannot express a pre-shape. Its lags share the stride chosen
for the MEASURED signals — 35 samples, 280 solver steps — while a corner lasts 40. And for a
FLEXIBLE link this is not a detail: the tip-to-torque transfer has right-half-plane zeros,
so tip tracking is a non-minimum-phase inversion that REQUIRES pre-shaping ahead of the
move. So the basis was checked, three ways:

| | sharp | circle |
|---|---|---|
| baseline (12 lags at stride 35) | **4.25×** | **12.68×** |
| re-pointed: 12 lags at stride 12 | 2.75× | 5.52× |
| re-pointed: 12 lags at stride 4 | 2.17× | 6.53× |
| mixed: 12 coarse + 6 fine, RAW | 4.25× | 12.94× |
| mixed: 12 coarse + 6 fine, SCALED | 4.24× | 12.79× |

Re-pointing is monotonically WORSE, because the window's job is REACH — the plant settles in
2009 steps and a stride-4 window spans 352. Adding fine lags alongside is FREE AND UNUSED:
raw they were 63× smaller than the velocity term beside them and the ridge zeroed them
(a ridge penalises coefficient magnitude, so a small-variance regressor is shrunk hardest);
scaled as local velocities they are usable, non-collinear, and the fit still does not want
them. They do not predict the truth any better.

**BECAUSE PREDICTION WAS NEVER THE CONSTRAINT.** Every lever that could matter was measured
and all but one is already at its limit or does nothing:

| lever | result |
|---|---|
| more information — direction bit, dead-band coordinate, accel ×2, fine window ×2 | null or worse |
| more authority — cap 1.0 → 2.0 → 4.0 with identification pinned | **identical to 4 s.f.** |
| aiming | AIM error **1e-15**, exact |
| forecast quality | held-out R² **0.97 / 0.79** |
| **more TIME — half feed** | **1.63× sharp, 6% circle** |

    the DISTURBANCE      a corner, over in                        40 steps
    the ACTUATOR PATH    the correction enters the joint COMMAND,
                         and the plant needs its settling time  2009 steps
                                                          ratio       50x

**The pilot sees the corner coming — its horizon is 5056 steps, two and a half sides — aims
exactly at it, forecasts it well, and physically cannot deliver in time.** `u` is added to
`theta`, and a joint command becomes tip motion only after the servo loop (bandwidth 2e-3,
a ~500-step constant) and the gearbox compliance have had their say. That is why every
information and authority lever measured null, and why the only thing that moved the number
was giving the plant more time.

**AND IT SAYS THE OWNER'S OTHER SUGGESTION — TORQUE FEEDFORWARD — WAS RIGHT, FOR A REASON
NEITHER OF US STATED.** It is not that the feedforward is missing: `ChainServo.jointTorques`
already computes `M(q)·α + Coriolis − gravity` at the commanded pose, plus `N·Jm·α` for the
rotor, which is complete for a RIGID arm. It is that the CORRECTION CHANNEL is slow. A
correction injected as TORQUE bypasses the position loop entirely and acts at the drive's
bandwidth rather than the loop's — the same model on a faster path. NOT BUILT, and it is the
one lever these measurements leave standing.

### THE TORQUE CHANNEL IS WORSE, AND THE PLANT IS THE SLOW ELEMENT

The one lever the measurements left standing was routing the correction as a TORQUE rather
than a position offset — the same model on a supposedly faster path. The pilot is
channel-agnostic (it identifies whatever `u` is wired to), so this is a host change and not
a library one. It is refuted on every count.

| torque cap | sharp | circle | |
|---|---|---|---|
| 4.8e-4 | 1.14× | 1.26× | too little authority |
| 4.8e-3 | 1.35× | 3.94× | the best of them |
| 1.9e-2 | 1.00× | 1.00× | **guard tripped 3×, pilot refused** |
| position channel | **4.25×** | **12.68×** | |

**AND THE PREMISE WAS WRONG BEFORE THE NUMBERS WERE.** `Ts` on the torque channel measures
**2042** against the position channel's **2009** — the servo loop is NOT the slow element,
the gearbox compliance and inertia are, and no change of entry point alters that. Two
further explanations offered along the way were also wrong and are recorded so they are not
re-proposed: the position loop does NOT reject the torque (`dc` 1.9e2 and 2.4e3, both
identifiable, R² 0.991 and 0.703), and the "zero correction" in the first run was a DISPLAY
artefact of printing three decimals for a quantity capped at 4.8e-4.

What the first run really showed was a cap sized 21× too small: authority is `uMax × dc`,
and 4.8e-4 × 193 is 0.093 against the position channel's 2.0.

TWO THINGS SPECIFIC TO THIS CHANNEL are worth keeping even though it lost. The two joints'
DC gains differ by **12×** (193 against 2373), so ONE scalar `uMax` cannot size both — the
position channel never faced that, because a radian of offset is a radian on either joint by
construction; a torque channel would need a PER-CHANNEL cap, an API change rather than a
tuning choice. And `Ts` came back **2042 / 1654 / 1699** as the probe amplitude rose: a
linear plant's settling time does not depend on how hard it is probed, so that spread is the
BACKLASH — a larger probe crosses the dead band and the response looks faster. The
identified timescale is amplitude-dependent, which is a nonlinearity the linear model cannot
carry and which no lever in this brick addressed.

### IT IS PRE-SHAPING, AND PREVIEW SOLVES CAUSALITY RATHER THAN BANDWIDTH

The owner pushed back on the "plant-limited" reading: *"The command can be shaped
predictively and knows the path ahead of time so it is possible to shape it correctly, we
just need to determine how."* That is correct control theory — a slow plant is no barrier to
tracking a KNOWN trajectory, you start early — and the pushback was right that the previous
conclusion did not follow.

So the chain was run down properly, and it ends somewhere better.

**IT DOES PRE-SHAPE.** Cross-correlating the correction against the corner marker: `u`
LEADS the corner by **2400 steps**, against a plant response time of 2009. That is exactly
where a correct pre-shape launches. Every prerequisite is confirmed present, and this was
the measurement that should have come first rather than twelfth:

| | |
|---|---|
| horizon | 5056 steps = 2.5× the response time |
| forecast AT THE LAUNCH LEAD (~1984 steps) | **R² 0.928 / 0.711** |
| aim | exact to 1e-15 |
| authority | not binding |
| effort weight λ | correctly tuned — see below |
| **pre-shape timing** | **leads by 2400 steps** |

λ was checked because `λ‖Du‖²` prices the RATE of change of the correction, which is the
whole content of a pre-shape, and because it had been priced on a scribble and validated on
a ROUNDED path — never on a corner. Swept on the same commissioned model: 4.92e-3 (chosen)
0.266, then 4.92e-4 → 0.820, 4.92e-5 → 0.795, 0 → 0.712. Lowering it drives `u` to the cap,
triples the copper, doubles the reversals and quadruples the OSCILLATION while improving the
bias. It is correctly tuned and is not suppressing anything useful.

**AND THE PLANT IS NEARLY LTI, so there is no nonlinearity to schedule around.** Probe
amplitude swept 30×:

| probeAmp | Ts | ch1 dc | ch2 dc |
|---|---|---|---|
| 0.02 | 2048 | 0.731 | 0.986 |
| 0.15 | 2009 | 0.906 | 0.992 |
| 0.60 | 1999 | 0.850 | 0.9998 |

`Ts` moves 2.5% and `dc` 12% / 1%. A gain-scheduled QP was designed and NOT built, because
this said it could not close a 2.7× gap. (The earlier "amplitude-dependent Ts" claim — 2042
/ 1654 / 1699 — came from the TORQUE channel at three different CAPS and was confounded.)

**SO: PREVIEW SOLVES CAUSALITY, NOT BANDWIDTH.** Pre-shaping lets the correction start
early. It does not let a low-pass plant produce a fast output. The corner's disturbance has
content at 40 steps and the plant's bandwidth is ~2000; the controller cancels the
low-frequency part — and demonstrably does — while the high-frequency part is uncancellable
BY ANY CONTROLLER, at any horizon, with any model. That single statement fits every result:
pre-shaping happens; authority is irrelevant because it is bandwidth not amplitude; lower λ
is worse because acting fast excites what cannot be controlled; more time helps; the circle,
whose command has no such content, is fine.

**WHICH MAKES THE REMAINING LEVER THE COMMAND'S OWN SPECTRUM, AND IT IS MONOTONE OVER 16×:**

| cornerDt | min commanded speed | corrected contour | lap |
|---|---|---|---|
| 10 | 2.8e-4 | **0.2289** | 8346 |
| 20 | 5.7e-4 | 0.2516 | 8295 |
| 40 (shipped) | 1.1e-3 | 0.2657 | 8206 |
| 160 | 4.0e-3 (no slowdown at all) | 0.5115 | 8000 |

**AND `cornerDt` IS THE CORNER'S VELOCITY ALLOWANCE, NOT ITS SEVERITY** — `v = a·cornerDt /
(2 sin(φ/2))`, so LARGER means FASTER through the corner. This file called it "how hard the
corner is excited" earlier in this brick, which is backwards, and the first test was run in
the wrong direction because of it: 160 makes the corner sharper and cost 1.92×.

The gain at the usable end is modest — default to floor is **1.16× for a 1.7% longer cycle**
— and even a fully smoothed corner is 2.3× worse than the circle (0.229 against 0.0999),
which is the irreducible cost of a corner on a plant this soft. But the direction is
unambiguous and the mechanism is now identified rather than guessed at.

**THE SHAPING THAT MATTERS IS IN THE PATH PLANNER, NOT IN THE CORRECTION.** The controller
is already shaping optimally within its bandwidth.

**AND THE EARLIER CONCLUSION IN THIS BRICK WAS TOO STRONG.** The plant needs ~2000
steps to respond by ANY route and a corner is over in 40. Ten levers were measured — six
information, one authority, input shaping, the torque channel, and the command-window
resolution at three settings — and every one is null or worse. One thing moves the number:
TIME. Halving the feed buys 1.63× on the sharp square and 6% on the circle, because only the
sharp square has a corner transient to settle. Either give it more time, at a cycle-time cost
that is now computable, or make the plant faster — `Ts` goes as sqrt(J/K), so it is the
gearbox.

THE DEAD-BAND COORDINATE WAS THE BETTER OF THE TWO BACKLASH IDEAS AND STILL LOST. `AxisComp` models
backlash as `(B/2)·dir` and that is right for what it does — STATIC laser dwells, where the
machine settles and the error really is ±B/2 by approach direction. Contouring is not that
regime: the joint TRAVERSES the dead band over time and no torque transmits during the
traverse, so the state that matters is how far through it you are. Travel, not time, and the
arithmetic says why — at full feed the traverse is ONE step and invisible, at the corner
crawl 3.5, and at a true reversal the rate passes through zero and it is unbounded. The
coordinate is the right physics and it is still collinear with the command, which is what
sank it.

### The commissioning budget, and the phase that is NOT the answer

Measured by step count, immune to what else is running:

| phase | steps | % |
|---|---|---|
| verify | 68,269 | **54.3%** |
| excite | 36,161 | 28.8% |
| probe | 15,600 | 12.4% |
| settle | 5,699 | 4.5% |
| | 125,729 | 105 s wall |

and **182 ridge fits are 57 s of the 105 s WALL** — 158 of them one solve per lead.

**THE EXCITATION LOOKED LIKE THE LEVER AND IS NOT.** The reasoning was that halving it
"mostly costs the LONG leads" (its own comment) and the per-lead trust null had just shown
the long leads barely affect delivery. Measured:

| | steps | held-out R² | verify | DELIVERED |
|---|---|---|---|---|
| 36,161 | 125,729 | 0.968→0.843, 0.792→0.150 | 2.59× | **6.43×** |
| 18,000 | 107,567 | 0.960→0.941, 0.874→0.997 | 0.84× | 5.07× |
| 12,000 | 101,567 | 0.889→**0.999**, 0.975→0.979 | 0.15× | **0.15×** |

**AT 12,000 THE HELD-OUT R² IS BETTER THAN THE DEFAULT AT EVERY LEAD AND THE MACHINE IS
6.5× WORSE THAN DOING NOTHING** (7.817 against an open loop of 1.205). A short record makes
the interleaved validation blocks correlated with the training blocks, so "held-out" stops
being held out and the score becomes noise over noise. This is the project's oldest lesson
at its sharpest: the fit improved MONOTONICALLY while the machine collapsed by a factor of
fifty, and the only instrument that saw it was the verify round on the real machine.

It also would not have paid: two thirds off the excitation is 19% off the total, because
verify is 54% and does not shrink with it.

**THE VERIFY SEGMENT IS THE LEVER, AND IT IS FREE ON THIS PLANT.** `segLen = max(3·Ts, 4000)`
against the existing floor:

| | steps | wall | verify | DELIVERED | bias |
|---|---|---|---|---|---|
| segLen 6027 | 125,729 | 105 s | 2.59× | 0.1875 (6.43×) | −1.330e-2 |
| segLen 4000 | **81,459** | 89 s | 3.06× | **0.1875 (6.43×)** | −1.330e-2 |

**−35% of commissioning for a byte-identical machine** — same contour, same bias to four
figures, same R². The verify exists to pick λ and it picked the same λ from a third less
machine time. TWO CAVEATS, neither buried: the verify's own RATIO moved 2.59 → 3.06, an 18%
shift in the gate's reading that could flip a decision on a plant sitting near its
threshold; and this is ONE plant, so the default does not move until the six-plant sweep
agrees. The wall clock barely improved (105 → 89 s) because the fit ladder is most of it
and neither knob touches it.

### `exciteSteps` CRASHED, inside the knob the question was about

Setting it to 12,000 — which is the DEFAULT FLOOR of `max(12000, 18·Ts)`, a value the API
openly advertises — died on `X[0].length` of an empty array. The window-refine stage was
asking for a 40-tap window at stride 35 (1,365 samples back) plus a 624-sample far lead,
i.e. 1,989 samples, from a record holding 1,500. Zero rows, and a `TypeError` naming
neither the window nor the record.

So the shortening lever was UNTESTABLE, not merely untested; nobody could have measured a
shorter excitation without hitting this. Infeasible candidates are now skipped and recorded
in `report.windowSkipped`, the selection survives every candidate being skipped (the tune's
default stands rather than the stage inventing one), and `solveRidge` refuses an empty
design matrix with a named error.

### The cyclic task: the time was right, the allocation was not

| | |
|---|---|
| 815,280 MAC per two-channel control tick | measured against the analytic count |
| 2.3% of one core at 1 kHz, 9.3% at 4 kHz | tick every `grid·sample` = 64 steps |

**The TIME is PLC-shaped by construction and always was** — a fixed 60 iterations of
projected gradient with no data-dependent branch, so the worst case IS the average. That is
the whole reason the solver is not an interior-point method, and it holds.

**The ALLOCATION was not.** `boxQP` built five `Float64Array(N)` per call — 3.2 kB per call,
6.3 kB per tick, forever, handed to the collector at a moment it chooses rather than one the
scheduler does. Now a static workspace keyed by N: 229 → 81 bytes of net heap growth per
call, with all 55 blackbox checks including the QP golden vectors unchanged. Safe because
JavaScript is single-threaded and every call completes before the next begins — a worker
sharing the module or a re-entrant caller would need its own, and the comment says so.

**STILL ALLOCATING, named rather than left to be found:** `_controlTick` builds two arrays
per LEAD per channel, about 316 per tick, and the ring trim uses `Array.splice`, an O(n)
copy at an unpredictable moment. Both are the same fix and neither is done.

## Brick 61 — the stack, and putting every measurement on one denominator

Eight commits of this arc shipped without a history entry, so this covers all of them.

### The question that started it

*"How come estimation can be such a win but controlling a system based on that winning
estimation is a fail?"* The split held up everywhere it was tested. Soft sensing wins by
3–14× against the incumbent a plant actually deploys, on four unrelated plants. Control
against a GOOD classical baseline ties or loses. The reason is not the learner: an estimate
is graded against truth the instant it is made, while a correction has to travel a channel
with its own bandwidth, its own sensor placement, and its own collocation — and this project
had already measured six separate knobs (λ, bandwidth, sensor location, signal content, cap,
clock) that all drive the bias to zero and explode the oscillation.

### The denominators were never the same

The pilot's headline 4.22× came from a scratch rig at K 0.25 / E 0.03 against a BARE
position loop. The compliance work was measured at other stiffnesses against other baselines.
Comparing them was comparing three machines.

`test/flexisim/reconcile.test.mjs` puts all of it on one plant, one path, one baseline —
computed torque **plus** `RobotComp`'s identified compliance, i.e. a conventional machine an
engineer would actually ship:

| | contour | vs conventional | u peak |
|---|---|---|---|
| conventional (computed torque + PD + RobotComp) | 4.396e-1 | — | — |
| + pilot | **7.715e-2** | **5.70×** | 0.3186 |
| + tipcomp | 4.388e-1 | 1.00× | 0.0568 |
| + live trim | 5.446e-1 | 0.81× | 0.0500 |

The 5.70× is **larger** than the 4.22× the pilot scored against a bare loop, which is the
part that could not be quoted before. The two rows below it are the estimation/control split
in one table: both corrections are driven by a LIVE error reading and neither helps.

**`act()` RETURNS ZEROS WHEN `!verdict.deploy`**, so a pilot that REFUSED to commission and a
pilot that commissioned and did not help print the identical headline 1.00×. Only `uPk`
separates them, and it is in the table for that reason. Two runs in this arc were mis-read
that way before the column was added — both from guards sized in MOTOR-side torque and
applied to a LINK-side `transmitted()`, a factor of `RATIO` = 100.

### Commissioning over one path does not transfer; commissioning over an envelope does

`test/flexisim/transfer.test.mjs`. A pilot commissioned on a single trajectory and deployed
on an unseen one measured **73× WORSE** at the worst point. Commissioned over an envelope of
five trajectories it is **2.04×** worst-case. `ONE_PATH=1` reproduces the failure.

A soft sensor is a calibrated instrument, and its calibration has to span the range it will
be used over. This is the third independent time this project has reached that: FlowSim's
frozen standardisation across a startup transient, the anti-slosh shaper tuned at one fill,
and now this.

### The clock, and the only genuine control win in the arc

`decisionsPerTs` had been pinned at Ts/30 by a QP-tractability constant that was never
re-measured. Doubling it to 60 is worth 4.62→5.19× on the sharp square, 6.43→8.02× on the
rounded and 12.99→14.16× on the circle — but **only with λ scaled as (DPT/30)²**, because the
QP's `D` is a difference between DECISION steps and halving their spacing quadruples the
penalty it applies to the same physical rate.

Measured on the arm only. The other five plants still default 30.

### The torque channel, and a conclusion this file had to retract

An earlier entry concluded that *exciting at the resonance costs 26%*. That was measured on
the `cmd` torque channel, which is the commanded torque — it carries the reference and not
the machine. On the TRANSMITTED torque the same chirp **halves** the oscillation. The
conclusion was an artefact of an uninformative signal, and the owner's instinct — *"the
actual torque signal should see the resonance"* — is what forced the re-measurement.
`forceChirp` accepts a `[lo, hi]` band and its docstring carries both tables so the retracted
one stays visible.

### Mode ⑧ on the page, and three defects in it

The stack, switchable live: identified compliance and pilot as two checkboxes on one machine
and one lap, because two separate runs never convince anyone.

**1. THE STACK CONTAINED NEITHER HALF.** The first version had zero occurrences of the pilot
and mentioned `TipCompensator` only in comments. Caught by the owner — *"the current stack
results do not add up to previous wins"* — and not by any check, because every check that
existed asserted wiring that was genuinely there.

**2. IT DOUBLE-CORRECTED.** The page commissioned the pilot on the BARE machine, so the
pilot already contained the compliance term and ticking both boxes applied that part twice.
Caught by the owner testing it: *"the mode 5 looks better than 8."* Fixed with an opt-in
`stk-over` flag that commissions the pilot with the compliance already acting, so it learns
only the RESIDUAL. **Opt-in and default off**, because they are two different machines and ⑤
belongs to the bare one — making it unconditional regressed ⑤'s own gate to 3.9e-2 against a
3.5e-2 bar, and the casualty was ⑤ rather than the idea.

**3. THE PAGE COULD NOT REACH THE MACHINE THE NUMBER LIVES ON.** *"The point is to
demonstrate the 5.7 this misses it."* The tab DEFAULTS to K 16 / E 0.15 — the stiff end of
both ladders — where the conventional machine alone already leaves 5.7e-2 against the 4.4e-1
it leaves at K 1 / E 0.06. **The entire error the stack exists to remove has already gone
before ⑧ is switched on.** The owner was also testing on the SQUARE, and the 5.70× is
measured on the rounded rectangle.

Everything else already matched: feed 4e-3, accel 4e-5, corner 40 and the rounded rectangle
are the page's own defaults and are byte-identical to `reconcile.test.mjs`. So the gap was
exactly two sliders and one checkbox, and it is now one button — `Set up the 5.70× machine`
— with every value read off the test rather than chosen.

**TWO DIFFERENCES REMAIN AND ARE STATED RATHER THAN TUNED AWAY:** this tab works about the
centre (12, 0) rather than (14, 1), and it carries backlash, which `reconcile.test.mjs` does
not. Same order, not the same digits.

### A tier violation I committed and then removed

I asserted the stack's PERFORMANCE in `smoke.mjs` and it failed — ⑧ both 6.603e-2 against
compliance-only 5.671e-2 — for a reason that had nothing to do with the stack: it was the
stiff default above. **Performance belongs in plain Node where the plant is stated; the
browser's job is what only the browser can break, which is the wiring.** The assertions are
gone and the reason is written where the next person will reach for them.

Also mine, and also caught by a failing run rather than by review: a `lapOf` helper that read
laps SPANNING the toggle, when `lapScoreP` resets at every lap boundary — so the A/B compared
one configuration against a blend of both.
