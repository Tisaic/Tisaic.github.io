/**
 * @file THE FOUR PLANT SPECS, EXTRACTED FROM `plants.test.mjs` so an instrument can drive the
 * same plants without owning a second copy of their routing.
 *
 * A second copy of a plant's routing has shipped a defect three separate times in this project
 * — `rigs/arm-rig.mjs` says so in its own header — and `rigs/ladder.mjs` was extracted from this
 * same file for the same reason when the real-data plants needed the driver. This is that move
 * repeated one level up: the DRIVER was shared first, now the SPECS are, so `plants.test.mjs`
 * and any cross-plant instrument are reading one description of each machine.
 *
 * A spec states everything the machine knows about ITSELF — its channels, its authority, its
 * guards, its program, how to make a fresh one and how to step it — and nothing about the
 * controller. `step(st, ref, u, k)` returns `{ measured, truth }`: what an operator's screen
 * shows, and the error a controller is scored on.
 *
 * THE CONTROL THAT LICENSES THE MOVE is that `plants.test.mjs` is BYTE-IDENTICAL across it,
 * wall clock excepted (rule 21) — the thing that should not change comes back unchanged.
 *
 * SEEDED RIGS MATTER HERE AND IT IS NOT AN ACCIDENT. `makeMill(1)` and `makeBarrel(7)` seed
 * their own noise, so two `fresh()` calls produce the SAME noise sequence. An instrument that
 * runs a plant twice — once undriven, once with a correction — and subtracts, therefore cancels
 * the measurement noise EXACTLY rather than averaging it away.
 */
import { UCAP, makeTanks, levelsAt, voltsFor, refAtStep, PROG } from './tanks-rig.mjs';
import * as WB from './woodberry-rig.mjs';
import * as RM from './rollmill-rig.mjs';
import * as TH from './thermal-rig.mjs';
import * as EM from '../emps-rig.mjs';
import * as RA from './realarm-rig.mjs';
import * as PD from './pend-rig.mjs';
import * as RT from './realtanks-rig.mjs';
import * as RX from './realexch-rig.mjs';
import * as PL from './pidloop-rig.mjs';
import { makeArm, mkPath, homeAt, stepArm, ikOf, randomPolygon, PG } from './arm-rig.mjs';
import { designTour } from '../../../lib/flexisim/demopath.js';
import { BENCH_SERVO } from '../../../lib/flexisim/compensator.js';

// Minimum-phase configuration. Outflow goes as sqrt(level), so nothing about it is linear,
// and the two pumps cross-feed: each fills one tank directly and the other's upper tank.
const G_MP = [0.7, 0.6];


const tankSpec = {
  name: 'quadruple tank (minimum phase) — levels, cm rms',
  channels: [0, 1].map(() => ({ lo: 2.0, hi: 3.6, vMax: 4e-3, aMax: 2e-5, jMax: 2e-7 })),
  uMax: UCAP, nMeasured: 4,
  guards: [{ index: 0, max: 19 }, { index: 1, max: 19 }],
  start: voltsFor(G_MP, 10.7, 10.7),
  N: PROG,
  refAt: (k) => { const h = refAtStep(Math.min(k, PROG)); return voltsFor(G_MP, h[0], h[1]); },
  floor: 0,
  fresh: () => {
    const p = makeTanks(G_MP);
    const s = voltsFor(G_MP, 10.7, 10.7);
    for (let i = 0; i < 30000; i++) p.step(s[0], s[1]);
    return p;
  },
  step: (p, ref, u) => {
    p.step(ref[0] + u[0], ref[1] + u[1]);
    const want = levelsAt(G_MP, ref[0], ref[1]);
    return { measured: [p.h[0], p.h[1], p.h[2], p.h[3]],
      truth: [p.h[0] - want[0], p.h[1] - want[1]] };
  },
};

const wbSpec = {
  name: 'Wood-Berry column — compositions, rms',
  channels: [0, 1].map(() => ({ lo: WB.UBOX.lo, hi: WB.UBOX.hi,
    vMax: 6e-3, aMax: 6e-5, jMax: 6e-7 })),
  uMax: WB.UMAX, nMeasured: 2,
  guards: [{ index: 0, max: 25 }, { index: 1, max: 25 }],
  start: [0, 0], N: WB.T_END, floor: 0,
  refAt: (k) => { const sp = WB.setpointAt(Math.min(k, WB.T_END - 1)); return WB.inputsFor(sp[0], sp[1]); },
  fresh: () => { const c = WB.makeColumn(); const sp = WB.setpointAt(0);
    const u0 = WB.inputsFor(sp[0], sp[1]);
    for (let i = 0; i < 3000; i++) c.step(u0); return c; },
  step: (c, ref, u) => {
    c.step(ref.map((r, j) => r + u[j]));
    const want = WB.outputsFor(ref);
    return { measured: c.y.slice(), truth: [c.y[0] - want[0], c.y[1] - want[1]] };
  },
};

const millSpec = {
  name: 'cold mill AGC — exit gauge, mm rms',
  channels: [{ lo: RM.S0 - 0.12, hi: RM.S0 + 0.12, vMax: 3e-3, aMax: 3e-4, jMax: 3e-5 }],
  uMax: 0.06, nMeasured: 3,
  // THE GAUGE IS A METRE DOWNSTREAM AND THAT IS GEOMETRY, NOT A TUNED CONSTANT. `RM.DLY` is the
  // mounting distance over the line speed — the number the engineer who installed the gauge
  // already knows — and the probe cannot recover it from data because a dead time and a slow
  // rise move the 90% crossing identically. `invert.mjs` measures this plant at dead/rise 0.83:
  // 83% of its response is transport delay before anything moves at all, so a horizon built from
  // a measured settle lands entirely inside the dead zone. Undeclared the ladder refuses at
  // 1.00x; declared, `rollmill.test.mjs` delivers 1.45x on 8 of 8 seeds.
  // AND THE REPRESENTATIVE PROGRAM OF A REGULATOR IS A HOLD, which is the second declaration
  // this plant needs and for the same reason as the first: it is a fact the engineer knows and
  // the probe cannot recover. This mill's job is to hold the gap at S0 while an eccentricity
  // disturbance acts on it — the setpoint never moves — while BOTH of the verify's built-in
  // regimes MOVE (a filtered-noise scribble and a trapezoid from the rate limits). Without it
  // the gate scores a regulator on tracking, twice over.
  pilotOpts: { deadTime: RM.DLY, verifyRef: () => [RM.S0] },
  guards: [{ index: 0, max: 400 }],
  start: [RM.S0], N: RM.T_RUN, floor: 0,
  refAt: () => [RM.S0],
  // THE OPERATING POINT TRAVELS ON THE STATE, NOT IN THIS MODULE'S CONSTANTS (plan §89.2).
  // `step` used to read `RM.S0`, `RM.H0`, `RM.HREF` and `RM.DLY` directly, which is right for one
  // mill and makes a SECOND operating point unreachable through `scoreOn` — the instrument target
  // 1 is measured with everywhere else. It reads them off the mill it is stepping now. Unset is
  // byte-identical, because `makeMill()` with no overrides returns exactly those constants.
  fresh: () => { const m = RM.makeMill(1); for (let i = 0; i < 4000; i++) m.step(m.s0); return { m, want: [] }; },
  step: (st, ref, u) => {
    st.m.step(ref[0] + u[0]);
    // THE REFERENCE IS DELAYED TO MATCH THE MEASUREMENT — strip tracking, and what every
    // mill does. The X-ray gauge is a metre downstream, so the metal it reads left the gap
    // 200 ms ago and must be compared against the target the gap was holding THEN.
    st.want.push((RM.MM * ref[0] + RM.QM * st.m.h0) / (RM.MM + RM.QM));
    if (st.want.length > st.m.dly + 2) st.want.shift();
    const want = st.want.length > st.m.dly ? st.want[st.want.length - 1 - st.m.dly] : st.m.href;
    // ONE READING PER SAMPLE. Calling the gauge twice draws two independent noise samples,
    // so the signal the model is given and the truth it is asked to predict would disagree
    // by pure noise.
    const g = st.m.gauge();
    return { measured: [st.m.F, st.m.S, g], truth: [g - want] };
  },
};

const barrelSpec = {
  name: 'extruder barrel — zone temperatures, K rms',
  channels: [0, 1, 2].map(() => ({ lo: TH.PBOX.lo, hi: TH.PBOX.hi,
    vMax: 3e-2, aMax: 2e-4, jMax: 2e-6 })),
  uMax: TH.UCAP, nMeasured: TH.NZ,
  guards: [0, 1, 2].map((i) => ({ index: i, max: 265 })),
  start: TH.powerFor(TH.RECIPE[0]), N: TH.PROG, floor: 0,
  refAt: (k) => TH.powerFor(TH.setpointAt(Math.min(k, TH.PROG))),
  // §123's NAMED FALSIFIER, BUILT (plan §132). This settle ignores the segment it is about to
  // run and holds the RECIPE's first level, so on `dirinvkit`'s excitation every FRESH segment
  // opens with an uncommanded recovery transition from that level to its own random start — and
  // the CARRIED record, which begins where the previous segment ended, never contains one. That
  // is the one surviving candidate §123 left for the barrel's carried rows being VOID by their
  // own shuffle control, and it is the ONE plant of four with this shape: the real tanks, the
  // real exchanger and the column all start every segment where their `fresh()` settles, and
  // §131 measured the carry CLEAN on all three. `TH_FRESHSEG=1` honours the segment instead.
  // Default OFF and byte-identical, which the knob is FOR — `excite` passes `s` on every call,
  // so without a flag this would silently move §119, §120 and §123's barrel numbers (rule 21).
  fresh: (seg) => {
    const p = TH.makeBarrel(7);
    const st = (process.env.TH_FRESHSEG === '1' && seg && seg.refAt)
      ? seg.refAt(0) : TH.powerFor(TH.RECIPE[0]);
    for (let i = 0; i < 20000; i++) p.step(st);
    return p;
  },
  step: (p, ref, u) => {
    p.step(ref.map((r, j) => r + u[j]));
    const y = p.read(), want = TH.tempsAt(ref);
    return { measured: y, truth: y.map((val, i) => val - want[i]) };
  },
};

/**
 * THE EMPS SERVO AXIS — THE POSITIVE CONTROL `invert.mjs` NEVER HAD (plan §84.9).
 *
 * The four specs above are the four plants `plants.test.mjs` drives, and every diagnosis
 * `invert.mjs` has produced is on a plant that LOSES: non-minimum phase refuted on four losers,
 * nonlinearity refuted on four losers, the column's RGA 2.01 and the mill's dead/rise 0.83. An
 * instrument whose every reading comes from failing cases has no idea what a WINNING plant looks
 * like on its own axes, which is rule 9's half that instruments usually fail — if 0.0% INVERSE
 * and a 2.00 scaling are what a bad plant reads too, they discriminate nothing.
 *
 * EMPS is the cheapest winner here: 14.7x in the six-plant pass, one channel, and a rig that loads
 * in 44 ms. It is a SPEC and not a second drive loop — `emps.test.mjs` keeps its own `score()`
 * because that scores a controller over laps, where this holds a correction and watches the plant,
 * which is a different question with a different shape (rule 61 is about two copies of ONE thing).
 *
 * The correction enters as a REFERENCE OFFSET, which is where the pilot puts it on this axis, and
 * the machine is BARE (`ff = 0`) exactly as the other four specs drive raw plants.
 */
const empsSpec = {
  name: 'EMPS servo axis — position, mm rms',
  channels: [{ lo: -0.2, hi: 0.2, vMax: 1e-3, aMax: 1e-4, jMax: 1e-5 }],
  uMax: 0.02, nMeasured: 2,
  start: [EM.PR.q[0]], N: EM.P, floor: 0,
  refAt: (k) => [EM.PR.q[Math.min(k, EM.P - 1)]],
  fresh: () => ({ m: EM.makeMachine(EM.PR.q[0], 0) }),
  step: (st, ref, u) => {
    st.m.step(ref[0] + (u[0] || 0));
    return { measured: [st.m.q, st.m.v], truth: [st.m.q - ref[0]] };
  },
};

/**
 * THE REAL FLEXIBLE ROBOT ARM (DaISy 96-009) — the plant whose cascade refusal has NO STATED CAUSE
 * (plan §84.11). `realarm.test.mjs` records that it "REFUSES the pilot cascade, whose correction is
 * WRONG rather than merely clipped — opened 3x it clamps 56% of samples at 0.00x, opened 10x it
 * trips the guard, and the shipped result is byte-identical at every cap", which rules out the
 * authority and leaves the reason open. §84.9 gave `invert.mjs` a column that separates winners
 * from losers, so the cheapest thing to do with a new diagnostic is point it at the open case
 * before building anything (rule 1).
 *
 * The correction is a POSITION-REFERENCE offset, which is where the pilot puts it on this plant,
 * and the machine is the rig's own settled `makeMachine()` — the same starting condition
 * `realarm.test.mjs` scores from, so the two cannot disagree about what plant this is.
 */
const realarmSpec = {
  name: 'real flexible robot arm (DaISy 96-009) — tip position',
  channels: [{ lo: -3 * RA.AMP, hi: 3 * RA.AMP, vMax: RA.AMP / 32, aMax: RA.AMP / 1024, jMax: RA.AMP / 32768 }],
  uMax: RA.UCORR, nMeasured: 3,
  start: RA.refAtStep(0), N: RA.PROG, floor: 0,
  refAt: (k) => RA.refAtStep(k),
  fresh: () => ({ m: RA.makeMachine() }),
  step: (st, ref, u) => {
    const x = st.m.step(ref[0] + (u[0] || 0));
    return { measured: [x, st.m.v, st.m.torque], truth: [x - ref[0]] };
  },
};


/**
 * THE CART-POLE — the one plant class the other six do not contain: OPEN-LOOP UNSTABLE.
 *
 * `pend.test.mjs` has driven this plant with a bare `Pilot` since §52.32 and the record's verdict
 * is "asked and correctly refused, never a factor" (§84.10). What that record does NOT contain is
 * the DEPLOYED object: every plant converted since §64 — the column, the mill, the tank, the
 * barrel — was converted by asking `distil.js`'s weight vector instead of the teacher, and §84.10
 * names this as the honest next move in its own words. A spec is what the ladder needs to ask.
 *
 * THE BOX IS WIDER THAN `pend.test.mjs`'s because the TRAINING DIET is wider than the scored
 * program: the diet moves as far as 0.65 m where the program moves 0.5, and a channel box that
 * clipped the diet would be the commissioning refusing to see what it is being taught on.
 */
const pendSpec = {
  name: 'cart-pole (OPEN-LOOP UNSTABLE) — tip position, m rms',
  channels: [{ lo: -0.25, hi: 0.80, vMax: PD.VMX * PD.DT, aMax: PD.ACC * PD.DT * PD.DT,
    jMax: PD.ACC * PD.DT * PD.DT / PD.TA }],
  uMax: 0.15, nMeasured: 4,
  // The guard is the pole angle, routed as measured signal 2 — a number the engineer knows about
  // their own machine and the only pendulum-specific thing here.
  guards: [{ index: 2, max: 0.30 }],
  start: [0], N: PD.LAP * 4, floor: 0,
  refAt: (k) => [PD.xrefAt(k)],
  pilotOpts: { workspace: (q) => q[0] > -0.30 && q[0] < 0.85,
    // THE PROGRAM AT ITS OWN CLOCK, AND THE FIRST VERSION RESAMPLED IT (plan §87.4).
    // `verifyRef(i, n)` invites the caller to map its program onto the verify's step budget, and
    // `PD.xrefAt(round(i * LAP / n))` did exactly that — n is 24,000 against a 1,091-step lap, so the
    // move was handed to the gate **22 times SLOWED**, as a staircase. On that trajectory the
    // CONVENTIONAL machine reads 4.211e-1 where the real program reads 2.913e-2: the gate was
    // scoring a machine fourteen times worse than the one that runs, vouched at 2.02x, and
    // delivered **0.126x** — the plant table's only deployed-and-harmful cell (§86.2). At the
    // natural clock the same commissioning reads 0.74x and REFUSES, and the machine is left alone
    // at 1.000x. Rule 11, on the gate rather than on a test.
    verifyRef: (i) => [PD.xrefAt(i)] },
  fresh: () => PD.makeSettled(),
  step: (p, ref, u) => {
    PD.stepCart(p, PD.baseline(p, ref[0] + (u[0] || 0)));
    return { measured: [p.x, p.v, p.th, p.w], truth: [PD.tipOf(p) - ref[0]] };
  },
};


/**
 * THE REAL FLEXIBLE ARM AS THE LADDER DRIVES IT (plan §86.3).
 *
 * `realarm.test.mjs` built this inline and `distil-realarm.mjs` needs the same plant with a diet
 * attached, so it moves here rather than being copied — the move this file exists for. The test
 * is byte-identical across it (rule 21).
 *
 * THE CHANNEL'S LIMITS ARE THE PROGRAM'S OWN PEAKS, MEASURED (rule 41b). An excitation built to
 * DECLARED limits describes a machine the program does not run, and this rig has already paid
 * for that once: its first program was sized from the record's RESONANT acceleration range and
 * demanded eleven times the torque the machine has.
 */
const raPK = (() => {
  let v = 0, a = 0, j = 0;
  const r = (i) => RA.refAtStep(i)[0];
  for (let k = 2; k < RA.PROG - 2; k++) {
    v = Math.max(v, Math.abs((r(k + 1) - r(k - 1)) / 2));
    a = Math.max(a, Math.abs(r(k + 1) - 2 * r(k) + r(k - 1)));
    j = Math.max(j, Math.abs((r(k + 2) - 2 * r(k + 1) + 2 * r(k - 1) - r(k - 2)) / 2));
  }
  return { v, a, j };
})();

/**
 * THE CONVENTIONAL RUNG'S DIET, ARMED ON THE SHIPPED PATH (plan §129).
 *
 * This is the one plant in the project that fails target 1's *none made worse* clause: the rung
 * it ships makes a sharper-edged program of the same family WORSE at 0.877x (§88.3). §89.3
 * refuted the obvious repair — a coverage guard cannot separate two harmful programs that
 * STRADDLE the commissioning value — and named a DIET instead, because the rung is identified on
 * ONE program and its span is a POINT rather than an interval. §106 built it and measured
 * **0.877x → 1.134x and 0.921x → 1.128x on the two harmful programs while the commissioned one
 * improves 1.927x → 2.255x — 0 of 4 made worse, in 0.42x of the commissioning it replaces**, with
 * nine of nine shape-varied diets doing it and member length INERT.
 *
 * It was measured through `classicdiet-realarm.mjs` and armed NOWHERE for three sections. Here it
 * is on the path `realarm.test.mjs` and `distil-realarm.mjs` both commission through, at §106's
 * own winning setting — edges 112/224 at 40 laps — so the repair reaches the object that ships.
 * `RA_CDIET=off` restores the single-program rung, which is what every number before §129 was
 * taken on.
 *
 * Each member's amplitude is RE-DERIVED by the rig's own headroom rule rather than invented, and
 * each `fresh` warms on ITS OWN program: a run that settles onto one trajectory and is scored on
 * another measures the change-over (rules 12, 13, 41b), and this rig has already paid once for a
 * reference sized from a quantity the program does not live at.
 */
const RA_CDIET = process.env.RA_CDIET === undefined ? '112,224' : process.env.RA_CDIET;
const RA_DLAPS = +(process.env.RA_DLAPS || 40);
const realarmClassicDiet = (RA_CDIET === 'off' || RA_CDIET === '') ? null
  : RA_CDIET.split(',').map(Number).map((edge) => {
    const g = RA.makeProgram({ edge });
    const N = RA_DLAPS * RA.LAP;
    return {
      refAt: (k) => g.at(Math.min(k, N - 1)),
      N,
      fresh: () => {
        const m = RA.makeMachine(RA.LOOP, { warm: false });
        for (let k = 0; k < 20 * RA.LAP; k++) m.step(g.at(k)[0]);
        return m;
      },
    };
  });

const realarmLadderSpec = {
  name: 'real flexible robot arm (DaISy 96-009) — position, rms',
  ...(realarmClassicDiet ? { classicDiet: realarmClassicDiet } : {}),
  channels: [{ lo: -1.25 * RA.AMP, hi: 1.25 * RA.AMP, vMax: raPK.v, aMax: raPK.a, jMax: raPK.j }],
  uMax: RA.UCORR,
  // Position, velocity, acceleration and the drive's own torque — a real servo publishes all
  // four, and nothing here is a quantity the machine would not have.
  nMeasured: 4,
  guards: [{ index: 0, max: 4 * RA.AMP }],
  start: [RA.refAtStep(0)[0]],
  N: RA.PROG,
  refAt: (k) => RA.refAtStep(Math.min(k, RA.PROG - 1)),
  floor: 0,
  fresh: () => RA.makeMachine(),
  step: (m, ref, u) => {
    const x = m.step(ref[0] + u[0]);
    return { measured: [x, m.v, m.acc, m.torque], truth: [x - ref[0]] };
  },
};


/** A program's own peaks in COMMAND space, measured rather than declared (rule 41b). Three rigs
 *  had a private copy of this loop; it is one function now. */
/**
 * THE ORDINARY PID LOOP AS THE LADDER DRIVES IT — the sanity check before any ST translation.
 *
 * THE BLOCK TRIMS THE SETPOINT AND THE EXISTING LOOP IS UNTOUCHED. `step` adds `u` to the
 * setpoint the PID is given and scores the PV against the UNCORRECTED schedule, exactly as
 * `pendSpec` corrects the cart's position reference into a stabiliser it does not replace. On a
 * real installation that is the only retrofit anyone will accept: the loop, its tuning, its
 * alarms and its faceplate all stay, and what ships is a trim on a setpoint it already follows.
 *
 * THE MEASURED VECTOR IS WHAT A PLC ALREADY HAS — the PV and the valve output. No tracker, no
 * added instrument, which is the whole reason this plant is the right sanity check: every other
 * plant here needs a commissioning truth the customer may not own (§52.42 prices the arm's at
 * 3.9x), and a closed loop's own PV *is* the truth because the setpoint is what it should equal.
 *
 * `uMax` is 3x the error the correction exists to remove, in the SETPOINT's own units — the
 * same derivation `realexchLadderSpec` uses, without its division, because there the correction
 * is in flow and the error in °C while here both are °C (rule 31: a constant re-derived, not
 * carried). `floor` is the instrument's own 0.02 °C resolution, so the gate cannot credit an
 * improvement the measurement could not have seen — EMPS' 1.6 µm rule on a second plant.
 */
function pidLoopLadderSpec(model = PL.MODEL, opts = {}) {
  const PK = progPeaks((k) => PL.refAtStep(k), PL.PROG);
  const CONV = PL.convRms(model, opts);
  return {
    name: `PID temperature loop (${model.tag} valve) — PV against the schedule, °C rms`,
    channels: [{ lo: PL.SP_LO, hi: PL.SP_HI, vMax: PK.v, aMax: PK.a, jMax: PK.j }],
    uMax: 3 * CONV, nMeasured: 2,
    guards: [{ index: 0, max: PL.SP_HI + 10 }],
    start: [PL.refAtStep(0)[0]], N: PL.PROG, floor: PL.QUANT,
    refAt: (k) => PL.refAtStep(Math.min(k, PL.PROG - 1)),
    fresh: () => PL.makeLoop(model, opts),
    step: (p, ref, u) => {
      const y = p.step(ref[0] + (u[0] || 0));
      return { measured: [y, p.travel], truth: [y - ref[0]] };
    },
  };
}

function progPeaks(refAt, n) {
  let v = 0, a = 0, j = 0;
  const r = (i) => refAt(Math.max(0, Math.min(n - 1, i)))[0];
  for (let k = 2; k < n - 2; k++) {
    v = Math.max(v, Math.abs((r(k + 1) - r(k - 1)) / 2));
    a = Math.max(a, Math.abs(r(k + 1) - 2 * r(k) + r(k - 1)));
    j = Math.max(j, Math.abs((r(k + 2) - 2 * r(k + 1) + 2 * r(k - 1) - r(k - 2)) / 2));
  }
  return { v, a, j };
}

/**
 * THE REAL CASCADED TANKS (Schoukens & Noël 2017) AS THE LADDER DRIVES THEM (plan §86.4).
 *
 * Two plants, because the comparison between them is the result: the identified LINEAR model is
 * inside the conventional rung's own hypothesis class and reads 2012x, and the benchmark's own
 * documented OVERFLOW — 84 samples pinned at exactly 10.00 in the record — collapses it to 6.5x.
 * `overflow: true` is the honest one and is the one a distilled rung is asked on.
 */
function realtanksLadderSpec({ overflow = true } = {}) {
  const rec = overflow ? RT.RECIPE_OF : RT.RECIPE;
  const at = overflow ? RT.refAtStepOF : RT.refAtStep;
  // EACH SPEC READS ITS OWN PROGRAM'S PEAKS, AND THE FIRST VERSION DID NOT (plan §86.4). Both
  // specs were built from the LINEAR recipe's peaks, so the overflow plant — whose recipe reaches
  // 10.6 against 8.2 and therefore ramps harder — was commissioned inside a box its own program
  // does not fit. That is rule 41b at the channel limits rather than at an excitation, and it was
  // worth a factor: the overflow plant reads **8.00x** on its own peaks against 6.54x on the
  // other recipe's, its cascade admitting a SCHEDULED basis at layer 1 (R² lead0 0.948 against
  // 0.928) and reaching R² 0.498 at layer 2 against 0.210. The linear plant is byte-identical,
  // which is what says this is the repair and not a re-tune (rule 21).
  const PK = progPeaks((k) => at(k), RT.PROG);
  return {
    name: `real cascaded tanks${overflow ? ', overflow active' : ' (benchmark hardware)'} — lower tank level, rms`,
    channels: [{ lo: RT.voltsFor(Math.min(...rec)) - 0.4, hi: RT.voltsFor(Math.max(...rec)) + 0.4,
      vMax: PK.v, aMax: PK.a, jMax: PK.j }],
    uMax: RT.UCORR, nMeasured: 1,
    guards: [{ index: 0, max: overflow ? RT.OVERFLOW * 1.5 : RT.OVERFLOW }],
    start: [at(0)[0]], N: RT.PROG,
    refAt: (k) => at(Math.min(k, RT.PROG - 1)), floor: 0,
    fresh: () => RT.makeMachine({ overflow, rec }),
    step: (p, ref, u) => {
      const y = p.step(ref[0] + u[0]);
      // The wanted level is what the STATIC MAP promises for this command, clamped by the tank
      // where the tank clamps — the conventional machine's own belief, which is what the
      // correction is measured against.
      return { measured: [y],
        truth: [y - (overflow ? Math.min(RT.OVERFLOW, RT.levelAt(ref[0])) : RT.levelAt(ref[0]))] };
    },
  };
}

/** THE REAL STEAM HEAT EXCHANGER (DaISy 97-002) AS THE LADDER DRIVES IT (plan §86.5). */
function realexchLadderSpec(model = RX.MODEL, tag = 'nonlinear') {
  const PK = progPeaks((k) => RX.refAtStep(k), RX.PROG);
  return {
    name: `real heat exchanger (${tag}) — outlet temperature, °C rms`,
    channels: [{ lo: RX.UMIN, hi: RX.UMAX, vMax: PK.v, aMax: PK.a, jMax: PK.j }],
    uMax: RX.UCORR, nMeasured: 1,
    guards: [{ index: 0, max: RX.TMAX_T + 5 }],
    start: [RX.refAtStep(0)[0]], N: RX.PROG,
    refAt: (k) => RX.refAtStep(Math.min(k, RX.PROG - 1)), floor: 0,
    fresh: () => RX.makeMachine(model),
    step: (p, ref, u) => {
      const y = p.step(ref[0] + u[0]);
      return { measured: [y], truth: [y - RX.tempAt(model, ref[0])] };
    },
  };
}



/**
 * THE 2R COMPLIANT ARM AS A SPEC — the tenth plant, and the one §105 recorded as NOT ASKED.
 *
 * §105 asks the teacher-free direct inverse of nine plants and says in its own words why the
 * flagship is missing: *it HAS a nominal inverse — its own IK, which is what produces its
 * `refAt` — but `rigs/arm-rig.mjs` exports `commissionArm`/`deployOn` and no `{fresh, step,
 * refAt, uMax}` spec, so asking it means a second copy of that plant's routing.* This is the
 * move that file names, and the routing stays in the rig: `fresh` is `makeArm` + `homeAt` and
 * `step` is `stepArm`, both of them `arm-rig.mjs`'s own.
 *
 * THREE THINGS ABOUT THIS PLANT THE OTHER NINE DO NOT HAVE, each stated because each is a
 * constraint on what the route can mean here rather than an implementation detail.
 *
 * 1. IT IS BUILT ASYNCHRONOUSLY. Every other `fresh()` is a synchronous constructor; this one
 *    needs two LATTICE links and `buildLink` is async. So the spec carries a POOL: `prime(n)`
 *    builds n machines (31 ms for forty — the cost is the SETTLE, not the build), and `fresh`
 *    takes one and homes it. It THROWS when the pool is empty rather than handing back a used
 *    machine, because a re-homed arm carries its links' own ring and history and the ZERO
 *    control's bit-exactness is exactly what that would destroy (rule 25).
 * 2. ITS COMMAND IS A TRAJECTORY, NOT A POINT. `ChainServo.torques` reads {theta, omega, alpha};
 *    `stepArm`'s own note measures what deriving the last two from the command series costs
 *    (11%, so it is a different machine) and takes them from the program's `ikRates` instead.
 *    A segment therefore hands its PATH through `meta`, and a caller with no path is holding a
 *    pose and gets zeros.
 * 3. ITS OUTPUT IS NOT ON ITS OWN SENSORS. The route inverts an ACHIEVED OUTPUT; here that is
 *    the TOOL, which no motor-side signal carries. `stepArm` publishes it as measured channels
 *    6 and 7 and labels them the TRACKER — a COMMISSIONING instrument, the same footing the
 *    truth is already on. On the other nine `inv` reads a thermocouple, a level or an encoder,
 *    and this is the requirement-1 fine print the nine could not show.
 *
 * THE CELL IS THE OWNER'S STANDING BENCH RULE — K 0.25 / E 0.03 on the SHARP-CORNER program —
 * and the loop is `BENCH_SERVO`, §52.37's own single source, passed EXPLICITLY. `arm-rig.mjs`'s
 * `makeArm` still defaults `ARM_BW` to 2e-3, the pre-§52.37 constant, so a spec that took the
 * rig's default would be a machine the shipped numbers were not measured on (rule 31).
 */
const ARM_CELL = { K: 0.25, E: 0.03, bw: BENCH_SERVO.bandwidth };
const armPath = mkPath('sharp', 4e-3);
const armPool = [];
let armIK = null;

/** The rate feedforward a program supplies at step k, through the arm's own `ikRates`. */
function armRatesFrom(arm, path, N) {
  return (k) => {
    const c = path.at(Math.max(0, Math.min(N, k)));
    const [q1, q2] = arm.ik(c.x, c.y, true);
    return arm.ikRates(q1, q2, c.vx, c.vy, c.ax, c.ay);
  };
}

const armSpec = {
  name: '2R compliant arm (K 0.25 / E 0.03, sharp square) — tool error in joint space, rms',
  // The correction is a JOINT REFERENCE OFFSET, which is where `deployOn` puts it, and 0.15 rad
  // is `commissionArm`'s own shipped `uCap` on this plant rather than a number chosen here.
  uMax: 0.15,
  // Six motor-side signals AND TWO TRACKER CHANNELS. `nMeasured` is the count a deployed object
  // may read; `measured` is longer, and the extra two are commissioning-only (see above).
  nMeasured: 6,
  channels: [0, 1].map(() => ({ lo: -1.6, hi: 1.6, vMax: 8e-4, aMax: 4e-6, jMax: 2e-7 })),
  N: Math.ceil(armPath.lap),
  floor: 0,
  // The SCORED program's own path, so `scoreOn`'s default segment carries it and the scored run
  // is driven with the same rate feedforward the excitation runs are.
  meta: { path: armPath },
  /** THE NOMINAL INVERSE — the arm's own IK, which is what produces this plant's reference. */
  refAt: (k) => {
    if (!armIK) throw new Error('armSpec: not primed — call `await armSpec.prime(n)` first (rule 25)');
    const c = armPath.at(Math.max(0, Math.min(Math.ceil(armPath.lap), k)));
    return armIK(c.x, c.y);
  },
  /** The same map applied to an ACHIEVED tool position, read off the tracker channels. */
  inv: (y) => armIK(y[6], y[7]),
  get start() { return armSpec.refAt(0); },
  async prime(n) {
    if (+(process.env.ARM_TOOL_NOISE || 0) !== 0) {
      throw new Error('armSpec: ARM_TOOL_NOISE degrades `routeSignals`\' tracker read but not the '
        + 'tracker CHANNEL, so the two would disagree by noise — not supported here (rule 17)');
    }
    while (armPool.length < n) armPool.push(await makeArm(ARM_CELL));
    if (!armIK) armIK = ikOf(armPool[0].arm);
    return n;
  },
  /**
   * A MACHINE SETTLED AT THE COMMAND IT IS ABOUT TO BE GIVEN. Every other spec arranges this by
   * hardcoding its settle point and requiring the diet to start there (`tankSpec`'s diet says so
   * in its own comment); on this plant the home is a SERVO ACTION at an arbitrary pose, so the
   * kit hands the segment in and the machine is homed where that segment begins.
   */
  fresh(seg) {
    const m = armPool.pop();
    if (!m) throw new Error('armSpec: the arm pool is EXHAUSTED — prime more (rule 25: a re-homed '
      + 'arm carries its links\' own ring and would break the ZERO control\'s bit-exactness)');
    const path = seg && seg.meta && seg.meta.path ? seg.meta.path : null;
    const n = seg && seg.n ? seg.n : Math.ceil(armPath.lap);
    const q0 = seg && seg.refAt ? seg.refAt(0) : armSpec.refAt(0);
    homeAt(m.arm, m.servo, q0[0], q0[1]);
    // A CALLER THAT FREEZES THE REFERENCE MUST FREEZE ITS RATE TERMS TOO. `invert.mjs` runs the
    // program to `k0` and then HOLDS it, for a reason it states in its own comment — a moving
    // program makes the paired subtraction a moving target on a nonlinear plant. On a plant whose
    // command carries omega and alpha, holding theta while the program's rates run on is not a
    // held reference at all; `holdFrom` says where the hold starts and every other spec ignores it.
    const rates = path ? armRatesFrom(m.arm, path, n) : () => ({ dq: [0, 0], ddq: [0, 0] });
    const k0 = seg && Number.isFinite(seg.holdFrom) ? seg.holdFrom : Infinity;
    const ZERO = { dq: [0, 0], ddq: [0, 0] };
    return { arm: m.arm, servo: m.servo, rates: (k) => (k < k0 ? rates(k) : ZERO) };
  },
  step: stepArm,
};

/**
 * THE DIET: closed polygon laps at the PROGRAMS' OWN SCALE, none of them the scored square.
 *
 * It is `distil-arm.mjs`'s shipped `poly4` design — `randomPolygon` at rMin 3.4 / rSpan 2.4 and
 * the bench feed, convex and star alternating so the turn angles bracket the square's 90° — and
 * the design is the rig's rather than a new one (rule 20, rule 61). The scored program is a
 * sharp square and appears in no segment.
 */
function armDiet(rnd) {
  const segs = [];
  for (let s = 0; s < 6; s++) {
    // ARMTOUR=<nShapes>: ONE CLOSED LAP OF SEVERAL SHAPES instead of one polygon (plan §49.11).
    // The window rule is `min(0.61·settle, lap/8)` and on THIS plant the aliasing half binds hard
    // — a polygon lap of ~3,900 steps caps the reach at 485 against a measured settle of 4,433 —
    // which is §49.11's forced trade with nothing left to choose. A long tour is that section's
    // one MEASURED escape (it took a ±1024 window from 0.47x to 3.29x), so it is the knob that
    // says whether the reach is what binds here or whether something else is. Unset is the
    // shipped `poly4` design and byte-identical.
    const path = process.env.ARMTOUR
      ? designTour(rnd, 4e-3, { centre: PG.centre, nShapes: +process.env.ARMTOUR,
        rMin: 3.4, rSpan: 2.4 })
      : randomPolygon(rnd, 4e-3, { centre: PG.centre, star: s % 2 === 1,
        rMin: 3.4, rSpan: 2.4 });
    const n = Math.ceil(path.lap);
    segs.push({ n, meta: { path },
      refAt: (k) => { const c = path.at(Math.max(0, Math.min(n, k))); return armIK(c.x, c.y); } });
  }
  return segs;
}

export { tankSpec, wbSpec, millSpec, barrelSpec, empsSpec, realarmSpec, realarmLadderSpec,
  realtanksLadderSpec, realexchLadderSpec, pidLoopLadderSpec, pendSpec, armSpec, armDiet, progPeaks, raPK, G_MP };
