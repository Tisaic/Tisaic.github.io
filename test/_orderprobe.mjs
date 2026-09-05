/**
 * @file THE ORDER, FROM THE PILOT'S OWN PROBE — the agnostic data source, not the twin's.
 *
 * WHY THIS FILE EXISTS RATHER THAN `_order.mjs` STANDING. That measurement fitted the recurrence
 * to `twinResponse`, a 12,000-step dedicated probe of a machine whose parameters were already
 * identified — and identifying them means searching a grid over GEARBOX STIFFNESS and LINK
 * MODULUS. That is plant structure the engineer has to know, name and bound, and the standing
 * constraint is that the engineer has ZERO plant-identification knowledge. So the twin route is
 * disqualified whatever it delivers, and the order number has to be re-taken from a source that
 * asks nothing of the engineer.
 *
 * `hs[c].resp` IS THAT SOURCE. The pilot already probes each channel's step response during its
 * own commissioning, on all six plants, knowing nothing about any of them — it steps a channel
 * and records what comes back. If the order converges on THAT record, the route needs no plant
 * knowledge at all and the machinery to collect it is already deployed everywhere.
 *
 * IT IS ALSO A HARDER TEST AND THAT IS THE POINT. The pilot's probe is shorter, noisier, taken
 * at whatever pose commissioning starts from, and sampled on the pilot's own grid rather than a
 * cadence chosen for this. An order that converges on the twin's clean 12,000-step response and
 * NOT on this one means the route needs a dedicated probe, which is a cost the engineer pays and
 * a claim that has to be made honestly rather than absorbed.
 *
 * WHAT WOULD KILL IT: no convergence by a few tens of states, or a residual floor set by the
 * probe's own noise rather than by the order — which is why the noise the pilot MEASURED on that
 * same probe is printed beside the residuals. A fit that has reached the noise has learned
 * everything the record contains and a higher order is fitting the noise (rules 17, 25).
 *
 * Run: ARM_K=0.25 ARM_E=0.03 SUITE=full node test/_orderprobe.mjs
 */
import { solveRidge } from '../lib/pilot/pilot.js';
import { commissionArm } from './pilot/rigs/arm-rig.mjs';
import { PG } from './pilot/rigs/arm-rig.mjs';

const ORDERS = (process.env.ORDERS || '2,4,6,8,12,16,24,32,48').split(',').map(Number);
const SHAPE = process.env.SHAPE || 'rounded';
const FEED = +(process.env.FEED || 4e-3);

console.log(`\nthe order from the PILOT's own probe — K ${PG.K} / E ${PG.E}\n`);
const p = await commissionArm({ seed: 1, uCap: 0.6, train: { shape: SHAPE, feed: FEED },
  extra: { mimo: true } });

// EVERY SEQUENCE THE PROBE PRODUCED: each channel's own response and each cross response. A 2x2
// plant's four sequences share one characteristic polynomial, so they are fitted TOGETHER — one
// set of poles is what a state space OF THE PLANT means, and fitting them separately would
// measure four unrelated orders and report the largest.
const seqs = [], labels = [];
p.hs.forEach((h, c) => {
  seqs.push(Array.from(h.resp)); labels.push(`${c}->${c}`);
  if (h.crossResp) h.crossResp.forEach((r, j) => {
    if (r && r.length) { seqs.push(Array.from(r)); labels.push(`${c}->${j}`); }
  });
});
// STEP -> IMPULSE, the same differencing `_order.mjs` needed: the recurrence is a statement
// about the impulse response, and fitting the step response fits the integrator's pole too and
// reports an order one too high with a residual that still looks convincing.
const imp = seqs.map((s) => s.slice(1).map((v, i) => v - s[i]));
const L = Math.min(...imp.map((s) => s.length));
const noise = p.hs.map((h) => h.noise);
console.log(`  ${imp.length} sequences (${labels.join(', ')}), ${L} samples, `
  + `sample ${p.sample} steps — a reach of ${L * p.sample} steps`);
console.log(`  the probe's own measured noise: ${noise.map((n) => n.toExponential(2)).join(' / ')}`);
const rms = imp.map((s) => Math.sqrt(s.reduce((a, v) => a + v * v, 0) / s.length));
console.log(`  response rms: ${rms.map((v) => v.toExponential(2)).join(' / ')}\n`);
console.log(`  order   worst residual / rms      per-sequence`);
for (const n of ORDERS) {
  if (n >= L - 2) continue;
  const X = [], y = [];
  for (const s of imp) {
    for (let k = n; k < s.length; k++) {
      const row = [];
      for (let i = 1; i <= n; i++) row.push(s[k - i]);
      X.push(row); y.push(s[k]);
    }
  }
  const a = solveRidge(X, y, 1e-12);
  const per = imp.map((s, si) => {
    let sd = 0, m = 0;
    for (let k = n; k < s.length; k++) {
      let pr = 0;
      for (let i = 1; i <= n; i++) pr += a[i - 1] * s[k - i];
      sd += (s[k] - pr) ** 2; m++;
    }
    return Math.sqrt(sd / Math.max(1, m)) / Math.max(1e-30, rms[si]);
  });
  console.log(`  ${String(n).padStart(5)}   ${Math.max(...per).toExponential(3).padStart(10)}`
    + `            ${per.map((v) => v.toExponential(1)).join('  ')}`);
}
console.log(`\n  a residual that has reached the probe's own noise has learned everything the`);
console.log(`  record contains; past that, order is fitting noise (rules 17, 25).\n`);
