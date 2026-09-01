/**
 * @file AXIS TRIAGE BY SELF-FIT CEILING — which scheduling variable carries information?
 *
 * The two-regime router schedules on commanded-acceleration SEVERITY and hit a wall at
 * geometry: five fit-source configurations show monotone damage from corner-geometry
 * diversity, the signature of a missing scheduling variable being averaged over. Before
 * building any new axis agnostically (probe coverage, knots, runtime), this measures each
 * candidate's INFORMATION CONTENT the cheap way: split the SELF-fitted corner bank — the
 * 3.27x ceiling — by the candidate, on the square's own record, and score held out across
 * feedrates. An axis that does not lift the self-fit carries nothing and dies here.
 *
 * THE CAPACITY CONTROL IS THE POINT (rule 20). Splitting halves the rows per bank, so every
 * candidate is judged against a RANDOM split of the same rows into the same bank count —
 * a variable only wins by ORGANISING the rows, never by there being two banks.
 *
 * Candidates, every one computable from the COMMAND ahead of time (the router's contract):
 *   speed  — max-channel |Δcmd| at the predicted sample, split at the corner rows' median
 *   dir    — at the governing spike, sign(Δ²ch0 · Δ²ch1): do the joints turn together or
 *            against each other
 *   share  — |Δ²ch0| / (|Δ²ch0| + |Δ²ch1|) at the governing spike: which joint carries the
 *            turn, split at half
 *
 * Run: node test/pilot/triage.mjs
 */
import { solveRidge, Pilot } from '../../lib/pilot/pilot.js';
import { PG, commissionArm, recordOpenLoop } from './rigs/arm-rig.mjs';

const pilot = await commissionArm({ seed: 1 });
if (!pilot || !pilot.verdict.deploy) { console.log('commissioning failed'); process.exit(1); }
const st = pilot.status();
console.log('\npilot: axis triage by self-fit ceiling on the sharp square');
console.log(`  arm E ${PG.E} / K ${PG.K}; fit @0.004+0.008, held out @0.0055; corner rows only`);

const FIT = [await recordOpenLoop(pilot, 'sharp', 0.004), await recordOpenLoop(pilot, 'sharp', 0.008)];
const TEST = [await recordOpenLoop(pilot, 'sharp', 0.0055)];
const aFull = 6 * 4e-6 * pilot.sample * pilot.sample;

/** Per-sample regime info: peak-hold level, and the governing spike's per-channel Δ². */
function regimeInfo(rec, reach) {
  const n = rec.cmd.length, nc = rec.cmd[0].length;
  const out = { m: new Float64Array(n), v: new Float64Array(n),
    d20: new Float64Array(n), d21: new Float64Array(n) };
  let m = 0, g0 = 0, g1 = 0;
  for (let k = 0; k < n; k++) {
    let a = 0, sd0 = 0, sd1 = 0, v = 0;
    for (let c = 0; c < nc; c++) {
      const p0 = rec.cmd[k][c], pm = rec.cmd[Math.max(0, k - 1)][c],
        pp = rec.cmd[Math.min(n - 1, k + 1)][c];
      const d2 = pp - 2 * p0 + pm;
      if (Math.abs(d2) > a) a = Math.abs(d2);
      if (c === 0) sd0 = d2; else sd1 = d2;
      const d1 = Math.abs(p0 - pm);
      if (d1 > v) v = d1;
    }
    const mag = a / aFull;
    const decayed = m - 1 / reach;
    // The governing spike is the one the peak-hold is riding: refresh the stored Δ²s only
    // when a new spike takes over.
    if (mag >= decayed) { m = mag; g0 = sd0; g1 = sd1; } else { m = decayed; }
    out.m[k] = Math.min(1, Math.max(0, (m - 0.15) / 1.85));
    out.v[k] = v;
    out.d20[k] = g0; out.d21[k] = g1;
  }
  return out;
}

/** Corner rows of a record for one channel and lead, with the split variables attached. */
function rows(rec, c, li) {
  const ro = pilot.readouts[c];
  const L = ro.leads[Math.min(li, ro.leads.length - 1)];
  const reach = Math.ceil(1.7 * (ro.mLag - 1) * ro.stride);
  const info = regimeInfo(rec, reach);
  const back = Math.max((ro.mLag - 1) * ro.stride, (ro.fLag - 1) * ro.stride - L);
  const saved = pilot._rec;
  pilot._rec = { x: rec.x, cmd: rec.cmd, u: [], e: rec.e };
  const out = [];
  try {
    for (let k = Math.max(back, rec.lap); k < rec.e.length - L - 1; k++) {
      const t = Math.min(k + L, rec.cmd.length - 1);
      if (info.m[t] < 0.05) continue;
      const a0 = Math.abs(info.d20[t]), a1 = Math.abs(info.d21[t]);
      out.push({ x: pilot._row(c, k, L, ro.stride, ro.poly, ro.mLag, ro.fLag, ro.sched),
        y: rec.e[k + L][c], v: info.v[t],
        dir: Math.sign(info.d20[t] * info.d21[t]) >= 0 ? 1 : 0,
        share: a0 + a1 > 0 ? (a0 / (a0 + a1) >= 0.5 ? 1 : 0) : 0,
        rnd: k % 2 });
    }
  } finally { pilot._rec = saved; }
  return out;
}

function r2Of(test, pred) {
  let sse = 0, sy = 0, sy2 = 0;
  for (let i = 0; i < test.length; i++) {
    const d = test[i].y - pred[i];
    sse += d * d; sy += test[i].y; sy2 += test[i].y * test[i].y;
  }
  const n = test.length, varY = sy2 / n - (sy / n) ** 2;
  return 1 - (sse / n) / Math.max(varY, 1e-300);
}

console.log(`\n  ${'axis'.padEnd(10)} ${'ch'.padStart(2)} ${'lead0'.padStart(8)} ${'mid'.padStart(8)}`
  + `   (bucket sizes fit/test at lead 0)`);
for (let c = 0; c < 2; c++) {
  const ro = pilot.readouts[c];
  const results = {};
  for (const [li, lname] of [[0, 'lead0'], [Math.floor(pilot.N / 2), 'mid']]) {
    const fitRows = FIT.flatMap((r) => rows(r, c, li));
    const testRows = TEST.flatMap((r) => rows(r, c, li));
    // The speed threshold comes from the fit rows themselves (rule 32).
    const vs = fitRows.map((r) => r.v).sort((a, b) => a - b);
    const vMed = vs[Math.floor(vs.length / 2)];
    for (const r of fitRows) r.speed = r.v >= vMed ? 1 : 0;
    for (const r of testRows) r.speed = r.v >= vMed ? 1 : 0;
    const cands = { none: () => 0, random: (r) => r.rnd, speed: (r) => r.speed,
      dir: (r) => r.dir, share: (r) => r.share };
    for (const [name, f] of Object.entries(cands)) {
      const banks = {};
      for (const b of [0, 1]) {
        const X = fitRows.filter((r) => f(r) === b).map((r) => r.x);
        const y = fitRows.filter((r) => f(r) === b).map((r) => r.y);
        banks[b] = X.length > 4 * ro.w[0].length ? solveRidge(X, y, ro.ridge) : null;
      }
      const pred = testRows.map((r) => {
        const w = banks[f(r)] || banks[0] || banks[1];
        let p = 0;
        for (let i = 0; i < w.length; i++) p += w[i] * r.x[i];
        return p;
      });
      results[name] = results[name] || {};
      results[name][lname] = r2Of(testRows, pred);
      if (name !== 'none' && li === 0) {
        results[name].sizes = `${fitRows.filter((r) => f(r) === 1).length}/${fitRows.length}`;
      }
    }
  }
  for (const name of ['none', 'random', 'speed', 'dir', 'share']) {
    console.log(`  ${name.padEnd(10)} ${String(c).padStart(2)}`
      + ` ${results[name].lead0.toFixed(3).padStart(8)} ${results[name].mid.toFixed(3).padStart(8)}`
      + `${results[name].sizes ? `   bucket1 ${results[name].sizes}` : '   (unsplit control)'}`);
  }
}
console.log('\n  READ: an axis matters if it beats BOTH the unsplit control and the random');
console.log('  split (the capacity control). Random beating none would say the corner regime');
console.log('  simply wants more capacity, and the axis choice is secondary.');
