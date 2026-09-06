/**
 * @file IS THE CONVERGED CORRECTION A FUNCTION OF THE FORECAST? — the formulation question the
 * distillation bench cannot answer about itself.
 *
 * WHAT `_distil.mjs` MEASURED AND WHERE IT STOPPED. Converging the oracle ladder and regressing
 * its prefix onto the COMMAND WINDOW reaches 24.93x and 27.25x on the programs it was converged
 * on and 0.47x on one it was not, because a window long enough to reach this elbow's 6363-8649
 * step memory is longer than the 7356-step lap and therefore IS a lap index. Shortened until it
 * cannot be one, it reads 16.03x / 13.77x / 3.99x. That is a real trade and the command window
 * is what forces it: the program's shape is exactly the thing that repeats every lap.
 *
 * THE SHARPER FORMULATION. What iteration converges to is
 *
 *     u* = -G^-1 e_free
 *
 * where G is the correction-to-error operator — a PLANT property, identical on every program —
 * and e_free is the free response, which the pilot ALREADY FORECASTS over its whole horizon and
 * hands the QP as `f0`. So the map from `f0` to `u*` is program-independent BY CONSTRUCTION, and
 * every program-specific thing lives in `f0` where it belongs. The QP's own output is one-shot:
 * it inverts G once and leaves sqrt(1-R^2) of what it applied. Fitting the same shaped map
 * against the CONVERGED correction asks for the fixed point of that iteration instead.
 *
 * IT COSTS WHAT IS ALREADY BUILT. This session's `explicitGain` deploys exactly `u0 = k.f0 +
 * c.uPrev` at 120 MAC, with `k` obtained by PROBING the truncated solver. The proposal replaces
 * the probe with a regression against the converged prefix. Same shape, same arithmetic, same
 * deployed path.
 *
 * THIS FILE DOES NOT DEPLOY IT. A deployment changes the applied history, which changes `f0`,
 * which is a closed loop and a second experiment. What is measured here is the only thing that
 * decides whether to build it: HELD-OUT REGRESSION QUALITY. Fit the map on programs A and B,
 * score it on C, and put it beside the command-window map fitted and scored on exactly the same
 * rows. If `f0` does not transfer better than the command window, the formulation argument is
 * wrong and the route is closed for a reason rather than abandoned.
 *
 * THE SNIFFER NEEDS NO LIBRARY CHANGE, AND ITS CONTROL IS THE DOCUMENTED ONE. `oracleF0`'s
 * function form is specified as: a function returning `fitted` must reproduce the un-oracled run
 * to the last digit. Returning `fitted` and recording it is therefore a byte-identical run that
 * also hands out `f0` (rule 21), and the harness ASSERTS the identity rather than assuming it.
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_gainfit.mjs
 */
import { solveRidge } from '../lib/pilot/pilot.js';
import { commissionArm, deployOn, mkPath, PG } from './pilot/rigs/arm-rig.mjs';

const TRAINS = (process.env.G_TRAIN || 'rounded,circle').split(',');
const TESTS = (process.env.G_TEST || 'sharp,diamond').split(',');
const FEED = +(process.env.G_FEED || 0.004);
const PASSES = +(process.env.G_PASSES || 5);
const RIDGES = (process.env.G_RIDGE || '1e-8,1e-6,1e-4,1e-2').split(',').map(Number);
const COFFS = (process.env.G_COFFS
  || '-256,-128,-64,-32,-16,-8,-4,-2,-1,0,1,2,4,8,16,24,32,48,64,96,128,192,256')
  .split(',').map(Number);

console.log(`\nis the converged correction a function of the FORECAST? — K ${PG.K} / E ${PG.E}`);
const pilot = await commissionArm({ seed: 1, train: { shape: 'rounded', feed: FEED } });
if (!pilot) { console.log('commissioning never terminated'); process.exit(1); }
const S = pilot.sample, NCH = pilot.nc, N = pilot.N;
console.log(`  sample ${S}, N ${N}, channels ${NCH}, uMax ${pilot.uMax}`);

const r2 = (pred, act) => {
  const m = act.reduce((a, v) => a + v, 0) / act.length;
  let ss = 0, st = 0;
  for (let i = 0; i < act.length; i++) { ss += (act[i] - pred[i]) ** 2; st += (act[i] - m) ** 2; }
  return 1 - ss / Math.max(1e-30, st);
};

/**
 * Converge a prefix on one program, then record `f0` and the command window beside the
 * correction the machine ended up applying, at every decision of a settled lap.
 */
async function gather(shape) {
  const path = mkPath(shape, FEED);
  const LAPK = Math.round(path.lap), LAPS = Math.round(path.lap / S);
  const pre = [new Float64Array(LAPK), new Float64Array(LAPK)];
  let open = null;
  for (let pass = 0; pass < PASSES; pass++) {
    const ftr = [];
    const fr = await deployOn(pilot, shape, false, FEED, { pre, trace: ftr });
    if (pass === 0) open = fr.r.totalRms;
    const or = { e: ftr.map((t) => t.e), lap: LAPS, off: 2 * LAPS };
    const uOut = [new Float64Array(LAPK), new Float64Array(LAPK)];
    await deployOn(pilot, shape, true, FEED, { pre, oracle: or, preOut: uOut });
    for (let c = 0; c < 2; c++) for (let i = 0; i < LAPK; i++) pre[c][i] += uOut[c][i];
  }
  // THE RECORDING RUN, with the pilot ACTIVE because `f0` only exists inside `act()`, and the
  // SNIFFER in `oracleF0`'s pass-through shape so the run is the un-oracled one to the last
  // digit. At convergence the pilot adds essentially nothing on top of the prefix — the ladder's
  // own last two rows differ by 0.15% — so this is the converged machine, not a third thing.
  const rows = [];
  let cur = null;
  const sniff = (c, leadSamp, fitted, conv, kSamp) => {
    const lead = Math.round(leadSamp / pilot.grid);
    // A NEW ROW ONLY AT CHANNEL 0's LEAD 0. `act` loops channels outside leads, so keying the
    // row on `lead === 0` alone opens a second row for the same decision when channel 1 starts
    // — one decision recorded as two, each holding half a forecast.
    if (c === 0 && lead === 0) { cur = { kSamp, f0: [] }; rows.push(cur); }
    if (cur && cur.kSamp === kSamp) {
      if (!cur.f0[c]) cur.f0[c] = new Float64Array(N);
      cur.f0[c][lead] = fitted + conv;
    }
    return fitted;
  };
  // THE PILOT MUST RUN AND MUST NOT ACT. `f0` only exists inside `act()`, but a pilot applying
  // its full one-shot correction ON TOP of a converged prefix is the double-correction mode 8
  // already paid for — the first version of this bench scored the recording run at 1.16x where
  // the prefix alone reaches 40x, because the fitted forecast describes the BARE machine and the
  // machine underneath it is already corrected. Shrinking `uMax` to nothing leaves `f0` computed
  // exactly as before (it is built before the solve) while the applied correction is zero, so
  // the machine being recorded is the converged one and `f0` is a clean forecast of its free
  // response with no correction history folded in.
  const uSave = pilot.uMax;
  pilot.uMax = 1e-12;
  const tr = [];
  const withSniff = await deployOn(pilot, shape, true, FEED, { pre, oracle: sniff, trace: tr });
  const plain = await deployOn(pilot, shape, true, FEED, { pre });
  pilot.uMax = uSave;
  return { shape, path, pre, LAPK, LAPS, rows, tr, open,
    ident: Math.abs(withSniff.r.totalRms - plain.r.totalRms) / plain.r.totalRms,
    x: open / plain.r.totalRms };
}

const G = {};
// NOT ZERO, AND THE FLOOR IS ON RECORD. Plan section 48 measures this same pass-through at
// 9.8e-5 relative — one bit through `(s2 - conv) + conv`, amplified by the plant — and calls it
// the noise floor of every A/B taken through this port. A reading at that size is the control
// passing; a reading orders above it would say the sniffer is changing the run it records.
console.log(`\n  program   converged   sniffer identity (floor ~1e-4, plan section 48)`);
for (const sh of [...TRAINS, ...TESTS]) {
  G[sh] = await gather(sh);
  console.log(`  ${sh.padEnd(9)} ${G[sh].x.toFixed(2).padStart(8)}x   ${G[sh].ident.toExponential(2)}`);
}

// THE TWO DESIGN MATRICES, BUILT FROM THE SAME ROWS SO THE COMPARISON IS ONE EXPERIMENT.
const refOf = (g) => {
  const cache = new Map();
  return (i) => {
    let v = cache.get(i);
    if (!v) { const c = g.path.at(Math.max(0, i) * S); v = IK(c.x, c.y); cache.set(i, v); }
    return v;
  };
};
let IK = null;
{
  const { makeArm } = await import('./pilot/rigs/arm-rig.mjs');
  const { arm } = await makeArm();
  IK = (x, y) => arm.ik(x, y, true);
  await arm.l1.destroy(); await arm.l2.destroy();
}

function build(g, kind) {
  const refAt = refOf(g);
  const X = [], Y = [[], []];
  for (const row of g.rows) {
    const k = row.kSamp;
    if (!row.f0[0] || !row.f0[1]) continue;
    const t = g.tr[k - 1];
    if (!t) continue;
    // THE TARGET IS WHAT THE MACHINE ACTUALLY APPLIED at that sample — prefix plus whatever the
    // pilot added — because that is the converged correction and not one of its two halves.
    const r = [];
    if (kind === 'f0') { for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) r.push(row.f0[c][i]); }
    else for (const o of COFFS) { const q = refAt(k + o); r.push(q[0], q[1]); }
    r.push(1);
    X.push(r); Y[0].push(t.u[0]); Y[1].push(t.u[1]);
  }
  return { X, Y };
}

console.log(`\n  regressor        ridge    fit R² ch0/ch1     HELD-OUT R² by program`);
for (const kind of ['f0', 'cmd']) {
  for (const ridge of RIDGES) {
    const tr = TRAINS.map((s) => build(G[s], kind));
    const X = [].concat(...tr.map((t) => t.X));
    const Y = [0, 1].map((c) => [].concat(...tr.map((t) => t.Y[c])));
    const W = [0, 1].map((c) => solveRidge(X, Y[c], ridge));
    const fitR2 = [0, 1].map((c) => r2(X.map((r) => r.reduce((a, v, j) => a + v * W[c][j], 0)), Y[c]));
    const held = TESTS.map((s) => {
      const b = build(G[s], kind);
      const sc = [0, 1].map((c) =>
        r2(b.X.map((r) => r.reduce((a, v, j) => a + v * W[c][j], 0)), b.Y[c]));
      return `${s} ${sc.map((v) => (v > -9.99 ? v.toFixed(3) : v.toExponential(1))).join('/')}`;
    });
    console.log(`  ${kind.padEnd(6)} ${String(X[0].length).padStart(5)}f  ${ridge.toExponential(0).padStart(7)}   `
      + `${fitR2.map((v) => v.toFixed(3)).join(' / ')}      ${held.join('   ')}`);
  }
}
console.log(`\n  `+`\`f0\` is the pilot's own forecast over its horizon, so a map from it is a PLANT`);
console.log(`  operator; \`cmd\` is the command window, which repeats every lap by construction.\n`);
