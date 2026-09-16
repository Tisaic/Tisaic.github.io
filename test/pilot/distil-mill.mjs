/**
 * @file THE COLUMN THIS PROJECT SCORES WORST ON: DISTURBANCE REJECTION (plan §71).
 *
 * Rated against the field the deployed object scores 2/10 here, its worst aspect by far, and
 * §69 called that structural: it is a map of a window of the COMMANDED REFERENCE, and the cold
 * mill holds one setpoint for ever, so there is no input variation for it to key on. That
 * reasoning is right about the setpoint and wrong about the REFERENCE, and this file is the
 * difference.
 *
 * WHAT A MILL ACTUALLY KNOWS AHEAD. Its dominant error is not the setpoint moving — the setpoint
 * never moves — it is ROLL ECCENTRICITY: `A_ECC·sin(2π·F_ECC·k·DT)`, 30 µm entering the gap
 * through `MM/(MM+QM)` = 2/3, which is ~14 µm rms of a 15.15 µm open loop. It is periodic at the
 * BACKUP ROLL'S ROTATION, and every mill measures roll angle with an encoder: no delay, no
 * tracking error, no metrology the shop does not own. So it is known ahead exactly as the
 * commanded setpoint is known ahead.
 *
 * AND IT IS LEGAL UNDER THE RETIREMENT, which is the part that has to be argued rather than
 * assumed. "Nothing addressed by POSITION IN A LAP survives ... a component may only be addressed
 * by the machine's own STATE." Roll angle is machine state — a physical shaft position, not an
 * index into a program — so a correction keyed on it transfers to any program the mill runs,
 * which is precisely what a lap table does not do. The test of that claim is that the SETPOINT
 * never repeats anything: there is no lap here to memorise.
 *
 * SO THE REFERENCE HANDED TO THE DEPLOYED OBJECT IS NOT ONLY THE SETPOINT — IT IS EVERYTHING
 * KNOWN AHEAD ABOUT WHAT THE MACHINE IS ABOUT TO DO. Declared as two extra reference channels
 * (cos and sin of roll angle, so a linear map can synthesise any amplitude AND any phase, which
 * is what the 100-step transport delay needs), the existing window machinery carries it with NO
 * library change: `refDim` widens, `_rowFrom` reads it, and the deploy path reaches it through
 * the host's own `ctx.lookRaw`. The plant still sees `ref[0]` alone.
 *
 * THE CONTROL IS BUILT INTO THE PLANT AND IT IS A GOOD ONE. The mill's OTHER disturbance is the
 * entry gauge, which the rig declares "unmeasured" and gives periods of 2,150 and 950 steps —
 * NOT commensurate with the 408-step roll turn. So over the training lap the unmeasured
 * disturbance does not repeat with the declared phase, and a map that scored by memorising it
 * could not transfer. Whatever this wins, it wins on the disturbance it was told about.
 *
 * WINDOW: 8 roll turns is a lap of 3,267 steps, so `min(0.61·settle, lap/8)` gives ±408 — one
 * whole turn, and four times the 100-step transport delay it has to lead.
 *
 * KNOBS: TURNS (roll turns per training lap), RIDGE, STD, ONLINE, SEED, NOECC=1 (the falsifier —
 * withhold the declared phase and the object is back to a constant reference).
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { millSpec } from './rigs/specs.mjs';
import { deriveWindow, reportDistil, priceFrom, ridgeLadder, gainLadder, teacherReuse, teachLaps, teachAvg, dietN, emitRow } from './rigs/distilkit.mjs';
import { oracleConverge, oracleTeach } from './rigs/oracleteach.mjs';

// THE ORACLE TEACHER, AND THIS PLANT IS ITS FALSIFIER (plan §73.11). It needs a cascade to
// iterate, and this plant's cascade is the GOOD one — 1.74x, deploying — where the barrel's is
// 1.05x and the column's 0.39x. If the barrel's refusal is the cascade's plant model rather than
// the teacher, this is where it should work.
const ORACLE = process.env.ORACLE === '1';
/**
 * PARAM=1: THE LAP-FREE TEACHER (plan §90.3).
 *
 * The default teacher on this plant converges a LAP-INDEXED correction and hands the distillation
 * a finished target. That is the object the retirement removed from the PRODUCT and left in the
 * TEACHER, which §80.3 names as this project's disturbance-rejection ceiling and §73.13 prices at
 * 74-89% of what the product costs these plants. `AutoStack`'s PARAMETRIC engine iterates the
 * POLICY instead — a map of the commanded reference, fitted and re-measured on the machine every
 * pass — so what the basis cannot express is never accumulated.
 *
 * It needs BOTH halves and the ladder says so by refusing quietly: `runs.every((t) => t.teach)`
 * has to hold AND `distil.parametric` has to be armed, or the run silently takes the other route
 * and the report reads `engine: hff` (rule 25).
 */
const PARAM = process.env.PARAM === '1';
import * as RM from './rigs/rollmill-rig.mjs';

if (process.env.SUITE !== 'full') {
  console.log('\ndistil-mill: SKIPPED (full tier only — one commissioning)\n');
  process.exit(0);
}

const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
let failed = 0;
const check = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  → ${detail}`}`);
  if (!cond) failed++;
};
console.log('\ndistil-mill: the DEPLOYED object on a REGULATOR — the column we score worst on\n');

// ---------------------------------------------------------------- the declared phase
const TURNS = env('TURNS', 8);
const PER = 1 / (RM.F_ECC * RM.DT);                 // steps per backup-roll revolution
const LAP = Math.round(TURNS * PER);
const NOECC = process.env.NOECC === '1';
/**
 * DECLARE THE LINE SPEED, AND SO REACH THE GUARD §90.4 SHIPPED AND NEVER DEMONSTRATED (plan §100).
 *
 * §89.2 measured that this plant's win rests on TWO declarations that behave completely
 * differently: the roll phase is read by an ENCODER, honest at any line speed, so a GAUGE change
 * is inert to three figures; the transport delay is a NUMBER TYPED IN at commissioning, and the
 * lead the fit chose against it is baked into the WEIGHTS, so another line speed reads 0.770x and
 * then 0.562x. Nothing made worse, but quietly degrading.
 *
 * §90.4 built the guard for exactly that and could not demonstrate it: no plant declared anything.
 * It was worse than that, and §100 found it — `AutoStack` never passed `decls` to `actLook` at
 * all, so the fifth argument defaulted to null and the guard was inert THROUGH THE ONE PRESS by
 * construction rather than by measurement. That is §82's and §78.5's shape for the third time: a
 * guard shipped armed and unreachable.
 *
 * THE PREDICTION IS ON RECORD AND IS WRITTEN HERE BEFORE THE RUN (rule 59, quoting §90.4): *on the
 * mill's line-speed rows it should convert 0.770x and 0.562x into REFUSALS at 1.000x, and if it
 * REPAIRS them instead the instrument is wrong (rule 14), because a fading guard can only reduce a
 * correction and can never re-time a delay.* The GAUGE rows must not move at all, because nothing
 * declared has changed on them — and that is the half that makes this a control rather than a
 * demonstration (rule 9): a guard that refuses the speed rows AND the gauge rows is refusing on
 * the fact that a knob was turned, not on the operating point.
 *
 * ---------------------------------------------------------------- AND A SECOND PREDICTION, MINE,
 * WRITTEN BEFORE THE RUN AND CONTRADICTING §90.4's OWN (rule 59).
 *
 * §90.4 states the success criterion as *convert 0.770x and 0.562x into REFUSALS at 1.000x*, and
 * those two numbers are FRACTIONS OF THE COMMISSIONED FACTOR, not factors. Read §89.2's own table
 * in absolute terms and the same two rows are **2.020x and 1.474x — both of them HELPING**, with
 * nothing made worse at any operating point. So a guard that fires there takes this machine from
 * 2.020x to 1.000x and from 1.474x to 1.000x, and doing exactly what it was designed to do is
 * STRICTLY WORSE than not having it.
 *
 * I therefore predict the mechanical half CONFIRMS (the speed rows read 1.000x, the gauge rows are
 * untouched) and the product half REFUTES: the guard is correct about the declaration and wrong
 * about the machine. If instead the speed rows come back BETTER than 2.020x and 1.474x, the
 * instrument is wrong and not the design (rule 14) — a fading guard multiplies the correction by a
 * number in [0,1] and cannot re-time a delay, so it has no way to improve anything.
 *
 * What that would establish is a criterion rather than a verdict: **a guard must be scored on
 * DELIVERED OUTCOME, not on faithfulness to its declaration.** A stale declaration is a reason to
 * re-measure, not a reason to stop correcting, and the only thing that licenses refusing is
 * evidence that the correction HARMS — which on this plant does not exist at any point tried.
 */
const DECL = process.env.DECL !== '0' && process.env.DECL !== undefined;
/** Roll angle, as an encoder reports it. `NOECC=1` withholds it — the falsifier. */
const phase = (k) => 2 * Math.PI * RM.F_ECC * k * RM.DT;
/**
 * ENTRY=1: DECLARE THE ENTRY GAUGE — the component §85 measured as 88% of what this object LEAVES
 * (plan §92).
 *
 * §71's win rests on declaring the ROLL PHASE, and §85 then found the bound was on the wrong
 * support: the object is 95% through the DECLARED eccentricity and **0% through the undeclared
 * entry wander**, which is 7% of the open-loop error, **88% of the error ENERGY the shipped
 * object leaves**, and worth **2.68x** (2.625x against 7.029x with it held flat). At that point
 * the residual IS this plant's 2 µm X-ray noise, so there is nothing else in the plant.
 *
 * The rig has called that wander "unmeasured" since it was written, and that is a MODELLING
 * CHOICE rather than a physical fact: every cold mill has an entry gauge, more standard than the
 * roll-angle encoder §71 already relies on. So this is the same product move on the component
 * that is left — and §80's rule says it should work, because rejecting a disturbance needs the
 * TEACHER to represent it AND the MAP to express it, and §84.1 measured that `hff` DOES represent
 * this one (averaging it out of the record drops the teacher 2.9x) while a map of the commanded
 * reference cannot.
 *
 * IT ENTERS AS A PREVIEW CHANNEL, WHICH IS WHAT AN ENTRY GAUGE PHYSICALLY IS. Mounted 3 m
 * upstream at 5 m/s it reads, at step k, the metal that reaches the roll gap 300 steps later —
 * three times this plant's own transport delay. The window's own offsets then straddle that, so
 * the map sees the disturbance coming rather than arriving. Preview is the one correction class
 * that has ever worked in this project.
 *
 * DECLARED RELATIVE TO NOMINAL, because the absolute reading is ~2 mm against a setpoint of 1.25
 * and differences of order 0.02 — one ridge acting on blocks a hundred apart is rule 32, which
 * this plant's own harness already paid for once (§63.4).
 */
const ENTRY = process.env.ENTRY === '1';
/**
 * ONE GAUGE ON THE LINE, which is what a mill has. `entryAt` is the same deterministic function of
 * step in every mill this rig builds — the wander is a property of the incoming coil, not of a
 * particular run — so the readings the fit sees and the readings the scored run sees describe the
 * same metal through the same instrument, and only the gauge's own noise separates them. Building
 * a gauge per caller would have modelled several gauges on one stand, and sharing a mill with the
 * rolling one would have tied the reading to whichever run happened to step it (rule 61).
 */
const GAUGE = RM.makeMill(9001);
const refOf = (k) => {
  const base = NOECC ? [RM.S0] : [RM.S0, Math.cos(phase(k)), Math.sin(phase(k))];
  // DECLARED RELATIVE TO NOMINAL — the absolute reading is ~2 mm against a setpoint of 1.25 and
  // wander of order 0.02, and one ridge acting on blocks a hundred apart is rule 32, which this
  // plant's own harness paid for once already (§63.4).
  if (ENTRY) base.push(GAUGE.entryGauge(k) - RM.H0);
  return base;
};
const REFDIM = (NOECC ? 1 : 3) + (ENTRY ? 1 : 0);

const SETTLE = 400;   // the capsule lag is 10 steps; what must be spanned is the 100-step delay
const { reach: REACH, offsets: OFFSETS, rule: RULE } = deriveWindow({
  settle: SETTLE, lapMin: LAP, win: process.env.WIN === undefined ? undefined : env('WIN') });
console.log(`  ${TURNS} roll turns per lap = ${LAP} steps (a turn is ${PER.toFixed(1)}), `
  + `window ±${REACH} raw steps against a ${RM.DLY}-step transport delay  [rule ${RULE}]`);
console.log(`  reference channels: ${REFDIM}${NOECC ? '  (NOECC — the phase is WITHHELD)'
  : '  (setpoint, cos and sin of roll angle)'}`);
console.log(`  the UNMEASURED entry wander runs at 2150 and 950 steps, NOT commensurate with the `
  + `${PER.toFixed(0)}-step turn — so it cannot be memorised against the declared phase\n`);

/** Four training runs: the same declared phase, four different unmeasured-disturbance draws. */
// LAPS PER TEACHER CALL (plan §73.2). One lap settles under the correction just handed over, the
// rest are scored and the last is the record the teacher inverts. With the plant carried the
// first is the only settle there is, so `TLAPS=2` asks whether the second scored lap is buying
// noise reduction worth a third of the commissioning. Unset is 3 and byte-identical.
const TLAPS = teachLaps();
// TAVG=<n>: average the teacher's record over the last n laps (plan §80.7, §84.1). This plant is
// the FALSIFIER rather than a confirmation: every run here starts a whole number of roll turns in
// (`W` below), which MAKES the declared disturbance commensurate with the lap — §80.6's own
// account of why the mill wins where the barrel does not. A component already commensurate cannot
// average down, so if the mechanism is right this knob must read INERT here (rule 9's half that
// instruments usually fail). Unset is 1 and byte-identical.
const TAVG = teachAvg(TLAPS);
const distilRuns = (auto) => dietN([0, 1, 2, 3]).map((i) => {
  // Each run starts a whole number of TURNS in, so the declared phase is aligned to the lap,
  // and a different number of them, so the UNMEASURED entry wander sits at a different phase.
  const W = Math.round((37 + 11 * i) * PER);
  // THE PLANT'S OWN DRIVE LOOP, NAMED ONCE AND HANDED TO BOTH TEACHERS (plan §90.3).
  // `oracleConverge` iterates a lap prefix with it and `oracleTeach` takes ONE increment with it;
  // a second copy is how a harness comes to teach through a loop its own scoring never ran
  // (rule 61, and `distil-tank.mjs` paid for exactly that in §67.3).
  const DRIVE = async ({ pre, active = false, uOut = null, trace = false, onStep = null }) => {
    const m = RM.makeMill(1 + i);
    for (let q = 0; q < W; q++) m.step(RM.S0);
    const want = [];
    let s2 = 0, n = 0;
    const out = trace ? Array.from({ length: LAP }, () => [0]) : null;
    for (let j = 0; j < TLAPS * LAP; j++) {
      const kk = ((j % LAP) + LAP) % LAP;
      if (onStep) onStep(kk);
      const look = (o) => refOf(W + ((j + o) % LAP + LAP) % LAP);
      const a = active ? auto.act({ look, lookRaw: look, k: j }) : null;
      const u = pre[0][kk] + (a ? (a[0] || 0) : 0);
      if (uOut && a) uOut[0][kk] = a[0] || 0;
      m.step(RM.S0 + u);
      want.push((RM.MM * RM.S0 + RM.QM * RM.H0) / (RM.MM + RM.QM));
      if (want.length > RM.DLY + 2) want.shift();
      const w = want.length > RM.DLY ? want[want.length - 1 - RM.DLY] : RM.HREF;
      const g = m.gauge();
      if (trace && j >= (TLAPS - 1) * LAP) out[kk][0] = g - w;
      if (j >= (TLAPS - 1) * LAP) { s2 += (g - w) ** 2; n++; }
    }
    return { score: Math.sqrt(s2 / n), rec: out };
  };

  return {
    lap: LAP,
    closed: true,
    refAt: (k) => refOf(W + ((k % LAP) + LAP) % LAP),
    // THE OPERATING POINT THIS RUN WAS TAKEN AT (plan §90.4, reached in §100). Every training run
    // is at the commissioning line speed, so the observed SPAN is a POINT — which is the whole
    // case §90.4 makes: *one commissioning observes one value, and widening it with a margin
    // would be a per-plant constant invented to soften a refusal*. Tolerance would have to come
    // from a DIET that varies the line speed, which is target 2's own lesson (feed-invariance
    // comes from training across feeds, never from indexing by feed) and is not what this diet
    // does. `DECL=0` is the control and is byte-identical to every mill number on record.
    ...(DECL ? { declare: { vLine: RM.makeMill(1 + i).vLine } } : {}),
    // THIS PLANT IS DELIBERATELY NOT CARRIED ACROSS THE TEACHER'S CALLS, and it is the only one
    // (plan §72.15). Everywhere else the per-call warm-up is a SETTLE and rebuilding it wastes the
    // plant's time; here `W` is a PHASE ALIGNMENT — a whole number of roll turns, so the declared
    // cos/sin reference matches the shaft the correction will meet (plan §71.2). A carried plant
    // would advance by `3*LAP` = 3267 steps against a 408.4-step turn, which is 8.0 turns and not
    // exactly 8, so the phase would drift a fifth of a step per call while `refAt` stayed put.
    // That is §71.2's own defect — the object handed a shaft angle that is not the shaft's — and
    // a blanket "carry the plant" would have reintroduced it silently.
    run: async (corr) => {
      const m = RM.makeMill(1 + i);
      for (let j = 0; j < W; j++) m.step(RM.S0);
      const want = [];
      let s2 = 0, n = 0;
      const err = [new Float64Array(LAP)];
      for (let j = 0; j < TLAPS * LAP; j++) {
        const kk = ((j % LAP) + LAP) % LAP;
        const u = corr ? corr.at(kk) : [0];
        m.step(RM.S0 + (u[0] || 0));
        want.push((RM.MM * RM.S0 + RM.QM * RM.H0) / (RM.MM + RM.QM));
        if (want.length > RM.DLY + 2) want.shift();
        const w = want.length > RM.DLY ? want[want.length - 1 - RM.DLY] : RM.HREF;
        const g = m.gauge();
        if (j >= (TLAPS - TAVG) * LAP) err[0][kk] += (g - w) / TAVG;
        if (j >= (TLAPS - 1) * LAP) { s2 += (g - w) ** 2; n++; }
      }
      return { score: Math.sqrt(s2 / n), err };
    },

    // PARAM=1: THE LAP-FREE TEACHER (plan §90.3). `oracleTeach` builds `run` and `teach` from the
    // SAME drive closure `oracleConverge` takes below, so what changes is which thing iterates —
    // a `DistilPolicy` in the product's own row space rather than a lap prefix — and nothing about
    // this plant's loop. It needs `distil.parametric` armed on the spec as well, which is where
    // `AutoStack` decides; supplying `teach` alone is inert (rule 25 — and the ladder's own
    // `runs.every((t) => t.teach)` means a partially-wired diet silently takes the other route).
    ...(PARAM ? oracleTeach({ auto, lap: LAP, nc: 1, drive: DRIVE }) : {}),
    // The plant's own drive loop for the oracle teacher; the iteration is in `oracleteach.mjs`.
    ...(ORACLE ? { converge: oracleConverge({
      auto, lap: LAP, nc: 1, passes: +(process.env.OPASSES || 8), debug: process.env.ODBG === '1',
      drive: DRIVE,
    }) } : {}),
  };
});

// THE PHASE MUST BE THE SHAFT'S, NOT THE PROGRAM'S. `millSpec.fresh()` warms the mill 4,000
// steps before the scored run begins, and 4,000/408.4 is 9.79 TURNS — so at scored step 0 the
// backup roll is 0.79 of a revolution from where `phase(0)` says it is, and the map is handed a
// shaft angle that is not the shaft's. The training runs hid it because each of them warms a
// WHOLE number of turns by construction. An encoder reads the actual angle, so the reference the
// object is given must too: this is the same frame error as the unclosed lap and the decimated
// look-ahead, in a third costume, and it is worth the four lines it takes to say so.
const WARM = 4000;
const spec = { ...millSpec,
  // NO CASCADE: this rung's teacher is `hff`, so the cascade would be commissioned,
  // scored and then REPLACED by the rung that wins (plan §73.1). `DEPTH=2` is the control.
  // A CASCADE IS COMMISSIONED ONLY WHEN A TEACHER NEEDS ONE TO ITERATE (plan §90.2). `hff`, the
  // default teacher here, does not — it probes at the lap's harmonics — so this plant runs
  // `depth: 0` and the cascade never exists. BOTH the oracle teacher and the PARAMETRIC one take
  // their increments from a commissioned cascade, so both must ask for one; it is still never
  // armed, because what ships is decided by scoring the distilled policy afterwards.
  depth: (ORACLE || PARAM) ? 1 : 0,
  refAt: (k) => refOf(WARM + k),
  distil: { refDim: REFDIM, ridge: env('RIDGE', 1e-6), offsets: OFFSETS,
    ...(PARAM ? { parametric: true, passes: +(process.env.PPASSES || 4) } : {}),
    // THE CASCADE IS THE TEACHER AND NOT A CANDIDATE TO SHIP (plan §73.14). A cascade exists on
    // these plants only because `ORACLE=1` asks for one to iterate; judged as a RUNG it changes
    // the bar the distilled policy must clear, and on the quadruple tank that is the difference
    // between shipping 2.59x and shipping the cascade's 1.05x with the policy refused for not
    // beating it. `lib/flexisim/autohost.js` has defaulted this to TRUE since the rung was built,
    // for exactly this reason; the plant harnesses never set it because they never had a cascade.
    ...(ORACLE ? { teacherOnly: true } : {}),
    ...(ridgeLadder() ? { ridges: ridgeLadder() } : {}),
    ...(gainLadder() ? { gains: gainLadder() } : {}),
    ...(teacherReuse() ? {} : { teacherReuse: false }),
    ...(process.env.STD === '0' ? {} : { standardize: true }),
    ...(process.env.ONLINE === '0' ? { online: false } : {}) },
  distilRuns };

announce();
const price = priceFrom();
const { rep, auto, scoreOn } = await ladder(spec);
price.close({ dt: RM.DT, rep });
const { inSample } = await reportDistil({ rep, runs: distilRuns(),
  nFeat: OFFSETS.length * REFDIM + 1, auto });

/**
 * TARGET 1 ON A REGULATOR, WHICH IS A QUESTION THIS FILE'S OWN DOCUMENTATION SAID DID NOT EXIST
 * (plan §89.2, task #67).
 *
 * CLAUDE.md read: *not asked, deliberately — a regulator whose setpoint never moves does not have
 * a second program*. The premise is true and the conclusion does not follow. A regulator has no
 * second TRAJECTORY and plainly has a second OPERATING POINT — a different target gauge, a
 * different line speed — and *does the object hold where it was not commissioned* is target 1's
 * question in the form this plant can be asked it. Writing "not applicable" over "not measured" is
 * rule 25 itself, committed two sentences after citing it.
 *
 * THE PREDICTIONS WERE WRITTEN DOWN BEFORE THIS RAN (rule 59) and they are opposite, which is
 * what makes the pair worth running rather than either alone:
 *
 *   A GAUGE CHANGE should be MET comfortably. §71 proved the win is ALL of one DECLARED roll
 *   phase — withhold it and the object is provably inert at exactly 1.000x — and a roll phase is
 *   a property of the SHAFT. Nothing about rolling to 1.40 mm instead of 1.50 moves it.
 *
 *   A LINE-SPEED CHANGE should NOT be. It moves the transport delay the whole result rests on,
 *   and that delay is DECLARED at commissioning (`pilotOpts.deadTime`) rather than re-measured —
 *   so the commissioned object is holding a number about the plant that the plant has changed.
 *   The roll frequency moves with it, but the ENCODER is honest at any speed, so the declared
 *   phase handed to the object stays correct and the delay is the only thing that goes stale.
 *   That separation is the point: one axis where the declaration survives and one where it does
 *   not, on one plant, with the same frozen weight vector.
 *
 * Each operating point is scored against the BARE machine AT THAT OPERATING POINT, so a harder
 * gauge cannot read as the object failing (rule 19, and §75's own protocol).
 */
const OPS = [
  { tag: 'the commissioned point  h 1.50 mm, 5.0 m/s', o: {} },
  { tag: 'GAUGE   h 1.40 mm, 5.0 m/s (delay unmoved)', o: { href: 1.40 } },
  { tag: 'GAUGE   h 1.65 mm, 5.0 m/s (delay unmoved)', o: { href: 1.65 } },
  { tag: 'SPEED   h 1.50 mm, 4.0 m/s (delay 100→125)', o: { vLine: 4.0 } },
  { tag: 'SPEED   h 1.50 mm, 6.5 m/s (delay 100→ 77)', o: { vLine: 6.5 } },
];
console.log(`\n  TARGET 1 ON A REGULATOR — the SAME frozen object at a second OPERATING POINT`);
console.log(`    (no refit, no recommission; each point against the BARE machine at that point)\n`);
const t1rows = [];
for (const { tag, o } of OPS) {
  const probe = RM.makeMill(1, o);
  // The reference this operating point commands, and the roll phase an ENCODER would report on
  // it — honest at any line speed, which is what isolates the transport delay as the one stale
  // declaration.
  const ph = (k) => 2 * Math.PI * probe.fEcc * k * RM.DT;
  const rAt = (k) => (NOECC ? [probe.s0]
    : [probe.s0, Math.cos(ph(WARM + k)), Math.sin(ph(WARM + k))]);
  const fr = () => { const m = RM.makeMill(1, o); for (let i = 0; i < 4000; i++) m.step(m.s0); return { m, want: [] }; };
  // WHAT THE ENGINEER WOULD TYPE IN AT THIS OPERATING POINT. `probe.vLine` is the mill's own
  // line speed, so the declaration is READ OFF THE PLANT rather than restated here — a second
  // copy of the number is how a declaration comes to disagree with the machine it describes
  // (rule 61). With `DECL` unset nothing is declared and the guard reads full coverage, which is
  // the byte-identical control for every mill figure on record.
  const dc = DECL ? { vLine: probe.vLine } : null;
  const bare = (await scoreOn({ refAt: rAt, fresh: fr, N: RM.T_RUN, decls: dc }, { armed: false })).score;
  const on = (await scoreOn({ refAt: rAt, fresh: fr, N: RM.T_RUN, decls: dc })).score;
  const x = bare / on;
  t1rows.push({ tag, x, bare, on, dly: probe.dly });
  console.log(`    ${tag}   ${(1000 * bare).toFixed(2)} → ${(1000 * on).toFixed(2)} µm   `
    + `${x.toFixed(3)}x`);
}
const xComm = t1rows[0].x;
console.log(`\n    against the commissioned point's ${xComm.toFixed(3)}x:`);
for (const r of t1rows.slice(1)) {
  console.log(`    ${r.tag}   ${(r.x / xComm).toFixed(3)} of it   `
    + `${r.x / xComm >= 1 / 1.3 ? 'MET' : 'NOT MET'}${r.x < 1 ? '   ← MADE WORSE' : ''}`);
}
const held = t1rows.slice(1);
const worst = held.reduce((a, b) => (b.x < a.x ? b : a));
console.log('');
// The MANDATE's clause is asserted; the 1.3x bound is reported, exactly as every other plant
// does it (plan §88.4) — a suite pinned to a bar plants are measured to fail is permanently red.
check('target 1: no operating point is made worse by the frozen object',
  held.every((r) => r.x >= 0.98), `worst ${worst.tag} at ${worst.x.toFixed(3)}x`);
emitRow(rep, auto, { t1: worst.x / xComm, t1Worse: worst.x < 1 });

check('the mill is not made worse by anything the ladder ships',
  rep.best <= rep.base, `${rep.base.toExponential(3)} → ${rep.best.toExponential(3)}`);
check('the distilled rung reached a REGULATOR at all — a plant whose setpoint never moves, which '
  + 'is the column this object scores worst on and the one §69 called structural',
  !!(rep.distil && (rep.distil.policy || rep.distil.note)),
  JSON.stringify(rep.distil || null));
console.log(failed ? `\n  ${failed} check(s) failed\n` : '\n  all checks passed\n');
process.exit(failed ? 1 : 0);
