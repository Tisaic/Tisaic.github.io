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
import { AutoStack } from '../../lib/pilot/autostack.js';
import { motionBasis } from '../../lib/pilot/classic.js';
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

// THE SOLVER BUDGET AS A KNOB, so `docs/plan.md` step 6b can be gated on plants that share
// no physics. Both are pass-through Pilot options and both default to the library's own
// values, so an unset environment runs byte-identically (rule 21). The proposed joint change
// is HORIZON_TS=1.2 QPITERS=2 — measured better AND ~30-57x cheaper on the two plants that
// deploy, and NOT separable, so they move together or not at all.
const SOLVER = {};
if (process.env.HORIZON_TS) SOLVER.horizonTs = +process.env.HORIZON_TS;
if (process.env.QPITERS) SOLVER.qpIters = +process.env.QPITERS;
if (Object.keys(SOLVER).length) console.log(`  solver budget override: ${JSON.stringify(SOLVER)}`);

// THE SCAN THE LADDER HAS TO FIT, when one is stated. `BUDGET=mac,bytes` turns it on; unset,
// nothing is enforced and every number in this file is what it always was. It exists because
// the barrel deployed 1.04x for 21,830 MAC/cycle and 256.7 kB — an improvement the machine
// measured honestly and no PLC would accept — and nothing in the ladder priced it.
const BUDGET = process.env.BUDGET
  ? { mac: +process.env.BUDGET.split(',')[0], bytes: +process.env.BUDGET.split(',')[1] }
  : null;
if (BUDGET) console.log(`  scan budget: ${BUDGET.mac.toLocaleString()} MAC/cycle, `
  + `${(BUDGET.bytes / 1024).toFixed(0)} kB`);

/**
 * One plant's ladder. `spec` supplies everything the machine knows about itself and nothing
 * about the controller.
 */
async function ladder(spec) {
  const { name, channels, uMax, guards, nMeasured, start, N, refAt, fresh, step, floor } = spec;

  // The reference's own rate and acceleration, in COMMAND space, by differencing the program
  // it will actually run. This is what the conventional rung reads; it is not a model.
  const nc = channels.length;
  const v = Array.from({ length: nc }, () => new Float64Array(N));
  const a = Array.from({ length: nc }, () => new Float64Array(N));
  for (let k = 1; k < N - 1; k++) {
    const p0 = refAt(k - 1), p1 = refAt(k), p2 = refAt(k + 1);
    for (let c = 0; c < nc; c++) { v[c][k] = (p2[c] - p0[c]) / 2; a[c][k] = p2[c] - 2 * p1[c] + p0[c]; }
  }
  const auto = new AutoStack({
    // DEPTH IS A KNOB SO THE DEPTH QUESTION CAN BE ASKED ON PLANTS THAT SHARE NO PHYSICS.
    // The default 2 is what every number in this file is quoted at; `DEPTH=4` runs the
    // experiment testing whether the LEVERAGE LEVEL predicts the layer that will fail to
    // vouch. One plant is not a method — a common factor across plants sharing no physics is
    // a property of the CODE (rule 18), and that is exactly what a stopping rule has to be.
    channels, uMax, periodic: null, floor, maxDepth: +(process.env.DEPTH || 2), budget: BUDGET,
    // THE CONVENTIONAL RUNG, WITHHOLDABLE FOR THE SIX-PLANT PASS. `basis` is what unlocks it —
    // `if (this.basis)` in AutoStack — so NOCLASSIC=1 skips it with no new option. The question
    // it answers is whether the rung can be dropped from the ladder for compute: on the ARM the
    // bar's own table says the cascade commissions BETTER without it ("a cheap rung that costs
    // an expensive one"), while on the EMPS axis it IS the result (425x in 14 laps, past the
    // published inverse-dynamics feedforward). Six plants decide it, not either one.
    basis: process.env.NOCLASSIC === '1' ? null
      : motionBasis(channels.map((_, c) => ({ v: v[c], a: a[c] }))),
    pilot: { nMeasured, start, guards, workspace: () => true, seed: 1, autoRefuse: false,
      ...SOLVER },
  });

  const run = async (corr, cname) => {
    const st = fresh();
    auto.beginRun();
    let ss = 0, n = 0;
    // The error signal per channel over the whole program — what the conventional rung's
    // operator is identified against. One output per channel, in the output's own units:
    // the operator is a derivative of THIS with respect to the coefficients, so the units
    // divide out and the correction comes back in command space.
    const err = Array.from({ length: nc }, () => new Float64Array(N));
    for (let k = 0; k < N; k++) {
      const ref = refAt(k);
      const S = auto.stack ? auto.stack.sample : 1;
      const kS = Math.floor(k / S);
      const look = (off) => refAt(Math.min(N - 1, Math.max(0, (kS + off) * S)));
      const u = auto.act({ v: channels.map((_, c) => v[c][k]), a: channels.map((_, c) => a[c][k]),
        look });
      if (corr) { const w = auto.into(corr.at(k), cname, {}); for (let c = 0; c < nc; c++) u[c] += w[c]; }
      const r = step(st, ref, u, k);
      auto.observe(r.measured);
      for (let c = 0; c < nc; c++) err[c][k] = r.truth[c];
      // SCORED AFTER THE START TRANSIENT, not across it: a measurement taken over a
      // transient describes the transient.
      if (k >= N * 0.05) { for (const e of r.truth) { ss += e * e; n++; } }
    }
    return { score: Math.sqrt(ss / n), err };
  };
  const drivePilot = async (stk) => {
    const st = fresh();
    let guard = 0;
    while (stk.phase !== 'done' && guard++ < 4e6) {
      if (stk.phase === 'fit') { stk.work(); continue; }
      const cmd = stk.command();
      const below = auto.actBelow('stack', { v: cmd.map((c) => c.vel), a: cmd.map((c) => c.acc) });
      const r = step(st, cmd.map((c) => c.pos), cmd.map((c, j) => c.u + below[j]), -1);
      stk.observe(r.measured, r.truth);
    }
  };

  const t0 = Date.now();
  const rep = await auto.commission({ run, drivePilot });
  console.log(`\n  ${name}`);
  console.log(auto.table());
  console.log(`    shipped ${JSON.stringify(rep.deployed)}   ${rep.base.toExponential(3)} → `
    + `${rep.best.toExponential(3)}   ${rep.gain.toFixed(2)}x   ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  // ---- CAN A CASCADE KNOW WHEN TO STOP WITHOUT PAYING A COMMISSION TO FIND OUT? ---------
  //
  // Measured on the EMPS axis: the leverage RATIO stays flat with depth while the LEVEL
  // triples — each deeper fit progressively less well-determined, the cascade running out of
  // signal, visible DURING the fit. `Stack` currently discovers the same thing by
  // commissioning a layer and finding it cannot vouch for itself ON THE MACHINE, which costs
  // a full commission per layer.
  //
  // If a leverage threshold predicts the failing layer on plants that share no physics, depth
  // stops costing a commission to discover. If it predicts on ONE plant only, it is a
  // property of that plant and not a rule (rule 18). Printed against the verify each layer
  // actually earned, so the two can be compared rather than asserted.
  if (auto.stack && auto.stack.layers && auto.stack.layers.length) {
    for (const [i, p] of auto.stack.layers.entries()) {
      const ro = (p.status && p.status().report && p.status().report.readouts) || [];
      const lev = ro.length && ro[0].levLead0 !== null && ro[0].levLead0 !== undefined
        ? ro[0].levLead0 : null;
      const vouched = !!(p.verdict && p.verdict.deploy);
      console.log(`      layer ${i + 1}: ${vouched ? 'vouched' : 'REFUSED'}`
        + `   verify ${p.verdict && p.verdict.ratio ? p.verdict.ratio.toFixed(2) + 'x' : '—'}`
        + `   R² lead0 ${ro.length ? ro[0].r2Lead0.toFixed(3) : '—'}`
        + `   leverage ${lev === null ? '—' : lev.toExponential(2)}`);
    }
  }
  const cost = auto.cost && auto.cost();
  if (cost) {
    console.log(`      cost: ${Math.round(cost.slicedMac)} MAC/cycle sliced, `
      + `${(cost.bytes / 1024).toFixed(1)} kB   rungs ${Object.keys(cost.rungs).join('+') || 'none'}`);
  }
  return { rep, auto };
}

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
