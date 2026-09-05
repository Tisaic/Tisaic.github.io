/**
 * @file HOW MANY STATES DOES THIS MACHINE NEED? — the measurement that decides whether a
 * state-addressed controller can carry what a lag window cannot.
 *
 * WHERE THIS COMES FROM. The compiled twin reaches 123x and the pilot 2.87x on one denominator,
 * but the twin's deployed artifact is indexed by POSITION IN A LAP, so it is a path table and
 * the retirement excludes it. What the twin does prove is that this plant is predictable from
 * plant state far beyond what the pilot achieves — the physics is not the limit, the forecast is.
 *
 * AND THE REASON THE FORECAST FAILS IS ON RECORD AS A STRUCTURAL ONE: the elbow's measured
 * memory is 6363-8649 steps, LONGER than a program lap, so windowed features truncate it and
 * closed paths alias it. No basis fixes a window that cannot reach the mode (rule 37). A
 * simulation propagates state instead — which is why the twin works — but running the twin
 * online is ~54k float ops per step, 5.4x slower than the 1 kHz machine, so it does not fit the
 * scan even as an option.
 *
 * A REDUCED-ORDER STATE SPACE IS THE THING THAT DOES BOTH: it propagates state, so its memory is
 * unbounded and needs no window, and it costs n^2 per step rather than a 352-feature bank. The
 * whole route turns on ONE number — the order n this machine actually needs — and that number is
 * measurable without building any of it.
 *
 * THE MEASUREMENT, and it needs no SVD. An nth-order LTI system's impulse response satisfies an
 * nth-order linear recurrence EXACTLY: h[k] = sum_i a_i h[k-i]. So fit that recurrence by the
 * ridge solver already in this library and read the residual against n. A 2x2 plant's four
 * sequences share one characteristic polynomial, so they are stacked and fitted TOGETHER — one
 * set of poles, which is what a state-space of the whole plant means.
 *
 * WHAT WOULD KILL THE ROUTE: an order that does not converge by a few tens of states. Then the
 * response is not low-order, a small state space cannot carry it, and the only things that can
 * are the lattice twin (too expensive) or a table (excluded).
 *
 * Run: ARM_K=0.25 ARM_E=0.03 node test/_order.mjs
 */
import { solveRidge } from '../lib/pilot/pilot.js';
import { twinResponse } from '../lib/flexisim/twin.js';
import { PG, makeArm, mkPath, homeArm } from './pilot/rigs/arm-rig.mjs';

const SS = 9;
const DEC = +(process.env.DEC || 4);      // decimation on top of the sample cadence
const ORDERS = (process.env.ORDERS || '2,4,6,8,12,16,24,32,48').split(',').map(Number);
const path = mkPath('rounded', 4e-3);
const buildArm = async (p) => makeArm(p || { K: PG.K, E: PG.E });
const destroyArm = async (m) => { await m.arm.l1.destroy(); await m.arm.l2.destroy(); };

console.log(`\nhow many states does this machine need — K ${PG.K} / E ${PG.E}\n`);
console.log(`  measuring the 2x2 step response…`);
const H = await twinResponse({ buildArm, destroyArm, path, sample: SS });

// STEP -> IMPULSE. `twinResponse` holds the reference offset, so what it returns is a STEP
// response; the recurrence above is a statement about the IMPULSE response and differencing is
// what turns one into the other. Getting this backwards fits the integrator's own pole and
// reports an order one too high, with a residual that still looks convincing.
const seqs = [];
for (let ch = 0; ch < 2; ch++) {
  for (let oc = 0; oc < 2; oc++) {
    const s = H[ch];
    const h = [];
    for (let k = DEC; k < s.length; k += DEC) h.push(s[k][oc] - s[k - DEC][oc]);
    seqs.push(h);
  }
}
const L = Math.min(...seqs.map((s) => s.length));
const stepsPerSample = SS * DEC;
console.log(`  ${seqs.length} sequences of ${L} samples at ${stepsPerSample} solver steps each `
  + `— a reach of ${L * stepsPerSample} steps, against the elbow's measured 6363-8649\n`);

// The scale each sequence is judged on: its own rms, so a small cross channel is not drowned
// by a large diagonal one (rule 32 — a threshold must be scaled to the quantity it acts on).
const rms = seqs.map((s) => Math.sqrt(s.reduce((a, v) => a + v * v, 0) / s.length));
console.log(`  order   residual / response rms      per-sequence`);
for (const n of ORDERS) {
  if (n >= L - 2) continue;
  const X = [], y = [];
  for (const s of seqs) {
    for (let k = n; k < s.length; k++) {
      const row = [];
      for (let i = 1; i <= n; i++) row.push(s[k - i]);
      X.push(row); y.push(s[k]);
    }
  }
  // A RIDGE THAT IS ESSENTIALLY ZERO, because this is an order measurement and not a fit to
  // deploy: regularisation here would buy a smaller residual at a higher apparent order.
  const a = solveRidge(X, y, 1e-12);
  const per = seqs.map((s, si) => {
    let sd = 0, m = 0;
    for (let k = n; k < s.length; k++) {
      let p = 0;
      for (let i = 1; i <= n; i++) p += a[i - 1] * s[k - i];
      sd += (s[k] - p) ** 2; m++;
    }
    return Math.sqrt(sd / Math.max(1, m)) / Math.max(1e-30, rms[si]);
  });
  const worst = Math.max(...per);
  console.log(`  ${String(n).padStart(5)}   ${worst.toExponential(3).padStart(10)}`
    + `                ${per.map((v) => v.toExponential(1)).join('  ')}`);
}
console.log(`\n  the cost of order n, deployed: n^2 per step to propagate, plus N*n*nc for the`);
console.log(`  horizon's free response — against the pilot's 352-feature bank at 12,658 MAC.`);
for (const n of [8, 16, 24, 32]) {
  console.log(`    n ${String(n).padStart(2)}: ${n * n} + ${59 * n * 2} = ${n * n + 59 * n * 2} MAC/cycle`);
}
console.log(`\n  an order that does not converge by a few tens of states kills the route: the`);
console.log(`  response would not be low-order, and only the lattice twin (too expensive) or a`);
console.log(`  table (excluded) could carry it.\n`);
