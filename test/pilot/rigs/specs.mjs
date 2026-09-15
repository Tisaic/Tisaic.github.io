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
  fresh: () => { const m = RM.makeMill(1); for (let i = 0; i < 4000; i++) m.step(RM.S0); return { m, want: [] }; },
  step: (st, ref, u) => {
    st.m.step(ref[0] + u[0]);
    // THE REFERENCE IS DELAYED TO MATCH THE MEASUREMENT — strip tracking, and what every
    // mill does. The X-ray gauge is a metre downstream, so the metal it reads left the gap
    // 200 ms ago and must be compared against the target the gap was holding THEN.
    st.want.push((RM.MM * ref[0] + RM.QM * RM.H0) / (RM.MM + RM.QM));
    if (st.want.length > RM.DLY + 2) st.want.shift();
    const want = st.want.length > RM.DLY ? st.want[st.want.length - 1 - RM.DLY] : RM.HREF;
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

export { tankSpec, wbSpec, millSpec, barrelSpec, empsSpec, realarmSpec, G_MP };
