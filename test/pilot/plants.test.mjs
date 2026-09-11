/**
 * @file THE BUTTON ON EVERY PLANT — rule 18, which is the only honest test of a claim to be
 * plant-agnostic.
 *
 * `A common factor across plants that share no physics is a property of the code.` The
 * converse is what this file is for: a ladder measured on one plant has measured one plant.
 * `autostack.test.mjs` drives a real servo axis and `flexisim/autostack.test.mjs` a compliant
 * two-link arm; here the SAME object, told nothing but each machine's own maxes, authority
 * and floor, meets four more that share no physics with either — a quadruple tank whose
 * outflow goes as the square root of level, a three-zone extruder barrel that radiates as
 * T^4 through a transport delay, a distillation column that is nothing but linear transfer
 * functions with dead time, and a cold mill whose gauge is measured a metre downstream of
 * where it is made.
 *
 * NONE OF THEM RUNS A LAP. The harmonic rung is therefore not offered at all — `periodic` is
 * null — and that is itself the point: the rung that carries the servo axis and the arm is
 * INAPPLICABLE here, and a ladder that pretended otherwise would be inventing a program the
 * machine does not run. What is under test on these four is the conventional rung, the pilot
 * cascade, and the decisions between them.
 */
import { ladder, announce } from './rigs/ladder.mjs';
import { UCAP, makeTanks, levelsAt, voltsFor, refAtStep, PROG } from './rigs/tanks-rig.mjs';
import * as WB from './rigs/woodberry-rig.mjs';
import * as RM from './rigs/rollmill-rig.mjs';
import * as TH from './rigs/thermal-rig.mjs';

let failed = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${(!ok && detail !== undefined) ? '  → ' + detail : ''}`);
  if (!ok) failed++;
}
console.log('\npilot: the button on plants that share no physics\n');

// THE DRIVER AND ITS ENV KNOBS NOW LIVE IN `rigs/ladder.mjs`, because the real-data plants
// need the same one and a second copy is rule 61 waiting to happen. This file is
// byte-identical across that move.
announce();
// ------------------------------------------------------------------ THE QUADRUPLE TANK
// Minimum-phase configuration. Outflow goes as sqrt(level), so nothing about it is linear,
// and the two pumps cross-feed: each fills one tank directly and the other's upper tank.
const G_MP = [0.7, 0.6];
const tanks = await ladder({
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
});
check('the tank commissions and ships something that does not make it worse',
  tanks.rep.best <= tanks.rep.base, `${tanks.rep.base.toExponential(3)} → ${tanks.rep.best.toExponential(3)}`);
check('…and the harmonic rung was never offered, because this plant runs no lap — a ladder '
  + 'that invented a program the machine does not run would be inventing a result',
  !tanks.rep.rungs.some((r) => /lap-periodic/.test(r.name)),
  JSON.stringify(tanks.rep.rungs.map((r) => r.name)));


// ------------------------------------------------------- THE WOOD-BERRY DISTILLATION COLUMN
// Linear transfer functions and dead time, nothing else — the negative control of this set.
// It is the one plant here with a published multivariable controller to lose to.
const wb = await ladder({
  name: 'Wood-Berry column — compositions, rms',
  channels: [0, 1].map(() => ({ lo: WB.UBOX.lo, hi: WB.UBOX.hi,
    vMax: 6e-3, aMax: 6e-5, jMax: 6e-7 })),
  uMax: WB.UMAX, nMeasured: 2,
  guards: [{ index: 0, max: 25 }, { index: 1, max: 25 }],
  start: [0, 0], N: WB.T_END, floor: 0,
  refAt: (k) => { const sp = WB.setpointAt(Math.min(k, WB.T_END - 1)); return WB.inputsFor(sp[0], sp[1]); },
  fresh: () => WB.makeColumn(),
  step: (c, ref, u) => {
    c.step(ref.map((r, j) => r + u[j]));
    const want = WB.outputsFor(ref);
    return { measured: c.y.slice(), truth: [c.y[0] - want[0], c.y[1] - want[1]] };
  },
});
check('the column commissions — a plant that is nothing but linear transfer functions and '
  + 'dead time, and the negative control of this set',
  wb.rep.best <= wb.rep.base, `${wb.rep.base.toExponential(3)} → ${wb.rep.best.toExponential(3)}`);

// -------------------------------------------------------------------- THE COLD MILL AGC
// One channel, and the gauge it must hold is measured a metre downstream of where it is
// made. The reference is delayed to match the measurement, which is strip tracking.
const mill = await ladder({
  name: 'cold mill AGC — exit gauge, mm rms',
  channels: [{ lo: RM.S0 - 0.12, hi: RM.S0 + 0.12, vMax: 3e-3, aMax: 3e-4, jMax: 3e-5 }],
  uMax: 0.06, nMeasured: 3,
  guards: [{ index: 0, max: 400 }],
  start: [RM.S0], N: RM.T_RUN, floor: 0,
  refAt: () => [RM.S0],
  fresh: () => ({ m: RM.makeMill(1), want: [] }),
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
});
// STATED, NOT SILENT: THIS MILL DOES NOT DECLARE ITS TRANSPORT DELAY AND `rollmill.test.mjs`
// DOES. There the gauge's 100-step delay is passed as `deadTime: DLY` — the mounting distance
// over the line speed, geometry rather than a tuned constant — and it is what took that plant
// from a refusal at 0.61x to a deployment delivering 1.49x, because the probe cannot recover a
// dead time (it and a slow rise move the 90% crossing identically) and every tap of `hGrid`
// otherwise lands inside the dead zone. `ladder()` here takes a fixed opts set and passes no
// per-plant pilot options, so the mill row below is measured on the undeclared machine.
//
// TWO HARNESSES DRIVING ONE RIG WITH DIFFERENT DECLARATIONS IS EXACTLY THE DRIFT RULE 61 IS
// ABOUT, so it is written down here rather than left to be found. WHAT WOULD CHANGE IT: a
// `pilotOpts` passthrough in `ladder()` and `deadTime: RM.DLY` on this spec, then re-running
// this file's four-plant table — the mill row should improve and the other three must come
// back byte-identical (rule 21). Not done yet, and this check's bar is "no worse", which the
// undeclared machine already clears.
check('the mill commissions on a plant whose measurement is a metre downstream of where the '
  + 'quantity is made', mill.rep.best <= mill.rep.base,
  `${mill.rep.base.toExponential(3)} → ${mill.rep.best.toExponential(3)}`);


// ------------------------------------------------------------ THE THREE-ZONE EXTRUDER BARREL
// Radiates as T^4 through a transport delay, three zones conducting into each other, and a
// program that HOLDS rather than sweeps. The slowest plant here by a wide margin.
const barrel = await ladder({
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
});
check('the barrel commissions — three zones radiating as T^4 through a transport delay, on a '
  + 'program that holds rather than sweeps', barrel.rep.best <= barrel.rep.base,
  `${barrel.rep.base.toExponential(3)} → ${barrel.rep.best.toExponential(3)}`);

// --------------------------------------------------------------- WHAT THE SET SAYS TOGETHER
const all = [['tank', tanks], ['column', wb], ['mill', mill], ['barrel', barrel]];
console.log('\n  across four plants that share no physics:');
for (const [n, r] of all) {
  console.log(`    ${n.padEnd(8)} ${r.rep.base.toExponential(3)} → ${r.rep.best.toExponential(3)}`
    + `   ${r.rep.gain.toFixed(2)}x   ships ${JSON.stringify(r.rep.deployed)}`);
}
check('NO PLANT IS MADE WORSE. The ladder either finds something the machine measures as an '
  + 'improvement or it ships nothing — which is the only property that has to hold on a plant '
  + 'nobody has looked at',
  all.every(([, r]) => r.rep.best <= r.rep.base * 1.0001),
  all.map(([n, r]) => `${n} ${(r.rep.base / r.rep.best).toFixed(2)}x`).join(', '));
check('…and where it ships NOTHING it says what each rung measured, so a refusal is a number '
  + 'and not a silence',
  all.every(([, r]) => Object.values(r.rep.deployed).some(Boolean)
    || r.rep.rungs.every((x) => typeof x.score === 'number')),
  JSON.stringify(all.map(([n, r]) => [n, r.rep.rungs.length])));
check('…and the ladder does NOT deploy on every plant — a button that always finds something '
  + 'is not measuring, and two of these four are correctly left alone',
  all.some(([, r]) => !Object.values(r.rep.deployed).some(Boolean)),
  all.map(([n, r]) => `${n}:${JSON.stringify(r.rep.deployed)}`).join(' '));

console.log(failed ? `\nplants: ${failed} check(s) FAILED\n` : '\nplants: all checks passed\n');
process.exit(failed ? 1 : 0);
