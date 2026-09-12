/**
 * @file THE LADDER DRIVER — one plant's commissioning, told everything the machine knows
 * about itself and nothing about the controller.
 *
 * EXTRACTED FROM `plants.test.mjs` when the real-data plants needed the same driver. A
 * shared configuration exists to stop two copies drifting (rule 61), and this project has
 * paid for a second copy of a plant's routing three separate times — `rigs/arm-rig.mjs`
 * says so in its own header. `plants.test.mjs` is byte-identical across the extraction,
 * which is the control that says the move changed nothing.
 *
 * The env knobs travel WITH the driver rather than being re-read per caller, for the same
 * reason. `announce()` is kept separate from module load so a caller keeps its own output
 * ordering: printing the overrides at import time would put them above the caller's header.
 */
import { AutoStack } from '../../../lib/pilot/autostack.js';
import { motionBasis } from '../../../lib/pilot/classic.js';
// THE SOLVER BUDGET AS A KNOB, so `docs/plan.md` step 6b can be gated on plants that share
// no physics. Both are pass-through Pilot options and both default to the library's own
// values, so an unset environment runs byte-identically (rule 21). The proposed joint change
// is HORIZON_TS=1.2 QPITERS=2 — measured better AND ~30-57x cheaper on the two plants that
// deploy, and NOT separable, so they move together or not at all.
const SOLVER = {};
if (process.env.HORIZON_TS) SOLVER.horizonTs = +process.env.HORIZON_TS;
if (process.env.QPITERS) SOLVER.qpIters = +process.env.QPITERS;

// THE SCAN THE LADDER HAS TO FIT, when one is stated. `BUDGET=mac,bytes` turns it on; unset,
// nothing is enforced and every number in this file is what it always was. It exists because
// the barrel deployed 1.04x for 21,830 MAC/cycle and 256.7 kB — an improvement the machine
// measured honestly and no PLC would accept — and nothing in the ladder priced it.
const BUDGET = process.env.BUDGET
  ? { mac: +process.env.BUDGET.split(',')[0], bytes: +process.env.BUDGET.split(',')[1] }
  : null;

/** Print the active overrides at the caller's chosen point in its own output. */
function announce() {
  if (Object.keys(SOLVER).length) console.log(`  solver budget override: ${JSON.stringify(SOLVER)}`);
  if (BUDGET) console.log(`  scan budget: ${BUDGET.mac.toLocaleString()} MAC/cycle, `
    + `${(BUDGET.bytes / 1024).toFixed(0)} kB`);
}

/**
 * One plant's ladder. `spec` supplies everything the machine knows about itself and nothing
 * about the controller.
 */
async function ladder(spec) {
  const { name, channels, uMax, guards, nMeasured, start, N, refAt, fresh, step, floor,
    pilotOpts } = spec;

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
    // PER-PLANT PILOT OPTIONS, WHICH EXIST FOR ONE REASON AND IT IS NOT TUNING. A transport
    // delay is DECLARED BY THE ENGINEER WHO MOUNTED THE INSTRUMENT — a mounting distance over a
    // line speed, geometry rather than a fitted constant — and the probe provably CANNOT recover
    // it, because a dead time and a slow rise move the 90% crossing identically. Without the
    // passthrough this file drove the mill as an undeclared machine while `rollmill.test.mjs`
    // drove the same rig as a declared one, which is exactly the two-copies drift of rule 61 and
    // was written down in `plants.test.mjs` as a known gap rather than left to be found.
    //
    // `pilotOpts` is applied AFTER the shared defaults and BEFORE `SOLVER`, so a plant may state
    // what it knows about itself while the environment override still wins — an env knob that a
    // spec could silently defeat would make the six-plant pass measure the wrong configuration.
    pilot: { nMeasured, start, guards, workspace: () => true, seed: 1, autoRefuse: false,
      ...(pilotOpts || {}), ...SOLVER },
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


export { ladder, announce, SOLVER, BUDGET };
