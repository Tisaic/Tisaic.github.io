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
  fresh: () => {
    const p = TH.makeBarrel(7);
    const st = TH.powerFor(TH.RECIPE[0]);
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

const realarmLadderSpec = {
  name: 'real flexible robot arm (DaISy 96-009) — position, rms',
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


export { tankSpec, wbSpec, millSpec, barrelSpec, empsSpec, realarmSpec, realarmLadderSpec,
  realtanksLadderSpec, realexchLadderSpec, pendSpec, progPeaks, raPK, G_MP };
