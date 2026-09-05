/**
 * @file PLAN 6d / TARGET 8 — NORM-OPTIMAL ILC AGAINST THIS PROJECT'S RUNG, ON A REAL AXIS.
 *
 * Both methods get the SAME identified operator (`hff`'s, via `exportOperator`), the same
 * machine, the same authority cap and the same laps. One thing differs: the update law.
 *
 *   hff    a damped Newton step against a frozen operator, with confidence and reach shrinkage
 *   NOILC  Δu = (G^H Q G + R)^{-1} G^H Q e, straight out of the literature, nothing tuned
 *
 * AND THE COLUMN THAT MATTERS IS NOT THE HOME PROGRAM. Both are lap-indexed memories and both
 * should converge on the trajectory they learn. The question this project keeps returning to is
 * what happens on one the machine has NEVER RUN — where a phase-indexed table measured 0.55x on
 * this very axis, worse than doing nothing, while the model-based rungs transferred. A rival
 * that wins at home and cannot leave it is the object the retirement removed, and demonstrating
 * that against a properly implemented literature method is worth more than the home number.
 *
 * Run: SUITE=full node test/pilot/noilcbench.mjs
 */
import { P, PR, makeMachine } from './emps-rig.mjs';
import { HarmonicFF } from '../../lib/pilot/hff.js';
import { runNoilc } from './noilc.mjs';

const UMAX = 2e-3;

/** The machine, driven for `laps` repetitions of its own program. `corr.at(k)` or null. */
function drive(corr, laps = 8) {
  const m = makeMachine(PR.q[0], 0);
  let s = 0, n = 0; const e = new Float64Array(P);
  for (let k = 0; k < laps * P; k++) {
    const kk = ((k - 1) % P + P) % P;
    m.step(PR.q[kk] + (corr ? corr.at(kk)[0] : 0));
    const ee = m.q - PR.q[k % P];
    if (k >= (laps - 1) * P) e[k % P] = ee;
    if (k >= (laps - 4) * P) { s += ee * ee; n++; }
  }
  return { score: 1000 * Math.sqrt(s / n), err: [e] };
}

/** The held-out trajectory: two incommensurate tones, which this axis has never run. */
function twoTone(n) {
  const q = new Float64Array(n);
  const mid = 0.125, A1 = 0.055, A2 = 0.022, w1 = 2 * Math.PI * 0.21, w2 = 2 * Math.PI * 0.53;
  for (let k = 0; k < n; k++) {
    const t = k * 1e-3;
    q[k] = mid + A1 * Math.sin(w1 * t) + A2 * Math.sin(w2 * t);
  }
  return q;
}
const N2 = 12000, TQ = twoTone(N2);

/** Score a lap-indexed table on the held-out trajectory — the transfer column. */
function transfer(corr) {
  const m = makeMachine(TQ[0], 0);
  let s = 0, n = 0;
  for (let k = 0; k < N2; k++) {
    const kk = Math.max(0, k - 1);
    m.step(TQ[kk] + (corr ? corr.at(kk % P)[0] : 0));
    if (k > 2000) { const e = m.q - TQ[k]; s += e * e; n++; }
  }
  return 1000 * Math.sqrt(s / n);
}

console.log('\nnorm-optimal ILC against the harmonic rung — same operator, same machine\n');

// ---- identify ONCE, with this project's own rung, and let it converge as it normally would.
const hff = new HarmonicFF({ lap: P, channels: 1, uMax: UMAX });
const t0 = Date.now();
const r = await hff.commission(async (c) => drive(c));
console.log(`  hff    ${r.base.toExponential(4)} -> ${r.best.toExponential(4)} mm`
  + `  ${(r.base / r.best).toFixed(1)}x   ${r.laps} laps   ${((Date.now() - t0) / 1000).toFixed(0)}s`);

// ---- the rival, from that same operator, over the same order of laps.
const LAPS = +(process.env.NOILC_LAPS || 24);
const q = +(process.env.NOILC_Q || 1), rr = +(process.env.NOILC_R || 1e-4);
const t1 = Date.now();
const n = await runNoilc(hff, async (c) => drive(c), { laps: LAPS, q, r: rr });
console.log(`  NOILC  ${n.base.toExponential(4)} -> ${n.best.toExponential(4)} mm`
  + `  ${(n.base / n.best).toFixed(1)}x   ${LAPS} laps   Q ${q} R ${rr}`
  + `   ${((Date.now() - t1) / 1000).toFixed(0)}s`);
console.log(`         last lap ${n.last.toExponential(4)} mm`
  + `${n.last > n.best * 1.05 ? '  — WALKED AWAY from its own best' : ''}`);
console.log(`         trace ${n.trace.map((x) => x.toExponential(2)).join(' ')}`);

// ---- THE COLUMN THAT DECIDES IT.
const openT = transfer(null), hffT = transfer(hff), noT = transfer(n.corr);
console.log(`\n  on a two-tone sine the axis has NEVER run:`);
console.log(`    open loop        ${openT.toExponential(4)} mm`);
console.log(`    hff's table      ${hffT.toExponential(4)} mm   ${(openT / hffT).toFixed(2)}x`);
console.log(`    NOILC's table    ${noT.toExponential(4)} mm   ${(openT / noT).toFixed(2)}x`);
console.log(`\n  both are lap-indexed memories, so both are expected to fail here; what the`);
console.log(`  comparison establishes is that a PROPERLY IMPLEMENTED literature method fails`);
console.log(`  the same way, which is a statement about the class rather than about our code.\n`);
